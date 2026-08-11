/**
 * Conversión entre `BusinessDate` (`YYYY-MM-DD`, sin hora ni zona) y las
 * columnas `@db.Date` de Prisma.
 *
 * El interceptor global (`DecimalSerializerInterceptor`) convierte cualquier
 * `Date` a un instante ISO completo (`toISOString()`), lo que NO sirve para
 * columnas de sólo fecha como `birthDate` o `startDate`: ahí se necesita
 * `YYYY-MM-DD` puro. Por eso cada módulo convierte estos campos a string ANTES
 * de devolver la respuesta, para que el interceptor los encuentre ya
 * convertidos y no toque nada.
 */

/** `YYYY-MM-DD` -> medianoche UTC de ese día, tal como lo espera `@db.Date`. */
export function fromDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** `@db.Date` (siempre medianoche UTC) -> `YYYY-MM-DD`. */
export function toDateOnly(value: Date): string;
export function toDateOnly(value: Date | null): string | null;
export function toDateOnly(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}
