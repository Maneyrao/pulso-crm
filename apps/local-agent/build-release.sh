#!/usr/bin/env bash
set -euo pipefail

if [[ "${OS:-}" != "Windows_NT" ]]; then
  echo "El instalador visual WPF debe compilarse en Windows. Usá build-release.ps1 o el workflow windows-installer." >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AGENT_ROOT="$ROOT/apps/local-agent"
STAGING="$AGENT_ROOT/.release"
ARTIFACTS="$AGENT_ROOT/artifacts"

rm -rf "$STAGING"
mkdir -p "$STAGING/agent" "$STAGING/setup" "$ARTIFACTS"

dotnet publish "$AGENT_ROOT/src/Pulso.Agent.Host/Pulso.Agent.Host.csproj" \
  -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false \
  -o "$STAGING/agent"

dotnet publish "$AGENT_ROOT/installer/ElTemplo.Agent.Setup/ElTemplo.Agent.Setup.csproj" \
  -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false \
  -p:AgentPayloadPath="$STAGING/agent/Pulso.Agent.Host.exe" \
  -o "$STAGING/setup"

cp "$STAGING/setup/ElTemploHuella-Setup.exe" "$ARTIFACTS/ElTemploHuella-Setup.exe"
sha256sum "$ARTIFACTS/ElTemploHuella-Setup.exe" > "$ARTIFACTS/ElTemploHuella-Setup.exe.sha256"
echo "$ARTIFACTS/ElTemploHuella-Setup.exe"
