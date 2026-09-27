/**
 * resilience.ts — RESILIENCIA PROFUNDA (v2.0)
 * ==========================================
 * "Resiliencia profunda" aquí significa cuatro cosas concretas, no un eslogan:
 *
 *   1. REINTENTO INTELIGENTE: reintenta lo que puede funcionar (red, 429, 5xx,
 *      timeout) y NO reintenta lo que no (401/403, petición mal formada). Antes
 *      la IDE reintentaba igual todo y gastaba 3 intentos en un error de clave.
 *   2. BACKOFF EXPONENCIAL CON JITTER: espera creciente y aleatoria, para no
 *      martillear un servidor que ya está sufriendo (ni el propio Ollama local).
 *   3. CORTACIRCUITOS POR PROVEEDOR: si un proveedor falla N veces seguidas, se
 *      deja de intentar durante un tiempo. Así al caer la nube no se pierden 30 s
 *      en cada mensaje: se salta directo al siguiente (o al modelo local).
 *   4. CADENA DE RESPALDO (FALLBACK): una lista ordenada de intentos. Si la nube
 *      gratis te limita la cuota, la petición baja al modelo local sin que el
 *      usuario toque nada. Esto es lo que hace que la IDE "vuele en cloud y no se
 *      muera en local": nunca se queda sin plan B.
 *
 * Módulo sin dependencias y sin acceso a DOM: se usa igual en el servidor y en
 * el cliente.
 */

export type ErrorClass = "retryable" | "fatal" | "auth" | "quota" | "timeout" | "offline";

export interface ClassifiedError {
  kind: ErrorClass;
  message: string;
  status?: number;
  retryAfterMs?: number;
}

/** Mensajes de error típicos de Ollama/red que SÍ merecen un reintento. */
const RETRYABLE_PATTERNS = [
  /socket hang up/i,
  /econnreset/i,
  /econnrefused/i,
  /etimedout/i,
  /eai_again/i,
  /fetch failed/i,
  /network error/i,
  /upstream/i,
  /temporarily unavailable/i,
  /model is currently loading/i,
  /send request fail/i,
  /bad gateway/i,
];

const FATAL_PATTERNS = [
  /invalid api key/i,
  /unauthorized/i,
  /forbidden/i,
  /model .* not found/i,
  /does not support/i,
  /context length exceeded/i,
  /malformed/i,
];

/** Clasifica un error para decidir si se reintenta y cuánto esperar. */
export function classifyError(err: any): ClassifiedError {
  const status: number | undefined =
    err?.status ?? err?.statusCode ?? err?.response?.status ?? undefined;
  const raw = String(err?.message || err?.error || err || "");
  const message = raw;

  // Marca EXPLÍCITA de "no reintentar", por delante de todas las heurísticas.
  //
  // Hace falta porque la regla de abajo («desconocido → reintentable una vez») es
  // correcta para fallos de red, pero equivocada para errores de configuración:
  // un tipo de tarea que no existe, una ruta que falta… reintentarlos no cambia
  // nada, solo gasta tiempo y ensucia el log. Quien lanza el error es el único
  // que sabe si reintentarlo sirve de algo, así que se le deja decirlo.
  if (err?.fatal === true || err?.noReintentar === true) {
    return { kind: "fatal", message, status };
  }

  let retryAfterMs: number | undefined;
  const retryAfter = err?.retryAfter ?? err?.headers?.["retry-after"];
  if (retryAfter) {
    const n = Number(retryAfter);
    if (Number.isFinite(n)) retryAfterMs = n > 1000 ? n : n * 1000;
    else {
      const d = Date.parse(String(retryAfter));
      if (!Number.isNaN(d)) retryAfterMs = Math.max(0, d - Date.now());
    }
  }
  if (retryAfterMs === undefined) {
    const m = raw.match(/try again in ([\d.]+)\s*s/i);
    if (m) retryAfterMs = Math.ceil(parseFloat(m[1]) * 1000);
  }

  if (status === 401 || status === 403 || /invalid api key|unauthorized|forbidden/i.test(raw)) {
    return { kind: "auth", message, status };
  }
  if (status === 429 || /rate limit|quota|too many requests/i.test(raw)) {
    return { kind: "quota", message, status, retryAfterMs };
  }
  if (status === 408 || status === 504 || /timeout|timed out/i.test(raw)) {
    return { kind: "timeout", message, status, retryAfterMs };
  }
  if (/offline|dns|enotfound|no such host/i.test(raw)) {
    return { kind: "offline", message, status };
  }
  if (FATAL_PATTERNS.some((re) => re.test(raw))) {
    return { kind: "fatal", message, status };
  }
  if (
    (status !== undefined && status >= 500) ||
    RETRYABLE_PATTERNS.some((re) => re.test(raw))
  ) {
    return { kind: "retryable", message, status, retryAfterMs };
  }
  // Desconocido: se trata como reintentable UNA vez. Antes se daba por muerto.
  return { kind: "retryable", message, status };
}

export interface RetryOptions {
  /** Número de intentos totales (incluye el primero) */
  attempts?: number;
  /** Espera base en ms (se duplica en cada intento) */
  baseDelayMs?: number;
  /** Techo de espera entre intentos */
  maxDelayMs?: number;
  /** Presupuesto total: si se supera, no se hace otro intento */
  budgetMs?: number;
  onRetry?: (info: { attempt: number; delayMs: number; error: ClassifiedError }) => void;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Jitter completo (evita que 5 clientes reintenten en el mismo milisegundo). */
function jitter(ms: number): number {
  return Math.round(ms * (0.5 + Math.random() * 0.5));
}

/**
 * Ejecuta `fn` con reintentos inteligentes. Devuelve el resultado del primer
 * intento válido; si todos fallan, lanza el último error enriquecido con el
 * historial de intentos (para poder mostrarlo en el log de la IDE).
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts = 3, baseDelayMs = 600, maxDelayMs = 8000, budgetMs = 90_000, onRetry } = options;
  const started = Date.now();
  let lastError: any = null;
  let lastClass: ClassifiedError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err: any) {
      lastError = err;
      lastClass = classifyError(err);

      // No se reintenta lo que no va a mejorar nunca
      if (lastClass.kind === "auth" || lastClass.kind === "fatal") {
        (err as any).cnAttempts = attempt;
        throw err;
      }
      const isLast = attempt === attempts;
      const elapsed = Date.now() - started;
      if (isLast || elapsed >= budgetMs) break;

      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = jitter(lastClass.retryAfterMs ?? exponential);
      if (elapsed + delay > budgetMs) break;

      onRetry?.({ attempt, delayMs: delay, error: lastClass });
      await sleep(delay);
    }
  }

  if (lastError && typeof lastError === "object") {
    (lastError as any).cnAttempts = attempts;
    (lastError as any).cnClass = lastClass;
  }
  throw lastError;
}

// ============================================================
// Cortacircuitos
// ============================================================
interface BreakerState {
  failures: number;
  openedAt: number | null;
  lastError: string | null;
}

const breakers = new Map<string, BreakerState>();

export interface BreakerOptions {
  /** Fallos consecutivos antes de abrir el circuito */
  threshold?: number;
  /** Tiempo que el circuito queda abierto (ms) */
  cooldownMs?: number;
}

export function breakerStatus(key: string): { open: boolean; failures: number; retryInMs: number; lastError: string | null } {
  const st = breakers.get(key);
  if (!st) return { open: false, failures: 0, retryInMs: 0, lastError: null };
  const cfg = { cooldownMs: 60_000 };
  const open = st.openedAt !== null && Date.now() - st.openedAt < cfg.cooldownMs;
  return {
    open,
    failures: st.failures,
    retryInMs: st.openedAt ? Math.max(0, cfg.cooldownMs - (Date.now() - st.openedAt)) : 0,
    lastError: st.lastError,
  };
}

export function recordSuccess(key: string): void {
  breakers.set(key, { failures: 0, openedAt: null, lastError: null });
}

export function recordFailure(key: string, message: string, options: BreakerOptions = {}): void {
  const { threshold = 3, cooldownMs = 60_000 } = options;
  const st = breakers.get(key) || { failures: 0, openedAt: null, lastError: null };
  st.failures += 1;
  st.lastError = message;
  if (st.failures >= threshold) st.openedAt = Date.now();
  breakers.set(key, st);
}

export function isCircuitOpen(key: string, cooldownMs = 60_000): boolean {
  const st = breakers.get(key);
  if (!st || st.openedAt === null) return false;
  if (Date.now() - st.openedAt >= cooldownMs) {
    // Medio abierto: se permite un intento de prueba
    breakers.set(key, { failures: 0, openedAt: null, lastError: st.lastError });
    return false;
  }
  return true;
}

export function resetBreakers(): void {
  breakers.clear();
}

// ============================================================
// Cadena de respaldo
// ============================================================
export interface FallbackAttempt<T> {
  /** Etiqueta legible: "Z.ai GLM-4.7-Flash", "Ollama local qwen2.5:0.5b"… */
  label: string;
  /** Clave del cortacircuitos (normalmente el proveedor) */
  breakerKey?: string;
  run: () => Promise<T>;
}

export interface FallbackEvent {
  label: string;
  ok: boolean;
  reason?: string;
  ms: number;
  skipped?: boolean;
}

/**
 * Ejecuta la cadena de respaldo EN ORDEN. Si un intento falla, pasa al
 * siguiente. Si el cortacircuitos de un proveedor está abierto, lo salta sin
 * gastar tiempo (esto es lo que evita los 30 s de espera muerta cuando la nube
 * está caída).
 */
export async function withFallback<T>(
  attempts: FallbackAttempt<T>[],
  onEvent?: (e: FallbackEvent) => void
): Promise<{ value: T; usedLabel: string; events: FallbackEvent[] }> {
  const events: FallbackEvent[] = [];
  let lastError: any = null;

  for (const attempt of attempts) {
    const started = Date.now();
    if (attempt.breakerKey && isCircuitOpen(attempt.breakerKey)) {
      const ev: FallbackEvent = {
        label: attempt.label,
        ok: false,
        skipped: true,
        reason: "cortacircuitos abierto (fallos recientes)",
        ms: 0,
      };
      events.push(ev);
      onEvent?.(ev);
      continue;
    }
    try {
      const value = await attempt.run();
      const ms = Date.now() - started;
      if (attempt.breakerKey) recordSuccess(attempt.breakerKey);
      const ev: FallbackEvent = { label: attempt.label, ok: true, ms };
      events.push(ev);
      onEvent?.(ev);
      return { value, usedLabel: attempt.label, events };
    } catch (err: any) {
      const cls = classifyError(err);
      const ms = Date.now() - started;
      lastError = err;
      if (attempt.breakerKey && cls.kind !== "auth" && cls.kind !== "fatal") {
        recordFailure(attempt.breakerKey, cls.message);
      }
      const ev: FallbackEvent = { label: attempt.label, ok: false, reason: cls.message.slice(0, 160), ms };
      events.push(ev);
      onEvent?.(ev);
    }
  }
  if (lastError && typeof lastError === "object") (lastError as any).cnFallbackEvents = events;
  throw lastError ?? new Error("Ninguna opción de la cadena de respaldo funcionó.");
}

/** Texto compacto del estado de resiliencia, para el log de la IDE. */
export function describeResilience(): string {
  const states = [...breakers.entries()].map(([k, v]) => `${k}: ${v.failures} fallo(s)${v.openedAt ? " (abierto)" : ""}`);
  return states.length === 0 ? "sin incidentes registrados" : states.join(" · ");
}
