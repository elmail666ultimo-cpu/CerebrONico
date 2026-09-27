/**
 * consejoVotacion.test.ts — D7 (v1.6.33)
 * =======================================
 * El ROADMAP decía «5 especialistas sin rama en DUEÑO_DE». Verificado: las 16
 * acciones del Reflejo v3.0 (analizar, explicar, testear, buscar…) caían TODAS
 * al `|| "ayuda"`. Esta suite exige tres cosas:
 *   1. COBERTURA: las 22 acciones del clasificador tienen reparto declarado.
 *   2. VOTO REAL: 13 de las 16 genéricas pasan a tener especialista (antes 0),
 *      y el Consejo atribuye de verdad («analizar» → Lingüista, no → Ayuda).
 *   3. HONESTIDAD: las 3 sin especialista (traducir/instalar/desplegar) y los
 *      2 asientos que no votan por frase (telemetría/memorista) están
 *      DECLARADOS con motivo — ni silencio ni voto fingido.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  REPARTO_VOTOS, ACCIONES_REPARTIDAS, dueñoDe, veredictoVoto,
  dueñosConVoto, accionConocida, VOTAN, NO_VOTAN,
} from "../src/engine/votacionConsejo";
import { ACCIONES_GENERICAS_REFLEJO_V3 } from "../src/engine/chatOrders";
import { DUEÑO_DE, ESPECIALISTAS, estadoConsejo, pensarConsejo } from "../src/engine/reflejo/consejo";
import { EJECUTORES_CONSEJO, ejecutorDe, tieneEjecutorReal, accionesSinEjecutor, resumenEjecutores } from "../src/engine/ejecutoresConsejo";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ════════════════════════════════════════════════════════════════════════════
// 1 · COBERTURA COMPLETA DE LAS 22 ACCIONES
// ════════════════════════════════════════════════════════════════════════════
console.log("\n1) Las 22 acciones del clasificador tienen reparto\n");

const ORIGINALES = ["convertir", "abrir", "imagen", "creacion", "calculo", "plan", "nada"];
comprobar("las 7 acciones originales siguen repartidas", ORIGINALES.every((a) => accionConocida(a)));
comprobar("las 16 genéricas de Reflejo v3.0 están repartidas", ACCIONES_GENERICAS_REFLEJO_V3.every((a) => accionConocida(a)),
  ACCIONES_GENERICAS_REFLEJO_V3.filter((a) => !accionConocida(a)).join(","));
comprobar("el reparto total son 23 acciones (7 + 16)", ACCIONES_REPARTIDAS.length === 23, String(ACCIONES_REPARTIDAS.length));
comprobar("ninguna acción quedó fuera del mapa de votos por descuido",
  ACCIONES_REPARTIDAS.every((a) => REPARTO_VOTOS[a].razon.length > 10));

// ════════════════════════════════════════════════════════════════════════════
// 2 · EL VOTO REAL: de 6 a 10 asientos que reciben voz
// ════════════════════════════════════════════════════════════════════════════
console.log("\n2) Los asientos vacíos se llenan (no se finge: se reparte)\n");

const conVoto = dueñosConVoto();
comprobar("antes había 6 dueños reales; ahora son 9 (sin contar Ayuda)", conVoto.length === 9, conVoto.join(","));
for (const esperado of ["linguista", "investigador", "validador"]) {
  comprobar(`«${esperado}» recibe votos por fin (antes nunca)`, conVoto.includes(esperado));
}
comprobar("Lingüista se lleva el análisis de texto", dueñoDe("analizar") === "linguista" && dueñoDe("resumir") === "linguista" && dueñoDe("contar") === "linguista");
comprobar("Validador se lleva el testeo", dueñoDe("testear") === "validador");
comprobar("Investigador se lleva la búsqueda", dueñoDe("buscar") === "investigador");
comprobar("Operario se lleva refactor/optimizar/documentar", dueñoDe("refactorizar") === "codigo" && dueñoDe("optimizar") === "codigo" && dueñoDe("documentar") === "codigo");
comprobar("los dueños originales NO cambian de manos",
  dueñoDe("convertir") === "conversor" && dueñoDe("abrir") === "archivista" && dueñoDe("imagen") === "artista" &&
  dueñoDe("creacion") === "codigo" && dueñoDe("calculo") === "matematico" && dueñoDe("plan") === "conductor");

const vAnalizar = veredictoVoto("analizar");
comprobar("veredicto de «analizar»: voto real del Lingüista", vAnalizar.especialista === "linguista" && vAnalizar.porVoto === true);

// ════════════════════════════════════════════════════════════════════════════
// 3 · HONESTIDAD: lo que no tiene dueño, se declara
// ════════════════════════════════════════════════════════════════════════════
console.log("\n3) Lo que no vota se declara con motivo (nada de silencio)\n");

for (const sinDuenio of ["traducir", "instalar", "desplegar"]) {
  const v = veredictoVoto(sinDuenio);
  comprobar(`«${sinDuenio}» no finge especialista`, v.especialista === "ayuda" && v.porVoto === false);
  comprobar(`«${sinDuenio}» explica por qué`, v.razon.length > 40, v.razon);
}
comprobar("una acción desconocida cae en Ayuda sin reventar", veredictoVoto("inventada").especialista === "ayuda");

const ids12 = ESPECIALISTAS.map((e) => e.id);
comprobar("hay 12 especialistas de verdad", ids12.length === 12, ids12.join(","));
// `ayuda` no compite por un voto: es el PORTAVOZ del silencio — habla justo
// cuando nadie votó. Por eso el conjunto de voces es VOTAN (10: 9 con voto
// real + Ayuda) y el resto queda en NO_VOTAN. Los 12 suman sin sobras.
const voces = new Set([...VOTAN, ...conVoto, ...NO_VOTAN.map((n) => n.id)]);
comprobar("los 12 asientos están contabilizados (votan o están declarados sin voto)",
  ids12.every((id) => voces.has(id)), ids12.filter((id) => !voces.has(id)).join(","));
comprobar("Ayuda es el portavoz: en VOTAN y fuera de los dueños que ganan",
  VOTAN.includes("ayuda") && !conVoto.includes("ayuda"));
comprobar("telemetría declarada no-votante con motivo", NO_VOTAN.some((n) => n.id === "telemetria" && n.porque.length > 40));
comprobar("memorista declarado no-votante con motivo", NO_VOTAN.some((n) => n.id === "memorista" && n.porque.length > 40));
comprobar("nadie es a la vez votante declarado y no-votante", VOTAN.every((v) => !NO_VOTAN.some((n) => n.id === v)));
comprobar("los dueños reales pertenecen al consejo", conVoto.every((c) => ids12.includes(c)), conVoto.join(","));

// ════════════════════════════════════════════════════════════════════════════
// 4 · EL CONSEJO ATRIBUYE DE VERDAD (compatibilidad y runtime)
// ════════════════════════════════════════════════════════════════════════════
console.log("\n4) DUEÑO_DE y estadoConsejo dicen la verdad\n");

comprobar("las 7 llaves históricas siguen intactas (agentico.test no se rompe)", ORIGINALES.every((a) => !!DUEÑO_DE[a]));
comprobar("DUEÑO_DE aprende las genéricas en runtime", DUEÑO_DE["analizar"] === "linguista" && DUEÑO_DE["testear"] === "validador" && DUEÑO_DE["buscar"] === "investigador");

const estado = estadoConsejo();
comprobar("el estado expone el reparto (votantes y no votantes)", !!estado.reparto && Array.isArray(estado.reparto.sin_voto));
comprobar("el estado declara las acciones sin especialista", JSON.stringify(estado.reparto.sin_especialista) === JSON.stringify(["traducir", "instalar", "desplegar"]));
comprobar("el estado marca por especialista si vota por frase",
  estado.especialistas.find((e: any) => e.id === "linguista")?.vota_por_frase === true &&
  estado.especialistas.find((e: any) => e.id === "telemetria")?.vota_por_frase === false);
comprobar("la nota ya no promete «12 votantes» a secas", !/12 votantes/.test(estado.nota) && /no-votantes/.test(estado.nota));

const src = leer("src/engine/reflejo/consejo.ts");
comprobar("pensarConsejo atribuye por el reparto único", src.includes("veredictoVoto(clave)") && src.includes("DUEÑO_DE[clave] || v.especialista"));
comprobar("el consejo ya no importa su reparto de la nada: lo consume", /from "\.\.\/votacionConsejo"/.test(src));
comprobar("la cabecera del módulo corrige la vieja promesa", /10 asientos reciben votos/.test(src));

// ════════════════════════════════════════════════════════════════════════════
// 5 · PUNTA A PUNTA con una frase real (calculadora: camino determinista)
// ════════════════════════════════════════════════════════════════════════════
console.log("\n5) Atribución punta a punta con el motor real\n");

import { TABLAS } from "../src/engine/reflejo/index";
const rc = pensarConsejo("cuanto es 2+2", TABLAS.lite);
comprobar("un cálculo real se atribuye al Matemático", rc.accion === "calculo" && rc.entidad === "matematico", `${rc.accion}/${rc.entidad}`);
comprobar("el voto viaja con su motivo", !!rc.voto && rc.voto.razon.length > 5);

const validar = leer("scripts/validar.mjs");
comprobar("la suite entra en npm run validar", validar.includes("consejoVotacion.test.ts"));

// ════════════════════════════════════════════════════════════════════════════
// 7 · DEL VOTO AL TRABAJO (v1.7.1 · Fase 4)
// ════════════════════════════════════════════════════════════════════════════
// El Consejo atribuye votos desde la v1.6.33, pero votar no es hacer. Este
// bloque EXIGE que las 23 acciones tengan ficha, que las 21 sin ejecutor digan
// POR QUÉ, y que las 2 con ejecutor apunten a una función que exista de verdad
// en el fichero que dicen. Sin esto, «el Consejo hace cosas» es una frase.
console.log("\n7) Cada acción: o ejecutor comprobable, o declaración con motivo\n");

const acciones = Object.keys(EJECUTORES_CONSEJO);
comprobar("hay ficha para las 23 acciones", acciones.length === 23, String(acciones.length));
comprobar("el registro cubre exactamente las acciones repartidas",
  acciones.length === ACCIONES_REPARTIDAS.length &&
  ACCIONES_REPARTIDAS.every((a) => !!EJECUTORES_CONSEJO[a]));

comprobar("toda ficha tiene un estado válido",
  acciones.every((a) => EJECUTORES_CONSEJO[a as keyof typeof EJECUTORES_CONSEJO].estado === "real" ||
                       EJECUTORES_CONSEJO[a as keyof typeof EJECUTORES_CONSEJO].estado === "declarada"));

comprobar("★ ninguna declaración es un hueco mudo (todas explican el porqué)",
  accionesSinEjecutor().every((a) => EJECUTORES_CONSEJO[a].motivo.trim().length > 40),
  accionesSinEjecutor().filter((a) => EJECUTORES_CONSEJO[a].motivo.trim().length <= 40).join(","));

comprobar("★ ninguna declaración promete un ejecutor que no tiene",
  accionesSinEjecutor().every((a) => EJECUTORES_CONSEJO[a].estado === "declarada" && !tieneEjecutorReal(a)));

const reales = acciones.filter((a) => tieneEjecutorReal(a as never));
comprobar("★ las acciones con ejecutor son al menos las 2 ya probadas", reales.length >= 2, String(reales.length));

let apuntanBien = 0;
for (const a of reales) {
  const f = ejecutorDe(a);
  if (!f?.modulo || !f?.llamada) continue;
  // La comprobación que hace que esto no sea decoración: el módulo existe y la
  // función que se declara está DENTRO de él.
  try {
    const fuente = leer(f.modulo);
    if (fuente.includes(f.llamada.split("(")[0] + "(")) apuntanBien++;
  } catch {
    /* módulo inexistente: no cuenta y el fallo se ve abajo */
  }
}
comprobar("★ cada ejecutor real apunta a una función que existe donde dice", apuntanBien === reales.length,
  `${apuntanBien}/${reales.length} verificados`);

comprobar("la ficha no contradice al reparto de votos (una sola verdad)",
  acciones.every((a) => EJECUTORES_CONSEJO[a as keyof typeof EJECUTORES_CONSEJO].especialista ===
                        REPARTO_VOTOS[a as keyof typeof REPARTO_VOTOS].especialista));

const resumen = resumenEjecutores();
comprobar("el resumen cuadra (reales + declaradas = total)", resumen.reales + resumen.declaradas === resumen.total);
console.log(`   → estado real del Consejo: ${resumen.reales} acción(es) con ejecutor · ${resumen.declaradas} declaradas de ${resumen.total}.`);
console.log(`     (Ese es el trabajo que queda en la Fase 4. Ninguna de las ${resumen.declaradas} se finge: todas dicen qué las ejecutaría.)`);

console.log(`\n═══ D7 CONSEJO QUE VOTA (v1.6.33): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
