/**
 * quirofanoPuertas.test.ts — SEGURIDAD (v1.6.32)
 * ==============================================
 * Las 11 puertas del sandbox (exec/fs/sandbox) pedían `sandboxAuthorized`
 * desde la D2. El QUIRÓFANO añadió DOS endpoints que TOCAN DISCO
 * (/api/quirofano/revisar cierra y puede revertir una tanda;
 * /api/quirofano/deshacer reescribe archivos con la copia anterior) y se
 * quedaron SIN puerta: cualquiera que alcance el puerto puede pedirle al
 * motor que revierta el trabajo. Es auditoría ESTÁTICA sobre el fuente —
 * la casa ya audita así (arbol, botones): lo que no se comprueba aquí,
 * se regressiona sin enterarse.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srv = fs.readFileSync(path.join(RAIZ, "server.ts"), "utf8");

// Cortar el cuerpo de cada handler por su cierre «\n  });» es frágil, pero el
// contrato se comprueba con margen: la puerta debe aparecer ANTES de cualquier
// llamada al motor dentro de los primeros 400 caracteres del handler.
function cuerpo(marcador: string): string {
  const i = srv.indexOf(marcador);
  if (i === -1) return "";
  return srv.slice(i, i + 400);
}

console.log("\n1) Las dos puertas mutantes del Quirófano están cerradas\n");

const revisar = cuerpo('app.post("/api/quirofano/revisar"');
const deshacer = cuerpo('app.post("/api/quirofano/deshacer"');
comprobar("existe el handler /api/quirofano/revisar", revisar.length > 0);
comprobar("existe el handler /api/quirofano/deshacer", deshacer.length > 0);
comprobar("revisar pide sandboxAuthorized antes de cerrar la tanda", /sandboxAuthorized\(req\)/.test(revisar) && /cerrarTurnoQf/.test(revisar), revisar.slice(0, 220));
comprobar("deshacer pide sandboxAuthorized antes de revertir", /sandboxAuthorized\(req\)/.test(deshacer) && /deshacerUltimoQf/.test(deshacer), deshacer.slice(0, 220));
comprobar("los dos devuelven 401 con el mismo texto que las otras 11", (revisar.match(/status\(401\)/g) || []).length + (deshacer.match(/status\(401\)/g) || []).length === 2);

console.log("\n2) Ninguna ruta POST del Quirófano queda sin puerta\n");

const posts = [...srv.matchAll(/app\.post\("\/api\/quirofano\/([a-z]+)"/g)].map((x) => x[1]);
comprobar("se encuentran los dos mutantes (revisar, deshacer)", posts.includes("revisar") && posts.includes("deshacer"), posts.join(","));
for (const p of posts) {
  const c = cuerpo(`app.post("/api/quirofano/${p}"`);
  comprobar(`POST /api/quirofano/${p} tiene su puerta`, /sandboxAuthorized\(req\)/.test(c));
}

console.log("\n3) El contrato de la puerta no cambió (11 → 13, sin aflojar)\n");

const usos = (srv.match(/sandboxAuthorized\(req\)/g) || []).length;
comprobar("al menos 13 usos de la puerta", usos >= 13, String(usos));
comprobar("la definición sigue exigiendo ACCESS_TOKEN si está puesto", /const token = process\.env\.ACCESS_TOKEN;[\s\S]{0,220}provided === token/.test(srv));

console.log(`\n═══ PUERTAS QUIRÓFANO (v1.6.32): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
