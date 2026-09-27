# ANEXO B — CRITERIOS DE ACEPTACIÓN

**Regla que gobierna este anexo:** una fase **no se declara cerrada** porque el trabajo esté hecho, sino porque **la puerta pasó**. Si una puerta no se puede ejecutar, la fase queda en «parcial» y se dice por qué — igual que el proyecto ya hace con el e2e de Python cuando no hay Python.

Los umbrales son los del [tablero](PLAN_MAESTRO_CEREBRONICO_V2_PRO.md) (§5). Ninguna fase puede empeorar una cifra anterior: **CONSERVA + delta**.

------------------------------------------------------------------------

## 0. La forma de una puerta

Toda puerta de fase se compone de los mismos cinco bloques. Si falta uno, la fase no está cerrada.

| Bloque | Qué exige | Cómo se comprueba |
|---|---|---|
| **Tipos** | 0 errores | `npx tsc --noEmit` |
| **Suites** | Igual o mejor que la fase anterior, 0 fallos, 0 sin correr | `npm run validar` |
| **Bundle** | El parche está **dentro** del bundle, no solo en el fuente | `npm run build` + búsqueda de la cadena de la feature en `dist/server.mjs` |
| **Integridad** | Todo lo entregado, verificado | `sha256sum -c MANIFIESTO_SHA256_<versión>.txt` |
| **Cifra nueva** | Solo las fases que introducen métrica nueva (F0, F1, F4, F5, F6) | Comando propio de la fase, indicado abajo |

------------------------------------------------------------------------

## FASE 0 — Verdad congelada

**Antes de empezar:** copia de seguridad del árbol (o commit, si ya hay git).

| Criterio | Comando | Umbral |
|---|---|---|
| Descubrimiento dinámico funciona | `npx tsx tests/<suite-nueva-de-prueba>.test.ts` + `npm run validar` | La suite de prueba aparece ejecutada **sin** haberla registrado a mano |
| Parser estricto | `npm run validar` | Una suite que imprima recuento **y** una línea `✗` cuenta como roja |
| Manifiesto completo | `sha256sum -c MANIFIESTO_SHA256_<versión>.txt` | 0 ficheros entregados fuera del manifiesto (verificable con el script de cobertura) |
| ROADMAP sin pendientes falsos | `grep -n "NO IMPLEMENTADO\|SIN VERIFICAR" ROADMAP.md` | 0 coincidencias sobre D7, D8, D-P1 y catálogo |
| Canon reconciliado | `diff -q` de cada `mejoras/<pkg>/src/**` contra el árbol | 0 diferencias, o `mejoras/` marcado explícitamente como histórico |
| **Nada roto** | `npx tsc --noEmit` + `npm run validar` | 0 errores · ≥3372 · 0 fallos · 0 sin correr |

**Definición de hecho:** una suite nueva que nadie registró **se ejecuta sola**; y el manifiesto cubre el 100 % de lo que viaja en el ZIP.

------------------------------------------------------------------------

## FASE 1 — Seguridad cerrada

| Criterio | Comando / prueba | Umbral |
|---|---|---|
| Sin shell en el puente | `grep -n "use_shell = True\|shell=True" agent_bridge_5000.py` | 0 coincidencias |
| Lista blanca activa | Suite nueva | Binario no listado → `ok:false` con `motivo` |
| Contención de rutas | Suite nueva | Ruta fuera de raíz permitida → rechazo con motivo (probado en el puente, no solo en Node) |
| CORS exige `Origin` | Suite nueva | Petición sin `Origin` → rechazo |
| Guard fail-closed | Suite nueva | Sin `ACCESS_TOKEN`, petición no-loopback → 401 |
| Endpoints mutadores cerrados | Suite nueva de superficie de seguridad | 0 endpoints que escriban o lancen procesos fuera del guard |
| Auditoría por acción | Inspección + suite | Cada ejecución del puente deja línea en `.cerebro-db/auditoria.jsonl` con hora, acción, ruta, resultado y motivo |
| Dependencias | `npm audit --audit-level=high` | 0 hallazgos altos |
| **Nada roto** | `tsc` + `validar` | 0 errores · ≥ cifra de F0 · 0 fallos |

**Prueba negativa obligatoria (se ejecuta y se guarda la salida):**

```
1) intento de leer un fichero fuera de las raíces permitidas → debe rechazar y decir por qué
2) intento de ejecutar un binario no listado                    → debe rechazar y decir por qué
3) petición sin token desde una IP no-loopback                  → debe rechazar
```

Estas tres pruebas **quedan como aserciones de suite**, no como una comprobación manual de una tarde.

**Definición de hecho:** el puente sigue haciendo lo que hacía (sigue siendo un agente de PC), pero **todo lo que hace está listado, contenido y registrado**.

------------------------------------------------------------------------

## FASE 2 — Partir el monolito

**Antes de empezar (obligatorio):** congelar el contrato de superficie. Sin esto, la fase no se empieza.

```bash
# 1. Inventario completo de rutas, ANTES de mover nada
grep -oE 'app\.(get|post|put|delete)\("[^"]+"' server.ts | sort | uniq -c > contrato_superficie_antes.txt
wc -l contrato_superficie_antes.txt        # referencia: 126 registros
```

| Criterio | Comando | Umbral |
|---|---|---|
| Rutas idénticas | `tests/superficieRutas.test.ts` + comparación del inventario | 126/126 con método y forma de respuesta equivalentes |
| Tamaño del bootstrap | `wc -l server/bootstrap.ts` | <200 líneas |
| Ningún fichero nuevo enorme | `find server -name "*.ts" -exec wc -l {} + \| sort -rn \| head` | 0 ficheros >600 líneas |
| Estado sin singletons sueltos | Test que prohíbe exportar `let`/`Map`/`Set` mutables desde `server/` | 0 violaciones |
| Suites intactas | `npm run validar` | Idénticas, **sin modificar una sola aserción** |
| Tipos | `npx tsc --noEmit` | 0 errores |
| Bundle | `npm run build` + `node --check dist/server.mjs` | Arranca y sirve |
| Humo real | Levantar y pedir una ruta representativa de cada dominio | 14/14 dominios responden |

**Regla dura de esta fase:** **en F2 no se mejora nada; se mueve.** Cada mejora que aparezca por el camino se anota en el tablero y espera a su fase. Sin esta disciplina, partir el monolito se convierte exactamente en el escenario que el proyecto ya documentó como su peor fallo (un modelo reescribiendo de memoria un fichero que no leyó).

**Definición de hecho:** `server.ts` es un plano legible; ninguna ruta cambió de comportamiento; ninguna aserción se tocó.

------------------------------------------------------------------------

## FASE 3 — Motor del chat

| Criterio | Comando / prueba | Umbral |
|---|---|---|
| Paridad de salida | 5 prompts de referencia, temperatura 0, modelo fijo | Salida equivalente antes/después del pipeline |
| Etapas separadas | Inspección + test | `armarContexto`, `elegirProveedor`, `transmitir`, `medir` existen y son llamables por separado |
| Un adaptador por proveedor | `grep` en el test | 0 ramas de proveedor fuera de `chat/proveedores/*` |
| Métricas por etapa | Respuesta del endpoint | TTFT, tokens/s, tiempo de armado y tamaño por bloque presentes por turno |
| `len/4` solo etiquetado | `grep -n "length / 4" src` | Toda aparición está declarada como estimación, ninguna sustituye una medida disponible |
| Tamaño del handler | `wc -l server/routers/ai.ts` | <300 líneas |
| **Nada roto** | `tsc` + `validar` | 0 errores · ≥ cifra de F2 · 0 fallos |

**Definición de hecho:** el camino más caliente del producto se puede leer de arriba abajo en una pantalla y se puede medir etapa por etapa.

------------------------------------------------------------------------

## FASE 4 — Cerebro ejecutor

| Criterio | Comando / prueba | Umbral |
|---|---|---|
| Cobertura del mapa | `tests/consejoEjecutores.test.ts` | 23/23 acciones: ejecutor real **o** declaración escrita con motivo |
| Ejecución real, no enrutado | Por acción con ejecutor, una llamada de prueba cuyo resultado se comprueba | 100 % de las acciones declaradas como ejecutables pasan su llamada |
| Endpoint sin llamador | Test nuevo | 0 endpoints declarados sin llamador (incluye `/api/brain/lesson` resuelto o retirado) |
| Lección llega a memoria | Prueba de extremo a extremo de un turno con error recuperado | `memoria.md` contiene la lección |
| Catálogo en el servidor | Suite | El servidor compone el bloque auditado sin depender del payload del cliente |
| RAG único | `find src -name "localRAG.ts"` | 1 solo módulo; el nombre que se use no dice «vectorial» si no hay embeddings |
| Votación intacta | `tests/consejoVotacion.test.ts` | 40/40 **sin tocar aserciones** |

**Definición de hecho:** el Consejo reparte trabajo, no solo nombres; y ninguna capacidad existe sin llamador.

------------------------------------------------------------------------

## FASE 5 — Producto y datos

| Criterio | Comando / prueba | Umbral |
|---|---|---|
| App partida | `wc -l src/App.tsx` | ≤600 líneas |
| Componentes razonables | `find src/components -name "*.tsx" -exec wc -l {} + \| sort -rn \| head -5` | 0 componentes >900 líneas |
| Contextos | `grep -c "useContext\|createContext" src/contexts/*` | 5 contextos declarados y usados |
| Workspace seguro | Prueba de guardado con >5 MB | Aviso **visible** en la interfaz y datos conservados (no pérdida silenciosa) |
| Adjuntos honestos | Inspección + suite | El tope que se anuncia es el que se aplica |
| Preferencias con un dueño | Suite de migración | Migración desde claves antiguas probada; 0 claves huérfanas |
| Aspecto intacto | Revisión visual de las 4 superficies principales | Sin regresión visible |
| **Nada roto** | `tsc` + `validar` | 0 errores · ≥ cifra de F4 · 0 fallos |

**Definición de hecho:** ningún dato del usuario puede perderse en silencio, y la interfaz se puede mantener sin leer 4.000 líneas.

------------------------------------------------------------------------

## FASE 6 — Git nativo + enrutador de modelo

| Criterio | Comando / prueba | Umbral |
|---|---|---|
| Commit y rollback | Suite sobre un repo de prueba | Commit creado; rollback deja el árbol **byte-idéntico** (`sha256sum`) al commit elegido |
| Integración con el Quirófano | Prueba de una tanda rota | La tanda revertida **y** sin commit huérfano |
| `.cerebro-db/` fuera del repo | `git status` tras un turno normal | Sin ficheros de conocimiento vivo versionados |
| Enrutador: motivo visible | Panel de contexto por turno | El motivo del cambio de modelo aparece siempre |
| Enrutador: efecto medido | Comparación antes/después (TTFT, tokens/s) | Efecto **medido y publicado**; sin medida, no se declara |
| **Nada roto** | `tsc` + `validar` | 0 errores · ≥ cifra de F5 · 0 fallos |

------------------------------------------------------------------------

## FASE 7 — Visión y decisión del mapa

| Criterio | Comando / prueba | Umbral |
|---|---|---|
| Visión real | Imagen de prueba descrita por el sistema | Salida correcta y **tramo declarado** (MR3+) |
| Mapa sin decisiones pendientes | Revisión del registro | 0 entradas «sin decisión»: construir, aplazar con fecha, o retirar |
| Modo serie de imágenes | Prueba de un plan de N imágenes | Sin reintentos masivos por 429 |
| **Nada roto** | `tsc` + `validar` | 0 errores · ≥ cifra de F6 · 0 fallos |

------------------------------------------------------------------------

## Ritual de entrega (el mismo de siempre, ahora con dos pasos más)

Cuando una fase se empaqueta, este es el orden exacto — el orden importa:

```bash
cd ide/backend
npm ci                                  # 1. dependencias de cero
npx tsc --noEmit                        # 2. tipos: 0 errores
npm run validar                         # 3. suites: 0 fallos, 0 sin correr
npm run build                           # 4. bundle AL DÍA  ← el paso que ya falló una vez
node --check dist/server.mjs            # 5. el bundle es sintácticamente sano
grep -c "<cadena-de-la-feature>" dist/server.mjs   # 6. el parche está DENTRO del bundle
npm start                               # 7. humo real: responde y sirve
#    (detener el servidor)
```

Y antes de comprimir:

```bash
# 8. restaurar artefactos de runtime que las pruebas tocaron
#    (.proyectos/.cerebro-db/kb.json, logs del puente, package-lock.json si se tocó)
sha256sum -c MANIFIESTO_SHA256_<versión>.txt      # 9. integridad: 100 %
# 10. excluir node_modules y artefactos de runtime del ZIP
```

**Los dos pasos nuevos respecto al ritual histórico** son el 6 y el 9: **comprobar la feature dentro del bundle** (porque ya se entregó una vez un `dist/` sin el parche, y el ZIP lo declaraba «instalado y verificado») y **verificar el manifiesto completo** en lugar de las 22 entradas de hoy.

------------------------------------------------------------------------

## Definición de «hecho» (una sola frase, para todo el plan)

> Una capacidad está hecha cuando **tiene fichero, endpoint y prueba que la ejercita**, y su cifra está en el tablero.

Ni más, ni menos. Es la misma regla que ya usa el proyecto; aquí solo se extiende a la estructura.
