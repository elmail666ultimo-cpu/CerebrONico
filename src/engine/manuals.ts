/**
 * manuals.ts — LOS MANUALES DEL MOTOR (v2.0)
 * =========================================
 * Aquí está lo que pediste: inyectar en CerebroNico el conocimiento de CÓMO se
 * usan las herramientas, para que viaje en el MOTOR y no dependa de que el
 * modelo lo sepa. Cualquier conductor —un qwen de 0,5 B, GLM, Gemini— recibe el
 * mismo manual y trabaja igual de bien.
 *
 * Tres capas, por orden de importancia:
 *
 *   1. LEYES DEL MOTOR. Reglas que impiden el fallo más caro de un modelo débil:
 *      afirmar que hizo algo cuando no lo hizo, inventar nombres de herramientas
 *      y rutas, dar por bueno algo sin verificarlo.
 *   2. MANUAL POR HERRAMIENTA. Cuándo usar cada una, cómo, y el error típico que
 *      hay que evitar. Se envía solo el manual de las herramientas ACTIVAS.
 *   3. PROCEDIMIENTOS. Recetas paso a paso para los trabajos frecuentes (crear
 *      una página, arreglar un error de compilación, arreglar un test, publicar
 *      en el sandbox).
 *
 * Formato: entradas de la base de conocimiento (KbEntry), así que además de
 * inyectarse quedan consultables con /api/engine/kb?q=...
 */

import type { KbEntry } from "./knowledgeBase";

const M = (id: string, title: string, body: string, keys: string[], tags: string[], weight = 0.8): KbEntry => ({
  id,
  table: "manual",
  title,
  body,
  keys,
  tags,
  weight,
  lang: "es",
});

// ============================================================
// 1. LEYES DEL MOTOR — se inyectan SIEMPRE que haya herramientas
// ============================================================
export const ENGINE_LAWS: KbEntry[] = [
  M(
    "law-no-mentir",
    "Ley: no afirmes lo que no hiciste",
    "NUNCA digas que leíste un archivo, ejecutaste un comando o creaste un archivo si no llamaste a la herramienta y recibiste su resultado. Si una herramienta falla, di el error tal cual. Si no tienes herramientas disponibles, di «no puedo ejecutar acciones con este modelo» en lugar de simular un resultado. Inventar una ejecución es el peor error posible aquí: hace perder tiempo y rompe la confianza.",
    ["no mentir", "afirmar", "simular", "inventar", "resultado falso", "herramienta", "ejecuté"],
    ["ley", "honestidad"],
    1.0
  ),
  M(
    "law-no-inventar-nombres",
    "Ley: no inventes nombres ni rutas",
    "No inventes funciones, variables, rutas ni nombres de herramientas. Antes de escribir código que use algo del proyecto, pregúntale al motor con find_symbol (o search_in_files). Antes de usar una herramienta, usa el nombre EXACTO del manual; si un nombre no está en el manual, esa herramienta NO existe: no la llames.",
    ["inventar", "nombre", "ruta", "función", "tool", "no existe"],
    ["ley", "precisión"],
    1.0
  ),
  M(
    "law-verificar",
    "Ley: verifica antes de decir que terminaste",
    "Después de escribir o modificar código, comprueba lo que puedas: run_tests, run_command con el build, o al menos read_file_range para releer lo que quedó. Solo entonces informa. Si no pudiste verificar, dilo explícitamente: «cambios aplicados, no verificados».",
    ["verificar", "probar", "terminado", "listo", "comprobar", "test"],
    ["ley", "calidad"],
    0.95
  ),
  M(
    "law-una-pregunta",
    "Ley: una pregunta corta en vez de suponer",
    "Si falta un dato imprescindible (qué archivo, qué puerto, qué ruta, qué depende de qué), haz UNA pregunta corta y detente. No elijas por el usuario en decisiones destructivas o irreversibles.",
    ["preguntar", "duda", "ambiguo", "falta", "suponer"],
    ["ley", "interacción"],
    0.9
  ),
  M(
    "law-destructivo",
    "Ley: lo destructivo primero se avisa",
    "delete_file y run_command con rm/del, git reset, sobrescribir archivos grandes: para y pide confirmación. Explica qué se va a borrar y por qué.",
    ["borrar", "eliminar", "destructivo", "rm", "delete", "sobrescribir"],
    ["ley", "seguridad"],
    0.9
  ),
];

// ============================================================
// 2. MANUAL POR HERRAMIENTA
// ============================================================
export const TOOL_MANUALS: Record<string, KbEntry> = {
  set_plan: M(
    "man-set_plan",
    "set_plan — plan antes de trabajar",
    "Úsala UNA vez al principio si la tarea lleva más de 2 pasos. Recibe tasks: [{id, description}] con ids cortos (t1, t2…). Sirve para que el usuario vea el avance. Error típico: replanificar en cada turno; hazlo solo si el plan cambia de verdad.",
    ["set_plan", "plan", "tareas", "pasos"],
    ["manual", "core"]
  ),
  update_task: M(
    "man-update_task",
    "update_task — marcar avance",
    "Actualiza una tarea del plan: {id, status}. Úsala al TERMINAR cada tarea, no antes. Si una tarea falla y no se reintentará, márcala como bloqueada con el motivo.",
    ["update_task", "estado", "completada", "progreso"],
    ["manual", "core"]
  ),
  list_files: M(
    "man-list_files",
    "list_files — ver qué hay",
    "Lista el contenido del sandbox (.proyectos). Úsala ANTES de crear archivos, para no duplicar ni pisar lo que ya existe y para respetar la estructura del proyecto.",
    ["list_files", "listar", "archivos", "estructura"],
    ["manual", "core"]
  ),
  read_file: M(
    "man-read_file",
    "read_file — leer completo",
    "Lee un archivo del sandbox. Para archivos de más de ~300 líneas usa read_file_range (start/end) o search_in_files: leer 1.000 líneas llena el contexto y con un modelo pequeño eso es espera y ruido. El motor además compacta el resultado.",
    ["read_file", "leer", "archivo"],
    ["manual", "core"]
  ),
  read_file_range: M(
    "man-read_file_range",
    "read_file_range — leer por partes",
    "Lee {path, start, end} (líneas). Es la forma correcta de trabajar con archivos grandes: primero mira la estructura con find_symbol o read_file_range de las primeras 60 líneas, y luego solo el tramo que te interesa.",
    ["read_file_range", "rango", "líneas", "partes"],
    ["manual", "core"]
  ),
  write_file: M(
    "man-write_file",
    "write_file — crear o reemplazar completo",
    "Escribe {path, content} completo. El contenido pasa por el BLINDAJE DE SINTAXIS: si tiene JSON inválido, llaves sin cerrar, JSX desbalanceado o un marcador de «archivo truncado», la escritura se RECHAZA y recibes el motivo. Nunca escribas «…» ni «resto del código»: escribe el archivo entero o créalo por partes con append_file.",
    ["write_file", "escribir", "crear", "reemplazar", "truncado"],
    ["manual", "core"]
  ),
  append_file: M(
    "man-append_file",
    "append_file — añadir al final",
    "Añade texto al final de un archivo (lo crea si no existe). Es la forma recomendada de escribir archivos MUY largos: hazlo en varios tramos del mismo modo en que escribirías a mano. Evita el error de quedarte sin espacio y truncar.",
    ["append_file", "añadir", "final", "partes", "grande"],
    ["manual", "core"]
  ),
  edit_file: M(
    "man-edit_file",
    "edit_file — cambiar un trozo",
    "Reemplaza la primera aparición exacta de {path, find, replace}. Es la herramienta PREFERIDA para cambios puntuales: gasta pocos tokens y no reescribe el archivo entero (menos riesgo de romperlo). El texto de «find» debe copiarse EXACTAMENTE, con su indentación. Si el resultado rompe la sintaxis, el cambio se revierte.",
    ["edit_file", "editar", "reemplazar", "modificar", "cambio"],
    ["manual", "core"],
    0.95
  ),
  forjar_complemento: M(
    "man-forjar_complemento",
    "forjar_complemento — crear complementos nuevos",
    "Cuando pidan «un plugin/complemento para X»: compone una RECETA (id cn.algo en minúsculas, nombre, descripcion legible para el catálogo, permisos mínimos y 1-3 herramientas con params) y llama esta herramienta con la receta como JSON. El IDE compila manifest+panel, los valida con su propio juez y los instala: el complemento nace con pestaña, slash y herramientas para el planificador. Si la receta se tacha, te llegan TODOS los motivos: corrige y reenvía; nada se escribió.",
    ["forjar", "complemento", "plugin", "extensión", "crear plugin", "nueva extensión"],
    ["manual", "core"],
    0.9
  ),
  consultar_espejo: M(
    "man-consultar_espejo",
    "consultar_espejo — cálculo determinista en lote",
    "Los espejos calculan de verdad en ~1 ms: aritmética y unidades exactas (matematicos/fisicos), inventario estructural con nombres (codigos), idioma y perfil de texto (lenguajes), armonías HSL y grillas (artes/disenios), variantes reproducibles (creadores), diseño experimental (cientificos), registro cuántico (cuantico), lotes paralelos de plan (planificadores). MANDA LOTES de hasta 8 llamadas por golpe en vez de una por una. Trata sus salidas como HECHOS: si un espejo dice 34.7, eso es 34.7 — no lo recalcules de cabeza ni lo inventes.",
    ["espejo", "consultar_espejo", "calcular", "lote", "determinista", "aritmética", "accion", "poderes"],
    // PODERES v1: recuerda que cada espejo acepta {accion} — 22 operaciones nuevas.
    ["manual", "core"],
    0.9
  ),
  search_in_files: M(
    "man-search_in_files",
    "search_in_files — buscar dentro del código",
    "Busca un patrón de texto en todos los archivos del sandbox y devuelve archivo:línea. Úsala para localizar dónde se usa algo o dónde está definido cuando find_symbol no lo encuentra (por ejemplo, textos, claves CSS o cadenas).",
    ["search_in_files", "buscar", "grep", "dónde", "dentro"],
    ["manual", "core"]
  ),
  find_symbol: M(
    "man-find_symbol",
    "find_symbol — pregúntale al motor, no al modelo",
    "Devuelve funciones, clases, interfaces y componentes REALES del proyecto con archivo, línea y firma. Es la primera herramienta que debes usar antes de escribir código que llame a algo existente. Cuesta ~400 caracteres; leer el archivo entero cuesta miles.",
    ["find_symbol", "símbolo", "firma", "existe", "API"],
    ["manual", "core"],
    0.95
  ),
  make_dir: M(
    "man-make_dir",
    "make_dir — crear carpeta",
    "Crea una carpeta (con sus padres) dentro del sandbox. No hace falta llamarla antes de write_file: esa ya crea las carpetas necesarias.",
    ["make_dir", "carpeta", "directorio", "mkdir"],
    ["manual", "core"]
  ),
  delete_file: M(
    "man-delete_file",
    "delete_file — borrar (destructivo)",
    "Borra un archivo del sandbox. Es destructivo: avisa al usuario antes y explica por qué. No borres para «empezar de cero» sin decirlo.",
    ["delete_file", "borrar", "eliminar", "destructivo"],
    ["manual", "core"]
  ),
  run_command: M(
    "man-run_command",
    "run_command — ejecutar en el sandbox",
    "Ejecuta {command} dentro de .proyectos (npm, node, python, git, ls). Úsala para instalar, compilar o inspeccionar. Reglas: un comando por llamada; nada de comandos interactivos que esperen entrada; si el comando falla, el motor te devuelve las líneas de error completas (no se compactan) — léelas antes de reintentar, no repitas el mismo comando.",
    ["run_command", "comando", "terminal", "npm", "ejecutar", "build"],
    ["manual", "core"],
    0.95
  ),
  run_tests: M(
    "man-run_tests",
    "run_tests — comprobar que no rompiste nada",
    "Ejecuta las pruebas del proyecto (npm test por defecto) y devuelve el resumen. Úsala DESPUÉS de tocar código y antes de decir que terminaste. Si no hay pruebas configuradas, dilo y propone una comprobación alternativa (build o un script de humo).",
    ["run_tests", "test", "pruebas", "verificar"],
    ["manual", "core"]
  ),
  git_status: M(
    "man-git_status",
    "git_status / git_diff / git_commit — red de seguridad",
    "git_status muestra qué cambió; git_diff el detalle; git_commit guarda con un mensaje. Úsalas antes de un cambio grande (para poder volver) y después (para revisar qué tocaste). Mensajes de commit cortos y en imperativo.",
    ["git", "commit", "diff", "status", "versionar", "volver"],
    ["manual", "core"]
  ),
  fetch_url: M(
    "man-fetch_url",
    "fetch_url — leer una web",
    "Descarga el texto de una URL http/https pública (sin login) y lo devuelve limpio. No sirve para páginas con sesión iniciada. El motor rechaza direcciones internas por seguridad.",
    ["fetch_url", "web", "url", "descargar", "documentación"],
    ["manual", "core"]
  ),
  pc_info: M(
    "man-pc_info",
    "pc_info — mirar tu PC",
    "Devuelve datos reales de tu equipo (sistema, CPU, RAM, rutas). Úsala antes de proponer comandos específicos de sistema operativo, para no enviar comandos de Linux en Windows.",
    ["pc_info", "sistema", "ram", "cpu", "windows"],
    ["manual", "pc"]
  ),
  pc_exec: M(
    "man-pc_exec",
    "pc_exec — ejecutar en tu PC (no en el sandbox)",
    "Ejecuta un comando REAL en tu PC a través del puente :5000. Diferencia clave: run_command trabaja en el sandbox (.proyectos), pc_exec trabaja en tu máquina. No inventes rutas: si no sabes dónde está algo, pregúntalo o búscalo con pc_list_dir antes. Comandos destructivos: avisa primero.",
    ["pc_exec", "pc", "windows", "comando", "real", "puente"],
    ["manual", "pc"],
    0.95
  ),
  pc_read_file: M(
    "man-pc_read_file",
    "pc_read_file / pc_write_file / pc_list_dir / pc_delete",
    "Leen y escriben archivos REALES de tu PC. Usa rutas completas con barras correctas para el sistema. Si un archivo no se encuentra, el motor devuelve el error literal: cópialo tal cual al usuario en lugar de inventar una ruta parecida.",
    ["pc_read_file", "pc_write_file", "pc_list_dir", "pc_delete", "ruta", "no se encontró"],
    ["manual", "pc"],
    0.95
  ),
};

// ============================================================
// 3. PROCEDIMIENTOS — recetas para los trabajos frecuentes
// ============================================================
export const PROCEDURES: KbEntry[] = [
  M(
    "proc-web-page",
    "Procedimiento: crear una página web",
    "1) list_files para ver la estructura. 2) Busca la plantilla o el index existente (search_in_files «<!DOCTYPE» o «createRoot»). 3) Escribe o edita los archivos por partes: estructura HTML, estilos CSS, lógica JS. 4) Dile al usuario que sincronice (o sincroniza) para ver el preview en :3500. 5) Si el preview sale vacío, comprueba que el servidor del sandbox esté arrancado y que exista un package.json en la raíz del proyecto.",
    ["página web", "html", "css", "web", "preview", "plantilla", "crear web"],
    ["procedimiento", "web"],
    0.9
  ),
  M(
    "proc-fix-build",
    "Procedimiento: arreglar un error de compilación",
    "1) Lee el error COMPLETO (archivo, línea, mensaje): run_command del build o el log del sandbox. 2) Abre el archivo y solo el tramo indicado con read_file_range. 3) Identifica la causa (casi siempre: falta una llave o paréntesis, un import roto, o un archivo truncado a medias). 4) Corrige con edit_file. 5) Vuelve a compilar. Nunca «arregles» reescribiendo el archivo entero a ciegas.",
    ["error", "compilar", "build", "syntax", "no compila", "expected"],
    ["procedimiento", "web"],
    0.95
  ),
  M(
    "proc-truncated-file",
    "Procedimiento: archivo truncado ('archivo truncado a 100 KB')",
    "Ese texto lo añade el propio IDE al recortar archivos grandes. Si aparece en un archivo o en tu respuesta, el archivo está ROTO. Solución: no reescribas todo; localiza dónde falta contenido, y crea el resto con append_file o corrige el tramo con edit_file. El motor rechaza cualquier escritura que contenga ese marcador.",
    ["truncado", "100 KB", "archivo roto", "incompleto", "cortado"],
    ["procedimiento", "motor"],
    0.95
  ),
  M(
    "proc-sandbox-no-package",
    "Procedimiento: el sandbox dice 'no se encontró package.json'",
    "Significa que en la RAÍZ del proyecto no hay package.json. Causas habituales: (a) subiste el ZIP de la IDE en vez del proyecto; (b) el ZIP traía una carpeta contenedora y el proyecto quedó un nivel más adentro (ej. Proyecto/ide/backend/package.json). Comprueba con list_files y busca dónde está de verdad el package.json; si está en una subcarpeta, usa ESA carpeta como raíz del proyecto o sube de nuevo el ZIP sin la carpeta contenedora.",
    ["package.json", "sandbox", "no se encontró", "raíz", "proyecto", "sync"],
    ["procedimiento", "sandbox"],
    0.95
  ),
  M(
    "proc-model-without-tools",
    "Procedimiento: modelo demasiado pequeño para herramientas",
    "Si el motor dice que el modelo no tiene herramientas (menos de ~4 B de parámetros), el modelo NO puede leer archivos, ejecutar comandos ni crear nada: solo escribe texto. En ese caso: no pidas tareas de proyecto, avisa al usuario de que cambie a un modelo mayor (≥4 B) o a la nube (GLM-4.7-Flash), y limítate a explicar o resumir.",
    ["modelo pequeño", "sin herramientas", "0.5b", "270m", "no puede", "local"],
    ["procedimiento", "motor"],
    0.95
  ),
  M(
    "proc-supervivencia",
    "Procedimiento: cuando no puedes hacer algo",
    "Di exactamente qué te falta y qué necesitas para continuar: la clave de un servicio, un archivo concreto, permiso para algo destructivo, o un modelo con más capacidad. Nunca rellenes el hueco con una invención ni con datos de ejemplo presentados como reales.",
    ["no puedo", "falta", "necesito", "permiso", "clave", "bloqueado"],
    ["procedimiento", "motor"],
    0.9
  ),
];

/** Todas las entradas del manual, para sembrar la base de conocimiento. */
export const MANUAL_ENTRIES: KbEntry[] = [...ENGINE_LAWS, ...Object.values(TOOL_MANUALS), ...PROCEDURES];

/**
 * Sección compacta que se inyecta en el prompt: las leyes + el manual de las
 * herramientas que este modelo tiene activas. Se dimensiona al presupuesto que
 * le toque al modelo (los micro no llegan aquí: no tienen herramientas).
 */
export function buildToolManualSection(toolNames: string[], budgetChars = 1400): string {
  if (!toolNames || toolNames.length === 0) return "";
  const laws = ENGINE_LAWS.slice(0, 3)
    .map((l) => `- ${l.body.split(".")[0]}.`)
    .join("\n");

  const lines: string[] = [];
  for (const name of toolNames) {
    const m = TOOL_MANUALS[name];
    if (!m) continue;
    // Primera frase: el cuándo; segunda: el cómo y el error típico.
    const sentences = m.body.split(/(?<=\.)\s+/);
    const brief = sentences.slice(0, 2).join(" ");
    lines.push(`- ${name}: ${brief}`);
  }

  let text = `[MANUAL DEL MOTOR — LEE ESTO ANTES DE USAR HERRAMIENTAS]\n${laws}\n\n${lines.join("\n")}`;
  if (text.length > budgetChars) text = text.slice(0, budgetChars) + "\n[…manual recortado: pide el detalle con el nombre de la herramienta…]";
  return text;
}
