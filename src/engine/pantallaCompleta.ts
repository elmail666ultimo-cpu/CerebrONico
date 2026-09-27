/**
 * pantallaCompleta.ts — PANTALLA COMPLETA, en un solo sitio
 * =========================================================
 * 🐞 EL FALLO: «el botón de salir de pantalla completa no anda».
 *
 * En `DedicatedWebEditorView` el botón hacía esto:
 *
 *     if (!document.fullscreenElement) {
 *       (el.requestFullscreen?.() || (el as any).webkitRequestFullscreen?.())?.catch?.(() => {});
 *     } else {
 *       (document.exitFullscreen?.() || (document as any).webkitExitFullscreen?.())?.catch?.(() => {});
 *     }
 *
 * Fíjate en la asimetría: la LLAMADA contempla los dos nombres de la API
 * (`requestFullscreen` y `webkitRequestFullscreen`), pero la PREGUNTA solo
 * mira el moderno. En cualquier motor que exponga únicamente el prefijado,
 * `document.fullscreenElement` es `undefined` PARA SIEMPRE, así que la
 * condición siempre entra por la rama de «entrar»: pulsar «Salir» vuelve a
 * pedir pantalla completa y nunca sale. El botón no está roto — está tomando
 * la decisión contraria.
 *
 * Y había un segundo problema, más traicionero: el `.catch(() => {})`.
 * Cualquier rechazo —incluido el de intentar salir cuando ya no hay nada en
 * pantalla completa— se tragaba en silencio. El síntoma era «no hace nada», sin
 * una sola pista. Aquí los errores se devuelven para que el llamante pueda
 * contarlos en vez de esconderlos.
 *
 * Puro en la parte que decide (testeable en node con un documento falso) y
 * mínimo en la que toca el DOM.
 */

/* ============================================================
   TIPOS ESTRUCTURALES (para poder testear sin navegador)
   ============================================================ */

/** Lo que necesitamos de un `Document`, incluidos los nombres prefijados. */
export interface DocumentoPantalla {
  fullscreenElement?: unknown;
  webkitFullscreenElement?: unknown;
  mozFullScreenElement?: unknown;
  msFullscreenElement?: unknown;
  exitFullscreen?: () => unknown;
  webkitExitFullscreen?: () => unknown;
  mozCancelFullScreen?: () => unknown;
  msExitFullscreen?: () => unknown;
}

/** Lo que necesitamos de un `Element` que puede entrar en pantalla completa. */
export interface ElementoPantalla {
  requestFullscreen?: () => unknown;
  webkitRequestFullscreen?: () => unknown;
  mozRequestFullScreen?: () => unknown;
  msRequestFullscreen?: () => unknown;
}

export type AccionPantalla = "entrar" | "salir";

/* ============================================================
   DECISIÓN (pura)
   ============================================================ */

/**
 * ¿Qué elemento está en pantalla completa, si es que hay alguno?
 * Se pregunta por los CUATRO nombres. Antes solo se miraba uno, y ahí estaba
 * el fallo: preguntar por un nombre que el motor no usa equivale a preguntar
 * siempre «no hay nada» y decidir siempre lo contrario de lo que toca.
 */
export function elementoEnPantallaCompleta(doc: DocumentoPantalla | null | undefined): unknown | null {
  if (!doc) return null;
  return (
    doc.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.mozFullScreenElement ??
    doc.msFullscreenElement ??
    null
  );
}

/**
 * Salir si hay algo en pantalla completa; entrar si no hay nada.
 *
 * Si lo que está en pantalla completa es OTRO elemento distinto del nuestro,
 * la respuesta sigue siendo `salir`: el usuario pidió salir de pantalla
 * completa, no salir de un elemento concreto.
 */
export function decidirAccion(doc: DocumentoPantalla | null | undefined): AccionPantalla {
  return elementoEnPantallaCompleta(doc) ? "salir" : "entrar";
}

/* ============================================================
   EJECUCIÓN (DOM)
   ============================================================ */

/**
 * Las variantes antiguas devuelven `undefined` en vez de una promesa; tratarlas
 * como promesa reventaría al llamar a `.catch`. Se normaliza aquí.
 */
function comoPromesa(resultado: unknown): Promise<void> {
  return resultado && typeof (resultado as Promise<void>).then === "function"
    ? (resultado as Promise<void>)
    : Promise.resolve();
}

/** Entra en pantalla completa con el primer nombre de la API que exista. */
export function entrarEnPantallaCompleta(el: ElementoPantalla | null | undefined): Promise<void> {
  const fn = el?.requestFullscreen ?? el?.webkitRequestFullscreen ?? el?.mozRequestFullScreen ?? el?.msRequestFullscreen;
  if (!fn) {
    return Promise.reject(new Error("Este motor no expone ninguna API de pantalla completa (ni la estándar ni las prefijadas)."));
  }
  try {
    // `.call(el)`: extraer el método y llamarlo sin receptor rompe la API.
    return comoPromesa(fn.call(el));
  } catch (e) {
    return Promise.reject(e);
  }
}

/** Sale de pantalla completa con el primer nombre de la API que exista. */
export function salirDePantallaCompleta(doc: DocumentoPantalla | null | undefined): Promise<void> {
  const fn = doc?.exitFullscreen ?? doc?.webkitExitFullscreen ?? doc?.mozCancelFullScreen ?? doc?.msExitFullscreen;
  if (!fn) {
    return Promise.reject(new Error("Este motor no expone ninguna API para salir de pantalla completa."));
  }
  try {
    return comoPromesa(fn.call(doc));
  } catch (e) {
    return Promise.reject(e);
  }
}

/**
 * Alterna según la REALIDAD, no según un estado guardado.
 *
 * Un `boolean` en React puede desincronizarse del navegador (una salida por Esc
 * cambia el navegador sin pasar por el estado). Si el botón decide con el
 * booleano, acaba pidiendo lo contrario de lo que el usuario quiere. Preguntar
 * al navegador cada vez cuesta una lectura de propiedad y no se desincroniza.
 *
 * Devuelve la acción ejecutada y el motivo del fallo, si lo hubo.
 */
export async function alternarPantallaCompleta(
  doc: DocumentoPantalla | null | undefined,
  elemento: ElementoPantalla | null | undefined
): Promise<{ accion: AccionPantalla; ok: boolean; motivo?: string }> {
  const accion = decidirAccion(doc);
  try {
    if (accion === "salir") await salirDePantallaCompleta(doc);
    else await entrarEnPantallaCompleta(elemento);
    return { accion, ok: true };
  } catch (e) {
    return { accion, ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}
