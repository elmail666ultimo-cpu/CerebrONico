/**
 * certezaModelo.test.ts — LA CERTEZA LLEGA AL TEXTO DEL MODELO (v1.14.0)
 * =====================================================================
 * QUÉ ES: la suite del revisor de salida del modelo (`certezaModelo.ts`), que
 * lleva la certeza de la v1.8.0 al texto que el modelo escribe en el chat.
 * PARA QUÉ SIRVE: para que «el archivo funciona» no pueda llegar a la pantalla
 * sin su nivel de certeza. No se prueba «leyendo que el módulo existe»: se llama
 * a `revisarSalida` y se mira qué contesta.
 *
 * ESTADO DE EJECUCIÓN DE ESTA SUITE: se ejecuta de verdad (entra en
 * `npm run validar`), y por eso todo lo que afirma aquí tiene salida real detrás.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { revisarSalida, marcaDeSalida } from "../src/engine/certezaModelo";
import { AFIRMACIONES } from "../src/engine/vocabulario";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle?: string) {
  if (condicion) correctas++;
  else fallos.push(`${titulo}${detalle ? " → " + detalle : ""}`);
}

// ═══ 1 · REUTILIZA EL REVISOR QUE YA EXISTE (no un segundo catálogo) ════════
console.log("\n1) Reutiliza el revisor que ya existe\n");

const fuente = leer("src/engine/certezaModelo.ts");
comprobar("★ no escribe un segundo catálogo: importa el revisor", fuente.includes('from "./vocabulario"') && fuente.includes("revisarVocabulario"));
comprobar("el catálogo sigue siendo el de la v1.8.0 (14 palabras)", AFIRMACIONES.length === 14, String(AFIRMACIONES.length));

// ═══ 2 · LA CERTEZA SE DEDUCE DE LA EVIDENCIA ═══════════════════════════════
console.log("\n2) La evidencia decide la certeza\n");

comprobar("sin evidencia: sin verificar", revisarSalida("hola", {}).certeza === "sin_verificar");
comprobar("con lectura: leido", revisarSalida("hola", { leido: true }).certeza === "leido");
comprobar("con ejecución: ejecutado", revisarSalida("hola", { ejecutado: true }).certeza === "ejecutado");
comprobar("★ leer NO asciende a ejecutado", revisarSalida("hola", { leido: true, ejecutado: false }).certeza === "leido");

// ═══ 3 · LOS CASOS OBLIGATORIOS DE LA EVOLUCIÓN ════════════════════════════
console.log("\n3) Los casos obligatorios de la evolución\n");

// «El archivo funciona» sin evidencia → aviso + texto reescrito (no bloquea, marca).
const sinEvidencia = revisarSalida("El archivo funciona.", {});
comprobar("★ «funciona» sin evidencia → aviso", sinEvidencia.avisos.some((a) => a.palabra === "funciona"));
comprobar("★ «funciona» sin evidencia → texto reescrito", !/funciona/i.test(sinEvidencia.texto), sinEvidencia.texto);
comprobar("★ el reescrito propone decirlo sin mentir", /pendiente de ejecutar|revisado por lectura/i.test(sinEvidencia.texto), sinEvidencia.texto);
comprobar("★ no bloquea: devuelve el texto, no lanza", typeof sinEvidencia.texto === "string" && sinEvidencia.texto.length > 0);

// La misma frase CON evidencia de ejecución → sin aviso (no es un detector de pesimismo).
const conEvidencia = revisarSalida("El archivo funciona.", { ejecutado: true });
comprobar("★ la misma frase con ejecución → sin aviso", conEvidencia.avisos.length === 0);
comprobar("★ y el texto queda intacto", conEvidencia.texto === "El archivo funciona.");

// Texto sin afirmaciones → intacto (ni un carácter cambiado).
const sinAfirmaciones = "Hola, aquí tienes un ejemplo claro y sencillo, sin promesas de más.";
comprobar("★ texto sin afirmaciones → intacto", revisarSalida(sinAfirmaciones, {}).texto === sinAfirmaciones);
comprobar("★ y sin avisos", revisarSalida(sinAfirmaciones, {}).avisos.length === 0);

// Bloques de código con la palabra «funciona» → no se toca.
const bloque = "```js\n// esto funciona\nconst funciona = 1;\n```";
const conBloque = revisarSalida(bloque, {});
comprobar("★ un bloque de código no se revisa", conBloque.avisos.length === 0, JSON.stringify(conBloque.avisos));
comprobar("★ un bloque de código no se reescribe", conBloque.texto === bloque);
const bloqueTilde = "~~~python\n# funciona de verdad\n~~~";
comprobar("★ también respeta las vallas ~~~", revisarSalida(bloqueTilde, {}).texto === bloqueTilde);
const enLinea = "Usa la variable `funciona` aquí.";
comprobar("★ también respeta el código en línea", revisarSalida(enLinea, {}).avisos.length === 0 && revisarSalida(enLinea, {}).texto === enLinea);

// ═══ 4 · LAS 14 PALABRAS SE VIGILAN TODAS ══════════════════════════════════
console.log("\n4) Las palabras que prometen resultado\n");

for (const { palabra } of AFIRMACIONES) {
  const r = revisarSalida(`El módulo está ${palabra}.`, {});
  comprobar(`«${palabra}» sin evidencia → aviso`, r.avisos.some((a) => a.palabra === palabra), JSON.stringify(r.avisos.map((a) => a.palabra)));
}

// ═══ 5 · EL REESCRITO NO DESTROZA SUBSTRINGS ═══════════════════════════════
console.log("\n5) El reescrito no destroza substrings\n");

const largas = revisarSalida("El sistema está funcionando y es funcional.", {});
comprobar("★ «funcionando» y «funcional» se reescriben sin dejar «funciona» roto", !/funciona/i.test(largas.texto), largas.texto);
comprobar("★ no queda ni un fragmento «ndo» colgando", !/pendiente de ejecutar\)ndo|revisado por lectura\)ndo/i.test(largas.texto), largas.texto);

const comprobado = revisarSalida("El resultado está comprobado.", {});
comprobar("★ «comprobado» se reescribe entero (sin dejar «probado» suelto)", !/comprobado|probado/i.test(comprobado.texto), comprobado.texto);

// La alternativa depende del nivel: leído dice una cosa, sin verificar otra.
const leido = revisarSalida("Funciona.", { leido: true });
const sinVerif = revisarSalida("Funciona.", {});
comprobar("★ con lectura la alternativa dice «revisado por lectura»", /revisado por lectura/i.test(leido.texto), leido.texto);
comprobar("★ sin nada dice «pendiente de ejecutar»", /pendiente de ejecutar/i.test(sinVerif.texto), sinVerif.texto);

// ═══ 6 · EL MARCADO VIAJA EN EL TEXTO ══════════════════════════════════════
console.log("\n6) El marcado viaja en el texto\n");

const marca = marcaDeSalida(sinEvidencia);
comprobar("★ la marca lleva el nivel de certeza", /sin verificar/i.test(marca), marca);
comprobar("★ la marca nombra la palabra afirmada", marca.includes("funciona"), marca);
comprobar("★ la marca con explicación avisa de que el modelo no se verifica", marcaDeSalida(sinEvidencia, true).includes("CerebróNico no verifica"), marcaDeSalida(sinEvidencia, true));

// ═══ 7 · ENGANCHADO AL CAMINO DEL CHAT (no es un módulo huérfano) ══════════
console.log("\n7) Enganchado de verdad\n");

const servidor = leer("server.ts");
const contexto = leer("server/streamContext.ts");
comprobar("★ el servidor importa el contexto desde su módulo", servidor.includes('from "./server/streamContext"'));
comprobar("★ el contexto importa el revisor del modelo", contexto.includes("certezaModelo") && contexto.includes("revisarSalida"));
comprobar("★ el contexto revisa ANTES de dar el turno por terminado", /revisarSalida\(this\.acumulado/.test(contexto) && contexto.includes("sendDone"));
comprobar("★ el marcado se emite como texto, no como un evento aparte", /JSON\.stringify\(\{ text: marcaDeSalida/.test(contexto));
comprobar("★ la explicación se dice una vez (regla R2)", /avisoCertezaYaDicho/.test(contexto) && contexto.includes("conExplicacion"));
comprobar("★ server.ts no crece: el contexto salió del monolito", servidor.split("\n").length < 11438, String(servidor.split("\n").length));
comprobar("esta suite entra en npm run validar", leer("scripts/validar.mjs").includes("certezaModelo.test.ts"));

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ CERTEZA EN EL TEXTO DEL MODELO (CN v1.14.0): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  FALLO → " + f);
  process.exit(1);
}
