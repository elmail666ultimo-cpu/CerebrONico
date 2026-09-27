# INFORME V8.0.4 — AUDIO · SANDBOX · CONSOLA

> Cuatro reportes tuyos, tres causas raíz encontradas, y dos cosas que **no** hice.
> Verificación: **2073 comprobaciones · 0 fallos · 34 suites · 0 errores de tipo**.

---

## 1. «Sale siempre la voz robótica standard»

### 1.1 Por qué salía SIEMPRE (no a veces)

El código decía, literalmente:

```ts
const voices = synth.getVoices();
const esVoice = voices.find((v) => v.lang.startsWith("es"));
if (esVoice) utter.voice = esVoice;
```

Dos fallos independientes, y **cada uno basta por sí solo** para producir lo que
oías:

1. **`getVoices()` devuelve lista VACÍA la primera vez.** Las voces del sistema se
   cargan de forma asíncrona; el navegador avisa por `voiceschanged` cuando ya
   están. Ese evento **no se escuchaba nunca**. Con la lista vacía, `find()` no
   encontraba nada, **no se asignaba `utter.voice`**, y sonaba la voz por defecto
   del sistema. En Linux esa por defecto es eSpeak: el sintetizador robótico de
   siempre. No fallaba por casualidad: fallaba **por construcción**.
2. **El primero de la lista no es el mejor.** El orden de `getVoices()` no está
   normalizado por nadie.

### 1.2 Y había un segundo problema encima: el fallo de Gemini se tragaba

Elegir «Gemini · Aoede» en el selector hacía una petición a `/api/tts/gemini`.
Ese endpoint exige la clave **en el entorno del servidor** (`GEMINI_API_KEY`);
la interfaz **nunca manda la cabecera** (`x-gemini-key` no aparece ni una vez en
todo `src/`). Cuando falta, el servidor contesta `503` con un `motivo` claro… y el
cliente hacía:

```ts
if (!res.ok || !data?.ok || !data?.audioBase64) return false;   // ← y aquí se perdía la explicación
```

Silencio → voz del navegador → robótica. Desde fuera, «el botón de audio no
funciona». La causa real era invisible.

### 1.3 El arreglo

| Qué | Antes | Ahora |
|---|---|---|
| Lista de voces | Se leía una vez, casi siempre vacía | Se cachea y se escucha `voiceschanged` |
| Elección | El primer `es` que aparezca | Se puntúan **todas** (`src/utils/voz.ts`, puro) |
| Prioridad | — | **idioma > no-robótica > natural** |
| Voz robótica | Se usaba en silencio | Se usa **pero se avisa** |
| Fallo de Gemini | `return false`, mudo | Se enseña el `motivo` del servidor |

Sobre la prioridad, que es la decisión discutible: **una voz natural inglesa
leyendo español se entiende PEOR que una robótica en español.** Por eso otro
idioma resta (−60) en vez de simplemente no sumar, y una eSpeak en español
(40−50 = −10) le gana a una Microsoft inglesa (−60+30 = −30). Para leer en voz
alta el idioma no es una preferencia: es un requisito.

---

## 2. El registro del sandbox: la contradicción

Tu log, en dos líneas consecutivas:

```
SYNC · 1 archivo(s) escrito(s) en .proyectos/.
No se pudo arrancar: No hay proyecto en el sandbox (.proyectos): no se encontró
ningún marcador reconocido (package.json, index.html, requirements.txt…).
```

Lo primero que hice fue dejar de tratar esto como un misterio y buscar la
contradicción. Está en el código, y son tres defectos encadenados:

### 2.1 La comprobación de «proyecto estático» miraba solo la raíz

```ts
...(fs.existsSync(path.join(PROJECT_ROOT, "index.html"))    // ← SOLO la raíz
```

El sync escribe el árbol **con su carpeta contenedora**, así que lo normal es que
la web acabe en `.proyectos/<carpeta>/index.html`. Ahí `hasProject` quedaba en
`false` con la web perfectamente escrita en disco.

**Arreglo:** si no hay `index.html` en la raíz, se busca en subcarpetas (hasta 3
niveles, sin entrar en `node_modules`/`dist`/etc.) y se declara **dónde** está.
Nota deliberada: **no se saltan las carpetas que empiezan por punto** — el motor
usa nombres como `.proyectos`, y saltárselos por reflejo es parte de por qué este
caso tardó tanto en verse.

### 2.2 El mensaje no solo era falso: **daba una orden al modelo**

```
AUTO · ❌ No se encontró package.json en el sandbox tras sincronizar.
AUTO · Solución: asegúrate de que tu workspace tenga un package.json.
```

El sandbox acepta una decena de marcadores; una web con `index.html` es un
proyecto válido que **no necesita npm**. Decir «falta package.json» es
diagnosticar la enfermedad equivocada. Y lo caro es la segunda mitad: es una
**instrucción**. El modelo la leyó y contestó —tu propio texto— *«el sandbox no
tiene un proyecto reconocido. Voy a crear un proyecto Node.js básico»*. Se puso a
montar un proyecto npm que no necesitabas **por culpa de una frase nuestra**.

**Arreglo:** el mensaje ahora dice dónde se buscó, qué había en la raíz, y qué
marcadores sirven de verdad (con `index.html` primero, porque no requiere npm).

### 2.3 `.proyectos/` es una ruta relativa y no permite verificar nada

**Arreglo:** el estado del sandbox devuelve `raizSandbox` y
`raizProyectoResuelta` **en absoluto**, y el log del SYNC los imprime. Con eso, un
solo Sync zanja la duda de si el archivo aterrizó donde el detector mira.

### 2.4 El preview en blanco ya no puede quedarse mudo

En el servidor estático del sandbox (el que sirve `:3500`), si no había
`index.html` **toda** petición acababa en un 404 de texto plano. En pantalla eso
es una página en blanco sin una pista. Ahora:

1. Si no hay `index.html` en la raíz pero hay **un solo** subdirectorio con
   `index.html`, **sirve ese**. Muchas veces esto arregla el preview y punto.
2. Si no aparece, sirve una **página de diagnóstico en HTML** (no un 404 de
   texto) con la raíz real, lo que hay dentro y dónde ha visto algún `index.html`.
3. Si el `index.html` existe pero pesa **0 bytes**, lo dice: una escritura a
   medias produce exactamente una página blanca.
4. Nuevo `/__cn_info` en JSON, para que la interfaz lo consulte.

---

## 3. La consola ejecutó el texto de una herramienta

```
$ run_command command="cd .proyectos/mi-proyecto && npm start
"run_command" no se reconoce como un comando interno o externo…
```

Léelo despacio: **el shell ejecutó el TEXTO de una llamada a herramienta**.
`run_command` es el nombre de una herramienta del motor y `command="…"` su
parámetro. El modelo lo escribió como texto, y la consola —que acepta cualquier
cadena y la pasa a `cmd.exe`— lo intentó ejecutar tal cual.

**Por qué esto importa más de lo que parece:** la consola es la puerta más
peligrosa del proyecto. Hoy llegó el texto de una herramienta; mañana llega un
`rm -rf` desde una llamada mal formada y **sí hace algo**. Una puerta que ejecuta
lo que le pongan necesita distinguir «comando» de «resto».

### El arreglo: desenvolver si se puede, negarse si no

Cuando el modelo escribe eso, su intención es inequívoca: quiere ejecutar
`cd .proyectos/mi-proyecto && npm start`. Negarse a secas sería obedecer la letra
y traicionar la intención —y el modelo volvería a intentarlo. Así que se
**desenvuelve**, se ejecuta lo de dentro y se deja constancia.

Y si tras desenvolver sigue pareciendo una llamada de herramienta (anidada, o
`path="x.ts" content="…"`, que son **parámetros** y no un comando), entonces **no
se ejecuta nada** y se devuelve el motivo con la forma correcta.

Módulo puro `src/engine/comandoEntrante.ts`, conectado en **las dos puertas**:
la herramienta `run_command`/`run_tests` y el endpoint `/api/exec`.

---

## 4. Lo que NO hice (y por qué)

Tres de tus cinco peticiones se quedan fuera de esta entrega. No las doy por
hechas:

- **«X de cerrar en toda ventana o pestaña».** Es mecánico pero toca varias
  superficies (pestañas del centro, panel «Editor Web & IA», ventanas flotantes) y
  no lo he tocado. Existe ya `closeCenterTab`, así que el trabajo es añadir el
  botón en cada cabecera y conectar al cierre que ya funciona.
- **«Separar el reproductor web y el chat».** Requiere un divisor arrastrable
  entre el panel del editor y el lienzo del preview, y decidir si «separar»
  significa divisor redimensionable o ventana independiente. Prefiero
  preguntártelo antes de construirlo entero.
- **«El sandbox tardó muchísimo».** No lo he medido, así que no te voy a dar una
  causa inventada. Lo que sí puedo decir con lo visto: el piloto automático
  reintentaba en bucle (4:32:59, 4:33:01, 4:33:02…), y cada vuelta sincroniza el
  workspace entero. Con el proyecto mal detectado, **el bucle no podía terminar
  bien nunca** — el 2.1/2.2 lo arregla, y es razonable que parte de la lentitud
  fuera eso. Para el resto necesitaría tu log con marcas de tiempo reales.

---

## 5. Evidencia

```
npx tsc --noEmit .................... 0 errores
npm run validar ..................... 2073 comprobaciones · 0 fallos · 34 suites
tests/consola-voz.test.ts (nueva) ... 69 correctas · 0 fallidas
```

La suite nueva incluye el **caso exacto de tu terminal** (con su salto de línea y
su comilla final) y comprueba que `run_command path="x.ts"` **no se ejecuta**. Las
dos pruebas que fallaron al escribirlas —comillas escapadas en el anidado, y
`path=` colándose como comando— eran defectos reales del módulo, no de las
pruebas, y quedan documentadas en el código.

---

## 6. Cómo comprobar tú mismo el problema del sandbox

En el ZIP que te entrego, abre la pestaña «Consola» del panel derecho y pulsa
**Sync**. Ahora verás una línea con la **ruta absoluta** real del sandbox y, si no
hay proyecto, **qué archivos hay ahí dentro**. Compárala con la carpeta donde el
modelo escribió:

- Si coinciden y aparece `index.html` → debe arrancar; si no, el motivo exacto
  está en el propio `:3500` (ya no sale en blanco).
- Si **no** coinciden → ahí está la causa, y el nuevo mensaje lo dirá con nombres
  y rutas en vez de «no hay proyecto».
