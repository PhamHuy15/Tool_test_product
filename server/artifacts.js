import fs from 'node:fs/promises';

export const ARTIFACT_RULES = {
  'ai-test': {
    required: ['TEST_REPORT.md', 'FIX_PLAN.md'],
    optional: [],
  },
  'manual-test-cases': {
    required: ['MANUAL_TEST_CASES.md', 'manual_test_cases.csv'],
    optional: [],
  },
  'content-comparison': {
    required: ['CONTENT_COMPARISON_REPORT.md', 'page_pairs.csv'],
    optional: [],
  },
};

export async function inspectArtifacts(runDir, kind) {
  const rules = ARTIFACT_RULES[kind];
  if (!rules) throw new Error(`Unknown run kind: ${kind}`);

  const files = {};
  const errors = [];
  for (const fileName of [...rules.required, ...rules.optional]) {
    const filePath = `${runDir}/${fileName}`;
    const content = await fs.readFile(filePath, 'utf8').catch(() => null);
    const valid = typeof content === 'string' && content.trim().length > 0;
    files[fileName] = { exists: content !== null, valid };
    if (!valid && rules.required.includes(fileName)) errors.push(`Thiếu hoặc rỗng: ${fileName}`);
  }

  if (files['manual_test_cases.csv']?.valid) {
    const csvError = validateManualTestCasesCsv(await fs.readFile(`${runDir}/manual_test_cases.csv`, 'utf8'));
    if (csvError) errors.push(csvError);
  }
  if (files['page_pairs.csv']?.valid) {
    const csvError = validatePagePairsCsv(await fs.readFile(`${runDir}/page_pairs.csv`, 'utf8'));
    if (csvError) errors.push(csvError);
  }

  const evidence = await fs.readdir(`${runDir}/TEST_EVIDENCE`).catch(() => []);
  const evidenceCount = evidence.filter((file) => /\.(png|jpe?g|webp|gif)$/i.test(file)).length;
  const valid = errors.length === 0;
  return { valid, status: valid ? 'completed' : 'partial', files, evidenceCount, errors };
}

export function parseCsvRows(value) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const next = value[i + 1];
    if (char === '"') {
      if (quoted && next === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((item) => item.some((cellValue) => cellValue.trim()));
}

export function validateManualTestCasesCsv(value) {
  const expected = ['Test Case ID', 'Component', 'Title', 'Preconditions', 'Steps', 'Expected Result', 'Severity', 'Priority'];
  const rows = parseCsvRows(value.replace(/^\uFEFF/, ''));
  if (!rows.length || rows[0].map((item) => item.trim()).join('|') !== expected.join('|')) {
    return 'manual_test_cases.csv có header không hợp lệ.';
  }
  if (rows.slice(1).some((row) => row.length !== expected.length || !row[0].trim() || !row[4].trim() || !row[5].trim())) {
    return 'manual_test_cases.csv có dòng thiếu cột hoặc thiếu ID/steps/expected result.';
  }
  return null;
}

export function validatePagePairsCsv(value) {
  const rows = parseCsvRows(value.replace(/^\uFEFF/, ''));
  const expected = ['source_url', 'target_url', 'match_confidence'];
  if (!rows.length || rows[0].map((item) => item.trim()).join('|') !== expected.join('|')) {
    return 'page_pairs.csv có header không hợp lệ.';
  }
  if (rows.slice(1).some((row) => row.length !== expected.length || !row[0].trim())) {
    return 'page_pairs.csv có dòng không hợp lệ.';
  }
  return null;
}
