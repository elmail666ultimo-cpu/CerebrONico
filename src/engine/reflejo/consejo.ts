/**
 * consejo.ts — CEREBRONICO-AGENTICO v1: LAS 40 ENTIDADES (v2.5)
 * =============================================================
 * El consejo de especialistas (DISEÑO_MULTI_REFLEJOS_v2.5.md §7) hecho código:
 *
 *   · 12 ESPECIALISTAS — siempre activos. Cada rama de `pensar()` asciende a
 *     entidad con nombre, dominio y contrato. El voto sigue siendo el scoring
 *     de intenciones del motor (no se duplica la lógica: se le pone cara). Así
 *     los 76 tests del reflejo siguen valiendo SIN tocarlos.
 *     v1.6.33 · D7: la frase «12 votantes» era una cortesía. En el código,
 *     `DUEÑO_DE` solo tenía ramas para 6; las 16 acciones del Reflejo v3.0
 *     caían en «ayuda». El reparto real vive en `votacionConsejo.ts` (fuente
 *     única): 10 asientos reciben votos por frase y 2 (telemetría, memorista)
 *     están DECLARADOS como no-votantes — aportan herramientas, no voz.
 *   · 28 HERRAMIENTAS — 10 activas por defecto, 18 DORMIDAS con botón
 *     (`POST /api/consejo/entidad {id, activa}`). Dormida no es muerta: al
 *     invocarla responde POR QUÉ no actuó (regla de hierro: nada en silencio).
 *
 * La regla de admisión que quedó escrita en el diseño: una herramienta nueva
 * se justifica si su CONTRATO DE SALIDA es distinto, no si el tema es nuevo.
 *
 * RAM honesta: los especialistas comparten las tablas del motor (una sola
 * copia, la que ya carga `pensar`). Las herramientas no cargan tablas: son
 * funciones. Por eso 40 entidades cuestan ~40 MB, no 40 × 40 MB.
 */

import { pensar, type ResultadoReflejo, type Tablas } from "../cerebroReflejo";
// v1.6.33 · D7: el reparto de votos es un motor puro aparte (testeable sin
// tablas ni disco). consejo.ts lo CONSUME: sigue habiendo una sola voz.
import { ACCIONES_REPARTIDAS, dueñoDe, veredictoVoto, dueñosConVoto, VOTAN, NO_VOTAN } from "../votacionConsejo";
import { crearEspejos, IDS_ESPEJOS } from "./espejos"; // ESPEJOS v1: 10 agentes espejo + grupos
import { buscarEnPool, poolListo } from "./pool"; // Reflejo v3.0 · Paso 2: espejos personalizados (BUILD v1: desde el pool puro — nunca desde el cargador, que toca node:fs y reventaba `vite build`)

/**
 * v2.5 — Las cuatro herramientas de máquina y las dos de cripto NO importan
 * `node:os`/`node:crypto` directamente: este módulo viaja al bundle del
 * navegador (chatOrders → consejo), y ahí los módulos de Node no existen.
 * El servidor los inyecta con `configurarSistema()` en la raíz de composición.
 * Sin inyección, la herramienta responde «no estoy en el servidor» con motivo
 * DECLARADO — que es exactamente lo que este proyecto hace con todo lo que
 * no puede hacer.
 */
export interface PrimitivasSistema {
  totalmem(): number;
  freemem(): number;
  cpus(): Array<{ model?: string }>;
  loadavg(): number[];
  sha256(texto: string): string;
  uuid(): string;
}
let SISTEMA: PrimitivasSistema | undefined;
export function configurarSistema(p: PrimitivasSistema) { SISTEMA = p; }
const sinSistema = (id: string): ResultadoEntidad => ({
  ok: false, entidad: id, ms: 0,
  motivo: `«${id}» mide el SISTEMA: solo corre en el servidor de CerebroNico (Node), no en el navegador.`,
});

// ─── Contrato común ──────────────────────────────────────────────────────────

export interface ResultadoEntidad {
  ok: boolean;
  salida?: string;
  /** SIEMPRE presente cuando ok === false. */
  motivo?: string;
  entidad: string;
  ms: number;
}

export interface Entidad {
  id: string;
  nombre: string;
  dominio: "especialista" | "texto" | "datos" | "matematicas" | "maquina" | "visual" | "proyecto" | "espejo";
  tipo: "especialista" | "herramienta";
  activa: boolean;
  /** Qué hace, en una línea — para /api/consejo/estado y para el manual. */
  descripcion: string;
  ejecutar?: (datos: any) => ResultadoEntidad;
}

// ─── Los 12 especialistas (mapeo desde las ramas reales de `pensar`) ─────────

/**
 * A qué entidad pertenece el resultado del motor. Un solo mapa, fuente única.
 * v1.6.33 · D7: las 7 llaves originales quedan LITERALES (tests/agentico las
 * audita); las 16 acciones genéricas del Reflejo v3.0 se derivan del reparto
 * único `votacionConsejo.ts`. Antes de esto, analizar/explicar/testear/buscar…
 * caían todas en «ayuda»: 6 de los 12 asientos del consejo estaban vacíos.
 */
export const DUEÑO_DE: Record<string, string> = {
  convertir: "conversor",
  abrir: "archivista",
  imagen: "artista",
  creacion: "codigo",
  calculo: "matematico",
  plan: "conductor",
  nada: "ayuda",
};
for (const acc of ACCIONES_REPARTIDAS) {
  const esp = dueñoDe(acc);
  if (esp && !(acc in DUEÑO_DE)) DUEÑO_DE[acc] = esp;
}

export const ESPECIALISTAS: Array<Pick<Entidad, "id" | "nombre" | "descripcion">> = [
  { id: "conversor", nombre: "Conversor de formatos", descripcion: "json↔yaml↔tomlcsv con informe de pérdidas (formatConverter)." },
  { id: "archivista", nombre: "Archivista", descripcion: "abre/lee rutas del proyecto; audita rutas sanas." },
  { id: "artista", nombre: "Artista", descripcion: "frase → prompt de imagen enriquecido (estilo, luz, paleta, seed)." },
  { id: "codigo", nombre: "Operario de código", descripcion: "plantillas react/express/python/html/ts; imports y sintaxis delegan en importChecker/syntaxGuard." },
  { id: "matematico", nombre: "Matemático", descripcion: "calculadora con parser propio, sin eval." },
  { id: "conductor", nombre: "Conductor de planes", descripcion: "descompone en DAG con dependencias (taskPlanner es su validador)." },
  { id: "linguista", nombre: "Lingüista", descripcion: "normaliza, cuenta, compara texto. NO traduce: eso es del neural." },
  { id: "investigador", nombre: "Investigador", descripcion: "esqueleto de plan de investigación y citas. Sin red no investiga: lo declara." },
  { id: "validador", nombre: "Validador", descripcion: "JSON/rutas/esquemas contra las funciones reales del motor." },
  { id: "telemetria", nombre: "Telemetría", descripcion: "RAM, núcleos, carga del sistema — lo que la máquina puede afirmar." },
  { id: "memorista", nombre: "Memorista", descripcion: "recuerda semillas y decisiones del consejo durante la sesión." },
  { id: "ayuda", nombre: "Ayuda", descripcion: "cuando nadie vota: dice qué se pareció y por qué no pasó el umbral." },
];

// ─── Tablas pequeñas de las herramientas (las 2.2 MB ya viven en el motor) ───

const PALETA: Record<string, string> = {
  rojo: "#e74c3c", verde: "#2ecc71", azul: "#3498db", amarillo: "#f1c40f", negro: "#0a0a0a",
  blanco: "#ffffff", gris: "#95a5a6", naranja: "#e67e22", violeta: "#9b59b6", cyan: "#1abc9c",
  rosa: "#fd79a8", dorado: "#d4af37", plata: "#c0c0c0", turquesa: "#40e0d0", esmeralda: "#50c878",
  cobalto: "#0047ab", escarlata: "#8f2323", lavanda: "#e6e6fa", menta: "#98ff98", carbón: "#36454f",
};

const UNIDADES: Record<string, Record<string, number>> = {
  longitud: { km: 1000, m: 1, cm: 0.01, mm: 0.001 },
  masa: { kg: 1000, g: 1, mg: 0.001 },
  volumen: { l: 1000, ml: 1 },
  tiempo: { h: 3600, min: 60, s: 1 },
};

// La memoria del consejo: decisiones y semillas de la sesión (no persiste a
// disco a propósito — para eso está knowledgeBase/planes.json).
const MEMORIA: Array<{ en: number; entidad: string; nota: string }> = [];
function recordar(entidad: string, nota: string) {
  MEMORIA.push({ en: Date.now(), entidad, nota });
  if (MEMORIA.length > 500) MEMORIA.shift();
}

// ─── Las 28 herramientas ─────────────────────────────────────────────────────

const r = (entidad: string, t0: number, ok: boolean, extra: Partial<ResultadoEntidad> = {}): ResultadoEntidad =>
  ({ ok, entidad, ms: Date.now() - t0, ...extra });

const reg = (id: string, nombre: string, dominio: Entidad["dominio"], activa: boolean, descripcion: string, ejecutar: (d: any) => ResultadoEntidad): Entidad =>
  ({ id, nombre, dominio, tipo: "herramienta", activa, descripcion, ejecutar });

const T: Entidad[] = [];

// ── texto (8) ──
T.push(reg("texto.contar", "Contar palabras", "texto", true, "palabras, líneas, caracteres", (d) => {
  const t0 = Date.now(); const s = String(d?.texto ?? "");
  if (!s.trim()) return r("texto.contar", t0, false, { motivo: "«texto» vacío: no hay nada que contar." });
  return r("texto.contar", t0, true, { salida: `${s.trim().split(/\s+/).length} palabras · ${s.split("\n").length} líneas · ${s.length} caracteres` });
}));
T.push(reg("texto.acentos", "Quitar acentos", "texto", true, "normalización NFD del motor", (d) => {
  const t0 = Date.now(); const s = String(d?.texto ?? "");
  if (!s) return r("texto.acentos", t0, false, { motivo: "falta «texto»." });
  return r("texto.acentos", t0, true, { salida: s.normalize("NFD").replace(/[\u0300-\u036f]/g, "") });
}));
T.push(reg("texto.mayus", "Cambiar mayúsculas", "texto", true, "modo: mayus|minus|titulo", (d) => {
  const t0 = Date.now(); const s = String(d?.texto ?? ""); const m = String(d?.modo ?? "mayus");
  if (!s) return r("texto.mayus", t0, false, { motivo: "falta «texto»." });
  if (!["mayus", "minus", "titulo"].includes(m)) return r("texto.mayus", t0, false, { motivo: `modo «${m}» no existe (mayus|minus|titulo).` });
  const out = m === "mayus" ? s.toUpperCase() : m === "minus" ? s.toLowerCase() : s.replace(/\b\w/g, (c) => c.toUpperCase());
  return r("texto.mayus", t0, true, { salida: out });
}));
T.push(reg("texto.slug", "Slug", "texto", true, "texto → url-seguro", (d) => {
  const t0 = Date.now(); const s = String(d?.texto ?? "");
  if (!s.trim()) return r("texto.slug", t0, false, { motivo: "falta «texto»." });
  return r("texto.slug", t0, true, { salida: s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") });
}));
T.push(reg("texto.ordenar", "Ordenar líneas", "texto", true, "orden alfabético, con reverso", (d) => {
  const t0 = Date.now(); const s = String(d?.texto ?? "");
  if (!s.trim()) return r("texto.ordenar", t0, false, { motivo: "falta «texto»." });
  const v = s.split("\n").sort((a, b) => a.localeCompare(b, "es"));
  if (d?.reverso) v.reverse();
  return r("texto.ordenar", t0, true, { salida: v.join("\n") });
}));
T.push(reg("texto.dedup", "Deduplicar líneas", "texto", true, "elimina líneas repetidas conservando orden", (d) => {
  const t0 = Date.now(); const s = String(d?.texto ?? "");
  if (!s.trim()) return r("texto.dedup", t0, false, { motivo: "falta «texto»." });
  return r("texto.dedup", t0, true, { salida: [...new Set(s.split("\n"))].join("\n") });
}));
T.push(reg("texto.dif", "Diferencia de líneas", "texto", true, "qué líneas hay en A que no en B", (d) => {
  const t0 = Date.now(); const a = String(d?.a ?? ""), b = String(d?.b ?? "");
  if (!a || !b) return r("texto.dif", t0, false, { motivo: "hacen falta «a» y «b»." });
  const B = new Set(b.split("\n")); const solo = a.split("\n").filter((l) => !B.has(l));
  return r("texto.dif", t0, true, { salida: solo.length ? solo.join("\n") : "idéntico: nada en A que falte en B" });
}));

// ── datos (8) ──
T.push(reg("datos.json-ruta", "Ruta JSON", "datos", true, "obtiene .a.b[0] de un JSON (sin ejecutar nada)", (d) => {
  const t0 = Date.now();
  let obj: any; try { obj = typeof d?.json === "string" ? JSON.parse(d.json) : d?.json; } catch (e: any) { return r("datos.json-ruta", t0, false, { motivo: `el JSON no parsea: ${e.message}` }); }
  if (!obj || typeof d?.ruta !== "string") return r("datos.json-ruta", t0, false, { motivo: "faltan «json» o «ruta»." });
  let cur = obj;
  for (const paso of d.ruta.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)) {
    if (cur == null || !(paso in cur)) return r("datos.json-ruta", t0, false, { motivo: `la ruta se rompe en «${paso}» (existe: ${cur ? Object.keys(cur).slice(0, 8).join(", ") : "null"}).` });
    cur = cur[paso];
  }
  return r("datos.json-ruta", t0, true, { salida: typeof cur === "object" ? JSON.stringify(cur) : String(cur) });
}));
T.push(reg("datos.json-llaves", "Claves de JSON", "datos", true, "lista las claves raíz y su tipo", (d) => {
  const t0 = Date.now();
  let obj: any; try { obj = typeof d?.json === "string" ? JSON.parse(d.json) : d?.json; } catch (e: any) { return r("datos.json-llaves", t0, false, { motivo: `el JSON no parsea: ${e.message}` }); }
  if (!obj || typeof obj !== "object") return r("datos.json-llaves", t0, false, { motivo: "no es un objeto JSON." });
  return r("datos.json-llaves", t0, true, { salida: Object.entries(obj).map(([k, v]) => `${k}:${Array.isArray(v) ? "array" : typeof v}`).join(" ") });
}));
T.push(reg("datos.csv-columnas", "Columnas CSV", "datos", true, "cabeceras y conteo de filas", (d) => {
  const t0 = Date.now(); const s = String(d?.csv ?? "");
  if (!s.trim()) return r("datos.csv-columnas", t0, false, { motivo: "falta «csv»." });
  const [head, ...rows] = s.trim().split(/\r?\n/);
  return r("datos.csv-columnas", t0, true, { salida: `${head.split(",").length} columnas [${head}] · ${rows.length} filas` });
}));
T.push(reg("datos.csv-fila", "Fila N de CSV", "datos", true, "devuelve la fila n (1-based, sin cabecera)", (d) => {
  const t0 = Date.now(); const s = String(d?.csv ?? ""); const n = Number(d?.n);
  if (!s.trim()) return r("datos.csv-fila", t0, false, { motivo: "falta «csv»." });
  if (!Number.isInteger(n) || n < 1) return r("datos.csv-fila", t0, false, { motivo: `«n» debe ser un entero ≥1 (llegó «${d?.n}»).` });
  const filas = s.trim().split(/\r?\n/).slice(1);
  if (n > filas.length) return r("datos.csv-fila", t0, false, { motivo: `la fila ${n} no existe: el CSV tiene ${filas.length}.` });
  return r("datos.csv-fila", t0, true, { salida: filas[n - 1] });
}));
T.push(reg("datos.base64", "Base64", "datos", true, "modo cod|dec", (d) => {
  const t0 = Date.now(); const s = String(d?.texto ?? ""); const m = String(d?.modo ?? "cod");
  if (!s) return r("datos.base64", t0, false, { motivo: "falta «texto»." });
  if (m === "cod") return r("datos.base64", t0, true, { salida: Buffer.from(s, "utf8").toString("base64") });
  if (m === "dec") { try { return r("datos.base64", t0, true, { salida: Buffer.from(s, "base64").toString("utf8") }); } catch (e: any) { return r("datos.base64", t0, false, { motivo: `no es base64 válido: ${e.message}` }); } }
  return r("datos.base64", t0, false, { motivo: `modo «${m}» no existe (cod|dec).` });
}));
T.push(reg("datos.hash", "SHA-256", "datos", true, "huella del texto (la misma del manifiesto del ZIP)", (d) => {
  const t0 = Date.now(); const s = String(d?.texto ?? "");
  if (!s) return r("datos.hash", t0, false, { motivo: "falta «texto»." });
  if (!SISTEMA) return sinSistema("datos.hash");
  return r("datos.hash", t0, true, { salida: SISTEMA.sha256(s) });
}));
T.push(reg("datos.uuid", "UUID nuevo", "datos", true, "identificador aleatorio (crypto nativo)", () => {
  if (!SISTEMA) return sinSistema("datos.uuid");
  const t0 = Date.now();
  return r("datos.uuid", t0, true, { salida: SISTEMA.uuid() });
}));

// ── matemáticas (4) ──
T.push(reg("mate.promedio", "Promedio", "matematicas", true, "media de una lista de números", (d) => {
  const t0 = Date.now(); const nums = (Array.isArray(d?.numeros) ? d.numeros : String(d?.numeros ?? "").split(/[,\s]+/)).map(Number).filter((n: number) => Number.isFinite(n));
  if (!nums.length) return r("mate.promedio", t0, false, { motivo: "no llegó ningún número en «numeros»." });
  return r("mate.promedio", t0, true, { salida: String(nums.reduce((a: number, b: number) => a + b, 0) / nums.length) });
}));
T.push(reg("mate.porcentaje", "Porcentaje", "matematicas", true, "cuánto es p% de n / n de m", (d) => {
  const t0 = Date.now(); const p = Number(d?.p), n = Number(d?.n);
  if (!Number.isFinite(p) || !Number.isFinite(n)) return r("mate.porcentaje", t0, false, { motivo: "faltan «p» y «n» numéricos." });
  return r("mate.porcentaje", t0, true, { salida: `${p}% de ${n} = ${(p * n) / 100}` });
}));
T.push(reg("mate.minmax", "Mínimo y máximo", "matematicas", true, "extremos de una lista", (d) => {
  const t0 = Date.now(); const nums = (Array.isArray(d?.numeros) ? d.numeros : String(d?.numeros ?? "").split(/[,\s]+/)).map(Number).filter((n: number) => Number.isFinite(n));
  if (!nums.length) return r("mate.minmax", t0, false, { motivo: "no llegó ningún número." });
  return r("mate.minmax", t0, true, { salida: `min=${Math.min(...nums)} max=${Math.max(...nums)} rango=${Math.max(...nums) - Math.min(...nums)}` });
}));
T.push(reg("mate.unidades", "Unidades", "matematicas", true, "km/m/cm · kg/g/mg · l/ml · h/min/s", (d) => {
  const t0 = Date.now(); const v = Number(d?.valor), de = String(d?.de ?? ""), a = String(d?.a ?? "");
  if (!Number.isFinite(v)) return r("mate.unidades", t0, false, { motivo: "falta «valor» numérico." });
  for (const fam of Object.values(UNIDADES)) {
    if (de in fam && a in fam) return r("mate.unidades", t0, true, { salida: String((v * fam[de]) / fam[a]) });
  }
  return r("mate.unidades", t0, false, { motivo: `no puedo convertir «${de}» a «${a}» (familias: ${Object.keys(UNIDADES).join(", ")}; unidades conocidas: ${[...new Set(Object.values(UNIDADES).flatMap((u) => Object.keys(u)))].join(" ")})` });
}));

// ── máquina (4) ──
T.push(reg("maq.ram", "RAM", "maquina", true, "total/libre — la misma autoridad que mide el presupuesto MR", () => {
  if (!SISTEMA) return sinSistema("maq.ram");
  const t0 = Date.now();
  return r("maq.ram", t0, true, { salida: `total ${(SISTEMA.totalmem() / 1024 ** 3).toFixed(1)} GB · libre ${(SISTEMA.freemem() / 1024 ** 3).toFixed(1)} GB` });
}));
T.push(reg("maq.cpu", "CPU", "maquina", true, "núcleos y modelo", () => {
  if (!SISTEMA) return sinSistema("maq.cpu");
  const t0 = Date.now(); const c = SISTEMA.cpus()[0];
  return r("maq.cpu", t0, true, { salida: `${SISTEMA.cpus().length} núcleos · ${c?.model || "desconocido"}` });
}));
T.push(reg("maq.tramo", "Tramo MR", "maquina", true, "en qué peldaño de la escalera vive esta máquina", () => {
  if (!SISTEMA) return sinSistema("maq.tramo");
  const t0 = Date.now(); const gb = SISTEMA.totalmem() / 1024 ** 3;
  const tramo = gb >= 24 ? "MR4 (32 GB)" : gb >= 12 ? "MR3 (16 GB)" : gb >= 6 ? "MR2 (8 GB)" : "MR1 (4 GB)";
  return r("maq.tramo", t0, true, { salida: `${gb.toFixed(1)} GB → ${tramo}` });
}));

// ── visual (4) ──
T.push(reg("vis.hex2rgb", "Hex → RGB", "visual", true, "con validación de formato", (d) => {
  const t0 = Date.now(); const h = String(d?.hex ?? "").replace(/^#/, "");
  if (!/^[\da-f]{6}$/i.test(h)) return r("vis.hex2rgb", t0, false, { motivo: `«${d?.hex}» no es un color hex de 6 dígitos.` });
  return r("vis.hex2rgb", t0, true, { salida: `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})` });
}));
T.push(reg("vis.rgb2hex", "RGB → Hex", "visual", true, "canaliza 0–255", (d) => {
  const t0 = Date.now(); const c = [d?.r, d?.g, d?.b].map(Number);
  if (c.some((x) => !Number.isFinite(x) || x < 0 || x > 255)) return r("vis.rgb2hex", t0, false, { motivo: "r,g,b deben ser números 0–255." });
  return r("vis.rgb2hex", t0, true, { salida: "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("") });
}));
T.push(reg("vis.contraste", "Contraste AA", "visual", true, "ratio WCAG entre dos hex (el arte también se valida)", (d) => {
  const t0 = Date.now();
  const lum = (hex: string) => {
    const n = parseInt(hex.replace(/^#/, ""), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const a = String(d?.a ?? ""), b = String(d?.b ?? "");
  if (!/^#?[\da-f]{6}$/i.test(a) || !/^#?[\da-f]{6}$/i.test(b)) return r("vis.contraste", t0, false, { motivo: "hacen dos colores hex válidos «a» y «b»." });
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  const ratio = (l1 + 0.05) / (l2 + 0.05);
  return r("vis.contraste", t0, true, { salida: `${ratio.toFixed(2)}:1 → AA normal ${ratio >= 4.5 ? "SÍ" : "NO"} · AA grande ${ratio >= 3 ? "SÍ" : "NO"}` });
}));
T.push(reg("vis.paleta", "Paleta por nombre", "visual", true, "nombre de color → hex (español)", (d) => {
  const t0 = Date.now(); const n = String(d?.nombre ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const hex = PALETA[n];
  if (!hex) return r("vis.paleta", t0, false, { motivo: `no conozco «${d?.nombre}». Conocidas: ${Object.keys(PALETA).join(", ")}.` });
  return r("vis.paleta", t0, true, { salida: hex });
}));

// ── proyecto (4) ──
T.push(reg("proyecto.stats", "Estadísticas del workspace", "proyecto", true, "archivos, líneas, bytes por extensión", (d) => {
  const t0 = Date.now(); const files = Array.isArray(d?.archivos) ? d.archivos : [];
  if (!files.length) return r("proyecto.stats", t0, false, { motivo: "no llegó la lista «archivos» (el servidor la pasa desde el workspace)." });
  const porExt: Record<string, { n: number; lineas: number }> = {};
  for (const f of files) {
    const ext = (String(f.ruta).match(/\.[a-z0-9]+$/i)?.[0] || "(sin ext)").toLowerCase();
    const lineas = String(f.contenido || "").split("\n").length;
    porExt[ext] = porExt[ext] || { n: 0, lineas: 0 }; porExt[ext].n++; porExt[ext].lineas += lineas;
  }
  return r("proyecto.stats", t0, true, { salida: Object.entries(porExt).sort((a, b) => b[1].n - a[1].n).map(([e, v]) => `${e}:${v.n}f/${v.lineas}l`).join(" ") });
}));
T.push(reg("proyecto.rutas-sanas", "Auditar rutas", "datos", true, "detecta rutas que escapan del proyecto (la misma regla que guardarBinario)", (d) => {
  const t0 = Date.now(); const rutas = Array.isArray(d?.rutas) ? d.rutas : [String(d?.rutas ?? "")];
  const malas = rutas.filter((x: string) => !x || x.includes("..") || x.startsWith("/") || x.includes("\\"));
  return r("proyecto.rutas-sanas", t0, malas.length === 0, {
    salida: malas.length ? undefined : `todas sanas (${rutas.length})`,
    motivo: malas.length ? `escapan o están vacías: ${malas.slice(0, 5).join(", ")}` : undefined,
  });
}));
T.push(reg("memorista.registrar", "Recordar decisión", "datos", true, "memoria de sesión del consejo (500 notas, sin disco)", (d) => {
  const t0 = Date.now(); const nota = String(d?.nota ?? "");
  if (!nota.trim()) return r("memorista.registrar", t0, false, { motivo: "falta «nota»." });
  recordar(String(d?.entidad ?? "consejo"), nota);
  return r("memorista.registrar", t0, true, { salida: `registrada (${MEMORIA.length} en la sesión)` });
}));

// ── espejos (10) — ESPEJOS v1: agentes espejo agrupables por tarea ──
T.push(...crearEspejos(reg, r));

// La promesa del diseño §7 hecha valor: DIEZ herramientas despiertan con el
// IDE; las otras dieciocho esperan el botón. No son menos capaces: solo
// duermen hasta que alguien las pide por nombre.
export const ACTIVAS_POR_DEFECTO = new Set([
  "texto.contar", "datos.json-ruta", "datos.hash", "mate.promedio", "mate.unidades",
  "maq.ram", "maq.tramo", "vis.paleta", "proyecto.rutas-sanas", "memorista.registrar",
  ...IDS_ESPEJOS, // ESPEJOS v1: los 10 espejos nacen despiertos (reciben órdenes desde el minuto 0)
]);
for (const h of T) h.activa = ACTIVAS_POR_DEFECTO.has(h.id);

// ─── El registro completo: 12 + 28 = 40 ──────────────────────────────────────

export const ENTIDADES: Entidad[] = [
  ...ESPECIALISTAS.map((e) => ({ ...e, dominio: "especialista" as const, tipo: "especialista" as const, activa: true })),
  ...T,
];

export function entidadPorId(id: string): Entidad | undefined {
  return ENTIDADES.find((e) => e.id === id);
}

/**
 * El botón: activar/dormir una herramienta. Los especialistas NO se duermen:
 * quitarle una voz al consejo cambia sus respuestas sin avisar — eso es
 * decisión de producto, no un toggle de sesión.
 */
export function cambiarActivacion(id: string, activa: boolean): { ok: boolean; motivo?: string } {
  const e = entidadPorId(id);
  if (!e) return { ok: false, motivo: `no existe la entidad «${id}» (mira /api/consejo/estado).` };
  if (e.tipo === "especialista") return { ok: false, motivo: `«${id}» es especialista votante: no se duerme con toggle (ver consejo.ts).` };
  e.activa = !!activa;
  return { ok: true };
}

/** Ejecutar una entidad por id — con el motivo de dormida DECLARADO. */
export function ejecutarEntidad(id: string, datos: any): ResultadoEntidad {
  const t0 = Date.now();
  const e = entidadPorId(id);
  if (!e) {
    // Reflejo v3.0 · Paso 2 — si no está en las 40 curadas, buscar en el pool
    // de espejos personalizados (cargados desde ~/.cerebronico/espejos/).
    // Si el pool aún no se inicializó, devolver el motivo original.
    if (poolListo()) {
      const personalizado = buscarEnPool(id);
      if (personalizado) {
        try {
          const r = personalizado.ejecutar(datos ?? {});
          // Soporta sync y async; si devuelve Promise, lo resolvemos sin esperar.
          if (r instanceof Promise) {
            return { ok: false, entidad: id, ms: Date.now() - t0, motivo: "los espejos personalizados deben ser síncronos; el motor no espera su Promise (ver ESPEJOS_PERSONALIZADOS.md §2)." };
          }
          return r;
        } catch (e2: any) {
          return { ok: false, entidad: id, ms: Date.now() - t0, motivo: `el espejo personalizado «${id}» falló: ${e2?.message || e2}` };
        }
      }
    }
    return { ok: false, entidad: id, ms: 0, motivo: `no existe la entidad «${id}». Catálogo: /api/consejo/estado. Si es un espejo personalizado, asegúrate de que el manifest esté en ~/.cerebronico/espejos/ y reinicia.` };
  }
  if (!e.activa) return { ok: false, entidad: id, ms: 0, motivo: `«${id}» está DORMIDA: actívala con POST /api/consejo/entidad {id:"${id}",activa:true}.` };
  if (!e.ejecutar) return { ok: false, entidad: id, ms: 0, motivo: `«${id}» es especialista: se usa vía frase (POST /api/reflejo) o tarea "reflejo" con «frase».` };
  try {
    return e.ejecutar(datos);
  } catch (e2: any) {
    // Una herramienta que revienta lo dice; no propaga el petardo.
    return { ok: false, entidad: id, ms: Date.now() - t0, motivo: `la herramienta falló: ${e2?.message || e2}` };
  }
}

/**
 * El consejo pensado: el motor decide; el consejo ATRIBUYE y recuerda.
 * v1.6.33 · D7: la atribución pasa por el reparto único. `DUEÑO_DE` sigue
 * mandando para las acciones originales (compatibilidad con agentico.test);
 * el veredicto añade además el MOTIVO del voto — que es lo que faltaba para
 * poder decir «analizar» devuelto como «ayuda» era un robo de autoría.
 */
export function pensarConsejo(
  frase: string,
  tablas: Tablas
): ResultadoReflejo & { entidad?: string; voto?: { porVoto: boolean; razon: string } } {
  const res = pensar(frase, tablas);
  const clave = res.accion === "orden" && res.orden ? String((res.orden as any).tipo) : String(res.accion);
  const v = veredictoVoto(clave);
  const entidad = DUEÑO_DE[clave] || v.especialista;
  if (res.ok) recordar(entidad, (res.salida || "").slice(0, 120));
  return { ...res, entidad, voto: { porVoto: v.porVoto, razon: v.razon } };
}

export function estadoConsejo() {
  const esp = ENTIDADES.filter((e) => e.tipo === "especialista");
  const herr = ENTIDADES.filter((e) => e.tipo === "herramienta");
  // D7 (v1.6.33): el estado dice la VERDAD del reparto — quién recibe votos
//   por frase, quién está declarado sin voto, y qué acciones no pertenecen
  // a ningún especialista (se nombran, no se tapan).
  const conVoto = new Set(dueñosConVoto());
  return {
    ok: true,
    version: "cerebronico-agentico v1.1",
    total: ENTIDADES.length,
    especialistas: esp.map((e) => ({ id: e.id, descripcion: e.descripcion, vota_por_frase: conVoto.has(e.id) })),
    herramientas: herr.map((e) => ({ id: e.id, activa: e.activa, descripcion: e.descripcion })),
    cuenta: { especialistas: esp.length, herramientas: herr.length, activas: herr.filter((h) => h.activa).length, dormidas: herr.filter((h) => !h.activa).length },
    reparto: {
      votantes: VOTAN,
      con_voto_real: dueñosConVoto(),
      sin_voto: NO_VOTAN,
      sin_especialista: ["traducir", "instalar", "desplegar"],
    },
    nota: "51 entidades: 12 especialistas (10 reciben votos por frase; telemetría y memorista aportan herramientas, declarados no-votantes) + 39 herramientas (21 activas: las 10 de v2.5 + los 11 espejos, incluido el generalista principal; 18 con botón). traducir/instalar/desplegar NO tienen especialista a propósito: los atienden el modelo, el motor de dependencias y el sandbox, y el consejo lo dice. Los especialistas comparten las tablas del motor: una copia, no cincuenta. Si el pedido cruza dominios, espejo.generalista integra el equipo y devuelve la síntesis con procedencia.",
  };
}
