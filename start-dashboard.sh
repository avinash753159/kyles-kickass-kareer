#!/bin/bash
# ═══════════════════════════════════════════════════
#  Kyle's Kicka*s Kareer - Dashboard Launcher
#  Double-click this file or run: bash start-dashboard.sh
#  Works on Chromebook, Mac, and Linux
# ═══════════════════════════════════════════════════

cd "$(dirname "$0")"

echo ""
echo "  kyle's kicka*s kareer"
echo "  ====================="
echo ""

# ── Step 1: Check for Node.js ──────────────────────
if ! command -v node &> /dev/null; then
    echo "  Node.js not found. Installing..."
    echo ""
    if command -v apt-get &> /dev/null; then
        # Chromebook / Debian / Ubuntu
        sudo apt-get update -qq
        sudo apt-get install -y nodejs npm
    elif command -v brew &> /dev/null; then
        # Mac
        brew install node
    else
        echo "  ERROR: Please install Node.js from https://nodejs.org"
        echo "  Then run this script again."
        read -p "  Press Enter to exit..."
        exit 1
    fi
    echo ""
    echo "  Node.js installed!"
fi

echo "  Node.js: $(node --version)"

# ── Step 2: Install dependencies ───────────────────
if [ ! -d "node_modules" ]; then
    echo "  Installing dependencies..."
    npm install --silent
    echo "  Dependencies installed!"
fi

# ── Step 3: Kill any existing instance on port 3000 ─
if command -v lsof &> /dev/null; then
    lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null
elif command -v fuser &> /dev/null; then
    fuser -k 3000/tcp 2>/dev/null
fi

# ── Step 4: Start server and open browser ──────────
echo ""
echo "  Starting dashboard on http://localhost:3000"
echo "  Press Ctrl+C to stop"
echo ""

# Open browser after a short delay (give server time to start)
(sleep 2 && {
    if command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:3000 2>/dev/null
    elif command -v open &> /dev/null; then
        open http://localhost:3000
    elif command -v sensible-browser &> /dev/null; then
        sensible-browser http://localhost:3000 2>/dev/null
    fi
}) &

node server.js
