# Seguridad biométrica — Pulso CRM

Fecha: 2026-08-09
Estado: propuesto.

Una huella no es una contraseña: **no se puede cambiar**. Si se filtra, el daño es permanente. Todo lo que sigue parte de esa premisa.

## 1. Principios

1. **Nunca se almacena la imagen de la huella** como mecanismo de identificación. Sólo templates de minucias.
2. Sin **consentimiento** registrado y verificado en el backend, no hay enrolamiento.
3. Los templates se guardan **cifrados**, con clave por tenant.
4. La **revocación es inmediata** y efectiva en la siguiente identificación.
5. El agente local **nunca decide** accesos y **nunca recibe** datos del socio.
6. Todo lo biométrico deja **auditoría**, sin que la auditoría contenga datos biométricos.
7. El dato biométrico tiene **fecha de vencimiento**: se borra físicamente cuando deja de haber base para conservarlo.

## 2. Qué se guarda y qué no

| Dato | Se guarda | Dónde | Notas |
|---|---|---|---|
| Imagen de la huella | **No** | — | Sólo en RAM del agente durante la captura; se sobrescribe al terminar |
| Muestras individuales del enrolamiento | **No** | — | Ídem |
| Template de minucias | Sí, **cifrado** | `BiometricCredential.templateCiphertext` | AES-256-GCM |
| Hash del template | Sí | `BiometricCredential.templateHash` | SHA-256. **Sólo para deduplicación**, jamás para matching |
| Calidad del enrolamiento | Sí | `BiometricCredential.quality` | número |
| Score de un match | Sí | `AccessAttempt.matchScore` | número, sin el template |
| Consentimiento | Sí | `BiometricConsent` | versión del texto, fecha, quién lo capturó |
| Eventos del agente | Sí | `AgentAuditEvent` | sin PII ni biometría |

### Por qué el hash no sirve para matching

Dos capturas del mismo dedo producen templates distintos (posición, presión, humedad). Por eso el matching es probabilístico, no una igualdad. El `templateHash` sólo detecta el caso exacto de "este mismo template ya está cargado" — útil contra un re-enrolamiento accidental y contra intentar cargar el template de otro socio. **No es un mecanismo de identificación.**

## 3. Consentimiento

### 3.1 Requisitos

Antes del primer enrolamiento de un socio se registra un `BiometricConsent` con:

- `version`: identificador del texto exacto que se le mostró/entregó.
- `grantedAt`, `grantedMethod` (`IN_PERSON_SIGNED` | `DIGITAL`), `capturedByUserId`.
- `documentKey` opcional: el consentimiento firmado escaneado.

El texto debe decir, en lenguaje claro: qué se captura, que se guarda un template y **no** una imagen, para qué se usa, cuánto se conserva, con quién se comparte (nadie), y cómo revocarlo.

### 3.2 Verificación

`POST /members/:id/biometrics/enrollments` devuelve `409 NO_BIOMETRIC_CONSENT` si no hay consentimiento vigente. **La verificación es del backend**; el checkbox del frontend no cuenta.

### 3.3 Revocación

`DELETE /members/:id/biometrics/consent`:

1. Marca `revokedAt` en el consentimiento.
2. Marca `REVOKED` **todas** las credenciales del socio.
3. Encola el borrado físico.
4. Emite `AuditEvent(BIOMETRIC_CONSENT_REVOKED)`.

Todo en una transacción. **Test obligatorio:** `consent-revoke-cascade.spec.ts`.

### 3.4 Alternativa siempre disponible

El acceso por documento o tarjeta debe funcionar siempre. Un socio que no quiere dar su huella no puede quedar sin poder entrar. Esto no es sólo buena práctica: es lo que hace que el consentimiento sea genuinamente voluntario.

## 4. Cifrado de templates

### 4.1 Envelope encryption

```
MASTER_KEK  (variable de entorno / KMS del proveedor)
    └── envuelve → KEK_tenant  (una por gimnasio, guardada envuelta en TenantKey)
            └── envuelve → DEK  (una por credencial, aleatoria de 256 bits)
                    └── cifra → template  (AES-256-GCM)
```

Por credencial se guarda: `templateCiphertext`, `templateNonce` (12 bytes, único por operación), `templateAuthTag` (16 bytes), `dekWrapped`, `keyVersion`.

### 4.2 AAD atado al tenant

El *additional authenticated data* del GCM es:

```
AAD = gymId || credentialId || keyVersion
```

Consecuencia: un ciphertext copiado de un gimnasio a otro **falla la verificación de autenticidad**. No se descifra. Es una defensa concreta contra un cross-tenant a nivel de base de datos.

**Test obligatorio:** `crypto.spec.ts` — mover un ciphertext a otro `gymId` y verificar que el descifrado falla.

### 4.3 Rotación de claves

| Clave | Frecuencia | Procedimiento |
|---|---|---|
| DEK | Por credencial, nunca se reutiliza | — |
| KEK de tenant | Anual, o inmediata ante incidente | Job que descifra con la KEK vieja y re-envuelve las DEK con la nueva. No toca los templates ni los ciphertexts. |
| `MASTER_KEK` | Anual | Re-envuelve las KEK de tenant. |

`keyVersion` permite convivencia de versiones durante la rotación. La rotación es un job del worker, reanudable, con progreso auditado.

### 4.4 Dónde se descifra

Sólo en memoria del proceso de la API, durante una identificación, y sólo el conjunto de candidatos de esa sede. Nunca se escribe descifrado a disco, log, caché ni respuesta.

Los buffers se sobrescriben al terminar el matching.

## 5. Matching

### 5.1 Dónde corre

En el backend (ADR-014). Justificación completa en ese ADR; el punto decisivo es la revocación: con matching local, una credencial revocada podría seguir abriendo la puerta hasta la próxima sincronización.

### 5.2 Conjunto de candidatos

```sql
-- conceptual
SELECT * FROM biometric_credentials
WHERE gym_id     = :gymIdDeLaSesionDelAgente
  AND status     = 'ACTIVE'
  AND (branch_id = :branchIdDelAgente OR branch_id IS NULL)
```

`gymId` sale del agente autenticado, **nunca del payload**. `branchId` se valida contra el agente. Un agente de la sede A no puede identificar contra el padrón de la sede B.

**Tests obligatorios:** `identify-cross-branch.spec.ts`, `identify-cross-tenant.spec.ts`.

### 5.3 Umbral

`BIOMETRIC_MATCH_THRESHOLD` se define con los datos de la POC (V7 de la investigación), no por intuición.

Criterio de calibración:

- **FAR (falsa aceptación) es el error grave**: deja entrar a alguien que no es. Se prioriza minimizarlo.
- **FRR (falso rechazo) es molesto pero recuperable**: el socio entra por DNI.
- Objetivo inicial propuesto, a validar: FAR ≤ 0,01% con el FRR más bajo que se logre a ese FAR.
- Si dos candidatos superan el umbral y sus scores están dentro de un margen configurable, se devuelve **no match** en lugar de elegir el mayor. Un match ambiguo es peor que ningún match.

El umbral es configurable por gimnasio dentro de un rango acotado por el sistema; un gimnasio no puede bajarlo a un valor inseguro.

### 5.4 Rate limiting como antifraude

60 identificaciones por minuto por agente. Superarlo repetidamente emite `AuditEvent(SECURITY_RATE_LIMIT_ABUSE)` y puede deshabilitar el agente automáticamente. Es la defensa contra un ataque de fuerza bruta con templates sintéticos.

Además: más de N `BIOMETRIC_NO_MATCH` consecutivos en un agente dispara una alerta.

## 6. Anti-fraude de negocio

| Riesgo | Control |
|---|---|
| Dos socios comparten una huella para compartir la membresía | `unique(gymId, templateHash) where status='ACTIVE'` bloquea el template idéntico. Además, un job detecta patrones de asistencia imposibles (dos accesos del mismo socio en sedes distintas en minutos). |
| Un empleado enrola su propia huella a nombre de un socio | Todo enrolamiento queda auditado con `startedByUserId`. Reporte de enrolamientos por usuario. |
| Un socio dado de baja sigue entrando | La baja revoca las credenciales en la misma transacción. |
| Suplantación con huella falsificada | El U.are.U 4500 **no tiene detección de vida documentada** en las fuentes consultadas (`[PENDIENTE]`, no asumir que la tiene). Mitigación: la huella no es el único control — hay una persona en recepción. **No usar biometría como único factor para operaciones de dinero.** |

## 7. Separación de responsabilidades

```
Agente local          Backend
------------          -------
captura               identifica (1:N)
mide calidad          autoriza (membresía, sede, clases, deuda)
extrae template       registra AccessAttempt y Attendance
envía template        notifica al navegador
                      audita
```

El agente recibe `{ "resolved": true }`. No recibe `memberId`, ni nombre, ni foto, ni decisión.

**Test obligatorio:** `no-pii-to-agent.spec.ts` — la respuesta de `identify` no contiene ningún campo identificatorio.

## 8. Seguridad del canal

### 8.1 Navegador ↔ agente

Detalle en `WEBSOCKET_PROTOCOL.md`. Resumen:

- `wss://127.0.0.1:21987`, certificado único por instalación en Trusted Root.
- Bind exclusivo a loopback. Si no puede, el agente **no arranca**.
- `Origin` validado contra allowlist.
- Sobre `ws://` (sin TLS) sólo se permiten diagnóstico y estado.

### 8.2 Agente ↔ backend

- HTTPS con validación estricta de certificado. Prohibido cualquier callback de validación permisivo.
- `Authorization: Bearer <deviceToken>`.
- Los `deviceToken` son de **un solo uso**, TTL 120 s, con `scope` (`ENROLL` | `IDENTIFY`) y, para enrolamiento, atados a `subjectMemberId`.
- Un token de `ENROLL` no sirve para `identify`. Un token atado al socio X no enrola al socio Y.
- Reutilizar un token consumido → `401` + `AuditEvent`.

**Tests obligatorios:** `token-scope.spec.ts`, `token-replay.spec.ts`.

### 8.3 Credenciales del agente

Guardadas con Windows DPAPI, scope `LocalMachine`, no exportables. Atadas al `machineFingerprint`: copiar la carpeta a otra PC no funciona — el agente vuelve a `PENDING_APPROVAL`.

## 9. Auditoría

### 9.1 `AuditEvent` (acciones de usuarios)

| Acción | Cuándo |
|---|---|
| `BIOMETRIC_CONSENT_GRANTED` / `_REVOKED` | |
| `BIOMETRIC_ENROLLMENT_STARTED` / `_COMPLETED` / `_FAILED` | |
| `BIOMETRIC_CREDENTIAL_REVOKED` | con motivo |
| `BIOMETRIC_CREDENTIAL_PURGED` | borrado físico por retención |
| `AGENT_CREATED` / `_APPROVED` / `_REVOKED` | |
| `BIOMETRIC_THRESHOLD_CHANGED` | cambio de configuración sensible |

### 9.2 `AgentAuditEvent` (acciones del agente)

Enumerados en `DATA_MODEL.md` §7. **Prohibido** incluir en `metadata`: imágenes, templates, `memberId`, documento, nombre.

### 9.3 Consultable

El gimnasio puede ver, desde la UI: quién enroló a cada socio y cuándo, quién revocó qué, y el historial de eventos de cada agente. La auditoría que nadie puede leer no sirve.

## 10. Retención y borrado

| Dato | Se conserva mientras | Borrado |
|---|---|---|
| `BiometricCredential` (activa) | Haya consentimiento vigente **y** el socio esté activo | — |
| `BiometricCredential` (revocada) | 30 días | **Borrado físico** del ciphertext, DEK y hash; queda un registro tombstone sin datos |
| `BiometricEnrollment` | 90 días | Se borran los scores; queda el registro de que ocurrió |
| `BiometricConsent` | 5 años tras la revocación | Es la prueba de que hubo consentimiento; se conserva por defensa legal |
| `AccessAttempt` con `matchScore` | 12 meses | El score no es un dato biométrico reconstructible |
| `AgentAuditEvent` | 12 meses | |

El job de retención corre a diario, registra cuántos registros borró de cada tipo, y **nunca** loguea contenido.

Un socio dado de baja: sus credenciales se revocan el mismo día y se purgan a los 30.

## 11. Respuesta a incidentes biométricos

| Escenario | Acción |
|---|---|
| **Sospecha de fuga de la base** | Rotar la `MASTER_KEK` y todas las KEK de tenant. Los ciphertexts filtrados quedan inútiles si la KEK no se filtró; si se filtró, revocar **todas** las credenciales y re-enrolar. Notificar a los gimnasios afectados. |
| **PC de recepción robada** | Revocar el agente (invalida credenciales y tokens). El impacto es acotado **porque el agente no guarda templates** — ésta es la ventaja concreta de haber elegido matching centralizado. |
| **Agente comprometido** | Revocar; revisar `AgentAuditEvent`; buscar picos de identificaciones o enrolamientos anómalos. |
| **Falsa aceptación reportada** | Congelar el umbral; exportar los `AccessAttempt` con score cercano al umbral; recalibrar con datos reales; revocar y re-enrolar las credenciales involucradas. |
| **Enrolamiento fraudulento detectado** | Revocar la credencial; auditar todos los enrolamientos del usuario responsable. |

Cada incidente se documenta con línea de tiempo, alcance, socios afectados y remediación.

## 12. Consideraciones legales

`[PENDIENTE]` — requiere revisión de un profesional, no es una afirmación jurídica.

Puntos a resolver antes de operar con biometría en producción en Argentina:

1. Tratamiento de datos biométricos bajo la Ley 25.326 de Protección de Datos Personales y su régimen de datos sensibles.
2. Necesidad y forma del registro de la base de datos ante la autoridad de aplicación.
3. Requisitos formales del consentimiento (por escrito, informado, específico, revocable).
4. Deber de informar en caso de incidente de seguridad.
5. Responsabilidad del gimnasio (responsable del tratamiento) vs. Pulso (encargado del tratamiento), y el contrato que lo formaliza.
6. Retención máxima admisible.

**Esto es una pregunta bloqueante para la Etapa 8, no para el MVP** (el MVP no incluye biometría). Pero conviene resolverla mientras se construye el MVP, porque puede cambiar el texto del consentimiento y la política de retención.

## 13. Checklist de seguridad biométrica

Antes de habilitar biometría para un cliente real:

- [ ] Texto de consentimiento revisado legalmente y versionado.
- [ ] Verificación de consentimiento en el backend probada (`enroll-no-consent.spec.ts`).
- [ ] Cifrado con AAD por tenant probado (`crypto.spec.ts`).
- [ ] Revocación inmediata probada (`identify-revoked.spec.ts`).
- [ ] Cascada consentimiento → credenciales probada.
- [ ] Job de retención probado (`retention.spec.ts`).
- [ ] Aislamiento por sede y por tenant probado.
- [ ] El agente no recibe PII, probado.
- [ ] Scope y un-solo-uso de los tokens probados.
- [ ] Umbral calibrado con datos de la POC y documentado.
- [ ] Rate limit activo y alertas configuradas.
- [ ] Acceso por documento funcionando como alternativa.
- [ ] Rotación de KEK probada al menos una vez en staging.
- [ ] Runbook de incidente biométrico escrito.
- [ ] Revisión legal cerrada (§12).
