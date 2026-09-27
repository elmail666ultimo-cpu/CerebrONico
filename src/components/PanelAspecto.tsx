/**
 * PanelAspecto.tsx — el botón «A» de la cabecera y su tarjeta flotante
 * ===================================================================
 * Vive EN Header (junto al selector de tamaño de v1.9, que sigue siendo
 * «zoom de toda la interfaz»). Aquí se controla SOLO EL TEXTO por sección:
 * tamaño (70–220 %), fuente de sistema y color — con vista previa en vivo y
 * persistencia en localStorage. Cero dependencias nuevas; la lógica pesada
 * vive en engine/aspecto.ts (pura, testeada en node).
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom"; // Z-ORDEN v1 /*ZORD*/
import { Palette, RotateCcw, X } from "lucide-react";
import {
  SECCIONES, FUENTES, PALETA, TAM_MIN, TAM_MAX,
  type ConfigAspecto, leerAspectoLocal, escribirAspectoLocal, aplicarEnDocumento,
  modificarSeccion, valorSeccion, hayAspecto,
} from "../engine/aspecto";
import { FondoControl } from "./FondoLayer"; // FONDO v1
// TEMA v1.15.1 — color de la interfaz (acento), redondez y densidad.
import {
  ACENTOS, RADIO_MIN, RADIO_MAX, DENSIDAD_MIN, DENSIDAD_MAX,
  type ConfigTema, leerTemaLocal, escribirTemaLocal, aplicarTema,
} from "../engine/tema";

export const PanelAspecto: React.FC = () => {
  const [abierto, setAbierto] = useState(false);
  const [conf, setConf] = useState<ConfigAspecto>(() => leerAspectoLocal());
  const [sec, setSec] = useState<string>("chat");
  const [aviso, setAviso] = useState("");
  const [tema, setTema] = useState<ConfigTema>(() => leerTemaLocal());
  const caja = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null); /*ZORD*/

  // TEMA v1.15.1 — aplica acento/redondez/densidad al <html> y persiste.
  useEffect(() => {
    aplicarTema(tema);
    escribirTemaLocal(tema);
  }, [tema]);

  // Al montar: enganchar <body> y pintar la hoja guardada (aunque nadie abra la tarjeta).
  useEffect(() => { aplicarEnDocumento(conf); /* una vez */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // v1.0.3 — Permite abrir la paleta desde el menú CN (Header) sin que el botón "A"
  // tenga que estar visible en la barra. El menú dispara este evento y aquí abrimos.
  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener("cerebronico:abrir-aspecto", abrir);
    return () => window.removeEventListener("cerebronico:abrir-aspecto", abrir);
  }, []);

  useEffect(() => {
    aplicarEnDocumento(conf);
    if (!escribirAspectoLocal(conf) && hayAspecto(conf)) setAviso("no se pudo guardar (localStorage lleno o bloqueado): el ajuste vive hasta recargar");
    else setAviso("");
  }, [conf]);

  useEffect(() => {
    if (!abierto) return;
    /* Z-ORDEN v1: la tarjeta vive en un portal al body — ya no cuelga de caja, así que el click-outside consulta las dos cajas */
    const f = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node) && !(cardRef.current && cardRef.current.contains(e.target as Node))) setAbierto(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", f);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", f); document.removeEventListener("keydown", k); };
  }, [abierto]);

  const v = valorSeccion(conf, sec);
  const set = (cambio: Parameters<typeof modificarSeccion>[2]) => setConf(modificarSeccion(conf, sec, cambio));

  const chip = (activo: boolean) =>
    `px-1.5 py-0.5 rounded text-[10px] font-medium border ${
      activo ? "bg-cyan-500/20 text-cyan-200 border-cyan-500/50" : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-zinc-200"
    }`;

  const nombreSec = SECCIONES.find((s) => s.id === sec);

  return (
    <div className="relative shrink-0" ref={caja}> {/* Z-ORDEN v1: el Header tiene backdrop-blur => contexto de apilamiento; la tarjeta se portal-ea al body o quedaba DETRÁS de la interfaz (reportado con captura) */}
      <button
        onClick={() => setAbierto((x) => !x)}
        title="Aspecto del texto por sección (fuente, tamaño, color)"
        className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-colors ${
          abierto ? "bg-cyan-500/20 text-cyan-200 border-cyan-500/50" : "bg-[#060a14] text-zinc-300 border-[#141d2e] hover:text-cyan-300"
        }`}
      >
        <Palette className="w-3.5 h-3.5 text-cyan-400" />
        <span className="hidden lg:inline">A</span>
      </button>

      {abierto && createPortal(
        <div ref={cardRef} className="fixed top-[86px] right-4 z-[95] w-[320px] max-h-[72vh] overflow-y-auto rounded-lg border border-[#1e293b] bg-[#0b101c] shadow-2xl shadow-black/60 p-3 space-y-2.5 text-zinc-300"> {/*ZORD — V8: comentario JSX con llaves. Sin llaves, React lo renderizaba como texto literal (el renglón que se veía en la tarjeta de la paleta).*/}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-cyan-300">Aspecto · texto y tema</span>
            <button onClick={() => setAbierto(false)} className="text-zinc-500 hover:text-zinc-200" title="Cerrar (Esc)"><X className="w-3.5 h-3.5" /></button>
          </div>

          {/* TEMA v1.15.1 — color de TODA la interfaz (acento), redondez y densidad.
              El motor puro (engine/tema.ts) escribe --cn-accent y el CSS re-deriva
              la escala completa: un clic recolorea la interfaz entera. */}
          <div className="rounded border border-[#1e293b] bg-black/30 p-2 space-y-2">
            <span className="text-[10px] font-semibold text-cyan-300">Color de la interfaz</span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {ACENTOS.map((a) => (
                <button key={a.id} onClick={() => setTema((t) => ({ ...t, acento: a.hex }))} title={a.nombre}
                  className={`w-6 h-6 rounded-full border-2 ${tema.acento.toLowerCase() === a.hex.toLowerCase() ? "border-white/80 ring-1 ring-white/40" : "border-transparent"}`}
                  style={{ background: a.hex }} />
              ))}
              <input type="color" value={tema.acento} onChange={(e) => setTema((t) => ({ ...t, acento: e.target.value }))}
                className="w-6 h-6 p-0 bg-transparent border border-zinc-700 rounded cursor-pointer" title="Color a medida" />
            </div>
            <label className="block text-[10px] text-zinc-400">
              Redondez — {tema.radio}px
              <input type="range" min={RADIO_MIN} max={RADIO_MAX} step={1} value={tema.radio}
                onChange={(e) => setTema((t) => ({ ...t, radio: Number(e.target.value) }))}
                className="w-full accent-cyan-400" />
            </label>
            <label className="block text-[10px] text-zinc-400">
              Densidad — {tema.densidad.toFixed(2)}
              <input type="range" min={DENSIDAD_MIN} max={DENSIDAD_MAX} step={0.05} value={tema.densidad}
                onChange={(e) => setTema((t) => ({ ...t, densidad: Number(e.target.value) }))}
                className="w-full accent-cyan-400" />
            </label>
          </div>

          <div className="flex flex-wrap gap-1">
            {SECCIONES.map((s) => (
              <button key={s.id} className={chip(s.id === sec)} onClick={() => setSec(s.id)}
                title={s.id === "general" ? "todo lo que no tenga sección propia" : `sección ${s.nombre}`}>
                {s.icono} {s.nombre}
                {(conf.secciones[s.id] && Object.keys(conf.secciones[s.id]).length > 0) && <span className="text-emerald-400"> ·</span>}
              </button>
            ))}
          </div>

          {/* Vista previa con el ajuste efectivo de ESTA sección (acumulativo con general) */}
          <div
            className="rounded border border-dashed border-zinc-700 bg-black/40 px-2 py-1.5 overflow-hidden"
            style={{
              fontFamily: (FUENTES.find((f) => f.id === v.fuente)?.pila || undefined) as string | undefined,
              color: v.color || undefined,
            }}
          >
            {/* v1.0.0 — 🐞 LA VISTA PREVIA SE APLICABA «GENERAL» DOS VECES.
                La fórmula era `(v.tam/100) * (general.tam/100) * 12`. En las
                cinco secciones con nombre propio eso es correcto (su factor por
                el general, que es acumulativo). Pero al editar la sección
                GENERAL, `v` **ES** `general`: el mismo porcentaje entraba dos
                veces. Poniendo 150 % la vista previa enseñaba 27 px, no 18 —
                o sea, mentía justo en el control desde el que se ajusta todo lo
                demás, y el usuario ajustaba a ojo sobre un número falso.
                Ahora se acumula con el general SÓLO cuando la sección no es el
                general. */}
            <span
              style={{
                fontSize: `${
                  (v.tam / 100) * (sec === "general" ? 1 : valorSeccion(conf, "general").tam / 100) * 12
                }px`,
              }}
            >
              Ejemplo Aa 123 — {nombreSec?.nombre} · chat, editor…
            </span>
          </div>

          <label className="block text-[10px] text-zinc-400">
            Tamaño del texto — {v.tam}%
            <input
              type="range" min={TAM_MIN} max={TAM_MAX} step={5} value={v.tam}
              onChange={(e) => set({ tam: Number(e.target.value) })}
              className="w-full accent-cyan-400"
            />
          </label>

          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-zinc-400 shrink-0">Fuente</span>
            <select
              value={v.fuente}
              onChange={(e) => set({ fuente: e.target.value })}
              className="flex-1 bg-[#060a14] border border-[#141d2e] rounded px-1.5 py-1 text-zinc-200 outline-none"
            >
              {FUENTES.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
            <button onClick={() => set({ tam: 100, fuente: "heredar", color: null })}
              className="shrink-0 text-zinc-500 hover:text-zinc-200" title="Reiniciar esta sección">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div>
            <div className="text-[10px] text-zinc-400 mb-1">Color del texto (acento no se toca)</div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {PALETA.map((p) => (
                <button key={p.id} onClick={() => set({ color: p.color })} title={p.nombre}
                  className={`w-5 h-5 rounded-full border ${v.color === p.color ? "border-cyan-300 ring-1 ring-cyan-400/60" : "border-zinc-700"}`}
                  style={p.color ? { background: p.color } : { background: "repeating-linear-gradient(45deg,#3f3f46 0 4px,#18181b 4px 8px)" }}>
                  {!p.color && <span className="text-[8px] text-zinc-300">∅</span>}
                </button>
              ))}
              <input type="color" value={v.color || "#f8fafc"} onChange={(e) => set({ color: e.target.value })}
                className="w-5 h-5 p-0 bg-transparent border border-zinc-700 rounded cursor-pointer" title="Color a medida" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/70">
            <button onClick={() => setConf({ secciones: {} })} className="text-[10px] text-zinc-500 hover:text-rose-300">
              Restablecer todo
            </button>
            <span className="text-[9px] text-zinc-600">el zoom de interfaz (rem) sigue en su selector</span>
          </div>
          <FondoControl />{/* FONDO v1: el capricho decoroso, con aduana de tamaño */}
          {aviso && <div className="text-[10px] text-amber-300">⚠ {aviso}</div>}
        </div>,
        document.body
      )}
    </div>
  );
};
