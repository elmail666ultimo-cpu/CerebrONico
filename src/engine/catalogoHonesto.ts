/**
 * catalogoHonesto.ts — EL CATÁLOGO QUE NO MIENTE (v1.6.33)
 * =========================================================
 * El ROADMAP v8 §3.6 lo denunció con números:
 *   «Catálogo honesto: skills100.ts promete 92 capacidades sin código y
 *    contextCache.ts las inyecta como activas.»
 *
 * Verificado en esta sesión: `skills100.ts` declara 100 habilidades con
 * `status: "active"` (101 veces, contando la marca duplicada del título), y
 * `DEFAULT_SKILLS_MD` las volcaba ENTERAS en el prompt de sistema como si
 * fueran reales. Consecuencia práctica: el modelo le decía al usuario que
 * «CerebroNico hace YOLO local, Wasm, JWT RS256 y transpilador SQL» porque
 * SE LO LEYÓ DE SU PROPIO MANUAL. Una IDE que miente sobre sí misma contamina
 * todos los prompts que construye: el modelo no puede planificar sobre
 * herramientas que no existen, y ofrece lo que no puede entregar.
 *
 * Este módulo es la AUDITORÍA HONESTA, en la forma que exige la casa:
 *   · La clasificación NO es una opinión embebida: cada habilidad declarada
 *     activa apunta a su `evidencia` — ficheros REALES del repo que hacen lo
 *     que el título promete.
 *   · El auditor es PURA función: recibe la lista de habilidades y una
 *     función `existe(ruta)` inyectada (en el test, `fs.existsSync`; en
 *     runtime, el mapa curado se audita en el test — el navegador no toca
 *     disco). Si la evidencia de una «activa» desaparece, el AUDITOR la
 *     degradad a aspiracional y el TEST pía. Así la mentira no puede
 *     sobrevir a un refactor.
 *   · Lo aspiracional NO se borra: es el mapa de hacia dónde va el proyecto.
 *     Se inyecta con su nombre verdadero («declaradas, no construidas»),
 *     para que el modelo diga «todavía no» en vez de fingir.
 */

import { SKILLS_LIST_100 } from "../data/skills100";

export type EstadoHonesto = "activa" | "aspiracional";

/**
 * HABILIDADES ACTIVAS CON EVIDENCIA (curado a mano, VERIFICADO contra disco
 * el 24-sep-2026, sesión v1.6.33). Cada id apunta a ficheros que existen y
 * hacen lo que el título dice. Los títulos sin entrada aquí NO están en la
 * lista de activas — punto.
 *
 * Criterio aplicado (duro, como el de la casa): si el título promete algo
 * más de lo que el fichero hace (p. ej. «Prettier & PrismJS» sin Prettier,
 * o «AES-GCM» en una bóveda que no cifra con ese esquema), NO hay evidencia
 * suficiente: va a aspiracional. Más vale un mapa corto y verdad.
 */
export const EVIDENCIAS: Record<number, string[]> = {
  1:  ["src/utils/contextCache.ts"],                                            // Autonomía y persistencia (MEMORIA.md por defecto)
  2:  ["src/utils/attachmentProcessor.ts"],                                     // Extractor de adjuntos (JSZip, docx/rtf con saneado)
  3:  ["server.ts"],                                                            // Puertos 3000/5000/11434 (HOST 127.0.0.1, puente PC, Ollama)
  5:  ["src/engine/superPrompt.ts"],                                            // Contexto dinámico por parámetros (perfiles por modelo)
  6:  ["src/components/CodeEditor.tsx"],                                        // Editor de pestañas
  7:  ["server.ts"],                                                            // ZIP en memoria (JSZip server-side, exportar proyecto)
  9:  ["src/engine/syntaxGuard.ts"],                                            // TS estricto: parser real esbuild (v1.6.32)
  10: ["src/utils/engine.ts"],                                                  // Streaming SSE con rAF batcher
  11: ["src/utils/bloquesMarkdown.ts"],                                         // Vallas/cercas de bloques (tests v1.6.11)
  12: ["src/engine/viaRapidaPreview.ts"],                                       // Sandbox live preview (tests v1.6.9)
  13: ["src/engine/inferenceBuffer.ts"],                                        // Cascada de recuperación/fallback (tests v1.6.6)
  14: ["src/engine/compactor.ts"],                                              // Purga/compactación de memoria
  16: ["src/engine/modelTiers.ts"],                                             // Orquestación multi-modelo (tiers + routing local/cloud)
  19: ["src/utils/formatFixer.ts"],                                             // Mojibake/UTF-8
  21: ["src/engine/aduanaArbol.ts"],                                            // Secretos fuera del árbol (tests v8.0.6)
  23: ["src/engine/syntaxGuard.ts", "server.ts"],                               // «Compilador virtual TS»: esbuild transform por puerto /api/engine/guard (v1.6.32)
  24: ["src/engine/reflejo/consejo.ts"],                                        // Tablas/CSV: herramientas datos.csv-* del consejo
  26: ["src/utils/contextCache.ts"],                                            // Caché de turnos / presupuesto de contexto
  32: ["src/engine/dependenciasProyecto.ts"],                                   // Consistencia de dependencias (tests v1.6.7)
  35: ["src/engine/cerebroReflejo.ts"],                                         // Plantilla de tests (crearPlantilla "test")
  36: ["src/engine/metricasInferencia.ts"],                                     // TPS REAL (D8, v1.6.32)
  37: ["src/engine/formatConverter.ts"],                                        // JSON↔YAML↔TOML↔CSV
  38: ["src/engine/cerebroReflejo.ts"],                                         // env_local en crearPlantilla
  42: ["src/utils/attachmentProcessor.ts"],                                     // RTF (mismo extractor; 19 menciones rtf)
  43: ["src/utils/languageMemory.ts"],                                          // Reglas de memoria de idioma por proyecto
  44: ["src/engine/reflejo/espejos.ts"],                                        // Los 11 espejos/autómatas (ESPEJOS v1)
  45: ["src/engine/superPrompt.ts"],                                            // Prompting por perfil de modelo
  49: ["src/engine/comandoEntrante.ts"],                                        // Aduana de la consola (tests v8.0.4)
  52: ["src/engine/localRAG.ts", "src/engine/knowledgeBase.ts"],                // RAG local (VectorRAGPanel.tsx)
  68: ["src/engine/reflejo/consejo.ts"],                                        // Contraste WCAG real (vis.contraste)
  90: ["src/engine/advancedFeatures.ts"],                                       // Feature flags con botón y requisito medido
  98: ["src/engine/cerebroReflejo.ts"],                                         // Plantilla github_action
};

export interface HabilidadAuditada {
  id: number;
  title: string;
  category: string;
  desc: string;
  estado: EstadoHonesto;
  /** Ficheros que la respaldan (vacío = aspiracional). */
  evidencia: string[];
  /** Por qué quedó aspiracional (para el chat: «no está construida AÚN»). */
  motivo?: string;
  /**
   * v1.16.0 — LENGUAJE OPERATIVO. El comando que la dispara, si lo tiene.
   * Sin esto el modelo sabía QUE la habilidad existe, pero no CÓMO llamarla,
   * y terminaba describiéndosela al usuario en vez de usarla.
   */
  triggerCommand?: string;
}

/**
 * Auditoría pura: una habilidad es ACTIVA solo si tiene evidencia declarada
 * Y el juzgador de ficheros (`existe`) la confirma. Sin inyección de disco:
 * el navegador puede auditar el mapa curado con un `existe` siempre-true
 * (confía en el curado) y el TEST lo audita de verdad contra `fs`.
 */
export function auditarCatalogo(
  existe: (rutaRelativa: string) => boolean,
  lista: Array<{ id: number; title: string; category: string; desc: string; triggerCommand?: string }> = SKILLS_LIST_100
): HabilidadAuditada[] {
  return lista.map((s) => {
    const ev = EVIDENCIAS[s.id] || [];
    const confirmada = ev.length > 0 && ev.every(existe);
    return {
      id: s.id,
      title: s.title,
      category: s.category,
      desc: s.desc,
      estado: confirmada ? ("activa" as const) : ("aspiracional" as const),
      evidencia: confirmada ? ev : [],
      motivo: confirmada ? undefined : "Declarada en el mapa del proyecto; todavía no hay código que la respalde. No la ofrezcas como hecha: di «pendiente».",
      triggerCommand: s.triggerCommand,
    };
  });
}

export function resumenHonesto(auditadas: HabilidadAuditada[]): { activas: number; aspiracionales: number; total: number } {
  const activas = auditadas.filter((a) => a.estado === "activa").length;
  return { activas, aspiracionales: auditadas.length - activas, total: auditadas.length };
}

/**
 * El SKILLS.md que se inyecta al modelo — DOS secciones, nombre verdadero.
 * Antes: 100 bloques «(CerebroNico)» sin distinción. Ahora: las activas con
 * su evidencia, y un encabezado que ordena al modelo no fingir las segundas.
 */
/**
 * v1.16.0 — EL LENGUAJE OPERATIVO DE CADA HABILIDAD ACTIVA.
 * Antes el catálogo solo decía QUE la habilidad existía y qué hace. El modelo
 * leía la descripción, no encontraba cómo llamarla, y terminaba EXPLICANDOLE
 * al usuario la capacidad en vez de usarla — que es justo lo que el pedido de
 * autonomía quiere matar. Cada activa lleva ahora su disparo y su orden de uso.
 */
function lineaDeUso(a: HabilidadAuditada): string {
  const disparo = a.triggerCommand
    ? `se dispara con \`${a.triggerCommand}\``
    : "se aplica sola cuando el pedido cae en su rubro";
  return `- Cómo usarla: ${disparo}; ejecutala sin anunciarla y sin pedir permiso. ` +
    `Si falla, buscá en este mismo catálogo otra habilidad que resuelva el mismo objetivo antes de reportar nada.`;
}

export function skillsMdHonesto(auditadas: HabilidadAuditada[]): string {
  const activas = auditadas.filter((a) => a.estado === "activa");
  const aspi = auditadas.filter((a) => a.estado === "aspiracional");
  const r = resumenHonesto(auditadas);
  const cab = [
    `# SKILLS.md — Catálogo honesto: ${r.activas} verificadas · ${r.aspiracionales} declaradas (no construidas)`,
    "",
    "REGLA PARA EL MODELO: solo las del bloque ACTIVA existen hoy. Las del bloque",
    "MAPA NO SON OFRECIBLES al usuario como capacidades actuales; si te pide una,",
    "di explícitamente que está en el mapa y qué parte sí existe. Nunca inventes",
    "que una aspiracional funciona: el usuario comprueba, y la mentira te delata.",
    "",
    "REGLA DE AUTONOMÍA: cuando el pedido ya fija el destino (una ruta, un archivo",
    "o un resultado esperado), NO preguntes por dónde seguir: elegí el camino andá.",
    "Si uno se corta, tomá otro de este catálogo. Un fallo es un dato, no una razón",
    "para devolverle la tarea al usuario a mitad de camino.",
    "",
  ].join("\n");
  const cuerpoAct = activas
    .map((a) => `### ${a.title} [${a.category}] (activa · evidencia: ${a.evidencia.join(", ")})\n${a.desc}\n${lineaDeUso(a)}\n`)
    .join("\n");
  const cuerpoAspi = aspi.length
    ? "\n\n---\n## MAPA (aspiracional — NO afirmar que existe)\n" +
      aspi.map((a) => `- ${a.title} [${a.category}] — ${a.motivo}`).join("\n") +
      "\n"
    : "";
  return cab + cuerpoAct + cuerpoAspi;
}

/** Versión de una línea, honesta por construcción (para modelos pequeños). */
export function skillsCompactoHonesto(auditadas: HabilidadAuditada[]): string {
  const r = resumenHonesto(auditadas);
  const ej = auditadas
    .filter((a) => a.estado === "activa")
    .slice(0, 12)
    .map((a) => a.title.replace(/^\d+\.\s*/, ""))
    .join(", ");
  return `# SKILLS.md (resumen honesto)
CerebroNico tiene ${r.activas} capacidades VERIFICADAS con evidencia en código (${ej}…) y ${r.aspiracionales} DECLARADAS EN EL MAPA que aún no existen (p. ej. visión/OCR, Wasm, Git nativo, YOLO, JWT RS256, Prettier).
Ofrece solo las primeras. Si preguntan por una del mapa, di que está pendiente. Pide "muéstrame el catálogo de habilidades" para el detalle.`;
}
