# AUDITORÍA TÉCNICA — NÚCLEO AGÉNTICO DE CEREBRÓNICO (línea CEREBRÓNICO-AGENTICO, v1.0 → v1.1.1)

> **Auditor:** auditor de código (agente) · **Fecha de auditoría:** 21-sep-2026
> **Objetivo:** informe exhaustivo del núcleo agéntico (entidades deterministas, espejos, reflejo, conductor, planificador, extensiones, forja) como base de planeación de la fusión **V8**.
> **Base de evidencia (solo código y documentos del propio repo):**
> `/home/wuying/.accio/accounts/7096577584/agents/DID-82AD6B-8682AD6BU1787698-2006-1EE3D4/project/cerebronico_evolution/`
> **Versiones auditadas:** `v1.0/Cerebronico-v1.0`, `v1.0.1/Cerebronico-v1.0`, `v1.0.2/Cerebronico-v1.0.2`, `v1.0.3/Cerebronico-v1.0.3`, `v1.1.1/Cerebronico-v1.1.1` (la más reciente).
> **Rutas citadas:** relativas a la raíz de cada versión (`<V>/ide/backend/...`). Cuando la ruta es común a todas, se cita la de v1.1.1.
> **Convención:** `HECHO` = verificado leyendo el archivo citado (con línea). `PROMETIDO` = declarado en manual/CHANGELOG pero **no** verificado en código, o verificado solo parcialmente. `NO VERIFICABLE` = requiere `npm install` + ejecución (este entorno no tiene `node_modules`, ver §12.5).

---

## 0. Resumen ejecutivo (12 líneas)

1. Existe **una sola línea de producto** con dos nomenclaturas superpuestas: la **interna** (v2.4 → v2.5 → v2.6.2 → v2.6.3 → Reflejo v3.0 → Reflejo v5) y la **de producto** (v1.0.0 → v1.0.1 → v1.0.2 → v1.0.3 → v1.1.0 → v1.1.1); la correspondencia real está probada en §1.
2. El catálogo agéntico es **código determinista puro**: 50 entidades = 12 especialistas votantes + 38 herramientas (28 curadas + 10 espejos), definidas con `reg(...)` y materializadas en `ENTIDADES` (`consejo.ts:129,343`).
3. Las 20 despiertas / 18 dormidas **no** provienen del 4.º argumento de `reg()` sino de `ACTIVAS_POR_DEFECTO` + una sobreescritura global (`consejo.ts:334-339`) — hallazgo de auditoría relevante (§2.4).
4. Los 10 espejos devuelven **JSON compacto** y son puros de verdad: `espejos.ts` solo importa tipos + un módulo interno; **cero `node:*`**, cero red, cero modelo (§3.9).
5. El **reflejo** del servidor usa tablas v3 (`tablas-lite-v3.json` 359 KB / `tablas-max-v3.json` 2,03 MB, 14.645 / 82.459 entradas) y mantiene las tablas v2.x como respaldo (§4).
6. El **conductor** (`POST /api/conductor`, `server.ts:3991`) implementa literalmente la cadena prometida: consejo con `confianza ≥ 0.8` → director Ollama con **una** ronda de reparación → fallback declarado con motivos (§5).
7. El **planificador** es real y honesto: validación de ciclos por tres colores, Kahn por capas, lotes paralelos, `resolverPresupuesto` con invariante `io ≥ 1 ∧ cpu ≥ 1` (nunca 0) y tope `io ≤ 16`, cancelación que despierta el bucle, reanudación de `en_curso` huérfanas (§6).
8. El **segundo plano** no es retórica: `planRunner.ts` envuelve el ejecutor con un **semáforo global por peso** para que N planes no multiplicen la carga de la máquina (§6.6).
9. **Extensiones** (caliente, iframe + `postMessage {cn:1}`) y **Forja** (`forjar_complemento` → `manifest.json` + `panel.html` deterministas) están implementadas y verificadas contra código; la Forja **no** confía nada crítico al modelo (§7, §8).
10. El frontend agéntico existe con nombre y línea: `EspinaActividad.tsx` (COREO, 11 acciones), `ConsejoPanel.tsx` (⚡ Consejo), `EspejosSelector.tsx`, `PanelAspecto.tsx` (A), `PluginForge.tsx` (Ⓐ/⚒ Forjar) (§11).
11. Las **puertas** declaradas son verificables por lectura pero **no reproducibles aquí**: `npm run validar` = 27 suites + puerta `tsc`; v1.1.1 reporta 1627·0·27 y el ANEXO del manual dice 1479·0·21 (§12) — son **estados distintos**, no contradicción.
12. **Deuda declarada-por-código** (útil para V8): `constants.ts:190` sigue diciendo `VERSION: "V1.0.3"` mientras `package.json` dice `1.1.1`; y `ESPEJOS_PERSONALIZADOS.md` afirma «no implementado todavía» cuando `cargadorEspejos.ts` + `pool.ts` + `tests/espejos-personalizados.test.ts` ya existen (§1.4, §15).

---

## 1. Correspondencia real de versiones (producto ⇄ interna)

### 1.1 Método

Se cruzaron tres fuentes independientes: `package.json` (versión publicada), `src/constants.ts` (`IDE_BRAND.VERSION`, fuente única de la marca en cabecera) y los CHANGELOG del repo.

| Evidencia | Ruta | Contenido |
|---|---|---|
| `package.json` v1.0.0 | `v1.0/Cerebronico-v1.0/ide/backend/package.json:4` | `"version": "1.0.0"` |
| `package.json` v1.0.1 | `v1.0.1/Cerebronico-v1.0/ide/backend/package.json:4` | `"version": "1.0.1"` |
| `package.json` v1.0.2 | `v1.0.2/Cerebronico-v1.0.2/ide/backend/package.json:4` | `"version": "1.0.2"` |
| `package.json` v1.0.3 | `v1.0.3/Cerebronico-v1.0.3/ide/backend/package.json:4` | `"version": "1.0.3"` |
| `package.json` v1.1.1 | `v1.1.1/Cerebronico-v1.1.1/ide/backend/package.json:4` | `"version": "1.1.1"` · `"name": "cerebronico-ide"` |
| `IDE_BRAND.VERSION` | `v1.1.1/.../src/constants.ts:190` | `VERSION: "V1.0.3"` ← **desincronizado** con package.json 1.1.1 |
| CHANGELOG acumulado | `v1.1.1/Cerebronico-v1.1.1/CHANGELOG_v1.0.md:73-77` | «CerebroNico v2.6.3 cierra su era; nace **CerebróNico V1.0** … package.json 1.0.0» |
| CHANGELOG v1.1.0 | `.../CHANGELOG_v1.1.0.md:1` | «CerebroNico v1.1.0 · **REFLEJO v5** (21-sep-2026)» |
| CHANGELOG v1.1.1 | `.../CHANGELOG_v1.1.1.md:1` | «CerebroNico v1.1.1 · **BUILD v1** (21-sep-2026)» |

### 1.2 Tabla de correspondencia (HECHO)

| Producto (ZIP / package.json) | Línea interna | Motor de reflejo | Entidades | Puerta `validar` declarada |
|---|---|---|---|---|
| **v1.0.0** | v2.6.3 renombrado → **V1.0** | Reflejo **v2.4** (tablas 2.4.0) | **50** | 1481 · 0 · **21 suites** (`CHANGELOG_v1.0.md:94`) |
| **v1.0.1** | v2.6.3 + parches (Batilos Record) | Reflejo v2.4 | 50 | 1481 · 0 · 21 |
| **v1.0.2** | v2.6.3 + espejos «era de los espejos» | Reflejo **v3.0** (tablas v3) | 50 | 1481 · 0 · 21 (`CHANGELOG_v1.0.md:47`) |
| **v1.0.3** | v2.6.3 + PODERES | Reflejo v3.0 + 22 poderes | 50 | 1481 · 0 · 21 (`CHANGELOG_v1.0.md:21`) |
| **v1.1.0** | Reflejo v5 (salud, confianza, GRUPO, BÓVEDA, ADUANA v2, IMAGEN v5) | Reflejo **v5** | 50 | (no declarada en el CHANGELOG de 1.1.0; sí en 1.1.1) |
| **v1.1.1** | Reflejo v5 + **BUILD v1** (cura de `vite build`) | Reflejo v5 | 50 | **1627 · 0 · 27 suites** (`CHANGELOG_v1.1.1.md:29`) |

**Correspondencia del ANEXO v2.6.3 del manual:** `ide/AGENTES_MANUAL.md:3-16` dice «ANEXO v2.6.3 (20-sep-2026) … **50 entidades**, **21 suites**, `npm run validar` → **1479**». Ese anexo describe el estado **v2.6.3 ≈ producto v1.0.0/v1.0.1** (21 suites), mientras que el código de v1.1.1 ya tiene **27 suites**. Es decir: **el manual va un producto por detrás** (1479 vs 1627). El propio manual lo admite como historia viva: «Las cifras «40 / 12+28 / 10-18» del cuerpo siguen vivas como historia» (`AGENTES_MANUAL.md:14-16`).

### 1.3 El «gran renombrado» (v2.6.3 → V1.0)

`CHANGELOG_v1.0.md:73-96` documenta: marca unificada vía `IDE_BRAND`, `package.json` 1.0.0, FOCO v1 (la Espina de 26 px pasó a `pointer-events-none` + `pb-[26px]`), fondo por defecto `public/fondo-predeterminado.jpg`, recursión en dos pasos, icono `build/icon.png`. Todo eso es **HECHO** en v1.1.1: el parche está aplicado por `mejoras/cerebronico-v10/aplicar-v10.mjs:33-36` (inserta `pointer-events-none` en `EspinaActividad.tsx`) y `mejoras/cerebronico-v10/assets/public/fondo-predeterminado.jpg` existe.

### 1.4 Deudas de nomenclatura detectadas (HECHO)

| Deuda | Evidencia | Impacto para V8 |
|---|---|---|
| `constants.ts` dice `V1.0.3` con `package.json` 1.1.1 | `src/constants.ts:190` vs `package.json:4` | La cabecera que ve el usuario miente; V8 debe unificar en una sola fuente real (no dos). |
| `AGENTES_MANUAL.md` describe línea base v2.5 (40 entidades) y anexo 1479/21 | `AGENTES_MANUAL.md:1-22` | El manual **no** documenta v1.1.0 ni v1.1.1 (no hay ANEXO v5). Riesgo de fusión sobre documentación obsoleta. |
| `ESPEJOS_PERSONALIZADOS.md` dice «no implementado todavía» (Paso 2) | `ESPEJOS_PERSONALIZADOS.md:4-8` | Falso en v1.1.1: hay `reflejo/cargadorEspejos.ts`, `reflejo/pool.ts`, `tests/espejos-personalizados.test.ts` y endpoints `/api/espejos/personalizados|instalar|desinstalar` (`server.ts:3758,3773,3878`). |
| Comentarios de conteo internos erróneos | `consejo.ts:134` dice «texto (8)» habiendo **7**; `:176` «datos (8)» habiendo 7; `:252` «maquina (4)» habiendo 3; `:301` «proyecto (4)» habiendo 3 | Cosmético, pero engaña a un auditor humano: los conteos reales (28 herramientas) están bien, los comentarios por bloque no. |

---

## 2. Catálogo de entidades (50) — análisis del código

### 2.1 Cómo se define una entidad (HECHO)

Fábrica y contrato (`src/engine/reflejo/consejo.ts`):

```ts
// consejo.ts:126
const r = (entidad, t0, ok, extra: Partial<ResultadoEntidad> = {}): ResultadoEntidad =>
  ({ ok, entidad, ms: Date.now() - t0, ...extra });
// consejo.ts:129
const reg = (id, nombre, dominio: Entidad["dominio"], activa: boolean,
             descripcion: string, ejecutar: (d:any)=>ResultadoEntidad): Entidad =>
  ({ id, nombre, dominio, tipo: "herramienta", activa, descripcion, ejecutar });
// consejo.ts:132
const T: Entidad[] = [];
```

- `Entidad` (`consejo.ts:61-70`): `{ id, nombre, dominio, tipo, activa, descripcion, ejecutar? }`.
- `dominio` ∈ `"especialista" | "texto" | "datos" | "matematicas" | "maquina" | "visual" | "proyecto" | "espejo"` (`:64`).
- **Contrato de salida obligatorio:** `{ ok, salida? | motivo, entidad, ms }`; `motivo` **siempre** presente cuando `ok:false` (`:52-59`: «SIEMPRE presente cuando ok === false»).
- Los espejos se inyectan en el mismo array vía `T.push(...crearEspejos(reg, r))` (`:329`) — reutilizan las fábricas: **una sola fuente de contrato**.
- Registro final (`:343-346`):
  ```ts
  export const ENTIDADES: Entidad[] = [
    ...ESPECIALISTAS.map(e => ({...e, dominio:"especialista", tipo:"especialista", activa:true})),
    ...T,
  ];
  ```
- Ejecución por id con motivo declarado: `ejecutarEntidad(id, datos)` (`:366-398`) devuelve, en orden: (1) espejo personalizado del pool si `poolListo()` y el id es del pool; (2) error declarativo si no existe; (3) `««id» está DORMIDA: actívala con POST /api/consejo/entidad…»` (`:390`); (4) `«es especialista: se usa vía frase…»` (`:391`); (5) `try/catch` que convierte una excepción en motivo (`:394-397`).
- Activación: `cambiarActivacion(id, activa)` (`:357-363`) **rechaza** dormir especialistas: `««id» es especialista votante: no se duerme con toggle»`.

### 2.2 Los 12 especialistas votantes (HECHO)

Definidos como datos, no como funciones (`consejo.ts:85-98`). El voto real lo sigue produciendo el motor (`pensar`), y el consejo **atribuye**: `pensarConsejo()` (`:401-406`) mapea `accion`/`orden.tipo` → dueño con `DUEÑO_DE` (`:75-83`).

| # | id | Nombre | Descripción (literal, `consejo.ts:86-97`) |
|---|---|---|---|
| 1 | `conversor` | Conversor de formatos | json↔yaml↔toml↔csv con informe de pérdidas (formatConverter) |
| 2 | `archivista` | Archivista | abre/lee rutas del proyecto; audita rutas sanas |
| 3 | `artista` | Artista | frase → prompt de imagen enriquecido (estilo, luz, paleta, seed) |
| 4 | `codigo` | Operario de código | plantillas react/express/python/html/ts; imports y sintaxis delegan en importChecker/syntaxGuard |
| 5 | `matematico` | Matemático | calculadora con parser propio, sin eval |
| 6 | `conductor` | Conductor de planes | descompone en DAG con dependencias (taskPlanner es su validador) |
| 7 | `linguista` | Lingüista | normaliza, cuenta, compara texto. **NO traduce** |
| 8 | `investigador` | Investigador | esqueleto de plan de investigación y citas. Sin red **no investiga: lo declara** |
| 9 | `validador` | Validador | JSON/rutas/esquemas contra las funciones reales del motor |
| 10 | `telemetria` | Telemetría | RAM, núcleos, carga del sistema |
| 11 | `memorista` | Memorista | recuerda semillas y decisiones del consejo **durante la sesión** |
| 12 | `ayuda` | Ayuda | cuando nadie vota: dice qué se pareció y por qué no pasó el umbral |

Mapa de atribución de acciones → entidad (`consejo.ts:75-83`): `convertir→conversor`, `abrir→archivista`, `imagen→artista`, `creacion→codigo`, `calculo→matematico`, `plan→conductor`, `nada→ayuda`.

> **HECHO relevante:** no hay 12 funciones ejecutables; hay **12 fichas** y **7 ramas reales** de `pensar()` (`convertir, abrir, imagen, creacion, calculo, plan, nada`). `linguista`, `investigador`, `validador`, `telemetria`, `memorista` **no** tienen rama propia en `DUEÑO_DE`: son voces/fichas que el manual declara «siempre activas» pero que hoy **no reciben votos por acción** salvo que el orquestador de leyes las alcance (§4.6). Es un punto a resolver en V8 (§15-H3).

### 2.3 Las 38 herramientas — catálogo COMPLETO con firma de invocación (HECHO)

Firma de la función ejecutora: `(d: any) => ResultadoEntidad`, donde `d` es el objeto `datos` de la tarea o el cuerpo de la petición. Todas devuelven `{ok, salida|motivo, entidad, ms}`.

| # | id | Nombre | Dominio (declarado) | dormida/despierta **efectiva** | Entrada (`d.*`) | Salida (forma) | Línea |
|---|---|---|---|---|---|---|---|
| 1 | `texto.contar` | Contar palabras | texto | **despierta** | `texto` | `N palabras · N líneas · N caracteres` | `consejo.ts:135` |
| 2 | `texto.acentos` | Quitar acentos | texto | dormida | `texto` | texto NFD sin diacríticos | `:140` |
| 3 | `texto.mayus` | Cambiar mayúsculas | texto | dormida | `texto`, `modo`∈mayus\|minus\|titulo | texto | `:145` |
| 4 | `texto.slug` | Slug | texto | dormida | `texto` | url-seguro | `:152` |
| 5 | `texto.ordenar` | Ordenar líneas | texto | dormida | `texto`, `reverso?` | texto | `:157` |
| 6 | `texto.dedup` | Deduplicar líneas | texto | dormida | `texto` | texto | `:164` |
| 7 | `texto.dif` | Diferencia de líneas | texto | dormida | `a`, `b` | líneas en A ∉ B | `:169` |
| 8 | `datos.json-ruta` | Ruta JSON | datos | **despierta** | `json`, `ruta` (`a.b[0]`) | valor serializado | `:177` |
| 9 | `datos.json-llaves` | Claves de JSON | datos | dormida | `json` | `k:tipo` listados | `:188` |
| 10 | `datos.csv-columnas` | Columnas CSV | datos | dormida | `csv` | `N columnas [cabecera] · N filas` | `:194` |
| 11 | `datos.csv-fila` | Fila N de CSV | datos | dormida | `csv`, `n` (1-based) | fila | `:200` |
| 12 | `datos.base64` | Base64 | datos | dormida | `texto`, `modo`∈cod\|dec | texto | `:208` |
| 13 | `datos.hash` | SHA-256 | datos | **despierta** (requiere `SISTEMA`) | `texto` | hex sha256 | `:215` |
| 14 | `datos.uuid` | UUID nuevo | datos | dormida (requiere `SISTEMA`) | — | uuid v4 | `:221` |
| 15 | `mate.promedio` | Promedio | matematicas | **despierta** | `numeros` (lista o CSV de texto) | número | `:228` |
| 16 | `mate.porcentaje` | Porcentaje | matematicas | dormida | `p`, `n` | `p% de n = x` | `:233` |
| 17 | `mate.minmax` | Mínimo y máximo | matematicas | dormida | `numeros` | `min= max= rango=` | `:238` |
| 18 | `mate.unidades` | Unidades | matematicas | **despierta** | `valor`, `de`, `a` | número | `:243` |
| 19 | `maq.ram` | RAM | maquina | **despierta** (servidor) | — | `total X GB · libre Y GB` | `:253` |
| 20 | `maq.cpu` | CPU | maquina | dormida (servidor) | — | `N núcleos · modelo` | `:258` |
| 21 | `maq.tramo` | Tramo MR | maquina | **despierta** (servidor) | — | `X GB → MR2 (8 GB)` | `:263` |
| 22 | `vis.hex2rgb` | Hex → RGB | visual | dormida | `hex` | `rgb(r, g, b)` | `:271` |
| 23 | `vis.rgb2hex` | RGB → Hex | visual | dormida | `r`,`g`,`b` | `#rrggbb` | `:276` |
| 24 | `vis.contraste` | Contraste AA | visual | dormida | `a`,`b` hex | `ratio:1 → AA normal SÍ/NO · AA grande` | `:281` |
| 25 | `vis.paleta` | Paleta por nombre | visual | **despierta** | `nombre` (español) | `#hex` | `:294` |
| 26 | `proyecto.stats` | Estadísticas del workspace | proyecto | dormida | `archivos[{ruta,contenido}]` | `ext:Nf/Nl …` | `:302` |
| 27 | `proyecto.rutas-sanas` | Auditar rutas | **datos** (¡no proyecto!) | dormida | `rutas[]` | `todas sanas (N)` / motivo | `:313` |
| 28 | `memorista.registrar` | Recordar decisión | **datos** (¡no proyecto!) | dormida | `nota`, `entidad?` | `registrada (N en la sesión)` | `:321` |
| 29 | `espejo.codigos` | Espejo · Códigos | espejo | **despierta** | `codigo`, `lenguaje?` | JSON | `espejos.ts:442` |
| 30 | `espejo.lenguajes` | Espejo · Lenguajes | espejo | **despierta** | `texto` | JSON | `espejos.ts:469` |
| 31 | `espejo.artes` | Espejo · Artes | espejo | **despierta** | `base` (hex) | JSON | `espejos.ts:504` |
| 32 | `espejo.disenios` | Espejo · Diseños | espejo | **despierta** | `ancho`, `paso?`, `minCol?` | JSON | `espejos.ts:528` |
| 33 | `espejo.creadores` | Espejo · Creadores | espejo | **despierta** | `ejes`, `n?`, `semilla?`, `sistematico?` | JSON | `espejos.ts:549` |
| 34 | `espejo.planificadores` | Espejo · Planificadores | espejo | **despierta** | `tareas[{id,dependeDe}]`, `tramo?`, `nucleos?` | JSON | `espejos.ts:583` |
| 35 | `espejo.cientificos` | Espejo · Científicos | espejo | **despierta** | `objetivo`, `dependiente{nombre,tipo,metrica,replicados}`, `independiente[]`, `control[]`, `dobleCiego?` | JSON | `espejos.ts:626` |
| 36 | `espejo.fisicos` | Espejo · Físicos | espejo | **despierta** | `expresion`, `de?`,`a?`,`cantidad?` | JSON | `espejos.ts:653` |
| 37 | `espejo.matematicos` | Espejo · Matemáticos | espejo | **despierta** | `expresion?`, `enteros[]?` | JSON | `espejos.ts:673` |
| 38 | `espejo.cuantico` | Espejo · Cuántico | espejo | **despierta** | `qubits` (1–8), `puertas[{p,q,t?}]` | JSON | `espejos.ts:699` |

**Cuentas verificadas:** 12 especialistas + 7 (texto) + 7 (datos) + 4 (mate) + 3 (maq) + 4 (visual) + 2 (proyecto) + 1 (memorista) = 12 + 28 = 40; + 10 espejos = **50** (`ENTIDADES.length === 50`, asertado en `tests/agentico.test.ts:34` y `tests/espejos.test.ts:36`).

### 2.4 Activación por defecto — el mecanismo real (HECHO, hallazgo)

```ts
// consejo.ts:334-339
export const ACTIVAS_POR_DEFECTO = new Set([
  "texto.contar", "datos.json-ruta", "datos.hash", "mate.promedio", "mate.unidades",
  "maq.ram", "maq.tramo", "vis.paleta", "proyecto.rutas-sanas", "memorista.registrar",
  ...IDS_ESPEJOS, // los 10 espejos nacen despiertos
]);
for (const h of T) h.activa = ACTIVAS_POR_DEFECTO.has(h.id);
```

- **El 4.º argumento `activa` de cada `reg(...)` es decorativo**: la línea `:339` lo pisa para las 38 herramientas. Ejemplo: `texto.acentos` se declara con `true` (`:140`) y queda **dormida**.
- Resultado efectivo: **20 despiertas** (10 curadas de v2.5 + 10 espejos) y **18 dormidas**. Verificado por aserción en `tests/agentico.test.ts:41-42` y `tests/espejos.test.ts:42-43`.
- `estadoConsejo()` (`consejo.ts:408-420`) publica el catálogo vivo y su `nota`: «50 entidades: 12 votantes + 38 herramientas (20 activas: las 10 de v2.5 + los 10 espejos; 18 con botón)».
- Las **18 dormidas** exactas: `texto.acentos, texto.mayus, texto.slug, texto.ordenar, texto.dedup, texto.dif, datos.json-llaves, datos.csv-columnas, datos.csv-fila, datos.base64, datos.uuid, mate.porcentaje, mate.minmax, maq.cpu, vis.hex2rgb, vis.rgb2hex, vis.contraste, proyecto.stats`.
- Dos herramientas declaran `dominio: "datos"` teniendo id de otro dominio (`proyecto.rutas-sanas`, `memorista.registrar`): inconsistencia de metadatos (§15-H4).

### 2.5 Persistencia del botón (HECHO)

`server.ts:3347-3377`: `.cerebro-db/entidades.json` guarda `{activas:{id:bool}, en:ISO}`; al arrancar se re-aplica con `cambiarActivacion` (`:3351-3355`); si el archivo no se puede leer/escribir, se **declara** en consola y se sigue (`:3357, :3374`). El catálogo y su lógica **nunca** se persisten: viven en el código.

---

## 3. Los 10 espejos (`src/engine/reflejo/espejos.ts`, 764 líneas)

### 3.1 Qué es un espejo (HECHO)

Cabecera del módulo (`espejos.ts:1-37`): «Espejos de la info alojada en el motor: funciones deterministas puras. No cargan modelo, no tocan Ollama, no importan Node… **Cero dependencias en tiempo de ejecución**». Contrato: misma tupla que el consejo, y **`salida` es SIEMPRE un JSON compacto** (`:27-28`), de modo que «cualquier plan puede interrogarlo después con `datos.json-ruta`. Así un espejo alimenta a otro sin RAM».

Utilidades puras compartidas: `redondear` (`:252`), PRNG mulberry32 semillado (`:256-264`), `hashSemilla` FNV-1a (`:266-270`), evaluador aritmético sin `eval` con precedencias/`^`/funciones/constantes (`:287-362`), `mcd`/`factorizar`/`esPrimo` (`:364-377`), HEX↔HSL (`:380-411`).

Constantes físicas disponibles en el evaluador (`:276-280`): `pi, e, tau, c=299792458, g=9.80665, h=6.62607015e-34, k=1.380649e-23, na=6.02214076e23, r=8.31446262`. Funciones (`:281-285`): `raiz|sqrt, abs, ln, log, log10, exp, sen|sin, cos, tan, suelo, techo, round`.

### 3.2 Contratos de salida exactos de los 10 espejos (HECHO)

| Espejo | Entrada | Claves exactas de la `salida` (JSON) | Reglas/motivos duros | Línea |
|---|---|---|---|---|
| `espejo.codigos` | `{codigo, lenguaje?}` | `lenguaje, lineas, lineasCodigo, simbolos{funciones,clases,imports,exports}, simbolosLista[≤24], condicionales, bucles, operadoresLogicos, ciclomaticaAprox, marcas` | sin `codigo` → `no llegó «codigo» (texto del fragmento).` | `:442-466` |
| `espejo.lenguajes` | `{texto}` | `idioma, confianza, palabras, frases, longitudMedia, silabasPorPalabra, flesch` | 6 idiomas por stopwords (es,en,fr,pt,it,de); `score===0 → idioma:"desconocido"` (`:494`); sin palabras → motivo | `:469-501` |
| `espejo.artes` | `{base:"#rrggbb"}` | `base, hsl{h,s,l}, armonias{complementaria[2], triada[3], analoga[3], "complementaria-partida"[3]}, tonos{claro,oscuro}, aurea` | hex inválido → motivo con ejemplo `#3a6ea5`; `aurea = 100/φ ≈ 61.8` | `:504-525` |
| `espejo.disenios` | `{ancho, paso?=8, minCol?=240}` | `grilla{ancho, columnas, margenLateral, gutter, altoAureo}, espaciado[11], breakpoints{sm,md,lg,xl,2xl}` | `ancho` no positivo → motivo; `columnas = floor(ancho/minCol)`; breakpoints fijos 640/768/1024/1280/1536 | `:528-546` |
| `espejo.creadores` | `{ejes:{k:[v…]}, n?=10, semilla?="cerebronico", sistematico?=true}` | `semilla, sistematico, espacioMuestral, avisos[], n, variantes[{…}]` | `n` acotado a 1–5000; ejes vacíos o valores no string/number → motivo; `sistematico` recorre sin repetir hasta agotar el espacio y **avisa** si `n > espacio` | `:549-580` |
| `espejo.planificadores` | `{tareas:[{id,dependeDe?}], tramo?="MR2", nucleos?=4}` | `tareas, lotes[[]], profundidad, paralelismoMax, tramo, presupuesto{io,cpu}, nota` | ids repetidos / sin id / dependencia inexistente → motivo; **ciclo → motivo** (`:610`); `tramo ∉ MR1..MR4` → motivo; `presupuesto.io = clamp(GB/4,1,16)`, `cpu = max(1, nucleos-1)` | `:583-623` |
| `espejo.cientificos` | `{objetivo, dependiente{nombre,tipo,metrica,replicados}, independiente[], control?[], dobleCiego?}` | `objetivo, hipotesis{H0,H1}, variables{independiente,dependiente,control}, condiciones, replicadosMinimos, ciego, pruebaSugerida, metrica` | tipo ∈ `continua`/`categorica` (si no → motivo); n grupos 1→t una muestra, 2→t Student/Mann-Whitney, >2→ANOVA/Kruskal-Wallis; categórica → chi-cuadrado o regresión logística | `:626-650` |
| `espejo.fisicos` | `{expresion, de?, a?, cantidad?}` | `expresion, valor, notacionCientifica, conversion{de,a,cantidad,resultado} \| {error}` | tabla SI compacta (`m,km,cm,mm,mg,g,kg,t,s,min,h,dias`); unidad fuera de tabla → `conversion.error` **dentro de una salida ok** (no falla el espejo) | `:653-670` |
| `espejo.matematicos` | `{expresion?}` y/o `{enteros:[…]}` | `expresion?, valor?, factorizacion?, esPrimo?` + `enteros, mcd, mcm` (si ≥2) o `aviso` (si 1) | sin expresión ni enteros → motivo; error de evaluación → motivo | `:673-696` |
| `espejo.cuantico` | `{qubits:1..8, puertas:[{p,q,t?}]}` | `qubits, dim, puerta, norma, probabilidades{"0101":p}, amplitudes["re±imi"]` | **`qubits` fuera de 1–8 → motivo** (`:703`, «2^9 estados ya no es un espejo barato»); puertas `x,y,z,h,s,t` + `cnot{q,t}`; `cnot` con `q===t` o fuera de rango → motivo; puerta desconocida → motivo listando las válidas | `:699-759` |

### 3.3 Restricciones verificadas en código (afirmaciones del enunciado)

| Restricción declarada | HECHO en código | Evidencia |
|---|---|---|
| Cuántico limitado a 8 qubits | **SÍ** — `n<1 || n>8 → ok:false` con motivo | `espejos.ts:703` |
| Idioma `<15 palabras` → «desconocido» | **PARCIALMENTE**. El umbral real **no** es 15 palabras: es `score === 0` (ninguna stopword encontrada) → `"desconocido"` | `espejos.ts:490-494` |
| Contraste/idiomas deterministas | **SÍ** — perfil Flesch propio, stopwords en tabla, sin modelo | `espejos.ts:474-500` |
| Artes con armonías reales HSL | **SÍ** — rotaciones 180/120/240/−30/0/30/150/210 sobre HSL | `espejos.ts:509-523` |
| «CERO imports de runtime» en `espejos.ts` | **SÍ, verificado por lectura**: solo `import type {Entidad, ResultadoEntidad} from "./consejo"` (`:38`, borrado en compilación) y `import {potenciarEspejos, CATALOGO_TURBO} from "./poderes-espejos"` (`:423`, interno del mismo directorio, también puro). **Sin `node:*`, sin `fs`, sin red** | `espejos.ts:38,423` + `poderes-espejos.ts:8` (solo `import type`) |

**Comprobación global del directorio `reflejo/`** (`grep -n "^import\|require(" *.ts`): los únicos `node:*` de todo el directorio están en `cargadorEspejos.ts:27-28` (`node:fs`, `node:path`) — el cargador de espejos personalizados, que es **server-only por diseño**. `consejo.ts`, `espejos.ts`, `pool.ts`, `poderes-espejos.ts`, `salud.ts` no tocan Node. Esto es exactamente la regla que rompió el build y que curó v1.1.1 (§13.4).

### 3.4 Arreglo de tipografía del cuántico (nota de auditoría)

`espejos.ts:757` emite amplitudes como `${redondear(re,4)}${im<0?"−":"+"}${redondear(Math.abs(im),4)}i` — usa el signo **menos tipográfico U+2212**, no ASCII. Es intencional (documentado en `espejos.ts:757`), pero cualquier parser externo que espere `-` debe normalizarlo. Nota para V8.

---

## 4. Motor de reflejo (votación determinista) y tablas

### 4.1 Arquitectura (HECHO)

`src/engine/reflejo/index.ts` (50 líneas) carga las tablas **por `import` de JSON** —decisión explícita para que viajen dentro de `dist/server.mjs` al empaquetar con esbuild y no exista «en producción no encuentra la tabla» (`index.ts:5-9`):

```ts
// index.ts:15-16
import lite from "./tablas-lite-v3.json";
import max from "./tablas-max-v3.json";
// index.ts:18-24
export const TABLAS: Record<"lite"|"max", Tablas> = { lite, max };
export function pensarReflejo(frase, modo: "lite"|"max" = "lite") { return pensar(frase, TABLAS[modo] ?? TABLAS.lite); }
```

`estadoReflejo()` (`index.ts:27-49`) publica: `motor:"reflejo v3.0"`, entradas y KB por modo, las **22 acciones**, `tiposPlantilla`, `unidades` y los **8 conectores de plan** (`y luego`, `después de eso`, `y después`, `luego`, `mientras (paralelo)`, `si falla`, `y al final`, `cuando termines`). Nota literal: «Cero filtro de contenido: el único 'no' es estructural (no entender lleva motivo)».

### 4.2 Las tablas: tamaños REALES medidos en disco (HECHO)

| Tabla | Tamaño en disco (v1.1.1) | Modo | Rol |
|---|---|---|---|
| `tablas-lite-v3.json` | **359.094 B ≈ 350 KB** | lite | diccionario + variantes buscadas en runtime |
| `tablas-max-v3.json` | **2.035.995 B ≈ 1,94 MB** | max | distancia 2 precalculada, sin CPU extra |
| `tablas-lite.json` | 518.358 B ≈ 506 KB | lite (v2.x) | **backup** del motor anterior |
| `tablas-max.json` | 2.265.288 B ≈ 2,21 MB | max (v2.x) | **backup** |

Cifras internas declaradas: lite v3 = **14.645 entradas**, max v3 = **82.459 entradas** (`index.ts:11-12`); el generador v3 es `scripts/gen-tablas-v3.mjs` (existe en v1.1.1, no existía en v1.0.3 → §13).

**Discrepancia documental (PROMETIDO vs HECHO):** el manual §8 sigue hablando de «lite 300–700 KB, max 2–5 MB» (rango que **sí** cumple el generador v2.4 `gen-reflejo.mjs`, §4.3), y `AGENTES_MANUAL.md:22` promete «1021 comprobaciones» mientras el CHANGELOG de v1.0 dice 1481 y el de v1.1.1 dice 1627. Son tres estados históricos distintos en el mismo documento.

### 4.3 `scripts/gen-reflejo.mjs` — las cuatro listas (HECHO, 196 líneas)

| Lista | Contenido (extracto verificable) | Línea |
|---|---|---|
| `VERBOS` | palabra → intención: `convertir/canjear/exportar/importar/traduce/cambia/pasa/convierte → convertir`; `abre/lee/muestra → abrir`; `dibuja/pinta/logo/banner/icono → imagen`; `crea/escribe/componente/plantilla → creacion`; `plan/luego/despues → plan`; `calcula/cuanto/suma/resta → calculo`; sinónimos EN (`convert/open/draw/create/calculate`) y PT mínimo (`converta/abra/desenhe/crie/calcule`) | `:75-95` |
| `CURADOS` | typos reales del usuario: `avrir→abrir`, `dibuia|dibuxa|dibhuja→dibuja`, `jenera|henera→genera`, `kalkula→calcula`, `kuanto→cuanto`, `conviert→convierte`, `hisistes→haces`, `nuebamente→nuevamente`, `capas→capaz`, `leyenda→lee`… | `:100-111` |
| `MATE` | números en letras (`cero..veinte, treinta..cien, mil, millon`) y operadores/palabras (`mas→+`, `menos→-`, `por→*`, `entre|dividido→/`, `elevado|al→^`, `raiz→sqrt`, `mitad→0.5`, `doble→2*`, `cuadrado→^2`) | `:114-122` |
| `FORMATOS` | `json, yaml, yml→yaml, toml, csv` | `:97` |
| `TECLADO` | mapa de vecinos de teclado para typos «de mano» (`a→qwsz`, etc.) usado por `variantesMano` | `:26-31` |

Generación: `variantesCompletas` = teclado + borrado + duplicado + inserción + traspósito (`:49-57`); conjugaciones reales (`:144-150`); en modo max, distancia 2 **solo sobre palabras de 6+ letras** con tope 3600/800 (`:159-164`) y justificación explícita: «a distancia 2, «plan» generaba «panel» y «read» generaba «react» — variantes que secuestraban sustantivos reales» (`:154-158`).

**La puerta del tamaño (HECHO y duro):**

```js
// gen-reflejo.mjs:182-195
const objetivos = [
  { nombre: "tablas-lite.json", max: false, minKB: 300,  maxKB: 700  },
  { nombre: "tablas-max.json",  max: true,  minKB: 2000, maxKB: 5000 },
];
… if (!dentro) process.exitCode = 1;
```

Es decir: **el generador falla si la tabla se sale del rango**. El tamaño es consecuencia, no adorno. La versión v3 (`gen-tablas-v3.mjs`) es la que está en uso en v1.1.1 y produce las tablas listadas en §4.2.

### 4.4 `POST /api/reflejo` (HECHO, `server.ts:3332-3342`)

```ts
app.post("/api/reflejo", (req, res) => {
  const frase = typeof req.body?.frase === "string" ? req.body.frase : "";
  if (!frase.trim()) return res.status(400).json({ ok:false, accion:"nada", confianza:0, modo:"lite", ms:0, motivo:"falta «frase» (texto)." });
  const modo = req.body?.modo === "max" ? "max" : "lite";   // cualquier cosa ≠ "max" cae a lite
  const r = pensarReflejo(frase, modo);
  return res.status(r.ok ? 200 : 422).json(r);
});
```

- Comentario de cabecera (`:3329-3331`): «Mismas tablas que viajan en el ZIP. `modo`: "lite" (502 KB, fuzzy en runtime) o "max" (2.2 MB, distancia 2 precalculada). **Cero filtro de contenido**».
- El código de estado distingue entender (200) de no entender (422), y **siempre** viaja `motivo`.
- `GET /api/reflejo/estado` (`:3340`) expone `estadoReflejo()`.
- Ejemplo contractual del manual (`AGENTES_MANUAL.md:47-49`): `{"frase":"cuanto es raiz de 144 mas 1","modo":"max"}` → `{ok:true, accion:"calculo", salida:"raiz de 144 mas 1 = 13", entidad:"matematico"}`.

### 4.5 Del voto a la ejecución: la cadena completa (HECHO)

```
frase  ──►  pensar(frase, TABLAS[modo])            cerebroReflejo.ts (motor, no auditado en detalle aquí)
          ├─►  DUEÑO_DE[accion | orden.tipo]        consejo.ts:403
          ├─►  pensarConsejo() → { …res, entidad }  consejo.ts:401   (ATRIBUYE y recuerda)
          └─►  ejecutarEntidad(id, datos)           consejo.ts:366   (herramienta: contrato {ok,salida|motivo,entidad,ms})
```

- El consejo **no duplica** la lógica de votación: «el motor decide; el consejo ATRIBUYE y recuerda» (`consejo.ts:400`) — decisión que salvó los 76 tests del reflejo sin tocarlos (`consejo.ts:8-9`).
- Memoria de sesión: `MEMORIA` (máx. 500 notas, **sin persistir a disco a propósito**, `consejo.ts:116-122`).
- En el plan, una tarea `reflejo` con `datos.frase` vota un especialista; sin frase ejecuta la herramienta con `datos.datos` (`AGENTES_MANUAL.md:53-58`).

### 4.6 Orquestador único (Reflejo v3.0/v5) — `reflejo/orquestador.ts` (821 líneas)

| Elemento | HECHO | Línea |
|---|---|---|
| Familias de leyes declarativas | 16 leyes curadas con ids `fis-conv, fis-expr, mat-sqrt, mat-mcd, mat-estad, mat-expr, ling-idioma, ling-legibilidad, cie-exp, cnt-qubits, cnt-superposicion, ant-codigo, ant-arte, ant-disenio, trf-area-triangulo, trf-ohm` + plantillas comentadas para extensibles | `orquestador.ts:88-330` |
| Umbral de confianza | `UMBRAL_CONFIANZA = 0.55` | `:561` |
| Margen de desempate | `MARGEN_DESEMPATE = 0.08` | `:565` |
| Comportamiento con dudas | Bajo umbral o con dos espejos distintos casi empatados → **no elige: confiesa** con `alternativas[]` (top-3) y motivo legible | `:691-712` |
| Orden de desempate documentado | estrella (≥0.95) primero, luego confianza desc, prioridad asc, **id asc** | `:611-616` |
| Leyes aprendidas | `cargarLeyesAprendidas` / `guardarLeyesAprendidas` con **fs inyectado** (`configurarFsOrquestador`, `:391`), persistidas en `.cerebro-db/leyes-aprendidas.json`; las curadas **no** se pueden desactivar por endpoint | `:427-504`; `server.ts:3965` |
| Endpoints | `GET /api/espejos/leyes`, `POST /api/espejos/orquestar[/:familia]`, `POST /api/espejos/leyes/aprender|desactivar` | `server.ts:3434,3579,3653,3895,3960` |

**Nota de honestidad del propio código** (`orquestador.ts:379-381`): el bug histórico «`require("node:fs")` dentro de un paquete ESM» hacía que las leyes aprendidas **nunca** sobrevivieran al reinicio; se cura inyectando fs desde el servidor.

### 4.7 Salud de la flota (Reflejo v5) — `reflejo/salud.ts` + `/api/espejos/*` (HECHO)

- Umbrales publicados por `GET /api/espejos/salud` (`server.ts:3444-3451`): `dormido: 0.5`, `estrella: 0.95`, `usosMinimos: 8`; nota: «dormido = no se elige solo (la ruta explícita siempre lo alcanza) · estrella = sube en el desempate».
- `POST /api/espejos/salud/dormir` siembra la tabla con `{usos:10, exitos:0}` para que el orquestador lo evite; `dormir:false` borra la evidencia (`:3453-3466`). `POST /api/espejos/salud/reset` limpia uno o toda la flota (`:3468-3475`).
- Persistencia: `.cerebro-db/espejos-salud.json` (`CHANGELOG_v1.1.0.md:46-48`).

### 4.8 GRUPO v1 — equipo por tarea (`espejos.ts:103-165`, `server.ts:3483`)

- `grupoPorTarea(texto)` es un clasificador **determinista por palabras clave** con normalización NFD sin acentos; frases valen doble (`:146`); empate o ausencia de señales → `null` («el auto no lanza monedas», `:160`).
- Vocabulario: 4 grupos con ~35 palabras cada uno (`PALABRAS_GRUPO`, `:107-112`).
- `POST /api/espejos/equipo {texto}` devuelve `{ok, eleccion, grupos, nota}`; cuando no hay señales la nota es explícita (`server.ts:3486-3491`).

### 4.9 PODERES v1 — 22 operaciones extra (HECHO, v1.0.3+)

`src/engine/reflejo/poderes-espejos.ts` (285 líneas) envuelve `.ejecutar` de los 10 espejos vía `potenciarEspejos(lista, r)` (`espejos.ts:761`, llamado **después** de definir los handlers clásicos, de modo que ningún comportamiento existente cambia). Cada espejo acepta `{accion:"…"}`; sin `accion` hace su orden clásica. Poderes citados en `CHANGELOG_v1.0.md:4-9`: estadística+IC95, resolución lineal/cuadrática con raíces complejas, matrices sum/mul/det, bases, mcd/mcm, interés compuesto (matemáticos); contraste WCAG, daltonismo ×3, gradiente (artes); dependencias, firmas, bloques duplicados (códigos); frecuencias, conversión de caso, diff de palabras (lenguajes); orden topológico + lotes por onda (planificadores); escala tipográfica modular, breakpoints (diseños); tamaño muestral, IC (científicos); entrelazamiento por concurrencia (cuántico). El catálogo completo se inyecta en el prompt con el botón **Turbo** (`espejos.ts:423-433`, `CATALOGO_TURBO`, `POST /api/consejo/turbo` en `server.ts:3393`).

---

## 5. Conductor (`POST /api/conductor`) — `server.ts:3984-4038` (HECHO)

### 5.1 La cadena, literal del código

```ts
// server.ts:3991-4037 (extracto fiel)
app.post("/api/conductor", async (req, res) => {
  const frase = String(req.body?.frase || "").trim();
  if (!frase) return res.status(400).json({ ok:false, origen:"nada", motivo:"falta «frase»." });

  const consejo = pensarConsejo(frase, TABLAS.max);                       // 1) CONSEJO PRIMERO
  if (consejo.ok && consejo.confianza >= 0.8) {
    return res.json({ ok:true, origen:"consejo", confianza: consejo.confianza,
      entidad: consejo.entidad, salida: consejo.salida,
      nota:"el director neural no se despertó: el consejo resolvió solo." });
  }
  const modelo = String(req.body?.modelo || process.env.CEREBRONICO_DIRECTOR
                 || "smollm2:135m-instruct-q3_K_S");
  const url = `${(process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/,"")}/api/generate`;
  const system = instruccionesParaElModelo() + "\n\nAhora: convierte la frase del usuario en la orden que proceda. Si no puedes, responde exactamente NO ENTIENDO y el motivo.";
  const pedir = async (prompt) => { … fetch(url, {model, system, prompt, stream:false, format:"json", signal: AbortSignal.timeout(90_000)}) … };

  try {
    let texto = await pedir(`Frase del usuario: ${frase}`);
    let ultimo = "";
    for (let reparaciones = 0; reparaciones <= 1; reparaciones++) {        // 2) UNA ronda de reparación
      const bloque = texto.includes("cerebronico:") ? texto : "```cerebronico:plan\n" + texto + "\n```";
      const { ordenes, avisos } = extraerOrdenes(bloque);                   // validación = la del chat
      if (ordenes.length >= 1 && avisos.length === 0)
        return res.json({ ok:true, origen:"director", modelo, reparaciones, bloque, ordenes });
      ultimo = avisos.join(" · ") || "el director no devolvió una orden reconocible";
      if (reparaciones === 0)
        texto = await pedir(`Tu propuesta anterior fue RECHAZADA por el validador del IDE: ${ultimo}. Responde SOLO con el JSON corregido. Frase original: ${frase}`);
    }
    return res.status(422).json({ ok:false, origen:"fallback", director:{modelo, motivo: ultimo},
      consejo: consejo.ok ? {confianza: consejo.confianza, salida: consejo.salida}
                          : {motivo: consejo.motivo || "el consejo tampoco votó"},
      motivo:"ni el consejo (confianza baja) ni el director (tras 1 reparación) produjeron una orden válida." });
  } catch (e) {
    return res.status(502).json({ ok:false, origen:"sin-director", … });
  }
});
```

### 5.2 Propiedades verificadas

| Propiedad prometida (manual §3c, `AGENTES_MANUAL.md:59-68`) | Estado | Evidencia |
|---|---|---|
| Consejo primero; con confianza ≥0.8 el neural **no se despierta** | **HECHO** | `server.ts:3994-3997` |
| Director local = Ollama `/api/generate`, `format:"json"`, timeout 90 s | **HECHO** | `server.ts:3998-4009` |
| **Una** ronda de reparación con el error exacto del validador devuelto al modelo | **HECHO** — el bucle `for (reparaciones = 0; reparaciones <= 1; …)` y el prompt de reparación incluye `ultimo` | `server.ts:4014-4024` |
| «Ningún JSON crudo del modelo llega al motor: todo pasa por `extraerOrdenes`/`validarPlan`» | **HECHO** para `extraerOrdenes` (`server.ts:4018`); `validarPlan` se aplica en `/api/brain/plan` (`server.ts:31109`), no dentro del conductor | `chatOrders.ts:348`, `server.ts:3109` |
| Fallback **declarado** con motivos de ambos | **HECHO** — `origen:"fallback"` (422) con `director.motivo` + `consejo` (salida o motivo) | `server.ts:4026-4030` |
| Si Ollama no responde → `origen:"sin-director"` (502) citando el consejo | **HECHO** | `server.ts:4031-4037` |

### 5.3 `extraerOrdenes` (HECHO)

Vive en `src/engine/chatOrders.ts:348` (`export function extraerOrdenes(mensaje): ResultadoOrdenes`). Se usa en **tres** sitios: `server.ts:4018` (conductor), `cerebroReflejo.ts:745`, y `App.tsx:2454` (navegador). Es, por tanto, el **único** contrato de entrada de órdenes — coherente con la promesa. El envoltorio de vallas ```` ```cerebronico:plan ```` se añade solo si el modelo no lo trae (`server.ts:4017`).

### 5.4 Residuos del conductor a vigilar en V8

- El modelo por defecto es un **135M** (`smollm2:135m-instruct-q3_K_S`): el propio manual declara el riesgo (`AGENTES_MANUAL.md:108-110`: «con 135M–400M fallará a veces — por eso existe la reparación y el fallback»).
- El conductor **no** lee la **selección de espejos** (`notaSeleccionEspejos()`) en su system prompt: usa `instruccionesParaElModelo()`. La nota de espejos se inyecta en el chat del navegador. La doc dice que la selección persiste «para `/api/conductor`» (`server.ts:3380-3381`); HECHO: se persiste y se expone, pero **no se consume** en este endpoint (§15-H2).

---

## 6. Planificador (tarea `reflejo`, lotes, MR, segundo plano)

### 6.1 `taskPlanner.ts` — el cerebro de tareas (801 líneas, HECHO)

Tres reglas que el código declara no romper (`taskPlanner.ts:14-26`):
- **A) TERMINAR MANDA**: nada se descarta por falta de recursos; se retrasa.
- **B) EL AGREGADO NO MIENTE**: `resumenPlan` dice cuántas y **cuáles no**, con motivo; `noTerminadas`.
- **C) NO SE ESPERA A TODAS, SE ESPERA A LA PRIMERA** (`Promise.race` sobre las promesas vivas).

| Pieza | HECHO | Línea |
|---|---|---|
| Estados de tarea (8) | `pendiente, lista, en_curso, hecha, fallida, bloqueada, cancelada, descartada` | `:57-65,126-135` |
| Estados de plan (7) | `pendiente, en_curso, pausado, hecho, parcial, fallido, cancelado` | `:115-145` |
| `pesoPorDefecto(tipo)` | `reflejo → "cpu"`; el resto `"io"` (cura del defecto v1.0.3) | `:261-263` |
| `crearPlan` | normaliza ids, estados, y aplica `pesoPorDefecto` si no hay peso declarado | `:266-289` |
| **`validarPlan`** | ids únicos; dependencias existentes; **no auto-dependencia**; **ciclos** con recorrido de tres colores (0 sin visitar / 1 en pila / 2 cerrado) y error legible `#a → #b → #a` | `:300-354` |
| `resolverListas` | recalcula listas en cada vuelta y **escribe el motivo de espera** (`espera a #2`, `bloqueada por #1 "x" (fallida)`) | `:363-393` |
| **Kahn** | `ordenTopologico` por capas: filtra los que tienen todas sus deps en `hechas`, ordena la capa, y si la capa sale vacía **rompe sin colgarse** (ciclo) | `:396-413` |
| `resumenPlan` | `{hechas, fallidas, descartadas, canceladas, bloqueadas, sinHacer[]}` | `:416-426` |
| **Cancelación inmediata** | `solicitarCancelacion` pone bandera **y despierta el bucle** vía `__despertarCancelacion` | `:437-445` |
| Reintentos | `maxIntentosPorTarea` por defecto **2**; `quota/429` espera `backoffQuotaMs` = **45 s** (drenaje de cola) en vez de reintentar al segundo | `:488, :492, :583-590` |
| Cortacircuito alimentado | `recordSuccess` al éxito y `recordFailure` solo para `retryable|timeout|offline|quota`; las cancelaciones **no** cuentan | `:48, :550, :573` |
| Bloqueo definitivo por circuito | tras `maxEsperasCircuito` (3) esperas de 5 s → `bloqueada` + `bloqueoCircuito` (no se revive, evita bucle infinito) | `:370, :490-491, :712-724` |
| Reanudación de `en_curso` huérfanas | al reanudar, las que venían `en_curso` de una ejecución interrumpida vuelven a `pendiente` con motivo | `:494-505` |
| Punto de guardado por tarea | `alTerminarTarea?.(plan, tarea)` llamado en `finally` (un fallo **también** se guarda) | `:604-614` |
| Despacho **CPU primero** | ordena las listas por peso (`cpu` antes) y luego por id numérico: «cada espejo que termina libera dependencias en milisegundos» | `:687-694` |
| Traza de presupuesto honesta | la línea de presupuesto se escribe **solo cuando cambia la firma** y lleva dentro el MOTIVO de la degradación | `:669-684` |
| Garantía de terminación | `resolverPresupuesto` devuelve `io ≥ 1 ∧ cpu ≥ 1` siempre → «siempre hay algo avanzando» | `:464-473` |

### 6.2 `memoriaResiliente.ts` — la escalera MR (282 líneas, HECHO)

| Tramo | RAM | `ioBase` | `cpuBase` | Contexto/tarea | Coste/tarea (io/cpu) | Colchón | Checkpoint | Modelo recomendado / mínimo | Tier gobernador |
|---|---|---|---|---|---|---|---|---|---|
| MR1 | 4 GB | 2 | 1 | 2048 | 0,25 / 0,4 GB | 1,0 GB | cada 2 tareas | `qwen2.5-coder:0.5b` / `qwen2.5:0.5b` | `null` |
| MR2 | 8 GB | 3 | 1 | 4096 | 0,3 / 0,5 GB | 1,5 GB | cada 3 | `qwen2.5-coder:1.5b.ollama` / `qwen2.5-coder:0.5b` | V2.0 |
| MR3 | 16 GB | 5 | 2 | 8192 | 0,4 / 0,7 GB | 2,5 GB | cada 5 | `qwen2.5-coder:7b` / `qwen2.5-coder:1.5b.ollama` | V2.2 |
| MR4 | 32 GB | 8 | 3 | 16384 | 0,5 / 0,9 GB | 4,0 GB | cada 8 | `qwen2.5-coder:14b` / `qwen2.5-coder:7b` | V2.3 |

*(`:70-144`. Los números se declaran «órdenes de magnitud para decidir, no medidas».)*

**La invariante, verificada línea a línea (`:214-273`):**
```ts
const ioPorTope  = Math.min(ioPedido, TOPES_DUROS.io);              // TOPES_DUROS = { io:16, cpu:8 }  (:166)
const cpuPorTope = Math.min(cpuPedido, TOPES_DUROS.cpu, Math.max(1, nucleos - 1));
const aprovechable = Math.max(0, ramLibreGB - perfil.margenLibreGB);
const io  = Math.max(1, Math.min(ioPorTope,  ioPorRam));            // nunca 0
const cpu = Math.max(1, Math.min(cpuPorTope, cpuPorRam));           // nunca 0
const degradado = io < ioPedido || cpu < cpuPedido;
```
y la comprobación exportada para afirmarla en tests y logs: `esPresupuestoSeguro(b)` → `io ≥ 1 && cpu ≥ 1` (`:280-282`).

- Escalado del botón: `ESCALADOS = [1,2,4,6,8]` (`:162`), `siguienteEscalado` cicla ×8→×1 (`:169-173`).
- Selección de tramo por RAM: `elegirMR` con cortes 31/15/7 GB (`:149-155`).
- El tramo **puede forzarse por encima** de la máquina y el motivo lo dice: «Tramo forzado a MR4 (32 GB) en una máquina de 8 GB: irá justo de memoria, pero termina» (`:223-229`).
- Diferencia declarada con `hardwareGovernor`: allí «esto no cabe AHORA» se recomienda esperar; aquí «no se espera: se reparte menos y se acaba» (`:24-27`).

### 6.3 `hardwareGovernor.ts` — semáforo/veredicto (228 líneas, HECHO)

- Clasificación por RAM **total**: `V2.3` ≥31 GB, `V2.2` ≥15, `V2.1` ≥11, `V2.0` resto (`:96-101`).
- Veredicto por pieza contra RAM **libre** con colchón del 15 % (`:108-130`): `embeddings` 1,0 GB, `deep_index` 0,24, `verificador` 3,5, `grafo` 0,4, `parallel_workers` 1,2, `auto_propose` 0,1.
- **Límite de honestidad explícito** (`:16-18`): «este módulo **no activa nada**. Recomienda y explica… Un gobernador que enciende cosas solo es un gobernador que miente». El código lo cumple: no hay mutación de estado en el módulo.
- Endpoint `GET /api/governor` (`server.ts:2557`).

> **OJO para V8:** el enunciado describe `hardwareGovernor` como «semáforo». **HECHO:** el semáforo real está en `planRunner.ts` (`class Semaforo`, §6.6); `hardwareGovernor` es un **medidor/recomendador**. El propio manual reconoce la división (`memoriaResiliente.ts:24-27`).

### 6.4 Peso por tramo y descarga automática del modelo (HECHO)

`scripts/instalar-modelos.mjs` (115 líneas) — función pura exportada `elegirModelo(ramGB)` (`:26-31`):

| RAM | Tag a descargar | ≈ MB | Motivo declarado |
|---|---|---|---|
| ≥ 12 GB | `smollm2:1.7b` | 1100 | «MR3/MR4: cabe el 1.7B cuantizado y deja margen al sandbox» |
| ≥ 6 GB | `smollm2:360m` | 230 | «MR2 (8 GB): el 360M entiende frases raras y typos con holgura» |
| resto | `smollm2:135m-instruct-q3_K_S` | 70 | «MR1 (4 GB): el más pequeño que sigue siendo útil; dentro del tope de 100 MB» |

Reglas probadas (`:15-21` y código): **nunca** aborta `npm install`; si Ollama no responde en **1 s** no se intenta nada y se dice por qué; `CEREBRONICO_SIN_MODELOS=1` es salto declarado; consulta `/api/tags` primero («reinstalar no re-baja»); **solo** baja el tag de su tramo (`objetivo = [escalon.tag]`, `:64`); `process.exitCode = 0` incluso con errores de descarga (`:114`). El `postinstall.mjs` lo invoca con la RAM medida (`postinstall.mjs:168-174`) y **siempre** sale en 0 (`:176-178`).

### 6.5 Intérprete de líneas del panel (HECHO) — `src/components/PlansPanel.tsx`

Formato exacto (`PlansPanel.tsx:135`): **`titulo | tipo | dato | extra | dependeDe`**.
Placeholder real de la UI (`:453`):
```
Una tarea por línea:  titulo | tipo | dato | extra | dependeDe
leer package.json | leer_archivo | package.json
paquete a YAML    | convertir    | package.json | json>yaml
dibujar el logo   | generar_imagen | logo neón minimalista | img/logo.jpg
resumir           | modelo       | Resume el archivo
```
`dependeDe` son ids separados por comas; el intérprete **devuelve también los avisos** en vez de ignorar (`:141`, y suite `panel` en `validar.mjs:30`). La UI muestra las dependencias por tarea (`:579`).

### 6.6 Segundo plano, semáforo global, escalado en caliente y Cancelar/Reanudar (HECHO)

`src/engine/planRunner.ts` (311 líneas):

| Capacidad | HECHO | Línea |
|---|---|---|
| El plan **no** vive en la petición HTTP | doc. `:1-6`; `lanzar(planId)` devuelve al instante | `:219` |
| **Semáforo global por peso** en la frontera del ejecutor | `class Semaforo` con `enUso`, `limites`, `cola{io,cpu}`; límites con mínimo 1 | `:35-50` |
| Reajuste en caliente del semáforo al cambiar ×N | declarado en cabecera `:18`; `escalar()` reajusta y libera cola | `:229-257` (usado por `/api/brain/scale`) |
| `cancelar` / `reanudar` | `cancelar` (`:258`), `reanudar` («lo ya hecho NO se repite», `:266-273`) | `:258, :266` |
| `enSegundoPlano(planId)` | informado al panel en `/api/brain/plans` | `:281`; `server.ts:3062` |
| Parada limpia del servidor | pide cancelar a todos y avisa: «al volver aparecerán PAUSADOS para reanudar» | `:290-307` |

Endpoints del panel (`server.ts`): `GET /api/brain/runner` (`:2997`), `POST /api/brain/scale` (`:3024`, sin valor cicla ×1→×2→×4→×6→×8→×1), `POST /api/brain/tramo` (`:3037`, acepta `auto` o `MR1..MR4` con validación y motivo), `GET /api/brain/plans` (`:3052`), `POST /api/brain/plan` (`:3075`, valida ciclo/dependencias antes de aceptar y **no guarda** un plan inválido), `GET /api/brain/plan/:id` (`:3131`), `.../cancel` (`:3139`), `.../resume` (`:3146`).

Promesa del manual («Mientras trabaja, la IDE sigue tuya… única verdad honesta: si un plan satura Ollama con muchas tareas `modelo`, tus chats con el MISMO modelo local pueden encolar») — se corresponde con el diseño del semáforo y con el reparto por pesos; **no** contradicha por el código.

### 6.7 Presupuesto MR en el plan de ejemplo y prueba dura (HECHO)

`tests/agentico.test.ts:119-132`: un plan con **12 tareas `reflejo` en paralelo** debe terminar `hecho` con 12/12 — evidencia de que el semáforo no frena tareas CPU de ~1 ms.

---

## 7. Extensiones — sistema caliente (`src/engine/extensions.ts` + `server.ts`)

### 7.1 Modelo de seguridad (HECHO)

Cabecera `extensions.ts:1-28` con tres decisiones explícitas: manifiesto **JSON, no código**; el IDE **nunca** ejecuta código de la extensión en su contexto (iframe sandbox + `postMessage`); **permisos explícitos**. Versión de API: `EXTENSION_API_VERSION = "2.0"` (`:30`).

**Permisos válidos** (`:33-42`): `workspace.read`, `workspace.write`, `workspace.exec`, `chat.read`, `chat.send`, `tools.register`, `network`, `storage`. Los desconocidos se **avisa y se ignoran** (no se conceden): `:145-153`; `grantedPermissions` filtra (`:179-181`).

**`validateManifest(raw)`** (`:112-176`) verifica:
- `id` con patrón `publisher.nombre` (`ID_PATTERN`, `:104`), `name`, `version` **semver** (`:105`), `main` obligatorios.
- **Anti-traversal**: `main` e `icon` no pueden contener `..`, empezar por `/` ni tener esquema (`:127-132`); lo mismo para cada `panel.entry` (`:133-143`).
- `contributes.tools`: cada tool necesita `name`, `description`, `parameters`; nombre `^[a-z][a-z0-9_]*$`; `handler` **debe** empezar por `command:` (`:155-168`).
- Avisos tolerantes: sin descripción, sin permisos (`:170-173`).

**Registro** (`ExtensionRegistry`, `:209-240`): `add/remove/get/all` y `findBySlash(slash)` que resuelve `/<slash>` o el id del comando → `{manifest, command}`.

### 7.2 Contrato de contribución (HECHO)

| Contribución | Forma | Notas |
|---|---|---|
| `commands[]` | `{id, title, description?, slash?}` | slash por defecto = última parte del id (`:188-193`) |
| `panels[]` | `{id, title, icon?, entry, position?}` | `position` por defecto **`center-tab`** (pestaña junto al Chat); alternativa `side` (`:54-63, :196-201`) |
| `tools[]` | `{name, description, parameters(JSON-Schema), handler:"command:<id>", cheap?, destructive?}` | entran al registro del agente (`:65-73, :204-206`) |
| `languages[]`, `settings[]` | declarativos | `:90-91` |

### 7.3 Server y UI (HECHO)

- Endpoints: `GET /api/extensions` (`server.ts:4871`), `POST /api/extensions/:id/enable|disable` (`:4884, :4895`), `DELETE /api/extensions/:id` (`:4902`), `GET /api/extensions/invocations` (`:5004`), `POST /api/extensions/invocations/:id/result` (`:5020`).
- Estado en disco: `ide/backend/.extensions-state.json`.
- UI: `src/components/ExtensionManager.tsx` (219 líneas) monta el gestor y la Forja (`PluginForge` importado y renderizado en `ExtensionManager.tsx:17,46`).
- **Ejemplo instalado en el repo** (HECHO): `ide/backend/extensions/` contiene **11 extensiones**: `cerebronico.panel-ejemplo` (icon.svg + manifest.json + panel.html) y los 10 plugins `cn.aduana, cn.critico, cn.embudo, cn.escriba, cn.forjador, cn.microcopy, cn.microtest, cn.pintor, cn.pliego, cn.rutas`, cada uno con `manifest.json` + `panel.html`.
- `postinstall.mjs:91-117` cuenta y valida las extensiones instaladas (id/version/main) y avisa de las rotas.

> **NO VERIFICADO por ejecución:** el aislamiento real del iframe (`sandbox`), el filtrado de permisos en el puente y el flujo `postMessage {cn:1}` se han leído en código y en los manuales, pero requieren IDE en marcha para confirmarlo end-to-end. Los manuales declaran E2E headless propio (`PLUGINS_MANUAL.md:11-13`: 203 correctas · 0 fallidas y 29 correctas · 0 fallidas), **no reproducido aquí**.

---

## 8. Forja — `mejoras/cerebronico-forja-v1` + `src/engine/pluginForja.ts`

### 8.1 Qué es (HECHO)

`pluginForja.ts:1-20`: «el SISTEMA compone el complemento, no el modelo». El modelo (o el formulario) entrega una **receta**; el compilador produce **exactamente dos archivos**: `manifest.json` y `panel.html`. Cuatro reglas declaradas y verificadas:

1. **Toda tacha se dice ANTES de escribir nada**: `normalizarReceta` acumula `motivos[]` (lista, nunca fallo seco) — `:54-105`.
2. **Slot de lógica editable** con **eco honesto** hasta que se estrene — `:181-184`.
3. **Nombres de tool prefijados** `fj_<slug>_<herramienta>`: un forjado no puede pisar a otro ni al motor — `:107`.
4. **Determinista**: misma receta = mismos bytes (los manifiestos sha256 del proyecto solo tienen sentido así) — `generarManifest`/`generarPanel` sin azar (`:113-209`).

### 8.2 Validación de receta (`normalizarReceta`) — reglas exactas

| Regla | Valor | Línea |
|---|---|---|
| `id` | `^cn\.[a-z][a-z0-9-]{1,28}$` y **no existente** en `extensions/` | `:49, :60-61` |
| `nombre` | 1–60 caracteres | `:64-65` |
| `descripcion` | 1–400 caracteres (la lee el modelo del catálogo) | `:66-67` |
| `permisos` | solo `workspace.read|write|exec`, `chat.read|send`, `storage` (`PERMISOS_FORJABLES`); `tools.register` lo añade el compilador; `extensions.register` **no** se forja | `:46-47, :69-71` |
| `herramientas` | **entre 1 y 3** («un plugin que hace de todo no hace nada») | `:73-74` |
| nombre de herramienta | `^[a-z][a-z0-9_]{2,28}$`, sin repetidos, con `descripcion` | `:50, :79-83` |
| `params` | máx. **6** por herramienta, nombre `^[a-z][a-z0-9_]{1,20}$`, tipo ∈ `string|number|boolean`, sin duplicados | `:51, :84-96` |
| `slash` | por defecto activo salvo `slash:false` | `:103` |

### 8.3 Salida compilada (HECHO)

- **`manifest.json`** (`:113-143`): `version:"1.0.0"`, `author:"Forjado por CerebroNico · FORJA v1"`, `engines.cerebronico:"^2.0.0"`, `permissions` = unión de las de la receta + `tools.register`; `contributes.panels` con `entry:"panel.html"`, `position:"center-tab"`; `contributes.commands` = `forja.abrir` (slash = slug) + una por herramienta; `contributes.tools` con `cheap:true`, `handler:"command:forja.<herramienta>"` y `parameters` JSON-Schema construido desde los params.
- **`panel.html`** (`:145-209`): HTML autocontenido con (a) el **kit del puente** idéntico al de los `cn.*` (`call()`, `postMessage {cn:1}`, `commandResult`, propagación `error||motivo`), (b) `META` con el id y la clave de localStorage `cn.forja.<id>.logica`, (c) `cargar()` que hace `new Function('nombre','params','cn',cuerpo)` y declara `lógica guardada ILEGAL` si no compila, (d) `base()` = **eco honesto** (`ok:true` con id, herramienta, params y nota «slot sin estrenar…»), (e) validación de params obligatorios y de tipos con **coacción** `"42"→42`, (f) botones Guardar / Probar primera herramienta / Quitar lógica, (g) validación con `new Function` **antes** de guardar.
- `instruccionUso(receta)` (`:219-221`) devuelve la frase de uso sin prometer clics.

### 8.4 Integración en el servidor y el chat (HECHO)

- `POST /api/extensions/forjar` (`server.ts:4793-4808`): normaliza → si hay motivos devuelve 400 con la lista; compila; **valida el manifest con el juez oficial** `validateManifest` y, si el compilador produjera un manifest inválido, devuelve 500 declarándolo «bug del sistema, repórtalo»; escribe los 2 archivos en `EXTENSIONS_DIR/<id>`.
- Herramienta del modelo: `forjar_complemento` registrada en `toolRegistry.ts:563` con ficha en `manuals.ts:144-146`; despacho en `server.ts:1696` (`case "forjar_complemento": { … }`).
- UI: `src/components/PluginForge.tsx` (138 líneas), abierta desde `ExtensionManager` (botón de forja).

### 8.5 Verificación del manual de Forja (contraste doc ⇄ código)

`MANUAL_FORJA_v1.md` (87 líneas) declara: «suite `forja` (15ª): **28 · 0**», «`npm run validar`: **1147 · 0 · 15 suites**», `POST` válido → `cn.palabras` con tool `fj_palabras_contar` en catálogo, `POST` basura → 4 motivos y cero escrituras, `DELETE` → desinstalada.

- **HECHO en código:** la suite `forja` existe y está listada (`validar.mjs:38`, `tests/pluginForja.test.ts`), y el nombre `fj_<slug>_<herramienta>` se genera exactamente así (`pluginForja.ts:107`).
- **Obsolescencia:** las cifras 1147/15 pertenecen a un estado más antiguo (v1.0.x temprano). El propio `validar.mjs` de v1.1.1 lista **27** suites, y el CHANGELOG de v1.1.1 reporta **1627**. El manual de la forja **no** fue re-actualizado tras v1.0.3. Es PROMETIDO con cifras caducadas, no incumplido.
- **HECHO (defecto cazado por su propio test, contado por el manual):** «el primer borrador de este test tenía una lógica con un `}` de menos — el panel la rechazó como ILEGAL y siguió dando eco» (`MANUAL_FORJA_v1.md:41-44`). El código lo soporta: `cargar()` envuelve en try/catch y declara `ERR_LOGICA` (`pluginForja.ts:181`).

---

## 9. Coreo, plugins, aspecto, fondo, tregua, espejos y v10 (`mejoras/*`)

Cada paquete `mejoras/*` aplica sobre el árbol `ide/backend` mediante un script `aplicar-*.mjs` con `--raiz` y `--revert`. **HECHO:** en v1.1.1 los nueve paquetes existen y su contenido está **ya aplicado** en el árbol (los archivos destino existen con el mismo contenido lógico).

### 9.1 `cerebronico-coreo-v1` — COREO (la pantalla baila)

| Afirmación | Estado | Evidencia |
|---|---|---|
| 11 acciones con icono, verbo en gerundio, animación y color | **HECHO** | `src/engine/coreo.ts:27-39`: `pensar 🧠 latido`, `planificar 🗺 orbita`, `espejo 🪞 escaneo`, `escribir ✍ tecleo`, `convertir 🔁 escaneo`, `imagen 🖼 chispa`, `forjar ⚒ chispa`, `verificar 🔍 escaneo`, `bloqueado ⛔ sacudida`, `entregar 📦 brillo`, `actividad • quieto` |
| Clasificador línea-de-narración → acción, con prioridad | **HECHO** | `CLASIFICADOR` con 10 regex ordenadas (`:61-72`): «NO se guardó» → `bloqueado` aunque hable de imagen |
| Anillo de 14 eventos + bus por poll | **HECHO** | `ANILLO_MAX = 14` (`:43`), `notificar` (`:48-54`), `GET /api/coreo` (`server.ts:4869`) |
| Espina de Actividad de 26 px al pie, fija, sin alterar layout | **HECHO** | `EspinaActividad.tsx:79` (`fixed bottom-0 h-[26px]`) + parche `pointer-events-none` de `aplicar-v10.mjs:33-36` |
| Reposo explícito, no desaparición | **HECHO** | `EspinaActividad.tsx:82`: «en reposo · esperando la primera orden» |
| `prefers-reduced-motion` apaga animaciones sin apagar información | **HECHO** | `coreo.ts:137-140` |
| 11 acciones ≈ «11 acciones con icono y movimiento» del enunciado | **HECHO** (son 11 exactas) | `coreo.ts:27-39` |
| «el cerebro del Header» reacciona por `CustomEvent("cn:coreo")` y `window.__cnCoreo` | **HECHO parcial** | `EspinaActividad.tsx:48-50` emite y publica; la coreografía fina por acción está declarada como **v1.1 pendiente** en el propio comentario (`:49`) y en `COREO_MANUAL_v1.md` («ya soporta `thinking`: la coreografía fina del BrainThinkingIcon por acción es v1.1 declarada») |

### 9.2 `cerebronico-plugins-v1` — 10 plugins `cn.*`

| Plugin | Slash | Herramienta del modelo | Qué hace | Estado |
|---|---|---|---|---|
| `cn.embudo` 💻 | `/embudo web mi-nombre` | `cn_embudo_crear` | Andamia web/api/componente jsx | HECHO (manifest+panel en `extensions/` y en `mejoras/…/plugins/`) |
| `cn.pliego` 📋 | `/pliego una idea` | `cn_pliego_generar` | `CREACION.md` + borrador de plan con tareas `reflejo` | HECHO |
| `cn.forjador` 🔨 | `/forjar nombre:string,edad:int(18,90)` | `cn_forjador_datos` | Dataset reproducible + `mock-x.mjs` | HECHO |
| `cn.pintor` 🎨 | `/pintar #3a6ea5` | `cn_pintor_aplicar` | Armonías HSL → `cn-palette.css` + `<link>` inyectado | HECHO |
| `cn.microcopy` ✂️ | `/microcopy` | `cn_microcopy_ana` | Textos visibles + Flesch + tono | HECHO |
| `cn.rutas` 🧭 | `/rutas` | `cn_rutas_vigilar` + `cn_rutas_stub` | Imports/href/src rotos y creación de contornos | HECHO |
| `cn.critico` 🔍 | `/criticar` | `cn_critico_pasar` | 9 reglas adversarias → ENTREGABLE/REVISAR/NO | HECHO |
| `cn.microtest` 🚬 | `/smoke` | `cn_microtest_correr` | `tests/smoke.mjs` + ejecución node | HECHO |
| `cn.escriba` 📜 | `/documentar` | `cn_escriba_documentar` | README desde estado real; no pisa ajeno sin `forzar:true` | HECHO |
| `cn.aduana` 🛃 | `/aduana` | `cn_aduana_revisar` | Bloquea secretos + firma `ENTREGA/MANIFIESTO_SHA256.txt` con `crypto.subtle` | HECHO |

Validador propio: `scripts/validar-plugins.mts` (`validar.mjs:45`) — usa el `validateManifest` del IDE como fuente única.
**E2E headless:** `mejoras/cerebronico-plugins-v1/e2e-headless.mts` existe (PROMETIDO en manual: 29·0; no ejecutado aquí).
**Hueco declarado por el propio manual** (`PLUGINS_MANUAL.md:19-22`): «el host no expone método `entidad.run` — un panel no puede llamar a un espejo directamente (por eso microcopy reimplementa Flesch). Anótalo para v2.6: permiso `entities.use`». → **Nota directa para V8:** esto es deuda arquitectónica identificada, con la solución ya propuesta en el repo.
**Nota de tupla:** los plugins no tienen MANUAL individual, el manual es único (`PLUGINS_MANUAL.md`, 99 líneas) y en v1.1.1 **no había carpeta `cerebronico-plugins-v1/MANUAL_INSTALACION…`** pero sí `instalar-plugins.mjs`.

### 9.3 `cerebronico-aspecto-v1` — «A» Aspecto (fuente/tamaño/color **por sección**)

| Afirmación | Estado | Evidencia |
|---|---|---|
| Cambia SOLO el texto, sección por sección (no escala la interfaz en rem) | **HECHO** | `aspecto.ts:1-23` (crítica explícita al `html{font-size}` de v1.9) |
| 6 secciones: general ◱, chat 💬, editor 📝, explorador 🗂, paneles 🧩, cabecera 🎩 | **HECHO** | `aspecto.ts:42-49` |
| Tamaño 70–220 % con anclaje por `data-cn` | **HECHO** | `TAM_MIN=70`, `TAM_MAX=220` (`:51-52`); `anclaje()` (`:163`) |
| Multiplicación general × sección | **HECHO** | `hojaAspecto`: `calc(${tok.base} * var(--cn-fs-seccion) * var(--cn-fs-general))` (`:168, :172`) |
| Fuente: 4 pilas de sistema + heredar (cero descargas) | **HECHO** | `FUENTES` (`:56-62`): heredar, sistema, mono, serif, legible (Atkinson+Verdana) |
| Color: **solo neutros**; los acentos se conservan a propósito | **HECHO** | `NEUTROS` (`:104-107`) y generación (`:181-185`); 11 muestras + heredar (`:65-78`) |
| Inventario de tokens vigilado por test (si la UI estrena una clase, el test peta) | **HECHO** | `TOKENS_TAMANO` 14 tokens (`:86-101`); declarado en `:80-85`; suite `aspecto` (`validar.mjs:44`) escanea `src/` |
| Persistencia `localStorage cn.aspecto.v1`, hoja re-entrante `<style id="cn-aspecto-hoja">` | **HECHO** | `:189-206`; `:209-221` |
| UI | **HECHO** | `src/components/PanelAspecto.tsx` (160 líneas), montado en `Header.tsx:35,504` |

### 9.4 `cerebronico-fondo-v1` + ADUANA de tamaños + TREGUA

| Afirmación | Estado | Evidencia |
|---|---|---|
| Aduana de tamaños por formato: **gif ≤ 4 MB · mp4/webm ≤ 8 MB** (jpg/jpeg 4 MB en v1.1) | **HECHO** | `fondo.ts:20-31` (`LIMITES_BYTES`), `TIFOS_FONDO` con gif/mp4/webm/jpg/jpeg |
| Contención al proyecto: sin `/` inicial, sin letras de unidad, sin `..`, ruta relativa | **HECHO** | `fondo.ts:48-61`; `dentroDe()` (`:35-38`) |
| Motivos completos por formato inválido (no un 400 mudo) | **HECHO** | `fondo.ts:60` |
| Streaming (el motor no lo tiene en RAM) | **HECHO** (doc + endpoints `GET/POST/DELETE /api/fondo`) | `fondo.ts:8-10`; `server.ts:4823-4868` |
| Fondo por defecto = `public/fondo-predeterminado.jpg` | **HECHO** | `ide/backend/public/fondo-predeterminado.jpg` existe; `aplicar-v10.mjs` copia el asset |
| TREGUA sandbox↔chat: el volcado **cede el lazo** cada N archivos y el piloto AUTO **pausa el sync** mientras hay chat | **HECHO (lógica pura)** | `sandboxTregua.ts:20-40`: `cedeElLazo(indice, cada=8)`, `debePausarSync(streamingActivo)`, `avisoPausaSync()`; y decisión explícita de que el **sync manual nunca** se pausa (`pausarSyncManual` → `false`, `:38-40`, «constante deliberada: documenta la decisión, no el olvido») |
| Uso real de la tregua en el servidor | **HECHO** | `server.ts` marca `/*TREGUA*/` en `/api/fs/write` (`:5970`), `/api/fs/sync` (`:6138`) y `/api/fs/read` (`:6309`) |
| Suite propia | HECHO | `tests/sandboxTregua.test.ts` (42 líneas), suite `tregua` (`validar.mjs:43`) |

### 9.5 `cerebronico-espejos` (paquete) y `cerebronico-editor-v1`

- `cerebronico-espejos`: aporta `src/engine/reflejo/espejos.ts`, `src/components/EspejosSelector.tsx`, `tests/espejos.test.ts` + MANUAL_INSTALACION_SEGURA + PLAN_EJECUCION. **HECHO:** los tres archivos existen en el árbol con la lógica descrita en §3.
- `cerebronico-editor-v1`: aporta `src/components/ConsejoPanel.tsx`, `src/engine/consejoVista.ts`, `src/engine/ollamaPugil.ts` + tests. **HECHO:** existen y están en uso (`Header.tsx:36`, `validar.mjs:41-42`).
- `cerebronico-tregua-v1`: paquete de la tregua (§9.4). **HECHO:** existe la carpeta `mejoras/cerebronico-tregua-v1` en v1.1.1 (y ya en v1.0).

### 9.6 `cerebronico-v10` — ¿build/icono? (HECHO)

**No es un módulo de runtime**: es el **paquete de versionado/renombrado y assets**. Contenido real en v1.1.1:

| Archivo | Función | Línea/nota |
|---|---|---|
| `aplicar-v10.mjs` | Instalador de la capa **CEREBRÓNICO v1.0** («el gran renombrado»): marca en constants/index.html/package.json/productName/modal, **FOCO v1** (`pointer-events-none` en la Espina), fondo por defecto, recursión en dos pasos, FONDO v1.1 (jpg/jpeg); copia assets y renombra docs | `:1-8`, `:33-36` |
| `aplicar-v101.mjs` / `aplicar-v102.mjs` / `aplicar-v103.mjs` | Capas incrementales (v1.0.1 Batilos, v1.0.2 espejos, v1.0.3 PODERES — este último **copia `poderes-espejos.ts`** y envuelve los `.ejecutar`) | `aplicar-v103.mjs:1-8` |
| `poderes-espejos.ts` | Asset fuente de los 22 poderes | idéntico al del árbol de v1.1.1 |
| `renombrar-docs.mjs` | Barrido de documentación | — |
| `assets/build/icon.png`, `assets/build/ICONO.txt` | Icono del EXE | **HECHO**: `ide/backend/build/icon.png` + `icon.ico` existen; `package.json.build.win.icon = "build/icon.ico"` |
| `assets/public/fondo-predeterminado.jpg` | Fondo por defecto | **HECHO**: existe en `ide/backend/public/` |

**Respuesta a la pregunta del enunciado («v10: ¿build/icono?»):** sí, además del renombrado: `v10` **es** la capa de build/icono/fondo por defecto, y su efecto es verificable en `package.json` (`build.win.icon`, `productName: "CerebróNico"`, `appId: com.cerebronico.ide`) y en la presencia de los assets.

---

## 10. Persistencia: `.cerebro-db/` y endpoints del consejo

### 10.1 Qué vive en `.cerebro-db/` (HECHO)

Raíz de datos: `PROJECT_ROOT` (en Electron, `PROJECT_DIR` → userData; cura documentada en `CHANGELOG_v1.1.0.md:9` of «instalación por-máquina perdía escrituras»).

| Archivo | Qué guarda | Quién lo escribe | Sobrevive reinicio |
|---|---|---|---|
| `entidades.json` | `{activas:{id:boolean}, en}` — solo el botón de las 38 herramientas | `POST /api/consejo/entidad` (`server.ts:3368-3375`) | **SÍ** (`:3351-3355` re-aplica al arrancar) |
| `espejos.json` | `SeleccionEspejos` = `{grupo, espejos[], en}` | `POST /api/consejo/espejos` (`server.ts:3711-3713`) | **SÍ** (`:3382-3390` carga con `normalizarSeleccion`; si es inválida **declara** y arranca sin grupo) |
| `espejos-salud.json` | tabla de salud de la flota (Reflejo v5) | `guardarSalud()` (`server.ts:3464, 3473`) | **SÍ** |
| `leyes-aprendidas.json` | `{leyes:[…], en}` — leyes `prioridad ≥ 100` | `POST /api/espejos/leyes/aprender` (`:3895`), `/desactivar` (`:3960`) | **SÍ** — cura explícita del bug ESM (§4.6) |
| `kb.json` | `{version:2, entries:[], seededBy:"postinstall"}` sembrado; luego conocimiento del motor | `postinstall.mjs:52-64`; endpoints `/api/engine/kb*` (`server.ts:2778,4252,4263,4273`) | **SÍ** (el postinstall **conserva** si ya existe, `:59-61`) |
| `fondo.<ext>` | copia del fondo activo, servido en streaming | `POST /api/fondo` (`server.ts:4828`) | SÍ |
| `planes.json` (vía `taskStoreFs`) | planes con estados, tareas, log y `alTerminarTarea` como punto de guardado | `planRunner`/`taskStoreFs.ts` (239 líneas) | **SÍ** — y al reiniciar quedan **`pausado`** y reanudables (`planRunner.ts:290-307`) |
| `~/.cerebronico/espejos/` (¡fuera de `.cerebro-db`!) | espejos personalizados `.mjs` + `manifest.json` | `inicializarPool` (`server.ts:3734-3752`) | SÍ (carga al arranque, `import()` dinámico) |

**Memoria que NO sobrevive (por diseño declarado):** `MEMORIA` del consejo (500 notas, `consejo.ts:116-118`: «no persiste a disco a propósito — para eso está knowledgeBase/planes.json»).

### 10.2 Endpoints del consejo/espejos (HECHO, `server.ts`)

| Método | Ruta | Qué hace | Línea |
|---|---|---|---|
| GET | `/api/consejo/estado` | catálogo vivo (50), cuentas y nota | `3360` |
| POST | `/api/consejo/entidad` | `{id, activa}` → cambia y persiste; 400 con motivo si es especialista o no existe | `3364` |
| POST | `/api/consejo/turbo` | enciende/apaga el catálogo de poderes en el prompt | `3393` |
| GET | `/api/consejo/espejos` | `estadoEspejos()`: 10 espejos, 4 grupos, selección, modos | `3398` |
| POST | `/api/consejo/espejos` | fija selección (motor + disco) con validación | `3707` |
| GET | `/api/espejos/leyes` | catálogo de leyes activas (curadas + aprendidas) | `3434` |
| GET/POST | `/api/espejos/salud[/dormir\|/reset]` | salud de la flota | `3444, 3453, 3468` |
| POST | `/api/espejos/equipo` | `grupoPorTarea(texto)` | `3483` |
| POST | `/api/espejos/orquestar[/:familia]` | aplica leyes a una frase | `3579, 3653` |
| GET/POST | `/api/espejos/personalizados`, `/instalar`, `/desinstalar` | pool de espejos `.mjs` | `3758, 3773, 3878` |
| POST | `/api/espejos/leyes/aprender`, `/desactivar` | leyes aprendidas | `3895, 3960` |
| POST | `/api/reflejo`, GET `/api/reflejo/estado` | motor determinista | `3332, 3340` |
| POST | `/api/conductor` | frase → plan | `3991` |

### 10.3 Discrepancia de rutas de espejos personalizados (HECHO, hallazgo)

- **Servidor:** `PROJECT_ROOT/.cerebronico/espejos` (`server.ts:3734`).
- **Mensaje de error al usuario:** `~/.cerebronico/espejos/` (`consejo.ts:388`).
- **Manual:** `~/.cerebronico/espejos/` (`ESPEJOS_PERSONALIZADOS.md`, §1; `AGENTES_MANUAL.md:121` en el texto de referencia general).
→ El mensaje de ayuda apunta a una carpeta que **no** es la que el servidor lee. Impacto: bajo funcionalmente, alto en soporte. Anotado para V8 (§15-H5).

---

## 11. Frontend agéntico — componentes y comportamiento

### 11.1 Espina de Actividad (COREO)

| Requisito del enunciado | Componente / línea | HECHO |
|---|---|---|
| 11 acciones con icono y movimiento | `src/engine/coreo.ts:27-39` (tabla `ACCIONES`) + `EspinaActividad.tsx` | Sí |
| Franja de 26 px al pie, poll 700 ms | `EspinaActividad.tsx:57, :79` | Sí |
| Chip vivo + últimos 4 atenuados | `:85-86` (`cn-coreo-live` y `opacity-70`) | Sí |
| Reposo declarado, caída declarada | `:81-82` («⛔ el motor no contesta (reintento cada 700 ms)», «en reposo…») | Sí |
| Bus para otros órganos | `:48-50` (`CustomEvent("cn:coreo")` + `window.__cnCoreo`) | Sí |
| Montaje sin alterar layout | `App.tsx:3323` + FOCO v1 (`pointer-events-none`, `pb-[26px]`) | Sí |
| Movimiento por acción (CSS puro, testeable en node) | `coreo.ts:116-142` (`hojaCoreoCss()`: latido, órbita, escaneo, tecleo, chispa, sacudida, brillo) | Sí |
| Accesibilidad | `coreo.ts:137-140` (`prefers-reduced-motion`) | Sí |

### 11.2 «⚡ Consejo»

| Requisito | Componente / línea | HECHO |
|---|---|---|
| Modal con los 12 votantes a la vista | `src/components/ConsejoPanel.tsx:93-99` (lista + texto «los especialistas no se duermen») | Sí |
| Botones despertar/dormir | `:58-68` (iconos `Sun`/`Moon`, `POST /api/consejo/entidad`, motivo en pantalla `:41`) | Sí |
| Selector de grupos de espejos **reutilizado** (no duplicado) | `:18, :87` (`<EspejosSelector />`) | Sí |
| Montaje | `Header.tsx:36, 662` | Sí |
| Agrupación honesta de las 3 listas | `ConsejoPanel.tsx:90-92` (`g.espejos`, `g.dormidas`, `g.despiertas`) desde `engine/consejoVista.ts` (53 líneas) | Sí |
| Portal al `body` (z-orden) | `:12, :76-77` (`createPortal`, marca `/*ZORD*/`, con el motivo escrito: dentro del Header el modal nacía recortado) | Sí |

### 11.3 «A» Aspecto

Panel `src/components/PanelAspecto.tsx` (160 líneas), montado en `Header.tsx:35, 504`; controles por sección (tamaño 70–220 %, fuente, color) alimentando `engine/aspecto.ts` (§9.3). **HECHO.**

### 11.4 «Ⓐ Forjar» en la UI

- `src/components/PluginForge.tsx` (138 líneas), abierto desde el Gestor de extensiones: `ExtensionManager.tsx:17` (import) y `:46` (render condicional con `onForjado` → recarga).
- Componente de núcleo relacionado: `src/components/SelfImprovementPanel.tsx` y `PluginForge.tsx` coexisten; la Forja es la vía declarada por el manual (`MANUAL_FORJA_v1.md:16-21`: «Por Gestor: «⚒ Forjar» en `ExtensionManager` abre `PluginForge`… con formulario de receta + preview de nombres `fj_<slug>_<herramienta>`»).

### 11.5 Fondo animado: aduana de tamaños y tregua sandbox↔chat

- Aduana de tamaños: `engine/fondo.ts` (§9.4) — **HECHO**, con límites por formato y motivos completos.
- Capa: `src/components/FondoLayer.tsx` (139 líneas) + `src/components/AppBackground.tsx` (61 líneas: imagen personalizada con **prioridad** sobre el preset; si no hay ni imagen ni preset, no pinta nada — `AppBackground.tsx:31`).
- Tregua: `engine/sandboxTregua.ts` (§9.4) — el piloto AUTO **posa** el sync mientras un chat transmite y **avisa**; el sync manual nunca se pausa (`:38-40`).
- **Nota de arquitectura (HECHO):** conviven **dos** sistemas de fondo: el «fondo animado» de FONDO v1 (`FondoLayer`) y el `AppBackground` de ProSettings/Presets. Son capas distintas, no un único sistema; V8 debería unificarlas (§15-H5).

### 11.6 Badge «📎 embeddings» y selector de modelos

| Requisito | Evidencia | HECHO |
|---|---|---|
| Detección de embedders vs chat | `src/engine/ollamaPugil.ts:17` (familias `snowflake-arctic-embed|nomic-embed|minilm|mpnet|bge|mxbai-embed|sensenova-embed|bce-embed|jina-clip|e5-|bge-m3|embed`), `:23-30` (`/api/show` → `capabilities`/`model_architecture` bert·embed·minilm **manda** sobre el nombre), `:44` (`tipoDeModelo` → `"embeddings"` \| `"chat"`) | Sí |
| Explicación del 400 de Ollama **antes** de gastarlo | `ollamaPugil.ts:39` — texto literal que se muestra al usuario: ««X» es un modelo de EMBEDDINGS, no de chat: produce vectores numéricos… Ollama lo rechaza con HTTP 400 si le pides texto… No está roto: está para otra cosa» | Sí |
| Badge en la lista de modelos | `ModelSelectorModal.tsx:809-816` y **repetido** en `:817-824` (bloque JSX duplicado, ambos con `/*PUGIL*/`) | Sí — **con defecto cosmético** (badge duplicado) |
| El embedder no se puede seleccionar para conversar | `ModelSelectorModal.tsx:788, :796` (`esEmbed` → `if (esEmbed) return;` con comentario «un embedder no se elige para conversar») | Sí |
| Grupo de espejos **dentro** del selector de modelos | `ModelSelectorModal.tsx:31` (import) y `:769` (`<EspejosSelector />`, justo debajo de los filtros) | Sí |
| Selector de grupos: ∅ Ninguno / 4 grupos / ★ Todos + ajuste fino por espejo | `EspejosSelector.tsx:94-115` | Sí |
| Doble guardado (localStorage + motor) con aviso si falla uno | `EspejosSelector.tsx:53-71` (los cuatro desenlaces tienen mensaje propio) | Sí |

---

## 12. Tests: `scripts/validar.mjs` y las suites

### 12.1 Estructura (HECHO, `validar.mjs`, 229 líneas)

1. **Puerta 1 — tipos**: ejecuta `tsc --noEmit` como **paso obligatorio** dentro de `validar` (no solo en `npm run lint`); si falta el compilador **no se salta en silencio: para** (`:144-165`, con la historia del 19-sep-2026 y los 7 defectos reales que aparecieron así).
2. **27 suites** declaradas en `SUITES` (`:24-52`), cada una con `{id, archivo, que}`.
3. Localización de CLIs sin depender de `npx`: `cliDeTsx()` (`:61-67`), `cliDeTsc()` (`:75-81`).
4. **Extracción del veredicto por expresión regular** sobre la salida de cada suite: `(\d+) correctas` / `(\d+) fallidas`; caso especial `roundtrip` («N perfectas / N SILENCIOSAS») (`:97-106`).
5. **Tres condiciones para el verde**: `erroresTipos === 0 && totalMal === 0 && suitesEnRojo === 0` (`:206`). El comentario explica el agujero que se tapó: «una suite fantasma imprimía «0 FALLOS» y el veredicto decía TODO CORRECTO» (`:177-189`).

### 12.2 Las 27 suites (HECHO)

| # | id | Archivo | Qué comprueba |
|---|---|---|---|
| 1 | `planner` | `tests/planner.test.ts` | grafo, dependencias, paralelismo, cancelación |
| 2 | `store` | `tests/store.test.ts` | apagón a mitad, reparación, escritura atómica |
| 3 | `runner` | `tests/runner.test.ts` | segundo plano y semáforo global |
| 4 | `roundtrip` | `tests/roundtrip.test.ts` | ida y vuelta de formatos, pérdidas silenciosas |
| 5 | `export` | `tests/export.test.ts` | exportar la app creada a Android |
| 6 | `panel` | `tests/panel.test.ts` | intérprete de tareas del panel: avisa en vez de ignorar |
| 7 | `chatOrders` | `tests/chatOrders.test.ts` | órdenes del chat → conversor → editor → preview |
| 8 | `guard` | `tests/guard.test.ts` | guardián de escritura |
| 9 | `resiliencia` | `tests/resiliencia.test.ts` | lecciones convertidas en guardián |
| 10 | `imagen` | `tests/imagen.test.ts` | imágenes gratis, cadena de proveedores, cortacircuito |
| 11 | `reflejo` | `tests/reflejo.test.ts` | frases con typos → órdenes válidas; escalera de modelos |
| 12 | `agentico` | `tests/agentico.test.ts` | las 50 entidades, el botón de dormidas, tarea `reflejo` en el planificador |
| 13 | `espejos` | `tests/espejos.test.ts` | los 10 espejos, sus grupos con selector y el paralelo real |
| 14 | `forja` | `tests/pluginForja.test.ts` | receta→complemento, slot de lógica, puente del chat |
| 15 | `coreo` | `tests/coreo.test.ts` | clasificador, anillo, vocabulario de movimiento |
| 16 | `fondo` | `tests/fondo.test.ts` | aduana de fondos (tipos, tamaños, contención) |
| 17 | `consejo` | `tests/consejo.test.ts` | agrupar el consejo, dormir/despertar, línea honesta |
| 18 | `pugil` | `tests/ollamaPugil.test.ts` | embedders vs chat: el 400 explicado antes de gastarlo |
| 19 | `tregua` | `tests/sandboxTregua.test.ts` | cesión, pausa y aviso |
| 20 | `aspecto` | `tests/aspecto.test.ts` | hoja determinista de texto por sección + inventario vivo |
| 21 | `plugins` | `scripts/validar-plugins.mts` | los 10 `cn.*`: manifest oficial, handlers, slash, protocolo |
| 22 | `espejosPers` | `tests/espejos-personalizados.test.ts` | pool de espejos `.mjs`, manifiestos, recarga en caliente |
| 23 | `aduana` | `tests/sandboxCompat.test.ts` | ADUANA v2: python/rust/go/java/docker/make… |
| 24 | `boveda` | `tests/boveda.test.ts` | transporte de imagen al disco real con `INDICE.json` |
| 25 | `reflejo5` | `tests/reflejo5.test.ts` | salud, confianza del enrutado, leyes aprendidas que sobreviven |
| 26 | `imagen5` | `tests/imagen-v5.test.ts` | el reintento prometido: congestión, 4xx, cancelación |
| 27 | `grupo` | `tests/grupo.test.ts` | equipo por tarea, carril cpu, despacho cpu-primero |

**Verificación cruzada de la evolución de suites:** v1.0.0 = **21** suites; v1.1.1 = **27** (las 6 nuevas: `espejosPers`, `aduana`, `boveda`, `reflejo5`, `imagen5`, `grupo`) — coherente con §13.

### 12.3 La suite `espejos` — «72 comprobaciones»: **CONFIRMADO (HECHO)**

`tests/espejos.test.ts` contiene **62 llamadas `comprobar(...)` fuera de bucles** + **1 llamada dentro de `for (const id of IDS_ESPEJOS)`** (`:47-50`) que se ejecuta **10 veces** → **72 comprobaciones efectivas**. Composición:

| Bloque | Comprobaciones | Línea |
|---|---|---|
| 1. Catálogo: 50 totales, 40 de v2.5 conservados, 10 espejos, ids únicos, 10 espejos despiertos, 20/18, `estadoConsejo` | 7 | `:36-44` |
| 2. Regla de hierro: cada espejo sin datos responde `ok:false` **con motivo** | 10 (bucle) | `:47-50` |
| 3. Valores REALES por espejo (Bell 50/50, complementaria del azul = `#ffff00`, `2·c = 599584916`, `1.5 km → 1500 m`, `raiz(144)+1 = 13`, `mcd(12,18,24)=6 / mcm=72`, factorización de 360, rombo → lotes `[1,2,1]`, ciclo rechazado…) | 41 | `:55-126` |
| 4. Sinergia: la salida de `espejo.artes` se interroga con `datos.json-ruta` | 1 | `:126` |
| 5. Grupos y selector: 4 grupos, ids válidos, `espejosDelGrupo`, normalización con motivo, `IDS_SELECCION` de 8, `estadoEspejos`, nota al prompt, nota vacía sin selección | 13 | `:129-143` |
| 6. Plan de 10 espejos: paralelo real, plan `hecho`, cada entidad ejecutó, < 2,5 s totales | 4 | `:168-170` |
| 7. Chat: tarea con espejo aceptada / espejo inexistente rechazado; instrucciones del modelo con el equipo activo | 3 | `:175-180` |

Ejemplos de aserciones literales destacables (útiles como *golden values* para V8):
- `espejo.artes` complementaria del azul → `#ffff00` (`:65`); áurea ≈ 61,8 (`:66`).
- `espejo.disenios` ancho 1440 → **6 columnas** y escala 8pt que incluye 8 y 64 (`:70`).
- `espejo.fisicos` `2·c` → `599584916` (`:103`); conversión imposible se declara **en la salida** sin fallar (`:106`).
- `espejo.planificadores` **invariante en los 4 tramos**: `io ≥ 1 ∧ cpu ≥ 1 ∧ io ≤ 16` con 1 núcleo (`:87-88`).
- `espejo.cuantico` Bell: `p(00)=0.5, p(11)=0.5, p(01)=0`, norma 1 (`:117`); 9 qubits → motivo (`:120`).

### 12.4 Los «contratos numéricos» estilo «conserva + delta» (HECHO)

`tests/agentico.test.ts:30-43` (cabecera del bloque y aserciones):

```
// ESPEJOS v1: la cuenta creció a 50. Se aserta CONSERVAR los 40 de v2.5
// y luego el delta — congelar la cifra total convertiría cada crecimiento en un falso roto
comprobar("50 entidades", ENTIDADES.length === 50)                                  // :34
comprobar("conserva los 40 de v2.5", …length === 40)                                // :35
comprobar("12 especialistas + 38 herramientas (10 espejos)", esp===12 && herr===38) // :38
comprobar("ids únicos", new Set(...).size === 50)                                   // :39
comprobar("20 herramientas activas por defecto (10 de v2.5 + 10 espejos)", …===20)  // :41
comprobar("18 dormidas esperan su botón", …===18)                                   // :42
comprobar("estadoConsejo cuadra con el registro", total 50 / activas 20 / dormidas 18) // :43
```

También hay *golden values* criptográficos y de unidades (`:64` sha256 de `"abc"`; `:69` `km→m = 1500`; `:72` contraste blanco/negro = `21.00:1` y AA SÍ). Y una vuelta a los valores por defecto **al final del test** (`:78`): `cambiarActivacion(id, false)` sobre 5 herramientas y luego reposición — los tests **mutan estado global** del catálogo y lo restauran; relevante si V8 ejecuta suites en paralelo.

### 12.5 Cómo se ejecutan — y por qué no se pudo reproducir aquí

```bash
npm run validar      # → node scripts/validar.mjs   (package.json scripts.validar)
npm test:e2e         # → python3 tests/comprehensive_e2e_test.py
npm run reflejo      # → node scripts/gen-reflejo.mjs   (regenera tablas y valida rangos)
npm run modelos      # → node scripts/instalar-modelos.mjs
npm run lint         # → tsc --noEmit
```
`predev` encadena `gen-reflejo.mjs && gen-modelfile.ts` antes de `dev` (`package.json:28`).

**NO VERIFICABLE EN ESTE ENTORNO (declarado):** ninguna de las 5 carpetas contiene `node_modules` (comprobado: `ls -d node_modules` → ausente en v1.1.1). Por tanto **no** he ejecutado `validar`, `tsc` ni las suites; los conteos «1627 · 0 · 27» y «1481 · 0 · 21» son **cifras declaradas por el CHANGELOG**, no medidas aquí. Todo lo asertado en este informe proviene de lectura de código y de conteo estático (p. ej. el 72 de §12.3, contado a mano sobre el archivo).

---

## 13. DIFF entre versiones — qué archivo cambió en cada salto y qué significa

Metodología: `diff -rq <versionA> <versionB>` excluyendo `node_modules`. Volcado íntegro en la sesión de auditoría; aquí se resume cada línea con su significado funcional.

| Salto | Nº de diferencias | Solo en destino (añadidos) | Modificados |
|---|---|---|---|
| v1.0 → v1.0.1 | **14** | 4 | 10 |
| v1.0.1 → v1.0.2 | **13** | 2 | 11 |
| v1.0.2 → v1.0.3 | **14** | 3 | 11 |
| v1.0.3 → v1.1.1 | **43** | 21 | 22 |

### 13.1 v1.0 → v1.0.1 — «la prueba Batilos Record» (`CHANGELOG_v1.0.md:51-69`)

| Archivo | Tipo | Funcionalidad que representa |
|---|---|---|
| `ide/SEGURIDAD_CREDENCIALES.md` | **AÑADIDO** | Checklist de sellado: el instalador ya no empaqueta `.env` (se sacó de electron-builder para no incrustar claves reales en el EXE) |
| `MEMORY.md` | **AÑADIDO** (en la raíz) | Memoria del proyecto versionada |
| `mejoras/cerebronico-v10/aplicar-v101.mjs` | **AÑADIDO** | Instalador de esta capa |
| `ide/backend/package.json` | MOD | versión → 1.0.1 (+ scripts/puertas de la capa) |
| `ide/backend/server.ts` | MOD | orden visible en el chat central (el canal directo escondía la orden del Editor web → «no hizo nada»), consola del sandbox limpia, PROPIO-IDE por ruta de producción |
| `ide/backend/src/App.tsx` | MOD | publicación de la orden/respuesta en el chat + FOCO v2 (reset al perder foco de ventana: `userSelect:none` congelado) |
| `ide/backend/src/components/RightSidebar.tsx` | MOD | saneo de la consola del sandbox (no resucita sesiones viejas de localStorage) |
| `unificar-mejoras.mjs`, `CHANGELOG_v1.0.md`, `MANIFIESTO_SHA256_v1.0.txt`, `IDEA_DEL_MOTOR_v2.0.md`, `PLAN_V2.1_V2.2.md`, `RESULTADO_PRUEBAS_MOTOR.txt` | MOD | hashes/docs |
| `changelog-v10.mjs` | **ELIMINADO** | utilidad de una sola vez |

### 13.2 v1.0.1 → v1.0.2 — «la era de los espejos» (`CHANGELOG_v1.0.md:23-47`)

| Archivo | Tipo | Funcionalidad |
|---|---|---|
| `ide/backend/build/icon.ico` | **AÑADIDO** | Icono EXE multi-tamaño (16→256) declarado en `build.win.icon` |
| `mejoras/cerebronico-v10/aplicar-v102.mjs` | **AÑADIDO** | Instalador de la capa |
| `ide/backend/src/engine/reflejo/espejos.ts` | MOD | `espejo.codigos` ampliado con `simbolosLista` (hasta 24 nombres reales) + prompt de grupo espejo |
| `ide/backend/src/engine/toolRegistry.ts` | MOD | herramienta **`consultar_espejo`** documentada: el modelo puede llamar espejos en **lotes de hasta 8** |
| `ide/backend/src/engine/manuals.ts` | MOD | manuales y juez de recetas al día con los espejos |
| `ide/backend/src/constants.ts` | MOD | versión visible V1.0.2 (fuente única) |
| `ide/backend/src/utils/engine.ts` | MOD | OLLAMA v2: reintentos 2/4/6 s (proxy) y 2 s (directo), 4 intentos (~14 s) — «un ECONNREFUSED casi siempre es Ollama ARRANCANDO» |
| `ide/backend/server.ts` | MOD | endpoint/plumbing asociado |
| `ide/backend/package.json` | MOD | versión 1.0.2 |
| `CHANGELOG_v1.0.md`, `MEMORY.md`, `MANIFIESTO_SHA256_v1.0.txt`, `unificar-mejoras.mjs` | MOD | docs/hashes |

### 13.3 v1.0.2 → v1.0.3 — «PODERES: los espejos explotados» (`CHANGELOG_v1.0.md:3-21`)

| Archivo | Tipo | Funcionalidad |
|---|---|---|
| `ide/backend/src/engine/reflejo/poderes-espejos.ts` | **AÑADIDO** | **22 poderes** deterministas en 8 espejos + `potenciarEspejos` + `CATALOGO_TURBO` |
| `mejoras/cerebronico-v10/poderes-espejos.ts` + `aplicar-v103.mjs` | **AÑADIDOS** | Asset + instalador de la capa |
| `ide/backend/src/engine/reflejo/espejos.ts` | MOD | import + llamada `potenciarEspejos(lista, r)` al final de `crearEspejos` |
| `ide/backend/src/components/Header.tsx` | MOD | botón **🚀 Turbo** en cabecera |
| `ide/backend/src/engine/manuals.ts`, `toolRegistry.ts` | MOD | `consultar_espejo` documenta sus poderes; error amable lista los disponibles |
| `ide/backend/src/constants.ts`, `package.json`, `server.ts` | MOD | versión V1.0.3 + endpoint `POST /api/consejo/turbo` |
| `CHANGELOG_v1.0.md`, `MEMORY.md`, `MANIFIESTO_SHA256_v1.0.txt`, `unificar-mejoras.mjs` | MOD | docs/hashes |

### 13.4 v1.0.3 → v1.1.1 — Reflejo v5 + BUILD v1 (el salto grande: 43 diferencias)

**Añadidos (21):**

| Archivo nuevo | Qué aporta |
|---|---|
| `ide/backend/src/engine/reflejo/orquestador.ts` | **Orquestador único**: 16 leyes curadas, fs inyectado, leyes aprendidas, confianza 0.55 / margen 0.08 |
| `ide/backend/src/engine/reflejo/salud.ts` | Salud de flota (Laplace, estrella ≥0.95, dormido <0.5, ≥8 usos) |
| `ide/backend/src/engine/reflejo/cargadorEspejos.ts` | Carga de espejos personalizados `.mjs` desde `.cerebronico/espejos/` (server-only: `node:fs`) |
| `ide/backend/src/engine/reflejo/pool.ts` | **Estado puro** del pool (la cura del BUILD v1) |
| `ide/backend/src/engine/reflejo/tablas-lite-v3.json` (359 KB) / `tablas-max-v3.json` (2,03 MB) | Tablas v3 (14.645 / 82.459 entradas) |
| `ide/backend/scripts/gen-tablas-v3.mjs` | Generador de las tablas v3 |
| `ide/backend/src/engine/bovedaLocal.ts` | BÓVEDA v1: transporte de imagen al disco real indexado |
| `ide/backend/src/engine/sandboxCompat.ts` | ADUANA v2: 18 tipos de proyecto |
| `ide/backend/tests/{boveda,espejos-personalizados,grupo,imagen-v5,reflejo5,sandboxCompat}.test.ts` | **6 suites nuevas** (21 → 27) |
| `ide/backend/package-lock.json` | Lockfile (reproducibilidad de instalación) |
| `CHANGELOG_v1.1.0.md`, `CHANGELOG_v1.1.1.md`, `CREDENCIALES.md`, `ESPEJOS_MANUAL.md`, `ESPEJOS_PERSONALIZADOS.md` | Documentación de la era v5 |

**Modificados (22, los relevantes):**

| Archivo | Cambio funcional |
|---|---|
| `src/engine/reflejo/consejo.ts` | Import del pool **desde `./pool` (puro)** en lugar del cargador — línea 24 con el comentario de la cura; soporte de espejos personalizados en `ejecutarEntidad` |
| `src/engine/reflejo/index.ts` | Tablas **v3** por `import` en vez de `readFileSync`; `estadoReflejo` con 22 acciones/conectores |
| `src/engine/taskPlanner.ts` | `pesoPorDefecto` (reflejo→cpu), campo `grupo`, despacho CPU-primero, cancelación que despierta el bucle |
| `src/engine/chatOrders.ts` | Ajustes de órdenes (grupo/leyes) |
| `src/engine/cerebroReflejo.ts` | Motor v3.0/v5 (acciones, plantillas, units, fechas) |
| `src/engine/imageGen.ts` | **IMAGEN v5**: reintentos con backoff y clasificación de congestión (`intentos`; default 1 = contrato viejo; 3 en chat, 2 en planes) |
| `src/engine/planExecutors.ts` | Reintentos/despacho acordes a v5 |
| `src/engine/projectPorter.ts` | ADUANA v2 + `buscarProyectoAnidado` |
| `src/App.tsx`, `src/components/{ChatCenter,Header,PanelAspecto}.tsx` | UI v5 (consulta de espejos, Turbo, Aspecto, salud) |
| `server.ts` | Orquestador + salud + equipo + bóveda + espejos personalizados + IMAGEN v5 (≈ +1.500 líneas respecto a v1.0.3) |
| `scripts/validar.mjs` | 21 → 27 suites |
| `tests/espejos.test.ts`, `tests/reflejo.test.ts` | Ampliados |
| `electron-main.cjs`, `agent_bridge_5000.py`, `README.md` | PROJECT_DIR/userData; transporte de imagen; docs |
| `MEMORY.md`, `package.json` | Memoria y versión 1.1.1 |

### 13.5 Lectura de la evolución (qué significa cada salto)

```
v1.0.0  ── marca + FOCO + icono + fondo por defecto + recursión educada   (producto, no motor)
v1.0.1  ── canal del Editor web VISIBLE + FOCO v2 + operación sin .env    (fiabilidad de UI/seguridad)
v1.0.2  ── consultar_espejo en lotes + símbolos reales + OLLAMA v2        (los espejos pasan a ser herramientas del modelo)
v1.0.3  ── 22 PODERES + TURBO                                             (profundidad de los espejos)
v1.1.0  ── orquestador, salud, GRUPO, bóveda, ADUANA v2, IMAGEN v5, tablas v3, espejos personalizados  (autonomía + fiabilidad)
v1.1.1  ── BUILD v1: inversión de dependencia (pool.ts) para que `vite build` no reviente
```

Es decir: **el núcleo agéntico maduró de "votación de entidades" (v1.0.x) a "enrutado por leyes con confianza + flota medida + pool extensible en caliente" (v1.1.x)**, mientras el producto solo cambió de envoltorio. Para la fusión V8, la materia prima agéntica útil está **entera** en v1.1.1.

### 13.6 La cura de BUILD v1 (detalle técnico, HECHO)

`CHANGELOG_v1.1.1.md:1-27`: el `npm run build` del propietario moría en vite/rollup con `"existsSync" is not exported by "__vite-browser-external"` porque `consejo.ts` —que **viaja al bundle del navegador** (`chatOrders → consejo`)— importaba `buscarEnPool`/`poolListo` desde `cargadorEspejos.ts`, módulo que toca `node:fs`. La cura **no** fue un parche de bundler sino **inversión de dependencia**: nace `pool.ts` (100 % puro, sin fs ni path) y el cargador **re-exporta** su API («la firma pública no cambia y `server.ts` no necesitó ni una línea de ajuste»). Verificado: `pool.ts:6-17` lo declara («Reglas de hierro: sin fs, sin path, sin red, sin `node:*`») y `consejo.ts:24` importa del pool. Puertas declaradas: vite ✓ (2010 módulos) + esbuild ✓ + `validar` 1627 · 0 · 27 + `tsc` 0 errores.

---

## 14. Límites declarados (AGENTES_MANUAL §7) — verificados en código

| # | Límite declarado (`AGENTES_MANUAL.md:103-110`) | Estado | Evidencia |
|---|---|---|---|
| 1 | «Las herramientas de máquina (`maq.*`, `datos.hash`, `datos.uuid`) corren en el **SERVIDOR** (Node); en el navegador **responden por qué no**» | **HECHO** | `consejo.ts:35-48`: interface `PrimitivasSistema` + `configurarSistema()` + `sinSistema(id)` que devuelve `ok:false` con motivo literal «mide el SISTEMA: solo corre en el servidor de Cerebrónico (Node), no en el navegador». Las 5 herramientas afectadas (`maq.ram`, `maq.cpu`, `maq.tramo`, `datos.hash`, `datos.uuid`) comprueban `if (!SISTEMA) return sinSistema(...)` (`:218, :222, :254, :259, :264`). El servidor las inyecta en la raíz de composición; los tests también (`espejos.test.ts:22-23`) |
| 2 | «El investigador **no navega**: da esqueletos de plan, no resultados» | **HECHO por diseño** | `investigador` es una ficha sin ejecutor ni rama de red (`consejo.ts:93`); su descripción dice «Sin red no investiga: lo declara». **No existe** ninguna herramienta de red en el catálogo de 50 (`ejecutar` solo en las 38 herramientas, todas locales). El investigador **no** tiene rama en `DUEÑO_DE` (§2.2): tampoco vota |
| 3 | «El lingüista **no traduce**: limpia y cuenta; traducir es del neural» | **HECHO** | `consejo.ts:92` (descripción literal). Riesgo detectado: el vocabulario del reflejo incluye `traduce/traducir/tradusi` → intención **`convertir`** (`gen-reflejo.mjs:77, :109`), no una entidad «traductor». Cumple el límite: traducir se resuelve por conversión estructural o por el modelo, no por el lingüista |
| 4 | «El conductor depende de lo bueno que sea tu director local; con 135M–400M fallará a veces — por eso existe la reparación y el fallback» | **HECHO** | `server.ts:3998` (default 135M) + bucle de 1 reparación (`:4014`) + `origen:"fallback"` 422 con motivos (`:4026`) + `origen:"sin-director"` 502 (`:4031`) |
| 5 (manual §8) | «Ningún camino te da **juicio**… el reflejo más fino seguirá siendo determinista (esa es su virtud y su techo)» | **HECHO** | Los 10 espejos son funciones puras sin modelo; el único camino con «juicio» es el director neural o la nube (`server.ts:3998-4010`) |
| 6 (manual §8) | «Las herramientas de máquina solo corren en el servidor; una extensión en el navegador **no puede medir RAM del PC**» | **HECHO** | Un panel vive en iframe con `postMessage`; los permisos (`extensions.ts:33-42`) **no** incluyen `system.read`; no existe API de medición expuesta al panel. La única vía es `exec`/`workspace.*` según permisos |
| 7 (manual §8-camino 2) | «El camino 2 requiere `npm run validar` en verde ANTES de producción: el catálogo tiene contratos numéricos (40/12/28/10) y los tests los vigilan» | **HECHO** | Contratos en `tests/agentico.test.ts:34-43` con la regla «conserva + delta» (§12.4) |

**Límite declarado que NO se sostiene tal cual (PROMETIDO/inexacto):**

| Afirmación | Realidad en código |
|---|---|
| `AGENTES_MANUAL.md:5` «10 espejos `espejo.*` con **grupos por tarea**» dentro del anexo v2.6.3 | **HECHO en v1.1.1** (GRUPOS_ESPEJOS + `grupoPorTarea`), pero el anexo mezcla dos estados (§1.2). No es incumplimiento, es documentación desfasada |
| `ESPEJOS_PERSONALIZADOS.md:4-8` «Paso 2 **no implementado todavía**» | **INCUMPLIDO en el sentido contrario**: está implementado (cargador + pool + 4 endpoints + suite). El documento protege de menos, no de más |
| `consejo.ts:388` «manifest en `~/.cerebronico/espejos/`» | El servidor lee `PROJECT_ROOT/.cerebronico/espejos` (`server.ts:3734`) |
| Manual §2 «12 especialistas votantes (**siempre activos**) … Votan sobre frases igual que el reflejo v2.4» | **Maticemos:** los 12 son inmortales como entidad, pero solo **7 acciones** tienen dueño mapeado en `DUEÑO_DE`; 5 fichas (linguista, investigador, validador, telemetria, memorista) no reciben votos por acción. «Siempre activas» ≠ «siempre votantes» |

---

## 15. Hallazgos y notas para la fusión V8

| # | Hallazgo | Severidad | Evidencia | Acción sugerida en V8 |
|---|---|---|---|---|
| **H1** | **Doble fuente de versión**: `constants.ts` dice `V1.0.3`, `package.json` dice `1.1.1`, `AGENTES_MANUAL` describe v2.5/2.6.3, CHANGELOGs hablan de Reflejo v3.0/v5 | Alta (confusión operativa) | `constants.ts:190`, `package.json:4`, `AGENTES_MANUAL.md:1-16` | Unificar en **una** constante de build inyectada (p. ej. desde `package.json`) y regenerar el manual con un solo ANEXO por release |
| **H2** | La **selección de espejos** se persiste «para `/api/conductor`» pero el conductor **no la consume** | Media (promesa de arquitectura) | persistencia `server.ts:3711`; consumo ausente en `server.ts:3994-4024` | Inyectar `notaSeleccionEspejos()` en el `system` del director y usarla para filtrar leyes del orquestador |
| **H3** | **5 de los 12 «especialistas votantes» no votan**: no tienen rama en `DUEÑO_DE` | Media (contrato del catálogo) | `consejo.ts:75-83, 85-98` | O bien darles acciones propias, o reclasificarlos como «fichas de dominio» en el estado público (hoy `estadoConsejo` los lista como votantes) |
| **H4** | Metadatos sucios: `reg()` acepta `dominio` pero `proyecto.rutas-sanas` y `memorista.registrar` declaran `datos`; los comentarios de bloque cuentan 8/8/4/4 cuando hay 7/7/3/3; el 4.º argumento `activa` de `reg()` es **ignorado** por la línea `:339` | Baja (riesgo de auditoría futura) | `consejo.ts:134,176,252,301,313,321,334-339` | Hacer que `ACTIVAS_POR_DEFECTO` sea **la** fuente y retirar el parámetro `activa` (o usarlo como «valor sugerido») para que no engañe |
| **H5** | Rutas y capas duplicadas: espejos personalizados en `~/.cerebronico` (mensaje) vs `PROJECT_ROOT/.cerebronico` (código); **dos** sistemas de fondo (`FondoLayer` vs `AppBackground`/ProSettings); badge `📎 embeddings` **renderizado dos veces** | Baja-media | `consejo.ts:388` vs `server.ts:3734`; `AppBackground.tsx` vs `FondoLayer.tsx`; `ModelSelectorModal.tsx:809-824` | Unificar rutas por una constante `PATHS`, unificar fondo en una sola capa, borrar el bloque JSX duplicado |
| **H6** | **Hueco de extensibilidad ya identificado por el propio repo**: el host no expone `entidad.run`, así que un panel no puede invocar un espejo (microcopy reimplementa Flesch) | Media (deuda de diseño) | `PLUGINS_MANUAL.md:19-22` | Implementar permiso `entities.use` + método en `ExtensionPanelView` que llame `ejecutarEntidad(id, datos)`; elimina duplicación de lógica de espejos |
| **H7** | **Cancelación/planificación robusta pero con estado global mutable en tests**: las suites `agentico`/`espejos` cambian activación de entidades y la restauran; `MEMORIA` y `TABLA_SALUD` son módulo-level | Media (si V8 paraleliza suites) | `tests/agentico.test.ts:78`; `consejo.ts:118`; `salud.ts` + `orquestador.ts:551` | Aislar estado por inyección (factoría de consejo) antes de paralelizar tests |
| **H8** | El **motor de reflejo** es el único componente sin auditoría de detalle aquí (no lo pedía el objetivo) pero **todo** depende de él: 82.459 entradas en `tablas-max-v3.json` | Media | `reflejo/index.ts:15-16`, `cerebroReflejo.ts` (no auditado línea a línea) | Auditoría específica de `cerebroReflejo.ts` + `gen-tablas-v3.mjs` antes de fusionar |
| **H9** | Los **espejos con `accion`** (PODERES) conviven con la orden clásica sin discriminador explícito de versión: un llamador que envíe `accion` por error cambia semántica | Baja | `poderes-espejos.ts:1-4` | Declarar `espejoVersion` en la respuesta o separar en `espejo.<x>.poder` |
| **H10** | Los **contratos numéricos son incompletos**: `validar` vigila 50/12/38/20/18 pero no el **número de leyes curadas (16)**, ni los 22 poderes, ni las 27 suites | Baja | `tests/agentico.test.ts:34-43`; `orquestador.ts:88-330` | Añadir aserciones «conserva + delta» para leyes/poderes/suites (mismo patrón que ya funciona) |

### 15.1 Qué de esta línea conviene preservar en V8 (juicio de auditor)

1. **La regla de oro documental y su vigilancia por tests**: «CONSERVA + delta» + `validar` como puerta única (tipos + suites + suites que no arrancan). Es lo que ha hecho que 6 saltos en 2 días no rompan nada.
2. **`resolverPresupuesto` con invariante `io≥1 ∧ cpu≥1`**: es la garantía de terminación de todo plan. No debe relajarse.
3. **El contrato único `{ok, salida|motivo, entidad, ms}`** y la «regla de hierro» del motivo: es lo que hace que el sistema sea auditable y que un fallo nunca sea silencioso.
4. **La inversión de dependencia de `pool.ts`** como patrón general: separar estado puro de cargadores con fs. Aplicable a V8 para cualquier módulo que viaje al navegador.
5. **El despacho CPU-primero + `pesoPorDefecto`**: pequeña línea de código, gran efecto (espejos de 1 ms no bloquean al modelo).

### 15.2 Riesgos si V8 fusiona sin leer esto

- Fusionar contra `AGENTES_MANUAL.md` (línea base v2.5, 40 entidades, 1021/1479 comprobaciones) haría perder los **10 espejos, el orquestador, la salud, el pool y 6 suites**: el manual describe **dos releases por detrás** del código.
- Tomar `constants.ts:190` como fuente de versión produciría builds etiquetados `V1.0.3` desde código 1.1.1.
- Confiar en `ESPEJOS_PERSONALIZADOS.md` («no implementado») llevaría a **reimplementar** lo ya hecho.

---

## 16. Matriz resumen HECHO / PROMETIDO

| Área | Afirmación del enunciado / manual | Veredicto | Prueba principal |
|---|---|---|---|
| Catálogo | 50 entidades (12 + 38) con `reg()` | **HECHO** | `consejo.ts:129,343`; `tests/agentico.test.ts:34-38` |
| Catálogo | 10 despiertas de v2.5 + 18 con botón | **HECHO** (20 activas totales con los espejos) | `consejo.ts:334-339`; `tests/espejos.test.ts:42` |
| Espejos | 10 espejos con contrato JSON | **HECHO** | `espejos.ts:442-759` |
| Espejos | Cuántico 8 qubits | **HECHO** | `espejos.ts:703` |
| Espejos | Idioma <15 palabras → desconocido | **INEXACTO** (el umbral real es `score===0`) | `espejos.ts:490-494` |
| Espejos | GRUPOS_ESPEJOS + `notaSeleccionEspejos()` | **HECHO** | `espejos.ts:64-101, 231-248` |
| Espejos | «CERO imports de runtime» | **HECHO** (solo tipos + módulo interno puro) | `espejos.ts:38,423`; `poderes-espejos.ts:8` |
| Reflejo | Tablas lite 300–700 KB / max 2–5 MB, generador que falla fuera de rango | **HECHO para v2.4** (`gen-reflejo.mjs:182-195`); en v1.1.1 se usan v3 (350 KB / 1,94 MB) con los v2.x como backup | `gen-reflejo.mjs`; `index.ts:15-16`; `ls -l tablas-*` |
| Reflejo | `/api/reflejo` con `modo` lite/max | **HECHO** | `server.ts:3332-3342` |
| Conductor | consejo ≥0.8 → director local + 1 reparación → fallback declarado | **HECHO** | `server.ts:3991-4037` |
| Conductor | `extraerOrdenes`/`validarPlan` como único paso al motor | **HECHO** para `extraerOrdenes`; `validarPlan` aplica en `/api/brain/plan` | `chatOrders.ts:348`; `server.ts:4018, 3109` |
| Planificador | Lotas paralelos por Kahn + rechazo de ciclos | **HECHO** | `taskPlanner.ts:300-413`; `espejos.ts:600-610` |
| Planificador | Invariante `io≥1·cpu≥1·io≤16` | **HECHO** | `memoriaResiliente.ts:239-282`; `tests/espejos.test.ts:87-88` |
| Planificador | Tramos MR + elección de modelo por tramo + postinstall que baja solo el que toca | **HECHO** | `memoriaResiliente.ts:70-144`; `instalar-modelos.mjs:26-64`; `postinstall.mjs:168-174` |
| Planificador | Segundo plano + semáforo | **HECHO** | `planRunner.ts:1-50, 219-307` |
| Planificador | Cancelar/Reanudar | **HECHO** | `taskPlanner.ts:437-445`; `planRunner.ts:258-273`; `server.ts:3139-3150` |
| Planificador | Intérprete `titulo \| tipo \| dato \| extra \| dependeDe` | **HECHO** | `PlansPanel.tsx:135, 453` |
| Planificador | Escalado ×N (1/2/4/6/8) en caliente | **HECHO** | `memoriaResiliente.ts:162`; `server.ts:3024`; `PlansPanel.tsx:375-378` |
| Extensiones | manifest con commands/tools/panels, iframe aislado, botón «Ext» | **HECHO** (contrato y UI; aislamiento no ejecutado aquí) | `extensions.ts:33-96, 112-240`; `ide/backend/extensions/` (11) |
| Forja | `forjar_complemento` con receta, slot de lógica, eco honesto | **HECHO** | `pluginForja.ts:54-221`; `server.ts:1696, 4793`; `toolRegistry.ts:563` |
| Coreo | 11 acciones con icono y movimiento, Espina al pie, tregua | **HECHO** | `coreo.ts:27-142`; `EspinaActividad.tsx:79`; `sandboxTregua.ts:20-40` |
| Plugins | 10 complementos `cn.*` | **HECHO** (archivos); E2E/validador propios declarados, no ejecutados aquí | `mejoras/cerebronico-plugins-v1/plugins/*`; `validar.mjs:45` |
| Aspecto | «A» fuente/tamaño/color **por sección** | **HECHO** | `aspecto.ts:26-221`; `PanelAspecto.tsx` |
| v10 | build/icono + renombrado + fondo por defecto | **HECHO** | `aplicar-v10.mjs:1-36`; `package.json build.win.icon`; assets presentes |
| Persistencia | `.cerebro-db/` con entidades/espejos/kb | **HECHO** (+ salud, leyes, planes, fondo) | `server.ts:3347-3377, 3382-3390, 3711`; `postinstall.mjs:52-64` |
| Frontend | ⚡ Consejo, A Aspecto, Ⓐ Forjar, 📎 embeddings, selector con grupos | **HECHO** (con el defecto del badge duplicado) | `ConsejoPanel.tsx`, `PanelAspecto.tsx`, `PluginForge.tsx`, `ModelSelectorModal.tsx:769,809-824` |
| Tests | 21 suites / 1479 comprobaciones (ANEXO) | **ESTADO ANTIGUO**: v1.0.x = 21 suites/1481; v1.1.1 = **27 suites**, 1627 declaradas | `validar.mjs:24-52`; `CHANGELOG_v1.1.1.md:29` |
| Tests | Suite `espejos` = 72 comprobaciones | **HECHO** (62 llamadas + bucle de 10) | `tests/espejos.test.ts` |
| Tests | Contratos numéricos «conserva + delta» | **HECHO** | `tests/agentico.test.ts:30-43` |

---

## 17. Inventario de archivos clave auditados (para la fusión)

| Ruta (v1.1.1, relativa a `ide/backend/`) | Líneas / tamaño | Rol |
|---|---|---|
| `src/engine/reflejo/consejo.ts` | 421 | Catálogo 12 + 28, contrato, activación, persistencia de botones |
| `src/engine/reflejo/espejos.ts` | 764 / 42 KB | 10 espejos + grupos + selector + utilidades puras |
| `src/engine/reflejo/poderes-espejos.ts` | 285 / 20 KB | 22 poderes + `CATALOGO_TURBO` |
| `src/engine/reflejo/orquestador.ts` | 821 / 38 KB | 16 leyes curadas + aprendidas + confianza |
| `src/engine/reflejo/pool.ts` / `cargadorEspejos.ts` | 117 / 205 | Estado puro del pool (BUILD v1) / carga con fs |
| `src/engine/reflejo/salud.ts` | 129 | Salud de flota |
| `src/engine/reflejo/index.ts` | 50 | Carga tablas v3 y expone el pensador |
| `src/engine/reflejo/tablas-*-v3.json` | 350 KB / 1,94 MB | Diccionarios del motor |
| `src/engine/taskPlanner.ts` | 801 | Grafo, ciclos, lotes, despacho, cancelación |
| `src/engine/memoriaResiliente.ts` | 282 | Escalera MR e invariante |
| `src/engine/hardwareGovernor.ts` | 228 | Medición y veredictos (no activa nada) |
| `src/engine/planRunner.ts` | 311 | Segundo plano + semáforo global |
| `src/engine/taskStore.ts` / `taskStoreFs.ts` | 370 / 239 | Validación/estados y persistencia de planes |
| `src/engine/extensions.ts` | 240 | Manifiestos, permisos, registro |
| `src/engine/pluginForja.ts` | 221 | Compilador de complementos |
| `src/engine/coreo.ts` | 142 | Vocabulario visual + animaciones |
| `src/engine/aspecto.ts` | 221 | Hoja CSS por sección |
| `src/engine/fondo.ts` | ~110 | Aduana de fondos |
| `src/engine/sandboxTregua.ts` | ~45 | Cesión de lazo y pausa del sync |
| `src/engine/ollamaPugil.ts` | ~60 | Embedders vs chat |
| `scripts/validar.mjs` | 228 | Puerta única (27 suites + tipos) |
| `scripts/gen-reflejo.mjs` / `gen-tablas-v3.mjs` | 195 / — | Generadores de tablas con puerta de tamaño |
| `scripts/postinstall.mjs` / `instalar-modelos.mjs` | 178 / 115 | Instalación de cortesía que nunca aborta |
| `server.ts` | **8.238** | Todos los endpoints; raíz de composición |
| Componentes | `EspinaActividad` 94, `ConsejoPanel` 106, `EspejosSelector` 123, `PanelAspecto` 160, `PluginForge` 138, `FondoLayer` 139, `AppBackground` 61, `ExtensionManager` 219, `PlansPanel` ~600, `ModelSelectorModal` 899, `ChatCenter` 1.079, `App.tsx` 3.817 | UI agéntica |

---

## 18. Cierre metodológico

- **Fuentes:** lectura directa de 30+ archivos de código y 9 documentos; 4 `diff -rq` completos entre carpetas de versión; conteo estático de llamadas de test (`grep -c`) para verificar el «72» de la suite de espejos.
- **No ejecutado (declarado):** `npm run validar`, `tsc`, E2E headless de plugins, suites individuales, build de vite/esbuild, ningún endpoint HTTP. Motivo: ausencia de `node_modules` en las cinco copias auditadas. Todas las cifras de puertas (1479/1481/1627, 21/27 suites) son **declaradas por CHANGELOG**, no medidas aquí.
- **Criterio HECHO/PROMETIDO:** HECHO = existe la construcción en el archivo citado con la línea exacta. PROMETIDO/INEXACTO = la afirmación no se corresponde literalmente con el código (se indica siempre la divergencia y la línea donde se ve).
- **Alcance no cubierto (explícito):** `cerebroReflejo.ts` (motor de scoring línea a línea), `sandbox`/preview, imagen/RAG/nube (auditorías paralelas de la línea), Electron y empaquetado. Se marcan como H8 en §15.
