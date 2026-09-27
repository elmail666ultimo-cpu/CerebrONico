/**
 * espejoSync.ts — ESPEJO-SYNC: el sync ya no deja restos (v1.6.31)
 * =================================================================
 * 🐞 EL PROBLEMA
 * El sync (POST /api/fs/sync) escribía SIEMPRE y NO retiraba NADA. Si una
 * sesión sincronizaba 40 archivos y la siguiente traía 38 (el modelo rehízo la
 * app y dos archivos desaparecieron), los dos viejos quedaban en disco para
 * siempre. El árbol quedaba "mezclado": Vite compilaba un `src/components/`
 * que ya no existía en la intención del usuario, y los errores
 * «X is not exported by Y» o «Failed to resolve import» eran restos, no
 * decisiones. El fallo de las 2:10 a. m. era exactamente ese: árbol mezclado
 * sin retiro.
 *
 * 🔧 EL ARREGLO
 * Un MANIFIESTO DE PROPIEDAD (`.cn-sync/manifiesto.json`) recuerda qué rutas
 * escribió el sync (y con qué huella). En cada sync:
 *   1. Lo que se escribió antes y YA NO llega → se RETIRA (se borra de disco
 *      y se apunta en `retirados`).
 *   2. Lo que llega igual que antes → se OMITE (no se reescribe al pedo).
 *   3. Lo que llega cambiado o nuevo → se escribe y se registra.
 * Un archivo que el usuario creó a mano (nunca sincronizado) NO está en el
 * manifiesto y por tanto JAMÁS se retira: la propiedad lo protege.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MÓDULO PURO
 * Igual que el resto de `src/engine/`, aquí NO hay `fs` ni `node:*`: `src/`
 * va entero al paquete del navegador. Las funciones deciden y devuelven datos;
 * el disco lo toca `server.ts`. La huella usa FNV-1a (determinista, sin
 * `crypto`) porque sirve para detectar cambios, no para cifrar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Carpeta (oculta) donde vive el manifiesto de propiedad. */
export const MANIFESTO_DIR = ".cn-sync";
/** Nombre del archivo de manifiesto. */
export const MANIFESTO_FILE = "manifiesto.json";
/** Versión del esquema del manifiesto (para migrar si cambia). */
export const MANIFESTO_VERSION = 1;

/** Un archivo tal como lo trae el sync. */
export interface ArchivoEspejo {
  path: string;
  content?: string;
}

/**
 * Manifiesto de propiedad del sync.
 * `propietarios` mapea ruta → huella (qué escribimos y con qué contenido).
 * `retirados` es el histórico de rutas que se retiraron (para auditar y no
 * resucitar restos por accidente).
 */
export interface ManifiestoEspejo {
  version: number;
  propietarios: Record<string, string>;
  retirados: string[];
}

/** Directorios que el sync nunca escribe ni retira (artefactos y estado). */
const IGNORADAS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist_electron",
  "build",
  "out",
  "coverage",
  ".vite",
  ".next",
  ".nuxt",
  "__pycache__",
  "venv",
  ".venv",
  ".cn-sync",
  ".cn-preview",
]);

/** FNV-1a 32 bits. Determinista y sin dependencias: módulo puro. */
export function huella(contenido: string): string {
  let h = 0x811c9dc5;
  const s = String(contenido ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}

/** Rutas comparables: barras unificadas, sin `./` ni `/` iniciales. */
export function normalizarRuta(ruta: string): string {
  return String(ruta ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
}

/** ¿La ruta cae en un directorio que el sync debe ignorar? */
export function esRutaIgnorableSync(ruta: string): boolean {
  const partes = normalizarRuta(ruta).split("/").filter(Boolean);
  return partes.some((p) => IGNORADAS.has(p));
}

/** Manifiesto vacío, listo para estrenar un sandbox. */
export function crearManifiesto(): ManifiestoEspejo {
  return { version: MANIFESTO_VERSION, propietarios: {}, retirados: [] };
}

/** Rutas de las que el sync es dueño en este momento. */
export function rutasDelManifiesto(m: ManifiestoEspejo): string[] {
  return Object.keys(m.propietarios || {});
}

/** ¿Esta ruta fue retirada en algún sync anterior? */
export function esRetirado(m: ManifiestoEspejo, ruta: string): boolean {
  const r = normalizarRuta(ruta);
  return (m.retirados || []).includes(r);
}

/** Resultado de decidir qué retirar. */
export interface PlanRetiro {
  /** Rutas que el sync escribió antes y ya no llegan → borrar de disco. */
  aRetirar: string[];
  /** Manifiesto ya saneado (sin los retirados) para encadenar el registro. */
  manana: ManifiestoEspejo;
}

/**
 * Decide qué retirar: toda ruta de la que el sync es dueño y que NO está en el
 * lote actual. Lo que el usuario creó a mano no está en el manifiesto y no se
 * toca. No borra nada: devuelve el plan; el disco lo toca quien tenga `fs`.
 */
export function planificarRetiro(m: ManifiestoEspejo, rutasActuales: string[]): PlanRetiro {
  const actuales = new Set(rutasActuales.map(normalizarRuta));
  const propietarios = m.propietarios || {};
  const aRetirar: string[] = [];
  const propietariosRestantes: Record<string, string> = {};
  for (const ruta of Object.keys(propietarios)) {
    if (actuales.has(ruta)) propietariosRestantes[ruta] = propietarios[ruta];
    else aRetirar.push(ruta);
  }
  const retirados = Array.from(new Set([...(m.retirados || []), ...aRetirar])).sort();
  return {
    aRetirar,
    manana: { version: m.version ?? MANIFESTO_VERSION, propietarios: propietariosRestantes, retirados },
  };
}

/** Resumen del registro de un lote sincronizado. */
export interface ResultadoSync {
  manifesto: ManifiestoEspejo;
  /** Archivos nuevos o cambiados (los que hay que escribir de verdad). */
  escritos: number;
  /** Archivos idénticos a lo ya registrado (no hace falta reescribirlos). */
  omitidos: number;
  /** Misma ruta, distinto contenido (sobreescritura real). */
  reescritos: number;
  /** Rutas que no estaban en el manifiesto. */
  nuevos: number;
  /** Rutas ignoradas (node_modules, .cn-sync, artefactos…). */
  ignorados: number;
}

/**
 * Registra un lote en el manifiesto y dice qué archivos merecen escritura.
 * No escribe en disco: devuelve el manifiesto resultante y el recuento.
 */
export function registrarSync(m: ManifiestoEspejo, archivos: ArchivoEspejo[]): ResultadoSync {
  const propietarios: Record<string, string> = { ...(m.propietarios || {}) };
  let omitidos = 0;
  let reescritos = 0;
  let nuevos = 0;
  let ignorados = 0;

  for (const a of archivos) {
    if (!a || typeof a.path !== "string") continue;
    const ruta = normalizarRuta(a.path);
    if (!ruta || esRutaIgnorableSync(ruta)) {
      ignorados++;
      continue;
    }
    const h = huella(typeof a.content === "string" ? a.content : "");
    const previa = propietarios[ruta];
    if (previa === undefined) nuevos++;
    else if (previa === h) omitidos++;
    else reescritos++;
    propietarios[ruta] = h;
  }

  return {
    manifesto: {
      version: m.version ?? MANIFESTO_VERSION,
      propietarios,
      retirados: [...(m.retirados || [])],
    },
    escritos: nuevos + reescritos,
    omitidos,
    reescritos,
    nuevos,
    ignorados,
  };
}

/** Serializa el manifiesto para guardarlo en `.cn-sync/manifiesto.json`. */
export function serializarManifiesto(m: ManifiestoEspejo): string {
  return JSON.stringify(
    { version: m.version ?? MANIFESTO_VERSION, propietarios: m.propietarios || {}, retirados: m.retirados || [] },
    null,
    2
  );
}

/** Lee un manifiesto del texto del disco; tolerante: basura → null. */
export function parsearManifiesto(texto: string): ManifiestoEspejo | null {
  try {
    const o = JSON.parse(texto);
    if (!o || typeof o !== "object" || typeof o.propietarios !== "object" || o.propietarios === null) return null;
    const propietarios: Record<string, string> = {};
    for (const k of Object.keys(o.propietarios)) {
      if (typeof o.propietarios[k] === "string") propietarios[normalizarRuta(k)] = o.propietarios[k];
    }
    const retirados = Array.isArray(o.retirados)
      ? o.retirados.filter((x: unknown): x is string => typeof x === "string").map(normalizarRuta)
      : [];
    return { version: Number(o.version) || MANIFESTO_VERSION, propietarios, retirados };
  } catch {
    return null;
  }
}

/** Línea honesta para el log: lo que el espejo hizo con el lote. */
export function lineaEspejoSync(res: ResultadoSync, retirados: number): string {
  return `ESPEJO-SYNC: ${res.escritos} escrito(s) · ${res.omitidos} sin cambios · ${res.ignorados} ignorado(s) · ${retirados} retirado(s)`;
}
