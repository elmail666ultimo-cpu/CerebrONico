/**
 * ttsConfig.ts — CONFIGURACIÓN COMPARTIDA DEL SELECTOR DE VOZ (v1.15.0)
 * =====================================================================
 * Petición que originó este archivo: «el botón de TTS funciona bien pero no
 * tiene cambio de voz ni tono/velocidad».
 *
 * El selector de voz vivía dentro de ChatCenter como un `<select>` que se
 * quitó (v1.6.19) por ocupar sitio, y la velocidad/tono del navegador estaban
 * FIJOS a mano (`rate = 1.02`, `pitch = 1`). Para que el botón de la barra
 * superior y el chat (que es quien realmente habla) usen la MISMA elección sin
 * duplicar estado, este módulo es la fuente única: lee y escribe localStorage
 * y avisa por un evento de `window` cuando algo cambia.
 *
 * Semántica de `voz`:
 *   - `"navegador"`          → elegir automáticamente la mejor voz del sistema
 *                              (la lógica de `utils/voz.ts`).
 *   - un id de VOCES_GEMINI  → voz Gemini vía /api/tts/gemini (requiere clave).
 *   - cualquier otro nombre  → una voz CONCRETA del sistema, por su `name`.
 */

import { loadString, saveString } from "./storage";
import { LS_KEYS } from "../constants";

/** Rango permitido para la velocidad (rate) del habla. */
export const RATE_MIN = 0.5;
export const RATE_MAX = 2.0;
/** Rango permitido para el tono (pitch) del habla. */
export const PITCH_MIN = 0.5;
export const PITCH_MAX = 2.0;

/** Clave heredada de v1.6.x: la elección de voz ya se guardaba aquí. */
const CLAVE_VOZ = "cerebronico.ttsVoice";
const CLAVE_RATE = "cerebronico.ttsRate";
const CLAVE_PITCH = "cerebronico.ttsPitch";

/** Evento que se dispara en `window` cada vez que cambia la configuración. */
export const EVENTO_CONFIG_TTS = "cerebronico:tts-config";

export interface ConfigTts {
  /** "navegador" | id Gemini | nombre de voz del sistema. */
  voz: string;
  /** Velocidad de lectura (0.5–2.0). */
  rate: number;
  /** Tono de la voz (0.5–2.0). Solo aplica a la voz del navegador. */
  pitch: number;
}

export const CONFIG_TTS_DEFAULT: ConfigTts = {
  voz: "navegador",
  rate: 1,
  pitch: 1,
};

/** Subconjunto curado de voces Gemini. El listado completo vive en /api/tts/voices. */
export const VOCES_GEMINI: Array<{ id: string; label: string }> = [
  { id: "Zephyr", label: "Gemini · Zephyr (brillante)" },
  { id: "Puck", label: "Gemini · Puck (animada)" },
  { id: "Kore", label: "Gemini · Kore (firme)" },
  { id: "Aoede", label: "Gemini · Aoede (despejada)" },
  { id: "Leda", label: "Gemini · Leda (juvenil)" },
  { id: "Charon", label: "Gemini · Charon (informativa)" },
  { id: "Enceladus", label: "Gemini · Enceladus (susurrante)" },
  { id: "Gacrux", label: "Gemini · Gacrux (madura)" },
];

export function esVozGemini(id: string | null | undefined): boolean {
  return !!id && VOCES_GEMINI.some((v) => v.id === id);
}

/** ¿Hay clave Gemini configurada en la app? (decide si las voces Gemini son reales). */
export function leerClaveGeminiTts(): boolean {
  try {
    return !!loadString(LS_KEYS.GEMINI_API_KEY).trim();
  } catch {
    return false;
  }
}

/** Ajusta un número al rango [min, max] y, si no es número, devuelve el fallback. */
function acotar(n: unknown, min: number, max: number, fallback: number): number {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

/** Lee la configuración desde localStorage, saneando valores corruptos. */
export function cargarConfigTts(): ConfigTts {
  let voz = CONFIG_TTS_DEFAULT.voz;
  try {
    const v = loadString(CLAVE_VOZ);
    if (v) voz = v;
  } catch {
    /* noop */
  }

  let rate = CONFIG_TTS_DEFAULT.rate;
  let pitch = CONFIG_TTS_DEFAULT.pitch;
  try {
    rate = acotar(Number(loadString(CLAVE_RATE, String(CONFIG_TTS_DEFAULT.rate))), RATE_MIN, RATE_MAX, CONFIG_TTS_DEFAULT.rate);
  } catch {
    /* noop */
  }
  try {
    pitch = acotar(Number(loadString(CLAVE_PITCH, String(CONFIG_TTS_DEFAULT.pitch))), PITCH_MIN, PITCH_MAX, CONFIG_TTS_DEFAULT.pitch);
  } catch {
    /* noop */
  }

  return { voz, rate, pitch };
}

/**
 * Guarda la configuración y avisa por el evento de `window` para que el chat
 * (que es quien habla) se sincronice sin recargar. Devuelve el objeto saneado
 * que quedó guardado, para que quien llama pueda pintar valores reales.
 */
export function guardarConfigTts(cfg: Partial<ConfigTts>): ConfigTts {
  const actual = cargarConfigTts();
  const siguiente: ConfigTts = {
    voz: cfg.voz ?? actual.voz,
    rate: acotar(cfg.rate, RATE_MIN, RATE_MAX, actual.rate),
    pitch: acotar(cfg.pitch, PITCH_MIN, PITCH_MAX, actual.pitch),
  };

  try {
    saveString(CLAVE_VOZ, siguiente.voz);
    saveString(CLAVE_RATE, String(siguiente.rate));
    saveString(CLAVE_PITCH, String(siguiente.pitch));
  } catch {
    /* noop */
  }

  try {
    window.dispatchEvent(new CustomEvent(EVENTO_CONFIG_TTS, { detail: siguiente }));
  } catch {
    /* noop */
  }

  return siguiente;
}
