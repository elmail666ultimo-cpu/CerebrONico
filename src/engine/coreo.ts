/**
 * coreo.ts — COREO v1: la pantalla BAILA lo que el motor ejecuta
 * ==============================================================
 * El plan corre en el servidor; su narración ya existe (onAviso → "[Cerebro]
 * …"). COREO convierte esa narración en un lenguaje visual: cada acción tiene
 * icono, verbo en gerundio, color y MOVIMIENTO propio (latido, escaneo,
 * tecleo, chispa, sacudida, brillo), y la interfaz lo pinta en la Espina de
 * Actividad. Nada de "spinners genéricos": si el chip dice «pensando» y late,
 * es que hay una tarea modelo viva; si «bloqueado» sacude, algo NO pasó.
 *
 * Puro (sin DOM ni Node): lo importa el server (bus + anillo), lo importa el
 * navegador (hoja CSS + clasificación) y lo testea node. El bus viaja por
 * GET /api/coreo con poll de 700 ms: la misma arquitectura que la cola de
 * invocaciones del puente de extensiones, probada antes.
 */

export type Anim = "latido" | "orbita" | "escaneo" | "tecleo" | "chispa" | "sacudida" | "brillo" | "quieto";

export interface AccionCoreo {
  id: string;
  verbo: string;   // gerundio: lo que la pantalla dice en voz alta
  icono: string;
  anim: Anim;
  color: string;
}

export const ACCIONES: Record<string, AccionCoreo> = {
  pensar:     { id: "pensar",     verbo: "pensando",           icono: "🧠", anim: "latido",   color: "#67e8f9" },
  planificar: { id: "planificar", verbo: "ordenando el plan",  icono: "🗺", anim: "orbita",   color: "#93c5fd" },
  espejo:     { id: "espejo",     verbo: "en el espejo",       icono: "🪞", anim: "escaneo",  color: "#6ee7b7" },
  escribir:   { id: "escribir",   verbo: "escribiendo código", icono: "✍",  anim: "tecleo",   color: "#fcd34d" },
  convertir:  { id: "convertir",  verbo: "convirtiendo",       icono: "🔁", anim: "escaneo",  color: "#a5b4fc" },
  imagen:     { id: "imagen",     verbo: "revelando imagen",   icono: "🖼", anim: "chispa",   color: "#f9a8d4" },
  forjar:     { id: "forjar",     verbo: "forjando complemento", icono: "⚒", anim: "chispa",  color: "#86efac" },
  verificar:  { id: "verificar",  verbo: "pasando el crítico", icono: "🔍", anim: "escaneo",  color: "#7dd3fc" },
  bloqueado:  { id: "bloqueado",  verbo: "BLOQUEADO",          icono: "⛔", anim: "sacudida", color: "#f87171" },
  entregar:   { id: "entregar",   verbo: "firmando entrega",   icono: "📦", anim: "brillo",   color: "#bef264" },
  actividad:  { id: "actividad",  verbo: "actividad",          icono: "•",  anim: "quieto",   color: "#94a3b8" },
};

export interface EventoCoreo { accion: string; detalle: string; n: number }

const ANILLO_MAX = 14;
let ANILLO: EventoCoreo[] = [];
let EMITIDOS = 0;

/** Publicar una acción. Acción desconocida = motivo con la lista de las conocidas. */
export function notificar(accion: string, detalle = ""): { ok: true } | { ok: false; motivos: string[] } {
  if (!ACCIONES[accion]) return { ok: false, motivos: ["acción «" + accion + "» no coreografiada; conocidas: " + Object.keys(ACCIONES).join(" · ")] };
  EMITIDOS++;
  ANILLO.unshift({ accion, detalle: String(detalle).slice(0, 110), n: EMITIDOS });
  if (ANILLO.length > ANILLO_MAX) ANILLO.length = ANILLO_MAX;
  return { ok: true };
}

/**
 * El clasificador: una línea de la narración del plan entra, una acción sale.
 * Orden = prioridad (un "NO se guardó" es bloqueado aunque hable de imagen).
 * Las muestras de detalle son literales de planExecutors/forja/aduana reales.
 */
const CLASIFICADOR: ReadonlyArray<readonly [RegExp, string]> = [
  [/no se pudo|no se guard|NO se |no pasó|no tiene|se pierde|queda en la URL|rechaz|bloquea|BLOQUEO|ilegal/i, "bloqueado"],
  [/forja|forjado|complemento \w+\.\w+ (creado|forjado)/i, "forjar"],
  [/aduana|manifiesto|ENTREGA\/|firmand/i, "entregar"],
  [/critic|rutas_vigilar|vigilar rutas|smoke|microtest|crític/i, "verificar"],
  [/→ ?modelo|llamada al modelo|pidiendo al modelo/i, "pensar"],
  [/guardó como|guardado|escribi|write|creado: |generar_codigo/i, "escribir"],
  [/convirti|conversión|\.md a |\.json a /i, "convertir"],
  [/imagen|generar_imagen|revelad/i, "imagen"],
  [/reflejo|espejo|entidad (espejo|mate|maq|texto|datos|vis|proyecto|memorista|especialista)[s]?\.|votant/i, "espejo"],
  [/lotes|presupuesto|gobernador|plan \S+ (creado|arranca)|semáforo/i, "planificar"],
];
export function clasificarAviso(linea: string): { accion: string; detalle: string } {
  const l = String(linea || "");
  for (const [re, accion] of CLASIFICADOR) if (re.test(l)) return { accion, detalle: l.replace(/^\[plan [^\]]*\] /, "").slice(0, 110) };
  return { accion: "actividad", detalle: l.replace(/^\[plan [^\]]*\] /, "").slice(0, 110) };
}

/** El gancho del servidor: sustituye al console.log del onAviso y lo COMPLEMENTA. */
export function narrarDesdeAviso(linea: string): void {
  // consola intacta: lo que veía el programador sigue viéndose; encima, el bus
  console.log(`[Cerebro] ${linea}`);
  const c = clasificarAviso(linea);
  notificar(c.accion, c.detalle);
}

/** Lectura client-side del estado de una tarea del plan (para el chip "ahora"). */
export function accionDesdeTarea(tipo: string, estado: string): string {
  if (estado === "fallida" || estado === "bloqueada") return "bloqueado";
  if (estado === "hecha") return tipo === "generar_imagen" ? "imagen" : tipo === "reflejo" ? "espejo" : "actividad";
  if (estado !== "ejecutando") return "actividad";
  switch (tipo) {
    case "modelo": case "generar_codigo": return "pensar";
    case "reflejo": return "espejo";
    case "convertir": return "convertir";
    case "generar_imagen": return "imagen";
    case "leer_archivo": return "actividad";
    default: return "actividad";
  }
}

export function coreoEstado() {
  return {
    ok: true,
    emitidos: EMITIDOS,
    actual: ANILLO[0] || null,
    anillo: ANILLO.slice(0, 8),
    vocabulario: Object.keys(ACCIONES),
    nota: "El servidor narra, la interfaz baila: poll cada 700 ms a /api/coreo.",
  };
}

// ═══ La hoja: los MOVIMIENTOS ═══════════════════════════════════════════════

/** CSS puro como string (testeable en node; el componente solo lo inyecta). */
export function hojaCoreoCss(): string {
  return `
/* COREO v1 — vocabulario de movimiento */
@keyframes cn-latido { 0%,100%{transform:scale(1);filter:brightness(1)} 50%{transform:scale(1.13);filter:brightness(1.45)} }
@keyframes cn-orbita { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
@keyframes cn-escaneo { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
@keyframes cn-tecleo { 0%,49%{border-right-color:currentColor} 50%,100%{border-right-color:transparent} }
@keyframes cn-chispa { 0%,100%{text-shadow:0 0 0 rgba(255,255,255,0)} 40%{text-shadow:0 0 12px rgba(255,255,255,.95)} }
@keyframes cn-sacudida { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-3px)} 40%{transform:translateX(3px)} 60%{transform:translateX(-2px)} 80%{transform:translateX(2px)} }
@keyframes cn-brillo { 0%,100%{filter:brightness(1)} 55%{filter:brightness(1.7) drop-shadow(0 0 6px currentColor)} }
.cn-coreo-chip { display:inline-flex; align-items:center; gap:5px; padding:1px 9px; border-radius:999px;
  border:1px solid currentColor; font-size:11px; line-height:1.5; white-space:nowrap; max-width:290px; overflow:hidden; }
.cn-coreo-chip small { color:#94a3b8; font-weight:400; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cn-coreo-live { box-shadow:0 0 10px -2px currentColor; font-weight:600; }
.cn-anim-latido { animation: cn-latido 1.15s ease-in-out infinite; }
.cn-anim-orbita { animation: cn-orbita 3.2s linear infinite; display:inline-block; }
.cn-anim-escaneo { animation: cn-sacudida 0s; background-image:linear-gradient(90deg,transparent,rgba(255,255,255,.14),transparent); background-size:220% 100%; animation: cn-escaneo 1.6s ease-in-out infinite; }
.cn-anim-tecleo { border-right:2px solid currentColor; padding-right:4px; animation: cn-tecleo .8s step-end infinite; }
.cn-anim-chispa { animation: cn-chispa .9s ease-in-out infinite; }
.cn-anim-sacudida { animation: cn-sacudida .5s ease-in-out infinite; }
.cn-anim-brillo { animation: cn-brillo 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .cn-anim-latido,.cn-anim-orbita,.cn-anim-escaneo,.cn-anim-tecleo,.cn-anim-chispa,.cn-anim-sacudida,.cn-anim-brillo { animation:none; }
  .cn-anim-tecleo { border-right-color:transparent; }
}
`;
}
