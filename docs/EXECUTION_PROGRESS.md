# EXECUTION_PROGRESS — Pulso CRM

Registro operativo de milestones del MVP. Se actualiza después de cada
milestone completado. Ante compactación de contexto, retomar desde el primer
`IN_PROGRESS` o `PENDING`.

## Estado a 2026-08-12

### Milestones ya cerrados (previos)

| # | Milestone | Estado | Commits |
|---|---|---|---|
| M0 | Paso 0: CLAUDE.md | DONE | `c3759ea` |
| M1 | Paso 1: recuperación + hardening | DONE | `0ca8a13`, `3a37407` |

### Milestones del MVP

| # | Milestone | Estado | Commit | Notas |
|---|---|---|---|---|
| M2 | Cerrar Etapa 2 (CSRF + web tests) | IN_PROGRESS | — | CSRF token se emite pero no se verifica (gap); web sólo tiene KpiCard.spec.tsx |
| M3 | Socios | PENDING | — | Backend members.controller/service existe (73 + 494 líneas); memberships/frontend por revisar |
| M4 | Planes y membresías | PENDING | — | catalog: sólo serializer. memberships: vacío. Frontend inexistente. |
| M5 | Caja y pagos | PENDING | — | cash-config existe (payment-methods, concepts, registers); cash sessions + movements + reversals faltan. |
| M6 | Control de acceso | PENDING | — | access-decision.ts existe (spec incluida); controller + integración frontend faltan. |
| M7 | Dashboard | PENDING | — | reporting/ vacío. Frontend KpiCard existe, sin datos reales. |
| M8 | Navegación y experiencia | PENDING | — | Sidebar existe con filtro por permiso; nav completa por auditar. |
| M9 | Verificación final | PENDING | — | 13 recorridos manuales al final. |

## Contexto rápido para retomar

- Repo: `/Users/tmaneyro22/Documents/pulso-crm`
- Servicios locales: `pnpm dev:services` (Homebrew Postgres 16 + Redis). Docker no está.
- DB de tests: harness clona `pulso_test_template` por archivo (`packages/db/src/testing.ts`).
- Reglas: `CLAUDE.md` en raíz. NestJS DI: value import + eslint-disable
  `consistent-type-imports` con nota "ver infra/redis/redis.service.ts".
- Verificación antes de commit: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`.
- `.claude/` queda intencionalmente untracked.

## Decisiones tomadas fuera del plan

_(vacío por ahora)_

## Bloqueos externos reales

_(vacío)_
