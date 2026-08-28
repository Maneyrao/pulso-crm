# El Templo Huella para Windows

El instalador visual `ElTemploHuella-Setup.exe` conecta el lector con el CRM web en una sola operación:

- el servicio local que conecta el navegador con el lector HID U.are.U 4500;
- el certificado local y sus permisos;
- un acceso directo al CRM web;
- la computadora creada, vinculada y aprobada en el CRM.

No solicita Installation ID, secreto de pareo, comandos ni configuración manual de certificados. El usuario inicia sesión en el asistente, elige la sede y sigue las indicaciones en pantalla. La contraseña no se guarda.

## Instalar en recepción

Requisitos: Windows 10/11 x64, conexión a Internet, una cuenta del CRM con permiso para administrar dispositivos y el lector conectado por USB-A.

1. Desde **Configuración > Dispositivos**, pulsar **Instalar lector en esta PC**.
2. Abrirlo y aceptar el permiso de Windows.
3. Pulsar **Comenzar**, ingresar al CRM y elegir la sede.
4. Esperar la comprobación final del lector.
5. Pulsar **Abrir el CRM**.

Si Windows todavía no reconoce el U.are.U 4500, el asistente abre el [controlador WBF oficial de HID](https://www.hidglobal.com/drivers/39477) y permite probar nuevamente sin repetir la instalación. En una reparación conserva la vinculación existente.

El CRM se usa desde el navegador. El servicio `ElTemploAgent` arranca automáticamente con Windows y el escritorio recibe un acceso directo a la web. La desinstalación está disponible en **Configuración de Windows > Aplicaciones instaladas**.

## Seguridad biométrica

El agente captura mediante Windows Biometric Framework, transforma la muestra en una plantilla SourceAFIS y nunca guarda imágenes de huella. La credencial del agente se protege con Windows DPAPI y el directorio de configuración solo es accesible por administradores y `LocalSystem`.

## Compilar en Windows

```powershell
./apps/local-agent/build-release.ps1
```

El resultado queda en `apps/local-agent/artifacts/ElTemploHuella-Setup.exe`, junto con su SHA-256. El workflow `windows-installer.yml` prueba el motor, el agente y el payload embebido en `windows-latest`.

## Demo local sin lector

Para desarrollo se conserva el sensor simulado. Requiere .NET 8, API en `http://localhost:4001` y web en `http://localhost:4000`.

```bash
export NEXT_PUBLIC_AGENT_WS_URL=ws://localhost:21987/agent/v1
pnpm --filter @pulso/web dev

export PULSO_AGENT_HOME="$PWD/.pulso-agent-demo"
export PULSO_AGENT_BACKEND_BASE_URL=http://localhost:4001
export PULSO_AGENT_SENSOR=fake
export PULSO_AGENT_FAKE_IDENTITY=demo-finger-1
export PULSO_AGENT_INSTALLATION_ID="<installationId>"
export PULSO_AGENT_PAIRING_SECRET="<secreto>"
export PULSO_AGENT_TLS_ENABLED=false
dotnet run --project apps/local-agent/src/Pulso.Agent.Host/Pulso.Agent.Host.csproj
```

## Verificación

```bash
dotnet test apps/local-agent/Pulso.Agent.sln --nologo
dotnet test apps/local-agent/tests/ElTemplo.Setup.Core.Tests/ElTemplo.Setup.Core.Tests.csproj --nologo
dotnet test apps/biometric-matcher/tests/ElTemplo.BiometricMatcher.Tests/ElTemplo.BiometricMatcher.Tests.csproj
pnpm --filter @pulso/contracts test
pnpm --filter @pulso/api test
pnpm --filter @pulso/web test
pnpm --filter @pulso/web typecheck
```

El build automatizado prueba software y empaquetado. La aceptación definitiva requiere una pasada física con el U.are.U 4500 en la PC de recepción; ver `docs/desktop-installer/WINDOWS_ACCEPTANCE.md`.
