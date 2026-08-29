import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const START_PATTERN = /^(?:play(?:\s+now)?|start(?:\s+(?:game|shift|job|run|level|mission|round|race|day))?|begin(?:\s+(?:game|shift|job|run|level|mission|round))?|go|launch|continue|new game)$/i;
const RESTART_PATTERN = /^(?:retry|restart|replay|again|play again|try again|next run|next shift|next job|continue)$/i;
const UPGRADE_PATTERN = /\b(?:upgrade|improve|buy|shop|unlock|equip|boost|level up|power up)\b/i;
const SOURCE_EXTENSIONS = new Set(['.html','.js','.mjs','.cjs','.ts','.tsx','.jsx','.json']);
const SKIP_DIRS = new Set(['node_modules','.git','.cache','dist','build','vendor','starter']);

async function launchBrowser() {
  if (process.platform === 'win32') {
    try { return await chromium.launch({ channel:'msedge', headless:true }); } catch {}
  }
  return chromium.launch({ headless:true });
}

async function walkSource(root, relative = '') {
  const dir = path.join(root, relative);
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes:true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...await walkSource(root, path.join(relative, entry.name)));
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
      source += `\n/* ${relative} */\n${(await fsp.readFile(path.join(gameDir, relative), 'utf8')).slice(0,1500000)}`;
      if (source.length > 6000000) break;
    } catch {}
  }
  const upgrades = /\b(?:upgrade|shop|buy|unlock|equip|boost|power.?up|level.?up)\b/i.test(source);
  const gameplayStatMutation = /\b(?:speed|damage|power|range|capacity|cooldown|radius|health|lives?|multiplier|magnet|duration|accel(?:eration)?|turn(?:Rate|Speed)?|reload|income|reward|scoreValue|carry|vacuum|reach)\w*\s*(?:\+=|-=|\*=|\/=|=)\s*[^;\n]+/i.test(source);
  const upgradeNearGameplayStat = /\b(?:upgrade|buy|unlock|equip|boost|power.?up|level.?up)\b[\s\S]{0,1800}\b(?:speed|damage|power|range|capacity|cooldown|radius|health|lives?|multiplier|magnet|duration|accel(?:eration)?|turn|reload|income|reward|carry|vacuum|reach)\b|\b(?:speed|damage|power|range|capacity|cooldown|radius|health|lives?|multiplier|magnet|duration|accel(?:eration)?|turn|reload|income|reward|carry|vacuum|reach)\b[\s\S]{0,1800}\b(?:upgrade|buy|unlock|equip|boost|power.?up|level.?up)\b/i.test(source);
  return {
    persistence: /localStorage|sessionStorage|GutpopperCore\.(?:save|load)|indexedDB/i.test(source),
    upgrades,
    meaningfulUpgradeEffect: upgrades && gameplayStatMutation && upgradeNearGameplayStat,
    scoreChase: /\b(?:high.?score|best.?score|best.?run|personal.?best|score|combo|streak)\b/i.test(source),
    missions: /\b(?:mission|objective|quest|challenge|daily|goal)\b/i.test(source),
    progression: /\b(?:level|stage|unlock|progress|xp|experience|currency|coins?|cash|stars?)\b/i.test(source),
    variation: /Math\.random|\brandom\b|procedural|shuffle|spawn.*random|difficulty.*(?:increase|scale)|wave|endless|runCount|attemptCount/i.test(source)
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
    return { local:read(localStorage), session:read(sessionStorage) };
  }).catch(() => ({ local:{}, session:{} }));
}

function stableJson(value) {
  const sort = obj => {
    if (Array.isArray(obj)) return obj.map(sort);
    if (!obj || typeof obj !== 'object') return obj;
    return Object.fromEntries(Object.keys(obj).sort().map(key => [key, sort(obj[key])]));
  };
  return JSON.stringify(sort(value));
}

function storageChanged(a, b) { return stableJson(a) !== stableJson(b); }
function digest(buffer) { return buffer ? createHash('sha256').update(buffer).digest('hex') : null; }

async function bodyText(page) {
  return page.evaluate(() => (document.body?.innerText || '').toLowerCase().slice(0,30000)).catch(() => '');
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
    await page.evaluate(({x1,y1,x2,y2}) => new Promise(resolve => {
      const target = document.elementFromPoint(x1,y1) || document.body;
      const pointerId = 77;
      target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId,pointerType:'touch',clientX:x1,clientY:y1,buttons:1}));
      let step = 0;
      const timer = setInterval(() => {
        step += 1;
        const t = step / 8;
        const x = x1 + (x2-x1)*t;
        const y = y1 + (y2-y1)*t;
        target.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId,pointerType:'touch',clientX:x,clientY:y,buttons:1}));
        if (step >= 8) {
          clearInterval(timer);
          target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId,pointerType:'touch',clientX:x2,clientY:y2,buttons:0}));
          resolve();
        }
      },55);
    }), {x1,y1,x2,y2}).catch(() => {});
    await page.waitForTimeout(180);
  }
}

function terminalFromText(text, plan) {
  const success = (plan?.successTerms || []).find(term => term && text.includes(String(term).toLowerCase()));
  if (success) return { type:'success', term:success };
  const failure = (plan?.failureTerms || []).find(term => term && text.includes(String(term).toLowerCase()));
  if (failure) return { type:'failure', term:failure };
  return null;
}

function scoreRetention({ source, storageMutated, persistedAfterReload, restartAvailable, terminal, secondRunStarted, secondRunMeaningfullyDifferent, upgradeVisible, upgradeClicked, upgradeStateChanged, meaningfulUpgradeVerified, errors }) {
  let score = 0;
  const notes = [];

  if (restartAvailable) score += 18;
  else if (secondRunStarted) score += 13;
  else notes.push('No obvious one-tap replay/restart route was verified.');

  if (source.persistence && persistedAfterReload) score += 15;
  else if (source.persistence && storageMutated) { score += 10; notes.push('Save state changed, but persistence after reload was not clearly verified.'); }
  else if (source.persistence) { score += 5; notes.push('Persistence code exists, but this short run did not demonstrate a saved progression change.'); }

  const replaySystems = [source.upgrades, source.scoreChase, source.missions, source.progression, source.variation].filter(Boolean).length;
  if (replaySystems >= 4) score += 25;
  else if (replaySystems === 3) score += 22;
  else if (replaySystems === 2) score += 18;
  else if (replaySystems === 1) { score += 10; notes.push('Only one clear replay/retention system was detected.'); }
  else notes.push('No strong upgrades, score chase, missions, progression, or run variation were detected.');

  if (source.upgrades) {
    if (meaningfulUpgradeVerified) score += 15;
    else if (upgradeClicked && upgradeStateChanged) {
      score += 8;
      notes.push('An upgrade changed stored/UI state, but a concrete gameplay-stat effect was not confidently verified from source.');
    } else if (upgradeVisible) {
      score += 4;
      notes.push('Upgrade/shop UI exists, but the bounded probe did not verify a meaningful gameplay effect.');
    } else {
      notes.push('Upgrade code was detected, but no usable upgrade control was verified in the bounded probe.');
    }
  }

  if (secondRunStarted && secondRunMeaningfullyDifferent) score += 15;
  else if (secondRunStarted) {
    score += 7;
    notes.push('A second run can start, but meaningful run-to-run differentiation was not strongly verified.');
  }

  if (terminal) score += 5;
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
  const context = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:1 });
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
  let upgradeStateChanged = false;
  let meaningfulUpgradeVerified = false;
  let secondRunStarted = false;
  let secondRunMeaningfullyDifferent = false;
  let initialStorage = { local:{}, session:{} };
  let afterRunStorage = { local:{}, session:{} };
  let afterUpgradeStorage = { local:{}, session:{} };
  let afterReloadStorage = { local:{}, session:{} };
  let firstRunStartDigest = null;
  let secondRunStartDigest = null;

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
    firstRunStartDigest = digest(await page.screenshot({ fullPage:false }).catch(() => null));

    const actions = Array.isArray(playtestPlan?.phoneActions) ? playtestPlan.phoneActions.slice(0,12) : [
      {type:'tap',x:.5,y:.72},
      {type:'drag',x1:.28,y1:.72,x2:.72,y2:.72},
      {type:'tap',x:.82,y:.78},
      {type:'drag',x1:.72,y1:.72,x2:.28,y2:.72},
      {type:'tap',x:.5,y:.48}
    ];

    for (const action of actions) {
      await performAction(page, action, 390, 844);
      terminal = terminalFromText(await bodyText(page), playtestPlan);
      if (terminal) break;
    }

    afterRunStorage = await storageSnapshot(page);
    afterUpgradeStorage = afterRunStorage;
    const upgrade = await findButton(page, UPGRADE_PATTERN);
    if (upgrade) {
      upgradeVisible = true;
      const disabled = await upgrade.control.isDisabled().catch(() => false);
      if (!disabled) {
        const beforeUpgradeStorage = afterRunStorage;
        const beforeUpgradeText = await bodyText(page);
        await upgrade.control.click({ timeout:1200 }).catch(() => {});
        await page.waitForTimeout(350);
        upgradeClicked = true;
        afterUpgradeStorage = await storageSnapshot(page);
        const afterUpgradeText = await bodyText(page);
        upgradeStateChanged = storageChanged(beforeUpgradeStorage, afterUpgradeStorage) || beforeUpgradeText !== afterUpgradeText;
        meaningfulUpgradeVerified = Boolean(source.meaningfulUpgradeEffect && upgradeStateChanged);
      }
    }

    const retry = await findButton(page, RESTART_PATTERN);
    if (retry) {
      restartAvailable = true;
      restartControl = retry.text;
      await retry.control.click({ timeout:1200 }).catch(() => {});
      await page.waitForTimeout(450);
      secondRunStarted = true;
      secondRunStartDigest = digest(await page.screenshot({ fullPage:false }).catch(() => null));
    }

    await page.reload({ waitUntil:'domcontentloaded', timeout:15000 });
    await page.waitForTimeout(500);
    afterReloadStorage = await storageSnapshot(page);

    if (!secondRunStarted) {
      const secondStart = await findButton(page, START_PATTERN);
      if (secondStart) {
        await secondStart.control.click({ timeout:1200 }).catch(() => {});
        await page.waitForTimeout(400);
        secondRunStarted = true;
        secondRunStartDigest = digest(await page.screenshot({ fullPage:false }).catch(() => null));
      }
    }
  } catch (error) {
    errors.push(error.message);
  } finally {
    await context.close();
    await browser.close();
  }

  const storageMutated = storageChanged(initialStorage, afterUpgradeStorage);
  const persistedAfterReload = storageChanged(initialStorage, afterReloadStorage) && stableJson(afterUpgradeStorage.local) === stableJson(afterReloadStorage.local);
  const visualRunDifference = Boolean(firstRunStartDigest && secondRunStartDigest && firstRunStartDigest !== secondRunStartDigest);
  secondRunMeaningfullyDifferent = Boolean(secondRunStarted && (source.variation || source.progression || meaningfulUpgradeVerified || visualRunDifference));

  const scored = scoreRetention({
    source,
    storageMutated,
    persistedAfterReload,
    restartAvailable,
    terminal,
    secondRunStarted,
    secondRunMeaningfullyDifferent,
    upgradeVisible,
    upgradeClicked,
    upgradeStateChanged,
    meaningfulUpgradeVerified,
    errors
  });

  return {
    score:scored.score,
    passed:scored.score >= 65,
    minimumPrototypeScore:65,
    notes:scored.notes,
    source,
    startControl,
    terminal,
    restartAvailable,
    restartControl,
    upgradeVisible,
    upgradeClicked,
    upgradeStateChanged,
    meaningfulUpgradeVerified,
    secondRunStarted,
    secondRunMeaningfullyDifferent,
    secondRunVisualDifference:visualRunDifference,
    storageMutated,
    persistedAfterReload,
    storageKeys:Object.keys(afterReloadStorage.local || {}).slice(0,20),
    errors:[...new Set(errors)].slice(0,10)
  };
}
