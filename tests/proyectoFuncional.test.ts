/**
 * tests/proyectoFuncional.test.ts — que la app se vea, y que exista el esqueleto
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/proyectoFuncional.test.ts
 *
 * El caso real: la carpeta tenía su web, pero un `requirements.txt` suelto
 * (peso 90) le ganaba a `index.html` (peso 60) y el sandbox respondía «No se
 * pudo arrancar». Y el otro, el que duele: si el modelo olvidaba el
 * `package.json`, nadie lo echaba de menos — la carpeta no era un proyecto.
 */

import {
  hayEvidenciaWeb,
  esMarcadorAjeno,
  servirPeseAlMarcador,
  esqueletoFaltante,
  packageJsonMinimo,
  indexHtmlMinimo,
} from "../src/engine/proyectoFuncional";

let pasadas = 0;
let falladas = 0;
const afirmar = (titulo: string, ok: boolean, detalle = "") => {
  if (ok) {
    pasadas++;
    console.log(`  ✔ ${titulo}`);
  } else {
    falladas++;
    console.log(`  ✘ ${titulo}${detalle ? ` → ${detalle}` : ""}`);
  }
};
const seccion = (t: string) => console.log(`\n${t}`);

seccion("1. Evidencia web");

afirmar("index.html en la raíz → entrada index.html", hayEvidenciaWeb(["index.html"]).entrada === "index.html");
afirmar("sin html pero con .tsx → hay fuentes", hayEvidenciaWeb(["src/main.tsx", "src/App.tsx"]).tieneFuentes);
afirmar("un .css solo no es una web", !hayEvidenciaWeb(["estilos.css"]).hay);
afirmar("una carpeta vacía no es una web", !hayEvidenciaWeb([]).hay);
afirmar("un readme no es una web", !hayEvidenciaWeb(["README.md"]).hay);
afirmar(
  "★ requirements.txt + index.html → hay web",
  hayEvidenciaWeb(["requirements.txt", "index.html"]).hay
);

seccion("2. Marcadores que no son del proyecto");

afirmar("requirements.txt es ajeno", esMarcadorAjeno("requirements.txt"));
afirmar("y también una ruta anidada", esMarcadorAjeno("sub/requirements.txt"));
afirmar("package.json NO es ajeno", !esMarcadorAjeno("package.json"));
afirmar("index.html NO es ajeno", !esMarcadorAjeno("index.html"));

seccion("3. ★ EL PREVIEW NO SE RECHAZA SI HAY WEB");

{
  // El defecto exacto: ganador Python (no servible) + index.html presente.
  const r = servirPeseAlMarcador(["requirements.txt", "index.html", "app.js"], false);
  afirmar("★ marcador no servible + HTML → SÍ se sirve", r.servir, r.motivo);
  afirmar("y explica que manda la web", /manda la web|HTML/i.test(r.motivo), r.motivo);
}
{
  const r = servirPeseAlMarcador(["requirements.txt", "src/main.tsx"], false);
  afirmar("★ marcador no servible + fuentes web → SÍ se sirve", r.servir, r.motivo);
}
{
  const r = servirPeseAlMarcador(["main.py", "requirements.txt"], false);
  afirmar("sin ninguna evidencia web → NO se sirve", !r.servir, r.motivo);
}
{
  const r = servirPeseAlMarcador(["package.json", "index.html"], true);
  afirmar("si el ganador ya era servible, no se discute", r.servir, r.motivo);
}

seccion("4. Esqueleto: lo que el modelo puede olvidar");

{
  const e = esqueletoFaltante(["index.html", "app.js"], { tienePackageJson: false });
  afirmar("★ olvidó el package.json y se detecta", e.crear.includes("package.json"), JSON.stringify(e.crear));
}
{
  const e = esqueletoFaltante(["src/main.tsx"], { tienePackageJson: true });
  afirmar("★ hay fuentes y no hay HTML: falta el index.html", e.crear.includes("index.html"), JSON.stringify(e.crear));
}
{
  const e = esqueletoFaltante(["index.html", "package.json"], { tienePackageJson: true });
  afirmar("esqueleto completo → no se crea nada", e.crear.length === 0, JSON.stringify(e.crear));
}
{
  const e = esqueletoFaltante(["README.md"], { tienePackageJson: false });
  afirmar("una carpeta de documentos no genera una app", e.crear.length === 0, JSON.stringify(e.crear));
}

seccion("5. El package.json que se genera es VÁLIDO y útil");

{
  const texto = packageJsonMinimo("Mi App Chula!", ["react", "react-dom", "react", "lucide-react"]);
  let p: any = null;
  try {
    p = JSON.parse(texto);
  } catch {}
  afirmar("★ parsea como JSON (si no, es peor que no crearlo)", p !== null, texto.slice(0, 60));
  afirmar("el nombre va saneado", p?.name === "mi-app-chula", p?.name);
  afirmar("lleva guion de arranque", typeof p?.scripts?.dev === "string", JSON.stringify(p?.scripts));
  afirmar("★ declara las dependencias REALES que importa", p?.dependencies?.react === "latest" && p?.dependencies?.["lucide-react"] === "latest");
  afirmar("y no duplica", Object.keys(p?.dependencies ?? {}).length === 3, JSON.stringify(p?.dependencies));
  afirmar("es privado (no se publica por accidente)", p?.private === true, String(p?.private));
}
{
  const conVite = JSON.parse(packageJsonMinimo("x", ["react"], { conVite: true }));
  afirmar("con vite incluido cuando se pide", "vite" in conVite.dependencies, JSON.stringify(conVite.dependencies));
  afirmar("y su dev apunta al puerto del sandbox", conVite.scripts.dev.includes("3500"), conVite.scripts.dev);
}
{
  const sinVite = JSON.parse(packageJsonMinimo("x", []));
  afirmar("sin vite si no se pide", !("vite" in sinVite.dependencies), JSON.stringify(sinVite.dependencies));
}

seccion("6. El index.html que se genera carga la entrada");

{
  const html = indexHtmlMinimo("src/main.tsx");
  afirmar("carga la entrada indicada", html.includes('src="./src/main.tsx"'), html.slice(0, 120));
  afirmar("es un módulo", html.includes('type="module"'), "");
  afirmar("tiene el contenedor root", html.includes('id="root"'), "");
  afirmar("no duplica la barra", !html.includes('".//'), "");
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ PROYECTO FUNCIONAL: ${pasadas} correctas · ${falladas} fallidas ═══`);
console.log("─".repeat(56));
if (falladas > 0) process.exit(1);
