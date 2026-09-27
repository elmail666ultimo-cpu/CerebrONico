import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Gauge,
  Radio,
  Volume2,
  X,
} from "lucide-react";
import {
  CONFIG_TTS_DEFAULT,
  ConfigTts,
  EVENTO_CONFIG_TTS,
  PITCH_MAX,
  PITCH_MIN,
  RATE_MAX,
  RATE_MIN,
  VOCES_GEMINI,
  cargarConfigTts,
  guardarConfigTts,
  leerClaveGeminiTts,
} from "../utils/ttsConfig";

/**
 * TtsSelector — BOTÓN DE VOZ EN LA BARRA SUPERIOR (v1.15.0)
 * ==========================================================
 * Petición literal: «agregar arriba un botón selector de tts, funciona bien
 * pero no tiene cambio de voz ni tono/velocidad».
 *
 * Este botón abre un desplegable con tres controles:
 *   1. Voz     — navegador automático · voces del sistema · voces Gemini.
 *   2. Tono    — slider 0.5–2.0 (pitch). Aplica a la voz del navegador.
 *   3. Velocidad — slider 0.5–2.0 (rate). Aplica a navegador y Gemini.
 *
 * No habla por sí mismo: escribe la configuración compartida
 * (utils/ttsConfig.ts) y el ChatCenter, que es quien reproduce, la lee.
 */

/** Deduplica las voces del sistema por nombre y las ordena: el idioma activo primero. */
function ordenarVocesSistema(voces: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const unicas = new Map<string, SpeechSynthesisVoice>();
  for (const v of voces) {
    if (!v || !v.name) continue;
    if (!unicas.has(v.name)) unicas.set(v.name, v);
  }
  const lista = Array.from(unicas.values());
  const idiomaUi = (() => {
    try {
      return (localStorage.getItem("codigo0_response_language") || "es").toLowerCase().split(/[-_]/)[0];
    } catch {
      return "es";
    }
  })();
  lista.sort((a, b) => {
    const pa = a.lang.toLowerCase().startsWith(idiomaUi) ? 0 : 1;
    const pb = b.lang.toLowerCase().startsWith(idiomaUi) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
  return lista;
}

export const TtsSelector: React.FC = () => {
  const [abierto, setAbierto] = useState(false);
  const [voz, setVoz] = useState<string>(CONFIG_TTS_DEFAULT.voz);
  const [rate, setRate] = useState<number>(CONFIG_TTS_DEFAULT.rate);
  const [pitch, setPitch] = useState<number>(CONFIG_TTS_DEFAULT.pitch);
  const [vocesSistema, setVocesSistema] = useState<SpeechSynthesisVoice[]>([]);
  const [hayClave, setHayClave] = useState<boolean>(false);
  const raizRef = useRef<HTMLDivElement>(null);

  // Leer la configuración y escuchar cambios externos (p. ej. el aviso que
  // devuelve el chat a «navegador» cuando se quita la clave Gemini).
  useEffect(() => {
    const aplicar = () => {
      const c = cargarConfigTts();
      setVoz(c.voz);
      setRate(c.rate);
      setPitch(c.pitch);
    };
    aplicar();
    window.addEventListener(EVENTO_CONFIG_TTS, aplicar);
    return () => window.removeEventListener(EVENTO_CONFIG_TTS, aplicar);
  }, []);

  // Cargar las voces del sistema (se cargan de forma asíncrona en el navegador).
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth || typeof synth.getVoices !== "function") return;
    const cargar = () => {
      const v = synth.getVoices();
      if (v && v.length) setVocesSistema(ordenarVocesSistema(v));
    };
    cargar();
    try {
      synth.addEventListener("voiceschanged", cargar);
    } catch {
      /* noop */
    }
    return () => {
      try {
        synth.removeEventListener("voiceschanged", cargar);
      } catch {
        /* noop */
      }
    };
  }, []);

  // Revisar si hay clave Gemini (las voces Gemini solo son reales con clave).
  useEffect(() => {
    const revisar = () => setHayClave(leerClaveGeminiTts());
    revisar();
    window.addEventListener("focus", revisar);
    const t = setInterval(revisar, 4000);
    return () => {
      window.removeEventListener("focus", revisar);
      clearInterval(t);
    };
  }, []);

  // Cerrar el desplegable al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const cerrarFuera = (e: MouseEvent) => {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", cerrarFuera);
    return () => document.removeEventListener("mousedown", cerrarFuera);
  }, [abierto]);

  const aplicar = (parcial: Partial<ConfigTts>) => {
    const c = guardarConfigTts(parcial);
    setVoz(c.voz);
    setRate(c.rate);
    setPitch(c.pitch);
  };

  const etiquetaVoz = (() => {
    if (voz === "navegador") return "Navegador (auto)";
    const g = VOCES_GEMINI.find((v) => v.id === voz);
    if (g) return g.label;
    const s = vocesSistema.find((v) => v.name === voz);
    return s ? `${s.name} (${s.lang})` : voz;
  })();

  return (
    <div className="relative" ref={raizRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        title="Voz de lectura (TTS): elegir voz, tono y velocidad"
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-mono text-[11px] transition-all shrink-0 ${
          abierto
            ? "bg-cyan-500/20 border-cyan-400/60 text-cyan-200"
            : "bg-[#060a14] hover:bg-[#0a1020] border-[#141d2e] hover:border-cyan-500/40 text-zinc-300 hover:text-cyan-300"
        }`}
      >
        <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
        <span className="hidden lg:inline max-w-[140px] truncate">{etiquetaVoz}</span>
        <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-[#0a0f1c] border border-cyan-500/40 rounded-xl shadow-2xl shadow-cyan-950/50 z-[100] overflow-hidden text-xs">
          <div className="px-3 py-2 bg-[#0d1426] border-b border-[#1a2540] flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-cyan-300 font-mono text-[11px] font-bold tracking-wide">
              <Volume2 className="w-3.5 h-3.5" />
              <span>VOZ DE LECTURA (TTS)</span>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="p-0.5 rounded text-zinc-500 hover:text-zinc-200"
              title="Cerrar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-2.5 space-y-3">
            {/* Selección de voz */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">
                Voz
              </label>
              <select
                value={voz}
                onChange={(e) => aplicar({ voz: e.target.value })}
                className="w-full bg-[#060a14] border border-[#1a2540] rounded-md px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-cyan-500/60 cursor-pointer"
              >
                <option value="navegador" className="bg-[#0a0f1a]">Navegador (automática)</option>
                {vocesSistema.length > 0 && (
                  <optgroup label="Voces del sistema">
                    {vocesSistema.map((v) => (
                      <option key={v.name} value={v.name} className="bg-[#0a0f1a]">
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </optgroup>
                )}
                {hayClave && (
                  <optgroup label="Gemini (requiere clave)">
                    {VOCES_GEMINI.map((v) => (
                      <option key={v.id} value={v.id} className="bg-[#0a0f1a]">
                        {v.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {!hayClave && (
                <p className="text-[9px] text-zinc-600 mt-1 leading-relaxed">
                  Las voces Gemini aparecen cuando configures tu clave en el panel de API Keys.
                </p>
              )}
            </div>

            {/* Velocidad */}
            <div>
              <label className="flex items-center justify-between text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">
                <span className="flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-emerald-400" />
                  Velocidad
                </span>
                <span className="text-emerald-300 font-mono normal-case">{rate.toFixed(2)}×</span>
              </label>
              <input
                type="range"
                min={RATE_MIN}
                max={RATE_MAX}
                step={0.05}
                value={rate}
                onChange={(e) => aplicar({ rate: Number(e.target.value) })}
                className="w-full accent-emerald-400 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-zinc-600 font-mono">
                <span>lenta {RATE_MIN}×</span>
                <span>{RATE_MAX}× rápida</span>
              </div>
            </div>

            {/* Tono */}
            <div>
              <label className="flex items-center justify-between text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">
                <span className="flex items-center gap-1">
                  <Radio className="w-3 h-3 text-violet-400" />
                  Tono
                </span>
                <span className="text-violet-300 font-mono normal-case">{pitch.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={PITCH_MIN}
                max={PITCH_MAX}
                step={0.05}
                value={pitch}
                onChange={(e) => aplicar({ pitch: Number(e.target.value) })}
                className="w-full accent-violet-400 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-zinc-600 font-mono">
                <span>grave {PITCH_MIN}</span>
                <span>{PITCH_MAX} agudo</span>
              </div>
            </div>
          </div>

          <div className="px-3 py-1.5 bg-[#04060d] border-t border-[#141d2e] text-[9px] text-zinc-600 font-mono leading-relaxed">
            El tono aplica a la voz del navegador; en voces Gemini, el tono lo fija cada voz y solo cambia la velocidad.
          </div>
        </div>
      )}
    </div>
  );
};
