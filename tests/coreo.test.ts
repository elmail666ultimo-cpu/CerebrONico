/**
 * coreo.test.ts — COREO v1: el clasificador, el anillo y la hoja de movimiento
 * =============================================================================
 * Cada muestra de detalle es una línea de aviso REAL salida de
 * planExecutors/pluginForja/aduana (las copié del código, no del aire):
 * si mañana la narración cambia de forma, este test lo denuncia.
 */
import { ACCIONES, notificar, clasificarAviso, narrarDesdeAviso, accionDesdeTarea, coreoEstado, hojaCoreoCss } from "../src/engine/coreo";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

// ── 1 · vocabulario: toda acción tiene icono, verbo, color y movimiento válido
const ANIMS = ["latido", "orbita", "escaneo", "tecleo", "chispa", "sacudida", "brillo", "quieto"];
for (const a of Object.values(ACCIONES)) {
  comprobar(`acción ${a.id}: coreografiada completa`, !!a.verbo && !!a.icono && /^#[0-9a-f]{3,8}$/i.test(a.color) && ANIMS.includes(a.anim), JSON.stringify(a));
}
comprobar("el gerundio manda: todo verbo en español", Object.values(ACCIONES).every((a) => /[a-záéíóúñ]/i.test(a.verbo)));

// ── 2 · el bus: validar antes de bailar ────────────────────────────────────
const mala = notificar("bailar-salsa");
comprobar("acción inexistente → motivo con las conocidas", !mala.ok && /conocidas:/.test(mala.motivos.join(" ")), JSON.stringify(mala));
notificar("pensar", "llamando a llama-3.2");
comprobar("notificar ok sube el anillo", coreoEstado().actual?.accion === "pensar" && coreoEstado().emitidos >= 1);
for (let i = 0; i < 20; i++) notificar("escribir", "línea " + i);
const est = coreoEstado();
comprobar("anillo acotado a 14 (ocho viajan al cliente)", est.anillo.length === 8 && est.actual?.accion === "escribir" && /línea 19/.test(est.actual.detalle));
comprobar("orden newest-first con n creciente", est.anillo.every((e, i, arr) => i === 0 || arr[i - 1].n > e.n));

// ── 3 · el clasificador, con líneas LITERALES del código real ─────────────
const MUESTRAS: Array<[string, string]> = [
  ["#2 → modelo llama-3.2:1b: escribe index.html con el contexto del pliego", "pensar"],
  ["No se pudo guardar la conversión de #3 (sin permiso); el texto convertido se pierde, el informe no.", "bloqueado"],
  ["#4 pidió guardar en «ok.png» pero este contexto no tiene escritura binaria; la imagen queda en la URL, no en el proyecto.", "bloqueado"],
  ["#3 imagen revelada y se guardó como «banner.png» — la extensión se corrigió al formato real de los bytes", "escribir"],
  ["se guardó como «README.md»", "escribir"],
  ["convirtiendo notas.txt a markdown", "convertir"],
  ["generar_imagen de la portada lista", "imagen"],
  ["reflejo · espejo.matematicos · confianza 100%", "espejo"],
  ["entidad espejo.planificadores devolvió lotes", "espejo"],
  ["[plan p-77] el gobernador fijó presupuesto io≤16 cpu≤3", "planificar"],
  ["forjado e instalado cn.palabras: pestaña, slash y 1 herramienta", "forjar"],
  ["aduana: manifiesto ENTREGA/MANIFIESTO_SHA256.txt firmado", "entregar"],
  ["crítico: web limpia → ENTREGABLE", "verificar"],
  ["el usuario dijo hola", "actividad"],
];
for (const [linea, esperada] of MUESTRAS) {
  const c = clasificarAviso(linea);
  comprobar(`clasifica «${linea.slice(0, 36)}…» → ${esperada}`, c.accion === esperada, c.accion);
}
comprobar("el prefijo [plan x] no ensucia el detalle", !clasificarAviso("[plan p-1] reflejo · mate").detalle.startsWith("[plan"));

// ── 4 · narrarDesdeAviso alimenta el bus (la puerta del servidor) ─────────
const antes = coreoEstado().emitidos;
narrarDesdeAviso("#9 → modelo test: coreografía");
comprobar("narrar sube el bus y mantiene la consola", coreoEstado().emitidos === antes + 1 && coreoEstado().actual?.accion === "pensar");

// ── 5 · lectura client-side del estado de tareas ──────────────────────────
comprobar("tarea modelo ejecutando = pensar", accionDesdeTarea("modelo", "ejecutando") === "pensar");
comprobar("tarea reflejo ejecutando = espejo", accionDesdeTarea("reflejo", "ejecutando") === "espejo");
comprobar("cualquier tarea fallida = bloqueado", accionDesdeTarea("convertir", "fallida") === "bloqueado");
comprobar("imagen hecha = imagen", accionDesdeTarea("generar_imagen", "hecha") === "imagen");
comprobar("pendiente no baila", accionDesdeTarea("modelo", "pendiente") === "actividad");

// ── 6 · la hoja de movimiento ─────────────────────────────────────────────
const css = hojaCoreoCss();
const ANIMS_CON_MOVIMIENTO = ANIMS.filter((a) => a !== "quieto"); // «quieto» ES la ausencia de animación: no tiene keyframe ni clase
for (const a of ANIMS_CON_MOVIMIENTO) comprobar(`keyframe cn-${a} existe`, css.includes("@keyframes cn-" + a));
comprobar("todas las clases .cn-anim-* de movimiento declaradas", ANIMS_CON_MOVIMIENTO.every((a) => css.includes(".cn-anim-" + a)));
comprobar("respeta prefers-reduced-motion (quien no quiere movimiento, no lo sufre)", css.includes("prefers-reduced-motion"));
comprobar("chip vivo se diferencia del historial", css.includes(".cn-coreo-live"));

// ── 7 · el estado viaja serializable ──────────────────────────────────────
const json = JSON.parse(JSON.stringify(coreoEstado()));
comprobar("coreoEstado es JSON de ida y vuelta", json.ok === true && Array.isArray(json.anillo) && json.vocabulario.includes("forjar"));

console.log(`\n═══ COREO: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
