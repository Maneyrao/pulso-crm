# Migración a HID ADC

## Decisión

El lector HID DigitalPersona 4500 se integra desde el navegador mediante HID Authentication Device Client (ADC, antes Lite Client) y el Web SDK de HID. El agente WBF de El Templo queda retirado para las PCs configuradas con el driver Legacy/Non-WBF.

No se instalan simultáneamente el driver WBF/Windows Hello y el Legacy/Non-WBF en la misma PC de recepción. El driver Legacy es el que HID destina a aplicaciones que usan la interfaz DigitalPersona tradicional.

## Flujo activo

La web publica los scripts oficiales `@digitalpersona/websdk` y `@digitalpersona/fingerprint` durante el build. El enrolamiento y el control de acceso funcionan dentro del CRM:

1. Confirmar que ADC responde desde el navegador Windows.
2. Enumerar el lector conectado.
3. Encender el lector y capturar una muestra PNG en memoria.
4. Enviar la muestra por HTTPS a la API autenticada.
5. Extraer una plantilla SourceAFIS en el servicio privado `biometric-matcher`.
6. Borrar la imagen de memoria y guardar únicamente la plantilla cifrada.
7. Confirmar enrolamiento o acceso en el mismo modal/panel del CRM.

El recorrido productivo es `4500 -> Legacy driver -> ADC -> navegador -> API -> matcher privado`. No abre ventanas del agente WBF ni persiste imágenes de huellas.

## Seguridad

El Web SDK sólo captura. La extracción y el matching se ejecutan fuera del navegador, en servicios autenticados y aislados. La muestra viaja sobre HTTPS, tiene un límite de 512 KB y sólo existe transitoriamente en memoria. PostgreSQL nunca recibe la imagen: conserva una plantilla cifrada con claves separadas por gimnasio.

## Preparación de la PC Windows

1. Desinstalar el driver WBF/Windows Hello del DP4500 si está presente.
2. Instalar el driver HID Legacy/Non-WBF oficial.
3. Instalar HID Authentication Device Client o el paquete HID/ControlFit que lo incluya.
4. Conectar el lector y confirmar que aparece en **Authentication Devices** en Administrador de dispositivos.
5. Abrir el CRM desde esa PC, entrar a un socio y abrir **Biometría**.
6. Pulsar **Enrolar huella**, elegir el dedo y apoyar el dedo cuando el modal lo indique.
7. Confirmar que el modal muestre **Huella enrolada correctamente**.
8. Ir a **Accesos**, iniciar el lector y verificar que una huella enrolada muestre el resultado y registre la asistencia cuando corresponda.
