@echo off
setlocal
cd /d "%~dp0factory"

echo.
echo ========================================
echo   GUTPOPPER GAME FACTORY
 echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not available in PATH.
  echo Install Node.js 20 or newer, then run this again.
  pause
  exit /b 1
)

if not exist "node_modules\playwright" (
  echo First-time setup: installing factory dependencies...
  call npm install
  if errorlevel 1 goto :fail

  echo Installing Chromium for automated desktop/mobile QA...
  call npx playwright install chromium
  if errorlevel 1 goto :fail
)

echo Checking Codex...
where codex >nul 2>nul
if errorlevel 1 (
  echo WARNING: Codex CLI was not found in PATH.
  echo The dashboard will open, but AI build jobs will not run until Codex is installed and signed in.
  echo.
)

echo Starting local factory server...
start "Gutpopper Game Factory Server" cmd /k "npm start"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4177"
exit /b 0

:fail
echo.
echo Game Factory setup failed. Review the error above.
pause
exit /b 1
