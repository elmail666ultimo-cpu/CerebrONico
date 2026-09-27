import type { ModelProvider } from "../types";

/**
 * providerRouting.ts — ENRUTAMIENTO DE PROVEEDOR POR NOMBRE DE MODELO (v1.6.22)
 * ============================================================================
 * Decidir el proveedor SOLO por el nombre del modelo era un defecto: un modelo
 * LOCAL instalado en Ollama puede llamarse `glm-ocr:latest`, `gemini-x`,
 * `gpt-algo`, `mistral-mio`, `deepseek-cosa`… y el prefijo lo mandaba al
 * proveedor cloud que «suena» igual, donde ese modelo no existe.
 *
 * El caso real: `glm-ocr:latest` (modelo OCR local de Ollama, 2.2 GB) se
 * enrutaba a Z.ai porque empieza por `glm-`, y Z.ai respondía «Unknown Model».
 *
 * La regla corregida es de dos pasos y en este orden:
 *   1. Si el nombre está en la lista de modelos locales de Ollama → `ollama`.
 *   2. Solo si NO es local, se deduce el proveedor cloud por el prefijo.
 */

export function proveedorParaModelo(modelName: string, modelosLocales: string[]): ModelProvider {
  const n = String(modelName || "").trim();
  if (!n) return "ollama";

  // LOCAL PRIMERO: la lista que devuelve `/api/tags` de Ollama es la fuente de
  // verdad. Si el modelo está instalado, es local aunque el nombre diga lo contrario.
  if (modelosLocales.includes(n)) return "ollama";

  if (n.startsWith("glm-")) return "zai";
  if (n.startsWith("gemini")) return "gemini";
  if (n.startsWith("gpt") || n.startsWith("o1") || n.startsWith("o3")) return "openai";
  // Fireworks se comprueba ANTES que «/»: sus nombres son
  // «accounts/fireworks/models/...» y el «/» los atrapaba como OpenRouter.
  if (n.startsWith("accounts/fireworks")) return "fireworks";
  if (n.includes("/")) return "openrouter";
  if (n.startsWith("llama-3.") || n.startsWith("gemma2") || n.startsWith("mixtral")) return "groq";
  if (n.startsWith("llama3.1") || n.startsWith("qwen-2.5")) return "cerebras";
  if (n.startsWith("mistral") || n.startsWith("codestral") || n.startsWith("open-mistral")) return "mistral";
  if (n.startsWith("deepseek")) return "deepseek";
  return "ollama";
}
