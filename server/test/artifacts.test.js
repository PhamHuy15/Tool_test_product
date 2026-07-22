import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvRows, validateManualTestCasesCsv, validatePagePairsCsv } from '../artifacts.js';

test('parses quoted CSV fields and newlines', () => {
  const rows = parseCsvRows('a,b\n"one, two","line 1\nline 2"\n');
  assert.deepEqual(rows, [['a', 'b'], ['one, two', 'line 1\nline 2']]);
});

test('validates manual test case CSV shape', () => {
  const csv = 'Test Case ID,Component,Title,Preconditions,Steps,Expected Result,Severity,Priority\nTC_001,Home,Title,None,Open page,Page loads,High,P1\n';
  assert.equal(validateManualTestCasesCsv(csv), null);
  assert.notEqual(validateManualTestCasesCsv('wrong,header\n'), null);
});

test('validates page pair CSV shape', () => {
  const csv = 'source_url,target_url,match_confidence\nhttps://a.test/,https://b.test/,exact_path\n';
  assert.equal(validatePagePairsCsv(csv), null);
});
