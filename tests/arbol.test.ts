/**
 * arbol.test.ts — ADUANA DEL ÁRBOL Y DEL EMPAQUE (v8.0.6)
 * =======================================================
 * Petición del usuario, literal: «cuando se está trabajando el modelo debe de
 * preguntar qué se agrega al árbol y qué no, se cometen muchos errores, se suman
 * archivos que no van en el empaque».
 *
 * Lo que se verifica aquí es que la aduana distingue TRES cosas, no dos. Un
 * filtro de dos categorías (entra / no entra) falla en la dirección silenciosa:
 * decide por el usuario y no se lo dice. Y ése era el defecto de partida — el
 * empaquetador metía todo sin una sola exclusión, sin avisar a nadie.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { clasificarRuta, auditarArbol, puedeIrEnElEmpaque } from "../src/engine/aduanaArbol";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const v = (r: string) => clasificarRuta(r).veredicto;
const c = (r: string) => clasificarRuta(r).categoria;

// ════════════════════════════════════════════════════════════════════════════
// 1 · PROHIBIDO: lo que no entra ni con permiso
// ════════════════════════════════════════════════════════════════════════════
console.log("\n1) Lo que no entra NUNCA\n");

// Secretos. Es la categoría más importante: un paquete enviado ya no se puede
// desdecir, así que aquí no vale «preguntar».
comprobar(".env es prohibido", v(".env") === "prohibido");
comprobar(".env.local también", v(".env.local") === "prohibido");
comprobar(".env.production.local también", v("config/.env.production.local") === "prohibido");
comprobar("una clave .pem es prohibida", v("certs/server.pem") === "prohibido");
comprobar("una clave .key es prohibida", v("privada.key") === "prohibido");
comprobar("id_rsa es prohibido", v(".ssh/id_rsa") === "prohibido");
comprobar("credentials.json es prohibido", v("credentials.json") === "prohibido");
comprobar("service-account.json es prohibido", v("gcp/service-account.json") === "prohibido");
comprobar(".npmrc es prohibido", v(".npmrc") === "prohibido");
comprobar(".netrc es prohibido", v(".netrc") === "prohibido");
comprobar("terraform.tfstate es prohibido", v("infra/terraform.tfstate") === "prohibido");
comprobar("y la categoría es «secreto»", c(".env") === "secreto");
comprobar("el motivo explica que no se puede deshacer", /no se puede desdecir/i.test(clasificarRuta(".env").motivo));

// Artefactos: se regeneran instalando.
comprobar("node_modules es prohibido", v("node_modules/react/index.js") === "prohibido");
comprobar(".git es prohibido", v(".git/config") === "prohibido");
comprobar("dist es prohibido", v("dist/assets/app.js") === "prohibido");
comprobar("build es prohibido", v("build/index.js") === "prohibido");
comprobar("coverage es prohibido", v("coverage/lcov.info") === "prohibido");
comprobar("__pycache__ es prohibido", v("__pycache__/mod.cpython-311.pyc") === "prohibido");
comprobar(".venv es prohibido", v(".venv/lib/python3/site.py") === "prohibido");
comprobar("target (Rust) es prohibido", v("target/debug/app") === "prohibido");
comprobar("la categoría es «artefacto»", c("dist/a.js") === "artefacto");

// Efímeros: basura de una sesión.
comprobar("un .log es prohibido", v("debug.log") === "prohibido");
comprobar("un .tmp es prohibido", v("salida.tmp") === "prohibido");
comprobar("un .bak es prohibido", v("index.html.bak") === "prohibido");
comprobar(".DS_Store es prohibido", v(".DS_Store") === "prohibido");
comprobar("un .pid es prohibido", v("servidor.pid") === "prohibido");
comprobar("nohup.out es prohibido", v("nohup.out") === "prohibido");

// El espejo del sandbox: el error que el propio motor se fabricaba.
comprobar("el espejo .proyectos/ es prohibido", v(".proyectos/index.html") === "prohibido");
comprobar("...y también proyectos/", v("proyectos/index.html") === "prohibido");
comprobar("la categoría es «espejo»", c(".proyectos/a.js") === "espejo");
comprobar("el motivo dice que duplica el árbol", /duplica el árbol/i.test(clasificarRuta(".proyectos/index.html").motivo));

// Rutas que se salen del árbol.
comprobar("una ruta con «..» es prohibida", v("src/../../fuera.txt") === "prohibido");
comprobar("una ruta absoluta POSIX es prohibida", v("/etc/passwd") === "prohibido");
comprobar("una ruta absoluta Windows es prohibida", v("C:\\Windows\\system.ini") === "prohibido");
comprobar("una ruta vacía es prohibida", v("") === "prohibido");
comprobar("solo espacios es prohibido", v("   ") === "prohibido");

// ════════════════════════════════════════════════════════════════════════════
// 2 · INCLUIR: el proyecto, sin preguntar
// ════════════════════════════════════════════════════════════════════════════
console.log("\n2) El proyecto entra sin dar la lata\n");

comprobar("un .tsx es del proyecto", v("src/App.tsx") === "incluir");
comprobar("un .py es del proyecto", v("app/main.py") === "incluir");
comprobar("un .html es del proyecto", v("index.html") === "incluir");
comprobar("un .css es del proyecto", v("styles.css") === "incluir");
comprobar("un .sh es del proyecto", v("scripts/build.sh") === "incluir");
comprobar("package.json es configuración", v("package.json") === "incluir" && c("package.json") === "config");
comprobar("tsconfig.json es configuración", v("tsconfig.json") === "incluir");
comprobar("vite.config.ts es configuración", v("vite.config.ts") === "incluir");
comprobar("Dockerfile es del proyecto", v("Dockerfile") === "incluir");
comprobar("requirements.txt es del proyecto", v("requirements.txt") === "incluir");
comprobar("un .yml es configuración", v(".github/workflows/ci.yml") === "incluir");
comprobar("README.md es documentación", v("README.md") === "incluir" && c("README.md") === "documentacion");
comprobar("el .cn del propio IDE es del proyecto", v("proyecto.cn") === "incluir");

// EL MATIZ QUE CASI SE PIERDE: los .lock del proyecto SÍ viajan. Solo se
// descartan los que son señal de un proceso vivo (.pid).
comprobar("package-lock.json SÍ entra", v("package-lock.json") === "incluir");
comprobar("yarn.lock SÍ entra", v("yarn.lock") === "incluir");
comprobar("pnpm-lock.yaml SÍ entra", v("pnpm-lock.yaml") === "incluir");
comprobar("Cargo.lock SÍ entra", v("Cargo.lock") === "incluir");
comprobar("poetry.lock SÍ entra", v("poetry.lock") === "incluir");

// Normalización de rutas: el separador no cambia el veredicto.
comprobar("«./src/a.ts» se normaliza y entra", v("./src/a.ts") === "incluir");
comprobar("la barra invertida de Windows no confunde", v("src\\App.tsx") === "incluir");

// ════════════════════════════════════════════════════════════════════════════
// 3 · PREGUNTAR: la categoría que antes no existía
// ════════════════════════════════════════════════════════════════════════════
console.log("\n3) Lo que hay que preguntar (antes entraba en silencio)\n");

comprobar("una imagen se pregunta", v("logo.png") === "preguntar");
comprobar("un gif se pregunta", v("brain.gif") === "preguntar");
comprobar("un vídeo se pregunta", v("demo.mp4") === "preguntar");
comprobar("un csv se pregunta", v("datos.csv") === "preguntar");
comprobar("un pdf se pregunta", v("informe.pdf") === "preguntar");
comprobar("una sqlite se pregunta", v("cache.sqlite") === "preguntar");
comprobar("un xlsx se pregunta", v("ventas.xlsx") === "preguntar");
comprobar("una extensión desconocida se pregunta", v("cosa.mio") === "preguntar");
comprobar("un archivo sin extensión se pregunta", v("notas") === "preguntar");
comprobar("«.tmp2» NO se cuela por el parecido con «.tmp»", v("x.tmp2") === "preguntar");
comprobar("la categoría de lo desconocido se declara", c("cosa.mio") === "desconocido");
comprobar("imagen y dato se distinguen", c("logo.png") === "arte" && c("datos.csv") === "datos");

// ════════════════════════════════════════════════════════════════════════════
// 4 · LA PREGUNTA QUE EL MODELO TIENE QUE HACER
// ════════════════════════════════════════════════════════════════════════════
console.log("\n4) La pregunta viene redactada, no se deja al criterio del modelo\n");

// Solo hay proyecto: no se pregunta nada. Preguntar por un .ts sería ruido, y el
// ruido enseña a ignorar las preguntas.
const soloProyecto = auditarArbol(["src/App.tsx", "package.json", "README.md"]);
comprobar("sin nada dudoso NO se pregunta", soloProyecto.pregunta === null, String(soloProyecto.pregunta));
comprobar("...y el resumen cuenta lo que hay", soloProyecto.resumen.includes("3 archivo(s)"));
comprobar("...y los tres se clasifican como incluibles", soloProyecto.incluir.length === 3);
comprobar("...y no hay prohibidos", soloProyecto.prohibidos.length === 0);

const mezcla = auditarArbol(["src/App.tsx", "logo.png", "datos.csv", ".env", "dist/app.js"]);
comprobar("con dudas SÍ se pregunta", typeof mezcla.pregunta === "string");
comprobar("la pregunta lleva el número de lo dudoso", mezcla.pregunta!.includes("confirmación para 2"));
comprobar("la pregunta lleva el número de lo prohibido", mezcla.pregunta!.includes("NO los añado (2)"));
comprobar("la pregunta lista las rutas concretas", mezcla.pregunta!.includes("logo.png") && mezcla.pregunta!.includes("datos.csv"));
comprobar("la pregunta explica por qué se prohíbe", mezcla.pregunta!.includes(".env"));
comprobar("la pregunta pide confirmación explícita", mezcla.pregunta!.includes("¿Confirmas"));
comprobar("la pregunta reconoce lo que entra sin preguntar", mezcla.pregunta!.includes("sin preguntar (1)"));
comprobar("el resumen cuadra", mezcla.resumen.includes("1 entran sin discusión") && mezcla.resumen.includes("2 necesitan confirmación") && mezcla.resumen.includes("2 no pueden entrar"));

// Una lista larga no se lee; la pregunta se corta y dice cuántos quedan.
const muchas = auditarArbol(Array.from({ length: 20 }, (_, i) => `dato${i}.csv`));
// Se listan 8 y se dice cuántas quedan. Se comprueba por CONTENIDO y no por
// número de viñetas: contar «  · » incluiría también la línea del «…y 12 más»,
// que es lo que hace que la primera versión de esta prueba diera 9 y fallara.
comprobar("con muchas dudas, la octava entra en la lista", muchas.pregunta!.includes("dato7.csv"));
comprobar("...y la novena ya no (la lista se corta)", !muchas.pregunta!.includes("dato8.csv"));
comprobar("...y se dice cuántas quedan fuera de la lista", muchas.pregunta!.includes("y 12 más"));

comprobar("puedeIrEnElEmpaque permite un .ts", puedeIrEnElEmpaque("src/a.ts") === true);
comprobar("puedeIrEnElEmpaque bloquea un .env", puedeIrEnElEmpaque(".env") === false);
comprobar("puedeIrEnElEmpaque bloquea el espejo", puedeIrEnElEmpaque(".proyectos/x.html") === false);
// Ojo: una imagen es «preguntar», no «prohibido». El empaquetador la deja pasar
// porque la decisión de incluirla la toma el usuario, no este atajo.
comprobar("puedeIrEnElEmpaque deja pasar una imagen (se pregunta, no se bloquea)", puedeIrEnElEmpaque("logo.png") === true);

// ════════════════════════════════════════════════════════════════════════════
// 5 · EL CABLEADO: el empaquetador y la ley del motor
// ════════════════════════════════════════════════════════════════════════════
console.log("\n5) Conectado de verdad al empaquetador y a la ley\n");

const fp = leer("src/utils/fileParser.ts");
comprobar("el empaquetador importa la aduana", /import \{ clasificarRuta \} from "\.\.\/engine\/aduanaArbol"/.test(fp));
comprobar("...y la usa en cada archivo", /const d = clasificarRuta\(ruta\)/.test(fp));
comprobar("...y NO mete los prohibidos", /if \(d\.veredicto === "prohibido"\)[\s\S]{0,260}return;/.test(fp));
comprobar("lo excluido queda REGISTRADO en el manifiesto", /excluidos: excluidos\.length > 0 \? excluidos : undefined/.test(fp));
comprobar("el recuento del manifiesto es el REAL", /fileCount: empaquetados/.test(fp));
comprobar("...y ya no se cuenta la entrada original", !/fileCount: files\.length \+ \(options\.extraFiles\?\.length \?\? 0\)/.test(fp));
comprobar("el manifiesto deja de declarar «IDE v1» a mano", /CerebroNico IDE \$\{IDE_BRAND\.VERSION\}/.test(fp));

const ley = leer("cerebro.md");
comprobar("la ley del motor incluye la aduana del árbol", /ADUANA DEL ÁRBOL \(v8\.0\.6\)/.test(ley));
comprobar("...y está en los guardrails (se inyecta siempre)", ley.indexOf("ADUANA DEL ÁRBOL") < ley.indexOf("## 3."));
comprobar("...y nombra los secretos que no entran nunca", /\.env.*\.pem.*\.key/s.test(ley));
comprobar("...y exige preguntar con la lista", /La pregunta lleva la LISTA|lista y el número/.test(ley));

console.log(`\n═══ ÁRBOL Y EMPAQUE (v8.0.6): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
