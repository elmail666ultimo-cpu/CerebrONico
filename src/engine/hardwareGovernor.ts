/**
 * hardwareGovernor.ts — GOBERNADOR DE HARDWARE (v2.0)
 * ===================================================
 * Convierte "tengo 8 GB" en decisiones concretas. Mide la máquina de verdad y
 * responde tres preguntas:
 *
 *   1. ¿En qué fase estás? → V2.0 (8 GB) · V2.1 (12) · V2.2 (16) · V2.3 (32)
 *   2. ¿Esta capacidad cabe AHORA MISMO? → compara con la RAM **libre**, no con
 *      la instalada. Un equipo de 16 GB con Chrome abierto y Ollama cargado puede
 *      tener menos hueco que uno de 8 GB recién arrancado. La RAM instalada es
 *      publicidad; la libre es la realidad.
 *   3. Para V2.2, ¿qué modo toca? → trabajo / explorar / nocturno. Con 16 GB no
 *      caben generador y verificador grandes a la vez; el gobernador elige por
 *      turnos, que es lo que convierte 16 GB en mucho más que 12.
 *
 * LÍMITE DE HONESTIDAD: este módulo **no activa nada**. Recomienda y explica. La
 * decisión sigue siendo del botón. Un gobernador que enciende cosas solo es un
 * gobernador que miente sobre lo que ha hecho.
 *
 * Los números de presupuesto son estimaciones de orden de magnitud, no medidas
 * de tu máquina: sirven para decidir, no para auditar. Están marcados como tales.
 */

import * as os from "os";
import type { AdvancedFeatures, FeatureId } from "./advancedFeatures";

export type Tier = "V2.0" | "V2.1" | "V2.2" | "V2.3";
export type ModoTrabajo = "basico" | "trabajo" | "explorar" | "nocturno";

export interface HardwareMedido {
  totalRamGb: number;
  freeRamGb: number;
  cores: number;
  /**
   * v1.6.22 — % de CPU real de la máquina (0-100, todos los núcleos agregados).
   * Reemplaza a `carga1`, que se medía con `os.loadavg()` y en Windows vale
   * SIEMPRE [0,0,0] (lo documenta @types/node): un número ciego para decidir.
   */
  cpuPercent: number;
}

export interface Veredicto {
  id: FeatureId | "verificador" | "embeddings" | "grafo";
  label: string;
  pideRamGb: number;
  cabeAhora: boolean;
  motivo: string;
}

export interface GovernorReport {
  hardware: HardwareMedido;
  tier: Tier;
  tierLabel: string;
  modoSugerido: ModoTrabajo;
  presupuesto: Record<string, number>;
  veredictos: Veredicto[];
  notas: string[];
}

/** Cuánta RAM pide cada pieza, en GB (estimaciones de orden de magnitud). */
const PESOS = {
  sistema: 2.5,
  ide: 0.9,
  motor: 0.3,
  puente: 0.15,
  sandbox: 0.5,
  generadorPequeno: 1.5,
  generadorMedio: 3.5,
  verificador: 3.5,
  verificadorGrande: 6.0,
  embeddings: 1.0,
  indice10kFloat32: 0.04,
  indice10kNumberArray: 0.25,
  grafo100k: 0.4,
  trabajadores: 1.2,
} as const;

/**
 * v1.6.22 — USO REAL DE CPU DE LA MÁQUINA (diferencia entre dos muestras).
 * ------------------------------------------------------------------------
 * `os.loadavg()` es ciego en Windows: devuelve [0,0,0] siempre. En cambio
 * `os.cpus()` devuelve tiempos ACUMULADOS por núcleo, y la diferencia entre
 * dos muestras da el uso real. La primera llamada solo sienta la base y
 * devuelve `null`; a partir de la segunda ya hay delta que medir.
 */
let muestraCpuAnterior: { idle: number; total: number } | null = null;

export function cpuPercentReal(): number | null {
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) return null;
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  if (total <= 0) return null;
  if (!muestraCpuAnterior) {
    muestraCpuAnterior = { idle, total };
    return null;
  }
  const idleDiff = idle - muestraCpuAnterior.idle;
  const totalDiff = total - muestraCpuAnterior.total;
  muestraCpuAnterior = { idle, total };
  if (totalDiff <= 0) return null;
  return Math.min(100, Math.max(0, ((totalDiff - idleDiff) / totalDiff) * 100));
}

export class HardwareGovernor {
  private features: AdvancedFeatures;

  constructor(features: AdvancedFeatures) {
    this.features = features;
  }

  /** Medición real. Se puede inyectar para probar sin depender de la máquina. */
  medir(): HardwareMedido {
    let totalRamGb = 0;
    let freeRamGb = 0;
    let cores = 0;
    let cpuPercent = 0;
    try {
      totalRamGb = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;
      freeRamGb = Math.round((os.freemem() / 1024 ** 3) * 10) / 10;
      cores = os.cpus()?.length || 0;
      const p = cpuPercentReal();
      cpuPercent = p === null ? 0 : Math.round(p * 100) / 100;
    } catch {}
    return { totalRamGb, freeRamGb, cores, cpuPercent };
  }

  /** Clasificación por RAM TOTAL (lo que tienes, no lo que queda libre). */
  static clasificar(hw: HardwareMedido): { tier: Tier; label: string } {
    if (hw.totalRamGb >= 31) return { tier: "V2.3", label: "V2.3 — escala (32 GB o más)" };
    if (hw.totalRamGb >= 15) return { tier: "V2.2", label: "V2.2 — gemelo semántico (16 GB)" };
    if (hw.totalRamGb >= 11) return { tier: "V2.1", label: "V2.1 — verificador independiente (12 GB)" };
    return { tier: "V2.0", label: "V2.0 — motor ligero (8 GB)" };
  }

  /**
   * Veredicto por pieza contra la RAM LIBRE.
   * Se reserva un colchón del 15 % para no dejar el sistema sin aire: activar algo
   * que deja el equipo al borde no es "caber", es paginar.
   */
  static veredictos(hw: HardwareMedido): Veredicto[] {
    const util = Math.max(0, hw.freeRamGb - hw.freeRamGb * 0.15);
    const v = (id: Veredicto["id"], label: string, pide: number, extra?: string): Veredicto => {
      const cabe = util >= pide;
      return {
        id,
        label,
        pideRamGb: pide,
        cabeAhora: cabe,
        motivo: cabe
          ? `Cabe ahora: libre ${hw.freeRamGb} GB (aprovechable ${util.toFixed(1)} GB) para ${pide} GB.${extra ? " " + extra : ""}`
          : `No cabe ahora: pide ${pide} GB y hay ${util.toFixed(1)} GB aprovechables de ${hw.freeRamGb} GB libres.${extra ? " " + extra : ""}`,
      };
    };
    return [
      v("embeddings", "Modelo de embeddings residente", PESOS.embeddings, "Ollama lo descarga solo si no lo usas unos minutos."),
      v("deep_index", "Índice profundo del código", PESOS.indice10kFloat32 + 0.2, "Con Float32Array el índice de 10k fragmentos ocupa ~40 MB."),
      v("verificador", "Verificador independiente (segundo modelo)", PESOS.verificador, "Solo en V2.1 o superior: es lo que da el salto de calidad."),
      v("grafo", "Grafo del proyecto (imports + símbolos)", PESOS.grafo100k, "Pensado para V2.2: 100k nodos ≈ 400 MB."),
      v("parallel_workers", "Trabajadores en paralelo", PESOS.trabajadores, hw.cores < 6 ? `Con ${hw.cores} núcleos el reparto se queda sin núcleos: sería más lento.` : "Hay núcleos suficientes para repartir."),
      v("auto_propose", "Auto-propuesta de parches", 0.1, "No depende de RAM: depende de que la memoria acumule incidencias."),
    ];
  }

  /** Presupuesto de RAM de la fase (estimaciones, para planificar). */
  static presupuesto(tier: Tier): Record<string, number> {
    const base: Record<string, number> = {
      "sistema + navegador": PESOS.sistema,
      "IDE (Electron)": PESOS.ide,
      "motor Node": PESOS.motor,
      "puente Python": PESOS.puente,
      "Vite del sandbox": PESOS.sandbox,
    };
    if (tier === "V2.0") {
      return { ...base, "generador (0,5-1,5 B)": 1.0, "índice vectorial (off)": 0 };
    }
    if (tier === "V2.1") {
      return {
        ...base,
        "generador (1,5-3 B)": PESOS.generadorPequeno,
        verificador: PESOS.verificador,
        embeddings: PESOS.embeddings,
        "índice 10k (Float32Array)": PESOS.indice10kFloat32,
      };
    }
    if (tier === "V2.2") {
      return {
        ...base,
        "generador medio (3-8 B)": PESOS.generadorMedio,
        "verificador grande (8-14 B)": PESOS.verificadorGrande,
        embeddings: PESOS.embeddings,
        "grafo + índice ANN": PESOS.grafo100k,
        "trabajadores (x4)": PESOS.trabajadores,
      };
    }
    return {
      ...base,
      "generador (8-14 B)": PESOS.verificadorGrande,
      "verificador (14-32 B)": 12,
      embeddings: PESOS.embeddings,
      "grafo + ANN": PESOS.grafo100k,
      "trabajadores (x8)": PESOS.trabajadores * 2,
    };
  }

  /**
   * Modo sugerido para V2.2: con 16 GB no caben generador y verificador grandes a
   * la vez, así que se elige por turnos según lo que quede libre.
   */
  static modoSugerido(hw: HardwareMedido, tier: Tier): ModoTrabajo {
    if (tier === "V2.0") return "basico";
    const libre = hw.freeRamGb;
    if (tier === "V2.1") return libre >= 4 ? "trabajo" : "explorar";
    if (libre >= 11) return "nocturno"; // hay sitio para el verificador grande solo
    if (libre >= 6) return "trabajo"; // generador medio + verificador
    return "explorar"; // indexar y buscar: poco consumo, mucho valor
  }

  report(): GovernorReport {
    const hw = this.medir();
    const { tier, label } = HardwareGovernor.clasificar(hw);
    const veredictos = HardwareGovernor.veredictos(hw);
    const presupuesto = HardwareGovernor.presupuesto(tier);
    const totalPresupuesto = Object.values(presupuesto).reduce((a, b) => a + b, 0);
    const margen = Math.round((hw.totalRamGb - totalPresupuesto) * 10) / 10;

    const notas: string[] = [];
    notas.push(
      `Presupuesto de la fase ${tier}: ${totalPresupuesto.toFixed(2)} GB sobre ${hw.totalRamGb} GB → margen ${margen >= 0 ? "+" : ""}${margen} GB (estimación, no medida).`
    );
    if (tier === "V2.0") {
      notas.push(
        "En V2.0 la vectorización y las capacidades avanzadas funcionan, pero conviene usarlas a ratos y no tenerlas todas encendidas a la vez."
      );
    }
    if (tier === "V2.1") {
      notas.push(
        "En V2.1 el salto real es el verificador independiente. Requiere el índice en Float32Array: sin ese cambio el presupuesto se pasa ~0,7 GB."
      );
    }
    if (tier === "V2.2" || tier === "V2.3") {
      notas.push(
        `Modo sugerido ahora: «${HardwareGovernor.modoSugerido(hw, tier)}». Con esta RAM no caben generador y verificador grandes simultáneos: el gobernador elige por turnos.`
      );
    }
    const sinAire = veredictos.filter((v) => !v.cabeAhora).length;
    if (sinAire > 0) {
      notas.push(`${sinAire} pieza(s) no caben en este momento. El gobernador NO las activa: solo te lo dice.`);
    }

    return {
      hardware: hw,
      tier,
      tierLabel: label,
      modoSugerido: HardwareGovernor.modoSugerido(hw, tier),
      presupuesto,
      veredictos,
      notas,
    };
  }
}
