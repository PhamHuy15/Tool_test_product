const numberEnv = (name, fallback, min, max) => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

export const browserConfig = {
  browser: 'chromium',
  maxPages: numberEnv('MAX_PAGES', 500, 1, 5000),
  concurrency: numberEnv('MAX_CONCURRENCY', 3, 1, 8),
  navigationTimeoutMs: numberEnv('NAVIGATION_TIMEOUT_MS', 45_000, 5_000, 120_000),
  actionTimeoutMs: numberEnv('ACTION_TIMEOUT_MS', 15_000, 1_000, 60_000),
  pageTextLimit: numberEnv('PAGE_TEXT_LIMIT', 200_000, 10_000, 1_000_000),
  maxDownloadBytes: numberEnv('MAX_DOWNLOAD_BYTES', 10 * 1024 * 1024, 1024, 100 * 1024 * 1024),
  retries: numberEnv('CRAWL_RETRIES', 2, 0, 5),
  screenshots: process.env.CAPTURE_SCREENSHOTS !== 'false',
  traces: process.env.CAPTURE_TRACES === 'true',
};

export function browserConfigSummary() {
  return { ...browserConfig };
}
