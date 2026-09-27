/**
 * tests/inferenceBufferPayloads.test.ts — el búfer contra 40 payloads reales
 * ========================================================================
 * Se ejecuta con:  npx tsx tests/inferenceBufferPayloads.test.ts
 *
 * Las otras suites comprueban el comportamiento con casos elegidos a mano.
 * Esta es la prueba de contrato: un corpus de formas que el proyecto se
 * encuentra de verdad, cada una con el texto que DEBE salir. La pregunta que
 * responde no es «¿funciona?» sino «¿entrega el mensaje correcto en todas las
 * formas que existen, y en ninguna inventa uno donde no lo hay?».
 */

import { CORPUS, CON_MENSAJE, SIN_MENSAJE } from "./payloadsInferencia";
import { handleInferenceStream, BufferInferencia } from "../src/engine/inferenceBuffer";

let pasadas = 0;
let falladas = 0;

function afirmar(titulo: string, condicion: boolean, detalle = ""): void {
  if (condicion) {
    pasadas++;
  } else {
    falladas++;
    console.error(`  ✘ ${titulo}\n      ${detalle}`);
  }
}

console.log(`\nCorpus: ${CORPUS.length} payloads · ${CON_MENSAJE} con mensaje · ${SIN_MENSAJE} sin mensaje\n`);

/* ------------------------------------------------------------------
   1. El mensaje correcto en cada forma
   ------------------------------------------------------------------ */
console.log("1. Entrega del mensaje, payload a payload");
for (const caso of CORPUS) {
  const r = handleInferenceStream(caso.payload);

  if (caso.esperado === null) {
    afirmar(
      `«${caso.nombre}» no inventa mensaje — ${caso.nota}`,
      r.content === "",
      `contenido = ${JSON.stringify(r.content)} · status = ${r.status}`
    );
    afirmar(
      `«${caso.nombre}» no declara éxito con texto donde no lo hay`,
      !(r.status === "success" && r.content !== ""),
      `status=${r.status} content=${JSON.stringify(r.content)}`
    );
  } else {
    afirmar(
      `«${caso.nombre}» entrega el mensaje — ${caso.nota}`,
      r.content === caso.esperado,
      `esperado ${JSON.stringify(caso.esperado)} · obtenido ${JSON.stringify(r.content)} (status ${r.status})`
    );
    afirmar(
      `«${caso.nombre}» en estado entregable`,
      r.status === "success" || r.status === "error_recovered",
      `status = ${r.status}`
    );
  }
}

/* ------------------------------------------------------------------
   2. Integridad de tipos: el campo promete string
   ------------------------------------------------------------------ */
console.log("\n2. Integridad del contrato");
for (const caso of CORPUS) {
  const r = handleInferenceStream(caso.payload);
  afirmar(`«${caso.nombre}»: content es string`, typeof r.content === "string", typeof r.content);
  afirmar(`«${caso.nombre}»: timestamp es number`, typeof r.timestamp === "number");
  afirmar(`«${caso.nombre}»: payloadSize es number > 0`, typeof r.payloadSize === "number" && r.payloadSize > 0, String(r.payloadSize));
}

{
  // Ninguna forma puede devolver el JSON de entrada COMO SI FUERA el mensaje.
  // La firma del fallo no es «el contenido empieza por llave» —hay contenido
  // legítimo que parece JSON— sino «el contenido ES el payload». Ese es el
  // camino de caer al texto crudo y hacerlo pasar por éxito.
  const sospechosos = CORPUS.filter((c) => c.esperado !== null && c.esperado !== c.payload && c.esperado.trim() !== c.payload.trim())
    .map((c) => ({ caso: c, r: handleInferenceStream(c.payload) }))
    .filter(({ caso, r }) => r.content === caso.payload || r.content === caso.payload.trim());
  afirmar(
    "★ ningún éxito entrega el payload crudo como contenido",
    sospechosos.length === 0,
    sospechosos.map((s) => s.caso.nombre).join(", ")
  );
}

/* ------------------------------------------------------------------
   3. La limpieza no puede comerse el contenido
   ------------------------------------------------------------------ */
console.log("\n3. Limpieza del andamiaje vs. integridad del contenido");
{
  const conVallas = CORPUS.find((c) => c.nombre === "vallas dentro del texto")!;
  const r = handleInferenceStream(conVallas.payload);
  afirmar("conserva las vallas que van DENTRO del texto", r.content.includes("```js"), JSON.stringify(r.content));

  const acentos = CORPUS.find((c) => c.nombre === "acentos")!;
  const ra = handleInferenceStream(acentos.payload);
  afirmar("conserva los acentos intactos", ra.content === "con áccentos y ñ", JSON.stringify(ra.content));
  afirmar("y payloadSize cuenta bytes, no caracteres", ra.payloadSize > acentos.payload.length, `${ra.payloadSize} vs ${acentos.payload.length}`);
}

/* ------------------------------------------------------------------
   4. El búfer incremental, alimentado byte a byte
   ------------------------------------------------------------------ */
console.log("\n4. Búfer incremental sobre el corpus");
{
  // Trocear cada payload carácter a carácter es el peor caso realista: así
  // llega un stream cuando la red va mal. El resultado no puede cambiar.
  let perdidos = 0;
  for (const caso of CORPUS) {
    if (caso.esperado === null) continue;
    const buffer = new BufferInferencia();
    const salida: string[] = [];
    const texto = caso.payload.endsWith("\n") ? caso.payload : caso.payload + "\n";
    for (const ch of texto) {
      for (const estado of buffer.push(ch)) if (estado.content) salida.push(estado.content);
    }
    for (const estado of buffer.flush()) if (estado.content) salida.push(estado.content);
    const junto = salida.join("");
    if (junto !== caso.esperado) {
      perdidos++;
      console.error(`  ✘ «${caso.nombre}» carácter a carácter → ${JSON.stringify(junto)} (esperado ${JSON.stringify(caso.esperado)})`);
    }
  }
  afirmar(`★ los ${CON_MENSAJE} casos con mensaje sobreviven al troceo carácter a carácter`, perdidos === 0, `${perdidos} perdidos`);
}

/* ------------------------------------------------------------------
   5. Idempotencia: pasar dos veces no puede cambiar el resultado
   ------------------------------------------------------------------ */
console.log("\n5. Idempotencia");
{
  // `timestamp` queda fuera a propósito: es un reloj de pared, así que dos
  // llamadas separadas por un milisegundo DAN sellos distintos por diseño.
  // Compararlo sería un test que falla por tener razón.
  let divergentes = 0;
  const sinSello = (caso: (typeof CORPUS)[number]) =>
    JSON.stringify({ ...handleInferenceStream(caso.payload), timestamp: 0 });
  for (const caso of CORPUS) {
    if (sinSello(caso) !== sinSello(caso)) divergentes++;
  }
  afirmar("dos lecturas del mismo payload dan el mismo estado (sin contar el sello)", divergentes === 0, `${divergentes} divergentes`);

  // Y el sello, aparte: no puede retroceder.
  let retrocesos = 0;
  let anterior = 0;
  for (const caso of CORPUS) {
    const t = handleInferenceStream(caso.payload).timestamp;
    if (t < anterior) retrocesos++;
    anterior = t;
  }
  afirmar("el sello de tiempo nunca retrocede entre lecturas", retrocesos === 0, `${retrocesos} retrocesos`);
}

/* ------------------------------------------------------------------
   6. Ningún caso del corpus se repite (el corpus no engaña al promedio)
   ------------------------------------------------------------------ */
console.log("\n6. Calidad del corpus");
{
  const nombres = new Set(CORPUS.map((c) => c.nombre));
  afirmar("nombres únicos", nombres.size === CORPUS.length, `${CORPUS.length - nombres.size} repetidos`);
  const payloads = new Set(CORPUS.map((c) => c.payload));
  afirmar("payloads únicos", payloads.size === CORPUS.length, `${CORPUS.length - payloads.size} duplicados`);
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ BÚFER · CORPUS DE PAYLOADS: ${pasadas} correctas · ${falladas} fallidas ═══`);
console.log("─".repeat(56));
if (falladas > 0) process.exit(1);
