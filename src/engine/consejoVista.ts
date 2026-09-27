/**
 * consejoVista.ts — CONSEJO v1: agrupar el estado del consejo para un humano
 * ==========================================================================
 * El manual de CerebroNico prometía «18 con botón»: el botón de dormir/despertar
 * existía como endpoint (`POST /api/consejo/entidad`) pero NADIE lo había
 * montado en la interfaz. Aquí vive la lógica pura de esa pantalla (agrupar,
 * contar, payload) — el componente sólo pinta lo que aquí se decide, y lo de
 * aquí se prueba sin navegador.
 */

export interface HerramientaVista { id: string; activa: boolean; descripcion?: string }
export interface EspecialistaVista { id: string; descripcion?: string }
export interface EstadoConsejoVista {
  ok?: boolean; version?: string; total: number;
  especialistas: EspecialistaVista[];
  herramientas: HerramientaVista[];
  cuenta: { especialistas: number; herramientas: number; activas: number; dormidas: number };
  nota?: string;
}

export interface GruposConsejo {
  votantes: EspecialistaVista[];        // los 12 siempre despiertos (sin botón: no se duerme a un votante)
  espejos: HerramientaVista[];          // los 10 agentes espejo
  despiertas: HerramientaVista[];       // herramientas clásicas activas
  dormidas: HerramientaVista[];         // las 18 que esperaban su botón — y ya lo tienen
}

export function agruparConsejo(estado: EstadoConsejoVista): GruposConsejo {
  const espejos: HerramientaVista[] = [];
  const despiertas: HerramientaVista[] = [];
  const dormidas: HerramientaVista[] = [];
  for (const h of estado.herramientas || []) {
    if (h.id.startsWith("espejo.")) { espejos.push(h); continue; }
    (h.activa ? despiertas : dormidas).push(h);
  }
  const orden = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  espejos.sort(orden); despiertas.sort(orden); dormidas.sort(orden);
  return { votantes: estado.especialistas || [], espejos, despiertas, dormidas };
}

/** El payload exacto que espera POST /api/consejo/entidad. */
export function payloadActivacion(id: string, activa: boolean) { return { id, activa }; }

/** Una línea honesta para la cabecera del panel. */
export function lineaConsejo(estado: EstadoConsejoVista): string {
  const g = agruparConsejo(estado);
  return `${estado.total} entidades · ${g.votantes.length} votantes · ${g.espejos.length} espejos (${g.espejos.filter((e) => e.activa).length} despiertos) · ${g.dormidas.length} dormidas esperan su botón`;
}

/** Nombre corto para mostrar: quita el prefijo y saca el resto. */
export function nombreCorto(id: string): string {
  return id.includes(".") ? id.slice(id.indexOf(".") + 1) : id;
}
