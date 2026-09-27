/**
 * validar.mjs — UNA ORDEN, UN VEREDICTO
 * =====================================
 * Corre todas las suites de pruebas del motor y dice si el proyecto está sano.
 * Nada de leer cuatro salidas a mano: si algo se rompe, sale aquí y sale con
 * nombre.
 *
 *     npm run validar
 *
 * Por qué existe: un proyecto que crece necesita poder comprobarse sin pensar.
 * Mientras validar sea un ritual de cuatro pasos, se dejará de hacer — y entonces
 * las pruebas dejan de proteger nada.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

/** Las suites y qué comprueba cada una. */
const SUITES = [
  { id: "planner", archivo: "tests/planner.test.ts", que: "grafo, dependencias, paralelismo, cancelación" },
  { id: "store", archivo: "tests/store.test.ts", que: "apagón a mitad, reparación, escritura atómica" },
  { id: "runner", archivo: "tests/runner.test.ts", que: "segundo plano y semáforo global" },
  { id: "roundtrip", archivo: "tests/roundtrip.test.ts", que: "ida y vuelta de formatos, pérdidas silenciosas" },
  { id: "export", archivo: "tests/export.test.ts", que: "exportar la app creada a Android: requisitos y suelo de API" },
  { id: "panel", archivo: "tests/panel.test.ts", que: "el intérprete de tareas del panel: avisa en vez de ignorar" },
  { id: "chatOrders", archivo: "tests/chatOrders.test.ts", que: "órdenes del chat → conversor → editor → preview" },
  { id: "guard", archivo: "tests/guard.test.ts", que: "el guardián de escritura: bloquea de verdad" },
  { id: "resiliencia", archivo: "tests/resiliencia.test.ts", que: "las lecciones convertidas en guardián" },
  { id: "imagen", archivo: "tests/imagen.test.ts", que: "imágenes gratis: cadena de proveedores, honestidad del modelo, cortacircuito" },
  { id: "reflejo", archivo: "tests/reflejo.test.ts", que: "el reflejo: frases con typos → órdenes válidas, calculadora sana, escalera de modelos" },
  { id: "agentico", archivo: "tests/agentico.test.ts", que: "cerebronico-agentico v1: las 40 entidades, el botón de dormidas y la tarea reflejo en el planificador" },
  { id: "espejos", archivo: "tests/espejos.test.ts", que: "ESPEJOS v1: los 10 agentes espejo, sus grupos con selector y el paralelo real" },
  { id: "forja", archivo: "tests/pluginForja.test.ts", que: "FORJA v1: receta→complemento compilado por el sistema, slot de lógica y puente del chat" },
  { id: "coreo", archivo: "tests/coreo.test.ts", que: "COREO v1: clasificador de la narración, anillo, vocabulario de movimiento y su hoja" },
  { id: "fondo", archivo: "tests/fondo.test.ts", que: "FONDO v1: aduana de fondos animados (tipos, tamaños, contención) y su hoja de velillos" },
  { id: "consejo", archivo: "tests/consejo.test.ts", que: "CONSEJO v1: agrupar el consejo, dormir/despertar y la línea honesta del registro" },
  { id: "pugil", archivo: "tests/ollamaPugil.test.ts", que: "PUGIL v1: embedders vs chat models — el 400 de Ollama explicado antes de gastarlo" },
  { id: "tregua", archivo: "tests/sandboxTregua.test.ts", que: "TREGUA v1: el sandbox y el chat comparten lazo — cesión, pausa y aviso" },
  { id: "quirofano", archivo: "tests/quirofano.test.ts", que: "QUIRÓFANO v1: cirugía sobre apps que YA funcionan — amputación, API perdida, truncado, reversión" },
  { id: "aspecto", archivo: "tests/aspecto.test.ts", que: "ASPECTO v1: la hoja determinista de texto por sección y su inventario vivo" },
  { id: "aspectoV8", archivo: "tests/aspectoV8.test.ts", que: "ASPECTO V8: el regulador de tamaño de verdad — !important, cn-regulable, sin fugas ZORD, --cn-font-size cableado" },
  { id: "plugins", archivo: "scripts/validar-plugins.mts", que: "PLUGINS v1: los 10 complementos cn.* — manifest oficial del IDE, handlers, slash y protocolo del puente" },
  { id: "espejosPers", archivo: "tests/espejos-personalizados.test.ts", que: "ESPEJOS PERSONALIZADOS (Reflejo v3.0 paso 2): pool de espejos .mjs, manifiestos y recarga en caliente" },
  { id: "aduana", archivo: "tests/sandboxCompat.test.ts", que: "ADUANA v2: el sandbox reconoce python/rust/go/java/docker/make… y la entrada tolera todo salvo binarios" },
  { id: "boveda", archivo: "tests/boveda.test.ts", que: "BÓVEDA v1: el transporte de la imagen al disco real con carpetas indexadas e INDICE.json" },
  { id: "reflejo5", archivo: "tests/reflejo5.test.ts", que: "REFLEJO v5: salud de la flota, confianza del enrutado y leyes aprendidas que sobreviven el reinicio" },
  { id: "imagen5", archivo: "tests/imagen-v5.test.ts", que: "IMAGEN v5: el reintento prometido y no hecho — congestión, 4xx, cancelación y vuelta a Gemini" },
  { id: "grupo", archivo: "tests/grupo.test.ts", que: "GRUPO v1: equipo por tarea, carril cpu para espejos, despacho cpu-primero y reflejo autónomo por ley" },
  // v8.0.1 — La suite de espejosServidor existía en disco y NO estaba aquí: la
  // comprobación «ninguna suite de pruebas puede quedar huérfana» de
  // `resiliencia.test.ts` la cazó (1 fallo de 1.641). Una prueba que nadie
  // ejecuta no cubre nada, y además hacía rojo el veredicto global.
  { id: "espejosServidor", archivo: "tests/espejosServidor.test.ts", que: "ESPEJOS POR SERVIDOR DE DATOS: catálogo, enrutador, respaldos y router FastAPI" },
  { id: "formato", archivo: "tests/formato.test.ts", que: "ENTREGA v8.0.1: la aduana de metadatos de cierre y el prompt que ya no pide el acta" },
  { id: "motorDatos", archivo: "tests/motor-datos.test.ts", que: "ENTREGA v8.0.1: fuente única de versión, alias de modelos renombrados y pack de código de la base del motor" },
  { id: "contenedor", archivo: "tests/contenedor.test.ts", que: "CONTENEDOR GENERAL v8.0.2: firma mágica, rutas con pérdidas declaradas, proveedores de vídeo sin fuente inventada y recetas de ffmpeg" },
  { id: "interfaz", archivo: "tests/interfaz.test.ts", que: "INTERFAZ v8.0.3: miniatura real del adjunto, cola de «cargando» y el editor web que arranca su propio sandbox" },
  { id: "consolaVoz", archivo: "tests/consola-voz.test.ts", que: "v8.0.4: aduana del comando que entra a la consola y elección de la voz del navegador" },
  { id: "arbol", archivo: "tests/arbol.test.ts", que: "v8.0.6: qué entra al árbol y qué no — secretos, artefactos, efímeros y la pregunta obligatoria" },
  { id: "espejo", archivo: "tests/espejo.test.ts", que: "v8.0.7: el espejo del proyecto — plantilla de archivos por tipo y cotejo de lo que falta" },
  { id: "motorEstructura", archivo: "tests/motor-estructura.test.ts", que: "MOTOR Y ESTABILIDAD v0.9.1: conocimiento de la estructura del motor, guardas globales, middleware de error y guardado atómico del kb" },
  { id: "botones", archivo: "tests/botones.test.ts", que: "BOTONES v1.0.0: auditoría de manejadores vacíos, nulos o con nombre inexistente, y el inventario del aspecto que ya no puede pasar sin escanear" },
  { id: "puente", archivo: "tests/puente.test.ts", que: "PUENTE IA CN v1.1.0: bufer circular con politica de desborde, medicion real de TTFT y plan de dependencias que nunca instala solo" },
  { id: "pantallaCompleta", archivo: "tests/pantallaCompleta.test.ts", que: "v1.6.6: pantalla completa en un solo sitio — los cuatro nombres de la API, decision segun el navegador y fallos que se cuentan en vez de tragarse" },
  { id: "inferenceBuffer", archivo: "tests/inferenceBuffer.test.ts", que: "v1.6.6: el bufer de inferencia — cascada de recuperacion, estados success/incomplete/error_recovered, timestamp y validStream" },
  { id: "inferenceBufferPayloads", archivo: "tests/inferenceBufferPayloads.test.ts", que: "v1.6.6: el bufer contra 39 payloads reales — cada forma con el texto que DEBE salir, y ninguna inventando mensaje donde no lo hay" },
   { id: "aspectoSpecificidad", archivo: "tests/aspectoSpecificidad.test.ts", que: "v1.6.6: regresion del «solo anda el general» — se calculan y comparan especificidades CSS, que es lo que decidia el fallo" },
   { id: "escalaTipografica", archivo: "tests/escalaTipografica.test.ts", que: "v1.6.15: jerarquia por construccion (hero>title>sub>body>label>meta), orden de fuente frente a los overrides de Tailwind, ventanas a >=90vw/90vh y modales con medida estandar" },
   { id: "esperaNube", archivo: "tests/esperaNube.test.ts", que: "v1.6.16: la «eternidad» de los modelos cloud — techo de primer byte, ninguna salida a internet sin cubrir, Gemini con abortSignal, y el suelo del selector de tamano" },
   { id: "modelosYArranque", archivo: "tests/modelosYArranque.test.ts", que: "v1.6.17: cadena de Gemini sin modelos apagados y alias reconocidos, fecha del sistema en el prompt, manejador de puerto ocupado, y la valla anidada probada de verdad contra el bufer" },
   { id: "dependenciasProyecto", archivo: "tests/dependenciasProyecto.test.ts", que: "v1.6.7: paquetes que el proyecto importa y nadie declaro — el jspdf que dejaba el sandbox arrancado pero en blanco" },
  { id: "fondoPeso", archivo: "tests/fondoPeso.test.ts", que: "v1.6.8: el peso del fondo avisa en vez de bloquear — el gif de 6 MB que antes se rechazaba con el limite de 4 MB" },
  { id: "viaRapidaPreview", archivo: "tests/viaRapidaPreview.test.ts", que: "v1.6.9: previsualizar sin instalar ni arrancar el servidor del proyecto — la invariante de que fuera de npm-dev nunca se instala" },
  { id: "raizDatos", archivo: "tests/raizDatos.test.ts", que: "v1.6.10: raiz de datos en C:\\Cerebronico — cuando se migra y, sobre todo, cuando NO se toca la boveda de claves" },
  { id: "bloquesMarkdown", archivo: "tests/bloquesMarkdown.test.ts", que: "v1.6.11: las vallas no se comen el mensaje — un documento se lee entero y el codigo se calla sin anunciarlo" },
   { id: "proyectoFuncional", archivo: "tests/proyectoFuncional.test.ts", que: "v1.6.12: que la app se vea — la evidencia web manda sobre un marcador suelto, y el package.json olvidado se genera" },
   { id: "memoriaUnica", archivo: "tests/memoriaUnica.test.ts", que: "v1.6.22: la memoria viaja UNA sola vez — sin doble copia en hiddenFiles y sin rótulo de archivo oculto que invite a recitarlo" },
   { id: "providerRouting", archivo: "tests/providerRouting.test.ts", que: "v1.6.22: local primero — un modelo instalado en Ollama es local aunque su nombre suene a nube (glm-ocr:latest ya no va a Z.ai)" },
    { id: "sandboxRaizAnidada", archivo: "tests/sandboxRaizAnidada.test.ts", que: "v1.6.22: el sandbox resuelve la raíz del proyecto anidado — npm install corre donde está el package.json, no en la raíz de datos" },
    { id: "estadoRescate", archivo: "tests/estadoRescate.test.ts", que: "v1.6.23: RESCATE — «Borrar todo» mudá primero el estado de CerebroNico (.cerebro-db, .cerebronico, MEMORIA/skills), aborta si el rescate falla, y re-siembra espejos y conocimiento tras el vaciado" },
    { id: "espejoSync", archivo: "tests/espejoSync.test.ts", que: "v1.6.31: ESPEJO-SYNC — manifiesto de propiedad (.cn-sync), retiro de restos y GUARDA-SERVIDOR-EJEC para que npm run dev no muera por timeout" },
  { id: "metricas", archivo: "tests/metricasInferencia.test.ts", que: "v1.6.32 · D8: la métrica real de inferencia — eval_count leído del done de Ollama, ns→ms, basura descartada y el len/4 cerrado solo con medida" },
  { id: "guardProfundo", archivo: "tests/syntaxGuardProfundo.test.ts", que: "v1.6.32 · CALIDAD: el parser real (esbuild) bloquea el truncado sin encarcelar genéricos ni JSX, y si falla él avisa en vez de encerrar" },
  { id: "quirfanoPuertas", archivo: "tests/quirfanoPuertas.test.ts", que: "v1.6.32 · SEGURIDAD: revisar y deshacer del Quirófano — dos puertas mutantes que ya no están abiertas" },
  { id: "consejoVotacion", archivo: "tests/consejoVotacion.test.ts", que: "v1.6.33 · D7: el consejo vota de verdad — las 22 acciones con dueño declarado, 10 asientos con voz y los no-votantes confesados" },
  { id: "catalogoHonesto", archivo: "tests/catalogoHonesto.test.ts", que: "v1.6.33 · CATÁLOGO: cada capacidad activa apunta a código real; el SKILLS.md del prompt separa verificado de mapa y deja de prometer 100" },
  { id: "seguridadPu", archivo: "tests/seguridadPuente.test.ts", que: "v1.7.0 · SEGURIDAD: el puente sin shell, raíces permitidas, origen exigido y guard fail-closed — comprobado sobre el código y sobre el puente real" },
  { id: "voz", archivo: "tests/voz.test.ts", que: "v1.8.0 · VOZ: certeza del propio trabajo (ejecutado / leído / sin verificar), una frase por artefacto con qué es y para qué sirve, y la facultad de hablar sin que pregunten con sus 4 reglas" },
  { id: "persistenc", archivo: "tests/persistencia.test.ts", que: "v1.9.0 · ESTABILIDAD: el workspace NO se pierde al pasar de 5 MB (rescate al almacén grande, recuperación al arrancar) y todo fallo de guardado se cuenta — con almacén e IndexedDB simulados, ejecutando el código real" },
  { id: "superficie", archivo: "tests/superficieRutas.test.ts", que: "v1.10.0 · FASE 2: el contrato de las 127 rutas — ninguna se pierde, ningún guard se afloja y server.ts no crece (trinquete), con dos lectores independientes y la herramienta ejecutada en seco" },
  { id: "estado", archivo: "tests/estado.test.ts", que: "v1.12.0 · FASE 2: el ESTADO extraído (caché de telemetría y muestra de CPU) — caducidad y cálculo probados con el tiempo inyectado, sin esperar diez segundos; y el monolito ya no declara esas variables" },
   { id: "ttsErrores", archivo: "tests/ttsErrores.test.ts", que: "v1.13.0 · VOZ: el error de Gemini se traduce a una frase (nada de JSON en la interfaz), el detalle va al registro, y con cuota agotada o clave inválida NO se insiste — se usa la voz del navegador sin repetir el cartel" },
   { id: "certezaModelo", archivo: "tests/certezaModelo.test.ts", que: "v1.14.0 · CERTEZA: el texto que escribe el MODELO pasa por el revisor — «funciona» sin ejecución se reescribe y se marca en el texto, los bloques de código se respetan y la explicación se dice una vez" },
    { id: "redimensionPantalla", archivo: "tests/redimensionPantalla.test.ts", que: "v1.15.0 · REDIMENSIONES: fuente única de los umbrales de ancho/altura — escala de raíz, modo de ventana, modal estándar y margen táctil, con index.css vigilado para que no diverja" },
    { id: "autocorrector", archivo: "tests/autocorrector.test.ts", que: "v1.16.0 · F1: el composer se corrige solo — acentos/ñ, exclusión por token, auto vs sugerir, idempotencia" },
    { id: "bucleAutonomo", archivo: "tests/bucleAutonomo.test.ts", que: "v1.16.0 · el bucle de herramientas no se detiene a mitad: plan abierto / permiso pedido / frase cortada / intención sin ejecutar siguen solos, un fallo manda a desviarse, el techo de pasos crece con el plan y el cierre dice qué falta en vez de mentir «Completado»" },
];

// ════════════════════════════════════════════════════════════════════════════
// v1.7.0 · DESCUBRIMIENTO DINÁMICO — QUE NINGUNA SUITE PUEDA QUEDARSE FUERA
// ----------------------------------------------------------------------------
// La lista de arriba es el CATÁLOGO (y sus descripciones, que son útiles). Pero
// un catálogo escrito a mano tiene un fallo estructural: una suite nueva que
// nadie registre NO SE EJECUTA, y el veredicto sigue saliendo verde. Eso ya pasó
// en este proyecto (la nota de espejosServidor en la lista lo cuenta: una prueba
// que existía en disco no corría, y la cazó otra suite).
//
// Ahora el disco manda y el catálogo solo describe:
//   · Toda suite en disco SE EJECUTA, esté declarada o no.
//   · Una suite declarada cuyo fichero YA NO EXISTE es un rojo: alguien la borró
//     o la renombró y el catálogo estaba tapando el hueco.
// Así la puerta no puede mentir ni por olvido ni por borrado.
// ════════════════════════════════════════════════════════════════════════════
function descubrirSuites() {
  const encontradas = [];
  for (const [dir, patron] of [
    ["tests", /\.test\.tsx?$/],
    ["scripts", /^validar-.*\.mts?$/],
  ]) {
    try {
      for (const nombre of readdirSync(path.join(RAIZ, dir))) {
        if (patron.test(nombre)) encontradas.push(`${dir}/${nombre}`);
      }
    } catch {
      // Directorio ausente: no es un fallo de la puerta, es un hecho del árbol.
    }
  }
  return encontradas.sort();
}

const declaradas = new Map(SUITES.map((s) => [s.archivo, s]));
const descubiertas = descubrirSuites();
/** Están en disco y NO en el catálogo: corren igual, con ficha de emergencia. */
const noDeclaradas = descubiertas.filter((a) => !declaradas.has(a));
/** Están en el catálogo y NO en disco: alguien las borró o renombró. */
const desaparecidas = SUITES.filter((s) => !descubiertas.includes(s.archivo));

const PLAN = [
  ...SUITES.filter((s) => descubiertas.includes(s.archivo)),
  ...noDeclaradas.map((archivo) => ({
    id: path.basename(archivo).replace(/\.test\.tsx?$/, "").replace(/^validar-/, "").slice(0, 11),
    archivo,
    que: "suite encontrada en disco (no estaba en el catálogo)",
  })),
];

const VERDE = "\x1b[32m";
const ROJO = "\x1b[31m";
const GRIS = "\x1b[90m";
const AMARILLO = "\x1b[33m";
const FIN = "\x1b[0m";

/** Localiza el CLI de tsx sin depender de `npx` (que en Windows cambia cosas). */
function cliDeTsx() {
  const candidatos = [
    path.join(RAIZ, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(RAIZ, "node_modules", ".bin", "tsx"),
  ];
  return candidatos.find((c) => existsSync(c)) || null;
}

/**
 * Localiza el compilador de TypeScript.
 *
 * `node_modules/.bin/tsc` es un script de shell y no se puede lanzar con `node`,
 * así que se apunta al fichero JavaScript de verdad.
 */
function cliDeTsc() {
  const candidatos = [
    path.join(RAIZ, "node_modules", "typescript", "bin", "tsc"),
    path.join(RAIZ, "node_modules", "typescript", "lib", "tsc.js"),
  ];
  return candidatos.find((c) => existsSync(c)) || null;
}

function limpiar(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function correr(cli, suite) {
  const r = spawnSync(process.execPath, [cli, path.join(RAIZ, suite.archivo)], {
    cwd: RAIZ,
    encoding: "utf-8",
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  const salida = limpiar(`${r.stdout || ""}\n${r.stderr || ""}`);
  return { salida, code: r.status === null ? 1 : r.status };
}

function extraer(salida, suites) {
  if (suites === "roundtrip") {
    const perfectas = Number((salida.match(/(\d+)\s+perfectas/) || [])[1] || 0);
    const silenciosas = Number((salida.match(/(\d+)\s+SILENCIOSAS/) || [])[1] || 0);
    return { ok: perfectas, mal: silenciosas };
  }
  const ok = Number((salida.match(/(\d+)\s+correctas/) || [])[1] || 0);
  const mal = Number((salida.match(/(\d+)\s+fallidas/) || [])[1] || 0);

  // v8.0.1 — HAY SUITES QUE INFORMAN CON MARCAS, NO CON RECUENTO.
  // `tests/espejosServidor.test.ts` imprime «✓ nombre» por comprobación y
  // «✓ TODO EN VERDE» al final, sin la palabra «correctas». Este parser sólo
  // entendía un formato, así que la daba por «NO llegó a ejecutarse» aunque
  // terminara en verde y con código de salida 0.
  //
  // Eso es exactamente la clase de mentira que esta herramienta existe para
  // evitar: presentar un fallo que no existe. Un guardián que confunde «no
  // arrancó» con «arrancó y no usa mi formato» deja de ser creíble en las dos
  // direcciones. Se cuentan las marcas SOLO cuando no hay recuento explícito,
  // para no inflar a las suites que sí lo traen.
  // v1.7.0 — VEREDICTO Y MARCAS, SIN QUE NINGUNA LECTURA TAPE A LA OTRA
  //
  // Lo que había: si la suite traía recuento, las marcas se IGNORABAN en
  // silencio.
  //
  // Aquí probé primero «gana el caso peor» (mal = max(mal, marcas ✗))… y saltó
  // un FALSO ROJO en `planner` en la primera pasada. Esa suite IMPRIME una línea
  // «✗ #2 revienta [fallida · io]» como CONTENIDO: es el estado de una tarea que
  // el propio test hace fallar a propósito, no una comprobación fallida. Su
  // veredicto real es «64 correctas · 0 fallidas» y su código de salida es 0.
  // Un parser que no distingue eso convierte el contenido de un test en un fallo
  // del proyecto — y un guardián que grita en falso se acaba ignorando.
  //
  // La regla que sí sostiene este proyecto, comprobada en las 62 suites:
  //   · Manda el VEREDICTO de la suite y su CÓDIGO DE SALIDA. Las 62 hacen
  //     `process.exitCode = 1` al fallar, así que una roja real no puede
  //     escaparse por el camino del recuento.
  //   · Las marcas ✗ NO se ignoran: si el veredicto dice 0 fallos y hay marcas
  //     ✗, se cuentan y se AVISAN en voz alta al final. Ni falso rojo por
  //     contenido, ni silencio por contador.
  const verdes = (salida.match(/^\s*✓/gm) || []).length;
  const rojas = (salida.match(/^\s*✗/gm) || []).length;
  if (rojas > 0 && mal === 0) marcasSueltas.push({ suite: suites, marcas: rojas });

  return { ok: Math.max(ok, verdes), mal };
}

// ─── Ejecución ──────────────────────────────────────────────────────────────

console.log("═".repeat(74));
console.log("  VALIDACIÓN DEL PROYECTO · CerebroNico IDE");
console.log("═".repeat(74));

const cli = cliDeTsx();
if (!cli) {
  console.log(`${ROJO}  No encuentro tsx en node_modules.${FIN}`);
  console.log(`  Las pruebas necesitan las dependencias instaladas:`);
  console.log(`      npm install`);
  process.exit(1);
}

let totalOk = 0;
let totalMal = 0;
/** Suites que no llegaron a ejecutarse (import roto, fichero que no está). */
let suitesEnRojo = 0;
const fallos = [];
/** Suites verdes que imprimen marcas ✗ no contabilizadas: se avisa, no se falla. */
const marcasSueltas = [];

// ════════════════════════════════════════════════════════════════════════════
// PUERTA 1 · EL COMPROBADOR DE TIPOS (v2.1)
// ----------------------------------------------------------------------------
// POR QUÉ ESTÁ AQUÍ Y NO SÓLO EN `npm run lint`
// ---------------------------------------------
// El 19-sep-2026 `npm run lint` fallaba con 25 errores, y SIETE de ellos no eran
// ruido de tipos: eran funciones escritas, ejecutadas y muertas — un `tokenize`
// sin importar, un filtro por un campo que no existía, un diagnóstico que decía
// cero siempre. Llevaban ahí sin que nadie los viera, y aparecieron sólo porque
// alguien pasó `tsc` a mano.
//
// La causa de fondo: `validar` es la orden que se ejecuta de verdad, y NO miraba
// los tipos. Una puerta que hay que acordarse de abrir no es una puerta.
//
// Si no está el compilador, NO se salta en silencio: se para, igual que con tsx.
// ════════════════════════════════════════════════════════════════════════════
let erroresTipos = 0;
{
  const cliTsc = cliDeTsc();
  if (!cliTsc) {
    console.log(`${ROJO}  No encuentro el compilador de TypeScript en node_modules.${FIN}`);
    console.log(`  Sin él no se puede dar el veredicto: faltan las dependencias.`);
    console.log(`      npm install`);
    process.exit(1);
  }
  process.stdout.write(`  ${"tipos".padEnd(11)} ${GRIS}el comprobador de TypeScript (tsc --noEmit)${FIN} … `);
  const r = spawnSync(process.execPath, [cliTsc, "--noEmit"], { cwd: RAIZ, encoding: "utf-8" });
  const salida = limpiar(`${r.stdout || ""}\n${r.stderr || ""}`);
  const lista = salida.split("\n").filter((l) => /error TS/.test(l));
  erroresTipos = lista.length;
  if (erroresTipos === 0) {
    console.log(`${VERDE}0 errores${FIN}`);
  } else {
    console.log(`${ROJO}${erroresTipos} ERRORES${FIN}`);
    const pistas = lista.slice(0, 8).map((l) => l.trim());
    fallos.push({ suite: "tipos", archivo: "npm run lint", pistas, salida });
  }
}

if (noDeclaradas.length > 0) {
  console.log(`  ${AMARILLO}${noDeclaradas.length} suite(s) en disco fuera del catálogo — se ejecutan igual:${FIN}`);
  for (const a of noDeclaradas) console.log(`    ${GRIS}+ ${a}${FIN}`);
}
if (desaparecidas.length > 0) {
  console.log(`  ${ROJO}${desaparecidas.length} suite(s) del catálogo NO están en disco:${FIN}`);
  for (const s of desaparecidas) console.log(`    ${ROJO}- ${s.archivo}${FIN}`);
}
if (noDeclaradas.length > 0 || desaparecidas.length > 0) console.log("─".repeat(74));

for (const suite of PLAN) {
  process.stdout.write(`  ${suite.id.padEnd(11)} ${GRIS}${suite.que}${FIN} … `);
  const { salida, code } = correr(cli, suite);
  const { ok, mal } = extraer(salida, suite.id);
  totalOk += ok;
  totalMal += mal;

  if (code === 0 && mal === 0 && ok > 0) {
    console.log(`${VERDE}${ok} correctas${FIN}`);
  } else {
    // v2.1 — AQUÍ HABÍA UN AGUJERO QUE DECÍA «TODO CORRECTO».
    // Si una suite REVIENTA (un import roto, un fichero renombrado o borrado), no
    // imprime «N correctas» ni «N fallidas», así que `mal` cuenta 0. El veredicto
    // miraba sólo `totalMal`, de modo que una suite que no llegaba a ejecutarse
    // dejaba el proyecto en VERDE con código de salida 0. Comprobado: una suite
    // fantasma imprimía «0 FALLOS» y el veredicto decía «TODO CORRECTO — 0 fallos».
    // El guardián del proyecto mentía, que es el peor sitio para mentir.
    // Ahora una suite que no corre se cuenta APARTE y tumba el veredicto.
    // Sólo cuenta como «no llegó a ejecutarse» la suite que no produjo NINGÚN
    // resultado (ni correctas ni fallidas): eso es un import roto o un fichero que
    // no está. Una suite que corre y falla ya se cuenta en `totalMal`, y contarla
    // dos veces infla el diagnóstico — un mensaje inexacto es la misma clase de
    // fallo que esta entrega persigue.
    const noArranco = ok === 0 && mal === 0;
    if (noArranco) suitesEnRojo += 1;
    console.log(`${ROJO}${mal} FALLOS${FIN} ${ok > 0 ? `(${ok} correctas)` : noArranco ? `${ROJO}(la suite NO llegó a ejecutarse)${FIN}` : ""}`);
    // Se guardan las líneas que explican el fallo, no toda la salida.
    const pistas = salida
      .split("\n")
      .filter((l) => /FALLO|PÉRDIDA SILENCIOSA|Error|Cannot find|·\s/.test(l) && l.trim().length > 0)
      .slice(0, 8);
    fallos.push({ suite: suite.id, pistas, salida, archivo: suite.archivo });
  }
}

console.log("─".repeat(74));

// El veredicto mira TRES cosas: tipos, comprobaciones fallidas y suites que no
// llegaron a correr. Las tres tienen que estar en verde para dar luz verde.
// v1.7.0 — la cuarta condición: una suite declarada que ya no está en disco es
// un rojo, no un silencio. Si el fichero desaparece, la puerta lo dice.
const todoBien =
  erroresTipos === 0 && totalMal === 0 && suitesEnRojo === 0 && desaparecidas.length === 0;

if (todoBien) {
  console.log(`  ${VERDE}VEREDICTO: TODO CORRECTO${FIN} — ${totalOk} comprobaciones, 0 fallos.`);
  console.log(`  ${GRIS}Tipos: 0 errores · ${PLAN.length} suites ejecutadas · ${suitesEnRojo} sin correr · ${desaparecidas.length} del catálogo ausentes.${FIN}`);
  if (marcasSueltas.length > 0) {
    // NADA SILENCIOSO: esto antes se perdía. No es un fallo (el veredicto y el
    // código de salida de esas suites están en verde), pero tiene que verse: si
    // una suite empieza a imprimir ✗ de verdad dejando su contador a cero, este
    // aviso es el rastro que lleva hasta ella.
    const total = marcasSueltas.reduce((n, m) => n + m.marcas, 0);
    console.log(`  ${AMARILLO}AVISO: ${total} marca(s) ✗ en ${marcasSueltas.length} suite(s) verde(s) — revisar que no sean fallos sin contabilizar:${FIN}`);
    for (const m of marcasSueltas) console.log(`    ${GRIS}${m.suite}: ${m.marcas} marca(s) ✗${FIN}`);
  }
  console.log(`  ${GRIS}El motor está sano: se puede seguir construyendo encima.${FIN}`);
} else {
  const partes = [];
  if (erroresTipos > 0) partes.push(`${erroresTipos} error(es) de tipos`);
  if (totalMal > 0) partes.push(`${totalMal} fallo(s) sobre ${totalOk + totalMal} comprobaciones`);
  if (suitesEnRojo > 0) partes.push(`${suitesEnRojo} suite(s) que NO llegaron a ejecutarse`);
  if (desaparecidas.length > 0) partes.push(`${desaparecidas.length} suite(s) del catálogo que YA NO están en disco`);
  console.log(`  ${ROJO}VEREDICTO: HAY FALLOS${FIN} — ${partes.join(" y ")}.`);
  for (const f of fallos) {
    console.log(`\n  ${ROJO}${f.suite}${FIN}`);
    for (const p of f.pistas) console.log(`    ${p.trim()}`);
    const donde = f.archivo || PLAN.find((s) => s.id === f.suite)?.archivo || "?";
    console.log(`    ${GRIS}(salida completa: npx tsx ${donde})${FIN}`);
  }
  console.log(`\n  ${AMARILLO}No se da nada por bueno mientras esto esté en rojo.${FIN}`);
}
console.log("═".repeat(74));

process.exitCode = todoBien ? 0 : 1;
