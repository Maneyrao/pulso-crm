# Auditoría comparativa ControlFit ↔ Pulso CRM

Fecha: 2026-08-19
Fuente de referencia: `controlfit-reference/` (28 capturas de rutas, capturas mobile,
snapshots de sidebar). Referencia funcional, NO de marca: Pulso mantiene su
identidad visual propia (tokens "Pulso Violeta", tema claro por defecto).

## 1. Pantallas que EXISTEN en Pulso (contra API real, probadas)

| Ruta | Equivalente ControlFit | Nota |
|---|---|---|
| `/dashboard` | `/dashboard` | 6 KPIs reales (supera los 5 de CF); sin actividad reciente ni alertas |
| `/access` | `/access` | Input documento/tarjeta + 13 reason codes + CTA contextual. Sin huella, sin estado de hardware |
| `/members` | `/members` | Filtros + tabla + paginación. Sin exportar |
| `/members/new` | `/members/new` | Stepper 3 pasos (Identidad/Contacto/Revisión). CF usa Datos/Actividad/Cobro — falta membresía+cobro en el alta |
| `/members/[id]` | (ficha) | Resumen/Membresías/Cuenta corriente. Bug: no lee `?tab=` |
| `/members/debt` | `/members/debt` | Orden + paginación. Sin tabs por membresía/cta corriente ni toggle asistencia posterior |
| `/plans` | `/activities` (planes) | CRUD completo en modal |
| `/activities` | (actividades) | CRUD completo |
| `/cash` | `/cash` | Sesión + movimientos + arqueo. Más completo que la demo de CF |
| `/cash/daybook` | `/cash/resume` | Libro diario por rango |
| `/settings/branches` | (config sedes) | CRUD |
| `/settings/users` | `/users` | CRUD + roles + reset password (CF lo tiene como listado + alta en página) |
| `/login` | `/login` | Completo |

## 2. Pantallas que FALTAN (vs. mapa obligatorio)

Con backend existente (conectar de una):
- `/cash/concepts` — GET/CRUD conceptos ya en API (módulo cash)
- `/cash/payment-methods` — métodos de pago ya en API
- `/account` — datos de `GET /auth/me`

Sin backend (arrancan con datos mock marcados):
- `/members/attendance` (asistencias socios)
- `/members/inactive` (baja: retraso >45d / sin asistir >30d, baja masiva)
- `/workouts` (entrenamientos: socio, puntaje, estado rutina, instructor)
- `/activities/routines`, `/activities/routines/new`, `/activities/routines/exercises`
- `/instructors`, `/instructors/new`, `/instructors/attendance`
- `/schedule` (cronograma), `/schedule/exceptions`, `/schedule/reservations` (calendario mensual con badges)
- `/cash/invoices` (factura electrónica ARCA)
- `/products`
- `/loyalty/members`, `/loyalty/history`, `/loyalty/config`
- `/stats`
- `/ai` (chat asistente)
- `/config` (tabs: Gimnasio / Facturación / App mobile, con accordions)
- Huella digital: enrolamiento en ficha + dispositivos en settings

Decisión consciente: NO se replica el módulo WhatsApp de CF como copia; Pulso ya
tiene `messaging` (vacío en API) planificado — se difiere y se deja fuera de la
sidebar hasta tener backend (regla CLAUDE.md), igual que en CF varias rutas
están vacías en demo.

## 3. Funciones que faltan

1. **Shell**: sidebar plana sin grupos, sin logo, sin colapso, sin footer; topbar sin fecha/hora ni estado del sistema de acceso; **cero responsive** (sin drawer mobile, tablas sin variante card).
2. **Alta de socio**: falta paso Actividad (membresía) y Cobro — el backend ya soporta `POST memberships` con `charge.mode='NOW'`.
3. **Acceso**: falta estado de hardware (agente/lector/barrera) y método huella.
4. **Deudores**: falta tab "por cuenta corriente" y toggle "con asistencia posterior al vencimiento".
5. **Exportar** en listado de socios.
6. **Dashboard**: falta actividad reciente, alertas (deudores, por vencer, hardware), accesos de hoy.
7. **Dark mode**: tokens `.dark` completos pero sin toggle.
8. **Animaciones**: solo `transition-colors`; falta motion operacional (accordion, page fade, skeleton shimmer, number ticker) respetando `prefers-reduced-motion`.
9. **Deep-link roto**: `AccessResultCard` → `?tab=` no leído por la ficha.
10. **Estado activo ambiguo** en sidebar (`/members` vs `/members/debt`).

## 4. Componentes a crear o mejorar

Crear (en `packages/ui` si son genéricos, `apps/web/components` si son de dominio):
- `SidebarGroup` (accordion animado) + `Sidebar` colapsable + drawer mobile (Radix Dialog)
- `AppFooter` (copyright + slot de estado de hardware)
- `LiveClock` + bloque fecha/hora topbar
- `Calendar` mensual con badges (reservas/feriados)
- `StatCard` con tendencia + sparkline ligera (sin dependencia de charts pesada)
- `Avatar` con iniciales
- `PageHeader` (icono + título + subtítulo + acciones) — patrón CF de título de página
- `MockBadge` ("Datos de demostración") para páginas sin backend
- `FingerprintPanel` (estados del agente: sin agente / conectado / capturando / calidad)
- Chat panel simple para `/ai`
Mejorar: `DataTable` (variante card mobile), `Tabs` (con iconos), `StatusBadge` (ya ok).

## 5. Modelo de datos faltante para huella digital

Ya especificado en `docs/biometrics/` (fuera de MVP, Etapa 7-8). Modelos Prisma a
agregar cuando se implemente:

- `AgentDevice` — agente local pareado: `id, gymId, branchId, name, status(NOT_CONFIGURED|PENDING_APPROVAL|ACTIVE|DISABLED|REVOKED), machineFingerprint, credentialHash, agentVersion, lastHeartbeatAt`
- `BiometricEnrollment` — sesión de enrolamiento: `id, memberId, deviceId, status(PENDING|COMPLETED|EXPIRED|FAILED), samplesRequired, minQuality, expiresAt`
- `BiometricCredential` — template cifrado: `id, memberId, finger, templateEncrypted(bytes), format, quality, enrolledByUserId, revokedAt`
- `AgentAuditEvent` — eventos del agente sin PII
- Enum `AccessMethod.FINGERPRINT` ya existe; `AccessAttempt.deviceId` a agregar.

Arquitectura confirmada (ya diseñada, se respeta): lector U.are.U 4500 →
**Pulso Agent** (Windows, WS local 127.0.0.1:21987) → CRM web → backend
(matching 1:N centralizado, ADR-014) → PostgreSQL. El navegador nunca toca USB.
La UI de esta etapa habla el protocolo de `WEBSOCKET_PROTOCOL.md` contra un
cliente mock (`FakeAgent`) para que la Etapa 7-8 solo cambie el transporte.

## 6. Plan de implementación priorizado

1. **Shell v2** (base de todo): sidebar agrupada/colapsable con TODOS los módulos, logo, footer, topbar con fecha/hora + estado, drawer mobile, fix estado activo. Motion CSS (sin framer-motion: Tailwind v4 + transitions).
2. **Rutas con backend real faltantes**: `/cash/concepts`, `/cash/payment-methods`, `/account`; fix deep-link `?tab=`.
3. **Módulo Socios paridad**: `/members/attendance`, `/members/inactive` (mock), export CSV client-side, tabs en deudores (la parte cta. corriente real ya existe vía ledger… si no hay endpoint agregado, tab con mock marcado).
4. **Acceso + huella UI**: footer hardware, panel huella con FakeAgent, enrolamiento en ficha (UI), `/settings/devices` mock.
5. **Entrenamiento**: `/workouts`, rutinas, ejercicios, instructores (mock).
6. **Reservas**: cronograma, excepciones, calendario mensual (mock).
7. **Resto**: productos, loyalty, stats, ai, config tabs, invoices (mock).
8. **Alta de socio con Actividad+Cobro** (real, backend existente) — al final por riesgo: toca flujo probado.
9. **Dashboard v2**: alertas + actividad reciente (real donde haya endpoint, mock donde no).
10. Verificación completa: `pnpm lint && pnpm typecheck && pnpm build && pnpm test` + revisión visual contra capturas.

Nota de gobernanza: las páginas mock violan deliberadamente la regla
"no crear rutas sin endpoint" de CLAUDE.md por instrucción directa del usuario
(2026-08-19); cada una queda marcada con `MockBadge` y su data aislada en
`lib/mock/` para el swap a TanStack Query + API real.
