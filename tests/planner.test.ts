/**
 * planner.test.ts — PRUEBAS DEL CEREBRO DE TAREAS (v2.2)
 * =======================================================
 * Sin modelo, sin red, sin suerte: el planificador es lógica pura y el ejecutor
 * se inyecta, así que todo se puede medir de forma reproducible.
 *
 * Se ejecuta con:  npx tsx tests/planner.test.ts
 *
 * Lo que estas pruebas tienen que DEMOSTRAR (no describir):
 *   · que las dependencias mandan (grafo y orden)
 *   · que un ciclo se detecta en vez de colgar el motor
 *   · que el paralelismo es REAL (varias tareas vivas a la vez, contadas)
 *   · que la CPU no se paraleliza en un equipo de 2-4 núcleos
 *   · que cancelar no deja nada a medias
 *   · **que TERMINA aunque no quepa** (la regla que pidió el usuario)
 */

import {
  crearPlan,
  ejecutarPlan,
  validarPlan,
  ordenTopologico,
  solicitarCancelacion,
  lineaEstadoTarea,
  esTerminal,
  type Tarea,
} from "../src/engine/taskPlanner";
import {
  PERFILES_MR,
  ORDEN_MR,
  elegirMR,
  siguienteEscalado,
  resolverPresupuesto,
  esPresupuestoSeguro,
  ESCALADOS,
} from "../src/engine/memoriaResiliente";

// ─── Arnés mínimo ────────────────────────────────────────────────────────────

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
  let temporizador: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise((_, rej) => {
        temporizador = setTimeout(() => rej(new Error(`no terminó en ${ms} ms`)), ms);
      }),
    ]);
  } catch (e: any) {
    comprobar(`${nombre}: debe terminar a tiempo`, false, e?.message);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

/** Medidor de máquina fijo, para que nada dependa del equipo real. */
const medir = (o: { ramMedidaGB: number; ramLibreGB: number; nucleos: number }) => () => o;

interface Sonda {
  maxIo: number;
  maxCpu: number;
  vivosIo: number;
  vivosCpu: number;
  llamadas: string[];
  terminadas: string[];
}

const sondaNueva = (): Sonda => ({ maxIo: 0, maxCpu: 0, vivosIo: 0, vivosCpu: 0, llamadas: [], terminadas: [] });

/** Ejecutor que "trabaja" durante `ms` y registra cuántas tareas coinciden vivas. */
function ejecutor(ms: number, s: Sonda) {
  return async (t: Tarea, senal: AbortSignal) => {
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
          rej(new Error("cancelado durante la prueba"));
        });
      });
      s.terminadas.push(t.id);
      return { resumen: `hecha ${t.id}` };
    } finally {
      if (t.peso === "io") s.vivosIo--;
      else s.vivosCpu--;
    }
  };
}

// ─── 1. Escalera MR ─────────────────────────────────────────────────────────

async function t1_escalera(): Promise<void> {
  comprobar("hay 4 tramos MR, del 1 al 4", ORDEN_MR.length === 4);
  comprobar(
    "MR#1=4 GB · MR#2=8 GB · MR#3=16 GB · MR#4=32 GB",
    PERFILES_MR.MR1.ramGB === 4 && PERFILES_MR.MR2.ramGB === 8 && PERFILES_MR.MR3.ramGB === 16 && PERFILES_MR.MR4.ramGB === 32,
    `${PERFILES_MR.MR1.ramGB}/${PERFILES_MR.MR2.ramGB}/${PERFILES_MR.MR3.ramGB}/${PERFILES_MR.MR4.ramGB}`
  );
  comprobar("4 GB → MR#1", elegirMR(4).id === "MR1");
  comprobar("8 GB → MR#2 (tu máquina)", elegirMR(8).id === "MR2");
  comprobar("16 GB → MR#3", elegirMR(16).id === "MR3");
  comprobar("32 GB → MR#4 (tramo objetivo)", elegirMR(32).id === "MR4");
  comprobar("una máquina de 3 GB no se queda sin tramo", elegirMR(3).id === "MR1");
  comprobar("MR#4 está definido y con presupuesto", PERFILES_MR.MR4.ioBase > PERFILES_MR.MR2.ioBase && PERFILES_MR.MR4.contextoPorTarea >= 8192);
}

// ─── 2. Botón de escalado ───────────────────────────────────────────────────

async function t2_boton(): Promise<void> {
  comprobar("el botón ofrece ×1 ×2 ×4 ×6 ×8", ESCALADOS.join(",") === "1,2,4,6,8");
  let e: number = 1;
  const recorrido: number[] = [e];
  for (let i = 0; i < 5; i++) {
    e = siguienteEscalado(e);
    recorrido.push(e);
  }
  comprobar("el botón cicla 1→2→4→6→8→1", recorrido.join(",") === "1,2,4,6,8,1", recorrido.join(","));

  const x8 = resolverPresupuesto({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4, escalado: 8 });
  comprobar("×8 no inventa concurrencia imposible (tope duro 16)", x8.io <= 16, `io=${x8.io}`);
  comprobar("×8 respeta núcleos-1 en CPU", x8.cpu <= Math.max(1, 4 - 1), `cpu=${x8.cpu}`);
  comprobar("×8 sigue siendo un presupuesto válido", esPresupuestoSeguro(x8), `io=${x8.io} cpu=${x8.cpu}`);
  comprobar("×8 pide más que ×1 (el botón hace algo)", x8.io > resolverPresupuesto({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4, escalado: 1 }).io);
}

// ─── 3. El presupuesto nunca es 0 (regla del usuario) ───────────────────────

async function t3_nunca_cero(): Promise<void> {
  const casos = [
    { ramMedidaGB: 8, ramLibreGB: 0.4, nucleos: 4, escalado: 1 },
    { ramMedidaGB: 32, ramLibreGB: 0.1, nucleos: 2, escalado: 8 },
    { ramMedidaGB: 4, ramLibreGB: 0, nucleos: 1, escalado: 8 },
    { ramMedidaGB: 0, ramLibreGB: 0, nucleos: 0, escalado: 8 },
  ];
  let todosSeguros = true;
  for (const c of casos) {
    const b = resolverPresupuesto(c);
    if (!esPresupuestoSeguro(b)) {
      todosSeguros = false;
      console.log(`     presupuesto inseguro con ${JSON.stringify(c)} → io=${b.io} cpu=${b.cpu}`);
    }
  }
  comprobar("con la RAM por los suelos el presupuesto sigue siendo io>=1 y cpu>=1", todosSeguros);

  const apretado = resolverPresupuesto({ ramMedidaGB: 8, ramLibreGB: 0.4, nucleos: 4, escalado: 1 });
  comprobar("se marca como DEGRADADO en vez de negarse", apretado.degradado === true);
  comprobar("y escribe el motivo (nada silencioso)", apretado.motivo.some((m) => /RAM libre|colchón/.test(m)), apretado.motivo.join(" | "));
  comprobar("MR#4 forzado en una máquina de 8 GB avisa de que irá justo", resolverPresupuesto({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4, perfilForzado: "MR4" }).motivo.some((m) => /forzado/i.test(m)));
}

// ─── 4. Grafo: dependencias y orden ─────────────────────────────────────────

async function t4_grafo(): Promise<void> {
  const plan = crearPlan(
    "diamante de 8",
    [
      { id: "1", titulo: "raíz" },
      { id: "2", titulo: "izquierda", dependeDe: ["1"] },
      { id: "3", titulo: "derecha", dependeDe: ["1"] },
      { id: "4", titulo: "unión", dependeDe: ["2", "3"] },
      { id: "5", titulo: "rama A", dependeDe: ["4"] },
      { id: "6", titulo: "rama B", dependeDe: ["4"] },
      { id: "7", titulo: "rama C", dependeDe: ["4"] },
      { id: "8", titulo: "cierre", dependeDe: ["5", "6", "7"] },
    ],
    "7"
  );
  comprobar("el plan valida", validarPlan(plan).ok === true, validarPlan(plan).error);

  const topo = ordenTopologico(plan).map((t) => t.id);
  comprobar("el orden topológico empieza por la raíz", topo[0] === "1");
  comprobar("el orden topológico cierra por el final", topo[topo.length - 1] === "8");
  comprobar("la unión va después de sus dos padres", topo.indexOf("4") > topo.indexOf("2") && topo.indexOf("4") > topo.indexOf("3"));

  const s = sondaNueva();
  const ordenFin: string[] = [];
  plan.tareas.forEach((t) => (t.peso = "io"));
  const resultado = await ejecutarPlan(plan, {
    ejecutar: async (t, senal) => {
      const r = await ejecutor(15, s)(t, senal);
      ordenFin.push(t.id);
      return r;
    },
    medir: medir({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
  });

  comprobar("las 8 terminan y el plan queda HECHO", resultado.estado === "hecho" && resultado.resumen!.hechas === 8, `estado=${resultado.estado} hechas=${resultado.resumen?.hechas}`);
  comprobar("la raíz terminó antes que la unión", ordenFin.indexOf("1") < ordenFin.indexOf("4"));
  comprobar("la unión terminó antes que el cierre", ordenFin.indexOf("4") < ordenFin.indexOf("8"));
  comprobar("ninguna tarea quedó sin estado terminal", resultado.tareas.every((t) => esTerminal(t.estado)));
  comprobar("no hay nada en «noTerminadas»", (resultado.noTerminadas || []).length === 0);
}

// ─── 5. Ciclo: error legible, sin colgarse ──────────────────────────────────

async function t5_ciclo(): Promise<void> {
  const plan = crearPlan("ciclo", [
    { id: "a", titulo: "A", dependeDe: ["b"] },
    { id: "b", titulo: "B", dependeDe: ["a"] },
  ]);
  const v = validarPlan(plan);
  comprobar("un ciclo se detecta", v.ok === false);
  comprobar("el error nombra el ciclo", !!v.error && /Ciclo de dependencias/.test(v.error) && v.error.includes("#a") && v.error.includes("#b"), v.error);
  comprobar("el error explica que se colgaría y qué hacer", !!v.error && /colgaría|quita una/.test(v.error));

  const s = sondaNueva();
  const r = await ejecutarPlan(plan, { ejecutar: ejecutor(10, s), medir: medir({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }) });
  comprobar("un plan con ciclo se marca fallido sin ejecutar nada", r.estado === "fallido" && s.llamadas.length === 0);
  comprobar("y deja el motivo en errorValidacion", !!r.errorValidacion);

  const suelto = crearPlan("dep inexistente", [{ id: "x", titulo: "X", dependeDe: ["zz"] }]);
  comprobar("una dependencia inexistente también se detecta", validarPlan(suelto).ok === false && /no existe/.test(validarPlan(suelto).error || ""));
}

// ─── 6. Paralelismo REAL de tareas de espera ────────────────────────────────

async function t6_paralelismo(): Promise<void> {
  const s = sondaNueva();
  const plan = crearPlan(
    "6 tareas de espera",
    Array.from({ length: 6 }, (_, i) => ({ id: String(i + 1), titulo: `io ${i + 1}`, peso: "io" as const }))
  );
  const t0 = Date.now();
  const r = await ejecutarPlan(plan, {
    ejecutar: ejecutor(300, s),
    medir: medir({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
  });
  const total = Date.now() - t0;

  comprobar("las 6 terminan", r.resumen!.hechas === 6, `hechas=${r.resumen?.hechas}`);
  comprobar("se ejecutan 3 A LA VEZ (no de una en una)", s.maxIo === 3, `maxIo=${s.maxIo}`);
  comprobar("y por eso tarda ~2 tandas, no 6 (sin paralelismo serían 1800 ms)", total < 1700, `tardó ${total} ms`);
}

// ─── 7. La CPU no se paraleliza en 2-4 núcleos ──────────────────────────────

async function t7_cpu_secuencial(): Promise<void> {
  const s = sondaNueva();
  const plan = crearPlan(
    "3 tareas de cálculo",
    Array.from({ length: 3 }, (_, i) => ({ id: String(i + 1), titulo: `cpu ${i + 1}`, peso: "cpu" as const }))
  );
  const r = await ejecutarPlan(plan, {
    ejecutar: ejecutor(120, s),
    medir: medir({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
  });
  comprobar("las 3 terminan", r.resumen!.hechas === 3);
  comprobar("nunca hay 2 tareas de cálculo a la vez", s.maxCpu === 1, `maxCpu=${s.maxCpu}`);
  comprobar("las de espera sí podrían ir en paralelo, pero estas no", s.maxIo === 0);
}

// ─── 8. Cancelación limpia ──────────────────────────────────────────────────

async function t8_cancelacion(): Promise<void> {
  const s = sondaNueva();
  const plan = crearPlan(
    "cancelar a mitad",
    Array.from({ length: 3 }, (_, i) => ({ id: String(i + 1), titulo: `larga ${i + 1}`, peso: "io" as const }))
  );
  const ejecucion = ejecutarPlan(plan, {
    ejecutar: ejecutor(3000, s),
    medir: medir({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
    timeoutCancelacionMs: 3000,
  });
  await new Promise((r) => setTimeout(r, 250));
  comprobar("hay tareas en curso antes de cancelar", plan.tareas.some((t) => t.estado === "en_curso"));
  solicitarCancelacion(plan);
  const r = await ejecucion;

  comprobar("al cancelar NO queda ninguna en curso", r.tareas.every((t) => t.estado !== "en_curso"), r.tareas.map((t) => `${t.id}:${t.estado}`).join(" "));
  comprobar("el plan se reporta CANCELADO, no fallido", r.estado === "cancelado", `estado=${r.estado}`);
  comprobar("y ninguna tarea figura como hecha sin estarlo", r.resumen!.hechas === 0, `hechas=${r.resumen?.hechas}`);
}

// ─── 9. TERMINA aunque no quepa (la regla del usuario) ──────────────────────

async function t9_termina_aunque_no_quepa(): Promise<void> {
  const s = sondaNueva();
  const plan = crearPlan(
    "no cabe, pero acaba",
    Array.from({ length: 6 }, (_, i) => ({ id: String(i + 1), titulo: `io ${i + 1}`, peso: "io" as const }))
  );
  // 1,2 GB libres en un perfil MR#2 (colchón 1,5 GB): no cabe ni una tarea.
  const apre = resolverPresupuesto({ ramMedidaGB: 8, ramLibreGB: 1.2, nucleos: 4, escalado: 1 });
  comprobar("el presupuesto se degrada a 1 tarea a la vez", apre.io === 1 && apre.degradado === true, `io=${apre.io}`);

  const t0 = Date.now();
  const r = await ejecutarPlan(plan, { ejecutar: ejecutor(200, s), medir: medir({ ramMedidaGB: 8, ramLibreGB: 1.2, nucleos: 4 }) });
  const total = Date.now() - t0;

  comprobar("las 6 terminan igualmente (no se descarta ninguna)", r.resumen!.hechas === 6, `hechas=${r.resumen?.hechas}`);
  comprobar("el plan queda HECHO, no parcial", r.estado === "hecho", `estado=${r.estado}`);
  comprobar("va de una en una: más lento, pero termina", s.maxIo === 1, `maxIo=${s.maxIo}`);
  comprobar("tarda lo que tiene que tardar, no menos", total >= 1100, `tardó ${total} ms`);
  comprobar("el log deja el reparto escrito", (r.log || []).some((l) => /presupuesto: MR2/.test(l)));
}

// ─── 10. Reanudación ────────────────────────────────────────────────────────

async function t10_reanudacion(): Promise<void> {
  const s = sondaNueva();
  const plan = crearPlan("reanudar", [
    { id: "1", titulo: "ya hecha", estado: "hecha" },
    { id: "2", titulo: "venía en curso (servidor reiniciado)", estado: "en_curso", dependeDe: ["1"] },
    { id: "3", titulo: "nueva", dependeDe: ["2"] },
  ]);
  const r = await ejecutarPlan(plan, {
    ejecutar: ejecutor(20, s),
    medir: medir({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
  });
  comprobar("no se repite lo que ya estaba hecha", !s.llamadas.includes("1") && s.llamadas.includes("2") && s.llamadas.includes("3"), s.llamadas.join(","));
  comprobar("una tarea que quedó «en curso» se reintenta en vez de colgarse", r.tareas.find((t) => t.id === "2")!.estado === "hecha");
  comprobar("el plan reanudado termina HECHO", r.estado === "hecho", `estado=${r.estado}`);
}

// ─── 11. El agregado no miente ──────────────────────────────────────────────

async function t11_resumen_honesto(): Promise<void> {
  const plan = crearPlan("con un fallo", [
    { id: "1", titulo: "va bien" },
    { id: "2", titulo: "revienta" },
    { id: "3", titulo: "depende del que revienta", dependeDe: ["2"] },
  ]);
  const r = await ejecutarPlan(plan, {
    ejecutar: async (t) => {
      if (t.id === "2") throw new Error("invalid api key: no se puede arreglar"); // fatal → sin reintento
      return { resumen: "ok" };
    },
    medir: medir({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
  });
  comprobar("un plan con un fallo NO se reporta como hecho", r.estado === "parcial", `estado=${r.estado}`);
  comprobar("cuenta la fallida", r.resumen!.fallidas === 1);
  comprobar("la dependiente queda BLOQUEADA, no perdida", r.tareas.find((t) => t.id === "3")!.estado === "bloqueada");
  comprobar("y el motivo nombra a quién la bloqueó", /#2/.test(r.tareas.find((t) => t.id === "3")!.motivoEspera || ""), r.tareas.find((t) => t.id === "3")!.motivoEspera);
  comprobar("«sinHacer» lista exactamente lo que falta", r.resumen!.sinHacer.length === 2, JSON.stringify(r.resumen!.sinHacer));
  comprobar("«noTerminadas» avisa con motivo", (r.noTerminadas || []).length === 1 && !!r.noTerminadas![0].motivo);
  comprobar("un error fatal no se reintenta", r.tareas.find((t) => t.id === "2")!.intentos === 1, `intentos=${r.tareas.find((t) => t.id === "2")!.intentos}`);

  const reparable = crearPlan("reintentable", [{ id: "x", titulo: "se cae una vez" }]);
  let veces = 0;
  const rr = await ejecutarPlan(reparable, {
    ejecutar: async () => {
      veces++;
      if (veces === 1) throw new Error("ECONNRESET"); // retryable
      return { resumen: "a la segunda" };
    },
    medir: medir({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
    maxIntentosPorTarea: 2,
  });
  comprobar("un error reintentable se reintenta y acaba bien", rr.estado === "hecho" && veces === 2, `veces=${veces} estado=${rr.estado}`);

  // Marca explícita de "no reintentar": un tipo de tarea que no existe o una
  // ruta mal escrita NO son fallos de red. Reintentarlos es perder el tiempo.
  const marcado = crearPlan("fatal marcado", [{ id: "m", titulo: "tipo inexistente" }]);
  let vecesMarcado = 0;
  const rm = await ejecutarPlan(marcado, {
    ejecutar: async () => {
      vecesMarcado++;
      const e: any = new Error('Tipo de tarea desconocido: "ejecutar_comando".');
      e.fatal = true;
      throw e;
    },
    medir: medir({ ramMedidaGB: 8, ramLibreGB: 6, nucleos: 4 }),
    maxIntentosPorTarea: 3,
  });
  comprobar("un error MARCADO como fatal no se reintenta (ni con 3 intentos)", vecesMarcado === 1, `veces=${vecesMarcado}`);
  comprobar("y se clasifica como fatal, no como retryable", marcado.tareas[0].error?.clase === "fatal", String(marcado.tareas[0].error?.clase));
  // Ojo con la expectativa: con UNA sola tarea y ninguna hecha, el plan es
  // «fallido», no «parcial». La regla es hechas===0 → fallido, y es la correcta:
  // llamar «parcial» a un plan donde no se ha completado nada sería mentir un
  // poco, que es exactamente lo que este motor no hace.
  comprobar("y con cero hechas el plan queda FALLIDO, no «parcial»", rm.estado === "fallido", rm.estado);
  comprobar("y no se marca como hecho en ningún caso", rm.estado !== "hecho");

  console.log("\n  muestra del panel:");
  r.tareas.forEach((t) => console.log(`    ${lineaEstadoTarea(t)}`));
}

// ─── Ejecución ──────────────────────────────────────────────────────────────

(async () => {
  console.log("═══ PRUEBAS DEL CEREBRO DE TAREAS · CerebroNico v2.2 ═══");
  await conLimite("1. Escalera MR (4/8/16/32)", 5_000, t1_escalera);
  await conLimite("2. Botón de escalado ×1 ×2 ×4 ×6 ×8", 5_000, t2_boton);
  await conLimite("3. El presupuesto nunca es 0", 5_000, t3_nunca_cero);
  await conLimite("4. Grafo de dependencias y orden", 10_000, t4_grafo);
  await conLimite("5. Ciclo detectado sin colgarse", 5_000, t5_ciclo);
  await conLimite("6. Paralelismo real de tareas de espera", 10_000, t6_paralelismo);
  await conLimite("7. La CPU no se paraleliza", 10_000, t7_cpu_secuencial);
  await conLimite("8. Cancelación limpia", 15_000, t8_cancelacion);
  await conLimite("9. Termina aunque no quepa", 15_000, t9_termina_aunque_no_quepa);
  await conLimite("10. Reanudación", 10_000, t10_reanudacion);
  await conLimite("11. El agregado no miente", 10_000, t11_resumen_honesto);

  console.log(`\n═══ RESULTADO: ${pasan} correctas · ${fallan} fallidas ═══`);
  if (fallan > 0) {
    console.log("Fallos:");
    fallos.forEach((f) => console.log(`  · ${f}`));
  }
  process.exitCode = fallan > 0 ? 1 : 0;
})();
