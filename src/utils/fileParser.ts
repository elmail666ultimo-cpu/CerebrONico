import JSZip from "jszip";
// v8.0.6 — Aduana del árbol: decide qué entra al paquete y, sobre todo, qué NO.
// El empaquetador metía todo lo que tuviera ruta y contenido, sin exclusiones.
import { clasificarRuta } from "../engine/aduanaArbol";
import { IDE_BRAND } from "../constants";
import { WorkspaceFile } from "../types";

/**
 * Packs all workspace files into a downloadable ZIP
 */
export async function generateProjectZip(files: WorkspaceFile[]): Promise<Blob> {
  const zip = new JSZip();

  // v1.15.1 — ADUANA DEL ÁRBOL también en el ZIP estándar (antes solo en el .cn).
  // Antes esto metía TODO lo que tuviera ruta; ahora cada ruta pasa por
  // clasificarRuta y lo PROHIBIDO (node_modules, .git, .env, .proyectos, logs,
  // backups…) se queda fuera. Así «Descargar ZIP» entrega la app, no el árbol.
  const excluidos: Array<{ ruta: string; motivo: string }> = [];

  for (const file of files) {
    if (!file.path || typeof file.content !== "string") continue;
    const dictamen = clasificarRuta(file.path);
    if (dictamen.veredicto === "prohibido") {
      if (!excluidos.some((e) => e.ruta === dictamen.ruta)) {
        excluidos.push({ ruta: dictamen.ruta, motivo: dictamen.motivo });
      }
      continue;
    }
    zip.file(file.path, file.content);
  }

  if (excluidos.length > 0) {
    console.info(
      `[ZIP] Aduana dejó fuera ${excluidos.length} archivo(s): ${excluidos.map((e) => e.ruta).join(", ")}`
    );
  }

  // Ensure essential runtime and build files exist in the exported ZIP
  if (!files.some((f) => f.path === "package.json")) {
    const pkgJson = JSON.stringify(
      {
        name: "codigo-cerebronico",
        private: true,
        version: "1.0.0",
        type: "module",
        author: "Mario Nicolas Quintero",
        scripts: {
          // 🔧 Puerto 3500: la app exportada corre en su propio puerto y así
          // NUNCA colisiona con la interfaz de CerebroNico IDE (puerto 3000).
          dev: "cross-env PORT=3500 tsx server.ts",
          build: "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
          start: "cross-env PORT=3500 node dist/server.cjs",
          lint: "tsc --noEmit",
        },
        dependencies: {
          "@google/genai": "^2.20.0",
          "@tailwindcss/vite": "^4.0.9",
          "@types/prismjs": "^1.26.6",
          clsx: "^2.1.1",
          "cross-env": "^7.0.3",
          cors: "^2.8.5",
          express: "^4.21.2",
          jszip: "^3.10.1",
          "lucide-react": "^1.16.0",
          prismjs: "^1.30.0",
          react: "^19.0.0",
          "react-dom": "^19.0.0",
          "tailwind-merge": "^3.0.2",
          tailwindcss: "^4.0.9",
        },
        devDependencies: {
          "@types/cors": "^2.8.17",
          "@types/express": "^5.0.0",
          "@types/node": "^22.13.5",
          "@types/react": "^19.0.10",
          "@types/react-dom": "^19.0.4",
          "@vitejs/plugin-react": "^4.3.4",
          esbuild: "^0.25.0",
          tsx: "^4.23.13",
          typescript: "^5.7.3",
          vite: "^6.2.0",
        },
        overrides: {
          qs: "^6.16.0",
        },
      },
      null,
      2
    );
    zip.file("package.json", pkgJson);
  }

  if (!files.some((f) => f.path === "vite.config.ts")) {
    zip.file(
      "vite.config.ts",
      `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 🔧 Puerto 3500 para no chocar con la IDE de CerebroNico (3000)
    port: 3500,
    host: "0.0.0.0",
  },
  build: {
    outDir: "dist",
  },
});
`
    );
  }

  if (!files.some((f) => f.path === "tsconfig.json")) {
    zip.file(
      "tsconfig.json",
      `{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": false,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "server.ts"]
}
`
    );
  }

  // Include MEMORIA.md if not present
  if (!files.some((f) => f.path === "MEMORIA.md")) {
    zip.file(
      "MEMORIA.md",
      `# MEMORIA.md - CerebroNico
Persistencia de lecciones aprendidas, contexto del proyecto y puertos:
- Puerto 3000: Interfaz de CerebroNico IDE (NO usar para la app)
- Puerto 3500: Este proyecto exportado (npm run dev) — puerto oficial de la app
- Puerto 5000: Microservicios / Workers / FastAPI / Proxies
- Puerto 11434: Ollama Local (http://127.0.0.1:11434)
Fecha de compilación: ${new Date().toISOString()}
`
    );
  }

  return await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

// ============================================================
// EXTENSIÓN .cn — Contenedor tipo ZIP de CerebroNico IDE v1
// ------------------------------------------------------------
// El archivo .cn es un ZIP con extensión renombrada, que contiene:
//   - manifest.json  (metadatos del workspace, modelo, provider, etc.)
//   - *.ts, *.tsx, *.py, *.md, *.json, etc.  (archivos del workspace)
//
// Es un contenedor genérico que admite TODO tipo de archivos:
// código, imágenes, PDFs, JSON, markdown, binarios, etc. Cualquier
// cosa que entre en un ZIP entra en un .cn.
// ============================================================

export interface CnManifest {
  format: "cerebronico-ide-workspace";
  formatVersion: 1;
  ide: string;
  exportedAt: string;
  currentModel?: string;
  provider?: string;
  temperature?: number;
  responseLanguage?: string;
  expertMode?: string;
  /**
   * v8.0.6 — OPCIONAL, y es una decisión de tipos, no una comodidad.
   * El recuento no se puede saber al construir el manifiesto: depende de qué
   * archivos superen la aduana. Marcarlo obligatorio forzaba a escribirlo ANTES
   * (contando la entrada, que es un dato falso) y luego reescribirlo. Con
   * `?`, sólo existe el número verdadero.
   */
  fileCount?: number;
  /** Archivos que la aduana dejó fuera, con su motivo. Nunca en silencio. */
  excluidos?: Array<{ ruta: string; motivo: string }>;
}

export interface CnExportOptions {
  currentModel?: string;
  provider?: string;
  temperature?: number;
  responseLanguage?: string;
  expertMode?: string;
  /** Archivos adicionales que no son del workspace pero que el usuario adjuntó */
  extraFiles?: { path: string; content: string }[];
}

/**
 * Genera un archivo .cn (ZIP con extensión .cn) que contiene TODOS los archivos
 * del workspace + un manifest.json con metadatos del IDE.
 *
 * El .cn es un contenedor genérico: admite cualquier tipo de archivo (código,
 * imágenes, PDFs, JSON, markdown, binarios). Es esencialmente un ZIP renombrado
 * con un manifest adicional para que el IDE pueda restaurar la sesión completa.
 */
export async function generateCnFile(
  files: WorkspaceFile[],
  options: CnExportOptions = {}
): Promise<Blob> {
  const zip = new JSZip();

  // 1. manifest.json con metadatos del IDE
  const manifest: CnManifest = {
    format: "cerebronico-ide-workspace",
    formatVersion: 1,
    // v1.6.33 — la marca que firma el paquete sale de la semilla única. El
    // FORMATO sigue siendo `formatVersion: 1` (eso no cambia); lo que se
    // arregla es que un paquete exportado hoy no diga que lo hizo un «v1».
    ide: IDE_BRAND.FULL_NAME,
    exportedAt: new Date().toISOString(),
    currentModel: options.currentModel,
    provider: options.provider,
    temperature: options.temperature,
    responseLanguage: options.responseLanguage,
    expertMode: options.expertMode,
    // v8.0.6 — SIN `fileCount` AQUÍ.
    // Estaba contando las entradas de la lista, y se escribía ANTES de saber qué
    // iba a entrar de verdad. El recuento correcto se escribe más abajo, con el
    // manifiesto ya corregido y la lista de excluidos. Dejar los dos sería
    // volver a tener dos fuentes para el mismo dato — el defecto que este
    // proyecto ya se ha encontrado cuatro veces.
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  // ============================================================
  // v8.0.6 — ADUANA DEL ÁRBOL ANTES DE EMPAQUETAR
  // ------------------------------------------------------------
  // Antes esto era un `for` que metía TODO lo que tuviera ruta y contenido,
  // sin una sola exclusión: el `.env` con la clave, el `debug.log` de 40 MB, el
  // `node_modules` entero si el modelo lo hubiera creado, y la copia espejo de
  // `.proyectos/`. De ahí el «se suman archivos que no van en el empaque».
  //
  // Ahora cada ruta pasa por `clasificarRuta`. Los PROHIBIDOS no entran nunca y
  // quedan REGISTRADOS en el manifiesto: si algo se deja fuera, el usuario tiene
  // que poder verlo. Excluir en silencio sería el mismo pecado que incluirlo en
  // silencio — decidir por él sin decírselo.
  // ============================================================
  const excluidos: Array<{ ruta: string; motivo: string }> = [];

  let empaquetados = 0;

  const meterConAduana = (ruta: string, contenido: string): void => {
    const d = clasificarRuta(ruta);
    if (d.veredicto === "prohibido") {
      // Sin duplicados en el informe aunque la ruta se repita.
      if (!excluidos.some((e) => e.ruta === d.ruta)) excluidos.push({ ruta: d.ruta, motivo: d.motivo });
      return;
    }
    zip.file(ruta, contenido);
    empaquetados++;
  };

  // 2. Todos los archivos del workspace (código, markdown, JSON, etc.)
  for (const file of files) {
    if (file.path && typeof file.content === "string") {
      meterConAduana(file.path, file.content);
    }
  }

  // 3. Archivos extra adjuntos por el usuario (cualquier tipo: binario, imagen, PDF...)
  if (options.extraFiles && options.extraFiles.length > 0) {
    for (const extra of options.extraFiles) {
      if (extra.path && typeof extra.content === "string") {
        meterConAduana(extra.path, extra.content);
      }
    }
  }

  // 2b. Manifiesto corregido: recuento REAL y lista de lo excluido.
  // El `fileCount` que se escribió más arriba contaba las ENTRADAS, no lo que
  // acabó dentro: decía 40 cuando el paquete llevaba 37. Un manifiesto que no
  // cuadra con su propio ZIP no sirve para verificar nada, así que se reescribe
  // (JSZip reemplaza al repetir el nombre) con la cuenta de verdad.
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        ...manifest,
        // v8.0.6 — La marca deja de ser un literal «v1» que sobrevivió a ocho
        // versiones: el manifiesto declaraba una versión del IDE que ya no existe.
        ide: `CerebroNico IDE ${IDE_BRAND.VERSION}`,
        fileCount: empaquetados,
        excluidos: excluidos.length > 0 ? excluidos : undefined,
      },
      null,
      2
    )
  );

  // 4. Carpeta .cerebronico con metadatos adicionales (info del IDE)
  zip.folder(".cerebronico")?.file(
    "README.md",
    `# ${IDE_BRAND.FULL_NAME} — Workspace Package

Este archivo \`.cn\` es un contenedor tipo ZIP que empaqueta un workspace completo
de ${IDE_BRAND.FULL_NAME}. Adentro encontrarás:

- \`manifest.json\`: metadatos del workspace (modelo activo, provider, temperatura, etc.)
- Archivos del proyecto (cualquier tipo: \`.ts\`, \`.tsx\`, \`.py\`, \`.md\`, \`.json\`, imágenes, PDFs...)

## Cómo abrirlo

1. Desde ${IDE_BRAND.FULL_NAME} → panel derecho → explorador → botón "Abrir .cn".
2. O descomprime el archivo .cn con cualquier extractor ZIP (7-Zip, WinRAR, etc.)
   y verás su contenido como cualquier carpeta normal.

## Compatibilidad

El .cn es 100% compatible con herramientas ZIP estándar. Solo cambia la extensión:
- \`.cn\`  → archivo CerebroNico (con manifest.json incluido)
- \`.zip\` → ZIP estándar (sin manifest.json)

Renombrar un \`.cn\` a \`.zip\` te permite inspeccionarlo en cualquier explorador.
`
  );

  return await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export interface CnParseResult {
  manifest: CnManifest | null;
  files: WorkspaceFile[];
  extras: { path: string; content: string; isText: boolean }[];
}

/**
 * Parsea un archivo .cn (ZIP con extensión .cn) y devuelve:
 *   - manifest.json (si existe) con los metadatos del IDE
 *   - files: archivos de texto del workspace (para el editor)
 *   - extras: otros archivos (binarios, imágenes) que no son editables pero sí almacenables
 *
 * Acepta también .zip estándar y .json (formato legacy v1) por compatibilidad.
 */
export async function parseCnFile(file: File): Promise<CnParseResult> {
  const buf = await file.arrayBuffer();

  // Intentar leer como ZIP primero (formato principal .cn)
  try {
    const zip = await JSZip.loadAsync(buf);
    let manifest: CnManifest | null = null;
    const files: WorkspaceFile[] = [];
    const extras: { path: string; content: string; isText: boolean }[] = [];

    const entries = Object.values(zip.files);
    for (const entry of entries) {
      if (entry.dir) continue;
      const path = entry.name;
      // Saltar archivos de metadata del IDE
      if (path === ".cerebronico/README.md") continue;
      if (path.startsWith(".cerebronico/")) continue;

      // Leer el contenido del archivo
      const lower = path.toLowerCase();
      const isProbablyText = /\.(ts|tsx|js|jsx|py|md|txt|json|html|css|scss|yaml|yml|sh|bat|toml|ini|env|gitignore|npmrc|prettierrc|babelrc|editorconfig|svg|xml|csv|sql|c|cpp|h|hpp|java|kt|go|rs|rb|php|vue|svelte|astro|njk|liquid|tex|bib)$/i.test(lower)
        || lower.endsWith(".cn") || lower.endsWith(".gitignore") || lower.endsWith(".env")
        || lower === "manifest.json";

      // manifest.json especial
      if (path === "manifest.json") {
        try {
          const txt = await entry.async("string");
          manifest = JSON.parse(txt) as CnManifest;
        } catch {}
        continue;
      }

      if (isProbablyText) {
        try {
          const content = await entry.async("string");
          const name = path.split("/").pop() || path;
          files.push({
            id: `cn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${files.length}`,
            name,
            path,
            content,
            language: detectLanguageFromPathSimple(path),
            size: content.length,
            modified: false,
          });
        } catch {
          // no se pudo leer como texto → meter en extras
          try {
            const b64 = await entry.async("base64");
            extras.push({ path, content: b64, isText: false });
          } catch {}
        }
      } else {
        // Archivo binario (imagen, PDF, etc.) → guardarlo como base64
        try {
          const b64 = await entry.async("base64");
          extras.push({ path, content: b64, isText: false });
        } catch {}
      }
    }

    return { manifest, files, extras };
  } catch (zipErr) {
    // No es un ZIP → intentar como JSON legacy (formato anterior v1.0.0)
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data.files)) {
        const files: WorkspaceFile[] = data.files
          .filter((f: any) => f && typeof f.path === "string" && typeof f.content === "string")
          .map((f: any, idx: number) => ({
            id: typeof f.id === "string" ? f.id : `cn-${Date.now()}-${idx}`,
            name: f.name || (f.path.split("/").pop() || f.path),
            path: f.path,
            content: f.content,
            language: f.language || detectLanguageFromPathSimple(f.path),
            size: f.content.length,
            modified: false,
          }));
        return {
          manifest: {
            format: "cerebronico-ide-workspace",
            formatVersion: 1,
            ide: data.ide || "CerebroNico IDE v1 (legacy JSON)",
            exportedAt: data.exportedAt || new Date().toISOString(),
            currentModel: data.currentModel,
            provider: data.provider,
            temperature: data.temperature,
            responseLanguage: data.responseLanguage,
            expertMode: data.expertMode,
            fileCount: files.length,
          },
          files,
          extras: [],
        };
      }
      throw new Error("El archivo .cn no es ni un ZIP válido ni un JSON legacy con 'files'.");
    } catch (jsonErr) {
      throw new Error(
        `No se pudo leer el archivo .cn: no es ZIP ni JSON. ZIP error: ${(zipErr as Error).message}. JSON error: ${(jsonErr as Error).message}.`
      );
    }
  }
}

/**
 * Helper simple para detectar el lenguaje a partir de la extensión del archivo.
 * No depende de syntaxEngine para evitar ciclos de import.
 */
function detectLanguageFromPathSimple(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    md: "markdown",
    json: "json",
    html: "html",
    css: "css",
    scss: "scss",
    yaml: "yaml",
    yml: "yaml",
    sh: "bash",
    bat: "batch",
    toml: "toml",
    ini: "ini",
    xml: "xml",
    csv: "csv",
    sql: "sql",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    java: "java",
    kt: "kotlin",
    go: "go",
    rs: "rust",
    rb: "ruby",
    php: "php",
    vue: "vue",
    svelte: "svelte",
    astro: "astro",
    svg: "xml",
  };
  return map[ext] || "text";
}

/**
 * Downloads a Blob as a file in browser
 */
export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
