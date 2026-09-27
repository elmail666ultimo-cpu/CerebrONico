/**
 * boveda.test.ts — BÓVEDA v1: el transporte de la imagen al disco real
 * ====================================================================
 * Demuestra de la lista las decisiones del transporte (sin puente, sin disco):
 *   · raíz por defecto según SO (C:\CN en Windows)
 *   · cada artefacto cae en su carpeta indexada
 *   · nombres slugueados, rutas sin escapate, fecha como separador histórico
 *   · el índice deduplica por firma+ruta y nunca lanza con basura
 *   · el árbol inicial son las cinco carpetas del pedido
 */
import {
  raizBovedaPorDefecto, carpetaParaArtefacto, normalizarProyecto, normalizarArchivo,
  planearTransporte, indiceVacio, indiceCon, parsearIndice, arbolInicial, lineaTransporte,
  type EntradaIndice,
} from "../src/engine/bovedaLocal";

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(nombre + (detalle ? " :: " + detalle : ""));
}

// ─── 1. Raíz y carpetas ══════════════════════════════════════════════════
comprobar("Windows → C:\\CN", raizBovedaPorDefecto("win32", "C:\\Users\\nico") === "C:\\CN");
comprobar("Linux → ~/CN", raizBovedaPorDefecto("linux", "/home/nico") === "/home/nico/CN");
comprobar("imagen → IMAGENES", carpetaParaArtefacto("imagen") === "IMAGENES");
comprobar("png/jpeg por extensión también", carpetaParaArtefacto("png") === "IMAGENES" && carpetaParaArtefacto("jpeg") === "IMAGENES");
comprobar("csv → DATOS", carpetaParaArtefacto("csv") === "DATOS");
comprobar("md → DOCUMENTOS", carpetaParaArtefacto("md") === "DOCUMENTOS");
comprobar("apk → APPS", carpetaParaArtefacto("apk") === "APPS");
comprobar("investigacion → INVESTIGACION", carpetaParaArtefacto("paper") === "INVESTIGACION");
comprobar("desconocido cae a DOCUMENTOS (suelo honesto)", carpetaParaArtefacto("chim-pum") === "DOCUMENTOS");

// ─── 2. Nombres ══════════════════════════════════════════════════════════
comprobar("slug de proyecto con espacios y acentos", normalizarProyecto("Mi App 2") === "mi-app-2" && normalizarProyecto("Café Ñandú") === "cafe-nandu");
comprobar("proyecto vacío → sin-proyecto", normalizarProyecto("   ") === "sin-proyecto");
comprobar("archivo escapa de rutas", !normalizarArchivo("../../etc/passwd.png", "image/png").includes(".."));
comprobar("la extensión sale de los BYTES (mime real)", normalizarArchivo("logo.png", "image/jpeg") === "logo.jpg");

// ─── 3. Plan del transporte ══════════════════════════════════════════════
const p1 = planearTransporte({ raiz: "C:\\CN", categoria: "imagen", proyecto: "Scan Med", archivo: "logo.png", mimeReal: "image/png", fechaIso: "2026-09-21T10:00:00Z", separador: "\\" });
comprobar("plan ok con ruta absoluta indexada", p1.ok && p1.plan!.rutaLocal === "C:\\CN\\IMAGENES\\scan-med\\2026-09-21\\logo.png", p1.ok ? "" : p1.motivo);
comprobar("relativa con barras normalizadas", p1.ok && p1.plan!.relativa === "IMAGENES/scan-med/2026-09-21/logo.png");
const p2 = planearTransporte({ raiz: "", categoria: "imagen", proyecto: "x", archivo: "y", mimeReal: "image/png", fechaIso: "2026-09-21" });
comprobar("raíz vacía → motivo, no excepción", !p2.ok && /CN_BOVEDA|configurar/.test(p2.motivo));
const p3 = planearTransporte({ raiz: "/home/n/CN", categoria: "datos", proyecto: "p", archivo: "v.csv", mimeReal: "image/png", fechaIso: "malo", separador: "/" });
comprobar("fecha inválida → sin-fecha (no revienta)", p3.ok && p3.plan!.relativa.includes("sin-fecha"));
const p4 = planearTransporte({ raiz: "C:\\CN", categoria: "imagen", proyecto: "..\\..\\otro", archivo: "a.png", mimeReal: "image/png", fechaIso: "2026-09-21" });
comprobar("intento de escapate por proyecto se neutraliza (slug)", p4.ok && !p4.plan!.relativa.includes(".."));

// ─── 4. El índice ════════════════════════════════════════════════════════
const ent = (archivo: string, firma: string): EntradaIndice => ({ archivo, proyecto: "p", origenSandbox: "s", mime: "image/png", bytes: 10, firma, en: "2026-09-21T00:00:00Z" });
let ind = indiceVacio();
ind = indiceCon(ind, ent("a/1.png", "f1"));
ind = indiceCon(ind, ent("a/2.png", "f2"));
ind = indiceCon(ind, ent("a/1.png", "f1")); // reenvío: no duplica
comprobar("dedupe por firma+ruta", ind.entradas.length === 2);
comprobar("actualizado sigue al último evento", ind.actualizado === "2026-09-21T00:00:00Z");
const basura = parsearIndice({ entradas: "no-es-array" });
comprobar("índice con basura → vacío, sin lanzar", basura.entradas.length === 0 && basura.version === 1);
const basura2 = parsearIndice({ entradas: [{ archivo: "x" }, { archivo: "y", firma: "f" }] });
comprobar("entradas ilegibles se descartan una a una", basura2.entradas.length === 1);

// ─── 5. Árbol inicial y línea honesta ════════════════════════════════════
const arbol = arbolInicial("C:\\CN", "\\");
comprobar("cinco carpetas indexadas bajo la raíz", arbol.length === 5 && arbol.every((a) => a.startsWith("C:\\CN\\")) && arbol.some((a) => a.endsWith("IMAGENES")));
comprobar("línea de éxito dice la ruta destino", /transportada/.test(lineaTransporte(true, p1.ok ? p1.plan : null, "")) && /C:/.test(lineaTransporte(true, p1.ok ? p1.plan : null, "")));
comprobar("línea de fracaso dice por qué", /NO transportada/.test(lineaTransporte(false, null, "puente caído")) && /puente caído/.test(lineaTransporte(false, null, "puente caído")));

console.log(`\nBÓVEDA v1 · ${correctas} correctas, ${fallos.length} en rojo`);
if (fallos.length) { for (const f of fallos) console.log("  ✗ " + f); process.exit(1); }
