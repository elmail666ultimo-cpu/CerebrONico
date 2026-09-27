/**
 * proyectoFuncional.ts — QUE LA APP SE PUEDA VER, SIEMPRE QUE HAYA UNA WEB
 * =======================================================================
 * v1.6.12 — «lo único que quiero es que sea funcional».
 *
 * Dos defectos que hacían que un proyecto real NO se previsualizara, y ninguno
 * era culpa del modelo:
 *
 * 🐞 1. UN MARCADOR SUELTO MATA EL PREVIEW.
 * Los marcadores pesan: `package.json` 100, `requirements.txt` 90, `index.html`
 * 60. Con `requirements.txt` e `index.html` en la misma carpeta gana Python, que
 * no tiene previsualizador — y la respuesta era «No se pudo arrancar». El
 * usuario veía su web ahí, y el sandbox se negaba a mostrarla por un archivo que
 * ni era suyo. La regla que faltaba: SI HAY EVIDENCIA WEB, HAY PREVIEW.
 *
 * 🐞 2. SI EL MODELO OLVIDA EL `package.json`, NADIE LO ECHA DE MENOS.
 * Un proyecto con fuentes web y sin `package.json` no es un proyecto: es una
 * carpeta. La garantía no puede depender de que el modelo se acuerde — eso es
 * pedirle a una promesa que sea un invariante. Aquí se calcula el esqueleto
 * mínimo que falta y se genera: `package.json` con sus guiones y sus
 * dependencias REALES (las que el código importa), y un `index.html` si no hay
 * ninguno que cargue la entrada.
 *
 * Módulo PURO: decide y construye texto. Quien escribe en disco es el servidor.
 */

/** Extensiones que delatan una web. */
const FUENTES_WEB = [".html", ".htm", ".tsx", ".jsx", ".ts", ".js", ".mjs", ".css", ".vue", ".svelte"];

/** Marcadores que NO son del proyecto sino del entorno: no deben decidir el tipo. */
const MARCADORES_AJENOS = ["requirements.txt", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"];

export interface EvidenciaWeb {
  hay: boolean;
  tieneHtml: boolean;
  tieneFuentes: boolean;
  /** Ruta del HTML de entrada si se puede deducir. */
  entrada: string | null;
}

/** ¿Qué evidencia web hay en esta carpeta? */
export function hayEvidenciaWeb(ficheros: readonly string[]): EvidenciaWeb {
  const nombres = (ficheros ?? []).map((f) => String(f).replace(/\\/g, "/").toLowerCase());

  const htmls = nombres.filter((f) => f.endsWith(".html") || f.endsWith(".htm"));
  // El de la raíz manda; si no hay, el primero que aparezca.
  const entrada = htmls.find((f) => !f.includes("/")) ?? htmls[0] ?? null;

  const fuentes = nombres.filter((f) => FUENTES_WEB.some((e) => f.endsWith(e)));
  const tieneFuentes = fuentes.some((f) => !f.endsWith(".html") && !f.endsWith(".htm") && !f.endsWith(".css"));

  return { hay: htmls.length > 0 || tieneFuentes, tieneHtml: htmls.length > 0, tieneFuentes, entrada };
}

/** ¿Este nombre de archivo es del proyecto de verdad? */
export function esMarcadorAjeno(nombre: string): boolean {
  const n = String(nombre ?? "").replace(/\\/g, "/").toLowerCase().split("/").pop() ?? "";
  return MARCADORES_AJENOS.includes(n);
}

/**
 * ¿Se puede previsualizar aunque el marcador ganador no sea servible?
 * La evidencia web manda: un `requirements.txt` suelto no puede secuestrar una
 * web. Devuelve por qué, para que el registro lo diga.
 */
export function servirPeseAlMarcador(
  ficheros: readonly string[],
  marcadorGanadorServible: boolean
): { servir: boolean; motivo: string } {
  if (marcadorGanadorServible) return { servir: true, motivo: "el marcador ganador ya es servible" };
  const web = hayEvidenciaWeb(ficheros);
  if (web.hay) {
    return {
      servir: true,
      motivo: web.tieneHtml
        ? "el marcador ganador no es servible, pero hay HTML: manda la web"
        : "el marcador ganador no es servible, pero hay fuentes web: manda la web",
    };
  }
  return { servir: false, motivo: "no hay ninguna evidencia web en la carpeta" };
}

export interface EsqueletoFaltante {
  crear: string[];
  motivo: string;
}

/** ¿Qué le falta a esta carpeta para poder arrancar como app web? */
export function esqueletoFaltante(
  ficheros: readonly string[],
  opciones: { tienePackageJson: boolean }
): EsqueletoFaltante {
  const nombres = (ficheros ?? []).map((f) => String(f).replace(/\\/g, "/").toLowerCase());
  const web = hayEvidenciaWeb(ficheros);
  const crear: string[] = [];

  if (!opciones.tienePackageJson && web.hay) crear.push("package.json");
  if (web.tieneFuentes && !web.tieneHtml) crear.push("index.html");

  return {
    crear,
    motivo: crear.length === 0 ? "el esqueleto está completo" : `falta ${crear.join(" y ")}`,
  };
}

/** `package.json` mínimo y correcto, con las dependencias REALES que el código importa. */
export function packageJsonMinimo(
  nombre: string,
  paquetes: readonly string[],
  opciones: { conVite?: boolean } = {}
): string {
  const limpio = (nombre || "app").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "app";
  const deps = [...new Set((paquetes ?? []).filter(Boolean))].sort();
  const dependencias: Record<string, string> = {};
  for (const p of deps) dependencias[p] = "latest";

  // Vite es lo que el proyecto espera si hay fuentes que transpilar; si no, basta
  // con un servidor estático, que no necesita dependencias.
  const conVite = opciones.conVite ?? false;
  if (conVite && !dependencias["vite"]) dependencias["vite"] = "latest";

  return (
    JSON.stringify(
      {
        name: limpio,
        private: true,
        version: "1.0.0",
        type: "module",
        scripts: conVite
          ? { dev: "vite --host 127.0.0.1 --port 3500", build: "vite build", preview: "vite preview" }
          : { dev: "npx serve . -l 3500", start: "npx serve . -l 3500" },
        dependencies: dependencias,
      },
      null,
      2
    ) + "\n"
  );
}

/** `index.html` mínimo que carga la entrada detectada. */
export function indexHtmlMinimo(entrada: string): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="es">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    "    <title>App</title>",
    "  </head>",
    "  <body>",
    '    <div id="root"></div>',
    `    <script type="module" src="./${String(entrada).replace(/^\.?\/+/, "")}"></script>`,
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}
