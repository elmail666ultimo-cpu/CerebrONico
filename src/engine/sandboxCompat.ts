/**
 * sandboxCompat.ts — ADUANA v2: EL SANDBOX RECONOCE MUCHOS PROYECTOS
 * ===================================================================
 * 🐞 DEFECTO MADRE (reportado v1.0.3): «a la hora de la orden el sandbox solo
 * está reconociendo HTML y archivos con package.json». Un proyecto Python
 * (requirements.txt), Rust (Cargo.toml), Go (go.mod), Java, PHP, Ruby, un
 * cuaderno Jupyter, un Makefile o una carpeta de datos (CSV/JSON/MD) se
 * declaraba "no hay proyecto" y el piloto automático se apagaba sin motivo.
 *
 * Este módulo es la FUENTE ÚNICA de dos decisiones puras, probables sin disco:
 *
 *   1. RECONOCIMIENTO — `marcadoresProyecto()`: qué archivo de una carpeta la
 *      convierte en proyecto, de qué tipo es, si el sandbox puede SERVIRLO
 *      (previsualización) o solo RECONOCERLO (se ejecuta por consola), y cómo
 *      se arranca. El peso decide empates: node manda sobre python, python
 *      sobre estático, etc. — el orden es el que el sandbox ya sabía ejecutar.
 *
 *   2. TOLERANCIA DE ENTRADA — `clasificarEntrada()`: qué archivos admite el
 *      sandbox como material de trabajo. Antes: implícitamente html/js/json.
 *      Ahora: TODO archivo entra salvo binarios de ejecución (rechazo con
 *      motivo). Lo desconocido se acepta como texto con aviso — la regla de
 *      hierro del proyecto es "nada en silencio": se declara la categoría.
 *
 * Reglas de hierro heredadas:
 *   · Puro: sin fs, sin red, sin `node:*`. Viaja al bundle si hace falta.
 *   · Un rechazo SIEMPRE lleva motivo legible.
 *   · Reconocer NO es prometer: `servible:false` significa "no hay
 *     previsualizador; córrelo por consola con ESTE comando".
 */

// ─── 1. Reconocimiento de proyectos ─────────────────────────────────────────

export interface MarcadorProyecto {
  /** id corto, único: "node", "python", … */
  id: string;
  /** Nombre humano: "Node / npm" */
  nombre: string;
  icono: string;
  /** 100 = manda sobre todos. Decide el empate cuando una carpeta tiene varios. */
  peso: number;
  /** Nombres exactos (minúsculas) que delatan el tipo. */
  archivos: string[];
  /** Regex opcional sobre el nombre completo (fuente, para evitar /.../ serializado). */
  patron?: string;
  /** ¿Puede el sandbox (:3500) servir una previsualización de esto? */
  servible: boolean;
  /** Qué decirle al usuario para arrancarlo por consola (honesto, no mágico). */
  cmdArranque: string;
}

/** Orden = peso descendente a efectos de lectura; la función ordena sola. */
export const MARCADORES_PROYECTO: MarcadorProyecto[] = [
  { id: "node", nombre: "Node / npm", icono: "📦", peso: 100, archivos: ["package.json"], servible: true,
    cmdArranque: "npm install && npm run dev" },
  { id: "python", nombre: "Python", icono: "🐍", peso: 90,
    archivos: ["requirements.txt", "pyproject.toml", "setup.py", "pipfile", "environment.yml", "manage.py"], servible: false,
    cmdArranque: "python -m venv venv && venv/bin/activate && pip install -r requirements.txt && python main.py" },
  { id: "dotnet", nombre: ".NET", icono: "⚙️", peso: 86, archivos: [], patron: "\\.csproj$|\\.fsproj$|\\.sln$", servible: false,
    cmdArranque: "dotnet run" },
  { id: "java", nombre: "Java / Gradle / Maven", icono: "☕", peso: 85, archivos: ["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle"], servible: false,
    cmdArranque: "mvn package  (o: gradle build) && java -jar target/…" },
  { id: "rust", nombre: "Rust", icono: "🦀", peso: 84, archivos: ["cargo.toml"], servible: false,
    cmdArranque: "cargo run" },
  { id: "go", nombre: "Go", icono: "🐹", peso: 83, archivos: ["go.mod"], servible: false,
    cmdArranque: "go run ." },
  { id: "php", nombre: "PHP", icono: "🐘", peso: 82, archivos: ["composer.json"], servible: false,
    cmdArranque: "composer install && php -S 127.0.0.1:3500" },
  { id: "ruby", nombre: "Ruby", icono: "💎", peso: 81, archivos: ["gemfile", "rakefile"], servible: false,
    cmdArranque: "bundle install && bundle exec ruby main.rb" },
  { id: "dart", nombre: "Dart / Flutter", icono: "🎯", peso: 80, archivos: ["pubspec.yaml"], servible: false,
    cmdArranque: "flutter run  (o: dart run)" },
  { id: "elixir", nombre: "Elixir", icono: "💧", peso: 79, archivos: ["mix.exs"], servible: false,
    cmdArranque: "mix deps.get && iex -S mix" },
  { id: "deno", nombre: "Deno", icono: "🦕", peso: 78, archivos: ["deno.json", "deno.jsonc"], servible: false,
    cmdArranque: "deno run main.ts" },
  { id: "jupyter", nombre: "Jupyter", icono: "📓", peso: 70, archivos: [], patron: "\\.ipynb$", servible: false,
    cmdArranque: "jupyter notebook" },
  { id: "statico", nombre: "Web estática", icono: "🌐", peso: 60, archivos: ["index.html"], servible: true,
    cmdArranque: "el sandbox ya lo sirve en :3500 (servidor estático)" },
  { id: "docker", nombre: "Docker", icono: "🐳", peso: 50, archivos: ["dockerfile", "docker-compose.yml", "docker-compose.yaml"], servible: false,
    cmdArranque: "docker compose up --build" },
  { id: "cmake", nombre: "CMake (C/C++)", icono: "🔧", peso: 45, archivos: ["cmakelists.txt"], servible: false,
    cmdArranque: "cmake -S . -B build && cmake --build build" },
  { id: "make", nombre: "Make", icono: "🔨", peso: 40, archivos: ["makefile"], servible: false,
    cmdArranque: "make && ./<binario>" },
  { id: "docs", nombre: "Documentos / texto", icono: "📄", peso: 20, archivos: ["readme.md"], patron: "\\.md$|\\.txt$|\\.rst$|\\.pdf$", servible: false,
    cmdArranque: "no es un proyecto ejecutable: es material de lectura/edición" },
  { id: "datos", nombre: "Datos", icono: "📊", peso: 15, archivos: [], patron: "\\.csv$|\\.tsv$|\\.xlsx$|\\.parquet$|\\.sqlite$|\\.db$", servible: false,
    cmdArranque: "no es un proyecto ejecutable: es material de datos" },
];

/** El marcador que más peso aporta este nombre de archivo (o null). */
export function marcadorDeArchivo(nombre: string): MarcadorProyecto | null {
  const n = String(nombre || "").toLowerCase();
  let mejor: MarcadorProyecto | null = null;
  for (const m of MARCADORES_PROYECTO) {
    const exacto = m.archivos.includes(n);
    const porPatron = m.patron ? new RegExp(m.patron, "i").test(n) : false;
    if ((exacto || porPatron) && (!mejor || m.peso > mejor.peso)) mejor = m;
  }
  return mejor;
}

export interface Reconocimiento {
  /** id del marcador ganador: "node", "python", … */
  tipo: string;
  nombre: string;
  icono: string;
  /** El archivo concreto que lo delató (para decir DÓNDE se reconoció). */
  marcador: string;
  /** true → el sandbox puede previsualizarlo; false → se reconoce y se guía. */
  servible: boolean;
  /** Instrucción honesta de arranque por consola. */
  cmdArranque: string;
  peso: number;
}

/**
 * Dado el listado de NOMBRES de una carpeta (solo basename), devuelve el
 * reconocimiento de proyecto o null si la carpeta no tiene marcador.
 * Pura: quien llama lee el disco; aquí solo se decide.
 */
export function reconocerCarpeta(nombres: string[]): Reconocimiento | null {
  let mejor: { m: MarcadorProyecto; nombre: string } | null = null;
  for (const raw of nombres) {
    const n = String(raw || "");
    const m = marcadorDeArchivo(n);
    if (!m) continue;
    // exacto pesa más que por-patrón dentro del mismo marcador (package.json
    // delatado por nombre exacto manda sobre un .md suelto en la misma carpeta)
    if (!mejor || m.peso > mejor.m.peso) mejor = { m, nombre: n };
  }
  if (!mejor) return null;
  const { m, nombre } = mejor;
  return { tipo: m.id, nombre: m.nombre, icono: m.icono, marcador: nombre, servible: m.servible, cmdArranque: m.cmdArranque, peso: m.peso };
}

/**
 * Versión "la carpeta está vacía o solo tiene basura": un directorio con
 * archivos corrientes pero SIN marcador sigue siendo proyecto genérico —
 * el sandbox debe poder escribir ahí. Devuelve el tipo "generico" con
 * aviso, nunca null, para que el llamador NUNCA diga "no hay proyecto"
 * si hay material. (Tolerancia: antes esto era el agujero.)
 */
export function reconocerCarpetaTolerante(nombres: string[]): Reconocimiento {
  const r = reconocerCarpeta(nombres);
  if (r) return r;
  const limpias = nombres.filter((n) => n && !n.startsWith("."));
  return {
    tipo: limpias.length ? "generico" : "vacia",
    nombre: limpias.length ? "Carpeta de trabajo" : "Sandbox vacío",
    icono: limpias.length ? "🗂" : "∅",
    marcador: limpias[0] || "",
    servible: false,
    cmdArranque: limpias.length
      ? "sin marcador de proyecto: el sandbox escribe y ejecuta por consola"
      : "pulsa Sync para escribir el workspace al disco",
    peso: 0,
  };
}

// ─── 2. Tolerancia de entrada (archivos que el sandbox acepta) ─────────────

export type CategoriaEntrada =
  | "codigo" | "datos" | "documento" | "imagen" | "audio" | "video"
  | "paquete" | "config" | "binario-rechazado" | "desconocido";

export interface VeredictoEntrada {
  nombre: string;
  extension: string;
  categoria: CategoriaEntrada;
  /** false SOLO para binarios de ejecución/objeto: no entran al sandbox. */
  aceptada: boolean;
  /** Motivo del rechazo o aviso de la categoría. Nunca vacío si hay duda. */
  nota: string;
}

const EXT_CODIGO = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "java", "kt", "kts", "c", "h", "cpp", "hpp", "cs", "rb", "php", "swift", "scala", "lua", "pl", "r", "jl", "dart", "vue", "svelte", "sql", "sh", "bash", "ps1", "bat", "cmd", "asm", "s", "ex", "exs", "erl", "hs", "ml", "clj", "groovy", "vba", "pas", "d", "zig", "nim", "sol", "toml"]);
const EXT_DATOS = new Set(["json", "jsonc", "jsonl", "ndjson", "csv", "tsv", "xml", "yaml", "yml", "ini", "env", "properties", "parquet", "avro", "orc", "xlsx", "xls", "ods", "sqlite", "db", "sqlite3", "geojson", "gpx", "kml", "ics", "vcf", "edn"]);
const EXT_DOC = new Set(["md", "markdown", "mdx", "txt", "rst", "pdf", "docx", "doc", "odt", "rtf", "tex", "epub", "html", "htm", "xhtml", "css", "scss", "sass", "less", "styl"]);
const EXT_IMG = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "tiff", "tif", "avif", "heic", "heif", "psd", "ai", "drawio", "excalidraw", "sketch", "fig"]);
const EXT_AUDIO = new Set(["mp3", "wav", "ogg", "oga", "flac", "aac", "m4a", "opus", "amr"]);
const EXT_VIDEO = new Set(["mp4", "webm", "mov", "avi", "mkv", "m4v", "gifv"]);
const EXT_PAQUETE = new Set(["zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "whl", "jar", "war", "nupkg", "gem", "crate", "deb", "rpm", "apk", "aab", "lock"]);
const EXT_CONFIG = new Set(["dockerfile", "makefile", "cmakelists", "gitignore", "gitattributes", "editorconfig", "eslintrc", "prettierrc", "babelrc", "npmrc", "nvmrc", "modelfile", "cn", "lock", "log"]);
/** Rechazo expreso: binarios de ejecución u objetos — no son material, son riesgo. */
const EXT_RECHAZO = new Set(["exe", "dll", "so", "dylib", "msi", "msix", "app", "bin", "o", "a", "lib", "class", "pyc", "pyo", "iso", "img", "dmg", "elf", "wasm"]);

function extensionDe(nombre: string): string {
  const n = String(nombre || "").toLowerCase().trim();
  const base = n.split("/").pop() || n;
  // archivos-sin-extensión notorios: dockerfile, makefile, readme…
  if (EXT_CONFIG.has(base)) return base;
  const m = /\.([a-z0-9]+)$/.exec(base);
  return m ? m[1] : "";
}

/**
 * Clasifica UN nombre de archivo como material de entrada del sandbox.
 * Tolerancia por defecto: entra todo salvo la lista de rechazo, que sale
 * con motivo. Lo desconocido se acepta como texto con aviso (antes era
 * tierra de nadie: el importador lo tragaba o lo escupía sin decir).
 */
export function clasificarEntrada(nombre: string): VeredictoEntrada {
  const ext = extensionDe(nombre);
  const base = String(nombre || "").toLowerCase().split("/").pop() || "";
  const veredicto = (categoria: CategoriaEntrada, aceptada: boolean, nota: string): VeredictoEntrada =>
    ({ nombre: base, extension: ext, categoria, aceptada, nota });

  if (EXT_RECHAZO.has(ext)) {
    return veredicto("binario-rechazado", false, `«.${ext}» es un binario de ejecución/objeto: no entra al sandbox (seguridad y sentido). Si necesitas su contenido, exporta su fuente.`);
  }
  if (EXT_CODIGO.has(ext)) return veredicto("codigo", true, "");
  if (EXT_DATOS.has(ext)) return veredicto("datos", true, "");
  if (EXT_DOC.has(ext)) return veredicto("documento", true, "");
  if (EXT_IMG.has(ext)) return veredicto("imagen", true, "");
  if (EXT_AUDIO.has(ext)) return veredicto("audio", true, "");
  if (EXT_VIDEO.has(ext)) return veredicto("video", true, "");
  if (EXT_PAQUETE.has(ext)) return veredicto("paquete", true, ext === "zip" ? "ZIP: se extrae y cada archivo se reclasifica." : "");
  if (EXT_CONFIG.has(ext) || EXT_CONFIG.has(base)) return veredicto("config", true, "");
  if (!ext) return veredicto("desconocido", true, "sin extensión: entra como texto; si resulta binario, se declara al leerlo.");
  return veredicto("desconocido", true, `extensión «.${ext}» no catalogada: se acepta como texto de entrada (tolerancia por defecto; el rechazo es la excepción listada).`);
}

/** Filtra una lista de nombres: qué entra, qué no y por qué. Pura. */
export function auditarEntradas(nombres: string[]): { aceptadas: VeredictoEntrada[]; rechazadas: VeredictoEntrada[] } {
  const aceptadas: VeredictoEntrada[] = [];
  const rechazadas: VeredictoEntrada[] = [];
  for (const n of nombres) {
    const v = clasificarEntrada(n);
    (v.aceptada ? aceptadas : rechazadas).push(v);
  }
  return { aceptadas, rechazadas };
}

/** Resumen legible para el log/UI: "🐍 Python (requirements.txt) · por consola: …". */
export function lineaReconocimiento(r: Reconocimiento): string {
  return `${r.icono} ${r.nombre} · marcador «${r.marcador || "(sin archivo delator)"}» · ${r.servible ? "previsible en :3500" : `se arranca por consola: ${r.cmdArranque}`}`;
}
