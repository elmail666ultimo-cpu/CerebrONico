# ROADMAP — CerebróNico · estado real y plan de continuación

> Documento de continuidad entre sesiones. **Regenerado contra el código el 24-sep-2026**, sobre **v1.13.0-SANDBOX-Y-VOZ**.
> Regla de la casa: **creer solo lo verificado contra código.**
> El plan completo vive en [PLAN_MAESTRO_V2](PLAN_MAESTRO_V2/PLAN_MAESTRO_CEREBRONICO_V2_PRO.md).

------------------------------------------------------------------------

## 1. Estado verificado hoy (no citado: ejecutado)

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | **0 errores** |
| `npm run validar` | **3724 comprobaciones · 0 fallos · 69 suites · 0 sin correr** |
| `npm run superficie:verificar` | **127 rutas · CONTRATO INTACTO** · **6 extraídas, 121 en el monolito** (11.438 líneas) |
| `npx tsx tests/estado.test.ts` | **50 correctas · 0 fallidas** (estado: telemetría, CPU y SANDBOX) |
| `npx tsx tests/ttsErrores.test.ts` | **35 correctas · 0 fallidas** (la ventana de voz, domesticada) |
| `npx tsx tests/voz.test.ts` | **75 correctas · 0 fallidas** (certeza + voz) |
| `npx tsx tests/persistencia.test.ts` | **42 correctas · 0 fallidas** (workspace de 5 MB+, cuota, sin almacén) |
| `npm run manifiesto:verificar` | **498 ficheros declarados · 498 en disco · TODO COINCIDE** |
| `npm audit --audit-level=high` | **0 vulnerabilidades** |
| Humo real | `:3000` responde 200 y sirve `CerebróNico V1.7.0` · puente `:5000` publica `shell: false` |

Versión: **1.13.0** (semilla única en `src/constants.ts`, sincronizada con `package.json`, `index.html` y el bundle).

**v1.13.0 «SANDBOX Y VOZ»** — tres frentes: (1) **el estado del sandbox** sale a
`server/estado/sandbox.ts` (era el último bloque grande de estado compartido, 35
sitios); al tiparlo apareció un **fallo latente**: `spawnSandbox()` puede devolver una
`Response` y el monolito la guardaba como «el proceso». (2) **La ventana de voz**: el
429 de Gemini ya no pinta su JSON en la interfaz — `server/ttsErrores.ts` lo traduce a
una frase, el volcado va al registro, no se reintenta lo que no mejora y hay espera de
5 min. (3) **El sandbox al arrancar ya no sale en rojo**: «aún no arrancado» no es un
fallo; «arrancado y no contesta» sí, y se distingue. Suites nuevas:
`tests/ttsErrores.test.ts` (35) y `tests/estado.test.ts` ampliada a 50.

**v1.12.0 «EL ESTADO SALE DEL MONOLITO»** — el paso que decide la Fase 2. La caché de
telemetría y la muestra de CPU del proceso dejan de ser variables sueltas y viven en
`server/estado/telemetria.ts` y `server/estado/proceso.ts`, con API de funciones y
**el tiempo inyectado** (por eso su caducidad se prueba sin esperar). Con ellas salen
3 rutas más (`server/routers/telemetria.ts`). **`server.ts`: 11.518 → 11.413 líneas
(6 rutas de 127 fuera).** El módulo al sandbox no lo alcanza: **le pregunta** — eso
deja escrita la API de la siguiente extracción. Comprobado en marcha: la caché sirve
la 2ª consulta y el `refresh` la invalida.

**v1.11.0 «PRIMERA EXTRACCIÓN»** — el monolito empieza a adelgazar: **3 rutas**
(`/api/health/deep`, `/api/ollama/perf`, `/api/ollama/models`) viven ya en
`server/routers/diagnostico.ts`. **`server.ts`: 11.661 → 11.518 líneas.** Los
cuerpos se movieron verbatim y solo cambia de dónde salen tres valores (Ollama, RAM,
núcleos), que se pasan como dependencias para no tener dos fuentes de verdad. El
contrato ahora informa **MOVIDAS** (no pérdidas) y publica el progreso de la fase;
su presupuesto se ajustó a 11.518. Comprobado contra el servidor en marcha: las tres
rutas responden.

**v1.10.0 «CONTRATO DE RUTAS»** — primer paso de la Fase 2: **127 rutas congeladas**
en `contrato-rutas.json` (generado desde el código), el **orden de trabajo** por 39
dominios en `SUPERFICIE_RUTAS.md`, y `scripts/superficie.mjs` (generar · verificar ·
`--seco`). Tres candados: ruta perdida → rojo, guard perdido → rojo, y **presupuesto
de líneas de `server.ts` (11.661) que no puede crecer**. Suite propia:
`tests/superficieRutas.test.ts` (37 comprobaciones). **La extracción de módulos
todavía no ha empezado** — a propósito: medio servidor migrado es peor que nada.

**v1.9.0 «ESTABILIDAD»** — lo que se cierra: (1) **el workspace ya no se pierde al
pasar de 5 MB**: `saveJSON` devuelve resultado, lo que no cabe se **rescata** al
almacén grande (IndexedDB, `grandes`) y vuelve al arrancar
(`restaurarDeAlmacenGrande`); (2) **si no se puede guardar, se dice** — la interfaz
se suscribe con `alFallarGuardado` y lo escribe en el registro visible; (3) **la
deuda D9 queda cerrada**: `/api/brain/lesson` ya tiene llamador (el aprendizaje va
a local y al cerebro) y guard, porque escribe. Suite propia:
`tests/persistencia.test.ts` (42 comprobaciones **ejecutando** la capa real contra
un localStorage y un IndexedDB de prueba).

**v1.8.0 «VOZ»** — capa transversal que ya está en el árbol: **certeza en el
idioma** (`certeza.ts` + `vocabulario.ts`: las 14 palabras que afirman exigen
ejecución), **una frase por artefacto** (`explicacionArtefacto.ts`: qué es, para
qué sirve, y si está ejecutado) y **facultad de hablar sin que pregunten**
(`autoRespuesta.ts`: 4 reglas — no inventar, decir una vez, certeza en el texto,
presupuesto de atención). Enganchada en `/api/quirofano/estado` y visible en el
panel del Quirófano. Suite propia: `tests/voz.test.ts` (75 comprobaciones).

------------------------------------------------------------------------

## 2. Lo que se corrigió en este documento (y por qué importa)

La versión anterior de este ROADMAP pedía trabajo **ya hecho**. Eso no es un detalle: este documento lo lee cada sesión nueva, así que un pendiente falso **genera trabajo duplicado**. Corregido contra código:

| Decía | Código real |
|---|---|
| D7 «SIN VERIFICAR» | `votacionConsejo.ts` + `consejoVotacion.test.ts` (40/40). **Hecho.** |
| D8 «cero referencias a `eval_count`» | `metricasInferencia.ts:77-102`, `server.ts:11079-11095`. **Hecho.** |
| D-P1 «código muerto» | `syntaxGuard` v3 con `<code>esbuild.transform</code>` en 5 puertas. **Hecho.** |
| «convertir el catálogo a aspiracional» | `catalogoHonesto.ts` cableado al cliente (`contextCache.ts:39`). **Hecho.** |
| «el `dist/` del ZIP es el viejo» | Era de la v1.6.31. El de 1.7.0 está al día (verificado por cadenas dentro del bundle). |

------------------------------------------------------------------------

## 3. Programa por fases

| Fase | Nombre | Estado | Esfuerzo estimado |
|---|---|---|---|
| **F0** | Verdad congelada (puerta que no puede mentir) | **COMPLETA** (v1.7.0) | hecho |
| **F1** | Seguridad cerrada (puente, guard, auditoría) | **COMPLETA** (v1.7.0) | hecho |
| **F2** | Partir el monolito `server.ts` | **EN CURSO** — contrato (v1.10.0) · 3 rutas (v1.11.0) · estado telemetría/CPU + 3 rutas (v1.12.0) · **estado del sandbox (v1.13.0)**: 6 de 127 rutas fuera, y **los dos bloques de estado que ataban las rutas ya tienen dueño**. Lo que queda es mecánico | ~2 semanas |
| **F3** | Motor del chat: `/api/ai/stream` a pipeline | Pendiente (depende de F2) | 1–2 semanas |
| **F4** | Cerebro ejecutor: 23 acciones con ejecutor o declaración | **EN CURSO** — registro hecho y verificado (`ejecutoresConsejo.ts`): **2 con ejecutor real, 21 declaradas con motivo**. Falta enchufar los 21 ejecutores | 1–1,5 semanas |
| **F5** | Producto y datos: `App.tsx` por contextos, workspace a IndexedDB | Pendiente (depende de F2) | 1,5–2 semanas |
| **F6** | Git nativo + enrutador de modelo por complejidad | Pendiente | 2 semanas |
| **F7** | Visión/OCR y decisión del mapa aspiracional | Pendiente | 1 mes+ |

**Regla de F2:** el primer entregable no es código, es el **contrato de las 126 rutas congelado** (`tests/superficieRutas.test.ts`). Y durante F2 **no se mejora nada: se mueve**, con la misma cifra de aserciones al salir que al entrar.

------------------------------------------------------------------------

## 4. Deuda abierta, con su evidencia

| # | Severidad | Deuda | Dónde |
|---|---|---|---|
| 1 | **ALTO** | **Monolito**: 11.661 líneas, 127 rutas, 19 singletons, y un handler de **1.711 líneas** (`POST /api/ai/stream`). Desde v1.10.0 tiene **contrato y trinquete**: no puede crecer, y sus rutas no pueden perderse | `ide/backend/server.ts` + `contrato-rutas.json` |
| 2 | **CERRADA (v1.9.0)** | ~~Pérdida silenciosa del workspace al pasar de 5 MB~~ → ahora se **rescata** al almacén grande y, si no se puede guardar, **se dice** en el registro visible. Queda como límite declarado: por encima de 5 MB el guardado es asíncrono (vuelve al arrancar, no al instante) | `src/utils/storage.ts` + `indexedDBStorage.ts` |
| 3 | **MEDIO** | El **Consejo vota pero no ejecuta**: medido en v1.7.1, **21 de 23 acciones sin ejecutor real** (2 sí: `calculo` y `convertir`). Antes se decía «16 sin especialista» — es otra cuenta: esa era de VOTOS, ésta de TRABAJO | `src/engine/ejecutoresConsejo.ts` |
| 4 | **CERRADA (v1.9.0)** | ~~Endpoint huérfano `/api/brain/lesson`~~ → el aprendizaje ahora **sí** llega al cerebro (con guard, porque escribe) | `selfImprovement.ts` → `server.ts` |
| 5 | **MEDIO** | **Cero git** y copias canónicas de `mejoras/` divergentes del árbol (`espejos.ts` 668 vs 852) | sin `.git` |
| 6 | **MEDIO** | `localRAG` recupera por **token/clave, no por embeddings**; existen **dos** módulos RAG | `src/engine/localRAG.ts` y `src/utils/localRAG.ts` |
| 7 | **BAJO** | «Hasta 50 adjuntos» es **texto de interfaz**: no hay tope de 50 en el código | `ChatCenter.tsx:711` |
| 8 | **BAJO** | Claves en `.env` **en claro** (riesgo local, no de distribución: `.env` no se empaqueta) | `app/utils/env_manager.py:8,15,19` |

**Cerrado en v1.7.0** (ya no son deuda): puente con `shell=True` sin lista blanca · rutas sin contención · guard fail-open · 11 endpoints mutantes sin guard · suite sin descubrimiento dinámico · manifiesto de 22 entradas · ROADMAP desactualizado.

------------------------------------------------------------------------

## 5. Reglas que no se tocan

1. **Puertos:** 3000 IDE · 3500 sandbox · 5000 puente · 11434 Ollama externo.
2. **Fuente única de versión:** un solo literal en `src/constants.ts`; lo demás se deriva.
3. **Nada silencioso:** lo que se decide, se dice; lo que se rechaza, dice por qué.
4. **Ritual de entrega:** `npm ci` → `tsc` → `validar` → `build` → **comprobar la feature DENTRO del bundle** → `start` (humo) → restaurar artefactos de runtime → `manifiesto` → excluir `node_modules`.
5. **Formato de suite:** cerrar con «N correctas · M fallidas»; y ahora, además, **el código de salida manda**.

------------------------------------------------------------------------

## 6. Siguiente paso acordado

**F2 (partir el monolito), empezando por el contrato de superficie.**
Alternativas independientes con resultado visible antes: **F6 (git nativo)** y **F4 (que el consejo ejecute)**.
Detalle de cada una en [PLAN_MAESTRO_V2](PLAN_MAESTRO_V2/PLAN_MAESTRO_CEREBRONICO_V2_PRO.md) §4.
