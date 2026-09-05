import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, seedMinimalGym, type TestDatabase } from '@pulso/db/testing';
import pino from 'pino';
import { expireMemberships } from './membership-expiration.js';
import { processMessageJob } from './send-message.js';
import type { MessagingProvider, SendResult } from '../lib/messaging-provider.js';
import type { Job } from 'bullmq';

const logger = pino({ level: 'silent' });

let db: TestDatabase;
let gymId: string;
let branchId: string;
let memberId: string;
let planId: string;

beforeAll(async () => {
  db = await createTestDatabase('worker');
  const { gym, branch } = await seedMinimalGym(db.raw, { slug: 'worker-gym' });
  gymId = gym.id;
  branchId = branch.id;

  const member = await db.raw.member.create({
    data: {
      gymId,
      memberNumber: 1,
      firstName: 'Test',
      lastName: 'Socio',
      documentType: 'DNI',
      documentNumber: '90000900',
      branchId,
    },
  });
  memberId = member.id;

  const plan = await db.raw.plan.create({
    data: { gymId, name: 'Mensual', price: '10000.00', billingCycle: 'MONTHLY' },
  });
  planId = plan.id;
}, 180_000);

afterAll(async () => {
  await db?.destroy();
});

beforeEach(async () => {
  await db.raw.membership.deleteMany({});
  await db.raw.messageJob.deleteMany({});
});

describe('vencimiento de membresías', () => {
  const createMembership = (endDate: string | null, over: Record<string, unknown> = {}) =>
    db.raw.membership.create({
      data: {
        gymId,
        memberId,
        planId,
        branchId,
        status: 'ACTIVE',
        startDate: new Date('2026-01-01'),
        endDate: endDate ? new Date(endDate) : null,
        pricePaid: '10000.00',
        ...over,
      },
    });

  it('vence una membresía cuyo fin ya pasó', async () => {
    const m = await createMembership('2026-01-30');
    await expireMemberships({ prisma: db.raw, logger, now: new Date('2026-02-05T12:00:00Z') });
    const after = await db.raw.membership.findUniqueOrThrow({ where: { id: m.id } });
    expect(after.status).toBe('EXPIRED');
  });

  it('NO vence una membresía que termina hoy', async () => {
    const m = await createMembership('2026-02-05');
    await expireMemberships({ prisma: db.raw, logger, now: new Date('2026-02-05T12:00:00Z') });
    const after = await db.raw.membership.findUniqueOrThrow({ where: { id: m.id } });
    expect(after.status).toBe('ACTIVE');
  });

  it('a las 21:00 UTC de un día, en Buenos Aires todavía es el día anterior: no vence', async () => {
    // 2026-02-05 21:00 UTC === 2026-02-05 18:00 -03:00. La membresía que termina
    // el 5 sigue vigente. Si el job comparara contra UTC del día siguiente,
    // dejaría afuera a alguien que todavía tiene derecho a entrar.
    const m = await createMembership('2026-02-05');
    await expireMemberships({ prisma: db.raw, logger, now: new Date('2026-02-05T21:00:00Z') });
    const after = await db.raw.membership.findUniqueOrThrow({ where: { id: m.id } });
    expect(after.status).toBe('ACTIVE');
  });

  it('vence un pack de clases agotado, aunque no tenga fecha de fin', async () => {
    const m = await createMembership(null, { classesIncluded: 10, classesRemaining: 0 });
    await expireMemberships({ prisma: db.raw, logger, now: new Date('2026-02-05T12:00:00Z') });
    const after = await db.raw.membership.findUniqueOrThrow({ where: { id: m.id } });
    expect(after.status).toBe('EXPIRED');
  });

  it('NO vence un pack con clases restantes', async () => {
    const m = await createMembership(null, { classesIncluded: 10, classesRemaining: 3 });
    await expireMemberships({ prisma: db.raw, logger, now: new Date('2026-02-05T12:00:00Z') });
    const after = await db.raw.membership.findUniqueOrThrow({ where: { id: m.id } });
    expect(after.status).toBe('ACTIVE');
  });

  it('es idempotente: dos corridas dejan el mismo resultado', async () => {
    await createMembership('2026-01-30');
    const first = await expireMemberships({
      prisma: db.raw,
      logger,
      now: new Date('2026-02-05T12:00:00Z'),
    });
    const second = await expireMemberships({
      prisma: db.raw,
      logger,
      now: new Date('2026-02-05T12:00:00Z'),
    });
    expect(first.membershipsExpired).toBe(1);
    expect(second.membershipsExpired).toBe(0);
  });

  it('no aplica el dia de otra sede del mismo gimnasio', async () => {
    const west = await db.raw.branch.create({
      data: {
        gymId,
        name: 'Sede oeste',
        timezone: 'Pacific/Honolulu',
      },
    });
    const m = await createMembership('2026-02-05', { branchId: west.id });
    // Buenos Aires ya esta en el 6; Honolulu sigue en el 5.
    await expireMemberships({ prisma: db.raw, logger, now: new Date('2026-02-06T04:00:00Z') });
    expect((await db.raw.membership.findUniqueOrThrow({ where: { id: m.id } })).status).toBe(
      'ACTIVE',
    );
  });
});

describe('envío de mensajes', () => {
  const makeProvider = (result: SendResult): MessagingProvider => ({
    name: 'test',
    send: vi.fn().mockResolvedValue(result),
  });

  const makeJob = (resourceId: string | undefined) =>
    ({ id: 'job-1', data: { resourceId } }) as unknown as Job;

  const createMessageJob = (over: Record<string, unknown> = {}) =>
    db.raw.messageJob.create({
      data: {
        gymId,
        memberId,
        channel: 'WHATSAPP',
        destination: '+5491155555555',
        body: 'Hola',
        dedupeKey: `k-${Math.random()}`,
        ...over,
      },
    });

  it('marca SENT y guarda el id externo', async () => {
    const record = await createMessageJob();
    const provider = makeProvider({ status: 'sent', externalId: 'ext-1' });
    await processMessageJob({ prisma: db.raw, provider, logger, job: makeJob(record.id) });

    const after = await db.raw.messageJob.findUniqueOrThrow({ where: { id: record.id } });
    expect(after.status).toBe('SENT');
    expect(after.externalId).toBe('ext-1');
    expect(after.sentAt).not.toBeNull();
  });

  it('un rechazo no reintentable termina en FAILED sin relanzar', async () => {
    const record = await createMessageJob();
    const provider = makeProvider({
      status: 'rejected',
      reason: 'número inválido',
      retryable: false,
    });
    await expect(
      processMessageJob({ prisma: db.raw, provider, logger, job: makeJob(record.id) }),
    ).resolves.toBeUndefined();

    const after = await db.raw.messageJob.findUniqueOrThrow({ where: { id: record.id } });
    expect(after.status).toBe('FAILED');
  });

  it('un fallo transitorio relanza para que BullMQ aplique el backoff', async () => {
    const record = await createMessageJob();
    const provider = makeProvider({ status: 'failed', reason: 'timeout', retryable: true });
    await expect(
      processMessageJob({ prisma: db.raw, provider, logger, job: makeJob(record.id) }),
    ).rejects.toThrow('timeout');

    const after = await db.raw.messageJob.findUniqueOrThrow({ where: { id: record.id } });
    expect(after.status).toBe('QUEUED');
    expect(after.attempts).toBe(1);
  });

  it('no reenvía un mensaje ya enviado', async () => {
    const record = await createMessageJob({ status: 'SENT', sentAt: new Date() });
    const provider = makeProvider({ status: 'sent', externalId: 'no-deberia' });
    await processMessageJob({ prisma: db.raw, provider, logger, job: makeJob(record.id) });
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('no envía un mensaje cancelado', async () => {
    const record = await createMessageJob({ status: 'CANCELLED', cancelledReason: 'sin teléfono' });
    const provider = makeProvider({ status: 'sent', externalId: 'no-deberia' });
    await processMessageJob({ prisma: db.raw, provider, logger, job: makeJob(record.id) });
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('un job sin resourceId se descarta sin romper', async () => {
    const provider = makeProvider({ status: 'sent', externalId: 'x' });
    await expect(
      processMessageJob({ prisma: db.raw, provider, logger, job: makeJob(undefined) }),
    ).resolves.toBeUndefined();
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('el dedupeKey impide encolar dos veces el mismo mensaje', async () => {
    await createMessageJob({ dedupeKey: 'receipt:mov-1' });
    await expect(createMessageJob({ dedupeKey: 'receipt:mov-1' })).rejects.toThrow();
  });
});
