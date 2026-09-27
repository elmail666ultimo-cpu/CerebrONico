/**
 * dependenciasProyecto.ts — ¿QUÉ PAQUETES IMPORTA EL PROYECTO Y NO ESTÁN?
 * =====================================================================
 * 🐞 EL FALLO: el sandbox arranca y el preview queda muerto con un aviso de
 * Vite en pantalla:
 *
 *     [plugin:vite:import-analysis] Failed to resolve import "jspdf" from
 *     "src/services/pdfReportService.ts". Does the file exist?
 *
 * El código generado importaba `jspdf` y `jspdf-autotable`; el `package.json`
 * del proyecto no los declaraba y nadie los instaló. `importChecker` no podía
 * salvarlo porque **solo mira imports relativos** (`./algo`, `../otro`), y con
 * razón: a un paquete no se le pone un stub. Y la auto-reparación del sandbox
 * tampoco, porque solo se dispara **cuando el proceso muere** — y aquí el
 * proceso Vite sigue VIVO, contestando el puerto con el aviso dentro. El
 * sandbox se da por «online» y el usuario ve una pantalla de error.
 *
 * La comprobación tiene que ser PREVIA y explícita: leer los imports del
 * proyecto, quedarse con los paquetes externos, quitar los que ya están
 * declarados o instalados, e instalar solo lo que falta.
 *
 * Nota de alcance: esto NO sustituye a `npm install` (que resuelve el árbol
 * completo y las versiones). Es para el caso concreto en que el código importa
 * algo que nadie declaró.
 */

import type { CheckFile } from "./importChecker";

/* ============================================================
   CATÁLOGO DE MÓDULOS INTERNOS DE NODE
   ============================================================ */

/**
 * Nombres internos de Node: no se instalan con npm.
 * Sin esta lista, `import fs from "fs"` se leería como «falta el paquete fs» y
 * el arranque intentaría instalar la nada.
 */
const INTERNOS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console", "constants",
  "crypto", "dgram", "diagnostics_channel", "dns", "domain", "events", "fs", "http",
  "http2", "https", "inspector", "module", "net", "os", "path", "perf_hooks", "process",
  "punycode", "querystring", "readline", "repl", "stream", "string_decoder", "sys",
  "timers", "tls", "trace_events", "tty", "url", "util", "v8", "vm", "wasi",
  "worker_threads", "zlib",
]);

/** Prefijos que NO son paquetes: rutas, URLs y protocolos del navegador. */
function esNoInstalable(specifier: string): boolean {
  const s = specifier.trim();
  if (s === "") return true;
  if (s.startsWith(".") || s.startsWith("/")) return true;          // ruta relativa o absoluta
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return true;            // http:, data:, node:, file:
  if (s.startsWith("node:")) return true;
  if (INTERNOS.has(s.split("/")[0])) return true;                   // fs, path, crypto…
  if (/^\$|^~/.test(s)) return true;                                // $lib de SvelteKit, ~ de otros
  return false;
}

/**
 * De un especificador a un NOMBRE DE PAQUETE instalable.
 *   `react-dom/client`      → `react-dom`
 *   `@scope/pkg/sub/ruta`   → `@scope/pkg`
 *   `jspdf`                 → `jspdf`
 */
export function nombreDePaquete(specifier: string): string | null {
  if (esNoInstalable(specifier)) return null;
  const partes = specifier.split("/");
  if (specifier.startsWith("@")) {
    return partes.length >= 2 ? `${partes[0]}/${partes[1]}` : null; // un @suelto no es un paquete
  }
  return partes[0] || null;
}

/* ============================================================
   EXTRACCIÓN (pura)
   ============================================================ */

/**
 * Paquetes externos que importan los archivos del proyecto.
 * Cubre las cinco formas reales: `import X from "s"`, `import {a} from "s"`,
 * `import "s"` (efecto secundario), `import("s")` (dinámico) y `require("s")`.
 */
export function extraerPaquetesExternos(ficheros: CheckFile[]): string[] {
  const encontrados = new Set<string>();

  for (const f of ficheros) {
    const contenido = f.content ?? "";
    const patrones = [
      /\bfrom\s+["']([^"']+)["']/g,   // import X from "s" / export {a} from "s"
      /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, // import("s")
      /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, // require("s")
      /^\s*import\s+["']([^"']+)["']/gm, // import "s"
    ];
    for (const re of patrones) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(contenido)) !== null) {
        const paquete = nombreDePaquete(m[1]);
        if (paquete) encontrados.add(paquete);
      }
    }
  }

  return [...encontrados].sort();
}

/** Versión que incluye el archivo de origen (para poder decir DÓNDE se importa). */
export function extraerPaquetesConOrigen(ficheros: CheckFile[]): Array<{ paquete: string; desde: string }> {
  const porPaquete = new Map<string, string>();
  for (const paquete of extraerPaquetesExternos(ficheros)) {
    // El nombre va escapado: un paquete puede llevar `.` o `+` (p. ej.
    // `jspdf-autotable` no, pero `@scope/a.b` sí) y sin escapar el `+` sería un
    // cuantificador de regex y el `.` cualquier carácter.
    const escapado = paquete.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const buscador = new RegExp(`["']${escapado}(/[^"']*)?["']`);
    const origen = ficheros.find((f) => buscador.test(f.content ?? ""));
    porPaquete.set(paquete, origen?.path ?? "?");
  }
  return [...porPaquete].map(([paquete, desde]) => ({ paquete, desde }));
}

/* ============================================================
   COMPARACIÓN (pura, con el disco inyectado)
   ============================================================ */

export interface EntornoProyecto {
  /** Nombres declarados en package.json (dependencies + devDependencies). */
  declarados: string[];
  /** ¿Existe ya la carpeta del paquete en node_modules? */
  estaInstalado: (paquete: string) => boolean;
}

/**
 * Paquetes que el código importa y que NADIE declaró.
 *
 * Es el conjunto que hay que añadir al `package.json`, y por eso la condición
 * es `!declarado && !instalado`, no simplemente `!instalado`:
 *
 *   · NO declarado  → este chequeo lo añade con `npm install --save`. Es el
 *                     caso de `jspdf`: el código lo importa y el proyecto no lo
 *                     conocía.
 *   · declarado y no instalado → NO se toca aquí. La solución es el `npm
 *                     install` normal, y volver a instalarlo con `--save`
 *                     reescribiría la versión que la plantilla dejó fijada.
 *                     Eso se informa aparte (ver `declaradosSinInstalar`).
 *   · instalado sin declarar → dependencia transitiva. No se toca.
 *
 * (Mi primer comentario decía que un declarado-sin-instalar también entraba
 * aquí. El test lo desmintió: el código hacía lo contrario. Manda el código.)
 */
export function paquetesFaltantes(ficheros: CheckFile[], entorno: EntornoProyecto): string[] {
  const declarados = new Set(entorno.declarados);
  return extraerPaquetesExternos(ficheros).filter(
    (p) => !declarados.has(p) && !entorno.estaInstalado(p)
  );
}

/**
 * Paquetes DECLARADOS en `package.json` pero que no están en `node_modules`.
 * No se instalan aquí: se informan, porque el remedio es un `npm install`
 * normal y hacerlo con `--save` cambiaría la versión fijada.
 */
export function declaradosSinInstalar(ficheros: CheckFile[], entorno: EntornoProyecto): string[] {
  const declarados = new Set(entorno.declarados);
  return extraerPaquetesExternos(ficheros).filter(
    (p) => declarados.has(p) && !entorno.estaInstalado(p)
  );
}

/** El comando exacto que se ejecutaría. Separado para poder comprobarlo. */
export function comandoInstalacion(faltantes: string[]): string | null {
  if (faltantes.length === 0) return null;
  // `--save` explícito: los paquetes entran en package.json, así que la próxima
  // vez el proyecto ya los declara y este chequeo no vuelve a dispararse.
  return `npm install --save --no-audit --no-fund ${faltantes.join(" ")}`;
}

/** Lo que se le enseña al usuario, en una línea. */
export function describirFaltantes(faltantes: string[]): string {
  if (faltantes.length === 0) return "";
  const muestra = faltantes.slice(0, 6).join(", ");
  const resto = faltantes.length > 6 ? ` y ${faltantes.length - 6} más` : "";
  return `${faltantes.length} paquete(s) que el código importa y no están instalados: ${muestra}${resto}`;
}

/* ============================================================
   v1.6.24 — AUDITORÍA DE INTEGRIDAD DE `node_modules`
   ============================================================
   🐞 EL FALLO (reportado como «NO FUNCIONA EL SANDBOX»):

       Cannot find module '…/vite/dist/node/chunks/dist.js'

   La cadena completa cuenta la historia: el ejecutor ENCONTRÓ `vite` —su
   package.json se lee, su bin existe— pero al importar el paquete, un archivo
   INTERNO del paquete ya no está en el disco. Eso no es «falta la carpeta»;
   es una instalación A MEDIAS: un `npm install` cortado por timeout, un ZIP
   importado que traía un `node_modules` podado por el empaquetador, o una
   carpeta fantasma que quedó de una limpieza.

   El código anterior decidía «¿está instalado?» con `fs.existsSync(node_modules/
   vite)`: la mera EXISTENCIA de la carpeta. Con una instalación podada la
   carpeta existe → se declaraba «ya instalado» → la vía elegida era `npm-dev`
   con `requiereInstalar: false` → Vite arrancaba, tropezaba con su propio
   archivo faltante y moría. Y la auto-reparación estaba desactivada por
   defecto, así que el usuario se quedaba con el aviso y sin sandbox.

   EL REMEDIO: auditar de verdad. Un paquete declarado está SANO cuando su
   carpeta existe, su `package.json` existe y se parsea, y el archivo de
   entrada que ÉL MISMO declara (`main`, `exports["."]` o el primer `bin`)
   está presente en el disco. Si la entrada no es deducible (formas exóticas
   de `exports`), se conserva el beneficio de la duda: `ok`. Un falso positivo
   costaría un `npm install` redundante —inofensivo—; un falso negativo era lo
   que rompía el sandbox.

   Como todo en este módulo, la auditoría es PURA: el disco entra por
   parámetro, así que se prueba sin montar un `node_modules` de verdad.
   ============================================================ */

export type SaludPaquete = "ok" | "roto" | "ausente";

export interface DiscoDeAuditoria {
  /** ¿Existe la ruta (archivo o carpeta)? */
  existe: (ruta: string) => boolean;
  /** Contenido UTF-8 del archivo, o null si no se puede leer. */
  leer: (ruta: string) => string | null;
  /** Une partes de ruta con el separador del sistema. */
  unir: (...partes: string[]) => string;
}

/**
 * Estado de un paquete dentro de `node_modules`, verificado HASTA EL ARCHIVO
 * DE ENTRADA. `dirPaquete` es la carpeta ya resuelta del paquete.
 */
export function saludDePaquete(dirPaquete: string, disco: DiscoDeAuditoria): SaludPaquete {
  if (!disco.existe(dirPaquete)) return "ausente";
  const texto = disco.leer(disco.unir(dirPaquete, "package.json"));
  if (texto === null) return "roto"; // carpeta sin manifiesto: resto de una instalación cortada
  let pkg: any;
  try {
    pkg = JSON.parse(texto);
  } catch {
    return "roto"; // manifiesto ilegible o truncado a media escritura
  }

  // Candidatos de entrada, en el orden en que Node los usaría:
  // main → exports["."] (string, o su rama import/require/default) → primer bin.
  const relativo = (v: unknown): string | null => {
    if (typeof v === "string" && v.startsWith("./")) return v.slice(2);
    return null;
  };
  let entrada: string | null = relativo(pkg?.main);
  if (!entrada) entrada = relativo(pkg?.exports);
  if (!entrada && pkg?.exports && typeof pkg.exports === "object") {
    const punto = pkg.exports["."];
    if (typeof punto === "string") entrada = relativo(punto);
    else if (punto && typeof punto === "object") {
      entrada = relativo(punto.import) || relativo(punto.require) || relativo(punto.default);
    }
  }
  if (!entrada && pkg?.bin) {
    if (typeof pkg.bin === "string") entrada = relativo("./" + pkg.bin.replace(/^\.?\//, ""));
    else if (typeof pkg.bin === "object") {
      const primero = Object.values(pkg.bin)[0];
      if (typeof primero === "string") entrada = relativo("./" + primero.replace(/^\.?\//, ""));
    }
  }

  if (!entrada) return "ok"; // sin entrada deducible: no acusar a ciegas
  return disco.existe(disco.unir(dirPaquete, entrada)) ? "ok" : "roto";
}

export interface AuditoriaInstalacion {
  /** Declarados cuya carpeta ni siquiera existe. */
  ausentes: string[];
  /** Declarados con carpeta presente pero instalación podada/trunca. */
  rotos: string[];
}

/**
 * Audita los paquetes DECLARADOS en el package.json del proyecto contra el
 * `node_modules` de su propia carpeta. `raizProyecto` es la raíz del proyecto
 * (donde vive su package.json), NO la de la IDE: cada proyecto se aísla.
 */
export function auditarInstalacion(
  raizProyecto: string,
  declarados: string[],
  disco: DiscoDeAuditoria
): AuditoriaInstalacion {
  const nm = disco.unir(raizProyecto, "node_modules");
  const ausentes: string[] = [];
  const rotos: string[] = [];
  for (const p of declarados) {
    // `@scope/pkg` vive en dos niveles: se parte por "/" (igual que el chequeo viejo).
    const dir = disco.unir(nm, ...p.split("/"));
    const s = saludDePaquete(dir, disco);
    if (s === "ausente") ausentes.push(p);
    else if (s === "roto") rotos.push(p);
  }
  return { ausentes, rotos };
}

/** true si la auditoría no encontró ni ausentes ni rotos. */
export function instalacionSana(a: AuditoriaInstalacion): boolean {
  return a.ausentes.length === 0 && a.rotos.length === 0;
}
