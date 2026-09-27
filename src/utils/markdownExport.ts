/**
 * CerebroNico V0.9 — Exportar conversación a Markdown / Informe Técnico
 * ============================================================
 * Compila toda la conversación actual + código generado + entregables
 * en un informe técnico limpio y estructurado en formato Markdown.
 */
import { ChatMessage, WorkspaceFile } from "../types";
import { triggerFileDownload } from "./fileParser";
// v8.0.1 — La versión del informe sale de la fuente única (antes era un literal
// «V2.1» que sobrevivió a varias subidas: el informe que el usuario reenvía
// declaraba una versión que ya no existía).
import { IDE_BRAND } from "../constants";
// v1.6.11 — un bloque de DOCUMENTO no es código: al exportar «solo texto» hay
// que conservarlo, no cambiarlo por una nota.
import { quitarVallasConservandoTexto } from "./bloquesMarkdown";

export interface ExportOptions {
  includeSystemMessages?: boolean; // incluir mensajes del system prompt (default: false)
  includeCodeBlocks?: boolean;     // incluir bloques de código de las respuestas (default: true)
  includeWorkspaceTree?: boolean;  // incluir árbol de archivos del workspace (default: true)
  includeFileContents?: boolean;   // incluir contenido completo de cada archivo (default: false, solo metadatos)
  title?: string;
  author?: string;
}

export function exportChatToMarkdown(
  messages: ChatMessage[],
  workspaceFiles: WorkspaceFile[],
  options: ExportOptions = {}
): string {
  const {
    includeSystemMessages = false,
    includeCodeBlocks = true,
    includeWorkspaceTree = true,
    includeFileContents = false,
    title = `Informe Técnico — ${IDE_BRAND.FULL_NAME}`,
    author,
  } = options;

  const now = new Date();
  const lines: string[] = [];

  // ===== Encabezado del informe =====
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`**Fecha de generación:** ${now.toLocaleString("es-ES")}`);
  if (author) lines.push(`**Autor:** ${author}`);
  lines.push(`**Generado por:** ${IDE_BRAND.FULL_NAME} IDE`);
  lines.push(`**Mensajes:** ${messages.length}`);
  lines.push(`**Archivos en workspace:** ${workspaceFiles.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // ===== Resumen ejecutivo =====
  lines.push("## 📋 Resumen Ejecutivo");
  lines.push("");
  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  const modelsUsed = new Set(
    assistantMessages.map((m) => m.modelUsed).filter(Boolean) as string[]
  );
  lines.push(`- **Total de turnos:** ${userMessages.length} prompts del usuario, ${assistantMessages.length} respuestas del modelo`);
  lines.push(`- **Modelos utilizados:** ${modelsUsed.size > 0 ? Array.from(modelsUsed).join(", ") : "n/d"}`);
  lines.push(`- **Volumen de texto:** ${totalChars.toLocaleString("es-ES")} caracteres (~${Math.round(totalChars / 4).toLocaleString("es-ES")} tokens)`);
  if (workspaceFiles.length > 0) {
    lines.push(`- **Workspace:** ${workspaceFiles.length} archivos`);
    const totalSize = workspaceFiles.reduce((s, f) => s + (f.size || f.content.length), 0);
    lines.push(`- **Tamaño total:** ${(totalSize / 1024).toFixed(1)} KB`);
  }
  lines.push("");

  // ===== Primer y último prompt del usuario (contexto del proyecto) =====
  if (userMessages.length > 0) {
    lines.push("## 🎯 Objetivo Inicial");
    lines.push("");
    const firstPrompt = userMessages[0].content.slice(0, 500);
    lines.push(`> ${firstPrompt}${userMessages[0].content.length > 500 ? "..." : ""}`);
    lines.push("");
  }

  // ===== Conversación completa =====
  lines.push("## 💬 Conversación");
  lines.push("");
  for (const msg of messages) {
    if (msg.role === "system" && !includeSystemMessages) continue;
    const roleLabel = msg.role === "user" ? "👤 Usuario" : msg.role === "assistant" ? "🤖 Asistente" : "⚙️ Sistema";
    const time = new Date(msg.timestamp).toLocaleTimeString("es-ES");
    const modelInfo = msg.modelUsed ? ` (${msg.modelUsed})` : "";
    lines.push(`### ${roleLabel}${modelInfo} — ${time}`);
    lines.push("");
    if (includeCodeBlocks || msg.role === "user") {
      lines.push(msg.content || "_(mensaje vacío)_");
    } else {
      // Solo texto, sin bloques de código.
      // v1.6.11 — pero un bloque de DOCUMENTO (``` text file="…") no es código:
      // se conserva entero. Antes se sustituía por «(bloque de código omitido)»,
      // así que exportar un mensaje que era un documento dentro de una valla
      // producía un archivo con esa frase y nada más.
      const cleaned = quitarVallasConservandoTexto(msg.content || "", { codigo: "nota" });
      lines.push(cleaned || "_(mensaje vacío)_");
    }
    lines.push("");
    if (msg.attachments && msg.attachments.length > 0) {
      lines.push(`**Adjuntos:** ${msg.attachments.map((a) => a.name).join(", ")}`);
      lines.push("");
    }
  }

  // ===== Workspace / Entregables =====
  if (includeWorkspaceTree && workspaceFiles.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## 📦 Workspace / Entregables");
    lines.push("");
    lines.push(`Total: **${workspaceFiles.length} archivos**`);
    lines.push("");
    lines.push("| Archivo | Tamaño | Lenguaje | Modificado |");
    lines.push("|---------|--------|----------|------------|");
    for (const f of workspaceFiles) {
      const sizeKB = ((f.size || f.content.length) / 1024).toFixed(1);
      lines.push(`| \`${f.path}\` | ${sizeKB} KB | ${f.language} | ${f.modified ? "Sí" : "No"} |`);
    }
    lines.push("");

    if (includeFileContents) {
      lines.push("### Contenido de archivos");
      lines.push("");
      for (const f of workspaceFiles) {
        lines.push(`#### \`${f.path}\``);
        lines.push("");
        lines.push(`\`\`\`${f.language}`);
        lines.push(f.content || "_(vacío)_");
        lines.push("```");
        lines.push("");
      }
    }
  }

  // ===== Pie del informe =====
  lines.push("---");
  lines.push("");
  // v0.9 — Tercer literal de versión en ESTE archivo, y el único que se me había
  // escapado: los otros dos se arreglaron en v8.0.1. Éste va dentro del informe
  // que el usuario EXPORTA Y REENVÍA, así que declaraba una versión falsa en un
  // documento que sale del producto. Ahora sale de la fuente única.
  lines.push(`*Informe generado automáticamente por ${IDE_BRAND.FULL_NAME} IDE el ${now.toLocaleString("es-ES")}.*`);

  return lines.join("\n");
}

export function downloadMarkdownReport(
  messages: ChatMessage[],
  workspaceFiles: WorkspaceFile[],
  options: ExportOptions = {}
): void {
  const markdown = exportChatToMarkdown(messages, workspaceFiles, options);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  triggerFileDownload(blob, `cerebronico-informe-${ts}.md`);
}
