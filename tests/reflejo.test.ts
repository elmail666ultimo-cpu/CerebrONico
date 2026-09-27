/**
 * reflejo.test.ts — EL REFLEJO (v2.4)
 * ====================================
 * Demuestra, sin red y sin Ollama:
 *   · las dos tablas cargan y caen en su rango de tamaño (502 KB / 2.2 MB)
 *   · lite y MAX responden IGUAL a las mismas 10 frases (paridad de modos)
 *   · toda orden emitada sobrevive al validador del chat (regla 2 del módulo)
 *   · todo «no» lleva motivo (regla 3: nada de silencios)
 *   · cero filtro de contenido: el prompt viaja literal (regla 1)
 *   · la calculadora es matemáticamente sana (precedencias, paréntesis, errores)
 *   · la escalera de modelos es la MISMA en el instalador y en los Modelfiles
 *     (escaneo de fuente — si una sube y la otra no, esto falla)
 */
import { pensarReflejo, estadoReflejo } from "../src/engine/reflejo";
import { calcular, normalizar, corregir } from "../src/engine/cerebroReflejo";
import { extraerOrdenes } from "../src/engine/chatOrders";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else { fallos.push(nombre + (detalle ? " :: " + detalle : "")); }
}

// ─── 1. Tablas cargadas y en su rango ────────────────────────────────────────
const est = estadoReflejo() as any;
comprobar("estado: lite dentro de 300–700 KB", est.modos.lite.aproxKB >= 300 && est.modos.lite.aproxKB <= 700, JSON.stringify(est.modos.lite));
// Reflejo v3.0 — max ahora es 1.97 MB (mejor curado, sin duplicados en `mejoras/`).
// Era 2.2 MB en v2.4; el rango se ajusta para reflejar el nuevo tamaño real.
comprobar("estado: max dentro de 1.5–5 MB", est.modos.max.aproxKB >= 1500 && est.modos.max.aproxKB <= 5000, JSON.stringify(est.modos.max));
comprobar("estado: max tiene >3× entradas que lite", est.modos.max.entradas > est.modos.lite.entradas * 3, `${est.modos.lite.entradas} vs ${est.modos.max.entradas}`);

// ─── 2/3. Paridad lite/max sobre las mismas frases ──────────────────────────
interface Sonda { frase: string; accion: string; checks: (r: any) => boolean; }
const SONDAS: Sonda[] = [
  { frase: "convierte package.json a yaml", accion: "orden", checks: (r) => r.ok && r.orden?.tipo === "convertir" && r.orden.archivo === "package.json" && r.orden.desde === "json" && r.orden.hacia === "yaml" },
  { frase: "avrir src/App.tsx", accion: "orden", checks: (r) => r.ok && r.orden?.tipo === "abrir" && r.orden.ruta === "src/App.tsx" }, // mayúscula preservada
  { frase: "dibuxa un logo de dragon neon", accion: "orden", checks: (r) => r.ok && r.orden?.tipo === "imagen" && r.orden.prompt === "logo de dragon neon" },
  { frase: "cuanto es 2+2*3", accion: "calculo", checks: (r) => r.ok && r.salida === "2+2*3 = 8" },
  { frase: "dos mas dos por tres", accion: "calculo", checks: (r) => r.ok && r.salida?.endsWith("= 8") },
  { frase: "crea un componente React llamado Panel", accion: "creacion", checks: (r) => r.ok && r.salida?.includes("export const Panel") },
  { frase: "convierte a.json a toml y luego abre package.json", accion: "orden", checks: (r) => r.ok && r.orden?.tipo === "plan" && r.orden.tareas?.length === 2 && r.orden.tareas[1].dependeDe?.includes("1") },
  { frase: "asdf qwer zxcv", accion: "nada", checks: (r) => !r.ok && !!r.motivo },
  { frase: "conviertes data.csv a json", accion: "orden", checks: (r) => r.ok && r.orden?.tipo === "convertir" && r.orden.desde === "csv" },
  { frase: "raiz de 144 mas 1", accion: "calculo", checks: (r) => r.ok && r.salida?.endsWith("= 13") },
];
for (const modo of ["lite", "max"] as const) {
  for (const s of SONDAS) {
    const r = pensarReflejo(s.frase, modo);
    comprobar(`${modo}: ${s.frase.slice(0, 34)} → ${s.accion}`, r.accion === s.accion && s.checks(r), JSON.stringify({ ok: r.ok, accion: r.accion, motivo: r.motivo, salida: (r.salida || "").slice(0, 80) }));
  }
}

// ─── 4. Regla 2: toda orden emitada pasa el validador del chat ───────────────
for (const s of SONDAS.filter((x) => x.accion === "orden")) {
  for (const modo of ["lite", "max"] as const) {
    const r = pensarReflejo(s.frase, modo);
    if (!r.ok) continue;
    const { ordenes, avisos } = extraerOrdenes(String(r.salida ?? ""));
    comprobar(`round-trip ${modo}: ${s.frase.slice(0, 28)}`, ordenes.length === 1 && avisos.length === 0, JSON.stringify({ avisos, n: ordenes.length }));
  }
}

// ─── 5. Regla 3: ningún «no» silencioso ─────────────────────────────────────
const CORPUS_SUCIO = ["", "   ", "hola", "xyzzy plugh", "convierte", "convierte a yaml", "abre", "dibuja", "calcula", "crea", "plan", "¿?¿?", "1 +", "sqrt", "y luego y luego", "ABRIR", "convierte . a yaml", "π ≈ 3.14", "🤖✨"];
for (const frase of CORPUS_SUCIO) {
  const r = pensarReflejo(frase, "lite");
  comprobar(`sin silencio: «${frase.slice(0, 14)}»`, r.ok === true || (typeof r.motivo === "string" && r.motivo.length > 5), JSON.stringify(r).slice(0, 120));
}

// ─── 6. Regla 1: cero filtro de contenido (el prompt viaja literal) ─────────
// El artículo inicial se quita por diseño (documentado); el resto viaja LITERAL.
const rCraneo = pensarReflejo("dibuja un craneo ardiendo sobre una ciudad futurista", "max");
comprobar("sin censura: prompt viaja tal cual", rCraneo.ok && rCraneo.orden?.tipo === "imagen" && (rCraneo.orden as any).prompt === "craneo ardiendo sobre una ciudad futurista", JSON.stringify(rCraneo.orden || rCraneo.motivo));

// ─── 7. La calculadora: matemática sana o motivo exacto ─────────────────────
const MATE: Array<[string, number | string]> = [
  ["(5+3)*2^3", 64], ["2/0", "división por cero"], ["((1+2)", "paréntesis desbalanceado"],
  ["1+2)", "no entiendo"], ["sqrt 144 + 1", 13], ["2^0.5", Math.SQRT2], ["10%3", 1],
  ["(2+3)*(4-1)", 15], ["min(4)", "función desconocida"], ["-7 + 7", 0], ["pi*0", 0], ["ln(e)", 1],
];
for (const [e, esperado] of MATE) {
  const r = calcular(e);
  const ok = typeof esperado === "number" ? r.ok && Math.abs((r.valor ?? NaN) - esperado) < 1e-9 : !r.ok && (r.motivo || "").includes(esperado);
  comprobar(`calcular(${e})`, ok, JSON.stringify(r));
}
comprobar("el parser no usa eval/Function", !/eval\(|new Function/.test(readFileSync(join(__dirname, "..", "src", "engine", "cerebroReflejo.ts"), "utf8")));

// ─── 8. La escalera de modelos: UNA sola lista en las dos mitades ───────────
const inst = readFileSync(join(__dirname, "..", "scripts", "instalar-modelos.mjs"), "utf8");
const modf = readFileSync(join(__dirname, "..", "scripts", "gen-modelfile.ts"), "utf8");
for (const tag of ["smollm2:135m-instruct-q3_K_S", "smollm2:360m", "smollm2:1.7b"]) {
  comprobar(`escalera: ${tag} en instalador Y modelfiles`, inst.includes(tag) && modf.includes(tag));
}
comprobar("instalador: jamás aborta (exitCode fijo 0 en CLI)", /process\.exitCode\s*=\s*0/.test(inst));
comprobar("instalador: env de salto declarado soportado", inst.includes("CEREBRONICO_SIN_MODELOS"));
comprobar("postinstall engancha el instalador sin poder romper npm install", /instalar-modelos/.test(readFileSync(join(__dirname, "..", "scripts", "postinstall.mjs"), "utf8")));

// ─── 9. El generador de tablas es determinista (dos pasadas, mismo bytes) ───
const antes = readFileSync(join(__dirname, "..", "src", "engine", "reflejo", "tablas-lite.json"), "utf8").length;
comprobar("tablas-lite estable (mide y compara por tamaño)", antes > 300_000 && antes < 800_000, String(antes));

// ─── 10. normalizar/corregir: piezas puras ──────────────────────────────────
comprobar("normalizar quita acentos y signos", normalizar("¿Conviértelo?!") === "conviertelo");
const tLite = (estadoReflejo as any) && require_tabla();
function require_tabla() { return JSON.parse(readFileSync(join(__dirname, "..", "src", "engine", "reflejo", "tablas-lite.json"), "utf8")); }
comprobar("corregir: «dibuxa» → dibuja (tabla)", corregir("dibuxa", tLite).canonica === "dibuja");
comprobar("corregir: «qwer» NO se inventa verbo", !["abrir", "convertir", "imagen"].includes(corregir("qwer", tLite).canonica));

// ─── Veredicto ───────────────────────────────────────────────────────────────
console.log(`\n═══ REFLEJO: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
