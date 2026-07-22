# Local AI Test Web — User Guide

## Requirements

- Windows 10/11.
- Node.js 18 or newer.
- Codex CLI installed with `npm install -g @openai/codex`.
- Codex CLI authenticated with `codex login`.
- Playwright Chromium. The launcher installs it automatically when it is missing.

## First run

1. Install the application with the Windows installer.
2. Install Node.js and Codex CLI if the launcher reports they are missing.
3. Run `codex login` once in PowerShell.
4. Open the Local AI Test Web shortcut.
5. The browser opens at `http://127.0.0.1:4545`.

The application only accepts public `http://` and `https://` targets by default. Local or private targets are intentionally blocked.

Playwright performs the browser crawl directly. Codex is used for semantic QA analysis and report generation. A run stores crawl manifests, page snapshots, screenshots and final reports inside its run folder.

## Troubleshooting

- If port 4545 is busy, start with `PORT=4546` from PowerShell and open the matching URL.
- If Codex is unavailable, run `where.exe codex.cmd`, then `codex login`.
- Run results are stored locally in the `runs` directory and can be deleted from the history panel.
