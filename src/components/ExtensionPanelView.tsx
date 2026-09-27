/**
 * ExtensionPanelView.tsx — Host de una extensión dentro de una pestaña (v2.0)
 * ==========================================================================
 * Cada extensión se ejecuta en un <iframe sandbox> aislado y se comunica con la
 * IDE por postMessage. Este componente:
 *   1. Sirve el HTML de la extensión desde /extensions/<id>/<entry>.
 *   2. Atiende sus peticiones comprobando PERMISOS de este lado.
 *   3. Le inyecta los datos del manifiesto y las capacidades concedidas.
 *
 * El iframe lleva `sandbox="allow-scripts"` SIN `allow-same-origin` a propósito:
 * así la extensión no puede tocar el DOM del IDE ni leer su localStorage. Como
 * consecuencia no puede usar fetch a rutas relativas de la IDE, y por eso TODA
 * comunicación pasa por el puente (que es lo que queremos).
 */
import { useEffect, useRef, useState } from "react";
import { Puzzle, RefreshCw, ShieldAlert } from "lucide-react";
import type { ExtensionInfo } from "../utils/extensionHost";
import { extensionAssetUrl } from "../utils/extensionHost";
import { registerPanelHost, unregisterPanelHost } from "../utils/extensionBridge";

interface Props {
  extension: ExtensionInfo;
  /** Comando a ejecutar nada más montar (viene de un /comando en el chat) */
  pendingCommandId?: string;
  onChatMessage?: (text: string) => void;
  onLog?: (line: string) => void;
  onError?: (message: string) => void;
  workspaceFiles?: { path: string; content: string }[];
  chatMessages?: { role: string; content: string }[];
}

export function ExtensionPanelView({
  extension,
  pendingCommandId,
  onChatMessage,
  onLog,
  onError,
  workspaceFiles = [],
  chatMessages = [],
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [ready, setReady] = useState(false);
  /** Promesas esperando el resultado de un comando lanzado desde la IDE */
  const pendingInvokes = useRef<
    Map<string, (r: { ok: boolean; result?: any; error?: string }) => void>
  >(new Map());

  const manifest = extension.manifest;
  const permissions = manifest.permissions || [];
  const entryUrl = extensionAssetUrl(extension.dir, manifest.main);

  // Mantenemos los datos frescos en refs: el listener de mensajes no debe
  // reinstalarse en cada token del chat (sería un coste absurdo).
  const filesRef = useRef(workspaceFiles);
  const chatRef = useRef(chatMessages);
  filesRef.current = workspaceFiles;
  chatRef.current = chatMessages;
  const onChatMessageRef = useRef(onChatMessage);
  onChatMessageRef.current = onChatMessage;
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;

    const post = (msg: any) => {
      try {
        win.postMessage({ cn: 1, ...msg }, "*");
      } catch {}
    };

    const handle = async (event: MessageEvent) => {
      const data: any = event.data;
      if (!data || data.cn !== 1) return;
      // Solo aceptamos mensajes del iframe de ESTA extensión
      if (event.source !== iframeRef.current?.contentWindow) return;

      if (data.type === "ready") {
        setReady(true);
        post({
          type: "init",
          manifest,
          permissions,
          apiVersion: "2.0",
          ide: { name: "CerebroNico IDE", version: "2.0" },
        });
        return;
      }

      if (data.type === "log") {
        onLogRef.current?.(`[${manifest.name}] ${String(data.message || "")}`);
        return;
      }
      if (data.type === "error") {
        onErrorRef.current?.(`${manifest.name}: ${String(data.message || "error desconocido")}`);
        return;
      }
      if (data.type === "notify") {
        onLogRef.current?.(`🔔 ${manifest.name}: ${String(data.message || "")}`);
        return;
      }

      // Resultado de un comando que lanzamos nosotros (herramienta del modelo o
      // /comando del chat): resolvemos la promesa que dejó esperando invokeCommand.
      if (data.type === "commandResult") {
        const pending = pendingInvokes.current.get(String(data.commandId));
        if (pending) {
          pendingInvokes.current.delete(String(data.commandId));
          pending({ ok: data.ok !== false, result: data.result, error: data.error });
        }
        return;
      }

      if (data.type === "request") {
        const { id, method, params } = data as { id: string; method: string; params?: any };
        const deny = (p: string) => {
          post({ type: "response", id, ok: false, error: `Permiso "${p}" no concedido a ${manifest.id}.` });
        };
        try {
          switch (method) {
            case "workspace.listFiles": {
              if (!permissions.includes("workspace.read")) return deny("workspace.read");
              post({ type: "response", id, ok: true, result: filesRef.current.map((f) => f.path) });
              return;
            }
            case "workspace.readFile": {
              if (!permissions.includes("workspace.read")) return deny("workspace.read");
              const f = filesRef.current.find((x) => x.path === params?.path);
              post({ type: "response", id, ok: true, result: f?.content ?? "" });
              return;
            }
            case "workspace.getFiles": {
              if (!permissions.includes("workspace.read")) return deny("workspace.read");
              post({ type: "response", id, ok: true, result: filesRef.current });
              return;
            }
            case "workspace.writeFile": {
              if (!permissions.includes("workspace.write")) return deny("workspace.write");
              // Delega en el endpoint del sandbox, que ya valida la ruta
              const res = await fetch("/api/fs/write", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: params?.path, content: params?.content ?? "" }),
              });
              post({ type: "response", id, ok: res.ok, result: res.ok ? "ok" : `HTTP ${res.status}` });
              return;
            }
            case "workspace.exec": {
              if (!permissions.includes("workspace.exec")) return deny("workspace.exec");
              const res = await fetch("/api/exec", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ command: params?.command }),
              });
              const data2 = await res.json().catch(() => ({}));
              post({ type: "response", id, ok: res.ok, result: data2 });
              return;
            }
            case "chat.getMessages": {
              if (!permissions.includes("chat.read")) return deny("chat.read");
              post({ type: "response", id, ok: true, result: chatRef.current });
              return;
            }
            case "chat.sendMessage": {
              if (!permissions.includes("chat.send")) return deny("chat.send");
              onChatMessageRef.current?.(String(params?.text || ""));
              post({ type: "response", id, ok: true, result: "encolado" });
              return;
            }
            default:
              post({ type: "response", id, ok: false, error: `Método no soportado: ${method}` });
              return;
          }
        } catch (err: any) {
          post({ type: "response", id, ok: false, error: err?.message || String(err) });
        }
      }
    };

    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [manifest, permissions, reloadKey]);

  // Comando pendiente (viene de "/comando" escrito en el chat)
  useEffect(() => {
    if (!pendingCommandId) return;
    const win = iframeRef.current?.contentWindow;
    if (!win || !ready) return;
    win.postMessage({ cn: 1, type: "command", commandId: pendingCommandId }, "*");
  }, [pendingCommandId, ready]);

  /**
   * Registro del panel como destino de invocaciones.
   * Gracias a esto, cuando el modelo llama a una herramienta que aporta esta
   * extensión, la llamada llega aquí (vía el sondeo de extensionBridge) y se
   * reenvía al iframe como un comando normal.
   */
  useEffect(() => {
    const invoke = (commandId: string, args?: any) =>
      new Promise<{ ok: boolean; result?: any; error?: string }>((resolve) => {
        const win = iframeRef.current?.contentWindow;
        if (!win) {
          resolve({ ok: false, error: "El panel de la extensión no está montado." });
          return;
        }
        const key = `${commandId}#${Date.now()}`;
        pendingInvokes.current.set(key, resolve);
        win.postMessage({ cn: 1, type: "command", commandId, args, requestId: key }, "*");
        // Sin respuesta en 40 s: se libera al servidor para que no espere más.
        window.setTimeout(() => {
          const p = pendingInvokes.current.get(key);
          if (p) {
            pendingInvokes.current.delete(key);
            p({ ok: false, error: "La extensión no respondió en 40 s." });
          }
        }, 40000);
      });

    registerPanelHost({ extensionId: manifest.id, invokeCommand: invoke });
    return () => unregisterPanelHost(manifest.id);
  }, [manifest.id, reloadKey]);

  if (!entryUrl) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-amber-300 gap-2">
        <ShieldAlert className="w-4 h-4" /> Ruta de entrada no válida en el manifiesto.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#070b14]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#141d2e] bg-[#0a0f1a] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Puzzle className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
          <span className="text-xs text-zinc-300 truncate">{manifest.name}</span>
          <span className="text-[11px] text-zinc-500">v{manifest.version}</span>
          {permissions.length > 0 && (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/30"
              title={permissions.join(", ")}
            >
              {permissions.length} permiso(s)
            </span>
          )}
          {!ready && <span className="text-[11px] text-zinc-500">cargando…</span>}
        </div>
        <button
          onClick={() => {
            setReady(false);
            setReloadKey((k) => k + 1);
          }}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-cyan-300 bg-[#0d121c] border border-[#162034]"
          title="Recargar la extensión"
        >
          <RefreshCw className="w-3 h-3" /> Recargar
        </button>
      </div>
      <iframe
        key={reloadKey}
        ref={iframeRef}
        src={entryUrl}
        title={`Extensión ${manifest.id}`}
        onLoad={() => {
          // Algunas extensiones no envían "ready"; damos el init por si acaso.
          setTimeout(() => {
            try {
              iframeRef.current?.contentWindow?.postMessage(
                { cn: 1, type: "init", manifest, permissions, apiVersion: "2.0" },
                "*"
              );
            } catch {}
          }, 120);
        }}
        sandbox="allow-scripts allow-popups allow-forms allow-modals"
        className="flex-1 w-full border-0 bg-transparent"
      />
    </div>
  );
}
