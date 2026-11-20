@echo off
title Letter Draft Assistant v2.0 - Server
cd /d "%~dp0"

echo ====================================================================
echo   Letter Draft Assistant v2.0 (सुरक्षित पत्र-प्रारूप एवं पंजी प्रणाली)
echo ====================================================================

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [!] Node.js is not installed on this PC.
  echo     Please install Node.js LTS from https://nodejs.org and double-click start.bat again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [*] First-time setup: Installing required packages ^(docx, pdfkit, exceljs^)...
  call npm install --no-fund --no-audit
  if %errorlevel% neq 0 (
    echo [!] Package installation failed. Check your internet connection and retry.
    pause
    exit /b 1
  )
)

start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
pause
