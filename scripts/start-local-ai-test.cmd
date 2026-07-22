@echo off
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)

where codex.cmd >nul 2>nul
if errorlevel 1 (
  echo Codex CLI is required. Install @openai/codex and run codex login.
  pause
  exit /b 1
)

if not exist "%~dp0..\server\node_modules\express" (
  echo Installing server dependencies...
  cd /d "%~dp0..\server"
  call npm.cmd install --omit=dev
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

if not exist "%LOCALAPPDATA%\ms-playwright" (
  echo Installing Playwright Chromium browser...
  cd /d "%~dp0..\server"
  call npx.cmd playwright install chromium
  if errorlevel 1 (
    echo Playwright browser installation failed.
    pause
    exit /b 1
  )
)

start "Local AI Test Web" /min cmd /c "cd /d \"%~dp0..\server\" && npm.cmd start"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:4545
endlocal
