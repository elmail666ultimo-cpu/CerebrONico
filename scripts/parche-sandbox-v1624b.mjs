/**
 * parche-sandbox-v1624b.mjs — SANDBOXFIX2 en dist/server.mjs (espejo de la
 * segunda tanda de server.ts: helpers compartidos, GUARDA-E del aplanado,
 * GUARDA-RECURSIÓN ANIDADA, GUARDA-ENOENT en /api/exec, `installed` auditado
 * y verify-preview consciente de la vía). Idempotente.
 * Requiere parche-sandbox-v1624.mjs ya aplicado.
 */
import fs from "node:fs";

const RUTA = new URL("../dist/server.mjs", import.meta.url).pathname;
let src = fs.readFileSync(RUTA, "utf-8");

if (src.includes("v1.6.24b-SANDBOXFIX2")) {
  console.log("SANDBOXFIX2 ya presente. Nada que hacer.");
  process.exit(0);
}
if (!src.includes("v1.6.24-SANDBOXFIX")) {
  console.error("✘ Falta la primera tanda (v1.6.24-SANDBOXFIX). Ejecuta antes parche-sandbox-v1624.mjs");
  process.exit(1);
}

let aplicados = 0;
const fallar = (n) => { console.error(`✘ ANCLA NO ÚNICA O AUSENTE: ${n}`); process.exit(1); };
function insertaAntes(ancla, texto, nombre) {
  const i = src.indexOf(ancla);
  if (i === -1 || src.indexOf(ancla, i + 1) !== -1) fallar(nombre + " (ancla)");
  src = src.slice(0, i) + texto + src.slice(i);
  aplicados++; console.log(`✔ ${nombre}`);
}
function reemplazaEntre(inicioAncla, finAnclaExclusivo, nuevoTexto, nombre) {
  const i = src.indexOf(inicioAncla);
  if (i === -1 || src.indexOf(inicioAncla, i + 1) !== -1) fallar(nombre + " (inicio)");
  const j = src.indexOf(finAnclaExclusivo, i);
  if (j === -1) fallar(nombre + " (fin)");
  src = src.slice(0, i) + nuevoTexto + src.slice(j);
  aplicados++; console.log(`✔ ${nombre}`);
}
function reemplazaUno(ancla, nuevo, nombre) {
  const i = src.indexOf(ancla);
  if (i === -1 || src.indexOf(ancla, i + 1) !== -1) fallar(nombre);
  src = src.slice(0, i) + nuevo + src.slice(i + ancla.length);
  aplicados++; console.log(`✔ ${nombre}`);
}

/* C1 · helpers a nivel de módulo (junto al resolutor, usando fs7/path7) ─── */
insertaAntes(
  "function nombreProyectoSandbox() {",
  `// v1.6.24b-SANDBOXFIX2 — ayudantes compartidos del sandbox (espejo de server.ts)
const DISCO_AUDITORIA2 = {
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
function esCarpetaDeLaAppViva(dir) {
  try {
    const r = path7.resolve(dir);
    const cwdApp = path7.resolve(process.cwd());
    return r === cwdApp || cwdApp.startsWith(r + path7.sep);
  } catch {
    return false;
  }
}
function nombreDelPackageEn(dir) {
  try {
    return String(JSON.parse(fs7.readFileSync(path7.join(dir, "package.json"), "utf-8"))?.name || "") || null;
  } catch {
    return null;
  }
}
function nodeModulesSanoEn(raiz) {
  if (!fs7.existsSync(path7.join(raiz, "node_modules"))) return false;
  let deps = [];
  try {
    const pkg = JSON.parse(fs7.readFileSync(path7.join(raiz, "package.json"), "utf-8"));
    deps = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
  } catch {
    return true;
  }
  if (deps.length === 0) return true;
  return instalacionSana(auditarInstalacion(raiz, deps, DISCO_AUDITORIA2));
}
function buscarPackageJsonBajo(base) {
  const IGNORAR = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage", ".next", ".nuxt", ".vite", "__pycache__", "venv", ".venv"]);
  const cola = [{ dir: base, prof: 0 }];
  while (cola.length > 0) {
    const cur = cola.shift();
    if (cur.prof > 4) continue;
    let entradas = [];
    try {
      entradas = fs7.readdirSync(cur.dir);
    } catch {
      continue;
    }
    for (const e of entradas) {
      const abs = path7.join(cur.dir, e);
      let esDir = false;
      let esArchivo = false;
      try {
        const st = fs7.statSync(abs);
        esDir = st.isDirectory();
        esArchivo = st.isFile();
      } catch {
        continue;
      }
      if (esArchivo && e === "package.json" && cur.prof > 0) return cur.dir;
      if (!esDir || IGNORAR.has(e)) continue;
      cola.push({ dir: abs, prof: cur.prof + 1 });
    }
  }
  return null;
}
`,
  "C1 helpers módulo"
);

/* C2 · guarda de recursión ANIDADA en /api/sandbox/start ────────────────── */
reemplazaUno(
  '        const pkgCamino = path7.join(PROJECT_ROOT, "package.json");',
  `// v1.6.24b-SANDBOXFIX2 — la guarda también mira la raíz RESUELTA: con
        // carpeta contenedora, la IDE anidada pasaba desapercibida hasta
        // cinco minutos después, en plena compilación de sí misma.
        if (req.body?.confirmar !== "recursion") {
          const raizRes = resolverRaizProyecto2();
          if (raizRes.anidada && nombreDelPackageEn(raizRes.raiz) === "cerebronico-ide") {
            const rel = path7.relative(PROJECT_ROOT, raizRes.raiz).split(path7.sep).join("/");
            return res.json({
              requiereConfirmacion: true,
              aviso: "Hay una copia de Cerebr\u00F3Nico ANIDADA en el sandbox (\u00AB" + rel + "/\u00BB): arrancarla ser\u00EDan dos IDEs compartiendo RAM, y el preview mostrar\u00EDa la propia IDE, no tu app. Si es exactamente lo que buscas (probar la IDE dentro de la IDE), conf\u00EDrmalo y se arranca igual."
            });
          }
        }
        const pkgCamino = path7.join(PROJECT_ROOT, "package.json");`,
  "C2 recursión anidada"
);

/* C3 · status: installed auditado ───────────────────────────────────────── */
reemplazaUno(
  'installed: fs7.existsSync(path7.join(resolverRaizProyecto2().raiz, "node_modules")),',
  "installed: nodeModulesSanoEn(resolverRaizProyecto2().raiz), // v1.6.24b-SANDBOXFIX2: podado ≠ instalado",
  "C3 installed auditado"
);

/* C4 · /api/exec: GUARDA-ENOENT ─────────────────────────────────────────── */
reemplazaEntre(
  "const workDir = cwd ? resolveSafePath(String(cwd)) : resolverRaizProyecto2().raiz;",
  "const result = await runCommand(norm.comando, workDir,",
  `let workDir = cwd ? resolveSafePath(String(cwd)) : resolverRaizProyecto2().raiz;
      if (!cwd && /^\\s*(npm|npx)\\b/i.test(norm.comando) && !fs7.existsSync(path7.join(workDir, "package.json"))) {
        const abajo = buscarPackageJsonBajo(workDir);
        if (abajo) {
          console.log(\`[CerebroNico] /api/exec — GUARDA-ENOENT: no hay package.json en «\${workDir}»; el comando va a «\${abajo}».\`);
          workDir = abajo;
        } else {
          return res.json({
            ok: false,
            exitCode: 1,
            stdout: "",
            stderr: "No hay ning\u00FAn package.json en el sandbox: no hay proyecto npm que instalar. Pulsa Sync para escribir el proyecto en disco o pide al agente que lo genere \u2014 la instalaci\u00F3n es autom\u00E1tica despu\u00E9s.",
            error: "Sin package.json en el sandbox"
          });
        }
      }
      `,
  "C4 GUARDA-ENOENT"
);

/* C5 · flatten: GUARDA-E ────────────────────────────────────────────────── */
insertaAntes(
  "      const pkgEn = (dir2) => {",
  `// ============================================================
      // v1.6.24b-SANDBOXFIX2 — GUARDA-E: no se aplana el suelo que pisa el
      // programa vivo. El log del usuario lo contó: la copia anidada era la
      // propia CerebróNico, el aplanado la renombraba bajo el proceso en
      // ejecución y el sandbox acababa con un «pid externo» sirviendo restos.
      // ============================================================
      if (esCarpetaDeLaAppViva(from)) {
        const relE = path7.relative(PROJECT_ROOT, from).split(path7.sep).join("/") || ".";
        const msg = "La copia anidada \u00AB" + relE + "/\u00BB es la propia Cerebr\u00F3Nico EN EJECUCI\u00D3N (el programa arranca desde ah\u00ED): aplanarla mover\u00EDa los archivos del programa mientras corre. El sandbox debe contener TU app, no la IDE \u2014 quita \u00ABide/\u00BB del editor o borra el sandbox y sincroniza solo tu proyecto.";
        console.warn(\`[CerebroNico] \u{1F9F1} GUARDA-E: \${msg}\`);
        return res.json({ ok: false, moved: 0, merged: 0, replaced: 0, skipped: [], from: relE, message: msg });
      }
      // ============================================================
`,
  "C5 GUARDA-E flatten"
);

/* C6 · verify-preview consciente de la vía ──────────────────────────────── */
reemplazaEntre(
  'const compDir = path7.join(raiz, "src", "components");',
  'app.get("/api/health/deep"',
  `// v1.6.24b-SANDBOXFIX2 — el verificador ya no vive solo en el mundo Vite:
    // primero averigua QUÉ vía corre y sondea lo que esa vía promete servir.
    const leerSeguro = (p) => {
      try {
        return fs7.readFileSync(p, "utf-8");
      } catch {
        return "";
      }
    };
    let pkgRaiz = null;
    try {
      pkgRaiz = JSON.parse(leerSeguro(path7.join(raiz, "package.json")));
    } catch {
    }
    const htmlRaiz = leerSeguro(path7.join(raiz, "index.html"));
    const bundleEnDisco = fs7.existsSync(path7.join(raiz, NOMBRE_BUNDLE));
    const viaReportada = pkgRaiz?.name === "cerebronico-ide" ? "ide-anidada" : bundleEnDisco || htmlRaiz.includes(NOMBRE_BUNDLE) ? "estatico-compilado" : pkgRaiz ? "npm-dev" : "estatico-directo";
    let componentesEnDisco = 0;
    try {
      componentesEnDisco = fs7.readdirSync(path7.join(raiz, "src", "components")).filter((f) => /\\.(tsx|jsx)$/i.test(f)).length;
    } catch {
    }
    const sondas = [{ ruta: "/", etiqueta: "HTML ra\\u00EDz", obligatorio: true }];
    if (viaReportada === "estatico-compilado") {
      sondas.push({ ruta: \`/\${NOMBRE_BUNDLE}\`, etiqueta: "bundle esbuild", obligatorio: true });
    } else if (viaReportada === "npm-dev") {
      let primerComponente = "";
      try {
        primerComponente = fs7.readdirSync(path7.join(raiz, "src", "components")).filter((f) => /\\.(tsx|jsx)$/i.test(f))[0] || "";
      } catch {
      }
      sondas.push({ ruta: "/src/main.tsx", etiqueta: "main.tsx", obligatorio: true });
      if (primerComponente) sondas.push({ ruta: \`/src/components/\${primerComponente.replace(/\\.(tsx|jsx)$/i, "")}\`, etiqueta: "componente", obligatorio: false });
    } else if (viaReportada === "ide-anidada") {
      const asset = (htmlRaiz.match(/(?:src|href)="(\\/assets\\/[^"]+)"/) || [])[1];
      if (asset) sondas.push({ ruta: asset, etiqueta: "asset de la IDE", obligatorio: true });
    } else {
      const jsRef = (htmlRaiz.match(/src="\\.?\\u002F?([\\w./-]+\\.js)"/) || [])[1];
      if (jsRef) sondas.push({ ruta: "/" + jsRef.replace(/^\\/+/, ""), etiqueta: "script", obligatorio: false });
    }
    const resultados = [];
    for (const s of sondas) {
      let status = 0;
      let bytes = 0;
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 4000);
        const resp = await fetch(base + s.ruta, { signal: ac.signal });
        clearTimeout(t);
        status = resp.status;
        bytes = (await resp.text()).length;
      } catch {
        status = -1;
      }
      resultados.push({ ruta: s.ruta, status, bytes });
    }
    const detalle = (r) => \`\${r.ruta}: HTTP \${r.status} (\${r.bytes} B)\`;
    const obligatorias = resultados.map((r, i) => ({ r, s: sondas[i] })).filter((x) => x.s.obligatorio);
    const fallidas = obligatorias.filter((x) => !(x.r.status === 200 && x.r.bytes > 0));
    const paginaMuyFlaca = resultados[0] && resultados[0].status === 200 && resultados[0].bytes < 60;
    const ok = obligatorias.length > 0 && fallidas.length === 0 && !paginaMuyFlaca;
    return res.json({
      ok,
      base,
      raiz,
      via: viaReportada,
      componentesEnDisco,
      resultados,
      message: ok ? \`Preview verificado (v\\u00EDa \${viaReportada}): \${obligatorias.map((x) => detalle(x.r)).join(" \\u00B7 ")}.\` : paginaMuyFlaca ? \`El puerto responde pero el HTML est\\u00E1 VACIO (\${resultados[0].bytes} bytes): el servidor no encontr\\u00F3 su ra\\u00EDz. Det\\u00E9n, Sync completo y vuelve a arrancar.\` : \`El puerto responde pero no se sirve lo que la v\\u00EDa \\u00AB\${viaReportada}\\u00BB promete. Obligatorio fallido: \${fallidas.map((x) => \`\${x.s.etiqueta} (\${detalle(x.r)})\`).join(" \\u00B7 ")}. Se sond\\u00F3: \${resultados.map(detalle).join(" \\u00B7 ")}. Si arriba aparece un \\u00ABpid externo\\u00BB, es un servidor hu\\u00E9rfano de otra sesi\\u00F3n: usa \\u00ABForzar Limpieza\\u00BB y vuelve a Arrancar.\`
    });
  });

  // ============================================================
  // v2.1 — CHECKEO PROFUNDO
  // ============================================================
  `,
  "C6 verify por vía"
);

fs.writeFileSync(RUTA, src, "utf-8");
console.log(`\n✅ dist/server.mjs — SANDBOXFIX2 aplicado (${aplicados} sustituciones).`);
