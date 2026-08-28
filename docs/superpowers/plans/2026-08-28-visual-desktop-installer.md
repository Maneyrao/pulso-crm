# Visual Desktop Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish one visual Windows installer that installs El Templo CRM Desktop and El Templo Agent with guided, automatic provisioning.

**Architecture:** A cross-platform `ElTemplo.Setup.Core` library owns testable workflow and CRM provisioning contracts. A WPF setup application owns Windows operations and the branded wizard; a separate WPF WebView2 application hosts the existing production CRM. The release script publishes both `win-x64` payloads and embeds them into one self-contained setup executable.

**Tech Stack:** .NET 8, WPF, WebView2 Evergreen, Windows Service, WBF, DPAPI, xUnit, GitHub Actions, GitHub Releases.

**Spec:** `docs/desktop-installer/PRODUCT_SPEC.md`

## Global Constraints

- Windows 10/11 x64 only.
- No terminal, installation ID, or pairing secret in the normal visual flow.
- Never persist or log passwords, pairing secrets, fingerprint images, or raw templates.
- Existing production CRM/API URLs remain authoritative.
- Existing paired installations must upgrade without creating duplicate agents.
- The physical U4500 acceptance test remains required before a 100% hardware claim.

---

### Task 1: Testable setup workflow

**Files:**
- Create: `apps/local-agent/installer/ElTemplo.Setup.Core/ElTemplo.Setup.Core.csproj`
- Create: `apps/local-agent/installer/ElTemplo.Setup.Core/SetupWorkflow.cs`
- Create: `apps/local-agent/installer/ElTemplo.Setup.Core/SetupModels.cs`
- Create: `apps/local-agent/installer/ElTemplo.Setup.Core/SetupContracts.cs`
- Create: `apps/local-agent/tests/ElTemplo.Setup.Core.Tests/ElTemplo.Setup.Core.Tests.csproj`
- Create: `apps/local-agent/tests/ElTemplo.Setup.Core.Tests/SetupWorkflowTests.cs`

**Interfaces:**
- Produces `SetupWorkflow`, `ICrmProvisioner`, `IAgentPairer`, `IInstallerPlatform`, `IReaderProbe`, `SetupProgress`, and `SetupResult`.
- Existing-pairing flow skips CRM provisioning; fresh flow executes create, pair, approve in that order.

- [ ] Write failing tests for fresh install ordering, repair skip, progress stages, and sanitized errors.
- [ ] Run the new test project and verify failures are caused by missing workflow types.
- [ ] Implement the minimal orchestration and models.
- [ ] Run the new tests and all existing agent tests.

### Task 2: CRM provisioning client

**Files:**
- Create: `apps/local-agent/installer/ElTemplo.Setup.Core/CrmProvisioningClient.cs`
- Create: `apps/local-agent/tests/ElTemplo.Setup.Core.Tests/CrmProvisioningClientTests.cs`

**Interfaces:**
- Produces `LoginAsync`, `CreateAgentAsync`, and `ApproveAgentAsync` behind `ICrmProvisioner`.
- Uses an in-memory cookie container and sends the double-submit CSRF header for mutations.

- [ ] Write failing HTTP-handler tests for login branches, CSRF, problem details, and password redaction.
- [ ] Verify the tests fail before implementation.
- [ ] Implement the production HTTP client against the CRM same-origin API proxy.
- [ ] Verify focused and full core tests pass.

### Task 3: Desktop CRM shell

**Files:**
- Create: `apps/local-agent/desktop/ElTemplo.Desktop/ElTemplo.Desktop.csproj`
- Create: `apps/local-agent/desktop/ElTemplo.Desktop/App.xaml`
- Create: `apps/local-agent/desktop/ElTemplo.Desktop/App.xaml.cs`
- Create: `apps/local-agent/desktop/ElTemplo.Desktop/MainWindow.xaml`
- Create: `apps/local-agent/desktop/ElTemplo.Desktop/MainWindow.xaml.cs`
- Create: `apps/local-agent/desktop/ElTemplo.Desktop/Assets/el-templo-logo.png`

**Interfaces:**
- Produces `ElTemploCRM.exe`, a WPF WebView2 shell for the production CRM.
- Uses a dedicated LocalAppData profile and exposes visible loading/retry/offline states.

- [ ] Add the Windows-targeted project and branded XAML shell.
- [ ] Implement WebView2 initialization, external-link handling, and retry.
- [ ] Cross-build and publish for `win-x64`.

### Task 4: Visual setup application

**Files:**
- Replace: `apps/local-agent/installer/ElTemplo.Agent.Setup/Program.cs`
- Modify: `apps/local-agent/installer/ElTemplo.Agent.Setup/ElTemplo.Agent.Setup.csproj`
- Create: `apps/local-agent/installer/ElTemplo.Agent.Setup/App.xaml`
- Create: `apps/local-agent/installer/ElTemplo.Agent.Setup/App.xaml.cs`
- Create: `apps/local-agent/installer/ElTemplo.Agent.Setup/MainWindow.xaml`
- Create: `apps/local-agent/installer/ElTemplo.Agent.Setup/MainWindow.xaml.cs`
- Create: `apps/local-agent/installer/ElTemplo.Agent.Setup/WindowsInstallerPlatform.cs`
- Create: `apps/local-agent/installer/ElTemplo.Agent.Setup/AgentPairer.cs`
- Create: `apps/local-agent/installer/ElTemplo.Agent.Setup/ReaderProbe.cs`

**Interfaces:**
- Consumes the Task 1 workflow and Task 2 provisioning client.
- Produces a seven-step branded wizard, `--self-test`, repair, and uninstall modes.

- [ ] Implement wizard state and visual screens with no console output in normal mode.
- [ ] Implement payload extraction, certificate, service, shortcut, uninstall registration, and logging.
- [ ] Implement automatic login/branch/provisioning and existing-pairing repair.
- [ ] Implement reader detection, retry, official-driver action, and finish launch.
- [ ] Cross-build the setup project.

### Task 5: Unified release and Windows CI

**Files:**
- Modify: `apps/local-agent/build-release.sh`
- Modify: `apps/local-agent/README.md`
- Modify: `apps/local-agent/Pulso.Agent.sln`
- Create: `.github/workflows/windows-installer.yml`

**Interfaces:**
- Produces `apps/local-agent/artifacts/ElTemploCRM-Setup.exe` and checksum.
- CI executes setup core tests, publishes all Windows payloads, and runs `--self-test` on `windows-latest`.

- [ ] Update release build to embed agent and desktop payloads.
- [ ] Add projects to the solution and document visual installation/repair.
- [ ] Run all JS/.NET tests and local cross-publish.
- [ ] Push and verify the Windows workflow succeeds.
- [ ] Publish GitHub Release `v0.2.0` with setup and checksum.
- [ ] Verify public download headers, digest, production CRM/API, and clean git state.

### Task 6: Physical acceptance

**Files:**
- Create: `docs/desktop-installer/WINDOWS_ACCEPTANCE.md`

**Interfaces:**
- Produces a repeatable sign-off record for the reception PC and HID U4500.

- [ ] Install on the Windows reception PC from the public release.
- [ ] Verify graphical onboarding, agent auto-start, driver state, four-sample enrollment, identification, attendance, reboot persistence, repair, and uninstall.
- [ ] Record the result and only then label the installer hardware-verified.
