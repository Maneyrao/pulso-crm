import { AsyncLocalStorage } from 'node:async_hooks';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';

/**
 * Contexto de tenant (ADR-008).
 *
 * El gymId sale SIEMPRE de la sesión validada. Nunca de un header, del body ni
 * de la query. Ese fue el patrón que la auditoría encontró en el producto
 * analizado (`x-idcliente` enviado por el cliente) y es exactamente lo que no
 * queremos heredar.
 */
export interface TenantContext {
  gymId: string;
  userId: string;
  /** Sedes a las que el usuario tiene acceso. */
  branchIds: string[];
  /** Sede activa en esta sesión. */
  activeBranchId: string | null;
  permissions: ReadonlySet<string>;
  features: ReadonlySet<string>;
  requestId: string;
}

/**
 * El store guarda un contenedor mutable, no el contexto directamente.
 *
 * Motivo: el middleware abre el AsyncLocalStorage envolviendo `next()`, con lo
 * cual el contexto vive durante todo el request. Pero en ese momento todavía no
 * se validó el token — eso pasa después, en el guard. El guard completa este
 * mismo contenedor. Si el guard abriera su propio `run()`, el contexto moriría
 * al retornar y el handler quedaría sin tenant.
 */
interface Holder {
  ctx: TenantContext | null;
}

const storage = new AsyncLocalStorage<Holder>();

export const TenantContextStore = {
  /** Lo llama el middleware, una vez por request. */
  open<T>(fn: () => T): T {
    return storage.run({ ctx: null }, fn);
  },

  /** Lo llama el guard tras validar el token. */
  set(ctx: TenantContext): void {
    const holder = storage.getStore();
    if (!holder) {
      throw new Error(
        'Se intentó fijar el contexto de tenant fuera de un request. ' +
          'Falta registrar TenantContextMiddleware.',
      );
    }
    holder.ctx = ctx;
  },

  get(): TenantContext | undefined {
    return storage.getStore()?.ctx ?? undefined;
  },

  getGymId(): string | null {
    return storage.getStore()?.ctx?.gymId ?? null;
  },

  require(): TenantContext {
    const ctx = TenantContextStore.get();
    if (!ctx) {
      throw new Error(
        'No hay contexto de tenant. Esta operación tiene que correr dentro de un request autenticado.',
      );
    }
    return ctx;
  },

  /**
   * Valida que la sede pertenezca al usuario y la devuelve.
   * Si no se pasa ninguna, usa la sede activa de la sesión.
   */
  requireBranch(branchId?: string | null): string {
    const ctx = TenantContextStore.require();
    const target = branchId ?? ctx.activeBranchId;
    if (!target) {
      throw AppError.unprocessable(
        ErrorCode.VALIDATION_ERROR,
        'No hay una sede seleccionada para esta operación.',
      );
    }
    if (!ctx.branchIds.includes(target)) {
      // Misma respuesta que "no existe": confirmar que la sede existe en otro
      // gimnasio sería una fuga de información.
      throw AppError.notFound('La sede');
    }
    return target;
  },

  /** Para jobs del worker y seeds, que no tienen request HTTP. */
  runWith<T>(ctx: TenantContext, fn: () => T): T {
    return storage.run({ ctx }, fn);
  },
};
