/**
 * compactor.ts — DISCIPLINA DE CONTEXTO DEL MOTOR (fase 2)
 * ======================================================
 * El problema que resuelve, en números: cuando el modelo lee un archivo de 600
 * líneas o ejecuta un comando que escupe 400 líneas de log, TODO eso entra en el
 * contexto del siguiente turno. Con un modelo local diminuto y 8 GB de RAM eso
 * es la diferencia entre responder en 4 s y quedarse colgado: el tiempo de
 * procesar el prompt crece de forma brutal y la ventana del modelo se llena con
 * ruido.
 *
 * El compactador vive en el MOTOR (no en el modelo) y aplica reglas
 * deterministas para conservar lo que de verdad importa:
 *   - código: imports, firmas y estructura del principio + final del archivo;
 *   - comandos: primeras y últimas líneas + TODAS las líneas de error;
 *   - búsquedas: los primeros resultados y el total;
 *   - JSON: estructura y tamaños en vez del volcado completo.
 *
 * Lo elidido se marca explícitamente para que el modelo sepa que falta y pueda
 * pedirlo con read_file_range en lugar de suponer.
 */

export type OutputKind = "file" | "command" | "search" | "json" | "text";

export interface CompactOptions {
  /** Presupuesto de caracteres del resultado compactado */
  budgetChars?: number;
  kind?: OutputKind;
  /** Ruta o comando, para la cabecera del resumen */
  label?: string;
}

export interface CompactResult {
  text: string;
  originalChars: number;
  compactedChars: number;
  savedPct: number;
  strategy: string;
}

const DEFAULT_BUDGET = 2600;

/** Líneas que casi siempre valen la pena en código. */
const KEEP_LINE = /^\s*(?:import|export|from|require|package|using|#include|def |class |function |interface |type |const |let |var |async |@|"""|'''|\/\/\/)/;

/** Patrones de error/aviso que NUNCA se recortan. */
const ERROR_LINE = /(\b(?:error|exception|traceback|fail(?:ed|ure)?|cannot|undefined is not|is not a function|enoent|econnrefused|eaddrinuse|syntaxerror|typeerror|referenceerror|warning|fatal)\b)/i;

function lines(s: string): string[] {
  return s.split("\n");
}

function headTail(arr: string[], head: number, tail: number): { kept: string[]; elided: number } {
  if (arr.length <= head + tail) return { kept: arr, elided: 0 };
  return { kept: [...arr.slice(0, head), ...arr.slice(-tail)], elided: arr.length - head - tail };
}

export function compactToolOutput(input: string, options: CompactOptions = {}): CompactResult {
  const original = input ?? "";
  const budget = Math.max(400, options.budgetChars || DEFAULT_BUDGET);
  const originalChars = original.length;
  const kind = options.kind || detectKind(original, options.label);

  if (originalChars <= budget) {
    return { text: original, originalChars, compactedChars: originalChars, savedPct: 0, strategy: "sin recorte (cabe en el presupuesto)" };
  }

  let out: string[] = [];
  let strategy = "";

  if (kind === "json") {
    const compacted = compactJson(original, budget);
    out = [compacted];
    strategy = "JSON: estructura y tamaños en lugar del volcado completo";
  } else if (kind === "command") {
    const all = lines(original);
    const important = all.filter((l) => ERROR_LINE.test(l)).slice(0, 40);
    const { kept, elided } = headTail(all, 30, 30);
    out = [...kept];
    if (elided > 0) out.splice(30, 0, `[…${elided} línea(s) intermedias omitidas por el motor…]`);
    if (important.length > 0) out.push("[LÍNEAS DE ERROR/AVISO DESTACADAS POR EL MOTOR]", ...important);
    strategy = "comando: principio + final + todas las líneas de error";
  } else if (kind === "search") {
    const all = lines(original).filter((l) => l.trim());
    const keep = Math.max(5, Math.min(all.length, Math.floor(budget / 90)));
    out = [...all.slice(0, keep)];
    if (all.length > keep) out.push(`[…${all.length - keep} resultado(s) más, repite la búsqueda con un filtro más específico…]`);
    strategy = "búsqueda: primeros resultados y recuento";
  } else if (kind === "file") {
    const all = lines(original);
    const keepers = new Set<number>();
    for (let i = 0; i < Math.min(all.length, 120); i++) if (KEEP_LINE.test(all[i])) keepers.add(i);
    const structure = [...keepers].slice(0, 40).map((i) => `${i + 1}: ${all[i].trim().slice(0, 140)}`);
    const { kept } = headTail(all, 25, 25);
    out = [
      `[MOTOR: archivo compactado — ${all.length} líneas, ${originalChars} caracteres]`,
      "[ESTRUCTURA (imports y firmas)]",
      ...structure,
      "[INICIO]",
      ...kept.slice(0, 25).map((l, i) => `${i + 1}: ${l.slice(0, 200)}`),
      `[…${Math.max(0, all.length - 50)} línea(s) centrales omitidas: pídelas con read_file_range si las necesitas…]`,
      "[FINAL]",
      ...kept.slice(-25).map((l, i) => `${all.length - 25 + i + 1}: ${l.slice(0, 200)}`),
    ];
    strategy = "archivo: estructura (imports/firmas) + inicio + final";
  } else {
    const all = lines(original);
    const { kept, elided } = headTail(all, 20, 20);
    out = elided > 0 ? [...kept.slice(0, 20), `[…${elided} línea(s) omitidas…]`, ...kept.slice(-20)] : kept;
    strategy = "texto: principio y final";
  }

  let text = out.join("\n");
  if (text.length > budget) text = text.slice(0, budget) + "\n[…recortado por el motor: pide el resto por partes…]";
  const compactedChars = text.length;

  return {
    text: `${options.label ? `${options.label}\n` : ""}${text}`,
    originalChars,
    compactedChars,
    savedPct: Math.round(((originalChars - compactedChars) / originalChars) * 100),
    strategy,
  };
}

/** Detecta el tipo de salida para elegir la estrategia. */
export function detectKind(text: string, label?: string): OutputKind {
  const l = (label || "").toLowerCase();
  if (/%PDF|\.md\b/.test(l)) return "text";
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      /* no es JSON válido: seguimos */
    }
  }
  if (/^[^\n]*:\d+:/.test(trimmed)) return "search";
  if (/(error|exception|traceback|\$ |npm |node |python |git )/.test(trimmed.slice(0, 400))) return "command";
  if (/^\s*(import|export|from|def |class |function |#include|\/\*)/m.test(trimmed)) return "file";
  return "text";
}

/** Resumen estructural de un JSON grande: claves, tipos y longitudes. */
function compactJson(text: string, budget: number): string {
  try {
    const data = JSON.parse(text);
    const summary = describe(data, 0, Math.min(budget - 200, 1200));
    return `[MOTOR: JSON compactado]\n${summary}`;
  } catch {
    return text.slice(0, budget) + "\n[…JSON no válido: recortado…]";
  }
}

function describe(value: any, depth: number, budget: number, key = ""): string {
  const indent = "  ".repeat(depth);
  if (budget <= 0) return `${indent}${key}…`;
  if (value === null) return `${indent}${key}: null`;
  if (Array.isArray(value)) {
    const head = value.slice(0, 3).map((v) => describe(v, depth + 1, Math.floor(budget / 4)));
    return `${indent}${key}: array[${value.length}]${head.length ? "\n" + head.join("\n") : ""}${value.length > 3 ? `\n${indent}  …${value.length - 3} más` : ""}`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).slice(0, 12);
    const rows = keys.map((k) => describe(value[k], depth + 1, Math.floor(budget / Math.max(1, keys.length)), k + ": "));
    const extra = Object.keys(value).length > keys.length ? `\n${indent}  …${Object.keys(value).length - keys.length} claves más` : "";
    return `${indent}${key}{${Object.keys(value).length} claves}\n${rows.join("\n")}${extra}`;
  }
  const s = String(value);
  return `${indent}${key}${typeof value} = ${s.length > 80 ? s.slice(0, 77) + "…" : s}`;
}

/**
 * Compacta el resultado de una herramienta antes de devolverlo al modelo.
 * Si el resultado es un error de validación o de ejecución, NO se compacta:
 * el modelo necesita el mensaje completo para corregir.
 */
export function compactToolResult(toolName: string, output: string, isError: boolean): { output: string; note?: string } {
  if (isError) return { output };
  const kindByTool: Record<string, OutputKind> = {
    read_file: "file",
    read_file_range: "file",
    list_files: "text",
    search_in_files: "search",
    run_command: "command",
    run_tests: "command",
    fetch_url: "file",
    git_diff: "command",
    git_status: "text",
    pc_read_file: "file",
    pc_exec: "command",
  };
  const kind = kindByTool[toolName] || "text";
  const result = compactToolOutput(output, { kind, label: `[resultado de ${toolName} · ${output.length} caracteres originales]` });
  if (result.compactedChars >= result.originalChars) return { output: result.text };
  return { output: result.text, note: `motor: ${result.strategy} (ahorro ${result.savedPct}%)` };
}
