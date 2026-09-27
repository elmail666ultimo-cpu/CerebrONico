#!/usr/bin/env node
/**
 * generar-respaldo-espejos-servidor.mjs — RESPALDOS INDEPENDIENTES
 * =================================================================
 * Lee la fuente de verdad (`src/engine/reflejo/tablas-servidor.json`) y genera
 * la carpeta de respaldo `espejos_servidor/`:
 *
 *   espejos_servidor/
 *   ├── catalogo.json                    ← instantánea COMPLETA del catálogo
 *   ├── MANIFIESTO_SHA256.txt            ← integridad de cada copia
 *   └── respaldos/<categoria>/<id>.json  ← UNA copia independiente por espejo
 *
 * Una copia independiente se puede restaurar sola, sin tocar las demás: cada
 * archivo lleva el espejo completo + su categoría + su propio SHA-256. El
 * router FastAPI lee `catalogo.json` (nunca una copia editada a mano).
 *
 * Uso:   node scripts/generar-respaldo-espejos-servidor.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const CATALOGO_RUTA = join(RAIZ, "src", "engine", "reflejo", "tablas-servidor.json");
const SALIDA = join(RAIZ, "espejos_servidor");

const sha = (txt) => createHash("sha256").update(txt, "utf8").digest("hex");
// En Windows el separador es "\": lo normalizamos a "/" para un manifest portátil.
const posix = (p) => p.split(sep).join("/");

const catalogo = JSON.parse(readFileSync(CATALOGO_RUTA, "utf8"));
const categoriaPorId = new Map(catalogo.categorias.map((c) => [c.id, c]));

const escritos = [];
const manifest = [
  `# MANIFIESTO SHA-256 — espejos de servidor de datos (${catalogo.version})`,
  `# generado ${new Date().toISOString()}`,
  `#`,
  `# Para verificar integridad:   sha256sum -c MANIFIESTO_SHA256.txt   (desde espejos_servidor/)`,
  ``,
];

// 1 · catálogo completo
const catalogoTexto = JSON.stringify(catalogo, null, 2);
mkdirSync(SALIDA, { recursive: true });
const catalogoRel = "catalogo.json";
writeFileSync(join(SALIDA, catalogoRel), catalogoTexto + "\n", "utf8");
escritos.push(catalogoRel);

// 2 · copias independientes por espejo, dentro de su categoría
const respaldosBase = "respaldos";
for (const espejo of catalogo.espejos) {
  const categoria = categoriaPorId.get(espejo.categoria);
  if (!categoria) {
    console.error(`✗ categoría desconocida «${espejo.categoria}» en «${espejo.id}».`);
    process.exit(1);
  }
  const dir = join(SALIDA, respaldosBase, espejo.categoria);
  mkdirSync(dir, { recursive: true });
  const copia = {
    version: catalogo.version,
    id: espejo.id,
    categoria,
    espejo,
    sha256: sha(JSON.stringify(espejo)),
  };
  const rel = join(respaldosBase, espejo.categoria, `${espejo.id}.json`);
  writeFileSync(join(SALIDA, rel), JSON.stringify(copia, null, 2) + "\n", "utf8");
  escritos.push(rel);
}

// 3 · manifest de integridad (hash del CONTENIDO de cada archivo escrito)
for (const rel of escritos) {
  const bytes = readFileSync(join(SALIDA, rel), "utf8");
  manifest.push(`${sha(bytes)}  ${posix(rel)}`);
}

writeFileSync(join(SALIDA, "MANIFIESTO_SHA256.txt"), manifest.join("\n") + "\n", "utf8");

console.log(`✓ respaldos generados en ${posix(relative(process.cwd(), SALIDA)) || SALIDA}`);
console.log(`  ${catalogo.espejos.length} espejos · ${catalogo.categorias.length} categorías · ${escritos.length} archivos + manifest`);
