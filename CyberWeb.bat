@echo off
cd /d "%~dp0"

:: Kill anything already on our ports
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 " ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 1 /nobreak > nul

:: Open one terminal running the unified launcher
start "CyberWeb" cmd /k "cd /d "%~dp0" && node start.js"

:: Give the servers a moment to boot, then open the browser
timeout /t 6 /nobreak > nul
start http://localhost:5173