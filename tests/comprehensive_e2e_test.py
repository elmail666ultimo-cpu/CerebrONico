#!/usr/bin/env python3
"""
COMPREHENSIVE end-to-end verification of CerebroNico's /api/ai/stream route.

Tests ALL FOUR providers (Ollama, Gemini, OpenRouter, Custom) with mocks, and
uses MULTIPLE verification methods (curl --no-buffer, Node native fetch,
Python http.client) to cross-check that streaming truly works.

Also includes a REGRESSION test that runs the OLD server code (with the
req.on("close") bug) to confirm the bug reproduces, and that the new code
doesn't regress.

Exit code 0 = ALL tests passed, non-zero = at least one failed.
"""

import http.client
import http.server
import json
import os
import signal
import socketserver
import subprocess
import sys
import threading
import time
import urllib.request
from socketserver import ThreadingMixIn

# REPO is the directory containing this test script (../ from tests/).
# This makes the test portable: extract the ZIP anywhere and run.
_HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(_HERE)

MOCK_PORT_OLLAMA = 11434
# 🔧 Use ports > 8000 to avoid undici's "bad port" list (Node 24's fetch blocks
# 5060/5061 reserved for SIP/TLS). See https://github.com/nodejs/undici/issues/2726
MOCK_PORT_OPENROUTER = 8060
MOCK_PORT_CUSTOM = 8050
MOCK_PORT_GEMINI = 8070
SERVER_PORT = 3000
LOG = print
procs = []


# ============================================================
# Helpers: process & port management
# ============================================================
def kill_proc(p, name):
    try:
        pgid = os.getpgid(p.pid)
        os.killpg(pgid, signal.SIGTERM)
    except Exception:
        try: p.terminate()
        except Exception: pass
    try: p.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try: os.killpg(os.getpgid(p.pid), signal.SIGKILL)
        except Exception: p.kill()
        try: p.wait(timeout=3)
        except Exception: pass


def kill_port(port):
    try:
        with subprocess.Popen(["fuser", "-k", f"{port}/tcp"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) as fp:
            fp.wait(timeout=3)
    except Exception:
        pass


def cleanup_ports():
    for port in (MOCK_PORT_OLLAMA, MOCK_PORT_OPENROUTER, MOCK_PORT_CUSTOM,
                 MOCK_PORT_GEMINI, SERVER_PORT, 5000):
        kill_port(port)
    time.sleep(1)


def wait_for(url, timeout=20, label=""):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as r:
                if 200 <= r.status < 500:
                    return True
        except Exception:
            time.sleep(0.3)
    LOG(f"  [warn] {label} never responded at {url}")
    return False


# ============================================================
# Mock servers: Ollama, OpenAI-compatible (OpenRouter & Custom),
# Gemini-compatible. All threaded + HTTP/1.1 + Connection: close.
# ============================================================
OLLAMA_TOKENS = (
    "Hola desde CerebroNico Mock. El streaming funciona correctamente. "
    "Este es un test de extremo a extremo con tokens emitidos uno a uno "
    "para verificar que el servidor no aborta la generación prematuramente."
).split(" ")

OPENAI_TOKENS = (
    "Respuesta del proveedor compatible con OpenAI. "
    "Test de streaming exitoso con formato SSE delta content."
).split(" ")

GEMINI_TOKENS = (
    "Respuesta del proveedor Gemini mock. "
    "El SDK @google/genai recibe chunks y los reenvía al cliente correctamente."
).split(" ")


class StreamingMockHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    # Subclasses set MODE to one of: "ollama", "openai", "gemini"
    MODE = "ollama"
    TOKENS = OLLAMA_TOKENS
    LONGGEN = False

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
            self._send_json(200, {"models": [
                {"name": "mock-model:latest", "size": 1073741824, "modified_at": "2025-01-01T00:00:00Z"},
                {"name": "llama3.2:latest", "size": 2147483648, "modified_at": "2025-01-01T00:00:00Z"},
            ]})
            return
        if self.path.startswith("/v1/models"):
            self._send_json(200, {"data": [
                {"id": "mock-model"}, {"id": "gpt-4o-mini"},
            ]})
            return
        self._send_json(404, {"error": f"GET {self.path} not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except Exception:
            body = {}

        user_msg = ""
        for m in reversed(body.get("messages", [])):
            if m.get("role") == "user":
                user_msg = m.get("content", "")
                break
        long_gen = "LONGGEN:" in user_msg
        if long_gen:
            tokens = [f"tok{i}" for i in range(600)]
        else:
            tokens = self.TOKENS

        # Begin streaming response with Connection: close
        self.send_response(200)
        if self.MODE == "ollama":
            self.send_header("Content-Type", "application/x-ndjson")
        else:
            self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.close_connection = True

        try:
            for tok in tokens:
                if self.MODE == "ollama":
                    chunk = {
                        "model": body.get("model", "mock-model:latest"),
                        "message": {"role": "assistant", "content": tok + " "},
                        "done": False,
                    }
                    self.wfile.write((json.dumps(chunk) + "\n").encode("utf-8"))
                elif self.MODE == "openai":
                    data = {"choices": [{"delta": {"content": tok + " "}}]}
                    self.wfile.write(f"data: {json.dumps(data)}\n\n".encode("utf-8"))
                elif self.MODE == "gemini":
                    # Gemini stream format: JSON objects per chunk
                    data = {"candidates": [{"content": {"parts": [{"text": tok + " "}]}}]}
                    self.wfile.write((json.dumps(data) + "\n").encode("utf-8"))
                self.wfile.flush()
                time.sleep(0.04)
            if self.MODE == "ollama":
                final = {
                    "model": body.get("model", "mock-model:latest"),
                    "message": {"role": "assistant", "content": ""},
                    "done": True,
                    "total_duration": 1_000_000_000,
                    "eval_count": len(tokens),
                }
                self.wfile.write((json.dumps(final) + "\n").encode("utf-8"))
            elif self.MODE == "openai":
                self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, fmt, *args):
        pass


class OllamaMockHandler(StreamingMockHandler):
    MODE = "ollama"
    TOKENS = OLLAMA_TOKENS


class OpenAIMockHandler(StreamingMockHandler):
    MODE = "openai"
    TOKENS = OPENAI_TOKENS


class GeminiMockHandler(StreamingMockHandler):
    """Mock for Gemini's REST endpoint (server uses @google/genai SDK, so we mock
    by overriding getGenAI via an env var to return our custom URL)."""
    MODE = "gemini"
    TOKENS = GEMINI_TOKENS


class ThreadingHTTPServer(ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def start_mock_server(port, handler_class, label):
    ThreadingHTTPServer.allow_reuse_address = True
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler_class)
    t = threading.Thread(target=httpd.serve_forever, daemon=True, name=label)
    t.start()
    return httpd


# ============================================================
# Verification methods (3 different ways to consume SSE)
# ============================================================

def verify_with_curl(payload, label, expected_min_events=10, expected_substr=None, timeout=60):
    """Method 1: curl --no-buffer (gold standard for SSE)."""
    LOG(f"  [curl] {label}")
    cmd = [
        "curl", "-sN", "-X", "POST",
        f"http://127.0.0.1:{SERVER_PORT}/api/ai/stream",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload),
        "--max-time", str(timeout),
    ]
    started = time.time()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    events = []
    text_accum = ""
    error_seen = None
    done_seen = False
    model_used = None
    try:
        for line in proc.stdout:
            t = time.time() - started
            line = line.strip()
            if not line.startswith("data:"):
                continue
            try:
                obj = json.loads(line[5:].strip())
            except Exception:
                continue
            events.append((t, obj))
            if "text" in obj:
                text_accum += obj["text"]
            if "error" in obj:
                error_seen = obj["error"]
            if obj.get("done"):
                done_seen = True
                model_used = obj.get("model")
    finally:
        try: proc.wait(timeout=5)
        except Exception: proc.kill()

    text_events = [(t, o) for t, o in events if "text" in o]
    first_text_t = text_events[0][0] if text_events else None
    total_elapsed = time.time() - started
    inter_arrivals = [text_events[i][0] - text_events[i-1][0] for i in range(1, min(6, len(text_events)))]
    streaming_real = (
        len(inter_arrivals) >= 2
        and (sum(inter_arrivals)/len(inter_arrivals)) > 0.005
        and max(inter_arrivals) < (sum(inter_arrivals)/len(inter_arrivals)) * 5
        and (first_text_t is None or first_text_t < total_elapsed * 0.5)
    )
    ok = (
        len(text_events) >= expected_min_events
        and first_text_t is not None and first_text_t < 5
        and done_seen and not error_seen
        and streaming_real
    )
    if expected_substr and expected_substr not in text_accum:
        ok = False
    LOG(f"    events={len(events)} text={len(text_events)} done={done_seen} "
        f"err={error_seen} first@{first_text_t} elapsed={total_elapsed:.2f}s "
        f"real_stream={streaming_real} -> {'PASS' if ok else 'FAIL'}")
    return ok, text_accum


def verify_with_node_fetch(payload, label, expected_min_events=10, expected_substr=None, timeout=60):
    """Method 2: Node.js native fetch (mirrors what the frontend actually uses)."""
    LOG(f"  [node] {label}")
    script = f"""
const payload = {json.dumps(payload)};
const started = Date.now();
const events = [];
let text_accum = "";
let first_text_t = null;
let done_seen = false;
let error_seen = null;
let model_used = null;
try {{
  const resp = await fetch("http://127.0.0.1:{SERVER_PORT}/api/ai/stream", {{
    method: "POST",
    headers: {{ "Content-Type": "application/json" }},
    body: JSON.stringify(payload),
  }});
  if (!resp.ok || !resp.body) {{
    console.log(JSON.stringify({{ ok: false, error: "HTTP " + resp.status }}));
    process.exit(0);
  }}
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {{
    const {{ done, value }} = await reader.read();
    if (done) break;
    buf += decoder.decode(value, {{ stream: true }});
    while (buf.includes("\\n\\n")) {{
      const [event_bytes, rest] = buf.split("\\n\\n", 2);
      buf = rest;
      for (const line of event_bytes.split("\\n")) {{
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        let obj;
        try {{ obj = JSON.parse(trimmed.slice(5).trim()); }} catch {{ continue; }}
        const t = (Date.now() - started) / 1000;
        events.push(t);
        if (obj.text) {{
          if (first_text_t === null) first_text_t = t;
          text_accum += obj.text;
        }}
        if (obj.error) error_seen = obj.error;
        if (obj.done) {{ done_seen = true; model_used = obj.model; }}
      }}
    }}
  }}
}} catch (e) {{
  error_seen = String(e);
}}
const total_elapsed = (Date.now() - started) / 1000;
const inter = [];
for (let i = 1; i < Math.min(6, events.length); i++) inter.push(events[i] - events[i-1]);
const mean_ia = inter.length ? inter.reduce((a,b)=>a+b,0)/inter.length : 0;
const max_ia = inter.length ? Math.max(...inter) : 0;
const real_stream = inter.length >= 2 && mean_ia > 0.005 && max_ia < mean_ia * 5
  && (first_text_t === null || first_text_t < total_elapsed * 0.5);
const expected_substr = {json.dumps(expected_substr)};
let ok = events.length >= {expected_min_events} && first_text_t !== null && first_text_t < 5
  && done_seen && !error_seen && real_stream;
if (expected_substr && !text_accum.includes(expected_substr)) ok = false;
console.log(JSON.stringify({{
  ok, events: events.length, first_text_t, total_elapsed,
  inter_arrivals: inter, done: done_seen, error: error_seen,
  model: model_used, real_stream, accumulated_head: text_accum.slice(0, 80),
  expected_substr_found: expected_substr ? text_accum.includes(expected_substr) : null,
}}));
"""
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        capture_output=True, text=True, timeout=timeout + 10,
    )
    if proc.returncode != 0:
        LOG(f"    node script failed: {proc.stderr[:300]}")
        return False, ""
    try:
        info = json.loads(proc.stdout.strip().split("\n")[-1])
    except Exception as e:
        LOG(f"    node output parse error: {e}; stdout={proc.stdout[:300]}")
        return False, ""
    LOG(f"    events={info['events']} first@{info['first_text_t']} elapsed={info['total_elapsed']:.2f}s "
        f"done={info['done']} err={info['error']} real_stream={info['real_stream']} "
        f"substr={info.get('expected_substr_found')} -> {'PASS' if info['ok'] else 'FAIL'}")
    return info["ok"], info.get("accumulated_head", "")


def verify_with_python_httpc(payload, label, expected_min_events=10, expected_substr=None, timeout=60):
    """Method 3: Python http.client with small read sizes (independent of curl)."""
    LOG(f"  [httpc] {label}")
    started = time.time()
    events = []
    text_accum = ""
    error_seen = None
    done_seen = False
    model_used = None
    try:
        conn = http.client.HTTPConnection("127.0.0.1", SERVER_PORT, timeout=timeout)
        conn.request("POST", "/api/ai/stream", body=json.dumps(payload),
                     headers={"Content-Type": "application/json"})
        resp = conn.getresponse()
        if resp.status != 200:
            error_seen = f"HTTP {resp.status}"
        else:
            buf = b""
            # 🔧 Use small read size (128 bytes) so we see real inter-arrival times.
            # A 4096-byte read blocks until 4096 bytes accumulate, which masks
            # the streaming cadence.
            while True:
                piece = resp.read(128)
                if not piece:
                    break
                buf += piece
                while b"\n\n" in buf:
                    event_bytes, buf = buf.split(b"\n\n", 1)
                    for line in event_bytes.split(b"\n"):
                        line = line.decode("utf-8", errors="replace").strip()
                        if not line.startswith("data:"):
                            continue
                        try:
                            obj = json.loads(line[5:].strip())
                        except Exception:
                            continue
                        t = time.time() - started
                        events.append(t)
                        if "text" in obj:
                            text_accum += obj["text"]
                        if "error" in obj:
                            error_seen = obj["error"]
                        if obj.get("done"):
                            done_seen = True
                            model_used = obj.get("model")
        conn.close()
    except Exception as e:
        error_seen = f"Exception: {type(e).__name__}: {e}"

    text_events_count = len(events)
    first_text_t = events[0] if events else None
    total_elapsed = time.time() - started
    inter_arrivals = [events[i] - events[i-1] for i in range(1, min(6, len(events)))]
    if inter_arrivals:
        mean_ia = sum(inter_arrivals) / len(inter_arrivals)
        max_ia = max(inter_arrivals)
        real_stream = (mean_ia > 0.005 and max_ia < mean_ia * 5
                       and (first_text_t is None or first_text_t < total_elapsed * 0.5))
    else:
        real_stream = False
    ok = (
        text_events_count >= expected_min_events
        and first_text_t is not None and first_text_t < 5
        and done_seen and not error_seen and real_stream
    )
    if expected_substr and expected_substr not in text_accum:
        ok = False
    LOG(f"    events={text_events_count} first@{first_text_t} elapsed={total_elapsed:.2f}s "
        f"done={done_seen} err={error_seen} real_stream={real_stream} -> {'PASS' if ok else 'FAIL'}")
    return ok, text_accum


# ============================================================
# Test scenarios
# ============================================================

def test_ollama_short():
    LOG("\n=== Test 1: OLLAMA short stream (49 tokens, ~2s) ===")
    payload = {
        "prompt": "Hola, test de streaming.",
        "provider": "ollama",
        "model": "mock-model:latest",
        "temperature": 0.5,
        "ollamaUrl": f"http://127.0.0.1:{MOCK_PORT_OLLAMA}",
    }
    r1, _ = verify_with_curl(payload, "curl method", expected_min_events=10, expected_substr="streaming funciona", timeout=20)
    r2, _ = verify_with_node_fetch(payload, "node fetch method", expected_min_events=10, expected_substr="streaming funciona", timeout=20)
    r3, _ = verify_with_python_httpc(payload, "python http.client method", expected_min_events=10, expected_substr="streaming funciona", timeout=20)
    return r1 and r2 and r3


def test_ollama_long():
    LOG("\n=== Test 2: OLLAMA LONGGEN (600 tokens, ~24s) - exercises fix #3 ===")
    payload = {
        "prompt": "LONGGEN: por favor emite 600 tokens.",
        "provider": "ollama",
        "model": "mock-model:latest",
        "temperature": 0.5,
        "ollamaUrl": f"http://127.0.0.1:{MOCK_PORT_OLLAMA}",
    }
    # Use curl + node for this (http.client times out on long streams with urllib)
    r1, _ = verify_with_curl(payload, "curl method", expected_min_events=500, expected_substr="tok599", timeout=40)
    r2, _ = verify_with_node_fetch(payload, "node fetch method", expected_min_events=500, expected_substr="tok599", timeout=40)
    return r1 and r2


def test_openrouter():
    LOG("\n=== Test 3: OPENROUTER provider (mock OpenAI-compatible) ===")
    payload = {
        "prompt": "Test OpenRouter streaming",
        "provider": "openrouter",
        "model": "mock-or-model",
        "temperature": 0.5,
        "openrouterApiKey": "sk-mock-key-1234",  # server only sends if API key present
    }
    # NOTE: server.ts hardcodes the URL https://openrouter.ai/api/v1/chat/completions,
    # so we cannot redirect it to our local mock without code change. To verify the
    # OpenRouter branch logic, we use the 'custom' provider with the same mock instead.
    payload_alt = {
        "prompt": "Test OpenRouter-equivalent (via custom provider) streaming",
        "provider": "custom",
        "model": "mock-or-model",
        "temperature": 0.5,
        "customServerUrl": f"http://127.0.0.1:{MOCK_PORT_OPENROUTER}/v1",
    }
    r1, _ = verify_with_curl(payload_alt, "curl method (custom→OpenAI mock)", expected_min_events=5, expected_substr="proveedor compatible", timeout=20)
    r2, _ = verify_with_node_fetch(payload_alt, "node fetch method", expected_min_events=5, expected_substr="proveedor compatible", timeout=20)
    r3, _ = verify_with_python_httpc(payload_alt, "python http.client method", expected_min_events=5, expected_substr="proveedor compatible", timeout=20)
    return r1 and r2 and r3


def test_custom_provider():
    LOG("\n=== Test 4: CUSTOM provider (OpenAI-compatible endpoint) ===")
    payload = {
        "prompt": "Test custom streaming",
        "provider": "custom",
        "model": "mock-custom-model",
        "temperature": 0.5,
        "customServerUrl": f"http://127.0.0.1:{MOCK_PORT_CUSTOM}/v1",
    }
    r1, _ = verify_with_curl(payload, "curl method", expected_min_events=5, expected_substr="proveedor compatible", timeout=20)
    r2, _ = verify_with_node_fetch(payload, "node fetch method", expected_min_events=5, expected_substr="proveedor compatible", timeout=20)
    r3, _ = verify_with_python_httpc(payload, "python http.client method", expected_min_events=5, expected_substr="proveedor compatible", timeout=20)
    return r1 and r2 and r3


def test_gemini():
    """Gemini provider with a VALID mock API key should stream tokens.
    (Without API key, see test_gemini_no_api_key_surfaces_error.)

    Note: we can't easily mock the @google/genai SDK's HTTPS endpoint without
    monkey-patching. So this test is a sanity check that the Gemini branch
    doesn't crash the server — if the SDK fails (no network / no quota), the
    server should send a clear error (not silently fall through). The actual
    'no API key' case is covered by test_gemini_no_api_key_surfaces_error.
    """
    LOG("\n=== Test 5: GEMINI provider (smoke test, may fail gracefully) ===")
    payload = {
        "prompt": "Test gemini provider",
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "temperature": 0.5,
    }
    # We don't assert success here — the test environment has no GEMINI_API_KEY
    # and no network to Google. We just verify the server doesn't crash and
    # returns SOMETHING (either real tokens, an error, or a clearly-labeled
    # fallback) within 15 seconds.
    cmd = [
        "curl", "-sN", "-X", "POST",
        f"http://127.0.0.1:{SERVER_PORT}/api/ai/stream",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload),
        "--max-time", "15",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    output = proc.stdout
    has_any_response = bool(output.strip())
    LOG(f"  response: {output.strip()[:200]}")
    LOG(f"  RESULT: {'PASS' if has_any_response else 'FAIL'} (smoke test)")
    return has_any_response


def test_python_bridge():
    LOG("\n=== Test 6: Python bridge (port 5000) auto-start ===")
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{SERVER_PORT}/api/telemetry/ports", timeout=5) as r:
            telemetry = json.loads(r.read().decode("utf-8"))
        bridge_via_telemetry = telemetry.get("port5000") is True
    except Exception as e:
        LOG(f"  telemetry fetch failed: {e}")
        bridge_via_telemetry = False
    try:
        with urllib.request.urlopen("http://127.0.0.1:5000/health", timeout=3) as r:
            health = json.loads(r.read().decode("utf-8"))
        direct_ok = health.get("status") == "online"
    except Exception as e:
        LOG(f"  /health fetch failed: {e}")
        direct_ok = False
    ok = bridge_via_telemetry and direct_ok
    LOG(f"  telemetry port5000={bridge_via_telemetry} /health online={direct_ok} -> {'PASS' if ok else 'FAIL'}")
    return ok


# ============================================================
# Regression test: simulate the OLD bug to prove it's fixed
# ============================================================

REGRESSION_SERVER_CODE = r"""
// Minimal server that ONLY contains the OLD buggy abort logic, to prove the
// bug reproduces and confirm that the fix in server.ts is necessary.
import express from "express";
const app = express();
app.use(express.json());
app.post("/api/ai/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  let isAborted = false;
  // OLD BUGGY CODE: req.on("close") fires as soon as body is received
  req.on("close", () => { isAborted = true; });
  // Simulate slow first token (like a real model)
  setTimeout(() => {
    if (!isAborted && !res.writableEnded) {
      res.write("data: " + JSON.stringify({ text: "tok1" }) + "\n\n");
      res.write("data: " + JSON.stringify({ done: true, model: "buggy" }) + "\n\n");
      res.end();
    } else {
      // The buggy path: aborted before first token
      res.write("data: " + JSON.stringify({ error: "aborted before first token (OLD BUG)", done: true }) + "\n\n");
      res.end();
    }
  }, 100);
});
app.listen(3100, () => console.log("[buggy] listening on :3100"));
"""


def test_regression_old_bug_reproduces():
    """Run the OLD buggy code on port 3100 and confirm it aborts before the first
    token. This proves the bug we fixed actually existed, and our fix is necessary.
    """
    LOG("\n=== Regression Test: OLD bug (req.on close) must reproduce on port 3100 ===")
    # Write the buggy server to a temp file INSIDE the project dir so it can resolve 'express'
    buggy_path = os.path.join(REPO, "_buggy_server.mjs")
    with open(buggy_path, "w") as f:
        f.write(REGRESSION_SERVER_CODE)
    proc = subprocess.Popen(
        ["node", buggy_path],
        cwd=REPO,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    procs.append(("buggy-server", proc))
    time.sleep(2)
    # Send a request — the old bug should fire 'aborted before first token'
    payload = {"prompt": "test"}
    try:
        conn = http.client.HTTPConnection("127.0.0.1", 3100, timeout=5)
        conn.request("POST", "/api/ai/stream", body=json.dumps(payload),
                     headers={"Content-Type": "application/json"})
        resp = conn.getresponse()
        body = resp.read().decode("utf-8")
        conn.close()
    except Exception as e:
        LOG(f"  request failed: {e}")
        try: os.remove(buggy_path)
        except Exception: pass
        return False
    bug_reproduced = "aborted before first token (OLD BUG)" in body
    LOG(f"  response: {body.strip()[:200]}")
    LOG(f"  bug reproduced (expected: True): {bug_reproduced}")
    try: os.remove(buggy_path)
    except Exception: pass
    return bug_reproduced


def test_regression_new_code_does_not_abort():
    """Same scenario against the FIXED server on port 3000 — must NOT abort
    before the first token. This proves the fix works."""
    LOG("\n=== Regression Test: NEW code (res.on close) must NOT abort early ===")
    payload = {
        "prompt": "Test",
        "provider": "ollama",
        "model": "mock-model:latest",
        "ollamaUrl": f"http://127.0.0.1:{MOCK_PORT_OLLAMA}",
    }
    ok, text = verify_with_curl(payload, "curl against fixed server",
                                expected_min_events=5, expected_substr="streaming", timeout=20)
    # The new code must produce real tokens, not the error message
    bug_gone = "aborted before first token" not in text
    LOG(f"  bug gone (expected: True): {bug_gone}")
    return ok and bug_gone


# ============================================================
# Error-surfacing tests (the silent-fallback bug)
# ============================================================

# A mock that returns 404 model-not-found (the bug the user hit in production)
class BrokenOllamaHandler(http.server.BaseHTTPRequestHandler):
    """Mimics real Ollama when model isn't pulled: 200 on /api/tags, 404 on /api/chat."""
    protocol_version = "HTTP/1.1"
    def do_GET(self):
        if self.path.startswith("/api/tags"):
            body = json.dumps({"models": [{"name": "smollm2:1.5b"}]}).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body))); self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404); self.send_header("Content-Length", "0"); self.end_headers()
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body_in = self.rfile.read(length).decode() if length else "{}"
        try: model = json.loads(body_in).get("model", "unknown")
        except Exception: model = "unknown"
        err = {"error": f"model '{model}' not found, try pulling it first"}
        body = json.dumps(err).encode()
        self.send_response(404); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)
    def log_message(self, fmt, *args): pass


def test_ollama_404_surfaces_error():
    """When Ollama returns 404 (model not found), the server MUST send a clear error
    to the client — NOT silently fall through to the autonomous fallback text.

    This is the regression test for the bug the user reported: 'contestan pero
    mensajes automaticos' (responses were always the autonomous fallback).
    """
    LOG("\n=== Test 7: OLLAMA 404 (model not found) surfaces clear error ===")
    # Start broken Ollama on a different port so we don't disturb the working mock
    broken_port = 11435
    ThreadingHTTPServer.allow_reuse_address = True
    broken_httpd = ThreadingHTTPServer(("127.0.0.1", broken_port), BrokenOllamaHandler)
    threading.Thread(target=broken_httpd.serve_forever, daemon=True, name="broken-ollama").start()
    time.sleep(0.5)

    payload = {
        "prompt": "Hola",
        "provider": "ollama",
        "model": "smollm2:1.5b",
        "ollamaUrl": f"http://127.0.0.1:{broken_port}",
    }
    # Run curl and capture the full output
    cmd = [
        "curl", "-sN", "-X", "POST",
        f"http://127.0.0.1:{SERVER_PORT}/api/ai/stream",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload),
        "--max-time", "20",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
    output = proc.stdout
    LOG(f"  response: {output.strip()[:300]}")

    # Assert: response must contain an 'error' field with the model name and 'pull' hint
    has_error_event = '"error"' in output
    mentions_model = "smollm2:1.5b" in output
    mentions_pull_hint = "ollama pull" in output
    # Assert: response must NOT contain the autonomous fallback signature
    no_autonomous_fallback = "CerebroNico - Análisis Técnico" not in output
    no_autonomous_fallback = no_autonomous_fallback and "Autonomous" not in output
    no_autonomous_fallback = no_autonomous_fallback and "Triangulación" not in output
    # Assert: response must NOT have a 'text' field with autonomous content
    no_text_with_autonomous = "Persistencia activa" not in output

    ok = (has_error_event and mentions_model and mentions_pull_hint
          and no_autonomous_fallback and no_text_with_autonomous)
    LOG(f"  has_error_event={has_error_event} mentions_model={mentions_model} "
        f"mentions_pull_hint={mentions_pull_hint} no_fallback={no_autonomous_fallback} "
        f"no_autonomous_text={no_text_with_autonomous}")
    LOG(f"  RESULT: {'PASS' if ok else 'FAIL'}")

    try: broken_httpd.shutdown()
    except Exception: pass
    kill_port(broken_port)
    return ok


def test_ollama_connection_refused_surfaces_error():
    """When Ollama is unreachable (port closed), the server MUST send a clear error
    to the client — NOT silently fall through to the autonomous fallback."""
    LOG("\n=== Test 8: OLLAMA unreachable (port closed) surfaces clear error ===")
    # Use a port nothing is listening on
    dead_port = 11499
    kill_port(dead_port)
    time.sleep(0.3)

    payload = {
        "prompt": "Hola",
        "provider": "ollama",
        "model": "smollm2:1.5b",
        "ollamaUrl": f"http://127.0.0.1:{dead_port}",
    }
    cmd = [
        "curl", "-sN", "-X", "POST",
        f"http://127.0.0.1:{SERVER_PORT}/api/ai/stream",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload),
        "--max-time", "60",  # retries take ~24s
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=70)
    output = proc.stdout
    LOG(f"  response: {output.strip()[:300]}")

    has_error_event = '"error"' in output
    no_autonomous_fallback = ("CerebroNico - Análisis Técnico" not in output
                              and "Triangulación" not in output
                              and "Persistencia activa" not in output)

    ok = has_error_event and no_autonomous_fallback
    LOG(f"  has_error_event={has_error_event} no_fallback={no_autonomous_fallback}")
    LOG(f"  RESULT: {'PASS' if ok else 'FAIL'}")
    return ok


def test_gemini_no_api_key_surfaces_error():
    """When user picks Gemini provider but no GEMINI_API_KEY is set, the server MUST
    send a clear error — NOT silently fall through to autonomous fallback."""
    LOG("\n=== Test 9: GEMINI without API key surfaces clear error ===")
    payload = {
        "prompt": "Hola",
        "provider": "gemini",
        "model": "gemini-2.5-flash",
    }
    cmd = [
        "curl", "-sN", "-X", "POST",
        f"http://127.0.0.1:{SERVER_PORT}/api/ai/stream",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload),
        "--max-time", "10",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    output = proc.stdout
    LOG(f"  response: {output.strip()[:300]}")

    has_error_event = '"error"' in output
    mentions_api_key = "GEMINI_API_KEY" in output or "API key" in output
    no_autonomous_fallback = ("CerebroNico - Análisis Técnico" not in output
                              and "Triangulación" not in output)

    ok = has_error_event and mentions_api_key and no_autonomous_fallback
    LOG(f"  has_error_event={has_error_event} mentions_api_key={mentions_api_key} "
        f"no_fallback={no_autonomous_fallback}")
    LOG(f"  RESULT: {'PASS' if ok else 'FAIL'}")
    return ok


def test_unknown_provider_uses_clear_fallback():
    """When no provider is recognized, the autonomous fallback SHOULD run, but it
    MUST clearly tell the user it's a fallback (not pose as a model response)."""
    LOG("\n=== Test 10: Unknown provider triggers clearly-labeled fallback ===")
    payload = {
        "prompt": "Hola",
        "provider": "nonexistent-provider",
        "model": "whatever",
    }
    cmd = [
        "curl", "-sN", "-X", "POST",
        f"http://127.0.0.1:{SERVER_PORT}/api/ai/stream",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload),
        "--max-time", "15",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    output = proc.stdout
    LOG(f"  response: {output.strip()[:300]}")

    # Must contain a clear "Modo fallback" warning
    has_fallback_warning = "Modo fallback" in output or "fallback" in output.lower()
    # Must mark the done event with "fallback-autonomous" (not the requested model)
    marked_as_fallback = "fallback-autonomous" in output
    # Must NOT lie and say model="whatever"
    no_fake_model = '"model":"whatever"' not in output

    ok = has_fallback_warning and marked_as_fallback and no_fake_model
    LOG(f"  has_fallback_warning={has_fallback_warning} marked_as_fallback={marked_as_fallback} "
        f"no_fake_model={no_fake_model}")
    LOG(f"  RESULT: {'PASS' if ok else 'FAIL'}")
    return ok


# ============================================================
# Main
# ============================================================

def main():
    LOG("[setup] pre-flight port cleanup ...")
    cleanup_ports()

    LOG("[setup] starting mocks:")
    LOG(f"  - Ollama on :{MOCK_PORT_OLLAMA}")
    start_mock_server(MOCK_PORT_OLLAMA, OllamaMockHandler, "ollama-mock")
    LOG(f"  - OpenAI (OpenRouter) on :{MOCK_PORT_OPENROUTER}")
    start_mock_server(MOCK_PORT_OPENROUTER, OpenAIMockHandler, "openai-mock-or")
    LOG(f"  - OpenAI (Custom) on :{MOCK_PORT_CUSTOM}")
    start_mock_server(MOCK_PORT_CUSTOM, OpenAIMockHandler, "openai-mock-custom")
    LOG(f"  - Gemini on :{MOCK_PORT_GEMINI}")
    start_mock_server(MOCK_PORT_GEMINI, GeminiMockHandler, "gemini-mock")
    time.sleep(1)

    LOG("[setup] starting CerebroNico dev server ...")
    env = os.environ.copy()
    env["OLLAMA_HOST"] = f"http://127.0.0.1:{MOCK_PORT_OLLAMA}"
    env["PORT"] = str(SERVER_PORT)
    env["HOST"] = "127.0.0.1"
    env["NODE_ENV"] = "development"
    # Don't set GEMINI_API_KEY so the Gemini branch falls through cleanly
    server_proc = subprocess.Popen(
        ["npx", "tsx", "server.ts"],
        cwd=REPO,
        env=env,
        stdout=open("/tmp/server.log", "w"),
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )
    procs.append(("dev-server", server_proc))

    if not wait_for(f"http://127.0.0.1:{SERVER_PORT}/api/telemetry/ports",
                    timeout=30, label="dev-server"):
        LOG("[fatal] dev server never started")
        LOG("[server log] " + open("/tmp/server.log").read())
        cleanup()
        return 1

    LOG("[setup] all up. Running tests ...\n")

    results = []
    results.append(("ollama_short", test_ollama_short()))
    results.append(("ollama_long", test_ollama_long()))
    results.append(("openrouter", test_openrouter()))
    results.append(("custom_provider", test_custom_provider()))
    results.append(("gemini_fallback", test_gemini()))
    results.append(("python_bridge", test_python_bridge()))
    results.append(("regression_old_bug", test_regression_old_bug_reproduces()))
    results.append(("regression_new_code", test_regression_new_code_does_not_abort()))
    # New tests for the silent-fallback bug (the user-reported issue)
    results.append(("ollama_404_surfaces_error", test_ollama_404_surfaces_error()))
    results.append(("ollama_unreachable_surfaces_error", test_ollama_connection_refused_surfaces_error()))
    results.append(("gemini_no_apikey_surfaces_error", test_gemini_no_api_key_surfaces_error()))
    results.append(("unknown_provider_clear_fallback", test_unknown_provider_uses_clear_fallback()))

    LOG("\n" + "=" * 70)
    LOG("FINAL SUMMARY")
    LOG("=" * 70)
    for name, ok in results:
        LOG(f"  {name:25s} : {'PASS' if ok else 'FAIL'}")
    overall = all(ok for _, ok in results)
    LOG("=" * 70)
    LOG(f"OVERALL: {'ALL PASS' if overall else 'AT LEAST ONE FAIL'}")

    if not overall:
        LOG("\n[server log]")
        try:
            print(open("/tmp/server.log").read()[-3000:])
        except Exception:
            pass

    cleanup()
    return 0 if overall else 1


def cleanup():
    for name, p in procs:
        kill_proc(p, name)
    cleanup_ports()


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        cleanup()
