/**
 * estadoRescate.test.ts — RESCATE v1 (v1.6.23): las reglas del traslado
 * antes del nuclear wipe, probadas sin servidor (todo es puro).
 * Cubre: fusión sin-pisar, nombre/ruta del snapshot, veredicto abortar/
 * seguir, re-sembrado sin históricos y resumen nunca mudo.
 */
import {
  planearFusion,
  nombreRescate,
  rutaRelRescate,
  procederBorrado,
  resumenRescate,
  planReSembrado,
  decidirRespaldo,
} from "../src/engine/estadoRescate";
import { esAncestroOEquivale, rechazarRaizAncestroApp } from "../src/engine/raizDatos";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

// ─── fusión: lo nuevo se muda, lo existente NO se pisa ───
const enDestino = (rel: string) => rel === "kb.json" || rel.startsWith("proposals/");
const plan = planearFusion(["kb.json", "espejos.json", "proposals/p1.json", "espejos.json", ""], enDestino);
comprobar("traslada solo lo que no está en destino", JSON.stringify(plan.trasladar) === '["espejos.json"]', JSON.stringify(plan));
comprobar("conserva lo que ya está (nunca pisar)", JSON.stringify(plan.conservar) === '["kb.json","proposals/p1.json"]', JSON.stringify(plan));
comprobar("duplicados se colapsan (una acción por archivo)", plan.trasladar.length + plan.conservar.length === 3);
comprobar("cadena vacía no entra al plan", !plan.trasladar.includes("") && !plan.conservar.includes(""));
comprobar("entrada basura no revienta", JSON.stringify(planearFusion(null as any, () => false)) === '{"trasladar":[],"conservar":[]}');
comprobar("sin origen, plan vacío", planearFusion([], () => true).trasladar.length === 0);

// ─── snapshot: nombre seguro para NTFS/FAT y ruta fija ───
comprobar("nombre sin dos-puntos ni puntos", !/[:.]/.test(nombreRescate("2026-09-23T19:41:07.123Z")), nombreRescate("2026-09-23T19:41:07.123Z"));
comprobar("ruta del snapshot es rescate/<nombre>", rutaRelRescate("2026-09-23T19:41:07.123Z") === "rescate/2026-09-23T19-41-07-123Z", rutaRelRescate("2026-09-23T19:41:07.123Z"));

// ─── veredicto: integridad antes que destrucción ───
comprobar("sin estado → se puede vaciar", procederBorrado({ existeEstado: false, snapshotOk: false, errores: [] }).seguir === true);
comprobar("estado rescatado limpio → se puede vaciar", procederBorrado({ existeEstado: true, snapshotOk: true, errores: [] }).seguir === true);
const sinSnapshot = procederBorrado({ existeEstado: true, snapshotOk: false, errores: ["snapshot: EACCES"] });
comprobar("snapshot fallido → ABORTA", sinSnapshot.seguir === false);
comprobar("el abort nombra la causa", sinSnapshot.motivo.includes("EACCES"), sinSnapshot.motivo);
comprobar("el abort dice que el vaciado no ocurrió", /ABORT/i.test(sinSnapshot.motivo), sinSnapshot.motivo);
const conError = procederBorrado({ existeEstado: true, snapshotOk: true, errores: ["fusión kb.json: EIO"] });
comprobar("hubo snapshot pero con errores → TAMBIÉN aborta", conError.seguir === false);

// ─── re-sembrado: vuelve todo MENOS los históricos ───
const rels = ["kb.json", "espejos.json", "rescate/2026-09-23T19-41-07-123Z/kb.json", "rescate", "proposals/p1.json"];
const siembra = planReSembrado(rels);
comprobar("re-siembra el estado vivo", siembra.includes("kb.json") && siembra.includes("espejos.json") && siembra.includes("proposals/p1.json"));
comprobar("NO re-siembra backups", !siembra.some((r) => r.startsWith("rescate")));
comprobar("basura no revienta el plan de siembra", planReSembrado(null as any).length === 0 && planReSembrado(["", "a"] as any).length === 1);

// ─── resumen: ningún resultado queda mudo ───
const resumen = resumenRescate({ trasladados: 2, conservados: 5, snapshot: "C:\\app\\.cerebro-db\\rescate\\x", docs: ["MEMORIA.md"], errores: [] });
comprobar("resumen cuenta trasladados y conservados", resumen.includes("2") && resumen.includes("5"), resumen);
comprobar("resumen muestra el snapshot", resumen.includes("rescate"), resumen);
comprobar("resumen nombra los docs", resumen.includes("MEMORIA.md"), resumen);
const resumenMalo = resumenRescate({ trasladados: 0, conservados: 0, snapshot: "", docs: [], errores: ["disco lleno"] });
comprobar("sin snapshot lo dice explícitamente", /NO se cre/i.test(resumenMalo), resumenMalo);
comprobar("los errores viajan al resumen", resumenMalo.includes("disco lleno"), resumenMalo);

// ─── GUARDA-D: raíz y anidado con nombres distintos NO se funden en silencio ───
const mismo = decidirRespaldo("mi-app", "mi-app");
comprobar("mismo proyecto: funde como siempre", mismo.respaldar === false && /manda la copia sincronizada/.test(mismo.motivo), mismo.motivo);
const distinto = decidirRespaldo("app-de-anoche", "codigo-cerebronico");
comprobar("proyectos distintos: respalda antes de fundir", distinto.respaldar === true);
comprobar("el motivo nombra los DOS proyectos", distinto.motivo.includes("app-de-anoche") && distinto.motivo.includes("codigo-cerebronico"), distinto.motivo);
comprobar("sin package.json a un lado: no es conflicto", decidirRespaldo(null, "x").respaldar === false && decidirRespaldo("x", null).respaldar === false);

// ─── GUARDA-RAÍZ v1: la raíz de datos no puede contener a la app ───
comprobar("ancestro: C:\\Cerebronico contiene a la app", esAncestroOEquivale("C:\\Cerebronico", "C:\\Cerebronico\\ide\\backend"));
comprobar("igualdad cuenta como ancestro", esAncestroOEquivale("/opt/ide", "/opt/ide"));
comprobar("separador mixto no engaña", esAncestroOEquivale("/opt/ide/", "C:\\Users\\x".replace("C:\\Users\\x", "/opt/ide/sub")));
comprobar("hermano NO es ancestro (C:\\CerebroDatos ≠ ide\\backend)", !esAncestroOEquivale("C:\\CerebroDatos", "C:\\Cerebronico\\ide\\backend"));
comprobar("prefijo traidor no engaña (C:\\Cerebronico2 ≠ C:\\Cerebronico\\ide)", !esAncestroOEquivale("C:\\Cerebronico", "C:\\Cerebronico2\\ide"));
const r1 = rechazarRaizAncestroApp("C:\\Cerebronico", "C:\\Cerebronico\\ide\\backend", "C:\\Cerebronico\\ide\\backend\\.proyectos");
comprobar("raíz instalación → RECHAZADA al default", r1.rechazada === true && r1.raiz === "C:\\Cerebronico\\ide\\backend\\.proyectos", JSON.stringify(r1));
comprobar("el motivo explica el incidente", /ide/.test(r1.motivo) && /default|por defecto/.test(r1.motivo), r1.motivo);
const r2 = rechazarRaizAncestroApp("C:\\CerebroDatos\\.proyectos", "C:\\Cerebronico\\ide\\backend", "X");
comprobar("raíz dedicada legítima pasa", r2.rechazada === false && r2.raiz === "C:\\CerebroDatos\\.proyectos");
const r3 = rechazarRaizAncestroApp("C:\\Cerebronico\\ide\\backend\\.proyectos", "C:\\Cerebronico\\ide\\backend", "X");
comprobar("el default nunca se rechaza a sí mismo", r3.rechazada === false);

console.log(`\n═══ RESCATE: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
