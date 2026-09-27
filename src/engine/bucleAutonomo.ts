/**
 * bucleAutonomo.ts — EL BUCLE NO SE DETIENE A MITAD DE TAREA (v1.16.0)
 * ====================================================================
 * QUÉ ES: el juez determinista del bucle de herramientas del agente. Decide,
 * SIN llamar al modelo, si una respuesta que no trae herramienta es el fin de
 * la tarea o una parada a mitad — y en ese caso con qué directiva se empuja.
 *
 * POR QUÉ EXISTE: el pedido del usuario es literal — «el modelo no debe
 * detenerse a la mitad de una tarea; si ya se le marcó un destino tiene que
 * saber solo por cuál camino ir, o si tiene que dar la vuelta para tomar otro;
 * si falla, seguir con la solución, no esperar a que el usuario le diga
 * "continúa con…"».
 *
 * El defecto real: `runOllamaAgentLoop` cortaba en cuanto el modelo devolvía
 * texto sin herramienta. La versión v1.15.1 solo empujaba si la respuesta era
 * CORTA (<160 caracteres) y en futuro — un «voy a revisar los 6 módulos,
 * analizaré cada uno y luego escribiré los tests…» de 200 caracteres se
 * escapaba y el chat quedaba esperando una orden para seguir haciendo su
 * propio trabajo. Y cuando se agotaban los 10 pasos, el bucle respondía
 * «Completado» con tareas colgando: mentía.
 *
 * Cómo lo cierra:
 *   · el PLAN manda — si quedó alguna tarea sin cerrar, no se cierra el turno;
 *   · pedir permiso («¿querés que continúe?») es una parada, no un final;
 *   · un fallo de herramienta dispara DESVÍO, no espera;
 *   · el techo de pasos crece con el tamaño del plan (y sigue topado);
 *   · si de verdad se agota, el informe dice qué falta en vez de decir «listo».
 *
 * Es PURA FUNCIÓN y vive fuera de server.ts por las dos reglas de la casa: el
 * monolito no crece (trinquete de líneas) y lo nuevo se prueba en seco.
 */

export type EstadoTarea = "pending" | "running" | "done" | "failed";

export interface TareaPlan {
  id: string;
  description: string;
  status: EstadoTarea;
}

export interface UltimoFallo {
  herramienta: string;
  error: string;
}

export interface SeñalBucle {
  /** Lo que el modelo respondió en este turno (sin llamadas a herramientas). */
  contenido: string;
  /** El plan que el propio agente declaró (set_plan / update_task). */
  plan: TareaPlan[];
  /** Paso ya consumido (0-based, como el `for` del bucle). */
  paso: number;
  /** Techo de pasos vigente en este turno. */
  maxPasos: number;
  /** Fallo de la última herramienta, o null si la última salió bien. */
  ultimoFallo?: UltimoFallo | null;
}

export type Decision =
  | { accion: "continuar"; motivo: string; directiva: string }
  | { accion: "cerrar"; motivo: string; informe: string };

/** Base del techo de pasos (el valor histórico de `maxSteps`). */
export const PASOS_BASE = 10;
/** Techo duro: ni el plan más grande puede correr sin frontera. */
export const PASOS_TOPE = 48;
/** Pasos extra por tarea abierta: una tarea realista son ~3 idas y vueltas. */
export const PASOS_POR_TAREA = 3;

// ── Señales lingüísticas de "esto no terminó" ───────────────────────────────
const RE_CIERRE =
  /\b(listo|hecho|completado|terminado|finalizado|resultado|éxito|exitosa|funciona|creado|escrito|✓)\b/i;
const RE_INTENCION =
  /\b(voy a|voy|ire a|iré a|procedo|procederé|procedere|déjame|dejame|vamos a|empezaré|empezare|comenzaré|comenzare|analizaré|analizare|revisaré|revisare|escanearé|escanigare|continuaré|continuare|sigo con|el siguiente paso|siguiente paso|a continuación|en el próximo paso|me falta|todavía falta|falta|debo|tengo que|luego voy|ahora voy|ahora leo|ahora escribo)\b/i;
const RE_PIDE_PERMISO =
  /(¿\s*(quieres|querés|deseas|prefieres|prefirieres|necesitas|necesitás|continúo|continuo|avanzo|sigo|te parece)|si quer[e]s que|si quieres que|dime si|decime si|¿algo más|necesit[áa]s que|¿por dónde|¿qu[eé] prefieres|dime c[oó]mo|decime c[oó]mo|c[oó]mo seguimos|por d[oó]nde sigo|qu[eé] quer[e]s que haga)/i;
const RE_CORTE = /(…|\.\.\.|[,;:]\s*$)/;

/** Normaliza el estado que reporta el modelo (`completed`, `in_progress`…). */
export function normalizarEstado(valor: unknown): EstadoTarea | null {
  const s = String(valor ?? "").trim().toLowerCase();
  if (["done", "completed", "completada", "completado", "terminado", "ok", "✓"].includes(s)) return "done";
  if (["running", "in_progress", "inprogress", "ejecutando", "en curso"].includes(s)) return "running";
  if (["failed", "error", "fallida", "falló", "fallo"].includes(s)) return "failed";
  if (["pending", "pendiente", "todo", "queued"].includes(s)) return "pending";
  return null;
}

/**
 * Aplica al plan lo que el agente acaba de hacer con `set_plan` / `update_task`.
 * El bucle ya emitía esos eventos para el tablero; acá sirven para lo mismo pero
 * en memoria del motor: sin plan conocido no se puede saber si se está a mitad.
 */
export function actualizarPlanDesdeHerramienta(
  plan: TareaPlan[],
  herramienta: string,
  args: any
): void {
  if (herramienta === "set_plan" && Array.isArray(args?.tasks)) {
    plan.length = 0;
    args.tasks.forEach((t: any, i: number) => {
      plan.push({
        id: String(t?.id ?? `t${i + 1}`),
        description: String(t?.description ?? t?.titulo ?? ""),
        status: normalizarEstado(t?.status) ?? "pending",
      });
    });
    return;
  }
  if (herramienta === "update_task") {
    const id = String(args?.task_id ?? args?.taskId ?? "");
    const estado = normalizarEstado(args?.status);
    const tarea = plan.find((p) => p.id === id);
    if (tarea && estado) tarea.status = estado;
  }
}

export function tareasPendientes(plan: TareaPlan[]): TareaPlan[] {
  return plan.filter((t) => t.status === "pending" || t.status === "running");
}

/**
 * Techo de pasos dinámico: un plan de 12 tareas no termina en 10 pasos. Crece
 * con el plan pero choca contra `PASOS_TOPE`, que es la frontera dura.
 */
export function techoDePasos(
  tareasAbiertas: number,
  base = PASOS_BASE,
  tope = PASOS_TOPE
): number {
  return Math.min(tope, base + Math.max(0, tareasAbiertas) * PASOS_POR_TAREA);
}

/**
 * ¿Esta respuesta es una parada a mitad? Devuelve el motivo (para el log del
 * tablero) o null si el modelo efectivamente cerró.
 *
 * El orden importa: el plan sin cerrar manda sobre cualquier prosa de cierre,
 * porque un modelo que dice «listo» con tareas pendientes MINTIÓ, y el bucle no
 * puede premiar la mentira con el fin del turno.
 */
export function motivoDeParada(contenido: string, pendientes: TareaPlan[]): string | null {
  if (pendientes.length > 0) return `quedan ${pendientes.length} tarea(s) del plan sin cerrar`;
  const c = String(contenido ?? "").trim();
  if (c === "") return "respuesta vacía sin herramienta";
  if (RE_PIDE_PERMISO.test(c)) return "pidió permiso para seguir";
  if (RE_CORTE.test(c)) return "el texto se corta a mitad de frase";
  if (RE_INTENCION.test(c) && !RE_CIERRE.test(c)) return "anuncia una intención y no la ejecuta";
  return null;
}

/** La directiva que se le manda al modelo para que siga, sin preguntarle nada al usuario. */
export function directivaDeContinuacion(
  pendientes: TareaPlan[],
  ultimoFallo?: UltimoFallo | null
): string {
  const partes: string[] = ["No te detengas a mitad de la tarea."];
  if (pendientes.length > 0) {
    partes.push(
      `Tareas abiertas: ${pendientes.map((t) => `${t.id}=${t.description}`).join(" · ")}.`
    );
  } else {
    partes.push("Todavía no cerraste el objetivo: ejecutá el paso que sigue.");
  }
  partes.push(
    "EJECUTÁ ahora con las herramientas disponibles (read_file, write_file, edit_file, run_command…)."
  );
  partes.push(
    "No pidas permiso ni confirmes lo obvio: el destino ya está definido por el pedido original."
  );
  partes.push(
    ultimoFallo
      ? `«${ultimoFallo.herramienta}» falló: ${ultimoFallo.error.slice(0, 160)}. No esperes instrucciones ni le devuelvas la tarea al usuario: tomá otro camino —otra herramienta, otra ruta, creá el archivo o la carpeta que falta, ajustá el comando— y volvé a intentar.`
      : "Si un camino no sale, no lo repitas igual: cambiá de herramienta, de ruta o de enfoque y seguí."
  );
  partes.push("Cerrá con «listo» solo cuando no quede ninguna tarea abierta.");
  return partes.join(" ");
}

/**
 * Informe honesto de cierre. Si quedó algo abierto, lo dice: el bucle ya no
 * puede responder «Completado» con tareas colgando.
 */
export function informeHonesto(pendientes: TareaPlan[], agotados: boolean): string {
  if (pendientes.length === 0) return "";
  const cab = agotados
    ? `⚠️ Se agotó el techo de pasos del bucle y quedan ${pendientes.length} tarea(s) abiertas:`
    : `Quedan ${pendientes.length} tarea(s) abiertas:`;
  return `${cab}\n${pendientes.map((t) => `- ${t.id}: ${t.description}`).join("\n")}`;
}

/**
 * LA DECISIÓN. El bucle llama esto cuando el modelo responde sin herramienta.
 * Nota de diseño: `paso >= maxPasos - 1` es el único caso donde se corta aun
 * habiendo pendientes — y ahí se informa, no se finge.
 */
export function decidirBucle(señal: SeñalBucle): Decision {
  const pendientes = tareasPendientes(señal.plan);
  if (señal.paso >= señal.maxPasos - 1) {
    return {
      accion: "cerrar",
      motivo: "techo de pasos alcanzado",
      informe: informeHonesto(pendientes, true),
    };
  }
  // Un fallo SIN resolver no cierra el turno aunque la prosa lo pinte como
  // final: primero se prueba por otro camino. Es el corazón del pedido
  // «si falla, seguir con la solución, no esperar a que digan continúa».
  if (señal.ultimoFallo) {
    return {
      accion: "continuar",
      motivo: `última herramienta falló (${señal.ultimoFallo.herramienta})`,
      directiva: directivaDeContinuacion(pendientes, señal.ultimoFallo),
    };
  }
  const motivo = motivoDeParada(señal.contenido, pendientes);
  if (motivo) {
    return {
      accion: "continuar",
      motivo,
      directiva: directivaDeContinuacion(pendientes, señal.ultimoFallo),
    };
  }
  return {
    accion: "cerrar",
    motivo: "el modelo cerró sin tareas abiertas",
    informe: informeHonesto(pendientes, false),
  };
}
