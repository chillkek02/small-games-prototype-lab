import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { runQa } from './qa.js';
import { runPokiReadiness } from './poki-readiness.js';
import { runAiPlaytest } from './playtester.js';
import { parseVisualRubric, visualRubricAuditInstructions } from './visual-quality.js';

const CODEX_COMMAND = process.env.GAME_FACTORY_CODEX_COMMAND || 'codex';

function runProcess(command, args, { cwd, input = '', timeoutMs = 8 * 60 * 1000 } = {}) {
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
    child.stdout?.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > 140000) stdout = stdout.slice(-140000); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 120000) stderr = stderr.slice(-120000); });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Quality review timed out after ${Math.round(timeoutMs / 60000)} minutes`));
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

function extractScore(text = '') {
  const match = text.match(/(?:overall(?:\s+quality)?\s+score|quality\s+score)\s*[:*-]*\s*(\d{1,3})\s*\/\s*100/i)
    || text.match(/\b(\d{1,3})\s*\/\s*100\b/);
  if (!match) return null;
  return Math.max(0, Math.min(100, Number(match[1])));
}

function formatBytes(bytes = 0) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function playtestSummary(playtest) {
  const sessions = playtest.sessions || [];
  const lines = [
    `AI playtest score: ${playtest.score}/100`,
    `Planner confidence: ${playtest.plan?.confidence || 'unknown'}`,
    `Inferred objective: ${playtest.plan?.objective || 'unknown'}`,
    `Plan: ${playtest.plan?.summary || 'unknown'}`
  ];
  for (const device of ['desktop', 'phone']) {
    const runs = sessions.filter(run => run.device === device);
    const visualChanges = runs.reduce((sum, run) => sum + run.visualChanges, 0);
    const activeActions = runs.reduce((sum, run) => sum + run.activeActionCount, 0);
    const terminal = runs.filter(run => run.terminal).map(run => `${run.terminal.type}:${run.terminal.term}`).join(', ') || 'not reached';
    const errors = runs.reduce((sum, run) => sum + run.errors.length, 0);
    lines.push(`${device}: ${runs.length} runs; visual response ${visualChanges}/${activeActions} active actions; terminal=${terminal}; errors=${errors}`);
  }
  lines.push(`Findings: ${(playtest.notes || []).join(' | ') || 'none'}`);
  return lines.join('\n');
}

async function runVisualDirector({ gameDir, artifactDir, qa, playtest, readiness }) {
  const images = ['desktop.png', 'mobile.png', 'playtest-desktop.png', 'playtest-phone.png']
    .map(name => path.join(artifactDir, name));
  const existing = [];
  for (const image of images) {
    try { await fsp.access(image); existing.push(image); } catch {}
  }
  if (!existing.length) return { report: 'Visual Director could not run because no screenshots were produced.', score: null, rubric: null, error: 'No screenshots' };

  const technicalSummary = qa.views.map(view => `${view.name}: ${view.passed ? 'PASS' : 'FAIL'}; ${view.issues.join(' | ') || 'no technical issues'}`).join('\n');
  const performanceSummary = [
    `Performance score: ${readiness.performanceScore}/100`,
    `Poki readiness score: ${readiness.pokiScore}/100`,
    `Meaningful UI: ${readiness.metrics.meaningfulReadyMs ?? 'unknown'} ms local`,
    `Initial same-origin payload: ${formatBytes(readiness.metrics.initialBytes)}`,
    `Initial local requests: ${readiness.metrics.initialRequests}`,
    `Factory 4 Mbps estimate: ${readiness.metrics.estimated4MbpsReadyMs} ms`,
    `Sampled FPS: ${readiness.metrics.frame.fps || 'unknown'}; long-frame ratio: ${Math.round((readiness.metrics.frame.longFrameRatio || 0) * 100)}%`,
    `Ad-block resilience: ${readiness.adBlock.passed ? 'PASS' : 'FAIL'}`,
    `SDK event sequence: ${readiness.sdkEvents?.passed ? 'PASS' : 'FAIL'}`,
    `Performance findings: ${readiness.performanceNotes.join(' | ')}`,
    `Poki findings: ${readiness.pokiNotes.join(' | ')}`
  ].join('\n');

  const prompt = `model: terra\nYou are the VISUAL DIRECTOR and GAME DOCTOR inside Gutpopper Game Factory.\n\nThis is a READ-ONLY audit. Do not modify any files.\nThe attached images are, in order when present: desktop QA (1440x900), phone QA (390x844), AI Playtester desktop gameplay, AI Playtester phone gameplay.\nYou may inspect the game source in the current working directory when it helps explain what you see.\n\nTECHNICAL QA\n${technicalSummary}\n\nAI PLAYTESTER\n${playtestSummary(playtest)}\n\nPOKI / WEB PERFORMANCE\n${performanceSummary}\n\nEvaluate this as a commercial browser/Poki-style casual game, not as a coding demo. Focus on what a real player sees and feels. Judge:\n- first-glance hook and clarity\n- visual polish and art-direction consistency\n- hierarchy/readability and HUD scale\n- desktop composition and screen utilization\n- phone composition, touch readability, safe margins, obstruction\n- whether the inferred controls/objective seem understandable from the actual presentation\n- game-feel signals visible after the AI Playtester follows the game's inferred controls\n- whether success/failure/retry feedback is understandable and frictionless when the playtest reaches it\n- first-time access: avoid unnecessary splash/menu friction; get players to meaningful interaction quickly\n- loading/performance risks when they are severe enough to affect player conversion or feel\n- whether the game looks like a crude programmer prototype, a promising polished prototype, or a publishable casual game\n- the highest-value changes that would materially improve player response\n\nDESKTOP ADAPTATION IS A HARD QUALITY REQUIREMENT:\nA 1440x900 desktop build must look intentionally landscape and use the available screen area. Do not accept a narrow portrait/mobile game column centered between large empty or decorative side gutters. The desktop camera/playfield/menu/HUD may recompose differently from phone while preserving the same game. If desktop still looks like a phone screenshot placed in a desktop window, call it out as a major problem and lower the score substantially.\n\nPERFORMANCE IS A HARD PUBLISHING CONCERN:\nPoki/browser games should keep file size lean, load quickly, maintain stable frame pacing, progressively load nonessential content, and remain playable when the ad SDK is blocked. Treat severe load weight, startup delay, frame pacing, or ad-block failure as publish blockers. The numeric Factory targets in the supplied report are internal quality targets.\n\nPLAYTEST INTERPRETATION:\nThe AI Playtester is bounded and synthetic. Treat repeated no-response controls, browser errors, missing retry after a detected terminal state, or clear desktop/phone control parity failures as strong evidence. Do not treat failure to finish a long game in a short bounded session as proof the game is broken.\n\n${visualRubricAuditInstructions()}\n\nReturn concise markdown using EXACTLY these headings before the required VISUAL_RUBRIC_JSON block:\nOVERALL QUALITY SCORE: NN/100\n## What Works\n## Visual Problems\n## Phone Problems\n## Gameplay / Feel Concerns\n## Performance / Poki Concerns\n## Top 5 Fixes\n## Publish Verdict\nKeep the Top 5 Fixes concrete and implementation-ready. Be severe about ugly/default/placeholder presentation; do not grade on an 'early prototype' curve.`;

  const args = [
    'exec', '--ephemeral', '--sandbox', 'read-only',
    '-c', 'approval_policy=never',
    '-m', 'gpt-5.6-terra',
    '-c', 'model_reasoning_effort=medium',
    '-c', 'model_verbosity=low',
    '--color', 'never'
  ];
  for (const image of existing) args.push('--image', image);
  args.push('-C', gameDir, '-');

  try {
    const result = await runProcess(CODEX_COMMAND, args, { cwd: gameDir, input: prompt });
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout || '').trim().slice(-3000);
      throw new Error(`Codex visual review exited with code ${result.code}${detail ? `: ${detail}` : ''}`);
    }
    const report = result.stdout.trim() || 'Visual Director returned no report text.';
    const rubric = parseVisualRubric(report);
    const score = rubric?.score ?? extractScore(report);
    return { report, score, rubric, error: rubric ? null : 'Visual rubric block was missing or invalid; falling back to report score.' };
  } catch (error) {
    return { report: `Visual Director unavailable: ${error.message}`, score: null, rubric: null, error: error.message };
  }
}

export async function runQualityAudit({ game, gameDir, url, stateDir }) {
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const artifactDir = path.join(stateDir, 'quality', id);
  await fsp.mkdir(artifactDir, { recursive: true });

  const startedAt = new Date().toISOString();

  const readiness = await runPokiReadiness({ gameDir, url });
  const qa = await runQa({ url, artifactDir });
  const playtest = await runAiPlaytest({ gameDir, url, artifactDir });
  const visual = await runVisualDirector({ gameDir, artifactDir, qa, playtest, readiness });

  const technicalScore = qa.passed ? 100 : Math.max(30, 100 - qa.issues.length * 12);
  const playtestScore = playtest.score;
  const visualScore = visual.score ?? Math.round((technicalScore + playtestScore) / 2);
  const overallScore = Math.round(
    visualScore * .45 +
    technicalScore * .10 +
    playtestScore * .20 +
    readiness.performanceScore * .15 +
    readiness.pokiScore * .10
  );

  const visualFloor = visual.rubric || {
    version: null,
    score: visualScore,
    status: visualScore >= 70 ? 'PASS' : visualScore >= 60 ? 'NEEDS_POLISH' : 'VISUAL_FAIL',
    passed: visualScore >= 70,
    minimumPrototypeScore: 70,
    publishCandidateScore: 80,
    categories: {},
    hardFails: [],
    summary: 'Visual rubric details were unavailable.'
  };

  const audit = {
    id,
    game,
    startedAt,
    finishedAt: new Date().toISOString(),
    overallScore,
    technicalScore,
    interactionScore: playtestScore,
    playtestScore,
    visualScore,
    visualFloor,
    visualFloorPassed: visualFloor.passed,
    performanceScore: readiness.performanceScore,
    pokiScore: readiness.pokiScore,
    qa,
    playtest,
    readiness,
    visualReport: visual.report,
    visualError: visual.error,
    artifacts: {
      desktop: 'desktop.png',
      phone: 'mobile.png',
      desktopPlay: 'playtest-desktop.png',
      phonePlay: 'playtest-phone.png'
    }
  };
  await fsp.writeFile(path.join(artifactDir, 'audit.json'), JSON.stringify(audit, null, 2), 'utf8');
  return audit;
}
