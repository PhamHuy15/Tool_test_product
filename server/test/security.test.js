import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, validatePublicHttpUrl } from '../security.js';

test('blocks private and loopback IPv4 addresses', () => {
  assert.equal(isPrivateIp('127.0.0.1'), true);
  assert.equal(isPrivateIp('10.0.0.1'), true);
  assert.equal(isPrivateIp('192.168.1.10'), true);
  assert.equal(isPrivateIp('8.8.8.8'), false);
});

test('accepts public HTTP URL and rejects unsafe schemes', async () => {
  assert.equal((await validatePublicHttpUrl('https://example.com')).ok, true);
  assert.equal((await validatePublicHttpUrl('file:///c:/secret.txt')).ok, false);
  assert.equal((await validatePublicHttpUrl('http://localhost:4545')).ok, false);
});
