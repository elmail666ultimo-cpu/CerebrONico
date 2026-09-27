# CerebroNico IDE — Modo Agente PC
## Resumen técnico + código (build 3.0)

> **Creado por: Mario Nicolás Quintero**
> Documento generado el 10 de septiembre de 2026.
> Proyecto: `Codigo-0 CerebroNico IDE` · ZIP de entrega: `CerebroNico-IDE-agent-v3.zip`

---

## 1. Créditos

**Autor / creación: Mario Nicolás Quintero** — diseño de la arquitectura,
el agente de ejecución local (puente 5000) y la evolución del chat a un
IDE con acciones reales sobre la PC.

---

## 2. Qué era el problema

Antes de esta evolución, el chat del IDE **solo hablaba**:

- El modelo podía generar texto y manipular archivos dentro de un sandbox
  aislado (`.proyectos`).
- El "agente" en el **puerto 5000** (`agent_bridge_5000.py`) existía, pero el
  chat **nunca lo usaba**: no había ninguna ruta por la que el modelo pudiera
  pedirle cosas al agente.
- El usuario veía errores de *proveedores* (Ollama cloud HTTP 402, Gemini sin
  `GEMINI_API_KEY`, OpenRouter sin créditos) y el IDE parecía "no hacer nada".

**Objetivo:** que el IDE sea **realmente funcional** — que al usuario diga
*"crea un archivo en mi escritorio"* o *"ejecuta este comando"*, el IDE lo
**haga de verdad** en la PC del usuario, a través del agente 5000.

---

## 3. Arquitectura final

```
Usuario (chat, :3000)
   │  "crea prueba.txt en mi escritorio con 'hola'"
   ▼
Server / agente  (server.ts, :3000)
   │
   ├─ ACCIONES RÁPIDAS (determinista, SIN LLM)  ──►  Puente PC (:5000)  ──►  PC real
   │
   └─ (si no es acción directa) LLM local Ollama (:11434)
              │  tool-calling: pc_write_file / pc_exec / ...
              ▼
           Server ejecuta la tool  ──►  Puente PC (:5000)  ──►  PC real
```

| Subagente | Puerto | Rol |
|---|---|---|
| **Interfaz UI** | 3000 | Frontend React/Vite + editor + chat |
| **Puente PC (Agente 5000)** | 5000 | Ejecución real: comandos y archivos sobre la PC |
| **Motor de Inferencia** | 11434 | Ollama local (LLM con tool-calling) |
| **Sandbox** | — | Área aislada `.proyectos` (herramientas sin prefijo `pc_`) |

---

## 4. Lo que se construyó (build 2.0 + 3.0)

### Build 2.0 — Conectar el chat al agente 5000
- Nuevos **endpoints PC** en el puente Python: `pc/info`, `subagents`,
  `fs/write`, `fs/read`, `fs/list`, `fs/delete`; `/api/exec` con timeout configurable.
- **Herramientas `pc_*`** en `server.ts` que el LLM puede invocar (tool-calling).
- **Modo Agente PC** (`pcMode`): toggle en la UI; inyecta un protocolo al modelo
  y habilita las herramientas `pc_*`.
- **Panel Subagentes** con estado en vivo (UI / Puente / Ollama / Sandbox).

### Build 3.0 — Evolución rápida para "pocos créditos"
1. **Acciones rápidas deterministas:** si el usuario pide algo directo
   (crear / leer / listar / borrar archivo, ejecutar comando), el servidor lo
   ejecuta **inmediatamente contra el agente 5000 SIN llamar al LLM**. Funciona
   aunque el modelo sea 1.5b o Ollama esté caída.
2. **Log de acciones visible:** panel *"Acciones ejecutadas (agente 5000)"* en el
   chat que muestra cada herramienta usada (✓/✗).

> Todo esto **no gasta créditos ni inferencia** cuando la acción es directa.

---

## 5. Verificación (tests en vivo)

| Caso | Resultado |
|---|---|
| `tsc --noEmit` | ✅ limpio |
| `vite build` (producción) | ✅ 1881 módulos |
| Puente 5000: write→read→list→delete + exec + info + subagents | ✅ en vivo |
| Server auto-arranca el puente y sirve `/api/subagents` | ✅ |
| **Acción rápida "crear archivo" con Ollama OFF** | ✅ archivo real en disco |
| Acción rápida "leer / listar / ejecutar `uname -a`" | ✅ salida real |
| Frase normal → pasa al LLM (no se hijackea) | ✅ |
| `pcMode` OFF → no dispara acciones | ✅ |

**Bug corregido durante el test:** el gate de "ejecutar" usaba `\bejecut\b`
que no coincidía con "ejecut**a**" → se cambió a stems (`ejecut|corr|run|lleva`).
El nombre de archivo pasó a extraerse por **token** (antes tragaba toda la frase).

---

## 6. CÓDIGO — Puente PC (`agent_bridge_5000.py`)

### 6.1 Resolución de rutas de la PC

```python
def resolve_pc_path(p: str) -> str:
    r"""Resuelve una ruta a la que tiene acceso el puente en la PC.

    Soporta:
      - "~/..."  y  "~"            -> carpeta de usuario
      - "Desktop/..."  | "ESCRITORIO/..." -> Escritorio del usuario
      - "Documents" | "Downloads"  -> carpetas estandar
      - rutas absolutas (C:\..., /home/...) -> tal cual
    """
    if not p:
        raise ValueError("Falta la ruta del archivo")
    p = str(p).strip()
    home = os.path.expanduser("~")
    if p in ("~", "~" + os.sep, "~/"):
        return home
    if p.startswith("~" + os.sep) or p.startswith("~/"):
        return os.path.abspath(os.path.join(home, p[2:]))

    low = p.lower()
    # Atajos de escritorio / documentos (útil para el agente PC)
    if low in ("desktop", "escritorio", "one_drive_desktop", "one_drive\\desktop"):
        return os.path.join(home, "Desktop")
    if low.startswith(("desktop/", "desktop\\", "escritorio/", "escritorio\\")):
        return os.path.abspath(os.path.join(home, "Desktop", p.split(os.sep, 1)[1]))
    if low in ("documents", "docs", "documentos"):
        return os.path.join(home, "Documents")
    if low.startswith(("documents/", "documents\\")):
        return os.path.abspath(os.path.join(home, "Documents", p.split(os.sep, 1)[1]))
    if low in ("downloads", "descargas"):
        return os.path.join(home, "Downloads")

    return os.path.abspath(p)
```

### 6.2 Información de la PC + topología de subagentes

```python
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
        "username": os.environ.get("USERNAME") or os.environ.get("USER") or platform.user(),
        "home": home,
        "desktop": os.path.join(home, "Desktop") if os.path.isdir(os.path.join(home, "Desktop"))
                   else os.path.join(home, "OneDrive", "Desktop") if os.path.isdir(os.path.join(home, "OneDrive", "Desktop")) else home,
        "temp": os.environ.get("TEMP") or os.environ.get("TMP") or "/tmp",
        "cwd": os.getcwd(),
        "python": sys.version.split()[0],
        "machine": platform.node(),
    }


def get_subagents() -> dict:
    """Topología de subagentes del IDE con estado en vivo."""
    home = os.path.expanduser("~")
    sandbox = os.path.join(os.getcwd(), ".proyectos")
    items = [
        {"id": "ui", "name": "Interfaz UI", "port": 3000,
         "url": "http://127.0.0.1:3000",
         "role": "Frontend React/Vite + editor y chat", "status": "online"},
        {"id": "bridge", "name": "Puente PC (Agente 5000)", "port": PORT,
         "url": f"http://127.0.0.1:{PORT}",
         "role": "Ejecución de comandos y archivos sobre la PC real", "status": "online"},
        {"id": "ollama", "name": "Motor de Inferencia (Ollama)", "port": 11434,
         "url": "http://127.0.0.1:11434",
         "role": "LLM local (tool-calling del chat)",
         "status": "online" if _probe("http://127.0.0.1:11434/api/tags") else "offline"},
        {"id": "sandbox", "name": "Sandbox del Proyecto", "port": None, "path": sandbox,
         "role": "Área aislada .proyectos (list_files/write_file del chat)",
         "status": "online" if os.path.isdir(sandbox) else "offline"},
    ]
    return {"bridge": f"http://127.0.0.1:{PORT}", "items": items}
```

### 6.3 Rutas GET nuevas (dentro de `do_GET`)

```python
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
```

### 6.4 Sistema de archivos de la PC + exec con timeout (dentro de `do_POST`)

```python
        # 2. Endpoint de Comandos Shell (CMD / PowerShell / Bash)
        if url_path == "/api/exec":
            command = data.get("command", "")
            if not command:
                self._send_json(400, {"error": "Falta el comando a ejecutar"})
                return
            try:
                timeout = int(data.get("timeout", 120))
            except Exception:
                timeout = 120
            timeout = max(1, min(timeout, 300))
            res = self._run_command(command, timeout=timeout)
            self._send_json(200, res)
            return

        # 4. Sistema de archivos de la PC real (Agente PC)
        if url_path == "/api/fs/write":
            raw_path = data.get("path", "")
            content = data.get("content", "")
            mode = data.get("mode", "w")
            try:
                target = resolve_pc_path(raw_path)
                d = os.path.dirname(target)
                if d:
                    os.makedirs(d, exist_ok=True)
                with open(target, mode, encoding="utf-8") as f:
                    f.write(content)
                self._send_json(200, {"ok": True, "path": target, "bytes": len(content)})
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if url_path == "/api/fs/read":
            raw_path = data.get("path", "")
            try:
                target = resolve_pc_path(raw_path)
                with open(target, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                self._send_json(200, {"ok": True, "path": target, "content": content[:200000]})
            except FileNotFoundError:
                self._send_json(404, {"ok": False, "error": f"No existe: {raw_path}"})
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if url_path == "/api/fs/list":
            raw_path = data.get("path", "") or "."
            try:
                target = resolve_pc_path(raw_path)
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
            raw_path = data.get("path", "")
            try:
                target = resolve_pc_path(raw_path)
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
```

---

## 7. CÓDIGO — Motor de acciones rápidas (`server.ts`)

### 7.1 Proxys al puente

```typescript
const BRIDGE_URL = `http://127.0.0.1:${WORKER_PORT}`;

async function bridgeFetch(path: string, body?: any, timeoutMs = 12000): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method: body !== undefined ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return await res.json();
  } catch (err: any) {
    return { ok: false, error: `Puente 5000 no disponible (${err?.message || "conexión fallida"})` };
  } finally {
    clearTimeout(t);
  }
}
```

### 7.2 Extractores (rutas, nombres, contenido, comandos)

```typescript
const FOLDER_MAP: Record<string, string> = {
  escritorio: "Desktop", desktop: "Desktop",
  documentos: "Documents", docs: "Documents",
  descargas: "Downloads", downloads: "Downloads",
};

function extractQuoted(s: string): string | null {
  const m = s.match(/["'«]([^"'«»]{1,2000})["'»]/s);
  return m ? m[1] : null;
}

function extractFolder(s: string): string {
  for (const [k, v] of Object.entries(FOLDER_MAP)) {
    if (new RegExp(`\\b${k}\\b`, "i").test(s)) return `${v}/`;
  }
  const cm = s.match(/\bcarpeta\s+([\w\- ]+?)(?=[\s.,;]|$)/i);
  if (cm) return `${cm[1].trim()}/`;
  return "Desktop/"; // por defecto: Escritorio
}

function extractFilename(s: string): string | null {
  const sClean = s.trim();
  // 1) Si hay una ruta de archivo explícita (con barra), usar el nombre base
  const pathM = sClean.match(/(?:[A-Za-z]:\\|\/)[^\s"']{1,180}\.\w{1,10}/);
  if (pathM) {
    const p = pathM[0];
    return p.split(/[\\/]/).pop() ?? p;
  }
  // 2) "llamado X" / "de nombre X" / "named X" → el token siguiente
  const namedM = sClean.match(/\b(?:llamad[ao]|de\s+nombre|named)\s+["']?([A-Za-z0-9_\-]+(?:\.[A-Za-z0-9]{1,10})?)["']?/i);
  if (namedM) return namedM[1];
  // 3) Token con extensión de 2-10 letras (el último del texto)
  const tokens = sClean.split(/\s+/);
  let best: string | null = null;
  for (const t of tokens) {
    const clean = t.replace(/^[«"'(\[]+|[»"')\].,;:]+$/g, "");
    if (/^[A-Za-z0-9_\-]+\.[A-Za-z0-9]{2,10}$/.test(clean)) best = clean;
  }
  return best;
}

function extractCommand(s: string): string | null {
  const quoted = extractQuoted(s);
  const m1 = s.match(/(?:comando|orden|instrucci[oó]n|script)\s+["'«]([^"'«»]{1,400})["'»]/i);
  if (m1) return m1[1].trim();
  const m2 = s.match(/(?:el |la |este |esa |una |un )?(?:comando|orden|instrucci[oó]n)\s+([A-Za-z_][\w\-./: ]{1,160})/i);
  if (m2) return m2[1].trim();
  if (quoted && /ejecut|correr|corre|comando|run/i.test(s)) return quoted.trim();
  return null;
}
```

### 7.3 Parser de intención (determinista)

```typescript
interface ParsedAction {
  intent: "write" | "read" | "delete" | "list" | "exec";
  path?: string;
  content?: string;
  command?: string;
}

function parseQuickAction(prompt: string): ParsedAction | null {
  const p = prompt.trim();
  if (!p) return null;

  // Ejecutar comando
  if (/\b(ejecut|corr|run|lleva)\w*/i.test(p) && /\b(comando|orden|instrucci[oó]n|script)\b/i.test(p)) {
    const command = extractCommand(p);
    if (command) return { intent: "exec", command };
  }

  const folder = extractFolder(p);
  const filename = extractFilename(p);

  // Borrar
  if (/\b(borr|elimina|eliminar|borra|delete|quitar|suprime)\b/i.test(p) && /archivo|archivos|carpeta|folder|documento|\.\w{1,10}/i.test(p)) {
    if (filename) return { intent: "delete", path: folder + filename };
  }

  // Leer
  if (/\b(le|lee|leer|muest|mostr|copia|print)\b/i.test(p) && /archivo|contenido|texto|de\s+/i.test(p)) {
    if (filename) return { intent: "read", path: folder + filename };
  }

  // Listar
  if (/\b(lista|listar|list|mostr|mostrar|contenid|qu[eé] hay|ver|explora)\b/i.test(p) && /archivos|carpeta|contenido|folder|directorio|lista/i.test(p)) {
    return { intent: "list", path: folder };
  }

  // Crear (prioridad alta: "crear/make/un archivo")
  if (/\b(crea|crear|crea(r)?|genera|generar|haz|hacer|escribi|escribir|guarda|guardar|new|make|write)\b/i.test(p) && /archivo|texto|documento|note|nota|\.txt|\.md|\.py|\.js|\.ts|\.json/i.test(p)) {
    const content =
      extractQuoted(p) ??
      (p.match(/(?:con (?:el |la )?(?:texto|contenido)|que dice|dice|con contenido)\s+(.+)/is)?.[1]?.trim() || "");
    if (filename) return { intent: "write", path: folder + filename, content };
  }

  return null;
}
```

### 7.4 Ejecutor (emite acción al stream y corta el flujo, sin LLM)

```typescript
interface StreamLike {
  sendTaskEvent: (task: any) => void;
  sendChunk: (text: string) => void;
  sendDone: (modelUsed: string) => void;
}

async function handlePcQuickAction(prompt: string, ctx: StreamLike): Promise<boolean> {
  const action = parseQuickAction(prompt);
  if (!action) return false;

  const emit = (label: string, detail: string, ok: boolean) =>
    ctx.sendTaskEvent({ type: "action", action: { tool: label, detail, ok } });

  const info = await bridgeFetch("/api/pc/info", undefined, 4000);
  const desktop = info?.desktop ? ` (Escritorio real: ${info.desktop})` : "";

  try {
    if (action.intent === "write") {
      const res = await bridgeFetch("/api/fs/write", { path: action.path, content: action.content ?? "" });
      emit("pc_write_file", `${action.path}`, Boolean(res?.ok));
      const msg = res?.ok
        ? `✅ **Archivo creado en tu PC** (agente 5000):\n\`${res.path}\` — ${res.bytes} bytes${desktop}\n\n` +
          (action.content ? `\`\`\`\n${action.content}\n\`\`\`` : "")
        : `❌ No pude crear el archivo: ${res?.error || "error desconocido"}`;
      ctx.sendChunk(msg); ctx.sendDone("pc-quick-action"); return true;
    }
    if (action.intent === "read") {
      const res = await bridgeFetch("/api/fs/read", { path: action.path });
      emit("pc_read_file", `${action.path}`, Boolean(res?.ok));
      const msg = res?.ok
        ? `📄 **Contenido de** \`${res.path}\` (tu PC):\n\`\`\`\n${res.content}\n\`\`\``
        : `❌ No pude leer el archivo: ${res?.error || "error"}`;
      ctx.sendChunk(msg); ctx.sendDone("pc-quick-action"); return true;
    }
    if (action.intent === "list") {
      const res = await bridgeFetch("/api/fs/list", { path: action.path });
      emit("pc_list_dir", `${action.path}`, Boolean(res?.ok));
      let msg: string;
      if (res?.ok && Array.isArray(res.entries)) {
        const lines = res.entries.map((e: any) => (e.isDir ? `📁 ${e.name}/` : `   ${e.name}  (${e.size} b)`)).join("\n");
        msg = `📁 **Contenido de** \`${res.path}\` (tu PC):\n\`\`\`\n${lines || "(vacío)"}\n\`\`\``;
      } else {
        msg = `❌ No pude listar: ${res?.error || "error"}`;
      }
      ctx.sendChunk(msg); ctx.sendDone("pc-quick-action"); return true;
    }
    if (action.intent === "delete") {
      const res = await bridgeFetch("/api/fs/delete", { path: action.path });
      emit("pc_delete", `${action.path}`, Boolean(res?.ok));
      const msg = res?.ok ? `🗑️ **Eliminado de tu PC:** \`${res.path}\`` : `❌ No pude borrar: ${res?.error || "error"}`;
      ctx.sendChunk(msg); ctx.sendDone("pc-quick-action"); return true;
    }
    if (action.intent === "exec" && action.command) {
      const res = await bridgeFetch("/api/exec", { command: action.command, timeout: 60 }, 70000);
      emit("pc_exec", action.command, Boolean(res?.success));
      const out = res?.output || res?.content || "";
      const msg = res?.success
        ? `🖥️ **Comando ejecutado en tu PC:** \`${action.command}\`\n\`\`\`\n${out || "(sin salida)"}\n\`\`\``
        : `⚠️ Comando ejecutado con error:\n\`\`\`\n${res?.error || out || "sin salida"}\n\`\`\``;
      ctx.sendChunk(msg); ctx.sendDone("pc-quick-action"); return true;
    }
  } catch (err: any) {
    emit(action.intent, prompt.slice(0, 60), false);
    ctx.sendChunk(`❌ Acción rápida falló: ${err?.message || err}`);
    ctx.sendDone("pc-quick-action"); return true;
  }
  return false;
}
```

### 7.5 Punto de disparo en el stream (antes de cualquier proveedor)

```typescript
    // Full history window (no artificial 5-message truncation)
    const fullHistory = Array.isArray(history) ? history : [];

    // 2.5. ACCIONES RÁPIDAS DETERMINISTAS (Modo Agente PC)
    // Si el usuario pide algo directo (crear/borrar/leer/listar/ejecutar),
    // lo hacemos YA contra el puente :5000, sin gastar LLM. Corta el flujo.
    if (pcMode && prompt && typeof prompt === "string") {
      const handled = await handlePcQuickAction(prompt, ctx);
      if (handled) return;
    }

    // 3. PROVIDER: GEMINI
    ...
```

### 7.6 Herramientas `pc_*` (para el modo agente / tool-calling)

```typescript
const PC_TOOLS = [
  { type: "function", function: {
      name: "pc_info",
      description: "Obtener información de la PC del usuario: OS, usuario, ruta del Escritorio, home, Python.",
      parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: {
      name: "pc_exec",
      description: "Ejecutar un comando de terminal REAL en la PC del usuario.",
      parameters: { type: "object",
        properties: { command: { type: "string" }, timeout: { type: "number" } },
        required: ["command"] } } },
  { type: "function", function: {
      name: "pc_write_file",
      description: "Crear o sobrescribir un archivo REAL en la PC (rutas absolutas o atajos Desktop/...).",
      parameters: { type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"] } } },
  { type: "function", function: {
      name: "pc_read_file",
      description: "Leer un archivo REAL de la PC.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: {
      name: "pc_list_dir",
      description: "Listar los archivos de una carpeta REAL de la PC.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: {
      name: "pc_delete",
      description: "Eliminar un archivo o carpeta REAL de la PC. ACCIÓN DESTRUCTIVA.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
];
```

Implementación en `executeToolCall` (delegadas al puente):

```typescript
       case "pc_info":       { const r = await bridgeFetch("/api/pc/info"); return JSON.stringify(r); }
       case "pc_exec":       { const r = await bridgeFetch("/api/exec", { command: String(args?.command||""), timeout: Number(args?.timeout)||120 }, 130000); return JSON.stringify(r); }
       case "pc_write_file": { const r = await bridgeFetch("/api/fs/write", { path: String(args?.path||""), content: String(args?.content??"") }); return JSON.stringify(r); }
       case "pc_read_file":  { const r = await bridgeFetch("/api/fs/read",  { path: String(args?.path||"") }); return JSON.stringify(r); }
       case "pc_list_dir":   { const r = await bridgeFetch("/api/fs/list",  { path: String(args?.path||"") }); return JSON.stringify(r); }
       case "pc_delete":     { const r = await bridgeFetch("/api/fs/delete",{ path: String(args?.path||"") }); return JSON.stringify(r); }
```

Y el bucle del agente solo las inyecta si `pcMode` está activo:

```typescript
      if (isToolCapableModel(model)) {
        const activeTools = pcMode ? [...AGENT_TOOLS, ...PC_TOOLS] : AGENT_TOOLS;
        const agentText = await runOllamaAgentLoop(
          targetUrl, model, messagesPayload,
          typeof temperature === "number" ? temperature : 0.5,
          () => ctx.isAborted(),
          (ev: any) => ctx.sendTaskEvent(ev),
          activeTools
        );
```

---

## 8. CÓDIGO — Frontend (resumen de cambios)

- **`src/types.ts`** — nuevo tipo y evento:

```typescript
export interface AgentAction {
  tool: string;
  detail: string;
  ok: boolean;
  ts?: number;
}
export interface SubagentItem {
  id: string; name: string; port?: number | null;
  url?: string; path?: string; role: string; status: string;
}
export type AgentTaskEvent =
  | { type: "plan"; tasks: AgentTask[] }
  | { type: "update"; taskId: string; status: AgentTask["status"] }
  | { type: "action"; action: AgentAction };
```

- **`src/utils/engine.ts`** — `pcMode?: boolean` en `StreamConfig` y se
  envía en el body: `pcMode: config.pcMode === true`.

- **`src/App.tsx`** — estado persistido + fetch de subagentes + log de acciones:

```typescript
const [pcMode, setPcMode] = useState<boolean>(() => localStorage.getItem("codigo0_pc_mode") === "1");
const [subagents, setSubagents] = useState<{ bridge: string; items: SubagentItem[] }>({ bridge: "http://127.0.0.1:5000", items: [] });
const [actionLog, setActionLog] = useState<AgentAction[]>([]);

// onTask del streamer:
onTask: (event) => {
  if (event.type === "action") { setActionLog((p) => [...p, { ...event.action, ts: Date.now() }]); return; }
  // ... plan / update
}
```

- **`src/components/ChatCenter.tsx`** — toggle **Agente PC ON/OFF** en la barra
  superior + panel *"Acciones ejecutadas (agente 5000)"*.
- **`src/components/LeftSidebar.tsx`** — sección **Subagentes** (estado en vivo)
  en la pestaña Puertos + toggle del Modo Agente PC.

---

## 9. Cómo usarlo (pasos)

1. Descomprime y arranca: `npm install` → `npm run dev`.
2. El server levanta la UI (**:3000**) y auto-inicia el puente (**:5000**).
3. En la barra del chat, enciende **Agente PC** (se pone verde **ON**).
4. Escribe órdenes directas (funcionan **sin LLM**):
   - *"Crea un archivo de texto llamado prueba.txt en mi escritorio con el texto 'hola mundo'."*
   - *"Lee el archivo prueba.txt de mi escritorio."*
   - *"Lista los archivos de mi escritorio."*
   - *"Ejecuta el comando `uname -a`."*
   - *"Borra el archivo prueba.txt de mi escritorio."*
5. Para tareas de razonamiento, usa un **modelo local con tool-calling**
   (ej. `qwen2.5-coder`, `llama3.1`, `mistral`, `gemma3`); el agente usará las
   herramientas `pc_*` y mostrará el log de acciones.

---

## 10. Seguridad

- El **Modo Agente PC está OFF por defecto**; hay que activarlo explícitamente.
- El puente solo escucha en `127.0.0.1` (localhost) — no expone la PC a la red.
- `pc_delete` es **destructiva**; el modelo solo debería usarla si el usuario lo pide.
- Las acciones rápidas son por **palabras clave + atajos de carpeta**; una frase
  que no sea una acción directa pasa al LLM (no se hijackean conversaciones).

---

## 11. Próximas iteraciones (pendientes)

- **Confirmar antes de ejecutar** acciones peligrosas (borrar/ejecutar).
- **Botón "Repetir última acción"** y **chips de acción rápida** bajo el input.
- **Multi-orden** en un solo mensaje ("crea a.txt y b.txt").

---

*Documento generado para **Mario Nicolás Quintero** — CerebroNico IDE, Modo Agente PC, build 3.0.*
