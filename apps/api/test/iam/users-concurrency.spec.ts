import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from '../harness.js';

/**
 * Concurrencia del invariante del último OWNER (T-2.6, reviewer finding #3).
 *
 * Aislado en su propio archivo, con su propio gimnasio: el escenario reduce
 * a propósito la cantidad de OWNERs activos a exactamente 2 y después deja
 * que la carrera decida cuál de los dos sobrevive — un resultado
 * NO-determinístico que rompería `iam/users.spec.ts` si compartiera el mismo
 * gimnasio (esos tests asumen que el OWNER del seed sigue activo).
 */

let ctx: TestApp;
let gym: Awaited<ReturnType<typeof seedGymWithUsers>>;

beforeAll(async () => {
  ctx = await createTestApp('iam-users-concurrency');
  gym = await seedGymWithUsers(ctx.db, { slug: 'iam-concurrency-gym' });
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

async function loginAs(role: keyof typeof gym.users): Promise<TestClient> {
  const c = new TestClient(ctx.baseUrl);
  const res = await c.post('/api/v1/auth/login', {
    email: gym.users[role]!.email,
    password: gym.password,
  });
  expect(res.status).toBe(200);
  return c;
}

async function roleId(code: string): Promise<string> {
  const role = await ctx.db.raw.role.findFirstOrThrow({ where: { gymId: gym.gym.id, code } });
  return role.id;
}

describe('concurrencia: invariante del último OWNER', () => {
  it('dos deactivate simultáneos que dejarían 0 OWNERs — exactamente uno gana', async () => {
    // MANAGER tiene user:write pero no es OWNER: sirve de caller neutral
    // para las dos llamadas concurrentes, así ninguna de las dos sesiones
    // bajo prueba se invalida a sí misma a mitad de la carrera (desactivar a
    // alguien revoca SU sesión, no la de quien hace el request).
    const manager = await loginAs('MANAGER');
    const ownerRoleId = await roleId('OWNER');

    // Exactamente dos OWNERs activos: el del seed + uno nuevo. El seed no se
    // toca hasta la carrera misma.
    const created = await manager.post('/api/v1/users', {
      email: 'race-owner@iam-concurrency-gym.test',
      firstName: 'Race',
      lastName: 'Owner',
      roleIds: [ownerRoleId],
      branchIds: [],
    });
    expect(created.status).toBe(201);
    const raceOwnerId = (created.body as { user: { id: string } }).user.id;
    const seedOwnerId = gym.users['OWNER']!.id;

    const before = await ctx.db.raw.user.count({
      where: {
        gymId: gym.gym.id,
        status: 'ACTIVE',
        deletedAt: null,
        roleAssignments: { some: { role: { code: 'OWNER' } } },
      },
    });
    expect(before).toBe(2);

    // Dos requests concurrentes del MISMO caller neutral, cada uno
    // desactivando a uno de los dos OWNERs. Sin el lock (`SELECT ... FOR
    // UPDATE` sobre el rol OWNER dentro de la transacción), las dos pueden
    // leer "todavía queda el otro activo" al mismo tiempo y las dos
    // completar — dejando el gimnasio con 0 OWNERs activos.
    const [resSeed, resRace] = await Promise.all([
      manager.post(`/api/v1/users/${seedOwnerId}/deactivate`),
      manager.post(`/api/v1/users/${raceOwnerId}/deactivate`),
    ]);

    const statuses = [resSeed.status, resRace.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const after = await ctx.db.raw.user.count({
      where: {
        gymId: gym.gym.id,
        status: 'ACTIVE',
        deletedAt: null,
        roleAssignments: { some: { role: { code: 'OWNER' } } },
      },
    });
    expect(after).toBe(1);
  });
});
