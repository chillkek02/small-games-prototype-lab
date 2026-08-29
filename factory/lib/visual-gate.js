import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseVisualRubric, visualRubricAuditInstructions, visualQualityBrief } from './visual-quality.js';

const CODEX_COMMAND = process.env.GAME_FACTORY_CODEX_COMMAND || 'codex';

function runProcess(command, args, { cwd, input = '', timeoutMs = 6 * 60 * 1000 } = {}) {
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
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 80000) stderr = stderr.slice(-80000); });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Visual quality gate timed out after ${Math.round(timeoutMs / 60000)} minutes`));
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

export async function runVisualFloorGate({ gameDir, artifactDir }) {
  const imageNames = ['desktop.png', 'mobile.png'];
  const images = [];
  for (const name of imageNames) {
    const file = path.join(artifactDir, name);
    try { await fsp.access(file); images.push(file); } catch {}
  }
  if (!images.length) {
    return { audited: false, passed: false, status: 'AUDIT_ERROR', score: null, hardFails: [], categories: {}, report: 'No QA screenshots were available for the visual floor.', error: 'No screenshots' };
  }

  const prompt = `model: terra\nYou are the AUTOMATIC VISUAL QUALITY GATE inside Gutpopper Game Factory.\n\nREAD-ONLY AUDIT. Do not modify files.\nThe attached screenshots are the new game's desktop 1440x900 and phone 390x844 QA captures when available. Judge the actual presentation shown, not the developer's intent and not the fact that this is an early prototype.\n\nThis gate exists specifically to stop crude programmer-art first drafts from being presented as successful prototypes. Be strict about raw boxes, generic panels, empty scenes, primitive characters/props, weak typography, dead sidebars, missing feedback, and phone layouts pasted onto desktop. Simple stylization is fine when it is cohesive and deliberate.\n\n${visualRubricAuditInstructions()}\n\nBefore the required JSON block, give at most 8 short lines explaining the biggest visual problems and the most valuable presentation changes. Do not edit the game.`;

  const args = [
    'exec', '--ephemeral', '--sandbox', 'read-only',
    '-c', 'approval_policy=never',
    '-m', 'gpt-5.6-terra',
    '-c', 'model_reasoning_effort=medium',
    '-c', 'model_verbosity=low',
    '--color', 'never'
  ];
  for (const image of images) args.push('--image', image);
  args.push('-C', gameDir, '-');

  try {
    const result = await runProcess(CODEX_COMMAND, args, { cwd: gameDir, input: prompt });
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout || '').trim().slice(-2500);
      throw new Error(`Visual gate exited with code ${result.code}${detail ? `: ${detail}` : ''}`);
    }
    const report = result.stdout.trim();
    const rubric = parseVisualRubric(report);
    if (!rubric) {
      return { audited: false, passed: false, status: 'AUDIT_ERROR', score: null, hardFails: [], categories: {}, report, error: 'Visual rubric block was missing or invalid.' };
    }
    return { audited: true, ...rubric, report, error: null };
  } catch (error) {
    return { audited: false, passed: false, status: 'AUDIT_ERROR', score: null, hardFails: [], categories: {}, report: `Visual gate unavailable: ${error.message}`, error: error.message };
  }
}

export function buildAutomaticVisualPolishPrompt({ game, gate }) {
  const categoryLines = Object.entries(gate.categories || {}).map(([key, value]) => `- ${key}: ${value}/100`).join('\n') || '- unavailable';
  const hardFails = gate.hardFails?.length ? gate.hardFails.map(id => `- ${id}`).join('\n') : '- none';
  return `model: terra\nYou are the AUTOMATIC FIRST-PROTOTYPE POLISH agent inside Gutpopper Game Factory.\n\nTARGET\nWork only in the current game folder: ${game}. Preserve the working core loop, controls, progression, Poki integration, and performance. Do not commit, push, install unrelated dependencies, or edit outside this game.\n\nWHY THIS PASS IS RUNNING\nThe game passed technical browser QA but failed the Factory's minimum visual quality floor. Perform one focused presentation-quality pass. This is not permission to redesign the game mechanic or bloat scope.\n\nCURRENT VISUAL FLOOR\nStatus: ${gate.status}\nScore: ${gate.score ?? 'unknown'}/100\nCategory scores:\n${categoryLines}\nHard fails:\n${hardFails}\n\nAUDITOR REPORT\n${gate.report || 'No report text.'}\n\n${visualQualityBrief()}\n\nPOLISH PRIORITIES\n- Replace crude/default/programmer-art presentation with a deliberate modern casual-game visual system.\n- Improve the weakest rubric categories first and eliminate every listed hard fail.\n- Strengthen palette, typography, buttons/cards/HUD, composition, silhouettes, environment richness, layering/depth, and action feedback as appropriate to this game's chosen art style.\n- Desktop must use 1440x900 intentionally; phone must remain touch-first and readable at 390x844.\n- Prefer lightweight code art, SVG/canvas/engine primitives that are intentionally designed, gradients, shadows, particles, procedural detail, and reuse over heavy downloaded assets.\n- Protect fast startup, stable frame pacing, and current Poki hooks. Do not add a fake loading delay.\n- Do not remove functioning gameplay just to make screenshots prettier.\n\nFinish after the focused polish pass. Gutpopper Game Factory will rerun technical QA and the visual floor automatically.`;
}
