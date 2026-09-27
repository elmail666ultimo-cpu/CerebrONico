/**
 * formato.test.ts — FILTRO DE METADATOS DE CIERRE (v8.0.1)
 * =========================================================
 * La petición que originó esto fue un «no, quítalo, solo responde la
 * respuesta». Esa frase no se puede probar. Lo que SÍ se puede probar es la
 * aduana que la cumple, y eso es lo que hay aquí:
 *
 *   1. El filtro quita los rótulos de acta, con todas las variantes que de
 *      verdad aparecen (acentos, negritas, encabezados, sin dos puntos).
 *   2. El filtro NO toca el código del usuario: dentro de un cercado ``` el
 *      texto es territorio suyo, aunque contenga literalmente «[ACCIÓN]».
 *      Esta es la prueba que más importa: un filtro que estropea el código que
 *      venía a arreglar es peor que el ruido que elimina.
 *   3. El cuerpo de la respuesta sobrevive intacto: se va el rótulo, no la
 *      solución.
 *   4. La ORDEN también se retiró: el prompt del motor ya no pide el acta
 *      (default apagado y conmutable), y se comprueba sobre el texto fuente
 *      porque es una decisión de prompt, no de función.
 *
 * Nota de estilo: la comprobación 4 lee el archivo fuente como texto, igual que
 * hace `resiliencia.test.ts` con `server.ts`. Es deliberado: aquí se verifica
 * una INVARIANTE del prompt, y montar un Brain completo para eso sería pagar
 * con efectos de disco (memoria.md, locks) una comprobación que necesita cero.
 */
import * as fs from "fs";
import * as path from "path";
// ESM (`"type": "module"`): `__dirname` no existe. Es EXACTAMENTE el defecto que
// documenta la entrada `err-esm-require` del pack de código — y saltó aquí al
// escribir esta prueba, que es la mejor demostración de que el pack apunta a
// errores reales y no de manual.  Mismo patrón que `resiliencia.test.ts`.
import { fileURLToPath } from "url";
import {
  limpiarMetadatosDeCierre,
  conteniaMetadatosDeCierre,
  esLineaDeMetadato,
} from "../src/utils/formatFixer";
import { protocoloDeCierreActivo, activarProtocoloDeCierre } from "../src/engine/brain";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── 1 · El caso exacto que reportó el usuario ────────────────────────────────
// Reproducción literal del turno que se vio en pantalla: rótulo de acción, el
// bloque de código, y la línea de checklist con la que el modelo se felicitaba.
const RESPUESTA_REAL = [
  "[DIAGNÓSTICO FLASH] Falta el filtro de salida en el flujo de respuesta.",
  "[ACCIÓN]",
  "```tsx file=\"src/utils/formatFixer.ts\"",
  "export const cleanResponseFormat = (text: string): string => {",
  "  return text.replace(/\\[(DIAGNOSTICO FLASH|ACCIÓN|CHECKLIST DE MEMORIA)\\][^\\n]*/g, \"\").trim();",
  "};",
  "```",
  "[CHECKLIST DE MEMORIA] Filtro de salida aplicado; metadatos ocultos en el flujo de respuesta.",
].join("\n");

const limpia = limpiarMetadatosDeCierre(RESPUESTA_REAL);
comprobar("quita el rótulo del diagnóstico", !limpia.includes("[DIAGNÓSTICO FLASH]"));
comprobar("quita el rótulo de acción", !limpia.includes("[ACCIÓN]"));
comprobar("quita el rótulo del checklist", !limpia.includes("[CHECKLIST DE MEMORIA]"));
comprobar("no queda ninguna línea de acta", !/^\s*\[(DIAGN|ACCI|CHECK)/m.test(limpia));
comprobar("CONSERVA el bloque de código completo", limpia.includes('file="src/utils/formatFixer.ts"') && limpia.includes("cleanResponseFormat"));
// Entrada: 8 líneas (3 rótulos + 5 del bloque). Salida: las 5 del bloque, ni una
// más ni una menos. Si este número cambia, el filtro se está comiendo algo.
comprobar("conserva las 5 líneas del bloque de código", (limpia.match(/^/gm) || []).length === 5, JSON.stringify(limpia));
comprobar("no deja agujeros de 3 saltos de línea", !/\n{3,}/.test(limpia));
comprobar("no empieza en blanco", !/^\s/.test(limpia));

// ── 2 · Variantes que aparecen de verdad ─────────────────────────────────────
comprobar("variante sin acento (DIAGNOSTICO)", esLineaDeMetadato("[DIAGNOSTICO FLASH] hola"));
comprobar("variante sin acento (ACCION)", esLineaDeMetadato("[ACCION]"));
comprobar("con dos puntos", esLineaDeMetadato("[ACCIÓN]: el código"));
comprobar("en negrita markdown", esLineaDeMetadato("**[ACCIÓN]**"));
comprobar("como encabezado markdown", esLineaDeMetadato("### [CHECKLIST DE MEMORIA]"));
comprobar("en lista", esLineaDeMetadato("- [ACCIÓN]"));
comprobar("con espacios internos de más", esLineaDeMetadato("[CHECKLIST   DE   MEMORIA] texto"));
comprobar("la barandilla de confianza también cae", esLineaDeMetadato("[Asunción tomada: se optó por la ruta estándar por optimización de velocidad]"));
comprobar("y en minúsculas", esLineaDeMetadato("[acción] el código"));

// ── 3 · Lo que NO debe tocarse ───────────────────────────────────────────────
comprobar("una línea normal no es metadato", !esLineaDeMetadato("Exporta el componente y monta la ruta."));
comprobar("un array normal no es metadato", !esLineaDeMetadato("const x = [ACCION, CHECKLIST] as const;"));
comprobar("una nota del usuario no es metadato", !esLineaDeMetadato("// TODO: revisar [ACCIÓN] del turno anterior"));

const CODIGO_CON_ROTULO = [
  "Aquí está la solución:",
  "",
  "```ts",
  'const etiquetas = ["[ACCIÓN]", "[DIAGNÓSTICO FLASH]", "[CHECKLIST DE MEMORIA]"];',
  "```",
  "",
  "Y eso es todo.",
].join("\n");
const intacta = limpiarMetadatosDeCierre(CODIGO_CON_ROTULO);
comprobar(
  "un rótulo DENTRO de un cercado se respeta (el código es del usuario)",
  intacta.includes('const etiquetas = ["[ACCIÓN]", "[DIAGNÓSTICO FLASH]", "[CHECKLIST DE MEMORIA]"];')
);
comprobar("y las líneas de fuera siguen ahí", intacta.includes("Aquí está la solución:") && intacta.includes("Y eso es todo."));

// Tras cerrar un cercado hay que volver a barrer: si el estado de «dentro»
// se quedara pegado, el filtro dejaría de funcionar a partir del primer bloque
// de código de cada respuesta.
const DOS_CERCADOS = ["[ACCIÓN]", "```", "a", "```", "[ACCIÓN]", "texto de fuera"].join("\n");
const trasDos = limpiarMetadatosDeCierre(DOS_CERCADOS);
comprobar("el estado del cercado no se arrastra entre bloques", trasDos.includes("texto de fuera") && !trasDos.includes("ACCIÓN"));
comprobar("el cercado con ~~~ también protege", limpiarMetadatosDeCierre(["~~~", "[ACCIÓN]", "~~~"].join("\n")).includes("[ACCIÓN]"));

// ── 4 · Conmutadores y utilidades ────────────────────────────────────────────
comprobar("se puede pedir que respete el diagnóstico", limpiarMetadatosDeCierre("[DIAGNÓSTICO FLASH] x\ncuerpo", { diagnostico: false }).includes("DIAGNÓSTICO"));
comprobar("y el checklist por separado", limpiarMetadatosDeCierre("[CHECKLIST DE MEMORIA] x\ncuerpo", { checklist: false }).includes("CHECKLIST"));
comprobar("texto vacío no revienta", limpiarMetadatosDeCierre("") === "");
comprobar("y null tampoco", limpiarMetadatosDeCierre(null as any) === "");
comprobar("conteniaMetadatosDeCierre detecta", conteniaMetadatosDeCierre(RESPUESTA_REAL) === true);
comprobar("...y no da falso positivo", conteniaMetadatosDeCierre("Solo respuesta limpia.") === false);

// ── 5 · La ORDEN: el prompt ya no pide el acta ───────────────────────────────
comprobar("el protocolo de cierre viene APAGADO", protocoloDeCierreActivo() === false);
activarProtocoloDeCierre(true);
comprobar("y se puede volver a encender (escape hatch)", protocoloDeCierreActivo() === true);
activarProtocoloDeCierre(false);
comprobar("y se apaga otra vez", protocoloDeCierreActivo() === false);

const cerebro = fs.readFileSync(path.join(RAIZ, "src", "engine", "brain.ts"), "utf8");
comprobar("brain.ts usa la bandera para el nivel estándar", /if \(PROTOCOLO_CIERRE\.activo\)[\s\S]{0,700}PROTOCOLO DE CIERRE/.test(cerebro));
comprobar("brain.ts usa la bandera para el nivel micro", /if \(PROTOCOLO_CIERRE\.activo\)[\s\S]{0,700}DIAGNÓSTICO FLASH/.test(cerebro));
comprobar("la rama apagada NO escribe las etiquetas (no se autosugestiona)", /CONTRATO DE SALIDA[\s\S]{0,900}=== FIN DEL CONTRATO ===/.test(cerebro) && !/CONTRATO DE SALIDA[\s\S]{0,900}\[ACCIÓN\]/.test(cerebro));
comprobar("el nivel micro tiene su rama sin rótulos", /NO uses rótulos internos de acta/.test(cerebro));
comprobar("la bandera nace apagada en el código (no sólo en runtime)", /const PROTOCOLO_CIERRE = \{ activo: false \}/.test(cerebro));

// La LEY también pedía el acta: cerebro.md entra al prompt (nivel compact, por
// la sección «cierre»). Si no se corrige ahí, el motor retira la orden en una
// capa y la vuelve a dar en otra.
const ley = fs.readFileSync(path.join(RAIZ, "cerebro.md"), "utf8");
comprobar("cerebro.md ya no declara la estructura como obligatoria", !/Estructura obligatoria de respuesta \(Output Schema\)/.test(ley) || /OPCIONAL \(v8\.0\.1\)/.test(ley));
comprobar("cerebro.md explica que la plantilla está retirada", /v8\.0\.1/.test(ley) && /apagad/i.test(ley));

const py = fs.readFileSync(path.join(RAIZ, "core-agent", "agent_core", "engine.py"), "utf8");
comprobar("el agente Python ya no pide el acta", !/Formato OBLIGATORIO: \[DIAGNOSTICO FLASH\]/.test(py) && /Sin rotulos internos/.test(py));
comprobar("...y su protocolo de cierre pasó a contrato de salida", /CONTRATO DE SALIDA/.test(py) && !/PROTOCOLO DE CIERRE \(OBLIGATORIO\)/.test(py));

// ── 6 · El punto de render aplica el filtro (una sola puerta) ────────────────
const chat = fs.readFileSync(path.join(RAIZ, "src", "components", "ChatCenter.tsx"), "utf8");
comprobar("ChatCenter importa el filtro", /import \{ limpiarMetadatosDeCierre \} from "\.\.\/utils\/formatFixer"/.test(chat));
comprobar("y compone los dos arreglos en una función", /const componerCuerpo = \(texto: string\)[\s\S]{0,120}limpiarMetadatosDeCierre\(repairNumberedListsAndGaps\(texto\)\)/.test(chat));
comprobar("el mensaje guardado pasa por ahí", /componerCuerpo\(msg\.content\)/.test(chat));
comprobar("y el texto en streaming también", /componerCuerpo\(currentStreamingText\)/.test(chat));
comprobar("no quedó ninguna llamada suelta al reparador de listas en el render", !/\{repairNumberedListsAndGaps\(/.test(chat));

console.log(`\n═══ FORMATO (v8.0.1): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
