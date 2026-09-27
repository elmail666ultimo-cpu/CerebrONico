/**
 * selfImprovement.ts — AUTOSUPERACIÓN MEDIBLE (v2.0)
 * =================================================
 * La autosuperación solo es real si el sistema recuerda QUÉ le salió mal y lo
 * usa la próxima vez. Este módulo cierra ese bucle en tres piezas:
 *
 *   1. LECCIONES. Cada fallo relevante se convierte en una lección corta y
 *      accionable. Las lecciones se puntúan por uso y por resultado: las que
 *      ayudaron se refuerzan, las que nunca aplican se enfrían y se archivan.
 *      Las 3-5 más relevantes para el mensaje actual se inyectan en el prompt
 *      (parámetro `extra` de buildContextCachePayload / buildSuperPrompt), no
 *      las 300. Eso es lo que hace que "mejorar" no cueste velocidad.
 *
 *   2. MÉTRICAS DE TURNO. Latencia total, tiempo hasta el primer token, tokens
 *      por segundo, tasa de éxito y motivo de los fallos, por modelo. Con esto
 *      el panel de Autosuperación puede mostrar una TENDENCIA (¿va mejor que la
 *      última sesión?) en vez de números sueltos.
 *
 *   3. REFLEXIÓN AUTOMÁTICA. Al terminar un turno se evalúa de forma
 *      DETERMINISTA (sin gastar tokens de modelo): ¿hubo error? ¿tardó el doble
 *      que la mediana del modelo? ¿el usuario reformuló la misma petición
 *      (señal clásica de que la respuesta no sirvió)? De ahí sale la lección.
 *
 * ⚠️ Honestidad técnica: esto NO reentrena el modelo (nadie reentrena un LLM
 * desde el navegador). Lo que mejora es el SISTEMA alrededor del modelo:
 * contexto, elección de modelo, parámetros y recuperación de errores. Por eso
 * se mide por separado "calidad del sistema" y "rendimiento del modelo".
 */

export type LessonKind =
  | "error-recuperado"
  | "correccion-usuario"
  | "lentitud"
  | "modelo-inadecuado"
  | "exito-metodo"
  | "entorno";

export interface Lesson {
  id: string;
  kind: LessonKind;
  /** Frase corta y accionable, en imperativo */
  text: string;
  /** Palabras clave para recuperarla en contextos parecidos */
  tags: string[];
  /** Cuántas veces se inyectó en el prompt */
  used: number;
  /** Cuántas veces el turno posterior salió bien */
  helped: number;
  createdAt: number;
  lastUsedAt?: number;
  /** 0..1, decae si no se usa */
  weight: number;
}

export interface TurnMetric {
  at: number;
  provider: string;
  model: string;
  /** ms hasta el primer token */
  firstTokenMs?: number;
  /** ms totales */
  totalMs: number;
  /** tokens de salida: MEDIDOS por el motor si `medidaExacta`, estimados (len/4) si no */
  tokensOut?: number;
  /** v1.6.32 · D8: tokens del prompt contados por el motor (prompt_eval_count) */
  tokensIn?: number;
  /** v1.6.32 · D8: tokens/s MEDIDOS por el motor (eval_count/eval_duration) */
  tokPorSegundo?: number;
  /** v1.6.32 · D8: true = números del motor; false = estimación */
  medidaExacta?: boolean;
  ok: boolean;
  /** "quota" | "auth" | "timeout" | "retryable" | "abort" | … */
  failureKind?: string;
  /** El modelo era etiquetado como micro/pequeño */
  tier?: string;
  /** Cuántos reintentos hizo falta */
  attempts?: number;
}

export interface ImprovementSummary {
  turns: number;
  successRate: number;
  avgFirstTokenMs: number | null;
  avgTotalMs: number | null;
  tokensPerSecond: number | null;
  /** v1.6.32 · D8: cuántos turnos del periodo tienen tk/s MEDIDOS por el motor */
  turnosMedidos: number;
  /** Comparación con la sesión anterior (porcentaje; negativo = mejor) */
  firstTokenTrendPct: number | null;
  topFailureKinds: Array<{ kind: string; count: number }>;
  lessonsActive: number;
  lessonsHelped: number;
  byModel: Array<{ model: string; turns: number; successRate: number; avgFirstTokenMs: number | null }>;
}

const LS_LESSONS = "cerebronico_lessons_v2";
const LS_METRICS = "cerebronico_metrics_v2";
const LS_SESSION = "cerebronico_metrics_session";

const MAX_LESSONS = 120;
const MAX_METRICS = 400;

// ------------------------------------------------------------
// Persistencia (con reintento: si localStorage falla, no rompemos la UI)
// ------------------------------------------------------------
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cuota llena: se recorta el histórico y se reintenta una vez.
    try {
      localStorage.removeItem(key);
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }
}

// ------------------------------------------------------------
// Lecciones
// ------------------------------------------------------------
export function loadLessons(): Lesson[] {
  const list = readJSON<Lesson[]>(LS_LESSONS, []);
  return Array.isArray(list) ? list.filter((l) => l && typeof l.text === "string") : [];
}

function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

/** Igualdad aproximada para no guardar 40 veces la misma lección. */
function isDuplicate(a: Lesson, text: string): boolean {
  const ta = new Set(a.tags);
  const tb = tokenize(text);
  if (tb.length === 0) return false;
  const overlap = tb.filter((t) => ta.has(t)).length;
  return overlap / tb.length > 0.6;
}

export function learnLesson(kind: LessonKind, text: string, extraTags: string[] = []): Lesson | null {
  const clean = text.trim().slice(0, 240);
  if (clean.length < 12) return null;
  const lessons = loadLessons();
  if (lessons.some((l) => isDuplicate(l, clean))) return null;

  const lesson: Lesson = {
    id: `les-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    text: clean,
    tags: [...new Set([...tokenize(clean).slice(0, 12), ...extraTags.map((t) => t.toLowerCase())])],
    used: 0,
    helped: 0,
    createdAt: Date.now(),
    weight: 0.6,
  };
  lessons.unshift(lesson);
  if (lessons.length > MAX_LESSONS) lessons.length = MAX_LESSONS;
  writeJSON(LS_LESSONS, lessons);
  enviarLeccionAlCerebro(lesson);
  return lesson;
}

/**
 * v1.9.0 — LA LECCIÓN TAMBIÉN VIAJA AL CEREBRO (cierra la deuda D9)
 *
 * QUÉ ES: manda la lección recién aprendida al núcleo del cerebro, para que quede
 * en su memoria (`memoria.md`) y no solo en el navegador.
 * PARA QUÉ SIRVE: para que el aprendizaje sobreviva a limpiar el navegador.
 *
 * EL PROBLEMA QUE CIERRA: `/api/brain/lesson` existía en el servidor desde hacía
 * versiones y **no lo llamaba nadie**. La promesa de D9 («las lecciones que se
 * escriben») estaba escrita y el endpoint estaba hecho, pero las lecciones solo
 * vivían en `localStorage`: al borrar los datos del sitio, el motor olvidaba todo
 * lo aprendido y volvía a tropezar con lo mismo. Un endpoint sin llamador no es
 * una capacidad: es una promesa sin cumplir.
 *
 * POR QUÉ NO SE ESPERA LA RESPUESTA: aprender una lección no puede bloquear ni
 * fallar el turno del usuario. Si el cerebro no está (servidor apagado, puerto
 * ocupado), la lección sigue guardada en local y no se pierde nada: la copia del
 * navegador sigue siendo la fuente de trabajo y el cerebro es el archivo.
 * El fallo no se propaga, y por eso mismo NO se finge: no hay `await`, no hay
 * promesa de éxito, no hay nada que pueda parecer una confirmación.
 */
function enviarLeccionAlCerebro(lesson: Lesson): void {
  try {
    void fetch("/api/brain/lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: `[${lesson.kind}] ${lesson.text}` }),
    }).catch(() => {
      // Sin cerebro disponible: la lección ya está en local. No es un error del
      // usuario y no se le interrumpe por esto.
    });
  } catch {
    // Entorno sin fetch (pruebas en Node): no aplica.
  }
}

/** Refuerza la última lección inyectada cuando el turno salió bien. */
export function confirmLastLessonsUsed(ok: boolean): void {
  const lessons = loadLessons();
  let changed = false;
  for (const l of lessons) {
    if (l.lastUsedAt && Date.now() - l.lastUsedAt < 10 * 60 * 1000) {
      if (ok) {
        l.helped += 1;
        l.weight = Math.min(1, l.weight + 0.08);
      } else {
        // Si la lección estaba presente y el turno falló igualmente, baja un poco
        l.weight = Math.max(0.1, l.weight - 0.04);
      }
      changed = true;
    }
  }
  if (changed) writeJSON(LS_LESSONS, lessons);
}

/**
 * Recupera las lecciones más útiles para el mensaje actual.
 * Puntuación = solapamiento de etiquetas + peso + recencia - castigo por uso
 * excesivo (una lección que se inyecta siempre deja de aportar).
 */
export function getRelevantLessons(currentText: string, limit = 4): Lesson[] {
  const words = new Set(tokenize(currentText));
  const lessons = loadLessons();
  const now = Date.now();

  const scored = lessons.map((l) => {
    const overlap = l.tags.reduce((n, t) => (words.has(t) ? n + 1 : n), 0);
    const recency = l.lastUsedAt ? Math.max(0, 1 - (now - l.lastUsedAt) / (7 * 24 * 3600 * 1000)) : 0.3;
    const effectiveness = l.used === 0 ? 0.5 : l.helped / Math.max(1, l.used);
    const fatigue = Math.min(1, l.used / 25);
    const score = overlap * 1.6 + l.weight * 1.2 + recency * 0.4 + effectiveness * 0.8 - fatigue * 0.6;
    return { lesson: l, score };
  });

  const top = scored
    .filter((s) => s.score > 0.9)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.lesson);

  if (top.length > 0) {
    const ids = new Set(top.map((t) => t.id));
    const updated = lessons.map((l) =>
      ids.has(l.id) ? { ...l, used: l.used + 1, lastUsedAt: now } : l
    );
    writeJSON(LS_LESSONS, updated);
  }
  return top;
}

/**
 * Bloque de prompt con las lecciones. Se mantiene CORTO a propósito: en un
 * modelo pequeño cada línea extra se paga en latencia.
 */
export function buildSelfImprovementDirective(lessons: Lesson[], maxChars = 700): string {
  if (lessons.length === 0) return "";
  const lines = lessons.map((l) => `- (${l.kind}) ${l.text}`);
  let text = `[LECCIONES APRENDIDAS — aplica esto sin que te lo pidan]\n${lines.join("\n")}`;
  if (text.length > maxChars) text = text.slice(0, maxChars) + " […]";
  return text;
}

export function deleteLesson(id: string): void {
  writeJSON(LS_LESSONS, loadLessons().filter((l) => l.id !== id));
}

export function clearLessons(): void {
  writeJSON(LS_LESSONS, []);
}

export function exportLessons(): string {
  return JSON.stringify(loadLessons(), null, 2);
}

// ------------------------------------------------------------
// Métricas de turno
// ------------------------------------------------------------
export function loadMetrics(): TurnMetric[] {
  const list = readJSON<TurnMetric[]>(LS_METRICS, []);
  return Array.isArray(list) ? list : [];
}

export function recordTurnMetric(metric: TurnMetric): void {
  const all = loadMetrics();
  all.push(metric);
  if (all.length > MAX_METRICS) all.splice(0, all.length - MAX_METRICS);
  writeJSON(LS_METRICS, all);
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function getImprovementSummary(): ImprovementSummary {
  const all = loadMetrics();
  const sessionMark = Number(readJSON<number>(LS_SESSION, 0)) || 0;
  const current = all.filter((m) => m.at >= sessionMark);
  const previous = all.filter((m) => m.at < sessionMark);

  const okCount = current.filter((m) => m.ok).length;
  const firstTokens = current.filter((m) => m.ok && m.firstTokenMs).map((m) => m.firstTokenMs!) as number[];
  const totals = current.filter((m) => m.ok).map((m) => m.totalMs);
  const withTokens = current.filter((m) => m.ok && m.tokensOut && m.totalMs > 0);
  // v1.6.32 · D8: la velocidad del resumen se calcula con los tk/s MEDIDOS por
  // el motor cuando existen. La división tokensOut/totalMs (que mezclaba carga
  // del modelo y red dentro del «tk/s») queda como respaldo para turnos sin
  // medida — estimación con etiqueta, no verdad sin fuente.
  const medidos = current.filter((m) => m.ok && typeof m.tokPorSegundo === "number" && m.tokPorSegundo! > 0);
  const turnosMedidos = medidos.length;
  const tps =
    medidos.length > 0
      ? Math.round((medidos.reduce((n, m) => n + m.tokPorSegundo!, 0) / medidos.length) * 10) / 10
      : withTokens.length > 0
      ? Math.round(
          withTokens.reduce((n, m) => n + (m.tokensOut! / (m.totalMs / 1000)), 0) / withTokens.length
        )
      : null;

  const prevFirst = previous.filter((m) => m.ok && m.firstTokenMs).map((m) => m.firstTokenMs!) as number[];
  const curFirst = avg(firstTokens);
  const prevFirstAvg = avg(prevFirst);

  const failures = new Map<string, number>();
  for (const m of current) {
    if (!m.ok) {
      const k = m.failureKind || "desconocido";
      failures.set(k, (failures.get(k) || 0) + 1);
    }
  }

  const models = new Map<string, TurnMetric[]>();
  for (const m of current) {
    const list = models.get(m.model) || [];
    list.push(m);
    models.set(m.model, list);
  }

  const lessons = loadLessons();

  return {
    turns: current.length,
    successRate: current.length === 0 ? 0 : Math.round((okCount / current.length) * 100),
    avgFirstTokenMs: curFirst,
    avgTotalMs: avg(totals),
    tokensPerSecond: tps,
    turnosMedidos,
    firstTokenTrendPct:
      curFirst !== null && prevFirstAvg !== null && prevFirstAvg > 0
        ? Math.round(((curFirst - prevFirstAvg) / prevFirstAvg) * 100)
        : null,
    topFailureKinds: [...failures.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    lessonsActive: lessons.length,
    lessonsHelped: lessons.reduce((n, l) => n + l.helped, 0),
    byModel: [...models.entries()]
      .map(([model, list]) => ({
        model,
        turns: list.length,
        successRate: Math.round((list.filter((m) => m.ok).length / list.length) * 100),
        avgFirstTokenMs: avg(list.filter((m) => m.ok && m.firstTokenMs).map((m) => m.firstTokenMs!) as number[]),
      }))
      .sort((a, b) => b.turns - a.turns)
      .slice(0, 6),
  };
}

/** Marca el inicio de una sesión para poder comparar "antes vs después". */
export function startNewMetricsSession(): void {
  writeJSON(LS_SESSION, Date.now());
}

export function clearMetrics(): void {
  writeJSON(LS_METRICS, []);
  writeJSON(LS_SESSION, Date.now());
}

// ------------------------------------------------------------
// Reflexión automática (determinista, sin gastar tokens)
// ------------------------------------------------------------
export interface ReflectionInput {
  model: string;
  tier?: string;
  ok: boolean;
  failureKind?: string;
  firstTokenMs?: number;
  totalMs: number;
  /** Mediana histórica de primer token para ese modelo (si se conoce) */
  baselineFirstTokenMs?: number | null;
  /** El usuario reformuló/corrigió en el turno siguiente */
  userCorrected?: boolean;
  /** ¿Se usó un modelo micro/tiny en una tarea que pedía herramientas? */
  askedForTools?: boolean;
}

/** Devuelve la lección aprendida (si hay) y la registra. */
export function reflectOnTurn(input: ReflectionInput): Lesson | null {
  const { model, ok, failureKind, firstTokenMs, baselineFirstTokenMs, userCorrected, askedForTools, tier } = input;

  if (userCorrected) {
    return learnLesson(
      "correccion-usuario",
      `Si el usuario reformula la misma petición, la respuesta anterior no sirvió: en la repetición cambia de enfoque (pregunta lo que falta o entrega algo más concreto) en vez de reescribir lo mismo.`,
      ["correccion", "reformular", model]
    );
  }

  if (!ok) {
    if (failureKind === "quota") {
      return learnLesson(
        "entorno",
        `Cuota agotada en ${model}: baja al modelo local o a otro proveedor gratuito en vez de reintentar la misma nube.`,
        ["cuota", "quota", "fallback", "gratis", model]
      );
    }
    if (failureKind === "auth") {
      return learnLesson(
        "entorno",
        `Clave inválida o sin permisos en ${model}: no reintentes, pide revisar la API key (el reintento gasta tiempo y no arregla nada).`,
        ["clave", "api", "auth", "401", model]
      );
    }
    if (failureKind === "timeout") {
      return learnLesson(
        "lentitud",
        `Tiempo de espera agotado con ${model}: reduce el contexto (menos historial y menos archivos abiertos) o usa un modelo más pequeño antes de reintentar.`,
        ["timeout", "lento", "contexto", model]
      );
    }
    return learnLesson(
      "error-recuperado",
      `Error inesperado con ${model}: reintenta una vez con menos contexto y, si vuelve a fallar, cambia de proveedor.`,
      ["error", model]
    );
  }

  if (askedForTools && (tier === "micro" || tier === "tiny")) {
    return learnLesson(
      "modelo-inadecuado",
      `Una tarea de herramientas con un modelo ${tier} (${model}) no sale: para escribir archivos usa un modelo ≥4B o la nube.`,
      ["herramientas", "tools", "micro", "modelo", model]
    );
  }

  if (firstTokenMs && baselineFirstTokenMs && firstTokenMs > baselineFirstTokenMs * 2 && firstTokenMs > 4000) {
    return learnLesson(
      "lentitud",
      `El primer token de ${model} tardó el doble de lo normal: el prompt iba cargado. Antes de repetir, recorta historial o cierra archivos abiertos.`,
      ["lento", "primer", "token", "prompt", model]
    );
  }

  // Éxito notable: se guarda el método que funcionó para reutilizarlo
  if (firstTokenMs && baselineFirstTokenMs && firstTokenMs < baselineFirstTokenMs * 0.7 && baselineFirstTokenMs > 1500) {
    return learnLesson(
      "exito-metodo",
      `Con ${model} y contexto reducido la respuesta llegó rápido: mantén el contexto corto en este tipo de tarea.`,
      ["rapido", "contexto", "exito", model]
    );
  }

  return null;
}
