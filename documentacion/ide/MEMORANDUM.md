# MEMORANDUM — CerebroNico IDE V2.5
## Documento Técnico Completo: Arquitectura, Código, Instalación y Empaque

**Autor:** Mario Nicolas Quintero  
**Fecha base:** 16 de septiembre de 2026 · **Actualizado:** 19 de septiembre de 2026  
**Versión del documento:** V2.5 (edición técnica V1, renombrada desde v1.4.0)  
**Novedades de esta edición:**
- **SECCIÓN 22 (v2.3)** — El cerebro dibuja gratis: cuarta tarea `generar_imagen`, cadena Pollinations→Gemini sin promesas falsas, cortacircuito alimentado de verdad (era código muerto), backoff para el 429 de la capa gratuita y extensión de archivo corregida por los bytes reales.
- **SECCIÓN 23 (v2.3.1)** — Layout: nada vuelve a perderse hacia la derecha (cabecera y barras del editor con envolvente, auto-fit contando solo paneles abiertos) y la versión visible sale de UNA sola fuente (`IDE_BRAND` = V2.3).
- **SECCIÓN 24 (v2.4)** — El Reflejo (502 KB / 2.2 MB): frase con typos → orden válida, calculadora sin `eval`, modelos SmolLM2 que se instalan solos según el tramo MR, y Modelfiles generados desde la fuente única de instrucciones.
- **SECCIÓN 25 (v2.5)** — CerebroNico-Agéntico v1: el consejo de 40 entidades (12 especialistas + 28 herramientas, 10 despiertas y 18 con botón), la quinta tarea del motor (`reflejo`) y el `conductor` con reparación y fallback. Manual: `AGENTES_MANUAL.md`; credenciales: `.env.example`.
- Las secciones 1–21 describen la base V2.1 y siguen vigentes salvo donde 22–25 la amplíen.

**Licencia:** Copyright © 2026 Mario Nicolas Quintero. Todos los derechos reservados.

---

## 1. Resumen Ejecutivo

CerebroNico IDE V1 es un entorno de desarrollo integrado con IA local y cloud, diseñado para operar con modelos pequeños (SLM) de 50MB a 1.5GB. Incluye sandbox en vivo, editor de código, chat con streaming multi-provider, y un motor de automejora persistente.

### Características principales
- **5 providers de IA**: Ollama local, OpenAI, Gemini, OpenRouter, Custom (Groq, Cerebras, Together, Mistral, DeepSeek, Fireworks)
- **Sandbox aislado**: IDE en :3000, app preview en :3500 (nunca colisionan)
- **Puente PC**: Python en :5000 para ejecución de comandos reales
- **Extensión .cn**: contenedor ZIP con manifest para guardar/abrir workspaces completos
- **Motor SLM**: detección automática de modelos pequeños con reglas anti-alucinación
- **RAG local**: indexación de documentos .md/.txt del workspace
- **EvolutionDB**: base de datos de automejora persistente (memory_evolution.json)
- **Puntos de restauración**: snapshots en memoria del workspace
- **Monitor de recursos**: CPU/RAM del servidor en vivo
- **Modo Web Editor**: chat + preview lado a lado para diseño web asistido por IA
- **Panel de Configuración**: 4 pestañas (General, IA/SLM, Sandbox, Apariencia)
- **GlobalErrorBoundary**: captura de errores de React sin pantalla blanca
- **Resiliencia**: fetchWithSelfHealing con reintentos exponenciales + CircuitBreaker

---

## 2. Arquitectura de Puertos

| Puerto | Servicio | Descripción |
|--------|----------|-------------|
| 3000 | IDE (Vite + Express) | Interfaz principal: chat, editor, sandbox panel |
| 3500 | Sandbox Preview | App exportada del workspace (npm run dev) |
| 5000 | Puente PC (Python) | Ejecución de comandos y archivos sobre la PC real |
| 11434 | Ollama | Motor de inferencia local |

### Aislamiento crítico
- Vite con `hmr: false` — el servidor de la IDE nunca se recarga solo
- `watch.ignored`: `.proyectos/**`, `node_modules/**` — cambios del sandbox NO afectan la IDE
- Auto-instalación npm DESACTIVADA por defecto (`AUTO_INSTALL_DEPS=1` para reactivar)
- Parcheo automático de `vite.config.ts` y `package.json` del sandbox para forzar puerto 3500

---

## 3. Estructura del Proyecto

```
ide/
├── arrancar_cerebronico.bat          # Script de arranque robusto (limpia puertos, verifica deps)
├── backend/
│   ├── server.ts                      # Servidor Express + Vite middleware (2500+ líneas)
│   ├── package.json                   # Dependencias y scripts
│   ├── index.html                     # HTML principal
│   ├── vite.config.ts                 # Configuración de Vite
│   ├── tsconfig.json
│   ├── .env                           # Variables de entorno
│   ├── dist/                          # Build compilado (server.mjs + assets)
│   ├── src/
│   │   ├── main.tsx                   # Entry point con GlobalErrorBoundary
│   │   ├── App.tsx                    # Componente principal (2300+ líneas)
│   │   ├── index.css                  # Estilos globales + animaciones cerebro
│   │   ├── constants.ts               # Puertos, LS_KEYS, IDE_BRAND, CLOUD_PROVIDERS
│   │   ├── types.ts                   # Tipos TypeScript (ModelProvider incluye "openai")
│   │   ├── components/
│   │   │   ├── Header.tsx             # Barra superior (CN, puertos, monitor, config)
│   │   │   ├── LeftSidebar.tsx        # Panel izquierdo (motor, memoria, puertos, chats)
│   │   │   ├── ChatCenter.tsx         # Chat central con prompts sugeridos
│   │   │   ├── RightSidebar.tsx       # Panel derecho (sandbox, editor, entregables, terminal)
│   │   │   ├── CodeEditor.tsx         # Editor de código con Prism
│   │   │   ├── ModelSelectorModal.tsx  # Selector de modelos con favoritos ⭐
│   │   │   ├── ApiKeyModal.tsx        # Ranuras de API keys (6 plantillas cloud)
│   │   │   ├── ConfigModal.tsx        # Panel de configuración (4 pestañas)
│   │   │   ├── DedicatedWebEditorView.tsx # Modo Web Editor (chat + preview)
│   │   │   ├── BrainThinkingIcon.tsx  # Icono de cerebro animado (idle/thinking/exploding)
│   │   │   └── GlobalErrorBoundary.tsx # Captura de errores de React
│   │   ├── utils/
│   │   │   ├── engine.ts              # Streamer de IA (HighPerformanceAIStreamer)
│   │   │   ├── storage.ts             # Self-Healing Storage (loadJSON/saveJSON seguros)
│   │   │   ├── resilience.ts          # fetchWithSelfHealing + CircuitBreaker
│   │   │   ├── healthCheck.ts         # Sondas de diagnóstico (bridge, ollama, sandbox)
│   │   │   ├── selfHealing.ts         # Motor de autodiagnóstico (captura excepciones)
│   │   │   ├── evolutionDB.ts         # Base de datos de automejora persistente
│   │   │   ├── slmDetector.ts         # Detector de SLMs (50MB-1.5GB)
│   │   │   ├── slmSystemPrompt.ts    # Reglas anti-alucinación para SLMs
│   │   │   ├── localRAG.ts            # RAG local (indexación de .md/.txt)
│   │   │   ├── favoritePrompts.ts     # Historial de prompts favoritos
│   │   │   ├── favoriteModels.ts      # Carpeta de modelos favoritos ⭐
│   │   │   ├── restorePoints.ts      # Puntos de restauración (snapshots)
│   │   │   ├── markdownExport.ts      # Exportar conversación a Markdown
│   │   │   ├── indexedDBStorage.ts    # Almacenamiento de imágenes grandes (fondo de pantalla)
│   │   │   ├── fileParser.ts          # Generación de .cn (ZIP) + parseCnFile
│   │   │   ├── codeParser.ts          # Extracción de bloques de código
│   │   │   ├── contextCache.ts        # Cache de contexto (MEMORIA.md, skills.md)
│   │   │   ├── chatStorage.ts         # Persistencia de chats guardados
│   │   │   ├── syntaxEngine.ts        # Motor de highlighting Prism
│   │   │   ├── attachmentProcessor.ts # Procesamiento de ZIPs/DOCX/PDF
│   │   │   ├── languageMemory.ts     # Automejora de lenguaje
│   │   │   └── memory.ts              # Gestión de memoria RAM
│   │   └── data/
│   │       ├── skills50.ts            # 50 skills del motor
│   │       └── skills100.ts           # 100 skills del motor
│   ├── agent_bridge_5000.py          # Puente Python (puerto 5000)
│   ├── electron-main.cjs              # Entry point de Electron
│   └── tests/
│       ├── comprehensive_e2e_test.py # Tests E2E
│       └── mock_ollama.py             # Mock de Ollama para tests
├── dist/
│   ├── CerebroNicoAgent.exe          # Agente compilado (Python → EXE)
│   └── cerebronico_bridge.exe        # Puente compilado (Python → EXE)
├── requirements.txt                   # Dependencias Python
├── CerebroNicoAgent.spec             # Spec de PyInstaller
├── cerebronico_bridge.spec           # Spec de PyInstaller
├── build_backend.bat                 # Script de compilación de EXEs
└── LEEME_CAMBIOS_CerebroNico_V1.md   # Changelog completo
```

---

## 4. Instalación

### Requisitos
- **Node.js** 18+ (recomendado 22+)
- **Python** 3.10+ (para el puente PC :5000)
- **Ollama** (para inferencia local)
- **npm** o **bun**

### Pasos
1. Descomprimir `CerebroNico_V1.zip`
2. Ejecutar `arrancar_cerebronico.bat` (Windows) o:
   ```bash
   cd ide/backend
   npm install --no-audit --no-fund
   npm run build
   npm run dev
   ```
3. Abrir `http://localhost:3000` en el navegador
4. Para compilar EXE: ejecutar `build_backend.bat` (requiere PyInstaller)

### Variables de entorno (.env)
```
PORT=3000
OLLAMA_HOST=http://127.0.0.1:11434
GEMINI_API_KEY=    (opcional)
OPENROUTER_API_KEY= (opcional)
OPENAI_API_KEY=    (opcional)
AUTO_INSTALL_DEPS=0  (0 = no auto-instalar npm en caliente)
```

---

## 5. Configuración de Modelos

### Providers soportados
1. **Ollama Local** (:11434) — modelos locales gratuitos
2. **OpenAI** (api.openai.com) — GPT-4o, GPT-4o-mini, o1, o3-mini
3. **Gemini** (AI Studio) — gemini-2.5-flash, gemini-2.0-flash, pro
4. **OpenRouter** — 444+ modelos (free y de pago)
5. **Custom** — Groq, Cerebras, Together, Mistral, DeepSeek, Fireworks

### Detección de modelos
- **Ollama**: timeout de 12s, filtra modelos de embeddings (no-chat)
- **OpenAI**: lista TODOS los modelos de chat de la cuenta
- **Gemini**: lista TODOS los modelos con generateContent
- **OpenRouter**: lista TODOS los modelos del catálogo (free + paid)
- **Custom**: lista modelos de cualquier endpoint OpenAI-compatible
- **Redetectar todos**: ejecuta las 5 detecciones en paralelo

### Detector SLM
Detecta automáticamente modelos pequeños (50MB-1.5GB):
- **Nano** (< 1B): smollm2:135m, tinyllama, qwen2.5-coder:0.5b, stablelm2
  - RAG: 1 chunk, contexto: 4096 tokens
- **Small** (1B-4B): qwen2.5-coder:1.5b, deepseek-coder:1.3b, phi-3-mini
  - RAG: 2 chunks, contexto: 8192 tokens
- Reglas anti-alucinación inyectadas como systemInstruction (NO visible en el chat)

---

## 6. Extensión .cn

### Formato
- Contenedor **ZIP real** (cabecera PK, reconocible por 7-Zip/WinRAR)
- Contiene: `manifest.json` + archivos del workspace (cualquier tipo)
- Se puede renombrar a `.zip` y abrir en cualquier explorador

### Operaciones
- **Guardar .cn**: prompt para nombre → descarga ZIP con manifest
- **Abrir .cn**: acepta .cn, .zip, .json (legacy)
- **Botón en Header**: menú CN → Guardar .cn / Abrir .cn
- **Botón en explorador**: botón verde .cn

---

## 7. Sandbox

### Endpoints
- `POST /api/sandbox/start` — arrancar npm run dev en :3500
- `POST /api/sandbox/stop` — detener sandbox
- `GET /api/sandbox/status` — estado (online, hasProject, installed)
- `GET /api/sandbox/logs` — últimos 16KB de logs
- `POST /api/fs/sync` — escribir archivos al disco
- `POST /api/fs/clear-all` — borrar archivos (mantiene node_modules)
- `POST /api/fs/nuclear-wipe` — borrar ABSOLUTAMENTE TODO (incluido node_modules)
- `GET /api/system/stats` — CPU/RAM del servidor Node.js

### Auto-sync
- Cuando la IA genera código → se escribe automáticamente al disco
- El iframe del sandbox se refresca solo (evento `cerebronico:autosync-done`)
- Parcheo automático de vite.config.ts y package.json (fuerza puerto 3500)

### Piloto automático
- Detecta workspace vacío → NO arranca (evita imagen fantasma)
- Backoff exponencial anti-zombie (1s, 2s, 4s... 60s max)
- Auto-instalación DESACTIVADA por defecto

---

## 8. Modo Web Editor

### Diseño
- **Chat (40%)** + **Preview (60%)** lado a lado
- Panel de herramientas IA con 6 bloques rápidos (Navbar, Hero, Cards, Testimonios, Footer, CTA)
- Toggle Escritorio/Móvil (375px)
- Botón **Pantalla Completa** (Fullscreen API del navegador)
- Botón **Abrir en Navegador** (window.open localhost:3500)
- Botón **Refrescar** (remontar iframe)
- Botón **Ocultar IA** (preview a pantalla completa)
- Auto-sync: cuando la IA genera código → preview se refresca solo

---

## 9. Resiliencia y Autocorrección

### GlobalErrorBoundary
- Captura errores de React → muestra UI de recuperación (no pantalla blanca)
- Botón "Reiniciar Entorno" + "Intentar de nuevo sin reiniciar"

### fetchWithSelfHealing
- Reintentos exponenciales + jitter (1s, 2s, 4s + random 0-300ms)
- FallbackValue seguro si todos los intentos fallan

### CircuitBreaker
- 5 fallos consecutivos → circuito abierto (30s de pausa)
- Medio-abierto: 3 intentos para verificar recuperación

### Self-Healing Storage
- JSON corrupto → purga clave + devuelve fallback
- QuotaExceededError → log silencioso, no crashea
- Límite 5MB por valor

### EvolutionDB
- Persiste en `memory_evolution.json` (sandbox) + localStorage (backup)
- Registra: síntoma, solución aplicada, successScore, occurrences
- Inyecta top 3-5 lecciones al system prompt según tipo de modelo

---

## 10. Fondo de Pantalla

### Almacenamiento
- **IndexedDB** (no localStorage) — sin límite práctico
- Re-escalado automático con canvas (max 1920px, JPEG 0.85)
- Migración automática de localStorage viejo a IndexedDB

### Aplicación
- `body.has-brain-bg` con `background-size: cover; attachment: fixed`
- Overlay oscuro `z-index: -1` (detrás del #root)
- Paneles semi-transparentes con `backdrop-blur-md` (glassmorphism)

---

## 11. Empaque y Distribución

### Build del frontend
```bash
cd ide/backend
npm run build
# Genera: dist/server.mjs + dist/assets/index-*.js + dist/assets/index-*.css
```

### Build de EXEs (Windows)
```bash
build_backend.bat
# Genera: dist/CerebroNicoAgent.exe + dist/cerebronico_bridge.exe
```

### Build de Electron
```bash
cd ide/backend
npm run dist
# Genera: dist_electron/CerebroNico IDE Setup.exe (NSIS installer)
```

### Script de arranque
`arrancar_cerebronico.bat`:
1. Verifica Node.js y backend/package.json
2. Limpia puertos huérfanos (3000, 5000, 3500)
3. Instala dependencias si faltan (npm install)
4. Arranca Ollama con keep-alive infinito
5. Arranca servidor (dist/server.mjs o tsx server.ts)
6. Espera a que puerto 3000 responda
7. Abre el navegador automáticamente

---

## 12. Configuración del IDE

### Panel de Configuración (ConfigModal)
1. **General**: autoSync, streamResponse
2. **IA/SLM**: URL de Ollama, detector SLM on/off
3. **Sandbox**: puerto del preview (3500)
4. **Apariencia**: tema (dark, midnight, glass)

### localStorage
- `cerebronico_settings` — configuración del IDE
- `cerebronico_favorite_prompts` — prompts favoritos
- `cerebronico_favorite_models` — modelos favoritos
- `cerebronico_custom_bg` — migrado a IndexedDB
- `cerebronico_evolution_db` — backup de EvolutionDB
- `codigo0_*` — claves del IDE (messages, workspace, provider, etc.)

---

## 13. Tipografía

### Escala
- Body: 16px
- Code/mono: 15px
- text-[9px] → 11px
- text-[10px] → 12px
- text-[11px] → 13px
- text-xs → 13px
- text-sm → 14px

---

## 14. Animación del Cerebro

### Estados
- **idle**: pulso suave violeta (3s)
- **thinking**: ondas concéntricas + vibración media (1.4s)
- **exploding**: pulso rápido dorado + glow intenso (0.6s)

### Implementación
- SVG + CSS puro (cero JS por frame, GPU-accelerated)
- Solo usa `transform` y `opacity`
- Se activa automáticamente cuando `isStreaming === true`

---

## 15. Extensiones — cómo crearlas paso a paso y cómo usarlas

> Todo lo que sigue está tomado del código de esta versión, no de documentación
> teórica. Los nombres de campos, permisos y mensajes de error son literales.

### 15.1 Qué es una extensión y qué límites tiene

Una extensión es **una carpeta con un `manifest.json` y su propio HTML**. El IDE la
carga en un `<iframe sandbox>` con este atributo:

```
sandbox="allow-scripts allow-popups allow-forms allow-modals"
```

No lleva `allow-same-origin`, y eso es **a propósito**. Al no llevarlo, el iframe
queda en un **origen opaco** y la extensión, por diseño:

- **no puede** tocar el DOM del IDE;
- **no puede** leer el `localStorage` del IDE (ni los tokens de API configurados);
- **no puede** hacer `fetch` a rutas relativas de la IDE;
- **sí puede** ejecutar su propio JavaScript, y **toda** comunicación con el IDE
  pasa por `postMessage`.

Consecuencia práctica: **los permisos no los comprueba la extensión, los comprueba
el IDE**. La extensión puede *intentar* lo que quiera; si no declaró el permiso, la
petición se rechaza de este lado.

### 15.2 Anatomía: la carpeta y el manifiesto

Cada extensión vive en `extensions/<id>/`. Ejemplo real incluido en el proyecto:

```
extensions/cerebronico.panel-ejemplo/
├── manifest.json     ← obligatorio (id, version, main)
├── panel.html        ← la interfaz (entry)
└── icon.svg          ← opcional, icono de la pestaña
```

**Manifiesto** — campos que usa el motor:

| Campo | Obligatorio | Para qué |
|---|---|---|
| `id` | sí | Identificador único. Por convención `autor.nombre` y **coincide con el nombre de la carpeta** (como en el ejemplo). |
| `name` | sí | Nombre visible en la lista de extensiones. |
| `version` | sí | Versión de la extensión, ej. `"1.0.0"`. |
| `main` | sí | HTML de entrada, ej. `"panel.html"`. |
| `description` | no | Texto que se muestra en el gestor. |
| `author` | no | Autor. |
| `icon` | no | Icono, ej. `"icon.svg"`. |
| `engines.cerebronico` | no | Compatibilidad, ej. `"^2.0.0"`. |
| `permissions` | sí | Lista de permisos (ver 15.3). Sin lista ⇒ manifiesto inválido. |
| `contributes` | no | Lo que aporta: paneles, comandos, herramientas, lenguajes. |

Si falta `id`, `version` o `main`, el validador la marca y el instalador avisa con
`Revisar: <nombre> (faltan id/version/main)`.

### 15.3 Los ocho permisos

Lista cerrada: **cualquier valor fuera de esta tabla invalida el manifiesto.**

| Permiso | Qué desbloquea | Método del puente |
|---|---|---|
| `workspace.read` | leer archivos del proyecto | `workspace.listFiles`, `workspace.readFile`, `workspace.getFiles` |
| `workspace.write` | crear/modificar archivos | `workspace.writeFile` |
| `workspace.exec` | ejecutar comandos en el sandbox | `workspace.exec` |
| `chat.read` | leer el historial del chat | `chat.getMessages` |
| `chat.send` | enviar mensajes al chat / al modelo | `chat.sendMessage` |
| `tools.register` | exponer herramientas al agente | declarar `contributes.tools` |
| `network` | — | **sin método en el puente (ver 15.9)** |
| `storage` | — | **sin método en el puente (ver 15.9)** |

Regla de oro: **declara solo lo que necesites.** Un permiso concedido es una
capacidad real; uno no concedido no se puede sortear desde el código de la extensión.

### 15.4 El puente: los mensajes que existen

Protocolo `postMessage` con `cn: 1` como marcador de versión.

```
Extensión → IDE    { cn:1, type:"ready" }
IDE → Extensión    { cn:1, type:"init", manifest, permissions, apiVersion:"2.0" }
Extensión → IDE    { cn:1, type:"request", id, method, params }
IDE → Extensión    { cn:1, type:"response", id, ok, result?, error? }
IDE → Extensión    { cn:1, type:"command", commandId, args, requestId? }
Extensión → IDE    { cn:1, type:"commandResult", commandId, requestId, ok, result?, error? }
Extensión → IDE    { cn:1, type:"log" | "notify" | "setTitle" }
```

Detalles que importan:

- `init` es la respuesta a tu `ready`. Ahí te llegan tu manifiesto y **los permisos
  que realmente te concedieron** (no los que pediste).
- Peticiones y respuestas se emparejan por `id`: genera uno único por petición.
- El IDE manda además un `init` de cortesía ~120 ms después de cargar el iframe, por
  si la extensión no llegó a enviar `ready`.
- El host documenta un campo `settings` en `init`, pero **la implementación actual
  envía `manifest`, `permissions` y `apiVersion`**, no `settings`.

### 15.5 Paso a paso: crear una extensión desde cero

**Paso 1 — Crea la carpeta**

```
extensions/miAutor.miExtension/
```

Usa la convención `autor.nombre`. El `id` del manifiesto debe coincidir.

**Paso 2 — Escribe `manifest.json`**

Empieza por lo mínimo y ve añadiendo:

```json
{
  "id": "miAutor.miExtension",
  "name": "Mi extensión",
  "version": "1.0.0",
  "description": "Qué hace, en una frase.",
  "author": "Tu nombre",
  "main": "panel.html",
  "icon": "icon.svg",
  "engines": { "cerebronico": "^2.0.0" },
  "permissions": ["workspace.read"],
  "contributes": {
    "panels": [
      { "id": "mi.panel", "title": "Mi panel", "icon": "Puzzle", "entry": "panel.html", "position": "center-tab" }
    ]
  }
}
```

**Paso 3 — Escribe el panel (`panel.html`)**

Esqueleto mínimo que habla el protocolo. Cópialo y amplíalo:

```html
<!doctype html>
<html lang="es">
<head><meta charset="utf-8" /><title>Mi panel</title></head>
<body>
<button id="btn">Leer archivos del proyecto</button>
<pre id="salida"></pre>
<script>
(function () {
  var pending = {};
  var salida = document.getElementById("salida");

  function request(method, params) {
    return new Promise(function (resolve) {
      var id = method + "#" + Math.random().toString(36).slice(2);
      pending[id] = resolve;
      parent.postMessage({ cn: 1, type: "request", id: id, method: method, params: params || {} }, "*");
    });
  }

  window.addEventListener("message", function (ev) {
    var m = ev.data;
    if (!m || m.cn !== 1) return;

    if (m.type === "init") {
      salida.textContent = "conectado · permisos: " + (m.permissions || []).join(", ");
      return;
    }
    if (m.type === "response" && pending[m.id]) {
      pending[m.id](m.ok ? m.result : null);
      delete pending[m.id];
      return;
    }
    // Si declaraste comandos, el IDE te los manda por aquí:
    if (m.type === "command") {
      parent.postMessage({
        cn: 1, type: "commandResult",
        commandId: m.commandId, requestId: m.requestId,
        ok: true, result: "hecho"
      }, "*");
    }
  });

  document.getElementById("btn").addEventListener("click", async function () {
    var files = await request("workspace.getFiles", {});
    salida.textContent = "Archivos: " + (files ? files.length : 0);
  });

  // Avisa al IDE de que estás listo
  parent.postMessage({ cn: 1, type: "ready" }, "*");
})();
</script>
</body>
</html>
```

**Paso 4 — Añade comandos invocables desde el chat**

En `contributes.commands`. El campo `slash` es lo que el usuario escribe en el chat:

```json
"commands": [
  { "id": "mi.contar", "title": "Contar palabras", "slash": "contar" }
]
```

Con eso, escribir `/contar` en el chat dispara ese comando. El IDE lo entrega a tu
panel con `{ cn:1, type:"command", commandId:"mi.contar", args, requestId }` y tu
panel responde con `commandResult`. **Si la extensión está deshabilitada, el comando
no llega.**

**Paso 5 — Añade herramientas para el modelo**

`contributes.tools` es lo que permite que **la IA** use tu extensión. Requiere el
permiso `tools.register`:

```json
"tools": [
  {
    "name": "ext_contar_palabras",
    "description": "Cuenta palabras y archivos del workspace. Úsala cuando el usuario pregunte el tamaño del proyecto.",
    "cheap": true,
    "handler": "command:mi.contar",
    "parameters": { "type": "object", "properties": {}, "required": [] }
  }
]
```

- `name`: así la ve el modelo. Usa el prefijo `ext_` para distinguirla.
- `description`: **es lo que el modelo lee para decidir cuándo usarla.** Sé explícito.
- `handler`: apunta a uno de tus comandos, con el formato `command:<id>`.
- `parameters`: JSON Schema de los argumentos.
- `cheap`: marca las baratas de ejecutar (sin coste de LLM).

**Paso 6 — Instálala**, de dos formas:

- **Carpeta:** copia `extensions/miAutor.miExtension/` dentro de `extensions/`.
- **ZIP:** comprime la extensión y usa el botón **«Instalar .zip»** del gestor de
  extensiones (la UI lo describe como «un ZIP con `manifest.json`»).

**Paso 7 — Habilítala**

En el gestor, pulsa **Habilitar**. El gestor dice literalmente que de una extensión
deshabilitada *«no se cargarán sus herramientas»*. Si tiene un error de carga, el
botón para abrir su panel aparece desactivado.

### 15.6 Cómo se usa una extensión una vez creada

1. **Su panel** — se abre como **pestaña central** (`position: "center-tab"`), junto al
   Chat. Es una página propia, aislada del IDE.
2. **Sus comandos** — desde el chat, escribiendo `/<slash>` (`/contar`, `/informe`…).
3. **Sus herramientas** — el modelo las ve como herramientas propias (`ext_...`) y las
   invoca cuando su `description` encaja con lo pedido. Para forzarlo, pídeselo:
   *«usa la herramienta `ext_contar_palabras`»*.
4. **Recargar** — el botón «Recargar» del panel vuelve a montar el iframe. **Úsalo cada
   vez que edites el HTML de la extensión**: el panel no se recarga solo.
5. **Deshabilitar / Desinstalar** — «Deshabilitar» la apaga sin borrarla;
   «Desinstalar» **borra la carpeta**.

### 15.7 Errores típicos y qué significan

| Mensaje | Causa | Solución |
|---|---|---|
| `Permiso "workspace.read" no concedido a miAutor.miExtension.` | Pediste un método cuyo permiso no declaraste. | Añádelo a `permissions` y recarga. |
| `Método no soportado: <method>` | El puente no implementa ese método. | Ver 15.9. |
| `Revisar: miAutor.miExtension (faltan id/version/main)` | Manifiesto incompleto. | Completa esos tres campos. |
| El panel no responde a nada | No enviaste `ready`, o el `id` de tus peticiones no es único. | Revisa el patrón del Paso 3. |
| Errores de `localStorage` o `fetch` relativo en tu panel | Imposible por diseño (origen opaco). | Usa el puente, no APIs del navegador. |

### 15.8 Reglas que no se pueden saltar

- El **`id`** debe ser único y coincidir con la carpeta.
- Los **permisos** son de la lista cerrada de 15.3; otro valor invalida el manifiesto.
- La comprobación de permisos vive **en el IDE**, nunca en la extensión.
- Una extensión **no** accede a `localStorage`, al DOM del IDE ni a rutas relativas.
- Los **comandos y herramientas de una extensión deshabilitada no se cargan.**

### 15.9 Huecos conocidos de esta versión (honestidad)

Verificados en el código; conviene conocerlos antes de prometer funcionalidad:

1. **`network` y `storage` se pueden declarar, pero el puente no expone ningún método
   para ellos.** El despacho de peticiones solo atiende `workspace.*` y `chat.*`;
   cualquier otro método responde `Método no soportado`. No hay `storage.get/set` ni
   pasarela de red. Y por el origen opaco, la extensión **tampoco** puede usar
   `localStorage` ni `fetch` relativo por su cuenta.
2. **`workspace.read` no tiene alcance por ruta.** Concede lectura del árbol completo
   del proyecto. La ruta se valida en el servidor (confinada al directorio del
   proyecto), pero no se puede limitar a `/src/*`.
3. **El campo `settings` del protocolo** está documentado pero no se envía en `init`.
4. **Editar el HTML de una extensión no se refleja solo**: hay que pulsar «Recargar».

---

---

## §16 · Motor de tareas y conversor interno (18 de septiembre de 2026)

### 16.1 Lo que se añadió, y dónde vive

| Módulo | Qué hace |
|---|---|
| `src/engine/memoriaResiliente.ts` | Los tramos **MR** (Memoria Resiliente) y el reparto de concurrencia |
| `src/engine/taskPlanner.ts` | El cerebro de tareas: grafo, dependencias, ciclos, despachador |
| `src/engine/taskStore.ts` · `taskStoreFs.ts` | Persistencia con escritura atómica y reanudación |
| `src/engine/planRunner.ts` | Segundo plano y semáforo global de la máquina |
| `src/engine/planExecutors.ts` | Qué ejecuta cada tarea: `modelo`, `leer_archivo`, `convertir` |
| `src/engine/formatConverter.ts` | Conversor JSON ↔ YAML ↔ TOML ↔ CSV, portable y con informe de pérdidas |
| `scripts/validar.mjs` | `npm run validar` — una orden, un veredicto de todo el proyecto |

### 16.2 Los tramos MR

| Tramo | RAM | tareas «io» | tareas «cpu» | contexto/tarea | modelo recomendado |
|---|---|---|---|---|---|
| MR#1 | 4 GB | 2 | 1 | 2 048 | `qwen2.5-coder:0.5b` |
| MR#2 | 8 GB | 3 | 1 | 4 096 | `qwen2.5-coder:1.5b.ollama` |
| MR#3 | 16 GB | 5 | 2 | 8 192 | `qwen2.5-coder:7b` |
| MR#4 | 32 GB | 8 | 3 | 16 384 | `qwen2.5-coder:14b` |

El botón **«cerebro resiliente ×1 ×2 ×4 ×6 ×8»** multiplica la concurrencia base y
se aplica **en caliente**, también a los planes que ya están corriendo.

### 16.3 Tres invariantes que el código hace cumplir

1. **El presupuesto nunca devuelve 0.** `io >= 1` y `cpu >= 1`, siempre. Si la
   máquina no da, se degrada y se dice; **nunca se abandona una tarea**.
2. **El agregado no miente.** Un plan con una tarea fallida se reporta `parcial` o
   `fallido`, nunca `hecho`, y `noTerminadas` nombra lo que quedó sin hacer.
3. **Toda conversión declara lo que pierde.** JSON no admite comentarios; TOML no
   tiene nulos; CSV no guarda tipos. Convertir no es lo difícil: lo difícil es no
   mentir sobre lo perdido.

### 16.4 Verificación

```
npm run validar
  planner 64 · store 55 · runner 38 · roundtrip 460   →   617 comprobaciones · 0 fallos
```

### 16.5 Estado REAL de la cadena chat → conversor → editor → preview

**Pregunta directa: ¿está resuelta esa cadena? No.** Verificado en el código:

- `src/components/ChatCenter.tsx` sólo expone `onSendMessage`. **No hay ninguna
  prop para aplicar archivos** ni para tocar el editor.
- El iframe de la vista previa se remonta (`setIframeKey`) **desde los botones del
  panel Sandbox** (Recargar, Forzar Limpieza, Sincronizar), nunca desde el chat.
- `ChatCenter.tsx` **no menciona el conversor** en absoluto.

Es decir: el chat conversa, el conversor existe y el preview se refresca, pero los
tres **no están unidos**. Falta:

1. Que la respuesta del chat se pueda interpretar como una orden de conversión.
2. Que esa orden escriba en el espacio de trabajo (editor).
3. Que al escribir se dispare la sincronización al sandbox y el remontaje del
   iframe, avisando del resultado.

### 16.6 Empaquetado

`build.win.target` queda con **nsis y portable, ambos x64 explícito**, y
`npm run dist` pasa `--win --x64`. Sin la marca explícita, un cambio de versión de
`electron-builder` podría volver a compilar para otra arquitectura sin avisar.

```bash
npm install
npm run build      # vite + esbuild  → comprobado que compila
npm run dist       # instalador NSIS + portable, x64
```

### 16.7 Pendiente, dicho sin adornos

- El **panel visible** del planificador (el motor ya es alcanzable por API).
- La **cadena del §16.5**.
- Las **92 entradas del catálogo** (`src/data/skills100.ts`) marcadas `active` sin
  implementación, que `utils/contextCache.ts` inyecta **todas** en el contexto del
  modelo. Y la nº 37 promete «sin pérdida de comentarios», que es imposible.
- **Permisos** para tareas de herramienta: hoy no existe «ejecutar comando», a
  propósito.

---

---

## §17 · Exportar a Android la APLICACIÓN que crea el IDE (18 de septiembre de 2026)

### 17.1 Qué es esto, porque es fácil confundirlo

**No es «CerebroNico IDE en Android».** El motor vive en el PC, con Ollama.

**Es: la aplicación que TÚ construyes con CerebroNico se puede sacar como APK**,
igual que hoy se saca como EXE para Windows. CerebroNico es la herramienta; el
APK es de tu aplicación.

### 17.2 El suelo de Android está fijado, y tiene fuente

```
PISO = Android 7.0 (Nougat) · API 24
```

Datos de la documentación oficial de Capacitor (v8), consultada el 18-09-2026:

- Requisitos Android: **Android Studio + Android SDK**, e instalar
  «Android SDK Platforms for **API 24 or greater**».
- Tabla oficial de target SDK: 8.x → 36 · 7.x → 35 · 6.x → 34 · 5.x → 33.
- Google Play exige, **desde el 31 de agosto de 2026**, apuntar a **Android 16 (API 36)**.

**Por qué no se puede prometer Android 4.4.2 ni 6:**

| Android | API | ¿Se puede? |
|---|---|---|
| 4.4.2 KitKat | 19 | No — por debajo del suelo |
| 6.0 Marshmallow | 23 | No — por debajo del suelo |
| **7.0 Nougat** | **24** | **Sí, es el mínimo real** |

Y no es solo una regla de la herramienta: **la app sale con JavaScript moderno**
(React + Vite). El WebView de Android 4.4.2 es de la época de Chromium 30-33 y no
ejecuta ese bundle. Prometerlo sería prometer algo que el propio código no cumple.

### 17.3 Cómo se usa

```
GET  /api/export/targets            qué puede exportar este proyecto y qué falta
POST /api/export/android/prepare    escribe capacitor.config.json + GUIA-ANDROID.md
```

`prepare` **no instala ni compila** nada: escribe la configuración y la guía con
los pasos exactos, y dice si la máquina está lista. Los comandos que cambian el
proyecto se ejecutan a la vista:

1. `npm install @capacitor/core @capacitor/cli @capacitor/android`
2. `npx cap init`  *(el IDE ya deja el `capacitor.config.json` hecho)*
3. `npm run build`
4. `npx cap add android`
5. `npx cap sync android`
6. `cd android && gradlew.bat assembleDebug` → APK en `android/app/build/outputs/apk/debug/`

### 17.4 Qué necesita la máquina, y cómo lo dice

El diagnóstico es un sondeo **real**, no una suposición. Ejemplo de una máquina a
la que solo le falta el SDK:

```
[x] Node.js 22 o superior ......... v22.23.2
[ ] Android SDK ................... ANDROID_HOME / ANDROID_SDK_ROOT sin definir
      → Instala Android Studio; trae el JDK y el SDK
[x] JDK 17 o superior ............. openjdk 21.0.10
[ ] Plataforma SDK API 24+ ........ ninguna detectada
      → Android Studio → Tools → SDK Manager → SDK Platforms
[ ] Gradle ........................ se descargará al primer build (no es obligatorio)
[ ] adb ........................... no encontrado (solo para probar por cable)
```

Si no se puede construir, **se dice qué falta y cómo resolverlo**. Nunca falla en
silencio ni genera un APK a medias.

### 17.5 Verificación

```
npm run validar
  planner 64 · store 55 · runner 38 · roundtrip 460 · export 49
  →  666 comprobaciones · 0 fallos
```

Las 49 pruebas de exportación fijan, entre otras cosas, que **API 19 y API 23 no
valen** y **API 24 sí**, y que un proyecto de Python no se puede envolver en un APK
(diciéndolo).

---

---

## §18 · La ventana del cerebro (18 de septiembre de 2026)

El motor de tareas funcionaba y sólo se veía por API. Ya está la ventana:
**`src/components/PlansPanel.tsx`**, como pestaña fija **«Planificador»** en el
centro, junto a Chat y Superación (`App.tsx`).

### 18.1 Qué muestra

- Cada plan con su **estado real** y cada tarea con su marca (`✓ ▶ ✗ ⊘ ·`), su
  peso (`io`/`cpu`), su tipo y **por qué está esperando** si está esperando.
- El **reparto de la máquina ahora**: tramo MR, escalado ×N, huecos libres y
  cuántas tareas esperan turno.
- El **aviso de degradado con su motivo escrito**, nunca un número sin explicación.
- El **agregado honesto**: `hechas · fallidas · bloqueadas` y la lista de lo que
  quedó sin hacer.
- La **traza** del plan, plegada, para cuando haga falta el detalle.

### 18.2 Qué se puede hacer desde ahí

| Control | Qué hace |
|---|---|
| **cerebro resiliente ×N** | Multiplica la concurrencia base del tramo (×1 → ×2 → ×4 → ×6 → ×8) |
| **Selector de tramo** | automático o forzado a MR#1..#4 |
| **Cancelar** | Detiene en el acto, sin esperar a que acabe la tarea en curso |
| **Reanudar** | Retoma sin repetir lo que ya estaba hecho |
| **Plan** | Crea un plan a mano: una tarea por línea, `titulo \| tipo \| dato \| extra \| dependeDe` |
| **Divisor arrastrable** | Ajusta el ancho de la lista; se guarda y vuelve con doble clic a 300 px |

El escalado **y** el tramo se aplican **en caliente**, también a los planes que ya
están corriendo: para eso los dos se pasan al motor como funciones, no como
valores, y se consultan en cada vuelta del bucle.

`POST /api/brain/tramo` es el endpoint del selector. Un tramo inexistente se
rechaza diciendo cuáles valen (`auto, MR1, MR2, MR3, MR4`).

### 18.3 Verificación

```
npm run validar
  planner 64 · store 55 · runner 38 · roundtrip 460 · export 49 · panel 27
  →  693 comprobaciones · 0 fallos
```

Las 27 pruebas del panel cubren su única pieza con lógica: el intérprete de tareas
del formulario. Comprueban que una línea mal escrita **avisa** en vez de ignorarse,
y que un tipo inventado no se cuela como si nada.

`npm run build` compila (vite + esbuild) y el panel queda dentro del bundle.

### 18.4 Una nota de honestidad sobre `tsc`

`npm run lint` (`tsc --noEmit`) reporta **4 errores de tipos anteriores a este
trabajo**, en zonas de `App.tsx` que no se han tocado (la unión de estado del chat,
las props de `DedicatedWebEditorView` y las de `ProConfigPanel`). Están en el ZIP
anterior igual: verificado comparando con el `App.tsx` del paquete previo. Se
anotan aquí para que no se confundan con deuda nueva.

---

---

## §19 · La cadena chat → conversor → editor → preview, cerrada (18 de septiembre de 2026)

### 19.1 Lo primero: qué parte de la cadena ya existía

Antes de añadir nada se verificó el camino, y **la mitad ya estaba hecha**:

```
chat responde
  → extractCodeBlocksFromMessage   saca los bloques de código   utils/codeParser.ts:12
  → mergeExtractedFiles            los escribe en el workspace  utils/codeParser.ts:53
  → syncToDisk                     los manda al sandbox         App.tsx:2330
  → cerebroNico:autosync-done      refresca el iframe           RightSidebar.tsx:674
```

Es decir: el chat **ya escribía archivos en el editor y ya refrescaba el preview**.
Lo que faltaba era el **conversor** en medio: el modelo podía escribir un archivo,
pero no podía pedir «convierte esto a YAML». Ese era el hueco, y se ha cerrado
enganchándose al camino que ya funcionaba, no montando uno paralelo.

### 19.2 La orden

El modelo pide una conversión con un bloque, y el IDE la ejecuta:

````
```cerebronico:convertir
{"desde":"json","hacia":"yaml","archivo":"package.json"}
```
````

Campos: `desde` y `hacia` (json, yaml, toml, csv) obligatorios; `archivo` (ruta
dentro del proyecto) o `contenido` (texto literal); `salida` opcional —por defecto
se cambia la extensión del origen—; `opciones` opcionales. También existe
`cerebronico:abrir` para abrir un archivo en el editor.

**Por qué un bloque con JSON y no texto libre:** porque así se puede **validar
antes de ejecutar**. Un formato que no existe, un JSON roto o un archivo que falta
se **avisan** y no se ejecuta nada. Interpretar frases sueltas del modelo sería
adivinar qué quiso decir, y de ahí salen las pérdidas silenciosas.

### 19.3 Lo que hace falta para que esto SIRVA

Una orden que el modelo no conoce no se emite nunca. Por eso el prompt del sistema
(`superPrompt.ts`) ahora incluye, para todos los niveles menos `micro`:

- que puede pedir conversiones y cómo;
- y **la obligación de avisar de las pérdidas**, porque JSON no admite comentarios,
  TOML no tiene nulos y CSV no guarda tipos.

El nivel `micro` queda fuera a propósito: ese prompt dice explícitamente que no
intente usar herramientas, y con razón — un modelo de 400 MB necesita su contexto
para trabajar, no para leer un manual.

### 19.4 Lo que se ve al usarlo

Cada paso queda escrito en el registro de la terminal, y **cada pérdida declarada
se enumera**, una por una:

```
[12:04:11] ✓ JSON → YAML: «paquete-convertido.yaml» (4037 → 3083 bytes, 97 clave/s).
[12:04:11] Editor actualizado por órdenes del chat: +1 creado(s), ~0 actualizado(s).
[12:04:11] 🔄 1 archivo(s) al sandbox: el preview se refresca.
```

Si algo falla, también se dice: archivo que no está en el espacio de trabajo,
formato desconocido, JSON roto, o el sandbox que no responde. **Nunca aparece un
archivo en el editor sin decir qué se perdió por el camino.**

### 19.5 Verificación

```
npm run validar
  planner 64 · store 55 · runner 38 · roundtrip 460 · export 49 · panel 27 · chatOrders 37
  →  730 comprobaciones · 0 fallos

npm run build  →  vite + esbuild, compila con la cadena enganchada
```

Las 37 pruebas nuevas cubren el intérprete de órdenes: que una orden correcta se
interprete entera, que una mal escrita **avise sin ejecutar**, y que el nombre de
salida salga de la extensión del destino.

**Recorrido en vivo de la cadena completa** (sin modelo, partiendo del mensaje que
el modelo emitiría):

```
PASO 2  extraerOrdenes() ...... 2 órdenes, 0 avisos
PASO 4  el CONVERSOR .......... ok · 4037 → 3083 bytes · 97 claves · 0 pérdidas
PASO 5  el EDITOR ............. «paquete-convertido.yaml» escrito (3088 bytes)
PASO 6  la orden «abrir» ...... apunta al archivo nuevo, que ya existe
PASO 7  el PREVIEW ............ el .yaml está en el sandbox que sirve :3500
PASO 8  ida y vuelta ........... PERFECTO: json → yaml → json vuelve exactamente igual
```

### 19.6 Lo que sigue sin estar

- **El chat no puede crear un plan del cerebro todavía.** Existe el panel para
  lanzarlos y la API, pero no una orden `cerebronico:plan`. Es el siguiente paso
  natural y no se ha hecho para no meter dos cosas nuevas en la misma entrega.
  → **Resuelto en §20.**

---

## §20 · `cerebronico:plan`: el chat crea planes del cerebro (19 de septiembre de 2026)

### 20.1 La orden

El modelo describe el plan y el IDE lo crea y lo lanza:

````
```cerebronico:plan
{ "objetivo": "Convertir los datos a tres formatos", "tareas": [
  { "id": "1", "titulo": "leer", "tipo": "leer_archivo", "peso": "io", "datos": { "ruta": "datos.csv" } },
  { "id": "2", "titulo": "a YAML", "tipo": "convertir", "datos": { "desde": "csv", "hacia": "yaml", "archivo": "datos.csv" }, "dependeDe": ["1"] }
] }
```
````

Campos: `objetivo` y `tareas` obligatorios; `modelo` y `contexto` en la raíz se
aplican a todas las tareas de tipo `modelo`; `autoLanzar: false` deja el plan
preparado sin arrancarlo.

Los tipos de tarea son **los tres que existen de verdad** —`modelo`, `leer_archivo`
y `convertir`— y la orden lo dice en voz alta para que el modelo no invente un
«ejecutar comando» que no hay.

### 20.2 Lo que se comprueba ANTES de crear nada

Aquí está la decisión de diseño que importa: **el plan del chat se valida con el
MISMO código que usa el motor**, no con una copia de las reglas.

```
chatOrders.ts  →  crearPlan() + validarPlan()   ← los mismos que server.ts
```

Si hubiera dos validaciones, algún día discreparían y el chat crearía planes que
el motor rechaza. Además se comprueba por anticipado lo que el ejecutor exige para
correr: `leer_archivo` necesita `datos.ruta`, `convertir` necesita formatos válidos
y `contenido` o `archivo`. Un plan con un ciclo **no se envía siquiera**: un ciclo
no termina nunca, se cuelga, y no tiene sentido esperar a descubrirlo.

Tope de 500 tareas por orden: el motor no lo impone (el semáforo global ya protege
la máquina), pero un modelo desmandado no debe poder encolar 5.000 tareas de golpe
desde el chat, donde nadie las revisa antes.

### 20.3 Que el plan se VEA

Al crear un plan, el IDE **trae al frente la pestaña Planificador** y avisa al panel
(`cerebronico:plan-creado`) para que se recargue. Es el mismo criterio que el
conversor abriendo el archivo convertido: un plan que corre donde nadie lo ve no es
distinto de un plan que no corre. El aviso hace falta porque, si el usuario ya está
en esa pestaña, el panel no se remonta y seguiría enseñando la foto vieja hasta 8 s.

### 20.4 Verificación

```
npm run validar → 761 comprobaciones · 0 fallos (7 suites, chatOrders ahora 68)
npm run build   → compila
```

De las 68 pruebas de órdenes, **31 son de plan**: 15 de aceptación y 16 de rechazo
(sin objetivo, sin tareas, id repetido, dependencia inexistente, depende de sí
misma, ciclo, tipo desconocido, `leer_archivo` sin ruta, `convertir` sin formato,
`convertir` sin contenido ni archivo, más de 500 tareas, JSON roto).

**Recorrido en vivo, sin modelo:**

```
PASO 2  extraerOrdenes() ....... 1 orden · 0 avisos · 3 tareas · autoLanzar: true
PASO 3  POST /api/brain/plan ... ok · planId 2 · lanzado: true
PASO 4  el runner .............. estado final: hecho · 3/3 hechas · 0 reintentos
        #1 leer package.json ... hecha · 4 ms  · Leído «package.json» (4037 caracteres)
        #2 a YAML .............. hecha · 8 ms  · JSON → YAML · 4037 → 3083 bytes · sin pérdidas
        #3 a TOML .............. hecha · 2 ms  · JSON → TOML · 4037 → 3200 bytes · sin pérdidas
PASO 5  contraste con un CICLO . el chat lo rechaza Y el motor lo rechaza, con el MISMO texto
PASO 6  reinicio REAL .......... el plan 2 sigue con su estado, sus 3 tareas y su log
```

El paso 5 es el que demuestra que la validación no está duplicada: los dos
mensajes salen idénticos, palabra por palabra:

```
Ciclo de dependencias: #1 → #2 → #1. El plan no se puede ejecutar así (se colgaría);
quita una de esas dependencias.
```

### 20.5 Corrección: el paralelismo NO quedó demostrado en vivo

Conviene dejarlo escrito porque es fácil leerlo al revés. En el plan 2, las tareas
#2 y #3 **no dependen entre sí**, así que el grafo permite ejecutarlas a la vez.
Pero el log del plan muestra que se ejecutaron **en serie**:

```
▶ #2 "a YAML" en_curso   ✓ #2 hecha en 8 ms
▶ #3 "a TOML" en_curso   ✓ #3 hecha en 2 ms
```

El motivo está en la primera línea del log: el presupuesto de esa máquina en ese
momento era `1 io / 1 cpu` (MR1 ×1, sobre 4 GB de RAM), así que **sólo cabía una
tarea de espera a la vez**. Es el comportamiento diseñado —terminar siempre, aunque
sea más lento— pero significa que **una ejecución en vivo no demuestra paralelismo**.
Lo que lo demuestra es la suite del planificador (64 comprobaciones), que lo mide en
condiciones controladas. No dar por bueno un «va en paralelo» leyendo un log donde
las tareas se ejecutaron de una en una.

El presupuesto además **se recalcula en cada vuelta a partir de la RAM libre real**
(`resolverPresupuesto` con `os.freemem()`), así que no es reproducible después: al
consultar el panel más tarde puede decir `2 io` y haber corrido con `1 io`. No es
una contradicción, son dos momentos distintos.

### 20.6 Un detalle mejorable, NO cambiado en esta entrega

La línea del log dice `DEGRADADO (ver motivos)`, pero **los motivos se calculan en
vivo**: cuando el plan ya terminó, el panel puede mostrar un presupuesto sin
degradar y la razón original se ha perdido. Sería más honesto guardar el motivo en
la propia línea del log en el momento del despacho. **No se ha tocado** para no
mezclar un cambio de formato del log con esta entrega, y porque las pruebas del
panel verifica ese formato. Queda anotado.
→ **Resuelto en §21.7.**

---

## §21 · Ordenar la casa: el comprobador de tipos destapó siete fallos silenciosos (19 de septiembre de 2026)

### 21.1 El punto de partida: el proyecto no compilaba limpio

`npm run lint` es `tsc --noEmit`, y **fallaba con 25 errores**. En la memoria del
proyecto había anotado «4 errores anteriores a este trabajo, no son míos»: era
cierto en ese momento y **ya no lo es**. Cuatro de aquellos siguen ahí; los otros
21 nadie los había mirado.

La decisión de esta entrega fue sencilla de enunciar y trabajosa de cumplir: **si
el comprobador de tipos grita, hay que leerlo antes de silenciarlo.** No todos los
avisos de tipos son ruido; algunos son código que no hace nada. Siete lo eran.

### 21.2 · FALLO 1 — El aprendizaje de fallos de herramientas no llegaba a la base de conocimiento

```
server.ts:1177   keys: [toolName.toLowerCase(), ...tokenize(errorText).slice(0, 8)]
```

`tokenize` está exportada en `src/engine/knowledgeBase.ts:64` y **no se importaba
en `server.ts`**. La llamada lanzaba `ReferenceError`… y el `catch` que la envuelve
—cuyo comentario dice «el aprendizaje nunca debe romper la ejecución de una
herramienta»— se lo tragaba **en silencio**.

**Alcance exacto, medido y no supuesto:** el `try` de más arriba
(`brain.registrarFallo`, la sección [Incidencias Críticas] que el modelo lee en el
turno siguiente) **sí funcionaba**. Lo que moría era la segunda mitad: la entrada
«Fallo real de *herramienta*» **nunca llegaba a la base de conocimiento**, así que
el modelo jamás podía recuperarla para no repetir el mismo error. Media función
trabajando y media muerta, y nadie lo sabía.

**Verificado en vivo y de forma causal** (base de conocimiento borrada, un solo
fallo provocado):

```
ANTES    · entradas en la base: 62 · ¿existe la entrada de fs_sync? NO
SYNC     · ok=false escrito=1 rechazado=0 importsSinResolver=1
DESPUÉS  · entradas en la base: 63
           "Fallo real de fs_sync" [tabla=error] score=5.89
```

### 21.3 · FALLO 2 — El bloqueo de escritura por sintaxis rota nunca se activaba

```ts
const blocking = guard.issues.filter((i) => i.severity === "error");
```

`SyntaxIssue` **no tiene** campo `severity`: tiene `kind`, `line`, `message` y
`fix`. El filtro devolvía una lista vacía **siempre**, así que `blocking.length > 0`
era siempre falso y **un archivo con la sintaxis rota se escribía igual** — justo
lo que el comentario de encima del código dice que ya no pasaba. Igual que el
anterior: la protección estaba escrita, se ejecutaba, y no protegía nada.

De propina, `blocking[0].hint` tampoco existía; el campo real es `fix`.

**Arreglado y sacado fuera del endpoint.** La regla vive ahora en
`problemasBloqueantes()` (`syntaxGuard.ts`), no dentro de un `server.ts` de 6.800
líneas. Esa es la lección de fondo: **una regla que no se puede probar no está
protegida**. Se añadió `tests/guard.test.ts` con 27 comprobaciones, incluida una
que fija por escrito lo que estaba mal:

```
PASS   un issue NO tiene «severity» (el campo por el que se filtraba antes)
PASS   ...y aun así BLOQUEA: ya no se filtra por ese campo
```

**Verificado en vivo:**

```
POST /api/fs/write  {"path":"pruebas/bueno.json","content":"{\"a\":1,\"b\":[1,2]}"}   → HTTP 200
POST /api/fs/write  {"path":"pruebas/roto.json","content":"{\"a\":1,\"b\":[1,2}"}     → HTTP 422
   bloqueado · problema: JSON inválido: Expected ',' or ']' after array element
   consejo (de «fix»): Corrige comas, comillas dobles y llaves. …
   y el archivo NO llega al disco: GET /api/fs/read → 404
```

### 21.4 · FALLO 3 — El diagnóstico del almacén de planes mentía siempre

```ts
pendientes: this.cadena ? 0 : 0     // los dos lados del ternario valen 0
```

Una promesa es siempre «verdadera», así que el ternario daba 0 pasara lo que
pasara: el diagnóstico informaba **cero escrituras pendientes aunque hubiera
veinte encoladas**. Un diagnóstico que miente es peor que no tenerlo. Ahora hay un
contador de verdad, que se descuenta en un `finally` para que no se quede
enganchado si una escritura falla.

### 21.5 · FALLO 4 — El panel de configuración tenía tres botones rotos

`ProConfigPanel` declara `onReplaceAll` como **obligatoria** y la llama en tres
sitios (restaurar valores por defecto ×2, importar ajustes ×1). **`App.tsx` no se
la pasaba**, así que pulsarlos lanzaba `onReplaceAll is not a function`. Se pasa
ahora sin fusionar, que es justo lo que la distingue de `onChange`.

### 21.6 · FALLO 5 y 6 — El editor web: una fase inventada y media vista sin cablear

- `setWebEditorStatus({ phase: "applied" })` — **`"applied"` no existe** en el tipo
  (`idle | sending | streaming | applying | done | error`). Como las etiquetas y
  los colores son un `Record` sobre esa unión, el editor pintaba **etiqueta vacía y
  una clase CSS «undefined»**; y como el refresco del preview se dispara sólo con
  `"done"`, **tampoco refrescaba**. La fase correcta era `"done"`, cuyo rótulo es
  literalmente «Aplicado».
- La instancia del editor **a pantalla completa** pasaba `onSendAIToChat`, una prop
  que el componente **no acepta desde la v2.0**: se ignoraba en silencio. En esa
  vista el botón de orden directa **no hacía nada** y la barra de estado nunca se
  pintaba. La otra instancia (la pestaña) sí estaba bien cableada; ahora las dos lo
  están igual.

### 21.7 · FALLO 7 y el resto — Tipos que no decían la verdad

- **`KbTable` no incluía `"manual"`**, y `manuals.ts` lleva desde siempre insertando
  sus ~20 entradas con `table: "manual"`. Peor: como esa tabla **tampoco estaba en
  `TABLE_PRIORITY`**, la puntuación caía al valor por defecto
  (`TABLE_PRIORITY[entry.table] ?? 0.5`) y **los manuales del motor se puntuaban
  0.5, por debajo de todas las demás categorías** (la más baja es `lesson`, 0.6).
  Se ha corregido el tipo —`Partial<Record<KbTable, number>>`, porque el `?? 0.5`
  demuestra que faltar está previsto— y **NO se ha cambiado la prioridad**: dársela
  alteraría qué conocimiento entra en el contexto del modelo, y eso es una decisión
  de producto. Queda anotado en el RECORDATORIUM como pendiente 7.
- **`KbEntry` no tenía `tags`**: `manuals.ts` pasaba etiquetas («core», «pc») que se
  **descartaban sin que nadie se enterara**. El campo existe ya.
- **`csvALeer` declaraba devolver `Record<string, string>[]` y era mentira**:
  `inferir()` devuelve `unknown` — con `inferirTiposCsv`, «42» sale número y «true»
  sale booleano. Se declara lo que es.
- `ExtensionView.panelOpen` faltaba en los tres caminos de error de `scanExtensions`.
- Cuatro `{ ok: true, ...spread }` donde el literal quedaba **pisado** (muerto) y
  cuatro `req.params.id` (`string | string[]` en los tipos de Express) sin
  normalizar. Comportamiento idéntico, tipos honestos: se quitó lo muerto y se
  añadió `String(...)`.
- **`js-yaml` no traía tipos** y ahora tiene una declaración propia y estrecha
  (`src/types/js-yaml.d.ts`) con sólo las dos funciones que el proyecto usa.
  Estrecha a propósito: si algún día se usa más, dará un error claro en vez de
  colarse por un `any`.

### 21.8 · El pendiente 1c, cerrado

El log del plan decía `DEGRADADO (ver motivos)` y los motivos se calculaban **en
vivo** con `os.freemem()`: cuando el plan acababa, la razón se había perdido. Ahora
la línea se escribe **sólo cuando el reparto cambia** y lleva el motivo dentro. Un
aviso sin su causa es medio aviso.

```
[plan 4] presupuesto: MR4 ×1 → 1 io / 1 cpu · en curso 0 io 0 cpu · DEGRADADO ·
MOTIVO: Tramo forzado a Memoria Resiliente Nº4 (32 GB) en una máquina de 4 GB: irá
justo de memoria, pero termina. Escalado ×1 pedía 3 tareas de cálculo; se queda en
1 por tope de sistema y por tener 2 núcleo(s). RAM libre 1.3 GB (aprovechable 0.0 GB
tras dejar 4 GB de colchón): caben 0 de espera y 0 de cálculo. Aviso: la RAM libre
no da ni para una tarea. Se sigue con 1 a la vez — más lento, pero el proceso TERMINA.
```

De paso: antes se escribía en cada vuelta del bucle; ahora una línea por cambio real
(1 línea en vez de 4 en ese plan). El formato sigue conteniendo `presupuesto: MR`, así
que la prueba del planificador que lo verifica sigue pasando.

### 21.9 · Lo que se ha decidido NO tocar

Cuatro cosas quedaban fuera de «ordenar» y son **decisiones de producto**, no
limpieza. No se han tocado y quedan en el RECORDATORIUM con su motivo:

| # | Qué | Por qué no se toca aquí |
|---|---|---|
| 3 | Honestidad del catálogo (`skills100.ts`) | 92 entradas marcadas `active` sin implementación, inyectadas al modelo. Cambiar el catálogo cambia el comportamiento del modelo |
| 4 | Permisos de herramientas | Un plan en segundo plano ejecutando comandos necesita diseño propio |
| 5 | Instalador y portable firmados | Hace falta un certificado de firma, no código |
| 6 | Exportación a Android desde la interfaz | Es funcionalidad nueva, no orden |
| 7 | **Prioridad de los manuales en la puntuación** | Nuevo. Los manuales puntúan 0.5; subirlos cambia qué sabe el modelo |

### 21.10 · Un hallazgo de diseño que conviene tener escrito

Al verificar el bloqueo salió algo que **no** es un fallo y es importante no
confundir: **el guardián no comprueba el balance de llaves en JavaScript ni en
TypeScript.**

```
export function f() { return {a: 1      →  ok=true, «sin problemas de sintaxis»
```

No es un olvido: `syntaxGuard.ts:342-355` documenta la **política conservadora** que
se adoptó tras medir que el balance rechazaba **32 de 63 archivos válidos del propio
proyecto (el 51 %)** — genéricos de TypeScript tomados por etiquetas HTML, JSX y
plantillas mal entendidas — y dejaba el sandbox a medias. Se decidió que **un
guardián con falsos positivos es peor que no tenerlo**, y que sólo se bloquea lo que
se puede afirmar sin duda: truncamiento, JSON, HTML, CSS y Python.

Consecuencia práctica, dicha claramente: **un `.js`/`.ts` cortado a la mitad por
falta de contexto puede pasar el guardián**. Lo que sí lo frena es el marcador de
truncado al final del archivo. Quien lea «blindaje de escritura» debe saber hasta
dónde llega.

### 21.11 · Verificación

```
npm run lint     → 0 errores            (antes: 25)
npm run validar  → 788 comprobaciones · 0 fallos   (antes 761; +27 de tests/guard.test.ts)
npm run build    → vite + esbuild, correcto
```

Las 27 pruebas nuevas del guardián cubren la regla que estaba mal y fijan el caso
por escrito, para que no pueda volver a colarse.

---

## §22 · La resiliencia: las lecciones convertidas en guardián (19 de septiembre de 2026)

### 22.1 Por qué no basta con escribirlo

Todo lo de §21 quedó escrito en el MEMORANDUM y en el RECORDATORIUM. Y no sirve de
nada: **un documento no impide que el fallo vuelva.** El propio caso lo demuestra —
el guardián de escritura llevaba meses documentado en el comentario de encima del
código («si está roto no se escribe») y no bloqueaba nada. Escribir la intención no
es protegerla.

Así que cada lección de §21 se ha convertido en algo que **falla solo** si se repite.

### 22.2 La causa de fondo: la puerta que había que recordar abrir

Los 25 errores de tipos aparecieron porque alguien pasó `tsc` **a mano**. `validar`
—la orden que se ejecuta de verdad— no miraba los tipos. Una puerta que hay que
acordarse de abrir no es una puerta.

Ahora `npm run validar` **empieza** por el comprobador de tipos:

```
  tipos       el comprobador de TypeScript (tsc --noEmit) … 0 errores
  planner     grafo, dependencias, paralelismo, cancelación … 64 correctas
  …
```

Si falta el compilador, **no se salta en silencio**: se para y dice `npm install`,
igual que ya hacía con `tsx`. Un gate que se puede omitir sin querer no es un gate.

### 22.3 El validador también mentía (encontrado al hacer esto)

Al leer `validar.mjs` para meterle la puerta de tipos salió un agujero que conviene
contar entero, porque es el peor sitio para tener un agujero.

**El veredicto miraba sólo `totalMal`.** Y `totalMal` suma las *comprobaciones
fallidas* que cada suite imprime. Pero una suite que **revienta** —un import roto,
un fichero renombrado, un borrado por accidente— no llega a imprimir «N fallidas»:
imprime un error de Node y ya. Así que aportaba **0 al contador de fallos**.

Resultado, comprobado con una suite fantasma:

```
  fantasma    SUITE QUE REVIENTA … 0 FALLOS
  ──────────────────────────────────────────────────────────────
  VEREDICTO: TODO CORRECTO — 788 comprobaciones, 0 fallos.
  (código de salida: 0)
```

Es decir: **borrar un fichero de pruebas hacía que el proyecto dijera «TODO
CORRECTO»** y saliera con 0, que es lo que un proceso automático lee como «adelante».
El guardián del proyecto mentía. La suite en rojo aparecía en la lista, sí, pero el
veredicto la tapaba.

Arreglado: una suite que no corre se cuenta **aparte** (`suitesEnRojo`) y tumba el
veredicto. Repetido el mismo experimento:

```
  fantasma    SUITE QUE REVIENTA … 0 FALLOS (la suite NO llegó a ejecutarse)
  VEREDICTO: HAY FALLOS
  (código de salida: 1)
```

### 22.4 Las cuatro reglas que ahora se defienden solas

`tests/resiliencia.test.ts` (24 comprobaciones). No prueba el motor: prueba que el
proyecto se defiende de la clase de fallos de §21.

| Regla | El fallo de §21 que impide que vuelva |
|---|---|
| Ningún ternario con las dos ramas iguales | `pendientes: this.cadena ? 0 : 0` — el diagnóstico que informaba 0 siempre |
| Ningún nombre del motor usado sin importar | `tokenize` sin importar, con el `catch` tragándose el `ReferenceError` |
| Ninguna suite huérfana ni fantasma | la cobertura no puede desaparecer en silencio |
| `validar` incluye el comprobador de tipos | los 25 errores no pueden volver a vivir sin que nadie los vea |

### 22.5 Lo importante: cada regla se prueba CONTRA UN CASO MALO

Aquí está el fondo del asunto, y es la lección de todo el día aplicada a sí misma.

Una regla que sólo se comprueba sobre el código bueno **puede no estar haciendo
nada** y nadie se enteraría. Es exactamente el fallo del guardián de escritura:
pasaba por bueno todo porque su filtro devolvía siempre una lista vacía.

Así que cada detector se ejecuta **dos veces**: contra el árbol real (debe salir
limpio) y contra un fragmento con el fallo metido a propósito (debe encontrarlo).

```
PASS   el código de producción no tiene ninguno
PASS   ...y DETECTA el fallo cuando se le mete a propósito
PASS   detecta el caso que rompió el diagnóstico (`? 0 : 0`)
PASS   y NO marca un ternario legítimo (`? 1 : 2`)
PASS   ignora los comentarios
PASS   no confunde `??` (nulo coalescente) con un ternario
```

Si alguien rompe un detector, la segunda mitad lo delata.

### 22.6 Dos falsos positivos que aparecieron al construirlo (y se arreglaron)

Conviene dejarlo escrito: la suite **falló en su primera versión**, con 3 fallos. Los
dos eran míos y los dos enseñan algo.

1. **La expresión no cortaba bien la rama derecha.** Para `? 0 : 0 }` comparaba «0»
   con «0 }» y por eso **no veía justo el caso que existía para ver**. Un detector
   que no detecta su propio motivo es papel mojado. Arreglado acotando las ramas
   para que no arrastren llaves.
2. **El detector se marcaba a sí mismo.** Los casos malos de ejemplo viven dentro del
   propio fichero de pruebas, así que la regla los encontraba y se acusaba sola. Se
   excluye `tests/` de esa regla, con el motivo escrito al lado: un guardián que se
   acusa de lo que predica genera ruido, y el ruido acaba desactivando guardianes.

Ninguno de los dos se habría notado si la suite sólo se hubiera comprobado contra el
código bueno — que es, otra vez, el argumento de 22.5.

### 22.7 Lo que esto NO protege

Decirlo es parte de hacerlo bien. Estas reglas **no** cubren:

- Un `catch` que se traga un error **legítimamente** pero tapa un fallo real. Eso
  necesita diseño, no una expresión regular.
- Un campo que existe en el tipo y no se rellena nunca.
- Un valor por defecto equivocado (`?? 0.5` cuando debía ser otra cosa): el caso de
  los manuales, que sigue siendo pendiente 7.
- Que el catálogo de `skills100.ts` prometa 92 habilidades que no existen.

Lo que sí cubren es la clase concreta de §21: **código escrito, ejecutado y muerto.**
Y esa, a partir de ahora, salta sola.

### 22.8 Verificación

```
npm run validar  →  812 comprobaciones · 0 fallos
                      tipos 0 errores · 9 suites ejecutadas · 0 sin correr
                      (código de salida 0)
npm run lint     →  0 errores
npm run build    →  correcto

Y la prueba de que el veredicto ya no miente: con una suite fantasma,
                 →  HAY FALLOS · (código de salida 1)
```

Las 24 pruebas de resiliencia se suman a las 27 del guardián: **51 comprobaciones
que existen sólo para que estos fallos concretos no puedan repetirse en silencio.**

---

*Documento generado el 16 de septiembre de 2026 por Mario Nicolas Quintero.*
*Ampliado el 18 de septiembre de 2026 — §15, manual de extensiones verificado contra el código.*
*Ampliado el 18 de septiembre de 2026 — §16, motor de tareas, conversor interno y estado real de la cadena chat/editor/preview.*
*Ampliado el 18 de septiembre de 2026 — §17, exportación a Android de las apps creadas con el IDE.*
*Ampliado el 18 de septiembre de 2026 — §18, la ventana del cerebro: el panel del planificador.*
*Ampliado el 18 de septiembre de 2026 — §19, la cadena chat → conversor → editor → preview, cerrada y verificada.*
*Ampliado el 19 de septiembre de 2026 — §20, `cerebronico:plan`: el chat crea planes del cerebro.*
*Ampliado el 19 de septiembre de 2026 — §21, ordenar la casa: el comprobador de tipos destapó siete fallos silenciosos.*
*Ampliado el 19 de septiembre de 2026 — §22, la resiliencia: cada lección convertida en un guardián que falla solo.*
*CerebroNico IDE V2.1 — Copyright © 2026.*

---

# SECCIÓN 22 — IMÁGENES GRATIS EN EL CEREBRO (v2.3 — 19-sep-2026)

## Qué es
Cuarta tarea del motor de planes: **`generar_imagen`** (peso `io`). El cerebro
dibuja gratis, sin clave y sin cuenta, en segundo plano y en paralelo. El chat
también puede emitir la orden directa `cerebronico:imagen`.

## La cadena de proveedores (medida, no supuesta — 19-sep-2026)
1. **Pollinations** (`image.pollinations.ai/prompt/…`): responde **sin clave**
   (`x-auth-status: unauthenticated`). Verificado en vivo:
   - Una imagen tarda **12–46 s** en la capa gratuita (baja prioridad).
   - El modelo que responde NO siempre es el pedido: pidiendo `flux` o `turbo`
     anónimo la cabecera `x-model-used` devolvió **`sana`** con bytes idénticos.
     El resultado SIEMPRE declara el modelo real de la cabecera, y avisa de la
     divergencia.
   - Con dos imágenes en paralelo, la segunda recibió **HTTP 429 «Queue full for
     IP»**: la capa gratuita deja ~1 petición en vuelo por IP.
   - El servicio **acomoda dimensiones**: 1280×720 se generó internamente a
     1024×576 (visible en el EXIF). Se avisa al pedir lado > 1024 px.
2. **Gemini** (respaldo): solo si `GEMINI_API_KEY` está en `.env`. Sin clave se
   DECLARA que no se intentó (su capa gratuita de imagen es nula;
   `gemini-2.5-flash-image` además se apaga el 02-oct-2026 → la cadena usa
   `gemini-3.1-flash-image` primero). `gen.pollinations.ai` exige clave (401),
   por eso Pollinations gratuito entra por la URL clásica.

Cada eslabón que falla deja su motivo en `fallos[]`; si la cadena entera falla,
`ok:false` con la lista completa. Nunca un «no se pudo» a secas.

## Qué hace el motor con esa realidad (lo probado en vivo manda)
- **429 = `quota` = reintentable CON ESPERA**: el reintento inmediato es el
  mismo 429. El planificador espera `backoffQuotaMs` (por defecto **45 s**, el
  extremo alto medido de una imagen; inyectable en pruebas) y el panel muestra
  el motivo con cuenta atrás: «esperando a que se drene la cola del proveedor
  (429, reintento en ~Ns)».
- **Cortacircuito `imagen`**: era **código muerto** — nadie llamaba a
  `recordFailure`/`recordSuccess` y el circuito se consultaba sin moverse nunca.
  Corregido en `taskPlanner.ts`: los fallos de red/timeout/offline/quota abren
  el circuito tras 3 seguidos; un éxito lo cierra. Las tareas que llegan con él
  abierto entran en enfriamiento en vez de quemar intentos. (Patrón §21.)
- **El binario NO entra en el workspace de texto**: ese vive en localStorage con
  tope de 5 MB y un JPEG lo tumbaría. El servidor escribe directo en la raíz del
  proyecto (`escribirImagenEnProyecto`, autoridad ÚNICA de escritura binaria)
  con confinamiento `path.relative` doble.
- **La extensión la mandan los BYTES**: un JPEG pedido como `.png` se guarda
  como `.jpg` y la corrección se DECLARA (`rutaConExtensionReal`). Un archivo
  mal etiquetado es exactamente lo que este proyecto no hace.

## Nuevos ficheros y endpoints
- `src/engine/imageGen.ts` — cadena con `fetch` inyectable, validación previa
  (prompt ≤4000, 256–2048 px, seed ≥0), firma mágica JPEG/PNG/WEBP/GIF,
  timeout 120 s por eslabón, `estadoCadenaImagen()` para diagnóstico.
- `POST /api/engine/imagen` — generación directa (la usa la orden del chat).
  502 con la lista de fallos si la cadena cae; 400 si los datos no cuadran.
- `GET /api/engine/imagen/vista?ruta=…` — miniaturas del panel (confinado al
  proyecto, solo .jpg/.jpeg/.png/.webp/.gif).
- `GET /api/engine/imagen/estado` — qué eslabones tienen clave en ESTA máquina.
- Orden de chat: ` ```cerebronico:imagen {"prompt":"…","salida":"img/logo.jpg"} ``` `
  (bloque JSON validado antes de ejecutar, como `convertir`; enseñada en el
  superPrompt nivel ≥ normal y en `instruccionesParaElModelo()`).
- `cerebronico:plan` acepta tareas `generar_imagen`; `normalizarPlanDesdeOrden`
  exige `datos.prompt` con la MISMA validación del motor.
- `PlansPanel.tsx`: el intérprete de líneas acepta la 4ª columna como salida y
  las imágenes guardadas se **ven** (miniatura) en la fila de la tarea.

## Pruebas
`tests/imagen.test.ts` — **91 comprobaciones** con fetch falsificado: éxito con
modelo real declarado (flux→sana), 200-con-HTML rechazado, fallback Gemini con
clave, fallo total con motivos completos, cancelación con señal ya abortada,
timeout, ruta que escapa rechazada, extensión corregida y declarada, cortacircuito
que abre con 3 fallos y cierra con un éxito, 429 reintentado tras backoff, y el
escenario **8 GB (MR2)**: presupuesto `io=3` sin degradación con RAM holgada,
degradado a 1 con motivo escrito y TERMINANDO con RAM justa.

Veredicto total: **`npm run validar` → 903 comprobaciones · 0 fallos** (11
puertas: tipos + 10 suites). Live: imagen real de 40 KB en 2.9 s declarando
`sana`, otra en 34 s con aviso de acomodo 1280→1024, `400` en intentos de escape
de ruta, y un plan de 2 imágenes corriendo en paralelo donde el 429 real motivó
el backoff de arriba.

## Límites honestos de esta capacidad (para no prometer de más)
- Gratis = lento y con cola por IP. Para ráfagas cortas está bien; para producción
  intensiva hay que poner clave (Pollinations `POLLINATIONS_API_KEY` en `.env`
  activa modelo real + prioridad; Gemini `GEMINI_API_KEY` añade el respaldo).
- La calidad del `sana` gratuito es de boceto, no de campaña publicitaria.
- No hay edición de imagen (inpainting, recortes): generar y guardar, nada más.

---

# SECCIÓN 23 — LAYOUT Y VERSIÓN (v2.3.1 — 19-sep-2026)

Captura del usuario: botones perdidos a la derecha en el título y en el editor,
y la cabecera seguía diciendo V2.1. Causas y arreglos:

1. **Header sin envolvente**: `h-14` fijo + `justify-between` → al crecer la
   suma de chips, la sección derecha salía del viewport y se recortaba. Ahora
   `min-h-14` + `flex-wrap`: ninguna cabecera puede perder botones.
2. **Barras del CodeEditor** (herramientas `h-10` y estado `h-6`): mismo
   criterio, `min-h` + `flex-wrap`.
3. **Auto-fit (v1.8.1) tenía dos agujeros**: contaba el ancho persistido de
   paneles CERRADOS (ocupan 0) y no corría al abrir/cerrar. Ahora usa anchos
   efectivos y las dependencias incluyen `isLeftOpen/isRightOpen`.
4. **Versión**: `IDE_BRAND.VERSION` → V2.3 (regla: si la cabecera no dice la
   versión del ZIP, no es tu ZIP). Los literales sueltos que decían «V2.1»
   (menú CN, pantalla de fallo, título del informe, `<title>`/metas de
   index.html) pasaron a la fuente única o al valor correcto — eran la segunda
   fuente de verdad que la propia regla de marca prohibía.

Verificado: `npm run validar` 903 · 0 fallos (tsc 0), `npm run build` OK.

---

# SECCIÓN 24 — EL REFLEJO Y LOS MODELOS PROPIOS (v2.4 — 19-sep-2026)

## Qué es
Cuatro piezas nuevas, todas locales y deterministas donde importa:

1. **`cerebroReflejo.ts` + tablas generadas** — frase en español (con typos) →
   orden `cerebronico:` válida, cálculo o plantilla de código. Dos tamaños:
   **lite 502 KB** (diccionario + fuzzy Levenshtein 1 en runtime) y
   **max 2.2 MB** (distancia 2 precalculada + conjugaciones + es/en/pt +
   números en letras: «dos mas dos por tres» = 8). Las tablas las genera
   `scripts/gen-reflejo.mjs` (nadie escribe 108 000 typos a mano) y **viajan
   dentro de `dist/server.mjs`** (3.1 MB) — no hay «fichero de tablas no
   encontrado» posible.
2. **Calculadora propia** — tokenizer/parser recursivo, sin `eval`:
   precedencias, `^`, funciones, constantes, coma decimal, forma hablada
   («raiz de 144 mas 1» = 13). El error siempre trae motivo («división por
   cero: no existe»).
3. **Los modelos neurales se instalan solos**: `postinstall` llama a
   `scripts/instalar-modelos.mjs`, que baja el escalón que corresponde al tramo
   MR de la máquina (`smollm2:135m-instruct-q3_K_S` ~70 MB en 4 GB ·
   `smollm2:360m` en 8 GB · `smollm2:1.7b` en 16/32 GB) desde el registro
   oficial de Ollama. Reglas: nunca aborta `npm install`, no toca nada si
   Ollama no responde en 1 s, no re-descarga lo que ya está,
   `CEREBRONICO_SIN_MODELOS=1` = salto declarado.
4. **Modelfiles generados, no escritos a mano** — `npm run modelfiles` produce
   `models/Modelfile.cerebronico-{135m,360m,1.7b}` con el system prompt tomado
   de `instruccionesParaElModelo()`: la MISMA fuente que ve el chat. Crear en
   Ollama: `ollama create cerebronico-360m -f models/Modelfile.cerebronico-360m`.

## Las tres reglas del reflejo (probadas: suite `reflejo`, 76 comprobaciones)
1. **Cero filtro de contenido**: el prompt viaja literal (se quita solo el
   artículo inicial). El único «no» es estructural y siempre trae motivo.
2. **Nunca emite JSON inválido**: toda orden se re-valida con `extraerOrdenes`
   antes de salir. Si no sobrevive al viaje de ida, no sale.
3. **Nada de silencios**: cada descarte dice por qué.

## Bugs reales que las pruebas de hoy cazaron (y cómo)
- `sqrt 144 + 1` daba 1: la función sin paréntesis se comía el signo. El
  parser ahora aplica la función a la PRIMARIA siguiente.
- `(5+3)*2` daba «paréntesis desbalanceado»: los niveles no devolvían el
  token «)». Regla: todo token no consumido se devuelve con `i--`.
- A distancia 2 en runtime, «ardiendo» votaba por «abriendo» y una imagen se
  convertía en «abrir». División de papeles: **runtime solo distancia 1; la 2
  vive precalculada en la tabla max**.
- Las rutas bajaban a minúsculas (`App.tsx`→`app.tsx`): los nombres de archivo
  se leen de los tokens CRUDOS.
- El nombre de una plantilla no se corrige NUNCA con fuzzy: sin eso, la tabla
  max convertía «Panel» en «plan_en» y creaba el componente «Nuevo».

## Endpoints nuevos
- `POST /api/reflejo {frase, modo:"lite"|"max"}` → `{ok, accion, confianza,
  salida, orden?, motivo?}` (200 si entiende, 422 con motivo si no).
- `GET /api/reflejo/estado` → tamaños y entradas cargadas de cada modo.

## Verificación
`npm run validar` → **979 comprobaciones · 0 fallos** (11 suites: las 10
anteriores + reflejo 76). `npm run build` OK. Marca visible: **V2.4**.

---

# SECCIÓN 25 — CEREBRONICO-AGENTICO v1: LAS 40 ENTIDADES (v2.5 — 19-sep-2026)

- **Consejo** (`src/engine/reflejo/consejo.ts`): 12 especialistas votantes
  (las ramas de `pensar()` ascendidas a entidades con nombre y contrato, sin
  duplicar lógica: los 76 tests del reflejo siguen verdes sin tocarlos) + 28
  herramientas deterministas (texto/datos/matemáticas/máquina/visual/proyecto).
  **10 herramientas despiertas por defecto, 18 con botón**
  (`POST /api/consejo/entidad`, estado persistido en
  `.cerebro-db/entidades.json`). Dormida responde CÓMO despertarla; especialista
  NO se duerme con toggle (quitar una voz al consejo es decisión de producto).
- **Quinta tarea del motor: `reflejo`** — `datos.entidad` (+`datos.frase` para
  especialistas o `datos.datos` para herramientas). Primitivas `entidad`/
  `reflejar` INYECTADAS desde server.ts: el motor no importa el reflejo (el
  ciclo chatOrders→consejo→cerebroReflejo→chatOrders solo cruza funciones
  diferidas, y aun así la composición se hace en el servidor). 12 tareas
  reflejo en paralelo: microsegundos cada una, el semáforo no las nota.
- **Conductor** (`POST /api/conductor`): consejo primero (≥0.8 → el neural ni
  se despierta), director local con UNA reparación (error exacto del validador
  de vuelta al modelo), fallback declarado con los motivos de ambos. Ningún
  JSON crudo del modelo toca el motor.
- **Purga de Node del bundle del navegador**: `consejo.ts` NO importa
  `node:os`/`node:crypto` (viaja al frontend vía chatOrders y rollup revienta);
  las 6 herramientas que miden el sistema reciben `configurarSistema()` desde
  server.ts y sin inyección responden «solo corro en el servidor» — declarado,
  nunca silencioso.
- **Regla de admisión** (de DISEÑO_MULTI_REFLEJOS §7, ya en el código): entidad
  nueva solo si su CONTRATO DE SALIDA es distinto; si no, se ensancha la tabla.
  Así 40 pueden ser 60 sin que el consejo se pise.
- **Docs entregadas**: `AGENTES_MANUAL.md` (uso, botón, conductor, hoja de ruta
  v2.6→v3.0 con costes honestos) y `.env.example` (credenciales: ninguna
  obligatoria; cada clave activa una mejora concreta).
- **Verificación**: `npm run validar` → **1021 comprobaciones · 0 fallos**
  (12 suites; nuevas: reflejo 76, agentico 42). Un test de v2.3 que congelaba
  «los CUATRO tipos» se corrigió a «conserva los de v2.3»: congelar la cuenta
  convierte un crecimiento legítimo en falsa alarma.
