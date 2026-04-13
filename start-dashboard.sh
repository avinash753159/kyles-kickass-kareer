#!/bin/bash
# Kyle's Job Board - Start Dashboard
# Works on Chromebook (Linux), Mac, and Linux

cd "$(dirname "$0")"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Installing..."
    if command -v apt &> /dev/null; then
        # Chromebook / Debian / Ubuntu
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v brew &> /dev/null; then
        # Mac
        brew install node
    else
        echo "Please install Node.js from https://nodejs.org"
        exit 1
    fi
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo ""
echo "Starting Kyle's Job Board..."
echo "Open http://localhost:3000 in your browser"
echo ""

# Try to open browser automatically
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000 &
elif command -v open &> /dev/null; then
    open http://localhost:3000 &
fi

node server.js
