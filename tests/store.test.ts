/**
 * store.test.ts — PRUEBAS DE SUPERVIVENCIA AL REINICIO (v2.2)
 * ===========================================================
 * Lo que hay que DEMOSTRAR aquí, no describir:
 *   · que un apagón a mitad no borra el trabajo ya hecho
 *   · que al volver, lo hecho NO se repite y el plan termina
 *   · que un fichero corrupto no se lleva por delante nada
 *   · que un plan dañado se REPARA y se dice qué se reparó
 *   · que guardar no puede tumbar una ejecución
 *
 * Se ejecuta con:  npx tsx tests/store.test.ts
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { crearPlan, ejecutarPlan, type Tarea, type Plan } from "../src/engine/taskPlanner";
import {
  serializarPlanes,
  deserializarPlanes,
  marcarInterrumpidos,
  prepararReanudacion,
  podarPlanes,
  siguienteIdPlan,
  VERSION_PLANES,
} from "../src/engine/taskStore";
import { crearAlmacenFs, GestorPlanes, type AlmacenPlanes } from "../src/engine/taskStoreFs";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];

function comprobar(nombre: string, cond: boolean, detalle?: string): void {
  if (cond) {
    pasan++;
    console.log(`  PASS   ${nombre}`);
  } else {
    fallan++;
    fallos.push(nombre);
    console.log(`  FALLO  ${nombre}${detalle ? `  ·  ${detalle}` : ""}`);
  }
}

async function conLimite(nombre: string, ms: number, fn: () => Promise<void>): Promise<void> {
  console.log(`\n── ${nombre} ──`);
  let t: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise((_, rej) => {
        t = setTimeout(() => rej(new Error(`no terminó en ${ms} ms`)), ms);
      }),
    ]);
  } catch (e: any) {
    comprobar(`${nombre}: debe terminar a tiempo`, false, e?.message);
  } finally {
    if (t) clearTimeout(t);
  }
}

/** Almacén en memoria, para poder simular apagones y discos llenos. */
function almacenFalso() {
  const mem = { texto: null as string | null, respaldo: null as string | null, escrituras: 0, fallar: false };
  const almacen: AlmacenPlanes = {
    leer: () => mem.texto,
    leerRespaldo: () => mem.respaldo,
    escribir: (t: string) => {
      if (mem.fallar) throw new Error("disco lleno (simulado)");
      mem.respaldo = mem.texto;
      mem.texto = t;
      mem.escrituras += 1;
    },
  };
  return { mem, almacen };
}

const medir = (o: { ramMedidaGB: number; ramLibreGB: number; nucleos: number }) => () => o;

// ─── 1. Ida y vuelta sin pérdida ────────────────────────────────────────────

async function t1_ida_y_vuelta(): Promise<void> {
  const plan = crearPlan(
    "ida y vuelta",
    [
      { id: "1", titulo: "hecha", estado: "hecha" },
      { id: "2", titulo: "fallida", estado: "fallida", dependeDe: ["1"] },
      { id: "3", titulo: "en curso", estado: "en_curso", peso: "cpu" },
      { id: "4", titulo: "pendiente", dependeDe: ["2"] },
    ],
    "42"
  );
  plan.tareas[0].resultado = { resumen: "todo bien", artefactos: ["a.ts"] };
  plan.tareas[0].coste = { ms: 123 };
  plan.tareas[1].error = { clase: "fatal", mensaje: "no se puede" };
  plan.log = ["[plan 42] algo pasó"];

  const texto = serializarPlanes([plan]);
  comprobar("lo serializado lleva versión de formato", JSON.parse(texto).version === VERSION_PLANES);

  const { planes, avisos } = deserializarPlanes(texto);
  comprobar("se recupera exactamente 1 plan", planes.length === 1, `avisos: ${avisos.join(" | ")}`);
  const p = planes[0];
  comprobar("el id se conserva", p.id === "42");
  comprobar("el objetivo se conserva", p.objetivo === "ida y vuelta");
  comprobar("los 4 estados se conservan", p.tareas.map((t) => t.estado).join(",") === "hecha,fallida,en_curso,pendiente", p.tareas.map((t) => t.estado).join(","));
  comprobar("el resultado de una tarea hecha se conserva", p.tareas[0].resultado?.resumen === "todo bien" && p.tareas[0].resultado?.artefactos?.[0] === "a.ts");
  comprobar("el coste se conserva", p.tareas[0].coste?.ms === 123);
  comprobar("el error de una fallida se conserva", p.tareas[1].error?.clase === "fatal");
  comprobar("el peso cpu se conserva", p.tareas[2].peso === "cpu");
  comprobar("las dependencias se conservan", p.tareas[1].dependeDe.join() === "1" && p.tareas[3].dependeDe.join() === "2");
  comprobar("la traza se conserva", (p.log || []).length === 1);
  comprobar("sin avisos: no hubo nada que reparar", avisos.length === 0, avisos.join(" | "));
}

// ─── 2. Fichero corrupto o a medias ────────────────────────────────────────

async function t2_corrupto(): Promise<void> {
  const casos: Array<[string, string | null]> = [
    ["JSON cortado a la mitad", '{"version":1,"planes":[{"id":"1","tare'],
    ["texto vacío", ""],
    ["null", null],
    ["basura", "esto no es json ni de lejos {{{"],
    ["JSON válido pero sin planes", '{"version":1}'],
  ];
  let ningunoLanza = true;
  for (const [nombre, texto] of casos) {
    try {
      const r = deserializarPlanes(texto as any);
      if (texto === '{"version":1}') {
        comprobar(`«${nombre}»: no hay planes, pero tampoco excepción`, r.planes.length === 0);
      }
    } catch (e: any) {
      ningunoLanza = false;
      console.log(`     lanzó con «${nombre}»: ${e?.message}`);
    }
  }
  comprobar("ningún fichero dañado hace saltar una excepción", ningunoLanza);

  const cortado = deserializarPlanes('{"version":1,"planes":[{"id":"1","tare');
  comprobar("un fichero cortado se reporta como vacío", cortado.vacio === true);
  comprobar("y explica por qué", cortado.avisos.some((a) => /no es JSON válido/.test(a)), cortado.avisos.join(" | "));
}

// ─── 3. Reparación de un plan dañado, avisando ─────────────────────────────

async function t3_reparacion(): Promise<void> {
  const sucio = JSON.stringify({
    version: 1,
    planes: [
      {
        id: "9",
        objetivo: "dañado a propósito",
        estado: "estado_que_no_existe",
        tareas: [
          { id: "1", titulo: "ok", estado: "hecha", peso: "io", dependeDe: [] },
          { id: "2", titulo: "estado raro", estado: "explota", peso: "bomba", dependeDe: ["1", "999"] },
          { titulo: "sin id" },
        ],
      },
      { objetivo: "sin id" },
    ],
  });
  const { planes, avisos } = deserializarPlanes(sucio);
  comprobar("se rescata el plan que tiene id", planes.length === 1, `${planes.length}`);
  comprobar("se descartan los que no tienen id", avisos.some((a) => /sin id/.test(a)));
  const p = planes[0];
  comprobar("un estado de plan desconocido se convierte en «pendiente»", p.estado === "pendiente", p.estado);
  comprobar("un estado de tarea desconocido se convierte en «pendiente»", p.tareas[1].estado === "pendiente", p.tareas[1].estado);
  comprobar("un peso desconocido se convierte en «io»", p.tareas[1].peso === "io", p.tareas[1].peso);
  comprobar("la tarea sin id se descarta", p.tareas.length === 2, `${p.tareas.length}`);
  comprobar("la dependencia fantasma (#999) se quita", !p.tareas[1].dependeDe.includes("999"), p.tareas[1].dependeDe.join(","));
  comprobar("la dependencia buena se conserva", p.tareas[1].dependeDe.includes("1"));
  comprobar("y TODO lo reparado queda escrito en los avisos", avisos.length >= 4, avisos.join(" | "));

  const r = await ejecutarPlan(p, { ejecutar: async () => ({ resumen: "ok" }), medir: medir({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }) });
  comprobar("un plan reparado se puede ejecutar y termina", r.estado === "hecho", `${r.estado}`);
}

// ─── 4. APAGÓN A MITAD: el caso que importa ────────────────────────────────

async function t4_apagon(): Promise<void> {
  const { mem, almacen } = almacenFalso();
  const gestor = new GestorPlanes(almacen, { checkpointCadaTareas: 1 });

  const plan = crearPlan(
    "trabajo largo",
    [
      { id: "1", titulo: "paso 1" },
      { id: "2", titulo: "paso 2" },
      { id: "3", titulo: "paso 3 (aquí se va la luz)" },
      { id: "4", titulo: "paso 4", dependeDe: ["3"] },
    ],
    "100"
  );
  gestor.registrar(plan);

  const llamadas1: string[] = [];
  const ejecutorQueSeCuelga = async (t: Tarea) => {
    llamadas1.push(t.id);
    if (t.id === "3") return new Promise<never>(() => {}); // ← aquí "muere el proceso"
    await new Promise((r) => setTimeout(r, 10));
    return { resumen: `hecha ${t.id}` };
  };

  // Se lanza y NO se espera: se simula el apagón.
  void ejecutarPlan(plan, {
    ejecutar: ejecutorQueSeCuelga,
    medir: medir({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
    alTerminarTarea: (p, t) => gestor.avisarTareaTerminada(p, t),
  });

  // Esperar a que 1 y 2 estén hechas y 3 esté en curso (el "apagón" es justo ahí).
  const limite = Date.now() + 3000;
  while (Date.now() < limite) {
    if (plan.tareas.slice(0, 2).every((t) => t.estado === "hecha") && plan.tareas[2].estado === "en_curso") break;
    await new Promise((r) => setTimeout(r, 10));
  }
  await gestor.vaciar();

  comprobar("antes del apagón: 2 tareas hechas y una en curso", plan.tareas.slice(0, 2).every((t) => t.estado === "hecha") && plan.tareas[2].estado === "en_curso");
  comprobar("el disco tiene el estado del momento del apagón", !!mem.texto && mem.escrituras >= 2);

  // ── REINICIO DEL SERVIDOR ──
  const trasReinicio = new GestorPlanes(almacen, { checkpointCadaTareas: 1 });
  const carga = trasReinicio.cargar();
  const p2 = trasReinicio.obtener("100")!;

  comprobar("el plan sobrevive al apagón", !!p2);
  comprobar("queda marcado como PAUSADO, no «en curso»", p2.estado === "pausado", p2.estado);
  comprobar("se avisa de que se pausó por el reinicio", carga.interrumpidos.includes("100") && (p2.log || []).some((l) => /se reinició/.test(l)));
  comprobar("las tareas hechas SIGUEN hechas", p2.tareas[0].estado === "hecha" && p2.tareas[1].estado === "hecha");
  comprobar("la que estaba en curso ya no miente: vuelve a pendiente", p2.tareas[2].estado === "pendiente", p2.tareas[2].estado);
  comprobar("y explica por qué", /reinició/.test(p2.tareas[2].motivoEspera || ""), p2.tareas[2].motivoEspera);

  // ── REANUDAR ──
  prepararReanudacion(p2);
  const llamadas2: string[] = [];
  const r = await ejecutarPlan(p2, {
    ejecutar: async (t) => {
      llamadas2.push(t.id);
      await new Promise((res) => setTimeout(res, 10));
      return { resumen: `hecha ${t.id}` };
    },
    medir: medir({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
    alTerminarTarea: (p, t) => trasReinicio.avisarTareaTerminada(p, t),
  });
  await trasReinicio.vaciar();

  comprobar("al reanudar NO se repite lo ya hecho", !llamadas2.includes("1") && !llamadas2.includes("2"), llamadas2.join(","));
  comprobar("se retoma por donde se quedó (3 y 4)", llamadas2.includes("3") && llamadas2.includes("4"), llamadas2.join(","));
  comprobar("y el plan TERMINA hecho", r.estado === "hecho", r.estado);
  comprobar("la dependencia 4 se respetó también al reanudar", llamadas2.indexOf("3") < llamadas2.indexOf("4"));
}

// ─── 5. Puntos de guardado ─────────────────────────────────────────────────

async function t5_checkpoints(): Promise<void> {
  const { mem, almacen } = almacenFalso();
  const g = new GestorPlanes(almacen, { checkpointCadaTareas: 3 });
  const plan = crearPlan("checkpoints", [{ id: "1", titulo: "a" }], "200");
  g.registrar(plan);
  await g.vaciar();
  const trasRegistrar = mem.escrituras;
  comprobar("crear un plan lo guarda en el acto", trasRegistrar === 1, `${trasRegistrar}`);

  plan.estado = "en_curso";
  plan.tareas[0].estado = "hecha";
  g.avisarTareaTerminada(plan, plan.tareas[0]);
  await g.vaciar();
  comprobar("con checkpoint cada 3, tras 1 tarea todavía no escribe", mem.escrituras === trasRegistrar, `${mem.escrituras}`);

  const plan2 = crearPlan("fallo", [{ id: "1", titulo: "a" }], "201");
  g.registrar(plan2);
  plan2.estado = "en_curso";
  plan2.tareas[0].estado = "fallida";
  g.avisarTareaTerminada(plan2, plan2.tareas[0]);
  await g.vaciar();
  comprobar("un FALLO se guarda al momento, sin esperar al checkpoint", mem.escrituras >= trasRegistrar + 2, `${mem.escrituras}`);
}

// ─── 6. Guardar no puede tumbar la ejecución ───────────────────────────────

async function t6_disco_lleno(): Promise<void> {
  const { mem, almacen } = almacenFalso();
  const avisos: string[] = [];
  const g = new GestorPlanes(almacen, { checkpointCadaTareas: 1, onAviso: (l) => avisos.push(l) });
  mem.fallar = true;

  const plan = crearPlan("con disco lleno", [{ id: "1", titulo: "a" }, { id: "2", titulo: "b" }], "300");
  g.registrar(plan);
  const r = await ejecutarPlan(plan, {
    ejecutar: async () => ({ resumen: "ok" }),
    medir: medir({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
    alTerminarTarea: (p, t) => g.avisarTareaTerminada(p, t),
  });
  await g.vaciar();

  comprobar("con el disco lleno el plan TERMINA igual", r.estado === "hecho", r.estado);
  comprobar("y se avisa del problema de guardado", avisos.some((a) => /No se pudieron guardar/.test(a)), avisos.join(" | "));
  comprobar("el error queda registrado en el diagnóstico", !!g.diagnostico().ultimoError);
}

// ─── 7. Poda: lo pausado NUNCA se tira ─────────────────────────────────────

async function t7_poda(): Promise<void> {
  const ahora = Date.now();
  const finalizados: Plan[] = Array.from({ length: 5 }, (_, i) => {
    const p = crearPlan(`f${i}`, [{ id: "1", titulo: "a" }], `f${i}`);
    p.estado = "hecho";
    p.creadoEn = ahora - i * 1000;
    return p;
  });
  const pausado = crearPlan("pausado importante", [{ id: "1", titulo: "a" }], "pausa");
  pausado.estado = "pausado";
  pausado.creadoEn = ahora - 90 * 24 * 60 * 60 * 1000; // antiquísimo

  const { planes, descartados } = podarPlanes([...finalizados, pausado], ahora, 2);
  comprobar("se conservan solo 2 finalizados", planes.filter((p) => p.estado === "hecho").length === 2);
  comprobar("se descartan los 3 finalizados sobrantes", descartados.length === 3, descartados.join(","));
  comprobar("un plan PAUSADO se conserva aunque sea antiguo", planes.some((p) => p.id === "pausa"));

  comprobar("el id nuevo no choca con los existentes", siguienteIdPlan(finalizados.concat([crearPlan("x", [{ id: "1", titulo: "a" }], "7")])) === "8");
}

// ─── 8. Escritura atómica y respaldo, en disco de verdad ───────────────────

async function t8_disco_real(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-planes-"));
  const almacen = crearAlmacenFs(dir);

  comprobar("leer cuando no hay fichero no lanza", almacen.leer() === null);

  const a = crearPlan("primero", [{ id: "1", titulo: "a" }], "1");
  almacen.escribir(serializarPlanes([a]));
  comprobar("se puede leer lo escrito", deserializarPlanes(almacen.leer()).planes.length === 1);

  const b = crearPlan("segundo", [{ id: "1", titulo: "b" }], "2");
  almacen.escribir(serializarPlanes([a, b]));
  comprobar("tras la segunda escritura hay respaldo", !!almacen.leerRespaldo && deserializarPlanes(almacen.leerRespaldo()).planes.length === 1);
  comprobar("no queda ningún temporal suelto", !fs.existsSync(path.join(dir, "planes.json.tmp")));
  comprobar("el fichero principal tiene los dos planes", deserializarPlanes(almacen.leer()).planes.length === 2);

  // Corromper el principal a propósito: hay que rescatar del respaldo.
  fs.writeFileSync(path.join(dir, "planes.json"), "{esto está roto", "utf-8");
  const avisos: string[] = [];
  const g = new GestorPlanes(almacen, { onAviso: (l) => avisos.push(l) });
  g.cargar();
  comprobar("con el principal corrupto se rescata del respaldo", g.lista().length >= 1, `${g.lista().length}`);
  comprobar("y se avisa de la recuperación", avisos.some((x) => /respaldo/.test(x)), avisos.join(" | "));

  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Ejecución ──────────────────────────────────────────────────────────────

(async () => {
  console.log("═══ PRUEBAS DE PERSISTENCIA DEL CEREBRO · CerebroNico v2.2 ═══");
  await conLimite("1. Ida y vuelta sin pérdida", 5_000, t1_ida_y_vuelta);
  await conLimite("2. Fichero corrupto o cortado", 5_000, t2_corrupto);
  await conLimite("3. Reparación de un plan dañado", 10_000, t3_reparacion);
  await conLimite("4. APAGÓN A MITAD y reanudación", 15_000, t4_apagon);
  await conLimite("5. Puntos de guardado", 10_000, t5_checkpoints);
  await conLimite("6. Guardar no tumba la ejecución", 10_000, t6_disco_lleno);
  await conLimite("7. Poda (lo pausado nunca se tira)", 5_000, t7_poda);
  await conLimite("8. Escritura atómica y respaldo en disco real", 10_000, t8_disco_real);

  console.log(`\n═══ RESULTADO: ${pasan} correctas · ${fallan} fallidas ═══`);
  if (fallan > 0) {
    console.log("Fallos:");
    fallos.forEach((f) => console.log(`  · ${f}`));
  }
  process.exitCode = fallan > 0 ? 1 : 0;
})();
