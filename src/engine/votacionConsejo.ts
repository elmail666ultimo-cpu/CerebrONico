/**
 * votacionConsejo.ts — D7: EL CONSEJO QUE VOTA DE VERDAD (v1.6.33)
 * =================================================================
 * El ROADMAP v8 marcaba D7 como «SIN VERIFICAR — 5 especialistas sin rama en
 * DUEÑO_DE». Verificado contra código en esta sesión: era PEOR de lo dicho.
 *
 * El clasificador (`cerebroReflejo.pensar`) emite 22 `orden.tipo` (las 6
 * originales + las 16 genéricas de Reflejo v3.0). Pero `DUEÑO_DE` solo tenía
 * ramas para las 6 originales (y 2 de ellas eran acciones, no tipos de orden:
 * `creacion`, `calculo`, `nada`). Conclusión:
 *
 *     analizar · explicar · resumir · comparar · listar · ordenar · filtrar ·
 *     contar · buscar · testear · documentar · refactorizar · optimizar ·
 *     traducir · instalar · desplegar
 *
 * — las 16 acciones nuevas — caían TODAS al `|| "ayuda"` del final de
 * `pensarConsejo`. El consejo tenía 12 asientos y 6 siempre vacíos: el
 * Lingüista, el Investigador y el Validador jamás recibían un voto, y la
 * sesión los registraba como «resuelto por Ayuda». Un consejo que siempre
 * responde «no se enteró nadie» no es un consejo: es un timbre roto.
 *
 * Este módulo es la FUENTE ÚNICA del reparto de votos. Puro: sin tablas, sin
 * disco, sin el motor. Recibe el `orden.tipo` (o la acción) y dice DUEÑO real
 * o lo DECLARA sin dueño — que es distinto a fallar en silencio. Regla de la
 * casa: lo que no existe no se finge; se nombra.
 */

/** Las 6 acciones originales del reflejo (convertir/abrir/imagen/plan + 2 de resultado). */
export type AccionOriginal = "convertir" | "abrir" | "imagen" | "plan" | "creacion" | "calculo" | "nada";

/** Las 16 acciones genéricas que Reflejo v3.0 empezó a emitir (chatOrders.ACCIONES_GENERICAS_REFLEJO_V3). */
export type AccionGenerica =
  | "analizar" | "explicar" | "resumir" | "traducir" | "comparar"
  | "listar" | "buscar" | "ordenar" | "filtrar" | "contar"
  | "testear" | "documentar" | "instalar" | "desplegar"
  | "refactorizar" | "optimizar";

export type AccionConsejo = AccionOriginal | AccionGenerica;

/** Dueño del voto: `null` = declarado sin especialista (no es un fallo silencioso). */
export interface Reparto {
  accion: AccionConsejo;
  especialista: string | null;
  /** Por qué ese especialista (o por qué ninguno). Se lee en /api/consejo/estado. */
  razon: string;
}

/**
 * El reparto honesto. Cada especialista aparece SOLO si su descripción declara
 * que sabe hacer eso (consejo.ts:86-98). Lo que ningún especialista promete,
 * se deja SIN dueño a propósito — para que Ayuda lo diga, no para fingir un voto.
 */
export const REPARTO_VOTOS: Record<AccionConsejo, Reparto> = {
  // — las 6 de siempre (idénticas a DUEÑO_DE histórico: no cambia ningún voto viejo) —
  convertir: { accion: "convertir", especialista: "conversor",   razon: "json↔yaml↔tomlcsv con informe de pérdidas." },
  abrir:     { accion: "abrir",     especialista: "archivista",  razon: "abre/lee rutas del proyecto." },
  imagen:    { accion: "imagen",    especialista: "artista",     razon: "frase → prompt de imagen enriquecido." },
  creacion:  { accion: "creacion",  especialista: "codigo",      razon: "plantillas de código (react/express/python/html/ts…)." },
  calculo:   { accion: "calculo",   especialista: "matematico",  razon: "calculadora con parser propio, sin eval." },
  plan:      { accion: "plan",      especialista: "conductor",   razon: "descompone en DAG con dependencias." },
  nada:      { accion: "nada",      especialista: "ayuda",       razon: "nadie votó: Ayuda dice qué se pareció y por qué no pasó el umbral." },

  // — las 16 que llegaban a Ayuda y desde ahora votan de verdad —
  analizar:     { accion: "analizar",     especialista: "linguista",     razon: "normaliza y analiza texto (el Operario queda para transformar código)." },
  explicar:     { accion: "explicar",     especialista: "linguista",     razon: "explicación de texto: dominio lingüístico." },
  resumir:      { accion: "resumir",      especialista: "linguista",     razon: "resumen = contar/comprimir texto." },
  comparar:     { accion: "comparar",     especialista: "linguista",     razon: "compara texto — está en su descripción." },
  listar:       { accion: "listar",       especialista: "linguista",     razon: "lista de líneas: operación de texto." },
  ordenar:      { accion: "ordenar",      especialista: "linguista",     razon: "ordena texto (por campo si lo trae)." },
  filtrar:      { accion: "filtrar",      especialista: "linguista",     razon: "filtra texto (por campo si lo trae)." },
  contar:       { accion: "contar",       especialista: "linguista",     razon: "cuenta texto — está en su descripción." },
  documentar:   { accion: "documentar",   especialista: "codigo",        razon: "genera la documentación del artefacto (plantilla readme/tsdoc)." },
  refactorizar: { accion: "refactorizar", especialista: "codigo",        razon: "transformación de código; sintaxis delega en syntaxGuard." },
  optimizar:    { accion: "optimizar",    especialista: "codigo",        razon: "reescritura de código por rendimiento." },
  testear:      { accion: "testear",      especialista: "validador",     razon: "valida contra las funciones reales del motor — es el Validador." },
  buscar:       { accion: "buscar",       especialista: "investigador",  razon: "esqueleto de investigación/citas; sin red lo declara." },

  // — sin especialista que lo prometa: SE DECLARA, no se disfraza de «ayuda por error» —
  traducir:   { accion: "traducir",   especialista: null, razon: "El Lingüista dice a la letra que NO traduce (eso es del director neural). Ningún especialista vota: lo atiende el modelo, no el consejo." },
  instalar:   { accion: "instalar",   especialista: null, razon: "Gestión de dependencias: la hace el motor (dependenciasProyecto), no un especialista votante." },
  desplegar:  { accion: "desplegar",  especialista: null, razon: "Despliegue: operación de infraestructura del sandbox, sin especialista entre los 12." },
};

/**
 * Los 12 especialistas y SI votan o no por frase. D7 pedía «declarar los que
 * no votan»: telemetría y memorista NO participan del voto clasificador — uno
 * mide la máquina (`maq.*`), el otro recuerda la sesión (`memorista.registrar`);
 * ambos son HERRAMIENTAS que el consejo usa, no voces que disputan la frase.
 * Fingir que votan sería another 92-skills-style lie. Aquí quedan declarados.
 */
export const VOTAN: string[] = [
  "conversor", "archivista", "artista", "codigo", "matematico", "conductor",
  "linguista", "investigador", "validador", "ayuda",
];
export const NO_VOTAN: Array<{ id: string; porque: string }> = [
  { id: "telemetria", porque: "Mide la máquina (maq.ram/maq.cpu/maq.tramo): aporta datos al consejo, no vota la frase." },
  { id: "memorista",  porque: "Memoria de sesión (memorista.registrar): guarda decisiones, no disputa votos." },
];

/** Dueño de una acción. `null` = sin especialista (el llamante decide el fallback). */
export function dueñoDe(accion: string): string | null {
  const r = REPARTO_VOTOS[accion as AccionConsejo];
  return r ? r.especialista : null;
}

/** ¿La acción tiene reparto declarado? (true aunque el especialista sea null). */
export function accionConocida(accion: string): boolean {
  return Object.prototype.hasOwnProperty.call(REPARTO_VOTOS, accion);
}

/**
 * El veredicto de voto para una frase ya clasificada: qué especialista la
 * toma, o por qué queda en Ayuda. `porVoto=true` = un especialista real la
 * reclama; `porVoto=false` = sin dueño declarado (no es un error, es un hecho).
 */
export function veredictoVoto(accion: string): { especialista: string; porVoto: boolean; razon: string } {
  const r = REPARTO_VOTOS[accion as AccionConsejo];
  if (!r) return { especialista: "ayuda", porVoto: false, razon: `acción «${accion}» desconocida para el reparto: cae en Ayuda.` };
  if (r.especialista) return { especialista: r.especialista, porVoto: true, razon: r.razon };
  return { especialista: "ayuda", porVoto: false, razon: r.razon };
}

/** Las 22 acciones del reparto (para que los tests exijan cobertura completa). */
export const ACCIONES_REPARTIDAS: AccionConsejo[] = Object.keys(REPARTO_VOTOS) as AccionConsejo[];

/** Cuántos de los 12 asientos reciben al menos un voto (D7: era 6/12). */
export function dueñosConVoto(): string[] {
  const set = new Set<string>();
  for (const a of ACCIONES_REPARTIDAS) {
    const e = REPARTO_VOTOS[a].especialista;
    if (e && e !== "ayuda") set.add(e);
  }
  return [...set].sort();
}
