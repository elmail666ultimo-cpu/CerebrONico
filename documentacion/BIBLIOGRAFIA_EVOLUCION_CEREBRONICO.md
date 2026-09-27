# BIBLIOGRAFÍA Y EVOLUCIÓN — CEREBRÓNICO
## Archivo multi-capas de toda la literatura acumulada · Entrega oficial V8

| Campo | Valor |
|---|---|
| **Fecha de este tomo** | **20/09/2026** (última actualización de código registrada: 21/09/2026 04:17 — `v1.1.1 BUILD v1`) |
| **Propietario y autor** | Mario Nicolas Quintero |
| **Alcance** | Todo lo que existe del proyecto: 13 paquetes subidos + 4 archivos sueltos + 4 auditorías V8 nuevas |
| **Método** | Cada afirmación apunta a una fuente (archivo + fecha). Lo no verificado se marca `[INFERENCIA]`. |

---

# CAPA 0 — LA IDEA (qué es Cerebrónico)

> «Lo más importante es el motor; el conductor puede ser cualquier flacucho.» — `IDEA_DEL_MOTOR_v2.0.md`

Cerebrónico es un **instrumento / herramienta / contenedor de I.A.** con una tesis central:

1. **El conocimiento vive en el MOTOR, no en el modelo.** Un modelo de 250 MB–1,5 GB no puede *saber* nada, pero el motor sí puede saberlo todo y servirle en cada turno el trozo exacto de contexto. Consecuencia: **cambiar de modelo no cambia el resultado** (Ollama local, GLM/Z.ai, Gemini, OpenRouter se enchufan al mismo motor).
2. **Determinismo primero, creatividad después.** 50 entidades puras (código y tablas, cero RAM relevante) que votan, calculan y ejecutan en microsegundos; el modelo solo hace de *conductor* cuando la frase lo exige (umbral de confianza ≥ 0.8 → el neural ni se despierta).
3. **Máquina de 8 GB como ley de diseño.** Sin embeddings por defecto, sin Docker/Kubernetes, espejos = funciones no modelos, presupuesto de caracteres por tramo (MR1 4 GB → MR4 32 GB). Lo que no cabe en 8 GB se declara, no se esconde.
4. **Cero claves para empezar.** Todo funciona local sin API keys; cada clave opcional (Gemini, OpenRouter, Pollinations) solo *activa* una mejora.
5. **Nada silencioso.** Todo espejo que no puede responder devuelve `motivo`; todo fallo del instalador aborta con nombre; la persistencia declara si no escribió.
6. **Honestidad verificable.** Contratos numéricos con testigo (`npm run validar`), diferencias HECHO/PROMETIDO documentadas, incidentes registrados con causa raíz y mitigación.

Las **directrices** que gobiernan esto (guardrails, protocolo de ejecución, estándar de arquitectura, auto-evolución) viven hoy repartidas en `cerebro.md`, `memoria.md`, `AGENTES_MANUAL.md` y 9 ADRs. **La V8 las consolida en un solo cuerpo normativo** (ver `ARQUITECTURA_CEREBRONICO_V8.md`, sección Directrices).

---

# CAPA 1 — LINAJE Y NOMBRES (la confusión de numeración, resuelta por fechas)

El proyecto usó 4 nombres de marca y 2 esquemas de versión coexistentes. El nombre de paquete npm **nunca cambió**: `codigo-0-cerebronico`. La única forma de ordenar la evolución es **por fecha**, no por número:

| Marca | Fechas reales | Qué era | Paquete npm |
|---|---|---|---|
| **Codeapp / CodeeApp** | ago-2026 (v1.1→v2.3.2); v4.8.0 compilada 05/09/2026 | Línea anterior y paralela (Electron+Vite, autor N. Quintero). De ella salen `MemoryManager` y `automataTeam` (los 11 autómatas). | — |
| **Codigo-0 (v3)** | 12/05/2026 → 25/08/2026 | El linaje de código más antiguo subido: app web **Next.js 16 + Tailwind 4 + shadcn + Prisma + dnd-kit + mdxeditor**. Incompleto (sin schema Prisma, `ignoreBuildErrors:true`). | `nextjs_tailwind_shadcn_ts@0.2.1` |
| **CerebroNico IDE** | desde 10/09/2026 | Nace la IDE de escritorio: "Modo Agente PC" (build 2.0), luego la serie v3.x (Electron + sandbox), luego el MOTOR (v2.x hibrido). | `codigo-0-cerebronico` (versión 1.0.0→1.4.0) / `cerebronico-ide` (serie v2.x) |
| **CerebróNico** (marca actual) | 19/09/2026 → 21/09/2026 | "El gran renombrado": CerebroNico v2.6.3 cierra su era; nace CerebróNico V1.0 con fuente única `IDE_BRAND` (cabecera, pestaña, productName, package.json). Es la línea **agéntica** (50 entidades, espejos, reflejo v5). | `cerebronico-ide` 1.0.0→1.1.1 |

**Correspondencia de numeración (verificada en código):**

| Nombre de producto | Fecha | Versión interna real | Puertas declaradas |
|---|---|---|---|
| CerebroNico-IDE-agent-v2 ("build 2.0") | 10/09 | — | Modo Agente PC (pc_*) |
| CerebroNico-IDE v3.1 "Autoarranque" | ~10/09 | 1.3.0 | EXE+BAT+sandbox real |
| CerebroNico-IDE v3.2 "Sandbox Automático" | ~11/09 | 1.3.0 | piloto AUTO, watchdog, TTS, chats |
| CerebroNico-IDE v3.3 "Refactor" | 13/09 | 1.3.0 | 16 MB/105 archivos, credenciales M.N.Q. |
| CerebroNico-IDE v3.3.1 "Seguridad" | 13/09 | 1.3.1 | 14 vulns npm → 0 |
| **CerebroNico-IDE v3.3.2 "Sandbox Estable"** | 13/09 | 1.3.2 | full-reload fix, Adjuntar/Borrar todo |
| CerebroNico_IDE v1.4.0 "listo_compilar_exe" | 12–15/09 | 1.4.0 | +7 mejoras sobre v3.3.2, cadena NSIS 2-EXE |
| CerebroNico-IDE v2.0 "hibrido3" (MOTOR) | 13–18/09 | (motor) | knowledgeBase, syntaxGuard, símbolo, compactor |
| CerebroNico-IDE v2.1 "hibridoOK" (GOBERNANZA) | 13–18/09 | (motor) | brain.ts, memoria viva, importChecker, cloudVerifier |
| **CerebróNico V1.0** (renombrado + FOCO) | 20/09 | v2.6.3 + Reflejo v3.0 | validar 1481·0·21 |
| **CerebróNico V1.0.1** (Batilos Record) | 20/09 tarde | v2.6.3 | .env fuera del EXE (seguridad) |
| **CerebróNico V1.0.2** (era de los espejos) | 20/09 noche | v2.6.3 | consultar_espejo, reintentos Ollama |
| **CerebróNico V1.0.3** (PODERES) | 20/09 noche | v2.6.3 | 22 poderes en 8 espejos + 🚀 Turbo |
| **CerebróNico V1.1.0** (REFLEJO v5) | 21/09 | Reflejo v5 | salud, confianza, grupo, bóveda · 1627·0·27 |
| **CerebróNico V1.1.1** (BUILD v1) | 21/09 04:17 | Reflejo v5 | build verde (pool.ts puro) · 1627·0·27 |

> Nota: `constants.ts` llegó a decir `V1.0.3` mientras `package.json` decía `1.1.1` (triple fuente de versión). **V8 impone fuente única** (ver arquitectura §Decisión D5).

---

# CAPA 2 — EVOLUCIÓN POR ETAPAS (qué trajo cada salto y qué lección dejó)

## ETAPA 0 — Codigo-0 v3 (12/05→25/08/2026) · la semilla web
App Next.js con editor (dnd-kit), Prisma y mdxeditor. Incompleta, pero aporta piezas que luego migraron: `lib/autoaprendizaje.ts` (376 L, motor de auto-aprendizaje sin dependencias), `lib/automata-team.ts` (221 L, **los 11 autómatas**: Orquestador, Auditor, Arquitecto, Hacker, Coder…), `lib/ide-store.ts` (593 L, patrón de contexto/estado). Los módulos `attachmentProcessor/syntaxEngine/languageMemory/contextCache/codeParser` **no están aquí**: viven en `agent-v2` (auditado, ver Capa 3).
*Lección: el conocimiento de "qué rescatar" solo se obtiene con auditoría por código, no por nombre.*

## ETAPA 1 — agent-v2 + fix-ollama (10/09/2026) · nace el "Modo Agente PC"
Mismo proyecto en dos instantes (`fix_ollama` 05:44 → `agent-v2` 16:48). Primera vez que el chat **hace cosas reales en la PC** vía puente :5000: herramientas `pc_info/pc_exec/pc_write_file/pc_read_file/pc_list_dir/pc_delete`. Aquí viven las 6 utilidades que toda la serie posterior heredó: `engine.ts` (757 L), `attachmentProcessor.ts` (592 L), `syntaxEngine.ts` (193 L), `contextCache.ts` (193 L), `languageMemory.ts` (188 L), `codeParser.ts` (96 L), + `tests/comprehensive_e2e_test.py` (976 L, 8 tests).
*Lección: el agente PC requiere activación explícita (OFF por defecto) y modelo con tool-calling.*

## ETAPA 2 — v3.3.2 "Sandbox Estable" (10→13/09/2026) · la IDE funcional
La serie v3.x (5 subversiones en 3 días) construyó la cáscara completa:
- **v3.1**: el EXE lanza el BAT oculto, splash con progreso real, polling a :3000 hasta 6 min (reemplaza el setTimeout de 2,5 s que fallaba en arranque frío), árbol vertical de archivos, ZIP exportable en :3500, sandbox real (`/api/sandbox/start|stop|status|logs`, `taskkill /T`, limpieza de huérfanos por netstat).
- **v3.2**: piloto automático (AUTO ON por defecto), watchdog cada 8 s, auto-sync con HMR (debounce 2,5 s), auto-heal de dependencias, carpeta de chats (renombrar/borrar/auto-título), TTS por mensaje (speechSynthesis ES), descargas deduplicadas (exactamente 2 salidas).
- **v3.3**: limpieza de peso muerto (62,8 MB/5.091 archivos → **16 MB/105 archivos**), `constants.ts` (puertos + 19 claves LS, única fuente), `storage.ts` (JSON corrupto/cuota), fix crítico del puente (sonda python→python3→`CerebroNicoAgent.exe` de 15 MB), página de error con reintento cada 10 s, `ollamaUrl` persistente, watchdog validando `r.ok`.
- **v3.3.1**: 14 vulnerabilidades npm (13 high, 1 critical) → **0** (Electron 44.3.0, builder 26.15.3, BATs CRLF).
- **v3.3.2**: Vite ignora `.proyectos/**` (muere el "la IDE se cierra y se reinicia"), `killPortListeners` exige puerto local EXACTO + TCP LISTENING y nunca mata su propio PID, botón **Adjuntar** (CUALQUIER tipo: zip se extrae solo, PDF, binarios base64), botón **Borrar todo**, DEP0190 eliminado, instalador NSIS reparado.
- **Memoranda (13/09)**: plano completo de puertos (3000/3500/5000/11434), renombre de las 10 credenciales a Mario Nicolas Quintero (appId/productName conservados a propósito para no romper actualizaciones), y la **guía de modelos gratuitos verificada**: Ollama Cloud Free (sin tarjeta, sin límites de 5 h/semana desde 31/08/2026) — `gpt-oss:120b-cloud`, `qwen3-coder:480b-cloud`, `deepseek-v3.1:671b-cloud`, visión `qwen3-vl:235b-cloud` (OCR 32 idiomas, contexto 256K) — + Gemini Flash free + checklist anti "cloud gratis" falso.
*Lecciones: el sandbox SIEMPRE en :3500 (nunca choca con la IDE); los procesos huérfanos se matan por identidad exacta de puerto; un instalador que empaqueta `.env` incrusta claves reales en el EXE (se detectó y selló).*

## ETAPA 3 — v1.4.0 "listo_compilar_exe" (12→15/09/2026) · empaquetado y +7 mejoras
Sobre `server.ts` de v3.3.2 añade: autodetección de modelos `:free` (Gemini/OpenRouter), API key por request, anti-zombie sandbox, `HOST=0.0.0.0` configurable, backoff exponencial, y la cadena PyInstaller de **2 EXE** (agente + server) con `extraResources`/NSIS. **Pierde** (regresión detectada por auditoría): la plantilla `.proyectos/`, `server.mjs.map` y el auto-install del BAT → v1.4.0 se distribuye sin sandbox ejecutable. Además: `requirements.txt` corrupto con fence markdown (rompe `pip install`), `main.py` declara "v3.3.2" (falsa identidad) y un archivo basura `ide/backend/#`.
*Lección: "listo para compilar" se comprueba con la cadena completa, no con el build aislado. Las 7 mejoras sí son oro; las 4 pérdidas, no.*

## ETAPA 4 — v2.0 "hibrido3" (13→18/09/2026) · EL MOTOR
El salto conceptual mayor: `src/engine/` con 8 módulos:
- **knowledgeBase.ts** — 62 entradas de fábrica (8 tablas: rule/syntax/error/pattern/tool/skill/project/lesson), recuperación determinista por solape de palabras clave + prioridad + peso (sin embeddings a propósito: 8 GB), `buildEngineContext()` inyecta `[CONOCIMIENTO DEL MOTOR]` (top 5, presupuesto 700 car. micro / 1.200 resto), endpoints `/api/engine/kb*`, `/api/engine/sync`, `/api/engine/tools`.
- **syntaxGuard.ts** — nada llega al disco sin validarse; escritura rechazada o edición revertida, y el error detallado vuelve al modelo para autocorregirse. (Política conservadora tras el incidente 32/63.)
- **validateToolCall()** — los modelos pequeños inventan campos: antes de ejecutar se valida contra el esquema (faltante → error al modelo; inventado → se descarta; tipo mal → error; `"40"` → se convierte).
- **symbolIndex.ts** — firmas REALES de funciones/clases/interfaces/componentes (TS/JS/TSX/JSX/PY); `[SÍMBOLOS REALES DEL PROYECTO]` por turno; `find_symbol`; ~400 caracteres vs ~12.000 de leer el archivo.
- **compactor.ts** — el motor compacta los resultados ANTES de que entren al turno siguiente (archivo → estructura+principio+final; comando → principio+final+TODOS los errores; búsqueda → primeros+recuento; JSON → estructura). **Los errores nunca se compactan.**
- **Aprendizaje**: cada error real de herramienta se normaliza y se guarda como entrada `error` (dedup, acotado). El motor sabe de los fallos de ESTE entorno.
- **postinstall.mjs** — crea kb.json + tools.config.json (packs externos por `GET <url>/tools`, sin tocar código) + informe de entorno (Node, puertos, modelos ligeros).
- **RESULTADO_PRUEBAS_MOTOR.txt** — 40 PASS. ⚠️ Auditoría V8: el .txt tiene el mismo md5 desde v1.0.1, sin runner, y 3 de sus PASS contradicen el código → **no reproducible; V8 la regenera con runner real.**

## ETAPA 5 — v2.1 "hibridoOK" (13→18/09/2026) · GOBERNANZA
7 de 11 módulos del motor byte-idénticos a v2.0 (estables). Añade:
- **brain.ts** (577 L) — núcleo de gobernanza: consume `cerebro.md` (ley) + `memoria.md` (pizarra viva): escritura atómica con lock, `memoria_history/` (retención 60, **rollback real** vía `/api/brain/rollback`), compresión cada 10 turnos, incidencias automáticas, propuestas de auto-parcheo guardadas en `.cerebro-db/proposals/` (el motor propone; el humano aprueba).
- **localRAG.ts** (389 L) — vectorización local **implementada pero APAGADA** (el ADR la pospone a >5.000 líneas de memoria). ← Es la semilla del "vectorización barata" que pide la V8.
- **importChecker.ts** — detecta imports que el modelo inventó y crea **stubs funcionales** (el preview deja de quedar en blanco).
- **hardwareGovernor.ts** (228 L) — medidor/recomendador de carga (no actúa solo).
- **cloudVerifier.ts** (416 L), **projectPorter.ts** (252 L), **advancedFeatures.ts** (418 L), **selfImprovement.ts** — el panel de Autosuperación.
- `server.ts` +941 L: inyección `[CONOCIMIENTO DEL MOTOR]` + `[MANUAL DEL MOTOR]` + `[SÍMBOLOS REALES]`. ⚠️ **Solo en la rama Ollama** (Gemini/Z.ai/OpenRouter no reciben KB) → P0 de la V8.
*Lecciones: el guard se aplica en TODAS las puertas de escritura (el `/api/fs/sync` fue la puerta por la que entró un `index.html` truncado); proyectos estáticos son proyectos válidos; un archivo de estado que se trunca NO se escribe; nunca enviar al modelo contenido recortado como base de reescritura (100 KB → archivo cortado).*

## ETAPA 6 — CerebróNico V1.0 (20/09/2026) · el gran renombrado
CerebroNico v2.6.3 cierra su era; nace la marca **CerebróNico V1.0** con `IDE_BRAND` como fuente única. Fix FOCO v1 (la Espina de Actividad era una barra `fixed` que tapaba el textarea del chat), fondo por defecto, "recursión educada" (IDE dentro de su propio sandbox).
*Lección: una barra que no reserva espacio destruye el input del usuario — UI con `position` que empuja, no que cubre.*

## ETAPA 7 — V1.0.1 (20/09 tarde) · la prueba "Batilos Record"
ORDEN VISIBLE (lo que no se ve no existe: la orden del editor web y su respuesta se publican en el chat central), CONSOLA LIMPIA (el sandbox arranca vacío, sin resucitar sesiones de localStorage), FOCO v2 (Alt+Tab dejaba `userSelect:none` congelado → reset al perder foco de ventana), PROPIO-IDE en ruta de producción (build + `node dist/server.mjs`; el desvío dev choca con TransformError bajo Node 26), **CREDENCIALES: el instalador ya no empaqueta `.env`** + `SEGURIDAD_CREDENCIALES.md`.

## ETAPA 8 — V1.0.2 (20/09 noche) · la era de los espejos
- **OLLAMA v2 "nada rompa la comunicación"**: ECONNREFUSED = Ollama arrancando (8 GB, disco lento), no cable suelto → reintentos 2/4/6 s ×4 (~14 s de paciencia real).
- **consultar_espejo**: nueva herramienta del chat; el modelo llama espejos DIRECTO, en lotes de hasta 8, determinista en ~1 ms.
- **espejo.codigos ampliado**: entrega `simbolosLista` (hasta 24 nombres reales).
- **10 espejos** (`espejos.ts`, 36 KB de fuente, CERO imports de runtime — verificable en el archivo): `codigos` (inventario estructural JSON), `lenguajes` (detección + Flesch), `artes` (armonías HSL reales), `disenios` (grilla 8pt/breakpoints), `creadores` (combinatoria reproducible mulberry32/FNV-1a, cero `Math.random`), `planificadores` (Kahn + rechazo de ciclos + presupuesto `io≥1·cpu≥1·io≤16`), `cientificos` (H0/H1 + prueba estadística por tabla), `fisicos` (constantes SI), `matematicos` (exactitud sin `eval`), `cuantico` (1–8 qubits, amplitudes complejas exactas).
- 4 grupos (💻 codigo / 🎨 arte / 🔬 ciencia / ⚛️ cuantica) + selector dentro del modal de modelos, dos caras sincronizadas (navegador: localStorage `cn.espejos.seleccion`; motor: `.cerebro-db/espejos.json`).
- Icono EXE multi-tamaño (16→256) generado desde el chip-cerebro. Versiones: 1481·0·21.
*Lección: "espejo" = función pura con contrato de salida distinto; si devuelve lo mismo que una entidad existente, es vocabulario nuevo, no entidad nueva (regla de admisión).*

## ETAPA 9 — V1.0.3 (20/09 noche) · PODERES + 🚀 TURBO
**22 poderes nuevos en 8 espejos** (`poderes-espejos.ts`, despachados por `accion`): matematicos (estadística+IC95, lineal/cuadrática con raíces complejas, matrices, bases, mcd/mcm, interés compuesto) · artes (contraste WCAG, daltonismo ×3, gradiente) · codigos (dependencias, firmas, bloques duplicados) · lenguajes (frecuencias, case, diff) · planificadores (topológico + ondas paralelas) · disenios (escala tipográfica modular, breakpoints) · cientificos (tamaño muestral, IC) · cuantico (entrelazamiento por concurrencia). Humo real: lotes `[[a],[b,c],[d]]`, WCAG 4.54 AA, cuadrática x∈{2,3}, Bell 50/50.
**🚀 Turbo (botón en cabecera)**: arma el reparto completo de poderes en el system prompt; con Turbo ON, nada de aritmética/contraste/planes "de cabeza" — el modelo llama al espejo.
*Lección: el poder determinista se activa por botón visible, y sus límites se declaran (cuantico topa en 8 qubits).*

## ETAPA 10 — V1.1.0 (21/09) · REFLEJO v5
Destilación del recap del usuario ("saca lo mejor de esto") a la arquitectura REAL (máquina 8 GB, no clúster): 10 defectos confirmados curados (sandbox 18 tipos de proyecto + ADUANA v2; IMAGEN v5 con reintentos; leyes aprendidas que morían al reinicio — `require` dentro de ESM; ternario de ramas idénticas en `ant-codigo`; tarea reflejo frase-primero; espejos en carril CPU no IO; jszip ESM; IDE anidada auto-instalada; PROJECT_ROOT en lugar de cwd; prioridadOffset). Nuevas capas:
- **Salud** (`salud.ts`): score Laplace, estrella ≥0,95, dormido <0,5 (≥8 usos) fuera del auto-enrutado; persistencia `espejos-salud.json`; `/api/espejos/salud[/dormir|/reset]`.
- **Confianza** (`orquestador.ts`): prueba TODAS las leyes; umbral 0,55 + margen 0,08; con dudas **confiesa** y lista alternativas.
- **GRUPO v1**: equipo por tarea según señales del contenido; sin señales claras → null ("el auto no lanza monedas").
- **BÓVEDA v1** (`bovedaLocal.ts`): transporte de imágenes al disco real indexado (`C:\CN\IMAGENES\<proyecto>\<fecha>\`, INDICE.json con sha256, dedupe, origen, modelo real).
- **Auditoría de entrada** (`/api/entrada/auditar`) y **PREDEV** (gen-reflejo + gen-modelfiles antes de dev).
- Descarte declarado: Kubernetes/Docker Compose/NGINX/réplicas ("el equivalente honesto es salud de flota + carriles de concurrencia") y tiling con SD/ComfyUI (sin GPU).
*Lección: "recap de clúster" de un usuario ≠ infraestructura a implementar; se traduce al equivalente determinista en proceso y lo inaplicable se descarta POR ESCRITO.*

## ETAPA 11 — V1.1.1 (21/09 04:17) · BUILD v1
El build moría en `existsSync` no exportado: `consejo.ts` (que viaja al bundle del navegador) importaba el pool desde `cargadorEspejos.ts`, que toca `node:fs`. Cura por **inversión de dependencia**: `pool.ts` 100 % puro (navega a cualquier lado) + cargador conserva solo el fs. `npm run build` verde (2010 módulos vite + esbuild), validar 1627·0·27, tsc 0. Nota npm ≥12: `npm install-scripts approve esbuild`.

## ETAPA 12 — V8 (20/09/2026, en curso) · LA FUSIÓN
Fusión refactorizada autónoma de lo mejor probado de las 11 etapas. Documentada en `ARQUITECTURA_CEREBRONICO_V8.md`. Lo que NO se repite: la confusión de nombres (fuente única), el motor que solo habla a Ollama (inyección para todos los proveedores), el `.env` empaquetado, el puente RCE, las verificaciones irreproducibles, las 75 skills prometidas sin código.

---

# CAPA 3 — DOCUMENTACIÓN ACUMULADA (índice completo de fuentes)

## 3.1 Documentos de dirección (existen en los zips)

| Documento | Origen | Fecha | Qué fija |
|---|---|---|---|
| `IDEA_DEL_MOTOR_v2.0.md` | v2.0 | 18/09 | Tesis del motor, KB 28→62 entradas, blindajes, verificación 21 PASS, fases 1-2 |
| `RESULTADO_PRUEBAS_MOTOR.txt` | v2.0/v2.1 | 18/09 | 40 PASS ⚠️ no reproducible (md5 idéntico desde v1.0.1) |
| `MEMORANDUM_CerebroNico-IDE_v3.3_Mario-Nicolas-Quintero.md` | v3.3.2 | 13/09 | Plano completo, 10 credenciales renombradas, inventario v3.1-v3.3, verificaciones |
| `MEMORANDUM.md` (v3.3.2 "Sandbox Estable") | v3.3.2 | 13/09 | 6 cambios v3.3.2, plano de puertos, **modelos cloud gratis verificados** (gpt-oss:120b-cloud, qwen3-vl:235b-cloud), checklist anti-cloud-falso |
| `AGENTES_MANUAL.md` | v1.x | 20/09 | 40→50 entidades, conductor, planificador concurrente, 4 caminos de reflejo personalizado, límites declarados, ANEXO v2.6.3 (⚡/A/Ⓐ/Espina/fondo/badge embeddings) |
| `PLAN_EJECUCION_ESPEJOS_v1.md` | v1.x | 19/09 | Auditoría de admisión de los 10 espejos, 4 grupos, presupuesto 5 MB/agente (margen 1.400×), 20 parches ancla, rollback |
| `MANUAL_FORJA_v1.md` | v1.x | 19/09 | Ⓐ Forjar: receta → manifest+panel deterministas, eco honesto |
| `COREO_MANUAL_v1.md` | v1.x | 19/09 | Espina de Actividad (11 acciones) |
| `PLUGINS_MANUAL.md` | v1.x | 19/09 | Extensiones calientes (iframe, postMessage) + hueco de extensibilidad (`entidad.run` no expuesta) |
| `MANUAL_ASPECTO_v1.md` | v1.x | 19/09 | «A» Aspecto: fuente/tamaño/color SOLO del texto por sección |
| `MANUAL_INSTALACION_SEGURA.md` | v1.x | 19/09 | sha256 + aplicador con anclas + revert |
| `cerebro.md` | v2.1 | 18/09 | **Núcleo inmutable**: identidad, 6 guardrails, protocolo de ejecución 4 pasos, estándar (puertos/rutas/contexto/modelos), auto-evolución, Fast-Decision Engine (Output Schema, fallback silencioso) |
| `memoria.md` | v2.1 | 18/09 | **Pizarra viva**: estado, 6 ADRs, preferencias del usuario, 4 lecciones, backlog, 5 incidencias con causa raíz, métricas |
| `skills.md` (100) | v3.3.2 `.proyectos/` | 13/09 | Catálogo de 100 habilidades ⚠️ solo ~20-25 implementadas; el resto aspiracional (inyectado al prompt) |
| `MEMORIA.md` (.proyectos) | v3.3.2 | 13/09 | Memoria del workspace del sandbox |
| `CHANGELOG.md` (build 2.0/3.0) | v3.3.2/v1.x | 10-13/09 | Modo Agente PC, acciones rápidas deterministas (cero LLM), panel Subagentes, seguridad 14→0 |
| `CHANGELOG_v1.0.md` / `_v1.1.0.md` / `_v1.1.1.md` | v1.1.1 | 20-21/09 | Toda la línea agéntica (etapas 6-11) |
| `LEEME_ CAMBIOS v3.1/v3.2/v3.3.txt` | v3.3.2 | 13/09 | Hojas de cambio de la serie v3 |
| `LEEME_CAMBIOS_CerebroNico_V1.md` / `_IDE_v1.md` | v2.0/v2.1 | 13-18/09 | Hojas de cambio de la serie IDE v1/v2 |
| `CAMBIOS_v1.1_ZAI_GRATIS.md` | v2.0 | 17/09 | Integración Z.ai (GLM) gratuito |
| `LEEME_INSTALAR_v2.0.txt` | v2.0 | 18/09 | Instación (lección: la carpeta equivocada) |
| `COMPILACION_EXE.md` | v3.3.2/v1.4.0 | 13-15/09 | Cadena de compilación del instalador |
| `SEGURIDAD_CREDENCIALES.md` | v1.0.1 | 20/09 | Sellado de claves; `.env` fuera del EXE |
| `MEMORANDUM-SEGURIDAD.md` | Codeapp v2.3.2 | ago/09 | Documenta la vulnerabilidad RCE del puente original |
| `CODIGO-CODEEAPP-2.3.2.md` | Codeapp v2.3.2 | 22/08 | Ancestro conceptual (MemoryManager, automataTeam) |
| `prueva_chat_codigo-0_v2_3_2.md` | suelto (uploads) | 10/09 | Log de pruebas de chat (bucle) |
| `iniciar_ollama_11434.bat` | suelto (uploads) | 10/09 | Lanzador Ollama (32 L) |
| `agent_bridge_5000.py/.js` (sueltos) | uploads | 10/09 | ⚠️ versiones INSEGURAS del puente (HOST 0.0.0.0, CORS *, shell=True, RCE) — solo como evidencia |
| `requirements.txt` (v3.3.2) | v3.3.2 | 13/09 | ⚠️ corrupto (fence markdown dentro) → `pip install` falla |

## 3.2 Fuentes de código (las 13 carpetas auditadas)

| Carpeta | Contenido | Fecha | Estado |
|---|---|---|---|
| `cerebronico_evolution/extra_codigo0/` | Codigo-0 v3 (Next.js) | 05-12→08-25 | incompleto; 3 libs rescatables (ALTO valor) |
| `…/agent-v2/ide/` | "Modo Agente PC" build 2.0 + 6 utils + e2e | 09-10 | completo; **fuente de utilidades de la V8** |
| `…/extra_fix_ollama/` | instante previo de agent-v2 | 09-10 | 201 L, sin tests (histórico) |
| `…/v3.3.2/ide/` | **La IDE funcional** (Electron, sandbox, 18 rutas API) | 09-10→13 | la más completa como cáscara |
| `…/v1.4.0/ide/` | +7 mejoras y cadena NSIS; −plantilla sandbox | 09-12→15 | mezclar: tomar sus 7 mejoras |
| `…/v2.0/…/ide/` | MOTOR fase 1 (8 módulos) | 09-13→18 | verificado contra doc: cumple |
| `…/v2.1/…/ide/` | MOTOR fase 2 + gobernanza (15 módulos +941 L server) | 09-13→18 | verificado; inyección solo-Ollama (P0) |
| `…/v1.0/` … `…/v1.1.1/` | Línea agéntica (50 entidades, 10 espejos, 22 poderes, reflejo v5, bóveda) | 09-19→21 | la más reciente; **fuente del núcleo agéntico** |
| `…/extra_pruebas_v232/` | Pruebas de Codeapp v2.3.2 (workspaces, zips, docs seguridad) | 08-22→09 | histórico/ancestral |

## 3.3 Auditorías V8 (nuevas, esta entrega)

| Archivo | Alcance |
|---|---|
| `audits/01_shell_v332_v140.md` | API completa 15↔18 rutas, cadena Electron, sandbox, puente :5000, seguridad, diff v1.4.0↔v3.3.2, 100 skills auditadas |
| `audits/02_motor_v2x.md` | 15 módulos del motor HECHO/PROMETIDO, KB 62 entradas, guard conservador, brain/memoria viva, métricas, verificación no reproducible |
| `audits/03_agentico_v1x.md` | Catálogo 50 entidades, 10 espejos + 22 poderes, reflejo v3 (350 KB/1,94 MB), conductor, planificador, extensiones, forja, diff de los 5 zips, 4 defectos de integración (H1-H6) |
| `audits/04_lineaje_early.md` | Codigo-0 vs Codeapp vs CerebroNico, tabla "qué rescatar" (ALTO/MEDIO/BAJO/NULO), puentes inseguros |

---

# CAPA 4 — LECCIONES CONSOLIDADAS (los ADRs y incidentes que la V8 debe respetar)

### ADRs (decisiones arquitectónicas con causa)
1. **El conocimiento vive en el MOTOR, no en el modelo** (17/09). Cualquier modelo (0,5B, GLM, Gemini) recibe el mismo saber → cambiar de modelo no cambia el resultado.
2. **Blindaje con política conservadora** (17/09). Un guardián que rechaza archivos correctos es peor que no tener guardián: el incidente bloqueó **32 de 63 archivos válidos** y dejó el preview en blanco. Ahora solo se bloquea lo indudable.
3. **El guard se aplica en TODAS las puertas de escritura** (17/09). Faltaba en `/api/fs/sync` (volcado del piloto automático) — fue la puerta real por la que entró el `index.html` truncado.
4. **Proyectos estáticos son proyectos válidos** (17/09). `index.html` sin `package.json` → servidor estático Node: sin npm, sin build.
5. **Verificación de imports en el motor** (17/09). El modelo inventa imports; el motor lo detecta y crea **stubs funcionales**.
6. **Canal directo del editor** (17/09) → corregido en v1.0.1: **lo que no se ve no existe**; la orden del editor se publica en el chat central.
7. **`.env` nunca viaja empaquetado** (20/09, v1.0.1). El instalador que lo incrusta entrega las claves reales dentro del EXE → sellado + `SEGURIDAD_CREDENCIALES.md`.
8. **killPort por identidad exacta** (13/09). Puerto local EXACTO + estado LISTENING + nunca el propio PID (evita matar :35000 o conexiones remotas).
9. **"Nada rompa la comunicación" con Ollama** (20/09). ECONNREFUSED = arranque lento en 8 GB, no fallo → reintentos 2/4/6 s ×4.
10. **Contratos numéricos "CONSERVA + delta"** (20/09). Crecer 40→50 entidades se aserta como "conserva los 40 + 10 nuevas"; congelar la cifra convierte el crecimiento legítimo en falsa alarma.
11. **CERO imports de runtime en lo que navega al navegador** (19/09). `espejos.ts`/`pool.ts`/`consejo.ts`: solo `import type`; el que navega no toca disco (lección del build roto de v1.1.1).
12. **8 GB es la ley**: sin embeddings por defecto (localRAG existe apagada), espejos = funciones (~1 ms, JSON compacto), Docker/K8s/NGINX descartados por escrito (v1.1.0).
13. **El auto no lanza monedas** (21/09). Grupo espejo "auto" → null sin señales claras; orquestador con dudas confiesa y lista alternativas.
14. **Fuente única de versión** (20/09, v1.0.2). `constants.ts` (`IDE_BRAND`); la triple fuente (constants/package/manual) causó que "fusionar contra el manual" perdiera 10 espejos + orquestador + 6 suites.
15. **Descarte escrito** (21/09). Lo que no aplica se registra con motivo (K8s, tiling SD, réplicas) — no se olvida en silencio.

### Preferencias del usuario (memoria.md, 18/09) — la V8 debe conservarlas
- Idioma de trabajo: **español**. Interfaz: scrollbars **vertical-only**, sin barras horizontales.
- Transparencia del módulo y del chat **regulable**. Visor móvil 390×844 real, escalado no deformado.
- Rutas con espacios/paréntesis: **citar siempre**. Sin relleno: respuestas directas, al grano.

### Lecciones técnicas (evitar repetir)
- Comentario JSX `{/* */}` dentro de una expresión (`cond && (`) rompe la compilación: va ANTES de la expresión.
- No paralelizar ediciones sobre el mismo archivo sin verificar después; no validar con artefactos compilados viejos (el primer diagnóstico del blindaje fue falso por eso).
- Un archivo de estado truncado NO se escribe (el motor devuelve el motivo).
- **Nunca** enviar contenido recortado (100 KB) al modelo como base de reescritura: lo devuelve tal cual → archivo cortado.
- `require()` dentro de un módulo ESM = excepción tragada en silencio (murió la persistencia de leyes aprendidas, v1.1.0 defecto 3).
- Las tareas de espejo corren por **carril CPU** (1 ms), no IO: en IO desplazan al modelo en el presupuesto.

---

# CAPA 5 — V8 (20/09/2026): fusión oficial en curso

- **Qué es**: consolidación de las 11 etapas en una sola arquitectura con fuente única, motor multi-proveedor, 50 entidades + 10 espejos + 22 poderes (un click de distancia, despiertos/dormidos, con salud y confianza), skills expandibles por tramo MR (4/8/16/32 GB), modo de velocidad+vectorización (X22 — pendiente de confirmación del propietario), interfaz de **contexto fluido** (el prompt de cada turno se construye vivo y la UI muestra qué contextos se inyectaron), y seguridad P0 (token efectivo, sin CORS `*`, puentes sandboxeados, sin RCE).
- **Documentos de esta entrega**: `ARQUITECTURA_CEREBRONICO_V8.md` (plano + directrices consolidadas + mapa de fusión) y `FUNCIONES_LOGICAS_IDE_PROFESIONAL.md` (checklist de funciones de IDE profesional + estado Cerebrónico + plan V8).
- **Fase actual**: arquitectura aprobada-pendiente → ensamblaje por fases (V8.0 cáscara+motor → V8.1 núcleo agéntico → V8.2 seguridad+X22 → V8.3 empaquetado EXE), cada fase con sus puertas de verificación (validar ≥1627·0, tsc 0, e2e 8 tests, npm audit 0).

*Fin del tomo 1 de la bibliografía multi-capas. Próximas capas: el registro de cambios de la propia V8 (Capa 6, una entrada por fase entregada).*
