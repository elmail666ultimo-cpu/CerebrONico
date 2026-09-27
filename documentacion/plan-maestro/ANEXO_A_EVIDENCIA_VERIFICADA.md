# ANEXO A — EVIDENCIA VERIFICADA

**Base:** `Cerebronico-CN-v1.6.33-CONSEJO-QUE-VOTA` (590 entradas, 10,6 MB, sin `node_modules`)
**Fecha de auditoría:** 24-sep-2026 · **Método:** ejecución + lectura con `ruta:línea`

Este anexo existe para que puedas **re-verificar sin repetir el trabajo**. Todo lo que está aquí se obtuvo de una de estas tres fuentes, y cada afirmación dice de cuál viene:

- **[E]** = **ejecutado** en esta auditoría (comando y resultado).
- **[C]** = **leído en código** (con `ruta:línea`).
- **[D]** = leído en documentación del proyecto (siempre marcado, y siempre contrastado con el código cuando era posible).

------------------------------------------------------------------------

## 1. La puerta, ejecutada de verdad

### 1.1 Procedimiento

```
descomprimir el ZIP en un árbol limpio
cd ide/backend
npm ci                      # dependencias de cero, sin tocar package-lock.json
npx tsc --noEmit            # tipos
npm run validar             # suites + tipos
sha256sum -c MANIFIESTO_SHA256_v1.6.33.txt    # antes y después
```

### 1.2 Resultados

| Comprobación | Resultado | Veredicto |
|---|---|---|
| `npm ci` | `node_modules` con 345 directorios, sin error | OK |
| `npx tsc --noEmit` | **exit 0 · 0 errores** | OK |
| `npm run validar` | **«VEREDICTO: TODO CORRECTO — 3372 comprobaciones, 0 fallos.» · «Tipos: 0 errores · 63 suites ejecutadas · 0 sin correr»** | OK |
| `sha256sum -c MANIFIESTO_SHA256_v1.6.33.txt` | **22/22 `: OK`**, antes y después del gate | OK (árbol intacto) |

**Conclusión [E]:** las cifras que declara `INFORME_SANDBOX_v1.6.33.md:5` («3372 comprobaciones, 0 fallos, 63 suites, 0 errores de tipos») son **exactas y reproducibles**. Es la primera vez en el historial del proyecto que la puerta declarada y la puerta real coinciden sin matices — y merece quedar escrito.

### 1.3 Muestra de suites verdes (salida real, extracto)

```
tipos         el comprobador de TypeScript (tsc --noEmit) … 0 errores
planner       grafo, dependencias, paralelismo, cancelación … 64 correctas
roundtrip     ida y vuelta de formatos, pérdidas silenciosas … 460 correctas
consejoVotacion v1.6.33 · D7: el consejo vota de verdad … 40 correctas
catalogoHonesto v1.6.33 · CATÁLOGO: cada capacidad activa apunta a código real … 32 correctas
metricas      v1.6.32 · D8: la métrica real de inferencia … 28 correctas
guardProfundo v1.6.32 · CALIDAD: el parser real (esbuild) … 23 correctas
quirfanoPuertas v1.6.32 · SEGURIDAD: revisar y deshacer … 10 correctas
… (63 suites en total)
```

------------------------------------------------------------------------

## 2. Hallazgos, uno por uno, con su evidencia

### H1 · CRÍTICO — El puente ejecuta con shell sin lista blanca **[C]**

```python
# agent_bridge_5000.py:590-605
def _run_command(self, command: str, timeout: int = 120) -> dict:
    ...
    use_shell = True                    # :595
    proc = subprocess.run(
        command,
        shell=use_shell,                # :599
```

- Límite de longitud del comando: 4.096 caracteres (`:369,390`). **No hay lista blanca de binarios.**
- Endpoints que lo usan: `/api/exec`, `/api/agent|generate`, `/api/python` (`:368,:389,:565`).

### H2 · CRÍTICO — Rutas fuera de contención **[C]**

```python
# agent_bridge_5000.py:131-162
def resolve_pc_path(p: str) -> str:
    ...
    return os.path.abspath(p)           # :162 — las rutas absolutas pasan tal cual
```

- La única barrera es `_bloqueado_sistema`, una blocklist «corta por prefijo» (`:99-105`) → `~/.ssh`, `~/Documents` y similares quedan alcanzables.
- Contraste justo: en el lado Node **sí** está bien resuelto — `resolveSafePath` confina a `PROJECT_ROOT` con `path.relative` (`server.ts:662-669`). Es decir, el patrón correcto ya existe en el proyecto; solo no se aplicó en el puente.

### H3 · ALTO — El guard del sandbox es fail-open **[C]**

```ts
// server.ts:511-518
function sandboxAuthorized(req: Request): boolean {
  const token = process.env.ACCESS_TOKEN;
  if (!token) return true;              // :513 — sin token definido, autoriza todo
```

- `HOST` por defecto `127.0.0.1` (`:506`) → coherente en localhost.
- Pero el mismo guard es el que protege el caso LAN, y el sandbox fuerza `HOST: "0.0.0.0"` para Vite/`:3500` (`:7496`).

### H4 · ALTO — Endpoints mutadores sin guard **[C]**

**Con guard (13):** `:2278`, `:2286`, `:6839`, `:8083`, `:8109`, `:8362`, `:8434`, `:8510`, `:8594`, `:8676`, `:8852`, `:9109`, `:9122`.

**Sin guard, escribiendo en disco o lanzando procesos:**

| Endpoint | Qué hace | Líneas |
|---|---|---|
| `/api/export/android/prepare` | escribe en `PROJECT_ROOT` | `:5193,5249,5255` |
| `/api/extensions/forjar` | crea extensión en disco | `:5969,5979` |
| `/api/espejos/instalar` | instala espejos | `:4829,4878,4885` |
| `/api/extensions/:id/{enable,disable,delete}` | muta y borra | `:6327,6338,6345` |
| `/api/boveda/preparar` | escribe en disco real vía puente | `:4585,4590,4596` |
| `/api/engine/sync` | persiste KB | `:5359` |
| `/api/sandbox/flatten-root` | mueve ficheros | `:5516` |
| `/api/fondo` POST/DELETE | escribe/borra | `:6004,6039` |
| `/api/contenedor/inspeccionar` | `spawnSync("ffmpeg")` | `:6198,6250` |
| `/api/puente/medir` | acepta socket arbitrario | `:6070,6161` |

### H5 · ALTO — Monolito **[C]**

- `server.ts` **11.461 líneas** · **126 rutas** · **53 imports** de `src/` (`:19-287`).
- Handlers gigantes: `/api/ai/stream` `:9468-11179` (**1.711 L**) · `/api/sandbox/start` `:6838-8082` (**1.244 L**) · `/api/fs/sync` `:8851-9108` (257 L) · `/api/fs/nuclear-wipe` `:8675-8851` (176 L).
- 19 singletons mutables de módulo (lista completa en el plan, §2.1), incluidos `operacionQf` y `sandboxProc`, que son **estado de sesión compartido por todos los handlers**.

### H6 · ALTO — Pérdida silenciosa del workspace **[C]**

```ts
// src/utils/storage.ts:11
const MAX_LOCALSTORAGE_BYTES = 5 * 1024 * 1024;
// :36-38 y :62-63 — al superarlo: no guarda y avisa solo por consola
```

- No hay camino a IndexedDB para el workspace: indexDB se usa solo para la imagen de fondo (`indexedDBStorage.ts:12-15`).

### H7 · MEDIO — El Consejo atribuye, no ejecuta **[C]**

- Reparto: `votacionConsejo.ts:53-82` (23 acciones) · votantes `:91-94` · no votantes declarados `:95-98`.
- `pensarConsejo` (`src/engine/reflejo/consejo.ts:425-435`) atribuye; el motor decide.
- Especialistas sin `ejecutar` (`consejo.ts:103-116`); `ejecutarEntidad` responde «es especialista: se usa vía frase» (`consejo.ts:409`).
- Ejecutores reales: 5 tipos (`planExecutors.ts:82`) — `convertir:150`, `leer_archivo:180`, `generar_imagen:202`, `modelo:134`, `reflejo:264-307`.
- 16 acciones genéricas emiten bloque (`cerebroReflejo.ts:704-734`) sin rama ejecutora por acción.
- La suite prueba atribución, no ejecución: `tests/consejoVotacion.test.ts:119-121`.

### H8 · MEDIO — Endpoint huérfano y lecciones que no llegan a la memoria **[C]**

- Vivo: `selfImprovement.reflectOnTurn` (`selfImprovement.ts:378-444` ← `App.tsx:1464`) → `App.tsx:1268-1275` → `POST /api/engine/kb/learn` (`server.ts:5319`) → `engineKb.learnFromLesson` (`:5322`) + `localStorage` (`selfImprovement.ts:96`).
- Muerto: `POST /api/brain/lesson` (`server.ts:3786`) → `brain.addLesson` (`brain.ts:270`, escribe en `memoria.md`). **Sin llamadores.**
- Conclusión: la lección entra en la KB y en el navegador, **nunca en `memoria.md`**.

### H9 · MEDIO — La puerta es eludible **[C]**

> **CORRECCIÓN POSTERIOR, verificada al implementar (v1.7.0).** Al ejecutar la Fase 0 comprobé
> una parte de este hallazgo **y otra no**:
> - **CIERTO:** la lista de suites estaba hardcodeada, y una suite nueva no registrada **no corría**.
>   Probado en vivo: al añadir `tests/seguridadPuente.test.ts`, el sistema anterior la habría ignorado.
> - **MATIZ IMPORTANTE (mi diagnóstico inicial era exagerado):** el «falso verde» del camino del
>   contador **no es alcanzable** en este proyecto, porque **las 62 suites hacen `process.exitCode = 1`
>   al fallar** y el runner exige `code === 0` (`validar.mjs:301`). Una roja real no se escapa por ahí.
> - **CIERTO, y distinto de lo que escribí:** lo que sí estaba en silencio eran las **marcas `✗`**
>   cuando el contador decía 0 fallos. Eso no es un falso verde: es un rastro perdido. Ahora se **avisa**.
> - Al intentar «arreglarlo» con la regla del caso peor (`mal = max(mal, marcas)`) apareció un **falso
>   rojo** en `planner`, que imprime `✗ #2 revienta [fallida · io]` como **contenido** del test.
>   Corregido: manda veredicto + código de salida; las marcas se avisan. Detalle en
>   [INFORME_SANDBOX_v1.7.0.md](../../INFORME_SANDBOX_v1.7.0.md) §2.2.

- `scripts/validar.mjs:24-92`: array `SUITES` **hardcodeado** → una suite nueva sin registrar no corre nunca.
- Parser `extraer` (`:137-164`): si una suite imprime recuento y además líneas `✗`, gana el recuento (`:143-144`) → **falso verde**. Fallback a marcas `✓/✗` solo si `ok===0 && mal===0` (`:157-161`).
- Suite con formato distinto → «no ejecutada» (`:248`) → **falso rojo** (el bug exacto de la v1.1-HD del Quirófano).
- `todoBien` depende de `erroresTipos===0 && totalMal===0 && suitesEnRojo===0` (`:264`).

### H10 · MEDIO — Canon divergente y cero git **[C/E]**

- No existe `.git` y no hay dependencia de git en `package.json` **[E]**.
- Divergencia canónico vs árbol: `espejos.ts` **668 vs 852** líneas; `fondo.ts` **102 vs 187**; `quirofano.ts` 883=883 y `coreo.ts` 143=143 en sync.

### H11 · MEDIO — Manifiesto incompleto **[C]**

- `MANIFIESTO_SHA256_v1.6.33.txt`: **22 entradas** — 1 informe, 17 fuentes, **3 tests de ~60**, 5 ficheros de `dist/`.
- **No cubre:** `dist/assets/pdf.worker.min-*.mjs`, `dist/fondo-predeterminado.jpg`, `dist/icono-cerebronico.png`, `favicon.ico`, `.proyectos/.cerebro-db/kb.json`.
- `kb.json` es especialmente relevante: es **estado que las pruebas de humo modifican** (la convención del proyecto exige restaurarlo byte a byte antes de empaquetar).

### H12 · MEDIO — Duplicación de RAG **[C]**

- Existen `src/engine/localRAG.ts` y `src/utils/localRAG.ts`.
- El recuperador activo trabaja por token/clave, no por embeddings (`localRAG.ts:131,134-162`), con índice en memoria no persistente (`:21`).

### H13 · BAJO — Secretos en claro (riesgo local) **[C]**

- `.env` en texto plano (`app/utils/env_manager.py:8,15,19`).
- Contrapeso verificado: solo viaja `.env.example`; `electron-builder` no incluye `.env` en `files`/`extraResources` (`package.json`). El riesgo es **de la máquina**, no del paquete.

### H14 · Corrección de un falso hallazgo (queda escrito) **[C]**

La primera pasada de auditoría concluyó que `catalogoHonesto` **no llegaba** al bundle. **Es falso**, y lo verifiqué antes de escribirlo en el plan:

- `src/utils/contextCache.ts:39` importa `catalogoHonesto`.
- `contextCache` es consumido por `src/App.tsx`, `src/components/Header.tsx` y `src/components/RightSidebar.tsx`.
- `contextCache.ts:109,112` exponen `DEFAULT_SKILLS_MD` / `DEFAULT_SKILLS_COMPACT` derivados del catálogo auditado.

Lo que **sí** es cierto: `server.ts` tiene **0 referencias** a `contextCache` **[E: `grep -c` = 0]**, y el sobre `hiddenFiles` que transporta `MEMORIA.md` y `skills.md` se ensambla en el **cliente** (tratado en `server.ts:9577,9672`). Es decir: el catálogo auditado viaja por un único portador, el navegador.

------------------------------------------------------------------------

## 3. Documentación contra código

| Documento (fuente) | Afirma | Código (evidencia) | Veredicto |
|---|---|---|---|
| `ROADMAP.md:20` | «el `dist/` que viaja en el ZIP es el viejo» | `dist/server.mjs:5799` = 1.6.33; contiene Quirófano (`:3041,:15041`) y `votacionConsejo` (`:10219`) | **desactualizado** |
| `ROADMAP.md:35` | D8 «cero referencias a `eval_count`/`ttft`» | `metricasInferencia.ts:77-102`; `server.ts:70,6174,11079-11095` | **desactualizado** |
| `ROADMAP.md:34` | D7 «SIN VERIFICAR» | `votacionConsejo.ts` + `consejoVotacion.test.ts` 40/40 | **desactualizado** |
| `ROADMAP.md:53` | D-P1 «código muerto» | `syntaxGuard` v3 con `transform` de esbuild (`server.ts:69` + 5 puertas) | **desactualizado** |
| `ROADMAP.md:56` | «convertir el catálogo a aspiracional» | `catalogoHonesto.ts` + `contextCache` cableado al cliente | **desactualizado** |
| `mejoras/cerebronico-quirofano-v1/aplicar-quirofano.mjs:8` | «server.ts (10.990 líneas)» | 11.461 líneas | **desactualizado** |
| `ide/SEGURIDAD_CREDENCIALES.md:19` | cita `MANIFIESTO_SHA256_v1.0.txt` | solo existe el de v1.6.33 | **referencia rota** |
| `ARQUITECTURA_CEREBRONICO_V8.md:108` | el puente original es «RCE documentado» y se descarta | el puente actual conserva `shell=True` sin lista blanca (`agent_bridge_5000.py:595-599`) | **el endurecimiento D3 quedó incompleto** |

------------------------------------------------------------------------

## 4. Qué método se usó para cada flanco

| Flanco | Cómo se auditó | Límite declarado |
|---|---|---|
| Núcleo y build | Inventario de rutas por `app.get/post/put/delete`, bloques por rango, singletons de módulo, bundle por búsqueda de cadenas | No se probó cada una de las ~90 anclas de parche una por una |
| Cerebro y memoria | Cruce `votacionConsejo` ↔ `planExecutors` ↔ `cerebroReflejo`; rastreo de llamadores de los endpoints de lección; lectura de `brain`/`localRAG` | No se revisaron los 10 espejos uno por uno |
| Producto y UX | Inventario de componentes por `wc -l`; montaje real por JSX de `App.tsx`; topes reales en `attachmentProcessor` y `storage` | Sin navegador: nada de esto es observación visual |
| Seguridad y entrega | Lectura de los guards y del puente; conteo de endpoints; `sha256sum -c` del manifiesto | **Sin pentest ejecutado** contra el puente en marcha |

------------------------------------------------------------------------

## 5. Reproducir esta auditoría en 5 comandos

```bash
unzip -q Cerebronico-CN-v1.6.33-CONSEJO-QUE-VOTA.zip -d cerebro && cd cerebro
sha256sum -c MANIFIESTO_SHA256_v1.6.33.txt          # 22/22 OK
cd ide/backend && npm ci
npx tsc --noEmit                                     # 0 errores
npm run validar                                      # 3372 · 0 fallos · 63 suites
```

Y para comprobar por tu cuenta los dos hallazgos críticos:

```bash
grep -n "use_shell = True" agent_bridge_5000.py                    # H1
grep -n "return os.path.abspath(p)" agent_bridge_5000.py           # H2
grep -n "if (!token) return true" server.ts                        # H3
```
