# ARQUITECTURA — CEREBRÓNICO V8 (entrega oficial)
## Fusión refactorizada autónoma · 20/09/2026 · Propietario: Mario Nicolas Quintero

> **Estado**: arquitectura ensamblada sobre 4 auditorías contra código real (`audits/01..04`).
> Secciones **PENDIENTE** requieren confirmación del propietario antes de codificarse.
> Regla de la casa: solo se fusiona lo **PROBADO**; lo prometido sin código se declara y no se vende.

---

## 1. Visión

**Cerebrónico V8 = un instrumento, no un chat.** Es el contenedor donde un conductor
cualquiera (modelo local 0,4–1,5 GB, cloud gratis, o ninguno) opera una máquina de
ingeniería de software completa, porque **el conocimiento, las reglas y los poderes
viven en el motor y los espejos**, y la interfaz muestra en cada turno exactamente
qué contexto se inyectó (**contexto fluido**).

Las 5 tesis fundacionales (inmutables, de la Capa 0 de la bibliografía):
1. El conocimiento vive en el motor, no en el modelo.
2. Determinismo primero: 50 entidades puras; el neural solo cuando la confianza no alcanza.
3. 8 GB es la ley de diseño (tramos MR1–MR4).
4. Cero claves para empezar.
5. Nada silencioso: `motivo` en todo fallo, contratos con testigo, descarte escrito.

---

## 2. Directrices consolidadas (el cuerpo normativo único)

Hoy las directrices están repartidas en 5 archivos. **V8 las unifica en `CEREBRO.md`
de la raíz del motor** (mismo espíritu de `cerebro.md` v2.1 + `AGENTES_MANUAL` v1.x + 15 ADRs):

| Bloque | Contenido | Origen |
|---|---|---|
| **Identidad y autonomía** | Rol, misión, nivel alto de autonomía; **excepción: toda acción destructiva (borrar, sobrescribir sin respaldo, `git reset`, matar procesos) requiere confirmación** | cerebro.md §1 |
| **Guardrails (no negociables)** | 1. Veracidad (nunca afirmar lo no ejecutado) · 2. Cero ambigüedad (asunción estándar + documentada) · 3. Cero relleno (sin saludos/resúmenes de lo dicho) · 4. Atomicidad de bloques (ruta exacta, sin marcadores perezosos) · 5. Certeza proporcional · 6. Idioma del usuario (español por defecto) | cerebro.md §2 |
| **Pipeline de 4 pasos** | Validación → Reconocimiento (buscar antes de usar: `find_symbol`, `search_in_files`, `read_file_range`) → Estructuración (plan si >2 pasos) → Generación (preferir `edit_file` sobre `write_file`, `read_file_range` sobre `read_file`) | cerebro.md §3 |
| **Estándar de arquitectura** | Puertos fijos (3000/3500/5000/11434) · todo archivo dentro de `.proyectos/` (escribir fuera = error de seguridad) · lectura en vez de memoria · modelos <4B sin tool-calling no simulan acciones | cerebro.md §4 |
| **Fast-Decision Engine** | Output Schema `[DIAGNÓSTICO FLASH] → [ACCIÓN/CÓDIGO] → [CHECKLIST DE MEMORIA]` · fallback silencioso (2 rutas no-destructivas: se elige la estándar y se declara) | cerebro.md §7 |
| **Regla de admisión de entidades** | "Si tu reflejo nuevo devuelve lo mismo que uno existente, no es una entidad nueva: es vocabulario nuevo." | AGENTES_MANUAL §8 |
| **Contratos numéricos** | Patrón "CONSERVA + delta" con testigo en tests; `motivo` obligatorio cuando `ok:false` | AGENTES_MANUAL §6/8 |
| **Auto-evolución** | Post-mortem (incidencia → causa raíz → mitigación 3 pasos) · métricas · **auto-parcheo solo como propuesta** (`.cerebro-db/proposals/`, aprobación humana) | cerebro.md §5 |
| **15 ADRs** | Ver Capa 4 de la bibliografía (son ley: guard en todas las puertas, killPort exacto, .env fuera del EXE, carril CPU para espejos, fuente única de versión, etc.) | memoria.md + CHANGELOGs |
| **Preferencias del usuario** | Español · scrollbars vertical-only · transparencias regulables · visor 390×844 · rutas con espacios citadas · sin relleno | memoria.md §3 |

---

## 3. Plano en capas (arquitectura V8)

```
┌────────────────────────────────────────────────────────────────────────┐
│ L5  EMPAQUETADO   EXE Electron + instalador NSIS (1 EXE único, sin    │
│                   Ollama ni binarios externos; .env NUNCA empaquetado) │
├────────────────────────────────────────────────────────────────────────┤
│ L4  AGENTE PC     Puente :5000 (Python o EXE PyInstaller) — sandbox   │
│                   endurecido: token obligatorio, rutas permitidas,    │
│                   sin shell=True, sin CORS *. Herramientas pc_*.      │
├────────────────────────────────────────────────────────────────────────┤
│ L3  IDE (shell)   React 19 + Vite + Express :3000 — chat, editor,     │
│                   árbol, sandbox :3500 AUTO (watchdog 8 s), TTS,      │
│                   Espina de Actividad, Contexto Fluido (panel),       │
│                   selector de modelos + espejos + Turbo + tramo MR    │
├────────────────────────────────────────────────────────────────────────┤
│ L2  NÚCLEO AGÉNTICO  50 entidades (12 especialistas + 38 herramientas) │
│                   · 10 espejos + 22 poderes · reflejo (votación) ·     │
│                   orquestador (confianza 0,55/0,08) · conductor       │
│                   (consejo ≥0,8 → Ollama 1 reparación → fallback) ·   │
│                   planificador (Kahn, semáforo, invariante io/cpu) ·  │
│                   salud (Laplace) · extensiones calientes · forja     │
├────────────────────────────────────────────────────────────────────────┤
│ L1  MOTOR         knowledgeBase (62+ entradas, 8 tablas) · syntaxGuard │
│                   (conservador + esbuild para TS/JSX) · symbolIndex · │
│                   compactor (errores NUNCA compactan) · importChecker │
│                   (stubs) · brain (memoria viva, ADR log, rollback) · │
│                   localRAG (apagado por defecto, ver §7.4) ·          │
│                   modelTiers · toolRegistry · cloudVerifier ·         │
│                   hardwareGovernor · INYECCIÓN MULTI-PROVEEDOR (P0)   │
├────────────────────────────────────────────────────────────────────────┤
│ L0  NÚCLEO BASE   puertos · constants (fuente única) · storage seguro ·│
│                   postinstall (kb.json, tools.config.json, informe de │
│                   entorno, modelos por tramo) · verificación (validar │
│                   + tsc + e2e + npm audit)                            │
└────────────────────────────────────────────────────────────────────────┘
   Procesos: IDE :3000 · Sandbox :3500 · Puente :5000 · Ollama :11434 (externo, del usuario)
```

### 3.1 Mapa de fusión — de qué versión viene cada pieza (todo verificado en auditoría)

| Pieza V8 | Fuente | Nota de fusión |
|---|---|---|
| `server.ts` (base) | **v1.4.0** (2.524 L = v3.3.2 + 7 mejoras) | Auto-detección `:free`, key por request, anti-zombie, HOST configurable, backoff exponencial |
| Plantilla `.proyectos/` + sandbox AUTO | **v3.3.2** | v1.4.0 LA PERDIÓ → re-importar (regresión detectada) |
| Electron (splash, polling 6 min, fallback, error page) | **v3.3.2/v1.4.0** (idénticos) | Conservar la cadena BAT oculta |
| Cadena NSIS 2-EXE → **1 EXE** | **v1.4.0** | Simplificar a 1 EXE + extraResources (lección de memoria: ligereza) |
| Motor (15 módulos) | **v2.1** | Los 7 byte-idénticos a v2.0 son estables; `manuals.ts` exige arreglo de tipos P0 |
| `memoria.md`/`cerebro.md` vivos (brain) | **v2.1** | Escritura atómica + history + rollback ya funcionan |
| Núcleo agéntico completo | **v1.1.1** | 50 entidades, 10 espejos, 22 poderes, reflejo v5, bóveda, salud, grupo |
| 6 utilidades del editor | **agent-v2** | attachmentProcessor (592 L), syntaxEngine, codeParser, contextCache, languageMemory, engine.ts |
| Auto-aprendizaje + 11 autómatas | **Codigo-0 v3** | `autoaprendizaje.ts` (376 L) + `automata-team.ts` (221 L) — se conectan al orquestador |
| e2e de 4 providers (8 tests) | **agent-v2** | `comprehensive_e2e_test.py` (976 L) → puerta obligatoria de cada fase |
| Modelo cloud gratis (guía) | **MEMORANDUM v3.3.2** (13/09) | gpt-oss:120b-cloud, qwen3-vl:235b-cloud — mantener la guía verificada |
| Puente :5000 | **v1.1.1** (endurecido) | El de `uploads/` se descarta (RCE documentado) |
| skills.md (100) | **v3.3.2** | Se convierte en **registro de roadmap** con estado real (20-25 implementadas / ~75 aspiracionales) |

### 3.2 Descartes escritos (no se fusiona, con motivo)

| Descarte | Motivo |
|---|---|
| Puentes `uploads/agent_bridge_5000.py/.js` | RCE: `HOST=0.0.0.0` + CORS `*` + `shell=True` sin token (MEMORANDUM-SEGURIDAD) |
| `requirements.txt` de v3.3.2 | Corrupto (fence markdown) → `pip install` falla |
| 75 skills de skills.md sin código | No se inyectan al prompt como si existieran; pasan al registro con estado `aspiracional` |
| K8s/Docker/NGINX/réplicas | Ya descartado por escrito en v1.1.0 (máquina 8 GB) |
| Tiling SD/ComfyUI | Sin GPU local (descarte v1.1.0) |
| `localRAG.ts` activado por defecto | 8 GB = embeddings solo bajo demanda (ADR 12) — ver §7.4 para el modo X22 |
| `RESULTADO_PRUEBAS_MOTOR.txt` (40 PASS) | No reproducible (md5 idéntico desde v1.0.1, 3 PASS falsos) → se regenera con runner |
| `ide/backend/#` y basura | Archivos corruptos accidentales |

---

## 4. Decisiones P0 de la fusión (lo que la auditoría exigió)

| # | Decisión | Por qué |
|---|---|---|
| **D1** | **Inyección multi-proveedor**: un único `buildProviderSystemPrompt()` que compone `[CONOCIMIENTO DEL MOTOR]` + `[MANUAL]` + `[SÍMBOLOS REALES]` + `[ESPEJOS ACTIVOS]` + `[MEMORIA ESTADO]` para los 4-5 caminos de proveedor (Ollama, Gemini, OpenRouter, Custom, Z.ai) | Hoy la nube NO recibe el motor (v2.1:5728-5801 solo Ollama) — rompe la tesis fundacional #1 |
| **D2** | **Token efectivo en todas las puertas**: `ACCESS_TOKEN` se valida de verdad (hoy inerte: server.ts:41-48) en `/api/exec`, `/api/fs/write`, `/api/sandbox/*`; CORS de la IDE `127.0.0.1` por defecto (LAN solo con token) | La auditoría encontró `/api/exec` sin auth + CORS `*` = RCE en LAN |
| **D3** | **Puente :5000 endurecido**: localhost solo por defecto, token por header, allowlist de rutas (`.proyectos/` + atajos Desktop/Documents/Downloads), `shell=False`/`subprocess` con lista blanca de binarios, sin `allow_origins=["*"]`, `/file/read` acotado | El puente original es RCE documentado |
| **D4** | **Verificación reproducible**: runner `npm run validar` + `npm test` (motor) + e2e 8 tests + `tsc --noEmit` + `npm audit` como **puerta de cada fase**; el `.txt` de 40 PASS se regenera desde el runner con fecha | La fusión no se declara con cifras ajenas |
| **D5** | **Fuente única de versión**: `constants.ts` (`IDE_BRAND`, `VERSION`) + `package.json` sincronizado por script en postinstall; el manual cita la versión de constants | La triple fuente hizo "perder" 10 espejos en una fusión anterior |
| **D6** | **El espejo que el usuario eligió SÍ llega al conductor**: `POST /api/consejo/espejos` alimenta el prompt del conductor (defecto H2 detectado: se persistía pero no se consumía) | La promesa de v1.0.2 no se cumplía en el código |
| **D7** | **Los 12 especialistas votan de verdad** (H3: 5 no tenían rama en `DUEÑO_DE`) o se declaran "no votantes" | Catálogo honesto |
| **D8** | **Métricas reales de inferencia**: leer `eval_count`/`prompt_eval_duration` de Ollama (hoy se descartan) → bloque METRICAS de memoria.md + panel Autosuperación; el `len/4` del cliente queda como estimación declarada | La autosuperación decide con números, no con adivinaciones |
| **D9** | **Lecciones que se escriben**: al cerrar un turno con error recuperado → `POST /api/engine/kb/learn` (hoy la Autosuperación escribe solo en localStorage y la tabla `lesson` nunca se llena sola) | El motor aprende de sus fallos (tesis, no promesa) |
| **D10** | **`manuals.ts` compila**: arreglar `table:"manual"` y `tags` fuera del tipo `KbEntry` (no pasa tsc hoy) | P0 de build |

---

## 5. L1 — MOTOR V8 (conocimiento, blindaje, memoria)

### 5.1 knowledgeBase (de v2.1, 62 entradas de fábrica)
8 tablas: `rule` · `syntax` · `error` · `pattern` · `tool` · `skill` · `project` · `lesson`.
Recuperación determinista (solape + prioridad + peso, **sin embeddings por defecto** — ADR 12).
`buildEngineContext()`: top 5 por turno, presupuesto 700 car. (modelos micro) / 1.200 (resto).
Endpoints: `GET /api/engine/kb?q=` · `/kb/stats` · `POST /kb/learn` · `POST /kb/entry` · `POST /sync` · `GET /tools`.
**V8**: `lesson` se auto-rellena (D9) y los 22 poderes documentan su ficha en la tabla `skill`.

### 5.2 syntaxGuard (v2.1, política conservadora — incidente 32/63)
Detecta: JSON inválido (parse real) · balanceo de llaves/paréntesis/corchetes ignorando strings/comentarios · JSX (etiquetas pareadas + componentes) · CSS · Python (mezcla tabs/espacios, `:` faltante) · **marcadores de truncamiento** («…», `TODO`, "resto del código") — el fallo #1 de modelos pequeños.
**V8 (D-P1)**: el balanceo TS/JS y el chequeo JSX hoy son código muerto → se implementa con `esbuild.transform` en memoria (valida SIN escribir); Python pasa a bloqueante en `write_file` (revertible en `edit_file`).
Regla inmutable: **se rechaza `write_file`, se revierte `edit_file`, y el error detallado vuelve al modelo** (autocorrección). En TODAS las puertas de escritura (ADR 3).

### 5.3 symbolIndex (v2.1)
Firmas reales de funciones/clases/interfaces/tipos/componentes (TS/JS/TSX/JSX/PY). Inyección `[SÍMBOLOS REALES DEL PROYECTO]` (700/1.300 car.). Herramienta `find_symbol`. `GET /api/engine/symbols` · `POST /api/engine/sync` (reindexa del disco, sin red).
**V8**: extiende a Python completo y a CSS/HTML (ya estaba en la hoja de ruta del motor).

### 5.4 compactor (v2.1)
Reglas por tipo: archivo → estructura (imports+firmas)+principio+final · comando → principio+final+**TODOS** los errores · búsqueda → primeros+recuento · JSON → estructura/tipos/largas. **Los errores NUNCA se compactan** (regla de oro).

### 5.5 validateToolCall (v2.1)
Validación contra esquema antes de ejecutar: faltante → error al modelo · inventado → descarta+avisa · tipo mal → error · `"40"` → convierte · enum → error.

### 5.6 brain + memoria viva (v2.1)
`CEREBRO.md` (ley inmutable, §2 de este documento) + `memoria.md` (pizarra): estado dinámico, ADR log, buffer de aprendizaje, backlog, incidencias (automáticas), métricas. Escritura atómica + lock · `memoria_history/` retención 60 · `POST /api/brain/rollback` · compresión cada 10 turnos (archiva a ~2.000 líneas) · propuestas de auto-parcheo en `.cerebro-db/proposals/` (solo se aplican con aprobación humana).

### 5.7 El resto (verificado, se integra sin cambios)
`resilience.ts` (reintentos/backoff) · `modelTiers.ts` (perfiles num_ctx/num_predict/num_batch/num_thread + precalentado + Modo 8 GB) · `toolRegistry.ts` · `importChecker.ts` (stubs) · `hardwareGovernor.ts` (medidor; el semáforo real es `planRunner.Semaforo`) · `cloudVerifier.ts` · `advancedFeatures.ts` · `selfImprovement.ts` (con D8+D9).

---

## 6. L2 — NÚCLEO AGÉNTICO V8 (50 entidades, espejos, poderes)

### 6.1 El catálogo (50 = 12 + 38, con contratos "CONSERVA + delta")
- **12 especialistas votantes** (todos votan — D7): conversor, archivista, artista, codigo, matematico, conductor, linguista, investigador, validador, telemetria, memorista, ayuda.
- **28 herramientas**: 10 despiertas por defecto (texto.contar, datos.json-ruta, datos.hash, mate.promedio, mate.unidades, maq.ram, maq.tramo, vis.paleta, proyecto.rutas-sanas, memorista.registrar) + 18 dormidas **con botón** (dormida ≠ muerta: responde CÓMO despertarla).
- **10 espejos** (todos despiertos, ~1 ms, JSON compacto, CERO imports de runtime — verificado en el archivo):

| Espejo | Contrato (lo que devuelve y nadie más) |
|---|---|
| `espejo.codigos` | Inventario estructural JSON: símbolos (hasta 24), imports, líneas, ciclomática, TODO/FIXME |
| `espejo.lenguajes` | Detección de idioma (es/en/fr/pt/it/de) + perfil Flesch (`score===0` → "desconocido", no <15 palabras) |
| `espejo.artes` | Armonías HSL reales: complementaria, tríada, análoga, partida, tonos, áurea |
| `espejo.disenios` | Grilla determinista: columnas, márgenes áureos, escala 8pt, breakpoints, escala tipográfica modular |
| `espejo.creadores` | Combinatoria reproducible por semilla (mulberry32/FNV-1a), espacio muestral declarado, cero `Math.random` |
| `espejo.planificadores` | Lotes por Kahn + rechazo de ciclos + presupuesto MR (`io≥1 · cpu≥1 · io≤16`) + ondas paralelas |
| `espejo.cientificos` | Diseño experimental: H0/H1, condiciones, controles, replicados, prueba estadística por tabla |
| `espejo.fisicos` | Constantes SI canónicas + conversión; la imposibilidad se declara DENTRO de la salida |
| `espejo.matematicos` | Aritmética exacta sin `eval`: valor, exacto, factorización, primalidad, mcd/mcm |
| `espejo.cuantico` | Simulador 1–8 qubits: amplitudes complejas exactas, puertas x/y/z/h/s/t + CNOT (pedir 9 → motivo) |

- **22 PODERES** en 8 espejos (`poderes-espejos.ts`, despacho por `accion`): estadística+IC95, ecuaciones (lineal/cuadrática c/ raíces complejas), matrices (sum/mul/det), bases, mcd/mcm, interés compuesto · contraste WCAG, daltonismo ×3, gradiente · dependencias, firmas, bloques duplicados · frecuencias, case, diff · topológico+ondas · tipografía modular, breakpoints · tamaño muestral, IC · entrelazamiento por concurrencia.

### 6.2 El ciclo de decisión (de una frase a la acción)
```
frase del usuario
   │
   ├─① REFLEJO (votación determinista, tablas v3: 350 KB lite / 1,94 MB max, 14.645/82.459 entradas)
   │     → si un especialista gana con confianza ≥ 0,8: ejecuta en ~1 ms. EL NEURAL NO SE DESPIERTA.
   │
   ├─② ORQUESTADOR (confianza): prueba TODAS las leyes; umbral 0,55 + margen 0,08;
   │     con dudas → confiesa + lista alternativas + sugiere familia explícita. El auto NO lanza monedas.
   │
   ├─③ CONDUCTOR (frase difícil → plan): consejo ≥0,8 → director local (Ollama, UNA ronda de
   │     reparación con el error exacto del validador) → fallback DECLARADO con los motivos de ambos.
   │     Ningún JSON crudo llega al motor: todo pasa por extraerOrdenes/validarPlan.
   │     (D6: el grupo de espejos activo modifica el prompt del conductor — hoy no lo hacía)
   │
   └─④ MODELO (solo ③ y tareas `modelo`): con [CONOCIMIENTO][SÍMBOLOS][ESPEJOS][MEMORIA] inyectados
```

### 6.3 Espejos UN CLICK DE DISTANCIA (lo que ya funciona y se conserva tal cual)
- **⚡ Consejo**: panel con botón por entidad (despertar/dormir) + selector de grupos; persistencia `.cerebro-db/entidades.json` (sobrevive reinicios). API: `GET /api/consejo/estado` · `POST /api/consejo/entidad {id, activa}`.
- **Grupos espejo** (💻 codigo · 🎨 arte · 🔬 ciencia · ⚛️ cuantica · ★ todos · ✋ manual · ∅ ninguno) dentro del selector de modelos; dos caras sincronizadas (navegador: `cn.espejos.seleccion`; motor: `.cerebro-db/espejos.json`); si una cara falla, se declara en el aviso.
- **🚀 Turbo** (cabecera): arma el reparto completo de poderes en el system prompt; con Turbo ON, nada de aritmética/contraste/planes "de cabeza".
- **Salud (REFLEJO v5)**: score Laplace por espejo (estrella ≥0,95; dormido <0,5 con ≥8 usos fuera del auto-enrutado, alcanzable por ruta explícita); `GET /api/espejos/salud` · `/dormir` · `/reset`.
- **GRUPO v1 (auto)**: equipo por tarea según señales del contenido del pedido.
- **consultar_espejo**: el modelo llama espejos directo, en lotes de hasta 8 (~1 ms cada uno).
- **Bóveda**: artefactos a disco real indexado (`C:\CN\IMAGENES\...`, INDICE.json sha256, dedupe).

### 6.4 Planificador (concurrente, en segundo plano)
- Manual (pestaña): formulario + intérprete de líneas `titulo | tipo | dato | extra | dependeDe` + escalado ×N + selector de tramo MR + Cancelar/Reanudar.
- Automático: el chat emite `cerebronico:plan` y el plan nace solo.
- Ejecución: `planRunner` con **semáforo global por peso** (N planes no multiplican la carga); espejos por carril CPU (ADR: 1 ms, no desplazan al modelo); invariante `io≥1 · cpu≥1 · io≤16`; cancelación que despierta el bucle; reanudación de `en_curso` huérfanas.
- **La IDE sigue siendo tuya mientras un plan trabaja** (diseño fundante): chat, edición y más planes en paralelo.

### 6.5 Habilidades expandibles según recursos (tramos MR) — el mecanismo central pedido
`maq.tramo` detecta la RAM y elija (o el usuario fuerza desde el planificador/selector):

| Tramo | RAM | Modelo sugerido (postinstall baja SOLO ese) | Contexto por turno | Espejos/poderes activos | Skills expandibles |
|---|---|---|---|---|---|
| **MR1** | 4 GB | micro ≤1 GB (smollm/qwen 0,5B-1B) | 700 car. | 10 espejos básicos (los deterministas caben siempre) | solo núcleo IDE + motor |
| **MR2** | 8 GB | 1,5-4B (qwen2.5-coder:3b, gemma3:4b) — **la ley de diseño** | 1.200 car. | 10 espejos + 22 poderes + Turbo | + planificador, sandbox, TTS |
| **MR3** | 16 GB | 7-14B (qwen2.5-coder:14b) | 2.000 car. | todo el catálogo + localRAG bajo demanda | + visión local (minicpm-v/llava), bóveda |
| **MR4** | 32 GB | 27B+ (gemma3:27b) o cloud gratis (gpt-oss:120b-cloud, qwen3-vl:235b-cloud) | 4.000 car. | todo + espejos personalizados (pool .mjs) | + skills aspiracionales del registro que se implementen |

Reglas:
1. **Lo determinista no depende del tramo**: las 50 entidades y el cerebro de planes son código y tablas — funcionan con el modelo OFF.
2. **Skills expandibles** = el registro `skills.md` (100) con campo `tramo_min`; el postinstall y el selector solo habilitan lo que cabe; cada skill aspiracional se convierte en entidad/herramienta real solo pasando la regla de admisión y `npm run validar`.
3. **Presupuesto declarado**: cada espejo/poder reporta su coste real (KB/µs) en su ficha — el tamaño es consecuencia, no adorno.

### 6.6 Extensiones y Forja (capa caliente)
- **Extensiones**: carpeta + `manifest.json` (commands, tools con esquema JSON, panels en iframe aislado por postMessage); se activan desde el botón «Ext» **sin recompilar**. La `description` de cada tool ES el prompt.
- **Forja (Ⓐ)**: `forjar_complemento` — el sistema compone un complemento desde una receta (manifest+panel deterministas, slot de lógica, **eco honesto**: dice lo que hizo y lo que no).
- **Hueco conocido (PLUGINS_MANUAL)**: el host no expone `entidad.run`, los paneles duplican lógica → **V8**: permiso `entities.use` + `ejecutarEntidad` en `ExtensionPanelView` (corrección incluida en V8.1).

---

## 7. L3 — INTERFAZ CON CONTEXTO FLUIDO

"Contexto fluido" = el contexto no es una foto fija: **se compone vivo en cada turno** y la interfaz lo hace visible.

### 7.1 Composición por turno (orden fijo, presupuesto fijo)
```
[IDENTIDAD + DIRECTRICES]   (CEREBRO.md, bloque inmutable, cacheado)
[ESTADO DE MEMORIA]         (memoria.md §1, ≤300 car.)
[CONOCIMIENTO DEL MOTOR]    (KB top-5 según la frase, 700/1.200/2.000/4.000 por tramo)
[SÍMBOLOS REALES]           (symbolIndex, 700/1.300 car.)
[EQUIPO ESPEJO ACTIVO]      (grupo elegido + poderes + "puedes llamarlos con consultar_espejo")
[METRICAS]                  (TTFT/tokens-s reales, D8)
```
Todo el bloque se muestra en un **panel "Contexto (N car.)"** colapsable junto al chat:
cuántos caracteres inyectó cada bloque, de qué KB/entrada vinieron, y el tramo MR activo.
Transparencia de motor (regla 5: nada silencioso).

### 7.2 Superficie (conservada de las versiones probadas)
- **Espina de Actividad** al pie (11 acciones con icono y movimiento: pensando/tecleo/escaneo/BLOQUEADO…) — con el fix FOCO (reserva espacio, no tapa el input).
- **⚡ Consejo** (despertar/dormir + grupos de espejos) · **«A» Aspecto** (fuente/tamaño/color por sección) · **Ⓐ Forjar** · **🚀 Turbo** · badge **📎 embeddings** (un embedder no chatea: el 400 de Ollama explicado antes de gastarlo).
- Árbol vertical (búsqueda, iconos, punto de modificado) + **Adjuntar** (CUALQUIER tipo: zip extrae solo) + **Borrar todo** (con confirmación).
- Sandbox AUTO (watchdog 8 s, auto-heal de deps, HMR con tregua: el AUTO posa el sync mientras un chat transmite) + preview :3500.
- Chats (N) con drawer (renombrar/borrar/auto-título) · TTS por mensaje (ES) · panel Subagentes (topología en vivo de los 4 puertos).
- Preferencias de siempre: español, scrollbars vertical-only, transparencias regulables, visor móvil 390×844.
- **Editor web con ORDEN VISIBLE** (v1.0.1: lo que no se ve no existe).

### 7.3 El X22 — SUPERPODER DE VELOCIDAD Y VECTORIZACIÓN ⏳ PENDIENTE DE CONFIRMACIÓN
Lo que ya existe que alimenta el diseño: `localRAG.ts` (389 L, **implementada y apagada**), Turbo, reflejo lite (350 KB), compactor, carriles CPU/IO.
Diseño de referencia (se congela al confirmar el propietario):

| Sub-sistema | Mecanismo propuesto (8 GB friendly) |
|---|---|
| **Velocidad ×22** | Modo que (1) encadena Turbo + reflejo `lite` + compactor agresivo, (2) precalienta el modelo en el arranque, (3) sirve el contexto por tramo mínimo (700 car.), (4) enruta al espejo antes que al modelo (0 llamadas = ∞ velocidad), (5) batch de espejos de 8 en 1 ms. El multiplicador "×22" se mide (TTFT y tokens/s reales, D8) contra el modo normal y se muestra en el panel — no se promete: se mide. |
| **Vectorización barata** | `localRAG.ts` con: indexación **perezosa** (solo archivos abiertos + símbolos, no el workspace entero), embedder **solo si hay tramo MR3+ o clave cloud** (en MR1/MR2 sigue determinista, ADR 12), vectores cuantizados int8 en memoria (no en disco), y el botón 📎 embeddings ya existente como interruptor. Coste declarado: RAM ≈ KB indexada × dim/4 (int8). |

**Preguntas al propietario (ver pregunta de confirmación)**: ¿"X22" es el nombre del modo (22 = cifra simbólica), un multiplicador meta a alcanzar, o el código interno de un paquete? ¿La vectorización debe funcionar también en MR2 (8 GB) o basta MR3+?

---

## 8. L4/L5 — SEGURIDAD Y EMPAQUETADO (lo más seguro, de todas las versiones)

### 8.1 Endurecimiento P0 (D2+D3)
| Punto | Antes (detectado) | V8 |
|---|---|---|
| `ACCESS_TOKEN` | inerte (declarado, no validado) | **obligatorio en LAN** para `/api/exec`, `/api/fs/write`, `/api/fs/delete`, `/api/sandbox/*`; localhost sin token por defecto |
| CORS IDE | `*` | `http://127.0.0.1:3000` (+ localhost:5173 en dev) |
| Puente :5000 | `shell=True`, `allow_origins=["*"]`, `/file/read` sin sandbox | `subprocess` sin shell con lista blanca de binarios · CORS localhost · rutas permitidas (`.proyectos/` + atajos) · token por header |
| Modo Agente PC | OFF por defecto (se conserva) | OFF por defecto + confirmación explícita en UI + log visible de acciones (pc_*) |
| `.env` | v1.0.1 ya lo sacó del instalador | **ley**: `electron-builder` sin extraResources de `.env`; solo `.env.example` viaja; checklist `SEGURIDAD_CREDENCIALES.md` |
| Escritura de archivos | guard en todas las puertas (se conserva) | + esbuild para TS/JSX (D-P1) |
| npm | 14 vulns → 0 en v3.3.1 | `npm audit --audit-level=high` como puerta de cada fase |
| Ollama en el paquete | eliminado en CodeApp v4.8.0 (05/09) | **se mantiene fuera**: la IDE detecta y sugiere, nunca empaqueta (lección de memoria: ligereza + seguridad) |

### 8.2 Empaquetado
1 EXE Electron (instalador NSIS, publisher **Mario Nicolas Quintero**, `appId com.cerebronico.ide` y `productName` conservados para no romper actualizaciones). Cadena: `vite build` → `esbuild server.mjs` → electron-builder. Sin Python ni Ollama dentro (sonda python→python3→EXE PyInstaller del agente, fallback existente). ZIP del proyecto: ~16 MB objetivo (v3.3.2) — el postinstall deja kb.json + tools.config.json + informe de entorno.

### 8.3 Puertos (regla de oro, inmutable)
3000 IDE · 3500 sandbox/apps exportadas (UNA a la vez, a propósito) · 5000 puente · 11434 Ollama (externo).

---

## 9. Plan de entrega por fases (cada fase con puerta)

| Fase | Contenido | Puerta (no se declara sin ella) |
|---|---|---|
| **V8.0 — Cáscara + Motor** | L0+L1+L3: base server v1.4.0 + plantilla v3.3.2 + motor v2.1 con D1, D4, D5, D8, D10 + 6 utils de agent-v2 + UI con panel Contexto Fluido | `npm run validar` ≥1627·0 · `tsc` 0 · e2e 8 tests · `npm audit` 0 · inyección KB verificada en los 4 providers (test nuevo) |
| **V8.1 — Núcleo agéntico** | L2 completo: 50 entidades + 10 espejos + 22 poderes + reflejo v5 + orquestador + conductor + planificador + extensiones/forja + D6, D7 + corrección `entities.use` + autoaprendizaje/autómatas de Codigo-0 | validar +200 comprobaciones (contratos "conserva + delta") · suite espejos 72 · humo: lote de 10 tareas reflejo "hecho" 10/10 |
| **V8.2 — Seguridad + X22** | D2, D3 (puente endurecido), skills expandibles por tramo MR, modo X22 (velocidad + vectorización, según confirmación) | pentest local del puente (RCE negativo) · métricas ×N medidas y publicadas · RAM en MR2 < 1,5 GB con X22 ON |
| **V8.3 — Empaquetado oficial** | 1 EXE, NSIS, icono, cadena de arranque BAT oculta, sellado de credenciales, bibliografía Capa 6 (registro de cambios V8) | install → primer chat → sandbox AUTO → zip exportado, en máquina limpia; SHA256 del paquete |

**Regla de la casa aplicada a la fusión**: cada fase conserva las cifras de la anterior ("CONSERVA + delta"), nada silencioso, descarte escrito, y lo no medido se declara como no medido.

---

## 10. Riesgos conocidos y su manejo

| Riesgo | Manejo |
|---|---|
| Los modelos pequeños fallan el tool-calling | El reflejo (determinista) resuelve antes de que el modelo intervenga; acciones rápidas por keyword (build 3.0) con 0 llamadas LLM |
| El sandbox mata procesos ajenos | killPort por identidad exacta (ADR 8) |
| Ollama arranca lento (8 GB) | Reintentos 2/4/6 s ×4 (ADR 9) + precalentado |
| La nube cambia los modelos gratis | La guía de cloud se re-verifica por fecha (checklist anti-cloud-falso); el local es la red de seguridad |
| Fusionar contra un manual desactualizado | Fuente única constants.ts (D5) + auditoría contra código (esta entrega) |
| El EXE nuevo rompe la actualización | appId/productName inmutables (MEMORANDUM v3.3 §2.1) |

*Documento terminado. Lo marcado ⏳ se resuelve en la consulta al propietario; todo lo demás está listo para V8.0.*
