#!/usr/bin/env node
/**
 * parche-sandbox-v1627.mjs — AUTOTEST: LA IDE ANIDADA NO SE RECOMPILA AL PEDO
 * =========================================================================
 * 🐞 EL PROBLEMA
 * Cuando la copia de la IDE cae dentro del sandbox (el autotest «IDE dentro de
 * la IDE», que es un uso deliberado: se coloca la vX.Y.Z en el sandbox para
 * verla corriendo), el motor hacía SIEMPRE:
 *
 *     npm install --ignore-scripts   (≈3,5 min la primera vez)
 *     npm run build                  (= vite build && esbuild …, ≈300 s de Rollup)
 *     node dist/server.mjs
 *
 * El ZIP de la IDE **ya viaja con `dist/` compilado** — es el mismo build que
 * corre en la instalación real. O sea: se pagaban cinco minutos de Rollup dentro
 * del sandbox para volver a generar el archivo que ya estaba, y encima ese paso
 * es el que fallaba (`Identifier.bind` / pila de Rollup sin mensaje: ver
 * v1.6.26-DIAG).
 *
 * 🔧 EL ARREGLO (dos piezas, ninguna cambia el comportamiento del resto)
 *  1. Si `dist/server.mjs` ya está, NO se compila: se arranca con ese build.
 *     Para forzar la recompilación: SANDBOX_IDE_BUILD=1 (o borrar `dist/`).
 *  2. Si se compila y el build FALLA, pero hay un `dist/server.mjs` usable,
 *     ya no se aborta: se avisa en el log y se arranca con el dist que hay.
 *     Antes, un fallo de compilación dejaba el autotest muerto aunque el
 *     artefacto para correrlo estuviera en el disco.
 *
 * Uso:  node scripts/parche-sandbox-v1627.mjs
 *       (idempotente: si ya está aplicado, no toca nada)
 * =========================================================================
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raizBackend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARCA = "v1.6.27-AUTOTEST";

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

const VIEJO_BUILD = `        const build = spawnSync(npmCmd, ["run", "build"], { cwd: raizProyecto, env: sandboxEnv, timeout: 300000, shell: isWinSandbox });
        if (build.status !== 0) {
          const detalle = detalleDeSalida(build.stderr || build.stdout);
          // v1.6.23 — GUARDA-E: el error ya no muere en la traza. Casi siempre
          // significa que la propia IDE cayó dentro del sandbox (mal importada
          // o encontrada por el resolutor con una raíz de datos inválida — las
          // guardas A y B de esta versión lo previenen). El mensaje dice cómo
          // salir en tres pasos, porque un fallo sin salida es un callejón.
          return res.json({
            error:
              \`La IDE no pudo compilarse dentro del sandbox [npm run build en \${raizProyecto}]: \` +
              (detalle || "sin detalle del proceso") +
              " — VÍA DE SALIDA: esto casi siempre significa que la propia IDE está dentro del sandbox, no tu app. " +
              "Pasos: 1) Sandbox → Detener. 2) «Borrar todo» en el editor (muda el estado de CerebroNico y vacía .proyectos por completo). " +
              "3) Reimportá SOLO tu aplicación. Si el problema persiste, revisá que PROJECT_DIR no apunte a la carpeta de instalación de la IDE.",
          });
        }`;

const NUEVO_BUILD = `        // ============================================================
        // v1.6.27-AUTOTEST — NO RECOMPILAR LO QUE YA VIENE COMPILADO
        // ------------------------------------------------------------
        // El ZIP de la IDE viaja con dist/ hecho (es el mismo build que corre
        // en la instalación real). Se corría \`npm run build\` SIEMPRE: unos
        // 300 s de Rollup dentro del sandbox para volver a generar el archivo
        // que ya estaba — y ese paso es justo el que fallaba. Ahora, si
        // dist/server.mjs está, se arranca con él. Para forzar la
        // recompilación: SANDBOX_IDE_BUILD=1 (o borrar dist/).
        // ============================================================
        const distServer = path.join(raizProyecto, "dist", "server.mjs");
        const forzarBuildIde = String(process.env.SANDBOX_IDE_BUILD || "") === "1";
        const hayDist = fs.existsSync(distServer);

        if (hayDist && !forzarBuildIde) {
          console.log(
            \`[CerebroNico] IDE anidada: uso el dist/server.mjs que ya viene compilado (\${new Date(fs.statSync(distServer).mtimeMs).toISOString()}) — se omite npm run build.\`
          );
        } else {
          if (forzarBuildIde)
            console.log("[CerebroNico] IDE anidada: SANDBOX_IDE_BUILD=1 → se recompila (npm run build).");
          const build = spawnSync(npmCmd, ["run", "build"], { cwd: raizProyecto, env: sandboxEnv, timeout: 300000, shell: isWinSandbox });
          if (build.status !== 0) {
            const detalle = detalleDeSalida(build.stderr || build.stdout);
            // v1.6.27 — Si el build falla pero hay un dist/server.mjs usable, el
            // autotest NO se cae: se avisa y se arranca con ese artefacto. Un
            // fallo de compilación no tiene por qué dejar sin arrancar algo que
            // ya está construido en el disco.
            if (hayDist) {
              console.warn(
                \`[CerebroNico] IDE anidada: npm run build falló (\${detalle || "sin detalle"}) pero hay dist/server.mjs: se arranca con ese build.\`
              );
            } else {
              // v1.6.23 — GUARDA-E: el error ya no muere en la traza. Casi siempre
              // significa que la propia IDE cayó dentro del sandbox (mal importada
              // o encontrada por el resolutor con una raíz de datos inválida — las
              // guardas A y B de esta versión lo previenen). El mensaje dice cómo
              // salir en tres pasos, porque un fallo sin salida es un callejón.
              return res.json({
                error:
                  \`La IDE no pudo compilarse dentro del sandbox [npm run build en \${raizProyecto}]: \` +
                  (detalle || "sin detalle del proceso") +
                  " — VÍA DE SALIDA: esto casi siempre significa que la propia IDE está dentro del sandbox, no tu app. " +
                  "Pasos: 1) Sandbox → Detener. 2) «Borrar todo» en el editor (muda el estado de CerebroNico y vacía .proyectos por completo). " +
                  "3) Reimportá SOLO tu aplicación. Si el problema persiste, revisá que PROJECT_DIR no apunte a la carpeta de instalación de la IDE. " +
                  "Si lo que buscabas era el autotest «IDE dentro de la IDE», reimportá el ZIP completo: trae dist/ compilado y con eso no hace falta compilar nada.",
              });
            }
          }
        }`;

parchear("server.ts", [
  {
    nombre: "no recompilar la IDE anidada si ya hay dist/ (+ no abortar si el build falla y hay dist)",
    marca: MARCA + " — NO RECOMPILAR LO QUE YA VIENE COMPILADO",
    viejo: VIEJO_BUILD,
    nuevo: NUEVO_BUILD,
  },
  {
    nombre: "un node_modules anidado INCOMPLETO también se reinstala (fallo pegajoso)",
    marca: "NO BASTA CON QUE LA CARPETA EXISTA",
    viejo: `        if (!fs.existsSync(path.join(raizProyecto, "node_modules"))) {
          console.log("[CerebroNico] IDE anidada sin node_modules: instalando dependencias de compilación (--ignore-scripts)…");`,
    nuevo: `        // v1.6.27 — NO BASTA CON QUE LA CARPETA EXISTA.
        // Un node_modules creado por un package.json ANTERIOR pasa el
        // \`existsSync\` y deja el árbol roto PARA SIEMPRE, porque el
        // \`npm install\` no se vuelve a ejecutar nunca. Caso real medido: al
        // árbol le faltaba \`js-yaml\`, que el código importa en
        // src/engine/formatConverter.ts, y \`vite build\` moría con
        // «Rollup failed to resolve import "js-yaml"» — un fallo pegajoso que
        // sobrevive a reiniciar y a «Forzar Limpieza».
        // Ahora la condición es la auditoría de integridad: carpeta ausente O
        // dependencia declarada que no está → se instala.
        if (!nodeModulesSanoEn(raizProyecto)) {
          console.log(
            fs.existsSync(path.join(raizProyecto, "node_modules"))
              ? "[CerebroNico] IDE anidada: node_modules INCOMPLETO (alguna dependencia declarada no está) → se reinstala (--ignore-scripts)…"
              : "[CerebroNico] IDE anidada sin node_modules: instalando dependencias de compilación (--ignore-scripts)…"
          );`,
  },
]);

parchear("src/constants.ts", [
  {
    nombre: "VERSION_SEMVER → 1.6.27",
    marca: 'const VERSION_SEMVER = "1.6.27";',
    viejo: `const VERSION_SEMVER = "1.6.26";`,
    nuevo: `const VERSION_SEMVER = "1.6.27";`,
  },
]);

parchear("package.json", [
  {
    nombre: "package.json version → 1.6.27",
    marca: `"version": "1.6.27"`,
    viejo: `"version": "1.6.26",`,
    nuevo: `"version": "1.6.27",`,
  },
]);

console.log("");
console.log(`═══ ${MARCA}: ${aplicados} aplicado(s) · ${saltados} ya estaba(n) · ${fallos} fallo(s) ═══`);
if (fallos > 0) {
  console.error("Se aborta: revisa los anclajes (el archivo cambió de forma).");
  process.exit(1);
}
console.log("Siguiente paso: regenerar el bundle —  npx esbuild server.ts --bundle --platform=node --format=esm --packages=external --sourcemap --outfile=dist/server.mjs");
