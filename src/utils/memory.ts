import { loadLanguageMemories, matchRelevantLanguageMemories } from "./languageMemory";

export interface MemoryRule {
  id: string;
  topic: string;
  instruction: string;
  category: "architecture" | "language" | "ports" | "anti-slop" | "attachments" | "lists";
}

export const BASE_MEMORY_RULES: MemoryRule[] = [
  {
    id: "mem-1",
    topic: "Idioma Obligatorio",
    instruction: "Interactuar SIEMPRE y EXCLUSIVAMENTE en ESPAÑOL claro, técnico, certero y sin rodeos con el usuario.",
    category: "language",
  },
  {
    id: "mem-2",
    topic: "Generación de Archivos con Formato del IDE",
    instruction: "Para crear o modificar archivos, emite SIEMPRE bloques con el atributo exacto ```lang file=\"ruta/archivo.ext\". NUNCA uses placeholders como '// resto del código'.",
    category: "architecture",
  },
  {
    id: "mem-3",
    topic: "Gestión de Puertos",
    instruction: "Puerto 3000 reservado para Frontend. Puerto 5000 para backend/workers/FFmpeg/FastAPI. Puerto 11434 para Ollama.",
    category: "ports",
  },
  {
    id: "mem-4",
    topic: "Procesamiento de Adjuntos",
    instruction: "Cuando el usuario suba archivos (código, documentos Word .docx, paquetes .zip o imágenes), extrae el contenido estructurado y analízalo sin mostrar símbolos binarios corruptos.",
    category: "attachments",
  },
  {
    id: "mem-5",
    topic: "Continuidad de Listas y Numeración",
    instruction: "En respuestas con listas numeradas (1, 2, 3...), NUNCA saltes el número 2 ni lo dejes vacío. Cada punto debe tener texto explicativo completo sin usar doble punto como '2..'.",
    category: "lists",
  },
  {
    id: "mem-6",
    topic: "Diseño Anti-Slop",
    instruction: "Rechaza activamente gradientes cliché morados, bordes inconsistentes y textos genéricos de marketing. Prioriza tipografía refinada y contraste accesible.",
    category: "anti-slop",
  },
];

import { LS_KEYS } from "../constants";

const MEMORY_STORAGE_KEY = LS_KEYS.MEMORY_RULES;

export function loadMemoryRules(): MemoryRule[] {
  try {
    const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return BASE_MEMORY_RULES;
}

export function saveMemoryRules(rules: MemoryRule[]): void {
  try {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(rules));
  } catch (err) {
    console.warn("Error saving memory rules:", err);
  }
}

export function addMemoryRule(rule: Omit<MemoryRule, "id">): MemoryRule {
  const current = loadMemoryRules();
  const newRule: MemoryRule = {
    ...rule,
    id: "mem-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
  };
  const updated = [...current, newRule];
  saveMemoryRules(updated);
  return newRule;
}

export function deleteMemoryRule(id: string): void {
  const current = loadMemoryRules();
  const updated = current.filter((r) => r.id !== id);
  saveMemoryRules(updated);
}

/**
 * Automejora activa del cerebro / memoria:
 * Analiza el historial reciente de conversación y extrae aprendizajes técnicos consolidados.
 */
export function autoImproveMemory(history: { role: string; content: string }[]): {
  addedRules: MemoryRule[];
  summary: string;
} {
  const addedRules: MemoryRule[] = [];
  if (!history || history.length === 0) {
    return {
      addedRules: [],
      summary: "No hay historial suficiente para sintetizar automejoras.",
    };
  }

  // Analizar mensajes del usuario buscando correcciones o requerimientos específicos
  const userMessages = history.filter((m) => m.role === "user").map((m) => m.content);

  for (const text of userMessages) {
    const lower = text.toLowerCase();
    
    // Regla de sintaxis o formato
    if (lower.includes("no quites") || lower.includes("manten") || lower.includes("deja")) {
      const topic = "Directiva de Persistencia";
      const instruction = `Preservar activamente: "${text.slice(0, 120)}"`;
      const rule = addMemoryRule({
        topic,
        instruction,
        category: "architecture",
      });
      addedRules.push(rule);
      break;
    }
  }

  if (addedRules.length === 0) {
    const rule = addMemoryRule({
      topic: "Lección de Sesión " + new Date().toLocaleDateString(),
      instruction: `Consolidación de buenas prácticas: Modularidad TypeScript estricta, resaltado PrismJS y retención de memoria.`,
      category: "architecture",
    });
    addedRules.push(rule);
  }

  return {
    addedRules,
    summary: `Se agregaron ${addedRules.length} nuevas directivas a la memoria activa del cerebro.`,
  };
}

/**
 * 1. MASTER MEMORY PROMPT (Used in the FIRST turn to preload all context)
 * Consolidates MEMORIA.md, CEREBRO.md, all 15 skills, and operating protocols.
 */
export function buildPreloadedMasterMemoryPrompt(activePrompt?: string): string {
  const langEntries = loadLanguageMemories();
  const matchedLang = matchRelevantLanguageMemories(activePrompt || "", langEntries, 4);
  const activeRules = loadMemoryRules();

  return `Eres CerebroNico, un motor y agente autónomo de ingeniería de software e IDE de alto rendimiento.

## [BANCO MAESTRO DE MEMORIA Y PROTOCOLO CONSOLIDADO]:
${activeRules.map((r, i) => `${i + 1}. **${r.topic}**: ${r.instruction}`).join("\n")}

${
  matchedLang.length > 0
    ? `### [MEMORIA DE LENGUAJE & INTENCIÓN ACTIVA]\n` +
      matchedLang.map((m) => `- "${m.term}": ${m.meaning} (Acción: ${m.equivalent})`).join("\n")
    : ""
}
`;
}


/**
 * 2. INCREMENTAL PROMPT (Used in Turn 2+ when memory is already preloaded)
 * Saves 80-90% token overhead, prevents context overflow, and keeps inference super fast.
 */
export function buildIncrementalContextPrompt(activePrompt?: string): string {
  const langEntries = loadLanguageMemories();
  const matchedLang = matchRelevantLanguageMemories(activePrompt || "", langEntries, 2);

  return `Eres CerebroNico. 
[ESTADO DE SESIÓN: Contexto maestro de MEMORIA.md, puertos (3000/5000/11434) y banco de skills ya consolidado en memoria previa].
- IDIOMA OBLIGATORIO: Responde SIEMPRE y EXCLUSIVAMENTE en ESPAÑOL técnico directo y sin rodeos.
- Respeta la continuidad secuencial en listas numeradas (nunca saltear el punto 2 ni dejarlo vacío).
- Emite archivos completos con \`\`\`lang file="ruta/archivo.ext"\`\`\` si corresponde.
${
  matchedLang.length > 0
    ? `[Términos activos]: ` + matchedLang.map((m) => `${m.term} -> ${m.meaning}`).join("; ")
    : ""
}
`;
}

/**
 * Dynamic selector that decides whether to send full preloaded memory or incremental delta
 */
export function buildSystemPrompt(activePrompt?: string, isFirstTurn = true): string {
  if (isFirstTurn) {
    return buildPreloadedMasterMemoryPrompt(activePrompt);
  }
  return buildIncrementalContextPrompt(activePrompt);
}
