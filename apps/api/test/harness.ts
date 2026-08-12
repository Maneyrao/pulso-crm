import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { createTestDatabase, type TestDatabase } from '@pulso/db/testing';
import { createPrismaClient } from '@pulso/db';
import { SYSTEM_ROLE_CODES, SYSTEM_ROLE_PERMISSIONS } from '@pulso/contracts';
import argon2 from 'argon2';
import { AppModule } from '../src/app.module.js';
import { AppConfig } from '../src/common/config/app-config.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { TenantContextStore } from '../src/common/auth/tenant-context.js';
import { GlobalExceptionFilter } from '../src/common/errors/exception.filter.js';
import { RequestContextMiddleware } from '../src/common/logging/request-context.middleware.js';

/**
 * Arranca la aplicación real contra un esquema efímero de PostgreSQL.
 *
 * No se mockea nada del pipeline: guards, interceptores y filtro de errores son
 * los de producción. Un test que mockea el guard no prueba el control de acceso,
 * prueba el mock.
 */
export interface TestApp {
  app: INestApplication;
  db: TestDatabase;
  baseUrl: string;
  close(): Promise<void>;
}

export async function createTestApp(label: string): Promise<TestApp> {
  const db = await createTestDatabase(label);

  // El cliente de `db.prisma` (de @pulso/db/testing) resuelve el tenant por una
  // variable local del harness (`setTenant`/`asTenant`), pensada para tests que
  // manipulan Prisma directo, SIN pasar por HTTP. Acá la app corre de verdad
  // (guards, interceptores, controllers reales) y el tenant lo fija
  // `AuthGuard` en `TenantContextStore` (el `AsyncLocalStorage` de producción)
  // en cada request — así que el `PrismaService` de la app necesita SU PROPIO
  // cliente, resuelto por ese mismo store, apuntando al esquema efímero.
  const appPrisma = createPrismaClient({
    resolveGymId: () => TenantContextStore.getGymId(),
    datasourceUrl: db.url,
  });

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    // El PrismaService del test apunta al esquema efímero, no a la base de desarrollo.
    .overrideProvider(PrismaService)
    .useValue({
      client: appPrisma,
      unscoped: () => db.raw,
      isHealthy: async () => true,
      pendingMigrationsCheck: async () => ({ applied: 3 }),
      onModuleInit: async () => undefined,
      onModuleDestroy: async () => undefined,
    })
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
  app.use(cookieParser());
  app.use(new RequestContextMiddleware().use.bind(new RequestContextMiddleware()));
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  await app.listen(0);

  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  return {
    app,
    db,
    baseUrl: url,
    async close() {
      await app.close();
      await appPrisma.$disconnect();
      await db.destroy();
    },
  };
}

void AppConfig;

/** Gimnasio con roles, un usuario por rol y una sede. */
export async function seedGymWithUsers(
  db: TestDatabase,
  opts: { slug: string; password?: string },
) {
  const password = opts.password ?? 'Prueba.1234';
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const plan = await db.raw.saasPlan.upsert({
    where: { code: 'test-plan' },
    update: {},
    create: {
      code: 'test-plan',
      name: 'Test',
      maxBranches: 10,
      maxMembers: 10_000,
      maxUsers: 50,
      // 'multi_branch' habilita crear más de una sede (FeatureGuard,
      // ADR-022) — se incluye por defecto acá porque casi todos los tests
      // de branches.spec.ts/cross-tenant-suite.spec.ts asumen que
      // `POST /branches` funciona sin configurar nada extra. El resto de la
      // lista no son FEATURE_KEYS reales (ver packages/contracts/src/features.ts);
      // quedan así porque nada las valida todavía, fuera de alcance acá.
      features: ['members', 'catalog', 'cash', 'access', 'messaging', 'reports', 'multi_branch'],
      monthlyPrice: '0',
    },
  });

  const gym = await db.raw.gym.create({
    data: { slug: opts.slug, name: opts.slug, saasPlanId: plan.id },
  });

  const branch = await db.raw.branch.create({
    data: { gymId: gym.id, name: 'Sede Única' },
  });

  await db.raw.memberCounter.create({ data: { gymId: gym.id, last: 0 } });

  const users: Record<string, { id: string; email: string }> = {};

  for (const code of SYSTEM_ROLE_CODES) {
    const role = await db.raw.role.create({
      data: {
        gymId: gym.id,
        code,
        name: code,
        isSystem: true,
        permissions: [...SYSTEM_ROLE_PERMISSIONS[code]],
      },
    });
    const email = `${code.toLowerCase()}@${opts.slug}.test`;
    const user = await db.raw.user.create({
      data: {
        gymId: gym.id,
        email,
        passwordHash,
        firstName: code,
        lastName: 'Test',
        roleAssignments: { create: { gymId: gym.id, roleId: role.id } },
        branchAccess: { create: { gymId: gym.id, branchId: branch.id } },
      },
    });
    users[code] = { id: user.id, email };
  }

  return { gym, branch, users, password };
}

/** Cliente HTTP mínimo que conserva las cookies, como hace un navegador. */
export class TestClient {
  private cookies = new Map<string, string>();

  constructor(private readonly baseUrl: string) {}

  async request(
    method: string,
    path: string,
    opts: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; body: unknown; headers: Headers }> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...opts.headers,
    };
    if (this.cookies.size > 0) {
      headers['cookie'] = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });

    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const idx = pair!.indexOf('=');
      const name = pair!.slice(0, idx);
      const value = pair!.slice(idx + 1);
      if (value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }

    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body, headers: res.headers };
  }

  get = (p: string, h?: Record<string, string>) => this.request('GET', p, { headers: h });
  post = (p: string, body?: unknown, h?: Record<string, string>) =>
    this.request('POST', p, { body, headers: h });
  patch = (p: string, body?: unknown, h?: Record<string, string>) =>
    this.request('PATCH', p, { body, headers: h });
  del = (p: string, h?: Record<string, string>) => this.request('DELETE', p, { headers: h });

  getCookie(name: string): string | undefined {
    return this.cookies.get(name);
  }
  setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }
  clearCookies(): void {
    this.cookies.clear();
  }
}
