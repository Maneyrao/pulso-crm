# Investigación: HID DigitalPersona U.are.U 4500

Fecha de investigación: 2026-08-09
Producto: Pulso CRM (nombre de trabajo)
Autor: fase de discovery — sin hardware en mano al momento de escribir.

## 0. Cómo leer este documento

Cada afirmación está etiquetada:

| Etiqueta | Significado |
|---|---|
| `[OFICIAL]` | Verificado en documentación de HID Global o en repositorios oficiales de HID (github.com/hidglobal, docs.hidglobal.com, digitalpersona.hidglobal.com). |
| `[MIRROR]` | Proviene de un PDF/página que reproduce documentación oficial de HID pero alojado por un tercero. Fiable pero no verificado en el dominio de HID. |
| `[INFERIDO]` | Conclusión razonada a partir de lo anterior. No es una afirmación de HID. |
| `[PENDIENTE]` | No pudo verificarse. **No se debe asumir.** Requiere confirmación con HID o con el dispositivo físico. |

Nota de método: `www.hidglobal.com` y `sdk.hidglobal.com` devolvieron **HTTP 403** a la herramienta de fetch usada en esta sesión. Los datos de esas fuentes se obtuvieron mediante resultados de búsqueda que citan esas páginas, y están marcados `[MIRROR]` salvo que se hayan podido abrir directamente. Todo lo marcado `[PENDIENTE]` debe cerrarse en la Etapa 7 (POC), abriendo esas páginas desde un navegador real.

## 1. Identificación del dispositivo

| Punto | Estado | Detalle |
|---|---|---|
| Nombre comercial actual | `[OFICIAL]` | "HID DigitalPersona 4500 Fingerprint Reader". El nombre histórico "U.are.U 4500" sigue en circulación comercial (incluida la publicación de MercadoLibre de referencia) y designa el mismo producto. |
| Variantes conocidas | `[OFICIAL]` | Existe al menos una variante **módulo OEM** ("HID DigitalPersona 4500 Fingerprint Module", página de producto y datasheet propios) distinta del **lector de escritorio USB**. El brief especifica el lector USB de escritorio. |
| Tipo de sensor | `[MIRROR]` | Óptico. |
| Interfaz | `[MIRROR]` | USB 2.0. |
| Resolución de salida | `[MIRROR]` | 512 dpi, escala de grises 8 bits (256 niveles). |
| Área de captura | `[MIRROR]` | ~14,6 mm (ancho nominal) × ~18,1 mm (largo nominal). |
| Cifrado del enlace USB | `[MIRROR]` | Cifrado propietario de 32 bits con clave rodante (rolling key) entre lector y host. |
| Almacenamiento de templates en el dispositivo | `[INFERIDO]` | **No existe.** El datasheet describe un dispositivo que produce *imagen* hacia el host. No se encontró ninguna mención a memoria de templates, matcher embebido ni modo "match-on-device". |
| Matching en el dispositivo | `[INFERIDO]` | **No existe.** Mismo razonamiento. |

### 1.1 Consecuencia de diseño (importante)

`CRM_GIMNASIO_ROADMAP.md` propone como "mejor opción" guardar el template dentro del dispositivo y sólo un `template_id` en la base. **Con este hardware esa opción no es implementable.** El 4500 es un sensor de captura; extracción, almacenamiento y matching ocurren en el host o en el servidor.

Esto se registra como **ADR-014** y elimina la Alternativa A del análisis de almacenamiento biométrico.

## 2. Drivers

| Punto | Estado | Detalle |
|---|---|---|
| Driver WBF (Windows Biometric Framework) | `[OFICIAL]` | HID publica "HID DigitalPersona 4500 WBF (Hello) Driver". Un resultado de búsqueda cita la versión 5.0.0.5 y soporte de login Windows Hello. |
| Driver no-WBF (legacy) | `[OFICIAL]` | HID publica "HID DigitalPersona 4500 Non-WBF Driver", descrito como destinado a aplicaciones que esperan la interfaz y funcionalidad del driver legacy DigitalPersona. |
| Cuál necesita nuestro agente | `[PENDIENTE]` | Depende del stack de SDK elegido (§4). Regla práctica: el SDK DigitalPersona clásico espera el driver **legacy/non-WBF**; el acceso vía WBF sirve a Windows Hello y a aplicaciones WBF. **Instalar el equivocado es la causa #1 de "el lector no aparece". Verificar en POC-01.** |
| Windows 10 x64 | `[MIRROR]` | El datasheet del lector lista compatibilidad con Windows 7, 8 y 10 (32 y 64 bits). |
| Windows 11 x64 | `[PENDIENTE]` | **No se encontró mención explícita de Windows 11 en el datasheet accesible.** La página de drivers de HID (hidglobal.com/drivers/39477 y /49061) devolvió 403 y no pudo leerse. No afirmar soporte de Windows 11 hasta abrir esa página y/o probar en hardware. Ver POC-02. |
| Coexistencia de ambos drivers | `[PENDIENTE]` | Verificar si instalar WBF y legacy en la misma máquina genera conflicto. |

## 3. SDK oficial

| Punto | Estado | Detalle |
|---|---|---|
| Producto | `[OFICIAL]` | "DigitalPersona SDK" / "DigitalPersona Biometric SDK", con ediciones para Windows, Linux y Android. Portal: `sdk.hidglobal.com/developer-center/digitalpersona-touchchip`. |
| Compatibilidad con el 4500 | `[MIRROR]` | El datasheet del lector indica compatibilidad con los SDK DigitalPersona para Windows, Linux y Android. |
| Lenguajes / interfaces | `[MIRROR]` | C, C++, C#, Java, VB.NET, JavaScript. Otras fuentes agregan ActiveX/COM y .NET. |
| Entornos de desarrollo citados | `[MIRROR]` | Visual Studio 2010 y 2017 mencionados en material de HID. `[INFERIDO]` Esto sugiere que el SDK nativo es de generación antigua; conviene planificar interop desde .NET moderno en lugar de asumir un paquete NuGet actual. |
| Formatos de template | `[MIRROR]` | ANSI/INCITS 378-2004 e ISO/IEC 19794-2:2005. Además existe un formato propietario DigitalPersona. |
| Verificación 1:1 | `[MIRROR]` | Soportada. |
| Identificación 1:N | `[MIRROR]` | Soportada; el motor citado es **FingerJet**. |
| Límite de templates en 1:N | `[PENDIENTE]` | No documentado en las fuentes accesibles. |
| Rendimiento (latencia de match, FAR/FRR) | `[PENDIENTE]` | No documentado en las fuentes accesibles. **Debe medirse en POC-13.** |
| Manejo de múltiples lectores | `[PENDIENTE]` | El SDK expone enumeración de dispositivos, pero el comportamiento con 2+ lectores en la misma PC no está verificado. |
| Reconexión USB | `[PENDIENTE]` | Existen eventos de conexión/desconexión en la capa JS (§5). Para el SDK nativo, no verificado. |
| **Cómo se obtiene el SDK** | `[PENDIENTE]` | **No verificado.** |
| **Licencia del SDK y derecho de redistribución del runtime en un SaaS comercial** | `[PENDIENTE]` | **No verificado. Éste es el punto de riesgo legal y económico más alto de toda la Etapa 7/8.** No se encontró texto de EULA accesible. |

> **Regla de trabajo:** no se escribe una línea del agente productivo hasta que las dos últimas filas estén cerradas por escrito con HID o su distribuidor.

## 4. Los dos stacks técnicos posibles para el agente

La investigación deja dos caminos reales. Ninguno se puede descartar sin cerrar la licencia del SDK.

### Stack A — SDK oficial HID DigitalPersona (recomendado si la licencia es viable)

```
U.are.U 4500 --USB--> driver HID --> DigitalPersona SDK (C#/.NET) --> agente local Pulso
```

- Extracción de minucias, generación de template, 1:1 y 1:N con FingerJet, todo dentro del SDK.
- Soporte oficial del fabricante ante fallas de campo.
- **Riesgo:** licencia, costo por puesto/instalación y derechos de redistribución `[PENDIENTE]`.

### Stack B — cadena abierta (fallback)

```
U.are.U 4500 --USB--> driver HID --> captura de imagen
   --> FingerJetFX OSE (extracción de minucias) --> template ANSI-378 / ISO 19794-2
   --> SourceAFIS (matching 1:1 y 1:N) en el backend
```

| Componente | Estado | Detalle |
|---|---|---|
| FingerJetFX OSE | `[OFICIAL]` | Repo `github.com/FingerJetFXOSE/FingerJetFXOSE`. **Sólo extracción de features, no hace matching.** Salida conforme a ANSI/INCITS 378-2004 e ISO/IEC 19794-2:2005. Portable (Linux, Windows, Android, RTOS; 32/64 bits). La contribución inicial de DigitalPersona superó los umbrales PIV de MINEX (SDK 3F). |
| Licencia FingerJetFX OSE | `[OFICIAL]` | **LGPL v3 o posterior.** Implica requisitos de linking dinámico y de puesta a disposición de modificaciones. **Requiere revisión legal antes de usarse en producto comercial.** |
| SourceAFIS | `[OFICIAL]` | `sourceafis.machinezoo.com`. Motor de reconocimiento con implementaciones puras en Java y .NET. Soporta comparación 1:1 y **búsqueda 1:N eficiente**. Lee ANSI 378 (2004, 2009, 2009/Am1) e ISO 19794-2 (2005, 2011 off-card). |
| Licencia SourceAFIS | `[OFICIAL]` | **Apache License 2.0** — compatible sin fricción con un SaaS comercial. |
| Punto débil del Stack B | `[PENDIENTE]` | Obtener la **imagen cruda** desde el 4500 sigue requiriendo el driver de HID y, muy probablemente, una API de captura de HID (SDK o WBF). Es decir: el Stack B reduce la dependencia del SDK para *extracción y matching*, pero **no necesariamente elimina la dependencia para la captura**. Verificar en POC-03/POC-05 si la captura es alcanzable sólo con WBF (`Windows.Devices.Biometrics` / WinBio API) sin licencia adicional. |

### Comparación

| Criterio | Stack A (SDK HID) | Stack B (FingerJetFX + SourceAFIS) |
|---|---|---|
| Riesgo legal | Licencia comercial a negociar | LGPL-3 a revisar; Apache-2.0 sin problema |
| Costo recurrente | Probable, por puesto | Cero de licencia |
| Soporte del fabricante | Sí | No |
| Calidad de matching | FingerJet, validado MINEX | SourceAFIS, calidad pública buena pero a medir |
| Esfuerzo de integración | Menor | Mayor (interop nativo + tuning de umbrales) |
| Dependencia del driver HID | Total | Alta (captura) |

**Recomendación para la POC:** ejecutar POC-01 a POC-08 sobre **Stack A** si se consigue el SDK en el plazo de la Etapa 7; en paralelo, POC-03B (¿se puede capturar imagen sólo con WBF?) para saber si el Stack B es siquiera viable. La decisión definitiva se toma en el informe GO/NO-GO.

## 5. Camino oficial navegador ↔ agente (hallazgo importante)

HID publica librerías JavaScript oficiales para acceder a lectores desde el navegador:

| Punto | Estado | Detalle |
|---|---|---|
| Paquetes npm | `[OFICIAL]` | `@digitalpersona/devices` (librería general, publicada por HID Global) y los paquetes más acotados `@digitalpersona/fingerprint` y `@digitalpersona/card`. El README de `@digitalpersona/devices` anuncia que **puede declararse obsoleto** en favor de los paquetes acotados. |
| Licencia | `[OFICIAL]` | MIT © 2019 HID Global, Inc. |
| Dependencia obligatoria: `WebSdk` | `[OFICIAL]` | Librería de navegador cargada por `<script>`. Se obtiene con HID DigitalPersona Suite, con el HID DigitalPersona SDK, o copiada de los samples. No es un módulo bundleable normal: hay que declararlo `external` en Webpack. |
| Dependencia obligatoria: **DigitalPersona Agent** | `[OFICIAL]` | Cliente Windows que "provee un canal de comunicación seguro entre el navegador y el driver del lector". Se instala con HID DigitalPersona Workstation o con el **DigitalPersona Lite Client**, hoy renombrado **HID Authentication Device Client**. Descarga citada: `crossmatch.hid.gl/lite-client`; store de HID observado: `digitalpersona.hidglobal.com/lite-client/store/5.1.0/` con **versión 5.1.0.41**, MSI y EXE, con hashes SHA256 publicados. |
| Transporte | `[OFICIAL]` | WebSocket del navegador. Un issue del repo oficial muestra el handshake contra `https://127.0.0.1:52181/get_connection`. `[INFERIDO]` El agente de HID escucha en **loopback puerto 52181**. |
| API de lector | `[OFICIAL]` | Eventos `DeviceConnected`, `DeviceDisconnected`, `QualityReported`, `SamplesAcquired`, `ErrorOccurred`. Métodos `startAcquisition(SampleFormat)`, `off()`. Se documenta `SampleFormat.Intermediate`. |
| **Límite decisivo** | `[OFICIAL]` | La FAQ de HID dice que la librería **"realiza únicamente captura de huella; no hace ningún matching"**, y que "es mala práctica correr matching en un browser porque los browsers no son confiables". Recomienda motores certificados como FingerJet. |
| Requisitos de Windows del ADC | `[PENDIENTE]` | La documentación abierta no lista versiones de Windows soportadas ni arquitectura. |
| Licencia/costo del ADC / Lite Client | `[PENDIENTE]` | No se encontró EULA ni declaración de gratuidad. Descrito como "lightweight client" para autenticar contra **DigitalPersona Identity Server**, producto comercial de HID. |

### 5.1 Por qué esto no reemplaza a nuestro agente

Confirma la premisa del brief — el navegador **no** habla con el lector por USB, necesita un componente local — y demuestra que el patrón "agente local + WebSocket a loopback" es el patrón que el propio fabricante usa.

Pero el stack de HID no cubre lo que el CRM necesita:

1. **No hace 1:N.** Es captura pura. La identificación de socio en recepción es 1:N por definición.
2. **Su razón de ser es autenticar contra DigitalPersona Identity Server**, no contra nuestro backend.
3. No nos da control sobre calidad de enrolamiento, caché offline, gestión de dispositivos por sede, ni auto-actualización controlada.
4. Su distribución al cliente final tiene condiciones `[PENDIENTE]`.

`[INFERIDO]` **Decisión:** agente propio (ADR-015). El stack JS de HID queda registrado como **plan de contingencia para captura** si el agente propio no logra acceso al sensor.

### 5.2 Puerto del agente propio

No se reutiliza `52181` (ocupado por el agente de HID) ni `17890` (el que usa el producto auditado). El agente Pulso escucha en **`21987`** sobre loopback. Ver `WEBSOCKET_PROTOCOL.md`.

## 6. Checklist de verificación pendiente (entrada obligatoria de la Etapa 7)

| # | Pregunta | Cómo se cierra | Bloquea |
|---|---|---|---|
| V1 | ¿El SDK DigitalPersona para Windows se puede licenciar para un SaaS comercial multi-cliente en Argentina, y a qué costo por instalación? | Contacto formal con HID o distribuidor. Pedir EULA por escrito. | Etapa 8 completa |
| V2 | ¿El runtime del SDK se puede redistribuir dentro de nuestro instalador? | Mismo contacto. | Instalador (Etapa 8) |
| V3 | ¿Driver WBF o legacy? ¿Conviven? | POC-01, POC-02 | POC completa |
| V4 | ¿Windows 11 x64 está soportado por el driver actual? | Abrir hidglobal.com/drivers/39477 y /49061 desde navegador + prueba real | POC completa |
| V5 | ¿Se puede capturar imagen usable sólo vía WBF, sin SDK licenciado? | POC-03B | Viabilidad del Stack B |
| V6 | Latencia real de 1:N con 20–50 identidades y proyección a 2.000 | POC-13 | Elección de dónde corre el matching |
| V7 | FAR/FRR reales con el umbral elegido | POC-14, POC-15 | Definición de umbral productivo |
| V8 | Comportamiento con 2 lectores en la misma PC | POC-16 | Soporte multi-puesto por sede |
| V9 | Recuperación tras desconexión USB y tras reinicio de Windows | POC-16, POC-17, POC-18 | GO/NO-GO |
| V10 | Revisión legal de LGPL-3 (FingerJetFX OSE) para uso comercial | Abogado / responsable legal | Viabilidad del Stack B |

## 7. Lo que este documento NO afirma

Para que no se propaguen inferencias como hechos:

- No afirma que el 4500 funcione en Windows 11. Está `[PENDIENTE]`.
- No afirma cuántos templates soporta el motor 1:N de HID.
- No afirma latencias ni tasas de error de ningún motor.
- No afirma que el SDK sea gratuito, ni que sea pago.
- No afirma que el Lite Client / ADC sea redistribuible.
- No afirma que el Stack B pueda capturar sin el SDK de HID.

## Fuentes

- [HID DigitalPersona 4500 Fingerprint Reader](https://www.hidglobal.com/products/4500-fingerprint-reader)
- [HID DigitalPersona 4500 Reader Datasheet](https://www.hidglobal.com/documents/hid-digitalpersona-4500-reader-datasheet)
- [HID DigitalPersona 4500 Fingerprint Module](https://www.hidglobal.com/products/dp4500-module)
- [HID DigitalPersona 4500 WBF (Hello) Driver](https://www.hidglobal.com/drivers/39477)
- [HID DigitalPersona 4500 Non-WBF Driver](https://www.hidglobal.com/drivers/49061)
- [DigitalPersona / TouchChip Developer Center](https://sdk.hidglobal.com/developer-center/digitalpersona-touchchip)
- [DigitalPersona SDK for Windows — datasheet (PDF)](https://sdk.hidglobal.com/sites/default/files/dtk/iam-digitalpersona-sdk-windows-ds-en_0.pdf)
- [hidglobal/digitalpersona-devices (GitHub)](https://github.com/hidglobal/digitalpersona-devices)
- [DigitalPersona Devices — Tutorial](https://hidglobal.github.io/digitalpersona-devices/tutorial.html)
- [DigitalPersona Devices — F.A.Q.](https://hidglobal.github.io/digitalpersona-devices/how-to.html)
- [@digitalpersona/fingerprint (npm)](https://www.npmjs.com/package/@digitalpersona/fingerprint)
- [@digitalpersona/websdk (npm)](https://www.npmjs.com/package/@digitalpersona/websdk)
- [Using the HID Authentication Device Client](https://docs.hidglobal.com/digitalpersona-v4.4.0/ad/user/using-adc.htm)
- [Using the DigitalPersona Lite Client](https://docs.hidglobal.com/digitalpersona-v4.3.0/ad/user/using-lite-client.htm)
- [DigitalPersona Authentication Device Client 5.1.0.41](https://digitalpersona.hidglobal.com/lite-client/store/5.1.0/index.html)
- [FingerJetFXOSE (GitHub)](https://github.com/FingerJetFXOSE/FingerJetFXOSE)
- [SourceAFIS](https://sourceafis.machinezoo.com/)
- [SourceAFIS for .NET](https://sourceafis.machinezoo.com/net)
- [DigitalPersona Biometric SDK for Windows — datasheet mirror (PDF)](https://idversol.com/wp-content/uploads/2021/02/DS-DP-SDK-Windows-2021-01-14.pdf)
- [U.are.U 4500 Reader datasheet — mirror (PDF)](https://www.dpsdk.jp/documents/202103%20DS%20En%20U.are.U%204500%20Reader.pdf)
