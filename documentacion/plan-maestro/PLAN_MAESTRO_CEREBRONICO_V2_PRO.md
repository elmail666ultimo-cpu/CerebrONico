# PLAN MAESTRO — CEREBRÓNICO v2 (PRO)

**Documento de replanteo integral · base auditada: `Cerebronico-CN-v1.6.33-CONSEJO-QUE-VOTA`**
**Propietario:** Mario Nicolas Quintero · **Fecha:** 24-sep-2026

> **ESTADO DE EJECUCIÓN (actualizado al entregar v1.13.0):**
> **Fase 2: LOS DOS BLOQUES DE ESTADO YA ESTÁN FUERA.** `server/estado/` tiene
> telemetría, CPU del proceso y **sandbox** (el último bloque grande: 35 sitios tocando
> una variable global). `server.ts` ya no es dueño de datos: solo tiene rutas y
> funciones. **6 de 127 rutas fuera.** Añadido fuera de fase por petición del usuario:
> la **ventana de voz** (el 429 de Gemini ya no pinta JSON en la interfaz) y el
> **sandbox al arrancar** (deja de salir en rojo cuando aún no ha arrancado).
> Puerta: **3724 · 0 fallos · 69 suites**, manifiesto **498/498**, humo `V1.13.0`.
> **Fase 2 EN CURSO — el paso que decide ya está hecho: EL ESTADO HA SALIDO DEL MONOLITO.**
> `server/estado/telemetria.ts` y `server/estado/proceso.ts` (API de funciones, **tiempo
> inyectado**, dependencias declaradas en vez de alcanzadas) + `server/routers/telemetria.ts`
> (3 rutas más). **6 de 127 rutas fuera · `server.ts`: 11.661 → 11.413 líneas (−248).**
> Comprobado en marcha: la caché sirve la segunda consulta y `refresh` la invalida.
> Puerta: **3670 · 0 fallos · 68 suites**, manifiesto **494/494**, humo `V1.12.0`.
> Siguiente: **estado del sandbox** (su API ya está escrita por lo que telemetría le pide).
> **Fase 2 EN CURSO — la extracción ha empezado.** Primer módulo creado:
> `server/routers/diagnostico.ts` con 3 rutas (`/api/health/deep`, `/api/ollama/perf`,
> `/api/ollama/models`). **`server.ts`: 11.661 → 11.518 líneas.** El contrato informa
> MOVIDAS (no pérdidas) y publica el progreso: **3 extraídas · 124 en el monolito**.
> Comprobado contra el servidor en marcha. Siguiente paso natural: dominios de lectura
> pequeños y, después, la **extracción del estado** (`server/estado/`), que es la que
> desbloquea mover `telemetry` y `sandbox`. Puerta: **3639 · 0 fallos · 67 suites**,
> manifiesto **489/489**, humo real sirviendo `CerebróNico V1.11.0`.
> **Fase 2 EN CURSO — primer paso hecho**: el **contrato de las 127 rutas**
> (`contrato-rutas.json`, generado desde el código), el **orden de trabajo** por 39
> dominios (`SUPERFICIE_RUTAS.md`) y `scripts/superficie.mjs` con modo seco. Tres
> candados verificados: ruta perdida → rojo · guard perdido → rojo · **`server.ts`
> (11.661 líneas) no puede crecer**. Suite `tests/superficieRutas.test.ts` (37).
> **La extracción de módulos no ha empezado**, y es deliberado: es la fase de 2-3
> semanas y medio servidor migrado es peor que nada. Ver §4 FASE 2.
> **v1.9.0 «ESTABILIDAD»** cierra las dos deudas de severidad ALTA/MEDIA que este plan
> listaba como abiertas: la **pérdida silenciosa del workspace** al pasar de 5 MB
> (ahora se rescata al almacén grande y todo fallo de guardado se dice) y el
> **endpoint huérfano `/api/brain/lesson`** (el aprendizaje ya llega al cerebro).
> Puerta sobre el estado entregado: **3590 comprobaciones · 0 fallos · 66 suites**,
> manifiesto **482/482**, humo real sirviendo `CerebróNico V1.9.0`.
> Lo que sigue abierto está abajo y sin adornos: **F2** (partir el monolito), **F3**,
> **F4** (21 de 23 acciones sin ejecutor), **F5**, **F6** y **F7**.

> **Fase 0 COMPLETA**, **Fase 1 COMPLETA** y **Fase 4 EN CURSO**, verificadas con la puerta real
> (`3548 comprobaciones · 0 fallos · 65 suites`, manifiesto `480/480`, humo en vivo con `:3000` sirviendo
> `CerebróNico V1.8.0` y el puente respondiendo `shell: false`).
> **Añadido transversalmente (v1.8.0 «VOZ»)**: la **certeza en el idioma** (`certeza.ts` + `vocabulario.ts`:
> ninguna palabra que afirme un resultado sin haberlo ejecutado), **una frase por artefacto**
> (`explicacionArtefacto.ts`) y la **facultad de hablar sin que pregunten** (`autoRespuesta.ts`, 4 reglas).
> Es material de la **Fase 3** (pipeline del chat) adelantado por petición: cuando esa fase llegue, el
> revisor de vocabulario ya está hecho y solo hay que ponerlo en el camino del texto del modelo.
> De la Fase 4 ya está el **registro de ejecutores** (`src/engine/ejecutoresConsejo.ts`): de las 23 acciones,
> **2 tienen ejecutor real y 21 están declaradas con motivo** — el hueco, medido en vez de supuesto.
> Añadido fuera de fase y a petición: el **fondo de pantalla admite 100 MB** (blob en IndexedDB, no base64).
> Fases 2, 3, 5, 6 y 7 pendientes.
> Informe de lo ejecutado: [INFORME_SANDBOX_v1.7.1.md](../INFORME_SANDBOX_v1.7.1.md).
> **Dos afirmaciones de este plan quedaron corregidas al ejecutar** (§1.4 H9 y §2.5): el «falso verde»
> del parser no era alcanzable —las 62 suites usan `process.exitCode`— y el intento de arreglarlo con
> «gana el caso peor» produjo un falso rojo real en `planner`. Detalle y corrección en
> [Anexo A](ANEXO_A_EVIDENCIA_VERIFICADA.md) §H9.

------------------------------------------------------------------------

## 0. Cómo leer este documento

Este plan se escribió bajo la regla de la casa, sin excepciones:

> **Creer solo lo verificado contra código.** Nada se declara «hecho» sin fichero, endpoint o prueba.

Por eso:

1. **Cada hallazgo lleva `ruta:línea`.** Si no tiene evidencia, no está aquí.
2. **Las cifras del estado actual se obtuvieron ejecutando**, no leyendo informes (§1.2).
3. **Las estimaciones de esfuerzo son estimaciones**, y van marcadas como tales. No son medidas.
4. **Un anexo aparte recoge la evidencia cruda** ([ANEXO A](ANEXO_A_EVIDENCIA_VERIFICADA.md)) para que puedas re-verificar sin repetir el trabajo.

Tres anexos acompañan a este documento:

| Anexo | Contenido | Para qué sirve |
|---|---|---|
| [A — Evidencia verificada](ANEXO_A_EVIDENCIA_VERIFICADA.md) | Gate ejecutado, hallazgos con `ruta:línea`, contradicciones doc↔código | Re-verificar sin repetir la auditoría |
| [B — Criterios de aceptación](ANEXO_B_CRITERIOS_DE_ACEPTACION.md) | Comandos copiables y umbrales por fase | Que una fase solo se declare cerrada si pasa la puerta |
| [C — Mapa objetivo y contratos](ANEXO_C_MAPA_OBJETIVO_Y_CONTRATOS.md) | Estructura destino, contratos de módulo, orden de migración | Ejecutar la Fase 2 sin romper nada |

Además: [tablero_pro_v2.csv](tablero_pro_v2.csv) — el mismo programa de trabajo en formato tabla (importable).

------------------------------------------------------------------------

## 1. Veredicto ejecutivo

### 1.1 La frase

**La v1.6.33 no tiene un problema de motor: tiene un problema de estructura y de promesas sin cerrar.**

El motor está sano y es verificable. Lo que impide que esto sea un producto «PRO» no es la falta de ideas ni de capacidades nuevas: es que **todo el sistema vive en dos ficheros gigantes**, que **la capa que puede ejecutar comandos en tu PC está abierta de par en par**, y que **varias cosas que el producto declara no las hace todavía** (el consejo atribuye pero no ejecuta; las lecciones no llegan a la memoria; el catálogo honesto no viaja por el servidor).

Ninguna de esas tres cosas se arregla añadiendo una función nueva. Se arregla **cerrando, ordenando y partiendo**. Ese es este plan.

### 1.2 El estado real, medido hoy (no citado de informes)

Ejecutado sobre el árbol que subiste, con dependencias instaladas de cero:

| Comprobación | Comando | Resultado real |
|---|---|---|
| Tipos | `npx tsc --noEmit` | **0 errores** (exit 0) |
| Suites | `npm run validar` | **3372 comprobaciones · 0 fallos · 63 suites · 0 sin correr** |
| Integridad del paquete | `sha256sum -c MANIFIESTO_SHA256_v1.6.33.txt` | **22/22 OK**, antes y después del gate (el árbol quedó byte-intacto) |
| Bundle de producción | `dist/server.mjs` | **Actual**: declara `VERSION_SEMVER = "1.6.33"` (`dist/server.mjs:5799`) y contiene Quirófano y votación |

Las tres cifras coinciden con lo que declara `INFORME_SANDBOX_v1.6.33.md`. **Este es el primer ZIP del proyecto que no miente en su propia puerta** — y eso hay que decirlo, porque cambia la naturaleza del problema: la deuda que sigue es de diseño, no de honestidad de la entrega.

### 1.3 Las tres cosas que sí están bien (y hay que proteger)

1. **La puerta existe y es real.** `validar.mjs` + `tsc` + manifiesto SHA256, con 63 suites que corren de verdad (no «declaradas»).
2. **La fuente única de versión funciona.** `src/constants.ts:194` es el único literal (`VERSION_SEMVER`), y la etiqueta visible se deriva (`:218`).
3. **El principio de honestidad está incorporado al código**, no solo al discurso: `catalogoHonesto.ts` audita cada capacidad activa contra ficheros reales con `fs.existsSync` (`tests/catalogoHonesto.test.ts:44-47`), y `votacionConsejo.ts:95-98` declara por escrito quién **no** vota en lugar de disfrazarlo.

Esa cultura es el activo más valioso del proyecto. El plan está diseñado para no romperla.

### 1.4 Los diez hallazgos que ordenan el plan

| # | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| 1 | **CRÍTICO** | El puente :5000 ejecuta con `shell=True` **sin lista blanca de binarios** | `agent_bridge_5000.py:595-599` |
| 2 | **CRÍTICO** | `/api/fs/*` del puente **no contiene la ruta**: acepta rutas absolutas fuera del sandbox | `agent_bridge_5000.py:131-162` |
| 3 | **ALTO** | El guard del sandbox es **fail-open**: sin `ACCESS_TOKEN`, autoriza todo | `server.ts:511-518` |
| 4 | **ALTO** | **Al menos 9 endpoints que escriben en disco o lanzan procesos sin guard** | `server.ts:5193, 5969, 4829, 6327, 4585, 6004, 6198, 6070, 5516` |
| 5 | **ALTO** | **Monolito**: 11.461 líneas, 126 rutas y 19 singletons en un solo fichero | `server.ts` · un handler de 1.711 líneas (`:9468-11179`) |
| 6 | **ALTO** | **Pérdida silenciosa del workspace** al superar 5 MB de `localStorage` | `src/utils/storage.ts:11,36-38,62-63` |
| 7 | **MEDIO** | El **Consejo vota pero no ejecuta**: 16 de 23 acciones sin ejecutor real | `votacionConsejo.ts:53-82` vs `planExecutors.ts:82` |
| 8 | **MEDIO** | **Endpoint huérfano**: `/api/brain/lesson` no tiene llamadores → la lección automática nunca llega a `memoria.md` | `server.ts:3786`, `brain.ts:270` |
| 9 | **MEDIO** | La puerta de suites es **eludible**: lista fija de suites y parser con camino de falso verde | `scripts/validar.mjs:24-92,137-164` |
| 10 | **MEDIO** | **Cero git** y **copias canónicas divergentes** entre `mejoras/` y el árbol | sin `.git`; `espejos.ts` 668 vs 852 líneas |

Los diez están desarrollados con su arreglo en §2 y §4.

### 1.5 El rumbo

```
Fase 0  Verdad congelada        → que la puerta no pueda mentir ni por accidente
Fase 1  Seguridad cerrada       → el puente deja de ser una puerta abierta a la PC
Fase 2  Partir el monolito      → server.ts deja de ser un fichero y pasa a ser un plano
Fase 3  Motor del chat          → /api/ai/stream: 1.711 líneas → pipeline por etapas
Fase 4  Cerebro ejecutor        → el consejo pasa de atribuir a hacer; se cierran D9 y el catálogo
Fase 5  Producto y datos        → App.tsx por contextos; el workspace deja de perderse
Fase 6  Git nativo + enrutador  → el hueco más grande declarado del proyecto
Fase 7  Visión y mapa           → OCR/visión, y decidir qué aspiracional se construye o se retira
```

El orden no es negociable: **0 y 1 antes que todo lo demás**, porque sin puerta fiable y sin PC segura, cada fase siguiente es trabajo sobre terreno movedizo.

------------------------------------------------------------------------

## 2. Diagnóstico por flanco

### 2.1 Núcleo y deuda estructural

`ide/backend/server.ts` = **11.461 líneas** · **126 rutas registradas** · **53 imports** de módulos de `src/` (`server.ts:19-287`).

Bloques funcionales (rangos reales):

| Rango | Bloque | Rutas |
|---|---|---|
| 2251–2284 | Quirófano | 3 |
| 2998–3350 | TTS / modelos cloud | 8 |
| 3564–3751 | Verifier / Governor / Features / RAG | 17 |
| 3757–4213 | Brain / planes / runner | 19 |
| 4234–5047 | Engine: imagen, reflejo, consejo, espejos, bóveda | 27 |
| 5047–5308 | Conductor / Export | 3 |
| 5308–5424 | KB / sync / tools / perf Ollama | 10 |
| 5516–5969 | Sandbox / salud | 3 |
| 5969–6482 | Extensiones / Fondo / Puente / Coreo | 17 |
| 6587–6838 | Telemetría / modelos Ollama / subagentes | 3 |
| 6838–8433 | Sandbox start/stop/status/logs | 4 |
| 8433–9468 | Exec / FS | 7 |
| **9468–11179** | **`POST /api/ai/stream`** | **1 (1.711 líneas)** |
| 11179–11360 | Bridge / estáticos | 4 |

**Los dos handlers que hay que partir sí o sí:**

- `POST /api/ai/stream` → `server.ts:9468-11179` — **1.711 líneas en un solo manejador**.
- `POST /api/sandbox/start` → `server.ts:6838-8082` — **1.244 líneas**.

**Estado mutable a nivel de módulo (19 singletons compartidos):** `TABLA_SALUD:529` · `BOVEDA:566` · `engineKb:1675` · `kbDirty:1676` · `symbolMap:1843` · `operacionQf/temporizadorQf/cerrandoQf/ultimoCierreQf:2057-2060` · `avisosQf:2061` · `genAIClient/genAIClientKey:2910-2911` · `disabledExtensions:3382` · `openExtensionPanels:3388` · `pendingInvocations:3518` · `profileCache:1589` · `telemetryCache:6583` · `sandboxProc/sandboxLogStream:6761-6762`.

**Por qué esto es el problema raíz y no una queja estética.** El estado es global y el servidor es uno solo: una operación del Quirófano en curso (`operacionQf`) y un plan en segundo plano comparten el mismo proceso y las mismas variables. Y como todo vive en un fichero, **cualquier mejora que toque el chat y cualquier mejora que toque el sandbox chocan en el mismo archivo**: es exactamente la razón por la que el proyecto ha acabado con 10 capas de parche (`mejoras/`) en vez de un flujo normal de cambios. La deuda estructural que ves en `mejoras/` es un síntoma, no la enfermedad.

### 2.2 Seguridad — aquí está lo único que no admite espera

**El puente :5000 es la puerta por la que un modelo puede llegar a tu PC.** Su diseño actual:

| Punto | Estado verificado | Fichero:línea |
|---|---|---|
| Ejecución de comandos | `use_shell = True` → `subprocess.run(..., shell=True)` | `agent_bridge_5000.py:595-599` |
| Lista blanca de binarios | **No existe** (solo límite de 4.096 caracteres) | `agent_bridge_5000.py:369,390` |
| Resolución de rutas | Devuelve la ruta absoluta **tal cual** si no empieza por atajo | `agent_bridge_5000.py:162` |
| Blocklist de sistema | Corta y por prefijo | `agent_bridge_5000.py:99-105` |
| CORS | `_origen_ok` **devuelve `True` si falta `Origin`** | `agent_bridge_5000.py:63-65` |
| Token | `_token_ok`, exigido en `/api/*` | `agent_bridge_5000.py:68-73,358-365` |

Traducido: con el token en la mano, `/api/fs/read|write|write_b64|delete` alcanzan cualquier ruta del usuario que no esté en una blocklist corta (por ejemplo `~/.ssh`, `~/Documents`), y `/api/exec` interpreta la cadena en un shell del sistema.

**Y en el lado Node:**

- `sandboxAuthorized` (`server.ts:511-518`): `if (!token) return true;` → **fail-open**. Si `ACCESS_TOKEN` no está definido, la puerta no existe. (Nota justa: en localhost el diseño es «sin token», y la decisión es deliberada; el problema es que el mismo guard protege el caso LAN, donde el diseño sí exige token.)
- **Sí tienen guard (13):** `:2278, :2286, :6839, :8083, :8109, :8362, :8434, :8510, :8594, :8676, :8852, :9109, :9122`.
- **Escriben o lanzan procesos SIN guard:** `/api/export/android/prepare` (`:5193,5249,5255`) · `/api/extensions/forjar` (`:5969,5979`) · `/api/espejos/instalar` (`:4829,4878,4885`) · `/api/extensions/:id/{enable,disable,delete}` (`:6327,6338,6345`) · `/api/boveda/preparar` (`:4585,4590,4596`) · `/api/engine/sync` (`:5359`) · `/api/sandbox/flatten-root` (`:5516`) · `/api/fondo` POST/DELETE (`:6004,6039`) · `/api/contenedor/inspeccionar` (`:6198,6250`, lanza `spawnSync("ffmpeg")`) · `/api/puente/medir` (`:6070,6161`, acepta un socket arbitrario).

**Secreto en reposo:** las claves viven en `.env` en texto plano (`app/utils/env_manager.py:8,15,19`). Lo bueno: solo viaja `.env.example` en el paquete y `electron-builder` no empaqueta `.env` (verificado contra `package.json` `files`/`extraResources`). Es decir, **el riesgo es local, no de distribución**.

Nada de esto es teórico: es la misma clase de hallazgo que el propio proyecto ya escribió como descarte en `ARQUITECTURA_CEREBRONICO_V8.md:108` («Puentes `uploads/agent_bridge_5000.py/.js` — RCE documentado»). **El endurecimiento D3 estaba planificado y quedó a medias.** Este plan lo cierra con prueba.

> Nota de encuadre, porque importa para decidir bien: el puente es *la* característica que hace que CerebróNico no sea un chat — sin él no hay agente de PC. No se trata de apagarlo, se trata de que **la lista blanca sea el camino normal** y que lo demás sea explícito y con confirmación.

### 2.3 Cerebro: la diferencia entre atribuir y hacer

**El Consejo.** El reparto está bien hecho y probado: `votacionConsejo.ts:53-82` (`REPARTO_VOTOS`, 23 acciones), `:91-94` (10 asientos con voz), `:95-98` (no votantes declarados). Pero conviene entender qué es lo que se votó:

- `pensarConsejo` (`src/engine/reflejo/consejo.ts:425-435`) **no vota: atribuye.** El motor decide y el consejo pone el nombre del especialista que corresponde.
- Los 12 especialistas **no tienen `ejecutar`** (`consejo.ts:103-116` solo declara `id/nombre/descripcion`); `ejecutarEntidad` responde literalmente que un especialista «se usa vía frase» (`consejo.ts:409`).
- Los ejecutores reales que existen son 5 tipos: `modelo, leer_archivo, convertir, generar_imagen, reflejo` (`planExecutors.ts:82`).
- Las **16 acciones genéricas** (`analizar, explicar, resumir, comparar, listar, ordenar, filtrar, contar, buscar, testear, documentar, refactorizar, optimizar, traducir, instalar, desplegar`) emiten su bloque `cerebronico:<accion>` (`cerebroReflejo.ts:704-734`) pero **no tienen rama ejecutora propia** en `planExecutors.ts`. De ellas, `traducir`, `instalar` y `desplegar` ya se declaran sin especialista (`votacionConsejo.ts:79-81`).

**Consecuencia honesta:** el paso de v1.6.33 fue un paso de verdad (antes 16 acciones caían todas en «ayuda»; ahora tienen dueño y motivo), pero el siguiente paso natural —**que el consejo haga, no solo diga**— es el que convierte esto en un producto. Y la suite actual no lo exige: `tests/consejoVotacion.test.ts:119-121` comprueba atribución, no ejecución.

**Las lecciones que no llegan a casa.** Hay dos caminos y solo uno está vivo:

- Vivo: `selfImprovement.reflectOnTurn` (`selfImprovement.ts:378-444`, llamado en `App.tsx:1464`) → `useEffect` (`App.tsx:1268-1275`) → `POST /api/engine/kb/learn` → `engineKb.learnFromLesson` (`server.ts:5319,5322`) **y** `localStorage` (`selfImprovement.ts:96`).
- Muerto: `POST /api/brain/lesson` (`server.ts:3786`) → `brain.addLesson` (`brain.ts:270`), que es quien escribiría en `memoria.md`. **No tiene un solo llamador.**

O sea: la lección entra en la KB del motor y en el navegador, pero **nunca en `memoria.md`**. Es el hallazgo clásico del proyecto (una capacidad construida y no cableada) y es barato de cerrar.

**La memoria y el RAG.**

- `memoria.md` está bien hecho: escritura atómica tmp+rename (`brain.ts:175-180`), lock (`:159`), snapshot cada 20 s con 60 copias (`:182-207`), historial (`:461-475`), rollback (`:477-495` + endpoint `server.ts:3815`).
- `localRAG` **no usa embeddings**: recupera por coincidencia de token/clave (`localRAG.ts:131,134-162`), con índice en memoria no persistente (`:21`). Está declarado como tal — coherente con el ADR 12 —, pero conviene que el producto no lo llame «vectorial».
- Existen **dos módulos RAG** (`src/engine/localRAG.ts` y `src/utils/localRAG.ts`): duplicación que hay que resolver antes de que alguien arregle el equivocado.

**El catálogo honesto: bien hecho, pero con una asimetría de transporte.** Corregí aquí un diagnóstico inicial erróneo de la auditoría (vale la pena contarlo, porque es la prueba de que la verificación por lectura falla): la primera pasada concluyó «`catalogoHonesto` no llega al bundle». **Es falso.** Lo verifiqué: `contextCache.ts:39` importa `catalogoHonesto`, y `contextCache` lo consumen `src/App.tsx`, `src/components/Header.tsx` y `src/components/RightSidebar.tsx`. El catálogo auditado **sí** llega al prompt.

Lo que sí es cierto y sí importa: **`server.ts` tiene 0 referencias a `contextCache`**, y `hiddenFiles` (el sobre que transporta `MEMORIA.md` y `skills.md`, tratado en `server.ts:9577,9672`) lo construye el **cliente**. Conclusión: la honestidad del catálogo depende hoy de un único portador — el navegador. Cualquier camino que componga prompt **sin** pasar por el cliente (subagentes, conductor, ejecutores de plan) no lleva el catálogo auditado. No es un bug de hoy; es una fragilidad de mañana.

### 2.4 Producto y UX

| Dato | Valor real | Fichero:línea |
|---|---|---|
| `App.tsx` | **4.064 líneas**, ~87 `useState`, 40 `useEffect`, **sin React Context** | `src/App.tsx:274-2016` |
| Componentes mayores | `RightSidebar` 1.666 · `ChatCenter` 1.532 · `ModelSelectorModal` 951 · `DedicatedWebEditorView` 808 · `LeftSidebar` 787 | `src/components/*` |
| Componentes huérfanos | **Ninguno** (los 31 se importan y montan) — buena señal | `App.tsx:3401-4036` |
| «Hasta 50 adjuntos» | **Es texto de interfaz**: no hay tope de 50 en el código | `ChatCenter.tsx:711` vs `App.tsx:2038` |
| Topes reales de adjuntos | ZIP 500 ficheros · texto 3,5 MB · 2 MB/fichero · binario >5 MB omitido · DOCX 50 KB | `attachmentProcessor.ts:580-655` |
| **Workspace** | `localStorage`, tope **5 MB**; al superarlo **no guarda y solo avisa por consola** | `src/utils/storage.ts:11,36-38,62-63` |

El último es el más caro de los cinco: **el usuario puede perder su workspace al recargar sin que nada se lo diga en la interfaz.** El fix del ROADMAP («Encolar ya no aborta la generación») está confirmado en `App.tsx:1031-1041` y `:2421`.

El reparto de `localStorage` está repartido y sin dueño único: ajustes en `cerebronico_settings` (`App.tsx:642,658`), tipografías en `codigo0_app_font_size` (`:1148`) y `codigo0_code_font_size` (`CodeEditor.tsx:46,53`), fondo en IndexedDB (`indexedDBStorage.ts:12-15`), espejos en `cn.espejos.seleccion` (`espejos.ts:195,213`), aspecto en `cn.aspecto.v1` (`aspecto.ts:256`), lecciones y métricas en `selfImprovement.ts:96-98`.

### 2.5 Verificación y entrega

**La puerta se puede eludir sin mala fe.** `scripts/validar.mjs` lleva la lista de suites **hardcodeada** (`:24-92`). Una suite nueva que no se registre **nunca corre**, y el veredicto seguirá saliendo verde. Peor: el parser (`:137-164`) tiene un camino de falso verde —si una suite imprime recuento **y además** líneas `✗`, se cuenta por recuento y las rojas se ignoran (`:143-144`)— y uno de falso rojo —si no usa el formato esperado, se cuenta «no ejecutada» (`:248`), que es exactamente el bug que costó la v1.1-HD del Quirófano.

**El manifiesto está bien pensado y es incompleto.** `MANIFIESTO_SHA256_v1.6.33.txt` cubre **22 entradas**: 1 informe, 17 fuentes, solo 3 tests de ~60, y 5 ficheros de `dist/`. **No cubre** `dist/assets/pdf.worker.min-*.mjs`, `fondo-predeterminado.jpg`, `icono-cerebronico.png`, `favicon.ico`, ni `.proyectos/.cerebro-db/kb.json`. Es decir: hay ficheros entregados que nadie puede verificar, y uno de ellos (`kb.json`) es **estado que las pruebas de humo modifican**.

**Las copias canónicas se han separado del árbol.** Comparación de líneas entre `mejoras/<pkg>/` y su equivalente vivo:

| Paquete | Canónico | Árbol | Veredicto |
|---|---|---|---|
| `quirofano.ts` | 883 | 883 | en sync |
| `coreo.ts` | 143 | 143 | en sync |
| `espejos.ts` | **668** | **852** | **divergen** |
| `fondo.ts` | **102** | **187** | **divergen** |

Esto choca de frente con la convención escrita en la propia memoria del proyecto («los fixes de ficheros parcheados se duplican SIEMPRE en `mejoras/<paquete>/`»). Si algún día hay que restaurar y re-aplicar una capa, la copia canónica reconstruiría una versión más pobre. **Un canon que diverge no es un canon: es una segunda verdad.**

**Cero git.** No hay `.git` ni dependencia de git en `package.json`. El ROADMAP ya lo marcó como «el hueco real más grande» y sigue siéndolo: sin git, el Quirófano puede deshacer **una tanda**, pero nadie puede deshacer **una semana**.

### 2.6 Documentación contra código — lo que ya no es verdad

| Documento dice | Código dice | Consecuencia |
|---|---|---|
| `ROADMAP.md:20` «el `dist/` que viaja en el ZIP es el viejo» | `dist/server.mjs:5799` declara 1.6.33 y contiene Quirófano | Trampa documental: te obliga a recompilar «por si acaso» |
| `ROADMAP.md:35` D8 «NO IMPLEMENTADO, cero referencias a `eval_count`» | `metricasInferencia.ts:77-102`, `server.ts:11079-11095` | Trabajo ya hecho que el roadmap te pide repetir |
| `ROADMAP.md:53` D-P1 «el balanceo TS/JSX es código muerto» | `syntaxGuard` v3 con `esbuild.transform` en 5 puertas | Idem |
| `ROADMAP.md:34` D7 «SIN VERIFICAR» | `votacionConsejo.ts` + suite 40/40 | Idem |
| `ROADMAP.md:56` «convertir el catálogo a aspiracional» | `catalogoHonesto.ts` existe y está cableado al cliente | Idem |
| `mejoras/cerebronico-quirofano-v1/aplicar-quirofano.mjs:8` «server.ts (10.990 líneas)» | 11.461 líneas | Las capas de parche se anclan a un fichero que ya no existe tal cual |

**El ROADMAP es el documento de continuidad entre sesiones** — el que leen las sesiones siguientes (esta incluida). Un ROADMAP desactualizado no es un documento inofensivo: **es un generador de trabajo duplicado**. Arreglarlo es la Fase 0.

------------------------------------------------------------------------

## 3. Arquitectura objetivo v2

### 3.1 Lo que NO cambia

Las cinco tesis fundacionales de `ARQUITECTURA_CEREBRONICO_V8.md:18-23` se conservan íntegras, porque el diagnóstico no las contradice en ningún punto:

1. El conocimiento vive en el motor, no en el modelo.
2. Determinismo primero; el neural solo cuando la confianza no alcanza.
3. 8 GB es la ley de diseño (tramos MR1–MR4).
4. Cero claves para empezar.
5. **Nada silencioso** — esta es la que el v2 lleva más lejos: deja de ser una regla del motor y pasa a ser una propiedad **comprobable por test**.

Puertos (regla de oro inmutable): **3000** IDE · **3500** sandbox · **5000** puente · **11434** Ollama externo.

### 3.2 Las nueve decisiones de v2

| # | Decisión | Por qué (hallazgo que cierra) |
|---|---|---|
| **A1** | **Un fichero = un dominio.** `server.ts` pasa a `server/bootstrap.ts` + `server/routers/<dominio>.ts`. Ningún router supera 600 líneas. | H5 (monolito), H10 (capas de parche que chocan) |
| **A2** | **El estado tiene dueño.** Los 19 singletons salen a módulos de estado explícitos (`server/estado/*.ts`) con ciclo de vida y sin exportar mutables sueltos. | H5 (`operacionQf`, `sandboxProc` compartidos) |
| **A3** | **`/api/ai/stream` deja de ser un manejador y pasa a ser un pipeline** (`contexto → proveedor → stream`), con un adaptador por proveedor. | H5 (1.711 líneas en un handler) |
| **A4** | **El puente PC se cierra por defecto:** sin `shell=True`, lista blanca de binarios, contención de rutas por raíz permitida, token obligatorio y registro de auditoría por acción. | H1, H2, H3, H4 (los dos CRÍTICOS y los dos ALTOS) |
| **A5** | **El Consejo ejecuta o confiesa.** Registro `acción → ejecutor` con test que exige, para cada una de las 23 acciones, o un ejecutor real o una declaración explícita. | H7 (16 acciones sin ejecutor) |
| **A6** | **Un solo almacén de cliente, con cuota y error visible.** Datos (workspace, chats) a IndexedDB; preferencias pequeñas en `localStorage`; nunca un guardado silenciosamente perdido. | H6 (pérdida del workspace >5 MB) |
| **A7** | **La puerta no se puede eludir.** Descubrimiento dinámico de suites, parser estricto (recuento **y** marcas), manifiesto completo de todo lo entregado. | H9 (suites hardcodeadas, falso verde) |
| **A8** | **Git nativo como cimiento, no como extra.** El Quirófano gana un segundo nivel de deshacer (commit por tanda); la copia canónica de `mejoras/` deja de ser necesaria como canon paralelo. | H10 (cero git, canon divergente) |
| **A9** | **Enrutador de modelo por complejidad** (local ↔ nube) con la heurística declarada y medida. | Cierre del hueco ya recomendado en `ide/CORROBORACION_Y_ROADMAP_REAL.md:70` |

### 3.3 El plano en capas de v2

```
┌──────────────────────────────────────────────────────────────────────────┐
│ L5  EMPAQUETADO   1 EXE Electron + NSIS. .env NUNCA empaquetado.          │
│                   Manifiesto SHA256 COMPLETO (todo lo entregado).         │
├──────────────────────────────────────────────────────────────────────────┤
│ L4  AGENTE PC     Puente :5000 · sin shell · lista blanca de binarios ·   │
│                   raíces permitidas · token obligatorio · auditoría por   │
│                   acción · modo lectura/escritura separado                │
├──────────────────────────────────────────────────────────────────────────┤
│ L3  IDE (shell)   server/bootstrap.ts + routers por dominio (<=600 L)     │
│                   + estado con dueño + pipeline de chat por etapas        │
│                   UI: App.tsx <=600 L, contextos, workspace en IndexedDB   │
├──────────────────────────────────────────────────────────────────────────┤
│ L2  NÚCLEO       50 entidades · espejos · REGISTRO acción->EJECUTOR       │
│    AGÉNTICO      (23/23 con ejecutor o declaración) · conductor ·         │
│                  planificador · Quirófano · extensiones · forja          │
├──────────────────────────────────────────────────────────────────────────┤
│ L1  MOTOR        KB (lesson auto-rellenada) · syntaxGuard v3 · symbolIndex│
│                  · compactor · brain (memoria + rollback) · métricas      │
│                  reales · RAG único y declarado (sin embeddings por       │
│                  defecto) · modelTiers · toolRegistry                     │
├──────────────────────────────────────────────────────────────────────────┤
│ L0  NÚCLEO BASE  puertos · constants (fuente única) · storage con cuota   │
│                  visible · postinstall · PUERTA: validar dinámico, tsc,   │
│                  e2e, audit, manifiesto completo                          │
└──────────────────────────────────────────────────────────────────────────┘
   Procesos: IDE :3000 · Sandbox :3500 · Puente :5000 · Ollama :11434
```

### 3.4 Qué cambia, pieza por pieza

| Pieza | Hoy | v2 | Puerta que lo demuestra |
|---|---|---|---|
| `server.ts` | 11.461 L, 126 rutas | `bootstrap.ts` (<200 L) + `routers/*` por dominio | 126 rutas del contrato de superficie responden igual |
| `POST /api/ai/stream` | 1.711 L | pipeline: `armarContexto()` → `elegirProveedor()` → `transmitir()` | suite `pipelineChat` + prueba de paridad de salida |
| Estado global | 19 singletons | `estado/` con dueño y ciclo de vida | test que prohíbe `let`/`Map` mutables exportados en `server/` |
| Puente :5000 | `shell=True`, rutas abiertas | lista blanca + contención + auditoría | `seguridadPuente.test.ts` falla si vuelve `shell=True` |
| Guard sandbox | fail-open | fail-closed fuera de loopback | test de arranque sin token |
| Consejo | atribuye | 23/23 con ejecutor o declaración | `consejoEjecutores.test.ts` |
| Lecciones | `brain/lesson` huérfano | un solo camino vivo, con llamador probado | test de cableado (no de existencia) |
| Workspace | `localStorage` 5 MB silencioso | IndexedDB + error visible | prueba de guardado con datos >5 MB |
| Suites | lista fija de 63 | descubrimiento dinámico | suite nueva sin registrar → aparece sola |
| Manifiesto | 22 entradas | todo lo entregado | `sha256sum -c` sobre el paquete final |
| `mejoras/` | canon divergente | canon = árbol + git; `mejoras/` solo histórico | `sha256sum -c` de cada manifiesto de capa |

------------------------------------------------------------------------

## 4. Programa por fases

Cada fase se declara cerrada **solo** si pasa su puerta (comandos exactos en el [ANEXO B](ANEXO_B_CRITERIOS_DE_ACEPTACION.md)). Los esfuerzos son **estimaciones**, no medidas.

### Resumen

| Fase | Nombre | Severidad que ataca | Esfuerzo estimado | Depende de |
|---|---|---|---|---|
| 0 | Verdad congelada | H9, H10, docs | 1–2 días | — |
| 1 | Seguridad cerrada | H1, H2, H3, H4 | 3–5 días | F0 |
| 2 | Partir el monolito | H5 | 2–3 semanas | F1 |
| 3 | Motor del chat | H5 (chat) | 1–2 semanas | F2 |
| 4 | Cerebro ejecutor | H7, H8, catálogo | 1–1,5 semanas | F2 |
| 5 | Producto y datos | H6 | 1,5–2 semanas | F2 |
| 6 | Git nativo + enrutador | H10, A9 | 2 semanas | F2 |
| 7 | Visión y decisión del mapa | deuda declarada | 1 mes+ | F4 |

Las fases 3, 4, 5 y 6 son **independientes entre sí** una vez partido el monolito: pueden ir en el orden que marque tu urgencia. La 1 no admite espera, la 2 no admite atajos.

---

### FASE 0 — Verdad congelada

**Objetivo:** que la puerta de verificación y la documentación de continuidad dejen de poder mentir por accidente.

**Entregables**

1. `validar.mjs` con **descubrimiento dinámico**: recorre `tests/*.test.ts`, y avisa en rojo si encuentra un fichero de test que no ejecutó.
2. Parser **estricto**: si una suite imprime recuento **y** marcas `✗`, gana el caso peor (hoy gana el recuento, `validar.mjs:143-144`).
3. **Manifiesto completo**: todo fichero entregado (incluidos `dist/assets/*`, `fondo-predeterminado.jpg`, `icono-cerebronico.png`, `favicon.ico`) y decisión explícita sobre `.proyectos/.cerebro-db/kb.json` (cubrirlo, o excluirlo del paquete y regenerarlo).
4. **ROADMAP regenerado desde código** (D7, D8, D-P1 y catálogo ya no están pendientes).
5. **Reconciliación del canon**: o `mejoras/*/src/**` se sincroniza con el árbol y se re-firman sus SHA256, o se declara `mejoras/` como **histórico** y se retira la pretensión de canon.

**Puerta:** `npm run validar` con descubrimiento dinámico (una suite nueva de prueba aparece sin registrarla) · `sha256sum -c` del manifiesto nuevo = 100 % · el ROADMAP no contiene ningún pendiente ya implementado.

**Riesgo:** bajo. Esta fase solo puede mejorar la verificación, nunca el producto.

**Por qué va primera:** es la fase que hace fiables todas las demás. Y es la que evita el fallo que ya ha ocurrido dos veces en este proyecto (v1.1-HD: la puerta dio falso rojo; v1.6.31: el bundle salió sin el parche).

---

### FASE 1 — Seguridad cerrada

**Objetivo:** que el agente de PC siga existiendo, pero que **la lista blanca sea el camino normal** y lo demás sea explícito, registrado y reversible.

**Entregables**

1. **Puente sin shell:** se retira `shell=True` (`agent_bridge_5000.py:595-599`). Los comandos se ejecutan con `subprocess` y **lista blanca de binarios** declarada en un fichero de configuración versionado. Un comando fuera de la lista devuelve `ok:false` con `motivo` (nada silencioso).
2. **Contención de rutas:** `resolve_pc_path` (`:131-162`) sustituye el «devuelve la absoluta tal cual» (`:162`) por validación contra **raíces permitidas** con `os.path.realpath` + `commonpath` (mismo patrón que ya usa Node en `resolveSafePath`, `server.ts:662-669`, que sí está bien hecho).
3. **Token obligatorio y CORS con `Origin` exigido** en el puente (`_origen_ok:63-65` deja de devolver `true` cuando falta `Origin`).
4. **Guard fail-closed fuera de loopback** en `sandboxAuthorized` (`server.ts:511-518`): sin token, solo `127.0.0.1`/`::1` pasan.
5. **Los 9 endpoints mutadores sin guard** entran en el guard (lista exacta y líneas en §2.2) o se declaran de solo lectura y se prueban como tales.
6. **Auditoría por acción:** cada ejecución del puente deja una línea en `.cerebro-db/auditoria.jsonl` (hora, acción, ruta, resultado, motivo) + panel que la muestra. Es el complemento natural del Quirófano: él juzga **escrituras**, esto juzga **ejecuciones**.
7. **Modo lectura/escritura separado:** el modo agente PC arranca en lectura; la escritura se habilita con las mismas confirmaciones explícitas que ya existen para el borrado.

**Puerta**

- `tests/seguridadPuente.test.ts` (nueva): falla si vuelve a existir `shell=True`; una ruta fuera de las raíces permitidas se rechaza en `/api/fs/read|write|delete`; sin `Origin` el puente rechaza; sin token, cualquier ruta no-loopback se rechaza.
- Prueba **negativa** ejecutada: intento de leer un fichero fuera de las raíces → rechazo con motivo; intento de ejecutar un binario no listado → rechazo con motivo. Los dos quedan como aserciones de la suite, no como prueba manual.
- `npm audit --audit-level=high` sin hallazgos altos.

**Riesgo:** medio de compatibilidad. Al cerrar el puente pueden romperse atajos que hoy funcionan «porque todo pasaba». Mitigación: la lista blanca **se construye desde el uso real** (primero se registra qué se ejecuta durante una sesión normal, y esa lista se declara), en lugar de inventarse una lista desde cero. Ese registro es el entregable 6, así que la fase se autoalimenta.

---

### FASE 2 — Partir el monolito

**Objetivo:** que `server.ts` deje de ser un fichero y pase a ser un **plano**. Cambio **sin cambio de comportamiento**: la salida debe ser idéntica.

**Entregables**

1. `server/bootstrap.ts` (<200 L): arranque, middleware, montaje de routers, cierre ordenado.
2. `server/routers/<dominio>.ts`, un fichero por dominio y ninguno >600 L: `ai`, `sandbox`, `fs`, `exec`, `engine`, `consejo`, `espejos`, `boveda`, `extensiones`, `quirofano`, `export`, `telemetria`, `puente`, `coreo`.
3. `server/estado/*.ts`: los 19 singletons con dueño, ciclo de vida y reset (necesario para los tests).
4. **Contrato de superficie** (`tests/superficieRutas.test.ts`): la lista completa de las 126 rutas con método y forma de respuesta, congelada **antes** de mover nada y verificada después. Esta es la red de seguridad que hace posible partir 11.461 líneas sin miedo.

**Método obligatorio (regla del proyecto: la puerta antes que el bisturí)**

1. Congelar el contrato de superficie.
2. Extraer **un dominio por tanda**, empezando por los de menos riesgo (`telemetria`, `coreo`, `export`, `boveda`).
3. Tras cada tanda: `tsc` 0 + `validar` igual o mejor + contrato de superficie intacto.
4. **Quirófano activo** durante todo el trabajo: es exactamente el caso de uso para el que se construyó (juzga cada escritura y revierte la tanda si rompe).

**Puerta:** 126/126 rutas con respuesta equivalente · 0 errores de tipos · las 63 suites verdes **sin cambiar una sola aserción** · ningún fichero nuevo >600 líneas.

**Riesgo:** alto por volumen, bajo por diseño (se extrae sin reescribir lógica; prohibido «aprovechar para mejorar» dentro de esta fase — cada mejora va en su fase). La regla es explícita: **en F2 no se mejora nada; se mueve.** Sin esa disciplina, partir el monolito se convierte en el escenario que el propio `LEEME_QUIROFANO_v1.txt:9-13` describe (un modelo reescribiendo de memoria).

---

### FASE 3 — Motor del chat

**Objetivo:** que el camino más caliente del producto (`/api/ai/stream`, 1.711 líneas) sea legible, medible y por etapas.

**Entregables**

1. `server/chat/pipeline.ts`: `armarContexto()` → `elegirProveedor()` → `transmitir()` → `medir()`.
2. `server/chat/proveedores/*.ts`: **un adaptador por proveedor** (Ollama, Gemini, OpenRouter, Custom, Z.ai), con el mismo contrato de entrada/salida. Hoy la composición del prompt está resuelta con ramas dentro del handler.
3. **Métricas por etapa**: TTFT, tokens/s, tiempo de armado de contexto y tamaño inyectado por bloque, expuestos por turno (hoy `metricasInferencia.ts:77-102` ya extrae todo esto de Ollama; el trabajo es que el pipeline lo reporte por etapa y que el panel lo muestre).
4. **Cierre del `len/4`**: `metricasInferencia.ts:118` y `App.tsx:1453` dejan de estimar cuando hay medida real disponible (la estimación se conserva solo etiquetada como estimación, que es lo correcto).

**Puerta:** salida byte-comparable contra el pipeline viejo en 5 prompts de referencia (mismo modelo, temperatura 0) · métricas por etapa presentes en la respuesta · ninguna rama de proveedor fuera de su adaptador (`grep` en el test).

**Riesgo:** medio. El chat es el corazón del producto; por eso la puerta es paridad de salida, no «parece que va».

---

### FASE 4 — Cerebro ejecutor

**Objetivo:** que el Consejo deje de ser un reparto de nombres y pase a ser un reparto de trabajo. Es el paso que convierte la v1.6.33 en un producto y no en un organigrama.

**Entregables**

1. **Registro `acción → ejecutor`** (`src/engine/ejecutoresConsejo.ts`): para cada una de las 23 acciones, o un ejecutor real, o una declaración explícita de que no existe (y **por qué**). Candidatos naturales, ya presentes en el código:
   - `contar`, `listar`, `filtrar`, `ordenar`, `buscar` → deterministas sobre el workspace (sin modelo; es el camino «0 llamadas LLM» que ya defiende el motor).
   - `explicar`, `resumir`, `comparar`, `analizar` → espejos/ruta determinista cuando hay datos, modelo cuando no.
   - `testear`, `documentar`, `refactorizar`, `optimizar` → `planExecutors` + Quirófano (toda escritura pasa por el guardián).
   - `traducir`, `instalar`, `desplegar` → ya declaradas sin especialista (`votacionConsejo.ts:79-81`); **se mantiene la declaración** y se documenta el camino manual. Prometer un instalador que no existe sería exactamente el defecto que este proyecto lleva 6 versiones corrigiendo.
2. **Cierre de D9:** o `/api/brain/lesson` gana su llamador (la lección recuperada escribe en `memoria.md`), o se retira el endpoint. **No puede quedar un endpoint sin llamador**: se añade un test que falla ante cualquier ruta declarada que nadie invoca.
3. **Catálogo honesto también en el servidor:** `contextCache`/`catalogoHonesto` dejan de depender del navegador como único portador (hoy `server.ts` tiene 0 referencias). El servidor compone el bloque auditado por sí mismo cuando no lo recibe.
4. **RAG único:** se decide cuál de los dos `localRAG` sobrevive (`src/engine/localRAG.ts` vs `src/utils/localRAG.ts`) y el otro se retira con su test. Y el producto deja de llamarlo «vectorial» mientras no haya embeddings: hoy recupera por token/clave (`localRAG.ts:131,134-162`).

**Puerta:** `tests/consejoEjecutores.test.ts` (nueva) exige 23/23 con ejecutor o declaración motivada · test de «endpoint sin llamador» en verde · la suite de votación sigue verde sin tocar sus 40 aserciones.

**Riesgo:** medio. El riesgo real no es técnico, es de honestidad: la tentación es declarar «ejecuta» lo que solo enruta. La puerta lo impide porque exige una llamada real por acción.

---

### FASE 5 — Producto y datos

**Objetivo:** que la interfaz deje de ser un fichero de 4.064 líneas y que el workspace deje de poder perderse.

**Entregables**

1. `App.tsx` ≤600 líneas, con contextos: `SesionContext`, `ChatContext`, `WorkspaceContext`, `PreferenciasContext`, `MotorContext` (hoy: 87 `useState` y 40 `useEffect` en un solo componente, sin un solo Context).
2. Partir los gigantes por responsabilidad, no por tamaño: `RightSidebar` (1.666 L) → explorador + editor + terminal; `ChatCenter` (1.532 L) → mensajes + adjuntos + TTS + cola; `ModelSelectorModal` (951 L) → lista + ficha + salud de espejos.
3. **Workspace a IndexedDB** con cuota real y **error visible** al superarla (hoy `storage.ts:36-38,62-63` falla en silencio por consola). Regla: **ningún guardado puede perderse sin que la interfaz lo diga.**
4. **Adjuntos: hacer verdad el «hasta 50».** O se implementa el tope (y se ve), o se cambia el texto de la interfaz (`ChatCenter.tsx:711`). Los topes reales ya existentes (`attachmentProcessor.ts:580-655`) se muestran al usuario en lugar de descubrirse al fallar.
5. **Preferencias con un solo dueño:** un módulo `preferencias.ts` que reúna las claves hoy dispersas (`cerebronico_settings`, `codigo0_app_font_size`, `codigo0_code_font_size`, `codigo0_wallpaper_preset`, `cn.espejos.seleccion`, `cn.aspecto.v1`), con migración desde las claves viejas y test de migración.

**Puerta:** `App.tsx` ≤600 L y 0 componentes >900 L · prueba de guardado con >5 MB que produce aviso visible y conserva los datos · test de migración de preferencias · las suites de UI existentes verdes.

**Riesgo:** medio-alto de regresión visual. Mitigación: la reorganización es de **propiedad de estado**, no de diseño; cada paso se prueba contra la misma suite y con el mismo aspecto en pantalla.

---

### FASE 6 — Git nativo + enrutador de modelo

**Objetivo:** cerrar el hueco que el propio proyecto lleva meses señalando como el más grande.

**Entregables**

1. **Git nativo** (`simple-git` o `isomorphic-git`, hoy 0 referencias en `package.json`): panel con estado, diff por fichero, commit por tanda con mensaje automático (frase del usuario + ficheros tocados), historial y **volver atrás**, todo dentro del workspace y sin depender de un git externo instalado.
2. **Integración con el Quirófano:** cada tanda juzgada por el Quirófano produce también un commit. Así se pasa de «deshacer una tanda» a «deshacer cualquier punto de la semana» — el segundo nivel de deshacer que hoy no existe.
3. **Enrutador de modelo por complejidad** (A9): heurística declarada (longitud + tipo de tarea + presencia de espejo aplicable) que decide local ↔ nube, con el motivo visible por turno y **medición** del efecto (TTFT y tokens/s antes/después). Sin medición, no se declara.

**Puerta:** commit y rollback probados por suite sobre un repositorio de prueba · el rollback deja el árbol byte-idéntico al commit elegido (`sha256sum`) · el enrutador muestra el motivo del cambio de modelo en el panel de contexto y su efecto está medido.

**Riesgo:** medio. `git init` sobre `.proyectos/` con estado vivo requiere cuidado con `.cerebro-db/` (que debe quedar **fuera** del repo o con ignore explícito, para no versionar conocimiento en cada commit).

---

### FASE 7 — Visión y decisión del mapa

**Objetivo:** decidir, con números, qué se construye y qué se retira del mapa aspiracional. **No se promete nada de esta fase**: se decide aquí.

**Entregables**

1. **Visión/OCR** (hoy no existe: `generar_imagen` es salida, no entrada — `ide/CORROBORACION_Y_ROADMAP_REAL.md:31`): cablear un modelo con visión en el tramo MR3+ y declararlo por tramo, con prueba de una imagen real descrita.
2. **Decisión escrita del mapa**: `catalogoHonesto` mantiene hoy 69 capacidades aspiracionales correctamente etiquetadas. Para cada una: **construir, aplazar con fecha, o retirar del registro**. Criterio de decisión: valor para tu uso real, coste en el tramo MR2 (la ley de diseño de 8 GB) y si hay pieza previa ya construida.
3. **Modo serie de imágenes** (recomendación de bajo coste ya escrita en el roadmap: elimina la mayor parte de los reintentos por 429).

**Puerta:** una imagen real descrita por el sistema, por tramo declarado · el registro del mapa sin ninguna entrada en estado «sin decisión» · `npm run validar` con las suites nuevas.

------------------------------------------------------------------------

## 5. El tablero: métricas que se miden solas

Un plan sin números que se midan es una opinión. Estas son las ocho cifras de v2, todas obtenibles por comando:

| Métrica | Hoy (medido) | Objetivo v2 | Cómo se mide |
|---|---|---|---|
| Líneas de `server.ts` | 11.461 | <200 (bootstrap) | `wc -l` |
| Ficheros de servidor >600 L | 1 (11.461) | 0 | `find` + `wc -l` |
| Handler más grande | 1.711 L | <300 L | inventario de rutas |
| Rutas del contrato de superficie | 126 | 126 (idénticas) | `tests/superficieRutas.test.ts` |
| Acciones con ejecutor o declaración | 7 con ejecutor / 16 sin | 23/23 | `tests/consejoEjecutores.test.ts` |
| Endpoints sin guard | 9 | 0 | test de superficie de seguridad |
| Suites registradas | 63 (lista fija) | == nº de ficheros de test | descubrimiento dinámico |
| Manifiesto | 22 entradas | 100 % de lo entregado | `sha256sum -c` |
| `App.tsx` | 4.064 L | ≤600 L | `wc -l` |
| Hallazgos CRÍTICOS abiertos | 2 | 0 | este documento, §1.4 |

**Regla de la casa aplicada al tablero:** cada fase publica «CONSERVA + delta» — las cifras anteriores no pueden empeorar. Es el mismo patrón que ya usan los informes («era 3291/61; +81 comprobaciones, cero regresiones»), ahora aplicado a la estructura y no solo a las pruebas.

------------------------------------------------------------------------

## 6. Riesgos y su manejo

| Riesgo | Por qué es real aquí | Manejo |
|---|---|---|
| **Un modelo reescribe de memoria y mutila** | Es *el* fallo histórico del proyecto (`LEEME_QUIROFANO_v1.txt:9-13`) | Quirófano activo en todas las fases + `read` antes de `edit` + contrato de superficie congelado antes de partir el monolito |
| **Partir el monolito introduce regresiones silenciosas** | 126 rutas, 19 singletons compartidos | Una tanda = un dominio; prohibido mejorar dentro de F2; contrato de superficie como puerta |
| **El bundle vuelve a quedarse sin el parche** | Ya pasó (`dist/server.mjs` viejo, v1.6.31) | La puerta exige `npm run build` y una búsqueda de cadenas de la feature **dentro** del bundle, no solo en el fuente |
| **La puerta da falso verde** | Ya pasó (suites hardcodeadas, parser laxo) | Fase 0 antes que nada |
| **Cerrar el puente rompe el uso diario** | El puente es el corazón del producto | La lista blanca se construye desde el registro de uso real (entregable 6 de F1), no desde una idea previa |
| **`git init` versiona conocimiento vivo** | `.cerebro-db/` cambia en cada turno | Ignore explícito + decisión escrita de qué entra en el repo |
| **Se pierde el canon de las capas de parche** | `mejoras/` ya diverge del árbol | F0: sincronizar o declarar histórico. Nunca dejarlo indefinido |
| **El plan se convierte en otro documento desactualizado** | Es el fallo que este plan denuncia | Tras cada fase, el ROADMAP se regenera desde código (no se edita a mano) |

------------------------------------------------------------------------

## 7. Descartado a propósito (con motivo, no por olvido)

| Descartes | Motivo |
|---|---|
| Docker/Podman, CRDT/Yjs, DAP, Wasm | Cada uno es una plataforma nueva, no una carencia del cerebro; chocan con la ley de 8 GB y con el tope del workspace (`ide/CORROBORACION_Y_ROADMAP_REAL.md:17-21`) |
| Empaquetar Ollama o Python dentro del EXE | Decisión de ligereza y seguridad ya tomada y sostenida (`ARQUITECTURA_CEREBRONICO_V8.md:296`) |
| «Instalador/despliegue» automático | Sin especialista declarado, y honestamente declarado (`votacionConsejo.ts:79-81`). Se mantiene así |
| Vault cifrado de claves (PBKDF2/AES-GCM) | Deseable, pero el riesgo real hoy es **local, no de distribución** (`.env` no se empaqueta). Sube a propuesta de Fase 6 solo si quieres endurecer el almacenamiento local |
| Reescribir el motor de espejos | Los 10 espejos y 22 poderes son código determinista, probado y con contratos: no hay diagnóstico que los señale |

------------------------------------------------------------------------

## 8. Límites de este plan (lo que no hice)

Por la regla de la casa, esto se dice en lugar de disfrazarse:

1. **No he modificado una sola línea de código.** Acordamos un documento; sigue siendo un documento.
2. **No he arrancado la aplicación ni la he visto en un navegador.** Todo lo de interfaz es lectura de código (`App.tsx`, `src/components/*`), con las líneas citadas.
3. **No he ejecutado el e2e con Python** (`npm run test:e2e` pide Python) ni he arrancado el puente :5000 ni un modelo de Ollama real. Las conclusiones sobre el puente son de lectura de su código, no de un pentest ejecutado.
4. **No he probado el EXE** ni la cadena de Electron/NSIS.
5. **Sí ejecuté el gate real** (install de dependencias de cero → `tsc` → `validar` → verificación de integridad) y ese resultado es la base de §1.2. Tras el gate, el árbol quedó **byte-idéntico**: `sha256sum -c` sigue dando 22/22.
6. **Los esfuerzos por fase son estimaciones** de orden de magnitud, no medidas. El volumen de código sí está medido (11.461 + 48.808 líneas).
7. **El diagnóstico se corrigió a sí mismo una vez durante la auditoría** (el «catálogo huérfano» era falso: lo verifiqué y lo dejé escrito en §2.3 con la corrección). Lo digo porque es la prueba de que la verificación por lectura falla — y es la razón por la que este plan se apoya en comandos ejecutados.

------------------------------------------------------------------------

## 9. El siguiente paso, si quieres empezar

**Fase 0 y Fase 1.** Ninguna otra cosa antes, por este orden:

1. **Fase 0 es barata y multiplica el valor de todo lo demás.** Sin ella, cada fase posterior se cierra con una puerta que puede estar mintiendo.
2. **Fase 1 es la única con severidad CRÍTICA.** Mientras el puente ejecute con `shell=True` y resuelva rutas sin contención, el resto del proyecto está construido sobre una puerta abierta a tu PC.

Y una decisión que solo es tuya, porque afecta a tu forma de trabajar: **¿la Fase 2 se hace de una vez (2–3 semanas de un tirón) o por dominios sueltos aprovechando las sesiones normales de mejora?** El plan está diseñado para las dos cosas: el contrato de superficie congelado permite parar y retomar sin perder el hilo, y cada dominio extraído es una mejora real por sí misma.

---

*Documento terminado. Todo hallazgo tiene `ruta:línea`; toda cifra del estado actual se obtuvo ejecutando. Lo que es estimación, está dicho como estimación.*
