/**
 * certezaModelo.ts — LA CERTEZA LLEGA AL TEXTO DEL MODELO (v1.14.0)
 * =================================================================
 * QUÉ ES: el punto único por el que pasa todo texto GENERADO POR EL MODELO antes
 * de mostrarse o guardarse.
 * PARA QUÉ SIRVE: para que la certeza deje de depender de que el modelo sea
 * prudente. Hasta la v1.13.0, `revisarVocabulario` solo vigilaba lo que el MOTOR
 * dice de sí mismo (explicaciones de artefactos, mensajes espontáneos, informes
 * del Quirófano). El texto que escribe el modelo —lo que se lee en el chat—
 * seguía sin pasar por el revisor: podía decir «funciona» o «verificado» sin que
 * nada lo parara, y para el usuario sonaba igual que un informe con la puerta
 * ejecutada detrás. Este módulo es esa mitad que faltaba.
 *
 * REUTILIZA EL REVISOR QUE YA EXISTE
 * No hay un segundo catálogo de palabras: dos listas divergen siempre. Se usa
 * `revisarVocabulario` (las 14 palabras de AFIRMACIONES) y la certeza se deduce
 * con `certezaDe`. Lo único NUEVO es la regla de dónde NO se mira: dentro de los
 * bloques de código no se revisa ni se reescribe, porque reescribir código sería
 * un destrozo, no una mejora.
 */
import { certezaDe, type Certeza } from "./certeza";
import { revisarVocabulario, fraseDeCerteza, type AvisoVocabulario } from "./vocabulario";

/** Lo que el motor SABE de una respuesta concreta (¿se ejecutó algo? ¿se leyó?). */
export interface EvidenciaModelo {
  /** true SOLO si hay salida real de una ejecución (comando, suite, humo). */
  ejecutado?: boolean;
  /** true si se leyó el código o su documentación. */
  leido?: boolean;
}

export interface RevisionSalida {
  /** El texto corregido: las afirmaciones sin evidencia, reescritas sin mentir. */
  texto: string;
  /** Las palabras que prometían más de lo que la evidencia sostiene. */
  avisos: AvisoVocabulario[];
  /** El nivel de certeza de esta salida (ejecutado / leido / sin_verificar). */
  certeza: Certeza;
}

/**
 * Bloques de código: vallas ```/~~~ (con o sin lenguaje) y spans en línea `…`.
 * Dentro de ellos no se revisa nada: una palabra «funciona» en una cadena o en
 * un comentario no es una afirmación del modelo, es material a preservar.
 */
const RE_CODIGO = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`/g;

/** Escapa un literal para usarlo como patrón de búsqueda, no como reemplazo. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * EL REVISOR DE SALIDA DEL MODELO.
 *
 * `evidencia` es la clave: lo que el motor SABE de esa respuesta. Sin evidencia
 * la certeza es `sin_verificar` (o `leido` si se declara una lectura), y toda
 * palabra que afirme un resultado se reescribe con su alternativa honesta. Con
 * evidencia de ejecución no se toca ni un carácter: el revisor no puede
 * convertirse en un detector de pesimismo.
 */
export function revisarSalida(texto: string, evidencia: EvidenciaModelo = {}): RevisionSalida {
  const certeza = certezaDe(evidencia);
  const original = texto ?? "";

  // Con ejecución real se puede afirmar: no hay nada que vigilar.
  if (certeza === "ejecutado") return { texto: original, avisos: [], certeza };

  // Se protegen los bloques de código: dentro no se revisa ni se reescribe.
  const bloques: string[] = [];
  const protegido = original.replace(RE_CODIGO, (m) => {
    bloques.push(m);
    return `\u0000C${bloques.length - 1}\u0000`;
  });

  const avisos = revisarVocabulario(protegido, certeza);
  if (avisos.length === 0) return { texto: original, avisos: [], certeza };

  // Se reescriben las afirmaciones, de más larga a más corta. «funcionando» y
  // «funcional» CONTIENEN «funciona», y «comprobado» contiene «probado»: si se
  // sustituyera la corta primero, se destrozaría la larga. El orden por longitud
  // evita ese destrozo.
  const ordenadas = [...avisos].sort((a, b) => b.palabra.length - a.palabra.length);
  let corregido = protegido;
  for (const a of ordenadas) {
    corregido = corregido.replace(new RegExp(escapeRegExp(a.palabra), "gi"), a.alternativa);
  }

  const textoFinal = corregido.replace(/\u0000C(\d+)\u0000/g, (_m, i) => bloques[Number(i)]);
  return { texto: textoFinal, avisos, certeza };
}

/**
 * El marcado que viaja EN el texto (no en un banner): una línea corta que dice
 * el nivel de certeza y qué palabras prometían de más. La usa el camino del chat
 * para que la respuesta no pueda sonar más segura de lo que es.
 *
 * `conExplicacion` añade la frase que enseña, UNA vez por conversación, qué
 * significa la marca (regla R2 de la voz: lo ya dicho no se repite). Después la
 * marca va sola: un aviso en cada mensaje es un aviso que se aprende a ignorar.
 */
export function marcaDeSalida(revision: RevisionSalida, conExplicacion = false): string {
  const palabras = revision.avisos.map((a) => `«${a.palabra}»`).join(", ");
  const base = `${fraseDeCerteza(revision.certeza)} — la respuesta afirma ${palabras} sin una ejecución que lo respalde`;
  return conExplicacion
    ? `\n\n[⚠️ CerebróNico no verifica lo que afirma el modelo: ${base}]`
    : `\n\n[${base}]`;
}

// ══════════════════════════════════════════════════════════════════════════
// F2 · CABECERA MÍNIMA DETERMINISTA (v1.16.0)
// --------------------------------------------------------------------------
// Si el modelo entrega un bloque ```lenguaje file="ruta" SIN la línea que
// explica qué es (sobre todo en micro-modelos), el motor añade él mismo una
// cabecera mínima con el nombre del archivo. Determinista: no se le pide nada
// al modelo, se escribe la ruta que ya estaba en la valla.
// ══════════════════════════════════════════════════════════════════════════
export function asegurarCabeceraArchivo(md: string): string {
  const texto = String(md ?? "");
  const re = /```[^\n`]*\bfile\s*=\s*"([^"\n]*)"/g;
  let resultado = "";
  let cursor = 0;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(texto)) !== null) {
    const ruta = m[1];
    const antesDeValla = texto.slice(cursor, m.index);
    // La cabecera es la ÚLTIMA línea antes de la valla: hay que saltar el \n
    // que la cierra, no quedarse con la parte vacía que hay detrás de él.
    const finUltimo = antesDeValla.lastIndexOf("\n");
    const inicioLinea = antesDeValla.lastIndexOf("\n", finUltimo - 1) + 1;
    const linea = antesDeValla.slice(inicioLinea).trim();
    const tieneCabecera = linea !== "" && !/^```/.test(linea) && !/^~~~/.test(linea);
    resultado += antesDeValla;
    if (!tieneCabecera) {
      resultado += `**${ruta}** — entregado por el motor\n`;
    }
    resultado += m[0];
    cursor = m.index + m[0].length;
  }
  resultado += texto.slice(cursor);
  return resultado;
}
