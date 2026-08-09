# Estrategia de pruebas — Pulso CRM

Fecha: 2026-08-09
Estado: propuesto.

## 0. Reglas no negociables

1. **Prohibido desactivar, `skip`ear o borrar un test para hacer pasar el pipeline.** Si un test falla, o el código está mal o el test está mal; ambas cosas se arreglan, no se silencian.
2. **Prohibido bajar un umbral de cobertura** para que pase el CI.
3. Un bug reproducible entra primero como test que falla, después se arregla.
4. Los tests de multi-tenancy y de caja son **condición de salida** de sus etapas. Sin ellos verdes, la etapa no está terminada.
5. Los mocks del frontend se validan contra los esquemas Zod de `packages/contracts`. Un mock desactualizado rompe el test.

## 1. Pirámide

```
        E2E (Playwright)          ~6 flujos críticos del MVP
     Componentes (RTL)            estados de cada pantalla
   Contrato (Zod vs. respuesta)   todos los endpoints
 Integración (Postgres real)      <-- el grueso del valor
      Unitarios (Vitest)          reglas puras
```

El peso está en **integración contra PostgreSQL real** (ADR-023). Lo que hay que probar en este producto son transacciones, constraints y aislamiento — cosas que un mock de Prisma no verifica.

## 2. Herramientas

| Nivel | Herramienta |
|---|---|
| Unit / integración backend | Vitest |
| Base de datos de test | PostgreSQL 16 real, **un esquema efímero por archivo de test** |
| HTTP | supertest sobre la app Nest real |
| Contratos | Zod `safeParse` sobre respuestas reales |
| Componentes | Vitest + Testing Library + MSW |
| E2E | Playwright |
| Accesibilidad | axe-core dentro de Playwright |
| Carga | k6 (Etapa 6 en adelante) |
| Secretos | gitleaks en CI |

### Aislamiento de la base en tests

Cada archivo de test crea un esquema Postgres con nombre aleatorio, corre las migraciones (o restaura un template ya migrado, más rápido), y lo destruye al final. Esto permite paralelismo real y evita el clásico "los tests pasan solos pero fallan juntos".

Se usa un **template database** migrado una vez por corrida; cada archivo hace `CREATE DATABASE ... TEMPLATE pulso_test_template`. Reduce el costo de las migraciones de N a 1.

## 3. Unitarios

Qué cubren: reglas puras, sin base ni HTTP.

- Cálculo de `endDate` según ciclo de facturación.
- Normalización y validación de documento por tipo y país.
- Normalización de teléfono a E.164.
- Enmascaramiento de documento.
- Aritmética Decimal (suma de movimientos, diferencia de arqueo, saldo de ledger).
- Conversión de día de negocio según zona de la sede — incluidos los bordes de cambio de día.
- Cadena de decisión de acceso, como función pura sobre un estado dado.
- Serialización de `Decimal` a string.

Objetivo de cobertura: **90% en `common/` y en los servicios de dominio puros**.

## 4. Integración (backend)

Es donde se prueba el producto de verdad. Por módulo:

### 4.1 Multi-tenancy — `test/tenancy/`

| Test | Qué verifica |
|---|---|
| `cross-tenant-read.spec.ts` | Para **cada** endpoint con `:id`: recurso creado en el gimnasio A, accedido con sesión de B → `404` |
| `cross-tenant-write.spec.ts` | Mutar un recurso de otro tenant → `404`, y el recurso no cambia |
| `cross-tenant-list.spec.ts` | Ningún listado devuelve filas de otro `gymId`, ni con filtros manipulados |
| `cross-tenant-branch.spec.ts` | `branchId` de otro gimnasio en el body → `404` |
| `cross-tenant-response-shape.spec.ts` | La respuesta de "no existe" y la de "existe pero es de otro" son **idénticas** |
| `prisma-extension.spec.ts` | Consultar un modelo tenant-scoped sin contexto de tenant **lanza excepción**, no devuelve todo |
| `unscoped-allowlist.spec.ts` | Sólo los usos declarados de `prisma.unscoped()` existen en el código |

**Estos tests se generan a partir del registro de rutas de Nest.** Un endpoint nuevo aparece automáticamente en la matriz; si no lo cubre, el test falla. Así no se puede olvidar.

### 4.2 Permisos — `test/iam/`

- Matriz rol × endpoint: `RECEPTIONIST` no puede revertir movimientos, no puede ver estadísticas financieras, no puede crear usuarios.
- Todo handler tiene `@Public()` o `@RequiresPermission()`; si no, el test falla.
- Cambiar el rol de un usuario se refleja en el siguiente request.
- Desactivar un usuario invalida su sesión.
- Rotación de refresh y detección de reuso.

### 4.3 Caja — `test/cash/`

| Test | Qué verifica |
|---|---|
| `open-session.spec.ts` | Apertura; segunda apertura de la misma caja → 409; mismo usuario en otra caja → 409 |
| `open-session.concurrency.spec.ts` | Dos aperturas simultáneas de la misma caja: exactamente una gana |
| `movements.spec.ts` | Ingreso, egreso, monto ≤ 0 rechazado, sin caja abierta rechazado |
| `reversal.spec.ts` | Reversa crea movimiento nuevo; el original **no** se modifica salvo el flag; doble reversa → 409 |
| `reversal.concurrency.spec.ts` | Dos reversas simultáneas del mismo movimiento: una sola gana |
| `close-session.spec.ts` | Cierre con arqueo; cálculo de diferencia por método; **cierre con operaciones pendientes → 409** |
| `close-session.concurrency.spec.ts` | Dos cierres simultáneos: uno solo cierra |
| `collect-membership.spec.ts` | La transacción completa: membresía + movimiento + ledger + balance |
| `collect-membership.rollback.spec.ts` | Forzar un fallo en el paso 4 y verificar que **nada** quedó escrito |
| `decimal.spec.ts` | 0.1 + 0.2 = 0.30 exacto; ningún importe es `number` en la respuesta JSON |
| `ledger-consistency.spec.ts` | Tras N operaciones aleatorias, `Member.balance` == suma del ledger |

### 4.4 Idempotencia — `test/idempotency/`

- Misma clave + mismo cuerpo → una sola ejecución, misma respuesta, header `Idempotency-Replayed: true`.
- Misma clave + cuerpo distinto → `409`.
- Dos requests simultáneos con la misma clave → uno ejecuta, el otro recibe `409 IN_PROGRESS` o espera y recibe el resultado.
- Aplicado a: alta de socio, asignación de membresía, movimiento de caja, reversa, pago de deuda, `access/check`, venta, broadcast.

### 4.5 Acceso y asistencia — `test/access/`

- Un test por `reasonCode` de la cadena de autorización.
- Doble check en el mismo día no crea dos asistencias ni descuenta dos clases.
- Concurrencia: dos checks simultáneos del mismo socio descuentan **una** clase.
- `AccessAttempt` se registra también cuando se deniega.
- Un socio de otro gimnasio con el mismo documento no se encuentra.
- El descuento de clase no baja de cero.

### 4.6 Membresías

- Solapamiento rechazado por el constraint `EXCLUDE`.
- Job de vencimiento pasa a `EXPIRED` usando la zona de la sede, no la del servidor.
- Test de borde: membresía que vence hoy a las 23:59 en Buenos Aires no vence a las 21:00 UTC.

### 4.7 Reservas — `test/scheduling/` (Etapa 9)

- Doble reserva del mismo socio y horario → 409.
- **Sobreventa**: 20 reservas concurrentes sobre un cupo de 10 → exactamente 10 confirmadas y 10 rechazadas.
- Cancelación libera cupo.
- Excepción de feriado bloquea reservas de ese día.
- Regla de límite horario.

### 4.8 Stock y POS — `test/pos/` (Etapa 10)

- Venta descuenta stock, impacta caja y crea `StockMovement`.
- **Stock negativo imposible**: 5 ventas concurrentes de 1 unidad con stock 3 → 3 éxitos, 2 rechazos.
- Anulación revierte stock y caja, sin borrar nada.

### 4.9 Mensajería — `test/messaging/` (Etapa 6)

- `dedupeKey` impide dos jobs para el mismo pago.
- Webhook repetido con el mismo `externalId` se ignora.
- Firma HMAC inválida → `401`.
- Reintento con backoff; tras N fallos va a DLQ y se marca `FAILED`.
- El `gymId` de un webhook **no** se toma del payload.

### 4.10 Auditoría

- Toda mutación marcada `@Audited()` genera exactamente un `AuditEvent`.
- El evento no contiene contraseñas, tokens ni documentos completos.
- `UPDATE`/`DELETE` sobre `AuditEvent` fallan a nivel de base.

## 5. Contratos

Por cada endpoint, un test que ejecuta la request real y hace `ResponseSchema.parse(body)`. Si el controller devuelve un campo que el contrato no declara, o falta uno declarado, el test falla.

Además: un test que verifica que **todo** endpoint registrado tiene un esquema de request y de response en `packages/contracts`. Un endpoint sin contrato rompe el CI.

Del lado del frontend, los handlers de MSW se construyen con los mismos esquemas, así que un cambio de contrato rompe simultáneamente los dos lados — que es exactamente lo que se busca.

## 6. Componentes (frontend)

Por cada pantalla crítica, los cinco estados:

| Estado | Qué se verifica |
|---|---|
| Loading | skeleton con la forma final, sin layout shift |
| Empty | mensaje correcto + CTA |
| Sin resultados (con filtros) | distinto del empty, con botón de limpiar |
| Error | mensaje accionable + reintento, filtros preservados |
| Success | datos correctos, acciones habilitadas según permiso |

Más:

- `PermissionGate` oculta lo que corresponde.
- `FeatureGate` muestra upsell en vez de error.
- `MoneyInput` nunca convierte a `number`.
- Navegación por teclado en login, access y cash.
- Cada componente crítico pasa axe sin violaciones serias o críticas.

## 7. E2E (Playwright)

Los 6 flujos del MVP, contra un backend real con base sembrada:

1. Login → seleccionar sede → dashboard.
2. Alta de socio con cobro inmediato → saldo en cero.
3. Alta de socio sin cobrar → deuda → cobro posterior → saldo en cero.
4. Abrir caja → ingreso → egreso → reversa con motivo → cerrar con diferencia declarada.
5. Acceso por documento: permitido, vencido denegado, segundo intento sin duplicar asistencia.
6. Cobro de cuota → recibo encolado y visible en el historial de mensajes.

Reglas: sin `waitForTimeout` (esperas por estado, no por reloj); base reseteada entre corridas; cada test corre con su propio usuario sembrado.

## 8. Tests biométricos

### 8.1 Con agente simulado (`FakeAgent`) — corren en CI

Un doble del agente que habla el mismo protocolo WebSocket:

| Test | Qué verifica |
|---|---|
| `pairing.spec.ts` | Pareo con secreto válido; secreto ya usado → 401; secreto de otro gimnasio → 404 |
| `enroll-happy.spec.ts` | Flujo completo con N muestras y calidad suficiente |
| `enroll-no-consent.spec.ts` | Sin consentimiento → 409, y **no** se crea credencial |
| `enroll-duplicate-finger.spec.ts` | Mismo dedo ya enrolado → 409 |
| `enroll-duplicate-template.spec.ts` | Template ya usado por otro socio → 409 (constraint `unique(gymId, templateHash)`) |
| `identify-match.spec.ts` | Match correcto + autorización + asistencia |
| `identify-revoked.spec.ts` | **Credencial revocada no matchea**, aunque el template sea idéntico |
| `identify-expired-membership.spec.ts` | Match correcto pero membresía vencida → `DENIED`, y queda `AccessAttempt` |
| `identify-no-match.spec.ts` | Sin match → `BIOMETRIC_NO_MATCH` registrado |
| `identify-cross-branch.spec.ts` | Un agente de la sede A **no** identifica contra el padrón de la sede B |
| `identify-cross-tenant.spec.ts` | Un agente del gimnasio A no identifica contra el padrón de B |
| `token-scope.spec.ts` | Token de `ENROLL` no sirve para `identify`; token atado al socio X no enrola al socio Y |
| `token-replay.spec.ts` | Token de un solo uso reutilizado → 401 |
| `agent-revoked.spec.ts` | Agente revocado → 403 inmediato |
| `no-pii-to-agent.spec.ts` | **La respuesta a `identify` no contiene nombre, documento, foto ni id del socio** |
| `crypto.spec.ts` | El template guardado no es igual al plano; descifra correctamente; **un ciphertext movido a otro `gymId` falla la verificación GCM (AAD)** |
| `retention.spec.ts` | El job borra físicamente los templates revocados hace más de 30 días |
| `consent-revoke-cascade.spec.ts` | Revocar consentimiento revoca todas las credenciales en la misma transacción |
| `quality-threshold.spec.ts` | Muestra bajo el umbral → 422, sin crear credencial |
| `rate-limit.spec.ts` | Exceder el límite de identify → 429 + `AuditEvent` |

### 8.2 Con hardware real — manuales, en la POC y antes de cada release del agente

Documentados en `biometrics/POC_PLAN.md`. Resumen: instalación del driver, detección, captura, calidad, enrolamiento, 1:1, 1:N con 20–50 identidades, latencia, falsos rechazos, desconexión USB, reconexión, reinicio de Windows, cancelación, timeout.

### 8.3 Desconexión y reconexión

- Con `FakeAgent`: el WS se cae en medio de un enrolamiento → el backend expira la sesión y no deja credencial a medias.
- Con `FakeAgent`: el agente se reconecta y reanuda el heartbeat sin duplicar el registro del dispositivo.
- Con hardware: desenchufar el lector durante la captura → mensaje claro en la UI, sin cuelgue.

## 9. Concurrencia

Los tests de concurrencia son de primera clase, no un extra. Patrón:

```ts
const results = await Promise.allSettled(
  Array.from({ length: 20 }, () => doTheThing())
)
expect(results.filter(ok).length).toBe(EXPECTED)
```

Casos obligatorios: apertura de caja, cierre de caja, reversa, cobro de cuota, `access/check`, reserva sobre cupo, venta sobre stock, asignación de `memberNumber`.

Se corren con la base real y con el nivel de aislamiento de producción. Si un test de concurrencia es flaky, **no se marca `retry`: se arregla el locking.**

## 10. Carga (desde la Etapa 6)

Escenarios con k6, contra un ambiente parecido a producción:

| Escenario | Objetivo |
|---|---|
| 30 checks de acceso / min sostenidos | p95 < 300 ms |
| 200 socios listados con filtros | p95 < 500 ms |
| Dashboard con 5.000 socios y 100.000 asistencias | p95 < 1 s |
| Identificación biométrica 1:N con 2.000 credenciales | p95 < 800 ms (medido en la POC, ver V6) |
| Broadcast a 1.000 socios | la cola no bloquea la operación de caja |

## 11. CI

```yaml
# Pipeline conceptual
lint          # eslint + prettier + typecheck
secrets       # gitleaks
unit          # vitest, paralelo
integration   # servicio postgres + redis, esquemas efímeros
contracts     # incluido en integration
components    # vitest + RTL
build         # turbo build de todas las apps
e2e           # playwright contra la build, base sembrada
a11y          # axe sobre pantallas críticas
```

Reglas:

- Todo debe estar verde para mergear. Sin excepciones "temporales".
- Los tests de `test/tenancy/` y `test/cash/` corren en **todos** los PRs, sin filtro por path.
- Cobertura: umbral global 80%, `common/` y servicios de dominio 90%, módulos de caja y biometría 90%. El umbral **sólo puede subir**.
- Los tests con hardware real están fuera del CI y se registran manualmente en `docs/biometrics/POC_RESULTS.md`.

## 12. Definition of Done de testing por etapa

| Etapa | Condición de salida |
|---|---|
| 1 | Un test de integración real contra Postgres corre en CI y pasa |
| 2 | `test/tenancy/` completo y verde; matriz de permisos verde |
| 3 | Constraint de documento duplicado probado; `memberNumber` bajo concurrencia; ledger consistente |
| 4 | Los 11 tests de caja verdes, incluidos los 3 de concurrencia y el de rollback |
| 5 | Un test por `reasonCode`; anti-duplicado de asistencia; concurrencia de descuento de clase |
| 6 | Deduplicación de mensajes; webhook idempotente; los 6 E2E verdes |
| 7 (POC) | Los 21 puntos de `POC_PLAN.md` ejecutados y documentados con resultado |
| 8 | Los 20 tests de `FakeAgent` verdes + checklist de hardware real firmado |
| 9-13 | Los tests de concurrencia de su dominio verdes (cupo, stock, puntos) |
