# Protocolo de validación física — lector HID U.are.U 4500

Los tests automáticos corren contra un simulador fiel del protocolo de ADC. Eso
prueba el código, **no** prueba el hardware, el driver ni el cliente local de
HID. Este protocolo es el que decide si el sistema funciona de verdad.

Ejecutar en la PC Windows de recepción, con el lector conectado.

> Anotar cada paso en la tabla del final. Si un paso falla, **parar** y adjuntar
> el informe diagnóstico (paso 5) antes de seguir.

## Fase 0 — Estado de la PC

| # | Acción | Resultado esperado |
| --- | --- | --- |
| 0.1 | Cerrar **todas** las pestañas del CRM en todos los navegadores. | Ninguna abierta. |
| 0.2 | Administrador de dispositivos → **Authentication Devices**. | Aparece el DigitalPersona 4500 sin signo de admiración. |
| 0.3 | Confirmar que NO figura además bajo **Biometric devices** (WBF). | Un solo driver activo: el Legacy/Non-WBF. |
| 0.4 | `Get-Service` o Servicios → cliente de HID (Authentication Device Client). | En ejecución. |
| 0.5 | Configuración de Windows → Opciones de inicio de sesión → Huella. | Windows Hello por huella deshabilitado (compite por el lector). |

Si 0.3 o 0.5 fallan, resolver antes de continuar: el driver WBF y el Legacy no
conviven, y Windows Hello toma el dispositivo.

## Fase 1 — Arranque del lector

| # | Acción | Resultado esperado |
| --- | --- | --- |
| 1.1 | Abrir **una sola** pestaña del CRM e iniciar sesión. | Sesión iniciada, sede seleccionada. |
| 1.2 | Ir a **Accesos**. | Sin tocar ningún botón, el panel "Ingreso por huella" pasa a **Esperando huella**. |
| 1.3 | Pulsar **Diagnóstico**. | Se abre el panel dentro de la página. No se abre ninguna ventana ni pestaña externa. |
| 1.4 | En el diagnóstico, leer *SDK cargado*, *WebSDK*, *Fingerprint SDK*. | `sí`, `1.1.0`, `1.0.0`. |
| 1.5 | Leer *Lector* y *Device UID*. | Modelo del 4500 y un UID no vacío. |
| 1.6 | Buscar en la lista de eventos `adc.start-acquisition` y `hid.AcquisitionStarted`. | Ambos presentes, en ese orden. |
| 1.7 | Leer *Foco de la pestaña*. | `con foco`. Si dice `sin foco`, hacer clic en la página. |

**Si 1.2 no llega a "Esperando huella"**: el estado y el motivo se ven en el
panel. `client-missing` = ADC no responde (Fase 0). `no-reader` = ADC responde
pero no enumera el lector (USB / driver). `hid-error` = el código HID exacto
aparece en el evento `hid.ErrorOccurred`. **Eso separa el problema de código del
problema de driver/ADC/hardware.**

## Fase 2 — Enrolamiento

| # | Acción | Resultado esperado |
| --- | --- | --- |
| 2.1 | Socios → elegir un socio de prueba → pestaña **Biometría**. | Se ve la pestaña. |
| 2.2 | **Registrar consentimiento** y confirmar. | Toast de confirmación. |
| 2.3 | **Enrolar huella** → elegir *Índice derecho* → **Capturar huella**. | El modal muestra **Muestra 1 de 2**. |
| 2.4 | Apoyar el dedo, quieto y centrado. | Pasa a **Muestra 2 de 2**. |
| 2.5 | Apoyar **el mismo** dedo otra vez. | **Huella registrada correctamente**, con calidad y coincidencia entre muestras. |
| 2.6 | Cerrar el modal. | La credencial aparece en la tabla del socio, estado **Activa**. |
| 2.7 | Repetir 2.3–2.5 con **dedos distintos** en cada muestra. | Rechazo explícito: "Las muestras no coinciden entre sí". No se crea credencial. |

## Fase 3 — Identificación y asistencia

| # | Acción | Resultado esperado |
| --- | --- | --- |
| 3.1 | Volver a **Accesos**. Confirmar **Esperando huella**. | Lector armado. |
| 3.2 | Apoyar el dedo enrolado. | Resultado en pantalla con nombre, estado de membresía y motivo. |
| 3.3 | Observar el panel tras el resultado. | Vuelve solo a **Esperando huella**, sin tocar nada. |
| 3.4 | Verificar en la lista "Actividad reciente". | Aparece el intento con método **Huella**. |
| 3.5 | Apoyar **el mismo** dedo de nuevo, en el día. | **Ya registró asistencia hoy** (`DUPLICATE_WINDOW`). No duplica la asistencia. |
| 3.6 | Apoyar un dedo **no** enrolado. | **Huella no reconocida** y vuelta a esperar. |
| 3.7 | Apoyar el dedo mal puesto (de costado, apenas la punta). | Mensaje de calidad concreto ("Centrá el dedo…", "Apoyá una superficie mayor…"). No se envía nada al backend. |

### Verificación en PostgreSQL

```sql
-- Asistencia del día (debe haber UNA sola por socio, sede y día).
SELECT a.id, a."memberId", a.method, a."occurredOn", a."occurredAt"
FROM attendances a
WHERE a."occurredOn" = CURRENT_DATE
ORDER BY a."occurredAt" DESC;

-- Intentos por huella, incluidos los rechazados.
SELECT "occurredAt", decision, "reasonCode", "matchScore", "attendanceId"
FROM access_attempts
WHERE method = 'FINGERPRINT'
ORDER BY "occurredAt" DESC
LIMIT 20;

-- Traza completa de una lectura (navegador + backend), por sesión de captura.
SELECT "occurredAt", source, stage, severity, message, metadata
FROM biometric_capture_events
ORDER BY "occurredAt" DESC
LIMIT 40;

-- Comprobación de privacidad: ninguna fila debe contener imágenes.
SELECT count(*) FROM biometric_capture_events
WHERE metadata::text ILIKE '%iVBORw0KGgo%';   -- debe dar 0
```

## Fase 4 — Diez lecturas consecutivas

| # | Acción | Resultado esperado |
| --- | --- | --- |
| 4.1 | Apoyar el dedo enrolado 10 veces seguidas, esperando el resultado de cada una. | Las 10 producen resultado visible. |
| 4.2 | Contar cuántas requirieron tocar algún botón. | **Cero**. |
| 4.3 | En el diagnóstico, leer *Muestras recibidas*. | 10 (más las de calidad rechazada, si hubo). |
| 4.4 | Contar los `adc.start-acquisition` en los eventos. | **Uno solo** para toda la tanda. |
| 4.5 | `SELECT count(*) FROM access_attempts WHERE method='FINGERPRINT' AND "occurredAt" > now() - interval '10 minutes';` | 10. |

## Fase 5 — Resiliencia

| # | Acción | Resultado esperado |
| --- | --- | --- |
| 5.1 | Con el lector armado, **desenchufar el USB**. | El panel pasa a **Reconectando el lector** y explica la desconexión. |
| 5.2 | Volver a enchufarlo. | Vuelve solo a **Esperando huella**, sin recargar la página. |
| 5.3 | Apoyar el dedo. | Identifica normalmente. |
| 5.4 | Detener el servicio de ADC desde Servicios de Windows. | **Reconectando**, con el mensaje del cliente local. |
| 5.5 | Iniciar ADC de nuevo. | Se recupera solo. |
| 5.6 | Abrir una **segunda** pestaña del CRM en Accesos. | La segunda dice **Lectura pausada** ("otra pestaña está usando el lector"). La primera sigue funcionando. |
| 5.7 | Cerrar la primera pestaña. | La segunda toma el lector y pasa a **Esperando huella**. |
| 5.8 | Pulsar **Detener huella**, y luego **Activar huella**. | Se apaga y se vuelve a armar sin recargar. |
| 5.9 | Cambiar el foco a otra ventana y apoyar el dedo. | Documentar el comportamiento observado (ver limitación de foco en `HID_ADC_MIGRATION.md`). |

## Fase 6 — Cierre

1. **Descargar informe** desde el panel de diagnóstico.
2. Verificar que el JSON **no** contiene ninguna cadena larga en base64 (no debe
   haber imágenes ni plantillas).
3. Adjuntar el informe y la salida de las consultas SQL al registro de la prueba.

## Registro de la prueba

| Fase | Paso | Resultado (OK / FALLA) | Observación |
| --- | --- | --- | --- |
| 0 | 0.1–0.5 | | |
| 1 | 1.1–1.7 | | |
| 2 | 2.1–2.7 | | |
| 3 | 3.1–3.7 + SQL | | |
| 4 | 4.1–4.5 | | |
| 5 | 5.1–5.9 | | |
| 6 | 6.1–6.3 | | |

**PC / Windows:** ___  **Navegador y versión:** ___
**Versión de ADC:** ___  **Driver (Legacy/Non-WBF):** ___
**Commit desplegado:** ___  **Fecha y responsable:** ___

---

## Fase 0 (nueva) — decidir de quién es el problema antes de seguir

Correr esto ANTES que el resto del protocolo. Sirve para no gastar tiempo
probando el CRM si el sensor no está entregando imágenes a la PC.

1. En la PC Windows con el lector, entrar a **Accesos** en el CRM.
2. Apoyar el dedo y sostenerlo 15 segundos.
3. Anotar qué pasa:

   | Lo que se ve | Qué significa |
   | --- | --- |
   | Aparece "El lector está armado pero no llega ninguna señal del dedo" | ADC no entregó nada: el problema está entre el sensor y el cliente HID de esa PC |
   | Aparece un mensaje de calidad ("Centrá el dedo", "Limpiá el lector"…) | El sensor SÍ entrega imágenes: el problema es de técnica o de suciedad, no de driver |
   | Aparece un error `0x…` | ADC informó una falla concreta: anotarla completa |
   | Se identifica al socio | La captura funciona |

4. Si aparece el aviso de "no llega ninguna señal", abrir **Diagnóstico** y
   apretar **Sondear formatos**, manteniendo el dedo apoyado los ~32 segundos
   que dura. El panel dicta el veredicto:

   - **Ningún formato entrega señal** → el problema es del host. En orden:
     1. Quitar la huella de **Windows Hello** (Configuración → Cuentas → Opciones
        de inicio de sesión) y reiniciar. El servicio biométrico de Windows
        retiene el sensor.
     2. Verificar en el Administrador de dispositivos que el U.are.U 4500 use el
        driver **HID DigitalPersona (Legacy)** y no el WBF genérico.
     3. Cerrar cualquier otro programa de huella (agente viejo de El Templo,
        DigitalPersona Console).
   - **Sólo `PngImage` no entrega y otro formato sí** → el problema es el
     formato de captura y la corrección es de código. Pasar el resultado al
     equipo con el informe descargado.

5. En cualquier caso, apretar **Descargar informe** y guardar el JSON. Además,
   la traza queda del lado del servidor: cada intento deja sus etapas en
   `biometric_capture_events`, unidas por `sessionId`.

```sql
-- Qué llegó a registrar el navegador del último intento
select "occurredAt", stage, severity, message, metadata
from biometric_capture_events
order by "occurredAt" desc
limit 40;
```

Si en esa consulta aparece `ACQUISITION_SILENT`, está probado que el lector
quedó armado y ADC no entregó nada. Si aparece `QUALITY_REPORTED`, está probado
que el sensor sí vio el dedo.
