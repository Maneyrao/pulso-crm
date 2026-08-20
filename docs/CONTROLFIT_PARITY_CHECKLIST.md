# Checklist de paridad ControlFit → Pulso CRM

Cierre de FASE 5 (2026-08-19). Complementa a `CONTROLFIT_PARITY_AUDIT.md`
(FASE 1): la auditoría define el plan; este documento registra el estado real
verificado de cada módulo al cierre.

**Leyenda de estado**

- ✅ **Real** — la pantalla consume la API de Pulso (datos vivos de `pulso_dev`).
- 🟡 **Demo** — pantalla completa y navegable con datos deterministas de
  `apps/web/lib/mock/` y badge "Demo" visible. El swap a API real es mecánico
  (mismo shape de hook que `useQuery`).
- ⛔ **Fuera de alcance** — decidido y documentado, no es un olvido.

## Módulos

| Módulo ControlFit | Ruta Pulso | Estado | Notas |
| --- | --- | --- | --- |
| Dashboard | `/dashboard` | ✅ Real | 6 KPIs + deudores principales + accesos rápidos por permiso. |
| Control de acceso | `/access` | ✅ Real | Chequeo por DNI/tarjeta contra membresía; auto-focus para lector de tarjetas. |
| Socios (listado) | `/members` | ✅ Real | Búsqueda, filtros, paginación, export CSV (`;` + BOM para Excel es-AR). |
| Nuevo socio | `/members/new` | ✅ Real | Wizard 3 pasos. Pasos Actividad+Cobro del alta: pendiente (backend existe). |
| Ficha de socio | `/members/[id]` | ✅ Real | Tabs resumen/cuenta/membresías; deep-link `?tab=`. Card de huella (demo). |
| Asistencias de socios | `/members/attendance` | ✅ Real | Listado histórico conectado a `GET /attendances`, con filtros por fecha/sede y KPIs del día. |
| Deudores | `/members/debt` | ✅ Real | Orden por saldo y antigüedad de deuda. |
| Baja de socios / inactivos | `/members/inactive` | ✅ Real | Usa deudores reales + socios inactivos reales; permite baja manual con auditoría vía endpoint existente. |
| Entrenamientos | `/workouts` | 🟡 Demo | |
| Actividades / planes | `/plans`, `/activities` | ✅ Real | CRUD de planes contra API. |
| Rutinas | `/activities/routines` | 🟡 Demo | |
| Ejercicios | `/activities/routines/exercises` | 🟡 Demo | |
| Instructores | `/instructors` | 🟡 Demo | |
| Asistencia de instructores | `/instructors/attendance` | 🟡 Demo | |
| Usuarios | `/settings/users` | ✅ Real | Alta/roles contra API. |
| Cronograma de reservas | `/schedule` | 🟡 Demo | |
| Excepciones y feriados | `/schedule/exceptions` | 🟡 Demo | |
| Calendario de reservas | `/schedule/reservations` | 🟡 Demo | Calendario mensual con feriados y reservas. |
| Caja | `/cash` | ✅ Real | Apertura/cierre/movimientos con `Idempotency-Key` (ADR-016). |
| Libro diario | `/cash/daybook` | ✅ Real | |
| Conceptos | `/cash/concepts` | ✅ Real | Sólo lectura: la API expone GET; el ABM es backend pendiente. |
| Métodos de pago | `/cash/payment-methods` | ✅ Real | Sólo lectura, ídem conceptos. |
| Facturación electrónica | `/cash/invoices` | 🟡 Demo | AFIP/ARCA real fuera del MVP. |
| Productos | `/products` | 🟡 Demo | |
| Puntos | `/loyalty/{members,history,config}` | 🟡 Demo | |
| Estadísticas | `/stats` | 🟡 Demo | Charts CSS puros, sin dependencia externa. |
| Configuración | `/config` (+ `/settings/branches`) | 🟡/✅ | General demo; sedes reales. |
| Mi cuenta | `/account` | ✅ Real | Sólo lectura: no hay endpoint de cambio de contraseña self-service (no se inventó). |
| Huella digital | ficha de socio + `/settings/devices` | 🟡 Demo | UI de enrolamiento completa sobre FakeAgent que habla el protocolo real de `docs/biometrics/WEBSOCKET_PROTOCOL.md`. Integración U.are.U real: Etapa 7-8, vía bridge local (nunca USB directo desde navegador). |
| WhatsApp | — | ⛔ Fuera de alcance | Módulo de mensajería de la API vacío; ver auditoría §6. |
| Asistente IA (extra, no existe en ControlFit) | `/ai` | 🟡 Demo | Chat con respuestas predefinidas. |

## Reglas de producto verificadas

- [x] Sin landing: `/` redirige al CRM (login → dashboard).
- [x] Lector de huella por bridge local (agente WS en `127.0.0.1:21987`), nunca WebUSB.
- [x] Identidad visual propia (tokens `@pulso/ui`, violeta, dark/light) — no es un clon visual de ControlFit.
- [x] Toda página demo lleva badge "Demo" y punto ámbar en la sidebar.
- [x] Dinero siempre como string decimal (`MoneyDisplay`), nunca float.

## Verificación de FASE 3-4 (en vivo, Playwright sobre `pulso_dev`)

- [x] Login (`admin@demo.local`) y redirección a dashboard.
- [x] Acceso por DNI real (90000001 → "Acceso permitido", plan y vencimiento).
- [x] Alta de socio en wizard de 3 pasos.
- [x] Export CSV de socios.
- [x] Dark mode: `/access` y `/dashboard` verificados por captura; toggle persiste en `localStorage` sin FOUC.
- [x] Mobile 375px: KPIs y listas apiladas, topbar compacto, drawer de navegación funcional.
- [x] Enrolamiento de huella demo (6 muestras, 1 reintento por calidad baja, cancelación).

## Bugs reales encontrados y corregidos durante la verificación

1. **Caja sin sesión rompía el header** — `GET /cash/sessions/current` devuelve
   204 → `undefined`, prohibido por TanStack Query. Normalizado a `null`
   (`lib/api/cash.ts`).
2. **Orden de deudores invertido** — los saldos deudores son negativos, por lo
   que `balance:desc` mostraba la deuda *menor* primero. Las etiquetas
   "Mayor/Menor deuda" y "Más antigua/reciente" de `/members/debt` y la query
   del dashboard mapeaban al orden opuesto. Corregido + spec actualizada.
3. **Drawer mobile invisible** — Tailwind v4 no escaneaba `packages/ui/src`,
   así que las clases usadas sólo por componentes de la lib (`fixed`,
   `inset-y-0`, `z-50` del Drawer) no se generaban. Fix: `@source` en
   `apps/web/app/globals.css`.
4. **Favicon 404** — agregado `apps/web/app/icon.svg`.
5. **Topbar 375px desbordado** — indicador "En línea" oculto bajo `sm` (queda
   hamburguesa + gimnasio + sede + tema + usuario).

## Pipeline de verificación

`pnpm lint && pnpm typecheck && pnpm build && pnpm test` en verde al cierre
(web: 37 archivos de test / 166+ tests; ver mensaje del commit de cierre).

## Deuda pendiente para el MVP vendible (Etapas 3-6)

1. Reemplazar cada página 🟡 por su endpoint real (los hooks demo tienen el
   mismo shape que `useQuery`: swap mecánico, seguir por reservas/agenda que
   son de uso diario).
2. Pasos Actividad + Cobro en el wizard de alta (backend ya existe).
3. ABM real de conceptos y métodos de pago (falta backend de escritura).
4. Cambio de contraseña self-service en `/account` (falta endpoint).
5. Huella real (Etapa 7-8): implementar Pulso Agent .NET según
   `docs/biometrics/`; la UI ya habla el protocolo.
