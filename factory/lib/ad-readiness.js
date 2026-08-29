import fsp from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

export const AD_READINESS_MINIMUM = 70;

const START_PATTERN = /^(?:play(?:\s+now)?|start(?:\s+(?:game|shift|job|run|level|mission|round|race|day))?|begin(?:\s+(?:game|shift|job|run|level|mission|round))?|go|launch|continue|new game)$/i;
const CONTINUE_PATTERN = /^(?:retry|restart|replay|again|play again|try again|next|next level|next run|next shift|next job|continue|resume)$/i;
const REWARDED_PATTERN = /(?:watch\s+(?:an?\s+)?ad|ad\s+for|rewarded|watch\s+video|revive.*ad|ad.*revive|double.*reward|reward.*x2|x2.*reward|bonus.*ad|ad.*bonus|extra\s+life.*ad)/i;
const SOURCE_EXTENSIONS = new Set(['.html','.js','.mjs','.cjs','.ts','.tsx','.jsx','.json']);
const SKIP_DIRS = new Set(['node_modules','.git','.cache','dist','build','vendor']);

async function launchBrowser() {
  if (process.platform === 'win32') {
    try { return await chromium.launch({ channel:'msedge', headless:true }); } catch {}
  }
  return chromium.launch({ headless:true });
}

async function walkSource(root, relative = '') {
  let entries = [];
  try { entries = await fsp.readdir(path.join(root, relative), { withFileTypes:true }); } catch { return []; }
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

async function readSource(gameDir) {
  const files = await walkSource(gameDir);
  let source = '';
  for (const relative of files) {
    try {
      source += `\n/* ${relative} */\n${(await fsp.readFile(path.join(gameDir, relative), 'utf8')).slice(0, 1500000)}`;
      if (source.length > 7000000) break;
    } catch {}
  }
  let metadata = null;
  try { metadata = JSON.parse(await fsp.readFile(path.join(gameDir, 'factory-game.json'), 'utf8')); } catch {}
  return { source, metadata };
}

function sourceAudit(source, metadata) {
  const hasSdk = /\bPokiSDK\b|GutpopperCore\.poki|game-cdn\.poki\.com\/scripts\/v2\/poki-sdk\.js/i.test(source);
  const commercial = /(?:PokiSDK\.commercialBreak|GutpopperCore\.poki\.commercialBreak)\s*\(/.test(source);
  const rewarded = /(?:PokiSDK\.rewardedBreak|GutpopperCore\.poki\.rewardedBreak)\s*\(/.test(source);
  const explicitRewardChoice = REWARDED_PATTERN.test(source);
  const naturalCommercialContext = /(?:retry|restart|replay|next\s+level|next\s+run|continue|resume|game\s+over|level\s+complete|mission\s+complete|round\s+complete)[\s\S]{0,900}(?:commercialBreak)|(?:commercialBreak)[\s\S]{0,900}(?:retry|restart|replay|next\s+level|next\s+run|continue|resume)/i.test(source);
  const rewardSuccessGuard = /if\s*\(\s*(?:await\s+)?(?:PokiSDK\.rewardedBreak|GutpopperCore\.poki\.rewardedBreak)\s*\(/i.test(source)
    || /(?:rewardedBreak)[\s\S]{0,500}(?:if\s*\(\s*(?:success|rewarded|shouldReward|granted)|=>\s*\{?[\s\S]{0,250}if\s*\()/i.test(source);
  const adPauseHooks = /setAdHooks|adActive|(?:disable|pause)[A-Za-z]*(?:Input|Controls)|(?:mute|pause)[A-Za-z]*(?:Audio|Sound|Music)|input\.enabled\s*=\s*false|sound\.mute\s*=\s*true/i.test(source);
  const gameplayEvents = /(?:PokiSDK\.gameplayStop|GutpopperCore\.poki\.gameplayStop)\s*\(/.test(source)
    && /(?:PokiSDK\.gameplayStart|GutpopperCore\.poki\.gameplayStart)\s*\(/.test(source);
  const otherAds = /adsbygoogle|googlesyndication|adinplay|gamemonetize|gamepix|crazygames-sdk/i.test(source);
  const target = metadata?.target || (hasSdk ? 'Poki' : 'Unknown');
  return { target, hasSdk, commercial, rewarded, explicitRewardChoice, naturalCommercialContext, rewardSuccessGuard, adPauseHooks, gameplayEvents, otherAds };
}

async function findButton(page, pattern) {
  const controls = page.locator('button, [role="button"], input[type="button"], input[type="submit"]');
  const count = Math.min(await controls.count(), 80);
  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i);
    const text = ((await control.innerText().catch(() => '')) || (await control.getAttribute('value')) || '').trim();
    if (pattern.test(text)) return { control, text };
  }
  return null;
}

async function performPhoneAction(page, action, width = 390, height = 844) {
  if (!action || typeof action !== 'object') return;
  if (action.type === 'wait') {
    await page.waitForTimeout(Math.max(80, Math.min(1200, Number(action.durationMs) || 250)));
  } else if (action.type === 'tap') {
    await page.touchscreen.tap(Math.round(width * Number(action.x || .5)), Math.round(height * Number(action.y || .6))).catch(() => {});
    await page.waitForTimeout(180);
  } else if (action.type === 'drag') {
    const x1 = Math.round(width * Number(action.x1 || .3));
    const y1 = Math.round(height * Number(action.y1 || .7));
    const x2 = Math.round(width * Number(action.x2 || .7));
    const y2 = Math.round(height * Number(action.y2 || .7));
    await page.evaluate(({x1,y1,x2,y2}) => new Promise(resolve => {
      const target = document.elementFromPoint(x1,y1) || document.body;
      const pointerId = 91;
      target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId,pointerType:'touch',clientX:x1,clientY:y1,buttons:1}));
      let step = 0;
      const timer = setInterval(() => {
        step += 1;
        const t = step / 7;
        const x = x1 + (x2-x1)*t;
        const y = y1 + (y2-y1)*t;
        target.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId,pointerType:'touch',clientX:x,clientY:y,buttons:1}));
        if (step >= 7) {
          clearInterval(timer);
          target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId,pointerType:'touch',clientX:x2,clientY:y2,buttons:0}));
          resolve();
        }
      }, 45);
    }), {x1,y1,x2,y2}).catch(() => {});
    await page.waitForTimeout(180);
  }
}

async function runtimeProbe(url, playtestPlan) {
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:1 });
  const stub = `(()=>{const e=[];window.__POKI_AD_TEST__={events:e,rewardSuccess:false};const m=n=>e.push({name:n,t:Math.round(performance.now())});window.PokiSDK={init:()=>Promise.resolve(true),gameLoadingFinished:()=>m('gameLoadingFinished'),gameplayStart:()=>m('gameplayStart'),gameplayStop:()=>m('gameplayStop'),commercialBreak:()=>{m('commercialBreak');return new Promise(r=>setTimeout(r,180))},rewardedBreak:()=>{m('rewardedBreak');return new Promise(r=>setTimeout(()=>r(Boolean(window.__POKI_AD_TEST__.rewardSuccess)),180))}}})();`;
  await context.route(/game-cdn\.poki\.com\/scripts\/v2\/poki-sdk\.js|poki-sdk\.js/i, route => route.fulfill({status:200,contentType:'text/javascript',body:stub}));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  let beforeInput = [];
  let afterRun = [];
  let commercialRuntime = false;
  let rewardedRuntime = false;
  let rewardedButton = null;
  let continueButton = null;
  try {
    await page.goto(url, { waitUntil:'domcontentloaded', timeout:20000 });
    await page.waitForTimeout(700);
    beforeInput = await page.evaluate(() => window.__POKI_AD_TEST__?.events || []).catch(() => []);

    const start = await findButton(page, START_PATTERN);
    if (start) {
      await start.control.click({timeout:1200}).catch(() => {});
      await page.waitForTimeout(350);
    }

    const actions = Array.isArray(playtestPlan?.phoneActions) ? playtestPlan.phoneActions.slice(0,12) : [
      {type:'tap',x:.5,y:.72},{type:'drag',x1:.28,y1:.72,x2:.72,y2:.72},{type:'tap',x:.82,y:.78},{type:'tap',x:.5,y:.48}
    ];
    for (const action of actions) await performPhoneAction(page, action);

    const rewarded = await findButton(page, REWARDED_PATTERN);
    if (rewarded) {
      rewardedButton = rewarded.text;
      const before = (await page.evaluate(() => window.__POKI_AD_TEST__?.events?.length || 0).catch(() => 0));
      await rewarded.control.click({timeout:1200}).catch(() => {});
      await page.waitForTimeout(300);
      const names = (await page.evaluate(() => (window.__POKI_AD_TEST__?.events || []).map(x=>x.name)).catch(() => []));
      rewardedRuntime = names.slice(before).includes('rewardedBreak');
    }

    const cont = await findButton(page, CONTINUE_PATTERN);
    if (cont) {
      continueButton = cont.text;
      const before = (await page.evaluate(() => window.__POKI_AD_TEST__?.events?.length || 0).catch(() => 0));
      await cont.control.click({timeout:1200}).catch(() => {});
      await page.waitForTimeout(320);
      const names = (await page.evaluate(() => (window.__POKI_AD_TEST__?.events || []).map(x=>x.name)).catch(() => []));
      commercialRuntime = names.slice(before).includes('commercialBreak');
    }
    afterRun = await page.evaluate(() => window.__POKI_AD_TEST__?.events || []).catch(() => []);
  } catch (error) {
    errors.push(error.message);
  } finally {
    await context.close();
    await browser.close();
  }
  const beforeNames = beforeInput.map(x => x.name);
  return {
    noAdBeforeInput: !beforeNames.includes('commercialBreak') && !beforeNames.includes('rewardedBreak'),
    commercialRuntime,
    rewardedRuntime,
    rewardedButton,
    continueButton,
    events: afterRun,
    errors:[...new Set(errors)].slice(0,8)
  };
}

function scoreAudit(source, runtime) {
  let score = 0;
  const notes = [];
  if (source.hasSdk) score += 8; else notes.push('Poki SDK integration was not detected.');
  if (source.commercial) score += 15; else notes.push('No commercialBreak() opportunity is implemented.');
  if (source.naturalCommercialContext || runtime.commercialRuntime) score += 15; else notes.push('A commercial break at a natural continue/replay moment was not verified.');
  if (source.rewarded) score += 15; else notes.push('No rewardedBreak() opportunity is implemented.');
  if (source.explicitRewardChoice || runtime.rewardedButton) score += 15; else notes.push('No clear opt-in rewarded-ad choice/disclosure was detected.');
  if (source.rewardSuccessGuard) score += 12; else notes.push('Reward delivery is not clearly guarded by rewardedBreak() success.');
  if (runtime.noAdBeforeInput) score += 10; else notes.push('An ad call fired before the player expressed gameplay/ad intent.');
  if (source.adPauseHooks) score += 5; else notes.push('Input/audio pause-resume handling around ads was not clearly detected.');
  if (source.gameplayEvents) score += 3;
  if (!source.otherAds) score += 2; else notes.push('Another advertising SDK was detected alongside Poki.');
  if (runtime.rewardedRuntime) notes.push(`Rewarded ad runtime hook verified via ${runtime.rewardedButton || 'an explicit control'}.`);
  if (runtime.commercialRuntime) notes.push(`Commercial break runtime hook verified via ${runtime.continueButton || 'a continue/replay control'}.`);
  if (runtime.errors.length) notes.push(`Ad readiness runtime probe saw ${runtime.errors.length} browser error(s).`);
  score = Math.max(0, Math.min(100, score));
  if (score >= 85) notes.unshift('Ad opportunities are well prepared for a Poki prototype.');
  else if (score >= AD_READINESS_MINIMUM) notes.unshift('Ad readiness meets the first-prototype target, with room to improve integration quality.');
  else notes.unshift('Ad readiness is below the Factory first-prototype target.');
  return {score,notes};
}

export async function runAdReadiness({ gameDir, url, playtestPlan = null }) {
  const {source,metadata} = await readSource(gameDir);
  const audited = sourceAudit(source, metadata);
  if (audited.target === 'General Web') {
    return { applicable:false, passed:true, score:null, minimumPrototypeScore:AD_READINESS_MINIMUM, source:audited, runtime:null, notes:['General Web target: Poki ad readiness is not required.'] };
  }
  const runtime = await runtimeProbe(url, playtestPlan);
  const scored = scoreAudit(audited, runtime);
  return {
    applicable:true,
    passed:scored.score >= AD_READINESS_MINIMUM,
    score:scored.score,
    minimumPrototypeScore:AD_READINESS_MINIMUM,
    source:audited,
    runtime,
    notes:scored.notes
  };
}
