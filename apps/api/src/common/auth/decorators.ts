import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { TenantContextStore, type TenantContext } from './tenant-context.js';

export const PUBLIC_KEY = 'pulso:public';
export const PERMISSIONS_KEY = 'pulso:permissions';
export const FEATURE_KEY = 'pulso:feature';
export const AGENT_ONLY_KEY = 'pulso:agent-only';

/**
 * Marca un endpoint como accesible sin sesión.
 *
 * Todo handler tiene que declarar `@Public()` o `@RequiresPermission()`.
 * Un test recorre el registro de rutas y falla si alguno no declara nada:
 * un endpoint sin decorador es un endpoint abierto por descuido.
 */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Permisos requeridos. Si se pasan varios, se exigen TODOS. */
export const RequiresPermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Feature del plan SaaS que tiene que estar habilitada (ADR-022). */
export const RequiresFeature = (feature: string) => SetMetadata(FEATURE_KEY, feature);

/** Endpoint de la superficie del agente local: se autentica con deviceToken. */
export const AgentOnly = () => SetMetadata(AGENT_ONLY_KEY, true);

/** Inyecta el contexto de tenant en el handler. */
export const Tenant = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): TenantContext => TenantContextStore.require(),
);

/** Inyecta sólo el usuario actual. */
export const CurrentUser = createParamDecorator((_data: unknown, _ctx: ExecutionContext) => {
  const ctx = TenantContextStore.require();
  return { id: ctx.userId, gymId: ctx.gymId };
});
