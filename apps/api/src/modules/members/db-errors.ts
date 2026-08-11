/**
 * Traducción de errores de base a errores de dominio.
 *
 * El filtro global (`GlobalExceptionFilter`) ya sabe traducir estos mismos
 * casos para cualquier excepción que se le escape a un servicio. Acá se
 * traducen explícitamente EN EL SERVICIO además, por dos motivos: (1) es más
 * testeable sin tener que levantar HTTP completo, y (2) el servicio es dueño
 * de sus propios modos de falla conocidos en vez de depender de un catch-all.
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

/**
 * `true` si el error de base menciona el constraint indicado.
 *
 * Sirve para EXCLUDE y CHECK constraints, que Prisma no clasifica con un
 * código propio: el texto de Postgres (que incluye el nombre del constraint
 * entre comillas) es lo único disponible para identificarlos.
 */
export function mentionsConstraint(err: unknown, constraintName: string): boolean {
  const e = asDbError(err);
  const message = e?.message;
  return typeof message === 'string' && message.includes(constraintName);
}
