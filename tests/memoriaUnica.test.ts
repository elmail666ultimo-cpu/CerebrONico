/**
 * memoriaUnica.test.ts — LA MEMORIA VIAJA UNA SOLA VEZ (v1.6.22)
 * ==============================================================
 * Regresión del defecto que originó todo: con modelos locales el motor recitaba
 * el prompt/memoria en vez de contestar. Una de las causas medidas fue que
 * MEMORIA.md viajaba DOS VECES por petición:
 *
 *   1. dentro de `systemInstruction` como `[REGLAS DEL USUARIO]` (vía `userRules`
 *      → `buildSuperPrompt`), con presupuesto por tramo; y
 *   2. entera (hasta 4.000 caracteres) dentro de `hiddenFiles`.
 *
 * Dos copias del mismo texto en cada turno: doble gasto de contexto y doble
 * invitación a recitar. El arreglo deja `hiddenFiles` con SOLO `skills.md`.
 *
 * Por qué esta suite es de COMPORTAMIENTO y no una búsqueda de cadena en el
 * fuente: llama a `buildContextCachePayload()` con una memoria MARCADA y cuenta
 * apariciones. Así la prueba vigila el resultado, no el texto del arreglo; el
 * comentario que explica el fix no puede hacerla fallar.
 *
 * La sección 3 (guardas de fuente) SÍ mira el código, pero ignora comentarios,
 * para que explicar el defecto no vuelva a disparar el mismo error que se
 * corrigió.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { buildContextCachePayload } from "../src/utils/contextCache";
import type { ChatMessage, WorkspaceFile } from "../src/types";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => {
  if (c) correctas++;
  else fallos.push(n + (d ? " :: " + d : ""));
};

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Cuenta apariciones de `aguja` en `texto` (sin solapamientos). */
const contar = (texto: string, aguja: string): number => {
  if (!aguja) return 0;
  let n = 0;
  let i = 0;
  while ((i = texto.indexOf(aguja, i)) !== -1) {
    n++;
    i += aguja.length;
  }
  return n;
};

/** Quita comentarios de bloque y de línea (sin tocar «http://»), para que las
 *  guardas de fuente miren el CÓDIGO y no las explicaciones. */
const sinComentarios = (codigo: string): string => {
  let s = codigo.replace(/\/\*[\s\S]*?\*\//g, "");
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  return s;
};

// ════════════════════════════════════════════════════════════════════════════
// 1 · El contador se valida a sí mismo antes de fiarse de él
// ════════════════════════════════════════════════════════════════════════════
console.log("\n1) El contador cuenta de verdad\n");

comprobar("cuenta tres 'a' en 'aaa'", contar("aaa", "a") === 3, String(contar("aaa", "a")));
comprobar("da cero cuando no está", contar("abc", "z") === 0, String(contar("abc", "z")));
comprobar("cuenta una aparición exacta", contar("abc", "b") === 1, String(contar("abc", "b")));
comprobar("no cuenta el vacío", contar("abc", "") === 0, String(contar("abc", "")));

// ════════════════════════════════════════════════════════════════════════════
// 2 · Comportamiento: la memoria marcada aparece UNA sola vez
// ════════════════════════════════════════════════════════════════════════════
console.log("\n2) La memoria viaja una sola vez\n");

const MARCA = "___MEMORIA_UNICA_7F3A___";
const memoriaMarcada = `# MEMORIA.md — CerebroNico\n- ${MARCA}\n`;
const files: WorkspaceFile[] = [
  { id: "m", name: "MEMORIA.md", path: "MEMORIA.md", content: memoriaMarcada, language: "md", size: memoriaMarcada.length },
];
const msgs: ChatMessage[] = [{ id: "1", role: "user", content: "hola", timestamp: 0 }];

const payload = buildContextCachePayload(msgs, files, null, "hola", "es", "general", { modelName: "qwen2.5:0.5b" });

comprobar("la marca de la memoria llega al prompt", contar(payload.systemInstruction, MARCA) >= 1);
comprobar("la memoria NO viaja dos veces", contar(payload.systemInstruction, MARCA) === 1, `apariciones: ${contar(payload.systemInstruction, MARCA)}`);
comprobar("la memoria llega como [REGLAS DEL USUARIO]", /REGLAS DEL USUARIO/.test(payload.systemInstruction));
comprobar("hiddenFiles ya no lleva MEMORIA.md", !payload.hiddenSystemFiles.some((h) => h.name === "MEMORIA.md"));
comprobar("hiddenFiles sigue llevando skills.md", payload.hiddenSystemFiles.some((h) => h.name === "skills.md"));
comprobar("hiddenFiles lleva EXACTAMENTE un archivo (skills.md)", payload.hiddenSystemFiles.length === 1, `${payload.hiddenSystemFiles.map((h) => h.name).join(",")}`);
comprobar("MEMORIA.md no se cuela como archivo abierto", !payload.openFiles.some((f) => f.name === "MEMORIA.md"));
comprobar("el historial sigue viajando", payload.history.length === 1, `${payload.history.length}`);
comprobar("la telemetría del prompt sigue sana", payload.promptInfo.estTokens > 0, `${payload.promptInfo.estTokens}`);

// ════════════════════════════════════════════════════════════════════════════
// 3 · Guardas de fuente que IGNORAN comentarios
// ════════════════════════════════════════════════════════════════════════════
console.log("\n3) El código ya no etiqueta la memoria como «OCULTO»\n");

const server = sinComentarios(leer("server.ts"));
const engine = sinComentarios(leer("src/utils/engine.ts"));
const contextCache = sinComentarios(leer("src/utils/contextCache.ts"));

comprobar("server.ts ya no etiqueta «ARCHIVO DE SISTEMA OCULTO» en el código", !server.includes("ARCHIVO DE SISTEMA OCULTO"));
comprobar("server.ts usa el rótulo [CONTEXTO DE TRABAJO]", server.includes("[CONTEXTO DE TRABAJO:"));
comprobar("server.ts añade la orden de no transcribir", server.includes("NO lo transcribas"));
comprobar("engine.ts ya no etiqueta «ARCHIVO DE SISTEMA OCULTO» en el código", !engine.includes("ARCHIVO DE SISTEMA OCULTO"));
comprobar("engine.ts usa el rótulo [CONTEXTO DE TRABAJO]", engine.includes("[CONTEXTO DE TRABAJO:"));
comprobar("contextCache.ts quitó la línea de MEMORIA en hiddenFiles", !contextCache.includes('{ name: "MEMORIA.md", content: memoriaContent }'));
comprobar("contextCache.ts conserva skills.md en hiddenFiles", contextCache.includes('{ name: "skills.md", content: skillsContent }'));

console.log(`\n═══ MEMORIA ÚNICA (v1.6.22): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
