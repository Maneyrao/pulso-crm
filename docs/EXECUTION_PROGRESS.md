# EXECUTION_PROGRESS — Pulso CRM

Registro operativo de milestones del MVP. Se actualiza después de cada
milestone completado. Ante compactación de contexto, retomar desde el primer
`IN_PROGRESS` o `PENDING`.

## Estado a 2026-08-12 (tras M8)

### Milestones ya cerrados (previos)

| # | Milestone | Estado | Commits |
|---|---|---|---|
| M0 | Paso 0: CLAUDE.md | DONE | `c3759ea` |
| M1 | Paso 1: recuperación + hardening | DONE | `0ca8a13`, `3a37407` |

### Milestones del MVP

| # | Milestone | Estado | Commit | Pruebas |
|---|---|---|---|---|
| M2 | Cerrar Etapa 2 (CSRF + web tests) | DONE | `e5d403a` | csrf.spec.ts (7), Sidebar/LoginForm/BranchSelector.spec.tsx |
| M3 | Socios (frontend + docs progreso) | DONE | `617803e` | 4 pages + 4 specs (21 casos) |
| M4 | Planes y membresías | DONE | `d308903` (bk), `b0e5042` (fe) | activities/plans/memberships specs (37) |
| M5 | Caja y pagos | DONE | `28ff519` (bk), `87b3aa6` (fe) | cash-lifecycle smoke + web (8) |
| M6 | Control de acceso | DONE | `bda25e2` | access.service (regla en access-decision.spec) |
| M7 | Dashboard con indicadores reales | DONE | `a3b5667` | typecheck + reporting via UI |
| M8 | Navegación y experiencia | DONE | — (verificado) | 10 nav items → 10 páginas; sidebar filtra por permiso (Sidebar.spec) |
| M9 | Verificación final | IN_PROGRESS | — | 13 recorridos manuales pendientes |

## Métricas actuales

- **API tests**: 13 archivos, 179 passed / 17 skipped (los skips son
  allowlist por diseño en cross-tenant-suite).
- **Web tests**: 12 archivos, 55 passed.
- **Endpoints backend**: 50+ rutas cubiertas, todas con permiso y
  cross-tenant suite auto-descubierta.
- **Frontend**: 12 páginas + 4 componentes con tests; sidebar filtra por
  permiso + feature.

## Contexto rápido para retomar

- Repo: `/Users/tmaneyro22/Documents/pulso-crm`
- Servicios locales: `pnpm dev:services` (Homebrew Postgres 16 + Redis). Docker no está.
- DB de tests: harness clona `pulso_test_template` por archivo (`packages/db/src/testing.ts`).
- Reglas: `CLAUDE.md` en raíz. NestJS DI: value import + eslint-disable
  `consistent-type-imports` con nota "ver infra/redis/redis.service.ts".
- Verificación antes de commit: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`.
- `.claude/` queda intencionalmente untracked.

## Decisiones tomadas fuera del plan

- M4: BillingCycle → días fijos (MONTHLY=30, QUARTERLY=90, etc.);
  `Plan.durationDays` override. `CLASS_PACK` → endDate=null (vence por
  consumo).
- M4: `LedgerReason.MEMBERSHIP_CHARGE` (el brief decía `MEMBERSHIP`).
- M5: `openingAmount` en la columna, no como CashMovement OPENING_BALANCE
  (evita inventar un método "efectivo" implícito).
- M5: `@HttpCode(200)` en `POST /cash/sessions/close` (update de estado).
- M6: `photoUrl` en response de check devuelve `null` (columna real es
  `photoKey`, URL prefirmada pendiente).
- M6: FINGERPRINT → 409 ACCESS_INPUT_INVALID (biometría fuera del MVP).
- M6: DUPLICATE_WINDOW no decrementa classesRemaining aunque sea ALLOWED.
- M7: Zona horaria fallback = America/Argentina/Buenos_Aires sin sede.

## Deuda declarada (no oculta)

- Cross-tenant fixtures dedicados para cash sessions/movements y access
  attempts (allowlist con rationale mientras tanto).
- Búsqueda de socio por documento en modal de nuevo movement (memberId
  como Input UUID hoy).
- Foto/documentos del socio (S3 URL prefirmada) — endpoints no existen.
- Edición de membresía vigente (cambiar plan, extender fecha).

## Bloqueos externos reales

_(vacío)_
