// DOM Selectors
const jsonInput = document.querySelector("#jsonInput");
const runButton = document.querySelector("#runButton");
const clearButton = document.querySelector("#clearButton");
const sourceUrlInput = document.querySelector("#sourceUrlInput");
const targetUrlInput = document.querySelector("#targetUrlInput");
const compareButton = document.querySelector("#compareButton");
const compareClearButton = document.querySelector("#compareClearButton");
const statusBox = document.querySelector("#status");
const cancelRunButton = document.querySelector("#cancelRunButton");
const logOutput = document.querySelector("#logOutput");
const evidenceGrid = document.querySelector("#evidenceGrid");
const pairSummary = document.querySelector("#pairSummary");
const reportOutput = document.querySelector("#reportOutput");
const fixOutput = document.querySelector("#fixOutput");
const comparisonReportOutput = document.querySelector("#comparisonReportOutput");
const downloadReport = document.querySelector("#downloadReport");
const downloadFixPlan = document.querySelector("#downloadFixPlan");
const downloadComparisonReport = document.querySelector("#downloadComparisonReport");
const downloadPagePairs = document.querySelector("#downloadPagePairs");

// Test Cases Selectors
const manualJsonInput = document.querySelector("#manualJsonInput");
const manualRunButton = document.querySelector("#manualRunButton");
const manualClearButton = document.querySelector("#manualClearButton");
const manualLoadSampleJson = document.querySelector("#manualLoadSampleJson");
const manualUploadJsonFile = document.querySelector("#manualUploadJsonFile");
const testCasesOutput = document.querySelector("#testCasesOutput");
const downloadTestCasesMd = document.querySelector("#downloadTestCasesMd");
const downloadTestCasesCsv = document.querySelector("#downloadTestCasesCsv");

// New UI Selectors
const loadSampleJson = document.querySelector("#loadSampleJson");
const uploadJsonFile = document.querySelector("#uploadJsonFile");
const copyLogButton = document.querySelector("#copyLogButton");
const refreshHistory = document.querySelector("#refreshHistory");
const historyList = document.querySelector("#historyList");
const imageLightbox = document.querySelector("#imageLightbox");
const lightboxImg = document.querySelector("#lightboxImg");
const lightboxCaption = document.querySelector("#lightboxCaption");
const lightboxClose = document.querySelector(".lightbox-close");

// Global states
let currentRunId = null;
let eventSource = null;
let currentRunMode = "";

// Sample JSON Template Helper
const SAMPLE_JSON = {
  "targetUrl": "https://example.com",
  "siteType": "landing",
  "testScope": ["content", "ui", "responsive"],
  "pageSnapshot": {
    "title": "Example Domain",
    "headings": [
      { "level": 1, "text": "Example Domain" }
    ],
    "links": [
      { "text": "More information...", "href": "https://www.iana.org/domains/reserved" }
    ]
  }
};

// Initialize listeners
document.addEventListener("DOMContentLoaded", () => {
  loadHistory();
});

document.querySelectorAll(".mode-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mode-tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".mode-section").forEach((section) => section.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#${tab.dataset.modeTarget}`).classList.add("active");
  });
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => activatePanel(tab.dataset.target));
});

clearButton.addEventListener("click", () => {
  jsonInput.value = "";
  resetOutput();
});

compareClearButton.addEventListener("click", () => {
  sourceUrlInput.value = "";
  targetUrlInput.value = "";
  resetOutput();
});

manualClearButton.addEventListener("click", () => {
  manualJsonInput.value = "";
  resetOutput();
});

// Run AI Test Action
runButton.addEventListener("click", async () => {
  resetOutput();
  activatePanel("logPanel");

  let testPackageJson;
  try {
    testPackageJson = JSON.parse(jsonInput.value);
  } catch (error) {
    setStatus(`JSON không hợp lệ: ${error.message}`, "error");
    return;
  }

  setRunning(true, "ai-test");
  setStatus("Đang khởi tạo phiên AI Test...", "running");

  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  try {
    const response = await fetch("/api/run-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testPackageJson })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error([data.error, data.detail].filter(Boolean).join("\n"));
    }

    currentRunId = data.runId;
    appendLog(`Run ID: ${data.runId}`);
    connectEvents(data.runId);
    await loadHistory();
  } catch (error) {
    setRunning(false);
    setStatus(error.message || "Không thể chạy AI Test.", "error");
    appendLog(error.stack || error.message);
  }
});

// Run Manual Test Case Action
manualRunButton.addEventListener("click", async () => {
  resetOutput();
  activatePanel("logPanel");

  let testPackageJson;
  try {
    testPackageJson = JSON.parse(manualJsonInput.value);
  } catch (error) {
    setStatus(`JSON không hợp lệ: ${error.message}`, "error");
    return;
  }

  setRunning(true, "manual-test-cases");
  setStatus("Đang khởi tạo phiên tạo test case thủ công...", "running");

  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  try {
    const response = await fetch("/api/run-manual-test-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testPackageJson })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error([data.error, data.detail].filter(Boolean).join("\n"));
    }

    currentRunId = data.runId;
    appendLog(`Run ID: ${data.runId}`);
    connectEvents(data.runId);
    await loadHistory();
  } catch (error) {
    setRunning(false);
    setStatus(error.message || "Không thể tạo test case.", "error");
    appendLog(error.stack || error.message);
  }
});

// Compare Content Action
compareButton.addEventListener("click", async () => {
  resetOutput();
  activatePanel("logPanel");

  const sourceUrl = normalizeUrlInput(sourceUrlInput.value);
  const targetUrl = normalizeUrlInput(targetUrlInput.value);

  if (!sourceUrl) {
    setStatus("URL trang gốc không hợp lệ. URL cần bắt đầu bằng http:// hoặc https://.", "error");
    return;
  }

  if (!targetUrl) {
    setStatus("URL trang đích không hợp lệ. URL cần bắt đầu bằng http:// hoặc https://.", "error");
    return;
  }

  setRunning(true, "compare");
  setStatus("Đang crawl và so sánh... có thể mất nhiều phút tùy số lượng trang.", "running");

  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  try {
    const response = await fetch("/api/compare-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceUrl, targetUrl })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error([data.error, data.detail].filter(Boolean).join("\n"));
    }

    currentRunId = data.runId;
    appendLog(`Run ID: ${data.runId}`);
    connectEvents(data.runId);
    await loadHistory();
  } catch (error) {
    setRunning(false);
    setStatus(error.message || "Không thể so sánh nội dung.", "error");
    appendLog(error.stack || error.message);
  }
});

// JSON Input Helpers
loadSampleJson.addEventListener("click", () => {
  jsonInput.value = JSON.stringify(SAMPLE_JSON, null, 2);
  jsonInput.focus();
  setStatus("Đã tải dữ liệu JSON mẫu.", "idle");
});

uploadJsonFile.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      jsonInput.value = JSON.stringify(parsed, null, 2);
      setStatus(`Tải file JSON "${file.name}" thành công.`, "success");
    } catch (err) {
      setStatus(`File JSON không hợp lệ: ${err.message}`, "error");
    }
  };
  reader.readAsText(file);
});

// Manual JSON Input Helpers
manualLoadSampleJson.addEventListener("click", () => {
  manualJsonInput.value = JSON.stringify(SAMPLE_JSON, null, 2);
  manualJsonInput.focus();
  setStatus("Đã tải dữ liệu JSON mẫu.", "idle");
});

manualUploadJsonFile.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      manualJsonInput.value = JSON.stringify(parsed, null, 2);
      setStatus(`Tải file JSON "${file.name}" thành công.`, "success");
    } catch (err) {
      setStatus(`File JSON không hợp lệ: ${err.message}`, "error");
    }
  };
  reader.readAsText(file);
});

// Copy Logs Action
copyLogButton.addEventListener("click", () => {
  const logText = logOutput.textContent;
  if (!logText) return;

  navigator.clipboard.writeText(logText).then(() => {
    const btnSpan = copyLogButton.querySelector("span");
    const originalText = btnSpan.textContent;
    btnSpan.textContent = "Copied!";
    setTimeout(() => {
      btnSpan.textContent = originalText;
    }, 2000);
  }).catch(err => {
    console.error("Lỗi sao chép logs: ", err);
  });
});

// Refresh Run History Action
refreshHistory.addEventListener("click", () => {
  loadHistory();
});

cancelRunButton.addEventListener("click", async () => {
  if (!currentRunId) return;
  cancelRunButton.disabled = true;
  try {
    const response = await fetch(`/api/runs/${encodeURIComponent(currentRunId)}/cancel`, { method: "POST" });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Không thể hủy phiên.");
    appendLog("Đã gửi yêu cầu hủy phiên.");
  } catch (error) {
    cancelRunButton.disabled = false;
    setStatus(error.message, "error");
  }
});

// Lightbox preview handlers
evidenceGrid.addEventListener("click", (e) => {
  const figure = e.target.closest("figure");
  if (!figure) return;

  const img = figure.querySelector("img");
  const figcaption = figure.querySelector("figcaption");
  if (!img) return;

  lightboxImg.src = img.src;
  lightboxCaption.textContent = figcaption ? figcaption.textContent : img.alt;
  imageLightbox.classList.add("active");
});

const closeLightbox = () => {
  imageLightbox.classList.remove("active");
  lightboxImg.src = "";
  lightboxCaption.textContent = "";
};

lightboxClose.addEventListener("click", closeLightbox);
imageLightbox.addEventListener("click", (e) => {
  if (e.target === imageLightbox || !e.target.closest(".lightbox-content")) {
    closeLightbox();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && imageLightbox.classList.contains("active")) {
    closeLightbox();
  }
});

// Load Run History from server
async function loadHistory() {
  try {
    const res = await fetch("/api/history");
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Không thể lấy lịch sử.");
    }
    renderHistoryList(data.history);
  } catch (error) {
    historyList.innerHTML = `<div class="empty-history error">Lỗi: ${escapeHtml(error.message)}</div>`;
  }
}

function renderHistoryList(history) {
  if (!history || history.length === 0) {
    historyList.innerHTML = '<div class="empty-history">Chưa có lịch sử chạy.</div>';
    return;
  }

  historyList.innerHTML = history.map(run => {
    const isCompare = run.kind === "content-comparison";
    const isManual = run.kind === "manual-test-cases";
    const date = formatTimestamp(run.startedAt);
    const label = isCompare ? "Compare" : isManual ? "Test Cases" : "AI Test";
    const badgeClass = isCompare ? "compare" : isManual ? "manual-test-cases" : "ai-test";
    const isActive = run.runId === currentRunId ? "active" : "";

    let urlDisplay = run.targetUrl || "Chưa rõ URL";
    if (isCompare && run.sourceUrl && run.targetUrl) {
      try {
        const srcHost = new URL(run.sourceUrl).hostname;
        const tgtHost = new URL(run.targetUrl).hostname;
        urlDisplay = `${srcHost} ↔ ${tgtHost}`;
      } catch {
        urlDisplay = `${run.sourceUrl} ↔ ${run.targetUrl}`;
      }
    }

    return `
      <div class="history-item ${isActive}" data-run-id="${escapeHtml(run.runId)}" data-kind="${run.kind}">
        <div class="history-details">
          <div class="history-title-row">
            <span class="history-kind-badge ${badgeClass}">${label}</span>
            <span class="history-url" title="${escapeHtml(isCompare ? `${run.sourceUrl} ↔ ${run.targetUrl}` : run.targetUrl)}">${escapeHtml(urlDisplay)}</span>
          </div>
          <div class="history-meta-row">
            <span class="history-status-dot ${escapeHtml(run.status)}"></span>
            <span>${escapeHtml(date)}</span>
          </div>
        </div>
        <button class="history-delete-btn" title="Xóa phiên chạy này" data-run-id="${escapeHtml(run.runId)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;
  }).join("");

  // Attach select handlers
  historyList.querySelectorAll(".history-item").forEach(item => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".history-delete-btn")) return;
      selectRun(item.dataset.runId);
    });
  });

  // Attach delete handlers
  historyList.querySelectorAll(".history-delete-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const runId = btn.dataset.runId;
      if (confirm(`Bạn có chắc chắn muốn xóa phiên chạy ${runId} khỏi ổ đĩa không?`)) {
        await deleteRun(runId);
      }
    });
  });
}

// Delete Run Action
async function deleteRun(runId) {
  try {
    const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Lỗi xóa phiên chạy.");
    }
    if (currentRunId === runId) {
      currentRunId = null;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      resetOutput();
    }
    await loadHistory();
  } catch (error) {
    alert(error.message);
  }
}

// Select a run from history
async function selectRun(runId) {
  currentRunId = runId;

  document.querySelectorAll(".history-item").forEach(item => {
    item.classList.toggle("active", item.dataset.runId === runId);
  });

  resetOutput();
  setStatus("Đang tải dữ liệu phiên chạy...", "running");
  activatePanel("logPanel");

  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  try {
    const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/result`);

    if (res.status === 202) {
      connectEvents(runId);
      const mode = runId.startsWith("compare-") ? "compare" : runId.startsWith("manual-") ? "manual-test-cases" : "ai-test";
      setRunning(true, mode);
      setStatus("Phiên chạy đang tiếp diễn...", "running");
      return;
    }

    const data = await res.json();
    if (!res.ok || !data.success) {
      if (data.status === "failed") {
        setStatus(data.error || "Phiên chạy bị lỗi.", "error");
        appendLog(data.error || "Lỗi chạy Codex.");
        setRunning(false);
        return;
      }
      throw new Error(data.error || "Không thể tải kết quả.");
    }

    renderResult(data);
    const statusMsg = data.status === "partial" ? "Hoàn tất một phần; cần kiểm tra artifact hoặc trang lỗi." : data.kind === "content-comparison" ? "Hoàn tất so sánh nội dung." : data.kind === "manual-test-cases" ? "Hoàn tất tạo test case." : "Hoàn tất AI Test.";
    setStatus(statusMsg, "success");
    setRunning(false);
  } catch (error) {
    setStatus(error.message || "Lỗi tải kết quả.", "error");
    appendLog(error.message);
    setRunning(false);
  }
}

function connectEvents(runId) {
  const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
  eventSource = source;

  source.addEventListener("status", (message) => {
    const event = JSON.parse(message.data);
    appendLog(event.payload);
  });

  source.addEventListener("codex", (message) => {
    const event = JSON.parse(message.data);
    appendLog(formatCodexEvent(event.payload));
  });

  source.addEventListener("stdout", (message) => {
    const event = JSON.parse(message.data);
    appendLog(event.payload);
  });

  source.addEventListener("stderr", (message) => {
    const event = JSON.parse(message.data);
    appendLog(event.payload);
  });

  source.addEventListener("crawl-progress", (message) => {
    const event = JSON.parse(message.data);
    const progress = event.payload || {};
    const suffix = progress.error ? ` - lỗi: ${progress.error}` : "";
    setStatus(`Playwright ${progress.phase || "crawl"}: ${progress.current || 0}/${progress.total || "?"}${suffix}`, progress.error ? "error" : "running");
    appendLog(`[Playwright] ${progress.phase || "crawl"} ${progress.current || 0}/${progress.total || "?"}: ${progress.url || ""}${suffix}`);
  });

  source.addEventListener("complete", (message) => {
    const event = JSON.parse(message.data);
    source.close();
    if (eventSource === source) eventSource = null;
    renderResult(event.payload);
    setRunning(false);
    const statusMsg = event.payload.status === "partial" ? "Hoàn tất một phần; cần kiểm tra artifact hoặc trang lỗi." : event.payload.kind === "content-comparison" ? "Hoàn tất so sánh nội dung." : event.payload.kind === "manual-test-cases" ? "Hoàn tất tạo test case." : "Hoàn tất AI Test.";
    setStatus(
      statusMsg,
      "success"
    );
    loadHistory();
  });

  source.addEventListener("error", (message) => {
    if (!message.data) return;
    const event = JSON.parse(message.data);
    source.close();
    if (eventSource === source) eventSource = null;
    setRunning(false);
    setStatus(event.payload, "error");
    appendLog(event.payload);
    loadHistory();
  });

  source.addEventListener("cancelled", (message) => {
    const event = JSON.parse(message.data);
    source.close();
    if (eventSource === source) eventSource = null;
    setRunning(false);
    setStatus("Phiên đã được hủy.", "idle");
    appendLog(event.payload);
    loadHistory();
  });
}

function renderResult(result) {
  if (result.kind === "content-comparison") {
    renderContentComparisonResult(result);
    return;
  } else if (result.kind === "manual-test-cases") {
    renderManualTestCasesResult(result);
    return;
  }

  renderAiTestResult(result);
}

function renderManualTestCasesResult(result) {
  const images = result.evidenceImages || [];
  evidenceGrid.classList.toggle("empty", images.length === 0);
  evidenceGrid.innerHTML = images.length
    ? images
        .map(
          (image) => `
            <figure>
              <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.fileName)}" loading="lazy" />
              <figcaption>${escapeHtml(image.fileName)}</figcaption>
            </figure>
          `
        )
        .join("")
    : "Không có ảnh chụp lỗi trong thiết kế test case.";

  testCasesOutput.innerHTML = renderSafeMarkdown(result.testCasesMd || "_Không có nội dung._");
  downloadTestCasesMd.href = result.files.testCasesReport;
  downloadTestCasesMd.classList.remove("hidden");

  if (result.files.testCasesCsv) {
    downloadTestCasesCsv.href = result.files.testCasesCsv;
    downloadTestCasesCsv.classList.remove("hidden");
  }

  appendLog(`Thư mục run: ${result.runFolder}`);
  updateTabVisibility("manual-test-cases", images.length > 0);
  activatePanel("testCasesPanel");
}

function renderAiTestResult(result) {
  const images = result.evidenceImages || [];
  evidenceGrid.classList.toggle("empty", images.length === 0);
  evidenceGrid.innerHTML = images.length
    ? images
        .map(
          (image) => `
            <figure>
              <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.fileName)}" loading="lazy" />
              <figcaption>${escapeHtml(image.fileName)}</figcaption>
            </figure>
          `
        )
        .join("")
    : "Không có ảnh chụp trong TEST_EVIDENCE.";

  reportOutput.innerHTML = renderSafeMarkdown(result.testReportMd || "_Không có nội dung._");
  fixOutput.innerHTML = renderSafeMarkdown(result.fixPlanMd || "_Không có nội dung._");
  downloadReport.href = result.files.testReport;
  downloadFixPlan.href = result.files.fixPlan;
  downloadReport.classList.remove("hidden");
  downloadFixPlan.classList.remove("hidden");
  appendLog(`Thư mục run: ${result.runFolder}`);
  updateTabVisibility("ai-test", images.length > 0);
  activatePanel("reportPanel");
}

function renderContentComparisonResult(result) {
  comparisonReportOutput.innerHTML = renderSafeMarkdown(
    result.contentComparisonReportMd || "_Không có nội dung báo cáo._"
  );
  renderPagePairs(result.pagePairs || []);

  const images = result.evidenceImages || [];
  evidenceGrid.classList.toggle("empty", images.length === 0);
  evidenceGrid.innerHTML = images.length
    ? images
        .map(
          (image) => `
            <figure>
              <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.fileName)}" loading="lazy" />
              <figcaption>${escapeHtml(image.fileName)}</figcaption>
            </figure>
          `
        )
        .join("")
    : "Không có ảnh chụp lỗi trong so sánh.";

  downloadComparisonReport.href = result.files.contentComparisonReport;
  downloadComparisonReport.classList.remove("hidden");

  if (result.pagePairsCsv) {
    downloadPagePairs.href = result.files.pagePairs;
    downloadPagePairs.classList.remove("hidden");
  }

  appendLog(`Thư mục run: ${result.runFolder}`);
  updateTabVisibility("content-comparison", images.length > 0);
  activatePanel("comparisonPanel");
}

function renderPagePairs(pairs) {
  if (!pairs.length) {
    pairSummary.className = "empty-state";
    pairSummary.textContent = "Không có dữ liệu page_pairs.csv hoặc file chưa được tạo.";
    return;
  }

  pairSummary.className = "pair-table-wrap";
  pairSummary.innerHTML = `
    <table class="pair-table">
      <thead>
        <tr>
          <th>Trạng thái</th>
          <th>Trang gốc</th>
          <th>Trang đích</th>
          <th>Độ khớp</th>
        </tr>
      </thead>
      <tbody>
        ${pairs
          .map(
            (pair) => `
              <tr class="pair-${escapeHtml(pair.statusClass)}">
                <td><span class="status-pill ${escapeHtml(pair.statusClass)}">${escapeHtml(pair.statusLabel)}</span></td>
                <td>${renderUrlCell(pair.sourceUrl)}</td>
                <td>${renderUrlCell(pair.targetUrl)}</td>
                <td>${escapeHtml(pair.matchConfidence || "Chưa rõ")}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function resetOutput() {
  logOutput.textContent = "";
  evidenceGrid.textContent = "Chưa có ảnh chụp.";
  evidenceGrid.classList.add("empty");
  pairSummary.className = "empty-state";
  pairSummary.textContent = "Chưa có dữ liệu cặp trang.";
  reportOutput.innerHTML = "";
  fixOutput.innerHTML = "";
  comparisonReportOutput.innerHTML = "";
  testCasesOutput.innerHTML = "";
  downloadReport.classList.add("hidden");
  downloadFixPlan.classList.add("hidden");
  downloadComparisonReport.classList.add("hidden");
  downloadPagePairs.classList.add("hidden");
  downloadTestCasesMd.classList.add("hidden");
  downloadTestCasesCsv.classList.add("hidden");
  updateTabVisibility("reset");
  setStatus("Sẵn sàng.", "idle");
}

function appendLog(value) {
  if (!value) return;
  logOutput.textContent += `${value}\n`;
  logOutput.scrollTop = logOutput.scrollHeight;
}

function setRunning(isRunning, mode = "") {
  runButton.disabled = isRunning;
  clearButton.disabled = isRunning;
  compareButton.disabled = isRunning;
  compareClearButton.disabled = isRunning;
  jsonInput.disabled = isRunning;
  sourceUrlInput.disabled = isRunning;
  targetUrlInput.disabled = isRunning;

  manualRunButton.disabled = isRunning;
  manualClearButton.disabled = isRunning;
  manualJsonInput.disabled = isRunning;
  cancelRunButton.classList.toggle("hidden", !isRunning);
  cancelRunButton.disabled = !isRunning;
  if (isRunning) currentRunMode = mode;

  const runSpinner = runButton.querySelector(".btn-spinner");
  const runText = runButton.querySelector(".btn-text");
  const compareSpinner = compareButton.querySelector(".btn-spinner");
  const compareText = compareButton.querySelector(".btn-text");
  const manualSpinner = manualRunButton.querySelector(".btn-spinner");
  const manualText = manualRunButton.querySelector(".btn-text");

  if (isRunning) {
    if (mode === "ai-test") {
      runSpinner.classList.remove("hidden");
      runText.textContent = "Đang chạy...";
    } else if (mode === "compare") {
      compareSpinner.classList.remove("hidden");
      compareText.textContent = "Đang so sánh...";
    } else if (mode === "manual-test-cases") {
      manualSpinner.classList.remove("hidden");
      manualText.textContent = "Đang tạo...";
    }
  } else {
    runSpinner.classList.add("hidden");
    runText.textContent = "Chạy AI Test";
    compareSpinner.classList.add("hidden");
    compareText.textContent = "So Sánh Nội Dung";
    manualSpinner.classList.add("hidden");
    manualText.textContent = "Tạo Test Case";
  }
}

function setStatus(message, type) {
  statusBox.textContent = message;
  statusBox.className = `status ${type}`;
}

function renderSafeMarkdown(value) {
  if (!window.marked?.parse) return `<pre>${escapeHtml(value)}</pre>`;
  const html = marked.parse(String(value), { gfm: true, breaks: true, headerIds: false, mangle: false });
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, iframe, object, embed, style, form, input, button").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith("on") || attribute.name.toLowerCase() === "style") node.removeAttribute(attribute.name);
    });
  });
  doc.querySelectorAll("a, img").forEach((node) => {
    const attr = node.tagName === "A" ? "href" : "src";
    const url = node.getAttribute(attr) || "";
    if (!/^https?:\/\//i.test(url)) node.removeAttribute(attr);
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noreferrer noopener");
    }
  });
  return doc.body.innerHTML;
}

function activatePanel(panelId) {
  document.querySelectorAll(".tab").forEach((item) => {
    item.classList.toggle("active", item.dataset.target === panelId);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === panelId);
  });
}

function normalizeUrlInput(value) {
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function renderUrlCell(value) {
  if (!value) return "<span class=\"muted\">Không có</span>";
  let parsed;
  try { parsed = new URL(value); } catch { return "<span class=\"muted\">URL không hợp lệ</span>"; }
  if (!["http:", "https:"].includes(parsed.protocol)) return "<span class=\"muted\">URL không an toàn</span>";
  const safeValue = escapeHtml(parsed.href);
  return `<a href="${safeValue}" target="_blank" rel="noreferrer">${safeValue}</a>`;
}

function formatCodexEvent(event) {
  if (typeof event === "string") return event;
  if (event?.msg) return event.msg;
  if (event?.message) return event.message;
  if (event?.type) return `[${event.type}] ${JSON.stringify(event)}`;
  return JSON.stringify(event);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatTimestamp(isoString) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    const padding = (n) => String(n).padStart(2, "0");
    const yyyy = date.getFullYear();
    const mm = padding(date.getMonth() + 1);
    const dd = padding(date.getDate());
    const hh = padding(date.getHours());
    const min = padding(date.getMinutes());
    const ss = padding(date.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  } catch {
    return isoString;
  }
}

function updateTabVisibility(kind, hasImages = false) {
  const tabLog = document.querySelector('.tab[data-target="logPanel"]');
  const tabPairs = document.querySelector('.tab[data-target="pairsPanel"]');
  const tabComparison = document.querySelector('.tab[data-target="comparisonPanel"]');
  const tabEvidence = document.querySelector('.tab[data-target="evidencePanel"]');
  const tabReport = document.querySelector('.tab[data-target="reportPanel"]');
  const tabFix = document.querySelector('.tab[data-target="fixPanel"]');
  const tabTestCases = document.querySelector('.tab[data-target="testCasesPanel"]');

  if (!tabLog || !tabPairs || !tabComparison || !tabEvidence || !tabReport || !tabFix || !tabTestCases) return;

  if (kind === "ai-test") {
    tabPairs.classList.add("hidden");
    tabComparison.classList.add("hidden");
    tabTestCases.classList.add("hidden");
    tabReport.classList.remove("hidden");
    tabFix.classList.remove("hidden");
    tabEvidence.classList.remove("hidden");
  } else if (kind === "content-comparison") {
    tabPairs.classList.remove("hidden");
    tabComparison.classList.remove("hidden");
    tabTestCases.classList.add("hidden");
    tabReport.classList.add("hidden");
    tabFix.classList.add("hidden");
    if (hasImages) {
      tabEvidence.classList.remove("hidden");
    } else {
      tabEvidence.classList.add("hidden");
    }
  } else if (kind === "manual-test-cases") {
    tabPairs.classList.add("hidden");
    tabComparison.classList.add("hidden");
    tabReport.classList.add("hidden");
    tabFix.classList.add("hidden");
    tabTestCases.classList.remove("hidden");
    if (hasImages) {
      tabEvidence.classList.remove("hidden");
    } else {
      tabEvidence.classList.add("hidden");
    }
  } else {
    tabPairs.classList.remove("hidden");
    tabComparison.classList.remove("hidden");
    tabReport.classList.remove("hidden");
    tabFix.classList.remove("hidden");
    tabEvidence.classList.remove("hidden");
    tabTestCases.classList.remove("hidden");
  }
}
