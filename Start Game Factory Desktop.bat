@echo off
setlocal
cd /d "%~dp0factory"

echo.
echo ========================================
echo   GUTPOPPER GAME FACTORY DESKTOP
 echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not available in PATH.
  pause
  exit /b 1
)

if not exist "node_modules\electron" (
  echo First-time desktop setup: installing dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

if not exist "node_modules\playwright-core\.local-browsers" (
  echo Installing the Chromium QA runtime...
  call npm run prepare:chromium
  if errorlevel 1 goto :fail
)

echo Starting Gutpopper Game Factory Desktop...
call npm run desktop
exit /b %errorlevel%

:fail
echo.
echo Desktop setup failed. Review the error above.
pause
exit /b 1
