/**
 * EspejosSelector.tsx — ESPEJOS v1: el selector de grupos de espejos
 * =====================================================================
 * Vive DENTRO de la interfaz de modelos (ModelSelectorModal), debajo de los
 * filtros: al elegir motor se elige también el EQUIPO de espejos para la
 * tarea (Código, Arte y Diseño, Ciencia, Cuántica, Todos o selección manual).
 *
 * Dos caras, una acción: la selección se guarda en localStorage (para el
 * prompt del chat, que se arma en el navegador) Y se envía al motor
 * (POST /api/consejo/espejos → memoria + .cerebro-db/espejos.json, para
 * /api/conductor). Si el motor no responde, se DECLARA en el aviso — nada
 * silencioso.
 */
import React, { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import {
  GRUPOS_ESPEJOS, IDS_ESPEJOS, normalizarSeleccion,
  leerSeleccionLocal, guardarSeleccionLocal,
  type SeleccionEspejos,
} from "../engine/reflejo/espejos";

/** Nombre corto por espejo (el id viaja al motor; la etiqueta es para humanos). */
const NOMBRE: Record<string, string> = {
  "espejo.codigos": "códigos", "espejo.lenguajes": "lenguajes", "espejo.artes": "artes",
  "espejo.disenios": "diseños", "espejo.creadores": "creadores", "espejo.planificadores": "planificadores",
  "espejo.cientificos": "científicos", "espejo.fisicos": "físicos", "espejo.matematicos": "matemáticos",
  "espejo.cuantico": "cuántico",
};

const SIN_SELECCION: SeleccionEspejos = { grupo: "ninguno", espejos: [] };

export const EspejosSelector: React.FC = () => {
  const [sel, setSel] = useState<SeleccionEspejos>(() => leerSeleccionLocal() ?? SIN_SELECCION);
  const [aviso, setAviso] = useState("");

  // Al abrir el modal, el motor manda si tiene grupo (es lo que vería /api/conductor).
  useEffect(() => {
    let vivo = true;
    fetch("/api/consejo/espejos")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (!vivo) return;
        const ns = normalizarSeleccion(j?.seleccion);
        if (ns.ok && ns.seleccion.grupo !== "ninguno" && ns.seleccion.espejos.length) {
          setSel(ns.seleccion);
          guardarSeleccionLocal(ns.seleccion);
        }
      })
      .catch(() => { if (vivo) setAviso("sin contacto con el motor: el grupo se guarda solo en este navegador"); });
    return () => { vivo = false; };
  }, []);

  const aplicar = (sig: SeleccionEspejos) => {
    const ns = normalizarSeleccion(sig);
    if (!ns.ok) { setAviso(ns.motivo); return; }
    setSel(ns.seleccion);
    const localOk = guardarSeleccionLocal(ns.seleccion);
    fetch("/api/consejo/espejos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ns.seleccion),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setAviso(localOk ? "" : "guardado en el motor; localStorage estaba lleno/inaccesible");
        else setAviso(`el motor rechazó: ${j?.motivo || "motivo no declarado"}`);
      })
      .catch(() => setAviso(localOk
        ? "solo en este navegador: el motor no respondió"
        : "el motor no respondió y localStorage tampoco: la selección no se guardó"));
  };

  const elegirGrupo = (grupo: string) => aplicar({ grupo, espejos: [] } as any);
  const alternarEspejo = (id: string) => {
    const base = sel.espejos.includes(id) ? sel.espejos.filter((x) => x !== id) : [...sel.espejos, id];
    aplicar({ grupo: base.length ? (sel.grupo === "ninguno" ? "manual" : sel.grupo) : "ninguno", espejos: base } as any);
  };

  const grupoActivo = GRUPOS_ESPEJOS.find((g) => g.id === sel.grupo);
  const chip = (activo: boolean) =>
    `px-2 py-0.5 rounded-lg font-medium transition-all shrink-0 border ${
      activo
        ? "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/50"
        : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-zinc-200"
    }`;

  return (
    <div className="px-4 pt-2.5 pb-2 bg-[#0d121c] border-b border-[#1e293b] space-y-1.5">
      <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
        <span className="flex items-center gap-1 text-[11px] font-bold text-fuchsia-300 shrink-0">
          <Layers className="w-3.5 h-3.5" /> Espejos
          <span className="text-zinc-500 font-normal">({sel.espejos.length}/{IDS_ESPEJOS.length})</span>
        </span>
        <button className={chip(sel.grupo === "ninguno")} onClick={() => aplicar({ grupo: "ninguno", espejos: [] })}>∅ Ninguno</button>
        {GRUPOS_ESPEJOS.map((g) => (
          <button key={g.id} className={chip(sel.grupo === g.id && sel.espejos.length === g.espejos.length)}
            onClick={() => elegirGrupo(g.id)} title={g.contexto}>
            {g.icono} {g.nombre}
          </button>
        ))}
        <button className={chip(sel.grupo === "todos")} onClick={() => elegirGrupo("todos")}>★ Todos</button>
      </div>
      {/* Ajuste fino: cada espejo se puede encender/apagar sobre el grupo. */}
      <div className="flex flex-wrap gap-1">
        {IDS_ESPEJOS.map((id) => {
          const on = sel.espejos.includes(id);
          return (
            <button key={id} onClick={() => alternarEspejo(id)} title={id}
              className={`px-1.5 py-0.5 rounded font-mono text-[10px] border transition-colors ${
                on ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-zinc-900/50 text-zinc-500 border-zinc-800 hover:text-zinc-300"
              }`}>
              {on ? "✓ " : "○ "}{NOMBRE[id]}
            </button>
          );
        })}
      </div>
      {grupoActivo && sel.espejos.length > 0 && (
        <p className="text-[10px] text-zinc-400 leading-snug">{grupoActivo.icono} {grupoActivo.contexto}</p>
      )}
      {aviso && <p className="text-[10px] text-amber-300">⚠ {aviso}</p>}
    </div>
  );
};
