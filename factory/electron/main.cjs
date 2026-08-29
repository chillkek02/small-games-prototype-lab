const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.GAME_FACTORY_PORT || 4177);
let factoryRuntime = null;
let mainWindow = null;
let repoRoot = null;

function settingsPath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json');
}

async function looksLikePrototypeLab(candidate) {
  if (!candidate) return false;
  try {
    const games = await fsp.stat(path.join(candidate, 'games'));
    const git = await fsp.stat(path.join(candidate, '.git'));
    return games.isDirectory() && git.isDirectory();
  } catch {
    return false;
  }
}

async function readSavedRepo() {
  try {
    const data = JSON.parse(await fsp.readFile(settingsPath(), 'utf8'));
    return typeof data.repoRoot === 'string' ? data.repoRoot : null;
  } catch {
    return null;
  }
}

async function saveRepo(value) {
  await fsp.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fsp.writeFile(settingsPath(), JSON.stringify({ repoRoot: value }, null, 2), 'utf8');
}

async function discoverRepo() {
  const home = app.getPath('home');
  const candidates = [
    process.env.GAME_FACTORY_REPO_ROOT,
    await readSavedRepo(),
    path.resolve(__dirname, '..', '..'),
    path.join(home, 'OneDrive', 'Documents', 'GitHub', 'small-games-prototype-lab'),
    path.join(home, 'Documents', 'GitHub', 'small-games-prototype-lab'),
    path.join(home, 'GitHub', 'small-games-prototype-lab')
  ].filter(Boolean);

  for (const candidate of [...new Set(candidates.map(value => path.resolve(value)))]) {
    if (await looksLikePrototypeLab(candidate)) {
      await saveRepo(candidate);
      return candidate;
    }
  }

  const picked = await dialog.showOpenDialog({
    title: 'Choose the Small Games Prototype Lab folder',
    properties: ['openDirectory'],
    message: 'Choose the folder that contains the games directory and .git folder.'
  });
  if (picked.canceled || !picked.filePaths[0]) return null;
  if (!await looksLikePrototypeLab(picked.filePaths[0])) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Not a Prototype Lab folder',
      message: 'That folder does not contain both games/ and .git/. Please choose the small-games-prototype-lab repository.'
    });
    return discoverRepo();
  }
  await saveRepo(picked.filePaths[0]);
  return picked.filePaths[0];
}

async function startFactory() {
  repoRoot = await discoverRepo();
  if (!repoRoot) {
    app.quit();
    return null;
  }

  const factoryDir = path.resolve(__dirname, '..');
  const currentPath = process.env.PATH || process.env.Path || '';
  if (process.platform === 'win32') {
    process.env.PATH = `${factoryDir};${currentPath}`;
    process.env.Path = process.env.PATH;
    if (!process.env.GAME_FACTORY_CODEX_COMMAND) process.env.GAME_FACTORY_CODEX_COMMAND = 'codex-router.cmd';
  }
  process.env.GAME_FACTORY_MODEL_POLICY ||= 'auto';

  process.env.GAME_FACTORY_EMBEDDED = '1';
  process.env.GAME_FACTORY_REPO_ROOT = repoRoot;
  process.env.GAME_FACTORY_STATE_DIR = path.join(app.getPath('userData'), 'factory-state');
  process.env.GAME_FACTORY_PORT = String(PORT);
  process.env.GAME_FACTORY_HOST = '127.0.0.1';

  const serverUrl = pathToFileURL(path.join(__dirname, '..', 'server.js')).href;
  const { startFactoryServer } = await import(serverUrl);
  factoryRuntime = await startFactoryServer();
  return factoryRuntime;
}

function runCommand(command, args, timeout = 15000) {
  return execFileAsync(command, args, {
    windowsHide: true,
    timeout,
    maxBuffer: 1024 * 1024
  });
}

function tailscaleCandidates() {
  const candidates = [process.env.GAME_FACTORY_TAILSCALE_COMMAND, 'tailscale'];
  for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]) {
    if (base) candidates.push(path.join(base, 'Tailscale', 'tailscale.exe'));
  }
  return [...new Set(candidates.filter(Boolean))];
}

async function resolveTailscaleCommand() {
  for (const candidate of tailscaleCandidates()) {
    const looksLikePath = path.isAbsolute(candidate) || candidate.includes('\\') || candidate.includes('/');
    if (looksLikePath && !fs.existsSync(candidate)) continue;
    try {
      const version = await runCommand(candidate, ['version'], 5000);
      return {
        command: candidate,
        version: String(version.stdout || version.stderr || '').split(/\r?\n/)[0].trim()
      };
    } catch {
      // Try the next normal Windows installation location.
    }
  }
  return null;
}

async function tailscaleStatus() {
  const resolved = await resolveTailscaleCommand();
  if (!resolved) {
    return { installed: false, ready: false, error: 'Tailscale was not found.' };
  }

  try {
    const status = await runCommand(resolved.command, ['status', '--json'], 8000);
    const parsed = JSON.parse(status.stdout || '{}');
    const dnsName = String(parsed?.Self?.DNSName || '').replace(/\.$/, '');
    return {
      installed: true,
      ready: Boolean(dnsName),
      version: resolved.version,
      dnsName,
      url: dnsName ? `https://${dnsName}` : null,
      command: resolved.command
    };
  } catch (error) {
    return {
      installed: true,
      ready: false,
      version: resolved.version,
      command: resolved.command,
      error: error.message
    };
  }
}

async function enablePhoneRemote() {
  const before = await tailscaleStatus();
  if (!before.installed) {
    return {
      ok: false,
      code: 'TAILSCALE_MISSING',
      message: 'Tailscale is not installed. Install it on this PC, sign in, then try again.'
    };
  }
  if (!before.ready) {
    return {
      ok: false,
      code: 'TAILSCALE_SIGNIN',
      message: 'Tailscale is installed but this PC is not signed in to a tailnet yet.'
    };
  }

  const target = `http://127.0.0.1:${PORT}`;
  try {
    const result = await runCommand(before.command, ['serve', '--bg', target], 20000);
    const after = await tailscaleStatus();
    return {
      ok: true,
      url: after.url,
      message: 'Phone Remote is available privately to devices signed in to your Tailscale network.',
      output: String(result.stdout || result.stderr || '').trim()
    };
  } catch (error) {
    return {
      ok: false,
      code: 'TAILSCALE_SERVE_FAILED',
      message: error.stderr || error.stdout || error.message,
      command: `tailscale serve --bg ${target}`,
      url: before.url
    };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1580,
    height: 980,
    minWidth: 1040,
    minHeight: 680,
    title: 'Gutpopper Game Factory',
    backgroundColor: '#0b0e14',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  });

  const factoryOrigin = `http://127.0.0.1:${PORT}`;
  mainWindow.loadURL(factoryOrigin);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${factoryOrigin}/game/`)) {
      const child = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#000000',
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      });
      child.setMenuBarVisibility(false);
      child.loadURL(url);
      child.once('ready-to-show', () => {
        child.maximize();
        child.show();
      });
      return { action: 'deny' };
    }
    if (url.startsWith(`${factoryOrigin}/artifacts/`) || url.startsWith(`${factoryOrigin}/quality-artifacts/`)) {
      const child = new BrowserWindow({
        width: 1180,
        height: 820,
        parent: mainWindow,
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      });
      child.setMenuBarVisibility(false);
      child.loadURL(url);
      return { action: 'deny' };
    }
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(factoryOrigin)) event.preventDefault();
  });
}

ipcMain.handle('factory:desktop-info', async () => ({
  desktop: true,
  repoRoot,
  version: app.getVersion(),
  remote: await tailscaleStatus()
}));

ipcMain.handle('factory:enable-phone-remote', async () => enablePhoneRemote());
ipcMain.handle('factory:open-tailscale-download', async () => {
  await shell.openExternal('https://tailscale.com/download/windows');
  return true;
});
ipcMain.handle('factory:choose-repo', async () => {
  const picked = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (picked.canceled || !picked.filePaths[0]) return { ok: false };
  if (!await looksLikePrototypeLab(picked.filePaths[0])) return { ok: false, error: 'Choose the folder containing games/ and .git/.' };
  await saveRepo(picked.filePaths[0]);
  return { ok: true, repoRoot: picked.filePaths[0], restartRequired: true };
});

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  await startFactory();
  if (!factoryRuntime) return;
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(async error => {
  await dialog.showMessageBox({ type: 'error', title: 'Game Factory failed to start', message: error.stack || error.message });
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { factoryRuntime?.server?.close(); } catch {}
});
