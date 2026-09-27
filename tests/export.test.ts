/**
 * export.test.ts — EXPORTAR A ANDROID (v2.2)
 * ==========================================
 * Lo que hay que DEMOSTRAR:
 *   · que reconoce qué proyectos se pueden sacar a APK y cuáles no, y POR QUÉ
 *   · que el diagnóstico dice exactamente qué falta en la máquina
 *   · que el suelo de Android está fijado y no se promete lo imposible
 *
 * Se ejecuta con:  npx tsx tests/export.test.ts
 */

import {
  analizarProyecto,
  evaluarHerramientas,
  veredictoAndroid,
  pasosDeExportacion,
  configCapacitor,
  appIdValido,
  appIdDesdeNombre,
  androidDesdeApi,
  PISO_ANDROID,
} from "../src/engine/mobileExport";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];

function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) {
    pasan++;
    console.log(`  PASS   ${nombre}`);
  } else {
    fallan++;
    fallos.push(nombre);
    console.log(`  FALLO  ${nombre}${detalle ? `  ·  ${detalle}` : ""}`);
  }
}

// ─── 1. Reconocer el proyecto ───────────────────────────────────────────────

function t1_proyectos(): void {
  console.log("\n── 1. ¿Qué proyecto es y se puede sacar a APK? ──");

  const vite = analizarProyecto({
    packageJson: JSON.stringify({
      name: "mi-app",
      version: "1.2.3",
      scripts: { dev: "vite", build: "vite build" },
      dependencies: { react: "^19.0.0" },
      devDependencies: { vite: "^6.0.0" },
    }),
    archivosRaiz: ["index.html", "vite.config.ts", "package.json"],
  });
  comprobar("una app Vite+React se reconoce como web moderna", vite.tipo === "web-moderno", vite.tipo);
  comprobar("y SÍ es exportable a Android", vite.exportableAAndroid === true);
  comprobar("respeta el nombre y la versión del package.json", vite.nombre === "mi-app" && vite.version === "1.2.3");
  comprobar("usa «dist» como carpeta a empaquetar", vite.carpetaSalida === "dist", vite.carpetaSalida);
  comprobar("y sabe el comando de build", vite.comandoBuild === "npm run build");

  const conOutDir = analizarProyecto({
    packageJson: JSON.stringify({ name: "x", scripts: { build: "vite build" }, build: { outDir: "salida-web" } }),
    archivosRaiz: [],
  });
  comprobar("respeta un outDir declarado", conOutDir.carpetaSalida === "salida-web", conOutDir.carpetaSalida);

  const sinBuild = analizarProyecto({
    packageJson: JSON.stringify({ name: "x", scripts: { dev: "vite" }, devDependencies: { vite: "*" } }),
    archivosRaiz: ["index.html"],
  });
  comprobar("sin script «build» NO es exportable", sinBuild.exportableAAndroid === false);
  comprobar("y explica por qué, sin rodeos", /no tiene un script «build»/.test(sinBuild.razon), sinBuild.razon);

  const python = analizarProyecto({ packageJson: null, archivosRaiz: ["motor.py", "requirements.txt"] });
  comprobar("un proyecto Python se detecta como tal", python.tipo === "python", python.tipo);
  comprobar("y se dice que no se puede envolver en un APK", python.exportableAAndroid === false && /Python/.test(python.razon), python.razon);

  const roto = analizarProyecto({ packageJson: "{no es json", archivosRaiz: [] });
  comprobar("un package.json inválido se reporta como tal", /no es JSON válido/.test(roto.razon), roto.razon);
}

// ─── 2. Diagnóstico de la máquina ───────────────────────────────────────────

function t2_herramientas(): void {
  console.log("\n── 2. ¿Está la máquina preparada? ──");

  const completa = evaluarHerramientas({
    nodeVersion: "v22.21.1",
    javaVersion: "openjdk version 17.0.9",
    androidHome: "C:\\Users\\BirdBox\\AppData\\Local\\Android\\Sdk",
    plataformasSdk: ["android-34", "android-36"],
    tieneGradle: true,
    tieneAdb: true,
  });
  comprobar("con todo instalado, no falla ningún requisito obligatorio", completa.filter((r) => r.obligatorio && !r.ok).length === 0);

  const vacia = evaluarHerramientas({});
  const obligatoriosQueFaltan = vacia.filter((r) => r.obligatorio && !r.ok);
  comprobar("sin nada instalado, faltan los 4 obligatorios", obligatoriosQueFaltan.length === 4, `${obligatoriosQueFaltan.length}`);
  comprobar("y cada uno dice CÓMO se resuelve", vacia.every((r) => r.comoResolver.length > 30));

  const nodoViejo = evaluarHerramientas({ nodeVersion: "18.20.0" });
  comprobar("Node 18 no vale (hace falta 22+)", nodoViejo.find((r) => r.id === "node")!.ok === false);
  const nodoOk = evaluarHerramientas({ nodeVersion: "22.0.0" });
  comprobar("Node 22 sí vale", nodoOk.find((r) => r.id === "node")!.ok === true);

  const java17 = evaluarHerramientas({ javaVersion: "17.0.9" });
  comprobar("Java 17 vale", java17.find((r) => r.id === "java")!.ok === true);
  const java8 = evaluarHerramientas({ javaVersion: "1.8.0_392" });
  comprobar("Java 8 NO vale (y no se confunde el «1.8» con un 17)", java8.find((r) => r.id === "java")!.ok === false);
  const java21 = evaluarHerramientas({ javaVersion: "21.0.1" });
  comprobar("Java 21 vale", java21.find((r) => r.id === "java")!.ok === true);

  const api19 = evaluarHerramientas({ plataformasSdk: ["android-19"] });
  comprobar("sólo con API 19 (Android 4.4.2) NO se puede construir", api19.find((r) => r.id === "plataforma")!.ok === false);
  const api23 = evaluarHerramientas({ plataformasSdk: ["android-23"] });
  comprobar("tampoco con API 23 (Android 6)", api23.find((r) => r.id === "plataforma")!.ok === false);
  const api24 = evaluarHerramientas({ plataformasSdk: ["android-24"] });
  comprobar("con API 24 (Android 7) sí, que es el suelo", api24.find((r) => r.id === "plataforma")!.ok === true);

  comprobar("Gradle no es obligatorio (se descarga solo)", evaluarHerramientas({}).find((r) => r.id === "gradle")!.obligatorio === false);
  comprobar("adb tampoco (sólo para cable)", evaluarHerramientas({}).find((r) => r.id === "adb")!.obligatorio === false);
}

// ─── 3. El suelo de Android, fijado ────────────────────────────────────────

function t3_suelo(): void {
  console.log("\n── 3. El suelo de Android ──");
  comprobar("el mínimo es API 24", PISO_ANDROID.api === 24, `${PISO_ANDROID.api}`);
  comprobar("y se nombra la versión, no sólo el número", /Android 7/.test(PISO_ANDROID.version), PISO_ANDROID.version);
  comprobar("la fuente está citada", /Capacitor/.test(PISO_ANDROID.fuente), PISO_ANDROID.fuente);
  comprobar("y se explica por qué 4.4.2 no es viable", /4\.4\.2/.test(PISO_ANDROID.nota) && /WebView/.test(PISO_ANDROID.nota));
  comprobar("19 → Android 4.4", /4\.4/.test(androidDesdeApi(19)), androidDesdeApi(19));
  comprobar("23 → Android 6", /6\.0/.test(androidDesdeApi(23)), androidDesdeApi(23));
  comprobar("24 → Android 7", /7\.0/.test(androidDesdeApi(24)), androidDesdeApi(24));
}

// ─── 4. Veredicto y pasos ──────────────────────────────────────────────────

function t4_veredicto_y_pasos(): void {
  console.log("\n── 4. Veredicto y plan de pasos ──");

  const proyecto = analizarProyecto({
    packageJson: JSON.stringify({ name: "mi-app", scripts: { build: "vite build" }, devDependencies: { vite: "*" } }),
    archivosRaiz: ["index.html"],
  });

  const sinNada = veredictoAndroid(proyecto, {});
  comprobar("sin herramientas, el veredicto es NO", sinNada.puedeConstruir === false);
  comprobar("y la lista de lo que falta nombra cosas concretas", sinNada.faltan.some((f) => /Android SDK/.test(f)), sinNada.faltan.join(" | "));

  const conTodo = veredictoAndroid(proyecto, {
    nodeVersion: "22.21.1",
    javaVersion: "17.0.9",
    androidHome: "C:\\Android\\Sdk",
    plataformasSdk: ["android-34"],
  });
  comprobar("con todo, el veredicto es SÍ", conTodo.puedeConstruir === true, conTodo.faltan.join(" | "));

  const noExportable = analizarProyecto({ packageJson: null, archivosRaiz: ["motor.py"] });
  const v = veredictoAndroid(noExportable, { nodeVersion: "22.21.1", javaVersion: "17", androidHome: "x", plataformasSdk: ["android-34"] });
  comprobar("un proyecto no exportable nunca da veredicto positivo", v.puedeConstruir === false);
  comprobar("y el motivo del proyecto aparece en la lista", v.faltan.some((f) => /Python/.test(f)), v.faltan.join(" | "));

  const pasos = pasosDeExportacion(proyecto);
  comprobar("los pasos van numerados del 1 al 6 sin saltos", pasos.map((p) => p.orden).join(",") === "1,2,3,4,5,6", pasos.map((p) => p.orden).join(","));
  comprobar("el paso 3 usa el comando de build del proyecto", pasos[2].comando === "npm run build", pasos[2].comando);
  comprobar("el paso del APK es el de gradlew", /gradlew/.test(pasos[5].comando), pasos[5].comando);
  comprobar("cada paso explica qué hace", pasos.every((p) => p.queHace.length > 30));
}

// ─── 5. appId y configuración ──────────────────────────────────────────────

function t5_appid(): void {
  console.log("\n── 5. appId y capacitor.config.json ──");

  comprobar("un appId de dominio al revés es válido", appIdValido("cerebronico.app.miapp") === true);
  comprobar("con mayúsculas NO es válido (Android no lo admite)", appIdValido("CerebroNico.App") === false);
  comprobar("una sola palabra NO es válido", appIdValido("cerebronico") === false);
  comprobar("vacío NO es válido", appIdValido("") === false);
  comprobar("un segmento que empieza por número NO es válido", appIdValido("app.3d") === false);

  comprobar("el appId propuesto nunca lleva mayúsculas", appIdDesdeNombre("Mi App Guay") === appIdDesdeNombre("Mi App Guay").toLowerCase());
  comprobar("y no empieza por número aunque el nombre sí", !/\.\d/.test(appIdDesdeNombre("3D Studio")) || /\.app3d/.test(appIdDesdeNombre("3D Studio")), appIdDesdeNombre("3D Studio"));

  const cfg = configCapacitor({ appId: "cerebronico.app.miapp", nombreApp: "Mi App", webDir: "dist" });
  let parseado: any = null;
  try {
    parseado = JSON.parse(cfg);
  } catch {}
  comprobar("la configuración es JSON válido", !!parseado);
  comprobar("lleva appId, appName y webDir", parseado?.appId === "cerebronico.app.miapp" && parseado?.appName === "Mi App" && parseado?.webDir === "dist");
}

// ─── Ejecución ──────────────────────────────────────────────────────────────

console.log("═══ PRUEBAS DE EXPORTACIÓN A ANDROID · CerebroNico v2.2 ═══");
t1_proyectos();
t2_herramientas();
t3_suelo();
t4_veredicto_y_pasos();
t5_appid();

console.log(`\n═══ RESULTADO: ${pasan} correctas · ${fallan} fallidas ═══`);
if (fallan > 0) {
  console.log("Fallos:");
  fallos.forEach((f) => console.log(`  · ${f}`));
}
process.exitCode = fallan > 0 ? 1 : 0;
