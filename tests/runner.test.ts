/**
 * runner.test.ts — SEGUNDO PLANO Y SEMÁFORO GLOBAL (v2.2)
 * =======================================================
 * Lo que hay que DEMOSTRAR:
 *   · que lanzar un plan NO bloquea (vuelve al instante)
 *   · que el plan avanza solo por detrás y se puede cancelar en caliente
 *   · que DOS planes a la vez NO desbordan la máquina (semáforo global)
 *   · que el botón ×8 se aplica a un plan que YA está corriendo
 *
 * Se ejecuta con:  npx tsx tests/runner.test.ts
 */

import { PlanRunner } from "../src/engine/planRunner";
import { GestorPlanes, type AlmacenPlanes } from "../src/engine/taskStoreFs";
import type { Tarea, EstadoPlan } from "../src/engine/taskPlanner";

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

function almacenFalso(): AlmacenPlanes {
  let texto: string | null = null;
  return { leer: () => texto, leerRespaldo: () => null, escribir: (t: string) => (texto = t) };
}

/** Máquina fija: 8 GB (MR#2) con 6 GB libres y 4 núcleos → 3 tareas «io» a la vez. */
const MAQUINA = { ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 };
const medir = () => MAQUINA;

interface Sonda {
  maxIo: number;
  maxCpu: number;
  vivosIo: number;
  vivosCpu: number;
  llamadas: string[];
}
const sondaNueva = (): Sonda => ({ maxIo: 0, maxCpu: 0, vivosIo: 0, vivosCpu: 0, llamadas: [] });

const ejecutor = (ms: number, s: Sonda) => async (t: Tarea, senal: AbortSignal) => {
  s.llamadas.push(t.id);
  if (t.peso === "io") {
    s.vivosIo++;
    s.maxIo = Math.max(s.maxIo, s.vivosIo);
  } else {
    s.vivosCpu++;
    s.maxCpu = Math.max(s.maxCpu, s.vivosCpu);
  }
  try {
    await new Promise<void>((res, rej) => {
      const id = setTimeout(res, ms);
      senal.addEventListener("abort", () => {
        clearTimeout(id);
        rej(new Error("cancelado"));
      });
    });
    return { resumen: `hecha ${t.id}` };
  } finally {
    if (t.peso === "io") s.vivosIo--;
    else s.vivosCpu--;
  }
};

async function esperarQue(cond: () => boolean, ms = 5000): Promise<boolean> {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 15));
  }
  return false;
}

const tareasIo = (n: number, desde = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: String(desde + i + 1), titulo: `io ${desde + i + 1}`, peso: "io" as const }));

// ─── 1. Crear no ejecuta ────────────────────────────────────────────────────

async function t1_crear_no_ejecuta(): Promise<void> {
  const s = sondaNueva();
  const gestor = new GestorPlanes(almacenFalso());
  const runner = new PlanRunner({ ejecutar: ejecutor(10, s), medir, gestor });

  const plan = runner.crear("nada todavía", tareasIo(3));
  comprobar("crear devuelve un plan con id", !!plan.id);
  comprobar("y queda guardado en el gestor", !!gestor.obtener(plan.id));
  await new Promise((r) => setTimeout(r, 50));
  comprobar("crear NO ejecuta ninguna tarea", s.llamadas.length === 0, s.llamadas.join(","));
  comprobar("no hay nada activo", runner.activos().length === 0);
  comprobar("el estado es «pendiente»", plan.estado === "pendiente", plan.estado);
}

// ─── 2. Lanzar es de verdad en segundo plano ───────────────────────────────

async function t2_segundo_plano(): Promise<void> {
  const s = sondaNueva();
  const gestor = new GestorPlanes(almacenFalso());
  const runner = new PlanRunner({ ejecutar: ejecutor(300, s), medir, gestor });
  const plan = runner.crear("largo", tareasIo(6));

  const t0 = Date.now();
  const r = runner.lanzar(plan.id);
  const tardanza = Date.now() - t0;

  comprobar("lanzar acepta el plan", r.ok === true, r.motivo);
  comprobar("lanzar VUELVE AL INSTANTE (no espera al plan)", tardanza < 150, `${tardanza} ms`);
  comprobar("el plan está en marcha detrás", runner.activos().includes(plan.id) || plan.estado === "en_curso", plan.estado);
  comprobar("lanzar dos veces el mismo plan se rechaza", runner.lanzar(plan.id).ok === false);

  const acabo = await esperarQue(() => plan.estado === "hecho");
  comprobar("el plan termina solo, sin que nadie lo espere", acabo, plan.estado);
  comprobar("ya no aparece como activo", !runner.activos().includes(plan.id));
  comprobar("las 6 tareas se hicieron", plan.tareas.filter((t) => t.estado === "hecha").length === 6);
}

// ─── 3. Cancelar en caliente ───────────────────────────────────────────────

async function t3_cancelar(): Promise<void> {
  const s = sondaNueva();
  const gestor = new GestorPlanes(almacenFalso());
  const runner = new PlanRunner({ ejecutar: ejecutor(3000, s), medir, gestor });
  const plan = runner.crear("para cancelar", tareasIo(3));
  runner.lanzar(plan.id);

  await esperarQue(() => plan.tareas.some((t) => t.estado === "en_curso"));
  const t0 = Date.now();
  const r = runner.cancelar(plan.id);
  const acabo = await esperarQue(() => plan.estado === "cancelado", 3000);

  comprobar("cancelar se acepta", r.ok === true);
  comprobar("y el plan se detiene en el acto", Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
  comprobar("el plan queda CANCELADO (no fallido)", acabo && plan.estado === "cancelado", plan.estado);
  comprobar("ninguna tarea se queda «en curso»", plan.tareas.every((t) => t.estado !== "en_curso"));
}

// ─── 4. EL SEMÁFORO GLOBAL: dos planes no desbordan la máquina ─────────────

async function t4_semaforo_global(): Promise<void> {
  const s = sondaNueva();
  const gestor = new GestorPlanes(almacenFalso());
  // escalado ×1 sobre MR#2 → 3 tareas «io» a la vez en TODA la máquina.
  const runner = new PlanRunner({ ejecutar: ejecutor(200, s), medir, gestor, escalado: 1 });

  const a = runner.crear("plan A", tareasIo(4, 0));
  const b = runner.crear("plan B", tareasIo(4, 100));
  runner.lanzar(a.id);
  runner.lanzar(b.id);

  comprobar("los dos planes corren a la vez", runner.activos().length === 2, runner.activos().join(","));

  await esperarQue(() => a.estado === "hecho" && b.estado === "hecho", 8000);
  comprobar("los dos terminan", a.estado === "hecho" && b.estado === "hecho", `${a.estado}/${b.estado}`);
  comprobar("las 8 tareas se hicieron entre los dos", a.tareas.concat(b.tareas).filter((t) => t.estado === "hecha").length === 8);

  // Sin semáforo global, cada plan lanzaría 3 → 6 a la vez. Con él, 3 en total.
  comprobar("NUNCA se pasan de 3 tareas «io» a la vez entre los dos planes", s.maxIo === 3, `maxIo=${s.maxIo}`);
  comprobar("el límite global es el de la máquina (3)", runner.estadoSemaforo().io.limite === 3, JSON.stringify(runner.estadoSemaforo().io));
}

// ─── 5. El botón ×8 se aplica EN CALIENTE ─────────────────────────────────

async function t5_escalado_en_caliente(): Promise<void> {
  const s = sondaNueva();
  const gestor = new GestorPlanes(almacenFalso());
  const runner = new PlanRunner({ ejecutar: ejecutor(250, s), medir, gestor, escalado: 1 });
  const plan = runner.crear("con escalado", tareasIo(9));
  runner.lanzar(plan.id);

  comprobar("arranca con el límite de ×1 (3)", runner.estadoSemaforo().io.limite === 3, `${runner.estadoSemaforo().io.limite}`);

  await esperarQue(() => plan.tareas.some((t) => t.estado === "en_curso"));
  const r = runner.escalar(8);
  comprobar("escalar ×8 sube el límite global", r.limites.io.limite > 3, `${r.limites.io.limite}`);
  comprobar("y lo explica en el motivo", /×8/.test(r.motivo), r.motivo);
  comprobar("el escalado actual queda registrado", runner.escaladoActual() === 8);

  const acabo = await esperarQue(() => plan.estado === "hecho", 8000);
  comprobar("el plan EN MARCHA aprovecha los huecos nuevos", acabo && s.maxIo > 3, `maxIo=${s.maxIo} estado=${plan.estado}`);
  comprobar("y no se pasa del tope duro (16)", s.maxIo <= 16, `maxIo=${s.maxIo}`);

  const limiteBajado = runner.escalar(1);
  comprobar("bajar a ×1 vuelve al límite de la máquina", limiteBajado.limites.io.limite === 3, `${limiteBajado.limites.io.limite}`);
}

// ─── 6. Escalado absurdo: se acepta, se degrada y lo dice ──────────────────

async function t6_escalado_absurdo(): Promise<void> {
  const gestor = new GestorPlanes(almacenFalso());
  const avisos: string[] = [];
  const runner = new PlanRunner({ ejecutar: async () => ({ resumen: "ok" }), medir, gestor, onAviso: (l) => avisos.push(l) });
  // Máquina con la RAM por los suelos: 0,3 GB libres.
  const apretado = new PlanRunner({
    ejecutar: async () => ({ resumen: "ok" }),
    medir: () => ({ ramMedidaGB: 8, ramLibreGB: 0.3, nucleos: 4 }),
    gestor,
    onAviso: (l) => avisos.push(l),
  });
  const r = apretado.escalar(8);
  comprobar("×8 con la RAM por los suelos NO devuelve 0", r.limites.io.limite >= 1 && r.limites.cpu.limite >= 1, JSON.stringify(r.limites));
  comprobar("y avisa de que va degradado", /no da para tanto|degradad/i.test(r.motivo), r.motivo);
  comprobar("el aviso queda en el registro (nada silencioso)", avisos.some((a) => /×8/.test(a)));
}

// ─── 7. Reanudar y parada limpia ───────────────────────────────────────────

async function t7_reanudar_y_parar(): Promise<void> {
  const s = sondaNueva();
  const gestor = new GestorPlanes(almacenFalso());
  const runner = new PlanRunner({ ejecutar: ejecutor(40, s), medir, gestor });

  const plan = runner.crear("reanudable", tareasIo(4));
  plan.tareas[0].estado = "hecha";
  plan.tareas[1].estado = "en_curso"; // como si el servidor hubiera muerto
  plan.estado = "pausado";

  const r = runner.reanudar(plan.id);
  comprobar("reanudar lanza el plan", r.ok === true, r.motivo);
  const acabo = await esperarQue(() => plan.estado === "hecho", 5000);
  comprobar("y termina", acabo && plan.estado === "hecho", plan.estado);
  comprobar("no repite lo que ya estaba hecho", !s.llamadas.includes("1"), s.llamadas.join(","));
  comprobar("sí reintenta lo que quedó a medias", s.llamadas.includes("2"), s.llamadas.join(","));

  const largo = runner.crear("largo para parar", tareasIo(3, 900));
  runner.lanzar(largo.id);
  await esperarQue(() => largo.tareas.some((t) => t.estado === "en_curso"));
  const parada = await runner.pararTodo(2000);
  comprobar("pararTodo informa de lo que paró", parada.parados.includes(largo.id), parada.parados.join(","));
  comprobar("y no queda nada corriendo", runner.activos().length === 0, runner.activos().join(","));
  comprobar("el plan parado no se queda «en curso»", largo.estado !== "en_curso", largo.estado as EstadoPlan);
}

// ─── Ejecución ──────────────────────────────────────────────────────────────

(async () => {
  console.log("═══ PRUEBAS DE SEGUNDO PLANO Y SEMÁFORO · CerebroNico v2.2 ═══");
  await conLimite("1. Crear no ejecuta", 5_000, t1_crear_no_ejecuta);
  await conLimite("2. Lanzar es de verdad en segundo plano", 10_000, t2_segundo_plano);
  await conLimite("3. Cancelar en caliente", 10_000, t3_cancelar);
  await conLimite("4. SEMÁFORO GLOBAL: dos planes no desbordan", 15_000, t4_semaforo_global);
  await conLimite("5. El botón ×8 se aplica en caliente", 15_000, t5_escalado_en_caliente);
  await conLimite("6. Escalado absurdo: degrada y avisa", 5_000, t6_escalado_absurdo);
  await conLimite("7. Reanudar y parada limpia", 10_000, t7_reanudar_y_parar);

  console.log(`\n═══ RESULTADO: ${pasan} correctas · ${fallan} fallidas ═══`);
  if (fallan > 0) {
    console.log("Fallos:");
    fallos.forEach((f) => console.log(`  · ${f}`));
  }
  process.exitCode = fallan > 0 ? 1 : 0;
})();
