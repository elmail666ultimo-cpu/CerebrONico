/**
 * espejos.test.ts — ESPEJOS v1: los 10 agentes espejo y sus grupos
 * ================================================================
 * Demuestra de la lista al paralelo real:
 *   · catálogo: los 40 de v2.5 SE CONSERVAN + 10 espejos = 50; 20 activas,
 *     18 dormidas (asertar «conserva», no congelar — lección v2.5)
 *   · regla de hierro: los 10 espejos sin datos responden ok:false CON motivo
 *   · valores REALES por espejo (Bell 50/50, complementaria de azul = amarillo,
 *     2·c exacto, mcd/mcm, lotes paralelos, ciclo rechazado…)
 *   · sinergia del consejo: la salida JSON de un espejo se interroga con
 *     datos.json-ruta
 *   · grupos y selector: normalización con motivo, nota al prompt
 *   · 10 espejos en un plan: paralelo real, plan «hecho»
 */
import { ENTIDADES, entidadPorId, ejecutarEntidad, estadoConsejo, configurarSistema, ACTIVAS_POR_DEFECTO } from "../src/engine/reflejo/consejo";
import * as _os from "node:os";
import { createHash as _ch, randomUUID as _ru } from "node:crypto";
configurarSistema({ totalmem: () => _os.totalmem(), freemem: () => _os.freemem(), cpus: () => _os.cpus(), loadavg: () => _os.loadavg(), sha256: (x) => _ch("sha256").update(x, "utf8").digest("hex"), uuid: () => _ru() });
import { crearEjecutorDePlanes } from "../src/engine/planExecutors";
import { crearPlan, ejecutarPlan } from "../src/engine/taskPlanner";
import {
  IDS_ESPEJOS, GRUPOS_ESPEJOS, IDS_SELECCION, normalizarSeleccion,
  estadoEspejos, fijarSeleccion, notaSeleccionEspejos, espejosDelGrupo, seleccionMotor,
} from "../src/engine/reflejo/espejos";

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(nombre + (detalle ? " :: " + detalle : ""));
}
const E = (id: string, d: any) => ejecutarEntidad(id, d);
const J = (res: any) => { try { return JSON.parse(res.salida); } catch { return null; } }

// ─── 1. Catálogo: conserva los 40 de v2.5 + 10 espejos ═══════════════════
comprobar("51 entidades en total (V8: conserva 50 + generalista)", ENTIDADES.length === 51, String(ENTIDADES.length));
const noEspejo = ENTIDADES.filter((e) => !e.id.startsWith("espejo."));
comprobar("los 40 de v2.5 se conservan intactos", noEspejo.length === 40 && noEspejo.filter((e) => e.tipo === "especialista").length === 12);
const espejos = ENTIDADES.filter((e) => e.id.startsWith("espejo."));
comprobar("11 espejos (V8: +generalista), dominio espejo, tipo herramienta", espejos.length === 11 && espejos.every((e) => e.dominio === "espejo" && e.tipo === "herramienta"));
comprobar("ids únicos en las 51 (V8: +generalista)", new Set(ENTIDADES.map((e) => e.id)).size === 51);
comprobar("los 11 espejos despiertos por defecto (V8: +generalista)", espejos.every((e) => e.activa === true) && [...ACTIVAS_POR_DEFECTO].filter((x) => x.startsWith("espejo.")).length === 11);
comprobar("21 activas / 18 dormidas (V8: +generalista)", estadoConsejo().cuenta.activas === 21 && estadoConsejo().cuenta.dormidas === 18, JSON.stringify(estadoConsejo().cuenta));
comprobar("estadoConsejo cuadra (total 50)", estadoConsejo().total === 51);

// ─── 2. Regla de hierro: sin datos, ok:false CON motivo, nunca silencio ═══
for (const id of IDS_ESPEJOS) {
  const res = E(id, {});
  comprobar(`${id}: vacío responde con motivo`, !res.ok && !!res.motivo && res.entidad === id && typeof res.ms === "number", JSON.stringify(res).slice(0, 90));
}

// ─── 3. Valores reales de cada espejo ════════════════════════════════════
const rCod = E("espejo.codigos", { codigo: "import x from 'y';\nfunction a(){ return 1 }\nconst b = () => 2\nclass C {}\n// TODO revisar\nif (a && b) { for (;;) break }" });
const jCod = J(rCod);
comprobar("codigos: JSON con símbolos reales", !!jCod && jCod.simbolos.funciones === 2 && jCod.simbolos.clases === 1 && jCod.simbolos.imports === 1 && jCod.marcas === 1, rCod.salida);
comprobar("codigos: ciclomatica > 1", !!jCod && jCod.ciclomaticaAprox > 1);

const rEn = E("espejo.lenguajes", { texto: "the of and to in is the of and the they was" });
const rEs = E("espejo.lenguajes", { texto: "de la que el en y a los del se las por un para con" });
comprobar("lenguajes: detecta en y es", J(rEn)?.idioma === "en" && J(rEs)?.idioma === "es", `${rEn.salida} | ${rEs.salida}`);
comprobar("lenguajes: texto sin palabras → motivo", !E("espejo.lenguajes", { texto: "123 456 !!!" }).ok);

const rArt = E("espejo.artes", { base: "#0000ff" });
const jArt = J(rArt);
comprobar("artes: complementaria del azul es amarillo", jArt?.armonias?.complementaria?.[1] === "#ffff00", rArt.salida);
comprobar("artes: tríada tiene 3 y áurea ~61.8", jArt?.armonias?.triada?.length === 3 && Math.abs(jArt?.aurea - 61.8) < 0.1);
comprobar("artes: base inválida con motivo", !E("espejo.artes", { base: "noche" }).ok);

const jDis = J(E("espejo.disenios", { ancho: 1440 }));
comprobar("disenios: 1440 → 6 columnas y escala 8pt", jDis?.grilla?.columnas === 6 && jDis?.espaciado?.includes(8) && jDis?.espaciado?.includes(64), JSON.stringify(jDis));
comprobar("disenios: ancho negativo → motivo", !E("espejo.disenios", { ancho: -5 }).ok);

const ejes = { color: ["a", "b", "c"], forma: ["x", "y"] };
const rCrea1 = E("espejo.creadores", { ejes, n: 4, semilla: "sem" });
const rCrea2 = E("espejo.creadores", { ejes, n: 4, semilla: "sem" });
const jCrea = J(rCrea1);
comprobar("creadores: 4 variantes de un espacio de 6", jCrea?.n === 4 && jCrea?.espacioMuestral === 6);
comprobar("creadores: reproducible (misma semilla, mismo resultado)", rCrea1.salida === rCrea2.salida);
comprobar("creadores: primera variante sistemática es (a,x)", jCrea?.variantes?.[0]?.color === "a" && jCrea?.variantes?.[0]?.forma === "x");
comprobar("creadores: ejes vacíos → motivo", !E("espejo.creadores", { ejes: { a: [] } }).ok);

const rPla = E("espejo.planificadores", { tareas: [
  { id: "a" }, { id: "b", dependeDe: ["a"] }, { id: "c", dependeDe: ["a"] }, { id: "d", dependeDe: ["b", "c"] },
], tramo: "MR2", nucleos: 4 });
const jPla = J(rPla);
comprobar("planificadores: rombo → lotes [1,2,1]", jPla?.lotes?.length === 3 && jPla.lotes[1].length === 2 && jPla.paralelismoMax === 2, rPla.salida);
comprobar("planificadores: presupuesto nunca 0 (MR1=4GB → io 1)", (() => { const p = J(E("espejo.planificadores", { tareas: [{ id: "a" }], tramo: "MR1", nucleos: 2 })); return !!p && p.presupuesto.io === 1 && p.presupuesto.cpu === 1; })());
comprobar("planificadores: la invariante io≥1 cpu≥1 vale en los 4 tramos", ["MR1", "MR2", "MR3", "MR4"].every((tr) => { const p = J(E("espejo.planificadores", { tareas: [{ id: "a" }], tramo: tr, nucleos: 1 })); return !!p && p.presupuesto.io >= 1 && p.presupuesto.cpu >= 1 && p.presupuesto.io <= 16; }));
const rCiclo = E("espejo.planificadores", { tareas: [{ id: "a", dependeDe: ["b"] }, { id: "b", dependeDe: ["a"] }] });
comprobar("planificadores: ciclo rechazado con motivo", !rCiclo.ok && /ciclo/i.test(rCiclo.motivo || ""), rCiclo.motivo);
comprobar("planificadores: dependencia fantasma → motivo", !E("espejo.planificadores", { tareas: [{ id: "a", dependeDe: ["z" as any] }] }).ok);
comprobar("planificadores: tramo inválido → motivo", !E("espejo.planificadores", { tareas: [{ id: "a" }], tramo: "MR9" }).ok);

const rCie2 = J(E("espejo.cientificos", { objetivo: "abono", independiente: ["a", "b"], dependiente: { nombre: "crecimiento" } }));
const rCie3 = J(E("espejo.cientificos", { objetivo: "abono", independiente: ["a", "b", "c"], dependiente: { nombre: "crecimiento" } }));
const rCat = J(E("espejo.cientificos", { objetivo: "vacuna", independiente: ["a", "b"], dependiente: { nombre: "infección", tipo: "categorica" } }));
comprobar("científicos: 2 grupos → t de Student", /2 grupos/.test(rCie2?.pruebaSugerida || ""), JSON.stringify(rCie2));
comprobar("científicos: 3 grupos → ANOVA", /ANOVA/.test(rCie3?.pruebaSugerida || ""));
comprobar("científicos: categórica → chi-cuadrado", /chi-cuadrado/.test(rCat?.pruebaSugerida || ""));
comprobar("científicos: sin objetivo → motivo", !E("espejo.cientificos", { dependiente: { nombre: "x" } }).ok);

const rFis = J(E("espejo.fisicos", { expresion: "2*c", de: "km", a: "m", cantidad: 1.5 }));
comprobar("fisicos: 2·c = 599584916", rFis?.valor === 599584916, JSON.stringify(rFis));
comprobar("fisicos: 1.5 km → 1500 m", rFis?.conversion?.resultado === 1500);
const rFisMal = J(E("espejo.fisicos", { expresion: "1+1", de: "kg", a: "l", cantidad: 3 }));
comprobar("fisicos: conversión imposible se DECLARA en la salida", rFisMal && typeof rFisMal.conversion?.error === "string");
comprobar("fisicos: división por cero → motivo", !E("espejo.fisicos", { expresion: "1/0" }).ok);

const jMate = J(E("espejo.matematicos", { expresion: "raiz(144)+1", enteros: [12, 18, 24] }));
comprobar("matematicos: raiz(144)+1 = 13 y primo", jMate?.valor === 13 && jMate?.esPrimo === true, JSON.stringify(jMate));
comprobar("matematicos: mcd(12,18,24)=6 · mcm=72", jMate?.mcd === 6 && jMate?.mcm === 72, JSON.stringify(jMate));
comprobar("matematicos: precedencias 2+2*3 = 8", J(E("espejo.matematicos", { expresion: "2+2*3" }))?.valor === 8);
comprobar("matematicos: factorización de 360", JSON.stringify(J(E("espejo.matematicos", { expresion: "360" }))?.factorizacion) === "[2,2,2,3,3,5]");
comprobar("matematicos: basura → motivo", !E("espejo.matematicos", { expresion: "2 + +" }).ok);

const rBell = J(E("espejo.cuantico", { qubits: 2, puertas: [{ p: "h", q: 0 }, { p: "cnot", q: 0, t: 1 }] }));
comprobar("cuántico: estado Bell 50/50 con norma 1", rBell?.probabilidades?.["00"] === 0.5 && rBell?.probabilidades?.["11"] === 0.5 && rBell?.probabilidades?.["01"] === 0 && rBell?.norma === 1, JSON.stringify(rBell?.probabilidades));
comprobar("cuántico: X|0> = |1>", (() => { const p = J(E("espejo.cuantico", { qubits: 1, puertas: [{ p: "x", q: 0 }] })).probabilidades; return p["1"] === 1; })());
comprobar("cuántico: H sobre |0> deja 50/50", (() => { const p = J(E("espejo.cuantico", { qubits: 1, puertas: [{ p: "h", q: 0 }] })).probabilidades; return p["0"] === 0.5 && p["1"] === 0.5; })());
comprobar("cuántico: 9 qubits → motivo (techo declarado)", !E("espejo.cuantico", { qubits: 9 }).ok);
comprobar("cuántico: puerta inventada → motivo", !E("espejo.cuantico", { qubits: 1, puertas: [{ p: "warp", q: 0 }] }).ok);
comprobar("cuántico: cnot control=target → motivo", !E("espejo.cuantico", { qubits: 2, puertas: [{ p: "cnot", q: 1, t: 1 }] }).ok);

// ─── 4. Sinergia: la salida JSON de un espejo se interroga con otra entidad ─
const rRuta = E("datos.json-ruta", { json: rArt.salida, ruta: "armonias.triada[1]" });
comprobar("artes→json-ruta: la tríada es interrogable (#ff0000)", rRuta.salida === "#ff0000", JSON.stringify(rRuta));

// ─── 5. Grupos y selector ════════════════════════════════════════════════
comprobar("4 grupos definidos", GRUPOS_ESPEJOS.length === 4);
comprobar("todo espejo agrupado existe en el catálogo", GRUPOS_ESPEJOS.every((g) => g.espejos.every((id) => IDS_ESPEJOS.includes(id as any) && !!entidadPorId(id))));
comprobar("espejosDelGrupo: codigo=4, todos=10, ninguno=0", espejosDelGrupo("codigo").length === 4 && espejosDelGrupo("todos").length === 11 && espejosDelGrupo("ninguno").length === 0);
comprobar("normalizar: grupo inventado → ok:false con motivo", (() => { const ns = normalizarSeleccion({ grupo: "cocina" }); return !ns.ok && /no existe/.test(ns.motivo || ""); })());
comprobar("normalizar: espejo inventado → ok:false", !normalizarSeleccion({ grupo: "manual", espejos: ["espejo.fantasía"] }).ok);
comprobar("normalizar: manual con lista válida → ok", (() => { const ns = normalizarSeleccion({ grupo: "manual", espejos: ["espejo.artes", "espejo.artes"] }); return ns.ok && ns.seleccion.espejos.length === 1; })());
// GRUPO v1 (Reflejo v5): se sumó el modo "auto" → 8 ids.
comprobar("IDS_SELECCION cubre ninguno/todos/manual/auto + grupos", IDS_SELECCION.length === 8 && IDS_SELECCION.includes("auto"));
const estado = estadoEspejos();
comprobar("estadoEspejos: 11 espejos, 4 grupos, ok", estado.ok && estado.total === 11 && estado.grupos.length === 4);
fijarSeleccion({ grupo: "codigo", espejos: espejosDelGrupo("codigo") });
const nota = notaSeleccionEspejos();
comprobar("nota al prompt: menciona el equipo y 4 ids", /EQUIPO ESPEJO ACTIVO/.test(nota) && /espejo\.codigos/.test(nota) && /espejo\.planificadores/.test(nota));
fijarSeleccion({ grupo: "ninguno", espejos: [] });
comprobar("sin selección: nota vacía (no ensucia el prompt)", notaSeleccionEspejos() === "" && seleccionMotor().espejos.length === 0);

// ─── 6. Paralelo real: 11 espejos = 11 tareas reflejo en un plan (V8) ═════
const DATOS_OK: Record<string, any> = {
  // V8 — el generalista recibe un pedido cruzado (código + color + ancho + cálculo)
  // y debe devolver fuentes verificadas, no la proeza de un espejo solo.
  "espejo.generalista": { pedido: "revisa este código function f() { return 1 } y usa el color #123456 en un diseño de ancho 1024px, calculando 2+3" },
  "espejo.codigos": { codigo: "function f() { return 1 }" },
  "espejo.lenguajes": { texto: "the of and to the of" },
  "espejo.artes": { base: "#123456" },
  "espejo.disenios": { ancho: 1024 },
  "espejo.creadores": { ejes: { a: [1, 2] }, n: 2 },
  "espejo.planificadores": { tareas: [{ id: "1" }] },
  "espejo.cientificos": { objetivo: "x", dependiente: { nombre: "y" } },
  "espejo.fisicos": { expresion: "1+1" },
  "espejo.matematicos": { expresion: "6*7" },
  "espejo.cuantico": { qubits: 1, puertas: [] },
};
const plan = crearPlan("once espejos en paralelo (V8: +generalista)", IDS_ESPEJOS.map((id, i) => ({
  id: String(i + 1), titulo: id, tipo: "reflejo", peso: "io" as const, datos: { entidad: id, datos: DATOS_OK[id] },
})));
const ejecutor = crearEjecutorDePlanes({
  pedirModelo: async () => "x", leerArchivo: async () => "y",
  entidad: async (id: string, datos: any) => E(id, datos),
  reflejar: async () => ({ ok: true, accion: "calculo", confianza: 1 }),
});
const t0 = Date.now();
await ejecutarPlan(plan, { ejecutar: ejecutor, medir: () => ({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }) });
comprobar("plan de 11 espejos: HECHO con 11/13 hechas→todas", plan.estado === "hecho" && plan.tareas.every((t) => t.estado === "hecha"), `${plan.estado} ${plan.tareas.filter((t) => t.estado === "hecha").length}/11`);
comprobar("cada tarea espejo ejecutó su entidad", IDS_ESPEJOS.every((id) => plan.tareas.some((t) => String(t.resultado?.resumen || "").includes(`entidad ${id}`))));
comprobar("11 espejos cuestan menos de 2.5 s en total (espejo, no modelo)", Date.now() - t0 < 2500, `${Date.now() - t0} ms`);

// ─── 7. El planificador del chat acepta espejos (catálogo real) ═══════════
import { normalizarPlanDesdeOrden } from "../src/engine/chatOrders";
const planChat = normalizarPlanDesdeOrden({ objetivo: "inventario", tareas: [{ id: "1", titulo: "espejo", tipo: "reflejo", datos: { entidad: "espejo.codigos", datos: { codigo: "x" } } }] });
comprobar("chat: tarea con espejo codigos ACEPTADA", planChat.ok === true, (planChat as any).error);
const planChatMalo = normalizarPlanDesdeOrden({ objetivo: "x", tareas: [{ id: "1", titulo: "a", tipo: "reflejo", datos: { entidad: "espejo.inventado" } }] });
comprobar("chat: espejo inexistente RECHAZADO", !planChatMalo.ok && /no existe/.test(planChatMalo.error || ""));
import { instruccionesParaElModelo } from "../src/engine/chatOrders";
fijarSeleccion({ grupo: "arte", espejos: espejosDelGrupo("arte") });
comprobar("instrucciones del modelo: el equipo activo viaja al prompt", instruccionesParaElModelo().includes("espejo.artes"));
fijarSeleccion({ grupo: "ninguno", espejos: [] });

// ─── Veredicto ═══════════════════════════════════════════════════════════
console.log(`\n═══ ESPEJOS: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
