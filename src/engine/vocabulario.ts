/**
 * vocabulario.ts — LA CERTEZA, EN EL IDIOMA (v1.8.0)
 * ==================================================
 * QUÉ ES: el léxico del proyecto convertido en reglas ejecutables, más los tres
 * niveles de certeza con los que el motor tiene PERMITIDO hablar de su propio
 * trabajo.
 * PARA QUÉ SIRVE: para que «funciona» no se pueda escribir sin haberlo
 * ejecutado. No es un diccionario decorativo: es la puerta por la que pasa todo
 * texto que el motor produce sobre sí mismo (explicaciones de artefactos,
 * mensajes espontáneos, informes del Quirófano).
 *
 * EL PROBLEMA, DICHO CLARO
 * La regla de la casa ya era «creer solo lo verificado contra código». Pero una
 * regla no impide escribir la palabra «verificado» en un informe que nadie
 * ejecutó: eso lo impide el idioma. Aquí las palabras que AFIRMAN tienen un
 * nivel de certeza exigido, y `revisarVocabulario` devuelve los avisos cuando el
 * texto promete más de lo que la evidencia sostiene.
 *
 * LOS TRES NIVELES (y ninguno más, porque un cuarto se convierte en excusa):
 *   · "ejecutado"      — hay salida real de una ejecución (comando, suite, humo).
 *   · "leido"          — se ha leído el código, no se ha ejecutado. Es lo que más
 *                        abunda en este proyecto, y decirlo no es debilidad: es
 *                        precisión. Una lectura no detecta un error de ejecución.
 *   · "sin_verificar"  — ni leído ni ejecutado: una intención, un plan, un deseo.
 */
import type { Certeza } from "./certeza";
export type { Certeza };

/** Cómo se dice cada nivel en una frase corta, para pegarla al final de un texto. */
export const ETIQUETA_CERTEZA: Record<Certeza, string> = {
  ejecutado: "ejecutado (hay salida real)",
  leido: "solo leído: NO ejecutado",
  sin_verificar: "sin verificar",
};

/** Orden de fuerza: solo se puede AFIRMAR al nivel exigido o por encima. */
const FUERZA: Record<Certeza, number> = { sin_verificar: 0, leido: 1, ejecutado: 2 };

export function alcanza(certeza: Certeza, exigida: Certeza): boolean {
  return FUERZA[certeza] >= FUERZA[exigida];
}

/**
 * Palabras que AFIRMAN un resultado. Cada una dice qué nivel de certeza exige.
 * No están todas las palabras del idioma: están las que este proyecto usa para
 * dar por hecho algo, que son justo las que se escapan cuando hay prisa.
 */
export const AFIRMACIONES: { palabra: string; exigiria: Certeza; motivo: string }[] = [
  { palabra: "funciona", exigiria: "ejecutado", motivo: "afirma un resultado observado; una lectura no lo demuestra" },
  { palabra: "funcionando", exigiria: "ejecutado", motivo: "afirma estado observado en marcha" },
  { palabra: "verificado", exigiria: "ejecutado", motivo: "«verificado» aquí significa ejecutado; si solo se leyó, se dice «revisado»" },
  { palabra: "verificada", exigiria: "ejecutado", motivo: "«verificado» aquí significa ejecutado" },
  { palabra: "comprobado", exigiria: "ejecutado", motivo: "comprobar es ejecutar una comprobación, no leerla" },
  { palabra: "probado", exigiria: "ejecutado", motivo: "probar es ejecutar la prueba" },
  { palabra: "listo", exigiria: "ejecutado", motivo: "«listo» da por terminado algo que quizá solo se escribió" },
  { palabra: "terminado", exigiria: "ejecutado", motivo: "dar por terminado sin ejecutar es el error más caro" },
  { palabra: "completado", exigiria: "ejecutado", motivo: "dar por completado sin ejecutar" },
  { palabra: "funcional", exigiria: "ejecutado", motivo: "afirma funcionamiento" },
  { palabra: "soportado", exigiria: "ejecutado", motivo: "un límite «soportado» se demuestra subiéndolo, no estimándolo" },
  { palabra: "garantizado", exigiria: "ejecutado", motivo: "una garantía sin ejecución es una promesa" },
  { palabra: "sin errores", exigiria: "ejecutado", motivo: "solo una ejecución limpia puede afirmarlo" },
  { palabra: "0 fallos", exigiria: "ejecutado", motivo: "un recuento de fallos sale de una ejecución" },
];

export interface AvisoVocabulario {
  palabra: string;
  motivo: string;
  exigiria: Certeza;
  /** La frase que se puede escribir en su lugar, sin mentir. */
  alternativa: string;
}

const RE_ACENTOS = (s: string) => s.toLowerCase();

/** ¿Esta palabra se puede afirmar con este nivel de certeza? */
export function puedeAfirmar(palabra: string, certeza: Certeza): boolean {
  const p = RE_ACENTOS(palabra.trim());
  const regla = AFIRMACIONES.find((a) => a.palabra === p);
  if (!regla) return true; // no es una palabra que afirme un resultado
  return alcanza(certeza, regla.exigiria);
}

/**
 * Revisa un texto y devuelve los avisos: palabras que prometen más de lo que la
 * certeza disponible sostiene. Con "ejecutado" no devuelve nada — porque ahí sí
 * se puede afirmar.
 */
export function revisarVocabulario(texto: string, certeza: Certeza): AvisoVocabulario[] {
  if (alcanza(certeza, "ejecutado")) return [];
  const t = RE_ACENTOS(texto || "");
  const avisos: AvisoVocabulario[] = [];
  for (const regla of AFIRMACIONES) {
    if (t.includes(regla.palabra)) {
      avisos.push({
        palabra: regla.palabra,
        motivo: regla.motivo,
        exigiria: regla.exigiria,
        alternativa:
          certeza === "leido"
            ? "«revisado por lectura» (no ejecutado)"
            : "«pendiente de ejecutar» (sin verificar)",
      });
    }
  }
  return avisos;
}

/** La frase de certeza que se pega al final de cualquier afirmación del motor. */
export function fraseDeCerteza(certeza: Certeza, detalle?: string): string {
  const base = `Estado: ${ETIQUETA_CERTEZA[certeza]}`;
  return detalle ? `${base} — ${detalle}` : base;
}

/**
 * Envuelve un texto para que su certeza viaje CON él, y no se pierda al
 * copiarlo de un sitio a otro (que es como se pierde: el dato se copia, la
 * advertencia se queda atrás).
 */
export function conCerteza(texto: string, certeza: Certeza, detalle?: string): string {
  const avisos = revisarVocabulario(texto, certeza);
  if (avisos.length === 0) return `${texto} [${fraseDeCerteza(certeza, detalle)}]`;
  const corregido = avisos.reduce(
    (acc, a) => acc.replace(new RegExp(a.palabra, "gi"), a.alternativa),
    texto
  );
  return `${corregido} [${fraseDeCerteza(certeza, detalle)}]`;
}

// ══════════════════════════════════════════════════════════════════════════
// F1 · PARES FRECUENTES DEL AUTOCORRECTOR (v1.16.0)
// --------------------------------------------------------------------------
// Forma escrita tal cual → forma correcta. Solo entran correcciones NO
// ambiguas: la palabra corregida no compite con otra forma válida, y el par no
// depende de contexto. Las tildes/ñ «perdidas» NO viven aquí — las resuelve el
// diccionario de `autocorrector.ts` por emparejamiento sin tilde. Aquí van las
// que no son un simple acento: typos reales y palabras pegadas.
//
// Los dialectalismos («haiga»→«hecho») quedan FUERA a propósito: corregir un
// dialecto es corregir al usuario, no al texto. Ídem los homófonos ambiguos
// («aya»→¿haya/halla/allá/hay?): se sugieren en «sugerir», nunca en «auto».
// ══════════════════════════════════════════════════════════════════════════
export const PARES_FRECUENTES: Record<string, string> = {
  tambem: "también", // typo no acentual
  elarchivo: "el archivo", // palabra pegada
  lafuncion: "la función",
  talvez: "tal vez",
  derrepente: "de repente",
};
