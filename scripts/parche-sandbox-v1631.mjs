#!/usr/bin/env node
/**
 * parche-sandbox-v1631.mjs — ESPEJO-SYNC + GUARDA-SERVIDOR-EJEC
 * =============================================================
 * 🐞 EL PROBLEMA (dos puertas, un solo fallo de las 2:10 a. m.)
 *  1. `npm run dev` (Vite) es un proceso de LARGA VIDA: nunca termina. Por la
 *     puerta síncrona `/api/exec` (execAsync con timeout) SIEMPRE moría
 *     `[exit 1] (timeout) Command failed: npm run dev`, y el preview quedaba
 *     muerto.
 *  2. El sync escribía SIEMPRE y NO retiraba NADA: un lote de 40 archivos
 *     seguido de uno de 38 dejaba los 2 viejos en disco para siempre (árbol
 *     mezclado). Los errores «X is not exported by Y» eran restos, no código.
 *
 * 🔧 EL ARREGLO (dos piezas + motor + suite)
 *  · GUARDA-SERVIDOR-EJEC en /api/exec: reconoce los servidores de larga vida
 *    (esServidorDeLargaVida en comandoEntrante.ts) y los arranca EN SU LUGAR
 *    (usaEnSuLugar) en segundo plano, devolviendo al momento.
 *  · ESPEJO-SYNC en /api/fs/sync: un manifiesto de propiedad
 *    (.cn-sync/manifiesto.json) recuerda qué escribió el sync; lo que escribió
 *    antes y ya no llega se RETIRA. El motor puro vive en
 *    src/engine/espejoSync.ts (se entrega aparte, igual que su suite
 *    tests/espejoSync.test.ts).
 *
 * Uso:  node scripts/parche-sandbox-v1631.mjs
 *       (idempotente: si ya está aplicado, no toca nada)
 * =============================================================
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raizBackend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARCA = "v1.6.31";

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

// ─── 1 · IMPORT en server.ts ────────────────────────────────────────────────
const IMPORT_VIEJO = `import { normalizarComandoEntrante } from "./src/engine/comandoEntrante";`;
const IMPORT_NUEVO = `import { normalizarComandoEntrante, esServidorDeLargaVida } from "./src/engine/comandoEntrante";
// v1.6.31 — ESPEJO-SYNC: el sync ya no deja restos. Un manifiesto de propiedad
// (.cn-sync/manifiesto.json) recuerda qué archivos escribió el sync; lo que se
// escribió antes y ya no llega se RETIRA. Las funciones puras viven en
// src/engine/espejoSync.ts; aquí solo se les da el disco.
import {
  MANIFESTO_DIR,
  MANIFESTO_FILE,
  crearManifiesto,
  planificarRetiro,
  registrarSync,
  serializarManifiesto,
  parsearManifiesto,
  esRutaIgnorableSync,
  lineaEspejoSync,
} from "./src/engine/espejoSync";`;

// ─── 2 · FUNCIÓN usaEnSuLugar (antes de /api/exec) ──────────────────────────
const FUNCION_VIEJO = `app.post("/api/exec", async (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });`;
const FUNCION_NUEVO = `// ============================================================
// v1.6.31 — GUARDA-SERVIDOR-EJEC · usaEnSuLugar
// ------------------------------------------------------------
// Un servidor de larga vida no se ejecuta por la puerta síncrona: \`execAsync\`
// espera a que el proceso «termine», y Vite/npm start/uvicorn… nunca terminan,
// así que morían por timeout. En su lugar (usaEnSuLugar) se arranca EN SEGUNDO
// PLANO y se devuelve al momento, sin esperar. El puerto se adapta al sandbox
// (:3500) igual que hace /api/sandbox/start.
// ============================================================
async function arrancarServidorEnSegundoPlano(comando: string, cwd: string) {
  try {
    const adaptado = normalizeProjectPort(cwd, SANDBOX_PORT);
    for (const c of adaptado.cambios) console.log(\`[CerebroNico] Proyecto adaptado · \${c}\`);
  } catch {
    /* la adaptación de puerto nunca debe tumbar el arranque */
  }
  const esWin = process.platform === "win32";
  const logPath = path.join(PROJECT_ROOT, ".sandbox_3500.log");
  let logStream: fs.WriteStream | null = null;
  try {
    logStream = fs.createWriteStream(logPath, { flags: "a" });
  } catch {
    logStream = null;
  }
  const hijo = esWin
    ? spawn("cmd.exe", ["/d", "/s", "/c", comando], {
        cwd,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      })
    : spawn(comando, {
        cwd,
        detached: true,
        shell: "/bin/bash",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
  if (logStream) {
    hijo.stdout?.pipe(logStream);
    hijo.stderr?.pipe(logStream);
  }
  hijo.unref?.();
  console.log(
    \`[CerebroNico] /api/exec — GUARDA-SERVIDOR-EJEC: «\${comando}» es un servidor de larga vida; en su lugar (usaEnSuLugar) se arranca en segundo plano (pid=\${hijo.pid ?? "?"}).\`
  );
  return {
    ok: true,
    exitCode: 0,
    timedOut: false,
    enSegundoPlano: true,
    pid: hijo.pid ?? null,
    comandoEjecutado: comando,
    stdout: "",
    stderr: "",
    nota:
      "Servidor de larga vida: no se espera a que termine (nunca termina). Arrancado en segundo plano; el preview estará en http://127.0.0.1:" +
      SANDBOX_PORT,
  };
}

app.post("/api/exec", async (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });`;

// ─── 3 · GUARDA dentro de /api/exec ─────────────────────────────────────────
const GUARDA_VIEJO = `    const result = await runCommand(norm.comando, workDir, Math.min(Number(timeoutMs) || 120000, 300000));
    return res.json({ ...result, comandoEjecutado: norm.comando, desenvuelto: norm.envuelto, nota: norm.motivo || undefined });`;
const GUARDA_NUEVO = `    // ============================================================
    // v1.6.31 — GUARDA-SERVIDOR-EJEC: un servidor de larga vida NO se
    // ejecuta por esta puerta síncrona. \`npm run dev\` (Vite) nunca termina,
    // así que aquí siempre moría por timeout (\`[exit 1] (timeout) Command
    // failed: npm run dev\`) y el preview quedaba muerto. En su lugar
    // (usaEnSuLugar) se arranca en segundo plano y se devuelve al momento.
    // ============================================================
    if (esServidorDeLargaVida(norm.comando)) {
      const usaEnSuLugar = await arrancarServidorEnSegundoPlano(norm.comando, workDir);
      return res.json({ ...usaEnSuLugar, desenvuelto: norm.envuelto, nota: norm.motivo || usaEnSuLugar.nota });
    }
    const result = await runCommand(norm.comando, workDir, Math.min(Number(timeoutMs) || 120000, 300000));
    return res.json({ ...result, comandoEjecutado: norm.comando, desenvuelto: norm.envuelto, nota: norm.motivo || undefined });`;

// ─── 4 · MANIFIESTO al inicio de /api/fs/sync ───────────────────────────────
const MANIFIESTO_VIEJO = `  const rejected: Array<{ path: string; issues: string[] }> = [];
  let syncIdx = 0; // TREGUA v1 /*TREGUA*/
  try {`;
const MANIFIESTO_NUEVO = `  const rejected: Array<{ path: string; issues: string[] }> = [];
  let syncIdx = 0; // TREGUA v1 /*TREGUA*/
  // ============================================================
  // v1.6.31 — ESPEJO-SYNC: el manifiesto de propiedad decide qué retirar.
  // ------------------------------------------------------------
  // Antes de escribir el lote nuevo se calcula qué rutas escribió el sync en
  // un lote anterior y YA NO vienen. Eso es un RESTO: si no se retira, el
  // árbol queda mezclado (el fallo de las 2:10 a. m.). El manifiesto vive en
  // .cn-sync/manifiesto.json, dentro de PROJECT_ROOT.
  // ============================================================
  const rutaManifiesto = path.join(PROJECT_ROOT, MANIFESTO_DIR, MANIFESTO_FILE);
  let manifiesto = crearManifiesto();
  try {
    const previo = parsearManifiesto(fs.readFileSync(rutaManifiesto, "utf-8"));
    if (previo) manifiesto = previo;
  } catch {
    /* primer sync: aún no hay manifiesto */
  }
  const rutasActuales = files
    .filter((f) => f && typeof f.path === "string" && !esRutaIgnorableSync(f.path))
    .map((f) => f.path);
  const retiro = planificarRetiro(manifiesto, rutasActuales);
  try {`;

// ─── 5 · RETIRO tras el bucle de escritura ──────────────────────────────────
const RETIRO_VIEJO = `      if (cedeElLazo(++syncIdx)) await new Promise<void>((r) => setImmediate(r)); /*TREGUA*/
    }
    // ============================================================
    // v2.0 — VERIFICACIÓN DE IMPORTS DESPUÉS DE SINCRONIZAR`;
const RETIRO_NUEVO = `      if (cedeElLazo(++syncIdx)) await new Promise<void>((r) => setImmediate(r)); /*TREGUA*/
    }

    // ============================================================
    // v1.6.31 — ESPEJO-SYNC: retirar restos y sellar el manifiesto.
    // ------------------------------------------------------------
    // 1. Se borran las rutas que escribimos antes y ya no llegan.
    // 2. Se registra el lote nuevo (huella por archivo) y se guarda el
    //    manifiesto para que el próximo sync sepa qué es nuestro.
    // ============================================================
    const retirados: string[] = [];
    for (const ruta of retiro.aRetirar) {
      try {
        const abs = resolveSafePath(ruta);
        const st = fs.existsSync(abs) ? fs.statSync(abs) : null;
        if (st && st.isFile()) {
          fs.unlinkSync(abs);
          retirados.push(ruta);
        }
      } catch {
        /* un retiro que falla no debe tumbar el sync */
      }
    }
    const registro = registrarSync(retiro.manana, files);
    try {
      fs.mkdirSync(path.dirname(rutaManifiesto), { recursive: true });
      fs.writeFileSync(rutaManifiesto, serializarManifiesto(registro.manifesto), "utf-8");
    } catch {
      /* el manifiesto es accesorio: si no se puede escribir, el sync sigue */
    }
    if (retirados.length > 0 || registro.escritos > 0) {
      console.log(\`[CerebroNico] \${lineaEspejoSync(registro, retirados.length)}\`);
    }

    // ============================================================
    // v2.0 — VERIFICACIÓN DE IMPORTS DESPUÉS DE SINCRONIZAR`;

// ─── 6 · retirados en la respuesta ──────────────────────────────────────────
const RESPUESTA_VIEJO = `      missingImports: missingImports.length,
      missingImportDetails: missingImports.slice(0, 8),
      stubsCreated,
      message:`;
const RESPUESTA_NUEVO = `      missingImports: missingImports.length,
      missingImportDetails: missingImports.slice(0, 8),
      stubsCreated,
      retirados,
      message:`;

// ─── 7 · Aduana: esServidorDeLargaVida ──────────────────────────────────────
const ADUANA_VIEJO = `  const motivo = envuelto
    ? \`Se desenvolvió el texto de la llamada de herramienta y se ejecuta el comando de dentro: «\${actual}».\`
    : "";

  return { comando: actual, envuelto, valido: true, motivo };
}`;
const ADUANA_NUEVO = `  const motivo = envuelto
    ? \`Se desenvolvió el texto de la llamada de herramienta y se ejecuta el comando de dentro: «\${actual}».\`
    : "";

  return { comando: actual, envuelto, valido: true, motivo };
}

// ============================================================
// v1.6.31 — GUARDA-SERVIDOR-EJEC
// ------------------------------------------------------------
// Un servidor de larga vida (Vite dev, \`npm start\`, uvicorn, Flask, Expo…)
// NUNCA termina: si se ejecuta por la puerta síncrona de \`/api/exec\`, siempre
// muere por timeout (\`[exit 1] (timeout) Command failed: npm run dev\`). Este
// predicado reconoce esos comandos para que el motor los arranque EN SU LUGAR
// (en segundo plano) y devuelva al momento. Es puro: entra una cadena, sale un
// booleano, y por eso se puede probar sin consola.
// ============================================================

/** Palabras que marcan un comando FINITO: nunca un servidor de larga vida. */
const PALABRAS_FINITAS =
  /\\b(build|compile|install|uninstall|test|lint|format|audit|eject|clean|prune|prebuild|postinstall)\\b/i;

const MARCAS_SERVIDOR: ReadonlyArray<RegExp> = [
  /\\bnpm\\s+(run\\s+)?(dev|start|preview)\\b/i,
  /\\b(?:yarn|pnpm)\\s+(?:run\\s+)?(dev|start|preview)\\b/i,
  /\\bnpx\\s+(vite|serve|next|nuxt|tsx|ts-node|http-server)\\b/i,
  /\\bvite\\b(?!\\s+build)/i,
  /\\bnext\\s+(dev|start)\\b/i,
  /\\bnuxt\\s+dev\\b/i,
  /\\b(uvicorn|gunicorn|daphne)\\b/i,
  /\\bflask\\s+run\\b/i,
  /\\bmanage\\.py\\s+runserver\\b/i,
  /\\bpython[^\\s]*\\s+-m\\s+http\\.server\\b/i,
  /\\bng\\s+serve\\b/i,
  /\\bexpo\\s+start\\b/i,
  /\\bparcel\\b/i,
];

/** ¿Este comando arranca un proceso de larga vida (y por tanto NO debe ir por
 * la puerta síncrona)? */
export function esServidorDeLargaVida(comando: string): boolean {
  const c = " " + String(comando ?? "").trim() + " ";
  if (!c.trim()) return false;
  if (/\\s(-h|--help)\\b/.test(c)) return false;
  if (PALABRAS_FINITAS.test(c)) return false;
  return MARCAS_SERVIDOR.some((re) => re.test(c));
}`;

// ─── 8 · Versión ────────────────────────────────────────────────────────────
const VERSION_CONST_VIEJO = `const VERSION_SEMVER = "1.6.30";`;
const VERSION_CONST_NUEVO = `const VERSION_SEMVER = "1.6.31";`;

const VERSION_PKG_VIEJO = `  "version": "1.6.30",`;
const VERSION_PKG_NUEVO = `  "version": "1.6.31",`;

// ─── 9 · Suite en validar.mjs ───────────────────────────────────────────────
const VALIDAR_VIEJO = `    { id: "estadoRescate", archivo: "tests/estadoRescate.test.ts", que: "v1.6.23: RESCATE — «Borrar todo» mudá primero el estado de CerebroNico (.cerebro-db, .cerebronico, MEMORIA/skills), aborta si el rescate falla, y re-siembra espejos y conocimiento tras el vaciado" },
];`;
const VALIDAR_NUEVO = `    { id: "estadoRescate", archivo: "tests/estadoRescate.test.ts", que: "v1.6.23: RESCATE — «Borrar todo» mudá primero el estado de CerebroNico (.cerebro-db, .cerebronico, MEMORIA/skills), aborta si el rescate falla, y re-siembra espejos y conocimiento tras el vaciado" },
    { id: "espejoSync", archivo: "tests/espejoSync.test.ts", que: "v1.6.31: ESPEJO-SYNC — manifiesto de propiedad (.cn-sync), retiro de restos y GUARDA-SERVIDOR-EJEC para que npm run dev no muera por timeout" },
];`;

parchear("server.ts", [
  { nombre: "import del espejoSync y del detector de servidores", marca: "ESPEJO-SYNC: el sync ya no deja restos", viejo: IMPORT_VIEJO, nuevo: IMPORT_NUEVO },
  { nombre: "arrancarServidorEnSegundoPlano (usaEnSuLugar) antes de /api/exec", marca: "GUARDA-SERVIDOR-EJEC · usaEnSuLugar", viejo: FUNCION_VIEJO, nuevo: FUNCION_NUEVO },
  { nombre: "GUARDA-SERVIDOR-EJEC dentro de /api/exec", marca: "GUARDA-SERVIDOR-EJEC: un servidor de larga vida NO se", viejo: GUARDA_VIEJO, nuevo: GUARDA_NUEVO },
  { nombre: "manifiesto de propiedad al inicio de /api/fs/sync", marca: "ESPEJO-SYNC: el manifiesto de propiedad decide qué retirar", viejo: MANIFIESTO_VIEJO, nuevo: MANIFIESTO_NUEVO },
  { nombre: "retiro de restos tras el bucle de escritura", marca: "ESPEJO-SYNC: retirar restos y sellar el manifiesto", viejo: RETIRO_VIEJO, nuevo: RETIRO_NUEVO },
  { nombre: "retirados en la respuesta del sync", marca: "stubsCreated,\n      retirados,", viejo: RESPUESTA_VIEJO, nuevo: RESPUESTA_NUEVO },
]);

parchear("src/engine/comandoEntrante.ts", [
  { nombre: "esServidorDeLargaVida en la aduana", marca: "v1.6.31 — GUARDA-SERVIDOR-EJEC", viejo: ADUANA_VIEJO, nuevo: ADUANA_NUEVO },
]);

parchear("src/constants.ts", [
  { nombre: "VERSION_SEMVER → 1.6.31", marca: 'const VERSION_SEMVER = "1.6.31";', viejo: VERSION_CONST_VIEJO, nuevo: VERSION_CONST_NUEVO },
]);

parchear("package.json", [
  { nombre: "package.json version → 1.6.31", marca: '"version": "1.6.31"', viejo: VERSION_PKG_VIEJO, nuevo: VERSION_PKG_NUEVO },
]);

parchear("scripts/validar.mjs", [
  { nombre: "suite espejoSync en npm run validar", marca: "espejoSync.test.ts", viejo: VALIDAR_VIEJO, nuevo: VALIDAR_NUEVO },
]);

console.log("");
console.log(`═══ ${MARCA}: ${aplicados} aplicado(s) · ${saltados} ya estaba(n) · ${fallos} fallo(s) ═══`);
if (fallos > 0) {
  console.error("Se aborta: revisa los anclajes (el archivo cambió de forma).");
  process.exit(1);
}
console.log("El motor (src/engine/espejoSync.ts) y su suite (tests/espejoSync.test.ts) se entregan aparte, junto a este parche.");
