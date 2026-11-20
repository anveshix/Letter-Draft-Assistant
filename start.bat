@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org and run again. & pause & exit /b)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
pause
