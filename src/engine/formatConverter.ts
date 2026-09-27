/**
 * formatConverter.ts — CONVERSOR INTERNO, PORTABLE Y HONESTO (v2.2)
 * =================================================================
 * Convierte entre JSON, YAML, TOML y CSV en JavaScript puro (nada de pandoc,
 * nada de binarios externos): lo que hay aquí corre igual en el servidor, en el
 * sandbox y dentro del navegador.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REGLA QUE DEFINE ESTE MÓDULO
 * ─────────────────────────────────────────────────────────────────────────────
 * **Convertir no es lo difícil. Lo difícil es no mentir sobre lo que se perdió.**
 *
 *   JSON no admite comentarios  → YAML→JSON SIEMPRE pierde los comentarios
 *   YAML→JSON pierde anclas, alias y etiquetas
 *   TOML no tiene nulos         → JSON→TOML tiene que OMITIRLOS y decirlo
 *   CSV no tiene tipos          → todo lo que sale a CSV es texto
 *   CSV sólo entiende tablas    → lo anidado hay que aplanarlo y decirlo
 *   Los enteros > 2^53 pierden precisión al pasar por JSON
 *
 * Por eso TODA conversión devuelve, además del texto, un **informe de pérdidas**.
 * Si una conversión pierde algo y no lo declara, es un fallo; y el validador de
 * ida y vuelta (`tests/roundtrip.test.ts`) está escrito para cazarlo: distingue
 * «pérdida declarada» (correcto) de «pérdida silenciosa» (bug).
 *
 * Este módulo es LÓGICA PURA: no toca disco ni red.
 */

import * as YAML from "js-yaml";
import * as TOML from "smol-toml";

export type Formato = "json" | "yaml" | "toml" | "csv";

export const FORMATOS: Formato[] = ["json", "yaml", "toml", "csv"];

export interface OpcionesConversion {
  /** Espacios de sangría para JSON e YAML. */
  indentacion?: number;
  /** Ordena las claves alfabéticamente (útil para comparar y para diffs limpios). */
  ordenarClaves?: boolean;
  /** Separador de CSV: "," o ";". */
  separadorCsv?: string;
  /** Interpreta "1"/"true" de CSV como número/booleano (y lo declara). */
  inferirTiposCsv?: boolean;
}

// Sólo se declaran las opciones que están IMPLEMENTADAS. Hubo aquí un
// `anidadoEnCsv: "aplanar"` que no existía en el código: una opción en el tipo y
// no en la realidad es la misma promesa falsa que ya nos ha mordido en el
// catálogo de skills. Lo anidado se serializa como JSON en la celda, y se dice.
const OPCIONES_POR_DEFECTO: Required<OpcionesConversion> = {
  indentacion: 2,
  ordenarClaves: false,
  separadorCsv: ",",
  inferirTiposCsv: false,
};

/** Una pérdida CONCRETA, con nombre y detalle. No vale decir "algo se perdió". */
export interface Perdida {
  que: string;
  detalle: string;
}

export interface Informe {
  desde: Formato;
  hacia: Formato;
  perdidas: Perdida[];
  avisos: string[];
  bytesEntrada: number;
  bytesSalida: number;
  claves: number;
}

export interface Resultado {
  ok: boolean;
  /** El texto convertido. Si `ok` es false, viene vacío. */
  salida: string;
  informe: Informe;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de análisis
// ─────────────────────────────────────────────────────────────────────────────

function contarClaves(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((n, x) => n + contarClaves(x), 0);
  if (v && typeof v === "object") return Object.keys(v as object).length + Object.values(v as object).reduce((n: number, x) => n + contarClaves(x), 0);
  return 0;
}

/** Los enteros por encima de 2^53 ya no son exactos al pasar por JSON. */
function enterosImpracticables(v: unknown, ruta = "$"): string[] {
  const out: string[] = [];
  if (typeof v === "number" && Number.isInteger(v) && !Number.isSafeInteger(v)) out.push(ruta);
  else if (Array.isArray(v)) v.forEach((x, i) => out.push(...enterosImpracticables(x, `${ruta}[${i}]`)));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v as object)) out.push(...enterosImpracticables(x, `${ruta}.${k}`));
  return out;
}

function contarNulos(v: unknown): number {
  if (Array.isArray(v)) return v.reduce<number>((n, x) => n + contarNulos(x), 0);
  if (v && typeof v === "object") return Object.values(v as object).reduce<number>((n: number, x) => n + contarNulos(x), 0);
  return v === null ? 1 : 0;
}

function hayAnidado(v: unknown): boolean {
  const valor = (x: unknown): boolean => (Array.isArray(x) ? x.some(valor) : !!x && typeof x === "object" && Object.keys(x as object).length > 0);
  if (Array.isArray(v)) return v.some((fila) => fila && typeof fila === "object" && Object.values(fila as object).some(valor));
  if (v && typeof v === "object") return Object.values(v as object).some(valor);
  return false;
}

function hayAnidadoNoVacio(v: unknown): boolean {
  const valor = (x: unknown): boolean => (Array.isArray(x) ? x.length > 0 : !!x && typeof x === "object" && Object.keys(x as object).length > 0);
  if (Array.isArray(v)) return v.some((fila) => fila && typeof fila === "object" && Object.values(fila as object).some(valor));
  if (v && typeof v === "object") return Object.values(v as object).some(valor);
  return false;
}

/** Claves que no están en todas las filas: al pasar a CSV se rellenan. */
function clavesIrregulares(filas: Record<string, unknown>[]): string[] {
  if (filas.length === 0) return [];
  const todas = new Set<string>();
  filas.forEach((f) => Object.keys(f).forEach((k) => todas.add(k)));
  const faltan = new Set<string>();
  filas.forEach((f) => todas.forEach((k) => { if (!(k in f)) faltan.add(k); }));
  return [...faltan];
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura y escritura por formato
// ─────────────────────────────────────────────────────────────────────────────

function leer(texto: string, desde: Formato, op: Required<OpcionesConversion>): unknown {
  switch (desde) {
    case "json":
      return JSON.parse(texto);
    case "yaml": {
      const v = YAML.load(texto);
      return v === undefined ? null : v;
    }
    case "toml":
      return TOML.parse(texto);
    case "csv":
      return csvALeer(texto, op);
    default:
      throw new Error(`Formato de entrada no soportado: ${desde}`);
  }
}

/**
 * CSV RFC 4180: comillas dobles, comas y saltos dentro de comillas.
 *
 * v2.1 — La firma decía `Record<string, string>[]` y era MENTIRA: `inferir()`
 * devuelve `unknown`, porque con `inferirTiposCsv` una celda «42» sale como
 * número y «true» como booleano. El tipo declarado no se correspondía con lo que
 * la función devuelve de verdad. Se declara lo que es.
 */
function csvALeer(texto: string, op: Required<OpcionesConversion>): Record<string, unknown>[] {
  const sep = op.separadorCsv;
  const filas: string[][] = [];
  let campo = "";
  let fila: string[] = [];
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else entreComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') {
      entreComillas = true;
    } else if (c === sep) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else if (c !== "\r") {
      campo += c;
    }
  }
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  const noVacias = filas.filter((f) => !(f.length === 1 && f[0].trim() === ""));
  if (noVacias.length === 0) return [];
  const cabeceras = noVacias[0].map((h) => h.trim());
  return noVacias.slice(1).map((f) => {
    const obj: Record<string, unknown> = {};
    cabeceras.forEach((h, i) => (obj[h] = inferir(f[i] ?? "", op.inferirTiposCsv)));
    return obj;
  });
}

function inferir(v: string, activo: boolean): unknown {
  if (!activo) return v;
  const t = v.trim();
  if (t === "") return "";
  if (/^-?\d+$/.test(t) && Number.isSafeInteger(Number(t))) return Number(t);
  if (/^-?\d*\.\d+$/.test(t)) return Number(t);
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === "true";
  return v;
}

function csvAEscribir(valor: unknown, op: Required<OpcionesConversion>, perdidas: Perdida[]): string {
  const filas: Record<string, unknown>[] = Array.isArray(valor)
    ? (valor as unknown[]).map((v) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : { valor: v }))
    : valor && typeof valor === "object"
    ? [valor as Record<string, unknown>]
    : [{ valor: valor }];

  if (Array.isArray(valor) && (valor as unknown[]).some((v) => Array.isArray(v))) {
    perdidas.push({ que: "estructura", detalle: "había listas dentro de la lista; cada elemento se ha volcado en una columna llamada «valor»." });
  }

  const cabeceras = [...new Set(filas.flatMap((f) => Object.keys(f)))];
  const faltantes = clavesIrregulares(filas);
  if (faltantes.length > 0) {
    perdidas.push({ que: "filas incompletas", detalle: `no todas las filas traían las mismas claves (${faltantes.join(", ")}); las celdas que faltaban quedan vacías.` });
  }

  let celdasAnidadas = 0;
  const escapar = (v: unknown): string => {
    let s: string;
    if (v === undefined || v === null) s = "";
    else if (typeof v === "object") {
      celdasAnidadas++;
      s = JSON.stringify(v);
    } else s = String(v);
    return /["\n\r]/.test(s) || s.includes(op.separadorCsv) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lineas = [cabeceras.map(escapar).join(op.separadorCsv), ...filas.map((f) => cabeceras.map((k) => escapar(f[k])).join(op.separadorCsv))];

  if (celdasAnidadas > 0) {
    perdidas.push({
      que: "estructuras anidadas en CSV",
      detalle: `${celdasAnidadas} celda(s) contenían objetos o listas y se han escrito como JSON dentro de la celda; al volver, serán texto.`,
    });
  }
  return lineas.join("\n");
}

function escribir(valor: unknown, hacia: Formato, op: Required<OpcionesConversion>, perdidas: Perdida[], avisos: string[]): string {
  switch (hacia) {
    case "json":
      return JSON.stringify(ordenarSiToca(valor, op), null, op.indentacion);
    case "yaml":
      return YAML.dump(ordenarSiToca(valor, op), { indent: op.indentacion, lineWidth: 120, noRefs: true });
    case "toml": {
      const limpio = quitarNulos(valor, perdidas, "$");
      if (Array.isArray(limpio)) {
        perdidas.push({ que: "raíz", detalle: "TOML no admite una lista como raíz del documento; se ha envuelto en la clave «items»." });
        return TOML.stringify({ items: limpio } as never);
      }
      if (!limpio || typeof limpio !== "object") throw new Error("TOML necesita un objeto en la raíz del documento.");
      return TOML.stringify(limpio as never);
    }
    case "csv":
      return csvAEscribir(valor, op, perdidas);
    default:
      throw new Error(`Formato de salida no soportado: ${hacia}`);
  }
}

function ordenarSiToca(v: unknown, op: Required<OpcionesConversion>): unknown {
  if (!op.ordenarClaves) return v;
  if (Array.isArray(v)) return v.map((x) => ordenarSiToca(x, op));
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) o[k] = ordenarSiToca((v as Record<string, unknown>)[k], op);
    return o;
  }
  return v;
}

/** TOML no tiene nulos: se omiten, y se dice cuántos y dónde. */
function quitarNulos(v: unknown, perdidas: Perdida[], ruta: string): unknown {
  if (Array.isArray(v)) return v.map((x, i) => quitarNulos(x, perdidas, `${ruta}[${i}]`));
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    let quitados = 0;
    for (const [k, x] of Object.entries(v as object)) {
      if (x === null || x === undefined) {
        quitados++;
        continue;
      }
      o[k] = quitarNulos(x, perdidas, `${ruta}.${k}`);
    }
    if (quitados > 0) {
      perdidas.push({
        que: "valores nulos",
        detalle: `TOML no tiene nulos: se han OMITIDO ${quitados} en «${ruta}». Si al volver faltan claves, es por esto — no es un fallo de la conversión.`,
      });
    }
    return o;
  }
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Análisis de pérdidas del ORIGEN (lo que ya se pierde al leer)
// ─────────────────────────────────────────────────────────────────────────────

function perdidasDelOrigen(texto: string, desde: Formato, hacia: Formato): Perdida[] {
  const p: Perdida[] = [];
  if (desde === hacia) return p;

  if (desde === "yaml") {
    const comentarios = (texto.match(/(^|\s)#[^\n]*/g) || []).length;
    const anclas = (texto.match(/(^|\s)&\w+/g) || []).length;
    const alias = (texto.match(/(^|\s)\*\w+/g) || []).length;
    if (comentarios > 0) p.push({ que: "comentarios", detalle: `el YAML traía ${comentarios} comentario(s) y ${hacia.toUpperCase()} no los admite: se pierden.` });
    if (anclas > 0 || alias > 0)
      p.push({ que: "anclas y alias", detalle: `el YAML usaba ${anclas} ancla(s) y ${alias} alias; se han expandido a valores repetidos (el contenido se conserva, la referencia no).` });
  }

  if (desde === "toml") {
    const comentarios = (texto.match(/(^|\s)#[^\n]*/g) || []).length;
    if (comentarios > 0) p.push({ que: "comentarios", detalle: `el TOML traía ${comentarios} comentario(s) y ${hacia.toUpperCase()} no los admite: se pierden.` });
    const fechas = (texto.match(/\d{4}-\d{2}-\d{2}(T[\d:.]+)?/g) || []).length;
    if (fechas > 0 && hacia !== "toml")
      p.push({ que: "fechas", detalle: `${fechas} valor(es) con forma de fecha: TOML los tipa como fecha y al salir quedan como texto ISO.` });
  }

  if (desde === "csv") {
    p.push({ que: "tipos", detalle: "CSV no guarda tipos: todo lo que venía de CSV es texto (salvo que se active la inferencia, y entonces se avisa)." });
  }

  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

export function convertir(texto: string, desde: Formato, hacia: Formato, opciones: OpcionesConversion = {}): Resultado {
  const op = { ...OPCIONES_POR_DEFECTO, ...opciones };
  const informe: Informe = { desde, hacia, perdidas: [], avisos: [], bytesEntrada: texto.length, bytesSalida: 0, claves: 0 };
  try {
    const valor = leer(texto, desde, op);
    informe.perdidas.push(...perdidasDelOrigen(texto, desde, hacia));
    informe.claves = contarClaves(valor);

    // Avisos que valen para cualquier destino.
    const inseguros = enterosImpracticables(valor);
    if (inseguros.length > 0) {
      informe.avisos.push(
        `${inseguros.length} número(s) superan 2^53 y ya no son exactos (${inseguros.slice(0, 3).join(", ")}${inseguros.length > 3 ? "…" : ""}).`
      );
    }
    if (hacia === "toml" && contarNulos(valor) > 0 && !informe.perdidas.some((x) => x.que === "valores nulos")) {
      // quitarNulos() añadirá el detalle exacto; aquí sólo se deja constancia previa.
    }
    if (hacia === "csv" && hayAnidadoNoVacio(valor)) {
      informe.avisos.push("había estructuras anidadas: en CSV no caben como tales y se han serializado en la celda (se detalla en las pérdidas).");
    }
    if (op.inferirTiposCsv && desde === "csv") {
      informe.avisos.push("la inferencia de tipos está ACTIVA: «1» pasa a número y «true» a booleano. Al volver a CSV cambiarán de forma (1 → \"1\").");
    }

    const salida = escribir(valor, hacia, op, informe.perdidas, informe.avisos);
    informe.bytesSalida = salida.length;
    return { ok: true, salida, informe };
  } catch (e: any) {
    return {
      ok: false,
      salida: "",
      informe,
      error: `No se pudo convertir ${desde} → ${hacia}: ${e?.message || e}`,
    };
  }
}

/** Compara dos valores ignorando el ORDEN de las claves (que no es un dato). */
export function comparar(a: unknown, b: unknown, ruta = "$"): string[] {
  const dif: string[] = [];
  const tipo = (x: unknown) => (x === null ? "null" : Array.isArray(x) ? "lista" : typeof x);
  if (tipo(a) !== tipo(b)) {
    dif.push(`${ruta}: tipo ${tipo(a)} → ${tipo(b)}`);
    return dif;
  }
  if (Array.isArray(a)) {
    if (a.length !== (b as unknown[]).length) dif.push(`${ruta}: lista de ${a.length} → ${(b as unknown[]).length}`);
    a.forEach((x, i) => dif.push(...comparar(x, (b as unknown[])[i], `${ruta}[${i}]`)));
    return dif;
  }
  if (a && typeof a === "object") {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    const faltan = ka.filter((k) => !kb.includes(k));
    const sobran = kb.filter((k) => !ka.includes(k));
    if (faltan.length) dif.push(`${ruta}: faltan claves al volver: ${faltan.join(", ")}`);
    if (sobran.length) dif.push(`${ruta}: aparecen claves nuevas: ${sobran.join(", ")}`);
    for (const k of ka.filter((k) => kb.includes(k))) dif.push(...comparar((a as any)[k], (b as any)[k], `${ruta}.${k}`));
    return dif;
  }
  if (a !== b) dif.push(`${ruta}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  return dif;
}

export interface ResultadoIdaYVuelta {
  ok: boolean;
  /** ¿Volvió exactamente lo mismo? */
  igual: boolean;
  diferencias: string[];
  /** Lo que la ida declaró que se perdería. */
  perdidasDeclaradas: Perdida[];
  avisos: string[];
  error?: string;
}

/**
 * Ida y vuelta: A → B → A. Es la prueba de fuego de un conversor.
 *
 * Y ojo con la interpretación del resultado, que es donde está el valor:
 *   · `igual: true`                      → perfecto.
 *   · `igual: false` + pérdidas declaradas → correcto: se sabía y se dijo.
 *   · `igual: false` + SIN pérdidas        → **FALLO**: pérdida silenciosa.
 */
export function idaYVuelta(texto: string, a: Formato, b: Formato, opciones: OpcionesConversion = {}): ResultadoIdaYVuelta {
  const ida = convertir(texto, a, b, opciones);
  if (!ida.ok) return { ok: false, igual: false, diferencias: [], perdidasDeclaradas: [], avisos: [], error: ida.error };
  const vuelta = convertir(ida.salida, b, a, opciones);
  if (!vuelta.ok) return { ok: false, igual: false, diferencias: [], perdidasDeclaradas: ida.informe.perdidas, avisos: ida.informe.avisos, error: vuelta.error };

  let original: unknown;
  let final: unknown;
  try {
    original = leer(texto, a, { ...OPCIONES_POR_DEFECTO, ...opciones });
    final = leer(vuelta.salida, a, { ...OPCIONES_POR_DEFECTO, ...opciones });
  } catch (e: any) {
    return { ok: false, igual: false, diferencias: [], perdidasDeclaradas: ida.informe.perdidas, avisos: [], error: `No se pudo comparar: ${e?.message || e}` };
  }

  const diferencias = comparar(original, final);
  return {
    ok: true,
    igual: diferencias.length === 0,
    diferencias,
    perdidasDeclaradas: [...ida.informe.perdidas, ...vuelta.informe.perdidas],
    avisos: [...ida.informe.avisos, ...vuelta.informe.avisos],
  };
}
