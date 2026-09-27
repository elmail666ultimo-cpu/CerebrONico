/**
 * CenterTabs.tsx — Pestañas centrales de la IDE (v2.0)
 * ===================================================
 * Convierte el Chat en UNA pestaña más, al mismo nivel que el Editor web y que
 * cada panel de extensión. Es lo que pedías: que las herramientas externas
 * "abran en una pestaña tipo chat" en vez de sustituir la interfaz.
 *
 *   [ 💬 Chat ] [ 🌐 Editor web ] [ 🧩 Mi extensión × ] [ ＋ ]
 *
 * Detalles de usabilidad:
 *  - La pestaña activa se recuerda entre sesiones (lo gestiona App.tsx).
 *  - Cada pestaña se puede cerrar (menos el Chat, que es el ancla de la IDE).
 *  - Botón de pantalla completa por pestaña: el contenedor entra en fullscreen
 *    nativo, así el editor web o una extensión ocupan toda la pantalla.
 *  - Con muchas pestañas, la barra hace scroll horizontal sin romper el layout.
 */
import React from "react";
import { MessageSquare, Globe, Puzzle, Plus, X, Maximize2, Minimize2, TerminalSquare } from "lucide-react";

export type CenterTabKind = "chat" | "web-editor" | "extension" | "custom";

export interface CenterTab {
  id: string;
  label: string;
  kind: CenterTabKind;
  /** Id de la extensión cuando kind === "extension" */
  extensionId?: string;
  /** No se puede cerrar (el Chat) */
  pinned?: boolean;
  /** Muestra el punto de actividad (p. ej. la extensión está trabajando) */
  busy?: boolean;
}

const KIND_ICON: Record<CenterTabKind, React.ElementType> = {
  chat: MessageSquare,
  "web-editor": Globe,
  extension: Puzzle,
  custom: TerminalSquare,
};

interface Props {
  tabs: CenterTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab?: () => void;
  /** Pantalla completa del contenido (no de la ventana entera) */
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  /** Zona derecha: estado del modelo, tokens, etc. */
  right?: React.ReactNode;
}

export function CenterTabBar({ tabs, activeId, onSelect, onClose, onNewTab, onToggleFullscreen, isFullscreen, right }: Props) {
  return (
    <div className="flex items-center gap-1 px-2 h-9 border-b border-[#141d2e] bg-[#0a0f1a]/90 shrink-0 overflow-x-auto custom-scrollbar">
      {tabs.map((tab) => {
        const Icon = KIND_ICON[tab.kind];
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            role="tab"
            aria-selected={active}
            title={tab.label}
            className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-t text-xs cursor-pointer whitespace-nowrap border-b-2 transition-colors ${
              active
                ? "bg-[#0d121c] text-cyan-300 border-cyan-500"
                : "text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-[#0d121c]/60"
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${tab.kind === "extension" ? "text-fuchsia-400" : ""}`} />
            <span className="max-w-[160px] truncate">{tab.label}</span>
            {tab.busy && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
            {!tab.pinned && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                className="ml-0.5 rounded p-0.5 text-zinc-500 hover:text-red-300 hover:bg-red-500/10 opacity-0 group-hover:opacity-100"
                title="Cerrar pestaña"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}

      {onNewTab && (
        <button
          onClick={onNewTab}
          className="p-1 rounded text-zinc-500 hover:text-cyan-300 hover:bg-[#0d121c]"
          title="Abrir una extensión en una pestaña nueva"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}

      <div className="flex-1" />

      {onToggleFullscreen && (
        <button
          onClick={onToggleFullscreen}
          className="p-1 rounded text-zinc-400 hover:text-cyan-300 hover:bg-[#0d121c] shrink-0"
          title={isFullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa de esta pestaña (F11)"}
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      )}
      {right && <div className="shrink-0 pl-2 text-[11px] text-zinc-500">{right}</div>}
    </div>
  );
}
