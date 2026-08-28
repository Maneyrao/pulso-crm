#!/usr/bin/env bash
set -euo pipefail

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

cp "$STAGING/setup/ElTemploAgentSetup.exe" "$ARTIFACTS/ElTemploAgentSetup.exe"
shasum -a 256 "$ARTIFACTS/ElTemploAgentSetup.exe" > "$ARTIFACTS/ElTemploAgentSetup.exe.sha256"
echo "$ARTIFACTS/ElTemploAgentSetup.exe"
