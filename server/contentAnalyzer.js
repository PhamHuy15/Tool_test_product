export function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function similarity(a, b) {
  const left = new Set(normalizeText(a).split(' ').filter(Boolean));
  const right = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (!left.size && !right.size) return 1;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / Math.max(left.size, right.size, 1);
}

export function pairPages(sourcePages, targetPages) {
  const targetByPath = new Map(targetPages.map((page) => [new URL(page.url).pathname.replace(/\/$/, '') || '/', page]));
  return sourcePages.map((source) => {
    const path = new URL(source.url).pathname.replace(/\/$/, '') || '/';
    const target = targetByPath.get(path);
    return { source, target: target || null, matchConfidence: target ? 'exact_path' : 'missing' };
  });
}

export function analyzePair(source, target) {
  if (!target) return { status: 'missing', similarity: 0, missing: [source.text], added: [], changed: [] };
  const sourceText = normalizeText(source.text);
  const targetText = normalizeText(target.text);
  return {
    status: sourceText === targetText ? 'ok' : 'needs_semantic_review',
    similarity: similarity(sourceText, targetText),
    titleChanged: normalizeText(source.title) !== normalizeText(target.title),
    headingChanged: JSON.stringify(source.headings) !== JSON.stringify(target.headings),
    sourceLinkCount: source.links.length,
    targetLinkCount: target.links.length,
    sourceTextLength: sourceText.length,
    targetTextLength: targetText.length,
  };
}

export function analyzeContent(sourcePages, targetPages) {
  const pairs = pairPages(sourcePages, targetPages).map(({ source, target, matchConfidence }) => ({
    sourceUrl: source.url,
    targetUrl: target?.url || '',
    matchConfidence,
    ...analyzePair(source, target),
  }));
  return { pairs, metrics: { sourcePages: sourcePages.length, targetPages: targetPages.length, paired: pairs.filter((pair) => pair.targetUrl).length, missing: pairs.filter((pair) => !pair.targetUrl).length, review: pairs.filter((pair) => pair.status === 'needs_semantic_review').length } };
}
