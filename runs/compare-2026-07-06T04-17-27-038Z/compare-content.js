const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const { chromium } = require('playwright');
const Diff = require('diff');

const SOURCE_BASE = 'https://afd-dortmund.de';
const TARGET_BASE = 'https://afd-dortmund.devalternita.de';
const SOURCE_DOMAIN = 'afd-dortmund.de';
const TARGET_DOMAIN = 'afd-dortmund.devalternita.de';
const OUT_DIR = process.cwd();
const DELAY_MS = 1200;
const MAX_CRAWL_PAGES = 500;

const parser = new XMLParser({ ignoreAttributes: false });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeUrl(raw, base) {
  try {
    const u = new URL(raw, base);
    u.hash = '';
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.pathname.endsWith('/index.html')) {
      u.pathname = u.pathname.replace(/\/index\.html$/, '/');
    }
    return u.toString();
  } catch {
    return null;
  }
}

function urlPath(raw) {
  try {
    const u = new URL(raw);
    let p = decodeURIComponent(u.pathname || '/').replace(/\/+$/, '');
    if (!p) p = '/';
    return p;
  } catch {
    return raw;
  }
}

function isHtmlPageUrl(raw, domain) {
  try {
    const u = new URL(raw);
    if (u.hostname !== domain) return false;
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const p = u.pathname.toLowerCase();
    return !/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|doc|docx|xls|xlsx|ppt|pptx|mp4|mp3|css|js|ico|xml|txt)$/i.test(p);
  } catch {
    return false;
  }
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function collectLocs(obj, locs = []) {
  if (!obj || typeof obj !== 'object') return locs;
  if (typeof obj.loc === 'string') locs.push(obj.loc.trim());
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) value.forEach((v) => collectLocs(v, locs));
    else if (value && typeof value === 'object') collectLocs(value, locs);
  }
  return locs;
}

async function fetchText(url, browser) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (!res || !res.ok()) throw new Error(res ? `${res.status()} ${res.statusText()}` : 'no response');
    return await res.text();
  } finally {
    await ctx.close();
  }
}

async function discoverSitemaps(base, browser) {
  const candidates = [];
  try {
    const robots = await fetchText(`${base}/robots.txt`, browser);
    for (const line of robots.split(/\r?\n/)) {
      const m = line.match(/^\s*Sitemap:\s*(\S+)/i);
      if (m) candidates.push(m[1]);
    }
  } catch {}
  candidates.push(`${base}/sitemap.xml`, `${base}/wp-sitemap.xml`, `${base}/page-sitemap.xml`, `${base}/post-sitemap.xml`);
  return unique(candidates.map((u) => normalizeUrl(u, base)));
}

async function sitemapUrls(base, domain, browser) {
  const queue = await discoverSitemaps(base, browser);
  const seenMaps = new Set();
  const pages = new Set();
  while (queue.length) {
    const sm = queue.shift();
    if (!sm || seenMaps.has(sm)) continue;
    seenMaps.add(sm);
    try {
      const xml = await fetchText(sm, browser);
      const obj = parser.parse(xml);
      const locs = collectLocs(obj);
      for (const loc of locs) {
        const u = normalizeUrl(loc, base);
        if (!u) continue;
        if (/sitemap/i.test(new URL(u).pathname) && u.endsWith('.xml') && !seenMaps.has(u)) {
          queue.push(u);
        } else if (isHtmlPageUrl(u, domain)) {
          pages.add(u);
        }
      }
      await sleep(300);
    } catch {}
  }
  return [...pages];
}

async function crawlWithBrowser(base, domain, browser) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const queue = [base];
  const seen = new Set();
  const pages = new Set();
  try {
    while (queue.length && seen.size < MAX_CRAWL_PAGES) {
      const current = queue.shift();
      if (!current || seen.has(current) || !isHtmlPageUrl(current, domain)) continue;
      seen.add(current);
      try {
        console.log(`Crawl menu ${domain}: ${urlPath(current)}`);
        await page.goto(current, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(500);
        const links = await page.$$eval('a[href]', (els) => els.map((a) => a.href));
        pages.add(page.url().split('#')[0]);
        for (const href of links) {
          const u = normalizeUrl(href, base);
          if (u && isHtmlPageUrl(u, domain) && !seen.has(u) && !queue.includes(u)) queue.push(u);
        }
        await sleep(DELAY_MS);
      } catch (e) {
        pages.add(current);
      }
    }
  } finally {
    await ctx.close();
  }
  return [...pages];
}

async function discoverSite(base, domain) {
  const browser = await chromium.launch({ headless: true });
  let fromSitemap = [];
  let fromBrowser = [];
  try {
    fromSitemap = await sitemapUrls(base, domain, browser);
    console.log(`Sitemap ${domain}: ${fromSitemap.length} URL`);
    fromBrowser = await crawlWithBrowser(base, domain, browser);
    console.log(`Crawl menu ${domain}: ${fromBrowser.length} URL`);
  } finally {
    await browser.close();
  }
  const urls = unique([...fromSitemap, ...fromBrowser])
    .filter((u) => isHtmlPageUrl(u, domain))
    .sort((a, b) => urlPath(a).localeCompare(urlPath(b)));
  return urls;
}

function slugTokens(p) {
  return p.toLowerCase().replace(/^\//, '').split(/[\/\-_]+/).filter(Boolean);
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  const union = new Set([...A, ...B]);
  if (!union.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / union.size;
}

function pairPages(sourceUrls, targetUrls) {
  const targetByPath = new Map(targetUrls.map((u) => [urlPath(u), u]));
  const usedTargets = new Set();
  const pairs = [];
  const unmatchedSource = [];
  for (const src of sourceUrls) {
    const p = urlPath(src);
    if (targetByPath.has(p)) {
      const tgt = targetByPath.get(p);
      usedTargets.add(tgt);
      pairs.push({ source_url: src, target_url: tgt, match_confidence: 'exact_path' });
    } else {
      unmatchedSource.push(src);
    }
  }
  const stillUnmatchedSource = [];
  for (const src of unmatchedSource) {
    const sp = urlPath(src);
    let best = null;
    for (const tgt of targetUrls) {
      if (usedTargets.has(tgt)) continue;
      const score = jaccard(slugTokens(sp), slugTokens(urlPath(tgt)));
      if (!best || score > best.score) best = { tgt, score };
    }
    if (best && best.score >= 0.6) {
      usedTargets.add(best.tgt);
      pairs.push({ source_url: src, target_url: best.tgt, match_confidence: `slug_similar_${best.score.toFixed(2)}` });
    } else {
      stillUnmatchedSource.push(src);
    }
  }
  const unmatchedTarget = targetUrls.filter((u) => !usedTargets.has(u));
  pairs.sort((a, b) => urlPath(a.source_url).localeCompare(urlPath(b.source_url)));
  return { pairs, unmatchedSource: stillUnmatchedSource, unmatchedTarget };
}

function csvEscape(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalLink(raw, baseForRelative) {
  if (!raw) return null;
  if (raw.startsWith('mailto:')) return raw.toLowerCase();
  if (raw.startsWith('tel:')) return raw.toLowerCase();
  try {
    const u = new URL(raw, baseForRelative);
    u.hash = '';
    return u.toString();
  } catch {
    return raw;
  }
}

function normalizeSourceLinkForTarget(link) {
  if (!link) return link;
  return link.replaceAll(SOURCE_DOMAIN, TARGET_DOMAIN).replaceAll(`@${SOURCE_DOMAIN}`, `@${TARGET_DOMAIN}`);
}

function linkKey(link) {
  if (!link) return '';
  if (link.startsWith('mailto:')) return link.split('@').pop();
  try {
    const u = new URL(link);
    const parts = decodeURIComponent(u.pathname).split('/').filter(Boolean);
    return parts.slice(-2).join('/').toLowerCase() || u.hostname.toLowerCase();
  } catch {
    return link.toLowerCase();
  }
}

async function extractMain(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(900);
  return await page.evaluate(() => {
    const hiddenSelectors = [
      'script', 'style', 'noscript', 'svg', 'canvas',
      'header', 'footer', 'nav', '[role="navigation"]',
      '#wpadminbar', '.admin-bar', '.cookie', '.cookies', '.cookie-banner',
      '.cky-consent-container', '.cmplz-cookiebanner', '.menu', '.navbar',
      '.site-header', '.site-footer', '.elementor-location-header',
      '.elementor-location-footer', '.sidebar', 'aside'
    ];
    const clone = document.body.cloneNode(true);
    for (const sel of hiddenSelectors) {
      clone.querySelectorAll(sel).forEach((n) => n.remove());
    }
    const candidates = [
      'main',
      'article',
      '.entry-content',
      '.page-content',
      '.post-content',
      '.elementor-location-single',
      '.elementor',
      '#content',
      '.content',
      clone
    ];
    let best = clone;
    let bestLen = 0;
    for (const sel of candidates) {
      const nodes = typeof sel === 'string' ? [...clone.querySelectorAll(sel)] : [sel];
      for (const n of nodes) {
        const text = (n.innerText || '').replace(/\s+/g, ' ').trim();
        if (text.length > bestLen) {
          best = n;
          bestLen = text.length;
        }
      }
    }
    const links = [...best.querySelectorAll('a[href]')].map((a) => ({
      href: a.getAttribute('href'),
      abs: a.href,
      text: (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()
    }));
    return {
      title: document.title || '',
      text: (best.innerText || '').replace(/\s+/g, ' ').trim(),
      links
    };
  });
}

function sentenceChunks(text) {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+|\s+[|]\s+|\n+/)
    .map((s) => normalizeText(s))
    .filter((s) => s.length >= 30);
}

function importantDiffs(sourceText, targetText) {
  const changes = Diff.diffWords(normalizeText(sourceText), normalizeText(targetText));
  const missing = [];
  const added = [];
  let missBuf = '', addBuf = '';
  for (const c of changes) {
    if (c.removed) missBuf += c.value;
    else if (c.added) addBuf += c.value;
    else {
      if (normalizeText(missBuf).length >= 35) missing.push(normalizeText(missBuf).slice(0, 350));
      if (normalizeText(addBuf).length >= 35) added.push(normalizeText(addBuf).slice(0, 350));
      missBuf = ''; addBuf = '';
    }
  }
  if (normalizeText(missBuf).length >= 35) missing.push(normalizeText(missBuf).slice(0, 350));
  if (normalizeText(addBuf).length >= 35) added.push(normalizeText(addBuf).slice(0, 350));

  const srcChunks = sentenceChunks(sourceText);
  const tgtLower = normalizeText(targetText).toLowerCase();
  const missingChunks = srcChunks
    .filter((s) => !tgtLower.includes(s.toLowerCase()) && s.length > 50)
    .slice(0, 8);
  return {
    missing: unique([...missingChunks, ...missing]).slice(0, 10),
    added: unique(added).slice(0, 8)
  };
}

function matchRatio(a, b) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);
  if (!aa && !bb) return 100;
  const changes = Diff.diffWords(aa, bb);
  let same = 0, total = 0;
  for (const c of changes) {
    const n = normalizeText(c.value).length;
    if (!n) continue;
    total += n;
    if (!c.added && !c.removed) same += n;
  }
  return total ? Math.round((same / total) * 1000) / 10 : 0;
}

function compareLinks(sourceLinks, targetLinks) {
  const targetCanon = targetLinks.map((l) => canonicalLink(l.abs || l.href, TARGET_BASE)).filter(Boolean);
  const targetKeys = new Set(targetCanon.map(linkKey));
  const targetLower = new Set(targetCanon.map((l) => l.toLowerCase()));
  const out = [];
  for (const l of sourceLinks) {
    const src = canonicalLink(l.abs || l.href, SOURCE_BASE);
    if (!src) continue;
    const expected = normalizeSourceLinkForTarget(src);
    const foundExact = targetLower.has(expected.toLowerCase());
    const key = linkKey(expected);
    const foundByKey = key && targetKeys.has(key);
    const match = foundExact || foundByKey;
    const targetMatch = match
      ? (targetCanon.find((t) => t.toLowerCase() === expected.toLowerCase()) || targetCanon.find((t) => linkKey(t) === key) || expected)
      : '';
    out.push({
      source: src,
      expected,
      target: targetMatch,
      status: match ? 'Đã chuyển đổi đúng' : 'Thiếu'
    });
  }
  const seen = new Set();
  return out.filter((x) => {
    const k = `${x.source}|${x.expected}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function statusFor(ratio, missing, badLinks) {
  if (badLinks > 0) return ratio < 85 || missing.length ? 'Thiếu nội dung' : 'Cần kiểm tra';
  if (ratio >= 92 && missing.length === 0) return 'OK';
  if (ratio >= 75) return 'Cần kiểm tra';
  return 'Thiếu nội dung';
}

function mdEscape(s) {
  return String(s || '').replace(/\r?\n/g, ' ').trim();
}

async function main() {
  console.log('Giai đoạn 1: khám phá danh sách trang');
  const [sourceUrls, targetUrls] = await Promise.all([
    discoverSite(SOURCE_BASE, SOURCE_DOMAIN),
    discoverSite(TARGET_BASE, TARGET_DOMAIN)
  ]);
  fs.writeFileSync(path.join(OUT_DIR, 'source_pages.json'), JSON.stringify(sourceUrls, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'target_pages.json'), JSON.stringify(targetUrls, null, 2));
  const paired = pairPages(sourceUrls, targetUrls);
  const csv = [
    'source_url,target_url,match_confidence',
    ...paired.pairs.map((p) => [p.source_url, p.target_url, p.match_confidence].map(csvEscape).join(','))
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'page_pairs.csv'), csv);
  fs.writeFileSync(path.join(OUT_DIR, 'unmatched_pages.json'), JSON.stringify({
    source: paired.unmatchedSource,
    target: paired.unmatchedTarget
  }, null, 2));
  console.log(`Site gốc: ${sourceUrls.length} trang`);
  console.log(`Site đích: ${targetUrls.length} trang`);
  console.log(`Ghép được: ${paired.pairs.length} cặp`);
  console.log(`Không ghép được: nguồn ${paired.unmatchedSource.length}, đích ${paired.unmatchedTarget.length}`);
  console.log('Giai đoạn 2: so sánh nội dung từng cặp');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const sourcePage = await ctx.newPage();
  const targetPage = await ctx.newPage();
  const results = [];
  const errors = [];
  try {
    for (let i = 0; i < paired.pairs.length; i++) {
      const pair = paired.pairs[i];
      console.log(`Đang so sánh cặp ${i + 1}/${paired.pairs.length}: ${urlPath(pair.source_url)}`);
      try {
        const src = await extractMain(sourcePage, pair.source_url);
        await sleep(DELAY_MS);
        const tgt = await extractMain(targetPage, pair.target_url);
        await sleep(DELAY_MS);
        const ratio = matchRatio(src.text, tgt.text);
        const diffs = importantDiffs(src.text, tgt.text);
        const links = compareLinks(src.links, tgt.links);
        const badLinks = links.filter((l) => l.status === 'Thiếu').length;
        results.push({
          ...pair,
          source_title: src.title,
          target_title: tgt.title,
          ratio,
          status: statusFor(ratio, diffs.missing, badLinks),
          missing: diffs.missing,
          added: diffs.added,
          changed: [],
          links,
          source_text_length: normalizeText(src.text).length,
          target_text_length: normalizeText(tgt.text).length
        });
      } catch (e) {
        errors.push({ ...pair, error: e.message });
        results.push({
          ...pair,
          ratio: 0,
          status: 'Cần kiểm tra',
          missing: [`Lỗi khi trích xuất/so sánh: ${e.message}`],
          added: [],
          changed: [],
          links: []
        });
      }
    }
  } finally {
    await ctx.close();
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT_DIR, 'comparison_results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'comparison_errors.json'), JSON.stringify(errors, null, 2));

  const ok = results.filter((r) => r.status === 'OK').length;
  const needs = results.filter((r) => r.status === 'Cần kiểm tra').length;
  const missing = results.filter((r) => r.status === 'Thiếu nội dung').length;
  const avg = results.length ? Math.round(results.reduce((s, r) => s + r.ratio, 0) / results.length * 10) / 10 : 0;
  const report = [];
  report.push('# Báo cáo so sánh nội dung');
  report.push(`- Site gốc: ${SOURCE_BASE}`);
  report.push(`- Site đích: ${TARGET_BASE}`);
  report.push(`- Tổng số cặp trang đã so sánh: ${results.length}`);
  report.push('');
  report.push('## Tổng quan');
  report.push(`Đã phát hiện ${sourceUrls.length} trang ở site gốc và ${targetUrls.length} trang ở site đích. Ghép được ${paired.pairs.length} cặp theo URL path/slug; còn ${paired.unmatchedSource.length} trang nguồn và ${paired.unmatchedTarget.length} trang đích chưa ghép được. Tỷ lệ khớp trung bình: ${avg}%. Trạng thái: ${ok} OK, ${needs} cần kiểm tra, ${missing} thiếu nội dung. Có ${errors.length} cặp lỗi kỹ thuật trong quá trình trích xuất.`);
  report.push('');
  report.push('## Chi tiết từng trang');
  for (const r of results) {
    report.push(`### ${r.source_url} ↔ ${r.target_url}`);
    report.push(`- Tỷ lệ khớp nội dung: ${r.ratio}%`);
    report.push(`- Trạng thái: ${r.status}`);
    report.push('');
    report.push('**Nội dung thiếu:**');
    if (r.missing?.length) r.missing.forEach((m) => report.push(`- ${mdEscape(m)}`));
    else report.push('- Không phát hiện.');
    report.push('');
    report.push('**Nội dung sai lệch:**');
    if (r.changed?.length) r.changed.forEach((c) => report.push(`- Gốc: "${mdEscape(c.source)}" → Đích: "${mdEscape(c.target)}"`));
    else report.push('- Không phát hiện sai lệch ý nghĩa rõ ràng bằng so khớp tự động.');
    report.push('');
    report.push('**Nội dung mới thêm (không phải lỗi):**');
    if (r.added?.length) r.added.forEach((a) => report.push(`- ${mdEscape(a)}`));
    else report.push('- Không phát hiện.');
    report.push('');
    report.push('**Link/file đính kèm:**');
    if (r.links?.length) {
      r.links.forEach((l) => {
        const target = l.target || l.expected;
        report.push(`- ${l.source} → ${target}: ${l.status}`);
      });
    } else {
      report.push('- Không phát hiện link/file trong nội dung chính.');
    }
    report.push('');
  }
  report.push('## Danh sách trang không ghép được cặp');
  report.push('Nguồn không ghép được:');
  if (paired.unmatchedSource.length) paired.unmatchedSource.forEach((u) => report.push(`- ${u}`));
  else report.push('- Không có.');
  report.push('');
  report.push('Đích không ghép được:');
  if (paired.unmatchedTarget.length) paired.unmatchedTarget.forEach((u) => report.push(`- ${u}`));
  else report.push('- Không có.');
  report.push('');
  if (errors.length) {
    report.push('## Lỗi kỹ thuật khi crawl/so sánh');
    errors.forEach((e) => report.push(`- ${e.source_url} ↔ ${e.target_url}: ${e.error}`));
  }
  fs.writeFileSync(path.join(OUT_DIR, 'CONTENT_COMPARISON_REPORT.md'), report.join('\n'), 'utf8');
  console.log('Hoàn tất. Đã ghi CONTENT_COMPARISON_REPORT.md');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
