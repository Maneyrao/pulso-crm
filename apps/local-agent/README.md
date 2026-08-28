# El Templo Agent local

El agente conecta el CRM web con el lector HID DigitalPersona U.are.U 4500 por WebSocket TLS en loopback. Captura mediante Windows Biometric Framework, extrae plantillas SourceAFIS y nunca guarda imágenes de huella.

## Instalar en la PC de recepción

Requisitos: Windows 10/11 x64, lector conectado por USB-A y driver oficial **HID DigitalPersona 4500 WBF**. No hace falta instalar .NET.

1. En el CRM, abrir **Configuración > Dispositivos** y crear un agente para la sede. Dejar abierto el cuadro con `Installation ID` y `Secreto de pareo`.
2. Ejecutar `ElTemploAgentSetup.exe` como administrador e ingresar esos dos valores.
3. Si el instalador no detecta el lector, instalar el [driver WBF oficial de HID](https://www.hidglobal.com/drivers/39477), reiniciar Windows y volver a ejecutar el instalador. El driver legacy/non-WBF no sirve para este adaptador.
4. Volver a **Configuración > Dispositivos** y pulsar **Aprobar**. En hasta 30 segundos el agente y el lector deben figurar online.
5. Abrir un socio, registrar consentimiento y enrolar un dedo. Después, **Ingreso por huella** registra la asistencia y muestra la decisión de acceso en el CRM.

El instalador crea el servicio Windows `ElTemploAgent` bajo `LocalSystem`, un certificado local confiable para `127.0.0.1`, configuración en `%ProgramData%\Pulso` y una credencial protegida con DPAPI. El servicio arranca automáticamente con Windows.

El instalador todavía no está firmado con un certificado comercial. Windows SmartScreen puede mostrar **Más información > Ejecutar de todas formas** en la primera instalación.

Desinstalación desde una terminal elevada:

```powershell
.\ElTemploAgentSetup.exe --uninstall
```

## Demo local sin lector

Requisitos: .NET 8, API en `http://localhost:4001` y web en `http://localhost:4000`.

1. En el CRM, abrir **Configuración > Dispositivos**, crear un agente para la sede y conservar el `installationId` y el secreto de pareo mostrados una sola vez.
2. Antes de levantar Next.js, configurar el WebSocket local:

```bash
export NEXT_PUBLIC_AGENT_WS_URL=ws://localhost:21987/agent/v1
pnpm --filter @pulso/web dev
```

3. En otra terminal, arrancar el agente reemplazando los dos valores de pareo:

```bash
export PULSO_AGENT_HOME="$PWD/.pulso-agent-demo"
export PULSO_AGENT_BACKEND_BASE_URL=http://localhost:4001
export PULSO_AGENT_SENSOR=fake
export PULSO_AGENT_FAKE_IDENTITY=demo-finger-1
export PULSO_AGENT_INSTALLATION_ID="<installationId>"
export PULSO_AGENT_PAIRING_SECRET="<secreto>"
export PULSO_AGENT_TLS_ENABLED=false

dotnet run --project apps/local-agent/src/Pulso.Agent.Host/Pulso.Agent.Host.csproj
```

El primer arranque intercambia el secreto por una credencial de agente y la guarda bajo `PULSO_AGENT_HOME`. El secreto no se persiste y no puede reutilizarse. Volver al CRM y aprobar el agente. En hasta 30 segundos, agente y lector deben figurar online.

## Probar enrolamiento e identificación

1. Abrir un socio, registrar el consentimiento biométrico y enrolar un dedo.
2. Mantener `PULSO_AGENT_FAKE_IDENTITY=demo-finger-1`: esa identidad genera el mismo template en enrolamiento e identificación.
3. Abrir `/access`, activar **Ingreso por huella** y esperar el resultado.
4. Para simular otra persona, detener el agente y reiniciarlo con otro valor, por ejemplo `PULSO_AGENT_FAKE_IDENTITY=demo-finger-2`.

Cada lectura pide un `deviceToken` IDENTIFY nuevo. El agente recibe únicamente el token, la sede y el ID del lector; nunca recibe nombre, documento, membresía ni decisión de acceso.

## Estado del lector real

- Captura WBF, conversión ANSI-381, calidad, plantillas y matching SourceAFIS están implementados y probados automáticamente.
- El backend productivo y su migración `SOURCEAFIS_3_14` están desplegados.
- Falta la validación final sobre el U.are.U 4500 físico en Windows: detección, diez capturas repetidas, desconexión USB y calibración del umbral con huellas reales.
- El adaptador `hid` legacy sigue siendo un stub; producción usa exclusivamente `wbf`.

## Verificación

```bash
dotnet test apps/local-agent/Pulso.Agent.sln --nologo
dotnet test apps/biometric-matcher/tests/ElTemplo.BiometricMatcher.Tests/ElTemplo.BiometricMatcher.Tests.csproj
pnpm --filter @pulso/contracts test
pnpm --filter @pulso/api test
pnpm --filter @pulso/web test
pnpm --filter @pulso/web typecheck
```
