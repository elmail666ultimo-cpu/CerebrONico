/**
 * imagen-v5.test.ts — IMAGEN v5: el reintento prometido, ahora real
 * =================================================================
 * Demuestra de la lista la cura del defecto v1.0.3 (la cabecera prometía
 * «fallo reintentable» y el código no reintentaba):
 *   · default intentos=1 → contrato viejo INTACTO (una sola llamada)
 *   · congestión (500/429/200-HTML) → reintento con backoff y declaración
 *   · 4xx de diseño → NO se reintenta (repetir un error propio es gastar)
 *   · cancelación del usuario → se corta en seco, sin insistir
 */
import { generarImagen } from "../src/engine/imageGen";

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(nombre + (detalle ? " :: " + detalle : ""));
}

const pngBytes = () => {
  const b = new Uint8Array(2048);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return b;
};
const mk = (status: number, ct: string, body: Uint8Array) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? ct : null) },
  arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
});

function red(respuestas: any[]) {
  const cola = [...respuestas];
  const estado = { llamadas: 0, esperas: [] as number[] };
  const fetchImpl = (async () => {
    estado.llamadas++;
    const r = cola.shift();
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  const dormir = async (ms: number) => { estado.esperas.push(ms); };
  return { fetchImpl, estado, dormir };
}

// ─── 1. El default no cambia nada (contrato v2.3) ════════════════════════
{
  const { fetchImpl, estado } = red([mk(500, "text/html", new Uint8Array(20))]);
  const r = await generarImagen({ prompt: "z", fetchImpl, tokenPollinations: undefined, keyGemini: undefined });
  comprobar("default: una sola llamada", estado.llamadas === 1, String(estado.llamadas));
  comprobar("default: congestión → ok:false con motivo", !r.ok && /HTTP 500/.test(r.fallos[0]?.motivo || ""));
}

// ─── 2. Congestión: el segundo golpe gana ════════════════════════════════
{
  const { fetchImpl, estado, dormir } = red([mk(500, "text/html", new Uint8Array(20)), mk(200, "image/png", pngBytes())]);
  const r = await generarImagen({ prompt: "z", fetchImpl, intentos: 3, dormir, keyGemini: undefined });
  comprobar("500 → reintento → imagen ok", r.ok === true && r.proveedor === "pollinations");
  comprobar("exactamente 2 llamadas de red", estado.llamadas === 2, String(estado.llamadas));
  comprobar("backoff corto declarado (2500 ms)", estado.esperas.length === 1 && estado.esperas[0] === 2500, JSON.stringify(estado.esperas));
  comprobar("el reintento se DECLARA en advertencias", (r.advertencias || []).some((a) => /necesitó 2 intentos/.test(a)));
}

// ─── 3. 429 y 200-HTML también son congestión ════════════════════════════
{
  const { fetchImpl, estado } = red([mk(429, "text/plain", new Uint8Array(5)), mk(200, "image/png", pngBytes())]);
  const r = await generarImagen({ prompt: "z", fetchImpl, intentos: 2, dormir: async () => {} });
  comprobar("429 se reintenta", r.ok && estado.llamadas === 2);
}
{
  const { fetchImpl, estado } = red([mk(200, "text/html", new Uint8Array(50)), mk(200, "image/png", pngBytes())]);
  const r = await generarImagen({ prompt: "z", fetchImpl, intentos: 2, dormir: async () => {} });
  comprobar("200 con página HTML se reintenta (congestión)", r.ok && estado.llamadas === 2);
}

// ─── 4. 4xx de diseño NO se reintenta ════════════════════════════════════
{
  const { fetchImpl, estado } = red([mk(403, "text/plain", new Uint8Array(5))]);
  const r = await generarImagen({ prompt: "z", fetchImpl, intentos: 4, dormir: async () => {}, keyGemini: undefined });
  comprobar("403: una llamada y a Gemini", estado.llamadas === 1 && !r.ok);
  comprobar("el motivo del 403 queda en fallos", (r.fallos || []).some((f) => /HTTP 403/.test(f.motivo)));
}

// ─── 5. Cancelación: no se insiste sobre la voluntad del usuario ═════════
{
  const senal: any = { aborted: false, addEventListener: () => {} };
  const { fetchImpl, estado } = red([mk(500, "text/html", new Uint8Array(5)), mk(200, "image/png", pngBytes())]);
  const fetchCancela = (async (...a: Parameters<typeof fetch>) => {
    senal.aborted = true; // el usuario cancela mientras se esperaba
    return fetchImpl(...a);
  }) as unknown as typeof fetch;
  const r = await generarImagen({ prompt: "z", fetchImpl: fetchCancela, intentos: 3, senal, dormir: async () => {}, keyGemini: undefined });
  comprobar("cancelado tras el 500: no hay segundo golpe", estado.llamadas === 1 && !r.ok);
}

// ─── 6. Agotados los intentos: la vuelta a Gemini sigue viva ═════════════
{
  const { fetchImpl, estado } = red([mk(503, "text/plain", new Uint8Array(5)), mk(503, "text/plain", new Uint8Array(5)), mk(503, "text/plain", new Uint8Array(5))]);
  const r = await generarImagen({ prompt: "z", fetchImpl, intentos: 3, dormir: async () => {}, keyGemini: undefined });
  comprobar("3 golpes y sin clave → ok:false: cada intento deja su huella (3 pollinations + gemini-skip)", estado.llamadas === 3 && !r.ok && r.fallos.length === 4 && /gemini/.test(r.fallos[3].proveedor), JSON.stringify(r.fallos));
}

console.log(`\nIMAGEN v5 · ${correctas} correctas, ${fallos.length} en rojo`);
if (fallos.length) { for (const f of fallos) console.log("  ✗ " + f); process.exit(1); }
