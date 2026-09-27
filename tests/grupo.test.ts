/**
 * grupo.test.ts — GRUPO v1: trabajar en grupo según la tarea, autónomo
 * ====================================================================
 * Demuestra de la lista las cuatro piezas del trabajo en grupo:
 *   · modo "auto" en el selector: el catálogo completo, el equipo por tarea
 *   · grupoPorTarea: el equipo se elige por señales del contenido; sin
 *     señales claras o con empate, NO lanza monedas (null)
 *   · crearPlan: una tarea reflejo es CPU (antes caía en el carril de IO y
 *     desplazaba a las que sí esperan); el peso declarado manda
 *   · despacho CPU-primero: los espejos liberan dependencias en milisegundos
 *   · tarea reflejo sin entidad: el orquestador enruta por ley; con dudas el
 *     fallo es declarativo, nunca una adivinanza silenciosa
 */
import { IDS_SELECCION, espejosDelGrupo, grupoPorTarea, fijarSeleccion, notaSeleccionEspejos } from "../src/engine/reflejo/espejos";
import { crearPlan, ejecutarPlan, pesoPorDefecto } from "../src/engine/taskPlanner";
import { crearEjecutorDePlanes } from "../src/engine/planExecutors";

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(nombre + (detalle ? " :: " + detalle : ""));
}

// ─── 1. El selector conoce "auto" ════════════════════════════════════════
comprobar("auto es un modo de selección válido", IDS_SELECCION.includes("auto"));
comprobar("auto abre el catálogo completo (11 espejos)", espejosDelGrupo("auto").length === 11);

// ─── 2. El equipo por tarea ══════════════════════════════════════════════
comprobar("tarea de código → equipo código", grupoPorTarea("Refactoriza la función y depura el bug de TypeScript")?.grupo === "codigo");
comprobar("tarea de diseño → equipo arte", grupoPorTarea("Diseña la paleta de colores y el logo de la marca")?.grupo === "arte");
comprobar("tarea científica → equipo ciencia", grupoPorTarea("Calcula la media y la desviación de la muestra del experimento")?.grupo === "ciencia");
comprobar("tarea cuántica → equipo cuantica", grupoPorTarea("aplica una puerta de Hadamard a 2 qubits en superposición")?.grupo === "cuantica");
comprobar("sin señales → null (el auto no inventa equipos)", grupoPorTarea("organiza la reunión del jueves") === null);
comprobar("frase vacía → null", grupoPorTarea("") === null);
comprobar("la elección trae señales auditables", (grupoPorTarea("depura el bug")?.senales.length ?? 0) >= 1);
comprobar("acentos no rompen las señales", grupoPorTarea("DISEÑA EL LOGO")?.grupo === "arte");

// ─── 3. La nota del modo auto viaja al prompt ════════════════════════════
fijarSeleccion({ grupo: "auto", espejos: espejosDelGrupo("auto") });
comprobar("la nota del auto enseña la regla por tarea", /EQUIPO AUTO/.test(notaSeleccionEspejos()));
fijarSeleccion({ grupo: "ninguno", espejos: [] });
comprobar("ninguno borra la nota", notaSeleccionEspejos() === "");

// ─── 4. El peso por tipo: un espejo en cola de IO es un plan mintiéndose ═
comprobar("reflejo → cpu", pesoPorDefecto("reflejo") === "cpu");
comprobar("modelo → io", pesoPorDefecto("modelo") === "io");
const plan = crearPlan("prueba grupo", [
  { id: "1", titulo: "lento (modelo)", tipo: "modelo" },
  { id: "2", titulo: "espejo", tipo: "reflejo" },
  { id: "3", titulo: "declarado io a mano", tipo: "reflejo", peso: "io" },
]);
comprobar("crearPlan asigna el carril por tipo", plan.tareas[0].peso === "io" && plan.tareas[1].peso === "cpu");
comprobar("el peso declarado manda sobre el tipo", plan.tareas[2].peso === "io");

// ─── 5. Despacho CPU-primero en la misma vuelta ══════════════════════════
const orden: string[] = [];
const ejecutor = async (t: any) => {
  orden.push(t.id);
  if (t.peso === "io") await new Promise((r) => setTimeout(r, 40));
  return { resumen: "ok" };
};
const plan2 = crearPlan("orden", [
  { id: "1", titulo: "io lento", tipo: "modelo" },
  { id: "2", titulo: "cpu espejo", tipo: "reflejo" },
]);
await ejecutarPlan(plan2, { ejecutar: ejecutor, medir: () => ({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }) });
comprobar("las dos se hacen", plan2.estado === "hecho" && plan2.tareas.every((t) => t.estado === "hecha"));
comprobar("el espejo se lanza ANTES que el io de su vuelta", orden[0] === "2", orden.join(","));

// ─── 6. Tarea reflejo autónoma: la ley enruta sin votante neural ═════════
const ejec = crearEjecutorDePlanes({
  entidad: async (id: string, d: any) => ({ ok: true, id, ms: 1, salida: JSON.stringify(d) }),
  orquestar: async () => ({ ok: true, espejo: "espejo.matematicos", datos: { expresion: "5+5" }, ley: "mat-expr", modo: "espejo-local", confianza: 0.85 }),
} as any);
const tRefleja: any = { id: "1", titulo: "refleja", tipo: "reflejo", peso: "cpu", dependeDe: [], estado: "pendiente", intentos: 0, datos: { frase: "calcula 5+5" } };
const rj = await ejec(tRefleja, new AbortController().signal);
comprobar("sin entidad: la ley enruta y el espejo contesta", /orquestado · ley mat-expr · espejo\.matematicos · confianza 85%/.test(rj.resumen), rj.resumen);

const ejecDuda = crearEjecutorDePlanes({
  entidad: async () => ({ ok: true, id: "x", ms: 1, salida: "" }),
  orquestar: async () => ({ ok: false, motivo: "empate dudoso entre dos espejos" }),
} as any);
let lanzo = "";
try { await ejecDuda(tRefleja, new AbortController().signal); } catch (e: any) { lanzo = String(e?.message || e); }
comprobar("con dudas no adivina: el fallo es declarativo", /no enrutó/.test(lanzo) && /empate/.test(lanzo), lanzo);

// con reflejar presente, el camino viejo sigue intacto (no secuestra)
const ejecVoto = crearEjecutorDePlanes({
  entidad: async () => ({ ok: true, id: "x", ms: 1, salida: "" }),
  reflejar: async () => ({ ok: true, accion: "votar", entidad: "matematico", confianza: 0.8, salida: "voto" }),
  orquestar: async () => ({ ok: true, espejo: "espejo.matematicos", datos: {}, ley: "x", modo: "espejo-local" }),
} as any);
const rv = await ejecVoto(tRefleja, new AbortController().signal);
comprobar("si el votante neural está, manda (compatibilidad)", /reflejo · matematico/.test(rv.resumen), rv.resumen);

console.log(`\nGRUPO v1 · ${correctas} correctas, ${fallos.length} en rojo`);
if (fallos.length) { for (const f of fallos) console.log("  ✗ " + f); process.exit(1); }
