import React, { useRef, useState, useEffect } from "react";
import {
  Cpu,
  Download,
  FolderOpen,
  HardDrive,
  Key,
  Languages,
  Layers,
  PanelLeft,
  PanelRight,
  Radio,
  Server,
  Sparkles,
  Volume2,
  VolumeX,
  ChevronDown,
  Save,
  FileBox,
  Globe,
  Image as ImageIcon,
  Palette,
  Settings,
  // v2.0 — iconos de los controles nuevos (tamaño de texto, modo 8 GB,
  // extensiones, panel PRO y pantalla completa)
  Type,
  Gauge,
  Puzzle,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  History,
  Zap, // CONSEJO v1
} from "lucide-react";
import { PanelAspecto } from "./PanelAspecto"; // ASPECTO v1: controles de texto por sección
import { ConsejoPanel } from "./ConsejoPanel"; // CONSEJO v1: los 10 agentes y las 18 dormidas, por fin con botón
import { TtsSelector } from "./TtsSelector"; // TTS v1.15.0: selector de voz/tono/velocidad en la barra superior
import { PortTelemetry } from "../types";
import { EXPERT_MODES, RESPONSE_LANGUAGES } from "../utils/contextCache";
import { IDE_BRAND, APP_FONT_SIZES, APP_FONT_SIZE_LABELS } from "../constants";
import { BrainThinkingIcon } from "./BrainThinkingIcon";

interface HeaderProps {
  currentModel: string;
  onOpenModelSelector: () => void;
  onOpenApiKeys?: () => void;
  telemetry: PortTelemetry;
  workspaceFileCount: number;
  onDownloadZip: () => void;
  isLeftOpen: boolean;
  onToggleLeft: () => void;
  isRightOpen: boolean;
  onToggleRight: () => void;
  isSoundMuted: boolean;
  onToggleSound: () => void;
  ramUsageMb?: number;
  maxRamGb?: number;
  responseLanguage: string;
  onLanguageChange: (lang: string) => void;
  expertMode: string;
  onExpertModeChange: (mode: string) => void;
  // 🔧 Menú CN: guardar/abrir archivo .cn
  onSaveCn?: () => void;
  onOpenCn?: (file: File) => void;
  // 🔧 Modo Web Editor (vista dedicada pantalla completa)
  activeView?: "ide" | "web-editor";
  onToggleWebEditor?: () => void;
  // 🔧 Estado de streaming para animar el cerebro (idle/thinking/exploding)
  isStreaming?: boolean;
  // 🔧 Selector de fondo de pantalla (imagen del cerebro)
  onOpenBgPicker?: () => void;
  hasCustomBg?: boolean;
  onClearBg?: () => void;
  // 🔧 Monitor de recursos en vivo (CPU/RAM del server)
  systemStats?: {
    ide: { rssMb: number; heapUsedMb: number; cpuPercent: number; uptimeSec: number; pid?: number };
    sandbox: { running: boolean };
    machine?: { cpuPercent: number | null; totalRamMb: number; freeRamMb: number; cores: number };
  } | null;
  // 🔧 Puntos de restauración (snapshots)
  snapshots?: { id: string; label: string; createdAt: number; files: { length: number } }[];
  onRestoreSnapshot?: (id: string) => void;
  onDeleteSnapshot?: (id: string) => void;
  onShowSnapshotsPanel?: () => void;
  // 🔧 Exportar a Markdown / Informe Técnico
  onExportMarkdown?: () => void;
  // 🔧 Panel de Configuración
  onOpenConfig?: () => void;
  // v1.1 — Reabrir el asistente de bienvenida Z.ai (GLM-4.5-Flash gratis)
  onOpenZaiWizard?: () => void;
  zaiApiKey?: string;
  // 🔧 Indicador SLM (modelo pequeño detectado)
  isSLM?: boolean;
  slmCategory?: "nano" | "small" | "medium" | "unknown";
  slmParams?: number | null;
  // ============================================================
  // v2.0 — Controles nuevos del híbrido
  // ============================================================
  /** v1.9 — tamaño global de texto (14-25 px) */
  appFontSize?: number;
  onAppFontSizeChange?: (size: number) => void;
  /** v2.0 — Modo 8 GB (sin blur ni animaciones) */
  perfMode?: "auto" | "8gb";
  onPerfModeChange?: (mode: "auto" | "8gb") => void;
  /** v2.0 — Abrir el gestor de extensiones */
  onOpenExtensions?: () => void;
  extensionCount?: number;
  /** v2.0 — Abrir el panel de configuración PRO (menú de la 1.8) */
  onOpenProConfig?: () => void;
  /** v2.0 — Pantalla completa real (el botón que faltaba) */
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  /**
   * v2.0 — Memoria de conversación: cuántos mensajes recientes se envían
   * íntegros al modelo (el resto se resume automáticamente). 0 = compacta.
   */
  historyWindow?: number;
  onHistoryWindowChange?: (n: number) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentModel,
  onOpenModelSelector,
  onOpenApiKeys,
  telemetry,
  workspaceFileCount,
  onDownloadZip,
  isLeftOpen,
  onToggleLeft,
  isRightOpen,
  onToggleRight,
  isSoundMuted,
  onToggleSound,
  ramUsageMb = 78,
  maxRamGb = 8,
  responseLanguage,
  onLanguageChange,
  expertMode,
  onExpertModeChange,
  onSaveCn,
  onOpenCn,
  activeView = "ide",
  onToggleWebEditor,
  isStreaming = false,
  onOpenBgPicker,
  hasCustomBg = false,
  onClearBg,
  systemStats = null,
  snapshots = [],
  onRestoreSnapshot,
  onDeleteSnapshot,
  onShowSnapshotsPanel,
  onExportMarkdown,
  onOpenConfig,
  onOpenZaiWizard,
  appFontSize = 15,
  onAppFontSizeChange,
  perfMode = "auto",
  onPerfModeChange,
  onOpenExtensions,
  extensionCount = 0,
  onOpenProConfig,
  onToggleFullscreen,
  isFullscreen = false,
  historyWindow = 60,
  onHistoryWindowChange,
  zaiApiKey = "",
  isSLM = false,
  slmCategory = "unknown",
  slmParams = null,
}) => {
  // 🔧 Menú desplegable "CN" con Guardar / Abrir archivo .cn
  const [cnMenuOpen, setCnMenuOpen] = useState(false);
  const [consejoAbierto, setConsejoAbierto] = useState(false); // CONSEJO v1
  const [turbo, setTurbo] = useState(() => { try { return localStorage.getItem("codigo0_turbo") === "1"; } catch { return false; } }); // TURBO v1
  const cnMenuRef = useRef<HTMLDivElement>(null);
  const cnFileInputRef = useRef<HTMLInputElement>(null);

  // Cerrar el menú CN al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cnMenuRef.current && !cnMenuRef.current.contains(e.target as Node)) {
        setCnMenuOpen(false);
      }
    };
    if (cnMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [cnMenuOpen]);

  return (
    // v2.3.1 — `h-14` fijo + `justify-between` SIN envolvente: en cuanto la suma
    // de chips superaba el ancho disponible, la sección derecha (Config, Volver…)
    // se salía del viewport y el recorte la ocultaba: botones que "desaparecen
    // hacia la derecha". Con `flex-wrap` + `min-h-14` nada puede perderse — la
    // cabecera gana una fila y todo queda alcanzable a cualquier ancho.
    <header data-cn="cabecera" className="min-h-12 bg-[#03060c]/80 backdrop-blur-md border-b border-[#121a2c] px-2.5 py-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs select-text z-30 shrink-0 shadow-sm overflow-visible">
      {/* Left Section: Branding & Toggle Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleLeft}
          title={isLeftOpen ? "Ocultar panel izquierdo" : "Mostrar panel izquierdo"}
          className={`p-1.5 rounded-lg border transition-all ${
            isLeftOpen
              ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
              : "bg-[#080d1a] border-[#141d2e] text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        {/* 🔧 Branding con icono de cerebro animado + "CerebroNico V0.9"
            + Menú desplegable CN (Guardar / Abrir archivo .cn / Fondo) */}
        <div className="relative" ref={cnMenuRef}>
          <button
            onClick={() => setCnMenuOpen((v) => !v)}
            /* v8.0.1 — CUARTO foco de versión, cazado en la auditoría de la
               discrepancia «cabecera V8.0.0 / menú CN V1.0.3»: este `title`
               llevaba un literal «V1.0.3» incrustado que la regla de fuente
               única nunca tocó, porque vive en un atributo y no en texto
               visible. Un atributo también se lee: basta pasar el ratón. */
            title={`Menú principal — ${IDE_BRAND.FULL_NAME}: archivos .cn, fondo, paleta de colores, PRO y Config`}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md shadow-inner transition-all ${
              cnMenuOpen
                ? "bg-cyan-500/20 border border-cyan-400/60"
                : "bg-gradient-to-r from-cyan-950/60 to-blue-950/60 border border-cyan-500/40 hover:border-cyan-400"
            }`}
          >
            {/* ============================================================
                v0.9 — EL ICONO DEL PRODUCTO, EN LA ESQUINA VISIBLE
                ------------------------------------------------------------
                El arte real del cerebro-chip —el MISMO maestro del que sale
                `build/icon.ico`, o sea el que llevará el EXE— puesto en el
                extremo superior izquierdo. Se elige esta esquina por dos razones
                concretas: es la que se ve SIEMPRE, incluso en la pantalla de
                bienvenida sin ningún chat abierto, y el botón que la contiene ya
                abre el menú CN, así que el icono queda además pulsable sin añadir
                ni un control nuevo.
                ============================================================ */}
            <img
              src="/icono-cerebronico.png"
              alt={`Icono de ${IDE_BRAND.FULL_NAME}`}
              title={IDE_BRAND.FULL_NAME}
              width={22}
              height={22}
              draggable={false}
              className="shrink-0 rounded-[5px] ring-1 ring-cyan-500/40 shadow-[0_0_8px_rgba(34,211,238,0.25)]"
            />

            {/* 🧠 Icono de cerebro animado: cambia según estado de streaming.
                NO se sustituye por el icono de arriba: éste es el INDICADOR DE
                ACTIVIDAD (idle / exploding) y ya funcionaba. Cambiar la marca por
                el estado habría sido perder una señal para ganar un adorno. */}
            <BrainThinkingIcon
              state={isStreaming ? "exploding" : "idle"}
              size={22}
            />
            <div className="flex items-baseline gap-1.5 leading-none">
              {/* v1.6.16 — «lo que está chico es el nombre principal de
                  CerebróNico V…». Correcto: era `text-xs`, 12 px, el MISMO
                  tamaño que cualquier etiqueta secundaria del panel. El nombre
                  del producto es el título de más rango de toda la aplicación,
                  así que pasa al papel más alto de la escala. Es justo lo
                  contrario del resto: aquí no se achica, se jerarquiza. */}
              <span className="cn-hero tracking-tight text-white font-mono whitespace-nowrap">
                {IDE_BRAND.NAME}{" "}
                <span className="text-cyan-400 cn-meta font-sans font-semibold">{IDE_BRAND.VERSION}</span>
              </span>
              <span className="text-[10px] text-zinc-400 font-mono leading-none whitespace-nowrap">
                {isStreaming ? "🧠 pensando..." : "motor listo"}
              </span>
            </div>
            <ChevronDown className={`w-3 h-3 text-cyan-300 transition-transform ${cnMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Menú desplegable CN */}
          {cnMenuOpen && (
            <div className="absolute left-0 top-full mt-1 w-72 bg-[#0a0f1c] border border-cyan-500/40 rounded-xl shadow-2xl shadow-cyan-950/50 z-[100] overflow-hidden">
              <div className="px-3 py-2 bg-[#0d1426] border-b border-[#1a2540]">
                <div className="text-[10px] uppercase font-bold text-cyan-300 tracking-wider flex items-center gap-1.5">
                  <FileBox className="w-3 h-3" />
                  {/* v2.3 — desde la fuente única (IDE_BRAND): el literal «V2.1»
                      de aquí es exactamente el tipo de segunda fuente que
                      miente cuando sube la versión. */}
                  Menú CN — {IDE_BRAND.FULL_NAME}
                </div>
                <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">
                  Archivos .cn (contenedor ZIP) y personalización visual.
                </p>
              </div>
              <div className="p-1.5">
                <button
                  onClick={() => {
                    setCnMenuOpen(false);
                    if (onSaveCn) onSaveCn();
                  }}
                  disabled={!onSaveCn}
                  className="w-full px-2.5 py-2 text-left rounded-md hover:bg-cyan-500/10 text-zinc-200 hover:text-cyan-300 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Guardar workspace completo como archivo .cn (ZIP con manifest)"
                >
                  <Save className="w-3.5 h-3.5 text-cyan-400" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px] font-semibold">Guardar .cn</span>
                    <span className="text-[9px] text-zinc-500">Empaqueta workspace como ZIP</span>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setCnMenuOpen(false);
                    cnFileInputRef.current?.click();
                  }}
                  disabled={!onOpenCn}
                  className="w-full px-2.5 py-2 text-left rounded-md hover:bg-cyan-500/10 text-zinc-200 hover:text-cyan-300 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Abrir archivo .cn (o .zip) y restaurar el workspace completo"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px] font-semibold">Abrir .cn / .zip</span>
                    <span className="text-[9px] text-zinc-500">Restaura workspace desde ZIP</span>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setCnMenuOpen(false);
                    onDownloadZip();
                  }}
                  className="w-full px-2.5 py-2 text-left rounded-md hover:bg-emerald-500/10 text-zinc-200 hover:text-emerald-300 transition-colors flex items-center gap-2"
                  title="Descargar workspace como ZIP estándar (sin manifest)"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px] font-semibold">Descargar ZIP</span>
                    <span className="text-[9px] text-zinc-500">ZIP estándar (sin manifest)</span>
                  </div>
                </button>

                {/* Separador */}
                <div className="my-1 border-t border-[#1a2540]" />

                {/* 🔧 Sección de fondo de pantalla */}
                {onOpenBgPicker && (
                  <button
                    onClick={() => {
                      setCnMenuOpen(false);
                      onOpenBgPicker();
                    }}
                    className="w-full px-2.5 py-2 text-left rounded-md hover:bg-violet-500/10 text-zinc-200 hover:text-violet-300 transition-colors flex items-center gap-2"
                    title="Subir una imagen (ej: cerebro.jpg) como fondo de pantalla del IDE"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-semibold">Cambiar fondo de pantalla</span>
                      <span className="text-[9px] text-zinc-500">
                        {hasCustomBg ? "Fondo activo — clic para cambiar" : "Subir imagen (PNG/JPG)"}
                      </span>
                    </div>
                  </button>
                )}
                {hasCustomBg && onClearBg && (
                  <button
                    onClick={() => {
                      setCnMenuOpen(false);
                      onClearBg();
                    }}
                    className="w-full px-2.5 py-2 text-left rounded-md hover:bg-red-500/10 text-zinc-200 hover:text-red-300 transition-colors flex items-center gap-2"
                    title="Quitar el fondo de pantalla personalizado"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-red-400" />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-semibold">Quitar fondo</span>
                      <span className="text-[9px] text-zinc-500">Vuelve al fondo oscuro</span>
                    </div>
                  </button>
                )}

                {/* v1.0.3 — Separador antes de los reubicados desde la barra superior */}
                <div className="my-1 border-t border-[#1a2540]" />

                {/* 🟢 REUBICADO — Paleta de colores (Aspecto del texto por sección) */}
                <button
                  onClick={() => {
                    setCnMenuOpen(false);
                    // Le damos un tick al navegador para que cierre el menú y posicione
                    // el portal de PanelAspecto sin que el backdrop lo tape.
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent("cerebronico:abrir-aspecto"));
                    }, 60);
                  }}
                  className="w-full px-2.5 py-2 text-left rounded-md hover:bg-cyan-500/10 text-zinc-200 hover:text-cyan-300 transition-colors flex items-center gap-2"
                  title="Paleta de colores: fuente, tamaño y color del texto por sección"
                >
                  <Palette className="w-3.5 h-3.5 text-cyan-400" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px] font-semibold">Paleta de colores</span>
                    <span className="text-[9px] text-zinc-500">Aspecto del texto por sección</span>
                  </div>
                </button>

                {/* 🟢 REUBICADO — Configuración PRO (apariencia, fondo, IA, red…) */}
                {onOpenProConfig && (
                  <button
                    onClick={() => {
                      setCnMenuOpen(false);
                      onOpenProConfig();
                    }}
                    disabled={!onOpenProConfig}
                    className="w-full px-2.5 py-2 text-left rounded-md hover:bg-violet-500/10 text-zinc-200 hover:text-violet-300 transition-colors flex items-center gap-2 disabled:opacity-40"
                    title="Configuración PRO: apariencia, fondo, editor, IA, red, rendimiento y datos"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-violet-400" />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-semibold">Configuración PRO</span>
                      <span className="text-[9px] text-zinc-500">Apariencia · IA · red · rendimiento</span>
                    </div>
                  </button>
                )}

                {/* 🟢 REUBICADO — Panel de Configuración (motores, puertos, SLM) */}
                {onOpenConfig && (
                  <button
                    onClick={() => {
                      setCnMenuOpen(false);
                      onOpenConfig();
                    }}
                    disabled={!onOpenConfig}
                    className="w-full px-2.5 py-2 text-left rounded-md hover:bg-emerald-500/10 text-zinc-200 hover:text-emerald-300 transition-colors flex items-center gap-2 disabled:opacity-40"
                    title="Panel de Control y Compatibilidad — motores, puertos, SLM, apariencia"
                  >
                    <Settings className="w-3.5 h-3.5 text-emerald-400" />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-semibold">Panel de Configuración</span>
                      <span className="text-[9px] text-zinc-500">Motores · puertos · SLM</span>
                    </div>
                  </button>
                )}
              </div>
              <div className="px-3 py-1.5 bg-[#04060d] border-t border-[#141d2e]">
                <p className="text-[9px] text-zinc-600 font-mono leading-relaxed">
                  💡 Tip: renombra un .cn a .zip para inspeccionarlo en cualquier explorador.
                </p>
              </div>
              {/* 🔧 Input oculto eliminado de aquí — ahora vive fuera del bloque condicional
                  (ver más abajo) para que funcione el .click() incluso cuando el menú está cerrado. */}
            </div>
          )}
          {/* 🔧 Input oculto para Abrir .cn — FUERA del bloque condicional del menú
              para que siga existiendo cuando el menú se cierra. Antes estaba dentro
              de {cnMenuOpen && (...)}, lo que hacía que se desmontara al cerrar el
              menú y el .click() no funcionaba. */}
          <input
            ref={cnFileInputRef}
            type="file"
            accept={`.${IDE_BRAND.EXTENSION},.zip,.json,application/zip,application/json,application/x-zip-compressed`}
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked && onOpenCn) onOpenCn(picked);
              e.target.value = "";
            }}
          />
        </div>

      </div>

      {/* Center Section: Ports Telemetry + Monitor + Snapshots */}
      {/* 🔧 Eliminados del Header para liberar espacio:
          - Selector de modelos (ya está en el chat)
          - Botón "Ranuras API" (ya está en LeftSidebar "Abrir Ranuras")
          - Selector de idioma (poco uso)
          - Selector de modo experto (poco uso)
          - Contador de archivos (poco uso)
          - Botón de sonido (poco uso) */}
      <div className="flex items-center gap-2">
        {/* Port Status Indicators */}
        <div className="hidden lg:flex items-center gap-1.5 bg-[#060a14] border border-[#141d2e] px-2.5 py-1 rounded-lg">
          {/* Port 5000 */}
          <div
            className="flex items-center gap-1 font-mono text-[11px]"
            title="Puerto 5000: Microservicios / Worker / FastAPI / Puente PC"
          >
            <Server className={`w-3 h-3 ${telemetry.port5000 ? "text-emerald-400" : "text-zinc-500"}`} />
            <span className={telemetry.port5000 ? "text-emerald-400" : "text-zinc-400"}>:5000</span>
            <span className={`text-[9px] px-1 rounded ${telemetry.port5000 ? "bg-emerald-500/20 text-emerald-300" : "bg-[#0b101c] text-zinc-500"}`}>
              {telemetry.port5000 ? "OK" : "OFF"}
            </span>
          </div>

          <span className="text-zinc-700">|</span>

          {/* Port 11434 */}
          <div
            className="flex items-center gap-1 font-mono text-[11px]"
            title="Puerto 11434: Ollama Local Inferencia"
          >
            <Radio className={`w-3 h-3 ${telemetry.port11434 ? "text-cyan-400" : "text-amber-500"}`} />
            <span className={telemetry.port11434 ? "text-cyan-400" : "text-amber-400"}>:11434</span>
            <span className={`text-[9px] px-1 rounded ${telemetry.port11434 ? "bg-cyan-500/20 text-cyan-300" : "bg-amber-500/20 text-amber-300"}`}>
              {telemetry.port11434 ? "OK" : "LOCAL"}
            </span>
          </div>
        </div>

        {/* 🔧 MONITOR DE RECURSOS EN VIVO (CPU/RAM del server) */}
        {systemStats && (
          <div
            className="hidden lg:flex items-center gap-2 bg-[#060a14] border border-[#141d2e] px-2.5 py-1 rounded-lg text-zinc-400 font-mono text-[11px]"
            title={`IDE (proceso Node.js${systemStats.ide.pid ? `, PID ${systemStats.ide.pid}` : ""}): CPU ${systemStats.ide.cpuPercent}%, RAM ${systemStats.ide.rssMb} MB, uptime ${Math.floor(systemStats.ide.uptimeSec / 60)} min${systemStats.machine ? ` — PC (máquina real): CPU ${systemStats.machine.cpuPercent !== null ? systemStats.machine.cpuPercent.toFixed(1) : "…"}%, RAM libre ${systemStats.machine.freeRamMb} MB, ${systemStats.machine.cores} núcleos` : ""}`}
          >
            <Cpu className={`w-3 h-3 ${systemStats.ide.cpuPercent > 60 ? "text-red-400 animate-pulse" : systemStats.ide.cpuPercent > 30 ? "text-amber-400" : "text-emerald-400"}`} />
            {/* v1.6.22 — «IDE» y no «CPU»: el medidor lee el proceso Node de la app, no
                la máquina. La CPU real de la máquina va aparte, etiquetada «PC». */}
            <span className="text-zinc-500">IDE:</span>
            <span className={systemStats.ide.cpuPercent > 60 ? "text-red-400 font-bold" : "text-zinc-200"}>
              {systemStats.ide.cpuPercent.toFixed(1)}%
            </span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-500">RAM:</span>
            <span className={systemStats.ide.heapUsedMb > 200 ? "text-amber-400" : "text-zinc-200"}>
              {systemStats.ide.heapUsedMb}M
            </span>
            {systemStats.machine ? (
              <>
                <span className="text-zinc-700">|</span>
                <span className="text-zinc-500">PC:</span>
                <span className={systemStats.machine.cpuPercent !== null && systemStats.machine.cpuPercent > 60 ? "text-red-400 font-bold" : "text-zinc-200"}>
                  {systemStats.machine.cpuPercent !== null ? `${systemStats.machine.cpuPercent.toFixed(1)}%` : "…"}
                </span>
              </>
            ) : null}
          </div>
        )}

        {/* 🔧 PUNTOS DE RESTAURACIÓN (snapshots) — v1.0.3 🔴 ELIMINADO de la barra
            por petición: estaba marcado con una X roja en la captura.
            El panel de snapshots sigue siendo accesible desde el menú CN si se
            necesita (no se elimina la funcionalidad, solo el botón duplicado). */}

        {/* 🔧 EXPORTAR A MARKDOWN — v1.0.3 🔴 ELIMINADO de la barra por petición:
            estaba marcado con una X roja. Cualquier .md se puede descargar desde
            el árbol de archivos (LeftSidebar), así que este botón era duplicado.
            Se mantiene onExportMarkdown en props por si se quiere reactivar
            desde el menú CN, pero el botón ya no ocupa espacio en la barra. */}
      </div>

      {/* Right Section: controles que no son menú (lo que iba antes como Pro/Config/Paleta/ZIP ya está en el menú CN de la izquierda) */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* v1.0.3 — Paleta oculta: el botón «A» ya no vive en la barra; se abre
            desde el menú CN con el evento cerebronico:abrir-aspecto. La
            mantenemos montada (envuelta en .hidden) para que el listener del
            evento siga activo y su portal funcione. */}
        <div className="hidden"><PanelAspecto /></div>

        {/* v1.9 — Tamaño global de texto: escala TODA la app (todo usa rem) */}
        {onAppFontSizeChange && (
          <div className="hidden md:flex items-center gap-1 px-1.5 py-0.5 bg-[#060a14] border border-[#141d2e] rounded-md" title="Tamaño de texto de toda la interfaz (14-25px)">
            <Type className="w-3.5 h-3.5 text-cyan-400" />
            <select
              value={appFontSize}
              onChange={(e) => onAppFontSizeChange(Number(e.target.value))}
              className="bg-transparent text-[11px] text-zinc-300 outline-none cursor-pointer"
            >
              {APP_FONT_SIZES.map((s) => (
                <option key={s} value={s} className="bg-[#0a0f1a]">
                  {APP_FONT_SIZE_LABELS[s] || `${s}px`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* v2.0 — Memoria de conversación: >50 mensajes atrás (60 por defecto).
            Los mensajes más antiguos se resumen automáticamente para que el
            contexto crezca sin que la respuesta se vuelva lenta. */}
        {onHistoryWindowChange && (
          <div
            className="hidden md:flex items-center gap-1 px-1.5 py-0.5 bg-[#060a14] border border-[#141d2e] rounded-md"
            title="Cuántos mensajes recientes se envían íntegros al modelo. Los anteriores se resumen automáticamente (el modelo sigue 'recordando')."
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <select
              value={historyWindow}
              onChange={(e) => onHistoryWindowChange(Number(e.target.value))}
              className="bg-transparent text-[11px] text-zinc-300 outline-none cursor-pointer"
            >
              <option value={20} className="bg-[#0a0f1a]">20 msj</option>
              <option value={40} className="bg-[#0a0f1a]">40 msj</option>
              <option value={60} className="bg-[#0a0f1a]">60 msj</option>
              <option value={100} className="bg-[#0a0f1a]">100 msj</option>
              <option value={200} className="bg-[#0a0f1a]">200 msj</option>
              <option value={1000} className="bg-[#0a0f1a]">Todo</option>
            </select>
          </div>
        )}

        {/* v2.0 — Modo 8 GB: apaga backdrop-blur y animaciones infinitas */}
        {onPerfModeChange && (
          <button
            onClick={() => onPerfModeChange(perfMode === "8gb" ? "auto" : "8gb")}
            className={`hidden md:flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border font-mono text-[11px] transition-all ${
              perfMode === "8gb"
                ? "bg-emerald-950/40 text-emerald-300 border-emerald-700/60"
                : "bg-[#060a14] text-zinc-400 border-[#141d2e] hover:text-cyan-300"
            }`}
            title={perfMode === "8gb" ? "Modo 8 GB activo: sin desenfoques ni animaciones de fondo (más rápido en equipos con poca RAM). Clic para volver a automático." : "Activar Modo 8 GB: quita el desenfoque de paneles y las animaciones de fondo para que la inferencia local vaya más fluida."}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>{perfMode === "8gb" ? "8 GB ✓" : "8 GB"}</span>
          </button>
        )}

        {/* v2.0 — Extensiones: cada panel se abre en su propia pestaña.
            v1.0.3 🔴 ELIMINADO de la barra por petición: era el botón con el
            símbolo de plugins (Puzzle) que estaba marcado con una X roja en la
            captura. La gestión de extensiones sigue siendo accesible desde el
            menú CN si hace falta. */}

        {/* CONSEJO v1 — «no encontré el botón de los 10 agentes y las 18 más»: aquí está */}
        <button
          onClick={() => setConsejoAbierto(true)}
          className="hidden md:flex items-center gap-1.5 px-1.5 py-0.5 bg-[#060a14] hover:bg-[#0a1020] border border-[#141d2e] hover:border-emerald-500/40 rounded-md text-zinc-400 hover:text-emerald-300 font-mono text-[11px] transition-all"
          title="Consejo Agéntico: espejos, grupos de trabajo y herramientas dormidas — activar/dormir"
        >
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span>Consejo</span>
        </button>

        {/* TURBO v1 — arma el reparto de poderes de los espejos en el prompt */}
        <button
          onClick={() => {
            const v = !turbo;
            setTurbo(v);
            try { localStorage.setItem("codigo0_turbo", v ? "1" : "0"); } catch {}
            fetch("/api/consejo/turbo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turbo: v }) }).catch(() => {});
          }}
          className={`hidden md:flex items-center gap-1.5 px-1.5 py-0.5 rounded-md font-mono text-[11px] transition-all border ${turbo ? "bg-amber-500/15 border-amber-400/60 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.35)]" : "bg-[#060a14] hover:bg-[#0a1020] border-[#141d2e] hover:border-amber-500/40 text-zinc-400 hover:text-amber-300"}`}
          title="Turbo Espejos: el modelo recibe el reparto completo de los 22 poderes y los usa sin que se lo pidas"
        >
          <span>🚀</span>
          <span>Turbo</span>
        </button>

        {/* v1.0.3 — 🔴 ELIMINADO de la barra: el botón Pro ya está dentro del menú CN. */}

        {/* v2.0 — PANTALLA COMPLETA (el botón que faltaba). F11 también funciona. */}
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className="flex items-center gap-1.5 px-1.5 py-0.5 bg-[#060a14] hover:bg-[#0a1020] border border-[#141d2e] hover:border-cyan-500/40 rounded-md text-zinc-400 hover:text-cyan-300 font-mono text-[11px] transition-all shrink-0"
            title={isFullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa (F11)"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* v1.1 — Botón Z.ai (GLM-4.5-Flash) gratis: reabre el asistente */}
        {onOpenZaiWizard && (
          <button
            onClick={onOpenZaiWizard}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border transition-all text-xs shrink-0 ${
              zaiApiKey
                ? "bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-700/60 hover:border-emerald-400"
                : "bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border-violet-500/60 hover:border-violet-300 animate-pulse"
            }`}
            title={zaiApiKey ? "Z.ai GLM-4.5-Flash está configurado y listo. Clic para cambiar la clave." : "Configurar Z.ai (GLM-4.5-Flash) — 100% GRATIS, sin tarjeta"}
          >
            <Sparkles className={`w-3.5 h-3.5 ${zaiApiKey ? "text-emerald-400" : "text-violet-300"}`} />
            <span className="hidden md:inline">
              {zaiApiKey ? "Z.ai ✓" : "Z.ai GRATIS"}
            </span>
          </button>
        )}

        {/* v1.0.3 — 🔴 ELIMINADO de la barra: el botón Config ya está dentro del menú CN. */}

        {/* 🔧 Botón Modo Web Editor */}
        {onToggleWebEditor && (
          <button
            onClick={onToggleWebEditor}
            className={`flex items-center gap-1.5 px-2 py-0.5 font-medium rounded-md shadow-sm transition-all text-xs shrink-0 ${
              activeView === "web-editor"
                ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-cyan-500/30"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700"
            }`}
            title={activeView === "web-editor" ? "Volver al IDE" : "Modo Web Editor"}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {activeView === "web-editor" ? "Volver" : "Modo Web"}
            </span>
          </button>
        )}

        {/* v1.0.3 — 🔴 ELIMINADO de la barra: el botón «ZIP» era duplicado del menú CN
            (entrada «Descargar ZIP» en el desplegable). Ya no hace falta aquí. */}

        {/* TTS v1.15.0 — Selector de voz de lectura (voz, tono y velocidad).
            Reemplaza al <select> que vivía en el compositor del chat y que se
            quitó por ocupar sitio: ahora la elección está arriba, junto a los
            demás controles, y el chat la lee de la configuración compartida. */}
        <TtsSelector />

        {/* Toggle Right — SIEMPE visible */}
        <button
          onClick={onToggleRight}
          title={isRightOpen ? "Ocultar panel derecho" : "Mostrar panel derecho"}
          className={`p-1.5 rounded-lg border transition-all shrink-0 ${
            isRightOpen
              ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
              : "bg-[#080d1a] border-[#141d2e] text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <PanelRight className="w-4 h-4" />
        </button>
      </div>
      {consejoAbierto && <ConsejoPanel onClose={() => setConsejoAbierto(false)} />}
    </header>
  );
};
