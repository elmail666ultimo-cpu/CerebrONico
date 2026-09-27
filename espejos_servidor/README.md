# Espejos especializados por tipo de servidor de datos

Carpeta de respaldo + enrutador de los **espejos de servidor de datos** de
CerebroNico: expertos deterministas (sin modelo, ~0 RAM) especializados por el
**tipo de servidor de datos** que típicamente se construye con FastAPI.

## Estructura

```
espejos_servidor/
├── catalogo.json                          ← instantánea COMPLETA (la lee el router FastAPI)
├── MANIFIESTO_SHA256.txt                  ← integridad (sha256sum -c)
└── respaldos/<categoria>/<id>.json        ← UNA copia independiente por espejo
```

Cada copia independiente (`respaldos/<categoria>/<id>.json`) es autocontenida:
trae el espejo completo + su categoría + su propio SHA-256. Se puede restaurar
una sola sin tocar las demás.

## Categorías (tipos de servidor)

| Categoría | Espejo | Qué devuelve (contrato) |
|---|---|---|
| 🗄️ relacional | `servidor.relacional` | DDL SQL + claves foráneas + avisos de normalización |
| 📄 documental | `servidor.documental` | Esquema JSON + índices + campos a desnormalizar |
| 🔑 clave_valor | `servidor.clave_valor` | Patrón validado + TTL + memoria estimada |
| 🕸️ grafo | `servidor.grafo` | Nodos/aristas + huérfanos + patrón Cypher |
| 🧭 vectorial | `servidor.vectorial` | Memoria float32 + índice recomendado |
| 📈 serie_temporal | `servidor.serie_temporal` | Almacenamiento + chunk + retención |
| 📨 colas | `servidor.colas` | Topología + prefetch + confirmación |
| 📦 objetos | `servidor.objetos` | Bucket + prefijos + ciclo de vida |
| 🔎 busqueda | `servidor.busqueda` | Mapping + analizador + boosts |
| ⚡ realtime | `servidor.realtime` | Transporte + conexiones + backpressure |

## Fuente de verdad

El catálogo declarativo vive en
`src/engine/reflejo/tablas-servidor.json`. **No edites a mano** `catalogo.json`
ni `respaldos/*`: regenera con

```bash
node scripts/generar-respaldo-espejos-servidor.mjs
```

Las funciones de contrato y el enrutador viven en
`src/engine/reflejo/espejosServidor.ts` (puro, sin imports de Node).

## Selección automática (consistente · extensible · segura)

- **Consistente**: `seleccionarExperto(texto)` es determinista (misma consulta
  → misma selección) y los empates se resuelven por orden de catálogo.
- **Extensible**: añadir un experto = 1 entrada en `tablas-servidor.json` +
  1 función en `EJECUTORES` (en `espejosServidor.ts`) + regenerar respaldos.
- **Segura**: entrada acotada a 4000 caracteres, sin `eval`, sin red, sin
  disco. Un contrato que no puede cumplir devuelve `motivo` (nada silencioso).

### API FastAPI

- `GET  /espejos-servidor/catalogo` — catálogo completo.
- `POST /espejos-servidor/seleccionar` — `{ "consulta": "…" }` → `{ mejor, ranking, motivo }`.

El router FastAPI lee `catalogo.json` (la instantánea exportada de la fuente de
verdad), de modo que Python y TypeScript nunca divergen.

## Pruebas

```bash
npx tsx tests/espejosServidor.test.ts
```
