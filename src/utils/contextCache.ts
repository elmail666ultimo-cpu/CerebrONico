/**
 * contextCache.ts — Motor de contexto de la IDE (v2.0)
 * ===================================================
 * Cambios frente a la v1.1 (motivo de cada uno):
 *
 * 1. PROMPT DIMENSIONADO AL MODELO. Antes el prompt de sistema era idéntico
 *    para un modelo de 400 MB y para GPT en la nube, e inyectaba MEMORIA.md +
 *    el catálogo COMPLETO de 100 habilidades (≈2.300 tokens) en cada primer
 *    turno. En un modelo diminuto eso llena la ventana y no responde. Ahora se
 *    usa `buildSuperPrompt()` (shared/superPrompt.ts), con 4 niveles: micro,
 *    compact, standard y pro.
 *
 * 2. CONTEXTO LARGO DE VERDAD (>50 mensajes). Antes se enviaba "todo el
 *    historial" sin control: con 200 mensajes el prompt crecía hasta reventar
 *    la ventana del modelo (y en local eso son minutos de espera). Ahora:
 *      - se envían íntegros los últimos N mensajes (60 por defecto, ampliable),
 *      - los anteriores se comprimen con `summarizeOlderMessages()` — un
 *        resumen determinista, sin coste de tokens de modelo y sin inventar —,
 *      - y todo el conjunto respeta el presupuesto de caracteres del modelo.
 *    Resultado: el modelo "recuerda" 50+ mensajes atrás sin perder velocidad.
 *
 * 3. ARCHIVOS ABIERTOS ACOTADOS por el perfil del modelo (1 archivo de 1.500
 *    caracteres para micro, hasta 6 de 12.000 para la nube) en vez de "hasta 5
 *    archivos de 8.000 caracteres" sin importar el modelo.
 */

import { ChatMessage, WorkspaceFile } from "../types";
// v1.6.33 · CATÁLOGO HONESTO: el SKILLS.md que ve el modelo deja de ser el
// volcado literal de 100 títulos (92 sin código). Se construye con la
// auditoría por evidencia (catalogoHonesto.ts): bloque ACTIVA verificable +
// bloque MAPA declarado como no construido. El `existe` siempre-verdadero es
// deliberado en el navegador: el mapa curado lo verifica el TEST contra disco
// y el runtime consume esa verdad ya auditada.
import {
  auditarCatalogo,
  skillsMdHonesto,
  skillsCompactoHonesto,
  type HabilidadAuditada,
} from "../engine/catalogoHonesto";
import { getModelProfile } from "../engine/modelTiers";
import { buildSuperPrompt, summarizeOlderMessages, estimateTokens, type PromptLevel } from "../engine/superPrompt";

export const RESPONSE_LANGUAGES = [
  { code: "es", label: "Español", directive: "ESPAÑOL" },
  { code: "en", label: "English", directive: "INGLÉS (English)" },
  { code: "pt", label: "Português", directive: "PORTUGUÉS (Português)" },
  { code: "fr", label: "Français", directive: "FRANCÉS (Français)" },
  { code: "de", label: "Deutsch", directive: "ALEMÁN (Deutsch)" },
  { code: "it", label: "Italiano", directive: "ITALIANO (Italiano)" },
] as const;

export function getResponseLanguageDirective(language: string): string {
  const match = RESPONSE_LANGUAGES.find((l) => l.code === language);
  return match?.directive ?? "ESPAÑOL";
}

// Modos de experto disponibles (rol especializado del modelo)
export const EXPERT_MODES = [
  { id: "general", label: "General" },
  { id: "legal", label: "Experto Legal" },
  { id: "medical", label: "Traducción Médica" },
  { id: "fraud", label: "Detección de Fraude" },
  { id: "docs", label: "Documentación (RAG)" },
  { id: "code", label: "Experto en Código" },
] as const;

export function buildExpertDirective(mode: string): string {
  switch (mode) {
    case "legal":
      return "- [MODO EXPERTO LEGAL]: Actúa como asistente jurídico. Analiza, resume y redacta documentos legales con precisión, identifica riesgos, plazos y obligaciones, y cita artículos/normas cuando sea posible. Al final de cada respuesta, incluye la advertencia: 'Esto no constituye asesoramiento legal formal; valida con un abogado colegiado.'";
    case "medical":
      return "- [MODO TRADUCCIÓN MÉDICA]: Actúa como traductor especializado en terminología clínica. Traduce con precisión, conservando términos técnicos, unidades y fármacos en su forma estándar. Señala términos ambiguos o que requieran validación por un profesional sanitario. No emitas diagnósticos ni consejo médico.";
    case "fraud":
      return "- [MODO DETECCIÓN DE FRAUDE]: Actúa como analista de riesgo de fraude. Identifica patrones sospechosos (montos atípicos, incoherencias, suplantación, urgencia indebida) y estructura tu análisis en: 1) indicadores detectados, 2) nivel de riesgo (bajo/medio/alto), 3) recomendación. Advierte que es una heurística de apoyo, no una decisión definitiva.";
    case "docs":
      return "- [MODO DOCUMENTACIÓN]: Responde ÚNICAMENTE basándote en los documentos adjuntos o archivos abiertos que se te proporcionan. Cita la fuente (nombre de archivo o sección). Si la información no aparece en la documentación, dilo explícitamente en lugar de inventar.";
    case "code":
      return "- [MODO EXPERTO EN CÓDIGO]: Actúa como ingeniero de software senior. Escribe código completo y funcional sin placeholders. Antes de actuar define un plan (set_plan) y usa las herramientas (write_file, edit_file, run_command, run_tests) para implementar y verificar.";
    default:
      return "";
  }
}

/**
 * MEMORIA.md por defecto — versión CORTA (v2.0).
 * ⚠️ La versión de la v1.1 tenía 12 líneas de protocolo que se inyectaban en
 * cada primer turno. Con modelos pequeños eso es una parte enorme de la
 * ventana. Aquí queda lo irrenunciable; el resto vive en el catálogo de
 * habilidades, que solo se inyecta cuando el modelo puede permitírselo.
 */
export const DEFAULT_MEMORIA_MD = `# MEMORIA.md — CerebroNico
- **Rol**: CerebroNico, agente de ingeniería de software dentro de la IDE.
- **Idioma**: español técnico, directo y sin rodeos.
- **Puertos**: 3000 IDE · 3500 sandbox/preview · 5000 puente PC · 11434 Ollama.
- **Contexto**: historial de conversación completo (reciente íntegro + resumen de lo anterior). Nunca pidas repetir lo que ya está en el historial.
- **Archivos**: usa bloques \`\`\`lenguaje file="ruta/ext"\`\`\` solo cuando quieras entregar archivos; dentro del sandbox prefiere escribir con herramientas.
- **Listas numeradas**: mantén la continuidad (nunca dejes un número vacío).
`;

/** Catálogo completo de habilidades (solo se inyecta si el modelo tiene ventana de sobra). */
/**
 * Catálogo YA auditado (v1.6.33). El mapa curado de `catalogoHonesto.EVIDENCIAS`
 * lo verifica el test contra el disco real; aquí el navegador consume esa
 * verdad sin tocar el filesystem. La UI y el prompt leen de aquí.
 */
export const CATALOGO_AUDITADO: HabilidadAuditada[] = auditarCatalogo(() => true);

/** El SKILLS.md honesto: activas con evidencia + mapa declarado como pendiente. */
export const DEFAULT_SKILLS_MD = skillsMdHonesto(CATALOGO_AUDITADO);

/** Versión de una línea del catálogo, honesta por construcción. */
export const DEFAULT_SKILLS_COMPACT = skillsCompactoHonesto(CATALOGO_AUDITADO);

export interface HiddenSystemFile {
  name: string;
  content: string;
}

export interface ContextBuildOptions {
  responseLanguage?: string;
  expertMode?: string;
  /** Modelo activo: define nivel de prompt y presupuestos */
  modelName?: string;
  /** RAM estimada del equipo en GB (para recortes adicionales) */
  ramGb?: number;
  /**
   * Cuántos mensajes recientes se envían ÍNTEGROS.
   * 0 / undefined = automático según el modelo (60 por defecto en nube).
   */
  historyWindow?: number;
  /** Nombres de las herramientas activas en este turno */
  toolNames?: string[];
  /** Texto extra ya compuesto por la app (RAG, lecciones, anti-alucinación) */
  extra?: string;
  /** Usar el catálogo completo de habilidades aunque el modelo sea pequeño */
  fullSkillsCatalog?: boolean;
}

export interface PromptInfo {
  level: PromptLevel;
  estTokens: number;
  historyIncluded: number;
  historySummarized: number;
  dropped: number;
  openFilesCount: number;
  notes: string[];
}

export interface ContextCachePayload {
  systemInstruction: string;
  hiddenSystemFiles: HiddenSystemFile[];
  openFiles: { path: string; name: string; content: string; language: string }[];
  history: { role: "user" | "assistant" | "system"; content: string }[];
  isFirstMessage: boolean;
  totalMessagesInContext: number;
  /** v2.0 — telemetría del prompt, se muestra en el log de la IDE */
  promptInfo: PromptInfo;
}

/** Mensajes recientes que se envían íntegros si el modelo no dice otra cosa. */
const DEFAULT_HISTORY_WINDOW = 60;

export function buildContextCachePayload(
  messages: ChatMessage[],
  workspaceFiles: WorkspaceFile[],
  activeFileId: string | null,
  activePrompt: string,
  responseLanguage = "es",
  expertMode = "general",
  options: ContextBuildOptions = {}
): ContextCachePayload {
  const profile = getModelProfile(options.modelName || "", options.ramGb);
  const notes = [...profile.notes];

  // ---------- Archivos del proyecto ----------
  const memoriaFile = workspaceFiles.find((f) => f.name.toLowerCase() === "memoria.md" || f.path === "MEMORIA.md");
  const skillsFile = workspaceFiles.find((f) => f.name.toLowerCase() === "skills.md" || f.path === "skills.md");

  const memoriaContent = memoriaFile?.content || DEFAULT_MEMORIA_MD;
  // El catálogo de 100 habilidades son ~9.000 caracteres (≈2.300 tokens). Con
  // modelos pequeños se envía la versión de una línea.
  const wantsFullCatalog =
    options.fullSkillsCatalog === true ||
    /catalogo de habilidad|catálogo de habilidad|todas las habilidad|lista de habilidad|skills\.md/i.test(activePrompt || "");
  const compactSkills = profile.tier === "micro" || profile.tier === "tiny";
  const skillsContent =
    skillsFile?.content ||
    (compactSkills && !wantsFullCatalog ? DEFAULT_SKILLS_COMPACT : DEFAULT_SKILLS_MD);

  const lowerPrompt = activePrompt.toLowerCase();
  const wantsMessagesFolder =
    lowerPrompt.includes("carpeta de mensaje") ||
    lowerPrompt.includes("carpeta mensajes") ||
    lowerPrompt.includes("mensajes/") ||
    lowerPrompt.includes("archivos de mensaje") ||
    lowerPrompt.includes("historial de mensaje") ||
    lowerPrompt.includes("mensajes guardados");

  const openFilesList: { path: string; name: string; content: string; language: string }[] = [];
  const activeFile = workspaceFiles.find((f) => f.id === activeFileId);
  if (activeFile && activeFile.name !== "MEMORIA.md" && activeFile.name !== "skills.md") {
    openFilesList.push({
      path: activeFile.path,
      name: activeFile.name,
      content: activeFile.content.slice(0, profile.maxFileChars),
      language: activeFile.language,
    });
  }

  // Archivos de la carpeta de mensajes: se incluyen enteros (el usuario lo pidió).
  if (wantsMessagesFolder) {
    for (const file of workspaceFiles) {
      if (file.id === activeFileId) continue;
      const isMessageFile =
        file.path.startsWith("messages/") ||
        file.path.startsWith("mensajes/") ||
        file.name.includes("chat_") ||
        file.name.includes("message");
      if (!isMessageFile) continue;
      openFilesList.push({
        path: file.path,
        name: file.name,
        content: file.content.slice(0, profile.maxFileChars * 4),
        language: file.language || "json",
      });
      notes.push(`Carpeta de mensajes: incluido "${file.name}".`);
    }
  }

  // Archivos modificados (los que el usuario acaba de tocar) hasta el tope del perfil
  for (const file of workspaceFiles) {
    if (openFilesList.length >= profile.maxOpenFiles) break;
    if (file.id === activeFileId) continue;
    if (file.name === "MEMORIA.md" || file.name === "skills.md") continue;
    if (file.isBinary) continue;
    if (file.modified || openFilesList.length === 0) {
      openFilesList.push({
        path: file.path,
        name: file.name,
        content: file.content.slice(0, profile.maxFileChars),
        language: file.language,
      });
    }
  }

  // ---------- Historial: ventana íntegra + resumen de lo anterior ----------
  const allMessages = messages.map((m) => ({ role: m.role, content: m.content }));
  const requestedWindow = options.historyWindow && options.historyWindow > 0 ? options.historyWindow : 0;
  // El usuario puede pedir más ventana que la recomendada por el modelo; se
  // respeta, pero el presupuesto de caracteres sigue mandando (así "más
  // contexto" nunca se convierte en "más espera" sin control).
  const windowSize = requestedWindow || Math.max(DEFAULT_HISTORY_WINDOW, profile.historyTurns * 2);
  const older = allMessages.slice(0, Math.max(0, allMessages.length - windowSize));
  const recent = allMessages.slice(-windowSize);
  const historySummary = older.length > 0 ? summarizeOlderMessages(older, profile.tier === "micro" ? 600 : 2000) : "";

  // Presupuesto global: si el historial reciente se pasa, se recorta por el principio.
  let keptHistory = recent;
  let dropped = 0;
  const budgetForHistory = Math.max(1500, profile.contextCharBudget - 2000);
  const sizeOf = (arr: { content: string }[]) => arr.reduce((n, m) => n + (m.content?.length || 0), 0);
  while (keptHistory.length > 2 && sizeOf(keptHistory) > budgetForHistory) {
    keptHistory = keptHistory.slice(1);
    dropped++;
  }

  // ---------- Super prompt ----------
  const workspaceSummary = buildWorkspaceSummary(workspaceFiles, profile.maxOpenFiles + 2);
  const expertDirective = buildExpertDirective(expertMode);
  const superPrompt = buildSuperPrompt({
    profile,
    responseLanguage,
    languageDirective: getResponseLanguageDirective(responseLanguage),
    expertDirective,
    toolNames: options.toolNames,
    workspaceSummary,
    historySummary,
    historyCount: keptHistory.length,
    totalMessages: allMessages.length,
    userRules: memoriaContent,
    extra: options.extra,
  });

  let systemInstruction = superPrompt.prompt;
  if (wantsMessagesFolder) {
    systemInstruction += `\n\n[MODO CARPETA DE MENSAJES] Tienes autorización para procesar todos los registros de mensajes/chats adjuntos.`;
  }
  if (profile.tier === "micro" || profile.tier === "tiny") {
    notes.push(
      `Prompt nivel "${superPrompt.level}" (≈${superPrompt.estTokens} tokens) para "${options.modelName || "modelo"}": se evita el catálogo completo de habilidades y se acotan los archivos abiertos.`
    );
  }

  // v1.6.22 — LA MEMORIA VIAJA UNA SOLA VEZ (antes iba en DOS sitios).
  // `memoriaContent` ya entra al prompt como [REGLAS DEL USUARIO] vía
  // `userRules` → `buildSuperPrompt()`, con su presupuesto por tramo (600/800/900/
  // 1.500 caracteres). Mandarla también aquí era una SEGUNDA copia ENTERA (hasta
  // MAX_CHARS_ARCHIVO_SISTEMA = 4.000 caracteres) en cada turno: doble gasto de
  // contexto y, en modelos locales, doble invitación a recitar el prompt en vez
  // de contestar. `skills.md` se queda porque no tiene otra vía de llegada.
  const hiddenFiles: HiddenSystemFile[] = [
    { name: "skills.md", content: skillsContent },
  ];

  return {
    systemInstruction,
    hiddenSystemFiles: hiddenFiles,
    openFiles: openFilesList,
    history: keptHistory,
    isFirstMessage: messages.length === 0,
    totalMessagesInContext: keptHistory.length + (older.length > 0 ? 1 : 0),
    promptInfo: {
      level: superPrompt.level,
      estTokens: estimateTokens(systemInstruction) + estimateTokens(hiddenFiles.map((h) => h.content).join("")),
      historyIncluded: keptHistory.length,
      historySummarized: older.length,
      dropped,
      openFilesCount: openFilesList.length,
      notes,
    },
  };
}

/**
 * Resumen de la estructura del proyecto. Antes no existía: o se inyectaban
 * archivos completos o el modelo no sabía ni qué había en el proyecto.
 * Un listado compacto es información casi gratis y evita llamadas a list_files.
 */
export function buildWorkspaceSummary(files: WorkspaceFile[], maxFiles = 12): string {
  if (!files || files.length === 0) return "";
  const shown = files.slice(0, maxFiles);
  const lines = shown.map((f) => `- ${f.path} (${f.language || "texto"}${f.modified ? ", editado" : ""})`);
  if (files.length > shown.length) lines.push(`- …y ${files.length - shown.length} archivo(s) más`);
  return lines.join("\n");
}
