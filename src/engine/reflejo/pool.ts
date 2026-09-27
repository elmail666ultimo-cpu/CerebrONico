/**
 * pool.ts — EL POOL DE ESPEJOS PERSONALIZADOS (estado puro, navegable al bundle)
 * ==============================================================================
 * 🐞 DEFECTO v1.0.3→v1.1.0 (build de Windows): `consejo.ts` —que SÍ viaja al
 * bundle del navegador (⚡ Consejo)— importaba `buscarEnPool`/`poolListo`
 * desde `cargadorEspejos.ts`, y ese módulo toca `node:fs`. Vite lo externalizaba
 * con warning y Rollup reventaba: `"existsSync" is not exported by
 * "__vite-browser-external"`. El `npm run build` entero moría ahí.
 *
 * LA CURA es la misma regla que consejo.ts ya respeta con `node:os`
 * (configurarSistema): separar el ESTADO (puro, viaja a todos lados) del
 * CARGADOR (toca disco, solo servidor). Aquí vive el estado:
 *   · el frontend importa de "./pool" (nunca del cargador)
 *   · cargadorEspejos.ts rellena el pool desde el servidor y re-exporta todo
 *     para no romper a quien ya importaba de ahí (server.ts).
 *
 * Reglas de hierro: sin fs, sin path, sin red, sin `node:*`. Puro de verdad.
 */
import type { ResultadoEntidad } from "./consejo";

export interface EspejoPersonalizado {
  /** id único, siempre "espejo.*". */
  id: string;
  /** Nombre humano ("Espejo · Música"). */
  nombre: string;
  /** Familia (física, matemática, …, personalizada). */
  familia: string;
  /** Descripción de una línea. */
  descripcion: string;
  /** Ruta absoluta del .mjs en disco (la escribió el servidor; el navegador la ignora). */
  ruta: string;
  /** Versión del espejo ("1.0.0"). */
  version: string;
  /** Autor (para crédito). */
  autor?: string;
  /** La función `ejecutar(datos)` importada del .mjs. */
  ejecutar: (datos: Record<string, unknown>) => ResultadoEntidad | Promise<ResultadoEntidad>;
  /** Metadatos extra del módulo (lo que el .mjs exporte como `meta`). */
  meta?: Record<string, unknown>;
}

let POOL: EspejoPersonalizado[] = [];
let POOL_CARGADO = false;
let POOL_FALLAS: Array<{ id: string; ruta: string; motivo: string }> = [];

/** Coloca el pool completo (el cargador lo llama tras leer el manifest). */
export function setPool(
  espejos: EspejoPersonalizado[],
  cargado: boolean,
  fallas: Array<{ id: string; ruta: string; motivo: string }>,
): void {
  POOL = espejos;
  POOL_CARGADO = cargado;
  POOL_FALLAS = fallas;
}

/** Devuelve los espejos cargados en el pool. */
export function poolEspejos(): EspejoPersonalizado[] {
  return POOL;
}

/** ¿El pool ya se inicializó? */
export function poolListo(): boolean {
  return POOL_CARGADO;
}

/** Fallas del último cargamento. */
export function poolFallas() {
  return POOL_FALLAS;
}

/**
 * Busca un espejo en el pool por id. Lo usa `consejo.ts` (ejecutarEntidad)
 * para despachar hacia los espejos personalizados cuando el id no está en
 * los 10 curados.
 */
export function buscarEnPool(id: string): EspejoPersonalizado | undefined {
  return POOL.find((e) => e.id === id);
}

/**
 * Añade un espejo al pool en caliente (sin reiniciar). Lo usa el endpoint
 * /api/espejos/instalar para que el espejo recién instalado quede disponible
 * inmediatamente.
 */
export function agregarAlPool(espejo: EspejoPersonalizado): void {
  // Si ya existe (reinstalación), reemplaza.
  const idx = POOL.findIndex((e) => e.id === espejo.id);
  if (idx >= 0) POOL[idx] = espejo;
  else POOL.push(espejo);
}

/** Quita un espejo del pool. Lo usa el endpoint /api/espejos/desinstalar. */
export function quitarDelPool(id: string): boolean {
  const idx = POOL.findIndex((e) => e.id === id);
  if (idx < 0) return false;
  POOL.splice(idx, 1);
  return true;
}

/** Catálogo público (para /api/espejos/personalizados). Puro: solo lee el estado. */
export function catalogoPersonalizados() {
  return {
    ok: true,
    total: POOL.length,
    espejos: POOL.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      familia: e.familia,
      descripcion: e.descripcion,
      version: e.version,
      autor: e.autor,
      ruta: e.ruta,
    })),
    fallas: POOL_FALLAS,
  };
}
