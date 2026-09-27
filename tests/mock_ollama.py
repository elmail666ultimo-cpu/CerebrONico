#!/usr/bin/env python3
"""
Mock Ollama server for end-to-end testing of CerebroNico's /api/ai/stream route.

Emulates the two endpoints the server uses:
  * GET  /api/tags      -> list of models
  * POST /api/chat      -> streaming JSON chunks (one JSON object per line)
  * POST /api/generate  -> (optional, for non-chat completions)

The mock emits tokens slowly (40ms between chunks) so we can prove the
streaming pipeline survives long enough to deliver a full answer.

Also exposes a "long-gen" mode triggered by the prompt containing "LONGGEN:"
that emits 600 tokens (well over the previous 120s timeout cutoff at fast
rate) to verify the inactivity-timer fix.

Uses ThreadingHTTPServer + HTTP/1.1 + chunked transfer so Node's fetch can
reuse connections safely and concurrent requests don't block each other.
"""

import http.server
import json
import sys
import time
from socketserver import ThreadingMixIn

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 11434
HOST = "127.0.0.1"

SAMPLE_TOKENS = (
    "Hola desde CerebroNico Mock. El streaming funciona correctamente. "
    "Este es un test de extremo a extremo con tokens emitidos uno a uno "
    "para verificar que el servidor no aborta la generación prematuramente. "
    "Si ves este mensaje completo, la corrección del bug req.on(close) -> "
    "res.on(close) está funcionando. Fin del flujo."
).split(" ")


class MockOllamaHandler(http.server.BaseHTTPRequestHandler):
    # HTTP/1.1 + chunked-style streaming; allows keep-alive which Node's fetch reuses.
    protocol_version = "HTTP/1.1"

    def _send_json(self, status, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/tags"):
            payload = {
                "models": [
                    {"name": "mock-model:latest", "size": 1024 * 1024 * 1024, "modified_at": "2025-01-01T00:00:00Z"},
                    {"name": "llama3.2:latest", "size": 2 * 1024 * 1024 * 1024, "modified_at": "2025-01-01T00:00:00Z"},
                ]
            }
            self._send_json(200, payload)
            return
        self._send_json(404, {"error": f"GET {self.path} not found"})

    def do_POST(self):
        if self.path == "/api/chat":
            length = int(self.headers.get("Content-Length", 0))
            try:
                body_raw = self.rfile.read(length).decode("utf-8") if length else "{}"
                body = json.loads(body_raw)
            except Exception:
                body = {}
            messages = body.get("messages", [])
            user_msg = ""
            for m in reversed(messages):
                if m.get("role") == "user":
                    user_msg = m.get("content", "")
                    break

            long_gen = "LONGGEN:" in user_msg
            if long_gen:
                tokens = [f"tok{i}" for i in range(600)]
            else:
                tokens = SAMPLE_TOKENS

            # Stream as newline-delimited JSON chunks (Ollama protocol).
            # HTTP/1.1 with Connection: close: client knows response ends when
            # the socket closes. We don't use Transfer-Encoding: chunked because
            # Python's http.server doesn't auto-encode it; Connection: close is
            # the simplest correct way to stream without Content-Length.
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.close_connection = True

            try:
                for i, tok in enumerate(tokens):
                    chunk = {
                        "model": body.get("model", "mock-model:latest"),
                        "message": {"role": "assistant", "content": tok + " "},
                        "done": False,
                    }
                    self.wfile.write((json.dumps(chunk) + "\n").encode("utf-8"))
                    self.wfile.flush()
                    time.sleep(0.04)
                final = {
                    "model": body.get("model", "mock-model:latest"),
                    "message": {"role": "assistant", "content": ""},
                    "done": True,
                    "total_duration": 1_000_000_000,
                    "eval_count": len(tokens),
                }
                self.wfile.write((json.dumps(final) + "\n").encode("utf-8"))
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            return

        if self.path == "/api/generate":
            self._send_json(200, {"response": "ok", "done": True})
            return

        self._send_json(404, {"error": f"POST {self.path} not found"})

    def log_message(self, fmt, *args):
        # Quiet by default
        pass


class ThreadingHTTPServer(ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def main():
    ThreadingHTTPServer.allow_reuse_address = True
    with ThreadingHTTPServer((HOST, PORT), MockOllamaHandler) as httpd:
        print(f"[mock-ollama] listening on http://{HOST}:{PORT} (threaded, HTTP/1.1)", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[mock-ollama] shutdown", flush=True)


if __name__ == "__main__":
    main()
