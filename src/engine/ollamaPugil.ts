/**
 * ollamaPugil.ts — PUGIL v1: quién sparra (chat) y quién solo mide (embeddings)
 * =============================================================================
 * Reporte del usuario: «muchos modelos instalados no andan y son los de menor
 * peso» — snowflake-arctic-embed y all-minilm son modelos de EMBEDDINGS:
 * producen vectores para RAG; Ollama los rechaza con 400 en /api/chat. No es
 * que estén rotos: están para otra cosa. Este módulo puro lo sabe, lo dice con
 * motivo, y la interfaz lo muestra antes de que el usuario gaste un pedido.
 *
 * Detección en dos capas (por honestidad, no por pereza):
 *   1. si el llamante trae el JSON de /api/show, se consulta ahí
 *      (`capabilities` / arquitectura bert·embed·minilm) — verdad declarada;
 *   2. si no, heurística de nombre contra las familias de embedders públicas
 *      — aproximación que NOMBRA su incertidumbre en el motivo.
 */

const FAMILIAS_EMBED = /(snowflake-arctic-embed|nomic-embed|minilm|mpnet|\bbge\b|mxbai-embed|sensenova-embed|bce-embed|jina-clip|e5-|bge-m3|embed)/i;

export function esModeloEmbeds(nombre: string, show?: unknown): boolean {
  if (typeof nombre !== "string" || !nombre.trim()) return false;
  if (show && typeof show === "object") {
    const s = JSON.stringify(show);
    if (/"capabilities"\s*:\s*\[[^\]]*"embedding"/i.test(s)) return true;
    // la clave real viene prefijada por la arquitectura: «general.model_architecture»
    if (/"[a-z0-9_.]*model_architecture"\s*:\s*"[^"]*(bert|embed|minilm)[^"]*"/i.test(s)) return true;
    // /api/show declaró capacidades y NO incluyó embedding: el show manda sobre
    // el nombre (un modelo llamado «el-embed-dorado» que dice completar, completa).
    if (/"capabilities"\s*:\s*\[/i.test(s)) return false;
  }
  return FAMILIAS_EMBED.test(nombre.split(":")[0]);
}

export function puedeChatear(nombre: string, show?: unknown): boolean {
  return typeof nombre === "string" && nombre.trim().length > 0 && !esModeloEmbeds(nombre, show);
}

/** El motivo completo, tal como lo ve el usuario en el chat. */
export function motivoEmbeds(nombre: string): string {
  return `«${nombre}» es un modelo de EMBEDDINGS, no de chat: produce vectores numéricos para búsqueda semántica/RAG y Ollama lo rechaza con HTTP 400 si le pides texto (por eso parecía «cortarse la comunicación»). No está roto: está para otra cosa. Déjalo como motor de memoria del RAG y, para conversar, elige un modelo de chat — en tu máquina van bien qwen3:0.6b y similares. (Detección por familia de nombre; si quieres certeza, /api/show declara sus capacidades.)`;
}

/** Etiqueta corta para listas y badges. */
export function etiquetaModelo(nombre: string, show?: unknown): string {
  return esModeloEmbeds(nombre, show) ? "embeddings" : "chat";
}
