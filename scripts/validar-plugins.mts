/**
 * validar-plugins.mts — UN COMANDO, UN VEREDICTO para el lote cn.*
 * ================================================================
 * Reutiliza validateManifest del PROPIO IDE (fuente única: lo que aquí pasa,
 * en Server.ts pasa) y añade las reglas estructurales que un manifiesto
 * válido no ve: handler→comando existente, nombres de tool únicos en todo
 * el lote, slash colisionando con otros, ficheros que deben existir y el
 * protocolo del puente presente en cada panel.
 *
 *   # copiar este fichero a ide/backend/scripts/ y desde ide/backend:
 *   npx tsx scripts/validar-plugins.mts ../../cerebronico-plugins-v1/plugins
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateManifest, EXTENSION_PERMISSIONS } from "../src/engine/extensions";

const args = process.argv.slice(2);
const AQUI = path.dirname(fileURLToPath(import.meta.url)); // ide/backend/scripts
const esDir = (c) => { try { return fs.statSync(c).isDirectory(); } catch { return false; } };
const POR_DEFECTO =
  esDir(path.resolve(AQUI, "..", "..", "..", "mejoras", "cerebronico-plugins-v1", "plugins")) ? path.resolve(AQUI, "..", "..", "..", "mejoras", "cerebronico-plugins-v1", "plugins") :
  esDir(path.resolve(AQUI, "..", "extensions")) ? path.resolve(AQUI, "..", "extensions") :
  esDir("plugins") ? path.resolve("plugins") : "plugins";
const DIRECTORIO_PLUGINS = path.resolve(args.find((a) => !a.startsWith("--")) || POR_DEFECTO);

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(nombre + (detalle ? " :: " + detalle : ""));
}

console.log(`\n═══ VALIDAR PLUGINS · ${DIRECTORIO_PLUGINS} ═══`);
if (!fs.existsSync(DIRECTORIO_PLUGINS)) {
  console.log("ABORTO: no existe el directorio de plugins.");
  process.exit(1);
}
const todas = fs.readdirSync(DIRECTORIO_PLUGINS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const carpetas = todas.filter((c) => c.startsWith("cn."));
const ajenas = todas.filter((c) => !c.startsWith("cn."));
comprobar("la tanda cn.* son 10", carpetas.length === 10, `${carpetas.length}: ` + carpetas.join(" "));
if (ajenas.length) console.log(`  nota: ${ajenas.length} extensiones ajenas a la tanda (el gate no las baila): ${ajenas.join(", ")}`);

const nombresTools = new Map<string, string>();
const slashes = new Map<string, string>();
const idsComando = new Map<string, string>();

for (const carpeta of carpetas.sort()) {
  const dir = path.join(DIRECTORIO_PLUGINS, carpeta);
  const mruta = path.join(dir, "manifest.json");
  if (!fs.existsSync(mruta)) { comprobar(`${carpeta}: manifest.json existe`, false); continue; }
  let raw: any = null;
  try { raw = JSON.parse(fs.readFileSync(mruta, "utf8")); comprobar(`${carpeta}: manifest JSON parseable`, true); }
  catch (e: any) { comprobar(`${carpeta}: manifest JSON parseable`, false, e.message); continue; }

  const v = validateManifest(raw);
  comprobar(`${carpeta}: validateManifest del IDE sin errores`, v.ok === true && v.errors.length === 0, JSON.stringify(v.errors).slice(0, 160));
  const m = raw;
  comprobar(`${carpeta}: id = nombre de carpeta`, m.id === carpeta, `${m.id} ≠ ${carpeta}`);
  comprobar(`${carpeta}: main existe en la carpeta`, fs.existsSync(path.join(dir, m.main || "—")), m.main);
  for (const p of m.permissions || []) comprobar(`${carpeta}: permiso válido ${p}`, (EXTENSION_PERMISSIONS as readonly string[]).includes(p));
  if ((m.contributes?.tools || []).length) comprobar(`${carpeta}: declara tools.register si aporta herramientas`, (m.permissions || []).includes("tools.register"));

  const cmds = new Set((m.contributes?.commands || []).map((c: any) => c.id));
  for (const t of m.contributes?.tools || []) {
    comprobar(`${carpeta}/${t.name}: nombre tipo identificador`, /^[A-Za-z0-9_]{4,40}$/.test(t.name || ""), t.name);
    comprobar(`${carpeta}/${t.name}: handler apunta a command`, /^command:/.test(t.handler || ""), t.handler);
    if (/^command:/.test(t.handler || "")) {
      const cid = t.handler.slice(8);
      comprobar(`${carpeta}/${t.name}: el comando ${cid} existe`, cmds.has(cid), cid);
    }
    const previo = nombresTools.get(t.name);
    comprobar(`${carpeta}/${t.name}: nombre de tool único en el lote`, !previo, previo || "");
    nombresTools.set(t.name, carpeta);
    comprobar(`${carpeta}/${t.name}: parámetros con objeto JSON-Schema`, !!t.parameters && t.parameters.type === "object");
  }
  for (const c of m.contributes?.commands || []) {
    if (!c.slash) continue;
    const prev = slashes.get(c.slash);
    comprobar(`${carpeta}: slash /${c.slash} sin colisión`, !prev, prev || "");
    slashes.set(c.slash, carpeta);
    const prevId = idsComando.get(c.id);
    comprobar(`${carpeta}: id de comando ${c.id} único`, !prevId, prevId || "");
    idsComando.set(c.id, carpeta);
  }
  for (const pan of m.contributes?.panels || []) {
    comprobar(`${carpeta}: panel entry ${pan.entry} existe`, fs.existsSync(path.join(dir, pan.entry || "—")), pan.entry);
    const html = fs.readFileSync(path.join(dir, pan.entry), "utf8");
    comprobar(`${carpeta}/panel: protocolo cn:1 + ready`, html.includes('{cn:1,type:"ready"}') || html.includes("type: \"ready\""));
    comprobar(`${carpeta}/panel: responde commandResult con requestId`, /commandResult/.test(html) && /requestId/.test(html));
    const declarados = [...cmds];
    for (const cid of declarados) comprobar(`${carpeta}/panel: handler ${cid} registrado`, html.includes(`"${cid}"`) || html.includes(`'${cid}'`), cid);
    comprobar(`${carpeta}/panel: usa el puente (call workspace.*)`, /call\("workspace\./.test(html));
  }
}

console.log(`\n═══ PLUGINS: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
