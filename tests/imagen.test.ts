/**
 * imagen.test.ts — IMÁGENES GRATIS (v2.3)
 * =======================================
 * Lo que hay que DEMOSTRAR (con fetch mockeado, sin red ni suerte):
 *   · la cadena de proveedores: éxito, fallback y fallo total DECLARADO
 *   · la honestidad: el modelo que se reporta es el que RESPONDIÓ (cabecera),
 *     no el que se pidió — el caso real de pedir `flux` y salir `sana`
 *   · los bytes se comprueban por firma mágica, no por la palabra del
 *     Content-Type (un 200 con HTML no es una imagen)
 *   · la orden del chat se valida antes de ejecutar y se avisa sin ejecutar
 *   · el plan acepta la tarea `generar_imagen` y la ejecuta con el executor
 *   · el cortacircuito se ALIMENTA de verdad (antes era código muerto):
 *     tres fallos abren, un éxito cierra
 *   · el escenario 8 GB (MR2): tres imágenes en paralelo sin degradación,
 *     y con RAM justa termina despacio en vez de negarse
 *
 * Se ejecuta con:  npx tsx tests/imagen.test.ts
 */

import {
  generarImagen,
  validarDatosImagen,
  mimePorFirmaMagica,
  extensionDeMime,
  rutaConExtensionReal,
  LIMITES,
} from "../src/engine/imageGen";
import { validarRutaImagen, normalizarImagenDesdeOrden, extraerOrdenes, normalizarPlanDesdeOrden, instruccionesParaElModelo } from "../src/engine/chatOrders";
import { crearEjecutorDePlanes, TIPOS_SOPORTADOS } from "../src/engine/planExecutors";
import { crearPlan, ejecutarPlan, type Tarea } from "../src/engine/taskPlanner";
import { resolverPresupuesto } from "../src/engine/memoriaResiliente";
import { breakerStatus, resetBreakers } from "../src/engine/resilience";

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

console.log("═══ PRUEBAS DE IMÁGENES GRATIS · CerebroNico v2.3 ═══\n");

// ─── Falsificaciones ─────────────────────────────────────────────────────────

/** Firma mágica JPEG de 64 bytes + relleno. */
function jpegFake(bytes = 4096): Uint8Array {
  const b = new Uint8Array(bytes);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0;
  for (let i = 4; i < bytes; i++) b[i] = (i * 31) & 0xff;
  return b;
}
function pngFake(): Uint8Array {
  const b = new Uint8Array(512);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return b;
}

function resImagen(bytes: Uint8Array, headers: Record<string, string> = {}): Response {
  return new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg", ...headers } });
}

type Call = { url: string; init?: RequestInit };
function fetchFake(comportamiento: (call: Call, n: number) => Response | Promise<Response>): { fetch: typeof fetch; llamadas: Call[] } {
  const llamadas: Call[] = [];
  const fetch = (async (input: any, init?: RequestInit) => {
    const call = { url: String(input), init };
    llamadas.push(call);
    return comportamiento(call, llamadas.length);
  }) as unknown as typeof fetch;
  return { fetch, llamadas };
}

resetBreakers();

// ─── 1. Firma mágica: los bytes mandan, no el Content-Type ───────────────────

{
  comprobar("JPEG se reconoce", mimePorFirmaMagica(jpegFake()) === "image/jpeg");
  comprobar("PNG se reconoce", mimePorFirmaMagica(pngFake()) === "image/png");
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3, 4]);
  comprobar("WEBP se reconoce", mimePorFirmaMagica(webp) === "image/webp");
  const html = new TextEncoder().encode("<html>esto no es una imagen</html>");
  comprobar("un HTML con content-type image/jpeg se RECHAZA", mimePorFirmaMagica(html) === null);
  comprobar("extensión de MIME: jpeg → jpg", extensionDeMime("image/jpeg") === "jpg");
  comprobar("extensión de MIME: webp → webp", extensionDeMime("image/webp") === "webp");
}

// ─── 1b. La extensión manda los BYTES: un JPEG jamás se guarda como .png ────

{
  const j = jpegFake();
  const p = pngFake();
  const e1 = rutaConExtensionReal("img/a.jpg", j);
  comprobar("JPEG como .jpg: no se toca", e1.corregida === false && e1.ruta === "img/a.jpg");
  const e2 = rutaConExtensionReal("img/a.jpeg", j);
  comprobar("JPEG como .jpeg: no se toca (mismo formato)", e2.corregida === false && e2.ruta === "img/a.jpeg");
  const e3 = rutaConExtensionReal("img/a.png", j);
  comprobar("JPEG pedido como .png: se corrige a .jpg y se declara", e3.corregida === true && e3.ruta === "img/a.jpg", JSON.stringify(e3));
  const e4 = rutaConExtensionReal("img/sub/b.png", p);
  comprobar("PNG en subcarpeta como .png: no se toca", e4.corregida === false && e4.ruta === "img/sub/b.png");
  const e5 = rutaConExtensionReal("img/sub/c.jpg", p);
  comprobar("PNG pedido como .jpg: se corrige a .png conservando carpeta", e5.corregida === true && e5.ruta === "img/sub/c.png", JSON.stringify(e5));
  const basura = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  let lanzó = false;
  try {
    rutaConExtensionReal("img/x.jpg", basura);
  } catch {
    lanzó = true;
  }
  comprobar("bytes sin firma de imagen: lanza (nada se escribe)", lanzó);
}

// ─── 2. validarDatosImagen: lo que no cuadra, se dice sin tocar la red ───────

{
  const ok = validarDatosImagen({ prompt: "un dragon" });
  comprobar("prompt solo: dimensiones por defecto 1024", ok.ok === true && (ok as any).ancho === 1024 && (ok as any).alto === 1024);
  const v1 = validarDatosImagen({});
  comprobar("sin prompt: se rechaza con motivo", v1.ok === false && /prompt/i.test((v1 as any).error));
  const v2 = validarDatosImagen({ prompt: "x".repeat(5000) });
  comprobar("prompt de 5000 chars: se rechaza", v2.ok === false && /tope/.test((v2 as any).error));
  const v3 = validarDatosImagen({ prompt: "x", ancho: 999999 });
  comprobar("ancho 999999: fuera de rango declarado", v3.ok === false && /fuera de rango/.test((v3 as any).error));
  const v4 = validarDatosImagen({ prompt: "x", ancho: 10.5 });
  comprobar("ancho 10.5: no entero, se dice", v4.ok === false && /entero/.test((v4 as any).error));
  const v5 = validarDatosImagen({ prompt: "x", modelo: "mal modelo!" });
  comprobar("modelo con espacios y signos: se rechaza", v5.ok === false);
  const v6 = validarDatosImagen({ prompt: "x", seed: -1 });
  comprobar("seed negativa: se rechaza", v6.ok === false);
  const v7 = validarDatosImagen({ prompt: "x", seed: "42" });
  comprobar("seed como texto numérico: se acepta", v7.ok === true && (v7 as any).seed === 42);
}

// ─── 3. validarRutaImagen: el binario no escapa del proyecto ─────────────────

{
  comprobar("img/logo.jpg es válida", validarRutaImagen("img/logo.jpg").ok === true);
  comprobar("sub/carpeta/a.png es válida", validarRutaImagen("sub/carpeta/a.png").ok === true);
  const r1 = validarRutaImagen("../../etc/passwd.jpg");
  comprobar("«..» subiendo de carpeta: NO", r1.ok === false && /\.\./.test((r1 as any).error));
  const r2 = validarRutaImagen("/etc/passwd.jpg");
  comprobar("ruta absoluta: NO", r2.ok === false);
  const r3 = validarRutaImagen("img/logo.txt");
  comprobar("extensión que no es imagen: NO", r3.ok === false && /extensión/.test((r3 as any).error));
  const r4 = validarRutaImagen("img/logo.jpg");
  const r5 = validarRutaImagen("img/../../outside.png");
  comprobar("«..» en el medio: NO", r5.ok === false);
  comprobar("ruta con espacio en el nombre: NO (caracteres fuera de lista)", validarRutaImagen("img/logo final.jpg").ok === false);
}

// ─── 4. Cadena: éxito por Pollinations, declarando el modelo REAL ────────────

{
  const { fetch, llamadas } = fetchFake(() => resImagen(jpegFake(), { "x-model-used": "sana" }));
  const r = await generarImagen({ prompt: "un dragon", fetchImpl: fetch, timeoutMs: 2000 });
  comprobar("éxito por pollinations", r.ok === true && r.proveedor === "pollinations");
  comprobar("el modelo declarado es el de la cabecera (sana)", r.modeloUsado === "sana");
  comprobar("los bytes son los recibidos", (r.bytes?.length || 0) === 4096 && r.tipoMime === "image/jpeg");
  comprobar("la URL pública se devuelve como referencia", typeof r.url === "string" && r.url.includes("image.pollinations.ai"));
  comprobar("una sola llamada de red", llamadas.length === 1);

  // El caso medido de verdad: se pide flux y responde sana (anónimo).
  const r2 = await generarImagen({ prompt: "logo", modelo: "flux", fetchImpl: fetch, timeoutMs: 2000 });
  comprobar("pedir flux sin clave: sale igual (sana)", r2.ok === true && r2.modeloUsado === "sana");
  comprobar("y se DECLARA que no es el modelo pedido", r2.advertencias.some((a) => /Se pidió «flux»/.test(a) && /sana/.test(a)), r2.advertencias.join(" | "));
}

// ─── 5. Cadena: un 500 con HTML no es una imagen, aunque diga 200 en el tipo ─

{
  const { fetch, llamadas } = fetchFake(() =>
    new Response("<html>oops</html>", { status: 200, headers: { "content-type": "text/html" } })
  );
  const r = await generarImagen({ prompt: "x", fetchImpl: fetch, timeoutMs: 2000 });
  comprobar("200 con text/html NO se acepta como imagen", r.ok === false);
  comprobar("el motivo dice qué llegó en vez de una imagen", r.fallos.some((f) => f.proveedor === "pollinations" && /text\/html/.test(f.motivo)), JSON.stringify(r.fallos));
  comprobar("y se declara que gemini no se intentó (sin clave)", r.fallos.some((f) => f.proveedor === "gemini" && /GEMINI_API_KEY/.test(f.motivo)));
  comprobar("el error final enumera TODOS los motivos", /pollinations/.test(r.error || "") && /gemini/.test(r.error || ""));
}

// ─── 6. Cadena: pollinations cae (500) → gemini con clave rescata ────────────

{
  let geminiLlamadas = 0;
  const fetchMock = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("pollinations.ai")) {
      return new Response(JSON.stringify({ error: "Internal Server Error", message: "Gen Sana request failed with 429" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("generativelanguage.googleapis.com")) {
      geminiLlamadas++;
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "aquí viene" }, { inlineData: { mimeType: "image/png", data: Buffer.from(pngFake()).toString("base64") } }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    throw new Error("URL desconocida: " + url);
  }) as unknown as typeof fetch;

  const r = await generarImagen({ prompt: "x", keyGemini: "sk-falsa", fetchImpl: fetchMock, timeoutMs: 2000 });
  comprobar("gemini rescata cuando pollinations da 500", r.ok === true && r.proveedor === "gemini");
  comprobar("el modelo usado es uno de la lista gemini", r.modeloUsado === "gemini-3.1-flash-image", r.modeloUsado || "");
  comprobar("el fallo de pollinations quedó registrado", r.fallos.some((f) => f.proveedor === "pollinations" && /HTTP 500/.test(f.motivo) && /429/.test(f.motivo)), JSON.stringify(r.fallos));
  comprobar("gemini se llamó una vez (el primer modelo bastó)", geminiLlamadas === 1);
}

// ─── 7. Cadena: todo cae → ok:false con la lista completa, sin excepciones ───

{
  const { fetch, llamadas } = fetchFake(() => new Response("server down", { status: 500, headers: { "content-type": "text/plain" } }));
  const r = await generarImagen({ prompt: "x", fetchImpl: fetch, timeoutMs: 2000 });
  comprobar("fallo total: ok=false", r.ok === false);
  comprobar("fallo total: sin bytes ni url", r.bytes === undefined && r.url === undefined);
  comprobar("fallo total: ambos eslabones declarados (pollinations 500 + gemini sin clave)", r.fallos.length === 2 && r.fallos.some((f) => /HTTP 500/.test(f.motivo)) && r.fallos.some((f) => /no se intentó/.test(f.motivo)), JSON.stringify(r.fallos));
  comprobar("se intentó pollinations antes de rendirse", llamadas.length === 1);
}

// ─── 8. Validación previa: sin prompt ni red ni excusas ──────────────────────

{
  let llamadas = 0;
  const fetchMock = (async () => {
    llamadas++;
    return resImagen(jpegFake());
  }) as unknown as typeof fetch;
  const r = await generarImagen({ prompt: "   ", fetchImpl: fetchMock });
  comprobar("prompt vacío: no se toca la red", llamadas === 0);
  comprobar("prompt vacío: ok=false con motivo", r.ok === false && /prompt/i.test(r.error || ""));

  const r2 = await generarImagen({ prompt: "x", ancho: 10, fetchImpl: fetchMock });
  comprobar("dimensión bajo el mínimo: se rechaza sin red", llamadas === 0 && r2.ok === false);
}

// ─── 9. Cancelación y timeout ─────────────────────────────────────────────────

{
  const ctrl = new AbortController();
  // Un fetch real con señal YA abortada rechaza en el acto: el mock lo emula
  // igual (comprobar `signal.aborted` primero, no solo escuchar el evento).
  const fetchMock = (async (_url: any, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    if (init?.signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => { /* se resuelve tarde; el abort debe llegar antes */ }, 5000);
    if (typeof (t as any).unref === "function") (t as any).unref();
    init?.signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("aborted", "AbortError")); });
  })) as unknown as typeof fetch;
  ctrl.abort(); // ya cancelada ANTES de pedir
  const r = await generarImagen({ prompt: "x", senal: ctrl.signal, fetchImpl: fetchMock, timeoutMs: 2000 });
  comprobar("tarea ya cancelada: no se genera y se dice", r.ok === false && r.fallos.some((f) => /canceló/.test(f.motivo)), JSON.stringify(r.fallos));

  // Timeout: el proveedor nunca responde
  const fetchPendiente = (async (_url: any, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    if (init?.signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  })) as unknown as typeof fetch;
  const r2 = await generarImagen({ prompt: "x", fetchImpl: fetchPendiente, timeoutMs: 80 });
  comprobar("timeout: no se cuelga, se declara con el tiempo", r2.ok === false && r2.fallos.some((f) => /no respondió en/.test(f.motivo)), JSON.stringify(r2.fallos));
  comprobar("timeout: el fallo no marca la cadena como fatal (es red)", !/configuración|fatal/i.test(r2.error || ""));
}

// ─── 10. Executor del plan: la tarea generar_imagen ──────────────────────────

{
  const avisos: string[] = [];
  const guardadas: string[] = [];
  const executor = crearEjecutorDePlanes({
    pedirModelo: async () => "modelo",
    leerArchivo: async () => "archivo",
    onAviso: (l) => avisos.push(l),
    generarImagen: async (p) => {
      const r = await generarImagen({ prompt: p.prompt, fetchImpl: fetchFake(() => resImagen(jpegFake(), { "x-model-used": "sana" })).fetch as typeof fetch, timeoutMs: 2000 });
      return r;
    },
    guardarBinario: async (ruta) => {
      guardadas.push(ruta);
      return ruta;
    },
  });

  const tarea: Tarea = {
    id: "1",
    titulo: "dibujar",
    peso: "io",
    dependeDe: [],
    estado: "lista",
    intentos: 0,
    tipo: "generar_imagen",
    datos: { prompt: "un logo", salida: "img/logo.jpg" },
  };
  const r = await executor(tarea, new AbortController().signal);
  comprobar("el resumen declara proveedor y modelo REAL", /proveedor pollinations/.test(r.resumen) && /modelo REAL sana/.test(r.resumen), r.resumen);
  comprobar("el resumen declara bytes y tiempo", /KB/.test(r.resumen) && /s\b/.test(r.resumen));
  comprobar("el binario se guardó en la ruta pedida", guardadas.length === 1 && guardadas[0] === "img/logo.jpg");
  comprobar("los artefactos incluyen la ruta guardada", (r.artefactos || []).includes("img/logo.jpg"));

  // Sin prompt: fatal, y el planificador NO reintenta lo fatal
  const tareaMal: Tarea = { id: "2", titulo: "sin prompt", peso: "io", dependeDe: [], estado: "lista", intentos: 0, tipo: "generar_imagen", datos: {} };
  let fatal = false;
  try {
    await executor(tareaMal, new AbortController().signal);
  } catch (e: any) {
    fatal = e?.fatal === true;
  }
  comprobar("tarea sin prompt: error FATAL (no reintentable)", fatal);

  // Cadena caída: no fatal → el plan reintenta una vez y falla con todo dicho
  const executorCaida = crearEjecutorDePlanes({
    pedirModelo: async () => "m",
    leerArchivo: async () => "a",
    generarImagen: async () => ({
      ok: false,
      advertencias: [],
      fallos: [
        { proveedor: "pollinations", motivo: "no respondió en 120 s (el gratuito tarda, y a veces más)" },
        { proveedor: "gemini", motivo: "no se intentó: no hay GEMINI_API_KEY" },
      ],
      error: "No se pudo generar la imagen en ningún proveedor. pollinations → no respondió · gemini → no se intentó",
    }),
  });
  const plan = crearPlan("generar dos imágenes", [
    { id: "1", titulo: "img1", peso: "io", tipo: "generar_imagen", datos: { prompt: "a" } },
  ]);
  await ejecutarPlan(plan, {
    ejecutar: executorCaida,
    medir: () => ({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
    maxIntentosPorTarea: 2,
  });
  const t = plan.tareas[0];
  comprobar("falla: se reintenta UNA vez (es red, no configuración)", t.intentos === 2, `intentos=${t.intentos}`);
  comprobar("y queda fallida, no colgada", t.estado === "fallida");
  comprobar("el plan se reporta fallido (no hecho)", plan.estado === "fallido");

  // Con salida pedida pero sin capacidad de guardar: avisa, no crashea
  const avisos2: string[] = [];
  const executorSinGuardar = crearEjecutorDePlanes({
    pedirModelo: async () => "m",
    leerArchivo: async () => "a",
    onAviso: (l) => avisos2.push(l),
    generarImagen: async (p) => generarImagen({ prompt: p.prompt, fetchImpl: fetchFake(() => resImagen(jpegFake())).fetch as typeof fetch, timeoutMs: 2000 }),
  });
  const tareaSinGuardar: Tarea = { id: "3", titulo: "con salida", peso: "io", dependeDe: [], estado: "lista", intentos: 0, tipo: "generar_imagen", datos: { prompt: "x", salida: "img/x.jpg" } };
  const r3 = await executorSinGuardar(tareaSinGuardar, new AbortController().signal);
  comprobar("sin guardarBinario: la imagen sale igual (con su URL) y se AVISA", /Imagen generada/.test(r3.resumen) && r3.resumen.includes("image.pollinations.ai") && avisos2.some((a) => /no tiene escritura binaria/.test(a)), r3.resumen + " :: " + avisos2.join(" | "));

  // TIPOS_SOPORTADOS ahora tiene los cuatro
  // No se congela la CUENTA (v2.5 añadió «reflejo» y este test, bien
  // intencionado, la rompió): se exige que los cuatro de v2.3 SIGAN, que es
  // la promesa real de esta suite.
  comprobar("TIPOS_SOPORTADOS conserva los cuatro de v2.3", ["modelo", "leer_archivo", "convertir", "generar_imagen"].every((x) => (TIPOS_SOPORTADOS as readonly string[]).includes(x)));
}

// ─── 11. Orden del chat: cerebronico:imagen ──────────────────────────────────

{
  const msg = ["Nada de describir: te la genero.", "", "```cerebronico:imagen", '{"prompt":"logo minimalista de un cerebro, neón","salida":"img/logo.jpg","ancho":1024,"alto":1024,"modelo":"sana"}', "```"].join("\n");
  const { ordenes, avisos } = extraerOrdenes(msg);
  const img = ordenes.find((o) => o.tipo === "imagen");
  comprobar("se extrae la orden imagen", img !== undefined, JSON.stringify(ordenes));
  comprobar("con todos sus campos", img?.tipo === "imagen" && (img as any).prompt.startsWith("logo") && (img as any).salida === "img/logo.jpg" && (img as any).ancho === 1024);
  comprobar("0 avisos con una orden bien escrita", avisos.length === 0, avisos.join(" | "));

  const sinPrompt = extraerOrdenes('```cerebronico:imagen\n{"salida":"img/x.jpg"}\n```');
  comprobar("sin prompt: rechazada y avisada, sin orden", sinPrompt.ordenes.length === 0 && sinPrompt.avisos.some((a) => /prompt/.test(a)));

  const anchoRoto = extraerOrdenes('```cerebronico:imagen\n{"prompt":"x","ancho":5000}\n```');
  comprobar("ancho 5000: rechazada diciendo el rango", anchoRoto.avisos.some((a) => /256–2048|fuera de rango/.test(a)), anchoRoto.avisos.join(" | "));

  const rutaMal = extraerOrdenes('```cerebronico:imagen\n{"prompt":"x","salida":"../../etc/shadow.jpg"}\n```');
  comprobar("salida con «..»: rechazada (no se escribe nada fuera)", rutaMal.ordenes.length === 0 && rutaMal.avisos.some((a) => /salida/.test(a)));

  const jsonRoto = extraerOrdenes('```cerebronico:imagen\n{no es json}\n```');
  comprobar("JSON roto: avisada sin ejecutar", jsonRoto.ordenes.length === 0 && jsonRoto.avisos.some((a) => /no es JSON/.test(a)));

  const normal = normalizarImagenDesdeOrden({ prompt: "x", salida: "" });
  comprobar("salida vacía: se normaliza a sin salida", normal.ok === true && (normal as any).orden.salida === undefined);
}

// ─── 12. Planes: el chat valida generar_imagen con la autoridad del motor ───

{
  const ok = normalizarPlanDesdeOrden({
    objetivo: "generar dos imágenes",
    tareas: [
      { id: "1", titulo: "img a", tipo: "generar_imagen", peso: "io", datos: { prompt: "un dragon", salida: "img/a.jpg" } },
      { id: "2", titulo: "img b", tipo: "generar_imagen", peso: "io", datos: { prompt: "otra cosa" } },
    ],
  });
  comprobar("plan con tareas de imagen válido: aceptado", ok.ok === true, ok.ok ? "" : (ok as any).error);

  const sinPrompt = normalizarPlanDesdeOrden({
    objetivo: "img rota",
    tareas: [{ id: "1", titulo: "sin prompt", tipo: "generar_imagen", datos: {} }],
  });
  comprobar("tarea de imagen sin prompt: el chat la rechaza ANTES de enviar", sinPrompt.ok === false && /prompt/i.test((sinPrompt as any).error), JSON.stringify(sinPrompt));

  const salidaRota = normalizarPlanDesdeOrden({
    objetivo: "img rota",
    tareas: [{ id: "1", titulo: "salida mala", tipo: "generar_imagen", datos: { prompt: "x", salida: "../fuera.jpg" } }],
  });
  comprobar("salida con «..» en el plan: se rechaza", salidaRota.ok === false);

  const tipoInventado = normalizarPlanDesdeOrden({
    objetivo: "x",
    tareas: [{ id: "1", titulo: "x", tipo: "dibujar", datos: {} }],
  });
  comprobar("tipo inventado: el mensaje lista los CUATRO soportados", tipoInventado.ok === false && (tipoInventado as any).error.includes("generar_imagen"), JSON.stringify(tipoInventado));
}

// ─── 13. Lo que el modelo tiene que saber (instrucciones) ────────────────────

{
  const ins = instruccionesParaElModelo();
  comprobar("enseña la orden cerebronico:imagen", ins.includes("cerebronico:imagen"));
  comprobar("enseña el tipo generar_imagen en los planes", ins.includes("generar_imagen"));
  comprobar("nombra los tipos de v2.3", /modelo/.test(ins) && /leer_archivo/.test(ins) && /convertir/.test(ins) && /generar_imagen/.test(ins));
  comprobar("obliga a la honestidad sobre el modelo real", /modelo.*real|real.*modelo/i.test(ins) && /sana|clave/.test(ins));
  comprobar("dice que es gratis y sin clave", /gratis|sin clave/i.test(ins));
}

// ─── 14. El cortacircuito se ALIMENTA (antes era código muerto) ──────────────

{
  resetBreakers();
  const clave = "img-circuito-test";
  const lanzarTarea = (id: string): Tarea => ({
    id,
    titulo: `imagen ${id}`,
    peso: "io",
    dependeDe: [],
    estado: "pendiente",
    intentos: 0,
    tipo: "generar_imagen",
    datos: { prompt: "x" },
    claveCircuito: clave,
  });

  // Tres fallos de red seguidos (el proveedor caído de verdad)
  const ejecutarCaído = async (_t: Tarea, _s: AbortSignal) => {
    throw new Error("fetch failed: ECONNRESET"); // retryable por patrón
  };

  const plan = crearPlan("probar el cortacircuito", [lanzarTarea("1"), lanzarTarea("2"), lanzarTarea("3")]);
  await ejecutarPlan(plan, {
    ejecutar: ejecutarCaído,
    medir: () => ({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
    maxIntentosPorTarea: 2,
    esperaCircuitoMs: 50,
    maxEsperasCircuito: 2,
  });
  const st = breakerStatus(clave);
  comprobar("tras 3+ fallos de red, el cortacircuito ESTÁ ABIERTO (antes nunca se movía)", st.open === true, JSON.stringify(st));
  const bloqueadas = plan.tareas.filter((t) => t.bloqueoCircuito === true);
  comprobar("y las tareas que llegan con el circuito abierto se BLOQUEAN en vez de quemar intentos", bloqueadas.length >= 1, `bloqueadas=${bloqueadas.length}`);
  comprobar("el motivo de la bloqueo lo dice el cortacircuito", bloqueadas.length > 0 && /cortacircuito/.test(bloqueadas[0].motivoEspera || ""), bloqueadas[0]?.motivoEspera || "");

  // Un éxito lo cierra de nuevo
  const clave2 = "img-circuito-ok";
  let intento = 0;
  const plan2 = crearPlan("probar el cierre", [
    { id: "1", titulo: "falla y sale", peso: "io", tipo: "generar_imagen", datos: { prompt: "x" }, claveCircuito: clave2 },
  ]);
  await ejecutarPlan(plan2, {
    ejecutar: async (_t, _s) => {
      intento++;
      if (intento === 1) throw new Error("fetch failed: ECONNRESET");
      return { resumen: "ok" };
    },
    medir: () => ({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
    maxIntentosPorTarea: 2,
  });
  comprobar("la tarea se reintenta y sale bien", plan2.tareas[0].estado === "hecha" && intento === 2);
  comprobar("y el éxito CIERRA el circuito (contador a 0)", breakerStatus(clave2).failures === 0 && breakerStatus(clave2).open === false, JSON.stringify(breakerStatus(clave2)));
  resetBreakers();

  // 429 «Queue full for IP» — medido en vivo con dos imágenes en paralelo —
  // es la falla pasajera de la capa gratuita: se reintenta una vez, no se abandona.
  const plan429 = crearPlan("el 429 se reintenta", [
    { id: "1", titulo: "img 429", peso: "io", tipo: "generar_imagen", datos: { prompt: "x" } },
  ]);
  let n429 = 0;
  await ejecutarPlan(plan429, {
    ejecutar: async (_t, _s) => {
      n429++;
      if (n429 === 1) {
        const e = new Error("No se pudo generar la imagen en ningún proveedor. pollinations → HTTP 429: Too Many Requests (Queue full for IP)");
        (e as any).status = 429;
        throw e;
      }
      return { resumen: "ok" };
    },
    medir: () => ({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
    maxIntentosPorTarea: 2,
  });
  comprobar("un 429 en el primer intento se reintenta (no se abandona la tarea)", plan429.tareas[0].estado === "hecha" && n429 === 2, `n=${n429} estado=${plan429.tareas[0].estado}`);
  resetBreakers();
}

// ─── 15. El escenario 8 GB (MR2) con la nueva tarea de peso io ───────────────

{
  // 8 GB con RAM holgada: tres imágenes corren a la vez, sin degradación.
  const b = resolverPresupuesto({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 });
  comprobar("8 GB (MR2): caben 3 tareas io a la vez", b.io === 3 && b.perfil.id === "MR2", `io=${b.io} cpu=${b.cpu}`);
  comprobar("8 GB (MR2): sin degradación con RAM holgada", b.degradado === false, b.motivo.join(" | "));

  // 8 GB con RAM justa: se degrada a 1, se dice el motivo, y TERMINA igual.
  const b2 = resolverPresupuesto({ ramMedidaGB: 8, ramLibreGB: 1.2, nucleos: 4 });
  comprobar("8 GB con 1.2 GB libres: se degrada a 1 io (no a 0)", b2.io === 1 && b2.cpu >= 1);
  comprobar("y el motivo está escrito (no un número sin explicación)", b2.degradado === true && b2.motivo.length > 0 && /RAM libre/.test(b2.motivo.join(" ")), b2.motivo.join(" | "));

  // Un plan de 4 imágenes en una 8 GB: las 4 terminan, el plan sale "hecho".
  const plan = crearPlan("cuatro imágenes en 8 GB", [1, 2, 3, 4].map((i) => ({
    id: String(i),
    titulo: `imagen ${i}`,
    peso: "io" as const,
    tipo: "generar_imagen",
    datos: { prompt: `prompt ${i}` },
  })));
  let lanzadas = 0;
  await ejecutarPlan(plan, {
    ejecutar: async (_t, _s) => {
      lanzadas++;
      return { resumen: "imagen " + _t.id };
    },
    medir: () => ({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
  });
  comprobar("plan de 4 imágenes: todas terminan en 8 GB", plan.estado === "hecho" && plan.resumen?.hechas === 4, `estado=${plan.estado}`);
  comprobar("y de verdad se lanzaron las cuatro", lanzadas === 4, String(lanzadas));
}

console.log(`\n═══ RESULTADO: ${pasan} correctas · ${fallan} fallidas ═══`);
if (fallan > 0) {
  console.log("Fallos:");
  fallos.forEach((f) => console.log(`  · ${f}`));
}
process.exitCode = fallan > 0 ? 1 : 0;
