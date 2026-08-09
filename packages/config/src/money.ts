/**
 * Dinero como string decimal de 2 posiciones (ADR-010).
 *
 * Nunca `number`. Un float no puede representar 0.1 exactamente, y una caja que
 * pierde un centavo por operación pierde la confianza del cliente mucho antes
 * de perder plata relevante.
 *
 * Internamente se opera con BigInt escalado a centavos.
 */

const SCALE = 2n;
const FACTOR = 100n;

/** `-1234.50`, `0.00`, `1234.5` (se normaliza a 2 decimales). */
const MONEY_RE = /^-?\d{1,12}(\.\d{1,2})?$/;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function isMoneyString(value: unknown): value is string {
  return typeof value === 'string' && MONEY_RE.test(value);
}

/** String decimal -> centavos. Lanza si el formato no es válido. */
export function toCents(value: string): bigint {
  if (!isMoneyString(value)) {
    throw new MoneyError(
      `Importe inválido: ${JSON.stringify(value)}. Se espera un string decimal como "1234.50".`,
    );
  }
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole = '0', frac = ''] = unsigned.split('.');
  const cents = BigInt(whole) * FACTOR + BigInt(frac.padEnd(Number(SCALE), '0'));
  return negative ? -cents : cents;
}

/** Centavos -> string decimal normalizado con 2 posiciones. */
export function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / FACTOR;
  const frac = abs % FACTOR;
  return `${negative ? '-' : ''}${whole}.${frac.toString().padStart(Number(SCALE), '0')}`;
}

/** Normaliza a 2 decimales: "5" -> "5.00", "5.5" -> "5.50". */
export const normalizeMoney = (value: string): string => fromCents(toCents(value));

export const addMoney = (a: string, b: string): string => fromCents(toCents(a) + toCents(b));
export const subMoney = (a: string, b: string): string => fromCents(toCents(a) - toCents(b));

/** Suma una lista. Devuelve "0.00" si está vacía. */
export const sumMoney = (values: readonly string[]): string =>
  fromCents(values.reduce((acc, v) => acc + toCents(v), 0n));

export const compareMoney = (a: string, b: string): -1 | 0 | 1 => {
  const ca = toCents(a);
  const cb = toCents(b);
  return ca < cb ? -1 : ca > cb ? 1 : 0;
};

export const isZeroMoney = (v: string): boolean => toCents(v) === 0n;
export const isPositiveMoney = (v: string): boolean => toCents(v) > 0n;
export const isNegativeMoney = (v: string): boolean => toCents(v) < 0n;
export const negateMoney = (v: string): string => fromCents(-toCents(v));
export const absMoney = (v: string): string => {
  const c = toCents(v);
  return fromCents(c < 0n ? -c : c);
};

/**
 * Multiplica por un entero (cantidades, no porcentajes).
 * Deliberadamente no acepta un multiplicador decimal: los descuentos e impuestos
 * necesitan una regla de redondeo explícita que depende del caso de negocio, y
 * esconderla acá produce diferencias de un centavo que después nadie explica.
 */
export const multiplyMoneyByInt = (value: string, qty: number): string => {
  if (!Number.isSafeInteger(qty)) {
    throw new MoneyError(`La cantidad debe ser un entero, recibí ${qty}.`);
  }
  return fromCents(toCents(value) * BigInt(qty));
};

/** Formato para mostrar. El símbolo y la locale vienen del gimnasio. */
export function formatMoney(
  value: string,
  opts: { locale?: string; currency?: string } = {},
): string {
  const { locale = 'es-AR', currency = 'ARS' } = opts;
  const cents = toCents(value);
  const asNumber = Number(cents) / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(asNumber);
}

export const ZERO_MONEY = '0.00';
