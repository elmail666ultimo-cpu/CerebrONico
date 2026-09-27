export type LanguageMemoryCategory =
  | 'idiomatic'
  | 'semantic_map'
  | 'correction'
  | 'pattern'
  | 'technical_term'
  | 'context_clue'
  | 'ambiguity'
  | 'intent'
  | 'syntactic_bridge'
  | 'multi_agent_intent'
  | 'telemetry_cue'
  | 'architecture_cue';

export interface LanguageMemoryEntry {
  id: string;
  category: LanguageMemoryCategory;
  term: string;
  meaning: string;
  equivalent: string;
  confidence: number;
  usageCount: number;
  tags?: string[];
  examples?: string[];
}

import { LS_KEYS } from "../constants";

const STORAGE_KEY = LS_KEYS.LANGUAGE_MEMORY;

export const SEED_LANGUAGE_MEMORIES: LanguageMemoryEntry[] = [
  {
    id: "lang-1",
    category: "idiomatic",
    term: "hazlo / ármalo / cóselo / dale / metele / mandate",
    meaning: "Construir e implementar inmediatamente el código completo y los archivos sin pedir confirmaciones adicionales.",
    equivalent: "generate_full_code_and_files",
    confidence: 0.99,
    usageCount: 150,
    tags: ["ejecucion", "accion_inmediata"],
  },
  {
    id: "lang-2",
    category: "idiomatic",
    term: "púlelo / mejóralo / supérate / refactorizalo / dejalo flama",
    meaning: "Refactorizar y elevar el diseño visual, rendimiento, tipografía y robustez sin añadir librerías innecesarias.",
    equivalent: "refactor_clean_ui_and_optimize",
    confidence: 0.98,
    usageCount: 135,
    tags: ["calidad", "refactorizacion", "optimizacion"],
  },
  {
    id: "lang-3",
    category: "idiomatic",
    term: "cero rodeos / al grano / sin vueltas / directo",
    meaning: "Prohibido saludos, introducciones largas, disculpas o resúmenes redundantes. Ir directo al código ejecutable y acción.",
    equivalent: "direct_code_execution_no_filler",
    confidence: 1.0,
    usageCount: 190,
    tags: ["estilo", "directo"],
  },
  {
    id: "lang-4",
    category: "idiomatic",
    term: "no lee los adjuntos / se ven rombos / no funca",
    meaning: "Procesar y desarmar el archivo DOCX/ZIP extrayendo el contenido de texto limpio o imágenes base64 sin enviar caracteres binarios corruptos.",
    equivalent: "parse_clean_attachment_content",
    confidence: 1.0,
    usageCount: 160,
    tags: ["adjuntos", "docx", "zip", "parse"],
  },
  {
    id: "lang-5",
    category: "technical_term",
    term: "puerto 3000 / puerto 5000 / puerto 11434",
    meaning: "Puerto 3000 para Frontend Vite/React; Puerto 5000 para microservicios/workers backend; Puerto 11434 para servidor Ollama local.",
    equivalent: "system_ports_architecture",
    confidence: 1.0,
    usageCount: 145,
    tags: ["red", "puertos"],
  },
  {
    id: "lang-6",
    category: "context_clue",
    term: "smolvlm / glm-ocr / qwen2.5-coder / stablelm2 / deepseek",
    meaning: "Modelos locales y en la nube gestionados desde Ollama para código, visión, OCR y razonamiento.",
    equivalent: "ollama_model_catalog",
    confidence: 1.0,
    usageCount: 170,
    tags: ["modelos", "ollama"],
  },
];

export function loadLanguageMemories(): LanguageMemoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return SEED_LANGUAGE_MEMORIES;
}

export function saveLanguageMemories(entries: LanguageMemoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn("Error saving language memories:", err);
  }
}

export function addLanguageMemoryEntry(entry: Omit<LanguageMemoryEntry, "id" | "usageCount" | "confidence">): LanguageMemoryEntry {
  const current = loadLanguageMemories();
  const newEntry: LanguageMemoryEntry = {
    ...entry,
    id: "lang-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
    usageCount: 1,
    confidence: 0.95,
  };
  const updated = [newEntry, ...current];
  saveLanguageMemories(updated);
  return newEntry;
}

export function deleteLanguageMemoryEntry(id: string): void {
  const current = loadLanguageMemories();
  const updated = current.filter((e) => e.id !== id);
  saveLanguageMemories(updated);
}

export function matchRelevantLanguageMemories(prompt: string, entries: LanguageMemoryEntry[], limit = 6): LanguageMemoryEntry[] {
  if (!prompt) return entries.slice(0, limit);
  const clean = prompt.toLowerCase();
  const scored = entries.map((e) => {
    let score = 0;
    const parts = e.term.toLowerCase().split("/").map((p) => p.trim());
    for (const part of parts) {
      if (clean.includes(part)) score += 10;
    }
    return { entry: e, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

/**
 * Automejora (Self-Improvement):
 * Analiza una interacción para deducir patrones recurrentes, preferencias técnicas o directivas del usuario.
 */
export function autoLearnFromInteraction(prompt: string, response: string): LanguageMemoryEntry | null {
  if (!prompt || prompt.length < 5) return null;

  const cleanPrompt = prompt.toLowerCase();
  
  // Detectar directivas explícitas de comportamiento
  if (cleanPrompt.includes("recuerda") || cleanPrompt.includes("a partir de ahora") || cleanPrompt.includes("nunca uses") || cleanPrompt.includes("siempre usa")) {
    const term = prompt.slice(0, 60);
    const meaning = `Regla de automejora detectada: "${prompt}"`;
    return addLanguageMemoryEntry({
      category: "correction",
      term,
      meaning,
      equivalent: "user_custom_rule",
      tags: ["automejora", "auto_aprendido"],
    });
  }

  // Detectar preferencias de librerías o sintaxis
  if (cleanPrompt.includes("en python") || cleanPrompt.includes("en rust") || cleanPrompt.includes("en typescript")) {
    const langMatch = cleanPrompt.match(/en (python|rust|typescript|javascript|c\+\+|go|bash|sql)/i);
    if (langMatch) {
      const lang = langMatch[1];
      const term = `preferencia_${lang}`;
      const meaning = `Preferencia del usuario por desarrollos en ${lang.toUpperCase()}`;
      return addLanguageMemoryEntry({
        category: "pattern",
        term,
        meaning,
        equivalent: `preferred_lang_${lang}`,
        tags: ["automejora", "lenguaje"],
      });
    }
  }

  return null;
}

