/**
 * CerebroNico V0.9 — Almacenamiento de imágenes grandes vía IndexedDB
 * ============================================================
 * localStorage tiene un límite de ~5-10 MB. Las imágenes de fondo
 * (PNG/JPG de cerebro) suelen pesar 1-5 MB cada una, y como data URL
 * ocupan ~33% más (base64). Por eso "localStorage lleno" aparece.
 *
 * IndexedDB no tiene ese límite práctico (usa storage persistente).
 * Esta util guarda/recupera la imagen de fondo desde IndexedDB.
 */

const DB_NAME = "cerebronico_db";
// v1.9.0 — de 1 a 2 por el ALMACÉN GRANDE. Subir la versión es lo que hace que
// las bases ya existentes en el navegador del usuario reciban el almacén nuevo
// sin perder lo que tenían (la imagen de fondo sigue en «images»).
const DB_VERSION = 2;
const STORE_NAME = "images";
/** v1.9.0 — valores de texto que no caben en localStorage (workspace, chats…). */
const STORE_GRANDE = "grandes";
const BG_KEY = "custom_background";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no disponible en este navegador"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Se crean LOS DOS: una base que viene de la v1 solo tiene «images», y una
      // recién creada no tiene ninguno. Comprobar cada uno por separado evita el
      // fallo clásico de «el almacén existe pero no en esa versión».
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(STORE_GRANDE)) {
        db.createObjectStore(STORE_GRANDE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Guarda el fondo en IndexedDB. Acepta Blob (lo normal hoy) o string (lo viejo).
 *
 * v1.7.1 — EL BLOB ES LO QUE HACE POSIBLE EL FONDO DE 100 MB.
 * Antes sólo aceptaba un data URL: la imagen se convertía a base64 (+33 %) y se
 * guardaba como cadena. Un fondo de 100 MB son ~133 millones de caracteres, que
 * en memoria son ~266 MB en UTF-16: el navegador se queda sin aire antes de
 * empezar a escribir, y el guardado falla con un error que parece de disco cuando
 * en realidad es del transporte. Con un Blob no hay conversión: el navegador
 * guarda el binario tal cual, y 100 MB son 100 MB.
 * El `string` se sigue aceptando para no romper lo ya guardado por versiones
 * anteriores (y la migración de localStorage).
 */
export async function saveBackgroundImage(dato: string | Blob): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(dato, BG_KEY);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[CerebroNico] No se pudo guardar la imagen en IndexedDB:", err);
    throw err;
  }
}

/**
 * Recupera el fondo desde IndexedDB. Devuelve null si no existe.
 * Devuelve Blob (lo nuevo) o string (data URL de versiones anteriores): quien lo
 * reciba debe pasarlo por `urlDeFondo` antes de pintarlo.
 */
export async function loadBackgroundImage(): Promise<string | Blob | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(BG_KEY);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve((req.result as string | Blob) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Elimina la imagen de fondo de IndexedDB. */
export async function clearBackgroundImage(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(BG_KEY);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

/**
 * Lo guardado → una URL que se pueda pintar en CSS.
 * Un Blob necesita URL de objeto; un data URL antiguo se usa tal cual.
 */
export function urlDeFondo(dato: string | Blob | null | undefined): string {
  if (!dato) return "";
  if (typeof dato === "string") return dato;
  return URL.createObjectURL(dato);
}

/**
 * Libera la URL de objeto cuando ya no se usa.
 * Sin esto, cada cambio de fondo deja el anterior retenido en memoria: con
 * fondos de decenas de MB, eso se nota (y es la clase de fuga que sólo aparece
 * cuando alguien sube el límite, no antes).
 */
export function revocarFondo(url: string | null | undefined): void {
  if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
}

/**
 * Migra una imagen existente de localStorage a IndexedDB (si existe).
 * Útil para usuarios que tenían la imagen en localStorage de versiones anteriores.
 */
export async function migrateBackgroundFromLocalStorage(): Promise<void> {
  try {
    const old = localStorage.getItem("cerebronico_custom_bg");
    if (old && old.startsWith("data:image")) {
      await saveBackgroundImage(old);
      localStorage.removeItem("cerebronico_custom_bg");
      console.log("[CerebroNico] Fondo migrado de localStorage a IndexedDB.");
    }
  } catch {}
}

// ============================================================
// v1.9.0 — ALMACÉN GRANDE: lo que no cabe en localStorage
// ============================================================
/**
 * QUÉ ES: el mismo IndexedDB, pero para valores de TEXTO grandes (el workspace,
 * los chats guardados, los mensajes).
 * PARA QUÉ SIRVE: para que «no cabía en localStorage y se perdió» deje de
 * existir. `storage.ts` manda aquí lo que no cabe y deja un puntero; en el
 * arranque, `restaurarDeAlmacenGrande` lo devuelve.
 *
 * POR QUÉ AQUÍ Y NO EN localStorage CON MÁS SITIO: localStorage es síncrono y
 * tiene cuota fija por origen (unos 5 MB). IndexedDB guarda blobs y textos sin
 * ese techo, y además no bloquea el hilo. El precio es que es asíncrono — y ese
 * precio ya está pagado: la interfaz ya arranca con un efecto asíncrono.
 */

export interface ResultadoAlmacenGrande {
  ok: boolean;
  motivo?: string;
  bytes?: number;
}

/** Guarda un texto grande. Devuelve el resultado en vez de lanzar. */
export async function guardarGrande(clave: string, texto: string): Promise<ResultadoAlmacenGrande> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_GRANDE, "readwrite");
      tx.objectStore(STORE_GRANDE).put(texto, clave);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return { ok: true, bytes: texto.length };
  } catch (err: any) {
    return {
      ok: false,
      motivo:
        err?.name === "QuotaExceededError"
          ? "cuota agotada en el almacén grande"
          : err?.message || "error al guardar",
    };
  }
}

/** Lee un texto grande. `null` si no existe o si el almacén no está disponible. */
export async function leerGrande(clave: string): Promise<string | null> {
  try {
    const db = await openDB();
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE_GRANDE, "readonly");
      const req = tx.objectStore(STORE_GRANDE).get(clave);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Borra un valor del almacén grande (p. ej. cuando ya vuelve a caber arriba). */
export async function borrarGrande(clave: string): Promise<boolean> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_GRANDE, "readwrite");
      tx.objectStore(STORE_GRANDE).delete(clave);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

/** Las claves que hay guardadas: sirve para diagnosticar y para no dejar restos. */
export async function clavesGrandes(): Promise<string[]> {
  try {
    const db = await openDB();
    return await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE_GRANDE, "readonly");
      const req = tx.objectStore(STORE_GRANDE).getAllKeys();
      req.onsuccess = () => resolve((req.result as IDBValidKey[]).map((k) => String(k)));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}
