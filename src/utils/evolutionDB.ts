/**
 * CerebroNico V0.9 — Base de Datos de Automejora Persistente
 * ============================================================
 * Registra patrones de error + soluciones aplicadas + índice de éxito.
 * En cada arranque, el motor consulta esta base para inyectar al System Prompt
 * las soluciones históricas más efectivas, permitiendo que el IDE "aprenda"
 * de sus propios tropiezos.
 *
 * Almacenamiento: archivo JSON en el sandbox (.proyectos/memory_evolution.json)
 * vía /api/fs/write + /api/fs/read. Fallback a localStorage si falla.
 */

export interface EvolutionEntry {
  id: string;
  createdAt: number;
  symptom: string;          // Patrón del error (ej: "OOM al cargar .cn masivo")
  rootCause?: string;        // Análisis de causa raíz (opcional)
  solutionApplied: string;   // Diff/patch del código que resolvió el problema
  affectedFile?: string;     // Archivo que se parcheó
  successScore: number;      // 0-100, basado en si el error volvió a ocurrir
  lastVerifiedAt?: number;   // Última vez que se comprobó que el error no volvió
  occurrences: number;       // Cuántas veces se ha visto este síntoma
}

const LS_KEY = "cerebronico_evolution_db";
const FS_PATH = "memory_evolution.json";

/** Lee la base de datos (primero del sandbox, fallback localStorage). */
export async function readEvolutionDB(): Promise<EvolutionEntry[]> {
  // 1. Intentar leer del sandbox (persistente entre sesiones)
  try {
    const res = await fetch(`/api/fs/read?path=${encodeURIComponent(FS_PATH)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.content)) {
        return data.content as EvolutionEntry[];
      }
      // El content puede venir como string (JSON dentro de JSON)
      if (typeof data?.content === "string") {
        const parsed = JSON.parse(data.content);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {}
  // 2. Fallback: localStorage
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

/** Guarda la base de datos (sandbox + localStorage como backup). */
export async function writeEvolutionDB(entries: EvolutionEntry[]): Promise<void> {
  // 1. Guardar en sandbox (persistente)
  try {
    await fetch("/api/fs/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: FS_PATH, content: JSON.stringify(entries, null, 2) }),
    });
  } catch {}
  // 2. Backup en localStorage (por si el sandbox no está disponible)
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch {}
}

/** Registra un nuevo patrón de error o actualiza uno existente si el síntoma coincide. */
export async function recordEvolution(
  symptom: string,
  solutionApplied: string,
  options: {
    rootCause?: string;
    affectedFile?: string;
    successScore?: number;
  } = {}
): Promise<EvolutionEntry> {
  const db = await readEvolutionDB();
  // Buscar si ya existe una entrada con el mismo síntoma (coincidencia parcial)
  const existing = db.find((e) => e.symptom.toLowerCase() === symptom.toLowerCase());
  if (existing) {
    existing.occurrences = (existing.occurrences || 1) + 1;
    existing.lastVerifiedAt = Date.now();
    if (options.rootCause) existing.rootCause = options.rootCause;
    if (options.affectedFile) existing.affectedFile = options.affectedFile;
    if (typeof options.successScore === "number") {
      existing.successScore = Math.max(existing.successScore, options.successScore);
    }
    await writeEvolutionDB(db);
    return existing;
  }
  // Crear entrada nueva
  const entry: EvolutionEntry = {
    id: `evo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    symptom,
    rootCause: options.rootCause,
    solutionApplied,
    affectedFile: options.affectedFile,
    successScore: options.successScore ?? 50,
    lastVerifiedAt: Date.now(),
    occurrences: 1,
  };
  db.unshift(entry);
  // Limitar a 100 entradas
  if (db.length > 100) db.splice(100);
  await writeEvolutionDB(db);
  return entry;
}

/** Genera un texto resumen de las soluciones históricas más efectivas para inyectar al System Prompt. */
export async function buildEvolutionContextForPrompt(topN: number = 5): Promise<string> {
  const db = await readEvolutionDB();
  if (db.length === 0) return "";
  // Top N soluciones con mayor successScore
  const top = db
    .filter((e) => e.successScore >= 50)
    .sort((a, b) => b.successScore - a.successScore)
    .slice(0, topN);
  if (top.length === 0) return "";
  const lines = top.map((e, i) =>
    `${i + 1}. SÍNTOMA: "${e.symptom}"\n   SOLUCIÓN APLICADA: ${e.solutionApplied}\n   ÉXITO: ${e.successScore}% (visto ${e.occurrences} vez/veces)`
  );
  return `\n\n[MEMORIA DE AUTOMEJORA — Lecciones aprendidas de errores pasados]\n${lines.join("\n\n")}`;
}
