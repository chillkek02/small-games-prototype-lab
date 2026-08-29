import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JobStore } from './lib/store.js';
import { probeCodex, runJob } from './lib/runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(process.env.GAME_FACTORY_REPO_ROOT || path.resolve(__dirname, '..'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const GAMES_DIR = path.join(REPO_ROOT, 'games');
const STATE_DIR = path.resolve(process.env.GAME_FACTORY_STATE_DIR || path.join(__dirname, '.state'));
const PORT = Number(process.env.GAME_FACTORY_PORT || 4177);
const HOST = process.env.GAME_FACTORY_HOST || '127.0.0.1';
const store = new JobStore(STATE_DIR);
const activeByGame = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm'
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

function safeSegment(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9._-]+$/.test(value) && !value.includes('..');
}

function safeJoin(base, relative) {
  const target = path.resolve(base, relative);
  const relativeToBase = path.relative(base, target);
  if (relativeToBase.startsWith('..') || path.isAbsolute(relativeToBase)) return null;
  return target;
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 200000) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

async function listGames() {
  const entries = await fsp.readdir(GAMES_DIR, { withFileTypes: true });
  const games = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const indexPath = path.join(GAMES_DIR, entry.name, 'index.html');
    try {
      const html = await fsp.readFile(indexPath, 'utf8');
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || entry.name;
      games.push({
        id: entry.name,
        title,
        url: `/game/${encodeURIComponent(entry.name)}/`
      });
    } catch {
      // Only folders with an index.html are factory targets.
    }
  }
  return games.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

async function serveFile(res, filePath, { noCache = false } = {}) {
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) return false;
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': noCache ? 'no-store' : 'public, max-age=60',
      'x-content-type-options': 'nosniff'
    });
    fs.createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

async function markDispatchFailure(jobId, error) {
  try {
    await store.appendLog(jobId, `DISPATCH ERROR: ${error.message}`);
    await store.patch(jobId, {
      status: 'failed',
      stage: 'Dispatch failed',
      finishedAt: new Date().toISOString(),
      error: error.message
    });
  } catch (storeError) {
    console.error('Failed to record factory dispatch error', storeError);
  }
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/status') {
    const [codex, jobs] = await Promise.all([probeCodex(REPO_ROOT), store.list(5)]);
    return sendJson(res, 200, {
      name: 'Gutpopper Game Factory',
      version: '0.2.2',
      repoRoot: REPO_ROOT,
      codex,
      activeGames: [...activeByGame.keys()],
      recentJobs: jobs.length
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/games') {
    return sendJson(res, 200, { games: await listGames() });
  }

  if (req.method === 'GET' && url.pathname === '/api/jobs') {
    return sendJson(res, 200, { jobs: await store.list(40) });
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (req.method === 'GET' && jobMatch && safeSegment(jobMatch[1])) {
    const job = await store.get(jobMatch[1]);
    return job ? sendJson(res, 200, job) : sendJson(res, 404, { error: 'Job not found' });
  }

  if (req.method === 'POST' && url.pathname === '/api/jobs') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
    const game = String(body.game || '');
    const instruction = String(body.instruction || '').trim();
    if (!safeSegment(game)) return sendJson(res, 400, { error: 'Invalid game id' });
    if (instruction.length < 4) return sendJson(res, 400, { error: 'Describe the change you want Codex to make.' });
    if (activeByGame.has(game)) return sendJson(res, 409, { error: `${game} already has a running factory job.` });

    const gameDir = path.join(GAMES_DIR, game);
    try {
      const stat = await fsp.stat(path.join(gameDir, 'index.html'));
      if (!stat.isFile()) throw new Error('Missing index.html');
    } catch {
      return sendJson(res, 404, { error: 'Game target not found' });
    }

    const created = await store.create({ game, instruction });
    const job = await store.patch(created.id, {
      status: 'running',
      stage: 'Dispatching Codex',
      attempt: 1,
      error: null
    });
    await store.appendLog(job.id, `Dispatcher accepted ${game}; starting worker.`);

    const gameRelativePath = path.relative(REPO_ROOT, gameDir);
    const gameUrl = `http://${HOST}:${PORT}/game/${encodeURIComponent(game)}/`;

    const worker = new Promise(resolve => setImmediate(resolve))
      .then(() => runJob({ job, store, repoRoot: REPO_ROOT, gameDir, gameRelativePath, gameUrl }))
      .catch(async error => {
        console.error(`Factory worker failed for ${game}`, error);
        await markDispatchFailure(job.id, error);
      })
      .finally(() => activeByGame.delete(game));

    activeByGame.set(game, { jobId: job.id, worker });
    return sendJson(res, 202, await store.get(job.id));
  }

  return false;
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname.startsWith('/api/')) {
    const handled = await handleApi(req, res, url);
    if (handled !== false) return;
  }

  const artifactMatch = url.pathname.match(/^\/artifacts\/([^/]+)\/([^/]+)$/);
  if (artifactMatch && safeSegment(artifactMatch[1]) && safeSegment(artifactMatch[2])) {
    const filePath = safeJoin(store.jobDir(artifactMatch[1]), artifactMatch[2]);
    if (filePath && await serveFile(res, filePath, { noCache: true })) return;
    res.writeHead(404); res.end('Not found'); return;
  }

  const gameMatch = url.pathname.match(/^\/game\/([^/]+)(\/.*)?$/);
  if (gameMatch) {
    const game = decodeURIComponent(gameMatch[1]);
    if (!safeSegment(game)) { res.writeHead(400); res.end('Bad game path'); return; }
    const relative = decodeURIComponent(gameMatch[2] || '/').replace(/^\/+/, '') || 'index.html';
    const gameRoot = path.join(GAMES_DIR, game);
    const filePath = safeJoin(gameRoot, relative);
    if (filePath && await serveFile(res, filePath, { noCache: true })) return;
    res.writeHead(404); res.end('Game file not found'); return;
  }

  const publicRelative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const publicPath = safeJoin(PUBLIC_DIR, publicRelative);
  if (publicPath && await serveFile(res, publicPath, { noCache: true })) return;

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

export async function startFactoryServer() {
  await store.init();
  const server = http.createServer((req, res) => {
    handler(req, res).catch(error => {
      console.error(error);
      if (!res.headersSent) sendJson(res, 500, { error: error.message });
      else res.end();
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const url = `http://${HOST}:${PORT}`;
  console.log(`\nGutpopper Game Factory v0.2.2`);
  console.log(url);
  console.log(`Repo: ${REPO_ROOT}\n`);
  return { server, url, repoRoot: REPO_ROOT, stateDir: STATE_DIR, port: PORT, host: HOST };
}

if (process.env.GAME_FACTORY_EMBEDDED !== '1') {
  await startFactoryServer();
}
