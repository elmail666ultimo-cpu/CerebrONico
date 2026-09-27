/**
 * estado.test.ts — EL ESTADO EXTRAÍDO, PROBADO (Fase 2, v1.12.0)
 * =============================================================
 * QUÉ ES: la suite de los dos primeros módulos de estado del servidor
 * (`server/estado/telemetria.ts` y `server/estado/proceso.ts`).
 * PARA QUÉ SIRVE: para probar lo que antes era imposible probar. Mientras la
 * caché de telemetría y el contador de CPU vivían como variables sueltas dentro
 * del monolito, no había forma de comprobar su caducidad sin levantar el servidor
 * y esperar diez segundos de reloj. Ahora el tiempo entra por parámetro y la
 * caducidad se prueba con números exactos, en milisegundos de ejecución.
 *
 * ESO ES LO QUE SE GANA AL EXTRAER ESTADO, Y ES MÁS QUE ORDEN
 * «Extraer estado» suena a limpieza. No es limpieza: es lo que separa un dato que
 * se puede probar de un dato que solo se puede creer. Este fichero es la prueba
 * de que el cambio valió la pena.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  muestraVigente,
  guardarMuestra,
  invalidarMuestra,
  muestraCruda,
  TELEMETRY_CACHE_MS,
  TELEMETRY_PROBE_MS,
} from "../server/estado/telemetria";
import { porcentajeCpu, reiniciarMuestraProceso, muestraProceso } from "../server/estado/proceso";
import {
  registrarProceso,
  olvidarProceso,
  procesoActual,
  sandboxVivo,
  pidSandbox,
  matarProceso,
} from "../server/estado/sandbox";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

/**
 * CÓDIGO sin comentarios. Y esto no es un detalle: las dos primeras
 * comprobaciones de la sección 3 fallaron por mirar el texto crudo.
 *   · `telemetria.ts` EXPLICA en un comentario que no toca `sandboxProc`… y la
 *     comprobación de «no lo toca» encontraba la palabra en esa explicación.
 *   · `proceso.ts` menciona `Date.now()` en la prosa que justifica inyectar el
 *     tiempo… y la comprobación de «no lee el reloj a escondidas» la cazaba ahí.
 * Un comentario no puede conceder ni quitar seguridad, ni violar una regla. Se
 * ignora en ambos sentidos: el que explica Y el que esconde (comentar código malo
 * tampoco lo arregla).
 */
const sinComentarios = (s: string) =>
  s
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join("\n");

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle?: string) {
  if (condicion) correctas++;
  else fallos.push(`${titulo}${detalle ? " → " + detalle : ""}`);
}

// ═══ 1 · LA CACHÉ DE TELEMETRÍA ════════════════════════════════════════════
console.log("\n1) La caché de telemetría, con el tiempo inyectado\n");

invalidarMuestra();
comprobar("sin muestra, no hay nada vigente", muestraVigente(0) === null);
comprobar("y la muestra cruda también está vacía", muestraCruda() === null);

guardarMuestra({ port3000: true, port5000: false }, 1000);
comprobar("tras guardar, la muestra está vigente", muestraVigente(2000) !== null);
comprobar("★ devuelve exactamente lo guardado", JSON.stringify(muestraVigente(2000)) === '{"port3000":true,"port5000":false}');
comprobar("★ a los 9 s sigue vigente (dentro de los 10 s)", muestraVigente(1000 + 9000) !== null);
comprobar("★ a los 10 s justos ya ha caducado", muestraVigente(1000 + TELEMETRY_CACHE_MS) === null, String(TELEMETRY_CACHE_MS));
comprobar("★ y a los 11 s también", muestraVigente(1000 + 11000) === null);
comprobar("la muestra cruda conserva su instante", muestraCruda()?.timestamp === 1000);
comprobar("invalidar tira la caché (lo que hace /api/telemetry/refresh)", (invalidarMuestra(), muestraVigente(1000) === null));
comprobar("★ los tiempos son los documentados: 10 s de caché", TELEMETRY_CACHE_MS === 10000);
comprobar("★ y 35 s de sondeo (Ollama puede tardar 28 s cargando un modelo)", TELEMETRY_PROBE_MS === 35000);

guardarMuestra({ x: 1 }, 5000);
guardarMuestra({ x: 2 }, 6000);
comprobar("guardar de nuevo sustituye la muestra (no se acumulan)", JSON.stringify(muestraCruda()?.data) === '{"x":2}');

// ═══ 2 · LA MUESTRA DE CPU DEL PROCESO ═════════════════════════════════════
console.log("\n2) El porcentaje de CPU, con intervalo conocido\n");

reiniciarMuestraProceso();
comprobar("★ la primera llamada devuelve 0 (no hay con qué comparar)", porcentajeCpu(0) === 0);
comprobar("y deja muestra para la siguiente", muestraProceso() !== null);
const pct = porcentajeCpu(10);
comprobar("★ la segunda devuelve un número creíble", Number.isFinite(pct) && pct >= 0 && pct <= 100, String(pct));
comprobar("★ nunca puede salirse de 0..100 por mucho que se dispare", (() => {
  reiniciarMuestraProceso();
  porcentajeCpu(0);
  const p = porcentajeCpu(0.0001); // intervalo absurdamente corto: el tope debe aguantar
  return p >= 0 && p <= 100;
})());
reiniciarMuestraProceso();
comprobar("reiniciar olvida la muestra (útil en pruebas y diagnóstico)", muestraProceso() === null && porcentajeCpu(0) === 0);

// ═══ 3 · EL ESTADO YA NO VIVE EN EL MONOLITO ═══════════════════════════════
console.log("\n3) ★ El estado salió del monolito\n");

const servidor = leer("server.ts");
comprobar("★ ya no hay `let telemetryCache` en el monolito", !/let telemetryCache/.test(servidor));
comprobar("★ ni `let lastCpuTime`", !/let lastCpuTime/.test(servidor));
comprobar("★ ni una sola referencia a la variable vieja", !servidor.includes("telemetryCache"));
comprobar("el monolito usa la API del estado (invalidar al reiniciar el puente)", /invalidarMuestra\(\)/.test(servidor));
comprobar("el estado se registra desde el monolito", /registrarTelemetria\(app, \{/.test(servidor));
comprobar("★ y se registra DESPUÉS de declarar SANDBOX_PORT (el orden importa)", (() => {
  const iConst = servidor.indexOf("const SANDBOX_PORT");
  const iCall = servidor.indexOf("registrarTelemetria(app, {");
  return iConst > 0 && iCall > iConst;
})());

const routerTele = leer("server/routers/telemetria.ts");
const routerTeleCodigo = sinComentarios(routerTele);
comprobar("★ el router usa la API del estado, no variables", ["muestraVigente", "guardarMuestra", "invalidarMuestra", "porcentajeCpu"].every((f) => routerTeleCodigo.includes(f)));
comprobar("★ y NO toca sandboxProc en el código: pregunta por él", !routerTeleCodigo.includes("sandboxProc"), "lo menciona en comentarios (explicando que no lo toca) y eso no cuenta");
comprobar("★ declara lo que necesita del sandbox (especificación de la próxima extracción)", /sandboxVivo: \(\) => boolean/.test(routerTele) && /sandboxPid: \(\) => number \| null/.test(routerTele));
comprobar("las 3 rutas están en el módulo", (routerTele.match(/app\.(get|post)\("\/api\//g) || []).length === 3);

const teleFuente = leer("server/estado/telemetria.ts");
const procFuente = leer("server/estado/proceso.ts");
comprobar("★ el tiempo entra por parámetro (por eso se puede probar sin esperar)", /muestraVigente\(ahora: number = Date\.now\(\)\)/.test(teleFuente) && /porcentajeCpu\(ahora: number = Date\.now\(\)\)/.test(procFuente));
// En el CÓDIGO solo puede quedar el valor por defecto del parámetro.
const teleCodigo = sinComentarios(teleFuente);
const procCodigo = sinComentarios(procFuente);
// La regla, en vez del número: TODO `Date.now()` del código tiene que ser el valor
// por defecto de un parámetro. Así la comprobación no se rompe cuando alguien añada
// otra función con tiempo inyectado — que es justo lo que se quiere fomentar.
// (Mi primera versión fijaba «1 por fichero» y falló: `telemetria.ts` tiene DOS
// funciones con el tiempo inyectado, y eso es correcto: dos valores por defecto.)
const relojesEscondidos = (codigo: string) =>
  (codigo.match(/Date\.now\(\)/g) || []).length - (codigo.match(/= Date\.now\(\)/g) || []).length;
comprobar("★ ningún módulo de estado lee el reloj a escondidas",
  relojesEscondidos(teleCodigo) === 0 && relojesEscondidos(procCodigo) === 0,
  `lecturas fuera de un parámetro: telemetria ${relojesEscondidos(teleCodigo)} · proceso ${relojesEscondidos(procCodigo)}`);
comprobar("el estado de telemetría explica por qué los tiempos son generosos", /28 s|falso negativo/.test(teleFuente));
comprobar("esta suite entra en npm run validar", leer("scripts/validar.mjs").includes("estado.test.ts"));

// ═══ 4 · EL ESTADO DEL SANDBOX (v1.13.0) ═══════════════════════════════════
console.log("\n4) ★ El estado del sandbox, probado de verdad\n");

// Se ejecuta el módulo con un proceso de mentira: kill y on son lo que distingue a
// un proceso de cualquier otra cosa (y es justo lo que ahora se exige para registrar).
const falso = {
  pid: process.pid,
  kill: () => true,
  on: () => falso,
};

comprobar("sin registrar nada, no hay sandbox vivo", sandboxVivo() === false && pidSandbox() === null);
registrarProceso(falso);
comprobar("★ tras registrar, el sandbox está vivo (el pid es el nuestro)", sandboxVivo() === true);
comprobar("★ y su PID se puede consultar", pidSandbox() === process.pid);
comprobar("el proceso actual se puede obtener para engancharle streams", procesoActual() === falso);

// El anti-zombie: olvidar solo si es el mismo. Sin esto, un sandbox viejo que muere
// borraría la referencia del nuevo.
registrarProceso(falso);
olvidarProceso({ pid: 999999, kill: () => true, on: () => 0 } as never);
comprobar("★ olvidar con OTRO proceso no borra el registrado (anti-zombie)", procesoActual() === falso);
olvidarProceso(falso);
comprobar("★ olvidar con el MISMO proceso sí lo borra", procesoActual() === null && sandboxVivo() === false);

// El fallo latente que destapó el compilador: `spawnSandbox()` puede devolver una
// Response HTTP cuando falla al arrancar, y el monolito la guardaba como «el proceso».
registrarProceso(falso);
registrarProceso({ status: 500, json: () => ({}) } as never);
comprobar("★ una respuesta HTTP NO se registra como si fuera el proceso", procesoActual() === falso);

// Matar sin proceso no puede reventar (antes lanzaba y estaba capturado en silencio).
olvidarProceso();
comprobar("★ matar sin sandbox devuelve false y no lanza", matarProceso("SIGKILL") === false);

const sandboxFuente = leer("server/estado/sandbox.ts");
const servidorCodigo = sinComentarios(servidor);
comprobar("el módulo tiene la API completa", ["registrarProceso", "olvidarProceso", "procesoActual", "sandboxVivo", "pidSandbox", "matarProceso", "isPidAlive"].every((f) => sandboxFuente.includes(`export function ${f}`) || sandboxFuente.includes(`export const ${f}`)));
comprobar("★ el monolito ya NO declara la variable del sandbox", !servidorCodigo.includes("sandboxProc") && !/let sandboxProc/.test(servidorCodigo));
comprobar("★ ni la función local isPidAlive (vive en el módulo)", !/const isPidAlive = /.test(servidorCodigo));
comprobar("★ el monolito pasa por la API (registrar/olvidar/preguntar)", ["registrarProceso(", "olvidarProceso(", "sandboxVivo()", "pidSandbox()"].every((f) => servidorCodigo.includes(f)));
comprobar("★ el PID se lee una vez y se usa el mismo (no cambia entre llamadas)", /const pidSandboxActual = pidSandbox\(\)/.test(servidorCodigo));

// ═══ 5 · EL SANDBOX AL ARRANCAR NO ES UN FALLO (v1.13.0) ═══════════════════
console.log("\n5) ★ Al arrancar, el sandbox ya no sale en rojo\n");

const diag = leer("server/routers/diagnostico.ts");
const diagCodigo = sinComentarios(diag);
comprobar("el diagnóstico pregunta si hay sandbox arrancado", /sandboxVivo: \(\) => boolean/.test(diag) && diagCodigo.includes("deps.sandboxVivo()"));
comprobar("★ distingue «aún no arrancado» de «arrancado y no contesta»", /aún no arrancado \(se levanta al abrir el preview\)/.test(diag) && /Está arrancado pero no contesta/.test(diag));
comprobar("★ «aún no arrancado» NO cuenta como fallo (ok: true)", /ok: true,\s*\n\s*detail: "aún no arrancado/.test(diag));
comprobar("★ pero si está arrancado y no contesta, sí es rojo con su remedio", /Está arrancado pero no contesta: pulsa Sync/.test(diag));
comprobar("el puerto se pasa como dependencia (no se repite el número)", /sandboxPort: number/.test(diag) && /deps.sandboxPort/.test(diagCodigo));
comprobar("★ el registro va DESPUÉS de declarar SANDBOX_PORT (TDZ)", servidorCodigo.indexOf("registrarDiagnostico(app, {") > servidorCodigo.indexOf("const SANDBOX_PORT"));

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ ESTADO EXTRAÍDO (CN v1.13.0): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  FALLO → " + f);
  process.exit(1);
}
