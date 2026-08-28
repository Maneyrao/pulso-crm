$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$AgentRoot = Join-Path $Root "apps/local-agent"
$Staging = Join-Path $AgentRoot ".release"
$Artifacts = Join-Path $AgentRoot "artifacts"
$AgentOutput = Join-Path $Staging "agent"
$DesktopOutput = Join-Path $Staging "desktop"
$SetupOutput = Join-Path $Staging "setup"

Remove-Item $Staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item $AgentOutput, $DesktopOutput, $SetupOutput, $Artifacts -ItemType Directory -Force | Out-Null

dotnet publish (Join-Path $AgentRoot "src/Pulso.Agent.Host/Pulso.Agent.Host.csproj") `
  -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false `
  -o $AgentOutput

dotnet publish (Join-Path $AgentRoot "desktop/ElTemplo.Desktop/ElTemplo.Desktop.csproj") `
  -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false `
  -o $DesktopOutput

$AgentPayload = Join-Path $AgentOutput "Pulso.Agent.Host.exe"
$DesktopPayload = Join-Path $DesktopOutput "ElTemploCRM.exe"

dotnet publish (Join-Path $AgentRoot "installer/ElTemplo.Agent.Setup/ElTemplo.Agent.Setup.csproj") `
  -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false `
  -p:AgentPayloadPath=$AgentPayload `
  -p:DesktopPayloadPath=$DesktopPayload `
  -o $SetupOutput

$Installer = Join-Path $Artifacts "ElTemploCRM-Setup.exe"
Copy-Item (Join-Path $SetupOutput "ElTemploCRM-Setup.exe") $Installer -Force
$Hash = (Get-FileHash $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
"$Hash  ElTemploCRM-Setup.exe" | Set-Content "$Installer.sha256" -Encoding ascii
Write-Output $Installer
