/**
 * planExecutors.ts — QUÉ HACE CADA TAREA (v2.2)
 * =============================================
 * El planificador no sabe qué es un modelo ni un archivo: solo llama a un
 * ejecutor. Aquí está ese ejecutor, y lo único que hace es mirar `tarea.tipo` y
 * repartir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HAY TAN POCOS TIPOS, Y A PROPÓSITO
 * ─────────────────────────────────────────────────────────────────────────────
 * Están `modelo`, `leer_archivo`, `convertir`, `generar_imagen` y `reflejo` (v2.5).
 * NO hay "ejecutar comando", y no es un olvido:
 * dejar que un plan lanzado en segundo plano ejecute comandos arbitrarios en tu
 * PC sin que nadie los confirme es exactamente el tipo de puerta que no se debe
 * abrir por comodidad. Ese tipo necesita su propio diseño de permisos (qué se
 * permite, quién lo aprueba, qué queda registrado), y es una decisión tuya.
 *
 * Un `tipo` desconocido NO se intenta: se lanza un error claro y la tarea queda
 * FALLIDA con el motivo escrito. Nada de "se intentó y no se supo qué pasó".
 *
 * Todo lo de fuera (el modelo, el disco) entra por parámetros, así que este
 * módulo se puede probar sin Ollama, sin red y sin tocar ficheros.
 */

import type { Ejecutor, Tarea } from "./taskPlanner";
import { convertir, FORMATOS, type Formato, type OpcionesConversion, type Resultado as ResultadoConversion } from "./formatConverter";
import { validarDatosImagen, type ResultadoImagen } from "./imageGen";

/** Lo que este módulo necesita del mundo exterior. Se inyecta. */
export interface PrimitivasPlanes {
  /** Pregunta al modelo y devuelve su texto. Debe respetar la señal de aborto. */
  pedirModelo: (p: { prompt: string; modelo?: string; contexto?: string; senal: AbortSignal }) => Promise<string>;
  /** Lee un archivo ya validado por quien implemente esta función. */
  leerArchivo: (ruta: string) => Promise<string>;
  /** Guarda el resultado completo y devuelve una referencia (ruta o id). */
  guardarResultado?: (nombre: string, texto: string, extension?: string) => Promise<string>;
  /**
   * Genera una imagen con la cadena de proveedores gratuitos. La tarea se
   * declara NO DISPONIBLE (falla una vez, sin reintentar) si no se inyecta:
   * es mejor decirlo que fingir que se dibujó algo.
   */
  /**
   * `intentos` (GRUPO v1): cuántas veces insistir sobre Pollinations antes de
   * dar la vuelta a Gemini. El ejecutor pide 2 por tarea; el planificador ya
   * trae su propio reintento con drenaje de cola como segunda red.
   */
  generarImagen?: (p: { prompt: string; ancho?: number; alto?: number; modelo?: string; seed?: number; senal: AbortSignal; intentos?: number }) => Promise<ResultadoImagen>;
  /**
   * Guarda un BINARIO (imagen) dentro del proyecto y devuelve la ruta relativa.
   * La ruta ya viene validada por `validarDatosImagen` + la orden del chat; quien
   * implemente esta primitiva vuelve a comprobar el confinamiento al escribir.
   */
  guardarBinario?: (rutaRel: string, data: Uint8Array, mime: string) => Promise<string>;
  /**
   * v2.5 (Agéntico) — ejecuta una ENTIDAD del consejo por id (herramienta
   * determinista). Se inyecta desde server.ts a propósito: el motor NO importa
   * el reflejo, porque cerebroReflejo→chatOrders→planExecutors ya es un viaje
   * y añadir el regreso cerraría un ciclo de módulos. La raíz de composición
   * (el servidor) es la única que puede tocar los dos mundos.
   */
  entidad?: (id: string, datos: any) => Promise<{ ok: boolean; salida?: string; motivo?: string; ms: number }>;
  /** Frase → orden del reflejo (los 12 especialistas votantes). */
  reflejar?: (frase: string) => Promise<{ ok: boolean; accion: string; salida?: string; motivo?: string; entidad?: string; confianza: number }>;
  /**
   * GRUPO v1 (Reflejo v5) — frase → LEY del orquestador (espejo + datos +
   * confianza). Se inyecta desde server.ts con `planificadorPorLeyes`, mismo
   * patrón que `entidad`: el motor no importa reflejo (cerraría el ciclo
   * cerebroReflejo→chatOrders→planExecutors→reflejo). Con esto, una tarea
   * `reflejo` que trae solo una frase ya no depende de que el votante neural
   * despierte: la ley determinista enruta y el espejo contesta en ~1 ms.
   * Tipo estructural a propósito: sin import del orquestador aquí.
   */
  orquestar?: (frase: string) => Promise<{
    ok: boolean; espejo?: string; datos?: Record<string, unknown>; ley?: string;
    modo?: "espejo-local" | "ollama-externo"; endpoint?: string; confianza?: number; motivo?: string;
  }>;
  /** Modelo a usar cuando la tarea no dice cuál. */
  modeloPorDefecto?: string;
  onAviso?: (linea: string) => void;
}

export const TIPOS_SOPORTADOS = ["modelo", "leer_archivo", "convertir", "generar_imagen", "reflejo"] as const;

/** El informe de una conversión, en texto que se pueda leer y guardar. */
function informeLegible(desde: Formato, hacia: Formato, r: ResultadoConversion, ref: string): string {
  const lineas: string[] = [];
  lineas.push(
    `${desde.toUpperCase()} → ${hacia.toUpperCase()} · ${r.informe.bytesEntrada} → ${r.informe.bytesSalida} bytes · ${r.informe.claves} clave(s)` +
      (ref ? ` · guardado en ${ref}` : "")
  );
  if (r.informe.perdidas.length === 0) {
    lineas.push("Sin pérdidas declaradas.");
  } else {
    lineas.push(`PÉRDIDAS DECLARADAS (${r.informe.perdidas.length}) — no es un fallo, es lo que el formato no puede guardar:`);
    for (const p of r.informe.perdidas) lineas.push(`  · ${p.que}: ${p.detalle}`);
  }
  for (const a of r.informe.avisos) lineas.push(`  aviso: ${a}`);
  return lineas.join("\n");
}

/**
 * Error que NO se debe reintentar: la tarea está mal definida (un tipo que no
 * existe, una ruta que falta). No es un fallo de red ni del modelo, así que
 * reintentarlo solo gasta tiempo y ensucia el log.
 *
 * `classifyError` trata lo desconocido como reintentable UNA vez — es una decisión
 * deliberada y correcta para fallos de red. Por eso hace falta marcar los errores
 * de configuración: sin la marca, un tipo de tarea imposible se intentaba DOS
 * veces antes de rendirse.
 */
function errorFatal(mensaje: string): Error {
  const e = new Error(mensaje);
  (e as any).fatal = true;
  return e;
}

/** Máximo que se guarda en el resumen del plan (el texto completo va aparte). */
const MAX_RESUMEN = 2000;

export function crearEjecutorDePlanes(p: PrimitivasPlanes): Ejecutor {
  const avisar = (l: string) => {
    try {
      p.onAviso?.(l);
    } catch {}
  };

  const texto = (v: unknown, porDefecto = ""): string => (typeof v === "string" ? v : porDefecto);

  return async (tarea: Tarea, senal: AbortSignal) => {
    const tipo = (tarea.tipo || "modelo").trim();
    const datos = (tarea.datos || {}) as Record<string, unknown>;

    switch (tipo) {
      case "modelo": {
        const prompt = texto(datos.prompt, tarea.titulo);
        const contexto = texto(datos.contexto);
        const modelo = texto(datos.modelo, p.modeloPorDefecto || "");
        avisar(`#${tarea.id} → modelo${modelo ? ` ${modelo}` : ""}: ${prompt.slice(0, 90)}${prompt.length > 90 ? "…" : ""}`);
        const respuesta = await p.pedirModelo({ prompt, modelo, contexto, senal });
        return await empaquetar(tarea, respuesta, p, avisar);
      }

      // ────────────────────────────────────────────────────────────────────
      // CONVERTIR — el conversor interno, como una tarea más del cerebro.
      // El resultado NO es sólo el texto convertido: incluye el INFORME DE
      // PÉRDIDAS. Un plan que convierte 40 archivos y no dice qué se perdió en
      // cada uno no sirve; sería exactamente el fallo silencioso que este
      // proyecto no se permite.
      // ────────────────────────────────────────────────────────────────────
      case "convertir": {
        const desde = texto(datos.desde) as Formato;
        const hacia = texto(datos.hacia) as Formato;
        if (!FORMATOS.includes(desde)) throw errorFatal(`Formato de entrada desconocido: «${desde || "(vacío)"}». Válidos: ${FORMATOS.join(", ")}.`);
        if (!FORMATOS.includes(hacia)) throw errorFatal(`Formato de salida desconocido: «${hacia || "(vacío)"}». Válidos: ${FORMATOS.join(", ")}.`);

        let contenido = texto(datos.contenido);
        const archivo = texto(datos.archivo);
        if (!contenido && archivo) contenido = await p.leerArchivo(archivo);
        if (!contenido) throw errorFatal(`La tarea #${tarea.id} no trae «datos.contenido» ni «datos.archivo»: no hay nada que convertir.`);

        const r: ResultadoConversion = convertir(contenido, desde, hacia, (datos.opciones || {}) as OpcionesConversion);
        if (!r.ok) throw errorFatal(r.error || `Falló la conversión ${desde} → ${hacia}.`);

        const nombre = texto(datos.salida, `convertido-${tarea.id}`);
        let ref = "";
        if (p.guardarResultado) {
          try {
            ref = await p.guardarResultado(nombre, r.salida, hacia);
          } catch (e: any) {
            avisar(`No se pudo guardar la conversión de #${tarea.id} (${e?.message || e}); el texto convertido se pierde, el informe no.`);
          }
        }

        return {
          resumen: informeLegible(desde, hacia, r, ref),
          artefactos: ref ? [ref] : [],
        };
      }

      case "leer_archivo": {
        const ruta = texto(datos.ruta);
        if (!ruta) {
          throw errorFatal(`La tarea #${tarea.id} es de tipo "leer_archivo" pero no trae "datos.ruta". No hay nada que leer.`);
        }
        const contenido = await p.leerArchivo(ruta);
        return {
          resumen: `Leído «${ruta}» (${contenido.length} caracteres).`,
          artefactos: [ruta],
        };
      }

      // ────────────────────────────────────────────────────────────────────
      // GENERAR_IMAGEN — el cuarto tipo de tarea (v2.3).
      // Pesado en IO, no en CPU: el dibujo lo hace un proveedor remoto.
      //
      // Lo que hace que no mienta el resumen:
      //   · el MODELO que se declara es el que respondió (cabecera), no el pedido;
      //   · cada proveedor que falló o se saltó sale en su línea, con el motivo;
      //   · si nada funcionó, la tarea FALLA con la lista completa de fallos
      //     (y el planificador reintenta UNA vez: es red, no configuración).
      // ────────────────────────────────────────────────────────────────────
      case "generar_imagen": {
        if (!p.generarImagen) {
          throw errorFatal(`La tarea #${tarea.id} es de tipo "generar_imagen" pero este contexto no tiene la cadena de proveedores cableada. No se dibujó nada.`);
        }
        const v = validarDatosImagen(datos);
        if (!v.ok) throw errorFatal(`La tarea #${tarea.id} (generar_imagen): ${v.error}`);

        const r: ResultadoImagen = await p.generarImagen({
          prompt: v.prompt,
          ancho: v.ancho,
          alto: v.alto,
          modelo: v.modelo,
          seed: v.seed,
          senal,
        });

        if (!r.ok) {
          // NO es fatal: es la red. `classifyError` lo verá como reintentable
          // una vez (la congestión gratuita, medida, se va en el reintento).
          throw new Error(r.error || `No se pudo generar la imagen de la tarea #${tarea.id}.`);
        }

        const salida = texto(datos.salida);
        let ref = "";
        if (salida) {
          if (p.guardarBinario) {
            try {
              ref = await p.guardarBinario(salida, r.bytes as Uint8Array, r.tipoMime as string);
              // Si el servidor corrigió la extensión al formato real de los
              // bytes (un JPEG pedido como .png), se dice: comparar por nombre
              // base, que la ruta puede traer el prefijo de la raíz anidada sin
              // que eso sea una corrección.
              if (ref && (ref.split("/").pop() || "") !== (salida.split("/").pop() || "")) {
                avisar(`#${tarea.id}: se pidió «${salida}» y se guardó como «${ref.split("/").pop()}» — la extensión se corrigió al formato real de los bytes (un archivo no se mal etiqueta).`);
              }
            } catch (e: any) {
              avisar(`La imagen de #${tarea.id} se generó pero NO se guardó en «${salida}» (${e?.message || e}); queda la URL como referencia.`);
            }
          } else {
            avisar(`#${tarea.id} pidió guardar en «${salida}» pero este contexto no tiene escritura binaria; la imagen queda en la URL, no en el proyecto.`);
          }
        }

        const lineas: string[] = [
          `Imagen generada · proveedor ${r.proveedor} · modelo REAL ${r.modeloUsado || "?"} · ${r.tipoMime} · ${((r.bytes?.length || 0) / 1024).toFixed(1)} KB · ${((r.ms || 0) / 1000).toFixed(1)} s` +
            (ref ? ` · guardada en ${ref}` : "") +
            (r.url ? ` · ${r.url}` : ""),
        ];
        for (const a of r.advertencias) lineas.push(`  · aviso: ${a}`);
        for (const f of r.fallos) lineas.push(`  · proveedor fallido/saltado: ${f.proveedor} → ${f.motivo}`);

        return {
          resumen: lineas.join("\n"),
          artefactos: [...(ref ? [ref] : []), ...(r.url ? [r.url] : [])],
        };
      }

      // ────────────────────────────────────────────────────────────────────
      // v2.5 AGÉNTICO — una entidad del consejo (herramienta determinista) o
      // un especialista votando la frase. `microsegundos, sin RAM extra`:
      // estas tareas llenan el paralelo del planificador sin tocar el neural.
      // ────────────────────────────────────────────────────────────────────
      case "reflejo": {
        const id = texto(datos.entidad);
        const frase = texto(datos.frase);

        // ── GRUPO v1 (Reflejo v5) · la frase primero, y con red determinista ──
        // 🐞 DEFECTO v1.0.3: una tarea reflejo que traía solo frase moría exi-
        // giendo «datos.entidad» AUNQUE llevara frase — el orden del chequeo
        // estaba al revés de la intención. Y cuando el consejo decía «no», la
        // tarea simplemente fallaba, aunque existiera una ley del orquestador
        // capaz de enrutarla a un espejo en ~1 ms. Ahora:
        //   frase → votante neural (si está) → si dice no, LEY del orquestador
        //   → si tampoco hay ley, el fallo declara qué faltó.
        // Con dudas el orquestador NO adivina: el fallo es declarativo y el
        // planificador decide el reintento.
        const rutaPorLey = async (motivoVoto: string): Promise<{ resumen: string; artefactos?: string[]; tokensAprox?: number }> => {
          if (!p.orquestar || !p.entidad) throw errorFatal(`El consejo respondió «no» a "${frase.slice(0, 60)}": ${motivoVoto}${p.orquestar ? " (el orquestador por ley tampoco pudo)" : " — y este contexto no inyecta el orquestador por ley"}`);
          const ro = await p.orquestar(frase);
          if (!ro.ok) throw errorFatal(`el orquestador no enrutó «${frase.slice(0, 60)}» (${motivoVoto}): ${ro.motivo || "sin motivo"}`);
          if (ro.modo === "ollama-externo") {
            throw errorFatal(`la ley «${ro.ley}» pide Ollama externo (${ro.endpoint || "sin endpoint"}); este contexto no despacha fuera — usa /api/espejos/orquestar desde el chat.`);
          }
          const re2 = await p.entidad(ro.espejo || "", ro.datos ?? {});
          if (!re2.ok) throw errorFatal(`${ro.espejo} falló (ley ${ro.ley}): ${re2.motivo || "sin motivo"}`);
          return {
            resumen: `🪞 orquestado · ley ${ro.ley} · ${ro.espejo} · confianza ${Math.round((ro.confianza ?? 0) * 100)}%\n${re2.salida || "(sin salida)"}`.slice(0, 2000),
            artefactos: [],
          };
        };

        if (frase) {
          if (p.reflejar) {
            const rr = await p.reflejar(frase);
            if (rr.ok) return { resumen: `reflejo · ${rr.entidad || rr.accion} · confianza ${(rr.confianza * 100).toFixed(0)}%\n${rr.salida || ""}`, artefactos: [] };
            return await rutaPorLey(rr.motivo || rr.accion);
          }
          return await rutaPorLey("no hay votante neural en este contexto");
        }

        if (!id) throw errorFatal(`La tarea #${tarea.id} es de tipo "reflejo" pero no trae ni "datos.frase" ni "datos.entidad" (el id del consejo, ej. "matematico" o "maq.ram").`);
        if (!p.entidad) throw errorFatal(`Este contexto no inyecta las entidades del consejo (primitiva "entidad" ausente).`);
        const re = await p.entidad(id, datos.datos ?? {});
        if (!re.ok) throw errorFatal(`Entidad «${id}» respondió «no»: ${re.motivo || "sin motivo declarado (bug: repórtalo)"}`);
        return { resumen: `entidad ${id} · ${re.ms} ms\n${re.salida || "(sin salida)"}`, artefactos: [] };
      }

      default:
        throw errorFatal(
          `Tipo de tarea desconocido: "${tipo}". Soportados: ${TIPOS_SOPORTADOS.join(", ")}. ` +
            `La tarea NO se ha ejecutado (esto no es un fallo de red ni del modelo).`
        );
    }
  };
}

/**
 * Deja el resultado listo sin engordar el fichero de planes: el texto completo se
 * guarda aparte y en el plan queda una referencia más un resumen recortado.
 */
async function empaquetar(
  tarea: Tarea,
  respuesta: string,
  p: PrimitivasPlanes,
  avisar: (l: string) => void
): Promise<{ resumen: string; artefactos?: string[]; tokensAprox?: number }> {
  const limpio = (respuesta || "").trim();
  const artefactos: string[] = [];

  if (p.guardarResultado && limpio.length > MAX_RESUMEN) {
    try {
      const ref = await p.guardarResultado(`plan-${tarea.id}`, limpio);
      artefactos.push(ref);
    } catch (e: any) {
      // No poder guardar el texto completo no puede hacer fallar una tarea que
      // sí produjo respuesta: se recorta y se avisa.
      avisar(`No se pudo guardar el resultado completo de #${tarea.id} (${e?.message || e}); se guarda recortado.`);
    }
  }

  const resumen =
    limpio.length > MAX_RESUMEN
      ? `${limpio.slice(0, MAX_RESUMEN)}\n… [recortado: ${limpio.length - MAX_RESUMEN} caracteres más${artefactos.length ? `, completos en ${artefactos[0]}` : ""}]`
      : limpio || "(el modelo no devolvió texto)";

  return {
    resumen,
    artefactos: artefactos.length ? artefactos : undefined,
    // Cuenta aproximada (≈4 caracteres por token). Es una estimación y se dice.
    tokensAprox: Math.round(limpio.length / 4),
  };
}
