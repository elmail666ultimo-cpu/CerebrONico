/**
 * inferenceBuffer.ts — BÚFER DE INFERENCIA CON RECUPERACIÓN
 * =========================================================
 * El búfer recibe trozos de la respuesta de un motor de inferencia (SSE con
 * `data: {…}`, NDJSON de Ollama, o texto plano de un modelo local) y responde a
 * una sola pregunta: **¿qué mensaje hay aquí?**
 *
 * El problema que resuelve este módulo NO es «parsear JSON». Es que un fallo de
 * parseo no puede hacer desaparecer el mensaje. La versión anterior devolvía
 * `latencyMs` y `payloadSize` en el camino de error y tiraba el contenido: el
 * llamante recibía «error_recovered» y cero texto, o sea, perdía justo lo que
 * había que salvar. Aquí el mensaje viaja SIEMPRE, por el camino que sea.
 *
 * Cascada de recuperación, de la lectura más fiel a la más tolerante:
 *   1. andamiaje fuera (BOM, `data:`, `[DONE]`, vallas ```json)
 *   2. JSON.parse directo ............................. success
 *   3. primer objeto equilibrado dentro de prosa ...... success
 *   4. NDJSON: varias líneas JSON, se fusionan ........ success
 *   5. reparación conservadora (comas colgando) ....... error_recovered
 *   6. truncado: se cierra y se entrega lo que hay .... error_recovered
 *   7. texto plano: el mensaje ES el texto ............ error_recovered
 *
 * ESTADOS
 *   success          el payload se entendió; `data` trae el objeto completo
 *   incomplete       el trozo acaba a media estructura: todavía puede llegar más
 *   error_recovered  no se pudo entender como JSON, pero el mensaje se entrega
 *
 * `incomplete` es deliberado y NO estaba en el contrato original. Un trozo
 * cortado a mitad de stream no es un error de decodificación, y tratarlo como
 * tal es exactamente lo que hace perder mensajes: el búfer reconstruiría un
 * objeto a medias y lo daría por bueno. Solo aparece si el llamante pide
 * `final: false`; una llamada suelta asume `final: true` y nunca se queda
 * esperando un trozo que ya no va a llegar.
 *
 * Puro: sin DOM, sin red, sin dependencias. Node puede testearlo.
 */

/* ============================================================
   CONTRATO
   ============================================================ */

export type BufferStatus = "success" | "incomplete" | "error_recovered";

export interface BufferState {
  status: BufferStatus;

  /**
   * EL MENSAJE. Es la garantía del módulo: si la entrada tenía contenido
   * legible, `content` nunca sale vacío, ni siquiera cuando el JSON está
   * destrozado. Puede venir parcial si el trozo venía parcial, y entonces
   * `reason` lo dice.
   *
   * v1.6.6 — el campo se llama así, y no «message», para converger con el contrato
   * de la aplicación y con el vocabulario del sector (`choices[].delta.content`,
   * `content[].text`). UN nombre para UNA cosa: con dos, tarde o temprano se
   * lee el campo equivocado y se concluye que el mensaje no llegó.
   */
  content: string;

  /**
   * Latencia REAL medida por el búfer (ms), no lo que el payload afirme sobre
   * sí mismo. `0` si el llamante no dio `startedAt`: sin origen no hay intervalo
   * que medir, y devolver un número inventado sería peor que devolver cero.
   */
  latencyMs: number;

  /** Tamaño del trozo en BYTES UTF-8 (no en caracteres: un acento ocupa dos). */
  payloadSize: number;

  /** Objeto parseado cuando se pudo entender; `null` en recuperación o espera. */
  data: Record<string, unknown> | null;

  /** Por qué se recuperó o por qué se está esperando más datos. */
  reason?: string;

  /**
   * Duración que el payload declara sobre el motor, normalizada a ms.
   * OJO: NO es la latencia. Antes se devolvía esto como `latencyMs`, y en Ollama
   * `total_duration` viene en NANOSEGUNDOS — se estaba publicando un tiempo un
   * millón de veces mayor, con toda la confianza del mundo.
   */
  payloadDurationMs?: number;

  /**
   * Reloj de PARED del momento en que se procesó el trozo.
   * Es un sello, no un intervalo: para medir latencias sirve `latencyMs`, que se
   * calcula restando dos lecturas del mismo reloj. `timestamp` se guarda con
   * `Date.now()`, que NO es monótono: si NTP o el usuario mueven la hora del
   * sistema, dos sellos consecutivos pueden ir hacia atrás. Por eso las restas
   * de latencia van acotadas a cero en vez de confiar en el reloj.
   */
  timestamp: number;

  /**
   * DERIVADO de `status`, nunca almacenado en paralelo:
   *     validStream === (status !== "error_recovered")
   * Existe porque el contrato lo pedía, pero se calcula, no se copia: un campo
   * duplicado es un campo que puede contradecir al original.
   *
   * Con solo dos estados era idéntico a `status === "success"`. Al entrar
   * `incomplete` deja de serlo —un trozo a medias NO está corrupto, simplemente
   * no ha terminado— y ahí está su utilidad: distingue «el transporte va bien,
   * espera» de «esto venía roto, se ha recuperado».
   */
  validStream: boolean;
}

export interface OpcionesBuffer {
  /** Marca temporal del primer byte recibido; habilita `latencyMs`. */
  startedAt?: number;
  /**
   * `true` (por defecto): no va a llegar nada más, así que un JSON truncado se
   * cierra y se entrega. `false`: estamos dentro de un stream, un truncado es
   * simplemente «todavía no».
   */
  final?: boolean;
  /** Por encima de este tamaño se salta la reconstrucción (evita O(n) patológicos). */
  limiteReconstruccion?: number;
}

/* ============================================================
   UTILIDADES
   ============================================================ */

/** Tamaño real en bytes UTF-8, en navegador y en Node. */
function tamanoBytes(texto: string): number {
  try {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(texto).length;
  } catch { /* sin TextEncoder: cae al recuento por caracteres */ }
  return texto.length;
}

/** Control impronunciable fuera; \n y \t se conservan porque el código los usa. */
function sanearTextoPlano(texto: string): string {
  return texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

/** Claves donde los motores reales ponen el texto, en orden de preferencia. */
const CLAVES_MENSAJE = [
  "text", "texto", "content", "contenido", "message", "mensaje",
  "response", "respuesta", "answer", "output_text", "completion", "generated_text",
  // El error del motor TAMBIÉN es contenido que el usuario tiene que ver.
  // Este servidor publica `{error:"…",done:true}` por SSE (es el camino de los
  // timeouts y de los fallos del motor). Sin estas claves, un error con texto
  // caía en «JSON válido sin campo de texto» y el mensaje desaparecía sin dejar
  // rastro — justo el fallo que este módulo existe para evitar. Lo encontró el
  // corpus de payloads, no una lectura del código.
  "error", "motivo", "detail",
] as const;

/**
 * Claves que contienen el mensaje en las formas de proveedor.
 * Cubren array y objeto, y también cadena suelta:
 *   choices[0].delta.content · candidates[0].content.parts[].text
 *   content[].text           (Anthropic)     · output[] · results[]
 *   {delta:"texto"}          (algunos proxies locales)
 *
 * NO se incluye `messages`: en una respuesta de inferencia no es salida, es el
 * eco de la entrada. Colarlo como «el mensaje» devolvería la conversación
 * entera del usuario como si fuera la respuesta del modelo.
 */
const CLAVES_ENVOLTORIO = [
  "choices", "candidates", "content", "contents", "output", "parts", "data", "delta",
] as const;

/**
 * Saca el texto de un objeto ya parseado, sean las formas simples
 * (`{text}`, `{message}`, `{response}`) o las de proveedor
 * (`choices[0].delta.content`, `candidates[0].content.parts[0].text`).
 * Devuelve `null` si no hay texto: un `{done:true}` no es un mensaje.
 */
function extraerMensaje(dato: unknown, profundidad = 0): string | null {
  if (profundidad > 6) return null;
  if (typeof dato === "string") return dato.length > 0 ? dato : null;
  if (!dato || typeof dato !== "object") return null;

  const obj = dato as Record<string, unknown>;

  for (const clave of CLAVES_MENSAJE) {
    const valor = obj[clave];
    if (typeof valor === "string" && valor.length > 0) return valor;
    if (valor && typeof valor === "object") {
      const anidado = extraerMensaje(valor, profundidad + 1);
      if (anidado) return anidado;
    }
  }

  for (const clave of CLAVES_ENVOLTORIO) {
    const valor = obj[clave];
    if (Array.isArray(valor)) {
      const partes: string[] = [];
      for (const elemento of valor) {
        const texto = extraerMensaje(elemento, profundidad + 1);
        if (texto) partes.push(texto);
      }
      if (partes.length > 0) return partes.join("");
    } else if (typeof valor === "string") {
      // `{delta:"texto"}`: algunos proxies locales devuelven la cadena directa
      // en la clave del envoltorio. Antes se ignoraba y el mensaje se
      // declaraba «JSON válido sin campo de texto»: perdido sin avisar.
      if (valor.length > 0) return valor;
    } else if (valor && typeof valor === "object") {
      // `delta` viene como ARRAY en OpenAI (`choices[].delta`) pero como OBJETO
      // en otros envoltorios (`{delta:{content}}`). Tratar solo el array dejaba
      // ese segundo caso devolviendo vacío pese a que el texto estaba ahí.
      const anidado = extraerMensaje(valor, profundidad + 1);
      if (anidado) return anidado;
    }
  }

  return null;
}

/** Nanosegundos si el nombre lo dice y el número es absurdo para milisegundos. */
function normalizarDuracion(clave: string, valor: number): number | undefined {
  if (!Number.isFinite(valor) || valor <= 0) return undefined;
  if (/_duration$|_duration_ms$/.test(clave) || clave === "total_duration") {
    // Ollama publica nanosegundos en `*_duration`; por debajo de 1e7 ns (<10 ms
    // reales) el dato no es creíble, así que se respeta tal cual.
    return valor > 1e7 ? valor / 1e6 : valor;
  }
  return valor;
}

function duracionDelPayload(dato: Record<string, unknown> | null): number | undefined {
  if (!dato) return undefined;
  for (const clave of ["duration_ms", "total_duration", "eval_duration", "duration", "latency_ms"]) {
    const valor = dato[clave];
    if (typeof valor === "number") {
      const ms = normalizarDuracion(clave, valor);
      if (ms !== undefined) return ms;
    }
  }
  return undefined;
}

/* ============================================================
   ANDAMIAJE DE TRANSPORTE
   ============================================================ */

/**
 * Quita lo que NO es mensaje: BOM, prefijos `data:` de SSE, el centinela
 * `[DONE]` y las vallas ```json de los modelos que envuelven su JSON.
 * Devuelve también las notas de lo que se quitó, para poder contarlo.
 */
function quitarAndamiaje(bruto: string): { texto: string; notas: string[] } {
  const notas: string[] = [];
  let texto = bruto.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();

  // SSE: puede venir con uno o varios `data:` si el trozo trae varias líneas.
  if (/^data:\s*/i.test(texto)) {
    texto = texto
      .split("\n")
      .filter((linea) => /^data:\s*/i.test(linea))
      .map((linea) => linea.replace(/^data:\s*/i, ""))
      .join("\n");
    notas.push("prefijo SSE «data:» fuera");
  }

  if (/\[DONE\]/i.test(texto)) {
    texto = texto.replace(/\[DONE\]\s*$/i, "").trim();
    notas.push("centinela [DONE] fuera");
  }

  const valla = texto.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/);
  if (valla) {
    texto = valla[1].trim();
    notas.push("valla markdown fuera");
  }

  return { texto, notas };
}

/* ============================================================
   EXTRACCIÓN Y RECONSTRUCCIÓN DE JSON
   ============================================================ */

/**
 * Primer objeto/array equilibrado dentro de un texto con prosa alrededor.
 * Respeta cadenas y escapes: una llave dentro de un string no abre nada.
 */
function extraerPrimerJson(texto: string): { json: string; truncado: boolean } | null {
  const inicio = texto.search(/[[{]/);
  if (inicio < 0) return null;

  const pila: string[] = [];
  let enCadena = false;
  let escapado = false;

  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];

    if (enCadena) {
      if (escapado) { escapado = false; continue; }
      if (c === "\\") { escapado = true; continue; }
      if (c === '"') enCadena = false;
      continue;
    }

    if (c === '"') { enCadena = true; continue; }
    if (c === "{" || c === "[") { pila.push(c); continue; }
    if (c === "}" || c === "]") {
      const abre = pila.pop();
      if (!abre) return null;                                  // cierre huérfano
      if ((abre === "{") !== (c === "}")) return null;          // cruce de tipos
      if (pila.length === 0) return { json: texto.slice(inicio, i + 1), truncado: false };
    }
  }

  return { json: texto.slice(inicio), truncado: true };
}

/** Cierra un JSON cortado: cadena abierta, coma colgando y estructuras sin cerrar. */
function cerrarJsonParcial(fragmento: string): string | null {
  const pila: string[] = [];
  let enCadena = false;
  let escapado = false;

  for (let i = 0; i < fragmento.length; i++) {
    const c = fragmento[i];
    if (enCadena) {
      if (escapado) { escapado = false; continue; }
      if (c === "\\") { escapado = true; continue; }
      if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') { enCadena = true; continue; }
    if (c === "{" || c === "[") { pila.push(c); continue; }
    if (c === "}" || c === "]") {
      const abre = pila.pop();
      if (!abre) return null;
      if ((abre === "{") !== (c === "}")) return null;
    }
  }

  if (pila.length === 0 && !enCadena) return null; // no estaba cortado

  let salida = fragmento;
  if (escapado) salida = salida.slice(0, -1);      // barra suelta al final
  if (enCadena) salida += '"';                     // cadena sin cerrar
  salida = salida.replace(/,\s*$/, "");            // coma colgando
  for (let i = pila.length - 1; i >= 0; i--) salida += pila[i] === "{" ? "}" : "]";
  return salida;
}

/** Reparación conservadora: solo comas antes de un cierre. No toca comillas. */
function repararComasColgando(texto: string): string {
  return texto.replace(/,(\s*[}\]])/g, "$1");
}

/* ============================================================
   NÚCLEO
   ============================================================ */

function comoObjeto(dato: unknown): Record<string, unknown> | null {
  return dato && typeof dato === "object" && !Array.isArray(dato)
    ? (dato as Record<string, unknown>)
    : null;
}

function medirLatencia(startedAt?: number): number {
  if (typeof startedAt !== "number") return 0;
  const ahora = Date.now();
  return ahora >= startedAt ? ahora - startedAt : 0;
}

/** Estado todavía sin los dos campos que añade el envoltorio público. */
type EstadoParcial = Omit<BufferState, "timestamp" | "validStream">;

/**
 * Analiza UN trozo del stream. INTERNO: `timestamp` y `validStream` los pone
 * `handleInferenceStream`, y se ponen en un solo sitio a propósito.
 *
 * Aquí abajo hay once caminos de salida. Si cada uno tuviera que acordarse de
 * rellenar los campos comunes, tarde o temprano uno se olvidaría — y esa es
 * exactamente la clase de fallo que este módulo existe para evitar: un camino
 * que devuelve la mitad de lo que promete.
 */
function analizarTrozo(streamData: string, opciones: OpcionesBuffer = {}): EstadoParcial {
  const { startedAt, final = true, limiteReconstruccion = 262144 } = opciones;

  const bruto = typeof streamData === "string" ? streamData : String(streamData ?? "");
  const base = {
    latencyMs: medirLatencia(startedAt),
    payloadSize: tamanoBytes(bruto),
  };

  const { texto, notas } = quitarAndamiaje(bruto);
  const nota = (extra?: string) => [...notas, extra].filter(Boolean).join("; ");

  // Sin nada que entregar: es un latido o el final del stream, no un mensaje.
  if (texto.length === 0) {
    return {
      ...base,
      status: "incomplete",
      content: "",
      data: null,
      reason: nota("el trozo no traía contenido (latido o cierre de stream)"),
    };
  }

  /* --- 1. Lectura directa ------------------------------------------------ */
  try {
    const dato = JSON.parse(texto);
    const objeto = comoObjeto(dato);
    const mensaje = extraerMensaje(dato);

    if (mensaje !== null) {
      return {
        ...base,
        status: "success",
        content: mensaje,
        data: objeto,
        payloadDurationMs: duracionDelPayload(objeto),
        ...(notas.length > 0 ? { reason: nota() } : {}),
      };
    }

    // JSON válido pero sin texto (p. ej. `{"done":true}`): nada que mostrar aún.
    return {
      ...base,
      status: "incomplete",
      content: "",
      data: objeto,
      payloadDurationMs: duracionDelPayload(objeto),
      reason: nota("JSON válido sin campo de texto"),
    };
  } catch { /* se intenta la cascada */ }

  /* --- 2. NDJSON: varias líneas JSON, se fusionan ------------------------ */
  // Va ANTES de la extracción de un único objeto a propósito: el extractor se
  // queda con el PRIMER objeto equilibrado y descarta el resto, así que en un
  // NDJSON de dos líneas devolvía solo la primera y el segundo mensaje se
  // perdía en silencio. Aquí solo se acepta si TODAS las líneas son JSON.
  const lineas = texto.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lineas.length > 1) {
    const objetos: Record<string, unknown>[] = [];
    let todasOk = true;
    for (const linea of lineas) {
      try {
        const objeto = comoObjeto(JSON.parse(linea));
        if (!objeto) { todasOk = false; break; }
        objetos.push(objeto);
      } catch { todasOk = false; break; }
    }
    if (todasOk && objetos.length > 0) {
      const mensaje = objetos.map((o) => extraerMensaje(o) ?? "").join("");
      const ultimo = objetos[objetos.length - 1];
      return {
        ...base,
        status: "success",
        content: mensaje,
        data: ultimo,
        payloadDurationMs: duracionDelPayload(ultimo),
        reason: nota(`${objetos.length} líneas NDJSON fusionadas`),
      };
    }
  }

  /* --- 3. Primer objeto equilibrado dentro de prosa ---------------------- */
  const extraido = texto.length <= limiteReconstruccion ? extraerPrimerJson(texto) : null;

  if (extraido && !extraido.truncado) {
    try {
      const dato = JSON.parse(extraido.json);
      const mensaje = extraerMensaje(dato);
      if (mensaje !== null) {
        return {
          ...base,
          status: "success",
          content: mensaje,
          data: comoObjeto(dato),
          payloadDurationMs: duracionDelPayload(comoObjeto(dato)),
          reason: nota("JSON rescatado de dentro de la prosa"),
        };
      }
    } catch { /* sigue la cascada */ }
  }

  /* --- 4. Reparación conservadora ---------------------------------------- */
  if (texto.length <= limiteReconstruccion) {
    const reparado = repararComasColgando(texto);
    if (reparado !== texto) {
      try {
        const dato = JSON.parse(reparado);
        const mensaje = extraerMensaje(dato);
        if (mensaje !== null) {
          return {
            ...base,
            status: "error_recovered",
            content: mensaje,
            data: comoObjeto(dato),
            reason: nota("JSON malformado: comas colgando reparadas"),
          };
        }
      } catch { /* sigue la cascada */ }
    }
  }

  /* --- 5. Truncado ------------------------------------------------------- */
  if (extraido?.truncado) {
    if (!final) {
      // Estamos en stream: esto no es un error, es «todavía no». Esperar es
      // mejor que entregar un objeto reconstruido a medias como si fuera bueno.
      return {
        ...base,
        status: "incomplete",
        content: "",
        data: null,
        reason: nota("estructura sin cerrar: se espera el resto del stream"),
      };
    }

    const cerrado = texto.length <= limiteReconstruccion ? cerrarJsonParcial(extraido.json) : null;
    if (cerrado) {
      try {
        const dato = JSON.parse(cerrado);
        const mensaje = extraerMensaje(dato);
        if (mensaje !== null) {
          return {
            ...base,
            status: "error_recovered",
            content: mensaje,
            data: comoObjeto(dato),
            reason: nota("JSON truncado: reconstruido cerrando estructuras abiertas"),
          };
        }
      } catch { /* cae a texto plano */ }
    }
  }

  /* --- 6. Texto plano: el mensaje ES el texto ---------------------------- */
  // Último camino y el que da la garantía del módulo. Un modelo local que
  // contesta en prosa, un HTML de un proxy caído o un JSON irrecuperable
  // acaban aquí: se entrega el contenido crudo antes que perderlo.
  const plano = sanearTextoPlano(texto);
  if (plano.length === 0) {
    return {
      ...base,
      status: "incomplete",
      content: "",
      data: null,
      reason: nota("no quedó texto legible tras sanear"),
    };
  }

  return {
    ...base,
    status: "error_recovered",
    content: plano,
    data: null,
    reason: nota(extraido?.truncado ? "JSON truncado e irrecuperable: se entrega el texto crudo" : "no es JSON: se entrega el texto crudo"),
  };
}

/**
 * Analiza UN trozo del stream y devuelve SIEMPRE el mensaje.
 *
 * Compatible hacia atrás con la firma original —`handleInferenceStream(texto)`
 * sigue funcionando igual—, pero cierra dos huecos del contrato anterior:
 *
 *  1. El camino de error traía `rawFallback` y nada más. `rawFallback` es el
 *     texto CRUDO del transporte: en SSE eso incluye `data:` y las vallas del
 *     modelo, así que lo que llegaba a la interfaz no era el mensaje, era el
 *     cable. Aquí se limpia y viaja en `content`.
 *  2. El camino de ÉXITO no traía el texto en ningún campo. `rawFallback` es
 *     opcional y solo aparece al fallar, así que un consumidor tenía que mirar
 *     en dos sitios y el caso bueno no llevaba mensaje. `content` está en los
 *     dos caminos: la garantía deja de ser asimétrica.
 */
export function handleInferenceStream(streamData: string, opciones: OpcionesBuffer = {}): BufferState {
  // Sello ANTES de analizar: si el payload es enorme, la reconstrucción puede
  // tardar y `timestamp` debe marcar cuándo llegó el trozo, no cuándo terminó.
  const timestamp = Date.now();
  const parcial = analizarTrozo(streamData, opciones);

  return {
    ...parcial,
    timestamp,
    // Derivado en UN único sitio, para que no pueda contradecir a `status`.
    validStream: parcial.status !== "error_recovered",
  };
}

/* ============================================================
   BÚFER CON ESTADO (stream real)
   ============================================================ */

/**
 * Búfer incremental para NDJSON/SSE: acumula trozos, entrega solo las líneas
 * completas y se queda con la cola a medias. `flush()` cierra la sesión y
 * rescata lo pendiente aunque esté truncado.
 *
 * Sin esto, `handleInferenceStream` obliga al llamante a trocear por líneas y
 * a acordarse de rescatar la última — que es justo el trozo que se perdía.
 */
export class BufferInferencia {
  private pendiente = "";
  private inicio: number | null = null;
  private readonly opciones: OpcionesBuffer;
  /**
   * v1.6.6 — bloque cercado (```json … ```) a caballo entre trozos.
   *
   * El búfer trocea por `\n`, y una valla es MULTILÍNEA. Sin esto, el bloque
   * entraba como tres líneas sueltas: ` ```json ` no es JSON, así que se
   * entregaba como TEXTO y el usuario veía los tres acentos graves en pantalla
   * — justo el andamiaje que `quitarAndamiaje` existe para quitar, colándose
   * porque llegó partido. Ahora se acumula hasta la línea de cierre y se
   * entrega entero.
   */
  private enValla = false;
  private bloqueValla: string[] = [];

  constructor(opciones: OpcionesBuffer = {}) {
    this.opciones = opciones;
  }

  /** Bytes acumulados a la espera de completarse. */
  get pendienteBytes(): number {
    return tamanoBytes(this.pendiente);
  }

  /** Marca el origen del reloj de latencia (primer byte de la sesión). */
  private origen(): number {
    if (this.inicio === null) this.inicio = this.opciones.startedAt ?? Date.now();
    return this.inicio;
  }

  /**
   * Añade un trozo y devuelve los estados entregables (uno por línea cerrada).
   * Los trozos que aún no cierran estructura se quedan dentro, no se entregan.
   */
  push(trozo: string): BufferState[] {
    this.origen();
    this.pendiente += typeof trozo === "string" ? trozo : String(trozo ?? "");

    const lineas = this.pendiente.split("\n");
    this.pendiente = lineas.pop() ?? ""; // la última puede estar a medias

    const estados: BufferState[] = [];
    for (const linea of lineas) {
      // --- Bloque cercado: se acumula entero antes de analizarlo ---
      const recortada = linea.trim();
      if (this.enValla) {
        this.bloqueValla.push(linea);
        /*
         * v1.6.17 — 🐞 valla ANIDADA que cortaba el bloque antes de tiempo.
         *
         * La apertura exigía `/^```(\w+)?$/` (valla desnuda o con lenguaje) pero
         * el cierre se conformaba con `/^```/`: CUALQUIER línea que empezara por
         * tres acentos graves cerraba. Y el caso real que apareció probando la
         * interfaz es éste, de un modelo pequeño:
         *
         *     ```python
         *     # MEMORIA.md
         *     ```python        ← esto CERRABA el bloque, no lo anidaba
         *
         * Resultado: el bloque acababa antes de tiempo y todo lo que venía
         * después salía como texto suelto, sin valla.
         *
         * La regla correcta de Markdown (y de CommonMark) es que una valla de
         * CIERRE no puede llevar «info string»: cierra ` ``` ` a secas, y
         * ` ```python ` es contenido. Con eso la anidada se trata como lo que
         * es y el bloque sigue hasta su cierre de verdad.
         *
         * No se pierde texto en ningún caso: si el bloque no llega a cerrarse,
         * `flush()` ya rescata la valla abierta como contenido (ver más abajo).
         */
        if (/^```\s*$/.test(recortada)) {
          const bloque = this.bloqueValla.join("\n");
          this.enValla = false;
          this.bloqueValla = [];
          // El bloque está CERRADO: es una unidad completa, no un trozo a medias.
          estados.push(handleInferenceStream(bloque, { ...this.opciones, startedAt: this.inicio ?? undefined, final: true }));
        }
        continue;
      }
      // Abre valla solo ` ```lenguaje ` o ` ``` `. Un ` ``` ` suelto sin bloque
      // abierto se trata como línea normal: adivinar ahí se comería el resto.
      if (/^```(\w+)?$/.test(recortada)) {
        this.enValla = true;
        this.bloqueValla = [linea];
        continue;
      }

      const estado = handleInferenceStream(linea, {
        ...this.opciones,
        startedAt: this.inicio ?? undefined,
        final: false,
      });
      // Un `incomplete` sobre una línea ya cerrada por \n significa que la
      // estructura venía cortada: se devuelve al búfer por si el resto llega.
      if (estado.status === "incomplete" && estado.content === "" && linea.trim() !== "") {
        this.pendiente = linea + "\n" + this.pendiente;
        continue;
      }
      estados.push(estado);
    }
    return estados;
  }

  /** Cierra la sesión: rescata la cola pendiente como si fuera el último trozo. */
  flush(): BufferState[] {
    // Una valla sin cerrar también es contenido a rescatar, no basura.
    if (this.enValla && this.bloqueValla.length > 0) {
      this.pendiente = (this.enValla ? this.bloqueValla.join("\n") + "\n" : "") + this.pendiente;
      this.enValla = false;
      this.bloqueValla = [];
    }
    const resto = this.pendiente;
    this.pendiente = "";
    if (resto.trim() === "") return [];
    return [
      handleInferenceStream(resto, {
        ...this.opciones,
        startedAt: this.inicio ?? undefined,
        final: true,
      }),
    ];
  }

  /** Reinicia la sesión (nueva petición, mismo objeto). */
  reset(): void {
    this.pendiente = "";
    this.inicio = null;
    this.enValla = false;
    this.bloqueValla = [];
  }
}
