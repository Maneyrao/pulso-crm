# Modelo de dominio y datos — Pulso CRM

Fecha: 2026-08-09
Estado: propuesto.

## 0. Convenciones transversales

| Regla | Detalle |
|---|---|
| Identificadores | `id` = `uuid` v7 (ordenable en el tiempo, evita hot-spots de índice y no filtra volumen como un serial). |
| Tenant | Toda tabla operativa lleva `gymId`. Las que tienen semántica de sucursal llevan además `branchId`. |
| Índices únicos | **Siempre compuestos con `gymId`.** Un unique global sobre un dato de negocio es un bug de multi-tenancy. |
| Dinero | `numeric(14,2)`. Nunca `float`. Nunca `int` de centavos. |
| Instantes | `timestamptz`, guardados en UTC. Cortes de día en la zona de la sede (ADR-021). |
| Fechas de negocio | `date` cuando no hay hora (vencimiento, fecha de reserva). |
| Soft delete | Sólo `Member`, `User`, `Product`, `Plan`, `Activity`, `Instructor`, `Exercise`. Columna `deletedAt`. **Prohibido** en tablas financieras, de asistencia, de auditoría y biométricas. |
| Inmutabilidad | `CashMovement`, `LedgerEntry`, `PointLedgerEntry`, `StockMovement`, `AuditEvent`, `AccessAttempt`, `Attendance`, `AgentAuditEvent`: sólo `INSERT`. Corrección por reversa. |
| Auditoría | Toda mutación relevante genera `AuditEvent` (ADR-017). |
| Enums | Enums de Postgres via Prisma, en MAYÚSCULAS. |
| Nombres | Inglés, `camelCase` en Prisma, `snake_case` en base vía `@@map`. **Ningún nombre copiado del producto auditado.** |

### Marcado de alcance

- `[MVP]` — Etapas 1 a 6. Debe existir en el MVP vendible.
- `[E7-8]` — Biometría.
- `[POST]` — Etapas 9 a 13.

---

## 1. Bounded context: Tenancy y configuración

### `Gym` `[MVP]`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `slug` | text | unique global — es el identificador público del tenant |
| `name` | text | |
| `legalName` | text? | |
| `taxId` | text? | CUIT |
| `email`, `phone`, `address` | text? | |
| `country` | text | ISO-3166-1 alpha-2, default `AR` |
| `currency` | text | ISO-4217, default `ARS` |
| `documentTypeDefault` | enum `DocumentType` | `DNI`, `CUIT`, `PASSPORT`, `CPF`, `RUT`, `CURP`, `OTHER` |
| `saasPlanId` | uuid FK → `SaasPlan` | |
| `saasStatus` | enum | `TRIAL`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED` |
| `createdAt`, `updatedAt` | timestamptz | |

Índices: `unique(slug)`, `index(saasStatus)`.

### `Branch` `[MVP]`

`id`, `gymId`, `name`, `address?`, `timezone` (IANA, default `America/Argentina/Buenos_Aires`), `phone?`, `isActive`, `openedAt?`, timestamps.

Índices: `unique(gymId, name)`, `index(gymId, isActive)`.

### `SaasPlan` `[MVP mínimo, POST completo]`

Global (sin `gymId`). `id`, `code` unique, `name`, `priceMonthly numeric(14,2)`, `maxBranches int?`, `maxMembers int?`, `features jsonb` (lista de feature keys), `isActive`.

### `GymFeatureOverride` `[POST]`

Permite habilitar/deshabilitar una feature para un gimnasio puntual sin cambiar de plan. `id`, `gymId`, `featureKey`, `enabled bool`, `reason text`, `expiresAt?`. Unique `(gymId, featureKey)`.

### `SystemConfig` `[MVP]`

Configuración operativa por gimnasio y opcionalmente por sede. `id`, `gymId`, `branchId?`, `key`, `value jsonb`, `updatedByUserId`, `updatedAt`. Unique `(gymId, branchId, key)`.

> Los secretos (credenciales de WhatsApp, certificados ARCA) **no** van acá; van en tablas dedicadas con columnas cifradas.

---

## 2. Bounded context: IAM

### `User` `[MVP]`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `gymId` | uuid | `null` sólo para administradores de plataforma `[POST]` |
| `email` | citext | |
| `passwordHash` | text | argon2id |
| `firstName`, `lastName` | text | |
| `phone` | text? | |
| `isActive` | bool | |
| `lastLoginAt` | timestamptz? | |
| `failedLoginCount` | int | |
| `lockedUntil` | timestamptz? | |
| `mustChangePassword` | bool | |
| `deletedAt` | timestamptz? | |

Índices: `unique(gymId, email) where deletedAt is null`, `index(gymId, isActive)`.

### `Role` `[MVP]`

`id`, `gymId?` (null = rol de sistema), `code`, `name`, `isSystem bool`, `permissions text[]`.

Roles de sistema iniciales: `OWNER`, `MANAGER`, `RECEPTIONIST`, `INSTRUCTOR`, `PLATFORM_ADMIN` `[POST]`.
Unique: `unique(gymId, code)`.

### `UserRoleAssignment` `[MVP]`

Un usuario puede tener un rol distinto por sede.

`id`, `gymId`, `userId`, `roleId`, `branchId?` (null = todas las sedes del gimnasio). Unique `(userId, roleId, branchId)`.

### `Permission` — catálogo `[MVP]`

No es tabla; es una constante en `packages/contracts`. Formato `recurso:acción`.

```
member:read           member:write          member:delete
member:read_document
membership:write      membership:delete
plan:read             plan:write
cash:read             cash:operate          cash:open_close
cash:reverse          cash:approve
payment:collect       payment:refund
access:operate        access:read_history
attendance:read
biometrics:enroll     biometrics:revoke     biometrics:read
device:manage
reservation:read      reservation:write
product:read          product:write         product:sell
message:send          message:broadcast     message:config
routine:read          routine:write
instructor:read       instructor:write      instructor:attendance
loyalty:read          loyalty:config        loyalty:redeem
stats:read            stats:export
billing:read          billing:emit          billing:config
user:read             user:write
config:read           config:write
audit:read
```

### `RefreshToken` `[MVP]`

`id`, `userId`, `gymId`, `familyId uuid`, `tokenHash text` (SHA-256 del token opaco), `expiresAt`, `revokedAt?`, `replacedById?`, `userAgent?`, `ip?`, `createdAt`.

Índices: `unique(tokenHash)`, `index(userId, familyId)`.
Regla: si llega un token ya rotado, se revoca **toda la familia** y se emite `AuditEvent` de tipo `SECURITY_REFRESH_REUSE`.

### `AuditEvent` `[MVP]`

`id`, `gymId?`, `branchId?`, `actorUserId?`, `actorType` (`USER`|`SYSTEM`|`AGENT`), `action text`, `entityType text`, `entityId text?`, `before jsonb?`, `after jsonb?`, `metadata jsonb?`, `ip?`, `userAgent?`, `requestId?`, `occurredAt`.

Índices: `index(gymId, occurredAt desc)`, `index(gymId, entityType, entityId)`, `index(gymId, action, occurredAt desc)`.
Sin `UPDATE`/`DELETE` (permiso revocado en el rol de aplicación de la base). Partición mensual `[POST]`.

### `IdempotencyKey` `[MVP]`

`id`, `gymId`, `key text`, `endpoint text`, `requestHash text`, `status` (`IN_PROGRESS`|`COMPLETED`), `responseSnapshot jsonb?`, `createdAt`, `expiresAt`.
Unique `(gymId, key)`. Limpieza por job a los 7 días.

### `OutboxEvent` `[MVP]`

`id`, `gymId`, `type text`, `payload jsonb`, `createdAt`, `publishedAt?`, `attempts int`.
Índice parcial `index(createdAt) where publishedAt is null`.

---

## 3. Bounded context: Socios

### `Member` `[MVP]`

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `gymId`, `branchId` | uuid | sede de alta |
| `memberNumber` | int | correlativo por gimnasio |
| `documentType` | enum `DocumentType` | |
| `documentNumber` | text | normalizado: sin puntos ni espacios |
| `firstName`, `lastName` | text | |
| `email`, `phone` | text? | teléfono normalizado E.164 para WhatsApp |
| `birthDate` | date? | |
| `gender` | enum? | `FEMALE`,`MALE`,`OTHER`,`UNDISCLOSED` |
| `address` | text? | |
| `status` | enum `MemberStatus` | `ACTIVE`, `INACTIVE`, `SUSPENDED` |
| `cardNumber` | text? | tarjeta magnética |
| `photoKey` | text? | key en S3 |
| `notes` | text? | |
| `balance` | numeric(14,2) | **saldo cacheado**, derivado de `LedgerEntry`; negativo = deuda |
| `createdByUserId` | uuid | |
| `deletedAt` | timestamptz? | |

Constraints e índices:

- `unique(gymId, documentType, documentNumber) where deletedAt is null` — **impide documentos duplicados por gimnasio** (requisito del brief).
- `unique(gymId, memberNumber)`.
- `unique(gymId, cardNumber) where cardNumber is not null and deletedAt is null` — impide dos socios con la misma tarjeta.
- `index(gymId, branchId, status)`.
- `index(gymId, lastName, firstName)`.
- Índice GIN trigram sobre `lastName || firstName || documentNumber` para búsqueda.
- `check (balance is not null)`.

> `balance` es una **caché**, no la verdad. La verdad es la suma de `LedgerEntry`. Se recalcula dentro de la misma transacción que inserta el asiento, con `SELECT ... FOR UPDATE` sobre el socio. Existe un job de conciliación que compara caché vs. suma y alerta si divergen.

### `MemberDocument` `[MVP]`

Archivos del socio: apto médico, DNI, otros. `id`, `gymId`, `memberId`, `type` (`MEDICAL_CERTIFICATE`|`ID`|`OTHER`), `storageKey`, `fileName`, `mimeType`, `sizeBytes`, `validUntil date?`, `uploadedByUserId`, `createdAt`.
Índice `index(gymId, memberId, type)`.

### `LedgerEntry` — cuenta corriente del socio `[MVP]`

**Append-only.**

`id`, `gymId`, `memberId`, `type` (`DEBIT`|`CREDIT`|`ADJUSTMENT`|`REVERSAL`), `concept text`, `amount numeric(14,2)` (siempre positivo; el signo lo da `type`), `referenceType text?`, `referenceId uuid?`, `reversalOfId uuid?`, `createdByUserId`, `createdAt`.

- `DEBIT` aumenta la deuda; `CREDIT` la reduce.
- Índices: `index(gymId, memberId, createdAt desc)`, `unique(reversalOfId) where reversalOfId is not null` (una reversa por asiento).

---

## 4. Bounded context: Catálogo y membresías

### `Activity` `[MVP]`

Qué se practica: musculación, funcional, spinning. `id`, `gymId`, `name`, `description?`, `color?`, `isActive`, `deletedAt?`. Unique `(gymId, name) where deletedAt is null`.

### `Plan` `[MVP]`

Qué se vende. `id`, `gymId`, `name`, `description?`, `price numeric(14,2)`, `billingCycle` enum (`MONTHLY`, `QUARTERLY`, `SEMIANNUAL`, `ANNUAL`, `CLASS_PACK`), `durationDays int` (derivado del ciclo o explícito para `CLASS_PACK`), `classesIncluded int?` (null = ilimitado), `weeklyClassLimit int?`, `isActive`, `deletedAt?`.

`PlanActivity`: N:M `planId` × `activityId`.
`PlanBranch`: N:M `planId` × `branchId` — en qué sedes se puede usar. Vacío = todas.

Unique `(gymId, name) where deletedAt is null`.
Check: `classesIncluded is null or classesIncluded > 0`.

### `Membership` `[MVP]`

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `gymId`, `memberId`, `planId`, `branchId` | uuid | |
| `instructorId` | uuid? | |
| `startDate` | date | |
| `endDate` | date | vencimiento |
| `classesRemaining` | int? | null = ilimitado |
| `status` | enum `MembershipStatus` | `ACTIVE`, `EXPIRED`, `CANCELLED`, `FROZEN` |
| `pricePaid` | numeric(14,2) | precio congelado al momento de asignar |
| `createdByUserId`, `createdAt`, `updatedAt` | | |
| `cancelledAt`, `cancelledByUserId`, `cancelReason` | | |

Constraints e índices:

- `check (endDate >= startDate)`.
- `check (classesRemaining is null or classesRemaining >= 0)` — **impide saldo negativo de clases**.
- **Índice único parcial que impide dos membresías activas solapadas del mismo socio y plan:**
  `EXCLUDE USING gist (gymId WITH =, memberId WITH =, planId WITH =, daterange(startDate, endDate, '[]') WITH &&) WHERE (status = 'ACTIVE')` (requiere `btree_gist`).
- `index(gymId, memberId, status)`, `index(gymId, status, endDate)` (para el job de vencimientos).

Máquina de estados:

```
        asignar
  (none) ------> ACTIVE
                   |  endDate < hoy (job diario, zona de la sede)
                   +--> EXPIRED
                   |  cancelación explícita
                   +--> CANCELLED
                   |  congelamiento [POST]
                   +--> FROZEN --(descongelar, corre endDate)--> ACTIVE
```

---

## 5. Bounded context: Caja y pagos

### `PaymentMethod` `[MVP]`

`id`, `gymId`, `name`, `kind` enum (`CASH`, `CARD_DEBIT`, `CARD_CREDIT`, `TRANSFER`, `QR_WALLET`, `OTHER`), `countsAsCash bool` (si entra en el arqueo físico), `isActive`, `sortOrder`. Unique `(gymId, name)`.

### `CashConcept` `[MVP]`

Conceptos de ingreso/egreso no asociados a cuota. `id`, `gymId`, `name`, `direction` (`INCOME`|`EXPENSE`), `isActive`. Unique `(gymId, name)`.

### `CashRegister` `[MVP]`

La caja física. `id`, `gymId`, `branchId`, `name`, `isActive`. Unique `(gymId, branchId, name)`.

### `CashSession` `[MVP]`

| Campo | Tipo |
|---|---|
| `id`, `gymId`, `branchId`, `cashRegisterId` | uuid |
| `openedByUserId`, `openedAt`, `openingAmount numeric(14,2)` | |
| `closedByUserId?`, `closedAt?`, `closingAmountDeclared numeric(14,2)?`, `closingAmountExpected numeric(14,2)?`, `differenceAmount numeric(14,2)?` | |
| `status` | enum `OPEN`/`CLOSED` |
| `notes?` | |

Constraints — todos requisitos explícitos del brief:

- `unique(cashRegisterId) where status = 'OPEN'` — **una sola sesión abierta por caja**.
- `unique(gymId, openedByUserId) where status = 'OPEN'` — **un usuario no puede tener dos cajas abiertas a la vez**.
- `check (closedAt is null or closedAt >= openedAt)`.
- Regla de servicio (no expresable como constraint): **no se puede cerrar con operaciones pendientes** — se valida en transacción con `SELECT ... FOR UPDATE` sobre `CashOperationRequest` pendientes.

### `CashSessionClosingDetail` `[MVP]`

Arqueo declarado por método de pago. `id`, `cashSessionId`, `paymentMethodId`, `declaredAmount`, `expectedAmount`, `differenceAmount`. Unique `(cashSessionId, paymentMethodId)`.

### `CashMovement` `[MVP]` — **append-only**

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `gymId`, `branchId`, `cashSessionId` | uuid | |
| `type` | enum `CashMovementType` | `INCOME`, `EXPENSE`, `MEMBERSHIP_PAYMENT`, `DEBT_PAYMENT`, `SALE`, `REFUND`, `REVERSAL` |
| `direction` | enum `IN`/`OUT` | derivado y persistido para simplificar sumas |
| `paymentMethodId` | uuid | |
| `cashConceptId?`, `memberId?` | uuid | |
| `amount` | numeric(14,2) | siempre > 0 |
| `detail` | text? | |
| `referenceType?`, `referenceId?` | | apunta a `Sale`, `Membership`, `LedgerEntry` |
| `reversalOfId?` | uuid | |
| `isReversed` | bool | flag denormalizado, se setea al crear la reversa |
| `createdByUserId`, `createdAt` | | |

Constraints e índices:

- `check (amount > 0)`.
- `unique(reversalOfId) where reversalOfId is not null` — **impide revertir dos veces el mismo movimiento**.
- `check (type <> 'REVERSAL' or reversalOfId is not null)`.
- `index(gymId, branchId, createdAt desc)`, `index(cashSessionId)`, `index(gymId, memberId, createdAt desc)`.
- Sin `UPDATE` salvo el flag `isReversed` (única excepción, hecha dentro de la transacción de reversa).

### `CashOperationRequest` `[MVP]`

Operaciones que requieren aprobación de un rol superior (reversas, egresos sobre umbral).

`id`, `gymId`, `branchId`, `cashSessionId`, `requestedByUserId`, `type` (`REVERSAL`|`EXPENSE_OVER_LIMIT`|`REFUND`), `payload jsonb`, `status` (`PENDING`|`APPROVED`|`REJECTED`), `resolvedByUserId?`, `resolvedAt?`, `rejectionReason?`, `resultingMovementId?`, `createdAt`.

Índices: `index(gymId, branchId, status)`, `index(cashSessionId, status)`.

### Transacción canónica: cobro de cuota

Todo en **una** transacción `SERIALIZABLE`:

1. Verificar sesión de caja abierta del usuario en esa sede.
2. Crear/renovar `Membership`.
3. `CashMovement` tipo `MEMBERSHIP_PAYMENT`.
4. `LedgerEntry` `CREDIT` por el monto cobrado (y `DEBIT` previo si se generó deuda al asignar).
5. Recalcular `Member.balance` con `FOR UPDATE`.
6. `PointLedgerEntry` si aplica `[POST]`.
7. `OutboxEvent` `payment.collected` → dispara recibo por WhatsApp.
8. `AuditEvent`.

Si algo falla, no queda nada. La idempotencia (`Idempotency-Key`) evita el doble cobro por doble click.

---

## 6. Bounded context: Acceso y asistencia

### `AccessAttempt` `[MVP]` — **append-only**

Registro de **todo** intento, permitido o denegado.

| Campo | Tipo |
|---|---|
| `id`, `gymId`, `branchId` | uuid |
| `method` | enum `AccessMethod`: `DOCUMENT`, `CARD`, `FINGERPRINT` `[E7-8]`, `MANUAL` |
| `subjectType` | enum `MEMBER`/`INSTRUCTOR`/`UNKNOWN` |
| `memberId?`, `instructorId?` | uuid |
| `decision` | enum `ALLOWED`/`DENIED` |
| `reasonCode` | enum `AccessDenyReason`: `OK`, `NOT_FOUND`, `NO_ACTIVE_MEMBERSHIP`, `MEMBERSHIP_EXPIRED`, `NO_CLASSES_LEFT`, `WRONG_BRANCH`, `MEMBER_SUSPENDED`, `DEBT_BLOCKED`, `OUTSIDE_SCHEDULE`, `DUPLICATE_WINDOW`, `BIOMETRIC_NO_MATCH` |
| `membershipId?`, `deviceId?`, `localAgentId?` | uuid |
| `attendanceId?` | uuid |
| `matchScore` | int? `[E7-8]` |
| `operatorUserId?` | uuid |
| `occurredAt` | timestamptz |

Índices: `index(gymId, branchId, occurredAt desc)`, `index(gymId, memberId, occurredAt desc)`, `index(gymId, decision, occurredAt desc)`.

### `Attendance` `[MVP]` — **append-only**

`id`, `gymId`, `branchId`, `memberId`, `membershipId?`, `method`, `occurredAt`, `occurredOn date` (día de negocio en la zona de la sede, generado), `accessAttemptId`, `registeredByUserId?`.

**Constraint anti doble-registro** (requisito del brief):
`unique(gymId, memberId, branchId, occurredOn)` — una asistencia por socio, sede y día de negocio.

Si el negocio quiere permitir dos entradas por día (turno mañana/tarde), la variante es una ventana de tiempo:
`unique(gymId, memberId, branchId, date_trunc_window)` con ventana de N minutos configurable. **Decisión del MVP: una por día de negocio**, y el segundo intento devuelve `DUPLICATE_WINDOW` con `decision = ALLOWED` (el socio entra, no se duplica la asistencia). Registrado como decisión abierta menor.

Índices: `index(gymId, branchId, occurredAt desc)`, `index(gymId, memberId, occurredOn desc)`.

### `InstructorAttendance` `[POST]`

`id`, `gymId`, `branchId`, `instructorId`, `checkInAt`, `checkOutAt?`, `registeredByUserId?`. `unique(gymId, instructorId, checkInAt)`.

---

## 7. Bounded context: Biometría `[E7-8]`

### `LocalAgent`

Una instalación del agente en una PC.

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `gymId`, `branchId` | uuid | |
| `name` | text | "Recepción principal" |
| `installationId` | uuid | generado por el agente en la instalación |
| `machineFingerprint` | text | hash de identificadores de máquina, no reversible |
| `agentVersion` | text | |
| `osVersion` | text | |
| `status` | enum `PENDING_APPROVAL`/`ACTIVE`/`DISABLED`/`REVOKED` | |
| `enrollmentSecretHash` | text | secreto de pareo, hasheado |
| `lastSeenAt` | timestamptz? | |
| `approvedByUserId?`, `approvedAt?`, `revokedAt?`, `revokeReason?` | | |

Unique `(gymId, installationId)`. Índice `index(gymId, branchId, status)`.

### `AccessDevice`

El lector físico visto por el agente.

`id`, `gymId`, `branchId`, `localAgentId`, `kind` (`FINGERPRINT_READER`|`CARD_READER`|`BARRIER`), `vendor` (`HID_DIGITALPERSONA`|`OTHER`), `model` (`UAREU_4500`|...), `serialNumber?`, `status` (`ONLINE`|`OFFLINE`|`ERROR`|`DISABLED`), `lastSeenAt?`, `settings jsonb`, `createdAt`.

Unique `(gymId, localAgentId, serialNumber) where serialNumber is not null`.

### `BiometricConsent`

Sin consentimiento no hay enrolamiento. El backend lo verifica; no es un checkbox del frontend.

`id`, `gymId`, `memberId`, `version text` (versión del texto de consentimiento), `grantedAt`, `grantedMethod` (`IN_PERSON_SIGNED`|`DIGITAL`), `capturedByUserId`, `documentKey text?` (consentimiento firmado escaneado), `revokedAt?`, `revokedByUserId?`, `revokeReason?`.

Índices: `index(gymId, memberId, grantedAt desc)`. Un socio puede tener consentimientos sucesivos; vale el último no revocado.

### `BiometricEnrollment`

Sesión de enrolamiento. Efímera en cuanto a muestras, permanente como registro.

`id`, `gymId`, `branchId`, `memberId`, `localAgentId`, `deviceId`, `fingerPosition` enum (`RIGHT_INDEX`, `RIGHT_THUMB`, `LEFT_INDEX`, ...), `status` (`STARTED`|`CAPTURING`|`COMPLETED`|`FAILED`|`CANCELLED`|`EXPIRED`), `samplesRequired int`, `samplesCaptured int`, `qualityScores int[]`, `failureReason text?`, `startedByUserId`, `startedAt`, `completedAt?`, `expiresAt`.

**Las muestras crudas nunca se persisten.** Sólo viven en memoria del agente durante la sesión.

Índices: `index(gymId, memberId, startedAt desc)`, `index(status, expiresAt)` para expirar sesiones colgadas.

### `BiometricCredential`

El template. **Cifrado.**

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `gymId`, `memberId` | uuid | |
| `branchId` | uuid? | null = válida en todas las sedes del gimnasio |
| `fingerPosition` | enum | |
| `templateFormat` | enum | `ANSI_378_2004`, `ISO_19794_2_2005`, `VENDOR_DIGITALPERSONA` |
| `templateCiphertext` | bytea | AES-256-GCM |
| `templateNonce` | bytea | 12 bytes |
| `templateAuthTag` | bytea | 16 bytes |
| `dekWrapped` | bytea | DEK envuelta por la KEK del tenant |
| `keyVersion` | int | para rotación |
| `templateHash` | bytea | SHA-256 del template en claro — **sólo para deduplicación y detección de re-enrolamiento, nunca para matching** |
| `quality` | int | calidad del enrolamiento |
| `enrollmentId` | uuid | |
| `status` | enum | `ACTIVE`, `REVOKED` |
| `createdByUserId`, `createdAt` | | |
| `revokedAt?`, `revokedByUserId?`, `revokeReason?` | | |

Constraints e índices:

- `unique(gymId, memberId, fingerPosition) where status = 'ACTIVE'` — un dedo, una credencial activa.
- `unique(gymId, templateHash) where status = 'ACTIVE'` — **impide que dos socios enrolen la misma huella** (fraude de compartir membresía).
- `index(gymId, branchId, status)` — es el índice del conjunto de candidatos para 1:N.
- **No hay índice sobre `templateCiphertext`.** El matching no es una búsqueda SQL.

### `AgentAuditEvent`

Bitácora de lo que hace el agente. Sin datos biométricos.

`id`, `gymId`, `branchId`, `localAgentId`, `deviceId?`, `type` (`AGENT_STARTED`, `AGENT_STOPPED`, `DEVICE_CONNECTED`, `DEVICE_DISCONNECTED`, `CAPTURE_STARTED`, `CAPTURE_TIMEOUT`, `CAPTURE_CANCELLED`, `QUALITY_REJECTED`, `IDENTIFY_SENT`, `ENROLL_SENT`, `AUTH_FAILED`, `PROTOCOL_ERROR`, `UPDATE_APPLIED`), `severity` (`INFO`|`WARN`|`ERROR`), `message text`, `metadata jsonb`, `occurredAt`, `receivedAt`.

Índices: `index(gymId, localAgentId, occurredAt desc)`, `index(gymId, severity, occurredAt desc)`.
**Prohibido** guardar en `metadata`: imágenes, templates, documento del socio.

### `DeviceToken`

Token de corta vida que el backend emite al agente para una operación.

`id`, `gymId`, `localAgentId`, `tokenHash`, `scope` (`ENROLL`|`IDENTIFY`), `subjectMemberId?` (sólo para `ENROLL`), `expiresAt`, `usedAt?`, `createdAt`.
Unique `(tokenHash)`. TTL corto (ver `WEBSOCKET_PROTOCOL.md`).

---

## 8. Bounded context: Reservas `[POST — Etapa 9]`

### `ScheduleSlot`

Clase recurrente. `id`, `gymId`, `branchId`, `activityId`, `instructorId?`, `weekday int (0-6)`, `startTime time`, `endTime time`, `capacity int`, `validFrom date`, `validUntil date?`, `isActive`.

Constraints: `check (endTime > startTime)`, `check (capacity > 0)`.
Índice `index(gymId, branchId, weekday, isActive)`.

### `ScheduleException`

Feriados y cancelaciones puntuales. `id`, `gymId`, `branchId?`, `scheduleSlotId?`, `date date`, `type` (`CLOSED`|`CANCELLED_SLOT`|`CAPACITY_OVERRIDE`|`EXTRA_SLOT`), `capacityOverride int?`, `reason text`.

### `Reservation`

`id`, `gymId`, `branchId`, `scheduleSlotId`, `memberId`, `date date`, `status` (`RESERVED`|`CANCELLED`|`ATTENDED`|`NO_SHOW`), `reservedAt`, `cancelledAt?`, `cancelledByUserId?`, `attendanceId?`.

Constraints — requisitos del brief:

- `unique(gymId, scheduleSlotId, memberId, date) where status = 'RESERVED'` — **impide doble reserva del mismo socio para el mismo horario**.
- **Sobreventa de cupo**: no es expresable como constraint declarativa. Se resuelve en la transacción con `SELECT ... FROM ScheduleSlot WHERE id = ? FOR UPDATE` + `COUNT` de reservas activas, todo en `SERIALIZABLE`. Hay test de concurrencia obligatorio (K-9 en `TEST_STRATEGY.md`).
- Alternativa considerada y descartada para el MVP: contador materializado `ReservationCounter(slotId, date, reservedCount)` con `check (reservedCount <= capacity)`. Es más rápido pero agrega una tabla a mantener; se adopta si el lock se vuelve un cuello de botella.

---

## 9. Bounded context: POS `[POST — Etapa 10]`

### `ProductCategory`
`id`, `gymId`, `name`, `isActive`. Unique `(gymId, name)`.

### `Product`
`id`, `gymId`, `branchId?` (null = todas), `categoryId`, `name`, `sku?`, `price numeric(14,2)`, `cost numeric(14,2)?`, `stock int`, `minStock int?`, `trackStock bool`, `isActive`, `deletedAt?`.

Constraints: `check (stock >= 0)` — **impide stock negativo**. `unique(gymId, sku) where sku is not null and deletedAt is null`.

### `StockMovement` — **append-only**
`id`, `gymId`, `branchId`, `productId`, `type` (`PURCHASE`|`SALE`|`ADJUSTMENT`|`REVERSAL`|`LOSS`), `quantity int` (signo según tipo), `referenceType?`, `referenceId?`, `reversalOfId?`, `createdByUserId`, `createdAt`.

### `Sale` / `SaleItem`
`Sale`: `id`, `gymId`, `branchId`, `saleNumber int`, `memberId?`, `cashSessionId`, `total numeric(14,2)`, `status` (`COMPLETED`|`REVERSED`), `paidWithPoints bool`, `createdByUserId`, `createdAt`, `reversedAt?`, `reversalMovementId?`.
Unique `(gymId, saleNumber)`.
`SaleItem`: `id`, `saleId`, `productId`, `quantity`, `unitPrice` (congelado), `lineTotal`.

Transacción de venta: descuento de stock con `FOR UPDATE` + `StockMovement` + `CashMovement` tipo `SALE` + `Sale` + `SaleItem`, todo junto. La anulación crea movimientos de reversa de stock y de caja; **no borra nada**.

---

## 10. Bounded context: Comunicaciones `[MVP parcial — Etapa 6]`

### `MessageTemplate`
`id`, `gymId`, `type` (`PAYMENT_RECEIPT`, `DEBT_REMINDER`, `CLASS_REMINDER`, `ABSENCE`, `NEW_ROUTINE`, `BROADCAST`, `MEMBERSHIP_EXPIRING`), `channel` (`WHATSAPP`|`EMAIL`|`PUSH`), `body text`, `variables text[]`, `isActive`. Unique `(gymId, type, channel)`.

### `MessageJob`
`id`, `gymId`, `branchId?`, `memberId?`, `templateType`, `channel`, `destination text` (E.164 o email), `payload jsonb`, `status` (`QUEUED`|`SENDING`|`SENT`|`FAILED`|`CANCELLED`), `attempts int`, `lastError text?`, `dedupeKey text`, `scheduledFor timestamptz`, `sentAt?`, `createdAt`.

**Unique `(gymId, dedupeKey)` — impide duplicación de jobs de mensajería** (requisito del brief). `dedupeKey` ejemplo: `receipt:{cashMovementId}`.

### `MessageLog` — **append-only**
`id`, `gymId`, `messageJobId`, `event` (`QUEUED`|`SENT`|`DELIVERED`|`READ`|`FAILED`), `providerMessageId?`, `errorCode?`, `raw jsonb` (sin contenido del mensaje si contiene PII), `occurredAt`.

### `WhatsAppIntegration`
`id`, `gymId`, `provider`, `credentialsCiphertext bytea`, `credentialsNonce`, `keyVersion`, `phoneNumber`, `status`, `lastCheckedAt`. Un registro por gimnasio.

### `WebhookEvent` — idempotencia de entrantes
`id`, `gymId?`, `provider`, `externalId text`, `type`, `payload jsonb`, `receivedAt`, `processedAt?`.
**Unique `(provider, externalId)` — impide procesar dos veces el mismo webhook** (requisito del brief).

---

## 11. Bounded context: Entrenamiento `[POST — Etapa 11]`

`Instructor`: `id`, `gymId`, `branchId?`, `userId?` (si tiene login), `firstName`, `lastName`, `documentNumber?`, `phone?`, `email?`, `isActive`, `deletedAt?`.
`Exercise`: `id`, `gymId?` (null = catálogo base global), `name`, `muscleGroup`, `equipment?`, `videoUrl?`, `isActive`, `deletedAt?`.
`Routine`: `id`, `gymId`, `name`, `description?`, `isTemplate bool`, `createdByUserId`, `deletedAt?`.
`RoutineBlock`: `id`, `routineId`, `dayLabel`, `sortOrder`.
`RoutineItem`: `id`, `routineBlockId`, `exerciseId`, `sets`, `reps`, `restSeconds?`, `notes?`, `sortOrder`.
`MemberRoutine`: `id`, `gymId`, `memberId`, `routineId`, `assignedByUserId`, `assignedAt`, `validUntil?`, `status` (`ACTIVE`|`REPLACED`|`ARCHIVED`), `seenAt?`.
`unique(gymId, memberId) where status = 'ACTIVE'`.

---

## 12. Bounded context: Fidelización `[POST — Etapa 12]`

`LoyaltyConfig`: uno por gimnasio. `id`, `gymId`, `isEnabled`, `pointsPerPaymentOnTime int`, `pointsPerEarlyPayment int`, `weeklyAttendanceGoal int`, `pointsPerWeeklyGoal int`, `pointsExpireAfterDays int` (0 = no vencen), `pointsPerCurrencyUnitRedeem numeric(14,4)`.

`PointLedgerEntry` — **append-only**: `id`, `gymId`, `memberId`, `type` (`EARN_PAYMENT`|`EARN_GOAL`|`REDEEM_FEE`|`REDEEM_PRODUCT`|`EXPIRE`|`ADJUSTMENT`|`REVERSAL`), `points int` (signo según tipo), `reason`, `referenceType?`, `referenceId?`, `expiresAt date?`, `reversalOfId?`, `createdByUserId?`, `createdAt`.
`unique(gymId, memberId, type, referenceId) where referenceId is not null` — impide acreditar dos veces el mismo pago.

`RewardRedemption`: `id`, `gymId`, `memberId`, `kind` (`FEE`|`PRODUCT`), `pointsSpent`, `referenceType`, `referenceId`, `createdByUserId`, `createdAt`.

Saldo de puntos = suma del ledger. Caché `Member.loyaltyPoints` con la misma disciplina que `balance`.

---

## 13. Bounded context: Reportes, IA y plataforma `[POST — Etapa 13]`

`ReportSnapshot`: `id`, `gymId`, `branchId?`, `type`, `periodStart date`, `periodEnd date`, `data jsonb`, `generatedAt`. Unique `(gymId, branchId, type, periodStart, periodEnd)`.
`AssistantThread` / `AssistantMessage`: `gymId`, `userId`, `role`, `content`, `tokensUsed`, `createdAt`. Retención configurable.
`Reseller`, `ResellerGym`, `Commission`, `Lead`: `[POST]`.
`PlatformAuditEvent`: acciones del admin global, tabla separada de `AuditEvent`.

---

## 14. Matriz de constraints exigidos por el brief

| Requisito del brief | Cómo se garantiza | Tabla |
|---|---|---|
| Documentos duplicados por gimnasio | `unique(gymId, documentType, documentNumber) where deletedAt is null` | `Member` |
| Cruces entre tenants | `gymId` en toda tabla + índices únicos compuestos + extensión de Prisma + RLS `[POST]` + suite de tests | todas |
| Doble reserva | `unique(gymId, scheduleSlotId, memberId, date) where status='RESERVED'` | `Reservation` |
| Sobreventa de cupos | Transacción `SERIALIZABLE` + `FOR UPDATE` sobre `ScheduleSlot` + test de concurrencia | `Reservation` |
| Stock negativo | `check (stock >= 0)` + `FOR UPDATE` en la venta | `Product` |
| Procesamiento duplicado de pagos | `IdempotencyKey unique(gymId, key)` + `unique(reversalOfId)` | `IdempotencyKey`, `CashMovement` |
| Duplicación de jobs | `jobId` determinístico en BullMQ + `unique(gymId, dedupeKey)` | `MessageJob` |
| Duplicación de webhooks | `unique(provider, externalId)` | `WebhookEvent` |
| Doble registro de asistencia | `unique(gymId, memberId, branchId, occurredOn)` | `Attendance` |
| Dos cajas incompatibles por usuario | `unique(gymId, openedByUserId) where status='OPEN'` + `unique(cashRegisterId) where status='OPEN'` | `CashSession` |
| Cierre con operaciones pendientes | Validación transaccional con `FOR UPDATE` sobre `CashOperationRequest` | `CashSession` |
| Clases negativas | `check (classesRemaining >= 0)` | `Membership` |
| Dos socios con la misma huella | `unique(gymId, templateHash) where status='ACTIVE'` | `BiometricCredential` |
| Membresías activas solapadas | `EXCLUDE USING gist` con `daterange` | `Membership` |

## 15. Orden de creación de migraciones (MVP)

| Migración | Contenido | Etapa |
|---|---|---|
| `0001_extensions` | `pgcrypto`, `citext`, `btree_gist`, `pg_trgm` | 1 |
| `0002_tenancy` | `SaasPlan`, `Gym`, `Branch`, `SystemConfig` | 2 |
| `0003_iam` | `User`, `Role`, `UserRoleAssignment`, `RefreshToken` | 2 |
| `0004_platform_primitives` | `AuditEvent`, `IdempotencyKey`, `OutboxEvent` | 2 |
| `0005_members` | `Member`, `MemberDocument`, `LedgerEntry` | 3 |
| `0006_catalog` | `Activity`, `Plan`, `PlanActivity`, `PlanBranch` | 3 |
| `0007_memberships` | `Membership` + constraint de solapamiento | 3 |
| `0008_cash` | `PaymentMethod`, `CashConcept`, `CashRegister`, `CashSession`, `CashSessionClosingDetail`, `CashMovement`, `CashOperationRequest` | 4 |
| `0009_access` | `AccessAttempt`, `Attendance` | 5 |
| `0010_messaging` | `MessageTemplate`, `MessageJob`, `MessageLog`, `WhatsAppIntegration`, `WebhookEvent` | 6 |
| `0011_biometrics` | `LocalAgent`, `AccessDevice`, `BiometricConsent`, `BiometricEnrollment`, `BiometricCredential`, `AgentAuditEvent`, `DeviceToken` | 8 |

Etapas 9 a 13 agregan sus propias migraciones en su momento. **Ninguna migración del MVP se edita retroactivamente una vez aplicada en un ambiente compartido.**
