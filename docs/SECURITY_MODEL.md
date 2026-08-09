# Modelo de seguridad — Pulso CRM

Fecha: 2026-08-09
Estado: propuesto.

Este documento define controles concretos, no principios generales. Cada control indica **dónde se implementa** y **qué test lo verifica**.

## 1. Modelo de amenazas resumido

| Actor | Capacidad | Riesgo principal |
|---|---|---|
| Empleado del gimnasio | Sesión legítima con permisos acotados | Escalada de privilegios; exfiltración del padrón; manipulación de caja |
| Ex empleado | Credenciales que pueden no haberse revocado | Acceso persistente |
| Otro gimnasio (otro tenant) | Sesión legítima en su propio tenant | **Cross-tenant: el riesgo más grave del producto** |
| Atacante externo sin sesión | Internet | Fuerza bruta de login; enumeración de usuarios; endpoints sin auth |
| Atacante con XSS | Ejecución de JS en la sesión de un usuario | Robo de sesión; acciones en nombre del usuario |
| Atacante con acceso físico a la PC de recepción | Consola local | Robo de templates biométricos; suplantación de agente |
| Socio | Sin acceso al panel en el MVP | Compartir membresía; suplantación biométrica |

## 2. Autenticación

### 2.1 Contraseñas

- **argon2id**, parámetros mínimos: `memoryCost = 19456 KiB`, `timeCost = 2`, `parallelism = 1` (perfil OWASP). Configurable por env para poder subirlo sin migrar.
- Longitud mínima 10, verificación contra una lista de contraseñas comunes. Sin requisitos de composición absurdos.
- Rehash transparente al login si cambian los parámetros.
- **El administrador nunca elige la contraseña de otro usuario**: se genera una temporal de un solo uso con `mustChangePassword = true`.

### 2.2 Sesión

| Cookie | Contenido | Flags | TTL |
|---|---|---|---|
| `pulso_at` | JWT firmado (HS256 con secreto rotable, o EdDSA) con `sub`, `gymId`, `roleIds`, `branchIds`, `activeBranchId`, `perm` (hash del set de permisos), `jti` | `HttpOnly; Secure; SameSite=Lax; Path=/` | 15 min |
| `pulso_rt` | Token opaco aleatorio de 32 bytes | `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` | 30 días |
| `pulso_csrf` | Token aleatorio | `Secure; SameSite=Lax; Path=/` — **sin HttpOnly a propósito** | igual que `at` |

- `Secure` se omite sólo en `NODE_ENV=development` sobre `localhost`.
- El refresh token se guarda **hasheado** (SHA-256) en base. Un dump de la tabla no da sesiones utilizables.
- **Rotación con detección de reuso**: cada refresh emite uno nuevo y revoca el anterior. Si llega un token ya rotado, se revoca la familia entera y se emite `AuditEvent(SECURITY_REFRESH_REUSE)` con alerta.
- Logout revoca la familia.
- Desactivar un usuario revoca todas sus familias inmediatamente.

**Test:** `auth.refresh-reuse.spec.ts` — usar un refresh, volver a usar el viejo, verificar `401` y que el nuevo también quedó invalidado.

### 2.3 Protección de fuerza bruta

- Rate limit `5 / 15 min` por `(IP, email)` y `20 / hora` por IP.
- Bloqueo de cuenta a los 10 intentos fallidos, 15 minutos, con backoff.
- **Respuesta idéntica** para email inexistente y contraseña incorrecta, incluido el tiempo: si el email no existe se ejecuta igual un hash dummy (evita enumeración por timing).

**Test:** medir que la diferencia de latencia entre ambos casos esté dentro del ruido.

## 3. Autorización

### 3.1 RBAC + permisos granulares

- Rol → conjunto de permisos (`recurso:acción`). Un usuario puede tener rol distinto por sede.
- El permiso se verifica **en el backend**, en un guard, con el catálogo de `packages/contracts`.
- El frontend oculta, no protege.

### 3.2 Orden de guards

```
JwtAuthGuard → TenantContextGuard → FeatureGuard → PermissionsGuard → ThrottlerGuard → handler
```

`TenantContextGuard` fija en `AsyncLocalStorage`: `gymId`, `branchIds` permitidos, `activeBranchId`, `userId`, `requestId`. **Todo lo demás lee de ahí.**

### 3.3 Reglas duras

- Un endpoint sin decorador de permiso explícito **falla el build** (test que recorre todos los handlers y verifica que tengan `@Public()` o `@RequiresPermission()`).
- `403` para permiso faltante; `404` para recurso de otro tenant.

**Test:** `iam/permissions.spec.ts` recorre la matriz rol × endpoint.

## 4. Multi-tenancy — el control más crítico

### 4.1 De dónde sale el tenant

**Sólo del token validado.** Prohibido:

- leer `gymId` de un header (el producto auditado envía `x-idcliente` desde un store del cliente — ese es exactamente el patrón que no replicamos);
- leer `gymId` del body o de la query;
- confiar en `branchId` del cliente sin validarlo contra `branchIds` de la sesión.

### 4.2 Capa 1 — extensión de Prisma

Los modelos tenant-scoped se declaran en una lista explícita. La extensión inyecta `gymId` en `findMany`, `findFirst`, `count`, `aggregate`, `update`, `updateMany`, `delete`, `deleteMany` y lo fuerza en `create`. `findUnique` sobre modelos tenant-scoped se convierte en `findFirst` con `gymId`.

Escape hatch: `prisma.unscoped()` para jobs de plataforma. Cada uso emite `AuditEvent(SYSTEM_UNSCOPED_QUERY)` y hay un test que enumera los usos permitidos — un uso nuevo no listado rompe el CI.

### 4.3 Capa 2 — RLS (Etapa 13)

`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` con política `gym_id = current_setting('app.gym_id')::uuid`, seteado por `SET LOCAL` al inicio de cada transacción. Defensa en profundidad: si la Capa 1 falla, la base rechaza igual.

### 4.4 Tests obligatorios

`test/tenancy/cross-tenant.spec.ts`, generado a partir del registro de rutas:

- Para **cada** endpoint con `:id`, crear el recurso en el gimnasio A e intentar accederlo con sesión del gimnasio B → esperar `404`.
- Verificar que la respuesta **no** cambie según el recurso exista o no (mismo cuerpo, mismo timing aproximado).
- Verificar que un `branchId` de otro gimnasio en el body devuelva `404`.
- Verificar que un listado nunca incluya filas de otro `gymId`.

**Este archivo de tests no se puede saltear ni marcar `skip`. Es la condición de salida de la Etapa 2.**

## 5. Validación de entrada

- Todo body, query y param pasa por Zod (`ZodValidationPipe` global, `whitelist: true`, `forbidNonWhitelisted: true`).
- Sin campos "passthrough": un campo desconocido es un `400`, no se ignora en silencio.
- Sanitización de HTML: los campos libres (notas, descripciones, plantillas de mensaje) se guardan como texto plano; si en el futuro se permite formato, se sanitiza con una allowlist en el servidor.
- Uploads: tipo MIME validado por **contenido** (magic bytes), no por extensión ni por el header del cliente. Tamaño máximo por tipo. Nombres de archivo regenerados (nunca se usa el nombre del cliente en la key de S3).

## 6. XSS

- React escapa por defecto. **`dangerouslySetInnerHTML` está prohibido** por regla de ESLint; una excepción requiere sanitización explícita y comentario justificando.
- CSP estricta (la auditoría señaló su ausencia en el producto observado):

```
default-src 'self';
script-src 'self' 'nonce-{random}';
style-src 'self' 'nonce-{random}';
img-src 'self' data: https://<bucket-o-cdn>;
connect-src 'self' https://api.<dominio> wss://api.<dominio> wss://127.0.0.1:21987;
font-src 'self';
frame-ancestors 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
upgrade-insecure-requests;
```

- Headers adicionales: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()`, `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.
- `X-Frame-Options: DENY` además de `frame-ancestors`.

**Test:** test de integración que verifica la presencia y el valor de cada header en producción.

> Nota: `connect-src` incluye el WebSocket local del agente. Es la única excepción a `'self'` y sólo se agrega cuando la feature `biometrics` está habilitada.

## 7. CSRF

- Cookies `SameSite=Lax` (mitiga la mayoría de los casos).
- **Además**, double-submit: toda mutación exige `X-CSRF-Token` igual a la cookie `pulso_csrf`. Un guard global lo verifica; los endpoints públicos y los del agente (que usan Bearer, no cookies) están exentos.
- CORS: allowlist explícita de orígenes, `credentials: true`. **Nunca** `origin: '*'` con credenciales; nunca reflejar el `Origin` recibido.

**Test:** mutación sin header CSRF → `403`; con token de otra sesión → `403`.

## 8. Inyección

- Prisma parametriza. `$queryRaw` **sólo** con `Prisma.sql` y placeholders; una regla de ESLint prohíbe la interpolación de strings en raw queries.
- Los campos ordenables y filtrables están en allowlist; nunca se construye `ORDER BY` desde input libre.
- Búsqueda de texto: `ILIKE` con parámetro y trigram, no concatenación.

## 9. Rate limiting

Redis, por ventana deslizante. Tabla en `API_CONTRACTS.md` §1.10. Adicional:

- El límite de `/access/check` es por sede, no por usuario: es una pantalla de alta frecuencia legítima.
- El límite de `/agent/biometrics/identify` es por agente y actúa como detector de ataque por fuerza bruta biométrica.
- Superar reiteradamente un límite emite `AuditEvent(SECURITY_RATE_LIMIT_ABUSE)`.

## 10. Gestión de secretos

| Secreto | Dónde vive | Rotación |
|---|---|---|
| `DATABASE_URL` | variable de entorno del proveedor | manual |
| `JWT_SECRET` | env, con soporte de `JWT_SECRET_PREVIOUS` para rotar sin desloguear a todos | trimestral |
| `MASTER_KEK` (cifrado de datos sensibles) | env / KMS del proveedor | anual, con re-wrap de DEKs |
| Credenciales de WhatsApp | tabla `WhatsAppIntegration`, columna cifrada | por cliente |
| Certificado y clave ARCA | tabla dedicada, cifrada; **nunca en disco del servidor** | por vencimiento |
| Secretos de pareo de agentes | hasheados en base, mostrados una sola vez | por instalación |

- **Ningún secreto en el repositorio.** `.env.example` con valores obviamente falsos.
- CI con detección de secretos (gitleaks) que bloquea el merge.
- Los logs redactan por allowlist: sólo se loguean campos explícitamente permitidos.

## 11. Cifrado

- **En tránsito**: TLS 1.2+ en todo. HSTS. El WebSocket local del agente usa `wss` con certificado propio (ver `BIOMETRIC_SECURITY.md`).
- **En reposo**: cifrado de disco del proveedor de base de datos, **más** cifrado a nivel de columna para: templates biométricos, credenciales de WhatsApp, certificados ARCA.
- Esquema de columna: **envelope encryption**. DEK aleatoria de 256 bits por registro, AES-256-GCM; la DEK se envuelve con la KEK del tenant; la KEK del tenant se envuelve con la `MASTER_KEK`. Se guarda `keyVersion` para rotar.
- El AAD (additional authenticated data) del GCM incluye `gymId` y el `id` del registro: un ciphertext no se puede mover de un tenant a otro sin romper la verificación.

## 12. Datos personales

### 12.1 Enmascaramiento de documento (ADR-018)

- Por defecto, la API devuelve `documentMasked` (`**.**7.123`).
- El valor completo requiere `member:read_document`.
- **Rankings, estadísticas y exportaciones nunca lo devuelven completo**, sin importar el permiso, salvo un export explícito con permiso `stats:export` **y** `member:read_document`, que queda auditado.
- El enmascaramiento ocurre en un serializador del backend. El frontend nunca recibe el dato completo para "ocultarlo".

### 12.2 Logs

Campos prohibidos en logs, siempre: contraseñas, tokens, cookies, `documentNumber`, `phone`, `email` completo (se loguea el dominio), templates biométricos, imágenes, certificados, contenido de mensajes de WhatsApp.

Implementación: logger con serializador de allowlist. Test que inyecta un objeto con todos los campos prohibidos y verifica que ninguno aparezca en la salida.

### 12.3 Retención

| Dato | Retención |
|---|---|
| `AuditEvent` | 24 meses, luego archivo frío |
| `AccessAttempt` | 12 meses |
| `Attendance` | mientras el socio esté activo + 24 meses |
| `MessageLog` | 6 meses |
| Templates biométricos | mientras haya consentimiento vigente **y** membresía activa; borrado físico a los 30 días de la revocación o de la baja |
| Foto de socio | hasta 12 meses después de la baja |
| `IdempotencyKey` | 7 días |
| Backups | 30 días |

Un job diario ejecuta la política y deja registro de lo que borró (cuántos registros, de qué tipo — nunca el contenido).

## 13. Seguridad biométrica

Resumen; el detalle está en `biometrics/BIOMETRIC_SECURITY.md`.

- **Consentimiento previo obligatorio**, verificado en el backend. Sin `BiometricConsent` vigente, el enrolamiento devuelve `409`.
- **Nunca se almacena la imagen** de la huella como mecanismo de identificación. Las muestras crudas viven en RAM del agente durante la captura y se sobrescriben al terminar.
- Templates cifrados con envelope encryption; descifrados sólo en memoria del proceso de matching.
- **Revocación inmediata**: marcar `REVOKED` saca la credencial del conjunto de candidatos en la siguiente identificación. No hay caché que la sobreviva (consecuencia directa de elegir matching centralizado, ADR-014).
- Revocar el consentimiento revoca todas las credenciales en la misma transacción.
- Separación por tenant y por sede: el conjunto de candidatos de una identificación se arma con `gymId` de la sesión del agente y el `branchId` del agente. Un agente de la sede A **no puede** identificar contra el padrón de la sede B.
- El agente **nunca** decide accesos y **nunca** recibe datos del socio.
- `AgentAuditEvent` registra toda operación del agente sin datos biométricos.

## 14. Seguridad del agente local

- Escucha **sólo** en `127.0.0.1`. Nunca en `0.0.0.0`. Verificado en el arranque; si no puede bindear a loopback, no arranca.
- Valida `Origin` del WebSocket contra una allowlist configurada en la instalación.
- Autenticación por token de dispositivo de un solo uso emitido por el backend, con TTL corto.
- El agente se aprueba explícitamente desde el CRM antes de poder operar.
- Revocar un agente invalida sus tokens inmediatamente.
- El agente no persiste templates en disco.
- Auto-actualización sólo con binario firmado y hash verificado.

## 15. Seguridad de WhatsApp

- Credenciales cifradas en base, nunca en variables de entorno compartidas entre tenants.
- El envío masivo requiere `message:broadcast` + preview + confirmación explícita + auditoría con el conteo de destinatarios.
- Rate limit de 3 broadcasts por hora por gimnasio.
- Los webhooks entrantes verifican firma HMAC y se deduplican por `(provider, externalId)`.
- El `gymId` de un webhook **no** se toma del payload: se resuelve por la integración asociada al número.

## 16. Seguridad de ARCA

- Certificado y clave privada cifrados a nivel de columna con la KEK del tenant.
- La clave privada **nunca** se escribe en disco; se carga en memoria para firmar y se descarta.
- Emisión de factura sólo con permiso `billing:emit`, siempre auditada con CAE y respuesta del organismo.
- Cambio de certificado emite alerta al owner del gimnasio.
- Modo homologación y modo producción son configuraciones distintas y la UI muestra cuál está activo de forma inequívoca.

## 17. Backups y restauración

- PostgreSQL: backup automático diario del proveedor + **PITR** con retención de 7 días.
- Backup lógico semanal (`pg_dump`) cifrado a un bucket distinto del de archivos.
- Archivos S3: versionado activado + regla de ciclo de vida.
- **Restore drill trimestral obligatorio**: restaurar a un ambiente limpio, correr las migraciones, verificar integridad, medir el tiempo. Un backup que nunca se restauró no es un backup. El resultado se documenta.
- RPO objetivo: 15 min. RTO objetivo: 4 h.

## 18. Respuesta a incidentes

| Incidente | Acción inmediata |
|---|---|
| Sospecha de robo de sesión | Revocar familias de refresh del usuario; rotar `JWT_SECRET` si es masivo |
| Cross-tenant confirmado | Cortar el endpoint afectado; auditar accesos con `AuditEvent`; notificar a los clientes afectados |
| Fuga de templates biométricos | Revocar todas las credenciales afectadas; rotar KEK del tenant; notificar; re-enrolar |
| Agente comprometido | Revocar el agente; invalidar sus tokens; revisar `AgentAuditEvent` |
| Diferencia de caja anómala | Congelar la sesión; exportar el libro diario; revisar auditoría |

Cada incidente deja un registro escrito con línea de tiempo, alcance y remediación.

## 19. Checklist de seguridad por PR

- [ ] Ningún endpoint nuevo sin decorador de permiso.
- [ ] `gymId` de la sesión, no del cliente.
- [ ] Test de cross-tenant para los endpoints nuevos.
- [ ] Sin secretos en el diff.
- [ ] Sin PII nueva en logs.
- [ ] Validación Zod en toda entrada.
- [ ] Idempotencia si hay efecto de dinero o mensajería.
- [ ] `AuditEvent` si es una mutación relevante.
- [ ] Sin `dangerouslySetInnerHTML` nuevo.
- [ ] Sin `$queryRaw` con interpolación.
