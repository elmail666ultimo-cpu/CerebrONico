/**
 * PODERES v1 (v1.0.3) — 22 operaciones deterministas nuevas para los espejos.
 * Cada espejo sigue con su orden original; ahora además acepta {accion:"…"} y
 * despacha un PODER. Puro, sin modelo, sin disco: números y estructuras exactas.
 * El puente es potenciarEspejos(): envuelve .ejecutar ANTES de interceptar,
 * con lo que ningún handler existente cambia de comportamiento.
 */
import type { Entidad, ResultadoEntidad } from "./consejo";

type Env = (entidad: string, t0: number, ok: boolean, extra?: Partial<ResultadoEntidad>) => ResultadoEntidad;
type Poder = (d: any) => { ok: boolean; salida?: unknown; motivo?: string };

// ── utilidades puras ──────────────────────────────────────────────────────
const r4 = (n: number) => (isFinite(n) ? Math.round(n * 10000) / 10000 : n);
const hexRGB = (h: string) => {
  const m = String(h || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
};
const hexDe = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// ── PODERES por espejo ────────────────────────────────────────────────────
export const PODERES: Record<string, Record<string, Poder>> = {
  "espejo.matematicos": {
    estadistica: (d) => {
      const v = (Array.isArray(d?.datos) ? d.datos : []).map(Number).filter((x: number) => isFinite(x)).sort((a: number, b: number) => a - b);
      if (v.length < 2) return { ok: false, motivo: "«datos» necesita ≥2 números." };
      const n = v.length, media = v.reduce((s: number, x: number) => s + x, 0) / n;
      const varM = v.reduce((s: number, x: number) => s + (x - media) ** 2, 0) / (n - 1);
      const sd = Math.sqrt(varM);
      const med = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
      const freq: Record<number, number> = {}; let moda = v[0], mc = 1;
      for (const x of v) { freq[x] = (freq[x] || 0) + 1; if (freq[x] > mc) { mc = freq[x]; moda = x; } }      return { ok: true, salida: { n, media: r4(media), mediana: r4(med), moda: mc > 1 ? moda : "sin moda", desv: r4(sd), min: v[0], max: v[n - 1], ic95: [r4(media - 1.96 * sd / Math.sqrt(n)), r4(media + 1.96 * sd / Math.sqrt(n))] } };
    },
    resolver: (d) => {
      const a = Number(d?.a), b = Number(d?.b);
      if (!isFinite(a) || !isFinite(b)) return { ok: false, motivo: "«a» y «b» numéricos (ax+b=0; añade «c» para ax²+bx+c=0)." };
      if (d?.c === undefined || d?.c === null) {
        if (a === 0) return { ok: false, motivo: "a=0 sin «c»: ecuación degenerada." };
        return { ok: true, salida: { tipo: "lineal", x: r4(-b / a) } };
      }
      const c = Number(d.c);
      if (!isFinite(c)) return { ok: false, motivo: "«c» no numérico." };
      if (a === 0) { if (b === 0) return { ok: false, motivo: "a=b=0: sin incógnita." }; return { ok: true, salida: { tipo: "lineal", x: r4(-c / b) } }; }
      const disc = b * b - 4 * a * c;
      if (disc < 0) { const re = -b / (2 * a), im = Math.sqrt(-disc) / (2 * a); return { ok: true, salida: { tipo: "cuadrática", discriminante: r4(disc), raices: [`${r4(re)}+${r4(im)}i`, `${r4(re)}−${r4(im)}i`] } }; }
      const rz = Math.sqrt(disc);
      return { ok: true, salida: { tipo: "cuadrática", discriminante: r4(disc), raices: [r4((-b + rz) / (2 * a)), r4((-b - rz) / (2 * a))].sort((x, y) => x - y) } };
    },
    matrices: (d) => {
      const A = d?.a, B = d?.b, op = String(d?.op || "");
      if (!Array.isArray(A) || !Array.isArray(A[0])) return { ok: false, motivo: "«a» debe ser matriz de filas [[..],[..]]." };
      const n = A.length, m = A[0].length;
      const det = (M: number[][]): number => {
        if (M.length === 1) return M[0][0];
        if (M.length === 2) return M[0][0] * M[1][1] - M[0][1] * M[1][0];
        return M[0].reduce((s, e, j) => s + (j % 2 ? -e : e) * det(M.slice(1).map((r) => [...r.slice(0, j), ...r.slice(j + 1)])), 0);
      };
      if (op === "det") { if (n !== m) return { ok: false, motivo: "det pide matriz cuadrada." }; return { ok: true, salida: { det: r4(det(A)) } }; }
      if (!Array.isArray(B) || !Array.isArray(B[0])) return { ok: false, motivo: "«b» debe ser matriz." };
      if (op === "sum") {
        if (n !== B.length || m !== B[0].length) return { ok: false, motivo: "sum pide mismo tamaño." };
        return { ok: true, salida: { suma: A.map((r: number[], i: number) => r.map((x: number, j: number) => r4(x + B[i][j]))) } };
      }
      if (op === "mul") {
        if (m !== B.length) return { ok: false, motivo: `mul pide columnas(A)=filas(B) (${m}≠${B.length}).` };
        const C = A.map((fila: number[]) => B[0].map((_: number, j: number) => r4(fila.reduce((s: number, x: number, k: number) => s + x * B[k][j], 0))));
        return { ok: true, salida: { producto: C } };
      }
      return { ok: false, motivo: "«op» debe ser sum|mul|det." };
    },
    bases: (d) => {
      const v = String(d?.numero ?? "").trim(), de = String(d?.de || "10");
      const n = parseInt(v, Number(de));
      if (!isFinite(n)) return { ok: false, motivo: "«numero» no es válido en base «de» (2|8|10|16)." };
      return { ok: true, salida: { dec: n, bin: n.toString(2), oct: n.toString(8), hex: n.toString(16).toUpperCase() } };
    },
    mcd_mcm: (d) => {
      let a = Math.abs(Math.trunc(Number(d?.a))), b = Math.abs(Math.trunc(Number(d?.b)));
      if (!isFinite(a) || !isFinite(b) || !a || !b) return { ok: false, motivo: "«a» y «b» enteros ≠0." };
      let x = a, y = b; while (y) { const t = y; y = x % y; x = t; }
      return { ok: true, salida: { mcd: x, mcm: (a / x) * b } };
    },
    interes: (d) => {
      const C = Number(d?.capital), t = Number(d?.tasa), an = Number(d?.anios), k = Number(d?.comp || 1);
      if (!isFinite(C) || !isFinite(t) || !isFinite(an)) return { ok: false, motivo: "«capital», «tasa» (0.08 = 8%) y «anios» son necesarios." };
      const M = C * Math.pow(1 + t / k, k * an);
      return { ok: true, salida: { monto: r4(M), ganancia: r4(M - C), capitalizacion: k } };
    },
  },

  "espejo.artes": {
    contraste: (d) => {
      const A = hexRGB(d?.a), B = hexRGB(d?.b);
      if (!A || !B) return { ok: false, motivo: "«a» y «b» deben ser HEX de 6 (#rrggbb)." };
      const l1 = lum(A), l2 = lum(B);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      return { ok: true, salida: { ratio: r4(ratio), AA_normal: ratio >= 4.5, AA_grande: ratio >= 3, AAA_normal: ratio >= 7 } };
    },
    daltonismo: (d) => {
      const c = hexRGB(d?.base);
      if (!c) return { ok: false, motivo: "«base» debe ser HEX de 6." };
      const sim = (M: number[][]) => hexDe(M[0][0] * c.r + M[0][1] * c.g + M[0][2] * c.b, M[1][0] * c.r + M[1][1] * c.g + M[1][2] * c.b, M[2][0] * c.r + M[2][1] * c.g + M[2][2] * c.b);
      return { ok: true, salida: { base: d.base, protanopia: sim([[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]), deuteranopia: sim([[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]), tritanopia: sim([[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004732, 0.691367, 0.303901]]) } };
    },
    gradiente: (d) => {
      const A = hexRGB(d?.desde), B = hexRGB(d?.hasta);
      const pasos = Math.max(2, Math.min(32, Number(d?.pasos || 5)));
      if (!A || !B) return { ok: false, motivo: "«desde» y «hasta» deben ser HEX de 6." };
      return { ok: true, salida: { rampa: Array.from<number>({ length: pasos }).map((_, i: number) => { const t = i / (pasos - 1); return hexDe(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t); }) } };
    },
  },

  "espejo.codigos": {
    dependencias: (d) => {
      const codigo = String(d?.codigo || "");
      if (!codigo.trim()) return { ok: false, motivo: "no llegó «codigo»." };
      const mods = new Set<string>();
      for (const m of codigo.matchAll(/^\s*(?:import\s[^'"]*from|import|require\()\s*['"]([^'"]+)['"]/gm)) mods.add(m[1]);
      for (const m of codigo.matchAll(/^\s*(?:use|include)\s+([\w:]+)/gm)) mods.add(m[1]);
      return { ok: true, salida: { modulos: [...mods].sort(), total: mods.size } };
    },
    firmas: (d) => {
      const codigo = String(d?.codigo || "");
      if (!codigo.trim()) return { ok: false, motivo: "no llegó «codigo»." };
      const fs = [...codigo.matchAll(/\b(?:function|def|func)\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)|\b([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g)];
      const firmas = fs.slice(0, 30).map((m) => `${m[1] || m[3]}(${(m[2] || m[4] || "").trim()})`);
      const clases = [...codigo.matchAll(/\b(?:class|struct|interface)\s+([A-Za-z_$][\w$]*)/g)].slice(0, 15).map((m) => m[1]);
      return { ok: true, salida: { funciones: [...new Set(firmas)], clases } };
    },
    duplicados: (d) => {
      const lineas = String(d?.codigo || "").split("\n").map((l) => sinAcentos(l.trim().toLowerCase())).filter((l) => l.length > 12);
      if (lineas.length < 6) return { ok: false, motivo: "«codigo» necesita ≥6 líneas con contenido." };
      const visto = new Map<string, number[]>();
      for (let i = 0; i + 6 <= lineas.length; i++) {
        const bloque = lineas.slice(i, i + 6).join("|");
        const arr = visto.get(bloque) || []; arr.push(i + 1); visto.set(bloque, arr);
      }
      const dup = [...visto.entries()].filter(([, v]) => v.length > 1).slice(0, 8);
      return { ok: true, salida: { bloques_repetidos: dup.map(([k, v]) => ({ lineas: v, muestra: k.split("|")[0].slice(0, 60) })), total: dup.length } };
    },
  },

  "espejo.lenguajes": {
    frecuencias: (d) => {
      const words = String(d?.texto || "").toLowerCase().match(/[a-záéíóúüñàâäèéêëìíîïòóôöùúûç]+/gi) || [];
      if (!words.length) return { ok: false, motivo: "no llegó «texto» con palabras." };
      const STOP = new Set(sinAcentos("de la que el en y a los del se las por un para con no una su lo como más pero sus le ya este esto son está ser tiene hacer cuando entre todo tras bajo sobre the of and to in is you that it he was for on are as with his they i at be this have from or one had by not what all were we when your can said each which do their time if will way about many then these so").split(" "));
      const freq: Record<string, number> = {};
      for (const w of words) if (!STOP.has(w) && w.length > 2) freq[w] = (freq[w] || 0) + 1;
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, Math.max(3, Math.min(20, Number(d?.top || 10))));
      return { ok: true, salida: { top, unicas: Object.keys(freq).length } };
    },
    convertir: (d) => {
      const t = String(d?.texto || "").trim();
      if (!t) return { ok: false, motivo: "falta «texto»." };
      const parts = sinAcentos(t.toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
      if (!parts.length) return { ok: false, motivo: "el texto no tiene palabras alfanuméricas." };
      const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
      return { ok: true, salida: { snake: parts.join("_"), kebab: parts.join("-"), camel: parts[0] + parts.slice(1).map(cap).join(""), pascal: parts.map(cap).join(""), titulo: parts.map(cap).join(" ") } };
    },
    diff: (d) => {
      const wa = String(d?.a || "").toLowerCase().match(/[\wáéíóúüñ]+/gi) || [];
      const wb = String(d?.b || "").toLowerCase().match(/[\wáéíóúüñ]+/gi) || [];
      if (!wa.length || !wb.length) return { ok: false, motivo: "«a» y «b» deben ser dos textos con palabras." };
      const sa = new Set(wa), sb = new Set(wb);
      const comunes = [...sa].filter((x) => sb.has(x));
      return { ok: true, salida: { agregadas: [...sb].filter((x) => !sa.has(x)).slice(0, 40), eliminadas: [...sa].filter((x) => !sb.has(x)).slice(0, 40), similitud: r4(comunes.length / new Set([...sa, ...sb]).size) } };
    },
  },

  "espejo.planificadores": {
    ordenar: (d) => {
      const tareas = Array.isArray(d?.tareas) ? d.tareas : [];
      const ids = tareas.map((t: any) => String(t?.id ?? "")).filter(Boolean);
      if (!ids.length || new Set(ids).size !== ids.length) return { ok: false, motivo: "«tareas»: [{id, depen:[ids]}] con ids únicos." };
      const dep: Record<string, string[]> = {}; const indeg: Record<string, number> = {};
      for (const t of tareas) { const id = String(t.id); dep[id] = (Array.isArray(t.depen) ? t.depen : []).map(String).filter((x: string) => ids.includes(x)); indeg[id] = dep[id].length; }
      for (const t of tareas) for (const p of dep[String(t.id)]) (indeg[p] = indeg[p] || 0);
      const cola = ids.filter((i: string) => indeg[i] === 0); const orden: string[] = [];
      while (cola.length) { const x = cola.shift()!; orden.push(x); for (const t of tareas) { const id = String(t.id); if (dep[id].includes(x) && --indeg[id] === 0) cola.push(id); } }
      if (orden.length !== ids.length) return { ok: true, salida: { orden: null, ciclo: ids.filter((i: string) => indeg[i] > 0), motivo: "hay dependencias circulares — el plan no es ejecutable tal cual." } };
      return { ok: true, salida: { orden } };
    },
    lotes: (d) => {
      const res = PODERES["espejo.planificadores"].ordenar(d);
      const orden: string[] | null = res.ok ? ((res.salida as any)?.orden ?? null) : null;
      if (!orden) return { ok: false, motivo: (res.salida as any)?.motivo || (res as any)?.motivo || "el orden topológico falló." };
      const tareas = d.tareas as any[]; const onda: Record<string, number> = {}; const lotes: string[][] = [];
      for (const id of orden) {
        const t = tareas.find((x: any) => String(x.id) === id);
        const depen: string[] = (Array.isArray(t?.depen) ? t.depen : []).map(String).filter((p: string) => onda[p] !== undefined);
        const w = depen.length ? Math.max(...depen.map((p: string) => onda[p])) + 1 : 0;
        while (lotes.length <= w) lotes.push([]);
        lotes[w].push(id); onda[id] = w;
      }
      return { ok: true, salida: { lotes, paralelizables: lotes.filter((L: string[]) => L.length > 1).length, profundidad: lotes.length } };
    },
  },

  "espejo.disenios": {
    escala: (d) => {
      const base = Number(d?.base || 16), ratio = Number(d?.ratio || 1.25);
      if (!isFinite(base) || !isFinite(ratio) || ratio <= 1) return { ok: false, motivo: "«base» px y «ratio» >1 (1.125|1.2|1.25|1.333|1.414|1.5|1.618)." };
      const nombres = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];
      const pasos: Record<string, number> = {};
      nombres.forEach((nm, i) => { pasos[nm] = r4(base * Math.pow(ratio, i - 2)); });
      return { ok: true, salida: { ratio_nombres: { "1.125": "Major Second", "1.2": "Minor Third", "1.25": "Major Third", "1.333": "Perfect Fourth", "1.414": "Aug Fourth", "1.5": "Perfect Fifth", "1.618": "Golden" }[String(ratio)] || "personalizado", escala: pasos } };
    },
    breakpoints: (d) => {
      const min = Number(d?.min || 320);
      if (!isFinite(min) || min < 200) return { ok: false, motivo: "«min» en px (≥200, ej. 320)." };
      return { ok: true, salida: { movil: min, tableta: Math.round(min * 2), escritorio: Math.round(min * 3.75), wide: Math.round(min * 6), css: `@media (min-width:${Math.round(min * 2)}px){} @media (min-width:${Math.round(min * 3.75)}px){} @media (min-width:${Math.round(min * 6)}px){}` } };
    },
  },

  "espejo.cientificos": {
    tam_amostral: (d) => {
      const N = Number(d?.poblacion || 0), z = Number(d?.z || 1.96), e = Number(d?.margen || 0.05), p = Number(d?.p || 0.5);
      if (!isFinite(z) || !isFinite(e) || e <= 0 || e >= 1) return { ok: false, motivo: "«margen» entre 0 y 1 (0.05 = ±5%); «z» 1.96 = 95%." };
      const n0 = (z * z * p * (1 - p)) / (e * e);
      const n = N > 0 ? n0 / (1 + (n0 - 1) / N) : n0;
      return { ok: true, salida: { muestra: Math.ceil(n), poblacion: N || "infinita", confianza: z, margen: e } };
    },
    ic: (d) => {
      const media = Number(d?.media), sd = Number(d?.desv), n = Number(d?.n || 0), z = Number(d?.z || 1.96);
      if (![media, sd, n].every(isFinite) || n < 2) return { ok: false, motivo: "«media», «desv» y «n»≥2." };
      const margen = z * sd / Math.sqrt(n);
      return { ok: true, salida: { ic: [r4(media - margen), r4(media + margen)], margen_errores: r4(margen) } };
    },
  },

  "espejo.cuantico": {
    entrelazamiento: (d) => {
      const am = Array.isArray(d?.amplitudes) ? d.amplitudes.map(Number) : [];
      if (am.length !== 4 || !am.every(isFinite)) return { ok: false, motivo: "«amplitudes»: 4 números [a00,a01,a10,a11]." };
      const norm = am.reduce((s: number, x: number) => s + x * x, 0);
      if (Math.abs(norm - 1) > 0.01) return { ok: false, motivo: `las amplitudes no están normalizadas (Σ|a|²=${r4(norm)}).` };
      const C = Math.abs(am[0] * am[3] - am[1] * am[2]) * 2;
      return { ok: true, salida: { concurrencia: r4(C), entrelazado: C > 1e-6, max_entrelazado: Math.abs(C - 1) < 1e-6 } };
    },
  },
};

/** Catálogo TURBO: el reparto completo de poderes, listo para el system prompt. */
export const CATALOGO_TURBO =
  "TURBO ESPEJOS ARMADO — reparto de poderes (usa consultar_espejo con {\"accion\"} en «datos», lotes de hasta 8; sin «accion» el espejo hace su orden clásica): " +
  Object.entries(PODERES).map(([id, p]) => `${id}: ${Object.keys(p).join("|")}`).join(" · ") +
  ". Regla turbo: NADA de aritmética, estadística, contraste, orden de tareas ni conversiones de cabeza o a mano — cada una de esas sale EXACTA de un espejo en ~1 ms. Antes de escribir un número que se pueda calcular, calculalo con el espejo.";

/** Envuelve los .ejecutar de los espejos con su tabla de poderes. Idempotente. */
export function potenciarEspejos(lista: Entidad[], r: Env): void {
  for (const e of lista) {
    const poderes = PODERES[e.id];
    const original = e.ejecutar;
    if (!poderes || !original || (original as any).potenciado) continue;
    const envuelta = (d: any): ResultadoEntidad => {
      const t0 = Date.now();
      const accion = d && typeof d === "object" ? String((d as any).accion || "") : "";
      if (accion && poderes[accion]) {
        try {
          const p = poderes[accion](d);
          return p.ok
            ? r(e.id, t0, true, { salida: JSON.stringify({ accion, ...(p.salida || {}) }) })
            : r(e.id, t0, false, { motivo: `poder «${accion}»: ${p.motivo || "sin motivo"}` });
        } catch (err: any) {
          return r(e.id, t0, false, { motivo: `poder «${accion}» reventó: ${String(err?.message || err)}` });
        }
      }
      if (accion) {
        return r(e.id, t0, false, { motivo: `«${accion}» no es poder de ${e.id}. Poderes: ${Object.keys(poderes).join(", ")}. (Sin «accion», el espejo hace su orden clásica.)` });
      }
      return original(d);
    };
    (envuelta as any).potenciado = true;
    e.ejecutar = envuelta;
  }
}
