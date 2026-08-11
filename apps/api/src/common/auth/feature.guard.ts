import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
// Import de VALOR (no `type`): dependencia del constructor, resuelta por Nest
// vía metadata de decorador en runtime (detalle en infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { Reflector } from '@nestjs/core';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { RedisService } from '../../infra/redis/redis.service.js';
import { FEATURE_KEYS } from '@pulso/contracts';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import { FEATURE_KEY } from './decorators.js';
import { TenantContextStore } from './tenant-context.js';

/**
 * Cuánto se confía en el valor cacheado antes de volver a consultar la base.
 *
 * ADR-022 pide invalidación por evento (cuando cambia el plan o un
 * `GymFeatureOverride`), pero todavía no existe un endpoint que edite esos
 * datos (fuera de alcance de T-2.6/T-2.8). El TTL corto es la red de
 * seguridad hasta que ese endpoint exista y llame a `invalidate()`.
 */
const FEATURE_CACHE_TTL_SECONDS = 300;

function cacheKey(gymId: string, feature: string): string {
  return `feature:${feature}:${gymId}`;
}

/**
 * Guard de features por plan SaaS (ADR-022, T-2.8).
 *
 * Corre DESPUÉS de `AuthGuard` (mismo orden de registro en `APP_GUARD`):
 * necesita `TenantContextStore` ya poblado, que es justamente lo que
 * `AuthGuard` deja armado al devolver `true`. Endpoints sin `@RequiresFeature`
 * pasan directo — la mayoría de las rutas no dependen de ninguna feature.
 *
 * Caché en Redis por gimnasio y feature (`feature:<featureName>:<gymId>`):
 * évita pegarle a la base en cada request de un endpoint gateado. Un miss
 * (Redis caído, o clave vencida) degrada a consultar la base directamente —
 * nunca se abre la puerta "por las dudas" cuando Redis no responde.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const ctx = TenantContextStore.require();
    const enabled = await this.isFeatureEnabled(ctx.gymId, feature);
    if (!enabled) {
      throw AppError.forbidden(
        ErrorCode.FEATURE_NOT_ENABLED,
        'Esta funcionalidad no está incluida en el plan del gimnasio.',
      );
    }
    return true;
  }

  /** Expuesto para tests y para que un futuro endpoint de plan/override lo reutilice. */
  async isFeatureEnabled(gymId: string, feature: string): Promise<boolean> {
    const key = cacheKey(gymId, feature);

    const cached = await this.redis.client.get(key).catch(() => null);
    if (cached === '1' || cached === '0') return cached === '1';

    const enabled = await this.resolveFromDb(gymId, feature);
    await this.redis.client
      .set(key, enabled ? '1' : '0', 'EX', FEATURE_CACHE_TTL_SECONDS)
      .catch(() => undefined);
    return enabled;
  }

  /**
   * Borra el valor cacheado de una o todas las features de un gimnasio.
   *
   * Sin uso todavía (no hay endpoint que edite plan/overrides en este
   * alcance): queda lista para que ese endpoint futuro la llame al guardar,
   * en vez de esperar a que venza el TTL (ADR-022 "invalidación por evento").
   */
  async invalidate(gymId: string, feature?: string): Promise<void> {
    if (feature) {
      await this.redis.client.del(cacheKey(gymId, feature)).catch(() => undefined);
      return;
    }
    await Promise.all(
      FEATURE_KEYS.map((f) => this.redis.client.del(cacheKey(gymId, f)).catch(() => undefined)),
    );
  }

  /**
   * `Gym` es un modelo global (`GLOBAL_MODELS` en tenant-extension.ts): no
   * lleva `gymId` propio, así que la extensión de tenant no lo filtra pase lo
   * que pase. Es seguro consultarlo por `id` con el cliente normal porque
   * `gymId` viene de `TenantContextStore` (ya validado por `AuthGuard`), no
   * de input del cliente.
   *
   * `GymFeatureOverride` sí es tenant-scoped: se pide con una consulta propia
   * (no como `include` anidado del `Gym`) para que pase, sin ambigüedad, por
   * el filtro de tenant de la extensión — un `include` sobre un modelo global
   * no garantiza que la relación anidada dispare el mismo hook.
   */
  private async resolveFromDb(gymId: string, feature: string): Promise<boolean> {
    const [gym, overrides] = await Promise.all([
      this.prisma.client.gym.findUnique({ where: { id: gymId }, include: { saasPlan: true } }),
      this.prisma.client.gymFeatureOverride.findMany({ where: { gymId } }),
    ]);
    if (!gym) return false;

    const enabled = new Set(gym.saasPlan.features);
    for (const override of overrides) {
      if (override.enabled) enabled.add(override.feature);
      else enabled.delete(override.feature);
    }
    return enabled.has(feature);
  }
}
