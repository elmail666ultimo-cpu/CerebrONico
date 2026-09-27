# INFORME — SANDBOX v1.6.32 «EVOLUCIÓN»

**Build:** v1.6.31-ARBOL-LIMPIO+QUIRÓFANO-v1.1-HD → **v1.6.32-EVOLUCIÓN**
**Ejes pedidos:** fluidez · calidad · velocidad · seguridad.
**Veredicto de la puerta:** `npm run validar` → **3291 comprobaciones, 0 fallos,
61 suites, 0 errores de tipos** (era 3230/58; +61 comprobaciones, cero
regresiones). `npm run build` ejecutado: el `dist/` que viaja en este ZIP ya
contiene TODO esto — el EXE y `npm start` quedan protegidos SIN recompilar.

---

## 1. Qué se evolucionó (y por qué era este el punto)

### 1.1 CALIDAD — SYNTAXGUARD v3: el parser de verdad (ROADMAP D-P1)

El guardián de sintaxis (v2.0) hacía bien una cosa y la hacía a conciencia:
**no bloquear con heurísticas lo que no podía afirmar** (genéricos `<Props>`,
JSX, backticks). Pero el ROADMAP dejaba apuntado el hueco con nombre:

> «3. syntaxGuard con esbuild.transform para validar TS/JSX de verdad (hoy el
> balanceo TS/JS + JSX es código muerto).»

Es decir: el mutilado clásico —`export function f() {` sin llave final,
perfectamente «balanceado» para una heurística tonta— seguía entrando al
sandbox y reventando Rollup. El Quirófano lo juzgaba por proporciones; la
llave en sí, nadie.

**Solución:** `guardFileProfundo()` en `syntaxGuard.ts` — parser REAL
(esbuild 0.25, `transform`) inyectado como dependencia. Las cuatro puertas de
escritura lo usan ahora DESPUÉS de la capa rápida (el parser solo corre si la
v2.0 dio limpia; si la v2.0 ya sentenció, no se gasta):

| Puerta | Qué protegía | Qué protege ahora |
|---|---|---|
| `write_file` (agente) | heurísticas v2.0 | + truncado/llave/JSX reales con línea exacta |
| `edit_file` (agente) | heurísticas v2.0 | + lo mismo sobre el resultado del reemplazo |
| `/api/fs/write` (autosync del chat) | heurísticas v2.0 | + lo mismo |
| `/api/fs/sync` (lote del espejo) | heurísticas v2.0 | + lo mismo, archivo por archivo |
| `/api/engine/guard` (validar sin escribir) | heurísticas v2.0 | + lo mismo (espejo fiel de las puertas) |

**Regla de oro respetada** (un guardián que encarcela trabajo correcto es peor
que no tenerlo): el parser se EQUIVOCA CON DATOS — es el mismo juez que usa
Vite para compilar el sandbox, así que si él rechaza, el sandbox rechaza: cero
falsos positivos por construcción. Y si el parser FALLA ÉL (falta la
dependencia, crash interno, timeout de 4 s), el archivo **pasa con aviso**:
un guardián averiado no tiene derecho a encerrar. Un .ts con errores que
además contiene `</cierre>` recibe el consejo de renombrar a `.tsx` (el
consejo no bloquea; solo habla).

Suite nueva: `tests/syntaxGuardProfundo.test.ts` — 23 comprobaciones, entre
ellas la REGRESIÓN de los tres falsos positivos históricos de la v2.0
(genéricos con `<` y comparaciones, backticks con llaves sueltas dentro de
cadenas, componente JSX con `<textarea>` sin cierre) y la prueba de que el
parser NO se gasta cuando la capa rápida ya sentenció.

### 1.2 VELOCIDAD — D8: LA MÉTRICA DEJÓ DE SER UNA ADIVINANZA

El ROADMAP lo marcaba en rojo: «D8 — NO IMPLEMENTADO — cero referencias a
`eval_count`/`ttft` en server.ts; el cliente sigue con len/4». Verificado
contra el código: era verdad, y era peor de lo dicho — el cliente «contaba
tokens» haciendo `tokenCount++` POR LÍNEA DE STREAM (una línea NDJSON puede
traer tres tokens o ninguno) y el panel de auto-mejora dividía esa cuenta por
los ms TOTALES (incluyendo carga del modelo y red) y lo llamaba «tk/s».

Ollama manda la verdad en la última línea del stream (`eval_count`,
`eval_duration`, `prompt_eval_count`, `prompt_eval_duration`, `load_duration`,
`total_duration`, en nanosegundos) y el cliente la VEÍA pasar
(`if (data.done) break;`) y la TIRABA.

**Ahora:**
* Motor puro nuevo `src/engine/metricasInferencia.ts`: normaliza ns→ms con la
  misma ley del búfer de inferencia, descarta basura (negativos, 1e12,
  no-números) y devuelve `null` cuando no hay medida — un `null` honesto vale
  más que un 0 inventado.
* `server.ts`: los dos puntos `done` del stream de Ollama extraen la métrica y
  `sendDone` la manda en el propio evento SSE (`{done, model, metricas}`).
* `src/utils/engine.ts` (cliente): **ruta directa a Ollama** captura el `done`
  y usa la cuenta del motor; **ruta proxy** lee `data.metricas` del servidor.
  El `tps` del turno es MEDIDA cuando existe; la cuenta de líneas queda como
  estimación etiquetada (`exacta: false`).
* `App.tsx` + `selfImprovement.ts`: el registro del turno guarda
  `tokensOut/tokensIn/tokPorSegundo/medidaExacta`; el resumen del panel
  calcula la velocidad con los tk/s medidos y muestra cuántos turnos traen
  medida real (`turnosMedidos`).

Suite nueva: `tests/metricasInferencia.test.ts` — 28 comprobaciones, con el
payload real de Ollama (142 tk / 4.531 s → 31.3 tk/s), las formas basura, y la
auditoría estática del cableado de punta a punta.

### 1.3 SEGURIDAD — QUIRÓFANO: dos puertas mutantes abiertas

D2 (v8.0) puso `sandboxAuthorized` en 11 puertas (exec/fs/sandbox). El
QUIRÓFANO añadió después dos endpoints que TOCAN DISCO y se quedaron sin
puerta:

* `POST /api/quirofano/revisar` — cierra la tanda y, si una puerta falla,
  **revierte archivos**.
* `POST /api/quirofano/deshacer` — **reescribe los archivos** con la copia
  anterior.

Cualquiera que alcance el puerto puede pedirle al motor que revierta el
trabajo en curso. Se cerraron con la MISMA puerta que las otras 11 (si no hay
`ACCESS_TOKEN` en el entorno, la puerta es un no-op: la UI no cambia de
comportamiento; si lo hay, piden la cabecera igual que `/api/exec`). El
endpoint de lectura (`/estado`) se quedó abierto a propósito: no muta nada.

Suite nueva: `tests/quirfanoPuertas.test.ts` — 10 comprobaciones estáticas:
ningún `app.post("/api/quirofano/…")` sin `sandboxAuthorized(req)`, el
contrato de la puerta intacto, y el conteo de puertas 11 → 13.

### 1.4 FLUIDEZ — lo que se midió antes de tocar (honestidad)

El recorrido de auditoría buscó bloqueos del bucle de eventos en el servidor:
los cinco escaneos síncronos bajo petición (espejo de proyecto, vía rápida,
árbol de preview) ya excluyen `node_modules`/`.git`/`dist` por segmento y van
topados (profundidad ≤10, ≤600–800 entradas). `raizEfectiva()` escanea en
cada petición de preview **a propósito** (comentario de la casa: el modelo
escribe archivos MIENTRAS corre y una raíz cacheada dejaría de ver lo que
acaba de llegar) y su coste es un `readdir` de primer nivel + un `stat` por
candidato. No había tacho que limpiar sin empeorar esa garantía — así que la
fluidez de esta versión viene por D8: la medida real (tk/s del motor, carga
del modelo aparte) es la que permite al piloto y al usuario decidir con
números que no mienten.

---

## 2. Pruebas: verificación reproducible (D4, pendiente desde el ROADMAP)

Ejecutado en este entorno (Linux, Node 22.23.2):

| Comando | Resultado |
|---|---|
| `npm install` | correcto |
| `npm run validar` (línea base ANTES de tocar) | **3230/3230, 58 suites, 0 tipos** |
| `npm run validar` (después) | **3291/3291, 61 suites, 0 tipos** |
| `npm run build` | correcto (Vite + esbuild); `node --check dist/server.mjs` OK |

## 3. Ficheros tocados

| Fichero | Qué |
|---|---|
| `src/engine/metricasInferencia.ts` | **nuevo** — motor puro D8 |
| `src/engine/syntaxGuard.ts` | v3.0: `guardFileProfundo`, tipo `parser`, heurística del consejo .tsx |
| `server.ts` | import+adaptador `PARSER_ESBUILD`, 5 puertas profundas, `sendDone(metricas)`, 2 extracciones del done, gates del Quirófano |
| `src/utils/engine.ts` | métrica en las dos rutas del stream + `consumirUltimaMedicion()` |
| `src/App.tsx` | registro del turno con medida real |
| `src/utils/selfImprovement.ts` | `TurnMetric` + `turnosMedidos`; tk/s con medida |
| `tests/metricasInferencia.test.ts` | **nuevo** — 28 |
| `tests/syntaxGuardProfundo.test.ts` | **nuevo** — 23 |
| `tests/quirfanoPuertas.test.ts` | **nuevo** — 10 |
| `scripts/validar.mjs` | 3 suites registradas |
| `src/constants.ts` + `package.json` + `index.html` | versión → **1.6.32** (una semilla, dos literales derivados) |
| `dist/` | **recompilado** — el bundle lleva todo dentro |

## 4. Límites declarados (para que no te confíes)

* La métrica real existe **donde el motor la manda**: Ollama (directo y
  proxy). Los proveedores cloud que no publican `eval_count` siguen
  registrándose como ESTIMACIÓN, con la etiqueta `medidaExacta: false` a la
  vista.
* El parser real juzga **sintaxis**, no lógica: una mejora que compila y queda
  fea sigue siendo tuya (misma línea que el Quirófano).
* Los `*_duration` en ns se normalizan con la ley de la casa (umbral 1e7); un
  motor que publicara ms ya hechos con valores >1e7 los dividiría mal — es el
  mismo compromiso asumido por `inferenceBuffer` desde v1.6.6, y las dos
  copias están declaradas en el comentario del módulo.
* Queda para la próxima (sin tocar hoy, verificado el estado): D7 (votación de
  los 12 especialistas), D9 (auto-lección al recuperar un error), catálogo
  honesto de `skills100.ts`, y el hueco grande: Git nativo.
