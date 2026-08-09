import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, seedMinimalGym, type TestDatabase } from './testing.js';
import { CrossTenantWriteError, MissingTenantContextError } from './tenant-extension.js';

/**
 * Verifica contra PostgreSQL real las garantías que el producto trata como
 * innegociables. Cada test de acá corresponde a una fila de DATA_MODEL §14.
 */

let db: TestDatabase;
let gymA: { id: string };
let gymB: { id: string };
let branchA: { id: string };

beforeAll(async () => {
  db = await createTestDatabase('integrity');
  const a = await seedMinimalGym(db.raw, { slug: 'gym-a', name: 'Gimnasio A' });
  const b = await seedMinimalGym(db.raw, { slug: 'gym-b', name: 'Gimnasio B' });
  gymA = a.gym;
  gymB = b.gym;
  branchA = a.branch;
}, 120_000);

afterAll(async () => {
  await db?.destroy();
});

const member = (gymId: string, over: Record<string, unknown> = {}) => ({
  gymId,
  memberNumber: Math.floor(Math.random() * 1_000_000),
  firstName: 'Ana',
  lastName: 'Pérez',
  documentType: 'DNI' as const,
  documentNumber: '90000001',
  ...over,
});

describe('aislamiento entre gimnasios', () => {
  it('sin contexto de tenant, la consulta LANZA en vez de devolver todo', async () => {
    db.setTenant(null);
    await expect(db.prisma.member.findMany()).rejects.toThrow(MissingTenantContextError);
    await expect(db.prisma.member.count()).rejects.toThrow(MissingTenantContextError);
  });

  it('findMany sin where devuelve sólo el gimnasio activo', async () => {
    await db.raw.member.create({ data: member(gymA.id, { documentNumber: '90000010' }) });
    await db.raw.member.create({ data: member(gymB.id, { documentNumber: '90000011' }) });

    const fromA = await db.asTenant(gymA.id, () => db.prisma.member.findMany());
    expect(fromA.every((m) => m.gymId === gymA.id)).toBe(true);
    expect(fromA.some((m) => m.documentNumber === '90000011')).toBe(false);
  });

  it('findUnique por id de otro gimnasio devuelve null', async () => {
    const foreign = await db.raw.member.create({
      data: member(gymB.id, { documentNumber: '90000020' }),
    });
    const found = await db.asTenant(gymA.id, () =>
      db.prisma.member.findUnique({ where: { id: foreign.id } }),
    );
    expect(found).toBeNull();
  });

  it('update sobre una fila de otro gimnasio no la modifica', async () => {
    const foreign = await db.raw.member.create({
      data: member(gymB.id, { documentNumber: '90000021', firstName: 'Original' }),
    });
    await expect(
      db.asTenant(gymA.id, () =>
        db.prisma.member.update({ where: { id: foreign.id }, data: { firstName: 'Hackeado' } }),
      ),
    ).rejects.toThrow();

    const after = await db.raw.member.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(after.firstName).toBe('Original');
  });

  it('create recibe el gymId inyectado, sin declararlo', async () => {
    const created = await db.asTenant(gymA.id, () =>
      db.prisma.member.create({
        data: {
          memberNumber: 5001,
          firstName: 'Luis',
          lastName: 'Gómez',
          documentType: 'DNI',
          documentNumber: '90000030',
        },
      }),
    );
    expect(created.gymId).toBe(gymA.id);
  });

  it('create declarando OTRO gymId es rechazado', async () => {
    await expect(
      db.asTenant(gymA.id, () =>
        db.prisma.member.create({
          data: {
            gymId: gymB.id,
            memberNumber: 5002,
            firstName: 'Intruso',
            lastName: 'X',
            documentType: 'DNI',
            documentNumber: '90000031',
          },
        }),
      ),
    ).rejects.toThrow(CrossTenantWriteError);
  });

  it('deleteMany no toca filas de otro gimnasio', async () => {
    await db.raw.member.create({ data: member(gymB.id, { documentNumber: '90000040' }) });
    const before = await db.raw.member.count({ where: { gymId: gymB.id } });
    await db.asTenant(gymA.id, () => db.prisma.member.deleteMany({}));
    const after = await db.raw.member.count({ where: { gymId: gymB.id } });
    expect(after).toBe(before);
  });
});

describe('documento único por gimnasio', () => {
  it('rechaza el mismo documento dos veces en el mismo gimnasio', async () => {
    await db.raw.member.create({ data: member(gymA.id, { documentNumber: '90000100' }) });
    await expect(
      db.raw.member.create({ data: member(gymA.id, { documentNumber: '90000100' }) }),
    ).rejects.toThrow();
  });

  it('permite el MISMO documento en gimnasios distintos', async () => {
    await db.raw.member.create({ data: member(gymA.id, { documentNumber: '90000101' }) });
    await expect(
      db.raw.member.create({ data: member(gymB.id, { documentNumber: '90000101' }) }),
    ).resolves.toBeTruthy();
  });

  it('permite volver a dar de alta un documento tras la baja (unique parcial)', async () => {
    const created = await db.raw.member.create({
      data: member(gymA.id, { documentNumber: '90000102' }),
    });
    await db.raw.member.update({
      where: { id: created.id },
      data: { deletedAt: new Date() },
    });
    await expect(
      db.raw.member.create({ data: member(gymA.id, { documentNumber: '90000102' }) }),
    ).resolves.toBeTruthy();
  });
});

describe('membresías solapadas', () => {
  const setup = async () => {
    const m = await db.raw.member.create({
      data: member(gymA.id, { documentNumber: `9000${Math.floor(Math.random() * 9000) + 1000}` }),
    });
    const plan = await db.raw.plan.create({
      data: {
        gymId: gymA.id,
        name: `Plan ${Math.random()}`,
        price: '10000.00',
        billingCycle: 'MONTHLY',
      },
    });
    return { m, plan };
  };

  it('rechaza dos membresías activas que cubren el mismo día', async () => {
    const { m, plan } = await setup();
    await db.raw.membership.create({
      data: {
        gymId: gymA.id,
        memberId: m.id,
        planId: plan.id,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-30'),
        pricePaid: '10000.00',
      },
    });
    await expect(
      db.raw.membership.create({
        data: {
          gymId: gymA.id,
          memberId: m.id,
          planId: plan.id,
          startDate: new Date('2026-01-15'),
          endDate: new Date('2026-02-15'),
          pricePaid: '10000.00',
        },
      }),
    ).rejects.toThrow();
  });

  it('permite membresías consecutivas sin solaparse', async () => {
    const { m, plan } = await setup();
    await db.raw.membership.create({
      data: {
        gymId: gymA.id,
        memberId: m.id,
        planId: plan.id,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-30'),
        pricePaid: '10000.00',
      },
    });
    await expect(
      db.raw.membership.create({
        data: {
          gymId: gymA.id,
          memberId: m.id,
          planId: plan.id,
          startDate: new Date('2026-01-31'),
          endDate: new Date('2026-03-01'),
          pricePaid: '10000.00',
        },
      }),
    ).resolves.toBeTruthy();
  });

  it('una membresía cancelada libera el rango', async () => {
    const { m, plan } = await setup();
    const first = await db.raw.membership.create({
      data: {
        gymId: gymA.id,
        memberId: m.id,
        planId: plan.id,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-30'),
        pricePaid: '10000.00',
      },
    });
    await db.raw.membership.update({
      where: { id: first.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await expect(
      db.raw.membership.create({
        data: {
          gymId: gymA.id,
          memberId: m.id,
          planId: plan.id,
          startDate: new Date('2026-01-10'),
          endDate: new Date('2026-02-10'),
          pricePaid: '10000.00',
        },
      }),
    ).resolves.toBeTruthy();
  });
});

describe('append-only', () => {
  it('AuditEvent no acepta UPDATE ni DELETE', async () => {
    const ev = await db.raw.auditEvent.create({
      data: { gymId: gymA.id, action: 'TEST', resourceType: 'Test' },
    });
    await expect(
      db.raw.auditEvent.update({ where: { id: ev.id }, data: { action: 'ALTERADO' } }),
    ).rejects.toThrow(/append-only/i);
    await expect(db.raw.auditEvent.delete({ where: { id: ev.id } })).rejects.toThrow(
      /append-only/i,
    );
  });

  it('LedgerEntry no acepta UPDATE ni DELETE', async () => {
    const m = await db.raw.member.create({
      data: member(gymA.id, { documentNumber: '90000200' }),
    });
    const entry = await db.raw.ledgerEntry.create({
      data: {
        gymId: gymA.id,
        memberId: m.id,
        type: 'DEBIT',
        reason: 'MEMBERSHIP_CHARGE',
        amount: '10000.00',
        balanceAfter: '-10000.00',
      },
    });
    await expect(
      db.raw.ledgerEntry.update({ where: { id: entry.id }, data: { amount: '1.00' } }),
    ).rejects.toThrow(/append-only/i);
  });

  it('AccessAttempt no acepta UPDATE', async () => {
    const attempt = await db.raw.accessAttempt.create({
      data: {
        gymId: gymA.id,
        branchId: branchA.id,
        method: 'DOCUMENT',
        decision: 'DENIED',
        reasonCode: 'MEMBER_NOT_FOUND',
      },
    });
    await expect(
      db.raw.accessAttempt.update({ where: { id: attempt.id }, data: { decision: 'ALLOWED' } }),
    ).rejects.toThrow(/append-only/i);
  });
});

describe('checks de dominio', () => {
  it('un importe de caja no puede ser cero ni negativo', async () => {
    const pm = await db.raw.paymentMethod.create({
      data: { gymId: gymA.id, code: 'CASH_CHK', name: 'Efectivo', countsAsCash: true },
    });
    const cc = await db.raw.cashConcept.create({
      data: { gymId: gymA.id, code: 'SALE_CHK', name: 'Venta', type: 'INCOME' },
    });
    const reg = await db.raw.cashRegister.create({
      data: { gymId: gymA.id, branchId: branchA.id, name: 'Caja check' },
    });
    const user = await db.raw.user.create({
      data: {
        gymId: gymA.id,
        email: 'check@test.local',
        passwordHash: 'x',
        firstName: 'C',
        lastName: 'K',
      },
    });
    const session = await db.raw.cashSession.create({
      data: {
        gymId: gymA.id,
        branchId: branchA.id,
        cashRegisterId: reg.id,
        openedByUserId: user.id,
        openingAmount: '0.00',
        businessDate: new Date('2026-01-01'),
      },
    });

    for (const amount of ['0.00', '-5.00']) {
      await expect(
        db.raw.cashMovement.create({
          data: {
            gymId: gymA.id,
            cashSessionId: session.id,
            type: 'INCOME',
            amount,
            paymentMethodId: pm.id,
            cashConceptId: cc.id,
            createdByUserId: user.id,
          },
        }),
      ).rejects.toThrow();
    }
  });

  it('las clases restantes no pueden ser negativas', async () => {
    const m = await db.raw.member.create({
      data: member(gymA.id, { documentNumber: '90000300' }),
    });
    const plan = await db.raw.plan.create({
      data: {
        gymId: gymA.id,
        name: 'Pack check',
        price: '5000.00',
        billingCycle: 'CLASS_PACK',
        classesIncluded: 10,
      },
    });
    await expect(
      db.raw.membership.create({
        data: {
          gymId: gymA.id,
          memberId: m.id,
          planId: plan.id,
          startDate: new Date('2026-06-01'),
          pricePaid: '5000.00',
          classesIncluded: 10,
          classesRemaining: -1,
        },
      }),
    ).rejects.toThrow();
  });
});

describe('caja: sesiones incompatibles', () => {
  it('una caja no puede tener dos sesiones abiertas', async () => {
    const reg = await db.raw.cashRegister.create({
      data: { gymId: gymA.id, branchId: branchA.id, name: 'Caja doble' },
    });
    const u1 = await db.raw.user.create({
      data: {
        gymId: gymA.id,
        email: 'u1@test.local',
        passwordHash: 'x',
        firstName: 'U',
        lastName: '1',
      },
    });
    const u2 = await db.raw.user.create({
      data: {
        gymId: gymA.id,
        email: 'u2@test.local',
        passwordHash: 'x',
        firstName: 'U',
        lastName: '2',
      },
    });

    await db.raw.cashSession.create({
      data: {
        gymId: gymA.id,
        branchId: branchA.id,
        cashRegisterId: reg.id,
        openedByUserId: u1.id,
        openingAmount: '0.00',
        businessDate: new Date('2026-01-02'),
      },
    });

    await expect(
      db.raw.cashSession.create({
        data: {
          gymId: gymA.id,
          branchId: branchA.id,
          cashRegisterId: reg.id,
          openedByUserId: u2.id,
          openingAmount: '0.00',
          businessDate: new Date('2026-01-02'),
        },
      }),
    ).rejects.toThrow();
  });

  it('un usuario no puede tener dos cajas abiertas', async () => {
    const r1 = await db.raw.cashRegister.create({
      data: { gymId: gymA.id, branchId: branchA.id, name: 'Caja u-1' },
    });
    const r2 = await db.raw.cashRegister.create({
      data: { gymId: gymA.id, branchId: branchA.id, name: 'Caja u-2' },
    });
    const u = await db.raw.user.create({
      data: {
        gymId: gymA.id,
        email: 'dos-cajas@test.local',
        passwordHash: 'x',
        firstName: 'D',
        lastName: 'C',
      },
    });

    await db.raw.cashSession.create({
      data: {
        gymId: gymA.id,
        branchId: branchA.id,
        cashRegisterId: r1.id,
        openedByUserId: u.id,
        openingAmount: '0.00',
        businessDate: new Date('2026-01-03'),
      },
    });

    await expect(
      db.raw.cashSession.create({
        data: {
          gymId: gymA.id,
          branchId: branchA.id,
          cashRegisterId: r2.id,
          openedByUserId: u.id,
          openingAmount: '0.00',
          businessDate: new Date('2026-01-03'),
        },
      }),
    ).rejects.toThrow();
  });
});

describe('asistencia', () => {
  it('no se puede registrar dos veces el mismo socio, sede y día', async () => {
    const m = await db.raw.member.create({
      data: member(gymA.id, { documentNumber: '90000400' }),
    });
    const data = {
      gymId: gymA.id,
      branchId: branchA.id,
      memberId: m.id,
      method: 'DOCUMENT' as const,
      occurredOn: new Date('2026-05-05'),
    };
    await db.raw.attendance.create({ data });
    await expect(db.raw.attendance.create({ data })).rejects.toThrow(/Unique constraint/i);
  });
});

describe('idempotencia y mensajería', () => {
  it('la misma clave de idempotencia no se puede usar dos veces en el gimnasio', async () => {
    const base = {
      gymId: gymA.id,
      key: 'idem-1',
      endpoint: 'POST /members',
      requestHash: 'abc',
      expiresAt: new Date('2027-01-01'),
    };
    await db.raw.idempotencyKey.create({ data: base });
    await expect(db.raw.idempotencyKey.create({ data: base })).rejects.toThrow();
    // La misma clave en otro gimnasio sí es válida.
    await expect(
      db.raw.idempotencyKey.create({ data: { ...base, gymId: gymB.id } }),
    ).resolves.toBeTruthy();
  });

  it('el dedupeKey impide encolar dos veces el mismo mensaje', async () => {
    const base = {
      gymId: gymA.id,
      channel: 'WHATSAPP' as const,
      destination: '+5491155555555',
      body: 'hola',
      dedupeKey: 'receipt:xyz',
    };
    await db.raw.messageJob.create({ data: base });
    await expect(db.raw.messageJob.create({ data: base })).rejects.toThrow();
  });
});
