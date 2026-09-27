/**
 * CerebroNico IDE - Carpeta de chats guardados (v3.3)
 * ============================================================
 * Lógica pura de la carpeta de chats (sin React): generación de IDs,
 * títulos derivados y archivado. Extraída de App.tsx para que el
 * componente sólo orqueste estado y estos helpers puedan probarse solos.
 */

import type { ChatMessage, SavedChat } from "../types";

/** Título legible a partir del primer mensaje del usuario. */
export function deriveChatTitle(msgs: ChatMessage[]): string {
  const firstUser = msgs.find((m) => m.role === "user");
  if (!firstUser) return "Chat sin título";
  const clean = firstUser.content.replace(/\s+/g, " ").trim();
  if (!clean) return "Adjuntos sin texto";
  return clean.length > 46 ? clean.slice(0, 46) + "…" : clean;
}

/** ID único para un chat guardado. */
export function makeChatId(): string {
  return "chat-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
}

/**
 * Construye el SavedChat listo para archivar.
 * Devuelve null si la conversación está vacía (nada que guardar).
 */
export function buildArchivedChat(
  messages: ChatMessage[],
  title?: string
): SavedChat | null {
  if (messages.length === 0) return null;
  return {
    id: makeChatId(),
    title: (title && title.trim()) || deriveChatTitle(messages),
    createdAt: messages[0]?.timestamp || Date.now(),
    updatedAt: messages[messages.length - 1]?.timestamp || Date.now(),
    messages,
  };
}
