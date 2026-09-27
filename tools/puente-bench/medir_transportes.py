#!/usr/bin/env python3
"""
medir_transportes.py — ¿CUÁNTO COMPRA CAMBIAR DE TRANSPORTE?

Antes de recomendar reescribir nada en otro lenguaje, hay que saber CUÁNTO se
puede ganar cambiando sólo el canal. Se miden las tres opciones reales para la
comunicación entre procesos en la MISMA máquina:

  1. TCP sobre loopback (lo que usa el motor hoy: 127.0.0.1:5000).
  2. Socket de dominio Unix (AF_UNIX) — mismo lenguaje, ~10 líneas de cambio.
  3. Memoria compartida (mmap) — el "cero copia" al que apunta una reescritura.

Se mide ida y vuelta (round trip) de un mensaje pequeño, que es el patrón real de
un token o un trozo de audio, y se dan p50 y p99. La media no sirve aquí: lo que
se nota en audio son los picos.
"""
import mmap
import os
import socket
import statistics
import struct
import threading
import time

N = 3000
MSG = b"Cerebronico: fragmento de prueba de 48 bytes......."


def p50_p99(muestras):
    muestras = sorted(muestras)
    return (
        statistics.median(muestras),
        muestras[max(0, int(len(muestras) * 0.99) - 1)],
    )


def bench_tcp():
    servidor = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    servidor.bind(("127.0.0.1", 0))
    servidor.listen(1)
    puerto = servidor.getsockname()[1]

    def atender():
        conn, _ = servidor.accept()
        with conn:
            while True:
                d = conn.recv(4096)
                if not d:
                    return
                conn.sendall(d)

    h = threading.Thread(target=atender, daemon=True)
    h.start()
    c = socket.create_connection(("127.0.0.1", puerto))
    c.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)  # sin Nagle
    muestras = []
    for _ in range(N):
        t = time.perf_counter()
        c.sendall(MSG)
        c.recv(4096)
        muestras.append((time.perf_counter() - t) * 1e6)
    c.close()
    servidor.close()
    return muestras


def bench_unix():
    ruta = "/tmp/puente/bench.sock"
    try:
        os.unlink(ruta)
    except FileNotFoundError:
        pass
    servidor = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    servidor.bind(ruta)
    servidor.listen(1)

    def atender():
        conn, _ = servidor.accept()
        with conn:
            while True:
                d = conn.recv(4096)
                if not d:
                    return
                conn.sendall(d)

    h = threading.Thread(target=atender, daemon=True)
    h.start()
    c = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    c.connect(ruta)
    muestras = []
    for _ in range(N):
        t = time.perf_counter()
        c.sendall(MSG)
        c.recv(4096)
        muestras.append((time.perf_counter() - t) * 1e6)
    c.close()
    servidor.close()
    os.unlink(ruta)
    return muestras


def bench_mmap():
    """Bucle de bandera: el escritor deposita y sube un contador; el lector mira el
    contador. Es el patrón mínimo de cero copia, sin socket de por medio."""
    ruta = "/tmp/puente/shm.bin"
    TAM = 4096
    with open(ruta, "wb") as f:
        f.write(b"\x00" * TAM)
    fd = os.open(ruta, os.O_RDWR)
    mm = mmap.mmap(fd, TAM)
    mm[0:8] = struct.pack("<Q", 0)
    muestras = []
    esperando = threading.Event()
    esperando.set()

    def escritor():
        for i in range(N):
            esperando.wait()
            esperando.clear()
            mm[8 : 8 + len(MSG)] = MSG
            mm[0:8] = struct.pack("<Q", i + 1)

    h = threading.Thread(target=escritor, daemon=True)
    h.start()
    for i in range(N):
        t = time.perf_counter()
        esperando.set()
        while struct.unpack("<Q", mm[0:8])[0] != i + 1:
            pass
        muestras.append((time.perf_counter() - t) * 1e6)
    mm.close()
    os.close(fd)
    os.unlink(ruta)
    return muestras


print("=" * 66)
print(" COSTE DE IDA Y VUELTA POR TRANSPORTE (mismo equipo, mismo lenguaje)")
print(f" {N} repeticiones · mensaje de {len(MSG)} bytes")
print("=" * 66)

resultados = {}
for nombre, fn in (("TCP loopback", bench_tcp), ("Socket Unix", bench_unix), ("Memoria compartida", bench_mmap)):
    try:
        m = fn()
        p50, p99 = p50_p99(m)
        resultados[nombre] = (p50, p99)
        print(f"  {nombre:20s}  p50 {p50:8.2f} µs   p99 {p99:8.2f} µs")
    except Exception as e:  # noqa: BLE001
        print(f"  {nombre:20s}  no se pudo medir: {e}")

if len(resultados) >= 2:
    base = resultados.get("TCP loopback", (0, 0))[0]
    print("\n  Ahorro frente a TCP loopback, en el p50:")
    for nombre, (p50, _) in resultados.items():
        if nombre == "TCP loopback" or base == 0:
            continue
        print(f"    {nombre:20s}  {base - p50:8.2f} µs menos  ({100 * (base - p50) / base:5.1f} %)")

print("\n  Contexto para leer esto: un TTFT real de conversación se mide en")
print("  CIENTOS DE MILISEGUNDOS. 1 ms = 1000 µs. Compare usted mismo.")
