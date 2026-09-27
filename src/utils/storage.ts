/**
 * storage.ts — PERSISTENCIA LOCAL QUE NO PIERDE NADA EN SILENCIO (v1.9.0)
 * =======================================================================
 * QUÉ ES: la capa de guardado local (localStorage) del IDE, ahora con resultado,
 * rescate automático y aviso suscribible.
 * PARA QUÉ SIRVE: para que «no se guardó» deje de ser algo que solo aparece en la
 * consola del navegador. Antes, si el workspace pasaba de 5 MB o la cuota estaba
 * llena, esta capa escribía un `console.warn` y **devolvía nada**: quien llamaba
 * no podía saber que el trabajo del usuario acababa de perderse. Eso no es un
 * límite, es una pérdida silenciosa — la peor clase de fallo, porque el usuario
 * sigue escribiendo creyendo que todo está guardado.
 *
 * LAS TRES COSAS QUE CAMBIAN
 *   1. **Devuelve el resultado.** `saveJSON`/`saveString` ya no son `void`:
 *      devuelven `ResultadoGuardado` con `ok`, `motivo` y tamaño. Ignorar el
 *      valor sigue compilando (compatibilidad), pero ahora se puede mirar.
 *   2. **Rescata antes de rendirse.** Si el valor no cabe en localStorage, se
 *      guarda en el almacén grande (IndexedDB) y en localStorage queda un puntero
 *      mínimo. El dato NO se pierde: cambia de sitio. Y decirlo es la diferencia
 *      entre un límite honesto y una pérdida silenciosa.
 *   3. **Avisa.** `alFallarGuardado(fn)` suscribe a los fallos para que la
 *      interfaz pueda enseñarlos. Si ni localStorage ni el almacén grande
 *      aceptan el valor, el fallo se cuenta; nunca se traga.
 *
 * LO QUE SIGUE IGUAL: JSON corrupto se purga y se devuelve el fallback sin
 * congelar el render (Self-Healing Storage, v0.9). Eso ya estaba bien.
 */

/** El tope de localStorage. Se deja como referencia: pasado esto, se rescata. */
export const MAX_LOCALSTORAGE_BYTES = 5 * 1024 * 1024;

/** Marca que acompaña a la clave cuando el valor vive en el almacén grande. */
export const PREFIJO_PUNTERO = "cn-grande:";

export interface ResultadoGuardado {
  ok: boolean;
  clave: string;
  bytes: number;
  limite: number;
  motivo?: "demasiado-grande" | "cuota" | "sin-almacen" | "error";
  /** true si el valor no cabía aquí pero SÍ se guardó en el almacén grande. */
  rescatado?: boolean;
  detalle?: string;
}

type Suscriptor = (r: ResultadoGuardado) => void;
const suscriptores = new Set<Suscriptor>();

/**
 * Suscribe una función a los fallos de guardado. Devuelve la forma de desuscribir.
 * Es el canal por el que la interfaz se entera: sin él, esto vuelve a ser consola.
 */
export function alFallarGuardado(fn: Suscriptor): () => void {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
}

function avisar(r: ResultadoGuardado): void {
  for (const fn of suscriptores) {
    try {
      fn(r);
    } catch {
      // Un suscriptor roto no puede impedir que los demás se enteren.
    }
  }
}

/** ¿Vive esta clave en el almacén grande? (Sin abrir nada: lo dice el puntero.) */
export function viveEnAlmacenGrande(key: string): boolean {
  try {
    return localStorage.getItem(PREFIJO_PUNTERO + key) !== null;
  } catch {
    return false;
  }
}

/** Marca/desmarca el puntero del almacén grande. */
function marcarPuntero(key: string, activo: boolean): void {
  try {
    if (activo) localStorage.setItem(PREFIJO_PUNTERO + key, String(Date.now()));
    else localStorage.removeItem(PREFIJO_PUNTERO + key);
  } catch {
    // Si ni el puntero cabe, el rescate se habrá denunciado igualmente.
  }
}

/**
 * Rescata un texto al almacén grande. Se importa en diferido para que esta capa
 * siga funcionando (y pudiéndose probar en Node) cuando IndexedDB no existe.
 */
async function rescatarEnGrande(key: string, serializado: string): Promise<boolean> {
  try {
    const { guardarGrande } = await import("./indexedDBStorage");
    const r = await guardarGrande(key, serializado);
    if (r.ok) marcarPuntero(key, true);
    return r.ok;
  } catch {
    return false;
  }
}

function clasificarError(err: any): ResultadoGuardado["motivo"] {
  if (!err) return "error";
  if (err.name === "QuotaExceededError" || err.code === 22 || err.code === 1014) return "cuota";
  return "error";
}

function guardarTexto(key: string, serializado: string): ResultadoGuardado {
  const bytes = serializado.length;
  const base: ResultadoGuardado = { ok: false, clave: key, bytes, limite: MAX_LOCALSTORAGE_BYTES };

  if (bytes > MAX_LOCALSTORAGE_BYTES) {
    // NO se descarta: se manda al almacén grande. El retorno NO dice que se haya
    // guardado —eso todavía no se sabe— sino que se ha enviado; el aviso lleva el
    // desenlace real. Es la misma disciplina de certeza que el resto del motor:
    // no se afirma un resultado antes de tenerlo.
    void rescatarEnGrande(key, serializado).then((rescate) => {
      avisar({
        ...base,
        ok: rescate,
        motivo: "demasiado-grande",
        rescatado: rescate,
        detalle: rescate
          ? "guardado en el almacén grande (IndexedDB)"
          : "no cabe aquí y el almacén grande no está disponible",
      });
    });
    return {
      ...base,
      ok: false,
      motivo: "demasiado-grande",
      rescatado: false,
      detalle: "enviado al almacén grande; el aviso confirmará si se guardó",
    };
  }

  try {
    localStorage.setItem(key, serializado);
    marcarPuntero(key, false); // vuelve a caber: el puntero se retira
    return { ...base, ok: true };
  } catch (err: any) {
    const motivo = clasificarError(err);
    // Lleno o bloqueado: se intenta el almacén grande y se denuncia el desenlace,
    // tanto si funciona como si no. Nunca se traga.
    void rescatarEnGrande(key, serializado).then((rescate) => {
      avisar({
        ...base,
        ok: rescate,
        motivo,
        rescatado: rescate,
        detalle: rescate
          ? "localStorage lleno: guardado en el almacén grande"
          : "localStorage lleno y el almacén grande no está disponible",
      });
    });
    return {
      ...base,
      ok: false,
      motivo,
      rescatado: false,
      detalle: "localStorage lleno; enviado al almacén grande",
    };
  }
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(
      `[StorageGuard] JSON corrupto en clave "${key}". Purgando y aplicando fallback.`,
      error
    );
    try {
      localStorage.removeItem(key);
    } catch (purgeError) {
      console.error("[StorageGuard] Error crítico al limpiar:", purgeError);
    }
    return fallback;
  }
}

/**
 * Guarda un valor. Devuelve el resultado en vez de callarse.
 * Compatible hacia atrás: quien lo llamaba sin mirar el retorno sigue igual.
 */
export function saveJSON(key: string, value: unknown): ResultadoGuardado {
  let serializado: string;
  try {
    serializado = JSON.stringify(value);
  } catch (err: any) {
    const r: ResultadoGuardado = {
      ok: false,
      clave: key,
      bytes: 0,
      limite: MAX_LOCALSTORAGE_BYTES,
      motivo: "error",
      detalle: `no se pudo serializar: ${err?.message || err}`,
    };
    avisar(r);
    return r;
  }
  return guardarTexto(key, serializado);
}

export function loadString(key: string, fallback = ""): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function saveString(key: string, value: string): ResultadoGuardado {
  return guardarTexto(key, value ?? "");
}

// ============================================================
// Alias de compatibilidad — loadSafeJSON / saveSafeJSON
// ============================================================

export function loadSafeJSON<T>(key: string, fallback: T): T {
  return loadJSON(key, fallback);
}

export function saveSafeJSON<T>(key: string, value: T): boolean {
  return saveJSON(key, value).ok;
}

// ============================================================
// Recuperar lo que se fue al almacén grande
// ============================================================

/**
 * Devuelve los valores de las claves indicadas que estén en el almacén grande.
 *
 * Por qué existe: `loadJSON` es SÍNCRONO (y debe seguir siéndolo, porque
 * inicializa estados de React), así que no puede esperar a IndexedDB. Cuando una
 * clave vive en el almacén grande, `loadJSON` devuelve el fallback y el valor
 * real llega por aquí, en el arranque, de forma asíncrona. Es la parte que hace
 * que el rescate sea una recuperación y no solo un sitio más donde perderse.
 */
export async function restaurarDeAlmacenGrande(
  claves: string[]
): Promise<Record<string, unknown>> {
  const salida: Record<string, unknown> = {};
  if (typeof indexedDB === "undefined") return salida;
  let leerGrande: ((k: string) => Promise<string | null>) | null = null;
  try {
    leerGrande = (await import("./indexedDBStorage")).leerGrande;
  } catch {
    return salida;
  }
  for (const clave of claves) {
    if (!viveEnAlmacenGrande(clave)) continue;
    try {
      const texto = await leerGrande(clave);
      if (texto) salida[clave] = JSON.parse(texto);
    } catch {
      // Valor ilegible: se deja fuera y el llamante usa su fallback. No se finge.
    }
  }
  return salida;
}
