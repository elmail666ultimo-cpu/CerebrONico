/**
 * puenteIA.ts — EL «ASIO DE LA IA»: UN PUENTE, DOS MUNDOS (CN v1.1.0)
 * ====================================================================
 * Idea a desarrollar, en palabras del usuario: *emular lo que hace ASIO en el
 * búfer, pero para la comunicación de la IA.*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ HACE ASIO, DE VERDAD, Y QUÉ ES TRASLADABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * ASIO no es «un driver más rápido». Es un CONTRATO: la aplicación pide un
 * búfer de tamaño fijo y una cadencia, y el driver se compromete a servirla sin
 * meter capas intermedias. Lo trasladable a la IA no es el hardware, es eso:
 *
 *   1. **Un contrato único** — la misma interfaz sirva para lo local y lo
 *      remoto, y que quien la use no sepa cuál está detrás.
 *   2. **Búfer circular** — el productor escribe sin esperar al consumidor, y el
 *      consumo no depende de que la producción haya terminado. Con una POLÍTICA
 *      DE DESBORDAMIENTO explícita, porque un búfer circular sin política no es
 *      un búfer: es una pérdida de datos silenciosa esperando a ocurrir.
 *   3. **Medir el arranque, no el total** — en audio el número que importa es la
 *      latencia de ida y vuelta; aquí es el **TTFT** (tiempo hasta el primer
 *      token). Un total rápido con TTFT malo se siente lento; al contrario, se
 *      siente rápido.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE **NO** SE PROMETE AQUÍ (y por qué importa decirlo)
 * ─────────────────────────────────────────────────────────────────────────────
 * Este módulo NO implementa memoria compartida con cero copia ni `mmap`. Escribir
 * «zero-copy» aquí sería el mismo pecado que el catálogo que anuncia «medición de
 * TTFT en tiempo real» sin tener una sola línea que lo mida — y ese defecto
 * existe de verdad en este proyecto (`src/data/skills100.ts`), está localizado y
 * se cita abajo.
 *
 * Lo que sí hay, y se puede medir: dos transportes REALES (uno local en proceso,
 * otro por red con streaming HTTP) detrás de una misma interfaz, un búfer
 * circular de verdad, y métricas de TTFT medidas de verdad. El salto a
 * memoria compartida entre el servidor Node y el puente Python es un trabajo
 * aparte, con su propio proceso, y está listado como tal.
 */

/** Tamaño de trozo por defecto, en bytes. 20-40 ms es el rango del audio natural. */
export const TROZO_POR_DEFECTO = 512;

// ============================================================================
// 1 · EL CONTRATO ÚNICO
// ============================================================================
export interface Trozo {
  /** Índice de trozo dentro del stream. Sirve para detectar huecos y desorden. */
  n: number;
  bytes: Uint8Array;
  /** Marca de tiempo del momento en que se RECIBIÓ, no en que se generó. */
  tRecibido: number;
}

export interface MetricasPuente {
  modo: string;
  /** Milisegundos desde el envío hasta el PRIMER trozo recibido. El número clave. */
  ttftMs: number;
  /** Milisegundos de todo el ciclo. */
  totalMs: number;
  trozos: number;
  bytes: number;
  /** Bytes por segundo sostenidos, medidos sólo sobre el tramo de streaming. */
  bytesPorSegundo: number;
  /** Trozos perdidos por desbordamiento del búfer. Cero en un sistema sano. */
  perdidos: number;
}

export interface PuenteIA {
  readonly modo: string;
  /** Abre el canal. Debe poder llamarse dos veces sin romper nada. */
  conectar(): Promise<void>;
  /** Produce el stream. Cada trozo va directo al búfer circular. */
  enviar(entrada: string): AsyncGenerator<Trozo, void, unknown>;
  cerrar(): Promise<void>;
}

// ============================================================================
// 2 · BÚFER CIRCULAR — con política de desbordamiento EXPLÍCITA
// ============================================================================
export type PoliticaDesborde = "bloquear" | "descartar-viejo" | "descartar-nuevo";

export interface ResultadoEscritura {
  ok: boolean;
  /** true cuando la política fue «descartar-viejo» y hubo que tirar algo. */
  descarto: number;
}

/**
 * Búfer circular de trozos.
 *
 * Nota deliberada: el productor NO espera. En el bucle de generación de un modelo
 * nadie puede poner un `await` a que la interfaz consuma, porque eso mete la
 * lentitud de la interfaz DENTRO de la generación — que es exactamente el error
 * que ASIO existe para evitar. Por eso la política por defecto es `descartar-viejo`
 * cuando se llena: es preferible perder el trozo más antiguo que frenar al modelo.
 * (Con matiz: eso vale para AUDIO, donde el trozo viejo ya no se puede usar. Para
 * una respuesta de texto, descartar es perder contenido, así que la política se
 * declara por uso y NO se deja en un valor por defecto sin pensar.)
 */
export class BufferCircular {
  private readonly datos: (Trozo | null)[];
  private cabeza = 0; // próximo hueco de escritura
  private cola = 0; // próximo hueco de lectura
  private _tamano = 0;
  private _perdidos = 0;

  constructor(readonly capacidad: number, readonly politica: PoliticaDesborde = "bloquear") {
    if (!Number.isInteger(capacidad) || capacidad < 1) {
      throw new Error(`Capacidad de búfer inválida: ${capacidad}. Debe ser un entero >= 1.`);
    }
    this.datos = new Array<Trozo | null>(capacidad).fill(null);
  }

  get tamano(): number { return this._tamano; }
  get lleno(): boolean { return this._tamano === this.capacidad; }
  get vacio(): boolean { return this._tamano === 0; }
  get perdidos(): number { return this._perdidos; }

  escribir(t: Trozo): ResultadoEscritura {
    if (this.lleno) {
      if (this.politica === "bloquear") return { ok: false, descarto: 0 };
      if (this.politica === "descartar-nuevo") { this._perdidos++; return { ok: false, descarto: 1 }; }
      // descartar-viejo: se avanza la cola y el trozo más antiguo se pierde.
      this.datos[this.cola] = null;
      this.cola = (this.cola + 1) % this.capacidad;
      this._tamano--;
      this._perdidos++;
      this.datos[this.cabeza] = t;
      this.cabeza = (this.cabeza + 1) % this.capacidad;
      this._tamano++;
      return { ok: true, descarto: 1 };
    }
    this.datos[this.cabeza] = t;
    this.cabeza = (this.cabeza + 1) % this.capacidad;
    this._tamano++;
    return { ok: true, descarto: 0 };
  }

  leer(): Trozo | null {
    if (this.vacio) return null;
    const t = this.datos[this.cola];
    this.datos[this.cola] = null;
    this.cola = (this.cola + 1) % this.capacidad;
    this._tamano--;
    return t;
  }

  /** Vacía el búfer y devuelve los trozos EN ORDEN de escritura. */
  drenar(): Trozo[] {
    const fuera: Trozo[] = [];
    for (let t = this.leer(); t !== null; t = this.leer()) fuera.push(t);
    return fuera;
  }
}

// ============================================================================
// 3 · LOS DOS TRANSPORTES REALES
// ============================================================================
/**
 * Local: en proceso. NO es memoria compartida entre procesos — eso es el trabajo
 * pendiente. Es el techo teórico: sin red, sin serialización, sin socket. Sirve
 * para tener una referencia contra la que medir el coste REAL de ir a la nube, que
 * es la única forma de saber si un enlace es bueno o simplemente es el que hay.
 */
export class PuenteLocal implements PuenteIA {
  readonly modo = "LOCAL (en proceso)";

  async conectar(): Promise<void> { /* sin handshake: es el punto de esta implementación */ }

  async *enviar(entrada: string): AsyncGenerator<Trozo, void, unknown> {
    const partes = entrada.match(/.{1,4}/gs) ?? [];
    let n = 0;
    for (const p of partes) {
      // Un `await` con 0 ms devuelve el control al bucle de eventos: es lo mínimo
      // para que el consumidor pueda leer mientras se produce. Sin esto no hay
      // streaming, habría una lista.
      await new Promise((r) => setTimeout(r, 0));
      yield { n: n++, bytes: new TextEncoder().encode(p), tRecibido: Date.now() };
    }
  }

  async cerrar(): Promise<void> { /* nada que cerrar */ }
}

/**
 * Nube (o servidor local por red): HTTP con streaming.
 *
 * La dirección NO se inventa: se pasa. Si no hay extremo, `conectar` falla y el
 * fallo se devuelve tal cual — no se simulan trozos para que el banco de pruebas
 * quede bonito. Un banco que se inventa la respuesta no mide el sistema, mide su
 * propia imaginación.
 */
export class PuenteNube implements PuenteIA {
  readonly modo: string;
  constructor(private readonly url: string, private readonly cuerpo: (e: string) => unknown) {
    this.modo = `NUBE (${url.replace(/^https?:\/\//, "").slice(0, 40)})`;
  }

  async conectar(): Promise<void> { /* la conexión se abre en la primera petición */ }

  async *enviar(entrada: string): AsyncGenerator<Trozo, void, unknown> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.cuerpo(entrada)),
    });
    if (!res.ok || !res.body) throw new Error(`El extremo respondió ${res.status} y no hay cuerpo que leer.`);
    const lector = res.body.getReader();
    const dec = new TextDecoder();
    let n = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      if (!value) continue;
      // Cada lectura del socket es un trozo: se entrega TAL CUAL llegó, sin
      // reagrupar. Reagrupar es esperar, y esperar aquí es justo lo que se viene
      // a eliminar.
      yield { n: n++, bytes: value, tRecibido: Date.now() };
      void dec; // el descifrado a texto es de quien consuma, no del transporte
    }
  }

  async cerrar(): Promise<void> { /* el lector se cierra al agotarse el stream */ }
}

// ============================================================================
// 4 · EL MEDIDOR — TTFT de verdad
// ============================================================================
/**
 * Ejecuta el ciclo completo y mide. Es la pieza que faltaba en el motor: el
 * catálogo de habilidades anunciaba «medición en tiempo real de TTFT» sin que
 * existiera una sola línea que lo midiera.
 */
export async function medirPuente(
  puente: PuenteIA,
  entrada: string,
  capacidadBuffer = 64,
  politica: PoliticaDesborde = "descartar-viejo"
): Promise<MetricasPuente> {
  const t0 = Date.now();
  await puente.conectar();

  const buffer = new BufferCircular(capacidadBuffer, politica);
  let ttftMs = -1;
  let trozos = 0;
  let bytes = 0;
  let tPrimero = 0;
  let tUltimo = 0;

  for await (const t of puente.enviar(entrada)) {
    if (ttftMs < 0) { ttftMs = t.tRecibido - t0; tPrimero = t.tRecibido; }
    tUltimo = t.tRecibido;
    buffer.escribir(t);
  }

  // Se drena al final: en un uso real el consumidor lee EN PARALELO mientras se
  // produce. Aquí se drena después para poder contar sin condiciones de carrera,
  // y por eso el `bytesPorSegundo` mide el tramo de producción, no el de consumo.
  for (const t of buffer.drenar()) { trozos++; bytes += t.bytes.length; }

  await puente.cerrar();
  const totalMs = Date.now() - t0;
  const tramoStream = Math.max(1, tUltimo - tPrimero);

  return {
    modo: puente.modo,
    ttftMs: ttftMs < 0 ? -1 : ttftMs,
    totalMs,
    trozos,
    bytes,
    bytesPorSegundo: Math.round((bytes / tramoStream) * 1000),
    perdidos: buffer.perdidos,
  };
}

/** Compara dos modos con la MISMA entrada. Sin esto, comparar no significa nada. */
export async function compararPuentes(
  pares: Array<{ puente: PuenteIA; entrada: string }>,
  capacidadBuffer = 64
): Promise<MetricasPuente[]> {
  const salida: MetricasPuente[] = [];
  for (const par of pares) salida.push(await medirPuente(par.puente, par.entrada, capacidadBuffer));
  return salida;
}

/** Veredicto legible, con la regla escrita para que no se discuta a ojo. */
export function veredicto(m: MetricasPuente): string {
  if (m.ttftMs < 0) return "SIN DATOS: el stream terminó sin un solo trozo.";
  if (m.ttftMs <= 300) return `FLUIDO (TTFT ${m.ttftMs} ms): por debajo del umbral de percepción conversacional.`;
  if (m.ttftMs <= 800) return `ACEPTABLE (TTFT ${m.ttftMs} ms): se nota, no molesta.`;
  return `LENTO (TTFT ${m.ttftMs} ms): el usuario cree que no ha funcionado.`;
}

/** El umbral de «se siente instantáneo», en un sitio y con su origen. */
export const UMBRAL_TTFT_MS = { fluido: 300, aceptable: 800 } as const;
