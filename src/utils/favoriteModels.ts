/**
 * favoriteModels.ts — Carpeta personalizable de MODELOS FAVORITOS (v2.0)
 * ======================================================================
 * Antes (v1.1): solo persistía favoritos en localStorage y NINGUNA pantalla
 * los mostraba — la "carpeta de modelos favoritos" era código muerto.
 *
 * Ahora (v2.0) la carpeta es real:
 *   1. Catálogo curado de modelos GRATUITOS (con o sin cuota diaria, indicado).
 *   2. Semilla automática la primera vez: el usuario abre el selector y ya
 *      tiene una carpeta "⭐ Favoritos" con modelos listos para usar.
 *   3. CRUD completo (añadir / quitar / reordenar / exportar / importar) con
 *      validación, para poder enchufar cualquier modelo de cualquier servidor.
 *
 * ⚠️ Sobre "gratis sin cuota diaria": el único caso que cumple las tres
 * palabras (gratis, sin cuota y sin key) son los modelos LOCALES de Ollama
 * (tú pones el hardware). En la nube todo "gratis" lleva key y rate limits,
 * aunque no tengan cuota diaria dura. Cada entrada del catálogo lo dice.
 */
import type { ModelProvider } from "../types";

export interface FavoriteModel {
  id: string;
  /** Nombre EXACTO que espera el proveedor, ej: "glm-4.7-flash", "qwen2.5:0.5b" */
  modelId: string;
  /** Nombre para mostrar */
  name: string;
  provider: ModelProvider;
  /** Categoría para agrupar en el selector */
  category: "chat" | "code" | "vision" | "reasoning" | "small" | "agent";
  description?: string;
  /** "sin-cuota" = sin cuota diaria documentada · "sesion" = límites por sesión · "local" = sin límites (tu hardware) */
  quota?: QuotaKind;
  /** Tamaño de descarga/contexto, texto libre ("0.4 GB", "≈1 GB", "nube") */
  size?: string;
  /** Nombre del servidor para mostrar ("Z.ai", "Ollama local", …) */
  serverLabel?: string;
  /** De dónde salió el dato (para poder auditar la afirmación de "gratis") */
  sourceUrl?: string;
  addedAt: number;
  /** Marcado por el usuario como favorito dentro del catálogo curado */
  pinned?: boolean;
}

export type QuotaKind = "local" | "sin-cuota" | "sesion" | "creditos" | "pago";

export const QUOTA_LABEL: Record<QuotaKind, string> = {
  local: "Sin cuota (corre en tu PC)",
  "sin-cuota": "Gratis sin cuota diaria",
  sesion: "Gratis con límites por sesión",
  creditos: "Crédito gratis que se agota",
  pago: "De pago",
};

const LS_KEY = "cerebronico_favorite_models";
/** Flag para sembrar la carpeta una sola vez y no pisar la elección del usuario */
const LS_SEEDED = "cerebronico_favorite_models_seeded";

// ============================================================
// CATÁLOGO CURADO — modelos gratuitos verificados
// ============================================================
// Precios de Z.ai verificados el 18/09/2026 contra la tabla oficial:
//   https://docs.z.ai/guides/overview/pricing
//   → Gratis (input y output a $0): GLM-4.7-Flash, GLM-4.5-Flash, GLM-4.6V-Flash
// Modelos locales: precios de tamaño de ollama.com/library (aprox. de la
// etiqueta del modelo; el tamaño real depende de la cuantización).
// Ollama Cloud: el plan free de ollama.com incluye modelos "-cloud" con
// límites (1 modelo cloud concurrente y cuotas por sesión).
// ============================================================
export const FREE_MODEL_CATALOG: FavoriteModel[] = [
  // ---------- NUBE GRATIS: Z.ai / GLM (el "GLM +" que pediste) ----------
  {
    id: "cat-zai-glm47flash",
    modelId: "glm-4.7-flash",
    name: "GLM-4.7-Flash (Z.ai)",
    provider: "zai",
    category: "chat",
    description: "El GLM gratuito más nuevo. Rápido y capaz para chat + código. Requiere API key gratuita de Z.ai (sin tarjeta).",
    quota: "sin-cuota",
    size: "nube · 128K",
    serverLabel: "Z.ai",
    sourceUrl: "https://docs.z.ai/guides/overview/pricing",
    addedAt: 0,
  },
  {
    id: "cat-zai-glm45flash",
    modelId: "glm-4.5-flash",
    name: "GLM-4.5-Flash (Z.ai)",
    provider: "zai",
    category: "code",
    description: "El caballo de batalla gratuito: gratis confirmado, bueno en código y agentes.",
    quota: "sin-cuota",
    size: "nube · 128K",
    serverLabel: "Z.ai",
    sourceUrl: "https://docs.z.ai/guides/overview/pricing",
    addedAt: 0,
  },
  {
    id: "cat-zai-glm46vflash",
    modelId: "glm-4.6v-flash",
    name: "GLM-4.6V-Flash · visión (Z.ai)",
    provider: "zai",
    category: "vision",
    description: "Visión GRATUITA: pega una captura o un PDF escaneado y lo entiende. Ideal para revisar diseños del editor web.",
    quota: "sin-cuota",
    size: "nube · 64K",
    serverLabel: "Z.ai",
    sourceUrl: "https://docs.z.ai/guides/overview/pricing",
    addedAt: 0,
  },

  // ---------- NUBE GRATIS: Ollama Cloud (texto y visión) ----------
  {
    id: "cat-ollama-gptoss120",
    modelId: "gpt-oss:120b-cloud",
    name: "gpt-oss:120b-cloud",
    provider: "ollama",
    category: "reasoning",
    description: "Modelo grande corriendo en la nube de Ollama pero controlado desde tu Ollama local. Requiere `ollama signin`.",
    quota: "sesion",
    size: "nube (marcador local)",
    serverLabel: "Ollama Cloud",
    sourceUrl: "https://ollama.com/pricing",
    addedAt: 0,
  },
  {
    id: "cat-ollama-qwen3vl235",
    modelId: "qwen3-vl:235b-cloud",
    name: "qwen3-vl:235b-cloud · visión",
    provider: "ollama",
    category: "vision",
    description: "Visión de gama alta en la nube gratis: OCR, capturas, documentos y video.",
    quota: "sesion",
    size: "nube (marcador local)",
    serverLabel: "Ollama Cloud",
    sourceUrl: "https://ollama.com/pricing",
    addedAt: 0,
  },

  // ---------- LOCALES LIGEROS: 8 GB de RAM, sin cuota ni internet ----------
  {
    id: "cat-local-qwen25-05b",
    modelId: "qwen2.5:0.5b",
    name: "qwen2.5:0.5b · ultrarrápido",
    provider: "ollama",
    category: "small",
    description: "≈400 MB. El más rápido que vas a poder correr. Respuestas cortas: perfecto para clasificar, resumir y autocompletar.",
    quota: "local",
    size: "≈0.4 GB",
    serverLabel: "Ollama local",
    sourceUrl: "https://ollama.com/library/qwen2.5",
    addedAt: 0,
  },
  {
    id: "cat-local-llama32-1b",
    modelId: "llama3.2:1b",
    name: "llama3.2:1b",
    provider: "ollama",
    category: "small",
    description: "≈1.3 GB. El mejor equilibrio tamaño/calidad por debajo de 2 GB.",
    quota: "local",
    size: "≈1.3 GB",
    serverLabel: "Ollama local",
    sourceUrl: "https://ollama.com/library/llama3.2",
    addedAt: 0,
  },
  {
    id: "cat-local-qwen25coder15b",
    modelId: "qwen2.5-coder:1.5b",
    name: "qwen2.5-coder:1.5b",
    provider: "ollama",
    category: "code",
    description: "≈1 GB. El más útil para código dentro del presupuesto de 8 GB.",
    quota: "local",
    size: "≈1 GB",
    serverLabel: "Ollama local",
    sourceUrl: "https://ollama.com/library/qwen2.5-coder",
    addedAt: 0,
  },
  {
    id: "cat-local-gemma2-2b",
    modelId: "gemma2:2b",
    name: "gemma2:2b",
    provider: "ollama",
    category: "chat",
    description: "≈1.6 GB. Buen español para un modelo tan chico.",
    quota: "local",
    size: "≈1.6 GB",
    serverLabel: "Ollama local",
    sourceUrl: "https://ollama.com/library/gemma2",
    addedAt: 0,
  },
  {
    id: "cat-local-qwen3-4b",
    modelId: "qwen3:4b",
    name: "qwen3:4b",
    provider: "ollama",
    category: "chat",
    description: "≈2.5 GB. El techo razonable con 8 GB si cierras el navegador. Ya soporta tool-calling.",
    quota: "local",
    size: "≈2.5 GB",
    serverLabel: "Ollama local",
    sourceUrl: "https://ollama.com/library/qwen3",
    addedAt: 0,
  },
  {
    id: "cat-local-smolvlm",
    modelId: "moondream:latest",
    name: "moondream (visión local)",
    provider: "ollama",
    category: "vision",
    description: "≈1.7 GB. Visión local sin depender de internet ni de cuotas. Calidad menor que GLM-4.6V-Flash.",
    quota: "local",
    size: "≈1.7 GB",
    serverLabel: "Ollama local",
    sourceUrl: "https://ollama.com/library/moondream",
    addedAt: 0,
  },
];

/** Semilla: los 3 que más se usan de verdad (uno de nube gratis, uno de código local y uno de visión gratis). */
const SEED_IDS = ["cat-zai-glm47flash", "cat-local-qwen25coder15b", "cat-zai-glm46vflash"];

export function loadFavoriteModels(): FavoriteModel[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return seedFavoritesOnce();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitize(parsed) : [];
  } catch {
    return [];
  }
}

/** La primera vez que se abre la IDE, la carpeta ya trae contenido útil. */
function seedFavoritesOnce(): FavoriteModel[] {
  try {
    if (localStorage.getItem(LS_SEEDED) === "1") return [];
  } catch {}
  const seed = FREE_MODEL_CATALOG.filter((m) => SEED_IDS.includes(m.id)).map((m) => ({
    ...m,
    addedAt: Date.now(),
    pinned: true,
  }));
  saveFavoriteModels(seed);
  try {
    localStorage.setItem(LS_SEEDED, "1");
  } catch {}
  return seed;
}

export function saveFavoriteModels(models: FavoriteModel[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(models));
  } catch {}
}

/** Tolerante a entradas viejas/parciales: descarta lo que no se puede usar. */
function sanitize(list: any[]): FavoriteModel[] {
  return list
    .filter((m) => m && typeof m.modelId === "string" && m.modelId.trim() && typeof m.provider === "string")
    .map((m) => ({
      id: typeof m.id === "string" ? m.id : `fav-model-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      modelId: String(m.modelId).trim(),
      name: typeof m.name === "string" && m.name.trim() ? m.name : String(m.modelId),
      provider: m.provider as ModelProvider,
      category: (m.category || "chat") as FavoriteModel["category"],
      description: typeof m.description === "string" ? m.description : undefined,
      quota: (m.quota || undefined) as QuotaKind | undefined,
      size: typeof m.size === "string" ? m.size : undefined,
      serverLabel: typeof m.serverLabel === "string" ? m.serverLabel : undefined,
      sourceUrl: typeof m.sourceUrl === "string" ? m.sourceUrl : undefined,
      addedAt: typeof m.addedAt === "number" ? m.addedAt : Date.now(),
      pinned: !!m.pinned,
    }));
}

export function addFavoriteModel(
  modelId: string,
  name: string,
  provider: FavoriteModel["provider"],
  options: Partial<Omit<FavoriteModel, "id" | "modelId" | "name" | "provider" | "addedAt">> = {}
): FavoriteModel {
  const models = loadFavoriteModels();
  const existing = models.find((m) => m.modelId === modelId && m.provider === provider);
  if (existing) return existing;

  const newModel: FavoriteModel = {
    id: `fav-model-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    modelId: modelId.trim(),
    name: name.trim() || modelId,
    provider,
    category: options.category || "chat",
    description: options.description,
    quota: options.quota,
    size: options.size,
    serverLabel: options.serverLabel,
    sourceUrl: options.sourceUrl,
    addedAt: Date.now(),
    pinned: options.pinned,
  };
  models.unshift(newModel);
  // Límite alto pero finito: la carpeta no debe crecer sin control en localStorage
  if (models.length > 60) models.splice(60);
  saveFavoriteModels(models);
  return newModel;
}

export function removeFavoriteModel(id: string): void {
  saveFavoriteModels(loadFavoriteModels().filter((m) => m.id !== id));
}

export function isFavoriteModel(modelId: string, provider: string): boolean {
  return loadFavoriteModels().some((m) => m.modelId === modelId && m.provider === provider);
}

export function toggleFavoriteModel(
  modelId: string,
  name: string,
  provider: FavoriteModel["provider"],
  options: Partial<Omit<FavoriteModel, "id" | "modelId" | "name" | "provider" | "addedAt">> = {}
): boolean {
  if (isFavoriteModel(modelId, provider)) {
    saveFavoriteModels(loadFavoriteModels().filter((m) => !(m.modelId === modelId && m.provider === provider)));
    return false;
  }
  addFavoriteModel(modelId, name, provider, options);
  return true;
}

/** Reordenar (mantiene la lista estable si el índice no existe). */
export function moveFavoriteModel(id: string, delta: number): FavoriteModel[] {
  const models = loadFavoriteModels();
  const i = models.findIndex((m) => m.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= models.length) return models;
  [models[i], models[j]] = [models[j], models[i]];
  saveFavoriteModels(models);
  return models;
}

export function clearFavoriteModels(): void {
  saveFavoriteModels([]);
}

/** Reponer el catálogo curado completo (sin duplicar lo que ya está). */
export function restoreCatalog(): FavoriteModel[] {
  const current = loadFavoriteModels();
  const have = new Set(current.map((m) => `${m.provider}::${m.modelId}`));
  const toAdd = FREE_MODEL_CATALOG.filter((m) => !have.has(`${m.provider}::${m.modelId}`)).map((m) => ({
    ...m,
    addedAt: Date.now(),
  }));
  const merged = [...current, ...toAdd];
  saveFavoriteModels(merged);
  return merged;
}

export function exportFavoriteModels(): string {
  return JSON.stringify(loadFavoriteModels(), null, 2);
}

export function importFavoriteModels(json: string): FavoriteModel[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("El archivo no contiene una lista de modelos.");
  const imported = sanitize(parsed);
  const current = loadFavoriteModels();
  const have = new Set(current.map((m) => `${m.provider}::${m.modelId}`));
  const merged = [...current, ...imported.filter((m) => !have.has(`${m.provider}::${m.modelId}`))];
  saveFavoriteModels(merged);
  return merged;
}

/** Filtro de búsqueda para el selector de modelos. */
export function filterFavorites(models: FavoriteModel[], query: string): FavoriteModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return models;
  return models.filter((m) =>
    [m.name, m.modelId, m.provider, m.description || "", m.serverLabel || ""].join(" ").toLowerCase().includes(q)
  );
}
