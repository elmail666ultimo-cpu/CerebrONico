/**
 * CerebroNico V0.9 — Modo Lectura de Documentación (RAG Local)
 * ============================================================
 * Permite al usuario arrastrar PDFs, TXTs o documentos de referencia al
 * workspace. El motor los indexa localmente (en memoria) para que el modelo
 * activo responda preguntas basándose estrictamente en esos documentos.
 *
 * Indexación: trocea cada documento en chunks de ~1500 caracteres, calcula
 * un hash simple para deduplicar, y los guarda en memoria. El contexto del
 * chat inyecta los chunks más relevantes según las palabras clave del prompt.
 */
export interface DocChunk {
  id: string;
  sourceFile: string;
  chunkIndex: number;
  content: string;
  wordCount: number;
  keywords: string[];
}

const chunks: DocChunk[] = [];
const MAX_CHUNKS = 500; // límite para no saturar memoria

/** Trocea un texto en chunks de ~1500 caracteres (cortando en límites de frase). */
export function chunkText(text: string, sourceFile: string): DocChunk[] {
  const CHUNK_SIZE = 1500;
  const result: DocChunk[] = [];
  // Normalizar whitespace
  const clean = text.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
  if (!clean) return [];

  let i = 0;
  let chunkIdx = 0;
  while (i < clean.length) {
    let end = Math.min(i + CHUNK_SIZE, clean.length);
    // Buscar el último punto/salto de línea dentro del chunk para cortar limpio
    if (end < clean.length) {
      const lastStop = Math.max(
        clean.lastIndexOf(". ", end),
        clean.lastIndexOf("\n", end),
        clean.lastIndexOf("! ", end),
        clean.lastIndexOf("? ", end)
      );
      if (lastStop > i + 500) end = lastStop + 1;
    }
    const content = clean.slice(i, end).trim();
    if (content.length > 50) {
      // Extraer keywords simples (palabras de 5+ caracteres, sin stopwords)
      const keywords = extractKeywords(content);
      result.push({
        id: `chunk-${sourceFile}-${chunkIdx}-${Math.random().toString(36).slice(2, 6)}`,
        sourceFile,
        chunkIndex: chunkIdx,
        content,
        wordCount: content.split(/\s+/).length,
        keywords,
      });
      chunkIdx++;
    }
    i = end;
  }
  return result;
}

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "her",
  "was", "one", "our", "out", "day", "get", "has", "him", "his", "how", "its",
  "may", "new", "now", "old", "see", "two", "way", "who", "boy", "did", "man",
  "que", "con", "por", "para", "una", "los", "del", "las", "como", "pero",
  "sus", "este", "eso", "esta", "son", "han", "fue", "ser", "tiene", "puede",
  "this", "that", "with", "from", "have", "they", "will", "your", "their",
]);

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/[a-záéíóúñ]{4,}/g) || [];
  const freq = new Map<string, number>();
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  // Top 10 palabras más frecuentes como keywords
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
}

/** Indexa un documento (ya extraído como texto plano) troceándolo en chunks. */
export function indexDocument(fileName: string, text: string): DocChunk[] {
  // Eliminar chunks previos del mismo archivo (reindexar)
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (chunks[i].sourceFile === fileName) chunks.splice(i, 1);
  }
  const newChunks = chunkText(text, fileName);
  chunks.push(...newChunks);
  // Limitar a MAX_CHUNKS — descartar los más antiguos
  if (chunks.length > MAX_CHUNKS) {
    chunks.splice(0, chunks.length - MAX_CHUNKS);
  }
  return newChunks;
}

/** Elimina todos los chunks indexados de un archivo. */
export function removeDocument(fileName: string): number {
  const before = chunks.length;
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (chunks[i].sourceFile === fileName) chunks.splice(i, 1);
  }
  return before - chunks.length;
}

/** Limpia todos los chunks indexados. */
export function clearIndex(): void {
  chunks.length = 0;
}

/** Lista los documentos indexados (agrupados por sourceFile). */
export function listIndexedDocuments(): { file: string; chunks: number; words: number }[] {
  const map = new Map<string, { chunks: number; words: number }>();
  for (const c of chunks) {
    const entry = map.get(c.sourceFile) || { chunks: 0, words: 0 };
    entry.chunks++;
    entry.words += c.wordCount;
    map.set(c.sourceFile, entry);
  }
  return Array.from(map.entries()).map(([file, info]) => ({ file, ...info }));
}

/**
 * Busca los chunks más relevantes para un prompt dado.
 * Usa un scoring simple basado en coincidencia de keywords (no embeddings).
 * Devuelve los top N chunks concatenados como contexto.
 */
export function searchRelevantChunks(prompt: string, maxChunks = 4): string {
  if (chunks.length === 0) return "";
  const promptWords = (prompt.toLowerCase().match(/[a-záéíóúñ]{4,}/g) || []).filter(
    (w) => !STOPWORDS.has(w)
  );
  if (promptWords.length === 0) return "";

  // Scorear cada chunk por coincidencia de keywords
  const scored = chunks.map((c) => {
    let score = 0;
    const kwSet = new Set(c.keywords);
    for (const pw of promptWords) {
      if (kwSet.has(pw)) score += 2;
      // Coincidencia parcial (substring)
      if (c.content.toLowerCase().includes(pw)) score += 1;
    }
    return { chunk: c, score };
  });
  const top = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks);
  if (top.length === 0) return "";

  const sections = top.map((s) =>
    `--- Fragmento de "${s.chunk.sourceFile}" (chunk ${s.chunk.chunkIndex + 1}, ${s.chunk.wordCount} palabras) ---\n${s.chunk.content}`
  );
  return `\n\n[DOCUMENTACIÓN INDEXADA LOCALMENTE — RAG]\n${sections.join("\n\n")}\n\n[FIN DE DOCUMENTACIÓN]\nResponde basándote ESTRICTAMENTE en esta documentación. Si la respuesta no está en los fragmentos, di "No encontré esa información en los documentos indexados" y sugiere qué documento añadir.`;
}
