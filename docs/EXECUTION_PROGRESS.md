# EXECUTION_PROGRESS — Pulso CRM

Registro operativo de milestones del MVP. Se actualiza después de cada
milestone completado. Ante compactación de contexto, retomar desde el primer
`IN_PROGRESS` o `PENDING`.

## Estado a 2026-08-12 — MVP QUEDA VERIFICABLE POR EL USUARIO

### Milestones previos

| # | Milestone | Estado | Commits |
|---|---|---|---|
| M0 | Paso 0: CLAUDE.md | DONE | `c3759ea` |
| M1 | Paso 1: recuperación + hardening | DONE | `0ca8a13`, `3a37407` |

### Milestones del MVP

| # | Milestone | Estado | Commit(s) | Pruebas |
|---|---|---|---|---|
| M2 | Cerrar Etapa 2 (CSRF + web tests) | DONE | `e5d403a` | csrf.spec.ts (7) + LoginForm/Sidebar/BranchSelector |
| M3 | Socios (frontend + docs progreso) | DONE | `617803e` | 4 pages + 4 specs (21 casos) |
| M4 | Planes y membresías | DONE | `d308903` (bk), `b0e5042` (fe) | activities/plans/memberships (37) |
| M5 | Caja y pagos | DONE | `28ff519` (bk), `87b3aa6` (fe) | cash-lifecycle + web cash (8) |
| M6 | Control de acceso | DONE | `bda25e2` | access-decision (10) + integration |
| M7 | Dashboard con indicadores reales | DONE | `a3b5667` | typecheck + reporting via UI |
| M8 | Navegación y experiencia | DONE | — | 10 nav items → 10 páginas; sidebar filtra por permiso |
| M9 | Verificación final | PARTIAL | `8f3a0ff` | pipeline verde; 13 pasos manuales requieren humano |

## Verificación final ejecutada (M9)

```
pnpm lint         → 9/9 tasks OK
pnpm typecheck    → 9/9 tasks OK
pnpm build        → 5/5 tasks OK
pnpm test         → 345 tests OK (api 179+17skip, web 55, ui 75, db 23, worker 13)
```

**No ejecutado desde esta sesión (requiere humano):**
- `pnpm test:e2e` — Playwright asume `pnpm dev` corriendo local (api :4001,
  web :4000). Los 4 specs existen: `access.spec.ts`, `cash.spec.ts`,
  `login.spec.ts`, `members.spec.ts`. El usuario los corre después de
  levantar los servicios y hacer db:reset + db:seed.
- Los 13 recorridos manuales del brief (crear sede, cobrar membresía,
  registrar acceso, ver dashboard, cerrar caja) — son verificación
  browser-driven que necesita el usuario delante.

## Métricas finales

- **API**: 13 archivos de test, 179 tests passed / 17 skipped por diseño.
- **Web**: 12 archivos de test, 55 tests. 12 páginas navegables.
- **DB**: 23 tests de constraints (uniques parciales, EXCLUDE gist).
- **UI**: 75 tests de componentes de packages/ui.
- **Worker**: 13 tests de jobs.
- **Endpoints**: 50+ rutas HTTP con permiso y cross-tenant auto-cubiertas.
- **Módulos backend**: auth, tenancy, iam, members, catalog, memberships,
  cash (config + sessions + movements + daybook), access, reporting.

## Instrucciones para el usuario (M9 recorridos manuales)

```bash
# 1) Servicios locales (Postgres + Redis nativos por Homebrew)
pnpm dev:services

# 2) Reset base + seed determinístico (SÓLO local)
pnpm db:reset
pnpm db:seed

# 3) Levantar api (:4001), web (:4000), worker en paralelo
pnpm dev

# 4) Login en http://localhost:4000/login
#    Credenciales demo (packages/db/prisma/seed.ts):
#      admin@demo.local      / Demo.1234  (OWNER)
#      recepcion@demo.local  / Demo.1234  (RECEPTIONIST, sede Centro)
#      profe@demo.local      / Demo.1234  (INSTRUCTOR)

# 5) Recorrer los 13 pasos del brief:
#    1. Iniciar sesión
#    2. Crear una sucursal (/settings/branches → "Nueva sede")
#    3. Crear un usuario (/settings/users → "Nuevo usuario", copiar
#       contraseña temporal antes de cerrar el modal)
#    4. Crear un socio (/members/new — stepper de 3 pasos)
#    5. Crear un plan (/plans → "Nuevo plan")
#    6. Asignar membresía (ficha del socio → tab Membresías → "Asignar")
#    7. Abrir caja (/cash → "Abrir caja")
#    8. Cobrar la membresía (nueva membresía con charge.mode='NOW')
#    9. Consultar la cuenta corriente (ficha socio → tab Cuenta corriente)
#    10. Registrar acceso por documento (/access, tipear el DNI)
#    11. Confirmar la asistencia (aparece en el resultado y en la ficha)
#    12. Ver caja y dashboard actualizados (/cash, /dashboard)
#    13. Cerrar caja (/cash → "Cerrar caja" → declarar arqueo)

# 6) E2E automatizado (opcional, requiere servicios y datos)
pnpm test:e2e
```

## Contexto rápido para retomar

- Repo: `/Users/tmaneyro22/Documents/pulso-crm`
- Reglas: `CLAUDE.md` en raíz. NestJS DI: value import + eslint-disable
  `consistent-type-imports`.
- Verificación antes de commit: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`.
- `.claude/` queda intencionalmente untracked.

## Decisiones tomadas fuera del plan

- M4: BillingCycle → días fijos (MONTHLY=30, QUARTERLY=90, etc.);
  `Plan.durationDays` override. `CLASS_PACK` → endDate=null.
- M4: `LedgerReason.MEMBERSHIP_CHARGE` (el brief decía `MEMBERSHIP`).
- M5: `openingAmount` en la columna, no como CashMovement OPENING_BALANCE.
- M5: `@HttpCode(200)` en `POST /cash/sessions/close`.
- M6: `photoUrl` en response de check devuelve `null` (columna real es
  `photoKey`, URL prefirmada pendiente).
- M6: FINGERPRINT → 409 ACCESS_INPUT_INVALID (biometría fuera del MVP).
- M6: DUPLICATE_WINDOW no decrementa classesRemaining.
- M7: Zona horaria fallback = America/Argentina/Buenos_Aires sin sede.

## Deuda declarada (no oculta)

- Cross-tenant fixtures dedicados para cash sessions/movements y access
  attempts (allowlist con rationale mientras tanto).
- Búsqueda de socio por documento en modal de nuevo movement.
- Foto/documentos del socio (S3 URL prefirmada) — endpoints no existen.
- Edición de membresía vigente (cambiar plan, extender fecha).
- Aprobaciones de LARGE_EXPENSE (CashOperationRequest).
- Reversas sobre sesiones CLOSED (hoy sólo permite sobre OPEN).

## Fuera de alcance del MVP (explícito)

- Huella digital + agente local .NET (Etapa 7-8).
- WhatsApp real (mock hasta post-MVP).
- Deploy a producción.
- Facturación electrónica ARCA, POS, rutinas, fidelización (Etapa 10-13).

## Bloqueos externos reales

_(vacío)_
