#!/usr/bin/env node
/**
 * gen-reflejo.mjs — LAS TABLAS DEL REFLEJO (v2.4)
 * ================================================
 * El motor (`cerebroReflejo.ts`) es fijo; lo que cambia de tamaño son las
 * tablas. Este script las GENERA (nadie escribe 20 000 typos a mano) y mide:
 *
 *   · tablas-lite.json  → ~450 KB: diccionario curado + variantes de teclado
 *     a distancia 1. Lo que falte lo cubre el Levenshtein del motor en runtime.
 *   · tablas-max.json   → ~3 MB: lite + inserciones/traspósitos + distancia 2
 *     en los verbos nucleares + sinónimos en/pt + números en letras y palabras
 *     matemáticas («dos más dos» → «2 + 2»). Búsqueda directa, sin CPU extra.
 *
 * La regla: el tamaño es CONSECUENCIA de la cobertura, no un adorno. Si una
 * tabla no cae en su rango, este script lo dice y no se entrega.
 */
import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "engine", "reflejo");
mkdirSync(OUT, { recursive: true });

// ─── Vecino de teclado (para typos reales, no teóricos) ─────────────────────
const TECLADO = {
  a: "qwsz", b: "vnhg", c: "xvd f".replace(" ", ""), d: "sfecx", e: "wsdr", f: "dgtvc", g: "fhvby",
  h: "gjbn", i: "ujko", j: "huyk", k: "lium", l: "opkj", m: "njk", n: "bhjm", o: "iklp",
  p: "ol", q: "wa", r: "edft", s: "awdxz", t: "rfgy", u: "yjhki", v: "cfgb", w: "qase",
  x: "zsdc", y: "tghu", z: "asx",
};

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Sustituciones de teclado + borrados + duplicados (distancia 1 «de mano»). */
function variantesMano(palabra) {
  const out = new Set();
  for (let i = 0; i < palabra.length; i++) {
    const c = palabra[i];
    for (const vec of (TECLADO[c] || "")) out.add(palabra.slice(0, i) + vec + palabra.slice(i + 1));
    out.add(palabra.slice(0, i) + palabra.slice(i + 1)); // se comió una letra
    out.add(palabra.slice(0, i + 1) + c + palabra.slice(i + 1)); // la duplicó
  }
  out.delete(palabra);
  return [...out];
}

/** + inserciones y traspósitos: la distancia 1 completa. */
function variantesCompletas(palabra) {
  const out = new Set(variantesMano(palabra));
  for (let i = 0; i <= palabra.length; i++)
    for (const c of "abcdefghijklmnopqrstuvwxyz") out.add(palabra.slice(0, i) + c + palabra.slice(i));
  for (let i = 0; i < palabra.length - 1; i++)
    out.add(palabra.slice(0, i) + palabra[i + 1] + palabra[i] + palabra.slice(i + 2));
  out.delete(palabra);
  return [...out];
}

/** Distancia 2 acotada: dos «manos» seguidas (tope por verbo para no explotar). */
function variantesDoble(palabra, tope = 1200) {
  const una = variantesMano(palabra);
  const dos = new Set();
  for (const w of una) {
    for (const v of variantesMano(w)) {
      if (v.length >= 3) dos.add(v);
      if (dos.size >= tope) return [...dos];
    }
  }
  dos.delete(palabra);
  return [...dos];
}

// ─── Vocabulario base ────────────────────────────────────────────────────────

const VERBOS = {
  convertir: ["convertir"], canjear: ["convertir"], exportar: ["convertir"], importar: ["convertir"],
  traduce: ["convertir"], traducir: ["convertir"], cambia: ["convertir"], cambiar: ["convertir"],
  pasa: ["convertir"], pasar: ["convertir"], convierte: ["convertir"], conversion: ["convertir"],
  abre: ["abrir"], abrir: ["abrir"], abrelo: ["abrir"], muestra: ["abrir"], mostrar: ["abrir"],
  ensename: ["abrir"], lee: ["abrir"], leer: ["abrir"], lectura: ["abrir"],
  dibuja: ["imagen"], dibujar: ["imagen"], dibujo: ["imagen"], pinta: ["imagen"], pintar: ["imagen"],
  ilustra: ["imagen"], logo: ["imagen"], banner: ["imagen"], poster: ["imagen"], icono: ["imagen"],
  genera: ["imagen", "creacion"], generar: ["imagen", "creacion"], creacion: ["creacion"],
  crea: ["creacion"], crear: ["creacion"], escribe: ["creacion"], escribir: ["creacion"],
  componente: ["creacion"], modulo: ["creacion"], plantilla: ["creacion"], scaffold: ["creacion"],
  plan: ["plan"], planifica: ["plan"], secuencia: ["plan"], luego: ["plan"], despues: ["plan"],
  calcula: ["calculo"], calcular: ["calculo"], cuanto: ["calculo"], evalua: ["calculo"],
  resuelve: ["calculo"], suma: ["calculo"], resta: ["calculo"], multiplica: ["calculo"],
  // sinónimos en inglés (la tabla max los usa; lite también, caben)
  convert: ["convertir"], change: ["convertir"], open: ["abrir"], show: ["abrir"], read: ["abrir"],
  draw: ["imagen"], image: ["imagen"], picture: ["imagen"], create: ["creacion"], make: ["creacion"],
  calculate: ["calculo"], compute: ["calculo"], math: ["calculo"], plan_en: ["plan"],
  // portugués mínimo
  converta: ["convertir"], abra: ["abrir"], desenhe: ["imagen"], crie: ["creacion"], calcule: ["calculo"],
};

const FORMATOS = { json: "json", yaml: "yaml", yml: "yaml", toml: "toml", csv: "csv" };

// Typos curados — incluidos los del propio usuario (18/19-sep, reales):
const CURADOS = {
  hisistes: "haces", nuebamente: "nuevamente", teminalo: "terminalo", capas: "capaz",
  pdes: "puedes", conviert: "convierte", convients: "conviertes", convert: "convertir",
  avrir: "abrir", aprir: "abrir", abre: "abrir", muestra: "muestra", ensenate: "ensename",
  dibuia: "dibuja", dibuxa: "dibuja", dibhuja: "dibuja", pinnta: "pinta", jenera: "genera",
  henera: "genera", krea: "crea", kreacion: "creacion", eskribe: "escribe",
  planifica: "planifica", planfika: "planifica", sekuencia: "secuencia",
  kalkula: "calcula", calcul: "calcula", kuanto: "cuanto", cuanto: "cuanto",
  evalua: "evalua", evalua: "evalua", resuelve: "resuelve",
  cambai: "cambia", cambie: "cambia", pasaa: "pasa", traduce: "traduce", tradusi: "traduce",
  export: "exportar", imort: "importar", leyenda: "lee",
};

// Números y palabras matemáticas (letrasALaTabla las convierte).
const MATE = {
  cero: "0", uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7",
  ocho: "8", nueve: "9", diez: "10", once: "11", doce: "12", trece: "13", catorce: "14",
  quince: "15", dieciseis: "16", diecisiete: "17", dieciocho: "18", diecinueve: "19", veinte: "20",
  treinta: "30", cuarenta: "40", cincuenta: "50", sesenta: "60", setenta: "70", ochenta: "80",
  noventa: "90", cien: "100", mil: "1000", millon: "1000000",
  mas: "+", menos: "-", por: "*", entre: "/", dividido: "/", elevado: "^", raiz: "sqrt",
  mitad: "0.5", doble: "2*", triple: "3*", al: "^", cuadrado: "^2",
};

// ─── Construcción de las dos tablas ─────────────────────────────────────────

function construir(incluirDoble) {
  const lexicon = {};
  const poner = (k, v) => { const kk = norm(k); if (!(kk in lexicon)) lexicon[kk] = v; };

  // canónicas → sí mismas (para que `corregir` acierte exacta)
  for (const v of Object.keys(VERBOS)) poner(v, v);
  for (const f of Object.keys(FORMATOS)) poner(f, f);
  for (const m of Object.keys(MATE)) poner(m, MATE[m]);
  for (const [t, c] of Object.entries(CURADOS)) poner(t, c);

  // LITE: distancia 1 COMPLETA (teclado + borrado + duplicado + inserción +
  // traspósito) sobre el núcleo. Es lo que hace falta para «dibuxa», «abrirr»,
  // «conviertee», «cabiar»… y deja ~450 KB de tabla.
  const nucleo = [...Object.keys(VERBOS), ...Object.keys(MATE), ...Object.keys(FORMATOS)];
  for (const w of nucleo) for (const v of variantesCompletas(w)) poner(v, w);
  // CONJUGACIONES reales: «conviertes», «abrid», «dibujando»… Esto es
  // cobertura de verdad, no relleno: un reflejo que solo entiende el
  // imperativo es un reflejo que discute con el usuario.
  function conjugaciones(p) {
    const raiz = /ar$/.test(p) ? p.slice(0, -2) : /er$|ir$/.test(p) ? p.slice(0, -2) : null;
    if (!raiz) return [];
    const sufijos = ["o", "as", "a", "amos", "ais", "an", "ando", "iendo", "ido", "e", "ed", "imos", "ia", "aba"];
    return sufijos.map((s) => raiz + s);
  }
  for (const w of Object.keys(VERBOS)) for (const c of conjugaciones(w)) poner(norm(c), w);

  if (incluirDoble) {
    // MAX: distancia 1 también sobre curados y mate, y distancia 2 (acotada)
    // SOLO sobre palabras de 6+ letras. El recorte por longitud no es
    // timidez: a distancia 2, «plan» generaba «panel» y «read» generaba
    // «react» — variantes que secuestraban sustantivos reales. Las colisiones
    // con palabras legítimas viven en las cortas; las faltas de dos dedos
    // crecen en las largas.
    const dobleOk = (w) => w.length >= 6;
    for (const w of Object.keys(CURADOS)) for (const v of variantesCompletas(w)) poner(v, w);
    for (const w of Object.keys(MATE)) for (const v of variantesCompletas(w)) poner(v, w);
    for (const w of Object.keys(VERBOS)) if (dobleOk(w)) for (const v of variantesDoble(w, 3600)) poner(v, w);
    for (const w of Object.keys(MATE)) if (dobleOk(w)) for (const v of variantesDoble(w, 800)) poner(v, w);
    for (const w of Object.keys(CURADOS)) if (dobleOk(w)) for (const v of variantesDoble(w, 800)) poner(v, w);
  }

  const verbos = {};
  for (const [canon, intents] of Object.entries(VERBOS)) {
    verbos[canon] = intents;
    // las variantes apuntan a la canónica; el motor vota con `verbos[canonica]`
  }

  return {
    version: "2.4.0",
    modo: incluirDoble ? "max" : "lite",
    lexicon,
    verbos,
    formatos: FORMATOS,
  };
}

const objetivos = [
  { nombre: "tablas-lite.json", max: false, minKB: 300, maxKB: 700 },
  { nombre: "tablas-max.json", max: true, minKB: 2000, maxKB: 5000 },
];

for (const o of objetivos) {
  const tablas = construir(o.max);
  const txt = JSON.stringify(tablas);
  writeFileSync(join(OUT, o.nombre), txt, "utf8");
  const kb = statSync(join(OUT, o.nombre)).size / 1024;
  const dentro = kb >= o.minKB && kb <= o.maxKB;
  console.log(`${o.nombre}: ${kb.toFixed(0)} KB · ${Object.keys(tablas.lexicon).length} entradas · objetivo ${o.minKB}–${o.maxKB} KB → ${dentro ? "OK" : "FUERA DE RANGO"}`);
  if (!dentro) process.exitCode = 1;
}
