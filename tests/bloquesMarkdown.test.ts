/**
 * tests/bloquesMarkdown.test.ts — las vallas no se comen el mensaje
 * ================================================================
 * Se ejecuta con:  npx tsx tests/bloquesMarkdown.test.ts
 *
 * El caso real, oído: el modelo respondió con un documento de patente dentro de
 * una valla (` ``` text file="documentacion/memoria-patente-ampliada.txt" `) y
 * la voz dijo «bloque de código omitido» con el audio cortado. La valla entera
 * —contenido incluido— se había sustituido por esa frase.
 */

import {
  esBloqueDocumento,
  quitarVallasConservandoTexto,
  LENGUAJES_DOCUMENTO,
  anotarBloquesSinExplicacion,
  CHIP_SIN_EXPLICACION,
} from "../src/utils/bloquesMarkdown";
import { asegurarCabeceraArchivo } from "../src/engine/certezaModelo";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

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

seccion("1. ¿Qué es un documento y qué es código?");

afirmar("sin lenguaje (```` ``` ````) es documento", esBloqueDocumento(""));
afirmar("`text` es documento", esBloqueDocumento("text"));
afirmar("`markdown` es documento", esBloqueDocumento("markdown"));
afirmar("`md` es documento", esBloqueDocumento("md"));
afirmar("`txt` es documento", esBloqueDocumento("txt"));
afirmar("`json` es documento (es un dato, no un programa)", esBloqueDocumento("json"));
afirmar("`csv` es documento", esBloqueDocumento("csv"));
afirmar("★ con rótulo file=\"…\" es documento aunque el lenguaje no se conozca", esBloqueDocumento("text file=\"documentacion/memoria.txt\""));
afirmar("★ y también con un lenguaje raro + file=", esBloqueDocumento("weird file=\"x.txt\""));
afirmar("`js` NO es documento", !esBloqueDocumento("js"));
afirmar("`typescript` NO es documento", !esBloqueDocumento("typescript"));
afirmar("`python` NO es documento", !esBloqueDocumento("python"));
afirmar("`bash` NO es documento", !esBloqueDocumento("bash"));
afirmar("no distingue mayúsculas", esBloqueDocumento("TEXT"));
afirmar("lista de lenguajes de documento no vacía", LENGUAJES_DOCUMENTO.length > 5);

seccion("2. El documento se lee ENTERO");

{
  const doc = '``` text file="documentacion/memoria-patente-ampliada.txt"\n1. TÍTULO DE LA INVENCIÓN: Sistema y método.\n\n2. CAMPO TÉCNICO: herramientas de desarrollo.\n```';
  const voz = quitarVallasConservandoTexto(doc, { codigo: "callar" });
  afirmar("★ conserva el título", voz.includes("TÍTULO DE LA INVENCIÓN"));
  afirmar("★ conserva el campo técnico", voz.includes("CAMPO TÉCNICO"));
  afirmar("★ y NO dice «omitido»", !/omitido/i.test(voz), voz.slice(0, 60));
  afirmar("y no queda ni una valla", !voz.includes("```"), voz.slice(0, 60));
}

{
  const doc = "```markdown\n# Título\n\nUn párrafo.\n```";
  const voz = quitarVallasConservandoTexto(doc, { codigo: "callar" });
  afirmar("un markdown sin rótulo también se conserva", voz.includes("Un párrafo"));
}

seccion("3. El código de verdad se calla, pero EN SILENCIO");

{
  const codigo = "```js\nconst x = 1;\nconsole.log(x);\n```";
  const voz = quitarVallasConservandoTexto(codigo, { codigo: "callar" });
  afirmar("no lee el código", !voz.includes("console.log"), JSON.stringify(voz));
  afirmar("★ y NO lo anuncia en voz alta", !/omitido/i.test(voz), JSON.stringify(voz));
}

{
  const codigo = "```js\nconst x = 1;\n```";
  const exportado = quitarVallasConservandoTexto(codigo, { codigo: "nota" });
  afirmar("al exportar sí queda la nota", /omitido/i.test(exportado), JSON.stringify(exportado));
}

seccion("4. Casos de forma");

{
  const mezcla = "Mira esto:\n\n```js\nconst a = 1;\n```\n\nY el documento:\n\n```text\nHola.\n```\n";
  const voz = quitarVallasConservandoTexto(mezcla, { codigo: "callar" });
  afirmar("conserva la prosa de fuera", voz.includes("Mira esto") && voz.includes("Y el documento"));
  afirmar("conserva el documento", voz.includes("Hola"));
  afirmar("y calla el código", !voz.includes("const a"));
}

{
  const sinCerrar = "```text\nUn documento que se cortó";
  const voz = quitarVallasConservandoTexto(sinCerrar, { codigo: "callar" });
  afirmar("★ una valla sin cerrar se trata como documento (es lo que hay)", voz.includes("Un documento que se cortó"), voz);
}

{
  const sinVallas = "Solo prosa, sin una sola valla.";
  afirmar("sin vallas no se toca nada", quitarVallasConservandoTexto(sinVallas, { codigo: "callar" }) === sinVallas);
}

afirmar("cadena vacía no revienta", quitarVallasConservandoTexto("", { codigo: "callar" }) === "");

seccion("5. F2 — la entrega de código siempre explicada");

{
  const conCabecera = '**hola.py** — un saludo\n```python file="hola.py"\nprint("hola")\n```';
  const r = anotarBloquesSinExplicacion(conCabecera);
  afirmar("bloque con cabecera → sin chip", !r.includes(CHIP_SIN_EXPLICACION), r);
}

{
  const conFiesta = '```python file="hola.py"\nprint("hola")\n```\nSe ejecuta con `python hola.py`.';
  const r = anotarBloquesSinExplicacion(conFiesta);
  afirmar("bloque con frase debajo → sin chip", !r.includes(CHIP_SIN_EXPLICACION), r);
}

{
  const mudo = '```python file="hola.py"\nprint("hola")\n```';
  const r = anotarBloquesSinExplicacion(mudo);
  afirmar("bloque mudo → con chip", r.includes(CHIP_SIN_EXPLICACION), r);
}

{
  const snippet = "```js\nconst x = 1;\n```";
  const r = anotarBloquesSinExplicacion(snippet);
  afirmar("snippet SIN file= → exento", r === snippet);
}

{
  const sinCabecera = '```python file="src/main.py"\nprint("hola")\n```';
  const r = asegurarCabeceraArchivo(sinCabecera);
  afirmar("el revisor añade la cabecera con la ruta", r.includes("**src/main.py** — entregado por el motor"), r);
}

{
  const conCabecera = '**main.py** — arranque\n```python file="src/main.py"\nprint("hola")\n```';
  const r = asegurarCabeceraArchivo(conCabecera);
  afirmar("el revisor no duplica una cabecera existente", !r.includes("entregado por el motor"), r);
}

seccion("6. F2 — enganchado de verdad (leído del fuente)");

{
  const chat = leer("src/components/ChatCenter.tsx");
  afirmar(
    "el guardián corre en el único punto de render (componerCuerpo)",
    /anotarBloquesSinExplicacion\(limpiarMetadatosDeCierre\(repairNumberedListsAndGaps\(texto\)\)\)/.test(chat),
    "componerCuerpo debe aplicar anotarBloquesSinExplicacion"
  );
}
{
  const prompt = leer("src/engine/superPrompt.ts");
  afirmar(
    "la regla FILE_PROTOCOL ordena explicar cada bloque file=…",
    /un bloque de código nunca viaja mudo/.test(prompt) && /file="ruta"/.test(prompt),
    "la regla de prompt debe exigir cabecera y fiesta"
  );
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ BLOQUES MARKDOWN: ${pasadas} correctas · ${falladas} fallidas ═══`);
console.log("─".repeat(56));
if (falladas > 0) process.exit(1);
