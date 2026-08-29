import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, seedGymWithUsers, TestClient, type TestApp } from '../harness.js';

/**
 * Tests de seguridad OBLIGATORIOS de biometría (BIOMETRIC_SECURITY.md §13 y
 * API_CONTRACTS.md §10): consentimiento verificado en backend, tokens de un
 * solo uso con scope, revocación inmediata, aislamiento por sede y tenant,
 * cifrado con AAD por tenant y cero PII hacia el agente.
 *
 * Corren contra la app real (guards y pipeline de producción) y un esquema
 * PostgreSQL efímero (ADR-023).
 */

let ctx: TestApp;
let gymA: Awaited<ReturnType<typeof seedGymWithUsers>>;
let gymB: Awaited<ReturnType<typeof seedGymWithUsers>>;
let crmA: TestClient;
let crmB: TestClient;

/** Template determinístico "capturado" por el agente (base64). */
const TEMPLATE = Buffer.from(`template-huella-${'x'.repeat(64)}`).toString('base64');
const OTHER_TEMPLATE = Buffer.from(`otra-huella-${'y'.repeat(64)}`).toString('base64');

beforeAll(async () => {
  ctx = await createTestApp('biometrics');
  gymA = await seedGymWithUsers(ctx.db, { slug: 'bio-gym-a' });
  gymB = await seedGymWithUsers(ctx.db, { slug: 'bio-gym-b' });
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
  if (res.status !== 200) throw new Error(`login falló: ${res.status} ${JSON.stringify(res.body)}`);
}

interface AgentSetup {
  agentId: string;
  deviceId: string;
  credential: string;
}

/** Alta CRM + pareo del agente: devuelve la credencial de larga vida. */
async function setupAgent(client: TestClient, branchId: string): Promise<AgentSetup> {
  const created = await client.post('/api/v1/agents', {
    branchId,
    name: `Recepción ${randomUUID().slice(0, 8)}`,
  });
  expect(created.status).toBe(201);
  const { agent, pairingSecret } = created.body as {
    agent: { id: string; installationId: string };
    pairingSecret: string;
  };

  const paired = await client.post('/api/v1/agent/pair', {
    installationId: agent.installationId,
    secret: pairingSecret,
    machineFingerprint: 'fp-test',
    agentVersion: '1.0.0',
    osVersion: 'Windows 11',
  });
  expect(paired.status).toBe(200);
  const credential = (paired.body as { agentCredential: string }).agentCredential;

  const approved = await client.post(`/api/v1/agents/${agent.id}/approve`);
  expect(approved.status).toBe(200);

  // Heartbeat: deja lastSeenAt fresco (startEnrollment exige agente online).
  const hb = await client.post(
    '/api/v1/agent/heartbeat',
    { agentState: 'Ready', agentVersion: '1.0.0', deviceStatus: 'ONLINE' },
    { authorization: `Bearer ${credential}` },
  );
  expect(hb.status).toBe(200);
  expect((hb.body as { status: string }).status).toBe('ACTIVE');

  const devices = await client.get('/api/v1/devices');
  const device = (devices.body as { data: Array<{ id: string; localAgentId: string }> }).data.find(
    (d) => d.localAgentId === agent.id,
  );
  expect(device).toBeDefined();

  return { agentId: agent.id, deviceId: device!.id, credential };
}

async function createMember(
  client: TestClient,
  firstName: string,
  branchId?: string,
): Promise<string> {
  const res = await client.post(
    '/api/v1/members',
    {
      firstName,
      lastName: 'Biometría',
      documentType: 'DNI',
      documentNumber: String(Math.floor(10_000_000 + Math.random() * 80_000_000)),
      branchId: branchId ?? gymA.branch.id,
    },
    { 'idempotency-key': randomUUID() },
  );
  expect(res.status).toBe(201);
  return (res.body as { id: string }).id;
}

async function grantConsent(client: TestClient, memberId: string): Promise<void> {
  const res = await client.post(`/api/v1/members/${memberId}/biometrics/consent`, {
    version: 'v1-test',
    grantedMethod: 'IN_PERSON_SIGNED',
  });
  expect(res.status).toBe(201);
}

async function startEnrollment(
  client: TestClient,
  memberId: string,
  setup: AgentSetup,
): Promise<{ enrollmentId: string; deviceToken: string }> {
  const res = await client.post(
    `/api/v1/members/${memberId}/biometrics/enrollments`,
    { localAgentId: setup.agentId, deviceId: setup.deviceId, fingerPosition: 'RIGHT_INDEX' },
    { 'idempotency-key': randomUUID() },
  );
  expect(res.status).toBe(201);
  return res.body as { enrollmentId: string; deviceToken: string };
}

async function enrollComplete(
  deviceToken: string,
  enrollmentId: string,
  template = TEMPLATE,
): Promise<{ status: number; body: unknown }> {
  const client = new TestClient(ctx.baseUrl);
  return client.post(
    '/api/v1/agent/biometrics/enroll-complete',
    { enrollmentId, template, templateFormat: 'VENDOR_DIGITALPERSONA', quality: 85 },
    { authorization: `Bearer ${deviceToken}` },
  );
}

interface IdentificationSession {
  deviceToken: string;
  deviceId: string;
  expiresAt: string;
  minQuality: number;
}

async function issueIdentifyToken(
  client: TestClient,
  branchId: string,
): Promise<IdentificationSession> {
  const response = await client.post(
    '/api/v1/biometrics/identifications',
    { branchId },
    { 'idempotency-key': randomUUID() },
  );
  expect(response.status).toBe(201);
  return response.body as IdentificationSession;
}

async function identify(
  deviceToken: string,
  branchId: string,
  template = TEMPLATE,
  deviceId = randomUUID(),
): Promise<{ status: number; body: unknown }> {
  const client = new TestClient(ctx.baseUrl);
  return client.post(
    '/api/v1/agent/biometrics/identify',
    {
      branchId,
      deviceId,
      template,
      templateFormat: 'VENDOR_DIGITALPERSONA',
      quality: 80,
      capturedAt: new Date().toISOString(),
    },
    { authorization: `Bearer ${deviceToken}` },
  );
}

describe('biometría — flujo completo y controles de seguridad', () => {
  let setupA: AgentSetup;

  beforeAll(async () => {
    setupA = await setupAgent(crmA, gymA.branch.id);
  }, 60_000);

  it('el CRM emite un token IDENTIFY real y el agente no puede reutilizarlo', async () => {
    const session = await issueIdentifyToken(crmA, gymA.branch.id);
    expect(session.deviceToken).toMatch(/^pdt_/);
    expect(session.deviceId).toBe(setupA.deviceId);

    const first = await identify(
      session.deviceToken,
      gymA.branch.id,
      OTHER_TEMPLATE,
      session.deviceId,
    );
    expect(first.status).toBe(200);

    const replay = await identify(
      session.deviceToken,
      gymA.branch.id,
      OTHER_TEMPLATE,
      session.deviceId,
    );
    expect(replay.status).toBe(401);
    expect((replay.body as { code: string }).code).toBe('INVALID_DEVICE_TOKEN');
  });

  it('no emite identificación para una sede fuera de la sesión', async () => {
    const response = await crmB.post(
      '/api/v1/biometrics/identifications',
      { branchId: gymA.branch.id },
      { 'idempotency-key': randomUUID() },
    );
    expect(response.status).toBe(404);
    expect((response.body as { code: string }).code).toBe('NOT_FOUND');
  });

  it('enroll-no-consent: sin consentimiento el enrolamiento responde 409 NO_BIOMETRIC_CONSENT', async () => {
    const memberId = await createMember(crmA, 'SinConsentimiento');
    const res = await crmA.post(
      `/api/v1/members/${memberId}/biometrics/enrollments`,
      { localAgentId: setupA.agentId, deviceId: setupA.deviceId, fingerPosition: 'RIGHT_INDEX' },
      { 'idempotency-key': randomUUID() },
    );
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('NO_BIOMETRIC_CONSENT');
  });

  it('happy path: consentimiento → enrolamiento → enroll-complete crea la credencial cifrada', async () => {
    const memberId = await createMember(crmA, 'HappyPath');
    await grantConsent(crmA, memberId);
    const { enrollmentId, deviceToken } = await startEnrollment(crmA, memberId, setupA);

    const res = await enrollComplete(deviceToken, enrollmentId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const credential = await ctx.db.raw.biometricCredential.findFirst({
      where: { memberId, status: 'ACTIVE' },
    });
    expect(credential).not.toBeNull();
    // El template NO está en claro en la base.
    expect(Buffer.from(credential!.templateCiphertext).toString('base64')).not.toBe(TEMPLATE);

    const enrollment = await ctx.db.raw.biometricEnrollment.findUnique({
      where: { id: enrollmentId },
    });
    expect(enrollment!.status).toBe('COMPLETED');

    // La API de credenciales expone sólo metadatos.
    const listed = await crmA.get(`/api/v1/members/${memberId}/biometrics/credentials`);
    expect(listed.status).toBe(200);
    const [row] = (listed.body as { data: Array<Record<string, unknown>> }).data;
    for (const forbidden of [
      'templateCiphertext',
      'templateNonce',
      'templateAuthTag',
      'dekWrapped',
      'templateHash',
      'template',
    ]) {
      expect(row![forbidden], `no debe exponer '${forbidden}'`).toBeUndefined();
    }
  });

  it('HID web: enrola una huella sin depender del agente WBF ni abrir una ventana local', async () => {
    const memberId = await createMember(crmA, 'HidWeb');
    await grantConsent(crmA, memberId);
    const realisticPngPayload = Buffer.alloc(150 * 1024, 7).toString('base64');

    const started = await crmA.post(
      `/api/v1/members/${memberId}/biometrics/hid-enrollments`,
      { branchId: gymA.branch.id, fingerPosition: 'RIGHT_INDEX' },
      { 'idempotency-key': randomUUID() },
    );
    expect(started.status).toBe(201);
    const enrollmentId = (started.body as { enrollmentId: string }).enrollmentId;

    const completed = await crmA.post(
      `/api/v1/biometrics/hid-enrollments/${enrollmentId}/complete`,
      {
        pngBase64: realisticPngPayload,
        qualityCode: 0,
      },
    );
    expect(completed.status).toBe(200);
    expect(completed.body).toEqual({ ok: true });

    const credential = await ctx.db.raw.biometricCredential.findFirst({
      where: { memberId, status: 'ACTIVE' },
    });
    expect(credential?.templateFormat).toBe('SOURCEAFIS_3_14');
    expect(credential?.enrollmentId).toBe(enrollmentId);
  });

  it('HID web: identifica la huella y devuelve el resultado de acceso directamente al CRM', async () => {
    const memberId = await createMember(crmA, 'HidIngreso');
    await grantConsent(crmA, memberId);
    const sample = Buffer.from(`png-hid-${Date.now()}`).toString('base64');
    const started = await crmA.post(
      `/api/v1/members/${memberId}/biometrics/hid-enrollments`,
      { branchId: gymA.branch.id, fingerPosition: 'RIGHT_INDEX' },
      { 'idempotency-key': randomUUID() },
    );
    const enrollmentId = (started.body as { enrollmentId: string }).enrollmentId;
    await crmA.post(`/api/v1/biometrics/hid-enrollments/${enrollmentId}/complete`, {
      pngBase64: sample,
      qualityCode: 0,
    });

    const identified = await crmA.post(
      '/api/v1/biometrics/hid-identifications',
      { branchId: gymA.branch.id, pngBase64: sample, qualityCode: 0 },
      { 'idempotency-key': randomUUID() },
    );

    expect(identified.status).toBe(201);
    expect(identified.body).toMatchObject({
      reasonCode: 'NO_MEMBERSHIP',
      member: { id: memberId, firstName: 'HidIngreso' },
      attendanceRegistered: false,
    });
  });

  it('finger-already-enrolled: el mismo dedo no se enrola dos veces', async () => {
    const memberId = await createMember(crmA, 'DedoDoble');
    await grantConsent(crmA, memberId);
    const first = await startEnrollment(crmA, memberId, setupA);
    await enrollComplete(first.deviceToken, first.enrollmentId, OTHER_TEMPLATE);

    const res = await crmA.post(
      `/api/v1/members/${memberId}/biometrics/enrollments`,
      { localAgentId: setupA.agentId, deviceId: setupA.deviceId, fingerPosition: 'RIGHT_INDEX' },
      { 'idempotency-key': randomUUID() },
    );
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('FINGER_ALREADY_ENROLLED');
  });

  it('token-scope: un token de ENROLL no sirve para identify, y viceversa', async () => {
    const memberId = await createMember(crmA, 'TokenScope');
    await grantConsent(crmA, memberId);
    const { deviceToken } = await startEnrollment(crmA, memberId, setupA);

    // ENROLL usado en identify → 401.
    const asIdentify = await identify(deviceToken, gymA.branch.id);
    expect(asIdentify.status).toBe(401);
    expect((asIdentify.body as { code: string }).code).toBe('INVALID_DEVICE_TOKEN');

    // IDENTIFY usado en enroll-complete → 401.
    const identifySession = await issueIdentifyToken(crmA, gymA.branch.id);
    const asEnroll = await enrollComplete(identifySession.deviceToken, randomUUID());
    expect(asEnroll.status).toBe(401);
    expect((asEnroll.body as { code: string }).code).toBe('INVALID_DEVICE_TOKEN');
  });

  it('token-replay: un deviceToken consumido no se puede reutilizar', async () => {
    const memberId = await createMember(crmA, 'TokenReplay');
    await grantConsent(crmA, memberId);
    const { enrollmentId, deviceToken } = await startEnrollment(crmA, memberId, setupA);

    const first = await enrollComplete(
      deviceToken,
      enrollmentId,
      Buffer.from(`replay-${Date.now()}`).toString('base64'),
    );
    expect(first.status).toBe(200);

    const replay = await enrollComplete(deviceToken, enrollmentId);
    expect(replay.status).toBe(401);
    expect((replay.body as { code: string }).code).toBe('INVALID_DEVICE_TOKEN');
  });

  it('token atado a la sesión: no completa un enrollment distinto del emitido', async () => {
    const memberX = await createMember(crmA, 'TokenAtadoX');
    const memberY = await createMember(crmA, 'TokenAtadoY');
    await grantConsent(crmA, memberX);
    await grantConsent(crmA, memberY);
    const enrollX = await startEnrollment(crmA, memberX, setupA);
    const enrollY = await startEnrollment(crmA, memberY, setupA);

    // Token de X con el enrollmentId de Y → 401 y el token de X NO se quema.
    const crossed = await enrollComplete(enrollX.deviceToken, enrollY.enrollmentId);
    expect(crossed.status).toBe(401);

    const legit = await enrollComplete(
      enrollX.deviceToken,
      enrollX.enrollmentId,
      Buffer.from(`atado-${Date.now()}`).toString('base64'),
    );
    expect(legit.status).toBe(200);
  });

  it('no-pii-to-agent: identify responde {resolved:true} y NADA más, haya o no match', async () => {
    const memberId = await createMember(crmA, 'SinPii');
    await grantConsent(crmA, memberId);
    const { enrollmentId, deviceToken } = await startEnrollment(crmA, memberId, setupA);
    const template = Buffer.from(`sin-pii-${Date.now()}`).toString('base64');
    await enrollComplete(deviceToken, enrollmentId, template);

    const matchSession = await issueIdentifyToken(crmA, gymA.branch.id);
    const withMatch = await identify(
      matchSession.deviceToken,
      gymA.branch.id,
      template,
      matchSession.deviceId,
    );
    expect(withMatch.status).toBe(200);
    expect(withMatch.body).toEqual({ resolved: true });
    expect(Object.keys(withMatch.body as object)).toEqual(['resolved']);

    const noMatchSession = await issueIdentifyToken(crmA, gymA.branch.id);
    const noMatch = await identify(
      noMatchSession.deviceToken,
      gymA.branch.id,
      Buffer.from(`desconocida-${Date.now()}`).toString('base64'),
      noMatchSession.deviceId,
    );
    expect(noMatch.status).toBe(200);
    expect(noMatch.body).toEqual({ resolved: true });

    // El no-match quedó registrado como AccessAttempt BIOMETRIC_NO_MATCH.
    const attempt = await ctx.db.raw.accessAttempt.findFirst({
      where: { gymId: gymA.gym.id, reasonCode: 'BIOMETRIC_NO_MATCH' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(attempt).not.toBeNull();
    expect(attempt!.memberId).toBeNull();

    const result = await crmA.get(`/api/v1/access/attempts/${attempt!.id}/result`);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      decision: 'DENIED',
      reasonCode: 'BIOMETRIC_NO_MATCH',
      member: null,
      membership: null,
      attendanceRegistered: false,
      accessAttemptId: attempt!.id,
    });
  });

  it('identify con match registra AccessAttempt con matchScore y método FINGERPRINT', async () => {
    const memberId = await createMember(crmA, 'ConIntento');
    await grantConsent(crmA, memberId);
    const { enrollmentId, deviceToken } = await startEnrollment(crmA, memberId, setupA);
    const template = Buffer.from(`con-intento-${Date.now()}`).toString('base64');
    await enrollComplete(deviceToken, enrollmentId, template);

    const session = await issueIdentifyToken(crmA, gymA.branch.id);
    const res = await identify(session.deviceToken, gymA.branch.id, template, session.deviceId);
    expect(res.status).toBe(200);

    const attempt = await ctx.db.raw.accessAttempt.findFirst({
      where: { memberId, method: 'FINGERPRINT' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(attempt).not.toBeNull();
    expect(attempt!.matchScore).toBe(100);
    // Sin membresía activa: la MISMA cadena de autorización de /access/check deniega.
    expect(attempt!.decision).toBe('DENIED');
    expect(attempt!.reasonCode).toBe('NO_MEMBERSHIP');

    const result = await crmA.get(`/api/v1/access/attempts/${attempt!.id}/result`);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      decision: 'DENIED',
      reasonCode: 'NO_MEMBERSHIP',
      member: { id: memberId, firstName: 'ConIntento', status: 'ACTIVE' },
      membership: null,
      attendanceRegistered: false,
      accessAttemptId: attempt!.id,
    });
  });

  it('identify-revoked: una credencial revocada no matchea en la siguiente identificación', async () => {
    const memberId = await createMember(crmA, 'Revocado');
    await grantConsent(crmA, memberId);
    const { enrollmentId, deviceToken } = await startEnrollment(crmA, memberId, setupA);
    const template = Buffer.from(`revocada-${Date.now()}`).toString('base64');
    await enrollComplete(deviceToken, enrollmentId, template);

    const credential = await ctx.db.raw.biometricCredential.findFirst({ where: { memberId } });
    const revoked = await crmA.del(`/api/v1/biometrics/credentials/${credential!.id}`);
    expect(revoked.status).toBe(200);

    const session = await issueIdentifyToken(crmA, gymA.branch.id);
    const res = await identify(session.deviceToken, gymA.branch.id, template, session.deviceId);
    expect(res.status).toBe(200);

    const attempt = await ctx.db.raw.accessAttempt.findFirst({
      where: { gymId: gymA.gym.id, method: 'FINGERPRINT' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(attempt!.reasonCode).toBe('BIOMETRIC_NO_MATCH');
    expect(attempt!.memberId).toBeNull();
  });

  it('consent-revoke-cascade: revocar consentimiento revoca TODAS las credenciales en la misma transacción', async () => {
    const memberId = await createMember(crmA, 'Cascada');
    await grantConsent(crmA, memberId);
    const { enrollmentId, deviceToken } = await startEnrollment(crmA, memberId, setupA);
    await enrollComplete(
      deviceToken,
      enrollmentId,
      Buffer.from(`cascada-${Date.now()}`).toString('base64'),
    );

    const res = await crmA.del(`/api/v1/members/${memberId}/biometrics/consent`);
    expect(res.status).toBe(200);
    expect((res.body as { revokedCredentials: number }).revokedCredentials).toBe(1);

    const remaining = await ctx.db.raw.biometricCredential.count({
      where: { memberId, status: 'ACTIVE' },
    });
    expect(remaining).toBe(0);

    // Y sin consentimiento, un enrolamiento nuevo vuelve a dar 409.
    const again = await crmA.post(
      `/api/v1/members/${memberId}/biometrics/enrollments`,
      { localAgentId: setupA.agentId, deviceId: setupA.deviceId, fingerPosition: 'LEFT_INDEX' },
      { 'idempotency-key': randomUUID() },
    );
    expect(again.status).toBe(409);
  });

  it('crypto AAD cross-tenant: un ciphertext copiado a otro gimnasio NO se descifra ni matchea', async () => {
    const memberId = await createMember(crmA, 'CopiaAjena');
    await grantConsent(crmA, memberId);
    const { enrollmentId, deviceToken } = await startEnrollment(crmA, memberId, setupA);
    const template = Buffer.from(`copiada-${Date.now()}`).toString('base64');
    await enrollComplete(deviceToken, enrollmentId, template);

    const original = await ctx.db.raw.biometricCredential.findFirst({ where: { memberId } });

    // Simula el ataque de base de datos: la fila copiada al gimnasio B.
    const setupB = await setupAgent(crmB, gymB.branch.id);
    const memberB = await createMember(crmB, 'VictimaB', gymB.branch.id);
    const chainB = await ctx.db.raw.biometricEnrollment.create({
      data: {
        gymId: gymB.gym.id,
        branchId: gymB.branch.id,
        memberId: memberB,
        localAgentId: setupB.agentId,
        deviceId: setupB.deviceId,
        fingerPosition: 'RIGHT_INDEX',
        samplesRequired: 4,
        startedByUserId: gymB.users['OWNER']!.id,
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    await ctx.db.raw.biometricCredential.create({
      data: {
        gymId: gymB.gym.id,
        memberId: memberB,
        branchId: null,
        fingerPosition: 'RIGHT_INDEX',
        templateFormat: 'VENDOR_DIGITALPERSONA',
        templateCiphertext: original!.templateCiphertext,
        templateNonce: original!.templateNonce,
        templateAuthTag: original!.templateAuthTag,
        dekWrapped: original!.dekWrapped,
        keyVersion: original!.keyVersion,
        templateHash: original!.templateHash,
        quality: original!.quality,
        enrollmentId: chainB.id,
        createdByUserId: gymB.users['OWNER']!.id,
      },
    });

    // El agente de B presenta la huella original: el ciphertext robado falla
    // la verificación GCM (AAD de gym A) y el resultado es no-match.
    const session = await issueIdentifyToken(crmB, gymB.branch.id);
    const res = await identify(session.deviceToken, gymB.branch.id, template, session.deviceId);
    expect(res.status).toBe(200);

    const attempt = await ctx.db.raw.accessAttempt.findFirst({
      where: { gymId: gymB.gym.id, method: 'FINGERPRINT' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(attempt!.reasonCode).toBe('BIOMETRIC_NO_MATCH');
  });

  it('identify-cross-branch: una credencial atada a otra sede no entra en el conjunto de candidatos', async () => {
    const memberId = await createMember(crmA, 'OtraSede');
    await grantConsent(crmA, memberId);
    const { enrollmentId, deviceToken } = await startEnrollment(crmA, memberId, setupA);
    const template = Buffer.from(`otra-sede-${Date.now()}`).toString('base64');
    await enrollComplete(deviceToken, enrollmentId, template);

    // La credencial queda atada a una sede que NO es la del agente.
    const otherBranch = await ctx.db.raw.branch.create({
      data: { gymId: gymA.gym.id, name: `Sede lejana ${randomUUID().slice(0, 6)}` },
    });
    await ctx.db.raw.biometricCredential.updateMany({
      where: { memberId },
      data: { branchId: otherBranch.id },
    });

    const session = await issueIdentifyToken(crmA, gymA.branch.id);
    const res = await identify(session.deviceToken, gymA.branch.id, template, session.deviceId);
    expect(res.status).toBe(200);
    const attempt = await ctx.db.raw.accessAttempt.findFirst({
      where: { gymId: gymA.gym.id, method: 'FINGERPRINT' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(attempt!.reasonCode).toBe('BIOMETRIC_NO_MATCH');
  });

  it('cross-tenant CRM: los recursos biométricos de A no existen para B', async () => {
    const memberId = await createMember(crmA, 'InvisibleParaB');
    await grantConsent(crmA, memberId);
    const { enrollmentId } = await startEnrollment(crmA, memberId, setupA);

    expect((await crmB.get(`/api/v1/biometrics/enrollments/${enrollmentId}`)).status).toBe(404);
    expect((await crmB.get(`/api/v1/members/${memberId}/biometrics/credentials`)).status).toBe(404);
    expect(
      (
        await crmB.post(`/api/v1/members/${memberId}/biometrics/consent`, {
          version: 'v1',
          grantedMethod: 'DIGITAL',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await crmB.post(
          `/api/v1/members/${memberId}/biometrics/enrollments`,
          { localAgentId: setupA.agentId, deviceId: setupA.deviceId, fingerPosition: 'LEFT_THUMB' },
          { 'idempotency-key': randomUUID() },
        )
      ).status,
    ).toBe(404);

    const hidStarted = await crmA.post(
      `/api/v1/members/${memberId}/biometrics/hid-enrollments`,
      { branchId: gymA.branch.id, fingerPosition: 'LEFT_INDEX' },
      { 'idempotency-key': randomUUID() },
    );
    const hidEnrollmentId = (hidStarted.body as { enrollmentId: string }).enrollmentId;
    expect(
      (
        await crmB.post(
          `/api/v1/members/${memberId}/biometrics/hid-enrollments`,
          { branchId: gymB.branch.id, fingerPosition: 'LEFT_THUMB' },
          { 'idempotency-key': randomUUID() },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await crmB.post(`/api/v1/biometrics/hid-enrollments/${hidEnrollmentId}/complete`, {
          pngBase64: Buffer.from('foreign-hid-sample').toString('base64'),
          qualityCode: 0,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await crmB.post(
          '/api/v1/biometrics/hid-identifications',
          {
            branchId: gymA.branch.id,
            pngBase64: Buffer.from('foreign-hid-probe').toString('base64'),
            qualityCode: 0,
          },
          { 'idempotency-key': randomUUID() },
        )
      ).status,
    ).toBe(404);
  });

  it('revocar el agente invalida sus deviceTokens en curso y el heartbeat informa REVOKED', async () => {
    const setup = await setupAgent(crmA, gymA.branch.id);
    const memberId = await createMember(crmA, 'AgenteRevocado');
    await grantConsent(crmA, memberId);
    const { enrollmentId, deviceToken } = await startEnrollment(crmA, memberId, setup);

    const revoked = await crmA.post(`/api/v1/agents/${setup.agentId}/revoke`, {
      reason: 'PC de recepción comprometida',
    });
    expect(revoked.status).toBe(200);

    // El token emitido antes de la revocación ya no sirve (un solo uso, quemado).
    const attempt = await enrollComplete(deviceToken, enrollmentId);
    expect(attempt.status).toBe(401);

    // El heartbeat con la credencial de larga vida informa REVOKED al agente.
    const client = new TestClient(ctx.baseUrl);
    const hb = await client.post(
      '/api/v1/agent/heartbeat',
      { agentState: 'Ready', agentVersion: '1.0.0' },
      { authorization: `Bearer ${setup.credential}` },
    );
    expect(hb.status).toBe(200);
    expect((hb.body as { status: string }).status).toBe('REVOKED');
  });

  it('pareo: secreto incorrecto o re-pareo responden 401 sin filtrar cuál falló', async () => {
    const created = await crmA.post('/api/v1/agents', {
      branchId: gymA.branch.id,
      name: 'Pareo negativo',
    });
    const { agent, pairingSecret } = created.body as {
      agent: { installationId: string };
      pairingSecret: string;
    };
    const anon = new TestClient(ctx.baseUrl);
    const base = {
      machineFingerprint: 'fp',
      agentVersion: '1.0.0',
      osVersion: 'w11',
    };

    const wrongSecret = await anon.post('/api/v1/agent/pair', {
      ...base,
      installationId: agent.installationId,
      secret: 'pps_incorrecto',
    });
    expect(wrongSecret.status).toBe(401);

    const ok = await anon.post('/api/v1/agent/pair', {
      ...base,
      installationId: agent.installationId,
      secret: pairingSecret,
    });
    expect(ok.status).toBe(200);

    // Re-pareo con el mismo secreto: mismo 401 que el secreto incorrecto.
    const rePair = await anon.post('/api/v1/agent/pair', {
      ...base,
      installationId: agent.installationId,
      secret: pairingSecret,
    });
    expect(rePair.status).toBe(401);
    // Mismo código y detalle que el secreto incorrecto: no filtra cuál falló.
    expect((rePair.body as { code: string }).code).toBe(
      (wrongSecret.body as { code: string }).code,
    );
    expect((rePair.body as { detail?: string }).detail).toBe(
      (wrongSecret.body as { detail?: string }).detail,
    );
  });
});
