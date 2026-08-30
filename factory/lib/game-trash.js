import fsp from 'node:fs/promises';
import path from 'node:path';

const TRASH_META = '.factory-trash.json';
const WINDOWS_LOCK_CODES = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY', 'EACCES']);
const RETRY_DELAYS_MS = [120, 250, 500, 900, 1500];

function safeName(value = '') {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function releaseFactoryGameViews(game) {
  const close = globalThis.__GUTPOPPER_CLOSE_GAME_WINDOWS__;
  if (typeof close !== 'function') return;
  await close(game).catch(() => {});
  await wait(120);
}

async function renameWithRetry(source, destination) {
  let lastError = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await fsp.rename(source, destination);
      return;
    } catch (error) {
      lastError = error;
      if (error?.code === 'EXDEV') throw error;
      if (!WINDOWS_LOCK_CODES.has(error?.code) || attempt === RETRY_DELAYS_MS.length) throw error;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

async function moveDirectory(source, destination) {
  try {
    await renameWithRetry(source, destination);
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
    await fsp.cp(source, destination, { recursive: true, force: false, errorOnExist: true });
    await fsp.rm(source, { recursive: true, force: true });
  }
}

export async function trashGame({ stateDir, game, gameDir, title = game }) {
  const deletedAt = new Date().toISOString();
  const trashRoot = path.join(stateDir, 'game-trash');
  await fsp.mkdir(trashRoot, { recursive: true });
  await releaseFactoryGameViews(game);

  const stamp = deletedAt.replace(/[:.]/g, '-');
  let trashId = `${stamp}--${safeName(game)}`;
  let destination = path.join(trashRoot, trashId);
  let suffix = 1;
  while (await fsp.stat(destination).catch(() => null)) {
    trashId = `${stamp}--${safeName(game)}-${suffix++}`;
    destination = path.join(trashRoot, trashId);
  }

  const metadata = {
    trashId,
    game,
    title,
    deletedAt,
    originalFolderName: path.basename(gameDir)
  };

  await fsp.writeFile(path.join(gameDir, TRASH_META), JSON.stringify(metadata, null, 2), 'utf8');

  try {
    await moveDirectory(gameDir, destination);
  } catch (error) {
    await fsp.rm(path.join(gameDir, TRASH_META), { force: true }).catch(() => {});
    if (WINDOWS_LOCK_CODES.has(error?.code)) {
      const friendly = new Error('Windows is still holding this game folder open. The Factory already closed its own game windows and retried the move; close any external editor or File Explorer window using this game and try Delete again.');
      friendly.code = error.code;
      throw friendly;
    }
    throw error;
  }

  return { ...metadata, destination };
}

export async function listTrash({ stateDir }) {
  const trashRoot = path.join(stateDir, 'game-trash');
  let entries = [];
  try { entries = await fsp.readdir(trashRoot, { withFileTypes: true }); } catch { return []; }
  const items = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const metadata = JSON.parse(await fsp.readFile(path.join(trashRoot, entry.name, TRASH_META), 'utf8'));
      items.push({ ...metadata, trashId: entry.name });
    } catch {
      items.push({ trashId: entry.name, game: entry.name, title: entry.name, deletedAt: null });
    }
  }
  return items.sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')));
}
