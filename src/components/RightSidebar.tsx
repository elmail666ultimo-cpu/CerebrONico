import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  Code,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Layers,
  Loader2,
  Paperclip,
  Play,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Zap,
  ChevronDown,
  ChevronRight,
  X,
  FilePlus2,
  AlertTriangle,
  Power,
  RefreshCw,
} from "lucide-react";
import { WorkspaceFile } from "../types";
import { CodeEditor } from "./CodeEditor";
// v1.6.33 · CATÁLOGO HONESTO: aquí vivía `import { SKILLS_LIST_100, SkillDefinition }`
// sin un solo uso (grep: 1 sola aparición, la del propio import). Se retira:
// el catálogo honesto ya se consume desde contextCache/catalogoHonesto.
import { LS_KEYS, SANDBOX_URL as SANDBOX_URL_CONST, IDE_BRAND, EXPLORER_LIMITS } from "../constants";

const SANDBOX_URL = SANDBOX_URL_CONST;

interface RightSidebarProps {
  files: WorkspaceFile[];
  activeFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onCloseFile: (fileId: string) => void;
  onUpdateFileContent: (fileId: string, newContent: string) => void;
  onCreateNewFile: () => void;
  onDeleteFile: (fileId: string) => void;
  onAttachFiles: (files: File[]) => void;
  onDeleteAllFiles: () => void;
  onRestoreTemplate?: () => void;
  onDownloadZip: () => void;
  terminalLogs: string[];
  onSyncProject?: () => Promise<number> | undefined;
  onAutoSync?: () => Promise<number> | undefined;
  onPullProject?: () => void;
  onBuildProject?: () => void;
  // 🔧 Soporte extensión .cn (CerebroNico) para guardar/abrir workspace completo
  onExportCnFile?: () => void;
  onImportCnFile?: (file: File) => void;
}

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["ts", "tsx", "js", "jsx"].includes(ext)) {
    return <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
  }
  if (["json"].includes(ext)) {
    return <FileJson className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  }
  if (["md", "txt", "rtf", "doc"].includes(ext)) {
    return <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  }
  return <FileCode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
}

// ============================================================
// ÁRBOL DE ARCHIVOS VERTICAL (estilo explorador lateral)
// ============================================================
interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  file?: WorkspaceFile;
  children: TreeNode[];
}

function buildFileTree(files: WorkspaceFile[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isFolder: true, children: [] };
  for (const f of files) {
    const parts = (f.path || f.name).split("/").filter(Boolean);
    let cur = root;
    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      const p = parts.slice(0, i + 1).join("/");
      let next = cur.children.find((c) => c.name === part && c.isFolder === !isLast);
      if (!next) {
        next = {
          name: part,
          path: p,
          isFolder: !isLast,
          file: isLast ? f : undefined,
          children: [],
        };
        cur.children.push(next);
      }
      cur = next;
    });
  }
  const sortRec = (n: TreeNode) => {
    n.children.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root.children;
}

const FileRow: React.FC<{
  node: TreeNode;
  depth: number;
  activeFileId: string | null;
  collapsed: Set<string>;
  toggleFolder: (path: string) => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}> = ({ node, depth, activeFileId, collapsed, toggleFolder, onSelect, onClose }) => {
  if (node.isFolder) {
    const isCollapsed = collapsed.has(node.path);
    return (
      <div>
        <button
          onClick={() => toggleFolder(node.path)}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-zinc-300 hover:bg-zinc-800/60 transition-colors text-left select-none"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          title={node.path}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
          )}
          {isCollapsed ? (
            <Folder className="w-3.5 h-3.5 text-cyan-500/80 shrink-0" />
          ) : (
            <FolderOpen className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          )}
          <span className="truncate text-xs font-medium">{node.name}</span>
          <span className="ml-auto text-[9px] text-zinc-600 font-mono shrink-0">
            {node.children.length}
          </span>
        </button>
        {!isCollapsed && (
          <div>
            {node.children.map((child) => (
              <FileRow
                key={child.path + (child.isFolder ? "/" : "")}
                node={child}
                depth={depth + 1}
                activeFileId={activeFileId}
                collapsed={collapsed}
                toggleFolder={toggleFolder}
                onSelect={onSelect}
                onClose={onClose}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = activeFileId === node.file?.id;
  return (
    <div
      onClick={() => node.file && onSelect(node.file.id)}
      title={node.path}
      className={`group flex items-center gap-1.5 pr-1.5 py-1.5 rounded-md cursor-pointer transition-colors text-left select-none ${
        isActive
          ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
          : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 border border-transparent"
      }`}
      style={{ paddingLeft: `${8 + depth * 12 + 16}px` }}
    >
      {getFileIcon(node.name)}
      <span className="truncate text-xs font-mono flex-1">{node.name}</span>
      {node.file?.modified && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Modificado" />
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (node.file) onClose(node.file.id);
        }}
        className="opacity-0 group-hover:opacity-100 hover:bg-zinc-700/80 p-0.5 rounded text-zinc-500 hover:text-zinc-200 transition-opacity shrink-0"
        title="Cerrar archivo"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export const RightSidebar: React.FC<RightSidebarProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onCloseFile,
  onUpdateFileContent,
  onCreateNewFile,
  onDeleteFile,
  onAttachFiles,
  onDeleteAllFiles,
  onRestoreTemplate,
  onDownloadZip,
  terminalLogs,
  onSyncProject,
  onAutoSync,
  onPullProject,
  onBuildProject,
  onExportCnFile,
  onImportCnFile,
}) => {
  const [activeTab, setActiveTab] = useState<"sandbox" | "editor" | "deliverables" | "terminal">(
    "editor"
  );
  const [fileSearch, setFileSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [selectedSkillCategory, setSelectedSkillCategory] = useState<string>("all");
  const [copied, setCopied] = useState(false);

  // Árbol vertical: carpetas colapsadas (por defecto todo expandido)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  // ============================================================
  // v2.1 — DESPLAZADOR DEL EXPLORADOR (pedido dos veces).
  // ------------------------------------------------------------
  // La columna del árbol estaba FIJADA a 210 px, así que los nombres largos de
  // archivo se cortaban ("back…", "ma…", "vit…") y no había forma de leerlos
  // porque el ancho no se podía mover. Ahora hay una barra arrastrable entre el
  // árbol y el editor, con el ancho recordado entre sesiones.
  // ============================================================
  const [explorerWidth, setExplorerWidth] = useState<number>(() => {
    try {
      const guardado = Number(localStorage.getItem(LS_KEYS.EXPLORER_WIDTH));
      if (Number.isFinite(guardado) && guardado >= EXPLORER_LIMITS.MIN && guardado <= EXPLORER_LIMITS.MAX) {
        return guardado;
      }
    } catch {}
    return EXPLORER_LIMITS.DEFAULT;
  });
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.EXPLORER_WIDTH, String(explorerWidth));
    } catch {}
  }, [explorerWidth]);

  /** Arrastre horizontal del desplazador del explorador. */
  const startExplorerDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = explorerWidth;
    const mover = (ev: MouseEvent) => {
      const nuevo = Math.max(
        EXPLORER_LIMITS.MIN,
        Math.min(EXPLORER_LIMITS.MAX, w0 + (ev.clientX - x0))
      );
      setExplorerWidth(nuevo);
    };
    const soltar = () => {
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
  };
  const toggleFolder = (p: string) =>
    setCollapsedFolders((prev) => {
      const nx = new Set(prev);
      nx.has(p) ? nx.delete(p) : nx.add(p);
      return nx;
    });

  // Real terminal state
  const [commandInput, setCommandInput] = useState("");
  const [termLines, setTermLines] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const termEndRef = useRef<HTMLDivElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  // 🔧 Ref para el input oculto de importar archivos .cn (CerebroNico)
  const cnImportInputRef = useRef<HTMLInputElement>(null);

  // 🔧 ANTI-BUCLE: contador de reintentos consecutivos del autopiloto con backoff.
  // Si sandboxAutoPilot falla N veces seguidas, espera exponencialmente antes de
  // reintentar (1s, 2s, 4s, 8s… hasta 60s) para no saturar la CPU intentando
  // levantar el puerto 3500 cada milisegundo.
  const sbRetryCountRef = useRef(0);
  const sbNextRetryAtRef = useRef(0); // timestamp ms

  useEffect(() => {
    termEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [termLines, activeTab]);

  const runCommand = async () => {
    const cmd = commandInput.trim();
    if (!cmd || isRunning) return;
    setIsRunning(true);
    setTermLines((prev) => [...prev, `$ ${cmd}`]);
    setCmdHistory((prev) => [cmd, ...prev].slice(0, 50));
    setHistoryIdx(-1);
    setCommandInput("");
    try {
      const res = await fetch("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, timeoutMs: 120000 }),
      });
      const data = await res.json();
      const out: string[] = [];
      if (data.stdout) out.push(...data.stdout.replace(/\n$/, "").split("\n"));
      if (data.stderr) out.push(...data.stderr.replace(/\n$/, "").split("\n"));
      out.push(
        data.exitCode === 0
          ? "[ok]"
          : `[exit ${data.exitCode}]${data.timedOut ? " (timeout)" : ""}${data.error ? ` ${data.error}` : ""}`
      );
      setTermLines((prev) => [...prev, ...out]);
    } catch (err: any) {
      setTermLines((prev) => [...prev, `[error] ${err.message}`]);
    } finally {
      setIsRunning(false);
    }
  };

  const activeFile = files.find((f) => f.id === activeFileId) || files[0] || null;

  const handleCopyCode = () => {
    if (activeFile) {
      navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadSingleFile = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ============================================================
  // SANDBOX 100% AUTOMÁTICO (puerto 3500, sin chocar con la IDE :3000)
  // Piloto automático: sincroniza -> instala -> arranca -> preview vivo
  // ============================================================
  const [sbOnline, setSbOnline] = useState<boolean>(false);
  const [sbInstalled, setSbInstalled] = useState<boolean>(false);
  const [sbHasProject, setSbHasProject] = useState<boolean>(false);
  const [sbBusy, setSbBusy] = useState<string | null>(null); // 'install' | 'start' | 'stop' | 'auto' | null
  // v2.1 — El historial del sandbox se restaura al volver. El trabajo sigue en
  // el servidor (npm install, arranque), pero el log era estado del componente:
  // si el panel se desmontaba, el historial desaparecía y parecía que la tarea
  // se había detenido.
  const [sbLogs, setSbLogs] = useState<string[]>(() => {
    try {
      // CONSOLA LIMPIA v1 (a pedido de Mario): cada apertura de la interfaz
      // arranca sin diálogo previo. El registro vive en memoria durante la
      // sesión; ya no se resucita entre arranques.
      const g: string[] = [];
      return Array.isArray(g) ? g.slice(-40) : [];
    } catch {
      return [];
    }
  });
  const [iframeKey, setIframeKey] = useState(0);
  const forzandoRef = useRef(false); // FUERZA v1
  // 🔧 Estado del src del iframe: cuando se vacía (""), el iframe se desmontea
  // completamente (destrucción del contexto), matando cualquier página fantasma.
  const [iframeSrc, setIframeSrc] = useState<string>(SANDBOX_URL);

  // Piloto automático (ON por defecto): el preview se levanta y mantiene solo
  const [sbAuto, setSbAuto] = useState<boolean>(() => localStorage.getItem(LS_KEYS.SANDBOX_AUTO) !== "0");
  const [sbPhase, setSbPhase] = useState<string>("idle"); // idle|sync|install|start|wait|live|error
  const sbAutoRef = useRef(sbAuto);
  sbAutoRef.current = sbAuto;
  const sbOnlineRef = useRef(false);
  const sbWorkingRef = useRef(false);
  const everLiveRef = useRef(false);
  const sbPhaseRef = useRef<string>("idle");
  const setPhase = (p: string) => {
    sbPhaseRef.current = p;
    setSbPhase(p);
  };

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.SANDBOX_AUTO, sbAuto ? "1" : "0");
    } catch {}
  }, [sbAuto]);

  const sbLog = (line: string) =>
    setSbLogs((prev) => {
      const next = [...prev.slice(-40), `[${new Date().toLocaleTimeString()}] ${line}`];
      // v2.1 — Se persiste cada línea para que el historial sobreviva al cambio
      // de vista (ver la inicialización de sbLogs).
      try {
        localStorage.setItem(LS_KEYS.SANDBOX_LOG, JSON.stringify(next));
      } catch {}
      return next;
    });

  const refreshSandboxStatus = async () => {
    try {
      const res = await fetch("/api/sandbox/status");
      const d = await res.json();
      const online = Boolean(d.online);
      setSbOnline(online);
      sbOnlineRef.current = online;
      setSbInstalled(Boolean(d.installed));
      setSbHasProject(Boolean(d.hasProject));
      if (online) {
        // 🔧 Restaurar el src del iframe si estaba vacío (tras un Forzar Limpieza)
        if (!iframeSrc) setIframeSrc(SANDBOX_URL);
        if (!everLiveRef.current) {
          everLiveRef.current = true;
          setIframeKey((k) => k + 1);
        }
        if (sbPhaseRef.current !== "live") setPhase("live");
      } else if (sbPhaseRef.current === "live") {
        setPhase("idle");
      }
      return d;
    } catch {
      setSbOnline(false);
      sbOnlineRef.current = false;
      return null;
    }
  };

  // Piloto automático: hace TODO el flujo sin que el usuario toque un botón
  const sandboxAutoPilot = async () => {
    if (sbWorkingRef.current || !sbAutoRef.current) return;
    // 🔧 ANTI-BUCLE: respetar backoff exponencial — si reintentos consecutivos fallaron,
    // esperar hasta sbNextRetryAtRef antes de intentar de nuevo.
    const now = Date.now();
    if (now < sbNextRetryAtRef.current) {
      const waitS = Math.ceil((sbNextRetryAtRef.current - now) / 1000);
      sbLog(`AUTO · Esperando ${waitS}s antes de reintentar (backoff anti-zombies)…`);
      return;
    }

    // 🔧 FIX CRÍTICO: si el workspace del editor está vacío, NO intentar arrancar el sandbox.
    // Antes el autopilot seguía en bucle: sincronizaba (0 archivos), npm install, arrancar → error.
    if (files.length === 0) {
      sbLog("AUTO · ⚠️ Workspace del editor vacío. El sandbox necesita al menos package.json para arrancar.");
      sbLog("AUTO · Solución: 1) Usa 'Plantilla' en el explorador para restaurar la plantilla base, o 2) Crea/abre un proyecto .cn. Luego vuelve aquí y pulsa 'Arrancar ahora'.");
      // Desactivar el piloto automático para que no siga intentando
      setSbAuto(false);
      try { localStorage.setItem(LS_KEYS.SANDBOX_AUTO, "0"); } catch {}
      setPhase("idle");
      return;
    }

    sbWorkingRef.current = true;
    setSbBusy("auto");
    try {
      let st: any = await refreshSandboxStatus();
      if (st?.online) {
        // 🔧 ÉXITO: reiniciar contador de backoff
        sbRetryCountRef.current = 0;
        sbNextRetryAtRef.current = 0;
        return; // ya está vivo, nada que hacer
      }

      // 1) Sincronizar el workspace del editor al sandbox (disco real)
      setPhase("sync");
      sbLog("AUTO · Sincronizando archivos del editor al sandbox…");
      try {
        const written = await (onAutoSync || onSyncProject)?.();
        if (typeof written === "number") {
          sbLog(`AUTO · ${written} archivo(s) escrito(s) en .proyectos/.`);
        }
      } catch (e: any) {
        sbLog(`AUTO · Error al sincronizar: ${e?.message || e}`);
      }

      st = await refreshSandboxStatus();

      // ============================================================
      // v2.0 — ANTES DE RENDIRSE: ¿está el proyecto en una subcarpeta?
      // ------------------------------------------------------------
      // Caso real: subes un ZIP y el sandbox dice "no se encontró package.json".
      // El package.json EXISTÍA, pero un nivel más adentro (el ZIP traía carpeta
      // contenedora: Proyecto/ide/backend/package.json). El motor ahora busca por
      // niveles y, si lo encuentra, aplana la raíz y sigue arrancando solo.
      // ============================================================
      // ============================================================
      // v2.1 — 🐞 FUSIONAR TAMBIÉN CUANDO LA RAÍZ YA TIENE PROYECTO.
      // ------------------------------------------------------------
      // Antes esto solo se ejecutaba `if (!st.hasProject)`. Pero el sync escribe
      // SIEMPRE el árbol anidado (el workspace guarda las rutas con su carpeta
      // contenedora), así que en cuanto la raíz tuvo un package.json —cosa que
      // pasa en el primer aplanado— la condición nunca volvía a cumplirse y el
      // proyecto nuevo se quedaba dentro SIN SUBIR, para siempre.
      // Si el «src» de la raíz era viejo, el preview cargaba el título y devolvía
      // 404 en todos los /src/components/*.
      // Ahora, si el sandbox informa de una copia anidada, se fusiona: manda la
      // versión del editor.
      // ============================================================
      const copiaAnidada = String((st as any)?.paqueteAnidado || "");
      if (!st?.hasProject || copiaAnidada) {
        const candidates = (st as any)?.packageJsonCandidates as string[] | undefined;
        if (copiaAnidada) {
          sbLog(`AUTO · El editor tiene una copia más nueva del proyecto en «${copiaAnidada}/». Fusionándola con la raíz…`);
        } else if (candidates && candidates.length > 0) {
          sbLog(`AUTO · El package.json está en «${candidates[0]}/», no en la raíz del sandbox. Aplanando la raíz…`);
        }
        if (copiaAnidada || (candidates && candidates.length > 0)) {
          try {
            const r = await fetch("/api/sandbox/flatten-root", { method: "POST" });
            const j = await r.json().catch(() => ({}));
            sbLog(`AUTO · ${j?.message || (j?.ok ? "Raíz aplanada." : "No se pudo aplanar la raíz.")}`);
            // v2.1 — el aplanado ahora también FUNDE lo que ya existía en la raíz
            // (antes lo saltaba en silencio y dejaba un «src» viejo para siempre).
            // Cuenta como cambio cualquiera de las tres cosas.
            if (j?.ok && (j?.moved || 0) + (j?.merged || 0) + (j?.replaced || 0) > 0) {
              st = await refreshSandboxStatus();
              if (st?.hasProject) {
                sbLog("AUTO · ✅ Proyecto detectado en la raíz tras aplanar. Continuando con el arranque…");
              }
            }
          } catch (e: any) {
            sbLog(`AUTO · Error al aplanar la raíz: ${e?.message || e}`);
          }
        }
      }

      // ============================================================
      // v8.0.4 — 🐞 ESTE MENSAJE ERA FALSO Y ADEMÁS DESVIABA AL MODELO
      // ------------------------------------------------------------
      // Decía, literal: «❌ No se encontró package.json en el sandbox tras
      // sincronizar» + «Solución: asegúrate de que tu workspace tenga un
      // package.json». Dos problemas, y el segundo hizo daño real:
      //
      //  · Es FALSO como diagnóstico: el sandbox acepta muchos marcadores
      //    (ADUANA v2) y una web estática con index.html es un proyecto válido
      //    que no necesita npm. Decir «falta package.json» cuando lo que hay es
      //    una web perfecta es diagnosticar la enfermedad equivocada.
      //  · Es una ORDEN para el modelo. El log del usuario lo enseña: el modelo
      //    leyó ese texto y respondió «el sandbox no tiene un proyecto
      //    reconocido; voy a crear un proyecto Node.js básico». Se puso a
      //    montar un proyecto npm que el usuario NO necesitaba, por culpa de una
      //    frase nuestra.
      //
      // El mensaje ahora informa de lo que de verdad ha pasado, y si no hay nada
      // reconocible DICE DÓNDE se ha buscado y qué había ahí. Adivinar es lo que
      // convirtió un preview en blanco en una tarde de vueltas.
      // ============================================================
      if (!st?.hasProject) {
        const donde = String((st as any)?.buscadoEn || ".proyectos");
        const contenido: string[] = Array.isArray((st as any)?.contenidoRaiz) ? (st as any).contenidoRaiz : [];
        sbLog("AUTO · ❌ No hay ningún proyecto reconocible en el sandbox tras sincronizar.");
        sbLog(
          `AUTO · Buscado en: ${donde} (y hasta 3 niveles de subcarpetas). Contenido de la raíz: ` +
            (contenido.length ? contenido.join(", ") : "vacía o ilegible")
        );
        // Alternativas REALES, en orden de coste. Se dice el marcador que sirve
        // para cada caso en vez de prescribir package.json a ciegas.
        sbLog(
          "AUTO · Qué sirve como proyecto: una web con index.html (no necesita npm), o bien package.json, " +
            "requirements.txt, Cargo.toml, go.mod, pom.xml, Dockerfile o Makefile. Con index.html el sandbox " +
            "lo sirve tal cual en :3500."
        );
        sbLog(
          "AUTO · Si el modelo escribió la web dentro de una subcarpeta, pulsa 'Sync' y el sandbox la detectará " +
            "ella sola; si el workspace está vacío, usa 'Plantilla' o 'Abrir .cn'."
        );
        // Desactivar el piloto automático para que no siga intentando en bucle
        setSbAuto(false);
        try { localStorage.setItem(LS_KEYS.SANDBOX_AUTO, "0"); } catch {}
        setPhase("idle");
        // Reiniciar backoff para que el usuario pueda reactivar manualmente
        sbRetryCountRef.current = 0;
        sbNextRetryAtRef.current = 0;
        return;
      }

      // 2) Instalar dependencias solo si faltan (normalmente solo la 1ª vez)
      if (st && !st.installed) {
        setPhase("install");
        sbLog("AUTO · npm install en curso (solo la primera vez, puede tardar)…");
        try {
          const res = await fetch("/api/exec", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "npm install --no-audit --no-fund", timeoutMs: 300000 }),
          });
          const d = await res.json();
          if (d.exitCode === 0) {
            sbLog("AUTO · Dependencias instaladas correctamente.");
          } else {
            sbLog(`AUTO · npm install con errores: ${(d.stderr || d.error || "").slice(-240)}`);
          }
        } catch (e: any) {
          sbLog(`AUTO · Error instalando: ${e.message}`);
        }
      }

      // 3) Arrancar el servidor del proyecto en el puerto 3500
      setPhase("start");
      sbLog("AUTO · Arrancando la app del sandbox en el puerto 3500…");
      try {
        let res = await fetch("/api/sandbox/start", { method: "POST" });
        let d = await res.json();
        if (d?.requiereConfirmacion) { // RECURSIÓN v1: aviso y continúo (el flujo está probado por el usuario)
          sbLog(`AUTO · ⚠ ${d.aviso}`);
          res = await fetch("/api/sandbox/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmar: "recursion" }) });
          d = await res.json();
        }
        if (d?.error) sbLog(`AUTO · No se pudo arrancar: ${d.error}`);
      } catch (e: any) {
        sbLog(`AUTO · Error arrancando: ${e.message}`);
      }

      // 4) Esperar a que el puerto responda (cold start de Vite incluido)
      setPhase("wait");
      const deadline = Date.now() + 60000;
      let up = false;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const chk = await refreshSandboxStatus();
        if (chk?.online) {
          up = true;
          break;
        }
      }
      if (up) {
        // 🔧 ÉXITO: reiniciar contador de backoff
        sbRetryCountRef.current = 0;
        sbNextRetryAtRef.current = 0;
        sbLog("AUTO · Preview en vivo listo en :3500 ✅ (los cambios del editor se reflejan solos)");
        // ============================================================
        // v2.1 — 🐞 "LISTO" NO BASTABA: EL PUERTO RESPONDE Y LA PÁGINA PUEDE
        // QUEDAR EN BLANCO. Comprobación real, del lado del servidor, de que los
        // módulos /src/* se sirven de verdad. Sin esto, el éxito del puerto
        // tapaba un preview vacío y el usuario se quedaba sin ninguna pista.
        // ============================================================
        try {
          const vr = await fetch("/api/sandbox/verify-preview");
          const vj = await vr.json();
          if (vj?.message) sbLog(`AUTO · ${vj.ok ? "✅" : "❌"} ${vj.message}`);
          if (vj?.ok === false) {
            sbLog("AUTO · El sandbox está vivo pero sirve una página vacía: revisa el aviso de arriba y pulsa «Arrancar ahora» tras un Sync completo.");
          }
        } catch {}
      } else {
        // 🔧 FALLO: incrementar contador y aplicar backoff exponencial (1s, 2s, 4s, 8s… 60s max)
        sbRetryCountRef.current += 1;
        const backoffMs = Math.min(1000 * Math.pow(2, sbRetryCountRef.current - 1), 60000);
        sbNextRetryAtRef.current = Date.now() + backoffMs;
        setPhase("error");
        const waitS = Math.ceil(backoffMs / 1000);
        sbLog(
          `AUTO · El puerto 3500 no respondió a tiempo (intento #${sbRetryCountRef.current}). ` +
          `Próximo reintento en ${waitS}s (backoff exponencial para evitar procesos zombie).`
        );
      }
    } finally {
      sbWorkingRef.current = false;
      setSbBusy(null);
    }
  };

  // Al entrar a la pestaña Sandbox: chequea y, si hace falta, activa el piloto
  // 🔧 FIX imagen blanca: NO activar el piloto si el workspace está vacío.
  // El sandbox en :3500 no tiene nada que servir y el iframe se queda en blanco.
  useEffect(() => {
    if (activeTab === "sandbox") {
      refreshSandboxStatus().then((st) => {
        // Solo activar el piloto si hay archivos en el workspace
        if (!st?.online && sbAutoRef.current && files.length > 0) {
          sandboxAutoPilot();
        } else if (!st?.online && files.length === 0) {
          sbLog("INFO · Workspace vacío: el sandbox necesita al menos 1 archivo (ej: package.json) para arrancar.");
          sbLog("INFO · Usa 'Plantilla' en el explorador para restaurar la plantilla base, o adjunta archivos.");
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, files.length]);

  // 🔧 Escuchar evento de auto-sync: cuando la IA genera código y se sincroniza
  // al disco, refrescar el iframe del sandbox para mostrar los cambios en vivo.
  useEffect(() => {
    const handleAutoSync = () => {
      if (sbOnlineRef.current) {
        sbLog("AUTO-SYNC · Refrescando preview del sandbox...");
        setIframeKey((k) => k + 1);
      }
    };
    window.addEventListener("cerebronico:autosync-done", handleAutoSync);
    return () => window.removeEventListener("cerebronico:autosync-done", handleAutoSync);
  }, []);

  // Vigilancia continua: si el sandbox se cae con la pestaña abierta, lo re-levanta solo
  useEffect(() => {
    if (activeTab !== "sandbox" || !sbAuto) return;
    const iv = setInterval(() => {
      if (sbWorkingRef.current) return;
      fetch("/api/sandbox/status")
        .then((r) => {
          // Guard: un 401/500 no debe interpretarse como "sandbox caído"
          // (antes disparaba el autopiloto en bucle ante errores del server).
          if (!r.ok) throw new Error(`status ${r.status}`);
          return r.json();
        })
        .then((d) => {
          const online = Boolean(d?.online);
          setSbOnline(online);
          sbOnlineRef.current = online;
          setSbInstalled(Boolean(d?.installed));
          setSbHasProject(Boolean(d?.hasProject));
          if (online) {
            // 🔧 Restaurar el src del iframe si estaba vacío (tras un Forzar Limpieza)
            if (!iframeSrc) setIframeSrc(SANDBOX_URL);
            if (!everLiveRef.current) {
              everLiveRef.current = true;
              setIframeKey((k) => k + 1);
            }
            if (sbPhaseRef.current !== "live") setPhase("live");
          } else if (!sbWorkingRef.current) {
            if (everLiveRef.current) sbLog("AUTO · El sandbox se detuvo: reactivando automáticamente…");
            sandboxAutoPilot();
          }
        })
        .catch(() => {});
    }, 8000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, sbAuto]);

  // Sincronización automática de archivos: editás en la IDE y el preview se actualiza solo
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstFilesRenderRef = useRef(true);
  useEffect(() => {
    if (firstFilesRenderRef.current) {
      firstFilesRenderRef.current = false;
      return;
    }
    if (!sbAuto) return;
    if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = setTimeout(async () => {
      if (sbWorkingRef.current || !sbOnlineRef.current) return;
      try {
        await (onAutoSync || onSyncProject)?.(); // silencioso; Vite HMR refresca el iframe solo
      } catch {}
    }, 2500);
    return () => {
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, sbAuto]);

  const handleSandboxInstall = async () => {
    if (sbBusy) return;
    setSbBusy("install");
    sbLog("Sincronizando archivos del editor al sandbox…");
    try {
      await onSyncProject?.();
    } catch {}
    sbLog("npm install en curso (puede tardar minutos en la primera vez)…");
    try {
      const res = await fetch("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "npm install --no-audit --no-fund", timeoutMs: 300000 }),
      });
      const d = await res.json();
      if (d.exitCode === 0) {
        sbLog("Dependencias instaladas correctamente.");
      } else {
        sbLog(`npm install falló: ${(d.stderr || d.error || "").slice(-300)}`);
      }
    } catch (e: any) {
      sbLog(`Error instalando: ${e.message}`);
    }
    await refreshSandboxStatus();
    setSbBusy(null);
  };

  const handleSandboxStart = async () => {
    if (sbBusy) return;
    setSbBusy("start");
    sbLog("Sincronizando archivos del editor al sandbox…");
    try {
      await onSyncProject?.();
    } catch {}
    sbLog("Arrancando servidor del proyecto en el puerto 3500…");
    try {
      let res = await fetch("/api/sandbox/start", { method: "POST" });
      let d = await res.json();
      if (d?.requiereConfirmacion) { // RECURSIÓN v1: aviso y continúo (el flujo está probado por el usuario)
        sbLog(`⚠ ${d.aviso} — reintentando con confirmación…`);
        res = await fetch("/api/sandbox/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmar: "recursion" }) });
        d = await res.json();
      }
      if (d.error) {
        sbLog(`No se pudo arrancar: ${d.error}`);
      } else if (d.online) {
        sbLog(`App viva en ${SANDBOX_URL} (pid ${d.pid ?? "externo"})`);
        setIframeKey((k) => k + 1);
      } else {
        // ============================================================
        // v2.1 — 🐞 Antes solo se decía "no responde", y eso no ayuda a nadie:
        // el proceso puede haber muerto por falta de una dependencia, por un
        // puerto ya ocupado o por un error de arranque, y todo se veía igual.
        // Ahora el servidor devuelve la causa probable (d.hint) y las últimas
        // líneas REALES del proceso (d.logTail), justo aquí abajo.
        // ============================================================
        sbLog(
          d.hint ||
            "El proceso arrancó pero el puerto 3500 aún no responde. Revisa la Terminal (npm run dev)."
        );
        if (d.logTail) {
          const lineas = String(d.logTail)
            .split("\n")
            .filter((l: string) => l.trim())
            .slice(-8);
          for (const linea of lineas) sbLog(`   ${linea}`);
        }
      }
    } catch (e: any) {
      sbLog(`Error arrancando: ${e.message}`);
    }
    await refreshSandboxStatus();
    setSbBusy(null);
  };

  const handleSandboxStop = async () => {
    if (sbBusy) return;
    setSbBusy("stop");
    sbLog("Deteniendo el servidor del sandbox…");
    try {
      await fetch("/api/sandbox/stop", { method: "POST" });
      sbLog("Servidor del sandbox detenido.");
    } catch (e: any) {
      sbLog(`Error deteniendo: ${e.message}`);
    }
    await refreshSandboxStatus();
    setSbBusy(null);
  };

  const openSandboxExternal = () => {
    window.open(SANDBOX_URL, "_blank");
  };

  const fileTree = buildFileTree(files);
  const filteredTree = fileSearch.trim()
    ? files
        .filter((f) => f.path.toLowerCase().includes(fileSearch.toLowerCase()))
        .sort((a, b) => a.path.localeCompare(b.path))
    : null;

  return (
    <aside data-cn="paneles" className="w-full h-full flex flex-col bg-[#000000] border-l border-[#121824] overflow-hidden text-xs select-text">
      {/* Top Main Navigation Tabs */}
      <div className="h-10 bg-[#04060c] border-b border-[#121824] flex items-center justify-between px-2 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar py-0.5">
          <button
            onClick={() => setActiveTab("sandbox")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-all ${
              activeTab === "sandbox"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Sandbox</span>
          </button>

          <button
            onClick={() => setActiveTab("editor")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-all ${
              activeTab === "editor"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Editor ({files.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("deliverables")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-all ${
              activeTab === "deliverables"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Entregables</span>
          </button>

          {/* 🔧 Pestaña "Skills (100)" ELIMINADA: las 100 skills viven en el motor
              (se inyectan vía contextCache en el system prompt), no es necesario
              verlas como panel separado. El usuario puede pedirlas por chat. */}

          <button
            onClick={() => setActiveTab("terminal")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-all ${
              activeTab === "terminal"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
            title="Terminal de telemetría"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* (Descargas: el ZIP total vive en el botón verde del header y la de archivo individual en el editor — sin duplicados) */}
        <div className="flex items-center gap-1" />
      </div>

      {/* ============================================================
          TAB CONTENT: SANDBOX REAL (preview en vivo del proyecto en :3500)
          ============================================================ */}
      {activeTab === "sandbox" && (
        <div className="flex-1 flex flex-col bg-[#03050a] relative overflow-hidden">
          {/* Barra de control del sandbox */}
          <div className="bg-[#060912] border-b border-[#141d2e] px-3 py-2 flex flex-col gap-2 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    sbBusy
                      ? "bg-amber-400 animate-pulse"
                      : sbOnline
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-zinc-600"
                  }`}
                />
                <span className="font-mono text-zinc-300 text-[11px]">
                  Sandbox Preview · {SANDBOX_URL.replace("http://", "")}
                </span>
              </div>
              <span className="text-zinc-500 font-mono text-[10px]">
                {sbBusy === "auto"
                  ? `AUTO · ${sbPhase === "sync" ? "sincronizando" : sbPhase === "install" ? "instalando deps" : sbPhase === "start" || sbPhase === "wait" ? "arrancando :3500" : "trabajando"}…`
                  : sbOnline
                  ? "EN VIVO"
                  : sbPhase === "error"
                  ? "REINTENTANDO…"
                  : "APAGADO"}{" "}
                · IDE en :3000 · App en :3500
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Piloto automático: hace todo solo */}
              <button
                onClick={() => {
                  const next = !sbAuto;
                  setSbAuto(next);
                  sbLog(next ? "Piloto automático ACTIVADO: el sandbox se maneja solo." : "Piloto automático desactivado: control manual.");
                  if (next && !sbOnlineRef.current) sandboxAutoPilot();
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold text-[11px] border transition-all ${
                  sbAuto
                    ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-900/30"
                    : "bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-700"
                }`}
                title="Piloto automático: sincroniza, instala dependencias, arranca el puerto 3500 y mantiene el preview vivo sin que toques nada"
              >
                <Zap className={`w-3 h-3 ${sbAuto ? "text-amber-400" : "text-zinc-500"}`} />
                AUTO {sbAuto ? "ON" : "OFF"}
              </button>

              {/* 🔧 Botón SYNC prominente en la pestaña Sandbox
                  Escribe los archivos del workspace al disco (.proyectos).
                  Es OBLIGATORIO antes de "Arrancar ahora" si no hay package.json. */}
              {onSyncProject && (
                <button
                  onClick={async () => {
                    sbLog("SYNC · Escribiendo archivos del editor al disco del sandbox…");
                    try {
                      const written = await onSyncProject();
                      const count = typeof written === "number" ? written : "?";
                      // v8.0.4 — La ruta ABSOLUTA y la raíz donde el motor ha
                      // reconocido el proyecto. Con «.proyectos/» a secas no se puede
                      // verificar nada; con la ruta completa, un solo Sync zanja la
                      // duda de si el archivo aterrizó donde el detector mira.
                      const st = await refreshSandboxStatus();
                      const raizAbs = (st as any)?.raizSandbox || ".proyectos";
                      const raizProy = (st as any)?.raizProyectoResuelta;
                      sbLog(`SYNC · ${count} archivo(s) escrito(s) en ${raizAbs}`);
                      if (raizProy && raizProy !== raizAbs) {
                        sbLog(`SYNC · Proyecto reconocido en: ${raizProy}`);
                      }
                      // Si ahora hay proyecto pero no está instalado, sugerir npm install
                      if (st?.hasProject && !st?.installed) {
                        sbLog("SYNC · Proyecto detectado. Ejecuta 'npm install' y luego 'Arrancar ahora'.");
                      } else if (st?.hasProject && st?.installed) {
                        sbLog("SYNC · Proyecto listo. Clic en 'Arrancar ahora' para levantar el sandbox.");
                      } else if (!st?.hasProject) {
                        // Aquí antes no se decía NADA cuando el sync funcionaba pero
                        // no había proyecto: el usuario veía «1 archivo escrito» y
                        // el botón no arrancaba, sin más explicación.
                        const contenido: string[] = Array.isArray((st as any)?.contenidoRaiz) ? (st as any).contenidoRaiz : [];
                        sbLog(
                          `SYNC · ⚠️ No hay proyecto reconocible ahí. Contenido: ` +
                            (contenido.length ? contenido.join(", ") : "vacío o ilegible") +
                            ". Sirve un index.html (web estática, sin npm) o package.json/requirements.txt/Cargo.toml/go.mod/…"
                        );
                      }
                      // v8.0.5 — Proyecto duplicado: se avisa AUNQUE haya proyecto
                      // en la raíz, porque es el caso en que todo parece bien y el
                      // preview sigue enseñando lo viejo. Un aviso que solo sale
                      // cuando ya hay error no sirve para este caso.
                      const duplicado = (st as any)?.avisoProyectoDuplicado;
                      if (duplicado) sbLog(`SYNC · ⚠️ PROYECTO DUPLICADO: ${duplicado}`);
                    } catch (e: any) {
                      sbLog(`SYNC · Error: ${e?.message || e}`);
                    }
                  }}
                  disabled={!!sbBusy || files.length === 0}
                  className="flex items-center gap-1 px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 disabled:opacity-40 disabled:cursor-not-allowed text-cyan-300 border border-cyan-500/40 rounded-md font-medium text-[11px] transition-all shrink-0"
                  title="SYNC: escribir archivos del workspace al disco del sandbox (.proyectos). Necesario antes de arrancar si no hay package.json."
                >
                  <Download className="w-3 h-3" />
                  Sync
                </button>
              )}

              {/* Mostrar advertencia clara si el workspace del editor está vacío */}
              {files.length === 0 && (
                <span className="text-[10px] text-amber-400 font-mono px-2 py-1 bg-amber-950/40 border border-amber-700/40 rounded-md shrink-0">
                  ⚠️ Editor vacío — usa "Plantilla" o "Abrir .cn"
                </span>
              )}

              {onPullProject && (
                <button
                  onClick={onPullProject}
                  disabled={!!sbBusy}
                  className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 border border-zinc-700 rounded-md font-medium text-[11px] transition-all shrink-0"
                  title="PULL: traer del disco del sandbox al editor los archivos que el agente creó"
                >
                  <FolderOpen className="w-3 h-3" />
                  Pull
                </button>
              )}

              {sbInstalled ? null : (
                <button
                  onClick={handleSandboxInstall}
                  disabled={!!sbBusy || !sbHasProject}
                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/30 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 border border-amber-500/40 rounded-md font-medium text-[11px] transition-all shrink-0"
                  title="Sincronizar archivos y ejecutar npm install en el sandbox (manual)"
                >
                  {sbBusy === "install" ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  npm install
                </button>
              )}

              <button
                onClick={handleSandboxStart}
                disabled={!!sbBusy}
                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-40 text-emerald-300 border border-emerald-500/40 rounded-md font-medium text-[11px] transition-all"
                title="Arranque manual: sincroniza el workspace y levanta npm run dev en el puerto 3500 (con AUTO ON no hace falta tocarlo)"
              >
                {sbBusy === "start" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                {sbOnline ? "Reiniciar preview" : "Arrancar ahora"}
              </button>

              <button
                onClick={handleSandboxStop}
                disabled={!!sbBusy}
                className="flex items-center gap-1 px-2.5 py-1 bg-red-600/20 hover:bg-red-600/30 disabled:opacity-40 text-red-300 border border-red-500/40 rounded-md font-medium text-[11px] transition-all"
                title="Detener el servidor del sandbox"
              >
                {sbBusy === "stop" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Square className="w-3 h-3" />
                )}
                Detener
              </button>

              <button
                onClick={() => setIframeKey((k) => k + 1)}
                className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 border border-zinc-700 rounded-md font-medium text-[11px] transition-all"
                title="Recargar el preview (reinicia el iframe)"
                disabled={!sbOnline}
              >
                <RotateCw className="w-3 h-3" />
                Recargar
              </button>

              {/* 🔧 FIX "imagen blanca atascada": botón Forzar Cierre que:
                  1. Detiene el sandbox (mata el proceso npm run dev en :3500)
                  2. Vacía el src del iframe (destrucción completa del contexto)
                  3. Reinicia la key del iframe (remount limpio)
                  4. Re-chequea el estado real del puerto 3500
                  Esto mata cualquier página blanca atascada sin respuesta. */}
              <button
                onClick={async () => {
                  if (forzandoRef.current) return; // FUERZA v1: sin guardia, cada clic extra reiniciaba el ciclo completo (tormenta de logs + remontajes)
                  forzandoRef.current = true;
                  try {
                  sbLog("FORCE · Cerrando sandbox + destruyendo iframe (fix imagen fantasma)…");
                  // 1. Detener el sandbox (mata el proceso npm run dev en :3500)
                  try {
                    await fetch("/api/sandbox/stop", { method: "POST" });
                  } catch {}
                  // 2. Marcar como offline y destruir el iframe (vaciar src primero)
                  setSbOnline(false);
                  sbOnlineRef.current = false;
                  setIframeSrc(""); // 🔧 vaciar el src para destruir el contexto del iframe
                  setIframeKey((k) => k + 1); // remontar el iframe limpio
                  setPhase("idle");
                  // 3. Esperar 800ms y re-chequear
                  await new Promise((r) => setTimeout(r, 800));
                  await refreshSandboxStatus();
                  sbLog("FORCE · Iframe destruido y remontado. Usa 'Arrancar ahora' si quieres volver a cargarlo.");
                  } finally { forzandoRef.current = false; }
                }}
                className="flex items-center gap-1 px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/50 rounded-md font-medium text-[11px] transition-all"
                title="Forzar cierre del sandbox: detiene el proceso, VACÍA el iframe (destrucción completa) y lo remonta limpio. Arregla la imagen blanca fantasma."
              >
                <Power className="w-3 h-3" />
                Forzar Limpieza
              </button>

              <button
                onClick={openSandboxExternal}
                className="flex items-center gap-1 px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 disabled:opacity-40 text-cyan-300 border border-cyan-500/40 rounded-md font-medium text-[11px] transition-all"
                title="Abrir la app del sandbox en el navegador"
                disabled={!sbOnline}
              >
                <ExternalLink className="w-3 h-3" />
                Abrir
              </button>
            </div>

            {sbLogs.length > 0 && (
              <div className="max-h-16 overflow-y-auto custom-scrollbar bg-[#04060d] border border-[#131c2c] rounded-md px-2 py-1 font-mono text-[10px] leading-relaxed text-zinc-400">
                {sbLogs.map((l, i) => (
                  <div key={i} className="whitespace-pre-wrap break-words">
                    {l}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview iframe o estado vacío */}
          {sbOnline ? (
            <iframe
              key={iframeKey}
              src={iframeSrc || SANDBOX_URL}
              className="flex-1 w-full bg-white"
              title="Sandbox Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-400">
              <div className="p-5 bg-[#070b16] border border-[#172238] rounded-2xl max-w-sm shadow-2xl">
                {sbBusy === "auto" ? (
                  <>
                    <Loader2 className="w-8 h-8 text-amber-400 mx-auto mb-3 animate-spin" />
                    <h4 className="text-sm font-semibold text-zinc-100 mb-1">Piloto automático trabajando…</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed mb-1">
                      {sbPhase === "sync" && "Sincronizando tus archivos del editor al sandbox…"}
                      {sbPhase === "install" && "Instalando dependencias (solo la primera vez)…"}
                      {(sbPhase === "start" || sbPhase === "wait") && "Levantando tu app en el puerto 3500…"}
                    </p>
                    <p className="text-[10px] text-zinc-500 font-mono">No toques nada: el preview aparece solo.</p>
                  </>
                ) : (
                  <>
                    <Eye className="w-8 h-8 text-cyan-400 mx-auto mb-3" />
                    <h4 className="text-sm font-semibold text-zinc-100 mb-1">Sandbox automático</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                      {sbAuto
                        ? "El piloto automático está activo: al entrar aquí se sincroniza, instala y arranca tu proyecto en :3500 sin clicks. Si se cae, se re-levanta solo."
                        : "Piloto automático apagado. Actívalo y el sandbox se maneja solo: sincroniza, instala, arranca en :3500 y mantiene el preview vivo."}
                    </p>
                    {sbAuto ? (
                      <button
                        onClick={sandboxAutoPilot}
                        disabled={!!sbBusy}
                        className="px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 text-amber-300 border border-amber-500/50 rounded-lg font-medium text-xs shadow transition-colors flex items-center gap-1.5 mx-auto"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        Activar ahora
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setSbAuto(true);
                          sbLog("Piloto automático ACTIVADO: el sandbox se maneja solo.");
                          setTimeout(sandboxAutoPilot, 50);
                        }}
                        disabled={!!sbBusy}
                        className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg font-medium text-xs shadow transition-colors flex items-center gap-1.5 mx-auto"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        Activar piloto automático
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          TAB CONTENT: EDITOR CON ÁRBOL DE ARCHIVOS VERTICAL
          ============================================================ */}
      {activeTab === "editor" && (
        <div className="flex-1 flex overflow-hidden bg-[#030509]">
          {/* ---- EXPLORADOR VERTICAL (columna izquierda) ---- */}
          <div
            style={{ width: `${explorerWidth}px` }}
            className="shrink-0 bg-[#05080f] flex flex-col overflow-hidden"
          >
            <div className="h-9 px-2 flex items-center justify-between border-b border-[#10182a] shrink-0">
              <span className="text-[10px] uppercase font-bold text-cyan-300 tracking-wider flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5" />
                Explorador
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">{files.length}</span>
            </div>

            {/* ACCIONES DEL EXPLORADOR: adjuntar + borrar todo + restaurar plantilla + .cn */}
            <div className="flex items-center gap-1 px-1.5 pt-1.5 shrink-0">
              <button
                onClick={() => attachInputRef.current?.click()}
                className="flex-1 px-1.5 py-1.5 text-[10px] font-semibold text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/10 border border-cyan-800/60 hover:border-cyan-600 rounded-md transition-colors flex items-center justify-center gap-1"
                title="Adjuntar archivos de CUALQUIER tipo (zip, pdf, imágenes, código...) — los zip se extraen solos"
              >
                <Paperclip className="w-3 h-3" />
                Adjuntar
              </button>
              <button
                onClick={() => {
                  if (files.length === 0) return;
                  // v1.6.23 — RESCATE v1: el confirm dice la verdad completa.
                  // Este botón también nuklea .proyectos (automatizado en
                  // handleDeleteAllFiles → /api/fs/nuclear-wipe), y el motor
                  // primero muda el estado de CerebroNico antes de borrar.
                  if (window.confirm(`¿Borrar TODOS los ${files.length} archivos del workspace?\nEl workspace quedará vacío y TAMBIÉN se vaciará el sandbox (.proyectos al completo, node_modules incluido): así no queda ninguna app pegada que el :3500 siga reproduciendo.\nEl estado de CerebroNico (conocimiento, espejos, bóveda, MEMORIA/skills) se MUDA primero a la carpeta de la app; si el rescate fallara, el borrado se ABORTA y se avisa.\nPodrás restaurar la plantilla base con el botón "Restaurar plantilla".`)) {
                    onDeleteAllFiles();
                  }
                }}
                className="flex-1 px-1.5 py-1.5 text-[10px] font-semibold text-red-400/90 hover:text-red-300 hover:bg-red-500/10 border border-red-900/60 hover:border-red-600 rounded-md transition-colors flex items-center justify-center gap-1"
                title="Borra el workspace y VACÍA EL SANDBOX (.proyectos) — el estado de CerebroNico se muda antes, no se borra"
              >
                <Trash2 className="w-3 h-3" />
                Borrar todo
              </button>
              <input
                ref={attachInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  if (picked.length > 0) onAttachFiles(picked);
                  e.target.value = ""; // permite re-adjuntar el mismo archivo
                }}
              />
            </div>

            {/* 🔧 Segunda fila: Restaurar plantilla + Exportar .cn + Importar .cn
                🐞 v2.0 — "esos botones volando por encima de la otra pestaña":
                los tres botones con texto ("Plantilla", ".cn", "Abrir .cn") no
                caben en el panel estrecho y se desbordaban FUERA de su recuadro,
                pisando la barra de pestañas. Ahora la fila hace flex-wrap (bajan a
                una segunda línea dentro del panel) y cada botón puede encogerse. */}
            <div className="flex flex-wrap items-center gap-1 px-1.5 pt-1 shrink-0 min-w-0 overflow-hidden">
              {onRestoreTemplate && (
                <button
                  onClick={() => {
                    if (files.length > 0) {
                      if (!window.confirm(`¿Restaurar la plantilla base? Se añadirán package.json, MEMORIA.md, skills.md, README.md y server.ts al workspace actual (${files.length} archivos existentes).`)) return;
                    }
                    onRestoreTemplate();
                  }}
                  className="flex-1 px-1.5 py-1.5 text-[10px] font-semibold text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/10 border border-emerald-800/60 hover:border-emerald-600 rounded-md transition-colors flex items-center justify-center gap-1"
                  title="Restaurar la plantilla base (package.json, MEMORIA.md, skills.md, README.md, server.ts)"
                >
                  <FilePlus2 className="w-3 h-3" />
                  Plantilla
                </button>
              )}
              {onExportCnFile && (
                <button
                  onClick={onExportCnFile}
                  className="flex-1 px-1.5 py-1.5 text-[10px] font-semibold text-white bg-emerald-600/80 hover:bg-emerald-500 border border-emerald-500 rounded-md transition-colors flex items-center justify-center gap-1 shadow-sm"
                  title={`Guardar workspace en archivo .${IDE_BRAND.EXTENSION} (contenedor ZIP con todos los archivos + manifest.json). Preguntará el nombre del archivo. Adentro entra cualquier tipo: código, imágenes, PDFs, etc.`}
                >
                  <Download className="w-3 h-3" />
                  .{IDE_BRAND.EXTENSION}
                </button>
              )}
              {onImportCnFile && (
                <button
                  onClick={() => cnImportInputRef.current?.click()}
                  className="flex-1 px-1.5 py-1.5 text-[10px] font-semibold text-violet-300 hover:text-violet-200 hover:bg-violet-500/10 border border-violet-800/60 hover:border-violet-600 rounded-md transition-colors flex items-center justify-center gap-1"
                  title={`Abrir archivo .${IDE_BRAND.EXTENSION} (también acepta .zip y .json). Restaura el workspace completo desde un contenedor ZIP.`}
                >
                  <FolderOpen className="w-3 h-3" />
                  Abrir .{IDE_BRAND.EXTENSION}
                </button>
              )}
              <input
                ref={cnImportInputRef}
                type="file"
                accept={`.${IDE_BRAND.EXTENSION},.zip,.json,application/zip,application/json,application/x-zip-compressed`}
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked && onImportCnFile) onImportCnFile(picked);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="p-1.5 shrink-0">
              <div className="relative">
                <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1.5" />
                <input
                  type="text"
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  placeholder="Filtrar archivos…"
                  className="w-full bg-[#0c1220] border border-zinc-800 rounded-md pl-6 pr-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-1 pb-2">
              {filteredTree
                ? filteredTree.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => onSelectFile(f.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-md flex items-center gap-1.5 text-xs transition-colors ${
                        activeFile?.id === f.id
                          ? "bg-cyan-500/15 text-cyan-300"
                          : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                      }`}
                      title={f.path}
                    >
                      {getFileIcon(f.path)}
                      <span className="truncate font-mono flex-1">{f.path}</span>
                    </button>
                  ))
                : fileTree.map((node) => (
                    <FileRow
                      key={node.path + (node.isFolder ? "/" : "")}
                      node={node}
                      depth={0}
                      activeFileId={activeFileId}
                      collapsed={collapsedFolders}
                      toggleFolder={toggleFolder}
                      onSelect={onSelectFile}
                      onClose={onCloseFile}
                    />
                  ))}
              {filteredTree && filteredTree.length === 0 && (
                <div className="text-zinc-600 text-[11px] px-2 py-3">Sin coincidencias.</div>
              )}
            </div>

            <button
              onClick={onCreateNewFile}
              className="m-1.5 mt-0 px-2 py-1.5 text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800/80 rounded-md border border-dashed border-zinc-700 transition-colors flex items-center justify-center gap-1 text-[11px] shrink-0"
              title="Crear nuevo archivo en el workspace"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo archivo
            </button>
          </div>

          {/* ---- DESPLAZADOR: redimensiona el árbol de archivos ---- */}
          <div
            onMouseDown={startExplorerDrag}
            onDoubleClick={() => setExplorerWidth(EXPLORER_LIMITS.DEFAULT)}
            className="w-[6px] shrink-0 cursor-col-resize bg-[#0a1018] hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors flex items-center justify-center group"
            title="Arrastra para ensanchar o estrechar el árbol de archivos · doble clic para restablecer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar el árbol de archivos"
          >
            <div className="w-[2px] h-10 rounded-full bg-zinc-700 group-hover:bg-cyan-300 transition-colors" />
          </div>

          {/* ---- COLUMNA DEL EDITOR ---- */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Cabecera del archivo activo */}
            <div className="h-10 bg-[#060912] border-b border-[#141d2e] flex items-center px-3 gap-2 shrink-0">
              {activeFile ? (
                <>
                  {getFileIcon(activeFile.path)}
                  <span className="truncate font-mono text-xs text-zinc-200 flex-1" title={activeFile.path}>
                    {activeFile.path}
                    {activeFile.modified && (
                      <span className="ml-2 text-amber-400 text-[10px]">● modificado</span>
                    )}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                    {Math.round(activeFile.size / 1024)} KB
                  </span>
                  <button
                    onClick={handleDownloadSingleFile}
                    className="p-1.5 bg-zinc-850 hover:bg-zinc-750 text-zinc-300 hover:text-emerald-300 rounded border border-zinc-700 transition-all"
                    title="Descargar este archivo"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    onClick={handleCopyCode}
                    className="p-1.5 bg-zinc-850 hover:bg-zinc-750 text-zinc-300 hover:text-cyan-300 rounded border border-zinc-700 transition-all flex items-center gap-1"
                    title="Copiar código al portapapeles"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </>
              ) : (
                <span className="text-zinc-500 text-xs">Sin archivo activo</span>
              )}
            </div>

            {activeFile ? (
              <CodeEditor
                file={activeFile}
                onUpdateContent={onUpdateFileContent}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
                <FileCode className="w-10 h-10 text-zinc-600 mb-2" />
                <p>No hay ningún archivo abierto en el editor.</p>
                <button
                  onClick={onCreateNewFile}
                  className="mt-3 px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs"
                >
                  Crear Primer Archivo
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: DELIVERABLES */}
      {activeTab === "deliverables" && (
        <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar bg-[#090d16]/85 backdrop-blur-md">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-zinc-200">Paquete de Entregables</h3>
            <p className="text-xs text-zinc-400">
              Archivos listos para exportar ({files.length}) · dev en puerto 3500 · el ZIP completo se descarga desde el botón verde «Descargar ZIP» de la barra superior y cada archivo individual desde el editor
            </p>
          </div>

          <div className="space-y-1.5">
            {files.map((f) => (
              <div
                key={f.id}
                onClick={() => {
                  onSelectFile(f.id);
                  setActiveTab("editor");
                }}
                className="flex items-center justify-between p-2.5 bg-zinc-900/70 border border-zinc-800 rounded-lg hover:border-cyan-500/40 cursor-pointer transition-colors"
                title={`Abrir ${f.path} en el editor`}
              >
                <div className="flex items-center gap-2 truncate">
                  {getFileIcon(f.path)}
                  <span className="font-mono text-xs text-zinc-200 truncate">{f.path}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-zinc-400 font-mono">{Math.round(f.size / 1024)} KB</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteFile(f.id);
                    }}
                    className="p-1 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 rounded transition-colors"
                    title="Eliminar archivo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🔧 Pestaña Skills (100) ELIMINADA de la UI.
          Las 100 skills viven dentro del motor (contextCache.ts las inyecta
          al system prompt en el turno 1 como mensajes ocultos). No es necesario
          verlas como panel separado — el usuario puede pedirlas por chat:
          "lista las skills", "activa la skill de parsing", etc. */}

      {/* TAB CONTENT: TERMINAL / LOGS */}
      {activeTab === "terminal" && (
        <div className="flex-1 flex flex-col bg-[#020306] overflow-hidden">
          {/* Terminal toolbar */}
          <div className="h-9 bg-[#060912] border-b border-[#141d2e] px-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="text-cyan-400 font-bold">TERMINAL</span>
              <span className="text-zinc-600 text-[10px] hidden sm:inline">sandbox real · .proyectos</span>
            </div>
            <div className="flex items-center gap-1">
              {onSyncProject && (
                <button
                  onClick={() => onSyncProject()}
                  className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 text-[10px] font-mono transition-colors"
                  title="Escribir archivos del workspace en el disco del sandbox"
                >
                  <Download className="w-3 h-3" />
                  Sync
                </button>
              )}
              {onPullProject && (
                <button
                  onClick={onPullProject}
                  className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 text-[10px] font-mono transition-colors"
                  title="Traer del sandbox al editor los archivos que el agente creó"
                >
                  <FolderOpen className="w-3 h-3" />
                  Pull
                </button>
              )}
              {onBuildProject && (
                <button
                  onClick={onBuildProject}
                  className="flex items-center gap-1 px-2 py-1 bg-cyan-800 hover:bg-cyan-700 text-cyan-100 rounded border border-cyan-600 text-[10px] font-mono transition-colors"
                  title="Compilar y corregir automáticamente (bucle autónomo)"
                >
                  <Play className="w-3 h-3" />
                  Compilar
                </button>
              )}
            </div>
          </div>

          {/* Output area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 font-mono text-[11px] leading-relaxed text-zinc-300">
            <div className="text-zinc-500 mb-1">=== TELEMETRÍA Y LOGS ===</div>
            {terminalLogs.length === 0 ? (
              <div className="text-zinc-600">Sin registros del sistema.</div>
            ) : (
              terminalLogs.map((log, i) => (
                <div key={`sys-${i}`} className="py-0.5 text-zinc-500">
                  {log}
                </div>
              ))
            )}
            <div className="text-zinc-500 mt-2 mb-1 border-t border-zinc-800 pt-2">=== COMANDOS ===</div>
            {termLines.length === 0 && (
              <div className="text-zinc-600">Escribe un comando abajo (ej: ls, node -v, npm run build).</div>
            )}
            {termLines.map((line, i) => (
              <div
                key={`t-${i}`}
                className={`whitespace-pre-wrap break-words ${
                  line.startsWith("$ ")
                    ? "text-cyan-300"
                    : line.startsWith("[exit") || line.startsWith("[error")
                    ? "text-red-400"
                    : "text-zinc-300"
                }`}
              >
                {line}
              </div>
            ))}
            <div ref={termEndRef} />
          </div>

          {/* Command input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runCommand();
            }}
            className="h-9 bg-[#060912] border-t border-[#141d2e] flex items-center gap-2 px-2 shrink-0 font-mono"
          >
            <span className="text-emerald-400 text-[11px]">$</span>
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  if (cmdHistory.length > 0) {
                    const idx = historyIdx < 0 ? 0 : Math.min(historyIdx + 1, cmdHistory.length - 1);
                    setHistoryIdx(idx);
                    setCommandInput(cmdHistory[idx]);
                  }
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  if (historyIdx >= 0) {
                    const idx = historyIdx - 1;
                    setHistoryIdx(idx);
                    setCommandInput(idx < 0 ? "" : cmdHistory[idx]);
                  }
                }
              }}
              placeholder="ls / node -v / npm run build / python x.py..."
              className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-600 outline-none text-[11px]"
              disabled={isRunning}
            />
            <button
              type="submit"
              disabled={isRunning || !commandInput.trim()}
              className="p-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded transition-colors"
              title="Ejecutar comando"
            >
              {isRunning ? (
                <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>
          </form>
        </div>
      )}
    </aside>
  );
};
