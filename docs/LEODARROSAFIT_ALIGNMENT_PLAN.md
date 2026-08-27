# Plan de alineación — LeoDarrosaFIT.html → apps/web

Fecha: 2026-08-20
Fuente visual obligatoria: `/Users/tmaneyro22/Documents/LeoDarrosaFIT.html`
Regla: cada ruta visible en el sidebar debe tener backend real, alias real, o quedar **oculta**. Sin botones demo que parezcan reales.

## 1. Design tokens de la especificación

| Token | Dark (activo en la referencia) | Light |
|---|---|---|
| `--color-bg` | `#151312` | `#f3f2f2` |
| `--color-surface` | `#1a1817` | `#eae9e9` |
| `--color-text` | `#ece9e6` | `#201e1d` |
| `--color-accent` | `#f0a028` (ámbar) | `#ec3013` |
| Bordes/divisores | `#2e2b29`, grosor 2px | neutral-300 |
| Success | `#5fbf77` | — |
| Danger | `#d43b29` / `#ec3013` | — |
| Muted | `#9a938c` / `#8a8079` | — |

- Tipografía: **Archivo** (Google Fonts, 400–800), headings weight 800; h1 42px, h2 32px, h3 25px, h4 20px; body 15px/1.55.
- Radios: **0px en todo** (bordes rectos, sin rounding).
- Sombras: sm `0 1px 2px rgba(45,43,43,.14)`, md `0 3px 10px rgba(45,43,43,.16)`, lg `0 12px 32px rgba(45,43,43,.22)`.
- Spacing: 4/8/12/16/24/32.
- Animaciones: `lfFadeIn`, `lfScaleIn`, `lfPulse` (dot de estado), `lfShimmer` (skeleton); todo 0.001s con `prefers-reduced-motion`.
- Marca: logo caja 26×26 `#f0a028` con "LD"; wordmark "LeoDarrosa**FIT**" (FIT en accent). Nota: la marca del producto sigue siendo configurable por gym (`GET /gym`); el shell usa nombre del gym con el mismo tratamiento tipográfico.

## 2. Shell

- Sidebar ~240px (60px colapsado), fondo `#151312`, grupos con label uppercase, items con abbr (colapsado), toggle abajo. Borde derecho 2px `#2e2b29`.
- Topbar sticky 56px, fondo `#1a1817`, borde inferior 2px: hamburguesa (mobile) · título de página · selector de sede · fecha/hora en vivo · **badge estado del agente de acceso** (dot verde pulsante "EN LÍNEA") · toggle sonido · campana de notificaciones (panel fijo 320px top-right).
- Contenido max-width 1440px, padding 20px.
- Mobile <768px: drawer con backdrop 60%.

## 3. Matriz de alineación

Estados: ✅ real · 🔁 alias real · 🚧 rediseño pendiente · 🙈 oculta (sin backend) · 🆕 backend nuevo (fase 4)

| Ruta HTML | Ruta Next | Endpoint backend | Estado | Trabajo faltante |
|---|---|---|---|---|
| `#/dashboard` | `/dashboard` | `GET /reports/dashboard`, `GET /attendances`, `GET /members/debtors` | ✅🚧 | Rediseño LeoDarrosa: 4 KPIs, chart de afluencia por hora (buckets desde `GET /attendances` de hoy), últimos accesos (`GET /access/attempts`), vencimientos, caja hoy |
| `#/access` | `/access` | `POST /access/check`, `GET /access/attempts`, `POST /biometrics/identifications` | ✅ | DNI/tarjeta + modo huella single-shot en bucle, estado real del agente y resultado biométrico desde PostgreSQL. |
| `#/members` | `/members` | `GET /members` | ✅🚧 | Rediseño tabla (cols: Socio, DNI, Plan, Vence, Estado, Deuda; filtros Todos/Activos/En deuda/Vencidos) |
| `#/members/new` | `/members/new` | `POST /members`, `POST /members/:id/memberships`, `POST /cash/movements` | ✅🚧 | Form multi-paso (Datos → Plan y membresía → Pago) componiendo endpoints reales existentes |
| `#/members/attendance` | `/members/attendance` | `GET /attendances` | ✅🚧 | Rediseño (cols: Socio, Plan, Método, Sede, Fecha, Hora; filtros Hoy/Semana/Mes) |
| `#/members/debt` | `/members/debt` | `GET /members/debtors` | ✅🚧 | Rediseño |
| `#/members/inactive` | `/members/inactive` | `GET /members?status=INACTIVE` | ✅🚧 | Rediseño |
| `#/workouts` | — | no existe | 🙈 | Ocultar (hoy es mock). Backend de rutinas es proyecto aparte |
| `#/activities` | `/plans` | `GET/POST/PATCH/DELETE /plans` | 🔁🚧 | Alias: nav "Planes" → `/plans`. Rediseño tabla (Plan, Ciclo, Precio, Clases, Socios, Estado) |
| `#/activities/new` | `/plans` (modal→página) | `POST /plans` | 🔁🚧 | Página form multi-paso "Nuevo plan" con endpoints reales |
| `#/activities/routines` | — | no existe | 🙈 | Ocultar |
| `#/activities/routines/new` | — | no existe | 🙈 | Ocultar |
| `#/activities/routines/exercises` | — | no existe | 🙈 | Ocultar |
| `#/instructors` | — | no existe | 🙈 | Ocultar (hoy mock) |
| `#/instructors/new` | — | no existe | 🙈 | Ocultar |
| `#/instructors/attendance` | — | no existe | 🙈 | Ocultar |
| `#/users` | `/settings/users` | `GET/POST/PATCH /users`, `GET /roles` | 🔁🚧 | Nav "Usuarios" (grupo Staff) → `/settings/users`. Rediseño |
| `#/users/new` | `/settings/users` (modal) | `POST /users` | 🔁 | Se mantiene modal dentro de la página |
| `#/schedule` | — | no existe | 🙈 | Ocultar (mock) |
| `#/schedule/exceptions` | — | no existe | 🙈 | Ocultar |
| `#/schedule/reservations` | — | no existe | 🙈 | Ocultar |
| `#/cash` | `/cash` | `GET/POST /cash/sessions/*`, `/cash/movements` | ✅🚧 | Rediseño vista sesión actual |
| `#/cash/resume` | `/cash/daybook` | `GET /cash/daybook` | 🔁🚧 | Alias nav "Libro diario" → `/cash/daybook` |
| `#/cash/concepts` | `/cash/concepts` | `GET/POST/PATCH /cash/concepts` | ✅🚧 | Rediseño |
| `#/cash/payment-methods` | `/cash/payment-methods` | `GET/POST/PATCH /cash/payment-methods` | ✅🚧 | Rediseño |
| `#/cash/invoices` | — | no existe (ARCA) | 🙈 | Ocultar (hoy mock). Integración ARCA es proyecto aparte |
| `#/products` | — | no existe | 🙈 | Ocultar (hoy mock) |
| `#/whatsapp` | — | messaging provider mock | 🙈 | Ocultar hasta WhatsApp real (regla CLAUDE.md) |
| `#/whatsapp/messages` | — | — | 🙈 | Ocultar |
| `#/whatsapp/broadcast` | — | — | 🙈 | Ocultar |
| `#/whatsapp/config` | — | — | 🙈 | Ocultar |
| `#/loyalty/members` | — | no existe | 🙈 | Ocultar (hoy mock) |
| `#/loyalty/history` | — | no existe | 🙈 | Ocultar |
| `#/loyalty/config` | — | no existe | 🙈 | Ocultar |
| `#/stats` | `/stats` | `GET /reports/dashboard`, `GET /attendances` | ✅🚧 | Sólo métricas reales (hoy: ingresos, asistencias, deuda, vencimientos + afluencia). Se eliminan los gráficos demo de 12 meses |
| `#/ai` | — | no existe | 🙈 | Ocultar (hoy mock hardcodeado) |
| `#/config` | `/config` | `GET/PATCH /gym`, `GET/POST/PATCH/DELETE /branches` | ✅🚧 | Rehacer con datos reales (tabs Gimnasio/Sedes con accordion LeoDarrosa). Se eliminan las secciones que no persisten |
| `#/account` | `/account` | `GET /auth/me` | ✅🚧 | Rediseño accordion Perfil/Seguridad |
| — (hardware grid de `#/access`) | `/settings/devices` | 🆕 `GET/POST /agents`, `POST /agents/:id/approve|revoke` | 🆕 | Pasa de mock a real en fase 4 (gestión de agentes) |

Rutas Next que quedan **eliminadas del sidebar y del build** (mock sin backend): `/workouts`, `/activities/routines`, `/activities/routines/exercises` (nunca existió page propia), `/instructors`, `/instructors/attendance`, `/schedule`, `/schedule/exceptions`, `/schedule/reservations`, `/cash/invoices`, `/products`, `/loyalty/*`, `/ai`. Los mocks (`lib/mock/data/*`) se borran junto con sus páginas.

## 4. Sidebar final (sólo backend real)

```
PRINCIPAL    Dashboard /dashboard · Acceso /access
SOCIOS       Socios /members · Nuevo socio /members/new · Asistencias /members/attendance ·
             Deudores /members/debt · Baja e inactivos /members/inactive
ACTIVIDADES  Planes /plans · Nuevo plan /plans/new · Actividades /activities
STAFF        Usuarios /settings/users
CAJA         Caja /cash · Libro diario /cash/daybook · Conceptos /cash/concepts ·
             Métodos de pago /cash/payment-methods
ANÁLISIS     Estadísticas /stats
SISTEMA      Configuración /config · Sedes /settings/branches · Dispositivos /settings/devices (fase 4) ·
             Mi cuenta /account
```

## 5. Fases

### Fase 1 — Shell y tokens (bloqueante para todo lo demás)
- `packages/ui/src/tokens.css` + `apps/web/app/globals.css`: paleta LeoDarrosa (dark default `#151312`/`#f0a028`, light `#f3f2f2`/`#ec3013`), Archivo vía `next/font`, radius 0, bordes 2px, sombras y keyframes `lf*`.
- `Sidebar` / `Header` reconstruidos según §2 (grupos con label, abbr colapsado, sede/fecha-hora/badge agente/sonido/notificaciones).
- `nav-items.ts` → estructura de grupos de §4; se quitan los items mock.
- Componentes compartidos (`Button`, `Card`, `DataTable`, `Tag`, `Modal`, `PageHeader`) restylados a la spec.

### Fase 2 — Rutas reales con diseño LeoDarrosa
- Dashboard, Access (sin agente aún: feed real, sin grid de hardware falso), Members ×5, Plans (+`/plans/new`), Activities, Cash ×4, Users, Branches, Config real (gym+sedes), Account, Stats real recortado.

### Fase 3 — Purga de demo
- Borrar páginas mock + `lib/mock/` + flag `mock` del sidebar + permisos/features huérfanos en nav. Ningún botón sin efecto real.

### Fase 4 — Fingerprint real
Arquitectura (docs/biometrics/*): DigitalPersona U.are.U USB → `apps/local-agent` (.NET 8, Windows, servicio) → `wss://127.0.0.1:21987/agent/v1` → frontend → backend Nest → PostgreSQL.
1. `packages/contracts/src/agent-protocol.ts` (mensajes WS v1.0, Zod) + `biometrics.ts` (consent, enrollment, credential) + fixtures en `docs/biometrics/protocol-fixtures/`.
2. API Nest: módulo `agents` (pair/heartbeat/approve/revoke, `PENDING_APPROVAL`), módulo `biometrics` (consent obligatorio verificado en backend, enrollments con `deviceToken` de un solo uso TTL 120s con scope, `enroll-complete` cifrando template AES-256-GCM envelope por tenant con AAD `gymId||credentialId||keyVersion`, `identify` 1:N con umbral y respuesta `{resolved:true}` **sin PII al agente**), decisión de acceso reutilizando `access-decision`, resultado al navegador por el WS del backend (`realtime`). Prisma: `BiometricConsent`, `BiometricEnrollment`, `BiometricCredential`, `Agent`, `AgentAuditEvent`.
3. Web: cliente WS local (`hello`→`hello.ack`, ping 15s, backoff con jitter, Zod en cada mensaje entrante, `deviceToken` nunca persistido), badge de estado en topbar, enrolamiento desde ficha del socio (tab Biometría con consentimiento previo), identificación single-shot repetida con token nuevo en `/access`, `/settings/devices` real.
4. `apps/local-agent`: solución .NET 8 (`Host/Core/Protocol/Sensors/Backend`), `FakeSensor` funcional para desarrollo sin hardware (macOS incluido), `HidDigitalPersonaSensor` stub documentado (requiere Windows + SDK, T-7.1).
- Reglas duras: nunca imagen de huella; sólo templates cifrados; consentimiento verificado en backend (`409 NO_BIOMETRIC_CONSENT`); el agente no recibe PII; DNI/tarjeta siguen funcionando siempre.

### Gate entre fases (obligatorio, todo en verde)
`pnpm --filter @pulso/{api,web,contracts} lint` · `typecheck` · `pnpm --filter @pulso/{api,web} test` · `build`.

## 6. Registro de avance

| Fase | Estado | Commit |
|---|---|---|
| Matriz (este doc) | ✅ | — |
| Fase 1 shell/tokens | ✅ tokens dark-first LeoDarrosa, Archivo, radius 0, bordes 2px, sidebar agrupada, componentes @pulso/ui restylados | (ver git log) |
| Fase 2 rutas reales | 🔶 en curso: dashboard, access, members ×2, cash ×4, config, account, stats, settings/users rediseñados; specs realineados (Radix Select/Tabs, labels con asterisco de required). `/plans/new` creado (wizard 3 pasos de la referencia sobre `POST /plans`, sólo campos con backend — sin instructor/cupo/recargo/puntos) y agregado al nav | |
| Fase 3 purga demo | ✅ eliminados del build: workouts, activities/routines(+exercises), instructors(+attendance), schedule(+exceptions+reservations), cash/invoices, products, loyalty ×3, ai, `lib/mock/` completo y el flag `mock` del sidebar. `/settings/devices` se mantiene (decisión previa: integración con llegada concreta en Fase 4) con sus datos demo co-locados en la página | (ver git log) |
| Fase 4 fingerprint | ✅ software end-to-end (2026-08-27): Pulso Agent .NET con pareo de primer arranque, heartbeat de lector, `FakeSensor` de identidad estable, enrolamiento y `identify` 1:N; API con tokens IDENTIFY de un solo uso, resultado seguro y aislamiento cross-tenant; `/access` activa/detiene huella y repite lecturas con token nuevo. El agente mantiene `{resolved:true}` sin PII. Pendiente exclusivamente de hardware: driver/SDK DigitalPersona, matcher del fabricante y validación del U.are.U en Windows. | |

Notas de la pata .NET (2026-08-21):
- Backoff HTTP configurable: `AddPulsoAgentBackend(url, retryBaseDelay)` + env de sólo-tests `PULSO_AGENT_HTTP_RETRY_BASE_MS` (los reintentos 2s/4s/8s de la spec §7 hacían inalcanzable el camino `BACKEND_UNREACHABLE` dentro del timeout de los tests).
- `SessionManager.BeginAsync` con gracia de teardown (`OperationTimeouts.TeardownGrace`, 5s): el protocolo no define ack para `identify.stop`, así que un `identify.start` inmediato corría contra la liberación de la sesión y recibía `AGENT_BUSY` intermitente. Una operación activa NO cancelada sigue rechazándose inmediato.
