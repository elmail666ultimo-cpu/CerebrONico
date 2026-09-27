/**
 * aspecto.test.ts — ASPECTO v1: la hoja determinista, probada sin navegador
 * =========================================================================
 * (1) normalización: basura fuera, clamps, neutral eliminada
 * (2) hoja: variables, tokens escapados, ORDEN general→secciones (el empate
 *     de especificidad lo gana la sección: si alguien reordena la hoja, esto peta)
 * (3) la multiplicación de factores existe (anidamiento general×chat)
 * (4) color solo a neutros; fuente solo cuando hay pila
 * (5) INVENTARIO: si la interfaz estrenó clase de tamaño y la lista no la
 *     cubre, el test lo denuncia — el límite declarado no puede volverse silencio.
 */
import {
  SECCIONES, TOKENS_TAMANO, NEUTROS, FUENTES, PALETA, TAM_MIN, TAM_MAX,
  normalizarAspecto, modificarSeccion, valorSeccion, hojaAspecto, hayAspecto,
} from "../src/engine/aspecto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

// ── 1 · normalización ───────────────────────────────────────────────────────
const n1 = normalizarAspecto({ secciones: { chat: { tam: 400, fuente: "comic", color: "rojo" } } });
comprobar("clamp tamaño a 220", n1.secciones.chat?.tam === TAM_MAX, JSON.stringify(n1));
comprobar("fuente inexistente descartada", n1.secciones.chat?.fuente === undefined);
comprobar("color no-HEX descartado", n1.secciones.chat?.color === undefined);
const n2 = normalizarAspecto({ secciones: { chat: { tam: 30 }, fantasma: { tam: 150 } } });
comprobar("clamp piso 70", n2.secciones.chat?.tam === TAM_MIN);
comprobar("sección inventada fuera", !n2.secciones.fantasma);
comprobar("tam=100 equivale a nada", Object.keys(normalizarAspecto({ secciones: { chat: { tam: 100 } } }).secciones).length === 0);
comprobar("basura total → config vacía legal", hayAspecto(normalizarAspecto("no-era-objeto")) === false);
comprobar("HEX de 3 y 8 admitidos", !!normalizarAspecto({ secciones: { editor: { color: "#abc" } } }).secciones.editor
  && !!normalizarAspecto({ secciones: { editor: { color: "#aabbccdd" } } }).secciones.editor);

// ── 2/3 · la hoja ───────────────────────────────────────────────────────────
const conf = normalizarAspecto({ secciones: { general: { tam: 110 }, chat: { tam: 150, fuente: "mono", color: "#fde68a" } } });
const css = hojaAspecto(conf);
comprobar(":root con factores --cn-fs-chat:1.5", css.includes("--cn-fs-chat:1.5"), css.slice(0, 120));
comprobar("general factor 1.1", css.includes("--cn-fs-general:1.1"));
comprobar("pila mono en su variable", css.includes("--cn-ff-mono") || css.includes("--cn-ff-chat:") && css.includes("ui-monospace"), "");
comprobar("color-chat es el elegido", css.includes("--cn-fc-chat:#fde68a"));
comprobar("selector escapado text-\\[10px\\] presente", css.includes(".text-\\[10px\\]{font-size:calc(10px * var(--cn-fs-general))"), "");
const reglaChat = css.match(/\[data-cn="chat"\] \.text-xs\{([^}]+)\}/);
comprobar("regla sección multiplica ambos factores", !!reglaChat && /var\(--cn-fs-chat\).*var\(--cn-fs-general\)/.test(reglaChat[1]), reglaChat?.[1]);
comprobar("orden: toda regla general antes que toda sección", (() => {
  const iGeneralFin = css.lastIndexOf('body[data-cn="general"] .text-xl{');
  const iSecInicio = css.indexOf('[data-cn="chat"] .text-\\[');
  return iGeneralFin > -1 && iSecInicio > iGeneralFin;
})());
comprobar("color ataca solo los 13 neutros", NEUTROS.every((n) => css.includes(`[data-cn="chat"] ${n}{color:var(--cn-fc-chat);}`)) && !css.includes(".text-cyan-300{color:var(--cn-fc-chat)"));
comprobar("fuente reescribe font-mono de la sección", css.includes('[data-cn="chat"] .font-mono'));
const cssVacio = hojaAspecto({ secciones: {} });
comprobar("config vacía: hoja trivial (sin reglas de sección)", !/\[data-cn="(chat|editor)"\]/.test(cssVacio) && cssVacio.includes("--cn-fs-chat:1"), cssVacio.slice(0, 100));

// ── 4 · inmutabilidad del config en la UI ──────────────────────────────────
const base = { secciones: { chat: { tam: 150 } } };
const mod = modificarSeccion(base as any, "chat", { tam: 90 });
comprobar("modificar no muta el original", (base as any).secciones.chat.tam === 150 && (mod as any).secciones.chat.tam === 90);
const reset = modificarSeccion(mod as any, "chat", { tam: 100, fuente: "heredar", color: null });
comprobar("volver a lo neutro borra la sección", !reset.secciones.chat && !hayAspecto(reset));

// ── 5 · inventario contra el código REAL (la lista no puede envejecer en silencio)
// v1.0.0 — 🐞 ESTA COMPROBACIÓN PODÍA PASAR SIN MIRAR NADA.
//
// Usaba `process.cwd()` y, si la carpeta no aparecía, imprimía una nota neutra y
// SEGUÍA: la comprobación más importante de este archivo —la que impide que la
// lista de tamaños envejezca— quedaba en verde sin haber escaneado un solo
// archivo. Es la misma lección que la suite que no estaba registrada en el
// guardián: **una prueba que puede pasar por no ejecutarse no cubre nada**, y
// encima da tranquilidad, que es peor que no tenerla.
//
// Ahora se ancla en la raíz del PAQUETE (no en el directorio desde el que se
// lance el comando), escanea TODO `src` —antes sólo `src/components`, así que un
// tamaño usado en cualquier otro sitio se le escapaba— y si no encuentra nada,
// FALLA en lugar de callarse.
const raizInv = fileURLToPath(new URL("..", import.meta.url));
const srcDir = path.join(raizInv, "src");

/**
 * v1.0.0 — FICHEROS QUE NO SON INTERFAZ, Y POR QUÉ SON SÓLO DOS.
 *
 * Al escanear TODO `src` apareció `text-2xl` como «no cubierto». Al mirarlo:
 * está dentro de una CADENA de `cerebroReflejo.ts`, que GENERA páginas Next.js
 * para otros proyectos. Ese `text-2xl` no es texto de esta interfaz, y escalarlo
 * con los reguladores del IDE sería un error: cambiaría el código que el motor
 * escribe para el usuario.
 *
 * La tentación era añadir `2xl` a la lista de tokens. Habría callado la prueba
 * y habría roto el producto. Se excluye el fichero y se deja claro por qué.
 *
 * Y la lista se autolimita: si crece de 3, la prueba FALLA. Una lista de
 * exclusiones sin techo acaba siendo el sitio donde se esconden los hallazgos
 * incómodos, y este proyecto ya se ha encontrado con eso.
 */
const NO_UI = ["cerebroReflejo.ts", "plantillasProyecto.ts"];
comprobar("la lista de exclusiones del inventario sigue siendo corta", NO_UI.length <= 3, NO_UI.join(", "));

const usados = new Set<string>();
if (fs.existsSync(srcDir)) {
  const walk = (d: string): void => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!/\.(tsx?|css)$/.test(e.name)) return;
    if (NO_UI.includes(e.name)) return; // generadores de código ajeno, no interfaz
    const t = fs.readFileSync(p, "utf8");
    for (const m of t.matchAll(/text-(\[[0-9.]+(?:px|em|rem)\]|xs|sm|base|lg|xl|2xl|3xl)\b/g)) usados.add(m[1]);
  });
  walk(srcDir);
}
comprobar(
  "inventario: se pudo escanear src de verdad, si no la comprobacion de abajo no valdria nada",
  usados.size > 0,
  `${usados.size} clases de tamano en ${srcDir}`
);
const canon = (tok: string) => tok.replace(/\\/g, "").replace(/^\.?text-/, "");
const cubiertos = new Set(TOKENS_TAMANO.map((t) => canon(t.sel)));
const noCubiertos = [...usados].filter((u) => !cubiertos.has(canon("text-" + u)));
comprobar("inventario: toda clase de tamaño de la UI está en la hoja", noCubiertos.length === 0, noCubiertos.slice(0, 5).join(","));

// ── 6 · el catálogo público es coherente ───────────────────────────────────
comprobar("6 secciones, general primera", SECCIONES.length === 6 && SECCIONES[0].id === "general");
comprobar("toda fuente no-heredar tiene pila", FUENTES.filter((f) => f.id !== "heredar").every((f) => f.pila.length > 10));
comprobar("paleta: heredar + ≥8 muestras", PALETA.filter((p) => p.color).length >= 8 && PALETA[0].color === null);
comprobar("15 tokens (V8: +text-[8px]) y 13 neutros listados", TOKENS_TAMANO.length === 15 && NEUTROS.length === 13);

console.log(`\n═══ ASPECTO: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
