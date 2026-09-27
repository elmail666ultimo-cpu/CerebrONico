import React, { useState } from "react";
import { Settings, Sliders, Cpu, Terminal, Palette, X, Check } from "lucide-react";

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Estado real de la app
  config: {
    autoSync: boolean;
    slmDetection: boolean;
    streamResponse: boolean;
    sandboxPort: string;
    ollamaUrl: string;
    themeMode: string;
  };
  onUpdate: (newConfig: Partial<ConfigModalProps["config"]>) => void;
}

type Tab = "general" | "ai" | "sandbox" | "theme";

export const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose, config, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    // Persistir en localStorage
    try {
      localStorage.setItem("cerebronico_settings", JSON.stringify(config));
    } catch {}
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "general", label: "General y Entorno", icon: Sliders },
    { id: "ai", label: "IA y Compatibilidad (SLM)", icon: Cpu },
    { id: "sandbox", label: "Sandbox Web Preview", icon: Terminal },
    { id: "theme", label: "Apariencia y Zoom", icon: Palette },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="cn-modal bg-zinc-900/95 backdrop-blur-md border border-zinc-800 rounded-xl shadow-2xl">
        {/* Header del Panel */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="cn-title font-semibold text-zinc-100">Panel de Control y Compatibilidad</h2>
              <p className="text-xs text-zinc-400">Gestiona motores locales, puertos del sandbox y preferencias del IDE</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo con Sidebar de Pestañas y Contenido */}
        <div className="flex flex-1 overflow-hidden">
          {/* Navegación Lateral (Tabs) */}
          <div className="w-56 border-r border-zinc-800 bg-zinc-950/30 p-3 flex flex-col gap-1.5 shrink-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                    activeTab === tab.id
                      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/30"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Contenido Dinámico */}
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-zinc-900/50 flex flex-col justify-between">
            <div className="space-y-5">
              {/* PESTAÑA 1: GENERAL */}
              {activeTab === "general" && (
                <div className="space-y-4">
                  <h3 className="cn-sub font-semibold text-zinc-200 border-b border-zinc-800 pb-2">
                    Configuración General
                  </h3>

                  {/* AutoSync */}
                  <div className="flex items-center justify-between p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                    <div>
                      <label className="text-xs font-medium text-zinc-300">
                        Sincronización Automática al Disco
                      </label>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Guarda y sincroniza los cambios del editor hacia .proyectos/ automáticamente
                      </p>
                    </div>
                    <button
                      onClick={() => onUpdate({ autoSync: !config.autoSync })}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                        config.autoSync ? "bg-emerald-500" : "bg-zinc-700"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          config.autoSync ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Stream Response */}
                  <div className="flex items-center justify-between p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                    <div>
                      <label className="text-xs font-medium text-zinc-300">
                        Respuesta en Streaming
                      </label>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Muestra los tokens del modelo en tiempo real (recomendado para SLMs)
                      </p>
                    </div>
                    <button
                      onClick={() => onUpdate({ streamResponse: !config.streamResponse })}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                        config.streamResponse ? "bg-emerald-500" : "bg-zinc-700"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          config.streamResponse ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* PESTAÑA 2: IA Y COMPATIBILIDAD */}
              {activeTab === "ai" && (
                <div className="space-y-4">
                  <h3 className="cn-sub font-semibold text-zinc-200 border-b border-zinc-800 pb-2">
                    Conectividad de IA y Compatibilidad de Modelos
                  </h3>

                  {/* Ollama URL */}
                  <div className="space-y-1.5 p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                    <label className="text-xs font-medium text-zinc-300">
                      URL Endpoint Ollama / Servidor Local
                    </label>
                    <input
                      type="text"
                      value={config.ollamaUrl}
                      onChange={(e) => onUpdate({ ollamaUrl: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono focus:border-emerald-500 outline-none"
                      placeholder="http://127.0.0.1:11434"
                    />
                    <p className="text-[11px] text-zinc-500">
                      Dirección del servidor Ollama local. Cambia aquí si usas un proxy o un puerto distinto.
                    </p>
                  </div>

                  {/* SLM Detection */}
                  <div className="flex items-center justify-between p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                    <div>
                      <label className="text-xs font-medium text-zinc-300">
                        Detector Automático SLM (Nano/Small)
                      </label>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Optimiza contexto, RAG y reglas anti-alucinación para modelos menores a 1.5GB
                        (ej. stablelm2, qwen 0.5b, smollm2, tinyllama)
                      </p>
                    </div>
                    <button
                      onClick={() => onUpdate({ slmDetection: !config.slmDetection })}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                        config.slmDetection ? "bg-emerald-500" : "bg-zinc-700"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          config.slmDetection ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-lg">
                    <p className="text-[11px] text-amber-300 leading-relaxed">
                      💡 Cuando el detector SLM está activo, el motor reduce automáticamente:
                    </p>
                    <ul className="text-[11px] text-amber-400/80 mt-1 ml-4 list-disc">
                      <li>Chunks de RAG: 4 → 1-2 (según categoría nano/small)</li>
                      <li>Lecciones de EvolutionDB: 5 → 3</li>
                      <li>Inyecta reglas anti-alucinación estrictas en el system prompt</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* PESTAÑA 3: SANDBOX */}
              {activeTab === "sandbox" && (
                <div className="space-y-4">
                  <h3 className="cn-sub font-semibold text-zinc-200 border-b border-zinc-800 pb-2">
                    Parámetros del Sandbox y Previsualizador
                  </h3>

                  <div className="space-y-1.5 p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                    <label className="text-xs font-medium text-zinc-300">
                      Puerto del Servidor de Previsualización
                    </label>
                    <input
                      type="text"
                      value={config.sandboxPort}
                      onChange={(e) => onUpdate({ sandboxPort: e.target.value })}
                      className="w-32 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono focus:border-emerald-500 outline-none"
                    />
                    <p className="text-[11px] text-zinc-500">
                      Por defecto 3500. La IDE corre en 3000. Nunca uses el mismo puerto para ambos.
                      El servidor parchea automáticamente vite.config.ts y package.json para forzar este puerto.
                    </p>
                  </div>

                  <div className="p-3 bg-cyan-950/30 border border-cyan-800/40 rounded-lg">
                    <p className="text-[11px] text-cyan-300 leading-relaxed">
                      🔧 El sandbox está aislado del servidor principal (:3000). Los cambios de archivos
                      en .proyectos/ NO reinician la interfaz. El piloto automático arranca npm run dev
                      en este puerto y mantiene el preview vivo.
                    </p>
                  </div>
                </div>
              )}

              {/* PESTAÑA 4: APARIENCIA */}
              {activeTab === "theme" && (
                <div className="space-y-4">
                  <h3 className="cn-sub font-semibold text-zinc-200 border-b border-zinc-800 pb-2">
                    Apariencia y Escala
                  </h3>

                  <div className="space-y-1.5 p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                    <label className="text-xs font-medium text-zinc-300">Tema del IDE</label>
                    <select
                      value={config.themeMode}
                      onChange={(e) => onUpdate({ themeMode: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:border-emerald-500 outline-none"
                    >
                      <option value="dark">Oscuro Profundo (Carbon)</option>
                      <option value="midnight">Medianoche (Azul)</option>
                      <option value="glass">Glassmorphism (Translúcido)</option>
                    </select>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      El modo Glassmorphism permite ver el fondo de pantalla a través de los paneles.
                    </p>
                  </div>

                  <div className="p-3 bg-violet-950/30 border border-violet-800/40 rounded-lg">
                    <p className="text-[11px] text-violet-300 leading-relaxed">
                      🖼️ Para cambiar el fondo de pantalla: menú CN → "Cambiar fondo de pantalla".
                      La imagen se guarda en IndexedDB (sin límite de tamaño).
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800 mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition shadow-lg shadow-emerald-900/20 active:scale-95"
              >
                {saved ? <Check className="w-4 h-4" /> : null}
                {saved ? "¡Guardado!" : "Guardar Cambios"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
