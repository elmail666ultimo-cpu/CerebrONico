/**
 * tema.ts — TEMA DE COLOR + PROPORCIÓN DE LA INTERFAZ (v1.15.1 · REFORMA)
 * =====================================================================
 * Problema que resuelve: hasta ahora la interfaz estaba CLAVADA en cian
 * (`#22d3ee`) repartido en ~400 clases sueltas de Tailwind. No había UNA
 * variable de color de acento: cambiarla exigía tocar el código.
 *
 * La reforma:
 *   1. El CSS deriva TODA la escala del acento desde `--cn-accent` (ver
 *      index.css, bloque «TEMA DE ACENTO»): al cambiar la variable, TODO lo
 *      que usaba cian — texto, bordes, fondos, tintes /20, anillos — sigue.
 *   2. Este módulo es la fuente PURA de los ajustes: color de acento,
 *      redondez (--cn-radius) y densidad (--cn-density). Persiste en
 *      localStorage y aplica sin re-render escribiendo variables en <html>.
 *
 * Puro, sin DOM en la lógica: `normalizar` y las constantes se prueban en
 * node; el DOM solo lo toca `aplicarTema` (guarded) y la UI.
 */

export interface ConfigTema {
  /** HEX del acento (#rgb | #rrggbb). La escala se deriva sola. */
  acento: string;
  /** Radio de esquinas en px (redondez de paneles/botones). */
  radio: number;
  /** Densidad de la interfaz (0.85 apretado … 1.25 holgado). */
  densidad: number;
}

export const TEMA_ACENTO_POR_DEFECTO = "#22d3ee";
export const RADIO_POR_DEFECTO = 10;
export const DENSIDAD_POR_DEFECTO = 1;
export const RADIO_MIN = 4;
export const RADIO_MAX = 24;
export const DENSIDAD_MIN = 0.85;
export const DENSIDAD_MAX = 1.25;

export const CONFIG_TEMA_POR_DEFECTO: ConfigTema = {
  acento: TEMA_ACENTO_POR_DEFECTO,
  radio: RADIO_POR_DEFECTO,
  densidad: DENSIDAD_POR_DEFECTO,
};

/** Paleta de acentos de un clic (los favoritos, seguros sobre fondo oscuro). */
export const ACENTOS: ReadonlyArray<{ id: string; nombre: string; hex: string }> = [
  { id: "cian", nombre: "Cian", hex: "#22d3ee" },
  { id: "esmeralda", nombre: "Esmeralda", hex: "#10b981" },
  { id: "violeta", nombre: "Violeta", hex: "#8b5cf6" },
  { id: "ambar", nombre: "Ámbar", hex: "#f59e0b" },
  { id: "rosa", nombre: "Rosa", hex: "#f43f5e" },
  { id: "azul", nombre: "Azul", hex: "#3b82f6" },
];

const CLAVE = "cerebronico.tema";

/** ¿HEX válido? Acepta #rgb y #rrggbb (lo demás se descarta al normalizar). */
export function hexValido(h: unknown): h is string {
  return typeof h === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h);
}

/** Normaliza un objeto sucio a un ConfigTema legal (nada silencioso: lo ilegal cae al por defecto). */
export function normalizarTema(parcial: Partial<ConfigTema> | null | undefined): ConfigTema {
  const p = parcial || {};
  const acento = hexValido(p.acento) ? p.acento : TEMA_ACENTO_POR_DEFECTO;
  const radioNum = typeof p.radio === "number" && Number.isFinite(p.radio) ? p.radio : RADIO_POR_DEFECTO;
  const densidadNum = typeof p.densidad === "number" && Number.isFinite(p.densidad) ? p.densidad : DENSIDAD_POR_DEFECTO;
  return {
    acento,
    radio: Math.min(RADIO_MAX, Math.max(RADIO_MIN, Math.round(radioNum))),
    densidad: Math.min(DENSIDAD_MAX, Math.max(DENSIDAD_MIN, densidadNum)),
  };
}

export function leerTemaLocal(): ConfigTema {
  try {
    const crudo = typeof localStorage !== "undefined" ? localStorage.getItem(CLAVE) : null;
    if (!crudo) return { ...CONFIG_TEMA_POR_DEFECTO };
    return normalizarTema(JSON.parse(crudo));
  } catch {
    return { ...CONFIG_TEMA_POR_DEFECTO };
  }
}

export function escribirTemaLocal(c: ConfigTema): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(CLAVE, JSON.stringify(c));
    return true;
  } catch {
    return false;
  }
}

/**
 * Aplica el tema escribiendo variables en <html> (inline gana a :root).
 * Guarded: en node no hace nada.
 */
export function aplicarTema(c: ConfigTema): void {
  if (typeof document === "undefined") return;
  const r = document.documentElement;
  const t = normalizarTema(c);
  r.style.setProperty("--cn-accent", t.acento);
  r.style.setProperty("--cn-radius", `${t.radio}px`);
  r.style.setProperty("--cn-density", String(t.densidad));
  r.dataset.tema = ACENTOS.find((a) => a.hex.toLowerCase() === t.acento.toLowerCase())?.id ?? "personalizado";
  // Densidad: engancha el atributo que index.css ya consume ([data-density]).
  if (t.densidad < 1) r.dataset.density = "compacta";
  else if (t.densidad > 1) r.dataset.density = "comoda";
  else delete r.dataset.density;
}
