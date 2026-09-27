/**
 * plantillasProyecto.ts — EL ESPEJO DEL PROYECTO (v8.0.7)
 * ========================================================
 * Petición que originó este archivo, literal:
 *
 *   «Existe algo que no lo deja crear código correcto, siempre se olvida de los
 *    archivos de un proyecto. Haz una plantilla en el motor de procesos de
 *    proyecto e impleméntale su proceso para que lo tenga como espejo.»
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DIAGNÓSTICO: EL DEFECTO NO ES DE SINTAXIS, ES DE MEMORIA DE CONJUNTO
 * ─────────────────────────────────────────────────────────────────────────────
 * «Se olvida de los archivos» no describe un error de escritura. El modelo
 * escribe bien las líneas que escribe: lo que pasa es que **no sabe cuántos
 * archivos tiene un proyecto de ese tipo**, así que escribe los dos que tiene en
 * la cabeza en ese momento y da el trabajo por terminado. El resultado es un
 * `index.html` que llama a `styles.css`… y `styles.css` no existe. O un
 * `package.json` sin `tsconfig.json`. O un Vite sin `index.html`.
 *
 * Eso explica el otro síntoma que reportaste antes —«el previsualizador quedó
 * blanco»— mejor que ninguna otra hipótesis: una web de tres archivos con sólo
 * el primero escrito se ve, literalmente, en blanco.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN ESPEJO Y NO UNA LISTA EN EL PROMPT
 * ─────────────────────────────────────────────────────────────────────────────
 * Una lista pegada en el prompt se lee una vez y se diluye entre las otras mil
 * instrucciones. Un ESPEJO es comparable: se coteja contra lo que hay y produce
 * una respuesta binaria —falta / no falta—, que es justo lo que un modelo
 * pequeño sabe hacer bien. La diferencia práctica es la que hay entre decirle
 * «acuérdate de los archivos» y enseñarle «te faltan estos dos, y aquí están».
 *
 * «Obligatorio» aquí significa: **sin este archivo el proyecto no arranca o no
 * se ve**. No es «recomendado» disfrazado. Un `README.md` no es obligatorio y
 * no lo voy a llamar así: si todo es obligatorio, nada lo es.
 *
 * Módulo puro: entra una lista de rutas, sale un dictamen. Sin disco, sin red.
 */

export interface ArchivoEspejo {
  /** Ruta canónica, relativa a la raíz del proyecto. */
  ruta: string;
  /** Para qué sirve, en una frase. */
  rol: string;
  /** true = sin él el proyecto no levanta o no se ve. */
  obligatorio: boolean;
}

export interface PlantillaProyecto {
  id: string;
  nombre: string;
  /** Cómo se reconoce este tipo de proyecto en disco. */
  marcadores: string[];
  /** Lo que el proyecto DEBE tener. Éste es el espejo. */
  archivos: ArchivoEspejo[];
  /** Comandos canónicos. `null` = no aplica. */
  instalar: string | null;
  arrancar: string;
  puerto: number | null;
  /** Aviso de honestidad sobre límites de la plantilla. */
  nota?: string;
}

/**
 * LAS PLANTILLAS. Cinco tipos cubren lo que de verdad se hace aquí: una web sin
 * herramientas, una web con Vite+React, un servidor Node, una API FastAPI y un
 * script suelto. No hay más a propósito: cada plantilla de más es una que hay
 * que mantener y que puede estar mintiendo.
 */
export const PLANTILLAS: PlantillaProyecto[] = [
  {
    id: "web-estatica",
    nombre: "Web estática (sin herramientas)",
    // Se reconoce por index.html y la AUSENCIA de package.json.
    marcadores: ["index.html"],
    archivos: [
      { ruta: "index.html", rol: "La página. Sin esto no hay nada que ver.", obligatorio: true },
      { ruta: "styles.css", rol: "Los estilos que index.html enlaza. Si lo llamas desde el HTML, tiene que existir.", obligatorio: true },
      { ruta: "script.js", rol: "El comportamiento que index.html enlaza. Mismo caso que el CSS.", obligatorio: true },
      // El error clásico, y la razón de que este campo exista: enlazar un
      // archivo que nunca se crea. El espejo lo dice explícitamente.
      { ruta: "favicon.ico", rol: "Icono de la pestaña. Opcional, pero si lo enlazas tiene que existir.", obligatorio: false },
    ],
    instalar: null,
    arrancar: "", // No arranca nada: el sandbox lo sirve tal cual.
    puerto: 3500,
    nota: "No necesita npm. El sandbox la sirve directamente en :3500.",
  },
  {
    id: "vite-react",
    nombre: "Vite + React + TypeScript",
    marcadores: ["package.json", "vite.config.ts", "src/main.tsx"],
    archivos: [
      { ruta: "package.json", rol: "Manifiesto con dependencias y scripts.", obligatorio: true },
      { ruta: "vite.config.ts", rol: "Configuración de Vite.", obligatorio: true },
      { ruta: "tsconfig.json", rol: "Configuración de TypeScript. Sin él, los .tsx no compilan con tipos.", obligatorio: true },
      { ruta: "index.html", rol: "Punto de entrada que Vite necesita. Es el archivo que más se olvida en proyectos Vite.", obligatorio: true },
      { ruta: "src/main.tsx", rol: "Monta React en el DOM.", obligatorio: true },
      { ruta: "src/App.tsx", rol: "Componente raíz.", obligatorio: true },
      { ruta: "src/index.css", rol: "Estilos globales, normalmente importados desde main.tsx.", obligatorio: false },
      { ruta: ".gitignore", rol: "Evita que node_modules y dist entren en el control de versiones.", obligatorio: false },
      { ruta: "README.md", rol: "Cómo se arranca el proyecto.", obligatorio: false },
    ],
    instalar: "npm install",
    arrancar: "npm run dev",
    puerto: 3500,
    nota: "Vite sirve en 5173 por defecto. El sandbox espera 3500: hay que fijarlo en vite.config.ts.",
  },
  {
    id: "node-express",
    nombre: "Servidor Node (Express o http)",
    marcadores: ["package.json"],
    archivos: [
      { ruta: "package.json", rol: "Manifiesto. El script `start` es lo que ejecuta el sandbox.", obligatorio: true },
      { ruta: "server.js", rol: "El servidor. Debe escuchar en el puerto del sandbox (3500).", obligatorio: true },
      { ruta: ".gitignore", rol: "Sin él, node_modules acaba en el control de versiones.", obligatorio: false },
      { ruta: "README.md", rol: "Qué hace y cómo se arranca.", obligatorio: false },
    ],
    instalar: "npm install",
    arrancar: "npm start",
    puerto: 3500,
    nota: "El puerto NO puede venir de una variable de entorno que nadie define: si process.env.PORT no existe, debe caer a 3500.",
  },
  {
    id: "fastapi",
    nombre: "API FastAPI (Python)",
    marcadores: ["requirements.txt", "app/main.py"],
    archivos: [
      { ruta: "requirements.txt", rol: "Dependencias. Sin él, uvicorn y fastapi no se instalan.", obligatorio: true },
      { ruta: "app/main.py", rol: "La aplicación ASGI (`app = FastAPI()`). Uvicorn apunta aquí.", obligatorio: true },
      { ruta: "app/__init__.py", rol: "Convierte `app/` en un paquete importable. Es el archivo que más se olvida en Python.", obligatorio: true },
      { ruta: ".gitignore", rol: "Evita subir __pycache__ y el entorno virtual.", obligatorio: false },
      { ruta: "README.md", rol: "Cómo se arranca.", obligatorio: false },
    ],
    instalar: "pip install -r requirements.txt",
    arrancar: "uvicorn app.main:app --port 3500",
    puerto: 3500,
    nota: "Sin `app/__init__.py`, `uvicorn app.main:app` falla con «No module named app» en algunos entornos.",
  },
  {
    id: "script-suelto",
    nombre: "Script suelto",
    // OJO CON LA SEMÁNTICA DE `marcadores`: es «TODOS presentes», no «alguno».
    // Aquí estaban los tres (`index.js`, `main.py`, `app.js`) y por eso NINGÚN
    // script suelto se reconocía nunca: habría hecho falta tener los tres a la
    // vez. Lo cazó la prueba «un script suelto se reconoce». Se deja uno solo, y
    // la limitación se declara en vez de disimularse: un `main.py` suelto no se
    // detecta como script, y en ese caso `compararConEspejo` no inventa nada —
    // devuelve «decide primero qué tipo de proyecto es».
    marcadores: ["index.js"],
    archivos: [
      { ruta: "index.js", rol: "El script. Debe poder ejecutarse solo, sin instalar nada.", obligatorio: true },
      { ruta: "README.md", rol: "Qué hace y cómo se ejecuta.", obligatorio: false },
    ],
    instalar: null,
    arrancar: "node index.js",
    puerto: null,
    nota: "Un script sin package.json sólo sirve con módulos de la biblioteca estándar. Si necesitas dependencias, convierte el proyecto en `node-express`.",
  },
];

export interface Faltante {
  ruta: string;
  rol: string;
}

export interface ComparacionEspejo {
  plantilla: PlantillaProyecto | null;
  /** Archivos del espejo que NO están en el proyecto. */
  faltan: Faltante[];
  /** Faltantes que además son obligatorios: el proyecto está roto sin ellos. */
  faltanObligatorios: Faltante[];
  /** Rutas del proyecto que el espejo no contempla (no es un error por sí solo). */
  fueraDelEspejo: string[];
  /** true cuando no falta ningún obligatorio. */
  completo: boolean;
  /** Texto listo para inyectar en el prompt del modelo. */
  espejoParaPrompt: string;
}

function normalizar(ruta: string): string {
  return String(ruta || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .trim();
}

/** ¿Esta ruta está en el proyecto? Compara por ruta completa y por nombre suelto. */
function existe(rutaEspejo: string, normalizadas: string[]): boolean {
  const objetivo = normalizar(rutaEspejo).toLowerCase();
  if (normalizadas.includes(objetivo)) return true;
  // También se da por presente si el archivo está en la raíz sin la carpeta (o al
  // revés). El sync aplana rutas, y sería absurdo declarar «falta src/App.tsx»
  // cuando el proyecto tiene `App.tsx`.
  const base = objetivo.split("/").pop() || objetivo;
  return normalizadas.some((n) => (n.split("/").pop() || n) === base);
}

/**
 * Detecta qué plantilla describe mejor un conjunto de rutas.
 *
 * Gana la plantilla cuyos marcadores estén TODOS presentes, y entre las que
 * empaten, la que tenga la lista de archivos más larga. Ese desempate no es
 * capricho: un proyecto Vite contiene un `package.json`, así que también encaja
 * en `node-express`; la correcta es la más específica, y aquí «más específica»
 * se mide con lo único que hay —cuántos archivos sabe nombrar.
 */
export function detectarPlantilla(rutas: string[]): PlantillaProyecto | null {
  const norm = (rutas || []).map(normalizar).filter(Boolean);
  if (norm.length === 0) return null;
  const bajas = norm.map((r) => r.toLowerCase());

  const candidatas = PLANTILLAS.filter((p) =>
    p.marcadores.every((m) => existe(m, bajas))
  );
  if (candidatas.length === 0) return null;

  return candidatas.sort((a, b) => b.archivos.length - a.archivos.length)[0];
}

/** Compara el proyecto contra el espejo. Ésta es la operación que faltaba. */
export function compararConEspejo(rutas: string[], plantillaId?: string): ComparacionEspejo {
  const norm = (rutas || []).map(normalizar).filter(Boolean).map((r) => r.toLowerCase());
  const plantilla = plantillaId
    ? PLANTILLAS.find((p) => p.id === plantillaId) || null
    : detectarPlantilla(norm);

  if (!plantilla) {
    return {
      plantilla: null,
      faltan: [],
      faltanObligatorios: [],
      fueraDelEspejo: norm,
      completo: false,
      espejoParaPrompt:
        "No se ha reconocido el tipo de proyecto con estos archivos. Antes de escribir más código, decide QUÉ proyecto es " +
        "(web estática, Vite+React, servidor Node, API FastAPI o script suelto) y escribe el conjunto completo de archivos que ese tipo necesita.",
    };
  }

  const faltan: Faltante[] = plantilla.archivos
    .filter((a) => !existe(a.ruta, norm))
    .map((a) => ({ ruta: a.ruta, rol: a.rol }));

  const faltanObligatorios = faltan.filter((f) =>
    plantilla.archivos.some((a) => normalizar(a.ruta) === f.ruta && a.obligatorio)
  );

  const fueraDelEspejo = norm.filter((r) => !plantilla.archivos.some((a) => existe(a.ruta, [r])));

  const lineas: string[] = [];
  lineas.push(`ESPEJO DEL PROYECTO — tipo detectado: ${plantilla.nombre}`);
  lineas.push(`Comandos: ${plantilla.instalar ? "instalar: " + plantilla.instalar + " · " : ""}arrancar: ${plantilla.arrancar || "(no aplica)"}${plantilla.puerto ? " · puerto " + plantilla.puerto : ""}`);
  lineas.push("Archivos que este tipo de proyecto necesita:");
  for (const a of plantilla.archivos) {
    const presente = existe(a.ruta, norm);
    lineas.push(`  ${presente ? "[x]" : "[ ]"} ${a.ruta}${a.obligatorio ? " (obligatorio)" : " (opcional)"} — ${a.rol}`);
  }
  if (faltanObligatorios.length > 0) {
    lineas.push(
      `FALTAN ${faltanObligatorios.length} ARCHIVO(S) OBLIGATORIO(S): ${faltanObligatorios.map((f) => f.ruta).join(", ")}. ` +
        "El proyecto no arranca o no se ve hasta que existan. Escríbelos en el mismo turno, no los anuncies y los dejes para después."
    );
  } else {
    lineas.push("No falta ningún archivo obligatorio. Si vas a enlazar un archivo nuevo desde el código, créalo en el mismo turno.");
  }
  if (plantilla.nota) lineas.push(`Límite conocido de esta plantilla: ${plantilla.nota}`);

  return {
    plantilla,
    faltan,
    faltanObligatorios,
    fueraDelEspejo,
    completo: faltanObligatorios.length === 0,
    espejoParaPrompt: lineas.join("\n"),
  };
}

/**
 * La pregunta que el modelo debe hacer cuando el espejo detecta huecos.
 * `null` cuando no hay nada que preguntar: un proyecto completo no necesita
 * conversación, necesita que le dejen en paz.
 */
export function preguntaDeFaltantes(cmp: ComparacionEspejo): string | null {
  if (!cmp.plantilla || cmp.faltanObligatorios.length === 0) return null;
  const lista = cmp.faltanObligatorios.map((f) => `  · ${f.ruta} — ${f.rol}`).join("\n");
  return (
    `El proyecto es de tipo «${cmp.plantilla.nombre}» y le faltan ${cmp.faltanObligatorios.length} archivo(s) sin los cuales no arranca:\n${lista}\n` +
    "¿Los creo ahora con el contenido mínimo que funcione, o prefieres escribirlos tú?"
  );
}
