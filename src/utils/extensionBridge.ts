/**
 * extensionBridge.ts — Canal de invocación modelo → extensión (v2.0)
 * =================================================================
 * PROBLEMA: el modelo corre en el servidor (server.ts → Ollama), pero el código
 * de la extensión corre en el navegador dentro de un <iframe>. No hay forma de
 * que el servidor llame directamente al iframe.
 *
 * SOLUCIÓN (sin websockets, sin dependencias): cola HTTP con sondeo.
 *   1. El servidor registra una invocación pendiente y la deja en cola.
 *   2. La IDE sondea GET /api/extensions/invocations mientras hay una extensión
 *      abierta; al recibir una, se la pasa por postMessage al iframe que la
 *      declara.
 *   3. La extensión responde y el resultado vuelve por
 *      POST /api/extensions/invocations/:id/result.
 *   4. El handler del servidor (executeToolCall) estaba esperando esa promesa y
 *      devuelve el resultado al modelo como si fuera una herramienta nativa.
 *
 * Si la extensión no está abierta en ninguna pestaña, el servidor NO ofrece sus
 * herramientas al modelo (ver server.ts): así nunca se queda esperando en vano.
 */

export interface PanelHost {
  extensionId: string;
  /** Ejecuta un comando dentro del iframe de la extensión y espera su resultado */
  invokeCommand: (commandId: string, args?: any) => Promise<{ ok: boolean; result?: any; error?: string }>;
}

const hosts = new Map<string, PanelHost>();

export function registerPanelHost(host: PanelHost): void {
  hosts.set(host.extensionId, host);
}

export function unregisterPanelHost(extensionId: string): void {
  hosts.delete(extensionId);
}

export function isPanelOpen(extensionId: string): boolean {
  return hosts.has(extensionId);
}

export function openPanelIds(): string[] {
  return [...hosts.keys()];
}

let polling: number | null = null;

/**
 * Arranca el sondeo de invocaciones. Es idempotente: llamarlo varias veces no
 * crea varios intervalos.
 */
export function startInvocationPolling(onEvent?: (message: string) => void): () => void {
  if (polling !== null) return stopInvocationPolling;

  const tick = async () => {
    if (hosts.size === 0) return; // sin paneles abiertos no hay a quién invocar
    let payload: any = null;
    try {
      const res = await fetch(`/api/extensions/invocations?open=${encodeURIComponent(openPanelIds().join(","))}`);
      if (res.status !== 200) return;
      payload = await res.json();
    } catch {
      return; // el servidor no está: se reintenta en el siguiente tick
    }
    if (!payload?.id) return;

    const host = hosts.get(payload.extId);
    const report = (body: any) =>
      fetch(`/api/extensions/invocations/${encodeURIComponent(payload.id)}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});

    if (!host) {
      await report({ ok: false, error: "La extensión ya no está abierta en la IDE." });
      return;
    }
    onEvent?.(`🧩 ${payload.extId} → ${payload.command}`);
    try {
      const out = await host.invokeCommand(payload.command, payload.args);
      await report(out);
      onEvent?.(out.ok ? `🧩 ${payload.extId} respondió` : `🧩 ${payload.extId} falló: ${out.error}`);
    } catch (err: any) {
      await report({ ok: false, error: err?.message || String(err) });
    }
  };

  polling = window.setInterval(tick, 700);
  return stopInvocationPolling;
}

export function stopInvocationPolling(): void {
  if (polling !== null) {
    window.clearInterval(polling);
    polling = null;
  }
}

/** Atajo para el buscador de comandos: /comando escrito en el chat. */
export function parseSlashCommand(text: string): { slash: string; rest: string } | null {
  const m = (text || "").trim().match(/^\/([a-zA-Z0-9_.-]+)\s*([\s\S]*)$/);
  if (!m) return null;
  return { slash: m[1], rest: m[2].trim() };
}
