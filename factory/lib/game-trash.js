import fsp from 'node:fs/promises';
import path from 'node:path';

export const TRASH_META = '.factory-trash.json';
const WINDOWS_LOCK_CODES = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY', 'EACCES']);
const RETRY_DELAYS_MS = [120, 250, 500, 900, 1500];
const BACKGROUND_CLEANUP_DELAYS_MS = [2000, 5000, 15000, 45000];

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

async function writeTrashMetadata(directory, metadata) {
  await fsp.writeFile(path.join(directory, TRASH_META), JSON.stringify(metadata, null, 2), 'utf8');
}

async function hideOriginalGame(source) {
  const index = path.join(source, 'index.html');
  try {
    await fsp.rm(index, { force: true });
    return true;
  } catch {
    try {
      await fsp.rename(index, path.join(source, '.factory-trash-index.html'));
      return true;
    } catch {
      return false;
    }
  }
}

async function markPendingCleanup({ source, destination, metadata, error }) {
  const pending = {
    ...metadata,
    pendingCleanup: true,
    cleanupError: String(error?.message || error || 'Windows background lock')
  };
  await fsp.mkdir(source, { recursive: true }).catch(() => {});
  await writeTrashMetadata(source, pending).catch(() => {});
  await writeTrashMetadata(destination, pending).catch(() => {});
  return pending;
}

async function markCleanupComplete(destination) {
  try {
    const current = JSON.parse(await fsp.readFile(path.join(destination, TRASH_META), 'utf8'));
    await writeTrashMetadata(destination, {
      ...current,
      pendingCleanup: false,
      cleanupError: null,
      cleanedAt: new Date().toISOString()
    });
  } catch {}
}

function scheduleBackgroundCleanup(source, destination) {
  void (async () => {
    for (const delay of BACKGROUND_CLEANUP_DELAYS_MS) {
      await wait(delay);
      try {
        await fsp.rm(source, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
        await markCleanupComplete(destination);
        return;
      } catch {}
    }
  })();
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

  // The recoverable Trash copy is verified. Make the original stop qualifying as a playable
  // Factory game before attempting recursive cleanup. This prevents a locked OneDrive folder
  // from lingering on the Project Board merely because Windows still owns the directory handle.
  const hidden = await hideOriginalGame(source);

  try {
    await fsp.rm(source, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
    return { mode: 'copied', pendingCleanup: false };
  } catch (error) {
    if (!WINDOWS_LOCK_CODES.has(error?.code)) {
      if (!hidden) {
        await fsp.rm(destination, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 }).catch(() => {});
        throw error;
      }
    }

    if (!hidden) {
      await fsp.rm(destination, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 }).catch(() => {});
      const blocked = new Error('Windows is holding the game files themselves open, so the Factory could not safely hide the original after making its Trash copy. Try Delete again after a moment.');
      blocked.code = error?.code || 'EBUSY';
      throw blocked;
    }

    const pending = await markPendingCleanup({ source, destination, metadata, error });
    scheduleBackgroundCleanup(source, destination);
    return { mode: 'copied', pendingCleanup: true, cleanupError: pending.cleanupError };
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
    originalFolderName: path.basename(gameDir),
    originalPath: gameDir
  };

  await writeTrashMetadata(gameDir, metadata);

  try {
    const moved = await moveDirectory(gameDir, destination, metadata);
    return { ...metadata, destination, ...moved };
  } catch (error) {
    await fsp.rm(path.join(gameDir, TRASH_META), { force: true }).catch(() => {});
    if (WINDOWS_LOCK_CODES.has(error?.code)) {
      const friendly = new Error('Windows is holding this game in the background. The Factory closed its own game windows and retried. OneDrive, Defender, Search indexing, or another Windows process may still have a file handle. Nothing was destroyed unless a recoverable Factory Trash copy was first verified.');
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

async function opportunisticCleanup(metadata, destination) {
  if (!metadata?.pendingCleanup || !metadata?.originalPath) return metadata;
  try {
    await fsp.rm(metadata.originalPath, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 });
    const cleaned = {
      ...metadata,
      pendingCleanup: false,
      cleanupError: null,
      cleanedAt: new Date().toISOString()
    };
    await writeTrashMetadata(destination, cleaned).catch(() => {});
    return cleaned;
  } catch {
    return metadata;
  }
}

export async function listTrash({ stateDir }) {
  const trashRoot = path.join(stateDir, 'game-trash');
  let entries = [];
  try { entries = await fsp.readdir(trashRoot, { withFileTypes: true }); } catch { return []; }
  const items = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const destination = path.join(trashRoot, entry.name);
    try {
      const metadata = JSON.parse(await fsp.readFile(path.join(destination, TRASH_META), 'utf8'));
      const cleaned = await opportunisticCleanup(metadata, destination);
      items.push({ ...cleaned, trashId: entry.name });
    } catch {
      items.push({ trashId: entry.name, game: entry.name, title: entry.name, deletedAt: null });
    }
  }
  return items.sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')));
}
