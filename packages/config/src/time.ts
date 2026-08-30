/**
 * Tiempo y zonas horarias (ADR-021).
 *
 * En base todo es UTC. Los cortes de día de negocio se calculan en la zona de
 * la SEDE. Un movimiento de caja a las 23:30 en Buenos Aires pertenece a ese
 * día, no al siguiente por UTC.
 */

export const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

/** `YYYY-MM-DD` — un día de negocio, sin hora ni zona. */
export type BusinessDate = string;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isBusinessDate(value: unknown): value is BusinessDate {
  return typeof value === 'string' && DATE_RE.test(value);
}

const partsFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

/**
 * Instante UTC -> día de negocio en la zona indicada.
 * Es la única forma correcta de derivar `occurredOn`.
 */
export function toBusinessDate(instant: Date, timeZone: string = DEFAULT_TIMEZONE): BusinessDate {
  // en-CA con estas opciones produce exactamente YYYY-MM-DD.
  return partsFormatter(timeZone).format(instant);
}

/** Offset de la zona en minutos para un instante dado (contempla DST). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(instant).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts['year']),
    Number(parts['month']) - 1,
    Number(parts['day']),
    Number(parts['hour']) === 24 ? 0 : Number(parts['hour']),
    Number(parts['minute']),
    Number(parts['second']),
  );
  return (asUtc - instant.getTime()) / 60_000;
}

/** Instante UTC del comienzo (00:00:00.000) de un día de negocio en esa zona. */
export function startOfBusinessDay(date: BusinessDate, timeZone: string = DEFAULT_TIMEZONE): Date {
  if (!isBusinessDate(date)) throw new Error(`Fecha inválida: ${date}. Se espera YYYY-MM-DD.`);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  // Dos pasadas: la primera estima el offset, la segunda lo corrige si el
  // resultado cayó del otro lado de un cambio de DST.
  const first = new Date(naive - offsetMinutes(new Date(naive), timeZone) * 60_000);
  return new Date(naive - offsetMinutes(first, timeZone) * 60_000);
}

/** Instante UTC exclusivo del final del día (= comienzo del día siguiente). */
export function endOfBusinessDayExclusive(
  date: BusinessDate,
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  return startOfBusinessDay(addDays(date, 1), timeZone);
}

/** Suma días sobre un día de negocio, sin pasar por zonas horarias. */
export function addDays(date: BusinessDate, days: number): BusinessDate {
  if (!isBusinessDate(date)) throw new Error(`Fecha inválida: ${date}. Se espera YYYY-MM-DD.`);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** Días calendario entre dos días de negocio (b - a). */
export function daysBetween(a: BusinessDate, b: BusinessDate): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL' | 'CLASS_PACK';

/**
 * Duración de un ciclo en días.
 * `CLASS_PACK` no vence por tiempo sino por clases: devuelve null.
 */
export function cycleDurationDays(cycle: BillingCycle): number | null {
  switch (cycle) {
    case 'MONTHLY':
      return 30;
    case 'QUARTERLY':
      return 90;
    case 'BIANNUAL':
      return 180;
    case 'ANNUAL':
      return 365;
    case 'CLASS_PACK':
      return null;
  }
}

/** Fecha de fin de una membresía a partir de su inicio y ciclo. */
export function membershipEndDate(
  startDate: BusinessDate,
  cycle: BillingCycle,
  overrideDays?: number | null,
): BusinessDate | null {
  const days = overrideDays ?? cycleDurationDays(cycle);
  if (days === null) return null;
  // El día de inicio cuenta: un plan de 30 días que arranca el 1 vence el 30.
  return addDays(startDate, days - 1);
}

export const isValidTimeZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
