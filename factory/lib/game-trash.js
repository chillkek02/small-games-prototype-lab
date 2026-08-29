import fsp from 'node:fs/promises';
import path from 'node:path';

const TRASH_META = '.factory-trash.json';

function safeName(value = '') {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
}

async function moveDirectory(source, destination) {
  try {
    await fsp.rename(source, destination);
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

  // Metadata travels with the deleted game. Writing it before the move also
  // guarantees the trash entry can be identified even after a cross-volume copy.
  await fsp.writeFile(path.join(gameDir, TRASH_META), JSON.stringify(metadata, null, 2), 'utf8');

  try {
    await moveDirectory(gameDir, destination);
  } catch (error) {
    // Do not leave Factory-only trash metadata inside an otherwise untouched game.
    await fsp.rm(path.join(gameDir, TRASH_META), { force: true }).catch(() => {});
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
