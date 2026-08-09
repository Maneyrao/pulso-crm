# Pulso CRM

CRM y control de acceso para gimnasios. SaaS multi-tenant y multi-sede.

Un gimnasio chico o mediano opera con planillas, un cuaderno y WhatsApp a mano.
El problema real no es la falta de un sistema: es que nadie sabe **cuánto entró
hoy, quién debe y quién dejó de venir**. Pulso convierte cada evento operativo
—un alta, un cobro, un ingreso al gimnasio, una deuda— en un registro auditable
que alimenta cobranza, comunicación y decisiones.

## Estado

En construcción. El plan completo está en [`docs/`](docs/); empezá por
[`MASTER_IMPLEMENTATION_PLAN.md`](docs/MASTER_IMPLEMENTATION_PLAN.md).

## Stack

| Pieza | Tecnología |
|---|---|
| `apps/web` | Next.js 15 App Router, React 19, Tailwind v4, TanStack Query, Zustand |
| `apps/api` | NestJS 11 (monolito modular), REST `/api/v1`, Socket.IO |
| `apps/worker` | BullMQ: outbox, mensajería, vencimientos |
| `apps/local-agent` | C#/.NET 8 para el lector de huellas — Etapa 8, todavía no existe |
| Base | PostgreSQL 16 + Prisma |
| Colas y caché | Redis |
| Contratos | Zod compartido en `packages/contracts` |
| Diseño | `packages/ui`, tokens propios sobre Tailwind |

Las decisiones y sus alternativas descartadas están en [`docs/ADRS.md`](docs/ADRS.md).

## Puesta en marcha

Requisitos: Node 20+, pnpm 10, PostgreSQL 16, Redis. Docker es opcional.

```bash
pnpm install
pnpm dev:services     # levanta PostgreSQL y Redis (Docker si hay; si no, Homebrew)
cp .env.example .env  # ajustá DATABASE_URL con tu usuario de PostgreSQL
pnpm db:deploy        # aplica las migraciones
pnpm db:seed          # datos de demo
pnpm dev              # api :4001 · web :4000 · worker
```

> Los puertos 3000 y 3001 suelen estar ocupados en la máquina de desarrollo, así
> que el proyecto usa **4000 (web)** y **4001 (API)**.

### Usuarios de demo

Sólo existen en desarrollo. El seed se niega a correr con `NODE_ENV=production`.

| Email | Rol |
|---|---|
| `admin@demo.local` | Dueño |
| `recepcion@demo.local` | Recepción |
| `profe@demo.local` | Instructor |

Contraseña de los tres: `Demo.1234`.

## Comandos

```bash
pnpm dev              # todo en paralelo
pnpm test             # unit + integración (necesita PostgreSQL levantado)
pnpm lint             # eslint
pnpm typecheck        # tsc --noEmit en todo el workspace
pnpm build            # build de producción
pnpm db:migrate       # crea una migración nueva (interactivo)
pnpm db:deploy        # aplica las migraciones pendientes
pnpm db:seed          # datos de demo
pnpm db:reset         # DESTRUCTIVO, sólo local, pide confirmación
pnpm db:studio        # explorador de la base
```

## Estructura

```
apps/
  api/          NestJS — un módulo por bounded context
  web/          Next.js App Router
  worker/       BullMQ
packages/
  contracts/    esquemas Zod compartidos entre backend y frontend
  db/           Prisma: schema, migraciones, extensión de tenant, seed
  ui/           tokens y componentes
  config/       env validado, dinero, tiempo, documento, teléfono
  tsconfig/     configuración de TypeScript compartida
  eslint-config/
docs/           plan de implementación, ADRs, modelo de datos, seguridad
```

## Cómo está construido, en cuatro puntos

**El tenant sale de la sesión, nunca del cliente.** El `gymId` se toma del token
validado y una extensión de Prisma lo inyecta en toda consulta. Una consulta sin
contexto de tenant **lanza** en vez de devolver todo: un filtro que falla en
silencio es exactamente cómo un gimnasio termina viendo los datos de otro.
Ver [ADR-008](docs/ADRS.md) y [ADR-009](docs/ADRS.md).

**El dinero es `Decimal(14,2)` en la base y string decimal en la API.** Nunca
`float`, nunca `number` en JSON. Los movimientos de caja son inmutables: un
error se corrige con una reversa, que crea un movimiento nuevo. Hay triggers en
la base que lo hacen cumplir. Ver [ADR-010](docs/ADRS.md).

**Los constraints viven en PostgreSQL, no sólo en el servicio.** Uniques
parciales para documento y sesiones de caja, un `EXCLUDE` con `btree_gist` que
impide membresías solapadas, checks de dominio y triggers append-only. La
validación en TypeScript existe para dar buenos mensajes; la garantía es la base.

**Los tests de integración corren contra PostgreSQL real**, cada archivo en su
propio esquema efímero. Un mock no habría detectado ninguno de los constraints
de arriba. Ver [ADR-023](docs/ADRS.md).

## Contribuir

Antes de abrir un PR: `pnpm lint && pnpm typecheck && pnpm test` en verde.

Está prohibido desactivar un test o bajar un umbral de cobertura para que pase
el pipeline. Si un test falla, se arregla el código o se arregla el test.
