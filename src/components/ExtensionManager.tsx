/**
 * ExtensionManager.tsx — Gestor de extensiones (v2.0)
 * ===================================================
 * Ventana donde se ven las extensiones instaladas, qué permisos piden, qué
 * aportan (pestañas, comandos, herramientas) y desde donde se abre cada una
 * COMO PESTAÑA junto al chat, se habilita/deshabilita, se instala un ZIP y se
 * desinstala.
 *
 * Decisión de seguridad visible al usuario: los permisos se muestran ANTES de
 * activar nada, porque una extensión con "workspace.write" puede modificar los
 * archivos del proyecto (dentro del sandbox) y con "workspace.exec" puede
 * ejecutar comandos.
 */
import { useRef, useState } from "react";
import { X, Puzzle, Play, Power, Trash2, Upload, RefreshCw, ShieldAlert, Route, Wrench } from "lucide-react";
import type { ExtensionInfo } from "../utils/extensionHost";
import { PluginForge } from "./PluginForge"; // FORJA v1

interface Props {
  open: boolean;
  extensions: ExtensionInfo[];
  onClose: () => void;
  onReload: () => void;
  onToggle: (id: string, enabled: boolean) => void;
  onInstall: (file: File) => Promise<{ ok: boolean; message: string }>;
  onUninstall: (id: string) => void;
  onOpenPanel: (ext: ExtensionInfo, panelIndex?: number) => void;
}

export function ExtensionManager({ open, extensions, onClose, onReload, onToggle, onInstall, onUninstall, onOpenPanel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [forjando, setForjando] = useState(false); // FORJA v1
  if (!open) return null;

  const handleInstall = async (file: File) => {
    setBusy(true);
    setMessage(null);
    const res = await onInstall(file);
    setBusy(false);
    setMessage({ ok: res.ok, text: res.message });
  };

  if (forjando)
    return <PluginForge onClose={() => setForjando(false)} onForjado={async () => { setForjando(false); await onReload(); }} />;

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="cn-modal bg-[#0a0f1a] border border-[#162034] rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#162034] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Puzzle className="w-4 h-4 text-fuchsia-400 shrink-0" />
            <span className="text-sm font-semibold text-zinc-100">Extensiones</span>
            <span className="text-[11px] text-zinc-500">
              Cada una se abre en su propia pestaña, al lado del Chat
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onReload}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#0d121c] border border-[#162034] text-[11px] text-zinc-400 hover:text-cyan-300"
              title="Volver a escanear la carpeta extensions/"
            >
              <RefreshCw className="w-3 h-3" /> Recargar
            </button>
            <button
              onClick={() => setForjando(true)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/20 border border-emerald-500/40 text-[11px] text-emerald-200 hover:bg-emerald-600/30"
              title="FORJA v1 — el IDE compone el complemento: tú pones la receta"
            >
              <Wrench className="w-3 h-3" /> Forjar
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1 px-2 py-1 rounded bg-fuchsia-600/20 border border-fuchsia-500/40 text-[11px] text-fuchsia-200 hover:bg-fuchsia-600/30 disabled:opacity-50"
              title="Instalar una extensión desde un ZIP con manifest.json"
            >
              <Upload className="w-3 h-3" /> {busy ? "Instalando…" : "Instalar .zip"}
            </button>
            <button onClick={onClose} className="p-1 rounded text-zinc-500 hover:text-red-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleInstall(f);
            e.target.value = "";
          }}
        />

        {message && (
          <div className={`px-4 py-2 text-xs border-b ${message.ok ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/30" : "bg-red-500/10 text-red-200 border-red-500/30"}`}>
            {message.text}
          </div>
        )}

        <div className="p-4 overflow-y-auto custom-scrollbar space-y-3">
          {extensions.length === 0 && (
            <div className="text-center text-sm text-zinc-500 py-8 leading-relaxed">
              No hay extensiones instaladas.<br />
              Copia una carpeta con <code className="text-cyan-300">manifest.json</code> dentro de{" "}
              <code className="text-cyan-300">extensions/</code> (hay un ejemplo en{" "}
              <code className="text-cyan-300">extensions/cerebronico.panel-ejemplo</code>) o instala un ZIP.
            </div>
          )}

          {extensions.map((ext) => {
            const m = ext.manifest;
            const panels = m.contributes?.panels || [];
            const commands = m.contributes?.commands || [];
            const tools = m.contributes?.tools || [];
            return (
              <div key={m.id} className="rounded-lg border border-[#162034] bg-[#070b14] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-zinc-100 font-medium truncate">{m.name}</span>
                      <span className="text-[11px] text-zinc-500">v{m.version}</span>
                      <span className="text-[11px] font-mono text-zinc-600">{m.id}</span>
                      {!ext.enabled && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-700/40 text-zinc-400 border border-zinc-600/40">
                          deshabilitada
                        </span>
                      )}
                      {ext.error && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/30 flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3" /> {ext.error}
                        </span>
                      )}
                    </div>
                    {m.description && <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{m.description}</p>}
                    {m.author && <p className="text-[11px] text-zinc-600 mt-0.5">por {m.author}</p>}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onOpenPanel(ext)}
                      disabled={!ext.enabled || !!ext.error}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-cyan-600/20 border border-cyan-500/40 text-[11px] text-cyan-200 hover:bg-cyan-600/30 disabled:opacity-40"
                      title="Abrir en una pestaña junto al Chat"
                    >
                      <Play className="w-3 h-3" /> Abrir
                    </button>
                    <button
                      onClick={() => onToggle(m.id, !ext.enabled)}
                      className={`flex items-center gap-1 px-2 py-1 rounded border text-[11px] ${
                        ext.enabled
                          ? "bg-[#0d121c] border-[#162034] text-zinc-400 hover:text-amber-300"
                          : "bg-emerald-600/20 border-emerald-500/40 text-emerald-200"
                      }`}
                      title={ext.enabled ? "Deshabilitar (no se cargarán sus herramientas)" : "Habilitar"}
                    >
                      <Power className="w-3 h-3" /> {ext.enabled ? "Deshabilitar" : "Habilitar"}
                    </button>
                    <button
                      onClick={() => onUninstall(m.id)}
                      className="p-1 rounded text-zinc-500 hover:text-red-300 hover:bg-red-500/10"
                      title="Desinstalar (borra la carpeta)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  {panels.length > 0 && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-200 border border-violet-500/30">
                      <Route className="w-3 h-3" /> {panels.length} pestaña(s): {panels.map((p) => p.title).join(", ")}
                    </span>
                  )}
                  {commands.length > 0 && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-200 border border-cyan-500/30">
                      /{commands.map((c) => c.slash || c.id.split(".").pop()).join(", /")}
                    </span>
                  )}
                  {tools.length > 0 && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-200 border border-emerald-500/30" title={tools.map((t) => `${t.name}: ${t.description}`).join("\n")}>
                      <Wrench className="w-3 h-3" /> {tools.length} herramienta(s) para el modelo
                    </span>
                  )}
                </div>

                {(m.permissions || []).length > 0 && (
                  <div className="mt-2 text-[11px] text-zinc-500">
                    <span className="text-zinc-400">Permisos:</span>{" "}
                    {(m.permissions || []).map((p) => (
                      <code key={p} className={`mr-1.5 ${p.includes("write") || p.includes("exec") ? "text-amber-300" : "text-cyan-300"}`}>
                        {p}
                      </code>
                    ))}
                    <span className="block mt-0.5 text-zinc-600">
                      Los permisos se comprueban en la IDE: la extensión no puede leer ni escribir nada que no se le haya
                      concedido aquí.
                    </span>
                  </div>
                )}
                {ext.warnings && ext.warnings.length > 0 && (
                  <div className="mt-1 text-[11px] text-amber-300/80">{ext.warnings.join(" ")}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
