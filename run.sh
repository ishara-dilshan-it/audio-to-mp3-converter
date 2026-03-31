#!/bin/bash

echo "==================================================="
echo "Starting mp3-converter-ish Local Server"
echo "==================================================="
echo ""

# Check if node is installed
if ! command -v node &> /dev/null
then
    echo "[ERROR] Node.js is not installed! Please install it from https://nodejs.org/"
    exit 1
fi

# Kill any existing process on port 3000
echo "[INFO] Checking for existing processes on port 3000..."
PID=$(lsof -t -i:3000 2>/dev/null)
if [ ! -z "$PID" ]; then
    echo "[INFO] Found existing process (PID: $PID). Terminating it..."
    kill -9 $PID
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "[INFO] First run detected. Installing dependencies..."
    npm install
fi

echo "[INFO] Starting the development server..."
echo "[INFO] A browser window will open automatically."

# Open browser depending on OS
if which xdg-open > /dev/null
then
  xdg-open http://127.0.0.1:3000 &
elif which gnome-open > /dev/null
then
  gnome-open http://127.0.0.1:3000 &
elif which open > /dev/null
then
  open http://127.0.0.1:3000 &
fi

# Start the server
npm run dev
