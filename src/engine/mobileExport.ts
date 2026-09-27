/**
 * mobileExport.ts — EXPORTAR LA APP CREADA A ANDROID (v2.2)
 * =========================================================
 * Ojo con qué es esto y qué no es:
 *
 *   NO es «CerebroNico IDE en Android». El motor vive en el PC.
 *   SÍ es: **la aplicación que tú construyes con CerebroNico se puede sacar
 *   como APK para Android**, igual que hoy se saca como EXE para Windows.
 *
 * CerebroNico es la herramienta; el APK es del proyecto del usuario.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL SUELO DE ANDROID, Y POR QUÉ NO SE PUEDE PROMETER 4.4.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Datos de la documentación oficial de Capacitor (v8), consultada el 18-sep-2026:
 *
 *   · Requisitos Android: Android Studio + Android SDK, y hay que instalar
 *     «Android SDK Platforms for API 24 or greater».
 *   · La tabla oficial de target SDK: 8.x → 36 · 7.x → 35 · 6.x → 34 · 5.x → 33.
 *   · Google Play exige, desde el 31-ago-2026, apuntar a Android 16 (API 36).
 *
 * Traducido: **el suelo realista es API 24 = Android 7 (Nougat)**.
 *
 *   Android 4.4.2 = API 19  → por debajo del suelo
 *   Android 6.0   = API 23  → por debajo del suelo
 *   Android 7.0   = API 24  → el mínimo real
 *
 * Y no es sólo una regla de la herramienta: la app que construye este IDE sale
 * con JavaScript moderno (React + Vite). El WebView de Android 4.4.2 es de la
 * época de Chromium 30-33 y no ejecuta ese bundle. Prometerlo sería prometer algo
 * que el propio código del usuario no puede cumplir.
 *
 * Si algún día hace falta bajar de API 24 habría que: usar versiones antiguas del
 * empaquetador, compilar el front a un objetivo antiguo y renunciar a parte de las
 * librerías. Es una decisión con coste, no un parámetro.
 *
 * Este módulo es LÓGICA PURA: todo lo del sistema entra por parámetros (sondas),
 * así que se puede probar sin tener Android Studio instalado.
 */

export type TipoProyecto = "web-moderno" | "web-estatico" | "node" | "python" | "desconocido";

export interface EntradasProyecto {
  /** Contenido de package.json, o null si no hay. */
  packageJson?: string | null;
  /** Nombres de los ficheros de la raíz del proyecto. */
  archivosRaiz: string[];
}

export interface ProyectoDetectado {
  tipo: TipoProyecto;
  nombre: string;
  version: string;
  /** Comando para generar la carpeta que se empaqueta. */
  comandoBuild: string | null;
  /** Carpeta que el WebView cargará dentro del APK. */
  carpetaSalida: string;
  /** ¿Se puede sacar un APK de esto sin reescribirlo? */
  exportableAAndroid: boolean;
  razon: string;
}

export interface SondaHerramientas {
  nodeVersion?: string;
  javaVersion?: string;
  androidHome?: string;
  plataformasSdk?: string[];
  tieneGradle?: boolean;
  tieneAdb?: boolean;
}

export interface Requisito {
  id: string;
  nombre: string;
  ok: boolean;
  encontrado: string;
  obligatorio: boolean;
  comoResolver: string;
}

export interface PasoExportacion {
  orden: number;
  titulo: string;
  comando: string;
  queHace: string;
}

export interface VeredictoAndroid {
  puedeConstruir: boolean;
  requisitos: Requisito[];
  faltan: string[];
  piso: { api: number; version: string; fuente: string; nota: string };
  pasos: PasoExportacion[];
}

/** El mínimo real, con la fuente para que nadie tenga que creérselo. */
export const PISO_ANDROID = {
  api: 24,
  version: "Android 7.0 (Nougat)",
  fuente: "Capacitor docs (v8) — «install Android SDK Platforms for API 24 or greater»",
  nota:
    "Android 4.4.2 es API 19 y Android 6 es API 23: los dos quedan por debajo. Además el bundle que genera " +
    "este IDE es JavaScript moderno (React + Vite) y el WebView de 4.4.2 no lo ejecuta.",
};

/** Versión de Android a partir de un nivel de API. Sólo las que importan aquí. */
export function androidDesdeApi(api: number): string {
  const tabla: Record<number, string> = {
    19: "Android 4.4 (KitKat)",
    21: "Android 5.0 (Lollipop)",
    22: "Android 5.1",
    23: "Android 6.0 (Marshmallow)",
    24: "Android 7.0 (Nougat)",
    26: "Android 8.0 (Oreo)",
    29: "Android 10",
    33: "Android 13",
    34: "Android 14",
    35: "Android 15",
    36: "Android 16",
  };
  return tabla[api] || `API ${api}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ¿Qué es este proyecto y se puede sacar a Android?
// ─────────────────────────────────────────────────────────────────────────────

export function analizarProyecto(e: EntradasProyecto): ProyectoDetectado {
  const base: ProyectoDetectado = {
    tipo: "desconocido",
    nombre: "app",
    version: "1.0.0",
    comandoBuild: null,
    carpetaSalida: "dist",
    exportableAAndroid: false,
    razon: "",
  };

  if (!e.packageJson) {
    const hayPython = e.archivosRaiz.some((f) => f.endsWith(".py"));
    return {
      ...base,
      tipo: hayPython ? "python" : "desconocido",
      razon: hayPython
        ? "El proyecto es de Python, no una web: un APK envuelve una página web, así que esto no se puede empaquetar sin reescribir la interfaz."
        : "No hay package.json ni una app web reconocible: no hay nada que envolver en un APK.",
    };
  }

  let pkg: any;
  try {
    pkg = JSON.parse(e.packageJson);
  } catch {
    return { ...base, razon: "El package.json no es JSON válido: no se puede analizar el proyecto." };
  }

  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const scripts = pkg.scripts || {};
  const nombre = String(pkg.name || "app").replace(/[^a-zA-Z0-9.-]/g, "-");
  const version = String(pkg.version || "1.0.0");

  const tieneVite = !!deps.vite || !!scripts.dev?.includes("vite");
  const tieneReact = !!deps.react;
  const tieneBuild = !!scripts.build;

  // La carpeta que se empaqueta: lo habitual es dist, pero se respeta lo declarado.
  let salida = "dist";
  if (typeof pkg.build?.outDir === "string") salida = pkg.build.outDir;
  else if (typeof pkg.capacitor?.webDir === "string") salida = pkg.capacitor.webDir;

  if (!tieneBuild) {
    return {
      ...base,
      tipo: tieneVite ? "web-moderno" : "node",
      nombre,
      version,
      razon: "El package.json no tiene un script «build»: no hay forma de generar la carpeta que se empaqueta.",
    };
  }

  const esWeb = tieneVite || tieneReact || e.archivosRaiz.includes("index.html");
  return {
    tipo: esWeb ? (tieneVite ? "web-moderno" : "web-estatico") : "node",
    nombre,
    version,
    comandoBuild: "npm run build",
    carpetaSalida: salida,
    exportableAAndroid: esWeb,
    razon: esWeb
      ? `App web con build propio. Se empaqueta la carpeta «${salida}» dentro del APK.`
      : "Es un proyecto de Node sin interfaz web: un APK envuelve una web, así que no aplica sin una capa de interfaz.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ¿Está la máquina preparada?
// ─────────────────────────────────────────────────────────────────────────────

/** Android Studio instala su propio JDK; el mínimo cómodo hoy es Java 17. */
function javaSuficiente(v?: string): boolean {
  if (!v) return false;
  const m = v.match(/(\d+)(?:\.(\d+))?/);
  if (!m) return false;
  const mayor = Number(m[1]);
  if (mayor >= 17) return true;
  // Formatos antiguos: "1.8.0_392" → 8
  return mayor === 1 && Number(m[2]) >= 17;
}

export function evaluarHerramientas(s: SondaHerramientas): Requisito[] {
  const nodeMayor = Number((s.nodeVersion || "").replace(/^v/, "").split(".")[0] || 0);
  const plataformas = s.plataformasSdk || [];
  const tienenApi24 = plataformas.some((p) => {
    const n = Number((p.match(/(\d{2,3})/) || [])[1] || 0);
    return n >= PISO_ANDROID.api;
  });

  return [
    {
      id: "node",
      nombre: "Node.js 22 o superior",
      ok: nodeMayor >= 22,
      encontrado: s.nodeVersion ? `v${String(s.nodeVersion).replace(/^v/, "")}` : "no encontrado",
      obligatorio: true,
      comoResolver: "Instala Node 22+ desde nodejs.org. Este IDE ya trae uno: comprueba `node -v`.",
    },
    {
      id: "android-studio-sdk",
      nombre: "Android SDK (lo instala Android Studio)",
      ok: !!s.androidHome,
      encontrado: s.androidHome || "ANDROID_HOME / ANDROID_SDK_ROOT sin definir",
      obligatorio: true,
      comoResolver:
        "Instala Android Studio (developer.android.com/studio). Trae el JDK y el SDK; después define ANDROID_HOME apuntando a la carpeta del SDK.",
    },
    {
      id: "java",
      nombre: "JDK 17 o superior",
      ok: javaSuficiente(s.javaVersion),
      encontrado: s.javaVersion || "no encontrado",
      obligatorio: true,
      comoResolver: "Android Studio instala su propio JDK. Si falta, usa el JDK que trae: File → Settings → Build → Gradle → Gradle JDK.",
    },
    {
      id: "plataforma",
      nombre: `Plataforma SDK de API ${PISO_ANDROID.api} o superior`,
      ok: tienenApi24,
      encontrado: plataformas.length ? plataformas.join(", ") : "ninguna detectada",
      obligatorio: true,
      comoResolver: `En Android Studio: Tools → SDK Manager → SDK Platforms, e instala API ${PISO_ANDROID.api} o superior (marca al menos una).`,
    },
    {
      id: "gradle",
      nombre: "Gradle (lo descarga el propio proyecto Android)",
      ok: !!s.tieneGradle,
      encontrado: s.tieneGradle ? "disponible" : "se descargará al primer build",
      obligatorio: false,
      comoResolver: "No hace falta instalarlo a mano: el wrapper del proyecto Android lo baja la primera vez. Necesita conexión.",
    },
    {
      id: "adb",
      nombre: "adb (sólo para probar en un móvil conectado)",
      ok: !!s.tieneAdb,
      encontrado: s.tieneAdb ? "disponible" : "no encontrado",
      obligatorio: false,
      comoResolver: "Viene dentro del SDK, en platform-tools. Sólo hace falta para instalar el APK por cable.",
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. El plan: pasos exactos
// ─────────────────────────────────────────────────────────────────────────────

export function pasosDeExportacion(p: ProyectoDetectado): PasoExportacion[] {
  return [
    { orden: 1, titulo: "Añadir Capacitor al proyecto", comando: "npm install @capacitor/core @capacitor/cli @capacitor/android", queHace: "Instala el envoltorio que mete una web dentro de una app Android." },
    { orden: 2, titulo: "Declarar la app", comando: "npx cap init", queHace: `Crea capacitor.config.json con el nombre y la carpeta web («${p.carpetaSalida}»). Este paso lo prepara el IDE por ti.` },
    { orden: 3, titulo: "Compilar la web", comando: p.comandoBuild || "npm run build", queHace: `Genera la carpeta «${p.carpetaSalida}» que irá dentro del APK. Sin esto, el APK se hace con la versión anterior.` },
    { orden: 4, titulo: "Crear el proyecto Android", comando: "npx cap add android", queHace: "Genera la carpeta android/ con Gradle y el manifiesto. Aquí es donde se necesita el SDK." },
    { orden: 5, titulo: "Copiar la web dentro", comando: "npx cap sync android", queHace: "Pasa la carpeta compilada al proyecto Android. Hay que repetirlo tras cada cambio de la web." },
    { orden: 6, titulo: "Generar el APK", comando: "cd android && gradlew.bat assembleDebug", queHace: "Deja el APK en android/app/build/outputs/apk/debug/. Para publicar: assembleRelease y firmarlo." },
  ];
}

export function veredictoAndroid(p: ProyectoDetectado, s: SondaHerramientas): VeredictoAndroid {
  const requisitos = evaluarHerramientas(s);
  const faltan = requisitos.filter((r) => r.obligatorio && !r.ok).map((r) => r.nombre);
  return {
    puedeConstruir: p.exportableAAndroid && faltan.length === 0,
    requisitos,
    faltan: p.exportableAAndroid ? faltan : [p.razon, ...faltan],
    piso: PISO_ANDROID,
    pasos: pasosDeExportacion(p),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. El archivo de configuración que el IDE prepara por ti
// ─────────────────────────────────────────────────────────────────────────────

/** Un appId de Android es un dominio al revés: minúsculas, números y puntos. */
export function appIdValido(id: string): boolean {
  return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test((id || "").trim());
}

/** Propone un appId a partir del nombre del proyecto (nunca inventa mayúsculas). */
export function appIdDesdeNombre(nombre: string, dominio = "cerebronico.app"): string {
  const limpio = (nombre || "app")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 30);
  const base = limpio || "app";
  return `${dominio}.${/^\d/.test(base) ? `app${base}` : base}`;
}

export function configCapacitor(o: { appId: string; nombreApp: string; webDir: string }): string {
  return JSON.stringify(
    {
      appId: o.appId,
      appName: o.nombreApp,
      webDir: o.webDir,
      // Se deja escrito el porqué, para que nadie lo "simplifique" sin saber.
      server: { androidScheme: "https" },
    },
    null,
    2
  );
}
