/**
 * reflejo5.test.ts — REFLEJO v5: salud de la flota, confianza del enrutado
 * ========================================================================
 * Demuestra de la lista los tres arreglos del sistema de espejos:
 *   · SALUD v1 (manual §6.3): score Laplace, estrella/dormido, dormir no es
 *     matar — la ruta explícita por familia sigue alcanzando al dormido
 *   · CONFIANZA: leyes específicas puntúan alto; dos espejos casi empatados
 *     producen DUDA declarada, no una moneda
 *   · LEYES APRENDIDAS vivas tras el reinicio: plantilla serializable,
 *     fs inyectado (el require ESM que las mataba se fue), fallback con
 *     diagnóstico para leyes viejas con datos-función
 */
import {
  planificadorPorLeyes, orquestarPorFamilia, cargarLeyesAprendidas, guardarLeyesAprendidas,
  leyAprendida, diagnosticoLeyes, fijarTablaSalud, LEYES_REFLEJO, UMBRAL_CONFIANZA, type LeyReflejo,
} from "../src/engine/reflejo/orquestador";
import { registrarEjecucion, scoreDe, estadoDe, elegibleAuto, parsearTabla, serializarTabla } from "../src/engine/reflejo/salud";

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(nombre + (detalle ? " :: " + detalle : ""));
}

// ─── 1. SALUD v1: la mesa de puntuación ══════════════════════════════════
comprobar("sin historial vale 0.5 y está nuevo", scoreDe(undefined) === 0.5 && estadoDe(undefined) === "nuevo");
let tabla = registrarEjecucion({}, "espejo.matematicos", true);
tabla = registrarEjecucion(tabla, "espejo.matematicos", true);
comprobar("dos éxitos suben el score por encima del neutro", scoreDe(tabla["espejo.matematicos"]) > 0.5 && estadoDe(tabla["espejo.matematicos"]) === "activo");
const mala = { usos: 10, exitos: 1, corregido: 0, ultima: "" };
comprobar("10 usos con 1 éxito → dormido", estadoDe(mala) === "dormido" && !elegibleAuto({ x: mala }, "x"));
const buena = { usos: 20, exitos: 20, corregido: 0, ultima: "" };
comprobar("20/20 → estrella (score ≥ 0.95)", estadoDe(buena) === "estrella");
const pocos = { usos: 3, exitos: 0, corregido: 0, ultima: "" };
comprobar("pocos usos no duermen a nadie (evidencia mínima)", estadoDe(pocos) === "activo");
const corregida = { usos: 10, exitos: 9, corregido: 8, ultima: "" };
comprobar("éxitos corregidos restan", scoreDe(corregida) < scoreDe({ usos: 10, exitos: 9, corregido: 0, ultima: "" }));
const ida = parsearTabla(JSON.parse(serializarTabla({ a: buena })));
comprobar("serializar→parsear conserva", ida.tabla.a?.usos === 20 && ida.avisos.length === 0);
comprobar("parsear basura no lanza y avisa", parsearTabla({ espejos: "no" }).avisos.length === 1);

// ─── 2. CONFIANZA: leyes curadas puntúan ═════════════════════════════════
const r1 = planificadorPorLeyes("convierte 5 km a m");
comprobar("conversión enrutada con confianza alta", r1.ok && r1.espejo === "espejo.fisicos" && (r1.confianza ?? 0) >= 0.85, JSON.stringify(r1).slice(0, 160));
comprobar("el resultado lleva alternativas auditables", Array.isArray(r1.alternativas));

// ─── 3. LEYES APRENDIDAS: el reinicio ya no las mata ═════════════════════
const disco = new Map<string, string>();
const fsFalso = {
  existsSync: (r: string) => disco.has(r),
  readFileSync: (r: string) => { const v = disco.get(r); if (v === undefined) throw new Error("ENOENT " + r); return v; },
  mkdirSync: () => {},
  writeFileSync: (r: string, k: string) => { disco.set(r, k); },
};
const rutaLeyes = "/x/leyes-aprendidas.json";
const leyPlantilla: LeyReflejo = {
  id: "aprendida.doblante",
  familia: "autoaprendible",
  prioridad: 101,
  patron: /duplica (\d+)/i,
  datos: (m) => ({ cantidad: Number(m[1]) }),
  plantilla: { cantidad: "$1" },
  espejo: "espejo.matematicos",
  descripcion: "duplica N (prueba)",
};
comprobar("guardar ley aprendida (fs inyectado)", guardarLeyesAprendidas(rutaLeyes, [leyPlantilla], fsFalso) === true);
comprobar("en disco no hay funciones", !String(disco.get(rutaLeyes)).includes("function") && String(disco.get(rutaLeyes)).includes("plantilla"));
cargarLeyesAprendidas(rutaLeyes, fsFalso);
comprobar("la ley sobrevive el reinicio", leyAprendida() === 1);
const r2 = planificadorPorLeyes("duplica 7");
comprobar("y sus datos se reconstruyen desde plantilla", r2.ok && r2.ley === "aprendida.doblante" && (r2.datos as any)?.cantidad === 7, JSON.stringify(r2.datos));

// ley vieja con datos-función serializada (el formato roto de v1.0.3)
disco.set("/x/viejas.json", JSON.stringify({ leyes: [{ id: "aprendida.vieja", familia: "autoaprendible", prioridadOffset: 1, patron: "triplica (\\d+)", flags: "i", espejo: "espejo.matematicos", descripcion: "prueba vieja", datos: "function (m) { return { n: m[1] }; }" }] }));
cargarLeyesAprendidas("/x/viejas.json", fsFalso);
const r3 = planificadorPorLeyes("triplica 9");
comprobar("ley vieja renace con prompt-crudo en vez de morir", r3.ok && typeof (r3.datos as any)?.prompt === "string" && (r3.datos as any).prompt.includes("triplica"));
comprobar("y el diagnóstico lo declara", diagnosticoLeyes().some((d) => /función serializada/.test(d)));
cargarLeyesAprendidas("/x/inexistente.json", fsFalso);
comprobar("ruta inexistente limpia las aprendidas", leyAprendida() === 0);

// ─── 4. CONFIANZA: duda declarada, no moneda ═════════════════════════════
const gemelas: LeyReflejo[] = [
  { id: "aprendida.zorba", familia: "autoaprendible", prioridad: 101, patron: /zorvax/i, datos: () => ({}), espejo: "espejo.matematicos", descripcion: "a", confianza: 0.7 },
  { id: "aprendida.zorb", familia: "autoaprendible", prioridad: 102, patron: /zorvax/i, datos: () => ({}), espejo: "espejo.codigos", descripcion: "b", confianza: 0.7 },
];
disco.set("/x/gemelas.json", JSON.stringify({ leyes: [{ id: "aprendida.zorba", familia: "autoaprendible", prioridadOffset: 1, patron: "zorvax", flags: "i", espejo: "espejo.matematicos", descripcion: "a", confianza: 0.7 }, { id: "aprendida.zorb", familia: "autoaprendible", prioridadOffset: 2, patron: "zorvax", flags: "i", espejo: "espejo.codigos", descripcion: "b", confianza: 0.7 }] }));
cargarLeyesAprendidas("/x/gemelas.json", fsFalso);
const r4 = planificadorPorLeyes("zorvax por favor");
comprobar("dos espejos empatados → DUDA, no adivinación", !r4.ok && /empate/.test(r4.motivo || "") && Array.isArray(r4.alternativas) && r4.alternativas!.length >= 2, JSON.stringify(r4).slice(0, 180));
comprobar("la duda sugiere la ruta explícita de familia", /orquestar\/<familia>|explícito/i.test(r4.motivo || ""));
const r5 = orquestarPorFamilia("autoaprendible", "zorvax por favor");
comprobar("la ruta explícita SÍ decide (el usuario manda)", r5.ok);
// confianza baja: ni siquiera llega a empate
disco.set("/x/debil.json", JSON.stringify({ leyes: [{ id: "aprendida.debil", familia: "autoaprendible", prioridadOffset: 1, patron: "quijada", flags: "i", espejo: "espejo.matematicos", descripcion: "débil", confianza: 0.4 }] }));
cargarLeyesAprendidas("/x/debil.json", fsFalso);
const r6 = planificadorPorLeyes("quijada x");
comprobar("bajo umbral → confiesa dudas", !r6.ok && /dudas/.test(r6.motivo || "") && (r6.confianza ?? 1) < UMBRAL_CONFIANZA);
cargarLeyesAprendidas("/x/inexistente.json", fsFalso);

// ─── 5. DORMIDO: fuera del auto, alcanzable por familia ══════════════════
const matLey = LEYES_REFLEJO.find((l) => l.espejo === "espejo.matematicos")!;
const tablaDormida = { "espejo.matematicos": { usos: 10, exitos: 0, corregido: 0, ultima: "" } };
fijarTablaSalud(tablaDormida);
const fraseMat = "convierte 5 km a m"; // no toca mate: sigue enrutando
comprobar("un espejo dormido no tumbará a los demás", planificadorPorLeyes(fraseMat).ok);
const r7 = planificadorPorLeyes("calcula la raíz cuadrada de 144");
comprobar("la ley del dormido se salta en el auto", !r7.ok && /dormido/.test(r7.motivo || ""));
const r8 = orquestarPorFamilia(matLey.familia, "calcula la raíz cuadrada de 144");
comprobar("la familia explícita despierta al dormido (dormir no es matar)", r8.ok && r8.espejo === "espejo.matematicos");
fijarTablaSalud(undefined);
comprobar("sin tabla de salud, todo vuelve a la normalidad", planificadorPorLeyes("calcula la raíz cuadrada de 144").ok);

console.log(`\nREFLEJO v5 · ${correctas} correctas, ${fallos.length} en rojo`);
if (fallos.length) { for (const f of fallos) console.log("  ✗ " + f); process.exit(1); }
