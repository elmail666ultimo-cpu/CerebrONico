/**
 * telemetria.ts — ROUTER DE TELEMETRÍA Y RECURSOS (Fase 2, v1.12.0)
 * =================================================================
 * QUÉ ES: las tres rutas que informan de cómo está el sistema — puertos vivos,
 * forzar un re-chequeo y el monitor de recursos de la IDE y de la máquina.
 * PARA QUÉ SIRVE: para sacar del monolito un bloque que antes arrastraba DOS
 * variables de estado propias. Al moverlo, ese estado pasó a vivir en módulos con
 * API (`server/estado/telemetria.ts` y `server/estado/proceso.ts`), que es el
 * patrón que necesitan las otras dieciocho variables globales del servidor.
 *
 * LO QUE ESTE MÓDULO **NO** HACE, Y ES LO IMPORTANTE
 * No toca `sandboxProc`. Lo PIDE. Fíjate en `DepsTelemetria`: en vez de alcanzar
 * la variable del sandbox, declara exactamente qué necesita saber de ella («¿está
 * vivo?», «¿cuál es su PID?»). Eso convierte este fichero en la **especificación de
 * la siguiente extracción**: quien mueva el estado del sandbox ya sabe qué API
 * tiene que ofrecer. Un módulo que pregunta es mejor que uno que coge.
 *
 * LO QUE SE MOVIÓ TAL CUAL
 * Los cuerpos de las tres rutas están copiados del monolito; la única diferencia
 * es que el cálculo de CPU del proceso llama a `porcentajeCpu()` (el módulo de
 * estado) en vez de manipular una variable local, y que el sandbox se consulta por
 * las dos funciones de las dependencias. Ni una línea de lógica cambió.
 */
import os from "node:os";
import type express from "express";
import type { Request, Response } from "express";
import { cpuPercentReal } from "../../src/engine/hardwareGovernor";
import {
  muestraVigente,
  guardarMuestra,
  invalidarMuestra,
  TELEMETRY_PROBE_MS,
} from "../estado/telemetria";
import { porcentajeCpu } from "../estado/proceso";

export interface DepsTelemetria {
  /** URL base de Ollama (la misma que usa el resto del servidor). */
  ollamaUrl: string;
  /** Puerto del puente PC (:5000). */
  workerPort: number;
  /** Puerto del sandbox (:3500). */
  sandboxPort: number;
  /** ¿Está vivo el sandbox? Lo sabe el monolito; aquí solo se pregunta. */
  sandboxVivo: () => boolean;
  /** PID del sandbox, si lo hay. */
  sandboxPid: () => number | null;
}

/** Las rutas que registra este módulo. */
export const RUTAS_TELEMETRIA = [
  "GET /api/telemetry/ports",
  "POST /api/telemetry/refresh",
  "GET /api/system/stats",
] as const;

export function registrarTelemetria(app: express.Express, deps: DepsTelemetria): void {
  const { ollamaUrl: OLLAMA_DEFAULT, workerPort: WORKER_PORT, sandboxPort: SANDBOX_PORT } = deps;

  app.get("/api/telemetry/ports", async (_req: Request, res: Response) => {
    // Servir desde la caché si es reciente (evita machacar Ollama cada 10 s).
    const enCache = muestraVigente();
    if (enCache) return res.json(enCache);

    let ollamaAlive = false;
    let workerAlive = false;
    let modelCount = 0;

    // 1. Ollama :11434 (timeout generoso — puede estar generando)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TELEMETRY_PROBE_MS);
      const ollamaRes = await fetch(`${OLLAMA_DEFAULT}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (ollamaRes.ok) {
        ollamaAlive = true;
        const data = (await ollamaRes.json()) as { models?: unknown[] };
        if (data && Array.isArray(data.models)) {
          modelCount = data.models.length;
        }
      }
    } catch {}

    // 2. Puente PC :5000 (timeout generoso — puede estar ejecutando un comando)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TELEMETRY_PROBE_MS);
      const workerRes = await fetch(`http://127.0.0.1:${WORKER_PORT}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (workerRes.ok) {
        workerAlive = true;
      }
    } catch {}

    const data = {
      port3000: true, // Self
      port5000: workerAlive,
      port11434: ollamaAlive,
      lastChecked: Date.now(),
      ollamaModelCount: modelCount,
    };
    guardarMuestra(data);
    res.json(data);
  });

  // 🔧 ENDPOINT: Forzar re-chequeo de telemetría (invalida la caché).
  app.post("/api/telemetry/refresh", (_req: Request, res: Response) => {
    invalidarMuestra();
    return res.json({ ok: true });
  });

  /**
   * 🔧 MONITOR DE RECURSOS: devuelve uso de CPU y RAM del proceso Node.js
   * (la IDE en :3000) + estimación del sandbox (:3500) leyendo si está vivo.
   * El frontend lo consulta cada 5 s para mostrar un indicador en vivo.
   */
  app.get("/api/system/stats", (_req: Request, res: Response) => {
    try {
      const mem = process.memoryUsage();
      const now = Date.now();
      // El % de CPU del proceso vive ahora en `server/estado/proceso.ts`, con su
      // memoria de la última muestra dentro del módulo en vez de en una variable
      // suelta del monolito.
      const cpuPercent = porcentajeCpu(now);

      // Uptime
      const uptimeSec = Math.floor(process.uptime());

      // Estimar uso del sandbox preguntando si está vivo (ya no se alcanza la variable).
      const sandboxAlive = deps.sandboxVivo();

      return res.json({
        ok: true,
        ide: {
          rssMb: Math.round(mem.rss / 1024 / 1024),
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
          externalMb: Math.round(mem.external / 1024 / 1024),
          cpuPercent,
          uptimeSec,
          pid: process.pid,
        },
        sandbox: {
          running: sandboxAlive,
          pid: deps.sandboxPid(),
          port: SANDBOX_PORT,
        },
        // v1.6.22 — CPU REAL de la máquina (os.cpus()), no la del proceso Node.
        // El indicador de la barra decía «CPU» pero medía el proceso de la IDE;
        // ahora la máquina se mide aparte y el frontend puede distinguir ambos.
        machine: {
          cpuPercent: cpuPercentReal(), // null en la primera muestra (falta base)
          totalRamMb: Math.round(os.totalmem() / 1024 / 1024),
          freeRamMb: Math.round(os.freemem() / 1024 / 1024),
          cores: os.cpus()?.length || 0,
        },
        timestamp: now,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
}
