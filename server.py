#!/usr/bin/env python3
"""Small localhost-only server for the AI Commons starter app."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
DATA_DIR = ROOT / "data"
STORE = DATA_DIR / "conversation.json"
MAX_BODY = 16_384


def load_messages() -> list[dict[str, str]]:
    try:
        value = json.loads(STORE.read_text(encoding="utf-8"))
        return value if isinstance(value, list) else []
    except (OSError, json.JSONDecodeError):
        return []


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/messages":
            self.send_json(load_messages())
            return
        if path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/messages":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > MAX_BODY:
                self.send_error(413, "Message must be under 16 KB")
                return
            payload = json.loads(self.rfile.read(length))
            text = payload.get("text", "")
            if not isinstance(text, str) or not text.strip() or len(text) > 4000:
                self.send_error(400, "Message must contain 1–4000 characters")
                return
        except (ValueError, json.JSONDecodeError):
            self.send_error(400, "Invalid JSON request")
            return

        messages = load_messages()
        message = {
            "id": str(int(datetime.now(timezone.utc).timestamp() * 1000)),
            "author": "You",
            "kind": "human",
            "text": text.strip(),
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        messages.append(message)
        DATA_DIR.mkdir(exist_ok=True)
        STORE.write_text(json.dumps(messages[-500:], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        self.send_json(message, status=201)

    def send_json(self, value: object, status: int = 200) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    address = "127.0.0.1"
    port = 8000
    print(f"AI Commons is running at http://{address}:{port} (local machine only)")
    ThreadingHTTPServer((address, port), Handler).serve_forever()
