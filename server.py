#!/usr/bin/env python3
"""Tiny local server for the Job Tracker app.

Serves the files in this folder over http://127.0.0.1:<port> and accepts a
single POST /save request that overwrites tracker.csv in place. Standard
library only -- no installs needed.
"""

import http.server
import json
import os
import re
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
BACKUP_NAME_RE = re.compile(r"^tracker-\d{8}-\d{6}-\d{3}\.csv$")


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


def list_backups():
    """Return backups newest-first as [{name, when, size}, ...]."""
    if not os.path.isdir(BACKUP_DIR):
        return []
    items = []
    for name in os.listdir(BACKUP_DIR):
        if not BACKUP_NAME_RE.match(name):
            continue
        path = os.path.join(BACKUP_DIR, name)
        # name is tracker-YYYYMMDD-HHMMSS-mmm.csv
        d, t = name[len("tracker-"):-len(".csv")].split("-")[:2]
        when = (f"{d[0:4]}-{d[4:6]}-{d[6:8]} "
                f"{t[0:2]}:{t[2:4]}:{t[4:6]}")
        items.append({"name": name, "when": when, "size": os.path.getsize(path)})
    items.sort(key=lambda it: it["name"], reverse=True)
    return items


def restore_backup(name):
    """Replace tracker.csv with the named backup, after snapshotting the
    current file first. Returns (ok, message)."""
    if not BACKUP_NAME_RE.match(name):
        return False, "Invalid backup name."
    src = os.path.join(BACKUP_DIR, name)
    # Guard against any path trickery: resolved path must live in BACKUP_DIR.
    if os.path.dirname(os.path.abspath(src)) != os.path.abspath(BACKUP_DIR):
        return False, "Invalid backup path."
    if not os.path.isfile(src):
        return False, "Backup not found."
    try:
        backup_existing_csv()  # so a restore is itself undoable
        fd, tmp = tempfile.mkstemp(dir=HERE, prefix=".tracker-", suffix=".tmp")
        with os.fdopen(fd, "wb") as out, open(src, "rb") as inp:
            shutil.copyfileobj(inp, out)
        os.replace(tmp, CSV_PATH)
        return True, "restored"
    except Exception as exc:  # noqa: BLE001
        return False, f"Restore failed: {exc}"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def _send_text(self, code, text):
        body = text.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/") == "/backups":
            self._send_json(list_backups())
            return
        super().do_GET()

    def do_POST(self):
        path = self.path.rstrip("/")
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")

        if path == "/save":
            # Snapshot the current file before overwriting, then write
            # atomically: temp file in the same dir, then os.replace.
            try:
                backup_existing_csv()
                fd, tmp = tempfile.mkstemp(dir=HERE, prefix=".tracker-", suffix=".tmp")
                with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
                    f.write(body)
                os.replace(tmp, CSV_PATH)
            except Exception as exc:  # noqa: BLE001
                self.send_error(500, f"Save failed: {exc}")
                return
            self._send_text(200, "saved")
        elif path == "/restore":
            ok, msg = restore_backup(body.strip())
            if ok:
                self._send_text(200, "restored")
            else:
                self._send_text(400, msg)
        else:
            self.send_error(404, "Not found")

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
