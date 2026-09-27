# HOJA DE DATOS — ERRORES CORREGIDOS Y MEJORAS APLICADAS

> Registro de la evolución de **CerebróNico** hasta **V0.9**.
> Regla de la casa: **aquí solo entra lo verificado**. Cada línea tiene su
> comprobación o su comando. Lo que no se pudo probar, se dice que no se pudo.
>
> Última actualización: 22-sep-2026 · Estado: **V0.9** (semilla `0.9.0`)

---

## 1. Estado de la validación (V0.9)

| Comprobación | Resultado |
|---|---|
| `npm run lint` (`tsc --noEmit`) | **0 errores** |
| `npm run validar` | **2254 comprobaciones · 0 fallos · 36 suites · 0 sin correr** |
| `npm run build` | correcto (Vite + esbuild) |
| **`npm start` ejecutado de verdad** | **HTTP 200 en :3000**, `<title>CerebróNico V0.9</title>` |
| Puente Python | arrancado: `puente 5000 listo en http://127.0.0.1:5000` |
| Motor de conocimiento | `95 entradas de fábrica` · `16 leyes curadas` |
| Endpoint `/api/proyecto/espejo` | responde y detecta el tipo de proyecto |

---

## 2. V0.9 — Renombrado de versión

### 2.1 La decisión de diseño

La versión **ya no se escribe**: se deriva de una única semilla.

```
const VERSION_SEMVER  = "0.9.0";                       ← el único literal
const VERSION_ETIQUETA = `V${VERSION_SEMVER.replace(/\.0$/, "")}`;   → "V0.9"
```

Se necesitan dos formas —`0.9.0` para `package.json`, `V0.9` para la pantalla— y
la tentación era tener dos literales. **Eso es exactamente el defecto que costó
media sesión** («la cabecera dice V8.0.0 y el menú CN dice V1.0.3»): dos datos que
pueden contradecirse sin que nada avise. Derivar la etiqueta hace imposible que
divergir.

### 2.2 Archivos actualizados

| Archivo | Antes | Ahora |
|---|---|---|
| `src/constants.ts` | semilla `8.0.9`, dos literales | semilla `0.9.0`, etiqueta derivada |
| `package.json` | `"version": "8.0.9"` | `"version": "0.9.0"` |
| `index.html` | `V8.0.9` × 4 (title, description, og:title, og:description) | `V0.9` |
| `dist/` (recompilado) | `V8.0.9` | `V0.9` — verificado en el bundle y servido |
| `server.ts` | **`"soy el modo demo de CerebroNico V1"`** | `${IDE_BRAND.FULL_NAME}` |
| `markdownExport.ts:137` | **`"generado por CerebroNico V2.1 IDE"`** en el informe exportado | `${IDE_BRAND.FULL_NAME}` |
| 12 archivos más (cabeceras de comentario) | «CerebroNico V2.1» ×13 | «CerebroNico V0.9» |
| `Header.tsx`, `GlobalErrorBoundary.tsx`, `BrainThinkingIcon.tsx` | comentarios «V2.1» | «V0.9» |

### 2.3.1 🐞 Y seguía habiendo literales fuera de `constants.ts`

Los dos primeros que encontré fueron el saludo del modo demo y **`markdownExport.ts`
línea 137** — el **tercer** literal de versión en ese mismo archivo: los otros dos
se arreglaron en v8.0.1 y éste quedó vivo. Está dentro del informe que el usuario
**exporta y reenvía**, así que el producto declaraba una versión falsa en un
documento que salía de él.

Y 13 cabeceras de comentario repartidas en 12 archivos. Invisibles para el
usuario, pero son exactamente «referencias a la versión»: si el registro dice
V2.1 en catorce sitios, el siguiente que lea el código creerá que hay catorce
cosas por migrar.

**Queda uno a propósito:** `src/main.tsx:9` cita «CerebroNico V2.1» para explicar
un defecto histórico. Cambiarlo falsearía la explicación. Un registro honesto
conserva la cita de lo que pasó; lo que no puede es repetirla como si fuera
actual.

### 2.3 🐞 Un literal de versión que nadie vigilaba

```ts
`Hola, soy el modo demo de **CerebroNico V1**. …`
```

Estaba en el **saludo que lee el usuario** cuando no hay clave API. Decía **V1**.
Es el mismo defecto de la discrepancia de versiones, escondido donde nadie lo
buscaba: el servidor **no importaba** `IDE_BRAND`. Ahora sí, y sale de la fuente
única.

### 2.4 🐞 «V8» significa DOS cosas distintas en este proyecto

Al renombrar encontré que **«V8» no es la versión del producto**: es la
**generación de la arquitectura** de espejos y agentes. Aparece en
`aspectoV8.test.ts`, `V8 · D1`, `V8 · D3`, «51 entidades (V8: +generalista)».

**Decisión: NO se renombra.** Cambiar esos «V8» por «V0.9» sería mezclar dos
conceptos distintos y dejaría el código mintiendo de otra manera. Si algún día
estorba, la corrección correcta es renombrarlos a algo que no sea un número de
versión (`ARQ-ESPEJOS`, por ejemplo), no a otra versión.

Mismo criterio para `ARQUITECTURA_CEREBRONICO_V8.md`: el «V8» de ese nombre es la
generación de arquitectura, no la versión del producto.

---

## 3. 🐞 Defecto corregido: `npm start` no podía arrancar

`package.json` declara:

```json
"start": "node dist/server.mjs"
```

Y **`dist/server.mjs` no estaba en el paquete**. Se había excluido por paridad con
el ZIP original (que tampoco lo traía), con el resultado de que el comando `start`
—el que promete arrancar el producto— **fallaba en un descomprimido limpio**.

**Corregido:** se compila y se incluye `dist/server.mjs` (3,2 MB).
Se excluye `dist/server.mjs.map` (5,4 MB, solo sirve para depurar y su ausencia
como mucho imprime un aviso).

**Verificado arrancándolo:** `npm start` → `[CerebroNico Server] Escuchando en
http://127.0.0.1:3000` → `HTTP 200` → `<title>CerebróNico V0.9</title>`.

---

## 4. Verificación de scripts y ubicación de archivos

| Elemento | Estado | Nota |
|---|---|---|
| `package.json` | ✅ raíz de `ide/backend/` | Es la raíz de la aplicación (Vite + servidor) |
| `index.html` | ✅ raíz de `ide/backend/` | Correcto: es la raíz que espera Vite |
| `index.js` | **no existe, y no debe existir** | Los puntos de entrada del IDE son `server.ts` (dev) y `dist/server.mjs` (start). Ningún archivo lo referencia |
| `main` → `electron-main.cjs` | ✅ existe (14 KB) | |
| `dev` | ✅ `tsx server.ts` (+ `predev`: gen-reflejo, gen-modelfile) | |
| `start` | ✅ arreglado (ver §3) | |
| `start:isolated` | ✅ `cross-env NODE_ENV=production node dist/server.mjs` | |

**Observación honesta sobre `start` y `dev`:** hacen casi lo mismo. `dev` ejecuta
el TypeScript con `tsx`; `start` ejecuta el bundle, **pero sin `NODE_ENV`**, y el
servidor decide «modo desarrollo» y sirve con Vite en caliente. Para el modo
producción real está `start:isolated`. No es un fallo, pero el nombre `start`
induce a error: si lo que quieres es producción, es `start:isolated`.

---

## 5. 🐞 El espejo del sandbox: el IDE dentro de sí mismo

`.proyectos/` —la carpeta que el sandbox usa como raíz de proyecto— contiene
**una copia del propio IDE**: `package.json` (name `codigo-cerebronico`),
`server.ts`, `src/`, `tsconfig.json`, `package-lock.json` (157 KB), `dist/`,
`MEMORIA.md`, `README.md` y `skills.md`.

Consecuencia verificada con el endpoint nuevo:

```json
GET /api/proyecto/espejo
{"totalArchivos":12, "plantilla":{"id":"node-express"},
 "completo":false, "faltan":[{"ruta":"server.js"},{"ruta":".gitignore"}]}
```

El espejo cree que el proyecto del usuario es un **servidor Node al que le falta
`server.js`**. No es un proyecto: es el IDE reflejado en su propio sandbox. Ésta
es la causa de fondo de los mensajes confusos de detección de proyecto
(«No hay proyecto en el sandbox», «No se encontró package.json») que llevas
reportando: el detector no encontraba lo que esperabas porque **lo que había no
era tu proyecto**.

**Estado: PENDIENTE DE TU CONFIRMACIÓN** — ver §8.

---

## 6. 🐞 Documentación que dice cosas que no son

| Hallazgo | Evidencia |
|---|---|
| `FUNCIONES_LOGICAS_IDE_PROFESIONAL.md` **se cita y no existe** | Citado en `BIBLIOGRAFIA_EVOLUCION_CEREBRONICO.md` (2 veces); `find` no lo encuentra |
| Se invocan **«9 ADRs»** | Hay **0** archivos `*adr*.md` en el paquete |
| `BIBLIOGRAFIA…` afirma que la V8 consolidó las directrices en `ARQUITECTURA_CEREBRONICO_V8.md` | Ese archivo existe; los otros dos citados en la misma frase (`AGENTES_MANUAL.md`, `cerebro.md`) también |

No lo he corregido por mi cuenta porque hay que decidir **cuál de las dos cosas
es falsa**: o el documento se escribe, o la cita se retira.

---

## 7. Correcciones y mejoras de esta sesión (índice)

Cada entrada tiene su informe completo en la raíz del paquete.

| Versión | Qué se corrigió | Evidencia |
|---|---|---|
| 8.0.1 | Cinco literales de versión contradictorios; filtro de metadatos de cierre inexistente; `npm start` con clave TTS ausente; +29 entradas en la base del motor | `INFORME_AUDITORIA_V8.0.1.md` |
| 8.0.2 | Contenedor general: 28 firmas mágicas, 46 rutas de conversión con pérdidas declaradas, proveedores de vídeo con fuente | `DISENO_CONTENEDOR_GENERAL.md` |
| 8.0.3 | Miniatura real en el adjunto + cola de «cargando»; el editor web no arrancaba el sandbox y su indicador estaba clavado en verde | `INFORME_V8.0.3.md` |
| 8.0.4 | Voz robótica (caché de voces + `voiceschanged` + puntuación); el fallo de la voz Gemini ya no se traga; la consola ejecutaba el **texto de una herramienta** | `INFORME_V8.0.4.md` |
| 8.0.5-8.0.6 | El aplanado no encontraba nada (se saltaban las carpetas que empiezan por punto, y las rutas del proyecto empiezan por `.proyectos`); +99 comprobaciones de aduana del árbol | `INFORME_V8.0.7.md` |
| 8.0.7 | Espejo del proyecto: plantillas de archivos por tipo y cotejo de lo que falta | `INFORME_V8.0.7.md` |
| 8.0.8 | Un `index.html` que no contiene HTML ya no se sirve en blanco: se enseña su contenido real | (esta hoja) |
| **V0.9** | Renombrado completo, `server.mjs` incluido, literal «V1» del modo demo, referencias de documentos | §2-§5 |

Los informes conservan su nombre original a propósito: **son el registro de lo que
ocurrió en cada versión**, y renombrarlos falsificaría la historia. La versión
viva es V0.9 y está sólo en `src/constants.ts`.

---

## 8. Pendiente de tu confirmación (cambios de estructura)

Estos cambios **tocan el árbol existente**, así que no los he hecho:

1. **Vaciar `.proyectos/`** (quitar la copia del IDE). Es lo que arregla de raíz la
   detección de proyecto. Son 12 archivos, incluido un `package-lock.json` de
   157 KB y un `dist/`. Alternativa mínima: borrar solo `package.json`, que es el
   marcador que hace que se detecte «proyecto».
2. **Mover los informes de la raíz a `docs/`.** Ahora la raíz del paquete tiene 7
   documentos sueltos mezclados con `ide/`, `audits/` y `mejoras/`.
3. **`FUNCIONES_LOGICAS_IDE_PROFESIONAL.md`**: ¿se escribe o se retira la cita?
4. **`ARQUITECTURA_CEREBRONICO_V8.md`**: recomiendo **no** renombrarlo (ver §2.4).

---

## 8.bis ICONO PERSONALIZADO (v0.9) — EXE e interfaz

### Lo que faltaba de verdad

El **icono del EXE ya existía** y estaba bien: `build/icon.ico` con siete medidas.
Lo que **no existía era el de la interfaz**: `index.html` no declaraba ni una
etiqueta `icon`. Consecuencia real: la pestaña del navegador mostraba el icono
genérico, y el producto era el único elemento de la pantalla sin su propia marca.

### Arte

Generado a partir de `cerebrochip.jpg` conservando la identidad del sujeto —el
cerebro anatómico dentro del hexágono de cristal facetado, sobre placa, con su
brillo violeta-cian— y con tres cambios que un icono exige y una ilustración no:

| Cambio | Por qué |
|---|---|
| Fuera el rótulo flotante «PROCESSING: ACTIVE CALCULATING» | Texto ilegible a 32 px; en un icono es ruido |
| Fuera las partículas sueltas | A tamaño pequeño se leen como suciedad, no como energía |
| Cerebro y chip más grandes y centrados | Para que el hexágono y el brillo se reconozcan a 32 px |

### Archivos

| Archivo | Qué es | Para qué |
|---|---|---|
| `build/icon.png` | maestro 2048×2048 | fuente del .ico y de futuras medidas |
| `build/icon.ico` | **7 medidas** (16, 24, 32, 48, 64, 128, 256) | **el EXE** — electron-builder le da prioridad |
| `public/icono-cerebronico.png` | 256×256 | cabecera del IDE y favicon PNG |
| `public/favicon.ico` | 16/24/32/48 | pestaña del navegador |
| `build/ICONO.txt` | — | actualizado: arte, medidas y de dónde sale |

Y en la interfaz:

- `index.html`: tres etiquetas nuevas (`icon` .ico, `icon` .png, `apple-touch-icon`) + `theme-color`.
- `Header.tsx`: el arte real en el **extremo superior izquierdo**, a 22 px, dentro del botón que ya abre el menú CN — la esquina que se ve siempre, incluso en la pantalla de bienvenida sin ningún chat abierto.

**Decisión que conviene conocer:** el `BrainThinkingIcon` animado que ya estaba al
lado **no se ha tocado**. Ése es el *indicador de actividad* (`idle` / `exploding`
según el streaming), no la marca. Sustituirlo habría sido cambiar una señal que
funcionaba por un adorno.

### Sin dependencias nuevas

Aquí no hay ImageMagick, ni Pillow, ni sharp, ni ffmpeg. En vez de añadir uno para
redimensionar cuatro imágenes, el `.ico` se genera con
`build/icono/generar_icono.py` usando solo `zlib` y `struct` de la biblioteca
estándar: decodifica el PNG, baja por mitades exactas, y para 48 y 24 usa media
por área. El script **se niega a trabajar** si el PNG viene entrelazado o con otra
profundidad, en lugar de generar un icono con los colores cambiados.

### Verificado

```
build/icon.ico     7 entradas, todas PNG, firmas 89504e47 correctas
dist/icono-cerebronico.png y dist/favicon.ico   presentes tras el build
dist/index.html     declara las tres etiquetas
bundle              referencia /icono-cerebronico.png
npm start           sirve <title>CerebróNico V0.9</title>
```

---

## 8.ter ESTABILIDAD Y CONOCIMIENTO DEL MOTOR (v0.9.1)

Pedido: «incrementa su estabilidad y agranda su base de datos en general +
conocimiento e inteligencia en la estructura de su motor».

### Estabilidad: tres huecos reales, ninguno teórico

| Hueco | Qué pasaba de verdad | Corrección |
|---|---|---|
| Sin guarda de `unhandledRejection` | En Node, una promesa rechazada sin recoger **termina el proceso**. Se perdía la sesión entera —memoria sin guardar, archivos abiertos— por un fallo en una ruta que quizá ni se usaba | Se registra con `console.error` y **el motor SIGUE** |
| Sin guarda de `uncaughtException` | Igual, y encima sin rastro: la ventana se cerraba y no quedaba ni el motivo | Registra, **guarda la base antes de salir** y sale con código 1 |
| **Sin middleware de error en Express** | Una excepción dentro de una ruta dejaba la petición **sin respuesta**: ni 200 ni 500. En la interfaz, un indicador girando para siempre, imposible de distinguir de «está pensando» | Middleware final que responde 500 en JSON, con la ruta y el motivo, y avisa de que el motor sigue vivo |

### Y la base de datos ya no se puede truncar

`saveEngineKb` escribía **directamente encima** del archivo bueno cada 30 s. Con la
base creciendo, un corte a mitad de escritura la dejaba truncada — y sin avisar: el
archivo existe, pesa algo y se abre; sólo al leerlo se descubre que falta la mitad.
Para algo cuyo trabajo es **crecer**, eso es el peor fallo posible.

- **Escritura atómica**: se escribe en `kb.json.tmp` y se **renombra** sobre el bueno. Dentro del mismo sistema de archivos el renombrado es atómico: o el viejo entero, o el nuevo entero, nunca la mezcla.
- **Una base ilegible se APARTA**, no se pisa: se renombra a `kb.json.corrupto-<fecha>`, se dice cuántos bytes tenía y se sigue con la de fábrica. Antes, el guardado periódico la sobrescribía 30 segundos después y lo aprendido desaparecía para siempre en tono neutro.
- Al cerrar se dice **cuántas entradas** quedaron guardadas.

### Base de datos: +22 entradas sobre la estructura del propio motor

`src/engine/kbMotor.ts`. El motor sabía mucho de código ajeno y **casi nada de sí
mismo**, y la consecuencia se vio entera en una sesión: no podía razonar sobre
puertos, raíces ni flujos. De ahí errores como escribir en `.proyectos/` creyendo
que era la raíz del servidor, o crear un `index.js` en una carpeta `"type":
"module"`. Ninguno es de sintaxis: los cuatro son falta de **modelo mental del
motor**, y un modelo mental se escribe.

Contenido: mapa de los cuatro puertos y quién habla con quién · los ocho módulos
centrales con su responsabilidad real · los tres flujos (arranque del sandbox,
preview en blanco, aprendizaje y persistencia) · seis invariantes que no se pueden
romper · y conocimiento general de estabilidad (guardas, escritura atómica,
secretos, verificar antes de afirmar, una sola fuente).

Semilla total: **116 entradas**.

### 🐞 Tres veces el mismo error, y las tres las cazó una prueba

Al escribir las claves nuevas repetí **tres veces** el mismo defecto: la palabra
común metida en varias claves. `rule-espejo-proyecto` llevaba cuatro claves con
«proyecto»; `motor-invariante-puertos`, tres con «puerto»; y `gen-nombres-y-precedencia`
tenía «proyecto» en el título y en una clave.

El efecto no es «puntúa de más»: es que **desplazaba a la entrada que tenía que
responder**. «El proyecto está en una subcarpeta» lo ganaba la regla del espejo en
vez de la entrada de raíces.

Se corrigió **midiendo**, no adivinando. La primera consulta era un **empate a 4,10
entre tres entradas** y la segunda ganaba con 6,50 una entrada que no hablaba de
eso; el diagnóstico imprimió las puntuaciones reales y ahí se vio de dónde salían
los puntos: de una palabra prestada. Tras desambiguar:

```
motor-projectporter     el proyecto esta en una subcarpeta y no lo encuentra
motor-mapa-general      en que puerto va el proyecto del usuario   (5,10)
```

**Y la lección que queda escrita en la prueba:** cuando dos entradas contestan bien
a la misma pregunta, no se pelea con el ordenador. `err-puerto-ocupado-sandbox` ya
tenía los cuatro puertos como claves y contesta bien a esa pregunta; forzar que
gane la nueva retorciendo claves deja la base frágil y convierte la prueba en una
medida del orden interno en vez del resultado.

```
tsc --noEmit ....... 0 errores
npm run validar .... 2295 comprobaciones · 0 fallos · 37 suites · 0 sin correr
tests/motor-estructura.test.ts .... 41 correctas · 0 fallidas
```

---

## 8.quater CN v1.0.0 — BOTONES, PALETA, RENDIMIENTO Y CONTEXTO x5

### Botones: auditoría de lo que SÍ se puede medir sin navegador

No se puede pulsar cada botón desde el guardián, y decir «los he revisado» sería
una afirmación no verificada. Lo que sí es determinista es lo que convierte un
botón en muerto, y eso es lo que audita `tests/botones.test.ts` sobre los 40
archivos `.tsx`:

| Defecto | Por qué no lo caza el compilador |
|---|---|
| `onClick={() => {}}` | Compila, se pinta, se pulsa y no pasa nada |
| `onClick={undefined}` / `{null}` | React lo acepta sin quejarse |
| `onClick={nombreInexistente}` | TypeScript no lo ve si las props son laxas o hay un `any` |
| `<button>` sin `onClick` ni `type="submit"` ni `disabled` | Pinta como pulsable y no hace nada |

Resultado: **0 manejadores vacíos, 0 nulos, 0 con nombre inexistente.** Los
botones sin `onClick` se informan siempre (hay casos legítimos: los que delegan en
el `onSubmit` de un formulario) y sólo fallan si pasan de 40, para que la cifra no
se convierta en un cero exigido que mienta.

**Lo que esta auditoría NO cubre, y se dice:** que un manejador exista no prueba
que haga lo correcto. Eso no se ha medido.

### La paleta: los px, y la causa real

Se investigó en el orden correcto —medir antes de tocar— y el resultado descartó
las tres hipótesis fáciles:

| Hipótesis | Medición | Veredicto |
|---|---|---|
| Faltan tamaños en la hoja del motor | `TOKENS_TAMANO` cubre 8, 9, 10, 10.5, 11, 11.5, 12, 13, 14, 15 px; el código usa exactamente 8-15 | ❌ No es |
| Faltan anclas `data-cn` | Las cinco existen (cabecera, chat, editor, explorador, paneles) + general en `body` | ❌ No es |
| Alguna sección no tiene texto que escalar | Las cinco tienen tokens alcanzables | ❌ No es |

Y aparecieron **dos defectos reales**, ambos de la misma forma que la queja
—*«no funcionaban todos»*:

1. **La vista previa del panel aplicaba «general» dos veces.** La fórmula era
   `(v.tam/100) × (general.tam/100) × 12`. Al editar la sección GENERAL, `v` **es**
   `general`: el mismo porcentaje entraba dos veces. Poniendo 150 % la vista previa
   enseñaba 27 px, no 18 — mentía justo en el control desde el que se ajusta todo
   lo demás, así que se ajustaba a ojo sobre un número falso.
2. **La prueba que vigila el inventario podía pasar sin escanear nada.** Usaba
   `process.cwd()` y, si no encontraba la carpeta, imprimía una nota neutra y
   seguía: la comprobación más importante del archivo quedaba en verde sin haber
   leído un solo fichero. Además sólo miraba `src/components`. Ahora se ancla en la
   raíz del paquete, escanea **todo** `src` y **falla** si no lee nada.

Al arreglar (2) saltó un `text-2xl` «no cubierto». Al mirarlo: está **dentro de una
cadena** de `cerebroReflejo.ts`, que **genera páginas para otros proyectos**. La
tentación era añadir `2xl` a la lista de tokens; habría callado la prueba y habría
roto el producto (escalaría el código que el motor escribe para el usuario). Se
excluye el fichero, con la lista autolimitada a 3 entradas: una lista de
exclusiones sin techo acaba siendo donde se esconden los hallazgos incómodos.

### Contexto de lenguaje x5

| | Antes | Ahora |
|---|---|---|
| Entradas de conocimiento recuperadas | 5 | **25** (×5) |
| Presupuesto de caracteres inyectados | 1.100 | **5.500** (×5) |
| Entradas totales en la semilla | 44 | **116** |

Es una **decisión**, no un número más, y va con su contrapartida escrita: cada
carácter viaja en **todas** las llamadas, así que ×5 conocimiento es ×5 tokens y,
en modelos locales pequeños, más tiempo de respuesta — justo lo contrario de lo
que se pide cuando también se pide rendimiento. Se sube igual porque quedarse
corto de contexto produce errores graves (el modelo inventa lo que no sabe)
mientras que pasarse produce lentitud, que se nota y se puede bajar. El corte por
presupuesto se conserva, así que la subida tiene techo.

### Rendimiento: lo que encontré, y por qué NO lo he tocado

Medido: el sondeo de estado del sandbox corre **cada 6 s** y
`/api/sandbox/status` **recorre el árbol del sandbox hasta cinco niveles** para
reconocer el proyecto. Son diez recorridos por minuto sobre una carpeta que puede
tener miles de archivos, y el coste lo paga el mismo hilo que sirve el chat.

**Y no lo he cambiado.** El código documenta por qué son 6 s y no 10: *«el sandbox
se arranca y se para a mano, y un indicador que tarda 10 s en reflejarlo hace que
el usuario pulse Arrancar dos veces»*. Bajar la frecuencia desharía una decisión
deliberada de interfaz por una ganancia especulativa — el mismo error que este
proyecto ya ha pagado otras veces: **cambiar algo que funciona porque el número
parece alto, sin leer por qué está así.**

El arreglo correcto está identificado y no hecho: **abaratar el endpoint**, no
llamarlo menos. Un memo de 3 segundos sobre la detección de proyecto daría el
mismo efecto sin tocar la cadencia de la interfaz.

```
tsc --noEmit ....... 0 errores
npm run validar .... 2304 comprobaciones · 0 fallos · 38 suites · 0 sin correr
tests/botones.test.ts .... 8 correctas · 0 fallidas
```

### 🐞 Y un fallo mío, cazado por el propio cambio de versión

Para poder enseñar «V0.9» con la semilla en `0.9.0` escribí una derivación que
**quitaba el `.0` final** de la etiqueta visible. Su propio comentario avisaba del
límite: *«1.0.0 produciría V1.0»*.

Ha pasado en la versión siguiente. La versión pedida es **CN v1.0.0** y la
derivación **se comía un dígito que el usuario había escrito** — la cabecera habría
dicho «V1.0». Lo cazaron las pruebas del `title` y del `og:title`, que exigen que
lo que se ve y lo que dice la fuente sean lo mismo.

Usando `/\.0$/` para quitar un sufijo se convirtió `1.0.0` en `1.0`, que es otra
versión. Sirve como error de una línea y como muestra de la misma familia que el
resto de la sesión: **un truco sobre un dato con formato propio (semver) empieza a
mentir en cuanto el dato cambia de forma.** El recorte se retira, y una prueba
nueva vigila que no vuelva a colarse (`!/VERSION_SEMVER\.replace\(/`).

Y de paso, la prueba del `og:title` destapó que **3 de los 4 literales de versión
de `index.html` se habían quedado atrás** — el `og:title`, el `og:description` y el
`description`. Los tres seguían diciendo V0.9 mientras el `<title>` ya decía
V1.0.0. Es exactamente la misma forma de fallo que la queja de la paleta: **una
actualización a medias, donde *casi todos* quedan bien y por eso nadie lo nota.**

---

## 9. Qué NO se ha hecho, y por qué

- **Migrar a React o Vite**: el proyecto **ya es** React 19 + Vite 6. No hay
  migración pendiente que evaluar.
- **Formulario de contacto y citas online**: era del proyecto de la veterinaria,
  que era una prueba de funcionamiento. Descartado por indicación tuya.
- **Diseño responsive y solape del footer**: son de aquel proyecto. Este paquete
  es la aplicación de escritorio; no aplica.
- **La X de cerrar en toda ventana/pestaña** y **separar el chat del
  reproductor**: siguen pendientes; el segundo necesita que elijas entre divisor
  arrastrable o ventana independiente.
- **El estudio de actualización en caliente** que se interrumpió.

---

## 10. Cómo verificar todo esto tú mismo

```bash
cd ide/backend
npm install
npm run lint        # 0 errores de tipo
npm run validar     # 2252 comprobaciones, 0 fallos
npm start           # http://127.0.0.1:3000  ->  <title>CerebróNico V0.9</title>
```

Comprobaciones puntuales:

```bash
# La versión sale de UN solo sitio
grep -n "VERSION_SEMVER\|VERSION_ETIQUETA" src/constants.ts

# No queda ninguna versión de producto DISTINTA de V0.9.
# (La primera versión de esta comprobación estaba mal escrita: buscaba
#  «CerebroNico V<dígito>» y marcaba como fallo las apariciones CORRECTAS de
#  V0.9. Se corrige excluyendo «V0.9»; y se excluye main.tsx, que cita la
#  historia a propósito.)
grep -rn "CerebroNico V[0-9]\|CerebróNico V[0-9]" index.html src/ \
  | grep -v "V0\.9" | grep -v "V\${" | grep -v "main.tsx:9" \
  || echo "ninguna distinta de V0.9"

# El único literal de versión escrito a mano está en index.html, y es deliberado:
# es el <title> de respaldo antes de que main.tsx lo reescriba con IDE_BRAND.
# Por eso hay una prueba que exige que coincida EXACTAMENTE con FULL_NAME.

# El espejo coteja el sandbox real
curl -s http://127.0.0.1:3000/api/proyecto/espejo
```
