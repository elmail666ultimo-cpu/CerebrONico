/**
 * orquestador.ts — EL ORQUESTADOR ÚNICO DE ESPEJOS (Reflejo v3.0 / Paso 1)
 * ========================================================================
 * Sustituye a la lógica dispersa que en v2.x vivía entre consejo.ts,
 * conductor.ts y planExecutors.ts. Aquí hay UN solo planificador, declarativo,
 * que aplica leyes (físicas, matemáticas, lingüísticas, científicas,
 * cuánticas, antropológicas, extensibles, transformables, autoaprendibles)
 * y devuelve el espejo + datos que hay que invocar.
 *
 * Reglas de hierro (heredadas del Reflejo v2.4):
 *   1. Cero filtro de contenido: la frase viaja tal cual al patrón.
 *   2. Nada se descarta en silencio: si ninguna ley encaja, devuelve null
 *      y el planificador cae al modelo. La decisión es audible.
 *   3. Las leyes se cargan desde LEYES_REFLEJO (array declarativo). Añadir
 *      una ley = añadir una entrada al array, sin tocar el dispatch.
 *
 * Contrato:
 *   planificadorPorLeyes(frase) → { espejo, datos, ley, ms } | null
 *
 * Si devuelve null, el llamador debe usar el modelo. Si devuelve un espejo,
 * el llamador debe invocarlo con `ejecutarEntidad(espejo, datos)`.
 *
 * Las leyes se ordenan por `prioridad` ascendente (1 = más alta). Reflejo v5:
 * se prueban TODAS y se decide por confianza; en igualdad de condiciones gana
 * la de menor prioridad y, en empate final, el id alfabéticamente menor. Con
 * dos espejos distintos casi empatados el orquestador CONFIESA la duda en vez
 * de adivinar (cero alucinación de enrutamiento).
 */

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface LeyReflejo {
  /** id corto, único. Se devuelve en `ley` para que el llamador sepa cuál aplicó. */
  id: string;
  /** Familia (física, matemática, lingüística, científica, cuántica,
   *  antropológica, extensible, transformable, autoaprendible). */
  familia: string;
  /** 1 = máxima prioridad (se prueba primero). Mayor = se prueba después. */
  prioridad: number;
  /** Regex que, si matchea, activa la ley. */
  patron: RegExp;
  /** Devuelve los `datos` que se le pasan al espejo. Recibe el match del patrón. */
  datos: (m: RegExpMatchArray) => Record<string, unknown>;
  /** Opcional: transforma la frase antes de pasarla al patrón. Por defecto
   *  no transforma. Útil para leyes que normalizan sinónimos. */
  transformar?: (frase: string) => string;
  /** Espejo destino (id `espejo.*`). */
  espejo: string;
  /** Descripción humana, una línea. Se devuelve como `ley`. */
  descripcion: string;
  // ─── Reflejo v5 · confianza y plantilla ────────────────────────────────────
  /** Confianza base de la ley (0..1). Si no se declara, se deriva: leyes con
   *  extracción numérica/de unidades valen 0.85; de solo palabra-clave, 0.70;
   *  aprendidas sin plantilla, 0.60. */
  confianza?: number;
  /**
   * Plantilla serializable de `datos` para LEYES APRENDIDAS: cada campo se
   * rellena con `$1..$9` (grupo del regex) o `$input` (frase completa).
   * Sin plantilla, una ley aprendida no puede reconstruir su función `datos`
   * tras el reinicio (las funciones no se serializan) — este campo es la cura
   * del bug v1.0.3: las leyes aprendidas morían en silencio al recargar.
   */
  plantilla?: Record<string, string>;
  // ─── Reflejo v3.0 · extensión A+B ────────────────────────────────────────
  /** Opcional: si se define, esta ley despacha a un Ollama EXTERNO (no al
   *  espejo determinista local). El endpoint recibe `datos` como JSON y se
   *  espera que devuelva el formato de Ollama (`{response, ...}`).
   *
   *  Soporta placeholders: {prompt} se reemplaza por `datos.prompt` (o la
   *  frase cruda si no hay), {model} por `endpointModel`, {system} por
   *  `endpointSystem`.
   *
   *  Ejemplo: "http://ollama-medicina:11434/api/generate" con
   *  endpointModel: "medicina-v1" y endpointSystem: "Eres un espejo clínico…".
   *
   *  Si se define, el orquestador devuelve `modo: "ollama-externo"` en vez
   *  de `modo: "espejo-local"`. El llamador (server.ts) decide cómo despachar.
   */
  endpoint?: string;
  /** Modelo Ollama del endpoint externo. Solo aplica si `endpoint` está definido. */
  endpointModel?: string;
  /** System prompt del endpoint externo. Solo aplica si `endpoint` está definido. */
  endpointSystem?: string;
}

// ─── LAS 9 FAMILIAS DE LEYES ────────────────────────────────────────────────

export const LEYES_REFLEJO: LeyReflejo[] = [
  // ═══════════════ FÍSICA ═══════════════
  {
    id: "fis-conv",
    familia: "física",
    prioridad: 10,
    patron: /\b(\d+(?:[.,]\d+)?)\s*(km|cm|mm|m|kg|g|mg|N|J|W|Pa|Hz|V|A|Ω|F|C|K|mol|cd)\s+(?:a|en|to)\s+(km|cm|mm|m|kg|g|mg|N|J|W|Pa|Hz|V|A|Ω|F|C|K|mol|cd)\b/i,
    datos: (m) => {
      const cantidad = parseFloat((m[1] || "0").replace(",", "."));
      return { de: m[2].toLowerCase(), a: m[3].toLowerCase(), cantidad };
    },
    espejo: "espejo.fisicos",
    descripcion: "física: conversión de unidades SI",
  },
  {
    id: "fis-expr",
    familia: "física",
    prioridad: 11,
    patron: /\b(?:calcula|evalua|resuelve|cuanto vale|cuanto es)\s+(?:la\s+)?(energ[ií]a|fuerza|potencia|presi[oó]n|frecuencia|tensio?n|corriente|resistencia|capacidad|carga|temperatura)\b/i,
    datos: (m) => {
      // Mapa hispano → símbolo SI
      const map: Record<string, string> = {
        energia: "E", fuerza: "F", potencia: "P", presion: "p", frecuencia: "f",
        tension: "V", voltaje: "V", corriente: "I", resistencia: "R",
        capacidad: "C", carga: "Q", temperatura: "T",
      };
      const simbolo = map[(m[1] || "").toLowerCase()] || "X";
      return { expresion: simbolo };
    },
    espejo: "espejo.fisicos",
    descripcion: "física: magnitud física con su símbolo SI",
  },

  // ═══════════════ MATEMÁTICAS ═══════════════
  {
    id: "mat-sqrt",
    familia: "matemática",
    prioridad: 20,
    patron: /\b(?:ra[ií]z\s+cuadrada\s+de|sqrt)\s+(-?\d+(?:[.,]\d+)?)\b/i,
    datos: (m) => ({ expresion: `sqrt(${(m[1] || "0").replace(",", ".")})` }),
    espejo: "espejo.matematicos",
    descripcion: "matemática: raíz cuadrada explícita",
  },
  {
    id: "mat-mcd",
    familia: "matemática",
    prioridad: 21,
    patron: /\b(?:mcd|m[aá]ximo\s+com[uú]n\s+divisor)\s+(?:de\s+)?(\d+(?:\s*,\s*|\s+y\s+|,?\s+)\d+(?:[.,]\d+)?(?:\s*,\s*|\s+y\s+|,?\s+)?\d*)\b/i,
    datos: (m) => {
      const partes = (m[1] || "").split(/,\s*|\s+y\s+|\s+/).map((s) => parseInt(s.replace(/[.,].*/, ""), 10)).filter((n) => Number.isInteger(n));
      return { enteros: partes };
    },
    espejo: "espejo.matematicos",
    descripcion: "matemática: mcd de una lista de enteros",
  },
  {
    id: "mat-estad",
    familia: "matemática",
    prioridad: 22,
    patron: /\b(?:estad[ií]stica|estadisticas|media|mediana|moda|desviaci[oó]n)\s+(?:de\s+)?([\d\s,.-]+)/i,
    datos: (m) => {
      const datos = (m[1] || "").split(/[\s,]+/).map((s) => parseFloat(s.replace(",", "."))).filter((n) => Number.isFinite(n));
      return { datos, accion: "estadistica" };
    },
    espejo: "espejo.matematicos",
    descripcion: "matemática: estadística descriptiva",
  },
  {
    id: "mat-expr",
    familia: "matemática",
    prioridad: 25,
    patron: /\b(?:calcula|evalua|resuelve|cuanto vale|cuanto es)\s+([\d\s+\-*/%^().,a-z×÷]+?)(?:\s*(?:\.|$))/i,
    datos: (m) => ({ expresion: (m[1] || "").trim().replace(/,/g, ".").replace(/×/g, "*").replace(/÷/g, "/") }),
    espejo: "espejo.matematicos",
    descripcion: "matemática: expresión aritmética libre",
  },

  // ═══════════════ LINGÜÍSTICA ═══════════════
  {
    id: "ling-idioma",
    familia: "lingüística",
    prioridad: 30,
    patron: /\b(?:detecta|identifica|qu[eé]\s+idioma|en\s+qu[eé]\s+idioma)\s+(?:est[aá]\s+|es\s+|va\s+|se\s+encuentra\s+)?(?:este\s+|esta\s+)?(?:texto|frase|p[aá]rrafo|mensaje)\s*:?\s*["“]?([^"”]+)["”]?/i,
    datos: (m) => ({ texto: (m[1] || "").trim() }),
    espejo: "espejo.lenguajes",
    descripcion: "lingüística: detección de idioma",
  },
  {
    id: "ling-legibilidad",
    familia: "lingüística",
    prioridad: 31,
    patron: /\b(?:legibilidad|qu[eé]\s+tan\s+legible|qu[eé]\s+tan\s+dif[ií]cil|lectura|f[aá]cil\s+de\s+leer)\b/i,
    datos: (m) => ({ texto: "" }),  // El espejo pedirá el texto aparte; aquí solo marcamos intención
    espejo: "espejo.lenguajes",
    descripcion: "lingüística: perfil de legibilidad",
  },

  // ═══════════════ CIENTÍFICAS ═══════════════
  {
    id: "cie-exp",
    familia: "científica",
    prioridad: 40,
    patron: /\b(?:dise[ñn]a?\s+un\s+experimento|experimento|hip[oó]tesis|prueba\s+estad[ií]stica|test\s+de\s+hip[oó]tesis|t-test|chi\s+cuadrado|anova)\b/i,
    datos: (m) => {
      const txt = (m[0] || "").toLowerCase();
      const prueba = /anova/.test(txt) ? "ANOVA" : /chi/.test(txt) ? "chi-cuadrado" : /t-test|t de student|t-?test/.test(txt) ? "T-test" : "auto";
      return { prueba, datos: [] };
    },
    espejo: "espejo.cientificos",
    descripcion: "científica: diseño experimental",
  },

  // ═══════════════ CUÁNTICA ═══════════════
  {
    id: "cnt-qubits",
    familia: "cuántica",
    prioridad: 50,
    patron: /\b(\d+)\s*qubits?\b/i,
    datos: (m) => {
      const n = parseInt(m[1] || "1", 10);
      // Detecta puertas que aparecen en la frase: "h, x, y, z, s, t, cnot{0,1}"
      const puertas: Array<{ p: string; q?: number; t?: number }> = [];
      const ops = (m.input || "").match(/(?:h|x|y|z|s|t)\s*(?:@|en|sobre)?\s*(\d+)/gi) || [];
      for (const op of ops) {
        const partes = op.match(/([hxyzt])\s*(?:@|en|sobre)?\s*(\d+)/i);
        if (partes) puertas.push({ p: partes[1].toLowerCase(), q: parseInt(partes[2], 10) });
      }
      const cnot = (m.input || "").match(/cnot\s*(?:\{?(\d+)\s*,\s*(\d+)\}?|\s+(\d+)\s+(\d+))/i);
      if (cnot) {
        const q = parseInt(cnot[1] || cnot[3], 10);
        const t = parseInt(cnot[2] || cnot[4], 10);
        puertas.push({ p: "cnot", q, t });
      }
      return { qubits: Math.max(1, Math.min(8, n)), puertas };
    },
    espejo: "espejo.cuantico",
    descripcion: "cuántica: registro de qubits con puertas",
  },
  {
    id: "cnt-superposicion",
    familia: "cuántica",
    prioridad: 51,
    patron: /\b(?:superposici[oó]n|entrelazamiento|puerta\s+H|hadamard|estado\s+de\s+Bell|par\s+de\s+Bell)\b/i,
    datos: () => ({ qubits: 2, puertas: [{ p: "h", q: 0 }, { p: "cnot", q: 0, t: 1 }] }),
    espejo: "espejo.cuantico",
    descripcion: "cuántica: superposición/entrelazamiento estándar",
  },

  // ═══════════════ ANTROPOLÓGICAS (código, arte) ═══════════════
  {
    id: "ant-codigo",
    familia: "antropológica",
    prioridad: 60,
    patron: /\b(?:analiza|revisa|inventario\s+estructural|s[ií]mbolos|imports?|ciclom[aá]tica)\b/i,
    datos: (m) => {
      // 🐞 DEFECTO v1.0.3 (cazado por el escáner de resiliencia): el ternario
      // original tenía las DOS RAMAS IGUALES (`? "" : ""`) — no era una
      // decisión, era una constante disfrazada: esta ley SIEMPRE entregaba
      // `codigo: ""` y el espejo rechazaba el dato vacío. Un ternario con
      // ramas idénticas es un bug que se disfraza de lógica.
      // Ahora extrae de verdad: si la frase nombra un archivo de código, ese
      // archivo; si no, la frase completa (el espejo decide qué hacer con ella).
      const frase = m.input || "";
      const archivo = /([\w.\-/ ]+\.(?:ts|tsx|js|jsx|mjs|py|rs|go|java|php|rb|c|cpp|h|hpp|css|html|sql|json|yaml|yml))\b/i.exec(frase);
      return { codigo: archivo ? archivo[1].trim() : frase };
    },
    espejo: "espejo.codigos",
    descripcion: "antropológica: inventario estructural de código",
  },
  {
    id: "ant-arte",
    familia: "antropológica",
    prioridad: 61,
    patron: /\b(?:paleta|armon[ií]a\s+crom[aá]tica|colores?\s+compatibles|combinaci[oó]n\s+de\s+colores)\b/i,
    datos: (m) => {
      // Busca un hex en la frase; si no hay, devuelve sin base para que el espejo use su default.
      const hex = (m.input || "").match(/#?([0-9a-fA-F]{6})\b/);
      return hex ? { base: "#" + hex[1] } : {};
    },
    espejo: "espejo.artes",
    descripcion: "antropológica: armonía cromática",
  },
  {
    id: "ant-disenio",
    familia: "antropológica",
    prioridad: 62,
    patron: /\b(?:grilla|grid|escala\s+8pt|ret[ií]cula|8\s*pt|sistema\s+de\s+dise[ñn]o)\b/i,
    datos: () => ({}),
    espejo: "espejo.disenios",
    descripcion: "antropológica: grilla y escala de diseño",
  },

  // ═══════════════ EXTENSIBLES (vacío — se llena con leyes aprendidas) ═══════════════
  // Las leyes aprendidas desde el runtime se cargan en `LEYES_APRENDIDAS`
  // más abajo. Tienen prioridad 100+ para no tapar a las curadas.

  // ═══════════════ TRANSFORMABLES ═══════════════
  {
    id: "trf-area-triangulo",
    familia: "transformable",
    prioridad: 70,
    // Sin `\b` al inicio: `\b` no funciona con `á` (no-ASCII). Usamos un
    // lookbehind suave: (?:^|\s) o cualquiera de las dos variantes.
    patron: /(?:^|\s)[aá]rea\s+de\s+(?:un|una)?\s*tri[aá]ngulo(?:\s+de\s+base\s+(\d+(?:[.,]\d+)?)\s+y\s+altura\s+(\d+(?:[.,]\d+)?))?/i,
    datos: (m) => {
      const b = parseFloat((m[1] || "0").replace(",", "."));
      const h = parseFloat((m[2] || "0").replace(",", "."));
      // Si la frase NO trae base/altura explícita, devolvemos expresión simbólica
      // para que el espejo matematicos sepa qué se pide y el modelo la llene.
      if (m[1] && m[2]) return { expresion: `${b} * ${h} / 2` };
      return { expresion: "b * h / 2" };
    },
    espejo: "espejo.matematicos",
    descripcion: "transformable: área de triángulo → expresión b*h/2",
  },
  {
    id: "trf-ohm",
    familia: "transformable",
    prioridad: 71,
    // Los `/` dentro del regex se escaparon porque cierran el literal.
    patron: new RegExp("\\bley\\s+de\\s+ohm\\b.*\\b(?:V\\s*=\\s*I\\s*\\*?\\s*R|I\\s*=\\s*V\\s*\\/\\s*R|R\\s*=\\s*V\\s*\\/\\s*I)\\b", "i"),
    datos: (m) => {
      const txt = (m[0] || "").replace(/\s/g, "");
      if (/V=I\*?R/i.test(txt)) return { expresion: "V=I*R" };
      if (/I=V\/R/i.test(txt))  return { expresion: "I=V/R" };
      if (/R=V\/I/i.test(txt)) return { expresion: "R=V/I" };
      return { expresion: "V=I*R" };
    },
    espejo: "espejo.fisicos",
    descripcion: "transformable: ley de Ohm → expresión simbólica",
  },

  // ═══════════════ EXTENSIBLES — plantillas para Ollama externo (extensión B) ═══════════════
  // Estas leyes están DESACTIVADAS por defecto (comentadas). Son la plantilla
  // que Mario o cualquier usuario puede descomentar y rellenar para enrutar
  // preguntas de una disciplina a un Ollama externo (otro contenedor Docker,
  // un nodo de la cuadrícula, etc.).
  //
  // Ejemplo (medicina): si tienes un Ollama corriendo en otro servidor con
  // un modelo "medicina-v1" entrenado para rigor clínico, descomenta esto y
  // rellena el endpoint. El orquestador, cuando vea una pregunta con
  // palabras como "paciente", "dosis", "diagnóstico", enrutará a ese Ollama
  // automáticamente en vez de al espejo local determinista.
  //
  // {
  //   id: "ext-medicina",
  //   familia: "personalizada",
  //   prioridad: 80,
  //   patron: /\b(paciente|dosis|s[ií]ntoma|f[aá]rmaco|cl[ií]nico|diagn[oó]stico|tratamiento|enfermedad)\b/i,
  //   datos: (m) => ({ prompt: m.input || "" }),
  //   espejo: "espejo.medicina",  // id simbólico; el despacho real es por `endpoint`
  //   descripcion: "extensible: medicina → Ollama externo",
  //   endpoint: "http://ollama-medicina:11434/api/generate",
  //   endpointModel: "medicina-v1",
  //   endpointSystem: "Eres un espejo experto en medicina. Prioriza el rigor clínico y cita fuentes cuando sea posible.",
  // },
  // {
  //   id: "ext-codigo",
  //   familia: "personalizada",
  //   prioridad: 81,
  //   patron: /\b(function|const|let|bug|error|typescript|python|git|api|sql|c[oó]digo|depurar|refactor)\b/i,
  //   datos: (m) => ({ prompt: m.input || "" }),
  //   espejo: "espejo.codigo",
  //   descripcion: "extensible: código → Ollama externo (deepseek-coder)",
  //   endpoint: "http://ollama-codigo:11434/api/generate",
  //   endpointModel: "deepseek-coder:6.7b",
  //   endpointSystem: "Eres un espejo experto en ingeniería de software. Responde con código limpio y directamente ejecutable.",
  // },
];

// ─── LEYES APRENDIDAS (autoaprendibles, persistente) ──────────────────────
//
// Se cargan desde .cerebro-db/leyes-aprendidas.json. Cada ley aprendida tiene
// la misma forma que LEYES_REFLEJO pero con `prioridad >= 100` para no tapar
// a las leyes curadas. El usuario las crea o las desactiva con el endpoint
// /api/espejos/leyes.

let LEYES_APRENDIDAS: LeyReflejo[] = [];

/**
 * Diagnóstico de la última carga de leyes aprendidas. Regla de hierro: si una
 * ley aprendida NO se pudo restaurar, esto lo dice — en v1.0.3 morían en
 * silencio (ver el bug de `datos` como función serializada más abajo).
 */
let DIAGNOSTICO_LEYES: string[] = [];
export function diagnosticoLeyes(): string[] {
  return [...DIAGNOSTICO_LEYES];
}

/**
 * Primitivas de lectura/escritura INYECTADAS. En v1.0.3 el módulo llamaba a
 * `require("node:fs")` dentro de un paquete ESM (`"type": "module"`): require
 * no existe, la excepción se tragaba en el catch y las leyes aprendidas
 * NUNCA se cargaban. La lección es la misma de consejo.ts con `node:os`:
 * el que viaja al bundle no toca disco — el servidor inyecta las primitivas.
 */
export interface PrimitivasFs {
  existsSync(ruta: string): boolean;
  readFileSync(ruta: string, cod: "utf8"): string;
  mkdirSync?(ruta: string, op?: { recursive?: boolean }): void;
  writeFileSync?(ruta: string, contenido: string, cod: "utf8"): void;
}
let FS: PrimitivasFs | undefined;
export function configurarFsOrquestador(fs: PrimitivasFs): void {
  FS = fs;
}

/**
 * Reconstruye la función `datos` de una ley persistida.
 * Orden de respeto: función viva (recarga en caliente) → plantilla serializada
 * → fallback DECLARADO `{ prompt: $input }`. El fallback no es un parche
 * sucio: una ley aprendida sin plantilla solo puede significar "pasa la frase
 * tal cual", y se anota en el diagnóstico para que el usuario la mejore.
 */
function reconstruirDatos(l: any, idLey: string): (m: RegExpMatchArray) => Record<string, unknown> {
  if (typeof l.datos === "function") return l.datos;
  if (l.plantilla && typeof l.plantilla === "object" && !Array.isArray(l.plantilla)) {
    const plantilla = l.plantilla as Record<string, string>;
    return (m: RegExpMatchArray) => {
      const salida: Record<string, unknown> = {};
      for (const [clave, bruto] of Object.entries(plantilla)) {
        const texto = String(bruto ?? "").replace(/\$(\d+)/g, (_, g) => m[Number(g)] ?? "").replace(/\$input/g, m.input ?? "");
        // Si la plantilla era un número, devolvemos número (los espejos aceptan
        // ambos, pero `{ expresion: "5+5" }` como texto y `{ cantidad: 5 }` como
        // número deben conservarse como el autor de la ley quiso).
        const comoNumero = Number(texto);
        salida[clave] = texto !== "" && Number.isFinite(comoNumero) && /^-?\d+(?:\.\d+)?$/.test(texto) ? comoNumero : texto;
      }
      return salida;
    };
  }
  if ((typeof l.datos === "string" && l.datos.trim().startsWith("function")) || (typeof l.datos === "string" && l.datos.trim().startsWith("("))) {
    DIAGNOSTICO_LEYES.push(`ley «${idLey}»: su «datos» era una función serializada (incompatible con reinicio); se reconstruyó como prompt-crudo. Recrea la ley con «plantilla» para datos exactos.`);
  }
  return (m: RegExpMatchArray) => ({ prompt: m.input ?? "" });
}

/** Carga las leyes aprendidas desde un JSON persistido. No lanza: si falla,
 *  arranca con 0 leyes aprendidas PERO deja el motivo en diagnosticoLeyes(). */
export function cargarLeyesAprendidas(ruta: string, fsImpl?: PrimitivasFs): void {
  DIAGNOSTICO_LEYES = [];
  // 🐞 DEFECTO v1.0.3: el cargador devolvía temprano si el archivo no existe
  // SIN limpiar la lista — borrar leyes-aprendidas.json no borraba las leyes
  // de la memoria y la "purga" prometida era decorativa. Se limpia SIEMPRE
  // primero; lo que haya en disco es lo que manda.
  LEYES_APRENDIDAS = [];
  const fsUso = fsImpl || FS;
  if (!fsUso) {
    DIAGNOSTICO_LEYES.push("no hay primitivas fs inyectadas (configurarFsOrquestador): las leyes aprendidas no se cargaron.");
    return;
  }
  try {
    if (!fsUso.existsSync(ruta)) return;
    const raw = JSON.parse(fsUso.readFileSync(ruta, "utf8"));
    if (!Array.isArray(raw?.leyes)) return;
    // Filtra las que tienen los campos mínimos y no están desactivadas
    LEYES_APRENDIDAS = raw.leyes
      .filter((l: any) => l && l.id && l.patron && l.espejo && !l.desactivada)
      .map((l: any) => ({
        id: String(l.id),
        familia: String(l.familia || "autoaprendible"),
        prioridad: 100 + Math.max(0, Number(l.prioridadOffset || 0)),
        // Reconstruye el RegExp desde string (vino serializado)
        patron: typeof l.patron === "string" ? new RegExp(l.patron, l.flags || "i") : l.patron,
        datos: reconstruirDatos(l, String(l.id)),
        plantilla: l.plantilla && typeof l.plantilla === "object" ? l.plantilla : undefined,
        espejo: String(l.espejo),
        descripcion: String(l.descripcion || "(ley aprendida sin descripción)"),
        confianza: Number.isFinite(Number(l.confianza)) ? Math.max(0, Math.min(1, Number(l.confianza))) : 0.6,
        endpoint: l.endpoint ? String(l.endpoint) : undefined,
        endpointModel: l.endpointModel ? String(l.endpointModel) : undefined,
        endpointSystem: l.endpointSystem ? String(l.endpointSystem) : undefined,
      }));
  } catch (e) {
    // Silencioso en runtime — el orquestador NO puede fallar el arranque —
    // pero NUNCA en silencio para quien pregunte: queda el motivo.
    DIAGNOSTICO_LEYES.push(`leyes-aprendidas.json ilegible: ${String((e as any)?.message || e)}`);
    LEYES_APRENDIDAS = [];
  }
}

/** Serializa una ley para disco: sin funciones (no viajan por JSON). */
function serializarLey(l: LeyReflejo): Record<string, unknown> {
  const patronFuente = typeof l.patron === "string" ? l.patron : (l.patron as RegExp).source;
  const flags = typeof l.patron === "string" ? "i" : (l.patron as RegExp).flags;
  return {
    id: l.id,
    familia: l.familia,
    prioridadOffset: Math.max(0, l.prioridad - 100),
    patron: patronFuente,
    flags,
    espejo: l.espejo,
    descripcion: l.descripcion,
    ...(l.confianza !== undefined ? { confianza: l.confianza } : {}),
    ...(l.plantilla ? { plantilla: l.plantilla } : {}),
    ...(l.endpoint ? { endpoint: l.endpoint, endpointModel: l.endpointModel, endpointSystem: l.endpointSystem } : {}),
  };
}

/** Persiste las leyes aprendidas. Llamada desde el endpoint de revisión. */
export function guardarLeyesAprendidas(ruta: string, leyes: LeyReflejo[], fsImpl?: PrimitivasFs): boolean {
  try {
    const fsUso = fsImpl || FS;
    if (!fsUso || !fsUso.writeFileSync || !fsUso.mkdirSync) {
      DIAGNOSTICO_LEYES.push("guardarLeyesAprendidas sin fs inyectado: nada escrito.");
      return false;
    }
    const dir = ruta.replace(/[/\\][^/\\]*$/, "");
    fsUso.mkdirSync(dir, { recursive: true });
    fsUso.writeFileSync(ruta, JSON.stringify({ leyes: leyes.map(serializarLey), en: new Date().toISOString() }, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

export function leyAprendida(): number {
  return LEYES_APRENDIDAS.length;
}

// ─── EL ORQUESTADOR ────────────────────────────────────────────────────────

export interface ResultadoOrquestador {
  ok: boolean;
  /** Espejo a invocar (id `espejo.*`) — siempre presente cuando ok:true. */
  espejo?: string;
  /** Datos a pasar al espejo. */
  datos?: Record<string, unknown>;
  /** id de la ley que aplicó. */
  ley?: string;
  /** Descripción humana de la ley. */
  descripcion?: string;
  /** Modo de despacho:
   *  · "espejo-local" → ejecutar con `ejecutarEntidad(espejo, datos)` (determinista, ~1 ms)
   *  · "ollama-externo" → hacer fetch a `endpoint` con `endpointModel` y `endpointSystem` (Ollama remoto)
   *  · undefined si ok:false
   */
  modo?: "espejo-local" | "ollama-externo";
  /** Solo cuando modo==="ollama-externo": endpoint HTTP a llamar. */
  endpoint?: string;
  /** Solo cuando modo==="ollama-externo": modelo Ollama. */
  endpointModel?: string;
  /** Solo cuando modo==="ollama-externo": system prompt Ollama. */
  endpointSystem?: string;
  /** Tiempo total en ms. */
  ms: number;
  /** Si ok === false, SIEMPRE presente (regla de hierro: nada de silencios). */
  motivo?: string;
  // ─── Reflejo v5 · confianza ────────────────────────────────────────────────
  /** Puntaje 0..1 del enrutado. Con dudas el orquestador NO adivina: dice
   *  cuáles son las alternativas y manda al endpoint explícito de familia. */
  confianza?: number;
  /** Candidatos descartados por el desempate (auditoría del "por qué no"). */
  alternativas?: Array<{ ley: string; espejo: string; confianza: number }>;
}

// ─── Reflejo v5 · salud de espejos integrada al enrutado ────────────────────
//
// El orquestador NO escribe disco: server.ts le pasa la tabla de salud que
// ya persiste en .cerebro-db/espejos-salud.json. Un espejo DORMIDO (score
// acumulado bajo) se salta en el auto-enrutado, pero sigue alcanzable por
// id o por familia explícita — dormir no es matar (manual §6.3).

import { type TablaSalud, estadoDe } from "./salud";
let SALUD: TablaSalud | undefined;
export function fijarTablaSalud(tabla: TablaSalud | undefined): void {
  SALUD = tabla;
}
function espejoDormido(id: string): boolean {
  return !!SALUD && estadoDe(SALUD[id]) === "dormido";
}

/** UMBRAL de confianza: por debajo, el orquestador confiesa dudas en vez de adivinar. */
export const UMBRAL_CONFIANZA = 0.55;
/** Distancia mínima entre el primero y el segundo candidato de espejo DISTINTO.
 *  Menos que esto es un empate: dos leyes tirando cada una a su espejo no es
 *  una decisión, es una moneda — y el orquestador no lanza monedas. */
export const MARGEN_DESEMPATE = 0.08;

/** Confianza de una ley para un match concreto: base declarada o derivada de
 *  la especificidad (extraer números/unidades es más señal que leer una
 *  palabra suelta), con un bonus pequeño si el match cubre la mayor parte de
 *  la frase. Determinista: misma frase, mismo número. */
function confianzaDe(ley: LeyReflejo, m: RegExpMatchArray, frase: string): number {
  let base = ley.confianza;
  if (base === undefined) {
    const extrajoAlgo = (m.slice(1) || []).some((g) => g !== undefined && String(g).trim() !== "");
    base = extrajoAlgo ? 0.85 : 0.7;
    if (ley.prioridad >= 100) base = Math.min(base, 0.75); // aprendida: un poco más prudente
  }
  const cobertura = m[0] ? m[0].length / Math.max(1, frase.length) : 0;
  if (cobertura >= 0.5) base += 0.05;
  return Math.max(0, Math.min(1, Math.round(base * 100) / 100));
}

interface CandidatoLey {
  ley: LeyReflejo;
  m: RegExpMatchArray;
  confianza: number;
}

/** Recoge TODAS las leyes que matchean (no la primera): la decisión se toma
 *  después, con confianza, y las descartadas quedan como auditoría. */
function candidatos(limpia: string, leyes: LeyReflejo[]): { candidatos: CandidatoLey[]; saltadasDormidas: string[] } {
  const out: CandidatoLey[] = [];
  const saltadasDormidas: string[] = [];
  for (const ley of leyes) {
    const f = ley.transformar ? ley.transformar(limpia) : limpia;
    try {
      const m = f.match(ley.patron);
      if (!m) continue;
      if (espejoDormido(ley.espejo)) {
        saltadasDormidas.push(`${ley.espejo} (ley ${ley.id})`);
        continue;
      }
      out.push({ ley, m, confianza: confianzaDe(ley, m, limpia) });
    } catch {
      // Ley rota (patrón o datos defectuosos): se salta SIN tumbar el
      // orquestador, pero deja rastro auditable en el diagnóstico.
      DIAGNOSTICO_LEYES.push(`ley «${ley.id}» reventó al aplicar su patrón/datos: descartada en esta frase.`);
      continue;
    }
  }
  // Estrella primero si empató en confianza (manual §6.3: score ≥ 0.95 sube),
  // luego confianza desc, prioridad asc, id asc (documentado: gana el id menor).
  out.sort((a, b) => {
    const estA = SALUD && estadoDe(SALUD[a.ley.espejo]) === "estrella" ? 1 : 0;
    const estB = SALUD && estadoDe(SALUD[b.ley.espejo]) === "estrella" ? 1 : 0;
    return estB - estA || b.confianza - a.confianza || a.ley.prioridad - b.ley.prioridad || a.ley.id.localeCompare(b.ley.id);
  });
  return { candidatos: out, saltadasDormidas };
}

function resultadoDe(c: CandidatoLey, t0: number, alternativos: CandidatoLey[]): ResultadoOrquestador {
  const { ley, m, confianza } = c;
  const datos = ley.datos(m);
  const modo: "espejo-local" | "ollama-externo" = ley.endpoint ? "ollama-externo" : "espejo-local";
  return {
    ok: true,
    espejo: ley.espejo,
    datos,
    ley: ley.id,
    descripcion: ley.descripcion,
    modo,
    confianza,
    alternativas: alternativos
      .filter((x) => x.ley.id !== ley.id)
      .slice(0, 3)
      .map((x) => ({ ley: x.ley.id, espejo: x.ley.espejo, confianza: x.confianza })),
    ...(modo === "ollama-externo" ? {
      endpoint: ley.endpoint,
      endpointModel: ley.endpointModel,
      endpointSystem: ley.endpointSystem,
    } : {}),
    ms: Date.now() - t0,
  };
}

/**
 * Toma una frase del usuario, prueba TODAS las leyes y decide con confianza:
 * espejo + datos, o `ok:false` con el motivo y las alternativas en juego.
 * Si ninguna ley encaja, el llamador debe caer al modelo.
 *
 * Determinista: misma frase → misma salida. Sin red, sin RAM de modelo,
 * sin azar. Es el "orquestador bien aceitado" del que habla el manual.
 *
 * Reflejo v3.0 · extensión B: si la ley que matchea tiene `endpoint`, el
 * resultado lleva `modo: "ollama-externo"` y `endpoint`/`endpointModel`/
 * `endpointSystem` para que server.ts despache a un Ollama remoto.
 *
 * Reflejo v5 · cero alucinación de enrutamiento (lección del recap, adaptada
 * a una máquina de 8 GB sin clúster): cuando el mejor candidato vale menos
 * que UMBRAL_CONFIANZA, o cuando dos espejos DISTINTOS quedan separados por
 * menos de MARGEN_DESEMPATE, el orquestador NO elige: confiesa la duda,
 * lista las alternativas y manda al endpoint explícito de familia. Un
 * enrutado dudoso corrupto la respuesta especializada; una confesión no.
 */
export function planificadorPorLeyes(frase: string): ResultadoOrquestador {
  const t0 = Date.now();
  const limpia = (frase || "").trim();
  if (!limpia) return { ok: false, ms: 0, motivo: "frase vacía" };

  // Combina leyes curadas + aprendidas, ordena por prioridad asc, id asc.
  const todas = [...LEYES_REFLEJO, ...LEYES_APRENDIDAS].sort(
    (a, b) => a.prioridad - b.prioridad || a.id.localeCompare(b.id)
  );

  const { candidatos: cs, saltadasDormidas } = candidatos(limpia, todas);

  if (cs.length === 0) {
    const porDormidas = saltadasDormidas.length
      ? ` Además, ${saltadasDormidas.length} ley(s) se saltaron por espejo dormido: ${saltadasDormidas.join(", ")} — reavívalo con /api/espejos/salud si fue un malentendido.`
      : "";
    return {
      ok: false,
      ms: Date.now() - t0,
      motivo: `ninguna ley del orquestador encaja con la frase. Las 9 familias se probaron en orden de prioridad. Recurre al modelo o añade una ley nueva (ver ESPEJOS_PERSONALIZADOS.md).${porDormidas}`,
    };
  }

  const mejor = cs[0];
  const segundo = cs.find((c) => c.ley.espejo !== mejor.ley.espejo);

  if (mejor.confianza < UMBRAL_CONFIANZA) {
    return {
      ok: false,
      ms: Date.now() - t0,
      confianza: mejor.confianza,
      alternativas: cs.slice(0, 3).map((c) => ({ ley: c.ley.id, espejo: c.ley.espejo, confianza: c.confianza })),
      motivo:
        `el enrutador tiene dudas: la mejor ley («${mejor.ley.id}» → ${mejor.ley.espejo}) solo alcanza confianza ${mejor.confianza} (umbral ${UMBRAL_CONFIANZA}). ` +
        `No adivina. Fuerza la familia con POST /api/espejos/orquestar/<familia> o pasa la frase al modelo.`,
    };
  }

  if (segundo && mejor.confianza - segundo.confianza < MARGEN_DESEMPATE) {
    return {
      ok: false,
      ms: Date.now() - t0,
      confianza: mejor.confianza,
      alternativas: [mejor, segundo, ...(cs.slice(2, 3))].map((c) => ({ ley: c.ley.id, espejo: c.ley.espejo, confianza: c.confianza })),
      motivo:
        `empate dudoso: «${mejor.ley.id}» (${mejor.ley.espejo}, ${mejor.confianza}) y «${segundo.ley.id}» (${segundo.ley.espejo}, ${segundo.confianza}) tiran de espejos distintos por menos de ${MARGEN_DESEMPATE}. ` +
        `El orquestador no lanza monedas: usa POST /api/espejos/orquestar/<familia> para decidir tú, o reformula la frase.`,
    };
  }

  try {
    return resultadoDe(mejor, t0, cs);
  } catch (e: any) {
    return {
      ok: false,
      ms: Date.now() - t0,
      confianza: mejor.confianza,
      motivo: `la ley «${mejor.ley.id}» matcheó pero sus datos fallaron: ${String(e?.message || e)}`,
    };
  }
}

/** Catálogo de leyes activas, para exponer en /api/espejos/leyes. */
export function estadoOrquestador() {
  const todas = [...LEYES_REFLEJO, ...LEYES_APRENDIDAS];
  return {
    ok: true,
    motor: "orquestador v1.0",
    leyesCuradas: LEYES_REFLEJO.length,
    leyesAprendidas: LEYES_APRENDIDAS.length,
    familias: Array.from(new Set(todas.map((l) => l.familia))),
    // Reflejo v3.0 · extensión A — exponer las familias para que la UI pueda
    // mostrar los endpoints por familia: /api/espejos/orquestar/<familia>
    endpointsPorFamilia: Array.from(new Set(todas.map((l) => l.familia))).map((f) => ({
      familia: f,
      url: `/api/espejos/orquestar/${encodeURIComponent(f)}`,
    })),
    leyes: todas.map((l) => ({
      id: l.id,
      familia: l.familia,
      prioridad: l.prioridad,
      espejo: l.espejo,
      descripcion: l.descripcion,
      // Reflejo v3.0 · extensión B — indicar si esta ley despacha a un Ollama externo
      modo: l.endpoint ? "ollama-externo" : "espejo-local",
      ...(l.endpoint ? { endpoint: l.endpoint, endpointModel: l.endpointModel } : {}),
    })),
    // Reflejo v5: diagnóstico de la última carga de leyes aprendidas (nunca
    // en silencio: si una ley murió al recargar, aquí se lee por qué).
    diagnostico: DIAGNOSTICO_LEYES,
    umbralConfianza: UMBRAL_CONFIANZA,
    nota: "Determinista: misma frase → misma salida. Se prueban todas las leyes y se decide por confianza; en igualdad gana la prioridad menor y luego el id alfabéticamente menor. Con dos espejos distintos casi empatados, el orquestador confiesa la duda en vez de adivinar. Las leyes con `endpoint` despachan a un Ollama externo (extensión B); el resto a espejos locales deterministas.",
  };
}

/**
 * Filtra las leyes por familia. Lo usa el endpoint
 * /api/espejos/orquestar/<familia> para forzar el enrutado a una familia
 * específica (extensión A) — sin que el orquestador tenga que adivinar.
 *
 * Si la familia no existe, devuelve null. Si existe pero la frase no
 * matchea ninguna ley de esa familia, devuelve { ok:false, motivo }.
 */
export function orquestarPorFamilia(
  familia: string,
  frase: string,
): ResultadoOrquestador {
  const t0 = Date.now();
  const limpia = (frase || "").trim();
  if (!limpia) return { ok: false, ms: 0, motivo: "frase vacía" };

  const todas = [...LEYES_REFLEJO, ...LEYES_APRENDIDAS].sort(
    (a, b) => a.prioridad - b.prioridad || a.id.localeCompare(b.id)
  );
  const deLaFamilia = todas.filter((l) => l.familia === familia);
  if (deLaFamilia.length === 0) {
    return {
      ok: false,
      ms: Date.now() - t0,
      motivo: `familia «${familia}» no existe. Familias conocidas: ${Array.from(new Set(todas.map((l) => l.familia))).join(", ")}.`,
    };
  }
  for (const ley of deLaFamilia) {
    const f = ley.transformar ? ley.transformar(limpia) : limpia;
    try {
      const m = f.match(ley.patron);
      if (!m) continue;
      const datos = ley.datos(m);
      const modo: "espejo-local" | "ollama-externo" = ley.endpoint ? "ollama-externo" : "espejo-local";
      return {
        ok: true,
        espejo: ley.espejo,
        datos,
        ley: ley.id,
        descripcion: ley.descripcion,
        modo,
        // En el enrutado EXPLÍCITO por familia la confianza se declara pero no
        // bloquea: el usuario ya decidió. Un espejo dormido tampoco se salta:
        // la ruta explícita siempre alcanza (dormir no es matar).
        confianza: confianzaDe(ley, m, limpia),
        ...(modo === "ollama-externo" ? {
          endpoint: ley.endpoint,
          endpointModel: ley.endpointModel,
          endpointSystem: ley.endpointSystem,
        } : {}),
        ms: Date.now() - t0,
      };
    } catch {
      continue;
    }
  }
  return {
    ok: false,
    ms: Date.now() - t0,
    motivo: `frase no encaja con ninguna ley de la familia «${familia}» (se probaron ${deLaFamilia.length} leyes). Usa /api/espejos/orquestar sin familia para que el orquestador decida solo, o pasa la frase al modelo.`,
  };
}
