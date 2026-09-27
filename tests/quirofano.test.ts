/**
 * quirofano.test.ts — QUIRÓFANO v1: la cirugía sobre apps que YA funcionan
 * =========================================================================
 * POR QUÉ EXISTE ESTA SUITE
 * -------------------------
 * El problema del usuario no era «el modelo escribe mal»: era «el modelo
 * reescribe bien, pero de memoria, y borra lo que no miraba». La app funcionaba
 * y deja de funcionar. Esta suite fija, caso por caso, qué se BLOQUEA (perder
 * API pública, quedarse a la mitad, venir truncado, perder dependencias) y qué
 * sólo se AVISA — porque un guardián que bloquea de más se acaba desactivando.
 *
 * Se ejecuta con:   npx tsx tests/quirofano.test.ts
 * (también con:     node --experimental-strip-types tests/quirofano.test.ts)
 */

import {
  anotarCirugia,
  cerrarOperacion,
  cirugiasDe,
  contarLineas,
  crearOperacion,
  deserializarOperacion,
  evaluarCirugia,
  hayRojas,
  huella,
  lineasUtiles,
  lineaQuirofano,
  marcadoresDeTruncado,
  normalizarRuta,
  normalizarTexto,
  planDeReversion,
  puertaHumo,
  puertaImports,
  puertaPeso,
  puertaSintaxis,
  puertaSuperficie,
  puertasEstandar,
  puertasPesadas,
  puertaTipos,
  revertir,
  rutasTocadas,
  serializarOperacion,
  superficiePublica,
  UMBRAL_AMPUTACION,
  type Disco,
  type Operacion,
} from "../src/engine/quirofano";

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

// ─── Utilidades de apoyo ────────────────────────────────────────────────────

/** Disco de mentira: un Map. Permite probar reversión sin tocar disco real. */
function discoMemoria(inicial: Record<string, string> = {}): Disco & { ver: () => Record<string, string> } {
  const m = new Map<string, string>(Object.entries(inicial));
  return {
    existe: (p) => m.has(normalizarRuta(p)),
    leer: (p) => (m.has(normalizarRuta(p)) ? (m.get(normalizarRuta(p)) as string) : null),
    escribir: (p, c) => {
      m.set(normalizarRuta(p), c);
    },
    borrar: (p) => {
      m.delete(normalizarRuta(p));
    },
    ver: () => Object.fromEntries(m),
  };
}

/** Un archivo «que funciona» de verdad: con exports y cuerpo. */
function archivoSano(nombre: string, lineas = 40): string {
  const cuerpo: string[] = [`export function ${nombre}(x: number): number {`, `  const base = x * 2;`];
  for (let i = 0; i < lineas; i++) cuerpo.push(`  const v${i} = base + ${i};`);
  cuerpo.push(`  return base;`, `}`);
  return cuerpo.join("\n");
}

const SANA = archivoSano("calcularTotal", 60);
const MUTILADA = `export function calcularTotal(x: number): number {\n  // simplificado\n  return x * 2;\n}`;

console.log("═══ PRUEBAS DEL QUIRÓFANO · CerebroNico ═══\n");

// ─── 1. Reglas de utilidad (medir bien es la mitad de juzgar bien) ──────────

{
  comprobar("huella es determinista", huella("hola") === huella("hola"));
  comprobar("huella distingue contenidos", huella("hola") !== huella("hola "));
  comprobar("huella es hexadecimal de 8", /^[0-9a-f]{8}$/.test(huella("cualquier cosa")));
  comprobar("normalizarRuta quita barras invertidas", normalizarRuta("src\\utils\\a.ts") === "src/utils/a.ts");
  comprobar("normalizarRuta quita ./ inicial", normalizarRuta("./src/a.ts") === "src/a.ts");
  comprobar("normalizarTexto iguala CRLF y LF", normalizarTexto("a\r\nb") === normalizarTexto("a\nb"));
  comprobar("contarLineas cuenta la última sin salto", contarLineas("a\nb") === 2);
  comprobar("lineasUtiles ignora vacías", lineasUtiles("const a = 1;\n\n\nconst b = 2;") === 2);
  comprobar("lineasUtiles ignora comentarios puros", lineasUtiles("// nota\nconst a = 1;\n/* bloque */") === 1);
  comprobar("lineasUtiles no ignora código con comentario al final", lineasUtiles("const a = 1; // nota") === 1);
}

// ─── 2. Superficie pública: lo que NO puede desaparecer ────────────────────

{
  const sup = superficiePublica("export const A = 1;\nexport function f() {}\nexport default class C {}\nexport interface I {}");
  comprobar("detecta export const", sup.includes("A"));
  comprobar("detecta export function", sup.includes("f"));
  comprobar("detecta export default class", sup.includes("C") && sup.includes("default"));
  comprobar("detecta export interface", sup.includes("I"));
  comprobar("detecta export { a, b }", superficiePublica("const a = 1; const b = 2;\nexport { a, b };").join(",") === "a,b");
  comprobar("no confunde variables privadas con exportaciones", !superficiePublica("const oculto = 1;").includes("oculto"));
  comprobar("la lista es estable (ordenada)", superficiePublica("export const b = 1;\nexport const a = 1;").join(",") === "a,b");
}

// ─── 3. Marcadores de truncado: la firma del modelo que se quedó sin contexto ─

{
  comprobar("detecta una línea con sólo puntos suspensivos", marcadoresDeTruncado("const a = 1;\n...\n").length === 1);
  comprobar("detecta «resto del código»", marcadoresDeTruncado("// ... resto del código ...").length > 0);
  comprobar("detecta «<...>»", marcadoresDeTruncado("<...>").length > 0);
  comprobar("detecta «se omite»", marcadoresDeTruncado("// se omite por brevedad").length > 0);
  comprobar("no acusa a los tres puntos dentro de una frase normal", marcadoresDeTruncado("const frase = \"espera...\";").length === 0);
  comprobar("no acusa a un Array.from sin truncado", marcadoresDeTruncado("const v = [...otros];").length === 0);
}

// ─── 4. El juez: qué bloquea y qué sólo avisa ──────────────────────────────

{
  const nuevo = evaluarCirugia("src/nuevo.ts", null, "export const a = 1;\n");
  comprobar("un archivo nuevo y completo es seguro", nuevo.veredicto === "seguro");
  comprobar("y queda anotado que no existía", nuevo.existia === false);

  const nuevoTruncado = evaluarCirugia("src/nuevo.ts", null, "export const a = 1;\n// resto del código");
  comprobar("un archivo NUEVO truncado es peligroso", nuevoTruncado.veredicto === "peligroso");

  const identico = evaluarCirugia("src/a.ts", SANA, SANA);
  comprobar("reescribir lo mismo es seguro", identico.veredicto === "seguro");

  const conCrlf = evaluarCirugia("src/a.ts", SANA, SANA.replace(/\n/g, "\r\n"));
  comprobar("cambiar sólo los finales de línea no es un cambio", conCrlf.veredicto === "seguro");

  const amputada = evaluarCirugia("src/a.ts", SANA, MUTILADA);
  comprobar("reescribir 60 líneas como 4 es amputación", amputada.veredicto === "peligroso");
  comprobar("y lo dice con números", amputada.motivos.some((m) => m.includes("Amputación")));
  comprobar("y cuenta las exportaciones perdidas", amputada.cifras.publicosPerdidos.length === 0);

  const pierdeExport = evaluarCirugia(
    "src/a.ts",
    SANA + "\nexport function extra() {\n  return 1;\n}\n",
    SANA
  );
  comprobar("perder una exportación bloquea", pierdeExport.veredicto === "peligroso");
  comprobar("y la nombra", pierdeExport.cifras.publicosPerdidos.includes("extra"));

  const ligera = evaluarCirugia("src/a.ts", archivoSano("f", 100), archivoSano("f", 82));
  comprobar("una pérdida moderada avisa, no bloquea", ligera.veredicto === "revisar");
  comprobar("el aviso se marca como AVISO (no bloqueante)", ligera.motivos.every((m) => m.startsWith("AVISO")));

  const truncada = evaluarCirugia("src/a.ts", SANA, `const x = 1;\n...\n`);
  comprobar("un archivo existente que llega truncado bloquea", truncada.veredicto === "peligroso");

  const pkgAntes = JSON.stringify({ name: "app", dependencies: { react: "^19.0.0", vite: "^6.0.0" }, scripts: { dev: "vite", build: "vite build" } }, null, 2);
  const pkgDespues = JSON.stringify({ name: "app", dependencies: { react: "^19.0.0" }, scripts: { dev: "vite" } }, null, 2);
  const pkg = evaluarCirugia("package.json", pkgAntes, pkgDespues);
  comprobar("perder dependencias en package.json bloquea", pkg.veredicto === "peligroso");
  comprobar("y nombra la dependencia perdida", pkg.motivos.some((m) => m.includes("vite")));
  comprobar("y nombra el script perdido", pkg.motivos.some((m) => m.includes("build")));

  const modoCarga = evaluarCirugia("src/a.ts", SANA, MUTILADA, "carga");
  comprobar("en modo carga (subir la app entera) el tamaño no bloquea", modoCarga.veredicto === "seguro");
  const cargaTruncada = evaluarCirugia("src/a.ts", SANA, "export const a = 1;\n// resto del código", "carga");
  comprobar("pero en modo carga el truncado SÍ bloquea", cargaTruncada.veredicto === "peligroso");

  const riesgo = evaluarCirugia("src/main.tsx", `import React from "react";\nimport { A } from "./a";\n${archivoSano("m", 20)}`, `import React from "react";\n${archivoSano("m", 20)}`);
  comprobar("en una ruta de arranque avisa aunque la pérdida sea pequeña", riesgo.motivos.some((m) => m.startsWith("AVISO")));
  comprobar("y ese aviso no bloquea", riesgo.veredicto === "revisar");
}

// ─── 5. La operación guarda el estado ANTERIOR (copia-al-escribir) ─────────

{
  const op = crearOperacion("mejorar el botón");
  anotarCirugia(op, "src/a.ts", SANA, SANA + "\n// mejora 1\n");
  anotarCirugia(op, "src/a.ts", SANA + "\n// mejora 1\n", SANA + "\n// mejora 2\n");
  anotarCirugia(op, "src/nuevo.ts", null, "export const x = 1;\n");

  comprobar("la operación nace con motivo", op.motivo === "mejorar el botón");
  comprobar("se registran las rutas tocadas", rutasTocadas(op).join(",") === "src/a.ts,src/nuevo.ts");
  comprobar("del archivo repetido sólo se guarda el ORIGINAL", cirugiasDe(op).find((c) => c.ruta === "src/a.ts")?.original === SANA);
  comprobar("el archivo nuevo se marca como no existente", cirugiasDe(op).find((c) => c.ruta === "src/nuevo.ts")?.existia === false);

  const plan = planDeReversion(op);
  comprobar("se restaura lo que existía", plan.restaurar.length === 1 && plan.restaurar[0].contenido === SANA);
  comprobar("se retira lo que era nuevo", plan.retirar.join(",") === "src/nuevo.ts");

  const disco = discoMemoria({ "src/a.ts": "ROTO", "src/nuevo.ts": "basura" });
  const res = revertir(op, disco);
  comprobar("la reversión restaura el contenido original", disco.leer("src/a.ts") === SANA);
  comprobar("y borra el archivo que no existía", disco.existe("src/nuevo.ts") === false);
  comprobar("y lo informa", res.restaurados.length === 1 && res.retirados.length === 1);
  comprobar("la operación queda marcada como revertida", op.revertida === true);

  const opGrande = crearOperacion("archivo enorme");
  anotarCirugia(opGrande, "src/gordo.ts", "x".repeat(600 * 1024), "y");
  const gordo = cirugiasDe(opGrande)[0];
  comprobar("un original que supera el tope no se guarda íntegro", gordo.original === null && gordo.noReversible === true);
  const planGordo = planDeReversion(opGrande);
  comprobar("y la reversión lo declara en vez de mentir", planGordo.noReversibles.join(",") === "src/gordo.ts");
}

// ─── 6. Las puertas juzgan el DISCO, no la promesa ─────────────────────────

{
  const op = crearOperacion("tocar a.ts");
  anotarCirugia(op, "src/a.ts", SANA, SANA);
  // NOTA: el guardián de sintaxis del proyecto NO valida llaves en TS/TSX a
  // propósito (los genéricos y el JSX daban un 51 % de falsos positivos y
  // dejaban el preview en blanco). Lo que SÍ caza sin duda: JSON inválido,
  // marcador de truncado al final y comentario /* sin cerrar.
  const opJson = crearOperacion("json roto");
  anotarCirugia(opJson, "package.json", "{\"name\": \"app\"}", "{\"name\": \"app\",");
  comprobar(
    "la puerta de sintaxis cae con un JSON inválido en disco",
    puertaSintaxis.correr(opJson, { disco: discoMemoria({ "package.json": "{\"name\": \"app\"," }) }).ok === false
  );
  comprobar(
    "cae si en disco quedó un archivo terminado en truncado",
    puertaSintaxis.correr(op, { disco: discoMemoria({ "src/a.ts": "const x = 1;\n// resto del código" }) }).ok === false
  );
  comprobar(
    "cae si quedó un comentario de bloque sin cerrar",
    puertaSintaxis.correr(op, { disco: discoMemoria({ "src/a.ts": "/* nota abierta\nconst x = 1;" }) }).ok === false
  );

  const discoBien = discoMemoria({ "src/a.ts": SANA });
  comprobar("y pasa con el archivo sano", puertaSintaxis.correr(op, { disco: discoBien }).ok === true);

  const opApi = crearOperacion("romper API");
  anotarCirugia(opApi, "src/a.ts", SANA + "\nexport function extra() {}\n", SANA);
  const discoApi = discoMemoria({ "src/a.ts": SANA });
  const superficie = puertaSuperficie.correr(opApi, { disco: discoApi });
  comprobar("la puerta de superficie cae si desaparece una exportación", superficie.ok === false);
  comprobar("y nombra al culpable", superficie.detalle.includes("extra"));

  const opImports = crearOperacion("romper imports");
  anotarCirugia(opImports, "src/a.ts", SANA, `import { B } from "./noExiste";\n${SANA}`);
  const archivosAhora = () => [{ path: "src/a.ts", content: `import { B } from "./noExiste";\n${SANA}` }];
  const importRoto = puertaImports.correr(opImports, { disco: discoMemoria(), archivosProyecto: archivosAhora });
  comprobar("la puerta de imports cae con un import relativo sin destino", importRoto.ok === false);

  const opImports2 = crearOperacion("sin baseline");
  opImports2.importsAntes = ["src/a.ts|./noExiste"];
  const importYaRoto = puertaImports.correr(opImports2, { disco: discoMemoria(), archivosProyecto: archivosAhora });
  comprobar("un import que YA estaba roto antes no se le achaca a este cambio", importYaRoto.ok === true);

  const opPeso = crearOperacion("encoger todo");
  anotarCirugia(opPeso, "src/a.ts", archivoSano("f", 200), "export const f = 1;\n");
  const peso = puertaPeso.correr(opPeso, { disco: discoMemoria() });
  comprobar("la puerta de peso cae si el conjunto pierde más del umbral", peso.ok === false);
  comprobar("y da el porcentaje real", peso.detalle.includes("%"));

  comprobar("hay cuatro puertas estándar", puertasEstandar().length === 4);
  comprobar("todas las puertas traen id y descripción", puertasEstandar().every((p) => !!p.id && !!p.que));
}

// ─── 6-bis. Puertas pesadas (opt-in): tipos y humo, con ejecutores inyectados ─

{
  const op = crearOperacion("tocar a.ts");
  anotarCirugia(op, "src/a.ts", SANA, SANA);
  const disco = discoMemoria({ "src/a.ts": SANA });

  const tiposRojos = await puertaTipos(async () => ({ ok: false, detalle: "src/a.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'." })).correr(op, { disco });
  comprobar("la puerta de tipos cae si el error está en un archivo tocado", tiposRojos.ok === false);

  const tiposAjenos = await puertaTipos(async () => ({ ok: false, detalle: "src/otroNoTocado.ts(9,1): error TS2554: Expected 2 arguments, but got 1." })).correr(op, { disco });
  comprobar("y NO culpa a este cambio de errores de archivos que no tocó", tiposAjenos.ok === true);

  const tiposLimpios = await puertaTipos(async () => ({ ok: true, detalle: "" })).correr(op, { disco });
  comprobar("con tipos limpios pasa", tiposLimpios.ok === true);

  const humoOk = await puertaHumo(async () => ({ status: 200, cuerpo: "<html>CerebróNico</html>" })).correr(op, { disco });
  comprobar("la puerta de humo pasa con la vista previa viva", humoOk.ok === true);
  const humoRoto = await puertaHumo(async () => ({ status: 500, cuerpo: "" })).correr(op, { disco });
  comprobar("y cae con un 500", humoRoto.ok === false);
  const humoCaidо = await puertaHumo(async () => {
    throw new Error("ECONNREFUSED");
  }).correr(op, { disco });
  comprobar("y cae si la vista previa no contesta", humoCaidо.ok === false);

  comprobar("las puertas pesadas son opt-in", puertasPesadas({}).length === 0);
  comprobar("y se montan cuando hay ejecutores", puertasPesadas({ correrComando: async () => ({ ok: true, detalle: "" }), sondearPreview: () => ({ status: 200, cuerpo: "x" }) }).length === 2);

  const opRota = crearOperacion("mejora con tipos rotos");
  const conError = SANA + "\nexport const malo: number = \"texto\";\n";
  anotarCirugia(opRota, "src/a.ts", SANA, conError);
  const discoRoto = discoMemoria({ "src/a.ts": conError });
  const cierre = await cerrarOperacion(opRota, discoRoto, {
    puertas: puertasEstandar().concat(puertasPesadas({ correrComando: async () => ({ ok: false, detalle: "src/a.ts(61,14): error TS2322: Type 'string' is not assignable to type 'number'." }) })),
    archivosProyecto: () => [{ path: "src/a.ts", content: conError }],
  });
  comprobar("con la puerta de tipos montada, un cambio que no compila se revierte", cierre.revertido === true && cierre.ok === false);
  comprobar("y el disco vuelve al original", discoRoto.leer("src/a.ts") === SANA);
  comprobar("el informe nombra la puerta que cayó", cierre.informe.includes("[tipos]"));
}

// ─── 7. Cierre: revierte solo cuando algo está en rojo ─────────────────────

{
  const op = crearOperacion("mejora que rompe");
  anotarCirugia(op, "src/a.ts", SANA, MUTILADA);
  const disco = discoMemoria({ "src/a.ts": MUTILADA });
  const cierre = await cerrarOperacion(op, disco, { archivosProyecto: () => [{ path: "src/a.ts", content: MUTILADA }] });
  comprobar("el cierre con puertas rojas NO da el cambio por bueno", cierre.ok === false);
  comprobar("y revierte el disco al estado anterior", disco.leer("src/a.ts") === SANA);
  comprobar("y lo declara", cierre.revertido === true);
  comprobar("el informe dice que se revirtió", cierre.informe.includes("REVERTIDO"));
  comprobar("el informe explica qué hacer en su lugar", cierre.informe.includes("edit_file"));
  comprobar("la línea de log nombra el quirófano", lineaQuirofano(cierre).includes("QUIRÓFANO"));

  const opBien = crearOperacion("mejora honesta");
  const conMejora = SANA + "\nexport function extra() {\n  return 42;\n}\n";
  anotarCirugia(opBien, "src/a.ts", SANA, conMejora);
  const discoBien = discoMemoria({ "src/a.ts": conMejora });
  const cierreBien = await cerrarOperacion(opBien, discoBien, { archivosProyecto: () => [{ path: "src/a.ts", content: conMejora }] });
  comprobar("un cambio que añade (y no pierde) se queda", cierreBien.ok === true && cierreBien.revertido === false);
  comprobar("y el disco conserva la mejora", (discoBien.leer("src/a.ts") || "").includes("extra"));
  comprobar("el informe resume las líneas útiles antes y después", cierreBien.informe.includes("líneas útiles"));
  comprobar("no se revierte dos veces por cerrar dos veces", (await cerrarOperacion(opBien, discoBien)).ok === true);

  const opSinRevertir = crearOperacion("aviso de peso");
  anotarCirugia(opSinRevertir, "src/a.ts", archivoSano("f", 200), "export const f = 1;\n");
  const discoSin = discoMemoria({ "src/a.ts": "export const f = 1;\n" });
  const cierreSin = await cerrarOperacion(opSinRevertir, discoSin, { revertirSiFalla: false });
  comprobar("con revertirSiFalla=false se avisa pero se deja el cambio", cierreSin.ok === false && cierreSin.revertido === false);
  comprobar("y la línea de log no dice revertido", !lineaQuirofano(cierreSin).includes("REVERTIDO"));
  comprobar("hayRojas se queda con las bloqueantes", hayRojas([{ id: "x", que: "q", gravedad: "aviso", ok: false, detalle: "" }]).length === 0);
}

// ─── 8. Memoria del quirófano: deshacer después de reiniciar el IDE ────────

{
  const op = crearOperacion("sesión uno");
  anotarCirugia(op, "src/a.ts", SANA, "ROTO");
  anotarCirugia(op, "src/b.ts", null, "nuevo");
  const json = serializarOperacion(op);
  const vuelta = deserializarOperacion(json);
  comprobar("la operación se serializa", typeof json === "string" && json.includes("src/a.ts"));
  comprobar("y se recupera con su motivo", vuelta?.motivo === "sesión uno");
  comprobar("con las mismas rutas", vuelta ? rutasTocadas(vuelta).join(",") === "src/a.ts,src/b.ts" : false);
  comprobar("y el original intacto", vuelta ? cirugiasDe(vuelta)[0].original === SANA : false);

  const disco = discoMemoria({ "src/a.ts": "ROTO", "src/b.ts": "nuevo" });
  const res = vuelta ? revertir(vuelta, disco) : { restaurados: [] };
  comprobar("deshacer funciona tras reiniciar (desde el JSON)", disco.leer("src/a.ts") === SANA && res.restaurados.length === 1);
  comprobar("un JSON corrupto no rompe nada", deserializarOperacion("{no es json") === null);
  comprobar("un JSON sin archivos tampoco", deserializarOperacion("{\"x\":1}") === null);
}

// ─── 9. Constantes del contrato ─────────────────────────────────────────────

{
  comprobar("el umbral de amputación es el 35 %", UMBRAL_AMPUTACION === 0.35);
  const op = crearOperacion("x");
  comprobar("una operación nueva no tiene archivos", cirugiasDe(op).length === 0);
  comprobar("y arranca sin reversiones", op.revertida === false);
  const sinPuertas: Operacion = crearOperacion("sin inventario");
  anotarCirugia(sinPuertas, "src/a.ts", SANA, SANA);
  const cierre = await cerrarOperacion(sinPuertas, discoMemoria({ "src/a.ts": SANA }));
  comprobar("cerrar sin inventario del proyecto no revienta", typeof cierre.ok === "boolean");
}

console.log("─".repeat(64));
// v1.1 — El veredicto usa las palabras «correctas»/«fallidas» porque es el
// formato que entiende scripts/validar.mjs (extraer()). Antes decía sólo
// «N comprobaciones, 0 fallos», el parser no lo reconocía, y validar declaraba
// «la suite NO llegó a ejecutarse» aunque pasaban las 102. Un guardián que
// announce falsos fallos desprestigia las verdaderos: se corrige el formato.
if (fallan === 0) {
  console.log(`  VEREDICTO: ${pasan} comprobaciones — ${pasan} correctas · 0 fallidas.`);
  process.exitCode = 0;
} else {
  console.log(`  VEREDICTO: ${fallan} FALLO(S) de ${pasan + fallan} comprobaciones — ${pasan} correctas · ${fallan} fallidas:`);
  for (const f of fallos) console.log(`    - ${f}`);
  process.exitCode = 1;
}
console.log("═".repeat(64));
