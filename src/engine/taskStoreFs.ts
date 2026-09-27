/**
 * taskStoreFs.ts — PONER LOS PLANES EN EL DISCO, SIN ROMPER NADA (v2.2)
 * =====================================================================
 * Aquí vive todo el acceso a ficheros del cerebro de tareas. La lógica de qué
 * guardar y cómo repararlo está en `taskStore.ts` (pura); esto es solo el
 * fontanero.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LAS TRES COSAS QUE PUEDEN SALIR MAL Y CÓMO SE EVITAN
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. ESCRIBIR A MEDIAS. Si el proceso muere justo mientras se escribe, el
 *    fichero queda cortado y se pierde TODO. Se escribe en un temporal y luego
 *    se renombra: `rename` es atómico, así que el fichero bueno está o no está,
 *    nunca a medias.
 *
 * 2. QUEDARSE SIN NADA. Antes de sobrescribir se conserva la versión anterior
 *    como `.bak`. Si el principal se corrompe, se rescata del respaldo y se dice.
 *
 * 3. DOS ESCRITURAS A LA VEZ. Node es un solo hilo, pero entre `await` sí se
 *    pueden solapar. Las escrituras se encadenan en una promesa, así que van en
 *    fila india: la última gana, sin mezclarse.
 *
 * Y una regla: **guardar nunca puede tumbar una ejecución**. Si el disco falla,
 * se avisa por `onAviso` y se sigue trabajando.
 */

import * as fs from "fs";
import * as path from "path";
import type { Plan, Tarea } from "./taskPlanner";
import {
  serializarPlanes,
  deserializarPlanes,
  marcarInterrumpidos,
  podarPlanes,
  upsertPlan,
  buscarPlan,
  siguienteIdPlan,
  type ResultadoCarga,
} from "./taskStore";

/** Lo mínimo que hace falta de un almacén. Se puede sustituir en las pruebas. */
export interface AlmacenPlanes {
  leer(): string | null;
  /** Debe ser atómico: o el contenido entero, o el anterior intacto. */
  escribir(texto: string): void;
  /** Versión anterior conservada, para rescatar de una corrupción. */
  leerRespaldo?: () => string | null;
}

export interface OpcionesGestor {
  /** Cada cuántas tareas terminadas se guarda (viene del perfil MR). */
  checkpointCadaTareas?: number;
  /** Avisos y errores de guardado. Nada silencioso. */
  onAviso?: (linea: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Almacén en disco
// ─────────────────────────────────────────────────────────────────────────────

export function crearAlmacenFs(dirDb: string, nombre = "planes.json"): AlmacenPlanes {
  const destino = path.join(dirDb, nombre);
  const temporal = path.join(dirDb, `${nombre}.tmp`);
  const respaldo = path.join(dirDb, `${nombre}.bak`);

  return {
    leer(): string | null {
      try {
        return fs.readFileSync(destino, "utf-8");
      } catch {
        return null; // no existe todavía: es lo normal la primera vez
      }
    },
    leerRespaldo(): string | null {
      try {
        return fs.readFileSync(respaldo, "utf-8");
      } catch {
        return null;
      }
    },
    escribir(texto: string): void {
      fs.mkdirSync(dirDb, { recursive: true });
      // Respaldo de lo que había antes de pisarlo.
      try {
        if (fs.existsSync(destino)) fs.copyFileSync(destino, respaldo);
      } catch {
        /* si no se puede respaldar, seguir: escribir bien es más importante */
      }
      // Temporal + rename = atómico. Nunca se ve un fichero a medias.
      fs.writeFileSync(temporal, texto, "utf-8");
      fs.renameSync(temporal, destino);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestor: la cara que usa el servidor
// ─────────────────────────────────────────────────────────────────────────────

export class GestorPlanes {
  private planes: Plan[] = [];
  private almacen: AlmacenPlanes;
  private checkpointCada: number;
  private onAviso?: (linea: string) => void;
  /** Tareas terminadas desde el último guardado, por plan. */
  private desdeUltimoGuardado = new Map<string, number>();
  /** Fila india de escrituras. */
  private cadena: Promise<void> = Promise.resolve();
  private ultimoError: string | null = null;
  private guardados = 0;
  /**
   * v2.1 — Escrituras ENCOLADAS que aún no han terminado.
   *
   * El diagnóstico decía `pendientes: this.cadena ? 0 : 0`: una promesa siempre
   * es «verdadera», así que los dos lados del ternario valían 0 y el campo
   * informaba CERO siempre, hubiera o no escrituras esperando. Un diagnóstico
   * que miente es peor que no tenerlo. Ahora se cuenta de verdad.
   */
  private pendientes = 0;

  constructor(almacen: AlmacenPlanes, opciones: OpcionesGestor = {}) {
    this.almacen = almacen;
    this.checkpointCada = Math.max(1, opciones.checkpointCadaTareas ?? 3);
    this.onAviso = opciones.onAviso;
  }

  private avisar(linea: string): void {
    try {
      this.onAviso?.(linea);
    } catch {}
  }

  /**
   * Carga al arrancar. Si el principal está ilegible, intenta el respaldo. Si
   * había planes en curso, los marca PAUSADOS — no se puede fingir que siguen
   * corriendo cuando el proceso acaba de empezar.
   */
  cargar(ahora = Date.now()): ResultadoCarga & { interrumpidos: string[] } {
    let res = deserializarPlanes(this.almacen.leer());

    if (res.vacio && res.avisos.length > 0 && this.almacen.leerRespaldo) {
      const respaldo = deserializarPlanes(this.almacen.leerRespaldo());
      if (respaldo.planes.length > 0) {
        this.avisar(`El fichero de planes no se pudo leer; se rescataron ${respaldo.planes.length} plan(es) del respaldo.`);
        res = { ...respaldo, avisos: [...res.avisos, ...respaldo.avisos] };
      }
    }

    for (const a of res.avisos) this.avisar(a);

    const { planes, interrumpidos } = marcarInterrumpidos(res.planes, ahora);
    const podado = podarPlanes(planes, ahora);
    if (podado.descartados.length > 0) {
      this.avisar(`Se descartaron ${podado.descartados.length} plan(es) antiguos ya finalizados: ${podado.descartados.join(", ")}.`);
    }
    this.planes = podado.planes;
    for (const id of interrumpidos) this.avisar(`El plan ${id} quedó pausado por el reinicio (se puede reanudar).`);
    return { ...res, interrumpidos };
  }

  lista(): Plan[] {
    return this.planes;
  }

  obtener(id: string): Plan | undefined {
    return buscarPlan(this.planes, id);
  }

  nuevoId(): string {
    return siguienteIdPlan(this.planes);
  }

  /** Alta o reemplazo, y a disco. */
  registrar(plan: Plan): Plan {
    upsertPlan(this.planes, plan);
    this.desdeUltimoGuardado.set(plan.id, 0);
    void this.guardar();
    return plan;
  }

  /**
   * Lo llama el planificador al terminar cada tarea. Decide si toca escribir.
   *
   * La regla, y el porqué de cada parte:
   *   · FIN del plan            → siempre. Es el resultado que el usuario va a leer.
   *   · FALLO o CANCELACIÓN     → siempre. Es lo más valioso de conservar: sin
   *     esto, al reanudar se reintentaría lo mismo sin saber que ya falló.
   *   · Tarea hecha             → cada `checkpointCadaTareas`, para no reescribir
   *     el fichero en cada tarea de un plan de cien.
   *
   * OJO con mirar solo `plan.estado`: mientras el plan sigue «en_curso» un fallo
   * de tarea NO se guardaba, que es justo el caso en el que más falta hace. Hay
   * que mirar el estado de la TAREA que acaba de terminar.
   */
  avisarTareaTerminada(plan: Plan, tarea?: Tarea): void {
    upsertPlan(this.planes, plan);
    const n = (this.desdeUltimoGuardado.get(plan.id) || 0) + 1;
    this.desdeUltimoGuardado.set(plan.id, n);

    const fallo = tarea?.estado === "fallida" || tarea?.estado === "cancelada";
    const finDelPlan = plan.estado !== "en_curso";

    if (fallo || finDelPlan || n >= this.checkpointCada) {
      this.desdeUltimoGuardado.set(plan.id, 0);
      void this.guardar();
    }
  }

  /** Guardado forzado (fin de plan, cancelación, parada del servidor). */
  guardar(): Promise<void> {
    const texto = serializarPlanes(this.planes);
    this.pendientes += 1;
    this.cadena = this.cadena.then(() => {
      try {
        this.almacen.escribir(texto);
        this.guardados += 1;
        this.ultimoError = null;
      } catch (e: any) {
        // Guardar no puede tumbar nada: se avisa y sigue.
        this.ultimoError = e?.message || String(e);
        this.avisar(`⚠️ No se pudieron guardar los planes: ${this.ultimoError}. El trabajo en memoria sigue intacto.`);
      } finally {
        // Se descuenta pase lo que pase, para que el contador no se quede
        // enganchado si una escritura falla.
        this.pendientes -= 1;
      }
    });
    return this.cadena;
  }

  /** Espera a que terminen las escrituras pendientes (para apagar limpio). */
  async vaciar(): Promise<void> {
    await this.cadena;
  }

  diagnostico(): { planes: number; guardados: number; ultimoError: string | null; pendientes: number } {
    return { planes: this.planes.length, guardados: this.guardados, ultimoError: this.ultimoError, pendientes: this.pendientes };
  }
}
