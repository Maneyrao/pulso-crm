# Simulated Fingerprint Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir enrolar e identificar socios desde `LeoDarrosaFIT.html`/`apps/web` usando el Pulso Agent con `FakeSensor`, sin disponer todavía del lector USB.

**Architecture:** El navegador nunca accede al USB. La API emite un `deviceToken` IDENTIFY de un solo uso, el navegador se lo entrega por WebSocket al agente local y el agente captura con `FakeSensor` y envía el template al backend. La pantalla `/access` consulta el resultado recién registrado y reinicia una captura single-shot con un token nuevo, ofreciendo una experiencia continua sin reutilizar tokens.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Next.js/React Query, TypeScript/Zod, .NET 8/C#, WebSocket local.

**Spec:** `docs/LEODARROSAFIT_ALIGNMENT_PLAN.md` (Fase 4), `docs/biometrics/WEBSOCKET_PROTOCOL.md`, `docs/biometrics/BIOMETRIC_SECURITY.md` y `docs/API_CONTRACTS.md` sección 10.

## Global Constraints

- El frontend visual sigue siendo `apps/web`, implementación operativa de `/Users/tmaneyro22/Documents/LeoDarrosaFIT.html`.
- El agente jamás recibe nombre, documento, foto ni decisión de acceso.
- Cada captura IDENTIFY usa un token nuevo, de un solo uso y TTL corto; el token vive sólo en memoria.
- El sensor simulado y el real implementan `IFingerprintSensor`; cambiar de hardware no cambia API ni frontend.
- El modo simulado se habilita sólo con `PULSO_AGENT_SENSOR=fake` y no reemplaza la validación futura con U.are.U 4500.
- No se modifica ni se incorpora al commit ningún cambio de despliegue preexistente.

---

### Task 1: FakeSensor con identidad biométrica estable

**Files:**
- Modify: `apps/local-agent/src/Pulso.Agent.Sensors/FakeSensor/FakeSensorOptions.cs`
- Modify: `apps/local-agent/src/Pulso.Agent.Sensors/FakeSensor/FakeSensor.cs`
- Modify: `apps/local-agent/src/Pulso.Agent.Host/Program.cs`
- Modify: `apps/local-agent/src/Pulso.Agent.Core/OperationCoordinator.cs`
- Test: `apps/local-agent/tests/Pulso.Agent.Core.Tests/FakeSensorTests.cs`
- Test: `apps/local-agent/tests/Pulso.Agent.Core.Tests/OperationCoordinatorIdentifyTests.cs`

**Interfaces:**
- Consumes: `IFingerprintSensor.CaptureAsync`, `IFingerprintSensor.CreateTemplateAsync`.
- Produces: `FakeSensorOptions.Identity: string`; enrolamiento de varias muestras e identificación de una muestra generan el mismo template para la misma identidad; `PULSO_AGENT_FAKE_IDENTITY` selecciona el perfil simulado.

- [x] **Step 1: Write the failing tests**

Agregar tests que capturen cuatro muestras y una quinta muestra, creen ambos templates y exijan igualdad para la misma identidad; otro test debe exigir desigualdad entre dos identidades. Agregar un test del coordinador que use un `deviceId` de backend distinto de `FAKE-0001` y aun así capture con el único sensor local.

- [x] **Step 2: Run tests to verify RED**

Run: `dotnet test apps/local-agent/tests/Pulso.Agent.Core.Tests/Pulso.Agent.Core.Tests.csproj --filter 'FakeSensor|backend_device_id'`

Expected: FAIL porque el template actual incorpora el índice de captura y porque el coordinador usa el id de base como id local del sensor.

- [x] **Step 3: Implement minimal behavior**

Codificar la identidad dentro de cada captura simulada y derivar el template únicamente de esa identidad, validando que todas las muestras pertenezcan al mismo perfil. Resolver el único sensor enumerado para capturar y conservar `request.DeviceId` sólo para el POST al backend.

- [x] **Step 4: Run tests to verify GREEN**

Run: `dotnet test apps/local-agent/Pulso.Agent.sln --nologo`

Expected: todos los proyectos .NET pasan sin tests omitidos.

### Task 2: Sesión IDENTIFY para operadores del CRM

**Files:**
- Modify: `packages/contracts/src/biometrics.ts`
- Modify: `packages/contracts/src/biometrics.spec.ts`
- Modify: `apps/api/src/modules/biometrics/biometrics.controller.ts`
- Modify: `apps/api/src/modules/biometrics/biometrics.service.ts`
- Modify: `apps/api/test/biometrics/biometrics.spec.ts`
- Modify: `docs/API_CONTRACTS.md`

**Interfaces:**
- Consumes: `{ branchId: string }`, sesión CRM con `access:operate`.
- Produces: `POST /api/v1/biometrics/identifications -> { deviceToken, deviceId, expiresAt, minQuality }`.

- [x] **Step 1: Write contract and API tests**

El contrato debe rechazar ids no UUID. El test de integración debe crear/parear/aprobar un agente, emitir el token vía HTTP (sin Prisma directo), identificar una vez y rechazar el replay. Debe rechazar una sede fuera de la sesión y un agente sin heartbeat vigente.

- [x] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @pulso/contracts test -- biometrics.spec.ts && pnpm --filter @pulso/api test -- biometrics.spec.ts`

Expected: FAIL con 404 para la nueva ruta o export inexistente.

- [x] **Step 3: Implement token issuance**

Seleccionar un agente `ACTIVE` y online de la sede autorizada, seleccionar su lector online, generar token prefijado con hash persistido y scope `IDENTIFY`, y devolver sólo el valor opaco y metadatos operativos. Usar `@Idempotent()` y `@RequiresPermission('access:operate')`.

- [x] **Step 4: Verify GREEN**

Run: `pnpm --filter @pulso/contracts test && pnpm --filter @pulso/api test`

Expected: contratos y API verdes.

### Task 3: Resultado consultable del intento biométrico

**Files:**
- Modify: `packages/contracts/src/access.ts`
- Modify: `apps/api/src/modules/access/access.controller.ts`
- Modify: `apps/api/src/modules/access/access.service.ts`
- Modify: `apps/api/test/biometrics/biometrics.spec.ts`
- Modify: `apps/web/lib/api/access.ts`

**Interfaces:**
- Consumes: `GET /api/v1/access/attempts/:id/result` y permiso `access:operate`.
- Produces: `AccessCheckResponse`, la misma forma que `POST /access/check`.

- [x] **Step 1: Write failing integration tests**

Después de un match, consultar el intento y exigir nombre del socio, membresía y decisión. Para no-match, exigir `member:null`, `membership:null` y `BIOMETRIC_NO_MATCH`. Un intento de otro tenant debe responder 404.

- [x] **Step 2: Verify RED**

Run: `pnpm --filter @pulso/api test -- biometrics.spec.ts`

Expected: FAIL con 404 para `GET /access/attempts/:id/result`.

- [x] **Step 3: Implement result serialization**

Buscar el intento dentro del tenant/sedes permitidas, incluir socio y la membresía relevante, y devolver el contrato `AccessCheckResponse` sin exponer `rawInput` ni templates.

- [x] **Step 4: Verify GREEN**

Run: `pnpm --filter @pulso/api test -- biometrics.spec.ts`

Expected: suite biométrica completa verde.

### Task 4: Modo huella en `/access`

**Files:**
- Modify: `apps/web/lib/agent/client.ts`
- Modify: `apps/web/lib/agent/real-agent.ts`
- Modify: `apps/web/lib/agent/fake-agent.ts`
- Modify: `apps/web/lib/agent/real-agent.spec.ts`
- Modify: `apps/web/lib/agent/fake-agent.spec.ts`
- Modify: `apps/web/lib/api/biometrics.ts`
- Create: `apps/web/components/access/FingerprintAccessPanel.tsx`
- Create: `apps/web/components/access/FingerprintAccessPanel.spec.tsx`
- Modify: `apps/web/app/(app)/access/page.tsx`

**Interfaces:**
- Consumes: `AgentClient.identifyStart`, `AgentClient.identifyStop`, `startIdentification`, `getAccessAttemptResult`, `listAccessAttempts`.
- Produces: panel con estados apagado/conectando/esperando/capturando/error, activación explícita y resultado enviado a `AccessResultCard`.

- [x] **Step 1: Write failing client tests**

Exigir que el cliente real emita `identify.start` con `continuous:false`, que `identify.stop` use el mismo `opId`, y que mapee `identify.failed`. Exigir el mismo contrato observable al fake del navegador.

- [x] **Step 2: Verify RED**

Run: `pnpm --filter @pulso/web test -- lib/agent`

Expected: FAIL porque `AgentClient` no expone identificación.

- [x] **Step 3: Implement agent client methods**

Agregar métodos sin persistir `deviceToken`; cada operación obtiene UUID nuevo. Mantener enrolamiento sin cambios de comportamiento.

- [x] **Step 4: Write failing panel test**

Simular agente ready, click en `Activar huella`, emisión de `identify.sent`, intento biométrico nuevo y resultado. Exigir que el panel pida un token nuevo para la siguiente lectura y que al desmontar envíe stop.

- [x] **Step 5: Implement panel and integrate page**

El panel ejecuta single-shot en bucle para respetar un token por captura. Tras `identify.sent`, consulta el intento más reciente de la sede, obtiene su resultado y recién entonces arma la siguiente operación. Errores de token tienen un solo reintento automático.

- [x] **Step 6: Verify GREEN**

Run: `pnpm --filter @pulso/web test && pnpm --filter @pulso/web typecheck`

Expected: frontend verde.

### Task 5: Runbook y verificación integral

**Files:**
- Create: `apps/local-agent/README.md`
- Modify: `docs/CONTROLFIT_PARITY_CHECKLIST.md`
- Modify: `docs/LEODARROSAFIT_ALIGNMENT_PLAN.md`

**Interfaces:**
- Consumes: .NET 8, API y web locales, agente aprobado con credencial de desarrollo.
- Produces: pasos exactos para ejecutar `FakeSensor`, elegir identidad con `PULSO_AGENT_FAKE_IDENTITY` y probar enrolamiento + acceso.

- [x] **Step 1: Document commands and limits**

Documentar variables, pareo/aprobación, arranque, cambio de identidad simulada y la frontera exacta pendiente: driver/SDK, matcher DigitalPersona y validación con hardware físico.

- [x] **Step 2: Run repository gates**

Run: `pnpm lint && pnpm typecheck && pnpm build && pnpm test && dotnet test apps/local-agent/Pulso.Agent.sln --nologo`

Expected: exit 0 en los cinco gates, sin tests omitidos por esta funcionalidad.

## Completion Record

- Completed: 2026-08-27.
- Repository gates: lint, typecheck, build, TypeScript tests and 131 .NET tests passed.
- API deployment: Railway production healthy (`/health/live` and `/health/ready`).
- Web deployment: Vercel preview built successfully with `/access` included.
- Remaining hardware boundary: install the vendor SDK/driver, implement the DigitalPersona adapter and validate capture quality with the physical reader.
