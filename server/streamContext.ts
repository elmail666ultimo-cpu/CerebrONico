/**
 * streamContext.ts — EL CONTEXTO DE STREAMING SSE (v1.14.0)
 * =========================================================
 * QUÉ ES: el contexto reutilizable que envuelve una respuesta de streaming
 * (`/api/ai/stream`) y su reloj de 8 minutos.
 * PARA QUÉ SIRVE: para tener UN solo sitio que escriba los eventos SSE (chunk,
 * done, error) sin repetir la lógica de aborto/watchdog en cada proveedor. Salió
 * de `server.ts` en la v1.14.0 para que la certeza se pudiera enganchar al texto
 * del modelo sin hacer crecer el monolito (trinquete de la Fase 2).
 *
 * v1.14.0 · LA CERTEZA LLEGA AL TEXTO DEL MODELO
 * -------------------------------------------------
 * Hasta aquí, el texto del modelo se emitía tal cual: podía decir «funciona» sin
 * ejecución detrás. Ahora el contexto ACUMULA los chunks (sin añadir latencia: es
 * memoria, no una segunda llamada al modelo) y, al cerrar el turno, pasa el texto
 * completo por `revisarSalida`. Si hay afirmaciones sin evidencia, el marcado
 * viaja EN el texto (un chunk más, antes del done), no en un banner. La frase que
 * explica qué significa la marca se dice UNA vez por conversación (regla R2).
 */
import type { Response } from "express";
import type { MetricasInferencia } from "../src/engine/metricasInferencia";
import { revisarSalida, marcaDeSalida, type EvidenciaModelo } from "../src/engine/certezaModelo";

const WATCHDOG_TIMEOUT_MS = 8 * 60 * 1000; // 8 min cap on any single /api/ai/stream

/** Ya explicado (R2): la frase que enseña qué significan las marcas se dice una vez. */
const avisoCertezaYaDicho = new Set<string>();

export class StreamContext {
  private aborted = false;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private acumulado = "";
  private evidencia: EvidenciaModelo = {};

  constructor(private readonly res: Response) {
    // 🔧 CORRECCIÓN CRÍTICA: usar res.on("close"), NO req.on("close").
    // En Express, `req` emite 'close' al terminar de recibir el body (antes del
    // primer token), lo que marcaba isAborted=true al instante y mataba el
    // streaming de TODOS los proveedores. `res.on("close")` solo se dispara
    // cuando la conexión del cliente se corta de verdad (o ya terminamos).
    // El guard `!res.writableEnded` evita marcar abortado si ya cerramos limpio.
    res.on("close", () => {
      if (!res.writableEnded) this.aborted = true;
    });

    this.watchdog = setTimeout(() => {
      if (!res.writableEnded) {
        console.warn("[ai/stream] Watchdog: cierre forzado tras 8 min sin terminar.");
        res.write(`data: ${JSON.stringify({ error: "⏱️ El motor de inferencia no respondió a tiempo. Reinicia Ollama e intenta de nuevo.", done: true })}\n\n`);
        res.end();
      }
    }, WATCHDOG_TIMEOUT_MS);
  }

  /** Declara lo que el motor SABE de esta respuesta (¿se ejecutó algo de verdad?). */
  setEvidencia(evidencia: EvidenciaModelo): void {
    this.evidencia = evidencia;
  }

  isAborted(): boolean { return this.aborted; }
  isWritable(): boolean { return !this.aborted && !this.res.writableEnded; }

  sendChunk(text: string): void {
    if (this.isWritable()) {
      this.res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    // Se acumula SIEMPRE (aunque la conexión esté cerrada): es el texto completo
    // que el revisor necesita al cerrar el turno. No añade latencia perceptible.
    this.acumulado += text;
  }

  sendDone(modelUsed: string, metricas?: MetricasInferencia | null): void {
    this.clearWatchdog();
    if (!this.isWritable()) return;

    // v1.14.0 · La respuesta pasa por el revisor ANTES de darse por terminada.
    const revision = revisarSalida(this.acumulado, this.evidencia);
    if (revision.avisos.length > 0) {
      const conExplicacion = !avisoCertezaYaDicho.has(revision.certeza);
      if (conExplicacion) avisoCertezaYaDicho.add(revision.certeza);
      this.res.write(`data: ${JSON.stringify({ text: marcaDeSalida(revision, conExplicacion) })}\n\n`);
    }

    // v1.6.32 · D8: la última línea del stream trae, además del modelo, la
    // MÉDIDA REAL del motor (tokens, tk/s, carga) cuando la hubo. Antes se
    // tiraba y el cliente la reconstruía a ciegas con len/4.
    this.res.write(`data: ${JSON.stringify({ done: true, model: modelUsed, ...(metricas ? { metricas } : {}) })}\n\n`);
    this.res.end();
  }

  sendError(errMsg: string): void {
    this.clearWatchdog();
    if (this.isWritable()) {
      this.res.write(`data: ${JSON.stringify({ error: errMsg, done: true })}\n\n`);
      this.res.end();
    }
  }

  sendTaskEvent(task: any): void {
    if (this.isWritable()) {
      this.res.write(`data: ${JSON.stringify({ task })}\n\n`);
    }
  }

  clearWatchdog(): void {
    if (this.watchdog !== null) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
  }
}
