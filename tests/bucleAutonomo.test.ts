/**
 * tests/bucleAutonomo.test.ts — EL BUCLE NO SE QUEDA A MITAD (v1.16.0)
 * ====================================================================
 * Se ejecuta con:  npx tsx tests/bucleAutonomo.test.ts
 *
 * La petición del usuario: «el modelo no debe detenerse a la mitad de una
 * tarea; si ya se le marcó un destino que sepa solo por cuál camino ir, o si
 * tiene que dar la vuelta para tomar otro; si falla, seguir con la solución y
 * no esperar a que le digan "continúa con…"».
 *
 * Esta suite deja CIEGO el defecto que se vino corrigiendo desde v1.15.1:
 * aquel empuje solo miraba respuestas cortas (<160 caracteres) en futuro, así
 * que una intención larga se escapaba y el chat se quedaba esperando. Y cuando
 * se agotaban los pasos, el bucle respondía «Completado» con tareas colgando.
 */
import {
  normalizarEstado,
  actualizarPlanDesdeHerramienta,
  tareasPendientes,
  techoDePasos,
  motivoDeParada,
  directivaDeContinuacion,
  informeHonesto,
  decidirBucle,
  PASOS_TOPE,
  type TareaPlan,
} from "../src/engine/bucleAutonomo";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) {
    correctas++;
    console.log(`  ✓ ${que}`);
  } else {
    fallos.push(que + (detalle ? ` — ${detalle}` : ""));
    console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};
const seccion = (t: string) => console.log(`\n${t}`);
const plan = (...t: TareaPlan[]) => t;

seccion("1. El estado que reporta el modelo llega normalizado");
comprobar("completed → done", normalizarEstado("completed") === "done");
comprobar("in_progress → running", normalizarEstado("in_progress") === "running");
comprobar("falló → failed", normalizarEstado("fallida") === "failed");
comprobar("un estado desconocido no inventa nada", normalizarEstado("quizás") === null);

seccion("2. El plan se arma desde las propias herramientas del agente");
{
  const p: TareaPlan[] = [];
  actualizarPlanDesdeHerramienta(p, "set_plan", {
    tasks: [
      { id: "1", description: "leer el motor" },
      { id: "2", description: "escribir el módulo" },
      { id: "3", description: "probar" },
    ],
  });
  comprobar("set_plan carga las 3 tareas", p.length === 3);
  comprobar("todas arrancan pendientes", tareasPendientes(p).length === 3);
  actualizarPlanDesdeHerramienta(p, "update_task", { task_id: "1", status: "completed" });
  comprobar("update_task cierra la 1", tareasPendientes(p).length === 2);
  actualizarPlanDesdeHerramienta(p, "update_task", { taskId: "2", status: "done" });
  comprobar("acepta taskId (camel) también", tareasPendientes(p).length === 1);
  actualizarPlanDesdeHerramienta(p, "set_plan", { tasks: [{ id: "9", description: "nuevo plan" }] });
  comprobar("un set_plan nuevo reemplaza el anterior", p.length === 1 && p[0].id === "9");
  actualizarPlanDesdeHerramienta(p, "read_file", { path: "x.ts" });
  comprobar("otra herramienta no toca el plan", p.length === 1);
}

seccion("3. El techo de pasos crece con el plan, pero choca contra un tope");
comprobar("sin plan, el techo es el histórico (10)", techoDePasos(0) === 10);
comprobar("12 tareas abiertas no pueden morir en 10 pasos", techoDePasos(12) > 10, String(techoDePasos(12)));
comprobar("crece de a 3 por tarea", techoDePasos(4) === 10 + 4 * 3, String(techoDePasos(4)));
comprobar("y nunca pasa del tope duro", techoDePasos(999) === PASOS_TOPE, String(techoDePasos(999)));
comprobar("un conteo negativo no lo achica", techoDePasos(-5) === 10);

seccion("4. Distinguir «terminé» de «me quedé a mitad»");
{
  const sinPlan: TareaPlan[] = [];
  // El caso que se escapaba en v1.15.1: intención LARGA (más de 160 caracteres).
  const larga =
    "Voy a revisar uno por uno los seis módulos del motor implicados en el pipeline de inferencia, " +
    "luego analizaré cómo se comunican entre sí y a continuación escribiré las pruebas correspondientes.";
  comprobar("intención larga (el caso que se escapaba) es parada", motivoDeParada(larga, sinPlan) !== null,
    motivoDeParada(larga, sinPlan) ?? "null");
  comprobar("intención corta sigue siendo parada", motivoDeParada("voy a leer el archivo", sinPlan) !== null);
  comprobar("pedir permiso es parada, no final",
    motivoDeParada("Creé el módulo. ¿querés que continúe con los tests?", sinPlan) === "pidió permiso para seguir",
    String(motivoDeParada("Creé el módulo. ¿querés que continúe con los tests?", sinPlan)));
  comprobar("cortarse a mitad de frase es parada",
    motivoDeParada("Los cambios son los siguientes:", sinPlan) !== null);
  comprobar("un cierre real no es parada",
    motivoDeParada("Listo: el módulo quedó creado y las 12 pruebas pasan.", sinPlan) === null,
    String(motivoDeParada("Listo: el módulo quedó creado y las 12 pruebas pasan.", sinPlan)));
  comprobar("respuesta vacía también empuja", motivoDeParada("   ", sinPlan) !== null);
}
{
  // Con tareas abiertas, la prosa de «listo» NO puede cerrar el turno.
  const p = plan({ id: "1", description: "tests", status: "pending" });
  comprobar("«listo» con plan abierto no cierra", motivoDeParada("listo, terminé", p) !== null);
  comprobar("y el motivo nombra lo que falta",
    motivoDeParada("listo", p) === "quedan 1 tarea(s) del plan sin cerrar",
    String(motivoDeParada("listo", p)));
}

seccion("5. Ante un fallo, la directiva manda a desviarse (no a esperar)");
{
  const d = directivaDeContinuacion(
    plan({ id: "2", description: "escribir", status: "pending" }),
    { herramienta: "edit_file", error: "ENOENT: no existe src/x.ts" }
  );
  comprobar("nombra la herramienta que falló", d.includes("edit_file"));
  comprobar("dice que tome OTRO camino", /otro camino|cambiá de herramienta/i.test(d), d.slice(0, 90));
  comprobar("prohíbe devolverle la tarea al usuario", /no esperes instrucciones|no pidas permiso/i.test(d));
  comprobar("no pregunta, ordena ejecutar", /EJECUTÁ/.test(d));
}
{
  const sinFallo = directivaDeContinuacion([], null);
  comprobar("sin fallo también empuja a ejecutar", sinFallo.includes("EJECUTÁ"));
  comprobar("y avisa de no repetir el mismo camino", /no lo repitas igual/.test(sinFallo));
}

seccion("6. El cierre honesto: si falta algo, lo dice");
comprobar("sin pendientes no agrega nada", informeHonesto([], true) === "");
{
  const i = informeHonesto(plan({ id: "3", description: "probar", status: "pending" }), true);
  comprobar("con pasos agotados avisa que NO terminó", /agotó el techo/.test(i), i);
  comprobar("y enumera la tarea abierta", i.includes("probar"));
}

seccion("7. La decisión que toma el bucle");
{
  const d = decidirBucle({
    contenido: "voy a escribir los tests",
    plan: plan({ id: "1", description: "tests", status: "pending" }),
    paso: 2,
    maxPasos: 10,
  });
  comprobar("con plan abierto → continuar", d.accion === "continuar");
  comprobar("y la directiva viaja lista para el mensaje",
    d.accion === "continuar" && d.directiva.includes("No te detengas"));
}
{
  const d = decidirBucle({
    contenido: "Listo, quedó creado y probado.",
    plan: [],
    paso: 3,
    maxPasos: 10,
  });
  comprobar("con tarea cerrada y sin pendientes → cerrar", d.accion === "cerrar");
  comprobar("y no informa nada pendiente", d.accion === "cerrar" && d.informe === "");
}
{
  const d = decidirBucle({
    contenido: "ahora voy con el resto",
    plan: plan({ id: "1", description: "lo que falta", status: "running" }),
    paso: 9,
    maxPasos: 10,
  });
  comprobar("en el último paso se corta igual (no hay bucle infinito)", d.accion === "cerrar");
  comprobar("pero el informe dice qué quedó", d.accion === "cerrar" && d.informe.includes("lo que falta"));
}
{
  const d = decidirBucle({
    contenido: "no pude escribir el archivo, dime cómo seguimos",
    plan: [],
    paso: 1,
    maxPasos: 10,
    ultimoFallo: { herramienta: "write_file", error: "EACCES permiso denegado" },
  });
  comprobar("un fallo con salida de texto NO cierra el turno", d.accion === "continuar");
  comprobar("y la directiva menciona write_file",
    d.accion === "continuar" && d.directiva.includes("write_file"));
}
{
  // El fallo manda sobre la prosa: un «listo» justo después de quebrar no cierra.
  const d = decidirBucle({
    contenido: "Listo, con eso terminamos.",
    plan: [],
    paso: 2,
    maxPasos: 10,
    ultimoFallo: { herramienta: "run_command", error: "exit 1" },
  });
  comprobar("un «listo» tras un fallo no cierra el turno", d.accion === "continuar");
  comprobar("el motivo nombra el fallo", d.accion === "continuar" && d.motivo.includes("run_command"));
}
{
  // Y si el último paso fue bueno, el cierre limpio sí cierra (no se buclea).
  const d = decidirBucle({
    contenido: "Listo: archivo creado y verificado.",
    plan: [],
    paso: 3,
    maxPasos: 10,
    ultimoFallo: null,
  });
  comprobar("sin fallo y con cierre real, el bucle termina", d.accion === "cerrar");
}

seccion("8. Está enganchado de verdad (leído del fuente)");
{
  const server = leer("server.ts");
  comprobar("el bucle del agente decide con el módulo puro",
    server.includes("decidirBucle(") && server.includes("bucleAutonomo"),
    "runOllamaAgentLoop debe llamar a decidirBucle");
  comprobar("el plan se alimenta desde las herramientas",
    server.includes("actualizarPlanDesdeHerramienta("));
  comprobar("y el cierre ya no puede decir «Completado» a ciegas",
    /informeHonesto\(/.test(server));
  comprobar("el empuje viejo de <160 caracteres no volvió",
    !/c\.length < 160/.test(server));
}
{
  const prompt = leer("src/engine/superPrompt.ts");
  comprobar("la regla de autonomía viaja en el prompt de sistema",
    /No te detengas a mitad/.test(prompt));
}
{
  const skills = leer("src/engine/catalogoHonesto.ts");
  comprobar("la habilidad activa amplió su lenguaje (cómo usarla)",
    /C[oó]mo usarla/.test(skills) && existsSync(path.join(RAIZ, "src/engine/bucleAutonomo.ts")));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ BUCLE AUTÓNOMO: ${correctas} correctas · ${fallos.length} fallidas ═══`);
console.log("─".repeat(56));
if (fallos.length > 0) {
  console.log("FALLOS:");
  fallos.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
