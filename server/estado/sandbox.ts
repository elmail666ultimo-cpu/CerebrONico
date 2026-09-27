/**
 * sandbox.ts — EL ESTADO DEL SANDBOX (Fase 2, v1.13.0)
 * ====================================================
 * QUÉ ES: quién manda sobre el proceso del sandbox (el servidor dev del proyecto
 * en :3500): si está vivo, con qué PID, y cómo se le mata. Antes era una variable
 * suelta (`let sandboxProc`) más una función de apoyo (`isPidAlive`) repartidas por
 * el monolito, con 35 sitios tocándolas directamente.
 * PARA QUÉ SIRVE: para que las rutas del sandbox puedan salir de `server.ts` sin
 * llevarse la variable dentro. Es el ÚLTIMO bloque grande de estado compartido: con
 * él extraído, lo que queda en el monolito son rutas y funciones, no dueños de
 * datos — y eso es lo que convierte las 121 rutas restantes en mecánica.
 *
 * ESTE MÓDULO NO ES UNA CAJA DE CRISTAL, ES UNA PUERTA
 * `procesoActual()` devuelve el objeto del proceso porque hay cosas que no se
 * pueden hacer de otra forma: engancharle los streams del log y sus manejadores de
 * `exit`/`error` (eso pasa en el momento del spawn, con el objeto recién creado; no
 * tiene sentido envolverlo). Lo que NO se puede hacer es guardar el proceso en una
 * variable del monolito: para eso están `registrarProceso` y `olvidarProceso`.
 * La diferencia importa: 35 sitios escribiendo una variable global no tienen dueño;
 * 35 sitios pasando por cuatro funciones, sí.
 *
 * `olvidarProceso(siEs)` — LA COREOGRAFÍA DEL ANTI-ZOMBIE
 * Los manejadores de salida hacen `if (sandboxProc === proc) sandboxProc = null`:
 * solo olvidan el proceso si el que muere es el que está registrado. Eso evita la
 * carrera clásica de «arranco uno nuevo, muere el viejo y borra la referencia del
 * nuevo», y aquí se conserva tal cual: `olvidarProceso(proc)` hace exactamente esa
 * comprobación. No es una comodidad: es la pieza que evita que el sandbox quede
 * registrado cuando en realidad está muerto, o al revés.
 */

/**
 * ¿Está vivo este PID? Movida VERBATIM desde el monolito.
 * `EPERM` significa que el proceso existe pero es de otro usuario: cuenta como vivo.
 */
export const isPidAlive = (pid: number | undefined): boolean => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err.code === "EPERM";
  }
};

/** El proceso del sandbox tal cual lo devuelve `spawn`. Se tipa como unknown-ish a propósito. */
type ProcesoSandbox = {
  pid?: number;
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  on(evento: string, cb: (...args: any[]) => void): unknown;
};

let proc: ProcesoSandbox | null = null;

/**
 * Registra el proceso recién arrancado.
 *
 * AQUÍ APARECIÓ UN FALLO LATENTE, Y MERECE QUEDAR ESCRITO
 * `spawnSandbox()` no siempre devuelve un proceso: hay caminos en los que falla al
 * arrancar, responde al cliente y **devuelve una `Response` HTTP**. El monolito
 * hacía `sandboxProc = spawnSandbox()` con `sandboxProc` tipado como `any`, así que
 * en esos caminos guardaba una RESPUESTA HTTP como si fuera «el proceso del
 * sandbox». No se notaba porque después solo se le preguntaba por `.pid` (que era
 * `undefined`, o sea «no vivo») y `.kill()` lanzaba y estaba capturado. Al poner
 * tipos, el compilador lo dijo en tres sitios.
 *
 * Ahora se registra SOLO lo que parece un proceso (tiene `kill` y `on`). Si llega
 * una respuesta de error, no se registra nada: el sandbox sigue siendo «no hay
 * proceso», que es exactamente la verdad en ese momento. El comportamiento
 * observable es el mismo que antes, pero deja de haber una mentira guardada.
 */
export function registrarProceso(p: unknown): void {
  if (p && typeof (p as ProcesoSandbox).kill === "function" && typeof (p as ProcesoSandbox).on === "function") {
    proc = p as ProcesoSandbox;
  }
}

/**
 * Deja de seguir el proceso. Con argumento, solo si es el que está registrado
 * (la comprobación anti-zombie de los manejadores de salida). Sin argumento,
 * olvida el que haya.
 */
export function olvidarProceso(siEs?: ProcesoSandbox): void {
  if (siEs === undefined || proc === siEs) proc = null;
}

/** El proceso actual, para engancharle streams y manejadores. `null` si no hay. */
export function procesoActual(): ProcesoSandbox | null {
  return proc;
}

/** ¿Está vivo el sandbox? Responde a la única pregunta que hace casi todo el mundo. */
export function sandboxVivo(): boolean {
  return Boolean(proc && isPidAlive(proc.pid));
}

/** El PID del sandbox, si lo hay. */
export function pidSandbox(): number | null {
  return proc?.pid ?? null;
}

/**
 * Intenta matar el sandbox. Devuelve si se pudo intentar (no si murió: eso lo dice
 * `sandboxVivo()` después). Nunca lanza: matar un proceso que ya no está es normal.
 */
export function matarProceso(signal: NodeJS.Signals | number = "SIGKILL"): boolean {
  try {
    if (!proc) return false;
    proc.kill(signal);
    return true;
  } catch {
    return false;
  }
}
