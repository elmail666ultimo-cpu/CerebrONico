/**
 * contenedor.ts — CONTENEDOR / CREADOR / MODIFICADOR / REPRODUCTOR GENERAL (v8.0.2)
 * ================================================================================
 * Petición que originó este módulo: «un contenedor activo transmutable, que sea
 * capaz de recibir y entregar cualquier formato, y si es posible vídeo».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «ACTIVO Y TRANSMUTABLE»: QUÉ SIGNIFICA AQUÍ, EN SERIO
 * ─────────────────────────────────────────────────────────────────────────────
 * Un contenedor NO es una carpeta. Un contenedor que solo guarda bytes es un
 * disco duro con más marketing. «Activo» significa que, al recibir algo, lo
 * ENTIENDE y declara qué puede hacer con ello; «transmutable» significa que
 * puede convertirlo en otra cosa, y —esto es lo que separa a un contenedor
 * honesto de una demo— que DICE LO QUE SE PIERDE en el camino.
 *
 * Los cuatro roles, y en qué se diferencian:
 *
 *   CONTENEDOR     recibir cualquier formato y saber QUÉ es.
 *   CREADOR        producir algo que no venía de fuera (imagen, texto, vídeo).
 *   MODIFICADOR    cambiar lo recibido (recortar, recomprimir, reescribir).
 *   REPRODUCTOR    entregarlo en algo que el usuario pueda abrir o ver.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DECISIÓN DE DISEÑO QUE MÁS IMPORTA: NO CREER AL QUE DECLARA
 * ─────────────────────────────────────────────────────────────────────────────
 * Un archivo llega con dos pistas sobre lo que es: su nombre y su
 * `Content-Type`. Las dos MIENTEN con regularidad. El caso clásico que ya costó
 * un defecto en este proyecto: un proveedor de imágenes responde con
 * `content-type: application/json` y un cuerpo que es un JPEG perfecto; si te
 * crees la cabecera, tiras una imagen buena. Al revés es peor: un `.png` que en
 * realidad son 400 bytes de HTML de una página de error.
 *
 * Por eso la ÚNICA fuente de verdad aquí son los primeros bytes (firma mágica).
 * El nombre y el MIME declarado se conservan para poder DENUNCIAR la
 * discrepancia, no para decidir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HONESTIDAD SOBRE LOS MOTORES: NADA DE «SOPORTA TODO»
 * ─────────────────────────────────────────────────────────────────────────────
 * Este módulo sabe QUÉ conversiones existen y CUÁL DE ELLAS SE PUEDE HACER
 * AHORA MISM@. No promete lo que no puede cumplir: `rutaDeConversion()` acepta
 * la lista de motores realmente disponibles en la máquina y, si no hay ruta,
 * devuelve un `motivo` en prosa y `sugerencias`, no un error opaco.
 *
 * La enorme mayoría de lo que un usuario llama «convertir un formato» se reduce
 * a cuatro motores:
 *   · `js-puro`     — lo que ya hace src/engine/formatConverter.ts (JSON/YAML/TOML/CSV)
 *   · `ffmpeg`      — audio, vídeo, y el 90 % de las imágenes raras
 *   · `navegador`   — lo que el propio navegador decodifica sin ayuda (canvas, <video>, <audio>)
 *   · `red`         — proveedor externo (transcodificadores y generadores)
 * Si `ffmpeg` no está instalado, decir «convierto a MP4» es una mentira, y este
 * módulo se niega a decirla: devuelve la ruta que SÍ existe y explica qué falta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LÍMITE DE PURIDAD (guarda de Vite — regla del proyecto)
 * ─────────────────────────────────────────────────────────────────────────────
 * Este archivo es LÓGICA PURA: ni `fs`, ni `child_process`, ni `node:*`. Se
 * importa desde el navegador (para previsualizar y decidir en el cliente) y
 * desde el servidor (para lo mismo antes de tocar disco). Si algún día alguien
 * mete aquí un `import fs`, la guarda `cerebroNodeGuard` de vite.config.ts
 * revienta el bundle del navegador — y hará bien.
 */

// ============================================================
// Tipos base
// ============================================================

/** Los cuatro papeles del contenedor. Un formato puede servir para varios. */
export type Rol = "contenedor" | "creador" | "modificador" | "reproductor";

/** Grandes familias: agrupan por «qué se puede hacer con esto», no por MIME. */
export type Familia =
  | "texto"
  | "datos"
  | "codigo"
  | "documento"
  | "imagen"
  | "audio"
  | "video"
  | "paquete"
  | "desconocido";

/** Motores reales que ejecutan una conversión. Sin motor no hay conversión. */
export type Motor = "js-puro" | "ffmpeg" | "navegador" | "red";

export const MOTORES: Motor[] = ["js-puro", "ffmpeg", "navegador", "red"];

/**
 * Firma mágica: los bytes que identifican un formato sin preguntar.
 * `offset` existe porque no todos los formatos empiezan por su firma: MP4 pone
 * `ftyp` en el byte 4, y RIFF (WAV/AVI/WEBP) necesitan mirar el byte 8 para
 * distinguirse entre sí. Ignorar el offset es el error que hace que todos los
 * RIFF parezcan lo mismo.
 */
export interface FirmaMagica {
  /** Posición en la que debe empezar la firma. */
  offset: number;
  /** Bytes exactos esperados en esa posición. */
  bytes: number[];
  /** MIME resultante cuando la firma coincide. */
  mime: string;
  /** Identificador legible para el informe («JPEG», «ZIP», más abajo «MP4»). */
  etiqueta: string;
}

/** Formato que el contenedor conoce, con su papel y sus límites declarados. */
export interface DescriptorFormato {
  id: string;
  mime: string;
  extensiones: string[];
  familia: Familia;
  roles: Rol[];
  /** Firma mágica. Ausente = solo reconocible por nombre (caso honesto, no descuido). */
  firma?: FirmaMagica;
  /** Limitación real y verificable. Si no hay nada honesto que decir, no se pone. */
  nota?: string;
}

// ============================================================
// Catálogo de firmas mágicas
// ============================================================

const ascii = (s: string): number[] => s.split("").map((c) => c.charCodeAt(0));

/**
 * Firmas en el byte 0. El orden NO importa para la corrección (se comprueban
 * todas), pero sí para la lectura humana: de lo más específico a lo más general.
 */
const FIRMAS_BASE: FirmaMagica[] = [
  { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: "image/png", etiqueta: "PNG" },
  { offset: 0, bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg", etiqueta: "JPEG" },
  { offset: 0, bytes: ascii("GIF8"), mime: "image/gif", etiqueta: "GIF" },
  { offset: 0, bytes: ascii("%PDF"), mime: "application/pdf", etiqueta: "PDF" },
  { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04], mime: "application/zip", etiqueta: "ZIP" },
  { offset: 0, bytes: [0x50, 0x4b, 0x05, 0x06], mime: "application/zip", etiqueta: "ZIP (vacío)" },
  { offset: 0, bytes: [0x1f, 0x8b], mime: "application/gzip", etiqueta: "GZIP" },
  { offset: 0, bytes: ascii("BZh"), mime: "application/x-bzip2", etiqueta: "BZIP2" },
  { offset: 0, bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], mime: "application/x-xz", etiqueta: "XZ" },
  { offset: 0, bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], mime: "application/x-7z-compressed", etiqueta: "7Z" },
  { offset: 0, bytes: ascii("Rar!"), mime: "application/vnd.rar", etiqueta: "RAR" },
  // EBML: el contenedor de WebM y Matroska. Se distinguen por su DocType interno
  // (que aquí NO se parsea) → se declara como Matroska/WebM y se dice en la nota.
  { offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3], mime: "video/webm", etiqueta: "EBML (WebM/Matroska)" },
  { offset: 0, bytes: ascii("OggS"), mime: "audio/ogg", etiqueta: "OGG" },
  { offset: 0, bytes: ascii("fLaC"), mime: "audio/flac", etiqueta: "FLAC" },
  { offset: 0, bytes: ascii("ID3"), mime: "audio/mpeg", etiqueta: "MP3 (con etiqueta ID3)" },
  { offset: 0, bytes: ascii("SQLite format 3"), mime: "application/vnd.sqlite3", etiqueta: "SQLite" },
  { offset: 0, bytes: ascii("wOFF"), mime: "font/woff", etiqueta: "WOFF" },
  { offset: 0, bytes: ascii("wOF2"), mime: "font/woff2", etiqueta: "WOFF2" },
  { offset: 0, bytes: [0x00, 0x01, 0x00, 0x00], mime: "font/ttf", etiqueta: "TrueType" },
  { offset: 0, bytes: ascii("OTTO"), mime: "font/otf", etiqueta: "OpenType" },
  { offset: 0, bytes: [0x7f, 0x45, 0x4c, 0x46], mime: "application/x-elf", etiqueta: "ELF" },
  { offset: 0, bytes: ascii("MZ"), mime: "application/vnd.microsoft.portable-executable", etiqueta: "PE (exe/dll)" },
  { offset: 0, bytes: [0x00, 0x61, 0x73, 0x6d], mime: "application/wasm", etiqueta: "WebAssembly" },
  { offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00], mime: "image/tiff", etiqueta: "TIFF (little endian)" },
  { offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a], mime: "image/tiff", etiqueta: "TIFF (big endian)" },
  { offset: 0, bytes: ascii("BM"), mime: "image/bmp", etiqueta: "BMP" },
  { offset: 0, bytes: [0x00, 0x00, 0x01, 0x00], mime: "image/x-icon", etiqueta: "ICO" },
  { offset: 0, bytes: [0x00, 0x00, 0x02, 0x00], mime: "image/x-icon", etiqueta: "CUR" },
];

/** Firmas de bytes 8-12: solo tienen sentido si antes coincidió RIFF en el byte 0. */
const RAMAS_RIFF: Array<{ marca: string; mime: string; etiqueta: string }> = [
  { marca: "WEBP", mime: "image/webp", etiqueta: "RIFF/WEBP" },
  { marca: "WAVE", mime: "audio/wav", etiqueta: "RIFF/WAVE" },
  { marca: "AVI ", mime: "video/x-msvideo", etiqueta: "RIFF/AVI" },
  { marca: "ACON", mime: "image/x-icon", etiqueta: "RIFF/ANI" },
];

/**
 * Marcas de la caja `ftyp` (byte 8): la familia MP4/QuickTime/HEIC/AVIF. Todas
 * comparten envoltorio, así que la marca es lo ÚNICO que las distingue.
 */
const MARCAS_FTYP: Array<{ marcas: string[]; mime: string; etiqueta: string }> = [
  { marcas: ["avif", "avis"], mime: "image/avif", etiqueta: "AVIF" },
  { marcas: ["heic", "heix", "hevc", "hevx", "heim", "heis"], mime: "image/heic", etiqueta: "HEIC" },
  { marcas: ["mif1", "msf1"], mime: "image/heif", etiqueta: "HEIF" },
  { marcas: ["qt  "], mime: "video/quicktime", etiqueta: "QuickTime (MOV)" },
  { marcas: ["M4A ", "M4B "], mime: "audio/mp4", etiqueta: "M4A (audio MP4)" },
  { marcas: ["M4V ", "M4VH", "M4VP"], mime: "video/x-m4v", etiqueta: "M4V" },
  { marcas: ["3gp4", "3gp5", "3g2a"], mime: "video/3gpp", etiqueta: "3GPP" },
  { marcas: ["isom", "iso2", "mp41", "mp42", "avc1", "dash", "iso5", "iso6", "msdh"], mime: "video/mp4", etiqueta: "MP4" },
];

// ============================================================
// Catálogo de formatos
// ============================================================

const F_PNG: FirmaMagica = FIRMAS_BASE[0];
const F_JPEG: FirmaMagica = FIRMAS_BASE[1];
const F_GIF: FirmaMagica = FIRMAS_BASE[2];
const F_PDF: FirmaMagica = FIRMAS_BASE[3];
const F_ZIP: FirmaMagica = FIRMAS_BASE[4];
const F_WEBM: FirmaMagica = FIRMAS_BASE[10];
const F_OGG: FirmaMagica = FIRMAS_BASE[11];
const F_FLAC: FirmaMagica = FIRMAS_BASE[12];

/**
 * El catálogo. Cada entrada declara sus ROLES con intención: no todo vale para
 * todo. Un `.exe` se puede contener y entregar, pero no se «modifica» — y
 * fingir que sí es cómo se borran archivos por accidente.
 */
export const CATALOGO: DescriptorFormato[] = [
  // ---- texto y datos ----
  { id: "txt", mime: "text/plain", extensiones: ["txt", "log", "env", "gitignore"], familia: "texto", roles: ["contenedor", "modificador", "reproductor"] },
  { id: "md", mime: "text/markdown", extensiones: ["md", "markdown", "mdx"], familia: "documento", roles: ["contenedor", "modificador", "reproductor"] },
  { id: "json", mime: "application/json", extensiones: ["json", "jsonc", "jsonl", "ndjson", "geojson"], familia: "datos", roles: ["contenedor", "creador", "modificador", "reproductor"] },
  { id: "yaml", mime: "application/yaml", extensiones: ["yaml", "yml"], familia: "datos", roles: ["contenedor", "creador", "modificador", "reproductor"] },
  { id: "toml", mime: "application/toml", extensiones: ["toml"], familia: "datos", roles: ["contenedor", "creador", "modificador", "reproductor"] },
  { id: "csv", mime: "text/csv", extensiones: ["csv", "tsv"], familia: "datos", roles: ["contenedor", "creador", "modificador", "reproductor"] },
  { id: "xml", mime: "application/xml", extensiones: ["xml", "svg", "xhtml"], familia: "datos", roles: ["contenedor", "modificador", "reproductor"], nota: "SVG comparte extensión con XML: la firma no lo distingue, hay que mirar el contenido." },
  { id: "html", mime: "text/html", extensiones: ["html", "htm"], familia: "documento", roles: ["contenedor", "creador", "modificador", "reproductor"] },
  { id: "css", mime: "text/css", extensiones: ["css", "scss", "sass", "less"], familia: "texto", roles: ["contenedor", "modificador", "reproductor"] },
  { id: "codigo", mime: "text/plain", extensiones: ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "java", "c", "cpp", "cs", "rb", "php", "swift", "kt", "sh", "sql"], familia: "codigo", roles: ["contenedor", "modificador", "reproductor"], nota: "MIME `text/plain` a propósito: no existe un MIME honesto para código y inventárselo rompe visores." },
  { id: "sqlite", mime: "application/vnd.sqlite3", extensiones: ["sqlite", "db", "sqlite3"], familia: "datos", roles: ["contenedor", "reproductor"], firma: FIRMAS_BASE[14] },

  // ---- documentos ----
  { id: "pdf", mime: "application/pdf", extensiones: ["pdf"], familia: "documento", roles: ["contenedor", "modificador", "reproductor"], firma: F_PDF, nota: "Se puede contener, partir y recomprimir. NO se puede «editar el texto» sin un motor de PDF real: el PDF guarda glifos posicionados, no párrafos." },
  { id: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extensiones: ["docx", "doc", "odt", "rtf"], familia: "documento", roles: ["contenedor", "creador", "modificador", "reproductor"], nota: "Es un ZIP por dentro (firma PK). El nombre es lo único que dice que es Word: la firma no basta." },
  { id: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extensiones: ["xlsx", "xls", "ods"], familia: "datos", roles: ["contenedor", "creador", "modificador", "reproductor"], nota: "Igual que docx: ZIP por dentro." },
  { id: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", extensiones: ["pptx", "odp"], familia: "documento", roles: ["contenedor", "creador", "modificador", "reproductor"], nota: "Igual que docx: ZIP por dentro." },

  // ---- imagen ----
  { id: "png", mime: "image/png", extensiones: ["png"], familia: "imagen", roles: ["contenedor", "creador", "modificador", "reproductor"], firma: F_PNG },
  { id: "jpeg", mime: "image/jpeg", extensiones: ["jpg", "jpeg", "jpe"], familia: "imagen", roles: ["contenedor", "creador", "modificador", "reproductor"], firma: F_JPEG },
  { id: "gif", mime: "image/gif", extensiones: ["gif"], familia: "imagen", roles: ["contenedor", "creador", "modificador", "reproductor"], firma: F_GIF, nota: "Animado. Un canvas tiene UN fotograma: reencodar un GIF por canvas mata la animación. Le pasó al fondo de escritorio de este IDE." },
  { id: "webp", mime: "image/webp", extensiones: ["webp"], familia: "imagen", roles: ["contenedor", "creador", "modificador", "reproductor"] },
  { id: "avif", mime: "image/avif", extensiones: ["avif"], familia: "imagen", roles: ["contenedor", "modificador", "reproductor"] },
  { id: "heic", mime: "image/heic", extensiones: ["heic", "heif"], familia: "imagen", roles: ["contenedor", "modificador", "reproductor"], nota: "Formato de iPhone. Muchos navegadores NO lo decodifican: entregarlo tal cual a un <img> deja el hueco vacío." },
  { id: "bmp", mime: "image/bmp", extensiones: ["bmp"], familia: "imagen", roles: ["contenedor", "modificador", "reproductor"], firma: FIRMAS_BASE[25] },
  { id: "tiff", mime: "image/tiff", extensiones: ["tiff", "tif"], familia: "imagen", roles: ["contenedor", "modificador", "reproductor"] },
  { id: "ico", mime: "image/x-icon", extensiones: ["ico", "cur"], familia: "imagen", roles: ["contenedor", "creador", "modificador", "reproductor"] },

  // ---- audio ----
  { id: "wav", mime: "audio/wav", extensiones: ["wav"], familia: "audio", roles: ["contenedor", "creador", "modificador", "reproductor"], nota: "Sin comprimir: 1 minuto estéreo 44,1 kHz ≈ 10 MB. Para entregar a la web casi siempre quieres comprimirlo." },
  { id: "mp3", mime: "audio/mpeg", extensiones: ["mp3"], familia: "audio", roles: ["contenedor", "creador", "modificador", "reproductor"] },
  { id: "ogg", mime: "audio/ogg", extensiones: ["ogg", "oga", "opus"], familia: "audio", roles: ["contenedor", "creador", "modificador", "reproductor"], firma: F_OGG },
  { id: "flac", mime: "audio/flac", extensiones: ["flac"], familia: "audio", roles: ["contenedor", "creador", "modificador", "reproductor"], firma: F_FLAC, nota: "Sin pérdida y por eso pesado. Convertir FLAC→MP3 es una pérdida REAL y hay que declararla." },
  { id: "m4a", mime: "audio/mp4", extensiones: ["m4a", "aac"], familia: "audio", roles: ["contenedor", "creador", "modificador", "reproductor"] },

  // ---- vídeo ----
  { id: "mp4", mime: "video/mp4", extensiones: ["mp4", "m4v"], familia: "video", roles: ["contenedor", "creador", "modificador", "reproductor"], nota: "El formato de entrega por defecto: es el que más reproductores abren sin discusión." },
  { id: "webm", mime: "video/webm", extensiones: ["webm"], familia: "video", roles: ["contenedor", "creador", "modificador", "reproductor"], firma: F_WEBM, nota: "VP8/VP9/AV1 + Opus. Libre y muy compatible en navegador; peor en reproductores de escritorio antiguos." },
  { id: "mov", mime: "video/quicktime", extensiones: ["mov"], familia: "video", roles: ["contenedor", "modificador", "reproductor"], nota: "Contenedor de Apple. Comparte caja `ftyp` con MP4: la marca del byte 8 es lo único que los separa." },
  { id: "mkv", mime: "video/x-matroska", extensiones: ["mkv"], familia: "video", roles: ["contenedor", "modificador", "reproductor"], nota: "Puede llevar cualquier códec dentro. Que un reproductor abra el contenedor no implica que sepa decodificar lo que hay dentro." },
  // AVI tiene entrada PROPIA desde v8.0.2. Estaba metido como extensión de `mkv`,
  // y eso hacía que el grafo declarara una arista `avi→mp4` hacia un formato que
  // el catálogo no conocía: la prueba «toda arista une formatos del catálogo» lo
  // cazó. Un formato, una entrada — la misma regla de fuente única de siempre.
  { id: "avi", mime: "video/x-msvideo", extensiones: ["avi", "divx"], familia: "video", roles: ["contenedor", "modificador", "reproductor"], nota: "Contenedor antiguo. El navegador NO lo abre nunca tal cual: siempre hay que remultiplexar o recodificar a MP4/WebM." },

  // ---- paquetes ----
  { id: "zip", mime: "application/zip", extensiones: ["zip", "jar", "apk", "whl", "epub", "cn"], familia: "paquete", roles: ["contenedor", "creador", "modificador", "reproductor"], firma: F_ZIP, nota: "Aquí vive el `.cn` del IDE: un ZIP renombrado. Y también docx/xlsx/pptx, que son ZIP con reglas propias dentro." },
  { id: "tar", mime: "application/x-tar", extensiones: ["tar"], familia: "paquete", roles: ["contenedor", "creador", "modificador", "reproductor"] },
  { id: "gz", mime: "application/gzip", extensiones: ["gz", "tgz"], familia: "paquete", roles: ["contenedor", "creador", "modificador", "reproductor"] },
];

/** Índices para búsquedas rápidas. Se construyen una vez. */
const POR_EXTENSION = new Map<string, DescriptorFormato>();
const POR_ID = new Map<string, DescriptorFormato>();
for (const f of CATALOGO) {
  POR_ID.set(f.id, f);
  for (const e of f.extensiones) if (!POR_EXTENSION.has(e)) POR_EXTENSION.set(e, f);
}

export function formatoPorId(id: string): DescriptorFormato | null {
  return POR_ID.get(id) ?? null;
}

export function formatoPorExtension(nombreOExt: string): DescriptorFormato | null {
  const limpio = String(nombreOExt || "").toLowerCase().trim();
  const ext = limpio.includes(".") ? limpio.split(".").pop() || "" : limpio;
  return POR_EXTENSION.get(ext) ?? null;
}

// ============================================================
// Inspección: los bytes mandan
// ============================================================

/** Compara bytes sin lanzar: si el buffer es más corto, simplemente no coincide. */
function coincideEn(bytes: Uint8Array, firma: FirmaMagica): boolean {
  const fin = firma.offset + firma.bytes.length;
  if (bytes.length < fin) return false;
  for (let i = 0; i < firma.bytes.length; i++) {
    if (bytes[firma.offset + i] !== firma.bytes[i]) return false;
  }
  return true;
}

const leerAscii = (bytes: Uint8Array, desde: number, largo: number): string => {
  if (bytes.length < desde + largo) return "";
  let s = "";
  for (let i = 0; i < largo; i++) s += String.fromCharCode(bytes[desde + i]);
  return s;
};

/**
 * Identifica por firma mágica. Devuelve `null` cuando los bytes NO coinciden con
 * ninguna firma conocida — y eso NO es un fallo: es un texto plano, o un formato
 * que no está en el catálogo. Fingir un MIME aquí sería exactamente la mentira
 * que el módulo existe para impedir.
 */
export function identificarPorFirma(bytes: Uint8Array): { mime: string; etiqueta: string } | null {
  if (!bytes || bytes.length < 4) return null;

  for (const firma of FIRMAS_BASE) {
    if (coincideEn(bytes, firma)) return { mime: firma.mime, etiqueta: firma.etiqueta };
  }

  // RIFF: cuatro bytes no bastan, hay que mirar el byte 8.
  if (coincideEn(bytes, { offset: 0, bytes: ascii("RIFF"), mime: "", etiqueta: "" })) {
    const marca = leerAscii(bytes, 8, 4);
    const rama = RAMAS_RIFF.find((r) => r.marca === marca);
    if (rama) return { mime: rama.mime, etiqueta: rama.etiqueta };
    return { mime: "application/riff", etiqueta: `RIFF/${marca.trim() || "?"}` };
  }

  // ISO-BMFF: `ftyp` en el byte 4 y la marca real en el byte 8.
  if (leerAscii(bytes, 4, 4) === "ftyp") {
    const marca = leerAscii(bytes, 8, 4);
    const rama = MARCAS_FTYP.find((m) => m.marcas.includes(marca));
    if (rama) return { mime: rama.mime, etiqueta: rama.etiqueta };
    // Honestidad: se sabe que es de la familia MP4 pero NO cuál. Se dice así.
    return { mime: "video/mp4", etiqueta: `ISO-BMFF (marca «${marca.trim()}» no catalogada)` };
  }

  // MP3 sin etiqueta ID3: sincronía de trama. Menos fiable, se declara como tal.
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return { mime: "audio/mpeg", etiqueta: "MPEG audio (sincronía de trama, sin ID3)" };
  }

  return null;
}

export interface EntradaInspeccion {
  nombre: string;
  /** Primeros bytes. Con 32 basta para todo lo de aquí; más no aporta. */
  bytes?: Uint8Array | null;
  /** Lo que DECLARÓ el emisor. Se conserva para denunciar la discrepancia. */
  mimeDeclarado?: string | null;
}

export interface Inspeccion {
  nombre: string;
  /** Familia decidida por la evidencia, no por el nombre. */
  familia: Familia;
  /** MIME que se usará al ENTREGAR. */
  mime: string;
  mimeDeclarado?: string;
  /** Formato del catálogo, si se reconoció. `null` = honestamente desconocido. */
  formato: DescriptorFormato | null;
  /** Etiqueta de la firma mágica que coincidió. */
  firma: string | null;
  /**
   * Texto cuando la evidencia contradice al nombre o al MIME declarado.
   * `null` = no hay contradicción. NO es un error: es un aviso para el usuario.
   */
  discrepancia: string | null;
  roles: Rol[];
  notas: string[];
}

const EXTENSION_PISTA = new Set(CATALOGO.flatMap((f) => f.extensiones));

/**
 * Inspecciona una entrada y declara qué es, qué se puede hacer con ella y en qué
 * se contradice a sí misma. Es el primer paso de los cuatro roles.
 */
export function inspeccionar(entrada: EntradaInspeccion): Inspeccion {
  const nombre = String(entrada?.nombre || "sin-nombre");
  const notas: string[] = [];

  const porNombre = formatoPorExtension(nombre);
  const declarado = (entrada?.mimeDeclarado || "").trim() || undefined;
  const bytes = entrada?.bytes || null;

  let firmaInfo: { mime: string; etiqueta: string } | null = null;
  let hayBytes = false;
  if (bytes && bytes.length > 0) {
    hayBytes = true;
    firmaInfo = identificarPorFirma(bytes);
  }

  // La decisión, en orden de confianza: firma mágica > nombre > MIME declarado.
  let formato: DescriptorFormato | null = null;
  if (firmaInfo) {
    formato = CATALOGO.find((f) => f.mime === firmaInfo!.mime) ?? null;
    // Un ZIP puede ser docx/xlsx/pptx/cn: la firma no distingue y el nombre sí.
    if (firmaInfo.mime === "application/zip" && porNombre && porNombre.mime.includes("openxmlformats")) {
      formato = porNombre;
      notas.push("Es un ZIP por dentro: lo que lo hace documento es el nombre y su contenido interno, no la firma.");
    }
  }
  if (!formato) formato = porNombre;

  const mime = firmaInfo?.mime || formato?.mime || declarado || "application/octet-stream";
  const familia: Familia = formato?.familia ?? inferirFamilia(mime, nombre);
  const roles: Rol[] = formato?.roles ?? ["contenedor", "reproductor"];

  // ── Denuncia de discrepancias ────────────────────────────────────────────
  // Aquí es donde este módulo gana su sueldo. Un archivo que dice ser una cosa y
  // es otra es la causa de la mitad de los «¿por qué no se ve?» de un IDE.
  let discrepancia: string | null = null;

  // Los formatos que SON un ZIP por dentro y por diseño. Para ellos, que los
  // bytes digan «application/zip» y el nombre diga «docx» NO es una mentira: es
  // cómo funciona el formato. La primera versión de esta guarda se apoyaba en la
  // familia y no funcionaba, porque `docx` es familia `documento`, no `paquete`
  // — y el efecto era denunciar como «renombrado» todo documento de Office
  // legítimo. La prueba de `docx` lo cazó. Se enumera por ID, que es lo único
  // que no admite interpretación.
  const ES_ZIP_POR_DENTRO = new Set(["docx", "xlsx", "pptx", "zip"]);
  const zipLegitimo = !!porNombre && ES_ZIP_POR_DENTRO.has(porNombre.id) && firmaInfo?.mime === "application/zip";

  if (firmaInfo && declarado && firmaInfo.mime !== declarado) {
    discrepancia = `El emisor declara «${declarado}» pero los bytes son «${firmaInfo.mime}» (${firmaInfo.etiqueta}). Manda la firma.`;
  } else if (firmaInfo && porNombre && firmaInfo.mime !== porNombre.mime && !zipLegitimo) {
    discrepancia = `El nombre dice «${porNombre.id}» (${porNombre.mime}) pero los bytes son «${firmaInfo.mime}» (${firmaInfo.etiqueta}). Posible archivo renombrado o descarga corrupta.`;
  } else if (hayBytes && !firmaInfo && porNombre && porNombre.firma && porNombre.familia !== "texto") {
    discrepancia = `El nombre dice «${porNombre.id}» y su firma debería empezar por otros bytes: esto NO es un ${porNombre.id} real.`;
  } else if (firmaInfo && !porNombre) {
    const ext = nombre.includes(".") ? nombre.split(".").pop() : "";
    if (ext && !EXTENSION_PISTA.has(ext.toLowerCase())) {
      notas.push(`Extensión «.${ext}» fuera del catálogo: se entrega con el MIME deducido de la firma (${firmaInfo.mime}).`);
    }
  }

  if (!hayBytes) {
    notas.push("Sin bytes que inspeccionar: el tipo se dedujo SOLO del nombre o del MIME declarado, y eso no es prueba.");
  }
  if (formato?.nota) notas.push(formato.nota);

  return {
    nombre,
    familia,
    mime,
    mimeDeclarado: declarado,
    formato,
    firma: firmaInfo?.etiqueta ?? null,
    discrepancia,
    roles,
    notas,
  };
}

function inferirFamilia(mime: string, nombre: string): Familia {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "imagen";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("text/")) return "texto";
  if (/(zip|gzip|tar|x-7z|rar|bzip2|xz)/.test(m)) return "paquete";
  if (/(json|yaml|xml|csv|sqlite)/.test(m)) return "datos";
  if (m === "application/pdf") return "documento";
  // Sin firma y sin MIME creíble: se asume texto solo si el nombre lo sugiere.
  const ext = nombre.includes(".") ? (nombre.split(".").pop() || "").toLowerCase() : "";
  if (["txt", "md", "log", "ini", "env", "cfg", "conf"].includes(ext)) return "texto";
  return "desconocido";
}

// ============================================================
// Grafo de conversión: qué se puede transmutar, con qué motor y qué se pierde
// ============================================================

export interface Arista {
  desde: string;
  hacia: string;
  motor: Motor;
  /** Pérdidas CONCRETAS. Vacío = sin pérdida. No vale decir «algo se pierde». */
  perdidas: string[];
  nota?: string;
}

/**
 * Aristas del grafo. Solo las que existen de verdad, con el motor que las hace.
 *
 * Criterio para que una arista esté aquí: o la implementa código de este repo
 * (`js-puro`), o la implementa el NAVEGADOR sin dependencias (`navegador`), o la
 * implementa `ffmpeg`/un servicio (`ffmpeg`/`red`). Si no, no está — y
 * `rutaDeConversion` dirá que no hay ruta en lugar de intentarlo y fallar.
 */
export const ARISTAS: Arista[] = [
  // ---- datos y texto: las implementa el conversor que YA existe ----
  { desde: "json", hacia: "yaml", motor: "js-puro", perdidas: [] },
  { desde: "json", hacia: "toml", motor: "js-puro", perdidas: ["Los valores null no existen en TOML: se omiten."] },
  { desde: "json", hacia: "csv", motor: "js-puro", perdidas: ["CSV solo entiende tablas planas: lo anidado se aplana.", "CSV no tiene tipos: todo sale como texto."] },
  { desde: "yaml", hacia: "json", motor: "js-puro", perdidas: ["JSON no admite comentarios: se pierden todos.", "Se pierden anclas, alias y etiquetas."] },
  { desde: "yaml", hacia: "toml", motor: "js-puro", perdidas: ["Se pierden comentarios y anclas.", "Los valores null se omiten."] },
  { desde: "toml", hacia: "json", motor: "js-puro", perdidas: ["TOML no tiene nulos, así que no había ninguno que traer."] },
  { desde: "toml", hacia: "yaml", motor: "js-puro", perdidas: [] },
  { desde: "csv", hacia: "json", motor: "js-puro", perdidas: ["Todo entra como texto salvo que se active la inferencia de tipos, y entonces es una suposición, no un dato."] },
  { desde: "csv", hacia: "yaml", motor: "js-puro", perdidas: ["Todo entra como texto."] },
  { desde: "md", hacia: "html", motor: "js-puro", perdidas: ["El markdown se renderiza, pero los bloques de código quedan como HTML: volver atrás ya no recupera el original."] },
  { desde: "html", hacia: "txt", motor: "js-puro", perdidas: ["Todo el marcado, los enlaces y las imágenes.", "La estructura de encabezados se pierde (queda texto corrido)."] },

  // ---- imagen ----
  { desde: "png", hacia: "jpeg", motor: "navegador", perdidas: ["La transparencia se rellena de un color plano: el alfa se pierde.", "Recompresión con pérdida."] },
  { desde: "jpeg", hacia: "png", motor: "navegador", perdidas: [] },
  { desde: "png", hacia: "webp", motor: "navegador", perdidas: [] },
  { desde: "jpeg", hacia: "webp", motor: "navegador", perdidas: ["Recompresión con pérdida sobre algo que ya tenía pérdida: la generación que se pierde no se recupera."] },
  { desde: "webp", hacia: "png", motor: "navegador", perdidas: [] },
  { desde: "webp", hacia: "jpeg", motor: "navegador", perdidas: ["La transparencia se pierde."] },
  { desde: "bmp", hacia: "png", motor: "navegador", perdidas: [] },
  { desde: "ico", hacia: "png", motor: "navegador", perdidas: ["Solo se convierte el tamaño mayor del icono; los tamaños pequeños embebidos se descartan."] },
  { desde: "heic", hacia: "jpeg", motor: "ffmpeg", perdidas: ["Recompresión con pérdida."], nota: "Requiere ffmpeg con decodificador HEIC. Safari lo hace solo; Chrome no." },
  { desde: "tiff", hacia: "png", motor: "ffmpeg", perdidas: ["Un TIFF multipágina deja las páginas siguientes fuera si no se pide explícitamente."] },
  { desde: "avif", hacia: "jpeg", motor: "ffmpeg", perdidas: ["Recompresión con pérdida."] },
  { desde: "gif", hacia: "mp4", motor: "ffmpeg", perdidas: ["La paleta de 256 colores se abandona: el resultado ocupa menos y se ve mejor, pero ya no es un GIF."] },
  { desde: "gif", hacia: "webm", motor: "ffmpeg", perdidas: ["Se abandona la paleta; cambia el códec."] },

  // ---- audio ----
  { desde: "wav", hacia: "mp3", motor: "ffmpeg", perdidas: ["Compresión con pérdida a partir de un original sin pérdida: es irreversible."] },
  { desde: "flac", hacia: "mp3", motor: "ffmpeg", perdidas: ["Se abandona la ausencia de pérdida. Irreversible."] },
  { desde: "mp3", hacia: "wav", motor: "ffmpeg", perdidas: [], nota: "Aumentar el tamaño NO recupera calidad perdida: el WAV sonará igual, ocupando diez veces más." },
  { desde: "m4a", hacia: "mp3", motor: "ffmpeg", perdidas: ["Recompresión con pérdida."] },
  { desde: "ogg", hacia: "mp3", motor: "ffmpeg", perdidas: ["Recompresión con pérdida."] },

  // ---- vídeo ----
  { desde: "mov", hacia: "mp4", motor: "ffmpeg", perdidas: [], nota: "Normalmente solo cambia el envoltorio; si el códec de dentro no es compatible, hay que recodificar y entonces sí hay pérdida." },
  { desde: "mkv", hacia: "mp4", motor: "ffmpeg", perdidas: ["Pistas de subtítulos en formatos que MP4 no admite se pierden.", "Varias pistas de audio pueden quedar reducidas a la que se elija."] },
  { desde: "webm", hacia: "mp4", motor: "ffmpeg", perdidas: ["Se recodifica: generación de pérdida sobre un códec que ya la tenía."] },
  { desde: "mp4", hacia: "webm", motor: "ffmpeg", perdidas: ["Se recodifica.", "Algunos reproductores de escritorio antiguos no abren VP9."] },
  { desde: "avi", hacia: "mp4", motor: "ffmpeg", perdidas: ["Se recodifica.", "Puede ser necesario reescalar si la resolución no es par (MP4 con H.264 exige dimensiones pares)."] },
  { desde: "mp4", hacia: "gif", motor: "ffmpeg", perdidas: ["De millones de colores a 256.", "Sin audio: el GIF no lo admite.", "El archivo suele pesar MÁS que el vídeo del que sale."] },

  // ---- paquetes ----
  { desde: "zip", hacia: "tar", motor: "js-puro", perdidas: ["Los permisos POSIX y los enlaces simbólicos del ZIP no tienen equivalente directo en tar sin declararlos."] },
];

/** Índice de aristas por origen. */
const ARISTAS_POR_ORIGEN = new Map<string, Arista[]>();
for (const a of ARISTAS) {
  if (!ARISTAS_POR_ORIGEN.has(a.desde)) ARISTAS_POR_ORIGEN.set(a.desde, []);
  ARISTAS_POR_ORIGEN.get(a.desde)!.push(a);
}

export type ResultadoRuta =
  | { ok: true; pasos: Arista[]; perdidas: string[]; motores: Motor[]; saltos: number }
  | { ok: false; motivo: string; sugerencias: string[] };

/**
 * Busca la ruta más corta entre dos formatos usando SOLO los motores disponibles.
 *
 * Devuelve un rechazo con MOTIVO cuando no hay ruta, en vez de un `null` o una
 * excepción. Un contenedor honesto explica qué le falta; uno opaco dice «error».
 */
export function rutaDeConversion(desdeId: string, haciaId: string, disponibles: Motor[] = MOTORES): ResultadoRuta {
  const desde = String(desdeId || "").toLowerCase();
  const hacia = String(haciaId || "").toLowerCase();
  const motorOk = new Set(disponibles);

  if (!POR_ID.has(desde)) return { ok: false, motivo: `«${desdeId}» no está en el catálogo del contenedor.`, sugerencias: [] };
  if (!POR_ID.has(hacia)) return { ok: false, motivo: `«${haciaId}» no está en el catálogo del contenedor.`, sugerencias: [] };
  if (desde === hacia) return { ok: true, pasos: [], perdidas: [], motores: [], saltos: 0 };

  // BFS: el camino más corto es el que menos veces reencoda, y cada reencodado es
  // una generación de pérdida. La corrección aquí también es optimización.
  const cola: string[] = [desde];
  const anterior = new Map<string, Arista>();
  const visto = new Set<string>([desde]);

  while (cola.length) {
    const actual = cola.shift()!;
    for (const arista of ARISTAS_POR_ORIGEN.get(actual) || []) {
      if (!motorOk.has(arista.motor)) continue;
      if (visto.has(arista.hacia)) continue;
      visto.add(arista.hacia);
      anterior.set(arista.hacia, arista);
      if (arista.hacia === hacia) {
        // Reconstrucción del camino, del final hacia atrás.
        const pasos: Arista[] = [];
        let cursor = hacia;
        while (cursor !== desde) {
          const paso = anterior.get(cursor)!;
          pasos.unshift(paso);
          cursor = paso.desde;
        }
        return {
          ok: true,
          pasos,
          // Las pérdidas se ACUMULAN a lo largo de la cadena: es lo que de verdad
          // ve el usuario al final, no lo que pierde cada paso por separado.
          perdidas: pasos.flatMap((p) => p.perdidas),
          motores: [...new Set(pasos.map((p) => p.motor))],
          saltos: pasos.length,
        };
      }
      cola.push(arista.hacia);
    }
  }

  // Sin ruta: se explica qué falta de la forma más útil posible.
  const sugerencias: string[] = [];
  const tieneMotor = (m: Motor) => motorOk.has(m);
  const aristasDesde = ARISTAS_POR_ORIGEN.get(desde) || [];
  const aristasHacia = ARISTAS.filter((a) => a.hacia === hacia);

  if (aristasDesde.length === 0) {
    sugerencias.push(`Desde «${desde}» no hay ninguna conversión catalogada: sería una FUNCIÓN NUEVA, no una ruta.`);
  }
  const motoresQueFaltan = new Set<Motor>();
  for (const a of [...aristasDesde, ...aristasHacia]) if (!tieneMotor(a.motor)) motoresQueFaltan.add(a.motor);
  if (motoresQueFaltan.size) {
    sugerencias.push(`Faltan motores: ${[...motoresQueFaltan].join(", ")}. Con ellos instalados, la ruta aparecería sola.`);
  }
  if (!motoresQueFaltan.size) {
    sugerencias.push(`Con los motores disponibles no hay cadena que una «${desde}» con «${hacia}».`);
  }
  // Sugerencia de destino intermedio: casi siempre el problema es «no hay puente».
  const puentes = ARISTAS.filter((a) => a.desde === desde && motorOk.has(a.motor)).map((a) => a.hacia);
  if (puentes.length) sugerencias.push(`Desde «${desde}» SÍ se puede ir a: ${[...new Set(puentes)].join(", ")}.`);

  return { ok: false, motivo: `No hay ruta de «${desdeId}» a «${haciaId}» con lo que hay instalado.`, sugerencias };
}

// ============================================================
// Plan de entrega: los cuatro roles en una sola decisión
// ============================================================

export interface PlanDeEntrega {
  ok: boolean;
  /** MIME con el que se entregará (o null si no se puede). */
  mime: string | null;
  /** Pasos a ejecutar, en orden. */
  pasos: Arista[];
  /** Todo lo que se perderá, dicho por adelantado. */
  perdidas: string[];
  /** Motores que hay que invocar. */
  motores: Motor[];
  /** Lo que hay que decirle al usuario, en prosa. */
  explicacion: string;
}

/**
 * Decide cómo ENTREGAR una entrada inspeccionada en un formato pedido.
 *
 * Este es el corazón del «transmutable»: no basta con decir «sí se puede», hay
 * que decir QUÉ SE PIERDE antes de hacerlo, porque después ya es tarde.
 */
export function planDeEntrega(
  inspeccion: Inspeccion,
  destinoId: string,
  disponibles: Motor[] = MOTORES
): PlanDeEntrega {
  const origenId = inspeccion.formato?.id ?? null;

  if (!origenId) {
    return {
      ok: false,
      mime: null,
      pasos: [],
      perdidas: [],
      motores: [],
      explicacion: `No se reconoció el formato de «${inspeccion.nombre}»${inspeccion.firma ? ` (firma: ${inspeccion.firma})` : ""}, así que no se puede planear una conversión. Se puede contener y entregar tal cual con el MIME ${inspeccion.mime}.`,
    };
  }

  const destino = POR_ID.get(String(destinoId || "").toLowerCase());
  if (!destino) {
    return {
      ok: false,
      mime: null,
      pasos: [],
      perdidas: [],
      motores: [],
      explicacion: `El destino «${destinoId}» no está en el catálogo.`,
    };
  }

  const ruta = rutaDeConversion(origenId, destino.id, disponibles);
  if (!ruta.ok) {
    return {
      ok: false,
      mime: null,
      pasos: [],
      perdidas: [],
      motores: [],
      explicacion: [ruta.motivo, ...ruta.sugerencias].join(" "),
    };
  }

  const sinPaso = ruta.pasos.length === 0;
  const explicacion = sinPaso
    ? `«${inspeccion.nombre}» ya está en ${destino.id}: no hay nada que convertir.`
    : `De ${origenId} a ${destino.id} en ${ruta.saltos} paso(s) usando ${ruta.motores.join(" + ")}.${
        ruta.perdidas.length ? ` Se perderá: ${ruta.perdidas.join(" ")}` : " Sin pérdidas declaradas."
      }`;

  return {
    ok: true,
    mime: destino.mime,
    pasos: ruta.pasos,
    perdidas: ruta.perdidas,
    motores: ruta.motores,
    explicacion,
  };
}

// ============================================================
// Capacidades: qué puede hacer ESTE contenedor, aquí y ahora
// ============================================================

export interface Capacidades {
  motores: Motor[];
  /** Formatos que se pueden RECIBIR (familia → cuántos). */
  recibe: Record<string, number>;
  /** Formatos que se pueden CREAR desde cero (con los motores dados). */
  crea: string[];
  /** Formatos que se pueden ENTREGAR/abrir. */
  reproduce: string[];
  /** Pares origen→destino realmente posibles ahora mismo. */
  conversiones: number;
  /** Lo que NO se puede y por qué. Tan importante como lo anterior. */
  carencias: string[];
}

/**
 * Calcula las capacidades reales. Se le pasan los motores disponibles porque este
 * módulo no toca la máquina: quien pregunta (servidor, sandbox o navegador) sabe
 * qué tiene, y aquí solo se razona con ello.
 */
export function capacidades(disponibles: Motor[] = ["js-puro", "navegador"]): Capacidades {
  const motorOk = new Set(disponibles);

  const recibe: Record<string, number> = {};
  for (const f of CATALOGO) recibe[f.familia] = (recibe[f.familia] ?? 0) + 1;

  const crea = CATALOGO.filter((f) => f.roles.includes("creador") && (f.id === "json" || f.id === "yaml" || f.id === "toml" || f.id === "csv" || f.id === "png" || f.id === "jpeg" || f.id === "mp4" || f.id === "webm")).map((f) => f.id);
  const reproduce = CATALOGO.filter((f) => f.roles.includes("reproductor")).map((f) => f.id);

  let conversiones = 0;
  for (const a of ARISTAS) if (motorOk.has(a.motor)) conversiones++;

  const carencias: string[] = [];
  if (!motorOk.has("ffmpeg")) {
    carencias.push("Sin ffmpeg no hay NADA de audio ni de vídeo, ni las imágenes raras (HEIC, TIFF, AVIF). No es una degradación: es una ausencia completa.");
  }
  if (!motorOk.has("js-puro")) {
    carencias.push("Sin el conversor puro no hay JSON/YAML/TOML/CSV: el navegador solo no sabe hacerlo.");
  }
  if (!motorOk.has("red")) {
    carencias.push("Sin motor de red no hay CREACIÓN generativa (imagen o vídeo nuevos): solo transformación de lo que ya existe.");
  }
  if (!motorOk.has("navegador")) {
    carencias.push("Sin motor de navegador no hay conversión de imagen rápida ni previsualización de vídeo.");
  }
  // Esta frase es la que evita la promesa falsa más común del sector.
  if (!motorOk.has("ffmpeg") && !CATALOGO.some((f) => f.familia === "video" && f.roles.includes("creador") && motorOk.has("red"))) {
    carencias.push("CREAR VÍDEO desde cero necesita red (proveedor) o ffmpeg (composición local). Ninguno de los dos está disponible.");
  }

  return { motores: [...motorOk], recibe, crea, reproduce, conversiones, carencias };
}
