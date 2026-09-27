/**
 * tests/autocorrector.test.ts — EL COMPOSER SE CORRIGE SOLO (F1 · v1.16.0)
 * ========================================================================
 * Se ejecuta con:  npx tsx tests/autocorrector.test.ts
 *
 * La petición: «un autocorrector de texto, cuando se va escribiendo se va
 * corrigiendo solo las faltas de ortografía». Determinista (cero tokens):
 * diccionario + pares frecuentes + distancia de edición ≤1.
 *
 * Lo que esta suite BLINDA es lo que el autocorrector NO puede hacer:
 *   · no corregir dentro de código / rutas / identificadores / URLs;
 *   · no auto-reemplazar lo ambiguo («como»→«cómo», «estas»→«estás»);
 *   · ser idempotente (corregir dos veces = una);
 *   · dejar los nombres propios intactos.
 */
import {
  distanciaEdicion,
  quitarTildes,
  esTokenProtegido,
  corregirPalabra,
  corregirLinea,
  type Correccion,
} from "../src/engine/autocorrector";

let pasadas = 0;
let falladas = 0;
const afirmar = (titulo: string, ok: boolean, detalle = "") => {
  if (ok) {
    pasadas++;
    console.log(`  ✔ ${titulo}`);
  } else {
    falladas++;
    console.log(`  ✘ ${titulo}${detalle ? ` → ${detalle}` : ""}`);
  }
};
const seccion = (t: string) => console.log(`\n${t}`);
const buscar = (lista: Correccion[], original: string) =>
  lista.find((c) => c.original === original);

seccion("1. Distancia de edición y quitarTildes");
afirmar("distancia 0 para cadenas iguales", distanciaEdicion("gato", "gato") === 0);
afirmar("distancia 1 para una sustitución", distanciaEdicion("gato", "pato") === 1);
afirmar("distancia 1 para una inserción", distanciaEdicion("hola", "holas") === 1);
afirmar("distancia del vacío es la longitud", distanciaEdicion("", "abc") === 3);
afirmar("quitarTildes quita acentos", quitarTildes("código") === "codigo");
afirmar("quitarTildes descompone la ñ", quitarTildes("niño") === "nino");

seccion("2. Exclusión por token (no por palabra)");
afirmar("protege camelCase", esTokenProtegido("elArchivo"));
afirmar("protege snake_case", esTokenProtegido("mi_variable"));
afirmar("protege rutas Windows", esTokenProtegido("C:\\Archivos\\x.txt"));
afirmar("protege URLs", esTokenProtegido("https://ejemplo.com"));
afirmar("protege versiones/números", esTokenProtegido("v1.16.0"));
afirmar("no protege una palabra normal", !esTokenProtegido("hola"));

seccion("3. Acentos y ñ (modo sugerir)");
{
  const r = corregirLinea("hola como estas", "sugerir");
  afirmar("sugerir NO cambia el texto", r.texto === "hola como estas", r.texto);
  afirmar("sugiere «cómo» para «como»", buscar(r.correcciones, "como")?.corregida === "cómo");
  afirmar("sugiere «estás» para «estas»", buscar(r.correcciones, "estas")?.corregida === "estás");
  afirmar("«hola» no se corrige", !buscar(r.correcciones, "hola"));
  afirmar("«como»→«cómo» es ambiguo (no auto)", buscar(r.correcciones, "como")?.segura === false);
  afirmar("«estas»→«estás» es ambiguo (no auto)", buscar(r.correcciones, "estas")?.segura === false);
}
{
  const r = corregirLinea("tambien codigo rapido", "sugerir");
  afirmar("sugiere «también» como SEGURA", buscar(r.correcciones, "tambien")?.segura === true);
  afirmar("sugiere «código» como SEGURA", buscar(r.correcciones, "codigo")?.segura === true);
  afirmar("sugiere «rápido» como SEGURA", buscar(r.correcciones, "rapido")?.segura === true);
}
{
  const nino = corregirPalabra("nino");
  afirmar("corrige ñ perdida: «nino»→«niño»", nino?.corregida === "niño" && nino?.segura === true);
}

seccion("4. Modo auto: reemplaza lo seguro, respeta lo ambiguo");
afirmar("auto reemplaza «tambien»", corregirLinea("tambien", "auto").texto === "también");
afirmar("auto reemplaza «codigo»", corregirLinea("codigo", "auto").texto === "código");
afirmar("auto reemplaza «rapido»", corregirLinea("rapido", "auto").texto === "rápido");
afirmar("auto separa palabra pegada", corregirLinea("elarchivo", "auto").texto === "el archivo");
afirmar("auto respeta lo ambiguo", corregirLinea("como estas", "auto").texto === "como estas");
afirmar("auto corrige «tambien estas bien» dejando «estas»", corregirLinea("tambien estas bien", "auto").texto === "también estas bien");
afirmar("off no corrige", corregirLinea("tambien", "off").texto === "tambien" && corregirLinea("tambien", "off").correcciones.length === 0);

seccion("5. No corrige dentro de código");
{
  const inline = "Usa `const funciona = 1` para probar";
  afirmar("no toca el código inline", corregirLinea(inline, "auto").texto === inline);
}
{
  const valla = "```js\nconst funciona = 1;\n```";
  afirmar("no toca líneas con valla de código", corregirLinea(valla, "auto").texto === valla);
}
{
  const ruta = "guarda en C:\\Archivos\\x.txt";
  afirmar("no toca rutas de archivo", corregirLinea(ruta, "auto").texto === ruta);
}

seccion("6. Idempotencia y nombres propios");
{
  const una = corregirLinea("tambien rapido", "auto").texto;
  const dos = corregirLinea(una, "auto").texto;
  afirmar("corregir dos veces = una (idempotente)", una === dos && una === "también rápido", `${una} / ${dos}`);
}
afirmar("«Mario» intacto", corregirPalabra("Mario") === null);
afirmar("«CerebróNico» intacto", corregirPalabra("CerebróNico") === null);
afirmar("«Mario Quintero» intacto en auto", corregirLinea("Mario Quintero", "auto").texto === "Mario Quintero");

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ AUTOCORRECTOR (F1 · v1.16.0): ${pasadas} correctas · ${falladas} fallidas ═══`);
console.log("─".repeat(56));
if (falladas > 0) process.exit(1);
