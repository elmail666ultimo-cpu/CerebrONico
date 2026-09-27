/**
 * telemetria.ts — EL PRIMER ESTADO EXTRAÍDO (Fase 2, v1.12.0)
 * ==========================================================
 * QUÉ ES: la caché de telemetría del servidor (cuándo se miró por última vez si
 * Ollama y el puente responden, y qué se vio) con una API de tres funciones.
 * PARA QUÉ SIRVE: para que las rutas que informan del estado del sistema no
 * necesiten vivir dentro del monolito. Es la primera pieza de ESTADO que sale de
 * `server.ts`, y por eso importa más de lo que parece: es el ensayo de lo que hay
 * que hacer con las otras dieciocho variables globales.
 *
 * POR QUÉ EL ESTADO ES EL PASO DIFÍCIL (y por qué este es el bueno para empezar)
 * Mover una ruta es mover código. Mover estado es cambiar quién manda sobre él.
 * Una variable global suelta no dice nada: no se sabe quién la escribe, ni cuándo,
 * ni qué contratos hay detrás. Este módulo lo dice en tres funciones —leer, guardar
 * y invalidar— y con una regla: NADIE toca la caché por dentro, todos pasan por
 * aquí. Cuando se extraigan `sandboxProc` o los contadores de CPU se usará esta
 * misma receta, y ya estará probada.
 *
 * POR QUÉ EL TIEMPO SE INYECTA (`ahora`)
 * `muestraVigente()` recibe el instante en lugar de leer `Date.now()`. No es
 * purismo: es lo que permite **probar la caducidad sin esperar diez segundos**.
 * Un módulo que lee el reloj por dentro solo se puede probar durmiendo, y las
 * pruebas que duermen son las primeras que se quitan cuando van lentas.
 */

export interface MuestraTelemetria {
  /** Instante en que se tomó la muestra (ms desde epoch). */
  timestamp: number;
  /** Lo que se respondió: puertos vivos y número de modelos. */
  data: unknown;
}

/**
 * Los dos tiempos, y por qué son generosos (venían documentados en el monolito):
 * se subieron a 10 s de caché y 35 s de sondeo porque Ollama puede tardar 28 s o
 * más cuando está cargando un modelo, y con timeouts cortos el indicador parpadeaba
 * a «11434 OFF» durante cualquier conversación larga. Ese falso negativo es peor
 * que un dato viejo: hace que el usuario reinicie Ollama sin motivo.
 */
export const TELEMETRY_CACHE_MS = 10000; // 10 s de caché
export const TELEMETRY_PROBE_MS = 35000; // 35 s de sondeo

let cache: MuestraTelemetria | null = null;

/** Lo que hay en la caché SI sigue fresco; `null` si toca volver a sondear. */
export function muestraVigente(ahora: number = Date.now()): unknown | null {
  if (cache && ahora - cache.timestamp < TELEMETRY_CACHE_MS) return cache.data;
  return null;
}

/** Guarda una muestra recién tomada. */
export function guardarMuestra(data: unknown, ahora: number = Date.now()): void {
  cache = { timestamp: ahora, data };
}

/**
 * Tira la caché para forzar un sondeo nuevo (`POST /api/telemetry/refresh`).
 * Existe porque el usuario puede saber algo que el servidor no: acaba de arrancar
 * Ollama y no quiere esperar diez segundos a que la caché caduque sola.
 */
export function invalidarMuestra(): void {
  cache = null;
}

/** Solo para pruebas y diagnóstico: la muestra cruda, sin juicio de frescura. */
export function muestraCruda(): MuestraTelemetria | null {
  return cache;
}
