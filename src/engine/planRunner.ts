/**
 * planRunner.ts — MULTITAREA EN SEGUNDO PLANO (v2.2)
 * ==================================================
 * El plan NO vive dentro de la petición HTTP. Se lanza, el chat recibe un id al
 * instante y sigue funcionando; el plan avanza por detrás y el panel lo muestra.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DETALLE QUE HACE QUE ESTO NO ROMPA LA MÁQUINA
 * ─────────────────────────────────────────────────────────────────────────────
 * El presupuesto del planificador es POR PLAN. Con dos planes en marcha a ×8, la
 * máquina recibiría el doble de tareas de las que el gobernador había calculado,
 * y en 8 GB eso es pagar. La conciencia de recursos es de la MÁQUINA, no del plan.
 *
 * Solución: un SEMÁFORO GLOBAL por peso, en la frontera del ejecutor. Cada plan
 * cree que lanza lo que le toca, pero ninguna tarea entra de verdad hasta que hay
 * hueco real. No hay que tocar el planificador: se envuelve el ejecutor.
 *
 *     plan A (hasta 8) ─┐
 *                       ├─► semáforo global (lo que la máquina aguanta) ─► Ollama / disco
 *     plan B (hasta 8) ─┘
 *
 * Y si el botón cambia de ×1 a ×8 en caliente, el semáforo se reajusta y las
 * tareas que estaban esperando entran solas.
 */

import { crearPlan as crearPlanBase, ejecutarPlan, solicitarCancelacion, type Ejecutor, type MedidorMaquina, type Peso, type Plan, type Tarea } from "./taskPlanner";
import { resolverPresupuesto, type MRId } from "./memoriaResiliente";
import { prepararReanudacion } from "./taskStore";
import type { GestorPlanes } from "./taskStoreFs";

// ─────────────────────────────────────────────────────────────────────────────
// Semáforo global (uno por peso)
// ─────────────────────────────────────────────────────────────────────────────

export class Semaforo {
  private enUso: Record<Peso, number> = { io: 0, cpu: 0 };
  private limites: Record<Peso, number>;
  private cola: Record<Peso, Array<() => void>> = { io: [], cpu: [] };

  constructor(limites: Record<Peso, number>) {
    this.limites = { io: Math.max(1, limites.io), cpu: Math.max(1, limites.cpu) };
  }

  /** Cuántas tareas de ese peso están esperando hueco. Es información de la buena. */
  esperando(peso: Peso): number {
    return this.cola[peso].length;
  }

  enCurso(peso: Peso): number {
    return this.enUso[peso];
  }

  private get limitesActuales(): Record<Peso, number> {
    return this.limites;
  }

  async adquirir(peso: Peso): Promise<void> {
    if (this.enUso[peso] < this.limitesActuales[peso]) {
      this.enUso[peso] += 1;
      return;
    }
    await new Promise<void>((r) => this.cola[peso].push(r));
    this.enUso[peso] += 1;
  }

  liberar(peso: Peso): void {
    this.enUso[peso] = Math.max(0, this.enUso[peso] - 1);
    // Al liberar, entra el siguiente de la cola. `ajustar` también drena, así que
    // subir el escalado despierta a los que esperaban sin tocar nada más.
    const siguiente = this.cola[peso].shift();
    if (siguiente) siguiente();
  }

  /** Sube o baja el tope en caliente (el botón ×1 ×2 ×4 ×6 ×8). */
  ajustar(limites: Record<Peso, number>): void {
    this.limites = { io: Math.max(1, limites.io), cpu: Math.max(1, limites.cpu) };
    for (const peso of ["io", "cpu"] as Peso[]) {
      while (this.cola[peso].length > 0 && this.enUso[peso] < this.limites[peso]) {
        const siguiente = this.cola[peso].shift();
        if (siguiente) siguiente();
      }
    }
  }

  estado(): { io: { enUso: number; limite: number; esperando: number }; cpu: { enUso: number; limite: number; esperando: number } } {
    return {
      io: { enUso: this.enUso.io, limite: this.limites.io, esperando: this.cola.io.length },
      cpu: { enUso: this.enUso.cpu, limite: this.limites.cpu, esperando: this.cola.cpu.length },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionesRunner {
  /** Ejecutor real de las tareas (modelo, herramienta, lo que sea). */
  ejecutar: Ejecutor;
  medir: MedidorMaquina;
  gestor: GestorPlanes;
  perfilForzado?: MRId;
  /** Escalado del botón: ×1 ×2 ×4 ×6 ×8. */
  escalado?: number;
  onAviso?: (linea: string) => void;
}

export interface ResultadoLanzamiento {
  ok: boolean;
  planId: string;
  motivo: string;
}

export class PlanRunner {
  private op: OpcionesRunner;
  private corriendo = new Map<string, Promise<Plan>>();
  private semaforo: Semaforo;
  private escalado: number;
  /** Historial corto de avisos, para el panel. */
  private historialAvisos: string[] = [];

  constructor(op: OpcionesRunner) {
    this.op = op;
    this.escalado = Math.max(1, op.escalado ?? 1);
    this.semaforo = new Semaforo(this.calcularLimitesGlobales());
  }

  private medirAhora() {
    try {
      return this.op.medir();
    } catch {
      // Si el medidor falla, se asume el peor caso razonable: se sigue, no se cae.
      return { ramMedidaGB: 8, ramLibreGB: 4, nucleos: 4 };
    }
  }

  /** El presupuesto de la MÁQUINA con el escalado actual; el semáforo se dimensiona con él. */
  private calcularLimitesGlobales(): Record<Peso, number> {
    const p = resolverPresupuesto({
      ...this.medirAhora(),
      perfilForzado: this.op.perfilForzado,
      escalado: this.escalado,
    });
    return { io: p.io, cpu: p.cpu };
  }

  /** Botón «cerebro resiliente ×N». Reajusta en caliente, sin reiniciar planes. */
  escalar(n: number): { ok: boolean; escalado: number; limites: ReturnType<Semaforo["estado"]>; motivo: string } {
    this.escalado = Math.max(1, Math.floor(n));
    const limites = this.calcularLimitesGlobales();
    this.semaforo.ajustar(limites);
    const p = resolverPresupuesto({ ...this.medirAhora(), perfilForzado: this.op.perfilForzado, escalado: this.escalado });
    const motivo = p.degradado
      ? `Escalado ×${this.escalado} aceptado, pero la máquina no da para tanto. Reparto real: ${limites.io} io / ${limites.cpu} cpu. ${p.motivo.slice(-1)[0] || ""}`.trim()
      : `Escalado ×${this.escalado}: ${limites.io} tareas de espera y ${limites.cpu} de cálculo a la vez.`;
    this.avisar(motivo);
    return { ok: true, escalado: this.escalado, limites: this.semaforo.estado(), motivo };
  }

  escaladoActual(): number {
    return this.escalado;
  }

  /**
   * Fija el tramo MR a mano (o lo devuelve a automático pasando `undefined`).
   * Se recalcula el semáforo y se avisa del reparto real: forzar 32 GB en una
   * máquina de 8 GB está permitido —«es bueno terminar aunque no lo soporte»—,
   * pero se dice lo que va a pasar.
   */
  fijarTramo(mr?: MRId): { ok: boolean; tramo: MRId | null; limites: ReturnType<Semaforo["estado"]>; motivo: string } {
    this.op.perfilForzado = mr;
    const limites = this.calcularLimitesGlobales();
    this.semaforo.ajustar(limites);
    const p = resolverPresupuesto({ ...this.medirAhora(), perfilForzado: mr, escalado: this.escalado });
    const motivo = mr
      ? `Tramo fijado a ${p.perfil.nombre} (${p.perfil.ramGB} GB). Reparto: ${limites.io} tareas de espera y ${limites.cpu} de cálculo.`
      : `Tramo automático: ${p.perfil.nombre} (${p.perfil.ramGB} GB según la máquina). Reparto: ${limites.io} y ${limites.cpu}.`;
    this.avisar(motivo);
    return { ok: true, tramo: mr ?? null, limites: this.semaforo.estado(), motivo };
  }

  /** El tramo forzado, o null si va en automático. */
  tramoActual(): MRId | null {
    return this.op.perfilForzado ?? null;
  }

  private avisar(linea: string): void {
    // Se guarda un historial corto para que el panel pueda mostrar QUÉ pasó sin
    // tener que leer el log del servidor. Es información, no decoración.
    this.historialAvisos.push(linea);
    if (this.historialAvisos.length > 60) this.historialAvisos.splice(0, this.historialAvisos.length - 60);
    try {
      this.op.onAviso?.(linea);
    } catch {}
  }

  /** Últimos avisos, para el panel. */
  avisosRecientes(): string[] {
    return [...this.historialAvisos];
  }

  /** Todos los planes conocidos (los vivos y los que están en disco). */
  listaPlanes(): Plan[] {
    return this.op.gestor.lista();
  }

  /** Crea un plan y lo deja guardado, SIN ejecutarlo. Devuelve el plan. */
  crear(objetivo: string, tareas: Array<Partial<Tarea> & { titulo: string }>): Plan {
    const plan = crearPlanBase(objetivo, tareas, this.op.gestor.nuevoId());
    this.op.gestor.registrar(plan);
    this.avisar(`Plan ${plan.id} creado con ${plan.tareas.length} tarea(s): «${objetivo}».`);
    return plan;
  }

  /**
   * Lanza el plan EN SEGUNDO PLANO y vuelve al instante. La promesa no se espera:
   * se guarda para poder saber si sigue vivo y para parar en un apagado limpio.
   */
  lanzar(planId: string): ResultadoLanzamiento {
    const plan = this.op.gestor.obtener(planId);
    if (!plan) return { ok: false, planId, motivo: `No existe el plan ${planId}.` };
    if (this.corriendo.has(planId)) return { ok: false, planId, motivo: `El plan ${planId} ya se está ejecutando.` };

    const promesa = this.ejecutarEnSegundoPlano(plan);
    this.corriendo.set(planId, promesa);
    void promesa.finally(() => {
      this.corriendo.delete(planId);
      void this.op.gestor.guardar();
    });

    return { ok: true, planId, motivo: `Plan ${planId} lanzado en segundo plano. El chat sigue disponible.` };
  }

  private async ejecutarEnSegundoPlano(plan: Plan): Promise<Plan> {
    return ejecutarPlan(plan, {
      // El semáforo va en la frontera: el plan cree que lanza lo suyo, pero
      // ninguna tarea empieza de verdad sin hueco REAL en la máquina.
      ejecutar: async (tarea, senal) => {
        await this.semaforo.adquirir(tarea.peso);
        try {
          return await this.op.ejecutar(tarea, senal);
        } finally {
          this.semaforo.liberar(tarea.peso);
        }
      },
      medir: () => this.medirAhora(),
      // También como función: el selector de tramo se aplica a lo que ya corre.
      perfilForzado: () => this.op.perfilForzado,
      // Función, no valor: el plan consulta el escalado en cada vuelta, así que
      // pulsar ×8 se aplica a los planes que YA están corriendo.
      escalado: () => this.escalado,
      log: (linea) => this.avisar(linea),
      alTerminarTarea: (p, t) => this.op.gestor.avisarTareaTerminada(p, t),
    });
  }

  /** Cancelar es inmediato (el planificador despierta en el acto). */
  cancelar(planId: string): { ok: boolean; motivo: string } {
    const plan = this.op.gestor.obtener(planId);
    if (!plan) return { ok: false, motivo: `No existe el plan ${planId}.` };
    solicitarCancelacion(plan);
    this.avisar(`Cancelación pedida para el plan ${planId}.`);
    return { ok: true, motivo: "Cancelación pedida." };
  }

  /** Reanuda un plan pausado (por reinicio) o cancelado. Lo ya hecho no se repite. */
  reanudar(planId: string): ResultadoLanzamiento {
    const plan = this.op.gestor.obtener(planId);
    if (!plan) return { ok: false, planId, motivo: `No existe el plan ${planId}.` };
    if (this.corriendo.has(planId)) return { ok: false, planId, motivo: `El plan ${planId} ya se está ejecutando.` };
    prepararReanudacion(plan);
    void this.op.gestor.guardar();
    return this.lanzar(planId);
  }

  /** Planes vivos ahora mismo. */
  activos(): string[] {
    return [...this.corriendo.keys()];
  }

  enSegundoPlano(planId: string): boolean {
    return this.corriendo.has(planId);
  }

  estadoSemaforo() {
    return this.semaforo.estado();
  }

  /**
   * Parada limpia (apagado del servidor): se pide cancelar a todo y se espera un
   * margen. Lo que no llegue a cerrar se queda como «en curso» en disco, y al
   * volver aparecerá PAUSADO — nunca se pierde.
   */
  async pararTodo(margenMs = 3000): Promise<{ parados: string[]; pendientes: string[] }> {
    const parados = this.activos();
    for (const id of parados) this.cancelar(id);
    if (this.corriendo.size > 0) {
      await Promise.race([
        Promise.allSettled([...this.corriendo.values()]),
        new Promise((r) => setTimeout(r, margenMs)),
      ]);
    }
    await this.op.gestor.guardar();
    await this.op.gestor.vaciar();
    const pendientes = this.activos();
    if (pendientes.length > 0) {
      this.avisar(`Quedaron ${pendientes.length} plan(es) sin cerrar del todo; al volver aparecerán PAUSADOS para reanudar.`);
    }
    return { parados, pendientes };
  }
}
