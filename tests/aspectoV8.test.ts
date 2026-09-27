/**
 * aspectoV8.test.ts — V8: el regulador de tamaño de verdad (depuración del "regulador mudo")
 * ============================================================================
 * Incidente reportado por el propietario (20/09/2026): "muchos reguladores no
 * cambian ninguna letra". Diagnóstico contra código:
 *   (1) index.css clava con `!important` los 5 tokens más usados
 *       (.text-xs/.text-sm/.text-[9px]/.text-[10px]/.text-[11px]) para el zoom
 *       global; la hoja de Aspecto emitía su calc SIN !important → perdía
 *       siempre: el regulador de tamaño era mudo sobre la mayoría de la UI
 *       (fuente y color funcionaban: esas propiedades no estaban clavadas).
 *   (2) el cuerpo de los mensajes del chat NO tenía clase de tamaño → ningún
 *       regulador lo alcanzaba, y es la letra que más ocupa la pantalla.
 *   (3) el slider "Tamaño del texto (px)" de Apariencia escribía
 *       --cn-font-size y NADA lo consumía: regulador 100 % muerto.
 *   (4) .text-[8px] (swatch ∅ de la propia tarjeta) no estaba inventariada.
 *   (5) bug colateral visto en la UI: el comentario "ZORD" sin llaves se
 *       renderizaba como texto literal (hijo JSX) en las tarjetas modales.
 * Esta suite fija cada cura; si alguien la rompe, el test lo denuncia.
 */
import { TOKENS_TAMANO, hojaAspecto, normalizarAspecto } from "../src/engine/aspecto";
import fs from "node:fs";
import path from "node:path";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

// ── 1 · inventario completo ──────────────────────────────────────────────────
comprobar("15 tokens (V8: +text-[8px])", TOKENS_TAMANO.length === 15, String(TOKENS_TAMANO.length));
const sels = TOKENS_TAMANO.map((t) => t.sel);
comprobar("sin tokens duplicados", new Set(sels).size === sels.length);
comprobar("text-[8px] inventariada", sels.includes(".text-\\[8px\\]"));

// ── 2 · las reglas de tamaño llevan !important (ganan la paridad de la app) ─
const conf = normalizarAspecto({ secciones: { general: { tam: 110 }, chat: { tam: 150 } } });
const css = hojaAspecto(conf);
const iGen = css.match(/body\[data-cn="general"\] \.text-xs\{([^}]+)\}/);
comprobar("general: font-size con !important", !!iGen && iGen[1].includes("!important"), iGen?.[1]);
const iChat = css.match(/\[data-cn="chat"\] \.text-xs\{([^}]+)\}/);
comprobar("sección: font-size con !important", !!iChat && iChat[1].includes("!important"), iChat?.[1]);

// ── 3 · .cn-regulable: el texto sin clase de tamaño también se regula ───────
comprobar(
  "cn-regulable general (tam≠100)",
  css.includes('body[data-cn="general"] .cn-regulable{font-size:calc(0.933rem * var(--cn-fs-general)) !important;}')
);
comprobar(
  "cn-regulable chat multiplica sección×general",
  css.includes('[data-cn="chat"] .cn-regulable{font-size:calc(0.933rem * var(--cn-fs-chat) * var(--cn-fs-general)) !important;}')
);
const cssNeutral = hojaAspecto({ secciones: {} });
comprobar("cn-regulable ausente en config neutro (cero coste)", !cssNeutral.includes(".cn-regulable"));

// ── 4 · el slider de Apariencia está cableado (antes: cero consumidores) ────
const idxCss = fs.readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");
comprobar("body consume var(--cn-font-size, 14px)", /font-size:\s*var\(--cn-font-size,\s*14px\)/.test(idxCss));
const proSrc = fs.readFileSync(path.resolve(process.cwd(), "src/utils/proSettings.ts"), "utf8");
comprobar("default appearance.fontSize = 14 (neutral vs el 14px heredado)", /fontSize:\s*14,/.test(proSrc));

// ── 5 · fuga de comentario JSX-hijo (el bug ZORD) ───────────────────────────
// Un `/* ... */` colocado como HIJO de un elemento JSX (tras el `>` con espacio,
// sin llaves) se renderiza como texto literal en la interfaz. El comentario
// JSX válido es `{/* ... */}`; el de atributo vive ANTES del `>`. Patrón de
// fuga: `>` + espacio + `/*` (nunca `{/*` ni `*/>`).
const srcDir = path.resolve(process.cwd(), "src");
const fugas: string[] = [];
const walk = (d: string) => {
  if (!fs.existsSync(d)) return;
  fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!/\.tsx$/.test(e.name)) return;
    const t = fs.readFileSync(p, "utf8");
    for (const m of t.matchAll(/>[ \t]+\/\*/g)) {
      fugas.push(`${path.relative(srcDir, p)}:L${t.slice(0, m.index).split("\n").length}`);
    }
  });
};
walk(srcDir);
comprobar("ningún comentario JSX-hijo fugado (bug ZORD)", fugas.length === 0, fugas.slice(0, 3).join(","));

// ── 6 · el texto del editor responde al regulador ───────────────────────────
const ce = fs.readFileSync(path.resolve(process.cwd(), "src/components/CodeEditor.tsx"), "utf8");
comprobar(
  "CodeEditor: las 3 superficies (preview/overlay/textarea) usan el calc del regulador «Editor»",
  (ce.match(/var\(--cn-fs-editor,\s*1\)\s*\*\s*var\(--cn-fs-general,\s*1\)\)/g) || []).length >= 3
);
const cc = fs.readFileSync(path.resolve(process.cwd(), "src/components/ChatCenter.tsx"), "utf8");
comprobar("ChatCenter: cuerpo de mensajes (fijo + streaming) con cn-regulable", (cc.match(/cn-regulable/g) || []).length >= 2);

console.log(`\n═══ ASPECTO V8: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
