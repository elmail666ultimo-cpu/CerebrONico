/**
 * advancedFeatures.ts — LABORATORIO DE CAPACIDADES AVANZADAS (v2.0)
 * =================================================================
 * Regla que gobierna este módulo, dictada por el usuario:
 *
 *   «Lo que sea bueno pero no me beneficie por los 8 GB, déjalo construido para
 *    activar con un botón. Ya tendré más RAM y más procesadores.»
 *
 * Traducción técnica: **nada se recorta por el hardware de hoy**. Todo se
 * construye, se apaga por defecto y se enciende con un interruptor. Nada cuesta
 * mientras está apagado, y el usuario decide cuándo su máquina aguanta.
 *
 * Cada capacidad declara tres cosas honestas:
 *   - `estado`: "listo" (implementada y probada) o "pendiente" (declarada, con el
 *     motivo por el que falta). No se marca como lista nada que no lo esté.
 *   - `requiere`: qué pide de la máquina (RAM, CPU, red). Se calcula contra el
 *     hardware real, así que la interfaz puede decir "esto tu equipo lo aguanta"
 *     o "esto pide más de lo que tienes" sin inventarse nada.
 *   - `impacto`: qué gana el usuario al activarla, en una línea.
 *
 * El estado se persiste en `.cerebro-db/features.json`.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";

export type FeatureId =
  | "cloud_verifier"
  | "multi_brain"
  | "git_memory"
  | "deep_index"
  | "hybrid_rerank"
  | "parallel_workers"
  | "auto_propose";

export interface FeatureRequirement {
  ramGb: number;
  cores: number;
  red?: boolean;
  git?: boolean;
}

export interface FeatureDef {
  id: FeatureId;
  label: string;
  description: string;
  impacto: string;
  requiere: FeatureRequirement;
  porDefecto: boolean;
  estado: "listo" | "pendiente";
  motivoPendiente?: string;
}

/** Catálogo completo. Lo que está "pendiente" lo dice, no se disfraza. */
export const FEATURES: FeatureDef[] = [
  {
    id: "multi_brain",
    label: "Multi-cerebro por dominio",
    description:
      "Sub-cerebros especializados (cerebro_backend.md, cerebro_frontend.md…) que se suman a la ley común cuando la petición toca ese dominio.",
    impacto: "Instrucciones específicas de backend/frontend sin engordar la ley general para todas las tareas.",
    requiere: { ramGb: 0, cores: 0 },
    porDefecto: false,
    estado: "listo",
  },
  {
    id: "git_memory",
    label: "Historial Git de la memoria",
    description:
      "Cada actualización de memoria.md se confirma en un repositorio Git local, con lo que se puede ver la evolución línea por línea y volver a cualquier punto.",
    impacto: "Trazabilidad temporal perfecta de cómo evolucionó el estado del proyecto, además del rollback por copias.",
    requiere: { ramGb: 0, cores: 0, git: true },
    porDefecto: false,
    estado: "listo",
  },
  {
    id: "deep_index",
    label: "Índice profundo del código",
    description:
      "Además de la memoria, se indexa TODO el código del proyecto para que el motor recupere fragmentos exactos por relevancia en vez de leer archivos enteros.",
    impacto: "Con modelos pequeños, la diferencia entre leer 5 archivos y recibir 3 fragmentos pertinentes.",
    requiere: { ramGb: 4, cores: 2, red: true },
    porDefecto: false,
    estado: "listo",
  },
  {
    id: "hybrid_rerank",
    label: "Reordenado híbrido (palabra + vector)",
    description:
      "Combina la búsqueda por palabras clave del motor con la vectorial y reordena el resultado final antes de inyectarlo.",
    impacto: "Recuperación más precisa en memorias grandes, donde solo vectores o solo palabras fallan.",
    requiere: { ramGb: 8, cores: 4 },
    porDefecto: false,
    estado: "pendiente",
    motivoPendiente:
      "Necesita la memoria vectorial activa y una función de fusión calibrada con datos reales. La estructura está prevista (localRAG.search ya devuelve puntuaciones), pero la calibración no se puede inventar: hay que medirla con tu memoria cuando pase de 5.000 líneas.",
  },
  {
    // ── Idea del usuario, y tenía razón ──────────────────────────────
    // Había situado el verificador en la V2.1 (12 GB) porque lo imaginaba como un
    // SEGUNDO MODELO LOCAL. En la nube no consume RAM ni CPU de esta máquina:
    // solo un cliente HTTP (~0,1 MB). Disponible HOY, en 8 GB.
    id: "cloud_verifier",
    label: "Verificador independiente (en la nube)",
    description:
      "Un segundo modelo, a ser posible de OTRO proveedor, revisa la propuesta antes de darla por buena. Primero pasan las comprobaciones del motor (gratis, sin gastar tokens); solo si pasan se consulta al juez.",
    impacto:
      "Atrapa lo que el generador no ve de sí mismo: respuestas incompletas, placeholders, imports inventados. Cuesta ~0 MB de RAM local; lo que cuesta es latencia y cuota del proveedor.",
    requiere: { ramGb: 0, cores: 0, red: true },
    porDefecto: false,
    estado: "listo",
  },
  {
    id: "parallel_workers",
    label: "Trabajadores en paralelo",
    description:
      "Varios procesos del motor ejecutando herramientas y comprobaciones a la vez (leer, buscar, validar) en lugar de una tras otra.",
    impacto: "Tareas largas mucho más rápidas… cuando la máquina tenga núcleos libres.",
    requiere: { ramGb: 16, cores: 8 },
    porDefecto: false,
    estado: "pendiente",
    motivoPendiente:
      "Exige un planificador que reparta trabajo entre procesos y una política de cancelación limpia. Con 8 GB de RAM y 2-4 núcleos, activarlo hoy solo haría las cosas MÁS lentas por contención. Construirlo sin poder medirlo sería adivinar.",
  },
  {
    id: "auto_propose",
    label: "Auto-propuesta de parches al cerebro",
    description:
      "Cuando el motor detecta el MISMO tipo de fallo repetido, redacta solo una propuesta de mejora del cerebro.md (que sigue necesitando tu aprobación).",
    impacto: "El sistema propone su propia evolución en lugar de esperar a que alguien lo note.",
    requiere: { ramGb: 0, cores: 0 },
    porDefecto: false,
    estado: "pendiente",
    motivoPendiente:
      "La detección de propuestas ya existe ([PROPUESTA DE AUTO-MEJORA CEREBRO]); falta el contador de fallos repetidos por patrón y la redacción automática. Requiere que la memoria acumule incidencias reales para poder calibrar el umbral de 'repetido'.",
  },
];

export interface FeatureState {
  id: FeatureId;
  activada: boolean;
  /** El hardware de esta máquina, comparado con lo que pide la capacidad. */
  cabeAqui: boolean;
  hardware: { ramGb: number; cores: number };
}

export class AdvancedFeatures {
  readonly root: string;
  private readonly configPath: string;
  private flags: Record<string, boolean> = {};
  private cargado = false;

  constructor(root: string) {
    this.root = root;
    this.configPath = path.join(root, ".cerebro-db", "features.json");
  }

  private load(): void {
    if (this.cargado) return;
    try {
      if (fs.existsSync(this.configPath)) {
        this.flags = JSON.parse(fs.readFileSync(this.configPath, "utf-8")) || {};
      }
    } catch {
      this.flags = {};
    }
    this.cargado = true;
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.flags, null, 2), "utf-8");
    } catch {}
  }

  /** Hardware real de la máquina, para no prometer lo que no cabe. */
  hardware(): { ramGb: number; cores: number } {
    let ramGb = 0;
    try {
      ramGb = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;
    } catch {}
    let cores = 0;
    try {
      cores = os.cpus()?.length || 0;
    } catch {}
    return { ramGb, cores };
  }

  isOn(id: FeatureId): boolean {
    this.load();
    return this.flags[id] === true;
  }

  setOn(id: FeatureId, valor: boolean): boolean {
    this.load();
    const def = FEATURES.find((f) => f.id === id);
    if (!def) return false;
    this.flags[id] = valor === true;
    this.save();
    // Al activar la memoria Git se prepara el repositorio una sola vez.
    if (id === "git_memory" && valor) this.prepararGit();
    return this.flags[id];
  }

  list(): FeatureState[] {
    this.load();
    const hw = this.hardware();
    return FEATURES.map((f) => ({
      id: f.id,
      activada: this.flags[f.id] === true || (this.flags[f.id] === undefined && f.porDefecto),
      cabeAqui: hw.ramGb >= f.requiere.ramGb && hw.cores >= f.requiere.cores,
      hardware: hw,
    }));
  }

  /** Definiciones + estado, listo para la interfaz. */
  catalog(): Array<FeatureDef & { activada: boolean; cabeAqui: boolean; hardware: { ramGb: number; cores: number } }> {
    const estados = new Map(this.list().map((e) => [e.id, e]));
    return FEATURES.map((f) => {
      const e = estados.get(f.id)!;
      return { ...f, activada: e.activada, cabeAqui: e.cabeAqui, hardware: e.hardware };
    });
  }

  // ------------------------------------------------------------
  // 1) MULTI-CEREBRO: sub-cerebros por dominio
  // ------------------------------------------------------------
  /** Dominios reconocidos y su archivo de ley específica. */
  static DOMINIOS: Array<{ id: string; archivo: string; claves: RegExp }> = [
    {
      id: "backend",
      archivo: "cerebro_backend.md",
      claves: /\b(api|endpoint|servidor|backend|fastapi|express|base de datos|sql|sqlite|postgres|migraci[oó]n|worker|cola)\b/i,
    },
    {
      id: "frontend",
      archivo: "cerebro_frontend.md",
      claves: /\b(react|componente|css|tailwind|interfaz|frontend|html|jsx|tsx|estilo|layout|responsive|dise[nñ]o)\b/i,
    },
  ];

  /**
   * Devuelve el bloque de sub-cerebros aplicable a una petición.
   * Solo actúa si la capacidad está activada Y el archivo existe: así el usuario
   * puede activarla y crear los sub-cerebros cuando quiera.
   */
  buildDomainBlock(peticion: string): string {
    if (!this.isOn("multi_brain")) return "";
    const dominios = AdvancedFeatures.DOMINIOS.filter((d) => d.claves.test(peticion || ""));
    if (dominios.length === 0) return "";
    const partes: string[] = [];
    for (const d of dominios) {
      try {
        const ruta = path.join(this.root, d.archivo);
        if (!fs.existsSync(ruta)) continue;
        const texto = fs.readFileSync(ruta, "utf-8").trim();
        if (texto) partes.push(`--- SUB-CEREBRO (${d.id}) ---\n${texto}`);
      } catch {}
    }
    if (partes.length === 0) return "";
    return `=== LEY ESPECÍFICA DE DOMINIO ===\n${partes.join("\n\n")}\n=== FIN DE LEY ESPECÍFICA ===`;
  }

  /** Crea plantillas de sub-cerebro si no existen (no sobrescribe nunca). */
  ensureDomainTemplates(): string[] {
    const creados: string[] = [];
    const plantilla = (dominio: string) => `# cerebro_${dominio}.md — Ley específica de ${dominio}

> Sub-cerebro del núcleo. Se suma a \`cerebro.md\` SOLO cuando la petición toca
> ${dominio} (capacidad «Multi-cerebro por dominio» activada). Es tuyo: edítalo
> con las reglas de tu proyecto. \`cerebro.md\` manda siempre.

## Reglas específicas de ${dominio}

- (añade aquí tus convenciones: nombres, estructura de carpetas, librerías permitidas)
`;
    for (const d of AdvancedFeatures.DOMINIOS) {
      try {
        const ruta = path.join(this.root, d.archivo);
        if (fs.existsSync(ruta)) continue;
        fs.writeFileSync(ruta, plantilla(d.id), "utf-8");
        creados.push(d.archivo);
      } catch {}
    }
    return creados;
  }

  // ------------------------------------------------------------
  // 2) HISTORIAL GIT DE LA MEMORIA
  // ------------------------------------------------------------
  private git(args: string[]): { ok: boolean; salida: string } {
    try {
      const salida = execFileSync("git", args, {
        cwd: this.root,
        timeout: 8000,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { ok: true, salida: String(salida || "").trim() };
    } catch (err: any) {
      return { ok: false, salida: String(err?.stderr || err?.message || "fallo de git") };
    }
  }

  /** ¿Hay git en esta máquina y en este proyecto? */
  gitDisponible(): { git: boolean; repo: boolean } {
    const v = this.git(["--version"]);
    const r = this.git(["rev-parse", "--is-inside-work-tree"]);
    return { git: v.ok, repo: r.ok && r.salida.includes("true") };
  }

  private prepararGit(): void {
    const { git, repo } = this.gitDisponible();
    if (!git || repo) return;
    this.git(["init", "-q"]);
    try {
      fs.writeFileSync(
        path.join(this.root, ".gitignore"),
        ["node_modules/", "dist/", ".cerebro-db/", "memoria_history/", "*.log", "__pycache__/", ""].join("\n"),
        "utf-8"
      );
    } catch {}
    this.git(["add", "-A"]);
    this.git(["commit", "-q", "-m", "CerebroNico: estado inicial del cerebro y la memoria"]);
  }

  /** Confirma memoria.md (y el cerebro si cambió) tras cada actualización. */
  commitMemoria(motivo = "actualización de estado"): { ok: boolean; detalle: string } {
    if (!this.isOn("git_memory")) return { ok: false, detalle: "capacidad desactivada" };
    const { git, repo } = this.gitDisponible();
    if (!git) return { ok: false, detalle: "git no está instalado en esta máquina" };
    if (!repo) this.prepararGit();
    this.git(["add", "memoria.md", "cerebro.md"]);
    const commit = this.git(["commit", "-q", "-m", `memoria: ${String(motivo).slice(0, 70)}`]);
    if (commit.ok) return { ok: true, detalle: "confirmado en git" };
    return { ok: false, detalle: commit.salida.includes("nothing to commit") ? "sin cambios que confirmar" : commit.salida.slice(0, 160) };
  }

  /** Últimas confirmaciones de la memoria (para mostrar la evolución). */
  logMemoria(n = 15): Array<{ hash: string; fecha: string; mensaje: string }> {
    if (!this.isOn("git_memory")) return [];
    const r = this.git(["log", `-n${Math.max(1, Math.min(50, n))}`, "--pretty=%h|%ad|%s", "--date=short", "--", "memoria.md", "cerebro.md"]);
    if (!r.ok) return [];
    return r.salida
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [hash, fecha, ...resto] = l.split("|");
        return { hash, fecha, mensaje: resto.join("|") };
      });
  }

  /** Vuelve a una confirmación concreta de memoria.md. */
  rollbackGit(hash: string): { ok: boolean; detalle: string } {
    if (!/^[0-9a-f]{7,40}$/i.test(String(hash || ""))) return { ok: false, detalle: "hash inválido" };
    const r = this.git(["checkout", hash, "--", "memoria.md"]);
    return r.ok ? { ok: true, detalle: `memoria.md restaurada al commit ${hash}` } : { ok: false, detalle: r.salida.slice(0, 160) };
  }

  // ------------------------------------------------------------
  // 3) ÍNDICE PROFUNDO DEL CÓDIGO
  // ------------------------------------------------------------
  /**
   * Recorre el proyecto y devuelve las fuentes para indexar (solo si la capacidad
   * está activada). Excluye lo que nunca aporta: dependencias, compilados, logs.
   */
  collectProjectSources(limiteArchivos = 400, limiteBytesArchivo = 200000): Array<{ nombre: string; texto: string }> {
    if (!this.isOn("deep_index")) return [];
    const excluir = new Set([
      "node_modules",
      ".git",
      "dist",
      "dist_electron",
      ".cerebro-db",
      "memoria_history",
      "__pycache__",
      "venv",
      ".proyectos",
      "build",
    ]);
    const extensiones = /\.(ts|tsx|js|jsx|mjs|cjs|py|css|scss|html|json|md)$/i;
    const fuentes: Array<{ nombre: string; texto: string }> = [];
    const recorrer = (dir: string, rel: string, prof: number) => {
      if (prof > 6 || fuentes.length >= limiteArchivos) return;
      let entradas: string[] = [];
      try {
        entradas = fs.readdirSync(dir);
      } catch {
        return;
      }
      for (const e of entradas) {
        if (fuentes.length >= limiteArchivos) return;
        if (excluir.has(e)) continue;
        const abs = path.join(dir, e);
        const relPath = rel ? `${rel}/${e}` : e;
        let st: fs.Stats;
        try {
          st = fs.statSync(abs);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          recorrer(abs, relPath, prof + 1);
          continue;
        }
        if (!extensiones.test(e) || st.size > limiteBytesArchivo) continue;
        try {
          fuentes.push({ nombre: relPath, texto: fs.readFileSync(abs, "utf-8") });
        } catch {}
      }
    };
    recorrer(this.root, "", 0);
    return fuentes;
  }
}
