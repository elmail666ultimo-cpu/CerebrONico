/**
 * ejecutoresConsejo.ts — DEL VOTO AL TRABAJO (v1.7.1 · Fase 4 del plan)
 * =====================================================================
 * QUÉ RESUELVE
 * En la v1.6.33 el Consejo VOTA: cada frase encuentra acción, y cada acción
 * tiene especialista. Pero votar no es hacer. Si preguntas cuántas de las 23
 * acciones acaban en trabajo de verdad, hasta hoy había que leer dos ficheros y
 * cruzarlos a mano — y el resultado que salía de ese cruce no era el que la
 * documentación daba a entender.
 *
 * Este fichero es el REGISTRO: acción → ejecutor, con dos estados posibles y
 * ninguno más:
 *   · "real"      — hay una función en el código que hace el trabajo, con su
 *                   fichero y su llamada exacta. Se puede abrir y comprobar.
 *   · "declarada" — NO hay ejecutor, y se dice POR QUÉ y CUÁL sería el natural.
 *
 * POR QUÉ ESTO ES UN ENTREGABLE Y NO UN TRÁMITE
 * Un hueco declarado se puede planificar. Un hueco que nadie ha escrito se
 * confunde con una capacidad que existe: es la forma más común de que un
 * proyecto tenga «un consejo de 12 especialistas» que en realidad atribuye
 * nombres y no ejecuta nada. El registro no arregla el hueco: lo hace MEDIBLE.
 *
 * EL NÚMERO, SIN ADORNOS: de las 23 acciones, **2 tienen ejecutor real**
 * (calculo → cerebroReflejo.calcular, convertir → formatConverter.convertir).
 * Las otras 21 están declaradas, cada una con el ejecutor que le corresponde
 * cuando se haga. Ese es el estado real, y ahora está escrito donde el
 * compilador lo vigila: `Record<AccionConsejo, …>` obliga a que ninguna acción
 * pueda quedarse sin ficha — si mañana se añade una acción y no se le pone
 * ficha, el proyecto NO COMPILA.
 */
import { REPARTO_VOTOS, type AccionConsejo } from "./votacionConsejo";

export type EstadoEjecutor = "real" | "declarada";

export interface FichaEjecutor {
  /** Qué especialista atiende la acción (lo que ya decidía el Consejo). */
  especialista: string | null;
  estado: EstadoEjecutor;
  /** Fichero donde vive el ejecutor de verdad (solo si estado = "real"). */
  modulo: string | null;
  /** La función concreta que hace el trabajo (solo si estado = "real"). */
  llamada: string | null;
  /** Por qué no hay ejecutor todavía, y cuál sería el natural. */
  motivo: string;
}

/** Ficha "declarada": no hay ejecutor, y se explica. */
const decl = (motivo: string): FichaEjecutor => ({
  especialista: null,
  estado: "declarada",
  modulo: null,
  llamada: null,
  motivo,
});

/**
 * Las 21 declaradas comparten forma, así que se declaran de una vez y cada una
 * lleva su motivo. El especialista real lo rellena el constructor de abajo
 * leyendo REPARTO_VOTOS: así no hay dos listas que puedan divergir.
 */
const DECLARADAS: Record<string, string> = {
  abrir: "La lectura de ficheros EXISTE (server.ts /api/fs/*, y el puente PC), pero no está enchufada al Consejo: votaría el Archivista y luego nadie lee. Ejecutor natural: el endpoint de lectura del workspace.",
  imagen: "El enriquecido de prompt vive en las plantillas del motor, no como función invocable. Ejecutor natural: plantillasImagen + el puente al generador.",
  creacion: "Las plantillas de código existen (plantillasProyecto.ts, plantillas de fragmentos), pero el Consejo no las invoca. Ejecutor natural: plantillaDe(accion, lenguaje).",
  plan: "El motor de planes SÍ existe y es la pieza más sólida del proyecto (planExecutors.ts), pero se entra por el endpoint, no por el voto. Ejecutor natural: planExecutors.desdeOrden.",
  nada: "No es una acción: es el caso «nadie votó». Su ejecutor es el mensaje de Ayuda, y ese ya existe en el Reflejo.",
  analizar: "El Lingüista describe el análisis pero no hay función de análisis de texto en src/engine. Ejecutor natural: un analizarTexto() con métricas reales (longitud, idioma, estructura).",
  explicar: "Requiere modelo (redacción), no determinismo: el consejo no puede hacerlo solo. Ejecutor natural: el director neural, declarándolo como tal.",
  resumir: "Hay resumirLista() en quirofano.ts (resume nombres de una lista), que no es resumir un texto. Ejecutor natural: reutilizarlo o escribir resumirTexto().",
  comparar: "Hay comparar() en formatConverter.ts, pero compara ESTRUCTURAS (JSON/YAML), no texto. Ejecutor natural: envolverlo para texto o declarar el dominio.",
  listar: "No hay función de «listar» sobre contenido; el listado real de ficheros lo hace el endpoint del workspace. Ejecutor natural: el endpoint, con el Archivista como titular.",
  ordenar: "No hay función de ordenación de texto (quirofano.ts ordena por conteo de líneas). Ejecutor natural: ordenarTexto(criterio).",
  filtrar: "No hay función de filtrado de texto. Ejecutor natural: filtrarTexto(criterio) con el mismo parser que ordenar.",
  contar: "Hay contarLineas() y contarEstados(): cuentan cosas concretas, no «cuenta esto» en general. Ejecutor natural: unificar en contar(que, donde).",
  documentar: "La palabra aparece en el Reflejo y en chatOrders como intención, pero no hay generador de documentación invocable. Ejecutor natural: plantilla readme/tsdoc + syntaxGuard.",
  refactorizar: "Sí hay guardián de sintaxis (syntaxGuard v3, con esbuild) que VALIDA la reescritura, pero quien reescribe es el modelo. Ejecutor natural: el modelo, con syntaxGuard como aduana.",
  optimizar: "Igual que refactorizar: la reescritura es del modelo; el motor solo puede medir. Ejecutor natural: el modelo, con medida antes/después.",
  testear: "El Validador existe como especialista y syntaxGuard comprueba sintaxis, pero «testear» (ejecutar pruebas) lo hace la puerta: npm run validar. Ejecutor natural: invocar la puerta desde el plan.",
  buscar: "localRAG existe pero recupera por token/clave sobre el conocimiento interno, no busca en red. Ejecutor natural: localRAG para lo interno y declarar «sin red» para lo externo.",
  traducir: "El Lingüista dice a la letra que NO traduce: eso es del director neural. No se le inventa un ejecutor al consejo; lo atiende el modelo.",
  instalar: "Gestión de dependencias: la hace el motor (dependenciasProyecto) fuera del consejo. Ejecutor natural: ese módulo, con confirmación del usuario.",
  desplegar: "Operación de infraestructura del sandbox (:3500). Fuera del consejo por diseño; ejecutor natural: el sandbox, nunca un especialista votante.",
};

/** Fichas con ejecutor REAL: se pueden abrir y comprobar una a una. */
const REALES: Partial<Record<AccionConsejo, Pick<FichaEjecutor, "modulo" | "llamada" | "motivo">>> = {
  calculo: {
    modulo: "src/engine/cerebroReflejo.ts",
    llamada: "calcular(expresion)",
    motivo: "Calculadora con parser propio (sin eval). Es el único ejecutor determinista ya probado por su suite.",
  },
  convertir: {
    modulo: "src/engine/formatConverter.ts",
    llamada: "convertir(texto, desde, hacia, opciones)",
    motivo: "Conversión real json↔yaml↔toml↔csv con informe de pérdidas.",
  },
};

/**
 * El registro completo. `Record<AccionConsejo, …>` es la garantía: si el
 * clasificador añade una acción y aquí no hay ficha, esto NO COMPILA.
 */
export const EJECUTORES_CONSEJO: Record<AccionConsejo, FichaEjecutor> = Object.fromEntries(
  (Object.keys(REPARTO_VOTOS) as AccionConsejo[]).map((accion) => {
    const reparto = REPARTO_VOTOS[accion];
    const real = REALES[accion];
    if (real) {
      return [
        accion,
        {
          especialista: reparto?.especialista ?? null,
          estado: "real" as EstadoEjecutor,
          modulo: real.modulo,
          llamada: real.llamada,
          motivo: real.motivo,
        },
      ];
    }
    const ficha = decl(DECLARADAS[accion] || "Sin ficha escrita: revisar (no debería ocurrir).");
    return [accion, { ...ficha, especialista: reparto?.especialista ?? null }];
  })
) as Record<AccionConsejo, FichaEjecutor>;

/** La ficha de una acción, o null si esa acción no existe. */
export function ejecutorDe(accion: string): FichaEjecutor | null {
  return EJECUTORES_CONSEJO[accion as AccionConsejo] || null;
}

/** ¿Esta acción acaba en trabajo de verdad, o solo en un voto? */
export function tieneEjecutorReal(accion: string): boolean {
  return ejecutorDe(accion)?.estado === "real";
}

/** Las acciones que votan y NO ejecutan: la lista de trabajo de la Fase 4. */
export function accionesSinEjecutor(): AccionConsejo[] {
  return (Object.keys(EJECUTORES_CONSEJO) as AccionConsejo[]).filter(
    (a) => EJECUTORES_CONSEJO[a].estado !== "real"
  );
}

/** El número, sin adornos: total, con ejecutor real y declaradas. */
export function resumenEjecutores(): { total: number; reales: number; declaradas: number } {
  const acciones = Object.keys(EJECUTORES_CONSEJO) as AccionConsejo[];
  const reales = acciones.filter((a) => EJECUTORES_CONSEJO[a].estado === "real").length;
  return { total: acciones.length, reales, declaradas: acciones.length - reales };
}
