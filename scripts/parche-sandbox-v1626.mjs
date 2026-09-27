#!/usr/bin/env node
/**
 * parche-sandbox-v1626.mjs — DIAGNÓSTICO REAL DE LOS FALLOS DEL SANDBOX
 * =====================================================================
 * 🐞 EL PROBLEMA QUE ARREGLA
 * El motor capturaba el error de un proceso con `.slice(-6)`: los SEIS ÚLTIMOS
 * renglones. En Vite/Rollup/esbuild el mensaje va ARRIBA y debajo queda la pila
 * de llamadas, así que el log mostraba esto:
 *
 *   …La IDE no pudo compilarse dentro del sandbox:
 *        at ModuleScope.findVariable (…node-entry.js:15694:39)
 *      · at ReturnValueScope.findVariable (…)
 *      · at FunctionBodyScope.findVariable (…)
 *      · at Identifier.bind (…)   — VÍA DE SALIDA: …
 *
 * Catorce renglones de pila, cero de causa. Con el mensaje delante
 * (`Rollup failed to resolve import "…"`) esto se arregla en un minuto.
 *
 * Uso:  node scripts/parche-sandbox-v1626.mjs
 *       (idempotente: si ya está aplicado, no toca nada)
 * =====================================================================
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raizBackend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARCA = "v1.6.26-DIAG";

let aplicados = 0;
let saltados = 0;
let fallos = 0;

function parchear(relativo, cambios) {
  const ruta = path.join(raizBackend, relativo);
  if (!fs.existsSync(ruta)) {
    console.error(`✘ no existe ${relativo}`);
    fallos++;
    return;
  }
  let texto = fs.readFileSync(ruta, "utf-8");
  let tocado = false;
  for (const c of cambios) {
    if (texto.includes(c.marca)) {
      saltados++;
      continue;
    }
    const veces = texto.split(c.viejo).length - 1;
    if (veces !== 1) {
      console.error(`✘ ${relativo}: el anclaje aparece ${veces} vez/veces (se esperaba 1) → ${c.nombre}`);
      fallos++;
      continue;
    }
    texto = texto.split(c.viejo).join(c.nuevo);
    tocado = true;
    aplicados++;
    console.log(`✔ ${relativo}: ${c.nombre}`);
  }
  if (tocado) fs.writeFileSync(ruta, texto, "utf-8");
}

const AYUDA = `// ============================================================
// v1.6.26-DIAG — UN FALLO SIN SU MENSAJE NO SE PUEDE ARREGLAR
// ------------------------------------------------------------
// El motor capturaba la salida de un proceso con \`.slice(-6)\`: los seis
// ÚLTIMOS renglones. En Vite/Rollup/esbuild el mensaje va ARRIBA y debajo
// queda la pila, así que el log acababa mostrando «at ModuleScope.findVariable
// · at Identifier.bind · …» y el motivo real se descartaba antes de llegar a
// la pantalla. Ahora se eligen las líneas que PARECEN la causa estén donde
// estén (arriba en Vite/esbuild, abajo en npm) y, si no hay ninguna, se toma
// la CABEZA de la salida — nunca la cola.
// ============================================================
const LINEA_CAUSA =
  /(\\[vite\\]|\\brollup\\b|\\bERROR\\b|error during build|failed to resolve|could not resolve|cannot find|not found|is not defined|is not exported|MODULE_NOT_FOUND|ERR_|npm ERR!|ENOENT|EACCES|ETIMEDOUT|SyntaxError|Transform failed|✘)/i;

function detalleDeSalida(salida: unknown, max = 6): string {
  const lineas = String(salida ?? "")
    .replace(/\\x1b\\[[0-9;]*m/g, "")
    .split("\\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lineas.length === 0) return "";
  const causas = lineas.filter((l) => LINEA_CAUSA.test(l));
  return (causas.length > 0 ? causas : lineas).slice(0, max).join(" · ");
}

`;

parchear("server.ts", [
  {
    nombre: "inserta detalleDeSalida() (causa, no pila)",
    marca: "v1.6.26-DIAG — UN FALLO SIN SU MENSAJE",
    viejo: `// ============================================================\n// SANDBOX API: ejecución de comandos + sistema de archivos real\n// ============================================================`,
    nuevo: `// ============================================================\n// SANDBOX API: ejecución de comandos + sistema de archivos real\n// ============================================================\n\n${AYUDA}`,
  },
  {
    nombre: "vía rápida: causa del fallo de esbuild en vez de sus últimos 3 renglones",
    marca: "detalleDeSalida((res as any)?.stderr",
    viejo: `        const detalle = String((res as any)?.stderr || (res as any)?.stdout || "").split("\\n").filter((x: string) => x.trim()).slice(-3).join(" · ");`,
    nuevo: `        const detalle = detalleDeSalida((res as any)?.stderr || (res as any)?.stdout);`,
  },
  {
    nombre: "npm install de la IDE anidada: causa + carpeta",
    marca: "La IDE anidada no pudo instalar sus dependencias (necesita red la primera vez) [npm install en",
    viejo: `            const detalle = String(inst.stderr || inst.stdout || "").split("\\n").filter((x) => x.trim()).slice(-6).join(" · ");\n            return res.json({ error: "La IDE anidada no pudo instalar sus dependencias (necesita red la primera vez): " + (detalle || "sin detalle") });`,
    nuevo: `            const detalle = detalleDeSalida(inst.stderr || inst.stdout);\n            return res.json({\n              error:\n                "La IDE anidada no pudo instalar sus dependencias (necesita red la primera vez) " +\n                \`[npm install en \${raizProyecto}]: \` + (detalle || "sin detalle"),\n            });`,
  },
  {
    nombre: "npm run build de la IDE anidada: causa + comando + carpeta",
    marca: "La IDE no pudo compilarse dentro del sandbox [npm run build en",
    viejo: `          const detalle = String(build.stderr || build.stdout || "").split("\\n").filter((x) => x.trim()).slice(-6).join(" · ");`,
    nuevo: `          const detalle = detalleDeSalida(build.stderr || build.stdout);`,
  },
  {
    nombre: "mensaje del build: dice QUÉ comando y DÓNDE",
    marca: `"La IDE no pudo compilarse dentro del sandbox [npm run build en "`,
    viejo: `              "La IDE no pudo compilarse dentro del sandbox: " + (detalle || "sin detalle del proceso") +`,
    nuevo: `              \`La IDE no pudo compilarse dentro del sandbox [npm run build en \${raizProyecto}]: \` +\n              (detalle || "sin detalle del proceso") +`,
  },
  {
    nombre: "npm install del proyecto del sandbox: misma causa, no la cola",
    marca: "detalleDeSalida(inst.stderr || inst.stdout);\n            console.warn",
    viejo: `            const detalle = String(inst.stderr || inst.stdout || "")\n              .split("\\n")\n              .filter((x: string) => x.trim())\n              .slice(-2)\n              .join(" · ");`,
    nuevo: `            const detalle = detalleDeSalida(inst.stderr || inst.stdout);`,
  },
]);

parchear("src/constants.ts", [
  {
    nombre: "VERSION_SEMVER → 1.6.26",
    marca: 'const VERSION_SEMVER = "1.6.26";',
    viejo: `const VERSION_SEMVER = "1.6.25";`,
    nuevo: `const VERSION_SEMVER = "1.6.26";`,
  },
]);

parchear("package.json", [
  {
    nombre: "package.json version → 1.6.26",
    marca: `"version": "1.6.26"`,
    viejo: `"version": "1.6.25",`,
    nuevo: `"version": "1.6.26",`,
  },
]);

console.log("");
console.log(`═══ ${MARCA}: ${aplicados} aplicado(s) · ${saltados} ya estaba(n) · ${fallos} fallo(s) ═══`);
if (fallos > 0) {
  console.error("Se aborta: revisa los anclajes (el archivo cambió de forma).");
  process.exit(1);
}
console.log("Siguiente paso: regenerar el bundle —  npx esbuild server.ts --bundle --platform=node --format=esm --packages=external --sourcemap --outfile=dist/server.mjs");
