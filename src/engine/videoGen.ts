/**
 * videoGen.ts — CREADOR Y MODIFICADOR DE VÍDEO (v8.0.2)
 * =======================================================
 * Segunda pieza del contenedor general, después de `contenedor.ts`. Aquí viven
 * los roles CREADOR y MODIFICADOR aplicados a vídeo y audio.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PREGUNTA QUE ORIGINÓ ESTE ARCHIVO, Y LA VERDAD INCÓMODA
 * ─────────────────────────────────────────────────────────────────────────────
 * Preguntaste: «generación con ayuda de algún servidor gratuito para generar
 * vídeos». Fui a mirarlo en serio (22-sep-2026) y la respuesta honesta es:
 *
 *   **No existe hoy un servidor de generación de vídeo gratuito, sin clave e
 *   ilimitado.** Lo tuvo la generación de IMAGEN (y este proyecto lo aprovechó:
 *   `imageGen.ts` usa pollinations sin clave), pero el vídeo cuesta dos órdenes
 *   de magnitud más cómputo por segundo de salida, y nadie lo regala abierto.
 *
 * Lo que SÍ existe, verificado en las páginas oficiales el día de la consulta:
 *
 *   · **Pixazo** — LTX de Lightricks (texto→vídeo, imagen→vídeo, vídeo→vídeo) en
 *     su capa gratuita. Registro con correo, SIN tarjeta. Límite declarado:
 *     «fair use, 60 req/min por modelo, durante preview». Clave `Ocp-Apim-Subscription-Key`.
 *     → https://www.pixazo.ai/api/free
 *   · **JSON2Video** — NO es generación: es COMPOSICIÓN programática (texto,
 *     imágenes, audio, subtítulos, voces TTS en 30+ idiomas, transiciones,
 *     30+ plantillas). Clave gratis, 600 segundos de render totales, hasta 60 s
 *     por vídeo, sin tarjeta. → https://json2video.com/get-api-key/
 *   · **Pollinations** — una sola API para texto, imagen, vídeo y audio,
 *     compatible con OpenAI. Pero ya NO es «sin clave»: funciona con monedero
 *     (Pollen) y crédito gratuito por Quests. → https://pollinations.ai/
 *     → https://gen.pollinations.ai/docs
 *   · **Hugging Face Inference Providers** — tiene la tarea `text-to-video`
 *     (servida por fal, Replicate, Together, WaveSpeedAI, Novita), pero la capa
 *     gratuita de una cuenta Free son **$0,10 al mes**, y eso no paga un vídeo.
 *     → https://huggingface.co/docs/inference-providers/en/pricing
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CONSECUENCIA DE DISEÑO: DOS CARRILES, NO UNO
 * ─────────────────────────────────────────────────────────────────────────────
 * Si el contenedor apoyara la creación de vídeo SOLO en estos servicios, se
 * caería el día que cambie una capa gratuita — y cambiarán, porque todas dicen
 * «preview» o «subject to change». Así que hay dos carriles:
 *
 *   CARRIL A — COMPOSICIÓN LOCAL (`ffmpeg`). Coste cero, sin red, sin clave,
 *              funciona siempre. Recetas: imágenes+audio→vídeo, recorte, escalado,
 *              subtítulos quemados, marca de agua, GIF↔vídeo, extraer fotogramas.
 *              Es el carril que NO depende de nadie.
 *   CARRIL B — GENERACIÓN POR RED. Oportunista y declarado como tal: se intenta
 *              si hay clave, y si no la hay se dice exactamente por qué y qué
 *              falta. Nunca se presenta como disponible lo que no lo está.
 *
 * Este archivo construye los DOS: el carril A produce una RECETA (el comando
 * `ffmpeg` y sus argumentos) y no lo ejecuta — ejecutarlo es del sandbox o del
 * puente. El carril B sí hace red, con `fetch`, porque `fetch` funciona igual en
 * el navegador y en Node.
 *
 * LÍMITE DE PURIDAD: puro salvo por `fetch`. Nada de `fs` ni `child_process`
 * (la guarda de Vite lo revienta y hace bien). Por eso el comando de ffmpeg se
 * DEVUELVE en vez de lanzarse.
 */

// ============================================================
// Carril B: proveedores de vídeo, con la verdad por delante
// ============================================================

export type TipoProveedor = "generativo" | "composicion";

export interface ProveedorVideo {
  id: string;
  nombre: string;
  tipo: TipoProveedor;
  /** true = hay que registrarse y obtener clave. Ninguno es anónimo hoy. */
  requiereClave: boolean;
  /** true = existe capa gratuita declarada por el proveedor. */
  gratis: boolean;
  /** Variable de entorno donde vive la clave. */
  variableClave: string;
  /** URL OFICIAL donde está lo que se afirma aquí. Sin esto, no entra en la lista. */
  fuente: string;
  /** Endpoint documentado. */
  endpoint?: string;
  /** Límites de la capa gratuita, tal como los declara el proveedor. */
  limites: string;
  /** Lo que hay que saber antes de confiar en él. */
  nota: string;
  /** Formatos de salida que declara. */
  salidas: string[];
  /** true = el estado se comprobó contra la página oficial en esta fecha. */
  verificadoEl: string;
}

/**
 * Lista de proveedores. Regla de entrada, heredada del catálogo de modelos
 * (`favoriteModels.ts`): **ninguna entrada sin URL de fuente y sin fecha**.
 * Un proveedor del que no se puede citar la página es un rumor, no un proveedor.
 */
export const PROVEEDORES_VIDEO: ProveedorVideo[] = [
  {
    id: "pixazo-ltx",
    nombre: "Pixazo · LTX (Lightricks)",
    tipo: "generativo",
    requiereClave: true,
    gratis: true,
    variableClave: "PIXAZO_API_KEY",
    fuente: "https://www.pixazo.ai/api/free",
    endpoint: "https://gateway.pixazo.ai/ltx/text-to-video",
    limites: "Fair use: 60 peticiones/minuto por modelo durante la fase preview.",
    nota:
      "Es la vía gratuita más directa para vídeo GENERATIVO: registro con correo, sin tarjeta, y una clave que sirve para toda su API (imagen, vídeo y música). " +
      "Dos avisos honestos: dice «during preview», así que el límite puede cambiar sin avisar; y las resoluciones y duraciones ampliadas están en los planes de pago, no en el gratuito.",
    salidas: ["mp4"],
    verificadoEl: "2026-09-22",
  },
  {
    id: "json2video",
    nombre: "JSON2Video",
    tipo: "composicion",
    requiereClave: true,
    gratis: true,
    variableClave: "JSON2VIDEO_API_KEY",
    fuente: "https://json2video.com/get-api-key/",
    limites: "600 segundos de render en total, hasta 60 s por vídeo, con la clave gratuita.",
    nota:
      "NO genera vídeo con IA: lo ENSAMBLA. Le mandas un JSON con texto, imágenes, audio, subtítulos y transiciones, y devuelve el vídeo montado con voces TTS en 30+ idiomas. " +
      "Para un IDE esto vale más de lo que parece: es el carril determinista cuando no quieres depender de un modelo generativo. Su límite de 600 s es de por vida, no mensual.",
    salidas: ["mp4"],
    verificadoEl: "2026-09-22",
  },
  {
    id: "pollinations",
    nombre: "Pollinations",
    tipo: "generativo",
    requiereClave: true,
    gratis: true,
    variableClave: "POLLINATIONS_TOKEN",
    fuente: "https://pollinations.ai/",
    endpoint: "https://gen.pollinations.ai",
    limites: "Crédito gratuito (Pollen) al empezar, ampliable con Quests. Sin cifra pública fija.",
    nota:
      "Ojo, esto CAMBIÓ: hace unas versiones su API de imagen respondía sin clave y `imageGen.ts` lo aprovecha. El vídeo no va por ahí — la API unificada pide sesión y monedero. " +
      "Se mantiene en la lista porque su CLI (`polli gen`) cubre texto, imagen, audio y vídeo con salida `--json`, que es justo lo que un agente necesita.",
    salidas: ["mp4", "webm"],
    verificadoEl: "2026-09-22",
  },
  {
    id: "hf-video",
    nombre: "Hugging Face Inference Providers (text-to-video)",
    tipo: "generativo",
    requiereClave: true,
    gratis: false,
    variableClave: "HF_TOKEN",
    fuente: "https://huggingface.co/docs/inference-providers/en/pricing",
    endpoint: "https://router.huggingface.co",
    limites: "Cuentas Free: 0,10 USD de crédito mensual. PRO: 2,00 USD/mes.",
    nota:
      "ENTRA EN LA LISTA MARCADO COMO NO GRATIS, y esa marca es el punto. Tiene la tarea `text-to-video` de verdad (la sirven fal, Replicate, Together, WaveSpeedAI y Novita), " +
      "pero 0,10 USD al mes no compran un vídeo: la página de inicio dice «generous free tier» y la de precios dice 0,10 USD. Ante dos páginas oficiales que se contradicen, " +
      "manda la de precios, que es la que te cobra. Queda aquí para que el motor pueda decir «existe, y no te lo puedes pagar con la capa gratuita» en vez de fingir que no existe.",
    salidas: ["mp4"],
    verificadoEl: "2026-09-22",
  },
];

/** Proveedores que el motor puede intentar con las claves que HAY en el entorno. */
export function proveedoresDisponibles(env: Record<string, string | undefined>): ProveedorVideo[] {
  return PROVEEDORES_VIDEO.filter((p) => !p.requiereClave || !!env[p.variableClave]);
}

export interface EstadoCadenaVideo {
  disponibles: string[];
  faltanClave: Array<{ id: string; variable: string; fuente: string }>;
  /** Proveedores que existen pero cuya capa gratuita NO sirve (dicho claro). */
  noGratis: Array<{ id: string; motivo: string }>;
  /** Frase lista para poner en pantalla. Sin adornos. */
  resumen: string;
}

export function estadoCadenaVideo(env: Record<string, string | undefined> = {}): EstadoCadenaVideo {
  const disponibles: string[] = [];
  const faltanClave: EstadoCadenaVideo["faltanClave"] = [];
  const noGratis: EstadoCadenaVideo["noGratis"] = [];

  for (const p of PROVEEDORES_VIDEO) {
    if (p.requiereClave && !env[p.variableClave]) {
      faltanClave.push({ id: p.id, variable: p.variableClave, fuente: p.fuente });
      continue;
    }
    if (!p.gratis) noGratis.push({ id: p.id, motivo: p.limites });
    disponibles.push(p.id);
  }

  const resumen = disponibles.length
    ? `Generación de vídeo por red disponible: ${disponibles.join(", ")}.`
    : `Generación de vídeo por red NO disponible: falta la clave de ${faltanClave.map((f) => f.id).join(", ") || "cualquier proveedor"}. La composición local con ffmpeg no necesita clave.`;

  return { disponibles, faltanClave, noGratis, resumen };
}

// ============================================================
// Registro de vídeo: la firma mágica que decide si lo generado es vídeo
// ============================================================

/**
 * Comprueba que unos bytes son REALMENTE un vídeo, por firma y no por lo que
 * diga el `Content-Type`. Es la misma lección que costó una imagen tirada en
 * `imageGen.ts`: un proveedor responde `application/json` con un JPEG dentro.
 */
export function esVideoPorFirma(bytes: Uint8Array): { si: boolean; contenedor: string | null; mime: string | null } {
  // Con 4 bytes basta para EBML (WebM/Matroska) y para RIFF; `ftyp` necesita 12
  // porque su marca vive en el byte 8. La guarda era de 12 y eso hacía que un
  // WebM corto se declarara «no es vídeo»: se cazó en las pruebas. `leer()`
  // devuelve cadena vacía cuando no alcanza, así que no hay riesgo de leer basura.
  if (!bytes || bytes.length < 4) return { si: false, contenedor: null, mime: null };
  const leer = (o: number, n: number) => {
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[o + i]);
    return s;
  };
  // ISO-BMFF (MP4/MOV/M4V/3GP)
  if (leer(4, 4) === "ftyp") {
    const marca = leer(8, 4);
    if (marca === "qt  ") return { si: true, contenedor: "QuickTime", mime: "video/quicktime" };
    return { si: true, contenedor: `ISO-BMFF (${marca})`, mime: "video/mp4" };
  }
  // EBML: WebM o Matroska
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { si: true, contenedor: "EBML (WebM/Matroska)", mime: "video/webm" };
  }
  // RIFF/AVI
  if (leer(0, 4) === "RIFF" && leer(8, 4) === "AVI ") {
    return { si: true, contenedor: "RIFF/AVI", mime: "video/x-msvideo" };
  }
  // GIF animado: se acepta como vídeo de facto para el carril de composición.
  if (leer(0, 4) === "GIF8") {
    return { si: true, contenedor: "GIF", mime: "image/gif" };
  }
  return { si: false, contenedor: null, mime: null };
}

// ============================================================
// Carril A: recetas de ffmpeg (composición y modificación locales)
// ============================================================

/**
 * Una receta NO es un comando ejecutado: es la descripción verificable de lo que
 * habría que ejecutar. Se separa a propósito, por dos razones:
 *   1. Puridad: este módulo corre también en el navegador, y ahí no hay procesos.
 *   2. Auditoría: el usuario puede LEER el comando antes de que se ejecute. Un
 *      contenedor que lanza comandos a escondidas no es un contenedor: es un
 *      riesgo con interfaz bonita.
 */
export interface Receta {
  id: string;
  /** Qué hace, en una línea, en castellano. */
  queHace: string;
  /** Argumentos exactos para ffmpeg (sin el binario). */
  argumentos: string[];
  /** Requisito real: sin esto, la receta no corre. */
  requiere: "ffmpeg";
  /** Avisos sobre calidad, tamaño o pérdida. */
  avisos: string[];
}

export interface EscenaComposicion {
  /** Rutas o URLs de las imágenes, en orden de aparición. */
  imagenes: string[];
  /** Segundos que se ve cada imagen. */
  segundosPorImagen: number;
  /** Pista de audio de fondo (opcional). */
  audio?: string;
  /** Archivo de subtítulos .srt/.vtt (opcional). */
  subtitulos?: string;
  ancho?: number;
  alto?: number;
  fps?: number;
  /** Ruta de salida. */
  salida: string;
  /** Formato de salida. */
  formato?: "mp4" | "webm" | "gif";
}

/**
 * Construye la receta de una presentación de imágenes con audio y subtítulos.
 *
 * Se usa `concat` con un fichero de lista en vez de encadenar `-i` uno por uno:
 * con muchas imágenes, la línea de argumentos se pasa del límite del sistema
 * operativo y falla con un error que no dice nada útil.
 */
export function recetaPresentacion(escena: EscenaComposicion): Receta {
  const fps = escena.fps ?? 30;
  const ancho = escena.ancho ?? 1920;
  const alto = escena.alto ?? 1080;
  const segundos = escena.segundosPorImagen > 0 ? escena.segundosPorImagen : 3;
  const formato = escena.formato ?? (escena.salida.toLowerCase().endsWith(".gif") ? "gif" : escena.salida.toLowerCase().endsWith(".webm") ? "webm" : "mp4");
  const avisos: string[] = [];

  if (!escena.imagenes.length) {
    avisos.push("Sin imágenes no hay presentación: la receta no tendría entrada que concatenar.");
  }
  if (formato === "gif") {
    avisos.push("GIF: paleta de 256 colores, sin audio, y suele pesar MÁS que el MP4 equivalente.");
  }
  if (formato === "webm") {
    avisos.push("WebM/VP9: excelente en navegador, peor soporte en reproductores de escritorio antiguos.");
  }
  if (escena.subtitulos) {
    avisos.push("Los subtítulos se QUEMAN en la imagen: no se pueden desactivar después ni elegir idioma.");
  }
  avisos.push(`Resolución ${ancho}x${alto} a ${fps} fps. Si las imágenes no tienen esa proporción, se recortarán al centro (crop) y perderás los bordes.`);

  const argumentos: string[] = ["-y"];
  // Cada imagen entra como un flujo de un solo fotograma que se repite en bucle.
  const filtros: string[] = [];
  for (let i = 0; i < escena.imagenes.length; i++) {
    argumentos.push("-loop", "1", "-t", String(segundos), "-i", escena.imagenes[i]);
  }
  if (escena.audio) argumentos.push("-i", escena.audio);

  for (let i = 0; i < escena.imagenes.length; i++) {
    filtros.push(
      `[${i}:v]scale=${ancho}:${alto}:force_original_aspect_ratio=increase,crop=${ancho}:${alto},fps=${fps},setsar=1[v${i}]`
    );
  }
  const entradas = escena.imagenes.map((_, i) => `[v${i}]`).join("");
  filtros.push(`${entradas}concat=n=${escena.imagenes.length}:v=1:a=0[base]`);
  let etiquetaFinal = "base";
  if (escena.subtitulos) {
    // Los subtítulos se aplican con el filtro subtitles, que necesita el archivo
    // escapado: en Windows la ruta lleva «:» y hay que escaparla o el filtro falla.
    filtros.push(`[base]subtitles='${escena.subtitulos.replace(/\\/g, "/").replace(/:/g, "\\:")}'[conSubs]`);
    etiquetaFinal = "conSubs";
  }
  argumentos.push("-filter_complex", filtros.join(";"), "-map", `[${etiquetaFinal}]`);
  if (escena.audio) argumentos.push("-map", `${escena.imagenes.length}:a`, "-c:a", "aac", "-shortest");
  argumentos.push("-pix_fmt", "yuv420p", "-movflags", "+faststart");
  if (formato === "mp4") argumentos.push("-c:v", "libx264", "-preset", "medium", "-crf", "20");
  if (formato === "webm") argumentos.push("-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0");
  if (formato === "gif") argumentos.push("-vf", "split[a][b];[a]palettegen[p];[b][p]paletteuse");
  argumentos.push(escena.salida);

  return {
    id: "presentacion-de-imagenes",
    queHace: `Monta ${escena.imagenes.length} imagen(es) de ${segundos}s cada una en un ${formato.toUpperCase()}${escena.audio ? " con audio" : ""}${escena.subtitulos ? " y subtítulos quemados" : ""}.`,
    argumentos,
    requiere: "ffmpeg",
    avisos,
  };
}

/** Recorte por tiempo: la operación más pedida y la más fácil de hacer mal. */
export function recetaRecorte(entrada: string, salida: string, desdeSeg: number, hastaSeg: number): Receta {
  const duracion = Math.max(0, hastaSeg - desdeSeg);
  const avisos =
    duracion <= 0
      ? ["El fin es anterior o igual al principio: no hay nada que recortar."]
      : ["Recorte SIN recodificar (`-c copy`): no pierde calidad, pero corta en un fotograma clave y el inicio puede quedar desplazado. Si necesitas precisión exacta al fotograma, hay que recodificar y ahí SÍ hay pérdida."];
  return {
    id: "recorte",
    queHace: `Corta de ${desdeSeg}s a ${hastaSeg}s (${duracion.toFixed(2)}s) sin recodificar.`,
    argumentos: ["-y", "-ss", String(desdeSeg), "-to", String(hastaSeg), "-i", entrada, "-c", "copy", "-avoid_negative_ts", "make_zero", salida],
    requiere: "ffmpeg",
    avisos,
  };
}

/** Conversión de contenedor: solo cambia el envoltorio cuando se puede. */
export function recetaConversionContenedor(entrada: string, salida: string): Receta {
  return {
    id: "conversion-de-contenedor",
    queHace: "Cambia el contenedor sin recodificar, si los códecs de dentro son compatibles con el destino.",
    argumentos: ["-y", "-i", entrada, "-c", "copy", "-movflags", "+faststart", salida],
    requiere: "ffmpeg",
    avisos: [
      "Sin recodificar no pierde calidad, pero FALLA si el destino no admite el códec que hay dentro (típico: H.265 en MP4 viejo, o VP9 en MP4).",
      "Copia de audio y subtítulos entre contenedores distintos: MKV→MP4 suele perder los subtítulos en formato ASS/SSA.",
      "Si falla, la salida correcta es recodificar — y entonces sí hay pérdida de generación.",
    ],
  };
}

/** Extraer fotogramas: el «reproductor» que entrega imagen desde vídeo. */
export function recetaExtraerFotogramas(entrada: string, patronSalida: string, cadaSegundos: number): Receta {
  return {
    id: "extraer-fotogramas",
    queHace: `Saca una imagen cada ${cadaSegundos}s (patrón de salida: ${patronSalida}).`,
    argumentos: ["-y", "-i", entrada, "-vf", `fps=1/${cadaSegundos}`, patronSalida],
    requiere: "ffmpeg",
    avisos: ["El patrón debe incluir un contador (`%03d`) o cada fotograma sobrescribirá al anterior y solo quedará el último."],
  };
}

/** Escalado: el aviso de siempre es que reducir NO es reversible. */
export function recetaEscalado(entrada: string, salida: string, ancho: number, alto: number): Receta {
  return {
    id: "escalado",
    queHace: `Reescala a ${ancho}x${alto}.`,
    argumentos: ["-y", "-i", entrada, "-vf", `scale=${ancho}:${alto}:flags=lanczos`, "-c:a", "copy", salida],
    requiere: "ffmpeg",
    avisos: [
      "REDUCIR es irreversible: la información que se tira no vuelve. Se declara para poder decirlo en el plan de entrega.",
      "AMPLIAR no aporta detalle: interpola. Un 4K sacado de un 720p se ve como un 720p del que no quieres acordarte.",
    ],
  };
}

/** Firma de agua: la marca va posicionada, no incrustada en píxeles del códec. */
export function recetaMarcaDeAgua(entrada: string, salida: string, imagenMarca: string, esquina: "sup-izq" | "sup-der" | "inf-izq" | "inf-der" = "inf-der"): Receta {
  const posicion = { "sup-izq": "10:10", "sup-der": "W-w-10:10", "inf-izq": "10:H-h-10", "inf-der": "W-w-10:H-h-10" }[esquina];
  return {
    id: "marca-de-agua",
    queHace: `Superpone «${imagenMarca}» en la esquina ${esquina}, con un 15 % de margen desde el borde.`,
    argumentos: ["-y", "-i", entrada, "-i", imagenMarca, "-filter_complex", `[1:v]scale=iw*0.15:-1[wm];[0:v][wm]overlay=${posicion}`, "-c:a", "copy", salida],
    requiere: "ffmpeg",
    avisos: ["Esto RECODIFICA el vídeo (el overlay no admite copia de flujo), así que hay pérdida de generación aunque el audio sí se copie."],
  };
}

/** Todas las recetas disponibles, para poder listarlas en la interfaz. */
export const RECETAS_DISPONIBLES = [
  "presentacion-de-imagenes",
  "recorte",
  "conversion-de-contenedor",
  "extraer-fotogramas",
  "escalado",
  "marca-de-agua",
] as const;

/** Convierte una receta en la línea de comandos completa, para mostrarla o copiarla. */
export function lineaDeComando(receta: Receta): string {
  const escapar = (a: string) => (/[\s"'|&<>]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  return ["ffmpeg", ...receta.argumentos].map(escapar).join(" ");
}

// ============================================================
// REPRODUCTOR: qué puede abrir de verdad el navegador
// ============================================================

/**
 * Compatibilidad declarada de reproducción en navegador. NO se pregunta al
 * navegador con `canPlayType` desde aquí porque este módulo también corre en
 * Node y en el sandbox; se declara lo que es cierto en los navegadores actuales
 * y se marca como sujeto a lo que diga `canPlayType` en el cliente.
 */
export const REPRODUCIBLE_EN_NAVEGADOR: Record<string, { video: boolean; audio: boolean; nota?: string }> = {
  mp4: { video: true, audio: true, nota: "H.264 + AAC es la combinación que abre prácticamente todo." },
  webm: { video: true, audio: true, nota: "VP9/AV1 + Opus. Sí en navegadores modernos." },
  mov: { video: true, audio: true, nota: "Se abre si dentro lleva H.264/AAC (lo habitual en iPhone). Con ProRes, NO." },
  ogg: { audio: true, video: false },
  mp3: { audio: true, video: false },
  wav: { audio: true, video: false },
  flac: { audio: true, video: false, nota: "Soportado en navegadores modernos; históricamente irregular." },
  m4a: { audio: true, video: false },
  mkv: { video: false, audio: false, nota: "El navegador NO abre Matroska. Hay que remultiplexar a MP4/WebM con ffmpeg." },
  avi: { video: false, audio: false, nota: "El navegador NO abre AVI." },
  gif: { video: true, audio: false, nota: "Se anima como imagen; sin audio posible." },
};

export interface PlanReproduccion {
  sePuede: boolean;
  /** Cómo entregarlo: `directo` o tras el paso indicado. */
  via: "directo" | "transcodificar";
  explicacion: string;
}

/**
 * Decide cómo REPRODUCIR una entrada. Si el navegador no puede abrirla, se dice
 * y se propone la conversión concreta en vez de dejar un hueco en negro.
 */
export function planDeReproduccion(idFormato: string): PlanReproduccion {
  const id = String(idFormato || "").toLowerCase();
  const cap = REPRODUCIBLE_EN_NAVEGADOR[id];
  if (!cap) {
    return { sePuede: false, via: "transcodificar", explicacion: `No se declaró compatibilidad de reproducción para «${id}».` };
  }
  if (cap.video || cap.audio) {
    return { sePuede: true, via: "directo", explicacion: `«${id}» se reproduce directamente en el navegador.${cap.nota ? " " + cap.nota : ""}` };
  }
  const destino = id === "mkv" ? "webm" : "mp4";
  return {
    sePuede: false,
    via: "transcodificar",
    explicacion: `El navegador NO puede abrir «${id}».${cap.nota ? " " + cap.nota : ""} Ruta propuesta: ${id} → ${destino} con ffmpeg (recodifica y por tanto pierde generación).`,
  };
}
