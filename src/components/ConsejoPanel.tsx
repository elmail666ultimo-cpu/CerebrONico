/**
 * ConsejoPanel.tsx — CONSEJO v1: el botón que faltaba
 * ====================================================
 * Modal de la cabecera («⚡ Consejo»): los 12 votantes (inamovibles, a la
 * vista), los 10 espejos con su selector de grupos (el mismo componente de la
 * interfaz de modelos, reutilizado — no duplicado), y las 18 herramientas
 * dormidas con el interruptor que el manual prometía y nadie había montado.
 * Cada toggle habla con POST /api/consejo/entidad; si el motor se niega, el
 * motivo se lee aquí, no en la consola del navegador.
 */
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom"; // Z-ORDEN v1 /*ZORD*/
import { X, RefreshCw, Sun, Moon, Users, Sparkles, Zap } from "lucide-react";
import {
  agruparConsejo, payloadActivacion, lineaConsejo, nombreCorto,
  type EstadoConsejoVista, type HerramientaVista,
} from "../engine/consejoVista";
import { EspejosSelector } from "./EspejosSelector";

export const ConsejoPanel: React.FC<{ onClose(): void }> = ({ onClose }) => {
  const [estado, setEstado] = useState<EstadoConsejoVista | null>(null);
  const [aviso, setAviso] = useState("");
  const [espera, setEspera] = useState<string | null>(null);

  const cargar = () =>
    fetch("/api/consejo/estado")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((j) => { setEstado(j); setAviso(""); })
      .catch((e) => setAviso("el consejo no respondió: " + String(e?.message || e)));

  useEffect(() => { cargar(); }, []);

  const alternar = async (id: string, activa: boolean) => {
    setEspera(id);
    try {
      const r = await fetch("/api/consejo/entidad", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadActivacion(id, activa)),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) setAviso(`«${id}» no cambió: ${j.motivo || j.error || "HTTP " + r.status}`);
      await cargar();
    } catch (e: any) {
      setAviso("no habló con el motor: " + String(e?.message || e));
    } finally { setEspera(null); }
  };

  const seccion = (titulo: string, icono: React.ReactNode, lista: HerramientaVista[], conToggle: boolean) => (
    <div className="mb-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">
        {icono} {titulo} <span className="text-zinc-600">({lista.length})</span>
      </div>
      <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto pr-1">
        {lista.map((h) => (
          <div key={h.id} className="flex items-center gap-2 bg-[#0a0f1a] border border-zinc-800 rounded px-2 py-1">
            <span className={"w-1.5 h-1.5 rounded-full shrink-0 " + (h.activa ? "bg-emerald-400" : "bg-zinc-600")} />
            <span className="text-[11px] text-zinc-200 truncate" title={h.descripcion || h.id}>{nombreCorto(h.id)}</span>
            {conToggle && (
              <button
                onClick={() => alternar(h.id, !h.activa)}
                disabled={espera === h.id}
                className={"ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border transition-colors " +
                  (h.activa ? "border-amber-600/40 text-amber-300 hover:bg-amber-900/20" : "border-emerald-600/40 text-emerald-300 hover:bg-emerald-900/20")}
                title={h.activa ? "Dormir esta herramienta" : "¡Despierta! (activar)"}
              >
                {espera === h.id ? "…" : h.activa ? <><Moon className="w-3 h-3" /> dormir</> : <><Sun className="w-3 h-3" /> despertar</>}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const g = estado ? agruparConsejo(estado) : null;
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}> {/*ZORD: portal al body — dentro del Header (backdrop-blur) el modal nacía recortado fuera de pantalla. V8: comentario JSX real (con llaves): sin llaves, React lo renderizaba como texto literal en la interfaz.*/}
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-[#0b101c] border border-zinc-700 rounded-xl shadow-2xl p-4 font-mono" /*ZORD*/>
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-bold text-zinc-100">Consejo Agéntico</span>
          <button onClick={cargar} className="ml-1 text-zinc-500 hover:text-zinc-300" title="Volver a leer el registro"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={onClose} className="ml-auto text-zinc-500 hover:text-zinc-200" title="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="text-[10px] text-zinc-500 mb-3">{estado ? lineaConsejo(estado) : "consultando el registro…"}</div>
        {aviso && <div className="text-[11px] text-amber-300 mb-3">⚠ {aviso}</div>}
        <EspejosSelector />
        {g && (
          <div className="mt-3">
            {seccion("espejos — el equipo por tarea", <Sparkles className="w-3 h-3 text-violet-400" />, g.espejos, true)}
            {seccion("herramientas dormidas — esperan su botón", <Moon className="w-3 h-3 text-zinc-500" />, g.dormidas, true)}
            {seccion("herramientas despiertas", <Sun className="w-3 h-3 text-emerald-400" />, g.despiertas, true)}
            <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-zinc-500">
              <Users className="w-3 h-3 text-cyan-400" /> votantes siempre despiertos <span className="text-zinc-600">({g.votantes.length})</span>
            </div>
            <div className="text-[10px] text-zinc-600 leading-relaxed">
              {g.votantes.map((v) => nombreCorto(v.id)).join(" · ")}
              <span className="block mt-0.5 text-zinc-700">— los especialistas no se duermen: son el juicio del consejo, no su fuerza de trabajo.</span>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
