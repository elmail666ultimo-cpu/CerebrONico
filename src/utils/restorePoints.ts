/**
 * CerebroNico V0.9 — Sistema de Puntos de Restauración (snapshots en memoria)
 * ============================================================
 * Cada vez que el usuario hace un cambio masivo (importar .cn, borrar todo,
 * refactor grande), se crea un snapshot silencioso del workspace + estado
 * relevante (modelo, provider, temperatura). El usuario puede "viajar en
 * el tiempo" volviendo a cualquier snapshot anterior con un clic.
 *
 * Almacenamiento: en memoria (no persiste entre sesiones, evita localStorage
 * lleno). Máximo 10 snapshots — los más antiguos se descartan.
 */
import { WorkspaceFile, ModelProvider } from "../types";

export interface Snapshot {
  id: string;
  createdAt: number;
  label: string;
  files: WorkspaceFile[];
  currentModel: string;
  provider: ModelProvider;
  temperature: number;
  messageCount: number;
}

const MAX_SNAPSHOTS = 10;
const snapshots: Snapshot[] = [];

export function createSnapshot(
  files: WorkspaceFile[],
  meta: {
    currentModel: string;
    provider: ModelProvider;
    temperature: number;
    messageCount: number;
    label?: string;
  }
): Snapshot {
  const snap: Snapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    label: meta.label || `Snapshot ${new Date().toLocaleTimeString()}`,
    // 🔧 Clonar profundo para evitar mutaciones posteriores
    files: files.map((f) => ({ ...f, content: f.content })),
    currentModel: meta.currentModel,
    provider: meta.provider,
    temperature: meta.temperature,
    messageCount: meta.messageCount,
  };
  snapshots.unshift(snap);
  // 🔧 Limitar a MAX_SNAPSHOTS — descartar los más antiguos
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots.splice(MAX_SNAPSHOTS);
  }
  return snap;
}

export function listSnapshots(): Snapshot[] {
  return [...snapshots];
}

export function getSnapshot(id: string): Snapshot | null {
  return snapshots.find((s) => s.id === id) || null;
}

export function restoreSnapshot(id: string): Snapshot | null {
  const snap = getSnapshot(id);
  if (!snap) return null;
  // 🔧 Devolver una copia profunda para que el caller pueda mutar sin afectar el snapshot original
  return {
    ...snap,
    files: snap.files.map((f) => ({ ...f, content: f.content })),
  };
}

export function deleteSnapshot(id: string): boolean {
  const idx = snapshots.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  snapshots.splice(idx, 1);
  return true;
}

export function clearSnapshots(): void {
  snapshots.length = 0;
}
