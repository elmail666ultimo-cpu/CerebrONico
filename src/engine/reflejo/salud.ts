/**
 * salud.ts — SALUD v1: CADA ESPEJO SE GANA SU PRIORIDAD (Reflejo v5, manual §6.3)
 * ================================================================================
 * El manual prometía: «cada espejo puede llevar un meta.score basado en
 * cuántas veces devolvió ok:true sin que el usuario corrigiera. Los espejos
 * con score > 0.95 ganan prioridad; los < 0.5 se ignoran. Sin borrarlos: se
 * duermen (siguen en el catálogo pero no se eligen solos)».
 *
 * Aquí está, hecho código. Es la lección del recap aplicada al tamaño real de
 * CerebroNico: no hace falta un clúster con health-checks y balanceador —
 * hace falta que UN orquestador sepa qué espejo miente y lo aparte del
 * auto-enrutado sin borrarlo. La llamada explícita (por id o por familia)
 * SIEMPRE alcanza a un espejo dormido: dormir no es matar.
 *
 * Puro: sin fs. La persistencia (.cerebro-db/espejos-salud.json) la cablea
 * server.ts con las primitivas que se inyectan abajo.
 */

export interface RegistroSalud {
  usos: number;
  exitos: number;
  /** Veces que el resultado fue corregido/rechazado después (feedback humano). */
  corregido: number;
  /** Marca ISO del último registro. */
  ultima: string;
}

export type EstadoSalud = "nuevo" | "activo" | "estrella" | "dormido";

export const UMBRAL_DORMIDO = 0.5;
export const UMBRAL_ESTRELLA = 0.95;
/** Con menos usos que este mínimo nadie es estrella ni va a dormir: hay que medir antes de opinar. */
export const USOS_MINIMOS = 8;

export type TablaSalud = Record<string, RegistroSalud>;

/**
 * Score con suavizado de Laplace: (éxitos + 1) / (usos + 2).
 * Un espejo sin historial arranca en 0.5 (ni premiado ni castigado) y un
 * solo fallo aislado no lo duerme: se duerme cuando la evidencia se acumula.
 */
export function scoreDe(r: RegistroSalud | undefined): number {
  if (!r || !r.usos) return 0.5;
  const exitosNetos = Math.max(0, r.exitos - r.corregido);
  return (exitosNetos + 1) / (r.usos + 2);
}

export function estadoDe(r: RegistroSalud | undefined): EstadoSalud {
  if (!r || !r.usos) return "nuevo";
  const s = scoreDe(r);
  if (r.usos < USOS_MINIMOS) return "activo"; // aún no hay evidencia para dormir ni encumbrar
  if (s < UMBRAL_DORMIDO) return "dormido";
  if (s >= UMBRAL_ESTRELLA) return "estrella";
  return "activo";
}

/** Registra una ejecución. Devuelve la tabla NUEVA (inmutable: los planes la comparten). */
export function registrarEjecucion(
  tabla: TablaSalud,
  id: string,
  ok: boolean,
  corregido = false,
  ahoraIso: string = new Date().toISOString(),
): TablaSalud {
  const previo = tabla[id] || { usos: 0, exitos: 0, corregido: 0, ultima: ahoraIso };
  const siguiente: RegistroSalud = {
    usos: previo.usos + 1,
    exitos: previo.exitos + (ok ? 1 : 0),
    corregido: previo.corregido + (corregido ? 1 : 0),
    ultima: ahoraIso,
  };
  return { ...tabla, [id]: siguiente };
}

/** ¿Puede este espejo elegirse SOLO (auto-enrutado)? Los dormidos no; los explícitos sí. */
export function elegibleAuto(tabla: TablaSalud, id: string): boolean {
  return estadoDe(tabla[id]) !== "dormido";
}

/** Bonificación de prioridad para el orquestador: las estrellas suben, lo demás no se mueve. */
export function bonificacionEstrella(tabla: TablaSalud, id: string): boolean {
  return estadoDe(tabla[id]) === "estrella";
}

// ─── Serialización (para .cerebro-db/espejos-salud.json) ────────────────────

export function serializarTabla(tabla: TablaSalud): string {
  return JSON.stringify({ version: 1, en: new Date().toISOString(), espejos: tabla }, null, 2);
}

/** Parseo defensivo: nunca lanza. Lo que no cuadra, se descarta con aviso. */
export function parsearTabla(bruto: unknown): { tabla: TablaSalud; avisos: string[] } {
  const avisos: string[] = [];
  const tabla: TablaSalud = {};
  const origen = (bruto as any)?.espejos ?? bruto;
  if (!origen || typeof origen !== "object" || Array.isArray(origen)) {
    return { tabla, avisos: ["el JSON de salud no trae un objeto `espejos`: se arranca limpio"] };
  }
  for (const [id, v] of Object.entries<any>(origen)) {
    const usos = Number(v?.usos), exitos = Number(v?.exitos), corregido = Number(v?.corregido);
    if (!Number.isFinite(usos) || usos < 0 || !Number.isFinite(exitos) || exitos < 0) {
      avisos.push(`registro «${id}» ilegible: descartado`);
      continue;
    }
    tabla[id] = {
      usos: Math.floor(usos),
      exitos: Math.floor(Math.min(exitos, usos)),
      corregido: Math.floor(Math.max(0, Number.isFinite(corregido) ? Math.min(corregido, usos) : 0)),
      ultima: typeof v?.ultima === "string" ? v.ultima : "",
    };
  }
  return { tabla, avisos };
}

/** Vista para /api/espejos/salud: el estado de la flota en una línea por espejo. */
export function vistaSalud(tabla: TablaSalud, ids: string[]) {
  return ids.map((id) => {
    const r = tabla[id];
    return {
      id,
      usos: r?.usos ?? 0,
      exitos: r?.exitos ?? 0,
      corregido: r?.corregido ?? 0,
      score: Math.round(scoreDe(r) * 100) / 100,
      estado: estadoDe(r),
      ultima: r?.ultima || "",
    };
  });
}
