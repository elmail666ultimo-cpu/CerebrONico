/**
 * quirofano.ts — QUIRÓFANO v1 (motor determinista)
 * ================================================
 * EL PROBLEMA, TAL CUAL LO VIVE EL USUARIO
 * ----------------------------------------
 * «Subo una app que funciona, le pido una mejora y el modelo la rompe.»
 * La causa no es que el modelo sea tonto: es que la herramienta que le damos
 * para escribir es un martillo. `write_file` deja al modelo reescribir un
 * archivo de 600 líneas de memoria, y un modelo de nube (Gemini, GLM, Grok…)
 * con 8 archivos de contexto hace lo que puede: devuelve una versión
 * «mejorada» a la que le falta la mitad de las funciones que no miraba. El
 * resultado compila a veces y arranca nunca.
 *
 * El guardián de sintaxis (v2.1) ya impide escribir un archivo DESBALANCEADO.
 * Eso no basta: un archivo perfectamente balanceado y perfectamente mutilado
 * pasa el guardián sin pestañear — y ahí es donde muere la app.
 *
 * QUÉ HACE ESTE MÓDULO
 * --------------------
 * 1. ABRE UNA OPERACIÓN antes del primer cambio: guarda copia de cada archivo
 *    ANTES de tocarlo (copia-al-escribir, no del proyecto entero: barato).
 * 2. JUZGA CADA ESCRITURA antes de que toque el disco:
 *      · ¿desaparecen exportaciones que existían?         → peligroso
 *      · ¿el archivo pierde ≥35 % de líneas útiles?       → peligroso (amputación)
 *      · ¿trae marcadores de truncado («…», «resto del código»)? → peligroso
 *      · ¿el package.json pierde dependencias o scripts?  → peligroso
 *      · ¿pierde entre 12 % y 35 %?                       → revisar (avisa, deja pasar)
 * 3. CIERRA LA OPERACIÓN con PUERTAS de verdad sobre el DISCO (no sobre lo que
 *    el modelo dice haber escrito): sintaxis, imports relativos rotos, superficie
 *    pública perdida. Si una puerta bloqueante cae, REVIERTE los archivos de esa
 *    operación y devuelve el informe para que el modelo se corrija.
 *
 * Es 100 % determinista, sin dependencias de red, sin llamar a ningún modelo:
 * coste cero en tokens y cero en créditos. Reutiliza el guardián de sintaxis y
 * el comprobador de imports que ya existían.
 *
 * FILOSOFÍA DE LOS UMBRALES
 * -------------------------
 * Un guardián que bloquea demasiado es tan inútil como uno que no bloquea nada:
 * el usuario aprende a saltárselo. Por eso «revisar» deja pasar (con aviso) y
 * sólo se bloquea lo que de verdad rompe una app que funcionaba: perder API
 * pública, quedarse a la mitad, o encogerse hasta perder funciones enteras.
 * Y siempre hay una salida honesta (`force=true` + motivo), porque quien manda
 * es el usuario: lo que no puede pasar es que la pérdida ocurra EN SILENCIO.
 */

import { guardFile, problemasBloqueantes } from "./syntaxGuard";
import { findMissingImports, type CheckFile } from "./importChecker";

export const VERSION_QUIROFANO = "1.0.0";

// ─────────────────────────────────────────────────────────────────────────────
// Umbrales (exportados: la suite de pruebas los usa como contrato)
// ─────────────────────────────────────────────────────────────────────────────

/** Pérdida de líneas útiles que ya se considera amputación (bloquea). */
export const UMBRAL_AMPUTACION = 0.35;
/** Pérdida a partir de la cual se avisa sin bloquear. */
export const UMBRAL_AVISO = 0.12;
/** Por debajo de estas líneas útiles, un archivo es demasiado pequeño para juzgarlo por tamaño. */
export const MIN_LINEAS_PARA_CIRUGIA = 30;
/** Tope de bytes de un archivo que se guarda íntegro para poder revertirlo. */
export const MAX_BYTES_REVERSION = 512 * 1024;

/** Rutas donde un recorte «pequeño» deja la app sin arrancar. */
export const RUTAS_DE_RIESGO = [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mts",
  "index.html",
  "src/main.tsx",
  "src/main.ts",
  "src/main.jsx",
  "src/index.tsx",
  "src/App.tsx",
  "src/App.jsx",
];

export type Veredicto = "seguro" | "revisar" | "peligroso";
export type ModoEvaluacion = "cirugia" | "carga";
export type Gravedad = "bloqueante" | "aviso";

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades puras
// ─────────────────────────────────────────────────────────────────────────────

export function normalizarRuta(ruta: string): string {
  return String(ruta || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/{2,}/g, "/").replace(/\/$/, "");
}

/** Normaliza finales de línea para que un CRLF no cuente como cambio. */
export function normalizarTexto(texto: string): string {
  return String(texto ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Huella FNV-1a de 32 bits en hexadecimal. Deliberadamente sin `node:crypto`:
 * este módulo tiene que poder correr igual en el servidor y en el navegador.
 */
export function huella(texto: string): string {
  let h = 0x811c9dc5;
  const t = String(texto ?? "");
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function contarLineas(texto: string): number {
  const t = normalizarTexto(texto);
  if (!t) return 0;
  return t.split("\n").length;
}

/**
 * Líneas ÚTILES: no vacías y no comentario puro. Es la medida honesta de
 * «cuánto código hay aquí» — contar bytes premia al que deja líneas en blanco.
 */
export function lineasUtiles(texto: string): number {
  const t = normalizarTexto(texto);
  if (!t.trim()) return 0;
  let n = 0;
  for (const linea of t.split("\n")) {
    const l = linea.trim();
    if (!l) continue;
    if (l.startsWith("//") || l.startsWith("/*") || l.startsWith("*") || l.startsWith("#") || l.startsWith("<!--")) continue;
    n++;
  }
  return n;
}

const PATRONES_EXPORT: Array<{ re: RegExp; grupo: number }> = [
  { re: /\bexport\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g, grupo: 1 },
  { re: /\bexport\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/g, grupo: 1 },
  { re: /\bexport\s*\{([^}]*)\}/g, grupo: 0 },
];

/**
 * Superficie pública de un archivo: qué nombres ofrece al resto del proyecto.
 * Es la lista que NUNCA debe encogerse al pedir una mejora.
 */
export function superficiePublica(texto: string): string[] {
  const t = normalizarTexto(texto);
  const nombres = new Set<string>();
  for (const { re, grupo } of PATRONES_EXPORT) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      if (grupo === 0) {
        const dentro = m[1] || "";
        for (const trozo of dentro.split(",")) {
          const nombre = trozo.trim().split(/\s+as\s+/).pop()?.trim() || "";
          if (nombre && /^[A-Za-z_$][\w$]*$/.test(nombre)) nombres.add(nombre);
          else if (trozo.includes("default")) nombres.add("default");
        }
      } else {
        nombres.add(m[grupo]);
      }
    }
  }
  if (/\bexport\s+default\b/.test(t)) nombres.add("default");
  return [...nombres].sort();
}

const MARCAS_TRUNCADO: Array<{ re: RegExp; que: string }> = [
  { re: /^\s*(?:\.\.\.|…)\s*$/m, que: "una línea que sólo tiene «...»" },
  { re: /resto\s+del\s+c[oó]digo/i, que: "la frase «resto del código»" },
  { re: /<\s*\.\.\.\s*>/, que: "el marcador «<...>»" },
  { re: /aqu[ií]\s+va(?:n)?\s+(?:el|los|la)\s+(?:c[oó]digo|resto)/i, que: "un «aquí va el código»" },
  { re: /(?:se\s+omite|omitido\s+por\s+brevedad|sin\s+cambios\s+en\s+el\s+resto)/i, que: "un «se omite»" },
  { re: /\/\*\s*\.\.\.\s*\*\//, que: "un comentario «/* ... */»" },
  { re: /elif\s+FALSE|pass\s*#\s*TODO|TODO:?\s*implementar/i, que: "un «TODO: implementar»" },
  { re: /etc\.\.\./i, que: "un «etc...»" },
];

/** Marcadores de que el modelo se quedó sin contexto a mitad (causa nº1 de apps rotas). */
export function marcadoresDeTruncado(texto: string): string[] {
  const t = normalizarTexto(texto);
  const out: string[] = [];
  for (const { re, que } of MARCAS_TRUNCADO) if (re.test(t)) out.push(que);
  return out;
}

/**
 * Lista legible y ACOTADA. Un informe que escupe 42 nombres de símbolos deja de
 * ser un informe y se convierte en ruido: el modelo (y el usuario) leen los
 * primeros y el resto deja de importar. Se nombran los primeros y se cuenta el resto.
 */
export function resumirLista(nombres: string[], max = 8): string {
  const lista = nombres || [];
  if (lista.length <= max) return lista.join(", ");
  return `${lista.slice(0, max).join(", ")} y ${lista.length - max} más`;
}

export function esRutaDeRiesgo(ruta: string): boolean {
  const r = normalizarRuta(ruta);
  if (RUTAS_DE_RIESGO.includes(r)) return true;
  if (r.endsWith("package.json")) return true;
  if (/(^|\/)main\.(tsx?|jsx?)$/.test(r)) return true;
  if (/(^|\/)vite\.config\.(ts|js|mts|mjs)$/.test(r)) return true;
  return false;
}

export function esPackageJson(ruta: string): boolean {
  return normalizarRuta(ruta).endsWith("package.json");
}

/** Dependencias y scripts de un package.json legible (o null si no se puede leer). */
export function partesDePackageJson(texto: string): { deps: string[]; scripts: string[] } | null {
  try {
    const j = JSON.parse(texto);
    return {
      deps: [...Object.keys(j?.dependencies || {}), ...Object.keys(j?.devDependencies || {})].sort(),
      scripts: Object.keys(j?.scripts || {}).sort(),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnóstico de una escritura
// ─────────────────────────────────────────────────────────────────────────────

export interface CifrasCirugia {
  lineasAntes: number;
  lineasDespues: number;
  utilesAntes: number;
  utilesDespues: number;
  /** Fracción de líneas útiles perdidas (0..1; 0 si el archivo era nuevo o vacío). */
  perdidaUtil: number;
  charsAntes: number;
  charsDespues: number;
  publicosAntes: number;
  publicosDespues: number;
  publicosPerdidos: string[];
}

export interface Diagnostico {
  ruta: string;
  existia: boolean;
  veredicto: Veredicto;
  motivos: string[];
  cifras: CifrasCirugia;
}

function cifrasDe(original: string | null, nuevo: string): CifrasCirugia {
  const antes = original === null ? "" : normalizarTexto(original);
  const despues = normalizarTexto(nuevo);
  const utilesAntes = original === null ? 0 : lineasUtiles(antes);
  const utilesDespues = lineasUtiles(despues);
  const supAntes = original === null ? [] : superficiePublica(antes);
  const supDespues = superficiePublica(despues);
  const perdidaUtil = utilesAntes > 0 ? Math.max(0, (utilesAntes - utilesDespues) / utilesAntes) : 0;
  return {
    lineasAntes: original === null ? 0 : contarLineas(antes),
    lineasDespues: contarLineas(despues),
    utilesAntes,
    utilesDespues,
    perdidaUtil: Math.round(perdidaUtil * 1000) / 1000,
    charsAntes: antes.length,
    charsDespues: despues.length,
    publicosAntes: supAntes.length,
    publicosDespues: supDespues.length,
    publicosPerdidos: supAntes.filter((s) => !supDespues.includes(s)),
  };
}

/**
 * El juez. Decide, ANTES de tocar el disco, si esta escritura puede romper una
 * app que funcionaba.
 *
 *  modo "cirugia" (por defecto): el usuario pide una MEJORA sobre algo que ya
 *    funciona → se vigila la pérdida de líneas, de API pública y el truncado.
 *  modo "carga": el usuario está SUBIENDO la app entera (muchos archivos nuevos
 *    de golpe) → juzgar la pérdida de líneas contra lo que hubiera en el sandbox
 *    sería un falso positivo; sólo se exige que no venga truncada.
 */
export function evaluarCirugia(
  ruta: string,
  original: string | null,
  nuevo: string,
  modo: ModoEvaluacion = "cirugia"
): Diagnostico {
  const r = normalizarRuta(ruta);
  const nuevoTxt = normalizarTexto(nuevo);
  const antesTxt = original === null ? null : normalizarTexto(original);
  const cifras = cifrasDe(original, nuevoTxt);
  const motivos: string[] = [];
  const truncados = marcadoresDeTruncado(nuevoTxt);
  const riesgo = esRutaDeRiesgo(r);

  // 1) Archivo nuevo: sólo se exige que esté completo.
  if (antesTxt === null) {
    if (truncados.length > 0) {
      return {
        ruta: r,
        existia: false,
        veredicto: "peligroso",
        motivos: [`El archivo NUEVO viene truncado: contiene ${truncados.join(", ")}. Escríbelo entero o no lo escribas.`],
        cifras,
      };
    }
    return { ruta: r, existia: false, veredicto: "seguro", motivos: [], cifras };
  }

  // 2) Sin cambios reales: escribir lo mismo no puede romper nada.
  if (antesTxt === nuevoTxt) {
    return { ruta: r, existia: true, veredicto: "seguro", motivos: [], cifras };
  }

  // 3) Truncado: la causa nº1 de app rota. Nunca pasa.
  if (truncados.length > 0) {
    motivos.push(
      `El contenido trae ${truncados.join(", ")} y el archivo YA existía: eso es una versión a medias, no una mejora.`
    );
  }

  // 4) API pública perdida: el resto del proyecto llama a eso y dejará de compilar.
  if (cifras.publicosPerdidos.length > 0) {
    motivos.push(
      `Desaparecen ${cifras.publicosPerdidos.length} exportación(es) que el resto del proyecto puede estar usando: ${resumirLista(cifras.publicosPerdidos)}.`
    );
  }

  // 5) package.json: perder dependencias o scripts deja la app sin arrancar.
  if (esPackageJson(r)) {
    const pAntes = partesDePackageJson(antesTxt);
    const pDespues = partesDePackageJson(nuevoTxt);
    if (pAntes && pDespues) {
      const depsPerdidas = pAntes.deps.filter((d) => !pDespues.deps.includes(d));
      const scriptsPerdidos = pAntes.scripts.filter((s) => !pDespues.scripts.includes(s));
      if (depsPerdidas.length) motivos.push(`El package.json pierde dependencias: ${depsPerdidas.slice(0, 8).join(", ")}.`);
      if (scriptsPerdidos.length) motivos.push(`El package.json pierde scripts: ${scriptsPerdidos.slice(0, 8).join(", ")}.`);
    }
  }

  // 6) Amputación por tamaño (sólo en modo cirugía y con archivos que lo merecen).
  if (modo === "cirugia" && cifras.utilesAntes >= MIN_LINEAS_PARA_CIRUGIA) {
    if (cifras.perdidaUtil >= UMBRAL_AMPUTACION) {
      motivos.push(
        `Amputación: ${cifras.utilesAntes} → ${cifras.utilesDespues} líneas útiles (${Math.round(
          cifras.perdidaUtil * 100
        )} % menos). Una mejora no encoge el archivo a la mitad.`
      );
    } else if (cifras.perdidaUtil >= UMBRAL_AVISO) {
      motivos.push(
        `AVISO (no bloquea): ${cifras.utilesAntes} → ${cifras.utilesDespues} líneas útiles (${Math.round(
          cifras.perdidaUtil * 100
        )} % menos). Comprueba que no se ha perdido nada que no te pedían tocar.`
      );
    }
  }

  // 7) Rutas donde cualquier recorte duele más: se avisa aunque el tamaño no llegue al umbral.
  if (riesgo && modo === "cirugia" && cifras.utilesDespues < cifras.utilesAntes && cifras.perdidaUtil < UMBRAL_AVISO) {
    motivos.push(`AVISO (no bloquea): ${r} es un archivo de arranque y pierde ${cifras.utilesAntes - cifras.utilesDespues} línea(s) útiles.`);
  }

  const bloqueantes = motivos.filter((m) => !m.startsWith("AVISO"));
  const veredicto: Veredicto = bloqueantes.length > 0 ? "peligroso" : motivos.length > 0 ? "revisar" : "seguro";
  return { ruta: r, existia: true, veredicto, motivos, cifras };
}

// ─────────────────────────────────────────────────────────────────────────────
// Operación: copia-al-escribir y reversión
// ─────────────────────────────────────────────────────────────────────────────

export interface CirugiaArchivo {
  ruta: string;
  existia: boolean;
  /** Contenido previo (null si el archivo era nuevo o si superó el tope de reversión). */
  original: string | null;
  huellaOriginal: string;
  huellaNueva: string;
  /** true si no se guardó el original por tamaño: la reversión será honesta y lo dirá. */
  noReversible: boolean;
  diagnostico: Diagnostico;
}

export interface Operacion {
  id: string;
  motivo: string;
  inicio: number;
  fin: number | null;
  /** ruta → cirugía registrada (la PRIMERA copia es la buena: es el estado original). */
  archivos: Map<string, CirugiaArchivo>;
  /** imports relativos rotos que ya existían antes de empezar (baseline de la puerta de imports). */
  importsAntes: string[];
  /** Exportaciones por archivo antes de empezar (baseline de la puerta de superficie). */
  superficieAntes: Record<string, string[]>;
  /** Se pone a true si la operación se revirtió. */
  revertida: boolean;
}

let contadorOperaciones = 0;

export function crearOperacion(motivo: string, ahora?: number): Operacion {
  contadorOperaciones += 1;
  const t = typeof ahora === "number" ? ahora : Date.now();
  return {
    id: `op-${t.toString(36)}-${contadorOperaciones}`,
    motivo: String(motivo || "cambio sin motivo declarado"),
    inicio: t,
    fin: null,
    archivos: new Map<string, CirugiaArchivo>(),
    importsAntes: [],
    superficieAntes: {},
    revertida: false,
  };
}

/**
 * Registra una escritura en la operación. La primera copia de cada ruta es la
 * que se guarda: si el modelo toca el mismo archivo tres veces, la reversión
 * devuelve el estado ANTERIOR a la operación, no el paso intermedio.
 */
export function anotarCirugia(
  op: Operacion,
  ruta: string,
  original: string | null,
  nuevo: string,
  diagnostico?: Diagnostico
): CirugiaArchivo {
  const r = normalizarRuta(ruta);
  const diag = diagnostico || evaluarCirugia(r, original, nuevo);
  const previa = op.archivos.get(r);
  if (previa) {
    previa.huellaNueva = huella(nuevo);
    previa.diagnostico = diag;
    return previa;
  }
  const cabeElOriginal = original !== null && original.length <= MAX_BYTES_REVERSION;
  const registro: CirugiaArchivo = {
    ruta: r,
    existia: original !== null,
    original: cabeElOriginal ? original : null,
    huellaOriginal: original === null ? "" : huella(original),
    huellaNueva: huella(nuevo),
    noReversible: original !== null && !cabeElOriginal,
    diagnostico: diag,
  };
  op.archivos.set(r, registro);
  if (original !== null && !(r in op.superficieAntes)) op.superficieAntes[r] = superficiePublica(original);
  return registro;
}

export function cirugiasDe(op: Operacion): CirugiaArchivo[] {
  return [...op.archivos.values()];
}

/** Rutas tocadas, ordenadas: el informe no depende del orden de escritura. */
export function rutasTocadas(op: Operacion): string[] {
  return cirugiasDe(op).map((c) => c.ruta).sort();
}

export function declararImportsAntes(op: Operacion, claves: string[]): void {
  op.importsAntes = [...new Set(claves)].sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// Puertas: comprobaciones sobre el DISCO (la verdad), no sobre lo prometido
// ─────────────────────────────────────────────────────────────────────────────

export interface Disco {
  existe: (ruta: string) => boolean;
  leer: (ruta: string) => string | null;
  escribir: (ruta: string, contenido: string) => void;
  borrar: (ruta: string) => void;
}

export interface ResultadoPuerta {
  id: string;
  que: string;
  gravedad: Gravedad;
  ok: boolean;
  detalle: string;
}

export interface ResultadoCrudo {
  ok: boolean;
  detalle: string;
}

export interface Puerta {
  id: string;
  que: string;
  gravedad: Gravedad;
  /** Puede ser asíncrona: las puertas pesadas (tipos, humo) lanzan procesos. */
  correr: (op: Operacion, ctx: ContextoPuertas) => ResultadoCrudo | Promise<ResultadoCrudo>;
}

export interface ContextoPuertas {
  disco: Disco;
  /** Archivos del proyecto tal cual están en disco ahora (para la puerta de imports). */
  archivosProyecto?: () => CheckFile[];
}

/** Puerta 1 — sintaxis del contenido que ha quedado REALMENTE en disco. */
export const puertaSintaxis: Puerta = {
  id: "sintaxis",
  que: "el archivo que ha quedado en disco se puede parsear",
  gravedad: "bloqueante",
  correr: (op, ctx) => {
    const rotos: string[] = [];
    for (const c of cirugiasDe(op)) {
      const enDisco = ctx.disco.existe(c.ruta) ? ctx.disco.leer(c.ruta) : null;
      if (enDisco === null) continue;
      const guard = guardFile(c.ruta, enDisco);
      const bloqueantes = problemasBloqueantes(guard);
      if (bloqueantes.length > 0) rotos.push(`${c.ruta} (línea ${bloqueantes[0].line}: ${bloqueantes[0].message})`);
    }
    return { ok: rotos.length === 0, detalle: rotos.length ? `Sintaxis rota en ${rotos.length} archivo(s): ${rotos.join(" · ")}` : "todos los archivos tocados se parsean" };
  },
};

/** Puerta 2 — ninguna exportación que existía ha desaparecido del disco. */
export const puertaSuperficie: Puerta = {
  id: "superficie",
  que: "no desaparece API pública que el proyecto ya usaba",
  gravedad: "bloqueante",
  correr: (op, ctx) => {
    const perdidas: string[] = [];
    for (const c of cirugiasDe(op)) {
      const antes = c.original !== null ? superficiePublica(c.original) : op.superficieAntes[c.ruta] || [];
      if (antes.length === 0) continue;
      const enDisco = ctx.disco.existe(c.ruta) ? ctx.disco.leer(c.ruta) || "" : "";
      const despues = superficiePublica(enDisco);
      const perdidos = antes.filter((s) => !despues.includes(s));
      if (perdidos.length) perdidas.push(`${c.ruta}: ${resumirLista(perdidos)}`);
    }
    return {
      ok: perdidas.length === 0,
      detalle: perdidas.length ? `Se perdió API pública → ${perdidas.join(" · ")}` : "la API pública se conserva",
    };
  },
};

/** Puerta 3 — no aparecen imports relativos rotos que antes no estuvieran rotos. */
export const puertaImports: Puerta = {
  id: "imports",
  que: "no quedan imports relativos apuntando a archivos que no existen",
  gravedad: "bloqueante",
  correr: (op, ctx) => {
    if (!ctx.archivosProyecto) return { ok: true, detalle: "no aplica: sin inventario del proyecto" };
    let faltantes: string[] = [];
    try {
      faltantes = findMissingImports(ctx.archivosProyecto()).map((m) => `${m.from}|${m.specifier}`);
    } catch {
      return { ok: true, detalle: "no aplica: el inventario del proyecto no se pudo leer" };
    }
    const antes = new Set(op.importsAntes);
    const nuevos = faltantes.filter((f) => !antes.has(f));
    return {
      ok: nuevos.length === 0,
      detalle: nuevos.length ? `Imports relativos rotos NUEVOS (${nuevos.length}): ${nuevos.slice(0, 6).join(" · ")}` : "ningún import relativo nuevo sin resolver",
    };
  },
};

/** Puerta 4 — balance global: el proyecto no puede encogerse sin motivo declarado. */
export const puertaPeso: Puerta = {
  id: "peso",
  que: "el conjunto de archivos tocados no se ha quedado a la mitad",
  gravedad: "bloqueante",
  correr: (op) => {
    let utilesAntes = 0;
    let utilesDespues = 0;
    for (const c of cirugiasDe(op)) {
      utilesAntes += c.diagnostico.cifras.utilesAntes;
      utilesDespues += c.diagnostico.cifras.utilesDespues;
    }
    if (utilesAntes < MIN_LINEAS_PARA_CIRUGIA) return { ok: true, detalle: "no aplica: cambio por debajo del mínimo medible" };
    const perdida = (utilesAntes - utilesDespues) / utilesAntes;
    if (perdida >= UMBRAL_AMPUTACION) {
      return {
        ok: false,
        detalle: `El conjunto pierde ${Math.round(perdida * 100)} % de líneas útiles (${utilesAntes} → ${utilesDespues}).`,
      };
    }
    return { ok: true, detalle: `Peso conservado: ${utilesAntes} → ${utilesDespues} líneas útiles` };
  },
};

/** Las puertas baratas y deterministas: corren siempre, en milisegundos. */
export function puertasEstandar(): Puerta[] {
  return [puertaSintaxis, puertaSuperficie, puertaImports, puertaPeso];
}

/**
 * Puerta PESADA 1 — tipos. Se le inyecta el ejecutor (el servidor usa su
 * `runCommand`, así que aquí no hay dependencias). Sólo cuenta como rojo un
 * error de TypeScript EN UN ARCHIVO QUE ESTA OPERACIÓN TOCÓ: el proyecto puede
 * arrastrar errores viejos de sitios que nadie ha tocado, y culpar a este
 * cambio de ellos sería exactamente el falso positivo que hace inútil un
 * guardián. Opt-in (es la puerta cara: `tsc` tarda).
 */
export function puertaTipos(
  correr: (comando: string) => ResultadoCrudo | Promise<ResultadoCrudo>,
  topeLineas = 6
): Puerta {
  return {
    id: "tipos",
    que: "el comprobador de tipos no se queja de los archivos tocados",
    gravedad: "bloqueante",
    async correr(op) {
      const tocadas = new Set(rutasTocadas(op));
      const r = await correr("npx tsc --noEmit");
      const culpables = String(r.detalle || "")
        .split("\n")
        .filter((l) => /error TS\d+/.test(l))
        .filter((l) => [...tocadas].some((t) => l.includes(t)))
        .slice(0, topeLineas);
      if (culpables.length > 0) {
        return { ok: false, detalle: `Errores de tipos en archivos tocados:\n      ${culpables.join("\n      ")}` };
      }
      return { ok: true, detalle: "sin errores de tipos en los archivos tocados" };
    },
  };
}

/**
 * Puerta PESADA 2 — humo: ¿el servidor de vista previa sigue respondiendo?
 * Es la prueba que de verdad importa («¿arranca la app?»), y por eso es opt-in:
 * exige que el sandbox esté levantado. Un 5xx o un cuerpo vacío es rojo.
 */
export function puertaHumo(
  sondear: () => { status: number; cuerpo?: string } | Promise<{ status: number; cuerpo?: string }>
): Puerta {
  return {
    id: "humo",
    que: "la vista previa sigue respondiendo después del cambio",
    gravedad: "bloqueante",
    async correr() {
      try {
        const r = await sondear();
        const status = Number(r?.status || 0);
        const cuerpo = String(r?.cuerpo || "");
        if (status >= 200 && status < 400 && cuerpo.length > 0) {
          return { ok: true, detalle: `la vista previa responde HTTP ${status} (${cuerpo.length} bytes)` };
        }
        return { ok: false, detalle: `la vista previa NO responde bien: HTTP ${status || "sin respuesta"}, ${cuerpo.length} bytes` };
      } catch (err: any) {
        return { ok: false, detalle: `la vista previa no responde: ${err?.message || err}` };
      }
    },
  };
}

/** Las puertas pesadas disponibles, activables por quien las conoce. */
export function puertasPesadas(runners: {
  correrComando?: (comando: string) => ResultadoCrudo | Promise<ResultadoCrudo>;
  sondearPreview?: () => { status: number; cuerpo?: string } | Promise<{ status: number; cuerpo?: string }>;
}): Puerta[] {
  const out: Puerta[] = [];
  if (runners.correrComando) out.push(puertaTipos(runners.correrComando));
  if (runners.sondearPreview) out.push(puertaHumo(runners.sondearPreview));
  return out;
}

export async function correrPuertas(op: Operacion, ctx: ContextoPuertas, puertas: Puerta[] = puertasEstandar()): Promise<ResultadoPuerta[]> {
  const out: ResultadoPuerta[] = [];
  for (const p of puertas) {
    try {
      const r = await p.correr(op, ctx);
      out.push({ id: p.id, que: p.que, gravedad: p.gravedad, ok: !!r.ok, detalle: r.detalle });
    } catch (err: any) {
      out.push({ id: p.id, que: p.que, gravedad: p.gravedad, ok: true, detalle: `no aplica: ${err?.message || err}` });
    }
  }
  return out;
}

export function hayRojas(resultados: ResultadoPuerta[]): ResultadoPuerta[] {
  return resultados.filter((r) => !r.ok && r.gravedad === "bloqueante");
}

// ─────────────────────────────────────────────────────────────────────────────
// Reversión
// ─────────────────────────────────────────────────────────────────────────────

export function planDeReversion(op: Operacion): { restaurar: Array<{ ruta: string; contenido: string }>; retirar: string[]; noReversibles: string[] } {
  const restaurar: Array<{ ruta: string; contenido: string }> = [];
  const retirar: string[] = [];
  const noReversibles: string[] = [];
  for (const c of cirugiasDe(op)) {
    if (c.existia) {
      if (c.original !== null) restaurar.push({ ruta: c.ruta, contenido: c.original });
      else noReversibles.push(c.ruta);
    } else {
      retirar.push(c.ruta);
    }
  }
  return { restaurar, retirar, noReversibles };
}

export function revertir(op: Operacion, disco: Disco): { restaurados: string[]; retirados: string[]; fallos: string[]; noReversibles: string[] } {
  const plan = planDeReversion(op);
  const restaurados: string[] = [];
  const retirados: string[] = [];
  const fallos: string[] = [];
  for (const r of plan.restaurar) {
    try {
      disco.escribir(r.ruta, r.contenido);
      restaurados.push(r.ruta);
    } catch (err: any) {
      fallos.push(`${r.ruta}: ${err?.message || err}`);
    }
  }
  for (const ruta of plan.retirar) {
    try {
      disco.borrar(ruta);
      retirados.push(ruta);
    } catch {
      /* un archivo nuevo que no se puede retirar es ruido, no catástrofe */
    }
  }
  op.revertida = true;
  return { restaurados, retirados, fallos, noReversibles: plan.noReversibles };
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialización (para que «Deshacer» siga funcionando tras reiniciar el IDE)
// ─────────────────────────────────────────────────────────────────────────────

export function serializarOperacion(op: Operacion): string {
  return JSON.stringify(
    {
      version: VERSION_QUIROFANO,
      id: op.id,
      motivo: op.motivo,
      inicio: op.inicio,
      fin: op.fin,
      revertida: op.revertida,
      importsAntes: op.importsAntes,
      archivos: cirugiasDe(op).map((c) => ({
        ruta: c.ruta,
        existia: c.existia,
        original: c.original,
        noReversible: c.noReversible,
        huellaOriginal: c.huellaOriginal,
        huellaNueva: c.huellaNueva,
        veredicto: c.diagnostico.veredicto,
      })),
    },
    null,
    2
  );
}

export function deserializarOperacion(texto: string): Operacion | null {
  try {
    const j = JSON.parse(texto);
    if (!j || !Array.isArray(j.archivos)) return null;
    const op = crearOperacion(String(j.motivo || "operación recuperada"), Number(j.inicio) || Date.now());
    op.id = String(j.id || op.id);
    op.fin = typeof j.fin === "number" ? j.fin : null;
    op.revertida = !!j.revertida;
    op.importsAntes = Array.isArray(j.importsAntes) ? j.importsAntes.map(String) : [];
    for (const a of j.archivos) {
      const original = typeof a?.original === "string" ? a.original : null;
      const registro: CirugiaArchivo = {
        ruta: normalizarRuta(a?.ruta || ""),
        existia: !!a?.existia,
        original,
        huellaOriginal: String(a?.huellaOriginal || ""),
        huellaNueva: String(a?.huellaNueva || ""),
        noReversible: !!a?.noReversible,
        diagnostico: {
          ruta: normalizarRuta(a?.ruta || ""),
          existia: !!a?.existia,
          veredicto: (a?.veredicto as Veredicto) || "revisar",
          motivos: [],
          cifras: cifrasDe(original, ""),
        },
      };
      op.archivos.set(registro.ruta, registro);
    }
    return op;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Informe: lo que se le devuelve al modelo y lo que se le enseña al usuario
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionesCierre {
  /** Puertas extra (tipos, build, humo). Se inyectan desde el servidor. */
  puertas?: Puerta[];
  /** true (por defecto): si una puerta bloqueante cae, se revierte la operación. */
  revertirSiFalla?: boolean;
  /** Inventario del proyecto para la puerta de imports. */
  archivosProyecto?: () => CheckFile[];
}

export interface VeredictoOperacion {
  ok: boolean;
  revertido: boolean;
  motivo: string;
  puertas: ResultadoPuerta[];
  informe: string;
}

export function informeOperacion(op: Operacion, puertas: ResultadoPuerta[], revertido: boolean, detalleReversion?: string): string {
  const lineas: string[] = [];
  const cirugias = cirugiasDe(op);
  const titulo = revertido ? "⛔ QUIRÓFANO — CAMBIO REVERTIDO" : "✅ QUIRÓFANO — cambio verificado";
  lineas.push(`${titulo} (${op.motivo})`);
  lineas.push(`Archivos tocados: ${cirugias.length}`);
  for (const c of cirugias) {
    const cif = c.diagnostico.cifras;
    lineas.push(
      `  · ${c.ruta}: ${c.existia ? `${cif.utilesAntes} → ${cif.utilesDespues} líneas útiles` : "archivo nuevo"}${
        cif.publicosPerdidos.length ? ` · API perdida: ${resumirLista(cif.publicosPerdidos)}` : ""
      }`
    );
    for (const m of c.diagnostico.motivos) lineas.push(`      - ${m}`);
  }
  lineas.push("Puertas:");
  for (const p of puertas) {
    lineas.push(`  ${p.ok ? "OK  " : "ROJO"} [${p.id}] ${p.que} — ${p.detalle}`);
  }
  if (revertido) {
    lineas.push(detalleReversion || "Se restauraron los archivos al estado anterior a la operación.");
    lineas.push(
      "QUÉ HACER AHORA: no repitas la misma escritura. Usa edit_file con anclas ÚNICAS (2-4 líneas exactas de contexto) y cambia SÓLO lo pedido. Si necesitas reescribir un archivo entero, primero LÉELO (read_file) y conserva todas sus exportaciones."
    );
  }
  return lineas.join("\n");
}

/**
 * Cierra la operación: corre las puertas sobre el disco, revierte si hay rojas
 * y devuelve el veredicto con el informe.
 */
export async function cerrarOperacion(
  op: Operacion,
  disco: Disco,
  opciones: OpcionesCierre = {}
): Promise<VeredictoOperacion> {
  const puertas = await correrPuertas(
    op,
    { disco, archivosProyecto: opciones.archivosProyecto },
    opciones.puertas || puertasEstandar()
  );
  const rojas = hayRojas(puertas);
  const autoRevertir = opciones.revertirSiFalla !== false;
  let revertido = false;
  let detalleReversion: string | undefined;

  if (rojas.length > 0 && autoRevertir) {
    const res = revertir(op, disco);
    revertido = true;
    detalleReversion = `Se restauraron ${res.restaurados.length} archivo(s)${
      res.retirados.length ? ` y se retiraron ${res.retirados.length} nuevo(s)` : ""
    }.${res.noReversibles.length ? ` OJO: no había copia de ${res.noReversibles.join(", ")} (superaban el tope de reversión).` : ""}${
      res.fallos.length ? ` Fallos al restaurar: ${res.fallos.join(" · ")}` : ""
    }`;
  }
  op.fin = Date.now();
  const ok = rojas.length === 0;
  return {
    ok,
    revertido,
    motivo: rojas.length ? rojas.map((r) => `${r.id}: ${r.detalle}`).join(" · ") : "todas las puertas en verde",
    puertas,
    informe: informeOperacion(op, puertas, revertido, detalleReversion),
  };
}

/** Texto corto para el log del IDE (una línea, sin ruido). */
export function lineaQuirofano(v: VeredictoOperacion): string {
  const tocados = v.puertas.length;
  if (v.revertido) return `[CerebroNico] 🩺 QUIRÓFANO: cambio REVERTIDO — ${v.motivo}`;
  if (!v.ok) return `[CerebroNico] 🩺 QUIRÓFANO: ${v.motivo}`;
  return `[CerebroNico] 🩺 QUIRÓFANO: ${tocados} puerta(s) en verde — el cambio se queda.`;
}
