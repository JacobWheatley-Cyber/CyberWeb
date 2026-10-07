@echo off
cd /d "%~dp0"
if errorlevel 1 exit /b 1

:: Open one terminal running the unified launcher
start "CyberWeb" cmd /k node start.js

:: Open the browser only after both local services respond.
node waitForReady.js
if errorlevel 1 (
  echo CyberWeb did not finish starting. Check the CyberWeb terminal for the startup error.
  pause
  exit /b 1
)
start "" "http://localhost:5173"
