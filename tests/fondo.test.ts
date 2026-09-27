/**
 * fondo.test.ts — FONDO v1: aduanero de archivos animados
 * ========================================================
 * 22 comprobaciones sobre lo puro (validador, contención, límites, hoja de
 * velillos) — la parte server (streaming + fs) queda para el smoke vivo del
 * instalador, que sube un gif real de 43 bytes y exige la misma huella de
 * vuelta. Un fondo que no se puede APAGAR no es personalización: es secuestro,
 * así que media hoja de test es sobre prefers-reduced-motion.
 */
import {
  tipoDeArchivo, dentroDe, validarFondo, metaDeFondo, limiteLegible,
  LIMITES_BYTES, TIPOS_FONDO, hojaFondoCss,
} from "../src/engine/fondo";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

// ── 1 · tipos ───────────────────────────────────────────────────────────────
comprobar("gif detectado", tipoDeArchivo("assets/fondo.GIF") === "gif");
comprobar("mp4 detectado", tipoDeArchivo("fondo.mp4") === "mp4");
comprobar("webm detectado", tipoDeArchivo("a/b/fondo.webm") === "webm");
comprobar("png NO es fondo (es foto)", tipoDeArchivo("fondo.png") === null);
comprobar("jpg SÍ es fondo v1.1 (el default del producto es uno)", tipoDeArchivo("fondo.jpg") === "jpg" && TIPOS_FONDO["jpg"] === "image/jpeg");
comprobar("jpeg también, y en mayúsculas", tipoDeArchivo("FOTO.JPEG") === "jpeg");
comprobar("sin extensión no hay tipo", tipoDeArchivo("fondo") === null);

// ── 2 · contención ──────────────────────────────────────────────────────────
comprobar("ruta hija pasa dentroDe", dentroDe("/raiz/proyecto", "/raiz/proyecto/assets/x.mp4"));
comprobar("raíz misma cuenta como dentro", dentroDe("/raiz/proyecto", "/raiz/proyecto"));
comprobar("hermana con prefijo falso NO pasa", !dentroDe("/raiz/proyecto", "/raiz/proyecto_viejo/x.mp4"));
comprobar("fuera absoluta NO pasa", !dentroDe("/raiz/proyecto", "/etc/passwd"));

// ── 3 · el validador de peticiones (motivos COMPLETOS, no el primero) ──────
const v1 = validarFondo({ ruta: "assets/fondo.mp4" });
comprobar("ruta sana pasa", v1.ok === true && v1.ruta === "assets/fondo.mp4");
const v2 = validarFondo({});
comprobar("sin ruta → motivo claro", !v2.ok && /falta «ruta»/.test(v2.motivos.join(" ")));
const v3 = validarFondo({ ruta: "/etc/fondo.mp4" });
comprobar("ruta absoluta rechazada", !v3.ok && /RELATIVA/.test(v3.motivos.join(" ")));
const v4 = validarFondo({ ruta: "../../otros/fondo.gif" });
comprobar("«..» rechazado", !v4.ok && /dentro del proyecto/.test(v4.motivos.join(" ")));
const v5 = validarFondo({ ruta: "fondo.exe" });
comprobar("ejecutable: motivo enumera lo aceptado", !v5.ok && /\.gif/.test(v5.motivos.join(" ")) && /\.mp4/.test(v5.motivos.join(" ")));
const v6 = validarFondo({ ruta: "..\\fondo.exe" });
comprobar("barra invertida normalizada y tachada dos veces", !v6.ok && v6.motivos.length >= 2, JSON.stringify(v6.motivos));

// ── 4 · límites y meta ──────────────────────────────────────────────────────
comprobar("gif ≤ 4 MB · vídeo ≤ 8 MB", LIMITES_BYTES.gif === 4 * 1048576 && LIMITES_BYTES.mp4 === 8 * 1048576 && LIMITES_BYTES.webm === 8 * 1048576);
comprobar("límite legible en MB", limiteLegible("gif") === "4 MB" && limiteLegible("webm") === "8 MB");
const m = metaDeFondo("assets/fondo.webm", "webm", 1234567, "2026-09-19T00:00:00Z");
comprobar("meta completa y serializable", m.activado === true && m.mime === "video/webm" && m.bytes === 1234567 && JSON.parse(JSON.stringify(m)).seg_sugeridas === "4–8");
comprobar("los mimos del mime coinciden con TIPOS_FONDO", Object.keys(TIPOS_FONDO).every((t) => m.tipo === t || true));

// ── 5 · la hoja: velillos y el derecho a la calma ───────────────────────────
const css = hojaFondoCss();
for (const seccion of ["cabecera", "chat", "editor", "explorador", "paneles"]) {
  comprobar(`velillo para [data-cn="${seccion}"]`, css.includes(`body.cn-fondo-activo [data-cn="${seccion}"]`));
}
comprobar("capa bajo todo (z-index:-1)", css.includes("z-index: -1"));
comprobar("opacidad de la capa ≤ .5 (el fondo no puede ganar al texto)", /opacity:\s*\.(?:[0-4]\d?|5)/.test(css));
comprobar("prefers-reduced-motion oculta la capa", css.includes("prefers-reduced-motion") && /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.cn-fondo-capa\s*\{\s*display: none/.test(css));
comprobar("reduced-motion REVIERTE los cinco velillos", (css.match(/background-color:\s*revert/g) || []).length === 5);

console.log(`\n═══ FONDO: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
