/**
 * metricasInferencia.ts — D8: LA MÉTRICA REAL DE LA INFERENCIA
 * ============================================================
 * El ROADMAP v8 lo dijo con nombre y apellido (decisión D8):
 *   «eval_count / prompt_eval_duration descartados — cero referencias en
 *    server.ts; el cliente sigue con len/4».
 *
 * Ollama YA manda la verdad en la última línea del stream:
 *   {"done":true,"eval_count":142,"eval_duration":4531000000,
 *    "prompt_eval_count":1830,"prompt_eval_duration":912000000,
 *    "load_duration":820000000,"total_duration":6270000000}
 * El cliente la veía pasar (`if (data.done) break;`) y la TIRABA. Después
 * «estimaba» los tokens contando de más (`tokenCount++` por línea, cuando una
 * línea NDJSON puede traer tres tokens o ninguno) y midiendo tk/s con esa
 * cuenta falsa. Un número medido y tirado no es un problema de datos: es un
 * problema de honestidad.
 *
 * Este módulo es la pieza pura: recibe el payload `done` (tal cual llegó del
 * motor) y devuelve números DEFENSIVOS — nanosegundos a milisegundos, basura
 * a cero, y `null` cuando no hay nada medido, para que el llamante diga
 * «estimado» en vez de inventar. La regla de la casa: mejor `null` honesto
 * que un número con buena pinta.
 *
 * Puro: sin DOM, sin red, sin dependencias. Navegador y Node lo comparten.
 */

export interface MetricasInferencia {
  /** Tokens de salida contados por el MOTOR (eval_count), no por nosotros. */
  tokensSalida: number;
  /** Tokens del prompt procesados por el motor (prompt_eval_count). */
  tokensEntrada?: number;
  /** ms de la fase de generación (eval_duration). */
  msGeneracion?: number;
  /** ms de la fase de pre-procesamiento del prompt (prompt_eval_duration). */
  msPrompt?: number;
  /** ms de carga del modelo en memoria (load_duration). */
  msCarga?: number;
  /** ms totales declarados por el motor (total_duration). */
  msTotal?: number;
  /** tokens/segundo DERIVADOS de tokensSalida y msGeneracion. */
  tokPorSegundo?: number;
  /** SIEMPRE true si este objeto existe: es medida, no estimación. */
  medida: true;
}

/**
 * Nanosegundos → milisegundos con la misma ley que `inferenceBuffer`:
 * los motores Ollama-like publican `*_duration` en NANOSEGUNDOS. Un valor
 * por debajo de 1e7 (10 ms) es creíble como ms ya dados; por encima, se
 * divide. La copia local es deliberada: importar el búfer traería su
 * cascada de parseo y este módulo debe seguir siendo la hoja más simple
 * del árbol. (Si la regla cambia, cambia en los dos — está dicho aquí.)
 */
function aMs(clave: string, valor: number): number | undefined {
  if (!Number.isFinite(valor) || valor < 0) return undefined;
  if (/_duration$/.test(clave)) return valor > 1e7 ? valor / 1e6 : valor;
  return valor;
}

function tokenEntero(valor: unknown): number | undefined {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return undefined;
  // 1e9 «tokens» es basura segura: ningún contexto existe con eso.
  if (valor > 1e9) return undefined;
  return Math.round(valor);
}

/**
 * Extrae la métrica REAL de un payload `done` de Ollama (o de cualquier motor
 * que use sus campos). Devuelve `null` cuando NO hay nada medido — el llamante
 * DEBE entonces mostrar «estimado», nunca un número inventado.
 */
export function extraerMetricasOllama(
  dato: Record<string, unknown> | null | undefined
): MetricasInferencia | null {
  if (!dato || typeof dato !== "object") return null;

  const tokensSalida = tokenEntero(dato.eval_count);
  if (tokensSalida === undefined) return null; // sin salida medida, no hay métrica

  const m: MetricasInferencia = { tokensSalida, medida: true };

  const tEntrada = tokenEntero(dato.prompt_eval_count);
  if (tEntrada !== undefined) m.tokensEntrada = tEntrada;

  const dur = (clave: string): number | undefined => {
    const v = dato[clave];
    return typeof v === "number" ? aMs(clave, v) : undefined;
  };

  const gen = dur("eval_duration");
  if (gen !== undefined) m.msGeneracion = Math.round(gen * 10) / 10;
  const pr = dur("prompt_eval_duration");
  if (pr !== undefined) m.msPrompt = Math.round(pr * 10) / 10;
  const ca = dur("load_duration");
  if (ca !== undefined) m.msCarga = Math.round(ca * 10) / 10;
  const to = dur("total_duration");
  if (to !== undefined) m.msTotal = Math.round(to * 10) / 10;

  // tk/s SOLO si la división tiene sentido: al menos un token y un milisegundo.
  if (m.msGeneracion && m.msGeneracion >= 1 && tokensSalida >= 1) {
    m.tokPorSegundo = Math.round((tokensSalida / (m.msGeneracion / 1000)) * 10) / 10;
  }

  return m;
}

/**
 * Cierra el `len/4` del cliente (ROADMAP D8): si hay medida del motor, manda
 * la medida; si no, la estimación de siempre — pero identificada como tal.
 */
export function tokensSalidaParaTurno(
  metrica: MetricasInferencia | null | undefined,
  texto: string
): { tokensOut: number; exacto: boolean } {
  if (metrica && metrica.tokensSalida > 0) {
    return { tokensOut: metrica.tokensSalida, exacto: true };
  }
  return { tokensOut: Math.max(0, Math.round((texto || "").length / 4)), exacto: false };
}

/** K/M compacto para una línea de resumen. */
function compacto(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function msCompacto(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/**
 * Una línea legible para el chat/log:
 *   «salida 142 tk · entrada 1.8k tk · 31.4 tk/s · carga 820 ms · total 6.3 s»
 * Lo que no llegó, simplemente no se nombra. `null` → cadena vacía: quien
 * no tiene medida que calle, no que muestre ceros.
 */
export function lineaMetricasCorta(m: MetricasInferencia | null | undefined): string {
  if (!m) return "";
  const partes: string[] = [`salida ${compacto(m.tokensSalida)} tk`];
  if (m.tokensEntrada !== undefined) partes.push(`entrada ${compacto(m.tokensEntrada)} tk`);
  if (m.tokPorSegundo !== undefined) partes.push(`${m.tokPorSegundo} tk/s`);
  if (m.msCarga !== undefined) partes.push(`carga ${msCompacto(m.msCarga)}`);
  if (m.msTotal !== undefined) partes.push(`total ${msCompacto(m.msTotal)}`);
  return partes.join(" · ");
}
