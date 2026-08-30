import fsp from 'node:fs/promises';
import path from 'node:path';

export const TRASH_META = '.factory-trash.json';
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

async function verifyTrashCopy(destination) {
  const [indexStat, metaStat] = await Promise.all([
    fsp.stat(path.join(destination, 'index.html')).catch(() => null),
    fsp.stat(path.join(destination, TRASH_META)).catch(() => null)
  ]);
  if (!indexStat?.isFile() || !metaStat?.isFile()) {
    throw new Error('Factory Trash safety copy could not be verified, so the original game was left untouched.');
  }
}

async function copyThenRemove(source, destination, metadata) {
  try {
    await fsp.cp(source, destination, {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true
    });
    await verifyTrashCopy(destination);
  } catch (error) {
    await fsp.rm(destination, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 }).catch(() => {});
    throw error;
  }

  try {
    await fsp.rm(source, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
    return { mode: 'copied', pendingCleanup: false };
  } catch (error) {
    if (!WINDOWS_LOCK_CODES.has(error?.code)) {
      await fsp.rm(destination, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 }).catch(() => {});
      throw error;
    }

    // Windows/OneDrive can keep a directory handle alive after all visible windows are gone.
    // The recoverable copy is already verified, so leave a tombstone in the original folder.
    // server.js hides tombstoned folders immediately and startup cleanup removes them later.
    await fsp.mkdir(source, { recursive: true }).catch(() => {});
    await fsp.writeFile(path.join(source, TRASH_META), JSON.stringify({ ...metadata, pendingCleanup: true }, null, 2), 'utf8').catch(() => {});
    return { mode: 'copied', pendingCleanup: true, cleanupError: error.message };
  }
}

async function moveDirectory(source, destination, metadata) {
  try {
    await renameWithRetry(source, destination);
    return { mode: 'renamed', pendingCleanup: false };
  } catch (error) {
    if (error?.code !== 'EXDEV' && !WINDOWS_LOCK_CODES.has(error?.code)) throw error;
    return copyThenRemove(source, destination, metadata);
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
    const moved = await moveDirectory(gameDir, destination, metadata);
    return { ...metadata, destination, ...moved };
  } catch (error) {
    await fsp.rm(path.join(gameDir, TRASH_META), { force: true }).catch(() => {});
    if (WINDOWS_LOCK_CODES.has(error?.code)) {
      const friendly = new Error('Windows could not release the game folder even after the Factory closed its own game windows and retried. This can be caused by OneDrive, Defender, Search indexing, or another background Windows handle. The original game was left in place.');
      friendly.code = error.code;
      throw friendly;
    }
    throw error;
  }
}

export async function cleanupPendingTrash({ gamesDir }) {
  let entries = [];
  try { entries = await fsp.readdir(gamesDir, { withFileTypes: true }); } catch { return { removed: 0, pending: 0 }; }
  let removed = 0;
  let pending = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const gameDir = path.join(gamesDir, entry.name);
    const marker = await fsp.stat(path.join(gameDir, TRASH_META)).catch(() => null);
    if (!marker?.isFile()) continue;
    try {
      await fsp.rm(gameDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
      removed += 1;
    } catch {
      pending += 1;
    }
  }
  return { removed, pending };
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
