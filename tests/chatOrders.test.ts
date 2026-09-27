/**
 * chatOrders.test.ts — LA ORDEN DEL CHAT (v2.2)
 * ============================================
 * Cierra la cadena chat → conversor → editor → preview. Lo que hay que DEMOSTRAR:
 *   · que una orden bien escrita se interpreta entera
 *   · que una orden MAL escrita se AVISA y NO se ejecuta nada
 *   · que el nombre del archivo de salida sale de la extensión del destino
 *
 * Se ejecuta con:  npx tsx tests/chatOrders.test.ts
 */

import {
  extraerOrdenes,
  nombreSalidaPorDefecto,
  extensionDeFormato,
  instruccionesParaElModelo,
  normalizarPlanDesdeOrden,
  MAX_TAREAS_POR_ORDEN,
} from "../src/engine/chatOrders";

/** Un plan mínimo correcto, para reutilizarlo en las pruebas. */
const PLAN_BUENO = {
  objetivo: "Convertir los datos a dos formatos",
  tareas: [
    { id: "1", titulo: "leer", tipo: "leer_archivo", peso: "io", datos: { ruta: "datos.csv" } },
    { id: "2", titulo: "a YAML", tipo: "convertir", datos: { desde: "csv", hacia: "yaml", archivo: "datos.csv" }, dependeDe: ["1"] },
    { id: "3", titulo: "a TOML", tipo: "convertir", datos: { desde: "csv", hacia: "toml", archivo: "datos.csv" }, dependeDe: ["1"] },
  ],
};

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];

function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) {
    pasan++;
    console.log(`  PASS   ${nombre}`);
  } else {
    fallan++;
    fallos.push(nombre);
    console.log(`  FALLO  ${nombre}${detalle ? `  ·  ${detalle}` : ""}`);
  }
}

console.log("═══ PRUEBAS DE ÓRDENES DEL CHAT · CerebroNico v2.2 ═══\n");

// ─── 1. Una orden de conversión correcta ────────────────────────────────────

{
  const msg = [
    "Claro, te lo convierto.",
    "",
    "```cerebronico:convertir",
    '{"desde":"json","hacia":"yaml","archivo":"package.json"}',
    "```",
  ].join("\n");
  const { ordenes, avisos } = extraerOrdenes(msg);
  comprobar("se extrae una orden", ordenes.length === 1, `${ordenes.length}`);
  comprobar("es de tipo convertir", ordenes[0]?.tipo === "convertir");
  const o: any = ordenes[0];
  comprobar("con los formatos correctos", o?.desde === "json" && o?.hacia === "yaml");
  comprobar("con el archivo de origen", o?.archivo === "package.json");
  comprobar("y el nombre de salida derivado del destino", o?.salida === "package.yaml", o?.salida);
  comprobar("sin avisos", avisos.length === 0, avisos.join(" | "));
  comprobar("y no se traga el texto de alrededor", !JSON.stringify(ordenes).includes("Claro, te lo convierto"));
}

// ─── 2. Nombre de salida: casos que importan ───────────────────────────────

{
  comprobar("package.json → toml da package.toml", nombreSalidaPorDefecto("package.json", "toml") === "package.toml", nombreSalidaPorDefecto("package.json", "toml"));
  comprobar("respeta rutas y se queda con el nombre", nombreSalidaPorDefecto("config/datos.csv", "json") === "datos.json", nombreSalidaPorDefecto("config/datos.csv", "json"));
  comprobar("sin extensión también funciona", nombreSalidaPorDefecto("notas", "yaml") === "notas.yaml", nombreSalidaPorDefecto("notas", "yaml"));
  comprobar("sin nombre usa «convertido»", nombreSalidaPorDefecto("", "json") === "convertido.json", nombreSalidaPorDefecto("", "json"));
  comprobar("yaml se escribe .yaml (no .yml)", extensionDeFormato("yaml") === "yaml");
  comprobar("con barra invertida de Windows también", nombreSalidaPorDefecto("config\\datos.json", "csv") === "datos.csv", nombreSalidaPorDefecto("config\\datos.json", "csv"));
}

// ─── 3. Órdenes mal escritas: avisan y NO se ejecutan ─────────────────────

{
  const jsonRoto = extraerOrdenes('```cerebronico:convertir\n{esto no es json}\n```');
  comprobar("un JSON roto NO produce orden", jsonRoto.ordenes.length === 0);
  comprobar("y avisa de que no es JSON válido", jsonRoto.avisos.some((a) => /no es JSON válido/.test(a)), jsonRoto.avisos.join(" | "));

  const formatoMalo = extraerOrdenes('```cerebronico:convertir\n{"desde":"xml","hacia":"yaml","archivo":"a.xml"}\n```');
  comprobar("un formato desconocido NO produce orden", formatoMalo.ordenes.length === 0);
  comprobar("y dice cuáles valen", formatoMalo.avisos.some((a) => /json, yaml, toml, csv/.test(a)), formatoMalo.avisos.join(" | "));

  const mismoFormato = extraerOrdenes('```cerebronico:convertir\n{"desde":"json","hacia":"json","archivo":"a.json"}\n```');
  comprobar("origen y destino iguales se rechazan con motivo", mismoFormato.ordenes.length === 0 && mismoFormato.avisos.some((a) => /mismo formato/.test(a)));

  const sinDatos = extraerOrdenes('```cerebronico:convertir\n{"desde":"json","hacia":"yaml"}\n```');
  comprobar("sin archivo ni contenido se rechaza", sinDatos.ordenes.length === 0 && sinDatos.avisos.some((a) => /falta «archivo» o «contenido»/.test(a)));

  const tipoRaro = extraerOrdenes("```cerebronico:borrar\npackage.json\n```");
  comprobar("una orden que no existe se avisa, no se ejecuta", tipoRaro.ordenes.length === 0 && tipoRaro.avisos.some((a) => /no es una orden conocida/.test(a)), tipoRaro.avisos.join(" | "));
}

// ─── 4. Abrir en el editor ────────────────────────────────────────────────

{
  const { ordenes } = extraerOrdenes("```cerebronico:abrir\nsrc/main.tsx\n```");
  comprobar("la orden «abrir» se interpreta", ordenes.length === 1 && ordenes[0].tipo === "abrir");
  comprobar("con su ruta", (ordenes[0] as any).ruta === "src/main.tsx");
  const vacia = extraerOrdenes("```cerebronico:abrir\n\n```");
  comprobar("«abrir» sin ruta avisa", vacia.ordenes.length === 0 && vacia.avisos.some((a) => /no dice qué archivo/.test(a)));
}

// ─── 5. Varias órdenes y contenido directo ────────────────────────────────

{
  const varias = extraerOrdenes(
    [
      "Voy con las dos.",
      "```cerebronico:convertir",
      '{"desde":"json","hacia":"yaml","archivo":"a.json","salida":"a-en-yaml.yaml"}',
      "```",
      "```cerebronico:convertir",
      '{"desde":"yaml","hacia":"toml","contenido":"a: 1\\nb: x\\n"}',
      "```",
      "```cerebronico:abrir",
      "a-en-yaml.yaml",
      "```",
    ].join("\n")
  );
  comprobar("se extraen las tres órdenes", varias.ordenes.length === 3, `${varias.ordenes.length}`);
  comprobar("se respeta el nombre de salida explícito", (varias.ordenes[0] as any).salida === "a-en-yaml.yaml");
  comprobar("el contenido directo se guarda como tal", (varias.ordenes[1] as any).contenido === "a: 1\nb: x\n", JSON.stringify((varias.ordenes[1] as any).contenido));
  comprobar("y la de abrir va al final", varias.ordenes[2].tipo === "abrir");
  comprobar("sin avisos", varias.avisos.length === 0, varias.avisos.join(" | "));
}

// ─── 6. Sin órdenes no pasa nada ──────────────────────────────────────────

{
  comprobar("un mensaje normal no produce órdenes", extraerOrdenes("Hola, ¿en qué te ayudo?").ordenes.length === 0);
  comprobar("ni avisos falsos", extraerOrdenes("Hola, ¿en qué te ayudo?").avisos.length === 0);
  comprobar("un bloque de código normal se ignora", extraerOrdenes("```ts\nconst a = 1;\n```").ordenes.length === 0);
  comprobar("texto vacío no rompe", extraerOrdenes("").ordenes.length === 0);
  comprobar("ni undefined", extraerOrdenes(undefined as any).ordenes.length === 0);
}

// ─── 7. La instrucción que se le da al modelo ─────────────────────────────

{
  const ins = instruccionesParaElModelo();
  comprobar("explica la orden al modelo", ins.includes("cerebronico:convertir"));
  comprobar("nombra los formatos", /json, yaml, toml, csv/.test(ins));
  comprobar("y le obliga a avisar de las pérdidas", /pérdidas/i.test(ins) && /JSON no admite comentarios/.test(ins));
  comprobar("incluye también la orden de abrir", ins.includes("cerebronico:abrir"));
}

// ─── 8. La orden de PLAN: lo que se acepta ────────────────────────────────

{
  const msg = [
    "Voy a montarlo en paralelo.",
    "```cerebronico:plan",
    JSON.stringify(PLAN_BUENO),
    "```",
  ].join("\n");
  const { ordenes, avisos } = extraerOrdenes(msg);
  comprobar("se extrae una orden de plan", ordenes.length === 1 && ordenes[0].tipo === "plan", `${ordenes.length}`);
  const p: any = ordenes[0];
  comprobar("con su objetivo", p?.objetivo === PLAN_BUENO.objetivo);
  comprobar("y sus tres tareas", p?.tareas?.length === 3, `${p?.tareas?.length}`);
  comprobar("conservando la dependencia", JSON.stringify(p?.tareas?.[1]?.dependeDe) === '["1"]', JSON.stringify(p?.tareas?.[1]?.dependeDe));
  comprobar("conservando el peso declarado", p?.tareas?.[0]?.peso === "io");
  comprobar("y sin avisos", avisos.length === 0, avisos.join(" | "));
  comprobar("por defecto SÍ se lanza", p?.autoLanzar === true);
}

{
  const r = normalizarPlanDesdeOrden({ ...PLAN_BUENO, autoLanzar: false });
  comprobar("`autoLanzar:false` se respeta (plan preparado sin arrancar)", r.ok === true && r.orden.autoLanzar === false);
}

{
  // Sin «tipo» se asume «modelo», igual que hace el motor.
  const r = normalizarPlanDesdeOrden({ objetivo: "x", tareas: [{ titulo: "pensar", datos: { prompt: "hola" } }] });
  comprobar("una tarea sin «tipo» se asume «modelo»", r.ok === true && r.orden.tareas[0].tipo === "modelo");
  comprobar("y se le pone id por defecto", r.ok === true && r.orden.tareas[0].id === "1");
}

{
  // El modelo y el contexto de la raíz viajan al plan.
  const r = normalizarPlanDesdeOrden({ ...PLAN_BUENO, modelo: "llama3", contexto: "eres breve" });
  comprobar("el modelo de la raíz se conserva", r.ok === true && r.orden.modelo === "llama3");
  comprobar("y el contexto también", r.ok === true && r.orden.contexto === "eres breve");
}

// ─── 9. La orden de PLAN: lo que se RECHAZA, con motivo ───────────────────

{
  const casos: Array<[string, any, RegExp]> = [
    ["sin objetivo", { tareas: PLAN_BUENO.tareas }, /falta «objetivo»/i],
    ["sin tareas", { objetivo: "x", tareas: [] }, /no trae «tareas»/i],
    ["tareas que no es lista", { objetivo: "x", tareas: "nada" }, /no trae «tareas»/i],
    ["id repetido", { objetivo: "x", tareas: [{ id: "1", titulo: "a", tipo: "leer_archivo", datos: { ruta: "a" } }, { id: "1", titulo: "b", tipo: "leer_archivo", datos: { ruta: "b" } }] }, /repetido/i],
    ["dependencia inexistente", { objetivo: "x", tareas: [{ id: "1", titulo: "a", tipo: "leer_archivo", datos: { ruta: "a" }, dependeDe: ["99"] }] }, /no existe/i],
    ["depende de sí misma", { objetivo: "x", tareas: [{ id: "1", titulo: "a", tipo: "leer_archivo", datos: { ruta: "a" }, dependeDe: ["1"] }] }, /sí misma/i],
    ["ciclo", { objetivo: "x", tareas: [{ id: "1", titulo: "a", tipo: "leer_archivo", datos: { ruta: "a" }, dependeDe: ["2"] }, { id: "2", titulo: "b", tipo: "leer_archivo", datos: { ruta: "b" }, dependeDe: ["1"] }] }, /[Cc]iclo/],
    ["tipo desconocido", { objetivo: "x", tareas: [{ id: "1", titulo: "a", tipo: "ejecutar_comando", datos: { cmd: "ls" } }] }, /desconocido/i],
    ["leer_archivo sin ruta", { objetivo: "x", tareas: [{ id: "1", titulo: "a", tipo: "leer_archivo", datos: {} }] }, /datos\.ruta/i],
    ["convertir sin formato", { objetivo: "x", tareas: [{ id: "1", titulo: "a", tipo: "convertir", datos: { hacia: "yaml", archivo: "a.json" } }] }, /datos\.desde/i],
    ["convertir sin contenido ni archivo", { objetivo: "x", tareas: [{ id: "1", titulo: "a", tipo: "convertir", datos: { desde: "json", hacia: "yaml" } }] }, /nada que convertir/i],
  ];
  for (const [nombre, entrada, patron] of casos) {
    const r = normalizarPlanDesdeOrden(entrada);
    comprobar(`se rechaza: ${nombre}`, r.ok === false && patron.test(r.error), r.ok ? "NO se rechazó" : r.error);
  }
}

{
  const gordo = { objetivo: "x", tareas: Array.from({ length: MAX_TAREAS_POR_ORDEN + 1 }, (_, i) => ({ id: String(i + 1), titulo: "t", tipo: "leer_archivo", datos: { ruta: "a" } })) };
  const r = normalizarPlanDesdeOrden(gordo);
  comprobar(`un plan de más de ${MAX_TAREAS_POR_ORDEN} tareas se rechaza`, r.ok === false && /tope/i.test(r.error), r.ok ? "NO se rechazó" : r.error);
}

{
  const roto = extraerOrdenes('```cerebronico:plan\n{no es json}\n```');
  comprobar("un plan con JSON roto NO produce orden", roto.ordenes.length === 0);
  comprobar("y avisa con el motivo", roto.avisos.some((a) => /no es JSON válido/.test(a)), roto.avisos.join(" | "));

  const malo = extraerOrdenes('```cerebronico:plan\n{"objetivo":"x","tareas":[]}\n```');
  comprobar("un plan inválido se avisa como rechazado", malo.ordenes.length === 0 && malo.avisos.some((a) => /rechazada/.test(a)), malo.avisos.join(" | "));
}

// ─── 10. La orden de plan se le explica al modelo ─────────────────────────

{
  const ins = instruccionesParaElModelo();
  comprobar("explica la orden de plan", ins.includes("cerebronico:plan"));
  comprobar("nombra los tres tipos de tarea", /modelo/.test(ins) && /leer_archivo/.test(ins) && /convertir/.test(ins));
  comprobar("avisa de que NO existe «ejecutar comando»", /no hay «ejecutar comando»|NO existe/i.test(ins));
  comprobar("y dice las reglas que se verifican", /dependencias circulares/i.test(ins));
}

console.log(`\n═══ RESULTADO: ${pasan} correctas · ${fallan} fallidas ═══`);
if (fallan > 0) {
  console.log("Fallos:");
  fallos.forEach((f) => console.log(`  · ${f}`));
}
process.exitCode = fallan > 0 ? 1 : 0;
