/**
 * chatOrders.ts — LA ORDEN DEL CHAT (v2.2)
 * ========================================
 * Cierra la cadena: **chat → conversor → editor → preview**.
 *
 * El camino ya existía a medias y conviene tenerlo claro, porque aquí se engancha
 * en lo que YA funciona en vez de montar un circuito paralelo:
 *
 *   chat responde
 *     → `extractCodeBlocksFromMessage` saca los bloques de código   (utils/codeParser.ts)
 *     → `mergeExtractedFiles` los escribe en el espacio de trabajo   (el EDITOR)
 *     → `syncToDisk` los manda al sandbox                            (.proyectos/)
 *     → `cerebronico:autosync-done` refresca el iframe               (RightSidebar:674)
 *
 * Lo que faltaba era el **conversor** en medio: el modelo podía ESCRIBIR archivos,
 * pero no podía pedir «convierte esto a YAML». Aquí se define esa orden.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UNA ORDEN EN BLOQUE Y NO TEXTO LIBRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Porque se puede validar ANTES de ejecutarla. Un bloque con JSON dentro se
 * comprueba entero —formatos, campos, si el archivo existe— y si algo no cuadra
 * se AVISA sin ejecutar nada. Interpretar frases sueltas del modelo sería adivinar
 * qué quiso decir, y de ahí salen las pérdidas silenciosas que este proyecto no
 * admite.
 *
 * Este módulo es LÓGICA PURA: recibe texto y devuelve órdenes o avisos. No toca
 * red, ni disco, ni el DOM. Por eso se puede probar entero.
 */

import { FORMATOS, type Formato, type OpcionesConversion } from "./formatConverter";
// El plan se comprueba con EL MISMO CÓDIGO que usa el servidor. No hay dos
// validaciones: si `validarPlan` dice que no, la orden no se envía. Duplicar las
// reglas aquí sería garantizar que algún día discrepen, y entonces el chat
// crearía planes que el motor rechaza.
import { crearPlan, validarPlan } from "./taskPlanner";
import { TIPOS_SOPORTADOS } from "./planExecutors";
import { validarDatosImagen } from "./imageGen";
// v2.5 — el catálogo de entidades del consejo es la autoridad de «existe o no».
// El ciclo de módulos chatOrders→consejo→cerebroReflejo→chatOrders es inofensivo:
// todo cruce es una llamada diferida (funciones hoisted), nunca lectura de
// constantes ajenas en la carga.
import { entidadPorId } from "./reflejo/consejo";
import { notaSeleccionEspejos } from "./reflejo/espejos"; // ESPEJOS v1: el equipo activo viaja al prompt

/** La etiqueta que abre un bloque de orden. */
export const ETIQUETA_ORDEN = "cerebronico:";

/**
 * Tope de tareas por plan emitido desde el chat.
 * No lo impone el motor (el semáforo global ya protege la máquina), pero un
 * modelo que se desmanda no debe poder encolar 5.000 tareas de golpe: el chat
 * crea el plan sin que nadie lo revise primero.
 */
export const MAX_TAREAS_POR_ORDEN = 500;

export interface OrdenConvertir {
  tipo: "convertir";
  desde: Formato;
  hacia: Formato;
  /** Ruta dentro del proyecto, si el origen es un archivo. */
  archivo?: string;
  /** O el contenido directo, si venía en el propio mensaje. */
  contenido?: string;
  /** Nombre del archivo que se creará en el espacio de trabajo. */
  salida: string;
  opciones?: OpcionesConversion;
}

export interface OrdenAbrir {
  tipo: "abrir";
  ruta: string;
}

/** Una imagen generada por el IDE, gratis, sin pasar por el workspace de texto. */
export interface OrdenImagen {
  tipo: "imagen";
  prompt: string;
  /** Ruta DENTRO del proyecto donde se guarda el binario (img/… por convención). */
  salida?: string;
  ancho?: number;
  alto?: number;
  modelo?: string;
  seed?: number;
}

/** Una tarea tal y como la describe el modelo, antes de normalizarla. */
export interface TareaPlanOrden {
  id: string;
  titulo: string;
  peso: "io" | "cpu";
  tipo: string;
  datos: Record<string, unknown>;
  dependeDe: string[];
}

/** Un plan del cerebro pedido desde el chat. */
export interface OrdenPlan {
  tipo: "plan";
  objetivo: string;
  tareas: TareaPlanOrden[];
  /** Modelo para todas las tareas de tipo «modelo» que no fijen el suyo. */
  modelo?: string;
  /** Contexto común que se añade a las tareas de modelo. */
  contexto?: string;
  /** Se lanza al crearlo. Por defecto sí: un plan parado no sirve de nada. */
  autoLanzar: boolean;
}

export type Orden = OrdenConvertir | OrdenAbrir | OrdenPlan | OrdenImagen | OrdenGenerica;

// ─── Reflejo v3.0 — Orden genérica para las 16 acciones nuevas ──────────────
// analizar, explicar, resumir, traducir, comparar, listar, buscar, ordenar,
// filtrar, contar, testear, documentar, instalar, desplegar, refactorizar,
// optimizar. El payload es libre (archivo, prompt, idioma, campo, paquete,
// destino…); cada acción interpreta lo que necesita.
export const ACCIONES_GENERICAS_REFLEJO_V3 = [
  "analizar", "explicar", "resumir", "traducir", "comparar",
  "listar", "buscar", "ordenar", "filtrar", "contar",
  "testear", "documentar", "instalar", "desplegar",
  "refactorizar", "optimizar",
] as const;
export type AccionGenericaReflejo = (typeof ACCIONES_GENERICAS_REFLEJO_V3)[number];

export interface OrdenGenerica {
  tipo: AccionGenericaReflejo;
  /** Payload libre: archivo, prompt, idioma, campo, paquete, destino… */
  datos: Record<string, string | undefined>;
}

export interface ResultadoOrdenes {
  ordenes: Orden[];
  /** Lo que no se pudo interpretar. Se dice; no se ignora. */
  avisos: string[];
}

/** Extensión con la que se guardará el resultado, según el formato destino. */
export function extensionDeFormato(f: Formato): string {
  return f === "yaml" ? "yaml" : f;
}

/**
 * Nombre de salida por defecto: se cambia la extensión del origen.
 * `package.json` → YAML  ⇒  `package.yaml`
 */
export function nombreSalidaPorDefecto(origen: string, hacia: Formato): string {
  const limpio = (origen || "convertido").replace(/\\/g, "/").split("/").pop() || "convertido";
  const sinExt = limpio.replace(/\.[a-zA-Z0-9]+$/, "");
  return `${sinExt || "convertido"}.${extensionDeFormato(hacia)}`;
}

function esFormatoValido(v: unknown): v is Formato {
  return typeof v === "string" && (FORMATOS as string[]).includes(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// La orden de IMAGEN (v2.3) — gratis, sin clave, y sin mentiras sobre lo que
// respondió el proveedor. La validación de prompt/dimensiones/modelo/seed es la
// MISMA que usa el endpoint /api/engine/imagen (`validarDatosImagen` de
// imageGen.ts): dos validaciones algún día discreparían.
// ─────────────────────────────────────────────────────────────────────────────

const EXTENSIONES_IMAGEN = [".jpg", ".jpeg", ".png", ".webp"] as const;

/**
 * Comprobar la ruta de salida de una imagen ANTES de que se escriba nada.
 * El binario NO pasa por el workspace de texto (que vive en localStorage con
 * tope de 5 MB): va directo a disco del proyecto, así que la ruta se audita
 * aquí y otra vez en el servidor, por separado.
 */
export function validarRutaImagen(ruta: string): { ok: true } | { ok: false; error: string } {
  const r = (ruta || "").trim();
  if (!r) return { ok: false, error: "«salida» está vacía." };
  if (/\\/.test(r)) return { ok: false, error: `«salida» no lleva barras inversas: «${r}».` };
  if (r.startsWith("/")) return { ok: false, error: `«salida» es relativa al proyecto (no empiece por /): «${r}».` };
  const partes = r.split("/");
  if (partes.some((x) => x === ".." || x === ".")) {
    return { ok: false, error: `«salida» no puede subir de carpeta («..»): «${r}».` };
  }
  const nombre = partes[partes.length - 1];
  if (!/^[a-zA-Z0-9._-]+$/.test(nombre)) {
    return { ok: false, error: `el nombre «${nombre}» trae caracteres no permitidos (valen letras, números, punto, guion y guion bajo).` };
  }
  const ext = `.${nombre.split(".").pop()?.toLowerCase() || ""}`;
  if (!(EXTENSIONES_IMAGEN as readonly string[]).includes(ext)) {
    return { ok: false, error: `la extensión «${ext}» no es de imagen. Válidas: ${EXTENSIONES_IMAGEN.join(", ")}.` };
  }
  return { ok: true };
}

/** Nombre por defecto cuando la orden no trae «salida». */
export function nombreImagenPorDefecto(n: number): string {
  return `img/imagen-${n}.jpg`;
}

export function normalizarImagenDesdeOrden(datos: any): { ok: true; orden: OrdenImagen } | { ok: false; error: string } {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    return { ok: false, error: "El contenido no es un objeto JSON." };
  }
  const v = validarDatosImagen(datos as Record<string, unknown>);
  if (!v.ok) return { ok: false, error: v.error };
  let salida: string | undefined;
  if (datos.salida !== undefined) {
    if (typeof datos.salida !== "string") return { ok: false, error: "«salida» tiene que ser una ruta (texto)." };
    const s = datos.salida.trim();
    if (s.length > 0) {
      // Vacío = «sin salida» (se decide el nombre por defecto), NO un error.
      const vr = validarRutaImagen(s);
      if (!vr.ok) return { ok: false, error: `«salida»: ${vr.error}` };
      salida = s;
    }
  }
  return { ok: true, orden: { tipo: "imagen", prompt: v.prompt, salida, ancho: v.ancho, alto: v.alto, modelo: v.modelo, seed: v.seed } };
}

/**
 * Convierte lo que el modelo escribió en un plan que el motor acepta, o dice por
 * qué no. **Comprueba antes de enviar**, y comprueba lo MISMO que el motor:
 *
 *   1. Lo que el ejecutor exige por tipo de tarea (si falta, la tarea fallaría al
 *      correr; mejor no encolarla siquiera).
 *   2. Lo que `validarPlan` exige del grafo: ids únicos, dependencias que existen,
 *      sin autociclo y sin ciclos. Se le pasa el plan ya montado por `crearPlan`
 *      —el mismo constructor que usa el servidor— para no reimplementar nada.
 *
 * Un plan con un ciclo NO termina nunca: se cuelga. Por eso se rechaza aquí y no
 * se deja que falle "cuando toque".
 */
export function normalizarPlanDesdeOrden(datos: any): { ok: true; orden: OrdenPlan } | { ok: false; error: string } {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    return { ok: false, error: "El contenido no es un objeto JSON." };
  }
  const objetivo = typeof datos.objetivo === "string" ? datos.objetivo.trim() : "";
  if (!objetivo) return { ok: false, error: "Falta «objetivo»: un plan necesita decir qué persigue." };

  const brutas = Array.isArray(datos.tareas) ? datos.tareas : [];
  if (brutas.length === 0) return { ok: false, error: "El plan no trae «tareas»." };
  if (brutas.length > MAX_TAREAS_POR_ORDEN) {
    return { ok: false, error: `El plan trae ${brutas.length} tareas y el tope por orden del chat es ${MAX_TAREAS_POR_ORDEN}. Divídelo en varios planes.` };
  }

  const tareas: TareaPlanOrden[] = [];
  for (let i = 0; i < brutas.length; i++) {
    const t = brutas[i];
    const donde = `tarea ${i + 1}`;
    if (!t || typeof t !== "object") return { ok: false, error: `${donde}: no es un objeto.` };

    const tipo = typeof t.tipo === "string" && t.tipo.trim() ? t.tipo.trim() : "modelo";
    if (!(TIPOS_SOPORTADOS as readonly string[]).includes(tipo)) {
      return {
        ok: false,
        error: `${donde}: tipo de tarea desconocido «${tipo}». Soportados: ${TIPOS_SOPORTADOS.join(", ")}. Si falta «tipo», se asume «modelo».`,
      };
    }

    const titulo = typeof t.titulo === "string" && t.titulo.trim() ? t.titulo.trim() : `tarea ${i + 1}`;
    const datosTarea: Record<string, unknown> = t.datos && typeof t.datos === "object" && !Array.isArray(t.datos) ? { ...t.datos } : {};

    // ── Lo que el ejecutor exige para poder correr la tarea ────────────────
    if (tipo === "leer_archivo") {
      const ruta = typeof datosTarea.ruta === "string" ? datosTarea.ruta.trim() : "";
      if (!ruta) return { ok: false, error: `${donde} («${titulo}»): es de tipo «leer_archivo» y no trae «datos.ruta».` };
    } else if (tipo === "convertir") {
      const desde = datosTarea.desde;
      const hacia = datosTarea.hacia;
      if (!esFormatoValido(desde)) {
        return { ok: false, error: `${donde} («${titulo}»): «datos.desde» no es un formato conocido (${desde === undefined ? "falta" : `«${String(desde)}»`}). Válidos: ${FORMATOS.join(", ")}.` };
      }
      if (!esFormatoValido(hacia)) {
        return { ok: false, error: `${donde} («${titulo}»): «datos.hacia» no es un formato conocido (${hacia === undefined ? "falta" : `«${String(hacia)}»`}). Válidos: ${FORMATOS.join(", ")}.` };
      }
      const tieneContenido = typeof datosTarea.contenido === "string" && datosTarea.contenido.length > 0;
      const tieneArchivo = typeof datosTarea.archivo === "string" && datosTarea.archivo.trim().length > 0;
      if (!tieneContenido && !tieneArchivo) {
        return { ok: false, error: `${donde} («${titulo}»): no trae «datos.contenido» ni «datos.archivo»; no habría nada que convertir.` }
      }
    } else if (tipo === "generar_imagen") {
      const vi = validarDatosImagen(datosTarea);
      if (!vi.ok) return { ok: false, error: `${donde} («${titulo}»): ${vi.error}` };
      if (datosTarea.salida !== undefined) {
        if (typeof datosTarea.salida !== "string") return { ok: false, error: `${donde} («${titulo}»): «datos.salida» tiene que ser una ruta (texto).` };
        const s = datosTarea.salida.trim();
        if (s.length > 0) {
          const vr = validarRutaImagen(s);
          if (!vr.ok) return { ok: false, error: `${donde} («${titulo}»): «datos.salida»: ${vr.error}` };
        }
      }
    } else if (tipo === "reflejo") {
      // v2.5 Agéntico: la entidad es obligatoria y debe existir en el consejo.
      // Validar contra el catálogo real (no contra un string cualquiera) es la
      // diferencia entre «el chat crea planes que el motor rechaza» y uno que
      // avisa ANTES con el id exacto que sí existe.
      const id = typeof datosTarea.entidad === "string" ? datosTarea.entidad.trim() : "";
      if (!id) return { ok: false, error: `${donde} («${titulo}»): «datos.entidad» es obligatorio (id del consejo, ej. "matematico", "maq.ram").` };
      if (!entidadPorId(id)) {
        return { ok: false, error: `${donde} («${titulo}»): la entidad «${id}» no existe en el consejo (40 de v2.5 + 10 espejos; mira /api/consejo/estado).` };
      }
      if (datosTarea.frase !== undefined && typeof datosTarea.frase !== "string") {
        return { ok: false, error: `${donde} («${titulo}»): «datos.frase» tiene que ser texto.` };
      }
    }

    tareas.push({
      id: t.id === undefined || t.id === null || t.id === "" ? String(i + 1) : String(t.id),
      titulo,
      peso: t.peso === "cpu" ? "cpu" : "io",
      tipo,
      datos: datosTarea,
      dependeDe: Array.isArray(t.dependeDe) ? t.dependeDe.map((d: any) => String(d)) : [],
    });
  }

  // ── El grafo, con la autoridad del motor ─────────────────────────────────
  const plan = crearPlan(objetivo, tareas as any);
  const v = validarPlan(plan);
  if (!v.ok) return { ok: false, error: v.error || "El plan no pasa la validación del motor." };

  return {
    ok: true,
    orden: {
      tipo: "plan",
      objetivo,
      tareas,
      modelo: typeof datos.modelo === "string" && datos.modelo.trim() ? datos.modelo.trim() : undefined,
      contexto: typeof datos.contexto === "string" && datos.contexto.trim() ? datos.contexto.trim() : undefined,
      // `autoLanzar:false` es la excepción: sirve para dejar el plan preparado y
      // revisarlo antes. Por defecto se lanza, porque un plan parado no hace nada.
      autoLanzar: datos.autoLanzar !== false,
    },
  };
}

/**
 * Extrae las órdenes de un mensaje del asistente.
 *
 * Formato:
 *
 *   ```cerebronico:convertir
 *   { "desde": "json", "hacia": "yaml", "archivo": "package.json" }
 *   ```
 *
 *   ```cerebronico:abrir
 *   src/main.tsx
 *   ```
 *
 * Nunca lanza. Lo que no se entiende se devuelve en `avisos` con su motivo.
 */
export function extraerOrdenes(mensaje: string): ResultadoOrdenes {
  const ordenes: Orden[] = [];
  const avisos: string[] = [];
  const texto = String(mensaje || "");

  // El mismo delimitador de siempre (tres acentos graves), pero sólo nos quedamos
  // con los bloques que empiezan por la etiqueta.
  const re = /```[ \t]*cerebronico:([a-zA-Z]+)[ \t]*\r?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let n = 0;

  while ((m = re.exec(texto)) !== null) {
    n += 1;
    const tipo = (m[1] || "").toLowerCase();
    const cuerpo = (m[2] || "").trim();

    if (tipo === "convertir") {
      let datos: any;
      try {
        datos = JSON.parse(cuerpo);
      } catch (e: any) {
        avisos.push(`Orden «convertir» nº${n}: el contenido no es JSON válido (${e?.message || e}). No se ejecuta nada.`);
        continue;
      }
      if (!esFormatoValido(datos?.desde)) {
        avisos.push(`Orden «convertir» nº${n}: «desde» no es un formato conocido. Válidos: ${FORMATOS.join(", ")}.`);
        continue;
      }
      if (!esFormatoValido(datos?.hacia)) {
        avisos.push(`Orden «convertir» nº${n}: «hacia» no es un formato conocido. Válidos: ${FORMATOS.join(", ")}.`);
        continue;
      }
      if (datos.desde === datos.hacia) {
        avisos.push(`Orden «convertir» nº${n}: origen y destino son el mismo formato (${datos.desde}); no hay nada que hacer.`);
        continue;
      }
      const archivo = typeof datos.archivo === "string" && datos.archivo.trim() ? datos.archivo.trim() : undefined;
      const contenido = typeof datos.contenido === "string" ? datos.contenido : undefined;
      if (!archivo && contenido === undefined) {
        avisos.push(`Orden «convertir» nº${n}: falta «archivo» o «contenido». No hay nada que convertir.`);
        continue;
      }
      const salida =
        typeof datos.salida === "string" && datos.salida.trim()
          ? datos.salida.trim()
          : nombreSalidaPorDefecto(archivo || "convertido", datos.hacia);

      ordenes.push({
        tipo: "convertir",
        desde: datos.desde,
        hacia: datos.hacia,
        archivo,
        contenido,
        salida,
        opciones: datos.opciones && typeof datos.opciones === "object" ? datos.opciones : undefined,
      });
      continue;
    }

    if (tipo === "abrir") {
      const ruta = cuerpo.split("\n")[0].trim();
      if (!ruta) {
        avisos.push(`Orden «abrir» nº${n}: no dice qué archivo.`);
        continue;
      }
      ordenes.push({ tipo: "abrir", ruta });
      continue;
    }

    // ──────────────────────────────────────────────────────────────────────
    // IMAGEN — el IDE dibuja gratis (sin clave) y guarda el binario en el
    // proyecto. Aquí SOLO se valida; ejecutar es cosa de App.tsx vía
    // /api/engine/imagen. Lo que no cuadra se avisa sin generar nada.
    // ──────────────────────────────────────────────────────────────────────
    if (tipo === "imagen") {
      let datos: any;
      try {
        datos = JSON.parse(cuerpo);
      } catch (e: any) {
        avisos.push(`Orden «imagen» nº${n}: el contenido no es JSON válido (${e?.message || e}). No se ejecuta nada.`);
        continue;
      }
      const r = normalizarImagenDesdeOrden(datos);
      if (!r.ok) {
        avisos.push(`Orden «imagen» nº${n} rechazada: ${r.error}`);
        continue;
      }
      ordenes.push(r.orden);
      continue;
    }

    // ──────────────────────────────────────────────────────────────────────
    // PLAN — el chat crea un plan del cerebro.
    // Aquí NO se ejecuta nada: se construye el plan, se valida con el motor y,
    // si sale bien, App.tsx lo manda a /api/brain/plan y trae al frente la
    // pestaña Planificador. Un plan que corre donde nadie lo ve no es distinto
    // de un plan que no corre.
    // ──────────────────────────────────────────────────────────────────────
    if (tipo === "plan") {
      let datos: any;
      try {
        datos = JSON.parse(cuerpo);
      } catch (e: any) {
        avisos.push(`Orden «plan» nº${n}: el contenido no es JSON válido (${e?.message || e}). No se ejecuta nada.`);
        continue;
      }
      const r = normalizarPlanDesdeOrden(datos);
      if (!r.ok) {
        avisos.push(`Orden «plan» nº${n} rechazada: ${r.error}`);
        continue;
      }
      ordenes.push(r.orden);
      continue;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Reflejo v3.0 — 16 ACCIONES GENÉRICAS (analizar, explicar, resumir,
    // traducir, comparar, listar, buscar, ordenar, filtrar, contar, testear,
    // documentar, instalar, desplegar, refactorizar, optimizar).
    // El payload viaja como JSON con claves libres (archivo, prompt, idioma,
    // campo, paquete, destino…). Aquí solo se valida que sea un objeto y que
    // tenga al menos una clave con contenido; cada ejecutor interpreta lo suyo.
    // ──────────────────────────────────────────────────────────────────────
    if ((ACCIONES_GENERICAS_REFLEJO_V3 as readonly string[]).includes(tipo)) {
      let datos: any;
      try {
        datos = JSON.parse(cuerpo);
      } catch (e: any) {
        avisos.push(`Orden «${tipo}» nº${n}: el contenido no es JSON válido (${e?.message || e}). No se ejecuta nada.`);
        continue;
      }
      if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
        avisos.push(`Orden «${tipo}» nº${n}: el contenido no es un objeto JSON.`);
        continue;
      }
      // Filtra undefined/null y se queda con strings (las claves que el Reflejo emite son todas string).
      const limpio: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(datos)) {
        if (typeof v === "string") limpio[k] = v;
        else if (v == null) limpio[k] = undefined;
        else limpio[k] = String(v);
      }
      const tieneAlgo = Object.values(limpio).some((v) => v && v.trim().length > 0);
      if (!tieneAlgo) {
        avisos.push(`Orden «${tipo}» nº${n}: el payload está vacío. Falta el sujeto (archivo/prompt/paquete).`);
        continue;
      }
      ordenes.push({ tipo: tipo as AccionGenericaReflejo, datos: limpio });
      continue;
    }

    avisos.push(`Orden nº${n}: «${tipo}» no es una orden conocida (convertir, abrir, imagen, plan, o una de las 16 del Reflejo v3.0: analizar, explicar, resumir, traducir, comparar, listar, buscar, ordenar, filtrar, contar, testear, documentar, instalar, desplegar, refactorizar, optimizar). No se ejecuta.`);
  }

  return { ordenes, avisos };
}

/**
 * Lo que se le explica al modelo para que sepa que puede usar esto.
 *
 * Sin esto, la orden existiría y el modelo no la emitiría nunca — que es la forma
 * más silenciosa de que una función no sirva para nada.
 */
export function instruccionesParaElModelo(): string {
  return [
    "PUEDES PEDIR CONVERSIONES DE FORMATO. Cuando el usuario quiera cambiar un archivo de formato",
    "(JSON, YAML, TOML, CSV), no escribas el resultado a mano: emite esta orden y el IDE la ejecuta,",
    "deja el archivo en el editor y refresca la vista previa.",
    "",
    "```cerebronico:convertir",
    '{ "desde": "json", "hacia": "yaml", "archivo": "package.json" }',
    "```",
    "",
    "Campos: `desde` y `hacia` (json, yaml, toml, csv) son obligatorios. Usa `archivo` con la ruta dentro",
    "del proyecto, o `contenido` con el texto literal. `salida` es opcional (por defecto se cambia la",
    "extensión del origen). Se admiten `opciones` (indentacion, ordenarClaves, separadorCsv, inferirTiposCsv).",
    "",
    "ADVERTENCIA QUE DEBES DAR AL USUARIO: ninguna conversión es mágica. JSON no admite comentarios, TOML",
    "no tiene nulos y CSV no guarda tipos. El IDE devolverá un informe de pérdidas; resúmetelo al usuario",
    "en vez de decir que todo salió perfecto.",
    "",
    "PUEDES CREAR UN PLAN DE TAREAS EN SEGUNDO PLANO. Cuando el usuario pida un trabajo largo o de varios",
    "pasos («convierte todos estos archivos», «lee estos ficheros y resúmelos», «analiza esto con el modelo»),",
    "no lo hagas de palabra: emite el plan y el IDE lo ejecuta en paralelo, mostrándolo en la pestaña",
    "Planificador. Las tareas independientes corren a la vez; las que dependen de otras, esperan.",
    "",
    "```cerebronico:plan",
    '{ "objetivo": "Convertir los datos a tres formatos", "tareas": [',
    '  { "id": "1", "titulo": "leer datos", "tipo": "leer_archivo", "peso": "io", "datos": { "ruta": "datos.csv" } },',
    '  { "id": "2", "titulo": "a YAML", "tipo": "convertir", "datos": { "desde": "csv", "hacia": "yaml", "archivo": "datos.csv", "salida": "datos.yaml" }, "dependeDe": ["1"] },',
    '  { "id": "3", "titulo": "a TOML", "tipo": "convertir", "datos": { "desde": "csv", "hacia": "toml", "archivo": "datos.csv", "salida": "datos.toml" }, "dependeDe": ["1"] }',
    "] }",
    "```",
    "",
    "Tipos de tarea (son los CINCO que existen; no hay «ejecutar comando» a propósito):",
    "  · modelo         datos: { prompt, contexto?, modelo? }   — preguntar al modelo",
    "  · leer_archivo   datos: { ruta }                          — leer un archivo del proyecto",
    "  · convertir      datos: { desde, hacia, archivo|contenido, salida? }",
    "  · generar_imagen datos: { prompt, salida?, ancho?, alto?, modelo?, seed? }  — dibujo gratis en segundo plano",
    "  · reflejo         datos: { entidad, frase? , datos? }  — entidad del consejo Agéntico (matematico, maq.ram, texto.contar…); con «frase» vota un especialista, sin ella ejecuta la herramienta con «datos»",
    ...(notaSeleccionEspejos() ? ["", notaSeleccionEspejos(), "Cuando el pedido encaje con ese equipo, crea tareas «reflejo» con esos ids: son deterministas y no gastan RAM del modelo."] : []),
    "Opcional: `modelo` y `contexto` en la raíz se aplican a todas las tareas de tipo modelo;",
    "`autoLanzar: false` deja el plan preparado sin arrancarlo (para que el usuario lo revise).",
    "`peso` es «io» (espera de red/disco) o «cpu» (cálculo); ayuda a repartir la máquina.",
    "",
    "REGLAS QUE SE VERIFICAN ANTES DE CREARLO, y si no se cumplen el plan se RECHAZA:",
    "  · los `id` no se repiten;",
    "  · todo `dependeDe` apunta a un id que existe en el plan;",
    "  · sin dependencias circulares (un ciclo no termina nunca: se cuelga);",
    "  · cada tarea trae los datos que su tipo necesita.",
    "Si tu plan es rechazado, corrige lo que dice el aviso y vuelve a emitirlo.",
    "",
    "PUEDES GENERAR IMÁGENES GRATIS (sin clave, sin cuenta). Cuando el usuario pida un logo, una",
    "ilustración, un fondo o un mockup visual, no lo describas: emite la orden y el IDE la dibuja,",
    "guarda el archivo en el proyecto y refresca la vista previa.",
    "",
    "```cerebronico:imagen",
    '{ "prompt": "logo minimalista de un cerebro de neón, fondo oscuro", "salida": "img/logo.jpg", "ancho": 1024, "alto": 1024, "modelo": "sana", "seed": 42 }',
    "```",
    "",
    "Campos: `prompt` es el único obligatorio (256–2048 px por lado; 1024×1024 por defecto). `salida`",
    "es la ruta dentro del proyecto (extensión .jpg, .jpeg, .png o .webp); si falta se guarda en img/.",
    "SÉ HONESTO CON EL USUARIO: sin clave el servicio tarda hasta ~1 minuto por imagen y el modelo",
    "que responde de verdad no siempre es el pedido; el IDE te devolverá el modelo real y sus avisos.",
    "Resúmelos en vez de decir que la imagen salió «perfecta». Para varias imágenes de una vez, crea",
    "un plan con tareas `generar_imagen` (corren en segundo plano y en paralelo).",
    "",
    "Para abrir un archivo en el editor:",
    "```cerebronico:abrir",
    "src/main.tsx",
    "```",
  ].join("\n");
}
