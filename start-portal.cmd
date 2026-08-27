@echo off
REM ===========================================================================
REM  Wild Nutrition Practitioner Portal — one-click local start.
REM
REM  Double-click this file. It does the three things that otherwise go wrong:
REM    1. cd's to the project (running npm from your home folder fails with
REM       "Could not read package.json")
REM    2. kills a stale worker still holding .open-next (the EBUSY error)
REM    3. makes sure node is on PATH, even in a shell that lacks it
REM
REM  Usage:  start-portal.cmd        -> real Cloudflare runtime on :8787 (~3 min)
REM          start-portal.cmd dev    -> fast Node dev server on :3100 (seconds)
REM ===========================================================================

cd /d "%~dp0"

REM --- make sure node/npm are reachable even from a bare shell ---------------
where npm >nul 2>&1
if errorlevel 1 (
  set "PATH=%LOCALAPPDATA%\node\node-v22.20.0-win-x64;%PATH%"
)
where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo   ERROR: npm not found. Node is not installed where this script expects:
  echo   %LOCALAPPDATA%\node\node-v22.20.0-win-x64
  echo.
  pause
  exit /b 1
)

REM --- stop a stale worker holding the build directory -----------------------
REM Only workerd and wrangler/opennext node processes — never your other node apps.
echo Checking for a stale server...
taskkill /F /IM workerd.exe /T >nul 2>&1
powershell -NoProfile -Command ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'wrangler|opennextjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

if /I "%~1"=="dev" goto :dev

REM --- Cloudflare preview (the runtime that matters) ------------------------
echo.
echo   Building for the real Cloudflare runtime. This takes about 3 minutes.
echo   It goes quiet during "Collecting build traces" — that is normal, wait.
echo.
echo   When it is ready:  http://localhost:8787/dashboard
echo   Sign in with:      sarah.whitfield@example.com
echo   Admin password:    preview-admin
echo.
if exist ".open-next" rmdir /s /q ".open-next" >nul 2>&1
npm run preview:cf
goto :end

:dev
echo.
echo   Starting the fast dev server (Node runtime, not Cloudflare).
echo   Good for a quick look; judge the app on :8787 before launch.
echo.
echo   When it is ready:  http://localhost:3100/dashboard
echo.
npm run dev

:end
echo.
echo   Server stopped.
pause
