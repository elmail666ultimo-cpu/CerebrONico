/**
 * miniatura.ts — GEOMETRÍA DE LA MINIATURA (v8.0.3)
 * ==================================================
 * Aritmética pura del redimensionado. Vive sola, sin DOM, por una razón
 * concreta: es la ÚNICA parte de la miniatura que se puede probar de verdad.
 *
 * Cuadrar `canvas` y `drawImage` en una prueba unitaria en Node no es viable
 * (no hay canvas), y una prueba que no se puede ejecutar no cubre nada. Así que
 * la decisión —qué tamaño tiene la miniatura— se aísla aquí y se prueba; lo que
 * queda fuera es la fontanería del navegador, que no toma decisiones.
 *
 * POR QUÉ HACE FALTA UNA MINIATURA Y NO BASTA CON LA IMAGEN ORIGINAL
 * -----------------------------------------------------------------
 * El chip del adjunto ya tiene el data URL completo de la imagen. Es tentador
 * pintarlo directamente en un `<img>` de 32 px y ahorrarse este archivo. El
 * problema es lo que hace el navegador por debajo: **decodifica la imagen
 * completa** para dibujarla a 32 px. Con tres adjuntos no se nota; con treinta
 * capturas de pantalla de 4K son ~250 MB de mapas de bits decodificados en
 * memoria y la interfaz se arrastra. Eso es exactamente el caso «cuando sean
 * muchas» que originó esta petición.
 *
 * Una miniatura de 96 px son unos pocos miles de píxeles: se decodifica al
 * instante y se puede tener cincuenta en pantalla sin que se note.
 */

/** Lado máximo de la miniatura, en píxeles. */
export const MAX_MINIATURA_PX = 96;

export interface Dimensiones {
  ancho: number;
  alto: number;
}

/**
 * Calcula el tamaño de la miniatura conservando la proporción.
 *
 * Reglas, y por qué:
 *   · El lado MAYOR queda en `max` — así ninguna miniatura se sale del chip.
 *   · NUNCA se amplía: una imagen de 16 px no gana nada por convertirse en 96,
 *     solo ocupa más. Ampliar en una miniatura es tirar memoria.
 *   · Se redondea, pero con suelo de 1 px: `Math.round(0.4)` da 0, y un canvas
 *     de anchura 0 **lanza excepción** en algunos navegadores. Un 1 px feo es
 *     mejor que un `throw` que rompe el bucle de adjuntos enteros.
 *   · Entradas no finitas o no positivas devuelven 0×0, que es la señal de
 *     «no hay miniatura posible» para quien llame. Devolver un cuadrado por
 *     defecto escondería el problema y pintaría una imagen deformada.
 */
export function calcularDimensionesMiniatura(ancho: number, alto: number, max: number = MAX_MINIATURA_PX): Dimensiones {
  if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho <= 0 || alto <= 0) {
    return { ancho: 0, alto: 0 };
  }

  const tope = Number.isFinite(max) && max > 0 ? max : MAX_MINIATURA_PX;
  const mayor = Math.max(ancho, alto);

  // Ya es suficientemente pequeña: se deja tal cual, sin tocar.
  if (mayor <= tope) {
    return { ancho: Math.max(1, Math.round(ancho)), alto: Math.max(1, Math.round(alto)) };
  }

  const factor = tope / mayor;
  return {
    ancho: Math.max(1, Math.round(ancho * factor)),
    alto: Math.max(1, Math.round(alto * factor)),
  };
}

/**
 * ¿Merece la pena generar una miniatura, o el original ya es diminuto?
 * Ahorra un paso de canvas por cada icono de 16 px que alguien adjunte.
 */
export function mereceMiniatura(ancho: number, alto: number, max: number = MAX_MINIATURA_PX): boolean {
  const d = calcularDimensionesMiniatura(ancho, alto, max);
  if (d.ancho === 0) return false;
  return d.ancho < ancho || d.alto < alto;
}
