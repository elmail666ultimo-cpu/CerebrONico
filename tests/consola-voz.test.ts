/**
 * consola-voz.test.ts — ADUANA DEL COMANDO + ELECCIÓN DE VOZ (v8.0.4)
 * ====================================================================
 * Los dos defectos de esta entrega comparten una forma que conviene nombrar,
 * porque es la misma que ya apareció otras veces en este proyecto: **faltaba una
 * decisión y en su lugar había una suposición.**
 *
 *  · La consola suponía que lo que le llega es un comando. No lo era: era el
 *    texto de una llamada de herramienta, y se ejecutó.
 *  · La voz suponía que `getVoices()` ya tiene la lista y que el primero vale.
 *    Ninguna de las dos cosas es cierta, y el resultado era siempre eSpeak.
 *
 * Aquí se prueban las dos decisiones nuevas, con los casos que las rompen.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { normalizarComandoEntrante } from "../src/engine/comandoEntrante";
import { elegirMejorVoz, esVozRobotica, normalizarIdioma, puntuarVoz, hayVozEnIdioma, idiomaDeVozPreferido } from "../src/utils/voz";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ════════════════════════════════════════════════════════════════════════════
// 1 · LA ADUANA DEL COMANDO
// ════════════════════════════════════════════════════════════════════════════
console.log("\n1) Lo que entra a la consola se examina antes de ejecutarse\n");

// EL CASO EXACTO DEL USUARIO, con su salto de línea y su comilla final.
const casoReal = normalizarComandoEntrante('run_command command="cd .proyectos/mi-proyecto && npm start\n"');
comprobar("el caso real del usuario se desenvuelve", casoReal.envuelto === true, JSON.stringify(casoReal));
comprobar("...y el comando de dentro es el correcto", casoReal.comando === "cd .proyectos/mi-proyecto && npm start", casoReal.comando);
comprobar("...y se declara válido (la intención era inequívoca)", casoReal.valido === true);
comprobar("...y deja constancia de lo que hizo", casoReal.motivo.includes("desenvolvió"));

// Variantes del mismo envoltorio que se ven en respuestas reales.
comprobar("run_command: cmd", normalizarComandoEntrante("run_command: ls -la").comando === "ls -la");
comprobar("run_command cmd (sin command=)", normalizarComandoEntrante("run_command ls -la").comando === "ls -la");
comprobar("command=\"cmd\" suelto", normalizarComandoEntrante('command="npm test"').comando === "npm test");
comprobar("forma JSON {\"command\":\"..\"}", normalizarComandoEntrante('{"command":"npm run build"}').comando === "npm run build");
comprobar("pc_exec command=\"..\"", normalizarComandoEntrante('pc_exec command="dir"').comando === "dir");

// Envoltorio dentro de envoltorio: una sola pasada dejaría el interior sucio.
const anidado = normalizarComandoEntrante('run_command command="run_command command=\\"ls\\""');
comprobar("desenvuelve envoltorios anidados", anidado.comando === "ls", anidado.comando);
comprobar("...y no se queda a medias", anidado.valido === true);

// Un comando normal NO se toca. Es el caso mayoritario y no puede degradarse.
const normal = normalizarComandoEntrante("npm run build");
comprobar("un comando normal pasa intacto", normal.comando === "npm run build" && normal.envuelto === false);
const conCitas = normalizarComandoEntrante('git commit -m "arreglo del sandbox"');
comprobar("las comillas internas de un comando NO se comen", conCitas.comando === 'git commit -m "arreglo del sandbox"', conCitas.comando);
const eco = normalizarComandoEntrante("$ npm start");
comprobar("el eco «$ » de la consola se quita", eco.comando === "npm start");

// LO IMPORTANTE: lo que NO se entiende NO se ejecuta.
const ilegible = normalizarComandoEntrante('run_command path="x.ts" content="..."');
comprobar("una llamada de herramienta ilegible NO se ejecuta", ilegible.valido === false, JSON.stringify(ilegible));
// Se aceptan las dos redacciones legítimas: «llamada de herramienta» (no se
// supo desenvolver) y «parámetros de una herramienta» (se desenvolvió el nombre
// pero lo que queda son argumentos). Lo que se exige es que EXPLIQUE algo.
comprobar("...y explica por qué", /llamada de herramienta|parámetros de una herramienta/.test(ilegible.motivo), ilegible.motivo);
comprobar("...y no propone ejecutar nada", ilegible.comando === "");
comprobar("vacío no es válido", normalizarComandoEntrante("   ").valido === false);
comprobar("no-cadena no es válido", normalizarComandoEntrante(null).valido === false);
comprobar("un número no es válido", normalizarComandoEntrante(42).valido === false);

// El mensaje de rechazo debe ENSEÑAR el comando correcto, no solo prohibir.
comprobar("el rechazo sugiere la forma buena", normalizarComandoEntrante('run_command path="a"').motivo.includes("cd .proyectos/mi-proyecto && npm start"));

// ════════════════════════════════════════════════════════════════════════════
// 2 · LA ELECCIÓN DE VOZ
// ════════════════════════════════════════════════════════════════════════════
console.log("\n2) Se puntúan TODAS las voces, no se coge la primera\n");

// El caso que produce la queja: hay voces buenas, pero no son las primeras.
const vocesLinux = [
  { name: "espeak-ng", lang: "es-ES", localService: true, default: true },
  { name: "Google español", lang: "es-ES", localService: false },
  { name: "Microsoft Sabina", lang: "es-MX", localService: true },
];
const elegida = elegirMejorVoz(vocesLinux, "es-ES");
comprobar("con eSpeak primero, NO se elige eSpeak", elegida?.voz.name === "Google español", elegida?.voz.name);
comprobar("...y no se marca como robótica", elegida?.robotica === false);
comprobar("...y se dice qué voz se eligió", !!elegida?.motivo.includes("Google español"));

// Solo robóticas: hay que elegir una, pero HAY QUE DECIRLO.
const soloRoboticas = [
  { name: "espeak-ng", lang: "es-ES", localService: true },
  { name: "festival", lang: "es-ES", localService: true },
];
const rob = elegirMejorVoz(soloRoboticas, "es-ES");
comprobar("sin voces naturales se elige una robótica", rob?.voz.name === "espeak-ng");
comprobar("...pero se MARCA como robótica", rob?.robotica === true);
comprobar("...y el motivo lo dice sin adornos", !!rob?.motivo.includes("robótica"));

// Prioridad clave: el IDIOMA pesa más que la calidad.
// Una voz natural inglesa leyendo español se entiende PEOR que una robótica en español.
const mezcla = [
  { name: "Microsoft David Desktop", lang: "en-US", localService: true },
  { name: "espeak-ng", lang: "es-ES", localService: true },
];
const mixta = elegirMejorVoz(mezcla, "es-ES");
comprobar("idioma > calidad: gana la robótica en español", mixta?.voz.lang === "es-ES", mixta?.voz.name);
comprobar("...y se avisa de que es robótica", mixta?.robotica === true);

// Solo hay voz en otro idioma: se usa, pero se dice que leerá con acento.
const soloIngles = [{ name: "Google US English", lang: "en-US", localService: false }];
const otra = elegirMejorVoz(soloIngles, "es-ES");
comprobar("sin voz en español se coge la que hay", otra?.voz.lang === "en-US");
comprobar("...y se avisa del acento", !!otra?.motivo.includes("acento"));

// El caso del arranque: lista vacía. NO es un error, es un momento.
comprobar("lista vacía → null (no es error, es 'aún no')", elegirMejorVoz([], "es-ES") === null);
comprobar("lista nula → null", elegirMejorVoz(null as any, "es-ES") === null);
comprobar("voces sin nombre se ignoran", elegirMejorVoz([{ name: "", lang: "es-ES" }], "es-ES") === null);

// Detalles de puntuación, uno a uno.
comprobar("espeak-ng se reconoce como robótica", esVozRobotica("eSpeak NG") === true);
comprobar("Google español NO es robótica", esVozRobotica("Google español") === false);
comprobar("«es-ES» se normaliza a «es»", normalizarIdioma("es-ES") === "es");
comprobar("«es_MX» con guion bajo también", normalizarIdioma("es_MX") === "es");
comprobar("sin idioma, normalización vacía", normalizarIdioma(undefined) === "");
comprobar("una voz sin idioma se penaliza", puntuarVoz({ name: "X", lang: "" }, "es-ES") < puntuarVoz({ name: "X", lang: "es-ES" }, "es-ES"));
comprobar("las de nube puntúan más que las locales", puntuarVoz({ name: "Voz", lang: "es-ES", localService: false }, "es-ES") > puntuarVoz({ name: "Voz", lang: "es-ES", localService: true }, "es-ES"));
comprobar("«enhanced»/«premium» suman", puntuarVoz({ name: "Voz Premium", lang: "es-ES" }, "es-ES") > puntuarVoz({ name: "Voz", lang: "es-ES" }, "es-ES"));
comprobar("hayVozEnIdioma detecta el español", hayVozEnIdioma(vocesLinux, "es-ES") === true);
comprobar("hayVozEnIdioma no miente con el japonés", hayVozEnIdioma(vocesLinux, "ja-JP") === false);
comprobar("«es» sin región se convierte en es-ES", idiomaDeVozPreferido("es") === "es-ES");

// ════════════════════════════════════════════════════════════════════════════
// 3 · EL CABLEADO DE LAS DOS PUERTAS
// ════════════════════════════════════════════════════════════════════════════
console.log("\n3) Las dos puertas que ejecutan pasan por la aduana\n");

const srv = leer("server.ts");
comprobar("la herramienta run_command pasa por la aduana", /case "run_command": \{[\s\S]{0,700}normalizarComandoEntrante\(args\?\.command\)/.test(srv));
comprobar("...y se niega a ejecutar si no es válido", /if \(!norm\.valido\) return JSON\.stringify\(\{ ok: false, error: norm\.motivo \}\)/.test(srv));
comprobar("...y ejecuta el comando DESENVUELTO, no el crudo", /await runCommand\(norm\.comando, PROJECT_ROOT, 120000\)/.test(srv));
comprobar("run_tests también pasa por la aduana", /case "run_tests": \{[\s\S]{0,400}normalizarComandoEntrante\(crudo\)/.test(srv));
comprobar("el endpoint de la consola pasa por la aduana", /app\.post\("\/api\/exec"[\s\S]{0,1200}normalizarComandoEntrante\(command\)/.test(srv));
comprobar("...y rechaza sin ejecutar nada", /if \(!norm\.valido\) \{[\s\S]{0,320}exitCode: 1/.test(srv));
comprobar("...y ya no hay ninguna llamada a exec con la cadena cruda", !/await runCommand\(command, workDir/.test(srv));
comprobar("la respuesta dice qué comando se ejecutó de verdad", /comandoEjecutado: norm\.comando/.test(srv));

const chat = leer("src/components/ChatCenter.tsx");
comprobar("las voces se cachean y se escucha `voiceschanged`", /addEventListener\("voiceschanged", cargar\)/.test(chat));
comprobar("...y se quita el listener al desmontar", /removeEventListener\("voiceschanged", cargar\)/.test(chat));
comprobar("la elección usa el módulo puro", /elegirMejorVoz\(lista, preferido\)/.test(chat));
comprobar("ya NO queda el `find` apresurado de antes", !/voices\.find\(\(v\) => v\.lang && v\.lang\.toLowerCase\(\)\.startsWith\("es"\)\)/.test(chat));
// v1.13.0 — el aviso ya no se monta a mano aquí: lo compone `voz.ts` (frase corta,
// sin JSON). La intención de la comprobación no cambia: el fallo NO se traga.
comprobar("el fallo de Gemini TTS ya no se traga", /setTtsAviso\(avisoDeVozNoDisponible\(voice, motivo\)\)/.test(chat));
comprobar("...y recoge el motivo del servidor", /data\?\.motivo \|\| data\?\.error/.test(chat));
comprobar("el aviso se limpia en cada intento", /setTtsAviso\(null\)/.test(chat));
comprobar("el aviso se pinta y se puede cerrar", /ttsAviso && \(/.test(chat) && /setTtsAviso\(null\)\}/.test(chat));
comprobar("la voz robótica avisa en vez de disimular", /if \(elegida\.robotica\) setTtsAviso\(elegida\.motivo\)/.test(chat));

// El defecto del log: el mensaje que desviaba al modelo hacia package.json.
const rsl = leer("src/components/RightSidebar.tsx");
comprobar("el piloto automático ya NO dice «No se encontró package.json»", !/sbLog\("AUTO · ❌ No se encontró package\.json/.test(rsl));
comprobar("...y ya no le ordena al modelo crear un package.json", !/asegúrate de que tu workspace tenga un package\.json/.test(rsl));
comprobar("ahora dice DÓNDE ha buscado", /Buscado en: \$\{donde\}/.test(rsl));
comprobar("...y QUÉ había en la raíz", /contenido\.join\(", "\)/.test(rsl));
comprobar("...y qué marcadores sirven de verdad", /una web con index\.html \(no necesita npm\)/.test(rsl));
comprobar("el SYNC informa de la ruta ABSOLUTA", /escrito\(s\) en \$\{raizAbs\}/.test(rsl));
comprobar("...y de dónde se reconoció el proyecto", /Proyecto reconocido en: \$\{raizProy\}/.test(rsl));

// ════════════════════════════════════════════════════════════════════════════
// 4 · EL PROYECTO DUPLICADO (v8.0.5)
// ════════════════════════════════════════════════════════════════════════════
console.log("\n4) Si hay dos proyectos, se dice — aunque «funcione»\n");

comprobar("el servidor detecta el proyecto duplicado", /avisoProyectoDuplicado/.test(srv));
comprobar("...y nombra las dos rutas", /package\.json en la raíz del sandbox \(\$\{PROJECT_ROOT\}\) y ADEMÁS una web en/.test(srv));
comprobar("...y explica cuál gana y qué no se verá", /arrancará el proyecto de la RAÍZ y la web anidada NO se verá/.test(srv));
comprobar("...y ofrece las dos salidas posibles", /sube la web a la raíz y borra la subcarpeta/.test(srv) && /quita el package\.json de la raíz/.test(srv));
comprobar("el aviso se dispara con proyecto en la raíz, no solo al fallar", /if \(fs\.existsSync\(path\.join\(PROJECT_ROOT, "package\.json"\)\)\) \{[\s\S]{0,3000}avisoProyectoDuplicado/.test(srv));
comprobar("la interfaz lo pinta aunque hasProject sea true", /const duplicado = \(st as any\)\?\.avisoProyectoDuplicado;\s*if \(duplicado\) sbLog/.test(rsl));

comprobar("el servidor detecta un index.html que NO es HTML", /NO contiene HTML/.test(srv));
comprobar("...y muestra el contenido real del archivo", /Contenido real del archivo/.test(srv));
comprobar("...y avisa de que se renderiza como pagina vacia", /se renderiza como pagina vacia/.test(srv));
comprobar("...con las barras invertidas escapadas para la plantilla", /pareceHtml = \/<\\\\s\*/.test(srv));

console.log(`\n═══ CONSOLA Y VOZ (v8.0.5): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
