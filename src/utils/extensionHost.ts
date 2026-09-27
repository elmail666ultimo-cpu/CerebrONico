/**
 * extensionHost.ts — Puente entre la IDE y las extensiones (v2.0)
 * ==============================================================
 * Protocolo (postMessage, con `cn: 1` como marcador de versión):
 *
 *   Extensión → IDE   { cn:1, type:"request", id, method, params }
 *   IDE → Extensión   { cn:1, type:"response", id, ok, result?, error? }
 *   IDE → Extensión   { cn:1, type:"init", manifest, permissions, settings }
 *   IDE → Extensión   { cn:1, type:"command", commandId, args }
 *   Extensión → IDE   { cn:1, type:"log" | "notify" | "setTitle", ... }
 *
 * El IDE comprueba SIEMPRE los permisos antes de atender una petición. Una
 * extensión sin "workspace.write" no puede escribir aunque lo intente: la
 * comprobación vive de este lado, no en el código de la extensión.
 */

import type { ExtensionManifest } from "../engine/extensions";

export interface ExtensionInfo {
  manifest: ExtensionManifest;
  /** Carpeta relativa, ej: "extensions/acme.formateador" */
  dir: string;
  enabled: boolean;
  /** Problemas de carga (manifiesto inválido, entry inexistente…) */
  error?: string;
  warnings?: string[];
}

/** Lo que la IDE ofrece a la extensión (ya filtrado por permisos). */
export interface HostCapabilities {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  listFiles: () => Promise<string[]>;
  exec: (command: string) => Promise<string>;
  getChatMessages: () => Promise<{ role: string; content: string }[]>;
  sendChatMessage: (text: string) => Promise<void>;
  getWorkspaceFiles: () => Promise<{ path: string; content: string }[]>;
  log: (message: string) => void;
  notify: (message: string) => void;
  setTitle: (title: string) => void;
}

export async function fetchExtensions(): Promise<ExtensionInfo[]> {
  try {
    const res = await fetch("/api/extensions");
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.extensions) ? data.extensions : [];
  } catch {
    return [];
  }
}

export async function setExtensionEnabled(id: string, enabled: boolean): Promise<boolean> {
  try {
    const res = await fetch(`/api/extensions/${encodeURIComponent(id)}/${enabled ? "enable" : "disable"}`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Instala una extensión desde un ZIP.
 * Se envía como cuerpo binario (no multipart) para no necesitar multer en el
 * servidor: la IDE es local y solo se sube el propio ZIP.
 */
export async function installExtensionZip(file: File): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/extensions/install", {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data?.ok !== false, message: data?.message || (res.ok ? "Extensión instalada." : "No se pudo instalar.") };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Error de red al instalar." };
  }
}

export async function uninstallExtension(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/extensions/${encodeURIComponent(id)}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Resuelve la URL de un recurso dentro de la extensión (sin salir de su carpeta). */
export function extensionAssetUrl(dir: string, entry: string): string {
  const clean = entry.replace(/^\.\//, "").replace(/\\/g, "/");
  if (clean.includes("..")) return "";
  return `/${dir.replace(/\\/g, "/")}/${clean}`;
}

/** Comprobación de permiso desde el lado IDE (la única que cuenta). */
export function canUse(manifest: ExtensionManifest, permission: string): boolean {
  return (manifest.permissions || []).includes(permission as any);
}
