/**
 * panel.test.ts — EL INTÉRPRETE DE TAREAS DEL PANEL (v2.2)
 * =======================================================
 * El panel tiene una sola pieza con lógica de verdad: convertir lo que escribes
 * en el formulario (una tarea por línea) en tareas para el motor. El resto es
 * pintar. Así que se prueba eso, que es donde puede haber errores de verdad.
 *
 * Lo que se DEMUESTRA:
 *   · que una línea correcta produce la tarea correcta
 *   · que una línea MAL escrita se AVISA, no se ignora en silencio
 *   · que un tipo que no existe no se cuela como si nada
 *
 * Se ejecuta con:  npx tsx tests/panel.test.ts
 */

import { parsearTareas } from "../src/components/PlansPanel";

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

console.log("═══ PRUEBAS DEL PANEL DEL PLANIFICADOR · CerebroNico v2.2 ═══\n");
console.log("── El intérprete de tareas ──");

// ─── 1. Una tarea mínima ────────────────────────────────────────────────────

{
  const { tareas, avisos } = parsearTareas("leer | leer_archivo | package.json");
  comprobar("una línea simple produce una tarea", tareas.length === 1, `${tareas.length}`);
  comprobar("con el tipo correcto", tareas[0]?.tipo === "leer_archivo", tareas[0]?.tipo);
  comprobar("con la ruta en datos.ruta", tareas[0]?.datos?.ruta === "package.json", JSON.stringify(tareas[0]?.datos));
  comprobar("con id «1» y sin dependencias", tareas[0]?.id === "1" && tareas[0]?.dependeDe.length === 0);
  comprobar("y sin avisos: la línea estaba bien", avisos.length === 0, avisos.join(" | "));
}

// ─── 2. Convertir: origen>destino y archivo o contenido ─────────────────────

{
  const conArchivo = parsearTareas("paquete a YAML | convertir | package.json | json>yaml");
  comprobar("convertir con archivo pone datos.archivo", conArchivo.tareas[0]?.datos?.archivo === "package.json", JSON.stringify(conArchivo.tareas[0]?.datos));
  comprobar("y los formatos desde/hacia", conArchivo.tareas[0]?.datos?.desde === "json" && conArchivo.tareas[0]?.datos?.hacia === "yaml");
  comprobar("y un nombre de salida derivado del título", /^paquete-a-yaml/.test(String(conArchivo.tareas[0]?.datos?.salida)), String(conArchivo.tareas[0]?.datos?.salida));

  const conTexto = parsearTareas('config | convertir | {"a":1} | json>toml');
  comprobar("si el dato NO parece ruta, va como contenido", conTexto.tareas[0]?.datos?.contenido === '{"a":1}', JSON.stringify(conTexto.tareas[0]?.datos));
  comprobar("y no se inventa un archivo", conTexto.tareas[0]?.datos?.archivo === undefined);

  const sinExtra = parsearTareas("algo | convertir | package.json");
  comprobar("convertir sin origen>destino AVISA", sinExtra.avisos.some((a) => /origen>destino/.test(a)), sinExtra.avisos.join(" | "));
}

// ─── 3. Modelo por defecto y tipo inventado ────────────────────────────────

{
  const modelo = parsearTareas("resumir hallazgos");
  comprobar("una línea sin tipo se trata como «modelo»", modelo.tareas[0]?.tipo === "modelo", modelo.tareas[0]?.tipo);
  comprobar("y el prompt cae al título si no hay 3ª columna", modelo.tareas[0]?.datos?.prompt === "resumir hallazgos", String(modelo.tareas[0]?.datos?.prompt));

  const inventado = parsearTareas("algo | ejecutar_comando | rm -rf /");
  comprobar("un tipo que no existe NO se cuela", inventado.tareas[0]?.tipo === "modelo", inventado.tareas[0]?.tipo);
  comprobar("y se AVISA de que no existe", inventado.avisos.some((a) => /no existe/.test(a)), inventado.avisos.join(" | "));
}

// ─── 4. Dependencias y peso ────────────────────────────────────────────────

{
  const conDeps = parsearTareas("primera\nsegunda | modelo | hazlo | | 1");
  comprobar("la 5ª columna son las dependencias", conDeps.tareas[1]?.dependeDe.join(",") === "1", JSON.stringify(conDeps.tareas[1]?.dependeDe));
  const varias = parsearTareas("x | modelo | y | | 1, 2 ,3");
  comprobar("varias dependencias separadas por comas, con espacios", varias.tareas[0]?.dependeDe.join(",") === "1,2,3", JSON.stringify(varias.tareas[0]?.dependeDe));

  const cpu = parsearTareas("compilar el front | leer_archivo | x.json");
  comprobar("una tarea de compilar se marca como cpu", cpu.tareas[0]?.peso === "cpu", cpu.tareas[0]?.peso);
  const io = parsearTareas("leer un archivo | leer_archivo | x.json");
  comprobar("una lectura se queda en io", io.tareas[0]?.peso === "io", io.tareas[0]?.peso);
}

// ─── 5. Líneas que no son tareas ───────────────────────────────────────────

{
  const mezcla = parsearTareas("# esto es un comentario\n\n  \nuno | leer_archivo | a.json\n\n# otro comentario\ndos | leer_archivo | b.json");
  comprobar("los comentarios y las líneas vacías se ignoran", mezcla.tareas.length === 2, `${mezcla.tareas.length}`);
  comprobar("y los ids van 1,2 sin huecos", mezcla.tareas.map((t) => t.id).join(",") === "1,2", mezcla.tareas.map((t) => t.id).join(","));

  const vacio = parsearTareas("   \n\n");
  comprobar("sin líneas no hay tareas", vacio.tareas.length === 0);
  comprobar("y no se inventa ningún aviso raro", vacio.avisos.length === 0, vacio.avisos.join(" | "));

  const leerSinRuta = parsearTareas("leer algo | leer_archivo");
  comprobar("leer_archivo sin ruta AVISA", leerSinRuta.avisos.some((a) => /necesita la ruta/.test(a)), leerSinRuta.avisos.join(" | "));
}

// ─── 6. El payload que se manda al motor es el que espera ─────────────────

{
  const { tareas } = parsearTareas("a | leer_archivo | x.json\nb | convertir | x.json | json>csv | 1");
  const claves = new Set(Object.keys(tareas[0]));
  comprobar("cada tarea lleva id, titulo, tipo, datos, peso y dependeDe", ["id", "titulo", "tipo", "datos", "peso", "dependeDe"].every((k) => claves.has(k)), [...claves].join(","));
  comprobar("los datos son un objeto (no un texto)", typeof tareas[0].datos === "object" && tareas[0].datos !== null);
  const json = JSON.stringify({ objetivo: "x", tareas });
  let parseable = false;
  try {
    JSON.parse(json);
    parseable = true;
  } catch {}
  comprobar("el conjunto se puede serializar tal cual para la API", parseable);
}

console.log(`\n═══ RESULTADO: ${pasan} correctas · ${fallan} fallidas ═══`);
if (fallan > 0) {
  console.log("Fallos:");
  fallos.forEach((f) => console.log(`  · ${f}`));
}
process.exitCode = fallan > 0 ? 1 : 0;
