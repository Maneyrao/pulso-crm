# Plan del frontend — Pulso CRM

Fecha: 2026-08-09
Estado: propuesto.

## 1. Base técnica

| Pieza | Elección | Nota |
|---|---|---|
| Framework | Next.js App Router + TypeScript `strict` | ADR-004 |
| Estilos | Tailwind CSS | ADR-005 |
| Componentes | shadcn/ui copiados a `packages/ui` y personalizados | identidad propia |
| Estado de servidor | TanStack Query | única vía de datos de negocio |
| Estado de UI | Zustand | **sin persistir tokens ni PII** |
| Formularios | react-hook-form + `zodResolver` con esquemas de `packages/contracts` | validación idéntica a la del backend |
| Tablas | TanStack Table sobre componentes propios | densidad de panel operativo |
| Gráficos | Recharts | Etapa 6 |
| Fechas | `date-fns` + `date-fns-tz` | zona de la sede, ADR-021 |
| Iconos | lucide-react | ya usado por el usuario en otro proyecto |
| Tests | Vitest + Testing Library; Playwright para E2E | |

### Regla dura de datos

Todo dato de negocio se pide con TanStack Query desde Client Components. Los Server Components arman layout y shell. Motivo: una sola ruta de autenticación, una sola ruta de manejo de `401`, y la sesión vive en cookies que el cliente reenvía automáticamente.

## 2. Identidad visual propia

Requisito del brief: no reproducir trade dress ajeno. Reglas concretas para Claude Code:

- **Prohibido** abrir capturas del producto auditado para "inspirarse" en layout, colores o copy.
- **Prohibido** copiar textos de `raw/all-ui-strings-extracted.txt`. Ese archivo es evidencia de auditoría, no una fuente de copy.
- Paleta, tipografía, radios, sombras y densidad se definen en `packages/ui/tokens.css` desde cero.
- Dirección propuesta (a validar con el usuario): **tema claro por defecto** con acento propio, tema oscuro disponible. El producto auditado usa panel oscuro con acento; ir por claro por defecto es una diferenciación deliberada además de una preferencia de accesibilidad en recepción con luz ambiente alta.

Tokens iniciales:

```css
:root {
  --pulso-bg: #FBFBFD;
  --pulso-surface: #FFFFFF;
  --pulso-border: #E4E4EA;
  --pulso-fg: #16161D;
  --pulso-fg-muted: #5C5C6B;
  --pulso-accent: #2F5BEA;
  --pulso-accent-fg: #FFFFFF;
  --pulso-success: #17795E;
  --pulso-warning: #A96500;
  --pulso-danger: #C42B2B;
  --pulso-radius: 10px;
}
```

Todos los pares texto/fondo deben cumplir **WCAG AA (4.5:1)**; los estados de acceso permitido/denegado se verifican también en simulación de deuteranopía, porque no pueden depender sólo del color.

## 3. Estructura de rutas

```
app/
  (auth)/
    login/page.tsx
    select-gym/page.tsx          # sólo si el email pertenece a más de un gimnasio
  (app)/
    layout.tsx                   # AppShell: sidebar + header + guards
    dashboard/page.tsx
    access/page.tsx
    members/
      page.tsx
      new/page.tsx
      [id]/page.tsx
      [id]/edit/page.tsx
      debt/page.tsx
      attendance/page.tsx
      inactive/page.tsx
    plans/
      page.tsx
      new/page.tsx
      [id]/page.tsx
    activities/page.tsx
    cash/
      page.tsx                   # caja del turno
      daybook/page.tsx
      concepts/page.tsx
      payment-methods/page.tsx
      approvals/page.tsx
    reports/page.tsx
    users/
      page.tsx
      new/page.tsx
    settings/
      page.tsx
      branches/page.tsx
      messaging/page.tsx
      devices/page.tsx           # Etapa 8
    messaging/
      page.tsx
      broadcast/page.tsx
    account/page.tsx
  error.tsx
  not-found.tsx
```

Etapas posteriores agregan `schedule/`, `products/`, `training/`, `loyalty/`, `billing/`, `assistant/`, `platform/`.

## 4. Layout y navegación

### `AppShell`

- **Sidebar** colapsable, agrupado por módulo. Cada ítem se filtra por permiso **y** por feature del plan. Un ítem sin permiso no se renderiza (no se renderiza deshabilitado: no revela qué existe).
- **Header**: nombre del gimnasio, **selector de sede**, buscador global (`⌘K`), campana de notificaciones, menú de usuario.
- **Barra de estado inferior**: estado de la sesión de caja del usuario y, desde la Etapa 8, estado del agente local y del lector.
- **Modal de sesión expirada**: al recibir `401 SESSION_EXPIRED`, se muestra un modal bloqueante con opción de reingresar sin perder la ruta actual.

### Selector de sede

- Estado en Zustand + espejo en cookie de UI (no httpOnly, no sensible) para que el SSR del shell no parpadee.
- Cambiar de sede llama `POST /auth/select-branch` y hace `queryClient.clear()` — **crítico**: no arrastrar datos de la sede anterior.
- Si el usuario tiene una sola sede, el selector no se muestra.

### Guards

Tres capas, ninguna sustituye a las otras:

1. `middleware.ts`: si no hay cookie de sesión, redirige a `/login`. Sólo eso; **no** decide permisos.
2. `<RequirePermission perm="cash:operate">`: oculta o reemplaza por un estado "sin acceso".
3. El backend rechaza igual. La UI es conveniencia, **nunca** control de acceso.

## 5. Capa de datos

```
lib/
  api/
    client.ts        # fetch con credentials:'include', X-CSRF-Token, requestId, parseo de ProblemDetails
    errors.ts        # ApiError con code tipado
  query/
    keys.ts          # factory de query keys
    provider.tsx
  hooks/
    useSession.ts
    usePermission.ts
    useFeature.ts
    useActiveBranch.ts
```

### Query keys

Toda key incluye `gymId` y, si el recurso es por sede, `branchId`. Evita colisiones al cambiar de contexto:

```ts
export const qk = {
  members: (gymId: string, branchId: string | null, filters: MemberFilters) =>
    ['members', gymId, branchId, filters] as const,
  member: (gymId: string, id: string) => ['member', gymId, id] as const,
  cashSession: (gymId: string, branchId: string) => ['cash-session', gymId, branchId] as const,
}
```

### Manejo de errores centralizado

- `401 UNAUTHENTICATED` → intento silencioso de `POST /auth/refresh`; si falla, modal de sesión expirada.
- `403 FORBIDDEN` → toast "No tenés permiso para esta acción".
- `403 FEATURE_NOT_ENABLED` → pantalla de upsell del módulo, no un error genérico.
- `409` / `422` → los `errors[]` se mapean a los campos del formulario por `path`.
- `429` → toast con el `Retry-After`.
- `500` → toast + reporte a Sentry con `requestId` visible para soporte.

### Mutaciones

- Cada mutación con efecto de dinero/mensajería genera un `Idempotency-Key` **una vez** y lo reusa en los reintentos de ese intento.
- Optimistic updates sólo donde revertir es trivial (marcar leída una notificación). **Nunca** en caja ni en membresías.

## 6. Pantallas — especificación

Formato: Ruta · Objetivo · Roles · Componentes · Datos · Estados · Responsive · Accesibilidad · Tests.

---

### 6.1 `/login` — Etapa 2

- **Objetivo**: autenticar.
- **Roles**: público.
- **Componentes**: `LoginForm`, `GymPicker` (si `409 MULTIPLE_GYMS`).
- **Mutations**: `POST /auth/login`.
- **Formulario**: email (requerido, formato), password (mín. 8). Validación Zod compartida.
- **Loading**: botón con spinner, campos deshabilitados.
- **Error**: **un solo mensaje genérico** "Email o contraseña incorrectos" — no distinguir cuál falló. Cuenta bloqueada muestra su propio mensaje con el tiempo restante.
- **Success**: redirige a `/dashboard` o al `returnTo`.
- **Responsive**: una columna en móvil; ilustración/marca sólo desde `md`.
- **Accesibilidad**: `<form>` real, labels asociadas, `aria-invalid`, errores en `role="alert"`, foco al primer campo con error, submit con Enter.
- **Tests**: login feliz; credenciales inválidas no revelan cuál falló; bloqueo; navegación completa por teclado; el password nunca aparece en el DOM serializado ni en logs.

---

### 6.2 `/dashboard` — Etapa 6

- **Objetivo**: foto del día en 5 segundos.
- **Roles**: todos los autenticados; cada tarjeta se filtra por permiso.
- **Componentes**: `KpiCard` ×6, `AttendanceByHourChart`, `ExpiringMembershipsList`, `PendingApprovalsCard`.
- **Queries**: `GET /reports/dashboard`, `refetchInterval: 60s`.
- **Loading**: skeletons con la forma final (sin saltos de layout).
- **Empty**: gimnasio recién creado → tarjeta de onboarding con los 3 próximos pasos.
- **Error**: cada tarjeta falla de forma independiente; una caída no rompe la página.
- **Responsive**: 1 col (móvil) / 2 (tablet) / 4 (desktop).
- **Accesibilidad**: cada gráfico tiene una tabla equivalente accesible por `<details>`; no depender del color para el signo.
- **Tests**: render con datos; render vacío; error parcial; oculta KPIs financieros sin `stats:read`.

---

### 6.3 `/access` — Etapa 5, ampliada en Etapa 8

La pantalla más usada del producto. Debe funcionar con una persona parada frente al mostrador.

- **Objetivo**: validar el ingreso en menos de 2 segundos y dejar registro.
- **Roles**: `access:operate`.
- **Componentes**: `AccessInput` (foco permanente), `AccessResultCard`, `RecentAttemptsList`, `AgentStatusBadge` (Etapa 8).
- **Datos**: `POST /access/check`; WS `access.resolved` para intentos originados en el lector.
- **Interacción**: el input mantiene el foco siempre; un lector de tarjetas que "tipea" y manda Enter funciona sin tocar nada. Autodetección: sólo dígitos → documento; prefijo configurable → tarjeta.
- **Estados de resultado**: banner grande, con **texto + icono + color** (nunca sólo color):
  - `ALLOWED/OK` → verde, foto, nombre, plan, vencimiento, clases restantes.
  - `ALLOWED/DUPLICATE_WINDOW` → azul, "Ya registró asistencia hoy".
  - `DENIED/MEMBERSHIP_EXPIRED` → ámbar, vencimiento y botón "Cobrar cuota" (si tiene permiso).
  - `DENIED/NO_CLASSES_LEFT` → ámbar, botón "Vender pack".
  - `DENIED/NOT_FOUND` → gris, botón "Crear socio".
  - `DENIED/DEBT_BLOCKED` → rojo, deuda y botón "Cobrar deuda".
- **Loading**: el resultado se muestra a los ~150 ms como skeleton para que no parezca colgado.
- **Error de red**: el resultado anterior no se borra; aparece un banner "Sin conexión — reintentando".
- **Responsive**: pensada para 1024×768 mínimo (PC de recepción). En móvil, layout vertical.
- **Accesibilidad**: el resultado se anuncia por `aria-live="assertive"`. Tipografía grande (≥ 20 px en el nombre). Contraste AA reforzado.
- **Tests**: cada `reasonCode` renderiza su estado; el foco vuelve al input tras cada consulta; Enter dispara; evento WS pinta el resultado; **sin permiso, la pantalla no es accesible**.

---

### 6.4 `/members` — Etapa 3

- **Objetivo**: encontrar cualquier socio en pocos segundos.
- **Roles**: `member:read`.
- **Componentes**: `MemberFilters`, `MemberTable`, `Pagination`, `MemberQuickActions`.
- **Queries**: `GET /members` con `keepPreviousData` (la tabla no parpadea al paginar).
- **Filtros**: búsqueda (debounce 300 ms, mín. 2 caracteres), estado, sede, plan, estado de membresía, con deuda, rango de alta. Los filtros viven en la URL para poder compartir el link.
- **Columnas**: nombre, documento **enmascarado**, teléfono, sede, plan y vencimiento, saldo, estado.
- **Empty**: sin socios → CTA "Crear el primer socio". Con filtros y sin resultados → "Sin resultados" + botón "Limpiar filtros". **Son estados distintos y no se confunden.**
- **Error**: fila de error con reintento, manteniendo los filtros.
- **Responsive**: en móvil, tarjetas en vez de tabla.
- **Accesibilidad**: `<table>` semántica con `<caption>`, encabezados ordenables como `<button>` con `aria-sort`.
- **Tests**: filtros se reflejan en la URL y sobreviven al recargar; documento enmascarado sin permiso; empty vs. sin-resultados; paginación.

---

### 6.5 `/members/new` — Etapa 3

- **Objetivo**: alta completa sin perder datos.
- **Roles**: `member:write`.
- **Componentes**: `Stepper` de 3 pasos — Datos personales → Plan y membresía → Cobro.
- **Paso 1**: documento (validado por tipo y país), nombre, apellido, contacto, sede, foto (cámara o archivo), tarjeta.
- **Paso 2**: plan, fecha de inicio, instructor opcional, precio (con override si tiene permiso). Se puede omitir.
- **Paso 3**: cobrar ahora (método de pago, exige caja abierta) **o** finalizar sin cobrar generando deuda. Las dos salidas son válidas y están igual de visibles.
- **Validación**: por paso, con Zod; no se avanza con errores. El documento se verifica contra el backend al salir del campo (`409 DUPLICATE_DOCUMENT` inline).
- **Loading**: el submit final bloquea el botón y muestra progreso.
- **Error**: si el paso 3 falla, **el socio ya creado no se pierde**: se redirige a su ficha con un aviso "Socio creado, falta cobrar".
- **Success**: ficha del socio con toast y, si se cobró, opción de enviar recibo.
- **Guardado**: borrador en `sessionStorage` (sin foto) para no perder la carga si se recarga.
- **Accesibilidad**: el stepper es una lista con `aria-current="step"`; los errores mueven el foco.
- **Tests**: alta con cobro; alta con deuda; documento duplicado inline; sin caja abierta el paso 3 explica qué hacer; recarga conserva el borrador; **la idempotencia impide doble alta con doble click**.

---

### 6.6 `/members/[id]` — Etapa 3

- **Objetivo**: todo sobre el socio en una pantalla.
- **Componentes**: `MemberHeader` (foto, nombre, estado, saldo, acciones), tabs: Resumen · Membresías · Cuenta corriente · Asistencias · Documentos · Biometría (Etapa 8).
- **Acciones**: asignar membresía, cobrar deuda, registrar asistencia manual, editar, dar de baja, enrolar huella.
- **Estados**: saldo negativo se destaca con color **y** con la etiqueta "Deuda".
- **Tests**: tabs cargan de forma independiente; acciones ocultas sin permiso; documento enmascarado; el tab de biometría no aparece si la feature está apagada.

---

### 6.7 `/cash` — Etapa 4

- **Objetivo**: operar el turno sin ambigüedad sobre el estado de la caja.
- **Roles**: `cash:operate`, `cash:open_close`.
- **Sin sesión abierta**: pantalla dedicada con `OpenSessionForm` (caja, monto inicial). **No** se muestra el listado de movimientos: si no hay caja abierta, no hay nada que operar.
- **Con sesión abierta**: `SessionSummary` (apertura, total por método, saldo esperado), `MovementList`, botones Ingreso / Egreso / Cerrar caja.
- **Cierre**: modal con arqueo por método de pago; muestra esperado vs. declarado y la diferencia **en vivo** mientras se tipea. Si hay operaciones pendientes, el botón está deshabilitado con la lista de pendientes y un link para resolverlas.
- **Reversa**: exige motivo de mín. 10 caracteres; confirmación explícita con el monto escrito en el diálogo.
- **Loading**: la lista de movimientos usa skeleton; el resumen no se recalcula en el cliente (viene del backend, para que no haya dos verdades).
- **Error**: `409 PENDING_OPERATIONS` se muestra como lista accionable, no como toast.
- **Realtime**: WS `cash.session.updated` refresca el resumen si otro usuario opera la misma caja.
- **Accesibilidad**: los montos se leen con `aria-label` completo ("quince mil pesos"). Los diálogos destructivos tienen foco inicial en Cancelar.
- **Tests**: apertura; ingreso; egreso; reversa con confirmación; cierre con diferencia; **cierre bloqueado por pendientes**; el resumen coincide con el backend.

---

### 6.8 `/cash/daybook` — Etapa 4

Libro diario: timeline unificado de aperturas, movimientos y cierres, agrupado por día **en la zona de la sede**. Filtros por rango, sede, método, tipo. Exportable (Etapa 6). Los movimientos revertidos se muestran tachados con link a su reversa — **nunca ocultos**.

---

### 6.9 `/members/debt` y `/members/inactive` — Etapa 3

Listados especializados con acción masiva "Enviar recordatorio" (Etapa 6, con preview y confirmación explícita del alcance).

---

### 6.10 `/plans`, `/activities` — Etapa 3

CRUD estándar. Regla de UI: al desactivar un plan con membresías activas, el diálogo dice **cuántas** hay y qué pasa con ellas.

---

### 6.11 `/users` — Etapa 2

CRUD de usuarios y asignación de roles por sede. La contraseña **no** la elige el administrador: el sistema genera una temporal de un solo uso. Se muestra una vez, con botón de copiar y advertencia.

---

### 6.12 `/settings/devices` — Etapa 8

- **Objetivo**: instalar, aprobar y monitorear agentes locales.
- **Roles**: `device:manage`.
- **Componentes**: `AgentList` (estado, versión, última conexión, lector detectado), `PairAgentDialog` (muestra el secreto **una sola vez**), `AgentEventLog`.
- **Estados**: agente nunca conectado / conectado / desconectado hace X / lector desconectado / versión desactualizada.
- **Acciones**: aprobar, revocar (con motivo), descargar instalador, ver eventos.
- **Tests**: el secreto se muestra una vez y no vuelve a la API; revocar refleja el estado; un agente de otra sede no aparece.

---

### 6.13 `/messaging` — Etapa 6

Historial con filtros por estado y tipo; reintento individual. `/messaging/broadcast`: selección de audiencia por filtros, **preview obligatorio** con la cuenta de destinatarios y el texto renderizado con un socio de ejemplo, y confirmación escribiendo la cantidad. Es una acción difícil de revertir; la UI lo trata como tal.

---

### 6.14 `/reports` — Etapa 6

Tabs Asistencia · Economía · Socios. Filtros por rango de fecha, rango horario y sede. Cada gráfico tiene tabla accesible equivalente y botón de exportar (con permiso `stats:export`). El ranking de asistencia muestra el documento **enmascarado**.

---

## 7. Componentes compartidos (`packages/ui`)

| Componente | Nota |
|---|---|
| `Button`, `Input`, `Select`, `Checkbox`, `RadioGroup`, `Textarea`, `Switch` | base shadcn/ui con tokens propios |
| `DataTable` | ordenamiento, selección, empty/loading/error integrados |
| `Pagination` | cursor y offset |
| `MoneyInput` | trabaja con **string decimal**, nunca con `number` |
| `MoneyDisplay` | formatea según `Gym.currency` |
| `DocumentInput` | máscara y validación por tipo/país |
| `PhoneInput` | normaliza a E.164 |
| `DateRangePicker` | consciente de la zona de la sede |
| `ConfirmDialog` | confirmación destructiva con motivo obligatorio opcional |
| `EmptyState`, `ErrorState`, `LoadingSkeleton` | los tres estados son componentes, no improvisaciones por pantalla |
| `PermissionGate`, `FeatureGate` | |
| `StatusBadge` | texto + icono + color |
| `PhotoCapture` | cámara o archivo, con recorte |

## 8. Accesibilidad — mínimos no negociables

- Contraste AA en todo texto; AAA en el resultado de acceso.
- Navegación completa por teclado, incluida la pantalla de acceso.
- Foco visible siempre (no se elimina el outline).
- Formularios con labels reales; errores asociados por `aria-describedby` y anunciados.
- Diálogos con trampa de foco y `Escape` para cerrar.
- Estados nunca comunicados sólo por color.
- `prefers-reduced-motion` respetado.
- Auditoría con axe en CI sobre las pantallas críticas: login, access, members, cash.

## 9. Rendimiento

| Objetivo | Valor |
|---|---|
| LCP de `/access` | < 1,5 s en la PC de recepción |
| Respuesta visible de `/access/check` | < 500 ms p95 |
| Bundle de la ruta de acceso | < 200 KB gzip |
| Sin layout shift al cargar datos | CLS < 0,05 |

Medios: `next/dynamic` para gráficos y para el capturador de foto; `next/image` para fotos de socios; prefetch de la ficha del socio al hacer hover en la tabla.

## 10. Testing del frontend

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Componentes | Vitest + Testing Library | estados loading/empty/error/success, permisos, accesibilidad básica |
| Contratos | Vitest | los mocks de MSW se validan contra los esquemas Zod de `packages/contracts` — un mock desactualizado **rompe el test** |
| E2E | Playwright | los flujos de §11 |
| Accesibilidad | axe-core en Playwright | login, access, members, cash |
| Visual | opcional, post-MVP | |

**Regla**: los mocks de MSW se derivan de los esquemas Zod. Prohibido escribir un mock a mano que no valide contra el contrato — es la forma más común de tener tests verdes contra una API que ya cambió.

## 11. Flujos E2E obligatorios del MVP

1. Login → seleccionar sede → dashboard.
2. Crear socio → asignar plan → cobrar con caja abierta → verificar saldo en cero.
3. Crear socio → asignar plan → finalizar sin cobrar → verificar deuda → cobrarla después.
4. Abrir caja → ingreso → egreso → reversa con motivo → cerrar con diferencia.
5. Acceso por documento: socio activo permitido; socio vencido denegado; segundo intento no duplica asistencia.
6. Cobrar cuota → el recibo de WhatsApp queda encolado y visible en el historial.

## 12. Lo que el frontend NO hace

- No decide permisos (sólo los refleja).
- No calcula saldos, totales de caja ni diferencias (los pide al backend).
- No guarda tokens.
- No guarda documento, teléfono ni datos biométricos en `localStorage`.
- No hace matching biométrico.
- No conoce la conexión a la base.
