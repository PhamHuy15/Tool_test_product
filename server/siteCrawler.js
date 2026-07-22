import fs from 'node:fs/promises';
import path from 'node:path';
import { browserConfig } from './browserConfig.js';
import { withBrowserRun } from './browserRunner.js';
import { extractPage } from './siteExtractor.js';
import { prepareBrowserRun, writeManifest, writePageSnapshot } from './runStorage.js';
import { isPrivateIp, isBlockedHostname } from './security.js';
import dns from 'node:dns/promises';

export function normalizeUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(key)) url.searchParams.delete(key);
    return url.href.replace(/\/$/, '') || url.origin;
  } catch { return null; }
}

async function assertSafeNavigation(value, origin) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error('Navigation outside the target origin is blocked.');
  if (isBlockedHostname(url.hostname)) throw new Error('Private hostname is blocked.');
  if (url.hostname !== new URL(origin).hostname) return;
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.some(({ address }) => isPrivateIp(address))) throw new Error('Private navigation target is blocked.');
}

export async function crawlSite({ runDir, startUrl, phase, onProgress, isCancelled, maxPages = browserConfig.maxPages }) {
  await prepareBrowserRun(runDir);
  const origin = new URL(startUrl).origin;
  const queue = [normalizeUrl(startUrl)];
  const seen = new Set();
  const pages = [];
  const errors = [];
  let index = 0;

  const result = await withBrowserRun({ runDir, onProgress, task: async ({ context, state }) => {
    const crawlOne = async () => {
      while (queue.length && pages.length < maxPages && !state.cancelled) {
        if (isCancelled?.()) { state.cancelled = true; break; }
        const url = queue.shift();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        let lastError;
        for (let attempt = 0; attempt <= browserConfig.retries; attempt += 1) {
          const page = await context.newPage();
          try {
            await assertSafeNavigation(url, origin);
            const pageData = await extractPage(page, url, { runDir, expectedOrigin: origin, screenshotName: `${phase}-${String(index).padStart(4, '0')}` });
            const pageIndex = index++;
            pages.push(pageData);
            await writePageSnapshot(runDir, pageData, pageIndex, phase);
            for (const link of pageData.links) {
              const next = normalizeUrl(link.href, url);
              if (next && new URL(next).origin === origin && !seen.has(next) && queue.length + pages.length < maxPages) queue.push(next);
            }
            onProgress?.({ phase, current: pages.length, total: Math.min(maxPages, pages.length + queue.length), url });
            lastError = null;
            await page.close().catch(() => {});
            break;
          } catch (error) {
            lastError = error;
            await page.close().catch(() => {});
          }
        }
        if (lastError) {
          errors.push({ url, error: lastError.message });
          onProgress?.({ phase, current: pages.length, total: Math.min(maxPages, pages.length + queue.length), url, error: lastError.message });
        }
      }
    };
    await Promise.all(Array.from({ length: browserConfig.concurrency }, () => crawlOne()));
    return { pages, errors, seenCount: seen.size, remaining: queue.length };
  }});
  const manifest = { startUrl, origin, phase, pages: result.pages.length, errors: result.errors.length, seen: result.seenCount, remaining: result.remaining, config: browserConfig };
  await writeManifest(runDir, manifest, `crawl_manifest-${phase}.json`);
  await fs.writeFile(path.join(runDir, `crawl_errors-${phase}.json`), JSON.stringify(result.errors, null, 2), 'utf8');
  return { ...result, manifest };
}
