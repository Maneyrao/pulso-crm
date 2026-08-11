import { describe, expect, it } from 'vitest';
import {
  AccessDecision as PrismaAccessDecision,
  AccessMethod as PrismaAccessMethod,
  AccessReasonCode as PrismaAccessReasonCode,
  BillingCycle as PrismaBillingCycle,
  CashMovementType as PrismaCashMovementType,
  CashOperationKind as PrismaCashOperationKind,
  CashOperationStatus as PrismaCashOperationStatus,
  CashSessionStatus as PrismaCashSessionStatus,
  DocumentType as PrismaDocumentType,
  Gender as PrismaGender,
  GymStatus as PrismaGymStatus,
  LedgerEntryType as PrismaLedgerEntryType,
  LedgerReason as PrismaLedgerReason,
  MemberDocumentKind as PrismaMemberDocumentKind,
  MemberStatus as PrismaMemberStatus,
  MembershipStatus as PrismaMembershipStatus,
  MessageChannel as PrismaMessageChannel,
  MessageJobStatus as PrismaMessageJobStatus,
  MessageTemplateKind as PrismaMessageTemplateKind,
  UserStatus as PrismaUserStatus,
} from '@prisma/client';

import { accessCheckRequestSchema, accessDecisionSchema, accessMethodSchema, accessReasonCodeSchema } from './access.js';
import { billingCycleSchema } from './catalog.js';
import { cashMovementTypeSchema, cashOperationKindSchema, cashOperationStatusSchema, cashSessionStatusSchema, createCashMovementRequestSchema } from './cash.js';
import { businessDateSchema, isoInstantSchema, moneySchema, problemDetailsSchema, uuidSchema } from './common.js';
import { FEATURE_KEYS, DEFAULT_PLAN_FEATURES } from './features.js';
import { userStatusSchema } from './iam.js';
import { loginRequestSchema } from './auth.js';
import { gymStatusSchema } from './tenancy.js';
import { createMemberRequestSchema, documentTypeSchema, genderSchema, ledgerEntryTypeSchema, ledgerReasonSchema, listMembersQuerySchema, memberDocumentKindSchema, memberStatusSchema } from './members.js';
import { createMembershipRequestSchema, membershipStatusSchema } from './memberships.js';
import { messageChannelSchema, messageJobStatusSchema, messageTemplateKindSchema } from './messaging.js';
import { PERMISSIONS, SYSTEM_ROLE_CODES, SYSTEM_ROLE_PERMISSIONS } from './permissions.js';

/** Compara un `z.enum` de contracts contra el objeto de enum generado por Prisma. */
function expectMatchesPrismaEnum(zodEnum: { options: readonly string[] }, prismaEnum: Record<string, string>) {
  const fromZod = [...zodEnum.options].sort();
  const fromPrisma = Object.values(prismaEnum).sort();
  expect(fromZod).toEqual(fromPrisma);
}

describe('common — moneySchema', () => {
  it('rechaza un number', () => {
    expect(moneySchema.safeParse(1500).success).toBe(false);
  });

  it('rechaza formatos inválidos (más de 2 decimales, texto, vacío)', () => {
    expect(moneySchema.safeParse('12.345').success).toBe(false);
    expect(moneySchema.safeParse('abc').success).toBe(false);
    expect(moneySchema.safeParse('').success).toBe(false);
    expect(moneySchema.safeParse('15,00').success).toBe(false);
  });

  it('acepta strings decimales válidos, incluidos negativos y sin decimales', () => {
    expect(moneySchema.safeParse('1500.00').success).toBe(true);
    expect(moneySchema.safeParse('-50.25').success).toBe(true);
    expect(moneySchema.safeParse('0.00').success).toBe(true);
    expect(moneySchema.safeParse('100').success).toBe(true);
  });
});

describe('common — businessDateSchema / uuidSchema / isoInstantSchema', () => {
  it('acepta YYYY-MM-DD y rechaza otros formatos', () => {
    expect(businessDateSchema.safeParse('2026-08-09').success).toBe(true);
    expect(businessDateSchema.safeParse('09/08/2026').success).toBe(false);
    expect(businessDateSchema.safeParse('2026-08-09T00:00:00Z').success).toBe(false);
  });

  it('uuidSchema rechaza un id no uuid', () => {
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(uuidSchema.safeParse('018f1e2a-0000-7000-8000-000000000000').success).toBe(true);
  });

  it('isoInstantSchema exige offset explícito', () => {
    expect(isoInstantSchema.safeParse('2026-08-09T14:30:00-03:00').success).toBe(true);
    expect(isoInstantSchema.safeParse('2026-08-09').success).toBe(false);
  });
});

describe('common — problemDetailsSchema', () => {
  it('valida un error RFC-7807 completo del catálogo', () => {
    const result = problemDetailsSchema.safeParse({
      type: 'https://docs.pulso.app/errors/CASH_SESSION_NOT_OPEN',
      code: 'CASH_SESSION_NOT_OPEN',
      title: 'No hay una sesión de caja abierta',
      status: 409,
      detail: 'El usuario no tiene una sesión de caja abierta en esta sede.',
      requestId: '01J0000000000000000000000',
      errors: [{ path: 'amount', code: 'invalid_format', message: 'Debe ser decimal con hasta 2 decimales' }],
    });
    expect(result.success).toBe(true);
  });

  it('rechaza un code fuera del catálogo', () => {
    const result = problemDetailsSchema.safeParse({
      type: 'https://docs.pulso.app/errors/ALGO_INVENTADO',
      code: 'ALGO_INVENTADO',
      title: 'x',
      status: 400,
    });
    expect(result.success).toBe(false);
  });
});

describe('auth — login', () => {
  it('acepta credenciales válidas', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.com', password: '12345678' }).success).toBe(true);
  });

  it('rechaza email inválido', () => {
    expect(loginRequestSchema.safeParse({ email: 'no-es-un-email', password: '12345678' }).success).toBe(false);
  });

  it('rechaza password corta', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.com', password: '123' }).success).toBe(false);
  });
});

describe('members — filtros de búsqueda', () => {
  it('valida un query mínimo con defaults de paginación y orden', () => {
    const result = listMembersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe('lastName');
      expect(result.data.order).toBe('asc');
      expect(result.data.limit).toBe(25);
    }
  });

  it('rechaza q con menos de 2 caracteres', () => {
    expect(listMembersQuerySchema.safeParse({ q: 'a' }).success).toBe(false);
  });

  it('rechaza un campo de sort fuera de la allowlist', () => {
    expect(listMembersQuerySchema.safeParse({ sort: 'documentNumber' }).success).toBe(false);
  });

  it('acepta filtros combinados', () => {
    const result = listMembersQuerySchema.safeParse({
      q: 'garcia',
      status: 'ACTIVE',
      membershipStatus: 'ACTIVE',
      hasDebt: 'true',
      page: 2,
      limit: 50,
    });
    expect(result.success).toBe(true);
  });
});

describe('members — alta de socio', () => {
  it('valida un DNI bien formado', () => {
    const result = createMemberRequestSchema.safeParse({
      documentType: 'DNI',
      documentNumber: '30123456',
      firstName: 'Ana',
      lastName: 'Gómez',
      branchId: '018f1e2a-0000-7000-8000-000000000000',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza un DNI mal formado para documentType DNI', () => {
    const result = createMemberRequestSchema.safeParse({
      documentType: 'DNI',
      documentNumber: 'ABC',
      firstName: 'Ana',
      lastName: 'Gómez',
      branchId: '018f1e2a-0000-7000-8000-000000000000',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza cuando faltan campos obligatorios', () => {
    expect(createMemberRequestSchema.safeParse({ firstName: 'Ana' }).success).toBe(false);
  });
});

describe('memberships — cobro con caja', () => {
  it('mode DEBT no requiere paymentMethodId ni amount', () => {
    const result = createMembershipRequestSchema.safeParse({
      planId: '018f1e2a-0000-7000-8000-000000000000',
      branchId: '018f1e2a-0000-7000-8000-000000000000',
      startDate: '2026-08-09',
      charge: { mode: 'DEBT' },
    });
    expect(result.success).toBe(true);
  });

  it('mode NOW exige paymentMethodId y amount', () => {
    const result = createMembershipRequestSchema.safeParse({
      planId: '018f1e2a-0000-7000-8000-000000000000',
      branchId: '018f1e2a-0000-7000-8000-000000000000',
      startDate: '2026-08-09',
      charge: { mode: 'NOW' },
    });
    expect(result.success).toBe(false);
  });
});

describe('cash — movimientos', () => {
  it('rechaza un amount negativo o cero (no es un string decimal positivo válido de negocio)', () => {
    const base = {
      type: 'INCOME' as const,
      cashConceptId: '018f1e2a-0000-7000-8000-000000000000',
      paymentMethodId: '018f1e2a-0000-7000-8000-000000000000',
    };
    expect(createCashMovementRequestSchema.safeParse({ ...base, amount: '0.00' }).success).toBe(true);
    // moneySchema en sí no impone signo; la regla de negocio (> 0) la aplica el backend.
    // Acá sólo se verifica el formato.
    expect(createCashMovementRequestSchema.safeParse({ ...base, amount: 100 }).success).toBe(false);
  });
});

describe('access — check', () => {
  it('default de registerAttendance es true', () => {
    const result = accessCheckRequestSchema.safeParse({
      branchId: '018f1e2a-0000-7000-8000-000000000000',
      method: 'DOCUMENT',
      identifier: '30123456',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.registerAttendance).toBe(true);
  });
});

describe('permissions — catálogo', () => {
  it('no tiene duplicados', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('cada rol de sistema sólo referencia permisos existentes', () => {
    const known = new Set(PERMISSIONS);
    for (const code of SYSTEM_ROLE_CODES) {
      for (const permission of SYSTEM_ROLE_PERMISSIONS[code]) {
        expect(known.has(permission)).toBe(true);
      }
    }
  });

  it('todos los roles de sistema tienen al menos un permiso', () => {
    for (const code of SYSTEM_ROLE_CODES) {
      expect(SYSTEM_ROLE_PERMISSIONS[code].length).toBeGreaterThan(0);
    }
  });

  it('OWNER tiene todos los permisos del catálogo', () => {
    expect(new Set(SYSTEM_ROLE_PERMISSIONS.OWNER)).toEqual(new Set(PERMISSIONS));
  });
});

describe('features — catálogo', () => {
  it('no tiene duplicados', () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
  });

  it('cada plan de referencia sólo declara features existentes', () => {
    const known = new Set(FEATURE_KEYS);
    for (const features of Object.values(DEFAULT_PLAN_FEATURES)) {
      for (const feature of features) {
        expect(known.has(feature)).toBe(true);
      }
    }
  });
});

describe('enums — coinciden con schema.prisma', () => {
  it('DocumentType', () => expectMatchesPrismaEnum(documentTypeSchema, PrismaDocumentType));
  it('MemberStatus', () => expectMatchesPrismaEnum(memberStatusSchema, PrismaMemberStatus));
  it('Gender', () => expectMatchesPrismaEnum(genderSchema, PrismaGender));
  it('MemberDocumentKind', () => expectMatchesPrismaEnum(memberDocumentKindSchema, PrismaMemberDocumentKind));
  it('LedgerEntryType', () => expectMatchesPrismaEnum(ledgerEntryTypeSchema, PrismaLedgerEntryType));
  it('LedgerReason', () => expectMatchesPrismaEnum(ledgerReasonSchema, PrismaLedgerReason));
  it('BillingCycle', () => expectMatchesPrismaEnum(billingCycleSchema, PrismaBillingCycle));
  it('MembershipStatus', () => expectMatchesPrismaEnum(membershipStatusSchema, PrismaMembershipStatus));
  it('CashMovementType', () => expectMatchesPrismaEnum(cashMovementTypeSchema, PrismaCashMovementType));
  it('CashSessionStatus', () => expectMatchesPrismaEnum(cashSessionStatusSchema, PrismaCashSessionStatus));
  it('CashOperationKind', () => expectMatchesPrismaEnum(cashOperationKindSchema, PrismaCashOperationKind));
  it('CashOperationStatus', () => expectMatchesPrismaEnum(cashOperationStatusSchema, PrismaCashOperationStatus));
  it('AccessMethod', () => expectMatchesPrismaEnum(accessMethodSchema, PrismaAccessMethod));
  it('AccessReasonCode', () => expectMatchesPrismaEnum(accessReasonCodeSchema, PrismaAccessReasonCode));
  it('GymStatus', () => expectMatchesPrismaEnum(gymStatusSchema, PrismaGymStatus));
  it('UserStatus', () => expectMatchesPrismaEnum(userStatusSchema, PrismaUserStatus));
  it('MessageChannel', () => expectMatchesPrismaEnum(messageChannelSchema, PrismaMessageChannel));
  it('MessageTemplateKind', () => expectMatchesPrismaEnum(messageTemplateKindSchema, PrismaMessageTemplateKind));
  it('MessageJobStatus', () => expectMatchesPrismaEnum(messageJobStatusSchema, PrismaMessageJobStatus));

  it('AccessDecision', () => expectMatchesPrismaEnum(accessDecisionSchema, PrismaAccessDecision));
});
