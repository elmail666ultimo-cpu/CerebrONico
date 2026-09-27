/**
 * localRAG.ts — VECTORIZACIÓN LOCAL DE LA MEMORIA (v2.1)
 * =====================================================
 * Construida y APAGADA por defecto. Reglas que cumple:
 *
 *   1. COSTE CERO EN REPOSO. Apagada no se llama a ningún modelo, no se lee el
 *      índice y no se calcula nada: solo se lee un JSON de 2 campos.
 *   2. SIN DEPENDENCIAS NUEVAS. Embeddings vía Ollama (`/api/embed`).
 *   3. FALLBACK DETERMINISTA. Sin modelo disponible: vector por hashing de
 *      tokens (256 dimensiones). Se etiqueta como tal: calidad modesta, sin red.
 *   4. ÍNDICE COMPACTO EN `Float32Array` (novedad v2.1). Antes cada dimensión era
 *      un `number` de JavaScript = double de 8 bytes. Ahora son 4 bytes:
 *
 *          10.000 fragmentos × 1.024 dimensiones
 *            number[]      →  ~200-300 MB en RAM
 *            Float32Array  →  ~40 MB en RAM           (-80 %)
 *
 *      En disco se guarda en base64 del búfer (little-endian, portable), que
 *      además ocupa menos que un JSON con 1.024 números por fragmento.
 *      **Este cambio es el que habilita la V2.1**: sin él, el presupuesto de
 *      12 GB con verificador independiente no cierra (se pasa ~0,7 GB).
 *   5. COMPATIBILIDAD HACIA ATRÁS. Si el índice guardado está en el formato
 *      antiguo (array de números), se carga y se convierte. Nadie pierde nada.
 *   6. ACTIVABLE CON UN BOTÓN. `setEnabled(true)` + `reindex()`.
 */

import * as fs from "fs";
import * as path from "path";

export interface RagChunk {
  id: string;
  source: string;
  text: string;
  vec: Float32Array;
}

export interface RagStatus {
  enabled: boolean;
  model: string;
  modelUsed: string;
  chunks: number;
  dim: number;
  /** RAM estimada del índice en MB (con Float32Array: 4 bytes por dimensión). */
  ramMB: number;
  /** Ahorro frente al formato antiguo (array de doubles). */
  ahorroPct: number;
  formato: "float32" | "vacio";
  indexedAt: number;
  memoriaLines: number;
  threshold: number;
  recommendation: string;
}

/** Umbral de referencia del diseño: a partir de aquí la memoria se vuelve incómoda. */
export const RAG_THRESHOLD_LINES = 5000;
const CHUNK_CHARS = 900;
const CHUNK_OVERLAP = 140;
const HASH_DIM = 256;

export class LocalRAG {
  readonly root: string;
  private readonly configPath: string;
  private readonly indexPath: string;
  private enabled = false;
  private model = "qwen3-embedding:0.6b";
  private modelUsed = "sin indexar";
  private indexedAt = 0;
  private items: RagChunk[] = [];
  private cargado = false;

  constructor(root: string) {
    this.root = root;
    this.configPath = path.join(root, ".cerebro-db", "rag.json");
    this.indexPath = path.join(root, ".cerebro-db", "vectors.json");
  }

  // ------------------------------------------------------------
  // Configuración (siempre ligera)
  // ------------------------------------------------------------
  loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const j = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
        this.enabled = j?.enabled === true;
        if (typeof j?.model === "string" && j.model) this.model = j.model;
      }
    } catch {
      this.enabled = false;
    }
  }

  private saveConfig(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify({ enabled: this.enabled, model: this.model }, null, 2), "utf-8");
    } catch {}
  }

  isEnabled(): boolean {
    if (!this.cargado) {
      this.loadConfig();
      this.cargado = true;
    }
    return this.enabled;
  }

  setEnabled(v: boolean): boolean {
    this.enabled = v === true;
    this.cargado = true;
    this.saveConfig();
    return this.enabled;
  }

  setModel(m: string): void {
    if (m) this.model = m;
    this.saveConfig();
  }

  clear(): void {
    try {
      fs.rmSync(this.indexPath, { force: true });
    } catch {}
    this.items = [];
    this.indexedAt = 0;
    this.modelUsed = "sin indexar";
  }

  // ------------------------------------------------------------
  // Serialización de vectores (little-endian base64, portable)
  // ------------------------------------------------------------
  static vecABase64(v: Float32Array): string {
    const buf = Buffer.alloc(v.length * 4);
    for (let i = 0; i < v.length; i++) buf.writeFloatLE(v[i], i * 4);
    return buf.toString("base64");
  }

  static base64AVec(s: string): Float32Array {
    const buf = Buffer.from(s, "base64");
    const n = Math.floor(buf.byteLength / 4);
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) v[i] = buf.readFloatLE(i * 4);
    return v;
  }

  /** Convierte un vector antiguo (array de números) al formato nuevo. */
  static aFloat32(v: ArrayLike<number> | Float32Array): Float32Array {
    if (v instanceof Float32Array) return v;
    const f = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) f[i] = Number(v[i]) || 0;
    return f;
  }

  // ------------------------------------------------------------
  // Troceado (determinista, por párrafos y con solape)
  // ------------------------------------------------------------
  static trocear(texto: string, fuente: string, maxChars = CHUNK_CHARS, solape = CHUNK_OVERLAP): RagChunk[] {
    const salida: RagChunk[] = [];
    const parrafos = texto.split(/\n\s*\n/);
    let buffer = "";
    let n = 0;
    const empujar = () => {
      const limpio = buffer.trim();
      if (limpio.length < 40) {
        buffer = "";
        return;
      }
      salida.push({ id: `${fuente}#${++n}`, source: fuente, text: limpio, vec: new Float32Array(0) });
      buffer = limpio.slice(-solape);
    };
    for (const p of parrafos) {
      if ((buffer + "\n\n" + p).length > maxChars) empujar();
      buffer = buffer ? `${buffer}\n\n${p}` : p;
    }
    empujar();
    return salida;
  }

  // ------------------------------------------------------------
  // Vectores
  // ------------------------------------------------------------
  /** Vector determinista por hashing de tokens: fallback sin red ni modelos. */
  static vectorHash(texto: string, dim = HASH_DIM): Float32Array {
    const v = new Float32Array(dim);
    const tokens = (texto.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || []).slice(0, 4000);
    for (const t of tokens) {
      let h = 2166136261;
      for (let i = 0; i < t.length; i++) {
        h ^= t.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      v[Math.abs(h) % dim] += 1;
    }
    let suma = 0;
    for (let i = 0; i < dim; i++) suma += v[i] * v[i];
    const norma = Math.sqrt(suma) || 1;
    for (let i = 0; i < dim; i++) v[i] /= norma;
    return v;
  }

  /** Similitud coseno sobre Float32Array (la mitad de memoria, misma precisión útil). */
  static coseno(a: Float32Array, b: Float32Array): number {
    if (!a.length || a.length !== b.length) return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / ((Math.sqrt(na) || 1) * (Math.sqrt(nb) || 1));
  }

  /** RAM estimada del índice si fuese un array de doubles (formato antiguo). */
  static ramNumberArrayMB(chunks: number, dim: number): number {
    // 8 bytes por dimensión + ~8 bytes de sobrecarga por elemento en V8
    return Math.round(((chunks * dim * 16) / 1024 ** 2) * 100) / 100;
  }

  private async embedOllama(textos: string[]): Promise<Float32Array[] | null> {
    try {
      const url = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
      const out: Float32Array[] = [];
      for (let i = 0; i < textos.length; i += 16) {
        const lote = textos.slice(i, i + 16);
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 60000);
        const res = await fetch(`${url}/api/embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: this.model, input: lote }),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!res.ok) return null;
        const j: any = await res.json();
        const vecs = j?.embeddings;
        if (!Array.isArray(vecs) || vecs.length !== lote.length) return null;
        for (const v of vecs) out.push(Array.isArray(v) ? LocalRAG.aFloat32(v) : new Float32Array(0));
      }
      return out;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------
  // Indexado
  // ------------------------------------------------------------
  async reindex(fuentes: Array<{ nombre: string; texto: string }>): Promise<{ chunks: number; dim: number; modelUsed: string; ramMB: number }> {
    const chunks: RagChunk[] = [];
    for (const f of fuentes) {
      if (!f?.texto) continue;
      chunks.push(...LocalRAG.trocear(f.texto, f.nombre));
    }
    if (chunks.length === 0) {
      this.items = [];
      this.indexedAt = Date.now();
      this.modelUsed = "sin contenido";
      this.guardarIndice();
      return { chunks: 0, dim: 0, modelUsed: this.modelUsed, ramMB: 0 };
    }

    let vectors = await this.embedOllama(chunks.map((c) => c.text));
    let modelUsed = this.model;
    if (!vectors) {
      vectors = chunks.map((c) => LocalRAG.vectorHash(c.text));
      modelUsed = "hash-256 (fallback local, calidad modesta)";
    }
    chunks.forEach((c, i) => {
      c.vec = vectors![i] || new Float32Array(0);
    });
    this.items = chunks;
    this.indexedAt = Date.now();
    this.modelUsed = modelUsed;
    this.guardarIndice();
    const dim = chunks[0]?.vec.length || 0;
    return { chunks: chunks.length, dim, modelUsed, ramMB: LocalRAG.ramFloat32MB(chunks.length, dim) };
  }

  static ramFloat32MB(chunks: number, dim: number): number {
    return Math.round(((chunks * dim * 4) / 1024 ** 2) * 100) / 100;
  }

  private guardarIndice(): void {
    try {
      fs.mkdirSync(path.dirname(this.indexPath), { recursive: true });
      // v2.1 — formato compacto: cada vector en base64 del búfer Float32.
      const items = this.items.map((c) => ({ id: c.id, source: c.source, text: c.text, v: LocalRAG.vecABase64(c.vec) }));
      fs.writeFileSync(
        this.indexPath,
        JSON.stringify({ indexedAt: this.indexedAt, modelUsed: this.modelUsed, formato: "float32", items }),
        "utf-8"
      );
    } catch {}
  }

  private cargarIndice(): void {
    if (this.items.length > 0) return;
    try {
      if (!fs.existsSync(this.indexPath)) return;
      const j = JSON.parse(fs.readFileSync(this.indexPath, "utf-8"));
      const crudos = Array.isArray(j?.items) ? j.items : [];
      this.items = crudos.map((c: any) => ({
        id: String(c?.id || ""),
        source: String(c?.source || ""),
        text: String(c?.text || ""),
        // Compatibilidad: 'v' es el formato nuevo (base64); 'vec' el antiguo.
        vec: typeof c?.v === "string" ? LocalRAG.base64AVec(c.v) : LocalRAG.aFloat32(Array.isArray(c?.vec) ? c.vec : []),
      }));
      this.indexedAt = Number(j?.indexedAt) || 0;
      this.modelUsed = String(j?.modelUsed || "desconocido");
    } catch {
      this.items = [];
    }
  }

  // ------------------------------------------------------------
  // Búsqueda
  // ------------------------------------------------------------
  async search(query: string, k = 4): Promise<Array<{ text: string; source: string; score: number }>> {
    if (!this.isEnabled()) return [];
    this.cargarIndice();
    if (this.items.length === 0) return [];
    let qv: Float32Array | null = null;
    if (!this.modelUsed.startsWith("hash")) {
      const v = await this.embedOllama([query]);
      if (v && v[0]) qv = v[0];
    }
    if (!qv || qv.length === 0) qv = LocalRAG.vectorHash(query);
    const puntuados = this.items
      .filter((c) => c.vec.length === qv!.length)
      .map((c) => ({ text: c.text, source: c.source, score: LocalRAG.coseno(qv!, c.vec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(12, k)));
    return puntuados;
  }

  /** Bloque para el prompt: SOLO si está activado y hay resultados. */
  async buildContextBlock(query: string, k = 3, maxChars = 1400): Promise<string> {
    if (!this.isEnabled()) return "";
    const hits = await this.search(query, k);
    if (hits.length === 0) return "";
    let texto = "";
    for (const h of hits) {
      const trozo = `- (${h.source}, similitud ${h.score.toFixed(2)}) ${h.text.replace(/\s+/g, " ").slice(0, 500)}`;
      if (texto.length + trozo.length > maxChars) break;
      texto += (texto ? "\n" : "") + trozo;
    }
    if (!texto) return "";
    return `=== RECUERDOS RELEVANTES (memoria vectorial local) ===\n${texto}\n=== FIN DE RECUERDOS ===`;
  }

  // ------------------------------------------------------------
  // Estado
  // ------------------------------------------------------------
  status(memoriaPath: string): RagStatus {
    let lineas = 0;
    try {
      if (fs.existsSync(memoriaPath)) {
        lineas = fs.readFileSync(memoriaPath, "utf-8").split("\n").length;
      }
    } catch {}
    const enabled = this.isEnabled();
    const chunks = this.items.length;
    const dim = this.items[0]?.vec.length || 0;
    const ramMB = LocalRAG.ramFloat32MB(chunks, dim);
    const ramViejo = LocalRAG.ramNumberArrayMB(chunks, dim);
    const ahorroPct = ramViejo > 0 ? Math.round((1 - ramMB / ramViejo) * 100) : 0;
    const recomendacion =
      lineas >= RAG_THRESHOLD_LINES
        ? `Tu memoria tiene ${lineas} líneas: por encima del umbral (${RAG_THRESHOLD_LINES}). Activar la vectorización ya aporta.`
        : `Tu memoria tiene ${lineas} líneas y el umbral es ${RAG_THRESHOLD_LINES}: todavía no hace falta, y activarla ahora solo gastaría RAM. El botón está disponible cuando quieras.`;
    return {
      enabled,
      model: this.model,
      modelUsed: this.modelUsed,
      chunks,
      dim,
      ramMB,
      ahorroPct,
      formato: chunks > 0 ? "float32" : "vacio",
      indexedAt: this.indexedAt,
      memoriaLines: lineas,
      threshold: RAG_THRESHOLD_LINES,
      recommendation: recomendacion,
    };
  }
}
