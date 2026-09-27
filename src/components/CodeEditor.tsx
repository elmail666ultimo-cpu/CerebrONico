import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  FileCode,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  Sparkles,
  Wand2,
  X,
  Code2,
} from "lucide-react";
import {
  detectLanguageFromPath,
  formatCodeAuto,
  highlightCode,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
} from "../utils/syntaxEngine";
import { WorkspaceFile } from "../types";
import { LS_KEYS } from "../constants";

interface CodeEditorProps {
  file: WorkspaceFile;
  onUpdateContent: (fileId: string, newContent: string) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  file,
  onUpdateContent,
}) => {
  const [copied, setCopied] = useState(false);
  // ============================================================
  // v2.1 — 🐞 "el texto del editor era muy chico, solo llega hasta 12px".
  // El máximo estaba en 16px y el arranque en 12px. Ahora:
  //   · la escala llega a 24px (el usuario pidió poder subir hasta 20px);
  //   · arranca en 15px, igual que el tamaño global de la interfaz;
  //   · la elección se RECUERDA entre sesiones (antes se perdía al recargar,
  //     así que cada vez volvía al mínimo y parecía que no se había cambiado).
  // ============================================================
  const [fontSize, setFontSize] = useState<number>(() => {
    try {
      const guardado = Number(localStorage.getItem(LS_KEYS.CODE_FONT_SIZE));
      if (Number.isFinite(guardado) && guardado >= 11 && guardado <= 24) return guardado;
    } catch {}
    return 15;
  });
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.CODE_FONT_SIZE, String(fontSize));
    } catch {}
  }, [fontSize]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [selectedLanguageId, setSelectedLanguageId] = useState<string>("");
  const [cursorLine, setCursorLine] = useState<number>(1);
  const [cursorCol, setCursorCol] = useState<number>(1);
  const [formatFeedback, setFormatFeedback] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Determine active language
  const detectedLang: SupportedLanguage = useMemo(() => {
    return detectLanguageFromPath(file.path || file.name);
  }, [file.path, file.name]);

  const activeLanguage = useMemo(() => {
    if (selectedLanguageId) {
      const found = SUPPORTED_LANGUAGES.find((l) => l.id === selectedLanguageId);
      if (found) return found;
    }
    return detectedLang;
  }, [selectedLanguageId, detectedLang]);

  // Reset custom language override if file changes
  useEffect(() => {
    setSelectedLanguageId(detectedLang.id);
    setIsPreviewMode(false);
  }, [file.id, detectedLang.id]);

  // Real-time Prism highlighted HTML
  const highlightedHtml = useMemo(() => {
    return highlightCode(file.content, activeLanguage.prismKey);
  }, [file.content, activeLanguage.prismKey]);

  // Synchronize scrolling between textarea and pre layer
  const handleScroll = () => {
    if (textareaRef.current && preRef.current && lineNumbersRef.current) {
      const { scrollTop, scrollLeft } = textareaRef.current;
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
      lineNumbersRef.current.scrollTop = scrollTop;
    }
  };

  // Cursor tracking
  const handleCursorMove = () => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;
    const textBefore = file.content.substring(0, pos);
    const lines = textBefore.split("\n");
    setCursorLine(lines.length);
    setCursorCol(lines[lines.length - 1].length + 1);
  };

  // Handle Tab key and Auto-Indent
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      const newContent =
        file.content.substring(0, start) + "  " + file.content.substring(end);
      onUpdateContent(file.id, newContent);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 2;
          textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    } else if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setShowSearch((prev) => !prev);
    }
  };

  // Copy code to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(file.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Automation: Format Code
  const handleFormat = () => {
    const { formatted, changed } = formatCodeAuto(file.content, activeLanguage.id);
    if (changed) {
      onUpdateContent(file.id, formatted);
      setFormatFeedback("Formateado con éxito");
    } else {
      setFormatFeedback("Ya formateado");
    }
    setTimeout(() => setFormatFeedback(null), 2000);
  };

  // Search & Replace
  const searchMatchesCount = useMemo(() => {
    if (!searchQuery) return 0;
    try {
      const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const matches = file.content.match(regex);
      return matches ? matches.length : 0;
    } catch {
      return 0;
    }
  }, [file.content, searchQuery]);

  const handleReplaceAll = () => {
    if (!searchQuery) return;
    try {
      const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      const replaced = file.content.replace(regex, replaceQuery);
      onUpdateContent(file.id, replaced);
    } catch (err) {
      console.warn("Replace error:", err);
    }
  };

  // Insert code snippet template
  const handleInsertSnippet = () => {
    const snippet = activeLanguage.snippetTemplate;
    const newContent = file.content ? `${file.content}\n\n${snippet}` : snippet;
    onUpdateContent(file.id, newContent);
    setFormatFeedback("Snippet insertado");
    setTimeout(() => setFormatFeedback(null), 2000);
  };

  const lines = useMemo(() => file.content.split("\n"), [file.content]);
  const isPreviewable = activeLanguage.id === "markdown" || file.path.endsWith(".html");

  return (
    <div data-cn="editor" className="flex-1 flex flex-col overflow-hidden bg-[#0a0e17] select-text">
      {/* Editor Top Bar & Controls */}
      {/* v2.3.1 — `h-10` fijo sin envolvente: con el panel estrecho, los botones
          de la derecha (buscar, Vista Previa, tamaño, copiar) se salían y el
          `overflow-hidden` del contenedor los ocultaba — «botones perdidos hacia
          la derecha del editor». `min-h-10` + `flex-wrap` los mantienen todos
          alcanzables a cualquier ancho. */}
      <div className="min-h-10 bg-[#0d121f] border-b border-[#1b2537] px-3 py-1 flex flex-wrap items-center justify-between text-xs text-zinc-300 select-none shrink-0 gap-x-2 gap-y-1">
        {/* Left: Language badge & File info */}
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-cyan-950/60 border border-cyan-800/60 rounded text-[11px] font-mono text-cyan-300">
            <FileCode className="w-3 h-3 text-cyan-400" />
            <select
              value={activeLanguage.id}
              onChange={(e) => setSelectedLanguageId(e.target.value)}
              className="bg-transparent text-cyan-300 outline-none cursor-pointer text-[11px] font-mono"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id} className="bg-zinc-900 text-zinc-200">
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          <span className="text-zinc-400 font-mono text-[11px] hidden sm:inline truncate max-w-[200px]" title={file.path}>
            {file.path}
          </span>
        </div>

        {/* Right: Automation, Search, Format & Tools */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Format Automation Button */}
          <button
            onClick={handleFormat}
            className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-cyan-300 rounded border border-zinc-700/80 transition-colors text-[11px]"
            title="Formatear código, normalizar espacios y sanear JSON"
          >
            <Wand2 className="w-3 h-3 text-cyan-400" />
            <span className="hidden md:inline">Formatear</span>
            {formatFeedback && (
              <span className="text-[10px] text-emerald-400 font-mono">({formatFeedback})</span>
            )}
          </button>

          {/* Insert Snippet Button */}
          <button
            onClick={handleInsertSnippet}
            className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-amber-300 rounded border border-zinc-700/80 transition-colors text-[11px]"
            title="Insertar plantilla/snippet de automatización para este lenguaje"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span className="hidden md:inline">Snippet</span>
          </button>

          {/* Search & Replace Toggle */}
          <button
            onClick={() => setShowSearch((s) => !s)}
            className={`p-1.5 rounded border transition-colors ${
              showSearch
                ? "bg-cyan-950 border-cyan-700 text-cyan-300"
                : "bg-zinc-800 border-zinc-700/80 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Buscar y Reemplazar (Ctrl + F)"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* Preview Toggle for Markdown / HTML */}
          {isPreviewable && (
            <button
              onClick={() => setIsPreviewMode((p) => !p)}
              className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors text-[11px] ${
                isPreviewMode
                  ? "bg-emerald-950 border-emerald-700 text-emerald-300"
                  : "bg-zinc-800 border-zinc-700/80 text-zinc-300 hover:text-emerald-300"
              }`}
              title="Alternar vista previa renderizada"
            >
              <Eye className="w-3 h-3 text-emerald-400" />
              <span>{isPreviewMode ? "Código" : "Vista Previa"}</span>
            </button>
          )}

          {/* Font Size Selector */}
          <select
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="bg-zinc-800 text-zinc-300 border border-zinc-700/80 rounded px-1.5 py-0.5 text-[11px] outline-none font-mono cursor-pointer"
            title="Tamaño de fuente"
          >
            {[11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24].map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-cyan-300 rounded border border-zinc-700/80 transition-colors"
            title="Copiar contenido"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Single File Download: se elimina el duplicado (la descarga individual
              vive en la cabecera del editor, arriba) */}
        </div>
      </div>

      {/* Search & Replace Floating Bar */}
      {showSearch && (
        <div className="bg-[#111726] border-b border-cyan-900/60 p-2 flex flex-wrap items-center gap-2 text-xs font-mono select-none animate-in fade-in">
          <div className="flex items-center gap-1 bg-zinc-900 px-2 py-1 rounded border border-zinc-700/80 flex-1 min-w-[150px]">
            <Search className="w-3 h-3 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-zinc-200 outline-none w-full text-xs"
            />
            {searchMatchesCount > 0 && (
              <span className="text-[10px] text-cyan-400 bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-800 shrink-0">
                {searchMatchesCount} {searchMatchesCount === 1 ? "coincidencia" : "coincidencias"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 bg-zinc-900 px-2 py-1 rounded border border-zinc-700/80 flex-1 min-w-[150px]">
            <input
              type="text"
              placeholder="Reemplazar por..."
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              className="bg-transparent text-zinc-200 outline-none w-full text-xs"
            />
          </div>

          <button
            onClick={handleReplaceAll}
            disabled={!searchQuery || searchMatchesCount === 0}
            className="px-2.5 py-1 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white rounded text-xs transition-colors"
          >
            Reemplazar Todo
          </button>

          <button
            onClick={() => setShowSearch(false)}
            className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Editor Main Content Area */}
      {isPreviewMode && activeLanguage.id === "markdown" ? (
        /* Markdown Live Preview */
        <div className="flex-1 p-5 overflow-auto bg-[#0a0e17] text-zinc-200 prose prose-invert prose-sm max-w-none font-sans leading-relaxed">
          <div className="p-4 bg-[#0e1422] rounded-xl border border-zinc-800 text-xs">
            <div className="text-[11px] font-mono text-cyan-400 mb-2 uppercase tracking-wider">
              Vista Previa Renderizada (Markdown)
            </div>
            <pre className="whitespace-pre-wrap font-sans text-zinc-200 text-xs leading-6">
              {file.content}
            </pre>
          </div>
        </div>
      ) : (
        /* Prism Syntax-Highlighted High-Performance Editor Container */
        <div className="flex-1 relative flex overflow-hidden">
          {/* Line Numbers Gutter */}
          <div
            ref={lineNumbersRef}
            className="w-12 bg-[#080b12] border-r border-[#172030] text-zinc-600 text-right pr-2.5 pt-3 select-none font-mono leading-5 overflow-hidden shrink-0"
                style={{ fontSize: `calc(${fontSize}px * var(--cn-fs-editor, 1) * var(--cn-fs-general, 1))` }} /* V8: el regulador «Editor» del panel «A» ahora escala el texto del código (antes el fontSize inline lo dejaba inmune a cualquier CSS) */
          >
            {lines.map((_, i) => {
              const lineNum = i + 1;
              const isCurrent = lineNum === cursorLine;
              return (
                <div
                  key={i}
                  className={`transition-colors ${
                    isCurrent ? "text-cyan-400 font-bold bg-cyan-950/40 -mr-2.5 pr-2.5 rounded-l" : ""
                  }`}
                >
                  {lineNum}
                </div>
              );
            })}
          </div>

          {/* Prism Highlighting Overlay + Editable Textarea Box */}
          <div className="flex-1 relative h-full overflow-hidden">
            {/* Syntax Highlighted Rendered Layer (underneath) */}
            <pre
              ref={preRef}
              aria-hidden="true"
              className="absolute inset-0 p-3 m-0 font-mono leading-5 overflow-hidden pointer-events-none whitespace-pre-wrap break-words z-0 select-none prism-editor-pre"
              style={{ fontSize: `calc(${fontSize}px * var(--cn-fs-editor, 1) * var(--cn-fs-general, 1))`, tabSize: 2 }} /* V8: regulador «Editor» activo (el overlay y el textarea usan el mismo calc para no descarrilarse) */
              dangerouslySetInnerHTML={{
                __html: highlightedHtml + "\n",
              }}
            />

            {/* Transparent Interactive Textarea (on top) */}
            <textarea
              ref={textareaRef}
              value={file.content}
              onChange={(e) => onUpdateContent(file.id, e.target.value)}
              onScroll={handleScroll}
              onClick={handleCursorMove}
              onKeyUp={handleCursorMove}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              className="absolute inset-0 p-3 m-0 w-full h-full bg-transparent text-transparent caret-cyan-300 font-mono leading-5 resize-none outline-none border-none overflow-auto whitespace-pre-wrap break-words z-10 select-text"
              style={{ fontSize: `calc(${fontSize}px * var(--cn-fs-editor, 1) * var(--cn-fs-general, 1))`, tabSize: 2 }} /* V8: idem overlay */
            />
          </div>
        </div>
      )}

      {/* Editor Status Footer Bar */}
      {/* v2.3.1 — mismo criterio que la barra superior: nada recortable. */}
      <div className="min-h-6 bg-[#090d16] border-t border-[#1a2333] px-3 py-0.5 flex flex-wrap items-center justify-between gap-x-3 text-[11px] text-zinc-400 font-mono select-none shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-cyan-400">
            <Code2 className="w-3 h-3" />
            <span>{activeLanguage.name.split(" ")[0]}</span>
          </span>
          <span>
            Ln {cursorLine}, Col {cursorCol}
          </span>
          <span>{lines.length} líneas</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-zinc-500">UTF-8</span>
          <span>{file.content.length} caracteres</span>
          <span>{Math.round(file.size / 1024 || file.content.length / 1024)} KB</span>
        </div>
      </div>
    </div>
  );
};
