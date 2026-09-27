/**
 * bovedaLocal.ts — BÓVEDA v1: EL TRANSPORTE DE LA IMAGEN HASTA EL DISCO REAL
 * ===========================================================================
 * El pedido (reflejo v5): «genera una carpeta CON EL AGENTE llamada imagenes
 * dentro de la carpeta cerebronico en el disco C:, y que el TRANSPORTE de la
 * imagen llegue hasta la carpeta local de CerebroNico, con carpetas INDEXADAS
 * a nuestros proyectos: C:\CN\IMAGENES, APPS, INVESTIGACION, md…».
 *
 * Traducido a arquitectura: el sandbox (:3500) sigue siendo la caja de
 * escritura — nada escribe el disco real SIN permiso. El puente PC (:5000,
 * agent_bridge_5000.py) es la única puerta con manos fuera del sandbox, y se
 * le añade `write_b64`/`mkdir` para binarios. Este módulo es el CEREBRO del
 * transporte: decide DÓNDE cae cada artefacto y CÓMO se indexa. Puro, sin fs,
 * sin red — se prueba con una mesa de decisiones.
 *
 * El índice es un INDICE.json por carpeta (no una base de datos): legible a
 * mano, acumulativo, con el origen sandbox de cada archivo. Regla de hierro:
 * un transporte que no se declara no existe — cada viaje devuelve su línea
 * honesta para el log/aviso del chat.
 */

// ─── Raíz y carpetas indexadas ──────────────────────────────────────────────

/** La raíz por defecto respeta el SO: Windows usa C:\CN; el resto, ~/CN.
 *  El usuario la cambia con CN_BOVEDA_RAIZ o /api/boveda/configurar. */
export function raizBovedaPorDefecto(plataforma: string, home: string): string {
  if (plataforma === "win32") return "C:\\CN";
  return `${home.replace(/\/+$/, "")}/CN`;
}

/** Las carpetas indexadas del pedido, con su categoría de artefacto.
 *  En mayúsculas porque así las pidió el usuario: «C:\CN /IMAGENES, APPs,
 *  Investigacion, md…». La bóveda se ve en el explorador: el nombre importa. */
export const CARPETAS_BOVEDA = {
  IMAGENES: "IMAGENES",
  APPS: "APPS",
  INVESTIGACION: "INVESTIGACION",
  DOCUMENTOS: "DOCUMENTOS",
  DATOS: "DATOS",
} as const;

export type CarpetaBoveda = keyof typeof CARPETAS_BOVEDA;

/** Qué carpeta de la bóveda recibe cada tipo de artefacto. Determinista. */
export function carpetaParaArtefacto(tipo: string): CarpetaBoveda {
  const t = String(tipo || "").toLowerCase();
  if (["imagen", "image", "png", "jpeg", "jpg", "webp", "gif", "svg"].includes(t)) return "IMAGENES";
  if (["app", "exe", "apk", "aab", "build", "dist"].includes(t)) return "APPS";
  if (["investigacion", "research", "paper", "informe", "reporte"].includes(t)) return "INVESTIGACION";
  if (["md", "markdown", "txt", "doc", "docx", "pdf", "rtf"].includes(t)) return "DOCUMENTOS";
  if (["csv", "json", "jsonl", "tsv", "xlsx", "sqlite", "db", "parquet"].includes(t)) return "DATOS";
  return "DOCUMENTOS"; // el suelo honesto: lo desconocido se guarda como documento, no se tira
}

// ─── Nombres y rutas ────────────────────────────────────────────────────────

/** Puntos colapsados: `..` nunca sobrevive — un segmento escaparate es
 *  imposible por construcción, no por filtería posterior. */
function sinPuntosDobles(s: string): string {
  return s.replace(/\.{2,}/g, ".");
}

/** slug de proyecto: "Mi App 2" → "mi-app-2". Sin acentos, sin espacios. */
export function normalizarProyecto(nombre: string): string {
  const s = sinPuntosDobles(
    String(nombre || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
  return s || "sin-proyecto";
}

/** nombre de archivo seguro: sin rutas, sin `..`, con extensión de los BYTES. */
export function normalizarArchivo(nombre: string, mimeReal: string): string {
  const base = String(nombre || "").split(/[\\/]/).pop() || "imagen";
  const sinExt = sinPuntosDobles(
    base.replace(/\.[a-zA-Z0-9]+$/, "").replace(/[^a-zA-Z0-9._ -]+/g, "-").replace(/^-+|-+$/g, "")
  ) || "imagen";
  const ext = mimeReal === "image/png" ? "png" : mimeReal === "image/webp" ? "webp" : mimeReal === "image/gif" ? "gif" : "jpg";
  return `${sinExt}.${ext}`;
}

export interface PlanTransporte {
  /** Ruta absoluta en el PC real (la que recibe el puente). */
  rutaLocal: string;
  /** Ruta relativa a la raíz de la bóveda (para el índice). */
  relativa: string;
  /** Carpeta indexada destino. */
  carpeta: CarpetaBoveda;
  /** Proyecto slugueado. */
  proyecto: string;
}

/**
 * Plan del viaje: <raiz>/IMAGENES/<proyecto>/<fecha>/<archivo>.
 * La fecha (YYYY-MM-DD) evita que dos generaciones con el mismo nombre se
 * pisen: la bóveda es un histórico, no un espejo mutable.
 * Rechaza (con motivo) cualquier pieza que intente escapar (path traversal).
 */
export function planearTransporte(opts: {
  raiz: string;
  categoria: string;
  proyecto: string;
  archivo: string;
  mimeReal: string;
  fechaIso: string;
  separador?: "/" | "\\";
}): { ok: true; plan: PlanTransporte } | { ok: false; motivo: string } {
  const { raiz, categoria, proyecto, archivo, mimeReal, fechaIso } = opts;
  if (!raiz || !raiz.trim()) return { ok: false, motivo: "la raíz de la bóveda está vacía: configura CN_BOVEDA_RAIZ o /api/boveda/configurar." };
  const carpeta = carpetaParaArtefacto(categoria);
  const proy = normalizarProyecto(proyecto);
  const nombre = normalizarArchivo(archivo, mimeReal);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(fechaIso).slice(0, 10)) ? String(fechaIso).slice(0, 10) : "sin-fecha";
  const sep = opts.separador ?? "\\";
  const relativa = `${CARPETAS_BOVEDA[carpeta]}/${proy}/${fecha}/${nombre}`;
  if (relativa.split("/").some((p) => p === ".." || /^[a-zA-Z]:/.test(p) || p.startsWith("/"))) {
    return { ok: false, motivo: "el plan de transporte salió con ruta escaparate (contiene .. o unidad): abortado por seguridad." };
  }
  const raizLimpia = raiz.replace(/[\\/]+$/, "");
  const rutaLocal = raizLimpia + sep + relativa.split("/").join(sep);
  return { ok: true, plan: { rutaLocal, relativa, carpeta, proyecto: proy } };
}

// ─── El índice (INDICE.json por carpeta) ────────────────────────────────────

export interface EntradaIndice {
  /** ruta relativa a la raíz de la bóveda */
  archivo: string;
  /** proyecto indexado */
  proyecto: string;
  /** de dónde vino dentro del sandbox (ruta relativa al proyecto) */
  origenSandbox: string;
  mime: string;
  bytes: number;
  /** proveedor/modelo que la generó (honestidad de imageGen) */
  modeloUsado?: string;
  /** sha256 corto para deduplicar sin releer el disco */
  firma: string;
  en: string;
}

export interface IndiceBoveda {
  version: 1;
  actualizado: string;
  entradas: EntradaIndice[];
}

export function indiceVacio(): IndiceBoveda {
  return { version: 1, actualizado: new Date().toISOString(), entradas: [] };
}

/**
 * Añadir una entrada al índice: reemplaza la anterior con la MISMA firma+ruta
 * (reenviar la misma imagen no duplica el historial) y capa en 5000 entradas.
 * Inmutable: devuelve un índice nuevo, nunca pinta el viejo.
 */
export function indiceCon(indice: IndiceBoveda, entrada: EntradaIndice): IndiceBoveda {
  const previas = indice.entradas.filter((e) => !(e.firma === entrada.firma && e.archivo === entrada.archivo));
  const entradas = [...previas, entrada];
  while (entradas.length > 5000) entradas.shift();
  return { version: 1, actualizado: entrada.en, entradas };
}

/** Parseo defensivo del INDICE.json que devuelva el puente. Nunca lanza. */
export function parsearIndice(bruto: unknown): IndiceBoveda {
  const e = (bruto as any)?.entradas;
  if (!Array.isArray(e)) return indiceVacio();
  const entradas = e.filter((x: any) => x && typeof x.archivo === "string" && typeof x.firma === "string").slice(-5000);
  return { version: 1, actualizado: String((bruto as any)?.actualizado || ""), entradas };
}

/** Árbol inicial que /api/boveda/preparar materializa CON EL AGENTE. */
export function arbolInicial(raiz: string, separador: "/" | "\\" = "\\"): string[] {
  const sep = separador;
  const base = raiz.replace(/[\\/]+$/, "");
  return Object.values(CARPETAS_BOVEDA).map((c) => base + sep + c.split("/").join(sep));
}

/** La línea honesta del transporte para el chat/log. */
export function lineaTransporte(exito: boolean, plan: PlanTransporte | null, motivo: string): string {
  return exito && plan
    ? `📦 bóveda: imagen transportada a ${plan.rutaLocal} (índice: ${plan.carpeta}/${plan.proyecto})`
    : `📦 bóveda: NO transportada (${motivo})`;
}
