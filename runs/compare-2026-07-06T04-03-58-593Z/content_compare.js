const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const SOURCE_ORIGIN = 'https://afd-dortmund.de';
const TARGET_ORIGIN = 'https://afd-dortmund.devalternita.de';
const SOURCE_DOMAIN = 'afd-dortmund.de';
const TARGET_DOMAIN = 'afd-dortmund.devalternita.de';
const PLAYWRIGHT_CORE = 'D:/workspaces/ReactJs/Movie_App/node_modules/playwright-core';
const CHROME_EXE = 'C:/Users/admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function loadPlaywright() {
  try {
    return require('playwright-core');
  } catch (_) {
    return require(PLAYWRIGHT_CORE);
  }
}

function normalizePath(url) {
  const u = new URL(url);
  let p = u.pathname.replace(/\/+/g, '/');
  if (p.length > 1) p = p.replace(/\/$/, '');
  return decodeURIComponent(p || '/').toLowerCase();
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSourceReference(href) {
  if (!href) return null;
  let value = href.trim();
  if (!value || value.startsWith('#') || /^javascript:/i.test(value)) return null;
  value = value.replaceAll(SOURCE_DOMAIN, TARGET_DOMAIN);
  return value;
}

function linkKey(href) {
  try {
    const u = new URL(href, TARGET_ORIGIN);
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.pathname);
    return last || decodeURIComponent(u.pathname);
  } catch (_) {
    const clean = href.split(/[?#]/)[0];
    return decodeURIComponent(clean.split('/').filter(Boolean).pop() || clean);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Content-QA/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function sitemapUrls(origin, errors) {
  const robotsUrl = `${origin}/robots.txt`;
  const candidates = new Set([`${origin}/sitemap.xml`]);
  try {
    const robots = await fetchText(robotsUrl);
    for (const line of robots.split(/\r?\n/)) {
      const match = line.match(/^sitemap:\s*(.+)$/i);
      if (match) candidates.add(match[1].trim());
    }
  } catch (error) {
    const message = `Không đọc được robots.txt của ${origin}: ${error.message}`;
    console.log(message);
    errors.push(message);
  }

  const seenSitemaps = new Set();
  const urls = new Set();
  async function readSitemap(sitemapUrl) {
    if (seenSitemaps.has(sitemapUrl)) return;
    seenSitemaps.add(sitemapUrl);
    await sleep(1200);
    const xml = await fetchText(sitemapUrl);
    const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
    for (const loc of locs) {
      if (loc.endsWith('.xml')) {
        await readSitemap(loc);
      } else {
        try {
          const u = new URL(loc);
          if (u.origin === origin) urls.add(u.href.replace(/#.*$/, ''));
        } catch (_) {}
      }
    }
  }

  for (const candidate of candidates) {
    try {
      await readSitemap(candidate);
    } catch (error) {
      const message = `Không đọc được sitemap ${candidate}: ${error.message}`;
      console.log(message);
      errors.push(message);
    }
  }
  return [...urls];
}

async function extractPage(page, url) {
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(750);
  const status = response ? response.status() : 0;
  const data = await page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    const removeSelectors = [
      'header', 'footer', 'nav', '[role="navigation"]', '#wpadminbar',
      '.cookie', '.cky-consent-container', '.cmplz-cookiebanner',
      '.fusion-header-wrapper', '.fusion-footer', '.sidebar',
      'script', 'style', 'noscript', 'svg',
    ];
    clone.querySelectorAll(removeSelectors.join(',')).forEach((n) => n.remove());
    const main =
      clone.querySelector('main') ||
      clone.querySelector('article') ||
      clone.querySelector('.post-content') ||
      clone.querySelector('.entry-content') ||
      clone.querySelector('#content') ||
      clone;
    const links = [...main.querySelectorAll('a[href], img[src], source[src], video[src]')].map((el) => ({
      text: el.textContent || el.getAttribute('alt') || '',
      href: el.getAttribute('href') || el.getAttribute('src') || '',
    }));
    return {
      title: document.title || '',
      h1: [...main.querySelectorAll('h1')].map((h) => h.textContent.trim()).filter(Boolean)[0] || '',
      text: main.innerText || main.textContent || '',
      links,
    };
  });
  return { url, status, ...data, text: normalizeText(data.text) };
}

async function discoverWithBrowser(browser, origin, seedUrls, errors) {
  const page = await browser.newPage();
  const urls = new Map(seedUrls.map((u) => [normalizePath(u), u]));
  const queue = seedUrls.length ? [...seedUrls] : [origin + '/'];
  const maxPages = 300;
  while (queue.length && urls.size < maxPages) {
    const current = queue.shift();
    try {
      await sleep(1200);
      const response = await page.goto(current, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (!response || response.status() >= 400) continue;
      urls.set(normalizePath(current), current);
      const found = await page.evaluate((originArg) => {
        return [...document.querySelectorAll('a[href]')]
          .map((a) => a.href)
          .filter((href) => href && href.startsWith(originArg))
          .map((href) => href.replace(/#.*$/, ''));
      }, origin);
      for (const href of found) {
        try {
          const u = new URL(href);
          if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|docx?|xlsx?)$/i.test(u.pathname)) continue;
          const key = normalizePath(href);
          if (!urls.has(key)) {
            urls.set(key, u.href);
            queue.push(u.href);
          }
        } catch (_) {}
      }
    } catch (error) {
      const message = `Lỗi crawl ${current}: ${error.message.split('\n')[0]}`;
      console.log(message);
      errors.push(message);
    }
  }
  await page.close();
  return [...urls.values()];
}

function pairPages(sourceUrls, targetUrls) {
  const targetByPath = new Map(targetUrls.map((u) => [normalizePath(u), u]));
  const pairs = [];
  const unpairedSource = [];
  const usedTargets = new Set();
  for (const sourceUrl of sourceUrls) {
    const key = normalizePath(sourceUrl);
    const targetUrl = targetByPath.get(key);
    if (targetUrl) {
      pairs.push({ source_url: sourceUrl, target_url: targetUrl, match_confidence: 'path_exact' });
      usedTargets.add(targetUrl);
    } else {
      unpairedSource.push(sourceUrl);
    }
  }
  const unpairedTarget = targetUrls.filter((u) => !usedTargets.has(u));
  return { pairs, unpairedSource, unpairedTarget };
}

function textSimilarity(a, b) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);
  if (!aa && !bb) return 100;
  if (!aa || !bb) return 0;
  const shorter = aa.length <= bb.length ? aa : bb;
  const longer = aa.length > bb.length ? aa : bb;
  if (longer.includes(shorter)) return Math.round((shorter.length / longer.length) * 100);
  const wordsA = new Set(aa.toLowerCase().split(/\s+/));
  const wordsB = new Set(bb.toLowerCase().split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size || 1;
  return Math.round((intersection / union) * 100);
}

function snippetDiff(sourceText, targetText) {
  const sourceSentences = normalizeText(sourceText).split(/(?<=[.!?])\s+/).filter((s) => s.length > 30);
  const targetLower = normalizeText(targetText).toLowerCase();
  const missing = sourceSentences.filter((s) => !targetLower.includes(s.toLowerCase())).slice(0, 8);
  const targetSentences = normalizeText(targetText).split(/(?<=[.!?])\s+/).filter((s) => s.length > 30);
  const sourceLower = normalizeText(sourceText).toLowerCase();
  const added = targetSentences.filter((s) => !sourceLower.includes(s.toLowerCase())).slice(0, 5);
  return { missing, added };
}

function compareLinks(sourceLinks, targetLinks) {
  const targetValues = targetLinks.map((l) => l.href).filter(Boolean);
  const targetKeys = new Map(targetValues.map((href) => [linkKey(href).toLowerCase(), href]));
  return sourceLinks
    .map((l) => ({ original: l.href, normalized: normalizeSourceReference(l.href) }))
    .filter((l) => l.normalized)
    .map((l) => {
      const exact = targetValues.find((href) => href === l.normalized);
      const equivalent = exact || targetKeys.get(linkKey(l.normalized).toLowerCase()) || '';
      return {
        source: l.original,
        target: equivalent,
        status: equivalent ? 'Đã chuyển đổi đúng' : 'Thiếu',
      };
    });
}

function statusFor(similarity, missingCount) {
  if (similarity >= 95 && missingCount === 0) return 'OK';
  if (missingCount > 0 && similarity < 85) return 'Thiếu nội dung';
  return 'Cần kiểm tra';
}

async function main() {
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({
    executablePath: fs.existsSync(CHROME_EXE) ? CHROME_EXE : undefined,
    headless: true,
  });
  const errors = [];
  let sourceUrls = [];
  let targetUrls = [];
  try {
    const sourceSitemap = await sitemapUrls(SOURCE_ORIGIN, errors);
    const targetSitemap = await sitemapUrls(TARGET_ORIGIN, errors);
    sourceUrls = await discoverWithBrowser(browser, SOURCE_ORIGIN, sourceSitemap, errors);
    targetUrls = await discoverWithBrowser(browser, TARGET_ORIGIN, targetSitemap, errors);
  } catch (error) {
    errors.push(`Giai đoạn 1 lỗi: ${error.message}`);
  }

  const { pairs, unpairedSource, unpairedTarget } = pairPages(sourceUrls, targetUrls);
  fs.writeFileSync(
    path.join(process.cwd(), 'page_pairs.csv'),
    ['source_url,target_url,match_confidence', ...pairs.map((p) => [p.source_url, p.target_url, p.match_confidence].map(csvEscape).join(','))].join('\n'),
    'utf8'
  );

  const details = [];
  const page = await browser.newPage();
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    console.log(`Đang so sánh cặp ${i + 1}/${pairs.length}: ${normalizePath(pair.source_url)}`);
    try {
      await sleep(1200);
      const source = await extractPage(page, pair.source_url);
      await sleep(1200);
      const target = await extractPage(page, pair.target_url);
      const similarity = textSimilarity(source.text, target.text);
      const diff = snippetDiff(source.text, target.text);
      const links = compareLinks(source.links, target.links);
      details.push({ pair, similarity, status: statusFor(similarity, diff.missing.length), diff, links, error: '' });
    } catch (error) {
      details.push({ pair, similarity: 0, status: 'Cần kiểm tra', diff: { missing: [], added: [] }, links: [], error: error.message.split('\n')[0] });
      errors.push(`${pair.source_url} ↔ ${pair.target_url}: ${error.message.split('\n')[0]}`);
    }
  }
  await page.close();
  await browser.close();

  const report = [
    '# Báo cáo so sánh nội dung',
    `- Site gốc: ${SOURCE_ORIGIN}`,
    `- Site đích: ${TARGET_ORIGIN}`,
    `- Tổng số cặp trang đã so sánh: ${details.length}`,
    '',
    '## Tổng quan',
    `- Tổng số trang site gốc phát hiện: ${sourceUrls.length}`,
    `- Tổng số trang site đích phát hiện: ${targetUrls.length}`,
    `- Số cặp ghép được: ${pairs.length}`,
    `- Trang gốc không ghép được: ${unpairedSource.length}`,
    `- Trang đích không ghép được: ${unpairedTarget.length}`,
    errors.length ? `- Lỗi khi chạy: ${errors.length}. ${errors[0]}` : '- Lỗi khi chạy: 0',
    '',
    '## Chi tiết từng trang',
    ...(details.length ? details.flatMap((d) => [
      `### ${d.pair.source_url} ↔ ${d.pair.target_url}`,
      `- Tỷ lệ khớp nội dung: ${d.similarity}%`,
      `- Trạng thái: ${d.status}`,
      d.error ? `- Lỗi: ${d.error}` : '',
      '',
      '**Nội dung thiếu:**',
      ...(d.diff.missing.length ? d.diff.missing.map((s) => `- ${s}`) : ['- Không phát hiện']),
      '',
      '**Nội dung sai lệch:**',
      '- Không đánh dấu sai lệch ngữ nghĩa tự động ngoài các đoạn thiếu; cần kiểm tra thủ công các trang trạng thái "Cần kiểm tra".',
      '',
      '**Nội dung mới thêm (không phải lỗi):**',
      ...(d.diff.added.length ? d.diff.added.map((s) => `- ${s}`) : ['- Không phát hiện']),
      '',
      '**Link/file đính kèm:**',
      ...(d.links.length ? d.links.map((l) => `- ${l.source} → ${l.target || '(không tìm thấy)'}: ${l.status}`) : ['- Không phát hiện link/file trong nội dung chính']),
      '',
    ]) : ['Không có cặp trang nào được so sánh.']),
    '',
    '## Danh sách trang không ghép được cặp',
    ...(unpairedSource.length || unpairedTarget.length
      ? [
          ...unpairedSource.map((u) => `- Source only: ${u}`),
          ...unpairedTarget.map((u) => `- Target only: ${u}`),
        ]
      : ['Không có']),
    '',
    '## Lỗi kỹ thuật',
    ...(errors.length ? errors.map((e) => `- ${e}`) : ['Không có']),
  ].join('\n');

  fs.writeFileSync(path.join(process.cwd(), 'CONTENT_COMPARISON_REPORT.md'), report, 'utf8');
  console.log(`Hoàn tất. Source=${sourceUrls.length}, Target=${targetUrls.length}, Pairs=${pairs.length}`);
}

main().catch((error) => {
  fs.writeFileSync(path.join(process.cwd(), 'page_pairs.csv'), 'source_url,target_url,match_confidence\n', 'utf8');
  fs.writeFileSync(
    path.join(process.cwd(), 'CONTENT_COMPARISON_REPORT.md'),
    [
      '# Báo cáo so sánh nội dung',
      `- Site gốc: ${SOURCE_ORIGIN}`,
      `- Site đích: ${TARGET_ORIGIN}`,
      '- Tổng số cặp trang đã so sánh: 0',
      '',
      '## Tổng quan',
      `Không thể crawl bằng Playwright trong môi trường hiện tại: ${error.message}`,
      '',
      '## Chi tiết từng trang',
      'Không có cặp trang nào được so sánh.',
      '',
      '## Danh sách trang không ghép được cặp',
      'Không có dữ liệu do crawl bị chặn.',
      '',
      '## Lỗi kỹ thuật',
      `- ${error.stack || error.message}`,
    ].join('\n'),
    'utf8'
  );
  console.error(error);
  process.exitCode = 1;
});
