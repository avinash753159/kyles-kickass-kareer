@echo off
title Kyle's Kicka*s Kareer
echo.
echo   kyle's kicka*s kareer
echo   =====================
echo.

cd /d "%~dp0"

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo   ERROR: Node.js is not installed.
    echo   Download it from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo   Node.js:
node --version

:: Kill any existing node processes on port 3000
echo   Cleaning up old processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>nul
)

:: Clear caches
echo   Clearing caches...
if exist "node_modules\.cache" rmdir /s /q "node_modules\.cache" 2>nul

:: Fresh install of dependencies
if not exist "node_modules" (
    echo   Installing dependencies...
    npm install --silent
    echo   Dependencies installed!
)

echo.
echo   Starting dashboard on http://localhost:3000
echo   Press Ctrl+C to stop
echo.

:: Open browser (hard refresh hint) and start server
start "" http://localhost:3000
node server.js
