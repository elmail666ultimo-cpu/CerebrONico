/**
 * formatFixer.ts — FILTRO DE METADATOS DE CIERRE (v8.0.1)
 * ==========================================================
 * POR QUÉ EXISTE (defecto real, no hipotético)
 * --------------------------------------------
 * El motor pedía en su prompt de sistema (brain.ts, cerebro.md,
 * core-agent/agent_core/engine.py) que TODA respuesta saliera con esta forma:
 *
 *     [DIAGNÓSTICO FLASH] una línea
 *     [ACCIÓN]
 *     ```tsx file="…"
 *     …
 *     ```
 *     [CHECKLIST DE MEMORIA] una línea
 *
 * En un modelo de 120B eso es ruido tolerable. En un modelo de 400 MB que
 * además recibe el prompt recortado, esos tres rótulos se comen el turno: el
 * usuario pidió «arréglame esto» y recibe una plantilla de acta. La queja
 * literal fue: «no, quítalo, solo responde la respuesta».
 *
 * El problema de fondo tenía DOS capas, y hacía falta arreglar las dos:
 *   1. La orden. Si el motor pide la plantilla, el modelo la obedece. Eso se
 *      corrige en `brain.ts` (protocolo de cierre ahora OPCIONAL y apagado).
 *   2. El residuo. Los modelos que ya tienen la plantilla memorizada del turno
 *      anterior la seguirán escupiendo un rato. Un prompt no es un contrato:
 *      hace falta una aduana determinista a la salida.
 * Este módulo es la capa 2. Es el único sitio del proyecto que decide qué es
 * «metadato de cierre», y es PURO (sin fs, sin DOM): puede correr en el
 * navegador, en el servidor y en las pruebas, que es lo que lo hace verificable.
 *
 * ⚠️ ADVERTENCIA SOBRE EL CÓDIGO DEL USUARIO
 * ------------------------------------------
 * Un bloque de código puede contener legítimamente una línea que empiece por
 * `[ACCIÓN]` (una cadena, un marcador de un log, un test de este mismo filtro).
 * Por eso el barrido es DELIBERADAMENTE ignorante dentro de los cercados:
 * ```` ``` ```` y `~~~` se respetan como territorio del usuario. Se filtra
 * fuera, nunca dentro. Un filtro que estropea el código que venía a arreglar
 * es peor que el ruido que elimina.
 *
 * NOTA DE DISEÑO (v8.0.1): este archivo NO existía en el ZIP. El modelo lo
 * «entregó» en el chat con el rótulo «Filtro de salida aplicado; metadatos
 * ocultos en el flujo de respuesta» — y no se guardó nunca. Ese es el patrón de
 * error que el propio motor persigue: declarar hecho lo que no está escrito.
 * Ahora está escrito, importado y con pruebas.
 */

/** Qué rótulos se barren. Todos por defecto: son metadatos, no respuesta. */
export interface OpcionesFiltroCierre {
  /** `[DIAGNÓSTICO FLASH] …` — qué iba a hacer. */
  diagnostico?: boolean;
  /** `[ACCIÓN]` — rótulo del bloque técnico. */
  accion?: boolean;
  /** `[CHECKLIST DE MEMORIA] …` — contabilidad de estado interna. */
  checklist?: boolean;
  /** `[Asunción tomada: …]` — la barandilla de confianza del motor. */
  asuncion?: boolean;
  /** Colapsar 3+ saltos de línea y quitar bordes en blanco (por defecto sí). */
  compactar?: boolean;
}

const DEFECTOS: Required<OpcionesFiltroCierre> = {
  diagnostico: true,
  accion: true,
  checklist: true,
  asuncion: true,
  compactar: true,
};

/**
 * Rótulos reconocidos, con las variantes que de verdad aparecen en los turnos:
 *   · con y sin acento      → DIAGNÓSTICO / DIAGNOSTICO, ACCIÓN / ACCION
 *   · con y sin dos puntos  → `[ACCIÓN]:` / `[ACCIÓN]`
 *   · con espacios internos → `[CHECKLIST  DE  MEMORIA]`
 *   · el rótulo «FLASH» se usa también suelto en algunos modelos diminutos.
 */
/**
 * ⚠️ LOS PATRONES VAN ANCLADOS CON `^`, y eso es una decisión, no un detalle.
 *
 * La primera versión no anclaba, así que CUALQUIER línea que mencionara el
 * rótulo en medio se borraba entera. El caso que lo destapó lo encontró la
 * prueba `«una nota del usuario no es metadato»`:
 *
 *     // TODO: revisar [ACCIÓN] del turno anterior
 *
 * Es un comentario legítimo y desaparecía. El rótulo de acta, cuando lo
 * escribe un modelo, abre la línea (como mucho precedido de adorno markdown,
 * que ya se retiró antes de llegar aquí). Si aparece a mitad de frase, no es
 * una etiqueta: es texto del usuario hablando de etiquetas.
 */
const ROTULOS: Array<{ clave: keyof OpcionesFiltroCierre; re: RegExp }> = [
  { clave: "diagnostico", re: /^\[\s*DIAGN[ÓO]STICO\s*(?:FLASH)?\s*\]/i },
  { clave: "accion", re: /^\[\s*ACCI[ÓO]N\s*\]/i },
  { clave: "checklist", re: /^\[\s*CHECKLIST\s+DE\s+MEMORIA\s*\]/i },
  { clave: "asuncion", re: /^\[\s*Asunci[óo]n\s+tomada\b[^\]]*\]/i },
];

/** Adorno markdown que un modelo suele poner alrededor del rótulo. */
const ADORNO = /^\s*(?:[-*+>]\s*|#{1,6}\s*)?(?:\*\*|__|\*|_|`)?\s*/;

/** ¿La línea es sólo un rótulo de cierre (con o sin cola de texto)? */
export function esLineaDeMetadato(linea: string, opciones?: OpcionesFiltroCierre): boolean {
  const o = { ...DEFECTOS, ...(opciones || {}) };
  const sinAdorno = linea.replace(ADORNO, "");
  return ROTULOS.some((r) => o[r.clave] && r.re.test(sinAdorno));
}

/**
 * Barre los metadatos de cierre de una respuesta.
 *
 * Se elimina la LÍNEA COMPLETA del rótulo, no sólo el rótulo: su contenido es
 * contabilidad interna del motor («qué estado quedó actualizado en memoria.md»),
 * no algo que el usuario haya pedido leer. En cambio, el cuerpo técnico que
 * viene DEBAJO del rótulo (`[ACCIÓN]` seguido del bloque de código) se conserva
 * íntegro — es justamente la respuesta.
 */
export function limpiarMetadatosDeCierre(texto: string, opciones?: OpcionesFiltroCierre): string {
  if (!texto || typeof texto !== "string") return texto || "";
  const o = { ...DEFECTOS, ...(opciones || {}) };

  const lineas = texto.split("\n");
  const salida: string[] = [];
  let enCercado = false;
  let marcaCercado = "";

  for (const linea of lineas) {
    // ¿Abre o cierra un cercado de código? Se respeta tal cual, dentro y fuera.
    const cercado = /^\s*(`{3,}|~{3,})/.exec(linea);
    if (cercado) {
      const marca = cercado[1][0];
      if (!enCercado) {
        enCercado = true;
        marcaCercado = marca;
      } else if (marca === marcaCercado) {
        enCercado = false;
        marcaCercado = "";
      }
      salida.push(linea);
      continue;
    }

    if (enCercado) {
      salida.push(linea); // territorio del usuario: no se toca
      continue;
    }

    if (esLineaDeMetadato(linea, o)) continue; // rótulo fuera: se va entero
    salida.push(linea);
  }

  let limpio = salida.join("\n");
  if (o.compactar) {
    // El hueco que deja el rótulo eliminado no debe convertirse en un boquete.
    limpio = limpio.replace(/\n{3,}/g, "\n\n").replace(/^\s*\n+/, "").trimEnd();
  }
  return limpio;
}

/**
 * ¿La respuesta traía metadatos? Sirve para telemetría honesta: el motor puede
 * contar cuántos turnos necesitaron la aduana. Sin esto, «el filtro funciona»
 * sería otra afirmación sin número detrás.
 */
export function conteniaMetadatosDeCierre(texto: string): boolean {
  if (!texto) return false;
  return limpiarMetadatosDeCierre(texto, { compactar: false }) !== texto;
}
