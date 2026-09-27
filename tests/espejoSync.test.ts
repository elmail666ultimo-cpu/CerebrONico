/**
 * espejoSync.test.ts — ESPEJO-SYNC (v1.6.31)
 * ==========================================
 * El sync escribía siempre y NO retiraba nada: un lote de 40 archivos seguido
 * de uno de 38 dejaba los 2 viejos en disco para siempre (árbol mezclado, el
 * fallo de las 2:10 a. m.). La prueba demuestra tres cosas:
 *   1. El manifiesto de propiedad (`.cn-sync/manifiesto.json`) recuerda lo que
 *      el sync escribió, con huella por archivo.
 *   2. Lo que se escribió antes y ya no llega se RETIRA; lo que el usuario creó
 *      a mano (no sincronizado) JAMÁS se toca.
 *   3. Lo idéntico no se reescribe, lo cambiado sí, y el motor está implantado:
 *      GUARDA-SERVIDOR-EJEC en /api/exec y el retiro cableado en /api/fs/sync.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  crearManifiesto,
  huella,
  normalizarRuta,
  esRutaIgnorableSync,
  planificarRetiro,
  registrarSync,
  serializarManifiesto,
  parsearManifiesto,
  esRetirado,
} from "../src/engine/espejoSync";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ════════════════════════════════════════════════════════════════════════════
// 1 · EL MANIFIESTO NACE VACÍO Y HONESTO
// ════════════════════════════════════════════════════════════════════════════
console.log("\n1) El manifiesto nace vacío y la huella es determinista\n");

const vacio = crearManifiesto();
comprobar("el manifiesto vacío no tiene dueños", Object.keys(vacio.propietarios).length === 0);
comprobar("el manifiesto vacío no tiene retirados", vacio.retirados.length === 0);
comprobar("la huella es determinista", huella("hola") === huella("hola"));
comprobar("la huella distingue contenidos", huella("hola") !== huella("chau"));

// ════════════════════════════════════════════════════════════════════════════
// 2 · RUTAS COMPARABLES E IGNORABLES
// ════════════════════════════════════════════════════════════════════════════
console.log("\n2) Las rutas se normalizan y se ignora lo que no es del sync\n");

comprobar("normaliza ./ y barras invertidas", normalizarRuta(".\\src\\App.tsx") === "src/App.tsx", normalizarRuta(".\\src\\App.tsx"));
comprobar("node_modules se ignora", esRutaIgnorableSync("node_modules/react/index.js") === true);
comprobar(".cn-sync se ignora (el manifiesto no es dueño de sí mismo)", esRutaIgnorableSync(".cn-sync/manifiesto.json") === true);
comprobar("un src normal NO se ignora", esRutaIgnorableSync("src/App.tsx") === false);

// ════════════════════════════════════════════════════════════════════════════
// 3 · EL RETIRO: SOLO LO QUE EL SYNC ESCRIBIÓ
// ════════════════════════════════════════════════════════════════════════════
console.log("\n3) Se retira lo que escribimos antes y ya no llega\n");

comprobar("sin dueños previos no hay nada que retirar", planificarRetiro(vacio, ["a.ts"]).aRetirar.length === 0);

const conDos = registrarSync(crearManifiesto(), [{ path: "a.ts", content: "A" }, { path: "b.ts", content: "B" }]).manifesto;
comprobar("registrar dos archivos deja dos dueños", Object.keys(conDos.propietarios).length === 2);

const retiro = planificarRetiro(conDos, ["a.ts"]);
comprobar("el dueño que ya no llega se retira", retiro.aRetirar.length === 1 && retiro.aRetirar[0] === "b.ts", JSON.stringify(retiro.aRetirar));
comprobar("el dueño que sigue llega NO se retira", retiro.aRetirar.includes("a.ts") === false);
comprobar("el retirado queda apuntado en el histórico", retiro.manana.retirados.includes("b.ts"));
comprobar("lo que el usuario creó a mano no se retira", planificarRetiro(conDos, ["a.ts", "manual.ts"]).aRetirar.length === 1);

// El histórico no duplica: si b.ts ya estaba retirado, no se repite.
const retiradoDosVeces = planificarRetiro(retiro.manana, ["a.ts"]);
comprobar("el histórico de retirados no duplica entradas", retiradoDosVeces.manana.retirados.filter((r) => r === "b.ts").length === 1);

// ════════════════════════════════════════════════════════════════════════════
// 4 · EL REGISTRO: ESCRIBIR LO NUEVO, OMITIR LO IDÉNTICO
// ════════════════════════════════════════════════════════════════════════════
console.log("\n4) Se registra el lote y se distingue nuevo de idéntico\n");

const r1 = registrarSync(crearManifiesto(), [{ path: "x.ts", content: "X" }]);
comprobar("el primer lote es todo nuevo", r1.nuevos === 1 && r1.escritos === 1);

const r2 = registrarSync(r1.manifesto, [{ path: "x.ts", content: "X" }]);
comprobar("contenido idéntico se omite", r2.omitidos === 1 && r2.escritos === 0 && r2.reescritos === 0);

const r3 = registrarSync(r1.manifesto, [{ path: "x.ts", content: "X2" }]);
comprobar("contenido cambiado se reescribe", r3.reescritos === 1 && r3.escritos === 1);
comprobar("la propiedad se actualiza con la huella nueva", r3.manifesto.propietarios["x.ts"] === huella("X2"));

// ════════════════════════════════════════════════════════════════════════════
// 5 · SERIALIZACIÓN TOLERANTE
// ════════════════════════════════════════════════════════════════════════════
console.log("\n5) El manifiesto se guarda y se lee sin romperse con basura\n");

const ida = serializarManifiesto(r3.manifesto);
const vuelta = parsearManifiesto(ida);
comprobar("serializar y parsear conserva la huella", vuelta !== null && vuelta.propietarios["x.ts"] === huella("X2"));
comprobar("parsear basura devuelve null (no miente)", parsearManifiesto("esto no es json") === null);
comprobar("esRetirado distingue la ruta retirada", esRetirado(retiro.manana, "b.ts") === true && esRetirado(retiro.manana, "a.ts") === false);

// ════════════════════════════════════════════════════════════════════════════
// 6 · IMPLANTADO EN EL MOTOR
// ════════════════════════════════════════════════════════════════════════════
console.log("\n6) El espejo está implantado, no solo escrito\n");

const srv = leer("server.ts");
const aduana = leer("src/engine/comandoEntrante.ts");
const validar = leer("scripts/validar.mjs");

comprobar("server.ts importa el espejoSync", /from "\.\/src\/engine\/espejoSync"/.test(srv));
comprobar("server.ts usa el manifiesto .cn-sync", srv.includes(".cn-sync") && srv.includes("manifiesto.json"));
comprobar("server.ts retira restos en /api/fs/sync", /retiro\.aRetirar/.test(srv) && /registrarSync\(retiro\.manana, files\)/.test(srv));
comprobar("la puerta GUARDA-SERVIDOR-EJEC está en /api/exec", srv.includes("GUARDA-SERVIDOR-EJEC") && /esServidorDeLargaVida\(norm\.comando\)/.test(srv));
comprobar("el usaEnSuLugar arranca en segundo plano", /usaEnSuLugar/.test(srv) && /enSegundoPlano: true/.test(srv));
comprobar("la aduana reconoce servidores de larga vida", /export function esServidorDeLargaVida/.test(aduana));
comprobar("la suite entra en npm run validar", validar.includes("espejoSync.test.ts"));

console.log(`\n═══ ESPEJO-SYNC (v1.6.31): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
