/**
 * autocorrector.ts — AUTOCORRECTOR DETERMINISTA DEL COMPOSER (F1 · v1.16.0)
 * ========================================================================
 * QUÉ ES: corrige la ortografía del chat MIENTRAS el usuario escribe, sin
 * gastar una sola llamada al modelo. Todo lo que hay aquí es determinista:
 * diccionario + pares frecuentes + distancia de edición ≤1.
 * PARA QUÉ SIRVE: para que «hola como estas» no llegue al modelo (ni al
 * usuario) sin sus tildes, sin depender de que el LLM —si es pequeño o local—
 * quiera o pueda corregir.
 *
 * LA LEY QUE NO SE NEGOCIA: lo que está dentro de backticks, bloques de
 * código, rutas de archivo, identificadores camelCase / con _, comandos o URLs
 * NO se corrige. Es una exclusión POR TOKEN, no por palabra: un nombre propio
 * o una ruta `C:\Archivos\x.ts` no es una falta de ortografía, es material a
 * preservar.
 *
 * DOS MODOS (elegibles en el panel Pro, persistidos):
 *   · "sugerir" (default) — devuelve las correcciones para subrayar; NUNCA
 *     cambia lo escrito a traición.
 *   · "auto" — reemplaza en caliente SOLO las correcciones seguras (una única
 *     candidata y el token no es ya una palabra válida). Lo ambiguo se respeta.
 */

import { PARES_FRECUENTES } from "./vocabulario";

export type ModoAutocorrector = "off" | "sugerir" | "auto";

export interface Correccion {
  /** La palabra tal como se escribió. */
  original: string;
  /** La forma corregida. */
  corregida: string;
  /** Índice de inicio del token en la línea. */
  inicio: number;
  /** Índice de fin (exclusivo) del token en la línea. */
  fin: number;
  /** Distancia de edición frente a la forma correcta (0 = par frecuente). */
  distancia: number;
  /** true = no ambigua: se puede aplicar en modo «auto» sin riesgo. */
  segura: boolean;
}

export interface ResultadoLinea {
  /** Texto ya corregido según el modo. */
  texto: string;
  /** Correcciones detectadas (en «auto», solo las aplicadas). */
  correcciones: Correccion[];
}

/** Vocabulario de formas correctas (con y sin tilde). Las formas sin tilde que
 *  también son palabras válidas («como», «estas», «mas», «si») marcan la
 *  ambigüedad: frente a su variante acentuada se SUGIEREN, no se auto-reemplazan. */
const DICCIONARIO_CORRECTO = new Set<string>([
  // — sin tilde (formas válidas; presencia = ambigüedad frente a la acentuada) —
  "hola", "como", "cuando", "cuanto", "cual", "donde", "adonde", "aun", "solo",
  "esta", "estas", "este", "estos", "mas", "si", "tu", "te", "el", "mi", "de", "se", "que",
  "quien", "bien", "mal", "hay", "muy", "tan", "con", "sin", "para", "pero", "porque",
  "no", "un", "una", "ya", "aqui", "alli", "gracias", "por", "favor", "ayuda",
  "nombre", "archivo", "funcion", "mejor", "peor", "antes", "despues",
  // — con tilde / ñ (objetivos de corrección) —
  "cómo", "cuándo", "cuánto", "cuál", "dónde", "adónde", "aún", "sólo",
  "está", "estás", "están", "más", "sí", "tú", "té", "él", "mí", "dé", "sé", "qué", "quién",
  "también", "código", "página", "jamás", "después", "rápido", "automático", "técnico",
  "fácil", "difícil", "útil", "inglés", "francés", "número", "versión", "música",
  "niño", "niña", "mañana", "señor", "médico", "árbol", "lápiz", "matemática",
]);

/**
 * Quita las tildes y descompone la ñ a n (NFD + eliminar marcas combinables).
 * Sirve para emparejar «tambien»↔«también», «nino»↔«niño», etc., sin confundir
 * mayúsculas (el llamador ya decide qué es token protegido).
 */
export function quitarTildes(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Distancia de Levenshtein entre dos cadenas (misma longitud esperada). */
export function distanciaEdicion(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1).fill(0).map((_, j) => j);
  let actual = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    actual[0] = i;
    for (let j = 1; j <= n; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(prev[j] + 1, actual[j - 1] + 1, prev[j - 1] + coste);
    }
    [prev, actual] = [actual, prev];
  }
  return prev[n];
}

/**
 * ¿Este token NO debe corregirse? Rutas, URLs, identificadores, comandos,
 * números de versión y cualquier cosa con mayúscula interior (nombres propios,
 * `CamelCase`) son material, no faltas de ortografía.
 */
export function esTokenProtegido(t: string): boolean {
  const s = String(t ?? "").trim();
  if (s === "") return true;
  if (/^(https?|ftp|file|ws):\/\//i.test(s)) return true; // URL
  if (/[\\/]/.test(s)) return true; // ruta de archivo (Windows o POSIX)
  if (/[A-Z]/.test(s)) return true; // nombre propio / CamelCase / PascalCase
  if (/_/.test(s)) return true; // snake_case
  if (/\d/.test(s)) return true; // número, versión, «v1.16.0»
  if (/`/.test(s)) return true; // resto de código inline
  return false;
}

/** Candidata a corrección para UNA palabra (o null si no hay nada que hacer). */
export function corregirPalabra(t: string, _i?: number): Correccion | null {
  const token = String(t ?? "").trim();
  if (token === "" || esTokenProtegido(token)) return null;
  const clave = token.toLowerCase();
  const normalizado = quitarTildes(clave);

  // 1 · Pares frecuentes (correcciones curadas, incluidas palabras pegadas).
  const par = PARES_FRECUENTES[normalizado] ?? PARES_FRECUENTES[clave];
  if (par) {
    return { original: token, corregida: par, inicio: 0, fin: token.length, distancia: 0, segura: true };
  }

  // 2 · Acentos / ñ perdidos: candidatas cuya forma sin tilde coincide.
  const variantes = [...DICCIONARIO_CORRECTO].filter(
    (w) => quitarTildes(w) === normalizado && w !== clave
  );
  if (variantes.length > 0) {
    // La más corta es la forma más frecuente en la práctica (heurística suave).
    const mejor = variantes.sort((a, b) => a.length - b.length)[0];
    const yaValida = DICCIONARIO_CORRECTO.has(clave);
    return {
      original: token,
      corregida: mejor,
      inicio: 0,
      fin: token.length,
      distancia: 1,
      segura: !yaValida, // si el token ya es palabra válida → ambiguo → solo sugerir
    };
  }

  // 3 · Ya es correcta y no tiene variante acentuada.
  if (DICCIONARIO_CORRECTO.has(clave)) return null;

  // 4 · Distancia de edición ≤1 (solo palabras ≥4 letras y UNA única candidata).
  if (normalizado.length >= 4) {
    const candidatas = [...DICCIONARIO_CORRECTO].filter(
      (w) => w.length === normalizado.length && distanciaEdicion(w, normalizado) === 1
    );
    if (candidatas.length === 1) {
      return {
        original: token,
        corregida: candidatas[0],
        inicio: 0,
        fin: token.length,
        distancia: 1,
        segura: true,
      };
    }
  }

  return null;
}

/** Regiones a proteger dentro de una línea: código inline y URLs. */
function spansProtegidos(texto: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const re = /`[^`\n]*`|https?:\/\/\S+|www\.\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

function solapado(spans: Array<[number, number]>, inicio: number, fin: number): boolean {
  return spans.some(([s, e]) => inicio < e && fin > s);
}

/**
 * Corrige UNA línea del composer según el modo.
 *
 * - `off` / `sugerir`: el texto NO se modifica (en «sugerir» se devuelven las
 *   correcciones para subrayarlas).
 * - `auto`: se reemplazan en caliente solo las correcciones seguras.
 * Una línea que sea o contenga una valla de código (```/~~~) se respeta entera.
 */
export function corregirLinea(texto: string, modo: ModoAutocorrector = "sugerir"): ResultadoLinea {
  const original = texto ?? "";
  if (modo === "off" || original.trim() === "") {
    return { texto: original, correcciones: [] };
  }
  if (/```|~~~/.test(original)) {
    return { texto: original, correcciones: [] };
  }

  const protegidos = spansProtegidos(original);
  const correcciones: Correccion[] = [];
  const reToken = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = reToken.exec(original)) !== null) {
    const inicio = m.index;
    const fin = inicio + m[0].length;
    if (solapado(protegidos, inicio, fin)) continue;
    const res = corregirPalabra(m[0]);
    if (res) correcciones.push({ ...res, inicio, fin });
  }

  if (modo !== "auto") {
    return { texto: original, correcciones };
  }

  const aplicables = correcciones.filter((c) => c.segura);
  let textoFinal = original;
  // De derecha a izquierda: así reemplazar un token no mueve los índices de los
  // que están a su izquierda, y una corrección que parte «elarchivo» en dos
  // palabras no descoloca las demás.
  for (const c of [...aplicables].sort((a, b) => b.inicio - a.inicio)) {
    textoFinal = textoFinal.slice(0, c.inicio) + c.corregida + textoFinal.slice(c.fin);
  }
  return { texto: textoFinal, correcciones: aplicables };
}
