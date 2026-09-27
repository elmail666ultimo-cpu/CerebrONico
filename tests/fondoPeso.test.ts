/**
 * tests/fondoPeso.test.ts — REGRESIÓN del GIF que no se podía poner
 * ================================================================
 * Se ejecuta con:  npx tsx tests/fondoPeso.test.ts
 *
 * El caso, literal, del usuario:
 *
 *     «en la imagen de fondo no pude colocar un gif, me dice que solo admite
 *      hasta 4 MB»
 *
 * El 4 MB era una ADUANA. Ahora es un AVISO con techo duro muy por encima: el
 * usuario decide, y solo se rechaza cuando de verdad dejaría de funcionar.
 *
 * La prueba que importa es la 3: un GIF de 6 MB tiene que PASAR.
 *
 * v1.7.1 — Y ADEMÁS, EL TECHO SUBE A 100 MB.
 * El techo no lo ponía el disco: lo ponía el transporte (data URL en base64,
 * +33 %, guardado como cadena en IndexedDB). Subir el número sin cambiar el
 * transporte habría sido prometer 100 MB y fallar a los 40. La sección 8
 * comprueba que el transporte cambió de verdad: blob en IndexedDB.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluarPesoAnimado,
  mensajePesoAnimado,
  evaluarPesoImagen,
  mensajePesoImagen,
  LIMITES_BYTES,
  TECHO_DURO_BYTES,
  TECHO_IMAGEN_BYTES,
  AVISO_IMAGEN_BYTES,
  limiteLegible,
  TIPOS_FONDO,
  MARCA_FONDO_IDB,
  UMBRAL_IMAGEN_EN_PREFERENCIAS_BYTES,
  type TipoFondo,
} from "../src/engine/fondo";

const RAIZ_TEST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leerFuente = (rel: string) => readFileSync(path.join(RAIZ_TEST, rel), "utf8");

let pasadas = 0;
let falladas = 0;

function afirmar(titulo: string, condicion: boolean, detalle = ""): void {
  if (condicion) {
    pasadas++;
  } else {
    falladas++;
    console.error(`  ✘ ${titulo}\n      ${detalle}`);
  }
}

const MB = 1048576;

console.log("\n1. Los AVISOS siguen iguales; el TECHO sube a 100 MB (v1.7.1)");

{
  afirmar("★ todos los formatos soportan 100 MB o más", (Object.keys(TIPOS_FONDO) as TipoFondo[]).every((t) => TECHO_DURO_BYTES[t] >= 100 * MB), JSON.stringify(TECHO_DURO_BYTES));
  afirmar("★ el gif pasó de 48 MB a 100 MB", TECHO_DURO_BYTES.gif === 100 * MB, String(TECHO_DURO_BYTES.gif));
  afirmar("★ la foto fija pasó de 32 MB a 100 MB", TECHO_DURO_BYTES.jpg === 100 * MB && TECHO_DURO_BYTES.jpeg === 100 * MB);
  afirmar("★ la imagen propia (PNG/WEBP) también llega a 100 MB", TECHO_IMAGEN_BYTES === 100 * MB, String(TECHO_IMAGEN_BYTES));
  afirmar("el vídeo NO bajó: «aumentar» no puede significar reducir", TECHO_DURO_BYTES.mp4 === 128 * MB && TECHO_DURO_BYTES.webm === 128 * MB);
  afirmar("los avisos de rendimiento NO se movieron (siguen siendo consejo)", LIMITES_BYTES.gif === 4 * MB && LIMITES_BYTES.mp4 === 8 * MB);
  afirmar("★ el umbral de preferencias es holgadamente menor que el techo", UMBRAL_IMAGEN_EN_PREFERENCIAS_BYTES < TECHO_IMAGEN_BYTES / 10, String(UMBRAL_IMAGEN_EN_PREFERENCIAS_BYTES));

  afirmar("gif avisa desde 4 MB", LIMITES_BYTES.gif === 4 * MB, String(LIMITES_BYTES.gif));
  afirmar("vídeo avisa desde 8 MB", LIMITES_BYTES.mp4 === 8 * MB && LIMITES_BYTES.webm === 8 * MB);
  afirmar("el techo del gif es MUY superior al aviso", TECHO_DURO_BYTES.gif > 20 * MB, String(TECHO_DURO_BYTES.gif));
  for (const t of Object.keys(TIPOS_FONDO) as TipoFondo[]) {
    afirmar(`«${t}»: el techo queda por encima del umbral de aviso`, TECHO_DURO_BYTES[t] > LIMITES_BYTES[t], `${TECHO_DURO_BYTES[t]} vs ${LIMITES_BYTES[t]}`);
  }
  afirmar("el texto del umbral sigue diciendo 4 MB / 8 MB", limiteLegible("gif") === "4 MB" && limiteLegible("webm") === "8 MB");
}

console.log("\n2. Los tres niveles del vídeo y del gif");

{
  afirmar("1 MB → ok", evaluarPesoAnimado("gif", 1 * MB) === "ok");
  afirmar("justo 4 MB → ok (el límite es «más de»)", evaluarPesoAnimado("gif", 4 * MB) === "ok");
  afirmar("4,1 MB → aviso", evaluarPesoAnimado("gif", Math.round(4.1 * MB)) === "aviso");
  afirmar("20 MB → aviso, no rechazo", evaluarPesoAnimado("gif", 20 * MB) === "aviso");
  afirmar("47 MB → aviso", evaluarPesoAnimado("gif", 47 * MB) === "aviso");
  afirmar("★ 60 MB → aviso (antes era rechazo: aquí está el cambio)", evaluarPesoAnimado("gif", 60 * MB) === "aviso", evaluarPesoAnimado("gif", 60 * MB));
  afirmar("★ 99 MB → aviso", evaluarPesoAnimado("gif", 99 * MB) === "aviso");
  afirmar("★ 101 MB → rechazo (el techo es 100)", evaluarPesoAnimado("gif", 101 * MB) === "rechazo");
  afirmar("vídeo de 100 MB → aviso", evaluarPesoAnimado("mp4", 100 * MB) === "aviso");
  afirmar("vídeo de 200 MB → rechazo", evaluarPesoAnimado("mp4", 200 * MB) === "rechazo");
}

console.log("\n3. ★ EL CASO DEL USUARIO: un GIF de 6 MB tiene que PASAR");

{
  const seis = 6 * MB;
  const nivel = evaluarPesoAnimado("gif", seis);
  afirmar("★ 6 MB ya NO se rechaza", nivel !== "rechazo", `nivel = ${nivel}`);
  afirmar("★ se acepta con aviso: la decisión es del usuario", nivel === "aviso", `nivel = ${nivel}`);

  const m = mensajePesoAnimado("gif", seis);
  afirmar("el aviso dice cuánto pesa", m.includes("6.0 MB"), m);
  afirmar("el aviso recuerda el recomendado", m.includes("4 MB"), m);
  afirmar("★ el aviso dice explícitamente que se puede poner", /se puede poner igual/i.test(m), m);
  afirmar("y no ordena nada", !/no se puede|no está permitido|rechazad/i.test(m), m);
}

console.log("\n4. Cuando sí se rechaza, se explica");

{
  const m = mensajePesoAnimado("gif", 120 * MB);
  afirmar("dice el peso real", m.includes("120.0 MB"), m);
  afirmar("★ dice el máximo manejable, y ya dice 100 MB", m.includes("100 MB"), m);
  afirmar("★ y da salida (convertir a MP4/WebM)", /MP4\/WebM/i.test(m), m);
}

console.log("\n5. La foto fija usa su propia escala");

{
  afirmar("aviso desde 4 MB", AVISO_IMAGEN_BYTES === 4 * MB);
  afirmar("★ techo de 100 MB (antes 32)", TECHO_IMAGEN_BYTES === 100 * MB, String(TECHO_IMAGEN_BYTES));
  afirmar("1 MB → ok", evaluarPesoImagen(1 * MB) === "ok");
  afirmar("5 MB → aviso (antes se rechazaba)", evaluarPesoImagen(5 * MB) === "aviso");
  afirmar("12 MB → aviso", evaluarPesoImagen(12 * MB) === "aviso");
  afirmar("★ 40 MB → aviso (antes era rechazo)", evaluarPesoImagen(40 * MB) === "aviso", evaluarPesoImagen(40 * MB));
  afirmar("★ 101 MB → rechazo", evaluarPesoImagen(101 * MB) === "rechazo");

  const m = mensajePesoImagen(5 * MB);
  afirmar("el aviso de imagen menciona el guardado local", /tu propio navegador|localmente|navegador/i.test(m), m);
}

console.log("\n6. Medidas absurdas no inventan un rechazo");

{
  for (const v of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    afirmar(`bytes = ${v} → ok (no se inventa un rechazo)`, evaluarPesoAnimado("gif", v) === "ok", String(evaluarPesoAnimado("gif", v)));
    afirmar(`imagen con ${v} → ok`, evaluarPesoImagen(v) === "ok");
  }
}

console.log("\n7. Coherencia: aviso nunca por encima del techo");

{
  let incoherentes = 0;
  for (const t of Object.keys(TIPOS_FONDO) as TipoFondo[]) {
    const techo = TECHO_DURO_BYTES[t];
    // Ojo con el signo: aquí lo CORRECTO es «aviso». La primera versión sumaba
    // incoherencia al obtener el resultado bueno y marcaba 5 fallos inexistentes.
    if (evaluarPesoAnimado(t, techo) !== "aviso") incoherentes++;
    if (evaluarPesoAnimado(t, techo + 1) !== "rechazo") incoherentes++;
  }
  afirmar("en el techo exacto aún se avisa; un byte más, se rechaza", incoherentes === 0, `${incoherentes} incoherencias`);
}

console.log("\n8. ★ El almacenamiento que hace REAL el techo de 100 MB");

{
  // Sin esto, la sección 1 sería una promesa de papel: el número subiría y el
  // guardado seguiría fallando a los 40 MB por el base64. Estas comprobaciones
  // son estáticas porque IndexedDB no existe en Node — y se dice, en vez de
  // fingir que se ha probado el navegador.
  const idx = leerFuente("src/utils/indexedDBStorage.ts");
  const app = leerFuente("src/App.tsx");
  const panel = leerFuente("src/components/ProConfigPanel.tsx");
  const fondoApp = leerFuente("src/components/AppBackground.tsx");

  afirmar("IndexedDB acepta Blob, no solo data URL", /dato: string \| Blob/.test(idx), "firma de saveBackgroundImage");
  afirmar("la lectura puede devolver un Blob", /Promise<string \| Blob \| null>/.test(idx));
  afirmar("existe urlDeFondo (Blob → URL pintable)", /export function urlDeFondo\(/.test(idx));
  afirmar("existe revocarFondo (el fondo viejo no se queda en memoria)", /export function revocarFondo\(/.test(idx));
  afirmar("★ el GIF se guarda como Blob, sin FileReader", /await saveBackgroundImage\(file\)/.test(app) && !/lectorGif\.readAsDataURL/.test(app));
  afirmar("★ la foto se guarda con canvas.toBlob, no toDataURL", /canvas\.toBlob\(/.test(app) && !/saveBackgroundImage\(dataUrl\)/.test(app));
  afirmar("App libera la URL anterior al cambiar de fondo", /revocarFondo\(fondoUrlRef\.current\)/.test(app));
  afirmar("★ la imagen grande del panel va a IndexedDB", /await saveBackgroundImage\(f\)/.test(panel));
  afirmar("★ y en las preferencias sólo queda la marca corta", /MARCA_FONDO_IDB/.test(panel));
  afirmar("la marca NO llega al CSS (no se pinta «cn-idb:fondo»)", /w\?\.url === MARCA_FONDO_IDB \? undefined/.test(fondoApp));
  afirmar("el panel avisa a App para aplicar la imagen al instante", /onWallpaperListo\?\.\(f\)/.test(panel) && /onWallpaperListo=\{/.test(app));
  afirmar("los errores de guardado se cuentan al usuario (nada silencioso)", /No se pudo guardar la imagen de fondo/.test(panel));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ PESO DEL FONDO: ${pasadas} correctas · ${falladas} fallidas ═══`);
console.log("─".repeat(56));
if (falladas > 0) process.exit(1);
