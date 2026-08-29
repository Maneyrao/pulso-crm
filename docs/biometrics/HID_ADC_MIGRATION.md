# Migración a HID ADC

## Decisión

El lector HID DigitalPersona 4500 se integra desde el navegador mediante HID Authentication Device Client (ADC, antes Lite Client) y el Web SDK de HID. El agente WBF de El Templo queda retirado para las PCs configuradas con el driver Legacy/Non-WBF.

No se instalan simultáneamente el driver WBF/Windows Hello y el Legacy/Non-WBF en la misma PC de recepción. El driver Legacy es el que HID destina a aplicaciones que usan la interfaz DigitalPersona tradicional.

## Qué entrega esta etapa

La web publica los scripts oficiales `@digitalpersona/websdk` y `@digitalpersona/fingerprint` durante el build. En la pestaña **Biometría** aparece **Conexión HID DigitalPersona**, que permite:

1. Confirmar que ADC responde desde el navegador Windows.
2. Enumerar el lector conectado.
3. Pedir una captura de diagnóstico en formato intermedio.
4. Descartar la muestra inmediatamente, sin guardarla, mostrarla ni enviarla a la API.

Esta prueba valida `4500 -> Legacy driver -> ADC -> navegador`. No es enrolamiento ni identificación.

## Requisito pendiente para enrolar e identificar

El Web SDK de HID captura muestras, pero no hace matching en el navegador. Para completar el flujo de producción se debe obtener el motor autorizado de HID (DigitalPersona/FingerJet SDK o DigitalPersona Authentication Server) y crear un adaptador local que produzca templates compatibles. Ese adaptador será el único que use los endpoints autenticados de enrolamiento e identificación existentes.

El backend actual conserva las plantillas cifradas y hace el matching fuera del navegador. No se deben enviar imágenes PNG ni templates desde una UI sin un canal autenticado de dispositivo.

## Preparación de la PC Windows

1. Desinstalar el driver WBF/Windows Hello del DP4500 si está presente.
2. Instalar el driver HID Legacy/Non-WBF oficial.
3. Instalar HID Authentication Device Client o el paquete HID/ControlFit que lo incluya.
4. Conectar el lector y confirmar que aparece en **Authentication Devices** en Administrador de dispositivos.
5. Abrir el CRM desde esa PC, ir a un socio, abrir **Biometría** y pulsar **Comprobar HID**.
6. Con estado listo, pulsar **Probar captura** y apoyar el dedo. El CRM debe confirmar la muestra descartada.
