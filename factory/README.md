# Gutpopper Game Factory — V0.2

Gutpopper Game Factory is a local AI game-production app for `small-games-prototype-lab` with a private phone remote.

## What V0.2 does

1. Discovers playable projects under `games/*/index.html`.
2. Lets you choose a game and describe a change in natural language.
3. Runs Codex non-interactively inside only that game's directory.
4. Runs Playwright QA through Microsoft Edge at desktop (1440×900) and mobile-emulated (390×844) sizes.
5. Captures page errors, console errors, obvious horizontal overflow, and screenshots.
6. Sends QA failures back to Codex for an automatic repair pass.
7. Shows the live game, build stage, agent log, screenshots, QA status, changed-file summary, and job history.
8. Runs as a Windows Electron desktop application instead of requiring a browser + terminal.
9. Can privately expose the same dashboard through Tailscale Serve so a phone can control the PC factory and play the current build.
10. Is installable on the phone as a PWA via Add to Home Screen.

Codex is instructed not to commit or push. Factory jobs edit the real local game working tree so changes can be reviewed before publishing.

## Safely copy V0.2 into the current Prototype Lab checkout

Do not switch branches if the current Prototype Lab contains uncommitted game work. From PowerShell in the repository root:

```powershell
git fetch origin
git restore --source=origin/game-factory-v1 -- factory "Start Game Factory Desktop.bat" "Build Game Factory Windows App.bat" "Start Game Factory.bat"
```

This copies the factory tooling without replacing files under `games/`.

## Run the desktop app before installing it

Double-click:

`Start Game Factory Desktop.bat`

The first run installs the desktop dependencies and opens the Electron application. Automated QA uses Microsoft Edge already installed on Windows 11 rather than bundling a second Chromium browser.

You can also run it from PowerShell:

```powershell
& ".\Start Game Factory Desktop.bat"
```

## Build the Windows installer

Double-click:

`Build Game Factory Windows App.bat`

Or run:

```powershell
& ".\Build Game Factory Windows App.bat"
```

The Windows installer is generated under:

`factory\out\make\squirrel.windows\x64\Gutpopper-Game-Factory-Setup.exe`

The installer is currently unsigned, so Windows SmartScreen may warn when it is first opened. Code signing can be added before public distribution.

The `game-factory-v1` branch also contains a GitHub Actions workflow that builds the same Windows installer automatically and uploads it as the `Gutpopper-Game-Factory-Windows` workflow artifact.

## Phone Remote

The PC remains the worker. Codex, Git, game files, Edge-based QA, and builds stay on the PC. The phone only controls the factory through its web API and can play the current game build.

Recommended private connection: Tailscale Serve.

1. Install Tailscale on the Windows PC and phone.
2. Sign both devices into the same Tailscale network.
3. Start Gutpopper Game Factory Desktop.
4. Click `Phone Remote` in the desktop app.
5. Click `Enable Phone Remote`.
6. The desktop app shows a private `https://<pc-name>.<tailnet>.ts.net` address.
7. Open that address on the phone.
8. Use the browser's `Add to Home Screen` action to install Gutpopper Game Factory Remote like an app.

Tailscale Serve is used rather than Funnel, so the factory is shared only inside the authenticated tailnet instead of being exposed publicly.

## Desktop security model

- Electron renderer: `nodeIntegration: false`.
- Context isolation: enabled.
- Renderer sandbox: enabled.
- Permission requests: denied by default.
- Remote phone clients never receive the Electron native bridge.
- The local factory server remains bound to `127.0.0.1`; Tailscale Serve proxies private HTTPS traffic to it.
- Codex is launched inside the selected game's working directory with workspace-write behavior and explicit no-commit/no-push rules.

## Requirements

For AI build jobs:

- Codex CLI installed and signed in.
- Git available in PATH.
- Microsoft Edge installed/updated for automated QA.

For source/development launch or building an installer:

- Node.js 20+ (Node.js 22 is used by the automated Windows build).

For remote phone access:

- Tailscale on the PC and phone.

The installed Electron app bundles its own application runtime, but intentionally does not bundle your Codex credentials or a duplicate Chromium browser.

## Next targets

- Vision-model screenshot review for composition, clipping, readability, and prototype-looking presentation.
- Git snapshots and one-click Revert/Approve.
- New Game from prompt using a studio template.
- Dedicated Director → Gameplay/UI/Art/Poki worker routing.
- Poki-specific SDK/lifecycle/rewarded-ad validator.
- Performance budgets.
- Phone-friendly approval/revert controls and build notifications.
- Optional native Capacitor Android/iOS wrapper around the same remote UI.
