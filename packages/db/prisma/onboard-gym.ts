import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { SYSTEM_ROLE_CODES, SYSTEM_ROLE_PERMISSIONS } from '@pulso/contracts';

loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

/**
 * Alta de un gimnasio real (no demo).
 *
 * A diferencia de `seed.ts`, esto no carga socios, planes ni historial
 * ficticio: sólo el tenant, la sede, los roles de sistema y un usuario OWNER.
 * El catálogo (actividades, planes, precios) lo carga el dueño desde la app,
 * porque es información de su negocio, no algo que debamos inventar.
 *
 * La contraseña del admin nunca vive en el repo: se pasa por variable de
 * entorno en el momento de correr el script.
 */

const prisma = new PrismaClient();

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Falta la variable de entorno ${key}.`);
  }
  return value;
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'] ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`DATABASE_URL no apunta a localhost (${url}). Abortando por seguridad.`);
  }

  const gymName = process.env['ONBOARD_GYM_NAME'] ?? 'Darrosa';
  const gymSlug = process.env['ONBOARD_GYM_SLUG'] ?? slugify(gymName);
  const branchName = process.env['ONBOARD_BRANCH_NAME'] ?? gymName;
  const adminEmail = requireEnv('ONBOARD_ADMIN_EMAIL');
  const adminPassword = requireEnv('ONBOARD_ADMIN_PASSWORD');
  const adminFirstName = process.env['ONBOARD_ADMIN_FIRST_NAME'] ?? 'Admin';
  const adminLastName = process.env['ONBOARD_ADMIN_LAST_NAME'] ?? gymName;

  const already = await prisma.gym.findUnique({ where: { slug: gymSlug } });
  if (already) {
    // eslint-disable-next-line no-console
    console.log(`Ya existe un gimnasio con slug "${gymSlug}" (id ${already.id}). No se creó nada.`);
    return;
  }

  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const plan = await prisma.saasPlan.upsert({
    where: { code: 'PRO' },
    update: {},
    create: {
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

  const gym = await prisma.gym.create({
    data: {
      slug: gymSlug,
      name: gymName,
      legalName: gymName,
      saasPlanId: plan.id,
      currency: 'ARS',
      locale: 'es-AR',
      country: 'AR',
    },
  });

  const branch = await prisma.branch.create({
    data: {
      gymId: gym.id,
      name: branchName,
      timezone: 'America/Argentina/Buenos_Aires',
    },
  });

  await prisma.memberCounter.create({ data: { gymId: gym.id, last: 0 } });

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
  for (const code of SYSTEM_ROLE_CODES) {
    const label = ROLE_LABELS[code]!;
    const created = await prisma.role.create({
      data: {
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

  const admin = await prisma.user.create({
    data: {
      gymId: gym.id,
      email: adminEmail,
      passwordHash,
      firstName: adminFirstName,
      lastName: adminLastName,
      mustChangePassword: true,
      roleAssignments: { create: { gymId: gym.id, roleId: roles.get('OWNER')! } },
      branchAccess: { create: { gymId: gym.id, branchId: branch.id } },
    },
  });

  const paymentMethodDefs = [
    { code: 'CASH', name: 'Efectivo', countsAsCash: true },
    { code: 'DEBIT', name: 'Débito', countsAsCash: false },
    { code: 'CREDIT', name: 'Crédito', countsAsCash: false },
    { code: 'TRANSFER', name: 'Transferencia', countsAsCash: false },
    { code: 'QR', name: 'QR / Billetera', countsAsCash: false },
  ];
  await Promise.all(
    paymentMethodDefs.map((m, i) =>
      prisma.paymentMethod.create({ data: { gymId: gym.id, sortOrder: i, ...m } }),
    ),
  );

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
  await Promise.all(
    conceptDefs.map((c) => prisma.cashConcept.create({ data: { gymId: gym.id, ...c } })),
  );

  await prisma.cashRegister.create({
    data: { gymId: gym.id, branchId: branch.id, name: `Caja ${branch.name}` },
  });

  await prisma.messageTemplate.createMany({
    data: [
      {
        gymId: gym.id,
        kind: 'PAYMENT_RECEIPT',
        channel: 'WHATSAPP',
        name: 'Recibo de pago',
        body:
          'Hola {{nombre}}! Recibimos tu pago de {{importe}} por {{concepto}}. ' +
          'Tu cuota vence el {{vencimiento}}. Gracias por entrenar en {{gimnasio}}.',
      },
      {
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

  // eslint-disable-next-line no-console
  console.log(`Gimnasio "${gym.name}" creado (id ${gym.id}, slug "${gym.slug}").`);
  // eslint-disable-next-line no-console
  console.log(`Sede: ${branch.name} (id ${branch.id}).`);
  // eslint-disable-next-line no-console
  console.log(`Usuario OWNER: ${admin.email}. Debe cambiar la contraseña en el primer login.`);
}

main()
  .catch((e: unknown) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
