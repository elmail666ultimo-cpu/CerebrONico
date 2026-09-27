/**
 * fondo.ts — FONDO v1: fondo animado (GIF / MP4 / WebM de 4–8 s) para la IDE
 * ==========================================================================
 * El fondo en movimiento es la ÚNICA concesión GPU/CPU del proyecto, así que
 * llega con cadenas puestas:
 *   · el archivo vive en el PROYECTO (no en localStorage: ahí un binario sería
 *     un error con corona);
 *   · se copia a .cerebro-db/fondo.<ext> y se SIRVE en streaming — el motor no
 *     lo tiene en RAM, el navegador decodifica con su aceleración de vídeo;
 *   · dos escalas, y conviene no confundirlas: AVISO (gif 4 MB · mp4/webm 8 MB)
 *     es un consejo de rendimiento, y TECHO DURO (100 MB, 128 en vídeo) es donde
 *     de verdad deja de funcionar. Un archivo entre ambas cifras entra, avisando;
 *   · `prefers-reduced-motion`: la capa se OCULTA y los velillos revierten.
 *     Quien pidió calma la tiene de verdad, no a medias.
 * El truco de visibilidad sin tocar el JSX: la capa vive a z-index:-1 y el
 * body con la clase cn-fondo-activo vuelve SEMITRANSPARENTELES los fondos de
 * las secciones enganchadas por ASPECTO (data-cn) — velillos de 84–88 % de
 * opacidad: el texto se lee igual, el movimiento se ve detrás. Los ganchos de
 * una entrega anterior resultan ser también el esqueleto de esta: eso es
 * componer.
 */

// v1.1 — la foto fija también es fondo (el default del producto es un .jpg):
// el navegador la pinta sin decodificar nada; el límite de peso sigue mandando.
export const TIPOS_FONDO = { gif: "image/gif", mp4: "video/mp4", webm: "video/webm", jpg: "image/jpeg", jpeg: "image/jpeg" } as const;
export type TipoFondo = keyof typeof TIPOS_FONDO;

/**
 * AVISO desde aquí. Los números no cambian; el SIGNIFICADO sí.
 *
 * Antes eran una aduana: un GIF de 6 MB se rechazaba con un `alert` y no había
 * forma de ponerlo. El caso real: «no pude colocar un gif, me dice que solo
 * admite hasta 4 MB».
 *
 * 4 MB de GIF y 8 MB de vídeo siguen siendo el umbral sensato —por encima de
 * eso el coste por repintado se nota— pero es un CONSEJO, no una prohibición.
 * Quien tiene la máquina delante es el usuario, no esta constante.
 */
export const LIMITES_BYTES: Record<TipoFondo, number> = {
  gif: 4 * 1024 * 1024,
  mp4: 8 * 1024 * 1024,
  webm: 8 * 1024 * 1024,
  jpg: 4 * 1024 * 1024,
  jpeg: 4 * 1024 * 1024,
};

/**
 * TECHO DURO: por encima de esto se rechaza, y no por gusto.
 *
 * v1.7.1 — DE 48/32 MB A **100 MB**, Y NO POR SUBIR UN NÚMERO.
 *
 * Aquí estaba escrito el motivo real del techo: el fondo viajaba como data URL
 * (base64, +33 %) hasta IndexedDB, y un archivo desmedido reventaba la
 * escritura. Es decir, el límite NO lo ponía el disco: lo ponía el transporte.
 * Subir el número sin cambiar el transporte habría sido prometer 100 MB y fallar
 * a los 40 — el peor tipo de límite, el que miente.
 *
 * Lo que cambió: el fondo se guarda ahora como BLOB en IndexedDB
 * (`indexedDBStorage.ts`), sin base64 y sin una cadena de 133 millones de
 * caracteres en memoria. Con eso, 100 MB es una cifra que se sostiene:
 *   · GIF y foto fija: 100 MB (antes 48 y 32).
 *   · MP4/WebM: 128 MB — ya estaba por encima, y «aumentar» no puede significar
 *     bajar. La promesa que se puede hacer es «soporta 100 MB en todos los
 *     formatos», y en vídeo es incluso más.
 *
 * El AVISO (4 MB gif · 8 MB vídeo · 4 MB foto) sigue donde estaba: eso no es un
 * límite, es un consejo de rendimiento, y quien tiene la máquina delante eres tú.
 */
export const TECHO_DURO_BYTES: Record<TipoFondo, number> = {
  gif: 100 * 1048576,
  mp4: 128 * 1048576,
  webm: 128 * 1048576,
  jpg: 100 * 1048576,
  jpeg: 100 * 1048576,
};

/** La foto fija de «Imagen propia» (PNG/JPG/WEBP), que no pasa por TIPOS_FONDO. */
export const AVISO_IMAGEN_BYTES = 4 * 1048576;
export const TECHO_IMAGEN_BYTES = 100 * 1048576;

/**
 * MARCA DE FONDO EN INDEXEDDB (v1.7.1).
 *
 * El selector de «imagen propia» de la configuración guardaba el data URL
 * completo dentro de las PREFERENCIAS, y las preferencias viven en localStorage:
 * ~5 MB y, al pasarse, escritura perdida en silencio. Una imagen de 100 MB ahí
 * es imposible, así que a partir de un tamaño esa imagen no se guardaba y el
 * usuario no se enteraba.
 *
 * Ahora la imagen grande va a IndexedDB (blob) y en las preferencias queda SOLO
 * esta marca corta. Una imagen, un sitio. `AppBackground` ignora la marca en CSS
 * (una URL «cn-idb:fondo» no pinta nada) y usa la imagen real, que App carga de
 * IndexedDB y pasa con prioridad.
 */
export const MARCA_FONDO_IDB = "cn-idb:fondo";

/**
 * A partir de aquí, la imagen de «Imagen propia» NO va a las preferencias.
 *
 * Las preferencias viven en localStorage: ~5 MB de tope y, al pasarse, la
 * escritura se pierde en silencio (deuda conocida del proyecto). Un data URL
 * pesa un 33 % más que el archivo, así que el umbral se pone en 1 MB de archivo
 * —bien por debajo del tope— para que la marca corta ocupe el sitio y la imagen
 * vaya a IndexedDB. Por debajo del umbral se mantiene el camino antiguo, que ya
 * funciona y no hay razón para tocar.
 */
export const UMBRAL_IMAGEN_EN_PREFERENCIAS_BYTES = 1 * 1048576;

export type NivelPeso = "ok" | "aviso" | "rechazo";

function nivel(bytes: number, avisoDesde: number, techoDuro: number): NivelPeso {
  if (!Number.isFinite(bytes) || bytes <= 0) return "ok";
  if (bytes > techoDuro) return "rechazo";
  return bytes > avisoDesde ? "aviso" : "ok";
}

/** ¿Se puede usar este fondo animado, con aviso o no? */
export function evaluarPesoAnimado(tipo: TipoFondo, bytes: number): NivelPeso {
  return nivel(bytes, LIMITES_BYTES[tipo], TECHO_DURO_BYTES[tipo]);
}

/** ¿Se puede usar esta foto fija, con aviso o no? */
export function evaluarPesoImagen(bytes: number): NivelPeso {
  return nivel(bytes, AVISO_IMAGEN_BYTES, TECHO_IMAGEN_BYTES);
}

const enMB = (b: number) => (b / 1048576).toFixed(1);

/** El texto que ve el usuario. Es un aviso: explica el coste y deja decidir. */
export function mensajePesoAnimado(tipo: TipoFondo, bytes: number): string {
  const nivelActual = evaluarPesoAnimado(tipo, bytes);
  const recomendado = Math.round(LIMITES_BYTES[tipo] / 1048576);
  if (nivelActual === "rechazo") {
    return (
      `Ese archivo pesa ${enMB(bytes)} MB y el máximo que se puede manejar es ` +
      `${Math.round(TECHO_DURO_BYTES[tipo] / 1048576)} MB (a partir de ahí la escritura del fondo falla).\n\n` +
      `Recórtalo, bájale los fotogramas o pásalo a MP4/WebM, que para el mismo movimiento pesa una fracción.`
    );
  }
  return (
    `Este fondo pesa ${enMB(bytes)} MB, por encima de los ${recomendado} MB recomendados.\n\n` +
    `Se puede poner igual — tú sabes qué máquina tienes —, pero un fondo grande castiga el repintado ` +
    `y con pocos recursos se nota. Si va lento, pásalo a MP4/WebM.`
  );
}

export function mensajePesoImagen(bytes: number): string {
  const nivelActual = evaluarPesoImagen(bytes);
  const recomendado = Math.round(AVISO_IMAGEN_BYTES / 1048576);
  if (nivelActual === "rechazo") {
    return (
      `Esa imagen pesa ${enMB(bytes)} MB y el máximo que se puede guardar es ` +
      `${Math.round(TECHO_IMAGEN_BYTES / 1048576)} MB. Reduce su resolución o comprímela.`
    );
  }
  return (
    `Esta imagen pesa ${enMB(bytes)} MB, por encima de los ${recomendado} MB recomendados.\n\n` +
    `Se guarda localmente en tu navegador, así que el aviso es por peso en disco, no por subida a ningún servidor.`
  );
}

/** Extensión de fondo o null: gif/mp4/webm, sin acentos de humor. */
export function tipoDeArchivo(ruta: string): TipoFondo | null {
  const m = /\.([a-z0-9]+)$/i.exec(String(ruta || ""));
  const ext = m ? m[1].toLowerCase() : "";
  return ext in TIPOS_FONDO ? (ext as TipoFondo) : null;
}

/** ¿rutaAbs está dentro de rootAbs? (contención del proyecto, sin sorpresas). */
export function dentroDe(rootAbs: string, rutaAbs: string): boolean {
  const r = rootAbs.endsWith("/") || rootAbs.endsWith("\\") ? rootAbs : rootAbs + "/";
  return rutaAbs === rootAbs || rutaAbs.startsWith(r.replace(/\\/g, "/")) || rutaAbs.startsWith(r);
}

/**
 * Validar la petición {ruta}. Devuelve SIEMPRE motivos completos: si el
 * usuario escribe «wallpaper.png» merece saber que png no es animable y qué
 * sí lo es, no un 400 mudo.
 */
export function validarFondo(bruto: unknown): { ok: true; ruta: string } | { ok: false; motivos: string[] } {
  const motivos: string[] = [];
  const o = (bruto || {}) as { ruta?: unknown };
  if (typeof o.ruta !== "string" || !o.ruta.trim()) motivos.push("falta «ruta» (archivo del proyecto, p. ej. «assets/fondo.mp4»).");
  const ruta = String(o.ruta || "").trim().replace(/\\/g, "/");
  if (ruta && /^([a-zA-Z]:)?\//.test(ruta)) motivos.push("la ruta debe ser RELATIVA al proyecto (sin «/» inicial ni letras de unidad).");
  if (ruta && ruta.split("/").some((s) => s === "..")) motivos.push("«..» no: el fondo vive dentro del proyecto, como todo.");
  if (ruta && !tipoDeArchivo(ruta))
    motivos.push(
      `«${ruta}» no es fondo animable; se aceptan .gif (aviso desde 4 MB), .mp4 y .webm (aviso desde 8 MB). ` +
        `El techo duro es 100 MB (128 MB en vídeo).`
    );
  if (motivos.length) return { ok: false, motivos };
  return { ok: true, ruta };
}

/** El registro de lo activado (JSON en .cerebro-db/fondo.json). */
export function metaDeFondo(rutaRel: string, tipo: TipoFondo, bytes: number, activadoEn: string) {
  return { activado: true as const, ruta: rutaRel, tipo, mime: TIPOS_FONDO[tipo], bytes, seg_sugeridas: "4–8", activadoEn };
}

/** Cuánto pesan los límites, en el idioma del usuario. */
export function limiteLegible(tipo: TipoFondo): string {
  return Math.round(LIMITES_BYTES[tipo] / (1024 * 1024)) + " MB";
}

/**
 * La hoja de la capa + los velillos. Las reglas van SIN !important: la hoja se
 * inyecta después de la de Tailwind y el empate de especificidad lo gana el
 * orden — la misma lección de ASPECTO. En prefers-reduced-motion todo revierte
 * a su valor de cascada normal y la capa desaparece: el fondo animado es
 * adorno, y los adornos se quitan del medio, no se hacen medio-nota.
 */
export function hojaFondoCss(): string {
  return `
/* FONDO v1 — la capa y sus velillos */
.cn-fondo-capa { position: fixed; inset: 0; z-index: -1; overflow: hidden; background: #03060c; }
.cn-fondo-capa img, .cn-fondo-capa video { width: 100%; height: 100%; object-fit: cover; opacity: .45; filter: saturate(.85); }
body.cn-fondo-activo [data-cn="cabecera"]   { background-color: rgba(3,6,12,.90); }
body.cn-fondo-activo [data-cn="chat"]       { background-color: rgba(0,0,0,.86); }
body.cn-fondo-activo [data-cn="editor"]     { background-color: rgba(10,14,23,.90); }
body.cn-fondo-activo [data-cn="explorador"] { background-color: rgba(3,5,10,.88); }
body.cn-fondo-activo [data-cn="paneles"]    { background-color: rgba(0,0,0,.88); }
@media (prefers-reduced-motion: reduce) {
  .cn-fondo-capa { display: none; }
  body.cn-fondo-activo [data-cn="cabecera"]   { background-color: revert; }
  body.cn-fondo-activo [data-cn="chat"]       { background-color: revert; }
  body.cn-fondo-activo [data-cn="editor"]     { background-color: revert; }
  body.cn-fondo-activo [data-cn="explorador"] { background-color: revert; }
  body.cn-fondo-activo [data-cn="paneles"]    { background-color: revert; }
}
`;
}
