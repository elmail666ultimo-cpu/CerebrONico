#!/usr/bin/env node
/**
 * superficie.mjs — EL CONTRATO DE LAS RUTAS, GENERADO (Fase 2, primer paso)
 * ========================================================================
 * QUÉ ES: el generador y verificador del contrato de superficie HTTP del
 * monolito `server.ts` (127 rutas), y el generador del ORDEN DE TRABAJO por
 * dominios con el que se hará la Fase 2.
 * PARA QUÉ SIRVE: para poder mover 11.660 líneas de servidor sin perder ninguna
 * ruta por el camino. Es el paso que el plan exige ANTES de tocar el monolito:
 * sin contrato, partir `server.ts` es un acto de fe; con contrato, es un
 * movimiento que se comprueba en cada paso.
 *
 * POR QUÉ SE GENERA Y NO SE ESCRIBE A MANO
 * Un contrato escrito a mano se puede editar para tapar la pérdida que debería
 * detectar. Generado desde el código, la única forma de cambiar el contrato es
 * cambiar el código — y eso es exactamente lo que se quiere vigilar.
 *
 * USO
 *   node scripts/superficie.mjs             → genera contrato-rutas.json + SUPERFICIE_RUTAS.md
 *   node scripts/superficie.mjs --verificar  → comprueba el contrato contra el código
 *   node scripts/superficie.mjs --seco       → calcula y dice qué saldría, SIN ESCRIBIR
 *
 * PARA QUÉ EXISTE EL MODO SECO: la suite comprobaba el generador ejecutándolo, y
 * ejecutarlo ESCRIBE el contrato… con un presupuesto de líneas recalculado. Es
 * decir: la propia comprobación podía tapar el trinquete que debe vigilar (basta
 * con crecer y correr la suite una vez). El modo seco permite comprobar que el
 * generador funciona sin que toque el fichero que se está vigilando.
 *
 * QUÉ SE VIGILA (y qué no, para no ser un guardián que grita en falso)
 *   · RUTA PERDIDA (en el contrato y ya no en el código) → ROJO. Es el fallo que
 *     esta pieza existe para cazar.
 *   · GUARD PERDIDO (una ruta que tenía guard y ya no) → ROJO. Sería aflojar la
 *     seguridad sin decirlo (Fase 1).
 *   · RUTA DUPLICADA (mismo método y ruta dos veces) → ROJO. En Express la
 *     segunda tapa a la primera: hay código que nunca se ejecuta.
 *   · PRESUPUESTO DE LÍNEAS superado → ROJO. Un trinquete: `server.ts` no puede
 *     crecer. Obliga a que la Fase 2 sea «partir», no «añadir».
 *   · RUTA NUEVA → AVISO, no rojo. Añadir una ruta es legítimo; lo que no se
 *     permite es añadirla y no enterarse.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(AQUI, "..");
const SERVIDOR = path.join(BACKEND, "server.ts");
const CONTRATO = path.join(BACKEND, "contrato-rutas.json");
const ORDEN = path.join(BACKEND, "SUPERFICIE_RUTAS.md");

/**
 * Extrae la superficie real leyendo el código. Determinista y sin adivinar.
 *
 * EL DETALLE DEL GUARD QUE HAY QUE HACER BIEN: su cuerpo se acota con la ruta
 * SIGUIENTE, no con una ventana de caracteres. La primera versión usaba 700
 * caracteres y una ruta corta sin guard heredaba el guard de su vecina: el
 * contrato decía 29 rutas protegidas cuando hay 27, y ese número inflado habría
 * tapado justo lo que hay que vigilar (que un guard desaparezca) porque el
 * margen falso lo compensaba. Un medidor que se equivoca al alza es peor que
 * uno que no existe: da tranquilidad sin motivo.
 */
export function extraerRutas(fuente) {
  const re = /app\.(get|post|put|delete|patch|all)\(\s*"([^"]*)"/g;
  const crudos = [];
  let m;
  while ((m = re.exec(fuente)) !== null) {
    crudos.push({ metodo: m[1].toUpperCase(), ruta: m[2], indice: m.index });
  }
  return crudos.map((c, i) => {
    const fin = i + 1 < crudos.length ? crudos[i + 1].indice : fuente.length;
    const cuerpo = fuente.slice(c.indice, fin); // el manejador, y solo el manejador
    return {
      metodo: c.metodo,
      ruta: c.ruta,
      // Línea 1-based del registro: se cuenta hasta el índice del match.
      linea: fuente.slice(0, c.indice).split("\n").length,
      dominio: (c.ruta.split("/")[2] || "raiz").replace(/[^a-z0-9-]/gi, "") || "raiz",
      guarda: cuerpo.includes("sandboxAuthorized(req)"),
    };
  });
}

/** Compara el contrato con el código. Devuelve el veredicto con motivos. */
export function comparar(contrato, rutas, lineasServidor) {
  const clave = (r) => `${r.metodo} ${r.ruta}`;
  const enContrato = new Map(contrato.rutas.map((r) => [clave(r), r]));
  const enCodigo = new Map(rutas.map((r) => [clave(r), r]));

  const perdidas = contrato.rutas.filter((r) => !enCodigo.has(clave(r)));
  const nuevas = rutas.filter((r) => !enContrato.has(clave(r)));
  const guardPerdido = contrato.rutas.filter(
    (r) => r.guarda && enCodigo.has(clave(r)) && !enCodigo.get(clave(r)).guarda
  );
  // Rutas que se han MUDADO de fichero (del monolito a un módulo, o al revés).
  // No es un fallo: es exactamente el trabajo de la Fase 2, y se informa para que
  // el progreso se pueda ver sin abrir nada.
  const movidas = contrato.rutas
    .filter((r) => enCodigo.has(clave(r)) && r.archivo !== enCodigo.get(clave(r)).archivo)
    .map((r) => ({ ...enCodigo.get(clave(r)), antesEn: r.archivo }));

  // Duplicados: mismo método y ruta registrados más de una vez.
  const vistos = new Map();
  const duplicadas = [];
  for (const r of rutas) {
    const k = clave(r);
    if (vistos.has(k)) duplicadas.push({ ...r, primeraLinea: vistos.get(k).linea });
    else vistos.set(k, r);
  }

  const presupuesto = contrato.presupuesto_lineas ?? contrato.server_lineas;
  const crecio = lineasServidor > presupuesto;

  return {
    perdidas,
    nuevas,
    guardPerdido,
    movidas,
    duplicadas,
    crecio,
    lineasServidor,
    presupuesto,
    ok:
      perdidas.length === 0 &&
      guardPerdido.length === 0 &&
      duplicadas.length === 0 &&
      !crecio,
  };
}

/**
 * Los ficheros donde puede vivir una ruta: el monolito y los módulos extraídos.
 *
 * v1.11.0 — POR QUÉ DEJÓ DE MIRAR SOLO `server.ts`
 * Al mover las tres primeras rutas a `server/routers/diagnostico.ts`, el contrato
 * las dio por PERDIDAS. Tenía razón desde su punto de vista y estaba equivocado
 * desde el del proyecto: una ruta extraída no se ha perdido, se ha mudado. Un
 * contrato que solo mira el monolito convierte cada paso de la Fase 2 en un falso
 * rojo, y un guardián que grita en falso se acaba ignorando. Ahora mira los dos
 * sitios y además **dice dónde vive cada ruta**, que es justo lo que hace falta
 * para saber cuánto queda por mover.
 */
function ficherosDeRutas() {
  const ficheros = [SERVIDOR];
  const recorrer = (dir) => {
    let entradas = [];
    try {
      entradas = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // el directorio puede no existir todavía
    }
    for (const e of entradas) {
      const completo = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(completo);
      else if (e.isFile() && e.name.endsWith(".ts")) ficheros.push(completo);
    }
  };
  recorrer(path.join(BACKEND, "server"));
  return ficheros;
}

/** Lee el código (monolito + módulos) y devuelve rutas, líneas del monolito y ficheros. */
export function leerSuperficie() {
  const ficheros = ficherosDeRutas();
  const rutas = [];
  for (const f of ficheros) {
    const rel = path.relative(BACKEND, f).replace(/\\/g, "/");
    // El MISMO extractor para todos: si un módulo registra mal una ruta, se ve igual.
    for (const r of extraerRutas(readFileSync(f, "utf8"))) rutas.push({ ...r, archivo: rel });
  }
  rutas.sort((a, b) => (a.archivo === b.archivo ? a.linea - b.linea : a.archivo.localeCompare(b.archivo)));
  const lineasMonolito = readFileSync(SERVIDOR, "utf8").split("\n").length;
  return { rutas, lineas: lineasMonolito, ficheros: ficheros.map((f) => path.relative(BACKEND, f).replace(/\\/g, "/")) };
}

function ordenDeTrabajo(rutas, lineas) {
  const porDominio = new Map();
  for (const r of rutas) {
    if (!porDominio.has(r.dominio)) porDominio.set(r.dominio, []);
    porDominio.get(r.dominio).push(r);
  }
  const filas = [...porDominio.entries()]
    .map(([dominio, rs]) => ({
      dominio,
      rutas: rs.length,
      conGuard: rs.filter((r) => r.guarda).length,
      desde: Math.min(...rs.map((r) => r.linea)),
      hasta: Math.max(...rs.map((r) => r.linea)),
      // Dónde vive hoy el dominio. Se listan los ficheros, porque un dominio a
      // medias (unas rutas movidas y otras no) es una situación real y hay que
      // poder verla en la tabla en vez de suponerla.
      donde: [...new Set(rs.map((r) => r.archivo))].map((a) => `\`${a}\``).join(" + "),
      // Método del dominio: si todo son GET, el módulo es de lectura.
      metodos: [...new Set(rs.map((r) => r.metodo))].sort().join("/"),
    }))
    .sort((a, b) => b.rutas - a.rutas || a.dominio.localeCompare(b.dominio));

  const lineasMd = [
    "# SUPERFICIE DE RUTAS — orden de trabajo de la Fase 2",
    "",
    `> **Generado** por \`scripts/superficie.mjs\` el ${new Date().toISOString().slice(0, 10)}. No editar a mano.`,
    `> **Total:** ${rutas.length} rutas · **server.ts:** ${lineas} líneas · **con guard:** ${rutas.filter((r) => r.guarda).length}`,
    `> **Progreso Fase 2:** por mover ${rutas.filter((r) => r.archivo === "server.ts").length} · extraídas ${rutas.filter((r) => r.archivo !== "server.ts").length}`,
    "",
    "Esto NO es documentación: es la lista de trabajo. Cada fila es un módulo que se extrae",
    "de `server.ts` a `server/routers/<dominio>.ts` sin cambiar ni una ruta ni un comportamiento.",
    "El contrato (`contrato-rutas.json`) impide que ninguna se pierda por el camino, y la",
    "columna «Dónde» dice a quién le toca: si pone `server.ts`, aún hay que moverlo.",
    "",
    "| Dominio | Rutas | Métodos | Con guard | Líneas (aprox.) | Dónde |",
    "|---|---:|---|---:|---|---|",
    ...filas.map(
      (f) =>
        `| \`${f.dominio}\` | ${f.rutas} | ${f.metodos} | ${f.conGuard} | ${f.desde}–${f.hasta} | ${f.donde} |`
    ),
    "",
    "## Orden sugerido de extracción",
    "",
    "1. **Primero los de lectura y pocos métodos** (los GET de dominios pequeños): riesgo bajo,",
    "   y sirven para validar el mecanismo de extracción sin tocar nada que escriba.",
    "2. **Después los dominios grandes pero independientes** (`brain`, `engine`, `espejos`).",
    "3. **Al final los que tocan el chat y el sandbox** (`ai`, `sandbox`): son los que más estado",
    "   comparten y donde el monolito está más enredado.",
    "",
    "Regla de la casa durante toda la fase: **se mueve, no se mejora**. Al cerrar cada dominio,",
    "la puerta debe dar el mismo número de comprobaciones que al empezar.",
    "",
  ];
  return { filas, markdown: lineasMd.join("\n") };
}

// ─── main ───────────────────────────────────────────────────────────────────
// Se compara por NOMBRE DE FICHERO, no por URL: `npm run` ejecuta con una ruta
// relativa y `pathToFileURL` no siempre coincide con `import.meta.url` (basta un
// enlace simbólico en el camino). Con la comparación por URL, el script se
// ejecutaba sin hacer nada y sin decir nada — el peor fallo posible en una
// herramienta que existe para detectar fallos.
const esMain = !!process.argv[1] && path.basename(process.argv[1]) === "superficie.mjs";

if (esMain) {
  const verificar = process.argv.includes("--verificar");
  const seco = process.argv.includes("--seco");
  const { rutas, lineas } = leerSuperficie();

  if (seco) {
    // Dice lo que saldría, sin escribir nada: así se comprueba el generador sin
    // tocar el contrato que se está vigilando.
    const { filas } = ordenDeTrabajo(rutas, lineas);
    console.log(`SIN ESCRIBIR (modo seco): saldrían ${rutas.length} rutas · ${lineas} líneas · ${filas.length} dominios`);
    console.log(`  contrato-rutas.json y SUPERFICIE_RUTAS.md NO se han tocado.`);
    process.exit(0);
  }

  if (!verificar) {
    const enMonolito = rutas.filter((r) => r.archivo === "server.ts").length;
    const contrato = {
      que_es: "Contrato de superficie HTTP del servidor (Fase 2). GENERADO por scripts/superficie.mjs: no editar a mano.",
      generado: new Date().toISOString().slice(0, 10),
      server_lineas: lineas,
      presupuesto_lineas: lineas,
      total: rutas.length,
      // Marcador de progreso de la Fase 2: cuántas rutas quedan en el monolito.
      rutas_en_monolito: enMonolito,
      rutas_extraidas: rutas.length - enMonolito,
      rutas,
    };
    writeFileSync(CONTRATO, JSON.stringify(contrato, null, 2) + "\n", "utf8");
    const { markdown } = ordenDeTrabajo(rutas, lineas);
    writeFileSync(ORDEN, markdown, "utf8");
    console.log(`CONTRATO GENERADO: contrato-rutas.json (${rutas.length} rutas · ${lineas} líneas)`);
    console.log(`ORDEN DE TRABAJO:  SUPERFICIE_RUTAS.md`);
    process.exit(0);
  }

  const contrato = JSON.parse(readFileSync(CONTRATO, "utf8"));
  const v = comparar(contrato, rutas, lineas);
  const enMonolito = rutas.filter((r) => r.archivo === "server.ts").length;
  console.log(`CONTRATO DE SUPERFICIE: ${contrato.total} rutas declaradas · ${rutas.length} en el código`);
  console.log(`PROGRESO FASE 2: ${rutas.length - enMonolito} extraída(s) · ${enMonolito} aún en el monolito (${lineas} líneas)`);
  for (const r of v.movidas) console.log(`  MOVIDA        ${r.metodo} ${r.ruta}  (${r.antesEn} → ${r.archivo})`);
  for (const r of v.perdidas) console.log(`  PERDIDA       ${r.metodo} ${r.ruta}  (estaba en ${r.archivo}:${r.linea})`);
  for (const r of v.guardPerdido) console.log(`  SIN GUARD     ${r.metodo} ${r.ruta}  (tenía guard y ya no)`);
  for (const r of v.duplicadas) console.log(`  DUPLICADA     ${r.metodo} ${r.ruta}  (líneas ${r.primeraLinea} y ${r.linea})`);
  for (const r of v.nuevas) console.log(`  NUEVA         ${r.metodo} ${r.ruta}  (línea ${r.linea}) — permitida, pero conviene rehacer el contrato`);
  if (v.crecio) console.log(`  CRECIÓ        server.ts tiene ${v.lineasServidor} líneas (presupuesto ${v.presupuesto}): la Fase 2 es partir, no añadir`);
  console.log(v.ok ? "  VEREDICTO: CONTRATO INTACTO." : "  VEREDICTO: HAY ROTURAS (ver arriba).");
  process.exit(v.ok ? 0 : 1);
}
