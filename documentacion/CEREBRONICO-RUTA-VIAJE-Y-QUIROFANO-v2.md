# CerebróNico — Ruta de viaje, evolución estética, capacidades y QUIRÓFANO v2

> **Paquete analizado:** `Cerebronico-CN-v1.6.31-ARBOL-LIMPIO+QUIROFANO-v1-CORREGIDO.zip`
> **Fecha:** 24-sep-2026 · **Método:** verificación contra código real del árbol (grep/lectura), no contra manuales.
> **Regla de la casa:** nada se declara hecho sin archivo/endpoint/prueba.

**Nota de interpretación:** pides «evolución estética solo envejecer». La entiendo como
**evolución estética en un solo sentido: solo engrandecer, nunca envejecer** — la interfaz
puede crecer pero jamás regressar. Eso encaja con tu problema central (mejorar algo que ya
funciona y terminarlo rompiendo). Si querías otra cosa, dilo y ajusto la sección 2.

---

## 0. Veredicto del motor: FUNCIONAL (con evidencia, no con fe)

| Comprobado en este árbol | Resultado |
|---|---|
| `ide/backend/package.json` | `"version": "1.6.31"` — la promesa del informe SÍ está en este ZIP (a diferencia del veredicto v1.6.31-vs-árbol-limpio que auditó el ZIP anterior) |
| Quirófano v1 instalado | `src/engine/quirofano.ts` (882 líneas, 0 dependencias) + **16 anclas en `server.ts`** + `tests/quirofano.test.ts` + integrado en `scripts/validar.mjs` |
| ESPEJO-SYNC (cura del árbol mezclado) | `src/engine/espejoSync.ts` existe + suite 19/19 + GUARDA-SERVIDOR-EJEC en `/api/exec` |
| Motor | **57 módulos** en `src/engine/` (brain, knowledgeBase, syntaxGuard, symbolIndex, compactor, importChecker, espejos, reflejo, resilience, aduanaArbol, fondo, aspecto, bovedaLocal, pluginForja, …) |
| Superficie real | **28 herramientas** en `toolRegistry.ts` · **120 rutas `/api/*`** · 124 handlers registrados |
| Última validación documentada | `npm run validar` → 2254 comprobaciones · 0 fallos · 36 suites (hoja de datos, V0.9); +102 comprobaciones extra del Quirófano |

**Las dos deudas honestas (no ocultas, ya declaradas en ROADMAP.md):**
1. `dist/` viaja viejo → **sin `npm run build` el EXE no lleva Quirófano puesto** (una sola orden lo arregla).
2. D4 (puerta de verificación completa en tu máquina) y D8 (métricas reales de inferencia) siguen pendientes — son tareas, no fallos del motor.

---

## 1. RUTA DE VIAJE — en texto, del origen al hoy y hacia fuera

### 1.1 Lo recorrido (13 paradas, ordenado por fecha — los números de versión mintieron, las fechas no)

```
PARADA 0  · mayo–ago 2026   · Codigo-0 v3 (Next.js) ................. la semilla web.
                                  Rescatables: autoaprendizaje, los 11 autómatas, ide-store.
PARADA 1  · 10 sep 2026     · agent-v2 "Modo Agente PC" ............. el chat hace cosas reales
                                  en la PC (puente :5000, herramientas pc_*).
PARADA 2  · 10–13 sep       · serie v3.1→v3.3.2 "Sandbox Estable" .. la cáscara completa:
                                  EXE+BAT, sandbox :3500, piloto AUTO, watchdog, TTS,
                                  limpieza 62,8 MB→16 MB, 14 vulns→0, killPort exacto.
PARADA 3  · 12–15 sep       · v1.4.0 "listo_compilar_exe" ........... +7 mejoras y cadena NSIS;
                                  perdió la plantilla del sandbox (lección: probar la cadena
                                  completa, no el build aislado).
PARADA 4  · 13–18 sep       · v2.0 "hibrido3" — EL MOTOR ............ knowledgeBase 62 entradas,
                                  syntaxGuard, symbolIndex, compactor, validateToolCall.
                                  Tesis fijada: el conocimiento vive en el motor, no en el modelo.
PARADA 5  · 13–18 sep       · v2.1 "hibridoOK" — GOBERNANZA ......... brain.ts + memoria viva,
                                  importChecker (stubs), cloudVerifier, hardwareGovernor.
                                  Deuda detectada: inyección solo en rama Ollama (luego sanada).
PARADA 6  · 20 sep (mañana) · CerebróNico V1.0 — el gran renombrado. IDE_BRAND fuente única.
                                  FOCO v1 (la barra que tapaba el chat).
PARADA 7  · 20 sep (tarde)  · V1.0.1 "Batilos Record" ............... orden visible en chat,
                                  consola limpia, foco v2, y LO IMPORTANTE: .env ya no viaja
                                  en el EXE.
PARADA 8  · 20 sep (noche)  · V1.0.2 era de los espejos ............ consultar_espejo, 10 espejos
                                  puros, 4 grupos, Ollama con paciencia (reintentos 2/4/6s).
PARADA 9  · 20 sep (noche)  · V1.0.3 PODERES + 🚀 TURBO ............ 22 poderes en 8 espejos,
                                  despachados por acción, turbo visible en cabecera.
PARADA 10 · 21 sep          · V1.1.0 REFLEJO v5 ..................... salud Laplace, confianza con
                                  margen, GRUPO por señales (sin monedas), BÓVEDA de imágenes,
                                  auditoría de entrada, PREDEV. K8s/Docker descartados POR ESCRITO.
PARADA 11 · 21 sep 04:17    · V1.1.1 BUILD v1 ....................... cura por inversión de
                                  dependencia: pool.ts 100% puro. Build verde.
PARADA 12 · 20–22 sep       · FUSIÓN V8 + serie CN v1.6.x .......... D1–D10 verificados, sandbox
                                  1.6.24→1.6.30 (ADUANA, ÁRBOL-LIMPIO, credenciales selladas),
                                  V0.9 semilla de versión derivada.
HOY       · 24 sep          · v1.6.31 ESPEJO-SYNC + QUIRÓFANO v1 .. el modelo ya no puede
                                  mutilar un archivo que funciona sin que el motor lo note.
```

### 1.2 Hacia dónde seguir (ruta de salida, en orden — cada tramo con su puerta de llegada)

```
TRAMO A (hoy, 1 orden)   · compilar la verdad:  cd ide\backend && npm install && npm run build
                           → el Quirófano entra al bundle y al EXE. Sin esto, el resto es teatro.

TRAMO B (1 sesión)       · D4 puertas en local: npm run validar + tsc --noEmit + npm audit + e2e.
                           y D8 métricas reales (eval_count/TTFT en vez de len/4).

TRAMO C (1–2 sesiones)   · QUIRÓFANO v2 (sección 6): libro de reincidencias, protocolo de
                           salida escalonada, PIN-VERDE (línea base "cuando funcionaba"),
                           auto-lección (cierra D9) y catálogo honesto de skills.
                           → Esto es la cura de fondo de TU problema: el bucle de errores repetidos.

TRAMO D (1 semana)       · puerta de estéticas (sección 2.3): que ninguna mejora visual pueda
                           envejecer la app. Git nativo (el hueco más grande del ROADMAP) puede
                           esperar al Quirófano v2: el pin-verde es el 80 % del valor de git
                           para este problema exacto.

TRAMO E (meses)          · model router local↔nube por complejidad, visión/OCR, modo serie de
                           imágenes, Docker/CRDT/DAP/Wasm (declarados, sin prisa — ley de 8 GB).
```

---

## 2. EVOLUCIÓN ESTÉTICA — solo engrandecer, nunca envejecer

### 2.1 El linaje estético ya recorrido

| Hito | Qué fijó |
|---|---|
| FOCO v1→v2 (V1.0/V1.0.1) | `position: fixed` que tapaba el input → UI que **empuja, no cubre**; reset de `userSelect` al perder foco |
| Fondo por defecto + `fondo.ts` | fondo regulable, endpoint `/api/fondo` y `/api/fondo/meta` |
| Aspecto «A» (`aspecto.ts`, 288 L) | fuente/tamaño/color **solo del texto por sección** — control fino sin romper el resto |
| Icono EXE multi-tamaño | 16→256 px generado desde el chip-cerebro |
| Espejo `artes` | armonías HSL reales + contraste WCAG + simulación de daltonismo ×3 — la estética tiene medidor determinista, no gusto |
| Preferencias fijadas (memoria.md) | scrollbars **solo verticales**, transparencia módulo/chat regulable, visor móvil 390×844 escalado sin deformar, español |

### 2.2 Las 4 leyes de la estética-CerebróNico (para que solo crezca)

1. **Ley del ratchet:** un cambio visual solo puede añadir o igualar; todo lo que la app
   mostraba ayer sigue mostrándose hoy (elementos, secciones, atajos). Que algo desaparezca
   "de paso" es un defecto, no una mejora.
2. **Ley del medidor:** la estética se juzga con el espejo `artes` (contraste WCAG ≥ 4.5,
   escala tipográfica modular del espejo `disenios`), no con la opinión del modelo.
3. **Ley del no-cubre:** ningún elemento nuevo puede solapar el chat, el input o el preview
   (lección FOCO: lo que flota debe reservar espacio).
4. **Ley de la reversión barata:** todo cambio estético nace con su copia en el Quirófano;
   "volver a como se veía antes" es un clic, no una sesión de arqueología.

### 2.3 LA PUERTA-ESTÉTICA (la pieza que falta — viaja en Quirófano v2, sección 6.4)

Hoy el Quirófano protege **sintaxis, API pública, imports, peso, tipos y humo** — pero una
mejora puede conservar todo eso y aun así dejar la interfaz peor (texto invisible, panel
tapado, barra horizontal). La puerta-estética cierra ese hueco de forma determinista:

- Antes de la tanda: la puerta `humo` guarda una **ficha de la vista** — lista de elementos
  visibles, sus colores de texto/fondo calculados y su rectángulo (GET al preview + reglas
  del espejo `artes`, sin GPU, sin modelos).
- Después: compara. Bloquea (con reversión) si: la vista queda en blanco, aparece scrollbar
  horizontal, el contraste del texto cae bajo AA, o un elemento fijo nuevo tapa el chat/input.
- Coste: milisegundos + una comparación de JSON. Cero tokens, cero créditos — misma filosofía v1.

---

## 3. CAPACIDADES · HABILIDADES · HERRAMIENTAS (inventario real verificado)

### 3.1 Capacidades del MOTOR (deterministas — no dependen del modelo)

| Familia | Piezas | Estado |
|---|---|---|
| Conocimiento | `knowledgeBase.ts` (95 entradas de fábrica, 8 tablas, 16 leyes curadas), `manuals.ts`, `kbCodigo/kbMotor`, `symbolIndex` (firmas reales por turno), aprendizaje de errores propio del entorno | ✅ |
| Gobierno de escritura | `syntaxGuard`, **`quirofano.ts` v1** (juez pre-disco + copia-al-escribir + 4 puertas + reversión + contrato), `aduanaArbol`, `espejoSync` (retiro de restos con manifiesto de propiedad) | ✅ |
| Contexto | `compactor` (nunca compacta errores), `superPrompt` (niveles micro/compact/standard/pro), `capacidadesPuente`, `inferenceBuffer`, `memoriaResiliente` | ✅ |
| Orquesta | `brain.ts` (cerebro.md ley + memoria.md pizarra, rollback real), `taskPlanner/planRunner/planExecutors`, `consejoVota`, resiliencia bidireccional [1,2,4,6,8] | ✅ |
| Espejos | 10 espejos puros + **22 poderes en 8 espejos** + 🚀 Turbo + salud Laplace + confianza (umbral 0,55/margen 0,08, confiesa dudas) + GRUPO por señales | ✅ |
| Multimoda | Gemini TTS 30 voces + fallback navegador, `imageGen`/`videoGen`, BÓVEDA (imágenes a disco con sha256 + dedupe + índice) | ✅ |
| Entorno | `hardwareGovernor` (8 GB es ley), `ollamaPugil` (reintentos), `sandboxTregua`, `viaRapidaPreview`, `contenedor`, `mobileExport`, `formatConverter`, `pluginForja`, `extensions` (iframe en caliente) | ✅ |
| Semillero | `localRAG` (vectorización escrita, APAGADA por ADR >5.000 líneas), packs `git` (3 tools) | 🌱 |

### 3.2 HABILIDADES (skills) — con la honestidad que exige el ROADMAP

- El catálogo histórico prometía 100 → **solo ~20-25 implementadas**; `skills100.ts` aún
  inyecta aspiracionales como activas. **Tarea Tramo C:** convertirlas a registro con estado
  `aspiracional | implementada | verificada` (punto 6 del ROADMAP, ya priorizado).
- Habilidades reales hoy: edición ancla-a-ancla, validación de tool-calls contra esquema
  (`validateToolCall`), stubs de imports inventados, votación de especialistas, forja de
  complementos (receta→manifest determinista), auditoría de entrada, PREDEV.

### 3.3 HERRAMIENTAS del agente (28, verificadas en `toolRegistry.ts`)

| Pack | Herramientas |
|---|---|
| **core** (18) | `read_file` · `read_file_range` · `list_files` · `search_in_files` · `find_symbol` · `write_file` · `edit_file` · `append_file` · `delete_file` · `make_dir` · `run_command` · `run_tests` · `fetch_url` · `consultar_espejo` · `forjar_complemento` · `set_plan` · `update_task` · **`revisar_cambios`** ⚕️ · **`deshacer_cambios`** ⚕️ *(las 2 últimas son del Quirófano)* |
| **pc** (6) | `pc_info` · `pc_exec` · `pc_read_file` · `pc_write_file` · `pc_list_dir` · `pc_delete` (Modo Agente PC, OFF por defecto) |
| **git** (3) | `git_status` · `git_diff` · `git_commit` |
| **web** (1) | *(pack web declarado; el fetch vive en core)* |

Superficie para la UI: **120 rutas `/api/*`**, incluidas las tres del Quirófano
(`/api/quirofano/estado · /revisar · /deshacer`).

---

## 4. REVISIÓN DEL QUIRÓFANO v1 — qué es, qué vale, dónde termina

### 4.1 Lo que hace (y está bien hecho)

1. **Juez antes del disco** (`evaluarCirugia`): bloquea si desaparece ≥1 exportación, si se
   pierden ≥35 % de líneas útiles, si hay marcadores de truncado o si `package.json` pierde
   deps/scripts. Entre 12–35 % avisa y deja pasar (un guardián que bloquea de más se desactiva).
2. **Copia-al-escribir**: primera vez que una operación toca un archivo se guarda el original
   (`.cn-quirofano/ultima.json`) → deshacer sobrevive a reiniciar el IDE.
3. **Puertas sobre disco real** al cerrar la tanda (3,5 s tras la última escritura):
   `sintaxis` · `superficie` · `imports` (solo rotos NUEVOS) · `peso` — y opt-in `tipos` (tsc,
   solo culpa de archivos tocados) y `humo` (GET :3500). Rojo ⇒ **revierte la tanda y cuenta
   por qué en el chat**.
4. **CONTRATO QUIRÚRGICO** en el prompt de sistema: que el modelo ni lo intente.
5. **El modelo se deshace solo**: `revisar_cambios` / `deshacer_cambios`.
6. Instalador ancla-a-ancla con `--simular`, idempotencia, y `--revert` que deja SHA256 idéntico.

### 4.2 Lo que NO hace (el borde honesto de v1 — aquí nace v2)

| Límite v1 | Consecuencia que TÚ sufres |
|---|---|
| No tiene memoria entre operaciones | el modelo puede repetir **la misma escritura mutilante con argumentos ligeramente distintos** y el juez la vuelve a evaluar de cero |
| El anti-bucle de `server.ts` (línea ~2789) solo detecta **la misma herramienta con los mismos argumentos 3 veces seguidas** | "casi igual pero no igual" escapa: repite el error disfrazado y no sabe salir |
| No hay línea base de "cuando funcionaba" | tras 4 tandas malas no sabes a qué punto volver → el "arréglalo" se convierte en arqueología |
| No juzga lógica, diseño ni estética | una mejora que compila y queda fea/inusable pasa |
| No convierte el bloqueo en aprendizaje persistente | el motor no recuerda la próxima sesión que ESTE modelo rompió ESTE archivo ESTE tipo de vez |
| No distingue "intento de creación" de "pánico post-reversión" | el modelo sigue quemando turnos cuando debería parar y preguntar |

---

## 5. TU PROBLEMA, DIAGNOSTICADO SIN ADORNOS

> «Los modelos al crear se equivocan; al mejorar algo ya funcional terminan rompiendo la app;
> quedan en un bucle repitiendo los mismos errores por no saber salir/solucionar.»

Cuatro causas mecánicas, en orden:

1. **Reescritura de memoria** (el modelo reescribe lo que no leyó) → **ya curado en v1** (juez + contrato).
2. **Nadie medía la pérdida** → **ya curado en v1** (puertas + reversión).
3. **No había marcha atrás** → **parcial en v1**: revierte la tanda, pero no existe el concepto
   de "verde" — el estado confirmadamente funcional anterior a la sesión.
4. **No hay salida del bucle** → **NO curado**. Y es tu dolor principal hoy. El bucle existe porque:
   - la reversión devuelve un informe, pero **nada obliga al modelo a cambiar de estrategia**:
     un modelo de nube sin memoria de fracasos reintenta variantes de lo mismo;
   - el único detector (3× mismos argumentos) es sintáctico, no semántico;
   - cada reintento gasta tu crédito y tu tiempo, y **ningún contador fuerza el alto**.

**Principio de cura (la misma filosofía que ya usas en espejos):** el modelo no va a aprender
a no equivocarse — un conductor de 0,6B–3B no aprende. **El motor debe saber cuándo el
conductor está en bucle y bajarlo del coche él solo.** Determinista, 0 tokens, 0 créditos.

---

## 6. QUIRÓFANO v2 «SALA DE ESPERA» — la expansión (diseño ejecutable)

Módulo nuevo: `src/engine/quirofanoV2.ts` (puro, 0 dependencias, 0 llamadas al modelo —
misma admisión que v1: si devuelve lo mismo que una entidad existente, no entra).
Se enchufa por anclas, como v1, sobre las MISMAS 4 puertas + el bucle de agente.

### 6.1 LIBRO DE REINCIDENCIAS (la memoria que le falta a v1)

- Cada bloqueo, reversión o fallo de puerta se registra en `.cn-quirofano/reincidencias.json`
  con **huella semántica**: `huella(ruta + tipoDeAccion + puertaQueCayo)` — no `huella(argumentos)`.
  Así «reescribe utils.ts recortado» y «reescribe utils.ts recortado con otro comentario»
  son la MISMA reincidencia.
- Contador por huella, persistente entre tandas **y entre sesiones** (mismo trato que `ultima.json`).
- **Nivel 1** (primer tropiezo): el informe actual de v1.
- **Nivel 2** (misma huella ×2): el motor inyecta en el siguiente turno una **FICHA DE ATASCO**
  obligatoria: *«Llevas 2 intentos de la misma estrategia sobre src/utils.ts y fallaste igual.
  PROHIBIDO repetir escritura sobre esa ruta. Cambia de estrategia: read_file completo del
  archivo, luego edit_file con anclas de 2-4 líneas, máximo 1 archivo por turno. Si no sabes
  cómo, responde PARAR y explica el bloqueo.»*
- **Nivel 3** (×3): el motor **secuestra la rueda**: bloquea preventivamente escrituras sobre
  esa ruta (cuarentena de ruta, no de herramienta), revierte a la última tanda verde y el turno
  termina con el informe para el humano. El bucle muere por construcción:
  el modelo ya no *puede* repetir.
- Coste: un Map + un JSON. Cero tokens extra hasta el nivel 2.

### 6.2 ESCALADA DE SALIDA (el "no saber salir" resuelto)

Cuatro palancas, en orden de gasto, decididas por el motor (no por el modelo):

```
intento fallido #1 → corrigue con instrucciones (v1 ya lo hace)
intento fallido #2 → ficha de atasco + estrategia forzada más pequeña + sugerencia de espejo
                     (find_symbol / read_file_range / consultar_espejo("codigos"))
intento fallido #3 → cuarentena de ruta + restaurar PIN-VERDE + informe humano
sin progreso N turnos (contados por escrituras bloqueadas + errores idénticos normalizados)
                 → el turno NO sigue: la app responde con el parte y dos botones:
                   [volver a verde] [lo reviso yo]
```

El error normalizado reusa el **compactor del motor** (que ya preserva errores íntegros y
nunca los compacta): misma clase de error en 2 turnos consecutivos = misma reincidencia.

### 6.3 PIN-VERDE («cuando funcionaba» deja de ser arqueología)

- Al cerrar una tanda **con todas las puertas en verde** (incluida humo si está ON), el motor
  guarda **manifiesto de línea base**: SHA256 + copia de los archivos críticos tocados y de
  arranque (`index.html`, `main.tsx`, `App.tsx`, `package.json`, configs) en
  `.cn-quirofano/verde/` con fecha, motivo de la tanda y firma de la validación.
- Endpoints: `GET /api/quirofano/verde` (¿cuándo estuvo verde por última vez?) ·
  `POST /api/quirofano/verde/volver` (restaura el manifiesto completo).
- Botón en la cabecera junto al LED (6.6): **VERDE 🔒 · volver**.
- Límites 8 GB: solo se copia lo tocado + lo crítico, igual que v1; por encima de
  `MAX_BYTES_REVERSION` por archivo se registra el SHA y se avisa (no miente con una reversión parcial).
- Esto complementa (no reemplaza) al git nativo del ROADMAP: el pin-verde es la red del
  sandbox en producción del usuario final; git sigue siendo para el desarrollo.

### 6.4 PUERTA-ESTÉTICA (el ratchet de la sección 2.3)

- Sexta puerta barata, `estetica` (ON con `QUIROFANO_GATES=...,humo` — necesita el preview vivo):
  compara la **ficha de vista** antes/después (elementos visibles, rectángulos, pares
  color-texto/fondo, presencia de scroll horizontal, chat/input no tapados). Reglas duras
  deterministas, evaluadas con las mismas funciones del espejo `artes` (contraste WCAG) y
  `disenios` (grilla 8pt): **la app no puede envejecer**.
- Rojo ⇒ reversión + informe: *«Tu cambio sube el contraste de #AAA sobre #FFF a 1.9 (mínimo
  4.5) y tapa el input con un panel fixed. Revertido. Haz el mismo cambio reservando espacio.`

### 6.5 AUTO-LECCIÓN (cierra el pendiente D9 del ROADMAP)

- Cada reversión/bloqueo del Quirófano (v1 o v2) dispara por dentro
  `/api/engine/kb/learn` (endpoint que YA existe) con una entrada `error` normalizada +
  una `lesson` del tipo: *«En este proyecto, <modelo> mutiló <archivo> reescribiéndolo sin
  leerlo; la cura fue edit_file por anclas.»*
- El `buildEngineContext()` la inyecta en la siguiente sesión → **el motor recuerda lo que el
  modelo olvida**. Tu tesis (el conocimiento vive en el motor) aplicada al bucle.

### 6.6 LUZ DE QUIRÓFANO + CUARENTENA + PRESUPUESTOS

| Pieza | Qué es |
|---|---|
| **LED de cabecera** | 🟢 = disco == pin-verde · 🟡 = tanda abierta/avisos · 🔴 = hubo reversión (clic ⇒ parte + [volver a verde]). Fuente: `/api/quirofano/estado` (ya existe; se le añaden 3 campos) |
| **Cuarentena** | lo bloqueado no se tira: cae a `.cn-quirofano/cuarentena/<fecha>/` para que TÚ veas el diff de lo que el modelo intentó |
| **Presupuesto de tanda** | máx. escrituras y máx. bytes cambiados por tanda (defaults: 6 archivos / 40 % del proyecto); pasarse responde «trocea la mejora» ANTES de que empiece. Reduce el daño medio por construcción |
| **Léelo-o-toques** | el motor lleva la cuenta de `read_file` por ruta; `edit_file`/`write_file` sobre un archivo NO leído en la operación ⇒ aviso nivel 1, y reincidencia ⇒ bloqueo suave. El contrato del prompt por fin tiene testigo |
| **Anti-bucle semántico global** | el detector de `server.ts` (3× mismos args) se amplía: 3× MISMA HUELLA SEMÁNTICA (6.1) aunque cambien los argumentos ⇒ mismo alto que hoy, pero ya no se le escapa |

### 6.7 Cuadro resumen — síntoma tuyo → pieza que lo mata

| Tu síntoma | Pieza v2 | Determinista | Coste |
|---|---|---|---|
| rompe lo que funcionaba | (v1: juez+puertas) + PIN-VERDE | ✅ | 0 tokens |
| repite el mismo error | LIBRO DE REINCIDENCIAS + anti-bucle semántico | ✅ | 0 tokens |
| no sabe salir del bucle | ESCALADA + cuarentena de ruta + secuestro de rueda | ✅ | 0 tokens |
| no sé a qué punto volver | PIN-VERDE + botón volver + LED | ✅ | disco mínimo |
| la app "envejece" estéticamente | PUERTA-ESTÉTICA (ratchet) | ✅ | ms |
| lo mismo pasa en la próxima sesión | AUTO-LECCIÓN → KB | ✅ | 0 tokens |
| dispara 8 archivos de golpe | PRESUPUESTOS de tanda | ✅ | 0 tokens |

---

## 7. RUTA DE EJECUCIÓN DE v2 (por fases, con puerta de llegada cada una)

```
FASE A · día 1     quirofanoV2.ts: libro de reincidencias + escalada + huella semántica +
                   anti-bucle ampliado en server.ts (1 ancla) + FICHA DE ATASCO en superPrompt
                   (1 ancla). Suite ~60 comprobaciones nuevas.
                   Puerta: npm run validar verde + test de fuego: mismo modelo, misma mutilación
                   dos veces ⇒ a la segunda entra la ficha, a la tercera cuarentena.
FASE B · día 2-3   PIN-VERDE + volver + LED + cuarentena + endpoints. Reutiliza el mecanismo
                   de copia de v1 (no duplicar fs). 
                   Puerta: romper la app a propósito en el sandbox → 1 clic → verde otra vez.
FASE C · día 3-4   AUTO-LECCIÓN (kb/learn por dentro, dedupe, tope de entradas) + presupuestos
                   + léelo-o-toques. Catálogo honesto de skills (estado aspiracional).
                   Puerta: sesión nueva → la lección de la sesión anterior aparece inyectada.
FASE D · día 5+    PUERTA-ESTÉTICA (necesita la ficha de vista del preview; se apoya en humo).
                   Integración en bundle: npm run build + aplicar-quirofano-v2.mjs con
                   --simular/--revert y MANIFIESTO_SHA256, como v1.
```

**Reglas de admisión (heredadas de v1, innegociables):** ancla única verificada antes de
escribir nada · idempotencia · `--revert` con SHA256 idéntico · 0 dependencias nuevas ·
nada bloquea de más (avisar > bloquear, salvo daño seguro) · todo umbral comentado con su porqué.

---

## 8. MIENTRAS TANTO — tu flujo de hoy (sin esperar a v2)

1. **Compila ya**: `cd ide\backend && npm run build && npm start` — sin esto el EXE sigue sin Quirófano.
2. Pide mejoras **de una en una, con archivo nombrado**: «cambia X en `Boton.tsx` con edit_file»,
   nunca «mejora la UI».
3. Si el Quirófano revierte: **no digas «arréglalo»** → di «usa deshacer_cambios, lee el archivo
   completo y edita por partes». (El manual v1 ya lo dice; el motor lo hará solo en v2.)
4. Consola del sandbox tras cada turno: Vite canta el primer error real.
5. Gates baratas siempre; `QUIROFANO_GATES=tipos,humo` solo cuando vayas a tocar arquitectura
   (en 8 GB, tsc por tanda se nota — está dicho en el manual y es cierto).

## 9. LÍMITES HONESTOS DE v2 (para que no te confíes)

- Sigue sin juzgar **lógica de negocio ni intención**: una mejora que compila, queda verde y hace
  algo tonto sigue siendo tuya. El Quirófano es anti-destrozo, no co-autor.
- La puerta-estética cubre la **vista servida por el preview**: lo que el modelo escriba para
  rutas/estados que no navegaste no lo ve nadie hasta que lo navegues.
- Con `force=true` el humano siempre manda: todo queda con copia y registro, pero el motor ya
  no protege de ti (es el diseño: quien manda es el usuario, lo prohibido es el daño silencioso).
- El libro de reincidencias puede exigir limpieza ocasional (botón `reset` como el de salud de
  espejos — mismo patrón, misma API).
- Ninguna de estas piezas toca el `dist/` ya compilado: **la Fase completa exige el build de
  la sección 8.1**, siempre.

---

*Documento generado sobre el árbol verificado `v1.6.31-ARBOL-LIMPIO+QUIROFANO-v1-CORREGIDO`
(57 módulos de motor · 28 herramientas · 120 rutas API · Quirófano v1 con 16 anclas instaladas).*
*Cada cifra de este archivo sale de un grep o una lectura sobre el ZIP; lo interpretado
(sección 0, nota inicial) está marcado como interpretación.*
