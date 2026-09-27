/**
 * aduanaArbol.ts — QUÉ ENTRA AL ÁRBOL Y QUÉ NO (v8.0.6)
 * ======================================================
 * Petición que originó este archivo, literal:
 *
 *   «cuando se está trabajando el modelo debe de preguntar qué se agrega al
 *    árbol y qué no, se cometen muchos errores, se suman archivos que no van en
 *    el empaque»
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA COMPROBACIÓN EMPÍRICA, ANTES DE ESCRIBIR NADA
 * ─────────────────────────────────────────────────────────────────────────────
 * `generateCnFile` (src/utils/fileParser.ts) empaquetaba así:
 *
 *     for (const file of files) {
 *       if (file.path && typeof file.content === "string") {
 *         zip.file(file.path, file.content);      // ← todo lo que tenga ruta
 *       }
 *     }
 *
 * Sin una sola exclusión. No es que la lista estuviera corta: **no había lista**.
 * Cualquier cosa con nombre y contenido entraba en el `.cn`: un `.env` con la
 * clave de Gemini, un `debug.log` de 40 MB, el `node_modules` completo si el
 * modelo lo hubiera creado, o la copia espejo de `.proyectos/` que genera el
 * propio sync. Eso es exactamente «se suman archivos que no van en el empaque».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Y LA SEGUNDA MITAD: QUE EL MODELO PREGUNTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La petición no pide solo un filtro. Pide que **se pregunte**. La diferencia
 * importa: un filtro silencioso que decide por su cuenta comete el mismo pecado
 * que no tener filtro — decidir por el usuario sin decírselo. Por eso el
 * veredicto tiene TRES valores y no dos:
 *
 *   · «incluir»   → es código, configuración o documentación. No hay nada que
 *                   preguntar; preguntar por un `.ts` sería ruido y el ruido
 *                   enseña a ignorar las preguntas.
 *   · «preguntar» → no se sabe qué es, o es pesado, o es de datos. **Aquí es
 *                   donde el modelo tiene que preguntar.** Es la categoría que
 *                   antes no existía y por la que entraba basura.
 *   · «prohibido» → no entra nunca, ni preguntando. Secretos y artefactos:
 *                   cosas cuyo daño no se arregla con un «sí».
 *
 * Módulo puro: entra una lista de rutas, sale un dictamen. Sin disco, sin red, y
 * por eso se puede probar entero — que es justo lo que la lista anterior no
 * tenía.
 */

export type Veredicto = "incluir" | "preguntar" | "prohibido";

export type Categoria =
  | "codigo"
  | "config"
  | "documentacion"
  | "arte"
  | "datos"
  | "artefacto"
  | "efimero"
  | "secreto"
  | "espejo"
  | "desconocido"
  | "sospechoso";

export interface Dictamen {
  ruta: string;
  veredicto: Veredicto;
  categoria: Categoria;
  /** Por qué, en una frase que se le pueda enseñar al usuario tal cual. */
  motivo: string;
}

export interface Auditoria {
  dictamenes: Dictamen[];
  incluir: Dictamen[];
  preguntar: Dictamen[];
  prohibidos: Dictamen[];
  /** Resumen de una línea, para el registro. */
  resumen: string;
  /**
   * La pregunta concreta que hay que hacerle al usuario, o `null` si no hay
   * nada que preguntar. Se devuelve REDACTADA para no dejar la formulación al
   * criterio de cada modelo: una pregunta vaga produce un «sí» que no autoriza
   * nada.
   */
  pregunta: string | null;
}

// ── SECRETOS: lo primero, porque es lo único irreversible ───────────────────
// Un `.env` empaquetado y enviado por chat ya está filtrado. No hay «deshacer».
const SECRETOS = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)\.env$/i,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.htpasswd$/i,
  // `service[-_.]?account` y no `serviceaccount`: el nombre real lleva guion
  // (`service-account.json`), y la primera versión sin separadores lo dejaba
  // pasar. Lo cazó la prueba — un secreto que se cuela por un guion es
  // exactamente la clase de fallo que esta lista existe para evitar.
  /(^|\/)(credentials|secrets?|service[-_.]?account[-_.\w]*)\.json$/i,
  /(^|\/)\.aws(\/|$)/i,
  /(^|\/)\.ssh(\/|$)/i,
  /(^|\/)terraform\.tfstate(\.backup)?$/i,
];

// ── ARTEFACTOS: se reconstruyen, no se empaquetan ──────────────────────────
const ARTEFACTOS = [
  /(^|\/)node_modules(\/|$)/i,
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)(dist|dist_electron|build|out|coverage|\.next|\.nuxt|\.output|\.svelte-kit)(\/|$)/i,
  /(^|\/)(venv|\.venv|env|__pycache__|\.pytest_cache|\.mypy_cache|target)(\/|$)/i,
  /(^|\/)(\.cache|\.parcel-cache|\.turbo|\.vite|\.rollup\.cache)(\/|$)/i,
  /(^|\/)\.cerebro-db(\/|$)/i,
];

// ── EFÍMEROS: basura de una sesión ─────────────────────────────────────────
// Ojo con los `.lock`: `package-lock.json`, `Cargo.lock` o `poetry.lock` son
// ficheros DE VERDAD del proyecto y deben viajar. Sólo se descartan los que son
// señales de proceso vivo.
const EFIMEROS = [
  /\.(log|tmp|temp|bak|swp|swo|orig|pid|dump|core)$/i,
  /~$/,
  /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|nohup\.out)$/i,
  /(^|\/)(npm-debug|yarn-error|pnpm-debug)\.log$/i,
];

// ── EL ESPEJO DEL SANDBOX: el error que el propio motor se creaba ──────────
// El sync escribe el árbol del workspace dentro de `.proyectos`. Si el workspace
// ya venía con esa carpeta, aparece `.proyectos/... ` dentro de `.proyectos/`.
// Empaquetarlo DUPLICA el proyecto entero y, además, es la causa del «proyecto
// duplicado» que ya dio problemas. Aquí no entra.
const ESPEJOS = [/(^|\/)\.proyectos(\/|$)/i, /(^|\/)proyectos(\/|$)/i];

const CODIGO = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|c|h|cc|cpp|cs|rb|php|lua|swift|dart|sh|bash|ps1|bat|sql|html|htm|css|scss|sass|less|vue|svelte|astro|cn)$/i;
const CONFIG = /\.(json|jsonc|toml|ya?ml|ini|cfg|conf|properties|tf|tfvars|gradle|plist)$/i;
const CONFIG_NOMBRES = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|tsconfig[^/]*\.json|vite\.config\.[cm]?[jt]s|Dockerfile|Makefile|Procfile|requirements\.txt|pyproject\.toml|setup\.py|go\.mod|Cargo\.toml|pom\.xml|build\.gradle|\.editorconfig|\.gitignore|\.dockerignore|\.npmignore)$/i;
const DOCS = /\.(md|markdown|rst|txt|adoc)$/i;
const ARTE = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg|mp4|webm|mov|mp3|wav|ogg|flac|woff2?|ttf|otf|eot)$/i;
const DATOS = /\.(csv|tsv|xlsx?|parquet|db|sqlite3?|mdb|ndjson|jsonl|xml|pdf|docx?|pptx?|zip|tar|gz|7z|rar)$/i;

function normalizar(ruta: string): string {
  return String(ruta || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .trim();
}

/**
 * Dictamina UNA ruta. El orden de las comprobaciones es el orden del daño:
 * primero lo que no se puede deshacer (secretos), después lo que se reconstruye
 * (artefactos), después lo que ensucia (efímeros, espejos) y sólo al final la
 * pregunta de «¿esto qué es?».
 */
export function clasificarRuta(rutaCruda: string): Dictamen {
  const ruta = normalizar(rutaCruda);

  if (!ruta) {
    return { ruta, veredicto: "prohibido", categoria: "sospechoso", motivo: "Ruta vacía: no identifica ningún archivo." };
  }

  // Una ruta ABSOLUTA no se empaqueta ni se discute. Se comprueba sobre el texto
  // original, antes de normalizar: normalizar quita la barra inicial y
  // `/etc/passwd` quedaría convertido en `etc/passwd`, que parece relativo y
  // pasaría como archivo desconocido. El porqué importa: una ruta absoluta no
  // habla de este proyecto, habla del sistema donde corre.
  if (/^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(String(rutaCruda ?? "").trim())) {
    return {
      ruta,
      veredicto: "prohibido",
      categoria: "sospechoso",
      motivo: "La ruta es absoluta: apunta al sistema de archivos, no al proyecto. No se empaqueta.",
    };
  }

  // Una ruta que pretende salirse del árbol tampoco.
  if (/(^|\/)\.\.(\/|$)/.test(ruta)) {
    return {
      ruta,
      veredicto: "prohibido",
      categoria: "sospechoso",
      motivo: "La ruta apunta fuera del árbol (absoluta o con «..»): empaquetarla podría incluir archivos del sistema.",
    };
  }

  for (const re of SECRETOS) {
    if (re.test(ruta)) {
      return {
        ruta,
        veredicto: "prohibido",
        categoria: "secreto",
        motivo: "Parece un secreto (clave, credencial o configuración privada). Un paquete enviado ya no se puede desdecir: no entra nunca.",
      };
    }
  }

  for (const re of ARTEFACTOS) {
    if (re.test(ruta)) {
      return {
        ruta,
        veredicto: "prohibido",
        categoria: "artefacto",
        motivo: "Carpeta de artefactos o dependencias: se regenera instalando, pesa muchísimo y no aporta nada al paquete.",
      };
    }
  }

  for (const re of ESPEJOS) {
    if (re.test(ruta)) {
      return {
        ruta,
        veredicto: "prohibido",
        categoria: "espejo",
        motivo: "Es la copia del sandbox (`.proyectos`), no el proyecto: empaquetarla duplica el árbol entero y confunde al restaurar.",
      };
    }
  }

  for (const re of EFIMEROS) {
    if (re.test(ruta)) {
      return {
        ruta,
        veredicto: "prohibido",
        categoria: "efimero",
        motivo: "Archivo temporal o de traza: sobra en el paquete y suele ser el que más pesa.",
      };
    }
  }

  if (CONFIG_NOMBRES.test(ruta) || CODIGO.test(ruta) || CONFIG.test(ruta)) {
    return { ruta, veredicto: "incluir", categoria: CODIGO.test(ruta) ? "codigo" : "config", motivo: "Código o configuración del proyecto." };
  }
  if (DOCS.test(ruta)) {
    return { ruta, veredicto: "incluir", categoria: "documentacion", motivo: "Documentación del proyecto." };
  }
  if (ARTE.test(ruta)) {
    return {
      ruta,
      veredicto: "preguntar",
      categoria: "arte",
      motivo: "Material gráfico: puede ser del proyecto o un adjunto suelto. Conviene confirmarlo antes de engordar el paquete.",
    };
  }
  if (DATOS.test(ruta)) {
    return {
      ruta,
      veredicto: "preguntar",
      categoria: "datos",
      motivo: "Archivo de datos o documento: normalmente no es parte del código y puede contener información que no quieres repartir.",
    };
  }

  // ESTE es el caso que antes entraba en silencio, y es el que hay que preguntar.
  return {
    ruta,
    veredicto: "preguntar",
    categoria: "desconocido",
    motivo: "No se reconoce la extensión ni el nombre: no se añade por iniciativa propia.",
  };
}

/** Dictamina una lista completa y la agrupa, dejando la pregunta redactada. */
export function auditarArbol(rutas: string[]): Auditoria {
  const dictamenes = (rutas || []).map((r) => clasificarRuta(r));
  const incluir = dictamenes.filter((d) => d.veredicto === "incluir");
  const preguntar = dictamenes.filter((d) => d.veredicto === "preguntar");
  const prohibidos = dictamenes.filter((d) => d.veredicto === "prohibido");

  const resumen =
    `${dictamenes.length} archivo(s): ${incluir.length} entran sin discusión, ` +
    `${preguntar.length} necesitan confirmación, ${prohibidos.length} no pueden entrar.`;

  let pregunta: string | null = null;

  if (preguntar.length > 0 || prohibidos.length > 0) {
    const partes: string[] = [];
    partes.push("Antes de tocar el árbol del proyecto:");

    if (incluir.length > 0) {
      partes.push(`- Añado sin preguntar (${incluir.length}): código, configuración y documentación del propio proyecto.`);
    }
    if (preguntar.length > 0) {
      // Se listan hasta 8: una lista de 200 rutas no se lee, y una pregunta que
      // no se lee se contesta con un «sí» que no significa nada.
      const lista = preguntar.slice(0, 8).map((d) => `  · ${d.ruta} — ${d.motivo}`).join("\n");
      const resto = preguntar.length > 8 ? `\n  · …y ${preguntar.length - 8} más.` : "";
      partes.push(`- Necesito tu confirmación para ${preguntar.length}:\n${lista}${resto}`);
    }
    if (prohibidos.length > 0) {
      const lista = prohibidos.slice(0, 8).map((d) => `  · ${d.ruta} — ${d.motivo}`).join("\n");
      const resto = prohibidos.length > 8 ? `\n  · …y ${prohibidos.length - 8} más.` : "";
      partes.push(`- NO los añado (${prohibidos.length}), ni aunque digas que sí:\n${lista}${resto}`);
    }
    partes.push("¿Confirmas las adiciones que necesitan permiso, o dejo alguna fuera?");
    pregunta = partes.join("\n");
  }

  return { dictamenes, incluir, preguntar, prohibidos, resumen, pregunta };
}

/** ¿Se puede empaquetar esta ruta? Atajo para el filtro del empaquetador. */
export function puedeIrEnElEmpaque(rutaCruda: string): boolean {
  return clasificarRuta(rutaCruda).veredicto !== "prohibido";
}
