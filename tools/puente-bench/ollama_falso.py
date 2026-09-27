#!/usr/bin/env python3
"""
ollama_falso.py — Un Ollama de mentira que streamea DE VERDAD, por TCP o por socket Unix.

Existe para poder probar el motor EN FRIO, sin depender de tener Ollama instalado.
Devuelve /api/tags con dos modelos (uno local y uno `-cloud`) y /api/chat con SSE
real: fragmentos separados por un retardo conocido.

Con --retardo 60 y 6 fragmentos, un TTFT correcto es ~60 ms y un ciclo ~360 ms.
Si el TTFT saliera ~360, estaría midiendo el lote entero — el defecto exacto de
la demo de Rust que se revisó antes.

Uso:
    python3 ollama_falso.py --tcp 11999 --retardo 60
    python3 ollama_falso.py --unix /tmp/ollama.sock --retardo 60
    python3 ollama_falso.py --tcp 11999 --unix /tmp/ollama.sock --retardo 60
"""
import argparse
import json
import os
import socket
import socketserver
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FRAGMENTOS = 6


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    retardo_ms = 60

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        cuerpo = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        if self.path.startswith("/api/tags"):
            self._json({"models": [{"name": "glm-4.5-flash"}, {"name": "gpt-oss:120b-cloud"}]})
        else:
            self._json({"error": "no existe"}, 404)

    def do_POST(self):
        if not self.path.startswith("/api/chat"):
            self._json({"error": "no existe"}, 404)
            return
        largo = int(self.headers.get("Content-Length") or 0)
        if largo:
            self.rfile.read(largo)
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        for i in range(FRAGMENTOS):
            time.sleep(self.retardo_ms / 1000.0)
            linea = json.dumps({"message": {"role": "assistant", "content": "tok%d " % i},
                                "done": i == FRAGMENTOS - 1}) + "\n"
            datos = linea.encode()
            try:
                self.wfile.write(("%X\r\n" % len(datos)).encode() + datos + b"\r\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return
        try:
            self.wfile.write(b"0\r\n\r\n")
        except (BrokenPipeError, ConnectionResetError):
            pass


class ServidorUnix(socketserver.ThreadingUnixStreamServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tcp", type=int, default=0)
    ap.add_argument("--unix", default="")
    ap.add_argument("--retardo", type=int, default=60)
    args = ap.parse_args()

    Handler.retardo_ms = args.retardo
    hilos = []

    if args.tcp:
        s = ThreadingHTTPServer(("127.0.0.1", args.tcp), Handler)
        t = threading.Thread(target=s.serve_forever, daemon=True)
        t.start()
        hilos.append(t)
        print("ollama falso TCP  :%d (retardo %d ms)" % (args.tcp, args.retardo), flush=True)

    if args.unix:
        try:
            os.unlink(args.unix)
        except FileNotFoundError:
            pass
        u = ServidorUnix(args.unix, Handler)
        t = threading.Thread(target=u.serve_forever, daemon=True)
        t.start()
        hilos.append(t)
        print("ollama falso UNIX :%s (retardo %d ms)" % (args.unix, args.retardo), flush=True)

    if not hilos:
        print("nada que servir: pasa --tcp y/o --unix", flush=True)
        return
    for t in hilos:
        t.join()


if __name__ == "__main__":
    main()
