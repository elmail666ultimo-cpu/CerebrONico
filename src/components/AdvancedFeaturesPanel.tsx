/**
 * AdvancedFeaturesPanel.tsx — Laboratorio de Capacidades Avanzadas
 * ===============================================================
 * Todo lo que es bueno pero no se aprovecha con 8 GB de RAM vive aquí:
 * CONSTRUIDO, APAGADO y con su botón. El día que haya más máquina, se enciende.
 *
 * Honestidad de la interfaz, que es lo que la hace útil:
 *  - Cada capacidad dice si está **lista** o **pendiente**, y si está pendiente
 *    explica el motivo real (no un "próximamente").
 *  - Dice qué pide de la máquina y si TU equipo lo aguanta, comparándolo con el
 *    hardware detectado. Nada de prometer lo que no cabe.
 *  - El estado vive en el motor (`.cerebro-db/features.json`), no en el navegador.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Cpu, GitBranch, Layers, Network, Sparkles, Puzzle, Zap, CheckCircle2, AlertTriangle, Terminal } from "lucide-react";

interface Feature {
  id: string;
  label: string;
  description: string;
  impacto: string;
  requiere: { ramGb: number; cores: number; red?: boolean; git?: boolean };
  porDefecto: boolean;
  estado: "listo" | "pendiente";
  motivoPendiente?: string;
  activada: boolean;
  cabeAqui: boolean;
  hardware: { ramGb: number; cores: number };
}

const ICONOS: Record<string, React.ReactNode> = {
  multi_brain: <Layers className="w-3.5 h-3.5" />,
  git_memory: <GitBranch className="w-3.5 h-3.5" />,
  deep_index: <Network className="w-3.5 h-3.5" />,
  hybrid_rerank: <Sparkles className="w-3.5 h-3.5" />,
  parallel_workers: <Zap className="w-3.5 h-3.5" />,
  auto_propose: <Puzzle className="w-3.5 h-3.5" />,
};

export const AdvancedFeaturesPanel: React.FC<{ onLog?: (linea: string) => void }> = ({ onLog }) => {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [hw, setHw] = useState<{ ramGb: number; cores: number } | null>(null);
  const [ocupado, setOcupado] = useState("");
  const [aviso, setAviso] = useState("");
  const [commits, setCommits] = useState<Array<{ hash: string; fecha: string; mensaje: string }>>([]);
  const [abierto, setAbierto] = useState<string | null>(null);

  const log = useCallback(
    (l: string) => {
      setAviso(l);
      onLog?.(l);
    },
    [onLog]
  );

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/features");
      const j = await r.json();
      if (j?.ok) {
        setFeatures(j.features || []);
        setHw(j.hardware || null);
      } else log(`No se pudo leer el laboratorio: ${j?.error || "respuesta inválida"}`);
    } catch (e: any) {
      log(`Error de conexión con el motor: ${e?.message || e}`);
    }
  }, [log]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const toggle = useCallback(
    async (f: Feature) => {
      setOcupado(f.id);
      try {
        const r = await fetch("/api/features/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: f.id, enabled: !f.activada }),
        });
        const j = await r.json();
        if (j?.ok) {
          setFeatures(j.features || []);
          const extra = j.plantillasCreadas?.length ? ` Plantillas creadas: ${j.plantillasCreadas.join(", ")}.` : "";
          const git = j.git ? (j.git.git ? (j.git.repo ? " Git detectado." : " Git detectado (se preparará el repositorio).") : " Git NO está instalado.") : "";
          log(`«${f.label}» ${j.enabled ? "ACTIVADA" : "desactivada"}.${extra}${git}`);
          if (f.id === "git_memory" && j.enabled) cargarCommits();
        } else {
          log(`No se pudo cambiar «${f.label}»: ${j?.error || "motivo desconocido"}`);
        }
      } catch (e: any) {
        log(`Error de conexión: ${e?.message || e}`);
      } finally {
        setOcupado("");
      }
    },
    [log]
  );

  const cargarCommits = useCallback(async () => {
    try {
      const r = await fetch("/api/features/git/log");
      const j = await r.json();
      setCommits(Array.isArray(j?.commits) ? j.commits : []);
    } catch {}
  }, []);

  const accion = useCallback(
    async (ruta: string, cuerpo: any, etiqueta: string) => {
      setOcupado(ruta);
      try {
        const r = await fetch(ruta, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo || {}),
        });
        const j = await r.json();
        if (j?.ok) {
          if (j?.archivos !== undefined) log(`${etiqueta}: ${j.archivos} archivo(s), ${j.chunks ?? 0} fragmento(s), motor ${j.modelUsed || "—"}.`);
          else if (j?.detalle) log(`${etiqueta}: ${j.detalle}`);
          else log(etiqueta);
        } else {
          log(`${etiqueta} falló: ${j?.error || "motivo desconocido"}`);
        }
      } catch (e: any) {
        log(`Error de conexión: ${e?.message || e}`);
      } finally {
        setOcupado("");
      }
    },
    [log]
  );

  const pideTexto = (f: Feature) => {
    const partes = [];
    if (f.requiere.ramGb) partes.push(`${f.requiere.ramGb} GB RAM`);
    if (f.requiere.cores) partes.push(`${f.requiere.cores} núcleos`);
    if (f.requiere.red) partes.push("red");
    if (f.requiere.git) partes.push("git");
    return partes.length ? partes.join(" · ") : "sin requisitos";
  };

  return (
    <div className="rounded-xl border border-[#1b2438] bg-[#0a0f1a]/70 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Cpu className="w-4 h-4 text-violet-400 shrink-0" />
          <h3 className="text-sm font-semibold text-zinc-200 truncate">Capacidades avanzadas (construidas, apagadas)</h3>
        </div>
        {hw && (
          <span className="text-[10px] font-mono text-zinc-500 shrink-0">
            esta máquina: {hw.ramGb} GB · {hw.cores} núcleos
          </span>
        )}
      </div>

      <p className="text-[11px] text-zinc-400 leading-relaxed">
        Nada se recorta por la máquina de hoy. Todo está construido y se enciende con un botón; apagado no
        consume nada. Las que piden más de lo que tienes se pueden activar igual: solo avisan.
      </p>

      <div className="space-y-2">
        {features.map((f) => {
          const pendiente = f.estado === "pendiente";
          return (
            <div key={f.id} className="rounded-lg bg-[#070b14] border border-[#141d2e] p-2.5 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => setAbierto(abierto === f.id ? null : f.id)}
                  className="flex items-center gap-2 min-w-0 text-left"
                >
                  <span className={f.activada ? "text-emerald-400" : "text-zinc-500"}>{ICONOS[f.id] || <Puzzle className="w-3.5 h-3.5" />}</span>
                  <span className="text-[12px] font-semibold text-zinc-200 truncate">{f.label}</span>
                  {pendiente ? (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 shrink-0">
                      PENDIENTE
                    </span>
                  ) : (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500/70 shrink-0" />
                  )}
                </button>
                <button
                  onClick={() => toggle(f)}
                  disabled={ocupado === f.id}
                  className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors disabled:opacity-50 ${
                    f.activada
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/25"
                      : "bg-[#0d1420] border-[#1b2438] text-zinc-300 hover:bg-[#111a29]"
                  }`}
                >
                  {f.activada ? "Activada" : "Activar"}
                </button>
              </div>

              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 flex-wrap">
                <span>pide: {pideTexto(f)}</span>
                {!f.cabeAqui && (
                  <span className="flex items-center gap-1 text-amber-400/90">
                    <AlertTriangle className="w-3 h-3" /> más de lo que tienes
                  </span>
                )}
              </div>

              {abierto === f.id && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] text-zinc-400 leading-relaxed">{f.description}</p>
                  <p className="text-[11px] text-cyan-300/80 leading-relaxed">
                    <span className="font-semibold">Qué ganas:</span> {f.impacto}
                  </p>
                  {pendiente && f.motivoPendiente && (
                    <p className="text-[10px] text-amber-300/80 leading-relaxed">
                      <span className="font-semibold">Por qué está pendiente:</span> {f.motivoPendiente}
                    </p>
                  )}
                  {f.id === "deep_index" && f.activada && (
                    <button
                      onClick={() => accion("/api/features/deep-index", {}, "Índice profundo del código")}
                      disabled={ocupado === "/api/features/deep-index"}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50"
                    >
                      <Network className="w-3 h-3" />
                      Indexar el código del proyecto
                    </button>
                  )}
                  {f.id === "git_memory" && f.activada && (
                    <div className="space-y-1.5">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => accion("/api/features/git/commit", { motivo: "confirmación manual desde la IDE" }, "Commit de la memoria")}
                          disabled={ocupado === "/api/features/git/commit"}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold bg-[#0d1420] border border-[#1b2438] text-zinc-300 hover:bg-[#111a29] disabled:opacity-50"
                        >
                          <GitBranch className="w-3 h-3" />
                          Confirmar ahora
                        </button>
                        <button
                          onClick={cargarCommits}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold bg-[#0d1420] border border-[#1b2438] text-zinc-400 hover:bg-[#111a29]"
                        >
                          <Terminal className="w-3 h-3" />
                          Ver historial
                        </button>
                      </div>
                      {commits.length > 0 && (
                        <div className="max-h-32 overflow-y-auto space-y-0.5">
                          {commits.map((c) => (
                            <div key={c.hash} className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                              <span className="text-cyan-400/80">{c.hash}</span>
                              <span className="text-zinc-600">{c.fecha}</span>
                              <span className="truncate">{c.mensaje}</span>
                              <button
                                onClick={() => accion("/api/features/git/rollback", { hash: c.hash }, `Rollback a ${c.hash}`)}
                                className="ml-auto shrink-0 text-[9px] px-1.5 rounded border border-[#1b2438] hover:bg-[#111a29]"
                              >
                                volver
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {aviso && <p className="text-[10px] text-violet-300/80 font-mono leading-relaxed">{aviso}</p>}
    </div>
  );
};
