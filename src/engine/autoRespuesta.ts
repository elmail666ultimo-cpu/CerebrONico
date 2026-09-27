/**
 * autoRespuesta.ts — LA FACULTAD DE HABLAR SIN QUE TE PREGUNTEN (v1.8.0)
 * ======================================================================
 * QUÉ ES: el motor que decide qué dice el sistema por su cuenta, antes de que
 * nadie se lo pregunte.
 * PARA QUÉ SIRVE: para que lo que el motor YA SABE no se quede esperando a que
 * alguien acierte a preguntarlo. Hoy, si el motor descubre que una versión está
 * desincronizada, que una tanda quedó sin revisar o que hay una deuda conocida,
 * eso solo aparece si el usuario pregunta justo por ahí. Esta facultad lo dice.
 *
 * LA DIFERENCIA ENTRE HABLAR Y ATURRULLAR
 * «Que hable sin que le pregunten» es fácil de escribir mal: basta con que el
 * sistema suelte todo lo que tiene cada vez. Eso no es autonomía, es ruido, y
 * acaba con el usuario cerrando el panel. Las cuatro reglas de abajo son lo que
 * separa una cosa de la otra, y son las que la suite vigila:
 *
 *   R1 · NO SE INVENTA NADA. Si no hay hecho, aviso ni sugerencia, no hay
 *        mensaje. La facultad no rellena el silencio: lo respeta.
 *   R2 · UNA COSA SE DICE UNA VEZ (`clave` + `yaDichos`). Lo que ya se dijo no
 *        se repite aunque siga siendo verdad. Sin esto, proactivo = pesado.
 *   R3 · LA CERTEZA VIAJA EN EL TEXTO. Un hecho sin ejecución detrás se dice con
 *        su etiqueta («no verificado»). Un mensaje espontáneo no puede sonar más
 *        seguro que un informe: si suena igual, la gente deja de distinguirlos.
 *   R4 · HAY PRESUPUESTO DE ATENCIÓN (`maxMensajes`, 3 por defecto). Si hay una
 *        operación en curso (`ocupado`), SOLO pasan avisos: una sugerencia buena
 *        en medio de una escritura es una interrupción, no una ayuda.
 *
 * TODO ES DETERMINISTA: mismas entradas, mismos mensajes y en el mismo orden. Se
 * puede probar, y por eso se prueba.
 */
import { type Certeza, NOMBRE_CERTEZA } from "./certeza";
import { fraseDeCerteza } from "./vocabulario";

export type TipoMensaje = "aviso" | "dato" | "sugerencia";

/** Lo que el motor tiene comprobado o sabido, con la certeza que le corresponde. */
export interface HechoConocido {
  clave: string;
  texto: string;
  certeza: Certeza;
  evidencia?: string[];
}

export interface Aviso {
  clave: string;
  texto: string;
  motivo: string;
}

export interface Sugerencia {
  clave: string;
  texto: string;
  motivo: string;
}

export interface ContextoVoz {
  avisos?: Aviso[];
  hechos?: HechoConocido[];
  sugerencias?: Sugerencia[];
  /** Claves ya dichas en esta sesión: no se repiten (R2). */
  yaDichos?: string[];
  /** Presupuesto de atención (R4). Por defecto 3. */
  maxMensajes?: number;
  /** true si el usuario está en medio de una operación: solo avisos (R4). */
  ocupado?: boolean;
}

export interface MensajeEspontaneo {
  clave: string;
  tipo: TipoMensaje;
  texto: string;
  motivo: string;
  prioridad: number;
  certeza: Certeza;
}

export const PRIORIDAD: Record<TipoMensaje, number> = { aviso: 3, dato: 2, sugerencia: 1 };
export const MAX_POR_DEFECTO = 3;

/** Las reglas, en voz alta: esto es lo que la facultad se compromete a cumplir. */
export const REGLAS_VOZ: { id: string; regla: string }[] = [
  { id: "R1", regla: "No se inventa nada: sin hechos, avisos ni sugerencias, no hay mensaje." },
  { id: "R2", regla: "Una clave se dice una sola vez: lo ya dicho no se repite." },
  { id: "R3", regla: "La certeza viaja en el texto: lo no ejecutado se dice como no verificado." },
  { id: "R4", regla: "Hay presupuesto de atención, y con una operación en curso solo pasan avisos." },
];

/**
 * La etiqueta de duda se pega al TEXTO, no al pie. Un mensaje espontáneo que
 * dice «el fichero X se guardó» cuando solo se ha leído el código está
 * mintiendo en la primera línea, y nadie lee la segunda.
 */
function conTrazabilidad(texto: string, certeza: Certeza): string {
  if (certeza === "ejecutado") return texto;
  return `${texto} (${NOMBRE_CERTEZA[certeza]}; ${fraseDeCerteza(certeza)})`;
}

/**
 * Los mensajes que el sistema diría ahora mismo. Lista vacía = silencio, que es
 * una respuesta legítima y frecuente.
 */
export function mensajesEspontaneos(ctx: ContextoVoz = {}): MensajeEspontaneo[] {
  const yaDichos = new Set(ctx.yaDichos || []);
  const max = Math.max(0, ctx.maxMensajes ?? MAX_POR_DEFECTO);
  const salida: MensajeEspontaneo[] = [];

  for (const a of ctx.avisos || []) {
    if (yaDichos.has(a.clave)) continue;
    salida.push({
      clave: a.clave,
      tipo: "aviso",
      texto: a.texto,
      motivo: a.motivo,
      prioridad: PRIORIDAD.aviso,
      certeza: "ejecutado", // un aviso se dispara porque se ha observado algo
    });
  }

  // Con una operación en curso, se callan los datos y las sugerencias (R4): la
  // información sin prisa no interrumpe a quien está escribiendo.
  if (!ctx.ocupado) {
    for (const h of ctx.hechos || []) {
      if (yaDichos.has(h.clave)) continue;
      salida.push({
        clave: h.clave,
        tipo: "dato",
        texto: conTrazabilidad(h.texto, h.certeza),
        motivo: h.evidencia?.length ? `evidencia: ${h.evidencia.join(" · ")}` : "dato del motor",
        prioridad: PRIORIDAD.dato,
        certeza: h.certeza,
      });
    }
    for (const s of ctx.sugerencias || []) {
      if (yaDichos.has(s.clave)) continue;
      salida.push({
        clave: s.clave,
        tipo: "sugerencia",
        texto: s.texto,
        motivo: s.motivo,
        prioridad: PRIORIDAD.sugerencia,
        certeza: "sin_verificar", // una sugerencia es una propuesta, no un hecho
      });
    }
  }

  // Orden estable: por prioridad, y a igualdad por orden de llegada (no alfabético,
  // porque el orden de llegada lo eligió quien construyó el contexto).
  return salida
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.prioridad - a.m.prioridad || a.i - b.i)
    .slice(0, max)
    .map(({ m }) => m);
}

/** ¿Merece la pena hablar? (Evita pintar un panel vacío sin motivo.) */
export function debeHablar(ctx: ContextoVoz = {}): boolean {
  return mensajesEspontaneos(ctx).length > 0;
}

/** Acumula las claves dichas para poder pasarlas como `yaDichos` la próxima vez. */
export function marcarDichos(dichos: string[], mensajes: MensajeEspontaneo[]): string[] {
  return [...new Set([...(dichos || []), ...mensajes.map((m) => m.clave)])];
}

/** Traza corta para saber de dónde salió cada mensaje (para el panel y el informe). */
export function trazarMensajes(mensajes: MensajeEspontaneo[]): string[] {
  return mensajes.map((m) => `[${m.tipo} p${m.prioridad} · ${m.certeza}] ${m.clave} — ${m.motivo}`);
}
