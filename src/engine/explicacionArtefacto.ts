/**
 * explicacionArtefacto.ts — UNA FRASE POR ARTEFACTO, CON SU CERTEZA (v1.8.0)
 * ==========================================================================
 * QUÉ ES: el módulo que produce, para cualquier fichero tocado, una frase que
 * dice QUÉ es, PARA QUÉ sirve y SI ESTÁ EJECUTADO O NO.
 * PARA QUÉ SIRVE: para que nunca más haya que preguntar «¿esto qué es y has
 * probado que va?». La respuesta viaja pegada al artefacto.
 *
 * POR QUÉ ES DETERMINISTA Y NO LE PIDE LA FRASE A UN MODELO
 * Podría redactarla el modelo. No se hace, y el motivo es de fondo: si la frase
 * la escribe quien quiere que suene bien, la frase acaba sonando bien aunque el
 * trabajo esté a medias — que es exactamente cómo un proyecto empieza a
 * mentirse. Aquí el «qué» y el «para qué» se EXTRAEN de lo que el fichero ya
 * declara en su cabecera (convención de la casa: `nombre.ext — PROPÓSITO`), y el
 * «ejecutado» se toma de la evidencia que traiga quien llama. Si la cabecera no
 * declara propósito, se dice que no lo declara — con la misma naturalidad con la
 * que se dice un dato bueno.
 *
 * FORMATO DE LA FRASE (una sola, siempre la misma forma):
 *   <ruta> — <qué es>: <para qué sirve>. Estado: <nivel de certeza>.
 * Y si la cabecera del fichero afirma «verificado» sin ejecución detrás, el
 * propio módulo lo detecta y lo cuenta en `avisos`. El sistema se audita a sí
 * mismo con el mismo rasero que audita lo demás.
 */
import { certezaDe, type Certeza } from "./certeza";
import { ETIQUETA_CERTEZA, revisarVocabulario, type AvisoVocabulario } from "./vocabulario";

export interface EntradaArtefacto {
  /** Ruta relativa al proyecto (ej. "src/engine/fondo.ts"). */
  ruta: string;
  /** Contenido del fichero, si se tiene. Sin contenido no hay «qué» ni «para qué». */
  contenido?: string;
  /** true SOLO si hay salida real de una ejecución (suite, humo, comando). */
  ejecutado?: boolean;
  /** Detalle humano de esa ejecución: «64 suites, 0 fallos», etc. */
  evidencia?: string[];
}

export interface ExplicacionArtefacto {
  ruta: string;
  /** Qué es (tipo de artefacto y, si lo declara, su título). */
  que: string;
  /** Para qué sirve, extraído de su cabecera o declarado ausente. */
  para: string;
  /** De dónde salió el «para qué»: cabecera del fichero o ausencia declarada. */
  origenDelProposito: "cabecera" | "ausente";
  estado: Certeza;
  ejecutado: boolean;
  /** LA frase: una oración, completa y sin adornos. */
  frase: string;
  evidencia: string[];
  /** Si el propio fichero se atribuye más certeza de la que tiene. */
  avisos: AvisoVocabulario[];
}

/** Qué clase de artefacto es, por su ruta. Determinista y en voz alta. */
export function clasificarQue(ruta: string): string {
  const r = (ruta || "").replace(/\\/g, "/").toLowerCase();
  if (/\.(md|txt)$/.test(r)) return "documento";
  if (r.endsWith(".py")) return "módulo Python (puente del agente PC)";
  if (/\.(bat|cmd)$/.test(r)) return "guion de arranque de Windows";
  if (/(^|\/)tests?\//.test(r) || /\.test\.tsx?$/.test(r)) return "prueba automática";
  if (/(^|\/)scripts\//.test(r)) return "guion de herramientas del proyecto";
  if (/(^|\/)components\//.test(r)) return "componente de interfaz";
  if (/(^|\/)engine\//.test(r)) return "módulo de motor (lógica determinista)";
  if (/(^|\/)utils\//.test(r)) return "utilidad compartida";
  if (r.endsWith("server.ts")) return "servidor de la IDE (proceso principal)";
  if (r.endsWith(".tsx")) return "componente/página de interfaz";
  if (r.endsWith(".ts")) return "módulo TypeScript";
  if (r.endsWith(".json")) return "fichero de datos o configuración";
  return "artefacto del proyecto";
}

/**
 * Extrae el propósito de la cabecera. Dos convenciones de la casa, por orden:
 *   1. `nombre.ext — PROPÓSITO`     (la clásica, con guion largo)
 *   2. `QUÉ ES: ...` / `PARA QUÉ SIRVE: ...` (la que usan los módulos v1.8.0)
 * Se mira solo la cabecera (primeras 45 líneas): buscar en todo el fichero
 * encontraría un comentario de ejemplo y lo tomaría por propósito.
 */
export function propositoDeCabecera(contenido: string | undefined): string | null {
  if (!contenido) return null;
  const lineas = contenido.split("\n").slice(0, 45);

  for (const l of lineas) {
    const m = /^[\s*/#!"']*([\w.-]+\.(?:ts|tsx|py|mjs|js|json|md|bat))\s*[—–-]\s*(.+?)\s*$/i.exec(l);
    if (m && m[2].length > 8) return m[2].replace(/[*/]+$/, "").trim();
  }
  for (const l of lineas) {
    const m = /PARA QU[ÉE] SIRVE:\s*(.+?)\s*$/i.exec(l);
    if (m && m[1].length > 8) return m[1].replace(/[*/]+$/, "").trim();
  }
  return null;
}

/** El título corto de la cabecera, si lo hay (`nombre.ext — TÍTULO`). */
export function tituloDeCabecera(contenido: string | undefined): string | null {
  if (!contenido) return null;
  const primeras = contenido.split("\n").slice(0, 6).join("\n");
  const m = /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 ,.:()/-]{6,80})/.exec(primeras);
  return m ? m[1].trim() : null;
}

/**
 * LA función: una frase por artefacto.
 *
 * `ejecutado` es la única entrada que concede el nivel «ejecutado», y no se
 * deduce de nada: si quien llama no lo afirma con evidencia, el artefacto se
 * explica como leído o sin verificar. Es la diferencia entre informar y vender.
 */
export function explicarArtefacto(entrada: EntradaArtefacto): ExplicacionArtefacto {
  const ruta = (entrada.ruta || "?").replace(/\\/g, "/");
  const contenido = entrada.contenido;
  const que = clasificarQue(ruta);
  const titulo = tituloDeCabecera(contenido);
  const propositoExtraido = propositoDeCabecera(contenido);
  const para =
    propositoExtraido ??
    "no declara su propósito en la cabecera (conviene añadirlo: es lo que permite explicarlo sin leerlo entero)";
  const origenDelProposito: "cabecera" | "ausente" = propositoExtraido ? "cabecera" : "ausente";

  const estado = certezaDe({ ejecutado: entrada.ejecutado === true, leido: !!contenido });
  const evidencia = [...(entrada.evidencia || [])];
  if (contenido) evidencia.push(`cabecera leída (${contenido.split("\n").length} líneas)`);

  const queCompleto = titulo && !para.startsWith(titulo) ? `${que} · ${titulo}` : que;
  const frase = `${ruta} — ${queCompleto}: ${para}. Estado: ${ETIQUETA_CERTEZA[estado]}.`;

  // El módulo se audita a sí mismo: si el fichero se atribuye más certeza de la
  // que tiene, se dice aquí (revisando su cabecera, que es lo que se ha leído).
  const avisos = revisarVocabulario(
    contenido ? contenido.split("\n").slice(0, 45).join("\n") : "",
    estado
  ).filter((a) => !a.palabra.includes(" "));

  return {
    ruta,
    que: queCompleto,
    para,
    origenDelProposito,
    estado,
    ejecutado: estado === "ejecutado",
    frase,
    evidencia,
    avisos,
  };
}

/** Lo mismo, para una lista: es lo que se enseña al cerrar una tanda de cambios. */
export function explicarVarios(entradas: EntradaArtefacto[]): ExplicacionArtefacto[] {
  return entradas.map((e) => explicarArtefacto(e));
}

/** Las frases, una por línea: para pegar en un informe o en el terminal. */
export function frasesDeExplicaciones(explicaciones: ExplicacionArtefacto[]): string[] {
  return explicaciones.map((e) => e.frase);
}
