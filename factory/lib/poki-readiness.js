import fsp from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const START_PATTERN = /^(?:play(?:\s+now)?|start(?:\s+(?:game|shift|job|run|level|mission|round|race|day))?|begin(?:\s+(?:game|shift|job|run|level|mission|round))?|go|launch|continue|new game)$/i;
const SOURCE_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const SOURCE_SKIP_DIRS = new Set(['node_modules', '.git', '.cache', 'dist', 'build', 'vendor']);

// These are Gutpopper Factory quality targets, not published Poki pass/fail numbers.
// Poki's public guidance is qualitative: keep builds lean, load fast, sustain stable
// frame rates, work on mobile/desktop, and remain playable with an ad blocker.
export const FACTORY_WEB_TARGETS = {
  coldReadyGreatMs: 1500,
  coldReadyWarnMs: 3500,
  initialBytesGreat: 3 * 1024 * 1024,
  initialBytesWarn: 8 * 1024 * 1024,
  initialBytesBad: 16 * 1024 * 1024,
  requestWarn: 60,
  requestBad: 100,
  fpsGreat: 55,
  fpsWarn: 45,
  longFrameWarnRatio: 0.08,
  estimatedConnectionMbps: 4
};

async function launchBrowser() {
  if (process.platform === 'win32') {
    try { return await chromium.launch({ channel: 'msedge', headless: true }); } catch {}
  }
  return chromium.launch({ headless: true });
}

async function findStartControl(page) {
  const controls = page.locator('button, [role="button"], input[type="button"], input[type="submit"]');
  const count = Math.min(await controls.count(), 50);
  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i);
    const text = ((await control.innerText().catch(() => '')) || (await control.getAttribute('value')) || '').trim();
    if (START_PATTERN.test(text)) return { control, text };
  }
  return null;
}

async function meaningfulUi(page) {
  return page.evaluate(() => {
    const body = document.body;
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 12 && rect.height > 12;
    };
    const candidates = [...document.querySelectorAll('canvas, svg, button, [role="button"], input, #game, #game-root, .game-surface')];
    return candidates.some(visible) || (body?.innerText || '').trim().length >= 24;
  }).catch(() => false);
}

async function frameSample(page, durationMs = 2400) {
  return page.evaluate(duration => new Promise(resolve => {
    const intervals = [];
    let started = performance.now();
    let last = started;
    function frame(now) {
      if (now !== last) intervals.push(now - last);
      last = now;
      if (now - started >= duration) {
        const useful = intervals.filter(value => value > 0 && value < 1000);
        const total = useful.reduce((sum, value) => sum + value, 0);
        const avgInterval = useful.length ? total / useful.length : 0;
        const fps = avgInterval ? 1000 / avgInterval : 0;
        const longFrames = useful.filter(value => value > 34).length;
        resolve({
          fps: Math.round(fps * 10) / 10,
          sampledFrames: useful.length,
          longFrames,
          longFrameRatio: useful.length ? Math.round((longFrames / useful.length) * 1000) / 1000 : 1
        });
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }), durationMs).catch(() => ({ fps: 0, sampledFrames: 0, longFrames: 0, longFrameRatio: 1 }));
}

async function coldLoadProbe(browser, { url }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const origin = new URL(url).origin;
  const resources = [];
  const errors = [];

  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => {
    try {
      const responseUrl = new URL(response.url());
      const headers = await response.allHeaders().catch(() => ({}));
      const length = Number(headers['content-length'] || 0) || 0;
      resources.push({
        url: responseUrl.href,
        pathname: responseUrl.pathname,
        sameOrigin: responseUrl.origin === origin,
        status: response.status(),
        type: response.request().resourceType(),
        bytes: length
      });
    } catch {}
  });

  const start = Date.now();
  let domMs = null;
  let readyMs = null;
  let startControl = null;
  let fcpMs = null;
  let frame = { fps: 0, sampledFrames: 0, longFrames: 0, longFrameRatio: 1 };

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    domMs = Date.now() - start;
    try {
      await page.waitForFunction(() => {
        const body = document.body;
        const visible = element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 12 && rect.height > 12;
        };
        const candidates = [...document.querySelectorAll('canvas, svg, button, [role="button"], input, #game, #game-root, .game-surface')];
        return candidates.some(visible) || (body?.innerText || '').trim().length >= 24;
      }, null, { timeout: 8000 });
      readyMs = Date.now() - start;
    } catch {
      readyMs = Date.now() - start;
    }

    fcpMs = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime || null).catch(() => null);
    const found = await findStartControl(page);
    if (found) {
      startControl = found.text;
      await found.control.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(700);
    }
    frame = await frameSample(page);
  } catch (error) {
    errors.push(error.message);
  }

  const sameOrigin = resources.filter(item => item.sameOrigin && item.status < 400);
  const thirdParty = resources.filter(item => !item.sameOrigin && item.status < 400);
  const initialBytes = sameOrigin.reduce((sum, item) => sum + item.bytes, 0);
  const thirdPartyBytes = thirdParty.reduce((sum, item) => sum + item.bytes, 0);
  const estimatedNetworkMs = Math.round((initialBytes * 8 / (FACTORY_WEB_TARGETS.estimatedConnectionMbps * 1_000_000)) * 1000 + Math.min(sameOrigin.length, 12) * 45);
  const estimatedReadyMs = Math.round((readyMs || domMs || 0) + estimatedNetworkMs);

  const result = {
    domMs,
    meaningfulReadyMs: readyMs,
    fcpMs: fcpMs == null ? null : Math.round(fcpMs),
    startControl,
    initialRequests: sameOrigin.length,
    thirdPartyRequests: thirdParty.length,
    initialBytes,
    thirdPartyBytes,
    estimated4MbpsReadyMs: estimatedReadyMs,
    frame,
    errors: [...new Set(errors)].slice(0, 10),
    largestResources: sameOrigin.sort((a, b) => b.bytes - a.bytes).slice(0, 8).map(item => ({ pathname: item.pathname, type: item.type, bytes: item.bytes }))
  };
  await context.close();
  return result;
}

async function adBlockProbe(browser, { url }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1
  });
  await context.route(/game-cdn\.poki\.com|poki-sdk/i, route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let loaded = false;
  let startControl = null;
  let responsive = false;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    loaded = await meaningfulUi(page);
    const found = await findStartControl(page);
    if (found) {
      startControl = found.text;
      await found.control.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    responsive = await meaningfulUi(page);
  } catch (error) {
    errors.push(error.message);
  }
  await context.close();
  return { passed: loaded && responsive, loaded, responsive, startControl, errors: [...new Set(errors)].slice(0, 8) };
}

async function walkSource(root, relative = '') {
  const dir = path.join(root, relative);
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SOURCE_SKIP_DIRS.has(entry.name)) continue;
      files.push(...await walkSource(root, path.join(relative, entry.name)));
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(path.join(relative, entry.name));
  }
  return files;
}

async function sourceAudit(gameDir) {
  const files = await walkSource(gameDir);
  let source = '';
  for (const relative of files) {
    try {
      const text = await fsp.readFile(path.join(gameDir, relative), 'utf8');
      source += `\n/* ${relative} */\n${text.slice(0, 2_000_000)}`;
      if (source.length > 8_000_000) break;
    } catch {}
  }
  let metadata = null;
  try { metadata = JSON.parse(await fsp.readFile(path.join(gameDir, 'factory-game.json'), 'utf8')); } catch {}
  const hasPokiSdk = /game-cdn\.poki\.com\/scripts\/v2\/poki-sdk\.js|\bPokiSDK\b|GutpopperCore\.poki/.test(source);
  const loadingFinished = /(?:PokiSDK\.gameLoadingFinished|GutpopperCore\.poki\.loadingFinished)\s*\(/.test(source);
  const gameplayStart = /(?:PokiSDK\.gameplayStart|GutpopperCore\.poki\.gameplayStart)\s*\(/.test(source);
  const gameplayStop = /(?:PokiSDK\.gameplayStop|GutpopperCore\.poki\.gameplayStop)\s*\(/.test(source);
  const commercialBreak = /(?:PokiSDK\.commercialBreak|GutpopperCore\.poki\.commercialBreak)\s*\(/.test(source);
  const rewardedBreak = /(?:PokiSDK\.rewardedBreak|GutpopperCore\.poki\.rewardedBreak)\s*\(/.test(source);
  const outgoingLinks = [...source.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)]
    .map(match => match[1])
    .filter(url => !/poki\.com/i.test(url))
    .slice(0, 8);
  const otherAds = /adsbygoogle|googlesyndication|adinplay|gamemonetize|gamepix|crazygames-sdk/i.test(source);
  return {
    target: metadata?.target || (hasPokiSdk ? 'Poki' : 'Unknown'),
    hasPokiSdk,
    loadingFinished,
    gameplayStart,
    gameplayStop,
    commercialBreak,
    rewardedBreak,
    outgoingLinks,
    otherAdSystemDetected: otherAds
  };
}

function scorePerformance(metrics) {
  let score = 100;
  const notes = [];
  const bytesMb = metrics.initialBytes / 1024 / 1024;
  if (metrics.errors.length) { score -= 25; notes.push(`Load produced ${metrics.errors.length} browser error(s).`); }
  if (metrics.meaningfulReadyMs > 7000) { score -= 35; notes.push(`Meaningful UI took ${metrics.meaningfulReadyMs} ms locally.`); }
  else if (metrics.meaningfulReadyMs > FACTORY_WEB_TARGETS.coldReadyWarnMs) { score -= 20; notes.push(`Meaningful UI took ${metrics.meaningfulReadyMs} ms locally; tighten startup.`); }
  else if (metrics.meaningfulReadyMs > FACTORY_WEB_TARGETS.coldReadyGreatMs) { score -= 8; notes.push(`Meaningful UI took ${metrics.meaningfulReadyMs} ms locally; there is room to improve.`); }

  if (metrics.initialBytes > FACTORY_WEB_TARGETS.initialBytesBad) { score -= 40; notes.push(`Initial same-origin payload is ${bytesMb.toFixed(1)} MB — far too heavy for a fast web start.`); }
  else if (metrics.initialBytes > FACTORY_WEB_TARGETS.initialBytesWarn) { score -= 24; notes.push(`Initial same-origin payload is ${bytesMb.toFixed(1)} MB; use progressive loading/compression.`); }
  else if (metrics.initialBytes > FACTORY_WEB_TARGETS.initialBytesGreat) { score -= 10; notes.push(`Initial same-origin payload is ${bytesMb.toFixed(1)} MB; consider deferring nonessential assets.`); }

  if (metrics.initialRequests > FACTORY_WEB_TARGETS.requestBad) { score -= 12; notes.push(`${metrics.initialRequests} initial local requests create avoidable startup overhead.`); }
  else if (metrics.initialRequests > FACTORY_WEB_TARGETS.requestWarn) { score -= 5; notes.push(`${metrics.initialRequests} initial local requests is higher than the Factory target.`); }

  if (metrics.frame.fps && metrics.frame.fps < 30) { score -= 35; notes.push(`Measured frame rate is only about ${metrics.frame.fps} FPS.`); }
  else if (metrics.frame.fps && metrics.frame.fps < FACTORY_WEB_TARGETS.fpsWarn) { score -= 22; notes.push(`Measured frame rate is about ${metrics.frame.fps} FPS.`); }
  else if (metrics.frame.fps && metrics.frame.fps < FACTORY_WEB_TARGETS.fpsGreat) { score -= 8; notes.push(`Measured frame rate is about ${metrics.frame.fps} FPS; aim for steadier 60-ish FPS.`); }
  if (metrics.frame.longFrameRatio > FACTORY_WEB_TARGETS.longFrameWarnRatio) { score -= 10; notes.push(`${Math.round(metrics.frame.longFrameRatio * 100)}% of sampled frames exceeded 34 ms.`); }

  if (metrics.estimated4MbpsReadyMs > 12000) { score -= 18; notes.push(`Factory 4 Mbps estimate reaches meaningful UI in ~${(metrics.estimated4MbpsReadyMs / 1000).toFixed(1)} s.`); }
  else if (metrics.estimated4MbpsReadyMs > 8000) { score -= 10; notes.push(`Factory 4 Mbps estimate reaches meaningful UI in ~${(metrics.estimated4MbpsReadyMs / 1000).toFixed(1)} s.`); }

  if (!notes.length) notes.push('Cold-load weight, request count, startup timing, and sampled frame pacing are within Factory targets.');
  return { score: Math.max(0, Math.min(100, score)), notes };
}

function scorePoki(source, adBlock, metrics) {
  let score = 100;
  const notes = [];
  if (!source.hasPokiSdk) { score -= 20; notes.push('Poki SDK integration was not detected in project source.'); }
  if (!source.loadingFinished) { score -= 14; notes.push('No gameLoadingFinished/loadingFinished call detected.'); }
  if (!source.gameplayStart) { score -= 14; notes.push('No gameplayStart call detected.'); }
  if (!source.gameplayStop) { score -= 14; notes.push('No gameplayStop call detected.'); }
  if (!source.commercialBreak) { score -= 7; notes.push('No natural commercialBreak opportunity detected in source.'); }
  if (!source.rewardedBreak) { score -= 4; notes.push('No optional rewardedBreak opportunity detected in source.'); }
  if (!adBlock.passed) { score -= 25; notes.push('Game did not remain meaningfully playable with the Poki SDK request blocked.'); }
  if (source.outgoingLinks.length) { score -= 12; notes.push(`Outgoing link(s) detected: ${source.outgoingLinks.join(', ')}`); }
  if (source.otherAdSystemDetected) { score -= 30; notes.push('Possible non-Poki advertising SDK/system detected.'); }
  if (metrics.meaningfulReadyMs > 5000) { score -= 8; notes.push('Slow first meaningful UI can hurt conversion to play.'); }
  if (!metrics.startControl) notes.push('No explicit start control was detected; verify first input enters gameplay and fires gameplayStart at the correct moment.');
  if (!notes.length) notes.push('Poki SDK/event hooks, ad-block resilience, and outgoing-link checks look healthy.');
  return { score: Math.max(0, Math.min(100, score)), notes };
}

export async function runPokiReadiness({ gameDir, url }) {
  const browser = await launchBrowser();
  try {
    const [metrics, adBlock, source] = await Promise.all([
      coldLoadProbe(browser, { url }),
      adBlockProbe(browser, { url }),
      sourceAudit(gameDir)
    ]);
    const performance = scorePerformance(metrics);
    const poki = scorePoki(source, adBlock, metrics);
    return {
      checkedAt: new Date().toISOString(),
      performanceScore: performance.score,
      pokiScore: poki.score,
      performanceNotes: performance.notes,
      pokiNotes: poki.notes,
      metrics,
      adBlock,
      source,
      targets: {
        ...FACTORY_WEB_TARGETS,
        note: 'Gutpopper Factory internal targets; Poki does not publish these as official numeric pass/fail thresholds.'
      }
    };
  } finally {
    await browser.close();
  }
}
