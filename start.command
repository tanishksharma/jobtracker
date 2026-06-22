#!/bin/bash
# Double-click this file to launch the Job Tracker.
# It starts a tiny local server and opens the app in your browser.
cd "$(dirname "$0")" || exit 1

# Prefer python3, fall back to python.
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "Python is required but was not found."
  echo "On macOS, run 'python3' once in Terminal to install the developer tools."
  read -r -p "Press Return to close..."
  exit 1
fi

exec "$PY" server.py
