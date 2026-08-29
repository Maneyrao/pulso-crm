# El Templo Huella Windows Connector

## Goal

Deliver one branded Windows installer that connects the USB fingerprint reader to the web CRM without a terminal, installation ID, pairing secret, certificate work, or desktop CRM copy.

## Supported environment

- Windows 10 or Windows 11, x64.
- Administrator approval during installation.
- Internet access to the production CRM and API.
- HID DigitalPersona U.are.U 4500 connected through USB-A.
- Official HID WBF driver. The legacy/non-WBF driver is unsupported.

The cloud API and PostgreSQL database remain the source of truth. The CRM runs in the user's browser; only the native biometric bridge runs locally.

## Distribution

The user downloads one file named `ElTemploHuella-Setup.exe`. It is a self-contained graphical installer, not a console application or a compressed archive. The installer contains:

- The El Templo Agent interactive Windows connector.
- Local TLS certificate setup for the browser-to-agent connection.
- Repair and uninstall support.
- A shortcut that opens the production web CRM in the default browser.

Commercial releases must be Authenticode-signed. Unsigned release candidates may still trigger Microsoft SmartScreen and cannot be described as frictionless production installers.

## First-run journey

1. Welcome: identify El Templo and explain that the fingerprint reader will be connected to the web CRM.
2. Check this PC: Windows version, x64 architecture, administrator rights, internet, and connected reader.
3. Sign in: CRM email and password. Password stays in memory only for the request and is never logged or persisted.
4. Choose branch: show human-readable branch names. Default to the active branch.
5. Install: copy the agent payload, provision and approve it automatically, protect its credential with DPAPI, register/start the interactive connector for the current Windows user, create the web shortcut, and register uninstall metadata.
6. Reader test: show detected manufacturer/model and a clear driver action when WBF cannot see the reader.
7. Finish: provide `Open web CRM` as the primary action.

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
- Agent configuration is restricted to the current Windows user, LocalSystem and Administrators.
- Fingerprint images are never persisted by setup or the local agent.
- API errors shown to users are sanitized; diagnostics contain codes but no credentials.
- The local service binds only to loopback.

## Web integration

- The CRM loads from `https://pulso-crm-omega.vercel.app/` in the default browser.
- The installed interactive connector starts automatically when its Windows user signs in.
- The browser connects to the loopback-only endpoint at `wss://127.0.0.1:21987`.
- The installer places the local certificate in the Windows trust store.

## Acceptance gates

- Core provisioning and orchestration tests pass on macOS/Linux and Windows.
- Agent and setup projects compile for `win-x64` from a clean checkout.
- Published setup is a PE32+ Windows x64 executable, contains the agent payload, and excludes the retired desktop payload.
- Windows CI launches `ElTemploHuella-Setup.exe --self-test` successfully.
- Production API, CRM URL, and installer download respond successfully.
- Final hardware acceptance on the reception PC: install, reader detection, enrollment of four samples, identification, attendance registration, repair, reboot persistence, and uninstall.

The release is a verified release candidate until the final physical U4500 acceptance gate passes.
