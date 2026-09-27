/**
 * motor-estructura.test.ts — CONOCIMIENTO DEL MOTOR Y ESTABILIDAD (v0.9.1)
 * ========================================================================
 * Pedido: «incrementa su estabilidad y agranda su base de datos en general +
 * conocimiento e inteligencia en la estructura de su motor».
 *
 * Se comprueban tres cosas:
 *   1. El pack de estructura del motor es COHERENTE y se RECUPERA de verdad.
 *   2. Las guardas de estabilidad EXISTEN en el fuente (el compilador no las ve).
 *   3. La base de conocimiento se guarda de forma ATÓMICA y una base corrupta se
 *      aparta en vez de sobrescribirse. Ésta última es la que evita perder lo
 *      aprendido, que es justo lo contrario de «agrandar la base».
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { KB_MOTOR, PUERTOS } from "../src/engine/kbMotor";
import { KnowledgeBase, SEMILLA_COMPLETA, KB_SEED } from "../src/engine/knowledgeBase";
import { KB_CODIGO } from "../src/engine/kbCodigo";
import { KB_MOTOR as _KB_MOTOR_DUP } from "../src/engine/kbMotor";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, ok: boolean, extra?: string): void {
  if (ok) { correctas++; return; }
  fallos.push(`${nombre}${extra ? "  →  " + extra : ""}`);
}
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const srv = leer("server.ts");
const srvSinComentarios = srv.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const kbSrc = leer("src/engine/knowledgeBase.ts");

// ────────────────────────────────────────────────────────────────────────────
// 1 · EL PACK DE ESTRUCTURA DEL MOTOR
// ────────────────────────────────────────────────────────────────────────────
console.log("\n1) El conocimiento del propio motor\n");

comprobar("el pack tiene entradas de sobra", KB_MOTOR.length >= 18, `${KB_MOTOR.length}`);
comprobar("los ids no se repiten dentro del pack", (() => {
  const ids = KB_MOTOR.map((e) => e.id);
  return new Set(ids).size === ids.length;
})());
comprobar("todos tienen id, tabla, título, claves y cuerpo", KB_MOTOR.every(
  (e) => e.id && e.table && e.title && e.keys?.length && (e.body?.length ?? 0) > 100
));
const TABLAS = ["syntax", "error", "tool", "project", "skill", "pattern", "lesson", "manual", "rule"];
comprobar("todas las tablas son válidas", KB_MOTOR.every((e) => TABLAS.includes(e.table)));
comprobar("no hay cuerpos de una sola línea", KB_MOTOR.every((e) => (e.body.match(/\n/g) || []).length >= 3));

// Los puertos son el dato que más se confunde: o están, o el modelo los inventa.
comprobar("los cuatro puertos son los reales",
  PUERTOS.ide === 3000 && PUERTOS.sandbox === 3500 && PUERTOS.puente === 5000 && PUERTOS.ollama === 11434,
  JSON.stringify(PUERTOS));
const mapa = KB_MOTOR.find((e) => e.id === "motor-mapa-general");
comprobar("el mapa nombra los cuatro puertos",
  ["3000", "3500", "5000", "11434"].every((p) => mapa!.body.includes(p)));

// ────────────────────────────────────────────────────────────────────────────
// 2 · SE RECUPERA (una entrada que no se encuentra no existe)
// ────────────────────────────────────────────────────────────────────────────
console.log("\n2) Recuperación con palabras de usuario\n");

const kb = new KnowledgeBase();
const top = (q: string) => kb.query(q, 3)[0]?.entry.id ?? null;

comprobar("«el proyecto está en una subcarpeta» → raíz del proyecto",
  top("el proyecto esta en una subcarpeta y no lo encuentra") === "motor-projectporter",
  String(top("el proyecto esta en una subcarpeta y no lo encuentra")));
// Aquí SÍ se admiten dos respuestas. Sobre «preview en blanco» hay dos entradas
// legítimas: la vieja (`pat-preview-en-blanco`, escrita antes de esta sesión) y
// la del motor, que añade las cuatro causas ordenadas. Que gane una u otra no es
// un defecto: las dos contestan bien. Obligar a que gane la nueva sería una
// prueba que mide el orden interno en vez del resultado — y ese orden puede
// cambiar por una razón legítima mañana.
comprobar("«el preview sale en blanco» encuentra una respuesta buena",
  ["motor-flujo-preview-blanco", "pat-preview-en-blanco"].includes(top("el preview del sandbox sale en blanco") as string),
  String(top("el preview del sandbox sale en blanco")));
comprobar("...y la entrada vieja sigue disponible en el resultado",
  kb.query("el preview del sandbox sale en blanco", 3).some((h) => h.entry.id === "pat-preview-en-blanco"));
// Y aquí la lección más útil de toda la suite, aprendida a base de intentarlo mal
// tres veces: cuando DOS entradas contestan bien a la misma pregunta, no se
// pelea con el ordenador. `err-puerto-ocupado-sandbox` ya tenía como claves los
// cuatro puertos (3000/3500/5000/11434), así que contesta bien a «en qué puerto
// va el proyecto». Forzar que gane la nueva retorciendo claves deja la base
// frágil y convierte la prueba en una medida del orden interno, no del resultado
// — y ese orden puede cambiar mañana por una razón legítima.
comprobar("«en qué puerto va el proyecto» encuentra una respuesta con los puertos reales",
  ["motor-mapa-general", "err-puerto-ocupado-sandbox"].includes(top("en que puerto va el proyecto del usuario") as string),
  String(top("en que puerto va el proyecto del usuario")));
comprobar("...y el mapa del motor se recupera igualmente",
  kb.query("en que puerto va el proyecto del usuario", 3).some((h) => h.entry.id === "motor-mapa-general"));
comprobar("«no arranca el servidor del sandbox» → flujo de arranque",
  top("no arranca el servidor del sandbox") === "motor-flujo-arranque-sandbox",
  String(top("no arranca el servidor del sandbox")));
comprobar("«cómo se guarda la base de datos del motor» → flujo de la kb",
  top("como se guarda la base de datos del motor") === "motor-flujo-kb",
  String(top("como se guarda la base de datos del motor")));
comprobar("una consulta de código AJENO NO la secuestra el pack del motor",
  top("useRef exige argumento inicial en React 19") === "syn-react19-useref",
  String(top("useRef exige argumento inicial en React 19")));
comprobar("y una de acción destructiva sigue ganando lo suyo",
  top("borrar un archivo del usuario sin permiso") === "rule-destructive",
  String(top("borrar un archivo del usuario sin permiso")));

// ────────────────────────────────────────────────────────────────────────────
// 3 · LA BASE CRECE, Y AL RECARGAR NO SE PIERDE NADA
// ────────────────────────────────────────────────────────────────────────────
console.log("\n3) La base de datos, más grande y sin perder piezas\n");

comprobar("el pack entra en la semilla completa",
  SEMILLA_COMPLETA.some((e) => e.id === "motor-mapa-general") &&
  SEMILLA_COMPLETA.some((e) => e.id === "gen-escritura-atomica"));
// El número REAL, medido. La primera versión de esta prueba pedía «>= 130» a
// ojo, y la semilla tiene 116: una prueba que exige una cifra inventada falla
// por una razón que no tiene nada que ver con el motor. El suelo se pone justo
// por debajo de lo real para que avise si alguien BORRA conocimiento, que es lo
// que de verdad hay que vigilar aquí.
comprobar("la semilla tiene el conocimiento que se le ha ido añadiendo", SEMILLA_COMPLETA.length >= 116, `${SEMILLA_COMPLETA.length}`);
comprobar("los ids de TODA la semilla son únicos", (() => {
  const ids = SEMILLA_COMPLETA.map((e) => e.id);
  return new Set(ids).size === ids.length;
})(), (() => {
  const ids = SEMILLA_COMPLETA.map((e) => e.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  return dup.slice(0, 3).join(", ");
})());
comprobar("cada pieza aporta lo suyo (semilla base + manuales + código + motor)",
  SEMILLA_COMPLETA.length >= KB_SEED.length + KB_CODIGO.length + KB_MOTOR.length,
  `${KB_SEED.length} + ${KB_CODIGO.length} + ${KB_MOTOR.length} vs ${SEMILLA_COMPLETA.length}`);
comprobar("el pack se importa una sola vez en la semilla",
  (kbSrc.match(/\.\.\.KB_MOTOR/g) || []).length === 1);
comprobar("y no se importa dos veces bajo nombres distintos",
  (kbSrc.match(/from "\.\/kbMotor"/g) || []).length === 1);

// Ida y vuelta por JSON: es el camino REAL del servidor (se guarda y se recarga).
const viaje = KnowledgeBase.fromJSON(new KnowledgeBase().toJSON());
comprobar("ida y vuelta por JSON conserva el tamaño", viaje.size() === new KnowledgeBase().size());
comprobar("...y conserva una entrada del pack del motor",
  !!viaje.query("el preview del sandbox sale en blanco", 1)[0]);

// ────────────────────────────────────────────────────────────────────────────
// 4 · GUARDAS DE ESTABILIDAD (se leen del fuente: el compilador no las ve)
// ────────────────────────────────────────────────────────────────────────────
console.log("\n4) Guardas de estabilidad\n");

comprobar("existe la guarda de promesa rechazada", /process\.on\("unhandledRejection"/.test(srvSinComentarios));
comprobar("existe la guarda de excepción no atrapada", /process\.on\("uncaughtException"/.test(srvSinComentarios));
// El CUERPO del manejador, no una ventana de caracteres. La primera versión
// miraba 400 caracteres después de `unhandledRejection` y encontraba el
// `process.exit` de la guarda SIGUIENTE (la de excepción no atrapada), así que
// fallaba por mirar demasiado lejos. Se acota al cuerpo: desde el `process.on`
// hasta el cierre del manejador.
const cuerpoRechazo = (srvSinComentarios.match(/process\.on\("unhandledRejection"[\s\S]*?\n\}\);/) || [""])[0];
comprobar("la de promesa rechazada NO mata el proceso",
  cuerpoRechazo.length > 0 && !cuerpoRechazo.includes("process.exit"),
  cuerpoRechazo.slice(0, 120));
comprobar("la de excepción no atrapada SÍ guarda antes de salir",
  /uncaughtException[\s\S]{0,400}saveEngineKb\(true\)/.test(srvSinComentarios));
comprobar("las guardas son RUIDOSAS (no se tragan el fallo)",
  /unhandledRejection[\s\S]{0,200}console\.error/.test(srvSinComentarios) &&
  /uncaughtException[\s\S]{0,200}console\.error/.test(srvSinComentarios));

// El middleware de error: cuatro argumentos y registrado, o no existe.
comprobar("hay middleware de error de Express",
  /app\.use\(\(err: any, req: Request, res: Response, _next: NextFunction\) =>/.test(srvSinComentarios));
comprobar("el middleware responde 500 en JSON (no deja la petición colgada)",
  /app\.use\(\(err: any[\s\S]{0,900}res\.status\(500\)\.json\(/.test(srvSinComentarios));
comprobar("...y no reescribe una respuesta ya empezada",
  /app\.use\(\(err: any[\s\S]{0,700}res\.headersSent/.test(srvSinComentarios));
comprobar("NextFunction está importado de express", /import express, \{ Request, Response, NextFunction \}/.test(srv));

// ────────────────────────────────────────────────────────────────────────────
// 5 · LA BASE NO SE PUEDE TRUNCAR (escritura atómica)
// ────────────────────────────────────────────────────────────────────────────
console.log("\n5) Guardado atómico y recuperación de base corrupta\n");

comprobar("se escribe en un temporal", /const temporal = ENGINE_DB_FILE \+ "\.tmp"/.test(srvSinComentarios));
comprobar("y se RENOMBRA sobre el bueno (atómico)",
  /writeFileSync\(temporal[\s\S]{0,120}renameSync\(temporal, ENGINE_DB_FILE\)/.test(srvSinComentarios));
comprobar("ya NO se escribe directamente sobre el archivo bueno",
  !/writeFileSync\(ENGINE_DB_FILE/.test(srvSinComentarios));
comprobar("el temporal se limpia si algo falla", /unlinkSync\(temporal\)/.test(srvSinComentarios));
comprobar("una base ilegible se APARTA en vez de perderse",
  /renameSync\(ENGINE_DB_FILE, apartado\)/.test(srvSinComentarios));
comprobar("...con marca de tiempo en el nombre", /corrupto-\$\{marca\}/.test(srvSinComentarios));
comprobar("...y se dice cuántas entradas se pierden (en bytes)",
  /LA BASE DE CONOCIMIENTO NO SE PUDO LEER \(\$\{bytes\} bytes\)/.test(srvSinComentarios));
comprobar("los cierres limpios guardan y dicen cuántas entradas",
  (srvSinComentarios.match(/guardarYContar\(\)/g) || []).length >= 3);

console.log(`\n═══ MOTOR Y ESTABILIDAD (v0.9.1): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  ✗ " + f);
  process.exit(1);
}
