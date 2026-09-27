/**
 * certeza.ts — LOS TRES NIVELES DE CERTEZA (v1.8.0)
 * =================================================
 * QUÉ ES: el tipo `Certeza` y las dos operaciones que se hacen con él (deducirlo
 * de la evidencia, y quedarse con el más débil cuando se juntan dos).
 * PARA QUÉ SIRVE: para que la honestidad del motor no dependa de la memoria de
 * quien escribe. Vive en su propio fichero y no dentro de `vocabulario.ts`
 * porque lo usan tres módulos (vocabulario, explicaciones y voz) y meterlo en
 * cualquiera de ellos habría creado una dependencia circular entre iguales — de
 * esas que se resuelven «importando» y acaban en un ciclo que nadie entiende.
 *
 * REGLA ÚNICA: `ejecutado` NO se deduce nunca de una lectura. Solo lo concede
 * quien tiene la salida de una ejecución delante. Todo lo demás baja un escalón.
 */

export type Certeza = "ejecutado" | "leido" | "sin_verificar";

/** El nombre corto de cada nivel, para texto de interfaz. */
export const NOMBRE_CERTEZA: Record<Certeza, string> = {
  ejecutado: "ejecutado",
  leido: "leído",
  sin_verificar: "sin verificar",
};

/**
 * Deduce la certeza de la evidencia disponible.
 * - `ejecutado: true` solo si QUIEN LLAMA ha visto la salida de una ejecución.
 * - `leido: true` si se ha leído el código o su documentación.
 * - Sin nada: "sin_verificar".
 */
export function certezaDe(evidencia: { ejecutado?: boolean; leido?: boolean } = {}): Certeza {
  if (evidencia.ejecutado === true) return "ejecutado";
  if (evidencia.leido === true) return "leido";
  return "sin_verificar";
}

/** Al juntar dos evidencias manda la MÁS DÉBIL: es la única opción que no miente. */
export function masDebil(a: Certeza, b: Certeza): Certeza {
  const fuerza: Record<Certeza, number> = { sin_verificar: 0, leido: 1, ejecutado: 2 };
  return fuerza[a] <= fuerza[b] ? a : b;
}

/** ¿Se puede afirmar un resultado con esta certeza? Solo si está ejecutado. */
export function esAfirmable(certeza: Certeza): boolean {
  return certeza === "ejecutado";
}
