# Architecture Decision Records — Pulso CRM

Fecha: 2026-08-09
Estado del documento: propuesto, pendiente de aprobación del usuario.

Formato de cada ADR: Decisión / Motivo / Alternativas evaluadas / Alternativa descartada y por qué / Trade-off / Consecuencia.

Estados posibles: `PROPUESTO`, `ACEPTADO`, `BLOQUEADO`, `SUPERSEDED`.

---

## ADR-000 — Nombre de trabajo del producto: "Pulso"

**Estado:** PROPUESTO
**Decisión.** El producto se llama **Pulso** en código, paquetes (`@pulso/*`), esquemas y documentación, hasta que exista una decisión de marca.
**Motivo.** El brief prohíbe usar marca, logo, copy y trade dress del producto auditado. Necesitamos un identificador propio desde el commit 1 para no arrastrar nombres ajenos en paquetes, tablas y variables.
**Alternativas evaluadas.** (a) Nombre genérico `gym-crm`. (b) Nombre definitivo desde ya. (c) Nombre de trabajo provisional.
**Descartada.** (b): elegir marca definitiva requiere búsqueda de antecedentes en INPI y disponibilidad de dominio; no es una decisión de arquitectura y bloquearía el arranque.
**Trade-off.** Un rename posterior toca scopes npm, nombre de repo y `package.json`. Es mecánico y barato si se hace antes de tener clientes.
**Consecuencia.** Todo identificador propio usa `pulso`. **Ningún identificador copia nombres del producto auditado** (`idcliente`, `sedes`, `servicios`, `suscripciones`, puerto `17890`).

---

## ADR-001 — Repositorio nuevo e independiente, fuera de `N8N AUTOMATIZACIONES`

**Estado:** PROPUESTO — requiere confirmación (Pregunta bloqueante B1)
**Decisión.** El CRM vive en un repositorio git **nuevo y separado**, propuesto en `~/Documents/pulso-crm`. No se inicializa dentro del repo actual `~/Documents/N8N AUTOMATIZACIONES`.
**Motivo.** Hechos comprobados: ese repo tiene **0 commits**, contiene proyectos sin relación entre sí (`n8n-local`, `oeste-distribuidora`, `cv`, `workflows`, `tmp`, `.playwright-mcp`) y ~100% del árbol sin trackear, incluyendo `.env` reales y un `.venv`. Meter un SaaS multi-tenant ahí mezcla historiales, CI, `.gitignore` y superficie de secretos.
**Alternativas evaluadas.** (a) Repo nuevo separado. (b) Subcarpeta `controlfit-audit/app/` en el repo actual. (c) Repo anidado dentro del actual.
**Descartada.** (b) hereda el desorden y ata el CI del CRM a un repo de automatizaciones n8n. (c) los repos git anidados son una fuente conocida de pérdida de trabajo.
**Trade-off.** Los documentos de auditoría y de plan quedan en un repo distinto al código. Se resuelve copiando `docs/` al repo nuevo en la tarea T-0.2 y dejando los originales intactos.
**Consecuencia.** La auditoría **no se mueve ni se borra**. El repo nuevo arranca con su propio `.gitignore`, su CI y su historial limpio.

---

## ADR-002 — Monorepo con pnpm workspaces + Turborepo

**Estado:** PROPUESTO
**Decisión.** Monorepo único con `pnpm` workspaces y Turborepo para orquestación de tareas y caché.
**Motivo.** Frontend, backend, worker y paquetes de contratos comparten tipos. Un solo `pnpm install`, un solo pipeline, tipos compartidos sin publicar a npm. Hecho comprobado: `pnpm 10.33.2` ya está instalado en la máquina.
**Alternativas evaluadas.** (a) pnpm + Turborepo. (b) pnpm workspaces sin Turborepo. (c) Nx. (d) Polirepo.
**Descartada.** (d) polirepo: obliga a versionar y publicar el paquete de contratos para cada cambio de API; es fricción pura con un solo equipo. (c) Nx: más potente pero con más superficie conceptual de la que este proyecto necesita.
**Trade-off.** Turborepo agrega configuración y una caché que hay que entender cuando "no rebuildea".
**Consecuencia.** `apps/` y `packages/` según `ARCHITECTURE.md`. El agente local (.NET) vive en el mismo repo pero **fuera** del workspace de pnpm.

---

## ADR-003 — Backend: NestJS como monolito modular

**Estado:** ACEPTADO (resuelve contradicción entre documentos)
**Decisión.** El backend es una aplicación **NestJS** independiente, organizada como monolito modular por bounded context.
**Motivo.** `CRM_GIMNASIO_ROADMAP.md` deja abierta la opción "Next.js API routes o NestJS separado"; el brief del usuario exige NestJS. Además el dominio lo pide: transacciones multi-tabla de caja, jobs en background, WebSocket con estado, guards de permisos reutilizables e inyección de dependencias para testear servicios sin HTTP. Las API routes de Next en serverless son un mal encaje para conexiones WebSocket persistentes y para transacciones largas.
**Alternativas evaluadas.** (a) NestJS separado. (b) Next.js fullstack (route handlers). (c) Fastify + estructura manual.
**Descartada.** (b): acelera un MVP pero obliga a migrar exactamente cuando el producto empieza a vender — el peor momento. El brief pide "producto vendible serio". (c): más liviano, pero habría que construir a mano lo que Nest ya resuelve (DI, guards, interceptores, validación, módulos).
**Trade-off.** Dos procesos que levantar en local en vez de uno. Más ceremonia inicial.
**Consecuencia.** El frontend Next.js **no tiene lógica de negocio**; sólo BFF de sesión (proxy de cookies) donde haga falta. Contradicción del roadmap resuelta y registrada.

---

## ADR-004 — Frontend: Next.js App Router + TypeScript

**Estado:** PROPUESTO
**Decisión.** `apps/web` con Next.js (App Router) y TypeScript en modo `strict`.
**Motivo.** Está en el brief y en el roadmap; el usuario ya lo usa en `oeste-distribuidora` (Next 16, React 19, TS 5.9 strict). Reutiliza convenciones que ya conoce.
**Alternativas evaluadas.** (a) Next App Router. (b) Vite + React Router. (c) Remix.
**Descartada.** (b) pierde SSR y el despliegue trivial en Vercel que el brief pide.
**Trade-off.** El App Router mezcla Server y Client Components; hay que ser disciplinado sobre dónde vive el estado.
**Consecuencia.** Se fija una regla dura: **todo dato del negocio se consume vía TanStack Query desde Client Components contra la API de Nest.** No se hace fetch de dominio desde Server Components en el MVP, para tener una sola ruta de auth y de manejo de errores.

---

## ADR-005 — UI: Tailwind CSS + shadcn/ui con identidad visual propia

**Estado:** PROPUESTO
**Decisión.** Tailwind + shadcn/ui, con design tokens propios en `packages/ui`.
**Motivo.** shadcn/ui copia el código de los componentes al repo: no hay dependencia de un design system ajeno y podemos divergir sin pelearnos con un theme. El usuario ya usa Tailwind 4 en `oeste-distribuidora`. Cumple el requisito de no reproducir trade dress ajeno.
**Alternativas evaluadas.** (a) Tailwind + shadcn/ui. (b) Material UI. (c) Mantine.
**Descartada.** (b) MUI: es exactamente lo que usa el producto auditado; usar MUI con la misma densidad de panel oscuro es el camino más corto a un parecido visual que el brief prohíbe. Además el theming de MUI es más rígido para una identidad propia.
**Trade-off.** shadcn/ui exige construir más componentes de datos (tabla densa, filtros) que MUI trae con `DataGrid`.
**Consecuencia.** `packages/ui` define paleta, tipografía, radios y sombras **propias**. Prohibido copiar capturas, colores o textos del producto auditado.

---

## ADR-006 — PostgreSQL + Prisma

**Estado:** PROPUESTO
**Decisión.** PostgreSQL 16 como única base operativa. Prisma como ORM y motor de migraciones.
**Motivo.** El dominio es relacional y con integridad crítica (caja, membresías, stock). Necesitamos constraints reales, transacciones y `numeric`. Hecho comprobado: PostgreSQL 16.14 ya está instalado en la máquina. Prisma da migraciones versionadas y tipos generados que alimentan los contratos.
**Alternativas evaluadas.** (a) Prisma. (b) Drizzle. (c) TypeORM.
**Descartada.** (b) Drizzle es excelente y más cercano al SQL, pero Prisma tiene mejor tooling de migraciones para un equipo chico y `Prisma.Decimal` resuelve el requisito de dinero sin trabajo extra. (c) TypeORM: historial de migraciones frágil.
**Trade-off.** Prisma añade una capa de generación y su cliente pesa. Para SQL avanzado (reportes) se usa `$queryRaw` tipado.
**Consecuencia.** Ningún `float` en dinero. Todo importe es `Decimal(14,2)`. **Ninguna base NoSQL en el camino crítico.** No se usa Firebase (el producto auditado lo usa para realtime; nosotros usamos Socket.IO — ver ADR-011).

---

## ADR-007 — Autenticación: cookies httpOnly + access/refresh con rotación

**Estado:** PROPUESTO
**Decisión.** Sesión con dos cookies `httpOnly`, `SameSite=Lax`, `Secure` en producción, `Path` acotado: `pulso_at` (access token JWT, ~15 min) y `pulso_rt` (refresh token opaco, ~30 días, **rotativo con detección de reuso**). Contraseñas con **argon2id**. CSRF por double-submit token en mutaciones.
**Motivo.** El hallazgo de la auditoría es explícito: el producto auditado persiste el token en un store `auth-storage`; si eso queda en `localStorage`, un XSS roba la sesión. Es el riesgo que no queremos heredar.
**Alternativas evaluadas.** (a) Cookies httpOnly + refresh rotativo. (b) JWT en memoria + refresh en cookie. (c) Sesiones server-side en Redis.
**Descartada.** (b): sigue exponiendo el access token a JS y complica el flujo entre pestañas. (c) es defendible y más fácil de revocar, pero agrega un round-trip a Redis en cada request; se deja como evolución si hace falta revocación instantánea masiva.
**Trade-off.** Cookies obligan a manejar CORS con credenciales y CSRF explícito. Requiere que web y API compartan dominio padre en producción.
**Consecuencia.** El frontend **nunca** ve ni guarda el token. `packages/contracts` no expone tipos de token. La rotación con detección de reuso invalida toda la familia de refresh tokens ante un replay.

---

## ADR-008 — El tenant sale de la sesión, nunca del cliente

**Estado:** ACEPTADO (requisito duro del brief)
**Decisión.** `gymId` y el conjunto de `branchId` permitidos se derivan **exclusivamente** del token de sesión validado en el servidor. Se prohíbe leer el tenant de headers (`x-idcliente` o equivalente), de query params o del body. Un `branchId` que llegue del cliente se **valida contra la sesión**; nunca la sustituye.
**Motivo.** Hallazgo directo de la auditoría: el frontend auditado envía `x-idcliente` con el `idGym` tomado de un store del cliente. Si el backend confía en ese header, cambiar un valor en el navegador cruza tenants.
**Alternativas evaluadas.** (a) Tenant desde la sesión + filtro forzado en la capa de datos. (b) Row Level Security de PostgreSQL con `SET LOCAL app.gym_id`. (c) Base por tenant.
**Descartada.** (c) por costo operativo con muchos gimnasios chicos. (b) **no se descarta, se difiere**: es una segunda línea de defensa excelente, pero encarece el MVP y Prisma requiere trabajo extra con RLS. Se planifica como endurecimiento posterior (ver ADR-009).
**Trade-off.** Sin RLS, un `where` olvidado es un cross-tenant. Se mitiga con una extensión de Prisma que inyecta `gymId` y con tests automáticos obligatorios.
**Consecuencia.** Toda tabla operativa lleva `gymId`. Todo índice único de negocio es **compuesto con `gymId`**. Existe una suite `test/tenancy/` que, por cada endpoint, prueba acceso cruzado y espera `404`, no `403` (no revelar existencia).

---

## ADR-009 — Aislamiento en dos capas: extensión de Prisma ahora, RLS después

**Estado:** PROPUESTO
**Decisión.** Capa 1 (MVP): un `PrismaService` con contexto de request (AsyncLocalStorage) y una extensión de cliente que agrega `gymId` a todo `where`, `create` y `update` de modelos marcados como tenant-scoped. Capa 2 (post-MVP, Etapa 13): Row Level Security en PostgreSQL.
**Motivo.** Cumple el requisito de aislamiento desde el día 1 sin frenar el MVP, y deja el camino abierto a defensa en profundidad.
**Alternativas evaluadas.** (a) Sólo `where` manual con revisión de código. (b) Extensión de Prisma. (c) RLS desde el inicio.
**Descartada.** (a) depende de que nadie se olvide nunca; inaceptable para datos de otro cliente.
**Trade-off.** La extensión es magia implícita: hay que documentarla bien y proveer un escape hatch explícito (`prisma.unscoped()`) para jobs de plataforma, con auditoría de cada uso.
**Consecuencia.** Los modelos globales (planes SaaS, feature flags, catálogo base de ejercicios) se declaran explícitamente fuera del scope.

---

## ADR-010 — Dinero: `Decimal(14,2)`, movimientos inmutables, corrección por reversa

**Estado:** ACEPTADO (requisito duro del brief)
**Decisión.** Todo importe es `Decimal(14,2)` en base y `Prisma.Decimal` en código. En la API viaja como **string decimal** (`"12345.67"`), nunca como `number`. Los movimientos de caja y los asientos de cuenta corriente son **append-only**: no se editan ni se borran; se corrigen emitiendo un movimiento de reversa que apunta al original.
**Motivo.** Requisito del brief. Además, JSON `number` es IEEE-754 y pierde centavos; serializar Decimal como número reintroduce el bug que la columna evita.
**Alternativas evaluadas.** (a) `Decimal(14,2)`. (b) Enteros en centavos. (c) `float`.
**Descartada.** (c) prohibido por el brief y por sentido común. (b) es correcto pero obliga a convertir en cada borde y complica reportes SQL; `numeric` de Postgres ya es exacto.
**Trade-off.** Hay que interceptar la serialización para que Nest no convierta `Decimal` a `number`.
**Consecuencia.** Un interceptor global serializa `Decimal` a string. Zod valida importes como string con patrón `^-?\d{1,12}(\.\d{1,2})?$`. Las operaciones compuestas (cobrar cuota = movimiento de caja + asiento de cuenta corriente + actualización de membresía + evento de mensajería) van en **una sola transacción** con nivel `Serializable` cuando tocan saldos.

---

## ADR-011 — Realtime: Socket.IO dentro de la API. Sin Firebase.

**Estado:** PROPUESTO
**Decisión.** Un gateway Socket.IO montado en la app de NestJS, con adapter Redis para escalar horizontalmente. Namespaces por gimnasio y rooms por sede.
**Motivo.** El producto auditado usa Firebase Realtime Database desde el cliente, lo que expone la URL de la base y hace que toda la seguridad dependa de reglas de Firebase correctas — riesgo señalado en la auditoría. Con Socket.IO en la propia API reutilizamos la misma sesión, los mismos guards y el mismo modelo de permisos.
**Alternativas evaluadas.** (a) Socket.IO en la API. (b) Firebase RTDB. (c) SSE. (d) Servicio de realtime aparte.
**Descartada.** (b) por el riesgo anterior y por meter un segundo modelo de autorización. (d) microservicio innecesario, prohibido por el brief.
**Trade-off.** La API deja de ser stateless pura; el despliegue necesita sticky sessions o el adapter de Redis (usamos el adapter).
**Consecuencia.** Un solo canal de eventos para acceso, caja, notificaciones y estado del agente local.

---

## ADR-012 — Jobs: Redis + BullMQ en un worker separado

**Estado:** PROPUESTO
**Decisión.** `apps/worker` como proceso Node aparte que consume colas BullMQ. La API sólo **encola**; no procesa jobs en el request.
**Motivo.** WhatsApp, vencimientos de membresía, cálculo semanal de puntos, expiración de puntos, facturación y reintentos no pueden depender del ciclo de vida de un request HTTP ni bloquear a un recepcionista.
**Alternativas evaluadas.** (a) Worker separado con BullMQ. (b) Jobs in-process en la API (`@nestjs/schedule`). (c) pg-boss sobre Postgres.
**Descartada.** (b) un pico de mensajería degradaría la caja. (c) evitaría Redis, pero ya necesitamos Redis para el adapter de Socket.IO y rate limiting.
**Trade-off.** Un proceso más que desplegar y observar.
**Consecuencia.** El worker comparte `packages/db` y `packages/contracts` con la API. Todo job es **idempotente** y lleva `jobKey` único. Los eventos de dominio salen por patrón **outbox** (tabla `OutboxEvent`) para no perder mensajes si Redis cae entre el commit y el encolado.

---

## ADR-013 — Contratos tipados con Zod compartido, no tRPC

**Estado:** PROPUESTO
**Decisión.** `packages/contracts` contiene esquemas **Zod** de request/response por endpoint, más los tipos inferidos. La API los usa en `ZodValidationPipe`; el frontend los usa en formularios (`react-hook-form` + `zodResolver`) y para tipar TanStack Query. Se genera OpenAPI desde los mismos esquemas.
**Motivo.** Una única fuente de verdad de la forma de los datos, sin acoplar el transporte. El brief pide "contratos y validación tipada".
**Alternativas evaluadas.** (a) Zod compartido + REST + OpenAPI. (b) tRPC. (c) OpenAPI-first con generación de cliente.
**Descartada.** (b) tRPC acopla fuerte cliente y servidor TypeScript; el **agente local en .NET** y una futura app móvil necesitan una API HTTP descriptible. (c) invierte el flujo y agrega un paso de codegen en cada cambio.
**Trade-off.** REST + Zod requiere disciplina para que el contrato no se desincronice del controller. Se mitiga con tests de contrato que validan respuestas reales contra el esquema.
**Consecuencia.** La API es REST versionada bajo `/api/v1`. Se publica OpenAPI en `/api/docs` (protegido fuera de desarrollo).

---

## ADR-014 — Almacenamiento biométrico: templates cifrados, matching centralizado (Alternativa B)

**Estado:** PROPUESTO — depende de la POC
**Decisión.** Se guardan **templates de minucias cifrados** (AES-256-GCM con envelope encryption) en PostgreSQL, y el **matching 1:N corre en el backend**. Nunca se almacena la imagen de la huella como mecanismo de identificación.

**Motivo — por qué la Alternativa A queda descartada por hardware.** El brief pedía comparar "templates cifrados y matching local" contra "templates cifrados y matching centralizado". La investigación (`UAREU_4500_RESEARCH.md` §1) muestra que el U.are.U 4500 es un sensor que entrega imagen 512 dpi por USB: **no tiene almacenamiento de templates ni matcher on-device**. La variante "template dentro del dispositivo" que propone `CRM_GIMNASIO_ROADMAP.md` no es implementable con este hardware. Lo que quedaba realmente en discusión era *dónde corre el matcher*: en la PC de recepción o en el servidor.

**Evaluación pedida por el brief:**

| Criterio | Matching local (en el agente) | Matching centralizado (backend) |
|---|---|---|
| Seguridad | Los templates del padrón viven en cada PC de recepción — más copias, más superficie | Los templates viven sólo en el servidor cifrados; el agente sólo ve el template de la huella presentada en ese instante |
| Offline | Funciona sin internet | Requiere conexión; degrada a acceso por DNI |
| Multi-sede | Cada sede necesita su subconjunto sincronizado | Natural: una sola fuente |
| Sincronización | Problema real y permanente (altas, bajas, revocaciones) | No existe |
| Latencia | Menor (sin round-trip) | +30–120 ms de red; aceptable en recepción |
| Escalabilidad | Limitada por la PC de recepción | Limitada por el servidor, escalable |
| Revocación | Diferida hasta la próxima sync — **una huella revocada puede seguir abriendo la puerta** | Inmediata |
| Recuperación | Rearmar caché en cada PC | Backup del servidor |
| Rotación de claves | Hay que rotar en N PCs | Se rota en un lugar |
| Exposición | Alta: PC de recepción, físicamente accesible, sin disco cifrado garantizado | Baja |
| Volumen esperado | Gimnasio típico: cientos a ~2.000 socios por sede | 1:N sobre ese volumen es perfectamente manejable en servidor |

**Descartada.** Matching local como mecanismo primario: la revocación diferida es inaceptable para un dato biométrico, y replicar el padrón de huellas en cada PC de recepción multiplica el impacto de un robo de equipo.
**Trade-off aceptado.** Sin internet no hay acceso por huella. Se mitiga: el acceso por DNI/tarjeta sigue funcionando y la recepción tiene un modo manual explícito y auditado.
**Consecuencia.** El agente local **nunca decide** si alguien entra. Envía el template capturado; el backend identifica y **además** autoriza (membresía vigente, sede, clases). Ver `BIOMETRIC_SECURITY.md`. Una caché local cifrada para modo degradado queda fuera del MVP y se evaluará en la Etapa 8 con requisitos explícitos de TTL y revocación.

---

## ADR-015 — Agente local propio en C# / .NET, no el stack JS de HID

**Estado:** PROPUESTO — depende de V1/V5 de la investigación
**Decisión.** `apps/local-agent`: aplicación Windows propia en **C# / .NET 8**, ejecutable como servicio o desde la bandeja del sistema, que expone un WebSocket **sólo en loopback, puerto 21987**, con protocolo propio versionado.
**Motivo.** El stack oficial de HID para navegador (`@digitalpersona/devices` + `WebSdk` + DigitalPersona Agent) **sólo captura y no hace matching** — lo dice la FAQ de HID. La identificación de socio en recepción es 1:N por definición. Además ese stack está pensado para autenticar contra DigitalPersona Identity Server, no contra nuestro backend, y su redistribución al cliente final está `[PENDIENTE]`.
**Alternativas evaluadas.** (a) Agente propio en C#/.NET. (b) Stack JS oficial de HID. (c) Agente en Node + Tauri. (d) Agente en Electron.
**Descartada.** (b) por lo anterior; queda como **contingencia de captura** si el agente propio no logra acceso al sensor. (c)/(d): el SDK del lector es nativo Windows con binding primario a .NET/C++; hacerlo desde Node agrega una capa de interop frágil y un runtime pesado en la PC de recepción.
**Trade-off.** Hay que aprender/mantener .NET y firmar un instalador Windows. Hecho comprobado: **.NET no está instalado en la máquina de desarrollo**; instalarlo es una tarea explícita de la Etapa 7 (T-7.1).
**Consecuencia.** El agente vive en el monorepo pero fuera del workspace pnpm, con su propio pipeline de build. Puerto 21987: **no** 52181 (agente de HID) ni 17890 (producto auditado).

---

## ADR-016 — Idempotencia obligatoria en toda operación con efecto de dinero o de mensajería

**Estado:** PROPUESTO
**Decisión.** Los endpoints que mueven dinero, generan deuda, envían mensajes o registran asistencia aceptan `Idempotency-Key`. Existe una tabla `IdempotencyKey (gymId, key, endpoint, requestHash, responseSnapshot, status)` con unique `(gymId, key)`. Repetir la misma clave con el mismo cuerpo devuelve la respuesta original; con cuerpo distinto devuelve `409`.
**Motivo.** Requisito del brief. Un recepcionista con internet lento hace doble click; un webhook de WhatsApp se reintenta; un job se re-encola.
**Alternativas evaluadas.** (a) Tabla de idempotencia. (b) Constraints únicos naturales por operación. (c) Nada.
**Descartada.** (c) inaceptable. (b) se usa **además**, no en lugar de: unique parcial de asistencia por ventana de tiempo, unique de venta por `saleNumber`, etc.
**Trade-off.** Una escritura extra por operación y una tarea de limpieza (TTL 7 días).
**Consecuencia.** El frontend genera un UUID por intento de operación y lo reusa en los reintentos de esa misma operación.

---

## ADR-017 — Auditoría append-only desde el día 1

**Estado:** PROPUESTO
**Decisión.** Tabla `AuditEvent` inmutable con `gymId`, `branchId`, `actorUserId`, `action`, `entityType`, `entityId`, `before`/`after` (JSONB con campos sensibles enmascarados), `ip`, `userAgent`, `requestId`, `occurredAt`. Sin `UPDATE` ni `DELETE` (revocado a nivel de rol de base).
**Motivo.** El brief lo exige y la auditoría lo señala como carencia: hoy no se ve quién cambió una membresía, anuló un movimiento o mandó un broadcast.
**Alternativas evaluadas.** (a) Tabla de auditoría propia. (b) Triggers de Postgres. (c) Sólo logs estructurados.
**Descartada.** (c) los logs rotan y no son consultables desde la UI. (b) es robusto pero pierde el contexto de quién hizo la acción a nivel HTTP.
**Trade-off.** Crecimiento de la tabla. Se particiona por mes a partir de la Etapa 13.
**Consecuencia.** Un interceptor de Nest audita automáticamente las mutaciones marcadas con `@Audited()`. **Ninguna operación de caja, membresía, biometría, facturación o mensajería masiva puede quedar sin evento.**

---

## ADR-018 — Enmascaramiento de documento por defecto

**Estado:** PROPUESTO
**Decisión.** El número de documento se devuelve enmascarado (`**.**7.123`) salvo que el rol tenga el permiso `member:read_document`. Rankings, exportaciones y estadísticas nunca lo devuelven completo.
**Motivo.** Hallazgo de la auditoría: el ranking de estadísticas del producto auditado muestra DNI completos.
**Alternativas evaluadas.** (a) Enmascarar por defecto. (b) Mostrar siempre a usuarios autenticados.
**Descartada.** (b): un empleado con acceso a estadísticas no necesita el padrón de documentos del gimnasio.
**Trade-off.** El buscador de acceso necesita el documento completo; se resuelve buscando por hash/igualdad exacta en el backend sin devolver el valor.
**Consecuencia.** El enmascaramiento ocurre en un serializador del backend, **no en el frontend**.

---

## ADR-019 — Despliegue: web en Vercel, resto fuera de Vercel

**Estado:** PROPUESTO
**Decisión.** `apps/web` en Vercel. `apps/api`, `apps/worker`, Redis y PostgreSQL en un proveedor con procesos persistentes (Railway como opción por defecto; Fly.io o Render como alternativas). Archivos en S3 compatible (Cloudflare R2 por costo de egreso).
**Motivo.** Está en el brief. Además, el WebSocket con estado y los workers de larga duración no encajan en funciones serverless.
**Alternativas evaluadas.** (a) Vercel + Railway. (b) Todo en un VPS con Docker Compose. (c) Todo en Vercel.
**Descartada.** (c) por el WebSocket y los jobs. (b) es más barato y perfectamente válido; se documenta como alternativa para cuando el volumen lo justifique.
**Trade-off.** Dos proveedores, dos consolas, CORS y cookies cross-subdomain.
**Consecuencia.** Producción usa `app.<dominio>` y `api.<dominio>` bajo el mismo dominio padre, para que las cookies `httpOnly` funcionen con `SameSite=Lax`.

---

## ADR-020 — Desarrollo local sin depender de Docker

**Estado:** PROPUESTO
**Decisión.** Se provee `docker-compose.yml` **y** un camino nativo con Homebrew. `pnpm dev:services` detecta cuál está disponible.
**Motivo.** Hecho comprobado: **Docker no está instalado en esta máquina**; PostgreSQL 16.14 sí lo está (Homebrew). Un plan que arranca con `docker compose up` falla en la primera tarea.
**Alternativas evaluadas.** (a) Docker obligatorio. (b) Nativo obligatorio. (c) Ambos con detección.
**Descartada.** (a) rompe hoy. (b) rompe la reproducibilidad en CI y en otra máquina.
**Trade-off.** Dos caminos que mantener y documentar.
**Consecuencia.** Falta **Redis** en la máquina: instalarlo (`brew install redis`) es parte de T-1.4. CI usa siempre contenedores de servicio.

---

## ADR-021 — Zona horaria y fechas

**Estado:** PROPUESTO
**Decisión.** Todo instante se guarda en `timestamptz` en UTC. Cada `Branch` tiene su `timezone` IANA (por defecto `America/Argentina/Buenos_Aires`). Los cortes de negocio con semántica de día (cierre de caja, asistencia diaria, objetivo semanal de puntos, vencimiento de membresía) se calculan **en la zona de la sede**, no del servidor ni del navegador. Las fechas sin hora (vencimiento de membresía, fecha de reserva) son `date`.
**Motivo.** Un gimnasio que cierra a las 23:00 en Buenos Aires no puede tener el corte de caja a las 21:00 por UTC. Multi-sede permite sedes en zonas distintas.
**Alternativas evaluadas.** (a) UTC + timezone por sede. (b) Todo en hora local del servidor. (c) `timestamp` sin zona.
**Descartada.** (b)/(c): rompen con dos sedes o con un cambio de servidor.
**Trade-off.** Toda consulta de reporte necesita conversión explícita.
**Consecuencia.** Una utilidad única `packages/config/time.ts` (y su equivalente SQL) hace las conversiones. Prohibido usar `new Date()` para lógica de corte de día sin pasar por ella.

---

## ADR-022 — Feature flags por plan SaaS, evaluadas en el backend

**Estado:** PROPUESTO
**Decisión.** El plan SaaS de cada gimnasio habilita módulos (`access_control`, `reservations`, `pos`, `whatsapp`, `loyalty`, `routines`, `billing`, `biometrics`, `ai`). El frontend **oculta** lo deshabilitado; el backend **rechaza** con `403 FEATURE_NOT_ENABLED`.
**Motivo.** El patrón está confirmado en la auditoría (`featureKey` en la configuración de navegación) y es lo que permite vender por planes.
**Alternativas evaluadas.** (a) Flags por plan en backend + frontend. (b) Sólo frontend. (c) Servicio externo de flags.
**Descartada.** (b) ocultar un menú no es seguridad. (c) innecesario.
**Trade-off.** Un guard más en cada módulo.
**Consecuencia.** `@RequiresFeature('pos')` junto a `@RequiresPermission(...)`. Las features se cachean por gimnasio en Redis con invalidación por evento.

---

## ADR-023 — Estrategia de tests: pirámide con base en integración sobre Postgres real

**Estado:** PROPUESTO
**Decisión.** Unit (Vitest) para reglas puras; **integración contra PostgreSQL real** (esquema efímero por archivo de test) para servicios y repositorios; contrato (respuesta real validada contra Zod); componentes (Testing Library); E2E (Playwright) para los 6 flujos críticos.
**Motivo.** El valor está en las transacciones, constraints y aislamiento de tenant — cosas que un mock no verifica. Mockear Prisma daría tests verdes con integridad rota.
**Alternativas evaluadas.** (a) Integración con Postgres real. (b) Mock de Prisma. (c) SQLite en memoria.
**Descartada.** (b) no prueba constraints ni transacciones. (c) SQLite no tiene `numeric` con la misma semántica, ni niveles de aislamiento comparables, ni los índices parciales que usamos.
**Trade-off.** Tests más lentos y CI que necesita un servicio Postgres.
**Consecuencia.** Prohibido desactivar o `skip`ear un test para hacer pasar el pipeline. Ver `TEST_STRATEGY.md`.

---

## Registro de contradicciones entre documentos

| # | Contradicción | Impacto | Resolución |
|---|---|---|---|
| C1 | El roadmap propone "guardar template dentro del dispositivo" como mejor opción; el hardware confirmado no lo permite. | Alto: invalida el diseño biométrico propuesto. | **ADR-014.** Templates cifrados en base + matching centralizado. |
| C2 | El roadmap deja abierto "Next.js API routes o NestJS"; el brief exige NestJS. | Medio: define toda la estructura del repo. | **ADR-003.** NestJS. |
| C3 | El roadmap sugiere "Material UI o shadcn/ui"; MUI es lo que usa el producto auditado y el brief prohíbe trade dress identificable. | Medio: riesgo legal/de percepción. | **ADR-005.** Tailwind + shadcn/ui con tokens propios. |
| C4 | El roadmap lista Firebase RTDB como parte de la arquitectura observada; el brief pide WebSocket/Socket.IO. | Bajo. | **ADR-011.** Socket.IO, sin Firebase. |
| C5 | El roadmap ordena la fase de huella como Fase 4 (antes de reservas y POS); el brief la pone en Etapas 7–8, después del MVP vendible. | Medio: orden de construcción. | Se sigue **el brief**. La biometría depende de una POC con hardware y no debe bloquear un MVP vendible. |
| C6 | El roadmap estima "sesiones" por fase; el brief prohíbe estimaciones artificiales. | Bajo. | Se eliminan las estimaciones. El avance se mide por Definition of Done. |
| C7 | El brief menciona un tercer documento (`Markdown(1).md pegado`) que **no fue adjuntado ni existe en el repositorio**. | Desconocido. | **Pregunta bloqueante B0.** Se planifica sin él; si aporta requisitos nuevos, se revisa el plan antes de la Etapa 1. |
