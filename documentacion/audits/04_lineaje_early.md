# Auditoría 04 — Linaje temprano y "extras" del IDE CerebroNico (insumo para la fusión V8)

- **Auditor:** agente auditor de código (Accio).
- **Fecha de auditoría:** 2026-09-21.
- **Carpeta base auditada:** `/home/wuying/.accio/accounts/7096577584/agents/DID-82AD6B-8682AD6BU1787698-2006-1EE3D4/project/cerebronico_evolution`
- **Carpeta de archivos sueltos:** `/home/wuying/.accio/uploads`
- **Método:** listado recursivo, lectura directa de fuentes, `diff -rq`/`diff -u`, `grep` de símbolos y `md5sum` de binarios.
- **Convención de este informe:**
  - **[HECHO]** = verificado leyendo el archivo/ejecutando el comando (se cita archivo + línea).
  - **[INFERENCIA]** = deducción razonada a partir de evidencias indirectas (fechas, nombres, contenidos), no confirmada por el autor.

> Nota de alcance: este informe cubre SOLO los 4 "extras" pedidos (`extra_codigo0/`, `extra_fix_ollama/`, `agent-v2/`, `extra_pruebas_v232/`), los 4 archivos sueltos de `uploads/` y la línea de tiempo de nombres. Las versiones v1.0→v3.3.2 se tocan únicamente como referencia de fechas/nombres.

---

## 0. Resumen ejecutivo (lo esencial en 8 líneas)

1. **`extra_codigo0/` = "Codigo-0-v3"**: app **Next.js 16 + Tailwind 4 + shadcn + Prisma + dnd-kit + mdxeditor**, package `nextjs_tailwind_shadcn_ts@0.2.1`, fechas **2026-05-12 → 2026-08-26** [HECHO]. Es la rama de UI más "moderna" en stack web, pero **incompleta** (sin `prisma/schema.prisma`, sin lockfile, `next.config` con `ignoreBuildErrors:true`).
2. **Corrección importante:** los módulos que el dueño pedía buscar (`attachmentProcessor`, `syntaxEngine`, `languageMemory`, `contextCache`, `codeParser`) **NO están en `extra_codigo0/`**; están en **`agent-v2/ide/src/utils/`** [HECHO]. En Codigo-0-v3 lo equivalente es `src/lib/autoaprendizaje.ts` + `src/lib/automata-team.ts` (ambos declarados como adaptados de **Codeapp v2.3.2**).
3. **`extra_fix_ollama/`** y **`agent-v2/`** son **builds distintos del MISMO proyecto** (package `codigo-0-cerebronico@1.0.0`), ambos fechados **2026-09-10**; `fix_ollama` (05:39–07:36) es la variante temprana, `agent-v2/ide` (16:48–16:57) la posterior y más completa [HECHO].
4. **`agent-v2` = "CerebroNico IDE — Modo Agente PC (build 2.0)"**: añade el **Modo Agente PC** (`pc_*`) que conecta el chat con el puente Python `:5000` para actuar sobre la máquina real [HECHO, `ide/CHANGELOG.md:1`].
5. **`extra_pruebas_v232/` = pruebas de "Codeapp/CodeeApp v2.3.2"**, un **app ANTERIOR y DISTINTO** (Electron + Vite + React, autor Nicolas Quintero, 2026-08-22), **ancestro conceptual** de todo lo demás [HECHO + INFERENCIA].
6. Los **4 archivos sueltos de `uploads/`** son la **versión SIN endurecer** del puente `:5000` (`agent_bridge_5000.py` 201 líneas con `HOST="0.0.0.0"`) y su gemelo JS; el `MEMORANDUM-SEGURIDAD.md` de v2.3.2 documenta ese binding `0.0.0.0`+CORS `*`+sin token como **RCE crítico** [HECHO].
7. **Línea de nombres:** `Codeapp/CodeeApp` (v1.1→v2.3.2, ago-2026) → **`Codigo-0`** (may–ago 2026) → **`CerebroNico IDE`** (sep 2026) → **`Cerebronico`** (v1.x). El **nombre de paquete se mantiene `codigo-0-cerebronico`** desde entonces, aunque el nombre comercial cambió [HECHO].
8. **Confusión de numeración:** conviven **dos líneas de versión** (Codeapp v2.3.2 vs Cerebronico v1.0→v3.3.2) y el **semver real no coincide con el nombre de carpeta** (ej. `v3.3.2/…/package.json` dice `version: 1.3.2`) [HECHO]. Ver §6.

---

## 1. Codigo-0-v3 — carpeta `extra_codigo0/` (linaje MÁS ANTIGUO)

### 1.1 ¿Qué es? [HECHO]

`extra_codigo0/package.json:2-3`

```json
"name": "nextjs_tailwind_shadcn_ts",
"version": "0.2.1",
```

- Es una **app Next.js (App Router) + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + Prisma + dnd-kit + `@mdxeditor/editor`**. Dependencias relevantes en `extra_codigo0/package.json:15-81`: `@dnd-kit/core|sortable|utilities`, `@mdxeditor/editor ^3.39.1`, `@prisma/client ^6.11.1` + `prisma ^6.11.1`, `next ^16.1.1`, `react ^19.0.0`, `zustand ^5.0.6`, `react-syntax-highlighter`, `recharts`, `cmdk`, `z-ai-web-dev-sdk`, `next-auth`, `next-intl`, `react-markdown`.
- Es un **IDE de chat "Codigo-0"**: el system prompt por defecto dice literalmente *"Eres Codigo-0, un asistente experto en desarrollo de software…"* (`extra_codigo0/src/lib/ide-store.ts:424`) y el contexto persistente se titula *"# CEREBRO MD - Codigo-0"* (`ide-store.ts:439`).
- **[INFERENCIA]** El `package.json` conserva el nombre-genérico de plantilla (`nextjs_tailwind_shadcn_ts`) y `components.json:2` usa el estilo oficial de shadcn (`"new-york"`), lo que indica que **nació de un scaffolding shadcn/Next y fue personalizado**, no al revés.
- **[INFERENCIA]** El `Caddyfile:1-26` (reverse proxy `:81` → `:3000`, con `XTransformPort`) y `next.config.ts:5` (`allowedDevOrigins: [...space-z.ai]`) apuntan a un **entorno de desarrollo alojado (AI Studio / sandbox cloud)**, no a la PC local. Es coherente con que sea la copia "de laboratorio" del linaje.

### 1.2 Estructura de `src/` [HECHO]

```
extra_codigo0/
├─ Caddyfile, components.json, eslint.config.mjs, next.config.ts
├─ package.json, postcss.config.mjs, tailwind.config.ts, tsconfig.json
├─ public/
└─ src/                          (71 archivos en total)
   ├─ app/
   │  ├─ layout.tsx (34)  page.tsx (31)  globals.css
   │  └─ api/
   │     ├─ chat/route.ts (226)      ← streaming SSE ollama/gemini/openrouter
   │     ├─ sandbox/route.ts (150)   ← VFS / ejecución sandbox
   │     ├─ deliverables/route.ts (120)
   │     ├─ providers/route.ts (113) ← lista modelos por provider
   │     ├─ ram/route.ts (59)        ← límite de RAM
   │     └─ route.ts                 ← raíz/health
   ├─ components/
   │  ├─ ide/   TopBar(46) ChatArea(124) ChatInput(249) LeftPanel(386)
   │  │         RightPanel(328) LoadingScreen(291) ThinkingStream(71)
   │  └─ ui/    51 componentes shadcn (accordion, dialog, sidebar, sonner, …)
   ├─ hooks/    use-toast.ts (193)   use-mobile.ts (19)
   └─ lib/      utils.ts(6)  automata-team.ts(221)  ide-store.ts(593)
                db.ts(12)   autoaprendizaje.ts(376)
```

Líneas totales medidas de `src/` (lib+hooks+components/ide+app/api): **3.648 líneas** (sin contar los 51 `ui/*` de shadcn, que son boilerplate) [HECHO, `wc -l`].

### 1.3 Aclaración clave: los módulos `attachmentProcessor`/`syntaxEngine`/… NO están aquí [HECHO]

Búsqueda explícita por nombre en toda la carpeta de evolución:

- `find … -iname "attachment*" -o -iname "syntax*" -o -iname "languageMemory*" -o -iname "contextCache*" -o -iname "codeParser*" -o -iname "fileParser*"` → los únicos hits son en **`agent-v2/ide/src/utils/`** (y un `syntaxGuard.ts` en `v1.0/`).
- `grep -rniE "attachmentProcessor|syntaxEngine|languageMemory|contextCache|codeParser"` → **0 coincidencias** dentro de `extra_codigo0/`.

**Conclusión [HECHO]:** en `extra_codigo0/` NO existen esos módulos. El procesamiento de adjuntos de Codigo-0-v3 se resuelve de forma **inline** y mucho más rudimentaria (ver §1.4.6). Los módulos "de motor" con esos nombres son aportación de **agent-v2 / v3.3.2**, NO de Codigo-0-v3. Si V8 esperaba "rescatar attachmentProcessor de codigo0", **esa premisa es falsa y debe corregirse**.

### 1.4 Módulos realmente reutilizables de `extra_codigo0/` (API + tamaño + estado)

#### 1.4.1 `src/lib/ide-store.ts` — 593 líneas — **reutilizable (ALTO)**
Store global **Zustand** (`export const useIdeStore = create<IdeStoreState>(…)`, línea 238). Cubre:
- **Sesiones de chat**: `newChat/deleteChat/renameChat/switchChat/exportChat/initDefaultChat` (líneas 243-328). Export a texto plano con marca de tiempo en locale `es-UY` (línea 313).
- **Mensajes + streaming**: `sendMessage`, `updateLastAssistantMessage`, `isGenerating` (líneas 336-376).
- **Modalidades**: `auto|rapido|ingeniero|profundo` con prompts inyectados (`MODALITY_PROMPTS`, líneas 121-126).
- **Providers** `ollama|gemini|openrouter` con config/modelos (líneas 398-409).
- **Ajustes**: `maxRamMB`, `temperature`, `maxTokens`, `systemPrompt`, `autoScroll` (417-435).
- **Cerebro MD + subagentes**: contenido, `memoriaMd`, CRUD de subagentes (437-481).
- **Autoaprendizaje**: puente con `autoaprendizaje.ts` (483-542).
- **Adjuntos**: `attachedFiles`, `maxFiles = 50`, `addFile` (544-555).
- **`getFullSystemPrompt(userQuery)`** (línea 562): ensambla system prompt + Cerebro MD + últimas 30 líneas de Memoria MD + subagentes + autoaprendizaje + modalidad. **Es el ensamblador de contexto más completo de los extras.**
- **Estado:** **completo y compilable en apariencia** (`'use client'`, imports resueltos a `./autoaprendizaje` y `zustand`/`uuid`). No hay imports rotos.
- **Valor V8 [INFERENCIA]:** su patrón de "contexto ensamblado desde Cerebro+Memoria+subagentes+modalidad" es **directamente portable** como capa de prompt en V8.

#### 1.4.2 `src/lib/autoaprendizaje.ts` — 376 líneas — **reutilizable (ALTO)**
Motor de **memoria auto-evolutiva** puro TS (sin dependencias). Encabezado `// AUTOAPRENDIZAJE — Sistema de memoria auto-evolutiva para Codigo-0` y línea 3: *"Inspirado en Codeapp v2.3.2 MemoryManager, adaptado a Next.js + Zustand."* [HECHO].
- Tipos de aprendizaje: `rule | fact | lesson | pattern | preference` (línea 12).
- API pública: `extractExplicitLearnings`, `detectPreferences`, `detectCorrections`, `detectCodePatterns`, `isDuplicate`, `recall(query,entries,limit)`, `buildLearningContext`, `persistLearnings`, `loadLearnings`, `clearAllLearnings`, `getLearningStats`, `KIND_LABELS`, `SOURCE_LABELS` (líneas 109-376).
- Persistencia: `localStorage` clave `codigo0_autoaprendizaje`, tope `MAX_ENTRIES=200` / `MAX_CONTEXT_BYTES=4000` (líneas 50-52).
- Scoring: keyword-match + recencia + frecuencia + peso por tipo (líneas 72-99).
- **Estado:** completo, autocontenido, sin imports externos → **portable casi 1:1**.
- **Valor V8 [INFERENCIA]:** candidato directo como capa de "memoria/aprendizaje" del IDE, ya que agent-v2 tiene un `memory.ts` (193 líneas) más básico; este es más rico en heurísticas.

#### 1.4.3 `src/lib/automata-team.ts` — 221 líneas — **reutilizable (ALTO)**
**Equipo de 11 autómatas/sub-agentes** con `id, name, role, category, description, functions[], prompt, accent` (líneas 22-197): Analista, Arquitecto, Frontend, Backend, Fullstack, Tester QA, Seguridad, Optimizador, DevOps, Documentador, Datos. Encabezado línea 5: *"Adaptado de Codeapp v2.3.2 automataTeam.ts"* [HECHO].
- API: `groupByCategory()` (línea 200), `buildTeamContext()` (línea 211) produce un bloque compacto para inyectar al system prompt.
- **Estado:** completo, sin dependencias → **portable 1:1**.
- **Valor V8 [INFERENCIA]:** los `prompt` de cada autómata (p.ej. Fullstack exige "un bloque `file=\"ruta\"` por archivo") son **compatibles con el parser de bloques `codeParser.ts`** de agent-v2 → buena sinergia de fusión.

#### 1.4.4 `src/lib/db.ts` — 12 líneas — **NO reutilizable / sospechoso de roto (NULO)**
`import { PrismaClient } from '@prisma/client'` + singleton (líneas 1-13). **[HECHO] No existe `prisma/schema.prisma`** en la carpeta (búsqueda `-iname "*.prisma"` → 0 resultados). `package.json:10-13` define scripts `db:push/db:generate/db:migrate` pero sin esquema.
- **Estado [INFERENCIA]:** `db.ts` es **código muerto / no ejecutable** tal cual (fallaría al generar el cliente). No hay ningún otro archivo confirmado que lo importe.

#### 1.4.5 `src/lib/utils.ts` (6) + hooks `use-toast.ts` (193) / `use-mobile.ts` (19) — **boilerplate (BAJO/NULO)**
`utils.ts` es el clásico `cn()` de shadcn; los hooks son los estándar de shadcn. Sin valor diferencial.

#### 1.4.6 `src/components/ide/ChatInput.tsx` — 249 líneas — **procesador de adjuntos rudimentario (MEDIO)**
- Selector de archivos con `FileReader.readAsDataURL` y concatenación inline: `data: (reader.result as string).split(',')[1] || ''` (`ChatInput.tsx:56-60`) [HECHO].
- **No hay extracción de texto** (ni PDF/DOCX/RTF): los adjuntos se guardan como **base64 crudo**. `MessageFile{ name,size,type,data }` (`ide-store.ts:22-27`).
- Iconos por tipo, `formatSize`, auto-resize del textarea, selector de modalidad (`MODALITIES`, líneas 17-22).
- **Estado:** compila; funcional pero **sin parseo de contenido**.
- **Valor V8 (MEDIO) [INFERENCIA]:** la UI de adjuntos (chips, límite 50, dedupe por nombre en `addFile`) es reusable; el **pipeline de extracción debe tomarse de `agent-v2/ide/src/utils/attachmentProcessor.ts`, no de aquí**.

#### 1.4.7 `src/app/api/chat/route.ts` — 226 líneas — **MEDIO**
Route handler Next.js que **streamea SSE** hacia `ollama|gemini|openrouter`; `DEFAULT_OLLAMA_URL='http://localhost:11434'` (línea 34), valida `messages` no vacío (líneas 55-60), acepta `files?: ChatFile[]`, `maxRamMB` [HECHO]. **Estado:** aparentemente completo.
- **Valor V8 [INFERENCIA]:** lógica de provider multiplexada reutilizable, pero V8 (Vite/Express, según v1.x–v3.3.2) usa `server.ts`, no Next route handlers → **portar la lógica, no el archivo**.

#### 1.4.8 Resto de `app/api/*` y `app/*` — **BAJO**
`sandbox/route.ts` (150), `deliverables/route.ts` (120), `providers/route.ts` (113), `ram/route.ts` (59), `route.ts`; `page.tsx` (31) monta `LeftPanel/TopBar/ChatArea/ChatInput/RightPanel` + `LoadingScreen`; `layout.tsx` (34). Son pegamento de UI/API específico de Next.

#### 1.4.9 Config — **riesgo (NULO para reuso, ALTO como señal)**
- `next.config.ts:5-8`: `typescript.ignoreBuildErrors: true` y `reactStrictMode:false` → **enmascara errores de tipo**.
- No hay `package-lock.json`/`bun.lock` (a diferencia de agent-v2/fix_ollama) → **build no reproducible**.
- `Caddyfile`: proxy cloud.

### 1.5 Veredicto Codigo-0-v3 [INFERENCIA]
- **Qué es:** un "re-skin" de IDE-chat en stack Next 16 + shadcn, con dos aportes propios **valiosos** (`ide-store.ts`, `autoaprendizaje.ts`, `automata-team.ts`) y mucha **UI de plantilla** + **API de Next** no portable al stack Vite/Express de las versiones posteriores.
- **Estado global:** **parcialmente funcional**; `db.ts` roto por falta de esquema Prisma; sin lockfile; `ignoreBuildErrors` activo.
- **A rescatar en V8:** los 3 archivos `lib/` (contexto/memoria/autómatas) y, con reservas, la UI de `components/ide/`. **No** rescatar `db.ts`, `app/api/*` de Next ni los 51 `ui/*`.

---

## 2. fix-ollama — carpeta `extra_fix_ollama/` (2026-09-10)

### 2.1 Contenido [HECHO]
```
extra_fix_ollama/
├─ README.md (542 bytes)        ← README de plantilla (ver 2.2)
├─ agent_bridge_5000.py (201)   ← puente :5000 (HOST=127.0.0.1)
├─ server.ts (1385)
├─ index.html, metadata.json, tsconfig.json, vite.config.ts
├─ package.json / package-lock.json / bun.lock
└─ src/   (App.tsx, components/*, types.ts, utils/engine.ts, …)
```
- `package.json:2-4` → `name: "codigo-0-cerebronico"`, `private:true`, `version: "1.0.0"`, `type:"module"`.
- `.env.example:1-10` → *"Codigo-0 CerebroNico IDE"*; puertos **3000** (UI), **5000** (workers/FFmpeg/video stream), **11434** (Ollama); `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `CUSTOM_SERVER_URL`.
- Fechas de archivos: **2026-09-10, 05:39 → 07:36** (`ls -l`: README/bridge 05:39–05:44, `server.ts`/`package-lock` 07:36) [HECHO].

### 2.2 README.md — es el README genérico de AI Studio, NO documenta el fix [HECHO]
`extra_fix_ollama/README.md:1-21` completo:
```
# Run and deploy your AI Studio app
This contains everything you need to run your app locally.
View your app in AI Studio: https://ai.studio/apps/eea69c96-5d84-4325-9259-d833411b6a7b
## Run Locally
Prerequisites: Node.js
1. Install dependencies: npm install
2. Set the GEMINI_API_KEY in .env.local to your Gemini API key
3. Run the app: npm run dev
```
**Hallazgo:** el README de `fix-ollama` **no explica la corrección**. El "fix" no está documentado aquí; **[INFERENCIA]** el nombre `Codigo-CerebroNico-IDE-fix-ollama.zip` (origen del extract) indica que la corrección era sobre la **conexión con Ollama**, y debe localizarse por *diff* con `agent-v2/ide/` (siguiente apartado). Como el README es de AI Studio, también **[INFERENCIA]** el paquete pasó por el entorno `space-z.ai`/AI Studio (mismo banner que usarán los README de `agent-v2`).

### 2.3 Qué corrige respecto a `agent-v2/ide` — `diff -rq` [HECHO]

```
$ diff -rq extra_fix_ollama agent-v2/ide
Only in agent-v2/ide: .gitignore
Only in agent-v2/ide: CHANGELOG.md
Files …/README.md differ
Files …/agent_bridge_5000.py differ
Only in agent-v2/ide: iniciar_todo_windows.bat
Only in agent-v2/ide: limpiar_ollama_windows.bat
Files …/package-lock.json differ
Files …/package.json differ
Files …/server.ts differ
Files …/src/App.tsx differ
Files …/src/components/ChatCenter.tsx differ
Files …/src/components/LeftSidebar.tsx differ
Files …/src/components/ModelSelectorModal.tsx differ
Files …/src/types.ts differ
Files …/src/utils/engine.ts differ
Only in agent-v2/ide: tests
```
Lectura:
- `extra_fix_ollama/` es la **variante ANTERIOR**: NO tiene `tests/`, NI `CHANGELOG.md`, NI los `.bat` de arranque/limpieza de Ollama, NI `.gitignore`.
- `agent-v2/ide/` sí los tiene → `agent-v2` es **posterior y más completo** (ver §3).
- **`fix-ollama` NO es "más nuevo que agent-v2"; es el eslabón previo** del mismo build (05:39–07:36 vs 16:48–16:57 del 2026-09-10) [HECHO por timestamps].

### 2.4 Diferencia concreta en el puente `:5000` [HECHO]

`diff -u extra_fix_ollama/agent_bridge_5000.py agent-v2/ide/agent_bridge_5000.py`:
- `extra_fix_ollama/agent_bridge_5000.py` (201 líneas): `HOST = os.environ.get("HOST", "127.0.0.1")`.
- `agent-v2/ide/agent_bridge_5000.py` (473 líneas): **+272 líneas** con:
  - Banner con instrucciones Linux/Mac y aviso *"El servidor se auto-arranca desde server.ts (CerebroNico)… Si Python no está disponible, el server sigue funcionando sin el puente."*
  - **Fix crítico de arranque** (documentado en comentario): forzar **UTF-8 en stdout/stderr** porque Windows usa CP1252 y los emojis `🐍 ⚡ 📡` provocaban `UnicodeEncodeError` → *"el puente crasheaba al arranque y nunca quedaba escuchando"*.
  - `ThreadingMixIn` (servidor multi-hilo).
  - Utilidades PC: `resolve_pc_path()` (atajos `Desktop/`,`Documents/`,`Downloads/`,`~`), `_probe()`, `get_pc_info()`, `get_subagents()`.
  - **Endpoints nuevos** (grep `url_path` sobre agent-v2): `GET /api/pc|/api/pc/info`, `GET /api/subagents`, `POST /api/fs/write`, `/api/fs/read`, `/api/fs/list`, `/api/fs/delete`.
- **[INFERENCIA]** El "fix-ollama" del nombre probablemente = endurecer el binding a `127.0.0.1` + arreglar arranque; el salto completo (PC tools + UTF-8 + threading) llegó en `agent-v2/ide`.

### 2.5 Comparación del puente con el documentado en v3.3.2 [HECHO]
- `v3.3.2/ide/backend/agent_bridge_5000.py` = **474 líneas**, con los MISMOS endpoints (`/api/pc/info`, `/api/subagents`, `/api/fs/*`, `/api/exec`, `/api/python`) y `HOST=127.0.0.1` (línea 32).
- Es decir, **el puente que documenta v3.3.2 ES el puente de `agent-v2` (versión endurecida + PC)**, no el de `fix_ollama`. **[HECHO, comparación de endpoints/líneas]**
- `v3.3.2/ide/MEMORANDUM.md:32` confirma: `| 5000 | Puente PC (agent_bridge_5000.py o CerebroNicoAgent.exe) | Sonda automática python → python3 → EXE |`.

### 2.6 `server.ts` [HECHO]
- `extra_fix_ollama/server.ts` = **1.385 líneas**; `agent-v2/ide/server.ts` = **1.908 líneas**. `diff` entre ambos arroja **1.003 líneas de diferencia** (`<`/`>`), i.e. **el 72% del archivo cambió**; confirma que `agent-v2` reescribió/extendió el backend (probablemente el "Modo Agente PC" + `StreamContext`).

---

## 3. agent-v2 — carpeta `agent-v2/` (2026-09-10)

### 3.1 ¿Qué es "CerebroNico-IDE-agent-v2"? [HECHO]
- Estructura raíz: `agent-v2/CHANGELOG.md` + `agent-v2/ide/`.
- `agent-v2/ide/package.json:2-4` → `name: "codigo-0-cerebronico"`, `version: "1.0.0"`.
- `agent-v2/ide/README.md:5-16`: *"# CerebroNico IDE — IDE de alto rendimiento para ingeniería de software autónomo con inferencia local (Ollama) y aceleración en la nube (Gemini, OpenRouter, servidores OpenAI compatibles)."* Puertos: **3000** UI+API Express (`server.ts`), **5000** puente Python (`agent_bridge_5000.py`, se auto-inicia), **11434** Ollama.
- `agent-v2/ide/CHANGELOG.md:1` = `agent-v2/CHANGELOG.md:1` = **"# CerebroNico IDE — Modo Agente PC (build 2.0)"** (archivos idénticos, 88 líneas) [HECHO].
- **[HECHO] Sí, es el "Modo Agente"**: el CHANGELOG describe exactamente el salto *"Antes, el chat del IDE solo hablaba… no podía hacer nada real en tu PC"* → *"Ahora el chat está conectado de verdad al agente 5000 mediante un nuevo Modo Agente PC"* (`CHANGELOG.md:3-14`).
- **[INFERENCIA]** El "build 2.0" del CHANGELOG es una **numeración interna del build**, distinta de la carpeta `v2.0/` de evolución (que es "CerebroNico-IDE-v2.0 (hibrido3)") → fuente de la confusión de numeración (§6).

### 3.2 Estructura de `src/` — 14 `.ts` + 9 `.tsx` [HECHO]

`agent-v2/ide/` contiene 40 archivos. Bajo `src/`:

| Archivo | Líneas | Rol |
|---|---:|---|
| `src/App.tsx` | 1209 | Shell de la app, estado global, `pcMode` persistido, fetch subagentes |
| `src/main.tsx` | 70 | Entrada React |
| `src/types.ts` | 112 | Tipos (`StreamConfig`, `SubagentItem`, `WorkspaceFile`, `AttachmentItem`…) |
| `src/vite-env.d.ts` | 1 | Referencia de tipos Vite |
| `src/utils/engine.ts` | 757 | **Motor de streaming** (`HighPerformanceAIStreamer`, `StreamConfig`, `StreamCallbacks`, `repairNumberedListsAndGaps`) |
| `src/utils/attachmentProcessor.ts` | 592 | **Procesador de adjuntos** (DOCX/RTF/PDF/binario) |
| `src/utils/contextCache.ts` | 193 | **Caché de contexto** (idioma, modos experto, MEMORIA/SKILLS por defecto) |
| `src/utils/memory.ts` | 193 | Reglas de memoria (`BASE_MEMORY_RULES`, `buildSystemPrompt`) |
| `src/utils/syntaxEngine.ts` | 193 | **Resaltado de código** (Prism) + plantillas por lenguaje |
| `src/utils/languageMemory.ts` | 188 | **Memoria lingüística** (jerga→intención, 12 categorías) |
| `src/utils/fileParser.ts` | 144 | Empaquetado ZIP de workspace + descarga |
| `src/utils/codeParser.ts` | 96 | **Parser de bloques de código** → archivos |
| `src/components/ChatCenter.tsx` | 633 | Área de chat + toggle "Agente PC" |
| `src/components/RightSidebar.tsx` | 722 | Panel derecho |
| `src/components/LeftSidebar.tsx` | 840 | Panel izquierdo + sección **Subagentes** |
| `src/components/ModelSelectorModal.tsx` | 503 | Selector de modelo |
| `src/components/CodeEditor.tsx` | 428 | Editor |
| `src/components/ApiKeyModal.tsx` | 292 | Claves cloud |
| `src/components/Header.tsx` | 229 | Cabecera |
| `src/data/skills100.ts` | 835 | Catálogo de 100 skills |
| `src/data/skills50.ts` | 417 | Catálogo de 50 skills |

Total `src/` ≈ **8.647 líneas** [HECHO, `wc -l`]. Cuenta de tipos: **14 archivos `.ts`** (incl. `types.ts`, `vite-env.d.ts`, 7 utils, 2 data, …) y **9 `.tsx`** (App, main, 7 components) [HECHO].

### 3.3 Módulos reutilizables clave (los "buscados") [HECHO]

- **`attachmentProcessor.ts` (592)** — procesador de adjuntos **multi-formato**:
  - `extractTextFromWordXml()` (línea 12) → DOCX vía `<w:t>`/`<w:p>` (DOMParser + fallback regex).
  - `extractTextFromRtf()` (línea 56) → RTF con decodificación `\'xx` (acentos españoles) y `\u-xxxx?`.
  - `extractTextFromPdf()` (línea 113) → PDF vía `pdfjs-dist` (worker Vite `?url`).
  - `isBinaryData()` (136), `extractReadableStrings()` (166).
  - Guardas de nombre: `isImageFileName` (196), `isZipFileName` (203), `isDocxFileName` (210), `isTextFileName` (217).
  - **API pública principal:** `processUploadedFile(file: File)` (línea 257).
- **`syntaxEngine.ts` (193)** — `SUPPORTED_LANGUAGES` (línea 26; TS/JS/Python/JSON/MD/CSS/YAML/Rust/Go/C/C++ con `prismKey`+`snippetTemplate`), `detectLanguageFromPath()` (116), `highlightCode()` (133), `escapeHtml()` (148), `formatCodeAuto()` (160). Importa 16 gramáticas Prism (líneas 1-16).
- **`codeParser.ts` (96)** — `extractCodeBlocksFromMessage(markdown)` (12): regex de ```lang file="ruta"``` y detección de ruta por comentario en 1ª línea; `mergeExtractedFiles(currentFiles, blocks)` (53) → `{updatedFiles, createdCount, updatedCount}`. **Es el puente entre la salida del LLM y el VFS.**
- **`contextCache.ts` (193)** — `RESPONSE_LANGUAGES` (es/en/pt/fr/de/it, línea 4), `getResponseLanguageDirective` (13), `EXPERT_MODES` (19: general/legal/médico/fraude/docs/código), `buildExpertDirective` (28), `DEFAULT_MEMORIA_MD` (45), `DEFAULT_SKILLS_MD` (62: "Catálogo de 100 Habilidades"), `buildContextCachePayload()` (89). **Es el armador del "contexto base" del IDE.**
- **`languageMemory.ts` (188)** — 12 categorías (`idiomatic`, `semantic_map`, `correction`, `pattern`, `technical_term`, `context_clue`, `ambiguity`, `intent`, `syntactic_bridge`, `multi_agent_intent`, `telemetry_cue`, `architecture_cue`), `SEED_LANGUAGE_MEMORIES` (29) que traduce jerga ("hazlo/ármalo/cóselo" → `generate_full_code_and_files`; "púlelo" → `refactor_clean_ui_and_optimize`). Persistencia `localStorage` clave `codigo0_language_memory_entries` (27). **Diferencial de este linaje: memoria de jerga en español.**
- **`fileParser.ts` (144)** — `generateProjectZip(files)` (7) con JSZip, `triggerFileDownload(blob, filename)` (135). ⚠️ **Ojo:** en la línea 74 aparece `export default defineConfig({…})` (un `vite.config` embebido), **resto/artefacto de copia** — revisar antes de portar.
- **`engine.ts` (757)** — `StreamConfig` (3), `StreamCallbacks` (17), `repairNumberedListsAndGaps()` (49), `class HighPerformanceAIStreamer` (165). Es el corazón del streaming.

### 3.4 `tests/` [HECHO]
`agent-v2/ide/tests/`:
- `comprehensive_e2e_test.py` (976 líneas): verifica `/api/ai/stream` de los **4 providers** (Ollama, Gemini, OpenRouter, Custom) con mocks, usando 3 métodos (curl `--no-buffer`, fetch nativo Node, `http.client` de Python) **+ test de regresión** que reproduce el bug antiguo `req.on("close")` (`tests/comprehensive_e2e_test.py:1-14`). Puerto de mocks >8000 por el "bad port" de undici (35-39).
- `mock_ollama.py`.
- `package.json:11` → `"test:e2e": "python3 tests/comprehensive_e2e_test.py"`.
- `README.md:65-78` documenta `OVERALL: ALL PASS` con 8 tests: `ollama_short, ollama_long, openrouter, custom_provider, gemini_fallback, python_bridge, regression_old_bug, regression_new_code`.

### 3.5 Backend `server.ts` y puente [HECHO]
- `agent-v2/ide/server.ts` = **1.908 líneas**: implementa `/api/ai/stream` (SSE) con `StreamContext`, `sendChunk/sendDone/sendError/sendTaskEvent`, abort por `res.on("close")`, watchdog de 8 min, reintentos 3× con backoff (408/425/429/500/502/503/504), `pipeOpenAICompatibleStream()`, auto-arranque del puente y `/api/subagents` (`README.md:51-63`).
- `agent-v2/ide/agent_bridge_5000.py` = **473 líneas** (puente endurecido + PC tools, §2.4).
- Scripts Windows: `iniciar_todo_windows.bat`, `limpiar_ollama_windows.bat`.

### 3.6 Veredicto agent-v2 [INFERENCIA]
- **Es la build más madura y "portable" del linaje local**: mismo stack Vite+Express+React que v1.x→v3.3.2, con utils modularizados, tests e2e y Modo Agente PC. **Es el mejor candidato como base de la fusión V8**, más que Codigo-0-v3 (Next).
- **Basura a evitar:** `fileParser.ts:74` (vite.config embebido) y la duplicación `CHANGELOG==README` (ambos = "Modo Agente PC build 2.0").

---

## 4. PRUEBAS V2.3.2 — carpeta `extra_pruebas_v232/` (2026-09-21)

### 4.1 Qué contiene [HECHO]
Ruta raíz: `extra_pruebas_v232/PRUEVAS V2.3.2 PARA PROYECTO/` — **92 entradas**, compuesta por:
- **`workspaces/`** — 7 subcarpetas de proyecto generado + `zips/`:
  - `476bd5b6-mt7jl46a`, `0f3e46c7-mt7jjj0o`, `89eb740e-mt7jn1l6`, `0ac0aa06-mt7jii2t` (plantilla `web-react`)
  - `159dbe5f-mt7jffqw` (plantilla `python-cli`)
  - `824e9a2b-mt7jk9xk` (plantilla `api-express`)
  - `workspaces/zips/159dbe5f-mt7jffqw.zip` (3604 bytes)
- **Documentos de la app Codeapp/CodeeApp v2.3.2**: `CODIGO-CODEEAPP-2.3.2.md` (**608 KB**), `MEMORANDUM-SEGURIDAD.md` (9,8 KB), `RE-EVOLUCION-CODEEAPP.md` (18,5 KB), `PRUEVA CHAT  V2.3.2.rtf` (55 KB), y el `.zip` maestro (`PRUEVAS V2.3.2 PARA PROYECTO.zip`, 3,1 MB; `ZIPS.zip`, 6,1 MB).
- **9 capturas JPG** (evidencia visual): `v2.3.2.jpg`, `AUTOMATA V2.3.2.jpg`, `EQUIPO DE AUTOMATAS Y CAPTURA.jpg`, `HERRAMIENTAS.jpg`, `PESTAÑA DE HERRAMIENTAS.jpg`, `SKILLS.jpg`, `EXTENCIONES.jpg`, `RAM 1.jpg`, `RAM 2.jpg`, `Reformas V2.3.2.jpg`, `Reformas 2- V2.3.2.jpg`, `reinicio del chat v2.3.2.jpg`, `diferentes tareas en linea para app.jpg`.

### 4.2 Samples representativos (2–3) [HECHO]

**(a) Job `476bd5b6` — plantilla `web-react`, generado por la IA a partir de un autómata "Fullstack".**
- `workspaces/476bd5b6-mt7jl46a/manifest.json` → `"idea": "Actúa como Fullstack: genera una aplicación completa de punta a punta (frontend + backend + base de datos)… [AUTÓMATA: Fullstack]"`, `"template": "web-react"`, 7 archivos, `"status": "writing"`, `createdAt: 1787594458978` (epoch ms → **2026-08-24**).
- `MEMORIA.md` (línea 2): *"> 📌 Codeapp v2.3 · creado por Nicolas Quintero"*; `_Generado: 2026-08-24T18:00:58.978Z_`.
- `src/App.tsx:4`: literal *"⚡ App generada por Codeapp v2.1"* y `:7` *"pipeline: plan → programador → revisor → build → zip → dev server"*.
- `code-map.json` → índice `{file, imports, exports}` para 3 archivos (`src/App.tsx`, `src/main.tsx`, `vite.config.ts`), `"total": 3`.
- `package.json` → `"name": "generated-web-app"`, React 19 + Vite 6 + Tailwind 4.

**(b) Job `159dbe5f` — plantilla `python-cli`, es el "pedido de evolución" del IDE.**
- `manifest.json` → `"idea"` = un **brief largo en español** que pide: chat con adjuntar 50 archivos, botón de modalidad (automático/rápido/ingeniero/pensamiento profundo), **Cerebro MD** con archivos y auto-organización por autómata, etc. — es, en la práctica, **el origen funcional del IDE que hoy es V8**.
- `main.py` → *"Script generado por Codeapp v2.1"*, imprime "Hola, mundo! Generado por agentes en segundo plano."

**(c) Job `824e9a2b` — plantilla `api-express`.**
- `manifest.json` → `[AUTÓMATA: Backend]`, `"template": "api-express"`.
- `server.js` → Express + cors con `/api/health` y `/api/hello`, *"Hola desde la API generada por Codeapp v2.1"*.

**Nota (evidencia de mezcla de versiones) [HECHO]:** dentro del MISMO paquete "V2.3.2", el código generado se auto-rotula **"Codeapp v2.1"** (App.tsx, main.py, server.js) y la `MEMORIA.md` dice **"Codeapp v2.3"**; solo los documentos externos dicen **"v2.3.2"**. → **la numeración es inconsistente dentro del propio proyecto.**

### 4.3 ¿Qué versión "V2.3.2" es? — con INFERENCIA explícita

- **[HECHO]** Los docs están firmados *"Creado por Nicolas Quintero · v2.3.2 · 2026-08-22"* (`CODIGO-CODEEAPP-2.3.2.md:1,3-4`; `RE-EVOLUCION-CODEEAPP.md:3`).
- **[HECHO]** `CODIGO-CODEEAPP-2.3.2.md` se declara *"réplica 1:1"* del proyecto real, **"81 archivos · 14.223 líneas"**, con `server.ts` (404), `ai.ts` (307), `electron/services.cjs` (169), scripts `electron:build`/`electron-builder --win nsis` → es un **IDE de escritorio Electron + Vite + React**.
- **[HECHO]** `MEMORANDUM-SEGURIDAD.md:146` se titula **"Codeapp v2.3.1 (hardening)"** y documenta el puente `agent_bridge_5000.py`/`.cjs` con `HOST=0.0.0.0` + CORS `*` + sin token = RCE crítico, "Corregido".
- **[INFERENCIA]** **"V2.3.2" NO pertenece a la línea de carpetas de `cerebronico_evolution`** (v1.0→v3.3.2). Es una **línea paralela y anterior**, la de la app **Codeapp/CodeeApp** (evolución interna v1.1 → v2.0 → v2.1 → v2.3 → v2.3.1 → v2.3.2, ago-2026). Por eso no aparece su código fuente entre las carpetas de evolución: solo llegaron sus **pruebas, capturas, memorándum y el volcado `CODIGO-CODEEAPP-2.3.2.md`**.
- **[INFERENCIA]** Codeapp v2.3.2 es el **ancestro conceptual directo** de todo el IDE CerebroNico: (i) `autoaprendizaje.ts` dice "Inspirado en Codeapp v2.3.2 MemoryManager"; (ii) `automata-team.ts` dice "Adaptado de Codeapp v2.3.2 automataTeam.ts"; (iii) el brief del job `159dbe5f` describe el mismo producto. **Codeapp = nombre previo del producto antes de renombrarlo "Codigo-0"/"CerebroNico".**

### 4.4 `PRUEVA CHAT V2.3.2.rtf` — resultados de las pruebas de chat [HECHO]
- `prueva_chat_codigo-0_v2_3_2.md` (el suelto de `uploads/`, 149 líneas) es su versión en texto. Transcripción de una sesión **2:47 p.m. → 3:32 p.m.** con `stablelm2`:
  - 2:47 *"comenzamos la prueba responde stablelm2"* → respuesta **vacía**.
  - 3:13 *"tu"* → el modelo **repite en bucle** *"estudia el proceso de procesamiento de datos…"* ×7.
  - 3:19–3:30 respuestas incoherentes/repetidas: *"¡Hola! ¿Cómo puedo ayudarte hoy?"*, *"No, no, no…"*, *"¿Qué?"*, *"Asistente: ¿Qué?"*.
  - 3:28–3:32 el usuario pide crear una app Windows con chatbot local Ollama y el modelo **no responde / repite**.
- **Interpretación [HECHO]:** el documento es **evidencia de un FALLO del motor de chat** (bucle/degeneración de `stablelm2` o del pipeline de streaming), registrado por el dueño. Es la razón de las capturas "reinicio del chat v2.3.2".

---

## 5. Archivos sueltos de `/home/wuying/.accio/uploads/`

### 5.1 `agent_bridge_5000.py` — 201 líneas — puente shell + Python [HECHO]

Archivo autónomo (sin dependencias), docstring: *"Servidor Agente SuperCodeApp de Ejecución Local & Python (Puerto 5000). 100% Python nativo (sin dependencias externas). Compatible con Python 3.8…3.14+."* (`uploads/agent_bridge_5000.py:2-8`). Basado en `http.server`/`socketserver`.

**Endpoints completos:**
| Método | Ruta | Línea | Función |
|---|---|---|---|
| GET | `/`, `/status`, `/health`, `/api/status`, `/api/health` | 42-56 | Health: `status`, `agent`, `runtime`, `pythonSupport`, `pcAccess`, `port`, `uptime`, `timestamp` |
| GET | `/api/ollama-tags`, `/api/ollama/tags` | 59-70 | **Proxy** a `127.0.0.1:11434/api/tags` (proxy CORS) |
| POST | `/api/agent`, `/api/generate` | 86-103 | Si trae `command` → ejecuta; si no, respuesta simulada |
| POST | `/api/exec` | 106-116 | **Shell exec** (CMD/PowerShell/Bash) |
| POST | `/api/python` | 119-141 | **Ejecución de código Python**: escribe `temp_exec_<ms>.py` en `os.getcwd()`, lo lanza con `sys.executable`, y lo borra en `finally` |

- Motor de ejecución `_run_command()` (146-172): `subprocess.run(command, shell=True, capture_output=True, timeout=30)`; devuelve `{success, content, output, error, returncode}`.
- Arranque `run_server()` (178-201): `TCPServer.allow_reuse_address`, mensajes con emojis, manejo de `Address already in use` (winerror 10048) con instrucciones `netstat/taskkill`.

**Validaciones:** solo comprueba **presencia** de `command`/`code` (400 si vacío: líneas 108-111, 121-124). **NO valida tipo/longitud**, ni rutas, ni caracteres peligrosos. `json.loads` protegido con try/except (80-83).

**Seguridad (crítico) [HECHO]:**
- `HOST = "0.0.0.0"` (línea 21) → **escucha en TODAS las interfaces**.
- `Access-Control-Allow-Origin: *` + `Access-Control-Allow-Private-Network: true` (líneas 28, 31) → **cualquier página web** puede invocarlo.
- `Access-Control-Allow-Headers: *` (30).
- **CERO autenticación/token** en `/api/exec`, `/api/agent`, `/api/python`.
- **Sin sandboxing**: `shell=True`, sin lista blanca de comandos, sin límite de tamaño, `timeout=30` como única barrera. Escritura del `.py` temporal en el CWD del proceso.
- ➜ **Es la versión EXACTAMENTE descrita como vulnerabilidad #1 en `MEMORANDUM-SEGURIDAD.md` (RCE sin autenticación en la LAN).** [HECHO: coincidencia de `HOST=0.0.0.0`, CORS `*`, sin token]

**Relación con el puente `:5000` de v3.3.2 [HECHO]:** el suelto de `uploads/` es **dos generaciones ANTERIOR** al de v3.3.2/agent-v2. Diferencias:
| Aspecto | `uploads/` (v2.3.2-era) | `agent-v2` / `v3.3.2` |
|---|---|---|
| Líneas | 201 | 473 / 474 |
| `HOST` | `0.0.0.0` | `127.0.0.1` |
| Token/Bearer | ❌ ninguno | ✅ (según `MEMORANDUM-SEGURIDAD.md:186`) |
| Endpoints PC | ❌ | ✅ `/api/pc/info`, `/api/fs/*`, `/api/subagents` |
| UTF-8 Windows | ❌ (crash por emojis) | ✅ fix en agent-v2 |
| Threading | single (TCPServer) | `ThreadingMixIn` |

### 5.2 `agent_bridge_5000.js` — 188 líneas — versión JS del puente [HECHO]

Sí, es el **gemelo en Node.js puro** (`http` + `child_process.exec` + `fs` + `path`) del `.py`. Cabecera: *"Servidor Agente SuperCodeApp de Ejecución Local / Python (Puerto 5000)"* (`uploads/agent_bridge_5000.js:1`).
**Endpoints:** idénticos en ruta al `.py` → GET health (`/`,`/status`,`/health`,`/api/status`,`/api/health`, líneas 28-49), POST `/api/agent`|`/api/generate` (52-91), POST `/api/exec` (94-123), POST `/api/python` (126-163).

**Diferencias `.js` vs `.py`:**
| Aspecto | `.py` | `.js` |
|---|---|---|
| Health payload | `runtime: "Python x.y"`, `uptime` seg | `uptime: process.uptime()`, sin `runtime`, agent `"(Puente Python & PC)"` |
| Proxy Ollama `/api/ollama-tags` | ✅ presente | ❌ **ausente** |
| Ejecución Python | `sys.executable` + temp `temp_exec_<ms>.py` | `python "<tmp>" \|\| python3 "<tmp>"`, temp fijo `_temp_script.py` (línea 138) |
| Limpieza temp | `finally` garantizado | `try/catch` tras el callback (145) |
| Payload `/api/agent` | lee `{command,prompt}` | lee `{prompt,files,skill,command}` (57) |
| Salida | `{success,content,output,error,returncode}` | `{success,content,output,error}` (sin `returncode`) |
| CORS headers | `Allow-Headers: *` | lista explícita (línea 14) |
| `HOST` | `0.0.0.0` | `0.0.0.0` |
| Seguridad | misma ausencia de token/sandbox | misma ausencia de token/sandbox |

**Estado [INFERENCIA]:** ambos tiene el **mismo defecto crítico** (bind `0.0.0.0`, CORS `*`, sin token, `shell=True`/`exec` sin allowlist). El MEMORÁNDUM (186-189) señala además que "el puente JS se renombró a `.cjs` porque no ejecutaba bajo `type: module`" → **[INFERENCIA]** este `.js` no arrancaría tal cual en el proyecto (que es `"type":"module"`), salvo con Node CommonJS explícito.

### 5.3 `iniciar_ollama_11434.bat` — 32 líneas — contenido EXACTO [HECHO]

```bat
@echo off
cd /d "%~dp0"
title Ollama Engine Local (Puerto 11434) - CerebroNico
color 0D
echo ============================================================
echo   Iniciando Servidor Ollama en Puerto 11434 (CORS Habilitado)
echo ============================================================
echo.

where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Ollama no esta instalado en el sistema PATH de Windows.
    echo Por favor descarga Ollama desde https://ollama.com
    echo.
    pause
    exit /b 1
)

echo [INFO] Cerrando instancias colgadas previas de Ollama...
taskkill /IM ollama.exe /F >nul 2>nul
taskkill /IM "ollama app.exe" /F >nul 2>nul
timeout /t 1 /nobreak >nul

echo [INFO] Configurando OLLAMA_ORIGINS=* para habilitar CORS sin bloqueos...
set OLLAMA_ORIGINS=*
set OLLAMA_HOST=0.0.0.0:11434

echo [RUN] Ejecutando: ollama serve en http://localhost:11434
echo.
ollama serve

pause
```
**Hallazgo [HECHO]:** arranca Ollama con `OLLAMA_ORIGINS=*` (CORS abierto) y `OLLAMA_HOST=0.0.0.0:11434` (expone Ollama a la LAN). **[INFERENCIA]** es coherente con el patrón "todo 0.0.0.0" de la era v2.3.2, y es el mismo tipo de exposición que el MEMORÁNDUM marcó como crítico para el puente.

### 5.4 `prueva_chat_codigo-0_v2_3_2.md` — 149 líneas — contenido completo [HECHO]
Ya transcrito en §4.4: bitácora de chat 2:47–3:32 p.m. con `stablelm2`, marcada por **respuestas vacías, bucles de repetición y respuestas incoherentes** ("No, no, no, no…", "¿Qué?"). **Es evidencia de un fallo del motor de chat de la era v2.3.2/Codigo-0**, no un simple log neutro.

---

## 6. Línea de tiempo de nombres ("Codigo-0" → "CerebroNico-IDE" → "Cerebronico")

### 6.1 Nombres por fase (nombre de carpeta · nombre de paquete · fecha) [HECHO]

| Fase / carpeta | Nombre comercial que usa | `package.json` name@version | Fechas de archivos |
|---|---|---|---|
| **Codeapp / CodeeApp v1.1→v2.3.2** (fuera de `cerebronico_evolution`; solo en `extra_pruebas_v232/`) | "Codeapp" / "CodeeApp" | *(no presente; su app usa `generated-web-app` en los workspaces; Electron)* | docs **2026-08-22**; workspaces generados **2026-08-24** |
| **`extra_codigo0/`** (Codigo-0-v3) | **"Codigo-0"** (system prompt `ide-store.ts:424`, Cerebro MD `:439`) | **`nextjs_tailwind_shadcn_ts@0.2.1`** (¡nombre de plantilla!) | **2026-05-12 → 2026-08-26** |
| **`extra_fix_ollama/`** | **"Codigo-0 CerebroNico IDE"** (`.env.example:1`) | **`codigo-0-cerebronico@1.0.0`** | 2026-09-10 (05:39–07:36) |
| **`agent-v2/ide/`** | **"CerebroNico IDE"** (`README.md:5`) | **`codigo-0-cerebronico@1.0.0`** | 2026-09-10 (16:48–16:57) |
| **`v1.0`–`v1.1.1`** | **"Cerebronico"** (carpetas `Cerebronico-v1.x`) | `codigo-0-cerebronico@1.x` | 2026-09-19 → 2026-09-21 |
| **`v1.4.0`** | "CerebroNico_IDE" | **`codigo-0-cerebronico@1.4.0`** | 2026-09-13 → … |
| **`v2.0`,`v2.1`** | "**CerebroNico-IDE**-v2.x" | `codigo-0-cerebronico` | 2026-09-13 → 2026-09-18 |
| **`v3.3.2`** | "CerebroNico-IDE-v3.3.2" | **`codigo-0-cerebronico@1.3.2`** ⚠️ | 2026-09-10 → … |

### 6.2 Mapa temporal [HECHO por fechas de archivo + INFERENCIA]

```
2026-05-12 ── Codigo-0-v3 (extra_codigo0) arranca  [Next.js + shadcn]  ──┐  (linaje web, el MÁS ANTIGUO)
2026-08-22 ── Codeapp/CodeeApp v2.3.2 (docs)      [Electron + Vite]      │  (ancestro: MemoryManager, automataTeam)
2026-08-24 ── workspaces generados por Codeapp v2.1/2.3                   │
2026-08-26 ── Codigo-0-v3 último cambio                                  ┘
2026-09-10 ── fix_ollama (05:44) → agent-v2/ide "Modo Agente PC build 2.0" (16:48)  [paquete codigo-0-cerebronico]
2026-09-13 ── v1.4.0 / v2.0 / v2.1 (hibridos)
2026-09-19/21 ── v1.0 → v1.1.1 (Cerebronico)
2026-09-10→… ── v3.3.2 (backend package 1.3.2)
2026-09-21 ── PRUEBAS V2.3.2 (compiladas por el dueño para la auditoría V8)
```
- **[INFERENCIA]** El orden lógico es: **Codeapp** (producto previo, ago) → **Codigo-0** (rebrand y re-stack a Next, may–ago) → **CerebroNico IDE** (sep 10, vuelta a Vite y nacimiento del "Modo Agente PC") → **Cerebronico** (v1.x, sep 13–21).

### 6.3 Por qué existe la confusión de numeración (respuesta directa) [HECHO + INFERENCIA]

**HECHO — tres causas concretas verificadas:**
1. **Dos líneas de versión simultáneas:** *Codeapp v2.3.2* (línea vieja, ago-2026) y *Cerebronico v1.0→v3.3.2* (línea nueva, sep-2026). El "2.3.2" que aparece en `extra_pruebas_v232/` **no es** un "2.3.2" del IDE CerebroNico.
2. **Discrepancia carpeta vs paquete:** `v3.3.2/ide/backend/package.json` declara `"version": "1.3.2"` y `v1.4.0/…` declara `1.4.0`, mientras el nombre de carpeta es `v3.3.2`/`v1.4.0` → **el semver del `package.json` NO se actualizó con la carpeta**.
3. **"build 2.0" vs carpeta `v2.0`:** `agent-v2/ide/CHANGELOG.md` se titula *"Modo Agente PC (build 2.0)"*, pero la carpeta `v2.0/` de evolución es otra cosa ("CerebroNico-IDE-v2.0 (hibrido3)"). El "2.0" del CHANGELOG es **numeración interna de build**, no de release.

**[INFERENCIA] explicativa:** el nombre de paquete **`codigo-0-cerebronico` nunca cambió** aunque el producto se renombró dos veces ("Codigo-0"→"CerebroNico IDE"→"Cerebronico"). Ese ancla fija (el `name` del paquete) es la causa raíz de que hoy todo parezca "lo mismo con números distintos". Para V8 conviene fijar **una sola línea semver** y archivar el resto como "legacy".

---

## 7. Tabla maestra: qué rescatar de cada "extra" para la fusión V8

Leyenda de **valor V8**: **ALTO** = portar casi directo / alto impacto · **MEDIO** = portar con adaptación · **BAJO** = solo referencia · **NULO** = descartar (roto, boilerplate o inseguro).

| Módulo / archivo | Origen (extra) | Versión / fecha | Tamaño | Estado | Valor V8 | Razón |
|---|---|---|---:|---|---|---|
| `src/lib/autoaprendizaje.ts` | extra_codigo0 | Codigo-0-v3 · 2026-05/08 | 376 L | ✅ completo, sin deps | **ALTO** | Memoria auto-evolutiva (5 tipos, recall+scoring). Portable 1:1, más rica que `memory.ts` |
| `src/lib/automata-team.ts` | extra_codigo0 | Codigo-0-v3 · 2026-05/08 | 221 L | ✅ completo, sin deps | **ALTO** | 11 sub-agentes con `prompt` listos; encaja con `codeParser` de agent-v2 |
| `src/lib/ide-store.ts` | extra_codigo0 | Codigo-0-v3 · 2026-05/08 | 593 L | ✅ compila | **ALTO** (patrón) | Ensamblador de contexto (`getFullSystemPrompt`) y store de sesiones/modalidades |
| `src/components/ide/*` | extra_codigo0 | Codigo-0-v3 | 1.495 L | ✅ funcional | **MEDIO** | UI de chat/paneles reusable, pero Tailwind 4 + shadcn (distinto al stack Vite actual) |
| `src/app/api/chat/route.ts` | extra_codigo0 | Codigo-0-v3 | 226 L | ✅ | **MEDIO** | Multiplexor Ollama/Gemini/OpenRouter; **portar lógica** a `server.ts`, no el archivo (Next) |
| `src/app/api/{sandbox,deliverables,providers,ram}/route.ts` | extra_codigo0 | Codigo-0-v3 | 442 L | ✅ | **BAJO** | Específico de Next route handlers |
| `src/components/ui/*` (51 archivos) | extra_codigo0 | Codigo-0-v3 | ~3.000 L | ✅ boilerplate | **NULO** | shadcn de plantilla; no aporta al IDE |
| `src/lib/db.ts` | extra_codigo0 | Codigo-0-v3 | 12 L | ❌ **roto** (sin `prisma/schema.prisma`) | **NULO** | Código muerto; fallaría `prisma generate` |
| `next.config.ts` (`ignoreBuildErrors`) | extra_codigo0 | Codigo-0-v3 | 13 L | ⚠️ riesgo | **NULO** | Anti-patrón: enmascara errores de tipo |
| `agent_bridge_5000.py` | extra_fix_ollama | monorepo v1.0.0 · 09-10 | 201 L | ✅ (bind local) | **MEDIO** | Puente base; **sin** PC-tools/token/UTF-8-fix |
| `server.ts` | extra_fix_ollama | v1.0.0 · 09-10 | 1.385 L | ✅ | **BAJO** | Superado por el de agent-v2 (1.908 L) |
| `src/utils/attachmentProcessor.ts` | agent-v2 | build 2.0 · 09-10 | 592 L | ✅ (usa pdfjs/jszip) | **ALTO** | **El "procesador de adjuntos" que se buscaba**: DOCX/RTF/PDF/binario |
| `src/utils/syntaxEngine.ts` | agent-v2 | build 2.0 · 09-10 | 193 L | ✅ (Prism) | **ALTO** | **El "resaltado" que se buscaba**: 10+ lenguajes + plantillas |
| `src/utils/codeParser.ts` | agent-v2 | build 2.0 · 09-10 | 96 L | ✅ | **ALTO** | **El "parser de código" que se buscaba**: LLM→archivos |
| `src/utils/contextCache.ts` | agent-v2 | build 2.0 · 09-10 | 193 L | ✅ | **ALTO** | Modos experto + idiomas + MEMORIA/SKILLS por defecto |
| `src/utils/languageMemory.ts` | agent-v2 | build 2.0 · 09-10 | 188 L | ✅ | **ALTO** | Memoria de jerga española→intención (diferencial) |
| `src/utils/engine.ts` | agent-v2 | build 2.0 · 09-10 | 757 L | ✅ | **ALTO** | Motor de streaming (`HighPerformanceAIStreamer`) |
| `src/utils/memory.ts` | agent-v2 | build 2.0 · 09-10 | 193 L | ✅ | **MEDIO** | Solapa con `autoaprendizaje.ts`; usar el de codigo0 |
| `src/utils/fileParser.ts` | agent-v2 | build 2.0 · 09-10 | 144 L | ⚠️ artefacto L74 | **MEDIO** | ZIP/download útil, pero **limpiar el `defineConfig` embebido** |
| `src/components/*` (7) + `src/data/skills{50,100}.ts` | agent-v2 | build 2.0 · 09-10 | ~5.000 L | ✅ | **ALTO** | UI completa + catálogo de 100 skills ya poblado |
| `src/App.tsx`, `types.ts` | agent-v2 | build 2.0 · 09-10 | 1.321 L | ✅ | **ALTO** | Shell con `pcMode` y tipos del dominio |
| `tests/comprehensive_e2e_test.py` + `mock_ollama.py` | agent-v2 | build 2.0 · 09-10 | 976 L | ✅ (8 tests) | **ALTO** | Suite e2e de streaming multi-provider; reusar como regresión V8 |
| `tests/` de `fix_ollama` | extra_fix_ollama | — | — | ❌ no existen | **NULO** | Ausentes (tarea "Only in agent-v2/ide: tests") |
| `agent_bridge_5000.py` (endurecido + PC) | agent-v2 / v3.3.2 | 473 / 474 L · 09-10 | 473 L | ✅ | **ALTO** | Puente oficial: PC-tools, `127.0.0.1`, UTF-8 fix, threading |
| `CODIGO-CODEEAPP-2.3.2.md` | extra_pruebas_v232 | Codeapp · 2026-08-22 | 608 KB / 81 archivos | ✅ doc | **MEDIO** | Fuente de verdad del ancestro (MemoryManager, automataTeam, electrón) |
| `MEMORANDUM-SEGURIDAD.md` | extra_pruebas_v232 | Codeapp v2.3.1 · 2026-08-22 | 9,8 KB | ✅ doc | **ALTO** | Checklist de seguridad aplicable ya (RCE, iframe, CSRF, zip-slip, SSRF) |
| `RE-EVOLUCION-CODEEAPP.md` | extra_pruebas_v232 | v3.0 vision · 2026-08-22 | 18,5 KB | ✅ doc | **MEDIO** | Roadmap (MCP, subagentes+hooks, skills file-based) alineado con V8 |
| `workspaces/*` (7) + `code-map.json` | extra_pruebas_v232 | Codeapp v2.1/2.3 · 2026-08-24 | — | ✅ | **MEDIO** | Muestran el formato `manifest.json`/`code-map.json`/`MEMORIA.md` a replicar |
| `uploads/agent_bridge_5000.py` (201 L, `0.0.0.0`, sin token) | uploads | v2.3.2-era | 201 L | ⚠️ **inseguro** | **NULO** (como producto) / **ALTO** como evidencia | **RCE**: `HOST=0.0.0.0` + CORS `*` + `shell=True` sin auth |
| `uploads/agent_bridge_5000.js` (188 L) | uploads | v2.3.2-era | 188 L | ⚠️ **inseguro** + no arranca bajo `type:module` | **NULO** | Gemelo JS del anterior, mismos defectos; renombrado a `.cjs` en v2.3.1 |
| `uploads/iniciar_ollama_11434.bat` | uploads | — | 32 L | ✅ funcional | **MEDIO** (con cambio) | Útil para arrancar Ollama, pero `OLLAMA_ORIGINS=*` y `OLLAMA_HOST=0.0.0.0` → **cambiar a `127.0.0.1`** |
| `uploads/prueva_chat_codigo-0_v2_3_2.md` | uploads | v2.3.2 | 149 L | ✅ log | **BAJO** | Evidencia del bug de bucle de chat; sin código rescatable |

### 7.1 Recomendación de fusión (orden de prioridad) [INFERENCIA]
1. **Base:** `agent-v2/ide/` (mismo stack que v1.x–v3.3.2; ya trae Modo Agente PC, tests y los utils buscados).
2. **Injertar de Codigo-0-v3:** `autoaprendizaje.ts` + `automata-team.ts` (y el patrón de `getFullSystemPrompt` de `ide-store.ts`).
3. **Reusar de v3.3.2:** el puente de 474 L (idéntico a agent-v2) — **no** el de `uploads/`.
4. **Descartar:** `db.ts`, los 51 `ui/*`, `app/api/*` de Next, y **ambos** puentes de `uploads/` (inseguros).
5. **Aplicar como checklist:** `MEMORANDUM-SEGURIDAD.md` (binding `127.0.0.1`, Bearer token, CORS restringido, sin `Private-Network-Access`).

---

## 8. Anexo — Inventario de rutas y líneas citadas

**extra_codigo0/**
- `extra_codigo0/package.json:2-3` (name/version), `:15-81` (deps)
- `extra_codigo0/next.config.ts:5-8` (`ignoreBuildErrors`)
- `extra_codigo0/components.json:2,9-14` (shadcn new-york, aliases)
- `extra_codigo0/Caddyfile:1-26` (proxy :81→:3000)
- `extra_codigo0/src/lib/ide-store.ts:238` (create store), `:121-126` (MODALITY_PROMPTS), `:424` ("Eres Codigo-0"), `:439` (CEREBRO MD), `:546` (maxFiles 50), `:562` (getFullSystemPrompt)
- `extra_codigo0/src/lib/autoaprendizaje.ts:3` (inspirado en Codeapp v2.3.2), `:12` (kinds), `:50-52` (LS key/topes), `:109-376` (API)
- `extra_codigo0/src/lib/automata-team.ts:5` (adaptado de Codeapp v2.3.2), `:22-197` (11 autómatas), `:200,211` (API)
- `extra_codigo0/src/lib/db.ts:1-13` (Prisma singleton; **sin schema**)
- `extra_codigo0/src/components/ide/ChatInput.tsx:17-22` (MODALITIES), `:56-60` (adjunto base64)
- `extra_codigo0/src/app/api/chat/route.ts:34` (DEFAULT_OLLAMA_URL), `:55-60` (validación)

**extra_fix_ollama/**
- `extra_fix_ollama/README.md:1-21` (README AI Studio genérico)
- `extra_fix_ollama/.env.example:1-10` ("Codigo-0 CerebroNico IDE", puertos)
- `extra_fix_ollama/package.json:2-4` (`codigo-0-cerebronico@1.0.0`)
- `extra_fix_ollama/agent_bridge_5000.py:21` (`HOST=127.0.0.1`)
- `diff -rq extra_fix_ollama agent-v2/ide` → diferencias §2.3

**agent-v2/**
- `agent-v2/ide/README.md:5,10-16,42-78` (qué es; puertos; providers; tests)
- `agent-v2/ide/CHANGELOG.md:1-14,33-49,63-81` (Modo Agente PC build 2.0; tabla `pc_*`; archivos modificados; seguridad)
- `agent-v2/ide/package.json:2-11` (name/version/type/scripts)
- `agent-v2/ide/src/utils/attachmentProcessor.ts:12,56,113,136,166,196-257`
- `agent-v2/ide/src/utils/syntaxEngine.ts:1-16,26,116,133,148,160`
- `agent-v2/ide/src/utils/codeParser.ts:12,53`
- `agent-v2/ide/src/utils/contextCache.ts:4,13,19,28,45,62,89`
- `agent-v2/ide/src/utils/languageMemory.ts:1-13,27,29`
- `agent-v2/ide/src/utils/fileParser.ts:7,74 (⚠️),135`
- `agent-v2/ide/src/utils/engine.ts:3,17,49,165`
- `agent-v2/ide/src/utils/memory.ts:3,10,51,93,144,168,188`
- `agent-v2/ide/tests/comprehensive_e2e_test.py:1-14,29-40`
- `agent-v2/ide/agent_bridge_5000.py` (473 L; endpoints en 213-377)
- `agent-v2/ide/server.ts` (1.908 L)

**extra_pruebas_v232/**
- `…/PRUEVAS V2.3.2 PARA PROYECTO/CODIGO-CODEEAPP-2.3.2.md:1,26,70-83` (Codeapp v2.3.2, 81 archivos/14.223 líneas)
- `…/MEMORANDUM-SEGURIDAD.md:146,157,175-191` (v2.3.1 hardening; RCE puentes 5000)
- `…/RE-EVOLUCION-CODEEAPP.md:3,92-143` (visión v3.0)
- `…/workspaces/476bd5b6-mt7jl46a/{manifest.json,MEMORIA.md,src/App.tsx,code-map.json}`
- `…/workspaces/159dbe5f-mt7jffqw/{manifest.json,main.py}`
- `…/workspaces/824e9a2b-mt7jk9xk/{manifest.json,server.js}`
- `…/workspaces/zips/159dbe5f-mt7jffqw.zip` (3.604 B)

**uploads/**
- `agent_bridge_5000.py:2-8,21,28-31,42-70,86-141,146-172,178-201`
- `agent_bridge_5000.js:1,14,28-49,52-91,94-123,126-163`
- `iniciar_ollama_11434.bat:1-32` (contenido completo en §5.3)
- `prueva_chat_codigo-0_v2_3_2.md:1-149`

**Comparaciones de integridad**
- `md5sum` puentes: `extra_fix_ollama/agent_bridge_5000.py=9cc47be4…`, `agent-v2/ide/…=7beb9a8a…`, `uploads/…=23886ad6…` (los 3 distintos).
- `diff uploads/agent_bridge_5000.py extra_fix_ollama/agent_bridge_5000.py` → única diferencia: `HOST "0.0.0.0"` vs `os.environ.get("HOST","127.0.0.1")`.

---

## 9. Riesgos y advertencias para V8

1. **Seguridad (crítico):** `uploads/agent_bridge_5000.py` y `.js` son **RCE sin autenticación** (bind `0.0.0.0`, CORS `*`, `Allow-Private-Network`, `shell=True`/`exec` sin allowlist, `/api/python` escribe y ejecuta código arbitrario). **No portarlos.** Usar el puente de `agent-v2`/`v3.3.2` (`127.0.0.1` + Bearer + PC-tools).
2. **`iniciar_ollama_11434.bat`:** cambiar `OLLAMA_HOST=0.0.0.0:11434` → `127.0.0.1:11434` y valorar `OLLAMA_ORIGINS` específico en vez de `*`.
3. **`db.ts` de Codigo-0-v3:** no funcional (falta `prisma/schema.prisma`); si V8 no adopta Prisma, borrarlo.
4. **`fileParser.ts:74` de agent-v2:** contiene un `export default defineConfig({…})` (código de `vite.config` mal copiado) → limpiar antes de portar.
5. **Numeración:** unificar semver (hoy `v3.3.2` ↔ `package.json@1.3.2`) y renombrar "build 2.0" para no colisionar con la carpeta `v2.0/`.
6. **`ignoreBuildErrors:true`** en Codigo-0-v3 y `reactStrictMode:false`: si se portara cualquier parte a Next, reactivarlos.

**Fin del informe 04.**
