/**
 * espejos.ts — ESPEJOS v1: LOS 10 AGENTES ESPEJO + SUS GRUPOS (IDE v2.5+)
 * ========================================================================
 * Espejos de la info alojada en el motor: funciones deterministas puras.
 * No cargan modelo, no tocan Ollama, no importan Node (viajan al bundle del
 * navegador igual que consejo.ts — lección v2.5: `node:os`/`node:crypto`
 * reventarían rollup). Cero dependencias en tiempo de ejecución.
 *
 * Regla de admisión (manual §8): cada espejo DEVUELVE UN CONTRATO DISTINTO
 * al de los 12 votantes existentes:
 *   · `codigo` decide qué plantilla crear  vs  `espejo.codigos` devuelve el
 *     inventario estructural (símbolos, imports, líneas, ciclomática).
 *   · `linguista` normaliza y cuenta       vs  `espejo.lenguajes` detecta
 *     idioma + perfil de legibilidad.
 *   · `artista` enriquece un prompt        vs  `espejo.artes` calcula
 *     armonías cromáticas reales (HSL).
 *   · `conductor` descompone frases        vs  `espejo.planificadores`
 *     ordena grafos en lotes paralelos (espejo de taskPlanner).
 *   · `investigador` da esqueletos         vs  `espejo.cientificos` fija
 *     diseño experimental + prueba estadística.
 *   · `matematico` vota frases sueltas     vs  `espejo.matematicos`
 *     devuelve resultado ESTRUCTURADO (JSON) con factorización y mcd/mcm.
 *   · diseños/creadores/físicos/cuánticos: ningún votante los cubre.
 *
 * Contrato de salida (consejo.ts): { ok, salida?: string, motivo?, entidad, ms }
 * — cuando ok:false, `motivo` NUNCA falta (regla de hierro).
 * `salida` es SIEMPRE un JSON compacto: cualquier plan puede interrogarlo
 * después con `datos.json-ruta`. Así un espejo alimenta a otro sin RAM.
 *
 * GRUPOS: los espejos se agrupan por nombre para seleccionar equipo por tarea
 * (estoy haciendo código → grupo «codigo» y su contexto; arte → «arte»…).
 * La selección vive en dos sitios con la MISMA forma (fuente única de reglas
 * en este módulo): el motor (memoria + .cerebro-db/espejos.json vía server.ts)
 * y el navegador (localStorage «cn.espejos.seleccion», para el prompt del
 * chat). `notaSeleccionEspejos()` la traduce a una línea que el director
 * neural lee antes de planificar.
 */
import type { Entidad, ResultadoEntidad } from "./consejo";

// ═══ Tipos de grupo y selección ═══════════════════════════════════════════

export interface GrupoEspejos {
  id: string;
  nombre: string;
  icono: string;
  /** ids de espejo (prefijo «espejo.») que forman el equipo */
  espejos: string[];
  /** una línea: qué contexto inyecta este grupo al planificador/chat */
  contexto: string;
}

export interface SeleccionEspejos {
  /** "ninguno" | id de grupo | "todos" */
  grupo: string;
  /** resolución efectiva (grupo ∪ ajustes manuales), siempre ids válidos */
  espejos: string[];
}

export const IDS_ESPEJOS = [
  // V8 — el GENERALISTA PRINCIPAL va primero: es el integrador que lee el
  // pedido, detecta el dominio por señales, extrae fragmentos ejecutables,
  // llama a los especialistas y devuelve la síntesis con procedencia.
  // No pertenece a ningún grupo (los integra); "todos" y "auto" lo incluyen.
  "espejo.generalista",
  "espejo.codigos", "espejo.lenguajes", "espejo.artes", "espejo.disenios", "espejo.creadores",
  "espejo.planificadores", "espejo.cientificos", "espejo.fisicos", "espejo.matematicos", "espejo.cuantico",
] as const;

export const GRUPOS_ESPEJOS: GrupoEspejos[] = [
  {
    id: "codigo", nombre: "Código", icono: "💻",
    espejos: ["espejo.codigos", "espejo.lenguajes", "espejo.planificadores", "espejo.matematicos"],
    contexto: "Programar: inventario estructural del código, detección de idioma para documentación, lotes paralelos de plan y aritmética exacta. Prefiere tareas `reflejo` con estas entidades antes que preguntar al neural.",
  },
  {
    id: "arte", nombre: "Arte y Diseño", icono: "🎨",
    espejos: ["espejo.artes", "espejo.disenios", "espejo.creadores"],
    contexto: "Diseño: armonías cromáticas (HSL), grillas y escalas 8pt, y variantes reproducibles por semilla. Combínalas con `generar_imagen`/`artista`: el espejo fija la paleta y la retícula; el artista pinta.",
  },
  {
    id: "ciencia", nombre: "Ciencia", icono: "🔬",
    espejos: ["espejo.cientificos", "espejo.fisicos", "espejo.matematicos", "espejo.lenguajes"],
    contexto: "Investigar: diseño experimental y prueba estadística sugerida, expresiones con constantes físicas y conversión SI, aritmética exacta y perfil de texto para resúmenes.",
  },
  {
    id: "cuantica", nombre: "Cuántica", icono: "⚛️",
    espejos: ["espejo.cuantico", "espejo.fisicos", "espejo.matematicos", "espejo.cientificos"],
    contexto: "Computación cuántica: simulación determinista del registro (H/X/Y/Z/S/T/CNOT) con amplitudes y probabilidades, más el soporte físico-matemático.",
  },
];

/** ids válidos de selección: los grupos + "todos" + "manual" + "auto" + "ninguno".
 *  "auto" (GRUPO v1, Reflejo v5): el equipo se elige TAREA A TAREA según el
 *  contenido, sin que nadie mueva selectores — la autonomía que pidió el
 *  recap, hecha con palabras clave deterministas en vez de un clasificador
 *  semántico que costaría RAM que esta máquina no tiene. */
export const IDS_SELECCION = ["ninguno", "todos", "manual", "auto", ...GRUPOS_ESPEJOS.map((g) => g.id)];

/** Espejos de un grupo ("todos" → los 10; "manual"/"ninguno" → base vacía;
 *  "auto" → la unión de todos, que es el techo real: cada tarea elige su
 *  subconjunto con `grupoPorTarea`, pero el catálogo disponible es completo). */
export function espejosDelGrupo(grupo: string): string[] {
  if (grupo === "todos" || grupo === "auto") return [...IDS_ESPEJOS];
  const g = GRUPOS_ESPEJOS.find((x) => x.id === grupo);
  return g ? [...g.espejos] : [];
}

// ═══ GRUPO v1 · el equipo por tarea (autonomía determinista) ═══════════════

/** Vocabulario de cada grupo: lo que delata una tarea de esa disciplina.
 *  Minúsculas; se compara contra tokens normalizados (sin acentos). */
const PALABRAS_GRUPO: Record<string, string[]> = {
  codigo: ["codigo", "code", "bug", "debug", "depura", "refactor", "funcion", "function", "clase", "class", "variable", "script", "api", "endpoint", "test", "prueba unitaria", "typescript", "javascript", "python", "rust", "react", "vue", "svelte", "npm", "modulo", "module", "import", "compile", "compila", "repositorio", "git", "sql", "query", "array", "bucle", "loop", "regex", "json", "yaml"],
  arte: ["disena", "diseno", "design", "paleta", "color", "colores", "logo", "marca", "branding", "poster", "cartel", "banner", "maqueta", "mockup", "ui", "ux", "interfaz", "fuente", "tipografia", "grilla", "grid", "icono", "illustracion", "ilustracion", "figura", "dibuja", "dibujar", "pinta", "imagen", "render", "estilo", "armonia", "visual"],
  ciencia: ["experimento", "hipotesis", "muestra", "estadistica", "media", "mediana", "desviacion", "anova", "t-test", "chi-cuadrado", "probabilidad", "fisica", "quimica", "biologia", "unidades", "conversion", "convierte", "medida", "evidencia", "investiga", "paper", "articulo", "cita", "constante"],
  cuantica: ["qubit", "qubits", "cuantico", "cuantica", "superposicion", "entrelazamiento", "hadamard", "cnot", "puerta h", "estado bell", "registro cuantico", "amplitud", "colapso", "decoherencia"],
};

/** Normalización NFD sin acentos y en minúsculas (misma ley lingüística que el resto del motor). */
function tokeniza(texto: string): string {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export interface EleccionGrupo {
  grupo: string;
  icono: string;
  espejos: string[];
  /** 0..1: puntos del ganador sobre el total de señales encontradas. */
  confianza: number;
  /** Palabras que decidieron (auditoría: por qué este equipo y no otro). */
  senales: string[];
}

/**
 * Elige el equipo de espejos para UNA tarea por contenido, sin modelo y sin
 * red. Empate o ausencia de señales → null (el llamador usa el equipo
 * global o ninguno: nada de inventar un grupo cuando no hay evidencia).
 */
export function grupoPorTarea(texto: string): EleccionGrupo | null {
  const t = tokeniza(texto);
  if (!t.trim()) return null;
  let mejor: { id: string; puntos: number; senales: string[] } | null = null;
  let totalPuntos = 0;
  const porGrupo: Record<string, { puntos: number; senales: string[] }> = {};
  for (const [id, palabras] of Object.entries(PALABRAS_GRUPO)) {
    porGrupo[id] = { puntos: 0, senales: [] };
    for (const p of palabras) {
      const clave = tokeniza(p);
      // `includes` sobre la frase tokenizada: "prueba unitaria" exige la frase completa.
      if (clave && t.includes(clave)) {
        porGrupo[id].puntos += clave.includes(" ") ? 2 : 1; // las frases valen doble
        porGrupo[id].senales.push(p);
      }
    }
    totalPuntos += porGrupo[id].puntos;
    if (!mejor || porGrupo[id].puntos > mejor.puntos) mejor = { id, puntos: porGrupo[id].puntos, senales: porGrupo[id].senales };
  }
  if (!mejor || mejor.puntos === 0) return null;
  // Señal débil (una sola palabra suelta) o empate técnico con otro grupo → no hay evidencia.
  const segundo = Object.entries(porGrupo).filter(([id]) => id !== mejor!.id).sort((a, b) => b[1].puntos - a[1].puntos)[0];
  const confianza = Math.min(1, mejor.puntos / Math.max(1, totalPuntos));
  if (mejor.puntos < 2 && (!segundo || segundo[1].puntos === 0)) {
    // una sola palabra y ningún rival: es débil pero no ambigua — la dejamos pasar con confianza baja
  } else if (segundo && segundo[1].puntos >= mejor.puntos) {
    return null; // empate: el auto no lanza monedas (misma ley que el orquestador v5)
  }
  const g = GRUPOS_ESPEJOS.find((x) => x.id === mejor.id);
  if (!g) return null;
  return { grupo: g.id, icono: g.icono, espejos: [...g.espejos], confianza: Math.round(confianza * 100) / 100, senales: mejor.senales.slice(0, 6) };
}

/**
 * Valida una selección cruda (petición HTTP, localStorage, JSON a mano).
 * Nunca lanza: dice POR QUÉ no. Fuente única para server.ts y la UI.
 */
export function normalizarSeleccion(
  bruto: unknown,
): { ok: true; seleccion: SeleccionEspejos } | { ok: false; motivo: string } {
  const o = bruto as { grupo?: unknown; espejos?: unknown };
  if (!o || typeof o !== "object" || typeof o.grupo !== "string")
    return { ok: false, motivo: "falta «grupo» (uno de: " + IDS_SELECCION.join(" | ") + ")." };
  if (!IDS_SELECCION.includes(o.grupo))
    return { ok: false, motivo: `grupo «${o.grupo}» no existe (conocidos: ${IDS_SELECCION.join(" | ")}).` };
  let espejos = espejosDelGrupo(o.grupo);
  if (o.espejos !== undefined) {
    if (!Array.isArray(o.espejos) || !o.espejos.every((x) => typeof x === "string" && (IDS_ESPEJOS as readonly string[]).includes(x)))
      return { ok: false, motivo: "«espejos» debe ser una lista de ids conocidos (mira IDS_ESPEJOS)." };
    espejos = [...new Set(o.espejos as string[])]; // ajuste manual sobre el grupo
  }
  return { ok: true, seleccion: { grupo: o.grupo, espejos } };
}

// ═══ Estado de la selección: motor (servidor) y navegador (localStorage) ═══

const LS_CLAVE = "cn.espejos.seleccion";
let SELECCION_MOTOR: SeleccionEspejos = { grupo: "ninguno", espejos: [] };

export function fijarSeleccion(sel: SeleccionEspejos): void { SELECCION_MOTOR = sel; }
export function seleccionMotor(): SeleccionEspejos { return SELECCION_MOTOR; }

export function leerSeleccionLocal(): SeleccionEspejos | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const bruto = localStorage.getItem(LS_CLAVE);
    if (!bruto) return null;
    const ns = normalizarSeleccion(JSON.parse(bruto));
    return ns.ok ? ns.seleccion : null;
  } catch { return null; }
}
export function guardarSeleccionLocal(sel: SeleccionEspejos): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(LS_CLAVE, JSON.stringify(sel));
    return true;
  } catch { return false; }
}

/** Lo que ve el /api/consejo/espejos y el selector de la UI. */
export function estadoEspejos() {
  return {
    ok: true,
    version: "espejos v1",
    total: IDS_ESPEJOS.length,
    grupos: GRUPOS_ESPEJOS.map((g) => ({ id: g.id, nombre: g.nombre, icono: g.icono, espejos: g.espejos, contexto: g.contexto })),
    seleccion: SELECCION_MOTOR,
    // GRUPO v1: el modo auto existe y se explica solo.
    modos: IDS_SELECCION,
    nota: "11 agentes espejo deterministas (~0 RAM, sin modelo): el generalista principal (espejo.generalista) integra — detecta el dominio, extrae fragmentos, llama a los especialistas y devuelve la síntesis con procedencia; si no hay señales, lo declara y deriva al conductor. El grupo activo solo cambia el CONTEXTO que recibe el director: los 11 están siempre despiertos y usables por id. Modo «auto»: el equipo se elige por tarea con grupoPorTarea (determinista, sin modelo).",
  };
}

/**
 * La línea que el prompt del modelo lee: preferencia motor → localStorage.
 * "" cuando no hay selección (no ensucia el prompt).
 */
export function notaSeleccionEspejos(): string {
  const sel = SELECCION_MOTOR.espejos.length ? SELECCION_MOTOR : leerSeleccionLocal();
  // GRUPO v1 · modo AUTO: la nota enseña al director la regla por tarea.
  if (sel && sel.grupo === "auto") {
    const nota =
      "MODO EQUIPO AUTO: no hay un grupo fijo — cada tarea elige su equipo por contenido (codigo 💻 / arte 🎨 / ciencia 🔬 / cuantica ⚛️). " +
      "Antes de preguntar al neural, decide el grupo de la tarea con sus palabras del dominio y usa `consultar_espejo` en lote con los espejos de ese equipo " +
      "(codigo→codigos,lenguajes,planificadores,matematicos · arte→artes,disenios,creadores · ciencia→cientificos,fisicos,matematicos,lenguajes · cuantica→cuantico,fisicos,matematicos,cientificos). " +
      "Si la tarea cruza dominios o no tienes claro el equipo, usa espejo.generalista: detecta las señales, extrae los fragmentos, llama a los especialistas y devuelve la síntesis con procedencia (y si no hay nada que extraer, lo declara y deriva al conductor). Nunca adivines equipo.";
    return leerTurbo() ? nota + " " + CATALOGO_TURBO : nota;
  }
  if (!sel || !sel.espejos.length) return leerTurbo() ? CATALOGO_TURBO : "";
  const g = GRUPOS_ESPEJOS.find((x) => x.id === sel.grupo);
  const nombre = g ? g.nombre : sel.grupo === "todos" ? "todos los espejos" : sel.grupo === "manual" ? "selección manual" : sel.grupo;
  const contexto = g ? ` CONTEXTO: ${g.contexto}` : "";
  const nota = `EQUIPO ESPEJO ACTIVO «${nombre}» (${sel.espejos.length}/10): ${sel.espejos.join(", ")}.${contexto} Puedes llamarlos TÚ directamente con la herramienta consultar_espejo, en lotes de hasta 8 llamadas: calculan exacto en ~1 ms y sus números son hechos.`;
  return leerTurbo() ? nota + " " + CATALOGO_TURBO : nota;
}

// ═══ Utilidades puras (compartidas por los espejos) ═══════════════════════

const redondear = (n: number, dec = 6): number =>
  !isFinite(n) ? n : Math.round(n * Math.pow(10, dec)) / Math.pow(10, dec);

/** PRNG determinista (mulberry32): la misma semilla, la misma secuencia. */
function prng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSemilla(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// ── Evaluador aritmético sin eval (precedencias, ^, funciones, constantes) ──

type Tok = { k: "num"; v: number } | { k: "nom"; v: string } | { k: "op"; v: string };

const CONST: Record<string, number> = {
  pi: Math.PI, e: Math.E, tau: Math.PI * 2,
  c: 299792458, g: 9.80665, h: 6.62607015e-34, k: 1.380649e-23,
  na: 6.02214076e23, r: 8.31446262,
};
const FUNC: Record<string, (x: number) => number> = {
  raiz: Math.sqrt, sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, log10: Math.log10,
  exp: Math.exp, sen: Math.sin, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  suelo: Math.floor, techo: Math.ceil, round: Math.round,
};

function evaluar(expresion: string): { valor?: number; error?: string } {
  const src = String(expresion).trim().toLowerCase().replace(/,/g, ".");
  if (!src) return { error: "expresión vacía" };
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m || !m[0]) return { error: `número inválido cerca de «${src.slice(i, i + 10)}»` };
      toks.push({ k: "num", v: Number(m[0]) }); i += m[0].length; continue;
    }
    if (/[a-záéíóúñü]/i.test(ch)) {
      const m = /^[a-záéíóúñü]+/i.exec(src.slice(i));
      if (!m) break;
      toks.push({ k: "nom", v: m[0] }); i += m[0].length; continue;
    }
    if ("+-*/^%()".includes(ch)) { toks.push({ k: "op", v: ch }); i++; continue; }
    return { error: `carácter no reconocido «${ch}»` };
  }
  let pos = 0;
  const ver = () => toks[pos];
  const comer = (op: string) => !!(ver() && ver().k === "op" && (ver() as { v: string }).v === op && pos++);
  function expr(): number {
    let v = term();
    while (ver() && ver().k === "op") {
      const op = (ver() as { v: string }).v;
      if (op !== "+" && op !== "-") break;
      pos++; const d = term(); v = op === "+" ? v + d : v - d;
    }
    return v;
  }
  function term(): number {
    let v = factor();
    while (ver() && ver().k === "op") {
      const op = (ver() as { v: string }).v;
      if (op !== "*" && op !== "/" && op !== "%") break;
      pos++; const d = factor();
      if (op === "*") v *= d;
      else if (op === "/") { if (d === 0) throw new Error("división por cero"); v /= d; }
      else { if (d === 0) throw new Error("módulo por cero"); v %= d; }
    }
    return v;
  }
  function factor(): number {
    const base = primaria();
    if (ver() && ver().k === "op" && (ver() as { v: string }).v === "^") { pos++; return Math.pow(base, factor()); }
    return base;
  }
  function primaria(): number {
    if (comer("-")) return -primaria();
    if (comer("+")) return primaria();
    if (comer("(")) { const v = expr(); if (!comer(")")) throw new Error("paréntesis sin cerrar"); return v; }
    const tk = ver();
    if (!tk) throw new Error("expresión incompleta");
    if (tk.k === "num") { pos++; return tk.v; }
    if (tk.k === "nom") {
      pos++;
      if (ver() && ver().k === "op" && (ver() as { v: string }).v === "(") {
        pos++; const arg = expr(); if (!comer(")")) throw new Error("función sin cerrar");
        const f = FUNC[tk.v]; if (!f) throw new Error(`función desconocida «${tk.v}»`);
        return f(arg);
      }
      if (tk.v in CONST) return CONST[tk.v];
      throw new Error(`constante desconocida «${tk.v}»`);
    }
    throw new Error(`token inesperado «${(tk as { v: string }).v}»`);
  }
  try {
    const valor = expr();
    if (pos < toks.length) return { error: `sobró «${(toks[pos] as { v: string }).v}»` };
    if (!isFinite(valor)) return { error: "resultado no finito" };
    return { valor };
  } catch (e) { return { error: (e as Error).message }; }
}

function mcd(a: number, b: number): number { a = Math.abs(a); b = Math.abs(b); while (b) { const t = b; b = a % b; a = t; } return a || 1; }
function factorizar(n: number): number[] {
  const f: number[] = []; let x = Math.abs(Math.trunc(n));
  if (x < 2) return f;
  for (let d = 2; d * d <= x; d++) while (x % d === 0) { f.push(d); x = x / d; }
  if (x > 1) f.push(x);
  return f;
}
function esPrimo(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}

// ── Color: HEX ↔ HSL (para armonías) ──
function hexArgb(h: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbAhex(r: number, g: number, b: number): string {
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${q(r)}${q(g)}${q(b)}`;
}
function rgbAhsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s, l };
}
function hslArgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  const m = l - c / 2;
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

// ═══ Los 10 espejos ═══════════════════════════════════════════════════════

type Reg = (id: string, nombre: string, dominio: Entidad["dominio"], activa: boolean, descripcion: string, ejecutar: (d: any) => ResultadoEntidad) => Entidad;
type Env = (entidad: string, t0: number, ok: boolean, extra?: Partial<ResultadoEntidad>) => ResultadoEntidad;

/**
 * Crea las 11 entidades (10 especialistas + el generalista principal, V8).
 * consejo.ts la llama UNA vez junto a sus `reg`/`r`
 * (los reutiliza: una sola fuente de contrato, como exige el proyecto):
 *     T.push(...crearEspejos(reg, r));
 */
import { potenciarEspejos, CATALOGO_TURBO } from "./poderes-espejos"; // PODERES v1

// TURBO v1 — el motor tiene el flag (POST /api/consejo/turbo); el navegador,
// en localStorage. La nota de espejos es el canal: donde va la nota, va el catálogo.
let TURBO_MOTOR = false;
export function fijarTurbo(v: boolean): void { TURBO_MOTOR = !!v; }
export function turboActivo(): boolean { return TURBO_MOTOR; }
function leerTurbo(): boolean {
  if (TURBO_MOTOR) return true;
  try { return typeof localStorage !== "undefined" && localStorage.getItem("codigo0_turbo") === "1"; } catch { return false; }
}

export function crearEspejos(reg: Reg, r: Env): Entidad[] {
  const okJ = (id: string, t0: number, obj: unknown) => r(id, t0, true, { salida: JSON.stringify(obj) });
  const no = (id: string, t0: number, motivo: string) => r(id, t0, false, { motivo });
  const E = "espejo";
  const lista: Entidad[] = [];

  // 1 · CÓDIGOS — inventario estructural (lee, no opina, no toca disco).
  lista.push(reg("espejo.codigos", "Espejo · Códigos", E, true,
    "inventario estructural de un fragmento: símbolos, imports, líneas y ciclomática aprox. (JSON, sin modelo)", (d) => {
      const t0 = Date.now();
      const codigo: string = typeof d?.codigo === "string" ? d.codigo : "";
      if (!codigo.trim()) return no("espejo.codigos", t0, "no llegó «codigo» (texto del fragmento).");
      const cuenta = (re: RegExp) => (codigo.match(re) || []).length;
      const lineas = codigo.split("\n");
      return okJ("espejo.codigos", t0, {
        lenguaje: String(d?.lenguaje || "auto"),
        lineas: lineas.length,
        lineasCodigo: lineas.filter((l) => l.trim() && !/^\s*(\/\/|#|\*|<!--)/.test(l)).length,
        simbolos: {
          funciones: cuenta(/\bfunction\b|\bdef\b|\bfunc\b|=>/g),
          clases: cuenta(/\bclass\b|\bstruct\b|\binterface\b/g),
          imports: cuenta(/^\s*(import|from|require|#include|use)\b/gm),
          exports: cuenta(/\bexport\b|\bpublic\b/g),
        },
        simbolosLista: (codigo.match(/\b(?:function|class|interface|struct|def|func)\s+[A-Za-z_$][\w$]*/g) || []).slice(0, 24),
        condicionales: cuenta(/\bif\b/g) + cuenta(/\belif\b/g) + cuenta(/\belse\b/g) + cuenta(/\bcase\b/g),
        bucles: cuenta(/\bfor\b/g) + cuenta(/\bwhile\b/g),
        operadoresLogicos: cuenta(/&&/g) + cuenta(/\|\|/g) + cuenta(/\?/g),
        ciclomaticaAprox: 1 + cuenta(/\b(if|elif|for|while|case|catch)\b/g) + cuenta(/&&/g) + cuenta(/\|\|/g),
        marcas: cuenta(/\b(TODO|FIXME|HACK)\b/g),
      });
    }));

  // 2 · LENGUAJES — detección de idioma + perfil (no traduce: esa línea no se cruza).
  lista.push(reg("espejo.lenguajes", "Espejo · Lenguajes", E, true,
    "detecta idioma por stopwords y devuelve perfil: palabras, frases, longitud y Flesch (JSON, sin modelo)", (d) => {
      const t0 = Date.now();
      const texto: string = typeof d?.texto === "string" ? d.texto : "";
      if (!texto.trim()) return no("espejo.lenguajes", t0, "no llegó «texto» (cadena).");
      const SW: Record<string, string[]> = {
        es: "de la que el en y a los del se las por un para con no una su lo como más pero sus le ya este esto son está ser tiene hacer cuando entre todo tras bajo sobre".split(" "),
        en: "the of and to in is you that it he was for on are as with his they i at be this have from or one had by not what all were we when your can said each which do their time if will way about many then these so".split(" "),
        fr: "de la le et des en un une que est pour dans vous qui ne pas avec ce on son plus nous sa se sont très entre tout".split(" "),
        pt: "de a que e é o do da em um para com não uma sua ao como mais nos por ser está entre tudo após".split(" "),
        it: "di che e il la un per con non le si da come sono ma anche questo quello tutta".split(" "),
        de: "der die und in den von zu das mit sich des auf für ist im dem nicht ein eine als auch es an werden aus er hat".split(" "),
      };
      const palabras: string[] = texto.toLowerCase().match(/[a-záéíóúüñàâäèéêëìíîïòóôöùúûçß]+/gi) || [];
      if (!palabras.length) return no("espejo.lenguajes", t0, "el texto no contiene ninguna palabra.");
      const total = palabras.length;
      const punt: Record<string, number> = {};
      for (const [idioma, listaSw] of Object.entries(SW)) {
        const set = new Set(listaSw);
        punt[idioma] = palabras.reduce((n, p) => n + (set.has(p) ? 1 : 0), 0) / total;
      }
      const [mejor, score] = Object.entries(punt).sort((a, b) => b[1] - a[1])[0];
      const silabas = palabras.reduce((n, p) => n + Math.max(1, (p.match(/[aeiouáéíóúàâäèéêëìíîïòóôöùúû]+/gi) || []).length), 0);
      const frases = Math.max(1, (texto.match(/[.!?]+/g) || []).length);
      return okJ("espejo.lenguajes", t0, {
        idioma: score === 0 ? "desconocido" : mejor,
        confianza: redondear(Math.min(1, score * 4), 2),
        palabras: total, frases,
        longitudMedia: redondear(texto.length / total, 1),
        silabasPorPalabra: redondear(silabas / total, 2),
        flesch: redondear(Math.max(0, Math.min(100, 206.835 - 1.015 * (total / frases) - 84.6 * (silabas / total))), 1),
      });
    }));

  // 3 · ARTES — armonías cromáticas reales (HSL), no texto de relleno.
  lista.push(reg("espejo.artes", "Espejo · Artes", E, true,
    "desde un HEX: armonías (complementaria/tríada/análoga/partida), tonos y proporción áurea (JSON, sin modelo)", (d) => {
      const t0 = Date.now();
      const base = hexArgb(String(d?.base || ""));
      if (!base) return no("espejo.artes", t0, `«base» debe ser HEX de 6 (llegó «${d?.base ?? ""}», ej. #3a6ea5).`);
      const { h, s, l } = rgbAhsl(base.r, base.g, base.b);
      const girar = (deg: number) => { const c = hslArgb(h + deg, s, l); return rgbAhex(c.r, c.g, c.b); };
      const tono = (dl: number) => { const c = hslArgb(h, s, Math.max(0, Math.min(1, l + dl))); return rgbAhex(c.r, c.g, c.b); };
      const PHI = 1.6180339887;
      return okJ("espejo.artes", t0, {
        base: rgbAhex(base.r, base.g, base.b),
        hsl: { h: redondear(h, 1), s: redondear(s * 100, 1), l: redondear(l * 100, 1) },
        armonias: {
          complementaria: [girar(0), girar(180)],
          triada: [girar(0), girar(120), girar(240)],
          analoga: [girar(-30), girar(0), girar(30)],
          "complementaria-partida": [girar(0), girar(150), girar(210)],
        },
        tonos: { claro: tono(0.12), oscuro: tono(-0.12) },
        aurea: redondear(100 / PHI, 2),
      });
    }));

  // 4 · DISEÑOS — grilla, escala 8pt y breakpoints (diseño = aritmética, no gusto).
  lista.push(reg("espejo.disenios", "Espejo · Diseños", E, true,
    "ancho → grilla determinista: columnas, márgenes áureos, escala 8pt y breakpoints (JSON, sin modelo)", (d) => {
      const t0 = Date.now();
      const ancho = Number(d?.ancho);
      if (!isFinite(ancho) || ancho <= 0) return no("espejo.disenios", t0, `no llegó «ancho» numérico positivo (llegó «${d?.ancho}»).`);
      const paso = Number(d?.paso) > 0 ? Number(d.paso) : 8;
      const PHI = 1.6180339887;
      return okJ("espejo.disenios", t0, {
        grilla: {
          ancho,
          columnas: Math.max(1, Math.floor(ancho / (Number(d?.minCol) > 0 ? Number(d.minCol) : 240))),
          margenLateral: redondear(ancho / (PHI * PHI), 1),
          gutter: paso * 3,
          altoAureo: redondear(ancho / PHI, 1),
        },
        espaciado: [0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32].map((m) => redondear(m * paso, 2)),
        breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 },
      });
    }));

  // 5 · CREADORES — variantes reproducibles: el azar siempre semillado.
  lista.push(reg("espejo.creadores", "Espejo · Creadores", E, true,
    "ejes de opciones + semilla → N variantes deterministas (sistemáticas sin repetir o pseudorrandom) (JSON)", (d) => {
      const t0 = Date.now();
      const ejes = d?.ejes;
      if (!ejes || typeof ejes !== "object" || Array.isArray(ejes))
        return no("espejo.creadores", t0, "no llegó «ejes» (objeto clave → lista de opciones).");
      const claves = Object.keys(ejes);
      if (!claves.length || !claves.every((k) => Array.isArray(ejes[k]) && ejes[k].length > 0 &&
        ejes[k].every((v: unknown) => ["string", "number"].includes(typeof v))))
        return no("espejo.creadores", t0, "cada eje debe ser una lista NO vacía de textos o números.");
      const n = Math.max(1, Math.min(5000, Number(d?.n) > 0 ? Math.floor(Number(d.n)) : 10));
      const semilla = String(d?.semilla ?? "cerebronico");
      const espacio = claves.reduce((p, k) => p * ejes[k].length, 1);
      const sistematico = d?.sistematico !== false;
      const rnd = prng(hashSemilla(semilla));
      const variantes: Record<string, string | number>[] = [];
      for (let v = 0; v < n; v++) {
        const combo: Record<string, string | number> = {};
        if (sistematico) {
          let idx = v % espacio; // recorrido sin repetir hasta agotar el espacio
          for (const k of claves) { combo[k] = ejes[k][idx % ejes[k].length]; idx = Math.floor(idx / ejes[k].length); }
        } else {
          for (const k of claves) combo[k] = ejes[k][Math.floor(rnd() * ejes[k].length)];
        }
        variantes.push(combo);
      }
      return okJ("espejo.creadores", t0, {
        semilla, sistematico, espacioMuestral: espacio,
        avisos: sistematico && n > espacio ? ["n supera al espacio muestral: a partir de él las variantes se cíclican (se repiten)."] : [],
        n: variantes.length, variantes,
      });
    }));

  // 6 · PLANIFICADORES — espejo de taskPlanner: lotes paralelos + presupuesto.
  lista.push(reg("espejo.planificadores", "Espejo · Planificadores", E, true,
    "tareas+dependeDe → lotes paralelos (Kahn), ciclo rechazado con motivo, presupuesto MR nunca 0 (JSON)", (d) => {
      const t0 = Date.now();
      const tareas: any[] | null = Array.isArray(d?.tareas) ? d.tareas : null;
      if (!tareas || !tareas.length) return no("espejo.planificadores", t0, "no llegó «tareas» (lista de {id, dependeDe?}).");
      const ids = tareas.map((t: any) => String(t?.id ?? ""));
      if (ids.some((x) => !x)) return no("espejo.planificadores", t0, "hay una tarea sin «id».");
      if (new Set(ids).size !== ids.length) return no("espejo.planificadores", t0, "hay ids repetidos: el planificador los rechazaría igual.");
      const indeg: Record<string, number> = {}; const ady: Record<string, string[]> = {};
      for (const id of ids) { indeg[id] = 0; ady[id] = []; }
      for (const t of tareas) {
        for (const dep of Array.isArray(t?.dependeDe) ? t.dependeDe : []) {
          const ds = String(dep);
          if (!(ds in indeg)) return no("espejo.planificadores", t0, `la tarea «${t.id}» depende de «${ds}», que no existe en la lista.`);
          ady[ds].push(String(t.id)); indeg[String(t.id)]++;
        }
      }
      const lotes: string[][] = [];
      let frente = ids.filter((id) => indeg[id] === 0);
      const vistos = new Set<string>();
      while (frente.length) {
        lotes.push(frente.slice());
        frente.forEach((id) => vistos.add(id));
        const sig: string[] = [];
        for (const id of frente) for (const v of ady[id]) { if (--indeg[v] === 0 && !vistos.has(v)) sig.push(v); }
        frente = [...new Set(sig)];
      }
      if (vistos.size !== ids.length) return no("espejo.planificadores", t0, "el grafo tiene un CICLO: ningún plan con este orden terminaría nunca.");
      const tramo = String(d?.tramo || "MR2");
      const GB: Record<string, number> = { MR1: 4, MR2: 8, MR3: 16, MR4: 32 };
      if (!(tramo in GB)) return no("espejo.planificadores", t0, `tramo «${tramo}» desconocido (MR1|MR2|MR3|MR4).`);
      const nucleos = Math.max(2, Number(d?.nucleos) > 0 ? Math.floor(Number(d.nucleos)) : 4);
      return okJ("espejo.planificadores", t0, {
        tareas: ids.length, lotes,
        profundidad: lotes.length,
        paralelismoMax: Math.max(...lotes.map((l) => l.length)),
        tramo,
        presupuesto: { io: Math.max(1, Math.min(16, Math.floor(GB[tramo] / 4))), cpu: Math.max(1, nucleos - 1) },
        nota: "estimación estática por tramo; la autoridad en vivo sigue siendo hardwareGovernor.",
      });
    }));

  // 7 · CIENTÍFICOS — el método como tabla determinista, no como opinión.
  lista.push(reg("espejo.cientificos", "Espejo · Científicos", E, true,
    "objetivo + variables → diseño experimental: condiciones, controles, replicados y prueba estadística (JSON)", (d) => {
      const t0 = Date.now();
      const objetivo = typeof d?.objetivo === "string" ? d.objetivo.trim() : "";
      const vd = d?.dependiente;
      if (!objetivo) return no("espejo.cientificos", t0, "no llegó «objetivo» (qué se quiere probar).");
      if (!vd || typeof vd !== "object" || !vd.nombre) return no("espejo.cientificos", t0, "no llegó «dependiente» ({nombre, tipo?, metrica?}): qué se mide.");
      const vi = Array.isArray(d?.independiente) ? d.independiente.map(String) : [];
      const nGrupos = Math.max(1, vi.length);
      const tipo = String(vd.tipo || "continua").toLowerCase();
      let prueba: string;
      if (tipo.startsWith("contin")) prueba = nGrupos === 1 ? "t de una muestra" : nGrupos === 2 ? "t de Student para 2 grupos (o Mann-Whitney si no es normal)" : "ANOVA de una vía (Kruskal-Wallis si no es normal)";
      else if (tipo.startsWith("categ")) prueba = nGrupos <= 2 ? "chi-cuadrado de independencia" : "regresión logística multinomial";
      else return no("espejo.cientificos", t0, `tipo de dependiente «${vd.tipo}» no reconocido (continua|categorica).`);
      return okJ("espejo.cientificos", t0, {
        objetivo,
        hipotesis: { H0: `no hay efecto de ${vi.join("/") || "la intervención"} sobre ${vd.nombre}`, H1: "hay efecto" },
        variables: { independiente: vi, dependiente: vd.nombre, control: Array.isArray(d?.control) ? d.control.map(String) : ["temperatura", "tiempo", "operador"] },
        condiciones: nGrupos,
        replicadosMinimos: Math.max(3, Number(vd.replicados) > 0 ? Math.floor(Number(vd.replicados)) : 5),
        ciego: d?.dobleCiego ? "doble ciego recomendado" : "simple ciego posible",
        pruebaSugerida: prueba,
        metrica: String(vd.metrica || "media ± desviación típica"),
      });
    }));

  // 8 · FÍSICOS — constantes canónicas del SI + conversión declarada.
  lista.push(reg("espejo.fisicos", "Espejo · Físicos", E, true,
    "expresión con constantes (c,g,h,k,na,r,pi) + conversión SI opcional {de,a,cantidad} (JSON, sin modelo)", (d) => {
      const t0 = Date.now();
      const expr = typeof d?.expresion === "string" ? d.expresion : "";
      if (!expr.trim()) return no("espejo.fisicos", t0, "no llegó «expresion» (ej. \"2*c\" o \"m*g*h\").");
      const { valor, error } = evaluar(expr);
      if (error) return no("espejo.fisicos", t0, `expresión inválida: ${error}`);
      const CONV: Record<string, number> = { m: 1, km: 1000, cm: 0.01, mm: 0.001, mg: 1e-6, g: 1e-3, kg: 1, t: 1000, s: 1, min: 60, h: 3600, dias: 86400 };
      let conversion: unknown = null;
      if (d?.de !== undefined || d?.a !== undefined) {
        const f = CONV[String(d?.de)], tt = CONV[String(d?.a)];
        const cant = Number(d?.cantidad);
        if (f === undefined || tt === undefined) conversion = { error: `unidad «${f === undefined ? d?.de : d?.a}» no está en la tabla SI compacta (${Object.keys(CONV).join(" ")})` };
        else if (!isFinite(cant)) conversion = { error: "falta «cantidad» numérica para convertir" };
        else conversion = { de: d.de, a: d.a, cantidad: cant, resultado: redondear((cant * f) / tt, 8) };
      }
      return okJ("espejo.fisicos", t0, { expresion: expr, valor: redondear(valor as number, 8), notacionCientifica: (valor as number).toExponential(4), conversion });
    }));

  // 9 · MATEMÁTICOS — el resultado ESTRUCTURADO de la calculadora del motor.
  lista.push(reg("espejo.matematicos", "Espejo · Matemáticos", E, true,
    "expresión exacta (parser propio, sin eval) + factorización/primalidad si es entero + mcd/mcm de «enteros» (JSON)", (d) => {
      const t0 = Date.now();
      const expr = typeof d?.expresion === "string" ? d.expresion : "";
      const enteros = Array.isArray(d?.enteros) ? d.enteros.map(Number).filter((x: number) => Number.isInteger(x)) : [];
      if (!expr.trim() && !enteros.length) return no("espejo.matematicos", t0, "no llegó «expresion» ni «enteros».");
      const salida: Record<string, unknown> = {};
      if (expr.trim()) {
        const { valor, error } = evaluar(expr);
        if (error) return no("espejo.matematicos", t0, `no evaluable: ${error}`);
        const v = valor as number;
        salida.expresion = expr; salida.valor = redondear(v, 10);
        if (Number.isInteger(v)) {
          salida.factorizacion = factorizar(v);
          salida.esPrimo = esPrimo(v);
        }
      }
      if (enteros.length >= 2) {
        salida.enteros = enteros;
        salida.mcd = enteros.reduce((a: number, b: number) => mcd(a, b));
        salida.mcm = enteros.reduce((a: number, b: number) => Math.abs(a * b) / mcd(a, b));
      } else if (enteros.length === 1) salida.aviso = "«enteros» trae 1 valor; mcd/mcm piden al menos 2.";
      return okJ("espejo.matematicos", t0, salida);
    }));

  // 10 · CUÁNTICO — amplitudes complejas reales, no glosario de cuántica.
  lista.push(reg("espejo.cuantico", "Espejo · Cuántico", E, true,
    "registro de 1–8 qubits: puertas x,y,z,h,s,t + cnot{q,t} → amplitudes, probabilidades y norma (JSON)", (d) => {
      const t0 = Date.now();
      const n = Number(d?.qubits);
      if (!Number.isInteger(n) || n < 1 || n > 8) return no("espejo.cuantico", t0, `«qubits» debe ser entero 1–8 (llegó «${d?.qubits}»); 2^9 estados ya no es un espejo barato.`);
      const ops = Array.isArray(d?.puertas) ? d.puertas : [];
      const dim = 1 << n;
      const re = new Float64Array(dim); const im = new Float64Array(dim);
      re[0] = 1;
      type C = [number, number]; type M2 = [C, C, C, C];
      const S2 = Math.SQRT1_2;
      const PUERTAS: Record<string, M2> = {
        x: [[0, 0], [1, 0], [1, 0], [0, 0]],
        y: [[0, 0], [0, -1], [0, 1], [0, 0]],
        z: [[1, 0], [0, 0], [0, 0], [-1, 0]],
        h: [[S2, 0], [S2, 0], [S2, 0], [-S2, 0]],
        s: [[1, 0], [0, 0], [0, 0], [0, 1]],
        t: [[1, 0], [0, 0], [0, 0], [S2, S2]],
      };
      const aplicar1 = (q: number, m: M2) => {
        const [m00, m01, m10, m11] = m;
        for (let base = 0; base < dim; base++) {
          if ((base >> q) & 1) continue;
          const a = base, b = base | (1 << q);
          const ar = re[a], ai = im[a], br = re[b], bi = im[b];
          re[a] = m00[0] * ar - m00[1] * ai + m01[0] * br - m01[1] * bi;
          im[a] = m00[0] * ai + m00[1] * ar + m01[0] * bi + m01[1] * br;
          re[b] = m10[0] * ar - m10[1] * ai + m11[0] * br - m11[1] * bi;
          im[b] = m10[0] * ai + m10[1] * ar + m11[0] * bi + m11[1] * br;
        }
      };
      for (const op of ops) {
        const tipo = String(op?.p || "").toLowerCase();
        const q = Number(op?.q);
        if (tipo === "cnot") {
          const tq = Number(op?.t);
          if (!Number.isInteger(q) || !Number.isInteger(tq) || q < 0 || q >= n || tq < 0 || tq >= n || q === tq)
            return no("espejo.cuantico", t0, `cnot necesita q (control) y t (target) distintos en 0..${n - 1} (llegó q=${op?.q}, t=${op?.t}).`);
          for (let base = 0; base < dim; base++) {
            if ((base >> q) & 1 && !((base >> tq) & 1)) {
              const b = base ^ (1 << tq);
              const tr = re[base], ti = im[base]; re[base] = re[b]; im[base] = im[b]; re[b] = tr; im[b] = ti;
            }
          }
          continue;
        }
        const m = PUERTAS[tipo];
        if (!m || !Number.isInteger(q) || q < 0 || q >= n)
          return no("espejo.cuantico", t0, `puerta «${op?.p}»@${op?.q} inválida (puertas: ${Object.keys(PUERTAS).join(" ")} | cnot; qubit en 0..${n - 1}).`);
        aplicar1(q, m);
      }
      const probabilidades: Record<string, number> = {};
      let norma = 0;
      for (let k = 0; k < dim; k++) { const p = re[k] * re[k] + im[k] * im[k]; norma += p; probabilidades[k.toString(2).padStart(n, "0")] = redondear(p, 6); }
      return okJ("espejo.cuantico", t0, {
        qubits: n, dim, puerta: ops.map((o: any) => o?.p).join(",") || "|0…0>",
        norma: redondear(norma, 6),
        probabilidades,
        amplitudes: Array.from({ length: dim }, (_, k) => `${redondear(re[k], 4)}${im[k] < 0 ? "−" : "+"}${redondear(Math.abs(im[k]), 4)}i`),
      });
    }));

  // 11 · GENERALISTA — el espejo principal integrador (V8).
  // Regla de admisión cumplida: devuelve lo que NINGÚN otro devuelve — la
  // síntesis MULTI-fuente con procedencia y la decisión de ruta (reflejo vs
  // conductor). No juzga ni inventa: si no detecta señales lo declara y
  // deriva; si detecta dominio pero no fragmento ejecutable, dice qué equipo
  // queda listo y por qué no sinteticó.
  lista.push(reg("espejo.generalista", "Espejo · Generalista (principal)", E, true,
    "el espejo generalista principal: lee el pedido en lenguaje natural, detecta el dominio por señales (sin adivinar), extrae fragmentos ejecutables (código, color HEX, ancho, expresión, texto), llama a los espejos especialistas que esos fragmentos alimentan y devuelve la síntesis con procedencia (JSON, ~1 ms, sin modelo)", (d) => {
      const t0 = Date.now();
      const pedido: string = typeof d?.pedido === "string" ? d.pedido : "";
      if (!pedido.trim()) return no("espejo.generalista", t0, "no llegó «pedido» (texto del pedido).");
      const t = tokeniza(pedido);
      // 1 · Señales por grupo — mismo vocabulario que grupoPorTarea (fuente única).
      const senales: Record<string, { puntos: number; palabras: string[] }> = {};
      for (const [id, palabras] of Object.entries(PALABRAS_GRUPO)) {
        let puntos = 0;
        const encontradas: string[] = [];
        for (const p of palabras) {
          const clave = tokeniza(p);
          if (clave && t.includes(clave)) { puntos += clave.includes(" ") ? 2 : 1; encontradas.push(p); }
        }
        senales[id] = { puntos, palabras: encontradas.slice(0, 6) };
      }
      const ranking = Object.entries(senales).filter(([, v]) => v.puntos > 0).sort((a, b) => b[1].puntos - a[1].puntos);
      const totalPuntos = ranking.reduce((n, [, v]) => n + v.puntos, 0);
      if (!ranking.length) {
        return okJ("espejo.generalista", t0, {
          ruta: "conductor",
          dominios: [],
          equipo: [],
          fuentes: [],
          sintesis: "Sin señales de especialidad detectables en el pedido: el generalista no adivina. El conductor (neural) responde con el contexto del equipo activo; este resultado es la declaración honesta de esa deriva.",
          motivo: "cero señales: ninguna palabra de dominio (codigo/arte/ciencia/cuantica) aparece en el pedido.",
        });
      }
      const dominios = ranking.slice(0, 2).map(([id, v]) => ({ grupo: id, puntos: v.puntos, senales: v.palabras }));
      const cruzado = ranking.length >= 2 && ranking[1][1].puntos >= Math.max(1, Math.floor(ranking[0][1].puntos / 2));
      const g = GRUPOS_ESPEJOS.find((x) => x.id === dominios[0].grupo);
      let equipo: string[] = g ? [...g.espejos] : [];
      if (cruzado) {
        const g2 = GRUPOS_ESPEJOS.find((x) => x.id === dominios[1].grupo);
        if (g2) equipo = [...new Set([...equipo, ...g2.espejos])].slice(0, 6);
      }
      // 2 · Extracción de fragmentos → llamar SOLO a los espejos cuyo contrato el texto alimenta.
      const porId = new Map(lista.filter((e) => e.id !== "espejo.generalista").map((e) => [e.id, e]));
      const fuentes: { espejo: string; res: string }[] = [];
      const llamar = (id: string, dato: unknown, etiqueta: string) => {
        const e = porId.get(id);
        if (!e?.ejecutar) return;
        const res = e.ejecutar(dato);
        const resumo = res.ok
          ? String(res.salida || "").slice(0, 160)
          : `no ejecutable — ${res.motivo || "motivo sin declarar"}`;
        fuentes.push({ espejo: etiqueta, res: resumo });
      };
      const codigoF = pedido.match(/```[\s\S]*?```/) || pedido.match(/\b(?:function|const|class|def |import)\b[\s\S]{20,}/);
      if (codigoF) llamar("espejo.codigos", { codigo: codigoF[0].slice(0, 4000) }, "inventario del código");
      const hexF = pedido.match(/#[0-9a-fA-F]{6}\b/);
      if (hexF) llamar("espejo.artes", { base: hexF[0] }, `armonía de ${hexF[0]}`);
      const anchoF = pedido.match(/\b(\d{2,4})\s*(?:px|pixels|p\xedxeles|ancho|width)\b/i) || pedido.match(/\b(?:ancho|width|viewport)\s*(?:de|:)?\s*(\d{2,4})\b/i);
      if (anchoF) llamar("espejo.disenios", { ancho: Number(anchoF[1]) }, `grilla de ancho ${anchoF[1]}px`);
      const numsF = pedido.match(/-?\d+(?:[.,]\d+)?\s*(?:\+|-|\*|\/|\u00d7|\u00f7)\s*-?\d+(?:[.,]\d+)?/);
      if (numsF) llamar("espejo.matematicos", { expresion: numsF[0].replace(/\u00d7/g, "*").replace(/\u00f7/g, "/").replace(/,/g, ".") }, `cálculo de «${numsF[0]}»`);
      const textoPuro = pedido.replace(/```[\s\S]*?```/g, " ").replace(/#[0-9a-fA-F]{6}\b/g, " ").replace(/[^a-záéíóúüñ\s]/gi, " ").replace(/\s+/g, " ").trim();
      if (textoPuro.split(" ").length >= 12) llamar("espejo.lenguajes", { texto: textoPuro.slice(0, 1200) }, "perfil del texto");
      // 3 · Síntesis — plantilla determinista, ninguna prosa de modelo.
      const nombres = equipo.map((id) => id.replace("espejo.", "")).join(", ");
      const sintesis = fuentes.length
        ? `Pedido con señal de ${dominios.map((x) => x.grupo).join(" + ")} (${dominios[0].puntos}/${totalPuntos} puntos; cruzado: ${cruzado ? "sí" : "no"}). Equipo: ${nombres}. ${fuentes.length} fuente(s) verificada(s): ${fuentes.map((f) => f.espejo).join("; ")}.`
        : `Señal de ${dominios.map((x) => x.grupo).join(" + ")} detectada, pero sin fragmento ejecutable que extraer (código, color HEX, ancho, expresión o texto denso). Equipo listo: ${nombres}.`;
      return okJ("espejo.generalista", t0, {
        ruta: fuentes.length ? "reflejo" : "conductor",
        dominios,
        equipo,
        fuentes,
        sintesis,
        motivo: fuentes.length
          ? undefined
          : "sin fragmento extraíble, sintetizar sería adivinar: el conductor habla y estos datos le sirven de contexto.",
      });
    }));

  potenciarEspejos(lista, r); // PODERES v1 — 22 acciones deterministas nuevas, sin tocar los handlers clásicos
  return lista;
}
