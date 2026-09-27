/**
 * CerebroNico V0.9 — Historial de Prompts Favoritos
 * ============================================================
 * Guarda prompts complejos, snippets de código recurrentes e instrucciones
 * de sistema favoritas. El usuario puede inyectarlos de un clic al chat.
 *
 * Almacenamiento: localStorage (no pesan mucho, son solo texto).
 */
export interface FavoritePrompt {
  id: string;
  title: string;
  content: string;
  category: "system" | "code" | "instruction" | "snippet" | "custom";
  createdAt: number;
  lastUsedAt?: number;
  useCount: number;
}

const LS_KEY = "cerebronico_favorite_prompts";

export function loadFavoritePrompts(): FavoritePrompt[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFavoritePrompts(prompts: FavoritePrompt[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prompts));
  } catch {}
}

export function addFavoritePrompt(
  title: string,
  content: string,
  category: FavoritePrompt["category"] = "custom"
): FavoritePrompt {
  const prompts = loadFavoritePrompts();
  const newPrompt: FavoritePrompt = {
    id: `fav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: title.trim().slice(0, 80),
    content,
    category,
    createdAt: Date.now(),
    useCount: 0,
  };
  prompts.unshift(newPrompt);
  // Limitar a 50 favoritos
  if (prompts.length > 50) prompts.splice(50);
  saveFavoritePrompts(prompts);
  return newPrompt;
}

export function deleteFavoritePrompt(id: string): void {
  const prompts = loadFavoritePrompts().filter((p) => p.id !== id);
  saveFavoritePrompts(prompts);
}

export function markPromptUsed(id: string): void {
  const prompts = loadFavoritePrompts();
  const p = prompts.find((x) => x.id === id);
  if (p) {
    p.useCount = (p.useCount || 0) + 1;
    p.lastUsedAt = Date.now();
    saveFavoritePrompts(prompts);
  }
}

/** Prompts favoritos por defecto que se cargan en la primera instalación. */
export const DEFAULT_FAVORITE_PROMPTS: Omit<FavoritePrompt, "id" | "createdAt">[] = [
  {
    title: "Analizar arquitectura completa",
    content: "Analiza la arquitectura del proyecto en el workspace: lista los módulos, dependencias entre archivos, patrones detectados y posibles mejoras de refactorización. Sé específico con nombres de archivos y líneas.",
    category: "instruction",
    useCount: 0,
  },
  {
    title: "Generar README profesional",
    content: "Genera un archivo README.md profesional para este proyecto con: título, descripción, features, instalación paso a paso, uso con ejemplos, configuración, estructura de carpetas, contribución y licencia. Usa markdown limpio con emojis moderados.",
    category: "instruction",
    useCount: 0,
  },
  {
    title: "Refactorizar a TypeScript estricto",
    content: "Refactoriza el archivo activo para usar TypeScript estricto: any → tipos específicos, function → const con retorno tipado, añade interfaces para props/params, elimina `any` implícito, añade JSDoc en funciones públicas.",
    category: "code",
    useCount: 0,
  },
  {
    title: "Auditar seguridad del código",
    content: "Audita el código del workspace en busca de vulnerabilidades de seguridad: inyección SQL, XSS, path traversal, secrets hardcodeados, dependencias vulnerables, validación de input faltante. Lista cada hallazgo con severidad (crítica/alta/media/baja) y la línea exacta.",
    category: "instruction",
    useCount: 0,
  },
  {
    title: "Explicar como a un junior",
    content: "Explica el código del archivo activo como si yo fuera un desarrollador junior: qué hace, por qué está estructurado así, qué patrones usa, y qué alternativas existían. Sé didáctico pero conciso.",
    category: "instruction",
    useCount: 0,
  },
];
