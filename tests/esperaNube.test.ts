/**
 * tests/esperaNube.test.ts — REGRESIÓN de la v1.6.16
 * ==========================================================================
 * Se ejecuta con:  node node_modules/tsx/dist/cli.mjs tests/esperaNube.test.ts
 *
 * El fallo, tal como lo dijo el usuario: «los modelos cloud tardan una
 * eternidad en contestar».
 *
 * La auditoría del camino de `/api/ai/stream` encontró esto:
 *
 *   · NINGUNO de los `fetch` a proveedores cloud llevaba `signal`,
 *     `AbortSignal` ni timeout.
 *   · El único límite era el watchdog global de 8 MINUTOS.
 *   · El timeout de 3 min que sí existía (`OLLAMA_CONNECT_TIMEOUT_MS`) se
 *     aplicaba SOLO a Ollama. La nube estaba descubierta.
 *
 * Consecuencia: si un proveedor se quedaba mudo antes de la primera cabecera
 * —lo típico en un tier gratuito saturado— la interfaz esperaba hasta ocho
 * minutos SIN UN SOLO AVISO. No colgada y no con error: esperando.
 *
 * Esta suite impide que eso vuelva. Comprueba que toda llamada a internet
 * desde el servidor pase por el guardián de primer byte, y que el guardián
 * corte ANTES de la primera cabecera y NO después (abortar a mitad de una
 * generación larga sería peor que esperar).
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

let pasadas = 0;
let falladas = 0;

function afirmar(titulo: string, condicion: boolean, detalle = ""): void {
  if (condicion) {
    pasadas++;
    console.log(`  ✔ ${titulo}`);
  } else {
    falladas++;
    console.error(`  ✘ ${titulo}${detalle ? `\n      ${detalle}` : ""}`);
  }
}

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVIDOR = fs.readFileSync(path.join(RAIZ, "server.ts"), "utf-8");

console.log("\n⏱️  Techo de espera para la nube — regresión de la «eternidad»\n");

/* ------------------------------------------------------------------
   1. EL GUARDIÁN EXISTE Y TIENE EL CONTRATO CORRECTO
   ------------------------------------------------------------------ */
const mTimeout = SERVIDOR.match(/const CLOUD_FIRST_BYTE_TIMEOUT_MS\s*=\s*([0-9_]+)/);
afirmar("Existe un techo de espera para la nube", !!mTimeout, "no se encontró CLOUD_FIRST_BYTE_TIMEOUT_MS");

if (mTimeout) {
  const ms = Number(mTimeout[1].replace(/_/g, ""));
  /* Tiene que ser MUCHO menor que el watchdog de 8 min: si no, no sirve de nada. */
  afirmar(
    "El techo corta mucho antes del watchdog global de 8 min",
    ms < 8 * 60 * 1000,
    `declarado: ${ms / 1000}s frente a los 480s del watchdog`
  );
  /* Y no tan corto como para matar a un proveedor legítimamente lento. */
  afirmar(
    "El techo deja margen suficiente a un proveedor lento pero vivo",
    ms >= 20_000,
    `declarado: ${ms / 1000}s — por debajo de 20s se cortarían respuestas válidas`
  );
}

afirmar("Existe el envoltorio fetchCloud", /async function fetchCloud\s*\(/.test(SERVIDOR));

/* ------------------------------------------------------------------
   2. TODAS LAS LLAMADAS A INTERNET PASAN POR EL GUARDIÁN
   ------------------------------------------------------------------
   Es el corazón de la suite. Un solo `fetch` crudo a un proveedor reintroduce
   el fallo entero para ese proveedor, y sería invisible desde fuera.
   ------------------------------------------------------------------ */
/* Se apunta a INTERNET, no a todo `fetch`. El servidor tiene ~24 `fetch` más
   y son legítimos: el puente PC (`127.0.0.1:5000`), el trabajador local, los
   `/api/tags` de Ollama y el sondeo del sandbox. Todos son locales o tienen ya
   su propio AbortController (la rama Ollama, con su plazo de 3 min pensado para
   la carga del modelo en disco lento). Lo que NO puede quedar suelto es una
   salida a internet. */
const crudosInternet = [
  ...(SERVIDOR.match(/await fetch\("https:\/\//g) || []),
  ...(SERVIDOR.match(/await fetch\(endpoint/g) || []),
];
afirmar(
  "No queda ninguna salida a internet sin techo de primer byte",
  crudosInternet.length === 0,
  `encontradas ${crudosInternet.length} — cada una puede volver a esperar hasta 8 minutos`
);

const protegidos = (SERVIDOR.match(/await fetchCloud\(/g) || []).length;
afirmar(
  "Los proveedores cloud del camino de chat están cubiertos",
  protegidos >= 10,
  `solo ${protegidos} llamadas con techo; se esperaban al menos 10 (9 proveedores + Custom)`
);

/* Nombra a los proveedores para que el fallo no pueda volver por uno solo. */
const hostsEsperados = [
  "openrouter.ai",
  "api.openai.com",
  "api.z.ai",
  "api.groq.com",
  "api.cerebras.ai",
  "api.together.xyz",
  "api.mistral.ai",
  "api.deepseek.com",
  "api.fireworks.ai",
];
const sinCubrir = hostsEsperados.filter((h) => !SERVIDOR.includes(`fetchCloud("https://${h}`));
afirmar(
  "Los nueve proveedores cloud con `fetch` tienen su techo",
  sinCubrir.length === 0,
  `sin cubrir: ${sinCubrir.join(", ")}`
);

/* ------------------------------------------------------------------
   3. GEMINI: EL SDK TAMBIÉN TIENE TECHO
   ------------------------------------------------------------------
   Gemini no pasa por `fetch` (usa el SDK), así que `fetchCloud` no lo cubre.
   Y es el que más lo necesita: su failover prueba hasta 5 modelos EN SERIE.
   ------------------------------------------------------------------ */
afirmar(
  "Gemini pasa `abortSignal` al SDK",
  /abortSignal:\s*ctrlGemini\.signal/.test(SERVIDOR),
  "sin abortSignal, un modelo mudo multiplica la espera por cada modelo de la cadena"
);

/* ------------------------------------------------------------------
   4. EL TECHO CUBRE SOLO LA PRIMERA CABECERA
   ------------------------------------------------------------------
   Abortar la espera de las cabeceras: correcto.
   Abortar una vez que el stream ya fluye: mataría generaciones largas
   legítimas — un fallo peor que el que se arregla.
   ------------------------------------------------------------------ */
const cuerpoFetchCloud = SERVIDOR.slice(
  SERVIDOR.indexOf("async function fetchCloud"),
  SERVIDOR.indexOf("async function fetchCloud") + 1200
);
afirmar(
  "El guardián limpia su temporizador en `finally` (solo vigila la espera)",
  /finally\s*\{[\s\S]*clearTimeout\(temporizador\)/.test(cuerpoFetchCloud),
  "sin el clearTimeout el techo seguiría corriendo durante toda la generación"
);
afirmar(
  "El guardián da un motivo legible, no un «AbortError» pelado",
  /sin respuesta de \$\{anfitrion\}/.test(cuerpoFetchCloud),
  "el usuario vería un error críptico en vez de saber que se cortó la espera"
);

/* ------------------------------------------------------------------
   5. EL GUARDIÁN NO ES UN SUSTITUTO DEL STREAMING
   ------------------------------------------------------------------
   Si alguien «arreglara» la lentitud acumulando la respuesta entera antes de
   mandarla, el techo de primer byte seguiría en verde y la lentitud volvería.
   Se comprueba que el reenvío siga siendo token a token.
   ------------------------------------------------------------------ */
afirmar(
  "El reenvío sigue siendo token a token (no se acumula la respuesta)",
  /ctx\.sendChunk\(content\)/.test(SERVIDOR),
  "el streaming se perdió: el usuario vería la lentitud aunque la nube fuera rápida"
);

/* ------------------------------------------------------------------
   6. EL SUELO DEL SELECTOR DE TAMAÑO YA NO ESTÁ EN 14
   ------------------------------------------------------------------
   «Tengo los ajustadores al mínimo y está todo grande»: el rango empezaba
   en 14 px, así que el mínimo real lo ponía el código, no el usuario.
   ------------------------------------------------------------------ */
const constantes = fs.readFileSync(path.join(RAIZ, "src", "constants.ts"), "utf-8");
const mSizes = constantes.match(/APP_FONT_SIZES\s*=\s*\[([^\]]+)\]/);
afirmar("Existe la fuente única APP_FONT_SIZES", !!mSizes);
if (mSizes) {
  const tamanos = mSizes[1].split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
  afirmar(
    "El selector de tamaño baja por debajo de 14px",
    Math.min(...tamanos) < 14,
    `mínimo actual: ${Math.min(...tamanos)}px — el usuario no puede reducirlo más`
  );
  afirmar("El selector conserva el rango superior hasta 25px", Math.max(...tamanos) >= 25);
}

const app = fs.readFileSync(path.join(RAIZ, "src", "App.tsx"), "utf-8");
const literalesTope = (app.match(/appFontSize\s*>=\s*14/g) || []).length;
afirmar(
  "App.tsx no vuelve a recortar con el literal 14 (lee los topes de la fuente única)",
  literalesTope === 0,
  `quedan ${literalesTope} comparaciones con el literal 14`
);

/* ------------------------------------------------------------------
   7. LA INFLACIÓN DE LOS OVERRIDES DE TAILWIND
   ------------------------------------------------------------------
   Los overrides `.text-*` llevan `!important` y se aplican a casi toda la
   interfaz. Inflaban entre un 7 % y un 22 % sobre el valor nativo de
   Tailwind, y esa era la razón de fondo de «está todo grande».
   ------------------------------------------------------------------ */
const css = fs.readFileSync(path.join(RAIZ, "src", "index.css"), "utf-8");
const nativos: Record<string, number> = {
  "text-\\[9px\\]": 0.6,
  "text-\\[10px\\]": 0.6667,
  "text-\\[11px\\]": 0.7333,
  "text-xs": 0.75,
  "text-sm": 0.875,
};
const inflados: string[] = [];
for (const [clase, nativo] of Object.entries(nativos)) {
  const re = new RegExp(`\\.${clase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{\\s*font-size:\\s*([0-9.]+)rem`);
  const m = css.match(re);
  if (!m) { inflados.push(`${clase}: no encontrada`); continue; }
  const actual = parseFloat(m[1]);
  const exceso = (actual / nativo - 1) * 100;
  if (exceso > 10) inflados.push(`${clase}: ${actual}rem vs ${nativo}rem nativo (+${exceso.toFixed(0)} %)`);
}
afirmar(
  "Ningún override de Tailwind infla su clase más de un 10 % sobre el valor nativo",
  inflados.length === 0,
  inflados.join(" · ")
);

/* ------------------------------------------------------------------
   8. EL NOMBRE PRINCIPAL ES EL TÍTULO MÁS ALTO
   ------------------------------------------------------------------
   «Lo que está chico es el nombre principal de CerebróNico V…».
   ------------------------------------------------------------------ */
const header = fs.readFileSync(path.join(RAIZ, "src", "components", "Header.tsx"), "utf-8");
afirmar(
  "El nombre del producto usa el papel más alto de la escala (cn-hero)",
  /className="cn-hero[^"]*">\s*\{IDE_BRAND\.NAME\}/.test(header),
  "el nombre de la aplicación volvió a un tamaño secundario"
);

console.log(
  `\n  ${falladas === 0 ? "✔" : "✘"} Espera en la nube: ${pasadas} correctas, ${falladas} fallidas.\n`
);

if (falladas > 0) process.exit(1);
