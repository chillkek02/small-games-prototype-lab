import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { runQa } from './qa.js';
import { runPokiReadiness } from './poki-readiness.js';

const CODEX_COMMAND = process.env.GAME_FACTORY_CODEX_COMMAND || 'codex';
const START_PATTERN = /^(?:play(?:\s+now)?|start(?:\s+(?:game|shift|job|run|level|mission|round|race|day))?|begin(?:\s+(?:game|shift|job|run|level|mission|round))?|go|launch|continue|new game)$/i;

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
    child.stdout?.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > 120000) stdout = stdout.slice(-120000); });
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

async function launchBrowser() {
  if (process.platform === 'win32') {
    try { return await chromium.launch({ channel: 'msedge', headless: true }); } catch {}
  }
  return chromium.launch({ headless: true });
}

async function clickStart(page) {
  const controls = page.locator('button, [role="button"], input[type="button"], input[type="submit"]');
  const count = Math.min(await controls.count(), 40);
  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i);
    const text = ((await control.innerText().catch(() => '')) || (await control.getAttribute('value')) || '').trim();
    if (!START_PATTERN.test(text)) continue;
    await control.click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(900);
    return text;
  }
  return null;
}

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function probeView(browser, { name, width, height, mobile, url, artifactDir }) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  const result = {
    name,
    viewport: `${width}x${height}`,
    startControl: null,
    visualChanged: false,
    responsiveAfterInputs: false,
    errors: [],
    screenshot: null
  };

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(900);
    result.startControl = await clickStart(page);
    const before = await page.screenshot({ fullPage: false });

    if (mobile) {
      const taps = [
        [width * .50, height * .70],
        [width * .25, height * .70],
        [width * .75, height * .70],
        [width * .50, height * .45],
        [width * .82, height * .82]
      ];
      for (const [x, y] of taps) {
        await page.touchscreen.tap(Math.round(x), Math.round(y)).catch(() => {});
        await page.waitForTimeout(260);
      }
    } else {
      const keys = ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyD'];
      for (const key of keys) {
        await page.keyboard.press(key).catch(() => {});
        await page.waitForTimeout(220);
      }
      await page.mouse.click(Math.round(width * .5), Math.round(height * .65)).catch(() => {});
    }

    await page.waitForTimeout(700);
    const after = await page.screenshot({ fullPage: false });
    result.visualChanged = digest(before) !== digest(after);
    result.responsiveAfterInputs = await page.evaluate(() => Boolean(document.body && document.documentElement));
    const file = `${name.toLowerCase().replace(/\s+/g, '-')}-play.png`;
    await fsp.writeFile(path.join(artifactDir, file), after);
    result.screenshot = file;
  } catch (error) {
    errors.push(error.message);
  } finally {
    result.errors = [...new Set(errors)].slice(0, 10);
    await context.close();
  }
  return result;
}

async function runInteractionProbe({ url, artifactDir }) {
  const browser = await launchBrowser();
  try {
    const desktop = await probeView(browser, { name: 'Desktop', width: 1440, height: 900, mobile: false, url, artifactDir });
    const phone = await probeView(browser, { name: 'Phone', width: 390, height: 844, mobile: true, url, artifactDir });
    return { checkedAt: new Date().toISOString(), views: [desktop, phone] };
  } finally {
    await browser.close();
  }
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

async function runVisualDirector({ gameDir, artifactDir, qa, interaction, readiness }) {
  const images = ['desktop.png', 'mobile.png', 'desktop-play.png', 'phone-play.png']
    .map(name => path.join(artifactDir, name));
  const existing = [];
  for (const image of images) {
    try { await fsp.access(image); existing.push(image); } catch {}
  }
  if (!existing.length) return { report: 'Visual Director could not run because no screenshots were produced.', score: null, error: 'No screenshots' };

  const interactionSummary = interaction.views.map(view =>
    `${view.name}: viewport ${view.viewport}; start=${view.startControl || 'not detected'}; visualChangedAfterInputs=${view.visualChanged}; responsive=${view.responsiveAfterInputs}; errors=${view.errors.length}`
  ).join('\n');
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
    `Performance findings: ${readiness.performanceNotes.join(' | ')}`,
    `Poki findings: ${readiness.pokiNotes.join(' | ')}`
  ].join('\n');

  const prompt = `model: terra\nYou are the VISUAL DIRECTOR and GAME DOCTOR inside Gutpopper Game Factory.\n\nThis is a READ-ONLY audit. Do not modify any files.\nThe attached images are, in order when present: desktop QA (1440x900), phone QA (390x844), desktop after interaction probe, phone after interaction probe.\nYou may inspect the game source in the current working directory when it helps explain what you see.\n\nTECHNICAL QA\n${technicalSummary}\n\nINTERACTION PROBE\n${interactionSummary}\n\nPOKI / WEB PERFORMANCE\n${performanceSummary}\n\nEvaluate this as a commercial browser/Poki-style casual game, not as a coding demo. Focus on what a real player sees and feels. Judge:\n- first-glance hook and clarity\n- visual polish and art-direction consistency\n- hierarchy/readability and HUD scale\n- desktop composition and screen utilization\n- phone composition, touch readability, safe margins, obstruction\n- game-feel signals visible in the interaction screenshots\n- first-time access: avoid unnecessary splash/menu friction; get players to meaningful interaction quickly\n- loading/performance risks when they are severe enough to affect player conversion or feel\n- whether the game looks like a prototype or a publishable casual game\n- the highest-value changes that would materially improve player response\n\nDESKTOP ADAPTATION IS A HARD QUALITY REQUIREMENT:\nA 1440x900 desktop build must look intentionally landscape and use the available screen area. Do not accept a narrow portrait/mobile game column centered between large empty or decorative side gutters. The desktop camera/playfield/menu/HUD may recompose differently from phone while preserving the same game. If desktop still looks like a phone screenshot placed in a desktop window, call it out as a major problem and lower the score substantially.\n\nPERFORMANCE IS A HARD PUBLISHING CONCERN:\nPoki publicly emphasizes lean file size, fast loading, stable frame rates, progressive loading, and playability when the ad SDK is blocked. Treat severe load weight, startup delay, frame pacing, or ad-block failure as publish blockers. The numeric Factory targets in the supplied report are internal quality targets, not official Poki thresholds.\n\nReturn concise markdown using EXACTLY these headings:\nOVERALL QUALITY SCORE: NN/100\n## What Works\n## Visual Problems\n## Phone Problems\n## Gameplay / Feel Concerns\n## Performance / Poki Concerns\n## Top 5 Fixes\n## Publish Verdict\nKeep the Top 5 Fixes concrete and implementation-ready. Do not praise weak work just to be agreeable.`;

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
    return { report, score: extractScore(report), error: null };
  } catch (error) {
    return { report: `Visual Director unavailable: ${error.message}`, score: null, error: error.message };
  }
}

export async function runQualityAudit({ game, gameDir, url, stateDir }) {
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const artifactDir = path.join(stateDir, 'quality', id);
  await fsp.mkdir(artifactDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const [qa, readiness] = await Promise.all([
    runQa({ url, artifactDir }),
    runPokiReadiness({ gameDir, url })
  ]);
  const interaction = await runInteractionProbe({ url, artifactDir });
  const visual = await runVisualDirector({ gameDir, artifactDir, qa, interaction, readiness });
  const technicalScore = qa.passed ? 100 : Math.max(30, 100 - qa.issues.length * 12);
  const interactionScore = Math.round(interaction.views.reduce((sum, view) => {
    const score = (view.responsiveAfterInputs ? 55 : 0) + (view.visualChanged ? 35 : 0) + (view.errors.length === 0 ? 10 : 0);
    return sum + score;
  }, 0) / interaction.views.length);

  const visualScore = visual.score ?? Math.round((technicalScore + interactionScore) / 2);
  const overallScore = Math.round(
    visualScore * .50 +
    technicalScore * .15 +
    interactionScore * .10 +
    readiness.performanceScore * .15 +
    readiness.pokiScore * .10
  );

  const audit = {
    id,
    game,
    startedAt,
    finishedAt: new Date().toISOString(),
    overallScore,
    technicalScore,
    interactionScore,
    visualScore: visual.score,
    performanceScore: readiness.performanceScore,
    pokiScore: readiness.pokiScore,
    qa,
    interaction,
    readiness,
    visualReport: visual.report,
    visualError: visual.error,
    artifacts: {
      desktop: 'desktop.png',
      phone: 'mobile.png',
      desktopPlay: 'desktop-play.png',
      phonePlay: 'phone-play.png'
    }
  };
  await fsp.writeFile(path.join(artifactDir, 'audit.json'), JSON.stringify(audit, null, 2), 'utf8');
  return audit;
}
