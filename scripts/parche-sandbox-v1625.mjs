#!/usr/bin/env node
/**
 * parche-sandbox-v1625.mjs — SANDBOXFIX3
 * =====================================================================
 * Corrige el fallo que v1.6.24 NO cerró: el sandbox arranca, el puerto 3500
 * responde 200 y la pantalla queda EN BLANCO.
 *
 * Causa raíz (comprobada en local, ver INFORME_SANDBOX_v1.6.25.md):
 *   1. `comandoBundle` usaba `--packages=external`. El bundle resultante pesa
 *      788 bytes y arranca con `import React from "react"` — un bare specifier
 *      que el NAVEGADOR no puede resolver (no hay node_modules ni mapa de
 *      imports). La app nunca monta: pantalla en blanco. Comprobado: sin esa
 *      bandera esbuild mete react/react-dom en el bundle (1 MB autocontenido).
 *   2. `compilarPreviewRapida` reescribía `index.html` apuntando al bundle y
 *      NUNCA lo restauraba: a partir de ahí, incluso con el proyecto instalado y
 *      `npm run dev` sano, Vite servía el bundle viejo. La pantalla blanca
 *      sobrevivía a todas las reparaciones posteriores.
 *   3. El verificador del preview declaraba «Preview verificado» con solo ver
 *      HTTP 200 + bytes en `/cn-preview.js`: verde falso sobre una página vacía.
 *
 * Uso:  node scripts/parche-sandbox-v1625.mjs
 *       (idempotente: si ya está aplicado, no toca nada)
 *       --reconstruir   además regenera dist/server.mjs con esbuild local
 * =====================================================================
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raizBackend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARCA = "v1.6.25-SANDBOXFIX3";

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

/* ============================================================
   1. LA DECISIÓN PURA — el bundle tiene que ser EJECUTABLE
   ============================================================ */

parchear("src/engine/viaRapidaPreview.ts", [
  {
    nombre: "comandoBundle sin --packages=external + platform=browser",
    marca: "SIN `--packages=external`: las dependencias ENTRAN en el bundle",
    viejo: [
      `    "--format=esm",`,
      `    "--jsx=automatic",`,
      `    "--loader:.js=jsx",`,
      `    "--sourcemap",`,
      `    "--log-level=warning",`,
      `    "--packages=external",`,
      `  ].join(" ");`,
    ].join("\n"),
    nuevo: [
      `    "--format=esm",`,
      `    "--platform=browser",`,
      `    "--jsx=automatic",`,
      `    "--loader:.js=jsx",`,
      `    "--sourcemap",`,
      `    "--log-level=warning",`,
      `    // v1.6.25-SANDBOXFIX3 — SIN \`--packages=external\`: las dependencias ENTRAN en el bundle.`,
      `  ].join(" ");`,
    ].join("\n"),
  },
  {
    nombre: "auditoría del bundle generado (importacionesDesnudas)",
    marca: "export function importacionesDesnudas",
    viejo: `/**
 * Reescribe el HTML para que cargue el bundle en vez de las fuentes.`,
    nuevo: `/* ============================================================
   v1.6.25-SANDBOXFIX3 — ¿EL BUNDLE ES EJECUTABLE EN UN NAVEGADOR?
   ============================================================
   Un \`import "react"\` desnudo no se resuelve en el navegador: no consulta
   node_modules ni sube por el árbol de directorios. El servidor lo sirve con
   HTTP 200, la consola del iframe escupe «Failed to resolve module specifier» y
   la aplicación no monta → PANTALLA EN BLANCO con el puerto respondiendo.
   Se comprueba solo al principio de línea (donde esbuild escribe los imports)
   para no confundir el mismo texto dentro de una cadena o un comentario.
   ============================================================ */

export function importacionesDesnudas(codigo: string): string[] {
  const encontrados = new Set<string>();
  const patrones = [
    /^\\s*(?:import|export)[^\\n]*?from\\s*["']([^"']+)["']/gm,
    /^\\s*import\\s*["']([^"']+)["']/gm,
    /^\\s*import\\s*\\(\\s*["']([^"']+)["']\\s*\\)/gm,
  ];
  for (const re of patrones) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(codigo)) !== null) {
      const especificador = m[1] || "";
      if (esEspecificadorDesnudo(especificador)) encontrados.add(especificador);
    }
  }
  return [...encontrados].sort();
}

/** Un especificador es «desnudo» si no es ruta relativa/absoluta ni URL. */
function esEspecificadorDesnudo(especificador: string): boolean {
  const s = especificador.trim();
  if (s === "") return false;
  if (s.startsWith("./") || s.startsWith("../") || s.startsWith("/")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return false; // http:, data:, node:
  return true;
}

/**
 * Reescribe el HTML para que cargue el bundle en vez de las fuentes.`,
  },
]);

/* ============================================================
   2. EL SERVIDOR — guarda del bundle, restauración del HTML y fallback
   ============================================================ */

parchear("server.ts", [
  {
    nombre: "importa importacionesDesnudas",
    marca: "  importacionesDesnudas,",
    viejo: `  reescribirHtmlParaBundle,\n  NOMBRE_BUNDLE,\n  NOMBRE_RESPALDO,\n} from "./src/engine/viaRapidaPreview";`,
    nuevo: `  reescribirHtmlParaBundle,\n  importacionesDesnudas,\n  NOMBRE_BUNDLE,\n  NOMBRE_RESPALDO,\n} from "./src/engine/viaRapidaPreview";`,
  },
  {
    nombre: "guarda: el bundle no puede salir con imports desnudos",
    marca: "GUARDA-BUNDLE-DESNUDO",
    viejo: `      const reescrito = reescribirHtmlParaBundle(html);`,
    nuevo: `      // ============================================================
      // v1.6.25-SANDBOXFIX3 — GUARDA-BUNDLE-DESNUDO
      // ------------------------------------------------------------
      // Un bundle con bare specifiers se sirve con HTTP 200 y el navegador lo
      // rechaza: pantalla en blanco sin un solo error en el servidor. Se audita
      // ANTES de reescribir el HTML; si quedó desnudo, se declara el fallo para
      // que el flujo caiga en la vía de npm (instalar y respetar su dev) en vez
      // de servir una página muerta que parece funcionar.
      // ============================================================
      try {
        const desnudos = importacionesDesnudas(fs.readFileSync(rutaBundle, "utf-8"));
        if (desnudos.length > 0) {
          return {
            ok: false,
            mensaje:
              \`el bundle salió con \${desnudos.length} import(s) que el navegador no puede resolver \` +
              \`(\${desnudos.slice(0, 4).join(", ")}): el preview quedaría en blanco aunque el puerto responda\`,
          };
        }
      } catch { /* si no se puede leer, no se puede auditar: se sigue */ }

      const reescrito = reescribirHtmlParaBundle(html);`,
  },
  {
    nombre: "restaura el index.html original antes de arrancar",
    marca: "const restaurarHtmlOriginal =",
    viejo: `    const viaPreview = decidirViaPreviewDelProyecto();`,
    nuevo: `    // ============================================================
    // v1.6.25-SANDBOXFIX3 — EL HTML REESCRITO NO PUEDE QUEDAR PEGADO
    // ------------------------------------------------------------
    // La vía rápida reescribe index.html para que cargue ./cn-preview.js y
    // guarda el original en .cn-preview/index.html.orig… pero nada lo devolvía
    // nunca. A partir de ahí, un proyecto ya instalado que arranca por
    // \`npm run dev\` seguía sirviendo el BUNDLE VIEJO: si ese bundle estaba
    // roto, la pantalla blanca sobrevivía a todas las reparaciones (instalar
    // dependencias, purgar node_modules, reiniciar) porque el HTML nunca
    // volvía a pedir /src/main.tsx. Esto explica por qué el arreglo de
    // v1.6.24 «no se notaba».
    // ============================================================
    const restaurarHtmlOriginal = (): boolean => {
      try {
        const rutaHtml = path.join(raizProyecto, "index.html");
        const rutaRespaldo = path.join(raizProyecto, NOMBRE_RESPALDO);
        if (!fs.existsSync(rutaRespaldo)) return false;
        const actual = fs.existsSync(rutaHtml) ? fs.readFileSync(rutaHtml, "utf-8") : "";
        if (!actual.includes(NOMBRE_BUNDLE)) return false;
        fs.writeFileSync(rutaHtml, fs.readFileSync(rutaRespaldo, "utf-8"), "utf-8");
        console.log("[CerebroNico] Sandbox: index.html restaurado (apuntaba al bundle de la vía rápida).");
        return true;
      } catch {
        return false;
      }
    };

    const viaPreview = decidirViaPreviewDelProyecto();`,
  },
  {
    nombre: "flag de compilación fallida",
    marca: "compilacionFallida = !comp.ok;",
    viejo: `    if (viaPreview.requiereCompilar) {\n      const comp = await compilarPreviewRapida();`,
    nuevo: `    let compilacionFallida = false;\n    if (viaPreview.requiereCompilar) {\n      const comp = await compilarPreviewRapida();\n      compilacionFallida = !comp.ok;`,
  },
  {
    nombre: "fallback: si la compilación falla se va por npm-dev (con el HTML restaurado)",
    marca: "viaPreview.via !== \"npm-dev\" && !compilacionFallida",
    viejo: `    if (viaPreview.via !== "npm-dev") {`,
    nuevo: `    // Si la vía rápida no pudo entregar un bundle ejecutable, no se sirve una
    // página muerta: se cae a la vía de npm (instala lo que falte y respeta su
    // \`dev\`). Y si vamos por npm-dev, el HTML tiene que volver a ser el original.
    if (viaPreview.via === "npm-dev" || compilacionFallida) restaurarHtmlOriginal();

    if (viaPreview.via !== "npm-dev" && !compilacionFallida) {`,
  },
  {
    nombre: "verify-preview: no cantar verde sobre un bundle desnudo",
    marca: "desnudosServidos",
    viejo: `    const ok = obligatorias.length > 0 && fallidas.length === 0 && !paginaMuyFlaca;\n    return res.json({\n      ok,`,
    nuevo: `    // v1.6.25-SANDBOXFIX3 — GUARDA-BUNDLE-DESNUDO en el verificador: un bundle
    // con imports desnudos responde 200 y aun así deja la pantalla en blanco.
    // Se lee el bundle de disco (sin pedirlo por HTTP) y se cuenta la verdad.
    const desnudosServidos =
      viaReportada === "estatico-compilado" ? importacionesDesnudas(leerSeguro(path.join(raiz, NOMBRE_BUNDLE))) : [];
    const ok = obligatorias.length > 0 && fallidas.length === 0 && !paginaMuyFlaca && desnudosServidos.length === 0;
    return res.json({
      ok,
      desnudos: desnudosServidos,`,
  },
  {
    nombre: "verify-preview: mensaje específico del bundle desnudo",
    marca: "pero el navegador NO puede ejecutarlo",
    viejo: `      message: ok\n        ? \`Preview verificado (vía \${viaReportada}): \${obligatorias.map((x) => detalle(x.r)).join(" · ")}.\`\n        : paginaMuyFlaca`,
    nuevo: `      message: ok\n        ? \`Preview verificado (vía \${viaReportada}): \${obligatorias.map((x) => detalle(x.r)).join(" · ")}.\`\n        : desnudosServidos.length > 0\n          ? \`El bundle SE SIRVE (HTTP 200) pero el navegador NO puede ejecutarlo: quedó con \${desnudosServidos.length} import(s) desnudo(s) (\${desnudosServidos.slice(0, 4).join(", ")}). Por eso el preview sale en blanco.\`\n          : paginaMuyFlaca`,
  },
]);

/* ============================================================
   3. LOS TESTS QUE AFIRMABAN EL FALLO
   ============================================================ */

parchear("tests/viaRapidaPreview.test.ts", [
  {
    nombre: "importa importacionesDesnudas en el suite",
    marca: "  importacionesDesnudas,",
    viejo: `  comandoBundle,\n  reescribirHtmlParaBundle,\n  NOMBRE_BUNDLE,`,
    nuevo: `  comandoBundle,\n  importacionesDesnudas,\n  reescribirHtmlParaBundle,\n  NOMBRE_BUNDLE,`,
  },
  {
    nombre: "el test ya no exige --packages=external",
    marca: "SÍ mete las dependencias dentro",
    viejo: `  afirmar("★ NO mete las dependencias dentro: deja que el navegador las resuelva", cmd.includes("--packages=external"), cmd);`,
    nuevo: `  afirmar("★ mete las dependencias DENTRO del bundle (el navegador no resuelve bare specifiers)", !cmd.includes("--packages=external"), cmd);\n  afirmar("★ compila para navegador (condiciones + NODE_ENV)", cmd.includes("--platform=browser"), cmd);`,
  },
  {
    nombre: "casos nuevos de importacionesDesnudas",
    marca: "SUITE importacionesDesnudas",
    viejo: `console.log(\`\\n\${"─".repeat(56)}\`);`,
    nuevo: `{
  /* ============================================================
     SUITE importacionesDesnudas — el fallo de la pantalla blanca
     ============================================================ */
  const desnudo = 'import React from "react";\\nimport ReactDOM from "react-dom/client";';
  afirmar("detecta react y react-dom/client", importacionesDesnudas(desnudo).join(",") === "react,react-dom/client", importacionesDesnudas(desnudo).join(","));
  afirmar(
    "un bundle autocontenido no tiene imports desnudos",
    importacionesDesnudas('import { jsx } from "./chunk-ABC.js";\\nconst x = 1;').length === 0
  );
  afirmar(
    "las rutas relativas, absolutas y las URL no cuentan",
    importacionesDesnudas('import a from "./a.js";\\nimport b from "/b.js";\\nimport c from "https://cdn/x.js";').length === 0
  );
  const conDinamico = '// carga diferida\\nimport("jspdf");';
  afirmar(
    "el import dinámico desnudo también se detecta",
    importacionesDesnudas(conDinamico).join(",") === "jspdf"
  );
  afirmar(
    "el texto dentro de una cadena o un comentario no da falso positivo",
    importacionesDesnudas('const s = \\'from "react"\\';\\n// import x from "vue"\\n').length === 0
  );
}

console.log(\`\\n\${"─".repeat(56)}\`);`,
  },
]);

/* ============================================================
   4. VERSIÓN
   ============================================================ */

parchear("src/constants.ts", [
  {
    nombre: "VERSION_SEMVER → 1.6.25",
    marca: 'const VERSION_SEMVER = "1.6.25";',
    viejo: `const VERSION_SEMVER = "1.6.24";`,
    nuevo: `const VERSION_SEMVER = "1.6.25";`,
  },
]);

parchear("package.json", [
  {
    nombre: "package.json version → 1.6.25",
    marca: `"version": "1.6.25"`,
    viejo: `"version": "1.6.24",`,
    nuevo: `"version": "1.6.25",`,
  },
]);

/* ============================================================
   5. RESUMEN
   ============================================================ */

console.log("");
console.log(`═══ ${MARCA}: ${aplicados} aplicado(s) · ${saltados} ya estaba(n) · ${fallos} fallo(s) ═══`);
if (fallos > 0) {
  console.error("Se aborta: revisa los anclajes (el archivo cambió de forma).");
  process.exit(1);
}
console.log("Siguiente paso: regenerar el bundle si toca —  npm run build   (o esbuild server.ts …)");
