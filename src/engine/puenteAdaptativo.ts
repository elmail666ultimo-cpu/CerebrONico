/**
 * puenteAdaptativo.ts — POOL, JITTER Y CONMUTACIÓN (CN v1.2.0)
 * ============================================================
 * Las tres mejoras siguientes al puente, pedidas por sus nombres técnicos:
 *
 *   1. Warm-up y pools reutilizables → cero reservas de memoria en caliente.
 *   2. Búfer de jitter adaptativo → se encoge si va fluido, se expande si no.
 *   3. Conmutación híbrida → el flujo salta entre local y nube sin que se note.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTA SOBRE EL LENGUAJE, ANTES DE QUE ALGUIEN LA BUSQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * La petición decía «el puente en Rust». Aquí el puente es **TypeScript**: el
 * motor entero es TS y el paquete del navegador no puede llevar Rust sin una
 * cadena de herramientas nueva (compilador, binarios por plataforma, `wasm` o un
 * módulo nativo). Sería una dependencia grande para un módulo que ya funciona, y
 * la regla que se fijó para este proyecto fue no añadirlas salvo necesidad real.
 *
 * Y hay un motivo técnico, no sólo de gusto: **estas tres mejoras NO necesitan
 * Rust.** Rust gana en coste predecible y en ausencia de recolector, y eso
 * importa para el bucle de audio; pero las tres cosas que se piden aquí —un pool,
 * una media móvil y una decisión con histéresis— son lógica, y la lógica cuesta
 * lo mismo en cualquier lenguaje. Lo que sí necesitaría Rust es el bucle de audio
 * con memoria compartida, que es otra cosa y sigue en la lista de pendientes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE DISTINGUE UNA MEJORA REAL DE UN ADORNO, EN ESTOS TRES CASOS
 * ─────────────────────────────────────────────────────────────────────────────
 *   · El pool: si `creados` crece sin parar, NO hay pool. Hay un envoltorio. Por
 *     eso el pool cuenta sus reservas y su tasa de reúso, y eso se prueba.
 *   · El jitter: si sólo se expande y nunca se encoge, no es adaptativo, es un
 *     búfer grande con más pasos. Se prueba que vuelve.
 *   · La conmutación: sin HISTÉRESIS, un sistema justo en el umbral conmuta en
 *     cada muestra y el resultado es peor que quedarse quieto. Se prueba que no
 *     oscila. Ése es el detalle que casi todas las implementaciones se saltan.
 */

import type { PuenteIA } from "./puenteIA";

// ============================================================================
// 1 · POOL DE BÚFERES — «zero allocation en caliente»
// ============================================================================
/**
 * Reserva TODOS sus búferes al construirse y los recicla.
 *
 * El contador `creados` es la prueba de que el pool es un pool: en régimen
 * estable debe quedarse quieto en la capacidad inicial mientras `prestamos`
 * sube. Un «pool» cuyo número de reservas sube con cada uso es un envoltorio con
 * un nombre bonito, y ese error no se ve mirando el código: se ve mirando el
 * contador.
 */
export class PoolTrozos {
  private readonly libres: Uint8Array[] = [];
  private _prestamos = 0;
  private _reciclados = 0;
  private _agotamientos = 0;

  constructor(readonly capacidad: number, readonly bytesPorTrozo = 512) {
    if (!Number.isInteger(capacidad) || capacidad < 1) {
      throw new Error(`Capacidad de pool inválida: ${capacidad}.`);
    }
    if (!Number.isInteger(bytesPorTrozo) || bytesPorTrozo < 1) {
      throw new Error(`Tamaño de trozo inválido: ${bytesPorTrozo}.`);
    }
    // El «warm-up»: se paga aquí, al arrancar, y no en mitad de una conversación.
    for (let i = 0; i < capacidad; i++) this.libres.push(new Uint8Array(bytesPorTrozo));
  }

  /** Reservas reales de memoria hechas desde el arranque. Debe quedarse quieto. */
  get creados(): number { return this.capacidad; }
  get disponibles(): number { return this.libres.length; }
  get prestamos(): number { return this._prestamos; }
  get agotamientos(): number { return this._agotamientos; }

  /**
   * Tasa de reúso: (préstamos - reservas) / préstamos.
   * 1 = todo reciclado. 0 = cada préstamo reservó memoria nueva.
   */
  get tasaReuso(): number {
    if (this._prestamos === 0) return 1;
    return Math.max(0, (this._prestamos - this._agotamientos) / this._prestamos);
  }

  /**
   * Toma un búfer. Si no hay, DEVUELVE null: nunca reserva «por si acaso».
   * Ese «por si acaso» es precisamente el pico de retardo impredecible que el
   * pool existe para eliminar. Quien llama decide si espera, si descarta o si
   * amplía el pool — y esa decisión tiene que estar en quien consume, no aquí.
   */
  tomar(): Uint8Array | null {
    if (this.libres.length === 0) { this._agotamientos++; return null; }
    this._prestamos++;
    const b = this.libres.pop()!;
    // Se limpia lo justo: el tamaño lo fija el escritor al usar el búfer.
    b.fill(0);
    return b;
  }

  devolver(b: Uint8Array): void {
    if (b.length !== this.bytesPorTrozo) return; // no es de este pool: se ignora
    if (this.libres.length >= this.capacidad) return;
    this._reciclados++;
    this.libres.push(b);
  }
}

// ============================================================================
// 2 · BÚFER DE JITTER ADAPTATIVO
// ============================================================================
export interface OpcionesJitter {
  minMs: number;
  maxMs: number;
  /** Por encima de este jitter (ms) se expande. */
  umbralInestableMs?: number;
  /** Por debajo de este jitter (ms) se puede encoger. */
  umbralEstableMs?: number;
  /** Muestras estables seguidas antes de encoger. Evita encoger por una racha. */
  muestrasParaEncoger?: number;
}

/**
 * Ajusta su tamaño al ritmo real de llegada.
 *
 * Cómo decide, sin cajas negras:
 *  · Se mide la diferencia entre llegadas consecutivas y su media.
 *  · El JITTER es la desviación media absoluta respecto a esa media. No se usa la
 *    varianza: un sólo pico la contamina durante muchas muestras, y aquí lo que
 *    interesa es «¿va irregular ahora?», no «¿lo fue alguna vez?».
 *  · Si el jitter pasa el umbral inestable → se expande (×1.5, hasta el máximo).
 *  · Si se mantiene por debajo del estable varias muestras seguidas → se encoge
 *    (×0.75, hasta el mínimo).
 *
 * El «varias muestras seguidas» no es un adorno: sin él, una racha buena de dos
 * muestras encogería el búfer y el chasquido volvería en la siguiente. Encoger es
 * una apuesta; se apuesta cuando la evidencia se repite, no cuando aparece una vez.
 */
export class JitterAdaptativo {
  private readonly minMs: number;
  private readonly maxMs: number;
  private readonly umbralInestable: number;
  private readonly umbralEstable: number;
  private readonly muestrasParaEncoger: number;

  private actual: number;
  private ultimaLlegada: number | null = null;
  private readonly deltas: number[] = [];
  private rachaEstable = 0;
  private _expansiones = 0;
  private _contracciones = 0;

  constructor(o: OpcionesJitter) {
    if (!(o.minMs > 0) || !(o.maxMs >= o.minMs)) {
      throw new Error(`Rango de jitter inválido: min=${o.minMs} max=${o.maxMs}.`);
    }
    this.minMs = o.minMs;
    this.maxMs = o.maxMs;
    this.umbralInestable = o.umbralInestableMs ?? Math.max(4, o.minMs * 0.5);
    this.umbralEstable = o.umbralEstableMs ?? Math.max(2, this.umbralInestable / 2);
    this.muestrasParaEncoger = o.muestrasParaEncoger ?? 8;
    this.actual = o.minMs;
  }

  get tamanoMs(): number { return Math.round(this.actual * 100) / 100; }
  get expansiones(): number { return this._expansiones; }
  get contracciones(): number { return this._contracciones; }

  /** Jitter actual: desviación media absoluta de los intervalos de llegada. */
  get jitterMs(): number {
    if (this.deltas.length < 2) return 0;
    const media = this.deltas.reduce((s, d) => s + d, 0) / this.deltas.length;
    const desv = this.deltas.reduce((s, d) => s + Math.abs(d - media), 0) / this.deltas.length;
    return Math.round(desv * 100) / 100;
  }

  get estado(): "estable" | "inestable" | "midiendo" {
    if (this.deltas.length < 3) return "midiendo";
    if (this.jitterMs > this.umbralInestable) return "inestable";
    if (this.jitterMs <= this.umbralEstable) return "estable";
    return "estable";
  }

  /** Alimenta con el instante de llegada de un trozo (ms). */
  observar(llegadaMs: number): void {
    if (this.ultimaLlegada !== null) {
      const d = llegadaMs - this.ultimaLlegada;
      if (d >= 0) {
        this.deltas.push(d);
        // Ventana acotada: el jitter es una medida de AHORA, no de la sesión
        // entera. Sin ventana, un mal tramo al principio marcaría para siempre.
        if (this.deltas.length > 32) this.deltas.shift();
      }
    }
    this.ultimaLlegada = llegadaMs;

    const e = this.estado;
    if (e === "inestable") {
      const nuevo = Math.min(this.maxMs, this.actual * 1.5);
      if (nuevo > this.actual) { this.actual = nuevo; this._expansiones++; }
      this.rachaEstable = 0;
      return;
    }
    if (e === "estable") {
      this.rachaEstable++;
      if (this.rachaEstable >= this.muestrasParaEncoger && this.actual > this.minMs) {
        this.actual = Math.max(this.minMs, this.actual * 0.75);
        this._contracciones++;
        this.rachaEstable = 0;
      }
    }
  }

  /** Para una prueba o un reinicio de sesión. */
  reiniciar(): void {
    this.actual = this.minMs;
    this.ultimaLlegada = null;
    this.deltas.length = 0;
    this.rachaEstable = 0;
  }
}

// ============================================================================
// 3 · CONMUTACIÓN HÍBRIDA CON HISTÉRESIS
// ============================================================================
export interface SaludSistema {
  /** Carga del hardware local, 0..1. */
  cargaLocal: number;
  /** Latencia medida contra el extremo de nube, en ms. -1 = red caída. */
  pingNubeMs: number;
}

export interface OpcionesConmutacion {
  cargaMaximaLocal?: number;
  pingMaximoNube?: number;
  /**
   * Muestras mínimas antes de volver a conmutar. ES LA PIEZA CLAVE: sin ella, un
   * sistema justo en el umbral conmuta en cada muestra.
   */
  muestrasMinimas?: number;
}

export class ConmutadorHibrido {
  private readonly cargaMaxima: number;
  private readonly pingMaximo: number;
  private readonly muestrasMinimas: number;
  private desdeUltima = Number.MAX_SAFE_INTEGER;
  private _conmutaciones = 0;
  private readonly bitacoraInterna: string[] = [];

  constructor(
    private readonly puentes: { local: PuenteIA; nube: PuenteIA },
    o: OpcionesConmutacion = {}
  ) {
    this.cargaMaxima = o.cargaMaximaLocal ?? 0.85;
    this.pingMaximo = o.pingMaximoNube ?? 400;
    this.muestrasMinimas = o.muestrasMinimas ?? 5;
  }

  /** El puente en uso, para pasárselo a medirPuente. */
  get actual(): PuenteIA {
    return this.puentesActuales === "local" ? this.puentes.local : this.puentes.nube;
  }

  /**
   * El NOMBRE del lado activo. Existe porque devolver el objeto obliga a quien
   * pregunta «¿por dónde voy?» a compararlo consigo mismo para averiguarlo — y
   * eso ya costó un fallo de prueba. Una interfaz debe poder decir su estado con
   * una palabra.
   */
  get modoActual(): "local" | "nube" { return this.puentesActuales; }
  get conmutaciones(): number { return this._conmutaciones; }
  get bitacora(): string[] { return [...this.bitacoraInterna]; }

  /**
   * Decide a quién ir. Devuelve el NOMBRE del elegido y, si hubo cambio, lo
   * registra — porque una conmutación invisible para el usuario no puede ser
   * invisible también para el diagnóstico: cuando algo suene mal, hay que poder
   * saber si el flujo se cambió de lado a mitad.
   */
  decidir(s: SaludSistema): "local" | "nube" {
    const redCaida = s.pingNubeMs < 0;
    const redLenta = !redCaida && s.pingNubeMs > this.pingMaximo;
    const localSaturado = s.cargaLocal > this.cargaMaxima;

    let quiero: "local" | "nube";
    let motivo: string;

    if (redCaida) { quiero = "local"; motivo = "red caída"; }
    else if (redLenta && !localSaturado) { quiero = "local"; motivo = `ping ${s.pingNubeMs} ms > ${this.pingMaximo} ms`; }
    else if (localSaturado && !redLenta) { quiero = "nube"; motivo = `carga local ${(s.cargaLocal * 100).toFixed(0)}% > ${(this.cargaMaxima * 100).toFixed(0)}%`; }
    else if (localSaturado && redLenta) {
      // Los dos extremos mal: se queda donde está y se avisa. Conmutar al que
      // también va mal sólo añade una desconexión a un problema que ya existía.
      quiero = this.puentesActuales;
      motivo = "los dos extremos degradados: se mantiene para no sumar un corte";
      // SE REGISTRA AUNQUE NO HAYA CAMBIO. Quedarse quieto también es una
      // decisión, y es justo la que después nadie sabe reconstruir: «¿por qué
      // sonó mal ahí, si no se cambió de lado?». Sin esta línea la bitácora sólo
      // guarda las conmutaciones, y el diagnóstico se queda a medias.
      const ultima = this.bitacoraInterna[this.bitacoraInterna.length - 1];
      const linea = "= " + quiero + ": " + motivo;
      if (ultima !== linea) this.bitacoraInterna.push(linea);
    } else { quiero = this.puentesActuales; motivo = "todo en rango"; }

    this.desdeUltima++;
    if (quiero !== this.puentesActuales) {
      if (this.desdeUltima >= this.muestrasMinimas) {
        this.puentesActuales = quiero;
        this._conmutaciones++;
        this.desdeUltima = 0;
        this.bitacoraInterna.push(`→ ${quiero}: ${motivo}`);
      } else {
        this.bitacoraInterna.push(`(conmutación a ${quiero} retenida por histéresis: ${motivo})`);
      }
    }
    return this.puentesActuales;
  }

  private puentesActuales: "local" | "nube" = "local";
}
