import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AttachmentItem, WorkspaceFile } from "../types";
// v8.0.3 — Geometría de la miniatura. La aritmética vive en un módulo PURO
// (src/utils/miniatura.ts) para poder probarla: aquí solo queda la fontanería
// de canvas, que no toma decisiones y por eso no se prueba.
import { calcularDimensionesMiniatura, mereceMiniatura, MAX_MINIATURA_PX } from "./miniatura";

// Configura el worker de PDF.js para el navegador (Vite)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ============================================================
// v2.1 — 🐞 "No se encontró package.json en el sandbox tras sincronizar"
// ------------------------------------------------------------
// CAUSA RAÍZ (reproducida con un ZIP real): al importar un ZIP, la extracción
// se cortaba a los 40 archivos EN EL ORDEN EN QUE VIENEN DENTRO DEL ZIP. Un ZIP
// de proyecto no trae solo código: trae .md, .bat, .txt, capturas… Así que los
// archivos que DECIDEN SI EL PROYECTO ARRANCA (package.json, vite.config,
// index.html) podían quedarse fuera del corte. El síntoma encaja exacto con lo
// reportado: "43 archivo(s) escritos" y acto seguido "no se encontró
// package.json" — el proyecto estaba incompleto, no mal.
//
// El tope por RAM sigue siendo necesario, pero el tope NO puede comerse los
// archivos estructurales: sin ellos el proyecto es inservible aunque estén los
// otros 140. Se ordena por prioridad ANTES de cortar, y los estructurales no
// cuentan para el tope de archivos porque son diminutos (package.json ≈ 1 KB).
// ============================================================

/** Archivos sin los cuales un proyecto no puede arrancar ni instalarse. */
const PATRONES_ESTRUCTURALES: RegExp[] = [
  /(^|\/)package\.json$/i,
  /(^|\/)package-lock\.json$/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)yarn\.lock$/i,
  /(^|\/)vite\.config\.(ts|js|mjs|cjs)$/i,
  /(^|\/)next\.config\.(ts|js|mjs|cjs)$/i,
  /(^|\/)(ts|js)config(\..+)?\.json$/i,
  /(^|\/)index\.html$/i,
  /(^|\/)tailwind\.config\.(ts|js|cjs)$/i,
  /(^|\/)postcss\.config\.(ts|js|cjs)$/i,
  /(^|\/)\.env\.example$/i,
  /(^|\/)requirements\.txt$/i,
  /(^|\/)(index|main)\.(ts|tsx|js|jsx|css)$/i,
  /(^|\/)App\.(ts|tsx|js|jsx)$/i,
];

/** ¿Es un archivo imprescindible para que el proyecto arranque? */
export function esArchivoEstructural(ruta: string): boolean {
  return PATRONES_ESTRUCTURALES.some((re) => re.test(ruta));
}

/**
 * Ordena las entradas del ZIP por prioridad antes de aplicar el tope:
 *   1º los estructurales (siempre entran)
 *   2º el resto, en orden alfabético estable
 * Función pura: se puede probar sin navegador.
 */
// ============================================================
// v2.1 — CARPETAS PESADAS QUE NO SON CÓDIGO FUENTE.
// ------------------------------------------------------------
// Salidas de build, dependencias y cachés: ocupan muchísimo y no hacen falta
// para trabajar. Se ordenan AL FINAL, de modo que si el tope de bytes tiene que
// cortar algo, corte esto y JAMÁS el código fuente.
//
// Motivo concreto y medido: al construir el proyecto (`npm run build`) aparece
// dist/ con ~3 MB de assets (index.js 1,19 MB + pdf.worker 1,37 MB + server.mjs
// 342 KB + css). Si ese ZIP se importa al sandbox, dist/ se comería el
// presupuesto de 3,5 MB ANTES de llegar a src/… y volvería la pantalla blanca con
// 404 en /src/*, que es exactamente el fallo que acabamos de cerrar. Con esto,
// lo primero que se sacrifica es lo que se puede reconstruir.
// ============================================================
const RE_CARPETA_PESADA =
  /(^|\/)(node_modules|dist|build|out|coverage|\.next|\.nuxt|\.output|\.svelte-kit|venv|\.venv|__pycache__|\.cache|\.parcel-cache|\.turbo)(\/|$)/i;

export function esCarpetaPesada(ruta: string): boolean {
  return RE_CARPETA_PESADA.test(ruta.replace(/\\/g, "/"));
}

export function priorizarEntradasZip(rutas: string[]): string[] {
  // 0 = lo que decide si el proyecto arranca · 1 = código del proyecto ·
  // 2 = artefactos pesados (se sacrifican primero si hay que cortar).
  // OJO con el orden de estas dos comprobaciones: PRIMERO se descarta que el
  // archivo viva dentro de una carpeta pesada. Si no, `node_modules/vite/package.json`
  // se colaría como "estructural" solo por llamarse package.json y se llevaría
  // presupuesto por delante del código real del proyecto. Lo mismo con
  // `dist/index.html`, que es un artefacto y no la entrada que hace falta servir.
  const nivel = (r: string) => {
    if (esCarpetaPesada(r)) return 2;
    return esArchivoEstructural(r) ? 0 : 1;
  };
  return [...rutas].sort((a, b) => {
    const na = nivel(a);
    const nb = nivel(b);
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
  });
}

/**
 * Cleanly extracts text from Word DOCX XML payload (<w:t> tags and <w:p> paragraphs)
 */
function extractTextFromWordXml(xmlContent: string): string {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
    const paragraphs = xmlDoc.getElementsByTagName("w:p");
    const lines: string[] = [];

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const textNodes = p.getElementsByTagName("w:t");
      let lineText = "";
      for (let j = 0; j < textNodes.length; j++) {
        lineText += textNodes[j].textContent || "";
      }
      const trimmed = lineText.trim();
      if (trimmed.length > 0) {
        lines.push(trimmed);
      }
    }

    if (lines.length > 0) {
      return lines.join("\n\n");
    }

    // Fallback regex extraction
    const matches = xmlContent.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g);
    if (matches) {
      const extracted = matches
        .map((m) => m.replace(/<[^>]+>/g, "").trim())
        .filter((t) => t.length > 0);
      if (extracted.length > 0) {
        return extracted.join(" ");
      }
    }
  } catch (err) {
    console.error("Error al parsear Word XML:", err);
  }
  return "";
}

/**
 * Extracts clean Spanish/UTF-8 text from RTF (Rich Text Format) documents
 * Eliminates {\rtf... \par \b \fs} tags and decodes \'xx / \u-xxxx? sequences
 */
function extractTextFromRtf(rtfContent: string): string {
  try {
    let text = rtfContent;

    // 1. Remove font table, color table, stylesheet and generator groups
    text = text.replace(/\{\\\*?\w+[\s\S]*?\}/g, "");

    // 2. Decode RTF hex characters like \'e1 -> á, \'e9 -> é, \'ed -> í, \'f3 -> ó, \'fa -> ú, \'f1 -> ñ
    text = text.replace(/\\\'([0-9a-fA-F]{2})/g, (_match, hex) => {
      try {
        const code = parseInt(hex, 16);
        return String.fromCharCode(code);
      } catch {
        return "";
      }
    });

    // 3. Decode RTF signed Unicode escapes like \u-10178? or \u2345?
    text = text.replace(/\\u(-?\d+)\??/g, (_match, codeStr) => {
      try {
        let code = parseInt(codeStr, 10);
        if (code < 0) {
          code = code + 65536;
        }
        return String.fromCharCode(code);
      } catch {
        return "";
      }
    });

    // 4. Convert paragraph breaks and tabs
    text = text.replace(/\\par\b/gi, "\n");
    text = text.replace(/\\line\b/gi, "\n");
    text = text.replace(/\\tab\b/gi, "\t");

    // 5. Remove all other RTF control words (\b, \i, \fs24, etc.)
    text = text.replace(/\\[a-zA-Z0-9\-]+\b ?/g, "");

    // 6. Remove stray braces
    text = text.replace(/[{}]/g, "");

    // 7. Clean whitespace
    const cleanLines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    return cleanLines.join("\n\n");
  } catch (err) {
    console.error("Error al extraer texto RTF:", err);
    return rtfContent.replace(/[\\{}]/g, "").slice(0, 5000);
  }
}

/**
 * Extracts clean text from a PDF document using pdf.js
 */
async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item: any) => (typeof item === "object" && "str" in item ? item.str : ""))
        .join(" ");
      pages.push(text.trim());
    }
    await doc.destroy();
    return pages.join("\n\n");
  } catch (err) {
    console.error("Error extrayendo texto del PDF:", err);
    return "";
  }
}

/**
 * Detects if a buffer contains binary data rather than text
 */
function isBinaryData(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;

  // Check magic numbers for common binary formats
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return true; // ZIP / DOCX / APK
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return true; // Legacy Office DOC/XLS
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true; // PNG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true; // JPEG
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return true; // PDF
  if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return true; // ELF binary
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) return true; // Windows PE/EXE

  // Sample the first 1024 bytes for null bytes or control characters
  let nonPrintableCount = 0;
  const sampleLength = Math.min(bytes.length, 1024);

  for (let i = 0; i < sampleLength; i++) {
    const b = bytes[i];
    if (b === 0) return true; // Null byte indicates binary
    if (b < 9 || (b > 13 && b < 32 && b !== 27)) {
      nonPrintableCount++;
    }
  }

  return nonPrintableCount / sampleLength > 0.08;
}

/**
 * Safely extracts printable text strings from unknown binary file
 */
function extractReadableStrings(bytes: Uint8Array, minLen = 4): string {
  const strings: string[] = [];
  let current = "";

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9 || b >= 160) {
      current += String.fromCharCode(b);
    } else {
      if (current.trim().length >= minLen) {
        strings.push(current.trim());
      }
      current = "";
    }
  }
  if (current.trim().length >= minLen) {
    strings.push(current.trim());
  }

  // Filter out noisy fragments
  const meaningful = strings.filter(
    (s) => s.length > 5 && !/^[0-9a-fA-F_.\/\\:\-]+$/.test(s)
  );

  return meaningful.slice(0, 100).join("\n");
}

/**
 * Checks if a filename represents an image
 */
export function isImageFileName(filename: string): boolean {
  return /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(filename);
}

/**
 * Checks if a filename represents a compressed container
 */
export function isZipFileName(filename: string): boolean {
  return /\.(zip|jar|apk|tar|gz)$/i.test(filename);
}

/**
 * Checks if a filename is a Word document
 */
export function isDocxFileName(filename: string): boolean {
  return /\.(docx|doc)$/i.test(filename);
}

/**
 * Checks if a filename is a standard plain text / code file
 */
export function isTextFileName(filename: string): boolean {
  // ============================================================
  // v2.1 — 🐞 FALTABAN .mjs Y .cjs, Y ESO ROMPÍA `npm install` EN EL SANDBOX.
  // ------------------------------------------------------------
  // Reproducido con el ZIP real: el workspace se quedaba en 125 archivos y NO
  // traía `scripts/postinstall.mjs` ni `electron-main.cjs`, porque esta lista no
  // los reconocía como texto. El paquete se veía así:
  //     .html:2 · .json:5 · .tsx:24 · .css:1 · .ts:50 · .txt:6 · .bat:5 · .py:20 · .md:12
  // Y como `package.json` SÍ declara `"postinstall": "node scripts/postinstall.mjs"`,
  // al instalar en el sandbox pasaba esto, en cada arranque:
  //     Error: Cannot find module '/…/.proyectos/scripts/postinstall.mjs'
  //     npm error command sh -c node scripts/postinstall.mjs
  //     npm error code 1
  // Es decir: el `npm install` terminaba en error por un archivo que el propio
  // importador había descartado. De ahí el rojo recurrente en el log del sandbox
  // ("npm install con errores") aunque las dependencias sí quedaran instaladas.
  // Se añaden las extensiones de módulo modernas y las de frameworks que hoy son
  // código fuente corriente: dejarlas fuera rompe proyectos reales en silencio.
  // ============================================================
  return /\.(txt|md|json|ts|tsx|mts|cts|js|jsx|mjs|cjs|py|pyw|html|htm|css|scss|sass|less|vue|svelte|astro|c|cpp|h|hpp|cs|java|kt|swift|rs|go|rb|php|pl|sh|bash|zsh|fish|bat|cmd|ps1|xml|yaml|yml|sql|env|ini|cfg|conf|rtf|properties|toml|graphql|gql|proto|lock|dockerfile|gitignore|npmrc|editorconfig)$/i.test(
    filename
  );
}

/**
 * Helper to determine clean language for code viewer
 */
function getLanguageForFileName(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "txt";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    json: "json",
    md: "markdown",
    html: "html",
    css: "css",
    scss: "scss",
    sql: "sql",
    rs: "rust",
    go: "go",
    c: "c",
    cpp: "cpp",
    sh: "shell",
    bash: "shell",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
  };
  return langMap[ext] || ext;
}

/**
 * v8.0.3 — Genera la MINIATURA del chip a partir del data URL original.
 *
 * Devuelve `null` en cualquier fallo, y eso es deliberado: la miniatura es un
 * adorno de la vista, no un dato. Si el canvas del navegador no puede con una
 * imagen concreta (formato exótico, imagen corrupta, memoria), el adjunto DEBE
 * seguir funcionando con su icono. Tirar el adjunto entero por no poder pintar
 * su miniatura sería cambiar un problema cosmético por uno real.
 *
 * Formato de salida: WebP a calidad 0,8. Se elige WebP y no JPEG a propósito:
 * un JPEG de una captura con zona transparente sale con fondo negro, y a 32 px
 * un cuadrado negro no dice nada. WebP conserva el alfa y ocupa parecido.
 */
export function generarMiniatura(dataUrl: string, max: number = MAX_MINIATURA_PX): Promise<string | null> {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith("data:image/")) return resolve(null);

    const img = new Image();
    // La miniatura no debe retener el proceso de carga de la interfaz.
    img.decoding = "async";

    img.onload = () => {
      try {
        // La decisión de tamaño NO se toma aquí: se pide al módulo puro.
        if (!mereceMiniatura(img.naturalWidth || img.width, img.naturalHeight || img.height, max)) {
          // La imagen ya era más pequeña que la miniatura: se devuelve el
          // original tal cual y nos ahorramos un canvas y una recompresión.
          return resolve(dataUrl);
        }
        const dim = calcularDimensionesMiniatura(img.naturalWidth || img.width, img.naturalHeight || img.height, max);
        if (dim.ancho === 0 || dim.alto === 0) return resolve(null);

        const canvas = document.createElement("canvas");
        canvas.width = dim.ancho;
        canvas.height = dim.alto;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);

        // Suavizado de calidad: a 96 px la diferencia se ve en texto y bordes.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, dim.ancho, dim.alto);

        let salida = "";
        try {
          salida = canvas.toDataURL("image/webp", 0.8);
        } catch {
          salida = "";
        }
        // Si el navegador no supiera WebP devolvería "data:," o vacío; en ese
        // caso se cae a PNG, que siempre está.
        if (!salida || salida.length < 32 || !salida.startsWith("data:image/")) {
          try {
            salida = canvas.toDataURL("image/png");
          } catch {
            return resolve(null);
          }
        }
        return resolve(salida && salida.length >= 32 ? salida : null);
      } catch {
        return resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Process a single File or Blob object uploaded by user
 * NEVER dumps raw binary diamonds (PK...) into the workspace or prompt.
 */
export async function processUploadedFile(file: File): Promise<{
  attachment: AttachmentItem;
  workspaceFiles: WorkspaceFile[];
}> {
  const attachmentId = "att-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  const name = file.name;
  const size = file.size;
  const type = file.type || "application/octet-stream";

  const workspaceFiles: WorkspaceFile[] = [];

  // Case 1: Image files (JPG, PNG, WEBP, etc.)
  if (isImageFileName(name) || type.startsWith("image/")) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        // v8.0.3 — Miniatura para el chip del adjunto. Best-effort a propósito:
        // `generarMiniatura` devuelve null si no puede y el chip cae al icono.
        // Aquí NO se lanza nunca: un fallo pintando una miniatura no puede
        // impedir que el usuario adjunte el archivo.
        let thumbData: string | undefined;
        try {
          thumbData = (await generarMiniatura(base64Data)) || undefined;
        } catch {
          thumbData = undefined;
        }
        resolve({
          attachment: {
            id: attachmentId,
            name,
            size,
            type,
            isImage: true,
            base64Data,
            thumbData,
            extractedText: `[Imagen adjunta: ${name} (${Math.round(size / 1024)} KB) - Preparada para análisis visual con glm-ocr / smolvlm2]`,
          },
          workspaceFiles: [],
        });
      };
      reader.onerror = () => {
        resolve({
          attachment: {
            id: attachmentId,
            name,
            size,
            type,
            error: "Error al leer imagen",
          },
          workspaceFiles: [],
        });
      };
      reader.readAsDataURL(file);
    });
  }

  // Read raw array buffer first to inspect headers accurately
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const isBinary = isBinaryData(bytes);

  // Case 2: DOCX Word Document (Zip container containing document.xml)
  if (isDocxFileName(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b && name.endsWith(".docx"))) {
    try {
      const zip = await JSZip.loadAsync(arrayBuffer);
      let fullDocText = "";

      // 1. Try word/document.xml
      const docXml = zip.file("word/document.xml");
      if (docXml) {
        const xmlText = await docXml.async("text");
        fullDocText = extractTextFromWordXml(xmlText);
      }

      // 2. If empty, check headers and footers
      if (!fullDocText) {
        const xmlFiles = Object.keys(zip.files).filter(
          (f) => f.startsWith("word/") && f.endsWith(".xml")
        );
        const parts: string[] = [];
        for (const xmlPath of xmlFiles) {
          const zf = zip.file(xmlPath);
          if (zf) {
            const txt = extractTextFromWordXml(await zf.async("text"));
            if (txt) parts.push(txt);
          }
        }
        fullDocText = parts.join("\n\n");
      }

      const docxText =
        fullDocText.trim() ||
        `# ${name}\n\n[Documento Word: ${name} procesado correctamente. No contenía bloques de texto editables o contenía únicamente diagramas/tablas incrustadas.]`;

      const cleanFileName = name.replace(/\.docx?$/i, ".md");
      workspaceFiles.push({
        id: "doc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        name: cleanFileName,
        path: cleanFileName,
        content: `# Contenido de ${name}\n\n${docxText}`,
        language: "markdown",
        size: docxText.length,
        modified: false,
      });

      return {
        attachment: {
          id: attachmentId,
          name,
          size,
          type,
          isDocx: true,
          extractedText: `### 📄 Documento Word: \`${name}\`\n${docxText}`,
        },
        workspaceFiles,
      };
    } catch (err) {
      console.warn("Error decoding DOCX with JSZip:", err);
    }
  }

  // Case 3: Compressed ZIP File
  if (isZipFileName(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) {
    try {
      const zip = await JSZip.loadAsync(arrayBuffer);
      const unpackedFiles: { path: string; size: number; content: string; isText: boolean }[] = [];
      const extractedEntries: string[] = [];

      const fileKeys = Object.keys(zip.files);

      // 🔧 LÍMITES ANTI-OOM (v2.1, corregidos).
      // El tope sigue existiendo porque en 8 GB de RAM no se puede volcar un ZIP
      // entero a memoria, localStorage incluido. Lo que cambió:
      //   · 40 → 150 → 200 → 500 archivos. Con 40 un proyecto real quedaba
      //     mutilado; el usuario pidió 500.
      //   · EL TOPE DE BYTES ES EL LÍMITE REAL, no el de archivos. El workspace
      //     se guarda en localStorage y su techo son 5 MB
      //     (ver MAX_LOCALSTORAGE_BYTES), y al pasarse NO guarda: falla en
      //     silencio y el usuario pierde el workspace al recargar. Por eso el
      //     texto se corta a 3,5 MB, dejando margen para el escapado del JSON.
      //     Con 500 archivos reales de un proyecto Node es difícil llegar ahí,
      //     pero si un proyecto trae mucho .map/asset, el de bytes manda.
      //   · Los ESTRUCTURALES van primero, así que nunca se recortan.
      //   · Los archivos ESTRUCTURALES se extraen siempre y no cuentan para el
      //     tope de archivos (ver priorizarEntradasZip / esArchivoEstructural).
      const MAX_FILES_TO_EXTRACT = 500;
      const MAX_TOTAL_TEXT_BYTES = 3584 * 1024; // 3,5 MB total de texto extraído
      const MAX_CHARS_POR_ARCHIVO = 2 * 1024 * 1024; // 2 MB por archivo (antes 100 KB)
      let totalTextBytes = 0;
      let filesExtracted = 0;
      const skippedFiles: string[] = [];

      // 🐞 El orden del ZIP ya no decide qué se pierde: los imprescindibles van
      // primero, así que package.json / vite.config / index.html nunca se cortan.
      const entradasOrdenadas = priorizarEntradasZip(
        fileKeys.filter((k) => !zip.files[k].dir)
      );

      for (const relativePath of entradasOrdenadas) {
        const zipEntry = zip.files[relativePath];
        if (zipEntry.dir) continue;
        if (relativePath.includes("__MACOSX/") || relativePath.includes(".DS_Store")) continue;

        const estructural = esArchivoEstructural(relativePath);

        // Límite de archivos: el estructural nunca se descarta por el tope.
        if (!estructural && filesExtracted >= MAX_FILES_TO_EXTRACT) {
          skippedFiles.push(relativePath);
          continue;
        }

        // Límite de bytes totales: parar si ya tenemos 1 MB de texto
        if (totalTextBytes >= MAX_TOTAL_TEXT_BYTES) {
          skippedFiles.push(relativePath);
          continue;
        }

        // Extract DOCX inside ZIP
        if (isDocxFileName(relativePath)) {
          try {
            const docxBuffer = await zipEntry.async("arraybuffer");
            const innerZip = await JSZip.loadAsync(docxBuffer);
            const innerDoc = innerZip.file("word/document.xml");
            if (innerDoc) {
              const text = extractTextFromWordXml(await innerDoc.async("text"));
              if (text.trim()) {
                // 🔧 Limitar texto individual a 50 KB por archivo
                const trimmedText = text.length > 50000 ? text.slice(0, 50000) + "\n\n... (texto truncado)" : text;
                const docName = relativePath.replace(/\.docx?$/i, ".md");
                unpackedFiles.push({
                  path: docName,
                  size: trimmedText.length,
                  content: trimmedText,
                  isText: true,
                });
                workspaceFiles.push({
                  id: "file-" + Math.random().toString(36).slice(2, 8),
                  name: docName.split("/").pop() || docName,
                  path: docName,
                  content: `# ${relativePath}\n\n${trimmedText}`,
                  language: "markdown",
                  size: trimmedText.length,
                  modified: false,
                });
                extractedEntries.push(`#### 📄 \`${relativePath}\`\n${trimmedText.slice(0, 3000)}`);
                totalTextBytes += trimmedText.length;
                filesExtracted++;
              }
            }
          } catch (e) {
            console.warn(`Could not parse inner docx ${relativePath}:`, e);
          }
          continue;
        }

        // Check if file is readable text / code
        if (isTextFileName(relativePath)) {
          try {
            const entryBytes = await zipEntry.async("uint8array");
            // 🔧 Saltar archivos binarios > 5 MB (probablemente datasets o assets)
            if (entryBytes.length > 5 * 1024 * 1024) {
              skippedFiles.push(relativePath + " (demasiado grande)");
              continue;
            }
            if (!isBinaryData(entryBytes)) {
              const decoder = new TextDecoder("utf-8");
              const content = decoder.decode(entryBytes);
              const cleanContent = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

              // ============================================================
              // v2.1 — 🐞 LOS ARCHIVOS GRANDES SE CORTABAN Y ESO ROMPÍA TODO
              // ------------------------------------------------------------
              // Tope anterior: 100.000 caracteres. Pero `server.ts` pesa
              // 256.806 y `src/App.tsx` 145.010, así que se guardaban CORTADOS,
              // y el guardián de sintaxis los rechazaba justo por estar cortados
              // ("El archivo TERMINA con un marcador... está cortado").
              //
              // Fallo exacto que producía (log del usuario):
              //   npm run dev → tsx server.ts
              //   ERR_MODULE_NOT_FOUND: Cannot find module '.proyectos\server.ts'
              // El archivo no llegaba al disco porque lo cortábamos NOSOTROS.
              //
              // Regla nueva: un archivo se escribe COMPLETO o no se escribe.
              // Un archivo a medias es PEOR que ausente: parece estar, no
              // funciona, y el guardián lo tira sin que se entienda la causa.
              // El tope de abajo solo actúa ante un archivo absurdamente grande
              // (> 2 MB) y entonces omite el archivo entero, diciéndolo.
              // ============================================================
              if (cleanContent.length > MAX_CHARS_POR_ARCHIVO) {
                skippedFiles.push(
                  `${relativePath} (${Math.round(cleanContent.length / 1024)} KB: supera el tope de ${Math.round(MAX_CHARS_POR_ARCHIVO / 1024)} KB por archivo; se omite entero para no escribirlo cortado)`
                );
                continue;
              }
              const finalContent = cleanContent;

              const lang = getLanguageForFileName(relativePath);
              unpackedFiles.push({
                path: relativePath,
                size: finalContent.length,
                content: finalContent,
                isText: true,
              });

              workspaceFiles.push({
                id: "file-" + Math.random().toString(36).slice(2, 8),
                name: relativePath.split("/").pop() || relativePath,
                path: relativePath,
                content: finalContent,
                language: lang,
                size: finalContent.length,
                modified: false,
              });

              // 🔧 El resumen del chat solo incluye primeros 1500 chars por archivo
              // (antes era 5000, lo que hacía el attachment gigantesco y reiniciaba la app)
              extractedEntries.push(`#### 📄 \`${relativePath}\`\n\`\`\`${lang}\n${finalContent.slice(0, 1500)}\n\`\`\``);
              totalTextBytes += finalContent.length;
              filesExtracted++;
            }
          } catch (e) {
            console.warn(`Could not read text from ${relativePath}:`, e);
          }
        }
      }

      // Mensaje de resumen compacto (no incluir todos los contenidos — solo headers)
      const summaryText =
        extractedEntries.length > 0
          ? `### 📦 Paquete ZIP Extraído: \`${name}\`\n\n` +
            `**${filesExtracted} archivos de código legibles** procesados y añadidos al editor.\n\n` +
            extractedEntries.map((e) => e.split("\n")[0]).join("\n") + // Solo los headers, no el contenido completo
            (skippedFiles.length > 0
              ? `\n\n⚠️ **${skippedFiles.length} archivo(s) omitidos** por límite de memoria (máx ${MAX_FILES_TO_EXTRACT} archivos / ${(MAX_TOTAL_TEXT_BYTES / 1048576).toFixed(1)} MB totales). Los archivos que deciden el arranque (package.json, vite.config, index.html) siempre se incluyen.`
              : "")
          : `[Archivo ZIP: ${name} (${Math.round(size / 1024)} KB) - Contiene ${fileKeys.length} entradas binarias/compiladas]`;

      return {
        attachment: {
          id: attachmentId,
          name,
          size,
          type,
          isZip: true,
          unpackedFiles,
          extractedText: summaryText,
        },
        workspaceFiles,
      };
    } catch (zipErr) {
      console.error("Error reading ZIP:", zipErr);
    }
  }

  // Case 4: RTF Document
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const textSample = decoder.decode(bytes.slice(0, 200));
  if (name.endsWith(".rtf") || textSample.startsWith("{\\rtf")) {
    const fullRtf = decoder.decode(bytes);
    const cleanText = extractTextFromRtf(fullRtf);

    const rtfFileName = name.replace(/\.rtf$/i, ".md");
    workspaceFiles.push({
      id: "rtf-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      name: rtfFileName,
      path: rtfFileName,
      content: `# ${name}\n\n${cleanText}`,
      language: "markdown",
      size: cleanText.length,
      modified: false,
    });

    return {
      attachment: {
        id: attachmentId,
        name,
        size,
        type,
        extractedText: `### 📄 Documento RTF: \`${name}\`\n${cleanText}`,
      },
      workspaceFiles,
    };
  }

  // Case 5: PDF Document (extrae texto con pdf.js)
  if (name.toLowerCase().endsWith(".pdf") || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    try {
      const pdfText = await extractTextFromPdf(arrayBuffer);
      const clean = pdfText.trim();
      if (clean) {
        const pdfFileName = name.replace(/\.pdf$/i, ".md");
        workspaceFiles.push({
          id: "pdf-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
          name: pdfFileName,
          path: pdfFileName,
          content: `# ${name}\n\n${clean}`,
          language: "markdown",
          size: clean.length,
          modified: false,
        });
        return {
          attachment: {
            id: attachmentId,
            name,
            size,
            type,
            isPdf: true,
            extractedText: `### 📄 Documento PDF: \`${name}\`\n${clean.slice(0, 20000)}`,
          },
          workspaceFiles,
        };
      }
    } catch (err) {
      console.warn("Error al extraer texto del PDF:", err);
    }
  }

  // Case 6: Binary File (Legacy DOC, BIN, EXE, etc.) -> Prevent Dumping Diamonds into Editor!
  if (isBinary) {
    const readableStrings = extractReadableStrings(bytes);
    const summaryContent = `# Archivo Binario: ${name}\n\n- **Tamaño:** ${Math.round(size / 1024)} KB\n- **Tipo:** ${type}\n- **Estado:** Indexado por CerebroNico\n\n> *Nota: Este archivo contiene datos binarios compilados. CerebroNico ha extraído sus cadenas legibles sin volcar caracteres corruptos ni romper el editor.*\n\n${
      readableStrings.length > 0
        ? `## Cadenas y Metadatos Detectados:\n\`\`\`text\n${readableStrings.slice(0, 3000)}\n\`\`\``
        : ""
    }`;

    workspaceFiles.push({
      id: "bin-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      name,
      path: name,
      content: summaryContent,
      language: "markdown",
      size: summaryContent.length,
      modified: false,
    });

    return {
      attachment: {
        id: attachmentId,
        name,
        size,
        type,
        extractedText: `[Archivo binario: ${name} (${Math.round(size / 1024)} KB) indexado en el espacio de trabajo]`,
      },
      workspaceFiles,
    };
  }

  // Case 6: Standard Plain Text / Code File (UTF-8)
  const fullText = decoder.decode(bytes);
  const cleanText = fullText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  const lang = getLanguageForFileName(name);

  workspaceFiles.push({
    id: "file-" + Math.random().toString(36).slice(2, 8),
    name,
    path: name,
    content: cleanText,
    language: lang,
    size: cleanText.length,
    modified: false,
  });

  return {
    attachment: {
      id: attachmentId,
      name,
      size,
      type,
      extractedText: `### 📄 Archivo: \`${name}\`\n\`\`\`${lang}\n${cleanText.slice(0, 8000)}\n\`\`\``,
    },
    workspaceFiles,
  };
}
