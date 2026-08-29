import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const CODEX_COMMAND = process.env.GAME_FACTORY_CODEX_COMMAND || 'codex';
const START_PATTERN = /^(?:play(?:\s+now)?|start(?:\s+(?:game|shift|job|run|level|mission|round|race|day))?|begin(?:\s+(?:game|shift|job|run|level|mission|round))?|go|launch|continue|new game)$/i;
const RESTART_PATTERN = /^(?:retry|restart|replay|again|play again|try again|next run|next shift|next job|continue)$/i;
const ALLOWED_KEYS = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD','KeyE','KeyF','ShiftLeft','Enter']);

function runProcess(command, args, { cwd, input = '', timeoutMs = 5 * 60 * 1000 } = {}) {
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
    child.stdout?.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > 100000) stdout = stdout.slice(-100000); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 100000) stderr = stderr.slice(-100000); });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`AI Playtester planning timed out after ${Math.round(timeoutMs / 60000)} minutes`));
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

function fallbackPlan() {
  return {
    summary: 'Fallback browser-game control sweep',
    objective: 'Exercise common movement/action controls and look for a responsive gameplay loop.',
    confidence: 'low',
    successTerms: ['complete','completed','win','won','success','victory','mission complete','shift complete','job complete','level complete'],
    failureTerms: ['game over','failed','failure','you lose','time up','out of time','try again'],
    restartTerms: ['retry','restart','replay','again','play again','try again'],
    desktopActions: [
      { type: 'keyHold', key: 'KeyW', durationMs: 650 },
      { type: 'keyHold', key: 'KeyA', durationMs: 450 },
      { type: 'keyHold', key: 'KeyD', durationMs: 700 },
      { type: 'keyTap', key: 'Space' },
      { type: 'keyTap', key: 'KeyE' },
      { type: 'click', x: .5, y: .62 },
      { type: 'wait', durationMs: 500 }
    ],
    phoneActions: [
      { type: 'tap', x: .5, y: .72 },
      { type: 'drag', x1: .28, y1: .72, x2: .72, y2: .72, durationMs: 650 },
      { type: 'drag', x1: .72, y1: .72, x2: .28, y2: .72, durationMs: 650 },
      { type: 'tap', x: .82, y: .78 },
      { type: 'tap', x: .5, y: .48 },
      { type: 'wait', durationMs: 500 }
    ]
  };
}

function extractJson(text = '') {
  const cleaned = String(text).replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Planner did not return JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function clamp01(value, fallback = .5) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0.02, Math.min(.98, number)) : fallback;
}

function clampMs(value, fallback = 350) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(80, Math.min(1400, Math.round(number))) : fallback;
}

function sanitizeAction(action, mobile) {
  if (!action || typeof action !== 'object') return null;
  const type = String(action.type || '');
  if (type === 'wait') return { type, durationMs: clampMs(action.durationMs, 350) };
  if (!mobile && type === 'keyTap' && ALLOWED_KEYS.has(action.key)) return { type, key: action.key };
  if (!mobile && type === 'keyHold' && ALLOWED_KEYS.has(action.key)) return { type, key: action.key, durationMs: clampMs(action.durationMs, 500) };
  if (!mobile && type === 'click') return { type, x: clamp01(action.x), y: clamp01(action.y) };
  if (mobile && type === 'tap') return { type, x: clamp01(action.x), y: clamp01(action.y) };
  if (type === 'drag') {
    return {
      type,
      x1: clamp01(action.x1, .3), y1: clamp01(action.y1, .7),
      x2: clamp01(action.x2, .7), y2: clamp01(action.y2, .7),
      durationMs: clampMs(action.durationMs, 550)
    };
  }
  return null;
}

function sanitizeTerms(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  return value.map(item => String(item).trim().toLowerCase()).filter(Boolean).slice(0, 12);
}

function sanitizePlan(raw) {
  const fallback = fallbackPlan();
  const confidence = ['high','medium','low'].includes(String(raw?.confidence).toLowerCase()) ? String(raw.confidence).toLowerCase() : 'low';
  const desktopActions = Array.isArray(raw?.desktopActions)
    ? raw.desktopActions.map(action => sanitizeAction(action, false)).filter(Boolean).slice(0, 12)
    : [];
  const phoneActions = Array.isArray(raw?.phoneActions)
    ? raw.phoneActions.map(action => sanitizeAction(action, true)).filter(Boolean).slice(0, 12)
    : [];
  return {
    summary: String(raw?.summary || fallback.summary).slice(0, 300),
    objective: String(raw?.objective || fallback.objective).slice(0, 500),
    confidence,
    successTerms: sanitizeTerms(raw?.successTerms, fallback.successTerms),
    failureTerms: sanitizeTerms(raw?.failureTerms, fallback.failureTerms),
    restartTerms: sanitizeTerms(raw?.restartTerms, fallback.restartTerms),
    desktopActions: desktopActions.length ? desktopActions : fallback.desktopActions,
    phoneActions: phoneActions.length ? phoneActions : fallback.phoneActions
  };
}

async function planGame(gameDir) {
  const prompt = `You are the READ-ONLY AI PLAYTEST PLANNER inside Gutpopper Game Factory.\n\nInspect the current browser game's source to infer what a first-time player should do. Do not edit anything. Do not run browsers or servers.\n\nReturn JSON ONLY with this exact shape:\n{\n  "summary":"short description of the control strategy",\n  "objective":"what the player is trying to accomplish",\n  "confidence":"high|medium|low",\n  "successTerms":["visible words likely to indicate a successful run"],\n  "failureTerms":["visible words likely to indicate a failed run"],\n  "restartTerms":["visible button words likely to restart/continue"],\n  "desktopActions":[...],\n  "phoneActions":[...]\n}\n\nAllowed desktop actions only:\n{"type":"keyTap","key":"ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Space|KeyW|KeyA|KeyS|KeyD|KeyE|KeyF|ShiftLeft|Enter"}\n{"type":"keyHold","key":"...same keys...","durationMs":80-1400}\n{"type":"click","x":0-1,"y":0-1}\n{"type":"drag","x1":0-1,"y1":0-1,"x2":0-1,"y2":0-1,"durationMs":80-1400}\n{"type":"wait","durationMs":80-1400}\n\nAllowed phone actions only: tap, drag, wait with the same normalized coordinates.\n\nRules:\n- Give at most 12 actions per device.\n- Prefer the game's real documented/implemented controls over guessing.\n- The Factory separately presses obvious Start/Play buttons before these actions, so do not include menu-start clicks unless gameplay itself needs a positional tap.\n- Create a sequence that has a reasonable chance to demonstrate movement, primary action, collection/cleaning/shooting/interaction, or other core mechanic.\n- Do not claim confidence=high unless the source clearly reveals the controls and objective.\n- Do not include shell commands, JavaScript, selectors, arbitrary text entry, or anything outside the allowed action vocabulary.`;

  const args = [
    'exec', '--ephemeral', '--sandbox', 'read-only',
    '-c', 'approval_policy=never',
    '-m', 'gpt-5.6-terra',
    '-c', 'model_reasoning_effort=medium',
    '-c', 'model_verbosity=low',
    '--color', 'never', '-C', gameDir, '-'
  ];
  try {
    const result = await runProcess(CODEX_COMMAND, args, { cwd: gameDir, input: prompt });
    if (result.code !== 0) throw new Error((result.stderr || result.stdout || `Codex exited ${result.code}`).slice(-2000));
    return { plan: sanitizePlan(extractJson(result.stdout)), plannerError: null };
  } catch (error) {
    return { plan: fallbackPlan(), plannerError: error.message };
  }
}

async function findButton(page, pattern, extraTerms = []) {
  const controls = page.locator('button, [role="button"], input[type="button"], input[type="submit"]');
  const count = Math.min(await controls.count(), 60);
  const terms = extraTerms.map(term => term.toLowerCase());
  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i);
    const text = ((await control.innerText().catch(() => '')) || (await control.getAttribute('value')) || '').trim();
    const lower = text.toLowerCase();
    if (pattern.test(text) || terms.some(term => term && (lower === term || lower.includes(term)))) return { control, text };
  }
  return null;
}

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function bodyText(page) {
  return page.evaluate(() => (document.body?.innerText || '').toLowerCase().slice(0, 30000)).catch(() => '');
}

function terminalFromText(text, plan) {
  const success = plan.successTerms.find(term => term && text.includes(term));
  if (success) return { type: 'success', term: success };
  const failure = plan.failureTerms.find(term => term && text.includes(term));
  if (failure) return { type: 'failure', term: failure };
  return null;
}

async function performAction(page, action, width, height, mobile) {
  if (action.type === 'wait') {
    await page.waitForTimeout(action.durationMs);
    return;
  }
  if (!mobile && action.type === 'keyTap') {
    await page.keyboard.press(action.key).catch(() => {});
    await page.waitForTimeout(180);
    return;
  }
  if (!mobile && action.type === 'keyHold') {
    await page.keyboard.down(action.key).catch(() => {});
    await page.waitForTimeout(action.durationMs);
    await page.keyboard.up(action.key).catch(() => {});
    return;
  }
  if (!mobile && action.type === 'click') {
    await page.mouse.click(Math.round(width * action.x), Math.round(height * action.y)).catch(() => {});
    await page.waitForTimeout(220);
    return;
  }
  if (mobile && action.type === 'tap') {
    await page.touchscreen.tap(Math.round(width * action.x), Math.round(height * action.y)).catch(() => {});
    await page.waitForTimeout(220);
    return;
  }
  if (action.type === 'drag') {
    const x1 = Math.round(width * action.x1), y1 = Math.round(height * action.y1);
    const x2 = Math.round(width * action.x2), y2 = Math.round(height * action.y2);
    if (mobile) {
      await page.evaluate(({ x1, y1, x2, y2, durationMs }) => new Promise(resolve => {
        const target = document.elementFromPoint(x1, y1) || document.body;
        const pointerId = 33;
        target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId, pointerType: 'touch', clientX: x1, clientY: y1, buttons: 1 }));
        const steps = 8;
        let step = 0;
        const interval = setInterval(() => {
          step += 1;
          const t = step / steps;
          const x = x1 + (x2 - x1) * t;
          const y = y1 + (y2 - y1) * t;
          target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId, pointerType: 'touch', clientX: x, clientY: y, buttons: 1 }));
          if (step >= steps) {
            clearInterval(interval);
            target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId, pointerType: 'touch', clientX: x2, clientY: y2, buttons: 0 }));
            resolve();
          }
        }, Math.max(12, durationMs / steps));
      }), { x1, y1, x2, y2, durationMs: action.durationMs }).catch(() => {});
    } else {
      await page.mouse.move(x1, y1).catch(() => {});
      await page.mouse.down().catch(() => {});
      await page.mouse.move(x2, y2, { steps: 8 }).catch(() => {});
      await page.mouse.up().catch(() => {});
    }
    await page.waitForTimeout(220);
  }
}

async function runSession(browser, { url, plan, device, runNumber, artifactDir }) {
  const mobile = device === 'phone';
  const width = mobile ? 390 : 1440;
  const height = mobile ? 844 : 900;
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  const result = {
    device,
    runNumber,
    loaded: false,
    startControl: null,
    actionCount: 0,
    activeActionCount: 0,
    visualChanges: 0,
    terminal: null,
    restartAvailable: null,
    restartControl: null,
    responsiveAfterInputs: false,
    errors: [],
    screenshot: null
  };

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(700);
    result.loaded = true;
    const start = await findButton(page, START_PATTERN);
    if (start) {
      result.startControl = start.text;
      await start.control.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(650);
    }

    let previousHash = digest(await page.screenshot({ fullPage: false }));
    const actions = mobile ? plan.phoneActions : plan.desktopActions;
    for (const action of actions) {
      await performAction(page, action, width, height, mobile);
      result.actionCount += 1;
      if (action.type !== 'wait') result.activeActionCount += 1;
      const current = await page.screenshot({ fullPage: false });
      const hash = digest(current);
      if (hash !== previousHash) result.visualChanges += 1;
      previousHash = hash;
      const terminal = terminalFromText(await bodyText(page), plan);
      if (terminal) {
        result.terminal = terminal;
        break;
      }
    }

    if (result.terminal) {
      const restart = await findButton(page, RESTART_PATTERN, plan.restartTerms);
      result.restartAvailable = Boolean(restart);
      if (restart) result.restartControl = restart.text;
    }
    result.responsiveAfterInputs = await page.evaluate(() => Boolean(document.body && document.documentElement && document.readyState !== 'loading')).catch(() => false);
    if (runNumber === 1) {
      const file = `playtest-${device}.png`;
      await page.screenshot({ path: path.join(artifactDir, file), fullPage: false }).catch(() => {});
      result.screenshot = file;
    }
  } catch (error) {
    errors.push(error.message);
  } finally {
    result.errors = [...new Set(errors)].slice(0, 10);
    await context.close();
  }
  return result;
}

function scorePlaytest(plan, plannerError, sessions) {
  let score = 100;
  const notes = [];
  if (plannerError) {
    score -= 5;
    notes.push('AI control planner fell back to a generic control sweep, so gameplay conclusions have lower confidence.');
  }
  const failedLoads = sessions.filter(run => !run.loaded).length;
  if (failedLoads) {
    score -= Math.min(50, failedLoads * 25);
    notes.push(`${failedLoads} playtest session(s) failed to load.`);
  }
  const errorRuns = sessions.filter(run => run.errors.length).length;
  if (errorRuns) {
    score -= Math.min(24, errorRuns * 8);
    notes.push(`${errorRuns} playtest session(s) produced browser/page errors.`);
  }

  const activeRuns = sessions.filter(run => run.loaded && run.activeActionCount > 0);
  const weakResponse = activeRuns.filter(run => run.visualChanges / Math.max(1, run.activeActionCount) < .2);
  if (weakResponse.length) {
    score -= Math.min(30, weakResponse.length * 10);
    notes.push(`${weakResponse.length} session(s) showed little or no visible response to the inferred controls.`);
  }

  const unresponsive = sessions.filter(run => run.loaded && !run.responsiveAfterInputs).length;
  if (unresponsive) {
    score -= Math.min(30, unresponsive * 15);
    notes.push(`${unresponsive} session(s) stopped responding after play inputs.`);
  }

  const terminalRuns = sessions.filter(run => run.terminal);
  if (terminalRuns.length) {
    const missingRestart = terminalRuns.filter(run => run.restartAvailable === false).length;
    if (missingRestart) {
      score -= Math.min(16, missingRestart * 8);
      notes.push(`${missingRestart} terminal session(s) did not expose an obvious retry/continue control.`);
    }
  } else if (plan.confidence === 'high') {
    score -= 8;
    notes.push('The AI understood the controls with high confidence but did not reach a visible success/failure state during the bounded runs.');
  } else {
    notes.push('No terminal win/fail state was reached during the short bounded play sessions; this is informational at the current plan confidence.');
  }

  const desktop = sessions.filter(run => run.device === 'desktop');
  const phone = sessions.filter(run => run.device === 'phone');
  const desktopResponse = desktop.reduce((sum, run) => sum + run.visualChanges, 0);
  const phoneResponse = phone.reduce((sum, run) => sum + run.visualChanges, 0);
  if (desktopResponse === 0 && phoneResponse > 0) {
    score -= 12;
    notes.push('Phone controls produced visible gameplay response, but desktop controls did not.');
  }
  if (phoneResponse === 0 && desktopResponse > 0) {
    score -= 12;
    notes.push('Desktop controls produced visible gameplay response, but phone controls did not.');
  }

  if (!notes.length) notes.push('AI-guided desktop and phone sessions responded to the inferred controls without machine-detected blockers.');
  return { score: Math.max(0, Math.min(100, score)), notes };
}

export async function runAiPlaytest({ gameDir, url, artifactDir }) {
  const { plan, plannerError } = await planGame(gameDir);
  const browser = await launchBrowser();
  const sessions = [];
  try {
    for (const device of ['desktop', 'phone']) {
      for (let runNumber = 1; runNumber <= 2; runNumber += 1) {
        sessions.push(await runSession(browser, { url, plan, device, runNumber, artifactDir }));
      }
    }
  } finally {
    await browser.close();
  }
  const scored = scorePlaytest(plan, plannerError, sessions);
  return {
    checkedAt: new Date().toISOString(),
    score: scored.score,
    notes: scored.notes,
    plannerError,
    plan,
    sessions,
    screenshots: { desktop: 'playtest-desktop.png', phone: 'playtest-phone.png' }
  };
}
