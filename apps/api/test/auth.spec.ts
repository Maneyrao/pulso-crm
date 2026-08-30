import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from './harness.js';

/**
 * Autenticación y sesión (SECURITY_MODEL §2 y §3, ADR-007).
 *
 * Estos son los controles que evitan heredar el problema que la auditoría
 * encontró en el producto analizado: token accesible por JavaScript y sin
 * rotación.
 */

let ctx: TestApp;
let gymA: Awaited<ReturnType<typeof seedGymWithUsers>>;
let gymB: Awaited<ReturnType<typeof seedGymWithUsers>>;

beforeAll(async () => {
  ctx = await createTestApp('auth');
  gymA = await seedGymWithUsers(ctx.db, { slug: 'alfa' });
  gymB = await seedGymWithUsers(ctx.db, { slug: 'beta' });
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

const client = () => new TestClient(ctx.baseUrl);

const login = async (
  c: TestClient,
  email: string,
  password: string,
): Promise<{ status: number; body: unknown }> => c.post('/api/v1/auth/login', { email, password });

describe('login', () => {
  it('acepta credenciales válidas y devuelve el contexto de sesión', async () => {
    const c = client();
    const res = await login(c, gymA.users['OWNER']!.email, gymA.password);

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body['user']).toMatchObject({ email: gymA.users['OWNER']!.email });
    expect(body['gym']).toMatchObject({ slug: 'alfa' });
    expect(Array.isArray(body['permissions'])).toBe(true);
  });

  it('NUNCA devuelve el token en el cuerpo (ADR-007)', async () => {
    const c = client();
    const res = await login(c, gymA.users['OWNER']!.email, gymA.password);
    const serialized = JSON.stringify(res.body);

    expect(serialized).not.toMatch(/accessToken|refreshToken|eyJhbGciOi/);
  });

  it('las cookies llevan HttpOnly y SameSite, y el refresh va acotado por Path', async () => {
    const c = client();
    const raw = await fetch(`${ctx.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: gymA.users['OWNER']!.email, password: gymA.password }),
    });
    const cookies = raw.headers.getSetCookie();

    const access = cookies.find((x) => x.startsWith('pulso_at='))!;
    const refresh = cookies.find((x) => x.startsWith('pulso_rt='))!;
    const csrf = cookies.find((x) => x.startsWith('pulso_csrf='))!;

    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Lax/i);
    expect(refresh).toMatch(/HttpOnly/i);
    // El refresh sólo se adjunta en /auth: si hubiera un XSS en otra pantalla,
    // el navegador ni siquiera lo manda.
    expect(refresh).toMatch(/Path=\/api\/v1\/auth/);
    // El CSRF sí es legible por JS: es la mitad del double-submit.
    expect(csrf).not.toMatch(/HttpOnly/i);
    void c;
  });

  it('rechaza la contraseña incorrecta', async () => {
    const c = client();
    const res = await login(c, gymA.users['OWNER']!.email, 'incorrecta');
    expect(res.status).toBe(401);
    expect((res.body as { code: string }).code).toBe('INVALID_CREDENTIALS');
  });

  it('la respuesta es IDÉNTICA para email inexistente y contraseña incorrecta', async () => {
    const wrongPassword = await login(client(), gymA.users['OWNER']!.email, 'incorrecta');
    const noSuchEmail = await login(client(), 'nadie@alfa.test', 'incorrecta');

    expect(noSuchEmail.status).toBe(wrongPassword.status);
    const a = { ...(wrongPassword.body as Record<string, unknown>), requestId: undefined };
    const b = { ...(noSuchEmail.body as Record<string, unknown>), requestId: undefined };
    expect(b).toEqual(a);
  });

  it('el tiempo de respuesta es comparable entre email inexistente y contraseña mala', async () => {
    const measure = async (email: string): Promise<number> => {
      const samples: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        await login(client(), email, 'contraseña-incorrecta');
        samples.push(performance.now() - t0);
      }
      samples.sort((x, y) => x - y);
      return samples[2]!; // mediana
    };

    const existing = await measure(gymA.users['MANAGER']!.email);
    const missing = await measure('fantasma@alfa.test');

    // El hash dummy hace que ambos caminos hagan el mismo trabajo. Se compara
    // con un margen amplio porque la máquina de CI tiene ruido; lo que se busca
    // detectar es un orden de magnitud de diferencia, no microsegundos.
    const ratio = Math.max(existing, missing) / Math.min(existing, missing);
    expect(ratio).toBeLessThan(3);
  });

  it('bloquea la cuenta tras 10 intentos fallidos', async () => {
    const email = gymB.users['RECEPTIONIST']!.email;
    for (let i = 0; i < 10; i++) {
      await login(client(), email, 'mal');
    }
    const res = await login(client(), email, gymB.password);
    expect(res.status).toBe(401);
    expect((res.body as { code: string }).code).toBe('ACCOUNT_LOCKED');
  });

  it('rechaza a un usuario desactivado', async () => {
    const email = gymB.users['INSTRUCTOR']!.email;
    await ctx.db.raw.user.update({
      where: { id: gymB.users['INSTRUCTOR']!.id },
      data: { status: 'INACTIVE' },
    });
    const res = await login(client(), email, gymB.password);
    expect((res.body as { code: string }).code).toBe('ACCOUNT_INACTIVE');
    await ctx.db.raw.user.update({
      where: { id: gymB.users['INSTRUCTOR']!.id },
      data: { status: 'ACTIVE' },
    });
  });

  it('rechaza el login si el gimnasio está suspendido', async () => {
    await ctx.db.raw.gym.update({ where: { id: gymB.gym.id }, data: { status: 'SUSPENDED' } });
    const res = await login(client(), gymB.users['MANAGER']!.email, gymB.password);
    expect((res.body as { code: string }).code).toBe('GYM_SUSPENDED');
    await ctx.db.raw.gym.update({ where: { id: gymB.gym.id }, data: { status: 'ACTIVE' } });
  });

  it('rechaza un email con formato inválido antes de tocar la base', async () => {
    const res = await login(client(), 'no-es-un-email', 'x');
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe('VALIDATION_ERROR');
  });
});

describe('sesión', () => {
  it('GET /auth/me funciona con la cookie', async () => {
    const c = client();
    await login(c, gymA.users['OWNER']!.email, gymA.password);
    const res = await c.get('/api/v1/auth/me');

    expect(res.status).toBe(200);
    expect((res.body as { user: { email: string } }).user.email).toBe(gymA.users['OWNER']!.email);
  });

  it('sin cookie devuelve 401 con código estable', async () => {
    const res = await client().get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect((res.body as { code: string }).code).toBe('SESSION_EXPIRED');
  });

  it('un token manipulado se rechaza', async () => {
    const c = client();
    await login(c, gymA.users['OWNER']!.email, gymA.password);
    const token = c.getCookie('pulso_at')!;
    // Se altera el payload sin re-firmar.
    const [h, p, s] = token.split('.');
    const tampered = [h, Buffer.from('{"sub":"otro"}').toString('base64url'), s].join('.');
    c.setCookie('pulso_at', tampered);

    const res = await c.get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('rotación de refresh', () => {
  it('el refresh devuelve una sesión nueva y rota el token', async () => {
    const c = client();
    await login(c, gymA.users['OWNER']!.email, gymA.password);
    const before = c.getCookie('pulso_rt');

    const res = await c.post('/api/v1/auth/refresh');
    expect(res.status).toBe(200);
    expect(c.getCookie('pulso_rt')).not.toBe(before);
  });

  it('REUSAR un refresh ya rotado revoca la familia entera', async () => {
    const c = client();
    await login(c, gymA.users['MANAGER']!.email, gymA.password);
    const stolen = c.getCookie('pulso_rt')!;

    // Uso legítimo: rota.
    await c.post('/api/v1/auth/refresh');
    const current = c.getCookie('pulso_rt')!;
    expect(current).not.toBe(stolen);

    // El atacante presenta el token viejo.
    const attacker = client();
    attacker.setCookie('pulso_rt', stolen);
    const replay = await attacker.post('/api/v1/auth/refresh');

    expect(replay.status).toBe(401);
    expect((replay.body as { code: string }).code).toBe('REFRESH_TOKEN_REUSED');

    // Y la sesión legítima también queda invalidada: si un token se filtró,
    // no alcanza con bloquear al atacante.
    const victim = client();
    victim.setCookie('pulso_rt', current);
    const afterRevocation = await victim.post('/api/v1/auth/refresh');
    expect(afterRevocation.status).toBe(401);
  });

  it('el reuso queda registrado en la auditoría', async () => {
    const c = client();
    await login(c, gymA.users['RECEPTIONIST']!.email, gymA.password);
    const stolen = c.getCookie('pulso_rt')!;
    await c.post('/api/v1/auth/refresh');

    const attacker = client();
    attacker.setCookie('pulso_rt', stolen);
    await attacker.post('/api/v1/auth/refresh');

    const events = await ctx.db.raw.auditEvent.findMany({
      where: { gymId: gymA.gym.id, action: 'SECURITY_REFRESH_REUSE' },
    });
    expect(events.length).toBeGreaterThan(0);
  });

  it('un refresh inexistente devuelve 401 y limpia las cookies', async () => {
    const c = client();
    c.setCookie('pulso_rt', 'token-que-no-existe');
    const res = await c.post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
    expect(c.getCookie('pulso_rt')).toBeUndefined();
  });

  it('el refresh token se guarda hasheado, nunca en claro', async () => {
    const c = client();
    await login(c, gymA.users['OWNER']!.email, gymA.password);
    const plain = c.getCookie('pulso_rt')!;

    const stored = await ctx.db.raw.refreshToken.findMany({ where: { gymId: gymA.gym.id } });
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.some((t) => t.tokenHash === plain)).toBe(false);
    expect(stored.every((t) => /^[a-f0-9]{64}$/.test(t.tokenHash))).toBe(true);
  });
});

describe('logout', () => {
  it('revoca la sesión y las cookies dejan de servir', async () => {
    const c = client();
    await login(c, gymA.users['OWNER']!.email, gymA.password);
    expect((await c.get('/api/v1/auth/me')).status).toBe(200);

    const out = await c.post('/api/v1/auth/logout');
    expect(out.status).toBe(204);

    const after = await c.post('/api/v1/auth/refresh');
    expect(after.status).toBe(401);
  });
});

describe('selección de sede', () => {
  it('rechaza una sede de otro gimnasio como si no existiera', async () => {
    const c = client();
    await login(c, gymA.users['OWNER']!.email, gymA.password);

    const res = await c.post('/api/v1/auth/select-branch', { branchId: gymB.branch.id });
    expect(res.status).toBe(404);
    expect((res.body as { code: string }).code).toBe('NOT_FOUND');
  });

  it('acepta una sede propia', async () => {
    const c = client();
    await login(c, gymA.users['OWNER']!.email, gymA.password);
    const res = await c.post('/api/v1/auth/select-branch', { branchId: gymA.branch.id });
    expect(res.status).toBe(200);
  });
});

describe('formato de error', () => {
  it('todo error sigue el shape RFC-7807 con code y requestId', async () => {
    const res = await client().get('/api/v1/auth/me');
    expect(res.body).toMatchObject({
      type: expect.stringContaining('http'),
      code: expect.any(String),
      title: expect.any(String),
      status: 401,
      detail: expect.any(String),
      requestId: expect.any(String),
    });
  });

  it('un error interno no filtra el mensaje original', async () => {
    const res = await client().get('/api/v1/no-existe');
    const body = res.body as Record<string, unknown>;
    expect(body['stack']).toBeUndefined();
  });
});
