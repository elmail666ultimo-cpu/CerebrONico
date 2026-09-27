/**
 * sandboxTregua.ts — TREGUA v1: el sandbox y el chat comparten UN lazo de eventos
 * ==============================================================================
 * Reporte: «cuando el sandbox está trabajando se corta el chat local Y el cloud».
 * Causa: `/api/fs/sync` volcaba N archivos con `fs.writeFileSync` + guardián de
 * sintaxis dentro de UN handler síncrono. Mientras ese bucle corre, el servidor
 * no puede regar ninguna otra conexión — y los dos chats (Ollama y Z.ai) viajan
 * por SSE sobre ese mismo servidor: el volcado los dejaba sin frames y el
 * cliente cortaba. No era el modelo: era el disco comiéndose el lazo.
 *
 * Tregua en tres piezas:
 *   1. el volcado escribe en asíncrono y CEDE el lazo cada CADA archivos
 *      (setImmediate): los SSE respiran entre tandas;
 *   2. el piloto AUTO no sincroniza mientras hay un chat en curso — pospone con
 *      aviso y reintenta solo (una tregua no puede parecer un olvido);
 *   3. todo lo decidible aquí es puro y se prueba sin servidor.
 */

/** ¿Cede el lazo después del enésimo archivo? (1-based; cada 8 por defecto) */
export function cedeElLazo(indice: number, cada = 8): boolean {
  return Number.isInteger(indice) && indice > 0 && indice % Math.max(1, cada) === 0;
}

/** El piloto automático debe esperar si hay un stream de chat vivo (local o cloud). */
export function debePausarSync(streamingActivo: boolean): boolean {
  return streamingActivo === true;
}

/** Lo que lee el usuario en el log cuando el piloto pospone. Nunca silencio. */
export function avisoPausaSync(): string {
  return "⏸ sync auto pospuesta: hay un chat en curso (el sync y el SSE pelean por el mismo lazo). El piloto reintenta solo en cuanto calle.";
}

/** El sync MANUAL del usuario NUNCA se pausa: pidió ahora, tendrá ahora. */
export function pausarSyncManual(streamingActivo: boolean): boolean {
  return false; // constante deliberada: documenta la decisión, no el olvido
}
