import { spawn } from 'node:child_process';
import { runQualityAudit } from './quality.js';
import { visualQualityBrief } from './visual-quality.js';
import { createSnapshot } from './snapshots.js';

const CODEX_COMMAND = process.env.GAME_FACTORY_CODEX_COMMAND || 'codex';
const MAX_AUTO_POLISH_PASSES = Math.max(0, Math.min(2, Number(process.env.GAME_FACTORY_NEW_GAME_POLISH_PASSES || 1)));

function runProcess(command, args, { cwd, input = '', timeoutMs = 15 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      windowsHide: true,
      shell: process.platform === 'win32'
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    child.stdout?.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > 120000) stdout = stdout.slice(-120000); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 120000) stderr = stderr.slice(-120000); });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Auto visual polish timed out after ${Math.round(timeoutMs / 60000)} minutes`));
    }, timeoutMs);
    child.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    if (child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

function categoryLines(floor) {
  const labels = {
    artDirection: 'Art direction / cohesion',
    uiTypography: 'UI / typography',
    composition: 'Composition / responsive layout',
    worldRichness: 'World / asset richness',
    gameFeel: 'Game feel / feedback',
    readability: 'Readability / silhouettes',
    finish: 'Professional finish / personality'
  };
  return Object.entries(labels).map(([id, label]) => `${label}: ${floor?.categories?.[id] ?? '—'}/100`).join('\n');
}

function polishPrompt(audit) {
  const floor = audit.visualFloor || {};
  return `model: terra\nYou are the AUTOMATIC PRESENTATION POLISH agent inside Gutpopper Game Factory.\n\nThe brand-new game technically works, but its first visual-quality audit did not meet the required prototype floor. Improve the REAL game source now. Do not write a design document. Do not commit/push or edit outside this game folder. Preserve the working core loop, controls, progression, Poki integration, and performance.\n\n${visualQualityBrief()}\n\nCURRENT VISUAL FLOOR\nStatus: ${floor.status || 'unknown'}\nScore: ${floor.score ?? 'unknown'}/100\nMinimum: ${floor.minimumPrototypeScore ?? 70}/100\nSummary: ${floor.summary || 'none'}\n\nCATEGORY SCORES\n${categoryLines(floor)}\n\nHARD FAILS\n${(floor.hardFails || []).join('\n') || 'None'}\n\nVISUAL DIRECTOR REPORT\n${audit.visualReport || 'No report'}\n\nREQUIRED POLISH BEHAVIOR\n- Fix the lowest-scoring visual categories first.\n- Eliminate every hard-fail condition that is actually present.\n- Replace crude/default/programmer-art presentation with a cohesive modern casual-game look appropriate to the chosen game style.\n- Improve major characters/vehicles/props/environment assets beyond raw primitives using lightweight layered/code-generated/vector/engine-native techniques.\n- Improve typography, button/card styling, hierarchy, spacing, palette, shadows/lighting/depth, scene dressing, and action feedback.\n- Desktop must use the 1440x900 landscape composition intentionally; phone must remain touch-first and clear.\n- Add satisfying but performance-conscious game feel.\n- Do not bloat startup with large external art or unnecessary libraries.\n\nFinish with a concise summary of what you changed.`;
}

async function runPolishCodex({ gameDir, audit }) {
  const args = [
    'exec', '--ephemeral', '--sandbox', 'workspace-write',
    '-c', 'approval_policy=never',
    '-m', 'gpt-5.6-terra',
    '-c', 'model_reasoning_effort=high',
    '-c', 'model_verbosity=low',
    '--color', 'never', '-C', gameDir, '-'
  ];
  const result = await runProcess(CODEX_COMMAND, args, { cwd: gameDir, input: polishPrompt(audit) });
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || '').trim().slice(-3000);
    throw new Error(`Auto visual polish exited with code ${result.code}${detail ? `: ${detail}` : ''}`);
  }
  return (result.stdout || '').trim();
}

export async function enforceNewGameVisualFloor({ jobId, game, gameDir, gameUrl, stateDir, store }) {
  if (MAX_AUTO_POLISH_PASSES <= 0) return null;
  let audit = await runQualityAudit({ game, gameDir, url: gameUrl, stateDir });
  await store.patch(jobId, { visualFloor: audit.visualFloor, qualityAuditId: audit.id });
  await store.appendLog(jobId, `Visual Quality Floor: ${audit.visualFloor?.status || 'unknown'} · ${audit.visualFloor?.score ?? '—'}/100`);

  for (let pass = 1; pass <= MAX_AUTO_POLISH_PASSES && !audit.visualFloorPassed; pass += 1) {
    await store.patch(jobId, { status: 'running', stage: `Auto visual polish ${pass}` });
    await store.appendLog(jobId, `First-build presentation is below the ${audit.visualFloor?.minimumPrototypeScore ?? 70}/100 visual floor; starting automatic polish pass ${pass}.`);
    await createSnapshot({
      stateDir,
      game,
      gameDir,
      label: `Before automatic visual polish ${pass}`,
      kind: 'pre-auto-visual-polish',
      jobId
    });
    const summary = await runPolishCodex({ gameDir, audit });
    if (summary) await store.appendLog(jobId, `Auto polish: ${summary.replace(/\s+/g, ' ').slice(0, 900)}`);
    await store.patch(jobId, { stage: `Visual floor recheck ${pass}` });
    audit = await runQualityAudit({ game, gameDir, url: gameUrl, stateDir });
    await store.patch(jobId, { visualFloor: audit.visualFloor, qualityAuditId: audit.id });
    await store.appendLog(jobId, `Visual Quality Floor after polish ${pass}: ${audit.visualFloor?.status || 'unknown'} · ${audit.visualFloor?.score ?? '—'}/100`);
  }

  if (audit.visualFloorPassed) {
    await store.patch(jobId, { status: 'passed', stage: 'Passed · visual floor', finishedAt: new Date().toISOString(), error: null });
  } else {
    await store.patch(jobId, {
      status: 'needs-review',
      stage: 'Needs visual polish',
      finishedAt: new Date().toISOString(),
      error: `Visual quality floor did not pass (${audit.visualFloor?.score ?? '—'}/100; minimum ${audit.visualFloor?.minimumPrototypeScore ?? 70}).`
    });
  }
  return audit;
}
