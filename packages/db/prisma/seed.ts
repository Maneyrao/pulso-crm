import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import argon2 from 'argon2';
import { PrismaClient, type Prisma } from '@prisma/client';
import { SYSTEM_ROLE_CODES, SYSTEM_ROLE_PERMISSIONS } from '@pulso/contracts';

loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

/**
 * Seed determinístico.
 *
 * Sin `Math.random()` ni fechas del reloj sin anclar: dos corridas producen
 * exactamente los mismos ids. Un bug que se reproduce sólo a veces porque los
 * datos cambian en cada seed cuesta mucho más de lo que ahorra la comodidad.
 */

const prisma = new PrismaClient();

/** Fecha de referencia. Todo lo relativo se calcula desde acá. */
const TODAY = new Date('2026-08-09T12:00:00.000Z');
const day = (offset: number): Date => new Date(TODAY.getTime() + offset * 86_400_000);
const dateOnly = (d: Date): Date => new Date(d.toISOString().slice(0, 10));

/** uuid v7 determinístico a partir de un contador. Legible al depurar. */
function fixedId(prefix: number, n: number): string {
  const hex = (prefix * 100_000 + n).toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-${String(n).padStart(12, '0')}`;
}

const DEMO_PASSWORD = 'Demo.1234';

/**
 * Rango de documentos reservado para datos de prueba.
 * Ninguno corresponde a una persona real.
 */
const DOC_BASE = 90_000_000;

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('El seed carga usuarios con contraseña conocida. Nunca corre en producción.');
  }

  const url = process.env['DATABASE_URL'] ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`DATABASE_URL no apunta a localhost (${url}). Abortando por seguridad.`);
  }

  const existing = await prisma.gym.count();
  if (existing > 0 && process.env['SEED_FORCE'] !== 'true') {
    // eslint-disable-next-line no-console
    console.log('Ya hay datos. Usá SEED_FORCE=true si querés sobrescribir, o corré pnpm db:reset.');
    return;
  }

  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  // ── Plan SaaS ─────────────────────────────────────────────────────────────
  const plan = await prisma.saasPlan.upsert({
    where: { code: 'PRO' },
    update: {},
    create: {
      id: fixedId(1, 1),
      code: 'PRO',
      name: 'Pro',
      description: 'Multi-sede, caja, acceso y mensajería.',
      maxBranches: 5,
      maxMembers: 2_000,
      maxUsers: 25,
      features: ['members', 'catalog', 'cash', 'access', 'messaging', 'reports'],
      monthlyPrice: '49900.00',
    },
  });

  // ── Gimnasio y sedes ──────────────────────────────────────────────────────
  const gym = await prisma.gym.create({
    data: {
      id: fixedId(2, 1),
      slug: 'demo',
      name: 'Gimnasio Demo',
      legalName: 'Gimnasio Demo S.R.L.',
      saasPlanId: plan.id,
      currency: 'ARS',
      locale: 'es-AR',
      country: 'AR',
    },
  });

  const [centro, norte] = await Promise.all([
    prisma.branch.create({
      data: {
        id: fixedId(3, 1),
        gymId: gym.id,
        name: 'Sede Centro',
        timezone: 'America/Argentina/Buenos_Aires',
        address: 'Av. Siempreviva 742',
      },
    }),
    prisma.branch.create({
      data: {
        id: fixedId(3, 2),
        gymId: gym.id,
        name: 'Sede Norte',
        timezone: 'America/Argentina/Buenos_Aires',
        address: 'Calle Falsa 123',
      },
    }),
  ]);

  await prisma.memberCounter.create({ data: { gymId: gym.id, last: 0 } });

  // ── Roles ─────────────────────────────────────────────────────────────────
  const ROLE_LABELS: Record<string, { name: string; description: string }> = {
    OWNER: { name: 'Dueño', description: 'Acceso total, incluida configuración y facturación.' },
    MANAGER: {
      name: 'Encargado',
      description: 'Opera y supervisa: aprueba reversas y ve reportes.',
    },
    RECEPTIONIST: {
      name: 'Recepción',
      description: 'Mostrador: socios, cobros, caja propia y acceso.',
    },
    INSTRUCTOR: {
      name: 'Instructor',
      description: 'Consulta socios y asistencias. No opera dinero.',
    },
  };

  const roles = new Map<string, string>();
  for (const [i, code] of SYSTEM_ROLE_CODES.entries()) {
    const label = ROLE_LABELS[code]!;
    const created = await prisma.role.create({
      data: {
        id: fixedId(4, i + 1),
        gymId: gym.id,
        code,
        name: label.name,
        description: label.description,
        isSystem: true,
        permissions: [...SYSTEM_ROLE_PERMISSIONS[code]],
      },
    });
    roles.set(code, created.id);
  }

  // ── Usuarios ──────────────────────────────────────────────────────────────
  const users: { email: string; first: string; last: string; role: string; branches: string[] }[] =
    [
      {
        email: 'admin@demo.local',
        first: 'Ana',
        last: 'Dueña',
        role: 'OWNER',
        branches: [centro.id, norte.id],
      },
      {
        email: 'recepcion@demo.local',
        first: 'Rocío',
        last: 'Recepción',
        role: 'RECEPTIONIST',
        branches: [centro.id],
      },
      {
        email: 'profe@demo.local',
        first: 'Pablo',
        last: 'Instructor',
        role: 'INSTRUCTOR',
        branches: [centro.id, norte.id],
      },
    ];

  const userIds = new Map<string, string>();
  for (const [i, u] of users.entries()) {
    const created = await prisma.user.create({
      data: {
        id: fixedId(5, i + 1),
        gymId: gym.id,
        email: u.email,
        passwordHash,
        firstName: u.first,
        lastName: u.last,
        roleAssignments: { create: { gymId: gym.id, roleId: roles.get(u.role)! } },
        branchAccess: {
          create: u.branches.map((b) => ({ gymId: gym.id, branchId: b })),
        },
      },
    });
    userIds.set(u.email, created.id);
  }
  const adminId = userIds.get('admin@demo.local')!;
  const recepcionId = userIds.get('recepcion@demo.local')!;

  // ── Catálogo ──────────────────────────────────────────────────────────────
  const activities = await Promise.all(
    ['Musculación', 'Funcional', 'Spinning'].map((name, i) =>
      prisma.activity.create({
        data: {
          id: fixedId(6, i + 1),
          gymId: gym.id,
          name,
          color: ['#0ea5a4', '#f97316', '#8b5cf6'][i]!,
        },
      }),
    ),
  );

  const planDefs: {
    name: string;
    price: string;
    cycle: Prisma.PlanCreateInput['billingCycle'];
    classes?: number;
  }[] = [
    { name: 'Mensual Libre', price: '32000.00', cycle: 'MONTHLY' },
    { name: 'Mensual 3 por semana', price: '26000.00', cycle: 'MONTHLY' },
    { name: 'Trimestral Libre', price: '86000.00', cycle: 'QUARTERLY' },
    { name: 'Pack 10 clases', price: '20000.00', cycle: 'CLASS_PACK', classes: 10 },
  ];

  const plans = await Promise.all(
    planDefs.map((p, i) =>
      prisma.plan.create({
        data: {
          id: fixedId(7, i + 1),
          gymId: gym.id,
          name: p.name,
          price: p.price,
          billingCycle: p.cycle,
          ...(p.classes ? { classesIncluded: p.classes } : {}),
          ...(p.name.includes('3 por semana') ? { weeklyAccessLimit: 3 } : {}),
          activities: {
            create: activities.map((a) => ({ gymId: gym.id, activityId: a.id })),
          },
        },
      }),
    ),
  );

  // ── Configuración de caja ─────────────────────────────────────────────────
  const paymentMethodDefs = [
    { code: 'CASH', name: 'Efectivo', countsAsCash: true },
    { code: 'DEBIT', name: 'Débito', countsAsCash: false },
    { code: 'CREDIT', name: 'Crédito', countsAsCash: false },
    { code: 'TRANSFER', name: 'Transferencia', countsAsCash: false },
    { code: 'QR', name: 'QR / Billetera', countsAsCash: false },
  ];
  const paymentMethods = await Promise.all(
    paymentMethodDefs.map((m, i) =>
      prisma.paymentMethod.create({
        data: { id: fixedId(8, i + 1), gymId: gym.id, sortOrder: i, ...m },
      }),
    ),
  );
  const cash = paymentMethods[0]!;

  const conceptDefs = [
    { code: 'MEMBERSHIP', name: 'Cobro de cuota', type: 'INCOME' as const, isSystem: true },
    { code: 'DEBT_PAYMENT', name: 'Pago de deuda', type: 'INCOME' as const, isSystem: true },
    { code: 'SALE', name: 'Venta', type: 'INCOME' as const, isSystem: false },
    { code: 'OTHER_INCOME', name: 'Otro ingreso', type: 'INCOME' as const, isSystem: false },
    { code: 'REFUND', name: 'Reintegro', type: 'EXPENSE' as const, isSystem: true },
    { code: 'SUPPLIER', name: 'Proveedor', type: 'EXPENSE' as const, isSystem: false },
    { code: 'SALARY', name: 'Sueldos', type: 'EXPENSE' as const, isSystem: false },
    { code: 'CLEANING', name: 'Limpieza', type: 'EXPENSE' as const, isSystem: false },
    { code: 'OTHER_EXPENSE', name: 'Otro egreso', type: 'EXPENSE' as const, isSystem: false },
  ];
  const concepts = await Promise.all(
    conceptDefs.map((c, i) =>
      prisma.cashConcept.create({ data: { id: fixedId(9, i + 1), gymId: gym.id, ...c } }),
    ),
  );
  const conceptByCode = new Map(concepts.map((c) => [c.code, c]));

  const registers = await Promise.all(
    [centro, norte].map((b, i) =>
      prisma.cashRegister.create({
        data: { id: fixedId(10, i + 1), gymId: gym.id, branchId: b.id, name: `Caja ${b.name}` },
      }),
    ),
  );

  // ── Socios ────────────────────────────────────────────────────────────────
  const firstNames = [
    'Lucía',
    'Mateo',
    'Sofía',
    'Benjamín',
    'Valentina',
    'Joaquín',
    'Emma',
    'Thiago',
    'Martina',
    'Bautista',
    'Catalina',
    'Lautaro',
    'Julieta',
    'Santino',
    'Renata',
    'Ignacio',
    'Delfina',
    'Tomás',
    'Isabella',
    'Facundo',
  ];
  const lastNames = [
    'Gómez',
    'Fernández',
    'Rodríguez',
    'López',
    'Martínez',
    'Pérez',
    'García',
    'Sánchez',
    'Romero',
    'Torres',
    'Álvarez',
    'Ruiz',
    'Díaz',
    'Silva',
    'Acosta',
    'Medina',
    'Herrera',
    'Aguirre',
    'Molina',
    'Castro',
  ];

  type Cohort = 'ACTIVE' | 'EXPIRED' | 'DEBT' | 'INACTIVE';
  const cohorts: Cohort[] = [
    ...Array<Cohort>(25).fill('ACTIVE'),
    ...Array<Cohort>(8).fill('EXPIRED'),
    ...Array<Cohort>(5).fill('DEBT'),
    ...Array<Cohort>(2).fill('INACTIVE'),
  ];

  const memberIds: string[] = [];

  for (const [i, cohort] of cohorts.entries()) {
    const n = i + 1;
    const memberId = fixedId(11, n);
    memberIds.push(memberId);

    const member = await prisma.member.create({
      data: {
        id: memberId,
        gymId: gym.id,
        memberNumber: n,
        firstName: firstNames[i % firstNames.length]!,
        lastName: lastNames[(i * 7) % lastNames.length]!,
        documentType: 'DNI',
        documentNumber: String(DOC_BASE + n),
        email: `socio${n}@demo.local`,
        // Números del rango de prueba, no corresponden a nadie real.
        phone: `+54911${String(50_000_000 + n).slice(0, 8)}`,
        branchId: i % 3 === 0 ? norte.id : centro.id,
        status: cohort === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        ...(cohort === 'INACTIVE'
          ? { deactivatedAt: day(-20), deactivatedReason: 'Se mudó de barrio' }
          : {}),
        birthDate: dateOnly(new Date(1985 + (i % 20), i % 12, ((i * 3) % 27) + 1)),
        medicalClearanceUntil: cohort === 'ACTIVE' ? dateOnly(day(180)) : null,
      },
    });

    if (cohort === 'INACTIVE') continue;

    const planIndex = i % plans.length;
    const chosenPlan = plans[planIndex]!;
    const start = cohort === 'EXPIRED' ? day(-75) : day(-(i % 25));
    const end = new Date(start.getTime() + 29 * 86_400_000);

    const membership = await prisma.membership.create({
      data: {
        id: fixedId(12, n),
        gymId: gym.id,
        memberId: member.id,
        planId: chosenPlan.id,
        branchId: member.branchId,
        status: cohort === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE',
        startDate: dateOnly(start),
        endDate: chosenPlan.billingCycle === 'CLASS_PACK' ? null : dateOnly(end),
        pricePaid: chosenPlan.price.toString(),
        ...(chosenPlan.classesIncluded
          ? {
              classesIncluded: chosenPlan.classesIncluded,
              classesRemaining: Math.max(0, chosenPlan.classesIncluded - (i % 5)),
            }
          : {}),
      },
    });

    // Cargo de la membresía en la cuenta corriente.
    const price = chosenPlan.price.toString();
    await prisma.ledgerEntry.create({
      data: {
        id: fixedId(13, n),
        gymId: gym.id,
        memberId: member.id,
        branchId: member.branchId,
        type: 'DEBIT',
        reason: 'MEMBERSHIP_CHARGE',
        amount: price,
        balanceAfter: `-${price}`,
        membershipId: membership.id,
        description: `Cuota ${chosenPlan.name}`,
        createdByUserId: recepcionId,
      },
    });

    if (cohort === 'DEBT') {
      // Queda debiendo: sólo el cargo, sin pago.
      await prisma.member.update({
        where: { id: member.id },
        data: { balance: `-${price}` },
      });
    } else {
      // Pagó: se registra el crédito y el saldo vuelve a cero.
      await prisma.ledgerEntry.create({
        data: {
          id: fixedId(14, n),
          gymId: gym.id,
          memberId: member.id,
          branchId: member.branchId,
          type: 'CREDIT',
          reason: 'PAYMENT',
          amount: price,
          balanceAfter: '0.00',
          membershipId: membership.id,
          description: 'Pago de cuota',
          createdByUserId: recepcionId,
        },
      });
    }
  }

  // ── Asistencias de los últimos 30 días ────────────────────────────────────
  // Distribución realista: más gente a la tarde, menos los domingos.
  const attendanceRows: Prisma.AttendanceCreateManyInput[] = [];
  let attendanceSeq = 0;
  for (let d = 29; d >= 0; d--) {
    const date = day(-d);
    const weekday = date.getUTCDay();
    const factor = weekday === 0 ? 0.2 : weekday === 6 ? 0.5 : 1;
    const count = Math.round(8 * factor);
    for (let k = 0; k < count; k++) {
      // Índice pseudo-aleatorio pero determinístico.
      const idx = (d * 13 + k * 7) % 33;
      const memberId = memberIds[idx]!;
      const branchId = idx % 3 === 0 ? norte.id : centro.id;
      const key = `${memberId}|${branchId}|${date.toISOString().slice(0, 10)}`;
      if (
        attendanceRows.some((r) => `${r.memberId}|${r.branchId}|${String(r.occurredOn)}` === key)
      ) {
        continue;
      }
      attendanceSeq += 1;
      attendanceRows.push({
        id: fixedId(15, attendanceSeq),
        gymId: gym.id,
        branchId,
        memberId,
        method: 'DOCUMENT',
        occurredOn: dateOnly(date),
        occurredAt: new Date(date.getTime() + (17 + (k % 4)) * 3_600_000),
      });
    }
  }
  await prisma.attendance.createMany({ data: attendanceRows, skipDuplicates: true });

  // ── Caja: una sesión cerrada de ayer y una abierta hoy ────────────────────
  const yesterdaySession = await prisma.cashSession.create({
    data: {
      id: fixedId(16, 1),
      gymId: gym.id,
      branchId: centro.id,
      cashRegisterId: registers[0]!.id,
      status: 'CLOSED',
      openedByUserId: recepcionId,
      openedAt: new Date(day(-1).setUTCHours(12, 0, 0, 0)),
      openingAmount: '20000.00',
      closedByUserId: recepcionId,
      closedAt: new Date(day(-1).setUTCHours(23, 0, 0, 0)),
      businessDate: dateOnly(day(-1)),
      expectedCash: '182000.00',
      declaredCash: '182000.00',
      cashDifference: '0.00',
      closingNotes: 'Cierre sin diferencias.',
    },
  });

  const movementDefs: { type: 'INCOME' | 'EXPENSE'; amount: string; concept: string }[] = [
    { type: 'INCOME', amount: '32000.00', concept: 'MEMBERSHIP' },
    { type: 'INCOME', amount: '32000.00', concept: 'MEMBERSHIP' },
    { type: 'INCOME', amount: '26000.00', concept: 'MEMBERSHIP' },
    { type: 'INCOME', amount: '20000.00', concept: 'MEMBERSHIP' },
    { type: 'INCOME', amount: '32000.00', concept: 'MEMBERSHIP' },
    { type: 'INCOME', amount: '8500.00', concept: 'SALE' },
    { type: 'INCOME', amount: '4200.00', concept: 'SALE' },
    { type: 'INCOME', amount: '26000.00', concept: 'DEBT_PAYMENT' },
    { type: 'INCOME', amount: '32000.00', concept: 'MEMBERSHIP' },
    { type: 'INCOME', amount: '15000.00', concept: 'OTHER_INCOME' },
    { type: 'EXPENSE', amount: '12000.00', concept: 'CLEANING' },
    { type: 'EXPENSE', amount: '25000.00', concept: 'SUPPLIER' },
    { type: 'EXPENSE', amount: '8700.00', concept: 'SUPPLIER' },
    { type: 'EXPENSE', amount: '5000.00', concept: 'OTHER_EXPENSE' },
    { type: 'INCOME', amount: '6000.00', concept: 'SALE' },
  ];

  await prisma.cashMovement.createMany({
    data: movementDefs.map((m, i) => ({
      id: fixedId(17, i + 1),
      gymId: gym.id,
      cashSessionId: yesterdaySession.id,
      type: m.type,
      amount: m.amount,
      paymentMethodId: cash.id,
      cashConceptId: conceptByCode.get(m.concept)!.id,
      createdByUserId: recepcionId,
      createdAt: new Date(day(-1).setUTCHours(13 + (i % 9), (i * 7) % 60, 0, 0)),
      description: null,
    })),
  });

  await prisma.cashSession.create({
    data: {
      id: fixedId(16, 2),
      gymId: gym.id,
      branchId: centro.id,
      cashRegisterId: registers[0]!.id,
      status: 'OPEN',
      openedByUserId: recepcionId,
      openedAt: TODAY,
      openingAmount: '20000.00',
      businessDate: dateOnly(TODAY),
    },
  });

  // ── Plantillas de mensajería ──────────────────────────────────────────────
  await prisma.messageTemplate.createMany({
    data: [
      {
        id: fixedId(18, 1),
        gymId: gym.id,
        kind: 'PAYMENT_RECEIPT',
        channel: 'WHATSAPP',
        name: 'Recibo de pago',
        body:
          'Hola {{nombre}}! Recibimos tu pago de {{importe}} por {{concepto}}. ' +
          'Tu cuota vence el {{vencimiento}}. Gracias por entrenar en {{gimnasio}}.',
      },
      {
        id: fixedId(18, 2),
        gymId: gym.id,
        kind: 'DEBT_REMINDER',
        channel: 'WHATSAPP',
        name: 'Recordatorio de deuda',
        body:
          'Hola {{nombre}}, te recordamos que tenés un saldo pendiente de {{deuda}} ' +
          'en {{gimnasio}}. Podés abonarlo en recepción. ¡Gracias!',
      },
    ],
  });

  void adminId;

  const counts = {
    gimnasios: await prisma.gym.count(),
    sedes: await prisma.branch.count(),
    usuarios: await prisma.user.count(),
    roles: await prisma.role.count(),
    socios: await prisma.member.count(),
    planes: await prisma.plan.count(),
    membresías: await prisma.membership.count(),
    asistencias: await prisma.attendance.count(),
    movimientosDeCaja: await prisma.cashMovement.count(),
  };

  // eslint-disable-next-line no-console
  console.log('Seed listo:', counts);
  // eslint-disable-next-line no-console
  console.log(`\nUsuarios de demo (contraseña: ${DEMO_PASSWORD}):`);
  for (const u of users) {
    // eslint-disable-next-line no-console
    console.log(`  ${u.email.padEnd(24)} ${u.role}`);
  }
}

main()
  .catch((e: unknown) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
