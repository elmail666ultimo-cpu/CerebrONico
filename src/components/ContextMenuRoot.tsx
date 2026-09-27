/**
 * ContextMenuRoot.tsx — Menú contextual y portapapeles (v2.0)
 * ==========================================================
 * Lo que pediste: click derecho con su menú de copiado y demás, Ctrl+C / Ctrl+V,
 * y una tecla para capturar la pantalla.
 *
 * Detalles de la implementación:
 *   - Un solo componente global: se monta una vez en App y funciona en TODA la
 *     interfaz (chat, editor, terminal, campos de texto, preview).
 *   - Copiar / Corte / Pegar / Seleccionar todo en cualquier campo o texto
 *     seleccionado, con la API moderna de portapapeles y respaldo clásico
 *     (document.execCommand) para cuando el navegador la bloquea.
 *   - Atajos de teclado: Ctrl+C/X/V/A se confirman y se avisa si el navegador
 *     los bloquea, en vez de no hacer nada en silencio.
 *   - Captura de pantalla con Ctrl+Shift+S (copia al portapapeles y descarga el
 *     PNG). Sobre Fn+PrtScn: esa combinación la intercepta Windows o el firmware
 *     del portátil antes de que llegue a ninguna aplicación, así que ningún
 *     programa puede apropiarse de ella de forma fiable; por eso se ofrece una
 *     tecla propia equivalente que sí funciona siempre.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Scissors, ClipboardPaste, TextSelect, Camera, Search, X } from "lucide-react";

interface MenuState {
  x: number;
  y: number;
  hasSelection: boolean;
  inEditable: boolean;
  selectedText: string;
}

function isEditable(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el || !(el as HTMLElement).tagName) return false;
  const tag = (el as HTMLElement).tagName.toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "input") {
    const type = ((el as HTMLInputElement).type || "text").toLowerCase();
    return ["text", "search", "url", "tel", "email", "password", "number"].includes(type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

/** Inserta texto en el punto del cursor, con respaldo si la API falla. */
function insertAtCursor(el: HTMLElement | null, text: string): boolean {
  if (!el) return false;
  if (isEditable(el)) {
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = input.value.slice(0, start) + text + input.value.slice(end);
    // El setter nativo es imprescindible para que React detecte el cambio
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(input, next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const caret = start + text.length;
    try {
      input.setSelectionRange(caret, caret);
    } catch {}
    return true;
  }
  if ((el as HTMLElement).isContentEditable) {
    return document.execCommand("insertText", false, text);
  }
  return false;
}

export function ContextMenuRoot() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }, []);

  const copyText = useCallback(
    async (text: string) => {
      if (!text) {
        flash("No hay nada seleccionado que copiar.");
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        flash(`Copiado (${text.length} caracteres).`);
      } catch {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          flash("Copiado (respaldo clásico).");
        } catch {
          flash("El navegador bloqueó el copiado. Usa Ctrl+C.");
        }
      }
    },
    [flash]
  );

  const pasteInto = useCallback(
    async (el: HTMLElement | null) => {
      if (!el) return;
      try {
        const text = await navigator.clipboard.readText();
        if (insertAtCursor(el, text)) flash(`Pegado (${text.length} caracteres).`);
        else flash("No se pudo pegar aquí: este campo no es editable.");
      } catch {
        flash("El navegador bloqueó el pegado. Usa Ctrl+V (funciona en campos de texto).");
      }
    },
    [flash]
  );

  const selectAllIn = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    if (isEditable(el)) (el as HTMLInputElement).select();
    else {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  /** Captura de pantalla: copia el PNG al portapapeles y lo descarga. */
  const captureScreen = useCallback(async () => {
    flash("Eligiendo la pantalla a capturar…");
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((r) => window.setTimeout(r, 260));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      const dataUrl = canvas.toDataURL("image/png");
      try {
        const blob = await (await fetch(dataUrl)).blob();
        await (navigator.clipboard as any).write([new (window as any).ClipboardItem({ "image/png": blob })]);
        flash("Captura copiada al portapapeles.");
      } catch {
        flash("Captura hecha: se descarga el PNG (el portapapeles de imagen está bloqueado).");
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `cerebronico-captura-${Date.now()}.png`;
      a.click();
    } catch (err: any) {
      flash(`Captura cancelada o no permitida: ${String(err?.message || err).slice(0, 80)}`);
    }
  }, [flash]);

  const searchSelection = useCallback(
    async (text: string) => {
      if (!text) return flash("Selecciona el símbolo o texto que quieras buscar.");
      try {
        const res = await fetch(`/api/engine/symbols?q=${encodeURIComponent(text.trim())}&limit=6`);
        const data = await res.json();
        if (data?.found > 0) {
          const rows = data.results.map((r: any) => `${r.file}:${r.line} · ${r.signature}`).join("\n");
          await copyText(rows);
          flash(`Motor: ${data.found} coincidencia(s) del proyecto copiadas al portapapeles.`);
        } else {
          flash(`El motor no encuentra "${text.trim()}" entre los símbolos del proyecto.`);
        }
      } catch {
        flash("No se pudo consultar el índice del motor.");
      }
    },
    [copyText, flash]
  );

  // Menú contextual
  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const editable = isEditable(target) || !!target.closest("input, textarea, [contenteditable='true']");
      const selText = window.getSelection()?.toString() || "";
      // En un input, la selección vive dentro del propio campo
      let selected = selText;
      if (editable && !selected) {
        const el = (target.closest("input, textarea") as HTMLInputElement) || (target as HTMLInputElement);
        if (isEditable(el) && el.selectionStart != null && el.selectionEnd != null && el.selectionEnd > el.selectionStart) {
          selected = el.value.slice(el.selectionStart, el.selectionEnd);
        }
      }
      targetRef.current = (target.closest("input, textarea, [contenteditable='true']") as HTMLElement) || target;
      setMenu({ x: e.clientX, y: e.clientY, hasSelection: selected.length > 0, inEditable: editable, selectedText: selected });
      e.preventDefault();
    };
    const close = () => setMenu(null);
    window.addEventListener("contextmenu", onContext);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("contextmenu", onContext);
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, []);

  // Atajos globales
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      // Captura de pantalla (Fn+PrtScn lo intercepta el sistema: esta es la tecla fiable)
      if (e.shiftKey && key === "s") {
        e.preventDefault();
        captureScreen();
        return;
      }
      // En campos editables el navegador ya hace lo correcto
      if (isEditable(document.activeElement)) return;
      if (key === "c" || key === "x") {
        const sel = window.getSelection()?.toString() || "";
        if (sel) {
          e.preventDefault();
          copyText(sel);
        }
      }
      if (key === "v") {
        e.preventDefault();
        pasteInto((document.activeElement as HTMLElement) || targetRef.current);
      }
      if (key === "a") {
        const el = document.activeElement as HTMLElement;
        if (el && el !== document.body) {
          e.preventDefault();
          selectAllIn(el);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [captureScreen, copyText, pasteInto, selectAllIn]);

  const item = "w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left text-zinc-300 hover:bg-cyan-500/10 hover:text-cyan-200 disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <>
      {menu && (
        <div
          className="fixed z-[9998] min-w-[210px] py-1 rounded-md border border-[#1b2740] bg-[#080d18]/98 shadow-2xl shadow-black/60 backdrop-blur-sm"
          style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 240) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className={item} disabled={!menu.hasSelection} onClick={() => { copyText(menu.selectedText); setMenu(null); }}>
            <Copy className="w-3.5 h-3.5" /> Copiar
          </button>
          <button className={item} disabled={!menu.inEditable || !menu.hasSelection} onClick={() => {
            const el = targetRef.current as HTMLInputElement;
            if (isEditable(el)) {
              const start = el.selectionStart ?? 0;
              const end = el.selectionEnd ?? 0;
              copyText(el.value.slice(start, end));
              const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
              Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, el.value.slice(0, start) + el.value.slice(end));
              el.dispatchEvent(new Event("input", { bubbles: true }));
            } else if (menu.selectedText) {
              document.execCommand("cut");
            }
            setMenu(null);
          }}>
            <Scissors className="w-3.5 h-3.5" /> Cortar
          </button>
          <button className={item} disabled={!menu.inEditable} onClick={() => { pasteInto(targetRef.current); setMenu(null); }}>
            <ClipboardPaste className="w-3.5 h-3.5" /> Pegar
          </button>
          <button className={item} onClick={() => { selectAllIn(targetRef.current); setMenu(null); }}>
            <TextSelect className="w-3.5 h-3.5" /> Seleccionar todo
          </button>
          <div className="my-1 h-px bg-[#141d2e]" />
          <button className={item} disabled={!menu.hasSelection} onClick={() => { searchSelection(menu.selectedText); setMenu(null); }}>
            <Search className="w-3.5 h-3.5" /> Buscar en el proyecto (motor)
          </button>
          <button className={item} onClick={() => { captureScreen(); setMenu(null); }}>
            <Camera className="w-3.5 h-3.5" /> Capturar pantalla (Ctrl+Shift+S)
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-3 py-2 rounded-md border border-[#1b2740] bg-[#080d18]/98 text-[11.5px] font-mono text-cyan-200 shadow-xl">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-zinc-500 hover:text-zinc-200">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </>
  );
}
