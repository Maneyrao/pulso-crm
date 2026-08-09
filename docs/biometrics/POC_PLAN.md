# Plan de prueba de concepto — U.are.U 4500

Etapa 7. Fecha: 2026-08-09.
Estado: propuesto.

## 0. Regla que gobierna esta etapa

**La Etapa 8 (biometría productiva) no puede comenzar hasta que esta POC termine con un `GO` o `GO WITH CONDITIONS` documentado y aprobado.**

El código de la POC es desechable. No se promueve a producción. Su único producto es **conocimiento verificado** y un informe de decisión.

## 1. Por qué existe

Los documentos de partida contienen supuestos sobre el hardware que no están verificados (`UAREU_4500_RESEARCH.md` marca 10 puntos `[PENDIENTE]`), incluido uno que ya se demostró falso: el 4500 no almacena templates en el dispositivo. Construir la Etapa 8 sobre supuestos no verificados es la forma más cara de descubrir que el hardware no hace lo que se creía.

## 2. Prerrequisitos

| # | Prerrequisito | Estado actual | Bloqueante |
|---|---|---|---|
| P1 | Lector U.are.U 4500 físico | No adquirido | Sí |
| P2 | PC o VM con **Windows 10 x64 y Windows 11 x64** | La máquina de desarrollo es macOS | Sí |
| P3 | .NET 8 SDK instalado en Windows | No instalado | Sí |
| P4 | Driver de HID descargado (WBF y non-WBF) | No descargado | Sí |
| P5 | Acceso al SDK DigitalPersona y su licencia por escrito (V1, V2) | **No resuelto** | Sí para Stack A |
| P6 | 20–50 personas dispuestas a enrolarse, con consentimiento | No conseguido | Sí para POC-12 en adelante |
| P7 | Texto de consentimiento para la prueba | No escrito | Sí |

> **P2 es importante y fácil de subestimar.** El agente es una aplicación Windows y la máquina de desarrollo actual es macOS. Hay que resolver esto (VM con Parallels/UTM, o una PC dedicada) antes de escribir una línea.
>
> **P6 con consentimiento real.** Aunque sea una prueba, se están capturando datos biométricos de personas. Se usa el texto de consentimiento de P7, se guardan los datos en una base local aislada, y **se destruyen al terminar la POC**, dejando constancia.

## 3. Estructura del proyecto de POC

Fuera del monorepo, en un repositorio o carpeta aparte:

```
poc-uareu4500/
  src/
    Poc.Console/          # CLI con un comando por experimento
    Poc.Sensor/           # wrapper del SDK / WBF
    Poc.Matching/         # 1:1 y 1:N
    Poc.LocalWs/          # servidor WS mínimo (POC-19)
  data/
    templates.sqlite      # base local, cifrada, se destruye al final
  results/
    POC_RESULTS.md        # se completa a medida
    raw/                  # mediciones crudas, CSV
  CONSENT.md
  README.md
```

## 4. Los 21 experimentos

Cada uno tiene: objetivo, procedimiento, criterio de éxito, y qué se registra. El resultado se anota en `results/POC_RESULTS.md` con fecha, versión de driver/SDK y sistema operativo.

---

### POC-01 — Instalación del driver

**Objetivo.** Determinar cuál de los dos drivers de HID necesita el stack elegido y si conviven.
**Procedimiento.** Instalar el driver WBF en una máquina limpia. Registrar versión exacta. En otra máquina limpia, instalar el non-WBF. En una tercera, ambos.
**Éxito.** Se sabe con certeza cuál usar y si la coexistencia rompe algo.
**Registrar.** Nombre y versión de cada driver, origen de descarga, errores del instalador, si requiere reinicio.
**Cierra.** V3.

### POC-02 — Reconocimiento en Windows 10 y 11

**Objetivo.** Verificar que el sistema reconoce el lector. **Windows 11 no está confirmado por la documentación accesible.**
**Procedimiento.** En Windows 10 x64 y en Windows 11 x64: enchufar, revisar el Administrador de dispositivos, verificar que no aparezca con advertencia. Probar en 3 puertos USB distintos, incluido un hub.
**Éxito.** Reconocido sin advertencias en ambos sistemas.
**Si falla en Windows 11.** Es un hallazgo de primer orden: condiciona qué PCs pueden usar el sistema. Se documenta y se escala antes de continuar.
**Registrar.** Build exacta de Windows, nombre del dispositivo, VID/PID, comportamiento en hub.
**Cierra.** V4.

### POC-03 — Acceso mediante SDK (Stack A)

**Objetivo.** Compilar y ejecutar un programa mínimo en C# que inicialice el SDK.
**Procedimiento.** Proyecto .NET 8 con la referencia al SDK. Inicializar y cerrar limpiamente.
**Éxito.** Compila y ejecuta sin errores; se documenta cómo se referencia el SDK (NuGet, DLL nativa, interop, arquitectura x64/x86).
**Registrar.** Versión del SDK, forma de referencia, dependencias nativas, si funciona en `AnyCPU` o requiere `x64`.

### POC-03B — Acceso sólo vía WBF (viabilidad del Stack B)

**Objetivo.** Determinar si se puede **capturar una imagen usable** con la API WBF de Windows (`WinBio`) sin el SDK licenciado.
**Procedimiento.** Programa mínimo que use `WinBioOpenSession` / `WinBioCaptureSample` y guarde la imagen.
**Éxito.** Se obtiene una imagen de calidad suficiente para FingerJetFX OSE.
**Si falla.** El Stack B queda descartado y **la licencia del SDK pasa a ser un bloqueante absoluto**.
**Registrar.** Formato y dimensiones de la imagen, si WBF permite acceso a la imagen cruda o sólo a la verificación contra el almacén de Windows Hello.
**Cierra.** V5.

### POC-04 — Detección y enumeración del lector

**Objetivo.** Enumerar dispositivos desde código y obtener número de serie.
**Éxito.** Se lista el lector con un identificador estable entre reinicios.
**Registrar.** Campos disponibles del dispositivo; si el serial es estable.

### POC-05 — Captura de una muestra

**Objetivo.** Capturar una imagen.
**Procedimiento.** Iniciar captura, apoyar el dedo, obtener la muestra. Medir el tiempo desde el inicio hasta la muestra.
**Éxito.** Se obtiene la muestra en menos de 3 s con el dedo ya apoyado.
**Registrar.** Latencia, formato, tamaño.

### POC-06 — Medición de calidad

**Objetivo.** Verificar que existe una métrica de calidad utilizable.
**Procedimiento.** Capturar 20 muestras en condiciones variadas: dedo seco, húmedo, sucio, parcialmente apoyado, con poca presión, con mucha presión.
**Éxito.** La métrica correlaciona con la calidad real observada y permite fijar un umbral.
**Registrar.** Rango de la escala, valores por condición, umbral propuesto para el enrolamiento y para la identificación (pueden ser distintos).

### POC-07 — Captura de varias muestras

**Objetivo.** Determinar cuántas muestras hacen falta para un buen template.
**Procedimiento.** Enrolar el mismo dedo con 2, 3, 4 y 5 muestras. Comparar la calidad resultante y el rendimiento posterior en verificación.
**Éxito.** Se define `samplesRequired` con base empírica, no por copiar un valor de un tutorial.
**Registrar.** Curva calidad vs. cantidad de muestras.

### POC-08 — Generación de template

**Objetivo.** Producir un template y conocer sus características.
**Procedimiento.** Generar templates en cada formato disponible: propietario, ANSI/INCITS 378-2004, ISO/IEC 19794-2:2005.
**Éxito.** Se obtiene template en al menos un formato estándar.
**Registrar.** Tamaño en bytes de cada formato, si el formato estándar pierde precisión respecto del propietario, si el matcher acepta ambos.
**Importante.** El formato estándar reduce el lock-in con el proveedor. Si el propietario rinde significativamente mejor, se documenta el trade-off.

### POC-09 — Enrolamiento

**Objetivo.** Flujo completo de enrolamiento con persistencia.
**Procedimiento.** Enrolar 5 dedos distintos, guardar los templates cifrados en la base local.
**Éxito.** Los templates se guardan y se recuperan correctamente.
**Registrar.** Duración total del enrolamiento percibida por el usuario.

### POC-10 — Verificación 1:1

**Objetivo.** Comparar una huella contra un template conocido.
**Procedimiento.** 50 verificaciones genuinas (mismo dedo) y 50 impostoras (otros dedos) contra cada template.
**Éxito.** Separación clara de scores entre genuinas e impostoras.
**Registrar.** Distribución de scores; score mínimo genuino; score máximo impostor; solapamiento.

### POC-11 — Identificación 1:N

**Objetivo.** Verificar que el 1:N funciona y con qué API.
**Procedimiento.** Con 5 identidades cargadas, identificar cada una 10 veces.
**Éxito.** Identificación correcta y sin ambigüedad.
**Registrar.** API usada, si el motor devuelve el mejor candidato o una lista con scores. **Importante para la ambigüedad**: si sólo devuelve el mejor, hay que implementar la regla de "dos candidatos cercanos ⇒ no match" en nuestro código.

### POC-12 — Prueba con 20–50 identidades

**Objetivo.** Comportamiento con un padrón realista.
**Procedimiento.** Enrolar entre 20 y 50 personas reales, con consentimiento. Cada una intenta identificarse 5 veces en momentos distintos (recién enrolada, otro día, con las manos frías, después de entrenar).
**Éxito.** Tasa de identificación correcta ≥ 95% con FAR = 0 en la muestra.
**Registrar.** Matriz completa de intentos: identidad esperada, identidad devuelta, score, calidad, condición.
**Nota.** "Después de entrenar" es la condición más realista y la más dura: manos húmedas, sudor. Si el sistema falla ahí, falla en el caso de uso real.

### POC-13 — Medición de latencia

**Objetivo.** Cuantificar el costo del 1:N y proyectarlo.
**Procedimiento.** Medir el tiempo de matching con 10, 50, 100, 500, 1.000 y 2.000 templates (los sintéticos se generan replicando y perturbando los reales, o con templates de prueba del SDK). Medir por separado: captura, extracción, matching.
**Éxito.** Se conoce la curva y se puede proyectar a 2.000 socios.
**Registrar.** p50, p95, p99 por tamaño de padrón. Si la curva es lineal, cuadrática o si el motor usa indexación.
**Decisión que habilita.** Si el matching de 2.000 templates tarda más de ~500 ms, hay que evaluar: pre-filtrado por sede (ya previsto), caché de templates descifrados en memoria, o paralelización.
**Cierra.** V6.

### POC-14 — Falsos rechazos (FRR)

**Objetivo.** Medir cuántas veces el sistema no reconoce a alguien que sí está enrolado.
**Procedimiento.** Con el padrón de POC-12, 500 intentos genuinos en condiciones variadas.
**Éxito.** FRR ≤ 5% al umbral que da FAR ≤ 0,01%.
**Registrar.** FRR por persona (algunas personas tienen huellas difíciles — es un hecho conocido y hay que saber qué proporción son), por condición y por calidad de captura.
**Importante.** Identificar si hay personas para las que el sistema simplemente no funciona. Es información operativa crítica: esos socios necesitan otro método y hay que decirlo de antemano.

### POC-15 — Intentos no reconocidos y falsas aceptaciones (FAR)

**Objetivo.** Medir si el sistema acepta a alguien que no está enrolado.
**Procedimiento.** 10 personas **no** enroladas intentan identificarse, 20 veces cada una.
**Éxito.** **Cero** falsas aceptaciones. Cualquier falsa aceptación es un hallazgo crítico que obliga a subir el umbral y repetir POC-14.
**Registrar.** Score máximo alcanzado por un impostor. Ese número, más un margen, es el piso del umbral.
**Cierra.** V7.

### POC-16 — Desconexión USB y múltiples lectores

**Objetivo.** Comportamiento ante desconexión y con dos lectores.
**Procedimiento.**
(a) Desenchufar durante una captura. (b) Desenchufar en idle. (c) Conectar dos lectores y enumerar. (d) Capturar en uno mientras el otro está conectado.
**Éxito.** No hay cuelgue ni excepción sin manejar; el evento de desconexión es detectable desde código; con dos lectores se puede elegir cuál usar.
**Registrar.** Qué excepción lanza el SDK, si hay evento de desconexión o hay que hacer polling, cuánto tarda en detectarse.
**Cierra.** V8 y parte de V9.

### POC-17 — Reconexión

**Objetivo.** El sistema se recupera solo.
**Procedimiento.** Desenchufar, esperar 30 s, reenchufar. Repetir 10 veces. Probar también en otro puerto USB.
**Éxito.** Detección en menos de 5 s, sin reiniciar la aplicación, las 10 veces.
**Registrar.** Tiempo de detección, si el número de serie se mantiene, si hace falta reinicializar el SDK.

### POC-18 — Reinicio de Windows

**Objetivo.** El sistema arranca solo.
**Procedimiento.** Configurar la aplicación de POC como servicio con arranque automático. Reiniciar Windows 5 veces, incluyendo un reinicio **sin iniciar sesión de usuario**.
**Éxito.** El servicio arranca y detecta el lector sin intervención, incluso sin sesión iniciada.
**Registrar.** Tiempo hasta estar operativo, errores en el visor de eventos.
**Importante.** El caso "sin iniciar sesión" es el real: la PC de recepción se prende y tiene que funcionar antes de que alguien se loguee.
**Cierra.** V9.

### POC-19 — Comunicación agente ↔ navegador ↔ backend

**Objetivo.** Validar el patrón completo de extremo a extremo.
**Procedimiento.** Servidor WS mínimo en `127.0.0.1:21987` con TLS autofirmado instalado en Trusted Root. Página HTML de prueba que se conecta, dispara una identificación, y un backend mínimo que recibe el template.
**Éxito.** El navegador se conecta por `wss` sin advertencias, dispara la captura y el template llega al backend.
**Registrar.** Si el certificado autofirmado en Trusted Root es aceptado por Chrome, Edge y Firefox. **Firefox usa su propio almacén de certificados** — verificar explícitamente; si no funciona, es una limitación de navegadores soportados que hay que declarar.
**Nota.** Éste es el experimento que valida la decisión de TLS local de `WEBSOCKET_PROTOCOL.md` §3.

### POC-20 — Cancelación y timeout

**Objetivo.** Poder abortar siempre.
**Procedimiento.** Iniciar una captura y cancelarla: (a) inmediatamente, (b) a mitad, (c) con el lector desconectado, (d) dejar vencer el timeout sin apoyar el dedo.
**Éxito.** En los cuatro casos la operación termina limpiamente y el lector queda disponible para la siguiente.
**Registrar.** Si el SDK soporta cancelación real o hay que abandonar el hilo (importante: un hilo abandonado es una fuga de recursos que aparece a las horas de uso).

### POC-21 — Manejo seguro de errores

**Objetivo.** Ningún error expone datos ni deja el sistema en estado inconsistente.
**Procedimiento.** Provocar: SDK no inicializado, lector ausente, template corrupto, base local inaccesible, backend caído, disco lleno.
**Éxito.** Cada caso produce un error clasificado y accionable; ningún log contiene imágenes ni templates; los buffers se limpian.
**Registrar.** Catálogo de errores reales del SDK, mapeado a los códigos de `WEBSOCKET_PROTOCOL.md` §7.

---

## 5. Verificación de memoria (transversal)

En paralelo a POC-09 y POC-20, verificar que las imágenes y los templates no queden en memoria tras la operación:

- Tomar un volcado de memoria del proceso después de una captura y buscar patrones de la imagen.
- Confirmar que los buffers se sobrescriben, no sólo se liberan (en .NET esto requiere cuidado: `byte[]` liberado ≠ borrado; usar `CryptographicOperations.ZeroMemory` o equivalente).

No es un experimento numerado porque es una verificación de implementación, pero es condición para el `GO`.

## 6. Criterios de decisión

### `GO`

Todos verdaderos:

- POC-01 a POC-11 exitosos.
- POC-12: identificación correcta ≥ 95% con 20–50 identidades reales.
- POC-15: **cero** falsas aceptaciones.
- POC-14: FRR ≤ 5% al umbral elegido.
- POC-13: p95 de matching proyectado a 2.000 templates ≤ 500 ms.
- POC-16 a POC-18: recuperación automática ante desconexión y reinicio.
- POC-19: `wss` local funciona en al menos Chrome y Edge.
- POC-20: cancelación confiable.
- V1 y V2 cerrados: licencia del SDK viable por escrito **o** Stack B demostrado viable en POC-03B.
- Verificación de memoria superada.

### `GO WITH CONDITIONS`

El núcleo funciona pero hay limitaciones acotadas y documentadas. Ejemplos plausibles:

- Firefox no acepta el certificado local → se declara soporte de Chrome/Edge y se documenta.
- Windows 11 requiere un driver distinto → se documenta el requisito de instalación.
- FRR entre 5% y 10% → se acepta con el acceso por documento como respaldo obligatorio y visible.
- Latencia de 2.000 templates entre 500 ms y 1 s → se implementa caché en memoria del conjunto de candidatos por sede.

Cada condición se convierte en una tarea obligatoria de la Etapa 8, no en un pendiente informal.

### `NO-GO`

Cualquiera de estos:

- Una sola falsa aceptación en POC-15 que no se resuelva subiendo el umbral sin romper el FRR.
- FRR > 15%: el sistema es inusable en recepción.
- El lector no funciona en Windows 11 y no hay solución de HID.
- No se puede licenciar el SDK **y** POC-03B demuestra que WBF no da acceso a la imagen.
- No hay forma de detectar la desconexión USB → cuelgues en producción.
- El matching de 2.000 templates supera 3 s incluso con optimizaciones.
- La revisión legal de LGPL-3 impide el Stack B y el Stack A no es viable económicamente.

Ante `NO-GO`: la Etapa 8 no se ejecuta. El producto se vende sin biometría (que es exactamente por qué la biometría está después del MVP vendible) y se evalúa hardware alternativo en un ciclo posterior.

## 7. Informe final

`docs/biometrics/POC_RESULTS.md`, con esta estructura:

```markdown
# Resultado de la POC U.are.U 4500
Fecha de inicio / fin:
Ejecutado por:
Hardware: modelo, número de serie, fecha de compra
Software: driver (nombre + versión), SDK (nombre + versión), .NET, Windows (build exacta)
Stack evaluado: A / B / ambos

## Veredicto: GO | GO WITH CONDITIONS | NO-GO

## Condiciones (si aplica)
1. …  → tarea T-8.x

## Resultados por experimento
| # | Experimento | Resultado | Evidencia | Notas |

## Métricas clave
- Umbral recomendado:
- FAR medido:
- FRR medido:
- Latencia de matching p95 (N=50 / 500 / 2000):
- Muestras recomendadas para enrolamiento:
- Formato de template recomendado:
- Calidad mínima recomendada (enrolamiento / identificación):

## Preguntas cerradas
V1..V10 con su respuesta

## Preguntas que siguen abiertas

## Recomendaciones para la Etapa 8

## Destrucción de datos de prueba
Fecha, método, responsable.
```

## 8. Al terminar

1. Completar `POC_RESULTS.md`.
2. Actualizar `UAREU_4500_RESEARCH.md`: los `[PENDIENTE]` cerrados pasan a `[VERIFICADO]` con fecha y evidencia.
3. Actualizar ADR-014 y ADR-015 con lo aprendido; si algo los contradice, se escribe un ADR que los supersede.
4. Fijar los valores de configuración (`BIOMETRIC_MATCH_THRESHOLD`, `samplesRequired`, umbrales de calidad) en `DEPLOYMENT_PLAN.md`.
5. **Destruir los datos biométricos de prueba** y dejar constancia escrita.
6. Presentar el veredicto y esperar aprobación antes de la Etapa 8.
