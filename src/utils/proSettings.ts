/**
 * proSettings.ts — Configuración profesional del IDE (v1.8)
 * Persistencia local + aplicación de variables CSS + exportar/importar/reset.
 * Todo lo que un IDE pro debe poder configurar vive aquí.
 */

export type ThemeId = "dark" | "midnight" | "carbon" | "light";

export interface WallpaperConfig {
  enabled: boolean;
  url: string;          // URL o dataURL subida por el usuario
  opacity: number;      // 0..1
  blur: number;         // px
  dim: number;          // 0..0.8  (capa negra encima para legibilidad)
  fit: "cover" | "contain" | "repeat";
  position: "center" | "top" | "bottom";
}

export interface ProSettings {
  appearance: {
    theme: ThemeId;
    accent: string;
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    density: "compacta" | "normal" | "comoda";
    reduceMotion: boolean;
    showGrid: boolean;
    borderRadius: number;
  };
  wallpaper: WallpaperConfig;
  editor: {
    tabSize: number;
    insertSpaces: boolean;
    wordWrap: boolean;
    minimap: boolean;
    lineNumbers: boolean;
    highlightActiveLine: boolean;
    renderWhitespace: boolean;
    rulers: number[];
    fontLigatures: boolean;
    formatOnSave: boolean;
    autoSave: boolean;
    autoSaveDelayMs: number;
    bracketPairs: boolean;
    // F1 · autocorrector del composer: off / sugerir / auto (persistido).
    autocorrector: "off" | "sugerir" | "auto";
  };
  ai: {
    chatModel: string;
    agentModel: string;
    temperature: number;
    topP: number;
    topK: number;
    maxTokens: number;
    contextSize: number;
    stream: boolean;
    keepAlive: string;
    retries: number;
    timeoutMs: number;
    firstTokenTimeoutMs: number;
    systemExtra: string;
    language: "es" | "en";
    executionMode: "auto" | "rapido" | "ingeniero" | "profundo";
    autoApproveReadTools: boolean;
    maxAgentSteps: number;
  };
  net: {
    idePort: number;
    ollamaUrl: string;
    bridgeUrl: string;
    sandboxPort: number;
    lanMode: boolean;
    accessToken: string;
    allowRemoteCalls: boolean;
    offlineMode: boolean;
  };
  perf: {
    ramLimitMb: number;
    gpuLayers: number;
    maxThreads: number;
    cacheMb: number;
    autoPurge: boolean;
    logLevel: "error" | "warn" | "info" | "debug";
    telemetryMs: number;
  };
}

export const LS_PRO = "codigo0_pro_settings";

export const DEFAULTS: ProSettings = {
  appearance: {
    theme: "dark",
    accent: "#22d3ee",
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    fontSize: 14, /* V8: default neutral — body usa var(--cn-font-size); 14px es el tamaño que heredaba antes */
    lineHeight: 1.5,
    density: "normal",
    reduceMotion: false,
    showGrid: false,
    borderRadius: 10,
  },
  // Por defecto el fondo usa un degradado interno (siempre carga, sin depender de internet)
  wallpaper: { enabled: true, url: "", opacity: 0.5, blur: 0, dim: 0.45, fit: "cover", position: "center" },
  editor: {
    tabSize: 2,
    insertSpaces: true,
    wordWrap: true,
    minimap: false,
    lineNumbers: true,
    highlightActiveLine: true,
    renderWhitespace: false,
    rulers: [100],
    fontLigatures: true,
    formatOnSave: false,
    autoSave: true,
    autoSaveDelayMs: 800,
    bracketPairs: true,
    autocorrector: "sugerir",
  },
  ai: {
    chatModel: "",
    agentModel: "",
    temperature: 0.4,
    topP: 0.9,
    topK: 40,
    maxTokens: 4096,
    contextSize: 8192,
    stream: true,
    keepAlive: "30m",
    retries: 3,
    timeoutMs: 300000,
    firstTokenTimeoutMs: 180000,
    systemExtra: "",
    language: "es",
    executionMode: "auto",
    autoApproveReadTools: true,
    maxAgentSteps: 10,
  },
  net: {
    idePort: 3000,
    ollamaUrl: "http://127.0.0.1:11434",
    bridgeUrl: "http://127.0.0.1:5000",
    sandboxPort: 3500,
    lanMode: false,
    accessToken: "",
    allowRemoteCalls: false,
    offlineMode: false,
  },
  perf: {
    ramLimitMb: 4096,
    gpuLayers: -1,
    maxThreads: 0,
    cacheMb: 512,
    autoPurge: true,
    logLevel: "info",
    telemetryMs: 5000,
  },
};

/** Fusión profunda tolerante (no rompe si faltan claves nuevas) */
export function mergeSettings(base: any, patch: any): ProSettings {
  const out: any = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? mergeSettings(base?.[k] ?? {}, v) : v;
  }
  return out as ProSettings;
}

export function loadProSettings(): ProSettings {
  try {
    const raw = localStorage.getItem(LS_PRO);
    if (!raw) return DEFAULTS;
    return mergeSettings(DEFAULTS, JSON.parse(raw));
  } catch {
    return DEFAULTS;
  }
}

export function saveProSettings(s: ProSettings) {
  try {
    localStorage.setItem(LS_PRO, JSON.stringify(s));
  } catch {}
}

export function exportProSettings(s: ProSettings): string {
  return JSON.stringify(s, null, 2);
}

export function importProSettings(json: string): ProSettings {
  return mergeSettings(DEFAULTS, JSON.parse(json));
}

/**
 * Presets de fondo del menú «Degradados incluidos».
 *
 * v8.0.1 — Se añaden PRESETS DE IMAGEN (petición del usuario: «las imágenes
 * déjalas para seleccionar en el menú»). Antes solo había degradados CSS, así
 * que las imágenes del cerebro solo se podían meter una a una con el selector
 * de archivos: no había forma de volver a una sin volver a subirla.
 *
 * CÓMO FUNCIONA SIN TOCAR EL RENDER: `AppBackground` asigna `preset.css`
 * directamente a `background-image`, y un `url(...)` es un valor válido de esa
 * propiedad. Así que un preset de imagen no necesita ni una línea de código
 * nueva en el componente — es el mismo camino que ya usaban los degradados.
 *
 * ⚠️ `remoto: true` marca los que SÍ necesitan internet. Los degradados
 * cargan siempre; las imágenes no. Se etiqueta en el nombre para que el menú no
 * mienta, y se declara aquí para que cualquier filtro futuro pueda separarlos.
 *
 * SOBRE EL GIF (defecto que reportó el usuario: «me di cuenta que no admite
 * gif»): un GIF **sí** se anima como `background-image` en un navegador. Lo que
 * no lo admitía era el SELECCIONADOR DE ARCHIVOS, que además reescalaba todo con
 * canvas → JPEG y mataba la animación. Eso está corregido en `App.tsx`
 * (`handleBgFileSelected`). Aquí, cualquier preset puede apuntar a un `.gif` y
 * se animará igual que una imagen fija.
 */
export interface WallpaperPreset {
  id: string;
  label: string;
  css: string;
  /** true = necesita internet (imagen remota); false/ausente = degradado local. */
  remoto?: boolean;
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  // v1.15.1 — El cerebro de siempre pasa a ser un PRESET local (no una imagen
  // "personalizada" embebida a mano en App.tsx). Así el panel Pro puede
  // cambiarlo por cualquier otro fondo y volver a él sin subir nada.
  { id: "predeterminado", label: "Cerebro (predeterminado)", css: 'url("/fondo-predeterminado.jpg")' },
  { id: "aurora", label: "Aurora", css: "radial-gradient(120% 80% at 15% 0%, #0e3a4a 0%, transparent 55%), radial-gradient(100% 70% at 85% 20%, #2a1a4d 0%, transparent 60%), linear-gradient(180deg,#05070d,#02040a)" },
  { id: "brain", label: "Neuronal", css: "radial-gradient(60% 50% at 50% 40%, #1b2a5e 0%, transparent 60%), radial-gradient(40% 40% at 70% 70%, #0e4a45 0%, transparent 65%), linear-gradient(180deg,#04060d,#010205)" },
  { id: "carbon", label: "Carbón", css: "repeating-linear-gradient(45deg,#08090c 0 12px,#06070a 12px 24px)" },
  { id: "matrix", label: "Matrix", css: "radial-gradient(80% 60% at 20% 10%, #06301f 0%, transparent 60%), linear-gradient(180deg,#020604,#010302)" },
  { id: "sunset", label: "Atardecer", css: "radial-gradient(70% 60% at 80% 10%, #4a1d2e 0%, transparent 60%), radial-gradient(60% 50% at 10% 40%, #2b1c4a 0%, transparent 60%), linear-gradient(180deg,#08060a,#020204)" },

  // ---------- IMÁGENES (requieren internet) ----------
  { id: "cerebro-chip", label: "Cerebro · chip (imagen)", remoto: true, css: 'url("https://sc04.alicdn.com/kf/Sc25fb60e0d5a4ffd887ec435a80a72d0Y.jpg")' },
  { id: "cerebro-flujo", label: "Cerebro · flujo de datos (imagen)", remoto: true, css: 'url("https://sc04.alicdn.com/kf/S004f4b0c291e446c9cc95523a8aeebecN.jpg")' },
  { id: "cerebro-cristal", label: "Cerebro · cristal (imagen)", remoto: true, css: 'url("https://sc04.alicdn.com/kf/S09296bd5001746d39830f1b4653d4ad0e.jpg")' },
];

const THEMES: Record<ThemeId, { bg: string; panel: string; border: string; text: string }> = {
  dark: { bg: "#05070d", panel: "#0a0f1a", border: "#162034", text: "#e5e7eb" },
  midnight: { bg: "#02040a", panel: "#070c16", border: "#111c30", text: "#dbeafe" },
  carbon: { bg: "#0b0b0d", panel: "#121215", border: "#242428", text: "#e7e7ea" },
  light: { bg: "#f6f7f9", panel: "#ffffff", border: "#dfe3ea", text: "#111827" },
};

/** Aplica tema/tipografía/acento como variables CSS globales */
export function applyProSettings(s: ProSettings) {
  const t = THEMES[s.appearance.theme] || THEMES.dark;
  const root = document.documentElement;
  root.style.setProperty("--cn-bg", t.bg);
  root.style.setProperty("--cn-panel", t.panel);
  root.style.setProperty("--cn-border", t.border);
  root.style.setProperty("--cn-text", t.text);
  root.style.setProperty("--cn-accent", s.appearance.accent);
  root.style.setProperty("--cn-font", s.appearance.fontFamily);
  root.style.setProperty("--cn-font-size", `${s.appearance.fontSize}px`);
  root.style.setProperty("--cn-line-height", String(s.appearance.lineHeight));
  root.style.setProperty("--cn-radius", `${s.appearance.borderRadius}px`);
  const dens = s.appearance.density === "compacta" ? 0.86 : s.appearance.density === "comoda" ? 1.12 : 1;
  root.style.setProperty("--cn-density", String(dens));
  root.dataset.theme = s.appearance.theme;
  root.dataset.density = s.appearance.density;
  if (s.appearance.reduceMotion) root.dataset.reduceMotion = "1";
  else delete root.dataset.reduceMotion;
}
