import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl } from '../siteCrawler.js';

test('normalizes fragments and tracking query parameters', () => {
  assert.equal(normalizeUrl('https://example.com/about/?utm_source=x#team'), 'https://example.com/about');
  assert.equal(normalizeUrl('/contact#form', 'https://example.com/'), 'https://example.com/contact');
});
