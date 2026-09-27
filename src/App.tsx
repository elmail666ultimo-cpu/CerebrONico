import React, { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "./components/Header";
import { LeftSidebar } from "./components/LeftSidebar";
import { RightSidebar } from "./components/RightSidebar";
import { ChatCenter } from "./components/ChatCenter";
import { ModelSelectorModal } from "./components/ModelSelectorModal";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { ZaiWizard } from "./components/ZaiWizard";
import { DedicatedWebEditorView, type WebEditorStatus } from "./components/DedicatedWebEditorView";
import { ConfigModal } from "./components/ConfigModal";
// v2.0 — Pestañas centrales (el Chat es una pestaña más), extensiones de terceros
// y panel de configuración pro (heredado de la v1.8/v1.9).
import { CenterTabBar, type CenterTab } from "./components/CenterTabs";
import { ExtensionPanelView } from "./components/ExtensionPanelView";
import { ProConfigPanel } from "./components/ProConfigPanel";
import { AppBackground } from "./components/AppBackground";
import { ExtensionManager } from "./components/ExtensionManager";
// v2.0 — Pantalla de carga con el cerebro arrancando el motor, y menú
// contextual + portapapeles global (click derecho, Ctrl+C/V, captura).
import { BootSplash } from "./components/BootSplash";
import { ContextMenuRoot } from "./components/ContextMenuRoot";
import {
  type ProSettings,
  loadProSettings,
  saveProSettings,
  applyProSettings,
  WALLPAPER_PRESETS,
} from "./utils/proSettings";
import {
  type ExtensionInfo,
  fetchExtensions,
  setExtensionEnabled,
  uninstallExtension,
  installExtensionZip,
} from "./utils/extensionHost";
import { startInvocationPolling, stopInvocationPolling, parseSlashCommand } from "./utils/extensionBridge";
import {
  type FavoriteModel,
  loadFavoriteModels,
  toggleFavoriteModel,
  moveFavoriteModel,
  restoreCatalog,
  clearFavoriteModels,
  exportFavoriteModels,
  importFavoriteModels,
} from "./utils/favoriteModels";
import { APP_FONT_SIZES, APP_FONT_SIZE_DEFAULT, APP_FONT_SIZE_LABELS, PANEL_LIMITS, IDE_BRAND } from "./constants";
import { AgentAction, AgentTask, AttachmentItem, ChatMessage, ModelProvider, PortTelemetry, QueuedMessageItem, SavedChat, SubagentItem, WorkspaceFile } from "./types";
import { HighPerformanceAIStreamer, consumirUltimaMedicion } from "./utils/engine";
import { buildContextCachePayload, DEFAULT_MEMORIA_MD, DEFAULT_SKILLS_MD, type PromptInfo } from "./utils/contextCache";
import { proveedorParaModelo } from "./utils/providerRouting";
// v2.0 — Autosuperación medible y resiliencia profunda
import { getModelProfile } from "./engine/modelTiers";
import {
  type Lesson,
  loadLessons,
  getRelevantLessons,
  buildSelfImprovementDirective,
  confirmLastLessonsUsed,
  reflectOnTurn,
  recordTurnMetric,
  getImprovementSummary,
  startNewMetricsSession,
  clearMetrics,
  deleteLesson,
  clearLessons,
  exportLessons,
} from "./utils/selfImprovement";
import { describeResilience, resetBreakers } from "./engine/resilience";
import { SelfImprovementPanel } from "./components/SelfImprovementPanel";
// v2.2 — La ventana del cerebro de tareas: planes, dependencias, paralelismo y
// el porqué de cada espera. El motor ya funcionaba; esto lo hace visible.
import { PlansPanel } from "./components/PlansPanel";
// QUIRÓFANO HD v1 — el motor QUIRÓFANO ya operaba en la sombra (sus cuatro puertas
// y sus endpoints vivían en server.ts); esta pestaña lo saca a la luz: sala,
// operación en curso, última cirugía, bitácora y botones Revisar/Deshacer.
import { PanelQuirofano } from "./components/PanelQuirofano";
import { EspinaActividad } from "./components/EspinaActividad"; // COREO v1
import { FondoLayer } from "./components/FondoLayer"; // FONDO v1
import { esModeloEmbeds, motivoEmbeds } from "./engine/ollamaPugil"; // PUGIL v1 /*PUGIL*/
import { debePausarSync, avisoPausaSync } from "./engine/sandboxTregua"; // TREGUA v1 /*TREGUA*/
import { autoLearnFromInteraction } from "./utils/languageMemory";
import { processUploadedFile } from "./utils/attachmentProcessor";

import { extractCodeBlocksFromMessage, mergeExtractedFiles } from "./utils/codeParser";
// v2.2 — El chat puede PEDIR una conversión de formato. Es la pieza que faltaba
// para cerrar chat → conversor → editor → preview.
import { extraerOrdenes } from "./engine/chatOrders";
import { alternarPantallaCompleta } from "./engine/pantallaCompleta"; // v1.6.6 — pantalla completa en un solo sitio
import { evaluarPesoAnimado, mensajePesoAnimado } from "./engine/fondo"; // v1.6.8 — el peso del fondo avisa, ya no bloquea
import { generateProjectZip, generateCnFile, parseCnFile, triggerFileDownload } from "./utils/fileParser";
import { detectLanguageFromPath } from "./utils/syntaxEngine";
import { loadJSON, saveJSON, loadString, saveString, alFallarGuardado, restaurarDeAlmacenGrande } from "./utils/storage"; // v1.9.0 — resultado del guardado + rescate al almacén grande
import { deriveChatTitle as deriveChatTitlePure, buildArchivedChat } from "./utils/chatStorage";
import { LS_KEYS, OLLAMA_URL as DEFAULT_OLLAMA_URL, SANDBOX_URL as SANDBOX_URL_CONST } from "./constants";
import { createSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot, Snapshot } from "./utils/restorePoints";
import { addFavoritePrompt, deleteFavoritePrompt, markPromptUsed, loadFavoritePrompts, FavoritePrompt, DEFAULT_FAVORITE_PROMPTS } from "./utils/favoritePrompts";
import { indexDocument, searchRelevantChunks, listIndexedDocuments, clearIndex } from "./utils/localRAG";
import { downloadMarkdownReport } from "./utils/markdownExport";
import { installGlobalErrorHandler } from "./utils/selfHealing";
import { detectSLM, getRecommendedRagChunks, getRecommendedEvolutionLessons } from "./utils/slmDetector";
import { buildSLMSystemPromptAddon, getSLMUserWarning } from "./utils/slmSystemPrompt";
import { buildEvolutionContextForPrompt } from "./utils/evolutionDB";
import { saveBackgroundImage, loadBackgroundImage, clearBackgroundImage, migrateBackgroundFromLocalStorage, urlDeFondo, revocarFondo } from "./utils/indexedDBStorage";

const INITIAL_PACKAGE_JSON = JSON.stringify(
  {
    name: "cerebronico-ide",
    private: true,
    version: "1.0.0",
    type: "module",
    author: "Mario Nicolas Quintero",
    scripts: {
      // 🔧 Puerto 3500: la app exportada corre en su propio puerto y así
      // NUNCA colisiona con la interfaz de CerebroNico IDE (puerto 3000).
      dev: "cross-env PORT=3500 tsx server.ts",
      build: "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
      start: "cross-env PORT=3500 node dist/server.cjs",
      lint: "tsc --noEmit",
    },
    dependencies: {
      "@google/genai": "^2.20.0",
      "@tailwindcss/vite": "^4.0.9",
      "@types/prismjs": "^1.26.6",
      clsx: "^2.1.1",
      "cross-env": "^7.0.3",
      cors: "^2.8.5",
      express: "^4.21.2",
      jszip: "^3.10.1",
      "lucide-react": "^1.16.0",
      prismjs: "^1.30.0",
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      "tailwind-merge": "^3.0.2",
      tailwindcss: "^4.0.9",
    },
    devDependencies: {
      "@types/cors": "^2.8.17",
      "@types/express": "^5.0.0",
      "@types/node": "^22.13.5",
      "@types/react": "^19.0.10",
      "@types/react-dom": "^19.0.4",
      "@vitejs/plugin-react": "^4.3.4",
      esbuild: "^0.25.0",
      tsx: "^4.23.13",
      typescript: "^5.7.3",
      vite: "^6.2.0",
    },
    overrides: {
      qs: "^6.16.0",
    },
  },
  null,
  2
);

const INITIAL_WORKSPACE_FILES: WorkspaceFile[] = [
  {
    id: "f-package-json",
    name: "package.json",
    path: "package.json",
    content: INITIAL_PACKAGE_JSON,
    language: "json",
    size: INITIAL_PACKAGE_JSON.length,
    modified: false,
  },
  {
    id: "f-memoria",
    name: "MEMORIA.md",
    path: "MEMORIA.md",
    content: DEFAULT_MEMORIA_MD,
    language: "markdown",
    size: DEFAULT_MEMORIA_MD.length,
    modified: false,
  },
  {
    id: "f-skills",
    name: "skills.md",
    path: "skills.md",
    content: DEFAULT_SKILLS_MD,
    language: "markdown",
    size: DEFAULT_SKILLS_MD.length,
    modified: false,
  },
  {
    id: "f-readme",
    name: "README.md",
    path: "README.md",
    content: `# ${IDE_BRAND.FULL_NAME}

Entorno de ingeniería de software autónomo de alto rendimiento con persistencia de sesión, reconexión automática a Ollama y soporte multi-provider (OpenAI / Gemini / OpenRouter / Custom).

- **Marca**: ${IDE_BRAND.FULL_NAME} — por ${IDE_BRAND.AUTHOR}
- **Turno 1**: MEMORIA.md y skills.md se inyectan como mensajes de sistema.
- **Turnos siguientes**: historial completo + archivos abiertos en el editor.
- **Inferencia**: Ollama (:11434), OpenAI (api.openai.com), Gemini (AI Studio), OpenRouter y servidor custom.
- **Puertos**: IDE en :3000 · App exportada/sandbox en :3500 · Puente PC en :5000 · Ollama en :11434.
- **Extensión personalizada**: usa archivos \`.cn\` (CerebroNico) para guardar y abrir workspace completo.
- **Sesión**: historial y workspace persistidos en local (sobreviven a recargas).
`,
    language: "markdown",
    size: 700,
    modified: false,
  },
  {
    id: "f-server",
    name: "server.ts",
    path: "server.ts",
    content: `// CerebroNico Server Proxy
// 🔧 Puerto 3500: puerto oficial de la app exportada (la IDE usa el 3000)
import express from "express";
const app = express();
const PORT = process.env.PORT || 3500;

// Portada de bienvenida: edita este archivo y el preview del sandbox se actualiza solo
app.get("/", (_req, res) => {
  res.send(\`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Mi app :3500</title></head>
<body style="font-family:system-ui,sans-serif;background:#0b1120;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center">
    <h1 style="font-size:30px;margin-bottom:8px">🚀 Tu app vive en el puerto 3500</h1>
    <p style="color:#94a3b8;margin:0">Edita <code style="color:#22d3ee">server.ts</code> en CerebroNico IDE y este preview se actualiza solo (piloto automático).</p>
  </div>
</body></html>\`);
});

app.listen(PORT, () => console.log("Servidor activo en puerto " + PORT));
`,
    language: "typescript",
    size: 720,
    modified: false,
  },
];

/**
 * v1.6.15 — 🐞 «aceitar la máquina»: el consejo del error acusaba al culpable
 * equivocado.
 *
 * Todo fallo del motor recibía el mismo sufijo: «Verifica que Ollama esté
 * activo o cambia a otro modelo disponible». Así que cuando fallaba un modelo
 * EN LA NUBE de Z.ai —como en la captura— el mensaje decía literalmente:
 *
 *   ❌ Z.ai no pudo responder para el modelo "glm-4.5v-flash": fetch failed.
 *   Verifica que Ollama esté activo…
 *
 * Es decir: el sistema sabía que había fallado Z.ai y te mandaba a revisar
 * Ollama. Dos servicios distintos, y encima Ollama no estaba en juego.
 *
 * El servidor ya nombra al proveedor real al principio del mensaje, así que el
 * consejo se deduce de ahí. Si NO hay pista del proveedor no se inventa a quién
 * culpar: se pide revisar la configuración del motor activo.
 */
function consejoDeError(errMsg: string): string {
  const m = String(errMsg || "");
  const enLaNube: Array<[RegExp, string]> = [
    [/Z\.ai/i,        "Revisa la clave de Z.ai y la conexión: el motor no llegó a sus servidores."],
    [/OpenRouter/i,   "Revisa la clave de OpenRouter y la conexión: el motor no llegó a sus servidores."],
    [/OpenAI/i,       "Revisa la clave de OpenAI, la cuota y la conexión."],
    [/Groq/i,         "Revisa la clave de Groq, la cuota y la conexión."],
    [/Cerebras/i,     "Revisa la clave de Cerebras, la cuota y la conexión."],
    [/Together/i,     "Revisa la clave de Together AI, la cuota y la conexión."],
    [/Mistral/i,      "Revisa la clave de Mistral, la cuota y la conexión."],
    [/DeepSeek/i,     "Revisa la clave de DeepSeek, la cuota y la conexión."],
    [/Gemini|Google/i,"Revisa la clave de Google AI Studio, la cuota y la conexión."],
  ];
  for (const [patron, texto] of enLaNube) if (patron.test(m)) return texto;
  if (/Ollama/i.test(m)) {
    return "Comprueba que Ollama esté arrancado y que el modelo esté descargado (ollama list).";
  }
  return "Revisa la configuración del motor activo antes de cambiar de modelo.";
}

export const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadJSON<ChatMessage[]>(LS_KEYS.MESSAGES, []));

  // Carpeta de chats guardados: historiales completos con título editable
  const [savedChats, setSavedChats] = useState<SavedChat[]>(() => loadJSON<SavedChat[]>(LS_KEYS.SAVED_CHATS, []));
  const [activeChatTitle, setActiveChatTitle] = useState<string>(() => loadString(LS_KEYS.ACTIVE_CHAT_TITLE));
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [actionLog, setActionLog] = useState<AgentAction[]>([]);
  const [currentStreamingText, setCurrentStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Model & Server State
  // v1.1 — DEFAULT cambiado a Z.ai + GLM-4.5-Flash (modelo 100% gratuito, sin tarjeta).
  //   El usuario solo necesita pegar su API key gratuita una vez y queda guardada para siempre.
  const [provider, setProvider] = useState<ModelProvider>(() => {
    const p = loadString(LS_KEYS.PROVIDER);
    if (p === "gemini" || p === "openrouter" || p === "custom" || p === "openai"
        || p === "zai" || p === "groq" || p === "cerebras"
        || p === "together" || p === "mistral" || p === "deepseek" || p === "fireworks") {
      return p as ModelProvider;
    }
    // v1.1 — Default por defecto: Z.ai (GLM-4.5-Flash es 100% gratuito).
    return "zai";
  });
  const [currentModel, setCurrentModel] = useState<string>(() => loadString(LS_KEYS.CURRENT_MODEL, "glm-4.5-flash"));
  const [ollamaUrl, setOllamaUrl] = useState<string>(() => loadString(LS_KEYS.OLLAMA_URL, DEFAULT_OLLAMA_URL));
  const [responseLanguage, setResponseLanguage] = useState<string>(() => loadString(LS_KEYS.RESPONSE_LANGUAGE, "es"));
  const [expertMode, setExpertMode] = useState<string>(() => loadString(LS_KEYS.EXPERT_MODE, "general"));
  const [openrouterApiKey, setOpenrouterApiKey] = useState<string>(() => loadString(LS_KEYS.OPENROUTER_KEY));
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => loadString(LS_KEYS.GEMINI_API_KEY));
  const [customServerUrl, setCustomServerUrl] = useState<string>(() => loadString(LS_KEYS.CUSTOM_SERVER_URL));
  const [customApiKey, setCustomApiKey] = useState<string>(() => loadString(LS_KEYS.CUSTOM_API_KEY));
  // 🔧 OpenAI directo (provider "openai") — clave sk-proj-...
  const [openaiApiKey, setOpenaiApiKey] = useState<string>(() => loadString(LS_KEYS.OPENAI_API_KEY));
  // v1.1 — Dedicated cloud provider API keys:
  const [zaiApiKey, setZaiApiKey] = useState<string>(() => loadString(LS_KEYS.ZAI_API_KEY));
  const [groqApiKey, setGroqApiKey] = useState<string>(() => loadString(LS_KEYS.GROQ_API_KEY));
  const [cerebrasApiKey, setCerebrasApiKey] = useState<string>(() => loadString(LS_KEYS.CEREBRAS_API_KEY));
  const [togetherApiKey, setTogetherApiKey] = useState<string>(() => loadString(LS_KEYS.TOGETHER_API_KEY));
  const [mistralApiKey, setMistralApiKey] = useState<string>(() => loadString(LS_KEYS.MISTRAL_API_KEY));
  const [deepseekApiKey, setDeepseekApiKey] = useState<string>(() => loadString(LS_KEYS.DEEPSEEK_API_KEY));
  const [fireworksApiKey, setFireworksApiKey] = useState<string>(() => loadString(LS_KEYS.FIREWORKS_API_KEY));
  // Modo Agente PC: habilita que el chat delegue acciones REALES a la PC vía puente :5000
  const [pcMode, setPcMode] = useState<boolean>(() => loadString(LS_KEYS.PC_MODE) === "1");
  // Topología de subagentes (estado en vivo)
  const [subagents, setSubagents] = useState<{ bridge: string; items: SubagentItem[] }>({ bridge: "http://127.0.0.1:5000", items: [] });
  const [temperature, setTemperature] = useState<number>(() => {
    const n = Number(loadString(LS_KEYS.TEMPERATURE));
    return Number.isFinite(n) && loadString(LS_KEYS.TEMPERATURE) !== "" ? n : 0.5;
  });
  const [availableModels, setAvailableModels] = useState<any[]>([]);

  // Workspace Files
  // 🔧 CORRECCIÓN CRÍTICA (bug "editor con un .bat"): solo sembramos INITIAL_WORKSPACE_FILES
  // en el PRIMER arranque (cuando WORKSPACE_SEEDED no existe). Si el usuario ya tiene
  // un workspace persistido (aunque sea un solo archivo .bat), respetamos eso y NO
  // forzamos la plantilla base. Esto evita el bug "borro y se regenera".
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>(() => {
    const alreadySeeded = loadString(LS_KEYS.WORKSPACE_SEEDED) === "1";
    const stored = loadJSON<WorkspaceFile[] | null>(LS_KEYS.WORKSPACE_FILES, null);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      // Respetamos el workspace persistido del usuario (incluso si tiene 1 solo archivo)
      return stored;
    }
    if (!alreadySeeded) {
      // Primera vez: sembrar plantilla base y marcar como sembrado
      try { saveString(LS_KEYS.WORKSPACE_SEEDED, "1"); } catch {}
      return INITIAL_WORKSPACE_FILES;
    }
    // Ya estaba marcado como sembrado pero el workspace está vacío: devolver array vacío
    // (no forzar la plantilla — el usuario eligió borrar todo en una sesión anterior).
    return [];
  });
  // Espejo de `workspaceFiles` para poder LEER los archivos actuales desde código
  // asíncrono sin meter efectos dentro del actualizador de `setWorkspaceFiles`.
  // Un actualizador debe ser PURO: React lo puede invocar dos veces (StrictMode) y
  // cualquier `setState` de dentro se duplicaría — líneas repetidas en el registro.
  const workspaceFilesRef = useRef<WorkspaceFile[]>(workspaceFiles);
  workspaceFilesRef.current = workspaceFiles;
  const [activeFileId, setActiveFileId] = useState<string | null>(
    () => {
      const stored = loadJSON<WorkspaceFile[] | null>(LS_KEYS.WORKSPACE_FILES, null);
      if (stored && stored.length > 0) {
        const mem = stored.find((f) => f.id === "f-memoria");
        if (mem) return "f-memoria";
        return stored[0]?.id ?? null;
      }
      return "f-memoria";
    }
  );

  // Pending Attachments & Message Queue
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentItem[]>([]);
  /**
   * v8.0.3 — Nombres de los adjuntos que aún se están procesando.
   *
   * Existe porque el defecto de fondo no era el icono: `handleAddAttachments`
   * acumulaba TODO en un array local y lo volcaba al estado UNA sola vez al
   * terminar el bucle. Con treinta imágenes, la tira de adjuntos se quedaba
   * vacía treinta veces el tiempo de una, y luego aparecían las treinta de golpe.
   * Desde fuera eso se ve como «el IDE se ha colgado», y el usuario no tiene
   * forma de saber cuál de los treinta archivos está atascando la cola.
   *
   * Con esta lista, cada archivo que entra en el bucle aparece YA en pantalla
   * como chip fantasma con su nombre, y se retira en cuanto su miniatura está
   * lista. Se ve qué falta y qué ya está.
   */
  const [attachmentsCargando, setAttachmentsCargando] = useState<string[]>([]);
  const [messageQueue, setMessageQueue] = useState<QueuedMessageItem[]>([]);
  const messageQueueRef = useRef<QueuedMessageItem[]>([]);
  messageQueueRef.current = messageQueue;
  const isStreamingRef = useRef(false);
  isStreamingRef.current = isStreaming;
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const currentModelRef = useRef(currentModel);
  currentModelRef.current = currentModel;

  // Bucle autónomo de compilación (compila -> corrige -> recompila)
  const afterStreamRef = useRef<(() => void) | null>(null);
  const buildFixRef = useRef<{ active: boolean; iteration: number; max: number }>({
    active: false,
    iteration: 0,
    max: 5,
  });

  // Persistencia de sesión: historial, workspace y ajustes sobreviven a recargas
  useEffect(() => {
    saveJSON(LS_KEYS.MESSAGES, messages);
  }, [messages]);

  useEffect(() => {
    saveJSON(LS_KEYS.SAVED_CHATS, savedChats);
  }, [savedChats]);

  useEffect(() => {
    saveString(LS_KEYS.ACTIVE_CHAT_TITLE, activeChatTitle);
  }, [activeChatTitle]);

  useEffect(() => {
    saveJSON(LS_KEYS.WORKSPACE_FILES, workspaceFiles);
  }, [workspaceFiles]);

  useEffect(() => {
    saveString(LS_KEYS.CURRENT_MODEL, currentModel);
    saveString(LS_KEYS.TEMPERATURE, String(temperature));
    saveString(LS_KEYS.PROVIDER, provider);
    saveString(LS_KEYS.PC_MODE, pcMode ? "1" : "0");
  }, [currentModel, temperature, provider, pcMode]);

  // 🔧 Persistencia de API keys (Gemini + OpenRouter + OpenAI) en localStorage
  useEffect(() => {
    saveString(LS_KEYS.OPENROUTER_KEY, openrouterApiKey);
  }, [openrouterApiKey]);
  useEffect(() => {
    saveString(LS_KEYS.GEMINI_API_KEY, geminiApiKey);
  }, [geminiApiKey]);
  useEffect(() => {
    saveString(LS_KEYS.OPENAI_API_KEY, openaiApiKey);
  }, [openaiApiKey]);

  // UI Panels & Resizable Desplazadores (Splitters)
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    const saved = loadString(LS_KEYS.LEFT_WIDTH);
    return saved ? Math.max(220, Math.min(600, Number(saved))) : 320;
  });
  const [rightWidth, setRightWidth] = useState<number>(() => {
    const saved = loadString(LS_KEYS.RIGHT_WIDTH);
    return saved ? Math.max(300, Math.min(850, Number(saved))) : 540;
  });
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  const [maxRamGb, setMaxRamGb] = useState<number>(8);
  const [ramUsageMb, setRamUsageMb] = useState<number>(76);

  // v1.1 — Asistente de bienvenida Z.ai (se muestra al primer arranque si no hay clave Z.ai).
  //   El usuario lo puede cerrar ("Saltar por ahora") y volver a abrirlo desde el botón
  //   de la izquierda del panel de chat. La clave Z.ai es gratuita (sin tarjeta).
  const [isZaiWizardOpen, setIsZaiWizardOpen] = useState<boolean>(() => {
    try {
      const dismissed = localStorage.getItem(LS_KEYS.ZAI_WIZARD_DISMISSED) === "1";
      return !dismissed;
    } catch {
      return true;
    }
  });

  // 🔧 Modo de vista: 'ide' (3 columnas) | 'web-editor' (pantalla completa dedicada)
  // v2.0 — 'web-editor' ya no sustituye la interfaz: vive como PESTAÑA central.
  const [activeView, setActiveView] = useState<"ide" | "web-editor">("ide");

  // ============================================================
  // v2.0 — ESTADO NUEVO DEL HÍBRIDO
  // ============================================================

  /** Tamaño global de texto (v1.9): escala TODA la app desde <html> */
  const [appFontSize, setAppFontSize] = useState<number>(() => {
    const saved = loadString(LS_KEYS.APP_FONT_SIZE);
    const n = saved ? Number(saved) : NaN;
    // v1.6.16 — los topes se leen de APP_FONT_SIZES en vez de ir escritos a
    // mano. Antes eran literales (14 y 25) duplicados en dos sitios, y al
    // ampliar el rango por abajo el literal se habría quedado recortando el
    // valor guardado sin que nadie se enterara.
    const min = APP_FONT_SIZES[0];
    const max = APP_FONT_SIZES[APP_FONT_SIZES.length - 1];
    return Number.isFinite(n) && n >= min && n <= max ? n : APP_FONT_SIZE_DEFAULT;
  });

  /** Modo 8 GB: sin backdrop-blur ni animaciones infinitas (menos GPU/CPU) */
  const [perfMode, setPerfMode] = useState<"auto" | "8gb">(() =>
    loadString(LS_KEYS.PERF_MODE) === "8gb" ? "8gb" : "auto"
  );

  /** Configuración pro (menú de la 1.8, portado) */
  const [proSettings, setProSettings] = useState<ProSettings>(() => loadProSettings());
  const [isProConfigOpen, setIsProConfigOpen] = useState(false);
  /** v2.0 — Gestor de extensiones */
  const [isExtensionManagerOpen, setIsExtensionManagerOpen] = useState(false);
  const [wallpaperPreset, setWallpaperPreset] = useState<string>(() => {
    const saved = loadString("codigo0_wallpaper_preset");
    // v1.15.1 — el cerebro por defecto ahora es el preset "predeterminado", no
    // "aurora": así el fondo por defecto es el de siempre y el panel Pro puede
    // cambiarlo de verdad.
    return saved && WALLPAPER_PRESETS.some((p) => p.id === saved) ? saved : "predeterminado";
  });

  /** Ventana de memoria de conversación: mensajes recientes íntegros (>50 por defecto) */
  const [historyWindow, setHistoryWindow] = useState<number>(() => {
    const saved = loadString("codigo0_history_window");
    const n = saved ? Number(saved) : NaN;
    return Number.isFinite(n) && n >= 10 ? n : 60;
  });

  /** Carpeta de modelos favoritos (v2.0) */
  const [favoriteModels, setFavoriteModels] = useState<FavoriteModel[]>(() => loadFavoriteModels());

  /** Extensiones instaladas + pestañas centrales */
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [centerTabs, setCenterTabs] = useState<CenterTab[]>([
    { id: "chat", label: "Chat", kind: "chat", pinned: true },
    // v2.0 — La autosuperación es una pestaña fija: siempre visible, siempre medible.
    { id: "self-improvement", label: "Superación", kind: "custom", pinned: true },
    // v2.2 — El cerebro de tareas, también fijo: si no se ve, no se usa.
    { id: "planes", label: "Planificador", kind: "custom", pinned: true },
    // QUIRÓFANO HD v1 — misma ley: el guardián de cambios se ve y se toca.
    { id: "quirofano", label: "Quirófano", kind: "custom", pinned: true },
  ]);
  const [activeCenterTab, setActiveCenterTab] = useState<string>("chat");
  const activeCenterTabRef = useRef<string>("chat");
  activeCenterTabRef.current = activeCenterTab;

  /** Comando de extensión pendiente (viene de "/comando" escrito en el chat) */
  const [pendingExtCommand, setPendingExtCommand] = useState<{ extId: string; commandId: string } | null>(null);

  /** Estado real del editor web (alimenta el indicador del panel) */
  const [webEditorStatus, setWebEditorStatus] = useState<WebEditorStatus>({ phase: "idle" });
  const webEditorOrderRef = useRef(false);

  /** Pantalla completa del contenedor principal (botón del Header) */
  const [isAppFullscreen, setIsAppFullscreen] = useState(false);

  /** ¿Está vivo el sandbox :3500? Se consulta cada 15 s para poder explicar un
      preview vacío en el editor web en vez de mostrar un rectángulo blanco. */
  /**
   * v8.0.3 — 🐞 ESTE ESTADO ESTABA MUERTO Y MENTÍA.
   *
   * Estaba declarado con valor inicial `true` y **`setSandboxRunning` no se
   * llamaba en ningún sitio del proyecto**. Es decir: el editor web recibía
   * siempre «sandbox activo», pintaba el punto en verde y no mostraba el aviso
   * de «no está corriendo» — justo el aviso que existía para explicar el preview
   * en blanco. Un indicador fijo en verde tapando el único fallo que tenía que
   * anunciar, que es de las peores cosas que puede hacer un indicador.
   *
   * Ahora se pregunta de verdad y se refresca cada 6 s. El `false` inicial es
   * deliberado: si al arrancar la IDE el sandbox no está, es más honesto empezar
   * en «no» y corregir cuando responda, que empezar en «sí» y no corregir nunca.
   */
  const [sandboxRunning, setSandboxRunning] = useState<boolean>(false);

  /** 🐞 v2.0 — Evita que la autodetección de Z.ai vuelva a pisar el modelo elegido. */
  const zaiAutoSelectRef = useRef<boolean>(false);

  /** v2.0 — Pantalla de carga inicial (se cierra sola al terminar el arranque). */
  const [isBooting, setIsBooting] = useState(true);

  /** Espejo del tamaño de fuente para el zoom con Ctrl+rueda (evita cierres obsoletos). */
  const appFontSizeRef = useRef<number>(appFontSize);
  useEffect(() => {
    appFontSizeRef.current = appFontSize;
  }, [appFontSize]);

  /**
   * v2.0 — ZOOM CON Ctrl + RUEDA (el ajuste de la v1.1: era infaltable).
   * ------------------------------------------------------------
   * Se aplica al tamaño de fuente global de <html>, y como todo el layout usa
   * rem, escala la interfaz COMPLETA sin descolocar los paneles
   * redimensionables ni el iframe del previsualizador.
   *   Ctrl + rueda  → subir / bajar
   *   Ctrl + 0      → volver al 100 %
   *   Ctrl + +/-    → lo mismo desde el teclado
   */
  useEffect(() => {
    const STEPS = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const clamp = (n: number) => Math.max(0, Math.min(STEPS.length - 1, n));
    const index = () => {
      const i = STEPS.indexOf(appFontSizeRef.current);
      return i < 0 ? STEPS.indexOf(15) : i;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const next = STEPS[clamp(index() + (e.deltaY < 0 ? 1 : -1))];
      if (next !== appFontSizeRef.current) setAppFontSize(next);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const k = e.key;
      if (k === "0") {
        e.preventDefault();
        setAppFontSize(15);
      } else if (k === "=" || k === "+") {
        e.preventDefault();
        setAppFontSize(STEPS[clamp(index() + 1)]);
      } else if (k === "-" || k === "_") {
        e.preventDefault();
        setAppFontSize(STEPS[clamp(index() - 1)]);
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // ============================================================
  // v2.0 — AUTOSUPERACIÓN: telemetría del prompt y del turno
  // ============================================================
  const [promptInfoState, setPromptInfoState] = useState<PromptInfo | null>(null);
  const [lastLesson, setLastLesson] = useState<Lesson | null>(null);
  const [improvementSummary, setImprovementSummary] = useState(() => getImprovementSummary());
  /** Inicio del turno actual y tiempo hasta el primer token (ms) */
  const turnStartRef = useRef<number>(0);
  const firstTokenRef = useRef<number>(0);

  /**
   * Herramientas que el prompt anuncia al modelo. Se derivan del PERFIL, no de
   * una lista fija: a un modelo micro no se le prometen herramientas (se lo
   * diríamos y no podría usarlas), y a uno grande se le enumeran todas.
   */
  const agentToolsHint = React.useMemo(() => {
    const profile = getModelProfile(currentModel);
    if (!profile.toolCapable) return [];
    return [
      "set_plan", "update_task", "list_files", "read_file", "read_file_range",
      "write_file", "edit_file", "append_file", "search_in_files", "make_dir",
      "delete_file", "run_command", "run_tests", "git_status", "git_diff",
      "git_commit", "fetch_url",
      ...(pcMode ? ["pc_info", "pc_exec", "pc_write_file", "pc_read_file", "pc_list_dir", "pc_delete"] : []),
    ];
  }, [currentModel, pcMode]);

  // 🔧 ConfigModal: Panel de Control y Compatibilidad
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [ideConfig, setIdeConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("cerebronico_settings");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      autoSync: true,
      slmDetection: true,
      streamResponse: true,
      sandboxPort: "3500",
      ollamaUrl: DEFAULT_OLLAMA_URL,
      themeMode: "dark",
    };
  });

  const handleUpdateConfig = (updates: Partial<typeof ideConfig>) => {
    setIdeConfig((prev: typeof ideConfig) => {
      const next = { ...prev, ...updates };
      try { localStorage.setItem("cerebronico_settings", JSON.stringify(next)); } catch {}
      // 🔧 Aplicar cambios en vivo:
      if (updates.ollamaUrl !== undefined) {
        setOllamaUrl(updates.ollamaUrl);
        saveString(LS_KEYS.OLLAMA_URL, updates.ollamaUrl);
      }
      if (updates.slmDetection !== undefined) {
        // Si se desactiva SLM, resetear el estado SLM
        if (!updates.slmDetection) {
          slmInfoRef.current = { isSLM: false, estimatedBillionParams: null, recommendedContextWindow: 8192, reason: "Detector SLM desactivado", category: "unknown" };
          setSlmState({ isSLM: false, category: "unknown", params: null });
        } else {
          // Si se activa, recalcular
          const info = detectSLM(currentModelRef.current);
          slmInfoRef.current = info;
          setSlmState({ isSLM: info.isSLM, category: info.category, params: info.estimatedBillionParams });
        }
      }
      if (updates.themeMode !== undefined) {
        // Aplicar tema
        if (updates.themeMode === "glass") {
          document.body.classList.add("glass-mode");
        } else {
          document.body.classList.remove("glass-mode");
        }
      }
      return next;
    });
  };

  // 🔧 Fondo de pantalla personalizado (imagen del cerebro subida por el usuario)
  // 🔧 Usamos IndexedDB (no localStorage) porque las imágenes pesan 1-5 MB y
  // localStorage se llena ("QuotaExceededError"). IndexedDB es persistente y sin límite práctico.
  // v1.15.1 — El fondo por defecto (el cerebro) ya NO es una imagen
  // "personalizada" embebida a mano: ahora es el preset «predeterminado» de
  // WALLPAPER_PRESETS. `customBg` queda RESERVADO para la imagen que el usuario
  // sube de verdad (menú CN o «Imagen propia» del panel Pro). Con el valor
  // antiguo, `customBg` siempre estaba lleno y AppBackground le daba prioridad
  // sobre todo el panel Pro → el menú Pro de fondo «no andaba».
  const [customBg, setCustomBg] = useState<string>("");

  // v1.7.1 — LA URL DE OBJETO DEL FONDO SE GUARDA PARA PODER SOLTARLA.
  // El fondo se guarda como Blob (para que 100 MB sean posibles), y un Blob se
  // pinta con `URL.createObjectURL`: mientras esa URL viva, el navegador retiene
  // el archivo ENTERO en memoria. Cambiar de fondo sin soltar la anterior deja
  // el anterior cargado: con fondos de decenas de MB eso se nota, y sólo aparece
  // cuando alguien sube el límite — nunca antes.
  const fondoUrlRef = useRef<string>("");
  const bgInputRef = useRef<HTMLInputElement>(null);

  // Al iniciar: migrar de localStorage (versiones viejas) y cargar desde IndexedDB
  useEffect(() => {
    (async () => {
      await migrateBackgroundFromLocalStorage();
      const img = await loadBackgroundImage();
      if (img) {
        // v1.7.1 — `img` puede ser un Blob (lo nuevo) o un data URL (lo viejo):
        // `urlDeFondo` resuelve los dos casos.
        const url = urlDeFondo(img);
        fondoUrlRef.current = url;
        setCustomBg(url);
      }
    })();
    // Al desmontar, la URL de objeto se libera: si no, el fondo se queda en
    // memoria mientras la pestaña viva.
    return () => revocarFondo(fondoUrlRef.current);
  }, []);

  // ─── v1.9.0 · EL WORKSPACE YA NO SE PIERDE AL PASAR DE 5 MB ───────────────
  // Causa raíz: `saveJSON` avisaba por consola y no devolvía nada, así que el
  // IDE seguía como si hubiera guardado. Ahora `storage.ts` rescata al almacén
  // grande (IndexedDB) y deja un puntero. `loadJSON` es síncrono y no puede
  // esperar a IndexedDB, así que el valor real vuelve AQUÍ: sin este efecto, el
  // rescate sería otro sitio donde perderse.
  useEffect(() => {
    void (async () => {
      try {
        const grandes = await restaurarDeAlmacenGrande([
          LS_KEYS.WORKSPACE_FILES,
          LS_KEYS.MESSAGES,
          LS_KEYS.SAVED_CHATS,
        ]);
        const claves = Object.keys(grandes);
        if (claves.length === 0) return;
        if (grandes[LS_KEYS.WORKSPACE_FILES]) setWorkspaceFiles(grandes[LS_KEYS.WORKSPACE_FILES] as WorkspaceFile[]);
        if (grandes[LS_KEYS.MESSAGES]) setMessages(grandes[LS_KEYS.MESSAGES] as ChatMessage[]);
        if (grandes[LS_KEYS.SAVED_CHATS]) setSavedChats(grandes[LS_KEYS.SAVED_CHATS] as SavedChat[]);
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] 🗄️ Recuperados del almacén grande ${claves.length} conjunto(s) que no cabían en localStorage.`,
        ]);
      } catch {
        // Si el almacén grande no está, se sigue con lo que haya: no se finge.
      }
    })();
  }, []);

  // ─── v1.9.0 · Y SI ALGO NO SE PUDO GUARDAR, SE DICE ──────────────────────
  // Este es el canal que antes no existía: la interfaz se entera de un fallo de
  // guardado. Antes solo lo sabía la consola del navegador, que nadie mira.
  useEffect(() => {
    return alFallarGuardado((r) => {
      const mb = (r.bytes / 1048576).toFixed(2);
      const sello = `[${new Date().toLocaleTimeString()}]`;
      setTerminalLogs((prev) =>
        r.ok
          ? [...prev, `${sello} 🗄️ «${r.clave}» (${mb} MB) no cabía en localStorage: guardado en el almacén grande.`]
          : [...prev, `${sello} ⚠️ NO se pudo guardar «${r.clave}» (${mb} MB): ${r.motivo}. ${r.detalle || ""}`]
      );
    });
  }, []);

  // Aplicar/quitar el fondo del body
  useEffect(() => {
    if (customBg) {
      document.body.style.backgroundImage = `url("${customBg}")`;
      document.body.classList.add("has-brain-bg");
    } else {
      document.body.style.backgroundImage = "";
      document.body.classList.remove("has-brain-bg");
    }
  }, [customBg]);

  // ============================================================
  // v2.0 — TRANSPARENCIA DEL MÓDULO Y EL CHAT
  // ------------------------------------------------------------
  // El chat se veía rosado porque su fondo translúcido se mezclaba con la imagen
  // de fondo. Este valor (deslizador en el panel Pro → Fondo) decide cuánto se
  // transparentan los paneles, el chat, el explorador y el editor. Se expone como
  // variable CSS para que lo use una sola regla, sin tocar cada componente.
  // ============================================================
  useEffect(() => {
    const valor = (proSettings as any)?.wallpaper?.moduleOpacity;
    const n = typeof valor === "number" ? valor : 0.55;
    document.documentElement.style.setProperty("--cn-module-opacity", String(Math.max(0, Math.min(1, n))));
  }, [proSettings]);

  // ============================================================
  // v2.0 — 🐞 "en la pantalla principal del IDE no se ve el fondo, en el editor
  // web sí".
  // ------------------------------------------------------------
  // La imagen SÍ se estaba pintando (capa fija z-0 y fondo del body), pero los
  // paneles de la IDE son casi opacos (bg-[#...]/85, /90 + backdrop-blur) y la
  // tapaban por completo; en la pestaña del editor web el lienzo es transparente
  // y por eso ahí se veía.
  // Con este atributo, las reglas de index.css bajan la opacidad de esos paneles
  // y el fondo se ve en TODA la IDE, sin perder legibilidad del texto.
  // ============================================================
  useEffect(() => {
    const html = document.documentElement;
    const hasPreset = proSettings?.wallpaper?.enabled !== false;
    const active = !!customBg || hasPreset;
    if (active) html.dataset.wallpaper = "on";
    else delete html.dataset.wallpaper;
  }, [customBg, proSettings]);

  const handleOpenBgPicker = () => {
    bgInputRef.current?.click();
  };

  const handleBgFileSelected = (file: File) => {
    // v8.0.1 — GIF soportado de verdad, no de boquilla.
    const esGif = file.type === "image/gif" || /\.gif$/i.test(file.name);
    if (!file.type.startsWith("image/")) {
      alert("El archivo debe ser una imagen (PNG, JPG, WEBP o GIF).");
      return;
    }

    // ────────────────────────────────────────────────────────────
    // v8.0.1 — DEFECTO CAZADO: «no admite gif»
    // ------------------------------------------------------------
    // El GIF sí entraba por el `if` de arriba (`image/gif` empieza por
    // `image/`), pero moría dos líneas más abajo: se pintaba en un canvas y se
    // re-codificaba con `toDataURL("image/jpeg")`. Un canvas tiene UN fotograma,
    // así que el resultado era el PRIMER cuadro del GIF convertido a JPEG
    // inmóvil. El usuario veía «no admite gif» y tenía razón: lo aceptaba y lo
    // destrozaba, que es peor que rechazarlo.
    //
    // Un GIF animado no puede pasar por canvas nunca. La ruta correcta es subir
    // el dataURL ORIGINAL tal cual: el navegador anima un GIF en
    // `background-image` igual que en un <img>, sin que el motor tenga que
    // decodificarlo ni una vez.
    // ────────────────────────────────────────────────────────────
    if (esGif) {
      // v1.6.8 — 🐞 «no pude colocar un gif, me dice que solo admite hasta 4 MB».
      //
      // El 4 MB era una ADUANA: por encima se rechazaba y no había forma de
      // ponerlo. Ahora es un AVISO con techo duro muy por encima (48 MB), así
      // que la decisión vuelve a ser del usuario — que es quien tiene la máquina
      // delante. Solo se rechaza cuando de verdad dejaría de funcionar.
      const nivelGif = evaluarPesoAnimado("gif", file.size);
      if (nivelGif === "rechazo") {
        alert(mensajePesoAnimado("gif", file.size));
        return;
      }
      if (nivelGif === "aviso") {
        const seguir = confirm(`${mensajePesoAnimado("gif", file.size)}\n\n¿Ponerlo igualmente?`);
        if (!seguir) return;
      }
      // v1.7.1 — SE GUARDA EL ARCHIVO TAL CUAL (Blob), no un data URL.
      // Antes esto pasaba por FileReader → base64 (+33 %) → cadena de texto en
      // IndexedDB. Con un GIF de decenas de MB, lo que fallaba era eso: la
      // conversión y la cadena, no el disco. El Blob se guarda binario, el
      // navegador lo pinta con la animación intacta, y por eso el techo de
      // 100 MB es una cifra real y no un deseo.
      //
      // El IIFE async no es adorno: `handleBgFileSelected` NO es async, y el
      // `await` suelto no compila (TS1308). Y no se hace async la función entera
      // a propósito: el manejador tiene DOS caminos (GIF y foto) y el de la foto
      // sigue necesitando el FileReader para medir la imagen.
      void (async () => {
        try {
          await saveBackgroundImage(file);
          const url = urlDeFondo(file);
          revocarFondo(fondoUrlRef.current);
          fondoUrlRef.current = url;
          setCustomBg(url);
          setTerminalLogs((prev) => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] 🖼️ Fondo GIF aplicado (${(file.size / 1048576).toFixed(2)} MB, animación original conservada).`,
          ]);
        } catch (err: any) {
          alert(`No se pudo guardar el fondo en IndexedDB: ${err?.message || err}`);
        }
      })();
      return;
    }

    // 🔧 Re-escalar la imagen con canvas para optimizar (max 1920px, JPEG 0.85)
    // (solo para fotos: un GIF animado se habría quedado en su primer cuadro)
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const maxDim = 1920;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          alert("No se pudo procesar la imagen.");
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        // v1.7.1 — A BLOB, NO A DATA URL: mismo cambio que en el GIF.
        // Aquí además la imagen ya viene re-escalada a 1920 px, así que una foto
        // de 100 MB entra por aquí convertida en un JPEG pequeño: el techo alto
        // sirve sobre todo para GIF y vídeo, que no se re-escalan.
        canvas.toBlob(async (blob) => {
          if (!blob) {
            alert("No se pudo procesar la imagen.");
            return;
          }
          try {
            // Guardar en IndexedDB (sin límite práctico, no llena localStorage)
            await saveBackgroundImage(blob);
            const url = urlDeFondo(blob);
            revocarFondo(fondoUrlRef.current);
            fondoUrlRef.current = url;
            setCustomBg(url);
            setTerminalLogs((prev) => [
              ...prev,
              `[${new Date().toLocaleTimeString()}] 🖼️ Fondo de pantalla aplicado (${w}x${h}, ${(blob.size / 1048576).toFixed(2)} MB en IndexedDB).`,
            ]);
          } catch (err: any) {
            alert(`No se pudo guardar el fondo en IndexedDB: ${err?.message || err}`);
          }
        }, "image/jpeg", 0.85);
      };
      img.onerror = () => alert("No se pudo cargar la imagen. ¿Archivo corrupto?");
      img.src = reader.result as string;
    };
    reader.onerror = () => alert("No se pudo leer el archivo.");
    reader.readAsDataURL(file);
  };

  const handleClearBg = async () => {
    await clearBackgroundImage();
    setCustomBg("");
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🖼️ Fondo de pantalla quitado (IndexedDB limpiado).`,
    ]);
  };

  // ============================================================
  // 🔧 SISTEMA DE PUNTOS DE RESTAURACIÓN (snapshots en memoria)
  // ============================================================
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const refreshSnapshots = useCallback(() => setSnapshots(listSnapshots()), []);

  const handleCreateSnapshot = useCallback((label?: string) => {
    const snap = createSnapshot(workspaceFiles, {
      currentModel,
      provider,
      temperature,
      messageCount: messages.length,
      label: label || `Snapshot ${new Date().toLocaleTimeString()}`,
    });
    refreshSnapshots();
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 📸 Punto de restauración creado: "${snap.label}" (${workspaceFiles.length} archivos).`,
    ]);
    return snap;
  }, [workspaceFiles, currentModel, provider, temperature, messages.length, refreshSnapshots]);

  const handleRestoreSnapshot = useCallback((id: string) => {
    const snap = restoreSnapshot(id);
    if (!snap) {
      alert("No se encontró el snapshot.");
      return;
    }
    if (!window.confirm(`¿Restaurar el snapshot "${snap.label}"?\n\nEsto reemplazará el workspace actual (${workspaceFiles.length} archivos) por el snapshot (${snap.files.length} archivos).\n\nSe creará un snapshot del estado actual antes de restaurar.`)) return;
    // Crear snapshot del estado actual antes de restaurar (por si el usuario quiere volver)
    createSnapshot(workspaceFiles, {
      currentModel, provider, temperature, messageCount: messages.length,
      label: `Antes de restaurar ${snap.label}`,
    });
    setWorkspaceFiles(snap.files);
    setActiveFileId(snap.files[0]?.id ?? null);
    setCurrentModel(snap.currentModel);
    setProvider(snap.provider);
    setTemperature(snap.temperature);
    refreshSnapshots();
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ⏪ Snapshot restaurado: "${snap.label}" — ${snap.files.length} archivos.`,
    ]);
  }, [workspaceFiles, currentModel, provider, temperature, messages.length, refreshSnapshots]);

  const handleDeleteSnapshot = useCallback((id: string) => {
    deleteSnapshot(id);
    refreshSnapshots();
  }, [refreshSnapshots]);

  // Crear snapshot automático cuando cambia significativamente el workspace
  // (después de importar .cn, borrar todo, o restaurar plantilla).
  const lastSnapshotFileCountRef = useRef(workspaceFiles.length);
  useEffect(() => {
    const prevCount = lastSnapshotFileCountRef.current;
    const currCount = workspaceFiles.length;
    // Solo crear snapshot si el cambio es grande (>5 archivos o cambia de vacío a lleno)
    if (Math.abs(currCount - prevCount) > 5 || (prevCount === 0 && currCount > 0)) {
      handleCreateSnapshot(`Auto: ${prevCount} → ${currCount} archivos`);
      lastSnapshotFileCountRef.current = currCount;
    }
  }, [workspaceFiles.length, handleCreateSnapshot]);

  // ============================================================
  // 🔧 HISTORIAL DE PROMPTS FAVORITOS
  // ============================================================
  const [favoritePrompts, setFavoritePrompts] = useState<FavoritePrompt[]>([]);
  const [showFavoritesPanel, setShowFavoritesPanel] = useState(false);
  const [showSnapshotsPanel, setShowSnapshotsPanel] = useState(false);

  useEffect(() => {
    let favs = loadFavoritePrompts();
    // Si es la primera vez (sin favoritos), cargar los defaults
    if (favs.length === 0) {
      DEFAULT_FAVORITE_PROMPTS.forEach((p) => {
        addFavoritePrompt(p.title, p.content, p.category);
      });
      favs = loadFavoritePrompts();
    }
    setFavoritePrompts(favs);
  }, []);

  const refreshFavorites = useCallback(() => setFavoritePrompts(loadFavoritePrompts()), []);

  const handleAddFavorite = useCallback((title: string, content: string, category: FavoritePrompt["category"] = "custom") => {
    addFavoritePrompt(title, content, category);
    refreshFavorites();
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ⭐ Prompt favorito añadido: "${title}".`,
    ]);
  }, [refreshFavorites]);

  const handleUseFavorite = useCallback((fav: FavoritePrompt, onInject: (text: string) => void) => {
    markPromptUsed(fav.id);
    refreshFavorites();
    onInject(fav.content);
    setShowFavoritesPanel(false);
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ⭐ Prompt favorito inyectado: "${fav.title}" (usado ${fav.useCount + 1} vez/veces).`,
    ]);
  }, [refreshFavorites]);

  const handleDeleteFavorite = useCallback((id: string) => {
    deleteFavoritePrompt(id);
    refreshFavorites();
  }, [refreshFavorites]);

  // ============================================================
  // 🔧 MONITOR DE RECURSOS EN VIVO (CPU/RAM del server)
  // ============================================================
  const [systemStats, setSystemStats] = useState<{ ide: { rssMb: number; heapUsedMb: number; cpuPercent: number; uptimeSec: number }; sandbox: { running: boolean }; machine?: { cpuPercent: number | null; totalRamMb: number; freeRamMb: number; cores: number } } | null>(null);
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/system/stats");
        if (res.ok) {
          const data = await res.json();
          setSystemStats(data);
        }
      } catch {}
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // ============================================================
  // 🔧 MOTOR DE AUTODIAGNÓSTICO (Self-Healing)
  // ============================================================
  useEffect(() => {
    installGlobalErrorHandler();
  }, []);

  // ============================================================
  // 🔧 RAG LOCAL: indexar archivos .txt/.md/.pdf del workspace
  // ============================================================
  const [indexedDocs, setIndexedDocs] = useState<{ file: string; chunks: number; words: number }[]>([]);
  const refreshIndexedDocs = useCallback(() => setIndexedDocs(listIndexedDocuments()), []);

  // Indexar automáticamente archivos .md/.txt del workspace
  useEffect(() => {
    const raggable = workspaceFiles.filter((f) => {
      const ext = f.path.split(".").pop()?.toLowerCase();
      return (ext === "md" || ext === "txt") && f.content.length > 100;
    });
    // Reindexar solo si cambió el número de archivos raggables (evita reindexar en cada keystroke)
    if (raggable.length > 0 && raggable.length !== indexedDocs.length) {
      raggable.forEach((f) => indexDocument(f.name, f.content));
      refreshIndexedDocs();
    }
  }, [workspaceFiles, indexedDocs.length, refreshIndexedDocs]);

  // 🔧 Inyectar contexto RAG al prompt antes de enviar al modelo.
  // 🔧 SLM: si el modelo activo es pequeño, usar chunks reducidos + reglas anti-alucinación.
  // 🔧 EvolutionDB: inyectar lecciones históricas (3 para SLMs, 5 para modelos grandes).
  // 🔧 Declarado después de handleSendMessage (ver más abajo) — se asigna con useRef
  // para evitar el error de "used before declaration".
  const handleSendMessageWithRAGRef = useRef<(text: string, attachments: AttachmentItem[]) => void>(() => {});
  // v2.6.1 — «el chat central no anda»: un envío desde el Chat es, por
  // definición, NO del editor. Este envoltorio limpia el flag y destraba una
  // fase envenenada por una orden anterior del Editor web (el ref se quedaba
  // true cuando el motor fallaba sin ruta de error: el chat entonces no
  // publicaba tus mensajes y el texto del modelo se esfumaba). El antídoto
  // no espera a un reinicio: el siguiente mensaje desde el chat destraba todo.
  const sendDesdeChat = (text: string, attachments?: AttachmentItem[]) => {
    webEditorOrderRef.current = false;
    setWebEditorStatus((s) => (s.phase === "sending" || s.phase === "streaming" ? { phase: "idle", message: "" } : s));
    // 🐞 FIX «Encolar corta la generación»: el envío del chat llegaba directo a
    // handleSendMessageWithRAG, que NO consulta isStreamingRef y arrancaba un
    // stream nuevo → abortaba el texto que el modelo estaba escribiendo. Ahora,
    // si está generando, se encola de verdad y la generación actual no se toca.
    if (isStreamingRef.current) {
      const queuedItem: QueuedMessageItem = {
        id: "queue-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        text,
        attachments: [...(attachments || [])],
        timestamp: Date.now(),
      };
      setMessageQueue((prev) => [...prev, queuedItem]);
      return;
    }
    handleSendMessageWithRAGRef.current(text, attachments || []);
  };
  const slmInfoRef = useRef(detectSLM(currentModel));
  const slmWarningRef = useRef<string | null>(getSLMUserWarning(slmInfoRef.current));
  // 🔧 Estado para forzar re-render del Header cuando cambia el SLM info
  const [slmState, setSlmState] = useState({ isSLM: slmInfoRef.current.isSLM, category: slmInfoRef.current.category, params: slmInfoRef.current.estimatedBillionParams });

  // Recalcular SLM info cuando cambia el modelo activo
  useEffect(() => {
    const info = detectSLM(currentModel);
    slmInfoRef.current = info;
    const warning = getSLMUserWarning(info);
    slmWarningRef.current = warning;
    setSlmState({ isSLM: info.isSLM, category: info.category, params: info.estimatedBillionParams });
    if (warning) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ${warning}`,
      ]);
    }
    // 🐞 Aviso explícito: los modelos locales <4B NO saben usar herramientas
    // (tool-calling). Sin este aviso, el modelo responde con texto genérico y
    // parece "que no sabe usar el sistema" cuando en realidad el sistema ya le
    // quitó las herramientas a propósito para que no se cuelgue.
    const perfil = getModelProfile(currentModel);
    if (!perfil.remote && !perfil.toolCapable) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🧰 Sin herramientas: «${currentModel}» (${perfil.paramsB ?? "?"}B) no puede usar las herramientas del sistema (tool-calling). Para tareas de agente usa un modelo ≥4B, p. ej. qwen2.5:7b o llama3.1:8b.`,
      ]);
    }
  }, [currentModel]);

  // ============================================================
  // 🔧 EXPORTAR A MARKDOWN / INFORME TÉCNICO
  // ============================================================
  const handleExportMarkdown = useCallback(() => {
    downloadMarkdownReport(messages, workspaceFiles, {
      includeCodeBlocks: true,
      includeWorkspaceTree: true,
      includeFileContents: false,
      // v2.3 — desde la fuente única: este literal «V2.1» era el segundo foco.
      title: `Informe Técnico — ${IDE_BRAND.FULL_NAME}`,
      author: "Mario Nicolas Quintero",
    });
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 📄 Informe Markdown generado (${messages.length} mensajes, ${workspaceFiles.length} archivos).`,
    ]);
  }, [messages, workspaceFiles]);

  // Drag listeners for responsive column resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft) {
        const newWidth = Math.max(200, Math.min(550, e.clientX));
        setLeftWidth(newWidth);
      }
      if (isDraggingRight) {
        const newWidth = Math.max(280, Math.min(window.innerWidth - 300, window.innerWidth - e.clientX));
        setRightWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingLeft || isDraggingRight) {
        setIsDraggingLeft(false);
        setIsDraggingRight(false);
        saveString(LS_KEYS.LEFT_WIDTH, leftWidth.toString());
        saveString(LS_KEYS.RIGHT_WIDTH, rightWidth.toString());
      }
    };

    if (isDraggingLeft || isDraggingRight) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    } else {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight, leftWidth, rightWidth]);

  // ============================================================
  // v2.0 — EFECTOS DEL HÍBRIDO
  // ============================================================

  /** Tamaño global de texto (v1.9): se aplica a <html> y se persiste. */
  useEffect(() => {
    const html = document.documentElement;
    // v1.6.16 — mismo tope que arriba, leído de la fuente única. Con el literal
    // «14» el valor mínimo nuevo (11) se descartaba en silencio: el desplegable
    // lo mostraba pero <html> seguía a 14 px, o sea el fallo de siempre.
    if (appFontSize >= APP_FONT_SIZES[0] && appFontSize <= APP_FONT_SIZES[APP_FONT_SIZES.length - 1]) {
      html.setAttribute("data-app-font-size", String(appFontSize));
      html.style.setProperty("--cn-app-font-size", `${appFontSize}px`);
      try {
        saveString(LS_KEYS.APP_FONT_SIZE, String(appFontSize));
      } catch {}
    }
  }, [appFontSize]);

  /**
   * Modo 8 GB: `html[data-perf-mode="8gb"]` apaga backdrop-filter (lo más caro
   * de la interfaz) y las animaciones infinitas del cerebro. En un equipo de
   * 8 GB el chat repinta en cada token: si además la GPU desenfoca el fondo de
   * tres paneles, el scroll compite con la inferencia.
   */
  useEffect(() => {
    const html = document.documentElement;
    if (perfMode === "8gb") html.setAttribute("data-perf-mode", "8gb");
    else html.removeAttribute("data-perf-mode");
    try {
      saveString(LS_KEYS.PERF_MODE, perfMode);
    } catch {}
  }, [perfMode]);

  /** Configuración pro: variables CSS globales + persistencia. */
  useEffect(() => {
    applyProSettings(proSettings);
    saveProSettings(proSettings);
  }, [proSettings]);

  useEffect(() => {
    saveString("codigo0_wallpaper_preset", wallpaperPreset);
  }, [wallpaperPreset]);

  useEffect(() => {
    saveString("codigo0_history_window", String(historyWindow));
  }, [historyWindow]);

  /**
   * AUTO-FIT DE PANELES AL VIEWPORT (fix de pantalla de la v1.8.1).
   * Si el usuario guardó paneles anchos en una pantalla grande y abre la app en
   * una más chica, los anchos persistidos ya no caben y el panel derecho se
   * cortaba. Aquí se reparte el sobrante de forma proporcional.
   *
   * v2.3.1 — Dos agujeros que devolvían el mismo síntoma («se pierde pantalla
   * hacia la derecha»):
   *   1. Contaba el ancho PERSISTADO de un panel CERRADO (ocupa 0 px reales),
   *      así que robaba reducción al que sí estaba abierto.
   *   2. No corría al abrir/cerrar un panel: el sobrante aparecía al cerrar y
   *      nadie lo repartía hasta el siguiente resize.
   */
  useEffect(() => {
    const fit = () => {
      const lw = isLeftOpen ? leftWidth : 0;
      const rw = isRightOpen ? rightWidth : 0;
      const need = lw + rw + PANEL_LIMITS.CENTER_MIN + PANEL_LIMITS.SPLITTERS + PANEL_LIMITS.SAFETY;
      const excess = need - window.innerWidth;
      if (excess <= 0) return;
      const total = lw + rw;
      if (total <= 0) return; // con todo cerrado no hay a quién reducir
      const reduceLeft = Math.round((lw / total) * excess);
      const reduceRight = Math.round((rw / total) * excess);
      const newLeft = Math.max(PANEL_LIMITS.LEFT_MIN, leftWidth - reduceLeft);
      const newRight = Math.max(PANEL_LIMITS.RIGHT_MIN, rightWidth - reduceRight);
      if (newLeft !== leftWidth) setLeftWidth(newLeft);
      if (newRight !== rightWidth) setRightWidth(newRight);
      try {
        saveString(LS_KEYS.LEFT_WIDTH, String(newLeft));
        saveString(LS_KEYS.RIGHT_WIDTH, String(newRight));
      } catch {}
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // Cambios de ancho Y de qué paneles están abiertos: `fit` corrige y se
    // vuelve a disparar solo
  }, [leftWidth, rightWidth, isLeftOpen, isRightOpen]);

  /** Extensiones: carga inicial y refresco cada vez que se abre una pestaña. */
  const reloadExtensions = useCallback(async () => {
    const list = await fetchExtensions();
    setExtensions(list);
    return list;
  }, []);

  useEffect(() => {
    reloadExtensions().then((list) => {
      if (list.length > 0) {
        setTerminalLogs((l) => [
          ...l,
          `[${new Date().toLocaleTimeString()}] 🧩 ${list.length} extensión(es) detectada(s): ${list.map((e) => e.manifest.id).join(", ")}`,
        ]);
      }
    });
  }, [reloadExtensions]);

  /**
   * v2.0 — EL MOTOR SE ALIMENTA DEL PROYECTO.
   * Se le manda el mapa real de archivos para que lo indexe: así el modelo recibe
   * rutas y lenguajes verdaderos en el contexto en vez de inventarlos (el fallo
   * más caro de los modelos pequeños). Con 1,5 s de retardo para no enviar nada
   * mientras el usuario sigue escribiendo.
   */
  useEffect(() => {
    const files = workspaceFiles
      .filter((f) => !f.isBinary)
      .map((f) => ({ path: f.path, language: f.language }));
    if (files.length === 0) return;
    const timer = window.setTimeout(() => {
      fetch("/api/engine/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      }).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [workspaceFiles]);

  /**
   * v2.0 — AUTOSUPERACIÓN → BASE DE DATOS DEL MOTOR.
   * Cada lección aprendida se registra como entrada consultable: deja de
   * depender de que el prompt la lleve y pasa a ser conocimiento del motor,
   * recuperable con cualquier modelo.
   */
  useEffect(() => {
    if (!lastLesson) return;
    fetch("/api/engine/kb/learn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lastLesson.id, text: lastLesson.text, tags: lastLesson.tags }),
    }).catch(() => {});
  }, [lastLesson]);

  /**
   * Canal modelo → extensión. Se arranca siempre y el propio módulo decide si
   * hay algo que hacer (si no hay paneles abiertos, no consulta nada).
   */
  useEffect(() => {
    startInvocationPolling((msg) => {
      setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    });
    return () => stopInvocationPolling();
  }, []);

  /** Pantalla completa del contenedor principal, sincronizada con el navegador. */
  useEffect(() => {
    const handler = () => setIsAppFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  /**
   * v1.6.6 — 🐞 «el botón de salir de pantalla completa no anda».
   *
   * Antes: `if (!document.fullscreenElement)` con la llamada contemplando los
   * dos nombres de la API. La PREGUNTA solo miraba el moderno, así que en un
   * motor que exponga únicamente el prefijado esa lectura es `undefined`
   * siempre y la rama de «salir» no se alcanzaba jamás. Además, el
   * `.catch(() => {})` se tragaba cualquier rechazo: el síntoma era «no hace
   * nada», sin una sola pista de por qué.
   *
   * Ahora decide el módulo, pregunta al NAVEGADOR (no a un booleano de React,
   * que se desincroniza si se sale con Esc) y el fallo se cuenta en el registro
   * en vez de desaparecer.
   */
  const toggleAppFullscreen = useCallback(() => {
    void alternarPantallaCompleta(document, document.documentElement).then((r) => {
      if (!r.ok) {
        setTerminalLogs((l) => [
          ...l,
          `[${new Date().toLocaleTimeString()}] ⚠ Pantalla completa (${r.accion}): ${r.motivo ?? "fallo sin motivo"}`,
        ]);
      }
    });
  }, []);

  /** Esc cierra modales; F11 alterna pantalla completa. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        toggleAppFullscreen();
        return;
      }
      if (e.key === "Escape") {
        setIsProConfigOpen(false);
        setIsApiKeyModalOpen(false);
        setIsModelSelectorOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleAppFullscreen]);

  // ------------------------------------------------------------
  // v2.0 — Pestañas centrales
  // ------------------------------------------------------------
  const openCenterTab = useCallback((tab: CenterTab) => {
    setCenterTabs((prev) => (prev.some((t) => t.id === tab.id) ? prev : [...prev, tab]));
    setActiveCenterTab(tab.id);
  }, []);

  const closeCenterTab = useCallback((id: string) => {
    setCenterTabs((prev) => {
      const tab = prev.find((t) => t.id === id);
      if (!tab || tab.pinned) return prev;
      const next = prev.filter((t) => t.id !== id);
      setActiveCenterTab((cur) => (cur === id ? "chat" : cur));
      return next;
    });
  }, []);

  /** Abre (o enfoca) la pestaña del editor web. */
  const openWebEditorTab = useCallback(() => {
    openCenterTab({ id: "web-editor", label: "Editor web", kind: "web-editor" });
    setActiveView("web-editor");
  }, [openCenterTab]);

  /** Abre la pestaña de una extensión. */
  const openExtensionTab = useCallback(
    (ext: ExtensionInfo) => {
      const panel = ext.manifest.contributes?.panels?.[0];
      openCenterTab({
        id: `ext:${ext.manifest.id}`,
        label: panel?.title || ext.manifest.name,
        kind: "extension",
        extensionId: ext.manifest.id,
      });
    },
    [openCenterTab]
  );

  // ------------------------------------------------------------
  // v2.0 — Orden DIRECTA del editor web al motor
  // ------------------------------------------------------------
  /**
   * Antes: el editor llamaba a `handleSendMessage`, que escribía en el chat
   * central (que en esa vista estaba oculto) y el editor solo simulaba éxito con
   * un setTimeout. Ahora la orden entra al motor por el mismo camino que el chat
   * y el estado que se muestra es el real (isStreaming + autosync).
   */
  const sendWebEditorOrder = useCallback(
    (prompt: string) => {
      setWebEditorStatus({ phase: "sending", message: "Orden enviada al motor…" });
      webEditorOrderRef.current = true;
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] 🎨 Editor web → orden directa: "${prompt.slice(0, 70)}${prompt.length > 70 ? "…" : ""}"`,
      ]);
      const wrapped =
        `[ORDEN DEL EDITOR WEB] Modifica la página del sandbox (puerto 3500) aplicando esta instrucción ` +
        `sobre los archivos HTML/CSS/JS del workspace. Aplica los cambios directamente con las herramientas ` +
        `(prefiere edit_file antes que reescribir el archivo entero), mantén el tema oscuro y no expliques: ejecuta.\n\n` +
        `Instrucción: "${prompt}"`;
      handleSendMessageWithRAG(wrapped, []);
    },
    // handleSendMessageWithRAG es estable (delegado a un ref) → no hace falta en deps
    []
  );

  // ============================================================
  // v2.0 — BUCLE DE AUTOSUPERACIÓN: medir → reflexionar → aprender
  // ============================================================
  /** Primer token: mide cuánto tarda el modelo en empezar a responder. */
  useEffect(() => {
    if (isStreaming && currentStreamingText && firstTokenRef.current === 0 && turnStartRef.current > 0) {
      firstTokenRef.current = Date.now() - turnStartRef.current;
    }
  }, [currentStreamingText, isStreaming]);

  /**
   * Fin de turno: se registra la métrica, se confirman las lecciones que
   * estaban activas y se reflexiona (determinista, sin gastar tokens) para
   * sacar una lección nueva si el turno falló o fue anómalo.
   */
  useEffect(() => {
    if (isStreaming || turnStartRef.current === 0) return;

    const totalMs = Date.now() - turnStartRef.current;
    const firstTokenMs = firstTokenRef.current || undefined;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const text = lastAssistant?.content || "";
    const looksFailed =
      text.trim().length === 0 ||
      /(^|\n)\s*(❌|error:|error al|no se pudo|failed to|invalid api key|rate limit|timeout)/i.test(text.slice(0, 400));
    const failureKind = !looksFailed
      ? undefined
      : /rate limit|quota|cuota/i.test(text)
      ? "quota"
      : /api key|clave|401|unauthorized/i.test(text)
      ? "auth"
      : /timeout|tardó|timed out/i.test(text)
      ? "timeout"
      : "retryable";

    const profile = getModelProfile(currentModel);
    const summary = getImprovementSummary();
    const baseline = summary.byModel.find((m) => m.model === currentModel)?.avgFirstTokenMs ?? null;

    // v1.6.32 · D8: el motor ya contó los tokens de este turno (eval_count) y
    // el búfer los dejó en la medición del último stream. Si la hay, se
    // REGISTRA LA MEDIDA; el len/4 queda solo como estimación etiquetada.
    const medicion = consumirUltimaMedicion();
    recordTurnMetric({
      at: Date.now(),
      provider,
      model: currentModel,
      firstTokenMs,
      totalMs,
      tokensOut: medicion?.tokensOut ?? Math.round(text.length / 4),
      tokensIn: medicion?.tokensIn,
      tokPorSegundo: medicion?.tokPorSegundo,
      medidaExacta: medicion?.exacta ?? false,
      ok: !looksFailed,
      failureKind,
      tier: profile.tier,
    });

    confirmLastLessonsUsed(!looksFailed);

    const lesson = reflectOnTurn({
      model: currentModel,
      tier: profile.tier,
      ok: !looksFailed,
      failureKind,
      firstTokenMs,
      totalMs,
      baselineFirstTokenMs: baseline,
      askedForTools: !profile.toolCapable && agentToolsHint.length === 0 && /crea|crear|escribe|archivo|código|refactor/i.test(text.slice(0, 200)),
    });

    setImprovementSummary(getImprovementSummary());
    if (lesson) {
      setLastLesson(lesson);
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] 🎓 Nueva lección aprendida: ${lesson.text.slice(0, 90)}${lesson.text.length > 90 ? "…" : ""}`,
      ]);
    }
    // Última telemetría del turno: latencia y estado de los cortacircuitos
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 📈 Turno ${looksFailed ? "con error" : "correcto"} · ${(totalMs / 1000).toFixed(1)} s${firstTokenMs ? ` (primer token ${(firstTokenMs / 1000).toFixed(1)} s)` : ""} · resiliencia: ${describeResilience()}`,
    ]);
    turnStartRef.current = 0;
    firstTokenRef.current = 0;
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Sincroniza el estado mostrado por el editor web con la realidad del motor. */
  useEffect(() => {
    if (!webEditorOrderRef.current) return;
    if (isStreaming) {
      setWebEditorStatus((s) => (s.phase === "streaming" ? s : { phase: "streaming", message: "El modelo está escribiendo los cambios…" }));
      return;
    }
    // El stream terminó: si había una orden pendiente, se aplica y se refresca.
    setWebEditorStatus((s) => {
      if (s.phase === "done" || s.phase === "error" || s.phase === "idle") return s;
      webEditorOrderRef.current = false;
      return { phase: "done", message: "Cambios aplicados. El preview se refresca con la sincronización al sandbox." };
    });
  }, [isStreaming]);

  // FOCO v2 — si el mouse se soltó fuera de la ventana (Alt+Tab con un divisor
  // arrastrado), body quedaba con userSelect:"none" y cursor congelado: la
  // interfaz «no dejaba escribir» hasta minimizar y volver. Al perder el foco,
  // todo se resetea.
  useEffect(() => {
    const alPerderFoco = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("blur", alPerderFoco);
    return () => window.removeEventListener("blur", alPerderFoco);
  }, []);

  // v2.6.2 — vigilante del canal editor: 20 s en «sending» sin que el motor
  // haya empezado a emitir = la orden está muerta en el agua (modelo sin
  // servicio, puente caído). Se libera la fase con motivo en vez de dejar el
  // panel secuestrado por un busy eterno.
  useEffect(() => {
    if (webEditorStatus.phase !== "sending" || isStreaming) return;
    const t = setTimeout(() => {
      setWebEditorStatus((s) => {
        if (s.phase !== "sending") return s;
        webEditorOrderRef.current = false;
        return { phase: "error", message: "El motor tardó más de 20 s en empezar a responder (¿modelo caído o puente sin servicio?). Prueba la misma orden desde el Chat para ver el error completo." };
      });
    }, 20000);
    return () => clearTimeout(t);
  }, [webEditorStatus.phase, isStreaming]);

  // Telemetry
  const [telemetry, setTelemetry] = useState<PortTelemetry>({
    port3000: true,
    port5000: false,
    port11434: true,
    lastChecked: Date.now(),
  });
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "[00:00:01] Sistema CerebroNico inicializado.",
    "[00:00:02] Puerto 3000 activo para UI.",
    "[00:00:03] Parser de adjuntos DOCX/ZIP activado.",
  ]);

  const streamerRef = useRef<HighPerformanceAIStreamer>(new HighPerformanceAIStreamer());
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [isDetectingGemini, setIsDetectingGemini] = useState(false);
  const [isDetectingOpenRouter, setIsDetectingOpenRouter] = useState(false);
  const [isDetectingOpenai, setIsDetectingOpenai] = useState(false);
  const [isDetectingZai, setIsDetectingZai] = useState(false);
  const [isRedetectingAll, setIsRedetectingAll] = useState(false);
  const [detectedGeminiModels, setDetectedGeminiModels] = useState<string[]>([]);
  const [detectedOpenRouterModels, setDetectedOpenRouterModels] = useState<string[]>([]);
  const [detectedOpenaiModels, setDetectedOpenaiModels] = useState<string[]>([]);
  const [detectedZaiModels, setDetectedZaiModels] = useState<string[]>([]);

  /**
   * 🔧 Autodetección de modelos Gemini flash (gratuitos) usando la API key del usuario.
   * Llama al endpoint backend /api/gemini/models que a su vez consulta
   * https://generativelanguage.googleapis.com/v1beta/models?key=API_KEY
   * y filtra los modelos flash disponibles para generateContent.
   */
  const fetchGeminiFreeModels = useCallback(async () => {
    if (!geminiApiKey) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ Gemini: introduce tu API key en "Ranuras de API Keys" antes de autodetectar modelos.`,
      ]);
      return;
    }
    setIsDetectingGemini(true);
    try {
      const res = await fetch(`/api/gemini/models?key=${encodeURIComponent(geminiApiKey)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const names: string[] = (data?.models || []).map((m: any) => m.name);
      setDetectedGeminiModels(names);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚡ Gemini: ${names.length} modelo(s) flash detectado(s) para tu clave — [${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}].`,
      ]);
      // Si el modelo actual NO es gemini y hay modelos disponibles, auto-seleccionar el primero
      if (names.length > 0 && !currentModel.startsWith("gemini")) {
        setCurrentModel(names[0]);
        setProvider("gemini");
      } else if (names.length > 0 && currentModel.startsWith("gemini") && !names.includes(currentModel)) {
        // Si el modelo Gemini actual ya no existe, actualizar al primero disponible
        setCurrentModel(names[0]);
      }
    } catch (err: any) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Gemini autodetección falló: ${err.message?.slice(0, 200) || String(err)}`,
      ]);
    } finally {
      setIsDetectingGemini(false);
    }
  }, [geminiApiKey, currentModel]);

  /**
   * 🔧 Autodetección de modelos gratuitos de OpenRouter.
   * Llama al endpoint backend /api/openrouter/models que consulta
   * https://openrouter.ai/api/v1/models y filtra los que terminan en ":free",
   * más el modelo virtual "openrouter/free".
   * No requiere API key (es catálogo público), pero la validamos para no listar
   * modelos que luego no se podrán usar.
   */
  const fetchOpenRouterFreeModels = useCallback(async () => {
    if (!openrouterApiKey) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ OpenRouter: introduce tu API key en "Ranuras de API Keys" antes de autodetectar modelos.`,
      ]);
      return;
    }
    setIsDetectingOpenRouter(true);
    try {
      const res = await fetch("/api/openrouter/models");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const names: string[] = (data?.models || []).map((m: any) => m.id || m.name);
      setDetectedOpenRouterModels(names);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🌐 OpenRouter: ${names.length} modelo(s) gratuito(s) disponible(s) — [${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}].`,
      ]);
      // Si el modelo actual NO es openrouter y hay modelos disponibles, preferir "openrouter/free"
      if (names.length > 0 && !currentModel.includes("/")) {
        const preferred = names.includes("openrouter/free") ? "openrouter/free" : names[0];
        setCurrentModel(preferred);
        setProvider("openrouter");
      }
    } catch (err: any) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ OpenRouter autodetección falló: ${err.message?.slice(0, 200) || String(err)}`,
      ]);
    } finally {
      setIsDetectingOpenRouter(false);
    }
  }, [openrouterApiKey, currentModel]);

  /**
   * 🔧 Autodetección de modelos OpenAI disponibles para la API key del usuario.
   * Llama al endpoint backend /api/openai/models que a su vez consulta
   * https://api.openai.com/v1/models con Authorization: Bearer <API_KEY>.
   * Filtra los modelos chat-completion y omite los legacy (gpt-3.5-turbo-instruct, etc).
   */
  const fetchOpenaiAvailableModels = useCallback(async () => {
    if (!openaiApiKey) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ OpenAI: introduce tu API key en "Ranuras de API Keys" antes de autodetectar modelos.`,
      ]);
      return;
    }
    setIsDetectingOpenai(true);
    try {
      // Enviar la API key en el header x-openai-key para que el server no la loguee en URL.
      const res = await fetch("/api/openai/models", {
        headers: { "x-openai-key": openaiApiKey },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const names: string[] = (data?.models || []).map((m: any) => m.id || m.name);
      setDetectedOpenaiModels(names);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚡ OpenAI: ${names.length} modelo(s) disponible(s) para tu clave — [${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}].`,
      ]);
      // Si el modelo actual no es de OpenAI y hay modelos disponibles, auto-seleccionar el mejor (gpt-4o-mini por velocidad)
      if (names.length > 0 && !currentModel.startsWith("gpt") && !currentModel.startsWith("o1") && !currentModel.startsWith("o3")) {
        const preferred = names.includes("gpt-4o-mini") ? "gpt-4o-mini" : names[0];
        setCurrentModel(preferred);
        setProvider("openai");
      }
    } catch (err: any) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ OpenAI autodetección falló: ${err.message?.slice(0, 200) || String(err)}`,
      ]);
    } finally {
      setIsDetectingOpenai(false);
    }
  }, [openaiApiKey, currentModel]);

  /**
   * v1.1 — Autodetección de modelos Z.ai (GLM) gratuitos.
   * Llama al endpoint backend /api/zai/models que devuelve:
   *   - Siempre el catálogo estático (glm-4.5-flash, glm-4-flash, glm-4-air, glm-4-flashx, glm-4.5v-flash).
   *   - Si hay API key, también intenta listar en vivo y los combina.
   * NO requiere API key para mostrar el catálogo estático (todos son gratis).
   */
  const fetchZaiFreeModels = useCallback(async () => {
    setIsDetectingZai(true);
    try {
      const headers: Record<string, string> = {};
      if (zaiApiKey) headers["x-zai-key"] = zaiApiKey;
      const res = await fetch("/api/zai/models", { headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const names: string[] = (data?.models || []).map((m: any) => m.id || m.name);
      setDetectedZaiModels(names);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🧠 Z.ai: ${names.length} modelo(s) GLM gratuito(s) disponible(s) — [${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}]. Fuente: ${data?.source || "estática"}.`,
      ]);
      // ============================================================
      // 🐞 v2.0 — BUG CORREGIDO: "cambias de modelo y se autocambia al GLM".
      // ------------------------------------------------------------
      // Este bloque se ejecutaba en CADA cambio de `currentModel`, y como la
      // dependencia del useCallback incluía `currentModel`, cualquier modelo que
      // eligieras (uno local de Ollama, por ejemplo) era inmediatamente
      // sobrescrito por glm-4.5-flash. El selector parecía "trancado".
      //
      // Ahora la autoselección ocurre UNA sola vez por sesión y SOLO si el
      // usuario todavía no tiene un modelo guardado. A partir de ahí manda el
      // usuario: se puede elegir cualquier modelo local o de nube.
      // ============================================================
      if (!zaiAutoSelectRef.current) {
        zaiAutoSelectRef.current = true;
        const savedModel = loadString(LS_KEYS.CURRENT_MODEL);
        if (!savedModel && names.length > 0) {
          const preferred = names.includes("glm-4.5-flash") ? "glm-4.5-flash" : names[0];
          setCurrentModel(preferred);
          setProvider("zai");
          setTerminalLogs((prev) => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] 🧠 Modelo inicial: ${preferred} (solo esta vez; ya puedes cambiarlo libremente).`,
          ]);
        }
      }
    } catch (err: any) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Z.ai autodetección falló: ${err.message?.slice(0, 200) || String(err)}`,
      ]);
    } finally {
      setIsDetectingZai(false);
    }
  }, [zaiApiKey, currentModel]);

  // Auto-detect installed models from Ollama
  const fetchInstalledModels = useCallback(async (customUrl?: string) => {
    const targetUrl = customUrl || ollamaUrl;
    setIsRefreshingModels(true);
    let detected: string[] = [];

    try {
      // 1. Direct fetch to Ollama con timeout más largo (Ollama puede tardar
      //    10-30s cuando está generando o cargando un modelo).
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${targetUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.models)) {
          // 🔧 IMPORTANTE: registrar TODOS los modelos, no solo algunos.
          // Antes el filter(Boolean) descartaba los que no tenían name,
          // pero también perdía los que solo tenían el campo `model`.
          detected = data.models
            .map((m: any) => m.name || m.model || m.id || (typeof m === "string" ? m : ""))
            .filter((s: string) => typeof s === "string" && s.trim().length > 0);
        }
      }
    } catch {
      // Direct connection couldn't reach or blocked by CORS, try server proxy
      try {
        // El proxy del server tiene timeout de 35s — suficiente para Ollama.
        const proxyRes = await fetch(`/api/ollama/models?url=${encodeURIComponent(targetUrl)}`);
        if (proxyRes.ok) {
          const data = await proxyRes.json();
          if (data && Array.isArray(data.models)) {
            detected = data.models
              .map((m: any) => m.name || m.model || m.id || (typeof m === "string" ? m : ""))
              .filter((s: string) => typeof s === "string" && s.trim().length > 0);
          }
        }
      } catch {}
    } finally {
      setIsRefreshingModels(false);
    }

    if (detected.length > 0) {
      // 🔧 Filtrar modelos que NO soportan chat (embeddings, similarity, etc.)
      // Estos causan error HTTP 400 "no soporta chat" al intentar usarlos.
      const NON_CHAT_PATTERNS = [
        /embed/i, /all-minilm/i, /\be5\b/i, /nomic.*embed/i, /bge/i,
        /snowflake.*arctic.*embed/i, /sentence/i, /similarity/i, /minilm/i,
        /qwen3.*embedding/i, /qwen3.*embed/i,
      ];
      const chatOnly = detected.filter(name => {
        const lower = name.toLowerCase();
        return !NON_CHAT_PATTERNS.some(p => p.test(lower));
      });
      // Si después de filtrar quedan modelos, usar los filtrados; si no, usar todos
      // (para no dejar al usuario sin opciones).
      const finalDetected = chatOnly.length > 0 ? chatOnly : detected;

      setAvailableModels(finalDetected.map((name) => ({ name })));
      // 🔧 Mostrar TODOS los modelos detectados en el log (antes solo 4).
      const displayList = finalDetected.length <= 12
        ? finalDetected.join(", ")
        : finalDetected.slice(0, 12).join(", ") + ` … (+${finalDetected.length - 12} más)`;
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🦙 Ollama: ${finalDetected.length} modelo(s) de chat detectado(s) en ${targetUrl} (${detected.length - finalDetected.length} de embedding filtrados): [${displayList}]`,
      ]);

      // Si el modelo actual es el default y hay modelos detectados, auto-seleccionar el mejor
      if (detected.length > 0) {
        const preferred = detected.find((m) => m.includes("qwen2.5-coder") || m.includes("deepseek") || m.includes("stablelm") || m.includes("coder")) || detected[0];
        if (preferred && (!currentModel || currentModel === "stablelm2:latest")) {
          setCurrentModel(preferred);
        }
      }
    } else {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ℹ️ Ollama: No se detectaron modelos en ${targetUrl} (catálogo global + fallback autónomo activos).`,
      ]);
    }
  }, [ollamaUrl, currentModel]);

  /**
   * 🔧 Cargar modelos del Servidor Personalizado (Groq, Cerebras, Together, Mistral, etc.)
   * Llama al endpoint backend /api/custom/models que a su vez consulta
   * la URL del servidor Custom con Authorization: Bearer <KEY>.
   */
  const fetchCustomModels = useCallback(async () => {
    if (!customServerUrl) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ Custom: configura la URL del endpoint en "Ranuras de API Keys" antes de cargar modelos.`,
      ]);
      return;
    }
    setIsDetectingOpenai(true); // reusamos el mismo flag de "detectando" del OpenAI spinner
    try {
      const headers: Record<string, string> = { "x-custom-url": customServerUrl };
      if (customApiKey) headers["x-custom-key"] = customApiKey;
      const res = await fetch("/api/custom/models", { headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const names: string[] = (data?.models || []).map((m: any) => m.id || m.name);
      setDetectedOpenaiModels((prev) => {
        // Combinar con los modelos OpenAI ya detectados (si los había)
        const set = new Set([...prev, ...names.map(n => `custom:${n}`)]);
        return Array.from(set);
      });
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🌐 Custom [${customServerUrl}]: ${names.length} modelo(s) disponible(s) — [${names.slice(0, 8).join(", ")}${names.length > 8 ? ` … (+${names.length - 8})` : ""}].`,
      ]);
      // Auto-seleccionar el primero si el modelo actual no es custom
      if (names.length > 0 && provider !== "custom") {
        setCurrentModel(names[0]);
        setProvider("custom");
      }
    } catch (err: any) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Custom autodetección falló: ${err.message?.slice(0, 200) || String(err)}`,
      ]);
    } finally {
      setIsDetectingOpenai(false);
    }
  }, [customServerUrl, customApiKey, provider]);

  /**
   * 🔧 Redetección global: ejecuta en paralelo la autodetección de Ollama,
   * Gemini, OpenRouter, OpenAI y el servidor Custom. Útil para "limpiar y
   * volver a escanear" después de instalar nuevos modelos o cambiar claves.
   */
  const redetectAllModels = useCallback(async () => {
    if (isRedetectingAll) return;
    setIsRedetectingAll(true);
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🔄 Redetectando TODOS los proveedores (Ollama + OpenAI + Gemini + OpenRouter + Z.ai + Custom) en paralelo...`,
    ]);
    try {
      await Promise.allSettled([
        fetchInstalledModels(),
        openaiApiKey ? fetchOpenaiAvailableModels() : Promise.resolve(),
        geminiApiKey ? fetchGeminiFreeModels() : Promise.resolve(),
        openrouterApiKey ? fetchOpenRouterFreeModels() : Promise.resolve(),
        // v1.1 — Z.ai NO requiere API key para listar su catálogo gratuito, siempre lo intentamos:
        fetchZaiFreeModels(),
        customServerUrl ? fetchCustomModels() : Promise.resolve(),
      ]);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ✅ Redetección global completada.`,
      ]);
    } finally {
      setIsRedetectingAll(false);
    }
  }, [isRedetectingAll, fetchInstalledModels, fetchOpenaiAvailableModels, fetchGeminiFreeModels, fetchOpenRouterFreeModels, fetchZaiFreeModels, fetchCustomModels, openaiApiKey, geminiApiKey, openrouterApiKey, customServerUrl]);

  // Check Telemetry & Auto-detect models
  const checkTelemetry = useCallback(async () => {
    try {
      const res = await fetch("/api/telemetry/ports");
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data);
        if (data.port11434 && availableModels.length === 0) {
          fetchInstalledModels();
        }
      }
    } catch {}
  }, [availableModels.length, fetchInstalledModels]);

  // Fetch Subagents topology (live status of UI / Bridge / Ollama / Sandbox)
  const fetchSubagents = useCallback(async () => {
    try {
      const res = await fetch("/api/subagents");
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.items) && data.items.length > 0) {
          setSubagents(data);
        }
      }
    } catch {}
  }, []);

  // 🔧 Reconexión completa: reinicia el puente Python (:5000) e invalida el cache
  // de telemetría para que el próximo check refleje el estado real de Ollama (:11434).
  // Este es el handler que usa el botón "Reconectar" de la UI.
  const [isReconnecting, setIsReconnecting] = useState(false);
  const handleReconnectAll = useCallback(async () => {
    if (isReconnecting) return;
    setIsReconnecting(true);
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🔧 Reconectando puente Python (:5000) y refrescando telemetría...`,
    ]);
    try {
      // 1. Reiniciar el puente Python (server lo vuelve a spawnear)
      try {
        const bridgeRes = await fetch("/api/bridge/restart", { method: "POST" });
        const bridgeData = await bridgeRes.json().catch(() => ({}));
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}]   ↳ Puente 5000: ${bridgeData.ok ? "OK reiniciado" : "fallo (" + (bridgeData.error || "desconocido") + ")"}`,
        ]);
      } catch (e: any) {
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}]   ↳ Puente 5000: no se pudo reiniciar (${e.message})`,
        ]);
      }
      // 2. Invalidar cache de telemetría y forzar re-check
      try {
        await fetch("/api/telemetry/refresh", { method: "POST" });
      } catch {}
      // 3. Re-verificar telemetría inmediatamente
      await checkTelemetry();
      // 4. Re-detectar modelos de Ollama
      await fetchInstalledModels();
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ✅ Reconexión completada. Re-verifica los puertos en la pestaña "Puertos".`,
      ]);
    } finally {
      setIsReconnecting(false);
    }
  }, [checkTelemetry, fetchInstalledModels, isReconnecting]);

  useEffect(() => {
    checkTelemetry();
    fetchInstalledModels();
    // v1.1 — Auto-cargar el catálogo de Z.ai al iniciar (NO requiere API key):
    //   así el usuario ve los modelos GLM gratuitos disponibles desde el arranque.
    fetchZaiFreeModels();
    fetchSubagents();
    const interval = setInterval(checkTelemetry, 10000);
    const subInterval = setInterval(fetchSubagents, 15000);
    return () => {
      clearInterval(interval);
      clearInterval(subInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkTelemetry, fetchInstalledModels, fetchSubagents, fetchZaiFreeModels]);

  // ============================================================
  // v8.0.3 — ESTADO REAL DEL SANDBOX (el indicador que mentía)
  // ------------------------------------------------------------
  // `sandboxRunning` se pasaba al editor web y allí decidía el color del punto
  // de estado y si aparecía el aviso «el sandbox no está corriendo». Pero nunca
  // se actualizaba: estaba clavado en `true`. Ahora se pregunta al motor.
  //
  // Cada 6 s, no cada 10 como la telemetría: el sandbox se arranca y se para a
  // mano, y un indicador que tarda 10 s en reflejarlo hace que el usuario pulse
  // «Arrancar» dos veces. El sondeo es un GET local barato; el coste real de
  // equivocarse aquí es el usuario, no la CPU.
  // ============================================================
  useEffect(() => {
    let vivo = true;
    const sondear = async () => {
      try {
        const r = await fetch("/api/sandbox/status");
        const d: any = await r.json();
        if (vivo) setSandboxRunning(!!(d && (d.online === true || d.running === true)));
      } catch {
        // Motor caído o recargando: se declara NO vivo. Decir «activo» cuando no
        // se pudo preguntar sería volver al defecto que se acaba de corregir.
        if (vivo) setSandboxRunning(false);
      }
    };
    sondear();
    const intervalo = setInterval(sondear, 6000);
    return () => {
      vivo = false;
      clearInterval(intervalo);
    };
  }, []);

  // Add Attachments with Automatic DOCX/ZIP Unpacking
  const handleAddAttachments = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newWorkspaceFiles: WorkspaceFile[] = [];

    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Procesando ${fileArray.length} archivo(s) adjunto(s)...`,
    ]);

    // v8.0.3 — Los nombres entran en la cola de «cargando» TODOS de golpe, antes
    // de procesar ninguno. Así el usuario ve la lista completa de lo que falta
    // desde el primer instante, en vez de una tira vacía seguida de un volcado.
    setAttachmentsCargando((prev) => [...prev, ...fileArray.map((f) => f.name)]);

    for (const file of fileArray) {
      try {
        const { attachment, workspaceFiles: extractedFiles } = await processUploadedFile(file);
        // Uno a uno: el chip con su miniatura aparece en cuanto ESTE archivo está
        // listo, sin esperar a los demás.
        setPendingAttachments((prev) => [...prev, attachment]);
        if (extractedFiles.length > 0) {
          newWorkspaceFiles.push(...extractedFiles);
        }
      } catch (err) {
        console.error("Error procesando adjunto:", err);
      } finally {
        // Se retira SIEMPRE, también cuando falló. Un chip fantasma eterno sería
        // peor que no haberlo puesto: el usuario esperaría algo que ya no va a
        // llegar. Se quita la primera coincidencia, que es la de esta iteración.
        setAttachmentsCargando((prev) => {
          const i = prev.indexOf(file.name);
          if (i === -1) return prev;
          return [...prev.slice(0, i), ...prev.slice(i + 1)];
        });
      }
    }

    if (newWorkspaceFiles.length > 0) {
      setWorkspaceFiles((prev) => {
        const map = new Map<string, WorkspaceFile>();
        prev.forEach((f) => map.set(f.path, f));
        newWorkspaceFiles.forEach((f) => map.set(f.path, f));
        return Array.from(map.values());
      });
      setActiveFileId(newWorkspaceFiles[0].id);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ${newWorkspaceFiles.length} archivo(s) extraído(s) e incorporado(s) al editor sin rombos ni caracteres corruptos.`,
      ]);
    }
  };

  const handleRemovePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Send Message with Context Cache Management & Message Queue
  const executeSendMessage = (
    text: string,
    attachments: AttachmentItem[],
    currentHistory: ChatMessage[],
    extraSystemInstruction?: string
  ) => {
    // PUGIL v1 — los modelos de EMBEDDINGS no chatean: Ollama los rechaza con
    // 400 en /api/chat y la UI lo contaba como «se cortó la comunicación».
    // La verdad se dice antes de gastar el pedido.
    if (esModeloEmbeds(currentModel)) {
      const pugilMsg: ChatMessage = { id: "msg-" + Date.now(), role: "assistant", content: motivoEmbeds(currentModel), timestamp: Date.now() };
      setMessages((h) => [...h, pugilMsg]);
      setIsStreaming(false);
      return;
    } /*PUGIL*/
    // PUGIL v1 — los modelos de EMBEDDINGS no chatean: Ollama los rechaza con
    // 400 en /api/chat y la UI lo contaba como «se cortó la comunicación».
    // La verdad se dice antes de gastar el pedido.
    if (esModeloEmbeds(currentModel)) {
      const pugilMsg: ChatMessage = { id: "msg-" + Date.now(), role: "assistant", content: motivoEmbeds(currentModel), timestamp: Date.now() };
      setMessages((h) => [...h, pugilMsg]);
      setIsStreaming(false);
      return;
    } /*PUGIL*/
    const userMsg: ChatMessage = {
      id: "msg-" + Date.now(),
      role: "user",
      content: text,
      timestamp: Date.now(),
      attachments: [...attachments],
    };

    const updatedHistory = [...currentHistory, userMsg];

    // ============================================================
    // v2.0 — CANAL DIRECTO DEL EDITOR WEB (recorrido simplificado)
    // ------------------------------------------------------------
    // Antes: orden del editor → chat central → el chat central devolvía el prompt
    // al editor → preview. Una vuelta ilógica que además ensuciaba la
    // conversación con órdenes que no eran tuyas.
    // Ahora: si la orden viene del editor (webEditorOrderRef en true), se envía
    // igual al MOTOR —el payload se construye con `updatedHistory`, así que el
    // modelo la recibe completa— pero NO se publica en el chat: la respuesta se
    // queda en el editor, y los archivos generados se aplican por la vía normal
    // (workspace → autosync → sandbox → preview).
    // ============================================================
    const desdeElEditor = webEditorOrderRef.current === true;
    // ORDEN VISIBLE v1: la orden del editor se publica en el chat central como
    // cualquier otra. El canal directo de v2.0 la escondía y la experiencia era
    // «no hizo nada» — lo que no se ve, no existe.
    setMessages(updatedHistory);
    setIsStreaming(true);
    setCurrentStreamingText("");
    setAgentTasks([]);
    setActionLog([]);

    // Build context payload following the strict cache policy with full history support
    // ============================================================
    // v2.0 — AUTOSUPERACIÓN + RENDIMIENTO en el prompt
    // ------------------------------------------------------------
    // 1. `modelName` + `ramGb`: el prompt, el contexto y los archivos abiertos
    //    se dimensionan al modelo real (antes eran los mismos para todos).
    // 2. `historyWindow`: memoria larga configurable (60 mensajes por defecto).
    // 3. `extra`: las 3-4 LECCIONES más relevantes para esta petición. Solo las
    //    relevantes: inyectar 100 lecciones sería más lento y peor.
    // ============================================================
    const relevantLessons = getRelevantLessons(text, 4);
    const contextPayload = buildContextCachePayload(
      currentHistory,
      workspaceFiles,
      activeFileId,
      text,
      responseLanguage,
      expertMode,
      {
        modelName: currentModel,
        historyWindow,
        toolNames: agentToolsHint,
        extra: buildSelfImprovementDirective(relevantLessons),
      }
    );
    setPromptInfoState(contextPayload.promptInfo);
    {
      const info = contextPayload.promptInfo;
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] 🧠 Prompt "${info.level}" ≈${info.estTokens} tokens · memoria: ${info.historyIncluded} mensaje(s) íntegro(s), ${info.historySummarized} resumido(s)${info.dropped > 0 ? `, ${info.dropped} descartado(s)` : ""} · ${info.openFilesCount} archivo(s)`,
      ]);
      if (relevantLessons.length > 0) {
        setTerminalLogs((l) => [
          ...l,
          `[${new Date().toLocaleTimeString()}] 🎓 Autosuperación: ${relevantLessons.length} lección(es) aplicadas al prompt de este turno.`,
        ]);
      }
      for (const note of info.notes) {
        setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ⚙️ ${note}`]);
      }
    }
    // Telemetría: se marca el inicio del turno para medir latencia real
    turnStartRef.current = Date.now();
    firstTokenRef.current = 0;

    if (contextPayload.isFirstMessage) {
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] ⚡ Context Cache: Inyectados MEMORIA.md y skills.md como mensajes de sistema ocultos (Turno 1).`,
      ]);
    } else {
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] ⚡ Context: Historial total activo (${currentHistory.length + 1} turnos) + ${
          contextPayload.openFiles.length
        } archivo(s) abiertos.`,
      ]);
    }

    streamerRef.current.stream(
      text,
      attachments,
      contextPayload.history as any,
      {
        provider,
        model: currentModel,
        temperature,
        // 🔧 Combinar el systemInstruction base (contextCache) con el extra (SLM/Evolution/RAG)
        // ANTES: el PROTOCOLO SLM se inyectaba como PREFIJO del prompt del usuario → aparecía visible.
        // AHORA: se inyecta como systemInstruction → el modelo lo lee pero no lo muestra.
        systemInstruction: extraSystemInstruction
          ? `${contextPayload.systemInstruction}\n\n${extraSystemInstruction}`
          : contextPayload.systemInstruction,
        hiddenSystemFiles: contextPayload.hiddenSystemFiles,
        openFiles: contextPayload.openFiles,
        ollamaUrl,
        openrouterApiKey,
        geminiApiKey,
        customServerUrl,
        customApiKey,
        openaiApiKey,
        // v1.1 — Pass dedicated cloud provider API keys to the streamer:
        zaiApiKey,
        groqApiKey,
        cerebrasApiKey,
        togetherApiKey,
        mistralApiKey,
        deepseekApiKey,
        fireworksApiKey,
        pcMode,
      },
      {
        onChunk: (accumulated) => {
          setCurrentStreamingText(accumulated);
        },
        onTask: (event) => {
          if (event.type === "action") {
            setActionLog((prev) => [...prev, { ...event.action, ts: Date.now() }]);
            return;
          }
          setAgentTasks((prev) => {
            if (event.type === "plan") {
              return event.tasks.map((t) => ({ ...t }));
            }
            return prev.map((t) =>
              t.id === event.taskId ? { ...t, status: event.status } : t
            );
          });
        },
        onDone: (finalText, meta) => {
          setIsStreaming(false);
          setCurrentStreamingText("");

          const assistantMsg: ChatMessage = {
            id: "msg-" + Date.now(),
            role: "assistant",
            content: finalText,
            timestamp: Date.now(),
            modelUsed: meta.model,
          };
          const nextHistory = [...updatedHistory, assistantMsg];
          // v2.0 — Canal directo del editor: la respuesta no se publica en el chat
          // central; se marca en el estado del editor, que es quien la pidió.
          if (desdeElEditor) {
            // v2.1 — aquí decía `phase: "applied"`, que NO existe en el tipo
            // (`idle | sending | streaming | applying | done | error`). Como las
            // etiquetas y los colores son un Record sobre esa unión, el editor
            // pintaba una etiqueta vacía y una clase CSS «undefined». Y como el
            // refresco del preview se dispara sólo con «done»
            // (DedicatedWebEditorView.tsx:211), tampoco refrescaba. La fase
            // correcta es «done»: el rótulo es literalmente «Aplicado».
            setWebEditorStatus({
              phase: "done",
              message: "Orden aplicada por el canal directo del editor. El preview se refresca al llegar los archivos al sandbox.",
            });
            // ============================================================
            // v2.1 — 🐞 "no ingresa texto para probar la edición web, el chat
            // central no se ha movido".
            // ------------------------------------------------------------
            // El canal directo (v2.0) hizo lo correcto: la orden del editor ya no
            // pasa por el chat central. Pero eso dejó al usuario SIN VER NADA:
            // la respuesta se quedaba en una variable y no se mostraba en ningún
            // sitio, así que parecía que el editor no hacía nada.
            // Ahora la respuesta del motor se escribe también en el registro que
            // el editor SÍ muestra ("Actividad del agente").
            // ============================================================
            const respuesta = String(finalText || "").trim();
            setTerminalLogs((l) => [
              ...l,
              respuesta
                ? `[${new Date().toLocaleTimeString()}] ✎ Respuesta del motor (canal directo del editor): ${respuesta.slice(0, 600)}${respuesta.length > 600 ? " …" : ""}`
                : "[editor] El motor terminó sin devolver texto. Revisa el modelo elegido o el log del sandbox.",
            ]);
          }
          // ORDEN VISIBLE v1: la respuesta SIEMPRE se publica en el chat central;
          // el editor recibe además su estado y su registro propios.
          setMessages(nextHistory);

          // Extract code blocks from assistant response and update files
          const codeBlocks = extractCodeBlocksFromMessage(finalText);
          if (codeBlocks.length > 0) {
            setWorkspaceFiles((prev) => {
              const { updatedFiles, createdCount, updatedCount } = mergeExtractedFiles(
                prev,
                codeBlocks
              );
              setTerminalLogs((l) => [
                ...l,
                `[${new Date().toLocaleTimeString()}] Archivos sincronizados: +${createdCount} creados, ~${updatedCount} actualizados.`,
              ]);
              // 🔧 AUTO-SYNC AL DISCO: cuando la IA genera código, escribirlo
              // inmediatamente al sandbox (.proyectos/) para que el preview
              // del sandbox lo refleje. Sin esto, el código queda solo en
              // memoria de React y el sandbox sigue mostrando la web vieja.
              setTimeout(() => {
                syncToDisk(false).then((written) => {
                  if (written > 0) {
                    setTerminalLogs((l) => [
                      ...l,
                      `[${new Date().toLocaleTimeString()}] 🔄 Auto-sync: ${written} archivo(s) escritos al sandbox para preview en vivo.`,
                    ]);
                    // 🔧 Disparar evento para que el sandbox iframe se refresque
                    window.dispatchEvent(new CustomEvent("cerebronico:autosync-done"));
                  }
                });
              }, 200);
              return updatedFiles;
            });
          }

          // v2.2 — ORDENES DEL CHAT: conversiones de formato y aperturas.
          // Va DESPUÉS de los bloques de código, para que un mensaje que haga las
          // dos cosas funcione igual. No se espera: el chat queda libre.
          void aplicarOrdenesDelChat(finalText);

          // Automejora activa en segundo plano
          try {
            const learned = autoLearnFromInteraction(text, finalText);
            if (learned) {
              setTerminalLogs((l) => [
                ...l,
                `[${new Date().toLocaleTimeString()}] 🧠 Automejora: Se aprendió y consolidó en memoria "${learned.term}".`,
              ]);
            }
          } catch {}

          // Check if there are queued messages to process next
          if (messageQueueRef.current.length > 0) {
            const [nextItem, ...remainingQueue] = messageQueueRef.current;
            setMessageQueue(remainingQueue);
            setTerminalLogs((l) => [
              ...l,
              `[${new Date().toLocaleTimeString()}] ⏳ Desencolando mensaje: "${nextItem.text.slice(0, 30)}..." (${remainingQueue.length} restantes).`,
            ]);
            setTimeout(() => {
              executeSendMessage(nextItem.text, nextItem.attachments, nextHistory);
            }, 100);
          }

          // Hook para el bucle autónomo de compilación
          if (afterStreamRef.current) {
            const cb = afterStreamRef.current;
            afterStreamRef.current = null;
            setTimeout(cb, 300);
          }
        },

        onError: (errMsg) => {
          setIsStreaming(false);
          setCurrentStreamingText("");
          // v2.6.1 — «ingresa texto pero no hizo nada»: si la orden venía del
          // Editor web, el fallo dejaba la fase en «sending» para siempre: busy
          // true, botón bloqueado y toda orden posterior descartada en silencio.
          // El error ahora libera el canal CON motivo legible en el propio editor.
          if (webEditorOrderRef.current) {
            webEditorOrderRef.current = false;
            setWebEditorStatus({
              phase: "error",
              message: "El motor no respondió: " + String(errMsg).slice(0, 140) + " — reintenta, o manda la orden desde el Chat para leer el error completo.",
            });
          }
          const errAssistantMsg: ChatMessage = {
            id: "msg-err-" + Date.now(),
            role: "assistant",
            content: `⚠️ Error de comunicación con ${currentModel}: ${errMsg} ${consejoDeError(String(errMsg))}`,
            timestamp: Date.now(),
            status: "error",
          };
          const nextHistory = [...updatedHistory, errAssistantMsg];
          setMessages(nextHistory);

          // If there are queued messages, continue processing
          if (messageQueueRef.current.length > 0) {
            const [nextItem, ...remainingQueue] = messageQueueRef.current;
            setMessageQueue(remainingQueue);
            setTimeout(() => {
              executeSendMessage(nextItem.text, nextItem.attachments, nextHistory);
            }, 200);
          }

          // Detener el bucle autónomo si hubo un error de comunicación
          afterStreamRef.current = null;
          buildFixRef.current.active = false;
        },
      }
    );
  };

  const handleSendMessage = (text: string, attachments: AttachmentItem[]) => {
    if (isStreamingRef.current) {
      // Enqueue message
      const queuedItem: QueuedMessageItem = {
        id: "queue-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        text,
        attachments: [...attachments],
        timestamp: Date.now(),
      };
      setMessageQueue((prev) => [...prev, queuedItem]);
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] 📥 Mensaje añadido a la cola (${messageQueueRef.current.length + 1} en espera).`,
      ]);
      return;
    }

    executeSendMessage(text, attachments, messagesRef.current);
  };

  // 🔧 Inyectar contexto RAG + EvolutionDB + system prompt SLM al SYSTEM INSTRUCTION
  // (NO como prefijo del prompt del usuario — eso hacía que apareciera visible en el chat).
  // Ahora se pasa como `extraSystemInstruction` a `executeSendMessage`, que lo combina
  // con el systemInstruction base (contextCache) y lo envía como instrucción de sistema
  // oculta al modelo.
  handleSendMessageWithRAGRef.current = async (text: string, attachments: AttachmentItem[]) => {
    const modelName = currentModelRef.current;
    const slmInfo = slmInfoRef.current;

    // 1. RAG: número de chunks recomendado según tipo de modelo (1 para nano, 2 para small, 4 default)
    const chunkCount = getRecommendedRagChunks(modelName);
    const ragContext = searchRelevantChunks(text, chunkCount);

    // 2. EvolutionDB: lecciones históricas (3 para SLMs, 5 para grandes)
    const evolutionLessons = getRecommendedEvolutionLessons(modelName);
    const evolutionContext = await buildEvolutionContextForPrompt(evolutionLessons);

    // 3. System prompt SLM (reglas anti-alucinación estrictas para modelos pequeños)
    const slmPrompt = buildSLMSystemPromptAddon(slmInfo);

    // 4. Componer el extraSystemInstruction (todo va al system prompt, no al texto del usuario)
    const extraParts: string[] = [];
    if (slmPrompt) extraParts.push(slmPrompt);
    if (ragContext) extraParts.push(ragContext);
    if (evolutionContext) extraParts.push(evolutionContext);
    const extraSystemInstruction = extraParts.length > 0 ? extraParts.join("\n\n") : undefined;

    // 5. El texto del usuario se envía LIMPIO (sin prefijo del PROTOCOLO SLM)
    executeSendMessage(text, attachments, messagesRef.current, extraSystemInstruction);
  };
  const handleSendMessageWithRAG = (text: string, attachments: AttachmentItem[]) =>
    handleSendMessageWithRAGRef.current(text, attachments);

  const handleRemoveQueuedMessage = (id: string) => {
    setMessageQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearQueue = () => {
    setMessageQueue([]);
  };

  const handleStopStreaming = () => {
    streamerRef.current.abort();
    setIsStreaming(false);
  };

  // Regenerar la última respuesta: reenviar el último prompt del usuario
  const handleRegenerate = () => {
    if (isStreamingRef.current) return;
    const msgs = messagesRef.current;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const lastUser = msgs[lastUserIdx];
    const historyBefore = msgs.slice(0, lastUserIdx);
    executeSendMessage(lastUser.content, lastUser.attachments || [], historyBefore);
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 🔁 Regenerando la última respuesta...`,
    ]);
  };

  // Limpiar conversación y cola, manteniendo el workspace
  const handleClearSession = () => {
    streamerRef.current.abort();
    setIsStreaming(false);
    setCurrentStreamingText("");
    setMessages([]);
    setMessageQueue([]);
    setActiveChatTitle("");
    try {
      localStorage.removeItem(LS_KEYS.MESSAGES);
    } catch {}
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 🧹 Conversación limpiada. MEMORIA.md y skills.md se inyectarán en el próximo turno.`,
    ]);
  };

  // ============================================================
  // CARPETA DE CHATS GUARDADOS: nuevo / abrir / renombrar / borrar
  // (lógica pura en utils/chatStorage.ts)
  // ============================================================
  const deriveChatTitle = deriveChatTitlePure;

  // Guarda la conversación actual en la carpeta de chats (si tiene contenido)
  const archiveCurrentChat = (source: ChatMessage[], titleOverride?: string): SavedChat | null => {
    const chat = buildArchivedChat(source, titleOverride || activeChatTitle);
    if (!chat) return null;
    setSavedChats((prev) => [chat, ...prev]);
    return chat;
  };

  const stopStreamingQuietly = () => {
    if (isStreamingRef.current) {
      streamerRef.current.abort();
      setIsStreaming(false);
      setCurrentStreamingText("");
    }
  };

  // Nuevo chat: archiva el actual (si tiene mensajes) y arranca limpio
  const handleNewChat = () => {
    stopStreamingQuietly();
    const current = messagesRef.current;
    const archived = archiveCurrentChat(current);
    setMessages([]);
    setMessageQueue([]);
    setActiveChatTitle("");
    try {
      saveString(LS_KEYS.MESSAGES, "[]");
    } catch {}
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 💬 Nuevo chat iniciado.${archived ? ` El anterior quedó guardado como "${archived.title}".` : ""}`,
    ]);
  };

  // Abrir un chat guardado: intercambia el actual por el elegido
  const handleOpenChat = (id: string) => {
    const chat = savedChats.find((c) => c.id === id);
    if (!chat) return;
    stopStreamingQuietly();
    const current = messagesRef.current;
    setSavedChats((prev) => {
      const rest = prev.filter((c) => c.id !== id);
      const archived = buildArchivedChat(current, activeChatTitle);
      return archived ? [archived, ...rest] : rest;
    });
    setMessages(chat.messages);
    setActiveChatTitle(chat.title);
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 📂 Chat "${chat.title}" abierto (${chat.messages.length} mensajes).`,
    ]);
  };

  const handleDeleteChat = (id: string) => {
    const target = savedChats.find((c) => c.id === id);
    setSavedChats((prev) => prev.filter((c) => c.id !== id));
    if (target) {
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] 🗑️ Chat "${target.title}" eliminado de la carpeta.`,
      ]);
    }
  };

  const handleRenameChat = (id: string, title: string) => {
    const clean = title.trim().slice(0, 80);
    if (!clean) return;
    setSavedChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: clean } : c)));
  };

  const handleRenameActiveChat = (title: string) => {
    setActiveChatTitle(title.trim().slice(0, 80));
  };

  // Exportar sesión completa a un archivo JSON
  const handleExportSession = () => {
    const payload = {
      app: "CerebroNico-IDE-v1",
      version: 1,
      exportedAt: new Date().toISOString(),
      messages,
      workspaceFiles,
      currentModel,
      provider,
      temperature,
      responseLanguage,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    triggerFileDownload(blob, `cerebronico-ide-sesion-${Date.now()}.json`);
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 📦 Sesión exportada a JSON (${messages.length} mensajes, ${workspaceFiles.length} archivos).`,
    ]);
  };

  // Importar sesión desde un archivo JSON
  const handleImportSession = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data.messages)) {
          setMessages(data.messages);
          saveJSON(LS_KEYS.MESSAGES, data.messages);
        }
        if (Array.isArray(data.workspaceFiles)) {
          setWorkspaceFiles(data.workspaceFiles);
          saveJSON(LS_KEYS.WORKSPACE_FILES, data.workspaceFiles);
        }
        if (typeof data.currentModel === "string") {
          setCurrentModel(data.currentModel);
        }
        if (typeof data.temperature === "number") {
          setTemperature(data.temperature);
        }
        setTerminalLogs((l) => [
          ...l,
          `[${new Date().toLocaleTimeString()}] 📥 Sesión importada correctamente.`,
        ]);
      } catch (err) {
        setTerminalLogs((l) => [
          ...l,
          `[${new Date().toLocaleTimeString()}] ❌ Error importando sesión: ${(err as Error).message}`,
        ]);
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadZip = async () => {
    try {
      const zipBlob = await generateProjectZip(workspaceFiles);
      triggerFileDownload(zipBlob, `cerebronico-ide-proyecto-${Date.now()}.zip`);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Paquete ZIP exportado exitosamente.`,
      ]);
    } catch (err) {
      console.error("Error generando ZIP:", err);
    }
  };

  // Escribir los archivos del workspace en el sandbox (disco real del servidor)
  // ==========================================================================
  // v2.2 — ÓRDENES DEL CHAT: chat → CONVERSOR → EDITOR → PREVIEW
  // --------------------------------------------------------------------------
  // El camino del editor ya existía (bloques de código → mergeExtractedFiles →
  // syncToDisk → evento `cerebronico:autosync-done` que refresca el iframe).
  // Lo que faltaba era el CONVERSOR en medio: el modelo podía escribir archivos,
  // pero no pedir «convierte esto a YAML». Esto lo añade, y lo engancha al MISMO
  // camino en vez de montar uno paralelo.
  //
  // Todo lo que ocurre queda escrito en el registro: cada conversión, cada byte
  // de antes y después, y **cada pérdida declarada**. Un archivo que aparece en
  // el editor sin decir qué se perdió por el camino sería justo el fallo
  // silencioso que este proyecto no admite.
  // ==========================================================================
  async function aplicarOrdenesDelChat(texto: string): Promise<number> {
    const hora = () => new Date().toLocaleTimeString();
    const { ordenes, avisos } = extraerOrdenes(texto);
    for (const a of avisos) setTerminalLogs((l) => [...l, `[${hora()}] ⚠️ Orden ignorada: ${a}`]);
    if (ordenes.length === 0) return 0;

    const bloques: Array<{ language: string; filePath: string; content: string }> = [];
    let rutaAAbrir: string | null = null;
    let fallos = 0;
    let huboPlan = false;

    for (const o of ordenes) {
      if (o.tipo === "abrir") {
        rutaAAbrir = o.ruta;
        continue;
      }

      // ── IMAGEN: el IDE dibuja gratis y guarda el binario en el proyecto ──
      // El archivo NO entra en el workspace de texto (localStorage, tope 5 MB):
      // el servidor lo escribe directo en la raíz del proyecto. Aquí solo se
      // registra el resultado — con el modelo que respondió DE VERDAD y sus
      // advertencias, que es la parte que el usuario tiene que oír.
      if (o.tipo === "imagen") {
        let avisoImagen = false;
        try {
          const r = await fetch("/api/engine/imagen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: o.prompt,
              salida: o.salida,
              ancho: o.ancho,
              alto: o.alto,
              modelo: o.modelo,
              seed: o.seed,
            }),
          });
          const j = await r.json();
          if (!j?.ok) {
            setTerminalLogs((l) => [
              ...l,
              `[${hora()}] ✗ Imagen no generada: ${j?.error || "sin detalle"}`,
            ]);
            for (const f of j?.fallos || []) {
              setTerminalLogs((l) => [...l, `[${hora()}]    · ${f.proveedor}: ${f.motivo}`]);
            }
            fallos += 1;
            continue;
          }
          setTerminalLogs((l) => [
            ...l,
            `[${hora()}] 🖼️ Imagen: proveedor ${j.proveedor} · modelo REAL ${j.modeloUsado} · ${j.bytes} bytes · ${((j.ms || 0) / 1000).toFixed(1)} s` +
              (j.ruta ? ` · guardada en «${j.ruta}»` : j.url ? ` · ${j.url}` : ""),
          ]);
          for (const a of j?.advertencias || []) {
            setTerminalLogs((l) => [...l, `[${hora()}]    · aviso: ${a}`]);
          }
          for (const f of j?.fallos || []) {
            setTerminalLogs((l) => [...l, `[${hora()}]    · proveedor fallido/saltado: ${f.proveedor} → ${f.motivo}`]);
          }
          if (j.ruta) {
            avisoImagen = true;
          }
        } catch (e: any) {
          setTerminalLogs((l) => [...l, `[${hora()}] ✗ No se pudo generar la imagen: ${e?.message || e}`]);
          fallos += 1;
        }
        if (avisoImagen) {
          // La app del preview ya puede referirse a <img src="…/img/…">: se
          // remonta el iframe con el mismo mecanismo del conversor.
          window.dispatchEvent(new CustomEvent("cerebronico:autosync-done"));
        }
        continue;
      }

      // ── PLAN: el chat crea un plan del cerebro y lo lanza ────────────────
      // El plan ya viene VALIDADO por el motor (chatOrders usa `validarPlan`),
      // así que aquí sólo queda enviarlo. Si el servidor lo rechazara igualmente,
      // se dice el motivo; no se da por bueno un plan que no arrancó.
      if (o.tipo === "plan") {
        try {
          const r = await fetch("/api/brain/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              objetivo: o.objetivo,
              tareas: o.tareas,
              modelo: o.modelo,
              contexto: o.contexto,
              autoLanzar: o.autoLanzar,
            }),
          });
          const j = await r.json();
          if (!j?.ok) {
            setTerminalLogs((l) => [...l, `[${hora()}] ✗ Plan rechazado por el motor: ${j?.error || "sin detalle"}`]);
            fallos += 1;
            continue;
          }
          setTerminalLogs((l) => [
            ...l,
            `[${hora()}] 🧠 Plan ${j.planId} creado (${o.tareas.length} tarea/s): «${o.objetivo}».`,
          ]);
          if (j.lanzado?.ok) {
            setTerminalLogs((l) => [...l, `[${hora()}]    lanzado en segundo plano. Se ve en la pestaña Planificador.`]);
          } else {
            setTerminalLogs((l) => [
              ...l,
              `[${hora()}]    NO se lanzó${j.lanzado?.motivo ? `: ${j.lanzado.motivo}` : ""}. Está en el Planificador para revisarlo.`,
            ]);
          }
          huboPlan = true;
        } catch (e: any) {
          setTerminalLogs((l) => [...l, `[${hora()}] ✗ No se pudo crear el plan: ${e?.message || e}`]);
          fallos += 1;
        }
        continue;
      }

      // ── Reflejo v3.0 — 16 ACCIONES GENÉRICAS (analizar, explicar, resumir, …) ──
      // Aún no tienen ejecutores wired en el chat; el Reflejo las emite y aquí se
      // registra el intento en el log del terminal para que el usuario vea que
      // el motor las reconoció. Cuando se integre un ejecutor por acción, el
      // `console.log` se sustituye por un fetch a /api/engine/<accion>.
      if (o.tipo !== "convertir" && (o as any).datos && typeof (o as any).datos === "object") {
        const datos = (o as { tipo: string; datos: Record<string, string | undefined> }).datos;
        const resumen = Object.entries(datos)
          .filter(([, v]) => v && v.trim())
          .map(([k, v]) => `${k}=${v}`)
          .join(" · ");
        setTerminalLogs((l) => [
          ...l,
          `[${hora()}] 🧩 Reflejo v3.0 — orden «${o.tipo}» reconocida. Payload: ${resumen || "(vacío)"}. Aún sin ejecutor integrado; el modelo puede continuar el trabajo.`,
        ]);
        continue;
      }

      // El contenido sale del espacio de trabajo (lo que el usuario ve en el
      // editor), no del disco del sandbox: así se convierte lo que hay en pantalla.
      // (Reflejo v3.0 — antes este bloque se ejecutaba para cualquier orden
      // que no fuera abrir/imagen/plan. Ahora solo entra si es "convertir".)
      if (o.tipo === "convertir") {
        let contenido = o.contenido;
        if (o.archivo) {
          const f = workspaceFiles.find((w) => w.path === o.archivo || w.name === o.archivo);
          if (!f) {
            setTerminalLogs((l) => [
              ...l,
              `[${hora()}] ✗ Conversión ${o.desde}→${o.hacia}: no está «${o.archivo}» en el espacio de trabajo. Ábrelo o impórtalo primero.`,
            ]);
            fallos += 1;
            continue;
          }
          contenido = f.content;
        }

        try {
          const r = await fetch("/api/engine/convertir", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              formatoEntrada: o.desde,
              formatoSalida: o.hacia,
              contenido: contenido ?? "",
              opciones: o.opciones,
            }),
          });
          const j = await r.json();
          if (!j?.ok) {
            setTerminalLogs((l) => [...l, `[${hora()}] ✗ Conversión ${o.desde}→${o.hacia} fallida: ${j?.error || "sin detalle"}`]);
            fallos += 1;
            continue;
          }

          bloques.push({ language: o.hacia, filePath: o.salida, content: j.salida });
          setTerminalLogs((l) => [
            ...l,
            `[${hora()}] ✓ ${o.desde.toUpperCase()} → ${o.hacia.toUpperCase()}: «${o.salida}» (${j.informe.bytesEntrada} → ${j.informe.bytesSalida} bytes, ${j.informe.claves} clave/s).`,
          ]);
          // Las pérdidas se cuentan, una por una. No van a un tooltip: van al registro.
          for (const p of j.informe.perdidas) {
            setTerminalLogs((l) => [...l, `[${hora()}]    · pérdida declarada — ${p.que}: ${p.detalle}`]);
          }
          for (const av of j.informe.avisos) {
            setTerminalLogs((l) => [...l, `[${hora()}]    · aviso: ${av}`]);
          }
        } catch (e: any) {
          setTerminalLogs((l) => [...l, `[${hora()}] ✗ No se pudo convertir ${o.desde}→${o.hacia}: ${e?.message || e}`]);
          fallos += 1;
        }
        continue;
      }

      // Si llegamos aquí con un tipo no reconocido, lo decimos: nunca silencios.
      setTerminalLogs((l) => [...l, `[${hora()}] ✗ Orden «${o.tipo}» sin dispatcher en App.tsx. Reporta este caso.`]);
    }

    // EDITOR: los archivos convertidos entran en el espacio de trabajo y el
    // último se abre, para que el usuario VEA el resultado sin buscarlo.
    if (bloques.length > 0) {
      // Se lee del espejo y se escribe con el actualizador PURO. Así el recuento
      // que se registra es el real y no se duplica ninguna línea.
      const { updatedFiles, createdCount, updatedCount } = mergeExtractedFiles(workspaceFilesRef.current, bloques);
      setWorkspaceFiles((prev) => mergeExtractedFiles(prev, bloques).updatedFiles);
      setTerminalLogs((l) => [
        ...l,
        `[${hora()}] Editor actualizado por órdenes del chat: +${createdCount} creado(s), ~${updatedCount} actualizado(s).`,
      ]);
      const ultimo = bloques[bloques.length - 1];
      const nuevo = updatedFiles.find((f) => f.path === ultimo.filePath);
      if (nuevo) setActiveFileId(nuevo.id);
    }

    if (rutaAAbrir) {
      const f = workspaceFiles.find((w) => w.path === rutaAAbrir || w.name === rutaAAbrir);
      if (f) setActiveFileId(f.id);
      else setTerminalLogs((l) => [...l, `[${hora()}] ⚠️ No existe «${rutaAAbrir}» para abrir en el editor.`]);
    }

    // PREVIEW: el mismo mecanismo que ya usa el chat — escribir al sandbox y
    // avisar. Sin esto, el archivo se vería en el editor y el preview seguiría
    // mostrando la versión vieja.
    if (bloques.length > 0) {
      try {
        const escritos = await syncToDisk(false);
        if (escritos > 0) {
          setTerminalLogs((l) => [...l, `[${hora()}] 🔄 ${escritos} archivo(s) al sandbox: el preview se refresca.`]);
          window.dispatchEvent(new CustomEvent("cerebronico:autosync-done"));
        }
      } catch (e: any) {
        setTerminalLogs((l) => [...l, `[${hora()}] ✗ Los archivos están en el editor, pero no se pudieron llevar al sandbox: ${e?.message || e}`]);
      }
    }

    // PLANIFICADOR: si el chat creó un plan, se trae al frente la pestaña.
    // Un plan que corre donde nadie lo ve no es distinto de un plan que no corre:
    // el usuario tiene que VERLO. Y el evento fuerza la recarga del panel por si
    // ya estaba abierto (si no, el cambio de pestaña no lo remontaría y seguiría
    // enseñando la foto vieja).
    if (huboPlan) {
      setActiveCenterTab("planes");
      window.dispatchEvent(new CustomEvent("cerebronico:plan-creado"));
    }

    return bloques.length;
  }

  const syncToDisk = async (log = true): Promise<number> => {
    try {
      const res = await fetch("/api/fs/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: workspaceFiles.map((f) => ({ path: f.path, content: f.content })),
        }),
      });
      const data = await res.json();
      const written = data.written ?? 0;

      // ============================================================
      // v2.1 — ¿EL WORKSPACE TRAE EL CÓDIGO DEL CLIENTE?
      // ------------------------------------------------------------
      // El sandbox solo puede servir lo que recibe. Si el workspace va
      // incompleto, el puerto responde, la pestaña muestra el TÍTULO… y TODOS los
      // módulos dan 404 en el navegador, sin una sola pista en esta interfaz.
      // Es exactamente el síntoma que quedó sin explicar: "solo carga el título".
      // (Reproducido en local: /src/main.tsx devuelve 404 tanto si el servidor no
      // monta Vite como si el archivo no está en disco. Este chequeo separa las
      // dos causas ANTES de arrancar nada, en vez de adivinar.)
      // ============================================================
      // ============================================================
      // v2.1 — 🐞 ESTE DIAGNÓSTICO NUNCA LLEGABA A EJECUTARSE.
      // ------------------------------------------------------------
      // Estaba dentro de `if (log)`, y el piloto automático del sandbox llama a
      // esta función con log=false (para no llenar la consola en cada cambio).
      // Es decir: la única ruta que de verdad arranca el sandbox era justo la que
      // se saltaba la comprobación. Al pedirle al usuario "mándame la línea de
      // 🔎 Estructura del workspace" no aparecía por ningún lado, y parecía que
      // el chequeo no existía.
      // Ahora la comprobación se hace SIEMPRE; lo que depende de `log` es solo si
      // la línea informativa se imprime. La ALARMA se imprime siempre: si falta
      // código del cliente, el diagnóstico es demasiado importante para callarlo.
      // ============================================================
      const hora = new Date().toLocaleTimeString();
      const rutas = workspaceFiles.map((f) => String(f.path).replace(/\\/g, "/"));
      const tieneIndex = rutas.some((p) => /(^|\/)index\.html$/i.test(p));
      const tieneMain = rutas.some((p) => /(^|\/)src\/main\.[jt]sx?$/i.test(p));
      const comps = rutas.filter((p) => /(^|\/)src\/components\/[^/]+\.(tsx?|jsx?)$/i.test(p)).length;
      const engine = rutas.filter((p) => /(^|\/)src\/engine\/[^/]+$/i.test(p)).length;
      if (log) {
        setTerminalLogs((l) => [
          ...l,
          `[${hora}] 🔎 Estructura del workspace: ${rutas.length} archivos · index.html ${tieneIndex ? "✓" : "FALTA"} · src/main.tsx ${tieneMain ? "✓" : "FALTA"} · src/components ${comps} · src/engine ${engine}`,
        ]);
      }
      if (!tieneIndex || !tieneMain || comps === 0) {
        setTerminalLogs((l) => [
          ...l,
          `[${hora}] ❌ Al workspace le falta el código del cliente (index.html ${tieneIndex ? "✓" : "FALTA"} · src/main.tsx ${tieneMain ? "✓" : "FALTA"} · src/components ${comps}). El preview quedará EN BLANCO con 404 en /src/* aunque el puerto 3500 responda. Reimporta el ZIP del proyecto: la importación se cortó. NO es un fallo del sandbox.`,
        ]);
      }

      if (log) {
        setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] 💾 ${written} archivo(s) sincronizado(s) al sandbox.`]);
        // ============================================================
        // v2.1 — 🐞 El rechazo del guardián era INVISIBLE.
        // El log decía "38 archivo(s) escrito(s)" y el usuario no tenía forma de
        // saber qué pasó con los otros 2: parecía que el sistema "no escribe
        // todos los archivos". Ahora se dice cuáles y por qué.
        // ============================================================
        const rec: Array<{ path: string; issues?: string[] }> = Array.isArray(data.rejected) ? data.rejected : [];
        if (rec.length > 0) {
          const detalle = rec
            .slice(0, 3)
            .map((r) => `${r.path} (${r.issues?.[0] || "sintaxis dudosa"})`)
            .join(" · ");
          setTerminalLogs((l) => [
            ...l,
            `[${new Date().toLocaleTimeString()}] ⚠️ ${rec.length} archivo(s) con sintaxis dudosa: ${detalle}${rec.length > 3 ? ` … +${rec.length - 3}` : ""}`,
          ]);
        }
      }
      return written;
    } catch (err: any) {
      if (log) setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ❌ Error sincronizando: ${err.message}`]);
      return 0;
    }
  };

  const handleSyncToDisk = (): Promise<number> => {
    return syncToDisk(true);
  };

  // Sincronización silenciosa para el piloto automático del sandbox (sin logear cada cambio)
  const handleAutoSyncToSandbox = (): Promise<number> => {
    // TREGUA v1 — el piloto NO vuelca archivos mientras un chat (local o cloud)
    // está transmitiendo: sync y SSE comparten lazo. Pospone CON AVISO y el
    // piloto reintenta solo. El botón Sync manual nunca se pausa: pidió ahora.
    if (debePausarSync(isStreamingRef.current)) {
      setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${avisoPausaSync()}`]);
      return Promise.resolve(0);
    } /*TREGUA*/
    return syncToDisk(false);
  };

  // Traer del sandbox al editor los archivos que el agente haya escrito en disco
  const pullFromDisk = async (log = true): Promise<number> => {
    try {
      const treeRes = await fetch("/api/fs/tree");
      const treeData = await treeRes.json();
      const filePaths: string[] = Array.isArray(treeData.files) ? treeData.files : [];
      const toPull = filePaths.filter(
        (p) => !p.startsWith("node_modules/") && !p.startsWith(".git/") && !p.endsWith(".zip")
      );
      const pulled: WorkspaceFile[] = [];
      for (const relPath of toPull) {
        try {
          const r = await fetch(`/api/fs/read?path=${encodeURIComponent(relPath)}`);
          if (!r.ok) continue;
          const d = await r.json();
          if (typeof d.content === "string") {
            pulled.push({
              id: "disk-" + relPath,
              name: relPath.split("/").pop() || relPath,
              path: relPath,
              content: d.content,
              language: detectLanguageFromPath(relPath).id,
              size: d.content.length,
              modified: false,
            });
          }
        } catch {}
      }
      if (pulled.length > 0) {
        setWorkspaceFiles((prev) => {
          const map = new Map<string, WorkspaceFile>();
          prev.forEach((f) => map.set(f.path, f));
          pulled.forEach((f) => map.set(f.path, f));
          return Array.from(map.values());
        });
      }
      if (log) {
        setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] 📥 ${pulled.length} archivo(s) traídos del sandbox al editor.`]);
      }
      return pulled.length;
    } catch (err: any) {
      if (log) setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ❌ Error trayendo archivos: ${err.message}`]);
      return 0;
    }
  };

  const handlePullFromDisk = () => {
    pullFromDisk(true);
  };

  // Ejecutar el build en el sandbox
  const runBuild = async (installDeps: boolean) => {
    const command = installDeps
      ? "npm install --no-audit --no-fund && npm run build"
      : "npm run build";
    const res = await fetch("/api/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, timeoutMs: 180000 }),
    });
    return await res.json();
  };

  // Bucle autónomo: compila -> corrige -> recompila (hasta buildFixRef.max iteraciones)
  const runBuildFixIteration = async () => {
    const st = buildFixRef.current;
    if (!st.active) return;

    if (st.iteration === 0) {
      await syncToDisk(false);
    } else {
      // Traer los archivos que el agente escribió con herramientas y volver a sincronizar
      await pullFromDisk(false);
      await syncToDisk(false);
    }

    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 🔨 Compilando (iteración ${st.iteration + 1}/${st.max})...`,
    ]);

    let data: any;
    try {
      data = await runBuild(st.iteration === 0);
    } catch (err: any) {
      setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ❌ Error compilando: ${err.message}`]);
      buildFixRef.current.active = false;
      return;
    }

    if (data && data.exitCode === 0) {
      buildFixRef.current.active = false;
      await pullFromDisk(false);
      setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ✅ Compilación exitosa tras ${st.iteration + 1} iteración(es).`]);
      return;
    }

    st.iteration++;
    if (st.iteration >= st.max) {
      buildFixRef.current.active = false;
      setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ⚠️ Se alcanzó el máximo de ${st.max} iteraciones. Revisa los errores en la terminal.`]);
      return;
    }

    const errSummary = `${data?.stderr || ""}\n${data?.stdout || ""}`.slice(-4000);
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 🔁 Reenviando errores al modelo (iteración ${st.iteration + 1})...`,
    ]);
    afterStreamRef.current = runBuildFixIteration;
    handleSendMessage(
      `El proyecto falló al compilar. Usa las herramientas disponibles (write_file / run_command) para corregir los archivos y no te limites a explicar: actúa.\n\nERRORES DE COMPILACIÓN:\n${errSummary}`,
      []
    );
  };

  // Compilar y corregir (inicia el bucle autónomo)
  const handleBuildAndFix = () => {
    buildFixRef.current = { active: true, iteration: 0, max: 5 };
    runBuildFixIteration();
  };

  // Adjuntar archivos al workspace desde el explorador (CUALQUIER tipo).
  // Reutiliza processUploadedFile: los .zip se extraen solos, los PDF se
  // procesan, los binarios viajan como base64 y el texto entra limpio.
  const handleAttachFilesToWorkspace = async (fileArray: File[]) => {
    const newWorkspaceFiles: WorkspaceFile[] = [];
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 📎 Adjuntando ${fileArray.length} archivo(s) al workspace...`,
    ]);
    for (const file of fileArray) {
      try {
        const { workspaceFiles: extractedFiles } = await processUploadedFile(file);
        if (extractedFiles.length > 0) newWorkspaceFiles.push(...extractedFiles);
      } catch (err) {
        console.error("Error procesando adjunto:", err);
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ⚠️ No se pudo procesar "${file.name}": ${String(err).slice(0, 120)}`,
        ]);
      }
    }
    if (newWorkspaceFiles.length > 0) {
      setWorkspaceFiles((prev) => {
        const map = new Map<string, WorkspaceFile>();
        prev.forEach((f) => map.set(f.path, f));
        newWorkspaceFiles.forEach((f) => map.set(f.path, f)); // los nuevos ganan
        return Array.from(map.values());
      });
      setActiveFileId(newWorkspaceFiles[0].id);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ✅ ${newWorkspaceFiles.length} archivo(s) añadidos al árbol. Usa Sync/AUTO para verlos en el sandbox.`,
      ]);
    } else {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ Ningún archivo extraíble en la selección.`,
      ]);
    }
  };

  // Borrar TODO el workspace (botón "Borrar todo" del explorador).
  // 🔧 CORRECCIÓN CRÍTICA: NO restaurar automáticamente la plantilla base — eso era
  // el bug "borro y se regenera". Ahora dejamos el workspace realmente vacío.
  // 🔧 IMPORTANTE: se pueden borrar TODOS los archivos, incluidos MEMORIA.md y skills.md.
  // Las skills y la memoria base del motor viven en contextCache.ts (segundo plano,
  // no en el workspace del editor). El usuario puede dejar el workspace vacío e
  // ingresar solo lo adecuado para cada modelo.
  // 🔧 AISLAMIENTO: También detiene el sandbox Y borra los archivos del disco (.proyectos/)
  // para que no quede ninguna imagen/vista previa vieja pegada.
  const handleDeleteAllFiles = async () => {
    setWorkspaceFiles([]);
    setActiveFileId(null);
    // 🔧 NUCLEAR WIPE: borrar ABSOLUTAMENTE TODO del disco (.proyectos/) incluyendo
    // node_modules. Esto destruye por completo cualquier app que haya quedado pegada
    // (como "Mockup Studio"). La próxima vez que arranque el sandbox será como la
    // primera vez (npm install incluido).
    try {
      // Primero detener el sandbox (matar el proceso npm run dev)
      try { await fetch("/api/sandbox/stop", { method: "POST" }); } catch {}
      // Luego NUCLEAR WIPE — borrar TODO incluyendo node_modules.
      // v1.6.23 — RESCATE v1: el endpoint primero muda el estado de CerebroNico
      // (.cerebro-db, MEMORIA.md, skills.md) a la app y, si eso falla, ABORTA el
      // borrado con `ok: false`. Antes, un abort se logueaba como «0 archivos
      // borrados… vacío» — un éxito falso que tapaba la causa.
      const res = await fetch("/api/fs/nuclear-wipe", { method: "POST" });
      const data = await res.json();
      if (data?.ok === false) {
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ⚠️ WIPE ABORTADO: ${data.error || "motivo no informado por el motor"} — el workspace quedó vacío pero .proyectos NO se tocó. Arreglá el rescate y repetí.`,
        ]);
        return;
      }
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ☢️ NUCLEAR WIPE: ${data.deleted || 0} archivo(s) + ${data.deletedDirs || 0} carpeta(s) borrados. .proyectos completamente vacío. Sandbox destruido.` +
          (data?.rescate?.snapshot
            ? ` 🛟 Estado de CerebroNico mudado a ${data.rescate.snapshot}${data.rescate.docs?.length ? ` (incluye ${data.rescate.docs.join(", ")})` : ""}.`
            : "") +
          (typeof data?.resembrado === "number"
            ? ` 🌱 Re-sembrado ${data.resembrado} archivo(s) de estado: espejos y conocimiento siguen funcionando.` +
              (data?.erroresReSiembra?.length ? ` ⚠️ ${data.erroresReSiembra.join(" · ")}` : "")
            : ""),
      ]);
    } catch (e: any) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🗑️ Workspace vaciado (no se pudo hacer nuclear wipe: ${e?.message || e}).`,
      ]);
    }
  };

  // Restaurar la plantilla base (package.json, MEMORIA.md, skills.md, README.md, server.ts)
  // tras un borrado total o cuando el usuario quiere volver al estado inicial.
  const handleRestoreTemplate = () => {
    setWorkspaceFiles(INITIAL_WORKSPACE_FILES);
    setActiveFileId(INITIAL_WORKSPACE_FILES[0]?.id ?? null);
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 📋 Plantilla base restaurada (${INITIAL_WORKSPACE_FILES.length} archivos). Usa Sync para escribirla al sandbox.`,
    ]);
  };

  // ============================================================
  // EXTENSIÓN .cn (CerebroNico) — Contenedor tipo ZIP genérico
  // ------------------------------------------------------------
  // El archivo .cn es un ZIP renombrado con un manifest.json incluido.
  // Adentro entran TODO tipo de archivos: código (.ts, .tsx, .py, .js),
  // markdown (.md), JSON, imágenes (.png, .jpg), PDFs, binarios, etc.
  //
  // El usuario puede:
  //   - Guardar .cn  → descarga un ZIP con todos los archivos + manifest
  //   - Abrir .cn    → restaura el workspace completo desde el ZIP
  //   - Renombrar a .zip → inspeccionarlo en cualquier explorador (7-Zip, WinRAR)
  // ============================================================
  const handleExportCnFile = async () => {
    try {
      // 🔧 Pedir al usuario un nombre para el archivo (con default sugerido)
      const defaultName = `cerebronico-workspace-${new Date().toISOString().slice(0, 10)}`;
      const fileName = prompt(
        "Nombre del archivo .cn a guardar:",
        defaultName
      );
      if (!fileName || !fileName.trim()) {
        // Cancelado por el usuario
        return;
      }
      const cleanName = fileName.trim().replace(/\.(cn|zip|json)$/i, "");

      const blob = await generateCnFile(workspaceFiles, {
        currentModel,
        provider,
        temperature,
        responseLanguage,
        expertMode,
      });
      triggerFileDownload(blob, `${cleanName}.cn`);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 💾 Workspace empaquetado como "${cleanName}.cn" (ZIP): ${workspaceFiles.length} archivo(s), ${(blob.size / 1024).toFixed(1)} KB. Tip: renómbralo a .zip para inspeccionarlo en cualquier explorador.`,
      ]);
    } catch (err: any) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Error exportando .cn: ${err.message || err}`,
      ]);
      alert(`No se pudo exportar el archivo .cn: ${err.message || err}`);
    }
  };

  const handleImportCnFile = async (file: File) => {
    try {
      const result = await parseCnFile(file);
      const restoredFiles = result.files;
      if (restoredFiles.length === 0) {
        throw new Error("El archivo .cn no contenía archivos de texto válidos para restaurar.");
      }
      setWorkspaceFiles(restoredFiles);
      setActiveFileId(restoredFiles[0].id);

      // Restaurar metadatos opcionales del manifest
      const m = result.manifest;
      if (m) {
        if (typeof m.currentModel === "string" && m.currentModel) {
          setCurrentModel(m.currentModel);
        }
        if (typeof m.provider === "string") {
          const p = m.provider as ModelProvider;
          if (p === "ollama" || p === "gemini" || p === "openrouter" || p === "custom" || p === "openai") {
            setProvider(p);
          }
        }
        if (typeof m.temperature === "number") {
          setTemperature(m.temperature);
        }
        if (typeof m.responseLanguage === "string" && m.responseLanguage) {
          setResponseLanguage(m.responseLanguage);
          saveString(LS_KEYS.RESPONSE_LANGUAGE, m.responseLanguage);
        }
        if (typeof m.expertMode === "string" && m.expertMode) {
          setExpertMode(m.expertMode);
          saveString(LS_KEYS.EXPERT_MODE, m.expertMode);
        }
      }

      const extrasCount = result.extras.length;
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 📂 Workspace restaurado desde "${file.name}" — ${restoredFiles.length} archivo(s) de código${extrasCount > 0 ? ` + ${extrasCount} archivo(s) binario(s) (imágenes/PDFs)` : ""}.${m?.currentModel ? ` Modelo activo: ${m.currentModel}.` : ""}`,
      ]);
    } catch (err: any) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Error abriendo archivo .cn "${file.name}": ${err.message || err}`,
      ]);
      alert(`No se pudo abrir el archivo .cn: ${err.message || err}`);
    }
  };

  const handleCreateNewFile = () => {
    const fileName = prompt("Nombre del nuevo archivo (ej: Componente.tsx, worker.py):");
    if (fileName) {
      const newFile: WorkspaceFile = {
        id: "f-" + Date.now(),
        name: fileName.split("/").pop() || fileName,
        path: fileName,
        content: `// ${fileName}\n\n`,
        language: fileName.split(".").pop() || "typescript",
        size: 0,
        modified: true,
      };
      setWorkspaceFiles((prev) => [...prev, newFile]);
      setActiveFileId(newFile.id);
    }
  };

  const handlePurgeMemory = () => {
    setRamUsageMb(42);
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Memoria RAM optimizada. Buffers y cachés liberados (${ramUsageMb}MB -> 42MB).`,
    ]);
  };

  const handleAppendToMemoriaFile = (ruleText: string) => {
    setWorkspaceFiles((prev) =>
      prev.map((f) => {
        if (f.name.toLowerCase() === "memoria.md" || f.path === "MEMORIA.md") {
          return {
            ...f,
            content: f.content + "\n" + ruleText,
            size: f.content.length + ruleText.length,
            modified: true,
          };
        }
        return f;
      })
    );
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 🧠 MEMORIA.md actualizado en el workspace con nueva directiva.`,
    ]);
  };

  return (
    <div className="w-screen h-screen flex flex-col pb-[26px] bg-transparent text-zinc-100 overflow-hidden select-text font-sans" /* FOCO v1: 26 px reservados para la Espina — sin esto tapaba el textarea del chat y el clic no entraba */>
      {/* v2.0 — Fondo de la aplicación (heredado de la v1.9): el preset elegido
          en el panel Pro manda sobre la imagen personalizada. */}
      <AppBackground settings={proSettings} presetId={wallpaperPreset} customImageUrl={customBg || undefined} />

      {/* v2.0 — Menú contextual (click derecho), portapapeles y captura: funciona
          en toda la interfaz (chat, editor, terminal, preview, campos). */}
              <FondoLayer />{/* FONDO v1: capa z:-1 que asoma por los velillos de data-cn */}
      <ContextMenuRoot />

      {/* v2.0 — Pantalla de carga: cerebro arrancando el motor + comprobación real
          de Ollama, sandbox, puente y base de conocimiento. */}
      {isBooting && <BootSplash onReady={() => setIsBooting(false)} />}

      {/* Top Main Header */}
      <Header
        currentModel={currentModel}
        onOpenModelSelector={() => setIsModelSelectorOpen(true)}
        onOpenApiKeys={() => setIsApiKeyModalOpen(true)}
        telemetry={telemetry}
        workspaceFileCount={workspaceFiles.length}
        onDownloadZip={handleDownloadZip}
        isLeftOpen={isLeftOpen}
        onToggleLeft={() => setIsLeftOpen(!isLeftOpen)}
        isRightOpen={isRightOpen}
        onToggleRight={() => setIsRightOpen(!isRightOpen)}
        isSoundMuted={isSoundMuted}
        onToggleSound={() => setIsSoundMuted(!isSoundMuted)}
        ramUsageMb={ramUsageMb}
        maxRamGb={maxRamGb}
        responseLanguage={responseLanguage}
        onLanguageChange={(lang) => {
          setResponseLanguage(lang);
          saveString(LS_KEYS.RESPONSE_LANGUAGE, lang);
        }}
        expertMode={expertMode}
        onExpertModeChange={(mode) => {
          setExpertMode(mode);
          saveString(LS_KEYS.EXPERT_MODE, mode);
        }}
        onSaveCn={handleExportCnFile}
        onOpenCn={handleImportCnFile}
        activeView={activeView}
        // v2.0 — El "Modo Web" ya no cambia de vista: abre/cierra la pestaña
        // del editor web al lado del chat.
        onToggleWebEditor={() => {
          if (centerTabs.some((t) => t.id === "web-editor")) {
            closeCenterTab("web-editor");
            setActiveCenterTab("chat");
          } else {
            openWebEditorTab();
          }
        }}
        // ============================================================
        // v2.0 — Controles nuevos del Header
        // ============================================================
        appFontSize={appFontSize}
        onAppFontSizeChange={setAppFontSize}
        perfMode={perfMode}
        onPerfModeChange={setPerfMode}
        onOpenExtensions={() => setIsExtensionManagerOpen(true)}
        extensionCount={extensions.length}
        onOpenProConfig={() => setIsProConfigOpen(true)}
        onToggleFullscreen={toggleAppFullscreen}
        isFullscreen={isAppFullscreen}
        isStreaming={isStreaming}
        onOpenBgPicker={handleOpenBgPicker}
        hasCustomBg={!!customBg}
        onClearBg={handleClearBg}
        systemStats={systemStats}
        snapshots={snapshots}
        onRestoreSnapshot={handleRestoreSnapshot}
        onDeleteSnapshot={handleDeleteSnapshot}
        onShowSnapshotsPanel={() => setShowSnapshotsPanel(true)}
        onExportMarkdown={handleExportMarkdown}
        onOpenConfig={() => setIsConfigOpen(true)}
        // v1.1 — Z.ai wizard reopen:
        onOpenZaiWizard={() => {
          // Reset dismissed flag so the wizard shows again:
          try { localStorage.removeItem(LS_KEYS.ZAI_WIZARD_DISMISSED); } catch {}
          setIsZaiWizardOpen(true);
        }}
        zaiApiKey={zaiApiKey}
        isSLM={slmState.isSLM}
        slmCategory={slmState.category}
        slmParams={slmState.params}
      />

      {/* 🔧 Input oculto para seleccionar imagen de fondo de pantalla */}
      <input
        ref={bgInputRef}
        type="file"
        /* v8.0.1 — GIF añadido (defecto reportado: «me di cuenta que no admite
           gif»). Faltaba por dos sitios a la vez: este `accept` no lo listaba,
           así que el diálogo del sistema ni siquiera lo dejaba elegir, y el
           procesado de abajo lo habría aplastado a JPEG de todos modos. */
        accept="image/png,image/jpeg,image/webp,image/jpg,image/gif"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) handleBgFileSelected(picked);
          e.target.value = "";
        }}
      />

      {/* v2.0 — La vista dedicada "web-editor" de la v1.1 queda DESACTIVADA
          (código muerto intencional con `false ?`): el editor web es ahora una
          PESTAÑA central más, al lado del Chat, y ya no sustituye la interfaz.
          Se conserva para poder comparar sin rebuscar en el historial. */}
      {false ? (
        <div className="flex-1 flex overflow-hidden">
          {/* 🔧 MODO WEB EDITOR: chat (40%) + preview del sandbox (60%) lado a lado.
              Sin explorador de archivos, sin panel izquierdo, sin panel derecho.
              El usuario chatea con el modelo y este escribe el HTML/CSS que se
              previsualiza en vivo en el iframe :3500. */}
          <div className="w-2/5 min-w-[360px] max-w-[600px] border-r border-[#141d2e] flex flex-col overflow-hidden bg-[#0d121c]/85 backdrop-blur-md">
            <ChatCenter
              messages={messages}
              currentStreamingText={currentStreamingText}
              isStreaming={isStreaming}
              onSendMessage={sendDesdeChat}
              onStopStreaming={handleStopStreaming}
              currentModel={currentModel}
              onOpenModelSelector={() => setIsModelSelectorOpen(true)}
              pendingAttachments={pendingAttachments}
              pendingNames={attachmentsCargando}
              onAddAttachments={handleAddAttachments}
              onRemovePendingAttachment={handleRemovePendingAttachment}
              onClearPendingAttachments={() => setPendingAttachments([])}
              messageQueue={messageQueue}
              onRemoveQueuedMessage={handleRemoveQueuedMessage}
              onClearQueue={handleClearQueue}
              onResetSessionCache={handleClearSession}
              onRegenerate={handleRegenerate}
              onExportSession={handleExportSession}
              onImportSession={handleImportSession}
              agentTasks={agentTasks}
              actionLog={actionLog}
              savedChats={savedChats}
              activeChatTitle={activeChatTitle || deriveChatTitle(messages)}
              onNewChat={handleNewChat}
              onOpenChat={handleOpenChat}
              onDeleteChat={handleDeleteChat}
              onRenameChat={handleRenameChat}
              onRenameActiveChat={handleRenameActiveChat}
              isSoundMuted={isSoundMuted}
              activeFileName={workspaceFiles.find((f) => f.id === activeFileId)?.name || "MEMORIA.md"}
              openFilesCount={workspaceFiles.filter((f) => f.id === activeFileId || f.modified).length || 1}
              pcMode={pcMode}
              onTogglePcMode={() => setPcMode((v) => !v)}
            />
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* v2.1 — Esta instancia pasaba `onSendAIToChat`, una prop que el
                componente NO acepta desde la v2.0: se ignoraba EN SILENCIO. Es
                decir, en esta vista a pantalla completa el botón de orden directa
                no hacía nada y la barra de estado nunca se pintaba. Se cablea
                igual que la pestaña del editor, que sí lo hacía bien. */}
            <DedicatedWebEditorView
              sandboxUrl={SANDBOX_URL_CONST}
              onBackToIDE={() => setActiveView("ide")}
              onDirectOrder={sendWebEditorOrder}
              status={webEditorStatus}
              isBusy={isStreaming}
              activityLog={terminalLogs.slice(-40)}
              onClearActivityLog={() => setTerminalLogs([])}
              sandboxRunning={sandboxRunning}
            />
          </div>
        </div>
      ) : (
      <>

      {/* Main Workspace Layout with Flexible Resizable Columns */}
      <div className="flex-1 flex overflow-hidden relative select-text">
        {/* Left Sidebar (Config, Memory, Ports) */}
        {isLeftOpen && (
          <>
            <div
              style={{ width: `${leftWidth}px` }}
              className="h-full shrink-0 z-20 flex flex-col overflow-hidden bg-[#0d121c]/85 backdrop-blur-md"
            >
              <EspinaActividad />{/* COREO v1: franja fixed, no altera el layout */}
              <LeftSidebar
                provider={provider}
                onSelectProvider={setProvider}
                currentModel={currentModel}
                onSelectModel={setCurrentModel}
                availableModels={availableModels}
                ollamaUrl={ollamaUrl}
                onUpdateOllamaUrl={setOllamaUrl}
                temperature={temperature}
                onUpdateTemperature={setTemperature}
                telemetry={telemetry}
                onRefreshTelemetry={checkTelemetry}
                subagents={subagents}
                pcMode={pcMode}
                onTogglePcMode={() => setPcMode((v) => !v)}
                onReconnectAll={handleReconnectAll}
                isReconnecting={isReconnecting}
                onOpenModelSelector={() => setIsModelSelectorOpen(true)}
                onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
                maxRamGb={maxRamGb}
                onUpdateMaxRam={setMaxRamGb}
                onPurgeMemory={handlePurgeMemory}
                chatMessages={messages}
                onAppendToMemoriaFile={handleAppendToMemoriaFile}
                openrouterApiKey={openrouterApiKey}
                onUpdateOpenrouterApiKey={(key) => {
                  setOpenrouterApiKey(key);
                  saveString(LS_KEYS.OPENROUTER_KEY, key);
                }}
                customServerUrl={customServerUrl}
                onUpdateCustomServerUrl={(url) => {
                  setCustomServerUrl(url);
                  try {
                    saveString(LS_KEYS.CUSTOM_SERVER_URL, url);
                  } catch {}
                }}
                customApiKey={customApiKey}
                onUpdateCustomApiKey={(key) => {
                  setCustomApiKey(key);
                  try {
                    saveString(LS_KEYS.CUSTOM_API_KEY, key);
                  } catch {}
                }}
                onRefreshModels={() => fetchInstalledModels()}
                isRefreshingModels={isRefreshingModels}
              />
            </div>

            {/* Left Draggable Resizer Splitter */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingLeft(true);
              }}
              onDoubleClick={() => setLeftWidth(320)}
              title="Arrastra para ajustar el ancho del panel izquierdo (Doble clic para 320px)"
              className={`w-2 hover:w-2.5 -mr-1 -ml-1 h-full z-30 cursor-col-resize flex items-center justify-center group transition-colors select-none ${
                isDraggingLeft ? "bg-cyan-500/80 shadow-lg shadow-cyan-500/50" : "bg-transparent hover:bg-cyan-500/40"
              }`}
            >
              <div className={`w-[2px] rounded-full transition-all ${
                isDraggingLeft ? "h-24 bg-cyan-300 shadow-sm" : "h-10 bg-zinc-700 group-hover:bg-cyan-400 group-hover:h-20"
              }`} />
            </div>
          </>
        )}

        {/* v2.0 — COLUMNA CENTRAL CON PESTAÑAS.
            El Chat es una pestaña más (fija, no se puede cerrar) y el Editor web
            o cualquier extensión se abren AL LADO, sin sustituir la interfaz.
            Esto es lo que pedías: herramientas externas "en una pestaña tipo chat". */}
        <div className="flex-1 h-full min-w-[220px] flex flex-col z-10 overflow-hidden">
          <CenterTabBar
            tabs={centerTabs}
            activeId={activeCenterTab}
            onSelect={setActiveCenterTab}
            onClose={closeCenterTab}
            isFullscreen={isAppFullscreen}
            onToggleFullscreen={toggleAppFullscreen}
            right={
              <span className="flex items-center gap-1.5">
                {isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
                {currentModel}
              </span>
            }
          />
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className={activeCenterTab === "chat" ? "flex-1 min-h-0 flex flex-col" : "hidden"}>
          <ChatCenter
            messages={messages}
            currentStreamingText={currentStreamingText}
            isStreaming={isStreaming}
            onSendMessage={sendDesdeChat}
            onStopStreaming={handleStopStreaming}
            currentModel={currentModel}
            onOpenModelSelector={() => setIsModelSelectorOpen(true)}
            pendingAttachments={pendingAttachments}
              pendingNames={attachmentsCargando}
            onAddAttachments={handleAddAttachments}
            onRemovePendingAttachment={handleRemovePendingAttachment}
            onClearPendingAttachments={() => setPendingAttachments([])}
            messageQueue={messageQueue}
            onRemoveQueuedMessage={handleRemoveQueuedMessage}
            onClearQueue={handleClearQueue}
            onResetSessionCache={handleClearSession}
            onRegenerate={handleRegenerate}
            onExportSession={handleExportSession}
            onImportSession={handleImportSession}
            agentTasks={agentTasks}
            actionLog={actionLog}
            savedChats={savedChats}
            activeChatTitle={activeChatTitle || deriveChatTitle(messages)}
            onNewChat={handleNewChat}
            onOpenChat={handleOpenChat}
            onDeleteChat={handleDeleteChat}
            onRenameChat={handleRenameChat}
            onRenameActiveChat={handleRenameActiveChat}
            isSoundMuted={isSoundMuted}
            activeFileName={workspaceFiles.find((f) => f.id === activeFileId)?.name || "MEMORIA.md"}
            openFilesCount={workspaceFiles.filter((f) => f.id === activeFileId || f.modified).length || 1}
            pcMode={pcMode}
            onTogglePcMode={() => setPcMode((v) => !v)}
          />
          </div>

          {/* v2.0 — Pestaña del EDITOR WEB: alimentada por orden directa y con
              estado real (ya no depende del chat central). */}
          {activeCenterTab === "web-editor" && (
            <DedicatedWebEditorView
              sandboxUrl={SANDBOX_URL_CONST}
              onBackToIDE={() => setActiveCenterTab("chat")}
              onDirectOrder={sendWebEditorOrder}
              status={webEditorStatus}
              isBusy={isStreaming}
              activityLog={terminalLogs.slice(-40)}
              onClearActivityLog={() => setTerminalLogs([])}
              sandboxRunning={sandboxRunning}
              /* ============================================================
                 v2.1 — 🐞 SEGUNDO CHAT ELIMINADO.
                 Esta vista montaba SU PROPIO ChatCenter, así que había dos chats
                 vivos a la vez, con estado independiente: lo que escribías en uno
                 no estaba en el otro, y el usuario escribía en uno creyendo que
                 era el mismo. El flujo queda simple y de una sola dirección:
                   1) el chat central envía la orden con el código
                   2) el editor web la ensambla
                   3) el previsualizador la reproduce
                 Por eso ya no se pasa chatSlot: hay UN solo chat, el central.
                 ============================================================ */
            />
          )}

          {/* v2.0 — Pestañas de EXTENSIONES: cada una es un iframe aislado con su
              propio puente de permisos. Si la extensión declaró herramientas,
              el modelo puede llamarlas mientras su pestaña esté abierta. */}
          {(() => {
            if (!activeCenterTab.startsWith("ext:")) return null;
            const extId = activeCenterTab.slice(4);
            const ext = extensions.find((e) => e.manifest.id === extId);
            if (!ext) {
              return (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-400 text-sm">
                  <span>La extensión "{extId}" ya no está instalada o está deshabilitada.</span>
                  <button
                    onClick={() => reloadExtensions()}
                    className="px-3 py-1.5 rounded bg-[#0d121c] border border-[#162034] text-xs hover:text-cyan-300"
                  >
                    Recargar extensiones
                  </button>
                </div>
              );
            }
            return (
              <ExtensionPanelView
                extension={ext}
                pendingCommandId={pendingExtCommand?.extId === extId ? pendingExtCommand.commandId : undefined}
                workspaceFiles={workspaceFiles.map((f) => ({ path: f.path, content: f.content }))}
                chatMessages={messages.map((m) => ({ role: m.role, content: m.content }))}
                onChatMessage={(text) => handleSendMessageWithRAG(text, [])}
                onLog={(line) => setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${line}`])}
                onError={(msg) => setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ⚠️ ${msg}`])}
              />
            );
          })()}

          {/* v2.0 — Pestaña de AUTOSUPERACIÓN: KPIs, tendencia, lecciones y
              estado de la resiliencia. Es la prueba numérica de que el sistema
              se supera (o de que algo hay que cambiar). */}
          {activeCenterTab === "self-improvement" && (
            <SelfImprovementPanel
              summary={improvementSummary}
              lastLesson={lastLesson}
              onRefresh={() => setImprovementSummary(getImprovementSummary())}
              onLog={(line) => setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${line}`])}
            />
          )}
          {/* v2.2 — El cerebro de tareas. Cada aviso que genera va también al log
              de la terminal, para que quede junto al resto de la actividad. */}
          {activeCenterTab === "planes" && (
            <div className="flex-1 min-h-0 flex flex-col">
              <PlansPanel />
            </div>
          )}
          {/* QUIRÓFANO HD v1 — la sala de operaciones del guardián de cambios. */}
          {activeCenterTab === "quirofano" && (
            <PanelQuirofano />
          )}
          </div>
        </div>

        {/* Right Sidebar (Sandbox, Editor con pestañas de scroll fluido, Entregables) */}
        {isRightOpen && (
          <>
            {/* Right Draggable Resizer Splitter */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingRight(true);
              }}
              onDoubleClick={() => setRightWidth(540)}
              title="Arrastra para ajustar el ancho del editor/sandbox (Doble clic para 540px)"
              className={`w-2 hover:w-2.5 -mr-1 -ml-1 h-full z-30 cursor-col-resize flex items-center justify-center group transition-colors select-none ${
                isDraggingRight ? "bg-cyan-500/80 shadow-lg shadow-cyan-500/50" : "bg-transparent hover:bg-cyan-500/40"
              }`}
            >
              <div className={`w-[2px] rounded-full transition-all ${
                isDraggingRight ? "h-24 bg-cyan-300 shadow-sm" : "h-10 bg-zinc-700 group-hover:bg-cyan-400 group-hover:h-20"
              }`} />
            </div>

            <div
              style={{ width: `${rightWidth}px` }}
              className="h-full shrink-0 z-20 flex flex-col overflow-hidden bg-[#0d121c]/85 backdrop-blur-md"
            >
              <RightSidebar
                files={workspaceFiles}
                activeFileId={activeFileId}
                onSelectFile={(id) => setActiveFileId(id)}
                onCloseFile={(id) => {
                  const remaining = workspaceFiles.filter((f) => f.id !== id);
                  setWorkspaceFiles(remaining);
                  if (activeFileId === id && remaining.length > 0) {
                    setActiveFileId(remaining[0].id);
                  }
                }}
                onUpdateFileContent={(id, content) => {
                  setWorkspaceFiles((prev) =>
                    prev.map((f) => (f.id === id ? { ...f, content, size: content.length, modified: true } : f))
                  );
                }}
                onCreateNewFile={handleCreateNewFile}
                onDeleteFile={(id) => {
                  setWorkspaceFiles((prev) => prev.filter((f) => f.id !== id));
                }}
                onAttachFiles={handleAttachFilesToWorkspace}
                onDeleteAllFiles={handleDeleteAllFiles}
                onRestoreTemplate={handleRestoreTemplate}
                onExportCnFile={handleExportCnFile}
                onImportCnFile={handleImportCnFile}
                onDownloadZip={handleDownloadZip}
                terminalLogs={terminalLogs}
                onSyncProject={handleSyncToDisk}
                onAutoSync={handleAutoSyncToSandbox}
                onPullProject={handlePullFromDisk}
                onBuildProject={handleBuildAndFix}
              />
            </div>
          </>
        )}
      </div>
      </>
      )}

      {/* Model Selection Modal */}
      <ModelSelectorModal
        isOpen={isModelSelectorOpen}
        onClose={() => setIsModelSelectorOpen(false)}
        currentModel={currentModel}
        installedOllamaModels={availableModels.map((m) => m.name)}
        detectedGeminiModels={detectedGeminiModels}
        detectedOpenRouterModels={detectedOpenRouterModels}
        detectedOpenaiModels={detectedOpenaiModels}
        // v1.1 — Z.ai (GLM) free models always visible (auto-cargados al arranque):
        detectedZaiModels={detectedZaiModels}
        onRefreshModels={() => fetchInstalledModels()}
        onRefreshGeminiModels={fetchGeminiFreeModels}
        onRefreshOpenRouterModels={fetchOpenRouterFreeModels}
        onRefreshOpenaiModels={fetchOpenaiAvailableModels}
        onRefreshZaiModels={fetchZaiFreeModels}
        onRefreshCustomModels={fetchCustomModels}
        onRedetectAll={redetectAllModels}
        isRefreshing={isRefreshingModels}
        isDetectingGemini={isDetectingGemini}
        isDetectingOpenRouter={isDetectingOpenRouter}
        isDetectingOpenai={isDetectingOpenai}
        isDetectingZai={isDetectingZai}
        isRedetectingAll={isRedetectingAll}
        onSelectModel={(modelName) => {
          setCurrentModel(modelName);
          // v1.6.22 — LOCAL PRIMERO: un modelo instalado en Ollama es local aunque
          // su nombre empiece por "glm-", "gemini", "gpt", etc. (caso real:
          // `glm-ocr:latest` local se mandaba a Z.ai y devolvía «Unknown Model»).
          setProvider(proveedorParaModelo(modelName, availableModels.map((m) => m.name)));
          setTerminalLogs((prev) => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] Modelo activo actualizado a: ${modelName}`,
          ]);
        }}
      />

      {/* API Key and Server Slots Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        provider={provider}
        onSelectProvider={setProvider}
        openrouterApiKey={openrouterApiKey}
        onUpdateOpenrouterApiKey={(key) => {
          setOpenrouterApiKey(key);
          saveString(LS_KEYS.OPENROUTER_KEY, key);
        }}
        geminiApiKey={geminiApiKey}
        onUpdateGeminiApiKey={(key) => {
          setGeminiApiKey(key);
          saveString(LS_KEYS.GEMINI_API_KEY, key);
        }}
        onDetectGeminiModels={fetchGeminiFreeModels}
        isDetectingGemini={isDetectingGemini}
        onDetectOpenRouterModels={fetchOpenRouterFreeModels}
        isDetectingOpenRouter={isDetectingOpenRouter}
        ollamaUrl={ollamaUrl}
        onUpdateOllamaUrl={(url) => {
          setOllamaUrl(url);
          saveString(LS_KEYS.OLLAMA_URL, url);
        }}
        customServerUrl={customServerUrl}
        onUpdateCustomServerUrl={(url) => {
          setCustomServerUrl(url);
          try {
            saveString(LS_KEYS.CUSTOM_SERVER_URL, url);
          } catch {}
        }}
        customApiKey={customApiKey}
        onUpdateCustomApiKey={(key) => {
          setCustomApiKey(key);
          try {
            saveString(LS_KEYS.CUSTOM_API_KEY, key);
          } catch {}
        }}
        openaiApiKey={openaiApiKey}
        onUpdateOpenaiApiKey={(key) => {
          setOpenaiApiKey(key);
          saveString(LS_KEYS.OPENAI_API_KEY, key);
        }}
        onDetectOpenaiModels={fetchOpenaiAvailableModels}
        isDetectingOpenai={isDetectingOpenai}
        // v1.1 — Dedicated cloud provider keys:
        zaiApiKey={zaiApiKey}
        onUpdateZaiApiKey={(key) => {
          setZaiApiKey(key);
          saveString(LS_KEYS.ZAI_API_KEY, key);
        }}
        onDetectZaiModels={fetchZaiFreeModels}
        isDetectingZai={isDetectingZai}
        groqApiKey={groqApiKey}
        onUpdateGroqApiKey={(key) => {
          setGroqApiKey(key);
          saveString(LS_KEYS.GROQ_API_KEY, key);
        }}
        cerebrasApiKey={cerebrasApiKey}
        onUpdateCerebrasApiKey={(key) => {
          setCerebrasApiKey(key);
          saveString(LS_KEYS.CEREBRAS_API_KEY, key);
        }}
        togetherApiKey={togetherApiKey}
        onUpdateTogetherApiKey={(key) => {
          setTogetherApiKey(key);
          saveString(LS_KEYS.TOGETHER_API_KEY, key);
        }}
        mistralApiKey={mistralApiKey}
        onUpdateMistralApiKey={(key) => {
          setMistralApiKey(key);
          saveString(LS_KEYS.MISTRAL_API_KEY, key);
        }}
        deepseekApiKey={deepseekApiKey}
        onUpdateDeepseekApiKey={(key) => {
          setDeepseekApiKey(key);
          saveString(LS_KEYS.DEEPSEEK_API_KEY, key);
        }}
        fireworksApiKey={fireworksApiKey}
        onUpdateFireworksApiKey={(key) => {
          setFireworksApiKey(key);
          saveString(LS_KEYS.FIREWORKS_API_KEY, key);
        }}
      />

      {/* 🔧 ConfigModal: Panel de Control y Compatibilidad */}
      <ConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        config={ideConfig}
        onUpdate={handleUpdateConfig}
      />

      {/* ============================================================
          v2.0 — PANEL DE CONFIGURACIÓN PRO (menú de la 1.8 portado y ampliado)
          ============================================================ */}
      <ProConfigPanel
        open={isProConfigOpen}
        settings={proSettings}
        onClose={() => setIsProConfigOpen(false)}
        onChange={(patch) => setProSettings((prev) => ({ ...prev, ...patch } as ProSettings))}
        /* v2.1 — `onReplaceAll` es OBLIGATORIA en ProConfigPanel y NO se pasaba,
           así que «restaurar valores por defecto» (ProConfigPanel.tsx:180 y :474)
           e «importar ajustes» (:457) lanzaban `onReplaceAll is not a function`:
           dos botones muertos. Se pasa sin fusionar, que es justo lo que la
           distingue de `onChange`: reemplaza el juego entero. El guardado lo hace
           el efecto de App.tsx:990, igual que con `onChange`. */
        onReplaceAll={(s) => setProSettings(s)}
        /* v1.7.1 — la imagen de «Imagen propia» se aplica AL INSTANTE.
           El panel la guarda en IndexedDB (blob); aquí se pinta y se libera la
           URL de objeto anterior, para no quedarse con dos fondos en memoria. */
        onWallpaperListo={(imagen: Blob) => {
          const url = urlDeFondo(imagen);
          revocarFondo(fondoUrlRef.current);
          fondoUrlRef.current = url;
          setCustomBg(url);
        }}
        /* v1.15.1 — Cuando el usuario elige preset, URL o apaga el fondo desde el
           panel Pro, hay que soltar la imagen personalizada (customBg) para que lo
           que acaba de elegir tenga prioridad visible. */
        onWallpaperClear={() => {
          revocarFondo(fondoUrlRef.current);
          fondoUrlRef.current = "";
          setCustomBg("");
        }}
        presetId={wallpaperPreset}
        onPresetChange={setWallpaperPreset}
        /* v1.6.33 — aquí vivía `version="2.0.0"`: la pestaña «Acerca de» mostraba
           ese literal mientras la cabecera mostraba IDE_BRAND. Se retira: el
           panel lee la versión de la semilla única y no admite otra por prop. */
      />

      {/* ============================================================
          v2.0 — GESTOR DE EXTENSIONES: cada panel se abre en su pestaña
          ============================================================ */}
      <ExtensionManager
        open={isExtensionManagerOpen}
        extensions={extensions}
        onClose={() => setIsExtensionManagerOpen(false)}
        onReload={() => reloadExtensions()}
        onToggle={async (id, enabled) => {
          await setExtensionEnabled(id, enabled);
          reloadExtensions();
        }}
        onInstall={async (file) => {
          const res = await installExtensionZip(file);
          if (res.ok) reloadExtensions();
          return res;
        }}
        onUninstall={async (id) => {
          await uninstallExtension(id);
          // Si la pestaña de esa extensión estaba abierta, se cierra.
          closeCenterTab(`ext:${id}`);
          reloadExtensions();
        }}
        onOpenPanel={(ext) => {
          openExtensionTab(ext);
          setIsExtensionManagerOpen(false);
        }}
      />

      {/* v1.1 — Asistente de bienvenida Z.ai (GLM-4.5-Flash GRATIS) */}
      <ZaiWizard
        isOpen={isZaiWizardOpen}
        onClose={() => {
          try {
            localStorage.setItem(LS_KEYS.ZAI_WIZARD_DISMISSED, "1");
          } catch {}
          setIsZaiWizardOpen(false);
        }}
        zaiApiKey={zaiApiKey}
        onUpdateZaiApiKey={(key) => {
          setZaiApiKey(key);
          saveString(LS_KEYS.ZAI_API_KEY, key);
          // Marcar el wizard como visto para que no vuelva a aparecer solo:
          try {
            localStorage.setItem(LS_KEYS.ZAI_WIZARD_DISMISSED, "1");
          } catch {}
        }}
        onOpenApiKeyModal={() => {
          setIsZaiWizardOpen(false);
          try {
            localStorage.setItem(LS_KEYS.ZAI_WIZARD_DISMISSED, "1");
          } catch {}
          setIsApiKeyModalOpen(true);
        }}
      />
    </div>
  );
};
