$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$AgentRoot = Join-Path $Root "apps/local-agent"
$Staging = Join-Path $AgentRoot ".release"
$Artifacts = Join-Path $AgentRoot "artifacts"
$AgentOutput = Join-Path $Staging "agent"
$SetupOutput = Join-Path $Staging "setup"

Remove-Item $Staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item $AgentOutput, $SetupOutput, $Artifacts -ItemType Directory -Force | Out-Null

dotnet publish (Join-Path $AgentRoot "src/Pulso.Agent.Host/Pulso.Agent.Host.csproj") `
  -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false `
  -o $AgentOutput

$AgentPayload = Join-Path $AgentOutput "Pulso.Agent.Host.exe"

dotnet publish (Join-Path $AgentRoot "installer/ElTemplo.Agent.Setup/ElTemplo.Agent.Setup.csproj") `
  -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false `
  -p:AgentPayloadPath=$AgentPayload `
  -o $SetupOutput

$Installer = Join-Path $Artifacts "ElTemploHuella-Setup.exe"
Copy-Item (Join-Path $SetupOutput "ElTemploHuella-Setup.exe") $Installer -Force
$Hash = (Get-FileHash $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
"$Hash  ElTemploHuella-Setup.exe" | Set-Content "$Installer.sha256" -Encoding ascii
Write-Output $Installer
