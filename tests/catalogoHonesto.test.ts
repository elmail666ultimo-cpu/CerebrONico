/**
 * catalogoHonesto.test.ts — CATÁLOGO HONESTO (v1.6.33)
 * ===================================================
 * El ROADMAP §3.6: «skills100.ts promete 92 capacidades sin código y
 * contextCache.ts las inyecta como activas». Esta suite es el candado:
 *
 *   1. Cada habilidad declarada ACTIVA apunta a ficheros REALES (fs.existsSync
 *      de verdad, aquí no se inyecta un `existe` complaciente).
 *   2. El SKILLS.md que viaja al modelo tiene DOS bloques con nombre verdadero,
 *      y el texto VIEJO (la promesa de 100 capacidades) ya no existe.
 *   3. Los huecos grandes del roadmap (visión/OCR, Wasm, Git nativo, YOLO…)
 *      NO pueden colarse como activos: la regresión queda clavada.
 *   4. La auditoría es una función pura: con un `existe` que dice que no a
 *      todo, TODO queda aspiracional — sin excepciones ni atajos.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  EVIDENCIAS, auditarCatalogo, resumenHonesto, skillsMdHonesto, skillsCompactoHonesto,
} from "../src/engine/catalogoHonesto";
import { SKILLS_LIST_100 } from "../src/data/skills100";
import { CATALOGO_AUDITADO, DEFAULT_SKILLS_MD, DEFAULT_SKILLS_COMPACT } from "../src/utils/contextCache";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const existeReal = (rel: string) => fs.existsSync(path.join(RAIZ, rel));

// ════════════════════════════════════════════════════════════════════════════
// 1 · LA EVIDENCIA EXISTE DE VERDAD (el candado contra la mentira)
// ════════════════════════════════════════════════════════════════════════════
console.log("\n1) Toda habilidad declarada activa tiene su código\n");

const ids = new Set(SKILLS_LIST_100.map((s) => s.id));
comprobar("el catálogo fuente tiene 100 habilidades", SKILLS_LIST_100.length === 100, String(SKILLS_LIST_100.length));
comprobar("no hay evidencia de un id inexistente", Object.keys(EVIDENCIAS).every((k) => ids.has(Number(k))));
comprobar("ninguna evidencia está vacía", Object.values(EVIDENCIAS).every((v) => Array.isArray(v) && v.length > 0));

const faltan: string[] = [];
for (const [id, rutas] of Object.entries(EVIDENCIAS)) {
  for (const r of rutas) if (!existeReal(r)) faltan.push(`${id} → ${r}`);
}
comprobar("los 31 ficheros de evidencia EXISTEN en el repo", faltan.length === 0, faltan.join(" | "));
comprobar("los ids de evidencia están únicos", new Set(Object.keys(EVIDENCIAS)).size === Object.keys(EVIDENCIAS).length);

// v1.15.1 — la fuente ya no miente: skills100.ts marca ACTIVA solo lo que tiene
// evidencia, y MAPA lo declarado sin código. Así la raíz y el prompt dicen lo mismo.
const activasFuente = SKILLS_LIST_100.filter((s) => s.status === "active").length;
const mapaFuente = SKILLS_LIST_100.filter((s) => s.status === "mapa").length;
comprobar("skills100.ts marca ACTIVA solo lo que tiene evidencia",
  activasFuente === Object.keys(EVIDENCIAS).length,
  `${activasFuente} activas en fuente vs ${Object.keys(EVIDENCIAS).length} con evidencia`);
comprobar("skills100.ts marca MAPA lo declarado sin evidencia",
  mapaFuente === SKILLS_LIST_100.length - Object.keys(EVIDENCIAS).length,
  `${mapaFuente} en mapa vs ${SKILLS_LIST_100.length - Object.keys(EVIDENCIAS).length} esperadas`);

// ════════════════════════════════════════════════════════════════════════════
// 2 · AUDITORÍA PURA
// ════════════════════════════════════════════════════════════════════════════
console.log("\n2) El auditor es una función pura\n");

const auditReal = auditarCatalogo(existeReal);
const r = resumenHonesto(auditReal);
comprobar("activas = las que tienen evidencia", r.activas === Object.keys(EVIDENCIAS).length, `${r.activas} vs ${Object.keys(EVIDENCIAS).length}`);
comprobar("la mayoría del mapa es DECLARADA, no activa (la vieja mentira era 100/100)", r.aspiracionales >= 60, String(r.aspiracionales));
comprobar("activas + aspiracionales = 100", r.activas + r.aspiracionales === 100);

const auditNada = auditarCatalogo(() => false);
comprobar("con un `existe` que dice no a todo, TODO es aspiracional", auditNada.every((a) => a.estado === "aspiracional"));
const auditTodo = auditarCatalogo(() => true);
comprobar("con el mapa curado, activas = evidencia declarada", auditTodo.filter((a) => a.estado === "activa").length === Object.keys(EVIDENCIAS).length);

// El fichero de evidencia debe contener ALGO de lo que el título promete: se
// comprueba en las seis activas más «grandes» (las de motor propio).
const motor = ["src/engine/syntaxGuard.ts", "src/engine/inferenceBuffer.ts", "src/engine/metricasInferencia.ts", "src/engine/formatConverter.ts", "src/engine/catalogoHonesto.ts"];
comprobar("las evidencias de motor existen y no están vacías", motor.every((m) => existeReal(m) && leer(m).length > 800));

// ════════════════════════════════════════════════════════════════════════════
// 3 · REGRESIÓN: los huecos del roadmap NO pueden volver a «activos»
// ════════════════════════════════════════════════════════════════════════════
console.log("\n3) Los huecos del roadmap quedan clavados como pendientes\n");

const idx8 = SKILLS_LIST_100.find((s) => s.id === 8);
comprobar("8 · Visión/OCR es aspiracional", !!idx8 && !EVIDENCIAS[8] && /visi|ocr/i.test(idx8.title));
const pendientes = [
  { id: 53, re: /wasm/i, que: "Wasm" },
  { id: 64, re: /git/i, que: "Git diffs" },
  { id: 76, re: /merge/i, que: "Merge Git" },
  { id: 81, re: /yolo/i, que: "YOLO" },
  { id: 100, re: /obsidian/i, que: "Matriz x100" },
  { id: 63, re: /protobuf/i, que: "Protobuf" },
  { id: 72, re: /jwt/i, que: "JWT RS256" },
  { id: 30, re: /prettier/i, que: "Prettier" },
];
for (const p of pendientes) {
  const s = SKILLS_LIST_100.find((x) => x.id === p.id);
  comprobar(`${p.id} · ${p.que}: en el mapa pero NO activo`, !!s && p.re.test(s.title) && !EVIDENCIAS[p.id], s?.title);
}
// Y lo que sí está, no puede caer por descuido: los cuatro del motor v1.6.32.
comprobar("36 · TPS real sigue activo (D8)", !!EVIDENCIAS[36] && existeReal(EVIDENCIAS[36][0]));
comprobar("23 · compilador esbuild sigue activo (syntaxGuard v3)", !!EVIDENCIAS[23]);

// ════════════════════════════════════════════════════════════════════════════
// 4 · EL TEXTO QUE VIAJA AL MODELO
// ════════════════════════════════════════════════════════════════════════════
console.log("\n4) SKILLS.md ya no miente al modelo\n");

comprobar("contextCache usa el catálogo auditado", DEFAULT_SKILLS_MD === skillsMdHonesto(CATALOGO_AUDITADO));
comprobar("contextCache conserva el compacto honesto", DEFAULT_SKILLS_COMPACT === skillsCompactoHonesto(CATALOGO_AUDITADO));
comprobar("el encabezado dice cuántas verificadas y cuántas declaradas", /verificadas · \d+ declaradas/.test(DEFAULT_SKILLS_MD), DEFAULT_SKILLS_MD.split("\n")[0]);
comprobar("el bloque ACTIVA trae la evidencia a la vista", /\(activa · evidencia: src\//.test(DEFAULT_SKILLS_MD));
comprobar("hay bloque MAPA explícito y no ofrecible", /MAPA \(aspiracional — NO afirmar que existe\)/.test(DEFAULT_SKILLS_MD));
comprobar("la regla de no-mentir viaja en el prompt", /Nunca inventes\s*\n?que una aspiracional funciona/.test(DEFAULT_SKILLS_MD));
comprobar("Wasm y YOLO aparecen SOLO en el bloque del mapa",
  DEFAULT_SKILLS_MD.indexOf("Wasm") > DEFAULT_SKILLS_MD.indexOf("MAPA (aspiracional") &&
  DEFAULT_SKILLS_MD.indexOf("YOLO") > DEFAULT_SKILLS_MD.indexOf("MAPA (aspiracional"));

const viejo = leer("src/utils/contextCache.ts");
comprobar("el texto VIEJO («Catálogo de 100 Habilidades» / «declara 100 capacidades») ya no existe",
  !/Catálogo de 100 Habilidades/.test(viejo) && !/declara 100 capacidades operativas/.test(viejo));
comprobar("el compacto confiesa las dos cifras", /VERIFICADAS/.test(DEFAULT_SKILLS_COMPACT) && /DECLARADAS/.test(DEFAULT_SKILLS_COMPACT));

// ════════════════════════════════════════════════════════════════════════════
// 5 · REGISTRADA EN LA PUERTA
// ════════════════════════════════════════════════════════════════════════════
console.log("\n5) La suite entra en la puerta\n");

const validar = leer("scripts/validar.mjs");
comprobar("validar.mjs registra la suite", validar.includes("catalogoHonesto.test.ts"));

console.log(`\n═══ CATÁLOGO HONESTO (v1.6.33): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
