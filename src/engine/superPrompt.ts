/**
 * superPrompt.ts — SUPER PROMPT INICIAL optimizado para eficiencia y velocidad (v2.0)
 * ================================================================================
 * Un solo constructor de prompt de sistema, con 4 niveles de detalle según el
 * modelo activo. El principio: **el prompt también es latencia**. En un equipo
 * de 8 GB, cada 1.000 tokens de prompt son segundos de espera antes de la
 * primera letra; en la nube son dinero. Así que el prompt se dimensiona al
 * modelo, no a la imaginación del desarrollador.
 *
 *   nivel "micro"    → modelos <1.6B (250 MB-1 GB)  ~0.25 K tokens
 *   nivel "compact"  → modelos ≤8B locales            ~0.6 K tokens
 *   nivel "standard" → 8B-34B                         ~1.1 K tokens
 *   nivel "pro"      → nube / >34B                    ~1.6 K tokens
 *
 * Comparativa con la v1.1: el prompt base era el mismo para todos los modelos,
 * e incluía MEMORIA.md + el catálogo completo de 100 habilidades (≈9.000
 * caracteres ≈ 2.300 tokens) inyectado en CADA primer turno, más el historial
 * completo. En un modelo de 400 MB eso es el 100 % de su ventana de contexto:
 * el modelo no arranca. Aquí el catálogo se sustituye por una línea de
 * "capacidades disponibles" y el detalle solo se inyecta si el usuario lo pide.
 */

import type { ModelProfile, ModelTier } from "./modelTiers";

export type PromptLevel = "micro" | "compact" | "standard" | "pro";

export interface SuperPromptOptions {
  profile: ModelProfile;
  /** Código de idioma ("es", "en", …) */
  responseLanguage?: string;
  /** Directiva de idioma ya resuelta ("ESPAÑOL", "INGLÉS (English)"…) */
  languageDirective?: string;
  /** Directiva del modo experto (legal, código, docs…) */
  expertDirective?: string;
  /** Nombres de las herramientas realmente activas en este turno */
  toolNames?: string[];
  /** Resumen de la estructura del proyecto (archivos) */
  workspaceSummary?: string;
  /** Resumen comprimido de la conversación anterior (>ventana de historial) */
  historySummary?: string;
  /** Cuántos mensajes del historial se envían íntegros */
  historyCount?: number;
  /** Total de mensajes que existen en el chat */
  totalMessages?: number;
  /** Reglas del usuario (MEMORIA.md editada) */
  userRules?: string;
  /** Añadidos ya calculados por la app (RAG, lecciones, anti-alucinación) */
  extra?: string;
  pcMode?: boolean;
  /** Override manual del nivel */
  level?: PromptLevel;
}

export function estimateTokens(text: string): number {
  // Aproximación estándar para mezcla de español/código (~4 caracteres por token)
  return Math.ceil((text || "").length / 4);
}

/** Nivel de detalle recomendado para un modelo. */
export function pickLevel(profile: ModelProfile): PromptLevel {
  const t: ModelTier = profile.tier;
  if (t === "micro" || t === "tiny") return "micro";
  if (t === "cloud" || t === "large") return "pro";
  if (t === "medium") return "standard";
  return "compact";
}

// ------------------------------------------------------------
// Bloques reutilizables
// ------------------------------------------------------------

const IDENTITY = "Eres CerebroNico, agente de ingeniería de software dentro de una IDE local.";

/** Reglas de velocidad: el corazón del pedido "que actúe más rápido". */
const SPEED_RULES = `[REGLAS DE VELOCIDAD — OBLIGATORIAS]
1. Empieza por el resultado o por la acción. Prohibido el preámbulo ("claro", "por supuesto", "entiendo") y prohibido el resumen final de lo que acabas de hacer.
2. No repitas la pregunta, ni el código, ni los datos que ya están en este contexto.
3. Para cambiar algo existente usa edit_file (buscar/reemplazar) antes que write_file; para leer un archivo largo usa read_file_range antes que read_file. Reescribir un archivo entero cuando bastaba una línea es un error de rendimiento.
4. Sé proporcional: 3 líneas si bastan 3. Prohibidas las listas de relleno.
5. Si falta un dato imprescindible, haz UNA sola pregunta corta y detente. No supongas datos inventados.
6. Nunca expliques cómo usar una herramienta: úsala.
7. No te detengas a mitad: si el pedido ya fija el destino (ruta, archivo o resultado esperado), ejecutá el paso que sigue sin pedir permiso ni confirmar lo obvio. Si una herramienta falla, no la repitas igual —cambiá de herramienta, de ruta o de enfoque— y seguí con la solución. Solo se devuelve la tarea al usuario cuando falta un dato imprescindible (regla 5) o cuando ya no queda nada por intentar.`;

const CONTEXT_RULES = `[CONTEXTO]
- Recibes los mensajes recientes de la conversación tal cual y, si la conversación es más larga, un resumen comprimido de lo anterior.
- NUNCA pidas al usuario que repita algo que ya aparece en el historial o en el resumen.
- Si el usuario pregunta por algo dicho mucho antes y no está en el contexto, dilo explícitamente en vez de inventarlo.`;

const PORTS = `Puertos: 3000 IDE · 3500 sandbox/preview · 5000 puente PC · 11434 Ollama.`;

const FILE_PROTOCOL = `[ARCHIVOS]
- Cuando tengas que entregar código que el usuario copiará, usa un bloque por archivo con la ruta:
  \`\`\`lenguaje file="ruta/archivo.ext"
  ...código completo y funcional, sin placeholders...
  \`\`\`
- TODO bloque con file="ruta" DEBE venir precedido de una línea \`**ruta** — qué es\` y seguido de una frase que diga para qué sirve y cómo se comprueba. Sin excepción en la respuesta visible: un bloque de código nunca viaja mudo.
- Dentro del sandbox, si puedes escribir el archivo con herramientas, hazlo y no imprimas el código entero.`;

function toolBlock(toolNames: string[], pcMode?: boolean): string {
  if (!toolNames || toolNames.length === 0) {
    return `[HERRAMIENTAS]\n- En este turno no tienes herramientas: responde con texto y bloques de archivo.`;
  }
  const lines: string[] = [
    `[HERRAMIENTAS ACTIVAS] ${toolNames.join(", ")}`,
    "- set_plan una vez al inicio si la tarea tiene más de 2 pasos; luego update_task por paso.",
    "- Verifica lo que creas con run_command o run_tests antes de decir que está terminado.",
    "- delete_file y pc_delete son destructivas: solo si el usuario lo pidió explícitamente.",
    "- No encadenes herramientas sin necesidad: cada llamada cuesta una vuelta completa del modelo.",
  ];
  if (pcMode) lines.push("- Estás en Modo Agente PC: para archivos reales usa SIEMPRE las pc_* (list_files/write_file sin prefijo son del sandbox).");
  return lines.join("\n");
}

// ------------------------------------------------------------
// Constructor principal
// ------------------------------------------------------------
export interface SuperPromptResult {
  prompt: string;
  level: PromptLevel;
  estTokens: number;
}

export function buildSuperPrompt(opts: SuperPromptOptions): SuperPromptResult {
  const { profile } = opts;
  const level = opts.level || pickLevel(profile);
  const lang = opts.languageDirective || (opts.responseLanguage === "en" ? "INGLÉS (English)" : "ESPAÑOL");
  const parts: string[] = [];

  if (level === "micro") {
    // ~250 tokens: un modelo de 400 MB necesita casi todo su contexto para el trabajo.
    parts.push(
      `${IDENTITY}`,
      `IDIOMA: responde SIEMPRE en ${lang}.`,
      `REGLAS: respuestas de máximo 6 líneas; sin preámbulos ni resúmenes; no repitas lo que ya está en el contexto; si no sabes algo dilo en una frase; no intentes usar herramientas; no inventes datos ni rutas.`,
      `Formato: texto directo. Usa un bloque \`\`\`lenguaje file="ruta" ...\`\`\` solo si el usuario pide un archivo.`,
      PORTS
    );
    if (opts.userRules) parts.push(`[REGLAS DEL USUARIO]\n${truncate(opts.userRules, 600)}`);
    if (opts.historySummary) parts.push(`[RESUMEN DE LA CONVERSACIÓN PREVIA]\n${truncate(opts.historySummary, 800)}`);
    if (opts.expertDirective) parts.push(opts.expertDirective);
  } else if (level === "compact") {
    parts.push(
      `${IDENTITY} ${PORTS}`,
      `IDIOMA: ${lang}, técnico y directo.`,
      SPEED_RULES,
      `[CONTEXTO]\n- Historial reciente disponible${opts.totalMessages ? ` (${opts.historyCount || 0} de ${opts.totalMessages} mensajes)` : ""}. No pidas repetir lo que ya está aquí.`,
      toolBlock(opts.toolNames || [], opts.pcMode),
      FILE_PROTOCOL
    );
    if (opts.workspaceSummary) parts.push(`[PROYECTO]\n${truncate(opts.workspaceSummary, 700)}`);
    if (opts.historySummary) parts.push(`[RESUMEN DE LO ANTERIOR]\n${truncate(opts.historySummary, 1000)}`);
    if (opts.userRules) parts.push(`[REGLAS DEL USUARIO]\n${truncate(opts.userRules, 800)}`);
    if (opts.expertDirective) parts.push(opts.expertDirective);
  } else {
    // standard | pro comparten esqueleto; "pro" añade criterio de ingeniería.
    parts.push(
      `${IDENTITY} Trabajas sobre el proyecto abierto en el editor y puedes crear, modificar y ejecutar archivos. ${PORTS}`,
      `[IDIOMA] Responde SIEMPRE y únicamente en ${lang}, incluidos comentarios de código y textos de interfaz. Tono técnico, directo, sin relleno.`,
      SPEED_RULES,
      CONTEXT_RULES,
      toolBlock(opts.toolNames || [], opts.pcMode),
      FILE_PROTOCOL
    );
    if (level === "pro") {
      parts.push(
        `[CRITERIO PRO]\n- Antes de tocar código, mira lo que ya existe: no dupliques funciones, no rompas la API pública, no cambies estilos globales sin motivo.\n- Cambios pequeños y verificables mejor que reescrituras.\n- Si detectas un problema de seguridad o de rendimiento en lo que tocas, dilo en una línea y sigue.`
      );
    }
    if (opts.workspaceSummary) parts.push(`[PROYECTO]\n${truncate(opts.workspaceSummary, level === "pro" ? 1500 : 1000)}`);
    if (opts.historySummary) parts.push(`[RESUMEN DE LA CONVERSACIÓN PREVIA]\n${truncate(opts.historySummary, level === "pro" ? 2500 : 1500)}`);
    if (opts.userRules) parts.push(`[REGLAS DEL USUARIO (MEMORIA.md)]\n${truncate(opts.userRules, level === "pro" ? 1500 : 900)}`);
    if (opts.expertDirective) parts.push(opts.expertDirective);
  }

  // ==========================================================================
  // v2.2 — El chat puede PEDIR CONVERSIONES DE FORMATO.
  // --------------------------------------------------------------------------
  // Sin esta línea, la orden existiría en el código y el modelo no la emitiría
  // NUNCA: sería una función que no sirve para nada, y de las silenciosas. Va
  // aquí porque es donde se monta el prompt, y se omite en «micro» — ese nivel
  // dice explícitamente que no intente usar herramientas, y con razón: un modelo
  // de 400 MB necesita el contexto para trabajar, no para leer un manual.
  // ==========================================================================
  if (level !== "micro") {
    // El chat tiene que saber que puede crear un PLAN del cerebro. Sin esto, el
    // motor existiría, la orden existiría, y nadie las usaría nunca.
    parts.push(
      [
        "[PLANES DE TAREAS EN SEGUNDO PLANO]",
        "Para trabajos de varios pasos (convertir muchos archivos, leer y resumir varios documentos), emite un plan:",
        "```cerebronico:plan",
        '{"objetivo":"Convertir los datos a tres formatos","tareas":[',
        '{"id":"1","titulo":"leer","tipo":"leer_archivo","peso":"io","datos":{"ruta":"datos.csv"}},',
        '{"id":"2","titulo":"a YAML","tipo":"convertir","datos":{"desde":"csv","hacia":"yaml","archivo":"datos.csv"},"dependeDe":["1"]}]}',
        "```",
        "Los CINCO tipos de tarea que existen: `modelo` {prompt, contexto?, modelo?}, `leer_archivo` {ruta},",
        "`convertir` {desde, hacia, archivo|contenido}, `generar_imagen` {prompt, salida?}, `reflejo` {entidad, frase?, datos?} (las 50 entidades del consejo Agéntico —incluidos los espejos del equipo activo—, deterministas, sin RAM neural). Las tareas sin `dependeDe` corren en PARALELO.",
        "NO existe «ejecutar comando»: no lo inventes ni lo prometas.",
        "Se verifica antes de crearlo: ids únicos, dependencias existentes, sin ciclos, y los datos de cada tipo.",
        "Si te lo rechazan, el motivo te llegará: corrige y vuelve a emitirlo.",
      ].join("\n")
    );

    parts.push(
      [
        "[CONVERSIONES DE FORMATO]",
        "Si el usuario quiere cambiar un archivo de formato (json, yaml, toml, csv), NO escribas el resultado a mano:",
        "emite esta orden y el IDE la ejecuta, deja el archivo en el editor y refresca la vista previa.",
        "```cerebronico:convertir",
        '{"desde":"json","hacia":"yaml","archivo":"package.json"}',
        "```",
        "`archivo` es la ruta dentro del proyecto (o usa `contenido` con el texto). `desde` y `hacia` son obligatorios.",
        "AVISA SIEMPRE DE LAS PÉRDIDAS, no digas que salió perfecto: JSON no admite comentarios, TOML no tiene nulos,",
        "CSV no guarda tipos. El IDE te devolverá el informe y debes resumírselo al usuario.",
      ].join("\n")
    );

    parts.push(
      [
        "[IMÁGENES GRATIS]",
        "Si el usuario pide una imagen (logo, ilustración, fondo, mockup), NO la describas: emite esta orden y el",
        "IDE la dibuja gratis (sin clave), la guarda en el proyecto y refresca la vista previa.",
        "```cerebronico:imagen",
        '{"prompt":"logo minimalista de un cerebro, neón, fondo oscuro","salida":"img/logo.jpg","ancho":1024,"alto":1024}',
        "```",
        "Sólo `prompt` es obligatorio; `salida` es la ruta dentro del proyecto (.jpg/.jpeg/.png/.webp).",
        "Sé honesto: sin clave tarda hasta ~1 min y el modelo que responde no siempre es el pedido; el IDE",
        "devuelve el modelo REAL y sus avisos — resúmelos, no digas que salió perfecto.",
        "Varias imágenes de una vez = un plan con tareas `generar_imagen` (segundo plano, en paralelo).",
      ].join("\n")
    );
  }

  // ══ QUIRÓFANO v1 /*QF-CONTRATO*/ — el contrato va ANTES del trabajo, no después
  // del destrozo. Está medido en el propio motor: el Quirófano bloquea la
  // escritura destructiva, pero es más barato (en tiempo y en créditos) que el
  // modelo no lo intente. Nivel «micro» se lo salta a propósito: ese nivel ya
  // dice que no use herramientas y necesita el contexto para trabajar.
  if (level !== "micro") {
    parts.push(
      [
        "[CONTRATO QUIRÚRGICO — apps que YA funcionan]",
        "- PROHIBIDO reescribir un archivo que ya existe: usa edit_file con un ancla ÚNICA (2-4 líneas de contexto exacto). write_file sólo para archivos NUEVOS.",
        "- Antes de tocar un archivo, LÉELO (read_file o read_file_range). Lo que no has leído no se reescribe nunca.",
        "- Conserva TODO lo que no te han pedido cambiar: exportaciones, nombres de funciones, rutas, textos y estilos. No «mejores» de paso.",
        "- El motor BLOQUEA la escritura si desaparecen exportaciones, si el archivo pierde ≥35 % de sus líneas útiles o si dejas marcadores de truncado («…», «resto del código»).",
        "- Si te bloquea, NO repitas la misma escritura: cambia a ediciones quirúrgicas. Si de verdad hay que reescribir, usa force=true y explica el motivo.",
        "- Un archivo por paso. Al terminar, di QUÉ archivo tocaste y qué conservaste. No inventes archivos ni requisitos que no estén pedidos.",
        "- Tienes revisar_cambios (juzga y revierte tu propia tanda) y deshacer_cambios (deshace la última): úsalas si dudas, antes de dar algo por bueno.",
      ].join("\n")
    );
  }
  if (opts.extra) parts.push(opts.extra);

  const prompt = parts.filter(Boolean).join("\n\n").trim();
  return { prompt, level, estTokens: estimateTokens(prompt) };
}

/** Resumen determinista de la conversación anterior: sin coste de modelo, sin alucinación. */
export function summarizeOlderMessages(
  messages: { role: string; content: string }[],
  maxChars = 2000
): string {
  if (!messages || messages.length === 0) return "";
  const lines: string[] = [];
  for (const m of messages) {
    const text = (m.content || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const who = m.role === "user" ? "U" : m.role === "assistant" ? "A" : "S";
    lines.push(`- ${who}: ${truncate(text, 160)}`);
  }
  // Si no cabe, conservamos el principio y el final (contexto + estado actual)
  const joined = lines.join("\n");
  if (joined.length <= maxChars) return joined;
  const head = lines.slice(0, Math.ceil(lines.length / 3));
  const tail = lines.slice(-Math.ceil(lines.length / 3));
  return `${head.join("\n")}\n- […${lines.length - head.length - tail.length} mensajes intermedios resumidos…]\n${tail.join("\n")}`;
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max) + " […]";
}
