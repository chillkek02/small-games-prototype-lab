@echo off
setlocal
cd /d "%~dp0factory"

echo.
echo ========================================
echo   BUILD GUTPOPPER GAME FACTORY APP
 echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not available in PATH.
  echo Install Node.js 20 or newer, then run this file again.
  pause
  exit /b 1
)

echo Installing/updating desktop build dependencies...
call npm install
if errorlevel 1 goto :fail

echo.
echo Building Windows installer and portable ZIP...
call npm run make:win
if errorlevel 1 goto :fail

echo.
echo ========================================
echo   BUILD COMPLETE
 echo ========================================
echo.
echo The installer is inside:
echo %CD%\out\make\squirrel.windows\x64
explorer "%CD%\out\make"
pause
exit /b 0

:fail
echo.
echo Windows app build failed. Review the error above.
pause
exit /b 1
