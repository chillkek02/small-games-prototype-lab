# Gutpopper Game Factory — V0.1

A local Tesana-style AI production dashboard for `small-games-prototype-lab`.

V0.1 deliberately focuses on one complete production loop instead of trying to solve every future feature at once:

1. Discover playable projects under `../games/*/index.html`.
2. Select a game and describe a change in natural language.
3. Run Codex non-interactively inside only that game directory.
4. Launch Chromium with Playwright at desktop (1440×900) and mobile (390×844).
5. Capture page errors, console errors, obvious horizontal overflow, and QA screenshots.
6. If QA fails, give the failures back to Codex for one automatic repair pass.
7. Show the live preview, logs, screenshots, QA state, and Git diff stat in the dashboard.

Codex is instructed not to commit or push. The factory edits the existing local working tree so you can review the changes before publishing.

## Fastest setup on the current Prototype Lab machine

Open PowerShell in the repository and run:

```powershell
cd "C:\Users\chill\OneDrive\Documents\GitHub\small-games-prototype-lab"
git fetch origin
git switch game-factory-v1
```

After that, double-click **Start Game Factory.bat** in the repository root. On the first launch it installs the factory's npm dependencies and Chromium automatically, starts the local server, and opens the dashboard.

The dashboard runs at:

`http://127.0.0.1:4177`

## Manual setup

If you prefer to run it manually:

```powershell
cd "C:\Users\chill\OneDrive\Documents\GitHub\small-games-prototype-lab\factory"
npm install
npx playwright install chromium
codex --version
npm start
```

The factory uses your already-installed/logged-in Codex CLI. It does not require an OpenAI API key in V0.1.

If `codex --version` is not found, install/update the Codex CLI and sign in normally before starting the factory.

## Useful environment settings

```powershell
# Change local port
$env:GAME_FACTORY_PORT="4178"

# Allow two QA repair passes instead of one (0-3)
$env:GAME_FACTORY_REPAIR_PASSES="2"

# Override the Codex executable if needed
$env:GAME_FACTORY_CODEX_COMMAND="codex"

npm start
```

## Safety boundary

The implementation prompt tells Codex to work only inside the selected `games/<game>` directory, and Codex is launched with `--full-auto`, which currently maps to workspace-write sandboxing in the Codex CLI. The agent is explicitly forbidden from committing, pushing, creating branches, adding secrets, or editing other projects.

As with any local coding agent, review changes before publishing. If a specific Codex version reports that the native-Windows workspace-write sandbox is read-only, update Codex first; 2026 Codex releases have had Windows sandbox regressions. Running the factory from WSL2 is a fallback if the installed native build is affected.

## V0.2 targets

- Vision-model screenshot review (composition, clipping, ugly/prototype-looking UI, visual readability).
- Dedicated Director → Gameplay/UI/Art/Platform worker routing.
- Git snapshots/revert buttons per successful run.
- "New Game" generation from a blank house template.
- Poki-specific validator (SDK lifecycle, rewarded hooks, mobile input, pause/audio behavior).
- Performance budgets and Lighthouse-style checks.
- Asset-generation adapters and an asset library.
- One-click share/publish workflow.
