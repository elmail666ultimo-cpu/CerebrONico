/**
 * gen-modelfile.ts — LOS MODelfiles, DESDE LA FUENTE ÚNICA (v2.4)
 * ==============================================================
 * El system prompt de los modelos neurales NO se escribe a mano aquí: se
 * importa de `instruccionesParaElModelo()` — las MISMAS reglas que ya ve el
 * chat. Si alguien cambia las órdenes del IDE, regenera (`npm run modelfiles`)
 * y los Modelfiles cambian solos. Dos fuentes de verdad sobre lo que el modelo
 * sabe hacer es exactamente la enfermedad que este proyecto combate.
 *
 * Uso:  npx tsx scripts/gen-modelfile.ts   →  escribe models/Modelfile.*
 * Los tags se leen de la escalera de `elegirModelo` (misma fuente que el
 * instalador); si aquí y allí divergieran, el test de reflejo lo pilla.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { instruccionesParaElModelo } from "../src/engine/chatOrders";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "models");
mkdirSync(OUT, { recursive: true });

// Espejo de `elegirModelo` (scripts/instalar-modelos.mjs). El test compara
// estas cadenas con las que devuelve la función: si una sube y la otra no,
// hay un fallo, no una discusión.
export const ESCALERA = [
  { tag: "smollm2:135m-instruct-q3_K_S", nombre: "cerebronico-135m", tramo: "MR1 (4 GB)" },
  { tag: "smollm2:360m", nombre: "cerebronico-360m", tramo: "MR2 (8 GB)" },
  { tag: "smollm2:1.7b", nombre: "cerebronico-1.7b", tramo: "MR3+ (16/32 GB)" },
];

export function construirModelfile(tag: string): string {
  const sistema = [
    "Eres el reflejo neural de CerebroNico IDE. Tu única tarea: convertir la frase del usuario en una orden del IDE, o responder un cálculo con la verdad.",
    "Reglas duras:",
    "· Emite SOLO bloques ```cerebronico:...``` con JSON válido, o un número. Nada de prosa alrededor.",
    "· Si no entiendes la orden, responde exactamente: NO ENTIENDO — seguido del motivo en una línea. No inventes.",
    "· El prompt de una imagen viaja tal cual: tú no juzgas contenido, lo describes.",
    "",
    instruccionesParaElModelo(),
  ].join("\n");
  // El SYSTEM multilínea de Ollama admite texto directo entre triples comillas.
  return [
    `FROM ${tag}`,
    `PARAMETER temperature 0.1`,
    `PARAMETER top_p 0.9`,
    "SYSTEM \"\"\"",
    sistema,
    "\"\"\"",
    "",
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const m of ESCALERA) {
    const ruta = join(OUT, `Modelfile.${m.nombre}`);
    writeFileSync(ruta, construirModelfile(m.tag), "utf8");
    console.log(`[Modelfiles] ${ruta} ← ${m.tag} (${m.tramo})`);
  }
  console.log("[Modelfiles] crear en Ollama:  ollama create cerebronico-360m -f models/Modelfile.cerebronico-360m");
}
