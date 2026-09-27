/**
 * tests/aspectoSpecificidad.test.ts — REGRESIÓN del «solo anda el general»
 * ========================================================================
 * Se ejecuta con:  npx tsx tests/aspectoSpecificidad.test.ts
 *
 * El fallo: `[data-cn="chat"] .text-xs` (0,2,0) es MENOS específica que
 * `body[data-cn="general"] .text-xs` (0,2,1). En cuanto el usuario movía
 * «General», las cinco secciones quedaban muertas en toda la interfaz.
 *
 * Las pruebas anteriores comprobaban que la regla EXISTÍA y que iba DESPUÉS,
 * pero nunca compararon especificidades — que es justo lo que decidía. Aquí se
 * calculan y se comparan, así que este fallo no puede volver en silencio.
 */

import { hojaAspecto, SECCIONES, TOKENS_TAMANO, type ConfigAspecto } from "../src/engine/aspecto";

let pasadas = 0;
let falladas = 0;

function afirmar(titulo: string, condicion: boolean, detalle = ""): void {
  if (condicion) {
    pasadas++;
    console.log(`  ✔ ${titulo}`);
  } else {
    falladas++;
    console.error(`  ✘ ${titulo}${detalle ? `\n      ${detalle}` : ""}`);
  }
}

/* ------------------------------------------------------------------
   Calculadora de especificidad (a,b,c) = (ids, clases/atributos, elementos)
   Los escapes se neutralizan primero: `.text-\[8px\]` es UNA clase, no una
   clase más un atributo.
   ------------------------------------------------------------------ */
function especificidad(selector: string): [number, number, number] {
  const s = selector.replace(/\\./g, "X");
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const atributos = (s.match(/\[[^\]]*\]/g) || []).length;
  const clases = (s.match(/\.[\w-]+/g) || []).length;
  const pseudos = (s.match(/::?[\w-]+(\([^)]*\))?/g) || []).length;
  const sinQuitar = s
    .replace(/#[\w-]+/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\.[\w-]+/g, " ")
    .replace(/::?[\w-]+(\([^)]*\))?/g, " ");
  const elementos = (sinQuitar.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
  return [ids, clases + atributos + pseudos, elementos];
}

function comparar(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

const mostrar = (e: [number, number, number]) => `(${e.join(",")})`;

/* ------------------------------------------------------------------
   El escenario exacto que rompía: general Y secciones ajustados a la vez.
   ------------------------------------------------------------------ */
const conf: ConfigAspecto = {
  secciones: {
    general: { tam: 150 },
    chat: { tam: 200 },
    editor: { tam: 200 },
    paneles: { tam: 200 },
    explorador: { tam: 200 },
    cabecera: { tam: 200 },
  },
};
const css = hojaAspecto(conf);

type Regla = { sel: string; decl: string; indice: number };
const reglas: Regla[] = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m, i) => ({
  sel: m[1].trim(),
  decl: m[2],
  indice: css.indexOf(m[0]),
}));

const reglaGeneral = reglas.find((r) => r.sel.endsWith(".text-xs") && r.decl.includes("var(--cn-fs-general)") && !r.decl.includes("--cn-fs-chat"));
const reglaChat = reglas.find((r) => r.sel.includes(".text-xs") && r.decl.includes("var(--cn-fs-chat)"));

console.log("\n1. Las dos reglas existen con ambos ajustes puestos");
afirmar("regla del general emitida", Boolean(reglaGeneral), "no se encontró");
afirmar("regla del chat emitida", Boolean(reglaChat), "no se encontró");

if (reglaGeneral && reglaChat) {
  const selGeneral = reglaGeneral.sel.split(",")[0].trim();
  const selChat = reglaChat.sel.split(",")[0].trim();
  const eGeneral = especificidad(selGeneral);
  const eChat = especificidad(selChat);

  console.log("\n2. La sección GANA al general (era el fallo)");
  console.log(`     general → ${selGeneral} ${mostrar(eGeneral)}`);
  console.log(`     chat    → ${selChat} ${mostrar(eChat)}`);
  afirmar(
    "★ especificidad de la sección ESTRICTAMENTE mayor que la del general",
    comparar(eChat, eGeneral) > 0,
    `sección ${mostrar(eChat)} vs general ${mostrar(eGeneral)} — la sección quedaría muerta`
  );

  console.log("\n3. El producto cartesiano no deja selectores a medias");
  // Concatenar "a, b" + " .text-xs" daría "a" sin la clase: el tamaño se
  // aplicaría al contenedor entero en vez de al texto.
  for (const variante of reglaChat.sel.split(",").map((v) => v.trim())) {
    afirmar(`la variante «${variante}» conserva la clase`, variante.endsWith(".text-xs"), variante);
  }

  console.log("\n4. Desempate por orden, por si alguna vez empatan");
  afirmar("el general se emite antes que la sección", reglaGeneral.indice < reglaChat.indice);

  console.log("\n5. Las anclas siguen apuntando a nodos que existen en la interfaz");
  afirmar("el ancla de sección conserva su data-cn", reglaChat.sel.includes('[data-cn="chat"]'), reglaChat.sel);
  afirmar(
    "los cinco data-cn del DOM están cubiertos",
    ["chat", "editor", "explorador", "paneles", "cabecera"].every((id) => css.includes(`[data-cn="${id}"]`)),
    "falta algún ancla"
  );
}

/* ------------------------------------------------------------------
   El otro camino: solo la sección, sin tocar el general.
   ------------------------------------------------------------------ */
console.log("\n6. Sección sola (general sin tocar) sigue emitiendo sus reglas");
const soloChat = hojaAspecto({ secciones: { chat: { tam: 200 } } });
afirmar("no se emiten reglas de tamaño del general", !soloChat.includes("var(--cn-fs-general) !important"), "el general no debería moverse");
afirmar("el chat sí", soloChat.includes("var(--cn-fs-chat)"), soloChat.slice(0, 120));
afirmar("y sigue siendo la más específica del texto", soloChat.includes('[data-cn="chat"] .text-xs'), "sin ancla de chat");

/* ------------------------------------------------------------------
   Cobertura: los 15 tokens reales de la UI, en las dos ramas.
   ------------------------------------------------------------------ */
console.log("\n7. Ningún token se queda fuera");
for (const tok of TOKENS_TAMANO) {
  const variante = tok.sel.replace(/\\\\/g, "\\");
  const c = hojaAspecto({ secciones: { general: { tam: 150 }, chat: { tam: 150 } } });
  const cubierto = c.includes(`${variante}{`) || c.includes(`${variante} {`) || c.includes(`${variante},`);
  if (!cubierto) {
    afirmar(`token ${tok.sel} cubierto`, false, "no se emitió regla para este token");
  }
}
afirmar(`los ${TOKENS_TAMANO.length} tokens emiten regla`, true);

/* ------------------------------------------------------------------
   Config vacía: la hoja no debe tocar nada.
   ------------------------------------------------------------------ */
console.log("\n8. Sin ajustes, la hoja no altera la interfaz");
const vacia = hojaAspecto({ secciones: {} });
afirmar("sin reglas de sección", !/\[data-cn="(chat|editor|paneles|explorador|cabecera)"\] \./.test(vacia));
afirmar("pero con las variables a 1", vacia.includes("--cn-fs-chat:1"));

/* ------------------------------------------------------------------
   Secciones declaradas vs. ancladas: el inventario no se queda atrás.
   ------------------------------------------------------------------ */
console.log("\n9. Cada sección declarada tiene su ancla");
for (const s of SECCIONES) {
  if (s.id === "general") continue;
  const hoja = hojaAspecto({ secciones: { [s.id]: { tam: 150 } } });
  afirmar(`«${s.nombre}» (${s.id}) emite su regla`, hoja.includes(`[data-cn="${s.id}"]`), "sin ancla");
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ ASPECTO · ESPECIFICIDAD: ${pasadas} correctas · ${falladas} fallidas ═══`);
console.log("─".repeat(56));
if (falladas > 0) process.exit(1);
