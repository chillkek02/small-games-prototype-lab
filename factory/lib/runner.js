import { spawn } from 'node:child_process';

const MAX_REPAIR_PASSES = Math.max(0, Math.min(3, Number(process.env.GAME_FACTORY_REPAIR_PASSES || 1)));
const CODEX_COMMAND = process.env.GAME_FACTORY_CODEX_COMMAND || 'codex';

const QUICK_ACTION = /\b(change|set|rename|replace|update|increase|decrease|remove|delete|hide|show|move|adjust|fix|correct|add)\b/i;
const QUICK_TARGET = /\b(comment|text|label|title|copy|typo|number|value|speed|size|color|colour|font|spacing|margin|padding|position|opacity|volume|name|word|button text)\b/i;
const COMPLEX_SIGNAL = /\b(system|mechanic|gameplay|architecture|refactor|overhaul|redesign|rework|new feature|level|mission|quest|enemy|boss|progression|upgrade system|physics|multiplayer|network|save system|inventory|economy|procedural|generation|combat system|ai behavior|sdk integration|monetization system)\b/i;

function classifyTask(instruction = '') {
  const text = instruction.trim();
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

function quickEditPrompt(job) {
  return `${quickEditRules(job.game)}

USER REQUEST
${job.instruction}

FINAL RESPONSE
Maximum 5 short lines: what changed, file changed, and any real blocker.`;
}

function buildPrompt(job, mode = 'standard') {
  if (mode === 'quick') return quickEditPrompt(job);
  return `${studioRules(job.game)}\n\nUSER REQUEST\n${job.instruction}`;
}

function buildRepairPrompt(job, qa, mode = 'standard') {
  const issueText = qa.issues.length ? qa.issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n') : 'No machine-readable issues were reported.';
  if (mode === 'quick') {
    return `${quickEditRules(job.game)}

FACTORY QA FOUND A PROBLEM
Fix only the concrete QA issue(s) below with the smallest possible edit. Do not investigate unrelated project history or architecture.

${issueText}

ORIGINAL REQUEST
${job.instruction}

FINAL RESPONSE
Maximum 5 short lines.`;
  }
  return `${studioRules(job.game)}\n\nAUTOMATED QA FAILED\nThe previous implementation was smoke-tested in desktop and mobile browser QA. Fix the failures below, then retest locally.\n\n${issueText}\n\nDo not undo the original requested change: ${job.instruction}`;
}

async function runProcess(command, args, { cwd, input = '', timeoutMs = 20 * 60 * 1000, onLine = () => {} } = {}) {
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
    let carryOut = '';
    let carryErr = '';

    const emitLines = (chunk, isErr) => {
      const joined = (isErr ? carryErr : carryOut) + chunk.toString();
      const parts = joined.split(/\r?\n/);
      const carry = parts.pop() || '';
      if (isErr) carryErr = carry; else carryOut = carry;
      for (const line of parts) if (line.trim()) onLine(line.trim(), isErr);
    };

    child.stdout?.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.length > 120000) stdout = stdout.slice(-120000);
      emitLines(chunk, false);
    });
    child.stderr?.on('data', chunk => {
      stderr += chunk.toString();
      if (stderr.length > 120000) stderr = stderr.slice(-120000);
      emitLines(chunk, true);
    });

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      settled = true;
      reject(new Error(`Process timed out after ${Math.round(timeoutMs / 60000)} minutes`));
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
      if (carryOut.trim()) onLine(carryOut.trim(), false);
      if (carryErr.trim()) onLine(carryErr.trim(), true);
      resolve({ code, stdout, stderr });
    });

    if (child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

async function runCodex({ cwd, prompt, onLine, mode = 'standard' }) {
  const args = [
    'exec',
    '--ephemeral',
    '--sandbox', 'workspace-write',
    '-c', 'approval_policy=never'
  ];

  if (mode === 'quick') {
    args.push('-c', 'model_reasoning_effort=low', '-c', 'model_verbosity=low');
    onLine('Quick Edit mode: Terra · low reasoning · low verbosity · Factory QA handles testing', false);
  } else {
    onLine('Standard mode: configured Codex model/reasoning · workspace-write sandbox · Factory QA', false);
  }

  args.push('--color', 'never', '-C', cwd, '-');

  const result = await runProcess(
    CODEX_COMMAND,
    args,
    { cwd, input: prompt, onLine }
  );
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || '').trim().slice(-4000);
    throw new Error(`Codex exited with code ${result.code}${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

async function gitDiffStat(repoRoot, gameRelativePath) {
  try {
    const result = await runProcess('git', ['diff', '--stat', '--', gameRelativePath], { cwd: repoRoot, timeoutMs: 10000 });
    return result.stdout.trim();
  } catch {
    return '';
  }
}

export async function probeCodex(repoRoot) {
  try {
    const result = await runProcess(CODEX_COMMAND, ['--version'], { cwd: repoRoot, timeoutMs: 5000 });
    return { ready: result.code === 0, version: (result.stdout || result.stderr).trim() };
  } catch (error) {
    return { ready: false, version: '', error: error.message };
  }
}

export async function runJob({ job, store, repoRoot, gameDir, gameRelativePath, gameUrl }) {
  const log = async line => store.appendLog(job.id, line);
  const mode = classifyTask(job.instruction);
  try {
    await store.patch(job.id, {
      status: 'running',
      stage: mode === 'quick' ? 'Codex quick edit' : 'Codex implementation',
      attempt: 1,
      mode,
      error: null
    });
    await log(`Starting ${mode === 'quick' ? 'token-efficient quick edit' : 'Codex implementation'} for ${job.game}`);
    await runCodex({
      cwd: gameDir,
      prompt: buildPrompt(job, mode),
      mode,
      onLine: line => void log(line)
    });

    let qa = null;
    for (let repair = 0; repair <= MAX_REPAIR_PASSES; repair += 1) {
      await store.patch(job.id, { stage: repair === 0 ? 'Automated QA' : `QA after repair ${repair}` });
      await log('Running desktop/mobile browser smoke tests');
      const { runQa } = await import('./qa.js');
      qa = await runQa({ url: gameUrl, artifactDir: store.jobDir(job.id) });
      await store.patch(job.id, { qa });

      if (qa.passed) break;
      if (repair === MAX_REPAIR_PASSES) break;

      const repairMode = mode === 'quick' ? 'quick' : 'standard';
      await store.patch(job.id, {
        stage: mode === 'quick' ? `Codex quick repair ${repair + 1}` : `Codex repair pass ${repair + 1}`,
        attempt: repair + 2
      });
      await log(`QA found ${qa.issues.length} issue(s); starting ${mode === 'quick' ? 'token-efficient quick repair' : 'standard repair'} ${repair + 1}`);
      await runCodex({
        cwd: gameDir,
        prompt: buildRepairPrompt(job, qa, repairMode),
        mode: repairMode,
        onLine: line => void log(line)
      });
    }

    const diffStat = await gitDiffStat(repoRoot, gameRelativePath);
    if (qa?.passed) {
      await log('Build passed automated QA');
      await store.patch(job.id, {
        status: 'passed',
        stage: 'Passed',
        finishedAt: new Date().toISOString(),
        diffStat,
        qa
      });
    } else {
      await log('Build completed but automated QA still reports failures');
      await store.patch(job.id, {
        status: 'needs-review',
        stage: 'Needs review',
        finishedAt: new Date().toISOString(),
        diffStat,
        qa
      });
    }
  } catch (error) {
    await log(`ERROR: ${error.message}`);
    await store.patch(job.id, {
      status: 'failed',
      stage: 'Failed',
      finishedAt: new Date().toISOString(),
      error: error.message,
      diffStat: await gitDiffStat(repoRoot, gameRelativePath)
    });
  }
}
