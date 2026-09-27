#!/usr/bin/env node
/**
 * manifiesto.mjs — EL MANIFIESTO DEL PAQUETE, GENERADO (no escrito a mano)
 * ========================================================================
 * QUÉ PROBLEMA RESUELVE
 * El manifiesto de la v1.6.33 cubría 22 entradas: 17 fuentes, 3 pruebas de ~60
 * y 5 ficheros de dist. Los demás ficheros del paquete —incluidos los assets que
 * el navegador carga de verdad y el estado de conocimiento que las pruebas de
 * humo modifican— viajaban SIN poder verificarse. Un manifiesto incompleto no
 * es una verificación: es una lista de confianza parcial con apariencia de
 * puerta.
 *
 * Aquí el manifiesto se GENERA recorriendo el paquete. Si un fichero viaja,
 * está en el manifiesto. Y `--verificar` hace las dos preguntas que importan:
 *   · ¿algún fichero cambió de contenido?  (hash distinto)
 *   · ¿hay ficheros NUEVOS que el manifiesto no conoce?  (lo que se colaría)
 *
 * USO
 *   node scripts/manifiesto.mjs              → genera MANIFIESTO_SHA256_v<versión>.txt
 *   node scripts/manifiesto.mjs --verificar  → comprueba el manifiesto existente
 *
 * QUÉ SE EXCLUYE, Y POR QUÉ (queda escrito aquí para no tener que adivinarlo)
 *   node_modules/**        dependencias instaladas: se regeneran, no se entregan
 *   .proyectos/**          ESTADO DE EJECUCIÓN: kb.json y auditoria.jsonl los
 *                          modifican las pruebas de humo. Entregar su hash
 *                          obligaría a restaurarlos byte a byte antes de
 *                          empaquetar — que es justo la trampa que este script
 *                          elimina: lo que no es código no se firma.
 *   *.log                  rastros de ejecución
 *   MANIFIESTO_SHA256_*.txt   el propio manifiesto (no se firma a sí mismo)
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(AQUI, "..");
const PAQUETE = path.resolve(BACKEND, "..", "..");

const verificar = process.argv.includes("--verificar");
const VERSION = JSON.parse(readFileSync(path.join(BACKEND, "package.json"), "utf8")).version;
/** El único fichero que no puede firmarse a sí mismo. */
const MANIFIESTO_PROPIO = `MANIFIESTO_SHA256_v${VERSION}.txt`;

// .buyer-execution-hooks lo crea la plataforma donde trabajo, no tu proyecto:
// apareció dentro del paquete al empaquetar y lo cazó la comprobación de
// «ficheros en el ZIP que no están en el manifiesto». Fuera.
const EXCLUIDOS_DIR = new Set(["node_modules", ".git", ".proyectos", ".accio", ".buyer-execution-hooks", "__pycache__"]);
const excluido = (rel) => {
  const partes = rel.split(path.sep);
  if (partes.some((p) => EXCLUIDOS_DIR.has(p))) return true;
  const base = partes[partes.length - 1];
  if (base.endsWith(".log")) return true;
  // Se excluye SOLO el manifiesto de esta versión (no puede firmarse a sí
  // mismo: su hash cambia al escribirlo). Todo lo demás se firma, incluidos los
  // manifiestos históricos de la raíz y los de cada capa en mejoras/.
  // Dos versiones seguidas de esta regla fallaron hasta llegar aquí, y las dos
  // las cazó la misma comprobación: «ficheros en el ZIP que no están en el
  // manifiesto». Un generador de manifiestos también necesita su propia puerta.
  if (base === MANIFIESTO_PROPIO) return true;
  return false;
};

function recorrer(dir, salida = []) {
  for (const nombre of readdirSync(dir).sort()) {
    const abs = path.join(dir, nombre);
    const rel = path.relative(PAQUETE, abs);
    if (excluido(rel)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) recorrer(abs, salida);
    else if (st.isFile()) salida.push(rel);
  }
  return salida;
}

const sha256 = (abs) => createHash("sha256").update(readFileSync(abs)).digest("hex");

const version = VERSION;
const archivoManifiesto = path.join(PAQUETE, MANIFIESTO_PROPIO);

if (!verificar) {
  const ficheros = recorrer(PAQUETE);
  const lineas = [
    `# MANIFIESTO SHA256 — v${version} (${new Date().toISOString().slice(0, 10)})`,
    `# Verificación:  sha256sum -c MANIFIESTO_SHA256_v${version}.txt`,
    `# Cubre TODO el paquete excepto node_modules, .proyectos (estado de ejecución), *.log y este mismo fichero.`,
    "",
    ...ficheros.map((rel) => `${sha256(path.join(PAQUETE, rel))}  ${rel}`),
  ];
  writeFileSync(archivoManifiesto, lineas.join("\n") + "\n", "utf8");
  console.log(`MANIFIESTO GENERADO: ${path.basename(archivoManifiesto)}`);
  console.log(`  ${ficheros.length} ficheros firmados (antes: 22 escritos a mano).`);
  process.exit(0);
}

// ─── verificación ───────────────────────────────────────────────────────────
if (!existsSync(archivoManifiesto)) {
  console.log(`NO existe ${path.basename(archivoManifiesto)}. Genéralo primero sin --verificar.`);
  process.exit(1);
}
const declarados = new Map();
for (const l of readFileSync(archivoManifiesto, "utf8").split("\n")) {
  if (!l.trim() || l.startsWith("#")) continue;
  const m = /^([0-9a-f]{64})\s\s(.+)$/.exec(l.trim());
  if (m) declarados.set(m[2], m[1]);
}
const enDisco = new Set(recorrer(PAQUETE));
const cambios = [];
const ausentes = [];
for (const [rel, hash] of declarados) {
  const abs = path.join(PAQUETE, rel);
  if (!existsSync(abs)) {
    ausentes.push(rel);
    continue;
  }
  if (sha256(abs) !== hash) cambios.push(rel);
}
const nuevos = [...enDisco].filter((r) => !declarados.has(r));

console.log(`MANIFIESTO v${version}: ${declarados.size} ficheros declarados · ${enDisco.size} en disco`);
for (const r of cambios) console.log(`  CAMBIADO  ${r}`);
for (const r of ausentes) console.log(`  AUSENTE   ${r}`);
for (const r of nuevos) console.log(`  NUEVO     ${r} (no está en el manifiesto)`);
const bien = cambios.length === 0 && ausentes.length === 0 && nuevos.length === 0;
console.log(bien ? "  VEREDICTO: TODO COINCIDE." : `  VEREDICTO: ${cambios.length + ausentes.length + nuevos.length} diferencia(s).`);
process.exit(bien ? 0 : 1);
