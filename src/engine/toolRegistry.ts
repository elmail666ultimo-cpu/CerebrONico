/**
 * toolRegistry.ts — REGISTRO DE HERRAMIENTAS EXTENSIBLE (v2.0)
 * ============================================================
 * Objetivo: que añadir una herramienta nueva a CerebroNico sea escribir UN
 * objeto, sin tocar el bucle del agente, ni el prompt, ni el cliente.
 *
 * Antes (v1.1) las herramientas eran dos arrays constantes en server.ts
 * (`AGENT_TOOLS` y `PC_TOOLS`) y un `switch (name)` de 90 líneas en
 * `executeToolCall()`. Añadir una capacidad obligaba a editar 3 sitios y
 * reiniciar; no había forma de cargar herramientas "de fuera" (un servidor
 * MCP, un pack comunitario, un plugin futuro).
 *
 * Ahora:
 *   1. Cada herramienta declara su esquema + sus REQUISITOS (`requires`).
 *      El registro las filtra por contexto: si no hay Modo PC, las pc_* no
 *      se envían al modelo (menos tokens = más rápido y menos confusión).
 *   2. Los packs se registran con `registerToolPack()`. Los pesados pueden
 *      usar `load()` para cargarse bajo demanda.
 *   3. `registerExternalPack()` permite enchufar herramientas servidas por
 *      OTRO proceso (futuro: servidores MCP, plugins, herramientas remotas):
 *      basta con un endpoint GET /tools que devuelva la lista.
 *   4. `selectToolsForModel()` ajusta cuántas herramientas se ofrecen según
 *      el tamaño del modelo: a un modelo diminuto no se le ofrecen NINGUNA
 *      (no sabe usarlas y se cuelga), y a uno pequeño se le dan solo las
 *      baratas e imprescindibles.
 */

export interface ToolRequirements {
  /** Necesita el Modo Agente PC (puente :5000) */
  pcMode?: boolean;
  /** Necesita un modelo con visión */
  vision?: boolean;
  /** Necesita acceso a red desde el servidor */
  network?: boolean;
  /** Necesita git instalado en el sandbox */
  git?: boolean;
  /** Necesita el sandbox activo (por defecto true) */
  sandbox?: boolean;
}

export interface ToolSpec {
  name: string;
  /** Pack al que pertenece (core, pc, web, git, files, vision, …) */
  pack: string;
  description: string;
  /** JSON Schema de parámetros, formato Ollama/OpenAI */
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  requires?: ToolRequirements;
  /** Marca de peligro: la UI debe pedir confirmación (borrados, sobrescrituras) */
  destructive?: boolean;
  /** Herramientas baratas: pocos tokens de entrada y salida (ideales para modelos pequeños) */
  cheap?: boolean;
}

export interface ToolPack {
  id: string;
  label: string;
  description: string;
  tools: ToolSpec[];
  /** Carga perezosa opcional (packs grandes o remotos) */
  load?: () => Promise<ToolSpec[]>;
}

export interface ToolContext {
  pcMode?: boolean;
  vision?: boolean;
  network?: boolean;
  git?: boolean;
  sandbox?: boolean;
}

// ------------------------------------------------------------
// Registro
// ------------------------------------------------------------
const PACKS = new Map<string, ToolPack>();
/** Índice nombre → spec para búsquedas rápidas y validación de duplicados */
const SPEC_INDEX = new Map<string, ToolSpec>();

export function registerToolPack(pack: ToolPack): void {
  if (!pack || !pack.id) throw new Error("Pack de herramientas sin id");
  // Un pack con el mismo id se REEMPLAZA (permite hot-reload de packs futuros)
  PACKS.set(pack.id, pack);
  for (const t of pack.tools || []) {
    if (!t?.name) continue;
    if (SPEC_INDEX.has(t.name)) {
      console.warn(`[tools] "${t.name}" ya existía y fue sobrescrita por el pack "${pack.id}"`);
    }
    SPEC_INDEX.set(t.name, t);
  }
}

export function listToolPacks(): Array<Omit<ToolPack, "load"> & { toolCount: number }> {
  return [...PACKS.values()].map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    tools: p.tools,
    toolCount: p.tools.length,
  }));
}

export function getAllToolNames(): string[] {
  return [...SPEC_INDEX.keys()];
}

/** Spec concreta (para saber si una llamada del modelo es de una extensión). */
export function getToolSpec(name: string): ToolSpec | undefined {
  return SPEC_INDEX.get(name);
}

/** Quita un pack y sus herramientas (p. ej. cuando se cierra una extensión). */
export function unregisterToolPack(id: string): void {
  const pack = PACKS.get(id);
  if (!pack) return;
  for (const t of pack.tools || []) {
    if (SPEC_INDEX.get(t.name) === t) SPEC_INDEX.delete(t.name);
  }
  PACKS.delete(id);
}

/** Herramientas cuyo `requires` se cumple con el contexto dado. */
export function getActiveToolSpecs(ctx: ToolContext): ToolSpec[] {
  const out: ToolSpec[] = [];
  for (const spec of SPEC_INDEX.values()) {
    const r = spec.requires || {};
    if (r.pcMode && !ctx.pcMode) continue;
    if (r.vision && !ctx.vision) continue;
    if (r.network && ctx.network === false) continue;
    if (r.git && !ctx.git) continue;
    if (r.sandbox === true && ctx.sandbox === false) continue;
    out.push(spec);
  }
  return out;
}

/**
 * Convierte las specs al formato que espera Ollama/OpenAI.
 * Nota: `deleteToolSpecs`-like helpers viven aquí para que un pack futuro no
 * tenga que conocer el formato de ninguna API concreta.
 */
export function toOllamaTools(specs: ToolSpec[]): unknown[] {
  return specs.map((s) => ({
    type: "function",
    function: {
      name: s.name,
      description: s.description,
      parameters: s.parameters,
    },
  }));
}

/**
 * Ajuste por tamaño de modelo:
 *   - sin tool-calling → 0 herramientas (el bucle de agente se desactiva fuera)
 *   - modelo pequeño (≤8B) → solo las herramientas baratas y esenciales, ni una más
 *   - modelos grandes/nube → todas las disponibles para el contexto actual
 */
export function selectToolsForModel(
  specs: ToolSpec[],
  profile: { toolCapable: boolean; paramsB: number | null; remote: boolean },
  maxToolsForSmall = 8
): ToolSpec[] {
  if (!profile.toolCapable) return [];
  if (profile.remote || profile.paramsB === null || profile.paramsB > 8) return specs;
  const essential = specs.filter((s) => s.cheap);
  const rest = specs.filter((s) => !s.cheap);
  return [...essential, ...rest].slice(0, maxToolsForSmall);
}

/**
 * Registra un pack EXTERNO servido por otro proceso (plugin, servidor MCP,
 * microservicio propio). Se espera un GET <baseUrl>/tools que devuelva:
 *   { tools: [{ name, description, parameters, destructive?, cheap? }] }
 * El ejecutor real se resuelve en el servidor con `registerExternalHandler`.
 */
export async function registerExternalPack(
  id: string,
  label: string,
  baseUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<ToolPack | null> {
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/tools`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    const remoteTools: any[] = Array.isArray(data?.tools) ? data.tools : [];
    if (remoteTools.length === 0) return null;

    const tools: ToolSpec[] = remoteTools
      .filter((t) => t && typeof t.name === "string")
      .map((t) => ({
        name: t.name,
        pack: id,
        description: String(t.description || `Herramienta remota ${t.name}`),
        parameters: t.parameters || { type: "object", properties: {}, required: [] },
        destructive: !!t.destructive,
        cheap: !!t.cheap,
        requires: { network: true },
      }));

    const pack: ToolPack = { id, label, description: `Pack remoto desde ${baseUrl}`, tools };
    registerToolPack(pack);
    return pack;
  } catch (err: any) {
    console.warn(`[tools] No se pudo cargar el pack remoto "${id}" (${baseUrl}): ${err?.message || err}`);
    return null;
  }
}

// ============================================================
// PACKS INTEGRADOS
// ============================================================

/** Núcleo: todo lo que funciona dentro del sandbox del proyecto (.proyectos) */
const CORE_PACK: ToolPack = {
  id: "core",
  label: "Núcleo (sandbox)",
  description: "Planificación, lectura/escritura de archivos y ejecución dentro del sandbox.",
  tools: [
    {
      name: "set_plan",
      pack: "core",
      cheap: true,
      description: "Definir el plan de trabajo como lista de tareas accionables. Úsala ANTES de empezar.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "identificador corto, ej t1" },
                description: { type: "string", description: "descripción de la tarea" },
              },
              required: ["id", "description"],
            },
          },
        },
        required: ["tasks"],
      },
    },
    {
      name: "update_task",
      pack: "core",
      cheap: true,
      description: "Actualizar el estado de una tarea del plan.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "identificador de la tarea" },
          status: { type: "string", enum: ["pending", "in_progress", "completed"] },
        },
        required: ["task_id", "status"],
      },
    },
    {
      name: "list_files",
      pack: "core",
      cheap: true,
      description: "Listar los archivos del proyecto en el sandbox.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "read_file",
      pack: "core",
      cheap: true,
      description: "Leer el contenido completo de un archivo del proyecto (ruta relativa).",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta relativa del archivo" } },
        required: ["path"],
      },
    },
    {
      name: "read_file_range",
      pack: "core",
      cheap: true,
      description:
        "Leer solo un rango de líneas de un archivo (mucho más rápido y barato que leer todo). Úsala para archivos grandes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta relativa del archivo" },
          start: { type: "number", description: "línea inicial (1-based)" },
          end: { type: "number", description: "línea final (inclusive)" },
        },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      pack: "core",
      description: "Escribir o crear un archivo completo en el proyecto (ruta relativa).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta relativa del archivo" },
          content: { type: "string", description: "contenido completo del archivo" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "edit_file",
      pack: "core",
      cheap: true,
      description:
        "Reemplazar un fragmento exacto dentro de un archivo existente (find & replace). MUCHO más rápido que reescribir el archivo entero: úsala siempre que puedas.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta relativa del archivo" },
          find: { type: "string", description: "texto exacto a buscar (una sola aparición)" },
          replace: { type: "string", description: "texto de reemplazo" },
        },
        required: ["path", "find", "replace"],
      },
    },
    {
      name: "append_file",
      pack: "core",
      cheap: true,
      description: "Añadir contenido al final de un archivo sin reescribirlo.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta relativa del archivo" },
          content: { type: "string", description: "contenido a añadir" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "search_in_files",
      pack: "core",
      cheap: true,
      description: "Buscar un texto en todos los archivos del proyecto y devolver ruta:línea. Ideal para orientarse sin leer todo.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "texto o expresión regular a buscar" },
          glob: { type: "string", description: "filtro opcional de extensión, ej: .tsx" },
          max_results: { type: "number", description: "máximo de coincidencias (por defecto 40)" },
        },
        required: ["query"],
      },
    },
    {
      name: "make_dir",
      pack: "core",
      cheap: true,
      description: "Crear una carpeta dentro del proyecto.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta de la carpeta" } },
        required: ["path"],
      },
    },
    {
      name: "delete_file",
      pack: "core",
      destructive: true,
      description: "Borrar un archivo del proyecto. Operación destructiva: úsala solo si el usuario lo pidió.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta relativa del archivo" } },
        required: ["path"],
      },
    },
    {
      name: "run_command",
      pack: "core",
      description: "Ejecutar un comando de terminal en el sandbox (npm, node, python, git, ls…).",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "comando a ejecutar" } },
        required: ["command"],
      },
    },
    {
      name: "run_tests",
      pack: "core",
      description: "Ejecutar las pruebas del proyecto (npm test por defecto).",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "comando de test opcional" } },
        required: [],
      },
    },
    {
      // FASE 2 — El motor tiene indexadas las firmas REALES del proyecto, así que
      // esta herramienta pregunta al motor en vez de obligar al modelo a leer
      // archivos enteros. Respuesta típica: ~400 caracteres frente a ~12.000.
      name: "find_symbol",
      pack: "core",
      cheap: true,
      description:
        "Busca funciones, clases, interfaces o componentes que YA existen en el proyecto y devuelve archivo, línea y firma real. Úsala antes de escribir código que llame a algo del proyecto, para no inventar nombres ni firmas.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "nombre (o parte del nombre) del símbolo a buscar" },
          limit: { type: "number", description: "máximo de resultados (por defecto 8)" },
        },
        required: ["name"],
      },
    },
    {
      name: "revisar_cambios",
      pack: "core",
      cheap: true,
      description:
        "Juzga la tanda de cambios que acabas de hacer: sintaxis en disco, API pública perdida e imports rotos. Si algo está rojo, el Quirófano REVIERTE la tanda y te devuelve el informe con el motivo. Úsala SIEMPRE antes de decir que has terminado una mejora sobre una app que funcionaba.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "deshacer_cambios",
      pack: "core",
      cheap: true,
      description:
        "Deshace la última tanda de cambios (restaura los archivos a como estaban antes, y retira los que no existían). Úsala cuando sospeches que has roto algo y no quieras esperar al cierre automático.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  ],
}; /*QF-TOOLS*/

/** Acceso real a la PC del usuario a través del puente Python :5000 */
const PC_PACK: ToolPack = {
  id: "pc",
  label: "Modo Agente PC",
  description: "Ejecuta comandos y manipula archivos REALES de tu PC vía el puente :5000.",
  tools: [
    {
      name: "pc_info",
      pack: "pc",
      cheap: true,
      requires: { pcMode: true },
      description:
        "Información de la PC: sistema operativo, usuario, ruta del Escritorio, home y arquitectura. Úsala ANTES de tocar archivos reales.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "pc_exec",
      pack: "pc",
      requires: { pcMode: true },
      description:
        "Ejecutar un comando REAL en la PC (CMD en Windows, bash en Linux/Mac). Para crear archivos usa pc_write_file (más fiable que echo).",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "comando a ejecutar" },
          timeout: { type: "number", description: "segundos máximos (por defecto 120)" },
        },
        required: ["command"],
      },
    },
    {
      name: "pc_write_file",
      pack: "pc",
      requires: { pcMode: true },
      description:
        "Crear o sobrescribir un archivo REAL en la PC. Acepta rutas absolutas o atajos: 'Desktop/x.txt', 'Documents/…', 'Downloads/…', '~'.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta del archivo" },
          content: { type: "string", description: "contenido completo" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "pc_read_file",
      pack: "pc",
      cheap: true,
      requires: { pcMode: true },
      description: "Leer un archivo REAL de la PC (ruta absoluta o atajo).",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta del archivo" } },
        required: ["path"],
      },
    },
    {
      name: "pc_list_dir",
      pack: "pc",
      cheap: true,
      requires: { pcMode: true },
      description: "Listar una carpeta REAL de la PC.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "carpeta a listar" } },
        required: ["path"],
      },
    },
    {
      name: "pc_delete",
      pack: "pc",
      destructive: true,
      requires: { pcMode: true },
      description: "Borrar un archivo REAL de la PC. DESTRUCTIVA: solo si el usuario lo pidió explícitamente.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta del archivo" } },
        required: ["path"],
      },
    },
  ],
};

/** Git dentro del sandbox (red de seguridad antes de cambios grandes) */
const GIT_PACK: ToolPack = {
  id: "git",
  label: "Git (sandbox)",
  description: "Control de versiones del proyecto: estado, diff y commit de seguridad.",
  tools: [
    {
      name: "git_status",
      pack: "git",
      cheap: true,
      requires: { git: true },
      description: "Estado del repositorio git del proyecto (archivos modificados).",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "git_diff",
      pack: "git",
      requires: { git: true },
      description: "Diff de los cambios sin commitear (opcionalmente de un archivo concreto).",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "archivo concreto (opcional)" } },
        required: [],
      },
    },
    {
      name: "git_commit",
      pack: "git",
      requires: { git: true },
      description: "Guardar un punto de restauración: añade todo al índice y hace commit con el mensaje indicado.",
      parameters: {
        type: "object",
        properties: { message: { type: "string", description: "mensaje del commit" } },
        required: ["message"],
      },
    },
  ],
};

/** Red desde el servidor (read-only). Desactivada si el usuario está en modo offline. */
const WEB_PACK: ToolPack = {
  id: "web",
  label: "Web (read-only)",
  description: "Consultar documentación o APIs públicas desde el servidor.",
  tools: [
    {
      name: "fetch_url",
      pack: "web",
      requires: { network: true },
      description:
        "Descargar el texto de una URL pública (documentación, API JSON). Devuelve texto plano recortado. No ejecuta scripts.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL http/https pública" },
          max_chars: { type: "number", description: "máximo de caracteres a devolver (por defecto 6000)" },
        },
        required: ["url"],
      },
    },
    {
      name: "forjar_complemento",
      pack: "core",
      cheap: true,
      description: "Crea un complemento (extensión) NUEVO a partir de una receta y lo deja instalado y listo: el IDE escribe el manifest y el panel; tú solo pasas la receta. Usar cuando pidan un plugin/complemento para X. Si la receta tiene tachas recibes la lista completa de motivos: corrígela y reenvíala. NUNCA escribas manifest.json a mano.",
      parameters: {
        type: "object",
        properties: {
          receta: { type: "string", description: 'JSON de receta: {"id":"cn.<slug>","nombre":"...","descripcion":"...","proposito":"...","permisos":["workspace.read"],"herramientas":[{"nombre":"<verbo>","descripcion":"...","params":[{"nombre":"...","descripcion":"...","tipo":"string|number|boolean","requerido":true}]}]}. Máximo 3 herramientas; 6 parámetros por herramienta.' },
        },
        required: ["receta"],
      },
    },
    {
      name: "consultar_espejo",
      pack: "core",
      cheap: true,
      description: "Pide trabajo duro y determinista a los agentes espejo y en LOTE (hasta 8 llamadas por golpe): espejo.codigos (inventario de código con nombres de símbolos), lenguajes (idioma + perfil/Flesch), artes (armonías HSL), disenios (grillas/escalas), creadores (variantes por semilla), planificadores (descomposición), cientificos (diseño experimental), fisicos (unidades/constantes), matematicos (aritmética EXACTA), cuantico (registro H/CNOT). NUNCA calcules de cabeza lo que un espejo calcula exacto en ~1 ms; sus números son hechos, no opiniones. PODERES (v1.0.3): añade \"accion\" a «datos» — matematicos: estadistica|resolver|matrices|bases|mcd_mcm|interes; artes: contraste (WCAG)|daltonismo|gradiente; codigos: dependencias|firmas|duplicados; lenguajes: frecuencias|convertir|diff; planificadores: ordenar (topológico, detecta ciclos)|lotes (paralelizables); disenios: escala|breakpoints; cientificos: tam_amostral|ic; cuantico: entrelazamiento. Sin «accion», el espejo hace su orden clásica.",
      parameters: {
        type: "object",
        properties: {
          llamadas: {
            type: "array",
            description: '1-8 llamadas: [{"espejo":"espejo.matematicos","datos":{"expresion":"2*(3+4)"}}]. «datos» según la ficha del espejo (panel Consejo).',
            items: {
              type: "object",
              properties: {
                espejo: { type: "string", description: "id exacto «espejo.*»" },
                datos: { type: "object", description: "entrada del espejo (JSON libre)" },
              },
              required: ["espejo"],
            },
          },
        },
        required: ["llamadas"],
      },
    },
  ],
};

/** Datos: conversión determinista de formatos (módulo ya probado con roundtrip). */
const DATA_PACK: ToolPack = {
  id: "data",
  label: "Datos (formatos)",
  description: "Conversión entre JSON, YAML, TOML y CSV con informe honesto de pérdidas.",
  tools: [
    {
      name: "convertir_formato",
      pack: "data",
      cheap: true,
      description:
        "Convierte un texto entre JSON/YAML/TOML/CSV y devuelve el resultado CON un informe de pérdidas (comentarios, nulos, anidados). Úsala en vez de escribir conversiones a mano: es exacta y declara lo que se pierde.",
      parameters: {
        type: "object",
        properties: {
          texto: { type: "string", description: "contenido de entrada" },
          desde: { type: "string", enum: ["json", "yaml", "toml", "csv"], description: "formato de origen" },
          hacia: { type: "string", enum: ["json", "yaml", "toml", "csv"], description: "formato de destino" },
          ordenar_claves: { type: "boolean", description: "ordena las claves alfabéticamente (por defecto false)" },
          separador_csv: { type: "string", description: "',' o ';' (por defecto ',')" },
          inferir_tipos_csv: { type: "boolean", description: "interpreta 1/true al leer CSV (por defecto false)" },
        },
        required: ["texto", "desde", "hacia"],
      },
    },
  ],
};

/** Registra todos los packs integrados. Idempotente. */
export function registerBuiltinPacks(): void {
  registerToolPack(CORE_PACK);
  registerToolPack(PC_PACK);
  registerToolPack(GIT_PACK);
  registerToolPack(WEB_PACK);
  registerToolPack(DATA_PACK);
}
