/**
 * roundtrip.test.ts — VALIDADOR DE IDA Y VUELTA (v2.2)
 * ====================================================
 * Convierte A → B → A y compara. No con un caso: con la **matriz completa de
 * formatos × configuraciones × formas de datos**, toda en un lote.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CÓMO SE JUZGA CADA CELDA (esto es lo importante)
 * ─────────────────────────────────────────────────────────────────────────────
 *   PERFECTO            volvió exactamente lo mismo
 *   PÉRDIDA DECLARADA   no volvió igual, pero la conversión LO DIJO antes
 *   ★ PÉRDIDA SILENCIOSA no volvió igual y NADIE avisó  ← ESTO ES UN FALLO
 *   IMPOSIBLE DECLARADO  no se pudo convertir, con un motivo claro
 *
 * La prueba falla si aparece una sola pérdida silenciosa. Un conversor que
 * pierde datos avisando sirve; uno que los pierde callando es una trampa.
 *
 * Se ejecuta con:  npx tsx tests/roundtrip.test.ts
 */

import { FORMATOS, convertir, idaYVuelta, type Formato, type OpcionesConversion } from "../src/engine/formatConverter";

let perfectos = 0;
let declarados = 0;
let silenciosos = 0;
let imposibles = 0;
const fallos: string[] = [];

const AMARILLO = "\x1b[33m";
const ROJO = "\x1b[31m";
const VERDE = "\x1b[32m";
const GRIS = "\x1b[90m";
const FIN = "\x1b[0m";

// ─── Corpus: formas de datos que se comportan MUY distinto ──────────────────

interface Fixtura {
  nombre: string;
  json: string;
  /** Si el formato destino no puede representarla, se declara y se salta. */
  noVaBien?: Formato[];
}

const FIXTURAS: Fixtura[] = [
  { nombre: "objeto plano", json: JSON.stringify({ nombre: "CerebroNico", version: "2.2", activo: true, puerto: 3500 }) },
  {
    nombre: "anidado",
    json: JSON.stringify({ motor: { modelos: { local: "qwen2.5", nube: "gemini" }, ram: 8 }, planes: { max: 40 } }),
  },
  {
    nombre: "listas de escalares",
    json: JSON.stringify({ formatos: ["json", "yaml", "toml", "csv"], puertos: [3000, 3500, 5000] }),
  },
  {
    nombre: "tabla (lista de objetos)",
    json: JSON.stringify([
      { id: 1, titulo: "leer", peso: "io" },
      { id: 2, titulo: "indexar", peso: "cpu" },
    ]),
  },
  {
    nombre: "texto con comas, comillas y saltos",
    json: JSON.stringify({ a: 'dice "hola", y sigue', b: "linea1\nlinea2", c: "con,coma" }),
  },
  { nombre: "nulos y booleanos", json: JSON.stringify({ a: null, b: true, c: false, d: 0, e: "" }) },
  { nombre: "enteros enormes (>2^53)", json: JSON.stringify({ seguro: 9007199254740991, inseguro: 9007199254740993 }) },
  { nombre: "decimales", json: JSON.stringify({ pi: 3.14159, negativo: -0.5, cero: 0 }) },
  { nombre: "claves raras", json: JSON.stringify({ "con espacio": 1, "con-punto": 2, "con_guion": 3, "UPPER": 4 }) },
  { nombre: "objeto vacío", json: JSON.stringify({}) },
];

// ─── Configuraciones: la misma conversión, ajustada distinto ────────────────

const CONFIGS: Array<{ nombre: string; op: OpcionesConversion }> = [
  { nombre: "por defecto", op: {} },
  { nombre: "sangría 4", op: { indentacion: 4 } },
  { nombre: "claves ordenadas", op: { ordenarClaves: true } },
  { nombre: "CSV con punto y coma", op: { separadorCsv: ";" } },
  { nombre: "inferir tipos CSV", op: { inferirTiposCsv: true } },
  { nombre: "todo junto", op: { indentacion: 4, ordenarClaves: true, separadorCsv: ";", inferirTiposCsv: true } },
];

// ─── Motor de la matriz ─────────────────────────────────────────────────────

interface Celda {
  fixtura: string;
  desde: Formato;
  hacia: Formato;
  config: string;
  veredicto: "PERFECTO" | "DECLARADO" | "SILENCIOSO" | "IMPOSIBLE" | "SALTADO";
  detalle: string;
}

async function correrCelda(f: Fixtura, desde: Formato, hacia: Formato, cfg: { nombre: string; op: OpcionesConversion }): Promise<Celda> {
  const base = { fixtura: f.nombre, desde, hacia, config: cfg.nombre };

  // El texto de partida en `desde`: si no es JSON, se obtiene convirtiendo.
  let texto: string;
  if (desde === "json") texto = f.json;
  else {
    const prep = convertir(f.json, "json", desde, cfg.op);
    if (!prep.ok) return { ...base, veredicto: "SALTADO", detalle: `no se pudo preparar el origen: ${prep.error}` };
    texto = prep.salida;
  }

  const r = idaYVuelta(texto, desde, hacia, cfg.op);
  if (!r.ok) {
    // Imposible no es fallo… si explica POR QUÉ. Un error vacío sí lo es.
    const claro = !!r.error && r.error.length > 20 && /no se pudo|No se pudo/.test(r.error);
    return { ...base, veredicto: "IMPOSIBLE", detalle: claro ? r.error! : `error poco claro: «${r.error}»` };
  }
  if (r.igual) return { ...base, veredicto: "PERFECTO", detalle: "" };
  if (r.perdidasDeclaradas.length > 0) {
    return { ...base, veredicto: "DECLARADO", detalle: r.perdidasDeclaradas.map((p) => `${p.que}`).join(" + ") };
  }
  return { ...base, veredicto: "SILENCIOSO", detalle: r.diferencias.slice(0, 3).join(" | ") };
}

async function matriz(etiqueta: string): Promise<Celda[]> {
  const tareas: Array<Promise<Celda>> = [];
  for (const f of FIXTURAS) for (const desde of FORMATOS) for (const hacia of FORMATOS) {
    if (desde === hacia) continue;
    for (const cfg of CONFIGS) tareas.push(correrCelda(f, desde, hacia, cfg));
  }
  console.log(`  ${etiqueta}: ${tareas.length} conversiones de ida y vuelta…`);
  const celdas = await Promise.all(tareas);
  return celdas;
}

function resumir(celdas: Celda[]): void {
  for (const c of celdas) {
    if (c.veredicto === "PERFECTO") perfectos++;
    else if (c.veredicto === "DECLARADO") declarados++;
    else if (c.veredicto === "SALTADO") imposibles++;
    else if (c.veredicto === "IMPOSIBLE") imposibles++;
    else {
      silenciosos++;
      fallos.push(`${c.fixtura} · ${c.desde}→${c.hacia}→${c.desde} [${c.config}] ${c.detalle}`);
    }
  }
}

function imprimirMatriz(celdas: Celda[]): void {
  const simbolo: Record<Celda["veredicto"], string> = {
    PERFECTO: `${VERDE}.${FIN}`,
    DECLARADO: `${AMARILLO}o${FIN}`,
    SILENCIOSO: `${ROJO}X${FIN}`,
    IMPOSIBLE: `${GRIS}-${FIN}`,
    SALTADO: `${GRIS}s${FIN}`,
  };
  console.log(`\n  Una fila por forma de datos, una columna por par ida/vuelta (todas las configuraciones juntas)\n`);
  const pares: string[] = [];
  for (const a of FORMATOS) for (const b of FORMATOS) if (a !== b) pares.push(`${a[0]}${b[0]}`);
  console.log(`  ${"".padEnd(34)}${pares.join(" ")}`);
  console.log(`  ${"".padEnd(34)}${pares.map((p) => p[1]).join(" ")}`);
  for (const f of FIXTURAS) {
    const fila = pares.map((p) => {
      const a = FORMATOS.find((x) => x[0] === p[0])!;
      const b = FORMATOS.find((x) => x[0] === p[1])!;
      const cs = celdas.filter((c) => c.fixtura === f.nombre && c.desde === a && c.hacia === b);
      if (cs.length === 0) return " ";
      if (cs.some((c) => c.veredicto === "SILENCIOSO")) return simbolo.SILENCIOSO;
      if (cs.every((c) => c.veredicto === "PERFECTO")) return simbolo.PERFECTO;
      if (cs.every((c) => c.veredicto === "SALTADO" || c.veredicto === "IMPOSIBLE")) return simbolo.IMPOSIBLE;
      return simbolo.DECLARADO;
    });
    console.log(`  ${f.nombre.padEnd(34)}${fila.join("  ")}`);
  }
  console.log(
    `\n  ${VERDE}.${FIN} perfecto   ${AMARILLO}o${FIN} pérdida declarada   ${ROJO}X${FIN} PÉRDIDA SILENCIOSA   ${GRIS}-${FIN} imposible (declarado)   ${GRIS}s${FIN} saltado`
  );
}

// ─── Pruebas concretas, además de la matriz ─────────────────────────────────

function pruebasDirigidas(): void {
  const comprobar = (nombre: string, cond: boolean, detalle = "") => {
    if (cond) console.log(`  ${VERDE}PASS ${FIN} ${nombre}`);
    else {
      console.log(`  ${ROJO}FALLO${FIN} ${nombre}${detalle ? `  ·  ${detalle}` : ""}`);
      fallos.push(nombre);
      silenciosos++;
    }
  };

  console.log("\n── Casos concretos ──");

  // Ojo con este caso, que ya me equivoqué una vez al escribirlo: un `flow mapping`
  // («{"a":1}») seguido de claves en bloque NO es YAML válido, y el fallo que salía
  // era del caso de prueba, no del conversor. El validador tiene que empezar por
  // ser válido él mismo.
  const c1 = convertir("# nota importante\nalias: &x 5\nuso: *x\na: 1\n", "yaml", "json");
  comprobar("YAML→JSON declara comentarios y anclas", c1.ok && c1.informe.perdidas.some((p) => p.que === "comentarios") && c1.informe.perdidas.some((p) => /anclas/.test(p.que)), JSON.stringify(c1.informe.perdidas.map((p) => p.que)));

  const c2 = convertir('titulo = "x"\n# comentario\np = 1\n', "toml", "json");
  comprobar("TOML→JSON declara el comentario", c2.ok && c2.informe.perdidas.some((p) => p.que === "comentarios"));

  const c3 = convertir('{"a":null,"b":1}', "json", "toml");
  comprobar("JSON→TOML NO escribe «null» de mentira: omite el nulo y lo declara", c3.ok && !/null/.test(c3.salida) && c3.informe.perdidas.some((p) => p.que === "valores nulos"), c3.salida.replace(/\n/g, " "));

  const c4 = convertir('{"a":{"b":1}}', "json", "csv");
  comprobar("JSON→CSV declara las celdas anidadas", c4.ok && c4.informe.perdidas.some((p) => /anidadas/.test(p.que)), c4.salida.replace(/\n/g, " "));

  const c5 = convertir('id,titulo\n1,"leer, y escribir"\n', "csv", "json");
  comprobar("CSV con coma entre comillas no se rompe", c5.ok && JSON.parse(c5.salida)[0].titulo === "leer, y escribir", c5.salida);

  const c6 = convertir('{"n":9007199254740993}', "json", "yaml");
  comprobar("avisa de enteros que pierden exactitud", c6.informe.avisos.some((a) => /2\^53/.test(a)));

  const c7 = idaYVuelta('{"a":1,"b":[1,2,3]}', "json", "yaml");
  comprobar("JSON→YAML→JSON vuelve idéntico", c7.ok && c7.igual, c7.diferencias.join(" | "));

  const c8 = idaYVuelta('{"a":1,"b":[1,2,3]}', "json", "toml");
  comprobar("JSON→TOML→JSON vuelve idéntico", c8.ok && c8.igual, c8.diferencias.join(" | "));

  const c9 = idaYVuelta('{"a":"hola","b":1}', "json", "csv");
  comprobar("JSON→CSV→JSON: los tipos no vuelven, y está declarado", c9.ok && !c9.igual && c9.perdidasDeclaradas.length > 0, `igual=${c9.igual} perdidas=${c9.perdidasDeclaradas.length}`);

  const c10 = convertir("esto no es json", "json", "yaml");
  comprobar("una entrada inválida falla con motivo claro", !c10.ok && !!c10.error && c10.error.length > 20, c10.error);

  const c11 = idaYVuelta("[1,2,3]", "json", "yaml");
  comprobar("una lista como raíz sobrevive a YAML", c11.ok && c11.igual, c11.diferencias.join(" | "));

  const c12 = idaYVuelta('[{"a":1,"b":"x"},{"a":2,"b":"y"}]', "json", "csv", { inferirTiposCsv: true });
  comprobar("una tabla JSON→CSV→JSON con inferencia vuelve igual", c12.ok && c12.igual, c12.diferencias.join(" | "));
}

// ─── Ejecución ──────────────────────────────────────────────────────────────

(async () => {
  console.log("═══ VALIDADOR DE IDA Y VUELTA · CerebroNico v2.2 ═══");
  console.log(`  ${FORMATOS.length} formatos · ${FIXTURAS.length} formas de datos · ${CONFIGS.length} configuraciones`);
  console.log(`  ${FORMATOS.length * (FORMATOS.length - 1)} pares × ${FIXTURAS.length} × ${CONFIGS.length} = ${FORMATOS.length * (FORMATOS.length - 1) * FIXTURAS.length * CONFIGS.length} conversiones de ida y vuelta`);

  // En un lote (todas a la vez) y también en fila india, para poder comparar.
  const t0 = Date.now();
  const celdas = await matriz("lote");
  const tLote = Date.now() - t0;

  const t1 = Date.now();
  const secuenciales: Celda[] = [];
  for (const f of FIXTURAS) for (const desde of FORMATOS) for (const hacia of FORMATOS) {
    if (desde === hacia) continue;
    for (const cfg of CONFIGS) secuenciales.push(await correrCelda(f, desde, hacia, cfg));
  }
  const tSecuencial = Date.now() - t1;

  imprimirMatriz(celdas);
  resumir(celdas);
  pruebasDirigidas();

  console.log(`\n── Tiempos (${celdas.length} conversiones de ida y vuelta) ──`);
  console.log(`  en un lote ........ ${tLote} ms`);
  console.log(`  una tras otra ..... ${tSecuencial} ms`);
  console.log(
    `  ${GRIS}y esto es la prueba de algo que ya estaba escrito en advancedFeatures.ts: estas conversiones son cálculo puro y brevísimo, así que repartirlas entre procesos no las aceleraría — sería contención. El valor está en la MATRIZ, no en el paralelismo.${FIN}`
  );

  console.log(`\n═══ RESULTADO: ${perfectos} perfectas · ${declarados} con pérdida declarada · ${imposibles} imposibles declaradas · ${silenciosos} SILENCIOSAS ═══`);
  if (fallos.length > 0) {
    console.log(`\n${ROJO}PÉRDIDAS SILENCIOSAS (esto es lo que hay que arreglar):${FIN}`);
    fallos.forEach((f) => console.log(`  · ${f}`));
  } else {
    console.log(`${VERDE}  Ninguna pérdida silenciosa: cuando algo se pierde, se dice.${FIN}`);
  }
  process.exitCode = silenciosos > 0 ? 1 : 0;
})();
