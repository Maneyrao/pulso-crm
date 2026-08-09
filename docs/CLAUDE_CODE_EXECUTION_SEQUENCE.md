# Secuencia de ejecución para Claude Code — Pulso CRM

Fecha: 2026-08-09
Estado: propuesto.

## Cómo se usa este documento

Cada bloque numerado es un **prompt independiente**. Se copia entero y se pega en una sesión nueva de Claude Code. No se ejecutan dos seguidos sin revisar el resultado del anterior.

- **Un prompt = un milestone.** Los milestones grandes tienen más de un prompt.
- Cada prompt es autosuficiente: dice qué leer, qué mirar, qué hacer, qué no tocar y cuándo parar.
- **Ningún prompt avanza al siguiente por su cuenta.** Todos terminan pidiendo aprobación.

## Reglas comunes (van dentro de cada prompt)

Este bloque se repite literalmente en todos los prompts. Está acá una vez para referencia; en cada prompt aparece completo para que se pueda copiar suelto.

```text
REGLAS OBLIGATORIAS PARA ESTA SESIÓN

1. No sobrescribas ni borres cambios que no hayas hecho vos en esta sesión.
   Si encontrás un archivo modificado que no esperabas, PARÁ y avisá.
2. No ejecutes acciones destructivas: nada de rm -rf fuera del scratchpad,
   git reset --hard, git clean, DROP DATABASE, TRUNCATE, ni prisma migrate reset
   contra una base que no sea la local de desarrollo.
3. No avances fuera del alcance de esta tarea. Si detectás algo que habría que
   arreglar y está fuera de alcance, anotalo en el resumen final. No lo arregles.
4. No inventes credenciales, tokens, claves ni URLs. Si falta un valor, usá un
   placeholder evidente y pedilo en el resumen.
5. No desactives, no marques skip, no borres ni relajes un test para hacer pasar
   el pipeline. Si un test falla, arreglá el código o el test, no lo silencies.
   No bajes umbrales de cobertura.
6. Si una verificación falla, PARÁ. No sigas con las tareas siguientes.
   Explicá qué falló, qué intentaste y qué necesitás.
7. No pases al siguiente milestone automáticamente, aunque tengas contexto para
   hacerlo. Terminá, resumí y esperá.
8. Nunca copies código, textos de interfaz, nombres de rutas, nombres de campos,
   colores ni diseño del producto auditado (ControlFit). Los archivos de
   controlfit-audit/raw/ son EVIDENCIA de auditoría, no una fuente de la que copiar.
9. Ninguna variable de entorno con valor real va al repositorio. Sólo .env.example
   con valores obviamente falsos.

AL TERMINAR, ENTREGÁ UN RESUMEN CON:
- Lista de archivos creados y modificados (ruta exacta).
- Comandos ejecutados y su resultado (éxito o error, con la salida relevante).
- Criterios de aceptación: cuáles se cumplen y cuáles no, uno por uno.
- Decisiones que tomaste y que no estaban en el plan.
- Decisiones pendientes o dudas que necesitás que resuelva el usuario.
- Qué NO hiciste y por qué (fuera de alcance, bloqueado, etc.).
- La frase: "Milestone <ID> terminado. Esperando aprobación para continuar."
```

---

## Prompt 00 — Preparación (lo ejecuta el usuario, no Claude Code)

Antes del Prompt 01, el usuario responde las 5 preguntas bloqueantes de `MASTER_IMPLEMENTATION_PLAN.md` §13 y marca las ADRs como aceptadas o rechazadas.

Sin eso, el Prompt 01 no se ejecuta.

---

## Prompt 01 — M0.1 · Crear el repositorio y trasladar la documentación

```text
Sos el desarrollador principal del proyecto Pulso CRM.

DOCUMENTOS A LEER (completos, antes de tocar nada):
- controlfit-audit/docs/MASTER_IMPLEMENTATION_PLAN.md, secciones B, E y la tarea T-0.2
- controlfit-audit/docs/ADRS.md, ADR-000 y ADR-001

ESTADO DEL REPOSITORIO A INSPECCIONAR ANTES DE EMPEZAR:
- git -C "/Users/tmaneyro22/Documents/N8N AUTOMATIZACIONES" status --porcelain
  Guardá esta salida: al final tiene que ser IDÉNTICA.
- Confirmá que ~/Documents/pulso-crm NO existe.

TAREA A IMPLEMENTAR: T-0.2
Crear un repositorio git nuevo e independiente en ~/Documents/pulso-crm con:
- git init, rama main
- .gitignore que cubra: node_modules, .next, dist, build, .turbo, coverage,
  .env, .env.*, !.env.example, .DS_Store, *.tsbuildinfo, *.log
- README.md con: qué es el proyecto, stack elegido, cómo se levantará (aunque
  todavía no haya nada), y un índice de docs/
- docs/ con COPIA de los 16 documentos de controlfit-audit/docs/ (incluida la
  subcarpeta biometrics/)
- Un único commit: "chore: bootstrap repository and documentation"

ARCHIVOS QUE PODÉS MODIFICAR:
- Cualquier archivo dentro de ~/Documents/pulso-crm/ (lo estás creando)

ARCHIVOS QUE NO DEBÉS MODIFICAR NI BORRAR, BAJO NINGUNA CIRCUNSTANCIA:
- Todo lo que está dentro de "/Users/tmaneyro22/Documents/N8N AUTOMATIZACIONES/"
  Los documentos se COPIAN, no se mueven.
- En particular: controlfit-audit/raw/, controlfit-audit/screenshots/,
  controlfit-audit/notes/, n8n-local/, oeste-distribuidora/, cv/, workflows/

MIGRACIONES A EJECUTAR: ninguna.
TESTS A CREAR: ninguno.

COMANDOS A EJECUTAR:
  git -C ~/Documents/pulso-crm log --oneline
  git -C ~/Documents/pulso-crm status --porcelain
  ls -R ~/Documents/pulso-crm/docs
  git -C "/Users/tmaneyro22/Documents/N8N AUTOMATIZACIONES" status --porcelain

CRITERIOS DE ACEPTACIÓN:
1. ~/Documents/pulso-crm tiene exactamente 1 commit y el árbol limpio.
2. Los 16 documentos están en docs/ y docs/biometrics/.
3. Los originales en controlfit-audit/docs/ siguen existiendo sin cambios.
4. git status del repo viejo devuelve EXACTAMENTE la misma salida que al empezar.
5. El .gitignore cubre todo lo listado.

CUÁNDO PARAR:
Cuando los 5 criterios se cumplan, o antes si alguno falla.
No crees apps, no instales dependencias, no toques package.json.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN — pegar el bloque completo]
```

---

## Prompt 02 — M1.1 · Monorepo y servicios locales

```text
Sos el desarrollador principal del proyecto Pulso CRM.
Trabajás en ~/Documents/pulso-crm.

DOCUMENTOS A LEER:
- docs/MASTER_IMPLEMENTATION_PLAN.md, sección E y tareas T-1.1 y T-1.2
- docs/ADRS.md, ADR-002 y ADR-020
- docs/ARCHITECTURE.md, sección 4

ESTADO A INSPECCIONAR:
- git log --oneline (debe haber 1 commit)
- Confirmá versiones: node -v, pnpm -v, psql --version
- Confirmá si docker existe: command -v docker
- Confirmá si redis existe: command -v redis-server

TAREAS A IMPLEMENTAR: T-1.1 y T-1.2

T-1.1 — Monorepo:
- pnpm-workspace.yaml con apps/* y packages/*, EXCLUYENDO apps/local-agent
- turbo.json con pipelines: build, dev, lint, typecheck, test
- packages/tsconfig con base.json (strict, noUncheckedIndexedAccess),
  nextjs.json, node.json
- packages/eslint-config con reglas que PROHÍBAN: dangerouslySetInnerHTML,
  interpolación de strings en $queryRaw, console.log en apps/api
- packages/config con el parser de env basado en Zod (todavía casi vacío)
- .prettierrc, .editorconfig
- Scripts en el package.json raíz: dev, build, lint, typecheck, test,
  dev:services, check:env

T-1.2 — Servicios locales:
- scripts/dev-services.sh que detecte si hay Docker; si no, use Homebrew.
  DOCKER NO ESTÁ INSTALADO EN ESTA MÁQUINA: el camino nativo es el que tiene
  que funcionar hoy. PostgreSQL 16.14 sí está instalado.
  Si falta Redis, el script imprime el comando exacto para instalarlo y falla
  con mensaje claro. Nunca falla en silencio.
- docker-compose.yml con postgres:16 y redis:7 (para quien sí tenga Docker y
  para CI)
- Crear las bases pulso_dev y pulso_test si no existen (idempotente)
- .env.example completo según docs/MASTER_IMPLEMENTATION_PLAN.md §J
- .env local a partir del ejemplo (ignorado por git)

ARCHIVOS QUE PODÉS MODIFICAR: cualquiera dentro de ~/Documents/pulso-crm/,
excepto docs/ (los documentos de plan no se editan en esta tarea).

ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, y absolutamente nada fuera de
~/Documents/pulso-crm/.

MIGRACIONES: ninguna (Prisma llega en el Prompt 04).
TESTS A CREAR: un test en packages/config que verifique que el parser de env
falla, con mensaje claro, cuando falta una variable obligatoria.

COMANDOS A EJECUTAR:
  pnpm install
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm dev:services
  psql "$DATABASE_URL" -c "select version();"
  redis-cli ping

CRITERIOS DE ACEPTACIÓN:
1. Los cuatro comandos de pnpm terminan en 0 con el workspace vacío.
2. pnpm dev:services levanta Postgres y Redis en esta máquina, sin Docker.
3. psql y redis-cli responden.
4. Las bases pulso_dev y pulso_test existen.
5. .env.example está completo y .env está ignorado por git.
6. El test de packages/config pasa.

CUÁNDO PARAR:
Cuando los 6 criterios se cumplan. No crees apps/api ni apps/web.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 03 — M1.2a · apps/api con health, logging y errores

```text
DOCUMENTOS A LEER:
- docs/MASTER_IMPLEMENTATION_PLAN.md, tarea T-1.3
- docs/ARCHITECTURE.md, secciones 3.2 y 10
- docs/API_CONTRACTS.md, secciones 1.4 (formato de error) y 14 (salud)

ESTADO A INSPECCIONAR:
- git log --oneline
- pnpm dev:services corriendo; psql y redis-cli responden

TAREA A IMPLEMENTAR: T-1.3
Crear apps/api con NestJS:
- main.ts, app.module.ts
- common/logging: pino con JSON estructurado, requestId generado por request y
  devuelto en el header X-Request-Id
- common/errors: filtro de excepciones global con el shape exacto de
  API_CONTRACTS §1.4 ({type, code, title, status, detail, requestId, errors?})
- modules/health: GET /health/live y GET /health/ready
  (ready todavía NO chequea Postgres: eso llega en T-1.4)
- Configuración validada con Zod desde packages/config. Arrancar sin una
  variable obligatoria debe fallar al inicio diciendo cuál falta.
- CORS con allowlist explícita y credentials:true. Nunca origin:'*'.

NO IMPLEMENTES en esta tarea: auth, base de datos, ningún módulo de dominio,
ningún endpoint que no sea /health/*.

ARCHIVOS QUE PODÉS MODIFICAR: apps/api/**, packages/config/**, package.json raíz.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, apps/web (no existe todavía),
packages/tsconfig, packages/eslint-config.

MIGRACIONES: ninguna.
TESTS A CREAR:
- e2e de Nest sobre /health/live (200) y /health/ready (200)
- test del filtro de errores: una ruta inexistente devuelve el shape correcto
- test de configuración: falta una variable obligatoria -> el arranque falla

COMANDOS A EJECUTAR:
  pnpm --filter @pulso/api build
  pnpm --filter @pulso/api test
  pnpm --filter @pulso/api dev &
  curl -s localhost:3001/health/live | jq
  curl -s -i localhost:3001/ruta-que-no-existe

CRITERIOS DE ACEPTACIÓN:
1. /health/live devuelve 200.
2. Un 404 devuelve el shape RFC-7807 con code, requestId y sin stack trace.
3. Los logs son JSON con requestId, y el header X-Request-Id vuelve.
4. Sin una variable obligatoria, el proceso no arranca y dice cuál falta.
5. Los tres tests pasan.

CUÁNDO PARAR: con los 5 criterios cumplidos.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 04 — M1.2b · Prisma y el primer test de integración real

```text
DOCUMENTOS A LEER:
- docs/MASTER_IMPLEMENTATION_PLAN.md, tarea T-1.4
- docs/ADRS.md, ADR-006 y ADR-023
- docs/TEST_STRATEGY.md, sección 2 (aislamiento de la base en tests)
- docs/DATA_MODEL.md, sección 15 (orden de migraciones)

ESTADO A INSPECCIONAR:
- apps/api arranca y responde /health/live
- Base pulso_dev vacía: psql "$DATABASE_URL" -c "\dt"

TAREA A IMPLEMENTAR: T-1.4
- packages/db con Prisma: schema.prisma inicial (sin modelos de dominio todavía)
- Migración 0001_extensions: pgcrypto, citext, btree_gist, pg_trgm
- PrismaService inyectable en apps/api (apps/api/src/infra/prisma)
- /health/ready pasa a chequear Postgres y Redis de verdad; devuelve 503 si
  alguno no responde
- Helper de tests: cada archivo de test crea un esquema efímero con nombre
  aleatorio, corre las migraciones, y lo destruye al terminar.
  IMPORTANTE: usá un template database migrado una sola vez por corrida
  (CREATE DATABASE ... TEMPLATE) para no pagar las migraciones N veces.

ARCHIVOS QUE PODÉS MODIFICAR: packages/db/**, apps/api/src/infra/**,
apps/api/src/modules/health/**, apps/api/test/setup/**.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, el resto de apps/api.

MIGRACIONES A EJECUTAR:
  pnpm db:migrate    (crea y aplica 0001_extensions)
NO ejecutes prisma db push. NO ejecutes prisma migrate reset contra otra base
que no sea pulso_dev local.

TESTS A CREAR:
- Test de integración contra PostgreSQL REAL (no mock) que hace SELECT 1 en su
  esquema efímero.
- Test de /health/ready que devuelve 503 con la base caída.

COMANDOS A EJECUTAR:
  pnpm db:migrate
  psql "$DATABASE_URL" -c "\dx"
  pnpm --filter @pulso/api test:integration
  curl -s localhost:3001/health/ready | jq

CRITERIOS DE ACEPTACIÓN:
1. Las 4 extensiones aparecen en \dx.
2. El test de integración corre contra Postgres real; NO hay ningún mock de Prisma.
3. Cada archivo de test usa su propio esquema y lo destruye.
4. /health/ready devuelve 503 si Postgres no responde.

CUÁNDO PARAR: con los 4 criterios cumplidos.
Si el usuario de Postgres no tiene permiso para crear extensiones, PARÁ y avisá
qué comando hay que correr como superusuario.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 05 — M1.2c · apps/web, packages/ui y apps/worker

```text
DOCUMENTOS A LEER:
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-1.5 y T-1.6
- docs/FRONTEND_PLAN.md, secciones 1, 2 y 5
- docs/ADRS.md, ADR-004, ADR-005, ADR-012

ESTADO A INSPECCIONAR:
- apps/api responde /health/ready con db: ok
- Redis responde

TAREAS: T-1.5 y T-1.6

T-1.5 — apps/web:
- Next.js App Router + TypeScript strict + Tailwind
- packages/ui con tokens.css (los tokens de FRONTEND_PLAN §2, no inventes otros)
  y dos componentes: Button y Card
- Una página de estado que consulte /health/ready de la API real y muestre
  api: ok / db: ok / redis: ok
- packages/contracts con el primer esquema Zod: HealthResponse
- Modo claro y oscuro funcionando

T-1.6 — apps/worker:
- Proceso Node con BullMQ, sin puerto HTTP
- Una cola de prueba y un job "ping"
- En apps/api, un endpoint POST /dev/ping-job que SÓLO existe si
  NODE_ENV=development

PROHIBIDO EN ESTA TAREA:
- Colores hardcodeados en apps/web: todo sale de los tokens.
- Cualquier pantalla de negocio (login, socios, caja).
- Copiar diseño, colores o textos del producto auditado.

ARCHIVOS QUE PODÉS MODIFICAR: apps/web/**, apps/worker/**, packages/ui/**,
packages/contracts/**, apps/api/src/infra/queue/**, apps/api/src/modules/dev/**.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, packages/db, el resto de apps/api.

MIGRACIONES: ninguna.
TESTS A CREAR:
- Componente Button (variantes, disabled)
- La respuesta de health valida contra el esquema Zod
- Integración del worker: un job se procesa; el mismo jobId no se procesa dos veces
- Test que verifica que /dev/ping-job NO existe con NODE_ENV=production

COMANDOS A EJECUTAR:
  pnpm dev            (levanta api, web y worker)
  curl -s localhost:3000 | head -20
  curl -XPOST localhost:3001/dev/ping-job
  pnpm test
  pnpm lint && pnpm typecheck

CRITERIOS DE ACEPTACIÓN:
1. localhost:3000 muestra el estado real leído de la API.
2. No hay colores hardcodeados en apps/web (verificalo con grep).
3. El job se procesa y el log del worker lo muestra.
4. El endpoint de desarrollo no existe en producción (test que lo prueba).
5. pnpm test, lint y typecheck en verde.

CUÁNDO PARAR: con los 5 criterios cumplidos.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 06 — M1.3 · CI

```text
DOCUMENTOS A LEER:
- docs/MASTER_IMPLEMENTATION_PLAN.md, tarea T-1.7
- docs/TEST_STRATEGY.md, sección 11
- docs/SECURITY_MODEL.md, sección 10 (gestión de secretos)

ESTADO A INSPECCIONAR:
- pnpm test, lint, typecheck y build pasan en local
- Existe (o no) un remoto en GitHub: git remote -v

TAREA A IMPLEMENTAR: T-1.7
.github/workflows/ci.yml con estos jobs:
- lint (eslint + prettier + typecheck)
- secrets (gitleaks)
- unit
- integration (con servicios postgres:16 y redis:7, corriendo
  prisma migrate deploy contra la base efímera)
- build (turbo build de todas las apps)
Los jobs corren en paralelo donde se puede.

Configurá .gitleaks.toml.
Las variables de entorno del CI usan valores OBVIAMENTE FALSOS. Nada real.

ARCHIVOS QUE PODÉS MODIFICAR: .github/**, .gitleaks.toml, README.md,
package.json raíz (scripts si hace falta).
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, código de las apps.

MIGRACIONES: las corre el pipeline contra la base efímera del CI.
TESTS A CREAR: ninguno nuevo; el CI corre los existentes.

COMANDOS A EJECUTAR:
  # si no hay remoto, creá uno privado y avisá antes:
  # gh repo create pulso-crm --private --source=. --remote=origin
  git push -u origin main
  gh run watch

CRITERIOS DE ACEPTACIÓN:
1. El pipeline pasa en verde.
2. Todos los jobs corren; ninguno está comentado ni con continue-on-error.
3. El pipeline tarda menos de 10 minutos.
4. Verificá UNA VEZ que gitleaks funciona: agregá un secreto falso en un commit
   temporal, comprobá que el CI falla, y REVERTÍ ese commit.

CUÁNDO PARAR: con los 4 criterios cumplidos.
Si el usuario no quiere crear el repo remoto todavía, PARÁ antes del push,
dejá el workflow escrito y avisá.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 07 — M2.1a · Esquema de tenancy, IAM y primitivas

```text
DOCUMENTOS A LEER:
- docs/DATA_MODEL.md, secciones 0, 1, 2 y 15
- docs/MASTER_IMPLEMENTATION_PLAN.md, tarea T-2.1
- docs/ADRS.md, ADR-008, ADR-017

ESTADO A INSPECCIONAR:
- Sólo la migración 0001_extensions aplicada: psql "$DATABASE_URL" -c "\dt"
- CI en verde

TAREA A IMPLEMENTAR: T-2.1
Migraciones 0002_tenancy, 0003_iam y 0004_platform_primitives, con TODAS las
entidades y constraints de DATA_MODEL secciones 1 y 2.

PRESTÁ ATENCIÓN ESPECIAL A:
- Todo índice único de negocio es COMPUESTO con gymId. Un unique global sobre un
  dato de negocio es un bug de multi-tenancy.
- unique(gymId, email) en User debe ser PARCIAL: where deletedAt is null.
- AuditEvent no debe aceptar UPDATE ni DELETE: revocá esos permisos para el rol
  de aplicación de la base.
- Los importes que aparezcan usan numeric(14,2). Ningún float.

ARCHIVOS QUE PODÉS MODIFICAR: packages/db/**.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, apps/**.

MIGRACIONES A EJECUTAR:
  pnpm db:migrate
Revisá el SQL generado ANTES de aplicarlo y mostralo en el resumen.

TESTS A CREAR (integración, contra Postgres real):
- Dos usuarios con el mismo email en el mismo gimnasio -> falla
- El mismo email en gimnasios distintos -> funciona
- unique(slug) en Gym
- unique(gymId, name) en Branch
- UPDATE sobre AuditEvent -> falla por permisos
- unique(gymId, key) en IdempotencyKey

COMANDOS A EJECUTAR:
  pnpm db:migrate
  psql "$DATABASE_URL" -c "\d+ users"
  psql "$DATABASE_URL" -c "\d+ audit_events"
  pnpm --filter @pulso/api test:integration -- schema

CRITERIOS DE ACEPTACIÓN:
1. Todos los constraints de DATA_MODEL §1 y §2 existen en la base.
2. Los 6 tests de constraints pasan.
3. Ningún unique de negocio es global (revisalo uno por uno y listalo en el resumen).

CUÁNDO PARAR: con los 3 criterios cumplidos. No crees endpoints.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 08 — M2.1b · Autenticación

```text
DOCUMENTOS A LEER:
- docs/API_CONTRACTS.md, sección 3
- docs/SECURITY_MODEL.md, secciones 2 y 3
- docs/ADRS.md, ADR-007
- docs/MASTER_IMPLEMENTATION_PLAN.md, tarea T-2.2

ESTADO A INSPECCIONAR:
- Migraciones 0002-0004 aplicadas
- Tabla users vacía

TAREA A IMPLEMENTAR: T-2.2
Módulo auth con POST /auth/login, POST /auth/refresh, POST /auth/logout,
GET /auth/me.

REQUISITOS NO NEGOCIABLES:
- argon2id con el perfil de SECURITY_MODEL §2.1.
- Cookies httpOnly: pulso_at (15 min) y pulso_rt (30 días, Path acotado a
  /api/v1/auth). Secure en producción. SameSite=Lax.
- El refresh token se guarda HASHEADO (SHA-256) en base, nunca en claro.
- Rotación con detección de reuso: si llega un token ya rotado, revocá TODA la
  familia y emití AuditEvent(SECURITY_REFRESH_REUSE).
- El token NUNCA vuelve en el cuerpo de la respuesta.
- La respuesta de login no debe permitir distinguir "email inexistente" de
  "password incorrecta", ni por contenido ni por tiempo: si el email no existe,
  ejecutá igual un hash dummy.
- Lockout tras 10 intentos fallidos, 15 minutos.

ARCHIVOS QUE PODÉS MODIFICAR: apps/api/src/modules/auth/**,
apps/api/src/common/auth/**, packages/contracts/auth.ts.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, packages/db (el esquema ya está),
apps/web.

MIGRACIONES: ninguna.
TESTS A CREAR (todos obligatorios):
- login feliz; password incorrecta; usuario inactivo; gimnasio suspendido
- lockout tras N intentos
- las cookies tienen HttpOnly y SameSite correctos
- refresh feliz
- REPLAY de un refresh ya rotado invalida la familia entera
- logout revoca
- el email inexistente y la password mala tardan aproximadamente lo mismo

COMANDOS A EJECUTAR:
  pnpm --filter @pulso/api test -- auth
  curl -i -XPOST localhost:3001/api/v1/auth/login \
    -H 'content-type: application/json' \
    -d '{"email":"test@example.com","password":"wrongpassword"}'

CRITERIOS DE ACEPTACIÓN:
1. Los 9 tests pasan.
2. El curl devuelve Set-Cookie con HttpOnly y NO expone el token en el body.
3. El test de replay de refresh pasa.
4. El test de timing pasa.

CUÁNDO PARAR: con los 4 criterios cumplidos.
No implementes RBAC ni la pantalla de login: son los prompts siguientes.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 09 — M2.1c · Contexto de tenant, extensión de Prisma y RBAC

```text
Este es el prompt más importante del proyecto. El aislamiento entre gimnasios es
el control #1: si falla, un cliente ve los datos de otro.

DOCUMENTOS A LEER:
- docs/SECURITY_MODEL.md, sección 4 completa
- docs/ADRS.md, ADR-008 y ADR-009
- docs/DATA_MODEL.md, sección 2 (catálogo de permisos)
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-2.3 y T-2.4

ESTADO A INSPECCIONAR:
- Auth funcionando; los tests de auth pasan

TAREAS: T-2.3 y T-2.4

T-2.3 — Contexto de tenant:
- TenantContext en AsyncLocalStorage con gymId, branchIds permitidos,
  activeBranchId, userId, requestId
- TenantContextGuard que lo llena DESDE EL TOKEN VALIDADO
- Extensión de cliente de Prisma que inyecta gymId en findMany, findFirst,
  count, aggregate, update, updateMany, delete, deleteMany, y lo fuerza en create
- findUnique sobre un modelo tenant-scoped se convierte en findFirst con gymId
- Lista EXPLÍCITA de modelos tenant-scoped y de modelos globales
- prisma.unscoped() como escape hatch, que emite AuditEvent en cada uso

PROHIBIDO ABSOLUTAMENTE:
- Leer gymId de un header, del body o de la query. Sólo del token.
- Que una consulta sin contexto de tenant devuelva filas. Debe LANZAR EXCEPCIÓN.

T-2.4 — RBAC:
- Catálogo de permisos en packages/contracts/permissions.ts (el de DATA_MODEL §2)
- Roles de sistema: OWNER, MANAGER, RECEPTIONIST, INSTRUCTOR
- PermissionsGuard, decoradores @RequiresPermission y @Public
- Orden de guards: JwtAuthGuard -> TenantContextGuard -> FeatureGuard ->
  PermissionsGuard -> ThrottlerGuard

ARCHIVOS QUE PODÉS MODIFICAR: apps/api/src/common/auth/**,
apps/api/src/infra/prisma/**, apps/api/src/modules/iam/**,
packages/contracts/permissions.ts.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, packages/db/prisma/migrations.

MIGRACIONES: ninguna.
TESTS A CREAR (todos obligatorios):
- Consultar un modelo tenant-scoped SIN contexto -> lanza excepción
- findMany sin where devuelve sólo el tenant activo
- findUnique por id de otro tenant devuelve null
- create sin gymId lo recibe inyectado
- Un uso de unscoped() no declarado en la allowlist rompe el test
- Matriz rol x endpoint
- TEST CRÍTICO: recorré el registro de rutas de Nest y fallá si algún handler
  no tiene @Public() ni @RequiresPermission()

COMANDOS A EJECUTAR:
  pnpm --filter @pulso/api test -- tenancy
  pnpm --filter @pulso/api test -- permissions

CRITERIOS DE ACEPTACIÓN:
1. Sin contexto de tenant, la consulta falla ruidosamente. NUNCA devuelve todo.
2. No hay ninguna vía de Prisma para leer una fila de otro gymId.
3. Un endpoint sin decorador de permiso hace fallar el test.
4. Todos los tests pasan.

CUÁNDO PARAR: con los 4 criterios cumplidos.
Si encontrás una operación de Prisma que la extensión no cubre, PARÁ y avisá:
es un agujero de seguridad, no un detalle.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 10 — M2.1d · Auditoría, idempotencia y outbox

```text
DOCUMENTOS A LEER:
- docs/ADRS.md, ADR-016 y ADR-017
- docs/API_CONTRACTS.md, sección 1.9
- docs/MASTER_IMPLEMENTATION_PLAN.md, tarea T-2.7
- docs/SECURITY_MODEL.md, sección 12.2 (logs)

ESTADO A INSPECCIONAR: contexto de tenant y RBAC funcionando.

TAREA A IMPLEMENTAR: T-2.7
Tres primitivas transversales que van a usar TODOS los módulos siguientes:
- @Audited(): interceptor que genera AuditEvent con before/after, con los campos
  sensibles enmascarados (documento, teléfono, password, tokens)
- @Idempotent(): guard + interceptor sobre la tabla IdempotencyKey.
  Misma clave + mismo requestHash -> devuelve la respuesta original con header
  Idempotency-Replayed: true.
  Misma clave + cuerpo distinto -> 409 IDEMPOTENCY_KEY_REUSED.
  Clave en curso -> 409 IDEMPOTENCY_IN_PROGRESS.
- Patrón outbox: OutboxService que escribe OutboxEvent dentro de la misma
  transacción del negocio, y un dispatcher en el worker que lo publica.
- En apps/web: helper que genera un Idempotency-Key por INTENTO de operación y
  lo reusa en los reintentos de ese mismo intento.

ARCHIVOS QUE PODÉS MODIFICAR: apps/api/src/common/{audit,idempotency}/**,
apps/api/src/infra/outbox/**, apps/worker/src/jobs/outbox-dispatcher.ts,
apps/web/lib/api/idempotency.ts.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, módulos de dominio.

MIGRACIONES: ninguna (las tablas ya existen en 0004).
TESTS A CREAR:
- misma clave + mismo cuerpo -> una sola ejecución
- misma clave + cuerpo distinto -> 409
- dos requests CONCURRENTES con la misma clave
- un evento de outbox se publica exactamente una vez, aun reiniciando el worker
  a mitad
- el AuditEvent no contiene documento completo, password ni tokens
- test de redacción de logs: un objeto con TODOS los campos prohibidos de
  SECURITY_MODEL §12.2 no deja rastro en la salida

COMANDOS A EJECUTAR:
  pnpm --filter @pulso/api test -- idempotency
  pnpm --filter @pulso/api test -- audit
  pnpm --filter @pulso/api test -- outbox

CRITERIOS DE ACEPTACIÓN:
1. Los 6 tests pasan.
2. Cada primitiva tiene un ejemplo de uso documentado en su README.
3. El test de redacción de logs pasa.

CUÁNDO PARAR: con los 3 criterios cumplidos.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 11 — M2.2a · Login, AppShell y selector de sede

```text
DOCUMENTOS A LEER:
- docs/FRONTEND_PLAN.md, secciones 3, 4, 5 y 6.1
- docs/MASTER_IMPLEMENTATION_PLAN.md, tarea T-2.5
- docs/API_CONTRACTS.md, sección 3

ESTADO A INSPECCIONAR:
- Auth, tenant y RBAC funcionando en la API
- apps/web con la página de estado del Prompt 05

TAREA A IMPLEMENTAR: T-2.5
- Pantalla /login según FRONTEND_PLAN §6.1 (los 5 estados)
- POST /auth/select-branch en la API
- AppShell: sidebar filtrado por permiso Y por feature, header con selector de
  sede, barra de estado inferior
- Cliente HTTP con credentials:'include', X-CSRF-Token, y manejo centralizado
  de errores según FRONTEND_PLAN §5
- Modal de sesión expirada ante 401 SESSION_EXPIRED, que conserva la ruta actual
- middleware.ts que redirige a /login sin cookie (y NADA MÁS: no decide permisos)

CRÍTICO: al cambiar de sede hay que llamar a queryClient.clear(). Si no, se
muestran datos de la sede anterior. Escribí el test que lo verifica.

PROHIBIDO:
- Guardar tokens en localStorage, sessionStorage o en el store de Zustand.
- Copiar layout, colores o textos del producto auditado.
- Colores fuera de los tokens de packages/ui.

ARCHIVOS QUE PODÉS MODIFICAR: apps/web/**, packages/ui/**,
apps/api/src/modules/auth/select-branch.controller.ts, packages/contracts/auth.ts.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, el resto de apps/api.

MIGRACIONES: ninguna.
TESTS A CREAR:
- Componente de login: los 5 estados
- El mensaje de error es genérico y no revela si el email existe
- Navegación completa por teclado
- El sidebar oculta los ítems sin permiso
- Cambiar de sede llama al endpoint y LIMPIA la caché de queries
- Seleccionar una sede de otro gimnasio devuelve 404
- axe sin violaciones serias en /login

COMANDOS A EJECUTAR:
  pnpm dev
  pnpm --filter @pulso/web test
  pnpm test:e2e -- login

CRITERIOS DE ACEPTACIÓN:
1. Login funcional en el navegador con las cookies correctas.
2. El sidebar respeta permisos.
3. El test de limpieza de caché al cambiar de sede pasa.
4. axe sin violaciones serias.
5. No hay tokens en ningún storage del navegador (verificalo y mostralo).

CUÁNDO PARAR: con los 5 criterios cumplidos.
Vas a necesitar un usuario para probar: creá uno con un script temporal en
scratchpad, NO agregues datos al seed todavía (eso es el Prompt 13).

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 12 — M2.2b · Sedes, usuarios y la suite de cross-tenant

```text
DOCUMENTOS A LEER:
- docs/API_CONTRACTS.md, secciones 4 y 5
- docs/TEST_STRATEGY.md, sección 4.1
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-2.6 y T-2.8
- docs/ADRS.md, ADR-022

ESTADO A INSPECCIONAR: login y AppShell funcionando.

TAREAS: T-2.6 y T-2.8

T-2.6 — CRUD de sedes y usuarios, VERTICAL COMPLETO
(migración ya existe -> servicio -> controller -> permisos -> contrato Zod ->
query/mutation -> pantalla -> tests). Los 9 endpoints de API_CONTRACTS §4 y §5.
Reglas: no se puede desactivar al último OWNER; la contraseña de un usuario nuevo
la genera el sistema (temporal, mustChangePassword), NUNCA la elige el admin;
crear una sede sobre el límite del plan -> 403 PLAN_LIMIT_REACHED.

T-2.8 — Suite de cross-tenant GENERADA + FeatureGuard
La suite tiene que descubrir las rutas sola a partir del registro de Nest.
Agregar un endpoint nuevo sin cubrirlo debe hacer fallar el CI.
Los 7 archivos de TEST_STRATEGY §4.1.
FeatureGuard con caché en Redis: feature deshabilitada -> 403 FEATURE_NOT_ENABLED.

ARCHIVOS QUE PODÉS MODIFICAR: apps/api/src/modules/{tenancy,iam}/**,
apps/api/src/common/auth/feature.guard.ts, apps/api/test/tenancy/**,
packages/contracts/{tenancy,iam,features}.ts,
apps/web/app/(app)/{settings/branches,users}/**.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, packages/db/prisma/migrations.

MIGRACIONES: ninguna.
TESTS A CREAR: los 7 de tenancy + CRUD por endpoint + los de reglas de negocio
+ componentes con los 5 estados.

COMANDOS A EJECUTAR:
  pnpm --filter @pulso/api test -- tenancy
  pnpm --filter @pulso/api test -- iam
  pnpm test:e2e -- users

CRITERIOS DE ACEPTACIÓN:
1. La suite de cross-tenant descubre las rutas automáticamente; decí en el
   resumen CUÁNTAS rutas está cubriendo.
2. La respuesta de "no existe" y la de "es de otro tenant" son IDÉNTICAS.
3. Los 9 endpoints tienen contrato, permiso, test de cross-tenant y AuditEvent.
4. No se puede desactivar al último OWNER.
5. La contraseña temporal se muestra una sola vez.

CUÁNDO PARAR: con los 5 criterios cumplidos.
ESTA SUITE NO SE DESACTIVA NUNCA, en ninguna sesión futura.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 13 — M2.2c · Seed base

```text
DOCUMENTOS A LEER:
- docs/MASTER_IMPLEMENTATION_PLAN.md, sección J y tarea T-2.9

ESTADO A INSPECCIONAR: CRUD de sedes y usuarios funcionando.

TAREA A IMPLEMENTAR: T-2.9
packages/db/prisma/seed.ts DETERMINÍSTICO (ids fijos, sin Math.random(),
sin fechas del reloj sin anclar) con: 1 gimnasio, 2 sedes, 4 roles de sistema,
3 usuarios (admin@demo.local, recepcion@demo.local, profe@demo.local),
contraseña Demo.1234 para los tres.

OBLIGATORIO: el seed debe NEGARSE a correr si NODE_ENV=production, y pedir
confirmación interactiva si detecta datos existentes.
Las credenciales demo van en el README, marcadas claramente como de desarrollo.

ARCHIVOS QUE PODÉS MODIFICAR: packages/db/prisma/seed.ts,
packages/db/prisma/seed-data/**, README.md, package.json (script db:seed).
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, apps/**.

MIGRACIONES: ninguna.
TESTS A CREAR:
- Correr el seed dos veces produce el mismo resultado (mismos ids)
- El seed falla con NODE_ENV=production

COMANDOS A EJECUTAR:
  pnpm db:reset && pnpm db:seed
  psql "$DATABASE_URL" -c "select email from users order by email;"
  pnpm db:seed        # segunda corrida: mismo resultado
  # login manual en el navegador con admin@demo.local

CRITERIOS DE ACEPTACIÓN:
1. Determinístico: dos corridas dan los mismos ids.
2. Se puede loguear con los tres usuarios.
3. Falla explícitamente con NODE_ENV=production.
4. Las credenciales están documentadas y son obviamente de desarrollo.

CUÁNDO PARAR: con los 4 criterios cumplidos.
db:reset SÓLO contra la base local pulso_dev. Verificá la URL antes de correrlo.

FIN DE LA ETAPA 2. En el resumen incluí el estado de la Definition of Done de
etapa (MASTER_IMPLEMENTATION_PLAN §12).

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 14 — M3.1 · Socios: esquema, backend y listado

```text
DOCUMENTOS A LEER:
- docs/DATA_MODEL.md, sección 3
- docs/API_CONTRACTS.md, sección 6
- docs/FRONTEND_PLAN.md, sección 6.4
- docs/ADRS.md, ADR-018
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-3.1, T-3.2, T-3.3

ESTADO A INSPECCIONAR: Etapa 2 completa; seed funcionando.

TAREAS: T-3.1, T-3.2, T-3.3 — vertical completo de socios.

Migración 0005_members (Member, MemberDocument, LedgerEntry) con TODOS los
constraints de DATA_MODEL §3.
Backend: los 10 endpoints de API_CONTRACTS §6 (sin foto ni documentos: eso es
el Prompt 17).
Frontend: /members con filtros en la URL, tabla y los 5 estados.

PRESTÁ ATENCIÓN ESPECIAL A:
- unique(gymId, documentType, documentNumber) where deletedAt is null.
  El "where" es importante: sin él no se puede volver a dar de alta a alguien.
- memberNumber correlativo por gimnasio: usá un contador con SELECT ... FOR UPDATE.
  NO uses MAX(memberNumber)+1: se rompe bajo concurrencia.
- El documento se devuelve ENMASCARADO salvo con permiso member:read_document.
  El enmascaramiento va en un serializador del BACKEND, no en el frontend.
- Normalizá documento (sin puntos ni espacios) y teléfono (E.164) antes de
  guardar y antes de comparar.

ARCHIVOS QUE PODÉS MODIFICAR: packages/db/**, apps/api/src/modules/members/**,
packages/contracts/members.ts, packages/config/{document,phone}.ts,
apps/web/app/(app)/members/page.tsx y sus componentes, packages/ui (DataTable,
Pagination, EmptyState, ErrorState).
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, otros módulos de la API.

MIGRACIONES A EJECUTAR:
  pnpm db:migrate    (0005_members)
Mostrá el SQL generado antes de aplicarlo.

TESTS A CREAR:
- Los constraints, uno por uno
- Documento duplicado en el mismo gimnasio -> 409
- El MISMO documento en otro gimnasio -> OK
- memberNumber correlativo con 20 altas CONCURRENTES
- Enmascaramiento sin permiso
- Búsqueda por nombre, apellido y documento
- Cross-tenant de los 10 endpoints (la suite generada debería tomarlos sola:
  verificá que el conteo de rutas cubiertas subió)
- Frontend: los 5 estados; empty distinto de sin-resultados; filtros en la URL
  sobreviven al recargar; axe

COMANDOS A EJECUTAR:
  pnpm db:migrate
  pnpm --filter @pulso/api test -- members
  pnpm --filter @pulso/web test -- members
  pnpm test:e2e -- members-list

CRITERIOS DE ACEPTACIÓN:
1. El test de concurrencia de memberNumber pasa 10 veces seguidas sin flakiness.
2. El documento nunca se devuelve completo sin el permiso.
3. Empty y "sin resultados" son mensajes distintos.
4. La suite de cross-tenant cubre los endpoints nuevos (decí el conteo).

CUÁNDO PARAR: con los 4 criterios cumplidos.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 15 — M3.2 · Catálogo y membresías

```text
DOCUMENTOS A LEER:
- docs/DATA_MODEL.md, sección 4
- docs/API_CONTRACTS.md, sección 7
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-3.4 y T-3.5

ESTADO A INSPECCIONAR: módulo de socios funcionando.

TAREAS: T-3.4 y T-3.5

Migración 0006_catalog (Activity, Plan, PlanActivity, PlanBranch) y
0007_memberships (Membership).
Backend y frontend de actividades y planes.
Backend de membresías: POST /members/:id/memberships SÓLO en modo DEBT
(el modo NOW necesita caja y llega en la Etapa 4).

PRESTÁ ATENCIÓN ESPECIAL A:
- El constraint que impide membresías activas solapadas se hace con
  EXCLUDE USING gist sobre daterange, con btree_gist (ya instalado en 0001).
  Prisma no lo genera solo: escribí SQL en la migración.
- check (classesRemaining is null or classesRemaining >= 0)
- pricePaid congela el precio del plan al momento de asignar.
- El saldo del socio (Member.balance) es una CACHÉ. La verdad es la suma de
  LedgerEntry. Recalculalo en la misma transacción, con SELECT ... FOR UPDATE
  sobre el socio.

ARCHIVOS QUE PODÉS MODIFICAR: packages/db/**,
apps/api/src/modules/{catalog,memberships}/**,
packages/contracts/{catalog,memberships}.ts,
apps/web/app/(app)/{plans,activities}/**.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, módulo de caja (no existe todavía).

MIGRACIONES A EJECUTAR: pnpm db:migrate (0006 y 0007).

TESTS A CREAR:
- Los 4 ciclos de facturación producen el durationDays correcto
- Desactivar un plan con membresías activas -> 409 PLAN_IN_USE
- Alta de membresía con deuda
- Solapamiento -> 409 (por el constraint de la base, no sólo por el servicio)
- TEST DE CONSISTENCIA: tras 100 operaciones aleatorias, Member.balance es igual
  a la suma de su ledger
- Idempotencia
- Dos POST concurrentes crean UNA sola membresía

COMANDOS A EJECUTAR:
  pnpm db:migrate
  pnpm --filter @pulso/api test -- catalog
  pnpm --filter @pulso/api test -- memberships

CRITERIOS DE ACEPTACIÓN:
1. El constraint de solapamiento funciona a nivel de base (probalo con SQL directo).
2. El test de consistencia balance-vs-ledger pasa.
3. El test de concurrencia pasa.
4. Asignar una membresía sin cobrar deja al socio con saldo negativo correcto.

CUÁNDO PARAR: con los 4 criterios cumplidos.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 16 — M3.3 · Alta de socio, ficha y deudores

```text
DOCUMENTOS A LEER:
- docs/FRONTEND_PLAN.md, secciones 6.5, 6.6 y 6.9
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-3.6, T-3.7, T-3.8

ESTADO A INSPECCIONAR: catálogo y membresías funcionando en la API.

TAREAS: T-3.6, T-3.7, T-3.8
- /members/new: stepper de 3 pasos. El paso 3 sólo ofrece "finalizar sin cobrar"
  por ahora (el cobro llega en el Prompt 21).
- /members/[id]: ficha con tabs (Resumen, Membresías, Cuenta corriente, Asistencias)
- /members/debt: listado de deudores
- Edición y baja con auditoría

PRESTÁ ATENCIÓN ESPECIAL A:
- Borrador del alta en sessionStorage (SIN la foto): recargar no debe perder la carga.
- Si el paso 3 falla, el socio YA CREADO no se pierde: redirigí a su ficha con
  un aviso.
- El saldo que se muestra viene del backend. NO lo calcules en el frontend.
- La baja es soft y exige motivo si el socio tiene deuda.

ARCHIVOS QUE PODÉS MODIFICAR: apps/web/app/(app)/members/**, packages/ui
(Stepper, DocumentInput, PhoneInput), apps/api (GET /members/:id/ledger,
GET /members/debtors, PATCH, deactivate).
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, módulos no relacionados.

MIGRACIONES: ninguna.
TESTS A CREAR:
- E2E: alta con deuda de punta a punta
- Documento duplicado se muestra inline en el paso 1
- Recargar conserva el borrador
- Doble click no crea dos socios (idempotencia)
- Baja con deuda -> 409 salvo force con motivo
- El AuditEvent de la edición registra before/after con documento enmascarado
- Navegación por teclado en el stepper
- axe en las tres pantallas

COMANDOS A EJECUTAR:
  pnpm test:e2e -- member-create
  pnpm --filter @pulso/web test -- members
  pnpm lint && pnpm typecheck

CRITERIOS DE ACEPTACIÓN:
1. Un alta completa termina en la ficha del socio con su deuda.
2. El borrador sobrevive a un refresh.
3. Doble click no duplica.
4. axe sin violaciones serias.

CUÁNDO PARAR: con los 4 criterios cumplidos.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 17 — M3.4 · Archivos y ampliación del seed

```text
DOCUMENTOS A LEER:
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-3.9 y T-3.10
- docs/SECURITY_MODEL.md, sección 5 (validación de entrada)

TAREAS: T-3.9 y T-3.10
- Storage S3 compatible con URLs prefirmadas emitidas por la API
- Foto de socio (cámara o archivo) y documentos (apto médico)
- MinIO en docker-compose y en dev-services.sh para desarrollo local
- Ampliar el seed a 40 socios: 25 activos, 8 vencidos, 5 con deuda, 2 inactivos

PRESTÁ ATENCIÓN ESPECIAL A:
- El MIME se valida por MAGIC BYTES, no por extensión ni por el header del cliente.
- El nombre de archivo del cliente NUNCA se usa en la key de S3.
- Ningún objeto es público. Lectura sólo por URL prefirmada de corta vida.
- Los documentos del seed van en el rango 90.000.000-90.000.999 (reservado para
  datos de prueba). Ningún dato de una persona real.

ARCHIVOS QUE PODÉS MODIFICAR: apps/api/src/infra/storage/**,
apps/api/src/modules/members/documents.controller.ts, apps/web (PhotoCapture),
docker-compose.yml, scripts/dev-services.sh,
packages/db/prisma/seed.ts y seed-data/**.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**.

MIGRACIONES: ninguna.
TESTS A CREAR:
- Renombrar un .exe a .jpg NO engaña a la validación
- Un archivo sobre el límite se rechaza
- La URL de lectura vence
- Un usuario de otro gimnasio no puede leer la foto
- Tras el seed, la suma del ledger de cada socio coincide con su balance

COMANDOS A EJECUTAR:
  pnpm dev:services
  pnpm --filter @pulso/api test -- storage
  pnpm db:reset && pnpm db:seed
  psql "$DATABASE_URL" -c "select status, count(*) from members group by status;"

CRITERIOS DE ACEPTACIÓN:
1. El test de magic bytes pasa.
2. Ningún objeto del bucket es público.
3. El seed produce 40 socios en los cuatro estados, coherentes.
4. Determinístico.

CUÁNDO PARAR: con los 4 criterios cumplidos.

FIN DE LA ETAPA 3. Incluí el estado de la DoD de etapa en el resumen.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 18 — M4.1 · Caja: esquema, configuración y sesiones

```text
Esta etapa maneja dinero. Los constraints y las transacciones no son opcionales.

DOCUMENTOS A LEER:
- docs/DATA_MODEL.md, sección 5 completa
- docs/API_CONTRACTS.md, sección 8
- docs/ADRS.md, ADR-010
- docs/TEST_STRATEGY.md, sección 4.3
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-4.1, T-4.2, T-4.3

ESTADO A INSPECCIONAR: Etapa 3 completa.

TAREAS: T-4.1, T-4.2, T-4.3

Migración 0008_cash con TODOS los constraints de DATA_MODEL §5.
LOS TRES CRÍTICOS:
- unique(cashRegisterId) where status = 'OPEN'
- unique(gymId, openedByUserId) where status = 'OPEN'
- unique(reversalOfId) where reversalOfId is not null
Son índices únicos PARCIALES. Prisma puede necesitar SQL manual: escribilo.

CRUD de PaymentMethod, CashConcept y CashRegister.
Apertura y cierre de sesión con arqueo por método de pago.

REGLAS DE DINERO, NO NEGOCIABLES:
- numeric(14,2) en base, Prisma.Decimal en código, STRING DECIMAL en la API.
  Nunca number en JSON. Escribí un interceptor que lo garantice y un test que
  inspeccione el tipo en la respuesta.
- El "esperado" del arqueo lo calcula el BACKEND. El frontend no recalcula nada.
- No se puede cerrar con operaciones pendientes.

ARCHIVOS QUE PODÉS MODIFICAR: packages/db/**, apps/api/src/modules/cash/**,
apps/api/src/common/money/**, packages/contracts/cash.ts,
apps/web/app/(app)/cash/{payment-methods,concepts}/**.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, módulos no relacionados.

MIGRACIONES: pnpm db:migrate (0008). Mostrá el SQL antes de aplicarlo.

TESTS A CREAR (todos obligatorios):
- Los 5 constraints, probados con SQL directo
- Apertura feliz
- Segunda apertura de la misma caja -> 409
- Mismo usuario abriendo otra caja -> 409
- CONCURRENCIA: dos aperturas simultáneas, exactamente una gana
- Cierre con arqueo y cálculo de diferencia por método
- Cierre con operaciones pendientes -> 409
- CONCURRENCIA: dos cierres simultáneos, exactamente uno cierra
- 0.1 + 0.2 = 0.30 exacto
- Ningún importe es number en el JSON de respuesta

COMANDOS A EJECUTAR:
  pnpm db:migrate
  pnpm --filter @pulso/api test -- cash-session
  # corré el test de concurrencia 10 veces seguidas:
  for i in $(seq 1 10); do pnpm --filter @pulso/api test -- cash-session.concurrency || break; done

CRITERIOS DE ACEPTACIÓN:
1. Los 3 tests de concurrencia pasan 10 veces seguidas SIN flakiness.
   Si son flaky, arreglá el locking. NO agregues retry.
2. Los 5 constraints existen en la base.
3. Ningún importe viaja como number.

CUÁNDO PARAR: con los 3 criterios cumplidos.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 19 — M4.2 · Movimientos, cobros y reversas

```text
DOCUMENTOS A LEER:
- docs/DATA_MODEL.md, sección 5 (transacción canónica de cobro de cuota)
- docs/API_CONTRACTS.md, sección 8
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-4.4, T-4.5, T-4.6, T-4.7

ESTADO A INSPECCIONAR: sesiones de caja funcionando; tests de concurrencia verdes.

TAREAS: T-4.4, T-4.5, T-4.6, T-4.7
- Movimientos de ingreso y egreso, con umbral de aprobación
- Cobro de membresía (modo NOW) y pago de deuda: LA TRANSACCIÓN COMPLETA de
  DATA_MODEL §5, con los 8 pasos, en SERIALIZABLE
- Reintegros
- Reversas y flujo de aprobación (solicitud, aprobar, rechazar)
- Libro diario agrupado por día DE LA SEDE

PRESTÁ ATENCIÓN ESPECIAL A:
- La reversa CREA un movimiento nuevo. NO edita el original. Lo único que cambia
  en el original es el flag isReversed, dentro de la misma transacción.
- unique(reversalOfId) es lo que impide revertir dos veces. El chequeo en el
  servicio es sólo para dar un buen mensaje.
- El libro diario agrupa por el día de negocio en la zona de la SEDE, no en UTC
  ni en la zona del servidor. Un movimiento a las 23:30 de Buenos Aires cae en
  ese día.
- Todos estos endpoints llevan Idempotency-Key.

ARCHIVOS QUE PODÉS MODIFICAR: apps/api/src/modules/{cash,payments}/**,
apps/api/src/modules/memberships/** (modo NOW), packages/config/time.ts,
packages/contracts/{cash,payments}.ts.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, frontend (es el prompt siguiente).

MIGRACIONES: ninguna.
TESTS A CREAR (todos obligatorios):
- Ingreso, egreso, monto <= 0 -> 422, sin caja abierta -> 409
- Egreso sobre umbral genera solicitud y NO genera movimiento
- Cobro completo: verifica los 4 efectos (membresía, caja, ledger, balance)
- TEST DE ROLLBACK: forzá un fallo en el paso 4 y comprobá que NO queda NADA escrito
- Pago parcial, total y en exceso
- Reversa crea movimiento nuevo y no edita el original
- Doble reversa -> 409
- CONCURRENCIA: dos reversas simultáneas, una gana
- Reversa de un pago revierte el saldo del socio
- Consistencia balance-vs-ledger tras 100 operaciones aleatorias
- Libro diario: un movimiento a las 23:30 -03:00 cae en ese día, no en el siguiente
- Idempotencia en los 5 endpoints

COMANDOS A EJECUTAR:
  pnpm --filter @pulso/api test -- cash
  pnpm --filter @pulso/api test -- payments
  for i in $(seq 1 10); do pnpm --filter @pulso/api test -- cash-reversal.concurrency || break; done

CRITERIOS DE ACEPTACIÓN:
1. El test de rollback pasa: un fallo parcial no deja datos.
2. El movimiento original conserva amount, type y createdAt intactos tras una reversa.
3. El test de borde de zona horaria del libro diario pasa.
4. El test de consistencia balance-vs-ledger pasa.
5. Los tests de concurrencia pasan 10 veces seguidas.

CUÁNDO PARAR: con los 5 criterios cumplidos.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 20 — M4.3 · Frontend de caja y cobro desde socios

```text
DOCUMENTOS A LEER:
- docs/FRONTEND_PLAN.md, secciones 6.7 y 6.8
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-4.8, T-4.9, T-4.10

TAREAS: T-4.8, T-4.9, T-4.10
- /cash con los dos estados: sin sesión (sólo apertura) y con sesión (operación)
- Modal de cierre con arqueo y diferencia calculada EN VIVO mientras se tipea
- Reversa con motivo obligatorio de mínimo 10 caracteres y confirmación explícita
- /cash/daybook
- Integrar el cobro en el paso 3 del alta de socio y en la ficha
- Ampliar el seed con datos de caja

PRESTÁ ATENCIÓN ESPECIAL A:
- Sin sesión abierta NO se muestra la lista de movimientos. No hay nada que operar.
- El botón de cierre se deshabilita con operaciones pendientes y muestra la lista
  accionable, no un toast.
- MoneyInput trabaja con STRING DECIMAL, nunca con number. Escribí el test.
- El resumen viene del backend. No lo recalcules.
- Los movimientos revertidos se muestran TACHADOS con link a su reversa, nunca ocultos.

ARCHIVOS QUE PODÉS MODIFICAR: apps/web/app/(app)/{cash,members}/**,
packages/ui (MoneyInput, MoneyDisplay, ConfirmDialog),
packages/db/prisma/seed-data/cash.ts.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, apps/api (ya está listo).

MIGRACIONES: ninguna.
TESTS A CREAR:
- Sin sesión se muestra la apertura y no la lista
- La diferencia se calcula en vivo
- El botón de cierre se deshabilita con pendientes
- La reversa exige motivo de 10 caracteres
- MoneyInput nunca convierte a number
- E2E flujo 4: abrir, ingreso, egreso, reversa, cerrar con diferencia
- E2E flujo 2: alta con cobro
- E2E flujo 3: alta con deuda y cobro posterior
- axe en /cash

COMANDOS A EJECUTAR:
  pnpm db:reset && pnpm db:seed
  pnpm test:e2e -- cash
  pnpm test:e2e -- member-payment
  pnpm --filter @pulso/web test -- cash

CRITERIOS DE ACEPTACIÓN:
1. Los flujos E2E 2, 3 y 4 del MVP pasan.
2. El resumen de caja coincide exactamente con lo que devuelve el backend.
3. axe sin violaciones serias.
4. Al entrar a /cash con el seed hay una sesión abierta lista para usar.

CUÁNDO PARAR: con los 4 criterios cumplidos.

FIN DE LA ETAPA 4. Incluí el estado de la DoD de etapa.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 21 — M5.1 · Acceso y asistencias

```text
DOCUMENTOS A LEER:
- docs/DATA_MODEL.md, sección 6
- docs/API_CONTRACTS.md, sección 9 (los 9 pasos de la cadena de autorización)
- docs/FRONTEND_PLAN.md, sección 6.3
- docs/ADRS.md, ADR-011, ADR-021
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-5.1 a T-5.5

ESTADO A INSPECCIONAR: Etapa 4 completa.

TAREAS: T-5.1 a T-5.5 — vertical completo de acceso.

Migración 0009_access con el constraint anti doble-registro:
unique(gymId, memberId, branchId, occurredOn), donde occurredOn es el día de
negocio EN LA ZONA DE LA SEDE, no en UTC.

POST /access/check con los 9 pasos EN ORDEN de API_CONTRACTS §9.
Escribí la cadena de decisión como una FUNCIÓN PURA testeable, separada del
acceso a base.

Gateway Socket.IO: namespace /gym/{gymId}, room branch:{branchId}, handshake
autenticado con la cookie, adapter de Redis.

Pantalla /access según FRONTEND_PLAN §6.3, con los 6 estados de resultado.

Job diario de vencimiento de membresías, en la zona de cada sede.

PRESTÁ ATENCIÓN ESPECIAL A:
- Un acceso DENEGADO devuelve HTTP 200 con decision: "DENIED". No es un error HTTP.
- AccessAttempt se registra SIEMPRE, permitido o denegado.
- El segundo intento del mismo día devuelve ALLOWED/DUPLICATE_WINDOW y NO crea
  una segunda asistencia ni descuenta otra clase.
- El input de la pantalla mantiene el foco SIEMPRE: un lector de tarjetas que
  tipea y manda Enter tiene que funcionar sin tocar nada.
- El estado nunca se comunica sólo por color: texto + icono + color.

ARCHIVOS QUE PODÉS MODIFICAR: packages/db/**, apps/api/src/modules/{access,realtime}/**,
apps/worker/src/jobs/membership-expiration.ts, packages/contracts/access.ts,
apps/web/app/(app)/{access,members/attendance}/**, apps/web/lib/realtime/**,
packages/ui (StatusBadge).
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, módulos no relacionados.

MIGRACIONES: pnpm db:migrate (0009).

TESTS A CREAR (todos obligatorios):
- UN TEST POR reasonCode (son 10)
- Doble check el mismo día no duplica asistencia ni descuenta dos clases
- CONCURRENCIA: dos checks simultáneos descuentan UNA sola clase
- El intento denegado igual queda registrado
- Socio de otro gimnasio -> NOT_FOUND
- Realtime: un cliente sin sesión no se conecta; un cliente del gimnasio A no
  recibe eventos de B; un cliente de la sede 1 no recibe eventos de la sede 2
- El job de vencimiento usa la zona de la sede: una membresía que vence hoy a
  las 23:59 en Buenos Aires NO se marca vencida a las 21:00 UTC
- El job es idempotente
- Frontend: cada reasonCode renderiza su estado; el foco vuelve al input;
  Enter dispara; el evento WS pinta el resultado
- axe con contraste reforzado en el banner de resultado

COMANDOS A EJECUTAR:
  pnpm db:migrate
  pnpm --filter @pulso/api test -- access
  pnpm --filter @pulso/api test -- realtime
  pnpm --filter @pulso/api test -- membership-expiration
  pnpm test:e2e -- access

CRITERIOS DE ACEPTACIÓN:
1. Los 10 tests de reasonCode pasan.
2. El test de concurrencia de descuento de clase pasa 10 veces seguidas.
3. El test de borde de zona horaria del job pasa.
4. El aislamiento de Socket.IO por gimnasio y sede está probado.
5. El flujo E2E 5 del MVP pasa.

CUÁNDO PARAR: con los 5 criterios cumplidos.

FIN DE LA ETAPA 5. Incluí el estado de la DoD de etapa.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 22 — M6.1 · Mensajería

```text
DOCUMENTOS A LEER:
- docs/DATA_MODEL.md, sección 10
- docs/API_CONTRACTS.md, sección 11
- docs/SECURITY_MODEL.md, sección 15
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-6.1 a T-6.4

ESTADO A INSPECCIONAR: Etapa 5 completa.

TAREAS: T-6.1 a T-6.4

Migración 0010_messaging.
Interfaz WhatsAppProvider + implementación MOCK (el proveedor real depende de la
pregunta bloqueante B3: si todavía no está resuelta, trabajá contra el mock y
avisalo en el resumen).
Cola de mensajería en el worker con backoff exponencial, 5 intentos y DLQ.
Recibo de pago y recordatorio de deuda.
Historial, reintento y broadcast con preview obligatorio.

PRESTÁ ATENCIÓN ESPECIAL A:
- unique(gymId, dedupeKey) en MessageJob impide duplicar mensajes.
  dedupeKey de ejemplo: receipt:{cashMovementId}
- unique(provider, externalId) en WebhookEvent impide reprocesar webhooks.
- El gymId de un webhook NO se toma del payload: se resuelve por la integración
  asociada al número de destino.
- Las credenciales del proveedor van CIFRADAS en base y nunca vuelven por API.
- El broadcast SIN confirm devuelve 202 con estimatedRecipients y NO envía nada.
  Con confirm, encola. Rate limit 3 por hora por gimnasio.
- El envío nunca ocurre dentro de un request HTTP.

ARCHIVOS QUE PODÉS MODIFICAR: packages/db/**, apps/api/src/modules/messaging/**,
apps/worker/src/{queues,jobs}/**, packages/contracts/messaging.ts,
apps/web/app/(app)/{messaging,settings/messaging}/**.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**.

MIGRACIONES: pnpm db:migrate (0010).

TESTS A CREAR:
- dedupeKey impide dos jobs para el mismo pago
- Webhook repetido con el mismo externalId se ignora
- Firma HMAC inválida -> 401
- Reintento con backoff; tras 5 fallos -> DLQ y estado FAILED
- Un evento de outbox se despacha exactamente una vez aunque el worker se
  reinicie a mitad
- El teléfono se normaliza a E.164
- Un socio sin teléfono no genera job fallido: genera job cancelado con motivo
- Broadcast sin confirm NO envía
- El broadcast requiere permiso y queda auditado con el conteo

COMANDOS A EJECUTAR:
  pnpm db:migrate
  pnpm --filter @pulso/api test -- messaging
  pnpm --filter @pulso/worker test
  pnpm test:e2e -- broadcast

CRITERIOS DE ACEPTACIÓN:
1. Cobrar una cuota deja un MessageJob en QUEUED y luego SENT con el mock.
2. Cobrar dos veces con la misma idempotencia genera UN solo mensaje.
3. El broadcast muestra el conteo antes de enviar y exige confirmación.
4. Las credenciales nunca vuelven en una respuesta de la API.

CUÁNDO PARAR: con los 4 criterios cumplidos.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 23 — M6.2 · Reportes, dashboard y cierre del MVP

```text
Este prompt cierra el MVP vendible. Lo que no quede acá se convierte en deuda
con clientes reales adentro.

DOCUMENTOS A LEER:
- docs/API_CONTRACTS.md, sección 12
- docs/FRONTEND_PLAN.md, secciones 6.2 y 6.14
- docs/SECURITY_MODEL.md, secciones 6, 9 y 12
- docs/DEPLOYMENT_PLAN.md, sección 14
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-6.5 y T-6.6

TAREAS: T-6.5 y T-6.6

Reportes: los 4 endpoints, dashboard con 6 KPIs, /reports con 3 tabs.
Endurecimiento: CSP y headers de SECURITY_MODEL §6, rate limits de
API_CONTRACTS §1.10, serializador de logs con allowlist, Sentry con scrubbing.
Checklist de go-live de DEPLOYMENT_PLAN §14.

PRESTÁ ATENCIÓN ESPECIAL A:
- Los rangos de reportes usan la zona de la SEDE.
- El ranking de asistencia devuelve el documento ENMASCARADO, siempre, incluso
  en exportaciones.
- Verificá con EXPLAIN que las consultas de reportes usan índices. Si falta
  alguno, agregalo en una migración con CREATE INDEX CONCURRENTLY.
- La CSP se prueba primero en staging: una CSP demasiado estricta rompe la app.

ARCHIVOS QUE PODÉS MODIFICAR: apps/api/src/modules/reporting/**,
apps/api/src/main.ts, apps/api/src/common/throttler/**,
apps/web/app/(app)/{dashboard,reports}/**, apps/web/next.config.ts,
.github/workflows/ci.yml, docs/ops/** (runbooks), packages/db (índices).
ARCHIVOS QUE NO DEBÉS MODIFICAR: los 16 documentos de plan en docs/ (excepto
crear docs/ops/).

MIGRACIONES: si hacen falta índices, una migración nueva con CONCURRENTLY.

TESTS A CREAR:
- Los rangos usan la zona de la sede
- El ranking enmascara el documento
- Sin permiso stats:read no se accede
- Cada header de seguridad está presente con su valor en la RESPUESTA REAL
- El rate limit devuelve 429 con Retry-After
- TEST DE REDACCIÓN: un objeto con todos los campos prohibidos de
  SECURITY_MODEL §12.2 no deja rastro en los logs
- Carga con k6: dashboard con 5.000 socios y 100.000 asistencias, p95 < 1 s
- axe sobre login, access, members y cash
- Los 6 flujos E2E del MVP

COMANDOS A EJECUTAR:
  pnpm db:migrate
  pnpm test && pnpm test:e2e && pnpm lint && pnpm typecheck
  k6 run scripts/load/dashboard.js
  curl -sI http://localhost:3001/api/v1/health/live | grep -i -E "content-security|x-frame|strict-transport|x-content-type"

CRITERIOS DE ACEPTACIÓN:
1. Los 6 flujos E2E pasan.
2. Todos los headers de seguridad están en la respuesta real.
3. El test de redacción de logs pasa.
4. El documento nunca se devuelve completo en un ranking ni en una exportación.
5. El p95 del dashboard con volumen cumple el objetivo.
6. La Definition of Done del MVP (MASTER_IMPLEMENTATION_PLAN §12) está completa,
   punto por punto. Listala entera en el resumen, marcando qué falta.

CUÁNDO PARAR: con los 6 criterios cumplidos.

FIN DEL MVP VENDIBLE. No sigas con biometría: eso requiere hardware, una POC y
la aprobación explícita del usuario.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 24 — Etapa 7 · POC del U.are.U 4500

```text
ADVERTENCIA: este prompt sólo se ejecuta con el hardware en mano y en una
máquina Windows. La máquina de desarrollo habitual es macOS y no tiene .NET.

DOCUMENTOS A LEER:
- docs/biometrics/UAREU_4500_RESEARCH.md COMPLETO, prestando atención a las
  10 filas marcadas [PENDIENTE]
- docs/biometrics/POC_PLAN.md COMPLETO
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-7.1 a T-7.6

ESTADO A INSPECCIONAR:
- ¿Existe el lector físico?
- ¿Hay Windows 10 x64 y Windows 11 x64 disponibles?
- dotnet --version
- ¿Está resuelta la pregunta bloqueante B5 y las verificaciones V1/V2?

TAREA A IMPLEMENTAR: T-7.1 a T-7.6
Los 21 experimentos de POC_PLAN §4, en un proyecto DESECHABLE fuera del monorepo
(poc-uareu4500/).

REGLAS ESPECÍFICAS DE ESTA ETAPA:
- El código de la POC NO se promueve a producción. Es para aprender, no para heredar.
- Se están capturando datos biométricos de PERSONAS REALES en POC-12.
  Usá el texto de consentimiento. Guardá los datos en una base local cifrada.
  DESTRUILOS al terminar, con constancia escrita.
- No inventes resultados. Si un experimento no se pudo ejecutar, decilo.
- No afirmes nada que no hayas medido. Cada fila del informe lleva su evidencia.

ARCHIVOS QUE PODÉS MODIFICAR: poc-uareu4500/** (nuevo, fuera del monorepo),
docs/biometrics/POC_RESULTS.md, docs/biometrics/UAREU_4500_RESEARCH.md
(sólo para pasar [PENDIENTE] a [VERIFICADO] con fecha y evidencia).
ARCHIVOS QUE NO DEBÉS MODIFICAR: todo el resto del monorepo. La POC no toca el
producto.

MIGRACIONES: ninguna en el producto. La POC usa su propia SQLite local cifrada.
TESTS: los 21 experimentos son las pruebas.

COMANDOS A EJECUTAR:
  dotnet --version
  dotnet run --project poc-uareu4500/src/Poc.Console -- poc01
  ... (uno por experimento)

CRITERIOS DE ACEPTACIÓN:
1. Los 21 experimentos ejecutados y registrados en POC_RESULTS.md con evidencia.
2. POC-15: CERO falsas aceptaciones.
3. Veredicto explícito: GO, GO WITH CONDITIONS o NO-GO, según POC_PLAN §6.
4. Cada condición de un GO WITH CONDITIONS convertida en una tarea T-8.x.
5. Los [PENDIENTE] cerrados en la investigación, con fecha y fuente.
6. Datos biométricos de prueba destruidos, con constancia escrita.

CUÁNDO PARAR:
Con el informe terminado. NO empieces la Etapa 8 aunque el veredicto sea GO:
requiere aprobación explícita del usuario.

Si el veredicto es NO-GO, eso es un RESULTADO VÁLIDO, no un fracaso. El producto
se vende sin biometría, que es exactamente por qué la biometría está después del
MVP. Presentá el veredicto con los datos y las alternativas de la pregunta B5.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 25 — M8.1 · Biometría: esquema, cifrado y agentes

```text
Sólo se ejecuta si la POC concluyó GO o GO WITH CONDITIONS y el usuario lo aprobó
explícitamente.

DOCUMENTOS A LEER:
- docs/biometrics/POC_RESULTS.md (tus propios hallazgos)
- docs/DATA_MODEL.md, sección 7
- docs/biometrics/BIOMETRIC_SECURITY.md COMPLETO
- docs/API_CONTRACTS.md, sección 10
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-8.1 y T-8.2

ESTADO A INSPECCIONAR:
- ¿El veredicto de la POC está aprobado por el usuario?
- ¿BIOMETRIC_MATCH_THRESHOLD tiene un valor definido por la POC?

TAREAS: T-8.1 y T-8.2

Migración 0012_biometrics con las 8 entidades + DeviceToken.
Servicio de envelope encryption: DEK por credencial, KEK por tenant,
MASTER_KEK, AES-256-GCM con AAD = gymId || credentialId || keyVersion.
Gestión de agentes: pareo, aprobación, heartbeat, revocación, tokens de dispositivo.
FakeAgent en los tests.

PRESTÁ ATENCIÓN ESPECIAL A:
- unique(gymId, templateHash) where status='ACTIVE' impide que dos socios enrolen
  la misma huella.
- El AAD atado al tenant es lo que hace que un ciphertext movido a otro gymId
  NO se pueda descifrar. Escribí ese test.
- Los deviceToken son de UN SOLO USO, con scope (ENROLL o IDENTIFY) y TTL corto.
  Un token de ENROLL no sirve para identify. Un token atado al socio X no enrola
  al socio Y.
- Un agente recién pareado queda PENDING_APPROVAL y NO puede operar.
- Si cambia el machineFingerprint, el agente vuelve a PENDING_APPROVAL.

ARCHIVOS QUE PODÉS MODIFICAR: packages/db/**, apps/api/src/infra/crypto/**,
apps/api/src/modules/biometrics/**, apps/api/test/support/fake-agent.ts,
packages/contracts/{biometrics,agent}.ts.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, apps/local-agent (todavía no existe),
módulos no relacionados.

MIGRACIONES: pnpm db:migrate (0012).

TESTS A CREAR:
- Los constraints únicos parciales
- Un ciphertext movido a otro gymId FALLA la verificación GCM
- La rotación de KEK re-envuelve sin tocar los templates
- Pareo con secreto válido; secreto ya usado -> 401; secreto de otro gimnasio -> 404
- Agente sin aprobar no opera
- Agente revocado -> 403 inmediato
- Cambio de machineFingerprint -> PENDING_APPROVAL
- Scope de tokens; replay de token -> 401

COMANDOS A EJECUTAR:
  pnpm db:migrate
  pnpm --filter @pulso/api test -- crypto
  pnpm --filter @pulso/api test -- agents

CRITERIOS DE ACEPTACIÓN:
1. El test de AAD por tenant pasa.
2. Un agente no puede operar sin aprobación explícita.
3. Todos los tests de tokens pasan.

CUÁNDO PARAR: con los 3 criterios cumplidos.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 26 — M8.2 · Consentimiento, enrolamiento e identificación

```text
DOCUMENTOS A LEER:
- docs/biometrics/BIOMETRIC_SECURITY.md, secciones 3, 5 y 7
- docs/API_CONTRACTS.md, sección 10
- docs/TEST_STRATEGY.md, sección 8.1 (los 20 tests con FakeAgent)
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-8.3 y T-8.4

TAREAS: T-8.3 y T-8.4
Consentimiento, enrolamiento e identificación 1:N con integración al control
de acceso.

LAS DOS REGLAS QUE DEFINEN ESTE DISEÑO:
1. Sin BiometricConsent vigente, el enrolamiento devuelve 409. La verificación es
   del BACKEND, no un checkbox del frontend.
2. El agente IDENTIFICA, el backend AUTORIZA. La respuesta a
   POST /agent/biometrics/identify es {"resolved": true} y NADA MÁS.
   Ni memberId, ni nombre, ni foto, ni decisión. Los datos del socio viajan al
   NAVEGADOR por el WebSocket del backend.

También:
- La identificación reutiliza la MISMA cadena de autorización de /access/check.
  Un match correcto con membresía vencida DENIEGA.
- El conjunto de candidatos se arma con el gymId del agente autenticado y su
  branchId. Nunca con datos del payload.
- Si dos candidatos superan el umbral y sus scores están cerca, devolvé NO MATCH.
  Un match ambiguo es peor que ningún match.
- Revocar el consentimiento revoca TODAS las credenciales, en la misma transacción.

ARCHIVOS QUE PODÉS MODIFICAR: apps/api/src/modules/biometrics/**,
apps/api/src/modules/access/** (reutilización de la cadena),
packages/contracts/biometrics.ts, packages/db/prisma/seed-data/biometrics.ts.
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/**, apps/local-agent, apps/web.

MIGRACIONES: ninguna.
TESTS A CREAR: los 20 de TEST_STRATEGY §8.1, con FakeAgent. Todos obligatorios.
Los tres más importantes:
- no-pii-to-agent: la respuesta de identify NO contiene ningún campo identificatorio
- identify-revoked: una credencial revocada NO matchea, aunque el template sea idéntico
- consent-revoke-cascade: revocar consentimiento revoca todas las credenciales

COMANDOS A EJECUTAR:
  pnpm --filter @pulso/api test -- biometrics
  k6 run scripts/load/identify.js     # con 2.000 credenciales

CRITERIOS DE ACEPTACIÓN:
1. Los 20 tests con FakeAgent pasan.
2. El test de "no PII al agente" pasa.
3. El p95 de identificación con 2.000 credenciales cumple lo medido en la POC.
4. Un match correcto con membresía vencida DENIEGA y queda registrado.

CUÁNDO PARAR: con los 4 criterios cumplidos.
No construyas el agente real todavía: es el prompt siguiente.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 27 — M8.3 · Agente local real y cliente web

```text
Requiere máquina Windows con el lector conectado.

DOCUMENTOS A LEER:
- docs/biometrics/LOCAL_AGENT_ARCHITECTURE.md COMPLETO
- docs/biometrics/WEBSOCKET_PROTOCOL.md COMPLETO
- docs/biometrics/POC_RESULTS.md (los valores que definió la POC)
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-8.5, T-8.6, T-8.7

TAREAS: T-8.5, T-8.6, T-8.7
- apps/local-agent en C#/.NET 8, FUERA del workspace de pnpm
- Cliente WebSocket en apps/web + UI de biometría
- /settings/devices

REGLAS NO NEGOCIABLES DEL AGENTE:
- Bind EXCLUSIVO a 127.0.0.1. Si no puede, NO ARRANCA. Escribí ese test.
- Origin validado contra allowlist en el handshake.
- Sobre ws:// (sin TLS) sólo se permiten hello, status.get y ping. Nada de
  fallback silencioso a ws para operaciones sensibles.
- El agente NO persiste templates ni imágenes. Los buffers se SOBRESCRIBEN al
  terminar cada operación (en .NET: CryptographicOperations.ZeroMemory o
  equivalente; liberar un byte[] no lo borra).
- El certificado TLS local es ÚNICO POR INSTALACIÓN. Nunca una clave privada
  compartida en el MSI: sería un fallo grave.
- Una sola operación de hardware a la vez.

REGLAS DEL CLIENTE WEB:
- El deviceToken NUNCA se persiste: ni localStorage, ni sessionStorage, ni
  Zustand persistido, ni URL. Escribí el test que inspecciona el storage.
- Todo mensaje entrante se valida con Zod antes de usarse.
- El resultado de la identificación se escucha en el WebSocket DEL BACKEND, no
  en el local.
- Los prompts al usuario se traducen desde CÓDIGOS (PLACE_FINGER, etc.), no
  vienen como texto desde el agente.

ARCHIVOS QUE PODÉS MODIFICAR: apps/local-agent/** (nuevo),
apps/web/lib/agent/**, apps/web/app/(app)/members/[id]/biometrics/**,
apps/web/app/(app)/{access,settings/devices}/**,
packages/contracts/agent-protocol.ts,
docs/biometrics/protocol-fixtures/** (fixtures compartidas).
ARCHIVOS QUE NO DEBÉS MODIFICAR: docs/ (salvo protocol-fixtures/), apps/api.

MIGRACIONES: ninguna.
TESTS A CREAR:
- Unit de la máquina de estados del agente
- Integración con FakeSensor
- FIXTURES COMPARTIDAS: el mismo conjunto de JSON validado en .NET y en
  TypeScript. Si alguien cambia el protocolo de un lado, los dos tests fallan.
- El agente no arranca si no puede bindear a loopback
- El deviceToken no aparece en ningún storage del navegador
- Pruebas manuales con hardware según el checklist de POC-16 a POC-21

COMANDOS A EJECUTAR:
  dotnet test apps/local-agent/Pulso.Agent.sln
  pnpm --filter @pulso/web test -- agent-client
  pnpm test:e2e -- biometrics
  # manual en Windows: enrolar e identificar con el lector real

CRITERIOS DE ACEPTACIÓN:
1. Un enrolamiento completo funciona desde el navegador con hardware real.
2. Una identificación real dispara el acceso correctamente.
3. Las fixtures compartidas pasan en los dos lenguajes.
4. El agente no arranca si no puede bindear sólo a loopback.
5. El deviceToken no está en ningún storage.
6. Desconectar el lector durante una captura no cuelga nada.

CUÁNDO PARAR: con los 6 criterios cumplidos.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompt 28 — M8.4 · Instalador, retención y soporte

```text
DOCUMENTOS A LEER:
- docs/biometrics/INSTALLATION_AND_SUPPORT.md COMPLETO
- docs/biometrics/BIOMETRIC_SECURITY.md, secciones 10 y 13
- docs/DEPLOYMENT_PLAN.md, sección 11
- docs/MASTER_IMPLEMENTATION_PLAN.md, tareas T-8.8 y T-8.9

TAREAS: T-8.8 y T-8.9
- Instalador MSI firmado (WiX), con certificado local único por instalación
- Auto-actualización con verificación de firma y hash, por fases, sólo en idle
- Job de retención biométrica
- Vista de auditoría biométrica
- Los 9 runbooks

PRESTÁ ATENCIÓN ESPECIAL A:
- El MSI NO instala el driver de HID (los derechos de redistribución están
  pendientes de V2). Enlaza a la descarga oficial y verifica que esté presente.
- El certificado local se genera EN LA INSTALACIÓN, único por máquina.
  Distribuir una clave privada compartida sería un fallo grave; escribí el test.
- El job de retención BORRA datos. Corré primero una semana en DRY-RUN,
  registrando qué borraría, antes de activarlo de verdad.
- El desinstalador remueve el certificado y notifica al backend.

ARCHIVOS QUE PODÉS MODIFICAR: apps/local-agent/installer/**,
apps/local-agent/src/Pulso.Agent.Backend/UpdateService.cs,
apps/api/src/modules/biometrics/updates/**,
apps/worker/src/jobs/biometric-retention.ts,
apps/web (vista de auditoría biométrica), docs/ops/runbooks/**.
ARCHIVOS QUE NO DEBÉS MODIFICAR: los 16 documentos de plan.

MIGRACIONES: ninguna.
TESTS A CREAR:
- La instalación es idempotente
- El certificado se instala y se remueve al desinstalar
- El certificado es único por instalación (dos instalaciones -> dos certificados
  distintos)
- Un binario con firma inválida se rechaza
- Rollback automático si la nueva versión no arranca
- La actualización no ocurre durante una operación en curso
- El job de retención borra los templates revocados hace más de 30 días
- El job NO borra los que aún tienen consentimiento vigente
- El job registra el conteo sin contenido

COMANDOS A EJECUTAR:
  # instalación manual en VM limpia de Windows 10 y de Windows 11
  pnpm --filter @pulso/worker test -- retention

CRITERIOS DE ACEPTACIÓN:
1. Instalación completa en una VM limpia en menos de 20 minutos siguiendo la guía.
2. Desinstalación limpia, con el certificado removido.
3. El test de certificado único por instalación pasa.
4. El job de retención corrió una semana en dry-run antes de activarse.
5. Los 9 runbooks escritos y probados con un caso real cada uno.
6. El checklist de BIOMETRIC_SECURITY §13 completo, INCLUIDA la revisión legal (§12).

CUÁNDO PARAR: con los 6 criterios cumplidos.

FIN DE LA ETAPA 8.

Si la revisión legal (§12) no está cerrada, PARÁ y avisá: no se habilita
biometría para un cliente real sin eso.

[+ REGLAS OBLIGATORIAS PARA ESTA SESIÓN]
```

---

## Prompts 29 en adelante — Etapas 9 a 13

Se escriben al comenzar cada etapa, siguiendo el mismo formato. Cada uno debe:

1. Leer el documento de plan de su etapa (que se expande a plantilla completa en ese momento).
2. Inspeccionar el estado real del repositorio.
3. Implementar un vertical completo, no una capa.
4. Incluir el test de concurrencia de su dominio (cupo, stock, puntos).
5. Terminar con la Definition of Done de etapa y esperar aprobación.

| Etapa | Prompts previstos |
|---|---|
| 9 — Reservas | 3: esquema y cronograma · reservas y control de cupo · calendario y pantallas |
| 10 — POS | 3: esquema y CRUD · venta con caja y stock · anulación y concurrencia |
| 11 — Rutinas | 3: instructores · ejercicios y rutinas · panel de instructor |
| 12 — Fidelización | 2: configuración y ledger · acreditación, vencimiento y canje |
| 13 — ARCA / IA / plataforma | 5: ARCA config · emisión · estadísticas avanzadas · asistente · administración global + RLS |

---

## Tabla de control

Para llevar registro del avance.

| # | Prompt | Etapa | Milestone | Estado | Fecha | Aprobado |
|---|---|---|---|---|---|---|
| 00 | Preparación (usuario) | 0 | — | pendiente | | |
| 01 | Repositorio y documentación | 0 | M0.1 | pendiente | | |
| 02 | Monorepo y servicios locales | 1 | M1.1 | pendiente | | |
| 03 | apps/api con health | 1 | M1.2a | pendiente | | |
| 04 | Prisma y test de integración | 1 | M1.2b | pendiente | | |
| 05 | apps/web, ui y worker | 1 | M1.2c | pendiente | | |
| 06 | CI | 1 | M1.3 | pendiente | | |
| 07 | Esquema de tenancy e IAM | 2 | M2.1a | pendiente | | |
| 08 | Autenticación | 2 | M2.1b | pendiente | | |
| 09 | Tenant, extensión de Prisma y RBAC | 2 | M2.1c | pendiente | | |
| 10 | Auditoría, idempotencia y outbox | 2 | M2.1d | pendiente | | |
| 11 | Login y AppShell | 2 | M2.2a | pendiente | | |
| 12 | Sedes, usuarios y cross-tenant | 2 | M2.2b | pendiente | | |
| 13 | Seed base | 2 | M2.2c | pendiente | | |
| 14 | Socios | 3 | M3.1 | pendiente | | |
| 15 | Catálogo y membresías | 3 | M3.2 | pendiente | | |
| 16 | Alta, ficha y deudores | 3 | M3.3 | pendiente | | |
| 17 | Archivos y seed ampliado | 3 | M3.4 | pendiente | | |
| 18 | Caja: esquema y sesiones | 4 | M4.1 | pendiente | | |
| 19 | Movimientos, cobros y reversas | 4 | M4.2 | pendiente | | |
| 20 | Frontend de caja | 4 | M4.3 | pendiente | | |
| 21 | Acceso y asistencias | 5 | M5.1 | pendiente | | |
| 22 | Mensajería | 6 | M6.1 | pendiente | | |
| 23 | Reportes y cierre del MVP | 6 | M6.2 | pendiente | | |
| 24 | POC del U.are.U 4500 | 7 | M7 | pendiente | | |
| 25 | Biometría: esquema y agentes | 8 | M8.1 | pendiente | | |
| 26 | Consentimiento e identificación | 8 | M8.2 | pendiente | | |
| 27 | Agente local y cliente web | 8 | M8.3 | pendiente | | |
| 28 | Instalador, retención y soporte | 8 | M8.4 | pendiente | | |
