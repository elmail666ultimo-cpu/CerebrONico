/**
 * ttsErrores.ts — TRADUCIR EL ERROR DE VOZ A UNA FRASE (v1.13.0)
 * =============================================================
 * QUÉ ES: un clasificador puro de los errores que devuelve Gemini al pedir voz.
 * PARA QUÉ SIRVE: para que el usuario lea «se agotó la cuota de la API» en vez de
 * mil caracteres de JSON de Google dentro de un banner de la interfaz.
 *
 * EL PROBLEMA, TAL COMO SE VEÍA
 * Cuando la cuota de Gemini se agota (error 429 RESOURCE_EXHAUSTED), el SDK lanza
 * una excepción cuyo `message` es **el JSON entero de la respuesta de Google**:
 * código, mensaje, enlaces, cuotas, `retryDelay`… El servidor lo metía en `motivo`
 * y el cliente lo pintaba en el aviso de voz. El resultado era un cartel enorme
 * sobre la conversación que decía, en esencia, «no hay voz» — con el diagnóstico
 * escondido en medio de un volcado técnico y la explicación útil (que se usa la voz
 * del navegador) al final de todo.
 *
 * LAS DOS REGLAS QUE APLICA ESTE MÓDULO
 *   1. **Al usuario, la causa en una frase.** Clasificada, corta, sin JSON.
 *   2. **El detalle técnico no se tira: se manda al registro.** Nadie depura con un
 *      banner, pero el volcado original sí sirve para diagnosticar — así que viaja en
 *      `detalle`, recortado, y la interfaz lo escribe en la consola/registro.
 *
 * Y una tercera, que es la que ahorra tiempo y cuota: **no se reintenta lo que no va
 * a mejorar**. Una cuota agotada no se arregla insistiendo tres veces; una clave
 * inválida, tampoco. Reintentar ahí solo retrasa la caída a la voz del navegador y
 * gasta más cuota.
 */

export type ClaseErrorTTS = "cuota" | "clave" | "sin_audio" | "red" | "otro";

export interface ErrorTTSTraducido {
  clase: ClaseErrorTTS;
  /** Una frase, para el usuario. Sin JSON, sin códigos de Google. */
  motivo: string;
  /** ¿Tiene sentido volver a intentarlo? (falso = condición que no cambia sola) */
  reintentable: boolean;
}

/** El texto del error, sin depender de la forma que le haya dado el SDK. */
function textoDe(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  const e = err as any;
  return [e.message, e.status, e.statusText, e.code, e.name]
    .filter((x) => x !== undefined && x !== null)
    .map((x) => String(x))
    .join(" ");
}

/**
 * Traduce el error. El orden de las comprobaciones importa: un 429 con la palabra
 * «quota» es cuota (y es lo primero que hay que decir), no «error raro».
 */
export function clasificarErrorTTS(err: unknown): ErrorTTSTraducido {
  const t = textoDe(err).toLowerCase();

  if (/(\b429\b|resource_exhausted|quota|rate.?limit|exceeded your current)/.test(t)) {
    return {
      clase: "cuota",
      motivo: "se agotó la cuota de la API de Gemini (o se alcanzó su límite por minuto)",
      reintentable: false,
    };
  }
  if (/(api[_ -]?key[_ -]?invalid|\b401\b|\b403\b|permission_denied|invalid api key)/.test(t)) {
    return {
      clase: "clave",
      motivo: "la clave de Gemini no es válida o no tiene permiso para este modelo",
      reintentable: false,
    };
  }
  if (/no trajo audio|vino texto|no audio/.test(t)) {
    return {
      clase: "sin_audio",
      motivo: "Gemini devolvió texto en vez de audio (le pasa a veces; se reintenta)",
      reintentable: true,
    };
  }
  if (/(fetch failed|enotfound|etimedout|econnrefused|network|socket|timeout|abort)/.test(t)) {
    return {
      clase: "red",
      motivo: "no se pudo contactar con Gemini (red o tiempo agotado)",
      reintentable: true,
    };
  }
  return {
    clase: "otro",
    motivo: "Gemini rechazó la petición de voz",
    reintentable: true,
  };
}

/**
 * El detalle técnico, recortado, para el registro. Se queda con el principio, que
 * es donde van el código y el mensaje; el resto suele ser relleno repetido.
 */
export function recortarDetalle(err: unknown, max = 400): string {
  const t = textoDe(err).replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}… (recortado de ${t.length} caracteres)`;
}
