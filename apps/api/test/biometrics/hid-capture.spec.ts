import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, seedGymWithUsers, TestClient, type TestApp } from '../harness.js';

/**
 * Captura HID desde el navegador (WebSDK → API → matcher → PostgreSQL):
 * enrolamiento multi-muestra, identificación con asistencia, anti doble
 * asistencia, trazabilidad sin biometría y aislamiento por gimnasio.
 *
 * Corre contra la app real y un esquema PostgreSQL efímero (ADR-023). El
 * matcher es `TemplateEqualityMatcher` (sin BIOMETRIC_MATCHER_URL): dos
 * muestras iguales matchean 100, distintas 0 — suficiente para probar el
 * pipeline, jamás para huellas reales.
 */

let ctx: TestApp;
let gymA: Awaited<ReturnType<typeof seedGymWithUsers>>;
let gymB: Awaited<ReturnType<typeof seedGymWithUsers>>;
let crmA: TestClient;
let crmB: TestClient;

beforeAll(async () => {
  ctx = await createTestApp('hid-capture');
  gymA = await seedGymWithUsers(ctx.db, { slug: 'hid-gym-a' });
  gymB = await seedGymWithUsers(ctx.db, { slug: 'hid-gym-b' });
  crmA = new TestClient(ctx.baseUrl);
  crmB = new TestClient(ctx.baseUrl);
  await login(crmA, gymA.users['OWNER']!.email, gymA.password);
  await login(crmB, gymB.users['OWNER']!.email, gymB.password);
}, 120_000);

afterAll(async () => {
  await ctx.close();
});

async function login(client: TestClient, email: string, password: string): Promise<void> {
  const res = await client.post('/api/v1/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`login falló: ${res.status}`);
}

/** "PNG" determinístico por semilla: bytes arbitrarios, no una huella. */
function samplePng(seed: string, size = 4_096): string {
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < size; i += 1) buffer[i] = (seed.charCodeAt(i % seed.length) + i) % 256;
  return buffer.toString('base64');
}

function trace(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sessionId: randomUUID(),
    deviceUid: '{5A6D5B29-6B2A-4C67-9D10-0A0B0C0D0E0F}',
    readerModel: 'HID DigitalPersona U.are.U 4500',
    acquisitionStartedAt: new Date(Date.now() - 5_000).toISOString(),
    acquiredAt: new Date().toISOString(),
    sampleBytes: 4_096,
    webSdkVersion: '1.1.0',
    fingerprintSdkVersion: '1.0.0',
    ...overrides,
  };
}

async function createMember(client: TestClient, firstName: string, branchId: string) {
  const res = await client.post(
    '/api/v1/members',
    {
      firstName,
      lastName: 'HID',
      documentType: 'DNI',
      documentNumber: String(Math.floor(10_000_000 + Math.random() * 80_000_000)),
      branchId,
    },
    { 'idempotency-key': randomUUID() },
  );
  expect(res.status).toBe(201);
  return (res.body as { id: string }).id;
}

async function grantConsent(client: TestClient, memberId: string) {
  const res = await client.post(`/api/v1/members/${memberId}/biometrics/consent`, {
    version: 'v1-test',
    grantedMethod: 'IN_PERSON_SIGNED',
  });
  expect(res.status).toBe(201);
}

async function startEnrollment(client: TestClient, memberId: string, branchId: string) {
  const res = await client.post(
    `/api/v1/members/${memberId}/biometrics/hid-enrollments`,
    { branchId, fingerPosition: 'RIGHT_INDEX' },
    { 'idempotency-key': randomUUID() },
  );
  expect(res.status).toBe(201);
  return res.body as { enrollmentId: string; samplesRequired: number; minQuality: number };
}

async function enrollWithSamples(
  client: TestClient,
  memberId: string,
  branchId: string,
  samples: string[],
  sessionId = randomUUID(),
) {
  const started = await startEnrollment(client, memberId, branchId);
  const res = await client.post(
    `/api/v1/biometrics/hid-enrollments/${started.enrollmentId}/complete`,
    {
      samples: samples.map((pngBase64) => ({ pngBase64, qualityCode: 0 })),
      capture: trace({ sessionId }),
    },
  );
  return { started, res, sessionId };
}

async function giveActiveMembership(memberId: string, gymId: string, branchId: string) {
  const plan = await ctx.db.raw.plan.create({
    data: {
      gymId,
      name: `Plan HID ${randomUUID().slice(0, 6)}`,
      price: '1000.00',
      billingCycle: 'MONTHLY',
    },
  });
  const today = new Date();
  const start = new Date(today.getTime() - 5 * 86_400_000);
  const end = new Date(today.getTime() + 25 * 86_400_000);
  await ctx.db.raw.membership.create({
    data: {
      gymId,
      memberId,
      planId: plan.id,
      branchId,
      startDate: start,
      endDate: end,
      pricePaid: '1000.00',
    },
  });
}

describe('HID web — enrolamiento multi-muestra', () => {
  it('start informa samplesRequired ≥ 1 según configuración', async () => {
    const memberId = await createMember(crmA, 'Config', gymA.branch.id);
    await grantConsent(crmA, memberId);
    const started = await startEnrollment(crmA, memberId, gymA.branch.id);
    expect(started.samplesRequired).toBeGreaterThanOrEqual(1);
    expect(started.samplesRequired).toBeLessThanOrEqual(3);
  });

  it('dos muestras consistentes crean UNA credencial cifrada, informan calidad y quedan trazadas', async () => {
    const memberId = await createMember(crmA, 'DosMuestras', gymA.branch.id);
    await grantConsent(crmA, memberId);
    const png = samplePng('dos-muestras');
    const { started, res, sessionId } = await enrollWithSamples(crmA, memberId, gymA.branch.id, [
      png,
      png,
    ]);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      credential: { samplesUsed: 2, consistencyScore: 100 },
    });
    const credentialId = (res.body as { credential: { id: string } }).credential.id;

    const listed = await crmA.get(`/api/v1/members/${memberId}/biometrics/credentials`);
    expect(listed.status).toBe(200);
    const credentials = (
      listed.body as { data: Array<{ id: string; status: string; enrollmentId: string }> }
    ).data;
    expect(credentials).toHaveLength(1);
    expect(credentials[0]).toMatchObject({
      id: credentialId,
      status: 'ACTIVE',
      enrollmentId: started.enrollmentId,
    });

    const enrollment = await ctx.db.raw.biometricEnrollment.findUnique({
      where: { id: started.enrollmentId },
    });
    expect(enrollment?.status).toBe('COMPLETED');
    expect(enrollment?.samplesCaptured).toBe(2);
    expect(enrollment?.qualityScores).toHaveLength(2);

    const events = await ctx.db.raw.biometricCaptureEvent.findMany({
      where: { sessionId },
      orderBy: { occurredAt: 'asc' },
    });
    const stages = events.map((e) => e.stage);
    expect(stages).toEqual(
      expect.arrayContaining(['SAMPLE_RECEIVED', 'EXTRACTED', 'ENROLLMENT_COMPLETED']),
    );
    expect(events.every((e) => e.gymId === gymA.gym.id && e.branchId === gymA.branch.id)).toBe(
      true,
    );
    expect(events.every((e) => e.source === 'api')).toBe(true);
    expect(events.find((e) => e.stage === 'ENROLLMENT_COMPLETED')?.enrollmentId).toBe(
      started.enrollmentId,
    );
  });

  it('muestras que no se reconocen entre sí → 422 ENROLLMENT_SAMPLES_INCONSISTENT y la sesión queda FAILED', async () => {
    const memberId = await createMember(crmA, 'Inconsistente', gymA.branch.id);
    await grantConsent(crmA, memberId);
    const { started, res, sessionId } = await enrollWithSamples(crmA, memberId, gymA.branch.id, [
      samplePng('dedo-a'),
      samplePng('dedo-b'),
    ]);

    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe('ENROLLMENT_SAMPLES_INCONSISTENT');
    const enrollment = await ctx.db.raw.biometricEnrollment.findUnique({
      where: { id: started.enrollmentId },
    });
    expect(enrollment?.status).toBe('FAILED');
    expect(await ctx.db.raw.biometricCredential.count({ where: { memberId } })).toBe(0);
    const failed = await ctx.db.raw.biometricCaptureEvent.findFirst({
      where: { sessionId, stage: 'ENROLLMENT_FAILED' },
    });
    expect(failed?.severity).toBe('WARN');
  });

  it('la forma legada (pngBase64 + qualityCode) sigue enrolando con una muestra', async () => {
    const memberId = await createMember(crmA, 'Legado', gymA.branch.id);
    await grantConsent(crmA, memberId);
    const started = await startEnrollment(crmA, memberId, gymA.branch.id);
    const res = await crmA.post(
      `/api/v1/biometrics/hid-enrollments/${started.enrollmentId}/complete`,
      {
        pngBase64: samplePng('legado'),
        qualityCode: 0,
      },
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      credential: { samplesUsed: 1, consistencyScore: null },
    });
  });

  it('una muestra con calidad HID distinta de Good se rechaza sin crear credencial', async () => {
    const memberId = await createMember(crmA, 'MalaCalidad', gymA.branch.id);
    await grantConsent(crmA, memberId);
    const started = await startEnrollment(crmA, memberId, gymA.branch.id);
    const res = await crmA.post(
      `/api/v1/biometrics/hid-enrollments/${started.enrollmentId}/complete`,
      {
        samples: [{ pngBase64: samplePng('mala'), qualityCode: 7 }],
      },
    );
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe('TEMPLATE_QUALITY_TOO_LOW');
    expect(await ctx.db.raw.biometricCredential.count({ where: { memberId } })).toBe(0);
  });
});

describe('HID web — identificación y asistencia', () => {
  it('huella enrolada + membresía activa → ALLOWED, AccessAttempt y Attendance; la segunda lectura no duplica', async () => {
    const memberId = await createMember(crmA, 'Asiste', gymA.branch.id);
    await grantConsent(crmA, memberId);
    await giveActiveMembership(memberId, gymA.gym.id, gymA.branch.id);
    const png = samplePng('asiste');
    const enrolled = await enrollWithSamples(crmA, memberId, gymA.branch.id, [png, png]);
    expect(enrolled.res.status).toBe(200);

    const sessionId = randomUUID();
    const first = await crmA.post(
      '/api/v1/biometrics/hid-identifications',
      { branchId: gymA.branch.id, pngBase64: png, qualityCode: 0, capture: trace({ sessionId }) },
      { 'idempotency-key': randomUUID() },
    );
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      decision: 'ALLOWED',
      reasonCode: 'OK',
      member: { id: memberId, firstName: 'Asiste' },
      attendanceRegistered: true,
    });

    const second = await crmA.post(
      '/api/v1/biometrics/hid-identifications',
      { branchId: gymA.branch.id, pngBase64: png, qualityCode: 0, capture: trace({ sessionId }) },
      { 'idempotency-key': randomUUID() },
    );
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({
      decision: 'ALLOWED',
      reasonCode: 'DUPLICATE_WINDOW',
      member: { id: memberId },
      attendanceRegistered: false,
    });

    expect(await ctx.db.raw.attendance.count({ where: { memberId } })).toBe(1);
    const attempts = await ctx.db.raw.accessAttempt.findMany({
      where: { memberId, method: 'FINGERPRINT' },
      orderBy: { occurredAt: 'asc' },
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.matchScore).toBe(100);
    expect(attempts[0]?.attendanceId).not.toBeNull();
    expect(attempts[1]?.attendanceId).toBeNull();

    const events = await ctx.db.raw.biometricCaptureEvent.findMany({
      where: { sessionId },
      orderBy: { occurredAt: 'asc' },
    });
    const stages = events.map((e) => e.stage);
    expect(stages).toEqual(
      expect.arrayContaining([
        'SAMPLE_RECEIVED',
        'EXTRACTED',
        'MATCHED',
        'ACCESS_RESULT',
        'ATTENDANCE_REGISTERED',
      ]),
    );
    const result = events.find((e) => e.stage === 'ACCESS_RESULT');
    expect(result?.accessAttemptId).toBe(attempts[0]!.id);
    expect(result?.memberId).toBe(memberId);
    expect(result?.deviceUid).toBe('{5A6D5B29-6B2A-4C67-9D10-0A0B0C0D0E0F}');
  });

  it('huella no registrada → DENIED BIOMETRIC_NO_MATCH con AccessAttempt y traza NO_MATCH', async () => {
    const sessionId = randomUUID();
    const res = await crmA.post(
      '/api/v1/biometrics/hid-identifications',
      {
        branchId: gymA.branch.id,
        pngBase64: samplePng('desconocida'),
        qualityCode: 0,
        capture: trace({ sessionId }),
      },
      { 'idempotency-key': randomUUID() },
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      decision: 'DENIED',
      reasonCode: 'BIOMETRIC_NO_MATCH',
      member: null,
    });
    const attemptId = (res.body as { accessAttemptId: string }).accessAttemptId;
    const attempt = await ctx.db.raw.accessAttempt.findUnique({ where: { id: attemptId } });
    expect(attempt?.reasonCode).toBe('BIOMETRIC_NO_MATCH');
    expect(attempt?.memberId).toBeNull();
    const noMatch = await ctx.db.raw.biometricCaptureEvent.findFirst({
      where: { sessionId, stage: 'NO_MATCH' },
    });
    expect(noMatch?.accessAttemptId).toBe(attemptId);
  });

  it('calidad HID insuficiente → DENIED BIOMETRIC_CAPTURE_FAILED, con AccessAttempt (no un 422)', async () => {
    const sessionId = randomUUID();
    const res = await crmA.post(
      '/api/v1/biometrics/hid-identifications',
      {
        branchId: gymA.branch.id,
        pngBase64: samplePng('mala-calidad'),
        qualityCode: 21,
        capture: trace({ sessionId }),
      },
      { 'idempotency-key': randomUUID() },
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      decision: 'DENIED',
      reasonCode: 'BIOMETRIC_CAPTURE_FAILED',
      member: null,
    });
    const attemptId = (res.body as { accessAttemptId: string }).accessAttemptId;
    const attempt = await ctx.db.raw.accessAttempt.findUnique({ where: { id: attemptId } });
    expect(attempt?.detail).toMatch(/WetFinger|21/);
    const failed = await ctx.db.raw.biometricCaptureEvent.findFirst({
      where: { sessionId, stage: 'EXTRACT_FAILED' },
    });
    expect(failed?.accessAttemptId).toBe(attemptId);
  });

  it('una sede de otro gimnasio no identifica: 404 y ninguna traza', async () => {
    const sessionId = randomUUID();
    const res = await crmB.post(
      '/api/v1/biometrics/hid-identifications',
      {
        branchId: gymA.branch.id,
        pngBase64: samplePng('x'),
        qualityCode: 0,
        capture: trace({ sessionId }),
      },
      { 'idempotency-key': randomUUID() },
    );
    expect(res.status).toBe(404);
    expect(await ctx.db.raw.biometricCaptureEvent.count({ where: { sessionId } })).toBe(0);
  });
});

describe('HID web — bitácora del navegador', () => {
  it('registra eventos sanitizados del navegador atados al gimnasio y sede de la sesión', async () => {
    const sessionId = randomUUID();
    const res = await crmA.post('/api/v1/biometrics/hid-capture-events', {
      branchId: gymA.branch.id,
      events: [
        {
          sessionId,
          stage: 'SESSION_STARTED',
          severity: 'INFO',
          message: 'Sesión iniciada',
          occurredAt: new Date().toISOString(),
          metadata: { mode: 'continuous', webSdkVersion: '1.1.0' },
        },
        {
          sessionId,
          stage: 'HID_ERROR',
          severity: 'ERROR',
          message: 'ADC informó un error',
          occurredAt: new Date().toISOString(),
          deviceUid: '{5A6D5B29-6B2A-4C67-9D10-0A0B0C0D0E0F}',
          metadata: { errorCode: 2147942405, errorCodeHex: '0x80070005' },
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ accepted: 2 });

    const rows = await ctx.db.raw.biometricCaptureEvent.findMany({
      where: { sessionId },
      orderBy: { occurredAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.gymId === gymA.gym.id && r.source === 'browser')).toBe(true);
    expect(rows[1]?.metadata).toEqual({ errorCode: 2147942405, errorCodeHex: '0x80070005' });
    expect(rows[1]?.userId).toBe(gymA.users['OWNER']!.id);
  });

  it('rechaza metadata con blobs largos (posible biometría) y sedes ajenas', async () => {
    const tooLong = await crmA.post('/api/v1/biometrics/hid-capture-events', {
      branchId: gymA.branch.id,
      events: [
        {
          sessionId: randomUUID(),
          stage: 'SAMPLE_RECEIVED',
          severity: 'INFO',
          message: 'muestra',
          occurredAt: new Date().toISOString(),
          metadata: { png: 'A'.repeat(1_000) },
        },
      ],
    });
    expect(tooLong.status).toBe(422);

    const sessionId = randomUUID();
    const foreign = await crmB.post('/api/v1/biometrics/hid-capture-events', {
      branchId: gymA.branch.id,
      events: [
        {
          sessionId,
          stage: 'SESSION_STARTED',
          severity: 'INFO',
          message: 'x',
          occurredAt: new Date().toISOString(),
        },
      ],
    });
    expect(foreign.status).toBe(404);
    expect(await ctx.db.raw.biometricCaptureEvent.count({ where: { sessionId } })).toBe(0);
  });

  it('ninguna tabla persiste la imagen de la huella', async () => {
    const memberId = await createMember(crmA, 'SinImagen', gymA.branch.id);
    await grantConsent(crmA, memberId);
    const png = samplePng('sin-imagen-persistida', 2_048);
    const marker = png.slice(100, 160);
    const enrolled = await enrollWithSamples(crmA, memberId, gymA.branch.id, [png, png]);
    expect(enrolled.res.status).toBe(200);
    await crmA.post(
      '/api/v1/biometrics/hid-identifications',
      { branchId: gymA.branch.id, pngBase64: png, qualityCode: 0, capture: trace() },
      { 'idempotency-key': randomUUID() },
    );

    const events = await ctx.db.raw.biometricCaptureEvent.findMany({
      where: { gymId: gymA.gym.id },
    });
    for (const event of events) {
      expect(JSON.stringify(event.metadata)).not.toContain(marker);
      expect(event.message).not.toContain(marker);
    }
    const attempts = await ctx.db.raw.accessAttempt.findMany({
      where: { gymId: gymA.gym.id, method: 'FINGERPRINT' },
    });
    for (const attempt of attempts) {
      expect(attempt.rawInput).toBeNull();
      expect(attempt.detail ?? '').not.toContain(marker);
    }
    const audits = await ctx.db.raw.auditEvent
      .findMany({ where: { gymId: gymA.gym.id } })
      .catch(() => []);
    for (const audit of audits as Array<Record<string, unknown>>) {
      expect(JSON.stringify(audit)).not.toContain(marker);
    }
  });
});
