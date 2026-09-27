/**
 * taskPlanner.ts — EL CEREBRO DE TAREAS (v2.2)
 * ============================================
 * Convierte un objetivo en una LISTA de tareas con dependencias explícitas y
 * ejecuta EN PARALELO las que son independientes, en vez de encadenarlas de una
 * en una. Es lo que pediste recordar, y el orden de las ideas importa:
 *
 *   1. lista de tareas con ESTADO (pendiente / lista / en curso / hecha / …)
 *   2. DEPENDENCIAS explícitas (qué bloquea a qué)
 *   3. paralelismo de las independientes, con el reparto que fije la escalera MR
 *   4. TODO VISIBLE: cada transición deja una línea, y los motivos se escriben
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LAS TRES REGLAS QUE NO SE ROMPEN
 * ─────────────────────────────────────────────────────────────────────────────
 * A) TERMINAR MANDA. Ninguna tarea se descarta por falta de recursos: se
 *    retrasa. El presupuesto de `memoriaResiliente` nunca baja de 1, así que
 *    siempre hay algo avanzando y el bucle no puede quedarse parado.
 *
 * B) EL AGREGADO NO MIENTE. Al terminar, `resumenPlan` dice cuántas se hicieron y
 *    **cuáles no**, con el motivo. Un plan con una tarea fallida NUNCA se reporta
 *    como "hecho". Si alguna se quedó sin terminar, sale en `noTerminadas`.
 *
 * C) NO SE ESPERA A TODAS, SE ESPERA A LA PRIMERA. Si esperas a que acabe el
 *    grupo entero, la tarea lenta bloquea el hueco de las rápidas y acabas en
 *    secuencial disfrazado de paralelo. Se espera a la primera que termine.
 *
 * El ejecutor es INYECTABLE (`Ejecutor`), así que este módulo sirve igual para
 * tareas de modelo que para tareas de herramienta, sin cambiar una línea aquí.
 * Y todo es lógica pura salvo el propio ejecutor: se puede probar sin modelo, sin
 * red y sin suerte.
 */

import {
  resolverPresupuesto,
  esPresupuestoSeguro,
  type MRId,
  type PeticionPresupuesto,
} from "./memoriaResiliente";
import { classifyError, isCircuitOpen, recordFailure, recordSuccess, type ErrorClass } from "./resilience";

/**
 * Clases de error que cuentan como "el proveedor se cae", para el cortacircuito.
 * Las de configuración (fatal, auth) NO cuentan: con un tipo de tarea mal escrito
 * o una clave inválida el circuito no debe abrirse, porque el fallo no depende
 * del proveedor — reintentarlo ni esperarlo no lo arregla.
 */
const CLASES_DE_CIRCUITO: ReadonlySet<string> = new Set(["retryable", "timeout", "offline", "quota"]);

// ─────────────────────────────────────────────────────────────────────────────
// Modelo
// ─────────────────────────────────────────────────────────────────────────────

/** "io" = la tarea espera (modelo, red, disco). "cpu" = la tarea calcula. */
export type Peso = "io" | "cpu";

export type EstadoTarea =
  | "pendiente" // aún tiene dependencias sin terminar
  | "lista" // dependencias hechas: candidata a lanzarse YA
  | "en_curso"
  | "hecha"
  | "fallida"
  | "bloqueada" // una dependencia falló/se descartó: no puede seguir
  | "cancelada"
  | "descartada";

export interface ResultadoTarea {
  resumen: string;
  artefactos?: string[];
  tokensAprox?: number;
}

export interface Tarea {
  id: string;
  titulo: string;
  peso: Peso;
  dependeDe: string[];
  estado: EstadoTarea;
  intentos: number;
  /** POR QUÉ no está corriendo. Texto para personas, no un código. */
  motivoEspera?: string;
  iniciadaEn?: number;
  terminadaEn?: number;
  resultado?: ResultadoTarea;
  error?: { clase: ErrorClass; mensaje: string };
  coste?: { ms: number };
  /**
   * QUÉ ejecuta la tarea. El planificador no lo interpreta: se lo pasa al
   * ejecutor inyectado, que decide. Por defecto "modelo".
   */
  tipo?: string;
  /**
   * CON QUÉ parámetros: el prompt, la ruta del archivo, el comando… Es lo que
   * convierte una tarea en algo ejecutable de verdad. Se persiste junto al plan.
   */
  datos?: Record<string, unknown>;
  /** Clave del cortacircuito a consultar antes de lanzar (ej. "ollama"). */
  claveCircuito?: string;
  /**
   * GRUPO v1 (Reflejo v5): equipo de espejos con el que esta tarea piensa
   * trabajar ("codigo" | "arte" | "ciencia" | "cuantica" | ""). Lo decide
   * `grupoPorTarea` por contenido o lo fija el autor del plan; el panel lo
   * muestra y el ejecutor lo usa de contexto. No cambia el despacho: es
   * información honesta, no magia.
   */
  grupo?: string;
  /** Cuántas veces se ha esperado ya a que se enfríe el cortacircuito. */
  esperasCircuito?: number;
  /** Marcada como bloqueada definitivamente por cortacircuito (no se revive). */
  bloqueoCircuito?: boolean;
  /** No lanzar antes de esta marca de tiempo (enfriamiento del cortacircuito). */
  esperaHasta?: number;
}

export type EstadoPlan =
  | "pendiente"
  | "en_curso"
  /** El servidor se reinició: nadie lo está ejecutando, pero se puede reanudar. */
  | "pausado"
  | "hecho"
  | "parcial"
  | "fallido"
  | "cancelado";

/** Fuente única de verdad de los estados, para validar al cargar de disco. */
export const ESTADOS_TAREA: EstadoTarea[] = [
  "pendiente",
  "lista",
  "en_curso",
  "hecha",
  "fallida",
  "bloqueada",
  "cancelada",
  "descartada",
];

export const ESTADOS_PLAN: EstadoPlan[] = [
  "pendiente",
  "en_curso",
  "pausado",
  "hecho",
  "parcial",
  "fallido",
  "cancelado",
];

/** Un plan en estado final ya no se va a mover solo. */
export function planFinalizado(p: { estado: EstadoPlan }): boolean {
  return p.estado === "hecho" || p.estado === "parcial" || p.estado === "fallido" || p.estado === "cancelado";
}

export interface Plan {
  id: string;
  objetivo: string;
  creadoEn: number;
  estado: EstadoPlan;
  tareas: Tarea[];
  /** Se rellena al ejecutar. */
  resumen?: ResumenPlan;
  /** Lo que NO llegó a estado terminal, con su motivo. */
  noTerminadas?: Array<{ id: string; titulo: string; estado: EstadoTarea; motivo: string }>;
  /** Se pide la cancelación poniendo esto a true (o con `solicitarCancelacion`). */
  cancelacionSolicitada?: boolean;
  errorValidacion?: string;
  /** Traza legible para el panel. */
  log?: string[];
}

export interface ResumenPlan {
  hechas: number;
  fallidas: number;
  descartadas: number;
  canceladas: number;
  bloqueadas: number;
  sinHacer: string[];
}

/** Lo que ejecuta una tarea. Se inyecta: modelo, herramienta, lo que toque. */
export type Ejecutor = (tarea: Tarea, senal: AbortSignal) => Promise<ResultadoTarea>;

/** Medición de la máquina, inyectable para poder probar sin depender del equipo. */
export interface MedidorMaquina {
  (): { ramMedidaGB: number; ramLibreGB: number; nucleos: number };
}

export interface OpcionesPlan {
  ejecutar: Ejecutor;
  medir: MedidorMaquina;
  /**
   * Tramo MR forzado. Igual que `escalado`, admite una función para que el
   * selector de tramo afecte TAMBIÉN a los planes que ya están corriendo: se
   * consulta en cada vuelta del bucle, no una vez al empezar.
   */
  perfilForzado?: MRId | (() => MRId | undefined);
  /**
   * Escalado del botón. Puede ser un número o una FUNCIÓN que lo devuelva.
   *
   * La función es la que permite que ×2 ×4 ×6 ×8 afecte a un plan YA EN MARCHA:
   * se consulta en cada vuelta del bucle. Con un número fijo, el botón solo
   * tendría efecto en los planes futuros, que no es lo que uno espera al pulsarlo.
   */
  escalado?: number | (() => number);
  maxIntentosPorTarea?: number;
  /**
   * Espera (ms) antes de reintentar un fallo `quota`/429. La capa gratuita de
   * imagen deja ~1 petición en vuelo por IP, así que reintentar a los 2 s es el
   * mismo 429: se espera a que se drene la cola. Por defecto 45 s (extremo alto
   * medido); se inyecta para probar sin esperar de verdad.
   */
  backoffQuotaMs?: number;
  /** Tope para esperar a una cancelación antes de darla por hecha. */
  timeoutCancelacionMs?: number;
  /** Cuántas veces se espera a que se enfríe un cortacircuito antes de rendirse. */
  maxEsperasCircuito?: number;
  /** Cuánto se espera en cada enfriamiento (acotado: esperar también es avanzar). */
  esperaCircuitoMs?: number;
  log?: (linea: string) => void;
  /**
   * Se llama CADA VEZ que una tarea llega a un estado final (hecha, fallida,
   * cancelada) o vuelve a la cola para reintentarse.
   *
   * Es el punto de guardado: persistir aquí y no al final del plan es lo que
   * hace que un corte de luz no borre el trabajo ya hecho. El motor no sabe de
   * disco ni de ficheros: solo avisa. Quien escuche decide.
   */
  alTerminarTarea?: (plan: Plan, tarea: Tarea) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de estado
// ─────────────────────────────────────────────────────────────────────────────

const MAX_LINEAS_LOG = 400;

export function esTerminal(e: EstadoTarea): boolean {
  return e === "hecha" || e === "fallida" || e === "descartada" || e === "cancelada";
}

function anotar(plan: Plan, linea: string, op?: OpcionesPlan): void {
  const conHora = `[plan ${plan.id}] ${linea}`;
  if (!plan.log) plan.log = [];
  plan.log.push(conHora);
  if (plan.log.length > MAX_LINEAS_LOG) plan.log.splice(0, plan.log.length - MAX_LINEAS_LOG);
  try {
    op?.log?.(conHora);
  } catch {
    /* el log nunca puede tumbar una ejecución */
  }
}

/**
 * El peso por defecto según el tipo (GRUPO v1 · Reflejo v5).
 *
 * 🐞 DEFECTO v1.0.3: `crearPlan` ponía `"io"` a ciegas, así que las tareas
 * `reflejo` —espejos deterministas de ~1 ms, CPU pura— ocupaban los cupos
 * de IO del presupuesto MR y desplazaban a las que sí esperan (modelo, red,
 * disco). En un plan con 6 espejos y 2 llamadas al modelo, el modelo se
 * quedaba sin hueco mientras los espejos "esperaban" en un carril que no es
 * el suyo. Un espejo en cola de IO es un plan lento mintiéndose rápido.
 */
export function pesoPorDefecto(tipo: string): Peso {
  return tipo === "reflejo" ? "cpu" : "io";
}

/** Crea un plan normalizando tareas: asigna ids si faltan y estado inicial. */
export function crearPlan(objetivo: string, tareas: Array<Partial<Tarea> & { titulo: string }>, id?: string): Plan {
  return {
    id: id || String(Date.now()),
    objetivo,
    creadoEn: Date.now(),
    estado: "pendiente",
    tareas: tareas.map((t, i) => ({
      id: t.id || String(i + 1),
      titulo: t.titulo,
      // GRUPO v1: el peso declarado manda; si no hay declaración, el tipo
      // decide (los espejos van al carril cpu, lo que espera red/disco al io).
      peso: t.peso || pesoPorDefecto(t.tipo || "modelo"),
      dependeDe: t.dependeDe || [],
      estado: t.estado || "pendiente",
      intentos: t.intentos || 0,
      tipo: t.tipo || "modelo",
      datos: t.datos,
      claveCircuito: t.claveCircuito,
      // GRUPO v1: equipo de espejos sugerido para la tarea (display/auditoría).
      grupo: t.grupo,
    })),
    log: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Grafo: validación, ciclos y orden
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida el plan ANTES de ejecutarlo. Dos cosas: que las dependencias existan y
 * que no haya ciclos. Un ciclo se DEVUELVE como texto legible (`#a → #b → #a`) —
 * nunca se intenta ejecutar, porque un ciclo no termina: se cuelga.
 */
export function validarPlan(plan: Plan): { ok: boolean; error?: string } {
  const ids = new Set<string>();
  for (const t of plan.tareas) {
    if (ids.has(t.id)) return { ok: false, error: `El id #${t.id} está repetido: cada tarea necesita un id único.` };
    ids.add(t.id);
  }
  for (const t of plan.tareas) {
    for (const d of t.dependeDe) {
      if (!ids.has(d)) {
        return { ok: false, error: `La tarea #${t.id} ("${t.titulo}") depende de #${d}, que no existe en el plan.` };
      }
      if (d === t.id) {
        return { ok: false, error: `La tarea #${t.id} ("${t.titulo}") depende de sí misma.` };
      }
    }
  }

  // Detección de ciclos con los tres colores del recorrido en profundidad.
  const color = new Map<string, 0 | 1 | 2>(); // 0 sin visitar · 1 en la pila · 2 cerrado
  const pila: string[] = [];
  const porId = new Map(plan.tareas.map((t) => [t.id, t] as const));

  const visitar = (id: string): string | null => {
    color.set(id, 1);
    pila.push(id);
    const t = porId.get(id)!;
    for (const d of t.dependeDe) {
      const c = color.get(d) ?? 0;
      if (c === 1) {
        const desde = pila.indexOf(d);
        return [...pila.slice(desde), d].map((x) => `#${x}`).join(" → ");
      }
      if (c === 0) {
        const r = visitar(d);
        if (r) return r;
      }
    }
    pila.pop();
    color.set(id, 2);
    return null;
  };

  for (const t of plan.tareas) {
    if ((color.get(t.id) ?? 0) === 0) {
      const ciclo = visitar(t.id);
      if (ciclo) {
        return {
          ok: false,
          error: `Ciclo de dependencias: ${ciclo}. El plan no se puede ejecutar así (se colgaría); quita una de esas dependencias.`,
        };
      }
    }
  }
  return { ok: true };
}

/**
 * Recalcula qué tareas están listas. Se llama en CADA vuelta del bucle, porque
 * lo que está listo cambia en cuanto termina una tarea.
 *
 * Deja el motivo escrito en las que aún no pueden correr: saber POR QUÉ espera
 * algo es la mitad de la utilidad de un panel.
 */
export function resolverListas(plan: Plan): void {
  for (const t of plan.tareas) {
    if (t.estado !== "pendiente" && t.estado !== "lista" && t.estado !== "bloqueada") continue;

    // Las bloqueadas por cortacircuito NO se reviven aquí. Si se revivieran,
    // volverían a bloquearse en la misma vuelta del bucle y el plan giraría sin
    // avanzar: el clásico bucle infinito con el log lleno y nada hecho.
    if (t.bloqueoCircuito) continue;

    if (t.dependeDe.length === 0) {
      t.estado = "lista";
      t.motivoEspera = undefined;
      continue;
    }

    const deps = t.dependeDe.map((id) => plan.tareas.find((x) => x.id === id)!).filter(Boolean);
    const sinTerminar = deps.filter((d) => d.estado !== "hecha");
    const rotas = sinTerminar.filter((d) => d.estado === "fallida" || d.estado === "descartada" || d.estado === "cancelada");

    if (rotas.length > 0) {
      t.estado = "bloqueada";
      t.motivoEspera = `bloqueada por ${rotas.map((r) => `#${r.id} "${r.titulo}" (${r.estado})`).join(", ")}`;
    } else if (sinTerminar.length === 0) {
      t.estado = "lista";
      t.motivoEspera = undefined;
    } else {
      t.estado = "pendiente";
      t.motivoEspera = `espera a ${sinTerminar.map((d) => `#${d.id}`).join(", ")}`;
    }
  }
}

/** Orden topológico (Kahn). Para el panel y los informes, no para ejecutar. */
export function ordenTopologico(plan: Plan): Tarea[] {
  const porId = new Map(plan.tareas.map((t) => [t.id, t] as const));
  const pendientes = new Set(plan.tareas.map((t) => t.id));
  const hechas = new Set<string>();
  const salida: Tarea[] = [];

  while (pendientes.size > 0) {
    const capa = [...pendientes].filter((id) => porId.get(id)!.dependeDe.every((d) => hechas.has(d)));
    if (capa.length === 0) break; // ciclo: se sale sin colgarse
    capa.sort();
    for (const id of capa) {
      salida.push(porId.get(id)!);
      pendientes.delete(id);
      hechas.add(id);
    }
  }
  return salida;
}

/** Agregado honesto: qué se hizo y qué no. */
export function resumenPlan(plan: Plan): ResumenPlan {
  const c = (e: EstadoTarea) => plan.tareas.filter((t) => t.estado === e).length;
  return {
    hechas: c("hecha"),
    fallidas: c("fallida"),
    descartadas: c("descartada"),
    canceladas: c("cancelada"),
    bloqueadas: c("bloqueada"),
    sinHacer: plan.tareas.filter((t) => t.estado !== "hecha").map((t) => `#${t.id} ${t.titulo} (${t.estado})`),
  };
}

/**
 * Pide la cancelación. No se limita a dejar una bandera: DESPIERTA al bucle en
 * el acto.
 *
 * Sin esto, la cancelación solo se notaba cuando casualmente terminaba la
 * siguiente tarea, así que con tres tareas de 3 segundos el usuario pulsaba
 * «cancelar» y seguía esperando. Peor: las tareas que acabaran en ese hueco
 * figuraban como hechas, que es justo lo que no puede pasar.
 */
export function solicitarCancelacion(plan: Plan, _motivo?: string): void {
  plan.cancelacionSolicitada = true;
  const despertar = (plan as any).__despertarCancelacion;
  if (typeof despertar === "function") {
    try {
      despertar();
    } catch {}
  }
}

/** Una línea por tarea, para el panel. */
export function lineaEstadoTarea(t: Tarea): string {
  const marca =
    t.estado === "hecha" ? "✓" : t.estado === "en_curso" ? "▶" : t.estado === "fallida" ? "✗" : t.estado === "bloqueada" ? "⊘" : "·";
  const ms = t.coste?.ms != null ? ` ${(t.coste.ms / 1000).toFixed(1)}s` : "";
  const motivo = t.motivoEspera ? `  ← ${t.motivoEspera}` : "";
  return `${marca} #${t.id} ${t.titulo} [${t.estado} · ${t.peso}]${ms}${motivo}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// El bucle de despacho
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ejecuta el plan. Devuelve el MISMO objeto plan, ya con estados, resumen y la
 * lista de lo que no terminó.
 *
 * Por qué el bucle no puede quedarse parado (la garantía de terminación):
 *   · `resolverPresupuesto` devuelve io >= 1 y cpu >= 1 SIEMPRE.
 *   · Si hay alguna tarea "lista", alguna se lanza: o la de espera o la de
 *     cálculo tiene hueco libre, porque el presupuesto mínimo es 1 y no hay
 *     forma de que ambos contadores estén saturados mientras el presupuesto es
 *     como mínimo 1 por tipo.
 *   · Si no hay ninguna "lista" pero SÍ algo en curso, se espera a la primera que
 *     termine: eso también es avanzar.
 *   · Si no hay nada en curso y nada lanzable, el plan ha terminado (o se quedó
 *     con bloqueadas, que se reportan una por una).
 */
export async function ejecutarPlan(plan: Plan, op: OpcionesPlan): Promise<Plan> {
  const v = validarPlan(plan);
  if (!v.ok) {
    plan.estado = "fallido";
    plan.errorValidacion = v.error;
    plan.resumen = resumenPlan(plan);
    plan.noTerminadas = plan.tareas
      .filter((t) => !esTerminal(t.estado))
      .map((t) => ({ id: t.id, titulo: t.titulo, estado: t.estado, motivo: "el plan no pasó la validación" }));
    anotar(plan, `✗ PLAN INVÁLIDO: ${v.error}`, op);
    return plan;
  }

  const maxIntentos = Math.max(1, op.maxIntentosPorTarea ?? 2);
  const timeoutCancelacion = op.timeoutCancelacionMs ?? 10_000;
  const maxEsperasCircuito = Math.max(0, op.maxEsperasCircuito ?? 3);
  const esperaCircuitoMs = Math.max(50, op.esperaCircuitoMs ?? 5_000);
  const backoffQuotaMs = Math.max(100, op.backoffQuotaMs ?? 45_000);

  // REANUDACIÓN: si el plan viene de una ejecución interrumpida (el servidor se
  // reinició, se cerró la pestaña, se fue la luz), puede haber tareas marcadas
  // «en_curso» que YA NO están corriendo — nadie las está ejecutando: este
  // proceso acaba de empezar. Dejarlas así las colgaría para siempre y el plan
  // nunca terminaría. Vuelven a la cola.
  for (const t of plan.tareas) {
    if (t.estado === "en_curso") {
      t.estado = "pendiente";
      t.motivoEspera = "venía en curso de una ejecución interrumpida; se reintenta";
      anotar(plan, `↻ #${t.id} "${t.titulo}" venía en curso de una ejecución interrumpida: vuelve a la cola`, op);
    }
  }

  // Canal para que «cancelar» se note en el acto y no «cuando toque».
  let despertarCancelacion: (() => void) | null = null;
  const esperaCancelacion = new Promise<void>((r) => {
    despertarCancelacion = r;
  });
  (plan as any).__despertarCancelacion = () => {
    if (despertarCancelacion) despertarCancelacion();
  };

  plan.estado = "en_curso";
  const porId = new Map(plan.tareas.map((t) => [t.id, t] as const));

  /** Tareas vivas ahora mismo, con su peso, para contar cupos. */
  const enCurso = new Map<string, { promesa: Promise<void>; ctrl: AbortController; peso: Peso }>();

  /** Para no reportar como "fallido" algo que en realidad se canceló a petición. */
  let cancelado = false;

  /**
   * v2.1 — Firma del último reparto ANOTADO en el log (`tramo×escalado:io/cpu`).
   * Sirve para escribir el presupuesto sólo cuando cambia, y así poder meter el
   * MOTIVO de la degradación dentro de la línea sin inflar el registro.
   */
  let firmaPresupuesto = "";

  const lanzar = (t: Tarea): void => {
    const ctrl = new AbortController();
    t.estado = "en_curso";
    t.intentos += 1;
    t.iniciadaEn = Date.now();
    t.motivoEspera = undefined;
    const t0 = Date.now();

    const promesa = (async () => {
      try {
        const r = await op.ejecutar(t, ctrl.signal);
        t.resultado = r;
        t.estado = "hecha";
        // El cortacircuito también se alimenta con el ÉXITO: sin esto un
        // enfriamiento medio-abierto que prueba y acierta no se cerraría.
        // (v2.3 — antes NADIE llamaba a recordSuccess/recordFailure: el
        // cortacircuito se consultaba y nunca se movía, código muerto del
        // patrón §21. Se consultaba con clave, no se alimentaba.)
        if (t.claveCircuito) recordSuccess(t.claveCircuito);
        anotar(plan, `✓ #${t.id} "${t.titulo}" hecha en ${Date.now() - t0} ms`, op);
      } catch (e: any) {
        const c = classifyError(e);
        // `quota` (429) se reintenta: en la capa gratuita de imagen es la falla
        // pasajera por excelencia («Queue full for IP», medida en vivo: dos
        // imágenes en paralelo la provocan y el reintento sale bien). El tope
        // de `maxIntentosPorTarea` sigue limitando a UN reintento, y el
        // cortacircuito cuenta los 429: si la cola no se drena, las siguientes
        // tareas entran en enfriamiento en vez de quemar intentos.
        const esReintentable = c.kind === "retryable" || c.kind === "timeout" || c.kind === "offline" || c.kind === "quota";
        const quedanIntentos = t.intentos < maxIntentos;
        if (ctrl.signal.aborted) {
          t.estado = "cancelada";
          t.error = { clase: c.kind, mensaje: c.message };
          anotar(plan, `⊘ #${t.id} "${t.titulo}" cancelada`, op);
        } else {
          // El fallo cuenta para el cortacircuito ANTES de decidir el reintento:
          // contra un proveedor caído, tres fallos seguidos abren el circuito y
          // las tareas restantes ENTRAN EN ENFRÍAMIENTO en vez de quemar intentos.
          // Las cancelaciones no cuentan: no es culpa del proveedor. (v2.3 —
          // nadie alimentaba estos contadores: el circuito se consultaba y nunca
          // se movía, que es código muerto del patrón §21.)
          if (t.claveCircuito && CLASES_DE_CIRCUITO.has(c.kind)) recordFailure(t.claveCircuito, c.message);
          if (esReintentable && quedanIntentos) {
            // Vuelve a la cola: no se da por perdida, se reintenta.
            t.estado = "pendiente";
            t.error = { clase: c.kind, mensaje: c.message };
            // Un 429/`quota` NO se reintenta al segundo: la capa gratuita deja
            // ~1 petición en vuelo por IP, así que el reintento inmediato es el
            // mismo 429. Se espera `backoffQuotaMs` (el tiempo que tarda la otra
            // imagen en drenar la cola). El `motivoEspera` se escribe para que el
            // panel muestre POR QUÉ espera, no que está «en cola» sin más.
            if (c.kind === "quota") {
              t.esperaHasta = Date.now() + backoffQuotaMs;
              t.motivoEspera = `esperando a que se drene la cola del proveedor (429, reintento en ${Math.round(backoffQuotaMs / 1000)} s)`;
              anotar(
                plan,
                `↻ #${t.id} "${t.titulo}" falló (quota: ${c.message.slice(0, 100)}) — reintento ${t.intentos + 1}/${maxIntentos} tras ${Math.round(backoffQuotaMs / 1000)} s (drenaje de cola)`,
                op
              );
            } else {
              anotar(
                plan,
                `↻ #${t.id} "${t.titulo}" falló (${c.kind}: ${c.message.slice(0, 120)}) — reintento ${t.intentos + 1}/${maxIntentos}`,
                op
              );
            }
          } else {
            t.estado = "fallida";
            t.error = { clase: c.kind, mensaje: c.message };
            anotar(plan, `✗ #${t.id} "${t.titulo}" FALLIDA (${c.kind}: ${c.message.slice(0, 160)})`, op);
          }
        }
      } finally {
        t.terminadaEn = Date.now();
        t.coste = { ms: Date.now() - t0 };
        enCurso.delete(t.id);
        // Punto de guardado. Nunca dentro del try: si el ejecutor revienta, el
        // aviso tiene que salir igual — un fallo es justo lo que hay que guardar.
        try {
          op.alTerminarTarea?.(plan, t);
        } catch {
          /* guardar no puede tumbar la ejecución */
        }
      }
    })();

    enCurso.set(t.id, { promesa, ctrl, peso: t.peso });
  };

  for (;;) {
    resolverListas(plan);

    // ¿Queda algo por hacer?
    const quedanPendientes = plan.tareas.some((t) => !esTerminal(t.estado) && t.estado !== "bloqueada");
    if (!quedanPendientes && enCurso.size === 0) break;

    // Cancelación pedida: se aborta lo que esté en marcha y se sale.
    if (plan.cancelacionSolicitada) {
      anotar(plan, `⊘ Cancelación solicitada: abortando ${enCurso.size} tarea(s) en curso…`, op);
      for (const { ctrl } of enCurso.values()) {
        try {
          ctrl.abort();
        } catch {}
      }
      const vivos = [...enCurso.values()].map((v) => v.promesa);
      if (vivos.length > 0) {
        await Promise.race([
          Promise.allSettled(vivos),
          new Promise((r) => setTimeout(r, timeoutCancelacion)),
        ]);
      }
      // Las que no llegaron a cerrar su finally se marcan aquí, sin mentir: si
      // alguna terminó de verdad, conserva el estado real que le puso su propia
      // promesa.
      for (const t of plan.tareas) {
        if (t.estado === "en_curso") {
          t.estado = "cancelada";
          t.motivoEspera = "cancelada por el usuario";
        }
      }
      cancelado = true;
      break;
    }

    // Presupuesto AHORA (no al principio): la RAM libre cambia mientras corre.
    const peticion: PeticionPresupuesto = {
      ...op.medir(),
      // Los dos se resuelven AHORA, en cada vuelta: así el botón ×N y el selector
      // de tramo se notan en caliente, sobre lo que ya está corriendo.
      perfilForzado: typeof op.perfilForzado === "function" ? op.perfilForzado() : op.perfilForzado,
      escalado: typeof op.escalado === "function" ? op.escalado() : op.escalado,
    };
    const pres = resolverPresupuesto(peticion);
    const ioEnCurso = [...enCurso.values()].filter((v) => v.peso === "io").length;
    const cpuEnCurso = [...enCurso.values()].filter((v) => v.peso === "cpu").length;
    const ioLibre = pres.io - ioEnCurso;
    const cpuLibre = pres.cpu - cpuEnCurso;
    // v2.1 — Antes se anotaba en CADA vuelta y, cuando iba degradado, decía
    // «DEGRADADO (ver motivos)»: los motivos se calculan al vuelo con la RAM
    // libre del momento, así que al terminar el plan la razón original ya no
    // estaba en ninguna parte y el aviso quedaba sin su causa. Ahora la línea se
    // escribe SÓLO cuando el reparto cambia, y lleva dentro el motivo. Un aviso
    // sin su causa es medio aviso.
    const firma = `${pres.perfil.id}×${pres.escalado}:${pres.io}io/${pres.cpu}cpu${pres.degradado ? "-D" : ""}`;
    if (firma !== firmaPresupuesto) {
      firmaPresupuesto = firma;
      const motivos = pres.degradado && pres.motivo.length > 0 ? ` · MOTIVO: ${pres.motivo.join(" ")}` : "";
      anotar(
        plan,
        `presupuesto: ${pres.perfil.id} ×${pres.escalado} → ${pres.io} io / ${pres.cpu} cpu · en curso ${ioEnCurso} io ${cpuEnCurso} cpu${pres.degradado ? " · DEGRADADO" : ""}${motivos}`,
        op
      );
    }

    const ahoraMs = Date.now();
    // GRUPO v1 · CPU PRIMERO: los espejos deterministas (~1 ms) se lanzan
    // antes que las tareas de espera dentro de la misma vuelta. No es un
    // favor: es aritmética — cada espejo que termina libera dependencias en
    // milisegundos y las tareas que dependen de él entran a la cola siguiente
    // en vez de esperar un turno entero. Las de IO mantienen su orden.
    const listasDeLaVuelta = plan.tareas
      .filter((t) => t.estado === "lista")
      .sort((a, b) => (a.peso === b.peso ? 0 : a.peso === "cpu" ? -1 : 1) || a.id.localeCompare(b.id, "es", { numeric: true }));
    for (const t of listasDeLaVuelta) {
      if (t.estado !== "lista") continue;

      // Enfriamiento pendiente de una vuelta anterior: aún no toca.
      // El motivo se deriva del ÚLTIMO ERROR (resolverListas limpia motivoEspera
      // al pasar a «lista», así que no se puede confiar en el texto anterior):
      // un 429 espera a la cola del proveedor; lo demás, al cortacircuito.
      if (t.esperaHasta && ahoraMs < t.esperaHasta) {
        const quedanS = Math.max(1, Math.ceil((t.esperaHasta - ahoraMs) / 1000));
        t.motivoEspera =
          t.error?.clase === "quota"
            ? `esperando a que se drene la cola del proveedor (429, reintento en ~${quedanS} s)`
            : `esperando a que se enfríe el cortacircuito de "${t.claveCircuito}" (~${quedanS} s)`;
        continue;
      }

      // Cortacircuito abierto: contra un proveedor caído no se queman intentos.
      if (t.claveCircuito && isCircuitOpen(t.claveCircuito)) {
        t.esperasCircuito = (t.esperasCircuito || 0) + 1;
        if (t.esperasCircuito > maxEsperasCircuito) {
          t.estado = "bloqueada";
          t.bloqueoCircuito = true;
          t.motivoEspera = `el cortacircuito de "${t.claveCircuito}" sigue abierto tras ${maxEsperasCircuito} esperas`;
          anotar(plan, `⊘ #${t.id} "${t.titulo}" bloqueada: ${t.motivoEspera}`, op);
          continue;
        }
        t.esperaHasta = Date.now() + esperaCircuitoMs;
        t.motivoEspera = `cortacircuito de "${t.claveCircuito}" abierto (espera ${t.esperasCircuito}/${maxEsperasCircuito})`;
        anotar(plan, `⏸ #${t.id} "${t.titulo}" espera al cortacircuito (${t.esperasCircuito}/${maxEsperasCircuito})`, op);
        continue;
      }

      // ¿Hay hueco de su peso? Se cuenta EN VIVO sobre el mapa: `lanzar()` ya ha
      // metido en él las tareas de esta misma vuelta, así que el contador es
      // correcto sin llevar cuentas paralelas (que es donde estaba el error).
      const vivosPeso = [...enCurso.values()].filter((v) => v.peso === t.peso).length;
      if (vivosPeso >= pres[t.peso]) {
        t.motivoEspera = `sin hueco ${t.peso} (${vivosPeso}/${pres[t.peso]})`;
        continue;
      }

      lanzar(t);
      anotar(plan, `▶ #${t.id} "${t.titulo}" en_curso (${t.peso})`, op);
    }

    // Nada en marcha: o terminó todo, o lo que queda espera a un cortacircuito.
    if (enCurso.size === 0) {
      const enfriamientos = plan.tareas
        .filter((t) => t.esperaHasta && t.esperaHasta > Date.now())
        .map((t) => t.esperaHasta as number);
      if (enfriamientos.length > 0) {
        // Esperar al enfriamiento más próximo es AVANZAR hacia terminar, no
        // quedarse colgado: el tope lo pone `esperaCircuitoMs`.
        const hasta = Math.min(...enfriamientos);
        await new Promise((r) => setTimeout(r, Math.max(0, hasta - Date.now())));
        continue;
      }
      // Terminado, o solo bloqueadas (se reportan una por una al salir).
      break;
    }

    // ESPERAR A LA PRIMERA QUE TERMINE, no a todas. Cada promesa se borra sola
    // del mapa al acabar, así que esto siempre avanza. `esperaCancelacion` va
    // DENTRO del array para que un «cancelar» corte aquí mismo, sin tener que
    // aguardar a que acabe ninguna tarea.
    //
    // OJO, que aquí ya me equivoqué una vez: `Promise.race` acepta UN solo
    // iterable. Escrito como `Promise.race([...promesas], esperaCancelacion)` el
    // segundo argumento se IGNORA en silencio (no da error, no avisa), la
    // cancelación dejaba de ser inmediata y las tareas que acababan en ese hueco
    // figuraban como hechas. El array tiene que incluir el canal de cancelación.
    const promesasVivas = [...enCurso.values()].map((v) => v.promesa);
    await Promise.race([...promesasVivas, esperaCancelacion]);
  }

  plan.cancelacionSolicitada = false;
  plan.resumen = resumenPlan(plan);

  const noTerminadas = plan.tareas.filter((t) => !esTerminal(t.estado));
  plan.noTerminadas = noTerminadas.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    estado: t.estado,
    motivo: t.motivoEspera || "sin motivo registrado",
  }));

  // El orden importa: una cancelación a petición NO es un fallo, y decir
  // "fallido" cuando el usuario pulsó «cancelar» sería exactamente el tipo de
  // mentira que este motor no se permite.
  if (cancelado) plan.estado = "cancelado";
  else if (plan.resumen.hechas === plan.tareas.length) plan.estado = "hecho";
  else if (plan.resumen.hechas > 0) plan.estado = "parcial";
  else plan.estado = "fallido";

  anotar(
    plan,
    `FIN · ${plan.estado} · ${plan.resumen.hechas}/${plan.tareas.length} hechas` +
      (plan.resumen.fallidas ? ` · ${plan.resumen.fallidas} fallidas` : "") +
      (plan.resumen.bloqueadas ? ` · ${plan.resumen.bloqueadas} bloqueadas` : "") +
      (plan.noTerminadas.length ? ` · sin terminar: ${plan.noTerminadas.map((n) => `#${n.id}`).join(", ")}` : ""),
    op
  );

  return plan;
}


