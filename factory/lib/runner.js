import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_REPAIR_PASSES = Math.max(0, Math.min(3, Number(process.env.GAME_FACTORY_REPAIR_PASSES || 1)));
const MAX_VISUAL_POLISH_PASSES = Math.max(0, Math.min(2, Number(process.env.GAME_FACTORY_VISUAL_POLISH_PASSES || 1)));
const CODEX_COMMAND = process.env.GAME_FACTORY_CODEX_COMMAND || 'codex';
const QUICK_ACTION = /\b(change|set|rename|replace|update|increase|decrease|remove|delete|hide|show|move|adjust|fix|correct|add)\b/i;
const QUICK_TARGET = /\b(comment|text|label|title|copy|typo|number|value|speed|size|color|colour|font|spacing|margin|padding|position|opacity|volume|name|word|button text)\b/i;
const COMPLEX_SIGNAL = /\b(system|mechanic|gameplay|architecture|refactor|overhaul|redesign|rework|new feature|level|mission|quest|enemy|boss|progression|upgrade system|physics|multiplayer|network|save system|inventory|economy|procedural|generation|combat system|ai behavior|sdk integration|monetization system)\b/i;
const TEXT_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.json', '.svg', '.txt', '.md', '.xml', '.yaml', '.yml']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', 'dist', 'build']);
const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_LCS_CELLS = 4_000_000;

function stripModePrefix(instruction = '') {
  return instruction.replace(/^\s*(?:direct|quick|tiny|small|standard|full)\s*:\s*/i, '').trim();
}

function parseDirectReplacement(instruction = '') {
  const text = stripModePrefix(instruction);
  const match = text.match(/\b(?:change|replace|rename)\s+(["'`])([\s\S]*?)\1\s+(?:back\s+)?(?:to|with)\s+(["'`])([\s\S]*?)\3/i);
  if (!match) return null;
  const from = match[2];
  const to = match[4];
  if (!from || from === to || from.length > 5000 || to.length > 5000) return null;
  return { from, to };
}

function classifyTask(instruction = '') {
  const text = instruction.trim();
  if (parseDirectReplacement(text)) return 'direct';
  if (/^\s*(quick|tiny|small)\s*:/i.test(text)) return 'quick';
  if (/^\s*(standard|full)\s*:/i.test(text)) return 'standard';
  if (text.length <= 240 && QUICK_ACTION.test(text) && QUICK_TARGET.test(text) && !COMPLEX_SIGNAL.test(text)) return 'quick';
  return 'standard';
}

function studioRules(gameName) {
  return `You are the implementation agent inside Gutpopper Game Factory.

TARGET
- Work only on the game project in your current working directory: ${gameName}.
- Make the requested production change directly in the real source files.
- Do not commit, push, create branches, or edit files outside this game directory.

SMALL GAMES STUDIO RULES
- This is a Poki/browser-first HTML5 game unless the existing project clearly says otherwise.
- Preserve working gameplay and Poki SDK/ad behavior unless the request explicitly changes them.
- Mobile must feel native: disable text selection, callouts, context menus, drag selection, and long-press selection/copy behavior on the game surface and controls.
- Prefer fast-loading, mobile-friendly HTML/CSS/JavaScript and existing project technologies.
- Visual target: polished mobile-casual presentation, bright friendly colors, chunky toy-like proportions, rounded/simple shapes, soft lighting/shadows, clean silhouettes, exaggerated readable props, and low visual noise.
- Preserve natural optional rewarded-ad opportunities; do not make rewarded ads mandatory for normal progress.
- Do not add secrets, API keys, tracking, unrelated dependencies, or external services.
- Test the game after editing. Fix errors you encounter before finishing.
- Avoid prototype-only placeholders when a simple polished implementation is possible.

FINAL RESPONSE
Give a concise implementation summary, files changed, tests run, and any real blockers. Do not claim tests passed unless you ran them.`;
}

function quickEditRules(gameName) {
  return `You are the QUICK EDIT agent inside Gutpopper Game Factory.

TARGET
- Current game only: ${gameName}.
- Make the smallest localized source edit needed.
- Do not commit, push, create branches, install dependencies, or edit outside the current game directory.

TOKEN-EFFICIENT RULES
- Inspect only the exact file/lines needed. Do not explore the whole project unless the edit cannot otherwise be located.
- Do not read Codex memory files, rollout summaries, session history, git history, origin/main, or unrelated repository documentation for a localized edit.
- Do not launch a browser, local HTTP server, Playwright, test suite, or broad repository scan. Gutpopper Game Factory performs desktop/mobile QA after you finish.
- Do not repeatedly print the file, diff, or git status.
- Preserve gameplay, Poki SDK/ad behavior, controls, and unrelated visuals unless the request explicitly changes them.
- Once the localized edit is complete and syntactically sane, stop.`;
}

function buildPrompt(job, mode = 'standard') {
  if (mode === 'quick') {
    return `${quickEditRules(job.game)}\n\nUSER REQUEST\n${job.instruction}\n\nFINAL RESPONSE\nMaximum 5 short lines: what changed, file changed, and any real blocker.`;
  }
  return `${studioRules(job.game)}\n\nUSER REQUEST\n${job.instruction}`;
}

function buildRepairPrompt(job, qa, mode = 'standard') {
  const issueText = qa.issues.length ? qa.issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n') : 'No machine-readable issues were reported.';
  if (mode === 'quick') {
    return `${quickEditRules(job.game)}\n\nFACTORY QA FOUND A PROBLEM\nFix only the concrete QA issue(s) below with the smallest possible edit. Do not investigate unrelated project history or architecture.\n\n${issueText}\n\nORIGINAL REQUEST\n${job.instruction}\n\nFINAL RESPONSE\nMaximum 5 short lines.`;
  }
  return `${studioRules(job.game)}\n\nAUTOMATED QA FAILED\nThe previous implementation was smoke-tested in desktop and mobile browser QA. Fix the failures below, then retest locally.\n\n${issueText}\n\nDo not undo the original requested change: ${job.instruction}`;
}

async function runProcess(command, args, { cwd, input = '', timeoutMs = 20 * 60 * 1000, onLine = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, windowsHide: true, shell: process.platform === 'win32' });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let carryOut = '';
    let carryErr = '';
    const emitLines = (chunk, isErr) => {
      const joined = (isErr ? carryErr : carryOut) + chunk.toString();
      const parts = joined.split(/\r?\n/);
      const carry = parts.pop() || '';
      if (isErr) carryErr = carry; else carryOut = carry;
      for (const line of parts) if (line.trim()) onLine(line.trim(), isErr);
    };
    child.stdout?.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > 120000) stdout = stdout.slice(-120000); emitLines(chunk, false); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 120000) stderr = stderr.slice(-120000); emitLines(chunk, true); });
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      settled = true;
      reject(new Error(`Process timed out after ${Math.round(timeoutMs / 60000)} minutes`));
    }, timeoutMs);
    child.on('error', error => { if (settled) return; settled = true; clearTimeout(timer); reject(error); });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (carryOut.trim()) onLine(carryOut.trim(), false);
      if (carryErr.trim()) onLine(carryErr.trim(), true);
      resolve({ code, stdout, stderr });
    });
    if (child.stdin) { child.stdin.write(input); child.stdin.end(); }
  });
}

async function walkTextFiles(root, relative = '') {
  const dir = path.join(root, relative);
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...await walkTextFiles(root, path.join(relative, entry.name)));
      continue;
    }
    if (!entry.isFile() || !TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const rel = path.join(relative, entry.name);
    const full = path.join(root, rel);
    try { const stat = await fs.stat(full); if (stat.size <= MAX_TEXT_FILE_BYTES) files.push(rel); } catch {}
  }
  return files;
}

async function snapshotTextSource(gameDir) {
  const files = await walkTextFiles(gameDir);
  const snapshot = new Map();
  for (const relative of files) {
    try { snapshot.set(relative, await fs.readFile(path.join(gameDir, relative), 'utf8')); } catch {}
  }
  return snapshot;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}

async function replaceUtf8BytesOnce(filePath, from, to) {
  const raw = await fs.readFile(filePath);
  const needle = Buffer.from(from, 'utf8');
  const replacement = Buffer.from(to, 'utf8');
  const first = raw.indexOf(needle);
  if (first < 0 || raw.indexOf(needle, first + needle.length) >= 0) return false;
  const updated = Buffer.concat([raw.subarray(0, first), replacement, raw.subarray(first + needle.length)]);
  await fs.writeFile(filePath, updated);
  return true;
}

async function tryDirectEdit(gameDir, instruction) {
  const replacement = parseDirectReplacement(instruction);
  if (!replacement) return { ok: false, reason: 'request is not an exact quoted replacement' };
  const files = await walkTextFiles(gameDir);
  const matches = [];
  for (const relative of files) {
    let content;
    try { content = await fs.readFile(path.join(gameDir, relative), 'utf8'); } catch { continue; }
    const count = countOccurrences(content, replacement.from);
    if (count) matches.push({ relative, count });
  }
  const totalMatches = matches.reduce((sum, match) => sum + match.count, 0);
  if (totalMatches !== 1 || matches.length !== 1) {
    return { ok: false, reason: totalMatches === 0 ? `exact value was not found: ${JSON.stringify(replacement.from)}` : `exact value appears ${totalMatches} times; refusing an ambiguous zero-token edit` };
  }
  const match = matches[0];
  const filePath = path.join(gameDir, match.relative);
  const replaced = await replaceUtf8BytesOnce(filePath, replacement.from, replacement.to);
  if (!replaced) return { ok: false, reason: 'byte-preserving replacement could not be verified uniquely' };
  return { ok: true, relative: match.relative, from: replacement.from, to: replacement.to };
}

function normalizeText(text = '') { return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n'); }
function splitLines(text = '') {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const lines = normalized.split('\n');
  if (normalized.endsWith('\n')) lines.pop();
  return lines;
}
function lineCount(text) { return splitLines(text).length; }

function diffLineCounts(oldText, newText) {
  if (oldText === newText) return { added: 0, deleted: 0 };
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  let prefix = 0;
  const maxPrefix = Math.min(oldLines.length, newLines.length);
  while (prefix < maxPrefix && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= prefix && newEnd >= prefix && oldLines[oldEnd] === newLines[newEnd]) { oldEnd -= 1; newEnd -= 1; }
  const oldMid = oldLines.slice(prefix, oldEnd + 1);
  const newMid = newLines.slice(prefix, newEnd + 1);
  if (!oldMid.length) return { added: newMid.length, deleted: 0 };
  if (!newMid.length) return { added: 0, deleted: oldMid.length };
  if (oldMid.length * newMid.length > MAX_LCS_CELLS) return { added: newMid.length, deleted: oldMid.length };
  const dp = new Uint32Array(newMid.length + 1);
  for (const oldLine of oldMid) {
    let diagonal = 0;
    for (let j = 1; j <= newMid.length; j += 1) {
      const previousRow = dp[j];
      if (oldLine === newMid[j - 1]) dp[j] = diagonal + 1;
      else if (dp[j - 1] > dp[j]) dp[j] = dp[j - 1];
      diagonal = previousRow;
    }
  }
  const common = dp[newMid.length];
  return { added: newMid.length - common, deleted: oldMid.length - common };
}

async function runScopedDiffStat({ before, gameDir, gameRelativePath }) {
  try {
    const after = await snapshotTextSource(gameDir);
    const allPaths = new Set([...before.keys(), ...after.keys()]);
    const changed = [...allPaths].filter(relative => before.get(relative) !== after.get(relative)).sort();
    if (!changed.length) return 'No source-file changes in this run.';
    const rows = [];
    let totalAdd = 0;
    let totalDel = 0;
    for (const relative of changed) {
      const oldText = before.get(relative);
      const newText = after.get(relative);
      let counts;
      if (oldText === undefined) counts = { added: lineCount(newText), deleted: 0 };
      else if (newText === undefined) counts = { added: 0, deleted: lineCount(oldText) };
      else counts = diffLineCounts(oldText, newText);
      totalAdd += counts.added;
      totalDel += counts.deleted;
      rows.push(`${path.join(gameRelativePath, relative)} | +${counts.added} -${counts.deleted}`);
    }
    rows.push(`${changed.length} file${changed.length === 1 ? '' : 's'} changed, ${totalAdd} insertion${totalAdd === 1 ? '' : 's'}(+), ${totalDel} deletion${totalDel === 1 ? '' : 's'}(-)`);
    return rows.join('\n');
  } catch { return 'Run-scoped diff unavailable.'; }
}

async function runCodex({ cwd, prompt, onLine, mode = 'standard' }) {
  const args = ['exec', '--ephemeral', '--sandbox', 'workspace-write', '-c', 'approval_policy=never'];
  if (mode === 'quick') {
    args.push('-c', 'model_reasoning_effort=low', '-c', 'model_verbosity=low');
    onLine('Quick Edit mode: Terra · low reasoning · low verbosity · Factory QA handles testing', false);
  } else {
    onLine('Standard mode: configured Codex model/reasoning · workspace-write sandbox · Factory QA', false);
  }
  args.push('--color', 'never', '-C', cwd, '-');
  const result = await runProcess(CODEX_COMMAND, args, { cwd, input: prompt, onLine });
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || '').trim().slice(-4000);
    throw new Error(`Codex exited with code ${result.code}${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

async function runNewGameVisualAutomation({ job, store, gameDir, gameUrl, artifactDir, qa, log }) {
  if (job.kind !== 'new-game' || !qa?.passed) return { qa, visualFloor: null, visualPolishApplied: false };
  const { runVisualFloorGate, buildAutomaticVisualPolishPrompt } = await import('./visual-gate.js');
  const { runQa } = await import('./qa.js');
  const { createSnapshot, restoreSnapshot } = await import('./snapshots.js');

  await store.patch(job.id, { stage: 'First-prototype quality gates' });
  await log('Technical QA passed; checking Visual + Retention/Replay + Ad Readiness gates');
  let gate = await runVisualFloorGate({ gameDir, artifactDir });
  await store.patch(job.id, { visualFloor: gate });

  if (!gate.audited) {
    await log(`First-prototype quality audit could not be verified: ${gate.error || 'unknown audit error'}`);
    return { qa, visualFloor: gate, visualPolishApplied: false };
  }

  await log(`Quality gates: ${gate.status} · combined ${gate.score}/100 · visual ${gate.visualScore ?? '—'} · retention ${gate.retentionScore ?? '—'} · ads ${gate.adReadinessScore ?? 'N/A'}${gate.hardFails?.length ? ` · visual hard fails: ${gate.hardFails.join(', ')}` : ''}`);
  if (gate.passed || MAX_VISUAL_POLISH_PASSES === 0) return { qa, visualFloor: gate, visualPolishApplied: false };

  let visualPolishApplied = false;
  for (let pass = 1; pass <= MAX_VISUAL_POLISH_PASSES && !gate.passed; pass += 1) {
    const beforeGate = gate;
    const safety = await createSnapshot({
      stateDir: store.stateDir,
      game: job.game,
      gameDir,
      label: `Before automatic quality polish ${pass} (${beforeGate.score}/100)`,
      kind: 'pre-quality-polish',
      jobId: job.id
    });

    await store.patch(job.id, {
      stage: `Automatic quality polish ${pass}`,
      attempt: Math.max(Number((await store.get(job.id))?.attempt || 1) + 1, 2),
      mode: 'standard',
      tokensUsed: null,
      qualityPolishPass: pass,
      qualityPolishSnapshotId: safety.id
    });
    await log(`One or more first-prototype gates failed; starting automatic quality polish ${pass}/${MAX_VISUAL_POLISH_PASSES}`);
    await runCodex({ cwd: gameDir, prompt: buildAutomaticVisualPolishPrompt({ game: job.game, gate: beforeGate }), mode: 'standard', onLine: line => void log(line) });
    visualPolishApplied = true;

    await store.patch(job.id, { stage: `QA after quality polish ${pass}` });
    await log('Re-running desktop/phone technical QA after automatic quality polish');
    const candidateQa = await runQa({ url: gameUrl, artifactDir });
    if (!candidateQa.passed) {
      await log(`Automatic quality polish introduced ${candidateQa.issues.length} technical QA issue(s); restoring the safer pre-polish version`);
      await restoreSnapshot({ stateDir: store.stateDir, game: job.game, gameDir, snapshotId: safety.id });
      qa = await runQa({ url: gameUrl, artifactDir });
      gate = beforeGate;
      break;
    }

    await store.patch(job.id, { stage: `Quality gate recheck ${pass}` });
    const candidateGate = await runVisualFloorGate({ gameDir, artifactDir });
    if (!candidateGate.audited) {
      await log('Post-polish quality audit could not be verified; restoring the known pre-polish version');
      await restoreSnapshot({ stateDir: store.stateDir, game: job.game, gameDir, snapshotId: safety.id });
      qa = await runQa({ url: gameUrl, artifactDir });
      gate = beforeGate;
      break;
    }

    if ((candidateGate.score ?? 0) < (beforeGate.score ?? 0)) {
      await log(`Automatic quality polish regressed the combined gate from ${beforeGate.score}/100 to ${candidateGate.score}/100; restoring the better pre-polish version`);
      await restoreSnapshot({ stateDir: store.stateDir, game: job.game, gameDir, snapshotId: safety.id });
      qa = await runQa({ url: gameUrl, artifactDir });
      gate = beforeGate;
      break;
    }

    qa = candidateQa;
    gate = candidateGate;
    await log(`Quality recheck: ${gate.status} · combined ${gate.score}/100 · visual ${gate.visualScore ?? '—'} · retention ${gate.retentionScore ?? '—'} · ads ${gate.adReadinessScore ?? 'N/A'}`);
  }

  await store.patch(job.id, { qa, visualFloor: gate, visualPolishApplied });
  return { qa, visualFloor: gate, visualPolishApplied };
}

export async function probeCodex(repoRoot) {
  try {
    const result = await runProcess(CODEX_COMMAND, ['--version'], { cwd: repoRoot, timeoutMs: 5000 });
    return { ready: result.code === 0, version: (result.stdout || result.stderr).trim() };
  } catch (error) { return { ready: false, version: '', error: error.message }; }
}

export async function runJob({ job, store, repoRoot, gameDir, gameRelativePath, gameUrl }) {
  const log = async line => store.appendLog(job.id, line);
  const before = await snapshotTextSource(gameDir);
  const artifactDir = store.jobDir(job.id);
  let mode = classifyTask(job.instruction);

  try {
    await store.patch(job.id, {
      status: 'running',
      stage: mode === 'direct' ? 'Direct edit' : mode === 'quick' ? 'Codex quick edit' : 'Codex implementation',
      attempt: 1,
      mode,
      tokensUsed: mode === 'direct' ? 0 : null,
      error: null
    });

    if (mode === 'direct') {
      const direct = await tryDirectEdit(gameDir, job.instruction);
      if (direct.ok) {
        await log(`Direct Edit: 0 AI tokens · replaced ${JSON.stringify(direct.from)} with ${JSON.stringify(direct.to)} in ${direct.relative}`);
      } else {
        mode = 'quick';
        await store.patch(job.id, { stage: 'Codex quick edit', mode, tokensUsed: null });
        await log(`Direct Edit declined: ${direct.reason}. Falling back to token-efficient Quick Terra.`);
        await runCodex({ cwd: gameDir, prompt: buildPrompt(job, mode), mode, onLine: line => void log(line) });
      }
    } else {
      await log(`Starting ${mode === 'quick' ? 'token-efficient quick edit' : 'Codex implementation'} for ${job.game}`);
      await runCodex({ cwd: gameDir, prompt: buildPrompt(job, mode), mode, onLine: line => void log(line) });
    }

    let qa = null;
    for (let repair = 0; repair <= MAX_REPAIR_PASSES; repair += 1) {
      await store.patch(job.id, { stage: repair === 0 ? 'Automated QA' : `QA after repair ${repair}` });
      await log('Running desktop/mobile browser smoke tests');
      const { runQa } = await import('./qa.js');
      qa = await runQa({ url: gameUrl, artifactDir });
      await store.patch(job.id, { qa });
      if (qa.passed || repair === MAX_REPAIR_PASSES) break;
      const repairMode = mode === 'standard' ? 'standard' : 'quick';
      await store.patch(job.id, {
        stage: repairMode === 'quick' ? `Codex quick repair ${repair + 1}` : `Codex repair pass ${repair + 1}`,
        attempt: repair + 2,
        mode: repairMode,
        tokensUsed: null
      });
      await log(`QA found ${qa.issues.length} issue(s); starting ${repairMode === 'quick' ? 'token-efficient quick repair' : 'standard repair'} ${repair + 1}`);
      await runCodex({ cwd: gameDir, prompt: buildRepairPrompt(job, qa, repairMode), mode: repairMode, onLine: line => void log(line) });
      mode = repairMode;
    }

    const visualResult = await runNewGameVisualAutomation({ job, store, gameDir, gameUrl, artifactDir, qa, log });
    qa = visualResult.qa;
    const visualFloor = visualResult.visualFloor;
    const diffStat = await runScopedDiffStat({ before, gameDir, gameRelativePath });
    const qualityAccepted = job.kind !== 'new-game' || Boolean(visualFloor?.passed);

    if (qa?.passed && qualityAccepted) {
      await log(job.kind === 'new-game' ? 'Build passed technical QA and all first-prototype quality gates' : 'Build passed automated QA');
      await store.patch(job.id, {
        status: 'passed', stage: 'Passed', finishedAt: new Date().toISOString(), diffStat, qa, visualFloor,
        visualPolishApplied: visualResult.visualPolishApplied
      });
    } else {
      if (qa?.passed && job.kind === 'new-game') {
        await log(`Technical QA passed, but first-prototype quality gates are still ${visualFloor?.status || 'unverified'}${visualFloor?.score != null ? ` at ${visualFloor.score}/100 combined` : ''}; marking Needs Review instead of Passed`);
      } else {
        await log('Build completed but automated QA still reports failures');
      }
      await store.patch(job.id, {
        status: 'needs-review',
        stage: qa?.passed && job.kind === 'new-game' ? 'First-prototype needs work' : 'Needs review',
        finishedAt: new Date().toISOString(), diffStat, qa, visualFloor,
        visualPolishApplied: visualResult.visualPolishApplied
      });
    }
  } catch (error) {
    await log(`ERROR: ${error.message}`);
    await store.patch(job.id, {
      status: 'failed', stage: 'Failed', finishedAt: new Date().toISOString(), error: error.message,
      diffStat: await runScopedDiffStat({ before, gameDir, gameRelativePath })
    });
  }
}
