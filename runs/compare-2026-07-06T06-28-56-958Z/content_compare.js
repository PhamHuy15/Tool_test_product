const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SOURCE_ORIGIN = 'https://afd-dortmund.de';
const TARGET_ORIGIN = 'https://afd-dortmund.devalternita.de';
const SOURCE_DOMAIN = 'afd-dortmund.de';
const TARGET_DOMAIN = 'afd-dortmund.devalternita.de';
const DELAY_MS = 1300;
const MAX_CRAWL_PAGES = 500;
const FETCH_TIMEOUT_MS = 20000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizePathname(url) {
  try {
    const u = new URL(url);
    let p = decodeURI(u.pathname || '/');
    p = p.replace(/\/+/g, '/');
    if (p.length > 1) p = p.replace(/\/$/, '');
    return p || '/';
  } catch {
    return '';
  }
}

function normalizeUrlForVisit(url) {
  const u = new URL(url);
  u.hash = '';
  const removable = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  removable.forEach((k) => u.searchParams.delete(k));
  return u.toString().replace(/\/$/, u.pathname === '/' ? '/' : '');
}

function cleanSitemapLoc(value) {
  return (value || '')
    .replace(/^<!\[CDATA\[/i, '')
    .replace(/\]\]>$/i, '')
    .replace(/&amp;/g, '&')
    .trim();
}

function isLikelyPage(url) {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname).toLowerCase();
    if (!ext) return true;
    return ['.html', '.htm', '.php', '.asp', '.aspx'].includes(ext);
  } catch {
    return false;
  }
}

function isInternal(url, origin) {
  try {
    const u = new URL(url);
    return u.origin === origin;
  } catch {
    return false;
  }
}

function normalizeText(text) {
  return (text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
}

function chunkText(text) {
  return (text || '')
    .split(/\n+/)
    .map((s) => normalizeText(s))
    .filter((s) => s.length >= 35);
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function mdEscape(text) {
  return String(text || '').replace(/\|/g, '\\|');
}

function truncate(text, max = 260) {
  const clean = normalizeText(text);
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

function tokenSet(text) {
  return new Set(
    normalizeText(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}@._/-]+/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
}

function jaccard(a, b) {
  const as = tokenSet(a);
  const bs = tokenSet(b);
  if (!as.size && !bs.size) return 1;
  let inter = 0;
  for (const t of as) if (bs.has(t)) inter += 1;
  return inter / (as.size + bs.size - inter);
}

function wordSimilarity(a, b) {
  const aw = normalizeText(a).toLowerCase().split(/\s+/).filter(Boolean);
  const bw = normalizeText(b).toLowerCase().split(/\s+/).filter(Boolean);
  if (!aw.length && !bw.length) return 1;
  if (!aw.length || !bw.length) return 0;
  const m = aw.length;
  const n = bw.length;
  const prev = new Array(n + 1).fill(0);
  const curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      curr[j] = aw[i - 1] === bw[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return (2 * prev[n]) / (m + n);
}

function bestChunkMatch(chunk, candidates) {
  let best = 0;
  let bestText = '';
  for (const c of candidates) {
    const score = jaccard(chunk, c);
    if (score > best) {
      best = score;
      bestText = c;
    }
  }
  return { score: best, text: bestText };
}

function normalizeSourceLink(link) {
  if (!link) return '';
  if (link.startsWith('mailto:')) {
    return link.replace(new RegExp(`@${SOURCE_DOMAIN.replace(/\./g, '\\.')}`, 'gi'), `@${TARGET_DOMAIN}`);
  }
  try {
    const u = new URL(link);
    if (u.hostname === SOURCE_DOMAIN || u.hostname.endsWith(`.${SOURCE_DOMAIN}`)) {
      u.hostname = u.hostname.replace(SOURCE_DOMAIN, TARGET_DOMAIN);
    }
    return u.toString();
  } catch {
    return link.replace(new RegExp(SOURCE_DOMAIN.replace(/\./g, '\\.'), 'gi'), TARGET_DOMAIN);
  }
}

function linkComparableKey(link) {
  if (!link) return '';
  if (link.startsWith('mailto:')) return link.toLowerCase().replace(SOURCE_DOMAIN, TARGET_DOMAIN);
  try {
    const u = new URL(link);
    return decodeURI(u.pathname).replace(/\/$/, '').toLowerCase();
  } catch {
    return link.toLowerCase();
  }
}

function linkTailKey(link) {
  const key = linkComparableKey(link);
  const parts = key.split('/').filter(Boolean);
  return parts.slice(-2).join('/') || key;
}

function linksEquivalent(sourceNorm, targetLink) {
  const s = linkComparableKey(sourceNorm);
  const t = linkComparableKey(targetLink);
  if (!s || !t) return false;
  return s === t || linkTailKey(sourceNorm) === linkTailKey(targetLink);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function sitemapUrls(origin) {
  const robots = await fetchText(`${origin}/robots.txt`);
  const candidates = new Set();
  for (const line of robots.split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap:\s*(\S+)/i);
    if (m) candidates.add(m[1].trim());
  }
  candidates.add(`${origin}/sitemap.xml`);
  candidates.add(`${origin}/sitemap_index.xml`);
  candidates.add(`${origin}/wp-sitemap.xml`);

  const pageUrls = new Set();
  const seenSitemaps = new Set();
  async function parseSitemap(smUrl) {
    if (seenSitemaps.has(smUrl)) return;
    seenSitemaps.add(smUrl);
    await sleep(DELAY_MS);
    const xml = await fetchText(smUrl);
    if (!xml) return;
    const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/gi)].map((m) => cleanSitemapLoc(m[1]));
    for (const loc of locs) {
      if (/sitemap.*\.xml(?:\?.*)?$/i.test(new URL(loc).pathname)) {
        if (/(elementor|author|category|post_tag|attachment|wp-sitemap-users)/i.test(loc)) continue;
        await parseSitemap(loc);
      } else if (isInternal(loc, origin) && isLikelyPage(loc)) {
        pageUrls.add(normalizeUrlForVisit(loc));
      }
    }
  }
  for (const c of candidates) await parseSitemap(c);
  return [...pageUrls];
}

async function extractPage(page, url, origin) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(250);
  return await page.evaluate((originInPage) => {
    const clone = document.body.cloneNode(true);
    const removeSelectors = [
      'script',
      'style',
      'noscript',
      'svg',
      'canvas',
      'iframe',
      'header',
      'footer',
      'nav',
      '[role="navigation"]',
      '#wpadminbar',
      '.cookie',
      '.cookies',
      '.cookie-banner',
      '.cmplz-cookiebanner',
      '.menu',
      '.navbar',
      '.site-header',
      '.site-footer',
      '.sidebar',
      '.widget',
      '.breadcrumb',
      '.breadcrumbs',
      '.skip-link'
    ];
    clone.querySelectorAll(removeSelectors.join(',')).forEach((el) => el.remove());
    clone.querySelectorAll('*').forEach((el) => {
      const style = window.getComputedStyle(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) el.remove();
    });

    const main =
      clone.querySelector('main') ||
      clone.querySelector('article') ||
      clone.querySelector('.entry-content') ||
      clone.querySelector('.page-content') ||
      clone.querySelector('.content') ||
      clone;

    const links = [...main.querySelectorAll('a[href]')]
      .map((a) => {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#') || /^javascript:/i.test(href) || /^tel:/i.test(href)) return null;
        if (/^mailto:/i.test(href)) return href.trim();
        try {
          return new URL(href, originInPage).toString();
        } catch {
          return href.trim();
        }
      })
      .filter(Boolean);

    const title =
      document.querySelector('h1')?.innerText?.trim() ||
      document.querySelector('title')?.innerText?.trim() ||
      document.title ||
      '';

    const paragraphs = [...main.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,td,th')]
      .map((el) => el.innerText || '')
      .filter((t) => t.trim().length > 0);

    return {
      title,
      text: main.innerText || '',
      paragraphs,
      links: [...new Set(links)]
    };
  }, origin);
}

async function discoverSite(browser, origin) {
  const fromSitemap = await sitemapUrls(origin);
  const shouldCrawlLinks = fromSitemap.length === 0;
  console.log(`Khám phá ${origin}: ${fromSitemap.length} URL từ sitemap${shouldCrawlLinks ? ', sẽ crawl link nội bộ' : ''}.`);
  if (!shouldCrawlLinks) {
    const urls = new Set(fromSitemap);
    urls.add(origin);
    const byPath = new Map();
    for (const url of urls) {
      const pathname = normalizePathname(url);
      if (!byPath.has(pathname)) byPath.set(pathname, { url, path: pathname, title: '', text: '', paragraphs: [], links: [] });
    }
    return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  }
  const pages = new Map();
  const queue = [...fromSitemap, origin];
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  while (queue.length && pages.size < MAX_CRAWL_PAGES) {
    const url = normalizeUrlForVisit(queue.shift());
    if (pages.has(normalizePathname(url)) || !isInternal(url, origin) || !isLikelyPage(url)) continue;
    try {
      await sleep(DELAY_MS);
      if ((pages.size + 1) % 10 === 0 || pages.size === 0) console.log(`Đang đọc trang ${pages.size + 1}/${queue.length + pages.size}: ${url}`);
      const data = await extractPage(page, url, origin);
      const pathname = normalizePathname(url);
      pages.set(pathname, { url, path: pathname, title: normalizeText(data.title), ...data });
      if (shouldCrawlLinks) {
        const discovered = await page.$$eval('a[href]', (anchors, originInPage) =>
          anchors
            .map((a) => a.href)
            .filter((href) => {
              try {
                const u = new URL(href);
                if (u.origin !== originInPage) return false;
                const ext = u.pathname.split('.').pop().toLowerCase();
                return !u.hash && (!u.pathname.includes('.') || ['html', 'htm', 'php'].includes(ext));
              } catch {
                return false;
              }
            }), origin);
        for (const link of discovered) {
          const clean = normalizeUrlForVisit(link);
          const p = normalizePathname(clean);
          if (!pages.has(p) && queue.length + pages.size < MAX_CRAWL_PAGES) queue.push(clean);
        }
      }
    } catch (error) {
      const pathname = normalizePathname(url);
      pages.set(pathname, { url, path: pathname, title: '', text: '', paragraphs: [], links: [], error: error.message });
    }
  }
  await context.close();
  return [...pages.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function pairPages(sourcePages, targetPages) {
  const targetByPath = new Map(targetPages.map((p) => [p.path, p]));
  const used = new Set();
  const pairs = [];
  const unmatchedSource = [];

  for (const s of sourcePages) {
    const exact = targetByPath.get(s.path);
    if (exact) {
      pairs.push({ source: s, target: exact, confidence: 'exact_path' });
      used.add(exact.path);
    } else {
      unmatchedSource.push(s);
    }
  }

  const stillUnmatched = [];
  for (const s of unmatchedSource) {
    let best = null;
    let bestScore = 0;
    for (const t of targetPages) {
      if (used.has(t.path)) continue;
      const score = Math.max(jaccard(s.title, t.title), jaccard(s.path.replace(/\W+/g, ' '), t.path.replace(/\W+/g, ' ')));
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (best && bestScore >= 0.65) {
      pairs.push({ source: s, target: best, confidence: `fuzzy_${bestScore.toFixed(2)}` });
      used.add(best.path);
    } else {
      stillUnmatched.push(s);
    }
  }

  const unmatchedTarget = targetPages.filter((t) => !used.has(t.path));
  pairs.sort((a, b) => a.source.path.localeCompare(b.source.path));
  return { pairs, unmatchedSource: stillUnmatched, unmatchedTarget };
}

function comparePair(source, target) {
  const sourceText = normalizeText(source.text);
  const targetText = normalizeText(target.text);
  const similarity = wordSimilarity(sourceText, targetText);
  const sourceChunks = chunkText(source.paragraphs.join('\n') || source.text);
  const targetChunks = chunkText(target.paragraphs.join('\n') || target.text);

  const missing = [];
  const divergent = [];
  for (const sc of sourceChunks) {
    const best = bestChunkMatch(sc, targetChunks);
    if (best.score < 0.38) missing.push(sc);
    else if (best.score < 0.68 && normalizeText(sc) !== normalizeText(best.text)) divergent.push({ source: sc, target: best.text });
  }

  const added = [];
  for (const tc of targetChunks) {
    const best = bestChunkMatch(tc, sourceChunks);
    if (best.score < 0.38) added.push(tc);
  }

  const targetLinks = target.links || [];
  const linkResults = (source.links || []).map((sourceLink) => {
    const normalized = normalizeSourceLink(sourceLink);
    const found = targetLinks.find((tl) => linksEquivalent(normalized, tl));
    return { sourceLink, normalized, targetLink: found || '', status: found ? 'Đã chuyển đổi đúng' : 'Thiếu' };
  });

  let status = 'OK';
  if (missing.length || linkResults.some((l) => l.status === 'Thiếu')) status = 'Thiếu nội dung';
  else if (divergent.length) status = 'Sai nội dung';
  else if (similarity < 0.86 || added.length) status = 'Cần kiểm tra';

  return {
    similarity,
    status,
    missing: missing.slice(0, 8),
    divergent: divergent.slice(0, 8),
    added: added.slice(0, 8),
    linkResults
  };
}

function writePagePairs(pairs) {
  const rows = [['source_url', 'target_url', 'match_confidence']];
  for (const p of pairs) rows.push([p.source.url, p.target.url, p.confidence]);
  fs.writeFileSync('page_pairs.csv', rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'utf8');
}

function writeReport(pairs, results, unmatchedSource, unmatchedTarget, errors) {
  const lines = [];
  lines.push('# Báo cáo so sánh nội dung');
  lines.push(`- Site gốc: ${SOURCE_ORIGIN}`);
  lines.push(`- Site đích: ${TARGET_ORIGIN}`);
  lines.push(`- Tổng số cặp trang đã so sánh: ${results.length}`);
  lines.push('');
  lines.push('## Tổng quan');
  const counts = results.reduce((acc, r) => {
    acc[r.result.status] = (acc[r.result.status] || 0) + 1;
    return acc;
  }, {});
  lines.push(
    `Đã phát hiện ${pairs.length} cặp trang. Trạng thái: ${Object.entries(counts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ') || 'không có dữ liệu'}. Trang không ghép được: gốc ${unmatchedSource.length}, đích ${unmatchedTarget.length}.`
  );
  if (errors.length) lines.push(`Có ${errors.length} cặp gặp lỗi kỹ thuật khi so sánh; chi tiết nằm trong từng mục/lỗi cuối báo cáo.`);
  lines.push('');
  lines.push('## Chi tiết từng trang');
  for (const { pair, result, error } of results) {
    lines.push(`### ${pair.source.url} ↔ ${pair.target.url}`);
    if (error) {
      lines.push('- Tỷ lệ khớp nội dung: 0%');
      lines.push('- Trạng thái: Cần kiểm tra');
      lines.push('');
      lines.push('**Nội dung thiếu:**');
      lines.push(`- Lỗi kỹ thuật khi so sánh: ${error}`);
      lines.push('');
      continue;
    }
    lines.push(`- Tỷ lệ khớp nội dung: ${(result.similarity * 100).toFixed(1)}%`);
    lines.push(`- Trạng thái: ${result.status}`);
    lines.push('');
    lines.push('**Nội dung thiếu:**');
    if (result.missing.length) result.missing.forEach((m) => lines.push(`- ${truncate(m)}`));
    else lines.push('- Không phát hiện');
    lines.push('');
    lines.push('**Nội dung sai lệch:**');
    if (result.divergent.length) {
      result.divergent.forEach((d) => lines.push(`- Gốc: "${truncate(d.source, 160)}" → Đích: "${truncate(d.target, 160)}"`));
    } else {
      lines.push('- Không phát hiện');
    }
    lines.push('');
    lines.push('**Nội dung mới thêm (không phải lỗi):**');
    if (result.added.length) result.added.forEach((a) => lines.push(`- ${truncate(a)}`));
    else lines.push('- Không phát hiện');
    lines.push('');
    lines.push('**Link/file đính kèm:**');
    if (result.linkResults.length) {
      result.linkResults.forEach((l) => {
        const target = l.targetLink || l.normalized;
        lines.push(`- ${mdEscape(l.sourceLink)} → ${mdEscape(target)}: ${l.status}`);
      });
    } else {
      lines.push('- Không có link/file trong nội dung chính');
    }
    lines.push('');
  }

  lines.push('## Danh sách trang không ghép được cặp');
  lines.push('### Trang gốc không ghép được');
  if (unmatchedSource.length) unmatchedSource.forEach((p) => lines.push(`- ${p.url}`));
  else lines.push('- Không có');
  lines.push('');
  lines.push('### Trang đích không ghép được');
  if (unmatchedTarget.length) unmatchedTarget.forEach((p) => lines.push(`- ${p.url}`));
  else lines.push('- Không có');
  if (errors.length) {
    lines.push('');
    lines.push('## Lỗi kỹ thuật');
    errors.forEach((e) => lines.push(`- ${e.source} ↔ ${e.target}: ${e.error}`));
  }
  fs.writeFileSync('CONTENT_COMPARISON_REPORT.md', lines.join('\n'), 'utf8');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    console.log('Giai đoạn 1: khám phá danh sách trang...');
    const [sourcePages, targetPages] = await Promise.all([discoverSite(browser, SOURCE_ORIGIN), discoverSite(browser, TARGET_ORIGIN)]);
    const { pairs, unmatchedSource, unmatchedTarget } = pairPages(sourcePages, targetPages);
    writePagePairs(pairs);
    console.log(`Giai đoạn 1 hoàn tất: source=${sourcePages.length}, target=${targetPages.length}, pairs=${pairs.length}, unmatched_source=${unmatchedSource.length}, unmatched_target=${unmatchedTarget.length}`);
    console.log('Đã ghi page_pairs.csv. Tự động tiếp tục Giai đoạn 2 theo xác nhận từ giao diện.');

    const results = [];
    const errors = [];
    const sourceContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const targetContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const blockHeavyAssets = (route) => {
      const request = route.request();
      if (['image', 'media', 'font'].includes(request.resourceType())) return route.abort();
      return route.continue();
    };
    await sourceContext.route('**/*', blockHeavyAssets);
    await targetContext.route('**/*', blockHeavyAssets);
    const sourcePage = await sourceContext.newPage();
    const targetPage = await targetContext.newPage();

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      console.log(`Đang so sánh cặp ${i + 1}/${pairs.length}: ${pair.source.path}`);
      try {
        await sleep(DELAY_MS);
        const [sourceFresh, targetFresh] = await Promise.all([
          extractPage(sourcePage, pair.source.url, SOURCE_ORIGIN),
          extractPage(targetPage, pair.target.url, TARGET_ORIGIN)
        ]);
        const result = comparePair({ ...pair.source, ...sourceFresh }, { ...pair.target, ...targetFresh });
        results.push({ pair, result });
      } catch (error) {
        errors.push({ source: pair.source.url, target: pair.target.url, error: error.message });
        results.push({ pair, error: error.message, result: { status: 'Cần kiểm tra' } });
      }
      writeReport(pairs, results, unmatchedSource, unmatchedTarget, errors);
    }
    await sourceContext.close();
    await targetContext.close();
    writeReport(pairs, results, unmatchedSource, unmatchedTarget, errors);
    console.log(`Hoàn tất. Đã ghi CONTENT_COMPARISON_REPORT.md với ${results.length} cặp đã so sánh.`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
