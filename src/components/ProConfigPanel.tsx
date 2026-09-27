/**
 * ProConfigPanel.tsx — Panel de configuración de IDE profesional (v1.8)
 * Secciones: Apariencia · Fondo · Editor · IA · Red · Rendimiento · Datos · Atajos · Acerca
 * Esquema declarativo: cada ajuste se describe una vez y se renderiza con su control.
 */
import { useRef, useState } from "react";
import {
  X, Palette, Image as ImageIcon, Code2, Cpu, Network, Gauge, Database,
  Keyboard, Info, RotateCcw, Download, Upload, Check, Trash2,
} from "lucide-react";
import { evaluarPesoImagen, mensajePesoImagen, MARCA_FONDO_IDB, UMBRAL_IMAGEN_EN_PREFERENCIAS_BYTES } from "../engine/fondo"; // v1.6.8 — el peso de la imagen avisa, ya no bloquea · v1.7.1 — las grandes van a IndexedDB
import { saveBackgroundImage } from "../utils/indexedDBStorage"; // v1.7.1 — imagen grande: blob, no data URL
import {
  ProSettings, DEFAULTS, WALLPAPER_PRESETS, exportProSettings, importProSettings,
} from "../utils/proSettings";
// v1.6.33 — «Acerca de» era la ÚLTIMA fuente de versión paralela de la app:
// App.tsx le pasaba version="2.0.0" y el panel traía default "1.8.0", así que
// el menú decía 2.0.0 mientras la cabecera decía V1.6.33. Regla de hierro de
// la casa (v2.3): NADIE más escribe la versión visible — se lee de IDE_BRAND.
import { IDE_BRAND } from "../constants";

type Section = "apariencia" | "fondo" | "editor" | "ia" | "red" | "rendimiento" | "datos" | "atajos" | "acerca";

interface Props {
  open: boolean;
  settings: ProSettings;
  onClose: () => void;
  onChange: (patch: Partial<ProSettings>) => void;
  onReplaceAll: (s: ProSettings) => void;
  // v1.6.33 — `version?: string` retirada a propósito: aceptar una versión por
  // prop es aceptar una segunda fuente. La pestaña la lee de IDE_BRAND.
  presetId: string;
  onPresetChange: (id: string) => void;
  /**
   * v1.7.1 — La imagen de fondo elegida aquí se aplica AL INSTANTE.
   *
   * Antes esto no existía y el selector parecía no hacer nada: la imagen se
   * guardaba como data URL en las PREFERENCIAS, y AppBackground da PRIORIDAD a
   * `customImageUrl` (que App tiene siempre puesto con el fondo por defecto), así
   * que la imagen elegida nunca llegaba a pintarse. Ahora la imagen va a
   * IndexedDB y App la recibe por aquí y la pinta en el momento.
   */
  onWallpaperListo?: (imagen: Blob) => void;
  /**
   * v1.15.1 — Avisa de que hay que soltar la imagen personalizada (customBg)
   * para que el preset/URL/apagado que el usuario acaba de elegir se vea.
   */
  onWallpaperClear?: () => void;
}

const SECTIONS: Array<{ id: Section; label: string; icon: any }> = [
  { id: "apariencia", label: "Apariencia", icon: Palette },
  { id: "fondo", label: "Fondo", icon: ImageIcon },
  { id: "editor", label: "Editor", icon: Code2 },
  { id: "ia", label: "IA / Modelos", icon: Cpu },
  { id: "red", label: "Red y puertos", icon: Network },
  { id: "rendimiento", label: "Rendimiento", icon: Gauge },
  { id: "datos", label: "Datos", icon: Database },
  { id: "atajos", label: "Atajos", icon: Keyboard },
  { id: "acerca", label: "Acerca de", icon: Info },
];

const THEMES = [
  { id: "dark", label: "Oscuro" },
  { id: "midnight", label: "Medianoche" },
  { id: "carbon", label: "Carbón" },
  { id: "light", label: "Claro" },
];

const SHORTCUTS: Array<[string, string]> = [
  ["Ctrl+K", "Paleta de comandos"],
  ["Ctrl+Enter", "Enviar mensaje al modelo"],
  ["Ctrl+/", "Insertar prompt de código"],
  ["Ctrl+S", "Guardar / sincronizar workspace al sandbox"],
  ["Ctrl+B", "Ocultar/mostrar panel izquierdo"],
  ["Ctrl+J", "Mostrar/ocultar terminal"],
  ["Ctrl+P", "Previsualizador del sandbox"],
  ["F11", "Pantalla completa del preview"],
  ["Esc", "Salir de pantalla completa / cerrar modales"],
  ["Ctrl+Shift+Z", "Descargar ZIP del proyecto"],
];

export function ProConfigPanel({ open, settings, onClose, onChange, onReplaceAll, presetId, onPresetChange, onWallpaperListo, onWallpaperClear }: Props) {
  const [tab, setTab] = useState<Section>("apariencia");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  if (!open) return null;

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  };

  const up = <K extends keyof ProSettings>(group: K, patch: Partial<ProSettings[K]>) => {
    onChange({ [group]: { ...(settings[group] as any), ...patch } } as Partial<ProSettings>);
  };

  /* ---------- controles genéricos ---------- */
  const Row = ({ label, hint, children }: { label: string; hint?: string; children: any }) => (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[#131c2c] last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-zinc-200 font-medium">{label}</div>
        {hint && <div className="text-[10.5px] text-zinc-500 leading-snug mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );

  const Toggle = ({ value, onToggle }: { value: boolean; onToggle: () => void }) => (
    <button
      onClick={onToggle}
      className={`w-10 h-5 rounded-full transition-colors relative ${value ? "bg-cyan-500/80" : "bg-zinc-700"}`}
      role="switch"
      aria-checked={value}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${value ? "left-5" : "left-0.5"}`} />
    </button>
  );

  const Slider = ({ value, min, max, step = 1, onChange: oc, suffix = "" }: any) => (
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => oc(parseFloat(e.target.value))} className="w-32 accent-cyan-400" />
      <span className="text-xs font-mono text-cyan-300 w-14 text-right">{value}{suffix}</span>
    </div>
  );

  const Num = ({ value, onChange: oc, min, max, step = 1 }: any) => (
    <input
      type="number" value={value} min={min} max={max} step={step}
      onChange={(e) => oc(parseFloat(e.target.value) || 0)}
      className="w-24 bg-[#070b13] border border-[#1b2740] rounded-md px-2 py-1 text-xs font-mono text-zinc-100 outline-none focus:border-cyan-500/60"
    />
  );

  const Txt = ({ value, onChange: oc, placeholder, type = "text" }: any) => (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={(e) => oc(e.target.value)}
      className="w-56 bg-[#070b13] border border-[#1b2740] rounded-md px-2 py-1 text-xs font-mono text-zinc-100 outline-none focus:border-cyan-500/60"
    />
  );

  const Sel = ({ value, onChange: oc, options }: any) => (
    <select
      value={value} onChange={(e) => oc(e.target.value)}
      className="bg-[#070b13] border border-[#1b2740] rounded-md px-2 py-1 text-xs font-mono text-zinc-100 outline-none focus:border-cyan-500/60"
    >
      {options.map((o: any) => <option key={o.value ?? o} value={o.value ?? o} className="bg-[#070b13]">{o.label ?? o}</option>)}
    </select>
  );

  /* ---------- subir imagen de fondo ---------- */
  const onPickWallpaper = (f: File | null) => {
    if (!f) return;
    // v1.6.8 — el peso INFORMA, no prohíbe (mismo cambio que la aduana del GIF).
    // La imagen se guarda en IndexedDB de tu propio navegador, así que solo
    // tiene sentido rechazarla cuando de verdad no cabría.
    const nivelImagen = evaluarPesoImagen(f.size);
    if (nivelImagen === "rechazo") {
      alert(mensajePesoImagen(f.size));
      return;
    }
    if (nivelImagen === "aviso" && !confirm(`${mensajePesoImagen(f.size)}\n\n¿Usarla igualmente?`)) return;

    // v1.7.1 — LAS IMÁGENES GRANDES VAN A INDEXEDDB, NO A LAS PREFERENCIAS.
    // El camino antiguo (data URL dentro de las preferencias) funciona hasta
    // ~5 MB de localStorage y luego pierde la escritura en silencio. Con el techo
    // en 100 MB, «imagen grande» deja de ser un caso raro: es el caso normal.
    // Por encima del umbral se guarda el Blob en IndexedDB y en las preferencias
    // queda sólo `MARCA_FONDO_IDB`, que AppBackground sabe ignorar.
    if (f.size > UMBRAL_IMAGEN_EN_PREFERENCIAS_BYTES) {
      void (async () => {
        try {
          await saveBackgroundImage(f);
          up("wallpaper", { url: MARCA_FONDO_IDB, enabled: true } as any);
          onWallpaperListo?.(f);
          flash();
        } catch (err: any) {
          alert(`No se pudo guardar la imagen de fondo: ${err?.message || err}`);
        }
      })();
      return;
    }

    const r = new FileReader();
    r.onload = () => {
      // v1.15.1 — la imagen nueva debe verse aunque hubiera una personalizada antes.
      onWallpaperClear?.();
      up("wallpaper", { url: String(r.result), enabled: true });
      flash();
    };
    r.readAsDataURL(f);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl h-[86vh] rounded-xl border border-[#162034] bg-[#05070d] shadow-2xl flex overflow-hidden"
      >
        {/* Rail de secciones */}
        <div className="w-[190px] shrink-0 border-r border-[#131c2c] bg-[#04060b] p-2 flex flex-col">
          <div className="px-2 py-2 text-xs font-mono text-cyan-300 tracking-wide">CONFIGURACIÓN</div>
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = tab === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setTab(s.id)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all ${active ? "bg-cyan-500/15 text-cyan-200 border border-cyan-500/30" : "text-zinc-400 hover:text-zinc-100 hover:bg-[#0a0f1a] border border-transparent"}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {s.label}
              </button>
            );
          })}
          <div className="mt-auto px-2 py-2 text-xs font-mono text-zinc-600">
            {saved ? <span className="text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" /> guardado</span> : "cambios automáticos"}
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="h-11 shrink-0 px-4 flex items-center justify-between border-b border-[#131c2c]">
            <div className="text-sm font-semibold text-zinc-200">
              {SECTIONS.find((s) => s.id === tab)?.label}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { onReplaceAll(DEFAULTS); flash(); }} className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#0a0f1a] border border-[#1b2740] text-xs text-zinc-300 hover:text-white">
                <RotateCcw className="w-3 h-3" /> Restablecer
              </button>
              <button onClick={onClose} className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-[#0a0f1a]">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar px-4 py-3">

            {tab === "apariencia" && (
              <>
                <Row label="Tema" hint="Esquema de color global de la interfaz.">
                  <Sel value={settings.appearance.theme} onChange={(v: any) => { up("appearance", { theme: v } as any); flash(); }}
                       options={THEMES.map((t) => ({ value: t.id, label: t.label }))} />
                </Row>
                <Row label="Color de acento" hint="Botones, focos y resaltados.">
                  <input type="color" value={settings.appearance.accent} onChange={(e) => { up("appearance", { accent: e.target.value } as any); flash(); }}
                         className="w-10 h-7 bg-transparent border border-[#1b2740] rounded" />
                </Row>
                <Row label="Tipografía" hint="Fuente del código y de la interfaz.">
                  <Sel value={settings.appearance.fontFamily}
                       onChange={(v: any) => up("appearance", { fontFamily: v } as any)}
                       options={[
                         { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
                         { value: "'Fira Code', monospace", label: "Fira Code" },
                         { value: "'Cascadia Code', monospace", label: "Cascadia Code" },
                         { value: "Consolas, monospace", label: "Consolas" },
                         { value: "ui-monospace, monospace", label: "Mono del sistema" },
                       ]} />
                </Row>
                <Row label="Tamaño de fuente" hint="8 – 20 px">
                  <Slider value={settings.appearance.fontSize} min={8} max={20} onChange={(v: number) => up("appearance", { fontSize: v } as any)} suffix="px" />
                </Row>
                <Row label="Interlineado" hint="Altura de línea del código.">
                  <Slider value={settings.appearance.lineHeight} min={1.1} max={2.2} step={0.05} onChange={(v: number) => up("appearance", { lineHeight: v } as any)} />
                </Row>
                <Row label="Densidad de la interfaz" hint="Compacta = más información en pantalla.">
                  <Sel value={settings.appearance.density} onChange={(v: any) => up("appearance", { density: v } as any)}
                       options={[{ value: "compacta", label: "Compacta" }, { value: "normal", label: "Normal" }, { value: "comoda", label: "Cómoda" }]} />
                </Row>
                <Row label="Redondear esquinas" hint="Radio de bordes (px).">
                  <Slider value={settings.appearance.borderRadius} min={0} max={20} onChange={(v: number) => up("appearance", { borderRadius: v } as any)} suffix="px" />
                </Row>
                <Row label="Reducir animaciones" hint="Menos movimiento = más rendimiento y menos distracción.">
                  <Toggle value={settings.appearance.reduceMotion} onToggle={() => up("appearance", { reduceMotion: !settings.appearance.reduceMotion } as any)} />
                </Row>
              </>
            )}

            {tab === "fondo" && (
              <>
                <Row label="Fondo de pantalla" hint="Muestra una imagen o degradado detrás de la interfaz.">
                  <Toggle
                    value={settings.wallpaper.enabled}
                    onToggle={() => {
                      // v1.15.1 — al APAGAR, se suelta también la imagen propia
                      // para que el fondo desaparezca de verdad (no la tapa).
                      if (settings.wallpaper.enabled) onWallpaperClear?.();
                      up("wallpaper", { enabled: !settings.wallpaper.enabled } as any);
                    }}
                  />
                </Row>
                <Row label="Imagen propia" hint="PNG/JPG/WEBP hasta 4 MB (se guarda localmente, no se sube a ningún servidor).">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickWallpaper(e.target.files?.[0] || null)} />
                  <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-600/20 border border-cyan-500/40 text-cyan-200 text-xs hover:bg-cyan-600/30">
                    <Upload className="w-3 h-3" /> Subir imagen
                  </button>
                  {settings.wallpaper.url && (
                    <button
                      onClick={() => {
                        onWallpaperClear?.();
                        up("wallpaper", { url: "" } as any);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-600/15 border border-rose-500/40 text-rose-200 text-xs"
                    >
                      <Trash2 className="w-3 h-3" /> Quitar
                    </button>
                  )}
                </Row>
                <Row label="…o URL de imagen" hint="Se descarga al abrir el IDE (requiere internet).">
                  <Txt
                    value={settings.wallpaper.url.startsWith("data:") ? "" : settings.wallpaper.url}
                    placeholder="https://…/fondo.jpg"
                    onChange={(v: string) => {
                      onWallpaperClear?.();
                      up("wallpaper", { url: v, enabled: true } as any);
                    }}
                  />
                </Row>
                {/* v8.0.1 — El menú ya no es solo de degradados: lleva también las
                    imágenes del cerebro (petición del usuario). El aviso «sin
                    internet» habría pasado a ser falso, y una etiqueta que
                    miente es peor que no tenerla. */}
                <Row label="Fondos incluidos" hint="Los degradados cargan siempre; las imágenes necesitan internet.">
                  <Sel
                    value={presetId}
                    onChange={(v: any) => {
                      onWallpaperClear?.();
                      onPresetChange(v);
                      up("wallpaper", { url: "", enabled: true } as any);
                      flash();
                    }}
                    options={WALLPAPER_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
                  />
                </Row>
                <Row label="Opacidad del fondo">
                  <Slider value={settings.wallpaper.opacity} min={0.05} max={1} step={0.05} onChange={(v: number) => up("wallpaper", { opacity: v } as any)} />
                </Row>
                <Row label="Velo oscuro" hint="Oscurece la imagen para que el texto se lea bien.">
                  <Slider value={settings.wallpaper.dim} min={0} max={0.85} step={0.05} onChange={(v: number) => up("wallpaper", { dim: v } as any)} />
                </Row>
                <Row label="Desenfoque">
                  <Slider value={settings.wallpaper.blur} min={0} max={24} onChange={(v: number) => up("wallpaper", { blur: v } as any)} suffix="px" />
                </Row>
                {/* v2.0 — TRANSPARENCIA DEL MÓDULO Y EL CHAT.
                    El chat se veía rosado porque su fondo translúcido se mezclaba
                    con la imagen de fondo. Este mando decide cuánto se transparentan
                    los paneles, el chat, el explorador y el editor:
                      0.00 = sólido (no se ve el fondo)
                      0.55 = valor equilibrado por defecto
                      1.00 = totalmente transparente (el fondo manda)
                    Solo actúa cuando hay un fondo activo. */}
                <Row label="Transparencia del módulo y el chat" hint="Cuánto se transparentan los paneles y el chat para dejar ver la imagen de fondo. 0 = sólidos, 1 = totalmente transparentes.">
                  <Slider
                    value={(settings.wallpaper as any).moduleOpacity ?? 0.55}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v: number) => up("wallpaper", { moduleOpacity: v } as any)}
                  />
                </Row>
                <Row label="Ajuste" hint="Cómo se escala la imagen.">
                  <Sel value={settings.wallpaper.fit} onChange={(v: any) => up("wallpaper", { fit: v } as any)}
                       options={[{ value: "cover", label: "Cubrir" }, { value: "contain", label: "Contener" }, { value: "repeat", label: "Repetir" }]} />
                </Row>
                <Row label="Posición">
                  <Sel value={settings.wallpaper.position} onChange={(v: any) => up("wallpaper", { position: v } as any)}
                       options={[{ value: "center", label: "Centro" }, { value: "top", label: "Arriba" }, { value: "bottom", label: "Abajo" }]} />
                </Row>
              </>
            )}

            {tab === "editor" && (
              <>
                <Row label="Tamaño de tabulación">
                  <Num value={settings.editor.tabSize} min={1} max={8} onChange={(v: number) => up("editor", { tabSize: v } as any)} />
                </Row>
                <Row label="Usar espacios" hint="Inserta espacios en lugar de tabuladores.">
                  <Toggle value={settings.editor.insertSpaces} onToggle={() => up("editor", { insertSpaces: !settings.editor.insertSpaces } as any)} />
                </Row>
                <Row label="Ajuste de línea (wrap)">
                  <Toggle value={settings.editor.wordWrap} onToggle={() => up("editor", { wordWrap: !settings.editor.wordWrap } as any)} />
                </Row>
                <Row label="Números de línea">
                  <Toggle value={settings.editor.lineNumbers} onToggle={() => up("editor", { lineNumbers: !settings.editor.lineNumbers } as any)} />
                </Row>
                <Row label="Resaltar línea activa">
                  <Toggle value={settings.editor.highlightActiveLine} onToggle={() => up("editor", { highlightActiveLine: !settings.editor.highlightActiveLine } as any)} />
                </Row>
                <Row label="Mostrar espacios en blanco">
                  <Toggle value={settings.editor.renderWhitespace} onToggle={() => up("editor", { renderWhitespace: !settings.editor.renderWhitespace } as any)} />
                </Row>
                <Row label="Pares de brackets" hint="Colorea y empareja llaves, corchetes y paréntesis.">
                  <Toggle value={settings.editor.bracketPairs} onToggle={() => up("editor", { bracketPairs: !settings.editor.bracketPairs } as any)} />
                </Row>
                <Row label="Minimapa" hint="Vista general del archivo (consume algo de GPU).">
                  <Toggle value={settings.editor.minimap} onToggle={() => up("editor", { minimap: !settings.editor.minimap } as any)} />
                </Row>
                <Row label="Ligaduras tipográficas" hint="=> != >= se muestran como símbolos.">
                  <Toggle value={settings.editor.fontLigatures} onToggle={() => up("editor", { fontLigatures: !settings.editor.fontLigatures } as any)} />
                </Row>
                <Row label="Reglas verticales" hint="Columnas guía separadas por comas.">
                  <Txt value={settings.editor.rulers.join(", ")} onChange={(v: string) => up("editor", { rulers: v.split(",").map((x) => parseInt(x.trim())).filter((n) => !isNaN(n)) } as any)} />
                </Row>
                <Row label="Auto-guardado" hint="Sincroniza los cambios al sandbox automáticamente.">
                  <Toggle value={settings.editor.autoSave} onToggle={() => up("editor", { autoSave: !settings.editor.autoSave } as any)} />
                </Row>
                <Row label="Retardo de auto-guardado">
                  <Num value={settings.editor.autoSaveDelayMs} min={200} max={5000} step={100} onChange={(v: number) => up("editor", { autoSaveDelayMs: v } as any)} />
                </Row>
                <Row label="Formatear al guardar" hint="Necesita un formateador configurado (prettier).">
                  <Toggle value={settings.editor.formatOnSave} onToggle={() => up("editor", { formatOnSave: !settings.editor.formatOnSave } as any)} />
                </Row>
              </>
            )}

            {tab === "ia" && (
              <>
                <Row label="Modalidad de ejecución" hint="Afecta a cómo razona y escribe el modelo.">
                  <Sel value={settings.ai.executionMode} onChange={(v: any) => up("ai", { executionMode: v } as any)}
                       options={[{ value: "auto", label: "Automático" }, { value: "rapido", label: "Rápido" }, { value: "ingeniero", label: "Ingeniero" }, { value: "profundo", label: "Pensamiento profundo" }]} />
                </Row>
                <Row label="Modelo del chat (por defecto)" hint="Se puede cambiar desde la cabecera en cualquier momento.">
                  <Txt value={settings.ai.chatModel} placeholder="qwen2.5:3b" onChange={(v: string) => up("ai", { chatModel: v } as any)} />
                </Row>
                <Row label="Modelo del agente" hint="Modelo dedicado a tareas automáticas (herramientas).">
                  <Txt value={settings.ai.agentModel} placeholder="qwen2.5:3b" onChange={(v: string) => up("ai", { agentModel: v } as any)} />
                </Row>
                <Row label="Temperatura" hint="0 = determinista · 1 = creativo.">
                  <Slider value={settings.ai.temperature} min={0} max={1.5} step={0.05} onChange={(v: number) => up("ai", { temperature: v } as any)} />
                </Row>
                <Row label="Top-P"><Slider value={settings.ai.topP} min={0.1} max={1} step={0.05} onChange={(v: number) => up("ai", { topP: v } as any)} /></Row>
                <Row label="Top-K"><Num value={settings.ai.topK} min={1} max={100} onChange={(v: number) => up("ai", { topK: v } as any)} /></Row>
                <Row label="Máx. tokens de salida"><Num value={settings.ai.maxTokens} min={256} max={32768} step={256} onChange={(v: number) => up("ai", { maxTokens: v } as any)} /></Row>
                <Row label="Ventana de contexto" hint="num_ctx de Ollama. Más contexto = más RAM.">
                  <Num value={settings.ai.contextSize} min={2048} max={131072} step={1024} onChange={(v: number) => up("ai", { contextSize: v } as any)} />
                </Row>
                <Row label="Respuesta en streaming">
                  <Toggle value={settings.ai.stream} onToggle={() => up("ai", { stream: !settings.ai.stream } as any)} />
                </Row>
                <Row label="Mantener modelo en RAM" hint="keep_alive: evita recargar el modelo (mucho más rápido).">
                  <Sel value={settings.ai.keepAlive} onChange={(v: any) => up("ai", { keepAlive: v } as any)}
                       options={[{ value: "5m", label: "5 min" }, { value: "30m", label: "30 min" }, { value: "-1", label: "Siempre" }, { value: "0", label: "Descargar al terminar" }]} />
                </Row>
                <Row label="Reintentos ante fallo"><Num value={settings.ai.retries} min={0} max={10} onChange={(v: number) => up("ai", { retries: v } as any)} /></Row>
                <Row label="Timeout total" hint="Tiempo máximo de una respuesta.">
                  <Slider value={settings.ai.timeoutMs / 1000} min={30} max={900} step={10} onChange={(v: number) => up("ai", { timeoutMs: v * 1000 } as any)} suffix="s" />
                </Row>
                <Row label="Timeout del primer token" hint="Si el modelo no empieza a responder en este tiempo, se avisa y reintenta.">
                  <Slider value={settings.ai.firstTokenTimeoutMs / 1000} min={30} max={600} step={10} onChange={(v: number) => up("ai", { firstTokenTimeoutMs: v * 1000 } as any)} suffix="s" />
                </Row>
                <Row label="Pasos máximos del agente"><Num value={settings.ai.maxAgentSteps} min={1} max={50} onChange={(v: number) => up("ai", { maxAgentSteps: v } as any)} /></Row>
                <Row label="Autorizar herramientas de lectura" hint="Leer archivos/ejecutar comandos de solo lectura sin preguntar.">
                  <Toggle value={settings.ai.autoApproveReadTools} onToggle={() => up("ai", { autoApproveReadTools: !settings.ai.autoApproveReadTools } as any)} />
                </Row>
                <Row label="Idioma de respuesta">
                  <Sel value={settings.ai.language} onChange={(v: any) => up("ai", { language: v } as any)}
                       options={[{ value: "es", label: "Español" }, { value: "en", label: "English" }]} />
                </Row>
                <Row label="Instrucciones extra del sistema" hint="Se añaden al prompt del sistema (reglas del proyecto).">
                  <textarea value={settings.ai.systemExtra} onChange={(e) => up("ai", { systemExtra: e.target.value } as any)}
                            rows={3} placeholder="Ej: usa siempre TypeScript estricto y comentarios en español"
                            className="w-56 bg-[#070b13] border border-[#1b2740] rounded-md px-2 py-1 text-xs font-mono text-zinc-100 outline-none focus:border-cyan-500/60" />
                </Row>
              </>
            )}

            {tab === "red" && (
              <>
                <Row label="Puerto del IDE"><Num value={settings.net.idePort} min={1024} max={65535} onChange={(v: number) => up("net", { idePort: v } as any)} /></Row>
                <Row label="Ollama (local)" hint="Servidor de inferencia local."><Txt value={settings.net.ollamaUrl} onChange={(v: string) => up("net", { ollamaUrl: v } as any)} /></Row>
                <Row label="Puente de ejecución" hint="Ejecuta comandos locales (puerto 5000)."><Txt value={settings.net.bridgeUrl} onChange={(v: string) => up("net", { bridgeUrl: v } as any)} /></Row>
                <Row label="Puerto del sandbox" hint="Donde se sirve la app en desarrollo."><Num value={settings.net.sandboxPort} min={1024} max={65535} onChange={(v: number) => up("net", { sandboxPort: v } as any)} /></Row>
                <Row label="Modo LAN (móvil/APK)" hint="Expone el IDE en tu red Wi-Fi (HOST=0.0.0.0). Obligatorio un token si lo activas.">
                  <Toggle value={settings.net.lanMode} onToggle={() => up("net", { lanMode: !settings.net.lanMode } as any)} />
                </Row>
                <Row label="Token de acceso" hint="Protege el IDE cuando está expuesto en la LAN.">
                  <Txt value={settings.net.accessToken} placeholder="token-largo-y-secreto" onChange={(v: string) => up("net", { accessToken: v } as any)} />
                </Row>
                <Row label="Permitir llamadas salientes" hint="Si lo desactivas, el IDE no contacta con servicios externos.">
                  <Toggle value={settings.net.allowRemoteCalls} onToggle={() => up("net", { allowRemoteCalls: !settings.net.allowRemoteCalls } as any)} />
                </Row>
                <Row label="Modo sin conexión" hint="Usa solo recursos locales (degradados en vez de imágenes remotas).">
                  <Toggle value={settings.net.offlineMode} onToggle={() => up("net", { offlineMode: !settings.net.offlineMode } as any)} />
                </Row>
              </>
            )}

            {tab === "rendimiento" && (
              <>
                <Row label="Límite de RAM del navegador" hint="Purga automática al acercarse al límite.">
                  <Slider value={settings.perf.ramLimitMb / 1024} min={1} max={16} step={1} onChange={(v: number) => up("perf", { ramLimitMb: v * 1024 } as any)} suffix=" GB" />
                </Row>
                <Row label="Purga automática de RAM">
                  <Toggle value={settings.perf.autoPurge} onToggle={() => up("perf", { autoPurge: !settings.perf.autoPurge } as any)} />
                </Row>
                <Row label="Capas GPU (Ollama)" hint="-1 = automático · 0 = solo CPU.">
                  <Num value={settings.perf.gpuLayers} min={-1} max={200} onChange={(v: number) => up("perf", { gpuLayers: v } as any)} />
                </Row>
                <Row label="Hilos de CPU" hint="0 = automático (todos los núcleos).">
                  <Num value={settings.perf.maxThreads} min={0} max={64} onChange={(v: number) => up("perf", { maxThreads: v } as any)} />
                </Row>
                <Row label="Caché de compilación" hint="Tamaño máximo del caché del sandbox.">
                  <Slider value={settings.perf.cacheMb} min={64} max={4096} step={64} onChange={(v: number) => up("perf", { cacheMb: v } as any)} suffix=" MB" />
                </Row>
                <Row label="Nivel de registro" hint="Cuánto detalle guardan los logs.">
                  <Sel value={settings.perf.logLevel} onChange={(v: any) => up("perf", { logLevel: v } as any)}
                       options={[{ value: "error", label: "Solo errores" }, { value: "warn", label: "Avisos" }, { value: "info", label: "Información" }, { value: "debug", label: "Depuración" }]} />
                </Row>
                <Row label="Frecuencia de telemetría" hint="Cada cuánto se revisan CPU/RAM/puertos.">
                  <Slider value={settings.perf.telemetryMs / 1000} min={1} max={30} onChange={(v: number) => up("perf", { telemetryMs: v * 1000 } as any)} suffix="s" />
                </Row>
              </>
            )}

            {tab === "datos" && (
              <>
                <Row label="Exportar configuración" hint="Guarda todos los ajustes en un archivo .json portable.">
                  <button
                    onClick={() => {
                      const blob = new Blob([exportProSettings(settings)], { type: "application/json" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = `cerebronico-config-${new Date().toISOString().slice(0, 10)}.json`;
                      a.click();
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0a0f1a] border border-[#1b2740] text-xs text-zinc-200 hover:text-white"
                  >
                    <Download className="w-3 h-3" /> Exportar
                  </button>
                </Row>
                <Row label="Importar configuración" hint="Carga un .json exportado previamente.">
                  <input ref={importRef} type="file" accept="application/json" className="hidden"
                         onChange={async (e) => {
                           const f = e.target.files?.[0];
                           if (!f) return;
                           try {
                             onReplaceAll(importProSettings(await f.text()));
                             flash();
                           } catch {
                             alert("El archivo no es una configuración válida.");
                           }
                         }} />
                  <button onClick={() => importRef.current?.click()} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0a0f1a] border border-[#1b2740] text-xs text-zinc-200 hover:text-white">
                    <Upload className="w-3 h-3" /> Importar
                  </button>
                </Row>
                <Row label="Borrar caché del sandbox" hint="Libera espacio y fuerza recompilación.">
                  <button onClick={() => { localStorage.removeItem("codigo0_sandbox_cache"); flash(); }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-600/15 border border-amber-500/40 text-xs text-amber-200">
                    <Trash2 className="w-3 h-3" /> Borrar caché
                  </button>
                </Row>
                <Row label="Restablecer todo" hint="Vuelve a los valores de fábrica (no borra tus chats).">
                  <button onClick={() => { onReplaceAll(DEFAULTS); flash(); }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-600/15 border border-rose-500/40 text-xs text-rose-200">
                    <RotateCcw className="w-3 h-3" /> Restablecer
                  </button>
                </Row>
              </>
            )}

            {tab === "atajos" && (
              <div className="text-[11.5px]">
                {SHORTCUTS.map(([k, d]) => (
                  <div key={k} className="flex items-center justify-between py-1.5 border-b border-[#131c2c] last:border-0">
                    <span className="text-zinc-300">{d}</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0a0f1a] border border-[#1b2740] font-mono text-[10.5px] text-cyan-200">{k}</kbd>
                  </div>
                ))}
              </div>
            )}

            {tab === "acerca" && (
              <div className="text-[11.5px] text-zinc-300 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-400 flex items-center justify-center font-bold text-zinc-950">CN</div>
                  <div>
                    {/* v1.16.0 — sin número de versión a la vista: se olvidaba
                        actualizar y desincronizaba la interfaz. La marca se muestra
                        sin etiqueta; el autor sigue saliendo de IDE_BRAND. */}
                    <div className="font-semibold text-zinc-100">
                      {IDE_BRAND.NAME} <span className="text-zinc-500 font-normal">· IDE</span>
                    </div>
                    <div className="text-[10.5px] text-zinc-500">Motor de ingeniería de software autónomo · {IDE_BRAND.AUTHOR}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 font-mono text-[10.5px]">
                  <div className="p-2 rounded-lg bg-[#070b13] border border-[#131c2c]">Puerto IDE<br /><span className="text-cyan-300">{settings.net.idePort}</span></div>
                  <div className="p-2 rounded-lg bg-[#070b13] border border-[#131c2c]">Sandbox<br /><span className="text-cyan-300">{settings.net.sandboxPort}</span></div>
                  <div className="p-2 rounded-lg bg-[#070b13] border border-[#131c2c]">Ollama<br /><span className="text-cyan-300">{settings.net.ollamaUrl}</span></div>
                  <div className="p-2 rounded-lg bg-[#070b13] border border-[#131c2c]">Tema<br /><span className="text-cyan-300">{settings.appearance.theme}</span></div>
                </div>
                <p className="text-[10.5px] text-zinc-500 pt-2">
                  Empaquetado: EXE para Windows (NSIS + portable) y APK para Android 6+ con touch configurado. Ver GUIA-INSTALADOR-EXE-Y-APK.md.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
