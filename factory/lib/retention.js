import fsp from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const START_PATTERN = /^(?:play(?:\s+now)?|start(?:\s+(?:game|shift|job|run|level|mission|round|race|day))?|begin(?:\s+(?:game|shift|job|run|level|mission|round))?|go|launch|continue|new game)$/i;
const RESTART_PATTERN = /^(?:retry|restart|replay|again|play again|try again|next run|next shift|next job|continue)$/i;
const UPGRADE_PATTERN = /\b(?:upgrade|improve|buy|shop|unlock|equip|boost|level up|power up)\b/i;
const SOURCE_EXTENSIONS = new Set(['.html','.js','.mjs','.cjs','.ts','.tsx','.jsx','.json']);
const SKIP_DIRS = new Set(['node_modules','.git','.cache','dist','build','vendor']);

async function launchBrowser() {
  if (process.platform === 'win32') {
    try { return await chromium.launch({ channel: 'msedge', headless: true }); } catch {}
  }
  return chromium.launch({ headless: true });
}

async function walkSource(root, relative = '') {
  const dir = path.join(root, relative);
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...await walkSource(root, path.join(relative, entry.name)));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(path.join(relative, entry.name));
    }
  }
  return files;
}

async function sourceSignals(gameDir) {
  const files = await walkSource(gameDir);
  let source = '';
  for (const relative of files) {
    try {
      source += `\n/* ${relative} */\n${(await fsp.readFile(path.join(gameDir, relative), 'utf8')).slice(0, 1500000)}`;
      if (source.length > 6000000) break;
    } catch {}
  }
  return {
    persistence: /localStorage|sessionStorage|GutpopperCore\.(?:save|load)|indexedDB/i.test(source),
    upgrades: /\b(?:upgrade|shop|buy|unlock|equip|boost|power.?up|level.?up)\b/i.test(source),
    scoreChase: /\b(?:high.?score|best.?score|best.?run|personal.?best|score|combo|streak)\b/i.test(source),
    missions: /\b(?:mission|objective|quest|challenge|daily|goal)\b/i.test(source),
    progression: /\b(?:level|stage|unlock|progress|xp|experience|currency|coins?|cash|stars?)\b/i.test(source),
    variation: /Math\.random|random|procedural|shuffle|spawn.*random|difficulty.*(?:increase|scale)|wave|endless/i.test(source)
  };
}

async function findButton(page, pattern) {
  const controls = page.locator('button, [role="button"], input[type="button"], input[type="submit"]');
  const count = Math.min(await controls.count(), 70);
  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i);
    const text = ((await control.innerText().catch(() => '')) || (await control.getAttribute('value')) || '').trim();
    if (pattern.test(text)) return { control, text };
  }
  return null;
}

async function storageSnapshot(page) {
  return page.evaluate(() => {
    const read = store => {
      const out = {};
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key != null) out[key] = store.getItem(key);
      }
      return out;
    };
    return { local: read(localStorage), session: read(sessionStorage) };
  }).catch(() => ({ local: {}, session: {} }));
}

function stableJson(value) {
  const sort = obj => {
    if (Array.isArray(obj)) return obj.map(sort);
    if (!obj || typeof obj !== 'object') return obj;
    return Object.fromEntries(Object.keys(obj).sort().map(key => [key, sort(obj[key])]));
  };
  return JSON.stringify(sort(value));
}

function storageChanged(a, b) {
  return stableJson(a) !== stableJson(b);
}

async function bodyText(page) {
  return page.evaluate(() => (document.body?.innerText || '').toLowerCase().slice(0, 30000)).catch(() => '');
}

async function performAction(page, action, width, height) {
  if (!action || typeof action !== 'object') return;
  if (action.type === 'wait') {
    await page.waitForTimeout(Math.max(80, Math.min(1400, Number(action.durationMs) || 300)));
    return;
  }
  if (action.type === 'tap') {
    await page.touchscreen.tap(Math.round(width * Number(action.x || .5)), Math.round(height * Number(action.y || .6))).catch(() => {});
    await page.waitForTimeout(180);
    return;
  }
  if (action.type === 'drag') {
    const x1 = Math.round(width * Number(action.x1 || .3));
    const y1 = Math.round(height * Number(action.y1 || .7));
    const x2 = Math.round(width * Number(action.x2 || .7));
    const y2 = Math.round(height * Number(action.y2 || .7));
    await page.evaluate(({ x1, y1, x2, y2 }) => new Promise(resolve => {
      const target = document.elementFromPoint(x1, y1) || document.body;
      const pointerId = 77;
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, pointerId, pointerType:'touch', clientX:x1, clientY:y1, buttons:1 }));
      let step = 0;
      const steps = 8;
      const timer = setInterval(() => {
        step += 1;
        const t = step / steps;
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        target.dispatchEvent(new PointerEvent('pointermove', { bubbles:true, pointerId, pointerType:'touch', clientX:x, clientY:y, buttons:1 }));
        if (step >= steps) {
          clearInterval(timer);
          target.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerId, pointerType:'touch', clientX:x2, clientY:y2, buttons:0 }));
          resolve();
        }
      }, 55);
    }), { x1, y1, x2, y2 }).catch(() => {});
    await page.waitForTimeout(180);
  }
}

function terminalFromText(text, plan) {
  const success = (plan?.successTerms || []).find(term => term && text.includes(String(term).toLowerCase()));
  if (success) return { type: 'success', term: success };
  const failure = (plan?.failureTerms || []).find(term => term && text.includes(String(term).toLowerCase()));
  if (failure) return { type: 'failure', term: failure };
  return null;
}

function scoreRetention({ source, storageMutated, persistedAfterReload, restartAvailable, upgradeVisible, upgradeClicked, terminal, secondRunStarted, errors }) {
  let score = 0;
  const notes = [];

  if (restartAvailable) score += 22;
  else if (secondRunStarted) score += 16;
  else notes.push('No obvious one-tap replay/restart route was verified.');

  if (source.persistence && persistedAfterReload) score += 20;
  else if (source.persistence && storageMutated) { score += 12; notes.push('Save state changed, but persistence after reload was not clearly verified.'); }
  else if (source.persistence) { score += 7; notes.push('Persistence code exists, but this short run did not demonstrate a saved progression change.'); }

  const replaySystems = [source.upgrades, source.scoreChase, source.missions, source.progression, source.variation].filter(Boolean).length;
  if (replaySystems >= 4) score += 28;
  else if (replaySystems === 3) score += 24;
  else if (replaySystems === 2) score += 18;
  else if (replaySystems === 1) { score += 11; notes.push('Only one clear replay/retention system was detected.'); }
  else notes.push('No strong upgrades, score chase, missions, progression, or run variation were detected.');

  if (upgradeVisible) score += 8;
  if (upgradeClicked) score += 5;
  if (terminal) score += 7;
  else notes.push('The bounded retention probe did not reach a visible success/failure state; this is not automatically a failure for longer games.');

  if (!errors.length) score += 10;
  else notes.push(`Retention probe saw ${errors.length} browser error(s).`);

  score = Math.max(0, Math.min(100, score));
  if (score >= 80) notes.unshift('Replay/progression structure looks strong for a first prototype.');
  else if (score >= 65) notes.unshift('Replay structure is acceptable, with room to strengthen the one-more-run hook.');
  else notes.unshift('Retention/replay structure is below the Factory first-prototype target.');
  return { score, notes };
}

export async function runRetentionAudit({ gameDir, url, playtestPlan = null }) {
  const source = await sourceSignals(gameDir);
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width:390, height:844 }, isMobile:true, hasTouch:true, deviceScaleFactor:1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  let startControl = null;
  let terminal = null;
  let restartAvailable = false;
  let restartControl = null;
  let upgradeVisible = false;
  let upgradeClicked = false;
  let secondRunStarted = false;
  let initialStorage = { local:{}, session:{} };
  let afterRunStorage = { local:{}, session:{} };
  let afterReloadStorage = { local:{}, session:{} };

  try {
    await page.goto(url, { waitUntil:'domcontentloaded', timeout:20000 });
    await page.waitForTimeout(600);
    initialStorage = await storageSnapshot(page);

    const start = await findButton(page, START_PATTERN);
    if (start) {
      startControl = start.text;
      await start.control.click({ timeout:1500 }).catch(() => {});
      await page.waitForTimeout(450);
    }

    const actions = Array.isArray(playtestPlan?.phoneActions) ? playtestPlan.phoneActions.slice(0, 12) : [
      { type:'tap', x:.5, y:.72 },
      { type:'drag', x1:.28, y1:.72, x2:.72, y2:.72 },
      { type:'tap', x:.82, y:.78 },
      { type:'drag', x1:.72, y1:.72, x2:.28, y2:.72 },
      { type:'tap', x:.5, y:.48 }
    ];

    for (const action of actions) {
      await performAction(page, action, 390, 844);
      terminal = terminalFromText(await bodyText(page), playtestPlan);
      if (terminal) break;
    }

    afterRunStorage = await storageSnapshot(page);
    const upgrade = await findButton(page, UPGRADE_PATTERN);
    if (upgrade) {
      upgradeVisible = true;
      const disabled = await upgrade.control.isDisabled().catch(() => false);
      if (!disabled) {
        await upgrade.control.click({ timeout:1200 }).catch(() => {});
        await page.waitForTimeout(300);
        upgradeClicked = true;
        afterRunStorage = await storageSnapshot(page);
      }
    }

    const retry = await findButton(page, RESTART_PATTERN);
    if (retry) {
      restartAvailable = true;
      restartControl = retry.text;
      await retry.control.click({ timeout:1200 }).catch(() => {});
      await page.waitForTimeout(350);
      secondRunStarted = true;
    }

    await page.reload({ waitUntil:'domcontentloaded', timeout:15000 });
    await page.waitForTimeout(500);
    afterReloadStorage = await storageSnapshot(page);

    if (!secondRunStarted) {
      const secondStart = await findButton(page, START_PATTERN);
      if (secondStart) {
        await secondStart.control.click({ timeout:1200 }).catch(() => {});
        await page.waitForTimeout(300);
        secondRunStarted = true;
      }
    }
  } catch (error) {
    errors.push(error.message);
  } finally {
    await context.close();
    await browser.close();
  }

  const storageMutated = storageChanged(initialStorage, afterRunStorage);
  const persistedAfterReload = storageChanged(initialStorage, afterReloadStorage) && stableJson(afterRunStorage.local) === stableJson(afterReloadStorage.local);
  const scored = scoreRetention({ source, storageMutated, persistedAfterReload, restartAvailable, upgradeVisible, upgradeClicked, terminal, secondRunStarted, errors });

  return {
    score: scored.score,
    passed: scored.score >= 65,
    minimumPrototypeScore: 65,
    notes: scored.notes,
    source,
    startControl,
    terminal,
    restartAvailable,
    restartControl,
    upgradeVisible,
    upgradeClicked,
    secondRunStarted,
    storageMutated,
    persistedAfterReload,
    storageKeys: Object.keys(afterReloadStorage.local || {}).slice(0, 20),
    errors: [...new Set(errors)].slice(0, 10)
  };
}
