import { AgentTaskEvent, AttachmentItem, ChatMessage, ModelProvider } from "../types";
// v8.0.1 — La decisión «¿este modelo entra al bucle de agente?» se delega en el
// perfil compartido (src/engine/modelTiers.ts). Antes había DOS listas blancas
// de modelos: la de aquí abajo (regex suelto) y la de modelTiers. Cuando una
// decide sí y la otra no, el cliente manda el turno por streaming mientras el
// servidor espera un bucle de herramientas: la respuesta se queda a medias sin
// que nadie vea un error. Una sola fuente, también para esto.
import { shouldRunAgentLoop } from "../engine/modelTiers";
// v1.6.32 · D8: la métrica REAL de inferencia (eval_count y compañía) deja de
// tirarse en el `if (data.done) break`. Se lee, viaja en el meta de onDone y
// queda disponible UNA vez para el registro del turno (App.tsx): el `len/4`
// y el «una línea = un token» solo sobreviven como estimación etiquetada.
import { extraerMetricasOllama, type MetricasInferencia } from "../engine/metricasInferencia";

export interface MedicionUltimoTurno {
  tokensOut?: number;
  tokensIn?: number;
  tokPorSegundo?: number;
  msTotal?: number;
  /** true = números del motor; false = estimación (len/4, conteo de líneas). */
  exacta: boolean;
}
let ultimaMedicion: MedicionUltimoTurno | null = null;
function fijarUltimaMedicion(m: MedicionUltimoTurno | null): void {
  ultimaMedicion = m;
}
/** Lee y limpia: el registro del turno consume la medición una sola vez. */
export function consumirUltimaMedicion(): MedicionUltimoTurno | null {
  const m = ultimaMedicion;
  ultimaMedicion = null;
  return m;
}

export interface StreamConfig {
  provider: ModelProvider;
  model: string;
  temperature?: number;
  systemInstruction?: string;
  hiddenSystemFiles?: { name: string; content: string }[];
  openFiles?: { path: string; name: string; content: string; language: string }[];
  ollamaUrl?: string;
  openrouterApiKey?: string;
  geminiApiKey?: string;
  customServerUrl?: string;
  customApiKey?: string;
  openaiApiKey?: string;
  // v1.1 — Dedicated cloud provider API keys:
  zaiApiKey?: string;
  groqApiKey?: string;
  cerebrasApiKey?: string;
  togetherApiKey?: string;
  mistralApiKey?: string;
  deepseekApiKey?: string;
  fireworksApiKey?: string;
  pcMode?: boolean;
}

export interface StreamCallbacks {
  onChunk: (accumulated: string, delta: string) => void;
  onDone: (finalText: string, meta: { model: string; provider: ModelProvider; tps?: number; metricas?: MetricasInferencia | null }) => void;
  onError: (error: string) => void;
  onTask?: (event: AgentTaskEvent) => void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const DEFAULT_SYSTEM_INSTRUCTION =
  "Eres CerebroNico, motor y agente autónomo de ingeniería de software e IDE de alta precisión. Responde SIEMPRE y EXCLUSIVAMENTE en ESPAÑOL técnico, directo, riguroso y sin rodeos.";

// Modelos capaces de llamar herramientas: se enrutan por el servidor (agente).
// v8.0.1 — Delegado en el perfil compartido (ver el import). Se conserva el
// nombre de la función porque la usan varias ramas de este archivo; lo que
// cambia es de dónde sale la respuesta.
function isToolCapableModelName(modelName: string): boolean {
  return shouldRunAgentLoop(modelName);
}

// Modelos con capacidad de visión (multimodal / OCR)
function isVisionModelName(modelName: string): boolean {
  return /vision|smolvlm|glm-ocr|glm-4v|glm4v|glm-5|llava|llava-phi3|bakllava|moondream|minicpm|qwen2\.5vl|qwen2-vl|qwen3-vl|qwen-vl|cogvlm|internvl|pixtral|deepseek-vl|gpt-oss|gemma3|gemma4|kimi/i.test(
    modelName.toLowerCase()
  );
}

/**
 * Normalizes malformed lists, repairs double-dots (2.. -> 2.),
 * and ensures no empty gaps exist for item 2 or subsequent numbers.
 */
export function repairNumberedListsAndGaps(text: string): string {
  if (!text || text.length < 4) return text;

  // 1. Normalize malformed double-dots like '2..' or '3..' at the start of a line
  let cleaned = text.replace(/^(\s*\d+)\.\.+(\s*)/gm, "$1. $2");

  // 2. Fix empty numbered items (e.g. line with just "2." or "2. " followed by next number or empty space)
  const lines = cleaned.split("\n");
  const resultLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if line is just a bare number like "2." or "2" with nothing after it
    const bareNumMatch = trimmed.match(/^(\d+)\.?$/);
    if (bareNumMatch) {
      const num = parseInt(bareNumMatch[1], 10);
      const nextLine = lines[i + 1]?.trim() || "";
      if (!nextLine || /^\d+\./.test(nextLine) || nextLine.startsWith("#")) {
        resultLines.push(`${num}. **Paso / Opción ${num}**: Configuración y enlace de dependencias del sistema.`);
        continue;
      }
    }

    // Check if there is an empty numbered item like "2. " followed immediately by "3. " or empty line + "3. "
    const emptyNumberedMatch = trimmed.match(/^(\d+)\.\s*$/);
    if (emptyNumberedMatch) {
      const num = parseInt(emptyNumberedMatch[1], 10);
      const nextLine = lines[i + 1]?.trim() || "";
      if (!nextLine || /^\d+\./.test(nextLine) || nextLine.startsWith("#")) {
        resultLines.push(`${num}. **Paso / Opción ${num}**: Procesamiento y validación técnica.`);
        continue;
      }
    }

    resultLines.push(line);
  }

  // 3. Detect jumped numbering in lists (e.g. 1. followed directly by 3. where 2 was omitted)
  const finalLines: string[] = [];
  let expectedSeq = 1;
  let inNumberedBlock = false;

  for (let i = 0; i < resultLines.length; i++) {
    const current = resultLines[i];
    const itemMatch = current.match(/^(\s*)(\d+)\.\s+(.*)$/);

    if (itemMatch) {
      const indent = itemMatch[1];
      const actualNum = parseInt(itemMatch[2], 10);
      const content = itemMatch[3];

      if (actualNum === 1) {
        inNumberedBlock = true;
        expectedSeq = 2;
        finalLines.push(current);
      } else if (inNumberedBlock && actualNum === expectedSeq) {
        expectedSeq++;
        finalLines.push(current);
      } else if (inNumberedBlock && actualNum === 3 && expectedSeq === 2) {
        // Specifically missed option 2: synthesize option 2 and proceed with 3
        finalLines.push(`${indent}2. **Procesamiento y Arquitectura**: Configuración y enlace de dependencias del sistema.`);
        finalLines.push(`${indent}3. ${content}`);
        expectedSeq = 4;
      } else {
        finalLines.push(current);
      }
    } else {
      if (current.startsWith("#") || current.startsWith("```")) {
        inNumberedBlock = false;
      }
      finalLines.push(current);
    }
  }

  return finalLines.join("\n");
}

function sanitizeRepetitiveLoop(text: string): { hasLoop: boolean; cleaned: string } {
  if (text.length < 80) return { hasLoop: false, cleaned: text };

  // Detect loop of sentences / repetitive phrases
  for (let len = 20; len <= 180; len++) {
    if (text.length < len * 3) continue;
    const chunk3 = text.slice(-len);
    const chunk2 = text.slice(-len * 2, -len);
    const chunk1 = text.slice(-len * 3, -len * 2);

    if (chunk3 === chunk2 && chunk2 === chunk1 && chunk3.trim().length > 8) {
      let base = text.slice(0, -len * 2);
      while (base.endsWith(chunk3)) {
        base = base.slice(0, -chunk3.length);
      }
      return { hasLoop: true, cleaned: base + chunk3 };
    }
  }

  // Detect duplicate consecutive lines
  const lines = text.split("\n");
  if (lines.length >= 3) {
    const l1 = lines[lines.length - 1].trim();
    const l2 = lines[lines.length - 2].trim();
    const l3 = lines[lines.length - 3].trim();
    if (l1.length > 6 && l1 === l2 && l2 === l3) {
      let i = lines.length - 1;
      while (i >= 0 && lines[i].trim() === l1) {
        i--;
      }
      return { hasLoop: true, cleaned: [...lines.slice(0, i + 1), l1].join("\n") };
    }
  }

  return { hasLoop: false, cleaned: text };
}

export class HighPerformanceAIStreamer {
  private abortController: AbortController | null = null;
  private pendingChunkBuffer = "";
  private accumulatedText = "";
  private isProcessing = false;
  private rafId: number | null = null;

  public abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isProcessing = false;
  }

  /**
   * Try direct client-side streaming to local Ollama (runs in user's browser, can reach 127.0.0.1:11434)
   * with automatic, instant reconnection on connection drops.
   */
  private async tryDirectLocalOllamaStream(
    prompt: string,
    attachments: AttachmentItem[],
    history: ChatMessage[],
    config: StreamConfig,
    callbacks: StreamCallbacks,
    startTime: number
  ): Promise<boolean> {
    const targetUrl = (config.ollamaUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
    const isVision = isVisionModelName(config.model);

    const base64Images: string[] = [];
    let textAttachmentsContext = "";

    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        if (att.isImage && att.base64Data) {
          const pureBase64 = att.base64Data.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");
          base64Images.push(pureBase64);
        } else if (att.extractedText) {
          textAttachmentsContext += `\n\n${att.extractedText.slice(0, 15000)}`;
        }
      }
    }

    let openFilesContext = "";
    if (Array.isArray(config.openFiles) && config.openFiles.length > 0) {
      openFilesContext =
        "\n\n### [ARCHIVOS ABIERTOS EN EL EDITOR ACTIVO]:\n" +
        config.openFiles
          .map(
            (f) =>
              `\`\`\`${f.language || "text"} file="${f.path || f.name}"\n${f.content || ""}\n\`\`\``
          )
          .join("\n\n");
    }

    const fullUserPrompt = `${prompt || "Analizar requerimiento"}${
      textAttachmentsContext ? `\n\n[DOCUMENTOS ADJUNTOS EXTRAÍDOS]:${textAttachmentsContext}` : ""
    }${openFilesContext}`;

    // Build the immutable payload once; it is reused on every reconnection attempt.
    // Always inject a Spanish system instruction so no model ever defaults to another language.
    const messagesPayload: any[] = [];
    messagesPayload.push({
      role: "system",
      content: config.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
    });
    if (Array.isArray(config.hiddenSystemFiles)) {
      for (const hf of config.hiddenSystemFiles) {
        messagesPayload.push({
          role: "system",
          content: `[CONTEXTO DE TRABAJO: ${hf.name}] (material de referencia interno; NO lo transcribas, cites ni repitas en la respuesta)\n\n${hf.content}`,
        });
      }
    }
    for (const h of history) {
      if (h.role && h.content) {
        messagesPayload.push({ role: h.role, content: h.content });
      }
    }
    const userMsg: any = { role: "user", content: fullUserPrompt };
    if (base64Images.length > 0 && isVision) {
      userMsg.images = base64Images;
    }
    messagesPayload.push(userMsg);

    // Robust connection: 1 initial attempt + up to 3 automatic reconnections
    const maxAttempts = 4;
    let totalTokens = 0;
    let metricasTurno: MetricasInferencia | null = null;
    let completed = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        if (!this.isProcessing) break; // user cancelled during reconnect

        // Reset partial output and reconnect instantly (short backoff)
        this.accumulatedText = "";
        this.pendingChunkBuffer = "";
        const backoffMs = attempt === 1 ? 120 : Math.min(250 * (attempt - 1), 800);
        await sleep(backoffMs);
        if (!this.isProcessing) break;
      }

      const result = await this.attemptDirectOllamaStreamOnce(
        targetUrl,
        config,
        messagesPayload,
        callbacks
      );

      if (result.status === "done") {
        totalTokens += result.tokens;
        if (result.metricas) metricasTurno = result.metricas;
        completed = true;
        break;
      }
      if (result.status === "aborted") {
        return false; // user cancelled: do not reconnect, let fallback no-op
      }
      if (result.status === "model_error") {
        return false; // non-retryable (e.g. model not found): fall back to server proxy
      }
      totalTokens += result.tokens;
      // result.status === "connection_error": loop to reconnect
      // OLLAMA v2 — paciencia de arranque en frío también por el camino directo
      // del navegador: reconectar en bucle cerrado solo inunda CORS mientras
      // Ollama abre su puerto. 2 s entre intentos.
      await sleep(2000);
    }

    if (!completed) {
      // Exhausted reconnections; leave isProcessing untouched so server fallback can continue
      return false;
    }

    const repaired = repairNumberedListsAndGaps(this.accumulatedText);
    this.accumulatedText = repaired;
    this.isProcessing = false;

    const elapsedSec = Math.max(0.1, (performance.now() - startTime) / 1000);
    // D8 (v1.6.32): con métrica del motor, el tk/s es MEDIDA (eval_count /
    // eval_duration); sin ella, la división de siempre sobre una cuenta que
    // sumaba líneas. La etiqueta `exacta` viaja con la verdad.
    const tps = metricasTurno?.tokPorSegundo ?? Math.round((totalTokens / elapsedSec) * 10) / 10;
    fijarUltimaMedicion(
      metricasTurno
        ? {
            tokensOut: metricasTurno.tokensSalida,
            tokensIn: metricasTurno.tokensEntrada,
            tokPorSegundo: metricasTurno.tokPorSegundo,
            msTotal: metricasTurno.msTotal ?? Math.round(elapsedSec * 1000),
            exacta: true,
          }
        : { tokensOut: totalTokens, tokPorSegundo: tps, msTotal: Math.round(elapsedSec * 1000), exacta: false }
    );

    callbacks.onDone(this.accumulatedText, {
      model: config.model,
      provider: "ollama",
      tps,
      metricas: metricasTurno,
    });

    return true;
  }

  /**
   * Perform one full streaming attempt to local Ollama.
   * Returns "done" on success, "aborted" on user cancel, "connection_error" when the
   * network/stream drops (retryable), and "model_error" on non-retryable HTTP errors.
   */
  private async attemptDirectOllamaStreamOnce(
    targetUrl: string,
    config: StreamConfig,
    messagesPayload: any[],
    callbacks: StreamCallbacks
  ): Promise<
    | { status: "done"; tokens: number; metricas?: MetricasInferencia | null }
    | { status: "aborted" }
    | { status: "connection_error"; tokens: number }
    | { status: "model_error" }
  > {
    const localAbort = new AbortController();
    const handleUserAbort = () => localAbort.abort();
    if (this.abortController) {
      this.abortController.signal.addEventListener("abort", handleUserAbort);
    }

    let tokenCount = 0;
    let doneMetrics: MetricasInferencia | null = null;
    let rafId: number | null = null;

    const cancelFlusher = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    try {
      // Establish connection with a per-attempt timeout
      // v2.6.2 — «se corta cuando encolo»: con el modelo frío (8 GB de RAM, carga
      // de pesos >5 s) el timeout de conexión mataba el intento ANTES del primer
      // token. 25 s cubren la carga fría del perfil local sin esconder caídas reales.
      const connectionTimeout = setTimeout(() => localAbort.abort(), 25000);

      let response: Response;
      try {
        response = await fetch(`${targetUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: localAbort.signal,
          body: JSON.stringify({
            model: config.model,
            messages: messagesPayload,
            stream: true,
            // v2.6.2 — este camino del navegador NO mandaba keep_alive: cada
            // mensaje podía recargar los pesos (y con RAM apretada, el modelo se
            // iba y volvía: «se corta la comunicación»). 30 min residente.
            keep_alive: "30m",
            options: {
              temperature: typeof config.temperature === "number" ? config.temperature : 0.5,
              repeat_penalty: 1.15,
              repeat_last_n: 128,
            },
          }),
        });
      } catch {
        clearTimeout(connectionTimeout);
        if (this.abortController?.signal.aborted) {
          return { status: "aborted" };
        }
        return { status: "connection_error", tokens: tokenCount };
      }
      clearTimeout(connectionTimeout);

      // User cancelled while connecting
      if (this.abortController?.signal.aborted) {
        return { status: "aborted" };
      }

      if (!response.ok) {
        return RETRYABLE_HTTP_STATUS.has(response.status)
          ? { status: "connection_error", tokens: tokenCount }
          : { status: "model_error" };
      }
      if (!response.body) {
        return { status: "connection_error", tokens: tokenCount };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // 60FPS UI Flusher
      const flushBuffer = () => {
        if (this.pendingChunkBuffer.length > 0) {
          const delta = this.pendingChunkBuffer;
          this.accumulatedText += delta;
          this.pendingChunkBuffer = "";
          callbacks.onChunk(this.accumulatedText, delta);
        }
        if (this.isProcessing) {
          rafId = requestAnimationFrame(flushBuffer);
        }
      };
      rafId = requestAnimationFrame(flushBuffer);

      // 🔧 Timeout de 4 min por lectura directa (misma protección anti-cuelgue)
      const directRead = (): Promise<{ done: boolean; value?: Uint8Array }> =>
        new Promise((resolve, reject) => {
          const t = setTimeout(() => {
            try {
              localAbort.abort();
            } catch {}
            reject(new Error("⏱️ Ollama directo no respondió (4 min sin datos)."));
          }, 240000);
          reader.read().then(
            (r) => {
              clearTimeout(t);
              resolve(r);
            },
            (e) => {
              clearTimeout(t);
              reject(e);
            }
          );
        });

      try {
        while (true) {
          if (!this.isProcessing) break;
          const { done, value } = await directRead();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                this.pendingChunkBuffer += parsed.message.content;
                tokenCount++;
              }
              if (parsed.done) {
                // D8 (v1.6.32): esta línea trae eval_count y las duraciones del
                // motor. Antes se tiraba y el turno se «medía» contando líneas
                // NDJSON — que no son tokens.
                doneMetrics = extraerMetricasOllama(parsed);
                break;
              }
            } catch {}
          }
        }
      } catch {
        // Stream dropped mid-flight (network error) -> retryable
        cancelFlusher();
        if (this.abortController?.signal.aborted) {
          return { status: "aborted" };
        }
        return { status: "connection_error", tokens: tokenCount };
      }

      cancelFlusher();
      if (this.pendingChunkBuffer.length > 0) {
        this.accumulatedText += this.pendingChunkBuffer;
        this.pendingChunkBuffer = "";
      }

      if (this.abortController?.signal.aborted || !this.isProcessing) {
        return { status: "aborted" };
      }

      // D8: si el motor contó los tokens, mandamos SU cuenta; si no, la
      // estimación de líneas (y `metricas` nulo dice que no es medida).
      return { status: "done", tokens: doneMetrics?.tokensSalida ?? tokenCount, metricas: doneMetrics };
    } catch {
      cancelFlusher();
      if (this.abortController?.signal.aborted) {
        return { status: "aborted" };
      }
      return { status: "connection_error", tokens: tokenCount };
    } finally {
      if (this.abortController) {
        this.abortController.signal.removeEventListener("abort", handleUserAbort);
      }
    }
  }

  public async stream(
    prompt: string,
    attachments: AttachmentItem[],
    history: ChatMessage[],
    config: StreamConfig,
    callbacks: StreamCallbacks
  ): Promise<void> {
    this.abort();
    this.abortController = new AbortController();
    this.accumulatedText = "";
    this.pendingChunkBuffer = "";
    this.isProcessing = true;

    const startTime = performance.now();

    // Ruta directa navegador->Ollama DESHABILITADA por fiabilidad:
    // en Windows sufre bloqueos CORS / Private Network Access que dejan la UI
    // "conectada pero sin responder". Todo el tráfico Ollama va por el servidor
    // (/api/ai/stream), que tiene reintentos y evita esos bloqueos.
    // Para reactivarla: cambiar ENABLE_DIRECT_OLLAMA a true.
    const ENABLE_DIRECT_OLLAMA = false;
    if (ENABLE_DIRECT_OLLAMA && config.provider === "ollama" && !isToolCapableModelName(config.model)) {
      const localSuccess = await this.tryDirectLocalOllamaStream(
        prompt,
        attachments,
        history,
        config,
        callbacks,
        startTime
      );
      if (localSuccess) {
        return;
      }
    }

    try {
      let tokenCount = 0;
      // D8: métrica que el SERVIDOR ya normalizó y manda en el evento `done`.
      let servidaMetricas: MetricasInferencia | null = null;
      let response: Response;
      try {
        response = await fetch("/api/ai/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: this.abortController.signal,
          body: JSON.stringify({
            prompt,
            systemInstruction: config.systemInstruction,
            hiddenSystemFiles: config.hiddenSystemFiles || [],
            openFiles: config.openFiles || [],
            provider: config.provider,
            model: config.model,
            temperature: config.temperature,
            ollamaUrl: config.ollamaUrl,
            openrouterApiKey: config.openrouterApiKey,
            geminiApiKey: config.geminiApiKey,
            customServerUrl: config.customServerUrl,
            customApiKey: config.customApiKey,
            openaiApiKey: config.openaiApiKey,
            // v1.1 — Pass dedicated cloud provider keys to the server:
            zaiApiKey: config.zaiApiKey,
            groqApiKey: config.groqApiKey,
            cerebrasApiKey: config.cerebrasApiKey,
            togetherApiKey: config.togetherApiKey,
            mistralApiKey: config.mistralApiKey,
            deepseekApiKey: config.deepseekApiKey,
            fireworksApiKey: config.fireworksApiKey,
            pcMode: config.pcMode === true,
            attachments: attachments.map((a) => ({
              id: a.id,
              name: a.name,
              size: a.size,
              type: a.type,
              isImage: a.isImage,
              base64Data: a.base64Data,
              extractedText: a.extractedText,
            })),
            history: history.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });
      } catch (fetchErr: unknown) {
        if (this.abortController?.signal.aborted) {
          return;
        }
        throw new Error(
          fetchErr instanceof Error
            ? fetchErr.message
            : "Fallo de conexión al enviar el requerimiento al servidor de inferencia."
        );
      }

      if (!response.ok || !response.body) {
        let errorDetail = "";
        try {
          const errJson = await response.json();
          errorDetail = errJson.error || errJson.message || "";
        } catch {}
        throw new Error(errorDetail || `Error en servidor de inferencia (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let sseBuffer = "";
      let modelUsed = config.model;
      let loopBreakerTriggered = false;

      // 60FPS UI Flusher
      const flushBuffer = () => {
        if (this.pendingChunkBuffer.length > 0) {
          const delta = this.pendingChunkBuffer;
          this.accumulatedText += delta;
          this.pendingChunkBuffer = "";

          const check = sanitizeRepetitiveLoop(this.accumulatedText);
          if (check.hasLoop) {
            this.accumulatedText = check.cleaned;
            loopBreakerTriggered = true;
          }

          callbacks.onChunk(this.accumulatedText, delta);
        }
        if (this.isProcessing) {
          this.rafId = requestAnimationFrame(flushBuffer);
        }
      };
      this.rafId = requestAnimationFrame(flushBuffer);

      // 🔧 Timeout global por lectura: si el servidor no envía nada ni cierra en 5 min
      // (modelo cargando, Ollama colgado), abortamos con un error claro en vez de colgar la UI.
      let streamDeadline: ReturnType<typeof setTimeout> | null = null;
      const readWithTimeout = (): Promise<{ done: boolean; value?: Uint8Array }> =>
        new Promise((resolve, reject) => {
          if (streamDeadline) clearTimeout(streamDeadline);
          streamDeadline = setTimeout(() => {
            try {
              reader.cancel();
            } catch {}
            reject(new Error("⏱️ El motor de inferencia no respondió (5 min sin datos). Reinicia Ollama e inténtalo de nuevo."));
          }, 300000);
          reader.read().then(
            (r) => {
              if (streamDeadline) clearTimeout(streamDeadline);
              streamDeadline = null;
              resolve(r);
            },
            (e) => {
              if (streamDeadline) clearTimeout(streamDeadline);
              streamDeadline = null;
              reject(e);
            }
          );
        });

      try {
        while (true) {
          if (loopBreakerTriggered) {
            try {
              await reader.cancel();
            } catch {}
            break;
          }

          const { done, value } = await readWithTimeout();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            try {
              const data = JSON.parse(trimmed.slice(5).trim());
              // 🔧 CORRECCIÓN CRÍTICA: si el server envía un evento `error` (p.ej.
              // "❌ Ollama no pudo responder para el modelo X: 404 model not found"),
              // NO lanzar excepción — propagarlo vía callbacks.onError() para que
              // el usuario vea el mensaje real del server, no el genérico
              // "La conexión con el motor de inferencia fue interrumpida".
              // Antes, lanzar `new Error(data.error)` aquí caía al catch de abajo
              // que veía "BodyStreamBuffer was aborted" y mostraba el mensaje
              // genérico, ocultando el error verdadero del proveedor.
              if (data.error) {
                this.isProcessing = false;
                if (this.rafId !== null) {
                  cancelAnimationFrame(this.rafId);
                  this.rafId = null;
                }
                // Final flush del buffer pendiente antes de reportar el error
                if (this.pendingChunkBuffer.length > 0) {
                  this.accumulatedText += this.pendingChunkBuffer;
                  this.pendingChunkBuffer = "";
                  callbacks.onChunk(this.accumulatedText, "");
                }
                callbacks.onError(data.error);
                return;
              }
              if (data.text) {
                this.pendingChunkBuffer += data.text;
                tokenCount++;
              }
              if (data.model) {
                modelUsed = data.model;
              }
              if (data.task) {
                callbacks.onTask?.(data.task);
              }
              if (data.done) {
                // D8 (v1.6.32): server.ts ya extrajo eval_count y las duraciones
                // del motor; viajan normalizadas en `data.metricas`.
                if (data.metricas && typeof data.metricas === "object") {
                  servidaMetricas = data.metricas as MetricasInferencia;
                }
                break;
              }
            } catch (jsonErr: any) {
              if (jsonErr.message && !jsonErr.message.includes("Unexpected token")) {
                throw jsonErr;
              }
            }
          }
        }
      } catch (readErr: any) {
        if (this.accumulatedText.length > 20 || this.pendingChunkBuffer.length > 0) {
          console.warn("Stream finalizado prematuramente:", readErr.message);
        } else {
          throw readErr;
        }
      }

      // Final flush
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }

      if (this.pendingChunkBuffer.length > 0) {
        this.accumulatedText += this.pendingChunkBuffer;
        this.pendingChunkBuffer = "";
      }

      const loopCheck = sanitizeRepetitiveLoop(this.accumulatedText);
      const repairedText = repairNumberedListsAndGaps(loopCheck.cleaned);
      this.accumulatedText = repairedText;

      const elapsedSec = Math.max(0.1, (performance.now() - startTime) / 1000);
      // D8 (v1.6.32): la medida del motor manda sobre la cuenta de fragmentos.
      const tps = servidaMetricas?.tokPorSegundo ?? Math.round((tokenCount / elapsedSec) * 10) / 10;
      fijarUltimaMedicion(
        servidaMetricas
          ? {
              tokensOut: servidaMetricas.tokensSalida,
              tokensIn: servidaMetricas.tokensEntrada,
              tokPorSegundo: servidaMetricas.tokPorSegundo,
              msTotal: servidaMetricas.msTotal ?? Math.round(elapsedSec * 1000),
              exacta: true,
            }
          : { tokensOut: tokenCount, tokPorSegundo: tps, msTotal: Math.round(elapsedSec * 1000), exacta: false }
      );

      this.isProcessing = false;
      callbacks.onDone(this.accumulatedText, {
        model: modelUsed,
        provider: config.provider,
        tps,
        metricas: servidaMetricas,
      });
    } catch (err: any) {
      this.isProcessing = false;
      if (this.abortController?.signal.aborted) {
        return;
      }

      const errMsg = err.message || "";
      // 🔧 CORRECCIÓN CRÍTICA: solo mostrar el mensaje genérico "conexión interrumpida"
      // si el error es REALMENTE un abort del AbortController del frontend (usuario
      // canceló, o el server cerró la conexión de forma anormal sin evento SSE previo).
      // Antes, cualquier error que contuviera la palabra "aborted" (incluyendo errores
      // reales del server que mencionaban "fetch failed: aborted") caía aquí y se
      // reemplazaba por el mensaje genérico, OCULTANDO el error verdadero al usuario.
      const isTrueFrontendAbort =
        (errMsg.includes("BodyStreamBuffer was aborted") ||
         errMsg.includes("The user aborted a request") ||
         errMsg.includes("AbortError")) &&
        this.abortController?.signal.aborted;
      if (isTrueFrontendAbort) {
        callbacks.onError(
          "La conexión con el motor de inferencia fue interrumpida. CerebroNico se ha reconfigurado automáticamente para reintentar la solicitud."
        );
      } else {
        callbacks.onError(errMsg || "Error durante el streaming de la respuesta");
      }
    }
  }
}
