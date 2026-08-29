import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_SNAPSHOTS_PER_GAME = 12;

function safeGameId(game = '') {
  const value = String(game);
  if (!/^[a-zA-Z0-9._-]+$/.test(value) || value.includes('..')) throw new Error('Invalid game id');
  return value;
}

function snapshotRoot(stateDir, game) {
  return path.join(stateDir, 'snapshots', safeGameId(game));
}

function snapshotDir(stateDir, game, id) {
  return path.join(snapshotRoot(stateDir, game), id);
}

async function readMeta(dir) {
  try {
    return JSON.parse(await fsp.readFile(path.join(dir, 'snapshot.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function folderStats(root) {
  let files = 0;
  let bytes = 0;
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        files += 1;
        bytes += (await fsp.stat(full)).size;
      }
    }
  }
  await walk(root);
  return { files, bytes };
}

async function prune(stateDir, game) {
  const root = snapshotRoot(stateDir, game);
  let entries = [];
  try { entries = await fsp.readdir(root, { withFileTypes: true }); } catch { return; }
  const snapshots = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const meta = await readMeta(dir);
    if (meta) snapshots.push({ dir, meta });
  }
  snapshots.sort((a, b) => String(b.meta.createdAt).localeCompare(String(a.meta.createdAt)));
  for (const item of snapshots.slice(MAX_SNAPSHOTS_PER_GAME)) {
    await fsp.rm(item.dir, { recursive: true, force: true });
  }
}

export async function createSnapshot({ stateDir, game, gameDir, label = 'Before Factory change', kind = 'auto', jobId = null }) {
  safeGameId(game);
  const indexPath = path.join(gameDir, 'index.html');
  const stat = await fsp.stat(indexPath).catch(() => null);
  if (!stat?.isFile()) throw new Error('Cannot snapshot a game without index.html');

  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const dir = snapshotDir(stateDir, game, id);
  const dataDir = path.join(dir, 'game');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.cp(gameDir, dataDir, { recursive: true, force: false, errorOnExist: false, dereference: false });
  const stats = await folderStats(dataDir);
  const meta = {
    id,
    game,
    label,
    kind,
    jobId,
    createdAt: new Date().toISOString(),
    files: stats.files,
    bytes: stats.bytes
  };
  await fsp.writeFile(path.join(dir, 'snapshot.json'), JSON.stringify(meta, null, 2), 'utf8');
  await prune(stateDir, game);
  return meta;
}

export async function listSnapshots({ stateDir, game, limit = MAX_SNAPSHOTS_PER_GAME }) {
  safeGameId(game);
  const root = snapshotRoot(stateDir, game);
  let entries = [];
  try { entries = await fsp.readdir(root, { withFileTypes: true }); } catch { return []; }
  const items = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = await readMeta(path.join(root, entry.name));
    if (meta) items.push(meta);
  }
  return items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
}

export async function restoreSnapshot({ stateDir, game, gameDir, snapshotId }) {
  safeGameId(game);
  if (!/^[a-zA-Z0-9._-]+$/.test(String(snapshotId || '')) || String(snapshotId).includes('..')) throw new Error('Invalid snapshot id');
  const source = path.join(snapshotDir(stateDir, game, snapshotId), 'game');
  const sourceIndex = await fsp.stat(path.join(source, 'index.html')).catch(() => null);
  if (!sourceIndex?.isFile()) throw new Error('Snapshot is missing or invalid');

  const temp = `${gameDir}.factory-restore-${randomUUID().slice(0, 8)}`;
  await fsp.rm(temp, { recursive: true, force: true });
  try {
    await fsp.cp(source, temp, { recursive: true, force: false, errorOnExist: false, dereference: false });
    const tempIndex = await fsp.stat(path.join(temp, 'index.html')).catch(() => null);
    if (!tempIndex?.isFile()) throw new Error('Restored copy failed validation');
    await fsp.rm(gameDir, { recursive: true, force: true });
    await fsp.rename(temp, gameDir);
  } catch (error) {
    await fsp.rm(temp, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return await readMeta(snapshotDir(stateDir, game, snapshotId));
}
