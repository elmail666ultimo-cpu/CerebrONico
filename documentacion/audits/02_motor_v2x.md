# 02 — Auditoría del MOTOR de conocimiento · CerebroNico IDE v2.0 vs v2.1

**Objetivo:** verificar contra el CÓDIGO REAL lo que promete `IDEA_DEL_MOTOR_v2.0.md`, medir la
distancia doc↔código y decidir qué se puede fusionar en la V8.

**Base auditada**
- v2.0: `/home/wuying/.accio/accounts/7096577584/agents/DID-82AD6B-8682AD6BU1787698-2006-1EE3D4/project/cerebronico_evolution/v2.0/CerebroNico-IDE-v2.0/`
- v2.1: `/home/wuying/.accio/accounts/7096577584/agents/DID-82AD6B-8682AD6BU1787698-2006-1EE3D4/project/cerebronico_evolution/v2.1/CerebroNico-IDE-v2.1/`
- Doc rector: `v2.0/CerebroNico-IDE-v2.0/IDEA_DEL_MOTOR_v2.0.md` (245 líneas).
  **HECHO:** el fichero es **byte-idéntico** en v2.0 y v2.1 (`diff` → `IDENTICAL`): v2.1 **no actualizó su
  documento de diseño**. Todo lo que v2.1 cambia hay que leerlo del código.

**Convención de este informe**
- **[HECHO]** = verificado leyendo el código (con ruta + línea).
- **[PROMETIDO]** = el doc lo afirma pero el código no lo respalda (o lo respalda sólo parcialmente).
- **[DUDOSO]** = el artefacto existe pero no es reproducible/no se pudo ejecutar en este entorno.
- Rutas relativas a la raíz de cada versión; `server.ts` es siempre `ide/backend/server.ts`.

**Método:** lectura íntegra de los 11 módulos de `src/engine/` de ambas versiones + `diff -u` v2.0→v2.1,
lectura dirigida de `server.ts` (5.343 vs 6.284 líneas), `rg` de anchors de línea, `md5sum` de artefactos
de prueba. No se ejecutó `npm install` ni la app (sin red en el entorno de auditoría): las afirmaciones se
apoyan en análisis estático, salvo donde se dice explícitamente lo contrario.

---

## 1. Inventario de módulos del motor (v2.0 → v2.1)

### 1.1 Tabla maestra

| Módulo (`ide/backend/src/engine/…`) | v2.0 líneas | v2.1 líneas | Diff | Qué es |
|---|---|---|---|---|
| `knowledgeBase.ts` | 320 | 320 | **IDÉNTICO** | KB determinista + `buildEngineContext()` + `validateToolCall()` |
| `syntaxGuard.ts` | 441 | 479 | **DIFF (53 líneas nuevas)** | Blindaje de sintaxis previo a disco |
| `symbolIndex.ts` | 185 | 185 | **IDÉNTICO** | Índice de firmas reales del proyecto |
| `compactor.ts` | 197 | 197 | **IDÉNTICO** | Disciplina de contexto sobre salidas de herramienta |
| `resilience.ts` | 302 | 302 | **IDÉNTICO** | Reintentos, cortacircuitos, cadena de respaldo |
| `toolRegistry.ts` | 571 | 571 | **IDÉNTICO** | Esquemas de herramientas (`ToolSpec`) |
| `superPrompt.ts` | 203 | 203 | **IDÉNTICO** | Prompt base |
| `modelTiers.ts` | 336 | 336 | **IDÉNTICO** | Clasificación de modelos + perfiles de rendimiento |
| `manuals.ts` | 308 | 308 | **IDÉNTICO** | Leyes + manual por herramienta + procedimientos |
| `importChecker.ts` | 171 | 269 | **DIFF (135 líneas nuevas)** | Detección de imports rotos + stubs |
| `extensions.ts` | 240 | 240 | **IDÉNTICO** | Sistema de extensiones |
| **Sólo v2.1** | | | | |
| `brain.ts` | — | 577 | NUEVO | CEREBRO (ley) + MEMORIA (estado vivo), escritura atómica, snapshots, rollback |
| `localRAG.ts` | — | 389 | NUEVO | Vectorización local de la memoria (APAGADA por defecto) |
| `advancedFeatures.ts` | — | 418 | NUEVO | Interruptores de capacidades (git de memoria, plantillas, deep-index) |
| `hardwareGovernor.ts` | — | 228 | NUEVO | Gobernador por RAM libre (fases V2.0…V2.3) |
| `cloudVerifier.ts` | — | 416 | NUEVO | Verificador independiente en la nube |
| `projectPorter.ts` | — | 252 | NUEVO | Normaliza puerto de arranque de proyectos importados |
| `core-agent/agent_core/*.py` | — | 318 | NUEVO | Núcleo Python secundario (`engine.py`, `loader.py`) |
| `server.ts` | 5.343 | 6.284 | +941 | Orquestador (rutas, prompt, bucle de agente) |

**Tamaño exacto (bytes) de los módulos compartidos:** los marcados IDÉNTICO lo son también en bytes
(p. ej. `knowledgeBase.ts` = 20.434 B en ambas). `syntaxGuard.ts` 18.070 → 20.719 B;
`importChecker.ts` 7.158 → 12.141 B.

### 1.2 Diferencias reales v2.0 → v2.1 (lo único que cambió en el motor)

| Cambio | Fichero:línea (v2.1) | Detalle |
|---|---|---|
| Python: heurística **no bloqueante** | `syntaxGuard.ts:435-446` | `bloqueantes = language === "python" ? unique.filter(i => i.kind === "truncated") : unique` |
| Python: `:` ya no debe terminar la línea | `syntaxGuard.ts:270-284` | `!t.includes(":") && !/[({\[,=+\-*/|&\\]$/.test(t)` |
| Archivo **vacío = válido** | `syntaxGuard.ts:309-318` | Antes devolvía `ok:false` (rompía `__init__.py`) |
| HTML-en-.md: sólo bloquea si **empieza** el archivo | `syntaxGuard.ts:412-431` | `^\s*(<!doctype\s+html|<html[\s>])` |
| `importChecker`: stubs de **módulo** (no sólo componente) | `importChecker.ts:113-200` | `extraerNombresImportados()` + no-op por nombre importado |
| `postinstall.mjs` nunca aborta `npm install` | `scripts/postinstall.mjs:23-43,163-166` | `uncaughtException`/`unhandledRejection` → aviso y `process.exit(0)` |
| Gobernanza viva + RAG + features | `server.ts:973-995, 2208-2407, 4791-4856` | `Brain`, `LocalRAG`, `AdvancedFeatures`, `HardwareGovernor`, `CloudVerifier` |

**Conclusión 1.1 [HECHO]:** el núcleo duro del motor (KB, símbolos, compactador, resiliencia, toolRegistry,
manuals, modelTiers) es **código congelado idéntico** entre v2.0 y v2.1. v2.1 añade una **capa de gobernanza**
(`brain.ts` y compañía) y afina el guardián de sintaxis + verificador de imports. Para la V8, "v2.1 vs v2.0"
no es una elección de motor, sino de **capa superior**.

---

## 2. Base de conocimiento (`knowledgeBase.ts`, idéntico en ambas)

### 2.1 Estructura de `kb.json`

| Elemento | Código | Valor |
|---|---|---|
| Ubicación | `server.ts` v2.0:842-843 · v2.1:961-962 | `path.join(process.cwd(), ".cerebro-db", "kb.json")` |
| Formato serializado | `knowledgeBase.ts:215-217` | `{ "version": 2, "entries": [ … ] }` |
| Entrada | `knowledgeBase.ts:34-45` | `{ id, table, title, body, keys[], lang?, weight?, updatedAt? }` |
| Tablas del tipo | `knowledgeBase.ts:32` | `"syntax" \| "error" \| "pattern" \| "tool" \| "skill" \| "rule" \| "project" \| "lesson"` |
| **Tabla fantasma** | `manuals.ts:28-36` | las 30 entradas de manuales usan `table: "manual"`, **que NO existe en `KbTable`** → ver §2.5 |
| Carga | `server.ts` v2.0:847-861 · v2.1:997-1011 | `KnowledgeBase.fromJSON(readFileSync(...))`; si falla → semilla |
| Persistencia | v2.0:863-878 · v2.1:1013-1028 | `saveEngineKb()` con bandera `kbDirty`; autosave cada 30 s; flush en SIGINT/SIGTERM |
| Re-seed | `knowledgeBase.ts:219-231` | `fromJSON` sólo re-inyecta `KB_SEED` (no `MANUAL_ENTRIES`) si el JSON no las trae |

### 2.2 Semilla real (contada en el código, no en el doc)

| Tabla | Entradas en `KB_SEED` | IDs |
|---|---|---|
| `rule` | **4** | `rule-no-placeholders`, `rule-verify`, `rule-edit-first`, `rule-destructive` |
| `syntax` | **7** | `syn-json`, `syn-tsx`, `syn-ts`, `syn-html`, `syn-css`, `syn-py`, `syn-truncation` |
| `error` | **7** | `err-enoent`, `err-module`, `err-port`, `err-econnrefused`, `err-json`, `err-oom`, `err-timeout-model` |
| `pattern` | **5** | `pat-fetch`, `pat-react-comp`, `pat-express`, `pat-sandbox-preview`, `pat-ollama` |
| `tool` | **5** | `tool-edit`, `tool-range`, `tool-search`, `tool-git`, `tool-fetch-url` |
| `skill` | **4** | `skill-tabs`, `skill-extensions`, `skill-autolearn`, `skill-favorites` |
| **Total `KB_SEED`** | **32** | `knowledgeBase.ts:76-120` |
| `MANUAL_ENTRIES` (extra) | **30** | 5 leyes (`manuals.ts:40`) + 19 manuales de herramienta (`manuals.ts:86`) + 6 procedimientos (`manuals.ts:230`) |
| **Total de fábrica** | **62** | inyectadas en el constructor: `knowledgeBase.ts:133` `[...KB_SEED, ...MANUAL_ENTRIES]` |

> **[PROMETIDO]** El doc (§2, línea 30) dice «**28 entradas**, verificadas por prueba automática».
> **[HECHO]** son **32 sólo en `KB_SEED`** y **62 de fábrica** con los manuales. El doc quedó desactualizado
> respecto a su propio código (la sección de manuales se añadió después sin revisar la cifra).
> La única comprobación automática existente exige `size >= 25` (`PRUEBAS_MANUALES_MOTOR.ts:10`): umbral
> laxo que no valida "28".

### 2.3 `buildEngineContext()`: selección y presupuesto

Algoritmo real (`knowledgeBase.ts:185-245`):

1. `tokenize(text)` (`:64-71`): minúsculas, se eliminan símbolos salvo `._/-`, se descartan palabras ≤2 caracteres.
2. Puntuación por entrada (`:190-209`):
   - clave exacta presente en el texto: **+2.2**;
   - coincidencia parcial (substring, sólo si ambos lados >4 car.): **+1.0**;
   - cada palabra del título presente: **+0.8**;
   - **+ `TABLE_PRIORITY[table]`** (`:53-62`): `rule 1.0 · syntax 0.92 · error 0.9 · tool 0.85 · project 0.8 · skill 0.7 · pattern 0.65 · lesson 0.6`; desconocidas (`manual`) → `?? 0.5`;
   - **+ `weight * 0.6`** (peso declarado 0..1);
   - **bonus fijo +0.7 si `table === "rule"`** (siempre útiles);
   - `score === 0` ⇒ descartada; orden descendente; `slice(0, limit)`.
3. Formato: `[CONOCIMIENTO DEL MOTOR — datos verificados, úsalos tal cual]` + una línea `- [tabla] título: body` por hit (`:242`).
4. **Presupuesto**: `budgetChars` por defecto **1100** en la firma (`:238`); si el texto excede, se corta y se
   añade `[…]` (`:243`).

**Dónde se aplica el 700/1200 que dice el doc:**

| Punto de llamada | v2.0 | v2.1 | Presupuesto |
|---|---|---|---|
| Prompt del modelo (Ollama) | `server.ts:4865-4870` | `server.ts:5767-5772` | `tier === "micro" \|\| "tiny" ? 700 : 1200` ✅ coincide con el doc |
| Endpoint `GET /api/engine/kb` | `server.ts:2060` | `server.ts:2495` | default **1100** (incoherencia menor, sólo afecta a la vista de diagnóstico) |

**[HECHO]** el presupuesto 700/1200 se respeta, pero **sólo en la ruta Ollama** (ver §2.4).
**[HECHO]** el doc dice «las 5 entradas más relevantes»: correcto, `limit = 5` fijo (`:4868` / `:5770`).

### 2.4 ¿Se inyecta el motor en todos los proveedores? **[PROMETIDO parcialmente]**

- **[HECHO]** `buildEngineContext` (KB), `buildToolManualSection` (manuales) y `summarizeSymbols`
  (símbolos) se invocan **una sola vez y sólo en el camino Ollama**, dentro del bloque
  `if (consolidatedSystemInstruction) { let sysContent = consolidatedSystemInstruction; … }`
  (`server.ts` v2.0:4827-4900 · v2.1:5728-5801).
- **[HECHO]** Los caminos Gemini/OpenRouter/Z.ai/OpenAI/Custom construyen su prompt con
  `consolidatedSystemInstruction` (`server.ts` v2.1:4924, 4994, 5071, 5151, 5256, 5339, 5403, 5467, 5531, 5595, 5659)
  y **no** reciben `[CONOCIMIENTO DEL MOTOR]`, ni `[MANUAL DEL MOTOR]`, ni `[SÍMBOLOS REALES DEL PROYECTO]`.
- **[HECHO]** Lo que **sí** es común a todos los proveedores es la **capa de gobernanza** añadida en v2.1
  (`brain.systemBlock()` + RAG + archivos de sistema ocultos), porque se aplica a
  `consolidatedSystemInstruction` antes del `if` por proveedor (`server.ts` v2.1:4791-4856).

> **Veredicto:** «cambiar de modelo no cambia el resultado» (doc §1, líneas 17-18) es **FALSO en v2.0**
> (la nube no recibe KB ni símbolos) y **PARCIAL en v2.1**: la ley/estado sí viaja a todos; el conocimiento
> recuperado y el índice de símbolos siguen siendo privilegio de Ollama.
> **Acción V8:** extraer la composición del prompt a un único punto (`buildProviderSystemPrompt`) y llamarlo
> en los 11 caminos de proveedor.

### 2.5 Endpoints `/api/engine/*` **[HECHO]**

`registerEngineRoutes()` — v2.0:2049-2155 · v2.1:2208-2590 (v2.1 añade 4 bloques *antes*: `verifier`, `features`, `rag`, `brain`).

| Ruta | Método | v2.0 | v2.1 | Devuelve |
|---|---|---|---|---|
| `/api/engine/kb?q=&limit=` | GET | 2051 | 2486 | `hits` (id/table/title/body/score) + `context` (lo que inyectaría) + `stats` + `size` |
| `/api/engine/kb/stats` | GET | 2067 | 2502 | `size`, `tables`, `file`, `persisted` |
| `/api/engine/kb/learn` | POST | 2078 | 2513 | `learnFromLesson(id, text, tags)` → `lesson:<id>` (peso 0.6) |
| `/api/engine/kb/entry` | POST | 2088 | 2523 | alta manual (exige `id` y `body`; `table` por defecto `rule`; `weight` 0.7) |
| `/api/engine/guard` | POST | 2106 | 2541 | `guardFile(path, content)` sin escribir |
| `/api/engine/sync` | POST | 2117 | 2552 | mapa de proyecto + **reindexado de símbolos** + `saveEngineKb(true)` |
| `/api/engine/symbols?q=&limit=` | GET | 2131 | 2566 | sin `q`: mapa+`summary`; con `q`: `findSymbols` (file/line/kind/signature) |
| `/api/engine/tools` | GET | 2152 | 2587 | `listToolPacks()` + `getAllToolNames()` |
| `/api/brain*`, `/api/rag*`, `/api/features*`, `/api/verifier/*` | — | — | 2222-2484 | **sólo v2.1** (gobernanza, RAG, interruptores, verificador) |

Detalle de `sync` (v2.0:2117-2128): `refreshEngineProjectMap(files)` guarda hasta **60** rutas como
`project:map` (`knowledgeBase.ts:155-165`) y `reindexProjectSymbols()` añade una entrada `project` por archivo
con símbolos (`server.ts` v2.0:942-953 · v2.1:1090-1102), cuerpo recortado a **1.200 caracteres**, `weight 0.75`.

---

## 3. `syntaxGuard.ts` — qué se bloquea de verdad

### 3.1 Política implementada: **CONSERVADORA, ya en v2.0** [HECHO]

El propio código documenta la decisión (`syntaxGuard.ts:320-333`):

```
// EVIDENCIA: se pasaron por el blindaje 63 archivos REALES y VÁLIDOS del propio
// proyecto y RECHAZÓ 32 (el 51 %) …
// ahora solo se bloquea lo que se puede afirmar sin duda.
```

Coincide con `memoria.md` (líneas 25-29, ADR «Blindaje de sintaxis con política conservadora»).
No es un pendiente: **está implementado en v2.0 y afinado en v2.1**.

### 3.2 Reglas exactas que SÍ bloquean

| # | Regla | Código | Alcance |
|---|---|---|---|
| 1 | Marcador de truncamiento **al final** del archivo (`tail` = últimas 3 líneas) | `:335-349` | todos los lenguajes |
| 2 | CSV: JSON inválido (`JSON.parse` real) | `:352-362` | `language === "json"` |
| 3 | Truncamiento: `/*` **que abre línea** > `*/` | `:368-381` | ts/tsx/js/jsx |
| 4 | Balance de delimitadores + cadenas | `:398-402` (`scanBalance`) | **sólo `html`** |
| 5 | Pares de etiquetas HTML | `:401` (`checkTagPairing(text,"html")`) | **sólo `html`** |
| 6 | Balance de llaves CSS | `:403-407` (`checkCss`) | `css` |
| 7 | Python: `:` ausente, `return:` , tab+espacios | `:408` (`checkPython`) | `python` (**en v2.1 no bloquean**, salvo `kind === "truncated"`) |
| 8 | HTML guardado como `.md`/`.txt` (sólo si **empieza** con `<html`/`<!doctype`) | v2.1:412-431 / v2.0:399-407 | markdown/text |

`TRUNCATION_PATTERNS` (`:58-72`): (a) «archivo/contenido/fichero truncado a NB/KB»; (b)
`^\s*(\.\.\.|…)\s*$` multilínea; (c) `<...>` o `[ ... ]`; (d) comentario `//`/`#` que dice «resto del código»;
(e) `TODO|FIXME|pendiente de implementar`.

### 3.3 Reglas que el doc promete y el código YA NO aplica (retiradas a propósito)

| Doc §3 | Estado real |
|---|---|
| «Paréntesis, corchetes y llaves desbalanceados, ignorando strings y comentarios» | **[PROMETIDO]** `scanBalance()` existe y es correcto, pero **sólo se llama para `html` y `css`** (`:398-407`). En TS/JS/TSX **no se comprueba balance**: el comentario `:364-367` lo justifica («sin un parser real … eso ya NO bloquea»). |
| «Cadenas y plantillas sin cerrar» | **[PROMETIDO]** el contador `unclosedString` se calcula pero **nunca se usa** para bloquear; el chequeo de backticks fue **retirado** (`:382-393`) |
| «JSX: etiquetas pareadas … incluye `<Componente>`» | **[PROMETIDO]** `checkTagPairing(text, kind)` acepta `"jsx"` (`:191`) y cuenta componentes PascalCase (`:216-221`), pero **la única llamada es `checkTagPairing(text, "html", …)`** (`:401`). El camino `"jsx"` es **código muerto**: un `.tsx` con `<Foo>` sin cerrar **no se rechaza**. |
| «Comentarios de bloque sin cerrar» | **[HECHO]** pero debilitado: sólo cuenta `/*` al inicio de línea (`:372`) — falso positivo real documentado en `ProConfigPanel.tsx` |
| «Marcadores (`…`, `<...>`, TODO)» | **[HECHO]** con matiz importante: **sólo si están en las últimas 3 líneas** (`:338`) |
| «CSS: llaves desbalanceadas» | **[HECHO]** `checkCss` cuenta `{}` sin ignorar strings/comentarios (riesgo de falso positivo en `content: "{"`) |
| «Python: mezcla de tabs/espacios, `def/if/for/while/class` sin `:`» | **[HECHO] detecta**, pero en v2.1 `ok` sólo depende de `truncated` (`:435-446`): los avisos se informan sin bloquear |
| «Los errores devuelven el mensaje al modelo y se revierte el archivo» | **[HECHO]** `rejectMessage()` (`:473-479`) + puertas de escritura (§3.4) |

### 3.4 Puertas de escritura donde se aplica `guardFile` [HECHO]

| Puerta | v2.0 | v2.1 |
|---|---|---|
| `write_file` (herramienta) | 1070 | 1229 |
| `edit_file` (herramienta, revierte) | 1162 | 1321 |
| `POST /api/engine/guard` | 2108 | 2543 |
| `POST /api/fs/write` (autosync del chat) | 3257 (ruta en 3241) | 4050 (ruta en 4034) |
| `POST /api/fs/sync` (volcado masivo) | 3415 (ruta en 3391) | 4221 (ruta en 4197) |

**Novedad v2.1 en `/api/fs/sync`:** `esArchivoCriticoParaArrancar(p)` (`server.ts:4188-4195`:
`package.json`, `vite.config.*`, `tsconfig*.json`, `index.html`) → si el guardián duda de un **archivo
crítico, se escribe igual y se avisa fuerte** (comentario `:4225-4238`). El motor aprende del rechazo
vía `learnFromToolFailure("fs_sync", …)` (`:4246`).

---

## 4. `validateToolCall()` — blindaje del contexto de herramientas

Definición: `knowledgeBase.ts:265-320` (**idéntico v2.0/v2.1**). Aplicación: `executeToolCall()`
(`server.ts` v2.0:1002-1027 · v2.1:1161-1185).

| Caso | Comportamiento | Línea |
|---|---|---|
| `args` no es objeto (o es array/null) | `ok:false`, issue `field:"*"` | 271-273 |
| Campo `required` ausente / `null` / cadena vacía | issue **bloqueante** `Falta el campo obligatorio "x"` | 275-280 |
| **Campo inventado** (no está en `properties`) | issue **no bloqueante**: «se ha ignorado» → **se descarta** del `sanitized` | 282-288 |
| `type:"string"` y no string | issue bloqueante | 290-293 |
| `type:"number"` y no number | **coerción**: `Number(value)` finito ⇒ `sanitized[field] = n`; si no, issue | 294-299 |
| `type:"array"` y no array | issue bloqueante | 300-303 |
| `type:"boolean"` y no boolean | coerción `"true"/"false"` ⇒ `sanitized`; si no, issue | 304-309 |
| `enum` violado | issue bloqueante con la lista de valores | 310-314 |
| Veredicto | `blocking = issues.filter(i => !i.message.includes("se ha ignorado"))` ⇒ `ok = blocking.length === 0` | 318-319 |
| Herramienta **inexistente** | corta antes: `Herramienta desconocida: X` | `server.ts` v2.0:1012-1014 · v2.1:1171-1174 |
| Fallo de validación | devuelve `{ok:false, error, hint}` al modelo **sin ejecutar** | v2.0:1018-1024 · v2.1:1177-1183 |

Detalle fino: el detector de "no bloqueante" es **por substring en el mensaje** (frágil: cualquier issue
futuro que contenga «se ha ignorado» se vuelve no bloqueante). `sanitized` se asigna de vuelta a `args`
(`v2.0:1026`) ⇒ los campos inventados **nunca llegan** a la ejecución.

**Cobertura del esquema [HECHO]:** `schemaForTool()` (`v2.0:996` · v2.1:1155`) construye el esquema desde
`getToolSpec()` de `toolRegistry.ts` (`:111`). `write_file` exige `path`+`content` (`toolRegistry.ts:298-308`),
`find_symbol` exige `name` con `limit` numérico (`toolRegistry.ts:401-413`).

---

## 5. `symbolIndex.ts` — índice de símbolos reales

### 5.1 Lenguajes y patrones [HECHO]

| Lenguaje | Extensiones | Patrones |
|---|---|---|
| TypeScript/TSX/JS/JSX | `.ts .tsx .js .jsx .mjs .cjs` | `TS_PATTERNS` (`:56-67`): `function` (export/no), `class`, `interface`, `type`, `const` flecha, `const` general, **método** |
| Python | `.py` | `PY_PATTERNS` (`:69-72`): `def` (con `async`), `class` |
| Otros (css/html/md…) | — | **no indexados** (`guessLanguage` `:125-131` no los mapea ⇒ `patterns = []`) |

- En **TSX/JSX**, una `function` con nombre PascalCase se reclasifica como `component` (`:110`).
- **Métodos** sólo si el archivo tiene < 800 líneas y la línea está indentada ≥2 espacios (`:88-99`);
  se filtran `RESERVED_WORDS` (`:123`).
- Límites: `MAX_SYMBOLS_PER_FILE = 120` (`:74`), `buildSymbolMap` procesa hasta **200 archivos** (`:137`).
- **Firma extraída** (`:112`): la **línea completa** normalizada y recortada a **120 caracteres** (`cleanSignature` `:76-79`).
  ⚠️ Es decir: la "firma" es la línea de declaración (incluye `export`, modificadores y a veces el cuerpo),
  no una firma normalizada tipo `(a: T) => R`.
- Campos de `SymbolInfo` (`:31-40`): `name, kind, line, signature, exported, pascal`.
- `kind ∈ {function, class, interface, type, const, component, method, python-def, python-class}` (`:20-29`).

### 5.2 Inyección en el prompt e índice en KB [HECHO]

- Resumen inyectado: `summarizeSymbols(map, maxChars, maxFiles=12)` (`:173-185`) produce
  `[SÍMBOLOS REALES DEL PROYECTO — usa estos nombres, no inventes otros]` + una línea por archivo
  (hasta 12 símbolos por archivo).
- Presupuesto de inyección: `profile.tier === "micro" ? 700 : 1300` (`server.ts` v2.0:4897 · v2.1:5799) ✔ coincide con el doc.
- Indexado en KB: una entrada `project` por archivo con símbolos, id `symbols:<path>`, weight 0.75,
  cuerpo ≤1.200 car. (`server.ts` v2.0:942-953 · v2.1:1090-1102).
- Reindexado: `reindexProjectSymbols()` (`v2.0:898-957` · v2.1:1048-1107`) recorre el sandbox
  (`PROJECT_ROOT`) hasta profundidad 6, salta `INDEX_SKIP_DIRS`
  (`node_modules .git dist dist_electron .vite venv __pycache__ .cerebro-db`, `v2.0:895` · `v2.1:1045`),
  ignora archivos > 300 KB, tope 200 archivos — **lee del disco, no recibe contenido por red** ✔.
- Se dispara: al arrancar el prompt si el mapa está vacío (`v2.0:4892-4896` · `v2.1:5794-5798`),
  y en `POST /api/engine/sync` (`v2.0:2120` · `v2.1:2555`).

### 5.3 Herramienta `find_symbol` y endpoint [HECHO]

- Esquema: `toolRegistry.ts:401-413` (`name`, `limit`), declarada barata (`cheap: true`).
- Implementación: `findSymbols(map, query, limit=8)` (`symbolIndex.ts:156-170`) — **coincidencia exacta
  primero, luego parcial** (`name.includes(q)`), sobre TODOS los archivos del mapa.
- Endpoint `GET /api/engine/symbols` (`v2.0:2131-2149` · `v2.1:2566-2584`): sin `q` → total + lista por
  archivo + `summary`; con `q` → `found` + `results[{file,line,kind,signature}]`, `limit` acotado a 30.

---

## 6. `compactor.ts` — disciplina de contexto

Presupuesto por defecto `DEFAULT_BUDGET = 2600` caracteres (`:40`), mínimo forzado 400 (`:59`).

| Tipo | Reglas exactas | Línea |
|---|---|---|
| **file** | estructura: líneas que casan `KEEP_LINE` (`import|export|from|require|package|using|#include|def |class |function |interface |type |const |let |var |async |@|\"\"\"|'''|///`), escaneadas en las primeras **120** líneas, máx **40**; luego `[INICIO]` 25 líneas numeradas y `[FINAL]` 25 líneas numeradas; hueco marcado `[…N línea(s) centrales omitidas: pídelas con read_file_range…]` | 88-104 |
| **command** | principio 30 + final 30 + `[…N línea(s) intermedias omitidas…]` + todas las líneas que casan `ERROR_LINE` (máx 40) bajo el rótulo `[LÍNEAS DE ERROR/AVISO DESTACADAS POR EL MOTOR]` | 74-81 |
| **search** | `keep = max(5, min(total, floor(budget/90)))` primeros resultados + `[…N resultado(s) más, repite la búsqueda con un filtro más específico…]` | 82-87 |
| **json** | `describe()` estructural: claves/tipos/longitudes, arrays → `array[N]` con 3 elementos, objetos → 12 claves, escalares → `tipo = valor` (recortado a 80) | 70-73, 145-171 |
| **text** | principio 20 + final 20 | 105-110 |
| Guardas finales | si aún excede el budget → `slice(0, budget) + "[…recortado por el motor: pide el resto por partes…]"`; cabecera con etiqueta y métricas | 112-122 |

**La regla «los errores nunca se compactan» [HECHO]** — `compactToolResult(toolName, output, isError)`:

```ts
if (isError) return { output };        // compactor.ts:179
```

`isError` se calcula en el bucle de agente como `JSON.parse(result)?.ok === false`
(`server.ts` v2.0:1493-1498 · v2.1:1652-1660). Mapa herramienta→tipo en `:180-192`
(`read_file*`/`fetch_url`/`pc_read_file` → file; `run_command`/`run_tests`/`git_diff`/`pc_exec` → command;
`search_in_files` → search; `list_files`/`git_status` → text; resto → text).
La nota de ahorro se emite al log con `🧠 ${fnName}: motor: … (ahorro N%)` (`server.ts` v2.0:1500-1502 · v2.1:1659-1661)
y la salida compactada es la que se devuelve al modelo (`messages.push({role:"tool", content: compacted.output})`).

⚠️ **Matiz [HECHO]:** el umbral de líneas que menciona el doc (600 líneas / 400 de log) es **retórico**:
la decisión real es por **caracteres** (`originalChars <= budget` ⇒ no se toca, `:63-65`). Un archivo de
3.000 líneas muy cortas puede no compactarse.

---

## 7. Aprendizaje del motor: de error real a entrada de KB

`learnFromToolFailure(toolName, args, result)` — `server.ts` v2.0:965-993 · v2.1:1115-1153.
Se invoca cuando `isError === true` en el bucle de agente (`v2.0:1512-1514` · `v2.1:1671-1673`), en
`/api/fs/sync` por cada archivo rechazado (`v2.1:4246`) y por imports sin resolver (`v2.1:4336`), y en
fallos de proveedor (`v2.1:4977`).

| Paso | Código | Detalle |
|---|---|---|
| 1. Extraer el error | v2.0:967-972 · v2.1:1126-1131 | `JSON.parse(result).error`; si no es JSON, el texto crudo |
| 2. **Normalizar** (para no guardar una entrada por cada ruta) | `:975-978` · `:1134-1137` | `replace(/[A-Za-z0-9_./\\-]{8,}/g, "<ref>")` y `replace(/\d+/g, "<n>")`, recorte a **180** car. |
| 3. **Dedupe** por id | `:979` · `:1138` | `id = fail:<tool>:<primeros 40 car. de lo normalizado, \W+→->` — el **mismo** fallo reescribe la misma entrada (`upsert`) en lugar de acumular |
| 4. Acotación | `:985` · `:1144` | cuerpo con `errorText.slice(0, 200)` + pista de argumento (`path` o `command` ≤60 car.) |
| 5. Entrada | `:981-988` · `:1140-1147` | `table:"error"`, `weight: 0.65`, `keys: [tool, ...tokenize(errorText).slice(0,8)]` |
| 6. Persistencia | `:989` · `:1148` | `kbDirty = true` (se escribe en el siguiente autosave de 30 s) |
| 7. Blindaje del aprendizaje | `:990-992` · `:1149-1152` | `try/catch` total: «el aprendizaje nunca debe romper la ejecución de una herramienta» |

**Novedad v2.1 [HECHO]:** además se registra en la **memoria viva** antes de tocar la KB
(`server.ts:1116-1124`):

```ts
brain.registrarFallo(toolName, result);          // §[Incidencias Críticas] + métrica "incidentes"
features.commitMemoria(`incidencia: ${toolName}`); // commit en el historial git de memoria.md
```

`Brain.registrarFallo` (`brain.ts:289-293`) añade `Herramienta **X** falló: <200 car.>` a la sección
`[Incidencias Críticas]` y hace `bumpMetrica("incidentes", 1)` (`brain.ts:298-321`).

**Aprendizaje desde lecciones (doc §2, endpoint `kb/learn`):** `KnowledgeBase.learnFromLesson`
(`knowledgeBase.ts:143-152`) crea `lesson:<id>` con `title = text.slice(0,60)`, `keys` = 14 primeros tokens
+ tags, `weight 0.6`.

---

## 8. Resiliencia: ¿se unificó la duplicación que pide la IDEA §9?

**Lo que dice el doc (§9.2, líneas 167-168):** «existe `src/utils/resilience.ts` de la v1.1 y el nuevo
`src/engine/resilience.ts`. Hay que unificar en el del motor.»

**Verificación por búsqueda exhaustiva (`find` en todo `cerebronico_evolution`):**

| Ruta | ¿Existe? |
|---|---|
| `…/src/utils/resilience.ts` en v2.0 | **NO EXISTE** |
| `…/src/utils/resilience.ts` en v2.1 | **NO EXISTE** |
| `…/src/utils/resilience.ts` en v1.0 / v1.0.1 / v1.0.2 / v1.0.3 / v1.1.1 | **NO EXISTE** |
| `…/src/engine/resilience.ts` en v1.0, v1.0.1, v1.0.2, v1.0.3, v1.1.1, v2.0, v2.1 | **EXISTE en las 7** |
| `…/tests/resiliencia.test.ts` | sólo en v1.1.1 |

**Conclusiones:**
1. **[PROMETIDO/FALSO]** La premisa del doc es **incorrecta**: nunca hubo dos `resilience.ts`. El módulo
   nació ya dentro de `engine/` (presente desde v1.0) y **no existe** en `src/utils/`. La "duplicación" que
   §9.2 manda arreglar **no es verificable en los árboles entregados**.
2. **[HECHO]** `src/engine/resilience.ts` es **byte-idéntico en v2.0 y v2.1** (10.702 B, 302 líneas): v2.1
   **no tocó** resiliencia. La tarea §9.2 queda **no ejecutada** (y probablemente era un objetivo nulo).
3. **Duplicaciones reales que sí existen [HECHO]:** lógica de reintento/espera replicada fuera del módulo:
   - bucle de reconexión manual a Ollama (`server.ts` v2.0:4940-5010 · v2.1:5860-5930) con
     `OLLAMA_MAX_CONNECT_ATTEMPTS` y `withRetry` **en paralelo** al bucle propio;
   - `sleep` redefinido localmente en el servidor además de exportarse en `resilience.ts:117`;
   - `src/utils/healthCheck.ts`, `src/utils/selfHealing.ts` y `src/utils/restorePoints.ts` mantienen
     su propia noción de "fallo recuperable" sin pasar por `classifyError()`.
   **Acción V8:** sustituir esos tres puntos por `classifyError`/`withRetry`/`withFallback` del motor.

**Contenido real de `engine/resilience.ts` (idéntico en ambas) [HECHO]:**

| API | Línea | Comportamiento |
|---|---|---|
| `classifyError(err)` | 59-103 | 6 clases: `auth` (401/403), `quota` (429 + `retryAfter`), `timeout` (408/504), `offline` (dns/enotfound), `fatal` (lista negra), `retryable` (5xx + patrones de red); **desconocido ⇒ `retryable`** |
| `withRetry(fn, opts)` | 131-167 | `attempts 3`, `baseDelay 600 ms`, `maxDelay 8 s`, `budgetMs 90 s`, backoff exponencial + jitter; **no reintenta `auth`/`fatal`**; adjunta `cnAttempts`/`cnClass` al error |
| `withFallback(attempts, onEvent)` | 253-296 | cadena ordenada por etiqueta; **salta** proveedores con cortacircuitos abierto; eventos `{label, ok, reason, ms, skipped}` |
| Cortacircuitos | 172-226 | `recordFailure` (umbral 3), `recordSuccess`, `isCircuitOpen(key, 60 s)` con semiapertura (resetea al expirar), `breakerStatus`, `resetBreakers` |
| `describeResilience()` | 299-302 | texto para el log: `proveedor: N fallo(s) (abierto)` |

---

## 9. Perfiles de rendimiento (`modelTiers.ts`, idéntico v2.0/v2.1)

### 9.1 Clasificación y valores [HECHO]

- `getTier` (`:110-118`): `micro ≤1.6B` · `tiny ≤3.5B` · `small ≤8B` · `medium ≤34B` · `large >34B` · `cloud` (nombre con `-cloud`/`:cloud`).
- Tamaño leído del nombre con `[:@_-](\d+(\.\d+)?)\s*(b|m)` (`:74`, `:96-103`).
- **Herramientas (bucle de agente):** lista blanca `TOOL_CAPABLE_ALLOWLIST` (`:85-86`) **Y** `paramsB >= 4`
  (`TOOL_CAPABLE_MIN_PARAMS_B = 4`, `:93`). Todo lo que no pase → **sin herramientas, streaming directo**.
- `lowRam = ramGb > 0 && ramGb <= 8` (`:129`) es el "recorte por 8 GB" **real del motor**.

| Tier | num_ctx | num_predict | num_batch | keep_alive | temp | contextCharBudget | historyTurns | maxOpenFiles / maxFileChars | Línea |
|---|---|---|---|---|---|---|---|---|---|
| micro | 2048 | 400 | 128 | `30m` | 0.35 | 6.000 | 4 | 1 / 1.500 | 149-160 |
| tiny | 4096 | 700 | 128 | `30m` | 0.40 | 12.000 | 6 | 2 / 2.500 | 161-172 |
| small | 4096 si ≤8 GB, si no 8192 | 1200 | 256 | `30m` | 0.45 | 16.000 / 24.000 | 8 | 3 / 4.000 | 173-184 |
| medium | 8192 si ≤8 GB, si no 16384 | 2000 | 512 | `30m` | 0.50 | 40.000 / 60.000 | 14 | 4 / 6.000 | 185-196 |
| large | 32768 | -1 (sin tope) | 512 | `30m` | 0.50 | 200.000 | 30 | 6 / 12.000 | 197-208 |
| cloud | 32768 | -1 | 512 | `10m` | 0.50 | 200.000 | 30 | 6 / 12.000 | 209-221 |

- **`num_thread`** (`numThreadSuggestion`, `:250-256`): `max(2, min(cores-1, 4))` en micro/tiny;
  `max(2, min(cores-1, 12))` en el resto. **Se reserva 1 hilo para la UI** (evita que Ollama congele la interfaz).
- `buildOllamaOptions()` (`:275-297`): añade siempre `temperature` (clamp 0.05-1.0), `num_ctx`, `num_batch`,
  `repeat_penalty 1.12`, `repeat_last_n 128`, `top_k 40`, `top_p 0.9`; `num_thread` si ≠null;
  `num_predict` **sólo si > 0** (no se envía `-1` para no pisar el default en modelos grandes/nube).
- `trimMessagesToBudget()` (`:304-336`): conserva TODOS los `system`, últimos `historyTurns*2` mensajes,
  va soltando los antiguos hasta caber en `budgetChars`, y como último recurso trunca mensajes largos a
  `max(800, budget/kept)` con marca `[…recortado para no saturar el contexto del modelo local…]`.

### 9.2 Dónde viven los valores y cómo llegan a Ollama [HECHO]

| Elemento | Ubicación |
|---|---|
| `CPU_CORES`, `RAM_GB` (reales del equipo) | `server.ts` v2.1:891-892 (v2.0 análogo) — `os.cpus().length`, `os.totalmem()` redondeado a GB |
| `getProfile(model)` (envoltorio local) | `server.ts` v2.1:883-889 |
| Opciones en el chat | `server.ts` v2.0:5001-5007 · v2.1:5900-5906 (`keep_alive: profile.keepAlive`, `options: buildOllamaOptions(...)`) |
| Opciones en el bucle de agente (no-streaming) | `server.ts` v2.1:1530-1534 |
| **Precalentado** | `POST /api/ollama/warmup` — v2.0:2182-2234 · v2.1:2617-2669: `POST /api/generate` con `prompt:""`, `keep_alive` y las **mismas** `options` (comentario explícito: «si no, Ollama recarga el modelo con otra ventana y el precalentado no sirve»), timeout 120 s |
| Perfil expuesto | `GET /api/ollama/perf?model=` — v2.0:2159-2176 · v2.1:2594-2615 (`suggestedOptions`, `contextCharBudget`, `keepAlive`, `notes`) |
| Salud profunda | `GET /api/health/deep` — v2.0:2301 · v2.1:2954 |

### 9.3 "Modo 8 GB" [HECHO] — son **dos cosas distintas** con el mismo nombre

1. **Modo 8 GB de UI** (`src/constants.ts:318-322`, `:245`): perfil `"auto" | "8gb"` que en CSS apaga
   `backdrop-filter` y animaciones infinitas (`src/index.css:555`, `App.tsx:404,960`,
   `Header.tsx:96,484-493`). **No toca** `num_ctx` ni ninguna opción de Ollama.
2. **Recorte de motor por RAM** (`modelTiers.ts:129,174,179,186,191,224-226`): cuando `RAM_GB <= 8`,
   baja `num_ctx`/`contextCharBudget` y añade la nota «num_batch reducido y contexto ajustado para evitar swap».

**[PROMETIDO]** El doc (§8, línea 158) dice «usa modelos 0,4-1,5 GB con el **Modo 8 GB** activado» como si
fuera un único ajuste de rendimiento; en el código el botón de UI **no influye** en los parámetros de Ollama.
El recorte de verdad es automático por RAM detectada, no por el botón.

---

## 10. Memoria viva (`memoria.md` + `cerebro.md`) en v2.1

### 10.1 Ficheros [HECHO]

| Fichero | Líneas | Naturaleza |
|---|---|---|
| `ide/backend/cerebro.md` | 179 | **Ley inmutable**: identidad, guardrails, protocolo rápido, estándares, auto-evolución, fast-decision (`cerebro.md:1-171`, 7 secciones) |
| `ide/backend/memoria.md` | 108 | **Estado vivo**: `ESTADO`, ADR log, preferencias, backlog, incidencias, métricas — con marcadores `<!-- BLOQUE-DINAMICO:X -->` (`memoria.md:13-108`) |

⚠️ Contexto: ambos archivos **ya existían en v1.0/v1.0.1/v1.0.2/v1.0.3/v1.1.1**; lo que v2.1 añade es el
**motor que los consume** (`brain.ts`). v2.0 **no tiene** `brain.ts` (sólo los recibe como
`hiddenSystemFiles` enviados por el cliente, `server.ts` v2.0:3949-3955).

### 10.2 Cómo se consumen (rastreo de código) [HECHO]

| Aspecto | Evidencia |
|---|---|
| Instanciación | `server.ts` v2.1:973 `const brain = new Brain(process.cwd())` |
| Rutas | `brain.ts:68-74`: `cerebro.md`, `memoria.md`, `memoria_history/`, propuestas en `.cerebro-db/proposals`, lock en `.cerebro-db/memoria.lock` |
| Carga al arrancar | `server.ts:987-995` `brain.load()` + log de `brain.stats()` (`cerebro.md N chars · memoria.md N líneas · historial · propuestas`) |
| **¿Se inyecta en el prompt?** | **SÍ.** `server.ts:4803-4816`: nivel por tier (`micro/tiny→micro`, `small→compact`, `medium→standard`, `large/cloud→pro`), `bloqueBrain = brain.systemBlock(nivel)`, y **sólo si `brain.getCerebro().length > 200`**. Se antepone a `consolidatedSystemInstruction`, que es **el punto único de los 6 proveedores** |
| Niveles del bloque | `brain.ts:495-563`: `micro` → 7 reglas fijas + estado en 1 línea; `compact` → `cerebroCondensado()` (≤4.200 car., `:484-493`) + estado, **sin incidencias**; `standard/pro` → cerebro completo + estado + **últimas 3 incidencias** + protocolo de cierre obligatorio |
| **¿El motor escribe en `memoria.md`?** | **SÍ**, 5 vías: (a) `registrarFallo()` en cada error de herramienta (`server.ts:1120` → `brain.ts:289-293`); (b) `registrarInteraccion()` en cada turno (`server.ts:4818` → `brain.ts:342-345`); (c) `bumpMetrica()` ×5 claves; (d) `addDecision/addLesson/addIncident` vía `POST /api/brain/{decision,lesson}`; (e) `compactar()` |
| Escritura atómica | `brain.ts:143-147`: `writeFileSync(tmp)` + `renameSync(tmp, ruta)`; lock cooperativo con `memoria.lock` y timeout 3.000 ms (`:105-141`) |
| **¿Métricas en memoria.md?** | **SÍ**: bloque `METRICAS` con `Interacciones registradas`, `Archivos rechazados por el blindaje`, `Imports sin resolver detectados`, `Propuestas de auto-mejora pendientes`, `Incidentes registrados` (`brain.ts:298-321`) |
| Compresión | cada **10** interacciones (`brain.ts:342-345`): `compactar()` conserva las **12** incidencias más recientes + las que casan `crític|critic|blindaje|corrup` (`:351-361`) y deja snapshot |
| **¿`memoria_history/` con rollback?** | **SÍ.** `snapshot()` (`:150-177`) escribe `memoria_history/memoria_YYYYMMDD_HHMMSS.md`, con **máx 1 cada 20 s** y **retención de 60** copias. `listarHistorial()` (`:428-442`). **Rollback real**: `POST /api/brain/rollback` (`server.ts:2467-2473`) → `brain.rollback(archivo)` (`:444-462`) que hace snapshot `pre-rollback` y restaura con escritura atómica |
| Otros endpoints | `GET /api/brain` (stats+memoria+historial+propuestas, `server.ts:2409-2422`), `POST /api/brain/state|decision|lesson|scan|compact`, `GET /api/brain/history` (`:2462`), `GET /api/brain/prompt` (`:2480`) |
| Auto-parcheo del CEREBRO | `brain.ts:366-423`: `detectarPropuestas()` parsea bloques `[PROPUESTA DE AUTO-MEJORA CEREBRO]` de la respuesta del modelo y los guarda como **propuesta en `.cerebro-db/proposals/` — NUNCA se aplican solas** (`:404-406`) |
| Rol en la práctica | la propia `memoria.md:96-98` muestra 3 propuestas reales ya registradas → **[HECHO] el bucle se ejecutó en el entorno del autor** |

### 10.3 RAG local de la memoria [HECHO, apagado por defecto]

- `LocalRAG` (`localRAG.ts`, 389 líneas): embeddings vía Ollama `/api/embed`, **fallback determinista** por
  hashing de tokens (256 dims) cuando no hay modelo; índice compacto en `Float32Array` (4 B/dim, novedad v2.1);
  `RAG_THRESHOLD_LINES = 5000` (`:55`).
- Coste en reposo cero: `server.ts:4829` sólo entra `if (localRag.isEnabled())`, con presupuesto
  `nivelBrain === "micro" ? 600 : 1400` (`:4830-4838`).
- Endpoints `/api/rag/{status,toggle,model,index,search,clear}` y `/api/features/deep-index`
  (`server.ts:2326-2406`).

---

## 11. Panel de "Autosuperación"

### 11.1 Frontend [HECHO]

| Elemento | Ubicación |
|---|---|
| Componente | `src/components/SelfImprovementPanel.tsx` (importado en `App.tsx:69`, renderizado en `App.tsx:3121-3126`) |
| Pestañas | `metricas` / `lecciones` (`SelfImprovementPanel.tsx:45`) |
| **KPIs mostrados** | **Éxito %**, **Primer token (s)**, **Turno medio (s)**, **Tokens/s** (`:139-153`) |
| Tendencia | `firstTokenTrendPct` vs sesión anterior con mensajes «Mejorando…» / «Cuidado…» (`:156-166`) |
| Rendimiento por modelo | tabla por modelo: turnos, éxito, primer token (`:171-…`) |
| Fuente de datos | **localStorage del navegador**, no el servidor: claves `cerebronico_lessons_v2`, `cerebronico_metrics_v2`, `cerebronico_metrics_session` (`selfImprovement.ts:88-93`) |
| Límites | `MAX_LESSONS = 120`, `MAX_METRICS = 400` (`:92-93`) |

### 11.2 Motor de la autosuperación [HECHO] (`src/utils/selfImprovement.ts`, 427 líneas)

| Pieza | Línea | Detalle |
|---|---|---|
| `TurnMetric` | 55-72 | `at, provider, model, firstTokenMs?, totalMs, tokensOut?, ok, failureKind?, tier?, attempts?` |
| `recordTurnMetric` | 254-259 | push + recorte a 400 |
| `getImprovementSummary` | 266-330 | éxito %, medias de primer token y total, **tokens/s = mean(tokensOut / (totalMs/1000))**, tendencia vs sesión previa, top-5 fallos, lecciones, `byModel` |
| `getRelevantLessons(text, 4)` | 192-220 | score = `solape*1.6 + peso*1.2 + recencia*0.4 + eficacia*0.8 − fatiga*0.6`, umbral `>0.9`, marca `used/lastUsedAt` |
| `buildSelfImprovementDirective(lessons, 700)` | 226-232 | bloque `[LECCIONES APRENDIDAS — aplica esto sin que te lo pidan]`, presupuesto 700 car. |
| `confirmLastLessonsUsed(ok)` | 169-185 | refuerza (`helped+1`, `weight+0.08`) o enfría (`−0.04`) las lecciones usadas en los últimos 10 min |
| `reflectOnTurn(...)` | 361-427 | reflexión **determinista** (0 tokens de modelo): corrección de usuario, `quota`, `auth`, `timeout`, error genérico, micro/tiny con tarea de herramientas, primer token ×2 sobre baseline, éxito notable |

### 11.3 Dónde se mide y dónde se inyecta [HECHO]

| Paso | Ubicación |
|---|---|
| Cierre de turno → métrica + lección | `App.tsx:1197-1253` (efecto al dejar de hacer streaming): `totalMs`, `firstTokenMs`, `looksFailed` por heurística de texto, `tokensOut: Math.round(text.length/4)`, `recordTurnMetric`, `confirmLastLessonsUsed`, `reflectOnTurn`, `setImprovementSummary` |
| Inyección de lecciones en el prompt | `App.tsx:1838-1850`: `getRelevantLessons(text, 4)` → `buildSelfImprovementDirective(...)` pasado como `extra` al payload de contexto |

⚠️ **[HECHO] tokens/s y TTFT son estimaciones de cliente**: `tokensOut = caracteres/4` (`App.tsx:1227`) y
`firstTokenRef` lo fija el render del primer chunk. **El servidor no mide TTFT ni tokens/s reales**
(no hay endpoint de métricas de inferencia; `tokensPerSec: 64.2` aparece en `server.ts` v2.1:4427/4470 sólo
como **literal dentro del texto de la respuesta autónoma de fallback**, no como telemetría).

---

## 12. Verificación reproducida: ¿existe el arnés de "21 PASS"?

### 12.1 Lo que dice el doc (§6, líneas 120-132)

| Comprobación declarada | Método | Resultado declarado |
|---|---|---|
| Sintaxis de 57 archivos TS/TSX | `esbuild` transformando cada archivo | 0 fallos |
| Grafo de imports del cliente | `esbuild --bundle src/main.tsx` | OK (651,9 kB + 10,9 kB CSS) |
| Grafo de imports del servidor | `esbuild --bundle server.ts` | OK (203,2 kB) |
| Blindaje de sintaxis | 9 casos | 9 PASS / 0 FAIL |
| Base de datos del motor | 7 casos | 7 PASS / 0 FAIL |
| Blindaje de llamadas | 5 casos | 5 PASS / 0 FAIL |
| Instalador | ejecución real | OK |
| **Total** | | **21 PASS / 0 FAIL** |

### 12.2 Lo que existe realmente en el repo [HECHO]

| Script de prueba | Ruta | ¿Reproducible? |
|---|---|---|
| `PRUEBAS_MANUALES_MOTOR.ts` (23 líneas, **10 checks**) | `v2.0/CerebroNico-IDE-v2.0/` y `v2.1/CerebroNico-IDE-v2.1/` (idénticos) | **NO.** Su `import` apunta a una ruta absoluta de **otra cuenta y otro proyecto**: `/home/wuying/.accio/accounts/**7098045885**/agents/DID-82AD6B-1182AD6BU1789665-8223-C6D357/project/build/…` (`:1-2`). Esa ruta **no existe** en este entorno ⇒ `tsx`/`node` falla al resolver el import |
| `tests/comprehensive_e2e_test.py` (39.630 B) | ambas versiones (idénticos) | **SÍ, con matices:** es un test E2E del **endpoint `/api/ai/stream`** con mocks de 4 proveedores y verificación de streaming + regresión del bug `req.on("close")`. **No contiene ni una referencia** al motor (`rg 'engine\|syntaxGuard\|kb\|symbol\|compactor'` → 0 coincidencias) |
| `tests/mock_ollama.py` (6.060 B) | ambas | Apoyo del anterior |
| Suites de sintaxis / KB / tool-calls del doc (9+7+5) | — | **NO EXISTEN como ficheros** en ninguna de las dos versiones |
| Suite que produce las 40 líneas `PASS` de `RESULTADO_PRUEBAS_MOTOR.txt` | — | **NO EXISTE**: la cadena «FASE 1 · blindaje de sintaxis» sólo aparece en el propio `.txt` y en comentarios de `server.ts`/`syntaxGuard.ts`, nunca en un runner |

**Comandos reales disponibles (`package.json`, idéntico en v2.0 y v2.1):**

```jsonc
"dev":           "tsx server.ts",
"build":         "vite build && esbuild server.ts --bundle --platform=node --format=esm --packages=external --sourcemap --outfile=dist/server.mjs",
"start":         "node dist/server.mjs",
"lint":          "tsc --noEmit",
"test:e2e":      "python3 tests/comprehensive_e2e_test.py",
"postinstall":   "node scripts/postinstall.mjs"
```

- `npm run build` ejecuta el `esbuild` que sostiene la fila 1-3 de la tabla del doc (no hay script de
  "57 archivos"; sería un bucle manual).
- `npm test` **no existe**: el único test enganchado es `test:e2e` (Python) y **no cubre el motor**.
- No hay `vitest`/`jest` en dependencias (`devDependencies` listadas: electron, esbuild, tsx, typescript,
  vite, @types/*, @vitejs/plugin-react).

### 12.3 Comprobación estática adicional que aporta esta auditoría [HECHO]

`manuals.ts` devuelve objetos tipados como `KbEntry` con **dos campos que ese tipo no admite**:

```ts
// manuals.ts:28-36
const M = (...): KbEntry => ({ id, table: "manual", title, body, keys, tags, weight, lang: "es" });
//                                          ^^^^^^^^^^^^^^^^   ^^^^
// KbTable (knowledgeBase.ts:32) = "syntax"|"error"|"pattern"|"tool"|"skill"|"rule"|"project"|"lesson"
// KbEntry (knowledgeBase.ts:34-45) NO declara `tags`
```

⇒ `npm run lint` (`tsc --noEmit`) debería fallar con `TS2353`/`TS2820` en `manuals.ts`. Esto **no invalida**
la fila de `esbuild` del doc (esbuild **no** comprueba tipos), pero sí demuestra que **la verificación
declarada no fue `tsc`**. **[DUDOSO]** no se pudo ejecutar `tsc` aquí (sin `node_modules` ni red); queda como
hallazgo de análisis estático, con alta confianza por la definición literal de los tipos.

---

## 13. `RESULTADO_PRUEBAS_MOTOR.txt` — contenido completo

**Localización:** `v2.0/CerebroNico-IDE-v2.0/RESULTADO_PRUEBAS_MOTOR.txt` y
`v2.1/CerebroNico-IDE-v2.1/RESULTADO_PRUEBAS_MOTOR.txt` — **mismo `md5` (`1d43d3ce…`)** y además **idéntico
al de v1.0.1, v1.0.2, v1.0.3 y v1.1.1** ⇒ **[HECHO] es un artefacto arrastrado, no una verificación de v2.1
(48 líneas):**

```
 ── FASE 1 · blindaje de sintaxis ──
   PASS TSX válido
   PASS JSON roto rechazado
   PASS JSX sin cerrar rechazado
   PASS llaves desbalanceadas
   PASS truncado con «…»
   PASS Python sin ':'
   PASS Python correcto
   PASS CSS desbalanceado
 ── FASE 1 · base de datos y herramientas ──
   PASS semilla >= 25 entradas
   PASS consulta json devuelve entradas
   PASS consulta de RAM devuelve err-oom/err-timeout
   PASS sin relación no inventa
   PASS llamada válida
   PASS falta obligatorio
   PASS campo inventado se descarta
   PASS número en texto se convierte
 ── FASE 2 · índice de símbolos ──
   PASS detecta la interfaz Props
   PASS detecta el componente Panel
   PASS detecta la clase Store
   PASS detecta el método save
   PASS detecta helper como función exportada
   PASS guarda la línea correcta
   PASS detecta def de Python
   PASS detecta class de Python
   PASS mapa con total > 0
   PASS findSymbols encuentra Panel
   PASS findSymbols no inventa
   PASS resumen de símbolos dentro del presupuesto
   PASS resumen avisa de no inventar
 ── FASE 2 · compactador de contexto ──
   PASS archivo grande se compacta
   PASS ahorro superior al 60%
   PASS conserva la firma final
   PASS log se compacta
   PASS conserva la línea de ERROR
   PASS conserva el traceback
   PASS JSON grande se resume
   PASS el resumen informa del tamaño del array
   PASS salida corta no se toca
   PASS los errores NO se compactan
   PASS los aciertos SÍ se compactan

 RESULTADO FINAL: 40 PASS · 0 FAIL
```

### 13.1 Contradicciones detectadas en ese artefacto

| Línea del informe | Contra el código auditado | Gravedad |
|---|---|---|
| `PASS JSX sin cerrar rechazado` | **No puede reproducirse**: `checkTagPairing` sólo se invoca con `"html"` (`syntaxGuard.ts:401`); el camino `"jsx"` (`:191,216-221`) es código muerto. Un `.tsx` con etiqueta sin cerrar devuelve `ok:true` | **Alta** — invalida la fila |
| `PASS Python sin ':'` | En **v2.1** los issues de Python **no bloquean** (`:435-446`): `ok` sería `true`. El PASS describe comportamiento **v2.0** | Alta (v2.1) |
| `PASS llaves desbalanceadas` | Sólo bloquean en `css`/`html`. Si el caso era `.ts`, no se comprueba balance (`:364-367`) | Media |
| `FASE 2 · compactador`: `PASS ahorro superior al 60%` | La estrategia `file` conserva 40 firmas + 50 líneas y marca el hueco: el ahorro depende del archivo; **no hay aserción de ≥60%** en ningún código entregado | Media |
| Total **40 PASS** vs doc §6 «**21 PASS** (9+7+5)» | **Dos cifras distintas para la misma verificación**; ninguna de las dos tiene runner en el repo | Alta (trazabilidad) |

**[DUDOSO]** El contenido del `.txt` **es técnicamente plausible** (los 40 casos describen exactamente el
comportamiento que el código implementa, en su gran mayoría), pero **es un volcado sin runner**.
Regla para la V8: **no se fusiona nada cuya única evidencia sea este fichero**.

---

## 14. Matriz doc↔código (todo el `IDEA_DEL_MOTOR_v2.0.md`)

| # | Afirmación del doc (línea) | Veredicto | Evidencia |
|---|---|---|---|
| 1 | KB persistida en `.cerebro-db/kb.json` (24) | **HECHO** | `server.ts` v2.0:842-843 · v2.1:961-962 |
| 2 | Sin embeddings, recuperación determinista por solape + prioridad + peso (26-28) | **HECHO** | `knowledgeBase.ts:185-213` |
| 3 | **28 entradas** de fábrica (30) | **FALSO** | 32 en `KB_SEED`; 62 con manuales (`:76-120`, `manuals.ts:282`) |
| 4 | 8 tablas con el contenido descrito (32-41) | **HECHO con matiz** | las 8 existen (`:32`), pero los manuales usan una 9ª tabla **fuera del tipo**: `"manual"` (`manuals.ts:28-36`) |
| 5 | `project` se rellena solo vía `/api/engine/sync` (40) | **HECHO** | `server.ts` v2.0:2117-2128 · v2.1:2552-2563 + `reindexProjectSymbols` |
| 6 | `lesson` se rellena desde el bucle de autosuperación (41) | **HECHO parcial** | `learnFromLesson` existe (`:143-152`) y hay endpoint; pero **el bucle de autosuperación del cliente escribe en `localStorage`, no en la KB del motor** — las lecciones **no** llegan a `.cerebro-db/kb.json` salvo POST manual |
| 7 | `buildEngineContext()` con las **5** más relevantes (43-46) | **HECHO** | `limit=5` en `server.ts` v2.0:4868 · v2.1:5770 |
| 8 | Presupuesto **700 micro / 1200 resto** (46) | **HECHO** | v2.0:4869 · v2.1:5771 |
| 9 | «Cambiar de modelo no cambia el resultado» (17-18) | **PROMETIDO (parcial/falso)** | KB+manuales+símbolos sólo en la ruta Ollama: v2.0:4827-4900 · v2.1:5728-5801 vs rutas nube 4924-5659 (v2.1) |
| 10 | Endpoints del motor listados (48-50) | **HECHO** | 8/8 presentes (§2.5) + 15 extra en v2.1 |
| 11 | «nada llega al disco sin validarse», escritura rechazada/revertida (56-60) | **HECHO** | 5 puertas (§3.4): `write_file`, `edit_file`, `/api/engine/guard`, `/api/fs/write`, `/api/fs/sync` |
| 12 | JSON inválido con `JSON.parse` (64) | **HECHO** | `syntaxGuard.ts:352-362` |
| 13 | Paréntesis/corchetes/llaves desbalanceados ignorando strings y comentarios (65-66) | **PROMETIDO** | `scanBalance` correcto pero **sólo** para `html`/`css` (`:398-407`) |
| 14 | Cadenas y plantillas sin cerrar; comentarios de bloque sin cerrar (67) | **PROMETIDO parcial** | backticks **retirados** (`:382-393`); `/*` sólo si abre línea (`:372`) |
| 15 | JSX/HTML etiquetado pareado, incluidos `<Componente>` (68-69) | **PROMETIDO** | `checkTagPairing(...,"jsx")` nunca se llama: código muerto |
| 16 | CSS: llaves desbalanceadas (70) | **HECHO** | `:403-407` |
| 17 | Python: tabs/espacios + `def/if/for/while/class` sin `:` (71) | **HECHO (detecta)** — pero en v2.1 **no bloquea** | `:261-300`, `:435-446` |
| 18 | Marcadores de truncamiento (`…`, `<...>`, «resto del código», TODO) (72-73) | **HECHO con matiz** | sólo si están en las **últimas 3 líneas** (`:338`) |
| 19 | `POST /api/engine/guard` disponible (75) | **HECHO** | v2.0:2106 · v2.1:2541 |
| 20 | `validateToolCall()` en `knowledgeBase.ts`, aplicado en `executeToolCall()` (81) | **HECHO** | `:265-320` + v2.0:1017 · v2.1:1176 |
| 21 | Faltante / inventado (se descarta) / tipo / coerción `"40"→40` / enum (86-89) | **HECHO** | 5 vías verificadas una a una (§4) |
| 22 | `postinstall.mjs` crea KB + `tools.config.json` + informe de entorno (97-104) | **HECHO** | `scripts/postinstall.mjs`; v2.1 además garantiza salida 0 (`:23-43,163-166`) |
| 23 | Verificación: esbuild 57 archivos / bundles 651,9 kB / 203,2 kB (124-126) | **[DUDOSO]** | el `npm run build` existe (`package.json`), pero **no hay script de 57 archivos ni log en el repo**; no ejecutable sin `node_modules` |
| 24 | «9 PASS / 7 PASS / 5 PASS = 21 PASS» (127-132) | **FALSO (no reproducible)** | no existe runner; `RESULTADO_PRUEBAS_MOTOR.txt` dice **40 PASS** con otro desglose |
| 25 | §7 Honestidad: app no arrancada, perfiles no medidos (136-145) | **HECHO (autocrítica correcta)** | confirmado: nada en el repo mide TTFT/tok-s reales |
| 26 | §9.2 unificar `src/utils/resilience.ts` con `engine/resilience.ts` (167-168) | **FALSO / NULO** | `src/utils/resilience.ts` **no existe en ninguna versión**; `engine/resilience.ts` idéntico en v2.0/v2.1 |
| 27 | §9.3 indexar símbolos además de rutas (169-170) | **HECHO** | `symbolIndex.ts` + `symbols:<path>` en KB |
| 28 | Fase 2 §1: firma real, `[SÍMBOLOS REALES DEL PROYECTO]`, 700/1300 (191-193) | **HECHO** | `symbolIndex.ts:173-185`; v2.0:4897 · v2.1:5799 |
| 29 | Fase 2 §1: coste ~400 car. vs ~12.000 (200) | **[DUDOSO]** | el resumen está acotado a 700/1300 car. por diseño; la cifra 400/12.000 no se mide en código |
| 30 | Fase 2 §1: `find_symbol` y endpoints `symbols`/`sync` (196-204) | **HECHO** | `toolRegistry.ts:401-413`; endpoints §2.5 |
| 31 | Fase 2 §2: 4 estrategias de compactación (213-218) | **HECHO** | `compactor.ts:70-110` |
| 32 | Fase 2 §2: «los errores no se compactan nunca» (220-221) | **HECHO** | `compactor.ts:179` + `server.ts` v2.0:1493-1499 · v2.1:1652-1660 |
| 33 | Fase 2 §3: cada error real → entrada `error` normalizada, deduplicada, acotada (225-229) | **HECHO** | §7 (regex `<ref>`/`<n>`, id `fail:tool:slug`, 180/200 car.) |
| 34 | Fase 2 §5.2: indexar también Python y CSS/HTML (240) | **PROMETIDO** | Python **sí** (`PY_PATTERNS`); **CSS/HTML no** (`guessLanguage` no los mapea, `:125-131`) |
| 35 | (implícito §2) el motor "sabe" y el modelo "lee" | **HECHO en Ollama, PROMETIDO en nube** | punto 9 y §2.4 |

---

## 15. Módulos: verificados y listos para fusionar vs prometidos sin código

### 15.1 ✅ VERIFICADOS Y LISTOS PARA FUSIONAR EN V8 (código completo, autocontenido, sin dependencias)

| Módulo | Líneas | Por qué es fusionable tal cual | Riesgo al fusionar |
|---|---|---|---|
| `src/engine/knowledgeBase.ts` | 320 | KB+contexto+validación de tool-calls; puro, sin dependencias, persistencia delegada al servidor | Corregir `KbTable`/`KbEntry` para admitir `manual` y `tags` (o cambiar `manuals.ts`) |
| `src/engine/syntaxGuard.ts` **(versión v2.1)** | 479 | guardián con política conservadora ya validada contra 63 archivos reales; v2.1 arregla 4 falsos positivos | Activar `checkTagPairing(...,"jsx")` para `.tsx` **sólo** si se añade lista blanca de mayúsculas; hoy es dead code |
| `src/engine/symbolIndex.ts` | 185 | análisis estático sin dependencias; alimenta prompt y herramienta | Bug de fidelidad: en el resumen los nombres van en `.toLowerCase()` (`:181`) pero el modelo debe escribir el nombre real (`:182` dice «usa estos nombres») |
| `src/engine/compactor.ts` | 197 | determinista, con la regla de oro "errores intactos" | 6 estrategias dependen de `detectKind`, basado en heurísticas frágiles (`:126-141`) |
| `src/engine/resilience.ts` | 302 | clasificación de errores + retry + cortacircuitos + fallback | `sleep` duplicado en `server.ts`; `jitter` no exportado |
| `src/engine/modelTiers.ts` | 336 | fuente única de perfiles, coherente con RAM real | `num_predict` negativo no se envía: con `large/cloud` no hay tope |
| `src/engine/manuals.ts` | 308 | 5 leyes + 19 manuales + 6 procedimientos consultables | **falla `tsc`** (tabla `"manual"`, campo `tags`) |
| `src/engine/toolRegistry.ts` | 571 | registro de esquemas reutilizable por `validateToolCall` | — |
| `src/engine/importChecker.ts` **(v2.1)** | 269 | detecta imports rotos + genera stubs de componente y de módulo | los stubs "no-op" pueden silenciar un fallo real si no se registran en el log |
| `src/engine/brain.ts` | 577 | gobernanza con escritura atómica, snapshots, retención 60, rollback real | requiere `cerebro.md`/`memoria.md` en `process.cwd()`; los niveles hardcodean texto de ley |
| `src/utils/selfImprovement.ts` | 427 | bucle medible de lecciones+métricas+reflexión, sin tokens de modelo | persiste en `localStorage`: no es memoria del motor, es memoria del navegador |
| `src/engine/projectPorter.ts` | 252 | normaliza puertos de proyectos importados (caso ScanMed) | hace *patching* de `package.json`/`vite.config` con respaldos |
| `src/engine/advancedFeatures.ts` + `hardwareGovernor.ts` + `cloudVerifier.ts` | 1.062 | interruptores "construido pero apagado", veredicto por RAM libre, verificación en nube | coste en cuota/latencia; requieren claves de API |

### 15.2 ⚠️ PROMETIDOS SIN CÓDIGO (no fusionar como "probado")

| Promesa | Estado | Qué habría que construir |
|---|---|---|
| Suite determinista "21 PASS (9+7+5)" | **No existe runner** | portar los casos a un único `engine.test.ts` ejecutable con `tsx` y `npm test` |
| Suite "40 PASS" de `RESULTADO_PRUEBAS_MOTOR.txt` | **No existe runner**; 3 de sus PASS contradicen el código | reejecutar y **regenerar** el fichero desde CI/local |
| `PRUEBAS_MANUALES_MOTOR.ts` funcional | **Roto**: importa de otra cuenta/ruta inexistente | reescribir imports a rutas relativas (`../ide/backend/src/engine/...`) |
| JSX con etiquetas pareadas | **Dead code** | invocar `checkTagPairing(text,"jsx")` para `.tsx/.jsx` con lista blanca |
| Balance de llaves/paréntesis en TS/JS | **Retirado a propósito** | sólo viable con parser real (p. ej. `esbuild`/Babel en modo "syntax-only") |
| Detección de cadenas/plantillas sin cerrar | **Retirada a propósito** | idem anterior |
| Índice de símbolos para CSS/HTML | **No implementado** | añadir patrones y `guessLanguage` |
| Inyección de KB+manuales+símbolos en modelos de nube | **No implementado** | punto único de composición de prompt para los 11 caminos de proveedor |
| Unificación de resiliencia (§9.2) | **Objetivo nulo / no ejecutado** | integrar `classifyError`/`withRetry` en `healthCheck.ts`, `selfHealing.ts`, `restorePoints.ts` y en el bucle de reconexión de `server.ts` |
| Medición real de TTFT / tokens-s del motor | **No existe** | endpoint `/api/ollama/metrics` que registre `eval_count`/`prompt_eval_duration` de Ollama (los campos ya llegan en la respuesta de Ollama y se descartan) |
| `lesson` escrito por el bucle de autosuperación en la KB del motor | **Parcial** | POST del cliente a `/api/engine/kb/learn` al cerrar turno |

---

## 16. Hallazgos clave para la fusión V8 (priorizados)

1. **El motor compartido está congelado y es de fiar; la capa de gobernanza es lo nuevo.**
   Los 7 módulos que sostienen la idea (KB, símbolos, compactador, resiliencia, toolRegistry, modelTiers,
   manuals) son **byte-idénticos** entre v2.0 y v2.1. Fusionar "v2.1" = fusionar `brain.ts` + `localRAG.ts`
   + `advancedFeatures.ts` + `hardwareGovernor.ts` + `cloudVerifier.ts` + `projectPorter.ts` +
   `syntaxGuard`/`importChecker` afinados + 941 líneas nuevas de `server.ts`.

2. **El "modelo-agnosticismo" no está implementado: es el mayor riesgo funcional de la idea.**
   `[CONOCIMIENTO DEL MOTOR]`, `[MANUAL DEL MOTOR]` y `[SÍMBOLOS REALES DEL PROYECTO]` sólo se componen en
   la rama Ollama (`server.ts` v2.1:5728-5801). Un GLM/Gemini/OpenRouter recibe la ley (v2.1) pero **no
   recibe la KB ni el índice de símbolos**. Es exactamente lo contrario de «el conductor puede ser
   cualquier flacucho». **P0 para V8.**

3. **El guardián está donde debe (conservador) pero cubre menos de lo que el doc cree.**
   Balance de delimitadores y etiquetado JSX **no** se aplican a TS/TSX/JS (retirados a propósito para
   eliminar 32/63 falsos positivos). Lo que sí bloquea de forma fiable: JSON inválido, truncamiento al final,
   `/*` sin cerrar, HTML/CSS desbalanceado. Y **v2.1 dejó el análisis de Python como aviso no bloqueante**.
   Para V8: sustituir heurísticas por `esbuild transform` en modo sintaxis (sin escribir en disco) —
   da JSX y balance reales sin falsos positivos.

4. **La "memoria viva" funciona de verdad y es el activo más valioso de v2.1.**
   `brain.ts` escribe en `memoria.md` con lock + `tmp`+`rename`, guarda snapshots en `memoria_history/`
   (retención 60, 1 cada 20 s), comprime cada 10 interacciones y soporta `/api/brain/rollback` real.
   Además, cada fallo de herramienta alimenta **dos** memorias: KB (`fail:<tool>:…`) e Incidencias de
   `memoria.md`. `cerebro.md` es **inmutable por diseño**: las propuestas se guardan, nunca se auto-aplican.
   Evidencia de uso real en `memoria.md:96-98`.

5. **La trazabilidad de las pruebas es el punto más débil; nada del motor está "probado" de forma reproducible.**
   `RESULTADO_PRUEBAS_MOTOR.txt` (40 PASS) tiene **el mismo md5 desde v1.0.1**, no tiene runner, y al menos
   tres de sus PASS (`JSX sin cerrar`, `Python sin ':'`, `llaves desbalanceadas`) **contradicen el código
   auditado**, que además declara **21 PASS** en el doc. `PRUEBAS_MANUALES_MOTOR.ts` no compila (import a otra
   cuenta). El único test ejecutable (`test:e2e`) **no toca el motor**. **Antes de fusionar: crear el runner.**

### 16.1 Deuda técnica concreta detectada (checklist de fusión)

| # | Hallazgo | Ubicación | Tipo |
|---|---|---|---|
| 1 | `manuals.ts` usa `table:"manual"` y `tags` fuera de `KbEntry` ⇒ `tsc --noEmit` falla | `manuals.ts:28-36` vs `knowledgeBase.ts:32-45` | Tipo / CI |
| 2 | `checkTagPairing(...,"jsx")` es código muerto (JSX no validado) | `syntaxGuard.ts:191,216-221,401` | Funcional |
| 3 | `unclosedString` se calcula y se descarta | `syntaxGuard.ts:95,186` | Funcional |
| 4 | Dedupe de "issue no bloqueante" por substring `"se ha ignorado"` | `knowledgeBase.ts:318` | Robustez |
| 5 | `buildEngineContext` en el endpoint usa 1100 en vez de 700/1200 | `server.ts` v2.0:2060 · v2.1:2495 | Consistencia |
| 6 | `fromJSON` no re-siembra `MANUAL_ENTRIES` si el JSON es antiguo | `knowledgeBase.ts:226` | Regresión silenciosa |
| 7 | Resumen de símbolos en minúsculas contradice «usa estos nombres» | `symbolIndex.ts:179-182` | Calidad de prompt |
| 8 | `num_predict: -1` nunca se envía a Ollama (sin tope real en large/cloud) | `modelTiers.ts:295` | Rendimiento |
| 9 | `tokensOut = caracteres/4` y TTFT estimados en cliente | `App.tsx:1227`, `selfImprovement.ts:55-72` | Medición |
| 10 | Botón "Modo 8 GB" (UI) no influye en `num_ctx`; el recorte real es por `RAM_GB` | `constants.ts:318-322` vs `modelTiers.ts:129` | UX/doc |
| 11 | Duplicación real de reintentos fuera de `resilience.ts` | `server.ts` v2.1:5860-5930; `utils/healthCheck.ts`, `selfHealing.ts` | Deuda |
| 12 | Indexación CSS/HTML de símbolos no existe | `symbolIndex.ts:125-131` | Alcance |

---

## 17. Resumen ejecutivo (10 líneas)

1. El motor central de v2.0 y v2.1 es **el mismo código**: 7 de 11 módulos de `src/engine/` son byte-idénticos.
2. v2.1 aporta la **capa de gobernanza y memoria viva** (`brain.ts`, `localRAG.ts`, `advancedFeatures.ts`,
   `hardwareGovernor.ts`, `cloudVerifier.ts`, `projectPorter.ts`) más 941 líneas nuevas en `server.ts`.
3. La idea «el conocimiento vive en el motor» está **implementada para Ollama** (KB + manuales + símbolos
   inyectados cada turno con presupuesto 700/1200) y **no implementada para la nube** (P0 de la V8).
4. La KB es determinista y auditable (62 entradas de fábrica, 8 tablas + 1 tabla fantasma `manual`),
   con scoring explícito; el doc dice 28 entradas y se queda corto respecto a su propio código.
5. `SyntaxGuard` **sí** aplica ya la política conservadora (ADR en `memoria.md:25-29`), pero cubre menos de
   lo que promete: sin balance en TS/JS, sin JSX, sin cadenas/plantillas; Python no bloqueante en v2.1.
6. `validateToolCall` y `compactor` funcionan exactamente como se documentan (incluida la regla
   «los errores no se compactan nunca», `compactor.ts:179`).
7. La duplicación de resiliencia que manda arreglar la IDEA §9.2 **no existe**: `src/utils/resilience.ts`
   nunca existió; v2.1 no tocó `resilience.ts` en absoluto.
8. Los perfiles de rendimiento están completos y coherentes por tier/RAM; el "Modo 8 GB" de la UI es sólo
   cosmético y el precalentado (`/api/ollama/warmup`) reserva el mismo contexto que el chat.
9. La verificación declarada (21 PASS en el doc, 40 PASS en el `.txt`) **no es reproducible**: no hay runner,
   el fichero de resultados tiene el mismo md5 desde v1.0.1 y 3 de sus PASS contradicen el código.
10. La memoria viva de v2.1 (escritura atómica + `memoria_history/` + rollback + compresión cada 10 turnos)
    es sólida y es lo que más valor añade a la fusión; la autosuperación, en cambio, vive en `localStorage`
    y **no alimenta la KB del motor**.

### 17.1 Los 5 hallazgos para V8

| # | Hallazgo | Acción V8 | Prioridad |
|---|---|---|---|
| **H1** | El conocimiento del motor sólo llega a Ollama; la nube no recibe KB, manuales ni símbolos | Punto único `buildProviderSystemPrompt()` aplicado a los 11 caminos de proveedor | **P0** |
| **H2** | No hay verificación reproducible de nada del motor (`tsc` ni siquiera pasa por `manuals.ts`) | Arreglar tipos + crear `engine.test.ts` con `npm test`; regenerar `RESULTADO_PRUEBAS_MOTOR.txt` desde el runner | **P0** |
| **H3** | `SyntaxGuard` no valida balance ni JSX en TS/TSX (dead code) — el doc lo promete | Validación real con `esbuild transform` en memoria (sin escribir), manteniendo la política conservadora | **P1** |
| **H4** | La autosuperación escribe lecciones en `localStorage`, no en la KB del motor (`lesson` nunca se rellena sola) | Al cerrar turno, `POST /api/engine/kb/learn` con la lección; unificar con `brain.addLesson` | **P1** |
| **H5** | Medición inexistente: TTFT/tokens-s son estimaciones de cliente (`len/4`), y Ollama ya devuelve `eval_count`/`prompt_eval_duration` que se descartan | Endpoint de métricas que capture esos campos y los escriba en `memoria.md` (bloque `METRICAS`) | **P1** |

### 17.2 Veredicto de fusión

**Fusionar tal cual (probado en código):** `knowledgeBase.ts`, `syntaxGuard.ts` (v2.1), `symbolIndex.ts`,
`compactor.ts`, `resilience.ts`, `modelTiers.ts`, `toolRegistry.ts`, `importChecker.ts` (v2.1),
`brain.ts`, `selfImprovement.ts`, `projectPorter.ts`, `advancedFeatures.ts`, `hardwareGovernor.ts`,
`cloudVerifier.ts`, `localRAG.ts` (apagado), `manuals.ts` (**con el arreglo de tipos**).

**No fusionar como "probado" (sin código o sin runner):** suite de 21 PASS, runner de los 40 PASS,
`PRUEBAS_MANUALES_MOTOR.ts`, validación JSX/balance en TS/JS, cadenas/plantillas, símbolos CSS/HTML,
inyección de KB en nube, unificación de resiliencia, métricas de inferencia del servidor.
