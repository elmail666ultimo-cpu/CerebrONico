/**
 * imageGen.ts — GENERACIÓN DE IMAGENES GRATIS (v2.3)
 * ==================================================
 * Cadena de proveedores para el cerebro: un prompt entra, sale o bien una
 * imagen con TODO DECLARADO, o bien el motivo por el que no salió.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REGLA DEL MÓDULO: NO MENTIR SOBRE QUÉ SE DEVOLVIÓ
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que se mide de verdad (19-sep-2026, desde una máquina sin clave):
 *
 *   · `image.pollinations.ai` responde SIN CLAVE (x-auth-status: unauthenticated)
 *     y es el proveedor gratuito. PERO el modelo que contesta no es el que se
 *     pidió: pedir `flux` o `turbo` anónimo devuelve lo mismo, y la cabecera
 *     `x-model-used` dice quién respondió de verdad (ese día: `sana`).
 *     → El resultado declara `modeloUsado` tomado de la cabecera, no del pedido.
 *   · Sin clave el servicio es LENTO: se midieron 12 s a 46 s por imagen, y
 *     congestión pasajera (500 con 429 upstream dentro) que en el reintento
 *     salía bien. → Timeout de 120 s y fallo reintentable, no fatal.
 *     🐞 DEFECTO v1.0.3: el comentario prometía el reintento y el código no
 *     lo hacía — una sola llamada y a rezar. Reflejo v5 lo implementa de
 *     verdad: `intentos` (1..4, default 1 = contrato viejo intacto) con
 *     backoff corto (2.5 s, 5 s, tope 10 s), clasificación de qué es
 *     congestión (429/5xx/página HTML/timeout/red) y qué no (4xx de diseño,
 *     cancelación del usuario), y DECLARACIÓN en advertencias si hubo que
 *     insistir. El servidor pide 3 intentos en la orden directa del chat y
 *     2 en las tareas de plan (que además tienen el drenaje de cola de 45 s
 *     del planificador como segunda red).
 *   · El servicio ACOMODA DIMENSIONES: 1280×720 sale internamente a 1024×576
 *     (visible en el Exif de la propia imagen). → Se avisa cuando se pide
 *     lado mayor > 1024 px.
 *   · `gen.pollinations.ai` (la API unificada) responde 401 sin clave.
 *   · Gemini: `gemini-2.5-flash-image` se apaga el 02-oct-2026 y su sucesor
 *     (`gemini-3.1-flash-image`) NO tiene capa gratuita. → Gemini sólo entra en
 *     la cadena si hay `GEMINI_API_KEY` configurada; sin clave se DECLARA que
 *     no se intentó.
 *
 * Cada eslabón que falla deja su motivo en `fallos`. Si todos fallan, el
 * resultado es `ok:false` con la lista completa: nunca un "no se pudo" a secas.
 *
 * El módulo es LÓGICA PURA + fetch inyectable: se prueba sin red, sin claves y
 * sin suerte.
 */

export interface PeticionImagen {
  /** Lo que se dibuja. Obligatorio y no vacío. */
  prompt: string;
  /** Ancho pedido en px. Por defecto 1024 (verificado). */
  ancho?: number;
  /** Alto pedido en px. Por defecto 1024 (verificado). */
  alto?: number;
  /** Modelo pedido al proveedor. El que RESPONDA se declara en el resultado. */
  modelo?: string;
  /** Semilla para resultados reproducibles (el servicio la respeta si puede). */
  seed?: number;
  /** Señal de cancelación de la tarea del plan. */
  senal?: AbortSignal;
  /** Clave opcional de Pollinations (con clave: modelo real pedido + prioridad). */
  tokenPollinations?: string;
  /** Clave de Gemini; sin ella ese eslabón se declara y se salta. */
  keyGemini?: string;
  /** fetch inyectable para probar sin red. Por defecto el global. */
  fetchImpl?: typeof fetch;
  /** Timeout por proveedor (ms). Por defecto 120 s (lo medido, con margen). */
  timeoutMs?: number;
  /**
   * INTENTOS sobre Pollinations (1..4). Por defecto 1: el contrato histórico
   * del módulo (una llamada, honesta). El defecto v1.0.3 era justo ese
   * contraste: la cabecera del módulo documenta «congestión pasajera (500 con
   * 429 dentro) que en el reintento salía bien», pero NADIE reintentaba — el
   * reintento quedaba a merced del planificador (45 s de drenaje de cola) o
   * no existía en la orden directa del chat. `intentos: 3` con backoff corto
   * (2.5 s, 5 s) es la cura barata y declarada.
   */
  intentos?: number;
  /** Espera base entre intentos Pollinations (ms). Se multiplica por el nº de intento. */
  esperaIntentoMs?: number;
  /** Dormir inyectable (los tests no esperan de verdad; respeta la señal). */
  dormir?: (ms: number, senal?: AbortSignal) => Promise<void>;
}

export interface FalloProveedor {
  proveedor: string;
  motivo: string;
}

export interface ResultadoImagen {
  ok: boolean;
  /** La imagen en bytes (magic bytes verificados, no la palabra del Content-Type). */
  bytes?: Uint8Array;
  /** MIME real por la firma mágica (image/jpeg, image/png, image/webp, image/gif). */
  tipoMime?: string;
  /** Quién devolvió la imagen: "pollinations" | "gemini". */
  proveedor?: string;
  /** El modelo que RESPONDIÓ DE VERDAD, tomado de la respuesta, no del pedido. */
  modeloUsado?: string;
  /** URL pública de la imagen (Pollinations la sirve; sirve de referencia). */
  url?: string;
  seed?: number;
  /** Tiempo total de la cadena, en ms. */
  ms?: number;
  /** Lo que hay que decirle al usuario aunque la imagen salga bien. */
  advertencias: string[];
  /** Cada eslabón que falló (o se saltó) y su motivo. Nunca en silencio. */
  fallos: FalloProveedor[];
  /** Error legible para el ejecutor lanzar cuando todo falló. */
  error?: string;
}

/** Rango de dimensiones aceptado. 1024 y 640×360 verificados en vivo. */
export const LIMITES = {
  minPx: 256,
  maxPx: 2048,
  /** Por encima de esto el servicio gratuito acomoda (medido: 1280→1024). */
  ajusteSugeridoPx: 1024,
  maxPrompt: 4000,
  maxBytesRespuesta: 15 * 1024 * 1024,
} as const;

export const DIMENSIONES_POR_DEFECTO = { ancho: 1024, alto: 1024 } as const;

/** Modelos que el servicio anuncia (anónimos, todos caen en el mismo upstream). */
export const MODELOS_POLLINATIONS = ["sana", "turbo", "flux", "gptimage"] as const;

/** Modelos de imagen de Gemini, del más nuevo al legado (se apaga 02-oct-2026). */
export const MODELOS_GEMINI = ["gemini-3.1-flash-image", "gemini-2.5-flash-image"] as const;

const MIN_BYTES_IMAGEN = 512;

// ─────────────────────────────────────────────────────────────────────────────
// Firma mágica: el Content-Type se puede equivocar; los bytes no.
// ─────────────────────────────────────────────────────────────────────────────

/** Devuelve el MIME real mirando los primeros bytes, o null si no es imagen. */
export function mimePorFirmaMagica(bytes: Uint8Array): string | null {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  return null;
}

export function extensionDeMime(mime: string): string {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "jpg";
}

/**
 * La extensión de la ruta tiene que ser la de los BYTES REALES, no la que se
 * pidió. Un JPEG guardado como «.png» es un archivo mal etiquetado (la vista
 * previa y cualquier herramienta posterior creen que es PNG). Si la extensión
 * pedida no cuadra con la firma mágica, se reescribe la extensión — ni el
 * contenido, ni la carpeta — y se declara que se corrigió.
 *
 * `.jpg` y `.jpeg` son el mismo formato: no se cuenta como corrección.
 */
export function rutaConExtensionReal(rutaRel: string, data: Uint8Array): { ruta: string; corregida: boolean } {
  const mime = mimePorFirmaMagica(data);
  if (!mime) throw new Error("los bytes no tienen firma de imagen (JPEG/PNG/WEBP/GIF): no se escribe nada.");
  const extReal = "." + extensionDeMime(mime);
  const partes = rutaRel.split("/");
  const nombre = partes[partes.length - 1];
  const m = nombre.match(/^(.*?)(\.[a-zA-Z0-9]+)?$/);
  const base = m?.[1] || nombre;
  const extPedida = (m?.[2] || "").toLowerCase();
  if (extPedida === extReal || (extPedida === ".jpeg" && extReal === ".jpg")) {
    return { ruta: rutaRel, corregida: false };
  }
  partes[partes.length - 1] = base + extReal;
  return { ruta: partes.join("/"), corregida: true };
}

/** Valida prompt y dimensiones ANTES de tocar la red. Devuelve campos o el error. */
export function validarDatosImagen(
  datos: Record<string, unknown>
): { ok: true; prompt: string; ancho: number; alto: number; modelo?: string; seed?: number } | { ok: false; error: string } {
  const prompt = typeof datos.prompt === "string" ? datos.prompt.trim() : "";
  if (!prompt) return { ok: false, error: "Falta «prompt»: lo que se dibuja. Sin él no hay nada que generar." };
  if (prompt.length > LIMITES.maxPrompt) {
    return { ok: false, error: `«prompt» tiene ${prompt.length} caracteres y el tope es ${LIMITES.maxPrompt}. Acórtalo.` };
  }

  const dim = (v: unknown, porDefecto: number, nombre: string): number | { error: string } => {
    if (v === undefined || v === null || v === "") return porDefecto;
    const n = Number(v);
    if (!Number.isInteger(n)) return { error: `${nombre} no es un número entero: «${String(v)}».` };
    if (n < LIMITES.minPx || n > LIMITES.maxPx) {
      return { error: `${nombre} fuera de rango: ${n} px. Válidos: ${LIMITES.minPx}–${LIMITES.maxPx}.` };
    }
    return n;
  };
  const ancho = dim(datos.ancho, DIMENSIONES_POR_DEFECTO.ancho, "ancho");
  if (typeof ancho === "object") return { ok: false, error: ancho.error };
  const alto = dim(datos.alto, DIMENSIONES_POR_DEFECTO.alto, "alto");
  if (typeof alto === "object") return { ok: false, error: alto.error };

  let modelo: string | undefined;
  if (datos.modelo !== undefined) {
    if (typeof datos.modelo !== "string" || !/^[a-zA-Z0-9._-]{1,40}$/.test(datos.modelo.trim())) {
      return { ok: false, error: `«modelo» no es un identificador válido: «${String(datos.modelo)}».` };
    }
    modelo = datos.modelo.trim();
  }

  let seed: number | undefined;
  if (datos.seed !== undefined && datos.seed !== null && datos.seed !== "") {
    const n = Number(datos.seed);
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: `«seed» debe ser un entero ≥ 0: «${String(datos.seed)}».` };
    seed = n;
  }

  return { ok: true, prompt, ancho, alto, modelo, seed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Señal combinada: cancelación de la tarea + timeout del proveedor.
// (AbortSignal.any no existe en Node 18; se monta a mano.)
// ─────────────────────────────────────────────────────────────────────────────

function senalCombinada(senal: AbortSignal | undefined, timeoutMs: number): { senal: AbortSignal; limpiar: () => void } {
  const ctrl = new AbortController();
  if (senal?.aborted) ctrl.abort();
  else if (senal) senal.addEventListener("abort", () => ctrl.abort(), { once: true });
  // El timer NO se unref-ear: vive exactamente lo que vive la petición (se
  // limpia en el `finally` del proveedor). Un timer unref-ear deja el bucle de
  // eventos vacío y Node termina antes de disparar el timeout — el proceso
  // moriría con la operación a medias, que es el fallo silencioso que no se
  // admite.
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return { senal: ctrl.signal, limpiar: () => clearTimeout(timer) };
}

/** Texto corto de un cuerpo de error JSON (Pollinations trae `message` dentro). */
function motivoDeCuerpo(cuerpo: string): string {
  try {
    const j = JSON.parse(cuerpo);
    const m = String(j?.message || j?.error || "").slice(0, 220);
    if (m) return m;
  } catch {
    /* no era JSON */
  }
  return cuerpo.slice(0, 160).replace(/\s+/g, " ").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Eslabón 1 — POLLINATIONS (gratis, sin clave; con clave si la hay)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un INTENTO contra Pollinations. Devuelve la imagen o null, y SIEMPRE dice
 * si el fallo es REINTENTABLE: congestión (429/5xx), página de espera que
 * llega como text/html, bytes recortados, timeout o red. Un 4xx de verdad
 * (petición mal formada) o una cancelación del usuario NO se reintentan:
 * reintentar un error de propio diseño es solo gastar tiempo más despacio.
 */
async function conPollinations(
  p: PeticionImagen,
  campos: { prompt: string; ancho: number; alto: number; modelo?: string; seed?: number },
  fetchImpl: typeof fetch,
  timeoutMs: number,
  fallos: FalloProveedor[],
  advertencias: string[]
): Promise<{ r: ResultadoImagen | null; reintentable: boolean }> {
  const params = new URLSearchParams({
    width: String(campos.ancho),
    height: String(campos.alto),
    nologo: "true",
    private: "true",
  });
  if (campos.modelo) params.set("model", campos.modelo);
  if (campos.seed !== undefined) params.set("seed", String(campos.seed));
  if (p.tokenPollinations) params.set("token", p.tokenPollinations);

  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(campos.prompt)}?${params.toString()}`;

  if (campos.ancho > LIMITES.ajusteSugeridoPx || campos.alto > LIMITES.ajusteSugeridoPx) {
    advertencias.push(
      `Se pidió ${campos.ancho}×${campos.alto} px; el servicio gratuito suele acomodar al lado mayor ~${LIMITES.ajusteSugeridoPx} px (medido: 1280×720 salió 1024×576).`
    );
  }

  const { senal, limpiar } = senalCombinada(p.senal, timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetchImpl(url, { method: "GET", signal: senal });
    // OJO: el cuerpo es BINARIO. Leerlo con `res.text()` lo corrompe (el
    // decodificado UTF-8 rompe bytes ≥ 0x80 del JPEG). Siempre `arrayBuffer()`.
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!res.ok) {
      const cuerpo = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 600));
      fallos.push({ proveedor: "pollinations", motivo: `HTTP ${res.status}: ${motivoDeCuerpo(cuerpo) || "sin detalle"}` });
      // 429 y 5xx = congestión (medido: el reintento sale bien). 4xx = la
      // petición está mal: reintentarla es repetir el mismo error.
      return { r: null, reintentable: res.status === 429 || res.status >= 500 };
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) {
      fallos.push({ proveedor: "pollinations", motivo: `responde con «${ct || "tipo sin declarar"}», no con una imagen` });
      // En congestión el gratuito devuelve páginas de espera con status 200:
      // eso es reintentable; un 4xx ya se decidió arriba.
      return { r: null, reintentable: res.status < 400 || res.status === 429 || res.status >= 500 };
    }
    if (bytes.length < MIN_BYTES_IMAGEN || bytes.length > LIMITES.maxBytesRespuesta) {
      fallos.push({ proveedor: "pollinations", motivo: `la respuesta mide ${bytes.length} bytes; no parece una imagen usable` });
      return { r: null, reintentable: true };
    }
    const mime = mimePorFirmaMagica(bytes);
    if (!mime) {
      fallos.push({ proveedor: "pollinations", motivo: "los bytes no tienen firma de imagen (JPEG/PNG/WEBP/GIF)" });
      return { r: null, reintentable: true };
    }
    const modeloReal = (res.headers.get("x-model-used") || "").trim().toLowerCase();
    const sinClave = !p.tokenPollinations;
    if (sinClave && !modeloReal) {
      advertencias.push("Sin clave, Pollinations no declaró el modelo en la cabecera: no se sabe qué respondió de verdad.");
    }
    if (sinClave && campos.modelo && modeloReal && modeloReal !== campos.modelo.toLowerCase()) {
      advertencias.push(`Se pidió «${campos.modelo}» pero el modelo que respondió de verdad es «${modeloReal}» (sin clave el upstream lo decide).`);
    }
    return {
      r: {
        ok: true,
        bytes,
        tipoMime: mime,
        proveedor: "pollinations",
        modeloUsado: modeloReal || (sinClave ? "no declarado" : campos.modelo || "no declarado"),
        url,
        seed: campos.seed,
        ms: Date.now() - t0,
        advertencias: [],
        fallos: [],
      },
      reintentable: false,
    };
  } catch (e: any) {
    const porCancelacion = p.senal?.aborted === true;
    const esTimeout = senal.aborted && !porCancelacion;
    fallos.push({
      proveedor: "pollinations",
      motivo: porCancelacion
        ? "la tarea se canceló durante la espera"
        : esTimeout
          ? `no respondió en ${Math.max(1, Math.round(timeoutMs / 1000))} s (el gratuito tarda, y a veces más)`
          : `error de red: ${String(e?.message || e)}`.slice(0, 220),
    });
    // Cancelación del usuario: no se reintenta NUNCA (no es congestión, es
    // una decisión). Timeout y red: sí.
    return { r: null, reintentable: !porCancelacion };
  } finally {
    limpiar();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Eslabón 2 — GEMINI (solo si hay clave: su capa gratuita de imagen es nula)
// ─────────────────────────────────────────────────────────────────────────────

async function conGemini(
  p: PeticionImagen,
  campos: { prompt: string; ancho: number; alto: number; modelo?: string; seed?: number },
  fetchImpl: typeof fetch,
  timeoutMs: number,
  fallos: FalloProveedor[],
  advertencias: string[]
): Promise<ResultadoImagen | null> {
  const clave = (p.keyGemini || "").trim();
  if (!clave) {
    fallos.push({ proveedor: "gemini", motivo: "no se intentó: no hay GEMINI_API_KEY configurada (su capa gratuita de imagen es nula, no sirve como respaldo sin clave)" });
    return null;
  }

  const modelos = campos.modelo && !MODELOS_GEMINI.includes(campos.modelo as (typeof MODELOS_GEMINI)[number])
    ? [campos.modelo, ...MODELOS_GEMINI]
    : [...MODELOS_GEMINI];

  for (const m of modelos) {
    const { senal, limpiar } = senalCombinada(p.senal, timeoutMs);
    const t0 = Date.now();
    try {
      const res = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,
        {
          method: "POST",
          signal: senal,
          headers: { "Content-Type": "application/json", "x-goog-api-key": clave },
          body: JSON.stringify({
            contents: [{ parts: [{ text: campos.prompt }] }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
          }),
        }
      );
      const cuerpo = await res.text().catch(() => "");
      if (!res.ok) {
        fallos.push({ proveedor: `gemini/${m}`, motivo: `HTTP ${res.status}: ${motivoDeCuerpo(cuerpo) || "sin detalle"}` });
        continue;
      }
      const j = JSON.parse(cuerpo);
      const block = j?.promptFeedback?.blockReason;
      if (block) {
        fallos.push({ proveedor: `gemini/${m}`, motivo: `el contenido fue bloqueado (${block})` });
        continue;
      }
      const partes: any[] = j?.candidates?.[0]?.content?.parts || [];
      const inline = partes.find((x) => x?.inlineData?.data);
      if (!inline) {
        const finish = j?.candidates?.[0]?.finishReason;
        fallos.push({ proveedor: `gemini/${m}`, motivo: `respondió sin imagen${finish ? ` (finishReason: ${finish})` : ""}` });
        continue;
      }
      const bytes = new Uint8Array(Buffer.from(String(inline.inlineData.data), "base64"));
      const mime = mimePorFirmaMagica(bytes);
      if (!mime) {
        fallos.push({ proveedor: `gemini/${m}`, motivo: "los bytes devueltos no tienen firma de imagen" });
        continue;
      }
      if (campos.ancho !== DIMENSIONES_POR_DEFECTO.ancho || campos.alto !== DIMENSIONES_POR_DEFECTO.alto) {
        advertencias.push(`Se pidió ${campos.ancho}×${campos.alto}; Gemini decide el tamaño final según el modelo (no se garantiza lo pedido).`);
      }
      return {
        ok: true,
        bytes,
        tipoMime: mime,
        proveedor: "gemini",
        modeloUsado: m,
        seed: campos.seed,
        ms: Date.now() - t0,
        advertencias: [],
        fallos: [],
      };
    } catch (e: any) {
      const porCancelacion = p.senal?.aborted === true;
      const esTimeout = senal.aborted && !porCancelacion;
      fallos.push({
        proveedor: `gemini/${m}`,
        motivo: porCancelacion
          ? "la tarea se canceló durante la espera"
          : esTimeout
            ? `no respondió en ${Math.max(1, Math.round(timeoutMs / 1000))} s`
            : `error: ${String(e?.message || e)}`.slice(0, 220),
      });
    } finally {
      limpiar();
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// La cadena
// ─────────────────────────────────────────────────────────────────────────────

export async function generarImagen(p: PeticionImagen): Promise<ResultadoImagen> {
  const t0 = Date.now();
  const advertencias: string[] = [];
  const fallos: FalloProveedor[] = [];

  const v = validarDatosImagen({
    prompt: p.prompt,
    ancho: p.ancho,
    alto: p.alto,
    modelo: p.modelo,
    seed: p.seed,
  });
  if (!v.ok) {
    return { ok: false, ms: Date.now() - t0, advertencias, fallos, error: v.error };
  }

  const fetchImpl = p.fetchImpl || ((...a: Parameters<typeof fetch>) => fetch(...a));
  const timeoutMs = p.timeoutMs ?? 120_000;

  // ── Reflejo v5 · REINTENTOS HONESTOS ──────────────────────────────────────
  // La congestión del gratuito se va sola en el segundo o tercer golpe (eso
  // dice la medición de la cabecera). Por eso el reintento es CORTO (2.5 s,
  // 5 s) y se DECLARA: si hubo que insistir, el usuario lo lee. Con
  // `intentos` = 1 (el default histórico) el comportamiento es idéntico al
  // de v2.3: una llamada y su motivo — los tests del contrato viejo duermen
  // tranquilos.
  const intentos = Math.max(1, Math.min(4, Math.round(p.intentos ?? 1)));
  const esperaBase = Math.max(250, Math.round(p.esperaIntentoMs ?? 2500));
  const dormir =
    p.dormir ||
    ((ms: number, senal?: AbortSignal) =>
      new Promise<void>((res) => {
        const t = setTimeout(res, ms);
        senal?.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true });
      }));

  let r: ResultadoImagen | null = null;
  let intentosUsados = 0;
  for (let i = 1; i <= intentos; i++) {
    intentosUsados = i;
    const intento = await conPollinations(p, v, fetchImpl, timeoutMs, fallos, advertencias);
    if (intento.r) { r = intento.r; break; }
    if (!intento.reintentable || i === intentos || p.senal?.aborted) break;
    await dormir(Math.min(10_000, esperaBase * i), p.senal);
    if (p.senal?.aborted) break;
  }
  if (r && intentosUsados > 1) {
    advertencias.push(`Pollinations necesitó ${intentosUsados} intentos (congestión pasajera del gratuito: el reintento corto sale bien, y ahora lo hacemos nosotros en vez de esperar 45 s de cola).`);
  }
  if (!r) r = await conGemini(p, v, fetchImpl, timeoutMs, fallos, advertencias);

  if (r) {
    r.advertencias = [...advertencias, ...r.advertencias];
    r.fallos = fallos;
    r.ms = Date.now() - t0;
    return r;
  }

  return {
    ok: false,
    ms: Date.now() - t0,
    advertencias,
    fallos,
    error: `No se pudo generar la imagen en ningún proveedor. ${fallos.map((f) => `${f.proveedor} → ${f.motivo}`).join(" · ")}`,
  };
}

/**
 * El estado real de la cadena, para el panel y el diagnóstico:
 * qué eslabones existen en ESTA máquina y qué hacen falta para activar el resto.
 */
export function estadoCadenaImagen(env: Record<string, string | undefined> = process.env): {
  pollinations: { activo: boolean; conClave: boolean };
  gemini: { activo: boolean; conClave: boolean };
} {
  return {
    pollinations: { activo: true, conClave: Boolean((env.POLLINATIONS_API_KEY || "").trim()) },
    gemini: { activo: true, conClave: Boolean((env.GEMINI_API_KEY || "").trim()) },
  };
}
