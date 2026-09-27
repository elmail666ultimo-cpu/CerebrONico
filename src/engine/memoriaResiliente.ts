/**
 * memoriaResiliente.ts — LA ESCALERA MR (v2.2)
 * ============================================
 * "MR" = Memoria Resiliente. Son los TRAMOS de capacidad sobre los que el motor
 * sabe trabajar, de menor a mayor:
 *
 *     MR#1 · 4 GB   MR#2 · 8 GB   MR#3 · 16 GB   MR#4 · 32 GB
 *
 * El motor queda CONSTRUIDO Y FUNCIONAL hasta MR#4 (32 GB), aunque la máquina de
 * hoy sea menor: el tramo de arriba está definido, probado y se puede forzar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REGLA QUE MANDA SOBRE TODAS LAS DEMÁS
 * ─────────────────────────────────────────────────────────────────────────────
 * El usuario lo dijo claro: **"es bueno terminar el proceso aunque mi máquina no
 * lo soporte"**. Por eso este módulo NO tiene ningún camino que devuelva 0.
 *
 *     io  >= 1  y  cpu >= 1     SIEMPRE. Sin excepciones.
 *
 * Si no hay RAM, si el tramo está forzado por encima de lo que la máquina tiene,
 * si el escalado ×8 es una barbaridad para 8 GB: el presupuesto BAJA y se marca
 * `degradado: true` con el motivo escrito. Lo que NO hace es negarse, ni
 * devolver 0, ni dejar tareas sin lanzar para siempre. Irá más lento. Terminará.
 *
 * Esto es una diferencia real con el resto del motor: `hardwareGovernor` dice
 * "esto no cabe AHORA" y recomienda esperar (es correcto para activar funciones
 * caras). Aquí no se espera: se reparte menos y se acaba.
 *
 * El módulo es LÓGICA PURA: sin `fs`, sin `os`, sin red. Todo entra por
 * parámetros, así que las pruebas son deterministas y reproducibles.
 */

import type { Tier } from "./hardwareGovernor";

export type MRId = "MR1" | "MR2" | "MR3" | "MR4";

export interface PerfilMR {
  id: MRId;
  /** Nombre para la interfaz. */
  nombre: string;
  /** RAM del tramo, en GB. */
  ramGB: number;
  /** Concurrencia base de tareas de espera (modelo, red, disco). */
  ioBase: number;
  /** Concurrencia base de tareas que queman CPU. */
  cpuBase: number;
  /** Contexto máximo por tarea, en tokens. */
  contextoPorTarea: number;
  /** Coste aproximado en GB de mantener una tarea viva de cada tipo. */
  costeTareaGB: { io: number; cpu: number };
  /** Colchón de RAM libre que hay que dejar para que el sistema respire. */
  margenLibreGB: number;
  /** Cada cuántas tareas terminadas se guarda el progreso en disco. */
  checkpointCadaTareas: number;
  /** Modelo aconsejado para este tramo. */
  modeloRecomendado: string;
  /** Modelo mínimo con el que el tramo sigue siendo útil. */
  modeloMinimo: string;
  /** Tramo equivalente del gobernador de hardware (si existe). */
  tierGobernador: Tier | null;
  notas: string[];
}

/**
 * Los cuatro tramos. Los números de RAM son los que fijó el usuario (4/8/16/32).
 * Las concurrencias y los costes son ÓRDENES DE MAGNITUD para decidir, no medidas
 * de una máquina concreta — la misma honestidad que ya aplica `hardwareGovernor`
 * en su cabecera.
 */
export const PERFILES_MR: Record<MRId, PerfilMR> = {
  MR1: {
    id: "MR1",
    nombre: "Memoria Resiliente Nº1",
    ramGB: 4,
    ioBase: 2,
    cpuBase: 1,
    contextoPorTarea: 2048,
    costeTareaGB: { io: 0.25, cpu: 0.4 },
    margenLibreGB: 1.0,
    checkpointCadaTareas: 2,
    modeloRecomendado: "qwen2.5-coder:0.5b",
    modeloMinimo: "qwen2.5:0.5b",
    // El gobernador no tenía tramo por debajo de 8 GB: MR#1 lo cubre.
    tierGobernador: null,
    notas: [
      "Tramo de arranque: máquinas de 4 GB, o de 8 GB con el navegador y Ollama ya cargados.",
      "Contexto corto (2048) a propósito: con 4 GB, un contexto largo es lo primero que hace paginar.",
    ],
  },
  MR2: {
    id: "MR2",
    nombre: "Memoria Resiliente Nº2",
    ramGB: 8,
    ioBase: 3,
    cpuBase: 1,
    contextoPorTarea: 4096,
    costeTareaGB: { io: 0.3, cpu: 0.5 },
    margenLibreGB: 1.5,
    checkpointCadaTareas: 3,
    modeloRecomendado: "qwen2.5-coder:1.5b.ollama",
    modeloMinimo: "qwen2.5-coder:0.5b",
    tierGobernador: "V2.0",
    notas: [
      "Es tu máquina actual. Tres tareas de espera a la vez es lo que el paralelismo debe demostrar aquí.",
      "CPU a 1 siempre: con 2-4 núcleos, dos tareas de cálculo a la vez solo cambian de contexto.",
    ],
  },
  MR3: {
    id: "MR3",
    nombre: "Memoria Resiliente Nº3",
    ramGB: 16,
    ioBase: 5,
    cpuBase: 2,
    contextoPorTarea: 8192,
    costeTareaGB: { io: 0.4, cpu: 0.7 },
    margenLibreGB: 2.5,
    checkpointCadaTareas: 5,
    modeloRecomendado: "qwen2.5-coder:7b",
    modeloMinimo: "qwen2.5-coder:1.5b.ollama",
    tierGobernador: "V2.2",
    notas: [
      "A partir de aquí ya caben generador y verificador grandes por turnos.",
      "El recomendado (7b) hay que descargarlo; hasta entonces usa el mínimo y el motor funciona igual.",
    ],
  },
  MR4: {
    id: "MR4",
    nombre: "Memoria Resiliente Nº4",
    ramGB: 32,
    ioBase: 8,
    cpuBase: 3,
    contextoPorTarea: 16384,
    costeTareaGB: { io: 0.5, cpu: 0.9 },
    margenLibreGB: 4.0,
    checkpointCadaTareas: 8,
    modeloRecomendado: "qwen2.5-coder:14b",
    modeloMinimo: "qwen2.5-coder:7b",
    tierGobernador: "V2.3",
    notas: [
      "Tramo objetivo: el motor ya está construido y probado para este tamaño.",
      "Es el techo de la escalera tal como la definiste. Se puede forzar en una máquina menor (ver `resolverPresupuesto`).",
    ],
  },
};

export const ORDEN_MR: MRId[] = ["MR1", "MR2", "MR3", "MR4"];

/** Tramo que corresponde a una máquina por su RAM instalada. */
export function elegirMR(ramGB: number): PerfilMR {
  if (!Number.isFinite(ramGB) || ramGB <= 0) return PERFILES_MR.MR1;
  if (ramGB >= 31) return PERFILES_MR.MR4;
  if (ramGB >= 15) return PERFILES_MR.MR3;
  if (ramGB >= 7) return PERFILES_MR.MR2;
  return PERFILES_MR.MR1;
}

// ─────────────────────────────────────────────────────────────────────────────
// El botón: "activar cerebro resiliente ×1 ×2 ×4 ×6 ×8"
// ─────────────────────────────────────────────────────────────────────────────

/** Los escalados que ofrece el botón, en orden de menor a mayor. */
export const ESCALADOS = [1, 2, 4, 6, 8] as const;
export type Escalado = (typeof ESCALADOS)[number];

/** Topes duros: ×8 no puede inventar una concurrencia imposible. */
export const TOPES_DUROS = { io: 16, cpu: 8 } as const;

/** Siguiente valor del botón, ciclando. ×8 → vuelve a ×1 (no se queda atascado arriba). */
export function siguienteEscalado(actual: number): Escalado {
  const i = ESCALADOS.indexOf(actual as Escalado);
  if (i < 0) return ESCALADOS[0];
  return ESCALADOS[(i + 1) % ESCALADOS.length];
}

/** Etiqueta para el botón. */
export function etiquetaEscalado(escalado: number): string {
  return `cerebro resiliente ×${escalado}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Presupuesto: cuántas tareas se lanzan a la vez AHORA MISMO
// ─────────────────────────────────────────────────────────────────────────────

export interface PeticionPresupuesto {
  /** RAM instalada, para elegir tramo. */
  ramMedidaGB: number;
  /** RAM libre de verdad, para el ajuste fino. */
  ramLibreGB: number;
  nucleos: number;
  /** El usuario puede forzar un tramo superior al que le toca. */
  perfilForzado?: MRId;
  /** Valor del botón. Por defecto ×1. */
  escalado?: number;
}

export interface Presupuesto {
  perfil: PerfilMR;
  escalado: Escalado;
  /** Tareas de espera simultáneas. Nunca 0. */
  io: number;
  /** Tareas de cálculo simultáneas. Nunca 0. */
  cpu: number;
  contextoPorTarea: number;
  /** true = se está yendo más lento de lo que el tramo pedía. */
  degradado: boolean;
  /** Por qué cada número es el que es. Se muestra; no se esconde. */
  motivo: string[];
}

/**
 * Decide el reparto de concurrencia. Nunca lanza una excepción y nunca devuelve
 * un valor menor que 1: es la garantía de que el proceso TERMINA.
 */
export function resolverPresupuesto(p: PeticionPresupuesto): Presupuesto {
  const motivo: string[] = [];

  const perfil = p.perfilForzado ? PERFILES_MR[p.perfilForzado] : elegirMR(p.ramMedidaGB);

  // El botón puede traer cualquier número; se normaliza al valor válido más cercano.
  const escalado: Escalado =
    ESCALADOS.find((e) => e === p.escalado) ?? ESCALADOS.reduce((mejor, e) => (Math.abs(e - (p.escalado || 1)) < Math.abs(mejor - (p.escalado || 1)) ? e : mejor), ESCALADOS[0] as Escalado);

  if (p.perfilForzado) {
    const forzadoPorEncima = perfil.ramGB > p.ramMedidaGB;
    motivo.push(
      forzadoPorEncima
        ? `Tramo forzado a ${perfil.nombre} (${perfil.ramGB} GB) en una máquina de ${p.ramMedidaGB} GB: irá justo de memoria, pero termina.`
        : `Tramo forzado a ${perfil.nombre} (${perfil.ramGB} GB).`
    );
  } else {
    motivo.push(`Tramo automático ${perfil.nombre} por ${p.ramMedidaGB} GB de RAM instalada.`);
  }

  const ioPedido = perfil.ioBase * escalado;
  const cpuPedido = perfil.cpuBase * escalado;

  // Topes: los duros del sistema, y en CPU no se pasa de núcleos-1.
  const cpuTopeNucleos = Math.max(1, p.nucleos - 1);
  const ioPorTope = Math.min(ioPedido, TOPES_DUROS.io);
  const cpuPorTope = Math.min(cpuPedido, TOPES_DUROS.cpu, cpuTopeNucleos);

  if (ioPorTope < ioPedido) {
    motivo.push(`Escalado ×${escalado} pedía ${ioPedido} tareas de espera; el tope es ${TOPES_DUROS.io}.`);
  }
  if (cpuPorTope < cpuPedido) {
    motivo.push(
      `Escalado ×${escalado} pedía ${cpuPedido} tareas de cálculo; se queda en ${cpuPorTope} por tope de sistema y por tener ${p.nucleos} núcleo(s).`
    );
  }

  // Ajuste por RAM LIBRE (la instalada es publicidad; la libre es la realidad).
  const aprovechable = Math.max(0, p.ramLibreGB - perfil.margenLibreGB);
  const ioPorRam = Math.floor(aprovechable / perfil.costeTareaGB.io);
  const cpuPorRam = Math.floor(aprovechable / perfil.costeTareaGB.cpu);

  // El mínimo es 1 aunque no quepa nada: degradamos, no abandonamos.
  const io = Math.max(1, Math.min(ioPorTope, ioPorRam));
  const cpu = Math.max(1, Math.min(cpuPorTope, cpuPorRam));

  if (io < ioPorTope || cpu < cpuPorTope) {
    motivo.push(
      `RAM libre ${p.ramLibreGB} GB (aprovechable ${aprovechable.toFixed(1)} GB tras dejar ${perfil.margenLibreGB} GB de colchón): caben ${ioPorRam} de espera y ${cpuPorRam} de cálculo.`
    );
  }
  if (aprovechable < perfil.costeTareaGB.io) {
    motivo.push(
      `Aviso: la RAM libre no da ni para una tarea. Se sigue con 1 a la vez — más lento, pero el proceso TERMINA.`
    );
  }

  const degradado = io < ioPedido || cpu < cpuPedido;

  return { perfil, escalado, io, cpu, contextoPorTarea: perfil.contextoPorTarea, degradado, motivo };
}

/**
 * Comprobación de la invariante, para poder afirmarla en las pruebas y en el
 * log: cualquier presupuesto que salga de aquí sirve para avanzar.
 */
export function esPresupuestoSeguro(b: Presupuesto): boolean {
  return Number.isFinite(b.io) && Number.isFinite(b.cpu) && b.io >= 1 && b.cpu >= 1;
}
