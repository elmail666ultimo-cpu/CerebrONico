/**
 * ollamaPugil.test.ts — PUGIL v1: el detector de sparring vs medición
 */
import { esModeloEmbeds, puedeChatear, motivoEmbeds, etiquetaModelo } from "../src/engine/ollamaPugil";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

// los cuatro que el usuario reportó muertos: vivos, pero para otra cosa
for (const nombre of ["snowflake-arctic-embed:33m", "snowflake-arctic-embed:22m", "all-minilm:33m", "all-minilm:22m"])
  comprobar(`${nombre} es embedder`, esModeloEmbeds(nombre) === true);

// los que SÍ sparream (nombres reales del ecosistema, ninguno debe ser marcado)
for (const nombre of ["qwen3:0.6b", "llama3.2:3b", "gemma3:1b", "deepseek-r1:1.5b", "phi4-mini:latest", "stablelm2:latest", "mistral-nemo", "glm-4.5-flash"])
  comprobar(`${nombre} NO es embedder`, esModeloEmbeds(nombre) === false, etiquetaModelo(nombre));

// capa 1: /api/show manda sobre la heurística
comprobar("show con capabilities embedding → embedder", esModeloEmbeds("modelo-raro", { capabilities: ["embedding"] }) === true);
comprobar("show con arquitectura bert → embedder", esModeloEmbeds("modelo-raro", { model_info: { "x.arch": { "general.model_architecture": "bert" } } }) === true);
comprobar("show con capabilities completion → chat", esModeloEmbeds("nada-embed-en-nombre", { capabilities: ["completion", "tools"] }) === false);
comprobar("show gana aunque el nombre parezca embed suelto", esModeloEmbeds("el-embed-dorado", { capabilities: ["completion"] }) === false);

// bordes: basura no revienta
comprobar("vacío no es embedder", esModeloEmbeds("") === false);
comprobar("no-string no es embedder", esModeloEmbeds(null as any) === false);
comprobar("puedeChatear es el espejo", puedeChatear("all-minilm:22m") === false && puedeChatear("qwen3:0.6b") === true);

// el motivo: dice qué es, por qué el 400, y qué usar en su lugar
const m = motivoEmbeds("all-minilm:22m");
comprobar("motivo nombra el modelo", m.includes("all-minilm:22m"));
comprobar("motivo explica EMBEDDINGS + 400 + RAG", /EMBEDDINGS/.test(m) && /400/.test(m) && /RAG/.test(m));
comprobar("motivo sugiere alternativa de chat", /qwen3/.test(m));
comprobar("etiqueta corta", etiquetaModelo("all-minilm:22m") === "embeddings" && etiquetaModelo("qwen3:0.6b") === "chat");

console.log(`\n═══ PUGIL: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
