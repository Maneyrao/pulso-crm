# Captura HID desde el navegador (ADC + WebSDK)

## Decisión

El lector HID DigitalPersona 4500 se integra desde el navegador mediante HID
Authentication Device Client (ADC, antes Lite Client) y el Web SDK oficial de
HID. El agente WBF de El Templo queda retirado para las PCs configuradas con el
driver Legacy/Non-WBF.

No se instalan simultáneamente el driver WBF/Windows Hello y el Legacy/Non-WBF
en la misma PC de recepción. HID documenta explícitamente que el driver non-WBF
**no es compatible** con Windows Hello ni con el driver WBF del 4500.

## Arquitectura de captura

```
Windows + U4500 → driver HID Legacy → HID ADC (servicio local)
  → WebSocket local cifrado (SRP+AES, puerto 52181 vía /get_connection)
  → websdk.client.ui.js  →  fingerprint.sdk.js  (Fingerprint.WebApi)
  → HidCaptureSession (apps/web/lib/hid/session.ts)
  → API autenticada  →  biometric-matcher privado (SourceAFIS)
  → PostgreSQL  →  decisión de acceso  →  asistencia  →  CRM
```

Piezas en el frontend (`apps/web/lib/hid/`):

| Archivo | Rol |
| --- | --- |
| `webapi.ts` | Única instancia de `Fingerprint.WebApi` por pestaña. Códigos de calidad y de error, versiones del SDK. |
| `session.ts` | Máquina de estados de la captura: adquisición continua, reconexión con backoff, propiedad del lector. |
| `locks.ts` | Propiedad exclusiva del lector entre pestañas (Web Locks API, con caída a memoria). |
| `diagnostics.ts` | Bitácora local saneada (nunca guarda imágenes ni plantillas) + informe descargable. |
| `reporter.ts` | Envía a la API los eventos que sólo ve el navegador (errores de ADC, timeouts, foco). |
| `test/fake-adc.ts` | Simulador fiel del protocolo de ADC: los tests corren contra el `fingerprint.sdk.js` real. |

### Máquina de estados

`DISCONNECTED → CONNECTING → READY → ACQUIRING`, y desde `ACQUIRING`:

- `FINGER_DETECTED` (llegó `QualityReported`) y vuelta a `ACQUIRING` si la
  calidad no sirvió;
- `SAMPLE_RECEIVED → IDENTIFYING → ACCESS_GRANTED | ACCESS_DENIED → ACQUIRING`.

Transversales: `RECOVERING` (backoff tras error/desconexión), `PAUSED` (el
operador detuvo la lectura, u otra pestaña tiene el lector) y `ERROR` (se
agotaron los reintentos automáticos; hay botón de reintento manual).

## Causa raíz del problema "el lector se enciende pero no captura"

La implementación anterior (`lib/hid/client.ts`, eliminado) hacía, por cada
intento: `startAcquisition` → esperar **una** muestra → `stopAcquisition`.

Eso contradice cómo entrega ADC las muestras. `startAcquisition` abre un flujo
que permanece abierto y emite `QualityReported`/`SamplesAcquired` **cada vez**
que se apoya un dedo, hasta que se llama a `stopAcquisition`. El código anterior
tenía además dos consecuencias directas del ciclo por intento:

1. **Ventana ciega.** Entre el `stopAcquisition` de un intento y el
   `startAcquisition` del siguiente, apoyar el dedo no producía absolutamente
   nada. El operador veía la luz encendida (el lector conserva la luz un
   momento) y concluía que "no anda".
2. **Sin rastro.** Los handlers se limpiaban al terminar cada intento y no había
   persistencia de eventos: si la muestra no llegaba, no quedaba registro en
   ninguna parte —ni en el navegador, ni en la API, ni en PostgreSQL—. Por eso
   el usuario reportó "no queda ningún registro cuando apoyo el dedo".

Hoy la adquisición se arma **una sola vez** y se mantiene abierta mientras la
pantalla de Accesos esté activa. Cada lectura reutiliza el mismo flujo.

## Limitaciones del SDK que hay que conocer

- **La luz no se controla por API.** El WebSDK expone `enumerateDevices`,
  `getDeviceInfo`, `startAcquisition` y `stopAcquisition`: no hay ninguna
  operación para encender o apagar el LED. La luz la maneja el firmware mientras
  hay una adquisición activa. Manteniendo la adquisición abierta el lector
  responde de inmediato, que es el comportamiento buscado.
- **Foco de la ventana.** El canal del WebSDK notifica a ADC cada cambio de foco
  (`sdk.focusChanged`). Si la pestaña del CRM pierde el foco, ADC puede dejar de
  entregar muestras a esa página. El panel de diagnóstico avisa explícitamente
  cuando la pestaña está sin foco, porque es una causa habitual de "apoyo el
  dedo y no pasa nada".
- **Varias pestañas compiten.** Cada instancia de `Fingerprint.WebApi` abre su
  propio canal y cualquiera puede llamar a `startAcquisition`. Por eso una sola
  pestaña es dueña del lector (Web Locks); las demás esperan y muestran
  "Lectura pausada".
- **Caché de sesión del WebSdk.** `websdk.client.ui.js` guarda puerto y
  credenciales SRP en `sessionStorage` (`websdk`, `websdk.sessionId`). Si ADC se
  reinicia, esos datos quedan viejos y el SDK reintenta contra un endpoint que
  ya no existe. Ante `CommunicationFailed` se limpian antes de reconectar.
- **`PngImage` está soportado** por ADC con el 4500: es el formato que usa el
  ejemplo oficial de `@digitalpersona/fingerprint` (`SampleFormat.PngImage = 5`).
- **`deviceUid` explícito.** Se pasa el UID del lector enumerado en vez del
  dispositivo por defecto (`00000000-0000-0000-0000-000000000000`), para que la
  adquisición y las notificaciones queden atadas al lector correcto.

## Enrolamiento con más de una muestra

`BIOMETRIC_HID_ENROLL_SAMPLES` (por defecto **2**) define cuántas lecturas del
mismo dedo pide el CRM. El backend extrae una plantilla SourceAFIS de cada una,
las cruza entre sí y exige un score mínimo (`BIOMETRIC_HID_ENROLL_CONSISTENCY`,
por defecto 30). Guarda **sólo** la plantilla de mejor calidad, cifrada.

Fundamento: con una sola imagen no hay ninguna evidencia de que la credencial
vaya a reconocer al socio después. Una captura de mala posición produce una
plantilla válida pero inútil para el 1:N, y el problema recién aparece cuando el
socio no puede entrar. Cruzar dos capturas verifica en el momento del alta que la
credencial es reconocible. Si no coinciden, la API responde `422
ENROLLMENT_SAMPLES_INCONSISTENT` y el modal pide repetir.

## Trazabilidad

Tabla `biometric_capture_events` (append-only, tenant-scoped). Dos fuentes que
se unen por `sessionId`:

- `source = 'browser'`: `POST /biometrics/hid-capture-events`. Arranque y fin de
  sesión, lector detectado, adquisición iniciada, errores de ADC con su código,
  desconexión USB, muestra inválida, timeout y pérdida de foco.
- `source = 'api'`: muestra recibida, extracción, consistencia, matching,
  resultado de acceso y asistencia registrada.

Prohibido en esta tabla (y verificado por test): PNG, imagen cruda, plantillas y
cualquier dato biométrico. `metadata` sólo admite escalares cortos.

Un intento cuya muestra no sirve **también** deja `AccessAttempt`, con
`reasonCode = BIOMETRIC_CAPTURE_FAILED`. Antes ese caso devolvía 422 y no
registraba nada.

## Preparación de la PC Windows

1. Desinstalar el driver WBF/Windows Hello del DP4500 si está presente.
2. Instalar el driver HID Legacy/Non-WBF oficial.
3. Instalar HID Authentication Device Client (o el paquete HID/ControlFit que lo
   incluya).
4. Conectar el lector y confirmar que aparece en **Authentication Devices** en el
   Administrador de dispositivos.
5. Abrir el CRM desde esa PC. En **Accesos** el lector se arma solo; en la ficha
   de un socio, pestaña **Biometría**, está el enrolamiento y el diagnóstico.

El protocolo de validación paso a paso está en
[`PHYSICAL_TEST_PROTOCOL.md`](./PHYSICAL_TEST_PROTOCOL.md), y la auditoría que
originó estos cambios en [`AUDIT_2026-08-30.md`](./AUDIT_2026-08-30.md).

## Seguridad

El Web SDK sólo captura. La extracción y el matching se ejecutan fuera del
navegador, en el servicio privado `biometric-matcher`. La muestra viaja sobre
HTTPS, tiene un límite de 512 KB y sólo existe transitoriamente en memoria:
tanto la API como el matcher sobrescriben los buffers al terminar. PostgreSQL
nunca recibe la imagen: conserva una plantilla cifrada con AES-256-GCM y claves
separadas por gimnasio.
