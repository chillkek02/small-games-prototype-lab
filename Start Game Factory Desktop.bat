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

echo Checking Microsoft Edge for automated QA...
where msedge >nul 2>nul
if errorlevel 1 (
  if not exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" if not exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    echo WARNING: Microsoft Edge was not detected. The app can open, but automated game QA may require Edge to be installed or updated.
    echo.
  )
)

echo Starting Gutpopper Game Factory Desktop...
call npm run desktop
exit /b %errorlevel%

:fail
echo.
echo Desktop setup failed. Review the error above.
pause
exit /b 1
