import path from 'node:path';
import { browserConfig } from './browserConfig.js';

export async function extractPage(page, url, { runDir, screenshotName, expectedOrigin } = {}) {
  const startedAt = Date.now();
  const errors = [];
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (expectedOrigin && new URL(page.url()).origin !== expectedOrigin) {
    throw new Error('Redirect outside the target origin is blocked.');
  }
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  const data = await page.evaluate((textLimit) => {
    const hidden = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG']);
    const selectors = 'header, footer, nav, [role="navigation"], [aria-label*="cookie" i], .cookie, .cookie-banner, .admin-bar';
    document.querySelectorAll(selectors).forEach((node) => node.setAttribute('data-ai-test-ignore', 'true'));
    const root = document.body;
    const visibleText = root ? Array.from(root.querySelectorAll('*'))
      .filter((node) => !hidden.has(node.tagName) && !node.closest('[data-ai-test-ignore="true"]'))
      .filter((node) => getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden')
      .map((node) => node.children.length ? '' : node.textContent || '')
      .join(' ').replace(/\s+/g, ' ').trim().slice(0, textLimit) : '';
    const links = Array.from(root?.querySelectorAll('a[href]') || []).map((node) => ({
      href: node.href,
      text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      type: /\.(pdf|docx?|xlsx?|zip|png|jpe?g)(?:$|\?)/i.test(node.href) ? 'file' : 'page',
    }));
    return {
      canonicalUrl: document.querySelector('link[rel="canonical"]')?.href || location.href,
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      headings: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((node) => ({ level: Number(node.tagName.slice(1)), text: node.textContent.trim() })).filter((item) => item.text),
      text: visibleText,
      links,
      images: Array.from(document.images).map((node) => ({ src: node.currentSrc || node.src, alt: node.alt || '' })).slice(0, 200),
      forms: Array.from(document.forms).map((form) => ({ action: form.action, method: form.method || 'get', fields: form.elements.length })),
      buttons: Array.from(document.querySelectorAll('button,[role="button"]')).map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 200),
    };
  }, browserConfig.pageTextLimit);

  let screenshot;
  if (browserConfig.screenshots && runDir && screenshotName) {
    screenshot = path.join('TEST_EVIDENCE', `${screenshotName}.png`);
    await page.screenshot({ path: path.join(runDir, screenshot), fullPage: true }).catch((error) => errors.push(`screenshot: ${error.message}`));
  }
  return {
    url,
    ...data,
    statusCode: response?.status() || null,
    redirects: redirectChain(response?.request()),
    errors: [...errors, ...consoleErrors],
    durationMs: Date.now() - startedAt,
    screenshot,
  };
}

function redirectChain(request) {
  const redirects = [];
  let current = request?.redirectedFrom?.();
  while (current) {
    redirects.unshift(current.url());
    current = current.redirectedFrom?.();
  }
  return redirects;
}
