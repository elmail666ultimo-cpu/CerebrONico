/**
 * extensions.ts — Manifiesto, validación y registro de EXTENSIONES (v2.0)
 * ======================================================================
 * Meta: que CerebroNico pueda usar herramientas hechas por terceros — como las
 * extensiones de VS Code — **y que cada una se abra en una pestaña dentro de la
 * IDE, al lado del Chat**.
 *
 * Decisiones de diseño (y por qué):
 *
 * 1. MANIFIESTO JSON, NO CÓDIGO. Una extensión declara qué aporta
 *    (manifest.json) y su interfaz vive en HTML/JS propio. El IDE nunca
 *    ejecuta código de la extensión en su propio contexto: la carga en un
 *    <iframe sandbox> y habla con ella por postMessage. Así una extensión
 *    rota o maliciosa no puede tocar el DOM del IDE ni el sistema de archivos
 *    por su cuenta: solo puede pedir cosas por el puente, y el puente filtra
 *    por permisos.
 *
 * 2. PERMISOS EXPLÍCITOS. Nada de acceso implícito: si la extensión quiere
 *    escribir archivos, tiene que declarar "workspace.write" y el usuario ve
 *    ese permiso antes de activarla.
 *
 * 3. COMPATIBILIDAD HACIA FUERA. `contributes.tools` mete herramientas de la
 *    extensión en el registro del agente (shared/toolRegistry.ts), así el
 *    modelo puede llamarlas como cualquier otra; `contributes.commands` las
 *    expone como /comandos en el chat; y `contributes.languages` permite
 *    declarar resaltado para lenguajes nuevos. Un manifiesto tipo VS Code se
 *    puede adaptar con dos cambios (id con publisher y entry HTML).
 */

export const EXTENSION_API_VERSION = "2.0";

/** Permisos válidos. Cualquier otro valor invalida el manifiesto. */
export const EXTENSION_PERMISSIONS = [
  "workspace.read", // leer archivos del proyecto (vía puente)
  "workspace.write", // crear/modificar archivos del proyecto
  "workspace.exec", // ejecutar comandos en el sandbox
  "chat.read", // leer el historial del chat
  "chat.send", // enviar mensajes al chat / al modelo
  "tools.register", // exponer herramientas al agente
  "network", // hacer peticiones a internet desde la extensión
  "storage", // guardar sus propios datos
] as const;
export type ExtensionPermission = (typeof EXTENSION_PERMISSIONS)[number];

export interface ExtensionCommand {
  /** Identificador único, ej: "miExt.formatearJson" */
  id: string;
  title: string;
  description?: string;
  /** Palabra que activa el comando desde el chat: se escribe "/<slash>" */
  slash?: string;
}

export interface ExtensionPanel {
  id: string;
  title: string;
  /** Icono lucide-react por nombre (opcional) */
  icon?: string;
  /** HTML de entrada, relativo a la carpeta de la extensión */
  entry: string;
  /** "center-tab" abre como pestaña junto al Chat (por defecto). "side" lo pone en el panel derecho. */
  position?: "center-tab" | "side";
}

export interface ExtensionToolContribution {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  /** Comando de la extensión que implementa la herramienta ("command:miExt.hacer") */
  handler: string;
  cheap?: boolean;
  destructive?: boolean;
}

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  icon?: string;
  /** Página principal que se carga en su pestaña */
  main: string;
  engines?: { cerebronico?: string };
  permissions?: ExtensionPermission[];
  contributes?: {
    commands?: ExtensionCommand[];
    panels?: ExtensionPanel[];
    tools?: ExtensionToolContribution[];
    languages?: Array<{ id: string; extensions: string[] }>;
    settings?: Array<{ id: string; title: string; type: "string" | "number" | "boolean"; default?: unknown }>;
  };
  /** Rellenado por el IDE al cargarla */
  _installedAt?: number;
  _path?: string;
}

export interface ExtensionValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/i;
const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * Valida un manifiesto.
 * Se es deliberadamente estricto con lo que puede romper la IDE (rutas,
 * permisos, ids) y tolerante con lo cosmético (falta de descripción, icono…).
 */
export function validateManifest(raw: any): ExtensionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["El manifiesto no es un objeto JSON."], warnings };
  }
  if (typeof raw.id !== "string" || !ID_PATTERN.test(raw.id)) {
    errors.push('Falta "id" o no tiene el formato publisher.nombre (ej: "acme.formateador").');
  }
  if (typeof raw.name !== "string" || !raw.name.trim()) errors.push('Falta "name".');
  if (typeof raw.version !== "string" || !SEMVER.test(raw.version)) errors.push('Falta "version" o no es semver (ej: "1.0.0").');
  if (typeof raw.main !== "string" || !raw.main.trim()) errors.push('Falta "main" (página HTML de la extensión).');

  // Traversal: una extensión no puede apuntar fuera de su carpeta.
  for (const key of ["main", "icon"]) {
    const v = raw[key];
    if (typeof v === "string" && (v.includes("..") || v.startsWith("/") || /^[a-z]+:/i.test(v))) {
      errors.push(`"${key}" no puede salir de la carpeta de la extensión (${v}).`);
    }
  }
  if (raw.contributes?.panels) {
    if (!Array.isArray(raw.contributes.panels)) errors.push('"contributes.panels" debe ser una lista.');
    else {
      for (const p of raw.contributes.panels) {
        if (!p?.id || !p?.entry) errors.push('Cada panel necesita "id" y "entry".');
        if (typeof p?.entry === "string" && (p.entry.includes("..") || p.entry.startsWith("/"))) {
          errors.push(`El panel "${p?.id}" apunta fuera de la carpeta de la extensión.`);
        }
      }
    }
  }

  // Permisos: se avisa de los desconocidos y se ignoran (no se conceden).
  if (raw.permissions) {
    if (!Array.isArray(raw.permissions)) errors.push('"permissions" debe ser una lista.');
    else {
      for (const p of raw.permissions) {
        if (!EXTENSION_PERMISSIONS.includes(p)) warnings.push(`Permiso desconocido ignorado: "${p}".`);
      }
    }
  }

  if (raw.contributes?.tools) {
    if (!Array.isArray(raw.contributes.tools)) errors.push('"contributes.tools" debe ser una lista.');
    else {
      for (const t of raw.contributes.tools) {
        if (!t?.name || !t?.description || !t?.parameters) errors.push('Cada herramienta necesita "name", "description" y "parameters".');
        if (typeof t?.name === "string" && !/^[a-z][a-z0-9_]*$/i.test(t.name)) {
          errors.push(`El nombre de herramienta "${t.name}" solo admite letras, números y guion bajo.`);
        }
        if (typeof t?.handler === "string" && !t.handler.startsWith("command:")) {
          errors.push(`El handler de "${t?.name}" debe ser "command:<idDeComando>".`);
        }
      }
    }
  }

  if (!raw.description) warnings.push("Sin descripción: el usuario no sabrá qué hace antes de activarla.");
  if (!raw.permissions || raw.permissions.length === 0) {
    warnings.push("No declara permisos: no podrá leer ni escribir archivos.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Permisos realmente concedidos (filtra los desconocidos). */
export function grantedPermissions(m: ExtensionManifest): ExtensionPermission[] {
  return (m.permissions || []).filter((p) => EXTENSION_PERMISSIONS.includes(p));
}

export function hasPermission(m: ExtensionManifest, p: ExtensionPermission): boolean {
  return grantedPermissions(m).includes(p);
}

/** Comandos declarados, normalizados. */
export function listCommands(m: ExtensionManifest): ExtensionCommand[] {
  return (m.contributes?.commands || []).map((c) => ({
    ...c,
    slash: c.slash || (c.id.includes(".") ? c.id.split(".").pop() : c.id),
  }));
}

/** Paneles declarados (por defecto, pestaña central junto al chat). */
export function listPanels(m: ExtensionManifest): ExtensionPanel[] {
  return (m.contributes?.panels || []).map((p) => ({
    ...p,
    position: p.position || "center-tab",
  }));
}

/** Herramientas declaradas, listas para el registro del agente. */
export function listToolContributions(m: ExtensionManifest): ExtensionToolContribution[] {
  return m.contributes?.tools || [];
}

/** Índice de extensiones activas, para el servidor. */
export class ExtensionRegistry {
  private byId = new Map<string, ExtensionManifest>();

  add(m: ExtensionManifest): void {
    this.byId.set(m.id, m);
  }

  remove(id: string): void {
    this.byId.delete(id);
  }

  get(id: string): ExtensionManifest | undefined {
    return this.byId.get(id);
  }

  all(): ExtensionManifest[] {
    return [...this.byId.values()];
  }

  /** Busca la extensión y el comando a partir de un "/slash" escrito en el chat. */
  findBySlash(slash: string): { manifest: ExtensionManifest; command: ExtensionCommand } | null {
    const needle = slash.replace(/^\//, "").toLowerCase();
    for (const m of this.byId.values()) {
      for (const c of listCommands(m)) {
        if ((c.slash || "").toLowerCase() === needle || c.id.toLowerCase() === needle) {
          return { manifest: m, command: c };
        }
      }
    }
    return null;
  }
}
