import path from 'node:path';
import { chromium } from 'playwright';

const START_PATTERN = /^(?:play(?:\s+now)?|start(?:\s+(?:game|shift|job|run|level|mission|round|race|day))?|begin(?:\s+(?:game|shift|job|run|level|mission|round))?|go|launch|continue|new game)$/i;
const GENERIC_RESOURCE_ERROR = /^Failed to load resource: the server responded with a status of \d+/i;
const OPTIONAL_ICON_PATH = /\/(favicon\.ico|apple-touch-icon(?:-[^/]*)?\.png)$/i;

async function launchQaBrowser() {
  if (process.platform === 'win32') {
    try {
      return await chromium.launch({ channel: 'msedge', headless: true });
    } catch (edgeError) {
      try {
        return await chromium.launch({ headless: true });
      } catch {
        throw new Error(`Automated QA could not start Microsoft Edge. Update/reinstall Edge and retry. ${edgeError.message}`);
      }
    }
  }
  return chromium.launch({ headless: true });
}

async function exercisePage(page) {
  const candidates = page.locator('button, [role="button"], input[type="button"], input[type="submit"]');
  const count = Math.min(await candidates.count(), 40);
  for (let i = 0; i < count; i += 1) {
    const candidate = candidates.nth(i);
    const text = ((await candidate.innerText().catch(() => '')) || (await candidate.getAttribute('value')) || '').trim();
    if (!START_PATTERN.test(text)) continue;
    await candidate.click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(1100);
    return text;
  }
  return null;
}

async function inspectViewport(browser, { name, width, height, url, screenshotPath, mobile = false }) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const resourceErrors = [];
  const targetOrigin = new URL(url).origin;

  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!GENERIC_RESOURCE_ERROR.test(text)) consoleErrors.push(text);
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    const status = response.status();
    if (status < 400) return;
    try {
      const responseUrl = new URL(response.url());
      if (responseUrl.origin !== targetOrigin) return;
      if (OPTIONAL_ICON_PATH.test(responseUrl.pathname)) return;
      resourceErrors.push(`${status} ${responseUrl.pathname}`);
    } catch {
      // Ignore malformed/non-HTTP response URLs.
    }
  });

  let responseStatus = null;
  let loadError = null;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    responseStatus = response?.status() ?? null;
    await page.waitForTimeout(1000);
  } catch (error) {
    loadError = error.message;
  }

  const clicked = loadError ? null : await exercisePage(page);
  const metrics = loadError ? null : await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const rect = body?.getBoundingClientRect();
    const interactiveCount = document.querySelectorAll('button, canvas, svg, [role="button"], input, a').length;

    const visibleRect = element => {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return null;
      const r = element.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return null;
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };

    const canvasRects = [...document.querySelectorAll('canvas')].map(visibleRect).filter(Boolean);
    const largestCanvas = canvasRects.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null;

    const meaningfulSelectors = [
      'canvas', 'svg', 'img', 'button', '[role="button"]', 'input', 'h1', 'h2', 'h3',
      '#game', '#game-root', '.game-surface', '.game-container', '[data-game-root]'
    ];
    const meaningfulRects = [...document.querySelectorAll(meaningfulSelectors.join(','))]
      .map(visibleRect)
      .filter(Boolean)
      .filter(r => r.right > 0 && r.bottom > 0 && r.left < root.clientWidth && r.top < root.clientHeight);

    let meaningfulBounds = null;
    if (meaningfulRects.length) {
      const left = Math.max(0, Math.min(...meaningfulRects.map(r => r.left)));
      const top = Math.max(0, Math.min(...meaningfulRects.map(r => r.top)));
      const right = Math.min(root.clientWidth, Math.max(...meaningfulRects.map(r => r.right)));
      const bottom = Math.min(root.clientHeight, Math.max(...meaningfulRects.map(r => r.bottom)));
      meaningfulBounds = {
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
        widthRatio: root.clientWidth ? Math.max(0, right - left) / root.clientWidth : 0,
        heightRatio: root.clientHeight ? Math.max(0, bottom - top) / root.clientHeight : 0
      };
    }

    return {
      title: document.title,
      bodyWidth: Math.round(rect?.width || 0),
      bodyHeight: Math.round(rect?.height || 0),
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight,
      interactiveCount,
      hasCanvas: Boolean(document.querySelector('canvas')),
      hasSvg: Boolean(document.querySelector('svg')),
      textLength: (body?.innerText || '').trim().length,
      largestCanvas: largestCanvas ? {
        width: Math.round(largestCanvas.width),
        height: Math.round(largestCanvas.height),
        widthRatio: root.clientWidth ? largestCanvas.width / root.clientWidth : 0,
        heightRatio: root.clientHeight ? largestCanvas.height / root.clientHeight : 0
      } : null,
      meaningfulBounds
    };
  });

  if (!loadError) await page.screenshot({ path: screenshotPath, fullPage: false });

  const issues = [];
  if (loadError) issues.push(`${name}: page failed to load: ${loadError}`);
  if (responseStatus && responseStatus >= 400) issues.push(`${name}: HTTP ${responseStatus}`);
  if (pageErrors.length) issues.push(`${name}: ${pageErrors.length} uncaught page error(s): ${pageErrors.slice(0, 3).join(' | ')}`);
  if (consoleErrors.length) issues.push(`${name}: ${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 3).join(' | ')}`);
  if (resourceErrors.length) issues.push(`${name}: ${resourceErrors.length} missing/failed local resource(s): ${resourceErrors.slice(0, 3).join(' | ')}`);
  if (metrics) {
    if (metrics.scrollWidth - metrics.clientWidth > 3) {
      issues.push(`${name}: horizontal overflow (${metrics.scrollWidth}px content in ${metrics.clientWidth}px viewport)`);
    }
    if (metrics.bodyWidth < 10 || metrics.bodyHeight < 10) issues.push(`${name}: body appears empty or collapsed`);
    if (metrics.interactiveCount === 0 && metrics.textLength < 20) issues.push(`${name}: no meaningful game UI detected`);

    if (!mobile) {
      const canvas = metrics.largestCanvas;
      if (canvas && canvas.heightRatio >= 0.58 && canvas.widthRatio < 0.62) {
        issues.push(`${name}: game canvas is still portrait/mobile-bound (${canvas.width}x${canvas.height} inside ${metrics.clientWidth}x${metrics.clientHeight}); desktop must reflow to a landscape layout and use the available screen width`);
      } else if (!canvas && metrics.meaningfulBounds?.heightRatio >= 0.55 && metrics.meaningfulBounds.widthRatio < 0.52) {
        issues.push(`${name}: meaningful game UI only uses ${Math.round(metrics.meaningfulBounds.widthRatio * 100)}% of desktop width; desktop must not remain a narrow phone layout centered in empty side gutters`);
      }
    }
  }

  await context.close();
  return {
    name,
    viewport: `${width}x${height}`,
    passed: issues.length === 0,
    issues,
    clickedStartControl: clicked,
    responseStatus,
    consoleErrors: consoleErrors.slice(0, 10),
    pageErrors: pageErrors.slice(0, 10),
    resourceErrors: resourceErrors.slice(0, 10),
    metrics,
    screenshot: path.basename(screenshotPath)
  };
}

export async function runQa({ url, artifactDir }) {
  const browser = await launchQaBrowser();
  try {
    const desktop = await inspectViewport(browser, {
      name: 'Desktop',
      width: 1440,
      height: 900,
      url,
      screenshotPath: path.join(artifactDir, 'desktop.png')
    });
    const mobile = await inspectViewport(browser, {
      name: 'Mobile',
      width: 390,
      height: 844,
      url,
      screenshotPath: path.join(artifactDir, 'mobile.png'),
      mobile: true
    });

    const views = [desktop, mobile];
    return {
      passed: views.every(view => view.passed),
      checkedAt: new Date().toISOString(),
      browser: process.platform === 'win32' ? 'Microsoft Edge' : 'Playwright Chromium',
      views,
      issues: views.flatMap(view => view.issues)
    };
  } finally {
    await browser.close();
  }
}
