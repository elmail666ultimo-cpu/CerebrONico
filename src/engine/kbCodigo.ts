/**
 * kbCodigo.ts — PACK DE CÓDIGO DE LA BASE DE DATOS DEL MOTOR (v8.0.1)
 * ===================================================================
 * Petición que originó este archivo: «hasta el momento los modelos cometen
 * errores en los códigos, amplía su base de datos en el motor».
 *
 * LA TESIS (ya escrita en knowledgeBase.ts, aquí se lleva a la práctica)
 * ---------------------------------------------------------------------
 * El conocimiento no debe vivir en el modelo: debe vivir en el motor. Un modelo
 * de 400 MB no puede saber que este proyecto usa React 19 con
 * `useRef(initialValue)` obligatorio, que Tailwind es v4 y renombró media
 * escala, o que un módulo de `src/` no puede importar `fs` porque el bundle del
 * navegador lo stubea a propósito. El modelo SÍ puede obedecerlo si el motor se
 * lo sirve en el turno exacto.
 *
 * POR QUÉ ESTAS ENTRADAS Y NO OTRAS
 * ---------------------------------
 * Regla de la casa: creer solo lo verificado contra código. Cada entrada de
 * este pack sale de un hecho comprobado en ESTE repositorio —versión instalada
 * en `node_modules`, opción leída en `tsconfig.json`, guarda leída en
 * `vite.config.ts` o defecto ya documentado en el propio código—, no de
 * conocimiento genérico de manual. Lo que no se pudo verificar aquí no está
 * escrito aquí. Un pack de reglas inventadas es peor que no tener pack: el
 * modelo obedece con la misma fidelidad una regla falsa.
 *
 * CÓMO SE MIDE QUE ESTO SIRVE
 * ---------------------------
 * `tests/kbCodigo.test.ts` comprueba tres cosas deterministas: que el pack está
 * bien formado (ids únicos, claves y cuerpo no vacíos), que la recuperación
 * devuelve la entrada correcta para consultas reales, y que el pack NO desplaza
 * a las reglas del motor en la puntuación. «El motor sabe más» sin una prueba
 * que lo demuestre sería otra afirmación sin número detrás.
 *
 * NOTA DE MANTENIMIENTO — LO QUE ESTE PACK CADUCA
 * -----------------------------------------------
 * Estas entradas están atadas a versiones concretas. Cuando se suba React,
 * Tailwind o TypeScript, las entradas afectadas hay que revisarlas: una regla
 * de migración caducada es exactamente el tipo de dato que hace daño con cara
 * de ayuda. Cada entrada lo declara en su título para que sea grepeable.
 */

import type { KbEntry } from "./knowledgeBase";

/** Versiones verificadas en node_modules al escribir este pack (22-sep-2026). */
export const VERSIONES_VERIFICADAS = {
  react: "19.3.0",
  typescript: "5.9.3",
  tailwindcss: "4.3.3",
  express: "4.22.3",
  lucideReact: "1.47.0",
  jszip: "3.10.1",
  pdfjsDist: "4.8.69",
} as const;

export const KB_CODIGO: KbEntry[] = [
  // ============================================================
  // BLOQUE 0 — ADUANA DEL ÁRBOL Y DEL EMPAQUE (v8.0.6)
  // Pedido del usuario: «el modelo debe preguntar qué se agrega al árbol y qué
  // no; se suman archivos que no van en el empaque». Va en tabla `rule` porque
  // es una obligación del motor, no un consejo: las reglas puntúan más alto y
  // no se desplazan por una coincidencia accidental de palabras.
  // ============================================================
  {
    id: "rule-aduana-arbol",
    table: "rule",
    title: "Pregunta antes de añadir al árbol; hay cosas que no entran nunca",
    // UNA sola clave con la palabra «archivo», y no cuatro.
    // La primera versión llevaba «añadir archivo», «agregar archivo», «nuevo
    // archivo» y «crear archivo». Todas contienen «archivo», así que la consulta
    // «borrar un archivo del usuario sin permiso» sumaba 1,0 por CADA una (4,0) y
    // esta entrada desplazaba a `rule-destructive`, que es la que tiene que
    // responder ahí. Lo cazó la prueba «las reglas del motor siguen ganando lo
    // suyo». Una palabra común repetida en cuatro claves no refuerza: desborda.
    keys: [
      "añadir archivo", "árbol", "arbol", "empaque", "empaquetar", "paquete", "zip",
      ".cn", "incluir", "excluir", "basura", "temporal", "adjunto", "recursos",
    ],
    body:
      "Dos obligaciones distintas, y no se sustituyen una a la otra.\n" +
      "(a) PREGUNTA antes de añadir lo que no sea código, configuración o documentación del proyecto: " +
      "imágenes/vídeo, datos (.csv .xlsx .pdf .db), documentos y cualquier extensión desconocida. " +
      "La pregunta lleva la LISTA y el número («¿añado estos 3 o los dejo fuera?»); sin la lista no autoriza nada.\n" +
      "(b) NO AÑADAS NUNCA, ni con permiso explícito, porque el daño no se deshace: " +
      "secretos (.env .pem .key .p12 id_rsa .npmrc .netrc credentials.json .aws/ .ssh/ terraform.tfstate), " +
      "artefactos (node_modules/ .git/ dist/ build/ out/ coverage/ .venv/ __pycache__/ target/ .cache/), " +
      "efímeros (.log .tmp .bak .swp .DS_Store .pid) y el espejo del sandbox (.proyectos/ y proyectos/), " +
      "que duplica el árbol entero.\n" +
      "Y la regla que evita el error de raíz: si dudas de si un archivo pertenece al proyecto, NO lo crees. " +
      "Es más barato preguntar que limpiar: un árbol sucio cuesta más que una pregunta.",
    weight: 1,
  },

  // ============================================================
  // BLOQUE 0.1 — EL ESPEJO DEL PROYECTO (v8.0.7)
  // Pedido del usuario: «siempre se olvida de los archivos de un proyecto; haz
  // una plantilla en el motor de procesos de proyecto e impleméntale su proceso
  // para que lo tenga como espejo».
  // ============================================================
  {
    id: "rule-espejo-proyecto",
    table: "rule",
    title: "Antes de escribir código, comprueba el espejo del proyecto",
    // ⚠️ AQUÍ VOLVÍ A CAER EN EL DESBORDAMIENTO DE CLAVES, y lo cazó la prueba.
    // La primera versión llevaba CUATRO claves que contenían «proyecto»
    // («espejo del proyecto», «plantilla de proyecto», «archivos del proyecto»,
    // «estructura del proyecto»). Cada una sumaba 1,0 en cualquier consulta que
    // dijera «proyecto», así que esta regla desplazaba a `motor-projectporter`
    // («el proyecto está en una subcarpeta») y a `motor-mapa-general` («en qué
    // puerto va el proyecto») — dos respuestas correctas que quedaban enterradas
    // bajo una entrada que no hablaba de eso.
    // La lección, escrita para no repetirla: UNA clave por idea, y la palabra
    // común va en el título, donde sólo puntúa si aparece tal cual.
    // Y a la SEGUNDA pasada le sobraba todavía una: `faltan archivos` y `archivo
    // obligatorio` contienen las dos «archivo», así que seguían sumando 2,0 en
    // «borrar un archivo del usuario sin permiso» y volvían a desplazar a
    // `rule-destructive`. Se queda UNA clave con esa palabra; «faltan» se separa
    // para que la consulta por «falta» siga encontrando la entrada sin arrastrar
    // la palabra común.
    // Y la clave pasa de «espejo del proyecto» a «espejo»: la frase larga se
    // conserva en el TÍTULO (donde puntúa igual y se lee), pero como clave
    // aportaba «proyecto» y con eso empataba a 4,10 con `motor-projectporter` en
    // una consulta que no va de esto. La palabra común fuera de las claves.
    keys: ["espejo", "faltan", "esqueleto", "andamiaje", "scaffold", "completo", "archivo obligatorio"],
    body:
      "«Se olvida de los archivos» no es un error de sintaxis: es no saber cuántos archivos tiene un proyecto de ese tipo, " +
      "escribir dos y darlo por terminado. El resultado es un index.html que enlaza styles.css y script.js inexistentes, " +
      "un Vite sin index.html o un Python sin app/__init__.py. Y una web a la que le falta un archivo se ve EN BLANCO.\n\n" +
      "PROCESO OBLIGATORIO:\n" +
      "1. Identifica el tipo: web estática (sin package.json), Vite+React+TS, servidor Node, API FastAPI o script suelto.\n" +
      "2. Escribe EL CONJUNTO COMPLETO de archivos de ese tipo en el MISMO turno. Nunca anuncies un archivo y lo dejes para después.\n" +
      "3. OBLIGATORIO = sin él no arranca o no se ve. No lo confundas con «recomendado»: un README no es obligatorio.\n" +
      "4. Todo archivo que enlaces desde el código tiene que existir en ese mismo turno (CSS, JS, favicon, imagen).\n" +
      "5. El puerto es 3500 y debe estar escrito en el código, no leído de una variable de entorno que nadie define.\n\n" +
      "Conjuntos mínimos, de memoria: web estática → index.html + styles.css + script.js; " +
      "Vite+React → package.json + vite.config.ts + tsconfig.json + index.html + src/main.tsx + src/App.tsx; " +
      "Node → package.json + server.js; FastAPI → requirements.txt + app/main.py + app/__init__.py.",
    weight: 1,
  },

  // ============================================================
  // BLOQUE 1 — EL DEFECTO QUE MÁS DAÑO HIZO: EL BUNDLE VIEJO
  // ============================================================
  {
    id: "err-dist-viejo",
    table: "error",
    title: "Dos versiones distintas en pantalla ⇒ el bundle dist/ está viejo",
    weight: 1,
    keys: [
      "version", "versión", "dist", "bundle", "recompilar", "build", "cabecera",
      "menu", "menú", "discrepancia", "no se ve el cambio", "sigue igual",
    ],
    body:
      "SÍNTOMA: el usuario ve dos versiones distintas en la misma pantalla (p. ej. cabecera «V8.0.0» y menú CN «V1.0.3»), o dice «apliqué el arreglo y no cambia nada». " +
      "CAUSA: el IDE en marcha sirve `dist/`, y `dist/` es un artefacto compilado. Editar `src/` o `server.ts` NO cambia lo que corre. " +
      "REGLA: cualquier cambio en `src/` o `server.ts` exige `npm run build` (vite build + esbuild) antes de probar. " +
      "Y si el arreglo es de versión, hay que tocar TAMBIÉN la fuente única (`IDE_BRAND` en src/constants.ts), no solo el bundle. " +
      "DIAGNÓSTICO RÁPIDO: buscar el literal de versión dentro del bundle — `rg \"CerebróNico V\" dist/assets/*.js`. Si el bundle dice una versión vieja, el problema es de compilación, no de lógica.",
  },
  {
    id: "rule-fuente-unica-version",
    table: "rule",
    title: "La versión se escribe UNA vez",
    weight: 1,
    keys: [
      "version", "versión", "IDE_BRAND", "constants", "cabecera", "full_name",
      "single source", "fuente unica", "fuente única", "inconsistencia",
    ],
    body:
      "Nunca escribas la versión como literal en un componente, en un título, en un atributo `title`, en un meta tag `og:` ni en un informe. " +
      "Siempre `IDE_BRAND.VERSION` o `IDE_BRAND.FULL_NAME` desde `src/constants.ts`. " +
      "HISTORIA REAL: la regla existía desde la v2.3 y aun así la UI se contradijo, porque `IDE_BRAND` tenía DOS literales (VERSION y FULL_NAME) y la cabecera leía uno mientras el menú leía el otro; además quedaban literales sueltos en `Header.tsx` (atributo title) y en `index.html` (title + og:title + og:description). " +
      "REGLA OPERATIVA: al subir versión, una sola semilla; todo lo demás se deriva. Y busca los literales huérfanos con `rg \"V[0-9]+\\.[0-9]+\" src index.html`.",
  },

  // ============================================================
  // BLOQUE 2 — REACT 19 (19.3.0 instalado, tsconfig jsx: react-jsx)
  // ============================================================
  {
    id: "syn-react19-useref",
    table: "syntax",
    lang: "tsx",
    title: "React 19 — useRef exige argumento inicial",
    weight: 0.95,
    keys: ["react", "19", "useref", "ref", "null", "argumento", "espera 1 argumento"],
    body:
      "En React 19, `useRef<T>()` sin argumento ya NO es válido: hay que pasar el valor inicial. " +
      "Correcto: `const ref = useRef<HTMLInputElement>(null);`. " +
      "Incorrecto: `const ref = useRef<HTMLInputElement>();`. " +
      "Es un error de TIPOS, aparece en `npx tsc --noEmit` (este proyecto tiene `strict: true`), no en tiempo de ejecución: por eso se cuela hasta el build si nadie pasa el comprobador. " +
      "Si el ref no apunta a un nodo, usa `useRef<number>(0)`, `useRef<string>(\"\")` o `useRef<AbortController | null>(null)` según lo que guardes.",
  },
  {
    id: "syn-react19-fc-children",
    table: "syntax",
    lang: "tsx",
    title: "React 19 — React.FC ya no incluye children",
    weight: 0.9,
    keys: ["react", "fc", "functioncomponent", "children", "props", "tipo", "react.fc"],
    body:
      "`React.FC<P>` no añade `children` a las props (se retiró la implicitud). " +
      "Si el componente recibe hijos, se declara explícitamente: `interface Props { children?: React.ReactNode }`. " +
      "Sin eso, `tsc` falla en cada `<MiComponente>…</MiComponente>`. " +
      "En este repositorio `React.FC` se usa en varios componentes: al tocarlos, comprueba las props reales antes de reutilizar el patrón, y no añadas `children` «por si acaso».",
  },
  {
    id: "syn-react19-forwardref",
    table: "syntax",
    lang: "tsx",
    title: "React 19 — forwardRef ya no hace falta",
    weight: 0.85,
    keys: ["react", "forwardref", "ref", "prop", "19"],
    body:
      "En React 19 `ref` es una prop normal de los componentes de función: `function Boton({ ref, ...props })` funciona y `forwardRef` no es necesario. " +
      "No mezcles los dos estilos en el mismo archivo: o el envoltorio con forwardRef de siempre, o la prop directa. " +
      "Mezclarlos produce refs que llegan a `null` sin error visible.",
  },
  {
    id: "syn-react19-api-retiradas",
    table: "syntax",
    lang: "tsx",
    title: "React 19 — APIs que ya no existen",
    weight: 0.9,
    keys: ["reactdom.render", "render", "createroot", "proptypes", "defaultprops", "retirada", "react 19"],
    body:
      "No existen en React 19: `ReactDOM.render` (usa `createRoot`), `ReactDOM.hydrate` (usa `hydrateRoot`), `propTypes` y `defaultProps` en componentes de función (usa valores por defecto en el desestructurado: `function C({ n = 0 })`). " +
      "El proyecto ya arranca con `createRoot` en `src/main.tsx`: si generas código que llama a `ReactDOM.render`, revienta en el primer render, no en el build.",
  },
  {
    id: "err-react-key-lista",
    table: "error",
    lang: "tsx",
    title: "Warning de key en listas: la causa real",
    weight: 0.85,
    keys: ["key", "map", "lista", "warning", "each child", "unique key"],
    body:
      "Cada elemento devuelto por `.map()` en JSX necesita `key` estable. " +
      "Incorrecto: `key={index}` cuando la lista se reordena, se filtra o se borra (React reutiliza el DOM equivocado y el estado de los inputs salta de fila). " +
      "Correcto: el `id` del dato. Si el dato no tiene id, asígnale uno estable al cargarlo, no al pintarlo.",
  },
  {
    id: "pat-efecto-asincrono",
    table: "pattern",
    lang: "tsx",
    title: "useEffect con async: la forma que no filtra",
    weight: 0.9,
    keys: ["useeffect", "async", "await", "cleanup", "limpieza", "abort", "race", "carrera", "desmontado"],
    body:
      "`useEffect(async () => …)` NO es válido: el efecto devuelve una promesa y React espera una función de limpieza o nada. " +
      "La forma correcta es declarar una función async dentro y llamarla, con bandera de cancelación: " +
      "`useEffect(() => { let vivo = true; (async () => { const r = await fetch(u); if (vivo) setDatos(await r.json()); })(); return () => { vivo = false; }; }, [u]);`. " +
      "Sin la bandera hay condición de carrera: la respuesta vieja llega después y pisa a la nueva. Con streaming y modelos locales, la latencia variable lo hace muy visible.",
  },
  {
    id: "err-estado-mutado",
    table: "error",
    lang: "tsx",
    title: "Mutar el estado no re-renderiza",
    weight: 0.8,
    keys: ["estado", "setstate", "push", "muta", "inmutable", "no actualiza", "usestate"],
    body:
      "`items.push(x); setItems(items)` no repinta: es el mismo objeto y React compara por identidad. " +
      "Correcto: `setItems((prev) => [...prev, x])`. Lo mismo con objetos: `setCfg((prev) => ({ ...prev, k: v }))`. " +
      "En este proyecto el patrón correcto ya está usado en todas partes; cópialo del archivo vecino en vez de escribirlo de memoria.",
  },

  // ============================================================
  // BLOQUE 3 — TAILWIND v4 (4.3.3, @import "tailwindcss")
  // ============================================================
  {
    id: "syn-tailwind4-import",
    table: "syntax",
    lang: "css",
    title: "Tailwind v4 — cómo se importa (cambió)",
    weight: 0.95,
    keys: ["tailwind", "v4", "config", "directiva", "at-import", "postcss", "css"],
    body:
      "En Tailwind v4 NO se usa `@tailwind base; @tailwind components; @tailwind utilities;` ni `tailwind.config.js` como fuente principal. " +
      "Este proyecto importa con `@import \"tailwindcss\";` al principio de `src/index.css` y el plugin es `@tailwindcss/vite` (ya está en `vite.config.ts`). " +
      "El tema se declara en CSS con `@theme { --color-…: …; }`, no en un JS de configuración. " +
      "Si generas un `tailwind.config.js` o las tres directivas `@tailwind`, la hoja no compila utilidades y la UI sale sin estilos.",
  },
  {
    id: "syn-tailwind4-renombrados",
    table: "syntax",
    lang: "css",
    title: "Tailwind v4 — utilidades renombradas (rompen en silencio)",
    weight: 0.9,
    keys: [
      "tailwind", "v4", "renombrado", "shadow-sm", "rounded-sm", "outline-none",
      "ring", "escala", "utilidad", "sin estilo",
    ],
    body:
      "v4 desplazó la escala de tamaños un paso: `shadow-sm`→`shadow-xs`, `shadow`→`shadow-sm`, `rounded-sm`→`rounded-xs`, `rounded`→`rounded-sm`. " +
      "`outline-none` pasó a `outline-hidden` (la nueva `outline-none` sí dibuja contorno transparente). " +
      "El modificador `ring` por defecto es más ancho: `ring` → `ring-3`. " +
      "Las opacidades ya no se hacen con `bg-opacity-50` (eliminado): se usa la barra — `bg-black/50`. " +
      "LO PELIGROSO de este bloque: el nombre viejo no siempre da error, simplemente no aplica el estilo y el cambio pasa desapercibido en pantalla.",
  },

  // ============================================================
  // BLOQUE 4 — TYPESCRIPT 5.9 CON LA CONFIG DE ESTE PROYECTO
  // ============================================================
  {
    id: "syn-ts-isolated-modules",
    table: "syntax",
    lang: "typescript",
    title: "tsconfig — isolatedModules obliga a `export type`",
    weight: 0.9,
    keys: ["isolatedmodules", "export type", "import type", "reexport", "tipo", "tsconfig"],
    body:
      "Este `tsconfig.json` tiene `isolatedModules: true`. Al reexportar o importar algo que SOLO es un tipo hay que marcarlo: `export type { Props } from \"./x\"` / `import type { Props } from \"./x\"`. " +
      "Sin el `type`, el compilador no puede saber si el módulo existe en tiempo de ejecución y el build falla o intenta cargar un símbolo que no existe. " +
      "Regla práctica en este proyecto: si el archivo no lo usa como valor (no lo instancia, no lo llama), va con `import type`.",
  },
  {
    id: "syn-ts-strict-null",
    table: "syntax",
    lang: "typescript",
    title: "tsconfig — strict: true y los null que sí importan",
    weight: 0.9,
    keys: ["strict", "null", "undefined", "possibly", "no puede ser null", "optional chaining", "tsconfig"],
    body:
      "Con `strict: true`, `document.getElementById(\"x\")` es `HTMLElement | null` y hay que demostrar que no es null antes de usarlo. " +
      "NO lo silencies con `!` (non-null assertion) salvo que acabes de comprobar la existencia: el `!` es una promesa que le haces al compilador y que él no comprueba. " +
      "Preferido: `const el = document.getElementById(\"x\"); if (!el) return;`. " +
      "Lo mismo con `find()`: devuelve `T | undefined`, no `T`. Y con accesos a respuesta de red: valida antes de encadenar `?.` y `??`.",
  },
  {
    id: "syn-ts-no-fallthrough",
    table: "syntax",
    lang: "typescript",
    title: "tsconfig — switch sin fallthrough",
    weight: 0.8,
    keys: ["switch", "case", "break", "fallthrough", "noFallthroughCasesInSwitch"],
    body:
      "`noFallthroughCasesInSwitch: true` en este proyecto: un `case` sin `break`/`return` que caiga al siguiente es error de compilación. " +
      "Si la caída es INTENCIONADA, se documenta con un comentario `// falls through` justo antes del `case` siguiente. " +
      "Si no lo necesitas, usa `return` dentro de cada caso: en funciones puras del motor es lo más común aquí.",
  },
  {
    id: "err-ts-import-juego",
    table: "error",
    lang: "typescript",
    title: "esModuleInterop: false — cuidado con los default imports",
    weight: 0.85,
    keys: ["esmoduleinterop", "default import", "interop", "no tiene exportación predeterminada", "import"],
    body:
      "Este `tsconfig.json` tiene `esModuleInterop: false` (con `allowSyntheticDefaultImports: true`, que solo relaja el TIPO, no el runtime). " +
      "Significa: si un módulo CommonJS no expone realmente un `default`, `import x from \"pkg\"` compila pero puede fallar al ejecutarse. " +
      "Regla: en código de Node/ESM de este proyecto, usa imports con nombre (`import { x } from \"pkg\"`) o `import * as x from \"pkg\"`; reserva el default para paquetes que lo declaran de verdad (React, express).",
  },

  // ============================================================
  // BLOQUE 5 — EL PROYECTO ES ESM: require no existe
  // ============================================================
  {
    id: "err-esm-require",
    table: "error",
    lang: "typescript",
    title: "require is not defined — el paquete es ESM",
    weight: 1,
    keys: ["require", "esm", "type module", "require is not defined", "dirname", "filename", "import meta"],
    body:
      "`package.json` declara `\"type\": \"module\"`: el código es ESM y `require(...)`, `__dirname` y `__filename` NO existen. " +
      "Este defecto ya rompió la v1.0.3 dos veces (`require(\"jszip\")` y `require(\"node:fs\")` dentro de módulos ESM) y está documentado en `server.ts`. " +
      "Sustituciones: `import x from \"pkg\"`; `import { createRequire } from \"node:module\"` si de verdad hace falta un módulo CJS; `fileURLToPath(import.meta.url)` en lugar de `__dirname`. " +
      "OJO: `tsc` NO avisa de esto, porque `@types/node` declara `require` como global. Compila y falla en ejecución — por eso está aquí.",
  },
  {
    id: "rule-modulo-puro-navegador",
    table: "rule",
    title: "Lo que navega no toca disco (guarda de Vite)",
    weight: 1,
    keys: [
      "fs", "path", "child_process", "node:", "vite", "bundle", "navegador",
      "inversion de dependencia", "inversión de dependencia", "modulo puro", "pool",
    ],
    body:
      "`vite.config.ts` tiene una guarda (`cerebroNodeGuard`) que intercepta cualquier import de `fs`, `path`, `child_process` o `node:*` que venga de código propio y lo sustituye por un stub que LANZA error. " +
      "Motivo: nunca más un módulo de `src/` que no puede vivir en el navegador se cuele en el bundle (el incidente fue `consejo.ts` importando `cargadorEspejos.ts`, que usa `node:fs`). " +
      "REGLA: un módulo que se importa desde el cliente debe ser PURO. Si necesita disco, parte en dos: módulo puro + cargador con el fs en el lado servidor (patrón de `src/engine/reflejo/pool.ts`). " +
      "El síntoma si lo olvidas es un error que parece absurdo («Un módulo de Node intentó llegar al bundle del navegador») pero que apunta exactamente al archivo culpable.",
  },

  // ============================================================
  // BLOQUE 6 — DEPENDENCIAS Y SUS APIs REALES
  // ============================================================
  {
    id: "err-genai-sdk",
    table: "error",
    lang: "typescript",
    title: "Gemini: el SDK es @google/genai, no @google/generative-ai",
    weight: 0.9,
    keys: ["gemini", "genai", "generative-ai", "google", "sdk", "generatecontent", "getgenerativemodel"],
    body:
      "Este proyecto usa `@google/genai` (v2). La API es `new GoogleGenAI({ apiKey })` y `ai.models.generateContent({ model, contents })`. " +
      "NO existen `getGenerativeModel`, `model.startChat` ni `GoogleGenerativeAI` (eso era el SDK viejo `@google/generative-ai`, que aquí no está instalado). " +
      "Error típico del modelo: escribir de memoria la API vieja de Gemini. Antes de tocar este proveedor, mira cómo lo hace `server.ts` y cópialo.",
  },
  {
    id: "err-lucide-icono",
    table: "error",
    lang: "tsx",
    title: "lucide-react: el icono debe existir con ese nombre exacto",
    weight: 0.85,
    keys: ["lucide", "icono", "icon", "no se exporta", "named export", "import"],
    body:
      "`lucide-react` exporta cada icono como export NOMBRADO en PascalCase (`import { Bot, Brain, Check } from \"lucide-react\"`). " +
      "Un nombre que no existe no da un icono vacío: rompe el build. " +
      "Errores frecuentes del modelo: inventar variantes (`RobotIcon`, `BrainIcon2`), usar kebab-case (`bot-icon`) o asumir un export por defecto. " +
      "Si dudas del nombre exacto, compruébalo en el paquete instalado o copia el import de un componente vecino que ya use ese icono.",
  },
  {
    id: "syn-jszip",
    table: "syntax",
    lang: "typescript",
    title: "JSZip 3 — la API real del .cn",
    weight: 0.8,
    keys: ["jszip", "zip", "cn", "generateasync", "comprimir", "empaquetar"],
    body:
      "`jszip` se usa para el contenedor `.cn` / `.zip` del IDE. La API es `const zip = new JSZip(); zip.file(\"ruta\", contenido); await zip.generateAsync({ type: \"blob\" })`. " +
      "Para leer: `await JSZip.loadAsync(arrayBuffer)` y luego `zip.files`. " +
      "Importante: `generateAsync` devuelve una promesa, y en este paquete (ESM) se importa con `import JSZip from \"jszip\"` — no con `require`, que no existe.",
  },
  {
    id: "syn-pdfjs4",
    table: "syntax",
    lang: "typescript",
    title: "pdfjs-dist v4 — es ESM y el worker es .mjs",
    weight: 0.8,
    keys: ["pdf", "pdfjs", "worker", "workerSrc", "mjs", "pdfjs-dist"],
    body:
      "`pdfjs-dist` en v4 es ESM: el worker se apunta a un `.mjs`, no a un `.js`. " +
      "En este repo el worker servido es `assets/pdf.worker.min-*.mjs` (ver `dist/`), y `GlobalWorkerOptions.workerSrc` debe apuntar a esa ruta real. " +
      "Si escribes `pdf.worker.min.js` (nomenclatura de v3) o el worker queda sin configurar, la extracción falla con un error de módulo, no con un mensaje de PDF.",
  },
  {
    id: "err-express-types5",
    table: "error",
    lang: "typescript",
    title: "express 4 en runtime con @types/express 5 — no pelees con los tipos",
    weight: 0.8,
    keys: ["express", "types", "request", "response", "handler", "tipos", "mismatch"],
    body:
      "Aquí corre `express` 4.x mientras los tipos declarados son `@types/express` 5.x: hay sitios donde el tipo del handler no encaja al 100 % con el `app.get` de v4. " +
      "REGLA: no cambies la versión de express para callar un error de tipos (rompería el runtime). Anota el tipo explícitamente en el borde: `(req: Request, res: Response) => …` e importa `Request`/`Response` de `express`. " +
      "Y responde SIEMPRE: una ruta que no llama a `res.*` deja la petición colgada y el front esperando para siempre.",
  },

  // ============================================================
  // BLOQUE 7 — ERRORES DE MODELO QUE NO SON DE SINTAXIS
  // ============================================================
  {
    id: "err-import-inventado",
    table: "error",
    title: "Import inventado / paquete que no está instalado",
    weight: 1,
    keys: ["import", "cannot find module", "no instalado", "inventado", "dependencia", "hallucination"],
    body:
      "El error más caro de los modelos: importar lo que «debería existir». Un paquete, un helper o un archivo que suena razonable pero no está. " +
      "REGLA: antes de importar cualquier cosa que no hayas visto en este turno, compruébala — `rg` en el repositorio para archivos/símbolos, o `package.json` para paquetes. " +
      "Y NUNCA añadas una dependencia nueva sin pedirlo: instalar un paquete es una decisión del usuario, no un detalle de implementación. Si crees que hace falta, dilo y propón la alternativa sin dependencia.",
  },
  {
    id: "err-marcadores-inventados",
    table: "error",
    title: "Código con «…» o «resto igual» no es código",
    weight: 1,
    keys: ["...", "omitido", "resto", "placeholder", "marcador", "truncado", "no compila"],
    body:
      "Un archivo entregado con `// … resto del código` o `/* igual que antes */` no se puede compilar ni guardar: el motor rechaza la escritura si detecta marcadores. " +
      "Si el archivo es largo, la ruta correcta es estructural: escribe primero la parte nueva y completa el resto con `edit_file` (buscar/reemplazar con contexto único). " +
      "Regla de oro: lo que entregas tiene que poder pegarse tal cual y funcionar.",
  },
  {
    id: "err-declarar-sin-verificar",
    table: "error",
    title: "«Aplicado» sin haberlo escrito: el defecto del propio modelo",
    weight: 1,
    keys: ["aplicado", "hecho", "listo", "terminado", "sin verificar", "mentira", "afirmacion"],
    body:
      "Caso REAL de este proyecto: el modelo respondió «Filtro de salida aplicado; metadatos ocultos en el flujo de respuesta» y `src/utils/formatFixer.ts` NO existía en el repositorio. El usuario lo descubrió buscando el archivo. " +
      "REGLA: no hay «hecho» sin archivo escrito en disco, sin endpoint declarado o sin prueba que pase. Si no pudiste escribirlo (falta de herramienta, de ruta o de contexto), dilo explícitamente: " +
      "«no lo escribí, aquí está el código para que lo pegues» es una respuesta buena; «aplicado» cuando no lo está es la peor.",
  },
  {
    id: "rule-editar-no-reescribir",
    table: "rule",
    lang: "typescript",
    title: "Cambios pequeños con edit_file, no reescribiendo el archivo",
    weight: 0.95,
    keys: ["edit_file", "write_file", "reescribir", "tokens", "lento", "rendimiento", "parche"],
    body:
      "Reescribir un archivo de 800 líneas para cambiar tres cuesta miles de tokens y, con un modelo local, minutos de espera: es la causa principal de que el IDE «parezca colgado». " +
      "Usa `edit_file` con un bloque de búsqueda ÚNICO (incluye contexto suficiente para que aparezca una sola vez; el motor rechaza 0 o >1 coincidencias). " +
      "Y no reescribas un archivo entero «para que quede más limpio» si nadie lo pidió: cada línea que no cambias es una línea que no puedes romper.",
  },
  {
    id: "rule-verificar-antes-de-entregar",
    table: "rule",
    lang: "typescript",
    title: "Comprobación mínima antes de decir que el código está bien",
    weight: 1,
    keys: ["tsc", "validar", "prueba", "test", "compilar", "verificar", "no rompe"],
    body:
      "Antes de entregar código de este proyecto, pasa al menos: `npx tsc --noEmit` (errores de tipo) y `npm run validar` (1.600+ comprobaciones del motor). " +
      "Si tocaste `src/` o `server.ts`, falta además `npm run build`: sin él, lo que el usuario ejecuta sigue siendo el bundle viejo (ver entrada «Dos versiones distintas en pantalla»). " +
      "Si algo de esto no se puede ejecutar en tu entorno, DILO en una frase. Un «no pude compilarlo» vale más que un «debería funcionar».",
  },
  {
    id: "err-puerto-ocupado-sandbox",
    table: "error",
    title: "Puertos del proyecto: quién escucha en cada uno",
    weight: 0.85,
    keys: ["puerto", "3000", "3500", "5000", "11434", "eaddrinuse", "sandbox", "bridge", "ollama"],
    body:
      "Mapa fijo: IDE 3000 · sandbox/preview 3500 · puente Python de la PC 5000 · Ollama 11434. " +
      "NUNCA reutilices 3000 para el sandbox: el síntoma es que la previsualización se sirve a sí misma y el editor web aparece «en blanco» o en bucle. " +
      "`EADDRINUSE` significa que ya hay un proceso en ese puerto: cierra el anterior o cambia de puerto; no reinicies en bucle ni mates procesos del usuario sin pedirlo.",
  },
  {
    id: "pat-preview-en-blanco",
    table: "pattern",
    title: "El preview sale en blanco: qué mirar en orden",
    weight: 0.8,
    keys: ["preview", "blanco", "no carga", "sandbox", "index.html", "iframe"],
    body:
      "Orden de comprobación, de lo más probable a lo menos: " +
      "1) el HTML no es completo (falta `<!doctype html>`, `<head>` o `<body>`); " +
      "2) el archivo no está en la RAÍZ del proyecto (el sandbox sirve la raíz); " +
      "3) el script apunta a un archivo que no existe o a una ruta absoluta de disco; " +
      "4) un error de JS en consola aborta el render antes de pintar nada. " +
      "El 90 % de los «está en blanco» es el punto 1.",
  },
];
