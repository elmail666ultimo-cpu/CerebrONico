/**
 * agentico.test.ts — CEREBRONICO-AGENTICO v1 (v2.5)
 * ==================================================
 * Demuestra del catálogo a la ejecución:
 *   · 40 entidades (12 especialistas + 28 herramientas), ids únicos,
 *     10 herramientas activas por defecto y 18 dormidas CON motivo al tocarlas
 *   · las herramientas responden con valores REALES (hash conocido, unidades,
 *     contraste WCAG, rutas que escapan rechazadas)
 *   · el tipo de tarea `reflejo` ejecuta en el planificador con primitivas
 *     inyectadas y falla FATAL (sin reintento) cuando el motivo es estructural
 *   · el chat valida `reflejo` contra el catálogo REAL (no contra un string)
 *   · 12 tareas reflejo en paralelo terminan todas (el gobernador MR no las frena)
 */
import { ENTIDADES, entidadPorId, ejecutarEntidad, cambiarActivacion, estadoConsejo, pensarConsejo, DUEÑO_DE, ACTIVAS_POR_DEFECTO, configurarSistema } from "../src/engine/reflejo/consejo";
import * as _os from "node:os";
import { createHash as _ch, randomUUID as _ru } from "node:crypto";
configurarSistema({ totalmem: () => _os.totalmem(), freemem: () => _os.freemem(), cpus: () => _os.cpus(), loadavg: () => _os.loadavg(), sha256: (x) => _ch("sha256").update(x, "utf8").digest("hex"), uuid: () => _ru() });
import { TABLAS } from "../src/engine/reflejo";
import { crearEjecutorDePlanes, TIPOS_SOPORTADOS } from "../src/engine/planExecutors";
import { crearPlan, ejecutarPlan } from "../src/engine/taskPlanner";
import { normalizarPlanDesdeOrden, instruccionesParaElModelo } from "../src/engine/chatOrders";

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(nombre + (detalle ? " :: " + detalle : ""));
}

// ─── 1. Catálogo: 40, únicos, 12+28, 10 despiertas ───────────────────────────
// ESPEJOS v1: la cuenta creció a 50. Se aserta CONSERVAR los 40 de v2.5
// y luego el delta — congelar la cifra total convertiría cada crecimiento
// legítimo en falsa alarma (lección documentada en v2.5).
comprobar("51 entidades (V8: conserva 50 + generalista)", ENTIDADES.length === 51, String(ENTIDADES.length));
comprobar("conserva los 40 de v2.5", ENTIDADES.filter((e) => !e.id.startsWith("espejo.")).length === 40);
const esp = ENTIDADES.filter((e) => e.tipo === "especialista");
const herr = ENTIDADES.filter((e) => e.tipo === "herramienta");
comprobar("12 especialistas + 39 herramientas (11 espejos, V8: +generalista)", esp.length === 12 && herr.length === 39 && herr.filter((h) => h.id.startsWith("espejo.")).length === 11, `${esp.length}/${herr.length}`);
comprobar("ids únicos", new Set(ENTIDADES.map((e) => e.id)).size === 51);
comprobar("especialistas siempre activos", esp.every((e) => e.activa === true));
comprobar("21 herramientas activas por defecto (10 de v2.5 + 11 espejos)", herr.filter((h) => h.activa).length === 21, JSON.stringify([...ACTIVAS_POR_DEFECTO].filter((x) => !String(x).startsWith("espejo."))));
comprobar("18 dormidas esperan su botón", herr.filter((h) => !h.activa).length === 18);
comprobar("estadoConsejo cuadra con el registro", (() => { const s = estadoConsejo(); return s.total === 51 && s.cuenta.activas === 21 && s.cuenta.dormidas === 18; })());

// ─── 2. El botón: especialistas NO se duermen; dormida responde POR QUÉ ──────
const tNoDormir = cambiarActivacion("matematico", false);
comprobar("un especialista no se duerme con toggle", !tNoDormir.ok && /especialista/.test(tNoDormir.motivo || ""), tNoDormir.motivo);
const dormida = ejecutarEntidad("texto.dedup", { texto: "a\na" });
comprobar("herramienta dormida: ok:false + cómo despertarla", !dormida.ok && /DORMIDA/.test(dormida.motivo || "") && /activa:true/.test(dormida.motivo || ""), dormida.motivo);
comprobar("toggle on funciona", cambiarActivacion("texto.dedup", true).ok === true && ejecutarEntidad("texto.dedup", { texto: "a\na\nb" }).ok === true);
cambiarActivacion("texto.dedup", false); // vuelve a su estado por defecto (dormida)
const rInex = ejecutarEntidad("no.existe", {});
comprobar("entidad inexistente: ok:false + motivo con catálogo", !rInex.ok && !!rInex.motivo?.includes("/api/consejo/estado"), JSON.stringify(rInex));

// ─── 3. Valores REALES de las herramientas ───────────────────────────────────
// Varias de las probadas aquí son de las 18 DORMIDAS por defecto: la prueba
// las despierta primero (eso ES el botón) y al final se restaura el estado
// por defecto para no contaminar el resto de la suite.
const E = (id: string, d: any) => ejecutarEntidad(id, d);
for (const idDespertar of ["texto.slug", "datos.base64", "datos.uuid", "vis.contraste", "datos.csv-fila"]) cambiarActivacion(idDespertar, true);
comprobar("texto.contar cuenta de verdad", E("texto.contar", { texto: "dos palabras más" }).salida?.startsWith("3 palabras"));
comprobar("texto.contar vacío declara motivo", !E("texto.contar", { texto: "  " }).ok);
comprobar("slug limpia acentos y espacios", E("texto.slug", { texto: "El Niño del Mar!" }).salida === "el-nino-del-mar");
comprobar("datos.hash sha256 de 'abc' es el valor público", E("datos.hash", { texto: "abc" }).salida === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
comprobar("base64 ida y vuelta", E("datos.base64", { texto: E("datos.base64", { texto: "cerebro", modo: "cod" }).salida, modo: "dec" }).salida === "cerebro");
comprobar("json-ruta baja a [0] y explica la ruptura", E("datos.json-ruta", { json: '{"a":[7]}', ruta: "a[0]" }).salida === "7" && !E("datos.json-ruta", { json: "{}", ruta: "a.b" }).ok);
const rFila = E("datos.csv-fila", { csv: "x\n1", n: 5 });
comprobar("csv-fila fuera de rango dice cuántas hay", !rFila.ok && !!rFila.motivo?.includes("tiene 1"), JSON.stringify(rFila));
comprobar("unidades km→m = 1500", E("mate.unidades", { valor: 1.5, de: "km", a: "m" }).salida === "1500");
comprobar("unidades imposibles: motivo con familias", !E("mate.unidades", { valor: 1, de: "kg", a: "l" }).ok && /familias/.test(E("mate.unidades", { valor: 1, de: "kg", a: "l" }).motivo || ""));
comprobar("promedio real", E("mate.promedio", { numeros: [2, 4, 6] }).salida === "4");
comprobar("contraste blanco/negro = 21:1 y AA SÍ", E("vis.contraste", { a: "#000000", b: "#ffffff" }).salida?.includes("21.00:1"));
comprobar("paleta azul → #3498db", E("vis.paleta", { nombre: "azul" }).salida === "#3498db");
comprobar("ram informa GB", /GB/.test(E("maq.ram", {}).salida || ""));
comprobar("tramo MR informa peldaño", /MR[1-4]/.test(E("maq.tramo", {}).salida || ""));
comprobar("rutas que escapan: rechazadas", !E("proyecto.rutas-sanas", { rutas: ["img/a.jpg", "../etc/passwd"] }).ok);
comprobar("uuid con forma canónica", /^[0-9a-f]{8}-[0-9a-f]{4}/.test(E("datos.uuid", {}).salida || ""));
for (const idDormir of ["texto.slug", "datos.base64", "datos.uuid", "vis.contraste", "datos.csv-fila"]) cambiarActivacion(idDormir, false); // vuelve a los 10 por defecto

// ─── 4. El consejo ATRIBUYE cada resultado a su especialista ─────────────────
const tMax = TABLAS.max;
comprobar("conversión → conversor", pensarConsejo("convierte package.json a yaml", tMax).entidad === "conversor");
comprobar("cálculo → matematico", pensarConsejo("cuanto es 2+2*3", tMax).entidad === "matematico");
comprobar("imagen → artista", pensarConsejo("dibuja un logo de cerebro", tMax).entidad === "artista");
const sinVoz = pensarConsejo("qwerty asdf zxcv", tMax);
comprobar("nadie vota → ayuda, con motivo", sinVoz.entidad === "ayuda" && !sinVoz.ok && !!sinVoz.motivo);
comprobar("DUEÑO_DE cubre todas las acciones", ["convertir", "abrir", "imagen", "creacion", "calculo", "plan", "nada"].every((a) => !!DUEÑO_DE[a]));

// ─── 5. El tipo de tarea `reflejo` en el motor ───────────────────────────────
comprobar("TIPOS_SOPORTADOS tiene reflejo (5)", TIPOS_SOPORTADOS.length === 5 && TIPOS_SOPORTADOS.includes("reflejo" as any));
const ejecutor = crearEjecutorDePlanes({
  pedirModelo: async () => "x",
  leerArchivo: async () => "y",
  entidad: async (id, datos) => ejecutarEntidad(id, datos),
  reflejar: async (frase) => pensarConsejo(frase, tMax),
});
const tareaEntidad: any = { id: "1", titulo: "ram", tipo: "reflejo", peso: "io", dependeDe: [], estado: "pendiente", intentos: 0, datos: { entidad: "maq.ram" } };
const rEnt = await ejecutor(tareaEntidad, new AbortController().signal);
comprobar("tarea reflejo/entidad ejecuta y dice ms", /entidad maq\.ram/.test(rEnt.resumen) && /GB/.test(rEnt.resumen), rEnt.resumen);
const tareaFrase: any = { ...tareaEntidad, id: "2", datos: { entidad: "matematico", frase: "cuanto es 3*3" } };
const rFr = await ejecutor(tareaFrase, new AbortController().signal);
comprobar("tarea reflejo/frase usa a los especialistas", /reflejo/.test(rFr.resumen) && rFr.resumen.includes("9"), rFr.resumen);
let fatalSinEntidad = false;
try { await ejecutor({ ...tareaEntidad, datos: {} } as any, new AbortController().signal); } catch (e: any) { fatalSinEntidad = e?.fatal === true; }
comprobar("sin datos.entidad: FATAL (no quema reintentos)", fatalSinEntidad);
let fatalDormida = false;
try { await ejecutor({ ...tareaEntidad, datos: { entidad: "texto.dedup" } } as any, new AbortController().signal); } catch (e: any) { fatalDormida = e?.fatal === true && /DORMIDA/.test(e.message); }
comprobar("entidad dormida: FATAL con el aviso del botón", fatalDormida);

// ─── 6. El chat valida contra el catálogo REAL ───────────────────────────────
const sinEntidad = normalizarPlanDesdeOrden({ objetivo: "x", tareas: [{ id: "1", titulo: "a", tipo: "reflejo", datos: {} }] });
comprobar("plan con reflejo sin entidad: rechazado", !sinEntidad.ok && /datos\.entidad/.test(sinEntidad.error || ""), sinEntidad.error);
const inventada = normalizarPlanDesdeOrden({ objetivo: "x", tareas: [{ id: "1", titulo: "a", tipo: "reflejo", datos: { entidad: "dr.sueño" } }] });
comprobar("entidad inexistente: rechazada con el catálogo", !inventada.ok && /no existe/.test(inventada.error || ""));
const buena = normalizarPlanDesdeOrden({ objetivo: "x", tareas: [{ id: "1", titulo: "a", tipo: "reflejo", datos: { entidad: "maq.tramo" } }] });
comprobar("entidad real: aceptada", buena.ok === true, (buena as any).error);
comprobar("las instrucciones enseñan el 5º tipo", instruccionesParaElModelo().includes("reflejo") && instruccionesParaElModelo().includes("CINCO"));

// ─── 7. El gobernador: 12 tareas reflejo en paralelo terminan todas ──────────
const plan = crearPlan("docena de reflejos", Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1), titulo: `ram ${i}`, tipo: "reflejo", peso: "io" as const, datos: { entidad: "maq.cpu" },
})));
const ejecutorRapido = crearEjecutorDePlanes({
  pedirModelo: async () => "x", leerArchivo: async () => "y",
  entidad: async () => ({ ok: true, salida: "4 núcleos", ms: 1 }),
  reflejar: async () => ({ ok: true, accion: "calculo", confianza: 1, entidad: "matematico" }),
});
await ejecutarPlan(plan, {
  ejecutar: ejecutorRapido,
  medir: () => ({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
});
comprobar("12 reflejos: plan hecho, 12/12", plan.estado === "hecho" && plan.tareas.every((t) => t.estado === "hecha"), `${plan.estado} ${plan.tareas.filter((t) => t.estado === "hecha").length}/12`);

// ─── Veredicto ───────────────────────────────────────────────────────────────
console.log(`\n═══ AGÉNTICO: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
