/**
 * EspinaActividad.tsx — COREO v1: la barra de actividad choreografiada
 * ====================================================================
 * Franja fija de 26px al pie de la IDE (por eso su montaje no altera el
 * layout: es position:fixed). Cada 700 ms lee GET /api/coreo — el mismo
 * régimen de polling que la cola de invocaciones del puente, probada — y
 * pinta chips animados: el VERBO del momento en grande y los últimos cuatro
 * eventos detrás. Al cambiar el evento de fondo despacha
 * `CustomEvent("cn:coreo")` para que otros órganos (el cerebro del Header,
 * la preview, futuros toques de sección) dancen del mismo bus.
 * Sin planes corriendo, la espina muestra el reposo — no se esconde: una
 * interfaz que desaparece cuando calla no es una interfaz que escucha.
 */
import React, { useEffect, useRef, useState } from "react";
import { ACCIONES, hojaCoreoCss, type EventoCoreo } from "../engine/coreo";

interface EstadoCoreo {
  ok: boolean;
  emitidos: number;
  actual: EventoCoreo | null;
  anillo: EventoCoreo[];
}

export const EspinaActividad: React.FC = () => {
  const [estado, setEstado] = useState<EstadoCoreo | null>(null);
  const [caido, setCaido] = useState(false);
  const ultimoN = useRef(0);

  useEffect(() => {
    // la hoja de movimiento se inyecta una sola vez, idempotente
    if (!document.getElementById("cn-coreo-hoja")) {
      const hoja = document.createElement("style");
      hoja.id = "cn-coreo-hoja";
      hoja.textContent = hojaCoreoCss();
      document.head.appendChild(hoja);
    }
    let vivo = true;
    const leer = async () => {
      try {
        const r = await fetch("/api/coreo");
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        if (!vivo) return;
        setCaido(false);
        setEstado(j);
        if (j?.actual && j.actual.n !== ultimoN.current) {
          ultimoN.current = j.actual.n;
          window.dispatchEvent(new CustomEvent("cn:coreo", { detail: j.actual }));
          // el cerebro del Header también respira con el bus (v1.1 lo hará fino)
          (window as unknown as { __cnCoreo?: string }).__cnCoreo = j.actual.accion;
        }
      } catch {
        if (vivo) setCaido(true);
      }
    };
    leer();
    const t = setInterval(leer, 700);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const chip = (ev: EventoCoreo, vivo: boolean) => {
    const a = ACCIONES[ev.accion] || ACCIONES.actividad;
    return (
      <span
        key={ev.n}
        className={"cn-coreo-chip " + (vivo ? "cn-coreo-live " : "opacity-70 ") + "cn-anim-" + a.anim}
        style={{ color: a.color, background: "rgba(6,10,20,.75)" }}
        title={ev.detalle}
      >
        {a.icono} {a.verbo}{ev.detalle ? <> <small>{ev.detalle}</small></> : null}
      </span>
    );
  };

  const anillo = estado?.anillo ?? [];
  const actual = anillo[0];

  return (
    <div className="pointer-events-none fixed bottom-0 inset-x-0 z-40 h-[26px] bg-[#04070d]/95 border-t border-[#121824] flex items-center gap-2 px-3 backdrop-blur-sm overflow-hidden">
      <span className="text-[9px] uppercase tracking-widest text-zinc-600 shrink-0">espina</span>
      {caido && <span className="cn-coreo-chip" style={{ color: "#f87171" }}>⛔ el motor no contesta (reintento cada 700 ms)</span>}
      {!caido && !actual && <span className="text-[11px] text-zinc-600">en reposo · esperando la primera orden</span>}
      {!caido && actual && (
        <>
          {chip(actual, true)}
          {anillo.slice(1, 5).map((e) => <span key={e.n} className="hidden xl:inline">{chip(e, false)}</span>)}
        </>
      )}
      <span className="ml-auto text-[9px] text-zinc-700 shrink-0">
        {estado ? `${estado.emitidos} eventos` : ""}
      </span>
    </div>
  );
};
