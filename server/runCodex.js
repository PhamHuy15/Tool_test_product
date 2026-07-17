import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";

export function checkCodexCli() {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnCodex(["--version"]);
    } catch (error) {
      resolve(codexUnavailable(error));
      return;
    }

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve(codexUnavailable(error));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true, version: stdout.trim() || stderr.trim() });
        return;
      }

      resolve({
        ok: false,
        message:
          "Codex CLI chưa sẵn sàng. Hãy kiểm tra cài đặt và đăng nhập bằng `codex login`.",
        detail: tail(stderr || stdout),
      });
    });
  });
}

export function runCodexExec({ cwd, prompt }) {
  const events = new EventEmitter();
  let child;

  try {
    child = spawnCodex(
      [
        "exec",
        "-C",
        cwd,
        "--skip-git-repo-check",
        "--full-auto",
        "--json",
        "-c",
        "sandbox_workspace_write.network_access=true",
        "-",
      ],
      { cwd },
    );
  } catch (error) {
    process.nextTick(() => events.emit("error", codexSpawnError(error)));
    return events;
  }

  let stdoutBuffer = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        events.emit("event", { type: "codex", payload: JSON.parse(line) });
      } catch {
        events.emit("event", { type: "stdout", payload: line });
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    events.emit("event", { type: "stderr", payload: text.trimEnd() });
  });

  child.on("error", (error) => {
    events.emit("error", error);
  });

  child.on("close", (code) => {
    if (stdoutBuffer.trim()) {
      try {
        events.emit("event", {
          type: "codex",
          payload: JSON.parse(stdoutBuffer),
        });
      } catch {
        events.emit("event", { type: "stdout", payload: stdoutBuffer.trim() });
      }
    }

    events.emit("close", { code, stderr: tail(stderr) });
  });

  child.stdin.write(prompt);
  child.stdin.end();

  events.killTree = () => {
    if (!child.pid || child.killed) return;

    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        shell: false,
        windowsHide: true,
      });
      return;
    }

    child.kill("SIGTERM");
  };

  return events;
}

function tail(value, maxLength = 4000) {
  if (!value) return "";
  return value.length > maxLength ? value.slice(-maxLength) : value;
}

function spawnCodex(args, options = {}) {
  const command = resolveCodexCommand();
  const baseOptions = {
    ...options,
    shell: false,
    windowsHide: true,
  };

  if (command.viaCmd) {
    return spawn(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", command.path, ...args],
      baseOptions,
    );
  }

  return spawn(command.path, args, baseOptions);
}

function resolveCodexCommand() {
  const configured = process.env.CODEX_BIN?.trim();
  if (configured) {
    return {
      path: configured,
      viaCmd: process.platform === "win32" && /\.(cmd|bat)$/i.test(configured),
    };
  }

  if (process.platform !== "win32") {
    return { path: "codex", viaCmd: false };
  }

  const cmdShim = findOnPath("codex.cmd");
  if (cmdShim) return { path: cmdShim, viaCmd: true };

  const exe = findOnPath("codex.exe");
  if (exe) return { path: exe, viaCmd: false };

  return { path: "codex", viaCmd: false };
}

function findOnPath(fileName) {
  const pathValue = process.env.PATH || "";
  for (const rawDir of pathValue.split(path.delimiter)) {
    const dir = rawDir.replace(/^"|"$/g, "");
    if (!dir) continue;

    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function codexUnavailable(error) {
  return {
    ok: false,
    message:
      "Codex CLI chưa chạy được từ server local. Hãy cài bằng `npm install -g @openai/codex`, sau đó chạy `codex login` và khởi động lại server.",
    detail: codexSpawnError(error).message,
  };
}

function codexSpawnError(error) {
  if (error?.code === "EPERM") {
    return new Error(
      "Windows đang chặn executable `codex` hiện tại (spawn EPERM). Trên máy này `codex` đang trỏ tới bản WindowsApps bị Access denied; hãy cài Codex CLI bản npm bằng `npm install -g @openai/codex`, chạy `codex login`, rồi restart server.",
    );
  }

  if (error?.code === "ENOENT") {
    return new Error(
      "Không tìm thấy Codex CLI trong PATH. Hãy cài bằng `npm install -g @openai/codex`, sau đó chạy `codex login`.",
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}
