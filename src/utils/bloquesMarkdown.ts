/**
 * bloquesMarkdown.ts — LAS VALLAS NO SE COMEN EL MENSAJE
 * ======================================================
 * 🐞 EL FALLO, visto y oído: la voz decía «bloque de código omitido» y el audio
 * se cortaba. El mensaje del modelo era un documento de patente entero envuelto
 * en una valla:
 *
 *     ``` text file="documentacion/memoria-patente-ampliada.txt"
 *     1. TÍTULO DE LA INVENCIÓN: …
 *     ```
 *
 * Y `cleanTextForSpeech` reemplazaba LA VALLA ENTERA —contenido incluido— por la
 * frase «(bloque de código omitido)». Si el mensaje entero va dentro de una
 * valla, lo que queda para leer es esa frase: de ahí que el audio se cortara.
 *
 * La distinción que faltaba: una valla con `text`, `markdown` o `file="…"` NO es
 * código, es un DOCUMENTO. Su contenido es el mensaje y hay que leerlo.
 *
 * Y una segunda regla, de forma: el código de verdad no se lee — pero en
 * SILENCIO. Anunciarlo en voz alta es peor que callarlo, porque el usuario oye
 * una disculpa en lugar de su respuesta.
 */

/** Lenguajes cuyo contenido es prosa: se conserva y se lee. */
export const LENGUAJES_DOCUMENTO = [
  "",
  "text",
  "txt",
  "plaintext",
  "markdown",
  "md",
  "log",
  "csv",
  "json",
  "yaml",
  "yml",
  "xml",
  "html",
  "tex",
] as const;

/** ¿La cabecera de la valla describe un documento y no código? */
export function esBloqueDocumento(info: string): boolean {
  const cabecera = String(info ?? "").toLowerCase();
  // `file="…"` es un rótulo de documento en toda regla, sea cual sea el idioma.
  if (/file\s*=/.test(cabecera)) return true;
  const lenguaje = (cabecera.trim().split(/\s+/)[0] ?? "").replace(/[^a-z0-9+#]/g, "");
  return (LENGUAJES_DOCUMENTO as readonly string[]).includes(lenguaje);
}

export interface OpcionesVallas {
  /** Qué hacer con un bloque que SÍ es código. */
  codigo: "callar" | "nota";
}

/**
 * Quita las vallas sin comerse lo que hay dentro.
 *
 * - Bloque de documento → se devuelve su cuerpo (sin las líneas de valla).
 * - Bloque de código    → `callar` (nada) o `nota` (el aviso, para exportar).
 * - Valla sin cerrar    → se trata como documento: es lo que hay.
 */
export function quitarVallasConservandoTexto(md: string, opciones: OpcionesVallas): string {
  const { codigo } = opciones;
  return String(md ?? "").replace(
    /```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g,
    (_todo, info: string, cuerpo: string) => {
      if (esBloqueDocumento(info)) return `\n${cuerpo}\n`;
      return codigo === "nota" ? "\n_(bloque de código omitido)_\n" : " ";
    }
  );
}

// ══════════════════════════════════════════════════════════════════════════
// F2 · LA ENTREGA DE CÓDIGO SIEMPRE EXPLICADA (v1.16.0)
// --------------------------------------------------------------------------
// Un bloque ```lenguaje file="ruta" DEBE venir precedido de una línea que diga
// qué es y dónde vive, y seguido de una frase que diga para qué sirve. Si el
// modelo lo entrega mudo, el guardián lo anota con un chip gris en vez de
// dejarlo pasar en silencio. Un snippet SIN `file=` no se vigila: no es una
// entrega de archivo, es un ejemplo.
// ══════════════════════════════════════════════════════════════════════════

export const CHIP_SIN_EXPLICACION = "⚠ sin explicación";

/** ¿Esta línea es prosa descriptiva (y no una valla o un chip anterior)? */
function esLineaDescriptiva(linea: string): boolean {
  const t = linea.trim();
  if (t === "") return false;
  if (/^```/.test(t) || /^~~~/.test(t)) return false;
  if (t.includes(CHIP_SIN_EXPLICACION)) return false;
  return true;
}

/** Línea completa inmediatamente ANTES de la posición dada (la valla). */
function lineaAntes(texto: string, pos: number): string {
  // La valla arranca justo después del \n que cierra la línea anterior. Ese
  // salto está en pos-1; la cabecera es lo que hay entre el salto ANTERIOR y él.
  const finAnterior = texto.lastIndexOf("\n", pos - 1);
  if (finAnterior === -1) return "";
  const inicioAnterior = texto.lastIndexOf("\n", finAnterior - 1);
  return texto.slice(inicioAnterior + 1, finAnterior).trim();
}

/** Línea completa inmediatamente DESPUÉS de la posición dada. */
function lineaDespues(texto: string, pos: number): string {
  const finLinea = texto.indexOf("\n", pos);
  if (finLinea === -1) return "";
  const inicioSiguiente = finLinea + 1;
  const finSiguiente = texto.indexOf("\n", inicioSiguiente);
  const limite = finSiguiente === -1 ? texto.length : finSiguiente;
  return texto.slice(inicioSiguiente, limite).trim();
}

/**
 * Anota con un chip gris los bloques ```file="…"``` que NO tienen explicación
 * adyacente (ni cabecera arriba ni frase debajo). Devuelve el mismo texto con
 * los chips añadidos; si todo está explicado, no cambia nada.
 */
export function anotarBloquesSinExplicacion(md: string): string {
  const texto = String(md ?? "");
  const re = /```[^\n`]*\bfile\s*=\s*"[^"\n]*"[^\n`]*\n[\s\S]*?\n```[ \t]*/g;
  const bloques: Array<{ inicio: number; fin: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    bloques.push({ inicio: m.index, fin: m.index + m[0].length });
  }
  if (bloques.length === 0) return texto;

  let resultado = "";
  let cursor = 0;
  for (const b of bloques) {
    const cabecera = esLineaDescriptiva(lineaAntes(texto, b.inicio));
    const fiesta = esLineaDescriptiva(lineaDespues(texto, b.fin));
    resultado += texto.slice(cursor, b.fin);
    if (!cabecera && !fiesta) resultado += `\n${CHIP_SIN_EXPLICACION}`;
    cursor = b.fin;
  }
  resultado += texto.slice(cursor);
  return resultado;
}
