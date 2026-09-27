/**
 * modelTiers.ts — Clasificación de modelos y AJUSTES DE RENDIMIENTO (v2.0)
 * ======================================================================
 * Fuente única de verdad compartida por:
 *   - backend/server.ts      (opciones de Ollama + decisión de bucle de agente)
 *   - src/utils/contextCache.ts (presupuesto de contexto del cliente)
 *
 * POR QUÉ EXISTE ESTE ARCHIVO (el bug que arregla)
 * ------------------------------------------------
 * En la v1.1, `isToolCapableModel()` decidía si un modelo entraba al "bucle de
 * agente" (llamadas a herramientas, NO streaming) mirando SOLO el nombre:
 *
 *     /llama3\.|llama-3|qwen2\.5|qwen3|mistral|…/i
 *
 * y `qwen2.5:0.5b` (≈400 MB), `qwen2.5-coder:1.5b` (≈1 GB) y `llama3.2:1b`
 * coinciden con ese patrón. Resultado real medido en el código de la v1.1:
 *
 *   Servidor:  runOllamaAgentLoop()  → hasta 10 pasos
 *              callOllamaNonStreaming() → stream:false + timeout 120 s por intento
 *              → un modelo de 250 MB-1 GB intentando "tool calling" que no sabe
 *                hacer: no responde nada durante minutos y la interfaz parece
 *                colgada. Y cuando responde, es basura.
 *   Cliente:   engine.ts solo usa la ruta de streaming directo si el modelo NO
 *              es tool-capable → con estos modelos nunca se usaba streaming:
 *              cero tokens visibles hasta que termina TODO el bucle.
 *
 * Además, a todos los modelos locales se les daba `num_ctx: 8192` sin límite de
 * `num_predict`, sin `num_thread`/`num_batch` y con el prompt completo
 * (MEMORIA.md + skills.md + historial entero + archivos abiertos). En un equipo
 * de 8 GB, procesar ese prompt en CPU es lo que "tranca" la respuesta.
 *
 * Este módulo corrige las dos cosas: clasifica por TAMAÑO y devuelve un perfil
 * de rendimiento coherente con la RAM disponible.
 */

export type ModelTier = "micro" | "tiny" | "small" | "medium" | "large" | "cloud";

export interface ModelProfile {
  tier: ModelTier;
  /** Parámetros estimados en miles de millones (1.5 = 1.5B). null = desconocido */
  paramsB: number | null;
  /** true si el modelo corre en la nube (no consume RAM local) */
  remote: boolean;
  /**
   * v8.0.1 — Nombre canónico del que se heredó el perfil, si el modelo pedido
   * era un alias declarado (p. ej. `nemesis:latest` → `gpt-oss:120b-cloud`).
   * `null` cuando el modelo se identificó por su propio nombre.
   */
  aliasDe?: string | null;
  /**
   * ¿Merece la pena ofrecerle herramientas (bucle de agente)?
   * Los modelos diminutos NO: fallan el formato de tool-calls y bloquean la UI.
   */
  toolCapable: boolean;
  /** Ventana de contexto a pedir a Ollama */
  numCtx: number;
  /** Tope de tokens de salida (-1 = sin tope) */
  numPredict: number;
  /** Tamaño de lote de prompt (menos = menos pico de RAM) */
  numBatch: number;
  /** Hilos de CPU recomendados (null = que Ollama decida) */
  numThreadSuggestion: (cores: number) => number | null;
  /** Tiempo que el modelo se queda cargado en RAM entre mensajes */
  keepAlive: string;
  /** Temperatura recomendada para este tamaño */
  temperature: number;
  /** Presupuesto de caracteres para todo el prompt (sistema + historial + archivos) */
  contextCharBudget: number;
  /** Turnos de historial que se conservan */
  historyTurns: number;
  /** Archivos abiertos que se inyectan en el prompt */
  maxOpenFiles: number;
  /** Caracteres máximos por archivo inyectado */
  maxFileChars: number;
  /** Explicación legible para el usuario (se muestra en el log de la IDE) */
  notes: string[];
}

/** Patrones que declaran explícitamente un tamaño en el nombre: ":0.5b", ":7b", ":3.2b", ":135m" */
const SIZE_IN_NAME = /[:@_-](\d+(?:\.\d+)?)\s*(b|m)\b/i;

/** Modelos que viven en la nube (no cuentan para la RAM del equipo) */
const REMOTE_HINTS = /(-cloud\b|:cloud\b|cloud\b)/i;

/**
 * Modelos que SÍ saben llamar herramientas de forma fiable.
 * Se mantiene la lista blanca de la v1.1 (es conservadora y evita falsos positivos)
 * pero ahora es condición NECESARIA, no suficiente: además hay que superar el
 * umbral de tamaño de abajo.
 */
const TOOL_CAPABLE_ALLOWLIST =
  /llama3\.|llama-3|qwen2\.5|qwen3|mistral|mixtral|command-r|gemma3|granite|hermes3|nemotron|functionary|phi-4|phi4|nous-hermes|gpt-oss|deepseek|glm-4/i;

/**
 * Por debajo de este tamaño, ofrecer herramientas empeora el resultado:
 * el modelo no respeta el esquema JSON, entra en bucle y no emite texto.
 * 4B es el umbral práctico observado con Ollama.
 */
const TOOL_CAPABLE_MIN_PARAMS_B = 4;

/** Extrae el tamaño declarado en el nombre del modelo, si lo hay. */
export function parseParamsB(modelName: string): number | null {
  if (!modelName) return null;
  const m = modelName.match(SIZE_IN_NAME);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (Number.isNaN(value)) return null;
  return m[2].toLowerCase() === "b" ? value : value / 1000;
}

// ============================================================
// v8.0.1 — MODELOS RENOMBRADOS: el agujero por el que se cuela un 120B
// ------------------------------------------------------------
// DEFECTO REAL, cazado revisando la idea «local para lo rápido, 120B-cloud para
// lo pesado». Toda la clasificación de arriba se apoya en el NOMBRE del modelo:
//   · `REMOTE_HINTS` busca la palabra «cloud»   → decide «no consume RAM local»
//   · `SIZE_IN_NAME` busca «:120b»              → decide el tier y num_ctx
//   · `TOOL_CAPABLE_ALLOWLIST` busca «gpt-oss»  → decide si hay bucle de agente
//
// Y Ollama permite renombrar: `ollama cp gpt-oss:120b-cloud NEMESIS:latest`, o
// un Modelfile propio con otro nombre. Ese modelo sigue siendo el 120B de la
// nube, pero el motor lo lee como «modelo local de tamaño desconocido»:
//
//   tier = "small" · num_ctx 8192 (en vez de 32768) · num_predict 1200 (¡le
//   corta la respuesta al 120B!) · keep_alive 30m · temperatura 0.45 ·
//   toolCapable = FALSE (la lista blanca no reconoce «NEMESIS»)
//
// Es decir: el usuario paga la latencia de un 120B y recibe el trato de un
// modelo diminuto, sin herramientas y con la salida truncada. Y no falla en
// silencio de forma obvia: simplemente «el modelo contesta peor de lo que
// debería», que es el peor de los síntomas porque no parece un bug.
//
// LA CURA: una tabla de alias explícita. El motor no puede adivinar qué hay
// detrás de un nombre propio, pero el usuario SÍ lo sabe, y decirlo cuesta una
// línea. `resolverAliasDeModelo()` traduce antes de clasificar, así que un
// alias hereda TODO el perfil de su canónico (nube, tamaño, herramientas,
// contexto y keep_alive) sin tocar el resto del módulo.
// ============================================================
const ALIAS_DE_MODELO: Record<string, string> = {
  // `nemesis:latest` = «un gpt-oss modificado» renombrado por el usuario.
  // Se declara aquí porque es el caso que originó el defecto; para cualquier
  // otro renombre, una línea basta (o `registrarAliasDeModelo()` en caliente).
  "nemesis:latest": "gpt-oss:120b-cloud",
  nemesis: "gpt-oss:120b-cloud",
};

/** Declara (o corrige) el canónico del que hereda perfil un modelo renombrado. */
export function registrarAliasDeModelo(alias: string, canonico: string): void {
  const a = String(alias || "").trim().toLowerCase();
  const c = String(canonico || "").trim();
  if (!a || !c) return;
  ALIAS_DE_MODELO[a] = c;
}

/**
 * Traduce un nombre a su canónico si está declarado.
 * Devuelve el MISMO nombre cuando no hay alias: la función es transparente para
 * los modelos normales, que son la inmensa mayoría.
 */
export function resolverAliasDeModelo(modelName: string): string {
  const n = String(modelName || "").trim().toLowerCase();
  if (!n) return modelName;
  if (ALIAS_DE_MODELO[n]) return ALIAS_DE_MODELO[n];
  // «nemesis» declarado, llega «nemesis:v2» → hereda por prefijo de familia.
  for (const [alias, canonico] of Object.entries(ALIAS_DE_MODELO)) {
    const base = alias.split(":")[0];
    if (base && (n === base || n.startsWith(base + ":"))) return canonico;
  }
  return modelName;
}

/** ¿Este nombre es un alias declarado? Para poder explicárselo al usuario. */
export function aliasDeModelo(modelName: string): string | null {
  const canonico = resolverAliasDeModelo(modelName);
  return canonico === modelName ? null : canonico;
}

function isRemote(modelName: string): boolean {
  return REMOTE_HINTS.test(resolverAliasDeModelo(modelName));
}

/** Clasifica por tamaño. Los "nano" reales (<1B) y hasta 1.6B son micro. */
export function getTier(paramsB: number | null, remote: boolean): ModelTier {
  if (remote) return "cloud";
  if (paramsB === null) return "small"; // desconocido: tratamos como pequeño por seguridad
  if (paramsB <= 1.6) return "micro";
  if (paramsB <= 3.5) return "tiny";
  if (paramsB <= 8) return "small";
  if (paramsB <= 34) return "medium";
  return "large";
}

/**
 * Perfil completo de rendimiento.
 * @param modelName nombre tal cual lo envía el usuario a Ollama
 * @param ramGb RAM total del equipo (opcional; si es <=8 se aplican recortes extra)
 */
export function getModelProfile(modelName: string, ramGb?: number): ModelProfile {
  // v8.0.1 — Se clasifica por el CANÓNICO, no por el nombre pintado. Todo lo que
  // sigue (nube, tamaño, lista blanca, notas) usa `efectivo`, así que un alias
  // hereda el perfil completo y no hay dos caminos que puedan divergir.
  const efectivo = resolverAliasDeModelo(modelName);
  const alias = efectivo === modelName ? null : efectivo;

  const remote = isRemote(efectivo);
  const paramsB = parseParamsB(efectivo);
  const tier = getTier(paramsB, remote);
  const lowRam = typeof ramGb === "number" && ramGb > 0 && ramGb <= 8;

  // ¿Herramientas? Lista blanca + tamaño mínimo. Los remotos grandes siempre pueden.
  const passesAllowlist = TOOL_CAPABLE_ALLOWLIST.test(efectivo);
  const bigEnough = paramsB === null ? tier !== "micro" && tier !== "tiny" : paramsB >= TOOL_CAPABLE_MIN_PARAMS_B;
  const toolCapable = passesAllowlist && bigEnough;

  const notes: string[] = [];

  let numCtx: number;
  let numPredict: number;
  let numBatch: number;
  let keepAlive: string;
  let temperature: number;
  let contextCharBudget: number;
  let historyTurns: number;
  let maxOpenFiles: number;
  let maxFileChars: number;

  switch (tier) {
    case "micro":
      numCtx = 2048;
      numPredict = 400;
      numBatch = 128;
      keepAlive = "30m";
      temperature = 0.35;
      contextCharBudget = 6000;
      historyTurns = 4;
      maxOpenFiles = 1;
      maxFileChars = 1500;
      notes.push("Modelo micro (<1.6B): sin herramientas, contexto 2048 y salida ≤400 tokens para que no se ahogue.");
      break;
    case "tiny":
      numCtx = 4096;
      numPredict = 700;
      numBatch = 128;
      keepAlive = "30m";
      temperature = 0.4;
      contextCharBudget = 12000;
      historyTurns = 6;
      maxOpenFiles = 2;
      maxFileChars = 2500;
      notes.push("Modelo pequeño (1.6B-3.5B): sin herramientas, contexto 4096.");
      break;
    case "small":
      numCtx = lowRam ? 4096 : 8192;
      numPredict = 1200;
      numBatch = 256;
      keepAlive = "30m";
      temperature = 0.45;
      contextCharBudget = lowRam ? 16000 : 24000;
      historyTurns = 8;
      maxOpenFiles = 3;
      maxFileChars = 4000;
      notes.push("Modelo local ≤8B: contexto moderado para no agotar la RAM.");
      break;
    case "medium":
      numCtx = lowRam ? 8192 : 16384;
      numPredict = 2000;
      numBatch = 512;
      keepAlive = "30m";
      temperature = 0.5;
      contextCharBudget = lowRam ? 40000 : 60000;
      historyTurns = 14;
      maxOpenFiles = 4;
      maxFileChars = 6000;
      notes.push("Modelo medio (8B-34B): contexto amplio; con 8 GB espera lentitud.");
      break;
    case "large":
      numCtx = 32768;
      numPredict = -1;
      numBatch = 512;
      keepAlive = "30m";
      temperature = 0.5;
      contextCharBudget = 200000;
      historyTurns = 30;
      maxOpenFiles = 6;
      maxFileChars = 12000;
      notes.push("Modelo grande local: cuidado con la RAM, el prompt largo dispara el tiempo de espera.");
      break;
    case "cloud":
    default:
      numCtx = 32768;
      numPredict = -1;
      numBatch = 512;
      keepAlive = "10m";
      temperature = 0.5;
      contextCharBudget = 200000;
      historyTurns = 30;
      maxOpenFiles = 6;
      maxFileChars = 12000;
      notes.push("Modelo en la nube: no consume RAM local; sin recortes agresivos de contexto.");
      break;
  }

  if (lowRam && tier !== "cloud") {
    notes.push("Equipo con ≤8 GB de RAM: num_batch reducido y contexto ajustado para evitar swap.");
  }
  if (paramsB !== null && paramsB < TOOL_CAPABLE_MIN_PARAMS_B && passesAllowlist) {
    notes.push(
      `Modo sin herramientas: "${modelName}" (${paramsB}B) no soporta tool-calling de forma fiable; se enviará directo a streaming.`
    );
  }
  if (alias) {
    // Sin esta nota, el usuario vería «tier: cloud» en un modelo que él cree
    // local y no sabría por qué. La explicación es parte del arreglo.
    notes.push(
      `"${modelName}" está declarado como alias de "${alias}": hereda su perfil (${tier}) y no se le aplican los recortes de un modelo local.`
    );
  }

  return {
    tier,
    paramsB,
    remote,
    toolCapable,
    aliasDe: alias,
    numCtx,
    numPredict,
    numBatch,
    keepAlive,
    temperature,
    contextCharBudget,
    historyTurns,
    maxOpenFiles,
    maxFileChars,
    notes,
    // 1 hilo libre para la interfaz: si Ollama acapara todos los núcleos, la UI
    // se congela y parece que "no contesta" aunque el modelo esté trabajando.
    numThreadSuggestion: (cores: number) => {
      if (!cores || cores <= 0) return null;
      // Los modelos diminutos no escalan bien con muchos hilos: repartir 8 hilos
      // entre capas de 400 MB añade sincronización y empeora la latencia.
      if (tier === "micro" || tier === "tiny") return Math.max(2, Math.min(cores - 1, 4));
      return Math.max(2, Math.min(cores - 1, 12));
    },
  };
}

/** Atajo booleano usado por el servidor y el cliente. */
export function shouldRunAgentLoop(modelName: string): boolean {
  return getModelProfile(modelName).toolCapable;
}

/** ¿Es un modelo diminuto (el rango 250 MB-1 GB del usuario)? */
export function isMicroModel(modelName: string): boolean {
  const p = parseParamsB(modelName);
  return p !== null && p <= 1.6;
}

/**
 * Construye el bloque `options` de /api/chat para Ollama.
 * @param cores núcleos de CPU (server: os.cpus().length)
 */
export function buildOllamaOptions(
  modelName: string,
  temperature: number | undefined,
  cores: number,
  ramGb?: number
): Record<string, unknown> {
  const p = getModelProfile(modelName, ramGb);
  const threads = p.numThreadSuggestion(cores);
  const opts: Record<string, unknown> = {
    temperature: typeof temperature === "number" ? Math.max(0.05, Math.min(1.0, temperature)) : p.temperature,
    num_ctx: p.numCtx,
    num_batch: p.numBatch,
    repeat_penalty: 1.12,
    repeat_last_n: 128,
    top_k: 40,
    top_p: 0.9,
  };
  if (threads !== null) opts.num_thread = threads;
  // num_predict = -1 significa "sin tope" y en Ollama es válido, pero no lo
  // enviamos para no pisar el default del usuario en modelos grandes/nube.
  if (p.numPredict > 0) opts.num_predict = p.numPredict;
  return opts;
}

/**
 * Recorta una lista de mensajes al presupuesto de contexto.
 * Conserva SIEMPRE el primer mensaje de sistema y los últimos turnos.
 * Se usa en el servidor (defensa final) y en el cliente (contextCache).
 */
export function trimMessagesToBudget<T extends { role?: string; content?: string }>(
  messages: T[],
  budgetChars: number,
  historyTurns: number
): { messages: T[]; dropped: number; truncated: boolean } {
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  // Nos quedamos con los últimos `historyTurns * 2` mensajes (ida y vuelta)
  const keep = Math.max(2, historyTurns * 2);
  let kept = rest.slice(-keep);
  let dropped = rest.length - kept.length;

  const size = (arr: T[]) => arr.reduce((n, m) => n + (m.content?.length || 0), 0);
  // Si aún no cabe, vamos soltando los más antiguos del historial
  while (kept.length > 2 && size([...system, ...kept]) > budgetChars) {
    kept = kept.slice(1);
    dropped++;
  }

  // Último recurso: truncar mensajes larguísimos (un archivo pegado entero)
  let truncated = false;
  const perMessage = Math.max(800, Math.floor(budgetChars / Math.max(2, kept.length)));
  const fixed = kept.map((m) => {
    const c = m.content || "";
    if (c.length > perMessage) {
      truncated = true;
      return { ...m, content: c.slice(0, perMessage) + "\n\n[…recortado para no saturar el contexto del modelo local…]" };
    }
    return m;
  });

  return { messages: [...system, ...fixed], dropped, truncated };
}
