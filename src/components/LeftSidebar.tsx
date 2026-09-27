import React, { useState, useEffect } from "react";
import {
  Activity,
  Bot,
  Brain,
  CheckCircle2,
  Cpu,
  Globe,
  HardDrive,
  Key,
   Layers,
   Network,
   Radio,
   RefreshCw,
   Server,
  Settings,
  ShieldAlert,
  Sliders,
  Sparkles,
  Zap,
  Plus,
  Trash2,
  BookOpen,
  Wand2,
  ArrowRight,
} from "lucide-react";
import { ChatMessage, ModelProvider, PortTelemetry, SubagentItem } from "../types";
import {
  addMemoryRule,
  autoImproveMemory,
  deleteMemoryRule,
  loadMemoryRules,
  MemoryRule,
} from "../utils/memory";
import {
  addLanguageMemoryEntry,
  deleteLanguageMemoryEntry,
  LanguageMemoryEntry,
  loadLanguageMemories,
} from "../utils/languageMemory";

interface LeftSidebarProps {
  provider: ModelProvider;
  onSelectProvider: (p: ModelProvider) => void;
  currentModel: string;
  onSelectModel: (m: string) => void;
  availableModels: { name: string; size?: number; details?: any }[];
  ollamaUrl: string;
  onUpdateOllamaUrl: (url: string) => void;
  temperature: number;
  onUpdateTemperature: (t: number) => void;
  telemetry: PortTelemetry;
  onRefreshTelemetry: () => void;
  subagents?: { bridge: string; items: SubagentItem[] };
  pcMode?: boolean;
  onTogglePcMode?: () => void;
  onReconnectAll?: () => void;
  isReconnecting?: boolean;
  onOpenModelSelector: () => void;
  onOpenApiKeyModal?: () => void;
  maxRamGb?: number;
  onUpdateMaxRam?: (ram: number) => void;
  onPurgeMemory?: () => void;
  chatMessages?: ChatMessage[];
  onAppendToMemoriaFile?: (ruleText: string) => void;
  openrouterApiKey?: string;
  onUpdateOpenrouterApiKey?: (key: string) => void;
  customServerUrl?: string;
  onUpdateCustomServerUrl?: (url: string) => void;
  customApiKey?: string;
  onUpdateCustomApiKey?: (key: string) => void;
  onRefreshModels?: () => void;
  isRefreshingModels?: boolean;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  provider,
  onSelectProvider,
  currentModel,
  onSelectModel,
  availableModels,
  ollamaUrl,
  onUpdateOllamaUrl,
  temperature,
  onUpdateTemperature,
  telemetry,
  onRefreshTelemetry,
  subagents,
  pcMode = false,
  onTogglePcMode,
  onReconnectAll,
  isReconnecting = false,
  onOpenModelSelector,
  onOpenApiKeyModal,
  maxRamGb = 8,
  onUpdateMaxRam,
  onPurgeMemory,
  chatMessages = [],
  onAppendToMemoriaFile,
  openrouterApiKey = "",
  onUpdateOpenrouterApiKey,
  customServerUrl = "",
  onUpdateCustomServerUrl,
  customApiKey = "",
  onUpdateCustomApiKey,
  onRefreshModels,
  isRefreshingModels = false,
}) => {
  const [activeTab, setActiveTab] = useState<"config" | "memory" | "ports">("config");
  
  // Memory & Brain State
  const [memoryRules, setMemoryRules] = useState<MemoryRule[]>([]);
  const [langMemories, setLangMemories] = useState<LanguageMemoryEntry[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [newInstruction, setNewInstruction] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryRule["category"]>("architecture");
  const [autoImproveFeedback, setAutoImproveFeedback] = useState<string | null>(null);
  const [isAutoImproveEnabled, setIsAutoImproveEnabled] = useState(true);
  const [memorySubTab, setMemorySubTab] = useState<"rules" | "add" | "autolearn" | "idioms">("rules");

  // Load rules on mount
  useEffect(() => {
    setMemoryRules(loadMemoryRules());
    setLangMemories(loadLanguageMemories());
  }, []);

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic.trim() || !newInstruction.trim()) return;

    const created = addMemoryRule({
      topic: newTopic.trim(),
      instruction: newInstruction.trim(),
      category: newCategory,
    });

    setMemoryRules(loadMemoryRules());
    if (onAppendToMemoriaFile) {
      onAppendToMemoriaFile(`\n- **${created.topic}**: ${created.instruction}`);
    }

    setNewTopic("");
    setNewInstruction("");
    setMemorySubTab("rules");
    setAutoImproveFeedback(`Regla añadida al cerebro: "${created.topic}"`);
    setTimeout(() => setAutoImproveFeedback(null), 3000);
  };

  const handleDeleteRule = (id: string) => {
    deleteMemoryRule(id);
    setMemoryRules(loadMemoryRules());
  };

  const handleRunAutoImprove = () => {
    const result = autoImproveMemory(chatMessages);
    setMemoryRules(loadMemoryRules());
    setAutoImproveFeedback(result.summary);
    if (onAppendToMemoriaFile && result.addedRules.length > 0) {
      result.addedRules.forEach((r) => {
        onAppendToMemoriaFile(`\n- **[Automejora] ${r.topic}**: ${r.instruction}`);
      });
    }
    setTimeout(() => setAutoImproveFeedback(null), 4000);
  };


  return (
    <aside data-cn="explorador" className="w-full h-full flex flex-col bg-[#03050a] border-r border-[#121a2c] overflow-hidden text-xs">
      {/* Tab Navigation */}
      <div className="h-10 bg-[#060912] border-b border-[#121a2c] flex items-center justify-around px-1 shrink-0">
        <button
          onClick={() => setActiveTab("config")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium transition-all ${
            activeTab === "config"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
          title="Configuración de Modelos y Servidores"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Motor</span>
        </button>

        <button
          onClick={() => setActiveTab("memory")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium transition-all ${
            activeTab === "memory"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
          title="Banco de Memoria CerebroNico"
        >
          <Brain className="w-3.5 h-3.5" />
          <span>Memoria</span>
        </button>

        <button
          onClick={() => setActiveTab("ports")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium transition-all ${
            activeTab === "ports"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
          title="Telemetría de Puertos 3000, 5000, 11434"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Puertos</span>
        </button>
      </div>

      {/* TAB CONTENT: CONFIG & ENGINE */}
      {activeTab === "config" && (
        <div className="flex-1 p-4 space-y-4 overflow-y-auto custom-scrollbar bg-[#020408]/85 backdrop-blur-md">
          {/* Quick API Slots Banner — botón único al modal completo */}
          <div className="p-3 bg-gradient-to-r from-cyan-950/60 to-blue-950/60 border border-cyan-500/40 rounded-xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Ranuras de API Keys</h4>
                <p className="text-[10px] text-zinc-400">OpenAI · Gemini · OpenRouter · Custom · Groq · Cerebras</p>
              </div>
            </div>
            {onOpenApiKeyModal && (
              <button
                onClick={onOpenApiKeyModal}
                className="px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 rounded-md text-[11px] font-medium transition-all"
              >
                Abrir Ranuras
              </button>
            )}
          </div>

          {/* Provider Selection */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
              Proveedor de Inferencia
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(["ollama", "gemini", "openrouter", "custom"] as ModelProvider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => onSelectProvider(p)}
                  className={`px-3 py-2 rounded-lg border text-left font-mono font-medium capitalize transition-all ${
                    provider === p
                      ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                      : "bg-[#060913] border-[#131b2c] text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  {p === "ollama" ? "🦙 Ollama Local" : p}
                </button>
              ))}
            </div>
          </div>

          {/* Ollama Host URL */}
          {provider === "ollama" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                Endpoint Servidor Ollama
              </label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => onUpdateOllamaUrl(e.target.value)}
                placeholder="http://127.0.0.1:11434"
                className="w-full bg-[#060913] border border-[#182338] rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono outline-none focus:border-cyan-500"
              />
            </div>
          )}

          {/* 🔧 Ranuras de API eliminadas del LeftSidebar — ahora solo viven en el
              modal "Ranuras de API Keys" (botón "Abrir Ranuras" arriba).
              Antes estaban duplicadas aquí y en el ApiKeyModal, ocupando espacio innecesario. */}

          {/* Active Model Selector Card */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                Modelo Activo
              </label>
              <div className="flex items-center gap-2">
                {onRefreshModels && (
                  <button
                    onClick={onRefreshModels}
                    disabled={isRefreshingModels}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 transition-colors"
                    title="Autodetectar modelos locales en Ollama"
                  >
                    <RefreshCw className={`w-2.5 h-2.5 ${isRefreshingModels ? "animate-spin text-amber-400" : ""}`} />
                    <span>{isRefreshingModels ? "Buscando..." : "Autodetectar"}</span>
                  </button>
                )}
                <button
                  onClick={onOpenModelSelector}
                  className="text-[10px] text-cyan-400 hover:underline font-mono"
                >
                  Catálogo ({availableModels.length})
                </button>
              </div>
            </div>

            <div className="p-3 bg-[#050811] border border-cyan-500/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-cyan-300 text-sm truncate">
                  {currentModel}
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/40">
                  Activo
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Asignado para orquestación, compilación de archivos y refactorización continua.
              </p>
              <button
                onClick={onOpenModelSelector}
                className="w-full py-1.5 bg-[#0a101f] hover:bg-[#0f172e] border border-[#182338] text-zinc-200 rounded-lg font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Radio className="w-3.5 h-3.5 text-cyan-400" />
                <span>Explorar Modelos & Autodetección</span>
              </button>
            </div>
          </div>

          {/* Temperature Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-zinc-300">
              <label className="text-[11px] font-semibold uppercase tracking-wider">
                Temperatura de Inferencia
              </label>
              <span className="font-mono text-cyan-300">{temperature}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.2"
              step="0.05"
              value={temperature}
              onChange={(e) => onUpdateTemperature(parseFloat(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>0.1 (Precisión Técnica)</span>
              <span>1.2 (Creativo)</span>
            </div>
          </div>

          {/* RAM Regulator (Regulador de Max RAM para optimizar recursos en segundo plano) */}
          <div className="p-3 bg-[#050811] border border-[#131b2c] rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-200">
                  Regulador de Max RAM
                </span>
              </div>
              <span className="font-mono text-indigo-300 font-bold text-xs">{maxRamGb} GB</span>
            </div>
            <input
              type="range"
              min="2"
              max="32"
              step="2"
              value={maxRamGb}
              onChange={(e) => onUpdateMaxRam && onUpdateMaxRam(parseInt(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>2 GB (Mínimo)</span>
              <span>16 GB</span>
              <span>32 GB (Máximo)</span>
            </div>
            <div className="pt-1 flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">Limita buffers en segundo plano</span>
              {onPurgeMemory && (
                <button
                  type="button"
                  onClick={onPurgeMemory}
                  className="px-2 py-1 bg-[#090e1c] hover:bg-[#0f172e] text-indigo-300 hover:text-indigo-200 rounded text-[10px] font-mono border border-[#182338] transition-colors"
                >
                  Liberar RAM
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: MEMORY & BRAIN MANAGEMENT & AUTO-IMPROVEMENT */}
      {activeTab === "memory" && (
        <div className="flex-1 p-3.5 space-y-3 overflow-y-auto custom-scrollbar bg-[#020408]/85 backdrop-blur-md">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-cyan-400" />
              <span>Cerebro & Banco de Memoria</span>
            </h3>
            <span className="text-[10px] px-2 py-0.5 bg-cyan-950/80 text-cyan-300 rounded border border-cyan-800 font-mono">
              {memoryRules.length} Reglas
            </span>
          </div>

          {/* Feedback banner */}
          {autoImproveFeedback && (
            <div className="p-2 bg-emerald-950/80 border border-emerald-700/80 rounded-lg text-[11px] text-emerald-300 font-mono flex items-center gap-1.5 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{autoImproveFeedback}</span>
            </div>
          )}

          {/* Sub-tabs */}
          <div className="grid grid-cols-3 gap-1 bg-[#111726] p-1 rounded-lg border border-zinc-800 text-[11px]">
            <button
              onClick={() => setMemorySubTab("rules")}
              className={`py-1 rounded font-medium transition-all ${
                memorySubTab === "rules"
                  ? "bg-cyan-600/30 text-cyan-300 border border-cyan-500/40"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Reglas ({memoryRules.length})
            </button>
            <button
              onClick={() => setMemorySubTab("add")}
              className={`py-1 rounded font-medium flex items-center justify-center gap-1 transition-all ${
                memorySubTab === "add"
                  ? "bg-cyan-600/30 text-cyan-300 border border-cyan-500/40"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Plus className="w-3 h-3" />
              <span>Añadir</span>
            </button>
            <button
              onClick={() => setMemorySubTab("autolearn")}
              className={`py-1 rounded font-medium flex items-center justify-center gap-1 transition-all ${
                memorySubTab === "autolearn"
                  ? "bg-amber-600/30 text-amber-300 border border-amber-500/40"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Automejora</span>
            </button>
          </div>

          {/* SUB-VIEW 1: ACTIVE RULES */}
          {memorySubTab === "rules" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Directivas activas en memoria:</span>
                <button
                  onClick={() => setMemorySubTab("add")}
                  className="text-cyan-400 hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Añadir Nueva
                </button>
              </div>

              <div className="space-y-2 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                {memoryRules.map((rule, idx) => (
                  <div
                    key={rule.id}
                    className="p-2.5 bg-zinc-900/90 border border-zinc-800/90 rounded-lg group hover:border-cyan-800/60 transition-all text-xs"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="font-mono text-[10px] text-zinc-500">#{idx + 1}</span>
                        <span className="font-semibold text-zinc-200 truncate">{rule.topic}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-mono uppercase ${
                            rule.category === "architecture"
                              ? "bg-blue-950 text-blue-300 border border-blue-800"
                              : rule.category === "language"
                              ? "bg-amber-950 text-amber-300 border border-amber-800"
                              : rule.category === "ports"
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                              : "bg-purple-950 text-purple-300 border border-purple-800"
                          }`}
                        >
                          {rule.category}
                        </span>
                      </div>
                      {rule.id.startsWith("mem-") && memoryRules.length > 2 && (
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-950 text-zinc-500 hover:text-rose-400 rounded transition-all"
                          title="Eliminar regla de memoria"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-zinc-400 text-[11px] mt-1 leading-relaxed pl-4 border-l border-zinc-800">
                      {rule.instruction}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUB-VIEW 2: ADD NEW MEMORY RULE */}
          {memorySubTab === "add" && (
            <form onSubmit={handleAddRule} className="space-y-3 bg-[#111726] p-3 rounded-xl border border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-200 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Añadir Información al Cerebro</span>
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">Persistencia Local</span>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase">Tópico / Título</label>
                <input
                  type="text"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  placeholder="Ej: Estilo de Backend o Regla de UI..."
                  className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase">Categoría</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-cyan-500"
                >
                  <option value="architecture">Arquitectura & Código</option>
                  <option value="language">Idioma & Español Técnico</option>
                  <option value="ports">Puertos (3000, 5000, 11434)</option>
                  <option value="anti-slop">Diseño & Anti-Slop</option>
                  <option value="attachments">Procesamiento de Adjuntos</option>
                  <option value="lists">Continuidad Numérica</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase">Instrucción / Directiva</label>
                <textarea
                  value={newInstruction}
                  onChange={(e) => setNewInstruction(e.target.value)}
                  placeholder="Describe la regla exacta que CerebroNico debe aplicar siempre..."
                  rows={3}
                  className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg p-2.5 text-xs text-zinc-200 outline-none focus:border-cyan-500 resize-none leading-relaxed"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-cyan-950/40"
              >
                <Brain className="w-3.5 h-3.5" />
                <span>Guardar en el Cerebro / Memoria</span>
              </button>
            </form>
          )}

          {/* SUB-VIEW 3: AUTOMEJORA CONTINUA (SELF-IMPROVEMENT ENGINE) */}
          {memorySubTab === "autolearn" && (
            <div className="space-y-3 bg-[#050811] p-3 rounded-xl border border-amber-900/40 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Motor de Automejora Continua</span>
                </span>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                El motor de automejora evalúa las correcciones y requerimientos de cada interacción para consolidar nuevas reglas técnicas y enriquecer el archivo <span className="font-mono text-cyan-300">MEMORIA.md</span>.
              </p>

              {/* Auto-learn switch */}
              <div className="p-2.5 bg-[#03060c] border border-[#141d2e] rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-medium text-zinc-200 text-[11px]">Aprendizaje en Segundo Plano</div>
                  <div className="text-[10px] text-zinc-500">Detecta preferencias automáticamente</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAutoImproveEnabled((p) => !p)}
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
                    isAutoImproveEnabled ? "bg-amber-500" : "bg-zinc-700"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      isAutoImproveEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Run manual synthesis button */}
              <button
                onClick={handleRunAutoImprove}
                className="w-full py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-medium rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/40"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>⚡ Sintetizar y Automejorar Ahora</span>
              </button>

              {/* Summary of learned items */}
              <div className="pt-2 border-t border-[#131b2c]">
                <div className="text-[10px] font-mono text-zinc-400 mb-1.5 uppercase">
                  Mapeos Idiomáticos & Jerga Técnica ({langMemories.length})
                </div>
                <div className="space-y-1 max-h-[140px] overflow-y-auto">
                  {langMemories.slice(0, 4).map((lm) => (
                    <div key={lm.id} className="p-1.5 bg-[#020408]/85 backdrop-blur-md rounded border border-[#131b2c] text-[10px] flex items-center justify-between">
                      <span className="text-amber-300 font-mono truncate max-w-[140px]">"{lm.term}"</span>
                      <span className="text-zinc-400 font-mono text-[9px]">{lm.equivalent}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: PORTS */}
      {activeTab === "ports" && (
        <div className="flex-1 p-4 space-y-3 overflow-y-auto custom-scrollbar bg-[#020408]/85 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
              <Server className="w-4 h-4 text-cyan-400" />
              <span>Telemetría de Puertos</span>
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={onRefreshTelemetry}
                className="p-1 hover:bg-[#090e1c] rounded text-zinc-400 hover:text-cyan-300 transition-colors"
                title="Actualizar estado de puertos (solo re-verifica)"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              {onReconnectAll && (
                <button
                  onClick={onReconnectAll}
                  disabled={isReconnecting}
                  className={`p-1 rounded transition-colors flex items-center gap-1 text-[10px] font-semibold ${
                    isReconnecting
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-wait"
                      : "bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:text-cyan-200"
                  }`}
                  title="Reiniciar puente Python (:5000) y refrescar telemetría — usar cuando un puerto aparezca caído"
                >
                  <RefreshCw className={`w-3 h-3 ${isReconnecting ? "animate-spin" : ""}`} />
                  <span>{isReconnecting ? "Reconectando..." : "Reconectar"}</span>
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2 font-mono text-xs">
            {/* Port 3000 */}
            <div className="p-3 bg-[#050811] border border-[#141d2e] rounded-xl flex items-center justify-between shadow-sm">
              <div>
                <div className="font-bold text-zinc-200">Puerto 3000</div>
                <div className="text-[10px] text-zinc-400">Frontend UI (Vite/React 19)</div>
              </div>
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30 text-[10px] font-semibold">
                ACTIVO
              </span>
            </div>

            {/* Port 5000 */}
            <div className="p-3 bg-[#050811] border border-[#141d2e] rounded-xl flex items-center justify-between shadow-sm">
              <div>
                <div className="font-bold text-zinc-200">Puerto 5000</div>
                <div className="text-[10px] text-zinc-400">Microservicios / Worker / FastAPI</div>
              </div>
              <span
                className={`px-2 py-0.5 rounded border text-[10px] ${
                  telemetry.port5000
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 font-semibold"
                    : "bg-[#0b101c] text-zinc-500 border-[#182338]"
                }`}
              >
                {telemetry.port5000 ? "CONECTADO" : "STANDBY"}
              </span>
            </div>

            {/* Port 11434 */}
            <div className="p-3 bg-[#050811] border border-[#141d2e] rounded-xl flex items-center justify-between shadow-sm">
              <div>
                <div className="font-bold text-zinc-200">Puerto 11434</div>
                <div className="text-[10px] text-zinc-400">Ollama Local Inferencia</div>
              </div>
              <span
                className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                  telemetry.port11434
                    ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                    : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                }`}
              >
                {telemetry.port11434 ? "OPERATIVO" : "VERIFICANDO"}
               </span>
             </div>
           </div>

           {/* ---- Topología de Subagentes (estado en vivo) ---- */}
           <div className="pt-1">
             <div className="flex items-center justify-between mb-2">
               <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
                 <Network className="w-4 h-4 text-fuchsia-400" />
                 <span>Subagentes</span>
               </h3>
               <span className="text-[10px] text-zinc-500 font-mono">topología en vivo</span>
             </div>

             {/* Toggle Modo Agente PC */}
             <button
               type="button"
               onClick={onTogglePcMode}
               disabled={!onTogglePcMode}
               className={`w-full mb-3 p-2.5 rounded-xl border text-left transition-all ${
                 pcMode
                   ? "bg-emerald-950/50 border-emerald-600/60"
                   : "bg-[#050811] border-[#141d2e] hover:border-emerald-700/40"
               }`}
               title="Habilita que el chat ejecute acciones REALES en tu PC (archivos, comandos) vía el puente :5000."
             >
               <div className="flex items-center justify-between">
                 <span className={`text-xs font-semibold flex items-center gap-1.5 ${pcMode ? "text-emerald-300" : "text-zinc-300"}`}>
                   <Cpu className={`w-3.5 h-3.5 ${pcMode ? "text-emerald-400" : "text-zinc-500"}`} />
                   Modo Agente PC (puente :5000)
                 </span>
                 <span
                   className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                     pcMode
                       ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                       : "bg-zinc-800/60 text-zinc-400 border-zinc-700"
                   }`}
                 >
                   {pcMode ? "ACTIVO" : "INACTIVO"}
                 </span>
               </div>
               <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                 {pcMode
                   ? "El chat puede crear/editar archivos y ejecutar comandos en tu PC real."
                   : "Actívalo para que el chat delegue acciones reales (Escritorio, comandos, etc.) al agente :5000."}
               </p>
             </button>

             {/* Lista de subagentes */}
             <div className="space-y-1.5">
               {(subagents?.items || []).map((s) => {
                 const online = s.status === "online";
                 return (
                   <div
                     key={s.id}
                     className="p-2.5 bg-[#050811] border border-[#141d2e] rounded-lg flex items-start gap-2"
                   >
                     <span
                       className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                         online ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" : "bg-zinc-600"
                       }`}
                     />
                     <div className="min-w-0">
                       <div className="text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5 truncate">
                         <span className="truncate">{s.name}</span>
                         {s.port ? <span className="text-[10px] font-mono text-zinc-500 shrink-0">:{s.port}</span> : null}
                       </div>
                       <div className="text-[10px] text-zinc-500 leading-snug" title={s.role}>
                         {s.role}
                       </div>
                     </div>
                   </div>
                 );
               })}
             </div>
           </div>
         </div>
       )}

     </aside>
   );
 };
