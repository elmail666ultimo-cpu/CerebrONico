/**
 * aspecto.ts — ASPECTO v1: fuente, tamaño y color del TEXTO por sección
 * =====================================================================
 * El selector de tamaño de v1.9 escala `html` (rem): mueve TODA la interfaz.
 * Este motor hace lo que la gente pidió: cambiar SOLO EL TEXTO — tamaño,
 * familia y color — sección a sección (chat, editor, explorador, paneles,
 * cabecera, y un «general» que actúa sobre el resto del body).
 *
 * Cómo funciona sin re-render: la hoja de estilos ataca los TOKENS DE TAMAÑO
 * QUE LA INTERFAZ USA DE VERDAD (inventariados a grep sobre src/, listados
 * abajo) con selectores MÁS ESPECÍFICOS que la clase suelta de Tailwind:
 * `[data-cn="chat"] .text-xs` (0,2,0) gana a `.text-xs` (0,1,0).
 * El factor vive en una custom property por sección:
 *     font-size: calc(0.75rem * var(--cn-fs-chat) * var(--cn-fs-general))
 * — el anidamiento general×sección se MULTIPLICA (variables resueltas en el
 * elemento), que es lo que la cascada de reglas sueltas jamás logró.
 *
 * V8 (depuración del regulador "mudo"): index.css clavó los 5 tokens más
 * usados (.text-xs, .text-sm, .text-[9px], .text-[10px], .text-[11px]) con
 * `!important` para el zoom global de la app — y un `!important` de la app
 * ganaba SIEMPRE a nuestro calc sin !important: muchos reguladores de tamaño
 * no cambiaban NINGUNA letra (fuente y color sí, porque esas propiedades no
 * estaban clavadas). Ahora las reglas de tamaño de la hoja llevan !important:
 * a paridad de !important gana la especificidad más alta, y la hoja SOLO
 * emite reglas cuando el usuario tocó el regulador (tam≠100), de modo que el
 * comportamiento por defecto (zoom global) no se altera un solo píxel.
 * Además `.cn-regulable` deja regular el texto que NO tiene clase de tamaño
 * (cuerpo de mensajes del chat) — antes era la letra que más ocupa la
 * pantalla y la que el regulador jamás alcanzaba.
 *
 * Color: solo se aplanan los NEUTROS (zinc/slate/gray/neutral) — los acentos
 * (cian, esmeralda, ámbar, rojo error) se conservan a propósito: cambiar el
 * texto no debe cambiar el significado de un badge de peligro.
 *
 * Puro, sin DOM: node puede testearlo; el DOM solo pinta el <style> y guarda
 * localStorage. Nada silencioso: valores ilegales se descartan al normalizar.
 */

export interface AjusteSeccion {
  /** porcentaje 70–220 (100 = sin cambio) */
  tam?: number;
  /** id de FUENTES; "heredar" = sin cambio */
  fuente?: string;
  /** HEX (#rgb..#rrggbbaa); null = volver a heredar (el config guardado nunca la lleva) */
  color?: string | null;
}

export interface ConfigAspecto {
  secciones: Record<string, AjusteSeccion>;
}

export interface Seccion { id: string; nombre: string; icono: string }

/** Las cinco zonas enganchadas con data-cn + el general (sobre <body>). */
export const SECCIONES: readonly Seccion[] = [
  { id: "general", nombre: "General", icono: "◱" },
  { id: "chat", nombre: "Chat", icono: "💬" },
  { id: "editor", nombre: "Editor", icono: "📝" },
  { id: "explorador", nombre: "Explorador", icono: "🗂" },
  { id: "paneles", nombre: "Paneles", icono: "🧩" },
  { id: "cabecera", nombre: "Cabecera", icono: "🎩" },
];

export const TAM_MIN = 70;
export const TAM_MAX = 220;

export interface Fuente { id: string; nombre: string; pila: string }
/** Pilas 100% de sistema: cero descargas, cero RAM de fuentes web. */
export const FUENTES: readonly Fuente[] = [
  { id: "heredar", nombre: "Heredar", pila: "" },
  { id: "sistema", nombre: "Sistema", pila: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif' },
  { id: "mono", nombre: "Monoespaciada", pila: 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace' },
  { id: "serif", nombre: "Serif", pila: 'ui-serif, Georgia, "Times New Roman", serif' },
  { id: "legible", nombre: "Legible ancha", pila: '"Atkinson Hyperlegible", Verdana, Tahoma, sans-serif' },
];

/** Muestras de color para la paleta (el resto lo pone el usuario). */
export const PALETA: readonly { id: string; nombre: string; color: string | null }[] = [
  { id: "heredar", nombre: "Heredar", color: null },
  { id: "blanco", nombre: "Blanco", color: "#f8fafc" },
  { id: "hueso", nombre: "Hueso", color: "#e9e4d5" },
  { id: "amarillo", nombre: "Amarillo pálido", color: "#fde68a" },
  { id: "verde", nombre: "Verde suave", color: "#86efac" },
  { id: "cian", nombre: "Cian", color: "#67e8f9" },
  { id: "azul", nombre: "Azul claro", color: "#93c5fd" },
  { id: "lavanda", nombre: "Lavanda", color: "#c4b5fd" },
  { id: "rosa", nombre: "Rosa", color: "#f9a8d4" },
  { id: "naranja", nombre: "Naranja", color: "#fdba74" },
  { id: "gris", nombre: "Gris", color: "#a1a1aa" },
  { id: "negro", nombre: "Negro", color: "#0b101c" },
];

/**
 * Tokens de tamaño REALES del código de la interfaz (grep 19-sep-2026).
 * Si mañana la UI usa una clase nueva, no escala: es el límite declarado de
 * esta técnica — regenerar la lista es una línea, nunca un bug silencioso,
 * porque tests/aspecto.test.ts exige que el inventario no se quede atrás.
 * V8: + `.text-[8px]` (el swatch ∅ de la tarjeta de la paleta) — 15 tokens.
 */
export const TOKENS_TAMANO: readonly { sel: string; base: string }[] = [
  { sel: ".text-\\[8px\\]", base: "8px" },
  { sel: ".text-\\[9px\\]", base: "9px" },
  { sel: ".text-\\[10px\\]", base: "10px" },
  { sel: ".text-\\[10\\.5px\\]", base: "10.5px" },
  { sel: ".text-\\[11px\\]", base: "11px" },
  { sel: ".text-\\[11\\.5px\\]", base: "11.5px" },
  { sel: ".text-\\[12px\\]", base: "12px" },
  { sel: ".text-\\[13px\\]", base: "13px" },
  { sel: ".text-\\[14px\\]", base: "14px" },
  { sel: ".text-\\[15px\\]", base: "15px" },
  { sel: ".text-xs", base: "0.75rem" },
  { sel: ".text-sm", base: "0.875rem" },
  { sel: ".text-base", base: "1rem" },
  { sel: ".text-lg", base: "1.125rem" },
  { sel: ".text-xl", base: "1.25rem" },
];

/** Neutros en uso (los acentos NO se tocan, a propósito). */
export const NEUTROS: readonly string[] = [
  ".text-zinc-100", ".text-zinc-200", ".text-zinc-300", ".text-zinc-400", ".text-zinc-500", ".text-zinc-600", ".text-zinc-700", ".text-zinc-950",
  ".text-slate-200", ".text-slate-300", ".text-slate-400", ".text-slate-500", ".text-slate-600",
];

const ES_HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function normalizarAspecto(bruto: unknown): ConfigAspecto {
  const conf: ConfigAspecto = { secciones: {} };
  const idesValidos = new Set(SECCIONES.map((s) => s.id));
  const o = bruto as { secciones?: Record<string, Partial<AjusteSeccion>> } | null;
  if (o && o.secciones && typeof o.secciones === "object") {
    for (const [id, a] of Object.entries(o.secciones)) {
      if (!idesValidos.has(id) || !a || typeof a !== "object") continue; // basura fuera, sin gritar pero sin callar: se ignora aquí y solo aquí
      const limpio: AjusteSeccion = {};
      if (typeof a.tam === "number" && isFinite(a.tam)) {
        const t = Math.max(TAM_MIN, Math.min(TAM_MAX, Math.round(a.tam)));
        if (t !== 100) limpio.tam = t;
      }
      if (typeof a.fuente === "string" && FUENTES.some((f) => f.id === a.fuente) && a.fuente !== "heredar") limpio.fuente = a.fuente;
      if (typeof a.color === "string" && ES_HEX.test(a.color)) limpio.color = a.color;
      if (Object.keys(limpio).length) conf.secciones[id] = limpio;
    }
  }
  return conf;
}

/** Cambia una sección devolviendo CONFIG NUEVA (inmutable); lo neutro se borra. */
export function modificarSeccion(conf: ConfigAspecto, id: string, cambio: AjusteSeccion): ConfigAspecto {
  const nuevo: ConfigAspecto = { secciones: { ...conf.secciones } };
  const amalgamado: AjusteSeccion = { ...(conf.secciones[id] || {}), ...cambio };
  const limpio = normalizarAspecto({ secciones: { [id]: amalgamado } }).secciones[id];
  if (limpio) nuevo.secciones[id] = limpio; else delete nuevo.secciones[id];
  return nuevo;
}

export function valorSeccion(conf: ConfigAspecto, id: string): { tam: number; fuente: string; color: string | null } {
  const a = conf.secciones[id] || {};
  return { tam: a.tam ?? 100, fuente: a.fuente ?? "heredar", color: a.color ?? null };
}

export function hayAspecto(conf: ConfigAspecto): boolean {
  return Object.keys(conf.secciones).length > 0;
}

/**
 * LA hoja: variables por sección + reglas de tokens (general primero,
 * secciones después: a igual especificidad gana la última — y la sección DEBE
 * ganar al general cuando ambas aplican al mismo nodo).
 */
export function hojaAspecto(conf: ConfigAspecto): string {
  const variables: string[] = [];
  for (const s of SECCIONES) {
    const a = conf.secciones[s.id];
    variables.push(`--cn-fs-${s.id}:${(a?.tam ?? 100) / 100}`);
    if (a?.fuente) { const f = FUENTES.find((x) => x.id === a.fuente); if (f?.pila) variables.push(`--cn-ff-${s.id}:${f.pila}`); }
    if (a?.color && ES_HEX.test(a.color)) variables.push(`--cn-fc-${s.id}:${a.color}`);
  }
  const partes: string[] = [":root{" + variables.join(";") + ";}"];

  /**
   * v1.6.6 — 🐞 «solo anda el general, los otros independientes no andan».
   *
   * El ancla de sección era `[data-cn="chat"]`, que CON la clase da (0,2,0);
   * el general es `body[data-cn="general"]`, que con la clase da (0,2,1). El
   * elemento `body` de más le daba al general MÁS especificidad que a cualquier
   * sección, así que en cuanto el usuario tocaba «General» las cinco secciones
   * quedaban muertas en toda la interfaz — y el único sitio donde seguían
   * respondiendo era la vista previa de la tarjeta, que no pasa por CSS sino
   * por un `style` calculado en React. De ahí la sensación de «funciona en la
   * ventana pero no en la interfaz».
   *
   * Un comentario del código viejo decía «a igual especificidad gana la
   * última». Cierto, pero no eran iguales: nadie contó el `body`.
   *
   *   general → body[data-cn="general"]                  (0,2,1) con la clase
   *   sección → body[data-cn="general"] [data-cn="chat"] (0,3,1) ← gana siempre
   *             body [data-cn="chat"]                    (0,2,1) ← red: empata
   *                                                        y desempata el orden
   *
   * La segunda ancla es una red por si `<body>` perdiera el atributo (o el
   * usuario inyectara la hoja en otro documento): empata en especificidad y
   * gana por ir después. Ninguna de las dos depende de que el general esté
   * ajustado, que era la otra forma de romperse.
   *
   * Devuelve SIEMPRE una lista: las reglas se arman con producto cartesiano.
   * Concatenar `"a, b" + " .text-xs"` dejaría el primer selector SIN la clase y
   * el tamaño se aplicaría al contenedor entero en vez de al texto.
   */
  const anclajes = (id: string): string[] =>
    id === "general" ? ['body[data-cn="general"]'] : [`body[data-cn="general"] [data-cn="${id}"]`, `body [data-cn="${id}"]`];

  /** Regla CSS con producto cartesiano anclajes × resto. */
  const regla = (id: string, resto: string, declaracion: string): string =>
    anclajes(id).map((a) => `${a}${resto ? ` ${resto}` : ""}`).join(",") + `{${declaracion}}`;

  // tamaño: solo se emiten reglas de quien tiene factor ≠ 1 (hoja mínima para el 1B de recursos)
  // V8 — las reglas de tamaño llevan `!important`: index.css clava con !important
  // los 5 tokens más usados (.text-xs/.text-sm/.text-[9px]/.text-[10px]/.text-[11px])
  // para el zoom global, y un !important sin contrapunto gana SIEMPRE. A paridad de
  // !important gana la especificidad más alta — y la hoja SOLO emite cuando el usuario
  // tocó el regulador (tam≠100), así el por defecto no se mueve un píxel.
  if (conf.secciones.general?.tam)
    for (const tok of TOKENS_TAMANO)
      partes.push(regla("general", tok.sel, `font-size:calc(${tok.base} * var(--cn-fs-general)) !important;`));
  for (const s of SECCIONES) {
    if (s.id === "general" || !conf.secciones[s.id]?.tam) continue;
    for (const tok of TOKENS_TAMANO)
      partes.push(regla(s.id, tok.sel, `font-size:calc(${tok.base} * var(--cn-fs-${s.id}) * var(--cn-fs-general)) !important;`));
  }
  // V8 — .cn-regulable: el texto SIN clase de tamaño (cuerpo de mensajes del chat)
  // también obedece al regulador de su sección. Base 0.933rem ≈ 14px a 15px de html,
  // que es lo que heredaba por defecto: regulador en 100 % no lo mueve.
  if (conf.secciones.general?.tam)
    partes.push(regla("general", ".cn-regulable", "font-size:calc(0.933rem * var(--cn-fs-general)) !important;"));
  for (const s of SECCIONES) {
    if (s.id === "general" || !conf.secciones[s.id]?.tam) continue;
    partes.push(regla(s.id, ".cn-regulable", `font-size:calc(0.933rem * var(--cn-fs-${s.id}) * var(--cn-fs-general)) !important;`));
  }
  // fuente: raíz de sección + clases tipográficas explícitas de Tailwind
  for (const s of SECCIONES) {
    if (!conf.secciones[s.id]?.fuente) continue;
    partes.push(regla(s.id, "", `font-family:var(--cn-ff-${s.id});`));
    const selFuente = anclajes(s.id)
      .flatMap((a) => [".font-mono", ".font-sans", ".font-serif"].map((c) => `${a} ${c}`))
      .join(",");
    partes.push(`${selFuente}{font-family:var(--cn-ff-${s.id});}`);
  }
  // color: solo neutros (los acentos se declaran intocables)
  for (const s of SECCIONES) {
    if (!conf.secciones[s.id]?.color) continue;
    partes.push(regla(s.id, "", `color:var(--cn-fc-${s.id});`));
    for (const n of NEUTROS) partes.push(regla(s.id, n, `color:var(--cn-fc-${s.id});`));
  }
  return partes.join("\n");
}

export const LS_CLAVE = "cn.aspecto.v1";

export function leerAspectoLocal(): ConfigAspecto {
  try {
    if (typeof localStorage === "undefined") return { secciones: {} };
    const bruto = localStorage.getItem(LS_CLAVE);
    return normalizarAspecto(bruto ? JSON.parse(bruto) : null);
  } catch { return { secciones: {} }; }
}

export function escribirAspectoLocal(conf: ConfigAspecto): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    if (hayAspecto(conf)) { localStorage.setItem(LS_CLAVE, JSON.stringify(conf)); return true; }
    localStorage.removeItem(LS_CLAVE); // sin ajustes = sin huella guardada
    return true;
  } catch { return false; }
}

/** Pinta la hoja en <head> (id única, re-entrante) y engancha el general al body. */
export function aplicarEnDocumento(conf: ConfigAspecto): void {
  try {
    if (typeof document === "undefined") return;
    document.body?.setAttribute("data-cn", "general");
    let hoja = document.getElementById("cn-aspecto-hoja") as HTMLStyleElement | null;
    if (!hoja) {
      hoja = document.createElement("style");
      hoja.id = "cn-aspecto-hoja";
      document.head.appendChild(hoja);
    }
    hoja.textContent = hojaAspecto(conf);
  } catch { /* sin DOM (node/test) o navegador antiguo: el config sigue en localStorage, nada roto */ }
}
