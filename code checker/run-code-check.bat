@echo off
setlocal

REM --- Portable code-check runner ---
REM Drop this whole folder into any project. Double-click this .bat.
REM It runs Claude Code against the PARENT directory (the project root)
REM and saves a dated review into this folder.

set "CHECKER_DIR=%~dp0"
set "PROJECT_DIR=%CHECKER_DIR%.."

REM Build a YYYY-MM-DD stamp via PowerShell (reliable on Windows 10/11)
for /f %%a in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "STAMP=%%a"
set "OUTFILE=%CHECKER_DIR%code_review_%STAMP%.txt"

where claude >nul 2>nul
if errorlevel 1 (
    echo ERROR: 'claude' CLI not found on PATH.
    echo Install Claude Code and re-run.
    pause
    exit /b 1
)

if not exist "%CHECKER_DIR%prompt.txt" (
    echo ERROR: prompt.txt missing next to this .bat.
    pause
    exit /b 1
)

echo.
echo === Running code review ===
echo   Project : %PROJECT_DIR%
echo   Output  : %OUTFILE%
echo This can take several minutes. Do not close this window.
echo.

cd /d "%PROJECT_DIR%"
claude -p --dangerously-skip-permissions < "%CHECKER_DIR%prompt.txt" > "%OUTFILE%"

if errorlevel 1 (
    echo.
    echo Claude exited with an error. Check %OUTFILE% for partial output.
    pause
    exit /b 1
)

echo.
echo === Done ===
echo Review saved to: %OUTFILE%
echo.
pause
