# ANEXO C — MAPA OBJETIVO Y CONTRATOS

Este anexo es el que se usa **mientras se ejecuta la Fase 2**: dice a dónde va cada cosa, qué puede hacer cada módulo nuevo y en qué orden se mueve para no romper nada.

Todo el mapeo se apoya en los **rangos reales** de `server.ts` (11.461 líneas) inventariados en la auditoría. No hay estimaciones de líneas de origen: son los rangos medidos.

------------------------------------------------------------------------

## 1. Estructura destino

```
ide/backend/
├── server/
│   ├── bootstrap.ts            (<200 L) arranque, middleware, montaje, cierre ordenado
│   ├── routers/
│   │   ├── ai.ts               chat/stream (pipeline), TTS, modelos
│   │   ├── sandbox.ts          start/stop/status/logs, flatten-root, tregua
│   │   ├── fs.ts               read/tree/write/sync, clear-all, nuclear-wipe
│   │   ├── exec.ts             /api/exec
│   │   ├── engine.ts           kb, sync, tools, símbolos, guard, learn
│   │   ├── consejo.ts          estado de entidades, votación
│   │   ├── espejos.ts          grupos, salud, instalar
│   │   ├── boveda.ts           preparar, índice
│   │   ├── extensiones.ts      enable/disable/delete, forjar
│   │   ├── quirofano.ts        estado, revisar, deshacer
│   │   ├── export.ts           android/prepare, empaquetado
│   │   ├── telemetria.ts       hardware, pc, subagentes
│   │   ├── puente.ts           medir, bridge, estáticos
│   │   └── coreo.ts            fondo, contenedor
│   ├── chat/
│   │   ├── pipeline.ts         armarContexto → elegirProveedor → transmitir → medir
│   │   └── proveedores/        ollama.ts · gemini.ts · openrouter.ts · custom.ts · zai.ts
│   └── estado/
│       ├── quirfano.ts         operacionQf, temporizadorQf, cerrandoQf, ultimoCierreQf, avisosQf
│       ├── sandbox.ts          sandboxProc, sandboxLogStream
│       ├── engine.ts           engineKb, kbDirty, symbolMap, profileCache
│       ├── telemetria.ts       telemetryCache
│       ├── extensiones.ts      disabledExtensions, openExtensionPanels, pendingInvocations
│       ├── salud.ts            TABLA_SALUD
│       └── boveda.ts           BOVEDA
│
├── src/
│   ├── contexts/               5 contextos de React (Sesión, Chat, Workspace, Preferencias, Motor)
│   ├── engine/
│   │   └── ejecutoresConsejo.ts   registro acción → ejecutor (23 acciones)
│   └── utils/
│       ├── preferencias.ts     dueño único de las 6 claves dispersas + migración
│       └── almacen.ts          IndexedDB para datos; localStorage solo preferencias pequeñas
│
└── tests/
    ├── superficieRutas.test.ts        contrato de las 126 rutas (se escribe ANTES de F2)
    ├── seguridadPuente.test.ts        F1: shell, rutas, token, CORS, auditoría
    ├── pipelineChat.test.ts           F3: etapas + paridad de salida
    ├── consejoEjecutores.test.ts      F4: 23/23 cobertura
    ├── endpointSinLlamador.test.ts    F4: ningún endpoint huérfano
    ├── guardadoWorkspace.test.ts      F5: cuota real + error visible
    ├── migracionPreferencias.test.ts  F5: claves antiguas → dueño único
    └── gitNativo.test.ts              F6: commit + rollback byte-idéntico
```

------------------------------------------------------------------------

## 2. Mapeo: de dónde sale cada router (rangos medidos)

| Router destino | Origen en `server.ts` (líneas) | Rutas | Riesgo del movimiento |
|---|---|---|---|
| `telemetria.ts` | 6587–6838 | 3 | Bajo (empieza por aquí) |
| `puente.ts` | 11179–11360 | 4 | Bajo |
| `export.ts` | 5047–5308 | 3 | Bajo |
| `quirofano.ts` | 2251–2284 | 3 | Bajo (aislado, bien probado: 102 aserciones) |
| `boveda.ts` | dentro de 4234–5047 | — | Medio (comparte bloque con espejos) |
| `engine.ts` | 3564–3751 + 5308–5424 | 27 | Medio |
| `consejo.ts` | dentro de 4234–5047 | — | Medio |
| `espejos.ts` | 4829–5047 | — | Medio |
| `extensiones.ts` | 5969–6482 | 17 | Medio |
| `coreo.ts` | dentro de 5969–6482 (fondo, contenedor) | — | Medio |
| `fs.ts` | 8433–9108 (+ 8594–8851) | 7 | Alto (toca el workspace) |
| `exec.ts` | 8434 | 1 | Alto (ejecuta) |
| `sandbox.ts` | 5516–5969 + 6838–8433 | 7 | **Alto** (1.244 L en un handler) |
| `ai.ts` | 2998–3350 + **9468–11179** | 9 | **Alto** (1.711 L en un handler) |

**Orden recomendado, por riesgo creciente:** `telemetria` → `puente` → `export` → `quirofano` → `consejo` → `boveda` → `espejos` → `engine` → `extensiones` → `coreo` → `fs` → `exec` → `sandbox` → `ai`.

Los dos últimos (`sandbox`, `ai`) se mueven **al final y en ese orden**, porque son los que más estado comparten y los que más duele romper. `ai` ya tiene además su propia fase (F3) para convertirlo en pipeline: **el movimiento de F2 lo deja funcionando igual; el pipeline es F3.**

------------------------------------------------------------------------

## 3. Los 19 singletons y su dueño

| Singleton | Hoy | Dueño destino |
|---|---|---|
| `TABLA_SALUD` | `server.ts:529` | `estado/salud.ts` |
| `BOVEDA` | `:566` | `estado/boveda.ts` |
| `profileCache` | `:1589` | `estado/engine.ts` |
| `engineKb` | `:1675` | `estado/engine.ts` |
| `kbDirty` | `:1676` | `estado/engine.ts` |
| `symbolMap` | `:1843` | `estado/engine.ts` |
| `operacionQf` · `temporizadorQf` · `cerrandoQf` · `ultimoCierreQf` | `:2057-2060` | `estado/quirfano.ts` |
| `avisosQf` | `:2061` | `estado/quirfano.ts` |
| `genAIClient` · `genAIClientKey` | `:2910-2911` | `estado/engine.ts` (o `chat/proveedores/gemini.ts`) |
| `disabledExtensions` | `:3382` | `estado/extensiones.ts` |
| `openExtensionPanels` | `:3388` | `estado/extensiones.ts` |
| `pendingInvocations` | `:3518` | `estado/extensiones.ts` |
| `telemetryCache` | `:6583` | `estado/telemetria.ts` |
| `sandboxProc` · `sandboxLogStream` | `:6761-6762` | `estado/sandbox.ts` |

**Contrato del estado (obligatorio):** cada módulo de `estado/` exporta **funciones de acceso**, no la variable. Y expone un `reset()` para que las suites puedan probar en limpio.

```ts
// ejemplo de contrato, no de implementación
export function leerQuirfano(): Operacion | null
export function abrirOperacion(op: Operacion): void
export function cerrarOperacion(motivo: string): void
export function resetQuirfano(): void
```

**Test que lo protege:** `server/` no puede exportar `let`, `Map` ni `Set` mutables. Es una regla mecánica, comprobable con una suite de 10 líneas.

------------------------------------------------------------------------

## 4. Contratos de módulo (las reglas que hacen que esto no vuelva a ser un monolito)

| Regla | Por qué |
|---|---|
| **Un router no importa otro router.** Si dos necesitan lo mismo, eso vive en `estado/` o en un servicio. | Evita reconstruir el acoplamiento que estamos deshaciendo |
| **Ningún router >600 líneas.** Si crece, se parte por responsabilidad. | Es la cifra que hoy distingue «módulo» de «monolito» |
| **Toda ruta nueva se declara en el contrato de superficie** en el mismo cambio que la crea. | Sin esto, el contrato se vuelve decorativo |
| **Ningún endpoint se entrega sin llamador** (frontend, motor o subagente). | Cierra el caso `/api/brain/lesson` de raíz |
| **Toda escritura y toda ejecución pasan por el guardián** (Quirófano para escrituras, auditoría para ejecuciones). | Es el principio que hace que este proyecto sea distinto |
| **Toda cifra del tablero se mide en la puerta**, no se escribe a mano. | Un tablero manual vuelve a mentir en tres sesiones |

------------------------------------------------------------------------

## 5. Prohibiciones explícitas durante la Fase 2

1. **Prohibido mejorar.** Si al mover un router aparece una mejora obvia, se anota en el tablero y se implementa en su fase. F2 solo mueve.
2. **Prohibido tocar aserciones de suites existentes** para que pasen. Si una aserción falla, el movimiento está mal.
3. **Prohibido usar `write_file` sobre ficheros grandes sin `read` previo.** (Es la lección escrita del proyecto: la edición de `App.tsx` falló precisamente por saltarse ese paso.)
4. **Prohibido partir dos dominios en la misma tanda.** Una tanda = un dominio = una puerta.
5. **Prohibido declarar una tanda cerrada sin `tsc` + `validar` + contrato de superficie.** Sin los tres, la tanda no existe.

------------------------------------------------------------------------

## 6. Lo que NO se toca en v2 (y por qué)

| Pieza | Motivo |
|---|---|
| Los 10 espejos y los 22 poderes | Código determinista, con contratos y pruebas propias; ningún hallazgo los señala |
| La política conservadora del guardián de sintaxis | Ya evolucionada a parser real con esbuild; el diseño (equivocarse con datos, y si el parser falla, dejar pasar con aviso) es correcto |
| El planificador (`taskPlanner` + `planRunner`) | Tiene invariantes (io/cpu), semáforo global y pruebas; el diagnóstico lo confirma como lo mejor construido |
| `brain` / `memoria.md` | Escritura atómica, historial, rollback: ya está bien hecho |
| Los contratos «CONSERVA + delta» | Es la cultura que hace fiable este proyecto |
| La fuente única de versión (`constants.ts`) | Funciona; solo hay que mantenerla |
| Puertos 3000/3500/5000/11434 | Regla de oro inmutable |

------------------------------------------------------------------------

## 7. Cómo se sabe que la Fase 2 terminó bien

Tres señales, todas comprobables:

1. `wc -l server.ts` ya no existe como fichero (o es un reenvío de una línea al bootstrap).
2. `find server -name "*.ts" | xargs wc -l | sort -rn | head` no muestra **ningún** fichero por encima de 600 líneas.
3. Las 63 suites de hoy siguen verdes **con el mismo número de comprobaciones** — ni una más, ni una menos: exactamente las mismas, porque no se tocó ninguna.

Y una señal humana, que es la que de verdad importa: **puedes abrir el router que te interesa y trabajar en él sin leer 11.000 líneas.** Ese era el objetivo.
