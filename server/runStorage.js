import fs from 'node:fs/promises';
import path from 'node:path';

export async function prepareBrowserRun(runDir) {
  await Promise.all([
    fs.mkdir(path.join(runDir, 'pages'), { recursive: true }),
    fs.mkdir(path.join(runDir, 'snapshots'), { recursive: true }),
    fs.mkdir(path.join(runDir, 'TEST_EVIDENCE'), { recursive: true }),
  ]);
}

export async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

export async function writePageSnapshot(runDir, pageData, index, prefix = '') {
  const fileName = `${prefix ? `${prefix}-` : ''}${String(index).padStart(4, '0')}.json`;
  await writeJson(path.join(runDir, 'pages', fileName), pageData);
  return fileName;
}

export async function writeManifest(runDir, manifest, name = 'crawl_manifest.json') {
  await writeJson(path.join(runDir, name), manifest);
}
