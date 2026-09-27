/**
 * tests/escalaTipografica.test.ts — REGRESIÓN de la v1.6.15
 * ==========================================================================
 * Se ejecuta con:  npx tsx tests/escalaTipografica.test.ts
 *
 * El fallo, tal como lo describió el usuario: «siempre el título es más grande
 * que el contenido» y «hoy tengo todos los controles de texto al mínimo y aun
 * así salen carteles grandes».
 *
 * No era cuestión de gusto. Eran dos defectos medibles:
 *
 *   1. NO HABÍA JERARQUÍA. El título de la ventana del catálogo usaba `text-sm`
 *      y el párrafo de debajo también: un cartel pesaba igual que su contenido.
 *   2. EL SUELO ESTABA PUESTO. `.text-xs { font-size: .867rem !important }`
 *      impedía bajar de ahí, así que el selector de tamaño al mínimo no tenía
 *      nada que reducir. El control existía, pero era mudo por abajo.
 *
 * Esta suite comprueba las dos cosas como INVARIANTES, no como intenciones:
 * que la escala sea estrictamente decreciente y que las clases semánticas se
 * declaren DESPUÉS de los overrides de Tailwind. Si alguien reordena el CSS o
 * cambia un token por capricho, esto falla.
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

/* ESM: no hay `__dirname`. Se deriva de la propia URL del módulo. */
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(RAIZ, "src", "index.css"), "utf-8");

/** Lee `--nombre: 1.2rem;` del bloque :root. */
function token(nombre: string): number {
  const m = CSS.match(new RegExp(`--${nombre}:\\s*([0-9.]+)rem`));
  if (!m) throw new Error(`No existe el token --${nombre} en index.css`);
  return parseFloat(m[1]);
}

console.log("\n📐 Escala tipográfica única — jerarquía por construcción\n");

/* ------------------------------------------------------------------
   1. ORDEN ESTRICTO DE LOS SEIS PAPELES
   ------------------------------------------------------------------ */
const PAPELES = ["cn-t-hero", "cn-t-title", "cn-t-sub", "cn-t-body", "cn-t-label", "cn-t-meta"];
const valores = PAPELES.map((p) => ({ papel: p, rem: token(p) }));

console.log("  Valores declarados:");
for (const { papel, rem } of valores) console.log(`    ${papel.padEnd(12)} ${rem}rem`);

let ordenado = true;
let primerDesorden = "";
for (let i = 1; i < valores.length; i++) {
  if (!(valores[i - 1].rem > valores[i].rem)) {
    ordenado = false;
    primerDesorden = `${valores[i - 1].papel} (${valores[i - 1].rem}rem) NO es mayor que ${valores[i].papel} (${valores[i].rem}rem)`;
    break;
  }
}
afirmar(
  "La escala es estrictamente decreciente: hero > title > sub > body > label > meta",
  ordenado,
  primerDesorden
);

/* El caso concreto que reportó el usuario: un título tiene que poder distinguirse
   de su contenido. Un 5% de diferencia no se percibe; se exige un salto real. */
const saltoTituloCuerpo = token("cn-t-title") / token("cn-t-body");
afirmar(
  "El título de ventana supera al cuerpo en al menos un 20% (jerarquía perceptible)",
  saltoTituloCuerpo >= 1.2,
  `ratio actual: ${saltoTituloCuerpo.toFixed(3)}× — un cartel y su contenido se ven iguales`
);

/* El subtítulo no puede confundirse con el cuerpo ni con el título. */
afirmar(
  "El subtítulo queda estrictamente entre el título y el cuerpo",
  token("cn-t-sub") < token("cn-t-title") && token("cn-t-sub") > token("cn-t-body")
);

/* ------------------------------------------------------------------
   2. LAS CLASES SEMÁNTICAS MANDAN SOBRE LOS OVERRIDES DE TAILWIND
   ------------------------------------------------------------------
   Los overrides `.text-xs` / `.text-sm` llevan `!important`. Las clases
   `.cn-*` también. A igualdad de especificidad y de `!important`, gana LA
   ÚLTIMA DEL ARCHIVO. Si alguien mueve el bloque de la escala por encima de
   los overrides, los títulos volverían a encogerse EN SILENCIO: es
   exactamente el fallo que esta suite existe para impedir.
   ------------------------------------------------------------------ */
const posOverrideXs = CSS.indexOf(".text-xs       {");
const posOverrideSm = CSS.indexOf(".text-sm       {");
const posEscala = CSS.indexOf("--cn-t-hero:");

afirmar(
  "Los overrides de Tailwind existen dónde se espera",
  posOverrideXs !== -1 && posOverrideSm !== -1,
  "no se encontraron los overrides `.text-xs` / `.text-sm`"
);
afirmar(
  "La escala se declara DESPUÉS de los overrides de Tailwind (gana por orden de fuente)",
  posEscala > posOverrideXs && posEscala > posOverrideSm,
  `override .text-xs @${posOverrideXs}, .text-sm @${posOverrideSm}, escala @${posEscala} — si la escala va antes, los títulos vuelven a encoger`
);

/* ------------------------------------------------------------------
   3. LA MEDIDA DE VENTANA ES «CASI TODA LA PANTALLA»
   ------------------------------------------------------------------ */
const modalW = CSS.match(/--cn-modal-w:\s*min\((\d+)px,\s*(\d+)vw\)/);
const modalH = CSS.match(/--cn-modal-h:\s*(\d+)vh/);

afirmar("Existe una medida única de ancho de ventana", !!modalW);
afirmar("Existe una medida única de alto de ventana", !!modalH);

if (modalW && modalH) {
  const vw = parseInt(modalW[2], 10);
  const vh = parseInt(modalH[1], 10);
  /* «que se puedan ver su contenido en casi TODA SU totalidad». */
  afirmar("El ancho de ventana ocupa al menos el 90% del viewport", vw >= 90, `declarado: ${vw}vw`);
  afirmar("El alto de ventana ocupa al menos el 90% del viewport", vh >= 90, `declarado: ${vh}vh`);
}

/* ------------------------------------------------------------------
   4. LOS MODALES DE CONTENIDO USAN LA MEDIDA ESTÁNDAR
   ------------------------------------------------------------------
   Antes cada ventana elegía su ancho a ojo (`max-w-2xl` … `max-w-3xl`, entre
   588 y 672 px) mientras el contenido se apretaba dentro. Aquí se exige que
   los modales de contenido hayan adoptado la clase común.
   ------------------------------------------------------------------ */
const MODALES_ESTANDAR = [
  "ModelSelectorModal",
  "ApiKeyModal",
  "ConfigModal",
  "ExtensionManager",
  "ZaiWizard",
];

console.log("\n  Ventanas emergentes con la medida estándar:");
for (const nombre of MODALES_ESTANDAR) {
  const ruta = path.join(RAIZ, "src", "components", `${nombre}.tsx`);
  if (!fs.existsSync(ruta)) {
    afirmar(`${nombre} existe`, false, ruta);
    continue;
  }
  const fuente = fs.readFileSync(ruta, "utf-8");
  const usaEstandar = /className="[^"]*\bcn-modal\b/.test(fuente);
  afirmar(`${nombre} adopta la medida estándar`, usaEstandar, "no se encontró la clase `cn-modal` en su contenedor");

  /* El ancho ya no se decide a ojo dentro del modal estándar. */
  const anchoSuelto = /className="[^"]*\bcn-modal\b[^"]*\bmax-w-(2xl|3xl|4xl)\b/.test(fuente);
  afirmar(`${nombre} no fija un ancho propio además del estándar`, !anchoSuelto, "quedó un `max-w-*` compitiendo con `--cn-modal-w`");
}

/* ------------------------------------------------------------------
   5. EL TÍTULO DE LA VENTANA NO PUEDE VOLVER A SER `text-sm`
   ------------------------------------------------------------------
   Es el fallo original, literal: el <h3> del catálogo era `text-sm`, o sea
   el mismo tamaño que su propio párrafo.
   ------------------------------------------------------------------ */
const selectorFuente = fs.readFileSync(path.join(RAIZ, "src", "components", "ModelSelectorModal.tsx"), "utf-8");
afirmar(
  "El título del catálogo declara un papel de título (cn-title), no un tamaño suelto",
  /<h3 className="cn-title/.test(selectorFuente),
  'el <h3> del catálogo volvió a un tamaño genérico'
);

/* ⚠️ El recuento tiene que decir «correctas»: es lo que `scripts/validar.mjs`
   busca para saber que la suite SÍ llegó a ejecutarse. Con otro vocabulario la
   daba por «no ejecutada» aunque terminara en verde — y un guardián que confunde
   «no arrancó» con «arrancó y no usa mi formato» deja de ser creíble. */
console.log(
  `\n  ${falladas === 0 ? "✔" : "✘"} Escala tipográfica: ${pasadas} correctas, ${falladas} fallidas.\n`
);

if (falladas > 0) process.exit(1);
