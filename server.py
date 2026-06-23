#!/usr/bin/env python3
"""Tiny local server for the Job Tracker app.

Serves the files in this folder over http://127.0.0.1:<port> and accepts a
single POST /save request that overwrites tracker.csv in place. Standard
library only -- no installs needed.
"""

import http.server
import os
import shutil
import socket
import socketserver
import tempfile
import time
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, "tracker.csv")
BACKUP_DIR = os.path.join(HERE, "backups")
KEEP_BACKUPS = 10


def backup_existing_csv():
    """Copy the current tracker.csv into backups/ before it's overwritten,
    then prune to the most recent KEEP_BACKUPS files. Best-effort: a backup
    failure must never block a save."""
    if not os.path.exists(CSV_PATH):
        return
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        # Millisecond resolution so rapid successive saves don't overwrite
        # each other's backups.
        now = time.time()
        stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(now))
        stamp += f"-{int((now % 1) * 1000):03d}"
        shutil.copy2(CSV_PATH, os.path.join(BACKUP_DIR, f"tracker-{stamp}.csv"))
        backups = sorted(
            f for f in os.listdir(BACKUP_DIR)
            if f.startswith("tracker-") and f.endswith(".csv")
        )
        for old in backups[:-KEEP_BACKUPS]:
            os.remove(os.path.join(BACKUP_DIR, old))
    except Exception:  # noqa: BLE001 -- never let backup issues block a save
        pass


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def do_POST(self):
        if self.path.rstrip("/") != "/save":
            self.send_error(404, "Not found")
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")

        # Snapshot the current file before overwriting, then write atomically:
        # temp file in the same dir, then os.replace.
        try:
            backup_existing_csv()
            fd, tmp = tempfile.mkstemp(dir=HERE, prefix=".tracker-", suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
                f.write(body)
            os.replace(tmp, CSV_PATH)
        except Exception as exc:  # noqa: BLE001
            self.send_error(500, f"Save failed: {exc}")
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"saved")

    def end_headers(self):
        # Never cache app files, so edits to the source are always picked up.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):  # keep the console quiet
        pass

    def handle_one_request(self):
        # Browsers routinely close connections early (e.g. on navigation or
        # reload). Swallow the resulting broken-pipe/reset errors so the
        # launcher window stays clean instead of printing a scary traceback.
        try:
            super().handle_one_request()
        except (ConnectionResetError, BrokenPipeError):
            self.close_connection = True


def find_free_port(preferred=8753):
    for port in [preferred] + list(range(8754, 8800)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return preferred


def main():
    port = find_free_port()
    url = f"http://127.0.0.1:{port}/index.html"
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), Handler) as httpd:
        print("\n  Job Tracker is running.")
        print(f"  Open: {url}")
        print("  Leave this window open while you use the app.")
        print("  Press Ctrl+C here to stop.\n")
        try:
            webbrowser.open(url)
        except Exception:  # noqa: BLE001
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Stopped. You can close this window.")


if __name__ == "__main__":
    main()
