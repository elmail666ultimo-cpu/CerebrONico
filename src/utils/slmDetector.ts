/**
 * CerebroNico V0.9 — Detector de SLMs (Small Language Models)
 * ============================================================
 * Detecta si el modelo activo es "pequeño" (< 4B parámetros) basándose
 * en el nombre del modelo. Los SLMs tienen contextos reducidos y se
 * confunden con demasiada información — necesitan un tratamiento especial:
 *
 *  - RAG más agresivo (2 chunks en vez de 4)
 *  - EvolutionDB reducida (top 3 lecciones en vez de 5)
 *  - System prompt con reglas anti-alucinación estrictas
 *  - Determinismo reforzado (una sola respuesta, sin alternativas)
 */

export interface SLMInfo {
  isSLM: boolean;
  /** Estimación de parámetros en billones (1.5 = 1.5B) */
  estimatedBillionParams: number | null;
  /** Ventana de contexto recomendada para este SLM */
  recommendedContextWindow: number;
  /** Razón de la detección */
  reason: string;
  /** Categoría del SLM */
  category: "nano" | "small" | "medium" | "unknown";
}

/**
 * Patrones conocidos de SLMs por nombre.
 * Cuando el nombre del modelo coincide con uno de estos patrones,
 * se activa el "modo SLM estricto".
 */
const SLM_PATTERNS: { pattern: RegExp; params: number; category: SLMInfo["category"]; label: string }[] = [
  // Nano modelos (50MB - 500MB) — ultra pequeños, contexto muy reducido
  { pattern: /smollm2?:\s*135m/i, params: 0.135, category: "nano", label: "SmolLM2 135M (135MB)" },
  { pattern: /smollm2?:\s*360m/i, params: 0.36, category: "nano", label: "SmolLM2 360M (360MB)" },
  { pattern: /tinyllama/i, params: 1.1, category: "nano", label: "TinyLlama 1.1B (637MB)" },
  { pattern: /qwen2?\.?5?-coder:\s*0\.5b|qwen2?\.?5?-coder:\s*500m/i, params: 0.5, category: "nano", label: "Qwen2.5-coder 0.5B (500MB)" },
  { pattern: /phi-?\d?:\s*(mini|nano|small)/i, params: 1.0, category: "nano", label: "Phi mini/nano" },
  { pattern: /gemma.*:\s*2b|gemma2?:\s*2b/i, params: 2.0, category: "nano", label: "Gemma 2B" },
  { pattern: /stablelm2:\s*1\.6b|stablelm2:zephyr|stablelm2:latest|^stablelm2/i, params: 1.6, category: "nano", label: "StableLM2 1.6B (986MB)" },

  // Small modelos (500MB - 1.5GB) — el rango que el usuario usa
  { pattern: /qwen2?\.?5?-coder:\s*1\.5b/i, params: 1.5, category: "small", label: "Qwen2.5-coder 1.5B (986MB)" },
  { pattern: /qwen2?\.?5?-coder:\s*3b/i, params: 3.0, category: "small", label: "Qwen2.5-coder 3B" },
  { pattern: /phi-?\d?:\s*3\.8b|phi-?\d?:\s*mini/i, params: 3.8, category: "small", label: "Phi-3 mini" },
  { pattern: /phi-?4:\s*mini/i, params: 3.8, category: "small", label: "Phi-4 mini" },
  { pattern: /smollm2?:\s*(1\.7b|2\.2b)/i, params: 2.2, category: "small", label: "SmolLM2 1.7B/2.2B" },
  { pattern: /deepseek-coder:\s*1\.3b/i, params: 1.3, category: "small", label: "DeepSeek-coder 1.3B" },
  { pattern: /starcoder2:\s*3b/i, params: 3.0, category: "small", label: "StarCoder2 3B" },
  { pattern: /llama-?3\.?2:\s*(1b|3b)|llama3\.2:\s*(1b|3b)/i, params: 3.0, category: "small", label: "Llama 3.2 1B/3B" },
  { pattern: /gemma.*:\s*4b/i, params: 4.0, category: "small", label: "Gemma 4B" },

  // Medium (1.5GB - 8GB) — NO son SLM pero tienen contexto reducido
  { pattern: /qwen2?\.?5?-coder:\s*7b|qwen2?\.?5?-coder:\s*8b/i, params: 7.0, category: "medium", label: "Qwen2.5-coder 7B" },
  { pattern: /llama3?:\s*8b|llama-?3:\s*8b/i, params: 8.0, category: "medium", label: "Llama3 8B" },
  { pattern: /mistral.*:\s*7b|mistral-?7b/i, params: 7.0, category: "medium", label: "Mistral 7B" },
  { pattern: /deepseek-r1:\s*7b|deepseek-r1:\s*8b/i, params: 7.0, category: "medium", label: "DeepSeek R1 7B/8B" },
];

/**
 * Detecta si un modelo es SLM basándose en su nombre.
 * Devuelve info detallada: si es SLM, parámetros estimados, contexto recomendado.
 */
export function detectSLM(modelName: string): SLMInfo {
  if (!modelName || typeof modelName !== "string") {
    return {
      isSLM: false,
      estimatedBillionParams: null,
      recommendedContextWindow: 8192,
      reason: "Nombre de modelo no proporcionado",
      category: "unknown",
    };
  }

  // Buscar coincidencia con patrones conocidos
  for (const p of SLM_PATTERNS) {
    if (p.pattern.test(modelName)) {
      const isSmall = p.category === "nano" || p.category === "small";
      const ctx = p.category === "nano" ? 4096 : p.category === "small" ? 8192 : 16384;
      return {
        isSLM: isSmall,
        estimatedBillionParams: p.params,
        recommendedContextWindow: ctx,
        reason: `${p.label} detectado (${p.params}B params, categoría: ${p.category})`,
        category: p.category,
      };
    }
  }

  // Heurística: si el nombre contiene ":<número>b" o ":<número>m", extraer parámetros
  // 🔧 Ampliado para detectar modelos desde 50MB (0.05B) hasta 1.5GB (1.5B)
  const sizeMatch = modelName.match(/:(\d+(?:\.\d+)?)(b|m)/i);
  if (sizeMatch) {
    const num = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2].toLowerCase();
    const params = unit === "b" ? num : num / 1000;
    // 🔧 SLM si tiene <= 4B parámetros (incluye 0.135B = 135MB = SmolLM2)
    if (params <= 4.0) {
      const category: SLMInfo["category"] = params <= 1.0 ? "nano" : "small";
      return {
        isSLM: true,
        estimatedBillionParams: params,
        recommendedContextWindow: category === "nano" ? 4096 : 8192,
        reason: `Tamaño detectado por sufijo: ${params}B params (categoría: ${category})`,
        category,
      };
    }
    if (params <= 8.0) {
      return {
        isSLM: false,
        estimatedBillionParams: params,
        recommendedContextWindow: 16384,
        reason: `Modelo mediano: ${params}B params (no SLM, pero contexto reducido)`,
        category: "medium",
      };
    }
  }

  // Heurística adicional: nombres que sugieren pequeños
  // 🔧 FIX CRÍTICO: excluir modelos grandes que tienen "nano" en el nombre
  // pero son 30B+ (ej: nemotron-3-nano-omni-30b, gpt-4o-mini es 8B+)
  // Solo clasificar como SLM si NO tiene un tamaño explícito grande (7b, 8b, 13b, 30b, 70b, etc.)
  const hasLargeSize = /:(\d+(?:\.\d+)?)b/i.test(modelName) && (() => {
    const m = modelName.match(/:(\d+(?:\.\d+)?)b/i);
    if (!m) return false;
    const n = parseFloat(m[1]);
    return n >= 7; // 7B o más = NO es SLM
  })();
  if (!hasLargeSize && /tiny|nano|mini|micro|small/i.test(modelName) && !/nemotron|gpt-4o-mini|gpt-3\.5-turbo|claude.*mini/i.test(modelName)) {
    return {
      isSLM: true,
      estimatedBillionParams: null,
      recommendedContextWindow: 8192,
      reason: `Nombre sugiere modelo pequeño: "${modelName}"`,
      category: "small",
    };
  }

  return {
    isSLM: false,
    estimatedBillionParams: null,
    recommendedContextWindow: 8192,
    reason: `Modelo no clasificado como SLM: "${modelName}"`,
    category: "unknown",
  };
}

/**
 * Devuelve el número de chunks de RAG recomendados según el tipo de modelo.
 * - SLMs (nano/small): 2 chunks (~3000 caracteres) para no saturar contexto
 * - Medium (4B-8B): 3 chunks
 * - Large (>8B): 4 chunks (default)
 */
export function getRecommendedRagChunks(modelName: string): number {
  const info = detectSLM(modelName);
  switch (info.category) {
    case "nano": return 1;
    case "small": return 2;
    case "medium": return 3;
    default: return 4;
  }
}

/**
 * Devuelve el número de lecciones de EvolutionDB a inyectar.
 * - SLMs: 3 lecciones (no más, se confunden)
 * - Medium: 5 lecciones
 * - Large: 5 lecciones
 */
export function getRecommendedEvolutionLessons(modelName: string): number {
  const info = detectSLM(modelName);
  if (info.isSLM) return 3;
  return 5;
}
