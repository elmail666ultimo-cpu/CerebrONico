/**
 * metricasInferencia.test.ts — D8 (v1.6.32)
 * ==========================================
 * Prueba el motor de métrica REAL de inferencia y su implantación:
 *   1. El payload `done` de Ollama (nanosegundos, formas reales) se convierte
 *      en tokens y ms creíbles.
 *   2. La basura no produce números: sin eval_count → null; valores absurdos
 *      se descartan. Un `null` honesto vale más que un 0 inventado.
 *   3. `tokensSalidaParaTurno` cierra el len/4 CUANDO hay medida y lo mantiene
 *      (etiquetado como estimado) cuando no.
 *   4. Está cableado: server.ts extrae la métrica del stream, se la manda al
 *      cliente en `done`, y el cliente consume la medida en vez de contar
 *      líneas como si fueran tokens.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  extraerMetricasOllama,
  tokensSalidaParaTurno,
  lineaMetricasCorta,
} from "../src/engine/metricasInferencia";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ════════════════════════════════════════════════════════════════════════════
// 1 · LA FORMA REAL DE OLLAMA (nanosegundos)
// ════════════════════════════════════════════════════════════════════════════
console.log("\n1) El done real de Ollama se lee de verdad\n");

const done: Record<string, unknown> = {
  model: "llama3.2:3b",
  created_at: "2026-09-24T02:10:00.000000Z",
  done: true,
  done_reason: "stop",
  eval_count: 142,
  eval_duration: 4_531_000_000,
  prompt_eval_count: 1830,
  prompt_eval_duration: 912_000_000,
  load_duration: 820_000_000,
  total_duration: 6_270_000_000,
};
const m = extraerMetricasOllama(done)!;
comprobar("hay métrica", !!m);
comprobar("tokens de salida = eval_count (no cuenta de líneas)", m.tokensSalida === 142);
comprobar("tokens de entrada = prompt_eval_count", m.tokensEntrada === 1830);
comprobar("ns → ms en la generación", m.msGeneracion === 4531);
comprobar("ns → ms en el prompt", m.msPrompt === 912);
comprobar("tk/s derivados: 142/4.531 s ≈ 31.3", m.tokPorSegundo === 31.3, String(m.tokPorSegundo));
comprobar("marcada como medida", m.medida === true);

// ════════════════════════════════════════════════════════════════════════════
// 2 · LO QUE NO HAY NO SE INVENTA
// ════════════════════════════════════════════════════════════════════════════
console.log("\n2) Sin datos no hay números\n");

comprobar("null sin payload", extraerMetricasOllama(null) === null);
comprobar("done sin eval_count → null (OpenAI, Gemini)", extraerMetricasOllama({ done: true, usage: {} }) === null);
comprobar("eval_count negativo se descarta", extraerMetricasOllama({ eval_count: -5 }) === null);
comprobar("eval_count absurdo (1e12) se descarta", extraerMetricasOllama({ eval_count: 1e12 }) === null);
comprobar("eval_count no-numérico se descarta", extraerMetricasOllama({ eval_count: "142" }) === null);
const solo = extraerMetricasOllama({ eval_count: 7 })!;
comprobar("con solo eval_count hay métrica mínima", !!solo && solo.tokensSalida === 7 && solo.tokPorSegundo === undefined);
comprobar("duración negativa no entra", extraerMetricasOllama({ eval_count: 3, eval_duration: -1 })!.msGeneracion === undefined);
// valor creíble YA en ms (1e6 ms = 16 min, imposible como ns → se respeta el criterio de la casa: >1e7 es ns)
const enMs = extraerMetricasOllama({ eval_count: 10, eval_duration: 500 })!;
comprobar("500 ns (<1e7) se respeta como está, como en inferenceBuffer", enMs.msGeneracion === 500 / 1e6 || enMs.msGeneracion === 500);

// ════════════════════════════════════════════════════════════════════════════
// 3 · EL len/4 SE CIERRA SOLO SI HAY MEDIDA
// ════════════════════════════════════════════════════════════════════════════
console.log("\n3) tokensSalidaParaTurno: medida > estimación\n");

const conMedida = tokensSalidaParaTurno(m, "x".repeat(4000));
comprobar("con métrica manda eval_count", conMedida.tokensOut === 142 && conMedida.exacto === true);
const estimado = tokensSalidaParaTurno(null, "x".repeat(400));
comprobar("sin métrica queda len/4 PERO etiquetado", estimado.tokensOut === 100 && estimado.exacto === false);
comprobar("texto vacío no produce negativo", tokensSalidaParaTurno(null, "").tokensOut === 0);

// ════════════════════════════════════════════════════════════════════════════
// 4 · LA LÍNEA LEGIBLE
// ════════════════════════════════════════════════════════════════════════════
console.log("\n4) La línea del chat/log\n");

const linea = lineaMetricasCorta(m);
comprobar("menciona salida y velocidad", /salida 142 tk/.test(linea) && /31\.3 tk\/s/.test(linea), linea);
comprobar("sin métrica, silencio (no ceros)", lineaMetricasCorta(null) === "");

// ════════════════════════════════════════════════════════════════════════════
// 5 · IMPLANTADO EN EL MOTOR (cableado real, no solo el módulo)
// ════════════════════════════════════════════════════════════════════════════
console.log("\n5) D8 está cableado: server → cliente → registro\n");

const srv = leer("server.ts");
// v1.14.0 · `sendDone` ya no vive en server.ts: salió al módulo de streaming
// (Fase 2). Se comprueba allí que el done siga viajando con la métrica.
const streamCtx = leer("server/streamContext.ts");
const cli = leer("src/utils/engine.ts");
const app = leer("src/App.tsx");
const si = leer("src/utils/selfImprovement.ts");
const validar = leer("scripts/validar.mjs");

comprobar("server.ts importa el motor de métricas", /from "\.\/src\/engine\/metricasInferencia"/.test(srv));
comprobar("server.ts extrae la métrica del done de Ollama", srv.includes("extraerMetricasOllama(estado.data)") && srv.includes("extraerMetricasOllama(cola.data)"));
comprobar("sendDone viaja con las métricas", /sendDone\(modelUsed: string, metricas\?/.test(streamCtx));
comprobar("el cliente directo captura el done y su métrica", /extraerMetricasOllama\(parsed\)/.test(cli));
comprobar("el cliente proxy lee la métrica del servidor", cli.includes("data.metricas"));
comprobar("el tk/s del turno usa la medida cuando existe", /m\.tokPorSegundo/.test(si));
comprobar("App.tsx registra tokens reales vía consumirUltimaMedicion()", app.includes("consumirUltimaMedicion"));
comprobar("la suite entra en npm run validar", validar.includes("metricasInferencia.test.ts"));

console.log(`\n═══ D8 MÉTRICAS REALES (v1.6.32): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
