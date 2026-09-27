/**
 * tests/modelosYArranque.test.ts — REGRESIÓN de la v1.6.17
 * ==========================================================================
 * Se ejecuta con:  node node_modules/tsx/dist/cli.mjs tests/modelosYArranque.test.ts
 *
 * Cuatro fallos distintos, los cuatro reportados usando la aplicación de
 * verdad. Tres son de `server.ts` y uno del búfer.
 *
 *   1. «Ayer los modelos de Gemini eran rapidísimos y hoy dan 404, y da igual
 *      la versión.» La cadena de reserva de Gemini era un cementerio: los
 *      cuatro nombres estaban apagados o en retirada.
 *   2. «¿Puedes responderme qué día es hoy?» Y no podía ninguno: la fecha no
 *      estaba en el prompt de sistema en ninguna parte.
 *   3. Un puerto ocupado mataba la app sin decir nada: `listen()` sin manejador
 *      de error, y en Node eso es un lanzamiento que se lleva el proceso.
 *   4. Una valla anidada cortaba el bloque de código antes de tiempo.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { BufferInferencia } from "../src/engine/inferenceBuffer";

let pasadas = 0;
let falladas = 0;

function afirmar(titulo: string, condicion: boolean, detalle = ""): void {
  if (condicion) {
    pasadas++;
    console.log(`  ✔ ${titulo}`);
  } else {
    falladas++;
    console.error(`  ✘ ${titulo}${detalle ? `\n      ${detalle}` : ""}`);
  }
}

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVIDOR = fs.readFileSync(path.join(RAIZ, "server.ts"), "utf-8");

console.log("\n🔧 Modelos vigentes, fecha, arranque y vallas — v1.6.17\n");

/* ==================================================================
   1. LA CADENA DE GEMINI
   ================================================================== */
console.log("  Cadena de reserva de Gemini:");

const mLista = SERVIDOR.match(/const MODELOS_GEMINI_VIGENTES = \[([\s\S]*?)\];/);
afirmar("Existe una lista única de modelos vigentes", !!mLista);

if (mLista) {
  const vigentes = [...mLista[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  console.log(`    ${vigentes.join(" · ")}`);

  afirmar(
    "La lista incluye la generación vigente (3.x)",
    vigentes.some((v) => /^gemini-3\./.test(v)),
    `ninguno de la familia 3: ${vigentes.join(", ")}`
  );

  /* Los apagados NO pueden estar: cada uno cuesta una petición perdida antes
     de llegar a uno vivo. */
  const apagados = ["gemini-1.5-flash", "gemini-1.1", "gemini-1.0"];
  const colados = apagados.filter((a) => vigentes.includes(a));
  afirmar(
    "No queda ningún modelo de la generación 1.x (apagados, dan 404 siempre)",
    colados.length === 0,
    `siguen en la lista: ${colados.join(", ")}`
  );
  afirmar(
    "No queda gemini-2.0-flash (apagado el 1 de junio de 2026)",
    !vigentes.includes("gemini-2.0-flash")
  );
}

/* La segunda trampa: `model.includes("gemini")` daba por bueno cualquier
   alias, y «gemini-flash» no es un nombre de modelo de la API. */
afirmar(
  "Existe un conjunto de alias internos que NO son nombres de modelo",
  /const ALIAS_GEMINI_INTERNOS = new Set\(\[[\s\S]*?\]\)/.test(SERVIDOR)
);
afirmar(
  "Los alias «gemini-flash» y «gemini-free» están reconocidos",
  /ALIAS_GEMINI_INTERNOS = new Set\(\[[^\]]*"gemini-flash"[^\]]*"gemini-free"/.test(SERVIDOR),
  "si no se reconocen, se prueban como nombre literal, dan 404 y caen a la cadena muerta"
);

/* ==================================================================
   2. LA FECHA EN EL PROMPT DE SISTEMA
   ================================================================== */
console.log("\n  Fecha y hora del sistema:");

afirmar(
  "El prompt de sistema recibe un bloque de fecha real",
  /DATO REAL DEL SISTEMA — fecha y hora/.test(SERVIDOR),
  "sin esto, ningún modelo puede responder «¿qué día es hoy?» y lo inventará"
);
afirmar(
  "La fecha se construye desde el reloj de la máquina, no escrita a mano",
  /const ahoraDelSistema = new Date\(\)/.test(SERVIDOR)
);
afirmar(
  "Se le dice al modelo que no la deduzca ni la invente",
  /No lo deduzcas del historial ni lo inventes/.test(SERVIDOR)
);

/* ==================================================================
   3. EL PUERTO OCUPADO
   ================================================================== */
console.log("\n  Arranque del servidor:");

afirmar(
  "`listen` se captura en una variable para poder escuchar su error",
  /const servidorHttp = app\.listen\(/.test(SERVIDOR),
  "sin capturarlo no hay forma de enterarse de que el puerto estaba ocupado"
);
afirmar(
  "Existe el manejador de error que antes faltaba",
  /servidorHttp\.on\("error"/.test(SERVIDOR),
  "un net.Server con error sin manejador LANZA y se lleva el proceso"
);
afirmar(
  "Se reconoce EADDRINUSE y se dice explícitamente que la IDE no arrancó",
  /EADDRINUSE/.test(SERVIDOR) && /YA ESTÁ OCUPADO\. La IDE NO arrancó/.test(SERVIDOR)
);
afirmar(
  "El mensaje dice cómo encontrar y cerrar al proceso culpable",
  /netstat -ano \| findstr/.test(SERVIDOR) && /taskkill \/PID/.test(SERVIDOR)
);

/* ==================================================================
   4. LA VALLA ANIDADA — PRUEBA FUNCIONAL, NO SOLO DE TEXTO
   ==================================================================
   Esta es la que importa de verdad: se mete la forma EXACTA que produjo el
   modelo local probando la interfaz y se comprueba que el bloque no se corta.
   ================================================================== */
console.log("\n  Valla anidada dentro de un bloque:");

const TROZOS = [
  "```python\n",
  "# MEMORIA.md — CerebroNico\n",
  "- **Rol**: agente de ingeniería de software.\n",
  "```python\n",                                   // ← la anidada
  "# skills.md (resumen)\n",
  "CerebroNico declara 100 capacidades operativas.\n",
  "```\n",                                          // ← el cierre de verdad
  "Y esto va fuera del bloque.\n",
];

const buffer = new BufferInferencia();
const entregas: string[] = [];
for (const trozo of TROZOS) {
  for (const estado of buffer.push(trozo)) entregas.push(estado.content ?? "");
}
for (const estado of buffer.flush()) entregas.push(estado.content ?? "");

console.log(`    entregas del búfer: ${entregas.length}`);

/* El corazón de la prueba: MEMORIA.md y skills.md tienen que viajar JUNTAS en
   una misma entrega. Con el fallo antiguo, la valla anidada cerraba el bloque
   y «# skills.md» salía en otra entrega distinta. */
const bloqueUnico = entregas.find(
  (e) => e.includes("MEMORIA.md") && e.includes("skills.md")
);
afirmar(
  "El contenido anterior y posterior a la valla anidada viaja en el MISMO bloque",
  !!bloqueUnico,
  "con el fallo antiguo la valla anidada cerraba el bloque y partía el contenido en dos"
);

afirmar(
  "No se pierde nada: el texto posterior al bloque sigue llegando",
  entregas.join("").includes("Y esto va fuera del bloque"),
  "el cierre de verdad llegó y el búfer debía seguir con el texto de después"
);

/* La valla de cierre debe ser DESNUDA. Es la regla de Markdown y es lo que
   hace que la anidada se trate como contenido. */
const BUFFER_FUENTE = fs.readFileSync(path.join(RAIZ, "src", "engine", "inferenceBuffer.ts"), "utf-8");
afirmar(
  "El cierre exige una valla desnuda, no cualquier línea que empiece por ```",
  /if \(\/\^```\\s\*\$\/\.test\(recortada\)\)/.test(BUFFER_FUENTE),
  "vuelve a cerrar con /^```/ y la valla anidada cortará el bloque otra vez"
);
afirmar(
  "Sigue existiendo el rescate de valla sin cerrar (no se pierde texto)",
  /Una valla sin cerrar también es contenido a rescatar/.test(BUFFER_FUENTE)
);

/* ==================================================================
   5. EL CATÁLOGO DEL SELECTOR — v1.6.18
   ==================================================================
   Una entrada muerta AQUÍ no es una nota desactualizada: es un 404 en cuanto
   se pulsa, y no lo salva ninguna reserva porque el modelo elegido se prueba
   primero. Los tres modelos de 2.x que había se apagaron uno a uno.
   ================================================================== */
console.log("\n  Catálogo de modelos Gemini del selector:");

const SELECTOR = fs.readFileSync(
  path.join(RAIZ, "src", "components", "ModelSelectorModal.tsx"),
  "utf-8"
);

const MUERTOS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash"];
const ofrecidos = MUERTOS.filter((m) => new RegExp(`id: "${m}"`).test(SELECTOR));
afirmar(
  "El selector no ofrece ningún modelo Gemini apagado o en retirada",
  ofrecidos.length === 0,
  `siguen seleccionables: ${ofrecidos.join(", ")} — darían 404 al pulsarlos`
);

const geminiDelCatalogo = [...SELECTOR.matchAll(/id: "(gemini-[^"]+)"/g)].map((m) => m[1]);
console.log(`    ofrecidos: ${geminiDelCatalogo.join(" · ")}`);
afirmar(
  "Ofrece al menos un modelo de la familia vigente (3.x)",
  geminiDelCatalogo.some((m) => /^gemini-3/.test(m))
);

/* La ventana de claves anunciaba modelos muertos al usuario. */
const APIKEY = fs.readFileSync(path.join(RAIZ, "src", "components", "ApiKeyModal.tsx"), "utf-8");
const anunciadosMuertos = MUERTOS.filter((m) => APIKEY.includes(`>${m}<`));
afirmar(
  "La ventana de API Keys no anuncia modelos apagados",
  anunciadosMuertos.length === 0,
  `promete modelos que no contestan: ${anunciadosMuertos.join(", ")}`
);

/* ==================================================================
   6. LA TEMPERATURA DE GEMINI 3 — v1.6.18
   ==================================================================
   Google: «For all Gemini 3 models, we strongly recommend keeping the
   temperature parameter at its default value of 1.0... may lead to unexpected
   behavior, such as looping or degraded performance». La app mandaba 0.5.
   ================================================================== */
console.log("\n  Temperatura de la familia Gemini 3:");

afirmar(
  "Se detecta la familia 3 y se le fija temperatura 1.0",
  /const esFamiliaGemini3 = \/\^gemini-3\//.test(SERVIDOR) && /temperaturaEfectiva/.test(SERVIDOR),
  "con 0.5 Gemini 3 puede entrar en bucle o degradarse"
);
afirmar(
  "La temperatura forzada es exactamente 1.0, el valor recomendado por Google",
  /\? 1\.0\s*:\s*typeof temperature/.test(SERVIDOR)
);
afirmar(
  "Los modelos anteriores conservan el regulador del usuario",
  /typeof temperature === "number" \? temperature : 0\.5/.test(SERVIDOR),
  "forzar 1.0 en toda la familia estropearía los modelos previos"
);

console.log(
  `\n  ${falladas === 0 ? "✔" : "✘"} Modelos y arranque: ${pasadas} correctas, ${falladas} fallidas.\n`
);

if (falladas > 0) process.exit(1);
