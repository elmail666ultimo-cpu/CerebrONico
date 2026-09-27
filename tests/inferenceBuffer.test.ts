/**
 * tests/inferenceBuffer.test.ts — pruebas del búfer de inferencia
 * =================================================================
 * Se ejecuta con:  npx tsx tests/inferenceBuffer.test.ts
 *
 * La prueba que importa es la última sección: la regresión del fallo original.
 * El código anterior devolvía «error_recovered» y CERO texto, así que el
 * mensaje desaparecía justo cuando hacía falta rescatarlo.
 */

import { handleInferenceStream, BufferInferencia } from "../src/engine/inferenceBuffer";

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

function seccion(nombre: string): void {
  console.log(`\n${nombre}`);
}

/* ------------------------------------------------------------------ */
seccion("1. Camino feliz");

{
  const r = handleInferenceStream('{"text":"hola mundo","duration":120}');
  afirmar("JSON plano → success", r.status === "success", r.status);
  afirmar("el mensaje llega entero", r.content === "hola mundo", JSON.stringify(r.content));
  afirmar("payloadDurationMs lee «duration»", r.payloadDurationMs === 120, String(r.payloadDurationMs));
}

{
  const r = handleInferenceStream('data: {"choices":[{"delta":{"content":"Hola"}}]}\n\n');
  afirmar("SSE de OpenAI → success", r.status === "success", r.status);
  afirmar("texto anidado en choices[].delta.content", r.content === "Hola", JSON.stringify(r.content));
}

{
  const r = handleInferenceStream(
    '{"candidates":[{"content":{"parts":[{"text":"respuesta de Gemini"}]}}]}'
  );
  afirmar("forma de Gemini → success", r.status === "success", r.status);
  afirmar("texto anidado en candidates[].content.parts[].text", r.content === "respuesta de Gemini", JSON.stringify(r.content));
}

{
  const r = handleInferenceStream('```json\n{"response":"desde un modelo local"}\n```');
  afirmar("valla markdown fuera → success", r.status === "success", r.status);
  afirmar("contenido rescatado", r.content === "desde un modelo local", JSON.stringify(r.content));
}

{
  const r = handleInferenceStream('Claro, aquí tienes: {"text":"el dato"} — espero que sirva.');
  afirmar("JSON dentro de prosa → success", r.status === "success", r.status);
  afirmar("objeto equilibrado extraído", r.content === "el dato", JSON.stringify(r.content));
}

{
  const r = handleInferenceStream('{"text":"uno"}\n{"text":" y dos"}');
  afirmar("NDJSON de dos líneas → success", r.status === "success", r.status);
  afirmar("líneas fusionadas en orden", r.content === "uno y dos", JSON.stringify(r.content));
}

{
  // Forma de Anthropic: `content` es un ARRAY, no una cadena. Antes caía en
  // «JSON válido sin campo de texto» y el mensaje se declaraba perdido.
  const r = handleInferenceStream('{"content":[{"type":"text","text":"hola de Claude"}]}');
  afirmar("forma de Anthropic → success", r.status === "success", r.status);
  afirmar("texto rescatado de content[].text", r.content === "hola de Claude", JSON.stringify(r.content));
}

{
  // Proxies locales que devuelven la cadena directamente en la clave.
  const r = handleInferenceStream('{"delta":"texto suelto"}');
  afirmar("{delta:\"...\"} → success", r.status === "success", r.status);
  afirmar("cadena suelta rescatada", r.content === "texto suelto", JSON.stringify(r.content));
}

{
  const r = handleInferenceStream('{"output":[{"content":[{"text":"anidado hondo"}]}]}');
  afirmar("anidamiento output→content→text", r.content === "anidado hondo", JSON.stringify(r.content));
}

{
  // NO se debe devolver la entrada del usuario como si fuera la respuesta.
  const r = handleInferenceStream('{"messages":[{"role":"user","content":"no me devuelvas esto"}]}');
  afirmar("el eco de la entrada no se cuela como mensaje", r.content === "", JSON.stringify(r.content));
  afirmar("y el payload queda disponible en data", r.data !== null);
}

/* ------------------------------------------------------------------ */
seccion("2. Recuperación: el mensaje NO puede perderse");

{
  // Coma colgando: el JSON más roto que existe, y el más frecuente en streaming.
  const r = handleInferenceStream('{"text":"mensaje rescatado","done":true,}');
  afirmar("coma colgando → error_recovered", r.status === "error_recovered", r.status);
  afirmar("EL MENSAJE SOBREVIVE", r.content === "mensaje rescatado", JSON.stringify(r.content));
  afirmar("se explica la recuperación", /comas colgando/.test(r.reason || ""), r.reason || "");
}

{
  // Texto plano de un modelo local: nunca fue JSON y jamás lo será.
  const r = handleInferenceStream("¡Hola! Soy tu agente y no sé qué es JSON.");
  afirmar("texto plano → error_recovered", r.status === "error_recovered", r.status);
  afirmar("se entrega el texto crudo completo", r.content === "¡Hola! Soy tu agente y no sé qué es JSON.", JSON.stringify(r.content));
  afirmar("data es null (no había objeto)", r.data === null);
}

{
  // BOM + prefijo SSE + basura alrededor: tres capas de andamiaje.
  const r = handleInferenceStream('\uFEFFdata: por aquí va {"text":"entre ruido"} y sigue');
  afirmar("andamiaje triple → success", r.status === "success", r.status);
  afirmar("mensaje limpio", r.content === "entre ruido", JSON.stringify(r.content));
}

/* ------------------------------------------------------------------ */
seccion("3. Truncado: esperar no es lo mismo que fallar");

{
  // Dentro de un stream, un JSON a medias es «todavía no».
  const r = handleInferenceStream('{"text":"a medio escri', { final: false });
  afirmar("en stream → incomplete", r.status === "incomplete", r.status);
  afirmar("no se inventa mensaje parcial", r.content === "", JSON.stringify(r.content));
}

{
  // Último trozo de la sesión: ya no va a llegar nada más, se rescata.
  const r = handleInferenceStream('{"text":"a medio escri', { final: true });
  afirmar("final → error_recovered", r.status === "error_recovered", r.status);
  afirmar("se rescata lo escrito", r.content === "a medio escri", JSON.stringify(r.content));
  afirmar("se avisa de la reconstrucción", /reconstruido/.test(r.reason || ""), r.reason || "");
}

{
  const r = handleInferenceStream('{"a":{"b":[1,2', { final: true });
  afirmar("truncado sin campo de texto → no inventa mensaje vacío", r.content.length > 0, JSON.stringify(r.content));
}

/* ------------------------------------------------------------------ */
seccion("4. Latidos y finales de stream");

{
  const r = handleInferenceStream("data: [DONE]");
  afirmar("[DONE] → incomplete (no es un mensaje)", r.status === "incomplete", r.status);
  afirmar("sin mensaje fantasma", r.content === "", JSON.stringify(r.content));
}

{
  const r = handleInferenceStream('{"done":true}');
  afirmar("JSON válido sin texto → incomplete", r.status === "incomplete", r.status);
  afirmar("data sí queda disponible", r.data !== null && r.data.done === true);
}

{
  const r = handleInferenceStream("   ");
  afirmar("trozo vacío → incomplete", r.status === "incomplete", r.status);
}

/* ------------------------------------------------------------------ */
seccion("5. Medidas honestas");

{
  // `{"text":"áéí"}` son 14 caracteres pero 17 bytes: á, é e í ocupan dos cada uno.
  const r = handleInferenceStream('{"text":"áéí"}');
  afirmar("payloadSize cuenta BYTES UTF-8, no caracteres", r.payloadSize === 17, String(r.payloadSize));

  const sinOrigen = handleInferenceStream('{"text":"x"}');
  afirmar("sin startedAt, latencyMs es 0 (no se inventa)", sinOrigen.latencyMs === 0, String(sinOrigen.latencyMs));

  const conOrigen = handleInferenceStream('{"text":"x"}', { startedAt: Date.now() - 25 });
  afirmar("con startedAt, latencyMs mide de verdad", conOrigen.latencyMs >= 25, String(conOrigen.latencyMs));
}

{
  // Ollama publica nanosegundos en total_duration. Antes se devolvían como ms.
  const r = handleInferenceStream('{"text":"x","total_duration":2500000000}');
  afirmar("total_duration en ns → normalizado a ms", r.payloadDurationMs === 2500, String(r.payloadDurationMs));
}

/* ------------------------------------------------------------------ */
seccion("6. Búfer incremental (stream troceado a mala idea)");

{
  const buffer = new BufferInferencia();
  const recibidos: string[] = [];
  // Cada trozo completa la línea anterior y deja a medias la siguiente: es la
  // forma exacta en que llega un stream real, cortado donde le pilla.
  const trozos = [
    '{"text":"pri',
    'mera parte"}\n{"text":" segunda',
    ' parte"}\n{"text":" tercera',
  ];
  for (const t of trozos) {
    for (const estado of buffer.push(t)) if (estado.content) recibidos.push(estado.content);
  }
  afirmar("los trozos a medias no se entregan antes de tiempo", recibidos.length === 2, JSON.stringify(recibidos));
  afirmar("la primera línea llega entera", recibidos[0] === "primera parte", JSON.stringify(recibidos[0]));
  afirmar("y la segunda también, ya completada", recibidos[1] === " segunda parte", JSON.stringify(recibidos[1]));
  afirmar("queda cola pendiente (la tercera, a medias)", buffer.pendienteBytes > 0, String(buffer.pendienteBytes));

  for (const estado of buffer.flush()) if (estado.content) recibidos.push(estado.content);
  afirmar("flush() rescata la cola truncada", recibidos.length === 3, JSON.stringify(recibidos));
  afirmar("y sin perder texto", recibidos.join("|") === "primera parte| segunda parte| tercera", JSON.stringify(recibidos));
  afirmar("el búfer queda limpio", buffer.pendienteBytes === 0);
}

{
  // Regresión: el trozo final SIN salto de línea era el que se perdía siempre.
  const buffer = new BufferInferencia();
  const salida = buffer.push('{"text":"uno"}\n{"text":"dos"}\n{"text":"tres"}');
  afirmar("sin salto final, dos líneas se entregan", salida.filter((e) => e.content).length === 2, JSON.stringify(salida.map((e) => e.content)));
  const cola = buffer.flush();
  afirmar("y la última la salva flush()", cola.map((e) => e.content).join("") === "tres", JSON.stringify(cola.map((e) => e.content)));
}

/* ------------------------------------------------------------------ */
seccion("7. Regresión del fallo original");

{
  // El búfer ANTIGUO con este mismo payload devolvía:
  //   { status: "error_recovered", latencyMs: 0, payloadSize: 33 }
  // El mensaje no viajaba en ningún campo. Se perdía el texto del modelo.
  const payloadRoto = '{"text":"EL MENSAJE QUE ANTES SE PERDÍA"';
  const r = handleInferenceStream(payloadRoto, { final: true });

  afirmar("estado de recuperación emitido", r.status === "error_recovered", r.status);
  afirmar(
    "★ EL MENSAJE LLEGA AUNQUE FALLE EL PARSEO JSON",
    /EL MENSAJE/.test(r.content),
    `message = ${JSON.stringify(r.content)}`
  );
  afirmar("el tamaño sigue informándose", r.payloadSize > 0, String(r.payloadSize));
  afirmar("la latencia sigue informándose", typeof r.latencyMs === "number");
}

/* ------------------------------------------------------------------ */
seccion("8. Contrato: timestamp y validStream en TODOS los caminos");

{
  const antes = Date.now();
  const casos = [
    { nombre: "éxito", estado: handleInferenceStream('{"text":"hola"}') },
    { nombre: "recuperado", estado: handleInferenceStream("no soy json") },
    { nombre: "incompleto", estado: handleInferenceStream("data: [DONE]") },
  ];
  const despues = Date.now();

  for (const { nombre, estado } of casos) {
    afirmar(
      `«${nombre}» trae timestamp de reloj de pared`,
      typeof estado.timestamp === "number" && estado.timestamp >= antes && estado.timestamp <= despues,
      String(estado.timestamp)
    );
    afirmar(
      `«${nombre}» trae validStream booleano`,
      typeof estado.validStream === "boolean",
      String(estado.validStream)
    );
    afirmar(
      `«${nombre}»: validStream es coherente con status (derivado, no copiado)`,
      estado.validStream === (estado.status !== "error_recovered"),
      `status=${estado.status} validStream=${estado.validStream}`
    );
  }

  const exito = casos[0].estado;
  const recuperado = casos[1].estado;
  const incompleto = casos[2].estado;

  afirmar("éxito → validStream true", exito.validStream === true);
  afirmar("recuperado → validStream false", recuperado.validStream === false);
  // El caso que hace útil el campo: el transporte va bien, solo falta el resto.
  afirmar("incompleto → validStream TRUE aunque no sea éxito", incompleto.validStream === true, String(incompleto.validStream));
}

{
  // La garantía es SIMÉTRICA: el mensaje está en el camino bueno y en el malo.
  const exito = handleInferenceStream('{"text":"respuesta correcta"}');
  const fallo = handleInferenceStream("respuesta en prosa");
  afirmar("★ el camino de ÉXITO también trae content", exito.content === "respuesta correcta", JSON.stringify(exito.content));
  afirmar("★ y el de fallo también", fallo.content === "respuesta en prosa", JSON.stringify(fallo.content));
}

{
  // La recuperación entrega el MENSAJE, no el cable: sin `data:` ni vallas.
  const r = handleInferenceStream("data: texto plano de un proxy local");
  afirmar("se recupera el texto", r.content === "texto plano de un proxy local", JSON.stringify(r.content));
  afirmar("sin el prefijo SSE pegado", !r.content.includes("data:"), JSON.stringify(r.content));

  const conValla = handleInferenceStream("```json\nno soy json valido\n```");
  afirmar("sin la valla markdown pegada", !conValla.content.includes("```"), JSON.stringify(conValla.content));
}

{
  // INVARIANTE: si el estado dice «success», `content` no puede ser el JSON de
  // entrada. Es la forma de comprobar que el mensaje llega DE VERDAD y no una
  // promesa: buscar tres claves fijas y caer al texto crudo hace que el usuario
  // vea `{"choices":[...]}` con toda la apariencia de haber funcionado.
  const formas = [
    'data: {"choices":[{"delta":{"content":"Hola OpenAI"}}]}',
    '{"candidates":[{"content":{"parts":[{"text":"Hola Gemini"}]}}]}',
    '{"content":[{"type":"text","text":"Hola Claude"}]}',
    '{"output":[{"content":[{"text":"Hola Responses"}]}]}',
  ];
  for (const p of formas) {
    const r = handleInferenceStream(p);
    afirmar(
      `forma de proveedor → texto, no JSON: ${p.slice(0, 30)}…`,
      r.status === "success" && r.content.length > 0 && !r.content.includes("{"),
      `${r.status} · ${JSON.stringify(r.content)}`
    );
  }
  // Y en la de Anthropic `content` es un ARRAY: si se devolviera tal cual, el
  // campo declarado `string` estaría mintiendo en tiempo de ejecución.
  const claude = handleInferenceStream(formas[2]);
  afirmar("nunca devuelve un array donde se prometió string", typeof claude.content === "string", typeof claude.content);
}

{
  // Las vallas DENTRO del contenido generado son CONTENIDO, no andamiaje.
  // Un `.replace(/```/g,"")` global se las come y corrompe el mensaje en silencio.
  const payload = JSON.stringify({ text: "mira:\n```js\nlet x = 1;\n```" });
  const r = handleInferenceStream(payload);
  afirmar("las vallas dentro del texto se conservan", r.content.includes("```js"), JSON.stringify(r.content));
  afirmar("y el contenido llega intacto", r.content === "mira:\n```js\nlet x = 1;\n```", JSON.stringify(r.content));
}

{
  // `parsed.duration` es `any`: el tipo dice number pero nada lo garantiza.
  const r = handleInferenceStream('{"text":"x","duration":"120"}');
  afirmar("una duración no numérica no se cuela en payloadDurationMs", r.payloadDurationMs === undefined, String(r.payloadDurationMs));
  afirmar("y el mensaje llega igual", r.content === "x", JSON.stringify(r.content));
}

/* ------------------------------------------------------------------ */
console.log(`\n${"─".repeat(56)}`);
console.log(`═══ BÚFER DE INFERENCIA: ${pasadas} correctas · ${falladas} fallidas ═══`);
console.log("─".repeat(56));
if (falladas > 0) process.exit(1);
