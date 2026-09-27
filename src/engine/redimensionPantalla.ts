/**
 * redimensionPantalla.ts — REDIMENSIONES DE PANTALLA (v1.15.0)
 * ============================================================
 * QUÉ ES: la fuente única de los umbrales y reglas de ancho/altura con los que
 * la interfaz se reordena al redimensionar la ventana.
 * PARA QUÉ SIRVE: para que «qué se ve y a qué tamaño» no dependa de números
 * mágicos dispersos por `index.css` que nadie puede probar. Hasta la v1.14.0 los
 * umbrales (900 / 1100 / 1280 px, la escala de raíz 14 / 14.5 px, el modal
 * min(1500px,97vw)×94vh) vivían solo en el CSS: si un día cambiaba uno y no el
 * otro, la interfaz se contradecía sin que ninguna suite lo cazara. Aquí son
 * constantes y funciones PURAS (sin DOM), así que se prueban, y la suite exige
 * que `index.css` siga usando los MISMOS números — el módulo es el patrón, no
 * una copia decorativa.
 *
 * REGLA ÚNICA: mismo ancho, mismo resultado. No hay reloj ni azar: es la misma
 * disciplina que ya rige el resto del motor.
 */

/** Umbrales de ancho (px). Son LA fuente: `index.css` los consume, no los define. */
export const ANCHO_MOVIL = 640;
export const ANCHO_COMPACTO = 900; // se ocultan los splitters: los paneles se apilan
export const ANCHO_MARGEN = 1024; // el margen de la carcasa vuelve a 0
export const ANCHO_MEDIO = 1100; // la raíz baja a 14px
export const ANCHO_ANCHO = 1280; // la raíz baja a 14.5px
export const ANCHO_MODAL = 1500; // tope horizontal del modal

/** Alturas (vh/factor) del modal estándar y del visor de imágenes. */
export const MODAL_ALTO_FACTOR = 0.94; // --cn-modal-h: 94vh
export const MODAL_ANCHO_FACTOR = 0.97; // --cn-modal-w: min(1500px, 97vw)
export const IMAGEN_MAX_FACTOR = 0.9; // max-w-[90vw] / max-h-[90vh]

export type ModoVentana = "compacto" | "medio" | "ancho";

/** El modo de la ventana, decidido por el ancho. Determinista y sin DOM. */
export function modoVentana(ancho: number): ModoVentana {
  if (ancho <= ANCHO_COMPACTO) return "compacto";
  if (ancho <= ANCHO_ANCHO) return "medio";
  return "ancho";
}

/**
 * La escala de raíz (`html { font-size }`) para este ancho, en px.
 * Coincide exactamente con las `@media` de `index.css`; la suite lo vigila.
 */
export function escalaRaiz(ancho: number): number {
  if (ancho <= ANCHO_MOVIL) return 13;
  if (ancho <= ANCHO_MEDIO) return 14;
  if (ancho <= ANCHO_ANCHO) return 14.5;
  return 15;
}

export interface Medida { ancho: number; alto: number }

/** El tamaño ESTÁNDAR del modal para una ventana dada: nunca excede el tope ni se come la ventana. */
export function medidaModal(ancho: number, alto: number): Medida {
  const a = Math.max(0, ancho);
  const h = Math.max(0, alto);
  return {
    ancho: Math.round(Math.min(ANCHO_MODAL, a * MODAL_ANCHO_FACTOR)),
    alto: Math.round(h * MODAL_ALTO_FACTOR),
  };
}

/** El tope del visor de imágenes (90% del viewport, el suelo de la suite de tipografía). */
export function topeImagen(ancho: number, alto: number): Medida {
  return {
    ancho: Math.round(Math.max(0, ancho) * IMAGEN_MAX_FACTOR),
    alto: Math.round(Math.max(0, alto) * IMAGEN_MAX_FACTOR),
  };
}

/** Margen de la carcasa: 3mm en pantalla táctil (notch/barras de gestos), 0 en puntero fino. */
export function margenApp(coarse: boolean): string {
  return coarse ? "3mm" : "0";
}

/** ¿La ventana es tan estrecha que el layout pasa a una sola columna apilada? */
export function esCompacto(ancho: number): boolean {
  return ancho <= ANCHO_COMPACTO;
}
