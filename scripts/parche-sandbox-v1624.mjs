/**
 * parche-sandbox-v1624.mjs — refleja en dist/server.mjs el parche
 * «SANDBOX AUTO-SANADOR» ya aplicado a server.ts + engine (v1.6.24).
 * Idempotente: si detecta el marcador, no vuelve a actuar.
 * Uso: node scripts/parche-sandbox-v1624.mjs
 */
import fs from "node:fs";

const RUTA = new URL("../dist/server.mjs", import.meta.url).pathname;
let src = fs.readFileSync(RUTA, "utf-8");

if (src.includes("v1.6.24-SANDBOXFIX")) {
  console.log("El bundle ya está parcheado (v1.6.24-SANDBOXFIX presente). Nada que hacer.");
  process.exit(0);
}

let aplicados = 0;
const fallar = (nombre) => {
  console.error(`✘ ANCLA NO ÚNICA O AUSENTE: ${nombre}`);
  process.exit(1);
};
function reemplazaEntre(inicioAncla, finAnclaExclusivo, nuevoTexto, nombre) {
  const i = src.indexOf(inicioAncla);
  if (i === -1 || src.indexOf(inicioAncla, i + 1) !== -1) fallar(nombre + " (inicio)");
  const j = src.indexOf(finAnclaExclusivo, i);
  if (j === -1) fallar(nombre + " (fin)");
  src = src.slice(0, i) + nuevoTexto + src.slice(j);
  aplicados++;
  console.log(`✔ ${nombre}`);
}
function reemplazaUno(ancla, nuevoTexto, nombre) {
  const i = src.indexOf(ancla);
  if (i === -1 || src.indexOf(ancla, i + 1) !== -1) fallar(nombre);
  src = src.slice(0, i) + nuevoTexto + src.slice(i + ancla.length);
  aplicados++;
  console.log(`✔ ${nombre}`);
}
function insertaAntes(ancla, texto, nombre) {
  const i = src.indexOf(ancla);
  if (i === -1 || src.indexOf(ancla, i + 1) !== -1) fallar(nombre);
  src = src.slice(0, i) + texto + src.slice(i);
  aplicados++;
  console.log(`✔ ${nombre}`);
}

/* ── B1 · helpers de auditoría (sección dependenciasProyecto) ───────────── */
insertaAntes(
  "// src/engine/viaRapidaPreview.ts",
  `// v1.6.24-SANDBOXFIX — auditoría de integridad (espejo de src/engine/dependenciasProyecto.ts)
function saludDePaquete(dirPaquete, disco) {
  if (!disco.existe(dirPaquete)) return "ausente";
  const texto = disco.leer(disco.unir(dirPaquete, "package.json"));
  if (texto === null) return "roto";
  let pkg;
  try {
    pkg = JSON.parse(texto);
  } catch {
    return "roto";
  }
  const relativo = (v) => typeof v === "string" && v.startsWith("./") ? v.slice(2) : null;
  let entrada = relativo(pkg?.main);
  if (!entrada) entrada = relativo(pkg?.exports);
  if (!entrada && pkg?.exports && typeof pkg.exports === "object") {
    const punto = pkg.exports["."];
    if (typeof punto === "string") entrada = relativo(punto);
    else if (punto && typeof punto === "object") {
      entrada = relativo(punto.import) || relativo(punto.require) || relativo(punto.default);
    }
  }
  if (!entrada && pkg?.bin) {
    if (typeof pkg.bin === "string") entrada = relativo("./" + pkg.bin.replace(/^\\.?\\//, ""));
    else if (typeof pkg.bin === "object") {
      const primero = Object.values(pkg.bin)[0];
      if (typeof primero === "string") entrada = relativo("./" + primero.replace(/^\\.?\\//, ""));
    }
  }
  if (!entrada) return "ok";
  return disco.existe(disco.unir(dirPaquete, entrada)) ? "ok" : "roto";
}
function auditarInstalacion(raizProyecto, declarados, disco) {
  const nm = disco.unir(raizProyecto, "node_modules");
  const ausentes = [];
  const rotos = [];
  for (const p of declarados) {
    const dir = disco.unir(nm, ...p.split("/"));
    const s = saludDePaquete(dir, disco);
    if (s === "ausente") ausentes.push(p);
    else if (s === "roto") rotos.push(p);
  }
  return { ausentes, rotos };
}
function instalacionSana(a) {
  return a.ausentes.length === 0 && a.rotos.length === 0;
}

`,
  "B1 helpers de auditoría"
);

/* ── B2 · elegirViaPreview: marco con servidor respeta el árbol roto ────── */
reemplazaUno(
  "requiereInstalar: !e.tieneNodeModules,",
  "requiereInstalar: !e.tieneNodeModules || e.nodeModulesSano === false,",
  "B2 framework branch"
);

/* ── B3 · elegirViaPreview: config propia + node_modules podado ─────────── */
reemplazaEntre(
  'if (e.tieneConfigPropia && e.tieneNodeModules) {',
  'if (e.fuentes.length === 0) {',
  `if (e.tieneConfigPropia && e.tieneNodeModules) {
    // v1.6.24-SANDBOXFIX — «instalado» ya no es «existe la carpeta»: un árbol
    // podado por el ZIP o por un npm install cortado NO puede servir su dev.
    if (e.nodeModulesSano === false) {
      return {
        via: "npm-dev",
        motivo: "El proyecto trae configuración propia y una carpeta node_modules, pero la auditoría encontró paquetes declarados rotos o ausentes: se reinstala antes de respetar su \`dev\`.",
        requiereInstalar: true,
        requiereCompilar: false
      };
    }
    return {
      via: "npm-dev",
      motivo: "El proyecto trae su propia configuración y ya está instalado: se respeta su \`dev\` en vez de improvisar un bundle que ignoraría alias y plugins.",
      requiereInstalar: false,
      requiereCompilar: false
    };
  }
  `,
  "B3 config+nodeModules roto"
);

/* ── B4 · wrapper de decisión + adaptador de disco ──────────────────────── */
reemplazaEntre(
  "const decidirViaPreviewDelProyecto = () => {",
  "const compilarPreviewRapida = async () => {",
  `// v1.6.24-SANDBOXFIX — adaptador de disco para la auditoría de integridad:
      // lo usan la decisión de vía y el chequeo pre-arranque. Una sola regla:
      // «instalado» no es que exista la carpeta, es que la entrada responda.
      const discoAuditoria = {
        existe: (p) => fs7.existsSync(p),
        leer: (p) => {
          try {
            return fs7.readFileSync(p, "utf-8");
          } catch {
            return null;
          }
        },
        unir: (...p) => path7.join(...p)
      };
      const auditarRaiz = (raiz, declarados) => auditarInstalacion(raiz, declarados, discoAuditoria);
      const decidirViaPreviewDelProyecto = () => {
        const ficheros = leerFicherosProyecto(raizProyecto);
        let dependencias = [];
        try {
          const pkg = JSON.parse(fs7.readFileSync(path7.join(raizProyecto, "package.json"), "utf-8"));
          dependencias = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
        } catch {
        }
        const hayNodeModules = fs7.existsSync(path7.join(raizProyecto, "node_modules"));
        const nodeModulesSano = hayNodeModules ? instalacionSana(auditarRaiz(raizProyecto, dependencias)) : true;
        return elegirViaPreview({
          tieneIndexHtml: hasIndexHtml,
          tienePackageJson: hasPkgJson,
          fuentes: fuentesATranspilar(ficheros),
          tieneNodeModules: hayNodeModules,
          nodeModulesSano,
          tieneConfigPropia: tieneConfigPropia(ficheros),
          frameworkConServidor: esFrameworkConServidor(dependencias)
        });
      };
      `,
  "B4 wrapper decisión"
);

/* ── B5 · bandera de auto-instalación visible en la respuesta ───────────── */
reemplazaUno(
  'if (process.env.SANDBOX_AUTO_DEPS !== "0") {',
  `// v1.6.24-SANDBOXFIX — informa si el sandbox se instaló solo en este arranque.
      let dependenciasInstaladas = false;
      if (process.env.SANDBOX_AUTO_DEPS !== "0") {`,
  "B5 bandera instalo"
);
// nota: la ancla B5 aparece con la sangría exacta del bundle; si fallase se ve.

/* ── B6 · preflight: auditoría + purga + install real antes de spawn ────── */
reemplazaEntre(
  "let declaradosDeps = [];",
  "} catch (err) {\n          console.warn(\n            `[CerebroNico] Sandbox: el chequeo de dependencias no pudo completarse",
  `let declaradosDeps = [];
          let nombrePkgDeps = "";
          try {
            const pkg = JSON.parse(fs7.readFileSync(path7.join(raizDeps, "package.json"), "utf-8"));
            nombrePkgDeps = String(pkg?.name || "");
            declaradosDeps = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
          } catch {
          }
          // La IDE anidada se autorrepara en su bloque PROPIO-IDE (con
          // --ignore-scripts); que el preflight no le monte un install paralelo.
          const esPropiaIdeDeps = nombrePkgDeps === "cerebronico-ide";
          const entornoDeps = {
            declarados: declaradosDeps,
            // v1.6.24-SANDBOXFIX — «está» es que su entrada responda, no que
            // exista la carpeta.
            estaInstalado: (p) => saludDePaquete(path7.join(raizDeps, "node_modules", ...p.split("/")), discoAuditoria) === "ok"
          };
          const faltantes = paquetesFaltantes(ficherosDeps, entornoDeps);
          const sinInstalar = declaradosSinInstalar(ficherosDeps, entornoDeps);
          const auditoria = esPropiaIdeDeps ? { ausentes: [], rotos: [] } : auditarRaiz(raizDeps, declaradosDeps);
          if (auditoria.rotos.length > 0) {
            console.log(\`[CerebroNico] Sandbox: \${auditoria.rotos.length} paquete(s) con instalación incompleta (\${auditoria.rotos.slice(0, 5).join(", ")}) → se purgan antes de reinstalar.\`);
            for (const p of auditoria.rotos) {
              try {
                fs7.rmSync(path7.join(raizDeps, "node_modules", ...p.split("/")), { recursive: true, force: true });
              } catch {
              }
            }
          }
          const aReinstalar = auditoria.ausentes.length > 0 || auditoria.rotos.length > 0;
          if (aReinstalar) {
            // v1.6.24-SANDBOXFIX — antes esto era solo un aviso: el usuario se
            // quedaba sin sandbox. Ahora npm install ANTES del spawn (sin
            // watchers vivos) y con 600 s — el timeout de 300 s era, de hecho,
            // el generador de árboles incompletos.
            console.log(\`[CerebroNico] Sandbox: \${auditoria.ausentes.length} ausente(s) + \${auditoria.rotos.length} roto(s) en node_modules → npm install automático antes de arrancar.\`);
            const inst = await runCommand("npm install --no-audit --no-fund", raizDeps, 6e5);
            if (inst.exitCode === 0) {
              dependenciasInstaladas = true;
              console.log("[CerebroNico] Sandbox: ✔ npm install completo — ahora sí se puede respetar su \`dev\`.");
            } else {
              const detalle = String(inst.stderr || inst.stdout || "").split("\\n").filter((x) => x.trim()).slice(-2).join(" · ");
              console.warn(\`[CerebroNico] Sandbox: ✘ npm install no completó (\${inst.timedOut ? "timeout de 10 min — ¿red lenta o registry caído?" : \`exit \${inst.exitCode}\`})\${detalle ? \`: \${detalle}\` : ""}. Se intenta arrancar igual; la auto-reparación reintenta.\`);
            }
          } else if (sinInstalar.length > 0) {
            console.warn(\`[CerebroNico] Sandbox: \${sinInstalar.length} dependencia(s) declaradas y SIN instalar (\${sinInstalar.slice(0, 5).join(", ")}). La auditoría no las vio rotas; puede ser hoisting anidado.\`);
          }
          if (faltantes.length > 0 && !esPropiaIdeDeps) {
            console.log(\`[CerebroNico] Sandbox: \${describirFaltantes(faltantes)} → se instalan antes de arrancar.\`);
            const cmd = comandoInstalacion(faltantes);
            const r = cmd ? await runCommand(cmd, raizDeps, 6e5) : null;
            if (r && r.exitCode === 0) dependenciasInstaladas = true;
          }
        `,
  "B6 preflight con auditoría"
);

/* ── B7 · reparación activada por defecto + escalada (purga total) ─────── */
reemplazaEntre(
  'const autoInstallEnabled = process.env.AUTO_INSTALL_DEPS === "1"',
  "const cola = online ? \"\" : readLogTail();",
  `const autoInstallEnabled = process.env.AUTO_INSTALL_DEPS !== "0";
      if (autoInstallEnabled && !online && !isPidAlive(sandboxProc?.pid) && needsInstall(readLogTail())) {
        console.log("[CerebroNico] Sandbox: dependencias faltantes detectadas -> npm install automático");
        try {
          sandboxProc = null;
          await runCommand("npm install --no-audit --no-fund", resolverRaizProyecto2().raiz, 6e5);
          healed = true;
        } catch {
        }
        sandboxProc = spawnSandbox();
        online = await waitPortOrDeath(6e4);
        if (!online && !isPidAlive(sandboxProc?.pid) && needsInstall(readLogTail())) {
          try {
            const raizMartillo = resolverRaizProyecto2().raiz;
            console.log("[CerebroNico] Sandbox: el reintegro no sanó el árbol → se purga node_modules y se instala de cero.");
            fs7.rmSync(path7.join(raizMartillo, "node_modules"), { recursive: true, force: true });
            const martillo = await runCommand("npm install --no-audit --no-fund", raizMartillo, 6e5);
            if (martillo.exitCode === 0) dependenciasInstaladas = true;
            healed = true;
          } catch {
          }
          sandboxProc = spawnSandbox();
          online = await waitPortOrDeath(6e4);
        }
      } else if (!online && !autoInstallEnabled && needsInstall(readLogTail())) {
        console.warn("[CerebroNico] Sandbox: dependencias faltantes, pero la auto-instalación fue desactivada a mano (AUTO_INSTALL_DEPS=0). Ejecuta manualmente: cd .proyectos && npm install (o quita la variable para que la IDE se repare sola).");
      }
      `,
  "B7 reparación + escalada"
);

/* ── B8 · pista honesta cuando la reparación ya se intentó sola ────────── */
reemplazaEntre(
  '        } else if (/Cannot find (module|package)|ERR_MODULE_NOT_FOUND|is not recognized|no se reconoce/i.test(cola)) {',
  "        } else if (!vivo) {",
  `        } else if (/Cannot find (module|package)|ERR_MODULE_NOT_FOUND|is not recognized|no se reconoce/i.test(cola)) {
          pista = autoInstallEnabled ? "La auto-instalación del sandbox no logró sanarlo. Casi siempre es RED (registry.npmjs.com inalcanzable, proxy, antivirus) o un package.json con versiones incompatibles. El detalle está en el log de arriba; con el problema resuelto, vuelve a pulsar Arrancar — no hace falta tocar la terminal." : "Faltan dependencias y la reparación automática está apagada (AUTO_INSTALL_DEPS=0). Quítala para que la IDE se repare sola, o ejecuta «npm install» en el proyecto.";
`,
  "B8 pista"
);

/* ── B9 · campos instalo/via en la respuesta ────────────────────────────── */
reemplazaUno(
  `        healed,
        running: vivo,`,
  `        healed,
        instalo: dependenciasInstaladas,
        via: viaPreview.via,
        running: vivo,`,
  "B9 respuesta JSON"
);

fs.writeFileSync(RUTA, src, "utf-8");
console.log(`\n✅ dist/server.mjs parcheado — ${aplicados} sustituciones (v1.6.24-SANDBOXFIX).`);
