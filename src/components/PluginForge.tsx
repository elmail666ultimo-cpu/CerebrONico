/**
 * PluginForge.tsx — FORJA v1: la ventana del formulario-receta
 * ============================================================
 * Pulsar «Forjar» en el Gestor de extensiones abre ESTO (pantalla completa,
 * misma familia visual que el gestor). El usuario elige nombre, propósito,
 * permisos con casillas y hasta 3 herramientas con parámetros en líneas
 * simples; la preview muestra los nombres de tool REALES que nacerán.
 * Al forjar: POST /api/extensions/forjar — el servidor compila con
 * engine/pluginForja (la misma ruta que usa el modelo por chat) y si la
 * receta tiene tachas, devuelve TODOS los motivos y el formulario los
 * lista sin cerrar: corregir y reenviar es el flujo, no un error de pantalla.
 */
import React, { useMemo, useState } from "react";
import { X, Hammer, Check } from "lucide-react";
import { PERMISOS_FORJABLES } from "../engine/pluginForja";

interface Props {
  onClose(): void;
  onForjado(): void | Promise<void>;
}

const HERR_VACIA = { nombre: "", descripcion: "", params: "" };

export const PluginForge: React.FC<Props> = ({ onClose, onForjado }) => {
  const [slug, setSlug] = useState("mi-complemento");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [proposito, setProposito] = useState("");
  const [permisos, setPermisos] = useState<Record<string, boolean>>({ "workspace.read": true });
  const [herr, setHerr] = useState<any[]>([{ ...HERR_VACIA }]);
  const [estado, setEstado] = useState<{ fase: "editando" | "forjando" | "forjado"; motivos?: string[]; mensaje?: string }>({ fase: "editando" });

  const receta = useMemo(() => ({
    id: "cn." + slug.trim().toLowerCase().replace(/\s+/g, "-"),
    nombre: nombre.trim() || "Complemento sin nombre",
    descripcion: descripcion.trim(),
    proposito: proposito.trim() || undefined,
    permisos: Object.keys(permisos).filter((p) => permisos[p]),
    slash: true,
    herramientas: herr.filter((h) => h.nombre.trim()).map((h) => ({
      nombre: h.nombre.trim().toLowerCase(),
      descripcion: h.descripcion.trim(),
      params: h.params.split("\n").map((l: string) => l.trim()).filter(Boolean).map((l: string) => {
        const [pn, pd = "", pt = "string", flag = ""] = l.split(",").map((x: string) => x.trim());
        return { nombre: pn, descripcion: pd, tipo: ["number", "boolean"].includes(pt) ? pt : "string", requerido: flag === "!" };
      }),
    })),
  }), [slug, nombre, descripcion, proposito, permisos, herr]);

  const toolNames = receta.herramientas.map((h: any) => `fj_${receta.id.split(".")[1].replace(/-/g, "_")}_${h.nombre}`);

  const forjar = async () => {
    setEstado({ fase: "forjando" });
    try {
      const res = await fetch("/api/extensions/forjar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(receta),
      });
      const j = await res.json().catch(() => ({ ok: false, motivos: ["el servidor contestó algo que no era JSON"] }));
      if (j.ok) setEstado({ fase: "forjado", mensaje: `«${receta.id}» forjado e instalado: pestaña, slash y ${receta.herramientas.length} herramienta(s). Recargando el catálogo…` });
      else setEstado({ fase: "editando", motivos: j.motivos || [j.motivo || j.message || "motivo no declarado"] });
    } catch (e: any) {
      setEstado({ fase: "editando", motivos: ["el servidor no respondió: " + String((e && e.message) || e)] });
    }
  };

  const campo = "w-full bg-[#060a14] border border-[#141d2e] rounded px-2 py-1.5 text-[12px] text-zinc-200 outline-none focus:border-cyan-500/60";
  const etiquet = "text-[10px] uppercase tracking-wider text-zinc-500 mt-3 mb-1 block";

  return (
    <div className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl bg-[#0a0f1a] border border-[#162034] rounded-xl shadow-2xl p-4 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><Hammer className="w-4 h-4" /> Forjar un complemento</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[11px] text-zinc-500 mb-2">Tú pones la receta; el IDE escribe el manifest y el panel, se auto-valida con su propio juez y lo deja instalado. También puedes pedirlo por el chat: «genérame un plugin para X».</p>

        {estado.fase === "forjado" ? (
          <div className="border border-emerald-500/40 bg-emerald-500/10 rounded-lg p-4 text-[12px] text-emerald-200">
            <div className="flex items-center gap-2 mb-2"><Check className="w-4 h-4" /> {estado.mensaje}</div>
            <button onClick={async () => { await onForjado(); }} className="px-3 py-1.5 rounded bg-emerald-600/30 border border-emerald-500/50 text-emerald-100 text-[12px]">Ver en el Gestor</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label><span className={etiquet}>id (cn.<b>slug</b>)</span>
                <input className={campo} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="mi-complemento" /></label>
              <label><span className={etiquet}>nombre visible</span>
                <input className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Contador de palabras" /></label>
            </div>
            <label className="block"><span className={etiquet}>qué hace (esto lo leerá el modelo para decidir cuándo usarlo)</span>
              <input className={campo} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="cuenta palabras y líneas de un texto o archivo" /></label>
            <label className="block"><span className={etiquet}>propósito / nota para tu yo de mañana (opcional)</span>
              <input className={campo} value={proposito} onChange={(e) => setProposito(e.target.value)} placeholder="lo pedí para auditar los README del playground" /></label>

            <span className={etiquet}>permisos (cero por defecto no existe: pide solo lo que vas a tocar)</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {PERMISOS_FORJABLES.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                  <input type="checkbox" checked={!!permisos[p]} onChange={(e) => setPermisos({ ...permisos, [p]: e.target.checked })} className="accent-emerald-400" /> {p}
                </label>
              ))}
            </div>

            <span className={etiquet}>herramientas (1–3) — params por línea: <code>nombre, descripcion, tipo, !</code> (el «!» lo hace obligatorio)</span>
            {herr.map((h, i) => (
              <div key={i} className="border border-[#14202e] rounded-lg p-2 mb-2">
                <div className="flex gap-2">
                  <input className={campo + " !w-40"} value={h.nombre} onChange={(e) => { const c = [...herr]; c[i] = { ...h, nombre: e.target.value }; setHerr(c); }} placeholder="contar" />
                  <input className={campo} value={h.descripcion} onChange={(e) => { const c = [...herr]; c[i] = { ...h, descripcion: e.target.value }; setHerr(c); }} placeholder="cuenta palabras del texto dado" />
                  {herr.length > 1 && <button className="text-zinc-500 hover:text-rose-300 px-1" onClick={() => setHerr(herr.filter((_, x) => x !== i))}>✕</button>}
                </div>
                <textarea className={campo + " mt-1 h-12"} value={h.params} onChange={(e) => { const c = [...herr]; c[i] = { ...h, params: e.target.value }; setHerr(c); }} placeholder={"texto, el texto a contar, string, !\nunidades, palabra o linea, string"} />
              </div>
            ))}
            {herr.length < 3 && <button onClick={() => setHerr([...herr, { ...HERR_VACIA }])} className="text-[11px] text-emerald-300 hover:text-emerald-100">+ añadir herramienta</button>}

            <div className="mt-3 text-[11px] text-zinc-500">nacerán las herramientas: {toolNames.length ? <code className="text-emerald-300">{toolNames.join("  ")}</code> : "— (declara al menos una)"} · id: <code className="text-zinc-300">{receta.id}</code></div>

            {estado.motivos && estado.motivos.length > 0 && (
              <div className="mt-3 border border-amber-500/40 bg-amber-500/10 rounded-lg p-3">
                <div className="text-[11px] font-semibold text-amber-300 mb-1">El compilador no acepta la receta (nada escrito). Corrige y reenvía:</div>
                <ul className="text-[11px] text-amber-200/90 list-disc pl-4">{estado.motivos.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={forjar} disabled={estado.fase === "forjando"} className="px-4 py-1.5 rounded bg-emerald-600/30 border border-emerald-500/50 text-emerald-100 text-[12px] disabled:opacity-50">
                {estado.fase === "forjando" ? "Forjando…" : "⚒ Forjar e instalar"}
              </button>
              <button onClick={onClose} className="px-3 py-1.5 rounded bg-[#0d121c] border border-[#162034] text-zinc-400 text-[12px]">Cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
