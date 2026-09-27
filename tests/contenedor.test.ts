/**
 * contenedor.test.ts — CONTENEDOR GLOBAL: RECONOCER, TRANSMUTAR, CREAR, REPRODUCIR
 * ================================================================================
 * Lo que se verifica aquí NO es «el módulo compila». Es que cumple las tres
 * promesas que lo justifican, y cada una con su caso difícil:
 *
 *   1. **LOS BYTES MANDAN.** Un `.png` que por dentro es ZIP se denuncia; un
 *      `Content-Type: application/json` con un JPEG dentro se corrige. Si esta
 *      prueba se cae, el contenedor está creyendo al que declara — y eso es la
 *      causa raíz de la mitad de los «¿por qué no se ve?».
 *   2. **NO HAY RUTA MÁGICA.** Cuando no se puede convertir, se devuelve MOTIVO y
 *      SUGERENCIAS. Se prueba explícitamente el caso `png → mp4`, que NO existe
 *      (componer imágenes en vídeo es CREAR, no convertir) y el caso `heic → jpeg`
 *      sin ffmpeg instalado.
 *   3. **NINGÚN PROVEEDOR SIN FUENTE.** Cada proveedor de vídeo declara URL
 *      oficial, fecha de verificación y límites. Y el que NO es gratis lo dice
 *      (`hf-video`): una lista que llama «gratis» a algo que cuesta es peor que
 *      no tener lista.
 */
import {
  CATALOGO,
  ARISTAS,
  MOTORES,
  identificarPorFirma,
  inspeccionar,
  rutaDeConversion,
  planDeEntrega,
  capacidades,
  formatoPorExtension,
  formatoPorId,
  type Motor,
} from "../src/engine/contenedor";
import {
  PROVEEDORES_VIDEO,
  estadoCadenaVideo,
  proveedoresDisponibles,
  esVideoPorFirma,
  recetaPresentacion,
  recetaRecorte,
  recetaConversionContenedor,
  recetaExtraerFotogramas,
  recetaEscalado,
  recetaMarcaDeAgua,
  lineaDeComando,
  planDeReproduccion,
  RECETAS_DISPONIBLES,
  REPRODUCIBLE_EN_NAVEGADOR,
} from "../src/engine/videoGen";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

/** Constructor de bytes legible: `B("GIF8")` o mezcla con números. */
const B = (...trozos: Array<string | number[]>): Uint8Array => {
  const out: number[] = [];
  for (const t of trozos) {
    if (typeof t === "string") for (const c of t) out.push(c.charCodeAt(0));
    else out.push(...t);
  }
  return new Uint8Array(out);
};

// ════════════════════════════════════════════════════════════════════════════
// 1 · LOS BYTES MANDAN
// ════════════════════════════════════════════════════════════════════════════
console.log("\n1) Reconocimiento por firma mágica (no por lo que declara)\n");

const CASOS: Array<[string, Uint8Array, string | null, string | null]> = [
  ["PNG", B([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "resto"), "image/png", "PNG"],
  ["JPEG", B([0xff, 0xd8, 0xff, 0xe0], "JFIF"), "image/jpeg", "JPEG"],
  ["GIF", B("GIF89a"), "image/gif", "GIF"],
  ["PDF", B("%PDF-1.7"), "application/pdf", "PDF"],
  ["ZIP", B([0x50, 0x4b, 0x03, 0x04], "x"), "application/zip", "ZIP"],
  ["GZIP", B([0x1f, 0x8b, 0x08], "x"), "application/gzip", "GZIP"],
  ["7Z", B([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]), "application/x-7z-compressed", "7Z"],
  ["EBML", B([0x1a, 0x45, 0xdf, 0xa3], "webm"), "video/webm", "EBML (WebM/Matroska)"],
  ["OGG", B("OggS", [0x00]), "audio/ogg", "OGG"],
  ["FLAC", B("fLaC"), "audio/flac", "FLAC"],
  ["MP3 con ID3", B("ID3", [0x03]), "audio/mpeg", "MP3 (con etiqueta ID3)"],
  ["SQLite", B("SQLite format 3", [0x00]), "application/vnd.sqlite3", "SQLite"],
  ["ELF", B([0x7f, 0x45, 0x4c, 0x46], [0x02]), "application/x-elf", "ELF"],
  ["WASM", B([0x00, 0x61, 0x73, 0x6d], [0x01]), "application/wasm", "WebAssembly"],
  // RIFF: cuatro bytes no bastan, hay que mirar el byte 8. Los tres comparten
  // firma inicial y solo la marca los separa — el error clásico.
  ["RIFF/WEBP", B("RIFF", [0, 0, 0, 0], "WEBP"), "image/webp", "RIFF/WEBP"],
  ["RIFF/WAVE", B("RIFF", [0, 0, 0, 0], "WAVE"), "audio/wav", "RIFF/WAVE"],
  ["RIFF/AVI", B("RIFF", [0, 0, 0, 0], "AVI "), "video/x-msvideo", "RIFF/AVI"],
  // ISO-BMFF: `ftyp` en el byte 4 y la marca real en el 8.
  ["MP4", B([0, 0, 0, 0x18], "ftyp", "isom", [0, 0, 0, 0]), "video/mp4", "MP4"],
  ["MP4 (avc1)", B([0, 0, 0, 0x18], "ftyp", "avc1"), "video/mp4", "MP4"],
  ["MOV", B([0, 0, 0, 0x14], "ftyp", "qt  "), "video/quicktime", "QuickTime (MOV)"],
  ["M4A", B([0, 0, 0, 0x14], "ftyp", "M4A "), "audio/mp4", "M4A (audio MP4)"],
  ["AVIF", B([0, 0, 0, 0x1c], "ftyp", "avif"), "image/avif", "AVIF"],
  ["HEIC", B([0, 0, 0, 0x18], "ftyp", "heic"), "image/heic", "HEIC"],
  ["3GP", B([0, 0, 0, 0x18], "ftyp", "3gp4"), "video/3gpp", "3GPP"],
];

for (const [nombre, bytes, mimeEsperado, etiquetaEsperada] of CASOS) {
  const r = identificarPorFirma(bytes);
  comprobar(`firma de ${nombre}`, r?.mime === mimeEsperado, `dio ${r?.mime ?? "null"} y se esperaba ${mimeEsperado}`);
  if (etiquetaEsperada) comprobar(`etiqueta legible de ${nombre}`, r?.etiqueta === etiquetaEsperada, `dio «${r?.etiqueta}»`);
}

// Honestidad: lo desconocido se declara desconocido, no se adivina.
comprobar("texto plano no tiene firma y se dice", identificarPorFirma(B("Hola, mundo. Esto es texto.")) === null);
comprobar("4 bytes o menos no bastan para firmar nada", identificarPorFirma(B([0x01, 0x02, 0x03])) === null);
comprobar("firma de MKV/WebM no catalogada se declara como ISO-BMFF o EBML", identificarPorFirma(B([0, 0, 0, 0x18], "ftyp", "zzzz"))?.etiqueta.includes("no catalogada") === true);
comprobar("MP3 sin ID3 se reconoce por sincronía y se declara esa debilidad", identificarPorFirma(B([0xff, 0xfb, 0x90, 0x00]))?.etiqueta.includes("sin ID3") === true);

// ════════════════════════════════════════════════════════════════════════════
// 2 · LA INSPECCIÓN DENUNCIA LAS CONTRADICCIONES
// ════════════════════════════════════════════════════════════════════════════
console.log("\n2) La inspección dice qué es, y en qué se contradice\n");

// Caso real del proyecto: un proveedor responde application/json con un JPEG dentro.
const mentiroso = inspeccionar({
  nombre: "respuesta.bin",
  bytes: B([0xff, 0xd8, 0xff, 0xe0], "JFIF", "…"),
  mimeDeclarado: "application/json",
});
comprobar("manda la firma, no el Content-Type", mentiroso.mime === "image/jpeg" && mentiroso.familia === "imagen");
comprobar("y la mentira queda DENUNCIADA", !!mentiroso.discrepancia && mentiroso.discrepancia.includes("application/json"));
comprobar("el MIME declarado se conserva para poder mostrarlo", mentiroso.mimeDeclarado === "application/json");
comprobar("la etiqueta de firma acompaña al informe", mentiroso.firma === "JPEG");

// Archivo renombrado: extensión de imagen, contenido de ZIP.
const renombrado = inspeccionar({ nombre: "foto.png", bytes: B([0x50, 0x4b, 0x03, 0x04], "x") });
comprobar("nombre y bytes que no cuadran se denuncian", !!renombrado.discrepancia && renombrado.discrepancia.includes("renombrado"));
comprobar("y se entrega con el MIME real", renombrado.mime === "application/zip");

// Extensión que promete firma y no la trae: el `.png` que son 400 bytes de HTML.
const falso = inspeccionar({ nombre: "captura.png", bytes: B("<html><body>404 no encontrado") });
comprobar("una extensión de imagen sin su firma se denuncia", !!falso.discrepancia && falso.discrepancia.includes("NO es un png real"));

// El caso legítimo que NO debe denunciarse: docx/xlsx son ZIP por dentro.
const docx = inspeccionar({ nombre: "informe.docx", bytes: B([0x50, 0x4b, 0x03, 0x04], "x") });
comprobar("un docx (ZIP por dentro) NO se marca como error", docx.discrepancia === null, String(docx.discrepancia));
comprobar("y se identifica como docx, no como zip suelto", docx.formato?.id === "docx");
comprobar("declarando por qué no basta la firma", docx.notas.some((n) => n.includes("ZIP por dentro")));

// Sin bytes: se deduce del nombre, y se dice que eso no es prueba.
const sinBytes = inspeccionar({ nombre: "video.mp4" });
comprobar("sin bytes se avisa de que no hay prueba", sinBytes.notas.some((n) => n.includes("no es prueba")));
comprobar("y aun así se propone una familia razonable", sinBytes.familia === "video");

// El catálogo tiene que ser coherente: ids únicos y roles declarados.
const ids = CATALOGO.map((f) => f.id);
comprobar("ids del catálogo únicos", new Set(ids).size === ids.length);
comprobar("todo formato declara al menos un rol", CATALOGO.every((f) => f.roles.length > 0 && f.roles.includes("contenedor")));
comprobar("toda familia es una de las declaradas", CATALOGO.every((f) => ["texto","datos","codigo","documento","imagen","audio","video","paquete"].includes(f.familia)));
comprobar("formatoPorExtension entiende «foto.JPG»", formatoPorExtension("foto.JPG")?.id === "jpeg");
comprobar("formatoPorExtension entiende «x.tar.gz»", formatoPorExtension("x.tar.gz")?.id === "gz");
comprobar("formatoPorId devuelve null si no existe", formatoPorId("inexistente") === null);

// ════════════════════════════════════════════════════════════════════════════
// 3 · TRANSMUTAR: RUTAS CON PÉRDIDAS DECLARADAS Y RECHAZOS CON MOTIVO
// ════════════════════════════════════════════════════════════════════════════
console.log("\n3) Transmutación: ruta, pérdidas y rechazo honesto\n");

const r1 = rutaDeConversion("json", "yaml");
comprobar("json→yaml existe y no pierde nada", r1.ok && r1.perdidas.length === 0, JSON.stringify(r1));

const r2 = rutaDeConversion("yaml", "json");
comprobar("yaml→json existe", r2.ok);
comprobar("y DECLARA que se pierden los comentarios", r2.ok && r2.perdidas.some((p) => p.includes("comentarios")));

const r3 = rutaDeConversion("json", "csv");
comprobar("json→csv declara el aplanado y la falta de tipos", r3.ok && r3.perdidas.length === 2, JSON.stringify(r3.ok ? r3.perdidas : []));

comprobar("mismo formato = cero pasos", (() => { const r = rutaDeConversion("png", "png"); return r.ok && r.saltos === 0; })());

// Cadena BFS de dos saltos: md→html→txt. Ninguna arista md→txt existe.
const r4 = rutaDeConversion("md", "txt");
comprobar("encuentra la cadena md→html→txt", r4.ok && r4.saltos === 2, JSON.stringify(r4.ok ? r4.pasos.map((p) => `${p.desde}→${p.hacia}`) : r4));
comprobar("y ACUMULA las pérdidas de los dos saltos", r4.ok && r4.perdidas.length === 3, String(r4.ok ? r4.perdidas.length : "n/a"));

// Sin ffmpeg no hay imagen «rara» — y hay que decirlo, no intentarlo y fallar.
const sinFfmpeg: Motor[] = ["js-puro", "navegador"];
const r5 = rutaDeConversion("heic", "jpeg", sinFfmpeg);
comprobar("heic→jpeg SIN ffmpeg se rechaza", !r5.ok);
comprobar("y el motivo nombra el motor que falta", !r5.ok && r5.sugerencias.some((s) => s.includes("ffmpeg")), JSON.stringify(!r5.ok ? r5.sugerencias : []));
comprobar("con ffmpeg la misma ruta SÍ existe", rutaDeConversion("heic", "jpeg", [...sinFfmpeg, "ffmpeg"]).ok);

// EL CASO QUE MÁS IMPORTA: convertir una imagen a vídeo NO es una conversión.
// Es CREACIÓN (composición), y el motor debe negarse a presentarlo como ruta.
const r6 = rutaDeConversion("png", "mp4", MOTORES);
comprobar("png→mp4 NO tiene ruta (es crear, no convertir)", !r6.ok, JSON.stringify(r6.ok ? r6.pasos : "ok inesperado"));
comprobar("y el rechazo explica qué sí se puede desde png", !r6.ok && r6.sugerencias.some((s) => s.includes("jpeg") || s.includes("webp")), JSON.stringify(!r6.ok ? r6.sugerencias : []));
comprobar("gif→mp4 SÍ tiene ruta (mismo medio, sí es conversión)", rutaDeConversion("gif", "mp4").ok);

// Formato fuera del catálogo: rechazo claro y sin excepción.
const r7 = rutaDeConversion("docx", "xps");
comprobar("destino desconocido se rechaza con motivo", !r7.ok && r7.motivo.includes("catálogo"));
comprobar("origen desconocido también", !rutaDeConversion("xps", "pdf").ok);

// Toda arista declara su motor y sus pérdidas de forma explícita.
comprobar("toda arista declara un motor válido", ARISTAS.every((a) => MOTORES.includes(a.motor)));
comprobar("toda arista declara pérdidas como lista (aunque esté vacía)", ARISTAS.every((a) => Array.isArray(a.perdidas)));
comprobar("toda arista une formatos que existen en el catálogo", ARISTAS.every((a) => ids.includes(a.desde) && ids.includes(a.hacia)), ARISTAS.filter((a) => !ids.includes(a.desde) || !ids.includes(a.hacia)).map((a) => `${a.desde}→${a.hacia}`).join(", "));

// ── Plan de entrega ─────────────────────────────────────────────────────────
const inspecPng = inspeccionar({ nombre: "logo.png", bytes: B([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) });
const p1 = planDeEntrega(inspecPng, "jpeg");
comprobar("el plan de entrega png→jpeg se puede", p1.ok && p1.mime === "image/jpeg");
comprobar("y AVISA de la pérdida de transparencia", p1.perdidas.some((x) => x.includes("transparencia")));
comprobar("la explicación es prosa, no un código de error", p1.explicacion.includes("transparencia") && !/[A-Z_]{6,}/.test(p1.explicacion));
comprobar("entregar en el mismo formato no requiere nada", planDeEntrega(inspecPng, "png").pasos.length === 0);

const p2 = planDeEntrega(inspeccionar({ nombre: "x.bin", bytes: B("texto suelto sin firma") }), "png");
comprobar("sin formato reconocido se rechaza pero se ofrece entregar tal cual", !p2.ok && p2.explicacion.includes("tal cual"));
comprobar("destino inexistente se rechaza", !planDeEntrega(inspecPng, "xps").ok);

// ── Capacidades: lo que NO se puede es tan importante como lo que sí ────────
const capBasica = capacidades(["js-puro", "navegador"]);
const capTotal = capacidades(MOTORES);
comprobar("sin ffmpeg se declara la ausencia completa de audio y vídeo", capBasica.carencias.some((c) => c.includes("ffmpeg")));
comprobar("y se dice que CREAR vídeo necesita red o ffmpeg", capBasica.carencias.some((c) => c.includes("CREAR VÍDEO")));
comprobar("con todos los motores ese hueco desaparece", !capTotal.carencias.some((c) => c.includes("CREAR VÍDEO")), JSON.stringify(capTotal.carencias));
comprobar("más motores = más conversiones disponibles", capTotal.conversiones > capBasica.conversiones, `${capBasica.conversiones} → ${capTotal.conversiones}`);
comprobar("con todos los motores, todas las aristas están disponibles", capTotal.conversiones === ARISTAS.length, `${capTotal.conversiones} vs ${ARISTAS.length}`);
comprobar("las capacidades cuentan lo que se recibe", (capTotal.recibe["video"] ?? 0) >= 4 && (capTotal.recibe["imagen"] ?? 0) >= 8);

// ════════════════════════════════════════════════════════════════════════════
// 4 · CREADOR DE VÍDEO: LA LISTA NO MIENTE
// ════════════════════════════════════════════════════════════════════════════
console.log("\n4) Proveedores de vídeo: ninguno sin fuente, y el que no es gratis lo dice\n");

comprobar("hay al menos 4 proveedores evaluados", PROVEEDORES_VIDEO.length >= 4, String(PROVEEDORES_VIDEO.length));
comprobar("NINGUNO sin URL oficial de fuente", PROVEEDORES_VIDEO.every((p) => /^https:\/\/.+\..+/.test(p.fuente)), PROVEEDORES_VIDEO.filter((p) => !/^https:/.test(p.fuente)).map((p) => p.id).join(", "));
comprobar("NINGUNO sin fecha de verificación", PROVEEDORES_VIDEO.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.verificadoEl)));
comprobar("NINGUNO sin declarar sus límites", PROVEEDORES_VIDEO.every((p) => p.limites.length > 10));
comprobar("NINGUNO sin decir si requiere clave", PROVEEDORES_VIDEO.every((p) => typeof p.requiereClave === "boolean"));
comprobar("los que requieren clave declaran la variable de entorno", PROVEEDORES_VIDEO.filter((p) => p.requiereClave).every((p) => /^[A-Z][A-Z0-9_]+$/.test(p.variableClave)));
comprobar("ids de proveedor únicos", new Set(PROVEEDORES_VIDEO.map((p) => p.id)).size === PROVEEDORES_VIDEO.length);
comprobar("todo proveedor declara su tipo", PROVEEDORES_VIDEO.every((p) => p.tipo === "generativo" || p.tipo === "composicion"));

// La prueba de honestidad que da sentido a la lista: HF se declara NO gratis.
const hf = PROVEEDORES_VIDEO.find((p) => p.id === "hf-video");
comprobar("Hugging Face está en la lista y marcado como NO gratis", !!hf && hf.gratis === false);
comprobar("y su nota explica la contradicción de las dos páginas oficiales", !!hf && hf.nota.includes("contradicen"));
comprobar("hay al menos una vía generativa gratuita (Pixazo/LTX)", PROVEEDORES_VIDEO.some((p) => p.tipo === "generativo" && p.gratis));
comprobar("y al menos una vía de composición (no generativa)", PROVEEDORES_VIDEO.some((p) => p.tipo === "composicion"));
comprobar("Pixazo declara su endpoint real", (PROVEEDORES_VIDEO.find((p) => p.id === "pixazo-ltx")?.endpoint ?? "").includes("gateway.pixazo.ai"));

// Con y sin clave: el estado tiene que ser distinto y decirlo.
const sinClaves = estadoCadenaVideo({});
comprobar("sin claves no hay ningún proveedor disponible", sinClaves.disponibles.length === 0);
comprobar("y se nombra la variable que falta, no un «error»", sinClaves.faltanClave.some((f) => f.variable === "PIXAZO_API_KEY"));
comprobar("el resumen dice que ffmpeg no necesita clave", sinClaves.resumen.includes("ffmpeg"));
const conClave = estadoCadenaVideo({ PIXAZO_API_KEY: "x" });
comprobar("con la clave de Pixazo aparece disponible", conClave.disponibles.includes("pixazo-ltx"));
comprobar("y HF sigue marcado como no gratuito aunque haya token", (() => { const e = estadoCadenaVideo({ HF_TOKEN: "x" }); return e.noGratis.some((n) => n.id === "hf-video"); })());
comprobar("proveedoresDisponibles filtra por entorno", proveedoresDisponibles({ JSON2VIDEO_API_KEY: "k" }).length === 1);

// ── La firma mágica también protege la salida generada ──────────────────────
comprobar("un MP4 real se reconoce como vídeo", esVideoPorFirma(B([0, 0, 0, 0x18], "ftyp", "isom")).si === true);
comprobar("y el MP4 declara su contenedor y MIME", esVideoPorFirma(B([0, 0, 0, 0x18], "ftyp", "isom")).mime === "video/mp4");
comprobar("un MOV se distingue de un MP4 por la marca", esVideoPorFirma(B([0, 0, 0, 0x14], "ftyp", "qt  ")).mime === "video/quicktime");
comprobar("WebM se reconoce por EBML", esVideoPorFirma(B([0x1a, 0x45, 0xdf, 0xa3], "x")).mime === "video/webm");
comprobar("AVI se reconoce por RIFF/AVI", esVideoPorFirma(B("RIFF", [0, 0, 0, 0], "AVI ")).si === true);
comprobar("un PNG NO pasa por vídeo", esVideoPorFirma(B([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "x")).si === false);
comprobar("basura de 20 bytes no pasa por vídeo", esVideoPorFirma(B("esto no es un video!")).si === false);
comprobar("un buffer corto no revienta", esVideoPorFirma(B([1, 2])).si === false);

// ════════════════════════════════════════════════════════════════════════════
// 5 · CARRIL A: LAS RECETAS DE FFMPEG SE DEVUELVEN, NO SE EJECUTAN
// ════════════════════════════════════════════════════════════════════════════
console.log("\n5) Recetas locales: se pueden leer antes de ejecutar\n");

const pres = recetaPresentacion({
  imagenes: ["a.png", "b.jpg", "c.webp"],
  segundosPorImagen: 4,
  audio: "musica.mp3",
  subtitulos: "subs/es.srt",
  salida: "salida.mp4",
});
comprobar("la receta declara que necesita ffmpeg", pres.requiere === "ffmpeg");
comprobar("construye la cadena de filtros", pres.argumentos.includes("-filter_complex"));
comprobar("escala y recorta cada imagen al lienzo", pres.argumentos.some((a) => a.includes("force_original_aspect_ratio=increase") && a.includes("crop=")));
comprobar("concatena todas las imágenes", pres.argumentos.some((a) => a.includes("concat=n=3:v=1:a=0")));
comprobar("AVISA de que el recorte pierde los bordes", pres.avisos.some((a) => a.includes("bordes") || a.includes("crop")));
comprobar("AVISA de que los subtítulos se queman", pres.avisos.some((a) => a.includes("QUEMAN")));
comprobar("produce MP4 con faststart (clave para reproducir en web)", pres.argumentos.includes("+faststart") && pres.argumentos.includes("libx264"));
comprobar("mapea el audio cuando lo hay", pres.argumentos.includes("-shortest"));

// El escapado de la ruta de subtítulos: en Windows la «:» rompe el filtro.
const presWin = recetaPresentacion({ imagenes: ["a.png"], segundosPorImagen: 1, subtitulos: "C:\\mis subs\\es.srt", salida: "o.mp4" });
comprobar("la ruta de subtítulos se escapa (barras y dos puntos)", presWin.argumentos.some((a) => a.includes("subtitles='C\\:/mis subs/es.srt'")), presWin.argumentos.find((a) => a.includes("subtitles")));

const presGif = recetaPresentacion({ imagenes: ["a.png"], segundosPorImagen: 2, salida: "o.gif" });
comprobar("el GIF se detecta por la extensión de salida", presGif.avisos.some((a) => a.includes("256 colores")));
comprobar("y avisa de que pesa más que el MP4", presGif.avisos.some((a) => a.includes("pesar MÁS que el MP4")));
comprobar("sin imágenes, la receta lo dice", recetaPresentacion({ imagenes: [], segundosPorImagen: 3, salida: "x.mp4" }).avisos.some((a) => a.includes("Sin imágenes")));

const rec = recetaRecorte("in.mp4", "out.mp4", 10, 25);
comprobar("el recorte calcula la duración", rec.queHace.includes("15.00s"));
comprobar("y usa copia de flujo (sin recodificar)", rec.argumentos.includes("copy"));
comprobar("explicando que corta en fotograma clave", rec.avisos.some((a) => a.includes("fotograma clave")));
comprobar("un recorte imposible se avisa", recetaRecorte("a.mp4", "b.mp4", 30, 10).avisos.some((a) => a.includes("nada que recortar")));

comprobar("la conversión de contenedor copia flujos", recetaConversionContenedor("a.mkv", "b.mp4").argumentos.includes("copy"));
comprobar("y avisa de que puede fallar por códec incompatible", recetaConversionContenedor("a.mkv", "b.mp4").avisos.some((a) => a.includes("FALLA")));
comprobar("extraer fotogramas exige patrón con contador", recetaExtraerFotogramas("a.mp4", "f%03d.png", 2).avisos.some((a) => a.includes("%03d")));
comprobar("el escalado avisa de que reducir es irreversible", recetaEscalado("a.mp4", "b.mp4", 1280, 720).avisos.some((a) => a.includes("irreversible")));
comprobar("el escalado avisa de que ampliar no aporta detalle", recetaEscalado("a.mp4", "b.mp4", 3840, 2160).avisos.some((a) => a.includes("interpola")));
comprobar("la marca de agua avisa de que recodifica", recetaMarcaDeAgua("a.mp4", "b.mp4", "logo.png").avisos.some((a) => a.includes("RECODIFICA")));
comprobar("las 6 recetas están declaradas", RECETAS_DISPONIBLES.length === 6);
comprobar("ninguna receta se ejecuta por su cuenta (no hay binario en los argumentos)", [pres, rec, recetaEscalado("a", "b", 1, 1)].every((r) => !r.argumentos.includes("ffmpeg")));

const cmd = lineaDeComando(recetaRecorte("mi video.mp4", "salida final.mp4", 0, 5));
comprobar("la línea de comando empieza por ffmpeg", cmd.startsWith("ffmpeg "));
comprobar("y entrecomilla las rutas con espacios", cmd.includes('"mi video.mp4"') && cmd.includes('"salida final.mp4"'), cmd);

// ════════════════════════════════════════════════════════════════════════════
// 6 · REPRODUCTOR: SI NO SE PUEDE ABRIR, SE PROPONE LA CONVERSIÓN
// ════════════════════════════════════════════════════════════════════════════
console.log("\n6) Reproductor: qué abre el navegador y qué no\n");

comprobar("MP4 se reproduce directo", planDeReproduccion("mp4").sePuede && planDeReproduccion("mp4").via === "directo");
comprobar("WebM también", planDeReproduccion("webm").sePuede);
comprobar("MKV NO, y lo dice con su motivo", !planDeReproduccion("mkv").sePuede && planDeReproduccion("mkv").explicacion.includes("NO"));
comprobar("y propone la ruta concreta (mkv → webm)", planDeReproduccion("mkv").explicacion.includes("webm"));
comprobar("AVI tampoco", !planDeReproduccion("avi").sePuede && planDeReproduccion("avi").via === "transcodificar");
comprobar("un formato sin declarar se rechaza explícitamente", !planDeReproduccion("xps").sePuede);
comprobar("GIF se anima pero sin audio", planDeReproduccion("gif").sePuede && REPRODUCIBLE_EN_NAVEGADOR.gif.audio === false);
comprobar("todo formato declarado como reproducible tiene su entrada", Object.keys(REPRODUCIBLE_EN_NAVEGADOR).every((k) => typeof REPRODUCIBLE_EN_NAVEGADOR[k].video === "boolean"));

console.log(`\n═══ CONTENEDOR GENERAL (v8.0.2): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
