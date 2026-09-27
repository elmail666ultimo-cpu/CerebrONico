import React, { useState } from "react";
import {
  Bot,
  Brain,
  Check,
  Code,
  Cpu,
  Eye,
  Layers,
  Radio,
  Search,
  Sparkles,
  Zap,
  X,
  Globe,
  RefreshCw,
  Server,
  Star,
  Plus,
  Trash2,
} from "lucide-react";
import { ModelInfo } from "../types";
import {
  loadFavoriteModels,
  toggleFavoriteModel,
  restoreCatalog,
  QUOTA_LABEL,
  FREE_MODEL_CATALOG,
  type FavoriteModel,
} from "../utils/favoriteModels";
import { EspejosSelector } from "./EspejosSelector";
import { esModeloEmbeds } from "../engine/ollamaPugil"; // PUGIL v1 /*PUGIL*/

const CATALOG_MODELS: ModelInfo[] = [
  // LOCAL & CLOUD OLLAMA
  {
    id: "qwen2.5-coder:1.5b",
    name: "qwen2.5-coder:1.5b",
    provider: "ollama",
    category: "code",
    description: "Especialista en código ligero. Máxima velocidad y bajo consumo en máquinas con memoria moderada.",
    size: "986 MB",
    contextWindow: "32k",
    isInstalled: true,
  },
  {
    id: "qwen2.5-coder:7b",
    name: "qwen2.5-coder:7b",
    provider: "ollama",
    category: "code",
    description: "Generación de código profesional con alta precisión en refactorización y depuración TypeScript/Python.",
    size: "4.7 GB",
    contextWindow: "32k",
    isInstalled: true,
  },
  {
    id: "qwen2.5-coder:32b",
    name: "qwen2.5-coder:32b",
    provider: "ollama",
    category: "code",
    description: "Motor insignia para arquitectura de software completa y sistemas full-stack masivos.",
    size: "19 GB",
    contextWindow: "64k",
    isInstalled: true,
  },
  {
    id: "deepseek-r1:7b",
    name: "deepseek-r1:7b",
    provider: "ollama",
    category: "reasoning",
    description: "Razonamiento paso a paso y resolución de algoritmos complejos con cadena de pensamiento estructurada.",
    size: "4.7 GB",
    contextWindow: "32k",
    isInstalled: true,
  },
  {
    id: "deepseek-r1:14b",
    name: "deepseek-r1:14b",
    provider: "ollama",
    category: "reasoning",
    description: "Modelo de razonamiento matemático y lógico avanzado con balance óptimo de VRAM.",
    size: "9.0 GB",
    contextWindow: "64k",
    isInstalled: true,
  },
  {
    id: "stablelm2:latest",
    name: "stablelm2:latest",
    provider: "ollama",
    category: "chat",
    description: "Modelo ligero de Stability AI para seguimiento directo de instrucciones y respuestas inmediatas.",
    size: "982 MB",
    contextWindow: "16k",
    isInstalled: true,
  },
  {
    id: "glm-ocr:q8_0",
    name: "glm-ocr:q8_0",
    provider: "ollama",
    category: "vision",
    description: "Especialista en extracción OCR, lectura de capturas, documentos y diagramas técnicos.",
    size: "1.6 GB",
    contextWindow: "16k",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "smolvlm2-500m-video:q8",
    name: "smolvlm2-500m-video:q8",
    provider: "ollama",
    category: "vision",
    description: "Inferencia visual y análisis de video/imágenes local en GPU/CPU con cuantización Q8.",
    size: "500 MB",
    contextWindow: "8k",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "llama3.3:latest",
    name: "llama3.3:latest",
    provider: "ollama",
    category: "reasoning",
    description: "Modelo general de Meta Llama 3.3 optimizado para desarrollo y orquestación técnica.",
    size: "8.0 GB",
    contextWindow: "64k",
    isInstalled: true,
  },
  {
    id: "kimi-k3:cloud",
    name: "kimi-k3:cloud",
    provider: "ollama",
    category: "reasoning",
    description: "Modelo Kimi K3 Cloud con contexto ultra-extenso de 128k tokens.",
    size: "Cloud",
    contextWindow: "128k",
    isInstalled: true,
  },
  {
    id: "gemma4:31b-cloud",
    name: "gemma4:31b-cloud",
    provider: "ollama",
    category: "reasoning",
    description: "Google Gemma 4 31B Cloud vía proxy Ollama para razonamiento avanzado.",
    size: "Cloud",
    contextWindow: "64k",
    isInstalled: true,
  },
  {
    id: "qwen3.5:cloud",
    name: "qwen3.5:cloud",
    provider: "ollama",
    category: "reasoning",
    description: "Qwen 3.5 Cloud para arquitectura de software y razonamiento complejo.",
    size: "Cloud",
    contextWindow: "128k",
    isInstalled: true,
  },
  {
    id: "deepseek-v4-flash:cloud",
    name: "deepseek-v4-flash:cloud",
    provider: "ollama",
    category: "code",
    description: "DeepSeek V4 Flash Cloud con ultra-baja latencia para generación veloz.",
    size: "Cloud",
    contextWindow: "128k",
    isInstalled: true,
  },
  {
    id: "smollm2:135m",
    name: "smollm2:135m",
    provider: "ollama",
    category: "small",
    description: "Nano-modelo SmolLM2 de 135M parámetros. Inferencia instantánea para tareas atómicas.",
    size: "270 MB",
    contextWindow: "8k",
    isInstalled: true,
  },
  {
    id: "tinyllama:latest",
    name: "tinyllama:latest",
    provider: "ollama",
    category: "small",
    description: "TinyLlama 1.1B optimizado para bajo consumo de memoria RAM y CPU pura.",
    size: "637 MB",
    contextWindow: "8k",
    isInstalled: true,
  },

  // ============================================================
  // GOOGLE GEMINI — v1.6.18
  // ------------------------------------------------------------
  // 🐞 EL CATÁLOGO OFRECÍA MODELOS APAGADOS.
  //
  // Esta lista es lo que el usuario PULSA en el selector, así que un nombre
  // muerto aquí no es una nota desactualizada: es un 404 garantizado en cuanto
  // se elige. Y no lo salva ninguna reserva del servidor, porque el modelo
  // seleccionado se prueba PRIMERO.
  //
  // Lo que había y por qué se va (verificado en la documentación oficial de
  // Google, catálogo actualizado 2026-09-22):
  //   · gemini-2.0-flash → APAGADO el 1 de junio de 2026
  //   · gemini-2.5-flash → en retirada; ya devuelve 404 en la práctica
  //   · gemini-2.5-pro   → misma familia 2.5, en retirada
  //
  // Los tres eran de 2.x. La generación vigente es la 3.x, y es la que va aquí.
  // ============================================================
  {
    id: "gemini-3.8-flash",
    name: "gemini-3.8-flash",
    provider: "gemini",
    category: "reasoning",
    description: "La versión más reciente de la familia Flash: inteligencia de nivel Pro a velocidad Flash, con visión y 1M de contexto.",
    size: "Cloud",
    contextWindow: "1M",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "gemini-3.1-pro-preview",
    provider: "gemini",
    category: "code",
    description: "Modelo insignia para codificación compleja, depuración profunda y análisis de arquitecturas completas.",
    size: "Cloud",
    contextWindow: "1M",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "gemini-3.6-flash",
    name: "gemini-3.6-flash",
    provider: "gemini",
    category: "reasoning",
    description: "Generación anterior de la familia 3, igualmente vigente. Buen equilibrio entre calidad y coste.",
    size: "Cloud",
    contextWindow: "1M",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "gemini-3.5-flash-lite",
    provider: "gemini",
    category: "chat",
    description: "Generación instantánea con streaming fluido de respuestas y visión nativa. La opción más económica de la familia 3.",
    size: "Cloud",
    contextWindow: "1M",
    isInstalled: true,
    isVisionCapable: true,
  },

  // OPENROUTER CLOUD
  {
    id: "deepseek/deepseek-r1",
    name: "deepseek/deepseek-r1",
    provider: "openrouter",
    category: "reasoning",
    description: "DeepSeek R1 671B completo en la nube vía OpenRouter para razonamiento del más alto nivel.",
    size: "Cloud",
    contextWindow: "64k",
    isInstalled: true,
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "anthropic/claude-3.5-sonnet",
    provider: "openrouter",
    category: "code",
    description: "Claude 3.5 Sonnet líder en generación de frontend, diseño de sistemas y testing unitario.",
    size: "Cloud",
    contextWindow: "200k",
    isInstalled: true,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "meta-llama/llama-3.3-70b-instruct",
    provider: "openrouter",
    category: "reasoning",
    description: "Meta Llama 3.3 70B Instruct en la nube para análisis general y síntesis técnica.",
    size: "Cloud",
    contextWindow: "128k",
    isInstalled: true,
  },

  // OPENAI DIRECT (GPT family)
  {
    id: "gpt-4o",
    name: "gpt-4o",
    provider: "openai",
    category: "reasoning",
    description: "GPT-4o de OpenAI: modelo multimodal insignia con visión, razonamiento avanzado y contexto de 128k tokens.",
    size: "Cloud",
    contextWindow: "128k",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "gpt-4o-mini",
    name: "gpt-4o-mini",
    provider: "openai",
    category: "chat",
    description: "GPT-4o-mini: velocidad extrema y bajo costo, ideal para iteración rápida y tareas de chat.",
    size: "Cloud",
    contextWindow: "128k",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "o1",
    name: "o1",
    provider: "openai",
    category: "reasoning",
    description: "OpenAI o1: razonamiento profundo encadenado para problemas complejos, matemáticas y código.",
    size: "Cloud",
    contextWindow: "200k",
    isInstalled: true,
  },
  {
    id: "o3-mini",
    name: "o3-mini",
    provider: "openai",
    category: "reasoning",
    description: "OpenAI o3-mini: razonamiento optimizado y veloz, balance entre costo y capacidad de planificación.",
    size: "Cloud",
    contextWindow: "200k",
    isInstalled: true,
  },
];

interface ModelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentModel: string;
  onSelectModel: (modelName: string) => void;
  installedOllamaModels?: string[];
  detectedGeminiModels?: string[];
  detectedOpenRouterModels?: string[];
  detectedOpenaiModels?: string[];
  // v1.1 — Z.ai (GLM) free models:
  detectedZaiModels?: string[];
  onRefreshModels?: () => void;
  onRefreshGeminiModels?: () => void;
  onRefreshOpenRouterModels?: () => void;
  onRefreshOpenaiModels?: () => void;
  onRefreshZaiModels?: () => void;
  onRefreshCustomModels?: () => void;
  onRedetectAll?: () => void;
  isRefreshing?: boolean;
  isDetectingGemini?: boolean;
  isDetectingOpenRouter?: boolean;
  isDetectingOpenai?: boolean;
  isDetectingZai?: boolean;
  isRedetectingAll?: boolean;
}

export const ModelSelectorModal: React.FC<ModelSelectorModalProps> = ({
  isOpen,
  onClose,
  currentModel,
  onSelectModel,
  installedOllamaModels = [],
  detectedGeminiModels = [],
  detectedOpenRouterModels = [],
  detectedOpenaiModels = [],
  detectedZaiModels = [],
  onRefreshModels,
  onRefreshGeminiModels,
  onRefreshOpenRouterModels,
  onRefreshOpenaiModels,
  onRefreshZaiModels,
  onRefreshCustomModels,
  onRedetectAll,
  isRefreshing = false,
  isDetectingGemini = false,
  isDetectingOpenRouter = false,
  isDetectingOpenai = false,
  isDetectingZai = false,
  isRedetectingAll = false,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [favoriteModels, setFavoriteModels] = useState<FavoriteModel[]>(loadFavoriteModels());

  const refreshFavorites = () => setFavoriteModels(loadFavoriteModels());

  const handleToggleFavorite = (
    modelId: string,
    name: string,
    provider: FavoriteModel["provider"],
    // v2.1 — Aquí decía `{ category?: string }`, más ancho que lo que
    // `toggleFavoriteModel` acepta (`FavoriteModel["category"]` es una unión de
    // valores, no cualquier texto). Se usa el mismo tipo que el destino: así el
    // que llama queda comprobado de verdad, en vez de colar un texto suelto.
    options: Partial<Omit<FavoriteModel, "name" | "id" | "provider" | "modelId" | "addedAt">> = {}
  ) => {
    toggleFavoriteModel(modelId, name, provider, options);
    refreshFavorites();
  };

  if (!isOpen) return null;

  // Merge static catalog with any dynamically detected models from Ollama /api/tags
  const dynamicModels: ModelInfo[] = [...CATALOG_MODELS];

  // 🔧 Insertar el modelo virtual "openrouter/free" al inicio del catálogo si no existe ya
  if (!dynamicModels.some((m) => m.id === "openrouter/free")) {
    dynamicModels.unshift({
      id: "openrouter/free",
      name: "openrouter/free",
      provider: "openrouter",
      category: "reasoning",
      description:
        "Enrutador automático de OpenRouter: enruta la petición al mejor modelo gratuito disponible en cada momento con soporte de tool-calling. No requiere elegir un modelo concreto — la plataforma lo hace por ti.",
      size: "Cloud",
      contextWindow: "auto",
      isInstalled: true,
    });
  }

  // Merge Ollama models (autodetect local)
  if (installedOllamaModels && installedOllamaModels.length > 0) {
    installedOllamaModels.forEach((name) => {
      // 🔧 CORRECCIÓN: comparar el nombre base (sin tag) para detectar coincidencias
      // parciales. Ej: si el catálogo tiene "qwen2.5-coder:1.5b" pero Ollama devuelve
      // "qwen2.5-coder:1.5b.ollama", deben considerarse el mismo modelo y usar el nombre
      // EXACTO que Ollama devuelve.
      const nameBase = name.split(":")[0].toLowerCase();
      const exists = dynamicModels.some((m) => {
        const mBase = m.name.split(":")[0].toLowerCase();
        return m.name.toLowerCase() === name.toLowerCase()
          || m.id.toLowerCase() === name.toLowerCase()
          || mBase === nameBase;
      });
      if (!exists) {
        dynamicModels.unshift({
          id: name,
          name: name,
          provider: "ollama",
          category: name.includes("code") ? "code" : name.includes("ocr") || name.includes("vision") || name.includes("vlm") ? "vision" : "chat",
          description: `Modelo autodetectado en tu servidor local Ollama (127.0.0.1:11434).`,
          size: "Local",
          contextWindow: "Auto",
          isInstalled: true,
          isVisionCapable: name.includes("ocr") || name.includes("vision") || name.includes("vlm") || name.includes("smolvlm"),
        });
      } else {
        // 🔧 Si el modelo del catálogo coincide por nombre base con uno instalado,
        // actualizar el name/id al nombre EXACTO que Ollama devuelve, para que al
        // seleccionarlo se envíe el nombre correcto al server.
        const catModel = dynamicModels.find((m) => {
          const mBase = m.name.split(":")[0].toLowerCase();
          return mBase === nameBase && m.provider === "ollama";
        });
        if (catModel && catModel.name !== name) {
          catModel.name = name;
          catModel.id = name;
          catModel.isInstalled = true;
        }
      }
    });
  }

  // 🔧 Merge Gemini flash models autodetectados vía /api/gemini/models
  if (detectedGeminiModels && detectedGeminiModels.length > 0) {
    detectedGeminiModels.forEach((name) => {
      const exists = dynamicModels.some(
        (m) => m.name.toLowerCase() === name.toLowerCase() || m.id.toLowerCase() === name.toLowerCase()
      );
      if (!exists) {
        dynamicModels.unshift({
          id: name,
          name: name,
          provider: "gemini",
          category: "reasoning",
          description: `Modelo flash gratuito autodetectado para tu API Key de Google AI Studio. Ventana de 1M tokens.`,
          size: "Cloud",
          contextWindow: "1M",
          isInstalled: true,
          isVisionCapable: true,
        });
      } else {
        // Marcar como detectado (isInstalled) para que aparezca como disponible
        const catModel = dynamicModels.find(
          (m) => m.name.toLowerCase() === name.toLowerCase() || m.id.toLowerCase() === name.toLowerCase()
        );
        if (catModel) catModel.isInstalled = true;
      }
    });
  }

  // 🔧 Merge OpenRouter :free models autodetectados vía /api/openrouter/models
  if (detectedOpenRouterModels && detectedOpenRouterModels.length > 0) {
    detectedOpenRouterModels.forEach((id) => {
      // Saltar el virtual "openrouter/free" — ya está agregado arriba
      if (id === "openrouter/free") return;
      const exists = dynamicModels.some(
        (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
      );
      if (!exists) {
        dynamicModels.unshift({
          id: id,
          name: id,
          provider: "openrouter",
          category: "reasoning",
          description: `Modelo gratuito de OpenRouter autodetectado (termina en :free). Soporta tool-calling.`,
          size: "Cloud",
          contextWindow: "auto",
          isInstalled: true,
        });
      } else {
        const catModel = dynamicModels.find(
          (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
        );
        if (catModel) catModel.isInstalled = true;
      }
    });
  }

  // 🔧 Merge OpenAI models autodetectados vía /api/openai/models
  if (detectedOpenaiModels && detectedOpenaiModels.length > 0) {
    detectedOpenaiModels.forEach((id) => {
      const exists = dynamicModels.some(
        (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
      );
      if (!exists) {
        dynamicModels.unshift({
          id: id,
          name: id,
          provider: "openai",
          category: id.includes("mini") ? "chat" : "reasoning",
          description: `Modelo OpenAI autodetectado en tu cuenta (api.openai.com/v1/models).`,
          size: "Cloud",
          contextWindow: "auto",
          isInstalled: true,
          isVisionCapable: /gpt-4o|gpt-4-vision|vision/i.test(id),
        });
      } else {
        const catModel = dynamicModels.find(
          (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
        );
        if (catModel) catModel.isInstalled = true;
      }
    });
  }

  // v1.1 — Merge Z.ai (GLM) free models. Siempre se inyectan al iniciar (catálogo estático).
  //   Estos modelos son 100% gratuitos y no requieren API key para mostrarse.
  if (detectedZaiModels && detectedZaiModels.length > 0) {
    detectedZaiModels.forEach((id) => {
      const exists = dynamicModels.some(
        (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
      );
      if (!exists) {
        dynamicModels.unshift({
          id: id,
          name: id,
          provider: "zai",
          category: id.includes("v") && /glm-4\.5v|vision/i.test(id) ? "vision" : "chat",
          description: `Modelo GLM GRATUITO de Z.ai (api.z.ai/api/paas/v4). Ideal para programar y chatear en español.`,
          size: "Cloud",
          contextWindow: id.includes("v") ? "64K" : "128K",
          isInstalled: true,
          isVisionCapable: /glm-4\.5v|glm-4v|vision/i.test(id),
        });
      } else {
        const catModel = dynamicModels.find(
          (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
        );
        if (catModel) catModel.isInstalled = true;
      }
    });
  }

  const filteredModels = dynamicModels.map((m) => {
    // Check if it is detected in local ollama
    const isDetectedLocally =
      m.provider === "ollama" &&
      installedOllamaModels.some((name) => name.toLowerCase() === m.name.toLowerCase() || name.toLowerCase() === m.id.toLowerCase());
    return {
      ...m,
      isInstalled: isDetectedLocally || m.provider !== "ollama",
    };
  }).filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.provider.toLowerCase().includes(searchTerm.toLowerCase());
    // 🔧 Filtro "favorites": mostrar solo los modelos guardados como favoritos
    if (selectedFilter === "favorites") {
      const isFav = favoriteModels.some(
        (fm) => fm.modelId === m.name && fm.provider === m.provider
      );
      return matchesSearch && isFav;
    }
    const matchesFilter =
      selectedFilter === "all" ||
      (selectedFilter === "installed" && m.isInstalled && m.provider === "ollama") ||
      m.category === selectedFilter ||
      m.provider === selectedFilter;
    return matchesSearch && matchesFilter;
  });

  // 🔧 Si el filtro es "favorites" y no hay modelos favoritos en el catálogo,
  // construir entradas a partir de los favoritos guardados (modelos de cualquier servidor).
  const displayModels = selectedFilter === "favorites" && filteredModels.length === 0
    ? favoriteModels
        .filter((fm) =>
          fm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          fm.modelId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          fm.provider.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .map((fm) => ({
          id: fm.modelId,
          name: fm.modelId,
          provider: fm.provider as any,
          category: (fm.category as any) || "chat",
          description: fm.description || `Modelo favorito de ${fm.provider}`,
          size: fm.provider === "ollama" ? "Local" : "Cloud",
          contextWindow: "auto",
          isInstalled: true,
          isVisionCapable: false,
        }))
    : filteredModels;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in select-none">
      {/* v1.6.5 — «la ventana de los proveedores se ve cortada»: era el propio
          `overflow-hidden` de esta tarjeta recortando los botones de detección,
          que iban en una fila sin `flex-wrap` (Redetectar · Ollama · OpenAI …
          quedaban fuera y desaparecían sin scroll ni aviso). Ahora la fila
          envuelve, la tarjeta es más ancha y más alta: nada se recorta y caben
          más modelos en la lista. */}
      <div className="cn-modal w-full bg-[#0e1320] border border-cyan-500/40 rounded-2xl shadow-2xl text-xs">
        {/* Header */}
        <div className="cn-modal-head bg-[#111728] border-b border-[#1e293b] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Radio className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {/* v1.6.15 — antes esto era `text-sm`, el MISMO tamaño que el
                    párrafo de debajo: el título de la ventana pesaba igual que
                    su contenido. Ahora es un título de verdad. */}
                <h3 className="cn-title text-zinc-100">Autodetección y Catálogo de Modelos</h3>
                {installedOllamaModels.length > 0 && (
                  <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] rounded-full font-semibold">
                    {installedOllamaModels.length} detectados en Ollama
                  </span>
                )}
              </div>
              <p className="text-zinc-400 text-[11px]">
                Selecciona tu motor activo: Ollama local, Google Gemini o OpenRouter
              </p>
            </div>
          </div>
          {/* v1.6.14 — 🐞 «la ventana del catálogo está inaccesible: solo un
              espacio chiquito para ver los modelos».
              Estos ocho botones envolvían en TRES filas (~100 px) y se comían la
              altura que necesita la lista. En una sola fila con desplazamiento
              horizontal no se pierde ninguno y se recupera el espacio. */}
          {/* Ojo: SIN `justify-end`. Con desplazamiento horizontal, alinear al
              final empuja el desbordamiento hacia la IZQUIERDA, que no se puede
              alcanzar con la barra: el botón «Redetectar» quedaría inaccesible. */}
          <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto custom-scrollbar pb-1">
            {/* Botón REDetectar TODOS los modelos (re-escanea Ollama + Gemini + OpenRouter + OpenAI en paralelo) */}
            {onRedetectAll && (
              <button
                onClick={onRedetectAll}
                disabled={isRedetectingAll}
                title="Redetectar todos los modelos: Ollama + Gemini + OpenRouter + OpenAI en paralelo"
                className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRedetectingAll ? "animate-spin" : "text-amber-400"}`} />
                <span>{isRedetectingAll ? "Detectando..." : "🔄 Redetectar"}</span>
              </button>
            )}
            {onRefreshModels && (
              <button
                onClick={onRefreshModels}
                disabled={isRefreshing}
                title="Escanear y autodetectar modelos locales en Ollama"
                className="p-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Zap className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-amber-400" : "text-cyan-400"}`} />
                <span>{isRefreshing ? "Ollama..." : "🦙 Ollama"}</span>
              </button>
            )}
            {onRefreshOpenaiModels && (
              <button
                onClick={onRefreshOpenaiModels}
                disabled={isDetectingOpenai}
                title="Autodetectar modelos disponibles en tu cuenta de OpenAI (requiere API Key)"
                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Zap className={`w-3.5 h-3.5 ${isDetectingOpenai ? "animate-spin text-amber-400" : "text-emerald-400"}`} />
                <span>{isDetectingOpenai ? "OpenAI..." : "⚡ OpenAI"}</span>
              </button>
            )}
            {/* ============================================================
                v2.0 — CARPETA DE MODELOS FAVORITOS: catálogo curado de modelos
                GRATUITOS con su tipo de cuota indicado (local = sin límite,
                sin-cuota = nube gratis, sesion = límite por sesión).
                Un clic los añade a la carpeta; luego el filtro "Favoritos" los
                muestra y la ⭐ permite quitarlos.
                ============================================================ */}
            <button
              onClick={() => {
                // Carga el catálogo curado en la carpeta de favoritos y
                // refresca la lista para que el filtro "⭐ Favoritos" la muestre.
                restoreCatalog();
                refreshFavorites();
              }}
              title="Cargar el catálogo curado de modelos GRATUITOS sin cuota diaria: GLM-4.7-Flash / GLM-4.5-Flash y visión GLM-4.6V-Flash (Z.ai), Ollama Cloud y modelos locales de 0,4-2,5 GB para 8 GB de RAM"
              className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
            >
              <Star className="w-3.5 h-3.5 text-emerald-400" />
              <span>⭐ Catálogo gratis</span>
            </button>
            {/* v1.1 — Z.ai (GLM) free models refresh button. NO requiere API key. */}
            {onRefreshZaiModels && (
              <button
                onClick={onRefreshZaiModels}
                disabled={isDetectingZai}
                title="Cargar modelos GLM GRATUITOS de Z.ai (glm-4.5-flash, glm-4-flash, etc.)"
                className="p-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isDetectingZai ? "animate-spin text-amber-400" : "text-violet-400"}`} />
                <span>{isDetectingZai ? "Z.ai..." : "🧠 Z.ai free"}</span>
              </button>
            )}
            {onRefreshCustomModels && (
              <button
                onClick={onRefreshCustomModels}
                disabled={isDetectingOpenai}
                title="Cargar modelos del Servidor Personalizado (Groq, Cerebras, Together, Mistral, etc.)"
                className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Server className={`w-3.5 h-3.5 ${isDetectingOpenai ? "animate-spin text-amber-400" : "text-amber-400"}`} />
                <span>{isDetectingOpenai ? "Custom..." : "🌐 Custom"}</span>
              </button>
            )}
            {onRefreshGeminiModels && (
              <button
                onClick={onRefreshGeminiModels}
                disabled={isDetectingGemini}
                title="Autodetectar modelos Gemini flash gratuitos para tu API Key de Google AI Studio"
                className="p-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isDetectingGemini ? "animate-spin text-amber-400" : "text-purple-400"}`} />
                <span>{isDetectingGemini ? "Gemini..." : "⚡ Gemini free"}</span>
              </button>
            )}
            {onRefreshOpenRouterModels && (
              <button
                onClick={onRefreshOpenRouterModels}
                disabled={isDetectingOpenRouter}
                title="Autodetectar modelos gratuitos de OpenRouter (incluye openrouter/free)"
                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Globe className={`w-3.5 h-3.5 ${isDetectingOpenRouter ? "animate-spin text-amber-400" : "text-emerald-400"}`} />
                <span>{isDetectingOpenRouter ? "OpenRouter..." : "🌐 OR :free"}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="p-3 bg-[#0d121c] border-b border-[#1e293b] space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre (openrouter/free, gemini-2.5-flash, qwen, deepseek-r1:free, claude)..."
              className="w-full bg-[#141b2b] border border-zinc-700/80 rounded-xl pl-9 pr-3 py-2 text-zinc-200 placeholder-zinc-500 outline-none focus:border-cyan-500 font-mono text-xs"
            />
          </div>

          {/* v1.6.5 — «la ventana se ve cortada»: los filtros finales quedaban
              fuera de vista sin ninguna pista de que había más.
              v1.6.14 — pero envolverlos costaba CUATRO filas (~120 px) que se
              comían la lista. Una sola fila con desplazamiento horizontal deja
              los catorce accesibles y devuelve el espacio a los modelos. */}
          <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto custom-scrollbar pb-1">
            {[
              { id: "all", label: `Todos (${dynamicModels.length})` },
              { id: "favorites", label: `⭐ Favoritos (${favoriteModels.length})` },
              { id: "installed", label: `🦙 Ollama (${installedOllamaModels.length})` },
              { id: "openai", label: `⚡ OpenAI (${detectedOpenaiModels.length || "4+"})` },
              { id: "gemini", label: `⚡ Gemini (${detectedGeminiModels.length || "3+"})` },
              { id: "openrouter", label: `🌐 OpenRouter (${detectedOpenRouterModels.length || "1+"})` },
              { id: "zai", label: `🧠 Z.ai (${detectedZaiModels.length || "4+"})` },
              { id: "code", label: "💻 Código" },
              { id: "reasoning", label: "🧠 Razonamiento" },
              { id: "vision", label: "👁️ Visión / OCR" },
              { id: "small", label: "⚡ Nano / Ligeros" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFilter(f.id)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 ${
                  selectedFilter === f.id
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "bg-zinc-900/60 text-zinc-400 border border-zinc-800 hover:text-zinc-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <EspejosSelector />

        {/* Models Grid List */}
        {/* v1.6.15 — «solo tiene un espacio chiquito para ver los modelos».
            Con la ventana ya a 1500 px, apilar las tarjetas en una sola
            columna desaprovechaba todo el ancho: seguían cabiendo cuatro.
            En rejilla, ese mismo ancho muestra dos o tres columnas. */}
        <div className="cn-modal-body custom-scrollbar p-3 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2 content-start bg-[#090d16]">
          {displayModels.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 space-y-2">
              <p>No se encontraron modelos con el filtro seleccionado.</p>
              {onRefreshModels && (
                <button
                  onClick={onRefreshModels}
                  className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg font-mono text-xs hover:bg-cyan-500/30 transition-all border border-cyan-500/40"
                >
                  ⚡ Re-escanear Ollama Local
                </button>
              )}
            </div>
          ) : (
            displayModels.map((model) => {
              const isSelected = currentModel === model.name;
              const esEmbed = esModeloEmbeds(model.name || model.id || ""); /*PUGIL*/
              const isFav = favoriteModels.some(
                (fm) => fm.modelId === model.name && fm.provider === model.provider
              );
              return (
                <div
                  key={model.id}
                  onClick={() => {
                    if (esEmbed) return; // PUGIL v1: un embedder no se elige para conversar
                    onSelectModel(model.name);
                    onClose();
                  }}
                  /* v1.6.5 — «los modelos muy grandes»: la tarjeta gastaba 12px de
                     relleno por lado y 4px entre líneas para tres renglones, así
                     que en pantalla cabían cuatro modelos. Ahora es compacta. */
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? "bg-[#142036] border-cyan-500/60 text-cyan-50 shadow-md"
                      : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850"
                  }`}
                >
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-xs text-zinc-100">{model.name}</span>
                      {esEmbed && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-300 border border-violet-600/40"
                          title="Genera vectores para búsqueda/RAG; Ollama lo rechaza con 400 en /api/chat. No sirve para conversar."
                        >
                          📎 embeddings
                        </span>
                      )}

                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          model.provider === "gemini"
                            ? "bg-blue-900/40 text-blue-300 border border-blue-600/40"
                            : model.provider === "openrouter"
                            ? "bg-emerald-900/40 text-emerald-300 border border-emerald-600/40"
                            : model.provider === "openai"
                            ? "bg-teal-900/40 text-teal-300 border border-teal-600/40"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {model.provider.toUpperCase()}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded font-mono">
                        {model.size}
                      </span>
                      {model.isVisionCapable && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
                          Visión/OCR
                        </span>
                      )}
                      {model.provider === "ollama" && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${
                            model.isInstalled
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-zinc-800/80 text-zinc-500 border-zinc-700/50"
                          }`}
                        >
                          {model.isInstalled ? "✓ Detectado Local" : "Catálogo"}
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-400 text-[11px] leading-snug line-clamp-2" title={model.description}>{model.description}</p>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5">
                    {/* 🔧 Botón estrella para añadir/quitar de favoritos */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(model.name, model.name, model.provider, {
                          category: model.category,
                          description: model.description,
                        });
                      }}
                      className={`p-1.5 rounded-md transition-colors ${
                        isFav
                          ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                          : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-amber-400"
                      }`}
                      title={isFav ? "Quitar de favoritos" : "Añadir a favoritos"}
                    >
                      <Star className={`w-3.5 h-3.5 ${isFav ? "fill-current" : ""}`} />
                    </button>
                    {isSelected ? (
                      <div className="flex items-center gap-1 text-cyan-400 font-semibold text-[11px]">
                        <Check className="w-4 h-4" />
                        <span>Activo</span>
                      </div>
                    ) : (
                      <button className="px-3 py-1.5 bg-zinc-800 hover:bg-cyan-600 hover:text-white text-zinc-300 rounded-lg text-xs font-medium transition-colors">
                        Seleccionar
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
