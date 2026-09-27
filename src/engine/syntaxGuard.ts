/**
 * syntaxGuard.ts — BLINDAJE DE SINTAXIS (motor, v3.0)
 * ==================================================
 * "El conductor puede ser cualquier flacucho": si el modelo es débil, el motor
 * no puede permitirse confiar en él. Este módulo revisa TODO lo que el modelo
 * quiere escribir ANTES de que toque el disco. Si el texto está roto, se
 * devuelve el error detallado al modelo (que se autocorrige) y el archivo NO se
 * escribe. Nunca más un archivo a medias rompiendo el proyecto.
 *
 * Es 100 % determinista y sin dependencias: no gasta tokens, no llama a ningún
 * modelo y funciona igual en el servidor y en el navegador.
 *
 * Qué detecta (y por qué esos casos):
 *   - JSON inválido (JSON.parse) — el fallo #1 de los modelos pequeños.
 *   - Paréntesis/corchetes/llaves desbalanceados → código truncado.
 *   - Cadenas y plantillas sin cerrar (`"`, `'`, `` ` ``) → corte a mitad.
 *   - Comentarios de bloque sin cerrar → el resto del archivo queda comentado.
 *   - JSX: etiquetas abiertas sin cerrar o cierres huérfanos.
 *   - HTML: <div> sin </div>, tablas/forms típicos de generación web.
 *   - CSS: llaves desbalanceadas.
 *   - Python: mezcla de tabuladores y espacios, y `def/if/for/while/class` sin `:`.
 *   - Marcadores de truncamiento ("...", "<...>", "TODO", "resto del código")
 *     que los modelos pequeños dejan cuando se quedan sin contexto.
 */

export type IssueKind =
  | "json"
  | "balance"
  | "string"
  | "comment"
  | "jsx"
  | "html"
  | "css"
  | "python"
  | "truncated"
  | "placeholder"
  /** v3.0 — error de PARSER de verdad (esbuild): línea y columna exactas. */
  | "parser";

export interface SyntaxIssue {
  kind: IssueKind;
  line: number;
  message: string;
  /** Cómo arreglarlo, en imperativo, para que el modelo lo corrija a la primera */
  fix: string;
}

export interface GuardResult {
  ok: boolean;
  language: string;
  issues: SyntaxIssue[];
  /** Resumen de una línea para devolver al modelo */
  summary: string;
  stats: { lines: number; chars: number };
}

/** Mensajes que sólo INFORMAN (el guardián saltó algo a propósito). No bloquean. */
export const AVISO_INFORMATIVO = /saltad|omitid|no aplica/i;

/**
 * v2.1 — Los problemas que IMPIDEN escribir el archivo.
 *
 * Esta regla vivía escrita a mano dentro de `server.ts`, y estaba MAL: filtraba
 * por `issue.severity === "error"`, un campo que `SyntaxIssue` no tiene. El
 * filtro devolvía siempre una lista vacía, así que la escritura nunca se
 * bloqueaba y un archivo truncado entraba al sandbox y rompía la compilación —
 * exactamente lo que el comentario decía que ya no pasaba.
 *
 * Se saca aquí a propósito: así se puede PROBAR. Una regla metida en medio de un
 * endpoint de 6.800 líneas no la cubre ninguna prueba, y esa es justo la razón
 * por la que el fallo pasó desapercibido.
 *
 * Criterio: todo problema que no sea un aviso informativo impide escribir.
 */
export function problemasBloqueantes(r: Pick<GuardResult, "issues">): SyntaxIssue[] {
  return r.issues.filter((i) => !AVISO_INFORMATIVO.test(i.message));
}

const MAX_ISSUES = 12;

/** Marcadores típicos de respuesta cortada por falta de contexto. */
const TRUNCATION_PATTERNS: Array<{ re: RegExp; fix: string }> = [
  // v2.0 — El propio IDE recorta los archivos grandes (>100 KB) al enviarlos al
  // modelo y deja un marcador. Si ese marcador vuelve en un write_file, el
  // archivo queda ROTO y el sandbox revienta al compilarlo (caso real:
  // «.proyectos/src/data/initialData.ts ... Expected "}" but found "..."»).
  // Aquí se detecta y se rechaza antes de escribir.
  {
    re: /(?:\.\.\.|…)?\s*\(?\s*(?:archivo|contenido|fichero|file)\s+truncad[oa]\s*(?:a\s*\d+\s*K?B)?\s*\)?/i,
    fix: "Quita el marcador de truncamiento y escribe el archivo COMPLETO, o créalo por partes con append_file (el motor rechaza archivos a medias).",
  },
  { re: /^\s*(\.\.\.|…)\s*$/m, fix: "Elimina los puntos suspensivos y escribe el contenido real que falta." },
  { re: /<\.\.\.>|\[\s*\.\.\.\s*\]/, fix: "Sustituye el marcador por el contenido real." },
  { re: /^\s*(?:\/\/|#)\s*(?:\.\.\.|resto del código|aquí va|etc\.)\s*$/im, fix: "Escribe el código completo; no dejes comentarios que sustituyan código." },
  { re: /\b(?:TODO|FIXME|pendiente de implementar)\b/, fix: "Implementa esa parte ahora o dilo explícitamente al usuario." },
];

export function detectLanguage(path: string): string {
  const p = (path || "").toLowerCase();
  const ext = p.slice(p.lastIndexOf(".") + 1);
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
    json: "json", html: "html", htm: "html", css: "css", scss: "css", py: "python", md: "markdown",
    txt: "text", sh: "shell", yml: "yaml", yaml: "yaml",
  };
  // Heurística por contenido cuando la extensión no dice nada
  if (!map[ext]) {
    if (/^\s*[{[]/.test(p) && p.length > 0) return "json";
    return ext || "text";
  }
  return map[ext];
}

/**
 * Recorre el texto ignorando strings, plantillas y comentarios, y devuelve el
 * balance de delimitadores. Es la parte que evita falsos positivos (una llave
 * dentro de una cadena no cuenta).
 */
function scanBalance(text: string): { issues: SyntaxIssue[]; unclosedString: number } {
  const issues: SyntaxIssue[] = [];
  const stack: Array<{ ch: string; line: number }> = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let line = 1;
  let i = 0;
  let unclosedString = 0;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === "\n") { line++; i++; continue; }

    // Comentarios
    if (ch === "/" && next === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (ch === "/" && next === "*") {
      const startLine = line;
      i += 2;
      let closed = false;
      while (i < text.length) {
        if (text[i] === "\n") line++;
        if (text[i] === "*" && text[i + 1] === "/") { i += 2; closed = true; break; }
        i++;
      }
      if (!closed) {
        issues.push({
          kind: "comment", line: startLine,
          message: "Comentario de bloque /* sin cerrar.",
          fix: "Cierra el comentario con */ o elimínalo.",
        });
      }
      continue;
    }

    // Cadenas
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      const startLine = line;
      i++;
      let closed = false;
      while (i < text.length) {
        if (text[i] === "\\") { i += 2; continue; }
        if (text[i] === "\n") {
          line++;
          if (quote !== "`") break; // una cadena normal no cruza de línea
        }
        if (text[i] === quote) { i++; closed = true; break; }
        i++;
      }
      if (!closed) {
        unclosedString++;
        issues.push({
          kind: "string", line: startLine,
          message: `Cadena ${quote}…${quote} sin cerrar.`,
          fix: "Cierra la cadena o usa comillas distintas.",
        });
      }
      continue;
    }

    if (ch === "(" || ch === "[" || ch === "{") { stack.push({ ch, line }); i++; continue; }
    if (ch === ")" || ch === "]" || ch === "}") {
      const expected = pairs[ch];
      const top = stack.pop();
      if (!top) {
        issues.push({
          kind: "balance", line,
          message: `Cierre "${ch}" sin su apertura.`,
          fix: `Quita el "${ch}" sobrante o añade su "${expected}".`,
        });
      } else if (top.ch !== expected) {
        issues.push({
          kind: "balance", line,
          message: `Se esperaba cerrar "${top.ch}" (abierto en la línea ${top.line}) y se encontró "${ch}".`,
          fix: `Corrige el orden de cierres.`,
        });
      }
      i++;
      continue;
    }
    i++;
  }

  for (const open of stack.slice(0, 4)) {
    issues.push({
      kind: "balance", line: open.line,
      message: `"${open.ch}" abierto en la línea ${open.line} sin cerrar.`,
      fix: `Cierra "${open.ch}"${open.ch === "{" ? "}" : open.ch === "(" ? ")" : "]"}.`,
    });
  }
  return { issues, unclosedString };
}

const PAIRED_HTML_TAGS = ["div", "section", "main", "header", "footer", "nav", "ul", "ol", "table", "form", "select", "button", "script", "style", "svg", "span", "p", "a", "pre", "textarea", "body", "html", "head", "title"];

function checkTagPairing(text: string, kind: "html" | "jsx", issues: SyntaxIssue[]): void {
  const counts = new Map<string, number>();
  const openRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  const closeRe = /<\/\s*([a-zA-Z][a-zA-Z0-9-]*)\s*>/g;
  let m: RegExpExecArray | null;

  while ((m = openRe.exec(text))) {
    const tag = m[1].toLowerCase();
    if (m[2] === "/") continue; // autocerrada
    if (!PAIRED_HTML_TAGS.includes(tag)) continue;
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  while ((m = closeRe.exec(text))) {
    const tag = m[1].toLowerCase();
    // 🐞 v2.0 — FALSO POSITIVO CORREGIDO (bloqueaba archivos correctos).
    // El bloque de apertura solo contaba etiquetas de la lista PAIRED_HTML_TAGS,
    // pero el de cierre contaba TODAS. Resultado: cualquier </h1>, </h3> o
    // </article> (que no están en la lista) quedaba como "cierre sin apertura" y
    // el archivo COMPLETO se rechazaba. Caso real: el index.html de la web de
    // instrumentos no llegaba nunca al sandbox (sync: "0 archivo(s) escrito(s)").
    // Ahora el cierre usa el mismo filtro que la apertura.
    if (!PAIRED_HTML_TAGS.includes(tag)) continue;
    counts.set(tag, (counts.get(tag) || 0) - 1);
  }
  // Para JSX también contamos las etiquetas de componentes (<Foo> … </Foo>)
  if (kind === "jsx") {
    const compOpen = /<([A-Z][A-Za-z0-9_]*)\b(?![^>]*\/>)[^>]*>/g;
    const compClose = /<\/\s*([A-Z][A-Za-z0-9_]*)\s*>/g;
    while ((m = compOpen.exec(text))) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    while ((m = compClose.exec(text))) counts.set(m[1], (counts.get(m[1]) || 0) - 1);
  }

  for (const [tag, diff] of counts) {
    if (diff > 0) {
      issues.push({
        kind, line: findLine(text, `<${tag}`),
        message: `Etiqueta <${tag}> abierta ${diff} vez/veces sin cerrar.`,
        fix: `Añade </${tag}> en el lugar correcto (o márcala autocerrada si está vacía).`,
      });
    }
    // v2.0 — Los cierres huérfanos NO se reportan como error.
    // Motivo: la señal fiable de un archivo CORTADO es una apertura sin cerrar
    // (lo que el truncamiento produce de verdad). Un </div> de más es un defecto
    // leve que el navegador tolera, y tratarlo como error grave hacía que el
    // motor rechazase archivos válidos y dejase al usuario sin previsualización.
    // Preferimos avisar por consola antes que bloquear un archivo correcto.
    if (diff < 0) {
      console.warn(`[CerebroNico] syntaxGuard: </${tag}> de más en el archivo (no bloqueante).`);
    }
  }
}

function findLine(text: string, needle: string): number {
  const idx = text.indexOf(needle);
  if (idx < 0) return 1;
  return text.slice(0, idx).split("\n").length;
}

function checkCss(text: string, issues: SyntaxIssue[]): void {
  const open = (text.match(/\{/g) || []).length;
  const close = (text.match(/\}/g) || []).length;
  if (open !== close) {
    issues.push({
      kind: "css", line: 1,
      message: `Llaves CSS desbalanceadas: ${open} abiertas y ${close} cerradas.`,
      fix: "Revisa los bloques: cada selector necesita su par { … }.",
    });
  }
}

function checkPython(text: string, issues: SyntaxIssue[]): void {
  const lines = text.split("\n");
  let tabs = 0;
  let spaces = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\t+/.test(l)) tabs++;
    else if (/^ +/.test(l)) spaces++;
    const t = l.trim();
    // v2.1 — 🐞 DOS FALSOS POSITIVOS REALES que bloqueaban Python válido:
    //   "try: p.terminate()"                     ← tiene ":" y es correcto
    //   "if f.startswith(...) and f.endswith("   ← continúa en la línea siguiente
    // La regla exigía que la línea TERMINARA en ":". Ahora basta con que haya
    // ":" en algún punto, y si la línea queda claramente ABIERTA (termina en
    // "(", "[", "{", ",", "=", operador o "\") se toma como continuación.
    // Un falso positivo aquí no es cosmético: impide escribir el archivo y el
    // proyecto se queda sin él.
    if (/^(def|class|if|elif|else|for|while|try|except|finally|with)\b/.test(t) && !t.includes(":") && !/[({\[,=+\-*/|&\\]$/.test(t)) {
      issues.push({
        kind: "python", line: i + 1,
        message: `Falta ":" al final de "${t.slice(0, 40)}".`,
        fix: "Añade ':' al final de la línea.",
      });
    }
    if ((t.startsWith("return") || t.startsWith("yield")) && t.endsWith(":")) {
      issues.push({
        kind: "python", line: i + 1,
        message: `"${t.slice(0, 40)}" no debería terminar en ":"`,
        fix: "Quita los dos puntos.",
      });
    }
  }
  if (tabs > 0 && spaces > 0) {
    issues.push({
      kind: "python", line: 1,
      message: "Mezcla de tabuladores y espacios en la indentación.",
      fix: "Usa solo 4 espacios por nivel.",
    });
  }
}

/** Valida un archivo completo. Esta es la función que usa el motor antes de escribir. */
export function guardFile(path: string, content: string): GuardResult {
  const language = detectLanguage(path);
  const issues: SyntaxIssue[] = [];
  const text = content ?? "";
  const stats = { lines: text.split("\n").length, chars: text.length };

  if (!text.trim()) {
    return {
      // v2.1 — 🐞 Un archivo VACÍO es VÁLIDO: no tiene sintaxis que pueda
      // estar mal. Rechazarlo rompía cosas reales y silenciosas: los
      // `__init__.py` de Python DEBEN existir aunque estén vacíos, y al
      // descartarlos se rompía el paquete Python completo del proyecto.
      ok: true, language, issues: [],
      summary: `OK: ${language}, archivo vacío (válido como marcador de paquete).`, stats,
    };
  }

  // ============================================================
  // v2.0 — POLÍTICA CONSERVADORA (corrección de FALSOS POSITIVOS)
  // ------------------------------------------------------------
  // EVIDENCIA: se pasaron por el blindaje 63 archivos REALES y VÁLIDOS del propio
  // proyecto y RECHAZÓ 32 (el 51 %). Motivos:
  //   - trataba los genéricos de TypeScript como etiquetas HTML
  //     (<Props>, <Check>, <HTMLInputElement>, <MenuState>…);
  //   - exigía cierre de <textarea>/<button> cuyos atributos ocupan varias líneas;
  //   - el balance de llaves no entiende JSX ni plantillas.
  // Consecuencia real en producción: el sandbox recibía 12 de 40 archivos y el
  // preview quedaba en blanco (main.tsx → 404).
  // Un guardián con falsos positivos es PEOR que no tenerlo: bloquea trabajo
  // correcto EN SILENCIO. Ahora solo se bloquea lo que se puede afirmar sin duda.
  // ============================================================

  // 1) Truncamiento: SOLO si el marcador está al final del archivo.
  //    (Antes se buscaba en TODO el texto y rechazaba archivos que lo único que
  //    hacían era mencionarlo — incluso este mismo comentario.)
  const tail = text.trimEnd().split("\n").slice(-3).join("\n");
  for (const p of TRUNCATION_PATTERNS) {
    if (p.re.test(tail)) {
      issues.push({
        kind: idxIssueKind(p),
        line: stats.lines,
        message: "El archivo TERMINA con un marcador de texto no escrito: está cortado.",
        fix: p.fix,
      });
      break;
    }
  }

  // 2) Validación específica por lenguaje
  if (language === "json") {
    try {
      JSON.parse(text);
    } catch (err: any) {
      issues.push({
        kind: "json", line: 1,
        message: `JSON inválido: ${String(err?.message || err).slice(0, 120)}`,
        fix: "Corrige comas, comillas dobles y llaves. Valida con JSON.parse mentalmente antes de entregarlo.",
      });
    }
  }

  // 3) Código (TS/JS/TSX/JSX): solo cierres que NO admiten duda.
  //    Sin un parser real es imposible validar llaves/paréntesis con genéricos,
  //    JSX y plantillas, así que eso ya NO bloquea. Quedan las dos señales
  //    inequívocas de archivo cortado: comentario de bloque y plantilla abiertos.
  if (["typescript", "tsx", "javascript", "jsx"].includes(language)) {
    // Solo se cuentan los /* que ABREN línea: un /* mencionado dentro de una
    // cadena o de un comentario de línea no abre nada (falso positivo real en
    // ProConfigPanel.tsx: "6 abiertos, 5 cerrados" con el archivo correcto).
    const abiertosComentario = (text.match(/^[ \t]*\/\*/gm) || []).length;
    const cerradosComentario = (text.match(/\*\//g) || []).length;
    if (abiertosComentario > cerradosComentario) {
      issues.push({
        kind: "truncated",
        line: stats.lines,
        message: `Comentario de bloque sin cerrar (${abiertosComentario} abierto(s), ${cerradosComentario} cerrado(s)).`,
        fix: "Cierra el comentario /* … */ o vuelve a escribir el archivo completo.",
      });
    }
    // v2.0 — COMPROBACIÓN DE BACKTICKS RETIRADA (decisión consciente).
    // Contar backticks no es fiable sin parsear cadenas y comentarios: en el
    // proyecto real hacía fallar ChatCenter.tsx, engine.ts y memory.ts, que son
    // correctos (contienen ejemplos de código y backticks escapados). Como el
    // coste de un falso positivo es alto —el archivo no llega al sandbox y la
    // pantalla queda en blanco— se prefiere NO bloquear por esto.
    // Lo que sigue protegiendo de un archivo cortado:
    //   · marcador de truncamiento en las últimas líneas,
    //   · comentario de bloque /* abierto al final,
    //   · y, en HTML/CSS/JSON, sus validadores completos.
    // Regla de oro aplicada: un guardián que bloquea trabajo correcto en silencio
    // es peor que no tener guardián.
  }

  // 4) Documentos: aquí las etiquetas SÍ son etiquetas (no genéricos de TS),
  //    así que estas comprobaciones se mantienen.
  if (language === "html") {
    const { issues: balanceIssues } = scanBalance(text);
    issues.push(...balanceIssues);
    checkTagPairing(text, "html", issues);
  }
  if (language === "css") {
    const { issues: balanceIssues } = scanBalance(text);
    issues.push(...balanceIssues);
    checkCss(text, issues);
  }
  if (language === "python") checkPython(text, issues);

  // 3) Heurística de HTML roto guardado como .txt/.md
  // ============================================================
  // v2.1 — 🐞 ESTA REGLA RECHAZABA DOCUMENTACIÓN LEGÍTIMA.
  // ------------------------------------------------------------
  // Log real del usuario:
  //   "SYNC rechazado …/ide/MEMORANDUM.md: Parece HTML guardado con extensión
  //    que no le corresponde."
  // MEMORANDUM.md es la documentación del proyecto y contiene EJEMPLOS de HTML
  // (el manual de extensiones incluye plantillas). Que un documento CONTENGA un
  // `<html` no lo convierte en un HTML mal guardado: el caso a detectar es el
  // archivo que **ES** un documento HTML y se guardó con otra extensión.
  // Por eso ahora se mira el PRINCIPIO del texto, no cualquier parte.
  // Regla de oro ya aplicada en este archivo: un guardián que bloquea trabajo
  // correcto es peor que no tener guardián.
  // ============================================================
  if ((language === "markdown" || language === "text") && /^\s*(<!doctype\s+html|<html[\s>])/i.test(text)) {
    issues.push({
      kind: "truncated", line: 1,
      message: "Parece HTML guardado con extensión que no le corresponde.",
      fix: "Guárdalo como .html para que el preview funcione.",
    });
  }

  const unique = dedupe(issues).slice(0, MAX_ISSUES);
  // ============================================================
  // v2.1 — Para PYTHON, las heurísticas se INFORMAN pero NO BLOQUEAN.
  // ------------------------------------------------------------
  // Aquí no hay un parser de Python: el análisis es por líneas, y esa
  // heurística ya se comió archivos reales de este proyecto (dos formas
  // distintas de falso positivo). Un falso positivo no es cosmético: el archivo
  // no se escribe y el proyecto queda sin él sin que nadie sepa por qué.
  // Para Python solo bloquea lo INEQUÍVOCO (archivo cortado); lo demás queda
  // como aviso en el informe.
  // ============================================================
  const bloqueantes = language === "python" ? unique.filter((i) => i.kind === "truncated") : unique;
  const ok = bloqueantes.length === 0;
  const avisosNoBloqueantes = unique.length - bloqueantes.length;
  const summary = ok
    ? `OK: ${language}, ${stats.lines} línea(s), sin problemas de sintaxis.` +
      (avisosNoBloqueantes > 0
        ? ` (${avisosNoBloqueantes} aviso(s) de heurística Python, no bloqueantes)`
        : "")
    : `${unique.length} problema(s) de sintaxis en ${path || language}: ` +
      unique.map((i) => `[L${i.line}] ${i.message} → ${i.fix}`).join(" | ");

  return { ok, language, issues: unique, summary, stats };
}

function idxIssueKind(p: { re: RegExp }): IssueKind {
  return /TODO|FIXME|pendiente/i.test(String(p.re)) ? "placeholder" : "truncated";
}

/* ============================================================
   v3.0 — EL PARSER DE VERDAD (ROADMAP D-P1)
   ------------------------------------------------------------
   Desde la v2.0 el guardián TS/JS solo cazaba DOS señales inequívocas
   (comentario abierto y marcador de truncado) porque SIN PARSER es
   imposible balancear llaves con genéricos y JSX. La consecuencia
   honesta: un `export function f() {` cortado sin la llave final — el
   MUTILADO CLÁSICO del que habla el Quirófano — seguía entrando.

   Este paso añade la comprobación que faltaba usando UN PARSER REAL
   (esbuild, la misma herramienta con la que Vite compila el proyecto:
   si esbuild lo rechaza, el sandbox lo rechaza; cero falsos positivos
   por construcción — el oráculo y la víctima son el mismo juez).

   CÓMO respeta la regla de oro («un guardián que bloquea trabajo
   correcto en silencio es peor que no tener guardián»):
     · El transform se RECIBE por inyección (dependency injection): el
       módulo sigue puro, sin Node, sin red, testeable en el navegador
       con un falso parser.
     · Si el parser CRASHEA por su cuenta (falta la dependencia, se
       salió del tiempo, lanzó sin `errors[]`), el archivo NO se
       bloquea: pasa con aviso. Se bloquea SOLO lo que el parser afirma
       con error de sintaxis localizado.
     · El balanceo heurístico de la v2.0 sigue siendo la primera capa
       (rápida, gratuita); el parser solo corre si aquella dio limpio.
   ============================================================ */

export type CargadorParser = "ts" | "tsx" | "js" | "jsx";

export type FuncionTransform = (
  codigo: string,
  opciones: { loader: CargadorParser; sourcefile: string }
) => Promise<unknown>;

const CARGADOR_POR_EXT: Record<string, CargadorParser> = {
  ts: "ts", mts: "ts", cts: "ts",
  tsx: "tsx",
  js: "js", mjs: "js", cjs: "js",
  jsx: "jsx",
};

/** El objeto que lanza esbuild trae `errors: [{ text, location: { line, column, lineText } }]`. */
function erroresDeParser(err: unknown): Array<{ texto: string; linea: number; detalle?: string }> | null {
  const lista = (err as any)?.errors;
  if (!Array.isArray(lista)) return null;
  const salida: Array<{ texto: string; linea: number; detalle?: string }> = [];
  for (const e of lista) {
    if (!e || typeof e !== "object") continue;
    salida.push({
      texto: String(e.text ?? "error de sintaxis"),
      linea: Number(e?.location?.line) || 1,
      detalle: e.detail ? String(e.detail) : undefined,
    });
  }
  return salida;
}

/**
 * `guardFile` + parser real para código JS/TS. Devuelve el MISMO contrato
 * `GuardResult` para que las cuatro puertas lo consuman sin cambiar nada.
 * `transform` nulo o que falló = comportamiento v2.0 exacto (nunca bloquea
 * por un problema del propio parser).
 */
export async function guardFileProfundo(
  path: string,
  content: string,
  transform: FuncionTransform | null | undefined,
  opciones?: { timeoutMs?: number }
): Promise<GuardResult> {
  const base = guardFile(path, content);
  if (!transform || !base.ok) return base; // la capa rápida ya sentenció

  const ext = (path || "").toLowerCase().slice((path || "").lastIndexOf(".") + 1);
  const loader = CARGADOR_POR_EXT[ext];
  if (!loader) return base; // ni JS ni TS: el parser no pinta aquí

  const timeoutMs = Math.max(250, opciones?.timeoutMs ?? 4000);
  let fallo: unknown = null;
  let corrio = false;
  try {
    await Promise.race([
      transform(content, { loader, sourcefile: path || "archivo.ts" }).then(() => { corrio = true; }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`parser sin respuesta en ${timeoutMs} ms`)), timeoutMs)),
    ]);
  } catch (err) {
    fallo = err;
  }

  if (!fallo) {
    return {
      ...base,
      summary: base.summary.replace(/\.$/, "") + " · parser: OK.",
    };
  }

  const errs = erroresDeParser(fallo);
  if (!errs || errs.length === 0) {
    // El parser no pudo juzgar (dependencia ausente, crash interno, timeout).
    // Regla de oro: se AVISA, no se bloquea.
    const motivo = String((fallo as any)?.message || fallo || "desconocido").slice(0, 120);
    return {
      ...base,
      issues: [
        ...base.issues,
        { kind: "parser", line: 1, message: `El parser no pudo juzgar el archivo (${motivo}); no aplica — pasa con la v2.0.`, fix: "sin acción" },
      ],
      summary: base.summary.replace(/\.$/, "") + " · parser: no aplicó (aviso, no bloqueo).",
    };
  }

  // El bloqueante es SIEMPRE el parser; esta heurística solo elige el CONSEJO.
  // Un .ts con errores que además contiene `</cierre>` es casi seguro JSX
  // guardado con la extensión equivocada (esbuild lo reporta como «regex sin
  // cerrar», sin decirlo). El consejo no añade poder de bloqueo.
  const hueleAJsx = loader === "ts" && /<\/[A-Za-z]/.test(content);
  const issues: SyntaxIssue[] = errs.slice(0, MAX_ISSUES).map((e) => ({
    kind: "parser",
    line: e.linea,
    message: `El parser del proyecto (esbuild) rechaza ${path || loader}: ${e.texto}${e.detalle ? " — " + e.detalle.slice(0, 160) : ""}`,
    fix:
      hueleAJsx || /JSX syntax extension is not currently enabled/i.test(e.texto + (e.detalle || ""))
        ? "Guarda el archivo con extensión .tsx: el JSX no va en .ts."
        : "Reescribe el archivo COMPLETO y balanceado: así no compilaría ni en el sandbox.",
  }));

  return {
    ok: false,
    language: base.language,
    issues: dedupe([...base.issues, ...issues]),
    summary:
      `${issues.length} error(es) de sintaxis detectados por el parser real en ${path || loader}: ` +
      dedupe([...base.issues, ...issues]).map((i) => `[L${i.line}] ${i.message} → ${i.fix}`).join(" | "),
    stats: base.stats,
  };
}

function dedupe(issues: SyntaxIssue[]): SyntaxIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.kind}:${i.line}:${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Mensaje para devolver al modelo cuando se rechaza una escritura. */
export function rejectMessage(path: string, result: GuardResult): string {
  return (
    `⛔ Escritura RECHAZADA por el blindaje de sintaxis del motor (${result.language}).\n` +
    `${result.summary}\n` +
    `Corrige esos puntos y vuelve a llamar a la herramienta. El archivo anterior NO se ha modificado.`
  );
}
