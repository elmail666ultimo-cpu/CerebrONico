export type ModelProvider =
  | "ollama"
  | "gemini"
  | "openrouter"
  | "custom"
  | "openai"
  // v1.1 — Cloud servers with free tiers (dedicated providers, not "custom" templates):
  | "zai"        // Z.ai — GLM-4.5-Flash & GLM-4-Flash (FREE)
  | "groq"       // Groq — Llama 3.3 70B, Gemma 2 (FREE)
  | "cerebras"   // Cerebras — Llama 3.1 8B/70B (FREE beta)
  | "together"   // Together AI — $5 free credit
  | "mistral"    // Mistral AI — Small/Medium/Codestral (FREE tier)
  | "deepseek"   // DeepSeek — V3, R1 (very cheap, almost free)
  | "fireworks"; // Fireworks AI — $1 free credit

export interface ModelDetails {
  parent_model?: string;
  format?: string;
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
}

export interface OllamaModelItem {
  name: string;
  model?: string;
  size?: number;
  digest?: string;
  details?: ModelDetails;
  modified_at?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: ModelProvider;
  category: "chat" | "code" | "vision" | "reasoning" | "small" | "agent";
  description: string;
  size: string;
  contextWindow: string;
  isInstalled: boolean;
  manifestPath?: string;
  recommendedFor?: "chat" | "agent" | "both";
  isVisionCapable?: boolean;
}

export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  // Extracted plain-text / decoded content for LLMs and Editor
  extractedText?: string;
  // Base64 data URL for images (for vision models like smolvlm2, glm-ocr)
  base64Data?: string;
  /**
   * v8.0.3 — MINIATURA: data URL reducido (≤96 px de lado) SOLO para pintar el
   * chip del adjunto.
   *
   * Por qué no se usa `base64Data` directamente en el `<img>` del chip: el
   * navegador decodifica la imagen COMPLETA para dibujarla a 32 px. Con tres
   * adjuntos da igual; con treinta capturas 4K son cientos de MB de mapas de
   * bits en memoria y la interfaz se arrastra. La miniatura es lo que hace que
   * «cuando sean muchas» siga siendo usable.
   *
   * `base64Data` NO se toca: sigue siendo la imagen íntegra que se manda al
   * modelo. La miniatura es solo de la vista, y no sustituye a nada.
   */
  thumbData?: string;
  isImage?: boolean;
  isZip?: boolean;
  isDocx?: boolean;
  isPdf?: boolean;
  isBinary?: boolean;
  // Extracted files list if it was a compressed container
  unpackedFiles?: { path: string; size: number; content: string; isText: boolean }[];
  error?: string;
}

export interface QueuedMessageItem {
  id: string;
  text: string;
  attachments: AttachmentItem[];
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  modelUsed?: string;
  durationMs?: number;
  attachments?: AttachmentItem[];
  tokensPerSecond?: number;
  status?: "streaming" | "done" | "error";
  reasoningSteps?: string[];
}

// Chat guardado en la "carpeta de chats": historial completo con título editable
export interface SavedChat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface WorkspaceFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  size: number;
  modified?: boolean;
  isReadOnly?: boolean;
  isBinary?: boolean;
}

export interface PortTelemetry {
  port3000: boolean;
  port5000: boolean;
  port11434: boolean;
  lastChecked: number;
  ollamaModelCount?: number;
}

export interface AgentTask {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
}

export interface AgentAction {
  tool: string;
  detail: string;
  ok: boolean;
  ts?: number;
}

export type AgentTaskEvent =
  | { type: "plan"; tasks: AgentTask[] }
  | { type: "update"; taskId: string; status: AgentTask["status"] }
  | { type: "action"; action: AgentAction };

export interface SubagentItem {
  id: string;
  name: string;
  port?: number | null;
  url?: string;
  path?: string;
  role: string;
  status: "online" | "offline" | string;
}
