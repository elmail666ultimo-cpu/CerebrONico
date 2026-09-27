/**
 * SelfImprovementPanel.tsx — Panel de AUTOSUPERACIÓN (v2.0)
 * ========================================================
 * "Siempre intenta superarte": eso solo se puede verificar con números. Este
 * panel muestra la evidencia del bucle medir → reflexionar → aprender:
 *
 *   - KPIs del sistema: tasa de éxito, latencia hasta el primer token, tokens/s.
 *   - TENDENCIA frente a la sesión anterior (la prueba de si va a mejor).
 *   - Tabla por modelo: qué modelo rinde de verdad en TU equipo (no en un blog).
 *   - Lecciones activas: lo que el sistema ha aprendido y está aplicando al
 *     prompt. Se pueden borrar las que ya no aporten.
 *
 * No promete magia: no reentrena el modelo. Mide y mejora el SISTEMA alrededor
 * del modelo (contexto, elección de modelo, parámetros, recuperación de errores),
 * que es donde de verdad está la velocidad en un equipo de 8 GB.
 */
import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, GraduationCap, Trash2, RefreshCw, Download, Activity, Target } from "lucide-react";
import {
  type Lesson,
  loadMetrics,
  loadLessons,
  deleteLesson,
  clearLessons,
  clearMetrics,
  startNewMetricsSession,
  exportLessons,
  getImprovementSummary,
} from "../utils/selfImprovement";
import { describeResilience } from "../engine/resilience";
// v2.0 — El botón de la vectorización de la memoria vive aquí: es la otra mitad
// del mismo bucle (medir el sistema y darle memoria escalable cuando haga falta).
import { VectorRAGPanel } from "./VectorRAGPanel";
import { AdvancedFeaturesPanel } from "./AdvancedFeaturesPanel";

interface Props {
  summary: ReturnType<typeof getImprovementSummary>;
  lastLesson?: Lesson | null;
  onRefresh?: () => void;
  onLog?: (line: string) => void;
}

export function SelfImprovementPanel({ summary, lastLesson, onRefresh, onLog }: Props) {
  const [lessons, setLessons] = useState<Lesson[]>(() => loadLessons());
  const [tab, setTab] = useState<"metricas" | "lecciones">("metricas");
  const metrics = useMemo(() => loadMetrics().slice(-40).reverse(), []);

  const trendIcon =
    summary.firstTokenTrendPct === null ? (
      <Minus className="w-3.5 h-3.5 text-zinc-500" />
    ) : summary.firstTokenTrendPct < 0 ? (
      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
    ) : (
      <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
    );

  const Kpi = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
    <div className="rounded-lg border border-[#162034] bg-[#070b14] p-3" title={hint}>
      <div className="text-[11px] text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className="text-lg text-zinc-100 font-semibold mt-0.5">{value}</div>
    </div>
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
      {/* v2.0 — Vectorización de la memoria (RAG local): construida y apagada.
          El botón está desde el primer día; el motor recomienda activarla cuando
          memoria.md pase de 5.000 líneas, que es cuando leerla entera deja de ser
          viable. Apagada no cuesta nada. */}
      <VectorRAGPanel onLog={onLog} />

      {/* v2.0 — Laboratorio de capacidades avanzadas: multi-cerebro, historial Git
          de la memoria, índice profundo del código… construidas y apagadas. El
          día que haya más RAM y más núcleos, se encienden con un clic. */}
      <AdvancedFeaturesPanel onLog={onLog} />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-zinc-100">Autosuperación</span>
          <span className="text-[11px] text-zinc-500">
            mide → reflexiona → aprende (sin gastar tokens de modelo)
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-md overflow-hidden border border-[#162034]">
            <button
              onClick={() => setTab("metricas")}
              className={`px-2 py-1 text-[11px] ${tab === "metricas" ? "bg-cyan-600/25 text-cyan-200" : "bg-[#0d121c] text-zinc-400"}`}
            >
              Métricas
            </button>
            <button
              onClick={() => setTab("lecciones")}
              className={`px-2 py-1 text-[11px] ${tab === "lecciones" ? "bg-cyan-600/25 text-cyan-200" : "bg-[#0d121c] text-zinc-400"}`}
            >
              Lecciones ({lessons.length})
            </button>
          </div>
          <button
            onClick={() => {
              const text = exportLessons();
              navigator.clipboard?.writeText(text);
              onLog?.("📋 Lecciones copiadas al portapapeles (JSON).");
            }}
            className="p-1.5 rounded bg-[#0d121c] border border-[#162034] text-zinc-400 hover:text-cyan-300"
            title="Copiar las lecciones (JSON) para llevarlas a otro equipo"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              startNewMetricsSession();
              onRefresh?.();
              onLog?.("📊 Nueva línea base: a partir de ahora se compara con esta sesión.");
            }}
            className="p-1.5 rounded bg-[#0d121c] border border-[#162034] text-zinc-400 hover:text-emerald-300"
            title="Marcar aquí la línea base: lo anterior pasa a ser la referencia con la que se compara"
          >
            <Target className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              onRefresh?.();
              onLog?.("🔄 Métricas recalculadas.");
            }}
            className="p-1.5 rounded bg-[#0d121c] border border-[#162034] text-zinc-400 hover:text-cyan-300"
            title="Recalcular"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {tab === "metricas" ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi
              label="Éxito"
              value={`${summary.successRate}%`}
              hint="Turnos completados sin error detectado en esta sesión"
            />
            <Kpi
              label="Primer token"
              value={summary.avgFirstTokenMs !== null ? `${(summary.avgFirstTokenMs / 1000).toFixed(1)} s` : "—"}
              hint="Cuánto tarda el modelo en empezar a escribir. Es LA métrica de sensación de velocidad."
            />
            <Kpi label="Turno medio" value={summary.avgTotalMs !== null ? `${(summary.avgTotalMs / 1000).toFixed(1)} s` : "—"} />
            <Kpi
              label="Tokens/s"
              value={summary.tokensPerSecond !== null ? String(summary.tokensPerSecond) : "—"}
              hint="Velocidad de generación. En local depende de la CPU y del tamaño del modelo."
            />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-[#162034] bg-[#070b14] p-3">
            {trendIcon}
            <span className="text-xs text-zinc-300">
              {summary.firstTokenTrendPct === null
                ? "Sin sesión anterior con la que comparar. Usa el botón ◎ para fijar la línea base y vuelve en unos turnos."
                : summary.firstTokenTrendPct < 0
                ? `Mejorando: el primer token llega un ${Math.abs(summary.firstTokenTrendPct)}% antes que en la sesión anterior.`
                : `Cuidado: el primer token tarda un ${summary.firstTokenTrendPct}% más que antes. Revisa historial abierto y tamaño de modelo.`}
            </span>
          </div>

          <div className="rounded-lg border border-[#162034] bg-[#070b14] overflow-hidden">
            <div className="px-3 py-2 text-[11px] text-zinc-400 border-b border-[#162034] flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-cyan-400" /> Rendimiento por modelo ({summary.turns} turno(s) en esta sesión)
            </div>
            {summary.byModel.length === 0 ? (
              <div className="p-3 text-xs text-zinc-500">Todavía no hay turnos registrados en esta sesión.</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 text-[11px]">
                    <th className="text-left px-3 py-1.5 font-normal">Modelo</th>
                    <th className="text-right px-3 py-1.5 font-normal">Turnos</th>
                    <th className="text-right px-3 py-1.5 font-normal">Éxito</th>
                    <th className="text-right px-3 py-1.5 font-normal">1er token</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byModel.map((m) => (
                    <tr key={m.model} className="border-t border-[#0f1626]">
                      <td className="px-3 py-1.5 text-zinc-300 font-mono truncate max-w-[240px]" title={m.model}>
                        {m.model}
                      </td>
                      <td className="px-3 py-1.5 text-right text-zinc-400">{m.turns}</td>
                      <td className={`px-3 py-1.5 text-right ${m.successRate >= 80 ? "text-emerald-300" : m.successRate >= 50 ? "text-amber-300" : "text-red-300"}`}>
                        {m.successRate}%
                      </td>
                      <td className="px-3 py-1.5 text-right text-zinc-400">
                        {m.avgFirstTokenMs !== null ? `${(m.avgFirstTokenMs / 1000).toFixed(1)} s` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {summary.topFailureKinds.length > 0 && (
            <div className="rounded-lg border border-[#162034] bg-[#070b14] p-3">
              <div className="text-[11px] text-zinc-400 mb-1.5">Motivos de fallo</div>
              <div className="flex flex-wrap gap-1.5">
                {summary.topFailureKinds.map((f) => (
                  <span key={f.kind} className="text-[11px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-200 border border-red-500/30">
                    {f.kind}: {f.count}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-[#162034] bg-[#070b14] p-3 text-[11px] text-zinc-500">
            <span className="text-zinc-400">Resiliencia:</span> {describeResilience()}
          </div>

          <div className="rounded-lg border border-[#162034] bg-[#070b14] overflow-hidden">
            <div className="px-3 py-2 text-[11px] text-zinc-400 border-b border-[#162034]">Últimos turnos</div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar font-mono text-[11px]">
              {metrics.length === 0 ? (
                <div className="p-3 text-zinc-500 font-sans">Sin datos.</div>
              ) : (
                metrics.map((m, i) => (
                  <div key={i} className="px-3 py-1 border-b border-[#0f1626] last:border-0 flex items-center gap-2">
                    <span className={m.ok ? "text-emerald-400" : "text-red-400"}>{m.ok ? "✓" : "✗"}</span>
                    <span className="text-zinc-400">{new Date(m.at).toLocaleTimeString()}</span>
                    <span className="text-zinc-300 truncate max-w-[180px]">{m.model}</span>
                    <span className="text-zinc-500">{(m.totalMs / 1000).toFixed(1)}s</span>
                    {m.firstTokenMs ? <span className="text-cyan-300">1º {(m.firstTokenMs / 1000).toFixed(1)}s</span> : null}
                    {m.failureKind && <span className="text-red-300">{m.failureKind}</span>}
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => {
              clearMetrics();
              onRefresh?.();
            }}
            className="text-[11px] text-zinc-500 hover:text-red-300"
          >
            Borrar métricas
          </button>
        </>
      ) : (
        <>
          {lastLesson && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-200">
              Última lección aprendida: {lastLesson.text}
            </div>
          )}
          {lessons.length === 0 ? (
            <div className="text-center text-sm text-zinc-500 py-8 leading-relaxed">
              Todavía no hay lecciones.<br />
              Se aprenden solas cuando un turno falla, cuando el modelo tarda el doble de lo normal, cuando
              cambias de modelo a mitad de tarea o cuando reformulas la misma petición.
            </div>
          ) : (
            <div className="space-y-2">
              {lessons.map((l) => (
                <div key={l.id} className="rounded-lg border border-[#162034] bg-[#070b14] p-2.5 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-200 border border-cyan-500/30">
                        {l.kind}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        usada {l.used}× · ayudó {l.helped}× · peso {l.weight.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{l.text}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {l.tags.slice(0, 6).map((t) => (
                        <span key={t} className="text-[10px] text-zinc-600 font-mono">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      deleteLesson(l.id);
                      setLessons(loadLessons());
                    }}
                    className="p-1 rounded text-zinc-600 hover:text-red-300"
                    title="Olvidar esta lección"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  clearLessons();
                  setLessons([]);
                }}
                className="text-[11px] text-zinc-500 hover:text-red-300"
              >
                Borrar todas las lecciones
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
