#!/usr/bin/env node
/**
 * postinstall.mjs — INSTALACIÓN AUTOMATIZADA DEL MOTOR (v2.0)
 * ==========================================================
 * "Si le hacen falta instalar algún complemento, que venga automatizado en el
 * instalador." Esto es lo que hace este script, sin preguntar nada y sin poder
 * romper la instalación (todo va envuelto en try/catch: si algo falla, avisa y
 * sigue; nunca aborta npm install).
 *
 * Qué deja listo:
 *   1. .cerebro-db/kb.json  → la base de conocimiento del motor (sembrada).
 *   2. tools.config.json    → lista vacía de packs de herramientas externos,
 *                             con el formato documentado para el futuro.
 *   3. Informe de entorno   → Node, puertos (3000 IDE, 3500 sandbox, 5000 puente,
 *                             11434 Ollama) y modelos locales detectados.
 *   4. Extensiones          → cuenta las instaladas en ./extensions y valida que
 *                             tengan manifest.json.
 */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";

// ============================================================
// v2.1 — 🐞 ESTE SCRIPT ABORTABA `npm install`
// ------------------------------------------------------------
// Su propia cabecera promete "nunca aborta npm install", pero el log del
// sandbox en Windows mostraba:
//   npm error command C:\WINDOWS\system32\cmd.exe /d /s /c node scripts/postinstall.mjs
//   AUTO · npm install con errores: or command failed
// O sea: devolvía un código distinto de 0 y arrastraba consigo el resultado de
// la instalación, alarmando sin motivo — las dependencias ya quedaron
// instaladas ANTES de este paso.
// Aquí se cumple lo prometido: cualquier excepción o promesa rechazada se
// informa como aviso y el script TERMINA EN 0. Un postinstall de cortesía no
// debe decidir si un proyecto arranca o no.
// ============================================================
const avisoNoFatal = (e) => {
  console.log(`  \x1b[33m!\x1b[0m aviso: ${(e && e.message) || e}`);
  console.log("  \x1b[90m·\x1b[0m el postinstall NO debe abortar npm install; se continúa");
};
process.on("uncaughtException", (e) => { avisoNoFatal(e); process.exit(0); });
process.on("unhandledRejection", (e) => { avisoNoFatal(e); process.exit(0); });

const root = process.cwd();
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const info = (m) => console.log(`  \x1b[90m·\x1b[0m ${m}`);

console.log("\n\x1b[36m━━ CerebroNico IDE v2.1 · instalación del motor ━━\x1b[0m");

// ---------- 1. Base de conocimiento ----------
try {
  const dbDir = path.join(root, ".cerebro-db");
  const dbFile = path.join(dbDir, "kb.json");
  fs.mkdirSync(dbDir, { recursive: true });
  if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, JSON.stringify({ version: 2, entries: [], seededBy: "postinstall" }, null, 2), "utf-8");
    ok("Base de conocimiento creada en .cerebro-db/kb.json (el servidor la siembra al arrancar)");
  } else {
    ok("Base de conocimiento ya existente (se conserva lo aprendido)");
  }
} catch (e) {
  warn(`No se pudo preparar la base de conocimiento: ${e.message}`);
}

// ---------- 2. Packs de herramientas externos ----------
try {
  const cfg = path.join(root, "tools.config.json");
  if (!fs.existsSync(cfg)) {
    fs.writeFileSync(
      cfg,
      JSON.stringify(
        {
          _comment:
            "Packs de herramientas EXTERNOS. Cada entrada se carga al arrancar el servidor: hace GET <url>/tools y registra las herramientas que devuelva, sin tocar código. enabled=false para desactivar.",
          packs: [{ id: "ejemplo", label: "Pack de ejemplo", url: "http://127.0.0.1:5100", enabled: false }],
        },
        null,
        2
      ),
      "utf-8"
    );
    ok("tools.config.json creado (formato listo para enchufar herramientas externas)");
  } else {
    ok("tools.config.json ya existente");
  }
} catch (e) {
  warn(`No se pudo crear tools.config.json: ${e.message}`);
}

// ---------- 3. Extensiones ----------
try {
  const extDir = path.join(root, "extensions");
  if (!fs.existsSync(extDir)) {
    fs.mkdirSync(extDir, { recursive: true });
    info("Carpeta extensions/ creada vacía");
  } else {
    const dirs = fs.readdirSync(extDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    let valid = 0;
    const broken = [];
    for (const d of dirs) {
      const mf = path.join(extDir, d.name, "manifest.json");
      if (!fs.existsSync(mf)) { broken.push(d.name); continue; }
      try {
        const m = JSON.parse(fs.readFileSync(mf, "utf-8"));
        if (m.id && m.version && m.main) valid++;
        else broken.push(`${d.name} (faltan id/version/main)`);
      } catch {
        broken.push(`${d.name} (manifest.json inválido)`);
      }
    }
    ok(`Extensiones instaladas: ${valid}`);
    if (broken.length) warn(`Revisar: ${broken.join(", ")}`);
  }
} catch (e) {
  warn(`No se pudieron revisar las extensiones: ${e.message}`);
}

// ---------- 4. Entorno ----------
const major = Number(process.versions.node.split(".")[0]);
if (major >= 18) ok(`Node ${process.versions.node}`);
else warn(`Node ${process.versions.node}: se recomienda 18 o superior`);

const ports = [
  [3000, "IDE"],
  [3500, "Sandbox / preview"],
  [5000, "Puente PC (Python)"],
  [11434, "Ollama"],
];
function probe(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port, timeout: 400 });
    s.on("connect", () => { s.destroy(); resolve(true); });
    s.on("timeout", () => { s.destroy(); resolve(false); });
    s.on("error", () => resolve(false));
  });
}
const results = await Promise.all(ports.map(([p]) => probe(p)));
for (let i = 0; i < ports.length; i++) {
  const [p, label] = ports[i];
  if (results[i]) ok(`Puerto ${p} activo (${label})`);
  else info(`Puerto ${p} libre (${label}) — se arrancará al iniciar la app`);
}

// Ollama: modelos locales disponibles
try {
  const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(1500) });
  const data = await r.json();
  const models = (data?.models || []).map((m) => m.name);
  if (models.length) {
    ok(`Ollama responde con ${models.length} modelo(s) local(es)`);
    info(models.slice(0, 8).join(", ") + (models.length > 8 ? " …" : ""));
    const micro = models.filter((n) => /[:@_-](0?\.\d+|\d+(\.\d+)?)b\b/i.test(n) && parseFloat(/(\d+(?:\.\d+)?)b/i.exec(n)?.[1] || "99") <= 3);
    if (micro.length) info(`Modelos ligeros detectados (ideales para 8 GB): ${micro.join(", ")}`);
  } else {
    warn("Ollama responde pero no hay modelos: ejecuta `ollama pull qwen2.5-coder:1.5b`");
  }
} catch {
  info("Ollama no está arrancado todavía (normal antes del primer inicio)");
}

console.log("\x1b[36m━━ Motor listo. El conocimiento vive en .cerebro-db, no en el modelo. ━━\x1b[0m\n");

// v2.4 — Los modelos neurales se descargan solos, según el tramo MR de la máquina.
// Regla heredada del v2.1: NINGÚN paso de cortesía puede abortar npm install.
// Si Ollama no está, o la descarga falla, se DECLARA y se sale igual en 0:
// el IDE funciona desde el primer minuto con el reflejo; el modelo es mejora.
try {
  const os = await import("node:os");
  const { instalarModelos } = await import("./instalar-modelos.mjs");
  await instalarModelos({ ramGB: Math.round(os.default.totalmem() / 1024 ** 3) });
} catch (e) {
  console.log("[Modelos] el instalador no pudo correr:", (e && e.message) || e, "— npm install sigue su curso.");
}

// v2.1 — Salida EXPLÍCITA en 0 (ver el bloque de cabecera de este archivo):
// npm install no debe fallar por un paso de cortesía.
process.exit(0);
