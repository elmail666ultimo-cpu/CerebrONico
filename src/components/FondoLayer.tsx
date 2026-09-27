/**
 * FondoLayer.tsx — FONDO v1: la capa que se ve y el control que se pulsa
 * ======================================================================
 * FondoLayer  → montado en el árbol raíz del App: lee GET /api/fondo/meta cada
 *               5 s (barato; los cambios de fondo son un evento humano, no un
 *               stream) y pinta <img> (gif) o <video autoplay muted loop
 *               playsinline> (mp4/webm) en la capa z-index:-1. Sin meta, sin
 *               capa: el reposo otra vez.
 * FondoControl → vive DENTRO de la tarjeta de Aspecto: ruta del proyecto,
 *               activar, quitar; los motivos del server se listan COMPLETOS.
 * El video nunca carga audio (muted + sin pista en la práctica) y `preload=
 * "none"` en el control de estado: en MR1 hasta el precargado es un lujo.
 */
import React, { useEffect, useRef, useState } from "react";
import { Image, Video, Trash2 } from "lucide-react";
import { hojaFondoCss, TIPOS_FONDO, type TipoFondo } from "../engine/fondo";

interface MetaFondo {
  activado: boolean;
  ruta?: string;
  tipo?: TipoFondo;
  mime?: string;
  bytes?: number;
  motivos?: string[];
}

let HOJA_PUESTA = false;
function asegurarHoja() {
  if (HOJA_PUESTA || typeof document === "undefined") return;
  if (!document.getElementById("cn-fondo-hoja")) {
    const h = document.createElement("style");
    h.id = "cn-fondo-hoja";
    h.textContent = hojaFondoCss();
    document.head.appendChild(h);
  }
  HOJA_PUESTA = true;
}

export const FondoLayer: React.FC = () => {
  const [meta, setMeta] = useState<MetaFondo | null>(null);
  useEffect(() => {
    let vivo = true;
    const leer = async () => {
      try {
        const r = await fetch("/api/fondo/meta");
        const j = await r.json();
        if (vivo) setMeta(j && j.activado ? j : null);
      } catch { if (vivo) setMeta(null); }
    };
    asegurarHoja();
    leer();
    const t = setInterval(leer, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  useEffect(() => {
    document.body.classList.toggle("cn-fondo-activo", !!meta);
    return () => document.body.classList.remove("cn-fondo-activo");
  }, [meta]);
  if (!meta || !meta.tipo) return null;
  const src = "/api/fondo?" + String(meta.bytes ?? 0); // el byte-count rompe el caché al cambiar de fondo
  return (
    <div className="cn-fondo-capa" aria-hidden="true">
      {(meta.tipo === "gif" || meta.tipo === "jpg" || meta.tipo === "jpeg") // FONDO11: la foto fija es <img>, no un video mudo de un solo cuadro
        ? <img src={src} alt="" draggable={false} />
        : <video src={src} autoPlay muted loop playsInline preload="none" />}
    </div>
  );
};

export const FondoControl: React.FC = () => {
  const [ruta, setRuta] = useState("");
  const [meta, setMeta] = useState<MetaFondo | null>(null);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const caja = useRef<HTMLInputElement>(null);

  const refrescar = async () => {
    try {
      const r = await fetch("/api/fondo/meta");
      const j = await r.json();
      setMeta(j && j.activado ? j : null);
    } catch { setMeta(null); }
  };
  useEffect(() => { refrescar(); }, []);

  const activar = async () => {
    if (!ruta.trim() || ocupado) return;
    setOcupado(true); setMotivos([]);
    try {
      const r = await fetch("/api/fondo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruta: ruta.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setMotivos(j.motivos || [j.motivo || `el servidor respondió ${r.status}`]); }
      else { setRuta(""); await refrescar(); }
    } catch (e: any) {
      setMotivos(["no habló con el motor: " + String(e?.message || e)]);
    } finally { setOcupado(false); }
  };

  const quitar = async () => {
    setMotivos([]);
    try { await fetch("/api/fondo", { method: "DELETE" }); } catch { /* el GET periódico lo reconcilia */ }
    await refrescar();
  };

  return (
    <div className="border-t border-zinc-800/70 pt-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">fondo animado (4–8 s, en bucle)</div>
      {meta ? (
        <div className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1 text-emerald-300">
            {meta.tipo === "gif" ? <Image className="w-3 h-3" /> : <Video className="w-3 h-3" />}
            {meta.ruta} · {Math.round((meta.bytes || 0) / 1024)} KB
          </span>
          <button onClick={quitar} className="ml-auto flex items-center gap-1 text-zinc-500 hover:text-rose-300">
            <Trash2 className="w-3 h-3" /> quitar
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <input ref={caja} value={ruta} onChange={(e) => setRuta(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") activar(); }}
            placeholder="assets/fondo.mp4" className="flex-1 min-w-0 bg-[#0a0f1a] border border-zinc-700 rounded px-2 py-0.5 text-[10px]" />
          <button onClick={activar} disabled={ocupado || !ruta.trim()}
            className="px-2 py-0.5 rounded bg-zinc-700/60 text-[10px] text-zinc-200 disabled:opacity-40">
            {ocupado ? "…" : "activar"}
          </button>
        </div>
      )}
      {motivos.map((mo, i) => <div key={i} className="text-[10px] text-amber-300 mt-0.5">⚠ {mo}</div>)}
      <div className="text-[9px] text-zinc-600 mt-1">
        {`gif hasta 48 MB · mp4/webm hasta 128 MB · recomendado ≤4 MB (gif) y ≤8 MB (vídeo) · con «movimiento reducido» el fondo se apaga`}&nbsp;
        <span className="text-zinc-700">{meta ? "" : "deja el archivo primero en el proyecto (" + Object.keys(TIPOS_FONDO).join("/") + ")"}</span>
      </div>
    </div>
  );
};
