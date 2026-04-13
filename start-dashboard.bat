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

:: Install dependencies if needed
if not exist "node_modules" (
    echo   Installing dependencies...
    npm install --silent
    echo   Dependencies installed!
)

echo.
echo   Starting dashboard on http://localhost:3000
echo   Press Ctrl+C to stop
echo.

:: Open browser and start server
start "" http://localhost:3000
node server.js
