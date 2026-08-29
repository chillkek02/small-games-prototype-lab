import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JobStore } from './lib/store.js';
import { probeCodex, runJob } from './lib/runner.js';
import { getOpportunityReport, getCreatorOptions } from './lib/opportunity.js';
import { createGameProject } from './lib/new-game.js';
import { runQualityAudit } from './lib/quality.js';
import { createSnapshot, listSnapshots, restoreSnapshot } from './lib/snapshots.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(process.env.GAME_FACTORY_REPO_ROOT || path.resolve(__dirname, '..'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const GAMES_DIR = path.join(REPO_ROOT, 'games');
const STATE_DIR = path.resolve(process.env.GAME_FACTORY_STATE_DIR || path.join(__dirname, '.state'));
const PORT = Number(process.env.GAME_FACTORY_PORT || 4177);
const HOST = process.env.GAME_FACTORY_HOST || '127.0.0.1';
const store = new JobStore(STATE_DIR);
const activeByGame = new Map();
const qualityBusy = new Set();
const restoreBusy = new Set();
let creatingGame = false;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.wasm': 'application/wasm'
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

function gameDirFor(game) {
  return path.join(GAMES_DIR, game);
}

async function validateGameDir(gameDir) {
  const stat = await fsp.stat(path.join(gameDir, 'index.html')).catch(() => null);
  return Boolean(stat?.isFile());
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
      let metadata = null;
      try { metadata = JSON.parse(await fsp.readFile(path.join(GAMES_DIR, entry.name, 'factory-game.json'), 'utf8')); } catch {}
      games.push({ id: entry.name, title, url: `/game/${encodeURIComponent(entry.name)}/`, metadata });
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
      status: 'failed', stage: 'Dispatch failed', finishedAt: new Date().toISOString(), error: error.message
    });
  } catch (storeError) {
    console.error('Failed to record factory dispatch error', storeError);
  }
}

async function recoverInterruptedJobs() {
  const jobs = await store.list(100);
  const interrupted = jobs.filter(job => job.status === 'queued' || job.status === 'running');
  for (const job of interrupted) {
    await store.appendLog(job.id, 'Factory restarted before this job reached a terminal state.');
    await store.patch(job.id, {
      status: 'failed', stage: 'Interrupted by restart', finishedAt: new Date().toISOString(),
      error: 'Factory restarted while this job was active. Start a new run to retry it.'
    });
  }
  if (interrupted.length) console.log(`Recovered ${interrupted.length} interrupted factory job(s).`);
}

function dispatchWorker({ job, game, gameDir }) {
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
}

function gameIsBusy(game) {
  return activeByGame.has(game) || qualityBusy.has(game) || restoreBusy.has(game);
}

async function snapshotBeforeBuild({ game, gameDir, label, kind, jobId = null }) {
  return createSnapshot({ stateDir: STATE_DIR, game, gameDir, label, kind, jobId });
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/status') {
    const [codex, jobs] = await Promise.all([probeCodex(REPO_ROOT), store.list(5)]);
    return sendJson(res, 200, {
      name: 'Gutpopper Game Factory', version: '0.10.0', repoRoot: REPO_ROOT, codex,
      engines: { phaser3: '3.90.0', phaser4: '4.2.1', three: '0.185.1' },
      qualityLab: {
        visualDirector: true,
        aiPlaytester: true,
        retentionReplay: true,
        performanceGate: true,
        pokiReadiness: true,
        visualQualityFloor: true,
        automatedFirstPrototypePolish: true,
        desktopViewport: '1440x900',
        phoneViewport: '390x844'
      },
      snapshots: { automatic: true, maxPerGame: 12, undo: true },
      activeGames: [...activeByGame.keys()], recentJobs: jobs.length
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/games') return sendJson(res, 200, { games: await listGames() });
  if (req.method === 'GET' && url.pathname === '/api/creator-options') return sendJson(res, 200, getCreatorOptions());
  if (req.method === 'GET' && url.pathname === '/api/opportunities') {
    try { return sendJson(res, 200, await getOpportunityReport()); }
    catch (error) { return sendJson(res, 500, { error: `Opportunity Scout failed: ${error.message}` }); }
  }

  const snapshotListMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/snapshots$/);
  if (snapshotListMatch) {
    const game = decodeURIComponent(snapshotListMatch[1]);
    if (!safeSegment(game)) return sendJson(res, 400, { error: 'Invalid game id' });
    const gameDir = gameDirFor(game);
    if (!await validateGameDir(gameDir)) return sendJson(res, 404, { error: 'Game target not found' });
    if (req.method === 'GET') return sendJson(res, 200, { snapshots: await listSnapshots({ stateDir: STATE_DIR, game }) });
    if (req.method === 'POST') {
      if (gameIsBusy(game)) return sendJson(res, 409, { error: 'Wait for the active Factory operation to finish before saving a restore point.' });
      try {
        const body = await readBody(req);
        const snapshot = await createSnapshot({ stateDir: STATE_DIR, game, gameDir, label: String(body.label || 'Manual restore point').slice(0, 120), kind: 'manual' });
        return sendJson(res, 201, { snapshot });
      } catch (error) {
        return sendJson(res, 500, { error: `Could not create restore point: ${error.message}` });
      }
    }
  }

  const undoMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/undo$/);
  if (req.method === 'POST' && undoMatch) {
    const game = decodeURIComponent(undoMatch[1]);
    if (!safeSegment(game)) return sendJson(res, 400, { error: 'Invalid game id' });
    if (gameIsBusy(game)) return sendJson(res, 409, { error: 'Wait for the active Factory operation to finish before restoring.' });
    const gameDir = gameDirFor(game);
    if (!await validateGameDir(gameDir)) return sendJson(res, 404, { error: 'Game target not found' });
    restoreBusy.add(game);
    try {
      const available = await listSnapshots({ stateDir: STATE_DIR, game });
      const target = available[0];
      if (!target) return sendJson(res, 404, { error: 'No restore point exists for this game yet.' });
      const safety = await createSnapshot({ stateDir: STATE_DIR, game, gameDir, label: `Before restoring ${target.label || target.id}`, kind: 'pre-restore' });
      const restored = await restoreSnapshot({ stateDir: STATE_DIR, game, gameDir, snapshotId: target.id });
      return sendJson(res, 200, { restored, safetySnapshot: safety, snapshots: await listSnapshots({ stateDir: STATE_DIR, game }) });
    } catch (error) {
      return sendJson(res, 500, { error: `Restore failed: ${error.message}` });
    } finally { restoreBusy.delete(game); }
  }

  const restoreMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/restore\/([^/]+)$/);
  if (req.method === 'POST' && restoreMatch) {
    const game = decodeURIComponent(restoreMatch[1]);
    const snapshotId = decodeURIComponent(restoreMatch[2]);
    if (!safeSegment(game) || !safeSegment(snapshotId)) return sendJson(res, 400, { error: 'Invalid restore request' });
    if (gameIsBusy(game)) return sendJson(res, 409, { error: 'Wait for the active Factory operation to finish before restoring.' });
    const gameDir = gameDirFor(game);
    if (!await validateGameDir(gameDir)) return sendJson(res, 404, { error: 'Game target not found' });
    restoreBusy.add(game);
    try {
      const safety = await createSnapshot({ stateDir: STATE_DIR, game, gameDir, label: 'Before manual restore', kind: 'pre-restore' });
      const restored = await restoreSnapshot({ stateDir: STATE_DIR, game, gameDir, snapshotId });
      return sendJson(res, 200, { restored, safetySnapshot: safety });
    } catch (error) {
      return sendJson(res, 500, { error: `Restore failed: ${error.message}` });
    } finally { restoreBusy.delete(game); }
  }

  const doctorMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/doctor$/);
  if (req.method === 'POST' && doctorMatch) {
    const game = decodeURIComponent(doctorMatch[1]);
    if (!safeSegment(game)) return sendJson(res, 400, { error: 'Invalid game id' });
    if (gameIsBusy(game)) return sendJson(res, 409, { error: 'Wait for the active Factory operation to finish before running Game Doctor.' });
    const gameDir = gameDirFor(game);
    if (!await validateGameDir(gameDir)) return sendJson(res, 404, { error: 'Game target not found' });
    qualityBusy.add(game);
    try {
      const gameUrl = `http://${HOST}:${PORT}/game/${encodeURIComponent(game)}/`;
      return sendJson(res, 200, await runQualityAudit({ game, gameDir, url: gameUrl, stateDir: STATE_DIR }));
    } catch (error) {
      return sendJson(res, 500, { error: `Game Doctor failed: ${error.message}` });
    } finally { qualityBusy.delete(game); }
  }

  if (req.method === 'GET' && url.pathname === '/api/jobs') return sendJson(res, 200, { jobs: await store.list(40) });
  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (req.method === 'GET' && jobMatch && safeSegment(jobMatch[1])) {
    const job = await store.get(jobMatch[1]);
    return job ? sendJson(res, 200, job) : sendJson(res, 404, { error: 'Job not found' });
  }

  if (req.method === 'POST' && url.pathname === '/api/new-games') {
    if (creatingGame) return sendJson(res, 409, { error: 'The Factory is already creating a new game. Wait for the scaffold to finish.' });
    let body;
    try { body = await readBody(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
    creatingGame = true;
    try {
      const project = await createGameProject({ gamesDir: GAMES_DIR, factoryDir: __dirname, title: body.title, concept: body.concept, engine: body.engine || 'auto', artStyle: body.artStyle || 'auto', opportunity: body.opportunity || '', target: body.target || 'Poki' });
      const created = await store.create({ game: project.id, instruction: project.instruction });
      const baseline = await snapshotBeforeBuild({ game: project.id, gameDir: project.gameDir, label: 'Initial Production Starter Kit before first AI build', kind: 'new-game-baseline', jobId: created.id });
      const job = await store.patch(created.id, { status: 'running', stage: 'New game build', attempt: 1, kind: 'new-game', creator: project.metadata, snapshotId: baseline.id, error: null });
      await store.appendLog(job.id, `New Game Creator scaffolded ${project.id} · ${project.engine} · ${project.artStyle}`);
      await store.appendLog(job.id, `Safety snapshot saved · ${baseline.id}`);
      await store.appendLog(job.id, 'Dispatching Auto Model Router to build the first playable prototype.');
      dispatchWorker({ job, game: project.id, gameDir: project.gameDir });
      return sendJson(res, 202, { game: { id: project.id, title: project.title, url: `/game/${encodeURIComponent(project.id)}/`, metadata: project.metadata }, job: await store.get(job.id) });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    } finally { creatingGame = false; }
  }

  if (req.method === 'POST' && url.pathname === '/api/jobs') {
    let body;
    try { body = await readBody(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
    const game = String(body.game || '');
    const instruction = String(body.instruction || '').trim();
    if (!safeSegment(game)) return sendJson(res, 400, { error: 'Invalid game id' });
    if (instruction.length < 4) return sendJson(res, 400, { error: 'Describe the change you want the Factory to make.' });
    if (gameIsBusy(game)) return sendJson(res, 409, { error: `${game} already has an active Factory operation.` });
    const gameDir = gameDirFor(game);
    if (!await validateGameDir(gameDir)) return sendJson(res, 404, { error: 'Game target not found' });

    const created = await store.create({ game, instruction });
    let safety;
    try {
      safety = await snapshotBeforeBuild({ game, gameDir, label: `Before: ${instruction.replace(/\s+/g, ' ').slice(0, 90)}`, kind: 'pre-build', jobId: created.id });
    } catch (error) {
      await store.patch(created.id, { status: 'failed', stage: 'Snapshot failed', finishedAt: new Date().toISOString(), error: error.message });
      return sendJson(res, 500, { error: `Factory refused to edit without a safety snapshot: ${error.message}` });
    }

    const job = await store.patch(created.id, { status: 'running', stage: 'Dispatching Factory', attempt: 1, snapshotId: safety.id, error: null });
    await store.appendLog(job.id, `Safety snapshot saved · ${safety.id}`);
    await store.appendLog(job.id, `Dispatcher accepted ${game}; starting worker.`);
    dispatchWorker({ job, game, gameDir });
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

  const qualityArtifactMatch = url.pathname.match(/^\/quality-artifacts\/([^/]+)\/([^/]+)$/);
  if (qualityArtifactMatch && safeSegment(qualityArtifactMatch[1]) && safeSegment(qualityArtifactMatch[2])) {
    const auditDir = path.join(STATE_DIR, 'quality', qualityArtifactMatch[1]);
    const filePath = safeJoin(auditDir, qualityArtifactMatch[2]);
    if (filePath && await serveFile(res, filePath, { noCache: true })) return;
    res.writeHead(404); res.end('Not found'); return;
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
  await recoverInterruptedJobs();
  const server = http.createServer((req, res) => {
    handler(req, res).catch(error => {
      console.error(error);
      if (!res.headersSent) sendJson(res, 500, { error: error.message });
      else res.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, () => { server.off('error', reject); resolve(); });
  });
  const localUrl = `http://${HOST}:${PORT}`;
  console.log(`\nGutpopper Game Factory v0.10.0`);
  console.log(localUrl);
  console.log(`Repo: ${REPO_ROOT}\n`);
  return { server, url: localUrl, repoRoot: REPO_ROOT, stateDir: STATE_DIR, port: PORT, host: HOST };
}

if (process.env.GAME_FACTORY_EMBEDDED !== '1') await startFactoryServer();
