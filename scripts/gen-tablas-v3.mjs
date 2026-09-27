/**
 * gen-tablas-v3.mjs — generador de tablas-lite-v3.json y tablas-max-v3.json
 * ===================================================================
 * Reflejo v3.0 — 22 acciones + 16 plantillas + units + fechas + conectores de plan.
 *
 * Mantiene la estructura {version, modo, lexicon, verbos, formatos} que el motor
 * ya sabe leer (cerebroReflejo.ts no cambia su interfaz `Tablas`).
 *
 * Reglas:
 *  - lexicon: typo/variante → palabra canónica (NO femenino/infinitivo final).
 *  - verbos: palabra canónica → lista de intentos que VOTA (las 22 acciones).
 *  - formatos: sinonimos de formatos.
 *
 * Salida:
 *  - ide/backend/src/engine/reflejo/tablas-lite-v3.json  (~600 KB)
 *  - ide/backend/src/engine/reflejo/tablas-max-v3.json   (~3 MB)
 *
 * Cero red, cero aleatoriedad. Genera con `node scripts/gen-tablas-v3.mjs`.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/ → ../src/engine/reflejo
const OUT_DIR = join(__dirname, "..", "src", "engine", "reflejo");
mkdirSync(OUT_DIR, { recursive: true });

// ─── LAS 22 ACCIONES CANÓNICAS ──────────────────────────────────────────────
// El orden = prioridad de desempate (RANK). Las 6 originales conservan su sitio.
const ACCIONES = [
  "plan", "convertir", "imagen", "creacion", "abrir", "calculo",
  // 16 nuevas (Reflejo v3.0)
  "analizar", "explicar", "resumir", "traducir", "comparar",
  "listar", "buscar", "ordenar", "filtrar", "contar",
  "testear", "documentar", "instalar", "desplegar",
  "refactorizar", "optimizar",
];

// ─── VERBOS canónicos que VOTAN por cada ACCIÓN ─────────────────────────────
// Cada clave es una palabra "limpia" (infinitivo). Cada valor: a qué acciones vota.
const VERBOS_BASE = {
  // === 6 originales (no mover de sitio) ===
  convertir: ["convertir"], canjear: ["convertir"], exportar: ["convertir"], importar: ["convertir"],
  traduce: ["traducir"], traducir: ["traducir"], traducelo: ["traducir"], traduzcamos: ["traducir"],
  cambia: ["convertir"], cambiar: ["convertir"], cambialo: ["convertir"], cambiala: ["convertir"],
  pasa: ["convertir"], pasar: ["convertir"], pasalo: ["convertir"],
  convierte: ["convertir"], conversion: ["convertir"], conviertelo: ["convertir"],
  abre: ["abrir"], abrir: ["abrir"], abrelo: ["abrir"], abrid: ["abrir"],
  muestra: ["abrir"], mostrar: ["abrir"], muestrame: ["abrir"], ensename: ["abrir"], ensena: ["abrir"],
  lee: ["abrir"], leer: ["abrir"], lectura: ["abrir"], visualiza: ["abrir"], visualizar: ["abrir"],
  dibuja: ["imagen"], dibujar: ["imagen"], dibujo: ["imagen"], dibujalo: ["imagen"],
  pinta: ["imagen"], pintar: ["imagen"], pinto: ["imagen"], pintalo: ["imagen"],
  ilustra: ["imagen"], ilustrar: ["imagen"], ilustracion: ["imagen"],
  logo: ["imagen"], banner: ["imagen"], poster: ["imagen"], icono: ["imagen"],
  genera: ["creacion", "imagen"], generar: ["creacion", "imagen"], generarlo: ["creacion"],
  creacion: ["creacion"], crea: ["creacion"], crear: ["creacion"], crealo: ["creacion"], creamelo: ["creacion"],
  escribe: ["creacion"], escribir: ["creacion"], escribeme: ["creacion"],
  componente: ["creacion"], modulo: ["creacion"], plantilla: ["creacion"], scaffold: ["creacion"],
  plan: ["plan"], planifica: ["plan"], planifica_esto: ["plan"], planificar: ["plan"],
  secuencia: ["plan"], secuenciar: ["plan"], luego: ["plan"], despues: ["plan"],
  calcula: ["calculo"], calcular: ["calculo"], cuanto: ["calculo"], cuantos: ["calculo"],
  evalua: ["calculo"], resuelve: ["calculo"], suma: ["calculo"], resta: ["calculo"],
  multiplica: ["calculo"], divide: ["calculo"], dividir: ["calculo"], porcentaje: ["calculo"],

  // === 16 acciones nuevas (Reflejo v3.0) ===
  // ANALIZAR — examinar código / archivos / logs
  analiza: ["analizar"], analizar: ["analizar"], analizalo: ["analizar"], analicemos: ["analizar"],
  examina: ["analizar"], examinar: ["analizar"], examinalo: ["analizar"], examen: ["analizar"],
  inspecciona: ["analizar"], inspeccionar: ["analizar"], revisa: ["analizar"], revisar: ["analizar"],
  revisalo: ["analizar"], escanea: ["analizar"], escanear: ["analizar"], audita: ["analizar"],
  auditar: ["analizar"], diagnostica: ["analizar"], diagnosticar: ["analizar"], estudia: ["analizar"],
  estudiar: ["analizar"], investiga: ["analizar"], investigar: ["analizar"],
  // EXPLICAR — razonar sobre el código
  explica: ["explicar"], explicar: ["explicar"], explicame: ["explicar"], explicalo: ["explicar"],
  razona: ["explicar"], razonar: ["explicar"], describe: ["explicar"], describir: ["explicar"],
  describeme: ["explicar"], aclarame: ["explicar"], aclarar: ["explicar"], aclara: ["explicar"],
  ensename: ["explicar"], muestra: ["abrir", "explicar"], comentame: ["explicar"], comentar: ["explicar"],
  // RESUMIR
  resume: ["resumir"], resumir: ["resumir"], resumelo: ["resumir"], resumen: ["resumir"],
  sintetiza: ["resumir"], sintetizar: ["resumir"], sintesis: ["resumir"], abrevia: ["resumir"],
  abreviar: ["resumir"], reduce: ["resumir"], reducir: ["resumir"], condensa: ["resumir"], condensar: ["resumir"],
  // TRADUCIR
  traduce: ["traducir"], traducir: ["traducir"], traducelo: ["traducir"], translate: ["traducir"],
  translada: ["traducir"], trasladar: ["traducir"], versiona: ["traducir"], versionar: ["traducir"],
  // COMPARAR
  compara: ["comparar"], comparar: ["comparar"], comparalo: ["comparar"], comparame: ["comparar"],
  diferencia: ["comparar"], diferenciar: ["comparar"], confronta: ["comparar"], confrontar: ["comparar"],
  contrasta: ["comparar"], contrastar: ["comparar"], coteja: ["comparar"], cotejar: ["comparar"],
  // LISTAR
  lista: ["listar"], listar: ["listar"], listame: ["listar"], enumera: ["listar"], enumerar: ["listar"],
  numerar: ["listar"], lista_esto: ["listar"], muestra_lista: ["listar"], inventaria: ["listar"],
  // BUSCAR
  busca: ["buscar"], buscar: ["buscar"], buscalo: ["buscar"], buscame: ["buscar"], encuentra: ["buscar"],
  encontrar: ["buscar"], encuentrame: ["buscar"], localiza: ["buscar"], localizar: ["buscar"],
  ubica: ["buscar"], ubicar: ["buscar"], rastrea: ["buscar"], rastrear: ["buscar"],
  // ORDENAR
  ordena: ["ordenar"], ordenar: ["ordenar"], ordenalo: ["ordenar"], ordena_por: ["ordenar"],
  sortea: ["ordenar"], sortear: ["ordenar"], organiza: ["ordenar"], organizar: ["ordenar"],
  clasifica: ["ordenar"], clasificar: ["ordenar"], agrupa: ["ordenar"], agrupar: ["ordenar"],
  // FILTRAR
  filtra: ["filtrar"], filtrar: ["filtrar"], filtralo: ["filtrar"], filtra_por: ["filtrar"],
  criba: ["filtrar"], cribar: ["filtrar"], selecciona: ["filtrar"], seleccionar: ["filtrar"],
  descarta: ["filtrar"], descartar: ["filtrar"], tamiza: ["filtrar"], tamizar: ["filtrar"],
  // CONTAR
  cuenta: ["contar"], contar: ["contar"], cuentame: ["contar"], cuentalo: ["contar"],
  numera: ["contar"], numerar: ["contar"], totaliza: ["contar"], totalizar: ["contar"],
  recuenta: ["contar"], recuentar: ["contar"], cuenta_cuantos: ["contar"], contabiliza: ["contar"],
  contabilizar: ["contar"],
  // TESTEAR
  testa: ["testear"], testear: ["testear"], testalo: ["testear"], testea: ["testear"], testear_v: ["testear"],
  prueba: ["testear"], probar: ["testear"], pruebalo: ["testear"], pruebas: ["testear"],
  unittest: ["testear"], test: ["testear"], tests: ["testear"], ejetuta_tests: ["testear"],
  // DOCUMENTAR
  documenta: ["documentar"], documentar: ["documentar"], documentalo: ["documentar"], documéntalo: ["documentar"],
  documenta_esto: ["documentar"], redacta: ["documentar"], redactar: ["documentar"], redactame: ["documentar"],
  anota: ["documentar"], anotar: ["documentar"], registra: ["documentar"], registrar: ["documentar"],
  // INSTALAR
  instala: ["instalar"], instalar: ["instalar"], instalalo: ["instalar"], instalame: ["instalar"],
  agregadependencia: ["instalar"], agregadepend: ["instalar"], anadedepend: ["instalar"],
  anadedependencia: ["instalar"], instaladependencias: ["instalar"], instala_paquete: ["instalar"],
  anade_paquete: ["instalar"], agrega_paquete: ["instalar"],
  // DESPLEGAR
  despliega: ["desplegar"], desplegar: ["desplegar"], despliegalo: ["desplegar"], deploy: ["desplegar"],
  deploya: ["desplegar"], publicar: ["desplegar"], publica: ["desplegar"], publícalo: ["desplegar"],
  lanza: ["desplegar"], lanzar: ["desplegar"], empuja: ["desplegar"], empujar: ["desplegar"],
  sube_a_produccion: ["desplegar"], promueve: ["desplegar"], promover: ["desplegar"],
  // REFACTORIZAR
  refactoriza: ["refactorizar"], refactorizar: ["refactorizar"], refactorizalo: ["refactorizar"],
  reestructura: ["refactorizar"], reestructurar: ["refactorizar"], reescribe: ["refactorizar"],
  reescribir: ["refactorizar"], reorganiza: ["refactorizar"], reorganizar: ["refactorizar"],
  limpia: ["refactorizar"], limpiar: ["refactorizar"], simplifica: ["refactorizar"],
  simplificar: ["refactorizar"], deuda_tecnica: ["refactorizar"],
  // OPTIMIZAR
  optimiza: ["optimizar"], optimizar: ["optimizar"], optimizalo: ["optimizar"], optimización: ["optimizar"],
  acelera: ["optimizar"], acelerar: ["optimizar"], agiliza: ["optimizar"], agilizar: ["optimizar"],
  perfila: ["optimizar"], perfilar: ["optimizar"], perfórmance: ["optimizar"], performantea: ["optimizar"],
  reduce_rendimiento: ["optimizar"], rapido: ["optimizar"], rapidito: ["optimizar"], velociza: ["optimizar"],
  velocizar: ["optimizar"], compacta: ["optimizar"], compactar: ["optimizar"],
};

// ─── FORMATOS (sinónimos de formato de archivo) ─────────────────────────────
const FORMATOS_BASE = {
  json: "json", jsonl: "jsonl", ndjson: "jsonl",
  yaml: "yaml", yml: "yaml",
  toml: "toml", ini: "toml", cfg: "toml",
  csv: "csv", tsv: "csv",
  xml: "xml", svg: "xml",
  md: "md", markdown: "md",
  txt: "txt", texto: "txt",
  html: "html", htm: "html",
  css: "css", scss: "scss", sass: "scss", less: "less",
  ts: "ts", tsx: "ts", mts: "ts", cts: "ts", typescript: "ts",
  js: "js", jsx: "js", mjs: "js", cjs: "js", javascript: "js",
  py: "py", python: "py", pyw: "py",
  rs: "rs", rust: "rs",
  go: "go", golang: "go",
  java: "java", kt: "kt", kts: "kt", kotlin: "kt",
  swift: "swift",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp", cc: "cpp", cxx: "cpp",
  cs: "cs", csharp: "cs",
  php: "php", rb: "rb", ruby: "rb",
  sh: "sh", bash: "sh", zsh: "sh", fish: "sh",
  sql: "sql",
  vue: "vue", svelte: "svelte", astro: "astro",
  prisma: "prisma",
  env: "env", dotenv: "env",
  dockerfile: "dockerfile",
  graphql: "graphql", gql: "graphql",
  proto: "proto", protobuf: "proto",
  lock: "lock", pnpm_lock: "lock", yarn_lock: "lock",
  png: "png", jpg: "jpg", jpeg: "jpg", webp: "webp", gif: "gif", bmp: "bmp", ico: "ico", avif: "avif",
};

// ─── NÚMEROS Y OPERADORES (español + portugués) ──────────────────────────────
const NUMEROS = {
  cero: "0", uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5",
  seis: "6", siete: "7", ocho: "8", nueve: "9", diez: "10",
  once: "11", doce: "12", trece: "13", catorce: "14", quince: "15",
  dieciseis: "16", diecisiete: "17", dieciocho: "18", diecinueve: "19",
  veinte: "20", treinta: "30", cuarenta: "40", cincuenta: "50",
  sesenta: "60", setenta: "70", ochenta: "80", noventa: "90",
  cien: "100", mil: "1000", millon: "1000000", millones: "1000000",
  // Portugués (BR/PT)
  um: "1", dois: "2", tres_pt: "3", quatro_pt: "4", cinco_pt: "5",
  seis_pt: "6", sete: "7", oito: "8", nove: "9", dez_pt: "10",
  cem: "100", mil_pt: "1000",
};

const OPERADORES = {
  mas: "+", menos: "-", por: "*", entre: "/", dividido: "/", elevado: "^", al: "^",
  cuadrado: "^2", cubo: "^3", mitad: "0.5", doble: "2*", triple: "3*",
  raiz: "sqrt", modulo: "%", mod: "%",
  // Portugués
  mais: "+", menos_pt: "-", vezes: "*", dividido_por: "/",
  // Inglés
  plus: "+", minus: "-", times: "*", over: "/",
};

// ─── UNIDADES (Reflejo v3.0 — para la calculadora con units) ─────────────────
const UNIDADES = {
  // Tiempo
  segundo: "s", segundos: "s", seg: "s", segs: "s", sec: "s",
  minuto: "min", minutos: "min", min: "min", mins: "min",
  hora: "h", horas: "h", hr: "h", hrs: "h",
  dia: "d", dias: "d", day: "d", days: "d",
  semana: "w", semanas: "w", week: "w", weeks: "w",
  mes: "mo", meses: "mo", month: "mo", months: "mo",
  anio: "y", anios: "y", año: "y", años: "y", year: "y", years: "y",
  // Bytes
  byte: "B", bytes: "B",
  kb: "KB", kilobyte: "KB", kilobytes: "KB",
  mb: "MB", megabyte: "MB", megabytes: "MB",
  gb: "GB", gigabyte: "GB", gigabytes: "GB",
  tb: "TB", terabyte: "TB", terabytes: "TB",
  // Distancia
  metro: "m", metros: "m", m_: "m",
  km: "km", kilometro: "km", kilometros: "km",
  cm: "cm", centimetro: "cm", centimetros: "cm",
  mm: "mm", milimetro: "mm", milimetros: "mm",
  // Píxeles
  px: "px", pixel: "px", pixels: "px",
  rem: "rem", em: "em",
  // Porcentaje (se maneja aparte en la calculadora)
  porcentaje: "%", porciento: "%", percent: "%",
  // Moneda
  usd: "USD", dolares: "USD", dolar: "USD",
  eur: "EUR", euros: "EUR", euro: "EUR",
  ars: "ARS", mxn: "MXN", cop: "COP", clp: "CLP", uyu: "UYU",
};

// ─── TIPOS DE PLANTILLA (Reflejo v3.0 — de 5 a 16) ───────────────────────────
const TIPOS_PLANTILLA = new Set([
  "react", "componente", "express", "ruta", "router",
  "python", "py", "html", "pagina", "ts", "modulo", "interface",
  // Nuevos v3.0
  "next", "nextjs", "tailwind", "tailwindcss",
  "prisma", "svelte", "vue", "astro",
  "docker", "dockerfile", "github_action", "ghaction",
  "vite_config", "viteconfig", "express_middleware", "middleware",
  "react_hook", "hook", "api_route", "apiroute",
  "test", "testing", "readme", "env_local", "env",
]);

// ─── TYPOS COMUNES por teclado hispano (expandidos para max) ────────────────
// Genera variantes de distancia 1 desde la lista de verbos base.
// Para `lite`, solo dejamos las variantes más comunes; para `max`, todas las de
// distancia 1 + algunas de distancia 2.
function variantesDistancia1(palabra) {
  const out = new Set();
  const p = palabra.toLowerCase();
  const letras = "abcdefghijklmnopqrstuvwxyz";
  // Sustituciones de teclado vecinas (QWERTY hispano)
  const vecinos = {
    a: "qsz", b: "vghn", c: "xdfv", d: "serfcx", e: "wrds3", f: "drtgcv", g: "fthyhbv",
    h: "gtyujnb", i: "ujko8", j: "uikmnh", k: "ijolm", l: "kopñm", m: "njklu",
    n: "bhjm", ñ: "lkm", o: "iklp9", p: "ol0", q: "wa", r: "etdf4", s: "awedxz",
    t: "ryfg5", u: "yijh7", v: "cfgb", w: "qeas", x: "zscd", y: "tugh6", z: "asx",
  };
  // 1. Sustitución por letra vecina
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    for (const v of (vecinos[c] || "")) {
      out.add(p.slice(0, i) + v + p.slice(i + 1));
    }
  }
  // 2. Inserciones (letra de más)
  for (let i = 0; i <= p.length; i++) {
    for (const l of letras) {
      out.add(p.slice(0, i) + l + p.slice(i));
    }
  }
  // 3. Eliminaciones (letra faltante)
  for (let i = 0; i < p.length; i++) {
    out.add(p.slice(0, i) + p.slice(i + 1));
  }
  // 4. Transposición (letras adyacentes intercambiadas)
  for (let i = 0; i < p.length - 1; i++) {
    out.add(p.slice(0, i) + p[i + 1] + p[i] + p.slice(i + 2));
  }
  out.delete(p); // la original no es variante
  return [...out];
}

// Solo inserciones/sustituciones comunes (más selectivo) → para lite
function variantesDistancia1Lite(palabra) {
  const out = new Set();
  const p = palabra.toLowerCase();
  // Vecinos de teclado (sustitución)
  const vecinos = {
    a: "qs", b: "vn", c: "xv", d: "sfc", e: "wr", f: "dgv", g: "fhb",
    h: "gjn", i: "uko", j: "ukm", k: "ijl", l: "kpm", m: "njklu",
    n: "bjm", ñ: "lm", o: "iklp", p: "ol", q: "wa", r: "etdf", s: "awedxz",
    t: "ryfg", u: "yijh7", v: "cfgb", w: "qe", x: "zscd", y: "tugh", z: "asx",
  };
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    for (const v of (vecinos[c] || "")) {
      out.add(p.slice(0, i) + v + p.slice(i + 1));
    }
  }
  // Eliminación (letra faltante)
  for (let i = 0; i < p.length; i++) {
    out.add(p.slice(0, i) + p.slice(i + 1));
  }
  // Transposición
  for (let i = 0; i < p.length - 1; i++) {
    out.add(p.slice(0, i) + p[i + 1] + p[i] + p.slice(i + 2));
  }
  // Duplicación de tecla (letras dobles — typo muy común)
  for (let i = 0; i < p.length; i++) {
    out.add(p.slice(0, i + 1) + p[i] + p.slice(i + 1));
  }
  out.delete(p);
  return [...out];
}

// ─── ARMADO DE LAS TABLAS ───────────────────────────────────────────────────

function armarLexicon(verbosBase, extraVariantes) {
  const lex = {};
  // Cada verbo se mapea a sí mismo
  for (const palabra of Object.keys(verbosBase)) {
    lex[palabra] = palabra;
  }
  // Sinónimos / conjugaciones (de la base) ya están
  // Variantes de typo
  for (const palabra of Object.keys(verbosBase)) {
    const variantes = extraVariantes(palabra);
    for (const v of variantes) {
      if (!lex[v]) lex[v] = palabra; // no sobreescribe si ya existe
    }
  }
  // Números, operadores, unidades — todos se mapean a su forma canónica
  for (const [k, v] of Object.entries(NUMEROS)) lex[k] = v;
  for (const [k, v] of Object.entries(OPERADORES)) lex[k] = v;
  for (const [k, v] of Object.entries(UNIDADES)) lex[k] = v;
  // Tipos de plantilla → mapean a su forma "clave" (la misma para `crearPlantilla`)
  for (const t of TIPOS_PLANTILLA) lex[t] = t;
  // Reflejo v3.0 — STOPWORDS hispanas: se mapean a sí mismas para que `corregir`
  // las encuentre exactas y NO disparen fuzzy lookup. Sin esto, «llamado» caía
  // a distancia 1 de «contar» y «crea un svelte llamado X» se interpretaba como
  // orden de «contar» en vez de creación de plantilla.
  //
  // OJO: NO se incluyen palabras que ya tienen un significado semántico en
  // NUMEROS/OPERADORES («dos», «tres», «por», «de» como posesivo vs prep) —
  // si se añaden aquí sobreescriben el mapeo y rompen la calculadora hablada.
  // «de» NO está aquí a propósito: la calculadora lo usa como conector
  // («sqrt de 144»), y «dos»/«tres» ya están en NUMEROS.
  const STOPWORDS = [
    "un", "una", "unos", "unas", "el", "la", "los", "las", "lo", "al", "del",
    "que", "se", "para", "con", "sin", "sobre", "tras",
    "llamado", "llamada", "llamados", "llamadas",
    "nuevo", "nueva", "nuevos", "nuevas",
    "hacer", "hecho", "echa", "echame", "echalo",
    "este", "esta", "estos", "estas", "eso", "esa", "esos", "esas",
    "a", "e", "i", "o", "u", "y", "ni", "o_bien",
    "en", "aqui", "alli", "alla", "donde",
    "como", "cuando", "mientras", "si", "no",
    "hay", "es", "son", "fue", "era", "ser", "estar", "estaba",
    "muy", "mucho", "mucha", "muchos", "muchas", "poco", "poca",
    "tambien", "solo", "solamente", "ahora", "antes",
    // Portugués
    "um", "uma", "uns", "umas", "os", "as", "do", "da", "das",
    "com", "sem",
    // Inglés
    "an", "the", "of", "to", "for", "with", "without",
    "is", "are", "was", "were", "be", "been",
    "this", "that", "these", "those",
    "called", "named",
    // Reflejo v3.0 — Palabras inglesas comunes que colisionan con verbos
    // hispanos por fuzzy lookup. Sin esto, "Counter" → "contar" (distancia 1)
    // y "crea un svelte llamado Counter" se volvía una orden de contar.
    "counter", "counters", "counted", "counting",
    "list", "lists", "listed",
    "find", "finds", "found",
    "build", "builds", "builder",
    "view", "views", "viewer",
    "model", "models",
    "name", "names",
    "user", "users",
    "data", "datas",
    "info", "infos",
    "log", "logs",
    "tests",
  ];
  for (const s of STOPWORDS) {
    // Solo se mapea si no existe ya (los NUMEROS/OPERADORES/UNIDADES tienen prioridad).
    if (!(s in lex)) lex[s] = s;
  }
  return lex;
}

function armarTabla(modo, extraVariantes) {
  const lexicon = armarLexicon(VERBOS_BASE, extraVariantes);
  // Aseguramos que TODAS las acciones canónicas estén en el lexicon
  for (const a of ACCIONES) lexicon[a] = a;
  return {
    version: "3.0.0",
    modo,
    lexicon,
    verbos: VERBOS_BASE,
    formatos: FORMATOS_BASE,
    // Metadatos nuevos (no rompen el contrato Tablas):
    acciones: ACCIONES,
    tiposPlantilla: [...TIPOS_PLANTILLA],
    unidades: Object.keys(UNIDADES),
  };
}

console.log("[gen-tablas-v3] Construyendo tabla lite…");
const lite = armarTabla("lite", variantesDistancia1Lite);
console.log(`  lexicon: ${Object.keys(lite.lexicon).length} entradas`);
console.log(`  verbos: ${Object.keys(lite.verbos).length}`);
console.log(`  formatos: ${Object.keys(lite.formatos).length}`);

console.log("[gen-tablas-v3] Construyendo tabla max…");
const max = armarTabla("max", variantesDistancia1);
console.log(`  lexicon: ${Object.keys(max.lexicon).length} entradas`);

const litePath = join(OUT_DIR, "tablas-lite-v3.json");
const maxPath = join(OUT_DIR, "tablas-max-v3.json");
writeFileSync(litePath, JSON.stringify(lite));
writeFileSync(maxPath, JSON.stringify(max));
console.log(`[gen-tablas-v3] OK — ${litePath}`);
console.log(`[gen-tablas-v3] OK — ${maxPath}`);
