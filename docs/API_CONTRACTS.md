# Contratos del backend — Pulso CRM

Fecha: 2026-08-09
Estado: propuesto. API **propia**: no replica rutas, nombres ni formas del producto auditado.

## 1. Convenciones generales

### 1.1 Base y versionado

- Base: `https://api.<dominio>/api/v1`
- Versionado por path. `v1` se congela cuando haya un cliente externo (agente local, app móvil).
- Cambios compatibles (agregar campo opcional) no suben versión. Cambios incompatibles sí.

### 1.2 Autenticación

- Cookies `httpOnly`: `pulso_at` (access, ~15 min) y `pulso_rt` (refresh, ~30 días, rotativo, `Path=/api/v1/auth`).
- El **agente local** no usa cookies: usa `Authorization: Bearer <deviceToken>` con tokens de un solo uso emitidos por el backend.
- CSRF: mutaciones requieren header `X-CSRF-Token` que debe coincidir con la cookie no-httpOnly `pulso_csrf` (double submit).

### 1.3 Tenant

**Nunca se lee de un header.** `gymId` y sedes permitidas salen del token. Si el body o la query traen `branchId`, se valida contra la sesión; si no pertenece, la respuesta es `404`, no `403` (no revelar existencia).

### 1.4 Formato de error

RFC 7807 extendido. Siempre este shape, en todos los errores:

```json
{
  "type": "https://docs.pulso.app/errors/CASH_SESSION_NOT_OPEN",
  "code": "CASH_SESSION_NOT_OPEN",
  "title": "No hay una sesión de caja abierta",
  "status": 409,
  "detail": "El usuario no tiene una sesión de caja abierta en esta sede.",
  "requestId": "01J...",
  "errors": [
    { "path": "amount", "code": "invalid_format", "message": "Debe ser decimal con hasta 2 decimales" }
  ]
}
```

`code` es un enum estable en `packages/contracts`. El frontend **nunca** hace matching por `title` ni por `detail`.

Códigos transversales:

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | falla Zod |
| 401 | `UNAUTHENTICATED` | sin sesión o access token vencido |
| 401 | `SESSION_EXPIRED` | refresh inválido o reusado |
| 403 | `FORBIDDEN` | permiso faltante |
| 403 | `FEATURE_NOT_ENABLED` | feature no incluida en el plan SaaS |
| 404 | `NOT_FOUND` | inexistente **o de otro tenant** |
| 409 | `CONFLICT` | violación de regla de negocio |
| 409 | `IDEMPOTENCY_KEY_REUSED` | misma clave, cuerpo distinto |
| 422 | `BUSINESS_RULE_VIOLATION` | regla de dominio |
| 429 | `RATE_LIMITED` | con header `Retry-After` |
| 500 | `INTERNAL_ERROR` | nunca expone stack |

### 1.5 Paginación

Cursor por defecto. Offset sólo donde el usuario necesita saltar a una página concreta (listado de socios).

Request: `?limit=25&cursor=<opaco>` o `?limit=25&page=3`
Response:

```json
{
  "data": [ ... ],
  "pageInfo": { "limit": 25, "nextCursor": "...", "hasMore": true, "total": 1284 }
}
```

`limit` máximo 100. `total` sólo en modo offset (un `COUNT` extra tiene costo).

### 1.6 Filtros y orden

- Filtros: query params explícitos, tipados en Zod. **Prohibido** un filtro genérico tipo `?where=`.
- Orden: `?sort=lastName&order=asc`. Campos ordenables en allowlist por endpoint.
- Búsqueda de texto: `?q=`, mínimo 2 caracteres, con rate limit.

### 1.7 Fechas y zonas

- Instantes: ISO-8601 con offset (`2026-08-09T14:30:00-03:00`). Se guardan en UTC.
- Fechas de negocio: `YYYY-MM-DD`.
- Rangos de reportes: `?from=2026-08-01&to=2026-08-31`, interpretados en la **zona de la sede** filtrada. Si el filtro abarca varias sedes con zonas distintas, la respuesta incluye `timezoneUsed` y se documenta el criterio.

### 1.8 Dinero

- Siempre **string decimal**: `"15000.00"`. Nunca `number` (ADR-010).
- Toda respuesta con dinero incluye `currency` a nivel de recurso o de envelope.

### 1.9 Idempotencia

Endpoints marcados `Idem: sí` aceptan y **exigen** `Idempotency-Key: <uuid>`.

- Misma clave + mismo `requestHash` → devuelve la respuesta original con `Idempotency-Replayed: true`.
- Misma clave + cuerpo distinto → `409 IDEMPOTENCY_KEY_REUSED`.
- Clave en curso → `409 IDEMPOTENCY_IN_PROGRESS`.

### 1.10 Rate limits

| Grupo | Límite |
|---|---|
| `POST /auth/login` | 5 / 15 min por IP+email, más backoff por usuario |
| `GET /members?q=` | 30 / min por usuario |
| `POST /access/*` | 60 / min por sede |
| `POST /biometrics/identify` | 60 / min por agente |
| `POST /messages/broadcast` | 3 / hora por gimnasio |
| `POST /assistant/*` | 20 / hora por usuario |
| Global autenticado | 300 / min por usuario |

---

## 2. Plantilla de especificación

Cada endpoint se documenta así. Se muestra completa para los endpoints críticos y abreviada para el resto de los CRUD.

```
Método + Ruta
Permiso / Feature
Input (Zod)
Output
Errores
Reglas de negocio
Transacción
Idempotencia
Eventos emitidos
Jobs disparados
Tests obligatorios
```

---

## 3. Auth — Etapa 2

### `POST /api/v1/auth/login`

| | |
|---|---|
| **Permiso** | público |
| **Feature** | — |
| **Input** | `{ email: string.email(), password: string.min(8), gymSlug?: string }` |
| **Output** | `200 { user: { id, firstName, lastName, email }, gym: { id, slug, name, currency, features: string[] }, branches: [{ id, name, timezone }], permissions: string[], defaultBranchId }` + `Set-Cookie` de `pulso_at`, `pulso_rt`, `pulso_csrf` |
| **Errores** | `401 INVALID_CREDENTIALS` (mensaje genérico, no distingue email inexistente de password mala), `423 ACCOUNT_LOCKED`, `403 GYM_SUSPENDED`, `409 MULTIPLE_GYMS` cuando el email existe en más de un gimnasio y falta `gymSlug` |
| **Reglas** | argon2id. Timing constante: si el email no existe, igual se hace un hash dummy. `failedLoginCount++`; a los 10 intentos, `lockedUntil = now + 15 min`. Un usuario inactivo o de gimnasio suspendido no entra. |
| **Transacción** | sí (actualizar contadores + crear `RefreshToken`) |
| **Idem** | no |
| **Eventos** | `AuditEvent(USER_LOGIN)` o `USER_LOGIN_FAILED` |
| **Jobs** | — |
| **Tests** | credenciales válidas; password mala; usuario inactivo; gimnasio suspendido; lockout tras N intentos; cookies con flags correctos; **respuesta no filtra si el email existe**; email en dos gimnasios |

### `POST /api/v1/auth/refresh`

Input: sólo cookie. Output: `204` + cookies rotadas.
Reglas: valida `tokenHash`, no vencido, no revocado. **Si el token ya fue rotado (reuso), revoca toda la `familyId`**, emite `AuditEvent(SECURITY_REFRESH_REUSE)` y devuelve `401 SESSION_EXPIRED`.
Tests: refresh feliz; refresh vencido; **replay de token rotado invalida la familia**; refresh de usuario desactivado.

### `POST /api/v1/auth/logout`
Revoca la familia de refresh, limpia cookies. `204`. Idempotente por naturaleza.

### `GET /api/v1/auth/me`
Devuelve el mismo shape que login (sin cookies). Es la fuente de verdad de permisos y features para el frontend.

### `POST /api/v1/auth/select-branch`
Input `{ branchId }`. Valida pertenencia. Re-emite el access token con la sede activa. `200 { activeBranchId }`.
Test: **seleccionar una sede de otro gimnasio devuelve `404`**.

---

## 4. Tenancy — Etapa 2

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| GET | `/gym` | `config:read` | datos del gimnasio + features |
| PATCH | `/gym` | `config:write` | |
| GET | `/branches` | `config:read` | |
| POST | `/branches` | `config:write` | valida `maxBranches` del plan SaaS → `403 PLAN_LIMIT_REACHED` |
| PATCH | `/branches/:id` | `config:write` | |
| DELETE | `/branches/:id` | `config:write` | sólo desactiva; `409 BRANCH_HAS_ACTIVE_DATA` si tiene socios o caja abierta |

---

## 5. IAM — Etapa 2

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/users` | `user:read` |
| POST | `/users` | `user:write` |
| GET | `/users/:id` | `user:read` |
| PATCH | `/users/:id` | `user:write` |
| POST | `/users/:id/deactivate` | `user:write` |
| POST | `/users/:id/reset-password` | `user:write` |
| GET | `/roles` | `user:read` |
| POST | `/roles` | `user:write` |
| PATCH | `/roles/:id` | `user:write` |

Reglas: no se puede desactivar al último `OWNER` (`409 LAST_OWNER`). No se puede auto-quitar `user:write`. Los roles de sistema no se editan, se clonan. La creación de usuario **no acepta password del cliente**: genera una temporal y marca `mustChangePassword`.

---

## 6. Socios — Etapa 3

### `GET /api/v1/members`

| | |
|---|---|
| **Permiso** | `member:read` (+ `member:read_document` para ver documento completo) |
| **Input** | `q?`, `status?`, `branchId?`, `planId?`, `membershipStatus? (ACTIVE|EXPIRED|NONE)`, `hasDebt?`, `createdFrom?`, `createdTo?`, `page?`, `limit?`, `sort?`, `order?` |
| **Output** | lista con `id, memberNumber, firstName, lastName, documentMasked, phone, status, branch{id,name}, activeMembership{planName,endDate,classesRemaining} | null, balance, photoUrl?` |
| **Reglas** | `documentMasked` salvo permiso (ADR-018). `photoUrl` es prefirmada, TTL 5 min. |
| **Tests** | filtros combinados; **socio de otro gimnasio no aparece**; documento enmascarado sin permiso; paginación estable |

### `POST /api/v1/members`

| | |
|---|---|
| **Permiso** | `member:write` · **Idem: sí** |
| **Input** | `{ documentType, documentNumber, firstName, lastName, branchId, email?, phone?, birthDate?, gender?, address?, cardNumber?, notes? }` |
| **Output** | `201 { id, memberNumber, ... }` |
| **Errores** | `409 DUPLICATE_DOCUMENT`, `409 DUPLICATE_CARD`, `404` si `branchId` no es del tenant |
| **Reglas** | Documento normalizado (sin puntos/espacios) y validado según `documentType` y `Gym.country`. Teléfono normalizado a E.164. `memberNumber` correlativo por gimnasio, asignado con `SELECT ... FOR UPDATE` sobre un contador del tenant (no `MAX+1` sin lock). |
| **Transacción** | sí |
| **Eventos** | `AuditEvent(MEMBER_CREATED)`, `OutboxEvent(member.created)` |
| **Tests** | alta feliz; documento duplicado en el mismo gimnasio → 409; **mismo documento en otro gimnasio → OK**; `memberNumber` correlativo bajo concurrencia; normalización de documento y teléfono |

### Resto de socios

| Método | Ruta | Permiso | Idem | Notas |
|---|---|---|---|---|
| GET | `/members/:id` | `member:read` | | incluye membresías, últimos pagos, últimas asistencias |
| PATCH | `/members/:id` | `member:write` | | auditado con `before`/`after` |
| POST | `/members/:id/deactivate` | `member:delete` | | soft delete; `409 MEMBER_HAS_DEBT` si `balance < 0` salvo `force: true` con motivo |
| POST | `/members/:id/photo/upload-url` | `member:write` | | devuelve URL prefirmada; valida MIME y máx. 5 MB |
| POST | `/members/:id/documents/upload-url` | `member:write` | | ídem, máx. 10 MB |
| GET | `/members/:id/ledger` | `member:read` | | asientos + saldo |
| POST | `/members/:id/ledger` | `payment:collect` | sí | ajuste manual; exige `reason`; **sólo `ADJUSTMENT`** |
| GET | `/members/:id/attendances` | `attendance:read` | | |
| GET | `/members/debtors` | `member:read` | | `balance < 0`, ordenable por antigüedad de deuda |

---

## 7. Catálogo y membresías — Etapa 3

| Método | Ruta | Permiso | Idem |
|---|---|---|---|
| GET/POST | `/activities`, `/activities/:id` | `plan:read` / `plan:write` | |
| GET/POST | `/plans`, `/plans/:id` | `plan:read` / `plan:write` | |
| DELETE | `/plans/:id` | `plan:write` | soft delete; `409 PLAN_IN_USE` si tiene membresías activas |

### `POST /api/v1/members/:id/memberships`

| | |
|---|---|
| **Permiso** | `membership:write` · **Idem: sí** |
| **Input** | `{ planId, branchId, startDate, instructorId?, priceOverride?, charge: { mode: "NOW" \| "DEBT", paymentMethodId?, amount? } }` |
| **Output** | `201 { membership, ledgerEntry, cashMovement? }` |
| **Errores** | `409 OVERLAPPING_MEMBERSHIP`, `409 CASH_SESSION_NOT_OPEN` (si `mode: NOW`), `404 PLAN_NOT_FOUND`, `422 PLAN_NOT_AVAILABLE_IN_BRANCH` |
| **Reglas** | `endDate = startDate + plan.durationDays`. `classesRemaining = plan.classesIncluded`. `pricePaid` congela el precio. `mode: NOW` exige sesión de caja abierta del usuario en esa sede. `mode: DEBT` crea el `DEBIT` sin tocar caja. |
| **Transacción** | `SERIALIZABLE`: `Membership` + `LedgerEntry(DEBIT)` + [`CashMovement` + `LedgerEntry(CREDIT)`] + recálculo de `Member.balance` con `FOR UPDATE` + `OutboxEvent` + `AuditEvent` |
| **Eventos** | `membership.created`, `payment.collected` (si aplica) |
| **Jobs** | recibo de WhatsApp (Etapa 6) |
| **Tests** | alta con cobro; alta con deuda; solapamiento → 409; **sin caja abierta → 409**; el saldo del socio cuadra con la suma del ledger; **doble POST con la misma `Idempotency-Key` crea una sola membresía**; concurrencia: dos POST simultáneos no crean dos membresías |

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| GET | `/members/:id/memberships` | `member:read` | |
| POST | `/memberships/:id/cancel` | `membership:delete` | exige motivo; no borra; audita |

---

## 8. Caja — Etapa 4

### `POST /api/v1/cash/sessions`

| | |
|---|---|
| **Permiso** | `cash:open_close` · **Idem: sí** |
| **Input** | `{ cashRegisterId, openingAmount: MoneyString, notes? }` |
| **Output** | `201 { session }` |
| **Errores** | `409 CASH_REGISTER_ALREADY_OPEN`, `409 USER_ALREADY_HAS_OPEN_SESSION`, `404` si la caja no es de una sede permitida |
| **Reglas** | Los dos índices únicos parciales de `CashSession` son la garantía real; el chequeo previo es sólo para dar un buen mensaje. |
| **Transacción** | sí |
| **Eventos** | `AuditEvent(CASH_SESSION_OPENED)`, WS `cash.session.updated` |
| **Tests** | apertura feliz; segunda apertura de la misma caja → 409; segunda apertura del mismo usuario en otra caja → 409; **concurrencia: dos aperturas simultáneas, una sola gana** |

### `POST /api/v1/cash/sessions/:id/close`

| | |
|---|---|
| **Permiso** | `cash:open_close` · **Idem: sí** |
| **Input** | `{ declared: [{ paymentMethodId, amount: MoneyString }], notes? }` |
| **Output** | `200 { session, details, differenceTotal }` |
| **Errores** | `409 PENDING_OPERATIONS` (con la lista de pendientes), `409 SESSION_ALREADY_CLOSED`, `403 NOT_SESSION_OWNER` salvo `cash:approve` |
| **Reglas** | **No se cierra con operaciones pendientes** (requisito del brief). Se calcula `expected` por método sumando movimientos. `difference = declared - expected`. Diferencia sobre umbral → alerta. |
| **Transacción** | `SERIALIZABLE` con `FOR UPDATE` sobre la sesión y lectura de pendientes |
| **Tests** | cierre feliz; **cierre con pendiente → 409**; cálculo de diferencia por método; cierre de sesión ajena sin permiso → 403; **concurrencia: dos cierres simultáneos, uno solo cierra** |

### `POST /api/v1/cash/movements`

| | |
|---|---|
| **Permiso** | `cash:operate` · **Idem: sí** |
| **Input** | `{ type: "INCOME"|"EXPENSE", cashConceptId, paymentMethodId, amount, detail?, memberId? }` |
| **Errores** | `409 CASH_SESSION_NOT_OPEN`, `422 AMOUNT_MUST_BE_POSITIVE`, `409 REQUIRES_APPROVAL` (egreso sobre umbral → crea `CashOperationRequest` y devuelve `202` con el id de la solicitud) |
| **Transacción** | sí |
| **Tests** | ingreso; egreso; egreso sobre umbral genera solicitud y **no** genera movimiento; monto ≤ 0 → 422; sin caja abierta → 409 |

### `POST /api/v1/cash/movements/:id/reverse`

| | |
|---|---|
| **Permiso** | `cash:reverse` · **Idem: sí** |
| **Input** | `{ reason: string.min(10) }` |
| **Errores** | `409 ALREADY_REVERSED`, `409 SESSION_CLOSED` (la reversa de una sesión cerrada exige `cash:approve` y abre una solicitud), `409 REQUIRES_APPROVAL` |
| **Reglas** | **No modifica el movimiento original salvo el flag `isReversed`.** Crea un `CashMovement` tipo `REVERSAL` con `reversalOfId`. Si el movimiento afectaba cuenta corriente, crea el `LedgerEntry` inverso. Si era una venta, revierte stock. |
| **Transacción** | `SERIALIZABLE` |
| **Tests** | reversa feliz; **doble reversa → 409** (garantizado por `unique(reversalOfId)`); reversa de pago revierte el saldo del socio; reversa de venta devuelve stock; **concurrencia: dos reversas simultáneas, una sola gana** |

### Resto de caja

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/cash/sessions` | `cash:read` |
| GET | `/cash/sessions/current` | `cash:read` |
| GET | `/cash/movements` | `cash:read` |
| GET | `/cash/daybook` | `cash:read` — libro diario con eventos de sesión y movimientos, agrupado por día de la sede |
| GET/POST/PATCH | `/cash/payment-methods` | `cash:read` / `config:write` |
| GET/POST/PATCH | `/cash/concepts` | `cash:read` / `config:write` |
| GET | `/cash/operations?status=pending` | `cash:read` |
| POST | `/cash/operations/:id/approve` | `cash:approve` · Idem |
| POST | `/cash/operations/:id/reject` | `cash:approve` · Idem — exige `reason` |

### `POST /api/v1/members/:id/pay-debt`

| | |
|---|---|
| **Permiso** | `payment:collect` · **Idem: sí** |
| **Input** | `{ amount, paymentMethodId, detail? }` |
| **Errores** | `409 CASH_SESSION_NOT_OPEN`, `422 AMOUNT_EXCEEDS_DEBT` (salvo `allowOverpay: true` que deja saldo a favor) |
| **Transacción** | `SERIALIZABLE`: `CashMovement(DEBT_PAYMENT)` + `LedgerEntry(CREDIT)` + recálculo de balance + outbox |
| **Tests** | pago parcial; pago total; pago mayor a la deuda; el saldo cuadra con el ledger; idempotencia |

### `POST /api/v1/members/:id/refund`
`payment:refund`, Idem. Crea `CashMovement(REFUND)` + `LedgerEntry(DEBIT)`. Exige caja abierta y motivo.

---

## 9. Acceso y asistencia — Etapa 5

### `POST /api/v1/access/check`

El endpoint más caliente del producto. **Separa identificación de autorización.**

| | |
|---|---|
| **Permiso** | `access:operate` · **Idem: sí** (clave = `{branchId}:{method}:{identifier}:{minutoActual}`) |
| **Input** | `{ branchId, method: "DOCUMENT"|"CARD"|"MANUAL", identifier: string, registerAttendance?: boolean = true }` |
| **Output** | `200` **siempre que la consulta sea válida**, incluso si el acceso se deniega: <br>`{ decision: "ALLOWED"|"DENIED", reasonCode, member: { id, firstName, lastName, photoUrl?, status } | null, membership: { planName, endDate, classesRemaining } | null, attendanceRegistered: boolean, accessAttemptId }` |
| **Errores** | `404 BRANCH_NOT_FOUND`, `429 RATE_LIMITED` |
| **Reglas de autorización, en orden** | 1. Buscar socio por documento normalizado o tarjeta, dentro del `gymId`. Si no hay → `DENIED/NOT_FOUND`. <br>2. `Member.status = SUSPENDED` → `DENIED/MEMBER_SUSPENDED`. <br>3. Sin membresía `ACTIVE` → `DENIED/NO_ACTIVE_MEMBERSHIP`. <br>4. `endDate < hoy` en la zona de la sede → `DENIED/MEMBERSHIP_EXPIRED` (y el job de vencimientos ya debería haberla pasado a `EXPIRED`). <br>5. Plan no habilitado en esa sede → `DENIED/WRONG_BRANCH`. <br>6. `classesRemaining = 0` → `DENIED/NO_CLASSES_LEFT`. <br>7. Política de deuda del gimnasio (`SystemConfig.blockOnDebt`) → `DENIED/DEBT_BLOCKED`. <br>8. Si ya hay asistencia hoy → `ALLOWED/DUPLICATE_WINDOW`, **sin** crear una segunda asistencia ni descontar clase. <br>9. `ALLOWED/OK`: crear `Attendance`, decrementar `classesRemaining` si el plan es por clases, actualizar `lastAttendanceAt`. |
| **Transacción** | sí. El decremento de `classesRemaining` va con `FOR UPDATE` sobre la membresía. |
| **Eventos** | `AccessAttempt` **siempre** (permitido o denegado) · WS `access.resolved` a la room de la sede |
| **Tests** | los 9 casos de arriba, uno por uno; **doble check en el mismo minuto no crea dos asistencias**; **socio de otro gimnasio → NOT_FOUND**; concurrencia: dos checks simultáneos descuentan una sola clase; el intento denegado igual queda registrado |

### Resto de acceso

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/access/attempts` | `access:read_history` — filtros por sede, decisión, método, rango |
| GET | `/access/attempts/:id/result` | `access:read_history` — resultado seguro con la misma forma de `AccessCheckResponse` |
| GET | `/attendances` | `attendance:read` |
| GET | `/attendances/stats` | `stats:read` — total, por día de semana, por hora, ranking (documento enmascarado) |
| POST | `/access/manual-attendance` | `access:operate` · Idem — registro manual con motivo obligatorio; audita |

---

## 10. Biometría — Etapas 7-8

Dos superficies distintas: la del **CRM** (usuarios) y la del **agente** (dispositivos). Nunca comparten credenciales.

### Superficie CRM

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| GET | `/agents` | `device:manage` | agentes de las sedes permitidas, con `lastSeenAt` y estado |
| POST | `/agents` | `device:manage` | genera `installationId` + secreto de pareo de un solo uso (se muestra **una vez**) |
| POST | `/agents/:id/approve` | `device:manage` | |
| POST | `/agents/:id/revoke` | `device:manage` | exige motivo; invalida tokens en curso |
| GET | `/agents/:id/events` | `device:manage` | `AgentAuditEvent` |
| GET | `/devices` | `device:manage` | |
| POST | `/members/:id/biometrics/consent` | `biometrics:enroll` | registra `BiometricConsent`; **sin esto el enrolamiento devuelve 409** |
| DELETE | `/members/:id/biometrics/consent` | `biometrics:revoke` | revoca consentimiento **y revoca todas las credenciales** en la misma transacción |
| POST | `/members/:id/biometrics/enrollments` | `biometrics:enroll` · Idem | inicia sesión de enrolamiento |
| GET | `/biometrics/enrollments/:id` | `biometrics:read` | estado, para que la UI muestre el progreso |
| POST | `/biometrics/enrollments/:id/cancel` | `biometrics:enroll` | |
| POST | `/biometrics/identifications` | `access:operate` · Idem | emite un `deviceToken` IDENTIFY para un agente/lector online de la sede |
| GET | `/members/:id/biometrics/credentials` | `biometrics:read` | **nunca devuelve el template**, sólo metadatos |
| DELETE | `/biometrics/credentials/:id` | `biometrics:revoke` | marca `REVOKED`; el borrado físico lo hace el job de retención |

#### `POST /api/v1/members/:id/biometrics/enrollments`

| | |
|---|---|
| **Input** | `{ localAgentId, deviceId, fingerPosition }` |
| **Output** | `201 { enrollmentId, deviceToken, expiresAt, samplesRequired, minQuality }` |
| **Errores** | `409 NO_BIOMETRIC_CONSENT`, `409 FINGER_ALREADY_ENROLLED`, `409 AGENT_OFFLINE`, `403 FEATURE_NOT_ENABLED` |
| **Reglas** | El `deviceToken` es de **un solo uso**, scope `ENROLL`, atado a `subjectMemberId` y con TTL corto. El frontend se lo pasa al agente por el WS local; nunca lo persiste. |
| **Tests** | sin consentimiento → 409; dedo ya enrolado → 409; token no sirve para otro socio; token vencido → 401; token reutilizado → 401 |

#### `POST /api/v1/biometrics/identifications`

| | |
|---|---|
| **Input** | `{ branchId }` |
| **Output** | `201 { deviceToken, deviceId, expiresAt, minQuality }` |
| **Errores** | `404 NOT_FOUND` para sede ajena, `409 AGENT_OFFLINE` si no hay agente o lector online |
| **Reglas** | El backend elige el agente y lector de la sede. El token tiene scope `IDENTIFY`, TTL corto y un solo uso; el frontend lo entrega inmediatamente al WS local y no lo persiste. |

El resultado completo queda disponible para el CRM en `GET /access/attempts/:id/result` (`access:read_history`) con la misma forma de `AccessCheckResponse`. El agente conserva la respuesta mínima `{ resolved: true }`.

### Superficie agente (`Authorization: Bearer <deviceToken>`)

| Método | Ruta | Notas |
|---|---|---|
| POST | `/agent/pair` | intercambia `installationId` + secreto por credenciales de agente |
| POST | `/agent/heartbeat` | estado del agente y del lector; devuelve config vigente |
| POST | `/agent/events` | lote de `AgentAuditEvent` |
| POST | `/agent/biometrics/enroll-complete` | entrega el template |
| POST | `/agent/biometrics/identify` | entrega el template de la huella presentada |

#### `POST /api/v1/agent/biometrics/identify`

| | |
|---|---|
| **Auth** | `deviceToken` scope `IDENTIFY` |
| **Input** | `{ branchId, deviceId, template: base64, templateFormat, quality: number, capturedAt }` |
| **Output** | `200 { resolved: true }` — **y nada más.** El agente no recibe identidad. |
| **Errores** | `401 INVALID_DEVICE_TOKEN`, `403 AGENT_REVOKED`, `422 TEMPLATE_QUALITY_TOO_LOW`, `429 RATE_LIMITED` |
| **Reglas** | 1. Validar que `deviceId` pertenezca al agente autenticado. 2. Cargar candidatos `BiometricCredential ACTIVE` de esa sede (o del gimnasio si `branchId` es null en la credencial). 3. Descifrar en memoria. 4. Matching 1:N con umbral configurable. 5. Si hay match: aplicar **la misma cadena de autorización de `/access/check`**. 6. Registrar `AccessAttempt` con `method=FINGERPRINT` y `matchScore`. 7. El CRM consulta el intento; el agente no recibe el resultado. |
| **Transacción** | sí, para asistencia y descuento de clase |
| **Resultado CRM** | `GET /access/attempts/:id/result`; el polling queda aislado del WebSocket local y no expone PII al agente |
| **Tests** | match correcto autoriza; match correcto con membresía vencida **deniega**; sin match → `BIOMETRIC_NO_MATCH` registrado; credencial revocada **no matchea**; calidad baja → 422; token de otro agente → 401; **el agente nunca recibe PII**; latencia p95 medida con N=2.000 |

Detalle de seguridad, claves y retención: `biometrics/BIOMETRIC_SECURITY.md`. Protocolo local: `biometrics/WEBSOCKET_PROTOCOL.md`.

---

## 11. Mensajería — Etapa 6

| Método | Ruta | Permiso | Idem |
|---|---|---|---|
| GET/PUT | `/messaging/config` | `message:config` | |
| GET/PUT | `/messaging/templates` | `message:config` | |
| POST | `/messaging/test` | `message:config` | sí |
| GET | `/messaging/jobs` | `message:send` | historial con filtros |
| POST | `/messaging/jobs/:id/retry` | `message:send` | sí |
| POST | `/messaging/broadcast` | `message:broadcast` | sí — **preview obligatorio**: devuelve `202` con `estimatedRecipients`; requiere `confirm: true` para ejecutar |
| POST | `/webhooks/messaging/:provider` | público con firma | verifica firma HMAC; **unique(provider, externalId)** contra reprocesamiento |

Reglas: el envío nunca ocurre en el request; se crea `MessageJob` con `dedupeKey` y se encola. `POST /webhooks` no confía en el body para el `gymId`: lo resuelve por la integración asociada al número de destino.

---

## 12. Reportes — Etapa 6

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/reports/dashboard` | `stats:read` — socios activos, altas del mes, deuda total, ingresos del día, asistencias de hoy, membresías por vencer |
| GET | `/reports/attendance` | `stats:read` — total, por día de semana, por hora, ranking |
| GET | `/reports/finance` | `stats:read` — ingresos por método, por concepto, por sede, serie temporal |
| GET | `/reports/members` | `stats:read` — altas/bajas, distribución por plan, retención |
| POST | `/reports/export` | `stats:export` — encola generación; devuelve `202` + URL prefirmada cuando termina |

Reglas: todos aceptan `from`, `to`, `branchId?`, `hourFrom?`, `hourTo?`, interpretados en la zona de la sede. **Documento siempre enmascarado**, incluso en exportaciones, salvo `member:read_document`.

---

## 13. Endpoints de Etapas 9-13 (resumen)

Se especifican completos al llegar a su etapa, siguiendo la misma plantilla.

| Etapa | Prefijos |
|---|---|
| 9 — Reservas | `/schedule/slots`, `/schedule/exceptions`, `/reservations` |
| 10 — POS | `/products`, `/product-categories`, `/sales`, `/sales/:id/reverse`, `/stock/movements` |
| 11 — Entrenamiento | `/instructors`, `/instructors/:id/check-in`, `/exercises`, `/routines`, `/members/:id/routines` |
| 12 — Fidelización | `/loyalty/config`, `/loyalty/members/:id`, `/loyalty/redemptions`, `/loyalty/history` |
| 13 — ARCA / IA / plataforma | `/billing/config`, `/billing/csr`, `/billing/invoices`, `/assistant/threads`, `/platform/*` |

---

## 14. Salud y operación

| Método | Ruta | Auth |
|---|---|---|
| GET | `/health/live` | pública — sólo dice que el proceso responde |
| GET | `/health/ready` | pública — verifica Postgres y Redis |
| GET | `/api/docs` | protegida fuera de desarrollo — OpenAPI generado desde Zod |

---

## 15. Checklist por endpoint nuevo

Ningún endpoint se da por terminado sin esto:

- [ ] Esquema Zod en `packages/contracts` (input y output).
- [ ] Guard de permiso y, si corresponde, de feature.
- [ ] `gymId` derivado de la sesión, nunca del cliente.
- [ ] Test de acceso cruzado entre tenants que espera `404`.
- [ ] Idempotencia si tiene efecto de dinero, mensajería o asistencia.
- [ ] Transacción explícita si toca más de una tabla.
- [ ] `AuditEvent` si es una mutación relevante.
- [ ] Códigos de error del catálogo, no strings sueltos.
- [ ] Test de contrato: la respuesta real valida contra el esquema.
- [ ] Sin PII en logs.
