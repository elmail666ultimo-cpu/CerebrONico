/**
 * espejo.test.ts — EL ESPEJO DEL PROYECTO (v8.0.7)
 * ================================================
 * Petición del usuario: «Existe algo que no lo deja crear código correcto,
 * siempre se olvida de los archivos de un proyecto. Haz una plantilla en el
 * motor de procesos de proyecto e impleméntale su proceso para que lo tenga como
 * espejo.»
 *
 * La prueba tiene que demostrar tres cosas, y la tercera es la que importa:
 *   1. El espejo se reconoce bien (no confunde un Vite con un Node suelto).
 *   2. El cotejo encuentra lo que falta, y distingue OBLIGATORIO de opcional.
 *   3. La salida está REDACTADA para que un modelo pequeño pueda actuar, no
 *      para que un humano la admire.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  PLANTILLAS,
  detectarPlantilla,
  compararConEspejo,
  preguntaDeFaltantes,
} from "../src/engine/plantillasProyecto";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ════════════════════════════════════════════════════════════════════════════
// 1 · INTEGRIDAD DE LAS PLANTILLAS
// ════════════════════════════════════════════════════════════════════════════
console.log("\n1) Las plantillas no pueden mentir ni repetirse\n");

comprobar("hay al menos 5 plantillas", PLANTILLAS.length >= 5, String(PLANTILLAS.length));
comprobar("los id son únicos", new Set(PLANTILLAS.map((p) => p.id)).size === PLANTILLAS.length);
comprobar("cada plantilla tiene marcadores", PLANTILLAS.every((p) => p.marcadores.length > 0));
comprobar("cada plantilla tiene archivos", PLANTILLAS.every((p) => p.archivos.length > 0));
comprobar("cada plantilla tiene al menos un OBLIGATORIO", PLANTILLAS.every((p) => p.archivos.some((a) => a.obligatorio)));
comprobar("cada archivo explica su rol", PLANTILLAS.every((p) => p.archivos.every((a) => a.rol.length > 10)));
comprobar("no hay rutas repetidas dentro de una plantilla", PLANTILLAS.every((p) => new Set(p.archivos.map((a) => a.ruta)).size === p.archivos.length));
comprobar("el puerto es 3500 donde aplica", PLANTILLAS.filter((p) => p.puerto !== null).every((p) => p.puerto === 3500));
comprobar("cada plantilla declara su comando de arranque o lo marca como no aplicable", PLANTILLAS.every((p) => typeof p.arrancar === "string"));
comprobar("las obligatorias cubren los 4 conjuntos que pidió el usuario", ["web-estatica", "vite-react", "node-express", "fastapi"].every((id) => PLANTILLAS.some((p) => p.id === id)));

// El espejo de la web estática es EL caso del usuario: si le falta el CSS, el
// preview sale mal y el modelo dice que ha terminado.
const web = PLANTILLAS.find((p) => p.id === "web-estatica")!;
comprobar("la web estática exige index.html", web.archivos.some((a) => a.ruta === "index.html" && a.obligatorio));
comprobar("...y también styles.css", web.archivos.some((a) => a.ruta === "styles.css" && a.obligatorio));
comprobar("...y también script.js", web.archivos.some((a) => a.ruta === "script.js" && a.obligatorio));
comprobar("la web estática no pide instalar nada", web.instalar === null);

const vite = PLANTILLAS.find((p) => p.id === "vite-react")!;
comprobar("Vite exige tsconfig.json (el que más se olvida)", vite.archivos.some((a) => a.ruta === "tsconfig.json" && a.obligatorio));
comprobar("Vite exige el index.html raíz", vite.archivos.some((a) => a.ruta === "index.html" && a.obligatorio));
comprobar("Vite avisa del puerto 5173 vs 3500", /5173/.test(vite.nota || ""));

const fastapi = PLANTILLAS.find((p) => p.id === "fastapi")!;
comprobar("FastAPI exige app/__init__.py (el que más se olvida)", fastapi.archivos.some((a) => a.ruta === "app/__init__.py" && a.obligatorio));

// ════════════════════════════════════════════════════════════════════════════
// 2 · DETECCIÓN DEL TIPO
// ════════════════════════════════════════════════════════════════════════════
console.log("\n2) Se reconoce el tipo, incluido el caso ambiguo\n");

comprobar("una web estática se reconoce", detectarPlantilla(["index.html", "styles.css"])?.id === "web-estatica");
comprobar("un Vite se reconoce por sus marcadores", detectarPlantilla(["package.json", "vite.config.ts", "src/main.tsx"])?.id === "vite-react");
// EL CASO AMBIGUO: un proyecto Vite también tiene package.json, así que encaja en
// node-express. Gana el más específico, y eso se mide por archivos que sabe nombrar.
const ambiguo = detectarPlantilla(["package.json", "vite.config.ts", "src/main.tsx", "index.html", "tsconfig.json"]);
comprobar("un Vite NO se confunde con un Node suelto", ambiguo?.id === "vite-react", String(ambiguo?.id));
comprobar("un Node con sólo package.json se queda en Node", detectarPlantilla(["package.json", "server.js"])?.id === "node-express");
comprobar("una API FastAPI se reconoce", detectarPlantilla(["requirements.txt", "app/main.py"])?.id === "fastapi");
comprobar("un script suelto se reconoce", detectarPlantilla(["index.js"])?.id === "script-suelto");
comprobar("sin archivos no se inventa tipo", detectarPlantilla([]) === null);
comprobar("con archivos irreconocibles tampoco", detectarPlantilla(["cosa.mio", "otra.xyz"]) === null);

// ════════════════════════════════════════════════════════════════════════════
// 3 · EL COTEJO: LO QUE FALTA
// ════════════════════════════════════════════════════════════════════════════
console.log("\n3) Encuentra los huecos, y no confunde obligatorio con opcional\n");

// EL CASO EXACTO DEL USUARIO: sólo escribió el HTML.
const soloHtml = compararConEspejo(["index.html"]);
comprobar("con sólo index.html se detecta web estática", soloHtml.plantilla?.id === "web-estatica");
comprobar("...y se ve que faltan styles.css y script.js", soloHtml.faltanObligatorios.length === 2, JSON.stringify(soloHtml.faltanObligatorios));
comprobar("...y se nombran", soloHtml.faltanObligatorios.some((f) => f.ruta === "styles.css") && soloHtml.faltanObligatorios.some((f) => f.ruta === "script.js"));
comprobar("...y NO está completo", soloHtml.completo === false);
comprobar("el favicon opcional NO cuenta como obligatorio", !soloHtml.faltanObligatorios.some((f) => f.ruta === "favicon.ico"));
comprobar("...pero sí aparece en la lista general de faltantes", soloHtml.faltan.some((f) => f.ruta === "favicon.ico"));

const webCompleta = compararConEspejo(["index.html", "styles.css", "script.js"]);
comprobar("con los tres, el proyecto está completo", webCompleta.completo === true);
comprobar("...y no queda ningún obligatorio pendiente", webCompleta.faltanObligatorios.length === 0);

// El defecto clásico: enlazar un archivo que nunca se crea.
comprobar("el espejo avisa de que enlazar obliga a crear", /enlaza|enlaces/.test(soloHtml.espejoParaPrompt));
comprobar("...y pide escribirlos en el MISMO turno", /mismo turno/.test(soloHtml.espejoParaPrompt));

// Un proyecto sin reconocer no se queda mudo: se le dice qué hacer.
const sinTipo = compararConEspejo(["cosa.mio"]);
comprobar("sin tipo reconocido no hay plantilla", sinTipo.plantilla === null);
comprobar("...y el texto pide decidir el tipo primero", /decide QUÉ proyecto es/.test(sinTipo.espejoParaPrompt));
comprobar("...y no se inventa faltantes", sinTipo.faltan.length === 0);

// Rutas anidadas: el sync aplana, así que un archivo en subcarpeta cuenta.
const anidado = compararConEspejo(["src/index.html", "src/styles.css", "src/script.js"]);
comprobar("una web en subcarpeta también se da por completa", anidado.completo === true, JSON.stringify(anidado.faltanObligatorios));
comprobar("...y se reconoce el tipo igual", anidado.plantilla?.id === "web-estatica");

comprobar("se puede forzar la plantilla", compararConEspejo(["a.js"], "fastapi").plantilla?.id === "fastapi");

// ════════════════════════════════════════════════════════════════════════════
// 4 · LA SALIDA ESTÁ REDACTADA PARA ACTUAR
// ════════════════════════════════════════════════════════════════════════════
console.log("\n4) El texto sirve para actuar, no para lucirse\n");

comprobar("el espejo marca lo presente con [x]", soloHtml.espejoParaPrompt.includes("[x] index.html"));
comprobar("...y lo ausente con [ ]", soloHtml.espejoParaPrompt.includes("[ ] styles.css"));
comprobar("...y distingue obligatorio de opcional", soloHtml.espejoParaPrompt.includes("(obligatorio)") && soloHtml.espejoParaPrompt.includes("(opcional)"));
comprobar("...y da el comando de arranque", soloHtml.espejoParaPrompt.includes("arrancar:"));
comprobar("...y dice el puerto", soloHtml.espejoParaPrompt.includes("3500"));
comprobar("...y declara el límite conocido de la plantilla", soloHtml.espejoParaPrompt.includes("Límite conocido"));
comprobar("cuando faltan obligatorios lo dice en mayúsculas y sin rodeos", /FALTAN 2 ARCHIVO\(S\) OBLIGATORIO\(S\)/.test(soloHtml.espejoParaPrompt));
comprobar("cuando no falta nada, no dramatiza", /No falta ningún archivo obligatorio/.test(webCompleta.espejoParaPrompt));

// La pregunta: sólo cuando hay algo que preguntar.
comprobar("con huecos obligatorios hay pregunta", typeof preguntaDeFaltantes(soloHtml) === "string");
comprobar("la pregunta lleva la lista con el motivo", preguntaDeFaltantes(soloHtml)!.includes("styles.css —"));
comprobar("la pregunta propone las dos salidas", /Los creo ahora/.test(preguntaDeFaltantes(soloHtml)!) && /prefieres escribirlos tú/.test(preguntaDeFaltantes(soloHtml)!));
comprobar("un proyecto completo NO genera pregunta", preguntaDeFaltantes(webCompleta) === null);
comprobar("un proyecto sin plantilla tampoco", preguntaDeFaltantes(sinTipo) === null);

// ════════════════════════════════════════════════════════════════════════════
// 5 · IMPLANTADO EN EL MOTOR
// ════════════════════════════════════════════════════════════════════════════
console.log("\n5) El espejo está implantado, no solo escrito\n");

const kb = leer("src/engine/kbCodigo.ts");
comprobar("la base de datos del motor tiene la regla del espejo", /id: "rule-espejo-proyecto"/.test(kb));
comprobar("...con los conjuntos mínimos de memoria", /web estática → index\.html \+ styles\.css \+ script\.js/.test(kb));
comprobar("...y en tabla `rule` (no se desplaza por azar)", /id: "rule-espejo-proyecto",\s*table: "rule"/.test(kb));

const ley = leer("cerebro.md");
comprobar("la ley del motor tiene el proceso del espejo", /ESPEJO DEL PROYECTO \(v8\.0\.7\)/.test(ley));
comprobar("...dentro de los guardrails (se inyecta siempre)", ley.indexOf("ESPEJO DEL PROYECTO") < ley.indexOf("## 3."));
comprobar("...y exige escribir el conjunto completo en el mismo turno", /conjunto COMPLETO en el mismo turno/.test(ley));
comprobar("...y prohíbe enlazar lo que no se crea", /Si no lo vas a crear, no lo enlaces/.test(ley));

const srv = leer("server.ts");
comprobar("hay endpoint para cotejar el sandbox real", /app\.get\("\/api\/proyecto\/espejo"/.test(srv));
comprobar("...con lectura acotada (no se come un node_modules)", /prof > 5 \|\| rutas\.length >= 600/.test(srv));
comprobar("...y devuelve la pregunta ya redactada", /pregunta: preguntaDeFaltantes\(cmp\)/.test(srv));
comprobar("...y avisa si truncó la lectura", /truncado: rutas\.length >= 600/.test(srv));

console.log(`\n═══ ESPEJO DEL PROYECTO (v8.0.7): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
