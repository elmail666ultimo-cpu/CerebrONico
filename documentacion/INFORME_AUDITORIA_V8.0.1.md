# INFORME DE AUDITORÍA — CerebróNico V8 → V8.0.1

> Revisión en caliente sobre el ZIP real, no sobre la documentación.
> Regla de la casa aplicada: **creer solo lo verificado contra código**.
> Fecha: 22-sep-2026 · Base: `Cerebronico-V8-CONSOLIDADO-MEJORADO(2).zip`
> Entregable: `Cerebronico-V8.0.1-CONSOLIDADO-MEJORADO.zip`

---

## 0. Resumen ejecutivo

Preguntaste seis cosas. En cinco encontré un **defecto real y reproducible**, y en la
sexta (la idea cloud/local) encontré un defecto que **no da error, solo da pena**:
el modelo de 120B recibía el trato de un modelo diminuto.

| # | Tu pregunta | Veredicto | Qué hice |
|---|---|---|---|
| 1 | ¿Es funcional el código para restringir metadatos automáticos? | ❌ **No existía** | 3 capas: orden retirada + aduana a la salida + pruebas |
| 2 | Idea cloud/local con Ollama | ⚠️ La idea es buena; el motor la sabotea | Tabla de alias para modelos renombrados |
| 3 | Imágenes en el menú · no admite GIF | ❌ Defecto real, doble | GIF nativo + 3 presets de imagen |
| 4 | Revisión en caliente válida | ⚠️ 1.641 comprobaciones, **1 fallo** | 1.779 comprobaciones, **0 fallos** |
| 5 | Discrepancia V8.0.0 vs V1.0.3 | ❌ Defecto real, **5 focos** | Una sola semilla de versión |
| 6 | Ampliar la base de datos del motor | — | +29 entradas ancladas a este repositorio |

**Evidencia de la validación, antes y después:**

```
ANTES (ZIP original)                          DESPUÉS (V8.0.1)
────────────────────────────────────────      ────────────────────────────────────────
npx tsc --noEmit ................ 0 errores   npx tsc --noEmit ................ 0 errores
npm run validar .................. 1.641 ✅   npm run validar .................. 1.779 ✅
                                   1 fallo                                      0 fallos
                                   1 suite sin correr                           31 suites ejecutadas
VEREDICTO .................... HAY FALLOS    VEREDICTO ................ TODO CORRECTO
npm run build ..................... ok       npm run build ..................... ok
```

---

## 1. La discrepancia de versiones (tu pregunta prioritaria)

**Síntoma:** la cabecera decía `CerebróNico V8.0.0` y el Menú CN decía `CEREBRÓNICO V1.0.3`.

### 1.1 La causa inmediata: el bundle era viejo

`dist/` es un artefacto **compilado**. Lo que corría en tu pantalla no era tu `src/`,
era un `dist/` construido hace versiones. Comprobado con hash:

```
md5  fcd17cbde64410dbeceffefb12f3b694   ide/backend/dist/assets/index-D2XqXxeI.js
     ↑ IDÉNTICO en los DOS ZIP que me subiste
```

Dentro de ese bundle:

```js
NAME:"CerebróNico",VERSION:"V8.0.0"        ← esto lee la CABECERA
FULL_NAME:"CerebróNico V1.0.3"             ← esto lee el MENÚ CN
```

Ahí está tu captura, literal: **dos constantes distintas en el mismo objeto**.

### 1.2 Por qué los dos ZIP "se contradecían entre sí"

| ZIP | `IDE_BRAND.FULL_NAME` en `src/` | `dist/` (lo que corre) |
|---|---|---|
| `Cerebronico-V8-Consolidado.zip` | `CerebróNico V1.0.3` ❌ | viejo (V1.0.3) |
| `Cerebronico-V8-CONSOLIDADO-MEJORADO(2).zip` | `CerebróNico V8.0.0` ✅ | **viejo igual** (V1.0.3) |

El ZIP "MEJORADO" ya había arreglado el *fuente*… y seguía sirviendo el *bundle* viejo.
Por eso el arreglo parecía aplicado y no cambiaba nada. El propio `ROADMAP.md` avisa
(«el `dist/` que viaja en el ZIP es el viejo: hay que recompilar») — y el aviso se
cumplió al pie de la letra.

### 1.3 La causa estructural: había CINCO focos de versión

| # | Foco | Valor que tenía | ¿Visible? |
|---|---|---|---|
| 1 | `src/constants.ts` → `IDE_BRAND.VERSION` | `V8.0.0` | Cabecera |
| 2 | `src/constants.ts` → `IDE_BRAND.FULL_NAME` | **`V1.0.3`** | Menú CN |
| 3 | `src/components/Header.tsx` → atributo `title` | **`CerebroNico V1.0.3`** | Tooltip al pasar el ratón |
| 4 | `index.html` → `title` / `description` / `og:title` | **`v1.0` / `v1.0` / `v1.0`** | Pestaña + enlaces compartidos |
| 5 | `index.html` → `og:description` | **`CerebroNico IDE v2.3`** | Vista previa en WhatsApp/Discord |
| 6 | `src/utils/markdownExport.ts` | **`Informe Técnico — CerebroNico V2.1`** | Informe exportado |

Los focos 4 y 5 son los más incómodos: **la versión más pública del proyecto era la más
vieja**. El comentario de `index.html` ya avisaba de esto («un «V2.1» aquí es exactamente
la mentira que la regla de fuente única quiere matar») y aun así llevaba un `V1.0`.

### 1.4 El arreglo

```ts
// src/constants.ts — UNA semilla, DOS formas, imposible divergir
const VERSION_SEMVER = "8.0.1";

export const IDE_BRAND = {
  NAME: "CerebróNico",
  VERSION:   `V${VERSION_SEMVER}`,
  FULL_NAME: `CerebróNico V${VERSION_SEMVER}`,
  SEMVER: VERSION_SEMVER,
  ...
} as const;
```

Lo importante no es el valor, es que **ya no hay dos sitios que puedan olvidarse el uno
del otro**. `Header.tsx` y `markdownExport.ts` leen de ahí; `index.html` y
`package.json` quedaron alineados a `8.0.1`.

**Evidencia de que llega a lo que ejecutas** (esto era el punto): el `dist/` que viaja
en el ZIP nuevo está **recompilado**:

```
rg -o "V1\.0\.3" dist/assets/index-CUpgFC3K.js   →   (sin resultados: desapareció)
<title>CerebróNico V8.0.1</title>                 →   dist/index.html regenerado
```

Queda **un** literal `CerebroNico V2.1` en el bundle, dentro de un **comentario de
cabecera** de un archivo de utilidades: no se ve en pantalla y no se lee en ningún
menú. Lo dejo anotado abajo como cosmético pendiente, no lo cuento como arreglado.

---

## 2. ¿Es funcional el código para restringir «comentarios automáticos»?

**Respuesta corta: no existía código.** Y lo que sí existía era lo contrario: el motor
**pedía** esos rótulos en todos los turnos.

### 2.1 El archivo que el modelo dijo haber escrito y nunca escribió

En la captura, el modelo respondió:

```
[ACCIÓN]
```tsx file="src/utils/formatFixer.ts"
export const cleanResponseFormat = (text: string): string => {
  return text.replace(/\[(DIAGNOSTICO FLASH|ACCIÓN|CHECKLIST DE MEMORIA)\][^\n]*/g, "").trim();
};
```
[CHECKLIST DE MEMORIA] Filtro de salida aplicado; metadatos ocultos en el flujo de respuesta.
```

Busqué ese archivo en los dos ZIP:

```
find ~/work -name "formatFixer*"     →     (nada)
```

**No existía.** El «aplicado» era falso, y lo descubriste buscando el archivo. Ese es
exactamente el patrón de error que el propio motor persigue (`err-declarar-sin-verificar`,
ahora en la base de datos del motor).

### 2.2 El regex del chat tenía además dos defectos de diseño

```js
text.replace(/\[(DIAGNOSTICO FLASH|ACCIÓN|CHECKLIST DE MEMORIA)\][^\n]*/g, "")
```

1. `[^\n]*` borra **la línea entera**, así que también se lleva el *contenido* del
   diagnóstico («Falta el componente X») — información útil, no ruido.
2. No distingue dentro/fuera de un bloque de código. Un `[ACCIÓN]` que sea parte del
   código del usuario (una cadena, un marcador de log) se borraba.
3. `DIAGNOSTICO` sin acento: el rótulo real sale **con** acento en casi todos los
   modelos, así que el patrón ni siquiera casaba.

### 2.3 La causa de fondo: el motor lo pedía

No era un modelo desobediente. Era un modelo **obediente** a tres sitios que lo pedían:

| Capa | Archivo | Qué pedía |
|---|---|---|
| Prompt del IDE | `src/engine/brain.ts` | «PROTOCOLO DE CIERRE (**OBLIGATORIO**)» + versión condensada para modelos micro |
| Ley del motor | `cerebro.md` §7-A | «**Estructura obligatoria** de respuesta (Output Schema)» |
| Agente Python | `core-agent/agent_core/engine.py` | «Formato **OBLIGATORIO**: [DIAGNOSTICO FLASH] …» |

Y una capa extra que casi se me escapa: `brain.ts` → `cerebroCondensado()` **extrae por
encabezado** las secciones que contienen «cierre», así que la §7 de `cerebro.md` entra al
prompt del nivel *compact* aunque `brain.ts` no la ponga. Arreglar una capa y dejar la
otra es no arreglar nada: el motor retiraba la orden en una y la volvía a dar en la otra.

### 2.4 El arreglo: se retira la orden y se pone aduana

**Capa 1 — la orden (3 archivos).** El protocolo pasa a ser **opcional y apagado por
defecto**:

```ts
// src/engine/brain.ts
const PROTOCOLO_CIERRE = { activo: false };
export function activarProtocoloDeCierre(activo: boolean): void { … }
```

Lo que **sí** se conserva de aquel protocolo: no divagar, no saludar, no preguntar ante
dos rutas no destructivas, y bloques con la ruta exacta. Eso sí aportaba.

Un detalle deliberado: en la rama apagada **no se escriben las etiquetas prohibidas**.
Nombrar `[ACCIÓN]` en el prompt es la vía más corta a que un modelo diminuto lo
reproduzca. Se prohíbe en positivo: «sin rótulos internos de acta ni etiquetas de estado
entre corchetes».

**Capa 2 — la aduana (`src/utils/formatFixer.ts`, nuevo).** Porque un prompt no es un
contrato: los modelos que ya tienen la plantilla memorizada la seguirán escupiendo un
tiempo. Se aplica en **un solo punto** (donde el texto llega a la vista), así que no hay
forma de saltársela:

```tsx
// src/components/ChatCenter.tsx
const componerCuerpo = (texto: string): string =>
  limpiarMetadatosDeCierre(repairNumberedListsAndGaps(texto));
```

Decisiones que cambié respecto al regex del chat, y por qué:

- **Los patrones van anclados con `^`.** Sin ancla, `// TODO: revisar [ACCIÓN] del turno
  anterior` se borraba entero. Lo cazó la prueba `«una nota del usuario no es metadato»`.
- **Dentro de un cercado ` ``` ` o `~~~` no se toca nada.** El código es del usuario.
- **Se reconoce el adorno markdown** (`**[ACCIÓN]**`, `### [ACCIÓN]`, `- [ACCIÓN]`),
  las variantes con y sin acento (`ACCIÓN`/`ACCION`, `DIAGNÓSTICO`/`DIAGNOSTICO`) y los
  espacios internos de más (`[CHECKLIST   DE   MEMORIA]`).
- Se elimina **la línea del rótulo**, no el rótulo: el cuerpo técnico que viene debajo
  (el bloque de código) se conserva íntegro. Es justamente la respuesta.

**Capa 3 — la prueba (`tests/formato.test.ts`, nuevo, 47 comprobaciones).** Incluye una
reproducción literal del turno de tu captura y comprueba que de 8 líneas de entrada
sobreviven exactamente las 5 del bloque de código — ni una menos.

---

## 3. La idea cloud/local con Ollama

Tu planteamiento es correcto y Ollama lo permite tal cual lo describes. El motor ya tiene
la mitad del trabajo hecho (`src/engine/modelTiers.ts` clasifica y dimensiona por tamaño),
pero encontré tres cosas.

### 3.1 Confirmado: no hay enrutador automático

El `ROADMAP.md` lo dice en §4.3 («Model Router por complejidad (local ↔ nube) — 1 semana»)
y lo verifiqué: `modelTiers` **no decide nada por ti**. Solo calcula el perfil del modelo
que tú ya elegiste a mano. La decisión local/nube hoy es tuya, clic a clic.

### 3.2 El defecto que encontré: tu `NEMESIS:latest`

Toda la clasificación se apoya en el **nombre** del modelo:

```ts
const REMOTE_HINTS = /(-cloud\b|:cloud\b|cloud\b)/i;   // ¿es de la nube?
const SIZE_IN_NAME = /[:@_-](\d+(?:\.\d+)?)\s*(b|m)\b/i; // ¿de qué tamaño?
```

Y tú renombraste un `gpt-oss` a `NEMESIS:latest`. Ollama lo permite (`ollama cp`) — pero
el nombre ya no dice ni «cloud» ni «120b» ni «gpt-oss». Perfil resultante, medido:

| | `gpt-oss:120b-cloud` (nombre real) | `NEMESIS:latest` (**antes**) | `NEMESIS:latest` (**ahora**) |
|---|---|---|---|
| Tier | `cloud` | **`small`** ❌ | `cloud` ✅ |
| Contexto (`num_ctx`) | 32.768 | **8.192** ❌ | 32.768 ✅ |
| Tope de salida | sin tope | **1.200 tokens** ❌ | sin tope ✅ |
| Herramientas (bucle de agente) | sí | **NO** ❌ | sí ✅ |
| Temperatura | 0,5 | **0,45** ❌ | 0,5 ✅ |
| Tijeras por RAM ≤8 GB | no | **sí** ❌ | no ✅ |

Traducción: **pagas la latencia de un 120B y recibes el trato de un modelo de 400 MB**,
sin herramientas y con la respuesta cortada a 1.200 tokens. Y no falla de forma obvia:
simplemente «contesta peor de lo que debería», que es el peor síntoma posible porque no
parece un bug.

**El arreglo** es una tabla de alias explícita. El motor no puede adivinar qué hay detrás
de un nombre propio; tú sí lo sabes, y decirlo cuesta una línea:

```ts
// src/engine/modelTiers.ts
const ALIAS_DE_MODELO = { "nemesis:latest": "gpt-oss:120b-cloud", nemesis: "gpt-oss:120b-cloud" };

registrarAliasDeModelo("mi-qwen", "qwen2.5-coder:7b"); // cualquier otro renombre, en caliente
```

El alias **hereda TODO** el perfil del canónico (nube, tamaño, herramientas, contexto,
`keep_alive`) porque se resuelve antes de clasificar: un solo camino, no dos que puedan
divergir. Y avisa en las notas (`«NEMESIS:latest» está declarado como alias de
«gpt-oss:120b-cloud»`), porque un arreglo silencioso es medio arreglo.

> ⚠️ **Si tu `NEMESIS` no envuelve exactamente `gpt-oss:120b-cloud`**, cambia esa línea.
> Puse el canónico que me dijiste; el motor no puede verificarlo por ti.
> Compruébalo con `ollama show NEMESIS:latest | head -5`.

### 3.3 Efecto colateral (a propósito): una sola lista blanca

Había **dos** listas de «modelos que saben llamar herramientas»: la de `modelTiers.ts` y
una regex suelta en `src/utils/engine.ts`. Cuando una decía sí y la otra no, el cliente
mandaba el turno por streaming mientras el servidor esperaba un bucle de herramientas:
respuesta a medias, sin error visible. Ahora el cliente delega en el perfil compartido.

**Consecuencia real que debes conocer:** la lista del servidor ya incluía `deepseek*`,
`glm-4*` y `gpt-oss*`, y la del cliente **no**. Al unificarlas, esos modelos (p. ej.
`deepseek-r1:7b`) ahora pasan por el bucle de agente **en el cliente también** — que es lo
que el servidor ya hacía. Es más coherente, pero es un cambio de comportamiento: si notas
que un modelo concreto responde más lento, ese es el motivo y se revierte en una línea.

### 3.4 Ideas para el enrutador por complejidad (no implementado)

Diseño que encaja con lo que ya existe, sin inventar piezas nuevas:

1. **Señales deterministas, no adivinación.** Clasificar por: longitud del prompt, nº de
   archivos abiertos, si hay tool-calling pendiente, y palabras de la petición
   («refactoriza todo», «revisa la arquitectura» → pesado; «renombra esta variable» →
   ligero). Todo eso ya está calculado en `getModelProfile()`.
2. **Un solo modelo por turno, no por sesión.** El perfil ya se recalcula en cada llamada,
   así que el enrutado es un `if` en `server.ts`, no una refactorización.
3. **Guardarraíl de cuota.** El plan gratuito de Ollama Cloud permite **1 modelo cloud
   concurrente**; el motor ya tiene el semáforo global del `runner` y la `sandboxTregua`
   para no pisarse. Reutilizar, no duplicar.
4. **Regla de oro de la casa:** que la decisión se **vea** en pantalla («enrutado a
   `gpt-oss:120b-cloud` por complejidad alta»). Una decisión invisible es exactamente el
   tipo de cosa que produce la discrepancia de versiones que acabamos de arreglar.

Estimación honesta: **1-2 días** con pruebas, no una semana, porque la infraestructura
(perfiles, semáforo, telemetría) ya está escrita.

---

## 4. Imágenes en el menú y el GIF

### 4.1 «No admite gif»: tenías razón, y era peor de lo que parecía

El GIF fallaba por **dos sitios a la vez**:

```tsx
// 1) El diálogo del sistema ni lo ofrecía
accept="image/png,image/jpeg,image/webp,image/jpg"        ← sin image/gif
```

```ts
// 2) Y si lo forzabas, el procesado lo destrozaba
const dataUrl = canvas.toDataURL("image/jpeg", 0.85);     ← un canvas tiene UN fotograma
```

Lo segundo es lo grave: un canvas **no puede** representar animación, así que el resultado
era el **primer cuadro del GIF convertido a JPEG inmóvil**. El IDE aceptaba el archivo y
lo mataba. Eso es peor que rechazarlo, porque no da error: da una imagen fija y el usuario
cree que el GIF «no se anima».

**Arreglo:** el GIF va por una rama propia que sube el `dataURL` **original**, sin pasar
por canvas. El navegador anima un GIF en `background-image` igual que en un `<img>`, sin
que el motor lo decodifique ni una vez. Con su límite de 4 MB (el mismo que la aduana del
FONDO v1) y, si se pasa, un mensaje que **explica la salida**: recortar, bajar fotogramas
o pasarlo a MP4/WebM.

> Nota: ya existía un camino **FONDO v1** (`/api/fondo`, `FondoLayer`) que sí aceptaba
> `.gif` ≤4 MB y `.mp4`/`.webm` ≤8 MB — pero exige copiar el archivo al proyecto y sirve
> en streaming. Es el camino bueno para un fondo animado pesado; el selector de archivos
> es el camino rápido para una imagen suelta. Ahora los dos aceptan GIF.

### 4.2 «Las imágenes déjalas para seleccionar en el menú»

Antes el menú «Degradados incluidos» solo tenía degradados CSS: las imágenes del cerebro
había que subirlas una a una **cada vez**, y no había forma de volver a una sin volver a
subirla. Añadí tres presets de imagen al mismo menú:

```ts
// src/utils/proSettings.ts — sin tocar el render: preset.css ya se asigna a background-image
{ id: "cerebro-chip",     label: "Cerebro · chip (imagen)",              remoto: true, css: 'url("…")' },
{ id: "cerebro-flujo",    label: "Cerebro · flujo de datos (imagen)",    remoto: true, css: 'url("…")' },
{ id: "cerebro-cristal",  label: "Cerebro · cristal (imagen)",           remoto: true, css: 'url("…")' },
```

Como `AppBackground` asigna `preset.css` directamente a `background-image`, y `url(...)` es
un valor válido de esa propiedad, **no hizo falta ni una línea nueva en el componente**.
Y como ahora el menú ya no es solo de degradados, corregí la etiqueta que decía «Cargan
siempre, sin internet»: habría pasado a ser falsa, y una etiqueta que miente es peor que
no tenerla. Ahora dice «Los degradados cargan siempre; las imágenes necesitan internet».

**Lo que NO hice, y lo digo claro:** el `cerebronico_brain_alive_4s.mp4` **no** puede ser
un preset de este menú. Es vídeo y necesita un `<video>`, no un `background-image`. Su
sitio es el camino **FONDO v1** (que ya soporta `.mp4` ≤8 MB y tiene su capa con velillos y
`prefers-reduced-motion`). Para usarlo: copia el `.mp4` al proyecto y actívalo por
`POST /api/fondo` con `{ "ruta": "assets/tu-video.mp4" }`. Dejarlo en el menú de degradados
habría sido un preset que no se ve: justo el tipo de mentira que perseguimos en esta
entrega.

---

## 5. Ampliación de la base de datos del motor

**Petición:** «hasta el momento los modelos cometen errores en los códigos, amplía su base
de datos en el motor».

La tesis ya estaba escrita en `knowledgeBase.ts` («el conocimiento no debe vivir en el
modelo, debe vivir en el motor»). Lo que faltaba era **llenarla**.

### 5.1 29 entradas nuevas, todas ancladas a ESTE repositorio

`src/engine/kbCodigo.ts` — la regla que me impuse: *si no lo pude verificar en este
repositorio, no lo escribí*. Un pack de reglas inventadas es peor que no tener pack,
porque el modelo obedece con la misma fidelidad una regla falsa.

Reparto real por tabla: **12 `error` · 11 `syntax` · 4 `rule` · 2 `pattern`**.

| Bloque | Entradas | De dónde sale el dato |
|---|---|---|
| **El bundle viejo / versión** | 2 | El defecto que acabas de reportar (`dist/` + fuente única) |
| **React 19** | 5 | `react@19.3.0` instalado; `tsconfig.json` `jsx: react-jsx` |
| **Tailwind v4** | 2 | `tailwindcss@4.3.3`; `@import "tailwindcss"` en `src/index.css`; plugin en `vite.config.ts` |
| **TypeScript 5.9** | 4 | `tsconfig.json`: `strict`, `isolatedModules`, `noFallthroughCasesInSwitch`, `esModuleInterop:false` |
| **ESM del proyecto** | 2 | `package.json` `"type": "module"`; los defectos `require` ya documentados en `server.ts` |
| **Dependencias reales** | 5 | `express@4.22.3`, `lucide-react`, `jszip@3.10.1`, `pdfjs-dist@4.8.69`, `@google/genai` |
| **Errores de modelo** | 5 | Import inventado, marcadores «…», el «aplicado» sin escribir, edit vs rewrite, verificar |
| **Diagnóstico del IDE** | 4 | Puertos reales, preview en blanco, `key` en listas, estado mutado |

Ejemplos de lo que ahora sabe el motor y antes no:

> **`err-esm-require`** — «`require` is not defined. Este defecto ya rompió la v1.0.3 dos
> veces y está documentado en `server.ts`. OJO: `tsc` NO avisa, porque `@types/node`
> declara `require` como global. Compila y falla en ejecución — por eso está aquí.»

> **`err-dist-viejo`** — «SÍNTOMA: el usuario ve dos versiones distintas en la misma
> pantalla. CAUSA: el IDE en marcha sirve `dist/`, y editar `src/` no lo cambia.
> DIAGNÓSTICO RÁPIDO: `rg "CerebróNico V" dist/assets/*.js`»

Estas dos entradas son, literalmente, las dos preguntas que me hiciste hoy. Ahora el
motor se lo dice a cada modelo en el turno en que toca ese tema.

### 5.2 Defecto colateral que encontré de paso: la semilla estaba partida

```ts
constructor(seed = [...KB_SEED, ...MANUAL_ENTRIES])   ← camino 1
static fromJSON() { for (const e of KB_SEED) … }      ← camino 2, MÁS CORTO
```

Dos listas para la misma semilla. Consecuencia real: al recargar la base desde disco (que
es el camino normal en el servidor), **las entradas de los manuales desaparecían** si no
se habían guardado antes. Otra vez la misma enfermedad —dos fuentes de la misma verdad—,
esta vez dentro del motor de conocimiento. Ahora hay una constante
(`SEMILLA_COMPLETA`) que usan los dos caminos, y una prueba que lo verifica.

### 5.3 Cómo se mide que esto sirve (64 comprobaciones)

No me vale decir «el motor sabe más». `tests/motor-datos.test.ts` verifica:

- El pack está bien formado: ids únicos, sin claves repetidas, tablas declaradas.
- La recuperación **acierta** con consultas escritas como las escribiría una persona
  (7 casos: `useRef`, bundle viejo, ESM, Tailwind v4, guarda de Vite, preview en blanco, SDK de Gemini).
- Y lo más importante: **el pack NO desplaza a las reglas del motor** en la puntuación
  (3 casos: destructivo, marcadores, JSON malformado siguen ganando lo suyo).

---

## 6. Validación en caliente: qué se ejecutó de verdad

```
cd ide/backend
npm install                # instalado de verdad, no “debería funcionar”
npx tsc --noEmit           # 0 errores
npm run validar            # 1.779 comprobaciones · 0 fallos · 31 suites · 0 sin correr
npm run build              # vite build + esbuild → dist/ regenerado
```

Detalle de las tres suites nuevas/reparadas:

| Suite | Antes | Después |
|---|---|---|
| `espejosServidor` | En disco pero **no registrada** → nadie la ejecutaba | Registrada · 27 ✅ |
| `formato` (nueva) | — | 47 ✅ |
| `motorDatos` (nueva) | — | 64 ✅ |

**Y el fallo del ZIP original, cazado y corregido:**

```
ANTES:  resiliencia › «todas las suites están registradas en validar.mjs»
        FALLO :: tests/espejosServidor.test.ts
        VEREDICTO: HAY FALLOS — 1 fallo(s) sobre 1641 comprobaciones.
```

Una prueba que existe pero que el runner no ejecuta **no cubre nada**, y además teñía de
rojo el veredicto global. Al registrarla apareció un segundo problema: `validar.mjs` solo
sabía leer el formato «N correctas», y esa suite informa con marcas `✓`; la daba por
«NO llegó a ejecutarse» aunque terminara en verde. Corregido también: el guardián ahora
entiende los dos formatos, porque **confundir «no arrancó» con «arrancó y no usa mi
formato» es presentar un fallo que no existe** — la misma clase de mentira que esa
herramienta existe para evitar.

---

## 7. Ideas de mejora, priorizadas

### 🟢 Corto (menos de un día cada una)

1. **Limpiar los literales de versión en comentarios.** Quedan ~20 comentarios de cabecera
   que dicen `CerebroNico V2.1` en archivos de `src/utils/`. No se ven en pantalla, pero
   son los siguientes candidatos a convertirse en la discrepancia de esta semana.
2. **Exponer el filtro de salida como ajuste.** `activarProtocoloDeCierre(true)` ya existe;
   un interruptor en el panel PRO («respuesta con acta / sin acta») lo haría visible. Útil
   si algún día quieres el formato para un banco de pruebas.
3. **Panel de diagnóstico de versión.** Un botón que muestre: versión de `package.json`,
   de `IDE_BRAND`, fecha del `dist/` y hash del bundle. Cinco líneas, y mata de raíz la
   clase de bug de hoy.
4. **Presets de imagen con caché local.** Hoy necesitan internet. Guardar el archivo en
   `public/` al elegirlo por primera vez lo haría offline para siempre.

### 🟡 Medio (una semana)

5. **Enrutador por complejidad (local ↔ nube).** El diseño está en §3.4. Es el siguiente
   paso natural de tu idea y lo que más tiempo te ahorraría: hoy la decisión es un clic
   manual por turno.
6. **D8 del ROADMAP: métricas reales de inferencia.** Leer `eval_count`,
   `prompt_eval_duration` y `eval_duration` del stream de Ollama y mostrar TTFT y
   tokens/s. Hoy el cliente estima con `len/4`, que es una cifra inventada con buena
   presentación. Es acotado, verificable y no rompe nada — el propio ROADMAP lo marca como
   «la siguiente tarea recomendada».
7. **`syntaxGuard` con `esbuild.transform`.** Validar TS/JSX de verdad antes de escribir.
   El ROADMAP lo anota como código muerto actual y `server.ts` **ya** importa esbuild.

### 🔴 Largo

8. **D7: votación real de los 12 especialistas.** Revisar `DUEÑO_DE` y declarar los que no
   votan. Lo dejo señalado: hoy hay ramas que no existen y el sistema no lo dice.
9. **D9: auto-lección.** Disparar el aprendizaje al recuperar un error de turno (hoy
   escribe en localStorage). El pack de código que acabo de añadir es el sitio natural
   donde aterrizarían esas lecciones.
10. **Git nativo.** El hueco real más grande del proyecto (1,5 semanas según tu ROADMAP).

---

## 8. Cómo verificarlo tú mismo

```bash
cd cerebronico_v8/ide/backend
npm install
npm run validar            # esperado: TODO CORRECTO — 1.779 comprobaciones, 0 fallos
npx tsc --noEmit           # esperado: sin salida
npm run build              # recompila dist/ (obligatorio si tocas src/)

# Las tres comprobaciones directas de los arreglos de hoy:
npx tsx tests/formato.test.ts       # 47 correctas · 0 fallidas
npx tsx tests/motor-datos.test.ts   # 64 correctas · 0 fallidas
rg "V1\.0\.3" src dist              # no debe encontrar nada en lo visible
```

Para ver la versión arreglada en pantalla: `npm run dev` y mira la cabecera y el Menú CN
— las dos deben decir **V8.0.1**.

---

## 9. Límites de esta entrega (lo que no hice)

- **No incluí `dist/server.mjs` ni su sourcemap** en el ZIP, para no añadir 8,5 MB y
  mantener el empaquetado igual que el original (que tampoco lo traía). `npm run build` lo
  regenera.
- **No toqué `agent_bridge_5000.py`** a fondo (D3 del ROADMAP, «falta re-verificar
  allowlist de binarios y `shell=False`»). Sigue pendiente y no lo cuento como hecho.
- **El alias `NEMESIS` es una declaración tuya.** Verifícalo con `ollama show NEMESIS:latest`.
- **El MP4 no está cableado** como preset de menú (ver §4.2). Va por el camino FONDO v1.
- **Queda un literal `CerebroNico V2.1`** en el bundle, dentro de un comentario de
  cabecera: invisible, pero no lo declaro arreglado.
- No inventé cifras de rendimiento. Donde no hay medición, no hay número.

---

## 10. Inventario de cambios

**Archivos nuevos (5)**

| Archivo | Qué es |
|---|---|
| `src/utils/formatFixer.ts` | La aduana de metadatos de cierre |
| `src/engine/kbCodigo.ts` | +29 entradas verificadas para la base del motor |
| `tests/formato.test.ts` | 47 comprobaciones |
| `tests/motor-datos.test.ts` | 64 comprobaciones |
| `INFORME_AUDITORIA_V8.0.1.md` | Este informe |

**Archivos modificados (15)**

| Archivo | Cambio |
|---|---|
| `src/constants.ts` | Una sola semilla de versión (`VERSION_SEMVER = "8.0.1"`) |
| `src/components/Header.tsx` | `title` desde `IDE_BRAND` (fuera el literal `V1.0.3`) |
| `src/components/ChatCenter.tsx` | El render pasa por la aduana (`componerCuerpo`) |
| `src/components/ProConfigPanel.tsx` | Etiqueta del menú corregida (degradados vs imágenes) |
| `src/engine/brain.ts` | Protocolo de cierre opcional y apagado + `SEMILLA` |
| `src/engine/knowledgeBase.ts` | `SEMILLA_COMPLETA` única + pack de código |
| `src/engine/modelTiers.ts` | Alias de modelos renombrados + `aliasDe` |
| `src/utils/engine.ts` | Una sola lista de modelos con herramientas |
| `src/utils/markdownExport.ts` | Informe sin literal de versión |
| `src/utils/proSettings.ts` | 3 presets de imagen en el menú |
| `src/App.tsx` | GIF nativo (accept + sin canvas) |
| `core-agent/agent_core/engine.py` | Contrato de salida (fuera el acta) |
| `cerebro.md` | §7-A pasa de «obligatoria» a «OPCIONAL (v8.0.1)» |
| `scripts/validar.mjs` | 3 suites registradas + parser tolerante a marcas `✓` |
| `index.html` · `package.json` | Versión alineada a `8.0.1` |

**Reconstruido:** `dist/` completo (assets + `index.html`) con `npm run build`.
