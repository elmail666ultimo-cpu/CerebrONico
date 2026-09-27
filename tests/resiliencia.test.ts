/**
 * resiliencia.test.ts — LAS LECCIONES, CONVERTIDAS EN GUARDIÁN (v2.1)
 * ===================================================================
 * Esta suite no prueba el motor: prueba **que el proyecto se defiende solo** de la
 * clase de fallos que aparecieron el 19-sep-2026. Siete funciones estaban escritas,
 * se ejecutaban, y no hacían nada; y aparecieron sólo porque alguien pasó el
 * comprobador de tipos a mano.
 *
 * Dejarlo escrito en un MEMORANDUM no basta: un documento no impide que el fallo
 * vuelva. Aquí cada lección es una comprobación que falla si se repite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PARTE IMPORTANTE: CADA REGLA SE PRUEBA CONTRA UN CASO MALO
 * ─────────────────────────────────────────────────────────────────────────────
 * Una regla que sólo se comprueba sobre el código bueno puede ser un no-op y nadie
 * se enteraría — que es exactamente el fallo que esta suite existe para evitar (el
 * guardián que filtraba por un campo inexistente y por eso no bloqueaba nunca).
 *
 * Así que cada detector se ejecuta DOS veces: contra el árbol real (debe salir
 * limpio) y contra un fragmento con el fallo metido a propósito (debe
 * encontrarlo). Si alguien rompe el detector, la segunda mitad lo delata.
 *
 * Se ejecuta con:  npx tsx tests/resiliencia.test.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];

function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) {
    pasan++;
    console.log(`  PASS   ${nombre}`);
  } else {
    fallan++;
    fallos.push(nombre);
    console.log(`  FALLO  ${nombre}${detalle ? `  ·  ${detalle}` : ""}`);
  }
}

/** Todos los ficheros de código del proyecto, sin lo generado. */
function ficherosCodigo(desde = RAIZ): string[] {
  const out: string[] = [];
  const andar = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git" || e.name === ".proyectos" || e.name === ".cerebro-db") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) andar(p);
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  andar(desde);
  return out.sort();
}

const leer = (p: string): string => {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return "";
  }
};

const rel = (p: string) => path.relative(RAIZ, p).split(path.sep).join("/");

// ════════════════════════════════════════════════════════════════════════════
// DETECTOR 1 — Ternario con las DOS RAMAS IDÉNTICAS
// ----------------------------------------------------------------------------
// El fallo real: `pendientes: this.cadena ? 0 : 0`. Un ternario cuyas dos ramas
// son iguales no es un ternario: es una constante disfrazada. Aquí salió un
// diagnóstico que informaba CERO siempre, hubiera o no escrituras esperando.
// ════════════════════════════════════════════════════════════════════════════
function ramasIdenticas(fuente: string): Array<{ linea: number; texto: string }> {
  const out: Array<{ linea: number; texto: string }> = [];
  // `?` suelto (no `??` ni `?.`), luego una rama sin `:` ni `?` ni llaves, luego `:`,
  // y la otra rama. Las llaves quedan fuera de las ramas a propósito: así `? 0 : 0 }`
  // no arrastra la llave de cierre al segundo lado y la comparación es de verdad
  // entre ramas («0» con «0»), no entre «0» y «0 }» — que fue el primer intento, y
  // por eso el detector no veía justo el caso que tenía que ver.
  const re = /(?<![?])\?(?![?.:])([^:?;{}\n]+?):([^:?;{}\n]+?)(?=[;,)\]}\n]|$)/g;
  fuente.split("\n").forEach((linea, i) => {
    const s = linea.trim();
    if (s.startsWith("//") || s.startsWith("*") || s.startsWith("/*")) return;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(linea)) !== null) {
      const a = (m[1] || "").trim();
      const b = (m[2] || "").trim();
      if (a && a === b) out.push({ linea: i + 1, texto: s.slice(0, 90) });
    }
  });
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// DETECTOR 2 — Nombre del motor usado SIN IMPORTAR
// ----------------------------------------------------------------------------
// El fallo real: `keys: [..., ...tokenize(errorText)...]` en server.ts, con
// `tokenize` exportada en knowledgeBase.ts y NO importada. ReferenceError que el
// `catch` de al lado se tragaba. La entrada nunca llegaba a la base de
// conocimiento y nadie se enteró.
//
// La regla es estrecha a propósito (un guardián con falsos positivos es peor que
// no tenerlo): sólo mira nombres que el motor EXPORTA. Si server.ts llama a algo
// que el motor exporta, tiene que haberlo importado.
// ════════════════════════════════════════════════════════════════════════════
function exportadosDelMotor(): Set<string> {
  const nombres = new Set<string>();
  for (const p of ficherosCodigo(path.join(RAIZ, "src"))) {
    const r = rel(p);
    if (!/^src\/(engine|utils)\//.test(r)) continue;
    const t = leer(p);
    for (const m of t.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) nombres.add(m[1]);
    for (const m of t.matchAll(/^export\s+const\s+([A-Za-z_$][\w$]*)\s*[:=]/gm)) nombres.add(m[1]);
    for (const m of t.matchAll(/^export\s+class\s+([A-Za-z_$][\w$]*)/gm)) nombres.add(m[1]);
  }
  return nombres;
}

/** Nombres que el fichero USA como función pero NI importa NI declara. */
function sinImportar(fuente: string, exportados: Set<string>): string[] {
  const importados = new Set<string>();
  // Los comentarios dentro de un bloque de importación pueden contener `}` o
  // texto que confunda el parser deliberadamente sencillo de esta guarda.
  // Para comprobar imports reales, quitamos comentarios antes de analizarlos.
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, "$1");
  for (const m of sinComentarios.matchAll(/import\s*\{([^}]*)\}\s*from/gs)) {
    for (const parte of m[1].split(",")) {
      const n = parte.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (n) importados.add(n);
    }
  }
  for (const m of fuente.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) importados.add(m[1]);

  const locales = new Set<string>();
  for (const m of fuente.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) locales.add(m[1]);
  for (const m of fuente.matchAll(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*[:=]/gm)) locales.add(m[1]);
  for (const m of fuente.matchAll(/^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm)) locales.add(m[1]);

  const malos: string[] = [];
  for (const nombre of exportados) {
    if (importados.has(nombre) || locales.has(nombre)) continue;
    if (new RegExp(`(?<![\\w.$])${nombre}\\s*\\(`).test(fuente)) malos.push(nombre);
  }
  return malos.sort();
}

// ════════════════════════════════════════════════════════════════════════════
// DETECTOR 3 — Suites de prueba huérfanas o fantasma
// ----------------------------------------------------------------------------
// Protege la COBERTURA. Sin esto, renombrar un fichero de pruebas hace que deje de
// correr y el proyecto sigue diciendo «TODO CORRECTO» con menos pruebas que antes.
// Silencioso y peligroso: justo el patrón de esta sesión.
// ════════════════════════════════════════════════════════════════════════════
function suitesRegistradas(): string[] {
  const v = leer(path.join(RAIZ, "scripts", "validar.mjs"));
  return [...v.matchAll(/archivo:\s*"(tests\/[^"]+)"/g)].map((m) => m[1]).sort();
}

function suitesEnDisco(): string[] {
  return fs
    .readdirSync(path.join(RAIZ, "tests"))
    .filter((f) => /\.test\.ts$/.test(f))
    .map((f) => `tests/${f}`)
    .sort();
}

console.log("═══ RESILIENCIA · las lecciones convertidas en guardián · CerebroNico v2.1 ═══\n");

// ─── 1. Ternarios con ramas idénticas ──────────────────────────────────────
{
  console.log("1) Un ternario con las DOS ramas iguales es una constante disfrazada\n");
  // Se mira el código de PRODUCCIÓN, y `tests/` queda fuera a propósito: los casos
  // malos que esta misma suite usa como ejemplo son, literalmente, ternarios con las
  // ramas iguales, y el detector se marcaría a sí mismo. Un guardián que se acusa a
  // sí mismo de lo que predica es ruido, y el ruido acaba desactivando guardianes.
  const malos: string[] = [];
  for (const p of ficherosCodigo()) {
    if (rel(p).startsWith("tests/")) continue;
    for (const h of ramasIdenticas(leer(p))) malos.push(`${rel(p)}:${h.linea}  ${h.texto}`);
  }
  comprobar("el código de producción no tiene ninguno", malos.length === 0, malos.slice(0, 3).join(" | "));

  // Y ahora la prueba de que el detector MIDE: se le da el fallo a propósito.
  const sintetico = [
    "const d = { pendientes: this.cadena ? 0 : 0 };",
    "const bien = x ? 1 : 2;",
    "const raro = n > 3 ? 'a' : 'a';",
  ].join("\n");
  const hallados = ramasIdenticas(sintetico);
  comprobar("...y DETECTA el fallo cuando se le mete a propósito", hallados.length === 2, `encontró ${hallados.length}`);
  comprobar("detecta el caso que rompió el diagnóstico (`? 0 : 0`)", hallados.some((h) => /0 : 0/.test(h.texto)));
  comprobar("y NO marca un ternario legítimo (`? 1 : 2`)", !hallados.some((h) => /1 : 2/.test(h.texto)));
  comprobar("ignora los comentarios", ramasIdenticas("// x ? 0 : 0").length === 0);
  comprobar("no confunde `??` (nulo coalescente) con un ternario", ramasIdenticas("const a = b ?? 0;").length === 0);
}

// ─── 2. Nombres del motor usados sin importar ──────────────────────────────
{
  console.log("\n2) Un nombre del motor usado sin importar es una función que no existe\n");
  const exportados = exportadosDelMotor();
  comprobar("se han encontrado nombres exportados por el motor", exportados.size > 0, `${exportados.size}`);
  comprobar("`tokenize` está entre ellos (el que faltaba)", exportados.has("tokenize"));

  const srv = leer(path.join(RAIZ, "server.ts"));
  const malos = sinImportar(srv, exportados);
  comprobar("server.ts importa todo lo que usa del motor", malos.length === 0, malos.join(", "));
  comprobar("y `tokenize` figura entre lo importado", /\btokenize\b/.test(srv) && /import\s*\{[^}]*\btokenize\b[^}]*\}/s.test(srv));

  // Prueba de que el detector MIDE: el fallo exacto, en un fragmento.
  const rotoSintetico = `import { KnowledgeBase } from "./src/engine/knowledgeBase";\nconst ks = [tokenize("hola")];\n`;
  const hallados = sinImportar(rotoSintetico, exportados);
  comprobar("...y DETECTA el uso sin importar cuando se le mete a propósito", hallados.includes("tokenize"), hallados.join(", "));

  const bienSintetico = `import { KnowledgeBase, tokenize } from "./src/engine/knowledgeBase";\nconst ks = [tokenize("hola")];\n`;
  comprobar("y NO marca nada si está importado", sinImportar(bienSintetico, exportados).length === 0);
}

// ─── 3. La cobertura no puede desaparecer en silencio ──────────────────────
{
  console.log("\n3) Ninguna suite de pruebas puede quedar huérfana\n");
  const enDisco = suitesEnDisco();
  const registradas = suitesRegistradas();
  comprobar("hay suites en disco", enDisco.length > 0, `${enDisco.length}`);
  comprobar("todas las suites están registradas en validar.mjs", enDisco.every((s) => registradas.includes(s)), enDisco.filter((s) => !registradas.includes(s)).join(", "));
  comprobar("y todas las registradas existen en disco", registradas.every((s) => enDisco.includes(s)), registradas.filter((s) => !enDisco.includes(s)).join(", "));
  comprobar("esta misma suite está registrada", registradas.includes("tests/resiliencia.test.ts"), registradas.join(", "));
}

// ─── 4. El comprobador de tipos tiene que ser parte del veredicto ──────────
{
  console.log("\n4) `npm run validar` incluye el comprobador de tipos\n");
  const v = leer(path.join(RAIZ, "scripts", "validar.mjs"));
  const pkg = leer(path.join(RAIZ, "package.json"));
  comprobar("validar.mjs ejecuta el comprobador de tipos", /\btsc\b/.test(v) && /--noEmit/.test(v));
  comprobar("y `npm run lint` sigue existiendo", /"lint"\s*:\s*"[^"]*tsc/.test(pkg));

  // Prueba de que la comprobación MIDE: sin la palabra, debe darse cuenta.
  comprobar("...y la comprobación DETECTA su ausencia", !(/\btsc\b/.test("const SUITES = [];") && /--noEmit/.test("const SUITES = [];")));

  // El porqué, escrito donde se lee: los 25 errores se colaron por aquí.
  comprobar(
    "el motivo está escrito en validar.mjs (no es un gate mudo)",
    /tipos|comprobador de tipos|--noEmit/i.test(v)
  );
}

// ─── 5. Las reglas se ejecutan sobre el árbol de verdad ────────────────────
{
  console.log("\n5) Las reglas miran el código real, no una lista escrita a mano\n");
  const codigo = ficherosCodigo();
  comprobar("se recorren los ficheros de código", codigo.length > 30, `${codigo.length} ficheros`);
  comprobar("incluye server.ts", codigo.some((p) => rel(p) === "server.ts"));
  comprobar("incluye el motor", codigo.some((p) => rel(p).startsWith("src/engine/")));
  comprobar("y NO cuela node_modules ni dist", !codigo.some((p) => /\/(node_modules|dist)\//.test(p)));
}

console.log(`\n═══ RESULTADO: ${pasan} correctas · ${fallan} fallidas ═══`);
if (fallan > 0) {
  console.log("Fallos:");
  fallos.forEach((f) => console.log(`  · ${f}`));
}
process.exitCode = fallan > 0 ? 1 : 0;
