import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type PrismaService } from '../../infra/prisma/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import { RequestContextStore } from '../logging/logger.js';
import {
  AGENT_ONLY_KEY,
  FEATURE_KEY,
  PERMISSIONS_KEY,
  PUBLIC_KEY,
} from './decorators.js';
import { TenantContextStore, type TenantContext } from './tenant-context.js';
import { ACCESS_COOKIE, type TokenService } from './token.service.js';

/**
 * Guard único que resuelve autenticación, contexto de tenant, permisos y
 * features, en ese orden.
 *
 * Está todo junto a propósito: separado en cuatro guards, Nest no garantiza que
 * el AsyncLocalStorage abierto por uno siga vigente en el siguiente, y el
 * contexto se perdía. Acá el contexto envuelve al resto del request.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const controller = context.getClass();

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [handler, controller]);
    if (isPublic) return true;

    const isAgentOnly = this.reflector.getAllAndOverride<boolean>(AGENT_ONLY_KEY, [
      handler,
      controller,
    ]);
    if (isAgentOnly) {
      // La superficie del agente se autentica con deviceToken, no con cookie.
      // Se implementa en la Etapa 8; hasta entonces no hay rutas con este flag.
      throw AppError.unauthorized(ErrorCode.SESSION_EXPIRED, 'Credencial de dispositivo inválida.');
    }

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) {
      throw AppError.unauthorized(ErrorCode.SESSION_EXPIRED, 'Necesitás iniciar sesión.');
    }

    const claims = await this.tokens.verifyAccessToken(token);
    if (!claims) {
      throw AppError.unauthorized(ErrorCode.SESSION_EXPIRED, 'Tu sesión expiró.');
    }

    const ctx = await this.buildContext(claims.sub, claims.gym, claims.branch);

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      handler,
      controller,
    ]);

    // Un handler sin @Public() ni @RequiresPermission() es un endpoint abierto
    // por descuido. Se rechaza en vez de dejarlo pasar; hay un test que
    // recorre el registro de rutas para que esto no llegue a producción.
    if (required === undefined) {
      throw AppError.forbidden(
        ErrorCode.FORBIDDEN,
        'Este endpoint no declara permisos. Es un error de programación.',
      );
    }

    const feature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [handler, controller]);
    if (feature && !ctx.features.has(feature)) {
      throw AppError.forbidden(
        ErrorCode.FEATURE_NOT_ENABLED,
        'Esta funcionalidad no está incluida en el plan del gimnasio.',
      );
    }

    const missing = required.filter((p) => !ctx.permissions.has(p));
    if (missing.length > 0) {
      throw AppError.forbidden(
        ErrorCode.MISSING_PERMISSION,
        'No tenés permiso para esta acción.',
      );
    }

    // El store ya está abierto por RequestContextMiddleware; acá sólo se
    // completa. De este modo el contexto sigue vivo en el handler y en las
    // consultas de Prisma, cosa que un `run()` dentro del guard no lograría.
    TenantContextStore.set(ctx);
    RequestContextStore.set({
      gymId: ctx.gymId,
      userId: ctx.userId,
      branchId: ctx.activeBranchId ?? undefined,
    });
    return true;
  }

  private extractToken(req: Request): string | null {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const fromCookie = cookies?.[ACCESS_COOKIE];
    if (fromCookie) return fromCookie;

    // Authorization Bearer se acepta sólo para pruebas automatizadas y para el
    // agente local. El navegador usa la cookie httpOnly (ADR-007).
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return null;
  }

  private async buildContext(
    userId: string,
    gymId: string,
    branchFromToken: string | null,
  ): Promise<TenantContext> {
    const db = this.prisma.unscoped('session');
    const user = await db.user.findFirst({
      where: { id: userId, gymId, deletedAt: null },
      include: {
        gym: { include: { saasPlan: true, featureOverrides: true } },
        roleAssignments: { include: { role: true } },
        branchAccess: true,
      },
    });

    if (!user) {
      throw AppError.unauthorized(ErrorCode.SESSION_EXPIRED, 'Tu sesión ya no es válida.');
    }
    if (user.status !== 'ACTIVE') {
      throw AppError.unauthorized(ErrorCode.ACCOUNT_INACTIVE, 'Tu usuario está desactivado.');
    }
    if (user.gym.status !== 'ACTIVE') {
      throw AppError.unauthorized(ErrorCode.GYM_SUSPENDED, 'El gimnasio está suspendido.');
    }

    const branchIds = user.branchAccess.map((a) => a.branchId);
    // Una sede en el token que ya no pertenece al usuario se descarta en vez de
    // aceptarse: el token puede ser anterior a un cambio de permisos.
    const activeBranchId =
      branchFromToken && branchIds.includes(branchFromToken)
        ? branchFromToken
        : (branchIds[0] ?? null);

    const features = new Set(user.gym.saasPlan.features);
    for (const o of user.gym.featureOverrides) {
      if (o.enabled) features.add(o.feature);
      else features.delete(o.feature);
    }

    return {
      gymId: user.gymId,
      userId: user.id,
      branchIds,
      activeBranchId,
      permissions: new Set(user.roleAssignments.flatMap((a) => a.role.permissions)),
      features,
      requestId: RequestContextStore.get()?.requestId ?? 'unknown',
    };
  }
}
