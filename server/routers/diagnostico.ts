/**
 * diagnostico.ts — ROUTER DE DIAGNÓSTICO (Fase 2 · primera extracción, v1.11.0)
 * ============================================================================
 * QUÉ ES: el primer módulo de rutas extraído del monolito `server.ts`. Agrupa las
 * tres rutas de solo lectura que responden «¿cómo está esto?»: la salud profunda
 * del sistema, el perfil de rendimiento de un modelo y el catálogo de modelos
 * instalados en Ollama.
 * PARA QUÉ SIRVE: para demostrar que la extracción funciona y para empezar a
 * reducir las 11.661 líneas del monolito sin cambiar ni una ruta ni un
 * comportamiento. La superficie la vigila `contrato-rutas.json`: si algo de aquí
 * se pierde o pierde su guard, la puerta se pone roja.
 *
 * POR QUÉ ESTAS TRES Y NO OTRAS
 * Es la primera tanda y se elige por riesgo, no por tamaño:
 *   · son GET (no escriben nada),
 *   · no tocan estado mutable del servidor (no usan `telemetryCache`, ni
 *     `sandboxProc`, ni contadores de CPU),
 *   · sus dependencias son funciones puras o valores de arranque.
 * Las que sí dependen de estado compartido (`/api/telemetry/*`, `/api/system/stats`)
 * NO se traen aquí a propósito: su sitio es la extracción del estado
 * (`server/estado/`), y mezclarlas ahora sería mover el problema, no el código.
 *
 * LA REGLA DE LA FASE: SE MUEVE, NO SE MEJORA
 * Los cuerpos de los tres manejadores están copiados tal cual estaban. Lo único
 * que cambia es de dónde salen tres valores (Ollama, RAM, núcleos), que se pasan
 * como dependencias en vez de leerse aquí: si se recalcularan en este fichero
 * habría dos fuentes de verdad para lo mismo, y la primera vez que una cambiara
 * tendríamos un diagnóstico que miente sobre el servidor al que diagnostica.
 */
import os from "node:os";
import type express from "express";
import type { Request, Response } from "express";
import { getModelProfile, buildOllamaOptions } from "../../src/engine/modelTiers";
import { describeResilience } from "../../src/engine/resilience";

export interface DepsDiagnostico {
  /** URL base de Ollama (la misma que usa el resto del servidor). */
  ollamaUrl: string;
  /** RAM de la máquina en GB, como la calculó el arranque. */
  ramGb: number;
  /** Núcleos de CPU, como los contó el arranque. */
  cpuCores: number;
  /**
   * ¿Hay un sandbox arrancado en esta sesión? Lo sabe el estado del sandbox; aquí
   * solo se pregunta. Sin esto no se puede distinguir «aún no arrancado» (normal al
   * empezar) de «arrancado y no contesta» (un problema de verdad).
   */
  sandboxVivo: () => boolean;
  /** Puerto del sandbox (:3500). Se pasa para no repetir el número en dos sitios. */
  sandboxPort: number;
}

/** Las rutas que registra este módulo: la lista sirve para comprobarlo, no para documentar. */
export const RUTAS_DIAGNOSTICO = [
  "GET /api/health/deep",
  "GET /api/ollama/perf",
  "GET /api/ollama/models",
] as const;

export function registrarDiagnostico(app: express.Express, deps: DepsDiagnostico): void {
  const { ollamaUrl: OLLAMA_DEFAULT, ramGb: RAM_GB, cpuCores: CPU_CORES } = deps;

  app.get("/api/health/deep", async (_req: Request, res: Response) => {
    const checks: Array<{ name: string; ok: boolean; detail: string; fix?: string }> = [];

    // 1. Ollama
    try {
      const r = await fetch(`${(process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/, "")}/api/tags`, {
        signal: AbortSignal.timeout(4000),
      });
      const data: any = await r.json().catch(() => ({}));
      const models: string[] = (data?.models || []).map((m: any) => m?.name).filter(Boolean);
      checks.push({
        name: "Ollama :11434",
        ok: r.ok,
        detail: r.ok ? `${models.length} modelo(s) instalado(s)` : `HTTP ${r.status}`,
        fix: r.ok ? undefined : "Arranca Ollama (ollama serve) o revisa el puerto 11434.",
      });
    } catch (err: any) {
      checks.push({
        name: "Ollama :11434",
        ok: false,
        detail: err?.message || "sin respuesta",
        fix: "Arranca Ollama. Sin él, los modelos locales no pueden responder.",
      });
    }

    // 2. Sandbox :3500
    // v1.13.0 — «fetch failed» AL ARRANCAR NO ES UN PROBLEMA.
    // Esta comprobación se ejecuta al empezar, y el proceso del sandbox se levanta
    // la primera vez que hace falta (al abrir el preview). Así que en el arranque
    // salía SIEMPRE un rojo «fetch failed» con un consejo alarmante («pulsa Sync o
    // reinicia el sandbox») para un servicio que todavía no tenía por qué existir.
    // Un aviso que aparece siempre es un aviso que se aprende a ignorar; y el día
    // que el sandbox falle de verdad, nadie lo mirará.
    // Tres desenlaces, según lo que SÍ se sabe:
    //   · responde                              → correcto
    //   · no responde y no hay proceso          → «aún no arrancado» (informativo)
    //   · no responde y SÍ hay proceso vivo     → problema real, con su remedio
    const sandboxUrl = process.env.SANDBOX_URL || `http://127.0.0.1:${deps.sandboxPort}`;
    try {
      const r = await fetch(sandboxUrl, { signal: AbortSignal.timeout(3000) });
      checks.push({
        name: "Sandbox :3500",
        ok: r.ok,
        detail: r.ok ? `HTTP ${r.status}` : `responde con HTTP ${r.status}`,
        fix: r.ok ? undefined : "El sandbox contesta con error. Reinícialo con Sync.",
      });
    } catch (err: any) {
      if (deps.sandboxVivo()) {
        checks.push({
          name: "Sandbox :3500",
          ok: false,
          detail: err?.message || "sin respuesta",
          fix: "Está arrancado pero no contesta: pulsa Sync para reiniciarlo.",
        });
      } else {
        checks.push({
          name: "Sandbox :3500",
          ok: true,
          detail: "aún no arrancado (se levanta al abrir el preview)",
        });
      }
    }

    // 3. Puente PC :5000
    try {
      const r = await fetch("http://127.0.0.1:5000/health", { signal: AbortSignal.timeout(3000) });
      checks.push({ name: "Puente PC :5000", ok: r.ok, detail: `HTTP ${r.status}`, fix: r.ok ? undefined : "Ejecuta el puente Python para el Modo Agente PC." });
    } catch (err: any) {
      checks.push({
        name: "Puente PC :5000",
        ok: false,
        detail: err?.message || "sin respuesta",
        fix: "Sin el puente, el Modo Agente PC (archivos reales) no funciona.",
      });
    }

    // 4. Memoria del sistema
    const totalGb = RAM_GB;
    const freeGb = Math.round((os.freemem() / 1024 ** 3) * 10) / 10;
    const rssMb = Math.round(process.memoryUsage().rss / 1024 ** 2);
    const lowMem = freeGb < 1.2;
    checks.push({
      name: "Memoria",
      ok: !lowMem,
      detail: `${freeGb} GB libres de ${totalGb} GB · IDE usando ${rssMb} MB`,
      fix: lowMem
        ? "Queda menos de 1,2 GB libre: cierra el navegador o usa un modelo micro; si no, Ollama hará swap y parecerá colgado."
        : undefined,
    });

    // 5. Resiliencia: estado de los cortacircuitos por proveedor
    checks.push({ name: "Cortacircuitos", ok: true, detail: describeResilience() });

    const failing = checks.filter((c) => !c.ok);
    return res.json({
      ok: failing.length === 0,
      summary: failing.length === 0 ? "Todo operativo." : `${failing.length} problema(s): ${failing.map((f) => f.name).join(", ")}`,
      checks,
      // Recomendaciones ordenadas por impacto real sobre la velocidad
      recommendations: [
        ...failing.filter((f) => f.fix).map((f) => `${f.name}: ${f.fix}`),
        "Si un modelo local no contesta, pulsa «Precalentar» antes de escribir: evita la carga desde disco en el primer mensaje.",
        "Para 8 GB: usa modelos de 0,4-1,5 GB con contexto 2048-4096 y cierra el navegador mientras generas.",
      ],
    });
  });

  /** Devuelve el perfil de rendimiento calculado para un modelo. */
  app.get("/api/ollama/perf", (req: Request, res: Response) => {
    const model = String(req.query.model || "");
    if (!model) return res.status(400).json({ ok: false, error: "Falta ?model=" });
    const profile = getModelProfile(model, RAM_GB);
    return res.json({
      ok: true,
      model,
      ramGb: RAM_GB,
      cpuCores: CPU_CORES,
      tier: profile.tier,
      paramsB: profile.paramsB,
      toolCapable: profile.toolCapable,
      suggestedOptions: buildOllamaOptions(model, undefined, CPU_CORES, RAM_GB),
      contextCharBudget: profile.contextCharBudget,
      keepAlive: profile.keepAlive,
      notes: profile.notes,
    });
  });

  /**
   * Ollama models catalog proxy
   */
  app.get("/api/ollama/models", async (req: Request, res: Response) => {
    const customUrl = (req.query.url as string) || OLLAMA_DEFAULT;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const response = await fetch(`${customUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        // 🔧 FILTRAR modelos que NO soportan chat (embeddings, similarity, etc.)
        // Estos modelos causan error HTTP 400 "no soporta chat" cuando se intenta usar.
        // Patrones conocidos de modelos no-chat: embedding, all-minilm, e5, nomic-embed,
        // bge, snowflake-arctic-embed, etc.
        if (data && Array.isArray(data.models)) {
          const NON_CHAT_PATTERNS = [
            /embed/i,
            /all-minilm/i,
            /\be5\b/i,
            /nomic.*embed/i,
            /bge/i,
            /snowflake.*arctic.*embed/i,
            /sentence/i,
            /similarity/i,
            /minilm/i,
            /qwen3.*embedding/i,
          ];
          data.models = data.models.filter((m: any) => {
            const name: string = (m?.name || m?.model || "").toLowerCase();
            if (!name) return true;
            const isNonChat = NON_CHAT_PATTERNS.some(p => p.test(name));
            return !isNonChat;
          });
        }
        return res.json(data);
      }
      return res.status(response.status).json({ models: [] });
    } catch (err: any) {
      return res.json({ models: [], error: err.message });
    }
  });
}
