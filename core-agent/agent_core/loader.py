"""
loader.py — Carga y persistencia del CEREBRO y la MEMORIA.
==========================================================
Responsabilidad única: leer la ley (cerebro.md) y el estado (memoria.md), y
escribir el estado SIN poder corromperlo.

Garantías (las tres importan de verdad):
  1. ESCRITURA ATÓMICA: se escribe en .tmp y se hace os.replace (atómico en el
     mismo sistema de archivos). Un corte de luz a mitad no deja un archivo roto.
  2. BLOQUEO DE ARCHIVO: si el IDE y el puente (:5000) escriben a la vez, un
     archivo .lock con caducidad (30 s) evita condiciones de carrera. Es
     portable (no usa fcntl, que no existe en Windows).
  3. SNAPSHOT: antes de cada escritura se copia memoria.md a memoria_history/,
     lo que permite volver atrás si una actualización corrompe el flujo.

Solo biblioteca estándar: se ejecuta en el venv del puente sin instalar nada.
"""

import os
import time
import shutil
from datetime import datetime

MARCA = "<!-- BLOQUE-DINAMICO:{0} -->"
CIERRE = "<!-- /BLOQUE-DINAMICO:{0} -->"


class ContextLoader:
    def __init__(self, cerebro_path="cerebro.md", memoria_path="memoria.md"):
        self.cerebro_path = cerebro_path
        self.memoria_path = memoria_path
        base = os.path.dirname(os.path.abspath(memoria_path)) or "."
        self.history_dir = os.path.join(base, "memoria_history")
        self.lock_path = os.path.join(base, ".memoria.lock")

    # ---------------- Lectura ----------------
    def load_cerebro(self) -> str:
        """Carga el núcleo de reglas (ley inmutable)."""
        if not os.path.exists(self.cerebro_path):
            return "# CEREBRO\nNo se encontró el archivo de gobernanza."
        with open(self.cerebro_path, "r", encoding="utf-8") as f:
            return f.read()

    def load_memoria(self) -> str:
        """Carga el estado dinámico actual."""
        if not os.path.exists(self.memoria_path):
            return "# MEMORIA\nEstado inicial vacío."
        with open(self.memoria_path, "r", encoding="utf-8") as f:
            return f.read()

    def read_block(self, nombre: str) -> str:
        """Devuelve el contenido de un bloque dinámico (vacío si no existe)."""
        memoria = self.load_memoria()
        marca, cierre = MARCA.format(nombre), CIERRE.format(nombre)
        i, j = memoria.find(marca), memoria.find(cierre)
        if i == -1 or j == -1 or j < i:
            return ""
        return memoria[i + len(marca):j].strip()

    # ---------------- Bloqueo ----------------
    def _lock(self, timeout=3.0) -> bool:
        inicio = time.time()
        while time.time() - inicio < timeout:
            try:
                if os.path.exists(self.lock_path):
                    edad = time.time() - os.path.getmtime(self.lock_path)
                    if edad > 30:                     # lock huérfano: se roba
                        os.remove(self.lock_path)
                    else:
                        time.sleep(0.04)
                        continue
                with open(self.lock_path, "w", encoding="utf-8") as f:
                    f.write(str(os.getpid()))
                return True
            except OSError:
                time.sleep(0.04)
        return False

    def _unlock(self) -> None:
        try:
            os.remove(self.lock_path)
        except OSError:
            pass

    # ---------------- Escritura ----------------
    def update_memoria(self, new_content: str) -> None:
        """Sobrescribe el estado de forma ATÓMICA, dejando copia de seguridad."""
        self.snapshot()
        tmp = self.memoria_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(new_content)
        os.replace(tmp, self.memoria_path)   # atómico

    def update_block(self, nombre: str, contenido: str) -> bool:
        """Reescribe SOLO el bloque indicado: lo que el humano escribió fuera de
        los marcadores nunca se pierde."""
        memoria = self.load_memoria()
        marca, cierre = MARCA.format(nombre), CIERRE.format(nombre)
        i, j = memoria.find(marca), memoria.find(cierre)
        if i == -1 or j == -1 or j < i:
            return False
        nuevo = memoria[:i + len(marca)] + "\n" + contenido.strip() + "\n" + memoria[j:]
        if not self._lock():
            return False
        try:
            self.update_memoria(nuevo)
            return True
        finally:
            self._unlock()

    def append_block_line(self, nombre: str, linea: str) -> bool:
        """Añade una línea al final de un bloque (sin duplicados)."""
        actual = self.read_block(nombre)
        if linea.strip() in actual:
            return True
        return self.update_block(nombre, actual + "\n" + linea.strip())

    # ---------------- Historial ----------------
    def snapshot(self, motivo: str = "auto") -> str | None:
        """Copia memoria.md a memoria_history/ (se conservan las 60 últimas)."""
        try:
            if not os.path.exists(self.memoria_path):
                return None
            os.makedirs(self.history_dir, exist_ok=True)
            sello = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
            destino = os.path.join(self.history_dir, "memoria_" + sello + ".md")
            shutil.copy2(self.memoria_path, destino)
            copias = sorted(f for f in os.listdir(self.history_dir)
                            if f.startswith("memoria_") and f.endswith(".md"))
            for vieja in copias[:-60]:
                try:
                    os.remove(os.path.join(self.history_dir, vieja))
                except OSError:
                    pass
            return destino
        except OSError:
            return None

    def list_history(self):
        if not os.path.isdir(self.history_dir):
            return []
        out = []
        for f in os.listdir(self.history_dir):
            if f.startswith("memoria_") and f.endswith(".md"):
                p = os.path.join(self.history_dir, f)
                out.append({"archivo": f, "fecha": os.path.getmtime(p), "bytes": os.path.getsize(p)})
        return sorted(out, key=lambda x: x["fecha"], reverse=True)

    def rollback(self, archivo: str) -> bool:
        """Restaura una copia. El estado actual se guarda antes de restaurar."""
        origen = os.path.join(self.history_dir, os.path.basename(archivo))
        if not os.path.exists(origen):
            return False
        if not self._lock():
            return False
        try:
            self.snapshot("pre-rollback")
            with open(origen, "r", encoding="utf-8") as f:
                contenido = f.read()
            tmp = self.memoria_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(contenido)
            os.replace(tmp, self.memoria_path)
            return True
        finally:
            self._unlock()
