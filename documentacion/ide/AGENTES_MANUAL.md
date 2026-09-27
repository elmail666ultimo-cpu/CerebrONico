# MANUAL — CEREBRÓNICO-AGENTICO v1 (línea base v2.5 · producto: CerebróNico v1.0)

> **ANEXO v2.6.3 (20-sep-2026) — el cuerpo de este manual describe la línea base v2.5;
> el estado vivo es este:** **50 entidades** (las 40 de v2.5 + 10 espejos `espejo.*`
> con grupos por tarea), **21 suites** y `npm run validar` → **1479 comprobaciones ·
> 0 fallos · tipos 0**. Novedades de interfaz: **«⚡ Consejo»** (despertar/dormir las
> 18 que esperaban su botón + selector de grupos de espejos), **«A» Aspecto** (fuente,
> tamaño y color SOLO del texto por sección), **«Ⓐ Forjar»** y la herramienta del
> modelo `forjar_complemento` (el sistema compone complementos desde una receta, con
> slot de lógica y eco honesto), **Espina de Actividad** al pie (11 acciones con icono
> y movimiento: pensando/tecleo/escaneo/BLOQUEADO…), **fondo animado** con aduana de
> tamaños y tregua sandbox↔chat (el AUTO posa el sync mientras un chat transmite),
> badge **📎 embeddings** (un embedder no chatea: el 400 de Ollama explicado antes de
> gastarlo) y selector de modelos con los grupos espejos dentro. Las cifras «40 /
> 12+28 / 10-18» del cuerpo siguen vivas como historia: la regla de contratos que
> aprendimos es «CONSERVA + delta», no congelar (ver tests/agentico.test.ts).
**40 entidades deterministas + consejo + conductor.** Cero claves para empezar.

## 1. Puesta en marcha
```bash
npm install        # postinstall baja SOLO el modelo que toca por tramo MR (nunca aborta)
npm run validar    # veredicto: 1021 comprobaciones · 0 fallos
npm run dev        # IDE en http://127.0.0.1:3000
```
¿Sin Ollama? Todo lo demás funciona igual: las 40 entidades y el cerebro de
planes son código y tablas, no modelos. El modelo solo hace falta para el
`/api/conductor` (descomponer frases difíciles) y para las tareas `modelo`.

## 2. Las 40 entidades
- **12 especialistas votantes** (siempre activos): conversor, archivista,
  artista, codigo, matematico, conductor, linguista, investigador, validador,
  telemetria, memorista, ayuda. Votan sobre frases igual que el reflejo v2.4.
- **28 herramientas**: **10 despiertas por defecto** (texto.contar,
  datos.json-ruta, datos.hash, mate.promedio, mate.unidades, maq.ram,
  maq.tramo, vis.paleta, proyecto.rutas-sanas, memorista.registrar) y **18 con
  botón**. Dormida no es muerta: al invocarla responde CÓMO despertarla.

Catálogo vivo: `GET /api/consejo/estado`. Botón por API:
```bash
curl -X POST localhost:3000/api/consejo/entidad -H 'Content-Type: application/json' \
  -d '{"id":"texto.slug","activa":true}'      # el estado sobrevive reinicios (.cerebro-db/entidades.json)
```

## 3. Usos
### a) Una entidad suelta (sin plan)
```bash
curl -X POST localhost:3000/api/reflejo -H 'Content-Type: application/json' \
  -d '{"frase":"cuanto es raiz de 144 mas 1","modo":"max"}'
# → { ok:true, accion:"calculo", salida:"raiz de 144 mas 1 = 13", entidad:"matematico" }
```
### b) Dentro de un plan (paralelo real, ~0 RAM)
```json
{ "id": "7", "titulo": "informe RAM", "tipo": "reflejo", "peso": "io",
  "datos": { "entidad": "maq.ram" } }
```
Con `datos.frase` vota un especialista; sin ella ejecuta la herramienta con
`datos.datos`. 12 tareas `reflejo` en paralelo tardan microsegundos cada una:
el semáforo del gobernador ni se entera (probado en la suite `agentico`).
### c) El conductor (frase difícil → plan)
```bash
curl -X POST localhost:3000/api/conductor -H 'Content-Type: application/json' \
  -d '{"frase":"convierte el paquete a yaml y luego dibuja un banner"}'
```
Orden de decisión: **consejo primero** (confianza ≥ 0.8 → el neural NO se
despierta) → **director local** (Ollama, con UNA ronda de reparación donde el
error exacto del validador vuelve al modelo) → **fallback declarado** con los
motivos de ambos. Ningún JSON crudo del modelo llega al motor: todo pasa por
`extraerOrdenes`/`validarPlan`.

## 4. Planificador: automático, manual y CONCURRENTE (pregunta del autor)
- **Manual**: pestaña «Planificador» — formulario, intérprete de líneas
  (`titulo | tipo | dato | extra | dependeDe`), botón de escalado ×N, selector
  de tramo MR, Cancelar/Reanudar.
- **Automático**: el chat emite `cerebronico:plan` y el plan nace solo (trae la
  pestaña al frente); `/api/conductor` hace lo mismo por API.
- **Mientras trabaja, la IDE sigue tuya**: los planes corren en SEGUNDO PLANO
  (ese era su diseño fundante). Puedes seguir chateando, editando y lanzando
  más planes. Única verdad honesta: si un plan satura Ollama con muchas tareas
  `modelo`, tus chats con el MISMO modelo local pueden encolar (la interfaz
  nunca se bloquea; la respuesta tarda). Las tareas `reflejo`/`convertir`/
  imagen no tocan Ollama: con ellas, cero interferencia.

## 5. Credenciales
Ver `.env.example` (en la raíz del backend). Ninguna es obligatoria; cada clave
activa una mejora concreta (Pollinations → modelos de imagen reales y cola
prioritaria; Gemini/OpenAI/… → nube; `CEREBRONICO_SIN_MODELOS=1` → no bajar
modelos en la instalación).

## 6. Planes futuros a gran escala (hoja de ruta honesta)
| Versión | Qué | Coste real |
|---|---|---|
| **v2.5 (hoy)** | 40 entidades + tarea `reflejo` + conductor + botones persistidos | entregado |
| v2.6 | Orquesta completa: Modelfiles de DIRECTORES por dominio (qwen-coder/gemma/smollm), botón «Orquestar» en el panel (frase→plan→lanzar), enrutador de confianza por entidad | medio |
| v2.7 | Entidades con memoria cruzada (memorista alimenta al artista con semillas que gustaron) + índice del léxico por prefijo (20× más rápido el fuzzy con tablas gigantes) | medio |
| v2.8 | Visión: tarea `mirar_imagen` (Gemini con clave u Ollama con modelo visual) — cierra el ciclo artista↔crítico | alto |
| v3.0 | Multi-director: dos planes con directores distintos a la vez (el semáforo global ya lo permite; falta la UI de asignación) | alto |
| **no roadmap** | Docker/CRDT/DAP/git-nativo: cada uno es una plataforma, no un reflejo. Ver CORROBORACION_Y_ROADMAP_REAL.md | — |

Regla que gobierna la hoja de ruta: una entidad nueva solo se justifica si su
**contrato de salida** es distinto; si no, se ensancha la tabla existente. Así
40 hoy pueden ser 60 mañana sin que el consejo se pise a sí mismo.

## 7. Límites declarados (para que nadie prometa por ti)
- Las herramientas de máquina (`maq.*`, `datos.hash`, `datos.uuid`) corren en
  el SERVIDOR (Node); en el navegador responden por qué no.
- El investigador no navega: da esqueletos de plan, no resultados.
- El lingüista no traduce: limpia y cuenta; traducir es del neural.
- El conductor depende de lo bueno que sea tu director local; con 135M–400M
  fallará a veces — por eso existe la reparación y el fallback, no a pesar de
  ellos.

## 8. REFLEJOS PERSONALIZADOS — los tres caminos (verificados contra el código)

Regla de admisión (la misma que gobierna el catálogo): **si tu reflejo nuevo
devuelve lo mismo que uno existente, no es una entidad nueva: es vocabulario
nuevo.** Elegir el camino equivocado es el error clásico del plugin.

### Camino 1 — Vocabulario propio (cero código, tablas)
Para tus palabras, tu jerga y tus typos de equipo. Se edita la lista, se
regenera, se valida:
```bash
# 1) Editar scripts/gen-reflejo.mjs — las cuatro listas son el vocabulario:
#    VERBOS   (palabra → qué intención vota)
#    CURADOS  (typo → palabra canónica; aquí viven tus erratas)
#    MATE     (números y palabras matemáticas en letras)
#    FORMATOS (alias de formatos)
# Ejemplos reales que puedes pegar:
#    VERBOS:  "despacha": ["convertir"],      "bórrame": ["abrir"],
#    CURADOS: "converti": "convierte",        "dibujame": "dibuja",
#    FORMATOS: "excel": "csv",
# 2) Regenerar ambas tablas y validar:
npm run reflejo && npm run validar
```
El generador mide el resultado (lite 300–700 KB, max 2–5 MB) y **falla si te
saliste del rango**: el tamaño es consecuencia, no adorno.

### Camino 2 — Entidad nueva con contrato propio (una línea, código)
Solo si tu reflejo DEVUELVE ALGO QUE NADIE devuelve. Se añade a
`src/engine/reflejo/consejo.ts` junto a las otras 28:
```ts
T.push(reg("proyecto.deuda", "Deuda técnica", "proyecto", false,
  "cuenta TODO/FIXME/HACK por archivo (arranca dormida: el autor la despierta)",
  (d) => {
    const t0 = Date.now();
    const archivos = Array.isArray(d?.archivos) ? d.archivos : [];
    if (!archivos.length) return r("proyecto.deuda", t0, false, { motivo: "no llegó «archivos»." });
    let n = 0;
    for (const a of archivos) n += (String(a.contenido || "").match(/\b(TODO|FIXME|HACK)\b/g) || []).length;
    return r("proyecto.deuda", t0, true, { salida: `${n} marcas en ${archivos.length} archivos` });
  }));
```
Contrato de salida OBLIGATORIO: `{ ok, salida | motivo, entidad, ms }` — el
`motivo` nunca puede faltar cuando `ok:false` (regla de hierro). Después:
`npm run validar` (los tests de catálogo —40 ids únicos, cuentas, dormidas—
te avisan si rompiste una promesa numérica) y ya aparece en
`/api/consejo/estado`, con botón propio y todo, usable desde planes
`{"tipo":"reflejo","datos":{"entidad":"proyecto.deuda"}}`.

### Camino 3 — Extensión: sin tocar el núcleo, se activa y desactiva vivo
El sistema de extensiones YA existe (ver `extensions/cerebronico.panel-ejemplo/manifest.json`)
y es el camino CALIENTE: no recompilas nada, sueltas la carpeta y la activas
desde el botón «Ext» de la barra. Aporta al modelo **herramientas con esquema
JSON** que el modelo detecta solo:
```json
// extensions/mi-reflejo/manifest.json
{
  "id": "mi-reflejo", "name": "Mi reflejo", "version": "1.0.0",
  "main": "panel.html",
  "contributes": {
    "commands": [ { "id": "mi.cosas", "title": "Hacer cosas", "slash": "cosas" } ],
    "tools": [ {
      "name": "ext_mi_cosas",
      "description": "Qué hace y CUÁNDO usarla: el modelo la llama solo si encaja.",
      "handler": "command:mi.cosas",
      "parameters": { "type": "object", "properties": { "x": { "type": "string" } }, "required": ["x"] }
    } ]
  }
}
```
La `description` y el `description` de cada parámetro SON el prompt: escríbelos
como si se los explicaras a un becario. El panel (`panel.html`) corre aislado
en iframe; si además quieres pestaña propia, añade `contributes.panels`.

### Camino 4 — Sin archivos: planes hechos a mano con las 40 piezas
No subestimes esto: combinar `reflejo` + `convertir` + `generar_imagen` +
`modelo` en un plan desde la pestaña (o dictándoselo al chat) YA es un reflejo
personalizado por composición, sin escribir nada.

### Cuándo NO sirve cada camino (honestidad obligatoria)
- Ningún camino te da **juicio**: si la tarea necesita entender lenguaje
  abierto, eso es del director neural o de la nube — el reflejo más fino
  seguirá siendo determinista (esa es su virtud y su techo).
- El camino 2 requiere `npm run validar` en verde ANTES de usarlo en producción:
  el catálogo tiene contratos numéricos (40/12/28/10) y los tests los vigilan.
- Las herramientas de máquina solo corren en el servidor (Node); una extensión
  en el navegador no puede medir RAM del PC — para eso está `maq.*`.
