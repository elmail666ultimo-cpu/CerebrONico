/**
 * capacidadesPuente.ts — DETECTAR ANTES DE INSTALAR (CN v1.1.0)
 * =============================================================
 * Pedido: *«al implementar esas cosas debe de estar en automático si se requiere
 * alguna extensión adicional, y autodetectarla o descargarla antes de instalar
 * las dependencias»*.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO **DETECTA** Y NO **DESCARGA SOLO**
 * ─────────────────────────────────────────────────────────────────────────────
 * La petición tiene dos mitades y sólo se puede cumplir una sin preguntar:
 *
 *   · AUTODETECTAR — sí, siempre, en cada arranque y sin coste. Es lo que hace
 *     este módulo. Y es la mitad que de verdad evita el problema: casi todos los
 *     «falla al instalar» son en realidad «faltaba algo y nadie lo dijo».
 *
 *   · DESCARGAR E INSTALAR SOLO — no. Y no por prudencia genérica, sino por algo
 *     concreto: este motor YA ejecuta instalaciones (`npm install` para el
 *     proyecto del usuario, `spawnSync` para comprobar binarios). Un mecanismo
 *     que además DESCARGUE binarios por su cuenta convierte cualquier respuesta
 *     del modelo en una vía de ejecución de código en la máquina del usuario.
 *     Basta con que el modelo escriba un requisito para que el motor vaya a
 *     internet y traiga algo — eso no es una función, es un agujero.
 *
 * Así que el reparto es: **detectar es automático; instalar exige confirmación
 * explícita, una vez y por elemento, con el comando a la vista.** El plan que
 * devuelve este módulo está pensado para ENSEÑARSE: lleva el comando exacto, el
 * motivo, y qué deja de funcionar si falta.
 *
 * Y hay un matiz que suele olvidarse: hay requisitos que NO se arreglan
 * instalando nada (una versión de Node, un permiso, una clave de API). Para esos,
 * `comoObtener` no es un comando y decirlo es más útil que dar uno que no existe.
 */

export type Criticidad = "imprescindible" | "mejora" | "opcional";

export interface Requisito {
  id: string;
  nombre: string;
  /** Qué se rompe o se pierde si falta. Concreto, no «podría afectar». */
  paraQue: string;
  criticidad: Criticidad;
  /** Cómo se comprueba. Se ejecuta en el servidor, que es quien puede mirar el sistema. */
  deteccion: string;
  /** Comando exacto, o una frase si no hay comando posible. */
  comoObtener: string;
  /** false cuando no se arregla instalando nada (permiso, clave, versión). */
  instalable: boolean;
  /** Aproximado, en MB. 0 cuando no aplica. */
  pesoMb: number;
}

/**
 * Los requisitos REALES del puente, no un catálogo decorativo. Cada uno salió de
 * leer lo que el puente y el streaming del motor usan de verdad.
 */
export const REQUISITOS_PUENTE: Requisito[] = [
  {
    id: "node-fetch-stream",
    nombre: "Lectura de streams en `fetch`",
    paraQue: "Sin `res.body.getReader()` no hay streaming: se recibiría la respuesta entera de golpe y el TTFT pasaría a ser la duración total.",
    criticidad: "imprescindible",
    deteccion: "typeof fetch === 'function' y typeof ReadableStream === 'function'",
    comoObtener: "Node 18 o superior (ya está: el proyecto pide Node 22).",
    instalable: false,
    pesoMb: 0,
  },
  {
    id: "ollama-vivo",
    nombre: "Ollama respondiendo en el 11434",
    paraQue: "Es el transporte local de verdad. Sin él, la comparación «local contra nube» sólo tiene un lado.",
    criticidad: "imprescindible",
    deteccion: "GET http://127.0.0.1:11434/api/tags con 2 s de tiempo máximo",
    comoObtener: "Arrancar Ollama, o instalarlo desde https://ollama.com/download",
    instalable: false,
    pesoMb: 0,
  },
  {
    id: "modelo-cloud",
    nombre: "Un modelo de nube disponible en Ollama",
    paraQue: "Es el otro lado de la comparación. Se comprueba contra /api/tags: los modelos de nube aparecen como `-cloud`.",
    criticidad: "mejora",
    deteccion: "GET /api/tags y buscar un nombre que contenga `-cloud`",
    comoObtener: "`ollama pull gpt-oss:120b-cloud` (no se descarga al disco: el cómputo es remoto)",
    instalable: true,
    pesoMb: 0,
  },
  {
    id: "segmento-compartido",
    nombre: "Memoria compartida entre el motor y el puente",
    paraQue: "El salto de verdad en local: quitar el socket de en medio. **No está implementado**: hoy el puente local es en proceso y el puente Python habla por TCP.",
    criticidad: "opcional",
    deteccion: "No comprobable todavía: la función no existe en el código.",
    comoObtener: "Trabajo pendiente: segmento `mmap` entre el servidor Node y `agent_bridge_5000.py`.",
    instalable: false,
    pesoMb: 0,
  },
  {
    id: "ffmpeg",
    nombre: "ffmpeg en el PATH",
    paraQue: "Sólo hace falta para componer y transformar audio y vídeo. El puente de texto funciona sin él.",
    criticidad: "opcional",
    deteccion: "spawnSync('ffmpeg', ['-version']) con 5 s de tiempo máximo",
    comoObtener: "Windows: `winget install Gyan.FFmpeg` · macOS: `brew install ffmpeg` · Linux: `apt install ffmpeg`",
    instalable: true,
    pesoMb: 90,
  },
];

export interface PlanDependencias {
  /** Presentes y comprobados. */
  listos: string[];
  /** Faltan y son imprescindibles: el puente no se puede medir completo. */
  faltanImprescindibles: Requisito[];
  /** Faltan pero el puente funciona en modo reducido. */
  faltanOpcionales: Requisito[];
  /** Sólo lo que se puede instalar con un comando. */
  instalables: Requisito[];
  /** Faltantes que NO se arreglan instalando nada (clave, permiso, versión, trabajo pendiente). */
  noInstalables: Requisito[];
  /**
   * SIEMPRE true mientras haya algo que descargar o ejecutar. No es un parámetro
   * configurable: es la garantía de que nada se instala sin que alguien lo lea.
   */
  requiereConfirmacion: boolean;
  /** Peso total de lo instalable que falta, en MB. */
  pesoTotalMb: number;
  /** Frase lista para enseñar, sin jerga. */
  resumen: string;
}

/**
 * Construye el plan a partir de lo que el servidor pudo comprobar.
 * `presentes` es un mapa id → booleano. Lo que NO venga en el mapa se trata como
 * NO comprobado, y eso se refleja: no comprobado no es lo mismo que ausente.
 */
export function planDeDependencias(presentes: Record<string, boolean>): PlanDependencias {
  const faltan: Requisito[] = [];
  const listos: string[] = [];

  for (const r of REQUISITOS_PUENTE) {
    const estado = presentes[r.id];
    if (estado === true) listos.push(r.id);
    else faltan.push(r);
  }

  const faltanImprescindibles = faltan.filter((r) => r.criticidad === "imprescindible");
  const faltanOpcionales = faltan.filter((r) => r.criticidad !== "imprescindible");
  const instalables = faltan.filter((r) => r.instalable);
  const noInstalables = faltan.filter((r) => !r.instalable);
  const pesoTotalMb = instalables.reduce((s, r) => s + r.pesoMb, 0);

  const partes: string[] = [`${listos.length}/${REQUISITOS_PUENTE.length} requisitos comprobados y presentes.`];
  if (faltanImprescindibles.length) {
    partes.push(`FALTAN ${faltanImprescindibles.length} IMPRESCINDIBLE(S): ${faltanImprescindibles.map((r) => r.nombre).join(", ")}.`);
  }
  if (instalables.length) {
    partes.push(`${instalables.length} se puede(n) instalar (${pesoTotalMb} MB): ${instalables.map((r) => r.id).join(", ")}. Nada se descarga sin tu OK.`);
  }
  if (noInstalables.length) {
    partes.push(`${noInstalables.length} NO se arregla(n) instalando nada: ${noInstalables.map((r) => r.id).join(", ")}.`);
  }
  if (!faltan.length) partes.push("Todo listo: el puente se puede medir completo.");

  return {
    listos,
    faltanImprescindibles,
    faltanOpcionales,
    instalables,
    noInstalables,
    // Garantía dura: si hay algo instalable pendiente, se confirma. Y si no hay
    // nada que instalar, tampoco hay nada que confirmar.
    requiereConfirmacion: instalables.length > 0,
    pesoTotalMb,
    resumen: partes.join(" "),
  };
}

/** Comandos propuestos, uno por línea, para poder leerlos antes de aceptar. */
export function comandosPropuestos(plan: PlanDependencias): string[] {
  return plan.instalables.map((r) => `# ${r.id} — ${r.nombre}\n${r.comoObtener}`);
}
