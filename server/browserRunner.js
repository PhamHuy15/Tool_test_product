import { chromium } from 'playwright';
import { browserConfig } from './browserConfig.js';

export async function checkPlaywright() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    return { ok: true, browser: 'chromium', version: browser.version() };
  } catch (error) {
    return { ok: false, browser: 'chromium', error: error.message };
  } finally {
    await browser?.close().catch(() => {});
  }
}

export async function withBrowserRun({ runDir, onProgress, task }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: false,
    serviceWorkers: 'block',
  });
  context.setDefaultTimeout(browserConfig.actionTimeoutMs);
  context.setDefaultNavigationTimeout(browserConfig.navigationTimeoutMs);
  if (browserConfig.traces) await context.tracing.start({ screenshots: true, snapshots: true });

  const state = { cancelled: false };
  const cancel = () => { state.cancelled = true; };
  try {
    const result = await task({ browser, context, state, cancel, onProgress });
    return result;
  } finally {
    if (browserConfig.traces) {
      await context.tracing.stop({ path: `${runDir}/TEST_EVIDENCE/playwright-trace.zip` }).catch(() => {});
    }
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

export async function captureViewports({ runDir, url, onProgress }) {
  return withBrowserRun({ runDir, task: async ({ context }) => {
    const viewports = [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }];
    const results = [];
    const page = await context.newPage();
    try {
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        const started = Date.now();
        try {
          const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
          await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
          const fileName = `TEST_EVIDENCE/viewport-${viewport.width}x${viewport.height}.png`;
          await page.screenshot({ path: `${runDir}/${fileName}`, fullPage: true });
          results.push({ ...viewport, statusCode: response?.status() || null, screenshot: fileName, durationMs: Date.now() - started });
        } catch (error) {
          results.push({ ...viewport, error: error.message, durationMs: Date.now() - started });
        }
        onProgress?.({ phase: 'viewport', current: results.length, total: viewports.length, url });
      }
    } finally {
      await page.close().catch(() => {});
    }
    return results;
  }});
}
