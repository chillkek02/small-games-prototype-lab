import path from 'node:path';
import { chromium } from 'playwright';

const START_PATTERN = /^(play|start|begin|go|launch|continue|new game|start game)$/i;
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
  const count = Math.min(await candidates.count(), 30);
  for (let i = 0; i < count; i += 1) {
    const candidate = candidates.nth(i);
    const text = ((await candidate.innerText().catch(() => '')) || (await candidate.getAttribute('value')) || '').trim();
    if (START_PATTERN.test(text)) {
      await candidate.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(900);
      return text;
    }
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
    // Chromium's generic 4xx/5xx console line has no URL. Resource responses are
    // checked separately below, where we can distinguish real game assets from
    // harmless browser icon probes such as /favicon.ico.
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
      textLength: (body?.innerText || '').trim().length
    };
  });

  if (!loadError) {
    await page.screenshot({ path: screenshotPath, fullPage: false });
  }

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
