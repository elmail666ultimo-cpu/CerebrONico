#!/usr/bin/env python3
"""
medir_mmap_bien.py — LA MEDICIÓN DE MEMORIA COMPARTIDA, HECHA BIEN.

POR QUÉ EXISTE ESTE SEGUNDO INTENTO (y conviene leerlo)
-------------------------------------------------------
La primera medición dio 5.130 µs de p50 para memoria compartida, cien veces PEOR
que un socket TCP de 46 µs. Ese número era un artefacto del instrumento, no una
propiedad de la memoria compartida:

  El bucle de espera era `while mm[0:8] != esperado: pass`, y el hilo lector lo
  hacía SIN soltar el GIL. En CPython el GIL no se libera en un bucle de bytecode,
  así que el lector impedía al escritor ejecutarse: se estaba midiendo la pelea
  por el GIL, no el coste de copiar memoria.

Y esto no es un detalle de este script: **es la lección del asunto.** La memoria
compartida no es gratis ni automáticamente rápida — necesita disciplina de
sincronización, y la forma ingenua es más lenta que el socket al que pretende
sustituir. Un lenguaje sin GIL (Rust, C) ayuda precisamente AQUÍ, en la
sincronización, no en la copia.

La forma correcta: notificar con `eventfd`, que bloquea y sí libera el GIL.
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
RUTA = "/tmp/puente/shm2.bin"
TAM = 4096


def p50_p99(m):
    m = sorted(m)
    return statistics.median(m), m[max(0, int(len(m) * 0.99) - 1)]


def bench_mmap_eventfd():
    with open(RUTA, "wb") as f:
        f.write(b"\x00" * TAM)
    fd = os.open(RUTA, os.O_RDWR)
    mm = mmap.mmap(fd, TAM)
    ev_aviso = os.eventfd(0)   # el lector avisa: "escribe"
    ev_listo = os.eventfd(0)   # el escritor avisa: "ya está"
    parar = threading.Event()

    def escritor():
        while not parar.is_set():
            os.eventfd_read(ev_aviso)      # bloquea y SUELTA el GIL
            mm[8 : 8 + len(MSG)] = MSG
            mm[0:8] = struct.pack("<Q", struct.unpack("<Q", mm[0:8])[0] + 1)
            os.eventfd_write(ev_listo, 1)

    h = threading.Thread(target=escritor, daemon=True)
    h.start()
    muestras = []
    for _ in range(N):
        t = time.perf_counter()
        os.eventfd_write(ev_aviso, 1)
        os.eventfd_read(ev_listo)          # bloquea y SUELTA el GIL
        muestras.append((time.perf_counter() - t) * 1e6)
    parar.set()
    os.eventfd_write(ev_aviso, 1)
    h.join(timeout=1)
    mm.close()
    os.close(fd)
    for e in (ev_aviso, ev_listo):
        os.close(e)
    return muestras


def bench_tcp():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("127.0.0.1", 0))
    s.listen(1)
    puerto = s.getsockname()[1]

    def atender():
        c, _ = s.accept()
        with c:
            while True:
                d = c.recv(4096)
                if not d:
                    return
                c.sendall(d)

    threading.Thread(target=atender, daemon=True).start()
    c = socket.create_connection(("127.0.0.1", puerto))
    c.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    m = []
    for _ in range(N):
        t = time.perf_counter()
        c.sendall(MSG)
        c.recv(4096)
        m.append((time.perf_counter() - t) * 1e6)
    c.close()
    s.close()
    return m


def bench_unix():
    r = "/tmp/puente/b2.sock"
    try:
        os.unlink(r)
    except FileNotFoundError:
        pass
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.bind(r)
    s.listen(1)

    def atender():
        c, _ = s.accept()
        with c:
            while True:
                d = c.recv(4096)
                if not d:
                    return
                c.sendall(d)

    threading.Thread(target=atender, daemon=True).start()
    c = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    c.connect(r)
    m = []
    for _ in range(N):
        t = time.perf_counter()
        c.sendall(MSG)
        c.recv(4096)
        m.append((time.perf_counter() - t) * 1e6)
    c.close()
    s.close()
    os.unlink(r)
    return m


print("=" * 68)
print(" COSTE DE IDA Y VUELTA POR TRANSPORTE — medición corregida")
print(f" {N} repeticiones · mensaje de {len(MSG)} bytes · µs")
print("=" * 68)

res = {}
for nombre, fn in (("TCP loopback", bench_tcp), ("Socket Unix", bench_unix),
                   ("Memoria compartida (eventfd)", bench_mmap_eventfd)):
    try:
        p50, p99 = p50_p99(fn())
        res[nombre] = p50
        print(f"  {nombre:30s} p50 {p50:8.2f}   p99 {p99:8.2f}")
    except Exception as e:  # noqa: BLE001
        print(f"  {nombre:30s} no medible: {e}")

if res:
    base = res.get("TCP loopback")
    print("\n  Frente a TCP loopback (el que usa el motor hoy):")
    for n, v in res.items():
        if n == "TCP loopback" or not base:
            continue
        d = base - v
        print(f"    {n:30s} {d:+9.2f} µs ({100 * d / base:+6.1f} %)")

print("\n  Para leerlo: 1 ms = 1000 µs. Un TTFT de conversación son CIENTOS de ms.")
print("  Todo lo de esta tabla, junto, no llega a 1 ms.")
