# Pulso Agent local

El agente conecta el frontend con un lector de huellas por WebSocket en loopback. Para desarrollo puede usar `FakeSensor`: no necesita hardware, pero recorre el mismo flujo de pareo, token efímero, template, matching y acceso que el lector real.

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

## Límites del simulador

- Valida la integración completa de software, no la calidad biométrica de un lector físico.
- El matcher actual compara templates determinísticos. El matcher/SDK de DigitalPersona se incorpora al conectar el U.are.U real.
- Los adaptadores `hid` y `wbf` siguen siendo stubs hasta instalar y validar el driver/SDK en Windows.
- Una web desplegada con HTTPS exige `wss://`, certificado local confiable y su origen exacto en `allowedOrigins`. Para desarrollo local se usa `ws://localhost` sin TLS.

## Verificación

```bash
dotnet test apps/local-agent/Pulso.Agent.sln --nologo
pnpm --filter @pulso/contracts test
pnpm --filter @pulso/api test
pnpm --filter @pulso/web test
pnpm --filter @pulso/web typecheck
```
