/**
 * cerebroReflejo.ts — EL REFLEJO (v2.4)
 * ======================================
 * Frase en español (con typos o sin ellos) → orden de CerebroNico, cálculo o
 * plantilla. Determinista: sin red, sin RAM de modelo, sin sorpresas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LAS TRES REGLAS DEL MÓDULO
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. CERO FILTRO DE CONTENIDO. El reflejo ENRUTA, no juzga: el `prompt` de una
 *    imagen o de un plan viaja tal cual. Su único «no» es ESTRUCTURAL — si no
 *    entiende, lo dice con el motivo en vez de adivinar. Eso no es censura, es
 *    negarse a mentir.
 * 2. NUNCA EMITE JSON INVÁLIDO. Toda orden producida se re-valida aquí mismo
 *    con `extraerOrdenes` (la MISMA función que usa el chat). Si algo no
 *    sobrevive al viaje, el resultado sale ok:false con motivo — jamás una
 *    orden rota hacia el motor.
 * 3. NADA DE SILENCIOS. Cada descarte, cada ambigüedad y cada error de cálculo
 *    llevan `motivo`. (La preferencia permanente del proyecto.)
 *
 * Dos tamaños, mismo motor — la diferencia son las TABLAS:
 *   · lite (~450 KB): diccionario curado + variantes de distancia 1.
 *   · max  (~2.2 MB): distancia 1 y 2 precalculadas + sinónimos es/en/pt +
 *     conjugaciones + números en letras.
 * El RUNTIME solo corrige a distancia 1 (longitud ≥5): la 2 es terreno de la
 * tabla, porque a 2 edits las palabras reales colisionan entre sí («ardiendo»
 * suena a «abriendo») y un reflejo que inventa intenciones es peor que uno
 * que pregunta.
 */

import { extraerOrdenes, type Orden } from "./chatOrders";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type AccionReflejo = "orden" | "calculo" | "creacion" | "nada";

export interface ResultadoReflejo {
  ok: boolean;
  accion: AccionReflejo;
  /** 0..1 — < UMBRAL ⇒ accion "nada" con motivo. */
  confianza: number;
  /** El bloque listo para pegar/ejecutar (orden) o el texto (cálculo/creación). */
  salida?: string;
  /** La orden ya re-validada por extraerOrdenes (si accion === "orden"). */
  orden?: Orden;
  /** SIEMPRE presente cuando ok === false. Nada se descarta en silencio. */
  motivo?: string;
  /** Qué tablas contestaron ("lite" | "max") — para no confundir versiones. */
  modo: string;
  ms: number;
}

export interface Tablas {
  version: string;
  modo: "lite" | "max";
  /** typo → palabra canónica (la tabla ES el tamaño: aquí vive el KB). */
  lexicon: Record<string, string>;
  /** palabra canónica → intentos que vota. */
  verbos: Record<string, string[]>;
  /** sinónimos de formatos: yaml|yml|JSON… → "yaml". */
  formatos: Record<string, string>;
  // ─── Reflejo v3.0 — metadatos opcionales para exponer al chat/UI ──────────
  /** Lista de acciones que el reflejo sabe emitir (opcional para v2.x). */
  acciones?: string[];
  /** Lista de tipos de plantilla soportados (opcional para v2.x). */
  tiposPlantilla?: string[];
  /** Lista de unidades reconocidas por la calculadora (opcional). */
  unidades?: string[];
}

const UMBRAL_CONFIANZA = 0.34;

// ─── Normalización ───────────────────────────────────────────────────────────

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // acentos: «conviértelo» → «conviertelo»
    .replace(/[¿?¡!;:,"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein con corte temprano — para tablas lite, sin coste de memoria. */
export function distancia(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length, n = b.length;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let filaMin = cur[0];
    for (let j = 1; j <= n; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + coste);
      if (cur[j] < filaMin) filaMin = cur[j];
    }
    if (filaMin > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/**
 * palabra → canónica: tabla primero, Levenshtein después (solo lo que la tabla
 * lite no trae). El umbral por longitud NO es adorno: con ≤2 ciego, «qwer» y
 * «asdf» encontraban vecino y el reflejo inventaba intenciones ante un teclado
 * golpeado. Regla: palabras cortas o se escriben exactas o no se corrigen.
 */
export function corregir(palabra: string, tablas: Tablas): { canonica: string; exacta: boolean } {
  const p = normalizar(palabra);
  const directo = tablas.lexicon[p];
  if (directo) return { canonica: directo, exacta: true };
  // Runtime SIEMPRE a distancia 1. La distancia 2 vive en la tabla max
  // (precalculada) — dejarla también en runtime hacía que «ardiendo» votara
  // por «abriendo» y una orden de imagen se convirtiera en «abrir». Las
  // colisiones entre palabras reales crecen con la distancia; el runtime es
  // el último filtro y ahí manda la seguridad, no la cobertura.
  const tope = p.length >= 5 ? 1 : 0;
  if (tope === 0) return { canonica: p, exacta: false };
  let mejor = "";
  let dMejor = tope + 1;
  for (const k in tablas.lexicon) {
    if (Math.abs(k.length - p.length) > tope) continue;
    const d = distancia(p, k, tope);
    if (d < dMejor) { dMejor = d; mejor = k; if (d === 1) break; }
  }
  return mejor ? { canonica: tablas.lexicon[mejor], exacta: false } : { canonica: p, exacta: false };
}

// ─── Extracción de huecos (slots) ───────────────────────────────────────────

const RX_ARCHIVO = /(?:[a-z0-9_.\-\/\\]+\.[a-z0-9]{1,6})/i;
const RX_RUTA = /([a-z0-9][a-z0-9_.\-\/]*(?:\.[a-z0-9]{1,6})?)/i;

function archivoEn(tokens: string[]): string | undefined {
  for (const t of tokens) {
    const m = t.match(RX_ARCHIVO);
    if (m && !/^\d/.test(m[0])) return m[0].replace(/[.,]$/, "");
  }
  return undefined;
}

function formatoEn(tokens: string[], tablas: Tablas): string | undefined {
  for (const t of tokens) {
    const f = tablas.formatos[t] ?? tablas.formatos[normalizar(t)];
    if (f) return f;
  }
  return undefined;
}

// ─── La calculadora: tokenizer + parser propio. NUNCA `eval`. ────────────────

const FUNCIONES: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, log: Math.log10, ln: Math.log,
  exp: Math.exp, round: Math.round, floor: Math.floor, ceil: Math.ceil,
};
const CONSTANTES: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

// ─── Reflejo v3.0 — Porcentajes y unidades (pre-procesador de la calculadora) ──
//
// Convierte expresiones habladas a aritmética pura que `calcular()` ya entiende:
//   · «15% de 200»  → «15 * 200 / 100»
//   · «el 30 por ciento de 80»  → «30 * 80 / 100»
//   · «5 KB a MB»  → «5 / 1024»
//   · «2 horas en segundos»  → «2 * 3600»
//   · «hoy + 3 días»  → fecha ISO (manejado aparte, no entra a `calcular`)
//
// Si la frase trae unidades que no sabemos convertir, se devuelve tal cual y
// `calcular` dará un motivo claro: no se inventa nada.

/** Factores de conversión a una unidad base. */
const FACTORES: Record<string, Record<string, number>> = {
  // Tiempo → segundos
  s: { s: 1, min: 60, h: 3600, d: 86400, w: 604800, mo: 2629800, y: 31557600 },
  // Bytes → bytes
  B: { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 },
  // Distancia → metros
  m: { mm: 0.001, cm: 0.01, m: 1, km: 1000 },
  // Píxeles → px (no hay conversiones, son absolutas)
  px: { px: 1, rem: 16, em: 16 },
};

/** Unidades equivalentes para «en X» o «a X». Case-insensitive (KB == kb == Kb). */
function factorConversion(desde: string, hacia: string): number | undefined {
  const d = desde.toLowerCase();
  const h = hacia.toLowerCase();
  for (const familia of Object.values(FACTORES)) {
    // Construye un mapa en minúsculas para comparar sin distinguir mayúsculas.
    const lower: Record<string, number> = {};
    for (const [k, v] of Object.entries(familia)) lower[k.toLowerCase()] = v;
    if (d in lower && h in lower) {
      return lower[d] / lower[h];
    }
  }
  return undefined;
}

/** Resuelve «X% de Y» y «el X por ciento de Y». Requiere la palabra «de» o «por
 *  ciento» explícitamente: «10%3» NO se interpreta como porcentaje, sino como
 *  módulo 10 % 3 (lo que ya entiende la calculadora). */
function expandirPorcentajes(expr: string): string {
  return expr
    // «15 por ciento de 200» / «15 porciento de 200» → explícito, siempre %
    .replace(/(\d+(?:\.\d+)?)\s*por\s*ciento\s+de\s*(\d+(?:\.\d+)?)/gi, "($1 * $2 / 100)")
    .replace(/(\d+(?:\.\d+)?)\s+porciento\s+de\s*(\d+(?:\.\d+)?)/gi, "($1 * $2 / 100)")
    // «15% de 200» → el % seguido de "de" es inequívoco
    .replace(/(\d+(?:\.\d+)?)\s*%\s+de\s+(\d+(?:\.\d+)?)/gi, "($1 * $2 / 100)")
    // «15% 200» sin la palabra «de» se queda igual: módulo % en la calculadora
    ;
}

/** Resuelve «5 KB a MB» / «2 horas en segundos». Devuelve la expresión convertida o undefined. */
function expandirUnidades(expr: string): string | undefined {
  // Caso A: «N <unit> a <unit>» o «N <unit> en <unit>»
  // OJO: el normalizador a minúsculas rompe KB/MB/GB (B ≠ b). Por eso este
  // detector opera sobre el texto ORIGINAL (sin normalizar) y luego hace
  // match case-insensitive solo sobre la unidad.
  const m = expr.match(/(\d+(?:\.\d+)?)\s+([a-zA-Z]+)\s+(?:a|en|to)\s+([a-zA-Z]+)/i);
  if (m) {
    const [, num, uDesde, uHacia] = m;
    // Mapa case-insensitive pero con unidades SI conocidas
    const f = factorConversion(uDesde.toLowerCase(), uHacia.toLowerCase());
    if (f !== undefined) return `(${num} * ${f})`;
  }
  return expr; // no se pudo convertir: lo dejamos igual para que `calcular` opine
}

/** Resuelve «hoy + 3 días» / «mañana - 1 semana» → fecha ISO. */
function expandirFechas(frase: string): { esFecha: boolean; iso?: string; valor?: number; motivo?: string } {
  const f = frase.toLowerCase().trim();
  const ahora = new Date();
  let base: Date | null = null;
  let offsetMs = 0;
  let resto = f;

  // Detecta base de fecha
  if (/^hoy/.test(f)) { base = new Date(ahora); resto = f.replace(/^hoy\s*/, ""); }
  else if (/^ahora/.test(f)) { base = new Date(ahora); resto = f.replace(/^ahora\s*/, ""); }
  else if (/^manana\b/.test(f) || /^mañana\b/.test(f)) {
    base = new Date(ahora.getTime() + 86400000); resto = f.replace(/^ma[ñn]ana\s*/, "");
  } else if (/^ayer\b/.test(f)) {
    base = new Date(ahora.getTime() - 86400000); resto = f.replace(/^ayer\s*/, "");
  }

  if (!base) return { esFecha: false };

  // Si no hay nada más, devuelve solo el «hoy»/«mañana»/«ayer»
  if (!resto) {
    return { esFecha: true, iso: base.toISOString().slice(0, 10) };
  }

  // Tiene que haber +/- algo + unidad de tiempo
  const um = resto.match(/^([+\-])\s*(\d+(?:\.\d+)?)\s*(segundos?|mins?|minutos?|horas?|horas?|d[ií]as?|semanas?|meses?|a[ñn]os?|s|h|min|d|w|mo|y)\b/i);
  if (!um) return { esFecha: false };
  const [, signo, numStr, unidadRaw] = um;
  const num = parseFloat(numStr);
  const unidad = unidadRaw.toLowerCase();
  // Mapa de unidad → milisegundos
  const msPorUnidad: Record<string, number> = {
    s: 1000, segundo: 1000, segundos: 1000, seg: 1000, segs: 1000,
    min: 60000, minuto: 60000, minutos: 60000, mins: 60000,
    h: 3600000, hora: 3600000, horas: 3600000, hr: 3600000, hrs: 3600000,
    d: 86400000, dia: 86400000, dias: 86400000, day: 86400000, days: 86400000,
    w: 604800000, semana: 604800000, semanas: 604800000, week: 604800000, weeks: 604800000,
    mo: 2629800000, mes: 2629800000, meses: 2629800000, month: 2629800000, months: 2629800000,
    y: 31557600000, anio: 31557600000, anios: 31557600000, año: 31557600000, años: 31557600000, year: 31557600000, years: 31557600000,
  };
  const ms = msPorUnidad[unidad];
  if (!ms) return { esFecha: false, motivo: `no reconozco la unidad de tiempo «${unidadRaw}»` };
  const delta = signo === "-" ? -num * ms : num * ms;
  const resultado = new Date(base.getTime() + delta);
  return { esFecha: true, iso: resultado.toISOString().slice(0, 10) };
}

/** Pre-procesador v3.0: porcentajes → aritmética; unidades → factor; fechas → ISO. */
function preProcesar(expresion: string): { esFecha: boolean; iso?: string; expr: string; motivo?: string } {
  // ¿Fecha?
  const f = expandirFechas(expresion);
  if (f.esFecha) return { esFecha: true, iso: f.iso, expr: "", motivo: f.motivo };

  let e = expresion;
  e = expandirPorcentajes(e);
  // Si todavía hay una unidad, intentamos resolverla
  if (/\d+\s*[a-zA-Z]+\s+(?:a|en|to)\s+[a-zA-Z]+/i.test(e)) {
    const convertido = expandirUnidades(e);
    if (convertido && convertido !== e) e = convertido;
  }
  return { esFecha: false, expr: e };
}

export function calcular(expresion: string): { ok: boolean; valor?: number; motivo?: string } {
  const pre = preProcesar((expresion || "").trim());
  if (pre.esFecha) {
    if (!pre.iso) return { ok: false, motivo: pre.motivo || "no puedo calcular esa fecha" };
    return { ok: true, valor: undefined as unknown as number, motivo: pre.iso };
  }
  const src = normalizar(pre.expr)
    .replace(/[×x](?=\s*[\d(])|\*/g, "*")
    .replace(/÷/g, "/")
    .replace(/,/g, "."); // «3,5» → 3.5 (coma decimal hispana)
  let i = 0;
  const tokens = (): string | null => {
    while (i < src.length && src[i] === " ") i++;
    if (i >= src.length) return null;
    const c = src[i];
    if (/[0-9.]/.test(c)) { let n = ""; while (i < src.length && /[0-9.]/.test(src[i])) n += src[i++]; return n; }
    if (/[a-z]/.test(c)) { let w = ""; while (i < src.length && /[a-z]/.test(src[i])) w += src[i++]; return w; }
    if ("+-*/%^(),".includes(c)) return src[i++];
    throw new Error(`carácter no válido «${c}»`);
  };
  // Regla del parser: TODO token que un nivel no consume se DEVUELVE con
  // i-- (incluido «)» — si no, la expresión interior se comía el cierre de
  // paréntesis y «(5+3)*2» daba desbalanceado. Probado en tests/reflejo.
  const expr = (): number => {
    let v = termino();
    for (;;) { const t = tokens(); if (t === "+") v += termino(); else if (t === "-") v -= termino(); else { if (t) i--; return v; } }
  };
  const termino = (): number => {
    let v = potencia();
    for (;;) {
      const t = tokens();
      if (t === "*") v *= potencia();
      else if (t === "/") { const d = potencia(); if (d === 0) throw new Error("división por cero: no existe"); v /= d; }
      else if (t === "%") { const d = potencia(); if (d === 0) throw new Error("módulo por cero: no existe"); v %= d; }
      else { if (t) i--; return v; }
    }
  };
  const potencia = (): number => {
    const base = factor();
    const t = tokens();
    if (t === "^") { const ex = potencia(); return Math.pow(base, ex); }
    if (t) i--;
    return base;
  };
  /** Valor atómico a partir de un token ya leído (para funciones sin paréntesis). */
  const primaria = (t: string): number => {
    if (t === "(") { const v = expr(); const ci = tokens(); if (ci !== ")") throw new Error("paréntesis desbalanceado"); return v; }
    if (/^[0-9.]/.test(t)) { const n = Number(t); if (!Number.isFinite(n)) throw new Error(`número inválido «${t}»`); return n; }
    if (t in CONSTANTES) return CONSTANTES[t];
    if (t in FUNCIONES) { const ab = tokens(); if (ab === null) throw new Error(`falta argumento de ${t}`); return FUNCIONES[t](primaria(ab)); }
    throw new Error(`el argumento de la función no es un número: «${t}»`);
  };
  const factor = (): number => {
    const t = tokens();
    if (t === null) throw new Error("expresión incompleta");
    if (t === "(") { const v = expr(); const c = tokens(); if (c !== ")") throw new Error("paréntesis desbalanceado"); return v; }
    if (t === "-") return -factor();
    if (t === "+") return factor();
    if (/^[0-9.]/.test(t)) { const n = Number(t); if (!Number.isFinite(n)) throw new Error(`número inválido «${t}»`); return n; }
    if (t in CONSTANTES) return CONSTANTES[t];
    if (t in FUNCIONES) {
      const ab = tokens();
      if (ab === "(") { const v = expr(); const ci = tokens(); if (ci !== ")") throw new Error(`falta «)» en ${t}(...)`); return FUNCIONES[t](v); }
      // Forma hablada «sqrt 144» / «raiz de 144» sin paréntesis: la función se
      // aplica a la PRIMARIA siguiente (número, constante, otra función,
      // paréntesis). NO a `factor()`: eso se comía el signo y «sqrt 144 + 1»
      // salía sqrt(+1) = 1 en vez de 13. (Lo encontró la propia prueba.)
      if (ab === null) throw new Error(`falta argumento de ${t}`);
      return FUNCIONES[t](primaria(ab));
    }
    const cerca = Object.keys(FUNCIONES).concat(Object.keys(CONSTANTES)).find((f) => distancia(t, f, 2) <= 1);
    throw new Error(`función desconocida «${t}»${cerca ? ` — ¿querías decir «${cerca}»?` : ""}`);
  };
  try {
    const v = expr();
    const resto = tokens();
    if (resto !== null) return { ok: false, motivo: `no entiendo qué hacer con «${resto}» tras la expresión` };
    if (!Number.isFinite(v)) return { ok: false, motivo: "el resultado no es un número finito" };
    return { ok: true, valor: v };
  } catch (e: any) {
    return { ok: false, motivo: e?.message || String(e) };
  }
}

/** «dos más dos por tres» → «2 + 2 * 3»; «raiz de 144» → «sqrt 144». */
export function letrasALaTabla(frase: string, tablas: Tablas): string {
  return frase
    .split(" ")
    .map((w) => tablas.lexicon[normalizar(w)] ?? w)
    .join(" ")
    .replace(/\bde\b/g, " "); // conector hablado: «sqrt de 144»
}

// ─── El creador: plantillas deterministas (Reflejo v3.0 — de 5 a 16 tipos) ───

const PALABRAS_TIPO = new Set([
  // Originales v2.4
  "react", "componente", "express", "ruta", "router", "python", "py", "html", "pagina", "ts", "modulo", "interface",
  // Nuevos v3.0
  "next", "nextjs", "tailwind", "tailwindcss", "prisma", "svelte", "vue", "astro",
  "docker", "dockerfile", "github_action", "ghaction", "vite_config", "viteconfig",
  "express_middleware", "middleware", "react_hook", "hook", "api_route", "apiroute",
  "test", "testing", "readme", "env_local", "env",
]);

function nombreEn(tokens: string[]): string {
  const STOP = new Set(["un", "una", "el", "la", "de", "que", "llamado", "llamada", "se", "para", "con", "por", "nuevo", "nueva", "hacer", "hecho"]);
  for (const t of tokens) {
    const limpio = t.replace(/[^a-zA-Z0-9_]/g, "");
    if (!limpio || !/^[a-z]/i.test(limpio)) continue;
    const bajo = limpio.toLowerCase();
    if (STOP.has(bajo) || PALABRAS_TIPO.has(bajo)) continue;
    // El nombre NUNCA se corrige con fuzzy. La tabla max tiene variantes de
    // distancia 2 que colisionan con sustantivos reales («panel»→plan_en,
    // «react»→read): un nombre que no esté EXACTO como verbo canónico es un
    // nombre. Corregir nombres es cómo nacen los componentes «Nuevo».
    if (/^(conviert|cambi|pasa|traduc|export|import|abr|muestr|ense|le|dibuj|pint|ilustr|logo|banner|poster|icono|gener|crea|escrib|plantilla|scaffold|plan|secuen|calcul|cuanto|evalua|resuelve|sum|rest|multiplic|analiz|explic|resume|compar|list|busc|orden|filtr|cont|test|document|instal|desplieg|refactor|optim)/.test(bajo)) continue;
    return limpio;
  }
  return "Nuevo";
}

/** Mapea cualquier palabra tipo (nextjs, tailwindcss, ghaction…) a su CLAVE. */
function claveTipo(tipo: string): string | undefined {
  const t = tipo.toLowerCase();
  if (/^(react|componente)$/.test(t)) return "react";
  if (/^(express|ruta|router)$/.test(t)) return "express";
  if (/^(python|py)$/.test(t)) return "python";
  if (/^(html|pagina)$/.test(t)) return "html";
  if (/^(ts|modulo|interface)$/.test(t)) return "ts";
  // Nuevos v3.0
  if (/^(next|nextjs)$/.test(t)) return "next";
  if (/^(tailwind|tailwindcss)$/.test(t)) return "tailwind";
  if (/^prisma$/.test(t)) return "prisma";
  if (/^svelte$/.test(t)) return "svelte";
  if (/^vue$/.test(t)) return "vue";
  if (/^astro$/.test(t)) return "astro";
  if (/^(docker|dockerfile)$/.test(t)) return "docker";
  if (/^(github_action|ghaction)$/.test(t)) return "github_action";
  if (/^(vite_config|viteconfig)$/.test(t)) return "vite_config";
  if (/^(express_middleware|middleware)$/.test(t)) return "express_middleware";
  if (/^(react_hook|hook)$/.test(t)) return "react_hook";
  if (/^(api_route|apiroute)$/.test(t)) return "api_route";
  if (/^(test|testing)$/.test(t)) return "test";
  if (/^readme$/.test(t)) return "readme";
  if (/^(env_local|env)$/.test(t)) return "env_local";
  return undefined;
}

export function crearPlantilla(tipo: string, nombre: string): string {
  const P = nombre.charAt(0).toUpperCase() + nombre.slice(1);
  const p = nombre.charAt(0).toLowerCase() + nombre.slice(1);
  switch (tipo) {
    case "react":
      return `import React from "react";\n\nexport const ${P}: React.FC = () => (\n  <div className="${p}">\n    <h2>${P}</h2>\n  </div>\n);\n\nexport default ${P};\n`;
    case "express":
      return `import express from "express";\nexport const ${p}Router = express.Router();\n\n${p}Router.get("/", (_req, res) => {\n  res.json({ ok: true, ruta: "${p}" });\n});\n`;
    case "python":
      return `def ${p}():\n    """${P}: generado por el Reflejo de CerebroNico."""\n    return None\n\n\nif __name__ == "__main__":\n    ${p}()\n`;
    case "html":
      return `<!DOCTYPE html>\n<html lang="es">\n<head>\n  <meta charset="UTF-8" />\n  <title>${P}</title>\n</head>\n<body>\n  <main id="${p}">\n    <h1>${P}</h1>\n  </main>\n</body>\n</html>\n`;
    case "ts":
      return `export interface ${P} {\n  id: string;\n}\n\nexport function crear${P}(id: string): ${P} {\n  return { id };\n}\n`;
    // ─── Nuevos v3.0 ──────────────────────────────────────────────────────────
    case "next":
      return `"use client";\nimport { useState } from "react";\n\nexport default function ${P}Page() {\n  return (\n    <main className="p-8">\n      <h1 className="text-2xl font-bold">${P}</h1>\n      <p>Página generada por el Reflejo v3.0 de CerebroNico.</p>\n    </main>\n  );\n}\n`;
    case "tailwind":
      return `// Tailwind config para ${P}\n/** @type {import('tailwindcss').Config} */\nexport default {\n  content: ["./src/**/*.{ts,tsx,html}"],\n  theme: {\n    extend: {\n      colors: {\n        ${p}: { DEFAULT: "#0ea5e9", dark: "#0369a1" },\n      },\n    },\n  },\n  plugins: [],\n};\n`;
    case "prisma":
      return `// Prisma schema para ${P}\nmodel ${P} {\n  id        String   @id @default(cuid())\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n\n  @@map("${p}s")\n}\n`;
    case "svelte":
      return `<script lang="ts">\n  let nombre = "${P}";\n</script>\n\n<main class="${p}">\n  <h1>{nombre}</h1>\n</main>\n\n<style>\n  .${p} { padding: 1rem; }\n</style>\n`;
    case "vue":
      return `<script setup lang="ts">\n  const nombre = "${P}";\n</script>\n\n<template>\n  <main class="${p}">\n    <h1>{{ nombre }}</h1>\n  </main>\n</template>\n\n<style scoped>\n  .${p} { padding: 1rem; }\n</style>\n`;
    case "astro":
      return `---\n// ${P}.astro — generado por el Reflejo v3.0\nconst titulo = "${P}";\n---\n\n<main class="${p}">\n  <h1>{titulo}</h1>\n</main>\n`;
    case "docker":
      return `FROM node:20-alpine\nWORKDIR /app\n\nCOPY package*.json ./\nRUN npm ci --omit=dev\n\nCOPY . .\nRUN npm run build\n\nEXPOSE 3000\nCMD ["node", "dist/server.mjs"]\n`;
    case "github_action":
      return `name: ${P}\n\non:\n  push:\n    branches: [main]\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n      - run: npm ci\n      - run: npm run build\n      - run: npm test\n`;
    case "vite_config":
      return `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n  server: { port: 5173, host: true },\n  build: { target: "esnext", sourcemap: true },\n});\n`;
    case "express_middleware":
      return `import { Request, Response, NextFunction } from "express";\n\nexport function ${p}Middleware(req: Request, res: Response, next: NextFunction) {\n  // ${P}: lógica del middleware aquí\n  next();\n}\n`;
    case "react_hook":
      return `import { useState, useEffect } from "react";\n\nexport function use${P}(inicial = 0) {\n  const [valor, setValor] = useState(inicial);\n  useEffect(() => {\n    // efecto del hook\n  }, [valor]);\n  return { valor, setValor };\n}\n`;
    case "api_route":
      return `import { NextRequest, NextResponse } from "next/server";\n\nexport async function GET(req: NextRequest) {\n  return NextResponse.json({ ok: true, ruta: "${p}" });\n}\n\nexport async function POST(req: NextRequest) {\n  const body = await req.json();\n  return NextResponse.json({ ok: true, recibido: body });\n}\n`;
    case "test":
      return `import { describe, it, expect } from "vitest";\n\ndescribe("${P}", () => {\n  it("debería pasar el primer caso", () => {\n    expect(true).toBe(true);\n  });\n\n  it("debería pasar el segundo caso", () => {\n    expect(1 + 1).toBe(2);\n  });\n});\n`;
    case "readme":
      return `# ${P}\n\n> Generado por el Reflejo v3.0 de CerebroNico.\n\n## Instalación\n\n\`\`\`bash\nnpm install\n\`\`\`\n\n## Uso\n\n\`\`\`bash\nnpm run dev\n\`\`\`\n\n## Licencia\n\nMIT\n`;
    case "env_local":
      return `# ${P} — variables de entorno locales (no commitear)\nPORT=3000\nNODE_ENV=development\n# DATABASE_URL=\n# API_KEY=\n`;
    default:
      return "";
  }
}

// ─── El pensador ─────────────────────────────────────────────────────────────

interface Intencion { intentos: Record<string, number>; tokens: string[]; canon: string[]; }

function puntuar(frase: string, tablas: Tablas): Intencion {
  const tokens = normalizar(frase).split(" ").filter(Boolean);
  const canon: string[] = [];
  const intentos: Record<string, number> = {};
  // Reflejo v3.0 — pequeño bonus por posición: el PRIMER verbo canónico que
  // aparezca en la frase suma +0.1 a cada uno de sus intentos. Esto resuelve
  // el empate «cuenta cuantos .ts hay»: «cuenta» aparece primero y vota por
  // «contar», «cuantos» vota por «calculo». Sin el bonus, el RANK prefería
  // «calculo» (índice 5) sobre «contar» (índice 15) y el reflejo erraba.
  // Con el bonus, «contar» queda por delante porque se leyó primero.
  let primerVerboVotado: string | null = null;
  for (const t of tokens) {
    const c = corregir(t, tablas);
    canon.push(c.canonica);
    const votos = tablas.verbos[c.canonica];
    if (votos) {
      if (primerVerboVotado === null) primerVerboVotado = c.canonica;
      const bonus = c.canonica === primerVerboVotado ? 0.1 : 0;
      for (const v of votos) intentos[v] = (intentos[v] || 0) + (c.exacta ? 1 : 0.85) + bonus;
    }
  }
  // Reflejo v3.0 — anti-colisión: «testea el modulo X» debe votar «testear», no
  // «creacion» (porque «modulo» vota por creacion). Penalizamos ligeramente
  // «creacion» cuando la frase YA tiene un verbo de acción nueva, para que la
  // acción nueva gane y «modulo»/«pagina»/«componente» queden como objeto.
  const tieneAccionNueva = Object.keys(intentos).some(
    (k) => k !== "creacion" && k !== "calculo" && ANALIZAR_ACCIONES.has(k)
  );
  if (tieneAccionNueva && "creacion" in intentos) {
    intentos["creacion"] *= 0.5;
  }
  return { intentos, tokens, canon };
}

// Reflejo v3.0 — RANK ampliado: las 6 originales mantienen su sitio,
// las 16 nuevas se ordenan por prioridad cuando hay empate.
const RANK = [
  "plan", "convertir", "imagen", "creacion", "abrir", "calculo",
  "analizar", "explicar", "resumir", "traducir", "comparar",
  "listar", "buscar", "ordenar", "filtrar", "contar",
  "testear", "documentar", "instalar", "desplegar",
  "refactorizar", "optimizar",
];

// Set de las 16 nuevas acciones que comparten el patrón simple de payload.
// (declarado ANTES de `pensar` porque `const` no se hoist-ea como `function`.)
const ANALIZAR_ACCIONES = new Set([
  "analizar", "explicar", "resumir", "traducir", "comparar",
  "listar", "buscar", "ordenar", "filtrar", "contar",
  "testear", "documentar", "instalar", "desplegar",
  "refactorizar", "optimizar",
]);

export function pensar(frase: string, tablas: Tablas): ResultadoReflejo {
  const t0 = Date.now();
  const base = (extra: Partial<ResultadoReflejo>): ResultadoReflejo => ({
    ok: false, accion: "nada", confianza: 0, modo: tablas.modo, ms: Date.now() - t0, ...extra,
  });

  const limpia = (frase || "").trim();
  if (!limpia) return base({ motivo: "la frase está vacía: no hay nada que reflejar." });

  // 1) Cálculo: si la frase es una expresión (o «cuanto es …»), la calculadora manda.
  // Reflejo v3.0 — también entras: «15% de 200», «5 KB a MB», «hoy + 3 días».
  const esFecha = /^(hoy|ahora|manana|mañana|ayer)\b/i.test(limpia);
  const pre = limpia.replace(/^(cuanto (es|vale)|calcula|evalua|resuelve)\s*/i, "");
  const comoNum = letrasALaTabla(pre, tablas);
  const pareceCalc = /^[\d\s+\-*/%^().,a-z×÷]+$/i.test(comoNum) && /\d/.test(comoNum);
  if (esFecha || pareceCalc) {
    const r = calcular(comoNum || limpia);
    if (r.ok) {
      // Si vino con motivo (caso de fecha ISO), se devuelve el ISO como salida.
      if (r.motivo && typeof r.valor === "undefined") {
        return { ok: true, accion: "calculo", confianza: 0.99, salida: `${pre || limpia} = ${r.motivo}`, modo: tablas.modo, ms: Date.now() - t0 };
      }
      return { ok: true, accion: "calculo", confianza: 0.99, salida: `${pre || limpia} = ${r.valor}`, modo: tablas.modo, ms: Date.now() - t0 };
    }
    // Un cálculo que falla es un motivo, no un silencio: se devuelve tal cual.
    return base({ accion: "calculo", confianza: 0.9, motivo: `el cálculo no sale: ${r.motivo}` });
  }

  const { intentos, tokens, canon } = puntuar(limpia, tablas);
  // Para RUTAS de archivo se usan los tokens CRUDOS: `puntuar` normaliza a
  // minúsculas y «App.tsx» salía como «app.tsx» — en un sistema de archivos
  // sensible a mayúsculas eso es abrir un archivo que no existe.
  const crudos = limpia.split(" ").filter(Boolean);

  // Reflejo v3.0 — Deteción explícita de conectores de plan ANTES de elegir
  // la mejor intención. Sin esto, "convierte X a Y y luego abre Z" empatara a
  // 1 voto entre «convertir» (convierte) y «plan» (luego), y el RANK prefería
  // «convertir» (índice 1) sobre «plan» (índice 0). El conector es la marca
  // más fiable de que hay un plan: la presencia de "y luego" / "después de
  // eso" / "y después" / "mientras" / "si falla" / "y al final" / "cuando
  // termines" fuerza la intención «plan» con peso suficiente para ganar.
  const TIENE_CONECTOR_PLAN = /\b(?:y luego|despues de eso|y despues|y al final|cuando termines|si falla)\b/i.test(limpia)
    || /\b(?:mientras)\b/i.test(limpia);
  if (TIENE_CONECTOR_PLAN) {
    intentos["plan"] = (intentos["plan"] || 0) + 1.5;
  }
  const mejor = RANK.filter((k) => intentos[k]).sort((a, b) => intentos[b] - intentos[a])[0];
  if (!mejor) return base({ motivo: "no reconozco ningún verbo de CerebroNico en la frase. Acciones válidas (Reflejo v3.0): convertir, abrir, imagen/dibujar, crear, plan, calcular, analizar, explicar, resumir, traducir, comparar, listar, buscar, ordenar, filtrar, contar, testear, documentar, instalar, desplegar, refactorizar, optimizar." });

  const conf = Math.min(0.99, intentos[mejor] / 2 + 0.3);
  if (conf < UMBRAL_CONFIANZA) return base({ confianza: conf, motivo: `intuyo «${mejor}» pero con poca confianza (${(conf * 100).toFixed(0)}%). Reformúlala o usa el modelo.` });

  // 2) conversiones
  if (mejor === "convertir") {
    const archivo = archivoEn(crudos);
    // «convierte package.json a yaml»: el formato de origen suele vivir en la
    // EXTENSIÓN del archivo, no en la frase. Sin esto, el reflejo solo servía
    // la forma explícita «de json a yaml».
    const ext = archivo ? tablas.formatos[(archivo.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase()] : undefined;
    const fmts = tokens.map((t) => tablas.formatos[corregir(t, tablas).canonica] || tablas.formatos[t]).filter(Boolean);
    const desde = ext && fmts[0] !== ext ? ext : fmts[0];
    const hacia = fmts.find((f) => f !== desde) ?? (ext && desde !== ext ? desde : undefined);
    if (!archivo) return base({ accion: "orden", confianza: conf, motivo: "sé que quieres convertir, pero no veo QUÉ archivo (necesito una ruta como package.json)." });
    if (!desde || !hacia) return base({ accion: "orden", confianza: conf, motivo: `convertir necesita dos formatos distintos (json, yaml, toml, csv); encontré: ${[...new Set([desde, hacia, ext].filter(Boolean))].join(", ") || "ninguno"}.` });
    const bloque = "```cerebronico:convertir\n" + JSON.stringify({ desde, hacia, archivo }) + "\n```";
    return validarYDevolver(bloque, tablas, conf, t0);
  }

  // 3) abrir / leer
  if (mejor === "abrir") {
    const archivo = archivoEn(crudos) || (canon.includes("proyecto") ? "." : undefined);
    if (!archivo) return base({ accion: "orden", confianza: conf, motivo: "no veo qué archivo abrir en la frase." });
    // La ruta va en la línea SIGUIENTE a la cabecera: así lo lee `extraerOrdenes`
    // (que toma el cuerpo, no el encabezado). En una sola línea el validador la
    // descartaba — y el reflejo, fiel a su regla, no la emitía.
    return validarYDevolver("```cerebronico:abrir\n" + archivo + "\n```", tablas, conf, t0);
  }

  // 4) imagen — el prompt viaja TAL CUAL (cero filtro de contenido)
  if (mejor === "imagen") {
    const sin = limpia.split(" ").filter(Boolean);
    // El verbo se quita mirando quién VOTA por "imagen" (no por quién existe
    // en la tabla: así «dibuxa un logo…» deja «logo…» y no «dibuxa un logo…»).
    const iVerbo = sin.findIndex((w) => (tablas.verbos[corregir(w, tablas).canonica] || []).includes("imagen"));
    const prompt = (iVerbo >= 0 ? sin.slice(iVerbo + 1) : sin).join(" ").replace(/^(una?|el|la|un dibujo de|de)\s+/i, "").trim();
    if (!prompt) return base({ accion: "orden", confianza: conf, motivo: "no hay nada que dibujar: la frase no trae descripción." });
    const bloque = "```cerebronico:imagen\n" + JSON.stringify({ prompt, salida: `img/${(prompt.split(" ")[0] || "imagen").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24) || "imagen"}.jpg` }) + "\n```";
    return validarYDevolver(bloque, tablas, conf, t0);
  }

  // 5) creación con plantilla (Reflejo v3.0 — 16 tipos en vez de 5)
  if (mejor === "creacion") {
    // El TIPO se busca en la palabra tal cual o en su canónica exacta. Con
    // fuzzy puro, «react» caía en «read» (variante real de la tabla max) y el
    // tipo desaparecía.
    const tipoRaw = crudos.find((t) => {
      const n = normalizar(t);
      const lex = tablas.lexicon[n] || n;
      return PALABRAS_TIPO.has(n) || PALABRAS_TIPO.has(lex);
    });
    const canonT = tipoRaw ? normalizar(tipoRaw) : "";
    const clave = claveTipo(canonT);
    if (!clave) return base({ accion: "creacion", confianza: conf, motivo: "creo que quieres crear algo, pero no qué tipo. Tipos válidos (Reflejo v3.0): react, express, python, html, ts, next, tailwind, prisma, svelte, vue, astro, docker, github_action, vite_config, express_middleware, react_hook, api_route, test, readme, env_local." });
    const nombre = nombreEn(limpia.split(" "));
    const cuerpo = crearPlantilla(clave, nombre);
    return { ok: true, accion: "creacion", confianza: conf, salida: cuerpo, motivo: undefined, modo: tablas.modo, ms: Date.now() - t0 };
  }

  // 6) plan: «X y luego Y» — Reflejo v3.0 con conectores enriquecidos
  //    Conectores: "y luego" / "después de eso" / "y después" / "luego"
  //                "mientras" → genera tareas en PARALELO (sin dependencia)
  //                "si falla" → esa tarea depende de la anterior pero marca ramificación
  //                "primero X y al final Y" → X va primero, Y último
  //                "cuando termines X, Y" → Y depende de X
  if (mejor === "plan") {
    // Detecta conectores: cada uno marca una partición distinta
    // (el flag /g es obligatorio para matchAll — sin él, tira TypeError en runtime.)
    const conectores = /\s+(?:y luego|despues de eso|y despues|luego|mientras|si falla|y al final|cuando termines)\s+/gi;
    const partes = limpia.split(conectores).filter((p) => p.trim());
    if (partes.length < 2) return base({ accion: "orden", confianza: conf, motivo: "un plan necesita dos pasos unidos por «y luego» / «después» / «mientras» (paralelo) / «si falla» / «cuando termines»." });
    // Identifica qué conector va entre cada par (para detectar PARALELO/RAMIFICACIÓN)
    // Resetea el lastIndex porque el regex es /g y split ya lo consumió.
    conectores.lastIndex = 0;
    const matches = [...limpia.matchAll(conectores)];
    const esParalelo = matches.map(m => (m[0] || "").toLowerCase().includes("mientras"));
    const pasos = partes.map((p) => pensar(p, tablas));
    const ordenables = pasos.filter((s) => s.ok && s.orden);
    if (ordenables.length !== partes.length) {
      const fallo = pasos.find((s) => !(s.ok && s.orden));
      return base({ accion: "orden", confianza: conf, motivo: `no puedo planificar: ${fallo?.motivo || "un paso no se entiende"}` });
    }
    const tareas = ordenables.map((s, i) => {
      // Si el conector ANTES de esta tarea fue "mientras", es PARALELO con la anterior:
      // no depende de nada. Si fue "y luego"/"después"/etc, depende de la anterior.
      // (i=0 nunca tiene conector anterior; siempre es paralelo, no depende de nada.)
      const paralelo = i === 0 ? false : esParalelo[i - 1];
      const dependeriaDe = paralelo ? [] : (i === 0 ? [] : [String(i)]);
      return {
        id: String(i + 1),
        titulo: partes[i].slice(0, 60),
        tipo: (s.orden as { tipo: string }).tipo === "imagen" ? "generar_imagen" : (s.orden as { tipo: string }).tipo === "abrir" ? "leer_archivo" : "convertir",
        peso: paralelo ? "cpu" : "io",
        datos: (s.orden as { tipo: string }).tipo === "abrir" ? { ruta: (s.orden as { ruta: string }).ruta } : (s.orden as { tipo: string }).tipo === "imagen" ? { prompt: (s.orden as { prompt: string }).prompt, ...( (s.orden as { salida?: string }).salida ? { salida: (s.orden as { salida?: string }).salida } : {} ) } : { desde: (s.orden as { desde: string }).desde, hacia: (s.orden as { hacia: string }).hacia, archivo: (s.orden as { archivo: string }).archivo },
        dependeDe: dependeriaDe,
        paralelo,
      };
    });
    const bloque = "```cerebronico:plan\n" + JSON.stringify({ objetivo: limpia.slice(0, 120), tareas }) + "\n```";
    return validarYDevolver(bloque, tablas, conf, t0);
  }

  // ─── 7) Acciones nuevas Reflejo v3.0 — todas emiten su orden con su payload ──
  // Las 16 acciones comparten un patrón simple: toman un sujeto (archivo/ruta/prompt)
  // y opcionalmente un complemento. El payload viaja como JSON en el bloque.
  if (ANALIZAR_ACCIONES.has(mejor)) {
    const sujeto = archivoEn(crudos);
    const promptSujeto = (sujeto ? undefined : (limpia.split(" ").filter(Boolean).slice(1).join(" ")));
    const payload: Record<string, string | undefined> = {};
    if (sujeto) payload.archivo = sujeto;
    if (promptSujeto) payload.prompt = promptSujeto;
    // «traducir X a Y» — el destino viaja en `idioma`
    if (mejor === "traducir") {
      const haciaIdx = tokens.findIndex((t) => corregir(t, tablas).canonica === "a" || t === "a" || t === "en" || t === "to");
      if (haciaIdx >= 0 && tokens[haciaIdx + 1]) payload.idioma = corregir(tokens[haciaIdx + 1], tablas).canonica;
    }
    // «ordenar X por Y» / «filtrar X por Y» — el campo viaja en `campo`
    if (mejor === "ordenar" || mejor === "filtrar") {
      const porIdx = tokens.findIndex((t) => corregir(t, tablas).canonica === "por" || t === "por" || t === "by");
      if (porIdx >= 0 && tokens[porIdx + 1]) payload.campo = corregir(tokens[porIdx + 1], tablas).canonica;
    }
    // «instalar X» — el paquete viaja en `paquete`
    if (mejor === "instalar") {
      const nombre = promptSujeto || sujeto;
      if (nombre) payload.paquete = nombre.replace(/[^a-z0-9_\-@\/\.]/gi, "");
    }
    // «desplegar X» — el destino viaja en `destino` (si lo dice)
    if (mejor === "desplegar") {
      const enIdx = tokens.findIndex((t) => corregir(t, tablas).canonica === "en" || t === "en" || t === "to" || t === "a");
      if (enIdx >= 0 && tokens[enIdx + 1]) payload.destino = corregir(tokens[enIdx + 1], tablas).canonica;
    }
    if (!payload.archivo && !payload.prompt && !payload.paquete) {
      return base({ accion: "orden", confianza: conf, motivo: `sé que quieres ${mejor}, pero necesito un archivo o descripción sobre la que actuar.` });
    }
    const bloque = "```cerebronico:" + mejor + "\n" + JSON.stringify(payload) + "\n```";
    return validarYDevolver(bloque, tablas, conf, t0);
  }

  return base({ confianza: conf, motivo: `intención «${mejor}» sin implementación de reflejo (aún).` });
}

/**
 * La regla 2: lo que el reflejo emite se re-valida con la MISMA función del
 * chat. Si el viaje de ida y vuelta no sale, NO sale hacia el motor.
 */
function validarYDevolver(bloque: string, tablas: Tablas, conf: number, t0: number): ResultadoReflejo {
  const { ordenes, avisos } = extraerOrdenes(bloque);
  if (ordenes.length !== 1 || avisos.length > 0) {
    return {
      ok: false, accion: "orden", confianza: 0, modo: tablas.modo, ms: Date.now() - t0,
      motivo: `el reflejo construyó una orden que NO pasa el validador del chat (${avisos[0] || "no la reconoce"}). No se emite: arregla el patrón, no el síntoma.`,
    };
  }
  return { ok: true, accion: "orden", confianza: conf, salida: bloque, orden: ordenes[0], modo: tablas.modo, ms: Date.now() - t0 };
}
