@echo off
title Kyle's Job Board
echo Starting Kyle's Job Board...
echo.

cd /d "%~dp0"
start "" http://localhost:3000
node server.js
