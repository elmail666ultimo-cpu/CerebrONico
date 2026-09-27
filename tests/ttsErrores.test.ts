/**
 * ttsErrores.test.ts — LA VENTANA DE VOZ, DOMESTICADA (v1.13.0)
 * ============================================================
 * QUÉ ES: la suite del clasificador de errores de voz (`server/ttsErrores.ts`) y
 * del aviso que ve el usuario (`src/utils/voz.ts`).
 * PARA QUÉ SIRVE: para que no vuelva a aparecer el cartel que se comía la pantalla.
 * El caso real que lo motivó está aquí dentro, copiado tal cual: cuando la cuota de
 * Gemini se agota, el SDK lanza un error cuyo mensaje es el **JSON entero de Google**
 * —código 429, enlaces, cuotas, `retryDelay`— y eso acababa pintado en el banner de
 * la interfaz, encima de la conversación.
 *
 * LO QUE SE EXIGE, EN UNA FRASE
 * Al usuario, la causa en una frase corta; el volcado técnico, al registro; y si el
 * fallo es de cuota o de clave, NO se insiste (insistir no arregla nada y repetía el
 * cartel en cada mensaje).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { clasificarErrorTTS, recortarDetalle } from "../server/ttsErrores";
import { acortarMotivo, avisoDeVozNoDisponible } from "../src/utils/voz";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle?: string) {
  if (condicion) correctas++;
  else fallos.push(`${titulo}${detalle ? " → " + detalle : ""}`);
}

// El error REAL del 429, tal y como llega del SDK de Gemini (recortado al mensaje).
const JSON_CUOTA_REAL = JSON.stringify({
  error: {
    code: 429,
    message:
      "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit.",
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [
          {
            quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
            quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
            quotaValue: "3",
          },
        ],
      },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "19s" },
    ],
  },
});

// ═══ 1 · LA CLASIFICACIÓN ══════════════════════════════════════════════════
console.log("\n1) Traducir el error\n");

const cuota = clasificarErrorTTS(new Error(JSON_CUOTA_REAL));
comprobar("★ el 429 real se clasifica como cuota", cuota.clase === "cuota", cuota.clase);
comprobar("★ con una frase de una línea, sin JSON", cuota.motivo.length < 120 && !cuota.motivo.includes("{"), cuota.motivo);
comprobar("★ y NO se reintenta (insistir no arregla la cuota)", cuota.reintentable === false);
comprobar("la frase dice qué pasó, no un código", /cuota/i.test(cuota.motivo) && !/\b429\b/.test(cuota.motivo), cuota.motivo);

const clave = clasificarErrorTTS(new Error("API_KEY_INVALID: API key not valid"));
comprobar("★ clave inválida se reconoce y no se reintenta", clave.clase === "clave" && clave.reintentable === false, clave.motivo);
comprobar("un 401 también es clave", clasificarErrorTTS({ status: 401 }).clase === "clave");
comprobar("un 403 también es clave", clasificarErrorTTS("403 PERMISSION_DENIED").clase === "clave");

const sinAudio = clasificarErrorTTS(new Error("la respuesta no trajo audio (vino texto)."));
comprobar("★ «vino texto en vez de audio» SÍ se reintenta (es un fallo pasajero)", sinAudio.clase === "sin_audio" && sinAudio.reintentable === true);

const red = clasificarErrorTTS(new Error("fetch failed"));
comprobar("★ un fallo de red se reintenta y se dice como red", red.clase === "red" && red.reintentable === true, red.motivo);
comprobar("un timeout también es red", clasificarErrorTTS("ETIMEDOUT").clase === "red");

const otro = clasificarErrorTTS(new Error("algo raro pasó"));
comprobar("lo desconocido no se disfraza: clase «otro»", otro.clase === "otro" && otro.reintentable === true);
comprobar("y sin error también contesta algo (nunca undefined)", clasificarErrorTTS(undefined).motivo.length > 5);

// ═══ 2 · EL DETALLE VA AL REGISTRO, RECORTADO ══════════════════════════════
console.log("\n2) El volcado técnico no se tira: se recorta\n");

const detalle = recortarDetalle(new Error(JSON_CUOTA_REAL));
comprobar("★ el detalle se recorta (no caben mil caracteres)", detalle.length < 500, `${detalle.length} caracteres`);
comprobar("★ y dice cuánto se recortó (para saber que hay más)", /recortado de \d+ caracteres/.test(detalle));
comprobar("el detalle conserva lo útil: el código", detalle.includes("429"));

// ═══ 3 · EL AVISO QUE VE EL USUARIO ════════════════════════════════════════
console.log("\n3) El aviso de la interfaz\n");

const aviso = avisoDeVozNoDisponible("Gacrux", cuota.motivo);
comprobar("★ el aviso es UNA línea corta (antes eran mil caracteres)", aviso.length < 220, `${aviso.length} caracteres`);
comprobar("★ dice la voz elegida", aviso.includes("Gacrux"));
comprobar("★ dice la causa", /cuota/i.test(aviso));
comprobar("★ y dice qué se hace mientras (voz del navegador)", /voz del navegador/.test(aviso));
comprobar("★ con el JSON crudo como motivo, el aviso sigue siendo corto", (() => {
  const malo = avisoDeVozNoDisponible("Kore", JSON_CUOTA_REAL);
  return malo.length < 260 && !malo.includes("googleapis.com");
})(), String(avisoDeVozNoDisponible("Kore", JSON_CUOTA_REAL).length));

comprobar("acortarMotivo recorta a 160 por defecto", acortarMotivo("x".repeat(500)).length <= 161);
comprobar("acortarMotivo marca el corte con puntos suspensivos", acortarMotivo("x".repeat(500)).endsWith("…"));
comprobar("acortarMotivo aguanta un motivo vacío", acortarMotivo("").length > 0);
comprobar("acortarMotivo quita saltos de línea (no rompe el banner)", !acortarMotivo("a\n\nb\tc").includes("\n"));

// ═══ 4 · ENGANCHADO Y SIN INSISTIR ═════════════════════════════════════════
console.log("\n4) Enganchado: servidor, cliente y espera\n");

const servidor = leer("server.ts");
const iRuta = servidor.indexOf('"/api/tts/gemini"');
// El cuerpo se acota con la RUTA SIGUIENTE, no con un número de caracteres.
// Mi primera versión usaba una ventana de 2200 y las comprobaciones del final de la
// ruta quedaban fuera: fallaban por longitud, no por contenido. Es el mismo error
// que cometí con el endpoint del puente — y por eso aquí queda escrito.
const iFinRuta = servidor.indexOf("\n  app.", iRuta + 20);
const cuerpoRuta = servidor.slice(iRuta, iFinRuta > iRuta ? iFinRuta : iRuta + 4000);
comprobar("el servidor clasifica el error antes de contestar", /clasificarErrorTTS\(err\)/.test(cuerpoRuta));
comprobar("★ y NO insiste cuando el fallo no es pasajero", /if \(!ultimo\.reintentable\) break;/.test(cuerpoRuta));
comprobar("★ la respuesta lleva clase, motivo corto y detalle", /clase: ultimo\.clase/.test(cuerpoRuta) && /motivo: ultimo\.motivo/.test(cuerpoRuta) && /detalle: recortarDetalle/.test(cuerpoRuta));
comprobar("ya no devuelve el mensaje del SDK tal cual", !/motivo: `Gemini TTS falló tras 3 intentos: \$\{String\(lastErr/.test(servidor));

const chat = leer("src/components/ChatCenter.tsx");
comprobar("★ el cliente pinta el aviso corto, no el motivo crudo", /setTtsAviso\(avisoDeVozNoDisponible\(voice, motivo\)\)/.test(chat));
comprobar("★ y manda el detalle al registro", /console\.warn\(`\[Voz\] detalle técnico/.test(chat));
comprobar("★ hay espera tras cuota/clave (no se insiste en cada mensaje)", /VOZ_EN_ESPERA_MS = 5 \* 60_000/.test(chat) && /vozEnEsperaHastaRef\.current = Date\.now\(\) \+ VOZ_EN_ESPERA_MS/.test(chat));
comprobar("★ en espera, se va directo a la voz del navegador", /const esGemini = esVozGemini\(ttsVoice\);/.test(chat) && /if \(esGemini && !enEsperaVoz\)/.test(chat) && /hablarConNavegador\(msg, text\);/.test(chat));
comprobar("★ y el aviso no se repite en cada mensaje (se mantiene, no se recrea)", /if \(!enEsperaVoz\) setTtsAviso\(null\);/.test(chat));
comprobar("el aviso sigue siendo un banner cerrable (no un modal)", /title="Cerrar aviso"/.test(chat));
comprobar("esta suite entra en npm run validar", leer("scripts/validar.mjs").includes("ttsErrores.test.ts"));

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ VOZ SIN VENTANA (CN v1.13.0): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  FALLO → " + f);
  process.exit(1);
}
