import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkCodexCli, runCodexExec } from "./runCodex.js";
import { inspectArtifacts } from "./artifacts.js";
import { isSafeFilename, validatePublicHttpUrl } from "./security.js";
import { checkPlaywright, captureViewports } from "./browserRunner.js";
import { crawlSite } from "./siteCrawler.js";
import { analyzeContent } from "./contentAnalyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const publicDir = path.join(appRoot, "public");
const promptsDir = path.join(appRoot, "prompts");
const runsDir = path.join(appRoot, "runs");
const PORT = Number(process.env.PORT || 4545);
const HOST = "127.0.0.1";
const APP_VERSION = "1.1.0";
const RUN_TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS || 30 * 60 * 1000);
const MAX_EVENTS = Number(process.env.MAX_EVENTS || 2000);
const RUN_RETENTION_DAYS = Number(process.env.RUN_RETENTION_DAYS || 30);

const runs = new Map();
let activeRunId = null;
let codexCheckPromise = null;

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(express.static(publicDir));

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({
      success: false,
      error: "Request body không phải JSON hợp lệ.",
      detail: error.message,
    });
    return;
  }

  next(error);
});

app.post("/api/run-test", async (req, res) => {
  try {
    if (activeRunId) {
      res.status(409).json({
        success: false,
        error:
          "Đang có một phiên AI Test chạy. Vui lòng chờ phiên hiện tại kết thúc.",
      });
      return;
    }

    const testPackageJson = req.body?.testPackageJson;
    const validationError = await validateTestPackage(testPackageJson);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const codexError = await ensureCodexReady();
    if (codexError) {
      res.status(500).json({
        success: false,
        error: codexError.message,
        detail: codexError.detail,
      });
      return;
    }

    const runId = makeRunId();
    const runDir = path.join(runsDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    const [testPrompt, workflow] = await Promise.all([
      fs.readFile(path.join(promptsDir, "test-prompt.md"), "utf8"),
      fs.readFile(path.join(promptsDir, "workflow.md"), "utf8"),
    ]);

    const jsonBlock = JSON.stringify(testPackageJson, null, 2);
    const promptWithJson = testPrompt.replace(
      "<paste JSON test package ở đây>",
      jsonBlock,
    );
    const combinedPrompt = `${promptWithJson}\n\n---\n\n${workflow}\n`;

    await Promise.all([
      fs.writeFile(
        path.join(runDir, "combined-prompt.txt"),
        combinedPrompt,
        "utf8",
      ),
      fs.writeFile(
        path.join(runDir, "SENIOR_TESTER_WORKFLOW.md"),
        workflow,
        "utf8",
      ),
    ]);

    const runState = {
      runId,
      kind: "ai-test",
      status: "running",
      startedAt: new Date().toISOString(),
      events: [],
      clients: new Set(),
      result: null,
      error: null,
    };

    runs.set(runId, runState);
    activeRunId = runId;

    // Write initial metadata
    await writeRunMetadata(runDir, {
      runId,
      kind: "ai-test",
      startedAt: runState.startedAt,
      status: "running",
      targetUrl: testPackageJson.targetUrl,
      siteType: testPackageJson.siteType,
      testScope: testPackageJson.testScope,
    });

    prepareSingleSiteRun(runState, runDir, combinedPrompt, testPackageJson.targetUrl, "ai-test").catch((error) => {
      finishFailed(runState, `Browser snapshot failed: ${error.message}`);
    });

    res.json({ success: true, runId });
  } catch (error) {
    activeRunId = null;
    res.status(500).json({
      success: false,
      error: "Không thể khởi tạo phiên AI Test.",
      detail: error.message,
    });
  }
});

app.post("/api/run-manual-test-cases", async (req, res) => {
  try {
    if (activeRunId) {
      res.status(409).json({
        success: false,
        error:
          "Đang có một phiên AI Test/Tạo Test Case chạy. Vui lòng chờ phiên hiện tại kết thúc.",
      });
      return;
    }

    const testPackageJson = req.body?.testPackageJson;
    const validationError = await validateTestPackage(testPackageJson);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const codexError = await ensureCodexReady();
    if (codexError) {
      res.status(500).json({
        success: false,
        error: codexError.message,
        detail: codexError.detail,
      });
      return;
    }

    const runId = makeRunId("manual");
    const runDir = path.join(runsDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    const [testPrompt, workflow] = await Promise.all([
      fs.readFile(path.join(promptsDir, "manual-test-cases-prompt.md"), "utf8"),
      fs.readFile(path.join(promptsDir, "workflow.md"), "utf8"),
    ]);

    const jsonBlock = JSON.stringify(testPackageJson, null, 2);
    const promptWithJson = testPrompt.replace(
      "<paste JSON test package ở đây>",
      jsonBlock,
    );
    const combinedPrompt = `${promptWithJson}\n\n---\n\n${workflow}\n`;

    await Promise.all([
      fs.writeFile(
        path.join(runDir, "combined-prompt.txt"),
        combinedPrompt,
        "utf8",
      ),
      fs.writeFile(
        path.join(runDir, "SENIOR_TESTER_WORKFLOW.md"),
        workflow,
        "utf8",
      ),
    ]);

    const runState = {
      runId,
      kind: "manual-test-cases",
      status: "running",
      startedAt: new Date().toISOString(),
      events: [],
      clients: new Set(),
      result: null,
      error: null,
    };

    runs.set(runId, runState);
    activeRunId = runId;

    // Write initial metadata
    await writeRunMetadata(runDir, {
      runId,
      kind: "manual-test-cases",
      startedAt: runState.startedAt,
      status: "running",
      targetUrl: testPackageJson.targetUrl,
      siteType: testPackageJson.siteType,
      testScope: testPackageJson.testScope,
    });

    prepareSingleSiteRun(runState, runDir, combinedPrompt, testPackageJson.targetUrl, "manual-test-cases").catch((error) => {
      finishFailed(runState, `Browser snapshot failed: ${error.message}`);
    });

    res.json({ success: true, runId });
  } catch (error) {
    activeRunId = null;
    res.status(500).json({
      success: false,
      error: "Không thể khởi tạo phiên tạo test case.",
      detail: error.message,
    });
  }
});

app.post("/api/compare-content", async (req, res) => {
  try {
    if (activeRunId) {
      res.status(409).json({
        success: false,
        error:
          "Đang có một phiên Codex chạy. Vui lòng chờ phiên hiện tại kết thúc.",
      });
      return;
    }

    const source = await parseHttpUrl(req.body?.sourceUrl);
    const target = await parseHttpUrl(req.body?.targetUrl);

    if (!source.ok) {
      res.status(400).json({
        success: false,
        error: "`sourceUrl` phải là URL hợp lệ có http:// hoặc https://.",
      });
      return;
    }

    if (!target.ok) {
      res.status(400).json({
        success: false,
        error: "`targetUrl` phải là URL hợp lệ có http:// hoặc https://.",
      });
      return;
    }

    const codexError = await ensureCodexReady();
    if (codexError) {
      res.status(500).json({
        success: false,
        error: codexError.message,
        detail: codexError.detail,
      });
      return;
    }

    const runId = makeRunId("compare");
    const runDir = path.join(runsDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    const promptTemplate = await fs.readFile(
      path.join(promptsDir, "content-comparison-prompt.md"),
      "utf8",
    );

    const combinedPrompt = `${applyContentComparisonTemplate(promptTemplate, {
      sourceUrl: formatPromptUrl(source.url),
      targetUrl: formatPromptUrl(target.url),
      sourceDomain: source.url.hostname,
      targetDomain: target.url.hostname,
    })}

---

## XÁC NHẬN TỰ ĐỘNG TỪ GIAO DIỆN
Người dùng đã bấm "So Sánh Nội Dung" để so sánh toàn bộ site. Sau khi hoàn tất Giai đoạn 1 và ghi \`page_pairs.csv\`, hãy tự tiếp tục Giai đoạn 2, không chờ thêm xác nhận tương tác.
`;

    await fs.writeFile(
      path.join(runDir, "combined-prompt.txt"),
      combinedPrompt,
      "utf8",
    );

    const runState = {
      runId,
      kind: "content-comparison",
      status: "running",
      startedAt: new Date().toISOString(),
      events: [],
      clients: new Set(),
      result: null,
      error: null,
    };

    runs.set(runId, runState);
    activeRunId = runId;

    // Write initial metadata
    await writeRunMetadata(runDir, {
      runId,
      kind: "content-comparison",
      startedAt: runState.startedAt,
      status: "running",
      sourceUrl: source.url.href,
      targetUrl: target.url.href,
    });

    prepareContentComparisonRun(runState, runDir, combinedPrompt, source.url.href, target.url.href).catch((error) => {
      finishFailed(runState, `Browser crawl failed: ${error.message}`);
    });

    res.json({ success: true, runId });
  } catch (error) {
    activeRunId = null;
    res.status(500).json({
      success: false,
      error: "Không thể khởi tạo phiên so sánh nội dung.",
      detail: error.message,
    });
  }
});

app.get("/api/runs/:runId/events", (req, res) => {
  if (!isSafeRunId(req.params.runId)) {
    res.status(400).end("Run ID không hợp lệ.");
    return;
  }

  const runState = runs.get(req.params.runId);
  if (!runState) {
    res.status(404).end("Không tìm thấy phiên chạy.");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  runState.clients.add(res);
  for (const event of runState.events) {
    writeSse(res, event);
  }

  req.on("close", () => {
    runState.clients.delete(res);
  });
});

app.get("/api/runs/:runId/result", async (req, res) => {
  if (!isSafeRunId(req.params.runId)) {
    res.status(400).json({ success: false, error: "Run ID không hợp lệ." });
    return;
  }

  const runState = runs.get(req.params.runId);
  if (!runState) {
    // Check if the run directory exists on disk to reload past runs
    const runDir = path.join(runsDir, req.params.runId);
    const dirExists = await fs
      .stat(runDir)
      .then((s) => s.isDirectory())
      .catch(() => false);
    if (!dirExists) {
      res
        .status(404)
        .json({ success: false, error: "Không tìm thấy phiên chạy." });
      return;
    }

    const isCompare = req.params.runId.startsWith("compare-");
    const isManual = req.params.runId.startsWith("manual-");
    try {
      let result;
      if (isCompare) {
        result = await collectContentComparisonRunResult(
          req.params.runId,
          runDir,
        );
      } else if (isManual) {
        result = await collectManualTestCasesRunResult(
          req.params.runId,
          runDir,
        );
      } else {
        result = await collectAiTestRunResult(req.params.runId, runDir);
      }
      const artifactValidation = await inspectArtifacts(runDir, result.kind);
      res.json({
        success: true,
        ...result,
        status: artifactValidation.status,
        artifacts: artifactValidation,
        metrics: { ...(result.metrics || {}), evidence: artifactValidation.evidenceCount },
      });
      return;
    } catch (error) {
      const meta = await getRunMetadata(req.params.runId).catch(() => ({
        status: "failed",
      }));
      res.status(500).json({
        success: false,
        error: error.message || "Phiên chạy chưa hoàn thành hoặc bị lỗi.",
        status: meta.status || "failed",
      });
      return;
    }
  }

  if (["queued", "running", "crawling", "analyzing", "generating-report"].includes(runState.status)) {
    res.status(202).json({ success: false, status: "running" });
    return;
  }

  if (runState.status === "failed") {
    res.status(500).json({ success: false, error: runState.error });
    return;
  }

  if (runState.status === "cancelled") {
    res.status(409).json({ success: false, status: "cancelled", error: "Run was cancelled." });
    return;
  }

  res.json({ success: true, ...runState.result });
});

app.get("/api/history", async (req, res) => {
  try {
    const files = await fs.readdir(runsDir).catch(() => []);
    const runsList = [];
    for (const fileName of files) {
      if (!isSafeRunId(fileName)) continue;
      const runDir = path.join(runsDir, fileName);
      const stat = await fs.stat(runDir).catch(() => null);
      if (stat && stat.isDirectory()) {
        try {
          const meta = await getRunMetadata(fileName);
          runsList.push(meta);
        } catch (e) {
          console.error(`Lỗi đọc metadata cho ${fileName}:`, e);
        }
      }
    }
    runsList.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    res.json({ success: true, history: runsList });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Không thể lấy lịch sử phiên chạy.",
      detail: error.message,
    });
  }
});

app.delete("/api/runs/:runId", async (req, res) => {
  if (!isSafeRunId(req.params.runId)) {
    res.status(400).json({ success: false, error: "Run ID không hợp lệ." });
    return;
  }

  const runId = req.params.runId;
  if (activeRunId === runId) {
    res.status(409).json({
      success: false,
      error: "Không thể xóa phiên chạy đang thực thi.",
    });
    return;
  }

  const runDir = path.join(runsDir, runId);
  try {
    await fs.rm(runDir, { recursive: true, force: true });
    runs.delete(runId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Không thể xóa thư mục phiên chạy.",
      detail: error.message,
    });
  }
});

app.get("/api/runs/:runId/files/:fileName", async (req, res) => {
  if (!isSafeRunId(req.params.runId)) {
    res.status(400).end("Run ID không hợp lệ.");
    return;
  }

  const allowed = new Set([
    "TEST_REPORT.md",
    "FIX_PLAN.md",
    "CONTENT_COMPARISON_REPORT.md",
    "page_pairs.csv",
    "combined-prompt.txt",
    "MANUAL_TEST_CASES.md",
    "manual_test_cases.csv",
    "deterministic_analysis.json",
    "browser_snapshot.json",
    "crawl_manifest-source.json",
    "crawl_manifest-target.json",
    "crawl_errors-source.json",
    "crawl_errors-target.json",
  ]);
  if (!allowed.has(req.params.fileName) || !isSafeFilename(req.params.fileName)) {
    res.status(404).end("Không tìm thấy file.");
    return;
  }

  const filePath = path.join(runsDir, req.params.runId, req.params.fileName);
  const exists = await fs.stat(filePath).then((stat) => stat.isFile()).catch(() => false);
  if (!exists) {
    res.status(404).end("File not found.");
    return;
  }
  res.download(filePath);
});

app.post("/api/runs/:runId/cancel", (req, res) => {
  if (!isSafeRunId(req.params.runId)) {
    res.status(400).json({ success: false, error: "Invalid run ID." });
    return;
  }
  const runState = runs.get(req.params.runId);
  if (!runState || !["running", "queued", "crawling", "analyzing", "generating-report"].includes(runState.status)) {
    res.status(409).json({ success: false, error: "Run is no longer active." });
    return;
  }
  runState.cancel?.();
  res.json({ success: true, runId: runState.runId, status: "cancelling" });
});

app.get("/api/health", async (req, res) => {
  const [codex, playwright] = await Promise.all([ensureCodexReady(), checkPlaywright()]);
  const degraded = Boolean(codex) || !playwright.ok;
  res.status(degraded ? 503 : 200).json({
    success: !degraded,
    status: degraded ? "degraded" : "ok",
    activeRunId,
    codex: codex ? { ok: false, error: codex.message } : { ok: true },
    playwright,
  });
});

app.get("/runs/:runId/evidence/:filename", async (req, res) => {
  if (!isSafeRunId(req.params.runId)) {
    res.status(404).end("Không tìm thấy phiên chạy.");
    return;
  }

  const safeRunId = req.params.runId;
  const runDir = path.join(runsDir, safeRunId);
  const dirExists = await fs
    .stat(runDir)
    .then((s) => s.isDirectory())
    .catch(() => false);
  if (!dirExists) {
    res.status(404).end("Không tìm thấy phiên chạy.");
    return;
  }

  const safeFile = path.basename(req.params.filename);
  const evidencePath = path.join(runsDir, safeRunId, "TEST_EVIDENCE", safeFile);
  const resolved = path.resolve(evidencePath);
  const allowedRoot = path.resolve(runsDir, safeRunId, "TEST_EVIDENCE");

  if (!resolved.startsWith(allowedRoot + path.sep)) {
    res.status(400).end("Đường dẫn không hợp lệ.");
    return;
  }

  res.sendFile(resolved, (error) => {
    if (error && !res.headersSent) res.status(404).end("Không tìm thấy ảnh.");
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Local AI Test Web chạy tại http://${HOST}:${PORT}`);
});

cleanupOldRuns().catch((error) => console.error("Run cleanup failed:", error));

process.on("SIGINT", () => {
  const active = activeRunId && runs.get(activeRunId);
  active?.cancel?.();
  setTimeout(() => process.exit(0), 250);
});
process.on("SIGTERM", () => {
  const active = activeRunId && runs.get(activeRunId);
  active?.cancel?.();
  setTimeout(() => process.exit(0), 250);
});

async function cleanupOldRuns() {
  if (!Number.isFinite(RUN_RETENTION_DAYS) || RUN_RETENTION_DAYS <= 0) return;
  const cutoff = Date.now() - RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeRunId(entry.name)) continue;
    const runDir = path.join(runsDir, entry.name);
    const stat = await fs.stat(runDir).catch(() => null);
    if (stat && stat.mtimeMs < cutoff && entry.name !== activeRunId) {
      await fs.rm(runDir, { recursive: true, force: true }).catch(() => {});
      runs.delete(entry.name);
    }
  }
}

async function prepareSingleSiteRun(runState, runDir, basePrompt, targetUrl, kind) {
  runState.cancel = () => { runState.cancelRequested = true; };
  runState.status = "crawling";
  await updateRunMetaStatus(runDir, "crawling");
  emit(runState, { type: "status", payload: "Playwright đang khảo sát target site..." });
  const crawl = await crawlSite({ runDir, startUrl: targetUrl, phase: "target", isCancelled: () => runState.cancelRequested, onProgress: (payload) => emit(runState, { type: "crawl-progress", payload }) });
  if (runState.cancelRequested) { runState.status = "cancelled"; activeRunId = null; await updateRunMetaStatus(runDir, "cancelled"); emit(runState, { type: "cancelled", payload: "Run cancelled by user." }); return; }
  const viewports = kind === "ai-test" ? await captureViewports({ runDir, url: targetUrl, onProgress: (payload) => emit(runState, { type: "crawl-progress", payload }) }) : [];
  const compact = crawl.pages.map((page) => ({
    url: page.url,
    statusCode: page.statusCode,
    title: page.title,
    description: page.description,
    headings: page.headings,
    text: page.text.slice(0, 5_000),
    links: page.links.slice(0, 100),
    forms: page.forms,
    buttons: page.buttons,
    errors: page.errors,
    screenshot: page.screenshot,
  }));
  runState.status = "generating-report";
  await updateRunMetaStatus(runDir, "generating-report");
  await fs.writeFile(path.join(runDir, "browser_snapshot.json"), JSON.stringify({ kind, targetUrl, pages: compact, viewports, errors: crawl.errors, manifest: crawl.manifest }, null, 2), "utf8");
  const browserContext = `\n\n---\n\n## PLAYWRIGHT BROWSER SNAPSHOT\n\nUse this snapshot as the primary browser evidence. Do not recrawl the whole site with Codex; only perform a focused read-only validation when a screenshot or interaction needs confirmation.\n\n${JSON.stringify({ pages: compact, viewports, errors: crawl.errors }, null, 2)}\n`;
  emit(runState, { type: "status", payload: "Playwright khảo sát xong; Codex đang tạo báo cáo..." });
  const options = kind === "manual-test-cases" ? { completionFiles: ["MANUAL_TEST_CASES.md", "manual_test_cases.csv"] } : {};
  startCodexRun(runState, runDir, `${basePrompt}${browserContext}`, kind === "manual-test-cases" ? collectManualTestCasesRunResult : collectAiTestRunResult, options);
}

async function prepareContentComparisonRun(runState, runDir, basePrompt, sourceUrl, targetUrl) {
  runState.cancel = () => { runState.cancelRequested = true; };
  runState.status = "crawling";
  await updateRunMetaStatus(runDir, "crawling");
  emit(runState, { type: "status", payload: "Playwright đang crawl site nguồn và site đích..." });
  const sourceCrawl = await crawlSite({ runDir, startUrl: sourceUrl, phase: "source", isCancelled: () => runState.cancelRequested, onProgress: (payload) => emit(runState, { type: "crawl-progress", payload }) });
  if (runState.cancelRequested) { runState.status = "cancelled"; activeRunId = null; await updateRunMetaStatus(runDir, "cancelled"); emit(runState, { type: "cancelled", payload: "Run cancelled by user." }); return; }
  const targetCrawl = await crawlSite({ runDir, startUrl: targetUrl, phase: "target", isCancelled: () => runState.cancelRequested, onProgress: (payload) => emit(runState, { type: "crawl-progress", payload }) });
  if (runState.cancelRequested) { runState.status = "cancelled"; activeRunId = null; await updateRunMetaStatus(runDir, "cancelled"); emit(runState, { type: "cancelled", payload: "Run cancelled by user." }); return; }
  const analysis = analyzeContent(sourceCrawl.pages, targetCrawl.pages);
  runState.status = "analyzing";
  await updateRunMetaStatus(runDir, "analyzing");
  await fs.writeFile(path.join(runDir, "deterministic_analysis.json"), JSON.stringify(analysis, null, 2), "utf8");
  await fs.writeFile(path.join(runDir, "page_pairs.csv"), [
    "source_url,target_url,match_confidence",
    ...analysis.pairs.map((pair) => `${csvCell(pair.sourceUrl)},${csvCell(pair.targetUrl)},${csvCell(pair.matchConfidence)}`),
  ].join("\n"), "utf8");
  const browserContext = `\n\n---\n\n## PLAYWRIGHT DETERMINISTIC INPUT\n\nUse these deterministic Playwright results as the primary crawl input. Do not recrawl the full sites with Codex. Only perform focused read-only semantic validation if necessary.\n\n${JSON.stringify(analysis, null, 2)}\n\nSource crawl errors: ${JSON.stringify(sourceCrawl.errors)}\nTarget crawl errors: ${JSON.stringify(targetCrawl.errors)}\n`;
  emit(runState, { type: "status", payload: "Playwright crawl hoàn tất; Codex đang phân tích semantic..." });
  startCodexRun(runState, runDir, `${basePrompt}${browserContext}`, collectContentComparisonRunResult, {
    completionFiles: ["CONTENT_COMPARISON_REPORT.md", "page_pairs.csv"],
  });
}

function csvCell(value) {
  return `"${String(value || "").replaceAll('"', '""')}"`;
}

function startCodexRun(
  runState,
  runDir,
  combinedPrompt,
  collectResult,
  options = {},
) {
  emit(runState, { type: "status", payload: "Đã khởi tạo phiên Codex." });
  const codex = runCodexExec({ cwd: runDir, prompt: combinedPrompt });
  let finalized = false;
  let completionWatcher = null;
  const timeout = setTimeout(() => failRun(`Run exceeded the ${Math.round(RUN_TIMEOUT_MS / 60000)} minute timeout.`), RUN_TIMEOUT_MS);
  runState.cancel = () => {
    if (finalized) return;
    finalized = true;
    clearTimeout(timeout);
    if (completionWatcher) clearInterval(completionWatcher);
    runState.status = "cancelled";
    codex.killTree?.();
    updateRunMetaStatus(runDir, "cancelled").catch(() => {});
    emit(runState, { type: "cancelled", payload: "Run cancelled by user." });
    if (activeRunId === runState.runId) activeRunId = null;
  };

  const completeRun = async (reason) => {
    if (finalized) return;
    finalized = true;
    clearTimeout(timeout);
    if (completionWatcher) clearInterval(completionWatcher);

    try {
      const result = await collectResult(runState.runId, runDir);
      const artifacts = await inspectArtifacts(runDir, runState.kind);
      runState.status = artifacts.status;
      runState.result = { ...result, status: artifacts.status, artifacts, metrics: { ...(result.metrics || {}), evidence: artifacts.evidenceCount } };
      await updateRunMetaStatus(runDir, artifacts.status).catch(() => {});
      emit(runState, { type: "status", payload: reason });
      emit(runState, { type: "complete", payload: runState.result });
      if (codex.killTree) codex.killTree();
    } catch (error) {
      finishFailed(runState, error.message);
    } finally {
      if (activeRunId === runState.runId) activeRunId = null;
    }
  };

  const failRun = (message) => {
    if (finalized) return;
    finalized = true;
    clearTimeout(timeout);
    if (completionWatcher) clearInterval(completionWatcher);
    codex.killTree?.();
    finishFailed(runState, message);
  };

  if (options.completionFiles?.length) {
    completionWatcher = watchCompletionFiles(
      runDir,
      options.completionFiles,
      () => {
        completeRun("Đã phát hiện file kết quả hoàn chỉnh, tự kết thúc phiên.");
      },
    );
  }

  codex.on("event", (event) => emit(runState, event));
  codex.on("error", (error) => {
    failRun(`Không thể chạy Codex CLI: ${error.message}`);
  });
  codex.on("close", async ({ code, stderr }) => {
    if (finalized) return;
    if (completionWatcher) clearInterval(completionWatcher);

    if (code !== 0) {
      failRun(`Codex CLI thoát với mã lỗi ${code}.\n${stderr || ""}`.trim());
      return;
    }

    completeRun("Codex CLI đã kết thúc.");
  });
}

async function collectAiTestRunResult(runId, runDir) {
  const testReportPath = path.join(runDir, "TEST_REPORT.md");
  const fixPlanPath = path.join(runDir, "FIX_PLAN.md");
  const [testReportMd, fixPlanMd] = await Promise.all([
    readRequiredFile(
      testReportPath,
      "Không tìm thấy TEST_REPORT.md sau khi Codex chạy xong.",
    ),
    fs.readFile(fixPlanPath, "utf8").catch(() => ""),
  ]);

  const evidenceDir = path.join(runDir, "TEST_EVIDENCE");
  const imageNames = await fs
    .readdir(evidenceDir)
    .then((files) =>
      files.filter((file) => /\.(png|jpe?g|webp|gif)$/i.test(file)).sort(),
    )
    .catch(() => []);

  return {
    kind: "ai-test",
    runId,
    testReportMd,
    fixPlanMd,
    evidenceImages: imageNames.map((fileName) => ({
      fileName,
      url: `/runs/${encodeURIComponent(runId)}/evidence/${encodeURIComponent(fileName)}`,
    })),
    files: {
      testReport: `/api/runs/${encodeURIComponent(runId)}/files/TEST_REPORT.md`,
      fixPlan: `/api/runs/${encodeURIComponent(runId)}/files/FIX_PLAN.md`,
      combinedPrompt: `/api/runs/${encodeURIComponent(runId)}/files/combined-prompt.txt`,
    },
    runFolder: path.join(runsDir, runId),
  };
}

async function collectContentComparisonRunResult(runId, runDir) {
  const reportPath = path.join(runDir, "CONTENT_COMPARISON_REPORT.md");
  const pairsPath = path.join(runDir, "page_pairs.csv");
  const [contentComparisonReportMd, pagePairsCsv] = await Promise.all([
    readRequiredFile(
      reportPath,
      "Không tìm thấy CONTENT_COMPARISON_REPORT.md sau khi Codex chạy xong.",
    ),
    fs.readFile(pairsPath, "utf8").catch(() => ""),
  ]);
  const deterministicAnalysis = await fs.readFile(path.join(runDir, "deterministic_analysis.json"), "utf8")
    .then((value) => JSON.parse(value))
    .catch(() => null);

  const evidenceDir = path.join(runDir, "TEST_EVIDENCE");
  const imageNames = await fs
    .readdir(evidenceDir)
    .then((files) =>
      files.filter((file) => /\.(png|jpe?g|webp|gif)$/i.test(file)).sort(),
    )
    .catch(() => []);

  return {
    kind: "content-comparison",
    runId,
    contentComparisonReportMd,
    pagePairsCsv,
    pagePairs: parsePagePairsCsv(pagePairsCsv),
    deterministicAnalysis,
    metrics: deterministicAnalysis?.metrics || {},
    evidenceImages: imageNames.map((fileName) => ({
      fileName,
      url: `/runs/${encodeURIComponent(runId)}/evidence/${encodeURIComponent(fileName)}`,
    })),
    files: {
      contentComparisonReport: `/api/runs/${encodeURIComponent(runId)}/files/CONTENT_COMPARISON_REPORT.md`,
      pagePairs: `/api/runs/${encodeURIComponent(runId)}/files/page_pairs.csv`,
      combinedPrompt: `/api/runs/${encodeURIComponent(runId)}/files/combined-prompt.txt`,
    },
    runFolder: path.join(runsDir, runId),
  };
}

async function collectManualTestCasesRunResult(runId, runDir) {
  const testCasesMdPath = path.join(runDir, "MANUAL_TEST_CASES.md");
  const testCasesCsvPath = path.join(runDir, "manual_test_cases.csv");
  const [testCasesMd, testCasesCsv] = await Promise.all([
    readRequiredFile(
      testCasesMdPath,
      "Không tìm thấy MANUAL_TEST_CASES.md sau khi Codex chạy xong.",
    ),
    fs.readFile(testCasesCsvPath, "utf8").catch(() => ""),
  ]);

  const evidenceDir = path.join(runDir, "TEST_EVIDENCE");
  const imageNames = await fs
    .readdir(evidenceDir)
    .then((files) =>
      files.filter((file) => /\.(png|jpe?g|webp|gif)$/i.test(file)).sort(),
    )
    .catch(() => []);

  return {
    kind: "manual-test-cases",
    runId,
    testCasesMd,
    testCasesCsv,
    evidenceImages: imageNames.map((fileName) => ({
      fileName,
      url: `/runs/${encodeURIComponent(runId)}/evidence/${encodeURIComponent(fileName)}`,
    })),
    files: {
      testCasesReport: `/api/runs/${encodeURIComponent(runId)}/files/MANUAL_TEST_CASES.md`,
      testCasesCsv: `/api/runs/${encodeURIComponent(runId)}/files/manual_test_cases.csv`,
      combinedPrompt: `/api/runs/${encodeURIComponent(runId)}/files/combined-prompt.txt`,
    },
    runFolder: path.join(runsDir, runId),
  };
}

async function readRequiredFile(filePath, message) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    throw new Error(message);
  }
}

function finishFailed(runState, error) {
  runState.status = "failed";
  runState.error = error;
  const runDir = path.join(runsDir, runState.runId);
  updateRunMetaStatus(runDir, "failed", error).catch(() => {});
  emit(runState, { type: "error", payload: error });
  if (activeRunId === runState.runId) activeRunId = null;
}

function emit(runState, event) {
  const record = { ...event, at: new Date().toISOString() };
  runState.events.push(record);
  for (const client of runState.clients) {
    writeSse(client, record);
  }
}

function watchCompletionFiles(runDir, fileNames, onReady) {
  const stableForMs = 7000;
  const pollMs = 2500;
  const seen = new Map();
  let busy = false;

  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;

    try {
      const now = Date.now();

      for (const fileName of fileNames) {
        const filePath = path.join(runDir, fileName);
        const stat = await fs.stat(filePath).catch(() => null);
        if (!stat || stat.size === 0) {
          seen.delete(fileName);
          return;
        }

        const signature = `${stat.size}:${stat.mtimeMs}`;
        const previous = seen.get(fileName);
        if (!previous || previous.signature !== signature) {
          seen.set(fileName, { signature, stableSince: now });
          return;
        }

        if (now - previous.stableSince < stableForMs) return;
      }

      clearInterval(timer);
      onReady();
    } finally {
      busy = false;
    }
  }, pollMs);

  return timer;
}

function writeSse(res, event) {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function validateTestPackage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Body phải có dạng `{ testPackageJson: <object> }`.";
  }

  const required = ["targetUrl", "siteType", "testScope", "pageSnapshot"];
  for (const field of required) {
    if (
      value[field] === undefined ||
      value[field] === null ||
      value[field] === ""
    ) {
      return `JSON test package thiếu field bắt buộc: ${field}.`;
    }
  }

  try {
    new URL(value.targetUrl);
  } catch {
    return "Field `targetUrl` phải là URL hợp lệ.";
  }

  const target = await validatePublicHttpUrl(value.targetUrl, "targetUrl");
  if (!target.ok) return target.error;
  return null;
}

async function ensureCodexReady() {
  codexCheckPromise ??= checkCodexCli();
  const codexStatus = await codexCheckPromise;
  if (codexStatus.ok) return null;

  codexCheckPromise = null;
  return {
    message: codexStatus.message,
    detail: codexStatus.detail,
  };
}

async function parseHttpUrl(value) {
  const secure = await validatePublicHttpUrl(value);
  if (!secure.ok) return { ok: false, error: secure.error };
  return secure;
}

function applyContentComparisonTemplate(template, values) {
  return template
    .replaceAll("{{SOURCE_URL}}", values.sourceUrl)
    .replaceAll("{{TARGET_URL}}", values.targetUrl)
    .replaceAll("{{SOURCE_DOMAIN}}", values.sourceDomain)
    .replaceAll("{{TARGET_DOMAIN}}", values.targetDomain);
}

function formatPromptUrl(url) {
  return url.href.replace(/\/$/, "");
}

function parsePagePairsCsv(value) {
  if (!value.trim()) return [];

  const rows = parseCsvRows(value);
  if (rows.length === 0) return [];

  const headers = rows.shift().map((header) => header.trim());
  return rows
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => {
      const record = Object.fromEntries(
        headers.map((header, index) => [header, row[index]?.trim() ?? ""]),
      );
      const status = classifyPair(record.match_confidence, record.target_url);

      return {
        sourceUrl: record.source_url || "",
        targetUrl: record.target_url || "",
        matchConfidence: record.match_confidence || "",
        statusLabel: status.label,
        statusClass: status.className,
      };
    });
}

function parseCsvRows(value) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function classifyPair(confidence, targetUrl) {
  if (!targetUrl) return { label: "Thiếu cặp", className: "bad" };

  const normalized = String(confidence || "")
    .trim()
    .toLowerCase();
  const numeric = Number.parseFloat(normalized.replace("%", ""));
  if (Number.isFinite(numeric)) {
    const score = numeric > 1 ? numeric / 100 : numeric;
    if (score >= 0.85) return { label: "OK", className: "ok" };
    if (score >= 0.5) return { label: "Cần kiểm tra", className: "warn" };
    return { label: "Khớp thấp", className: "bad" };
  }

  if (/exact|high|ok|cao|chính xác/.test(normalized)) {
    return { label: "OK", className: "ok" };
  }

  if (/medium|partial|vừa|trung bình|cần/.test(normalized)) {
    return { label: "Cần kiểm tra", className: "warn" };
  }

  if (/low|none|missing|không|thấp|thiếu/.test(normalized)) {
    return { label: "Khớp thấp", className: "bad" };
  }

  return { label: confidence ? "Cần kiểm tra" : "Chưa rõ", className: "warn" };
}

function makeRunId(prefix = "") {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return prefix ? `${prefix}-${timestamp}` : timestamp;
}

function isSafeRunId(value) {
  return /^(compare-|manual-)?\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(value);
}

async function writeRunMetadata(runDir, meta) {
  try {
    meta = { appVersion: APP_VERSION, promptVersion: APP_VERSION, ...meta };
    await fs.writeFile(
      path.join(runDir, "run_meta.json"),
      JSON.stringify(meta, null, 2),
      "utf8",
    );
  } catch (error) {
    console.error("Lỗi ghi metadata:", error);
  }
}

async function updateRunMetaStatus(runDir, status, errorMsg = null) {
  try {
    const metaPath = path.join(runDir, "run_meta.json");
    let meta = {};
    try {
      const data = await fs.readFile(metaPath, "utf8");
      meta = JSON.parse(data);
    } catch {
      const runId = path.basename(runDir);
      const isCompare = runId.startsWith("compare-");
      const isManual = runId.startsWith("manual-");
      meta = {
        runId,
        kind: isCompare ? "content-comparison" : isManual ? "manual-test-cases" : "ai-test",
        startedAt: new Date().toISOString(),
      };
    }
    meta.status = status;
    if (errorMsg) {
      meta.error = errorMsg;
    }
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
  } catch (error) {
    console.error("Lỗi cập nhật metadata status:", error);
  }
}

async function getRunMetadata(runId) {
  const runDir = path.join(runsDir, runId);
  const metaPath = path.join(runDir, "run_meta.json");
  try {
    const data = await fs.readFile(metaPath, "utf8");
    return JSON.parse(data);
  } catch {
    const isCompare = runId.startsWith("compare-");
    const isManual = runId.startsWith("manual-");
    const kind = isCompare ? "content-comparison" : isManual ? "manual-test-cases" : "ai-test";

    let startedAt = "";
    try {
      const tsPart = runId.replace("compare-", "");
      const parts = tsPart.split("T");
      if (parts.length === 2) {
        const timePart = parts[1]
          .replaceAll("-", ":")
          .replace(/:([0-9]{3})Z$/, ".$1Z");
        startedAt = `${parts[0]}T${timePart}`;
      }
    } catch {
      startedAt = new Date().toISOString();
    }

    let targetUrl = "";
    let sourceUrl = "";
    let status = "failed";

    if (kind === "ai-test" || kind === "manual-test-cases") {
      const mainReportFile = kind === "manual-test-cases" ? "MANUAL_TEST_CASES.md" : "TEST_REPORT.md";
      const reportExists = await fs
        .stat(path.join(runDir, mainReportFile))
        .then((s) => s.isFile())
        .catch(() => false);
      if (reportExists) {
        status = "completed";
        try {
          const reportContent = await fs.readFile(
            path.join(runDir, mainReportFile),
            "utf8",
          );
          const match = reportContent.match(/# (Test Report|Tài Liệu Test Cases Kiểm Thử Thủ Công) —\s*(.*)/i);
          if (match) targetUrl = match[2].trim();
        } catch {}
      }
      if (!targetUrl) {
        try {
          const promptContent = await fs.readFile(
            path.join(runDir, "combined-prompt.txt"),
            "utf8",
          );
          const match = promptContent.match(/"targetUrl":\s*"([^"]+)"/);
          if (match) targetUrl = match[1];
        } catch {}
      }
    } else {
      const reportExists = await fs
        .stat(path.join(runDir, "CONTENT_COMPARISON_REPORT.md"))
        .then((s) => s.isFile())
        .catch(() => false);
      if (reportExists) {
        status = "completed";
        try {
          const reportContent = await fs.readFile(
            path.join(runDir, "CONTENT_COMPARISON_REPORT.md"),
            "utf8",
          );
          const sourceMatch = reportContent.match(/-\s*Site gốc:\s*(.*)/i);
          const targetMatch = reportContent.match(/-\s*Site đích:\s*(.*)/i);
          if (sourceMatch) sourceUrl = sourceMatch[1].trim();
          if (targetMatch) targetUrl = targetMatch[1].trim();
        } catch {}
      }
      if (!targetUrl || !sourceUrl) {
        try {
          const promptContent = await fs.readFile(
            path.join(runDir, "combined-prompt.txt"),
            "utf8",
          );
          const sourceMatch = promptContent.match(
            /Site gốc\s*\(nguồn nội dung chuẩn\):\s*(.*)/i,
          );
          const targetMatch = promptContent.match(
            /Site đích\s*\(site cần kiểm tra\):\s*(.*)/i,
          );
          if (sourceMatch) sourceUrl = sourceMatch[1].trim();
          if (targetMatch) targetUrl = targetMatch[1].trim();
        } catch {}
      }
    }

    return {
      runId,
      kind,
      startedAt,
      status,
      targetUrl,
      sourceUrl,
    };
  }
}
