/**
 * tests/payloadsInferencia.ts — CORPUS de payloads reales de inferencia
 * =====================================================================
 * No son ejemplos inventados: son las formas que este proyecto se encuentra de
 * verdad (SSE propio en server.ts, NDJSON de Ollama, y los envoltorios de
 * OpenAI, Gemini, Anthropic y la Responses API), más el andamiaje de transporte
 * que los rodea.
 *
 * Cada caso declara QUÉ DEBE SALIR. Es el oráculo contra el que se comprueba el
 * búfer: sin esto, «el mensaje siempre llega» es una afirmación sin forma de
 * refutarla.
 *
 * `esperado: null` significa «este trozo NO trae mensaje» — un latido, un
 * contador de uso o el fin del stream. Devolver texto ahí también es un fallo:
 * es cómo un `[DONE]` acaba pintado en la interfaz como si fuera una respuesta.
 */

export interface CasoPayload {
  nombre: string;
  payload: string;
  /** Texto que debe entregarse, o `null` si el trozo no lleva mensaje. */
  esperado: string | null;
  /** Qué se está comprobando aquí. */
  nota: string;
}

/* Los payloads con texto dentro se construyen con JSON.stringify para que el
   escape sea el del JSON real y no el de la cadena de TypeScript. */
const conVallasDentro = JSON.stringify({ text: "mira:\n```js\nlet x = 1;\n```" });
/* El contenido que PARECE JSON sin serlo. Se construye con JSON.stringify para
   que el escape lo haga él: escribirlo a mano invita a que se cuele una comilla
   fuera de sitio. */
const jsonComoTexto = JSON.stringify({ text: '{ "no soy un objeto" }' });

export const CORPUS: CasoPayload[] = [
  /* ---------- 1. Envoltorios simples ---------- */
  { nombre: "forma text", payload: '{"text":"hola"}', esperado: "hola", nota: "la forma base de la app" },
  { nombre: "forma message", payload: '{"message":"hola"}', esperado: "hola", nota: "vocabulario OpenAI" },
  { nombre: "forma response", payload: '{"response":"hola"}', esperado: "hola", nota: "vocabulario Ollama" },
  { nombre: "forma content", payload: '{"content":"hola"}', esperado: "hola", nota: "vocabulario OpenAI" },
  { nombre: "forma answer", payload: '{"answer":"hola"}', esperado: "hola", nota: "envoltorios de terceros" },
  { nombre: "forma output_text", payload: '{"output_text":"hola"}', esperado: "hola", nota: "Responses API" },
  { nombre: "forma completion", payload: '{"completion":"hola"}', esperado: "hola", nota: "modelos de texto antiguos" },
  { nombre: "clave en español", payload: '{"texto":"hola"}', esperado: "hola", nota: "motores y proxies locales" },

  /* ---------- 2. Envoltorios de proveedor ---------- */
  { nombre: "OpenAI streaming", payload: '{"choices":[{"delta":{"content":"Hola"}}]}', esperado: "Hola", nota: "choices[].delta.content" },
  { nombre: "OpenAI no-streaming", payload: '{"choices":[{"message":{"content":"Hola"}}]}', esperado: "Hola", nota: "choices[].message.content" },
  { nombre: "Gemini", payload: '{"candidates":[{"content":{"parts":[{"text":"Hola"}]}}]}', esperado: "Hola", nota: "candidates[].content.parts[].text" },
  { nombre: "Anthropic bloque", payload: '{"content":[{"type":"text","text":"Hola"}]}', esperado: "Hola", nota: "content[] es un ARRAY, no una cadena" },
  { nombre: "Anthropic delta", payload: '{"delta":{"type":"text_delta","text":"Hola"}}', esperado: "Hola", nota: "delta es un OBJETO" },
  { nombre: "Responses API", payload: '{"output":[{"content":[{"text":"Hola"}]}]}', esperado: "Hola", nota: "output[].content[].text" },
  { nombre: "envuelto en data", payload: '{"data":{"content":"Hola"}}', esperado: "Hola", nota: "un nivel de envoltorio extra" },

  /* ---------- 3. Andamiaje de transporte ---------- */
  { nombre: "SSE", payload: 'data: {"text":"hola"}\n\n', esperado: "hola", nota: "prefijo data: y doble salto" },
  { nombre: "BOM", payload: '\uFEFF{"text":"hola"}', esperado: "hola", nota: "marca de orden de bytes al principio" },
  { nombre: "valla markdown", payload: '```json\n{"text":"hola"}\n```', esperado: "hola", nota: "modelos que envuelven su JSON" },
  { nombre: "SSE en varias líneas", payload: 'data: {"text":"uno"}\ndata: {"text":" y dos"}', esperado: "uno y dos", nota: "dos eventos, se fusionan en orden" },
  { nombre: "NDJSON", payload: '{"text":"uno"}\n{"text":" y dos"}', esperado: "uno y dos", nota: "una línea por objeto" },
  { nombre: "prosa alrededor", payload: 'Claro, aquí va: {"text":"el dato"} — espero que sirva.', esperado: "el dato", nota: "el modelo parlotea antes del JSON" },
  { nombre: "prefijo de datos y error", payload: 'data: {"error":"cuota agotada"}', esperado: "cuota agotada", nota: "el error del motor TAMBIÉN es contenido" },

  /* ---------- 4. Trozos que NO son mensaje ---------- */
  { nombre: "fin de stream", payload: "data: [DONE]", esperado: null, nota: "el centinela no puede pintarse" },
  { nombre: "fin de stream sin SSE", payload: "[DONE]", esperado: null, nota: "ídem sin prefijo" },
  { nombre: "latido", payload: '{"done":true}', esperado: null, nota: "JSON válido sin texto" },
  { nombre: "latido con modelo", payload: '{"model":"x","done":true}', esperado: null, nota: "metadatos, no mensaje" },
  { nombre: "solo uso", payload: '{"usage":{"total_tokens":5}}', esperado: null, nota: "contabilidad, no mensaje" },
  { nombre: "texto vacío", payload: '{"text":""}', esperado: null, nota: "delta vacío: aún no hay nada" },
  { nombre: "trozo vacío", payload: "   ", esperado: null, nota: "latido en blanco" },
  { nombre: "eco de la entrada", payload: '{"messages":[{"role":"user","content":"no me devuelvas esto"}]}', esperado: null, nota: "la entrada NO es la respuesta" },

  /* ---------- 5. Texto plano ---------- */
  { nombre: "prosa", payload: "respuesta en prosa", esperado: "respuesta en prosa", nota: "modelo local que no devuelve JSON" },
  { nombre: "prosa tras SSE", payload: "data: texto plano de un proxy", esperado: "texto plano de un proxy", nota: "sin el prefijo pegado" },
  { nombre: "HTML de un proxy caído", payload: "<html><body>502 Bad Gateway</body></html>", esperado: "<html><body>502 Bad Gateway</body></html>", nota: "mejor eso que nada" },

  /* ---------- 6. Recuperación ---------- */
  { nombre: "coma colgando", payload: '{"text":"rescatado","done":true,}', esperado: "rescatado", nota: "el JSON roto más frecuente" },
  { nombre: "truncado al final", payload: '{"text":"a medio', esperado: "a medio", nota: "se cierra y se entrega" },
  { nombre: "truncado anidado", payload: '{"a":{"b":[1,2', esperado: '{"a":{"b":[1,2', nota: "se reconstruye para buscar texto; no lo hay, así que se entrega el crudo" },

  /* ---------- 7. Integridad del contenido ---------- */
  { nombre: "vallas dentro del texto", payload: conVallasDentro, esperado: "mira:\n```js\nlet x = 1;\n```", nota: "limpiar el andamiaje NO puede comerse el contenido" },
  { nombre: "acentos", payload: '{"text":"con áccentos y ñ"}', esperado: "con áccentos y ñ", nota: "y de paso: bytes ≠ caracteres" },
  { nombre: "JSON como contenido", payload: jsonComoTexto, esperado: '{ "no soy un objeto" }', nota: "el contenido puede parecer JSON sin serlo" },
];

/** Cuántos casos del corpus esperan un mensaje. */
export const CON_MENSAJE = CORPUS.filter((c) => c.esperado !== null).length;
/** Cuántos esperan que NO haya mensaje. */
export const SIN_MENSAJE = CORPUS.length - CON_MENSAJE;
