/**
 * proceso.ts — EL SEGUNDO ESTADO EXTRAÍDO (Fase 2, v1.12.0)
 * =========================================================
 * QUÉ ES: la memoria de la última medición de CPU del propio proceso, que es lo
 * que permite calcular el porcentaje entre dos llamadas.
 * PARA QUÉ SIRVE: para que `/api/system/stats` pueda vivir fuera del monolito sin
 * llevarse una variable por dentro. Igual que `telemetria.ts`, sale con API de
 * funciones y con el tiempo inyectado.
 *
 * EL DETALLE QUE PARECE UNA TONTERÍA Y NO LO ES
 * El porcentaje de CPU no se puede medir: solo se puede calcular como la
 * DIFERENCIA entre dos instantes. Si el módulo guardara el instante por dentro y
 * lo leyera con `Date.now()`, la única forma de probarlo sería esperar a que
 * pasara tiempo real. Recibiendo `ahora` como parámetro, la prueba fija un
 * intervalo conocido y comprueba el cálculo con números exactos — que es la
 * diferencia entre probar una fórmula y probar una espera.
 *
 * NOTA DE COMPORTAMIENTO: la primera llamada devuelve 0 (no hay con qué comparar).
 * Eso es lo correcto y el monolito hacía lo mismo; se dice aquí para que nadie lo
 * tome por un fallo al verlo por primera vez.
 */

let ultimaMuestra: { user: number; system: number; ts: number } | null = null;

/**
 * Calcula el % de CPU desde la llamada anterior y actualiza la muestra.
 * @param ahora instante actual en ms (inyectado para poder probarlo).
 */
export function porcentajeCpu(ahora: number = Date.now()): number {
  const cpu = process.cpuUsage();
  let porcentaje = 0;
  if (ultimaMuestra) {
    const microsConsumidos = cpu.user - ultimaMuestra.user + (cpu.system - ultimaMuestra.system);
    const msTranscurridos = ahora - ultimaMuestra.ts;
    if (msTranscurridos > 0) {
      // % CPU = (tiempo de CPU consumido / tiempo transcurrido) * 100, sobre un núcleo.
      porcentaje = Math.min(100, Math.max(0, microsConsumidos / 1000 / msTranscurridos * 100));
    }
  }
  ultimaMuestra = { user: cpu.user, system: cpu.system, ts: ahora };
  return Math.round(porcentaje * 10) / 10;
}

/** Olvida la muestra anterior (diagnóstico y pruebas). */
export function reiniciarMuestraProceso(): void {
  ultimaMuestra = null;
}

/** La muestra cruda, para inspección. */
export function muestraProceso(): { user: number; system: number; ts: number } | null {
  return ultimaMuestra;
}
