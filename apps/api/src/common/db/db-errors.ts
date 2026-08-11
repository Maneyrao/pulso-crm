/**
 * Traducción de errores de base a errores de dominio.
 *
 * Mismo patrón que `modules/members/db-errors.ts`: se detecta acá, en el
 * servicio, y no sólo en el filtro global, porque (1) es más testeable sin
 * levantar HTTP completo y (2) el servicio es dueño de sus propios modos de
 * falla conocidos. Se promueve a `common/` porque tenancy e iam (T-2.6) lo
 * necesitan igual que members y cash ya lo necesitaban antes.
 */

interface DbErrorLike {
  code?: unknown;
  message?: unknown;
  meta?: { target?: unknown };
}

function asDbError(err: unknown): DbErrorLike | null {
  if (!err || typeof err !== 'object') return null;
  return err as DbErrorLike;
}

/** `true` si el error es una violación de unique constraint (P2002) de Prisma. */
export function isUniqueViolation(err: unknown): boolean {
  const e = asDbError(err);
  return !!e && e.code === 'P2002';
}

/** Nombre de la columna/índice involucrado en un P2002, para elegir el mensaje. */
export function uniqueViolationTarget(err: unknown): string {
  const e = asDbError(err);
  const target = e?.meta?.target;
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) return target.join(',');
  return '';
}
