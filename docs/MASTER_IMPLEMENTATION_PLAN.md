# Plan maestro de implementación — Pulso CRM

Fecha: 2026-08-09
Estado: **propuesto, pendiente de aprobación.** No se ha escrito código de producto ni instalado dependencias.

Documentos de soporte: [ARCHITECTURE](ARCHITECTURE.md) · [ADRS](ADRS.md) · [DATA_MODEL](DATA_MODEL.md) · [API_CONTRACTS](API_CONTRACTS.md) · [FRONTEND_PLAN](FRONTEND_PLAN.md) · [SECURITY_MODEL](SECURITY_MODEL.md) · [TEST_STRATEGY](TEST_STRATEGY.md) · [DEPLOYMENT_PLAN](DEPLOYMENT_PLAN.md) · [biometrics/](biometrics/)

---

# A. Resumen ejecutivo

## Qué se construye

**Pulso** (nombre de trabajo, ADR-000): un CRM/SaaS multi-tenant y multi-sede para gimnasios. Centraliza socios, membresías, cuenta corriente, caja auditable, control de acceso, asistencias, comunicación por WhatsApp y estadísticas; y más adelante reservas, POS, rutinas, fidelización, facturación electrónica, asistente de IA, administración de plataforma y biometría con lector HID DigitalPersona U.are.U 4500.

## Para quién

Dueño o administrador del gimnasio, recepcionista, instructor, administrador de plataforma. El socio y el reseller entran en fases posteriores.

## Qué problema resuelve

Los gimnasios chicos y medianos operan con planillas, cuadernos y WhatsApp manual. El costo real no es la falta de un sistema: es que **nadie sabe cuánto entró hoy, quién debe, ni quién dejó de venir**. Pulso convierte cada evento operativo — un alta, un cobro, un ingreso al gimnasio, una deuda — en un registro auditable que alimenta cobranza, comunicación y decisiones.

## Qué incluye el MVP vendible (Etapas 1 a 6)

1. Login multi-gimnasio con roles y permisos reales.
2. Multi-sede con aislamiento estricto entre gimnasios.
3. Socios: alta, búsqueda, ficha, foto, apto médico, baja.
4. Planes, actividades y membresías con vencimiento y clases.
5. Cuenta corriente: deuda, pagos, reintegros.
6. Caja auditable: apertura, movimientos, reversas, aprobaciones, cierre con arqueo, libro diario.
7. Acceso por documento y tarjeta, con validación de membresía y registro de asistencia.
8. WhatsApp: recibo de pago y recordatorio de deuda, con cola, reintentos e historial.
9. Dashboard y estadísticas de asistencia, economía y socios.

## Qué queda para después

Biometría (7-8), reservas (9), POS (10), rutinas e instructores (11), fidelización (12), ARCA + IA + administración de plataforma (13).

## Riesgos principales

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R1 | **Cross-tenant**: un gimnasio ve datos de otro | Fin del producto | Tenant desde la sesión (ADR-008), extensión de Prisma (ADR-009), suite de tests generada automáticamente que corre en todos los PRs |
| R2 | **Caja no auditable**: números que no cierran | Pérdida de confianza irrecuperable | Movimientos inmutables, corrección por reversa, transacciones `SERIALIZABLE`, tests de concurrencia (ADR-010) |
| R3 | **La biometría no funciona con este hardware** | Se pierde una diferenciación esperada | POC obligatoria antes de la Etapa 8; el MVP se vende sin biometría |
| R4 | **Licencia del SDK de HID inviable o cara** | Bloquea la Etapa 8 | Cerrar V1/V2 por escrito **antes** de programar; Stack B (FingerJetFX + SourceAFIS) como alternativa a validar |
| R5 | **Alcance gigante** | Nunca se llega a vender | El corte del MVP en la Etapa 6 es una decisión, no una sugerencia |
| R6 | **Dinero con `float`** | Centavos que no cuadran | `Decimal(14,2)` en base, string en API, test explícito |
| R7 | **Doble cobro por doble click** | Reclamo del socio | Idempotencia obligatoria (ADR-016) |
| R8 | Entorno de desarrollo sin Docker ni Windows ni .NET | Frena etapas 1 y 7 | T-1.4 provee camino nativo; T-7.1 resuelve Windows/.NET antes de la POC |

## Estrategia general

1. **Verticalmente, no por capas.** Cada tarea atraviesa migración → modelo → servicio → controller → permisos → contrato → query/mutation → UI → tests. No se construye "todo el backend y después el frontend".
2. **Ejecutable desde la primera tarea.** La Etapa 1 termina con un sistema que levanta, responde y tiene un test real contra Postgres.
3. **Seguridad y multi-tenancy desde el commit 1**, no como endurecimiento posterior.
4. **La biometría después del MVP vendible**, y sólo tras una POC con veredicto.
5. **Una etapa no empieza hasta que la anterior cumple su Definition of Done.**

---

# B. Estado del repositorio

Todo lo que sigue está verificado en la sesión del 2026-08-09, no inferido.

## Qué existe

| Hecho | Detalle |
|---|---|
| Raíz git | `/Users/tmaneyro22/Documents/N8N AUTOMATIZACIONES` |
| **Commits** | **Cero.** `git log` responde `your current branch 'main' does not have any commits yet` |
| Estado | 10 entradas, **todas sin trackear**. No hay nada en el índice |
| `.gitignore` en la raíz | **No existe** |
| `.DS_Store` | Sin trackear y sin ignorar |
| Contenido de `controlfit-audit/` | `CONTROLFIT_AUDIT.md`, `CRM_GIMNASIO_ROADMAP.md`, `raw/` (HTML, chunks, TXT extraídos), `screenshots/`, `notes/`, `docs/_probe.md` |
| Código del CRM | **No existe ni una línea** |
| Otros proyectos en el mismo repo | `n8n-local`, `oeste-distribuidora`, `cv`, `docs`, `scripts`, `tmp`, `workflows`, `.playwright-mcp` |
| Secretos sin trackear en el árbol | `n8n-local/.env`, `oeste-distribuidora/backend/.env` |
| Convenciones existentes | `oeste-distribuidora/AGENTS.md` (proyecto distinto): FastAPI + SQLAlchemy + Alembic + Next.js 16 + React 19 + Tailwind 4 + TS 5.9 strict |

## Toolchain verificado

| Herramienta | Estado |
|---|---|
| Node | v25.9.0 ✅ |
| npm | 11.12.1 ✅ |
| pnpm | 10.33.2 ✅ |
| PostgreSQL | 16.14 (Homebrew) ✅ |
| git | 2.50.1 ✅ |
| gh | 2.89.0 ✅ |
| **Docker** | **No instalado** ❌ |
| **.NET** | **No instalado** ❌ |
| Redis | No verificado; asumir ausente |

## Qué falta

Absolutamente todo el producto: monorepo, backend, frontend, worker, base de datos, migraciones, seeds, tests, CI, configuración de despliegue y agente local.

## Qué puede reutilizarse

| Elemento | Uso |
|---|---|
| `CONTROLFIT_AUDIT.md` | Fuente de requisitos funcionales y de riesgos a evitar. **No** como especificación de API |
| `CRM_GIMNASIO_ROADMAP.md` | Fuente de bounded contexts y orden de fases |
| `raw/` | Evidencia. Se conserva, no se toca, **no se copia contenido al producto** |
| Convenciones de `oeste-distribuidora` | TS strict, Tailwind, estructura de docs. Referencia de estilo, no código |

## Qué no conviene conservar en el producto

- El nombre `controlfit-audit` para el código nuevo.
- Los nombres de dominio del producto auditado (`idcliente`, `sedes`, `servicios`, `suscripciones`, `rubros`), las rutas de su API y el puerto `17890`.
- Sus textos de interfaz y su lenguaje visual.
- Firebase Realtime Database (ADR-011).

## Conflictos y deuda técnica

| # | Situación | Recomendación |
|---|---|---|
| D1 | Repo git sin commits con 4 proyectos no relacionados y `.env` reales sin trackear | **ADR-001**: repo nuevo e independiente para el CRM. No se toca lo existente |
| D2 | Sin `.gitignore` en la raíz | Fuera de alcance de este proyecto; se menciona por higiene. Si el usuario quiere, es una tarea aparte |
| D3 | `.DS_Store` sin ignorar | Ídem |
| D4 | `controlfit-audit/docs/_probe.md` (archivo de una palabra, permisos `600`) | Residuo. No se borra sin permiso del usuario |
| D5 | Docker ausente | ADR-020: camino nativo + compose opcional |
| D6 | .NET y Windows ausentes | Prerrequisito explícito de la Etapa 7 (T-7.1) |

## Veredicto

**Proyecto nuevo**, no una continuación. No hay arquitectura previa que conservar, adaptar ni migrar. **No se sobrescribe ni se descarta nada de lo existente.**

---

# C. Decisiones arquitectónicas

Las 24 decisiones están en [ADRS.md](ADRS.md) con formato completo: decisión, motivo, alternativas evaluadas, alternativa descartada, trade-off y consecuencia. Resumen:

| ADR | Decisión |
|---|---|
| 000 | Nombre de trabajo "Pulso"; ningún identificador copiado del producto auditado |
| 001 | Repositorio nuevo e independiente |
| 002 | Monorepo pnpm + Turborepo |
| 003 | Backend NestJS, monolito modular (**resuelve contradicción C2**) |
| 004 | Frontend Next.js App Router + TS strict |
| 005 | Tailwind + shadcn/ui con identidad propia (**resuelve C3**) |
| 006 | PostgreSQL + Prisma |
| 007 | Cookies httpOnly + refresh rotativo con detección de reuso |
| 008 | Tenant desde la sesión, jamás desde headers |
| 009 | Aislamiento en dos capas: extensión de Prisma ahora, RLS después |
| 010 | `Decimal(14,2)`, movimientos inmutables, corrección por reversa |
| 011 | Socket.IO en la API; sin Firebase (**resuelve C4**) |
| 012 | Redis + BullMQ en worker separado |
| 013 | Contratos Zod compartidos + REST versionada; no tRPC |
| 014 | **Templates cifrados + matching centralizado** (Alternativa B); la A es inviable con este hardware (**resuelve C1**) |
| 015 | Agente local propio en C#/.NET; el stack JS de HID sólo captura |
| 016 | Idempotencia obligatoria en dinero y mensajería |
| 017 | Auditoría append-only desde el día 1 |
| 018 | Documento enmascarado por defecto |
| 019 | Web en Vercel; API, worker, Redis y Postgres fuera |
| 020 | Desarrollo local sin depender de Docker |
| 021 | UTC en base; cortes de día en la zona de la sede |
| 022 | Feature flags por plan, evaluadas en el backend |
| 023 | Tests de integración contra PostgreSQL real |

## Contradicciones detectadas entre documentos

| # | Contradicción | Impacto | Resolución |
|---|---|---|---|
| C1 | El roadmap propone guardar el template **dentro del dispositivo**; el U.are.U 4500 no tiene almacenamiento ni matcher on-device | Alto: invalida el diseño biométrico propuesto | ADR-014: templates cifrados en base, matching centralizado |
| C2 | Roadmap: "Next.js API routes **o** NestJS"; brief: NestJS | Medio: define toda la estructura | ADR-003: NestJS |
| C3 | Roadmap: "Material UI **o** shadcn/ui"; MUI es lo que usa el producto auditado y el brief prohíbe trade dress identificable | Medio: riesgo de parecido | ADR-005: Tailwind + shadcn/ui |
| C4 | Roadmap lista Firebase RTDB; brief pide WebSocket/Socket.IO | Bajo | ADR-011: Socket.IO |
| C5 | Roadmap pone huella en Fase 4; brief la pone en Etapas 7-8 tras el MVP | Medio: orden de construcción | Se sigue **el brief** |
| C6 | Roadmap estima sesiones por fase; el brief prohíbe estimaciones artificiales | Bajo | Se eliminan; el avance se mide por Definition of Done |
| C7 | El brief menciona un tercer documento (`Markdown(1).md pegado`) que **no fue adjuntado y no existe en el repositorio** (búsqueda ejecutada) | Desconocido | **Pregunta bloqueante B0** |

## Separación hechos / inferencias / recomendaciones

Para no presentar inferencias como hechos:

**Hechos comprobados en la auditoría** (respuestas HTTP y bundles públicos): las APIs probadas sin token devuelven `401 {"error":"Unauthorized: No token provided"}`; el frontend envía el header `x-idcliente` con el `idGym` tomado de un store del cliente; la configuración de navegación incluye `featureKey` por módulo; el cliente abre un WebSocket a `localhost:17890` con fallback de `wss` a `ws`; existen los eventos `attendance.dni`, `attendance.face_access`, `attendance.member_identified`, `attendance.member_not_identified`, `face.reader_status`; hay stores `auth-storage`, `gym-storage`, `sede-storage`, `ui-storage`, `cash-session-storage`; existe configuración de Firebase con URL de RTDB pública.

**Inferencias sobre el producto auditado** (razonables, no confirmadas): que el backend son API routes de Next en Vercel; el modelo de datos; que el token se persiste en `localStorage`; las reglas de negocio deducidas de textos de interfaz.

**Recomendaciones del roadmap**: stack sugerido, bounded contexts, orden de fases, modelo de datos propuesto.

**Decisiones nuevas de este producto**: las 24 ADRs. No derivan del producto auditado; varias lo contradicen a propósito (cookies httpOnly en vez de token en store, Socket.IO en vez de Firebase, tenant desde la sesión en vez de header, documento enmascarado).

---

# D. Arquitectura objetivo

Completa en [ARCHITECTURE.md](ARCHITECTURE.md). Resumen:

```mermaid
flowchart TB
  WEB["apps/web — Next.js<br/>Vercel"]
  AGENT["apps/local-agent — C#/.NET<br/>PC de recepción, wss://127.0.0.1:21987"]
  READER["U.are.U 4500 (USB)"]
  API["apps/api — NestJS<br/>REST /api/v1 + Socket.IO"]
  WORKER["apps/worker — BullMQ"]
  PG[("PostgreSQL 16")]
  REDIS[("Redis")]
  S3[("S3 compatible")]
  EXT["WhatsApp · ARCA · Sentry"]

  AGENT <--> READER
  WEB -- "cookies httpOnly, REST+WS" --> API
  WEB -- "WS local" --> AGENT
  AGENT -- "HTTPS + deviceToken" --> API
  API --> PG
  API --> REDIS
  API --> S3
  WORKER --> PG
  WORKER --> REDIS
  WORKER --> EXT
  API --> EXT
```

| Pieza | Qué es |
|---|---|
| `apps/web` | Panel operativo. Sin lógica de negocio |
| `apps/api` | Monolito modular NestJS, un módulo por bounded context |
| `apps/worker` | Colas: mensajería, vencimientos, puntos, facturación, outbox, mantenimiento |
| `apps/local-agent` | Puente USB ↔ WebSocket local ↔ HTTPS. **Identifica, no autoriza** |
| PostgreSQL | Única base operativa. Multi-tenant por columna |
| Redis | Colas, caché, adapter de Socket.IO, rate limiting |
| S3 compatible | Fotos, aptos médicos, exportaciones. URLs prefirmadas |
| Integraciones | WhatsApp (abstraído), ARCA, Sentry, proveedor de IA |
| Deploy | Web en Vercel; API/worker/Redis/Postgres fuera |

---

# E. Estructura del repositorio

Adaptada al repositorio real: como está vacío de código, se adopta la estructura propuesta por el brief sin fricción.

```
pulso-crm/                        # repo NUEVO (ADR-001)
├── apps/
│   ├── web/                      # Next.js App Router
│   ├── api/                      # NestJS
│   ├── worker/                   # BullMQ
│   └── local-agent/              # C#/.NET — FUERA del workspace pnpm (Etapa 8)
├── packages/
│   ├── contracts/                # Zod: requests, responses, errores, permisos
│   ├── db/                       # Prisma schema, cliente, extensión de tenant, seeds
│   ├── ui/                       # tokens propios + componentes
│   ├── config/                   # env con Zod, tiempo/timezone, dinero, documento
│   ├── eslint-config/
│   └── tsconfig/
├── docs/                         # copiados de este plan + los que se generen
│   └── biometrics/
├── scripts/
│   ├── dev-services.sh           # levanta Postgres/Redis (docker o nativo)
│   └── check-env.ts
├── .github/workflows/ci.yml
├── docker-compose.yml            # opcional (ADR-020)
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .gitignore
├── .env.example
└── README.md
```

`pnpm-workspace.yaml` incluye `apps/*` y `packages/*` pero **excluye** `apps/local-agent` (no es un paquete de Node).

---

# F. Modelo de dominio y datos

Completo en [DATA_MODEL.md](DATA_MODEL.md): 10 bounded contexts, todas las entidades con campos, tipos, relaciones, constraints, índices, máquinas de estado, soft delete, inmutabilidad y alcance por etapa.

Incluye las 8 entidades biométricas exigidas por el brief: `LocalAgent`, `AccessDevice`, `BiometricCredential`, `BiometricEnrollment`, `BiometricConsent`, `AccessAttempt`, `Attendance`, `AgentAuditEvent` (más `DeviceToken`).

## Los constraints que el brief exige, y cómo se garantizan

| Requisito | Mecanismo |
|---|---|
| Documentos duplicados por gimnasio | `unique(gymId, documentType, documentNumber) where deletedAt is null` |
| Cruces entre tenants | `gymId` en toda tabla + uniques compuestos + extensión de Prisma + tests generados + RLS después |
| Doble reserva | `unique(gymId, scheduleSlotId, memberId, date) where status='RESERVED'` |
| Sobreventa de cupos | Transacción `SERIALIZABLE` + `FOR UPDATE` + test de concurrencia |
| Stock negativo | `check (stock >= 0)` + `FOR UPDATE` en la venta |
| Pagos procesados dos veces | `IdempotencyKey unique(gymId, key)` + `unique(reversalOfId)` |
| Jobs duplicados | `jobId` determinístico + `unique(gymId, dedupeKey)` |
| Webhooks duplicados | `unique(provider, externalId)` |
| Doble registro de asistencia | `unique(gymId, memberId, branchId, occurredOn)` |
| Dos cajas incompatibles por usuario | `unique(gymId, openedByUserId) where status='OPEN'` + `unique(cashRegisterId) where status='OPEN'` |
| Cierre con pendientes | Validación transaccional con `FOR UPDATE` |
| Clases negativas | `check (classesRemaining >= 0)` |
| Misma huella en dos socios | `unique(gymId, templateHash) where status='ACTIVE'` |
| Membresías solapadas | `EXCLUDE USING gist` con `daterange` |

---

# G. Contratos del backend

Completos en [API_CONTRACTS.md](API_CONTRACTS.md). API **propia**: no replica rutas ni formas del producto auditado.

Convenciones definidas: versionado por path (`/api/v1`), errores RFC-7807 con `code` de catálogo estable, paginación por cursor y por offset, filtros tipados con allowlist de ordenamiento, ISO-8601 con offset para instantes y `YYYY-MM-DD` para fechas de negocio, zona de la sede para cortes de día, dinero como **string decimal**, `Idempotency-Key` obligatoria en operaciones con efecto, rate limits por grupo.

Cada endpoint especifica método, ruta, permiso, feature, input, output, errores, reglas, transacción, idempotencia, eventos, jobs y tests.

---

# H. Plan del frontend

Completo en [FRONTEND_PLAN.md](FRONTEND_PLAN.md): árbol de rutas, `AppShell`, selector de sede, tres capas de guards, capa de datos con TanStack Query, manejo centralizado de errores, y la especificación por pantalla (ruta, objetivo, roles, componentes, datos, queries, mutations, formularios, validación, loading, empty, error, success, responsive, accesibilidad, tests).

Incluye la identidad visual propia con tokens desde cero y la prohibición explícita de copiar layout, colores o textos del producto auditado.

---

# I. Agente biométrico

Tres documentos:

- [LOCAL_AGENT_ARCHITECTURE.md](biometrics/LOCAL_AGENT_ARCHITECTURE.md) — arquitectura, tecnología, componentes, ciclos de vida, máquina de estados, timeouts, reconexión, offline, logs, estructura del proyecto.
- [WEBSOCKET_PROTOCOL.md](biometrics/WEBSOCKET_PROTOCOL.md) — endpoint `wss://127.0.0.1:21987/agent/v1`, TLS local, handshake, formato de mensaje, versionado, catálogo completo de mensajes y payloads, códigos de error, diagramas de secuencia, fixtures compartidas entre .NET y TypeScript.
- [BIOMETRIC_SECURITY.md](biometrics/BIOMETRIC_SECURITY.md) — consentimiento, envelope encryption con AAD por tenant, matching, umbral, antifraude, separación de responsabilidades, auditoría, retención, incidentes, revisión legal pendiente.
- [INSTALLATION_AND_SUPPORT.md](biometrics/INSTALLATION_AND_SUPPORT.md) — requisitos, instalación, desinstalación, actualización, 9 runbooks, conflictos conocidos, métricas de soporte, onboarding.

La investigación del hardware está en [UAREU_4500_RESEARCH.md](biometrics/UAREU_4500_RESEARCH.md), con cada afirmación etiquetada `[OFICIAL]`, `[MIRROR]`, `[INFERIDO]` o `[PENDIENTE]`.

---

# J. Seeds y desarrollo local

## Servicios locales

Docker **no está instalado** en la máquina; PostgreSQL 16.14 **sí**. `scripts/dev-services.sh` detecta el entorno:

```bash
# Camino A: Docker (si está disponible)
docker compose up -d postgres redis

# Camino B: nativo (macOS con Homebrew) — el que aplica hoy
brew services start postgresql@16
brew install redis && brew services start redis
createdb pulso_dev && createdb pulso_test
```

## `.env.example`

```bash
# ── Base de datos ──────────────────────────────────────────
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pulso_dev?schema=public"
DIRECT_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pulso_dev?schema=public"
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pulso_test?schema=public"

# ── Redis ──────────────────────────────────────────────────
REDIS_URL="redis://localhost:6379"

# ── API ────────────────────────────────────────────────────
NODE_ENV="development"
PORT="3001"
LOG_LEVEL="debug"

# ── Auth (valores de ejemplo, NO usar en producción) ───────
JWT_SECRET="dev-only-change-me-0000000000000000000000000000000000000000000000"
ACCESS_TOKEN_TTL="900"
REFRESH_TOKEN_TTL="2592000"
COOKIE_DOMAIN="localhost"
CORS_ORIGINS="http://localhost:3000"

# ── Cifrado (valor de ejemplo) ─────────────────────────────
MASTER_KEK="ZGV2LW9ubHktbm90LWEtcmVhbC1rZXktMDAwMDAwMDAwMDA="

# ── Storage ────────────────────────────────────────────────
S3_ENDPOINT="http://localhost:9000"
S3_BUCKET="pulso-dev"
S3_ACCESS_KEY_ID="dev"
S3_SECRET_ACCESS_KEY="dev"
S3_REGION="auto"

# ── Web ────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_APP_ENV="development"

# ── Opcionales ─────────────────────────────────────────────
SENTRY_DSN=""
WHATSAPP_PROVIDER="mock"
BIOMETRIC_MATCH_THRESHOLD=""   # se define tras la POC
```

**Ninguno de estos valores es un secreto real.** El repositorio no contiene credenciales.

## Seed reproducible

`packages/db/prisma/seed.ts`, determinístico (semilla fija, sin `Math.random()` ni fechas del reloj sin anclar). `pnpm db:seed` produce siempre lo mismo.

| Entidad | Contenido |
|---|---|
| Gimnasio | 1 — "Gimnasio Demo", ARS, país AR |
| Sedes | 2 — "Sede Centro" y "Sede Norte", ambas `America/Argentina/Buenos_Aires` |
| Roles | `OWNER`, `MANAGER`, `RECEPTIONIST`, `INSTRUCTOR` con sus permisos |
| Usuarios | `admin@demo.local` (OWNER, ambas sedes) · `recepcion@demo.local` (RECEPTIONIST, Sede Centro) · `profe@demo.local` (INSTRUCTOR) |
| Contraseña | `Demo.1234` para los tres — **sólo desarrollo**, el seed se niega a correr si `NODE_ENV=production` |
| Actividades | Musculación, Funcional, Spinning |
| Planes | Mensual Libre · Mensual 3 clases/semana · Trimestral Libre · Pack 10 clases |
| Métodos de pago | Efectivo (cuenta en arqueo), Débito, Crédito, Transferencia, QR |
| Conceptos de caja | Ingreso: Venta, Otro. Egreso: Proveedor, Sueldos, Limpieza, Otro |
| Cajas | 1 por sede |
| Socios | **40 en total**: 25 activos con membresía vigente · 8 con membresía vencida · 5 activos con deuda · 2 inactivos |
| Cuenta corriente | Asientos coherentes: los 5 deudores tienen `DEBIT` sin `CREDIT`; el resto cierra en cero |
| Caja | 1 sesión cerrada del día anterior con ~15 movimientos, y 1 sesión abierta en Sede Centro |
| Asistencias | ~200 de los últimos 30 días, distribuidas de forma realista por hora y día |
| Dispositivo biométrico simulado | 1 `LocalAgent` "Recepción Centro (simulado)" con 1 `AccessDevice` `UAREU_4500` en estado `ONLINE`, y 3 socios con `BiometricConsent` y credenciales de **template ficticio** — permite desarrollar la UI de biometría **sin hardware** |

Los datos personales del seed son inventados. Ningún documento corresponde a una persona real: se usa el rango `90.000.000–90.000.999`, reservado por convención del proyecto para datos de prueba.

## Comandos

```bash
pnpm install               # instala el workspace
pnpm dev:services          # levanta Postgres y Redis (docker o nativo)
pnpm db:migrate            # aplica migraciones en desarrollo
pnpm db:seed               # siembra datos demo
pnpm dev                   # api (3001) + web (3000) + worker en paralelo
pnpm test                  # unit + integración
pnpm test:e2e              # Playwright
pnpm lint                  # eslint + prettier + typecheck
pnpm check:env             # valida que el .env tenga todo lo necesario
pnpm db:reset              # DESTRUCTIVO: sólo en local, pide confirmación
```

---

# K. Estrategia de pruebas

Completa en [TEST_STRATEGY.md](TEST_STRATEGY.md). Titulares:

- Pirámide con el peso en **integración contra PostgreSQL real** (esquema efímero por archivo de test).
- Suite de multi-tenancy **generada a partir del registro de rutas**: un endpoint nuevo aparece solo en la matriz.
- Matriz de permisos rol × endpoint.
- Caja: 11 archivos, incluidos 3 de concurrencia y 1 de rollback.
- Idempotencia en las 8 operaciones con efecto.
- Concurrencia como test de primera clase: apertura y cierre de caja, reversa, cobro, acceso, reserva sobre cupo, venta sobre stock, `memberNumber`.
- Contratos: la respuesta real se valida contra Zod; un endpoint sin contrato rompe el CI.
- Componentes: los cinco estados por pantalla; empty y sin-resultados son distintos.
- E2E: 6 flujos.
- Biometría: 20 tests con `FakeAgent` en CI + checklist de hardware real.
- Accesibilidad: axe en CI sobre login, access, members, cash.
- **Prohibido desactivar tests o bajar umbrales de cobertura.**

---

# L. Deploy y operación

Completo en [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md): ambientes, topología, variables por app, migraciones compatibles hacia atrás en dos pasos, pipeline con aprobación manual a producción, rollback por componente, health checks con verificación de migraciones, logging con redacción, métricas y alertas con umbrales, backups con **restore drill trimestral obligatorio**, actualización del agente local por fases con firma verificada, soporte por sede con `requestId`, y checklist de go-live.

---

# 10. Roadmap ejecutable

## Convenciones

- Los IDs son estables: `T-<etapa>.<n>`.
- "Bloquea la siguiente tarea" indica si el milestone puede continuar sin ella.
- Las tareas de Etapas 0 a 8 usan la plantilla completa. Las de Etapas 9 a 13 se listan por milestone y se expanden a plantilla completa **al comenzar esa etapa** — planificar 5 etapas al detalle antes de tener el MVP en manos de un cliente produce planes que envejecen mal. Es una decisión explícita, no una omisión.

---

## Etapa 0 — Discovery y decisiones

### M0.1 — Cierre de discovery

```text
ID: T-0.1
Nombre: Resolver preguntas bloqueantes y aprobar ADRs
Etapa: 0
Objetivo: Obtener del usuario la respuesta a las 5 preguntas bloqueantes (§13) y la aprobación explícita de las 24 ADRs.
Motivación: Cuatro de las cinco preguntas cambian la estructura del repositorio o el alcance. Empezar sin respuesta obliga a rehacer.
Dependencias: ninguna.
Estado inicial esperado: Los 16 documentos de docs/ escritos y leídos por el usuario.
Archivos o carpetas afectados: docs/ADRS.md (cambia estado PROPUESTO -> ACEPTADO), docs/MASTER_IMPLEMENTATION_PLAN.md (§13).
Cambios de base de datos: ninguno.
Cambios de backend: ninguno.
Cambios de frontend: ninguno.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: ninguno.
Comandos de verificación: ninguno (tarea de decisión).
Criterios de aceptación:
  - Las 5 preguntas bloqueantes tienen respuesta escrita en el documento.
  - Cada ADR está marcada ACEPTADO, RECHAZADO o MODIFICADO con su motivo.
  - Si alguna ADR se rechaza, se escribe la ADR que la reemplaza antes de continuar.
Resultado observable: docs/ADRS.md sin ninguna ADR en estado PROPUESTO.
Riesgos: Que el usuario apruebe sin leer y aparezcan objeciones en la Etapa 3, cuando corregir es caro.
Rollback: No aplica.
Fuera de alcance: Escribir código.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-0.2
Nombre: Crear el repositorio del producto y trasladar la documentación
Etapa: 0
Objetivo: Un repositorio git nuevo, con .gitignore, README, docs/ copiados y un commit inicial.
Motivación: ADR-001. El repo actual tiene 0 commits, 4 proyectos sin relación y .env reales sin trackear.
Dependencias: T-0.1 (respuesta a B1).
Estado inicial esperado: Directorio destino inexistente.
Archivos o carpetas afectados: CREA ~/Documents/pulso-crm/ completo. NO TOCA nada dentro de "N8N AUTOMATIZACIONES".
Cambios de base de datos: ninguno.
Cambios de backend: ninguno.
Cambios de frontend: ninguno.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: ninguno.
Comandos de verificación:
  git -C ~/Documents/pulso-crm log --oneline
  git -C ~/Documents/pulso-crm status --porcelain    # debe salir vacío
  ls ~/Documents/pulso-crm/docs/biometrics
  git -C "~/Documents/N8N AUTOMATIZACIONES" status --porcelain   # sin cambios respecto del inicio
Criterios de aceptación:
  - Repo con 1 commit y árbol limpio.
  - .gitignore cubre node_modules, .next, dist, .env*, .DS_Store, coverage, *.tsbuildinfo.
  - Los 16 documentos están en docs/ y docs/biometrics/.
  - Los originales en controlfit-audit/docs/ siguen existiendo sin modificar.
  - README explica qué es el proyecto y cómo levantarlo (aunque todavía no haya nada que levantar).
Resultado observable: `git log` muestra "chore: bootstrap repository and documentation".
Riesgos: Copiar por error archivos de auditoría con datos del producto auditado al repo del producto.
Rollback: rm -rf ~/Documents/pulso-crm (el repo original no se tocó).
Fuera de alcance: Instalar dependencias, crear apps, tocar el repo existente.
Bloquea la siguiente tarea: Sí
```

---

## Etapa 1 — Fundación técnica

### M1.1 — Monorepo y herramientas

```text
ID: T-1.1
Nombre: Monorepo pnpm + Turborepo con configuración compartida
Etapa: 1
Objetivo: Workspace funcional con packages/tsconfig, packages/eslint-config y packages/config, y comandos turbo que corren en vacío sin error.
Motivación: ADR-002. Toda tarea posterior asume esta base.
Dependencias: T-0.2
Estado inicial esperado: Repo con un commit y sólo documentación.
Archivos o carpetas afectados: package.json, pnpm-workspace.yaml, turbo.json, .npmrc, packages/tsconfig/*, packages/eslint-config/*, packages/config/*, .editorconfig, .prettierrc
Cambios de base de datos: ninguno.
Cambios de backend: ninguno.
Cambios de frontend: ninguno.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna todavía; packages/config define el esquema Zod vacío que crecerá.
Migraciones: ninguna.
Seeds: ninguno.
Tests: packages/config — un test que verifica que el parser de env falla con una variable faltante.
Comandos de verificación:
  pnpm install
  pnpm lint
  pnpm typecheck
  pnpm test
Criterios de aceptación:
  - pnpm-workspace.yaml incluye apps/* y packages/*, y excluye apps/local-agent.
  - TypeScript en modo strict, con noUncheckedIndexedAccess.
  - ESLint prohíbe: dangerouslySetInnerHTML, interpolación en $queryRaw, console.log en apps/api.
  - Los cuatro comandos terminan en 0.
Resultado observable: `pnpm lint && pnpm typecheck && pnpm test` verde con el workspace vacío.
Riesgos: Versiones incompatibles entre Turborepo y pnpm 10.
Rollback: git revert del commit.
Fuera de alcance: Crear apps.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-1.2
Nombre: Servicios locales (PostgreSQL + Redis) con camino nativo y Docker opcional
Etapa: 1
Objetivo: Un comando levanta Postgres y Redis en esta máquina, que no tiene Docker.
Motivación: ADR-020. Hecho comprobado: Docker no está instalado; PostgreSQL 16.14 sí.
Dependencias: T-1.1
Estado inicial esperado: PostgreSQL 16.14 por Homebrew disponible; Redis probablemente ausente.
Archivos o carpetas afectados: scripts/dev-services.sh, docker-compose.yml, .env.example, README.md
Cambios de base de datos: crea las bases pulso_dev y pulso_test (vacías).
Cambios de backend: ninguno.
Cambios de frontend: ninguno.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: DATABASE_URL, DIRECT_DATABASE_URL, TEST_DATABASE_URL, REDIS_URL en .env.example.
Migraciones: ninguna.
Seeds: ninguno.
Tests: ninguno automatizado; el script verifica conectividad y falla con mensaje claro.
Comandos de verificación:
  pnpm dev:services
  psql "$DATABASE_URL" -c "select version();"
  redis-cli ping
Criterios de aceptación:
  - El script detecta si hay Docker y elige camino; si no, usa Homebrew.
  - Si falta Redis, imprime exactamente el comando para instalarlo; no falla en silencio.
  - Crea pulso_dev y pulso_test si no existen; es idempotente.
  - .env.example completo y .env real creado a partir de él, ignorado por git.
Resultado observable: psql y redis-cli responden.
Riesgos: Conflicto de puertos con un Postgres ya corriendo.
Rollback: brew services stop; dropdb pulso_dev pulso_test.
Fuera de alcance: Configurar S3/MinIO (se agrega en T-3.9).
Bloquea la siguiente tarea: Sí
```

### M1.2 — Las tres apps arrancando

```text
ID: T-1.3
Nombre: apps/api NestJS con health checks, logging estructurado y configuración validada
Etapa: 1
Objetivo: La API levanta en :3001, responde /health/live y /health/ready, y loguea en JSON con requestId.
Motivación: Primera pieza ejecutable. Todo lo demás cuelga de acá.
Dependencias: T-1.2
Estado inicial esperado: Workspace sin apps.
Archivos o carpetas afectados: apps/api/** (main.ts, app.module.ts, common/logging, common/errors, modules/health), packages/config (esquema de env de la API)
Cambios de base de datos: ninguno (ready todavía no chequea Postgres; se agrega en T-1.4).
Cambios de backend: creación completa.
Cambios de frontend: ninguno.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: NODE_ENV, PORT, LOG_LEVEL, CORS_ORIGINS.
Migraciones: ninguna.
Seeds: ninguno.
Tests: e2e de Nest sobre /health/live y /health/ready; unit del filtro de errores que verifica el shape RFC-7807.
Comandos de verificación:
  pnpm --filter @pulso/api dev
  curl -s localhost:3001/health/live | jq
  curl -s -i localhost:3001/nope        # 404 con shape de error
  pnpm --filter @pulso/api test
Criterios de aceptación:
  - /health/live devuelve 200.
  - Un error devuelve el shape {type,code,title,status,detail,requestId}.
  - Los logs son JSON con requestId, y el header X-Request-Id vuelve en la respuesta.
  - Arrancar sin una variable obligatoria falla al inicio con un mensaje que dice cuál falta.
Resultado observable: curl a /health/live responde 200 y el log muestra la línea JSON.
Riesgos: Ninguno relevante.
Rollback: git revert.
Fuera de alcance: Auth, base de datos, cualquier módulo de dominio.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-1.4
Nombre: packages/db con Prisma, migración de extensiones y el primer test de integración real
Etapa: 1
Objetivo: Prisma configurado, migración 0001_extensions aplicada, PrismaService inyectable, y un test de integración que corre contra PostgreSQL real.
Motivación: ADR-006 y ADR-023. El primer test contra base real vale más que veinte con mocks.
Dependencias: T-1.3
Estado inicial esperado: Base pulso_dev vacía.
Archivos o carpetas afectados: packages/db/**, apps/api/src/infra/prisma/**, apps/api/src/modules/health (ready pasa a chequear Postgres), test/setup/database.ts
Cambios de base de datos: migración 0001_extensions (pgcrypto, citext, btree_gist, pg_trgm) + tabla temporal _health_probe para el smoke test.
Cambios de backend: PrismaService, módulo de infraestructura, readiness real.
Cambios de frontend: ninguno.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: DATABASE_URL, DIRECT_DATABASE_URL, TEST_DATABASE_URL.
Migraciones: 0001_extensions.
Seeds: ninguno.
Tests: integración — el helper crea un esquema efímero, corre migraciones, hace un SELECT 1 y limpia; test de /health/ready que devuelve 503 con la base caída.
Comandos de verificación:
  pnpm db:migrate
  psql "$DATABASE_URL" -c "\dx"      # debe listar las 4 extensiones
  pnpm --filter @pulso/api test:integration
  curl -s localhost:3001/health/ready | jq
Criterios de aceptación:
  - Las 4 extensiones existen.
  - El test de integración corre contra Postgres real, no contra un mock.
  - Cada archivo de test usa su propio esquema y lo destruye.
  - /health/ready devuelve 503 si Postgres no responde.
Resultado observable: pnpm test:integration verde con la base real.
Riesgos: Que el usuario de Postgres no tenga permiso para crear extensiones.
Rollback: Revertir la migración con prisma migrate resolve; dropdb en local.
Fuera de alcance: Cualquier tabla de dominio.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-1.5
Nombre: apps/web Next.js con Tailwind, packages/ui y tokens propios
Etapa: 1
Objetivo: El frontend levanta en :3000, muestra una página que consulta /health/ready de la API, y usa los tokens propios.
Motivación: Cierra el circuito web -> API en la primera etapa.
Dependencias: T-1.3
Estado inicial esperado: Workspace con api pero sin web.
Archivos o carpetas afectados: apps/web/**, packages/ui/** (tokens.css, Button, Card), packages/contracts/** (primer esquema: HealthResponse)
Cambios de base de datos: ninguno.
Cambios de backend: habilitar CORS con credenciales para el origen de desarrollo.
Cambios de frontend: creación completa.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_APP_ENV.
Migraciones: ninguna.
Seeds: ninguno.
Tests: componente del Button (variantes y estado disabled); test que valida la respuesta de health contra el esquema Zod.
Comandos de verificación:
  pnpm --filter @pulso/web dev
  curl -s localhost:3000 | grep -qi pulso
  pnpm --filter @pulso/web test
Criterios de aceptación:
  - La página de estado muestra api: ok / db: ok leyendo de la API real.
  - Los tokens de packages/ui están aplicados; nada de colores hardcodeados en apps/web.
  - Modo claro y oscuro funcionan.
  - El esquema Zod es la única definición del tipo de la respuesta.
Resultado observable: localhost:3000 muestra el estado real del backend.
Riesgos: CORS con credenciales mal configurado.
Rollback: git revert.
Fuera de alcance: Login, AppShell, cualquier pantalla de negocio.
Bloquea la siguiente tarea: No
```

```text
ID: T-1.6
Nombre: apps/worker con BullMQ y un job verificable de punta a punta
Etapa: 1
Objetivo: El worker levanta, consume una cola y procesa un job encolado por la API.
Motivación: ADR-012. Tener el worker desde el inicio evita que la lógica de background termine dentro de un request.
Dependencias: T-1.4
Estado inicial esperado: Redis corriendo.
Archivos o carpetas afectados: apps/worker/**, apps/api/src/infra/queue/**, packages/config (esquema de env del worker)
Cambios de base de datos: ninguno.
Cambios de backend: QueueModule y un endpoint de desarrollo POST /dev/ping-job (sólo si NODE_ENV=development).
Cambios de frontend: ninguno.
Cambios del worker: creación completa.
Cambios del agente local: ninguno.
Variables de entorno: REDIS_URL.
Migraciones: ninguna.
Seeds: ninguno.
Tests: integración — encolar un job y verificar que se procesa; verificar que el mismo jobId no se procesa dos veces.
Comandos de verificación:
  pnpm --filter @pulso/worker dev
  curl -XPOST localhost:3001/dev/ping-job
  # el log del worker muestra el job procesado
  pnpm --filter @pulso/worker test
Criterios de aceptación:
  - El job se procesa y deja log estructurado con el mismo requestId que lo encoló.
  - Un jobId repetido no se procesa dos veces.
  - El worker no expone puerto HTTP.
  - El endpoint de desarrollo no existe con NODE_ENV=production (test que lo verifica).
Resultado observable: El log del worker muestra el job procesado tras el curl.
Riesgos: Redis no instalado (lo resuelve T-1.2).
Rollback: git revert.
Fuera de alcance: Colas reales de negocio.
Bloquea la siguiente tarea: No
```

### M1.3 — CI

```text
ID: T-1.7
Nombre: Pipeline de CI con servicios de Postgres y Redis
Etapa: 1
Objetivo: GitHub Actions corre lint, typecheck, detección de secretos, unit, integración y build en cada push y PR.
Motivación: Sin CI desde el inicio, la disciplina de tests se erosiona.
Dependencias: T-1.4, T-1.5, T-1.6
Estado inicial esperado: Las tres apps arrancan y sus tests pasan en local.
Archivos o carpetas afectados: .github/workflows/ci.yml, .gitleaks.toml, README.md
Cambios de base de datos: ninguno (CI usa contenedores efímeros).
Cambios de backend: ninguno.
Cambios de frontend: ninguno.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: las de test, definidas en el workflow con valores obviamente falsos.
Migraciones: el pipeline corre prisma migrate deploy contra la base efímera.
Seeds: ninguno.
Tests: los existentes; el CI es la infraestructura que los corre.
Comandos de verificación:
  git push && gh run watch
Criterios de aceptación:
  - El pipeline pasa en verde.
  - gitleaks corre y falla ante un secreto de prueba inyectado a propósito (verificado una vez y luego revertido).
  - Los jobs corren en paralelo donde se puede.
  - El pipeline tarda menos de 10 minutos.
Resultado observable: Check verde en el PR.
Riesgos: Diferencias de versión de Postgres entre local y CI.
Rollback: Deshabilitar el workflow (no borrarlo).
Fuera de alcance: Deploy automático.
Bloquea la siguiente tarea: Sí
```

---

## Etapa 2 — Base SaaS

### M2.1 — Esquema y autenticación

```text
ID: T-2.1
Nombre: Migraciones de tenancy, IAM y primitivas de plataforma
Etapa: 2
Objetivo: Tablas Gym, Branch, SaasPlan, SystemConfig, User, Role, UserRoleAssignment, RefreshToken, AuditEvent, IdempotencyKey, OutboxEvent con todos sus constraints.
Motivación: Es la base de todo el resto; los constraints tienen que estar desde el principio, no agregarse después con datos ya cargados.
Dependencias: T-1.7
Estado inicial esperado: Base con sólo las extensiones.
Archivos o carpetas afectados: packages/db/prisma/schema.prisma, packages/db/prisma/migrations/0002..0004
Cambios de base de datos: migraciones 0002_tenancy, 0003_iam, 0004_platform_primitives.
Cambios de backend: sólo tipos generados.
Cambios de frontend: ninguno.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: 0002, 0003, 0004.
Seeds: ninguno todavía.
Tests: integración que verifica cada constraint: unique(gymId,email) parcial, unique(slug), unique(gymId,name) en Branch, y que UPDATE/DELETE sobre AuditEvent fallan.
Comandos de verificación:
  pnpm db:migrate
  psql "$DATABASE_URL" -c "\d+ users"
  pnpm --filter @pulso/api test:integration -- tenancy-schema
Criterios de aceptación:
  - Todos los constraints de DATA_MODEL.md secciones 1 y 2 existen en la base.
  - Insertar dos usuarios con el mismo email en el mismo gimnasio falla.
  - Insertar el mismo email en gimnasios distintos funciona.
  - UPDATE sobre AuditEvent falla por permisos.
Resultado observable: \d+ muestra los índices; los tests de constraints pasan.
Riesgos: Olvidar que un unique debe ser compuesto con gymId — es el error más caro de esta etapa.
Rollback: Migración inversa; en local, db:reset.
Fuera de alcance: Endpoints.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-2.2
Nombre: Autenticación con cookies httpOnly y rotación de refresh con detección de reuso
Etapa: 2
Objetivo: POST /auth/login, /auth/refresh, /auth/logout y GET /auth/me funcionando con argon2id y cookies seguras.
Motivación: ADR-007. Es el control que evita heredar el riesgo detectado en la auditoría (token en store accesible por JS).
Dependencias: T-2.1
Estado inicial esperado: Tablas creadas, sin usuarios.
Archivos o carpetas afectados: apps/api/src/modules/auth/**, apps/api/src/common/auth/**, packages/contracts/auth.ts
Cambios de base de datos: ninguno (usa 0003).
Cambios de backend: módulo auth completo, JwtAuthGuard, estrategia de cookies.
Cambios de frontend: ninguno todavía.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: JWT_SECRET, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, COOKIE_DOMAIN.
Migraciones: ninguna.
Seeds: un usuario de prueba creado dentro de los tests, no en el seed.
Tests: login feliz; password incorrecta; usuario inactivo; gimnasio suspendido; lockout tras N intentos; cookies con HttpOnly y SameSite correctos; refresh feliz; **replay de refresh rotado invalida la familia entera**; logout revoca; timing similar entre email inexistente y password mala.
Comandos de verificación:
  pnpm --filter @pulso/api test -- auth
  curl -i -XPOST localhost:3001/api/v1/auth/login -d '{"email":"...","password":"..."}' -H 'content-type: application/json'
Criterios de aceptación:
  - Las cookies llevan HttpOnly y SameSite=Lax; Secure en producción.
  - El refresh token está hasheado en base, no en claro.
  - El replay de un refresh rotado invalida la familia y deja AuditEvent.
  - La respuesta no permite distinguir email inexistente de password incorrecta.
  - Ningún endpoint devuelve el token en el cuerpo.
Resultado observable: El curl devuelve Set-Cookie con los flags correctos y no expone el token en el body.
Riesgos: Configurar mal SameSite y romper el login desde el frontend.
Rollback: git revert; no hay datos productivos.
Fuera de alcance: RBAC (T-2.4), pantalla de login (T-2.5).
Bloquea la siguiente tarea: Sí
```

```text
ID: T-2.3
Nombre: Contexto de tenant y extensión de Prisma que fuerza gymId
Etapa: 2
Objetivo: Todo acceso a un modelo tenant-scoped lleva gymId automáticamente, tomado de la sesión.
Motivación: ADR-008 y ADR-009. Es el control #1 del producto (riesgo R1).
Dependencias: T-2.2
Estado inicial esperado: Auth funcionando.
Archivos o carpetas afectados: apps/api/src/common/auth/tenant-context.ts, apps/api/src/infra/prisma/tenant-extension.ts, apps/api/src/common/auth/tenant-context.guard.ts
Cambios de base de datos: ninguno.
Cambios de backend: AsyncLocalStorage con el contexto; extensión de cliente; lista explícita de modelos tenant-scoped; prisma.unscoped() con auditoría.
Cambios de frontend: ninguno.
Cambios del worker: el worker fija el contexto por job.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: consultar un modelo tenant-scoped sin contexto **lanza excepción**; un findMany sin where devuelve sólo el tenant activo; un findUnique por id de otro tenant devuelve null; create sin gymId lo recibe inyectado; cada uso de unscoped() está en la allowlist.
Comandos de verificación:
  pnpm --filter @pulso/api test -- tenancy
Criterios de aceptación:
  - Sin contexto de tenant, la consulta falla ruidosamente. Nunca devuelve todo.
  - No es posible leer una fila de otro gymId por ninguna vía de Prisma.
  - Los modelos globales están declarados y quedan fuera del filtro.
  - Un uso nuevo de unscoped() no declarado rompe el CI.
Resultado observable: Los tests de tenancy pasan y el test negativo (sin contexto) falla como se espera.
Riesgos: Que la extensión no cubra alguna operación de Prisma y quede un agujero.
Rollback: git revert. **No se despliega nada sin esto.**
Fuera de alcance: RLS (Etapa 13).
Bloquea la siguiente tarea: Sí
```

```text
ID: T-2.4
Nombre: RBAC con permisos granulares y guard obligatorio
Etapa: 2
Objetivo: Catálogo de permisos, roles de sistema, PermissionsGuard, y un test que falla si algún endpoint no declara permiso.
Motivación: Requisito del brief. Un endpoint sin permiso declarado es un endpoint abierto.
Dependencias: T-2.3
Estado inicial esperado: Contexto de tenant funcionando.
Archivos o carpetas afectados: packages/contracts/permissions.ts, apps/api/src/modules/iam/**, apps/api/src/common/auth/permissions.guard.ts
Cambios de base de datos: ninguno.
Cambios de backend: guard, decoradores @RequiresPermission y @Public, seed de roles de sistema.
Cambios de frontend: ninguno.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: roles de sistema (OWNER, MANAGER, RECEPTIONIST, INSTRUCTOR).
Tests: matriz rol x endpoint; **test que recorre el registro de rutas y falla si algún handler no tiene @Public() ni @RequiresPermission()**; cambiar el rol se refleja en el request siguiente.
Comandos de verificación:
  pnpm --filter @pulso/api test -- permissions
Criterios de aceptación:
  - Un endpoint sin decorador rompe el CI.
  - RECEPTIONIST recibe 403 en endpoints de OWNER.
  - Los permisos vienen del catálogo tipado, no de strings sueltos.
Resultado observable: El test de cobertura de decoradores pasa con los endpoints actuales.
Riesgos: Definir un catálogo demasiado grueso y tener que romperlo después.
Rollback: git revert.
Fuera de alcance: Feature flags (T-2.8).
Bloquea la siguiente tarea: Sí
```

### M2.2 — Primer vertical completo y frontend

```text
ID: T-2.5
Nombre: Login y AppShell con selector de sede
Etapa: 2
Objetivo: El usuario se loguea desde el navegador, ve el shell con sidebar filtrado por permisos y puede cambiar de sede.
Motivación: Primer vertical de punta a punta: base de datos -> API -> contrato -> UI.
Dependencias: T-2.4, T-1.5
Estado inicial esperado: Auth y RBAC funcionando en la API.
Archivos o carpetas afectados: apps/web/app/(auth)/login/**, apps/web/app/(app)/layout.tsx, apps/web/lib/api/**, apps/web/lib/hooks/**, packages/ui (AppShell, Sidebar, Header, BranchSelector)
Cambios de base de datos: ninguno.
Cambios de backend: POST /auth/select-branch.
Cambios de frontend: login, shell, guards, cliente HTTP con manejo de 401, modal de sesión expirada.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna nueva.
Migraciones: ninguna.
Seeds: usa el seed de T-2.9 o usuarios creados a mano.
Tests: componente de login con sus 5 estados; navegación por teclado; el sidebar oculta ítems sin permiso; cambiar de sede llama al endpoint y limpia la caché de queries; **seleccionar una sede de otro gimnasio devuelve 404**.
Comandos de verificación:
  pnpm dev
  # login manual en localhost:3000
  pnpm --filter @pulso/web test
Criterios de aceptación:
  - Login exitoso deja las cookies y redirige al shell.
  - El sidebar sólo muestra lo que el rol permite.
  - Cambiar de sede limpia la caché de TanStack Query (verificado por test).
  - El modal de sesión expirada aparece ante 401 y conserva la ruta actual.
  - axe no reporta violaciones serias en la pantalla de login.
Resultado observable: Login funcional en el navegador con dos sedes seleccionables.
Riesgos: Olvidar limpiar la caché al cambiar de sede y mostrar datos de la sede anterior.
Rollback: git revert.
Fuera de alcance: Pantallas de negocio.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-2.6
Nombre: CRUD de sedes y de usuarios, vertical completo
Etapa: 2
Objetivo: Gestionar sedes y usuarios desde la UI, con permisos y auditoría.
Motivación: Sin esto no se puede dar de alta a un gimnasio real. Además ejercita el patrón vertical que se repetirá en todas las etapas.
Dependencias: T-2.5, T-2.7
Estado inicial esperado: Shell y auth funcionando.
Archivos o carpetas afectados: apps/api/src/modules/tenancy/**, apps/api/src/modules/iam/**, packages/contracts/{tenancy,iam}.ts, apps/web/app/(app)/settings/branches/**, apps/web/app/(app)/users/**
Cambios de base de datos: ninguno.
Cambios de backend: endpoints de §4 y §5 de API_CONTRACTS.
Cambios de frontend: dos listados con tabla, dos formularios, diálogos de confirmación.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno nuevo.
Tests: CRUD completo por endpoint; no se puede desactivar al último OWNER; la creación de usuario genera contraseña temporal y no la acepta del cliente; límite de sedes del plan; cross-tenant para los 9 endpoints nuevos; componentes con los 5 estados.
Comandos de verificación:
  pnpm test && pnpm test:e2e -- users
Criterios de aceptación:
  - Los 9 endpoints tienen contrato, permiso, test de cross-tenant y AuditEvent.
  - Crear una sede sobre el límite del plan devuelve 403 PLAN_LIMIT_REACHED.
  - La contraseña temporal se muestra una sola vez.
Resultado observable: Se puede crear una sede y un usuario desde la UI, y el nuevo usuario puede loguearse.
Riesgos: Permitir que el admin fije contraseñas ajenas.
Rollback: git revert.
Fuera de alcance: Roles personalizados con editor de permisos (post-MVP).
Bloquea la siguiente tarea: No
```

```text
ID: T-2.7
Nombre: Auditoría, idempotencia y outbox como primitivas transversales
Etapa: 2
Objetivo: @Audited(), @Idempotent() y el patrón outbox disponibles para todos los módulos siguientes.
Motivación: ADR-016 y ADR-017. Si no están antes de la caja, se agregan tarde y mal.
Dependencias: T-2.3
Estado inicial esperado: Tablas de 0004 creadas.
Archivos o carpetas afectados: apps/api/src/common/audit/**, apps/api/src/common/idempotency/**, apps/api/src/infra/outbox/**, apps/worker/src/jobs/outbox-dispatcher.ts
Cambios de base de datos: ninguno.
Cambios de backend: interceptor de auditoría, guard e interceptor de idempotencia, servicio de outbox.
Cambios de frontend: helper que genera y reusa Idempotency-Key por intento.
Cambios del worker: dispatcher de outbox.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: misma clave + mismo cuerpo -> una ejecución; misma clave + cuerpo distinto -> 409; dos requests concurrentes con la misma clave; el evento de outbox se publica exactamente una vez; el AuditEvent no contiene campos sensibles.
Comandos de verificación:
  pnpm --filter @pulso/api test -- idempotency audit outbox
Criterios de aceptación:
  - Los tres mecanismos funcionan y están documentados con un ejemplo de uso.
  - El AuditEvent enmascara before/after de campos sensibles.
  - Un evento de outbox no se publica dos veces aunque el worker se reinicie a mitad.
Resultado observable: Los tests pasan; un POST repetido con la misma clave devuelve la respuesta original.
Riesgos: Sobrecargar el interceptor de auditoría y degradar la latencia.
Rollback: git revert.
Fuera de alcance: Pantalla de consulta de auditoría (Etapa 13).
Bloquea la siguiente tarea: Sí
```

```text
ID: T-2.8
Nombre: Suite de cross-tenant generada y FeatureGuard
Etapa: 2
Objetivo: Un test que recorre automáticamente todas las rutas registradas y verifica aislamiento, más el guard de features por plan.
Motivación: Riesgo R1. Un test escrito a mano se olvida de los endpoints nuevos; uno generado, no.
Dependencias: T-2.6
Estado inicial esperado: Al menos dos módulos con endpoints con :id.
Archivos o carpetas afectados: apps/api/test/tenancy/**, apps/api/src/common/auth/feature.guard.ts, packages/contracts/features.ts
Cambios de base de datos: ninguno.
Cambios de backend: FeatureGuard con caché en Redis e invalidación por evento.
Cambios de frontend: FeatureGate.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: dos gimnasios con planes distintos, para el fixture de los tests.
Tests: los 7 archivos de TEST_STRATEGY §4.1; feature deshabilitada -> 403 FEATURE_NOT_ENABLED.
Comandos de verificación:
  pnpm --filter @pulso/api test -- tenancy
Criterios de aceptación:
  - La suite descubre las rutas sola; agregar un endpoint sin cubrirlo hace fallar el CI.
  - La respuesta de "no existe" y la de "es de otro tenant" son idénticas.
  - El FeatureGuard rechaza en el backend, no sólo oculta en el frontend.
Resultado observable: El test enumera N rutas y las prueba todas; agregar un endpoint sube el conteo.
Riesgos: Falsos positivos por endpoints que legítimamente no son tenant-scoped; se resuelve con una allowlist explícita y comentada.
Rollback: git revert. Esta suite no se desactiva nunca.
Fuera de alcance: RLS.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-2.9
Nombre: Seed reproducible base
Etapa: 2
Objetivo: pnpm db:seed crea gimnasio, dos sedes, roles y tres usuarios de forma determinística.
Motivación: Sin seed, cada desarrollador arma datos distintos y los bugs no se reproducen.
Dependencias: T-2.6
Estado inicial esperado: Base migrada y vacía.
Archivos o carpetas afectados: packages/db/prisma/seed.ts, packages/db/prisma/seed-data/**
Cambios de base de datos: sólo datos.
Cambios de backend: ninguno.
Cambios de frontend: ninguno.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: el descrito en §J (parte de tenancy e IAM; los socios llegan en T-3.10).
Tests: correr el seed dos veces produce el mismo resultado; el seed se niega a correr con NODE_ENV=production.
Comandos de verificación:
  pnpm db:reset && pnpm db:seed
  psql "$DATABASE_URL" -c "select email from users order by email;"
Criterios de aceptación:
  - Determinístico: mismos ids en cada corrida.
  - Se puede loguear con los tres usuarios documentados.
  - Falla explícitamente en producción.
  - Las credenciales demo están sólo en el README y son obviamente de desarrollo.
Resultado observable: Tras el seed, login exitoso con admin@demo.local.
Riesgos: Que alguien corra el seed contra una base con datos reales; lo previene el chequeo de NODE_ENV y una confirmación interactiva.
Rollback: pnpm db:reset.
Fuera de alcance: Datos de socios y caja.
Bloquea la siguiente tarea: No
```

---

## Etapa 3 — Socios, planes y membresías

```text
ID: T-3.1
Nombre: Migración de socios y cuenta corriente
Etapa: 3
Objetivo: Tablas Member, MemberDocument y LedgerEntry con todos sus constraints e índices.
Motivación: El constraint de documento duplicado por gimnasio es un requisito explícito y tiene que existir antes del primer alta.
Dependencias: T-2.9
Estado inicial esperado: Esquema de tenancy e IAM aplicado.
Archivos o carpetas afectados: packages/db/prisma/schema.prisma, migrations/0005_members
Cambios de base de datos: migración 0005.
Cambios de backend: tipos generados.
Cambios de frontend: ninguno.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: 0005_members.
Seeds: ninguno.
Tests: unique de documento por gimnasio; el mismo documento en otro gimnasio funciona; unique de tarjeta; índice trigram creado; LedgerEntry no acepta UPDATE.
Comandos de verificación:
  pnpm db:migrate && psql "$DATABASE_URL" -c "\d+ members"
Criterios de aceptación: Todos los constraints de DATA_MODEL §3 presentes y probados.
Resultado observable: Los tests de constraints pasan.
Riesgos: Olvidar el `where deletedAt is null` en el unique y bloquear el re-alta de un socio dado de baja.
Rollback: Migración inversa.
Fuera de alcance: Endpoints.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-3.2
Nombre: Backend de socios: CRUD, búsqueda y enmascaramiento de documento
Etapa: 3
Objetivo: Los endpoints de API_CONTRACTS §6 funcionando con permisos, auditoría e idempotencia.
Motivación: Núcleo del producto.
Dependencias: T-3.1
Estado inicial esperado: Tablas creadas.
Archivos o carpetas afectados: apps/api/src/modules/members/**, packages/contracts/members.ts, packages/config/document.ts
Cambios de base de datos: ninguno.
Cambios de backend: módulo completo, serializador de enmascaramiento, normalizador de documento y teléfono, contador de memberNumber con FOR UPDATE.
Cambios de frontend: ninguno.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: alta feliz; documento duplicado -> 409; mismo documento en otro gimnasio -> OK; memberNumber correlativo bajo 20 altas concurrentes; enmascaramiento sin permiso; búsqueda por nombre, apellido y documento; cross-tenant de los 10 endpoints.
Comandos de verificación:
  pnpm --filter @pulso/api test -- members
Criterios de aceptación:
  - El documento se devuelve enmascarado salvo con member:read_document (ADR-018).
  - memberNumber nunca se repite ni saltea bajo concurrencia.
  - El documento se normaliza antes de guardarse y de compararse.
Resultado observable: Los tests de members pasan, incluido el de concurrencia.
Riesgos: Usar MAX(memberNumber)+1 sin lock.
Rollback: git revert.
Fuera de alcance: Foto y documentos adjuntos (T-3.9).
Bloquea la siguiente tarea: Sí
```

```text
ID: T-3.3
Nombre: Frontend de listado de socios con filtros en la URL
Etapa: 3
Objetivo: /members con tabla, filtros, paginación y los cinco estados.
Motivación: Es la pantalla más consultada después de /access.
Dependencias: T-3.2, T-2.5
Estado inicial esperado: API de socios funcionando.
Archivos o carpetas afectados: apps/web/app/(app)/members/page.tsx, componentes de filtros y tabla, packages/ui (DataTable, Pagination, EmptyState, ErrorState)
Cambios de base de datos: ninguno.
Cambios de backend: ninguno.
Cambios de frontend: pantalla completa.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: usa T-3.10.
Tests: los 5 estados; empty distinto de sin-resultados; filtros en la URL sobreviven al recargar; documento enmascarado; keepPreviousData evita el parpadeo; axe sin violaciones serias.
Comandos de verificación:
  pnpm --filter @pulso/web test -- members
  pnpm test:e2e -- members-list
Criterios de aceptación:
  - Los filtros viven en la URL y el link es compartible.
  - "Sin socios" y "sin resultados para este filtro" son mensajes distintos.
  - La tabla no parpadea al paginar.
Resultado observable: Listado navegable con filtros en localhost:3000/members.
Riesgos: Búsqueda sin debounce saturando la API.
Rollback: git revert.
Fuera de alcance: Alta de socio.
Bloquea la siguiente tarea: No
```

```text
ID: T-3.4
Nombre: Catálogo: actividades y planes, vertical completo
Etapa: 3
Objetivo: CRUD de actividades y planes en API y UI, con ciclos de facturación y clases incluidas.
Motivación: No se puede asignar una membresía sin planes.
Dependencias: T-3.2
Estado inicial esperado: Módulo de socios funcionando.
Archivos o carpetas afectados: migrations/0006_catalog, apps/api/src/modules/catalog/**, packages/contracts/catalog.ts, apps/web/app/(app)/plans/**, apps/web/app/(app)/activities/**
Cambios de base de datos: migración 0006 (Activity, Plan, PlanActivity, PlanBranch).
Cambios de backend: módulo catalog.
Cambios de frontend: dos CRUD.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: 0006_catalog.
Seeds: 3 actividades y 4 planes.
Tests: CRUD; desactivar un plan con membresías activas -> 409 PLAN_IN_USE; durationDays derivado del ciclo; cross-tenant; componentes.
Comandos de verificación:
  pnpm test -- catalog
Criterios de aceptación:
  - Los 4 ciclos de facturación producen el durationDays correcto.
  - Un plan puede restringirse a sedes específicas.
  - El diálogo de desactivación informa cuántas membresías activas hay.
Resultado observable: Se crean planes desde la UI y aparecen al asignar membresía.
Riesgos: Confundir "actividad" (qué se practica) con "plan" (qué se vende).
Rollback: git revert + migración inversa.
Fuera de alcance: Precios por sede (post-MVP).
Bloquea la siguiente tarea: Sí
```

```text
ID: T-3.5
Nombre: Membresías con generación de deuda, transacción completa
Etapa: 3
Objetivo: POST /members/:id/memberships crea la membresía y el asiento de deuda en una transacción, con el constraint de solapamiento activo.
Motivación: Es la operación que conecta socio, plan y dinero. El modo "sin cobrar" tiene que existir desde el principio porque es como opera un gimnasio real.
Dependencias: T-3.4
Estado inicial esperado: Planes creados.
Archivos o carpetas afectados: migrations/0007_memberships, apps/api/src/modules/memberships/**, packages/contracts/memberships.ts
Cambios de base de datos: migración 0007 con el EXCLUDE USING gist.
Cambios de backend: módulo memberships; sólo el modo DEBT (el modo NOW llega con la caja en T-4.5).
Cambios de frontend: ninguno todavía.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: 0007_memberships.
Seeds: ninguno.
Tests: alta con deuda; solapamiento -> 409; endDate correcto por ciclo; classesRemaining inicializado; el saldo del socio cuadra con la suma del ledger; idempotencia; cross-tenant; **dos POST concurrentes crean una sola membresía**.
Comandos de verificación:
  pnpm --filter @pulso/api test -- memberships
Criterios de aceptación:
  - El constraint de solapamiento funciona a nivel de base, no sólo en el servicio.
  - Member.balance coincide siempre con la suma del ledger (test property-based con 100 operaciones aleatorias).
  - pricePaid congela el precio del plan.
Resultado observable: Asignar una membresía sin cobrar deja al socio con saldo negativo por el valor del plan.
Riesgos: Que balance y ledger diverjan; lo cubre el test de consistencia.
Rollback: git revert + migración inversa.
Fuera de alcance: Cobro (Etapa 4).
Bloquea la siguiente tarea: Sí
```

```text
ID: T-3.6
Nombre: Alta de socio por pasos en el frontend
Etapa: 3
Objetivo: /members/new con stepper de 3 pasos, borrador persistido y salida por deuda.
Motivación: Es el flujo de entrada de datos más largo del producto; perder la carga es inaceptable.
Dependencias: T-3.5, T-3.3
Estado inicial esperado: API de socios y membresías funcionando.
Archivos o carpetas afectados: apps/web/app/(app)/members/new/**, packages/ui (Stepper, DocumentInput, PhoneInput)
Cambios de base de datos: ninguno.
Cambios de backend: ninguno.
Cambios de frontend: pantalla completa.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: alta con deuda de punta a punta; documento duplicado inline; recargar conserva el borrador; el paso 3 fallido no pierde el socio ya creado; doble click no crea dos socios (idempotencia); navegación por teclado.
Comandos de verificación:
  pnpm test:e2e -- member-create
Criterios de aceptación:
  - Se puede completar un alta sin cobrar y el socio queda con deuda.
  - El borrador sobrevive a un refresh.
  - El error del paso 3 redirige a la ficha con aviso, sin perder datos.
Resultado observable: Un alta completa en el navegador termina en la ficha del socio.
Riesgos: Doble alta por doble click; lo previene la Idempotency-Key.
Rollback: git revert.
Fuera de alcance: Cobro en el paso 3 (T-4.9).
Bloquea la siguiente tarea: No
```

```text
ID: T-3.7
Nombre: Ficha de socio con cuenta corriente y listado de deudores
Etapa: 3
Objetivo: /members/[id] con tabs y /members/debt funcionando.
Dependencias: T-3.6
Estado inicial esperado: Alta funcionando.
Archivos o carpetas afectados: apps/web/app/(app)/members/[id]/**, apps/web/app/(app)/members/debt/**, apps/api (GET /members/:id/ledger, /members/debtors)
Cambios de base de datos: ninguno.
Cambios de backend: dos endpoints de lectura.
Cambios de frontend: ficha con tabs, listado de deudores.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: cada tab carga independientemente; acciones ocultas sin permiso; el saldo mostrado coincide con el ledger; el listado de deudores ordena por antigüedad; cross-tenant.
Comandos de verificación: pnpm test -- member-detail
Criterios de aceptación: La ficha muestra saldo, membresías y cuenta corriente coherentes entre sí.
Resultado observable: La ficha de un socio con deuda muestra el saldo negativo y sus asientos.
Riesgos: Calcular el saldo en el frontend en lugar de tomarlo del backend.
Rollback: git revert.
Fuera de alcance: Pago de deuda (Etapa 4).
Bloquea la siguiente tarea: No
```

```text
ID: T-3.8
Nombre: Edición y baja de socio con auditoría
Etapa: 3
Objetivo: PATCH y deactivate con before/after auditado y regla de deuda.
Dependencias: T-3.7
Estado inicial esperado: Ficha funcionando.
Archivos o carpetas afectados: apps/api/src/modules/members/**, apps/web/app/(app)/members/[id]/edit/**
Cambios de base de datos: ninguno.
Cambios de backend: PATCH, deactivate con `force` + motivo.
Cambios de frontend: formulario de edición, diálogo de baja.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: baja con deuda -> 409 salvo force con motivo; el AuditEvent registra before/after con documento enmascarado; el socio dado de baja no aparece en el listado por defecto; se puede volver a dar de alta el mismo documento.
Comandos de verificación: pnpm test -- member-update
Criterios de aceptación: La baja es soft, auditada y reversible.
Resultado observable: El AuditEvent de la edición muestra qué cambió.
Riesgos: Borrado físico por error.
Rollback: git revert.
Fuera de alcance: Reactivación masiva.
Bloquea la siguiente tarea: No
```

```text
ID: T-3.9
Nombre: Foto de socio y documentos con URLs prefirmadas
Etapa: 3
Objetivo: Subir foto y apto médico a S3 compatible mediante URL prefirmada emitida por la API.
Motivación: Son datos sensibles; no pueden quedar en objetos públicos.
Dependencias: T-3.8
Estado inicial esperado: Ficha funcionando.
Archivos o carpetas afectados: apps/api/src/infra/storage/**, apps/api/src/modules/members/documents.controller.ts, apps/web (PhotoCapture, uploader), docker-compose.yml (MinIO), scripts/dev-services.sh
Cambios de base de datos: usa MemberDocument de 0005.
Cambios de backend: emisión de URLs prefirmadas con validación de MIME y tamaño.
Cambios de frontend: captura por cámara o archivo, con recorte.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION.
Migraciones: ninguna.
Seeds: ninguno.
Tests: el MIME se valida por magic bytes, no por extensión; un archivo sobre el límite se rechaza; la URL de lectura vence; un usuario de otro gimnasio no puede leer la foto; el nombre de archivo del cliente no se usa en la key.
Comandos de verificación:
  pnpm dev:services   # incluye MinIO
  pnpm test -- storage
Criterios de aceptación:
  - Ningún objeto es público.
  - Renombrar un .exe a .jpg no engaña a la validación.
  - Las keys incluyen gym/{gymId}/ y un identificador generado.
Resultado observable: Se sube una foto desde la ficha y se ve con URL prefirmada.
Riesgos: Dejar el bucket público en producción.
Rollback: git revert.
Fuera de alcance: Antivirus de archivos subidos (post-MVP, se registra como pendiente).
Bloquea la siguiente tarea: No
```

```text
ID: T-3.10
Nombre: Ampliar el seed con socios, membresías y deuda
Etapa: 3
Objetivo: 40 socios en los cuatro estados descritos en §J, con ledger coherente.
Dependencias: T-3.5
Estado inicial esperado: Seed base funcionando.
Archivos o carpetas afectados: packages/db/prisma/seed.ts, seed-data/members.ts
Cambios de base de datos: sólo datos.
Cambios de backend/frontend/worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: 25 activos, 8 vencidos, 5 con deuda, 2 inactivos.
Tests: tras el seed, la suma del ledger de cada socio coincide con su balance; los documentos están en el rango reservado 90.000.000-90.000.999.
Comandos de verificación:
  pnpm db:reset && pnpm db:seed
  psql "$DATABASE_URL" -c "select status, count(*) from members group by status;"
Criterios de aceptación: Determinístico; datos coherentes; ningún documento de una persona real.
Resultado observable: El listado de socios muestra 40 registros con estados variados.
Riesgos: Datos incoherentes que enmascaren bugs.
Rollback: pnpm db:reset.
Fuera de alcance: Datos de caja (T-4.10).
Bloquea la siguiente tarea: No
```

---

## Etapa 4 — Caja y pagos

```text
ID: T-4.1
Nombre: Migración de caja con los constraints críticos
Etapa: 4
Objetivo: Tablas de caja con los dos uniques parciales que impiden sesiones incompatibles y el unique de reversa.
Motivación: Riesgo R2. Estos constraints son la única garantía real; la validación de servicio es sólo para dar buenos mensajes.
Dependencias: T-3.5
Estado inicial esperado: Esquema de socios aplicado.
Archivos o carpetas afectados: packages/db/prisma/schema.prisma, migrations/0008_cash
Cambios de base de datos: migración 0008.
Cambios de backend: tipos generados.
Cambios de frontend/worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: 0008_cash.
Seeds: ninguno.
Tests: unique(cashRegisterId) where status='OPEN'; unique(gymId, openedByUserId) where status='OPEN'; unique(reversalOfId); check(amount > 0); CashMovement sin UPDATE salvo isReversed.
Comandos de verificación:
  pnpm db:migrate && psql "$DATABASE_URL" -c "\d+ cash_sessions"
Criterios de aceptación: Los 5 constraints existen y están probados a nivel de base.
Resultado observable: Insertar dos sesiones abiertas de la misma caja falla en SQL.
Riesgos: Definir los uniques sin la cláusula parcial y bloquear sesiones históricas.
Rollback: Migración inversa.
Fuera de alcance: Endpoints.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-4.2
Nombre: Métodos de pago, conceptos y cajas
Etapa: 4
Objetivo: CRUD de las tres entidades de configuración de caja, en API y UI.
Dependencias: T-4.1
Estado inicial esperado: Migración aplicada.
Archivos o carpetas afectados: apps/api/src/modules/cash/config/**, packages/contracts/cash.ts, apps/web/app/(app)/cash/{payment-methods,concepts}/**, settings
Cambios de base de datos: ninguno.
Cambios de backend: tres CRUD.
Cambios de frontend: tres pantallas simples.
Cambios del worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: 5 métodos y 6 conceptos.
Tests: CRUD; no se puede borrar un método con movimientos (se desactiva); countsAsCash afecta el arqueo; cross-tenant.
Comandos de verificación: pnpm test -- cash-config
Criterios de aceptación: Se pueden configurar métodos y conceptos antes de operar.
Resultado observable: Los selectores de método de pago se llenan desde la configuración.
Riesgos: Borrado físico de un método usado históricamente.
Rollback: git revert.
Fuera de alcance: Operación de caja.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-4.3
Nombre: Apertura y cierre de sesión de caja con arqueo
Etapa: 4
Objetivo: Abrir y cerrar caja, con cálculo de esperado vs. declarado por método y bloqueo por operaciones pendientes.
Motivación: Requisito explícito del brief: no se puede cerrar con operaciones pendientes.
Dependencias: T-4.2
Estado inicial esperado: Configuración de caja cargada.
Archivos o carpetas afectados: apps/api/src/modules/cash/sessions/**, packages/contracts/cash.ts
Cambios de base de datos: ninguno.
Cambios de backend: endpoints de apertura, cierre y consulta de sesión actual.
Cambios de frontend: ninguno todavía.
Cambios del worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: apertura; segunda apertura de la misma caja -> 409; mismo usuario en otra caja -> 409; **dos aperturas concurrentes, una gana**; cierre con arqueo; diferencia por método; **cierre con pendientes -> 409**; **dos cierres concurrentes, uno gana**; cerrar sesión ajena sin permiso -> 403.
Comandos de verificación: pnpm --filter @pulso/api test -- cash-session
Criterios de aceptación:
  - Los 3 tests de concurrencia pasan de forma estable (10 corridas seguidas sin flakiness).
  - El esperado lo calcula el backend, no el cliente.
Resultado observable: Los tests de sesión de caja pasan, incluidos los de concurrencia.
Riesgos: Tests de concurrencia flaky; se arregla el locking, **no se agrega retry**.
Rollback: git revert.
Fuera de alcance: Aprobaciones (T-4.6).
Bloquea la siguiente tarea: Sí
```

```text
ID: T-4.4
Nombre: Movimientos de ingreso y egreso
Etapa: 4
Objetivo: POST /cash/movements con validación de sesión abierta, monto positivo y umbral de aprobación.
Dependencias: T-4.3
Estado inicial esperado: Sesiones funcionando.
Archivos o carpetas afectados: apps/api/src/modules/cash/movements/**
Cambios de base de datos: ninguno.
Cambios de backend: endpoint con idempotencia y auditoría.
Cambios de frontend/worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: ingreso; egreso; monto <= 0 -> 422; sin caja abierta -> 409; egreso sobre umbral genera solicitud y **no** genera movimiento; idempotencia; los importes viajan como string; 0.1 + 0.2 = 0.30 exacto.
Comandos de verificación: pnpm test -- cash-movements
Criterios de aceptación: Ningún importe es number en la respuesta JSON (test explícito que inspecciona el tipo).
Resultado observable: Un ingreso queda registrado y aparece en el resumen de la sesión.
Riesgos: Serializar Decimal como number en algún borde no cubierto.
Rollback: git revert.
Fuera de alcance: Reversas.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-4.5
Nombre: Cobro de membresía y pago de deuda, transacción completa
Etapa: 4
Objetivo: Cobrar una cuota impacta membresía, caja, cuenta corriente y saldo en una sola transacción idempotente.
Motivación: Es la operación de dinero más importante del producto.
Dependencias: T-4.4
Estado inicial esperado: Movimientos funcionando.
Archivos o carpetas afectados: apps/api/src/modules/payments/**, apps/api/src/modules/memberships/** (modo NOW)
Cambios de base de datos: ninguno.
Cambios de backend: transacción SERIALIZABLE con los 8 pasos de DATA_MODEL §5; endpoints de pay-debt y refund.
Cambios de frontend/worker/agente: ninguno todavía.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: cobro completo verifica los 4 efectos; **rollback: forzar fallo en el paso 4 y comprobar que no queda nada**; sin caja abierta -> 409; pago parcial, total y en exceso; consistencia balance vs. ledger tras 100 operaciones aleatorias; idempotencia; cross-tenant.
Comandos de verificación: pnpm --filter @pulso/api test -- payments
Criterios de aceptación:
  - El test de rollback pasa: un fallo parcial no deja datos.
  - El saldo del socio siempre coincide con la suma de su ledger.
Resultado observable: Cobrar una cuota deja al socio en saldo cero y el movimiento en la caja.
Riesgos: Una transacción incompleta que deje al socio cobrado sin membresía, o al revés.
Rollback: git revert.
Fuera de alcance: Recibo por WhatsApp (Etapa 6); acá sólo se emite el OutboxEvent.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-4.6
Nombre: Reversas y flujo de aprobaciones
Etapa: 4
Objetivo: Revertir un movimiento crea uno nuevo; las operaciones sensibles requieren aprobación.
Motivación: ADR-010. La corrección por reversa es lo que hace auditable a la caja.
Dependencias: T-4.5
Estado inicial esperado: Cobros funcionando.
Archivos o carpetas afectados: apps/api/src/modules/cash/reversal/**, apps/api/src/modules/cash/operations/**
Cambios de base de datos: ninguno.
Cambios de backend: reversa, solicitudes, aprobación y rechazo.
Cambios de frontend/worker/agente: ninguno todavía.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: reversa crea movimiento nuevo y no edita el original; **doble reversa -> 409**; **dos reversas concurrentes, una gana**; reversa de pago revierte el saldo del socio; reversa de sesión cerrada exige aprobación; aprobar y rechazar; el rechazo exige motivo; auditoría de las cuatro acciones.
Comandos de verificación: pnpm test -- cash-reversal
Criterios de aceptación:
  - El movimiento original conserva su amount, type y createdAt intactos.
  - No hay forma de revertir dos veces.
Resultado observable: Tras una reversa hay dos movimientos y el saldo neto es cero.
Riesgos: Implementar la reversa como UPDATE del original.
Rollback: git revert.
Fuera de alcance: Reversa de ventas POS (Etapa 10).
Bloquea la siguiente tarea: Sí
```

```text
ID: T-4.7
Nombre: Libro diario
Etapa: 4
Objetivo: GET /cash/daybook con timeline unificado agrupado por día de la sede.
Dependencias: T-4.6
Estado inicial esperado: Movimientos y reversas funcionando.
Archivos o carpetas afectados: apps/api/src/modules/cash/daybook/**, packages/config/time.ts
Cambios de base de datos: ninguno.
Cambios de backend: consulta con conversión de zona horaria.
Cambios de frontend/worker/agente: ninguno todavía.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: el agrupamiento usa la zona de la sede, no la del servidor; un movimiento a las 23:30 de Buenos Aires cae en ese día y no en el siguiente por UTC; los revertidos aparecen marcados, no ocultos; filtros por rango, sede, método y tipo.
Comandos de verificación: pnpm test -- daybook
Criterios de aceptación: El test de borde de zona horaria pasa (ADR-021).
Resultado observable: El libro diario muestra aperturas, movimientos y cierres en orden cronológico correcto.
Riesgos: Agrupar por UTC y desfasar el corte del día.
Rollback: git revert.
Fuera de alcance: Exportación (Etapa 6).
Bloquea la siguiente tarea: No
```

```text
ID: T-4.8
Nombre: Frontend de caja completo
Etapa: 4
Objetivo: /cash y /cash/daybook operativos, con los estados sin-sesión y con-sesión.
Dependencias: T-4.7
Estado inicial esperado: API de caja completa.
Archivos o carpetas afectados: apps/web/app/(app)/cash/**, packages/ui (MoneyInput, MoneyDisplay, ConfirmDialog)
Cambios de base de datos: ninguno.
Cambios de backend: ninguno.
Cambios de frontend: pantallas completas.
Cambios del worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: usa T-4.10.
Tests: sin sesión abierta se muestra la pantalla de apertura y **no** la lista de movimientos; el modal de cierre calcula la diferencia en vivo; el botón de cierre se deshabilita con pendientes y muestra la lista; la reversa exige motivo de 10 caracteres; MoneyInput nunca convierte a number; axe sin violaciones serias.
Comandos de verificación:
  pnpm test:e2e -- cash
Criterios de aceptación:
  - El E2E completo de caja (abrir, ingreso, egreso, reversa, cerrar) pasa.
  - El resumen viene del backend; el frontend no lo recalcula.
Resultado observable: Un turno completo de caja operable en el navegador.
Riesgos: Calcular totales en el cliente y tener dos verdades.
Rollback: git revert.
Fuera de alcance: Facturación.
Bloquea la siguiente tarea: No
```

```text
ID: T-4.9
Nombre: Cobro desde el alta de socio y desde la ficha
Etapa: 4
Objetivo: Cerrar el circuito: el paso 3 del alta cobra, y la ficha permite cobrar la deuda.
Dependencias: T-4.8, T-3.6
Estado inicial esperado: Caja y alta funcionando por separado.
Archivos o carpetas afectados: apps/web/app/(app)/members/new/step-payment.tsx, apps/web/app/(app)/members/[id]/actions/**
Cambios de base de datos: ninguno.
Cambios de backend: ninguno.
Cambios de frontend: integración de los dos flujos.
Cambios del worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: E2E de alta con cobro; E2E de alta con deuda y cobro posterior; sin caja abierta el paso 3 explica qué hacer y ofrece abrirla.
Comandos de verificación: pnpm test:e2e -- member-payment
Criterios de aceptación: Los flujos E2E 2 y 3 del MVP pasan.
Resultado observable: Un socio nuevo puede quedar cobrado o endeudado, y la deuda se cobra después.
Riesgos: Doble cobro por doble click en el paso 3.
Rollback: git revert.
Fuera de alcance: Recibo por WhatsApp.
Bloquea la siguiente tarea: No
```

```text
ID: T-4.10
Nombre: Ampliar el seed con datos de caja
Etapa: 4
Objetivo: Una sesión cerrada del día anterior con ~15 movimientos y una abierta en Sede Centro.
Dependencias: T-4.5
Estado inicial esperado: Seed de socios funcionando.
Archivos o carpetas afectados: packages/db/prisma/seed.ts, seed-data/cash.ts
Cambios de base de datos: sólo datos.
Cambios de backend/frontend/worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: los descritos.
Tests: la sesión cerrada cuadra (esperado = suma de movimientos); la abierta permite operar de inmediato.
Comandos de verificación: pnpm db:reset && pnpm db:seed && pnpm test -- seed
Criterios de aceptación: Determinístico y coherente.
Resultado observable: Al entrar a /cash hay una sesión abierta lista para usar.
Riesgos: Datos de caja incoherentes que oculten bugs de arqueo.
Rollback: pnpm db:reset.
Fuera de alcance: Ventas POS.
Bloquea la siguiente tarea: No
```

---

## Etapa 5 — Acceso manual y asistencias

```text
ID: T-5.1
Nombre: Migración de acceso y asistencia
Etapa: 5
Objetivo: Tablas AccessAttempt y Attendance con el constraint anti doble-registro.
Dependencias: T-4.5
Estado inicial esperado: Esquema de caja aplicado.
Archivos o carpetas afectados: packages/db/prisma/schema.prisma, migrations/0009_access
Cambios de base de datos: migración 0009.
Cambios de backend: tipos generados.
Cambios de frontend/worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: 0009_access.
Seeds: ninguno.
Tests: unique(gymId, memberId, branchId, occurredOn); occurredOn se genera en la zona de la sede; AccessAttempt no acepta UPDATE.
Comandos de verificación: pnpm db:migrate && psql "$DATABASE_URL" -c "\d+ attendances"
Criterios de aceptación: El constraint existe y usa el día de negocio, no el día UTC.
Resultado observable: Insertar dos asistencias del mismo socio, sede y día falla.
Riesgos: Calcular occurredOn en UTC.
Rollback: Migración inversa.
Fuera de alcance: Endpoints.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-5.2
Nombre: POST /access/check con la cadena de autorización completa
Etapa: 5
Objetivo: Los 9 pasos de decisión de API_CONTRACTS §9, con registro de todo intento.
Motivación: Es el endpoint más usado del producto y el que decide si alguien entra.
Dependencias: T-5.1
Estado inicial esperado: Migración aplicada.
Archivos o carpetas afectados: apps/api/src/modules/access/**, packages/contracts/access.ts
Cambios de base de datos: ninguno.
Cambios de backend: módulo access con la cadena de autorización como función pura testeable.
Cambios de frontend/worker/agente: ninguno todavía.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: **un test por reasonCode** (los 10); doble check en el mismo día no duplica asistencia ni descuenta dos clases; **dos checks concurrentes descuentan una sola clase**; el intento denegado igual se registra; socio de otro gimnasio -> NOT_FOUND; idempotencia por minuto.
Comandos de verificación: pnpm --filter @pulso/api test -- access
Criterios de aceptación:
  - Cada reasonCode tiene su test y su mensaje.
  - Un acceso denegado devuelve 200 con decision DENIED, no un error HTTP.
  - AccessAttempt se registra siempre.
Resultado observable: Los 10 tests de decisión pasan.
Riesgos: Descontar clases de más bajo concurrencia.
Rollback: git revert.
Fuera de alcance: Huella (Etapa 8).
Bloquea la siguiente tarea: Sí
```

```text
ID: T-5.3
Nombre: Gateway Socket.IO y evento access.resolved
Etapa: 5
Objetivo: El resultado del acceso llega en tiempo real a la pantalla de recepción.
Motivación: ADR-011. Prepara además el canal que usará la biometría.
Dependencias: T-5.2
Estado inicial esperado: /access/check funcionando.
Archivos o carpetas afectados: apps/api/src/modules/realtime/**, apps/web/lib/realtime/**
Cambios de base de datos: ninguno.
Cambios de backend: gateway con namespace por gimnasio, rooms por sede, handshake autenticado con la cookie, adapter de Redis.
Cambios de frontend: hook de suscripción.
Cambios del worker/agente: ninguno.
Variables de entorno: ninguna nueva.
Migraciones: ninguna.
Seeds: ninguno.
Tests: un cliente sin sesión no puede conectarse; un cliente del gimnasio A no recibe eventos de B; un cliente de la sede 1 no recibe eventos de la sede 2; el evento llega tras un check.
Comandos de verificación: pnpm test -- realtime
Criterios de aceptación: El aislamiento por gimnasio y sede está probado, no asumido.
Resultado observable: Un check hecho desde curl aparece en la pantalla abierta en el navegador.
Riesgos: Namespaces mal aislados filtrando eventos entre tenants.
Rollback: git revert.
Fuera de alcance: Notificaciones generales.
Bloquea la siguiente tarea: No
```

```text
ID: T-5.4
Nombre: Pantalla /access
Etapa: 5
Objetivo: La pantalla de recepción con foco permanente y los 6 estados de resultado.
Dependencias: T-5.3
Estado inicial esperado: API y realtime funcionando.
Archivos o carpetas afectados: apps/web/app/(app)/access/**, packages/ui (StatusBadge)
Cambios de base de datos: ninguno.
Cambios de backend: ninguno.
Cambios de frontend: pantalla completa.
Cambios del worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: cada reasonCode renderiza su estado; el foco vuelve al input tras cada consulta; Enter dispara; el evento WS pinta el resultado; sin permiso la pantalla no es accesible; **axe con contraste AAA en el banner de resultado**; el resultado se anuncia por aria-live.
Comandos de verificación: pnpm test:e2e -- access
Criterios de aceptación:
  - Un lector de tarjetas que tipea y manda Enter funciona sin tocar nada.
  - El estado nunca se comunica sólo por color.
  - El flujo E2E 5 del MVP pasa.
Resultado observable: Ingresar un documento en la pantalla devuelve permitido o denegado con el detalle del socio.
Riesgos: Perder el foco del input y frenar la fila de recepción.
Rollback: git revert.
Fuera de alcance: Huella.
Bloquea la siguiente tarea: No
```

```text
ID: T-5.5
Nombre: Historial de asistencias y job de vencimiento de membresías
Etapa: 5
Objetivo: Consultar asistencias e intentos, y que las membresías vencidas cambien de estado solas.
Dependencias: T-5.4
Estado inicial esperado: Acceso funcionando.
Archivos o carpetas afectados: apps/api/src/modules/access/history/**, apps/worker/src/jobs/membership-expiration.ts, apps/web/app/(app)/members/attendance/**
Cambios de base de datos: ninguno.
Cambios de backend: endpoints de historial.
Cambios de frontend: pantalla de asistencias.
Cambios del worker: job diario por sede, en la zona de cada sede.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ~200 asistencias de los últimos 30 días.
Tests: el job usa la zona de la sede; una membresía que vence hoy a las 23:59 en Buenos Aires no se marca vencida a las 21:00 UTC; el job es idempotente; el historial filtra por sede y rango.
Comandos de verificación: pnpm test -- membership-expiration
Criterios de aceptación: El test de borde de zona horaria pasa.
Resultado observable: Tras correr el job, las membresías vencidas figuran como EXPIRED.
Riesgos: Vencer membresías un día antes por UTC.
Rollback: git revert; el job es reversible por recálculo.
Fuera de alcance: Estadísticas (Etapa 6).
Bloquea la siguiente tarea: No
```

---

## Etapa 6 — WhatsApp, estadísticas y cierre del MVP

```text
ID: T-6.1
Nombre: Migración de mensajería y abstracción de proveedor
Etapa: 6
Objetivo: Tablas de mensajería y la interfaz WhatsAppProvider con una implementación mock.
Motivación: La abstracción desde el inicio permite desarrollar y testear sin proveedor real y cambiar de proveedor sin tocar el dominio.
Dependencias: T-5.5
Estado inicial esperado: Esquema de acceso aplicado.
Archivos o carpetas afectados: migrations/0010_messaging, apps/api/src/modules/messaging/**, apps/api/src/modules/messaging/providers/{provider.interface,mock.provider}.ts
Cambios de base de datos: migración 0010.
Cambios de backend: módulo de mensajería, configuración cifrada.
Cambios de frontend/agente: ninguno.
Cambios del worker: ninguno todavía.
Variables de entorno: WHATSAPP_PROVIDER, MASTER_KEK.
Migraciones: 0010_messaging.
Seeds: plantillas por defecto de recibo y recordatorio de deuda.
Tests: unique(gymId, dedupeKey); unique(provider, externalId); las credenciales se guardan cifradas y no se devuelven por API; el provider mock registra los envíos.
Comandos de verificación: pnpm db:migrate && pnpm test -- messaging-schema
Criterios de aceptación: Los constraints anti-duplicación existen; las credenciales nunca vuelven en una respuesta.
Resultado observable: \d+ message_jobs muestra el unique de dedupeKey.
Riesgos: Guardar credenciales del cliente sin cifrar.
Rollback: Migración inversa.
Fuera de alcance: Proveedor real.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-6.2
Nombre: Cola de mensajería y despachador de outbox en el worker
Etapa: 6
Objetivo: Los eventos de dominio se convierten en mensajes encolados, con reintentos y DLQ.
Dependencias: T-6.1
Estado inicial esperado: Outbox funcionando desde T-2.7.
Archivos o carpetas afectados: apps/worker/src/queues/messaging.ts, apps/worker/src/jobs/{send-message,outbox-dispatcher}.ts
Cambios de base de datos: ninguno.
Cambios de backend: emisión de OutboxEvent en cobro y en generación de deuda.
Cambios de frontend/agente: ninguno.
Cambios del worker: cola con backoff exponencial, 5 intentos y DLQ.
Variables de entorno: ninguna nueva.
Migraciones: ninguna.
Seeds: ninguno.
Tests: el dedupeKey impide dos jobs para el mismo pago; el reintento respeta el backoff; tras 5 fallos va a DLQ y el job queda FAILED; un evento de outbox se despacha exactamente una vez aunque el worker se reinicie a mitad.
Comandos de verificación: pnpm test -- messaging-queue
Criterios de aceptación: Cobrar dos veces con la misma idempotencia genera un solo mensaje.
Resultado observable: Tras un cobro, aparece un MessageJob en estado QUEUED y luego SENT con el provider mock.
Riesgos: Perder mensajes si Redis cae entre el commit y el encolado; lo resuelve el outbox.
Rollback: git revert.
Fuera de alcance: Broadcast.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-6.3
Nombre: Recibo de pago y recordatorio de deuda
Etapa: 6
Objetivo: Los dos mensajes automáticos del MVP, con plantillas editables.
Dependencias: T-6.2
Estado inicial esperado: Cola funcionando.
Archivos o carpetas afectados: apps/api/src/modules/messaging/templates/**, apps/worker/src/jobs/debt-reminder.ts, apps/web/app/(app)/settings/messaging/**
Cambios de base de datos: ninguno.
Cambios de backend: renderizado de plantillas con variables.
Cambios de frontend: editor de plantillas con vista previa.
Cambios del worker: job diario de recordatorio de deuda.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: plantillas por defecto.
Tests: el renderizado sustituye las variables; una variable inexistente no rompe el envío; el recordatorio no se manda dos veces el mismo día al mismo socio; el teléfono se normaliza a E.164; un socio sin teléfono no genera job fallido, genera job cancelado con motivo.
Comandos de verificación: pnpm test -- templates
Criterios de aceptación: El flujo E2E 6 del MVP pasa (cobrar -> recibo encolado y visible).
Resultado observable: Tras cobrar una cuota, el historial de mensajes muestra el recibo.
Riesgos: Enviar mensajes duplicados a socios reales en una prueba.
Rollback: git revert; los jobs pendientes se cancelan.
Fuera de alcance: Otros tipos de mensaje.
Bloquea la siguiente tarea: No
```

```text
ID: T-6.4
Nombre: Historial de mensajes, reintento y broadcast con confirmación
Etapa: 6
Objetivo: /messaging y /messaging/broadcast operativos.
Dependencias: T-6.3
Estado inicial esperado: Mensajes automáticos funcionando.
Archivos o carpetas afectados: apps/api/src/modules/messaging/broadcast/**, apps/web/app/(app)/messaging/**
Cambios de base de datos: ninguno.
Cambios de backend: endpoints de historial, retry y broadcast con preview.
Cambios de frontend: dos pantallas.
Cambios del worker: procesamiento del broadcast en lotes.
Cambios del agente local: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: el broadcast sin confirm devuelve 202 con estimatedRecipients y **no** envía; con confirm encola; rate limit de 3 por hora; requiere permiso message:broadcast; queda auditado con el conteo.
Comandos de verificación: pnpm test:e2e -- broadcast
Criterios de aceptación:
  - Es imposible disparar un broadcast sin ver antes cuántos destinatarios tiene.
  - La confirmación exige escribir la cantidad.
Resultado observable: El preview muestra el conteo y el texto renderizado con un socio de ejemplo.
Riesgos: Enviar un broadcast por accidente. Es una acción difícil de revertir y la UI la trata como tal.
Rollback: git revert; un broadcast en curso se puede cancelar (los jobs QUEUED pasan a CANCELLED).
Fuera de alcance: Segmentación avanzada.
Bloquea la siguiente tarea: No
```

```text
ID: T-6.5
Nombre: Reportes y dashboard
Etapa: 6
Objetivo: Los 4 endpoints de reportes y las pantallas de dashboard y estadísticas.
Dependencias: T-6.4
Estado inicial esperado: Datos suficientes en el seed.
Archivos o carpetas afectados: apps/api/src/modules/reporting/**, apps/web/app/(app)/{dashboard,reports}/**
Cambios de base de datos: índices adicionales si el plan de consulta lo pide (migración aparte, con CONCURRENTLY).
Cambios de backend: consultas agregadas con $queryRaw tipado.
Cambios de frontend: dashboard con 6 KPIs y reportes con 3 tabs.
Cambios del worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: 0011_reporting_indexes si hace falta.
Seeds: ninguno nuevo.
Tests: los rangos usan la zona de la sede; **el ranking devuelve el documento enmascarado**; sin permiso stats:read no se accede; con 5.000 socios y 100.000 asistencias el p95 se mantiene bajo 1 s (test de carga con k6); cada gráfico tiene tabla accesible equivalente.
Comandos de verificación: pnpm test -- reporting && k6 run scripts/load/dashboard.js
Criterios de aceptación:
  - El documento nunca se devuelve completo en un ranking.
  - Las consultas usan índices (verificado con EXPLAIN en el test).
Resultado observable: El dashboard muestra KPIs reales del seed.
Riesgos: Consultas sin índice que degraden con volumen.
Rollback: git revert.
Fuera de alcance: Exportación a Excel (se hace en T-6.6 si entra, si no pasa a Etapa 13).
Bloquea la siguiente tarea: No
```

```text
ID: T-6.6
Nombre: Endurecimiento de seguridad y cierre del MVP
Etapa: 6
Objetivo: Headers, rate limits, redacción de logs, los 6 E2E verdes y el checklist de go-live cumplido.
Motivación: El MVP se va a vender. Lo que no esté acá se convierte en deuda con clientes reales adentro.
Dependencias: T-6.5
Estado inicial esperado: Todas las funcionalidades del MVP terminadas.
Archivos o carpetas afectados: apps/api/src/main.ts (helmet, CSP), apps/api/src/common/throttler/**, apps/web/next.config.ts, .github/workflows/ci.yml (axe, k6), docs/ops/**
Cambios de base de datos: ninguno.
Cambios de backend: CSP y headers de SECURITY_MODEL §6; rate limits de API_CONTRACTS §1.10; serializador de logs con allowlist.
Cambios de frontend: CSP con nonce.
Cambios del worker: ninguno.
Cambios del agente local: ninguno.
Variables de entorno: RATE_LIMIT_ENABLED, SENTRY_DSN.
Migraciones: ninguna.
Seeds: ninguno.
Tests: cada header de seguridad está presente con su valor; el rate limit devuelve 429 con Retry-After; **un objeto con todos los campos prohibidos no deja rastro en los logs**; los 6 E2E; axe sobre las 4 pantallas críticas.
Comandos de verificación:
  pnpm test && pnpm test:e2e && pnpm lint
  curl -sI https://staging.../api/v1/health/live | grep -i content-security-policy
Criterios de aceptación:
  - Los 6 flujos E2E del MVP pasan.
  - Los headers de seguridad están en la respuesta real, no sólo en el código.
  - El test de redacción de logs pasa.
  - El checklist de go-live de DEPLOYMENT_PLAN §14 está completo, incluido **un restore drill ejecutado**.
Resultado observable: MVP desplegado en staging, con los 6 flujos verificados manualmente.
Riesgos: Una CSP demasiado estricta que rompa la aplicación en producción; se valida primero en staging.
Rollback: Los headers se pueden relajar por variable de entorno en una emergencia, dejando registro.
Fuera de alcance: Biometría, reservas, POS.
Bloquea la siguiente tarea: Sí — es la puerta del MVP vendible.
```

---

## Etapa 7 — POC del U.are.U 4500

```text
ID: T-7.1
Nombre: Preparar el entorno de la POC
Etapa: 7
Objetivo: Hardware, Windows, .NET y drivers listos, con consentimiento escrito para las pruebas.
Motivación: Hechos comprobados: la máquina de desarrollo es macOS, no tiene .NET, no tiene el lector. Sin esto la POC no arranca.
Dependencias: T-6.6 (MVP terminado)
Estado inicial esperado: Sin hardware, sin Windows, sin .NET.
Archivos o carpetas afectados: poc-uareu4500/ (repo o carpeta aparte, fuera del monorepo), docs/biometrics/CONSENT.md
Cambios de base de datos: ninguno.
Cambios de backend/frontend/worker: ninguno.
Cambios del agente local: ninguno todavía.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: ninguno.
Comandos de verificación:
  # en la máquina Windows
  dotnet --version
  # Administrador de dispositivos muestra el lector sin advertencia
Criterios de aceptación:
  - Lector U.are.U 4500 adquirido y en mano.
  - Windows 10 x64 **y** Windows 11 x64 disponibles (VM o PC).
  - .NET 8 SDK instalado.
  - Drivers WBF y non-WBF descargados de la página oficial de HID.
  - Texto de consentimiento escrito para las 20-50 personas de POC-12.
Resultado observable: `dotnet --version` responde en Windows y el lector aparece en el Administrador de dispositivos.
Riesgos: Demora de compra del lector; se puede paralelizar con T-7.2.
Rollback: No aplica.
Fuera de alcance: Escribir código.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-7.2
Nombre: Cerrar la licencia del SDK (V1 y V2)
Etapa: 7
Objetivo: Respuesta escrita de HID o su distribuidor sobre licenciamiento comercial y derecho de redistribución del runtime.
Motivación: Riesgo R4. Es el punto de mayor incertidumbre económica y legal de toda la biometría.
Dependencias: ninguna (se puede hacer en paralelo con T-7.1).
Estado inicial esperado: V1 y V2 marcadas [PENDIENTE].
Archivos o carpetas afectados: docs/biometrics/UAREU_4500_RESEARCH.md §3 y §6.
Cambios de base de datos/backend/frontend/worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: ninguno.
Comandos de verificación: ninguno (gestión comercial).
Criterios de aceptación:
  - Respuesta **por escrito** sobre: si se puede licenciar para SaaS comercial multi-cliente en Argentina, costo por instalación o por sitio, y si el runtime se puede redistribuir en nuestro instalador.
  - Si la respuesta es negativa o inviable, se escala a la Pregunta bloqueante B5 y el Stack B pasa a ser el camino obligatorio.
Resultado observable: V1 y V2 pasan de [PENDIENTE] a [VERIFICADO] con la fuente citada.
Riesgos: Que HID no responda en tiempo razonable; mitigación: avanzar POC-03B para saber si el Stack B es viable.
Rollback: No aplica.
Fuera de alcance: Negociar contrato.
Bloquea la siguiente tarea: No (bloquea la Etapa 8)
```

```text
ID: T-7.3
Nombre: Ejecutar POC-01 a POC-08 (driver, SDK, captura, calidad, template)
Etapa: 7
Objetivo: Verificar la cadena básica: driver correcto, acceso desde código, captura, calidad y generación de template.
Dependencias: T-7.1
Estado inicial esperado: Entorno listo.
Archivos o carpetas afectados: poc-uareu4500/src/**, poc-uareu4500/results/POC_RESULTS.md
Cambios de base de datos: base SQLite local de la POC, aislada y cifrada.
Cambios de backend/frontend/worker: ninguno.
Cambios del agente local: ninguno (la POC es código desechable).
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: los propios experimentos; cada uno con su criterio de éxito.
Comandos de verificación:
  dotnet run --project src/Poc.Console -- poc01 ... poc08
Criterios de aceptación: Los 9 experimentos (incluido POC-03B) ejecutados y registrados en POC_RESULTS.md con evidencia.
Resultado observable: POC_RESULTS.md con 9 filas completas y un template generado en formato estándar.
Riesgos: Que el driver correcto no sea evidente y se pierdan días; POC-01 existe justamente para eso.
Rollback: No aplica (código desechable).
Fuera de alcance: Matching a escala.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-7.4
Nombre: Ejecutar POC-09 a POC-15 (enrolamiento, 1:1, 1:N, FAR, FRR, latencia)
Etapa: 7
Objetivo: Los números que definen si el sistema es usable: FAR, FRR, latencia y umbral.
Dependencias: T-7.3, y 20-50 personas con consentimiento.
Estado inicial esperado: Captura y templates funcionando.
Archivos o carpetas afectados: poc-uareu4500/src/Poc.Matching/**, results/raw/*.csv
Cambios de base de datos: templates de prueba en la base local cifrada.
Cambios de backend/frontend/worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: los experimentos.
Comandos de verificación: dotnet run -- poc09 ... poc15 && cat results/raw/summary.csv
Criterios de aceptación:
  - POC-15: **cero falsas aceptaciones**.
  - POC-14: FRR <= 5% al umbral que da FAR <= 0,01%.
  - POC-13: p95 de matching proyectado a 2.000 templates <= 500 ms.
  - Se identifica qué proporción de personas tiene huellas no legibles de forma confiable.
Resultado observable: Curvas de FAR/FRR y de latencia por tamaño de padrón, en CSV.
Riesgos: Una falsa aceptación obliga a subir el umbral y repetir POC-14.
Rollback: No aplica.
Fuera de alcance: Integración con el CRM.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-7.5
Nombre: Ejecutar POC-16 a POC-21 (robustez, comunicación, cancelación, errores)
Etapa: 7
Objetivo: Verificar que el sistema sobrevive al mundo real: desconexiones, reinicios, cancelaciones y el circuito navegador-agente-backend.
Dependencias: T-7.4
Estado inicial esperado: Matching funcionando.
Archivos o carpetas afectados: poc-uareu4500/src/Poc.LocalWs/**, results/
Cambios de base de datos: ninguno.
Cambios de backend: backend mínimo de prueba, desechable.
Cambios de frontend: página HTML de prueba, desechable.
Cambios del worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: los experimentos, más la verificación de memoria del §5 del plan de POC.
Comandos de verificación: dotnet run -- poc16 ... poc21
Criterios de aceptación:
  - Recuperación automática ante desconexión USB y reinicio de Windows, incluido el arranque **sin sesión iniciada**.
  - `wss://127.0.0.1` con certificado autofirmado aceptado al menos por Chrome y Edge; comportamiento de Firefox documentado.
  - Cancelación confiable en los 4 escenarios.
  - Ninguna imagen ni template persiste en memoria tras la operación.
Resultado observable: El circuito completo navegador -> agente -> backend funciona en la máquina Windows.
Riesgos: Que Firefox no acepte el certificado; sería una condición de GO WITH CONDITIONS, no un NO-GO.
Rollback: No aplica.
Fuera de alcance: Producción.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-7.6
Nombre: Informe GO / GO WITH CONDITIONS / NO-GO
Etapa: 7
Objetivo: Un veredicto escrito con datos, y la actualización de los documentos afectados.
Dependencias: T-7.5, T-7.2
Estado inicial esperado: Los 21 experimentos ejecutados.
Archivos o carpetas afectados: docs/biometrics/POC_RESULTS.md, UAREU_4500_RESEARCH.md, ADRS.md (014, 015), DEPLOYMENT_PLAN.md (valores de configuración)
Cambios de base de datos/backend/frontend/worker/agente: ninguno.
Variables de entorno: se fijan los valores de BIOMETRIC_MATCH_THRESHOLD y de calidad mínima.
Migraciones: ninguna.
Seeds: ninguno.
Tests: ninguno.
Comandos de verificación: ninguno.
Criterios de aceptación:
  - Veredicto explícito con los criterios de POC_PLAN §6.
  - Cada condición de un GO WITH CONDITIONS se convierte en una tarea T-8.x.
  - Los [PENDIENTE] cerrados pasan a [VERIFICADO] con fecha y evidencia.
  - **Los datos biométricos de prueba destruidos, con constancia escrita.**
Resultado observable: POC_RESULTS.md con veredicto y métricas.
Riesgos: Un NO-GO. Es un resultado válido: el producto se vende sin biometría, que es exactamente por qué está después del MVP.
Rollback: No aplica.
Fuera de alcance: Construir el agente productivo.
Bloquea la siguiente tarea: Sí — la Etapa 8 no empieza sin veredicto aprobado.
```

---

## Etapa 8 — Biometría productiva

Sólo si T-7.6 concluye `GO` o `GO WITH CONDITIONS`, **y** el usuario lo aprueba.

```text
ID: T-8.1
Nombre: Migración de biometría y gestión de claves
Etapa: 8
Objetivo: Las 8 tablas biométricas y el servicio de envelope encryption con AAD por tenant.
Dependencias: T-7.6
Estado inicial esperado: Veredicto GO aprobado.
Archivos o carpetas afectados: migrations/0012_biometrics, apps/api/src/infra/crypto/**, packages/db/prisma/schema.prisma
Cambios de base de datos: migración 0012.
Cambios de backend: servicio de cifrado, tabla de KEK por tenant.
Cambios de frontend/worker/agente: ninguno.
Variables de entorno: MASTER_KEK (ya existente).
Migraciones: 0012_biometrics.
Seeds: ninguno.
Tests: unique(gymId, memberId, fingerPosition) parcial; unique(gymId, templateHash) parcial; **un ciphertext movido a otro gymId falla la verificación GCM**; rotación de KEK re-envuelve sin tocar los templates.
Comandos de verificación: pnpm db:migrate && pnpm test -- crypto
Criterios de aceptación: El test de AAD por tenant pasa.
Resultado observable: Un template cifrado no se puede descifrar con el gymId equivocado.
Riesgos: Perder la MASTER_KEK deja los templates irrecuperables; se documenta el procedimiento de custodia.
Rollback: Migración inversa (no hay datos productivos aún).
Fuera de alcance: Endpoints.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-8.2
Nombre: Gestión de agentes: pareo, aprobación, heartbeat y revocación
Etapa: 8
Objetivo: Los endpoints de la superficie CRM y de la superficie agente, con FakeAgent en los tests.
Dependencias: T-8.1
Estado inicial esperado: Tablas creadas.
Archivos o carpetas afectados: apps/api/src/modules/biometrics/agents/**, apps/api/test/support/fake-agent.ts, packages/contracts/agent.ts
Cambios de base de datos: ninguno.
Cambios de backend: pareo, aprobación, heartbeat, revocación, tokens de dispositivo.
Cambios de frontend: ninguno todavía.
Cambios del worker/agente: ninguno.
Variables de entorno: AGENT_TOKEN_TTL.
Migraciones: ninguna.
Seeds: 1 agente simulado.
Tests: pareo con secreto válido; secreto ya usado -> 401; secreto de otro gimnasio -> 404; agente sin aprobar no opera; revocado -> 403 inmediato; cambio de machineFingerprint vuelve a PENDING_APPROVAL; scope y un-solo-uso de los tokens; replay -> 401.
Comandos de verificación: pnpm test -- agents
Criterios de aceptación: Un agente no puede operar sin aprobación explícita.
Resultado observable: El FakeAgent completa el pareo y aparece en la base como PENDING_APPROVAL.
Riesgos: Secretos de pareo de larga vida.
Rollback: git revert.
Fuera de alcance: Agente real.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-8.3
Nombre: Consentimiento y enrolamiento (backend)
Etapa: 8
Objetivo: Registrar consentimiento y completar un enrolamiento desde el FakeAgent.
Dependencias: T-8.2
Estado inicial esperado: Gestión de agentes funcionando.
Archivos o carpetas afectados: apps/api/src/modules/biometrics/{consent,enrollment}/**
Cambios de base de datos: ninguno.
Cambios de backend: endpoints de consentimiento y enrolamiento.
Cambios de frontend/worker/agente: ninguno todavía.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: **sin consentimiento -> 409 y no se crea credencial**; dedo ya enrolado -> 409; template ya usado por otro socio -> 409; token atado al socio X no enrola al socio Y; sesión abandonada expira; **revocar consentimiento revoca todas las credenciales en la misma transacción**; calidad baja -> 422.
Comandos de verificación: pnpm test -- enrollment
Criterios de aceptación: Los 7 tests pasan; el consentimiento se verifica en el backend.
Resultado observable: El FakeAgent enrola un socio y la credencial queda cifrada en base.
Riesgos: Dejar una credencial a medias si la sesión se corta.
Rollback: git revert.
Fuera de alcance: UI.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-8.4
Nombre: Identificación 1:N e integración con el control de acceso
Etapa: 8
Objetivo: POST /agent/biometrics/identify identifica, autoriza con la misma cadena de /access/check, y registra.
Motivación: Es donde se materializa la separación identificación / autorización.
Dependencias: T-8.3
Estado inicial esperado: Enrolamiento funcionando.
Archivos o carpetas afectados: apps/api/src/modules/biometrics/matching/**, apps/api/src/modules/access/** (reutilización de la cadena)
Cambios de base de datos: ninguno.
Cambios de backend: motor de matching, caché de candidatos por sede, integración con acceso.
Cambios de frontend: ninguno todavía.
Cambios del worker/agente: ninguno.
Variables de entorno: BIOMETRIC_MATCH_THRESHOLD (valor de la POC).
Migraciones: ninguna.
Seeds: 3 socios con credenciales de template ficticio.
Tests: match correcto autoriza y registra asistencia; **match correcto con membresía vencida DENIEGA**; credencial revocada no matchea; sin match -> BIOMETRIC_NO_MATCH registrado; agente de la sede A no identifica contra la sede B; cross-tenant; **la respuesta no contiene PII**; rate limit -> 429; dos candidatos cercanos -> no match.
Comandos de verificación: pnpm test -- identify && k6 run scripts/load/identify.js
Criterios de aceptación:
  - El test de "no PII al agente" pasa.
  - El p95 con 2.000 credenciales cumple el objetivo medido en la POC.
Resultado observable: El FakeAgent envía un template y el evento access.resolved llega al navegador con los datos del socio.
Riesgos: Filtrar identidad al agente por un campo olvidado en la respuesta.
Rollback: git revert.
Fuera de alcance: Agente real.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-8.5
Nombre: Agente local real en C#
Etapa: 8
Objetivo: El agente de LOCAL_AGENT_ARCHITECTURE funcionando contra hardware real.
Dependencias: T-8.4, T-7.6
Estado inicial esperado: Backend biométrico completo y probado con FakeAgent.
Archivos o carpetas afectados: apps/local-agent/** (nuevo, fuera del workspace pnpm)
Cambios de base de datos: ninguno.
Cambios de backend: ninguno.
Cambios de frontend: ninguno todavía.
Cambios del worker: ninguno.
Cambios del agente local: creación completa.
Variables de entorno: configuración en %ProgramData%\Pulso\agent.json.
Migraciones: ninguna.
Seeds: ninguno.
Tests: unit de la máquina de estados; integración con FakeSensor; **fixtures de protocolo compartidas validadas en .NET y en TypeScript**; pruebas manuales con hardware según el checklist de POC-16 a POC-21.
Comandos de verificación:
  dotnet test apps/local-agent/Pulso.Agent.sln
  # manual en Windows con el lector
Criterios de aceptación:
  - Bind exclusivo a 127.0.0.1; si no puede, no arranca (test).
  - Origin validado; token de un solo uso; sin persistencia de templates.
  - Recuperación automática ante desconexión y reinicio.
  - Los buffers se sobrescriben (verificado con volcado de memoria).
Resultado observable: Un enrolamiento real completo desde el navegador con el lector físico.
Riesgos: Diferencias entre el comportamiento del SDK en la POC y en el agente estructurado.
Rollback: El agente se revoca desde el CRM; el CRM sigue funcionando sin biometría.
Fuera de alcance: Instalador.
Bloquea la siguiente tarea: Sí
```

```text
ID: T-8.6
Nombre: Cliente WebSocket y UI de biometría
Etapa: 8
Objetivo: Tab de biometría en la ficha del socio, badge de estado del agente y enrolamiento desde el navegador.
Dependencias: T-8.5
Estado inicial esperado: Agente funcionando.
Archivos o carpetas afectados: apps/web/lib/agent/**, apps/web/app/(app)/members/[id]/biometrics/**, apps/web/app/(app)/access/** (integración), packages/contracts/agent-protocol.ts
Cambios de base de datos: ninguno.
Cambios de backend: ninguno.
Cambios de frontend: cliente WS con reconexión, pantallas.
Cambios del worker/agente: ninguno.
Variables de entorno: ninguna.
Migraciones: ninguna.
Seeds: ninguno.
Tests: todo mensaje entrante se valida con Zod; el deviceToken **nunca** se persiste (test que inspecciona storage); reconexión con backoff; el resultado se escucha por el WS del backend, no por el local; los prompts se traducen desde códigos.
Comandos de verificación: pnpm test -- agent-client && pnpm test:e2e -- biometrics
Criterios de aceptación: El enrolamiento completo funciona desde la UI con hardware real.
Resultado observable: Enrolar una huella y luego identificarse en /access.
Riesgos: Guardar el token en localStorage por comodidad.
Rollback: git revert; la feature se apaga por flag.
Bloquea la siguiente tarea: No
```

```text
ID: T-8.7
Nombre: Gestión de dispositivos en el CRM
Etapa: 8
Objetivo: /settings/devices con alta, aprobación, revocación y log de eventos.
Dependencias: T-8.6
Archivos o carpetas afectados: apps/web/app/(app)/settings/devices/**
Cambios de backend: ninguno (endpoints ya existen).
Cambios de frontend: pantalla completa.
Otros cambios: ninguno.
Variables de entorno: ninguna. Migraciones: ninguna. Seeds: ninguno.
Tests: el secreto se muestra una vez y no vuelve por API; revocar refleja el estado; un agente de otra sede no aparece; los estados se distinguen visualmente.
Comandos de verificación: pnpm test:e2e -- devices
Criterios de aceptación: Un administrador puede parear y revocar un puesto sin ayuda técnica.
Resultado observable: El agente real aparece en la lista con su estado en vivo.
Riesgos: Exponer el secreto de pareo más de una vez.
Rollback: git revert.
Fuera de alcance: Instalador.
Bloquea la siguiente tarea: No
```

```text
ID: T-8.8
Nombre: Instalador MSI, firma y auto-actualización
Etapa: 8
Objetivo: MSI firmado que instala servicio, certificado local y configuración, con actualización por fases.
Dependencias: T-8.7
Archivos o carpetas afectados: apps/local-agent/installer/**, apps/api/src/modules/biometrics/updates/**
Cambios de backend: endpoint de actualizaciones y canal canary.
Cambios del agente local: UpdateService.
Otros: ninguno.
Variables de entorno: ninguna. Migraciones: ninguna. Seeds: ninguno.
Tests: la instalación es idempotente; el certificado se instala y se remueve al desinstalar; la actualización verifica firma y hash; un binario con firma inválida se rechaza; rollback automático si la nueva versión no arranca; la actualización no ocurre durante una operación.
Comandos de verificación: instalación manual en una VM limpia de Windows 10 y de Windows 11.
Criterios de aceptación:
  - Instalación completa en menos de 20 minutos siguiendo la guía.
  - Desinstalación limpia.
  - El certificado es único por instalación, no compartido en el MSI.
Resultado observable: MSI instalado en una VM limpia, agente operativo tras aprobar.
Riesgos: Distribuir una clave privada compartida en el instalador — sería un fallo grave; el test lo verifica.
Rollback: Versión anterior conservada; `pulso-agent --rollback`.
Fuera de alcance: Distribución por MDM corporativo.
Bloquea la siguiente tarea: No
```

```text
ID: T-8.9
Nombre: Retención, auditoría biométrica y runbooks
Etapa: 8
Objetivo: Cerrar el ciclo de vida del dato biométrico y dejar el soporte documentado.
Dependencias: T-8.8
Archivos o carpetas afectados: apps/worker/src/jobs/biometric-retention.ts, apps/web (vista de auditoría biométrica), docs/ops/runbooks/**
Cambios de backend: ninguno nuevo.
Cambios del worker: job diario de retención.
Otros: ninguno.
Variables de entorno: ninguna. Migraciones: ninguna. Seeds: ninguno.
Tests: el job borra físicamente los templates revocados hace más de 30 días; deja tombstone sin datos; no borra los que aún tienen consentimiento; registra el conteo sin contenido.
Comandos de verificación: pnpm test -- retention
Criterios de aceptación:
  - El checklist de BIOMETRIC_SECURITY §13 completo.
  - Los 9 runbooks de INSTALLATION_AND_SUPPORT §7 escritos y probados con un caso real cada uno.
  - **Revisión legal (§12) cerrada.**
Resultado observable: Un template revocado desaparece físicamente a los 30 días.
Riesgos: Borrar templates activos por un error en el criterio del job.
Rollback: El job no se puede revertir; por eso corre primero en dry-run durante una semana, registrando qué borraría.
Fuera de alcance: Nada.
Bloquea la siguiente tarea: Sí — cierra la Etapa 8.
```

---

## Etapas 9 a 13 — Milestones

Se expanden a tareas con plantilla completa **al comenzar cada etapa**. Motivo: planificar al detalle cinco etapas antes de tener el MVP en manos de un cliente produce planes que envejecen mal. Es una decisión explícita.

Cada etapa mantiene el patrón vertical: migración → servicio → controller → permisos → contrato → UI → tests, y su condición de salida incluye los tests de concurrencia de su dominio.

### Etapa 9 — Reservas y cronograma

| Milestone | Contenido | Test que define la etapa |
|---|---|---|
| M9.1 | Migración `ScheduleSlot`, `ScheduleException`, `Reservation` | constraints de doble reserva |
| M9.2 | Cronograma: CRUD de clases recurrentes por sede, actividad e instructor | |
| M9.3 | Excepciones y feriados | una excepción bloquea las reservas de ese día |
| M9.4 | Reservas: alta, cancelación, regla de límite horario | doble reserva → 409 |
| M9.5 | Control de cupo | **20 reservas concurrentes sobre cupo 10 → exactamente 10** |
| M9.6 | Vista de calendario y pantallas | |

### Etapa 10 — Productos y POS

| Milestone | Contenido | Test que define la etapa |
|---|---|---|
| M10.1 | Migración de productos, categorías, stock, ventas | `check (stock >= 0)` |
| M10.2 | CRUD de productos y categorías | |
| M10.3 | Venta con impacto en caja y stock, en una transacción | |
| M10.4 | Anulación con reversa de stock y de caja | doble anulación → 409 |
| M10.5 | Control de concurrencia | **5 ventas concurrentes con stock 3 → 3 éxitos** |
| M10.6 | Canje con puntos (depende de la Etapa 12; si va antes, queda tras un flag) | |

### Etapa 11 — Rutinas e instructores

| Milestone | Contenido |
|---|---|
| M11.1 | Migración de instructores, ejercicios, rutinas |
| M11.2 | CRUD de instructores + check-in/check-out con asistencia de staff |
| M11.3 | Catálogo de ejercicios con video |
| M11.4 | Rutinas plantilla y rutinas por socio |
| M11.5 | Panel de instructor con permisos acotados |

### Etapa 12 — Fidelización

| Milestone | Contenido | Test que define la etapa |
|---|---|---|
| M12.1 | Migración de configuración y ledger de puntos | append-only |
| M12.2 | Configuración por gimnasio | |
| M12.3 | Puntos por pago en fecha y anticipado | **no se acredita dos veces el mismo pago** |
| M12.4 | Objetivo semanal de asistencia (job) | idempotente por semana y socio |
| M12.5 | Vencimiento de puntos (job) | |
| M12.6 | Canje por cuota y por producto | saldo de puntos nunca negativo |

### Etapa 13 — ARCA, IA y administración de plataforma

| Milestone | Contenido | Nota |
|---|---|---|
| M13.1 | Configuración ARCA, CSR, validación de certificado | certificados cifrados, clave privada nunca en disco |
| M13.2 | Emisión de factura desde caja y libro diario | auditada con CAE |
| M13.3 | Estadísticas avanzadas y exportaciones | documento enmascarado también al exportar |
| M13.4 | Asistente de IA sobre vistas agregadas | `gymId` forzado por el servidor; sin acceso a tablas crudas |
| M13.5 | Administración global: gimnasios, planes, feature flags, logs | acceso a datos de un tenant siempre auditado y visible para el gimnasio |
| M13.6 | Resellers: dashboard, comisiones, leads | |
| M13.7 | **Row Level Security** en PostgreSQL (ADR-009 capa 2) | defensa en profundidad sobre el aislamiento |

---

# 12. Definition of Done

## Por tarea

- [ ] Cumple todos sus criterios de aceptación.
- [ ] Los comandos de verificación corren y terminan en 0.
- [ ] Tests nuevos escritos y pasando; **ningún test existente desactivado o modificado para que pase**.
- [ ] Si toca base de datos: migración aplicada, reversible o compatible hacia atrás.
- [ ] Si agrega endpoint: contrato en `packages/contracts`, permiso declarado, test de cross-tenant, idempotencia si corresponde.
- [ ] Si toca dinero: transacción explícita, `Decimal`, test de concurrencia.
- [ ] Si es una mutación relevante: `AuditEvent`.
- [ ] Sin secretos en el diff; sin PII nueva en logs.
- [ ] Si agrega UI: los cinco estados, responsive, sin violaciones serias de axe.
- [ ] Documentación actualizada si cambió una decisión.
- [ ] Rollback conocido y escrito.

## Por milestone

- [ ] Todas sus tareas cumplen su DoD.
- [ ] CI verde en todos los jobs.
- [ ] **Verificación manual** del resultado observable del milestone, no sólo tests.
- [ ] Sin regresiones en los flujos E2E existentes.
- [ ] Decisiones pendientes informadas al usuario.

## Por etapa

- [ ] Todos sus milestones cerrados.
- [ ] La condición de salida de testing de `TEST_STRATEGY` §12 cumplida.
- [ ] Cobertura sin bajar respecto de la etapa anterior.
- [ ] Los ADRs afectados actualizados; si algo se contradijo, hay un ADR que lo supersede.
- [ ] Desplegado en staging y verificado manualmente.
- [ ] Aprobación explícita del usuario antes de la etapa siguiente.

## De la POC biométrica

- [ ] Los 21 experimentos ejecutados y documentados con evidencia.
- [ ] Veredicto `GO` / `GO WITH CONDITIONS` / `NO-GO` explícito.
- [ ] Cada condición convertida en tarea de la Etapa 8.
- [ ] Umbral, calidad mínima y cantidad de muestras fijados con datos.
- [ ] `[PENDIENTE]` cerrados en la investigación, con fecha y fuente.
- [ ] V1 y V2 (licencia) resueltos por escrito.
- [ ] **Datos biométricos de prueba destruidos, con constancia.**

## Del MVP vendible

- [ ] Etapas 1 a 6 completas.
- [ ] Los 6 flujos E2E pasan.
- [ ] Suite de cross-tenant completa y verde.
- [ ] Los 11 tests de caja verdes, incluidos los 3 de concurrencia y el de rollback.
- [ ] Multi-tenancy verificada por tests generados automáticamente.
- [ ] RBAC con matriz de permisos probada.
- [ ] Caja auditable: movimientos inmutables, reversas, aprobaciones, cierre bloqueado por pendientes.
- [ ] Idempotencia en las 8 operaciones con efecto.
- [ ] Headers de seguridad verificados en la respuesta real.
- [ ] Documento enmascarado por defecto, incluso en exportaciones.
- [ ] Auditoría de toda operación sensible, consultable.
- [ ] Logs sin PII, verificado por test.
- [ ] axe sin violaciones serias en login, access, members y cash.
- [ ] Backups configurados **y un restore drill ejecutado**.
- [ ] Sentry con scrubbing verificado.
- [ ] Alertas con destinatario real.
- [ ] Seed reproducible y documentado.
- [ ] README que permite a alguien nuevo levantar el proyecto.
- [ ] Runbooks de los 4 incidentes más probables.
- [ ] Rollback probado al menos una vez en staging.

## De producción

- [ ] Checklist de go-live de `DEPLOYMENT_PLAN` §14 completo.
- [ ] Dominios, TLS y HSTS activos.
- [ ] Migraciones aplicadas; `/health/ready` en verde.
- [ ] Aprobación manual configurada en el pipeline.
- [ ] Onboarding del primer gimnasio ejecutado, con datos de prueba borrados después.
- [ ] Contacto de soporte y `requestId` visible en los errores.
- [ ] Política de retención activa y probada.
- [ ] Para biometría: además, el checklist de `BIOMETRIC_SECURITY` §13, incluida la revisión legal.

---

# 13. Preguntas bloqueantes

Sólo las que realmente impiden empezar. Todo lo demás se decidió y quedó documentado como ADR.

---

### B0 — ¿Existe el tercer documento?

**Por qué bloquea.** El brief menciona `Markdown(1).md pegado` como documento obligatorio. No fue adjuntado y una búsqueda en el sistema de archivos no lo encontró. Si contiene requisitos, restricciones de negocio o decisiones ya tomadas, el plan podría estar incompleto en un punto importante.

| Opción | Consecuencia |
|---|---|
| **A. No existe o no aporta nada nuevo (recomendada por defecto)** | Se procede con este plan |
| B. Existe y se adjunta | Se revisa el plan antes de la Etapa 1 y se anota qué cambió |
| C. Existe pero no se comparte | Se procede, dejando registro de que se planificó sin él |

**Etapas afectadas:** potencialmente todas.

---

### B1 — ¿Dónde vive el repositorio del producto?

**Por qué bloquea.** Es la primera tarea ejecutable (T-0.2) y determina dónde se escribe todo lo demás. Hechos: el repo actual tiene 0 commits, mezcla cuatro proyectos sin relación y tiene `.env` reales sin trackear.

| Opción | Consecuencia |
|---|---|
| **A. Repo nuevo en `~/Documents/pulso-crm` (recomendada)** | Historial limpio, CI propio, sin arrastrar secretos ajenos. Los documentos se copian y los originales quedan intactos |
| B. Subcarpeta dentro del repo actual | Un solo lugar, pero hereda el desorden y ata el CI del CRM a un repo de automatizaciones n8n |
| C. Repo remoto en GitHub desde el inicio | Igual que A, más backup y PRs desde la primera tarea. Requiere decidir público o privado (**privado**) |

**Recomendación:** A, y crear el remoto privado en GitHub en la misma tarea (`gh repo create pulso-crm --private`).
**Etapas afectadas:** 0 en adelante.

---

### B2 — ¿Cómo se llama el producto?

**Por qué bloquea.** El nombre queda en el scope de los paquetes npm, el nombre del repo, las cookies, el prefijo de la base y el instalador de Windows. Cambiarlo después es mecánico pero toca todo.

| Opción | Consecuencia |
|---|---|
| **A. "Pulso" como nombre de trabajo (recomendada)** | Se arranca hoy; la marca definitiva se decide con calma y el rename es barato antes de tener clientes |
| B. Nombre definitivo ahora | Requiere búsqueda en INPI y disponibilidad de dominio antes de escribir código |
| C. Genérico `gym-crm` | Sin riesgo, pero un nombre genérico se filtra a la UI y termina siendo el nombre real por inercia |

**Etapas afectadas:** 0 en adelante.

---

### B3 — ¿Con qué proveedor de WhatsApp?

**Por qué bloquea la Etapa 6, no antes.** La abstracción `WhatsAppProvider` se construye igual; lo que cambia es la implementación concreta, el costo, y **si el uso es conforme a los términos de WhatsApp**. Esto último importa: un proveedor no oficial puede hacer que se bloqueen los números de los clientes.

| Opción | Consecuencia |
|---|---|
| **A. API oficial de WhatsApp Business, vía un BSP (recomendada)** | Cumple términos, estable, con entrega verificable. Costo por conversación y plantillas que requieren aprobación |
| B. Solución no oficial autohospedada | Sin costo por mensaje y sin aprobación de plantillas, pero riesgo real de bloqueo del número del cliente y de incumplimiento de términos |
| C. Decidir en la Etapa 6 | Se construye contra el provider mock y se elige con el MVP casi listo |

**Recomendación:** A, y si el costo resulta prohibitivo para el segmento, revisarlo con datos. **No** recomiendo B para un producto que se le vende a terceros: el riesgo lo asume el cliente sin saberlo.
**Etapas afectadas:** 6, 13.

---

### B4 — ¿Se compra el lector antes o después del MVP?

**Por qué bloquea la Etapa 7.** Sin hardware no hay POC, y sin POC no hay Etapa 8. Pero también hay una demora de compra que conviene anticipar.

| Opción | Consecuencia |
|---|---|
| **A. Comprarlo ahora, ejecutar la POC en paralelo al MVP (recomendada)** | La POC no está en el camino crítico del MVP; si da NO-GO, se sabe temprano y sin costo de oportunidad. Requiere resolver la máquina Windows |
| B. Comprarlo al terminar la Etapa 6 | Menos dispersión, pero la Etapa 8 arranca más tarde y un NO-GO se descubre después de haber prometido la funcionalidad |
| C. No comprarlo hasta tener un cliente que lo pida | Menor inversión; la biometría deja de ser parte de la propuesta hasta entonces |

**Recomendación:** A. El costo del lector es bajo comparado con descubrir tarde que no funciona en Windows 11.
**Etapas afectadas:** 7, 8.

---

### B5 — ¿Qué se hace si el SDK de HID no es licenciable a un costo viable?

**Por qué bloquea la Etapa 8.** Es el riesgo R4. Conviene decidir el criterio **antes** de tener la respuesta, para no decidir bajo presión.

| Opción | Consecuencia |
|---|---|
| **A. Intentar el Stack B (FingerJetFX OSE + SourceAFIS), con revisión legal de LGPL-3 (recomendada)** | Sin costo de licencia. Requiere que POC-03B demuestre que se puede capturar la imagen sin el SDK, y una revisión legal del linking LGPL |
| B. Pagar la licencia | Camino más corto y con soporte del fabricante, si el costo por instalación es razonable para el precio del producto |
| C. Cambiar de hardware | Otros lectores tienen SDKs con licencias más simples. Implica repetir la investigación y la POC |
| D. No hacer biometría | El producto se vende sin ella; el MVP no la incluye |

**Recomendación:** ejecutar POC-03B en paralelo a T-7.2 para tener las dos respuestas al mismo tiempo, y decidir con datos. Si POC-03B falla y el costo es alto, **D** es una decisión legítima, no un fracaso.
**Etapas afectadas:** 7, 8.

---

## Decisiones que se tomaron sin preguntar

Para que quede claro qué **no** es bloqueante y por qué:

| Decisión | Criterio |
|---|---|
| NestJS en vez de Next fullstack | El brief lo pide y el dominio lo justifica (ADR-003) |
| shadcn/ui en vez de MUI | Evitar parecido con el producto auditado (ADR-005) |
| Prisma en vez de Drizzle | Mejor tooling de migraciones para un equipo chico (ADR-006) |
| Matching centralizado | La alternativa es inviable con este hardware (ADR-014) |
| Puerto 21987 para el agente | Evita colisión con HID (52181) y con el producto auditado (17890) |
| Tema claro por defecto | Diferenciación deliberada + legibilidad en recepción; el oscuro sigue disponible |
| Una asistencia por día de negocio | Es lo más común; el segundo intento permite el ingreso sin duplicar el registro |
| Railway como proveedor por defecto | Alternativas documentadas; la aplicación no depende de él (ADR-019) |
| Idioma del código en inglés, UI en español | Convención estándar; el usuario ya la usa en su otro proyecto |

---

# 14. Entregables

| # | Documento | Estado |
|---|---|---|
| 1 | `docs/MASTER_IMPLEMENTATION_PLAN.md` | este documento |
| 2 | `docs/ARCHITECTURE.md` | escrito |
| 3 | `docs/ADRS.md` | escrito — 24 ADRs |
| 4 | `docs/DATA_MODEL.md` | escrito — 10 bounded contexts |
| 5 | `docs/API_CONTRACTS.md` | escrito |
| 6 | `docs/FRONTEND_PLAN.md` | escrito |
| 7 | `docs/SECURITY_MODEL.md` | escrito |
| 8 | `docs/TEST_STRATEGY.md` | escrito |
| 9 | `docs/DEPLOYMENT_PLAN.md` | escrito |
| 10 | `docs/CLAUDE_CODE_EXECUTION_SEQUENCE.md` | escrito |
| 11 | `docs/biometrics/UAREU_4500_RESEARCH.md` | escrito — con etiquetas de verificación |
| 12 | `docs/biometrics/POC_PLAN.md` | escrito — 21 experimentos |
| 13 | `docs/biometrics/LOCAL_AGENT_ARCHITECTURE.md` | escrito |
| 14 | `docs/biometrics/WEBSOCKET_PROTOCOL.md` | escrito |
| 15 | `docs/biometrics/BIOMETRIC_SECURITY.md` | escrito |
| 16 | `docs/biometrics/INSTALLATION_AND_SUPPORT.md` | escrito |

**No se escribió código de producto. No se instalaron dependencias. No se ejecutaron migraciones. No se modificó nada de lo que ya existía en el repositorio.**
