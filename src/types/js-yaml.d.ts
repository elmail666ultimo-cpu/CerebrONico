/**
 * Declaración de tipos de `js-yaml`.
 *
 * POR QUÉ EXISTE ESTE FICHERO
 * ---------------------------
 * `js-yaml` no publica tipos propios y el paquete `@types/js-yaml` no está
 * instalado, así que TypeScript no sabía qué era (`implicitly has an 'any'
 * type`) y `npm run lint` fallaba por un módulo correcto.
 *
 * Se declara A MANO y sólo lo que el proyecto USA de verdad: `load` y `dump`.
 * Es deliberadamente estrecho — no pretende cubrir la librería entera, sólo
 * describir con honestidad las dos llamadas que hay en `formatConverter.ts`.
 * Si algún día se usan más funciones, hay que añadirlas aquí o instalar
 * `@types/js-yaml`: una declaración estrecha que se queda corta da un error
 * claro, y eso es mejor que un `any` que se lo traga todo.
 */
declare module "js-yaml" {
  /** Lee un texto YAML y devuelve el valor. Lanza si el YAML no es válido. */
  export function load(input: string, options?: Record<string, unknown>): unknown;

  /** Escribe un valor como texto YAML. */
  export function dump(input: unknown, options?: Record<string, unknown>): string;
}
