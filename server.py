#!/usr/bin/env python3
"""Tiny local server for the Job Tracker app.

Serves the files in this folder over http://127.0.0.1:<port> and accepts a
single POST /save request that overwrites tracker.csv in place. Standard
library only -- no installs needed.
"""

import http.server
import os
import socket
import socketserver
import tempfile
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, "tracker.csv")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def do_POST(self):
        if self.path.rstrip("/") != "/save":
            self.send_error(404, "Not found")
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")

        # Write atomically: temp file in the same dir, then os.replace.
        try:
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
