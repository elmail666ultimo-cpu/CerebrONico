/**
 * tests/viaRapidaPreview.test.ts — previsualizar sin el trabajo de antes
 * =====================================================================
 * Se ejecuta con:  npx tsx tests/viaRapidaPreview.test.ts
 *
 * La promesa que se comprueba aquí, en una línea:
 *   `requiereInstalar === false` en TODA vía que no sea `npm-dev`.
 *
 * Es decir: si el proyecto se puede previsualizar, se previsualiza — compilando
 * una vez con el esbuild de la IDE o sirviéndolo tal cual — sin instalar el
 * árbol de dependencias del proyecto ni arrancar su servidor de desarrollo.
 */

import {
  elegirViaPreview,
  esFrameworkConServidor,
  tieneConfigPropia,
  fuentesATranspilar,
  entradaDeHtml,
  comandoBundle,
  importacionesDesnudas,
  reescribirHtmlParaBundle,
  NOMBRE_BUNDLE,
  type EntradaPreview,
} from "../src/engine/viaRapidaPreview";

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

const base: EntradaPreview = {
  tieneIndexHtml: true,
  tienePackageJson: false,
  fuentes: [],
  tieneNodeModules: false,
  tieneConfigPropia: false,
  frameworkConServidor: false,
};

/* ------------------------------------------------------------------ */
console.log("\n1. Web estática pura: lo más barato posible");

{
  const d = elegirViaPreview(base);
  afirmar("vía directa", d.via === "estatico-directo", d.via);
  afirmar("sin instalar", d.requiereInstalar === false);
  afirmar("sin compilar", d.requiereCompilar === false);
  afirmar("explica por qué", /cero/i.test(d.motivo), d.motivo);
}

/* ------------------------------------------------------------------ */
console.log("\n2. ★ EL CASO QUE ANTES COSTABA TODO: package.json + fuentes sin instalar");

{
  const d = elegirViaPreview({
    ...base,
    tienePackageJson: true,
    fuentes: ["src/main.tsx", "src/App.tsx", "src/services/pdfReportService.ts"],
    tieneNodeModules: false,
  });
  afirmar("★ se elige la vía compilada, no npm-dev", d.via === "estatico-compilado", d.via);
  afirmar("★ NO hay que instalar nada del proyecto", d.requiereInstalar === false, String(d.requiereInstalar));
  afirmar("sí hay que compilar (una vez)", d.requiereCompilar === true);
  afirmar("el motivo nombra las fuentes", /3 fuente/.test(d.motivo), d.motivo);
}

/* ------------------------------------------------------------------ */
console.log("\n3. Lo que NO se toca, porque ya funciona o porque mentiría");

{
  const d = elegirViaPreview({ ...base, tienePackageJson: true, frameworkConServidor: true, fuentes: ["app/page.tsx"] });
  afirmar("marco con servidor propio → npm-dev", d.via === "npm-dev", d.via);
  afirmar("y lo dice", /marco/i.test(d.motivo), d.motivo);
}

{
  const d = elegirViaPreview({
    ...base,
    tienePackageJson: true,
    fuentes: ["src/main.tsx"],
    tieneNodeModules: true,
    tieneConfigPropia: true,
  });
  afirmar("proyecto ya instalado con su configuración → npm-dev", d.via === "npm-dev", d.via);
  afirmar("★ y ahí no hay que instalar: ya está instalado", d.requiereInstalar === false);
  afirmar("el motivo explica que se respeta su configuración", /alias|plugin|respeta/i.test(d.motivo), d.motivo);
}

{
  // Configuración propia pero SIN node_modules: es el rescate, no el respeto.
  const d = elegirViaPreview({
    ...base,
    tienePackageJson: true,
    fuentes: ["src/main.tsx"],
    tieneNodeModules: false,
    tieneConfigPropia: true,
  });
  afirmar("config propia sin instalar → vía rápida (rescate)", d.via === "estatico-compilado", d.via);
  afirmar("sin instalar", d.requiereInstalar === false);
}

/* ------------------------------------------------------------------ */
console.log("\n3-bis. v1.6.24 — node_modules EXISTENTE pero PODADO (el bug del ZIP)");

{
  // El caso reportado: «Cannot find module …/vite/dist/node/chunks/dist.js».
  // La carpeta existe (viene medio-populada del import o de un install
  // cortado), la auditoría la declara insana. Antes: npm-dev con
  // «requiereInstalar: false» → Vite moría y nadie lo arreglaba.
  const d = elegirViaPreview({
    ...base,
    tienePackageJson: true,
    fuentes: ["src/main.tsx"],
    tieneNodeModules: true,
    nodeModulesSano: false,
    tieneConfigPropia: true,
  });
  afirmar("árbol podado con config propia → sigue siendo npm-dev", d.via === "npm-dev", d.via);
  afirmar("★ pero DECLARA que hay que instalar antes", d.requiereInstalar === true, String(d.requiereInstalar));
  afirmar("el motivo nombra la auditoría", /auditor[ií]a/i.test(d.motivo), d.motivo);
}

{
  // Árbol sano + config + instalado: comportamiento viejo intacto (no tocar
  // lo que funciona — sigue sin instalar).
  const d = elegirViaPreview({
    ...base,
    tienePackageJson: true,
    fuentes: ["src/main.tsx"],
    tieneNodeModules: true,
    nodeModulesSano: true,
    tieneConfigPropia: true,
  });
  afirmar("árbol SANNO → npm-dev sin instalar", d.via === "npm-dev" && d.requiereInstalar === false, `${d.via}/${d.requiereInstalar}`);
}

{
  // Marco con servidor propio + árbol podado: también debe pedir instalar.
  const d = elegirViaPreview({
    ...base,
    tienePackageJson: true,
    frameworkConServidor: true,
    fuentes: ["app/page.tsx"],
    tieneNodeModules: true,
    nodeModulesSano: false,
  });
  afirmar("marco con servidor y árbol podado → requiere instalar", d.requiereInstalar === true, String(d.requiereInstalar));
}

{
  // La vía barata NO se altera por el árbol podado: si no hay config propia,
  // esbuild + estático siguen sin instalar nada del proyecto.
  const d = elegirViaPreview({
    ...base,
    tienePackageJson: true,
    fuentes: ["src/main.tsx"],
    tieneNodeModules: true,
    nodeModulesSano: false,
    tieneConfigPropia: false,
  });
  afirmar("árbol podado SIN config propia → vía rápida intacta", d.via === "estatico-compilado" && d.requiereInstalar === false, `${d.via}/${d.requiereInstalar}`);
}

/* ------------------------------------------------------------------ */
console.log("\n4. Sin index.html no hay preview que ofrecer");

{
  const d = elegirViaPreview({ ...base, tieneIndexHtml: false, tienePackageJson: true });
  afirmar("proyecto npm sin HTML → npm-dev", d.via === "npm-dev", d.via);
  afirmar("y requiere instalar", d.requiereInstalar === true);
}

{
  const d = elegirViaPreview({ ...base, tieneIndexHtml: false, tienePackageJson: false });
  afirmar("sin HTML ni package.json → npm-dev", d.via === "npm-dev", d.via);
  afirmar("dice que no hay nada que previsualizar", /nada que previsualizar/i.test(d.motivo), d.motivo);
  afirmar("no promete una instalación que no toca", d.requiereInstalar === false);
}

/* ------------------------------------------------------------------ */
console.log("\n5. LA INVARIANTE: fuera de npm-dev, nunca se instala");

{
  const combinaciones: EntradaPreview[] = [];
  for (const html of [true, false])
    for (const pkg of [true, false])
      for (const fuentes of [[], ["src/main.tsx"]])
        for (const nm of [true, false])
          for (const cfg of [true, false])
            for (const fw of [true, false])
              // v1.6.24 — se barre también la salud del árbol, incluida la
              // llamada vieja que no calcula el flag (undefined = sano).
              for (const sano of [true, false, undefined])
                combinaciones.push({
                  tieneIndexHtml: html,
                  tienePackageJson: pkg,
                  fuentes,
                  tieneNodeModules: nm,
                  nodeModulesSano: sano,
                  tieneConfigPropia: cfg,
                  frameworkConServidor: fw,
                });

  const malas = combinaciones.filter((e) => {
    const d = elegirViaPreview(e);
    return d.via !== "npm-dev" && d.requiereInstalar;
  });
  afirmar(
    `★ ninguna de las ${combinaciones.length} combinaciones promete vía rápida y luego pide instalar`,
    malas.length === 0,
    `${malas.length} combinaciones incoherentes`
  );

  const sinMotivo = combinaciones.filter((e) => elegirViaPreview(e).motivo.trim() === "");
  afirmar("todas explican su decisión", sinMotivo.length === 0, `${sinMotivo.length} sin motivo`);
}

/* ------------------------------------------------------------------ */
console.log("\n6. Detección: marcos, configuración y fuentes");

{
  afirmar("detecta Next", esFrameworkConServidor(["next", "react"]));
  afirmar("detecta Nuxt", esFrameworkConServidor(["nuxt"]));
  afirmar("detecta Astro", esFrameworkConServidor(["astro"]));
  afirmar("Vite a secas NO es marco con servidor propio", !esFrameworkConServidor(["vite", "react"]));
  afirmar("una dependencia que solo lo menciona no cuenta", !esFrameworkConServidor(["react", "next-themes"]));
}

{
  afirmar("detecta vite.config.ts", tieneConfigPropia(["vite.config.ts", "src/main.tsx"]));
  afirmar("detecta vite.config.mjs", tieneConfigPropia(["vite.config.mjs"]));
  afirmar("no confunde un archivo de configuración cualquiera", !tieneConfigPropia(["src/config.ts", "index.html"]));
}

{
  const f = fuentesATranspilar(["src/main.tsx", "src/a.ts", "src/b.jsx", "x.mjs", "styles.css", "logo.svg", "tipos.d.ts"]);
  afirmar("se queda con las que hay que transpilar", f.join(",") === "src/main.tsx,src/a.ts,src/b.jsx,x.mjs", JSON.stringify(f));
  afirmar("no toca CSS ni SVG", !f.some((x) => /\.(css|svg)$/.test(x)));
  afirmar("descarta las declaraciones .d.ts", !f.some((x) => x.endsWith(".d.ts")));
}

{
  afirmar("encuentra el módulo de entrada de Vite", entradaDeHtml('<script type="module" src="/src/main.tsx"></script>') === "/src/main.tsx");
  afirmar("encuentra un script sin type=module", entradaDeHtml('<script src="./app.js"></script>') === "./app.js");
  afirmar("con comillas simples", entradaDeHtml("<script type='module' src='main.js'></script>") === "main.js");
  afirmar("sin script de entrada devuelve null", entradaDeHtml("<html><body>hola</body></html>") === null);
}

/* ------------------------------------------------------------------ */
console.log("\n7. El comando de compilación");

{
  const cmd = comandoBundle("src/main.tsx", NOMBRE_BUNDLE);
  afirmar("agrupa", cmd.includes("--bundle"));
  afirmar("sale como módulo", cmd.includes("--format=esm"));
  afirmar("resuelve JSX solo", cmd.includes("--jsx=automatic"));
  afirmar("★ mete las dependencias DENTRO del bundle (el navegador no resuelve bare specifiers)", !cmd.includes("--packages=external"), cmd);
  afirmar("★ compila para navegador (condiciones + NODE_ENV)", cmd.includes("--platform=browser"), cmd);
  afirmar("★ usa el esbuild que ya está, sin descargar nada", cmd.includes("npx --no-install esbuild"), cmd);
  afirmar("nombra entrada y salida", cmd.includes("src/main.tsx") && cmd.includes(NOMBRE_BUNDLE));
  afirmar("las rutas con espacios van entrecomilladas", comandoBundle("mi carpeta/main.tsx", "out.js").includes('"mi carpeta/main.tsx"'));
}

/* ------------------------------------------------------------------ */
console.log("\n8. La reescritura del HTML");

{
  const html = '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';
  const nuevo = reescribirHtmlParaBundle(html);
  afirmar("apunta al bundle", Boolean(nuevo) && nuevo!.includes(`src="./${NOMBRE_BUNDLE}"`), String(nuevo));
  afirmar("ya no apunta a las fuentes", !nuevo!.includes("/src/main.tsx"));
  afirmar("conserva el resto del documento", nuevo!.includes('<div id="root">'));
}

{
  // Idempotencia: reescribir dos veces no puede duplicar el script.
  const ya = '<html><body><script type="module" src="./cn-preview.js"></script></body></html>';
  afirmar("★ si ya está reescrito devuelve null (no duplica)", reescribirHtmlParaBundle(ya) === null);
  afirmar("y el HTML no se toca dos veces", reescribirHtmlParaBundle(ya) === null);
}

{
  const sinScript = "<html><body><h1>Hola</h1></body></html>";
  const nuevo = reescribirHtmlParaBundle(sinScript);
  afirmar("sin script de entrada se inyecta antes de </body>", Boolean(nuevo) && nuevo!.indexOf(NOMBRE_BUNDLE) < nuevo!.indexOf("</body>"), String(nuevo));
  afirmar("el contenido sigue ahí", nuevo!.includes("<h1>Hola</h1>"));
}

{
  const frag = "<h1>Solo un trozo</h1>";
  afirmar("un HTML sin </body> no se pierde: se le añade el script", reescribirHtmlParaBundle(frag)!.startsWith(frag));
}

{
  /* ============================================================
     SUITE importacionesDesnudas — el fallo de la pantalla blanca
     ============================================================ */
  const desnudo = 'import React from "react";\nimport ReactDOM from "react-dom/client";';
  afirmar("detecta react y react-dom/client", importacionesDesnudas(desnudo).join(",") === "react,react-dom/client", importacionesDesnudas(desnudo).join(","));
  afirmar(
    "un bundle autocontenido no tiene imports desnudos",
    importacionesDesnudas('import { jsx } from "./chunk-ABC.js";\nconst x = 1;').length === 0
  );
  afirmar(
    "las rutas relativas, absolutas y las URL no cuentan",
    importacionesDesnudas('import a from "./a.js";\nimport b from "/b.js";\nimport c from "https://cdn/x.js";').length === 0
  );
  const conDinamico = '// carga diferida\nimport("jspdf");';
  afirmar(
    "el import dinámico desnudo también se detecta",
    importacionesDesnudas(conDinamico).join(",") === "jspdf",
    importacionesDesnudas(conDinamico).join(",")
  );
  afirmar(
    "el texto dentro de una cadena o un comentario no da falso positivo",
    importacionesDesnudas('const s = \'from "react"\';\n// import x from "vue"\n').length === 0
  );
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ VÍA RÁPIDA DE PREVIEW: ${pasadas} correctas · ${falladas} fallidas ═══`);
console.log("─".repeat(56));
if (falladas > 0) process.exit(1);
