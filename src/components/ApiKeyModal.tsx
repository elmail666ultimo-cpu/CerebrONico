import React, { useState } from "react";
import {
  Check,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  Key,
  Radio,
  Server,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { ModelProvider } from "../types";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: ModelProvider;
  onSelectProvider: (provider: ModelProvider) => void;
  openrouterApiKey: string;
  onUpdateOpenrouterApiKey: (key: string) => void;
  geminiApiKey: string;
  onUpdateGeminiApiKey: (key: string) => void;
  onDetectGeminiModels?: () => Promise<void>;
  isDetectingGemini?: boolean;
  onDetectOpenRouterModels?: () => Promise<void>;
  isDetectingOpenRouter?: boolean;
  ollamaUrl: string;
  onUpdateOllamaUrl: (url: string) => void;
  customServerUrl: string;
  onUpdateCustomServerUrl: (url: string) => void;
  customApiKey: string;
  onUpdateCustomApiKey: (key: string) => void;
  // OpenAI direct (provider "openai")
  openaiApiKey: string;
  onUpdateOpenaiApiKey: (key: string) => void;
  onDetectOpenaiModels?: () => Promise<void>;
  isDetectingOpenai?: boolean;
  // v1.1 — Dedicated cloud provider keys:
  zaiApiKey: string;
  onUpdateZaiApiKey: (key: string) => void;
  onDetectZaiModels?: () => Promise<void>;
  isDetectingZai?: boolean;
  groqApiKey: string;
  onUpdateGroqApiKey: (key: string) => void;
  cerebrasApiKey: string;
  onUpdateCerebrasApiKey: (key: string) => void;
  togetherApiKey: string;
  onUpdateTogetherApiKey: (key: string) => void;
  mistralApiKey: string;
  onUpdateMistralApiKey: (key: string) => void;
  deepseekApiKey: string;
  onUpdateDeepseekApiKey: (key: string) => void;
  fireworksApiKey: string;
  onUpdateFireworksApiKey: (key: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  provider,
  onSelectProvider,
  openrouterApiKey,
  onUpdateOpenrouterApiKey,
  geminiApiKey,
  onUpdateGeminiApiKey,
  onDetectGeminiModels,
  isDetectingGemini = false,
  onDetectOpenRouterModels,
  isDetectingOpenRouter = false,
  ollamaUrl,
  onUpdateOllamaUrl,
  customServerUrl,
  onUpdateCustomServerUrl,
  customApiKey,
  onUpdateCustomApiKey,
  openaiApiKey,
  onUpdateOpenaiApiKey,
  onDetectOpenaiModels,
  isDetectingOpenai = false,
  // v1.1 — Dedicated cloud provider keys:
  zaiApiKey,
  onUpdateZaiApiKey,
  onDetectZaiModels,
  isDetectingZai = false,
  groqApiKey,
  onUpdateGroqApiKey,
  cerebrasApiKey,
  onUpdateCerebrasApiKey,
  togetherApiKey,
  onUpdateTogetherApiKey,
  mistralApiKey,
  onUpdateMistralApiKey,
  deepseekApiKey,
  onUpdateDeepseekApiKey,
  fireworksApiKey,
  onUpdateFireworksApiKey,
}) => {
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showCustomKey, setShowCustomKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showZaiKey, setShowZaiKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showCerebrasKey, setShowCerebrasKey] = useState(false);
  const [showTogetherKey, setShowTogetherKey] = useState(false);
  const [showMistralKey, setShowMistralKey] = useState(false);
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [showFireworksKey, setShowFireworksKey] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    // La persistencia real ya la hace App.tsx en cada callback onUpdate*
    // (antes duplicaba los setItem de localStorage aquí, fuente de divergencias).
    setSavedFeedback("¡Todas las configuraciones y claves han sido guardadas con éxito!");
    setTimeout(() => {
      setSavedFeedback(null);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="cn-modal bg-[#0f1422] border border-cyan-500/40 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="p-4 bg-[#131a2c] border-b border-[#1f2b42] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/40">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="cn-title font-bold text-white flex items-center gap-2">
                <span>Ranuras de API Keys y Servidores</span>
                <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/40 font-mono">
                  Seguro & Local
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Inserta tus claves para conectar modelos en la nube, servidores locales o proxies.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback message */}
        {savedFeedback && (
          <div className="p-3 bg-emerald-950 border-b border-emerald-700 text-xs text-emerald-300 flex items-center gap-2 font-mono">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{savedFeedback}</span>
          </div>
        )}

        {/* Body content */}
        <div className="cn-modal-body custom-scrollbar p-4 space-y-4">
          {/* Provider Selection Tabs */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Proveedor de Inferencia Activo
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2">
              {[
                { id: "ollama", name: "Ollama Local", icon: Cpu, badge: "Offline" },
                { id: "zai", name: "Z.ai (GLM)", icon: Sparkles, badge: "GRATIS" },
                { id: "gemini", name: "Gemini AI", icon: Sparkles, badge: "Gratis" },
                { id: "groq", name: "Groq", icon: Zap, badge: "Gratis" },
                { id: "openai", name: "OpenAI", icon: Zap, badge: "Cloud" },
                { id: "openrouter", name: "OpenRouter", icon: Globe, badge: "Multi" },
                { id: "cerebras", name: "Cerebras", icon: Cpu, badge: "Gratis" },
                { id: "together", name: "Together", icon: Globe, badge: "$5 free" },
                { id: "mistral", name: "Mistral", icon: Sparkles, badge: "Gratis" },
                { id: "custom", name: "Custom :5000", icon: Server, badge: "Proxy" },
              ].map((p) => {
                const isSelected = provider === p.id;
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelectProvider(p.id as ModelProvider)}
                    className={`p-3 rounded-xl border flex flex-col items-center text-center gap-1.5 transition-all ${
                      isSelected
                        ? "bg-cyan-950/70 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-950/50 scale-[1.02]"
                        : "bg-[#111726] border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isSelected ? "text-cyan-400" : "text-zinc-400"}`} />
                    <span className="text-xs font-semibold">{p.name}</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-black/40 text-zinc-400">
                      {p.badge}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 0. Z.AI (GLM) — destacado, 100% GRATIS */}
          <div className="p-4 bg-gradient-to-br from-violet-950/40 to-indigo-950/40 border border-violet-500/60 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-300" />
                <span className="text-xs font-bold text-white">0. Z.ai (GLM) — Modelos 100% GRATIS</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/30 text-emerald-200 rounded-full border border-emerald-500/50 font-mono font-bold">
                  FREE TIER
                </span>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${zaiApiKey ? "bg-emerald-950 text-emerald-300 border-emerald-700" : "bg-zinc-900 text-zinc-500 border-zinc-700"}`}>
                {zaiApiKey ? "🟢 Clave Configurada" : "⚪ Sin Clave"}
              </span>
            </div>
            <p className="text-[11px] text-zinc-300 leading-relaxed">
              <strong>Recomendado.</strong> Z.ai ofrece <code className="text-violet-300 font-mono">glm-4.5-flash</code> y{" "}
              <code className="text-violet-300 font-mono">glm-4-flash</code> totalmente <strong>gratuitos</strong>, sin tarjeta
              de crédito. Son los mejores modelos gratuitos para programar y chatear en español. Endpoint:{" "}
              <code className="text-violet-300 font-mono">https://api.z.ai/api/paas/v4</code>
            </p>
            <div className="relative">
              <input
                type={showZaiKey ? "text" : "password"}
                value={zaiApiKey}
                onChange={(e) => onUpdateZaiApiKey(e.target.value)}
                placeholder="xxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-[#0a0e17] border border-violet-700/60 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono pr-10 outline-none focus:border-violet-400"
              />
              <button
                type="button"
                onClick={() => setShowZaiKey(!showZaiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                {showZaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
              <span>Consigue tu clave GRATIS en <a href="https://z.ai/manage/apikey" target="_blank" rel="noreferrer" className="text-violet-300 hover:underline">z.ai/manage/apikey</a></span>
              {onDetectZaiModels && (
                <button
                  type="button"
                  onClick={onDetectZaiModels}
                  disabled={isDetectingZai}
                  className="px-2 py-1 rounded-md bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/30 disabled:opacity-40 font-mono flex items-center gap-1"
                  title="Listar modelos gratuitos de Z.ai"
                >
                  {isDetectingZai ? "Detectando…" : "⚡ Cargar modelos GLM"}
                </button>
              )}
            </div>
          </div>

          {/* 0.5 GROQ — destacado, gratuito, ultra-rápido */}
          <div className="p-4 bg-[#111726] border border-orange-800/40 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-400" />
                <span className="text-xs font-bold text-white">0.5. Groq API Key — Llama 3.3 70B GRATIS</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-200 rounded-full border border-emerald-500/40 font-mono">
                  FREE TIER
                </span>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${groqApiKey ? "bg-emerald-950 text-emerald-300 border-emerald-700" : "bg-zinc-900 text-zinc-500 border-zinc-700"}`}>
                {groqApiKey ? "🟢 Clave Configurada" : "⚪ Sin Clave"}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Ultra-rápido: Llama 3.3 70B, Gemma 2 9B, Mixtral. Tier gratuito con rate limits generosos.
              Endpoint: <code className="text-orange-300 font-mono">https://api.groq.com/openai/v1</code>
            </p>
            <div className="relative">
              <input
                type={showGroqKey ? "text" : "password"}
                value={groqApiKey}
                onChange={(e) => onUpdateGroqApiKey(e.target.value)}
                placeholder="gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono pr-10 outline-none focus:border-orange-500"
              />
              <button
                type="button"
                onClick={() => setShowGroqKey(!showGroqKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                {showGroqKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="text-[10px] text-zinc-500">
              Consigue tu clave GRATIS en <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-orange-400 hover:underline">console.groq.com/keys</a>
            </div>
          </div>

          {/* 0.6 Otros proveedores cloud (Cerebras, Together, Mistral, DeepSeek, Fireworks) */}
          <details className="p-4 bg-[#111726] border border-zinc-800 rounded-xl">
            <summary className="cursor-pointer text-xs font-bold text-white flex items-center gap-2 select-none">
              <Globe className="w-4 h-4 text-cyan-400" />
              Otros servidores cloud gratuitos (Cerebras · Together · Mistral · DeepSeek · Fireworks)
              <span className="text-[10px] font-normal text-zinc-500 ml-auto">clic para expandir</span>
            </summary>
            <div className="mt-3 space-y-3">
              {/* Cerebras */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-rose-300 uppercase tracking-wider">Cerebras API Key (gratis beta)</label>
                <div className="relative">
                  <input
                    type={showCerebrasKey ? "text" : "password"}
                    value={cerebrasApiKey}
                    onChange={(e) => onUpdateCerebrasApiKey(e.target.value)}
                    placeholder="csk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono pr-10 outline-none focus:border-rose-500"
                  />
                  <button type="button" onClick={() => setShowCerebrasKey(!showCerebrasKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200">
                    {showCerebrasKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">Consigue tu clave en <a href="https://cloud.cerebras.ai" target="_blank" rel="noreferrer" className="text-rose-400 hover:underline">cloud.cerebras.ai</a> — Llama 3.1 8B/70B gratis durante la beta.</p>
              </div>
              {/* Together */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-blue-300 uppercase tracking-wider">Together AI API Key ($5 crédito gratis)</label>
                <div className="relative">
                  <input
                    type={showTogetherKey ? "text" : "password"}
                    value={togetherApiKey}
                    onChange={(e) => onUpdateTogetherApiKey(e.target.value)}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono pr-10 outline-none focus:border-blue-500"
                  />
                  <button type="button" onClick={() => setShowTogetherKey(!showTogetherKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200">
                    {showTogetherKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">Consigue tu clave en <a href="https://api.together.xyz/settings/api-keys" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">api.together.xyz</a> — $5 de crédito al registrarse.</p>
              </div>
              {/* Mistral */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-amber-300 uppercase tracking-wider">Mistral AI API Key (free tier)</label>
                <div className="relative">
                  <input
                    type={showMistralKey ? "text" : "password"}
                    value={mistralApiKey}
                    onChange={(e) => onUpdateMistralApiKey(e.target.value)}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono pr-10 outline-none focus:border-amber-500"
                  />
                  <button type="button" onClick={() => setShowMistralKey(!showMistralKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200">
                    {showMistralKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">Consigue tu clave en <a href="https://console.mistral.ai/api-keys" target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">console.mistral.ai</a> — Mistral Small, Codestral, Nemo.</p>
              </div>
              {/* DeepSeek */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-violet-300 uppercase tracking-wider">DeepSeek API Key (muy económico)</label>
                <div className="relative">
                  <input
                    type={showDeepseekKey ? "text" : "password"}
                    value={deepseekApiKey}
                    onChange={(e) => onUpdateDeepseekApiKey(e.target.value)}
                    placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono pr-10 outline-none focus:border-violet-500"
                  />
                  <button type="button" onClick={() => setShowDeepseekKey(!showDeepseekKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200">
                    {showDeepseekKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">Consigue tu clave en <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline">platform.deepseek.com</a> — V3, R1, Coder (muy barato).</p>
              </div>
              {/* Fireworks */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-pink-300 uppercase tracking-wider">Fireworks AI API Key ($1 crédito gratis)</label>
                <div className="relative">
                  <input
                    type={showFireworksKey ? "text" : "password"}
                    value={fireworksApiKey}
                    onChange={(e) => onUpdateFireworksApiKey(e.target.value)}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono pr-10 outline-none focus:border-pink-500"
                  />
                  <button type="button" onClick={() => setShowFireworksKey(!showFireworksKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200">
                    {showFireworksKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">Consigue tu clave en <a href="https://fireworks.ai/account/api-keys" target="_blank" rel="noreferrer" className="text-pink-400 hover:underline">fireworks.ai</a> — $1 crédito al registrarse.</p>
              </div>
            </div>
          </details>

          {/* 1. Ranura OpenRouter API Key */}
          <div className="p-4 bg-[#111726] border border-zinc-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white">1. OpenRouter API Key</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                {openrouterApiKey ? "🟢 Clave Configurada" : "⚪ Sin Clave"}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Permite usar modelos gratuitos con soporte de tool-calling (deepseek-r1:free, llama-3.3-70b:free, etc.).
              El modelo virtual <code className="text-cyan-300 font-mono">openrouter/free</code> enruta automáticamente al mejor modelo gratuito disponible.
            </p>
            <div className="relative">
              <input
                type={showOpenrouterKey ? "text" : "password"}
                value={openrouterApiKey}
                onChange={(e) => onUpdateOpenrouterApiKey(e.target.value)}
                placeholder="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono pr-10 outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={() => setShowOpenrouterKey(!showOpenrouterKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                {showOpenrouterKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500">
              <span>Obtén tu clave en <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">openrouter.ai/keys</a></span>
              {onDetectOpenRouterModels && (
                <button
                  type="button"
                  onClick={onDetectOpenRouterModels}
                  disabled={isDetectingOpenRouter || !openrouterApiKey}
                  className="px-2 py-1 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed font-mono flex items-center gap-1"
                  title="Escanear y listar modelos gratuitos disponibles en OpenRouter"
                >
                  {isDetectingOpenRouter ? "Detectando…" : "⚡ Autodetectar modelos :free"}
                </button>
              )}
            </div>
          </div>

          {/* 2. Ranura OpenAI API Key (directo a api.openai.com) */}
          <div className="p-4 bg-[#111726] border border-zinc-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">2. OpenAI API Key</span>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${openaiApiKey ? "bg-emerald-950 text-emerald-300 border-emerald-700" : "bg-zinc-900 text-zinc-500 border-zinc-700"}`}>
                {openaiApiKey ? "🟢 Clave Configurada" : "⚪ Sin Clave"}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Clave oficial de OpenAI para usar GPT-4o, GPT-4o-mini, o1, o3-mini, etc. El IDE consulta el catálogo oficial en{" "}
              <code className="text-emerald-300 font-mono">https://api.openai.com/v1/models</code> y permite elegir el modelo.
            </p>
            <div className="relative">
              <input
                type={showOpenaiKey ? "text" : "password"}
                value={openaiApiKey}
                onChange={(e) => onUpdateOpenaiApiKey(e.target.value)}
                placeholder="sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono pr-10 outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500">
              <span>Obtén tu clave en <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">platform.openai.com/api-keys</a></span>
              {onDetectOpenaiModels && (
                <button
                  type="button"
                  onClick={onDetectOpenaiModels}
                  disabled={isDetectingOpenai || !openaiApiKey}
                  className="px-2 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed font-mono flex items-center gap-1"
                  title="Escanear y listar modelos disponibles en tu cuenta de OpenAI"
                >
                  {isDetectingOpenai ? "Detectando…" : "⚡ Autodetectar modelos OpenAI"}
                </button>
              )}
            </div>
          </div>

          {/* 3. Ranura Ollama Local Endpoint */}
          <div className="p-4 bg-[#111726] border border-zinc-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">3. Endpoint Servidor Ollama (Local)</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                Puerto 11434
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Dirección de tu servidor Ollama local para inferencia 100% offline y gratuita.
            </p>
            <input
              type="text"
              value={ollamaUrl}
              onChange={(e) => onUpdateOllamaUrl(e.target.value)}
              placeholder="http://127.0.0.1:11434"
              className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono outline-none focus:border-emerald-500"
            />
          </div>

          {/* 4. Ranura Servidor Personalizado / Proxy (Puerto 5000 / FastAPI / OpenAI-compatible) */}
          <div className="p-4 bg-[#111726] border border-zinc-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">4. Servidor Personalizado / Proxy (Puerto 5000)</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                Microservicios
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Conecta cualquier endpoint compatible con la API de OpenAI (FastAPI en puerto 5000, vLLM, LM Studio, Groq, Cerebras, Together, Mistral, etc.).
            </p>

            {/* 🔧 Plantillas rápidas para servicios cloud gratuitos OpenAI-compatible */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">
                Plantillas rápidas (cloud gratuito):
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {[
                  {
                    name: "Groq",
                    url: "https://api.groq.com/openai/v1",
                    docs: "https://console.groq.com/keys",
                    desc: "Llama 3.3 70B · Gemma 2 · Mixtral (gratis)",
                    color: "text-orange-300 border-orange-700/60 hover:bg-orange-500/10",
                  },
                  {
                    name: "Cerebras",
                    url: "https://api.cerebras.ai/v1",
                    docs: "https://cloud.cerebras.ai",
                    desc: "Llama 3.1 8B/70B · Qwen 2.5 (gratis beta)",
                    color: "text-rose-300 border-rose-700/60 hover:bg-rose-500/10",
                  },
                  {
                    name: "Together AI",
                    url: "https://api.together.xyz/v1",
                    docs: "https://api.together.xyz/settings/api-keys",
                    desc: "Llama · DeepSeek · Qwen ($5 crédito)",
                    color: "text-blue-300 border-blue-700/60 hover:bg-blue-500/10",
                  },
                  {
                    name: "Mistral",
                    url: "https://api.mistral.ai/v1",
                    docs: "https://console.mistral.ai/api-keys",
                    desc: "Mistral Small/Medium · Codestral (free tier)",
                    color: "text-amber-300 border-amber-700/60 hover:bg-amber-500/10",
                  },
                  {
                    name: "DeepSeek",
                    url: "https://api.deepseek.com/v1",
                    docs: "https://platform.deepseek.com/api_keys",
                    desc: "DeepSeek V3 · R1 (precio muy bajo)",
                    color: "text-violet-300 border-violet-700/60 hover:bg-violet-500/10",
                  },
                  {
                    name: "Fireworks",
                    url: "https://api.fireworks.ai/inference/v1",
                    docs: "https://fireworks.ai/account/api-keys",
                    desc: "Llama · DeepSeek · Qwen ($1 crédito)",
                    color: "text-pink-300 border-pink-700/60 hover:bg-pink-500/10",
                  },
                ].map((tpl) => (
                  <button
                    key={tpl.name}
                    type="button"
                    onClick={() => {
                      onUpdateCustomServerUrl(tpl.url);
                    }}
                    title={`Configurar endpoint de ${tpl.name}. ${tpl.desc}. Necesitas API key en el campo de abajo. Docs: ${tpl.docs}`}
                    className={`px-2 py-1.5 text-[10px] font-semibold bg-[#0a0e17] border ${tpl.color} rounded-md transition-colors flex flex-col items-start gap-0.5`}
                  >
                    <span className="font-bold">{tpl.name}</span>
                    <span className="text-[9px] text-zinc-500 leading-tight">{tpl.desc}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                💡 Estos servicios son <strong>compatibles con la API de OpenAI</strong>: solo necesitas tu API key (pegarla abajo)
                y elegir el modelo en el selector. Para conseguir claves, regístrate en sus respectivas webs.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-mono">URL Endpoint:</label>
              <input
                type="text"
                value={customServerUrl}
                onChange={(e) => onUpdateCustomServerUrl(e.target.value)}
                placeholder="http://127.0.0.1:5000/v1 o https://api.groq.com/openai/v1"
                className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-mono">Token / Clave de Acceso (Opcional):</label>
              <div className="relative">
                <input
                  type={showCustomKey ? "text" : "password"}
                  value={customApiKey}
                  onChange={(e) => onUpdateCustomApiKey(e.target.value)}
                  placeholder="Bearer token o API Key (ej: gsk_xxx para Groq, csk-xxx para Cerebras)"
                  className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono pr-10 outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCustomKey(!showCustomKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                >
                  {showCustomKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* 5. Google Gemini AI Studio (clave del usuario) */}
          <div className="p-4 bg-[#111726] border border-zinc-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-white">5. Google Gemini (AI Studio)</span>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${geminiApiKey ? "bg-purple-950 text-purple-300 border-purple-700" : "bg-zinc-900 text-zinc-500 border-zinc-700"}`}>
                {geminiApiKey ? "🟢 Clave Configurada" : "⚪ Sin Clave"}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {/* v1.6.18 — esta frase anunciaba gemini-2.5-flash, gemini-2.0-flash y
                  gemini-2.5-flash-lite. Dos de esos tres están apagados o en
                  retirada, así que la interfaz prometía modelos que no contestan.
                  Ahora nombra los de la familia vigente. */}
              Clave gratuita de Google AI Studio. Da acceso a los modelos <code className="text-purple-300 font-mono">gemini-3.8-flash</code>,{" "}
              <code className="text-purple-300 font-mono">gemini-3.6-flash</code> y <code className="text-purple-300 font-mono">gemini-3.5-flash-lite</code>{" "}
              con hasta 1M de tokens de contexto y límites gratuitos diarios generosos.
            </p>
            <div className="relative">
              <input
                type={showGeminiKey ? "text" : "password"}
                value={geminiApiKey}
                onChange={(e) => onUpdateGeminiApiKey(e.target.value)}
                placeholder="AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono pr-10 outline-none focus:border-purple-500"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500">
              <span>Obtén tu clave gratis en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">aistudio.google.com/apikey</a></span>
              {onDetectGeminiModels && (
                <button
                  type="button"
                  onClick={onDetectGeminiModels}
                  disabled={isDetectingGemini || !geminiApiKey}
                  className="px-2 py-1 rounded-md bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 disabled:opacity-40 disabled:cursor-not-allowed font-mono flex items-center gap-1"
                  title="Escanear y listar modelos flash disponibles para tu clave de Gemini"
                >
                  {isDetectingGemini ? "Detectando…" : "⚡ Autodetectar modelos flash"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#131a2c] border-t border-[#1f2b42] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Tus claves nunca se comparten y se procesan localmente.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-medium transition-all shadow-md shadow-cyan-950/40 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Guardar Configuración</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
