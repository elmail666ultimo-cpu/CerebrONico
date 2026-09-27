/**
 * raizDatos.ts — DÓNDE VIVE TODO
 * ==============================
 * v1.6.10 — «que el agente 5000 guarde todo en el disco C:»
 *
 * El gancho ya existía: el motor resuelve su raíz de trabajo así —
 *
 *     PROJECT_ROOT = process.env.PROJECT_DIR || <cwd>/.proyectos
 *
 * — y la versión .exe ya lo aprovecha (Electron lo apunta al userData de
 * Windows). Lo que NO estaba hecho son las dos cosas que hacen que el pedido se
 * cumpla de verdad:
 *
 *  1. EL PUENTE. `agent_bridge_5000.py` escribía ".proyectos" a mano colgado de
 *     su directorio de trabajo y no leía PROJECT_DIR. Con eso, apuntar el motor
 *     a C: no unificaba nada: lo PARTÍA. El motor se mudaba y el puente se
 *     quedaba atrás, con dos sandboxes distintos y la apariencia de estar bien.
 *
 *  2. LA MIGRACIÓN. Bajo la raíz vieja vive lo que no se regenera: la bóveda de
 *     claves, la salud de los espejos, el conocimiento y los proyectos. Cambiar
 *     la raíz sin copiarlos no los mueve: el IDE arranca en C: vacío y las
 *     claves desaparecen.
 *
 * Este módulo es PURO: decide, no toca disco. Quien copia es el servidor, y
 * copia — nunca mueve ni borra.
 */

/** Lo que hay que llevarse a la raíz nueva. Todo lo demás son proyectos. */
export const CARPETAS_DE_ESTADO = [".cerebro-db", ".cerebronico"] as const;

export interface RaizResuelta {
  raiz: string;
  origen: "PROJECT_DIR" | "por-defecto";
}

/** Une dos tramos respetando el separador de la base, sin depender de node:path. */
function unir(base: string, resto: string): string {
  const limpio = base.replace(/[\\/]+$/, "");
  const sep = limpio.includes("\\") && !limpio.includes("/") ? "\\" : "/";
  return `${limpio}${sep}${resto}`;
}

/**
 * Quita separadores finales. Con un cuidado: `C:\` no puede quedarse en `C:`,
 * porque eso ya no es la raíz de la unidad sino «el directorio actual de C:».
 */
function sinSeparadorFinal(ruta: string): string {
  const limpia = (ruta ?? "").replace(/[\\/]+$/, "");
  return /^[A-Za-z]:$/.test(limpia) ? `${limpia}\\` : limpia;
}

/** Quita separadores finales y unifica para poder comparar dos rutas. */
function normalizar(ruta: string): string {
  const limpia = sinSeparadorFinal((ruta ?? "").trim());
  return limpia === "" ? "" : limpia.replace(/\\/g, "/");
}

/**
 * Resuelve la raíz de datos. `PROJECT_DIR` manda; si no está, se cae a
 * `<cwd>/.proyectos`, que es el comportamiento de siempre.
 *
 * Un `PROJECT_DIR` en blanco o con solo espacios NO cuenta: es la forma más
 * habitual de romper un lanzador (`set PROJECT_DIR=` deja la variable definida y
 * vacía) y no debe mandar la raíz a la cadena vacía.
 */
export function resolverRaizDatos(
  entorno: Record<string, string | undefined>,
  cwd: string
): RaizResuelta {
  const bruta = (entorno?.PROJECT_DIR ?? "").trim();
  if (bruta !== "") return { raiz: sinSeparadorFinal(bruta), origen: "PROJECT_DIR" };
  return { raiz: unir(cwd, ".proyectos"), origen: "por-defecto" };
}

/** ¿Las dos rutas apuntan al mismo sitio? Windows no distingue mayúsculas. */
export function mismaRaiz(a: string, b: string): boolean {
  const x = normalizar(a);
  const y = normalizar(b);
  if (x === "" || y === "") return x === y;
  return x.toLowerCase() === y.toLowerCase();
}

export interface EntradaMigracion {
  raizDestino: string;
  raizOrigen: string;
  /** ¿La raíz nueva ya tiene estado propio? */
  destinoTieneEstado: boolean;
  /** ¿La raíz vieja tiene algo que llevarse? */
  origenTieneEstado: boolean;
}

export interface DecisionMigracion {
  migrar: boolean;
  motivo: string;
}

/**
 * Decide si hay que copiar el estado de la raíz vieja a la nueva. Las cuatro
 * reglas, en orden, y las tres primeras son todas «no toques nada»:
 *
 *   1. misma raíz          → no hay mudanza
 *   2. origen sin estado   → no hay nada que llevar
 *   3. destino CON estado  → NO SE TOCA. Es la regla que protege la bóveda.
 *   4. destino vacío       → copiar
 */
export function decidirMigracion(e: EntradaMigracion): DecisionMigracion {
  if (mismaRaiz(e.raizDestino, e.raizOrigen)) {
    return { migrar: false, motivo: "la raíz no ha cambiado" };
  }
  if (!e.origenTieneEstado) {
    return { migrar: false, motivo: "la raíz anterior no tiene estado que llevarse" };
  }
  if (e.destinoTieneEstado) {
    return {
      migrar: false,
      motivo:
        "la raíz nueva YA tiene datos propios: no se toca nada (pisar la bóveda " +
        "de claves sería peor que no migrar)",
    };
  }
  return {
    migrar: true,
    motivo: "la raíz nueva está vacía: se copia el estado de la anterior",
  };
}

/** Texto que va al registro. Dice qué se copia y de dónde a dónde. */
export function mensajeMigracion(
  origen: string,
  destino: string,
  carpetas: readonly string[] = CARPETAS_DE_ESTADO
): string {
  return (
    `Raíz de datos mudada: copiando ${carpetas.join(", ")} de «${origen}» a «${destino}». ` +
    "El original NO se toca: si algo va mal puedes volver atrás borrando la carpeta nueva."
  );
}

// ============================================================
// GUARDA-RAÍZ v1 (v1.6.23) — la raíz de datos NUNCA puede ser la
// carpeta de la propia app ni una ancestrora suya.
// ------------------------------------------------------------
// El incidente que motiva esta guarda: PROJECT_DIR apuntó a
// C:\Cerebronico (la instalación). Con esa raíz, el resolutor de
// proyectos bajó dos niveles, encontró `ide\backend` (la IDE viva) y
// el piloto se puso a instalarla y compilarla como si fuera la app
// del sandbox — rollup `ModuleScope.findVariable`, :3500 muerto y
// «La IDE no pudo compilarse dentro del sandbox» repetido tres veces.
// Una raíz que contiene a la app no es configuración válida en ningún
// escenario: siempre termina encontrando la IDE como «proyecto».
// ============================================================

/** true si `a` es igual a `b` o es uno de sus ancestros (comparación normalizada, pura). */
export function esAncestroOEquivale(a: string, b: string): boolean {
  const x = normalizar(a);
  const y = normalizar(b);
  if (x === "" || y === "") return false;
  const xa = x.toLowerCase(), ya = y.toLowerCase();
  return xa === ya || ya.startsWith(xa + "/");
}

/**
 * Decide la raíz de datos a usar. Si la raíz pedida contiene a la app
 * (es su ancestro o ella misma), se RECHAZA y se devuelve la por defecto
 * con el motivo literal para el log. Con el default (cwd/.proyectos) la
 * guarda nunca molesta: el default no es ancestro de la app.
 */
export function rechazarRaizAncestroApp(
  raiz: string,
  cwd: string,
  raizPorDefecto: string
): { raiz: string; rechazada: boolean; motivo: string } {
  if (esAncestroOEquivale(raiz, cwd)) {
    return {
      raiz: raizPorDefecto,
      rechazada: true,
      motivo:
        `la raíz de datos «${raiz}» contiene a la propia app (cwd «${cwd}»): ` +
        `el resolutor encontraría la IDE como «proyecto del sandbox». Se usa la por defecto «${raizPorDefecto}».`,
    };
  }
  return { raiz, rechazada: false, motivo: "" };
}
