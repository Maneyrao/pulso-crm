import { addDays, type BusinessDate, isBusinessDate } from '@pulso/config/time';

/**
 * Conversión entre `BusinessDate` (`YYYY-MM-DD`) y el `Date` que Prisma espera
 * para columnas `@db.Date` (Member.medicalClearanceUntil, Membership.endDate,
 * Attendance.occurredOn).
 *
 * A propósito NO se usa `startOfBusinessDay` de `@pulso/config/time` acá: esa
 * función calcula el INSTANTE UTC en que empieza el día en una zona horaria
 * (para columnas `timestamptz`), que es un concepto distinto de "la fecha
 * calendario tal cual, sin zona" que exige una columna `date`. Postgres no
 * tiene zona horaria en `date`; Prisma serializa un `Date` de JS usando sus
 * componentes UTC, así que anclar a medianoche UTC es la única conversión que
 * no depende de en qué zona corre el proceso de Node.
 */
export function businessDateToDbDate(date: BusinessDate): Date {
  if (!isBusinessDate(date)) throw new Error(`Fecha de negocio inválida: ${date}`);
  return new Date(`${date}T00:00:00.000Z`);
}

/** Inverso de `businessDateToDbDate`: toma el `Date` que devuelve Prisma para una columna `date`. */
export function dbDateToBusinessDate(date: Date): BusinessDate {
  return date.toISOString().slice(0, 10);
}

/** Lunes de la semana de negocio que contiene `date` (semana Lunes-Domingo). */
export function mondayOfWeek(date: BusinessDate): BusinessDate {
  // Date.UTC con la fecha a mediodía evita cualquier ambigüedad de DST al
  // leer sólo el día de la semana; el cálculo es puramente calendario.
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay(); // 0=domingo..6=sábado
  const daysSinceMonday = (weekday + 6) % 7; // lunes=0 ... domingo=6
  return addDays(date, -daysSinceMonday);
}
