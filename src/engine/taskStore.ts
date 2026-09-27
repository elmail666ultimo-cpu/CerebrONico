/**
 * taskStore.ts — LOS PLANES SOBREVIVEN AL REINICIO (v2.2)
 * ======================================================
 * Guarda el estado del cerebro de tareas para que un cierre del servidor, un
 * apagón o un `Ctrl+C` no borren el trabajo a medias.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EN SU PROPIO FICHERO Y NO EN LA BASE DE CONOCIMIENTO
 * ─────────────────────────────────────────────────────────────────────────────
 * La base autónoma (`knowledgeBase.ts`) es una tabla de entradas PUNTUADAS que
 * se consultan por solape de palabras para montar el prompt. Meter aquí los
 * planes parecía natural, pero tiene dos consecuencias malas:
 *
 *   1. `query()` acabaría devolviendo planes como si fueran conocimiento, y el
 *      prompt del modelo se llenaría de JSON de tareas que no le sirve de nada.
 *   2. Cada plan se reescribe en cada tarea terminada: el fichero entero de
 *      conocimiento se reescribiría decenas de veces por plan. Un fallo de
 *      escritura ahí se llevaría por delante TODO lo aprendido.
 *
 * Decisión: el conocimiento sigue en `.cerebro-db/kb.json`, y el ESTADO
 * OPERATIVO vive en `.cerebro-db/planes.json` con escritura atómica. Lo que sí
 * aprende la base de conocimiento son las LECCIONES de cada fallo — eso es
 * conocimiento, y va donde tiene que ir.
 *
 * Este módulo es LÓGICA PURA (sin `fs`): serializa, valida y repara. El acceso al
 * disco está en `taskStoreFs.ts`. Así una prueba puede simular un apagón sin
 * tocar el disco de verdad.
 */

import {
  ESTADOS_TAREA,
  ESTADOS_PLAN,
  planFinalizado,
  type EstadoPlan,
  type EstadoTarea,
  type Peso,
  type Plan,
  type Tarea,
} from "./taskPlanner";

/** Versión del formato. Si cambia la forma, se migra aquí y se dice. */
export const VERSION_PLANES = 1;

/** Tope de líneas de traza que se guardan por plan (no crecer sin freno). */
const MAX_LOG_GUARDADO = 120;

/** Cuántos planes finalizados se conservan. */
export const MAX_PLANES_FINALIZADOS = 40;
/** Y durante cuánto tiempo. */
export const MAX_ANTIGUEDAD_MS = 30 * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Guardar
// ─────────────────────────────────────────────────────────────────────────────

/** Deja el plan en una forma que se puede escribir y volver a leer sin sorpresas. */
function planParaDisco(plan: Plan): Plan {
  return {
    id: plan.id,
    objetivo: plan.objetivo,
    creadoEn: plan.creadoEn,
    estado: plan.estado,
    tareas: plan.tareas.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      peso: t.peso,
      dependeDe: t.dependeDe,
      estado: t.estado,
      intentos: t.intentos,
      motivoEspera: t.motivoEspera,
      iniciadaEn: t.iniciadaEn,
      terminadaEn: t.terminadaEn,
      resultado: t.resultado,
      error: t.error,
      coste: t.coste,
      tipo: t.tipo,
      datos: t.datos,
      claveCircuito: t.claveCircuito,
      esperasCircuito: t.esperasCircuito,
      bloqueoCircuito: t.bloqueoCircuito,
      esperaHasta: t.esperaHasta,
    })),
    resumen: plan.resumen,
    noTerminadas: plan.noTerminadas,
    errorValidacion: plan.errorValidacion,
    // La traza se recorta: es para mirar, no para crecer durante meses.
    log: (plan.log || []).slice(-MAX_LOG_GUARDADO),
    // OJO: `__despertarCancelacion` es una función y NO se serializa (JSON la
    // descarta sola). Es correcto: tras un reinicio no hay nada que despertar.
  };
}

export function serializarPlanes(planes: Plan[]): string {
  return JSON.stringify({ version: VERSION_PLANES, guardadoEn: Date.now(), planes: planes.map(planParaDisco) }, null, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cargar (tolerante: nunca lanza, siempre repara y lo cuenta)
// ─────────────────────────────────────────────────────────────────────────────

function esPeso(v: any): v is Peso {
  return v === "io" || v === "cpu";
}

/**
 * `datos` es lo que se le pasa al ejecutor (prompt, ruta, comando). Se limita su
 * tamaño: un prompt enorme guardado en cada checkpoint multiplicaría el fichero
 * de planes sin aportar nada, y el plan dejaría de poder cargarse rápido.
 */
const MAX_DATOS_BYTES = 8192;

function normalizarDatos(bruto: any, avisos: string[], idPlan: string, idTarea: string): Record<string, unknown> | undefined {
  if (bruto == null || typeof bruto !== "object" || Array.isArray(bruto)) return undefined;
  let texto: string;
  try {
    texto = JSON.stringify(bruto);
  } catch {
    avisos.push(`plan ${idPlan}: los datos de la tarea #${idTarea} no se pudieron convertir a JSON; se descartan.`);
    return undefined;
  }
  if (texto.length > MAX_DATOS_BYTES) {
    avisos.push(
      `plan ${idPlan}: los datos de la tarea #${idTarea} ocupaban ${texto.length} caracteres (tope ${MAX_DATOS_BYTES}); se han recortado.`
    );
    return { recortado: true, aviso: `los datos originales superaban ${MAX_DATOS_BYTES} caracteres y no se guardaron` };
  }
  return bruto as Record<string, unknown>;
}

function normalizarTarea(bruto: any, avisos: string[], idPlan: string): Tarea | null {
  if (!bruto || typeof bruto !== "object") return null;
  const id = String(bruto.id ?? "").trim();
  if (!id) {
    avisos.push(`plan ${idPlan}: se descartó una tarea sin id.`);
    return null;
  }
  const estado: EstadoTarea = ESTADOS_TAREA.includes(bruto.estado) ? bruto.estado : "pendiente";
  if (bruto.estado != null && !ESTADOS_TAREA.includes(bruto.estado)) {
    avisos.push(`plan ${idPlan}: la tarea #${id} traía estado desconocido («${String(bruto.estado)}»); se pone «pendiente».`);
  }
  const peso: Peso = esPeso(bruto.peso) ? bruto.peso : "io";
  if (bruto.peso != null && !esPeso(bruto.peso)) {
    avisos.push(`plan ${idPlan}: la tarea #${id} traía peso desconocido; se trata como «io».`);
  }
  return {
    id,
    titulo: String(bruto.titulo ?? `tarea ${id}`),
    peso,
    dependeDe: Array.isArray(bruto.dependeDe) ? bruto.dependeDe.map((d: any) => String(d)) : [],
    estado,
    intentos: Number.isFinite(bruto.intentos) ? Number(bruto.intentos) : 0,
    motivoEspera: typeof bruto.motivoEspera === "string" ? bruto.motivoEspera : undefined,
    iniciadaEn: Number.isFinite(bruto.iniciadaEn) ? Number(bruto.iniciadaEn) : undefined,
    terminadaEn: Number.isFinite(bruto.terminadaEn) ? Number(bruto.terminadaEn) : undefined,
    resultado: bruto.resultado && typeof bruto.resultado === "object" ? bruto.resultado : undefined,
    error: bruto.error && typeof bruto.error === "object" ? bruto.error : undefined,
    coste: bruto.coste && typeof bruto.coste === "object" ? bruto.coste : undefined,
    tipo: typeof bruto.tipo === "string" ? bruto.tipo : undefined,
    datos: normalizarDatos(bruto.datos, avisos, idPlan, id),
    claveCircuito: typeof bruto.claveCircuito === "string" ? bruto.claveCircuito : undefined,
    esperasCircuito: Number.isFinite(bruto.esperasCircuito) ? Number(bruto.esperasCircuito) : undefined,
    bloqueoCircuito: bruto.bloqueoCircuito === true ? true : undefined,
    esperaHasta: Number.isFinite(bruto.esperaHasta) ? Number(bruto.esperaHasta) : undefined,
  };
}

function normalizarPlan(bruto: any, avisos: string[]): Plan | null {
  if (!bruto || typeof bruto !== "object") return null;
  const id = String(bruto.id ?? "").trim();
  if (!id) {
    avisos.push("se descartó un plan sin id.");
    return null;
  }
  if (!Array.isArray(bruto.tareas)) {
    avisos.push(`plan ${id}: no traía lista de tareas; se descarta.`);
    return null;
  }

  const tareas = bruto.tareas.map((t: any) => normalizarTarea(t, avisos, id)).filter(Boolean) as Tarea[];

  // Dependencias que apuntan a tareas que ya no están: se quitan y se avisa. Un
  // plan con una dependencia fantasma se quedaría bloqueado para siempre sin
  // explicar por qué.
  const ids = new Set(tareas.map((t) => t.id));
  for (const t of tareas) {
    const rotas = t.dependeDe.filter((d) => !ids.has(d));
    if (rotas.length > 0) {
      t.dependeDe = t.dependeDe.filter((d) => ids.has(d));
      avisos.push(`plan ${id}: la tarea #${t.id} dependía de ${rotas.map((r) => `#${r}`).join(", ")}, que ya no existe; se quitó esa dependencia.`);
    }
  }

  const estado: EstadoPlan = ESTADOS_PLAN.includes(bruto.estado) ? bruto.estado : "pendiente";
  if (bruto.estado != null && !ESTADOS_PLAN.includes(bruto.estado)) {
    avisos.push(`plan ${id}: estado desconocido («${String(bruto.estado)}»); se pone «pendiente».`);
  }

  return {
    id,
    objetivo: String(bruto.objetivo ?? "(sin objetivo)"),
    creadoEn: Number.isFinite(bruto.creadoEn) ? Number(bruto.creadoEn) : Date.now(),
    estado,
    tareas,
    resumen: bruto.resumen && typeof bruto.resumen === "object" ? bruto.resumen : undefined,
    noTerminadas: Array.isArray(bruto.noTerminadas) ? bruto.noTerminadas : undefined,
    errorValidacion: typeof bruto.errorValidacion === "string" ? bruto.errorValidacion : undefined,
    log: Array.isArray(bruto.log) ? bruto.log.map((l: any) => String(l)) : [],
    cancelacionSolicitada: false,
  };
}

export interface ResultadoCarga {
  planes: Plan[];
  avisos: string[];
  /** true si el texto no se pudo leer y se partió de cero. */
  vacio: boolean;
}

/**
 * Lee lo guardado. **Nunca lanza.** Si el fichero está corrupto, a medias o es de
 * otra versión, se rescata lo que se pueda y se dice exactamente qué se reparó —
 * perder planes en silencio sería justo el fallo que este proyecto no se permite.
 */
export function deserializarPlanes(texto: string | null | undefined): ResultadoCarga {
  const avisos: string[] = [];
  if (!texto || !texto.trim()) return { planes: [], avisos, vacio: true };

  let data: any;
  try {
    data = JSON.parse(texto);
  } catch (e: any) {
    return { planes: [], avisos: [`El fichero de planes no es JSON válido (${e?.message || e}); se empieza de cero.`], vacio: true };
  }

  const version = Number(data?.version);
  if (Number.isFinite(version) && version > VERSION_PLANES) {
    avisos.push(`Los planes son de una versión más nueva (${version} > ${VERSION_PLANES}); se intentará leer igual.`);
  }

  const lista = Array.isArray(data?.planes) ? data.planes : [];
  const planes: Plan[] = [];
  const vistos = new Set<string>();
  for (const bruto of lista) {
    const p = normalizarPlan(bruto, avisos);
    if (!p) continue;
    if (vistos.has(p.id)) {
      avisos.push(`plan ${p.id} repetido en el fichero; se conserva el primero.`);
      continue;
    }
    vistos.add(p.id);
    planes.push(p);
  }
  return { planes, avisos, vacio: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reanudar tras un reinicio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un plan que quedó «en_curso» cuando el proceso murió NO se está ejecutando:
 * nadie lo está moviendo. Se marca «pausado» para no mentir, y queda listo para
 * reanudar. Las tareas «hecha» se respetan: no se repiten.
 */
export function marcarInterrumpidos(planes: Plan[], ahora = Date.now()): { planes: Plan[]; interrumpidos: string[] } {
  const interrumpidos: string[] = [];
  for (const p of planes) {
    if (p.estado !== "en_curso") continue;
    p.estado = "pausado";
    interrumpidos.push(p.id);
    const hechas = p.tareas.filter((t) => t.estado === "hecha").length;
    p.log = p.log || [];
    p.log.push(
      `[plan ${p.id}] ⏸ pausado: el servidor se reinició mientras estaba en curso. ` +
        `Se conservan ${hechas}/${p.tareas.length} tarea(s) hecha(s); las que estaban en curso vuelven a la cola.`
    );
    // Las que estaban corriendo ya no corren. Se devuelven a la cola para que el
    // panel no muestre un «en curso» que es mentira.
    for (const t of p.tareas) {
      if (t.estado === "en_curso") {
        t.estado = "pendiente";
        t.motivoEspera = "estaba en curso cuando se reinició el servidor";
      }
    }
    // Si no había nada hecho, es más honesto reconocerlo.
    if (hechas === 0 && p.tareas.every((t) => t.estado === "pendiente")) {
      p.log.push(`[plan ${p.id}] no se había completado ninguna tarea todavía; se reanudará desde el principio.`);
    }
    void ahora;
  }
  return { planes, interrumpidos };
}

/** Deja el plan listo para volver a ejecutarse (sin tocar lo ya hecho). */
export function prepararReanudacion(plan: Plan): Plan {
  plan.cancelacionSolicitada = false;
  plan.estado = "pendiente";
  for (const t of plan.tareas) {
    // Vuelve a la cola lo que no llegó a nada; lo hecho y lo descartado se respeta.
    if (t.estado !== "hecha" && t.estado !== "descartada") {
      t.estado = "pendiente";
      t.bloqueoCircuito = undefined;
      t.esperaHasta = undefined;
      t.motivoEspera = undefined;
    }
  }
  plan.noTerminadas = undefined;
  plan.log = plan.log || [];
  plan.log.push(`[plan ${plan.id}] ▶ reanudado a petición del usuario.`);
  return plan;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

export function buscarPlan(planes: Plan[], id: string): Plan | undefined {
  return planes.find((p) => p.id === id);
}

/** Añade o reemplaza por id (sin duplicar). */
export function upsertPlan(planes: Plan[], plan: Plan): Plan[] {
  const i = planes.findIndex((p) => p.id === plan.id);
  if (i >= 0) planes[i] = plan;
  else planes.push(plan);
  return planes;
}

/** Id nuevo: numérico y creciente, fácil de leer en el panel y en el log. */
export function siguienteIdPlan(planes: Plan[]): string {
  let max = 0;
  for (const p of planes) {
    const n = Number(p.id);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

/**
 * Poda: se conservan los planes sin terminar (siempre) y los finalizados más
 * recientes. Un plan pausado NO se tira nunca — puede ser el trabajo de media hora.
 */
export function podarPlanes(
  planes: Plan[],
  ahora = Date.now(),
  maxFinalizados = MAX_PLANES_FINALIZADOS,
  maxAntiguedadMs = MAX_ANTIGUEDAD_MS
): { planes: Plan[]; descartados: string[] } {
  const sinTerminar = planes.filter((p) => !planFinalizado(p));
  const finalizados = planes
    .filter((p) => planFinalizado(p))
    .sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));

  const conservados: Plan[] = [];
  const descartados: string[] = [];
  finalizados.forEach((p, i) => {
    const viejo = ahora - (p.creadoEn || 0) > maxAntiguedadMs;
    if (i < maxFinalizados && !viejo) conservados.push(p);
    else descartados.push(p.id);
  });

  return { planes: [...sinTerminar, ...conservados], descartados };
}

/** Cuántas tareas hay en cada estado, para el panel. */
export function contarEstados(plan: Plan): Record<string, number> {
  const c: Record<string, number> = {};
  for (const t of plan.tareas) c[t.estado] = (c[t.estado] || 0) + 1;
  return c;
}
