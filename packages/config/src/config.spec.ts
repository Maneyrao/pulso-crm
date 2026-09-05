import { describe, expect, it } from 'vitest';
import { EnvValidationError, apiEnvSchema, parseEnv } from './env.js';
import {
  addMoney,
  compareMoney,
  formatMoney,
  fromCents,
  multiplyMoneyByInt,
  normalizeMoney,
  subMoney,
  sumMoney,
  toCents,
} from './money.js';
import {
  addDays,
  daysBetween,
  endOfBusinessDayExclusive,
  membershipEndDate,
  startOfBusinessDay,
  toBusinessDate,
} from './time.js';
import { isValidCuit, isValidDocument, maskDocument, normalizeDocument } from './document.js';
import { normalizePhone } from './phone.js';

const validApiEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'x'.repeat(40),
  CORS_ORIGINS: 'http://localhost:3000',
};

describe('env', () => {
  it('acepta una configuración completa', () => {
    const env = parseEnv(apiEnvSchema, validApiEnv);
    expect(env.PORT).toBe(3001);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('falla nombrando la variable que falta', () => {
    const { DATABASE_URL: _omitted, ...incomplete } = validApiEnv;
    expect(() => parseEnv(apiEnvSchema, incomplete)).toThrow(EnvValidationError);
    try {
      parseEnv(apiEnvSchema, incomplete);
    } catch (e) {
      expect((e as Error).message).toContain('DATABASE_URL');
    }
  });

  it('reporta TODOS los problemas juntos, no de a uno', () => {
    try {
      parseEnv(apiEnvSchema, { NODE_ENV: 'test' });
      expect.unreachable('debería haber lanzado');
    } catch (e) {
      const issues = (e as EnvValidationError).issues.map((i) => i.path.join('.'));
      expect(issues).toContain('DATABASE_URL');
      expect(issues).toContain('REDIS_URL');
      expect(issues).toContain('JWT_SECRET');
    }
  });

  it('rechaza una URL que no es postgres', () => {
    expect(() => parseEnv(apiEnvSchema, { ...validApiEnv, DATABASE_URL: 'mysql://x' })).toThrow();
  });

  it('parsea CORS_ORIGINS como lista y descarta vacíos', () => {
    const env = parseEnv(apiEnvSchema, {
      ...validApiEnv,
      CORS_ORIGINS: 'http://a.test, http://b.test , ',
    });
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });
});

describe('money', () => {
  it('0.1 + 0.2 da exactamente 0.30', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30');
  });

  it('no pierde centavos sumando 100 veces 0.01', () => {
    const values = Array.from({ length: 100 }, () => '0.01');
    expect(sumMoney(values)).toBe('1.00');
  });

  it('normaliza a dos decimales', () => {
    expect(normalizeMoney('5')).toBe('5.00');
    expect(normalizeMoney('5.5')).toBe('5.50');
    expect(normalizeMoney('-0.1')).toBe('-0.10');
  });

  it('maneja importes grandes sin perder precisión', () => {
    expect(addMoney('999999999999.99', '0.01')).toBe('1000000000000.00');
  });

  it('resta y compara', () => {
    expect(subMoney('100.00', '33.33')).toBe('66.67');
    expect(compareMoney('10.00', '9.99')).toBe(1);
    expect(compareMoney('10.00', '10.00')).toBe(0);
  });

  it('rechaza un number disfrazado y formatos inválidos', () => {
    expect(() => toCents('1,50')).toThrow();
    expect(() => toCents('1.234')).toThrow();
    expect(() => toCents('abc')).toThrow();
    // @ts-expect-error prueba de runtime: un number no es un importe válido
    expect(() => toCents(1.5)).toThrow();
  });

  it('multiplica sólo por enteros', () => {
    expect(multiplyMoneyByInt('19.99', 3)).toBe('59.97');
    expect(() => multiplyMoneyByInt('19.99', 1.5)).toThrow();
  });

  it('convierte de ida y vuelta', () => {
    for (const v of ['0.00', '-1.05', '12345.67', '-999.99']) {
      expect(fromCents(toCents(v))).toBe(v);
    }
  });

  it('formatea en es-AR', () => {
    expect(formatMoney('1234.5')).toContain('1.234,50');
  });
});

describe('time', () => {
  const BA = 'America/Argentina/Buenos_Aires';

  it('un instante de las 23:30 en Buenos Aires cae en ESE día, no en el siguiente', () => {
    // 2026-03-10 23:30 -03:00 === 2026-03-11 02:30 UTC
    const instant = new Date('2026-03-11T02:30:00.000Z');
    expect(toBusinessDate(instant, BA)).toBe('2026-03-10');
    expect(toBusinessDate(instant, 'UTC')).toBe('2026-03-11');
  });

  it('un instante de las 00:30 en Buenos Aires cae en el día nuevo', () => {
    const instant = new Date('2026-03-11T03:30:00.000Z');
    expect(toBusinessDate(instant, BA)).toBe('2026-03-11');
  });

  it('el comienzo del día de negocio es 03:00 UTC en Buenos Aires', () => {
    expect(startOfBusinessDay('2026-03-10', BA).toISOString()).toBe('2026-03-10T03:00:00.000Z');
  });

  it('el fin exclusivo es el comienzo del día siguiente', () => {
    expect(endOfBusinessDayExclusive('2026-03-10', BA).toISOString()).toBe(
      '2026-03-11T03:00:00.000Z',
    );
  });

  it('funciona en una zona con horario de verano', () => {
    // Nueva York: EST (-5) en enero, EDT (-4) en julio.
    expect(startOfBusinessDay('2026-01-15', 'America/New_York').toISOString()).toBe(
      '2026-01-15T05:00:00.000Z',
    );
    expect(startOfBusinessDay('2026-07-15', 'America/New_York').toISOString()).toBe(
      '2026-07-15T04:00:00.000Z',
    );
  });

  it('suma días cruzando fin de mes y año bisiesto', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-01-01', '2026-02-01')).toBe(31);
  });

  it('calcula el vencimiento de la membresía contando el día de inicio', () => {
    // Nuevo requisito: MONTHLY usa calendario, no 30 dias ni durationDays.
    expect(membershipEndDate('2026-01-01', 'MONTHLY')).toBe('2026-01-31');
    expect(membershipEndDate('2026-01-01', 'MONTHLY', 30)).toBe('2026-01-31');
    expect(membershipEndDate('2026-01-01', 'ANNUAL')).toBe('2026-12-31');
    expect(membershipEndDate('2026-01-01', 'CLASS_PACK')).toBeNull();
  });
});

describe('document', () => {
  it('normaliza quitando puntos y espacios', () => {
    expect(normalizeDocument('20.123.456')).toBe('20123456');
    expect(normalizeDocument(' ab-12 ')).toBe('AB12');
  });

  it('valida por tipo', () => {
    expect(isValidDocument('DNI', '20.123.456')).toBe(true);
    expect(isValidDocument('DNI', '123')).toBe(false);
    expect(isValidDocument('CUIT', '20-12345678-9')).toBe(true);
  });

  it('valida el dígito verificador de CUIT', () => {
    expect(isValidCuit('20-12345678-6')).toBe(true);
    expect(isValidCuit('20-12345678-9')).toBe(false);
  });

  it('enmascara dejando los últimos 3', () => {
    expect(maskDocument('20123456')).toBe('•••••456');
    expect(maskDocument('12')).toBe('••');
  });
});

describe('phone', () => {
  it('normaliza formatos locales argentinos a E.164', () => {
    for (const input of [
      '11 5555-5555',
      '011 15 5555-5555',
      '+54 9 11 5555 5555',
      '5491155555555',
      '01155555555',
    ]) {
      expect(normalizePhone(input)).toBe('+5491155555555');
    }
  });

  it('normaliza un código de área de 4 dígitos', () => {
    expect(normalizePhone('02954 15 123456')).toBe('+5492954123456');
  });

  it('devuelve null cuando no puede interpretarlo con confianza', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('no es un teléfono')).toBeNull();
  });
});
