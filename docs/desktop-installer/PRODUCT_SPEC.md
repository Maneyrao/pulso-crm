# El Templo CRM Desktop Installer

## Goal

Deliver one branded Windows installer that a non-technical receptionist can use without a terminal, installation ID, pairing secret, certificate work, or separate agent download.

## Supported environment

- Windows 10 or Windows 11, x64.
- Administrator approval during installation.
- Internet access to the production CRM and Microsoft WebView2 bootstrapper.
- HID DigitalPersona U.are.U 4500 connected through USB-A.
- Official HID WBF driver. The legacy/non-WBF driver is unsupported.

The cloud API and PostgreSQL database remain the source of truth. The desktop app is a Windows shell for the production CRM and the native biometric integration.

## Distribution

The user downloads one file named `ElTemploCRM-Setup.exe`. It is a self-contained graphical installer, not a console application or a compressed archive. The installer contains:

- The El Templo CRM desktop application.
- The El Templo Agent Windows service.
- Local TLS certificate setup for the browser-compatible fallback.
- Repair and uninstall support.
- WebView2 detection and guided installation when missing.

Commercial releases must be Authenticode-signed. Unsigned release candidates may still trigger Microsoft SmartScreen and cannot be described as frictionless production installers.

## First-run journey

1. Welcome: identify El Templo and explain that CRM and fingerprint reader will be configured together.
2. Check this PC: Windows version, x64 architecture, administrator rights, internet, WebView2, and connected reader.
3. Sign in: CRM email and password. Password stays in memory only for the request and is never logged or persisted.
4. Choose branch: show human-readable branch names. Default to the active branch.
5. Install: copy desktop and agent payloads, provision and approve the agent automatically, protect its credential with DPAPI, install/start the Windows service, create shortcuts, and register uninstall metadata.
6. Reader test: show detected manufacturer/model and a clear driver action when WBF cannot see the reader.
7. Finish: provide `Open El Templo CRM` as the primary action.

Existing paired installations skip sign-in/provisioning and run as a repair/update.

## UX requirements

- No command prompt or terminal is visible.
- One primary action per step.
- Back, continue, retry, and cancel have predictable placement.
- Progress names user outcomes, not implementation details.
- Errors state what happened and the next action in plain Spanish.
- Controls are keyboard accessible and have at least 44 logical pixels of height.
- Motion is limited to progress/state transitions and honors reduced-motion settings.
- Brand palette: warm black, off-white, bronze/gold accent, green success, amber warning, red error.
- The installer cannot silently claim the reader works. It reports `Detected`, `Driver required`, or `Not connected`.

## Security requirements

- Never log or persist the CRM password or one-time pairing secret.
- Pairing secret is exchanged once, cleared from memory references, and never shown in the UI.
- Long-lived agent credential is stored with Windows DPAPI.
- Agent configuration is restricted to LocalSystem and Administrators.
- Fingerprint images are never persisted by setup or desktop.
- API errors shown to users are sanitized; diagnostics contain codes but no credentials.
- The local service binds only to loopback.

## Desktop application

- WPF desktop shell using the Evergreen WebView2 Runtime.
- Loads `https://pulso-crm-omega.vercel.app/login`.
- Uses a dedicated WebView2 profile under LocalAppData.
- Opens external links in the system browser.
- Shows a native retry screen when CRM connectivity fails.
- The installed agent service starts automatically with Windows.

## Acceptance gates

- Core provisioning and orchestration tests pass on macOS/Linux and Windows.
- Desktop and setup projects compile for `win-x64` from a clean checkout.
- Published setup is a PE32+ Windows x64 executable and contains both payload resources.
- Windows CI launches `ElTemploCRM-Setup.exe --self-test` successfully.
- Production API, CRM URL, and installer download respond successfully.
- Final hardware acceptance on the reception PC: install, reader detection, enrollment of four samples, identification, attendance registration, repair, reboot persistence, and uninstall.

The release is a verified release candidate until the final physical U4500 acceptance gate passes.
