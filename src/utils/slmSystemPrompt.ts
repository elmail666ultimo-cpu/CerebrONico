/**
 * CerebroNico V0.9 — System Prompt Reforzado para SLMs
 * ============================================================
 * Reglas anti-alucinación estrictas para modelos pequeños.
 * Los SLMs se confunden con contextos largos y tienden a:
 *  - Inventar APIs que no existen
 *  - Asumir tipos sin verificar
 *  - Dar múltiples alternativas en vez de una respuesta directa
 *  - Repetir el prompt del usuario
 *  - Cortar respuestas a mitad
 *
 * Este system prompt las frena con reglas deterministas.
 */
import { SLMInfo } from "./slmDetector";

/**
 * Genera el system prompt adicional para un SLM según su categoría.
 * - nano (< 1B): reglas MUY estrictas (modelo muy limitado)
 * - small (1B-4B): reglas estrictas (modelo limitado)
 * - medium (4B-8B): reglas ligeras (modelo decente pero con contexto reducido)
 */
export function buildSLMSystemPromptAddon(info: SLMInfo): string {
  if (!info.isSLM) return "";

  const base = `
[PROTOCOLO SLM ESTRICTO — Modelo pequeño detectado: ${info.reason}]
Tienes capacidades limitadas. Sigue ESTRICTAMENTE estas reglas:

1. CONTEXTO: Tu ventana de contexto es ${info.recommendedContextWindow} tokens. NO repitas información innecesaria.
2. ANTI-ALUCINACIÓN:
   - NO inventes APIs, funciones, métodos ni propiedades que no aparezcan en los fragmentos proporcionados.
   - Si no sabes algo con certeza, di exactamente: "No tengo suficiente información para responder eso."
   - NO asumas tipos — si un fragmento no los especifica, pregunta.
3. DETERMINISMO:
   - Da UNA sola respuesta directa. NO ofrezcas alternativas ("puedes hacer X o Y").
   - Si hay múltiples opciones válidas, elige la más simple y explica por qué.
   - NO repitas el prompt del usuario en tu respuesta.
4. FORMATO:
   - Respuestas cortas y precisas. Máximo 200 palabras salvo que se pida explícitamente lo contrario.
   - Usa bloques de código SOLO cuando sea estrictamente necesario.
   - NO uses markdown decorativo (emojis, headers) salvo que el usuario lo pida.
5. RAG: Si se proporciona [DOCUMENTACIÓN INDEXADA LOCALMENTE], responde ÚNICAMENTE basándote en esos fragmentos.
6. EVOLUTION: Si se proporciona [MEMORIA DE AUTOMEJORA], aplica esas soluciones cuando el síntoma coincida.`;

  if (info.category === "nano") {
    return base + `
7. NANO-MODELO (${info.estimatedBillionParams}B): Eres extremadamente pequeño. Sé aún más conservador:
   - Si el prompt tiene más de 500 palabras, pide al usuario que lo resuma.
   - Una sola instrucción por turno. Si el usuario pide varias cosas, responde solo la primera y pide confirmación para las demás.`;
  }

  if (info.category === "small") {
    return base + `
7. MODELO PEQUEÑO (${info.estimatedBillionParams}B): Tienes capacidad limitada pero suficiente:
   - Procesa hasta 3 instrucciones por turno. Si hay más, lista las primeras 3 y pide confirmación.
   - Si una instrucción requiere más de 200 palabras de respuesta, divídela en pasos numerados.`;
  }

  return base;
}

/**
 * Verifica si un SLM necesita que se le advierta al usuario que tiene
 * capacidades limitadas (para mostrar un aviso visual en la UI).
 */
export function getSLMUserWarning(info: SLMInfo): string | null {
  if (!info.isSLM) return null;
  if (info.category === "nano") {
    return `⚠️ Modelo nano detectado (${info.estimatedBillionParams}B). Capacidad muy limitada — usa prompts cortos y específicos. El motor inyectará reglas anti-alucinación estrictas.`;
  }
  if (info.category === "small") {
    return `ℹ️ Modelo pequeño detectado (${info.estimatedBillionParams}B). Modo SLM activo — RAG reducido a 2 chunks, EvolutionDB a 3 lecciones, determinismo reforzado.`;
  }
  return null;
}
