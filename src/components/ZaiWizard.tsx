import React, { useState } from "react";
import { Sparkles, X, ExternalLink, Key, Check, ArrowRight } from "lucide-react";

interface ZaiWizardProps {
  isOpen: boolean;
  onClose: () => void;
  zaiApiKey: string;
  onUpdateZaiApiKey: (key: string) => void;
  onOpenApiKeyModal: () => void;
}

/**
 * v1.1 — Asistente de bienvenida para configurar Z.ai (GLM-4.5-Flash) en 30 segundos.
 *
 * Z.ai requiere una API key gratuita (sin tarjeta de crédito). Este asistente:
 *   1. Explica que GLM-4.5-Flash es 100% gratuito.
 *   2. Abre https://z.ai/manage/apikey en una pestaña nueva para que el usuario se registre.
 *   3. Pega la clave en un input.
 *   4. Guarda la clave (persiste en localStorage) y cierra el asistente.
 *
 * NO embebe ninguna API key compartida — eso sería inseguro y violaría los términos de Z.ai.
 */
export const ZaiWizard: React.FC<ZaiWizardProps> = ({
  isOpen,
  onClose,
  zaiApiKey,
  onUpdateZaiApiKey,
  onOpenApiKeyModal,
}) => {
  const [localKey, setLocalKey] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = localKey.trim();
    if (!trimmed) return;
    onUpdateZaiApiKey(trimmed);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="cn-modal bg-gradient-to-br from-[#0f1422] to-[#0a0e17] border border-violet-500/50 rounded-2xl shadow-2xl">
        {/* Header con gradiente violeta */}
        <div className="p-5 bg-gradient-to-r from-violet-950/70 to-indigo-950/70 border-b border-violet-500/40 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-500/20 text-violet-300 rounded-xl border border-violet-500/40">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="cn-title font-bold text-white flex items-center gap-2">
                🧠 GLM-4.5-Flash — Modelo 100% GRATUITO de Z.ai
                <span className="text-[10px] px-2 py-0.5 bg-emerald-500/30 text-emerald-200 rounded-full border border-emerald-500/50 font-mono font-bold">
                  FREE
                </span>
              </h2>
              <p className="text-xs text-zinc-300 mt-0.5">
                Ya está preconfigurado. Solo necesitas una clave gratuita para empezar a chatear.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title="Cerrar y seguir sin clave (modo demo)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
          {/* Paso 1: por qué Z.ai */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? "bg-violet-500 text-white" : "bg-zinc-800 text-zinc-500"}`}>1</span>
              <h3 className="cn-sub font-bold text-zinc-100">Por qué GLM-4.5-Flash</h3>
            </div>
            <ul className="text-[12px] text-zinc-300 space-y-1.5 ml-8">
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span><strong className="text-white">100% gratuito</strong> con generosos límites diarios (suficiente para programar y chatear todo el día).</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span><strong className="text-white">Sin tarjeta de crédito</strong> — el registro pide solo email y verificación por SMS.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span><strong className="text-white">128K tokens de contexto</strong> — ideal para enviar archivos enteros de código.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span><strong className="text-white">Responde en español</strong> de forma natural (Z.ai es la empresa china detrás de ChatGLM).</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span><strong className="text-white">OpenAI-compatible</strong> — soporta streaming, visión y tool-calling.</span>
              </li>
            </ul>
          </div>

          {/* Paso 2: obtener la clave */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? "bg-violet-500 text-white" : "bg-zinc-800 text-zinc-500"}`}>2</span>
              <h3 className="cn-sub font-bold text-zinc-100">Obtén tu clave gratuita (30 segundos)</h3>
            </div>
            <div className="ml-8 space-y-3">
              <p className="text-[12px] text-zinc-400 leading-relaxed">
                Clic en el botón para abrir el gestor de API keys de Z.ai. Regístrate con tu email,
                copia la clave que empieza con números y letras (formato <code className="text-violet-300 font-mono">xxxxxxxx.xxxxxxxxxxxxxxxx</code>).
              </p>
              <a
                href="https://z.ai/manage/apikey"
                target="_blank"
                rel="noreferrer"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-violet-950/40 transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Abrir z.ai/manage/apikey</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Paso 3: pegar la clave */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-violet-500 text-white">3</span>
              <h3 className="cn-sub font-bold text-zinc-100">Pega tu clave aquí</h3>
            </div>
            <div className="ml-8 space-y-2">
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400" />
                <input
                  type="password"
                  value={localKey}
                  onChange={(e) => setLocalKey(e.target.value)}
                  placeholder="pega aquí tu clave de Z.ai"
                  className="w-full bg-[#0a0e17] border border-violet-700/60 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-100 font-mono outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && localKey.trim()) handleSave();
                  }}
                  autoFocus
                />
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                🔒 Tu clave se guarda <strong>SÓLO en tu navegador</strong> (localStorage + IndexedDB).
                Nunca se envía a terceros ni se comparte. La usamos exclusivamente para llamar a la API de Z.ai desde tu propio servidor local (:3000).
              </p>
            </div>
          </div>

          {/* Estado actual */}
          {zaiApiKey && !localKey && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-700/40 rounded-lg text-[11px] text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Ya tienes una clave configurada. Puedes cerrar este asistente y empezar a chatear.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#131a2c] border-t border-[#1f2b42] flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {zaiApiKey ? "Cerrar" : "Saltar por ahora (modo demo)"}
          </button>
          <div className="flex items-center gap-2">
            {zaiApiKey && (
              <button
                onClick={onOpenApiKeyModal}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs font-medium transition-colors"
              >
                Ver todas las claves
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!localKey.trim() || saved}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {saved ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>¡Clave guardada!</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar y empezar a chatear</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
