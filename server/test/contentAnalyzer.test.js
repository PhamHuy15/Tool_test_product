import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeContent, normalizeText, pairPages, similarity } from '../contentAnalyzer.js';

test('normalizes text and computes token similarity', () => {
  assert.equal(normalizeText('  Hello\n WORLD '), 'hello world');
  assert.equal(similarity('hello world', 'hello world'), 1);
  assert.ok(similarity('hello world', 'hello there') < 1);
});

test('pairs pages by normalized path', () => {
  const result = pairPages([{ url: 'https://source.test/about/', text: 'About' }], [{ url: 'https://target.test/about', text: 'About' }]);
  assert.equal(result[0].target.url, 'https://target.test/about');
  assert.equal(result[0].matchConfidence, 'exact_path');
});

test('returns deterministic comparison metrics', () => {
  const result = analyzeContent(
    [{ url: 'https://source.test/', title: 'Home', headings: [], text: 'same content', links: [] }],
    [{ url: 'https://target.test/', title: 'Home', headings: [], text: 'same content', links: [] }],
  );
  assert.equal(result.metrics.paired, 1);
  assert.equal(result.pairs[0].status, 'ok');
});
