/**
 * botones.test.ts — AUDITORÍA DE BOTONES (v1.0.0)
 * ===============================================
 * Pedido: «revisa que todos sus botones funcionen».
 *
 * CÓMO SE PUEDE COMPROBAR ESO SIN UN NAVEGADOR
 * --------------------------------------------
 * No se puede pulsar cada botón desde aquí, y decir «los he revisado» sería
 * exactamente el tipo de afirmación no verificada que este proyecto persigue.
 * Lo que SÍ es determinista es lo que convierte a un botón en un botón muerto:
 *
 *   1. Un manejador VACÍO — `onClick={() => {}}`. Compila, se pinta, se pulsa y
 *      no pasa nada. Es el botón muerto por excelencia.
 *   2. Un manejador que vale `undefined` o `null`: React lo acepta sin quejarse.
 *   3. Un manejador con un nombre que NO EXISTE en el archivo: un `onClick={loQueSea}`
 *      con una errata. TypeScript lo caza si está tipado… y no lo caza si el
 *      componente recibe props laxas o hay un `any` por medio.
 *   4. Un `<button>` sin `onClick` y sin ser `submit` ni estar `disabled`: pinta
 *      como pulsable y no hace nada.
 *
 * Eso es lo que se audita. NO se auditan los efectos: que un handler exista no
 * prueba que haga lo correcto. Esa parte se dice que no se cubre, en lugar de
 * dar por bueno un «todos funcionan» que no se ha medido.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Se ancla en la raíz del paquete, NO en `process.cwd()`: la prueba de aspecto
// usaba cwd y podía pasar sin escanear nada. Aquí no.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(RAIZ, "src");

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, ok: boolean, extra?: string): void {
  if (ok) { correctas++; return; }
  fallos.push(`${nombre}${extra ? "  →  " + extra : ""}`);
}

// ── Recorrido ───────────────────────────────────────────────────────────────
const archivos: string[] = [];
const walk = (d: string): void => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (/\.tsx$/.test(e.name)) archivos.push(p);
  }
};
walk(SRC);

comprobar("la auditoría encuentra archivos que revisar", archivos.length >= 20, `${archivos.length} .tsx`);

// ── Patrones ────────────────────────────────────────────────────────────────
const VACIO = /onClick=\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/g;
const VACIO_2 = /onClick=\{\s*\(\s*\)\s*=>\s*\{?\s*;?\s*\}?\s*\}/g;
const NULO = /onClick=\{\s*(?:undefined|null)\s*\}/g;
const IDENT = /onClick=\{([A-Za-z_$][\w$]*)\}/g;
const ONCLICK = /onClick=/g;
const BOTON = /<button\b[\s\S]{0,600}?>/g;

const vacios: string[] = [];
const nulos: string[] = [];
const desconocidos: string[] = [];
const sinOnClick: string[] = [];
let totalOnClick = 0;
let totalBotones = 0;

for (const f of archivos) {
  const rel = f.replace(RAIZ + "/", "");
  const txt = fs.readFileSync(f, "utf8");
  totalOnClick += (txt.match(ONCLICK) || []).length;
  totalBotones += (txt.match(/<button\b/g) || []).length;

  for (const m of txt.matchAll(new RegExp(VACIO.source, "g"))) vacios.push(`${rel}: ${m[0]}`);
  for (const m of txt.matchAll(new RegExp(VACIO_2.source, "g"))) {
    const s = `${rel}: ${m[0]}`;
    if (!vacios.includes(s)) vacios.push(s);
  }
  for (const m of txt.matchAll(new RegExp(NULO.source, "g"))) nulos.push(`${rel}: ${m[0]}`);

  // Nombres de manejador que no existen en el archivo.
  for (const m of txt.matchAll(new RegExp(IDENT.source, "g"))) {
    const id = m[1];
    // ¿Se define en algún sitio del archivo (const/let/function) o llega por props?
    const definido =
      new RegExp(`(?:const|let|var|function)\\s+${id}\\b`).test(txt) ||
      new RegExp(`${id}\\s*[,}]`).test(txt) ||
      new RegExp(`${id}\\s*=`).test(txt);
    if (!definido) desconocidos.push(`${rel}: onClick={${id}} sin definición`);
  }

  // <button ...> sin onClick, sin type="submit" y sin disabled.
  for (const m of txt.matchAll(new RegExp(BOTON.source, "g"))) {
    const tag = m[0];
    if (/onClick=/.test(tag)) continue;
    if (/type=["']submit["']/.test(tag)) continue;
    if (/disabled/.test(tag)) continue;
    sinOnClick.push(`${rel}: ${tag.replace(/\s+/g, " ").slice(0, 70)}`);
  }
}

console.log(`\n  inventario: ${archivos.length} archivos .tsx · ${totalBotones} <button> · ${totalOnClick} onClick\n`);

// ── Veredictos ──────────────────────────────────────────────────────────────
console.log("1) Botones muertos\n");
comprobar("ningún onClick vacío", vacios.length === 0, vacios.slice(0, 4).join(" | "));
comprobar("ningún onClick nulo", nulos.length === 0, nulos.slice(0, 4).join(" | "));
comprobar("ningún onClick con nombre inexistente", desconocidos.length === 0, desconocidos.slice(0, 4).join(" | "));

// Los `<button>` sin onClick se informan SIEMPRE, pero sólo fallan si son muchos:
// hay casos legítimos (botones que son `<summary>` de un acordeón, controles que
// delegan en un formulario con onSubmit, o tarjetas que usan onMouseDown).
console.log("\n2) Botones sin onClick (informativos, pueden ser legítimos)\n");
console.log(`   ${sinOnClick.length} de ${totalBotones}`);
for (const s of sinOnClick.slice(0, 6)) console.log("     · " + s);

// Se deja un techo holgado: si alguien añade un botón inerte de verdad, la cifra
// salta y hay que mirarla. Un cero exigido sería una prueba que miente.
comprobar("los botones sin onClick no se disparan (techo 40)", sinOnClick.length <= 40, `${sinOnClick.length}`);

// ── Y el hallazgo de la paleta, que es la misma clase de defecto ────────────
console.log("\n3) El inventario de la paleta no puede pasar sin escanear\n");
const aspectoTest = fs.readFileSync(path.join(RAIZ, "tests", "aspecto.test.ts"), "utf8");
comprobar("la prueba de aspecto ya NO usa process.cwd() para el inventario",
  !/path\.resolve\(process\.cwd\(\)/.test(aspectoTest));
comprobar("...y falla en vez de callarse cuando no puede escanear",
  /comprobar\(\s*"inventario: .*se pudo escanear/.test(aspectoTest));
comprobar("...y escanea TODO src, no sólo src/components",
  /path\.join\((?:raizInv|RAIZ\w*), "src"\)/i.test(aspectoTest) && !/src\/components"/.test(aspectoTest));

console.log(`\n═══ BOTONES (v1.0.0): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  ✗ " + f);
  process.exit(1);
}
