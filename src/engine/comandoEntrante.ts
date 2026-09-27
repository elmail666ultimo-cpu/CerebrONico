/**
 * comandoEntrante.ts — ADUANA DEL COMANDO QUE ENTRA A LA CONSOLA (v8.0.4)
 * ========================================================================
 * Defecto real reportado, con su salida textual:
 *
 *     $ run_command command="cd .proyectos/mi-proyecto && npm start
 *     "run_command" no se reconoce como un comando interno o externo,
 *     programa o archivo por lotes ejecutable.
 *     [exit 1] Command failed: run_command command="cd .proyectos/mi-proyecto && npm start
 *
 * Léelo despacio, porque es más raro de lo que parece: **el shell ejecutó el
 * TEXTO DE UNA LLAMADA A HERRAMIENTA**. `run_command` es el nombre de una
 * herramienta del motor y `command="…"` es su parámetro. El modelo escribió eso
 * como texto, el texto llegó a la consola, y la consola —que recibe cualquier
 * cadena y la pasa a `cmd.exe`— intentó ejecutarlo tal cual. Windows no conoce
 * ningún programa llamado `run_command` y contestó lo que contesta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ES «SOLO» UN MENSAJE FEO
 * ─────────────────────────────────────────────────────────────────────────────
 * Porque el error está en el sitio donde más caro sale: la consola acepta
 * cualquier cosa. Hoy el texto de una herramienta llegó intacto; mañana llega
 * `rm -rf` desde un texto de herramienta mal formado y sí hace algo. Una puerta
 * que ejecuta lo que le pongan necesita distinguir «comando» de «resto».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DECISIÓN: DESENVOLVER SI SE PUEDE, NEGARSE SI NO
 * ─────────────────────────────────────────────────────────────────────────────
 * Cuando el modelo escribe `run_command command="cd X && npm start"`, su
 * INTENCIÓN es inequívoca: quiere ejecutar `cd X && npm start`. Negarse a secas
 * sería obedecer la letra y traicionar la intención — y además el modelo
 * volvería a intentarlo. Así que se DESENVUELVE, se ejecuta lo de dentro y se
 * deja constancia de lo que se hizo.
 *
 * Pero si después de desenvolver sigue pareciendo una llamada de herramienta
 * (por ejemplo, anidada, o con un nombre que no se ha sabido leer), entonces NO
 * se ejecuta nada: se devuelve el motivo. Antes fallar que ejecutar algo que no
 * se ha entendido.
 *
 * Módulo puro: entra una cadena, sale una decisión. Nada de `exec` aquí, y por
 * eso se puede probar con los casos difíciles sin arrancar una consola.
 */

/** Nombres de herramienta que se han visto llegar como texto a la consola. */
const NOMBRES_HERRAMIENTA = [
  "run_command",
  "run_tests",
  "pc_exec",
  "pc_shell",
  "terminal",
  "shell",
  "console",
];

export interface ComandoNormalizado {
  /** El comando que se debe ejecutar de verdad (vacío si no hay ninguno). */
  comando: string;
  /** true cuando hubo que desenvolver una llamada de herramienta escrita como texto. */
  envuelto: boolean;
  /** false → NO ejecutar. `motivo` explica por qué. */
  valido: boolean;
  /** Frase honesta, para el registro y para la interfaz. */
  motivo: string;
}

function limpiarComillas(s: string): string {
  let t = String(s ?? "").trim();
  for (let i = 0; i < 4; i++) {
    // Comillas envolventes normales, y también las ESCAPADAS (\"…\"). El caso
    // escapado no es teórico: aparece en cuanto un modelo anida una llamada
    // dentro de otra, que es justo el caso que hay que desenvolver bien. La
    // prueba «desenvuelve envoltorios anidados» lo cazó.
    if (t.length >= 4 && t.startsWith('\\"') && t.endsWith('\\"')) {
      t = t.slice(2, -2).trim();
      continue;
    }
    if (t.length >= 4 && t.startsWith("\\'") && t.endsWith("\\'")) {
      t = t.slice(2, -2).trim();
      continue;
    }
    if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
      t = t.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return t;
}

/**
 * Nombres de PARÁMETRO de herramienta.
 *
 * Esto es lo que distingue «un comando» de «los argumentos de una herramienta
 * sin su nombre delante». Un comando legítimo NUNCA empieza por `path=` ni por
 * `content=`: eso es un parámetro. Sin esta comprobación, un
 * `run_command path="x.ts" content="…"` se desenvuelve a `path="x.ts" …` y se
 * ejecutaría como si fuera un comando. Lo cazó la prueba
 * «una llamada de herramienta ilegible NO se ejecuta».
 */
const NOMBRES_PARAMETRO = [
  "command", "cmd", "comando", "path", "filepath", "file", "content", "contenido",
  "tasks", "task_id", "status", "cwd", "timeout", "query", "url", "name",
  "prompt", "old_string", "new_string", "rango", "desde", "hasta",
];

function pareceArgumentos(s: string): boolean {
  const re = new RegExp("^\\s*(?:" + NOMBRES_PARAMETRO.join("|") + ")\\s*=", "i");
  return re.test(s);
}

/** Sugerencia común a todos los rechazos: se enseña la forma correcta. */
const SUGERENCIA =
  " Envía SOLO el comando, por ejemplo: cd .proyectos/mi-proyecto && npm start";

/**
 * Reconocer el envoltorio textual de una llamada de herramienta.
 * Acepta las formas que se han visto en respuestas reales:
 *
 *   run_command command="cd X && npm start"
 *   run_command: cd X && npm start
 *   run_command cd X && npm start
 *   command="cd X && npm start"
 *   {"command": "cd X && npm start"}
 *
 * Devuelve el interior, o null si no es un envoltorio.
 */
function desenvolver(crudo: string): string | null {
  const t = crudo.trim();
  if (!t) return null;

  // 1) Forma JSON: {"command": "..."}  — la emiten algunos modelos.
  if (t.startsWith("{")) {
    try {
      const o = JSON.parse(t);
      const v = o?.command ?? o?.cmd ?? o?.comando;
      if (typeof v === "string" && v.trim()) return limpiarComillas(v);
    } catch {
      /* no era JSON válido: se sigue probando con las formas de texto */
    }
  }

  // 2) Forma `nombre ... command="..."` o `nombre ... command=...`
  const conNombre = new RegExp(
    "^(" + NOMBRES_HERRAMIENTA.join("|") + ")\\s*:?\\s*(?:command\\s*=\\s*)?([\\s\\S]+)$",
    "i"
  );
  const m1 = t.match(conNombre);
  if (m1) {
    const interior = limpiarComillas(m1[2]);
    if (interior) return interior;
  }

  // 3) `command="..."` suelto, sin nombre de herramienta delante.
  const suelto = t.match(/^command\s*=\s*([\s\S]+)$/i);
  if (suelto) {
    const interior = limpiarComillas(suelto[1]);
    if (interior) return interior;
  }

  return null;
}

/** ¿Sigue pareciendo el texto de una llamada de herramienta? */
function pareceLlamadaDeHerramienta(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  const re = new RegExp(
    "^(" + NOMBRES_HERRAMIENTA.join("|") + ")\\s*:?\\s*(command\\s*=|path\\s*=|file\\s*=|[\\s\\S]*=[\"']?)",
    "i"
  );
  return re.test(t);
}

/**
 * Normaliza lo que llega para ejecutarse. El punto de entrada es SIEMPRE este:
 * ni la herramienta `run_command` ni el endpoint de la consola deben llamar a
 * `exec` con una cadena sin pasar por aquí.
 */
export function normalizarComandoEntrante(crudo: unknown): ComandoNormalizado {
  if (typeof crudo !== "string") {
    return { comando: "", envuelto: false, valido: false, motivo: "El comando no es una cadena de texto." };
  }

  // El eco de la consola incluye `$ ` delante; y los modelos suelen añadir un
  // salto final. Ninguna de las dos cosas es parte del comando.
  let actual = crudo.replace(/^\s*\$\s+/, "").trim();
  if (!actual) {
    return { comando: "", envuelto: false, valido: false, motivo: "El comando está vacío." };
  }

  // Desenvolver hasta 3 veces: se han visto envoltorios dentro de envoltorios
  // (`run_command command="run_command command=\"…\""`), y una sola pasada deja
  // el interior todavía sucio.
  let envuelto = false;
  const pasos: string[] = [];
  for (let i = 0; i < 3; i++) {
    const interior = desenvolver(actual);
    if (interior === null || interior === actual) break;
    envuelto = true;
    pasos.push(interior.slice(0, 80));
    actual = interior;
  }

  // Tras desenvolver hay que decidir si lo que queda es de verdad un comando.
  // Tres formas de NO serlo, y las tres se han visto en respuestas reales:
  if (!actual) {
    return { comando: "", envuelto, valido: false, motivo: "Tras desenvolver no quedó ningún comando." + SUGERENCIA };
  }
  if (pareceLlamadaDeHerramienta(actual)) {
    return {
      comando: "",
      envuelto,
      valido: false,
      motivo: `Parece el texto de una llamada de herramienta, no un comando: «${actual.slice(0, 120)}». No se ejecuta nada.` + SUGERENCIA,
    };
  }
  if (pareceArgumentos(actual)) {
    // Caso `run_command path="x.ts" content="…"`: se desenvolvió el nombre pero lo
    // que queda son PARÁMETROS, no un comando. Ejecutarlos sería inventarse una
    // orden que nadie ha dado.
    return {
      comando: "",
      envuelto,
      valido: false,
      motivo: `Lo que llega son parámetros de una herramienta, no un comando: «${actual.slice(0, 120)}». No se ejecuta nada.` + SUGERENCIA,
    };
  }

  const motivo = envuelto
    ? `Se desenvolvió el texto de la llamada de herramienta y se ejecuta el comando de dentro: «${actual}».`
    : "";

  return { comando: actual, envuelto, valido: true, motivo };
}

// ============================================================
// v1.6.31 — GUARDA-SERVIDOR-EJEC
// ------------------------------------------------------------
// Un servidor de larga vida (Vite dev, `npm start`, uvicorn, Flask, Expo…)
// NUNCA termina: si se ejecuta por la puerta síncrona de `/api/exec`, siempre
// muere por timeout (`[exit 1] (timeout) Command failed: npm run dev`). Este
// predicado reconoce esos comandos para que el motor los arranque EN SU LUGAR
// (en segundo plano) y devuelva al momento. Es puro: entra una cadena, sale un
// booleano, y por eso se puede probar sin consola.
// ============================================================

/** Palabras que marcan un comando FINITO: nunca un servidor de larga vida. */
const PALABRAS_FINITAS =
  /\b(build|compile|install|uninstall|test|lint|format|audit|eject|clean|prune|prebuild|postinstall)\b/i;

const MARCAS_SERVIDOR: ReadonlyArray<RegExp> = [
  /\bnpm\s+(run\s+)?(dev|start|preview)\b/i,
  /\b(?:yarn|pnpm)\s+(?:run\s+)?(dev|start|preview)\b/i,
  /\bnpx\s+(vite|serve|next|nuxt|tsx|ts-node|http-server)\b/i,
  /\bvite\b(?!\s+build)/i,
  /\bnext\s+(dev|start)\b/i,
  /\bnuxt\s+dev\b/i,
  /\b(uvicorn|gunicorn|daphne)\b/i,
  /\bflask\s+run\b/i,
  /\bmanage\.py\s+runserver\b/i,
  /\bpython[^\s]*\s+-m\s+http\.server\b/i,
  /\bng\s+serve\b/i,
  /\bexpo\s+start\b/i,
  /\bparcel\b/i,
];

/** ¿Este comando arranca un proceso de larga vida (y por tanto NO debe ir por
 * la puerta síncrona)? */
export function esServidorDeLargaVida(comando: string): boolean {
  const c = " " + String(comando ?? "").trim() + " ";
  if (!c.trim()) return false;
  if (/\s(-h|--help)\b/.test(c)) return false;
  if (PALABRAS_FINITAS.test(c)) return false;
  return MARCAS_SERVIDOR.some((re) => re.test(c));
}
