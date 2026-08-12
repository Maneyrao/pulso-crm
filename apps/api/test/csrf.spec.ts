import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from './harness.js';

/**
 * CSRF double-submit (SECURITY_MODEL §6) — la mitad server-side.
 *
 * El emisor (auth.controller.ts) ya seteaba la cookie `pulso_csrf` legible por
 * JS al login/refresh, y el web client (apps/web/lib/api/client.ts) ya
 * reenviaba su valor como `X-CSRF-Token` en mutaciones. Faltaba lo único que
 * cierra el circuito: el guard que compara ambos lados antes de dejar pasar
 * el request. Sin él, la protección era teórica: el token viajaba pero nadie
 * lo miraba, así que un formulario cross-origin con `credentials: include`
 * (o un click-jacking sobre un fetch autenticado) hubiera pasado igual —
 * el navegador adjunta la cookie httpOnly `pulso_at` sola, y el server no
 * podía distinguir el request legítimo del forjado.
 *
 * Reglas del guard:
 *  - Sólo aplica cuando el token vino por COOKIE (Bearer se usa desde tests y
 *    agentes locales, no desde el navegador — un atacante web no puede setear
 *    el header `Authorization` por CORS).
 *  - Sólo aplica a métodos que mutan estado (POST/PUT/PATCH/DELETE).
 *  - GET/HEAD nunca requieren CSRF: por definición no deben mutar; si mutan,
 *    el bug está en el handler, no en el guard.
 *  - Los públicos (login/refresh/logout) no lo requieren tampoco: no hay
 *    sesión previa que abusar, y refresh/logout necesitan poder correr
 *    justamente cuando el usuario aún no tiene CSRF válido.
 */

let ctx: TestApp;
let gym: Awaited<ReturnType<typeof seedGymWithUsers>>;

beforeAll(async () => {
  ctx = await createTestApp('csrf');
  gym = await seedGymWithUsers(ctx.db, { slug: 'csrf-gym' });
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

async function loginAsOwner(): Promise<TestClient> {
  const c = new TestClient(ctx.baseUrl);
  const res = await c.post('/api/v1/auth/login', {
    email: gym.users['OWNER']!.email,
    password: gym.password,
  });
  expect(res.status).toBe(200);
  // Post-login, la cookie pulso_csrf tiene que estar en el jar del client:
  // sin ella, todos los tests de abajo estarían midiendo otra cosa.
  expect(c.getCookie('pulso_csrf')).toBeDefined();
  return c;
}

describe('CSRF double-submit — enforcement por AuthGuard', () => {
  it('POST autenticado SIN header X-CSRF-Token → 403 CSRF_INVALID', async () => {
    const c = await loginAsOwner();
    // Sobrescribo el header con "" para forzar su ausencia: TestClient
    // normalmente lo autocompleta desde la cookie (emulando al navegador).
    const res = await c.post(
      '/api/v1/branches',
      { name: 'Nueva Sede', timezone: 'America/Argentina/Buenos_Aires' },
      { 'x-csrf-token': '' },
    );
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe('CSRF_INVALID');
  });

  it('POST autenticado con header X-CSRF-Token distinto del cookie → 403 CSRF_INVALID', async () => {
    const c = await loginAsOwner();
    const res = await c.post(
      '/api/v1/branches',
      { name: 'Otra Sede', timezone: 'America/Argentina/Buenos_Aires' },
      { 'x-csrf-token': 'token-forjado-por-atacante' },
    );
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe('CSRF_INVALID');
  });

  it('POST autenticado con header X-CSRF-Token = cookie pulso_csrf → pasa el guard', async () => {
    const c = await loginAsOwner();
    // El TestClient adjunta el header solo (ver harness.ts request()). Esto
    // es la ruta feliz: sin overrides, el request tiene X-CSRF-Token igual
    // al cookie y el guard lo deja seguir. Si la respuesta es 201 (branch
    // creada) o 409/403 por reglas de negocio del handler, cualquier no-403
    // con code CSRF_INVALID prueba que el guard no bloqueó.
    const res = await c.post('/api/v1/branches', {
      name: 'Sede CSRF Feliz',
      timezone: 'America/Argentina/Buenos_Aires',
    });
    expect((res.body as { code?: string }).code).not.toBe('CSRF_INVALID');
  });

  it('GET autenticado NO requiere CSRF (métodos no mutantes están exentos)', async () => {
    const c = await loginAsOwner();
    const res = await c.get('/api/v1/branches', { 'x-csrf-token': '' });
    expect(res.status).toBe(200);
  });

  it('POST público (login) no requiere CSRF — no hay sesión previa', async () => {
    const c = new TestClient(ctx.baseUrl);
    // Sin cookies previas, sin header CSRF: es exactamente el estado inicial
    // del navegador al abrir el sitio; si el login exigiera CSRF, nadie
    // podría loguearse.
    const res = await c.post('/api/v1/auth/login', {
      email: gym.users['OWNER']!.email,
      password: gym.password,
    });
    expect(res.status).toBe(200);
  });

  it('PATCH autenticado con header omitido explícitamente → 403 CSRF_INVALID', async () => {
    const c = await loginAsOwner();
    // Primero creo una branch legítimamente (con CSRF) para tener un id que
    // patchear — así el escenario aísla el fallo del CSRF-guard, no del
    // handler por id inexistente.
    const create = await c.post('/api/v1/branches', {
      name: `Sede Patch ${Date.now()}`,
      timezone: 'America/Argentina/Buenos_Aires',
    });
    expect([200, 201]).toContain(create.status);
    const branchId = (create.body as { id: string }).id;

    const res = await c.patch(
      `/api/v1/branches/${branchId}`,
      { name: 'Rebautizada por atacante' },
      { 'x-csrf-token': '' },
    );
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe('CSRF_INVALID');
  });

  it('DELETE autenticado sin header → 403 CSRF_INVALID', async () => {
    const c = await loginAsOwner();
    const create = await c.post('/api/v1/branches', {
      name: `Sede Delete ${Date.now()}`,
      timezone: 'America/Argentina/Buenos_Aires',
    });
    expect([200, 201]).toContain(create.status);
    const branchId = (create.body as { id: string }).id;

    const res = await c.del(`/api/v1/branches/${branchId}`, { 'x-csrf-token': '' });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe('CSRF_INVALID');
  });
});
