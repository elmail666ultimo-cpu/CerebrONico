/**
 * redimensionPantalla.test.ts — REDIMENSIONES DE PANTALLA (v1.15.0)
 * =================================================================
 * QUÉ ES: la suite del módulo que centraliza los umbrales de ancho/altura y las
 * reglas con que la interfaz se reordena al redimensionar la ventana.
 * PARA QUÉ SIRVE: para que «qué se ve y a qué tamaño» no vuelva a ser un puñado
 * de números mágicos en el CSS sin quien los vigile. Se prueban las reglas y,
 * además, que `index.css` siga usando los MISMOS números — el módulo es el
 * patrón y la hoja no puede divergir sin que esto se ponga rojo.
 *
 * ESTADO DE EJECUCIÓN DE ESTA SUITE: se ejecuta de verdad (entra en
 * `npm run validar`), y por eso todo lo que afirma aquí tiene salida real detrás.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ANCHO_MOVIL,
  ANCHO_COMPACTO,
  ANCHO_MARGEN,
  ANCHO_MEDIO,
  ANCHO_ANCHO,
  ANCHO_MODAL,
  modoVentana,
  escalaRaiz,
  medidaModal,
  topeImagen,
  margenApp,
  esCompacto,
} from "../src/engine/redimensionPantalla";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle?: string) {
  if (condicion) correctas++;
  else fallos.push(`${titulo}${detalle ? " → " + detalle : ""}`);
}

// ═══ 1 · LOS UMBRALES ESTÁN ORDENADOS ═══════════════════════════════════════
console.log("\n1) Los umbrales, ordenados y con sentido\n");

comprobar("★ los umbrales van de menor a mayor", ANCHO_MOVIL < ANCHO_COMPACTO && ANCHO_COMPACTO < ANCHO_MARGEN && ANCHO_MARGEN < ANCHO_MEDIO && ANCHO_MEDIO < ANCHO_ANCHO && ANCHO_ANCHO < ANCHO_MODAL);
comprobar("el tope del modal es el más grande", ANCHO_MODAL > ANCHO_ANCHO);

// ═══ 2 · EL MODO DE VENTANA ═════════════════════════════════════════════════
console.log("\n2) El modo de la ventana, decidido por el ancho\n");

comprobar("móvil → compacto", modoVentana(360) === "compacto");
comprobar("justo en el límite compacto → compacto", modoVentana(ANCHO_COMPACTO) === "compacto");
comprobar("entre compacto y ancho → medio", modoVentana(1000) === "medio");
comprobar("justo en el límite ancho → medio", modoVentana(ANCHO_ANCHO) === "medio");
comprobar("por encima de ancho → ancho", modoVentana(1400) === "ancho");
comprobar("esCompacto coincide con el modo", esCompacto(800) && !esCompacto(901) && esCompacto(ANCHO_COMPACTO));

// ═══ 3 · LA ESCALA DE RAÍZ ══════════════════════════════════════════════════
console.log("\n3) La escala de raíz por ancho\n");

comprobar("móvil → 13px", escalaRaiz(ANCHO_MOVIL) === 13);
comprobar("medio → 14px", escalaRaiz(800) === 14 && escalaRaiz(ANCHO_MEDIO) === 14);
comprobar("ancho → 14.5px", escalaRaiz(1200) === 14.5 && escalaRaiz(ANCHO_ANCHO) === 14.5);
comprobar("pantalla grande → 15px", escalaRaiz(1920) === 15);
comprobar("★ la escala NO baja al agrandar (es monótona)", escalaRaiz(700) >= escalaRaiz(600) && escalaRaiz(1200) >= escalaRaiz(700) && escalaRaiz(2000) >= escalaRaiz(1200));

// ═══ 4 · EL MODAL Y EL VISOR DE IMÁGENES ═══════════════════════════════════
console.log("\n4) El modal y el visor de imágenes, sin comerse la ventana\n");

const modal = medidaModal(1920, 1080);
comprobar("★ el modal no supera el tope", modal.ancho <= ANCHO_MODAL);
comprobar("★ el modal no se come la ventana (tope 1500px × 94vh)", modal.ancho === ANCHO_MODAL && modal.alto === Math.round(1080 * 0.94), `${modal.ancho}×${modal.alto}`);
const modalChico = medidaModal(500, 400);
comprobar("en pantalla chica el modal baja con la ventana", modalChico.ancho === Math.round(500 * 0.97) && modalChico.alto === Math.round(400 * 0.94));
comprobar("el visor respeta el 90% del viewport", topeImagen(1000, 800).ancho === 900 && topeImagen(1000, 800).alto === 720);

// ═══ 5 · EL MARGEN TÁCTIL ══════════════════════════════════════════════════
console.log("\n5) El margen de la carcasa\n");

comprobar("★ puntero fino → sin margen", margenApp(false) === "0");
comprobar("★ pantalla táctil → 3mm (notch y barras de gestos)", margenApp(true) === "3mm");

// ═══ 6 · LA HOJA SIGUE USANDO LOS MISMOS NÚMEROS (no puede divergir) ══════
console.log("\n6) index.css consume el módulo, no lo contradice\n");

const css = leer("src/index.css");
comprobar("★ el CSS usa el límite compacto (900px)", /@media \(max-width: 900px\)/.test(css));
comprobar("★ el CSS usa el límite de margen (1024px)", /@media \(min-width: 1024px\)/.test(css));
comprobar("★ el CSS usa el límite medio (1100px) → 14px", /@media \(max-width: 1100px\)/.test(css) && /font-size: 14px/.test(css));
comprobar("★ el CSS usa el límite ancho (1280px) → 14.5px", /@media \(max-width: 1280px\)/.test(css) && /font-size: 14\.5px/.test(css));
comprobar("★ el CSS usa el móvil (640px) → 13px", /@media \(max-width: 640px\)/.test(css) && /font-size: 13px/.test(css));
comprobar("★ el CSS usa el modal estándar", /min\(1500px, 97vw\)/.test(css) && /94vh/.test(css));
comprobar("★ el CSS respeta el margen táctil", /@media \(pointer: coarse\)/.test(css) && /3mm/.test(css));
comprobar("el módulo es puro: no toca el reloj ni el azar", !/Date\.now|Math\.random/.test(leer("src/engine/redimensionPantalla.ts")));
comprobar("esta suite entra en npm run validar", leer("scripts/validar.mjs").includes("redimensionPantalla.test.ts"));

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ REDIMENSIONES DE PANTALLA (CN v1.15.0): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  FALLO → " + f);
  process.exit(1);
}
