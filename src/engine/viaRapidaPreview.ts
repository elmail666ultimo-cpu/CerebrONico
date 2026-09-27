/**
 * viaRapidaPreview.ts — LA VÍA BARATA PARA PREVISUALIZAR
 * =====================================================
 * 🐞 EL PROBLEMA: previsualizar costaba un `npm install && npm run dev` del
 * proyecto, con su árbol de dependencias entero, su servidor de desarrollo y su
 * instalación de decenas de segundos. Y cuando faltaba UN paquete (el `jspdf` de
 * siempre) el preview quedaba muerto con un aviso de Vite dentro.
 *
 * La condición que había en el servidor era:
 *
 *     if (!hasPkgJson && hasIndexHtml) { servir estático }
 *
 * O sea: en cuanto el proyecto tenía `package.json`, daba igual que fuera una
 * página con cuatro módulos — se iba por la vía cara.
 *
 * LA VÍA BARATA: compilar una vez con el esbuild que YA trae la IDE y servir el
 * resultado con el servidor estático que YA existe. Sin instalar nada del
 * proyecto, sin servidor de desarrollo, sin watchers. Y funciona porque el
 * proyecto vive DENTRO de `ide/backend/`: la resolución de Node sube por el
 * árbol y encuentra el `node_modules` de la propia IDE, así que `react`,
 * `react-dom` o `lucide-react` se resuelven solos.
 *
 * Cuándo NO se usa la vía rápida, y por qué (esto es lo importante):
 *   · Marcos que necesitan su propio servidor (Next, Nuxt, Astro, SvelteKit):
 *     pre-bundlarlos «a mano» no reproduce su comportamiento, y dar un preview
 *     que miente es peor que tardar.
 *   · Proyecto CON su propia configuración Y ya instalado: ahí `npm run dev` ya
 *     funciona y respeta alias, variables de entorno y plugins. No se toca lo
 *     que funciona.
 */

/* ============================================================
   TIPOS
   ============================================================ */

export type ViaPreview = "estatico-directo" | "estatico-compilado" | "npm-dev";

export interface EntradaPreview {
  /** ¿Hay un index.html que sirva de entrada? */
  tieneIndexHtml: boolean;
  /** ¿Hay package.json? */
  tienePackageJson: boolean;
  /** Rutas relativas de fuentes que hay que transpilar (.ts/.tsx/.jsx/.mjs). */
  fuentes: string[];
  /** ¿Existe ya node_modules en el proyecto? */
  tieneNodeModules: boolean;
  /**
   * v1.6.24 — ¿Pasó la auditoría de integridad? `false` significa que la
   * carpeta existe pero está PODADA (paquetes declarados ausentes o con su
   * archivo de entrada faltante). `undefined` se trata como sano, para no
   * romper a las llamadas que aún no la calculan.
   */
  nodeModulesSano?: boolean;
  /** ¿Trae configuración propia (vite.config, next.config, tsconfig con paths…)? */
  tieneConfigPropia: boolean;
  /** ¿Es un marco que necesita su propio servidor? */
  frameworkConServidor: boolean;
}

export interface DecisionPreview {
  via: ViaPreview;
  motivo: string;
  /** Lo que el usuario quería saber: cuánto trabajo cuesta previsualizar. */
  requiereInstalar: boolean;
  requiereCompilar: boolean;
}

/* ============================================================
   DECISIÓN (pura)
   ============================================================ */

export function elegirViaPreview(e: EntradaPreview): DecisionPreview {
  const sinTrabajo = { requiereInstalar: false, requiereCompilar: false };

  if (!e.tieneIndexHtml) {
    return {
      via: "npm-dev",
      motivo: e.tienePackageJson
        ? "No hay index.html: el proyecto tiene que arrancar su propio servidor."
        : "No hay index.html ni package.json: no hay nada que previsualizar.",
      requiereInstalar: e.tienePackageJson,
      requiereCompilar: false,
    };
  }

  if (e.frameworkConServidor) {
    return {
      via: "npm-dev",
      motivo: "Es un marco con servidor propio (Next/Nuxt/Astro/SvelteKit): su preview se genera con su herramienta, no compilando a mano.",
      requiereInstalar: !e.tieneNodeModules || e.nodeModulesSano === false,
      requiereCompilar: false,
    };
  }

  // v1.6.24 — «ya está instalado» dejó de significar «existe la carpeta».
  // Un node_modules podado (ZIP sin dependencias, npm install cortado a
  // medias) existe en el disco pero NO puede servir su `dev`: arrancaría el
  // bin de Vite y moriría con «Cannot find module …/vite/dist/node/…».
  // Con configuración propia no se puede improvisar el bundle de la vía
  // barata —alias, plugins y env del config se perderían—, así que la vía
  // sigue siendo npm-dev, pero DECLARANDO que hay que instalar antes.
  if (e.tieneConfigPropia && e.tieneNodeModules) {
    if (e.nodeModulesSano === false) {
      return {
        via: "npm-dev",
        motivo:
          "El proyecto trae configuración propia y una carpeta node_modules, pero la auditoría encontró paquetes declarados rotos o ausentes: se reinstala antes de respetar su `dev`.",
        requiereInstalar: true,
        requiereCompilar: false,
      };
    }
    return {
      via: "npm-dev",
      motivo: "El proyecto trae su propia configuración y ya está instalado: se respeta su `dev` en vez de improvisar un bundle que ignoraría alias y plugins.",
      requiereInstalar: false,
      requiereCompilar: false,
    };
  }

  // A partir de aquí: hay HTML y no hay nada que respetar. La vía barata.
  if (e.fuentes.length === 0) {
    return {
      via: "estatico-directo",
      motivo: "HTML+CSS+JS sin transpilar: se sirve tal cual con el servidor estático. Cero instalación, cero compilación.",
      ...sinTrabajo,
    };
  }

  return {
    via: "estatico-compilado",
    motivo:
      `Hay ${e.fuentes.length} fuente(s) que transpilar y el proyecto no está preparado: ` +
      "se compila UNA vez con el esbuild de la IDE y se sirve el resultado. Sin instalar nada del proyecto.",
    requiereInstalar: false,
    requiereCompilar: true,
  };
}

/* ============================================================
   DETECCIÓN DE MARCOS Y FUENTES (puras)
   ============================================================ */

const MARCOS_CON_SERVIDOR = ["next", "nuxt", "astro", "@sveltejs/kit", "@remix-run/dev", "gatsby", "vite-plugin-ssr", "@docusaurus/core", "solid-start"];

/** ¿El package.json declara un marco que necesita su propio servidor? */
export function esFrameworkConServidor(dependencias: string[]): boolean {
  return dependencias.some((d) => MARCOS_CON_SERVIDOR.includes(d));
}

/** ¿El proyecto trae configuración propia que la vía rápida ignoraría? */
export function tieneConfigPropia(ficheros: string[]): boolean {
  return ficheros.some((f) => /(^|\/)(vite|webpack|rollup|next|nuxt|astro|svelte)\.config\.[cm]?[jt]s$/.test(f));
}

/** Fuentes que hay que pasar por el transpilador. */
export function fuentesATranspilar(ficheros: string[]): string[] {
  return ficheros.filter((f) => /\.(ts|tsx|jsx|mjs)$/.test(f)).filter((f) => !/\.d\.ts$/.test(f));
}

/** El `script type="module"` de entrada, si lo hay. */
export function entradaDeHtml(html: string): string | null {
  const m = html.match(/<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i);
  if (m) return m[1];
  const m2 = html.match(/<script[^>]*src=["']([^"']+\.(?:tsx?|jsx?|mjs))["']/i);
  return m2 ? m2[1] : null;
}

/* ============================================================
   EL BUNDLE Y LA REESCRITURA DEL HTML
   ============================================================ */

export const NOMBRE_BUNDLE = "cn-preview.js";

/**
 * El comando de compilación.
 *
 * `--packages=external`: NO intenta meter las dependencias dentro del bundle.
 * Deja los `import "react"` tal cual, y el navegador los resuelve por el
 * `node_modules` que la IDE sirve en la raíz del proyecto — que existe porque el
 * proyecto vive dentro de `ide/backend/`. Es lo que permite previsualizar un
 * React sin instalar React en el proyecto.
 */
export function comandoBundle(entrada: string, salida: string): string {
  return [
    "npx --no-install esbuild",
    JSON.stringify(entrada),
    "--bundle",
    `--outfile=${JSON.stringify(salida)}`,
    "--format=esm",
    "--platform=browser",
    "--jsx=automatic",
    "--loader:.js=jsx",
    "--sourcemap",
    "--log-level=warning",
    // v1.6.25-SANDBOXFIX3 — SIN `--packages=external`: las dependencias ENTRAN en el bundle.
  ].join(" ");
}

/* ============================================================
   v1.6.25-SANDBOXFIX3 — ¿EL BUNDLE ES EJECUTABLE EN UN NAVEGADOR?
   ============================================================
   Un `import "react"` desnudo no se resuelve en el navegador: no consulta
   node_modules ni sube por el árbol de directorios. El servidor lo sirve con
   HTTP 200, la consola del iframe escupe «Failed to resolve module specifier» y
   la aplicación no monta → PANTALLA EN BLANCO con el puerto respondiendo.
   Se comprueba solo al principio de línea (donde esbuild escribe los imports)
   para no confundir el mismo texto dentro de una cadena o un comentario.
   ============================================================ */

export function importacionesDesnudas(codigo: string): string[] {
  const encontrados = new Set<string>();
  const patrones = [
    /^\s*(?:import|export)[^\n]*?from\s*["']([^"']+)["']/gm,
    /^\s*import\s*["']([^"']+)["']/gm,
    /^\s*import\s*\(\s*["']([^"']+)["']\s*\)/gm,
  ];
  for (const re of patrones) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(codigo)) !== null) {
      const especificador = m[1] || "";
      if (esEspecificadorDesnudo(especificador)) encontrados.add(especificador);
    }
  }
  return [...encontrados].sort();
}

/** Un especificador es «desnudo» si no es ruta relativa/absoluta ni URL. */
function esEspecificadorDesnudo(especificador: string): boolean {
  const s = especificador.trim();
  if (s === "") return false;
  if (s.startsWith("./") || s.startsWith("../") || s.startsWith("/")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return false; // http:, data:, node:
  return true;
}

/**
 * Reescribe el HTML para que cargue el bundle en vez de las fuentes.
 * Idempotente: si ya está reescrito (o ya apunta al bundle), no hace nada.
 * Devuelve `null` si no hubo ningún cambio, para poder distinguirlo.
 */
export function reescribirHtmlParaBundle(html: string, bundle = `./${NOMBRE_BUNDLE}`): string | null {
  if (html.includes(NOMBRE_BUNDLE)) return null; // ya reescrito

  const entrada = entradaDeHtml(html);
  if (entrada) {
    const reemplazo = `<script type="module" src="${bundle}"></script>`;
    const nuevo = html.replace(/<script[^>]*type=["']module["'][^>]*src=["'][^"']+["'][^>]*><\/script>/i, reemplazo);
    if (nuevo !== html) return nuevo;
    // El script de entrada puede venir sin `type="module"`.
    return html.replace(/<script[^>]*src=["'][^"']+\.(?:tsx?|jsx?|mjs)["'][^>]*><\/script>/i, reemplazo);
  }

  // Sin script de entrada: se inyecta antes de cerrar el body.
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `  <script type="module" src="${bundle}"></script>\n</body>`);
  }
  return html + `\n<script type="module" src="${bundle}"></script>\n`;
}

/** Dónde se guarda el original antes de reescribir, para no perder nada. */
export const NOMBRE_RESPALDO = ".cn-preview/index.html.orig";
