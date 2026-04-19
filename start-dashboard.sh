#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "  kyle's kicka*s kareer"
echo "  ====================="
echo ""

# Install Node.js if missing
if ! command -v node &> /dev/null; then
    echo "  Installing Node.js (one-time setup)..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update -qq && sudo apt-get install -y nodejs npm
    elif command -v brew &> /dev/null; then
        brew install node
    else
        echo "  ERROR: Install Node.js from https://nodejs.org then re-run this."
        read -p "  Press Enter to exit..." ; exit 1
    fi
    echo ""
fi

# Install dependencies if missing
[ ! -d "node_modules" ] && echo "  Installing dependencies (one-time)..." && npm install --silent

# Free up port 3000
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null
fuser -k 3000/tcp 2>/dev/null

echo "  Dashboard loading at http://localhost:3000"
echo "  Press Ctrl+C to stop"
echo ""

# Open browser after server starts
(sleep 2 && xdg-open http://localhost:3000 2>/dev/null || open http://localhost:3000 2>/dev/null) &

node server.js
