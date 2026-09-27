#!/usr/bin/env python3
"""
agent_bridge_5000.py - Servidor Agente SuperCodeApp de Ejecución Local & Python (Puerto 5000)
100% Python nativo (sin dependencias externas). Compatible con Python 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14+.

CÓMO EJECUTAR EN WINDOWS CMD O POWERSHELL:
    python agent_bridge_5000.py

CÓMO EJECUTAR EN LINUX/MAC:
    python3 agent_bridge_5000.py

El servidor se auto-arranca desde server.ts (CerebroNico) en el puerto 5000.
Si Python no está disponible, el server sigue funcionando sin el puente.
"""

import http.server
import socketserver
import json
import subprocess
import os
import sys
import time
import shutil
import platform
import getpass
import glob as _glob
import urllib.request
import urllib.error
from socketserver import ThreadingMixIn

PORT = int(os.environ.get("PORT", 5000))

# ============================================================
# ENDURECIMIENTO DEL PUENTE (D3 → v1.7.0 «SEGURIDAD Y PUERTA»)
#   1. TOKEN: cada POST exige X-Cerebro-Token (o Bearer) == ACCESS_TOKEN.
#      La IDE lo genera al arrancar y se lo pasa por env + cabecera.
#   2. ESQUEMAS ESTRICTOS: tipo/longitud/bytes-nulos validados ANTES de
#      tocar sistema o disco (payload inválido = 400 + motivo).
#   3. SIN SHELL (v1.7.0): `/api/exec` YA NO usa shell=True. El comando se
#      parte con shlex, se rechaza cualquier metacaracter de shell y el
#      primer token debe estar en la LISTA BLANCA (`puente-permitidos.json`).
#      Los nativos de Windows (dir, echo, type…) se ejecutan por `cmd.exe /c`
#      con el comando YA saneado — así `dir` sigue funcionando y
#      `algo.exe & del /f /q *` no.
#      POR QUÉ SE CERRÓ: la mitigación anterior era «token + auditoría», y eso
#      convierte el token en una credencial con el poder de la máquina. El
#      puente es un agente de PC: debe poder hacer MUCHO y poder hacerlo SOLO
#      lo declarado. Lista blanca + contención de rutas + registro por acción.
#   4. RAÍCES PERMITIDAS (v1.7.0): `resolve_pc_path` ya no devuelve una ruta
#      absoluta «tal cual». Toda ruta se resuelve y se comprueba contra las
#      raíces declaradas; fuera de ellas → 403 con el motivo y la instrucción
#      para permitirla. La blocklist de sistema se conserva como segunda red.
#   5. CORS LOCAL: solo orígenes de la IDE. Si NO hay cabecera Origin (el
#      caso del cliente Node, que no la manda), se exige además que la
#      petición venga de loopback: antes, «sin Origin» saltaba el filtro
#      entero, y eso dejaba la puerta abierta a cualquier cliente no-navegador.
#   6. AUDITORÍA: cada acción ejecutada o rechazada deja una línea en
#      `auditoria.jsonl` (hora, acción, detalle, ok, motivo). El Quirófano
#      juzga ESCRITURAS; esto juzga EJECUCIONES. Ver `/api/seguridad/estado`.
# ============================================================
import secrets

BRIDGE_TOKEN = os.environ.get("ACCESS_TOKEN", "") or secrets.token_urlsafe(24)
print("[Puente :%d] token %s" % (PORT, "activo (enviado por la IDE)" if os.environ.get("ACCESS_TOKEN") else "efímero autogenerado (AVISO: la IDE no podrá autenticarse)"), flush=True)

ORIGENES_PERMITIDOS = {
    "http://127.0.0.1:3000", "http://localhost:3000",
    "http://127.0.0.1:5173", "http://localhost:5173",
    "http://127.0.0.1:3500", "http://localhost:3500",
    "http://127.0.0.1:5000", "http://localhost:5000",
}

CRITICOS_WIN = ["c:/windows", "c:/program files", "c:/program files (x86)",
                "c:/programdata", "c:/boot", "c:/perflogs", "c:/recycler"]
CRITICOS_POSIX = ["/etc", "/boot", "/usr", "/bin", "/sbin", "/lib", "/lib64",
                  "/sys", "/proc", "/dev", "/var", "/root", "/private"]


def _origen_ok(headers, cliente=None):
    """CORS: si hay Origin, tiene que ser de la IDE.

    v1.7.0 — SI NO HAY Origin, ANTES SE SALITABA EL FILTRO ENTERO (`return True`).
    Y hay un caso muy concreto en el que no hay Origin: el cliente Node
    (`server.ts`), que no lo manda. Eso significaba que el filtro dejaba pasar a
    CUALQUIER cliente que no fuera un navegador — un script, un `curl`, otro
    proceso de la máquina — siempre que acertara el token. Ahora, sin Origin se
    exige además que la petición venga de loopback: la IDE sigue entrando igual,
    y lo que no es la IDE no entra por la puerta de atrás.
    """
    o = headers.get("Origin")
    if o is not None:
        return o in ORIGENES_PERMITIDOS
    return _es_loopback(cliente)


def _token_ok(headers):
    t = headers.get("X-Cerebro-Token") or ""
    a = headers.get("Authorization") or ""
    if a.lower().startswith("bearer "):
        t = a[7:].strip()
    return t != "" and t == BRIDGE_TOKEN


def _v_str(data, campo, maxl, req=True):
    """Validación estricta: tipo, vacío, longitud, bytes nulos."""
    v = data.get(campo)
    if v is None or not isinstance(v, str):
        if req:
            return None, "campo «%s» ausente o no es string" % campo
        return None, None
    if req and not v.strip():
        return None, "campo «%s» vacío" % campo
    if len(v) > maxl:
        return None, "campo «%s» excede %d caracteres" % (campo, maxl)
    if "\x00" in v:
        return None, "campo «%s» contiene bytes nulos" % campo
    return v, None


def _v_int(data, campo, mn, mx, default):
    v = data.get(campo, default)
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not (mn <= v <= mx):
        return default
    return int(v)


def _bloqueado_sistema(ruta):
    r = (ruta or "").lower().replace(chr(92), "/").strip()
    criticos = CRITICOS_WIN if os.name == "nt" else CRITICOS_POSIX
    for c in criticos:
        if r == c or r.startswith(c + "/"):
            return True
    return False


# ============================================================
# v1.7.0 — LISTA BLANCA, RAÍCES PERMITIDAS Y AUDITORÍA
# ------------------------------------------------------------
# POR QUÉ ESTO Y NO «TOKEN + AUDITORÍA»
# Con token + auditoría, la única barrera entre un modelo que se equivoca y tu
# disco era una credencial: quien la tuviera podía ejecutar cualquier binario y
# tocar cualquier ruta. La auditoría sirve para saber qué pasó DESPUÉS, no para
# impedirlo. Aquí se añade lo que faltaba: qué se puede ejecutar, dónde se puede
# escribir, y el registro de ambas decisiones — aceptadas y rechazadas.
#
# DERECHOS DE FÁBRICA: si el fichero de configuración falta o está corrupto se
# usan los de aquí. Un fallo de configuración NUNCA degrada a «permitir todo».
# ============================================================
import re
import shlex
import threading

CONFIG_FICHERO = os.environ.get("CEREBRONICO_PUENTE_CONFIG") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "puente-permitidos.json"
)

# Binarios que el puente acepta ejecutar. Deliberadamente NO están rm, mv, cp,
# dd, format, reg, net ni nada que sirva para borrar o tocar el registro: las
# mutaciones de fichero van por /api/fs/*, que sí comprueba raíces.
BINARIOS_FABRICA = [
    "node", "npm", "npx", "pnpm", "yarn",
    "python", "python3", "py", "pip", "pip3",
    "git", "ffmpeg", "ffprobe",
    "java", "javac", "mvn", "gradle",
    "go", "cargo", "rustc", "make", "cmake", "gcc", "g++", "clang",
    "tar", "unzip", "zip", "curl",
    "ls", "cat", "pwd", "echo", "grep", "find", "wc", "head", "tail",
    "which", "whereis", "whoami", "uname", "df", "du", "free", "ps",
]

# Nativos de Windows: no son ficheros .exe, los interpreta cmd.exe. Sin esto,
# `dir` o `echo` dejarían de funcionar al retirar shell=True.
NATIVOS_WINDOWS_FABRICA = [
    "dir", "echo", "type", "where", "tasklist", "taskkill", "findstr", "ver", "whoami",
]

# Metacaracteres que se RECHAZAN siempre: son composición de shell. `|`, `&&`
# y `||` se admiten como separadores validados (cada tramo por su cuenta).
PROHIBIDOS_COMANDO = [
    (";", "punto y coma"),
    (">", "redirección a fichero"),
    ("<", "redirección desde fichero"),
    ("`", "sustitución de comando"),
    ("$(", "sustitución de comando"),
    ("${", "expansión de variable"),
    ("\n", "salto de línea"),
    ("\r", "retorno de carro"),
    ("^", "escape de cmd.exe"),
    ("\x00", "byte nulo"),
]


def _raices_de_fabrica():
    """Raíces donde el puente puede leer y escribir."""
    home = os.path.expanduser("~")
    proyecto = os.path.abspath(
        os.environ.get("PROJECT_DIR") or os.path.join(os.getcwd(), ".proyectos")
    )
    bases = [
        proyecto,                                   # el sandbox del proyecto
        os.path.dirname(os.path.abspath(__file__)), # la carpeta de la app
        os.path.join(home, "Cerebronico"),          # raíz de datos (v1.6.10)
        os.path.join(home, "CN"),                   # bóveda de artefactos
        os.path.join(home, "Desktop"),
        os.path.join(home, "Documents"),
        os.path.join(home, "Downloads"),
        os.environ.get("TEMP") or os.environ.get("TMP") or "/tmp",
    ]
    vistos, salida = set(), []
    for b in bases:
        if not b:
            continue
        n = os.path.normcase(os.path.realpath(b))
        if n in vistos:
            continue
        vistos.add(n)
        salida.append(b)
    return salida


def _leer_config():
    """Lee puente-permitidos.json. Config rota = derechos de fábrica + aviso."""
    cfg = {}
    try:
        with open(CONFIG_FICHERO, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        if not isinstance(cfg, dict):
            cfg = {}
    except Exception:
        if os.path.exists(CONFIG_FICHERO):
            print("[Puente] AVISO: %s ilegible; se usan los derechos de fábrica" % CONFIG_FICHERO, flush=True)
        cfg = {}

    def _lista(clave, fabrica):
        v = cfg.get(clave)
        if isinstance(v, list) and v and all(isinstance(x, str) for x in v):
            return [x.strip().lower() if clave != "raices_extra" else x for x in v if x.strip()]
        return list(fabrica)

    return {
        "binarios": _lista("binarios_permitidos", BINARIOS_FABRICA),
        "nativos": _lista("nativos_windows", NATIVOS_WINDOWS_FABRICA),
        "raices": _lista("raices_permitidas", _raices_de_fabrica()) + [
            r for r in (cfg.get("raices_extra") or []) if isinstance(r, str) and r.strip()
        ],
    }


_CONFIG = _leer_config()
BINARIOS_PERMITIDOS = set(_CONFIG["binarios"])
NATIVOS_WINDOWS = set(_CONFIG["nativos"])
RAICES_PERMITIDAS = _CONFIG["raices"]


def _es_loopback(dir_ip):
    """¿Viene la petición de la propia máquina?"""
    ip = (dir_ip or "").strip()
    return ip in ("127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1")


def _raiz_permitida(ruta):
    """(permitida, raiz, motivo). Contención real: realpath + prefijo común."""
    try:
        real = os.path.normcase(os.path.realpath(ruta))
    except Exception as e:
        return False, None, "no se pudo resolver la ruta: %s" % e
    for base in RAICES_PERMITIDAS:
        try:
            b = os.path.normcase(os.path.realpath(base))
        except Exception:
            continue
        if real == b:
            return True, base, None
        try:
            if os.path.commonpath([real, b]) == b:
                return True, base, None
        except ValueError:
            continue  # volúmenes distintos (Windows): no puede estar dentro
    return False, None, (
        "ruta fuera de las raíces permitidas. Añade la carpeta a «raices_extra» "
        "en %s si de verdad la necesitas" % CONFIG_FICHERO
    )


def _base_binario(token):
    base = os.path.basename((token or "").strip()).lower()
    for suf in (".exe", ".cmd", ".bat", ".com"):
        if base.endswith(suf):
            return base[: -len(suf)]
    return base


def _sin_comillas(s):
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("\"", "'"):
        return s[1:-1]
    return s


def _validar_comando(comando):
    """Valida un comando SIN shell. Devuelve (segmentos, motivo).

    Cada segmento es una lista de argumentos lista para subprocess.run(shell=False).
    Motivo no nulo = se rechaza, con la razón concreta y qué hacer al respecto.
    """
    c = (comando or "").strip()
    if not c:
        return None, "comando vacío"
    for ch, nombre in PROHIBIDOS_COMANDO:
        if ch in c:
            return None, "comando rechazado: %s (el puente ya no usa shell)" % nombre

    # «&» SUELTO TAMBIÉN SE RECHAZA, y este caso tiene trampa: los nativos de
    # Windows viajan a `cmd.exe /c`, que interpreta `&` como «y después».
    # `dir & del /f /q *` era un comando válido hasta hace tres líneas. Se mira
    # DESPUÉS de neutralizar `&&`, que sí es un separador admitido.
    if "&" in c.replace("&&", ""):
        return None, "comando rechazado: «&» suelto (separador de comandos en cmd.exe)"

    partes = re.split(r"\|\||&&|\|", c)
    segmentos = []
    for parte in partes:
        args = [_sin_comillas(a) for a in shlex.split(parte, posix=(os.name != "nt")) if a.strip()]
        if not args:
            return None, "comando vacío entre separadores"
        args = [os.path.expanduser(a) if a.startswith("~") else a for a in args]
        if not _binario_permitido(args[0]):
            return None, (
                "binario no permitido: «%s». Si es legítimo, añádelo a "
                "«binarios_permitidos» en %s" % (args[0], CONFIG_FICHERO)
            )
        segmentos.append(args)
    return segmentos, None


def _binario_permitido(token):
    """¿Puede ejecutarse este binario?

    Los nativos de Windows (dir, echo, taskkill…) cuentan como permitidos SOLO
    en Windows: son órdenes de cmd.exe, no ficheros .exe, y en Linux no existen.
    Este detalle fue un fallo real de la primera versión de esta puerta: se
    comprobaba la lista de binarios y se olvidaba la de nativos, de modo que
    `dir` quedaba rechazado en Windows por el endurecimiento pensado para
    Windows. La lista blanca que bloquea el trabajo legítimo es la misma clase
    de error que no tener lista blanca.
    """
    base = _base_binario(token)
    if base in BINARIOS_PERMITIDOS:
        return True
    return os.name == "nt" and base in NATIVOS_WINDOWS


def _argv_de_segmento(args):
    """Los nativos de Windows se ejecutan por cmd.exe /c con el comando YA saneado."""
    if os.name == "nt" and _base_binario(args[0]) in NATIVOS_WINDOWS:
        return ["cmd", "/c", " ".join(('"%s"' % a if " " in a else a) for a in args)]
    return args


def _auditoria_fichero():
    raiz = os.environ.get("CEREBRONICO_DATOS") or os.path.join(os.path.expanduser("~"), "Cerebronico")
    for carpeta in (os.path.join(raiz, ".cerebro-db"), os.path.dirname(os.path.abspath(__file__))):
        try:
            os.makedirs(carpeta, exist_ok=True)
            if os.access(carpeta, os.W_OK):
                return os.path.join(carpeta, "auditoria.jsonl")
        except Exception:
            continue
    return None


AUDITORIA_FICHERO = _auditoria_fichero()
_LOCK_AUDITORIA = threading.Lock()


def _auditar(accion, detalle, ok, motivo=None):
    """Una línea por decisión: aceptada o rechazada. Nunca lanza."""
    if not AUDITORIA_FICHERO:
        return
    linea = json.dumps({
        "hora": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime()),
        "accion": accion,
        "detalle": (detalle or "")[:400],
        "ok": bool(ok),
        "motivo": motivo,
    }, ensure_ascii=False)
    try:
        with _LOCK_AUDITORIA:
            with open(AUDITORIA_FICHERO, "a", encoding="utf-8") as f:
                f.write(linea + "\n")
    except Exception:
        pass


def _ultimas_auditorias(n=20):
    if not AUDITORIA_FICHERO or not os.path.exists(AUDITORIA_FICHERO):
        return []
    try:
        with open(AUDITORIA_FICHERO, "r", encoding="utf-8", errors="replace") as f:
            lineas = f.readlines()[-n:]
        salida = []
        for l in lineas:
            try:
                salida.append(json.loads(l))
            except Exception:
                pass
        return salida
    except Exception:
        return []


HOST = os.environ.get("HOST", "127.0.0.1")
START_TIME = time.time()

# 🔧 CORRECCIÓN CRÍTICA (Windows): Forzar UTF-8 en stdout/stderr.
# Sin esto, los emojis (🐍 ⚡ 📡) en los prints causan:
#   UnicodeEncodeError: 'charmap' codec can't encode character '\U0001f40d'
# porque Windows usa CP1252 por defecto y no puede codificar esos caracteres.
# Esto hacía que el puente crasheara al arranque y nunca quedara escuchando.
import io
import codecs
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)
except Exception:
    # Fallback: reconfigure si TextIOWrapper no funciona (Python < 3.7)
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
        sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    except Exception:
        pass


# ------------------------------------------------------------------
# Utilidades de acceso a la PC (resolución de rutas + sondeo de servicios)
# ------------------------------------------------------------------
def resolve_pc_path(p: str) -> str:
    r"""Resuelve una ruta a la que tiene acceso el puente en la PC.

    Soporta:
      - "~/..."  y  "~"            -> carpeta de usuario
      - "Desktop/..."  | "ESCRITORIO/..." -> Escritorio del usuario
      - "Documents" | "Downloads"  -> carpetas estandar
      - rutas absolutas (C:\..., /home/...) -> SOLO si caen dentro de una raíz
        declarada en puente-permitidos.json (v1.7.0)

    v1.7.0 — LO QUE CAMBIÓ Y POR QUÉ
    Antes el final de esta función era `return os.path.abspath(p)`: cualquier
    ruta absoluta pasaba tal cual, y la única barrera era una blocklist corta
    por prefijo. Con el token en la mano, /api/fs/* alcanzaba cualquier carpeta
    del usuario (`~/.ssh`, `~/Documents`, lo que fuera). Ahora toda ruta se
    resuelve y se COMPRUEBA contra las raíces permitidas; fuera de ellas se
    levanta PermissionError con el motivo y con la instrucción para permitirla.
    La decisión es del dueño de la máquina y queda escrita, no silenciosa.
    """
    if not p:
        raise ValueError("Falta la ruta del archivo")
    p = str(p).strip()
    home = os.path.expanduser("~")
    if p in ("~", "~" + os.sep, "~/"):
        candidata = home
    elif p.startswith("~" + os.sep) or p.startswith("~/"):
        candidata = os.path.abspath(os.path.join(home, p[2:]))
    else:
        low = p.lower()
        # Atajos de escritorio / documentos (útil para el agente PC)
        if low in ("desktop", "escritorio", "one_drive_desktop", "one_drive\\desktop"):
            candidata = os.path.join(home, "Desktop")
        elif low.startswith(("desktop/", "desktop\\", "escritorio/", "escritorio\\")):
            candidata = os.path.abspath(os.path.join(home, "Desktop", p.split(os.sep, 1)[-1]))
        elif low in ("documents", "docs", "documentos"):
            candidata = os.path.join(home, "Documents")
        elif low.startswith(("documents/", "documents\\")):
            candidata = os.path.abspath(os.path.join(home, "Documents", p.split(os.sep, 1)[-1]))
        elif low in ("downloads", "descargas"):
            candidata = os.path.join(home, "Downloads")
        else:
            candidata = os.path.abspath(p)

    permitida, _raiz, motivo = _raiz_permitida(candidata)
    if not permitida:
        raise PermissionError(motivo or "ruta fuera de las raíces permitidas")
    return candidata


def _probe(url: str, timeout: float = 1.5) -> bool:
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return 200 <= r.status < 500
    except Exception:
        return False


def get_pc_info() -> dict:
    home = os.path.expanduser("~")
    return {
        "os": platform.system(),            # Windows / Linux / Darwin
        "osRelease": platform.platform(),
        "arch": platform.machine(),
        "username": os.environ.get("USERNAME") or os.environ.get("USER") or getpass.getuser(),
        "home": home,
        "desktop": os.path.join(home, "Desktop") if os.path.isdir(os.path.join(home, "Desktop")) else os.path.join(home, "OneDrive", "Desktop") if os.path.isdir(os.path.join(home, "OneDrive", "Desktop")) else home,
        "temp": os.environ.get("TEMP") or os.environ.get("TMP") or "/tmp",
        "cwd": os.getcwd(),
        "python": sys.version.split()[0],
        "machine": platform.node(),
    }


def get_subagents() -> dict:
    """Topología de subagentes del IDE con estado en vivo."""
    home = os.path.expanduser("~")
    # v1.6.10 — MISMA RAIZ QUE EL MOTOR.
    # Antes esto era `.proyectos` colgado del directorio de trabajo, a secas. El
    # puente NO leia PROJECT_DIR, asi que apuntar el motor a C:\Cerebronico no
    # unificaba nada: lo PARTIA. El motor se mudaba y el puente se quedaba en la
    # carpeta extraida, con dos sandboxes distintos y la apariencia de estar bien.
    sandbox = os.path.abspath(
        os.environ.get("PROJECT_DIR") or os.path.join(os.getcwd(), ".proyectos")
    )
    items = [
        {
            "id": "ui",
            "name": "Interfaz UI",
            "port": 3000,
            "url": "http://127.0.0.1:3000",
            "role": "Frontend React/Vite + editor y chat",
            "status": "online",  # si el puente responde, la UI casi seguro está arriba
        },
        {
            "id": "bridge",
            "name": "Puente PC (Agente 5000)",
            "port": PORT,
            "url": f"http://127.0.0.1:{PORT}",
            "role": "Ejecución de comandos y archivos sobre la PC real",
            "status": "online",
        },
        {
            "id": "ollama",
            "name": "Motor de Inferencia (Ollama)",
            "port": 11434,
            "url": "http://127.0.0.1:11434",
            "role": "LLM local (tool-calling del chat)",
            "status": "online" if _probe("http://127.0.0.1:11434/api/tags") else "offline",
        },
        {
            "id": "sandbox",
            "name": "Sandbox del Proyecto",
            "port": None,
            "path": sandbox,
            "role": "Área aislada .proyectos (list_files/write_file del chat)",
            "status": "online" if os.path.isdir(sandbox) else "offline",
        },
    ]
    return {"bridge": f"http://127.0.0.1:{PORT}", "items": items}


class CerebroBridgeHandler(http.server.BaseHTTPRequestHandler):
    # HTTP/1.1 + Connection: close para que el cliente sepa cuándo termina la respuesta
    # sin necesidad de Content-Length (importante para streaming).
    protocol_version = "HTTP/1.1"

    def _set_headers(self, status_code=200, content_type="application/json", extra_headers=None):
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        o = self.headers.get("Origin")
        if o in ORIGENES_PERMITIDOS:
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Max-Age", "86400")
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()

    def _send_json(self, status_code, obj):
        # 🔧 Wrap en try/except: en Windows, cuando el cliente (server.ts) hace
        # fetch con timeout corto y aborta, el socket ya está cerrado cuando
        # intentamos escribir → ConnectionAbortedError [WinError 10053].
        # Esto es normal (el cliente simplemente se fue) y no debería llenar el
        # log de tracebacks feos.
        try:
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            o = self.headers.get("Origin")
            if o in ORIGENES_PERMITIDOS:
                self.send_header("Access-Control-Allow-Origin", o)
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            # Cliente se desconectó antes de que termináramos de escribir — silencioso
            pass
        except Exception as e:
            print(f"[Bridge 5000] _send_json error: {e}", flush=True)

    def do_OPTIONS(self):
        try:
            self.send_response(204)
            o = self.headers.get("Origin")
            if o in ORIGENES_PERMITIDOS:
                self.send_header("Access-Control-Allow-Origin", o)
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Cerebro-Token, Authorization")
            self.send_header("Access-Control-Max-Age", "86400")
            self.send_header("Content-Length", "0")
            self.end_headers()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass

    def do_GET(self):
        url_path = self.path.split("?")[0]

        # Health checks / Status
        if url_path in ["/", "/status", "/health", "/api/status", "/api/health"]:
            uptime_seconds = int(time.time() - START_TIME)
            payload = {
                "status": "online",
                "agent": "Agente SuperCodeApp (Puente Python 3 Nativo)",
                "runtime": f"Python {sys.version.split()[0]}",
                "pythonSupport": True,
                "pcAccess": True,
                "port": PORT,
                "uptime": uptime_seconds,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            self._send_json(200, payload)
            return

        # Ollama local proxy with full PNA headers
        if url_path in ["/api/ollama-tags", "/api/ollama/tags"]:
            try:
                req = urllib.request.Request("http://127.0.0.1:11434/api/tags")
                with urllib.request.urlopen(req, timeout=3) as response:
                    raw = response.read().decode("utf-8")
                    self._send_json(200, json.loads(raw) if raw else {"models": []})
                    return
            except Exception as e:
                self._send_json(200, {"status": "offline", "error": str(e), "models": []})
                return

        # 6. Información de la PC (para el Agente PC y el panel Subagentes)
        if url_path in ["/api/pc", "/api/pc/info"]:
            try:
                self._send_json(200, get_pc_info())
            except Exception as e:
                self._send_json(500, {"error": str(e)})
            return

        # 7. Topología de subagentes del IDE (estado en vivo)
        if url_path in ["/api/subagents"]:
            try:
                self._send_json(200, get_subagents())
            except Exception as e:
                self._send_json(500, {"error": str(e)})
            return

        # 8. Postura de seguridad del puente (v1.7.0): NADA SILENCIOSO.
        # Devuelve lo que el puente permite HOY y lo que ha hecho/has rechazado,
        # para que la IDE (y la suite de pruebas) puedan comprobarlo sin leer el
        # código: si esto no cuadra con lo que promete la documentación, se ve.
        if url_path in ["/api/seguridad/estado", "/api/seguridad"]:
            self._send_json(200, {
                "shell": False,
                "shell_nota": "modo shell retirado: nativos de Windows por cmd.exe /c con comando saneado",
                "binarios_permitidos": sorted(BINARIOS_PERMITIDOS),
                "nativos_windows": sorted(NATIVOS_WINDOWS),
                "raices_permitidas": RAICES_PERMITIDAS,
                "config": CONFIG_FICHERO,
                "config_existe": os.path.exists(CONFIG_FICHERO),
                "auditoria": AUDITORIA_FICHERO,
                "metacaracteres_rechazados": [c for c, _ in PROHIBIDOS_COMANDO],
                "host": HOST,
                "origen": "Origin obligatorio si está presente; sin Origin, solo loopback",
                "ultimas": _ultimas_auditorias(20),
            })
            return

        self._send_json(404, {"error": f"Ruta GET '{url_path}' no encontrada"})

    def do_POST(self):
        url_path = self.path.split("?")[0]
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8", errors="replace")

        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {}

        # V8 — PUERTA DE SEGURIDAD: token y origen ANTES de tocar sistema/disco
        if not _origen_ok(self.headers, self.client_address[0]):
            _auditar("seguridad", url_path, False, "origen no permitido: %s" % self.headers.get("Origin"))
            print("[Seguridad] POST rechazado: origen %s" % self.headers.get("Origin"), flush=True)
            self._send_json(403, {"error": "origen no permitido"})
            return
        if not _token_ok(self.headers):
            _auditar("seguridad", url_path, False, "token inválido desde %s" % self.client_address[0])
            print("[Seguridad] POST rechazado: token inválido desde %s %s" % (self.client_address[0], url_path), flush=True)
            self._send_json(401, {"error": "token requerido (X-Cerebro-Token)"})
            return

        # 1. Endpoint de Agente / Generación
        if url_path in ["/api/agent", "/api/generate"]:
            command, err = _v_str(data, "command", 4096, req=False)
            if err:
                self._send_json(400, {"error": err})
                return
            prompt = data.get("prompt", "")

            if command:
                print("[Auditoria] agent exec: %r" % command[:200], flush=True)
                res = self._run_command(command)
                self._send_json(200, res)
                return

            self._send_json(200, {
                "status": "success",
                "content": f"[Agent Bridge Python 5000] Procesado con éxito en tu máquina local.\nPrompt: {prompt}",
                "agent": "SuperCodeApp Python Bridge v1.0",
            })
            return

        # 2. Endpoint de Comandos Shell (CMD / PowerShell / Bash)
        if url_path == "/api/exec":
            command, err = _v_str(data, "command", 4096)
            if err:
                self._send_json(400, {"error": err})
                return
            timeout = _v_int(data, "timeout", 1, 300, 120)
            print("[Auditoria] exec desde %s: %r" % (self.client_address[0], command[:200]), flush=True)
            res = self._run_command(command, timeout=timeout)
            self._send_json(200, res)
            return

        # 4. Sistema de archivos de la PC real (Agente PC)
        if url_path == "/api/fs/write":
            raw_path, err = _v_str(data, "path", 1024)
            if err:
                self._send_json(400, {"error": err})
                return
            content, err = _v_str(data, "content", 20 * 1024 * 1024, req=False)
            if err:
                self._send_json(400, {"error": err})
                return
            content = content or ""
            mode, err = _v_str(data, "mode", 8, req=False)
            if err or mode not in ("w", "a"):
                self._send_json(400, {"error": "«mode» debe ser «w» o «a»"})
                return
            if _bloqueado_sistema(raw_path):
                self._send_json(403, {"error": "ruta de sistema bloqueada (blocklist)"})
                return
            print("[Auditoria] fs/write %s (%d bytes)" % (raw_path, len(content)), flush=True)
            try:
                target = self._resolver(raw_path)
                if target is None:
                    return
                d = os.path.dirname(target)
                if d:
                    os.makedirs(d, exist_ok=True)
                with open(target, mode, encoding="utf-8") as f:
                    f.write(content)
                self._send_json(200, {"ok": True, "path": target, "bytes": len(content)})
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        # 4b. Escritura BINARIA por base64 — BOVEDA v1 (Reflejo v5).
        # El pedido del usuario: que la imagen generada VIAJE desde el sandbox
        # hasta la carpeta local indexada de CerebroNico en el disco real
        # (ej. C:\CN\IMAGENES\<proyecto>\...). /api/fs/write es de texto y
        # corrompería bytes; esta puerta es la única que escribe binario.
        # Mantiene todas las garantías de fs/write: resolve_pc_path (atajos ~,
        # Desktop, Documents o absoluta), creación de carpetas y límite de peso.
        if url_path == "/api/fs/write_b64":
            raw_path, err = _v_str(data, "path", 1024)
            if err:
                self._send_json(400, {"error": err})
                return
            b64, err = _v_str(data, "contentBase64", 26 * 1024 * 1024, req=False)
            if err:
                self._send_json(400, {"error": err})
                return
            b64 = b64 or ""
            if _bloqueado_sistema(raw_path):
                self._send_json(403, {"error": "ruta de sistema bloqueada (blocklist)"})
                return
            print("[Auditoria] fs/write_b64 %s (%d chars b64)" % (raw_path, len(b64)), flush=True)
            try:
                max_bytes = int(data.get("maxBytes", 25 * 1024 * 1024))
            except Exception:
                max_bytes = 25 * 1024 * 1024
            try:
                import base64 as _b64
                target = self._resolver(raw_path)
                if target is None:
                    return
                payload = _b64.b64decode(b64)
                if len(payload) > max_bytes:
                    self._send_json(413, {"ok": False, "error": f"{len(payload)} bytes supera el límite de {max_bytes}"})
                    return
                d = os.path.dirname(target)
                if d:
                    os.makedirs(d, exist_ok=True)
                with open(target, "wb") as f:
                    f.write(payload)
                self._send_json(200, {"ok": True, "path": target, "bytes": len(payload)})
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        # 4c. Crear carpeta — BOVEDA v1: el árbol indexado (C:\CN\IMAGENES\…,
        # APPS, INVESTIGACION, DOCUMENTOS, DATOS) se materializa CON EL AGENTE,
        # no a mano. exist_ok: preparar dos veces no es un error.
        if url_path == "/api/fs/mkdir":
            raw_path, err = _v_str(data, "path", 1024)
            if err:
                self._send_json(400, {"error": err})
                return
            if _bloqueado_sistema(raw_path):
                self._send_json(403, {"error": "ruta de sistema bloqueada (blocklist)"})
                return
            print("[Auditoria] fs/mkdir %s" % raw_path, flush=True)
            try:
                target = self._resolver(raw_path)
                if target is None:
                    return
                os.makedirs(target, exist_ok=True)
                self._send_json(200, {"ok": True, "path": target})
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if url_path == "/api/fs/read":
            raw_path, err = _v_str(data, "path", 1024)
            if err:
                self._send_json(400, {"error": err})
                return
            try:
                target = self._resolver(raw_path)
                if target is None:
                    return
                with open(target, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                self._send_json(200, {"ok": True, "path": target, "content": content[:200000]})
            except FileNotFoundError:
                self._send_json(404, {"ok": False, "error": f"No existe: {raw_path}"})
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if url_path == "/api/fs/list":
            raw_path, err = _v_str(data, "path", 1024, req=False)
            if err:
                self._send_json(400, {"error": err})
                return
            raw_path = raw_path or "."
            try:
                target = self._resolver(raw_path)
                if target is None:
                    return
                if not os.path.exists(target):
                    self._send_json(404, {"ok": False, "error": f"No existe: {raw_path}"})
                    return
                if os.path.isfile(target):
                    self._send_json(200, {"ok": True, "path": target, "isDir": False, "entries": []})
                    return
                entries = []
                try:
                    names = _glob.glob(os.path.join(target, "*"))
                except PermissionError:
                    names = []
                for n in sorted(names)[:500]:
                    st = os.stat(n)
                    entries.append({
                        "name": os.path.basename(n),
                        "path": n,
                        "isDir": os.path.isdir(n),
                        "size": 0 if os.path.isdir(n) else st.st_size,
                    })
                self._send_json(200, {"ok": True, "path": target, "isDir": True, "entries": entries})
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if url_path == "/api/fs/delete":
            raw_path, err = _v_str(data, "path", 1024)
            if err:
                self._send_json(400, {"error": err})
                return
            if _bloqueado_sistema(raw_path):
                self._send_json(403, {"error": "ruta de sistema bloqueada (blocklist)"})
                return
            print("[Auditoria] fs/DELETE %s" % raw_path, flush=True)
            try:
                target = self._resolver(raw_path)
                if target is None:
                    return
                if not os.path.exists(target):
                    self._send_json(404, {"ok": False, "error": f"No existe: {raw_path}"})
                    return
                if os.path.isdir(target):
                    shutil.rmtree(target)
                else:
                    os.remove(target)
                self._send_json(200, {"ok": True, "path": target})
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        # 3. Endpoint de Ejecución Directa de Código Python
        if url_path == "/api/python":
            python_code, err = _v_str(data, "code", 100 * 1024)
            if err:
                self._send_json(400, {"error": err})
                return
            print("[Auditoria] python exec (%d chars)" % len(python_code), flush=True)

            temp_filename = os.path.join(os.getcwd(), f"temp_exec_{int(time.time() * 1000)}.py")
            try:
                with open(temp_filename, "w", encoding="utf-8") as f:
                    f.write(python_code)

                cmd = f'"{sys.executable}" "{temp_filename}"'
                res = self._run_command(cmd)
                self._send_json(200, res)
            finally:
                if os.path.exists(temp_filename):
                    try:
                        os.remove(temp_filename)
                    except Exception:
                        pass
            return

        self._send_json(404, {"error": f"Ruta POST '{url_path}' no encontrada"})

    def _resolver(self, raw_path):
        """resolve_pc_path + puerta de raíces + registro. None = rechazado.

        Es el ÚNICO punto por el que /api/fs/* resuelve una ruta. Un solo
        guardián, no seis copias: así no puede quedar una puerta sin cerrar
        porque alguien añadió un endpoint y se olvidó de la comprobación.
        """
        accion = (self.path or "").split("?")[0].replace("/api/", "").strip("/") or "fs"
        try:
            destino = resolve_pc_path(raw_path)
        except PermissionError as e:
            _auditar(accion, raw_path, False, str(e))
            print(f"[Seguridad] ruta RECHAZADA ({accion}): {raw_path} — {e}", flush=True)
            self._send_json(403, {
                "ok": False,
                "error": str(e),
                "motivo": "fuera de raíz permitida",
            })
            return None
        except Exception as e:
            _auditar(accion, raw_path, False, str(e))
            self._send_json(400, {"ok": False, "error": str(e)})
            return None
        _auditar(accion, destino, True, None)
        return destino

    def _run_command(self, command: str, timeout: int = 120) -> dict:
        """Ejecuta un comando VALIDADO, SIN shell, y deja constancia.

        v1.7.0 — aquí había `shell=True` con un comentario que declaraba el
        tradeoff («comandos nativos de Windows: dir, taskkill, pipelines»). El
        tradeoff se cerró sin perder el uso: los nativos de Windows se ejecutan
        por `cmd.exe /c` con el comando YA saneado, y los tramos separados por
        `|`, `&&` o `||` se validan uno a uno contra la lista blanca. Lo que ya
        no ocurre es «esta cadena, tal cual, al shell del sistema».

        LÍMITE DECLARADO: la lista blanca decide QUÉ programas se ejecutan; no
        encierra los permisos de fichero de un programa permitido (para eso hace
        falta un sandbox del sistema operativo). Lo que sí impide: binarios
        arbitrarios, composición de shell, redirección a fichero y borrado.
        """
        print(f"[Agente Python 5000] Ejecutando: {command}", flush=True)
        segmentos, motivo = _validar_comando(command)
        if segmentos is None:
            _auditar("exec", command, False, motivo)
            print(f"[Seguridad] exec RECHAZADO: {motivo}", flush=True)
            return {
                "success": False,
                "content": motivo,
                "output": "",
                "error": motivo,
                "returncode": None,
                "rechazado": True,
            }

        _auditar("exec", command, True, None)
        try:
            sandbox = os.environ.get("PROJECT_DIR") or os.path.join(os.getcwd(), ".proyectos")
            cwd = sandbox if os.path.isdir(sandbox) else None
            entrada = None
            salida_total = ""
            error_total = ""
            codigo = 0
            for args in segmentos:
                proc = subprocess.run(
                    _argv_de_segmento(args),
                    shell=False,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    encoding="utf-8",
                    errors="replace",
                    input=entrada,
                    cwd=cwd,
                )
                entrada = proc.stdout or ""
                salida_total += entrada
                if proc.stderr:
                    error_total += proc.stderr
                codigo = proc.returncode
                if codigo != 0:
                    break
            output = salida_total + ("\n" + error_total if error_total else "")
            success = (codigo == 0)
            return {
                "success": success,
                "content": output.strip() or ("Ejecutado con éxito" if success else "Error en ejecución"),
                "output": output.strip(),
                "error": error_total.strip() if not success else None,
                "returncode": codigo,
            }
        except subprocess.TimeoutExpired:
            _auditar("exec", command, False, "timeout %ss" % timeout)
            return {"success": False, "error": f"Tiempo de ejecución excedido (Timeout {timeout}s)", "output": ""}
        except FileNotFoundError as e:
            _auditar("exec", command, False, "binario no encontrado: %s" % e)
            return {"success": False, "error": f"Binario no encontrado o no instalado: {e}", "output": ""}
        except Exception as e:
            _auditar("exec", command, False, str(e))
            return {"success": False, "error": str(e), "output": ""}

    def log_message(self, format, *args):
        # Log simplificado y limpio (con flush para Windows)
        print(f"[Bridge 5000] {self.address_string()} - {format % args}", flush=True)


class ThreadingTCPServer(ThreadingMixIn, socketserver.TCPServer):
    """Servidor multi-hilo: una request lenta no bloquea /health."""
    daemon_threads = True
    allow_reuse_address = True


def run_server():
    try:
        with ThreadingTCPServer((HOST, PORT), CerebroBridgeHandler) as httpd:
            print("\n" + "=" * 60, flush=True)
            print("🐍 [Agente SuperCodeApp] Servidor Puente Python Activo", flush=True)
            print(f"📡 URL Local:      http://localhost:{PORT}", flush=True)
            print(f"🌐 URL Red:        http://127.0.0.1:{PORT}", flush=True)
            print(f"⚙️ Runtime:        Python {sys.version.split()[0]} ({sys.platform})", flush=True)
            print("⚡ Características: CORS local, Python 3 Exec, lista blanca de binarios, V8 sin shell, Multi-hilo", flush=True)
            print("🔒 Seguridad: %d binarios permitidos · %d raíces permitidas · auditoría en %s" % (
                len(BINARIOS_PERMITIDOS), len(RAICES_PERMITIDAS), AUDITORIA_FICHERO or "(no escribible)"), flush=True)
            print("=" * 60 + "\n", flush=True)
            print("Esperando conexiones desde CerebroNico...\n", flush=True)
            httpd.serve_forever()
    except OSError as e:
        winerror = getattr(e, 'winerror', None)
        if "Address already in use" in str(e) or winerror == 10048:
            print(f"\n❌ [ERROR] El puerto {PORT} ya está ocupado.", flush=True)
            print("💡 Para liberarlo en Windows ejecuta en CMD:", flush=True)
            print(f"   netstat -ano | findstr :{PORT}", flush=True)
            print("   taskkill /PID <NUMERO_PID> /F\n", flush=True)
            print("💡 Para liberarlo en Linux/Mac ejecuta:", flush=True)
            print(f"   fuser -k {PORT}/tcp\n", flush=True)
        else:
            print(f"❌ Error al iniciar servidor: {e}", flush=True)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n👋 Puente 5000 detenido por el usuario.", flush=True)
        sys.exit(0)


if __name__ == "__main__":
    run_server()
