/**
 * symbolIndex.ts — ÍNDICE DE SÍMBOLOS DEL PROYECTO (fase 2 del motor)
 * =================================================================
 * Un modelo de 250 MB no puede recordar tu proyecto, y preguntárselo cuesta
 * miles de tokens de ida y vuelta. La solución de motor: extraer las firmas
 * reales de los archivos (funciones, clases, interfaces, tipos, componentes) y
 * guardarlas en la base de conocimiento.
 *
 * Con esto, el modelo recibe una lista VERIFICADA de "qué existe y con qué
 * firma" antes de escribir una sola línea. Efectos medibles:
 *   - deja de inventar nombres de funciones que no existen;
 *   - deja de inventar la firma de las que existen;
 *   - y se ahorra el ciclo "leer archivo entero" → cientos de tokens por turno.
 *
 * Es análisis estático ligero con expresiones regulares, sin dependencias.
 * No es un parser completo: es deliberadamente conservador y solo declara lo
 * que puede verificar.
 */

export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "const"
  | "component"
  | "method"
  | "python-def"
  | "python-class";

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  line: number;
  /** Firma tal cual aparece (recortada), con parámetros si se pueden leer */
  signature: string;
  exported: boolean;
  /** true si el nombre empieza por mayúscula (posible componente React/clase) */
  pascal: boolean;
}

export interface FileSymbols {
  path: string;
  language: string;
  lines: number;
  symbols: SymbolInfo[];
}

export interface SymbolMap {
  files: FileSymbols[];
  /** Número total de símbolos indexados */
  total: number;
  updatedAt: number;
}

const TS_PATTERNS: Array<{ re: RegExp; kind: SymbolKind }> = [
  { re: /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(<[^>]*>)?\s*\(([^)]*)\)/, kind: "function" },
  { re: /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/, kind: "function" },
  { re: /^\s*export\s+class\s+([A-Za-z_$][\w$]*)/, kind: "class" },
  { re: /^\s*class\s+([A-Za-z_$][\w$]*)/, kind: "class" },
  { re: /^\s*export\s+interface\s+([A-Za-z_$][\w$]*)/, kind: "interface" },
  { re: /^\s*interface\s+([A-Za-z_$][\w$]*)/, kind: "interface" },
  { re: /^\s*export\s+type\s+([A-Za-z_$][\w$]*)/, kind: "type" },
  { re: /^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\(([^)]*)\)/, kind: "function" },
  { re: /^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*[:=]/, kind: "const" },
  { re: /^\s*(?:public|private|protected)?\s*(?:async\s+)?([a-z_$][\w$]*)\s*\(([^)]*)\)\s*[:{]/, kind: "method" },
];

const PY_PATTERNS: Array<{ re: RegExp; kind: SymbolKind }> = [
  { re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/, kind: "python-def" },
  { re: /^\s*class\s+([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?\s*:/, kind: "python-class" },
];

const MAX_SYMBOLS_PER_FILE = 120;

function cleanSignature(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  return s.length > 120 ? s.slice(0, 117) + "…" : s;
}

/** Extrae los símbolos de un archivo de código. */
export function indexFileText(path: string, content: string): FileSymbols {
  const text = content || "";
  const language = guessLanguage(path);
  const lines = text.split("\n");
  const symbols: SymbolInfo[] = [];
  const patterns = language === "python" ? PY_PATTERNS : language === "typescript" || language === "tsx" || language === "javascript" || language === "jsx" ? TS_PATTERNS : [];
  // Los métodos solo se indexan en clases medianas: en archivos enormes generan ruido
  const allowMethods = lines.length < 800;

  for (let i = 0; i < lines.length && symbols.length < MAX_SYMBOLS_PER_FILE; i++) {
    const line = lines[i];
    // Se ignoran comentarios y líneas dentro de strings largas por simplicidad
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;

    for (const { re, kind } of patterns) {
      if (kind === "method" && !allowMethods) continue;
      // Los "métodos" solo cuentan con indentación (dentro de una clase/objeto)
      if (kind === "method" && !/^\s{2,}/.test(line)) continue;
      const m = line.match(re);
      if (!m) continue;
      const name = m[1];
      if (!name || name.length < 2) continue;
      if (kind === "method" && RESERVED_WORDS.has(name)) continue;

      const exported = /\bexport\b/.test(line);
      const pascal = /^[A-Z]/.test(name);
      symbols.push({
        name,
        kind: kind === "function" && pascal && (language === "tsx" || language === "jsx") ? "component" : kind,
        line: i + 1,
        signature: cleanSignature(line),
        exported,
        pascal,
      });
      break; // una coincidencia por línea
    }
  }

  return { path, language, lines: lines.length, symbols };
}

const RESERVED_WORDS = new Set(["if", "for", "while", "switch", "catch", "return", "constructor", "function", "typeof", "new", "await", "super", "this"]);

function guessLanguage(path: string): string {
  const ext = (path.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript", py: "python",
  };
  return map[ext] || ext || "text";
}

/** Construye el mapa de símbolos a partir de los archivos del proyecto. */
export function buildSymbolMap(files: Array<{ path: string; content?: string; language?: string }>): SymbolMap {
  const out: FileSymbols[] = [];
  let total = 0;
  for (const f of files.slice(0, 200)) {
    if (!f?.path) continue;
    const fs = indexFileText(f.path, f.content || "");
    total += fs.symbols.length;
    out.push(fs);
  }
  return { files: out, total, updatedAt: Date.now() };
}

export interface SymbolHit {
  file: string;
  symbol: SymbolInfo;
}

/**
 * Busca un símbolo por nombre (exacto primero, luego parcial).
 * Es lo que usa la herramienta `find_symbol`: responde en milisegundos y con
 * ~40 caracteres de contexto, donde un grep devolvería cientos de líneas.
 */
export function findSymbols(map: SymbolMap, query: string, limit = 8): SymbolHit[] {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];
  const exact: SymbolHit[] = [];
  const partial: SymbolHit[] = [];
  for (const file of map.files) {
    for (const symbol of file.symbols) {
      const name = symbol.name.toLowerCase();
      const hit: SymbolHit = { file: file.path, symbol };
      if (name === q) exact.push(hit);
      else if (name.includes(q)) partial.push(hit);
    }
  }
  return [...exact, ...partial].slice(0, limit);
}

/** Resumen de la API del proyecto para el prompt (compacto y verificado). */
export function summarizeSymbols(map: SymbolMap, maxChars = 1200, maxFiles = 12): string {
  if (map.files.length === 0 || map.total === 0) return "";
  const withSymbols = map.files.filter((f) => f.symbols.length > 0).slice(0, maxFiles);
  if (withSymbols.length === 0) return "";
  const lines: string[] = [];
  for (const f of withSymbols) {
    const names = f.symbols.map((s) => `${s.name}${s.kind === "class" || s.kind === "python-class" ? " (clase)" : s.kind === "interface" ? " (interface)" : ""}`).slice(0, 12);
    lines.push(`- ${f.path} [${f.language}, ${f.lines} líneas]: ${names.join(", ")}`);
  }
  let text = `[SÍMBOLOS REALES DEL PROYECTO — usa estos nombres, no inventes otros]\n${lines.join("\n")}`;
  if (text.length > maxChars) text = text.slice(0, maxChars) + " […]";
  return text;
}
