/**
 * knowledgeBase.ts — BASE DE DATOS DEL MOTOR (v2.0)
 * ================================================
 * La idea que pediste, y es la correcta: **el conocimiento no debe vivir en el
 * modelo, debe vivir en el motor**. Un modelo de 400 MB no puede "saber" tu
 * proyecto, tus errores ni las reglas de sintaxis; pero el motor sí puede
 * saberlo y servirle a cada turno exactamente el trozo que necesita.
 *
 * Ventajas medibles:
 *   - Un modelo micro responde con precisión de modelo grande en dominios
 *     concretos (errores conocidos, patrones, reglas del proyecto) porque el
 *     contexto se lo da el motor, no su memoria.
 *   - Cambiar de "conductor" (Ollama, GLM, Gemini, OpenRouter) no cambia el
 *     resultado: el motor es el mismo. Eso es "el conductor puede ser cualquier
 *     flacucho".
 *   - Todo es determinista y auditable: cada entrada tiene id, tabla y etiquetas.
 *
 * Diseño:
 *   - `KnowledgeBase`: tabla plana de entradas puntuadas. Sin embeddings (no
 *     hacen falta y costarían RAM/latencia en 8 GB): recuperación por solape de
 *     palabras clave + peso + tabla.
 *   - Persistencia: el motor la guarda en `.cerebro-db/kb.json` (servidor). El
 *     cliente la consulta por HTTP; el módulo es puro para poder compartirse.
 *   - `buildEngineContext()` produce el bloque compacto que se inyecta en el
 *     prompt. Presupuesto de caracteres: en local, cada línea cuenta.
 */

// v2.0 — Los manuales del motor (leyes + uso de cada herramienta + procedimientos)
// se cargan junto a la semilla: el "cómo se usa esto" viaja en el motor.
import { MANUAL_ENTRIES } from "./manuals";

// v8.0.1 — PACK DE CÓDIGO: la ampliación de la base de datos pedida por el
// usuario («los modelos cometen errores en los códigos, amplía su base de datos
// en el motor»). Todo lo que sabe ese pack está verificado contra este
// repositorio: versiones reales de node_modules, opciones reales de
// tsconfig.json, la guarda de vite.config.ts y defectos ya documentados en el
// propio código. Nada de manual genérico.
import { KB_CODIGO } from "./kbCodigo";

// v0.9.1 — CONOCIMIENTO DEL PROPIO MOTOR. Pedido del usuario: «agranda su base de
// datos en general + conocimiento e inteligencia en la estructura de su motor».
// El pack anterior sabía mucho de código ajeno y casi nada de cómo está montado
// este motor; la consecuencia se vio entera en una sesión: el modelo no podía
// razonar sobre puertos, raíces ni flujos, y por eso confundía `.proyectos` con la
// raíz del servidor o creaba un `index.js` dentro de una carpeta `"type": "module"`.
import { KB_MOTOR } from "./kbMotor";

// v2.1 — Faltaba «manual». `manuals.ts` lleva desde siempre insertando sus ~20
// entradas con `table: "manual"`, una categoría deliberada y etiquetada a mano
// («core», «pc»). La tabla existía en los datos y no en el tipo, así que el
// comprobador la marcaba como error aunque en tiempo de ejecución funcionase.
export type KbTable = "syntax" | "error" | "pattern" | "tool" | "skill" | "rule" | "project" | "lesson" | "manual";

export interface KbEntry {
  id: string;
  table: KbTable;
  title: string;
  body: string;
  /** Palabras clave para la recuperación */
  keys: string[];
  lang?: string;
  /** 0..1 — importancia base (las reglas del motor mandan sobre lo demás) */
  weight?: number;
  updatedAt?: number;
  /**
   * v2.1 — Etiquetas libres de la entrada. `manuals.ts` las pasaba desde siempre
   * («core», «pc») y el campo NO existía en el tipo, así que se descartaban sin
   * que nadie se enterara: el objeto se construía con ellas y el tipo las
   * ignoraba. Se declaran para que lo que se escribe se guarde de verdad.
   * Hoy no puntúan en la búsqueda (eso lo hacen `keys`, `title` y `weight`).
   */
  tags?: string[];
}

export interface KbHit {
  entry: KbEntry;
  score: number;
}

/**
 * Prioridad por tabla al puntuar (una regla del motor pesa más que un patrón).
 *
 * v2.1 — Es `Partial` A PROPÓSITO: no todas las tablas tienen prioridad propia y
 * la puntuación ya trae un valor por defecto para las que no la tienen
 * (`TABLE_PRIORITY[entry.table] ?? 0.5`, más abajo). Al declararlo como
 * `Record<KbTable, number>` se obligaba a que TODAS estuvieran, y la tabla
 * `manual` no está: sus entradas se puntúan con 0.5, por debajo de todas las
 * demás categorías (la más baja es `lesson`, 0.6).
 *
 * Eso NO se ha cambiado aquí: darle a los manuales una prioridad mayor alteraría
 * qué conocimiento entra en el contexto del modelo, y esa es una decisión de
 * producto, no de limpieza. Queda anotado en el RECORDATORIUM.
 */
const TABLE_PRIORITY: Partial<Record<KbTable, number>> = {
  rule: 1.0,
  syntax: 0.92,
  error: 0.9,
  tool: 0.85,
  project: 0.8,
  skill: 0.7,
  pattern: 0.65,
  lesson: 0.6,
};

export function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s._/-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[._/-]+|[._/-]+$/g, ""))
    .filter((w) => w.length > 2);
}

// ============================================================
// Semilla: lo que el motor sabe de fábrica
// ============================================================
export const KB_SEED: KbEntry[] = [
  // ---------- REGLAS DEL MOTOR ----------
  { id: "rule-no-placeholders", table: "rule", title: "Nunca dejar marcadores", weight: 1, keys: ["placeholder", "omitido", "resto", "etc", "todo", "truncado"], body: "Prohibido entregar código con marcadores («…», «resto del código», TODO). El motor rechaza la escritura si los detecta." },
  { id: "rule-verify", table: "rule", title: "Verificar antes de decir terminado", weight: 1, keys: ["verificar", "test", "run", "comprobar", "terminado"], body: "Tras escribir código, ejecútalo o pásale pruebas (run_tests/run_command). Si no se puede ejecutar, dilo explícitamente." },
  { id: "rule-edit-first", table: "rule", title: "Editar antes que reescribir", weight: 1, keys: ["editar", "edit_file", "write_file", "reescribir", "rendimiento"], body: "Para cambios pequeños usa edit_file (buscar/reemplazar). Reescribir un archivo entero cuesta miles de tokens y es la causa principal de lentitud con modelos locales." },
  { id: "rule-destructive", table: "rule", title: "Destructivo solo si lo piden", weight: 1, keys: ["borrar", "delete", "destructivo", "confirmar"], body: "delete_file/pc_delete y comandos que borran datos solo se ejecutan si el usuario lo pidió de forma explícita." },

  // ---------- SINTAXIS ----------
  { id: "syn-json", table: "syntax", lang: "json", title: "Reglas de JSON", weight: 0.95, keys: ["json", "llaves", "comillas", "coma", "parse"], body: "Comillas dobles siempre, sin coma final y sin comentarios. El motor valida con JSON.parse y rechaza el archivo si falla." },
  { id: "syn-tsx", table: "syntax", lang: "tsx", title: "Reglas de TSX/JSX", weight: 0.95, keys: ["jsx", "tsx", "react", "etiqueta", "componente", "return"], body: "Todo componente devuelve un único nodo raíz. Los atributos usan className (no class). Cada <Tag> necesita su </Tag> o ser autocerrado <Tag />. Las llaves {…} dentro del JSX deben cerrarse." },
  { id: "syn-ts", table: "syntax", lang: "typescript", title: "Reglas de TypeScript", weight: 0.9, keys: ["typescript", "tipo", "interface", "import", "any"], body: "Declara tipos de los parámetros y del retorno en funciones exportadas. Importa solo lo que usas (los imports rotos rompen el build). Evita `any` en la API pública." },
  { id: "syn-html", table: "syntax", lang: "html", title: "Reglas de HTML", weight: 0.9, keys: ["html", "etiqueta", "div", "head", "body", "doctype"], body: "Estructura mínima: <!doctype html>, <html lang>, <head> con <meta charset> y <title>, <body> con contenido. Cierra todas las etiquetas pareadas. El CSS va en <style> o en archivo aparte, nunca suelto." },
  { id: "syn-css", table: "syntax", lang: "css", title: "Reglas de CSS", weight: 0.85, keys: ["css", "llave", "selector", "flex", "grid", "responsive"], body: "Cada selector con su par de llaves y punto y coma tras cada declaración. Para responsive usa @media (max-width: …) y unidades relativas (fr, %, rem)." },
  { id: "syn-py", table: "syntax", lang: "python", title: "Reglas de Python", weight: 0.9, keys: ["python", "indentacion", "def", "import", "tabulador"], body: "Indentación de 4 espacios (nunca tabuladores mezclados), ':' al final de def/if/for/while/class y contexto en el mismo bloque de indentación." },
  { id: "syn-truncation", table: "syntax", title: "Cortes por falta de contexto", weight: 0.9, keys: ["truncado", "cortado", "mitad", "contexto", "corto", "no termina"], body: "Si el archivo es largo, el motor te pide por partes: escribe primero la estructura y luego completa con edit_file. Nunca entregues un archivo cortado a la mitad." },

  // ---------- ERRORES FRECUENTES → ARREGLO ----------
  { id: "err-enoent", table: "error", title: "ENOENT / no such file", keys: ["enoent", "no existe", "not found", "ruta", "archivo"], body: "El archivo no existe en esa ruta. Usa list_files o search_in_files para ver la ruta real antes de leer/escribir; no inventes nombres." },
  { id: "err-module", table: "error", title: "Cannot find module", keys: ["cannot find module", "import", "modulo", "dependencia"], body: "Falta el paquete o la ruta del import es incorrecta. Comprueba package.json con read_file; si falta, instálalo con run_command (npm install <pkg>) en lugar de inventar el import." },
  { id: "err-port", table: "error", title: "EADDRINUSE (puerto ocupado)", keys: ["eaddrinuse", "puerto", "ocupado", "3000", "3500", "5000"], body: "El puerto ya está en uso: otro proceso lo ocupa. Mata el proceso anterior o cambia de puerto; no reinicies en bucle." },
  { id: "err-econnrefused", table: "error", title: "ECONNREFUSED", keys: ["econnrefused", "conexion", "rechazada", "ollama", "11434", "sandbox"], body: "El servicio destino no está escuchando. Ollama → arranca `ollama serve`. Sandbox → pulsa Sync. Puente PC → ejecuta el puente Python. No reintentes sin arrancarlo." },
  { id: "err-json", table: "error", title: "Unexpected token in JSON", keys: ["unexpected token", "json", "parse", "syntaxerror"], body: "JSON mal formado: normalmente una coma final, comillas simples o un comentario. Corrige y valida antes de volver a guardar." },
  { id: "err-oom", table: "error", title: "Out of memory / swap", keys: ["out of memory", "ram", "memoria", "swap", "lento", "colgado"], body: "Con 8 GB, un modelo de más de 3 GB o un contexto >8192 fuerzan swap y la respuesta parece colgada. Baja num_ctx, usa un modelo micro o cierra el navegador." },
  { id: "err-timeout-model", table: "error", title: "El modelo no responde", keys: ["timeout", "no responde", "colgado", "inferencia", "lento"], body: "El primer mensaje carga el modelo desde disco: precalienta con el botón «Precalentar» o espera ese primer turno. Si sigue sin responder, reduce contexto (menos historial y archivos) y baja num_predict." },

  // ---------- PATRONES ÚTILES ----------
  { id: "pat-fetch", table: "pattern", title: "Petición HTTP con manejo de errores", keys: ["fetch", "api", "http", "async", "await", "json"], body: "Comprueba response.ok antes de leer el JSON, envuelve en try/catch y muestra un mensaje claro al usuario; nunca dejes la promesa sin manejar." },
  { id: "pat-react-comp", table: "pattern", lang: "tsx", title: "Componente React tipado", keys: ["componente", "react", "props", "estado", "usestate"], body: "Define una interface de props, usa useState tipado y un solo nodo raíz. Los efectos declaran sus dependencias completas." },
  { id: "pat-express", table: "pattern", title: "Ruta Express con validación", keys: ["express", "ruta", "endpoint", "post", "get", "servidor"], body: "Valida el cuerpo de la petición antes de usarlo, devuelve códigos correctos (400/404/500) y responde siempre (nunca dejes la petición sin respuesta)." },
  { id: "pat-sandbox-preview", table: "pattern", title: "Preview en el sandbox", keys: ["sandbox", "preview", "iframe", "3500", "editor web"], body: "El preview vive en :3500 y sirve lo que hay en el proyecto. Si el panel se ve en blanco: comprueba que el archivo sea un .html completo (doctype + head + body) en la raíz del proyecto." },
  { id: "pat-ollama", table: "pattern", title: "Llamada a Ollama con opciones de rendimiento", keys: ["ollama", "chat", "stream", "num_ctx", "keep_alive"], body: "Envía siempre keep_alive (evita recargar el modelo), num_ctx acorde al modelo (2048-4096 en micro) y num_predict limitado. El streaming debe reenviar cada fragmento sin acumularlo." },

  // ---------- HERRAMIENTAS (contexto blindado) ----------
  { id: "tool-edit", table: "tool", title: "edit_file — cuándo y cómo", keys: ["edit_file", "reemplazar", "find", "replace"], body: "El texto de «find» debe ser único en el archivo (el motor rechaza si aparece 0 o más de 1 vez) e incluir suficiente contexto para serlo. Ahorra miles de tokens frente a write_file." },
  { id: "tool-range", table: "tool", title: "read_file_range — leer sin gastar", keys: ["read_file_range", "leer", "lineas", "rango"], body: "Usa rangos (start/end) para archivos largos: devuelve las líneas numeradas y evita llenar el contexto con todo el archivo." },
  { id: "tool-search", table: "tool", title: "search_in_files — orientarse rápido", keys: ["search_in_files", "buscar", "grep", "texto", "donde"], body: "Antes de tocar código ajeno, busca la función o el texto y mira sus usos. Devuelve ruta:línea y cuesta muy pocos tokens." },
  { id: "tool-git", table: "tool", title: "git_commit — punto de retorno", keys: ["git", "commit", "restaurar", "respaldo", "antes de"], body: "Antes de un cambio grande o de una refactorización, guarda un punto con git_commit. Así cualquier error posterior es reversible." },
  { id: "tool-fetch-url", table: "tool", title: "fetch_url — documentación real", keys: ["fetch_url", "url", "documentacion", "api", "internet"], body: "Para dudas de API, consulta la documentación real con fetch_url en vez de responder de memoria. Está limitada a URLs públicas (bloquea direcciones internas)." },

  // ---------- HABILIDADES DEL MOTOR ----------
  { id: "skill-tabs", table: "skill", title: "Pestañas centrales", keys: ["pestana", "tab", "extension", "panel", "chat"], body: "El Chat es una pestaña; las extensiones y el editor web se abren al lado. El motor mantiene el estado de cada pestaña." },
  { id: "skill-extensions", table: "skill", title: "Extensiones con permisos", keys: ["extension", "plugin", "manifest", "permiso", "herramienta"], body: "Cada extensión declara permisos en manifest.json; el motor los comprueba de su lado. Sus herramientas solo se ofrecen al modelo si la pestaña está abierta." },
  { id: "skill-autolearn", table: "skill", title: "Autosuperación", keys: ["leccion", "aprender", "autosuperacion", "metrica", "mejora"], body: "El motor aprende de cada turno: mide latencia y errores, y guarda lecciones que se inyectan en prompts futuros parecidos." },
  { id: "skill-favorites", table: "skill", title: "Carpeta de modelos favoritos", keys: ["favorito", "modelo", "gratis", "catalogo", "cuota"], body: "El motor mantiene un catálogo de modelos gratuitos con su tipo de cuota y los aplica con un clic; el conductor se puede cambiar en caliente." },
];

// ============================================================
// Recuperación
// ============================================================
/**
 * v8.0.1 — LA SEMILLA, EN UN SOLO SITIO.
 *
 * Antes había dos listas distintas: el constructor cargaba
 * `[...KB_SEED, ...MANUAL_ENTRIES]` y `fromJSON` sólo re-sembraba `KB_SEED`.
 * Consecuencia real, y del tipo que no se nota hasta que duele: al recargar la
 * base desde disco (que es el camino normal en el servidor), las entradas de
 * los MANUALES desaparecían si no se habían guardado antes. Dos listas para la
 * misma semilla es exactamente el defecto que la regla de fuente única existe
 * para evitar, esta vez dentro del motor de conocimiento.
 *
 * Ahora una constante, usada por los dos caminos. Y el pack de código entra
 * aquí, así que también sobrevive a la recarga.
 */
export const SEMILLA_COMPLETA: KbEntry[] = [
  ...KB_SEED,
  ...MANUAL_ENTRIES,
  ...KB_CODIGO,
  // v0.9.1 — Y el conocimiento del propio motor, que es el que faltaba.
  ...KB_MOTOR,
];

export class KnowledgeBase {
  private entries: Map<string, KbEntry> = new Map();

  /**
   * v2.0 — Además de la semilla base se cargan los MANUALES DEL MOTOR
   * (src/engine/manuals.ts): leyes, manual de cada herramienta y procedimientos.
   * Así el "cómo se usa esto" viaja en el motor y no depende del modelo.
   * v8.0.1 — Y el PACK DE CÓDIGO (src/engine/kbCodigo.ts): los errores de
   * código que este stack produce de verdad. Ver `SEMILLA_COMPLETA`.
   */
  constructor(seed: KbEntry[] = SEMILLA_COMPLETA) {
    for (const e of seed) this.upsert(e);
  }

  upsert(entry: KbEntry): void {
    if (!entry?.id) return;
    this.entries.set(entry.id, { ...entry, updatedAt: Date.now() });
  }

  /** Aprendizaje del motor: convierte una lección en entrada consultable. */
  learnFromLesson(id: string, text: string, tags: string[] = []): void {
    this.upsert({
      id: `lesson:${id}`,
      table: "lesson",
      title: text.slice(0, 60),
      body: text,
      keys: [...new Set([...tokenize(text).slice(0, 14), ...tags])],
      weight: 0.6,
    });
  }

  /** Añade/actualiza el mapa del proyecto (archivos y símbolos). */
  setProjectFiles(files: Array<{ path: string; language?: string }>): void {
    const body = files.slice(0, 60).map((f) => `- ${f.path}${f.language ? ` (${f.language})` : ""}`).join("\n");
    this.upsert({
      id: "project:map",
      table: "project",
      title: "Mapa del proyecto",
      body: body || "(sin archivos todavía)",
      keys: ["proyecto", "archivos", "estructura", "mapa", ...files.slice(0, 20).map((f) => f.path.toLowerCase())],
      weight: 0.8,
    });
  }

  size(): number {
    return this.entries.size;
  }

  stats(): Array<{ table: KbTable; count: number }> {
    const counts = new Map<KbTable, number>();
    for (const e of this.entries.values()) counts.set(e.table, (counts.get(e.table) || 0) + 1);
    return [...counts.entries()].map(([table, count]) => ({ table, count })).sort((a, b) => b.count - a.count);
  }

  all(): KbEntry[] {
    return [...this.entries.values()];
  }

  /**
   * Búsqueda determinista (sin embeddings: no hacen falta y costarían RAM).
   * Puntuación = solape con keys/título + prioridad de tabla + peso declarado.
   */
  // v1.0.0 — El límite por defecto sube de 5 a 25 (x5) para acompañar al
  // presupuesto de contexto. Ver la nota de `buildEngineContext`.
  query(text: string, limit = 25): KbHit[] {
    const words = new Set(tokenize(text));
    if (words.size === 0) return [];
    const hits: KbHit[] = [];

    for (const entry of this.entries.values()) {
      let score = 0;
      for (const key of entry.keys) {
        const k = key.toLowerCase();
        if (words.has(k)) score += 2.2;
        else if (k.length > 4) {
          for (const w of words) {
            if (w.length > 4 && (w.includes(k) || k.includes(w))) { score += 1.0; break; }
          }
        }
      }
      const titleTokens = tokenize(entry.title);
      for (const t of titleTokens) if (words.has(t)) score += 0.8;
      if (score === 0) continue;

      score += TABLE_PRIORITY[entry.table] ?? 0.5;
      score += (entry.weight ?? 0.5) * 0.6;
      // Las tablas siempre-útiles aparecen aunque el solape sea bajo
      if (entry.table === "rule") score += 0.7;
      hits.push({ entry, score: Math.round(score * 100) / 100 });
    }

    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  toJSON(): string {
    return JSON.stringify({ version: 2, entries: this.all() }, null, 2);
  }

  static fromJSON(json: string): KnowledgeBase {
    const kb = new KnowledgeBase([]);
    try {
      const data = JSON.parse(json);
      const list: KbEntry[] = Array.isArray(data?.entries) ? data.entries : [];
      for (const e of list) if (e?.id) kb.entries.set(e.id, e);
      // La semilla rellena lo que falte sin pisar lo aprendido.
      // v8.0.1 — Se usa SEMILLA_COMPLETA (antes sólo KB_SEED, y por eso los
      // manuales y el pack de código no volvían al recargar desde disco).
      for (const e of SEMILLA_COMPLETA) if (!kb.entries.has(e.id)) kb.entries.set(e.id, e);
    } catch {
      return new KnowledgeBase();
    }
    return kb;
  }
}

/**
 * Bloque compacto para inyectar en el prompt. El motor entrega DATOS, no
 * párrafos: cada línea es una instrucción accionable.
 */
/**
 * v1.0.0 — EL CONTEXTO DEL MOTOR, x5 (pedido: «evoluciona x5 su contexto de
 * lenguaje en conocimiento, habilidades y herramientas»).
 *
 *   · entradas recuperadas: 5 → 25  (5×)
 *   · presupuesto de caracteres: 1.100 → 5.500  (5×)
 *
 * POR QUÉ ES UNA DECISIÓN Y NO UN NÚMERO MÁS: cada carácter de aquí viaja en
 * TODAS las llamadas al modelo. Multiplicar por cinco el conocimiento inyectado
 * multiplica por cinco su coste en tokens y, en modelos locales pequeños, el
 * tiempo de respuesta — que es exactamente lo contrario de lo que se pide cuando
 * también se pide RENDIMIENTO. Se sube igual porque el usuario lo ha pedido de
 * forma explícita y porque, de las dos formas de fallar, quedarse corto de
 * contexto produce errores graves (el modelo inventa lo que no sabe), mientras
 * que pasarse produce lentitud — que se nota y se puede bajar.
 *
 * El corte por presupuesto se conserva, así que la subida tiene techo: si las 25
 * entradas no caben, se recortan y queda el aviso «[…]» al final.
 */
export function buildEngineContext(kb: KnowledgeBase, userText: string, limit = 25, budgetChars = 5500): string {
  const hits = kb.query(userText, limit);
  if (hits.length === 0) return "";
  const lines = hits.map((h) => `- [${h.entry.table}] ${h.entry.title}: ${h.entry.body}`);
  let text = `[CONOCIMIENTO DEL MOTOR — datos verificados, úsalos tal cual]\n${lines.join("\n")}`;
  if (text.length > budgetChars) text = text.slice(0, budgetChars) + " […]";
  return text;
}

// ============================================================
// Blindaje del CONTEXTO de herramientas
// ============================================================
export interface ToolArgIssue {
  field: string;
  message: string;
}

export interface ToolSchema {
  name: string;
  parameters: { type: "object"; properties: Record<string, any>; required?: string[] };
}

/**
 * Valida los argumentos de una llamada ANTES de ejecutarla.
 * Los modelos pequeños se inventan campos, tipos y nombres: sin esta capa, el
 * motor ejecutaría basura (o peor, un borrado con el campo equivocado).
 */
export function validateToolCall(schema: ToolSchema, args: any): { ok: boolean; issues: ToolArgIssue[]; sanitized: Record<string, any> } {
  const issues: ToolArgIssue[] = [];
  const sanitized: Record<string, any> = {};
  const props = schema.parameters?.properties || {};
  const required = schema.parameters?.required || [];

  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, issues: [{ field: "*", message: "Los argumentos deben ser un objeto JSON." }], sanitized: {} };
  }

  for (const field of required) {
    const v = args[field];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
      issues.push({ field, message: `Falta el campo obligatorio "${field}".` });
    }
  }

  for (const [field, value] of Object.entries(args)) {
    const spec = props[field];
    if (!spec) {
      // Campo inventado: se descarta y se avisa (no se ejecuta a ciegas)
      issues.push({ field, message: `El campo "${field}" no existe en esta herramienta y se ha ignorado.` });
      continue;
    }
    const type = spec.type;
    if (type === "string" && typeof value !== "string") {
      issues.push({ field, message: `"${field}" debe ser texto.` });
      continue;
    }
    if (type === "number" && typeof value !== "number") {
      const n = Number(value);
      if (Number.isFinite(n) && String(value).trim() !== "") sanitized[field] = n;
      else issues.push({ field, message: `"${field}" debe ser un número.` });
      continue;
    }
    if (type === "array" && !Array.isArray(value)) {
      issues.push({ field, message: `"${field}" debe ser una lista.` });
      continue;
    }
    if (type === "boolean" && typeof value !== "boolean") {
      const b = value === "true" ? true : value === "false" ? false : null;
      if (b === null) issues.push({ field, message: `"${field}" debe ser true o false.` });
      else sanitized[field] = b;
      continue;
    }
    // Enum declarado en el esquema
    if (Array.isArray(spec.enum) && !spec.enum.includes(value)) {
      issues.push({ field, message: `"${field}" debe ser uno de: ${spec.enum.join(", ")}.` });
      continue;
    }
    sanitized[field] = value;
  }

  const blocking = issues.filter((i) => !i.message.includes("se ha ignorado"));
  return { ok: blocking.length === 0, issues, sanitized };
}
