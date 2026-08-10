@echo off
cd /d "%~dp0"
echo.
echo SMALL GAMES PROTOTYPE LAB - PUBLISH UPDATES
echo ------------------------------------------
git status
echo.
git add .
git commit -m "Update prototype lab builds"
git push
echo.
echo Finished. GitHub Pages may take a few minutes to update.
pause
