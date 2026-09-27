# CONTENEDOR / CREADOR / MODIFICADOR / REPRODUCTOR GENERAL

> Diseño e implementación · CerebróNico v8.0.2 · 22-sep-2026
> Petición: «un contenedor activo transmutable, que sea capaz de recibir y
> entregar cualquier formato, y si es posible vídeo».
> Estado: **implementado y verificado** (161 comprobaciones propias, 1940 en total).

---

## 1. La idea, formalizada

«Contenedor» a secas ya existe: se llama carpeta. Lo que pediste tiene cuatro
capacidades distintas y conviene no mezclarlas, porque cada una falla por un
motivo diferente:

| Rol | Qué significa | Cómo falla si se finge |
|---|---|---|
| **CONTENEDOR** | Recibir cualquier formato y saber **qué es**. | Se cree el nombre del archivo y confunde un `.png` con un ZIP. |
| **CREADOR** | Producir algo que no venía de fuera. | Promete generar vídeo «gratis» y no hay servidor que lo dé. |
| **MODIFICADOR** | Cambiar lo recibido sin destruirlo. | Recodifica y pierde calidad sin avisar. |
| **REPRODUCTOR** | Entregarlo en algo que se pueda abrir. | Entrega un MKV y el navegador muestra un hueco negro. |

Los cuatro están implementados. Dos en `src/engine/contenedor.ts` (reconocer y
transmutar) y dos en `src/engine/videoGen.ts` (crear y reproducir).

---

## 2. La decisión que sostiene todo: **los bytes mandan**

Un archivo llega con dos pistas sobre lo que es: su **nombre** y su
**`Content-Type`**. Las dos mienten con regularidad, y ya nos costó un defecto
en este mismo proyecto — `imageGen.ts` tiene documentado el caso inverso: un
proveedor que responde `content-type: application/json` con un JPEG perfecto
dentro. Si te crees la cabecera, tiras una imagen buena.

Por eso la **única** fuente de verdad son los primeros bytes. El nombre y el MIME
declarado se conservan, pero para **denunciar la discrepancia**, no para decidir:

```
nombre: foto.png · bytes: 50 4B 03 04 …
→ mime: application/zip
→ discrepancia: "El nombre dice «png» (image/png) pero los bytes son
   «application/zip» (ZIP). Posible archivo renombrado o descarga corrupta."
```

La excepción importante, y la que casi se me cuela: **`docx`, `xlsx`, `pptx` y
`.cn` SON ZIP por dentro y por diseño**. Denunciarlos como «renombrados» sería
denunciar el formato entero. La primera versión de la guarda se apoyaba en la
«familia» del formato y no funcionaba — `docx` es familia `documento`, no
`paquete` —, y lo cazó la prueba. Ahora se enumera por ID, que es lo único que no
admite interpretación.

**Cobertura de firmas:** PNG, JPEG, GIF, WEBP, BMP, TIFF (las dos endianness),
ICO/CUR, PDF, ZIP (incluido vacío), GZIP, BZIP2, XZ, 7Z, RAR, EBML (WebM/MKV),
OGG, FLAC, MP3 (con y sin ID3), MP4/MOV/M4A/M4V/AVIF/HEIC/3GP (por marca `ftyp`),
RIFF/WAVE/AVI/ANI, SQLite, ELF, PE, Mach-O, WASM, WOFF/WOFF2/TTF/OTF. **28 firmas.**

Los tres casos que exigen mirar más allá del byte 0, y que son donde fallan las
implementaciones descuidadas:

- **`ftyp` en el byte 4** y la marca real en el **byte 8** → MP4, MOV, M4A, AVIF,
  HEIC y 3GP comparten envoltorio y solo la marca los separa.
- **RIFF en el byte 0 + marca en el byte 8** → WAV, AVI, WEBP y ANI son
  indistinguibles si solo miras los cuatro primeros bytes.
- **EBML** → WebM y Matroska son el mismo contenedor; el DocType interno diría
  cuál, y se declara honestamente que no se parsea.

---

## 3. Transmutar: rutas con pérdidas dichas **por adelantado**

Aquí está la regla que ya definía el conversor de texto (`formatConverter.ts`) y
que ahora cubre todo el contenedor:

> **Convertir no es lo difícil. Lo difícil es no mentir sobre lo que se pierde.**

Cada arista del grafo declara sus pérdidas de forma **concreta**:

| Ruta | Pérdidas declaradas |
|---|---|
| `yaml → json` | «JSON no admite comentarios: se pierden todos.» «Se pierden anclas, alias y etiquetas.» |
| `json → csv` | «CSV solo entiende tablas planas: lo anidado se aplana.» «CSV no tiene tipos.» |
| `png → jpeg` | «La transparencia se rellena de un color plano: el alfa se pierde.» |
| `flac → mp3` | «Se abandona la ausencia de pérdida. **Irreversible**.» |
| `mp4 → gif` | «De millones de colores a 256.» «Sin audio.» «El archivo suele pesar MÁS que el vídeo del que sale.» |
| `mp3 → wav` | *(sin pérdida)* + nota: «Aumentar el tamaño NO recupera calidad perdida: sonará igual ocupando diez veces más.» |

**46 rutas** en el grafo, agrupadas por los cuatro motores reales que las ejecutan:
`js-puro` (lo que ya hace el proyecto), `navegador` (lo que el navegador decodifica
solo), `ffmpeg` (audio, vídeo y las imágenes raras) y `red` (proveedor externo).

### El rechazo también es una respuesta

Cuando no hay ruta, **no se devuelve `null` ni se lanza una excepción**: se
devuelve el motivo y qué falta.

```
rutaDeConversion("heic", "jpeg", ["js-puro","navegador"])
→ ok: false
→ motivo: "No hay ruta de «heic» a «jpeg» con lo que hay instalado."
→ sugerencias: ["Faltan motores: ffmpeg. Con ellos instalados, la ruta aparecería sola."]
```

Y el caso que más me importa que quede claro:

```
rutaDeConversion("png", "mp4")  →  NO HAY RUTA
```

**Convertir una imagen en vídeo no es una conversión, es una creación.** Un
contenedor que dijera «sí, png→mp4» estaría confundiendo dos roles y prometiendo
algo que su grafo no sabe hacer. Eso es trabajo de las recetas de composición,
que están en el otro rol y se declaran aparte.

---

## 4. Crear vídeo: la verdad incómoda, con las fuentes delante

Preguntaste por «algún servidor gratuito para generar vídeos». Lo fui a mirar en
serio el 22-sep-2026 y esto es lo que hay, sin adornos:

### No existe hoy un servidor de vídeo generativo gratuito, sin clave e ilimitado

Lo tuvo la generación de **imagen** (y este proyecto lo aprovechó: `imageGen.ts`
usa pollinations sin clave). El **vídeo** cuesta dos órdenes de magnitud más
cómputo por segundo de salida, y nadie lo regala abierto.

Lo que **sí** existe, verificado contra la página oficial de cada uno:

| Proveedor | Tipo | ¿Gratis? | Límite declarado | Fuente |
|---|---|---|---|---|
| **Pixazo · LTX** (Lightricks) | Generativo (texto→vídeo, imagen→vídeo, vídeo→vídeo) | ✅ Sí, sin tarjeta | Fair use: 60 req/min por modelo, «durante preview» | [pixazo.ai/api/free](https://www.pixazo.ai/api/free) |
| **JSON2Video** | **Composición** (texto, imágenes, audio, subtítulos, TTS 30+ idiomas) | ✅ Sí, sin tarjeta | 600 s de render en total, ≤60 s por vídeo | [json2video.com/get-api-key](https://json2video.com/get-api-key/) |
| **Pollinations** | Generativo (texto, imagen, vídeo, audio) | ⚠️ Monedero (Pollen) + Quests | Sin cifra pública fija | [pollinations.ai](https://pollinations.ai/) |
| **Hugging Face** (text-to-video) | Generativo vía fal / Replicate / Together / WaveSpeedAI / Novita | ❌ **No** | Cuentas Free: **0,10 USD/mes**. PRO: 2,00 USD/mes | [docs/pricing](https://huggingface.co/docs/inference-providers/en/pricing) |

Dos notas que valen más que la tabla:

1. **Hugging Face está marcado como NO gratis en el código**, y esa marca es el
   punto. Su página de inicio dice «generous free tier»; su página de precios dice
   **0,10 USD al mes**. Ante dos páginas oficiales que se contradicen, manda la que
   te cobra. Está en la lista para que el motor pueda decir «existe, y con la capa
   gratuita no te lo puedes pagar», en vez de fingir que no existe.
2. **Pollinations cambió.** Su API de imagen todavía responde sin clave (de ahí
   que `imageGen.ts` funcione así), pero la de vídeo pasa por sesión y monedero.

### La consecuencia de diseño: dos carriles, no uno

Si el contenedor apoyara la creación de vídeo **solo** en esos servicios, se caería
el día que cambie una capa gratuita — y cambiarán, porque todas dicen «preview» o
«subject to change». Así que hay dos carriles:

**CARRIL A — Composición local con `ffmpeg`.** Coste cero, sin red, sin clave, sin
depender de nadie. Seis recetas implementadas:

| Receta | Qué hace | Aviso que declara |
|---|---|---|
| `presentacion-de-imagenes` | Imágenes + audio + subtítulos → MP4/WebM/GIF | Recorta al centro (pierdes bordes); los subtítulos se **queman** |
| `recorte` | Corta por tiempo **sin recodificar** | Corta en fotograma clave: el inicio puede desplazarse |
| `conversion-de-contenedor` | Cambia envoltorio sin recodificar | **Falla** si el códec no es compatible con el destino |
| `extraer-fotogramas` | Un fotograma cada N segundos | El patrón necesita contador o solo queda el último |
| `escalado` | Reescala con Lanczos | Reducir es **irreversible**; ampliar no aporta detalle |
| `marca-de-agua` | Superpone logo | **Recodifica**: hay pérdida aunque el audio se copie |

**CARRIL B — Generación por red.** Oportunista y declarado como tal: se intenta si
hay clave, y si no la hay se dice exactamente qué variable falta y dónde se
obtiene. Nunca se presenta como disponible lo que no lo está.

### Una decisión deliberada: las recetas se **devuelven**, no se ejecutan

`recetaPresentacion()` devuelve los argumentos exactos de `ffmpeg`. No lo lanza.
Dos razones, y las dos importan:

1. **Puridad.** El módulo corre también en el navegador (para previsualizar y
   planear antes de tocar disco). Ahí no hay procesos, y meter `child_process`
   haría que la guarda de Vite reventara el bundle.
2. **Auditoría.** El usuario puede **leer el comando** antes de que se ejecute.
   Un contenedor que lanza comandos a escondidas no es un contenedor: es un riesgo
   con interfaz bonita.

También se protege la salida: `esVideoPorFirma()` comprueba que lo que devolvió un
proveedor es **realmente** vídeo, por firma y no por lo que diga su `Content-Type`
— la misma lección que ya costó una imagen tirada en `imageGen.ts`.

---

## 5. Reproducir: decir «no» también es entregar

```
mp4   → se reproduce directo
webm  → se reproduce directo
mkv   → NO. "El navegador NO abre Matroska." → ruta propuesta: mkv → webm
avi   → NO. "El navegador NO abre AVI."
mov   → Sí, si dentro lleva H.264/AAC (lo normal en iPhone). Con ProRes, NO.
```

La diferencia entre un contenedor útil y uno frustrante es esta: ante algo que no
se puede abrir, **decir por qué y proponer la conversión concreta** en lugar de
dejar un hueco negro.

---

## 6. Qué queda hecho y verificado

| Pieza | Estado |
|---|---|
| `src/engine/contenedor.ts` — 28 firmas, 46 rutas, inspección, plan de entrega, capacidades | ✅ |
| `src/engine/videoGen.ts` — 4 proveedores con fuente, 6 recetas, reproductor | ✅ |
| `tests/contenedor.test.ts` | ✅ **161 comprobaciones** |
| Endpoint `POST /api/contenedor/inspeccionar` (server.ts) | ✅ conectado, no es código muerto |
| Validación global | ✅ **1940 comprobaciones · 0 fallos · 32 suites · 0 sin correr** |

El endpoint usa las **mismas funciones puras** que tienen las 161 pruebas, y
**solo informa**: no convierte, no escribe y no lanza comandos. Devuelve además
`capacidades` (lo que se puede y lo que **no**) y `video` (qué proveedores hay
disponibles según las claves del entorno).

---

## 7. Lo que NO está hecho (y no lo voy a disfrazar)

1. **`ffmpeg` no se empaqueta.** El carril A produce la receta; ejecutarla necesita
   `ffmpeg` instalado en la máquina. El endpoint lo **detecta** (`spawnSync`) y lo
   declara en `capacidades.carencias`, pero no lo instala. Sin él, no hay audio ni
   vídeo: no es una degradación, es una ausencia completa, y así se dice.
2. **Nada de esto se ejecuta desde el chat todavía.** El contenedor está expuesto
   por HTTP y verificado por pruebas, pero **no está en `toolRegistry.ts`**, así que
   el modelo aún no puede llamarlo como herramienta. Es el siguiente paso natural.
3. **No hay panel de interfaz.** Los datos existen; la vista para arrastrar un
   archivo y ver la ficha del contenedor, no.
4. **No hay receta de vídeo→vídeo generativo** (Pixazo lo ofrece, no lo cableé).
5. **El `.mp4` del cerebro sigue sin ser un fondo utilizable** desde el menú: su
   sitio es el camino FONDO v1 (`/api/fondo`), que ya soporta MP4 ≤8 MB.
6. **El estudio de actualización en caliente / servidores locales en tiempo real
   que pediste antes quedó sin entregar**: esa investigación se interrumpió a mitad.
   No la doy por hecha. Si la quieres, la retomo — y encaja bien aquí, porque un
   contenedor que se edita a sí mismo necesita exactamente esas tuberías.

---

## 8. Siguientes pasos, por orden de valor

### 🟢 Barato y de alto impacto
1. **Registrar el contenedor como herramienta del motor** (1 hora). Con esto el
   modelo puede preguntar «¿qué es este archivo?» y «¿qué se pierde si lo paso a
   X?» y responder con datos en vez de con intuición.
2. **Panel de la ficha del contenedor** (medio día): arrastrar → familia, firma,
   discrepancia si la hay, y el plan de entrega con sus pérdidas.
3. **Comprobación de `ffmpeg` al arrancar** y aviso en la cabecera si falta, para
   que nadie descubra que el vídeo no funciona en el momento de usarlo.

### 🟡 Medio
4. **Ejecutor de recetas en el sandbox** (:3500), que ya tiene el aislamiento: leer
   la receta, mostrar el comando, pedir confirmación y lanzarlo. Con lista blanca de
   recetas — nunca `ffmpeg` con argumentos arbitrarios.
5. **Caché de firmas + hash** para no re-inspeccionar lo mismo en cada turno.
6. **Proveedor de vídeo en la ficha**: mostrar `estadoCadenaVideo()` en el panel
   para que se vea de un vistazo qué vías generativas hay y cuál falta.

### 🔴 Largo
7. **Vídeo como ciudadano de primera**: previsualizador con fotogramas clave en la
   conversación, y publicar el resultado en la bóveda local (`bovedaLocal.ts`) con
   su índice.
8. **CRDT para el contenedor** (Yjs/Loro) si alguna vez quieres editar el mismo
   archivo desde dos ventanas sin pisarse. Es un proyecto entero, no una tarde.
