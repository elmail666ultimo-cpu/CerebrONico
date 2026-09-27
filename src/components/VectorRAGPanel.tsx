/**
 * VectorRAGPanel.tsx — Botón de la Vectorización de la Memoria (RAG local)
 * ========================================================================
 * La vectorización está CONSTRUIDA Y APAGADA. Este panel es el botón.
 *
 * Decisiones de interfaz:
 *  - Se muestra siempre, aunque esté apagada, porque informa de lo que importa:
 *    cuántas líneas tiene `memoria.md` y dónde está el umbral. Así el usuario ve
 *    por qué todavía no hace falta, en vez de tener que creerme.
 *  - El estado y la recomendación los calcula el MOTOR (GET /api/rag/status), no
 *    este componente: aquí no se decide nada, solo se muestra y se pulsa.
 *  - Los mensajes de error dicen qué pasó de verdad. Si no hay modelo de
 *    embeddings, se avisa de que se está usando el fallback de hashing y de que
 *    su calidad es modesta: no se disfraza.
 */

import React, { useCallback, useEffect, useState } from "react";
import { BookOpen, Database, RefreshCw, Search, Trash2, Power } from "lucide-react";

interface RagStatus {
  enabled: boolean;
  model: string;
  modelUsed: string;
  chunks: number;
  dim: number;
  indexedAt: number;
  memoriaLines: number;
  threshold: number;
  recommendation: string;
}

interface Hit {
  source: string;
  score: number;
  text: string;
}

export const VectorRAGPanel: React.FC<{ onLog?: (linea: string) => void }> = ({ onLog }) => {
  const [st, setSt] = useState<RagStatus | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [aviso, setAviso] = useState("");

  const log = useCallback(
    (linea: string) => {
      setAviso(linea);
      onLog?.(linea);
    },
    [onLog]
  );

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/rag/status");
      const j = await r.json();
      if (j?.ok) setSt(j as RagStatus);
      else log(`No se pudo leer el estado de la vectorización: ${j?.error || "respuesta inválida"}`);
    } catch (e: any) {
      log(`Error de conexión con el motor: ${e?.message || e}`);
    }
  }, [log]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const llamar = useCallback(
    async (ruta: string, cuerpo?: any, etiqueta?: string) => {
      setOcupado(true);
      try {
        const r = await fetch(ruta, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo || {}),
        });
        const j = await r.json();
        if (j?.ok) {
          if (typeof j.enabled === "boolean" || typeof j.chunks === "number") setSt(j as RagStatus);
          if (etiqueta) log(etiqueta);
        } else {
          log(`${etiqueta || "Operación"} falló: ${j?.error || "motivo desconocido"}`);
        }
        return j;
      } catch (e: any) {
        log(`Error de conexión: ${e?.message || e}`);
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [log]
  );

  const activar = async () => {
    if (!st) return;
    const nuevo = !st.enabled;
    const j = await llamar("/api/rag/toggle", { enabled: nuevo }, nuevo ? "Vectorización ACTIVADA." : "Vectorización desactivada y índice liberado.");
    if (nuevo && j?.ok) {
      log("Indexando memoria, cerebro y base de conocimiento…");
      await llamar("/api/rag/index", {}, "Índice creado.");
      await cargar();
    }
  };

  const probar = async () => {
    if (!consulta.trim()) return;
    const j = await llamar("/api/rag/search", { query: consulta, k: 4 }, `Búsqueda: ${consulta}`);
    setHits(Array.isArray(j?.hits) ? j!.hits : []);
    if (Array.isArray(j?.hits) && j.hits.length === 0) {
      log(
        st?.enabled
          ? "Sin resultados: si acabas de activarla, pulsa «Reindexar» para crear el índice."
          : "La búsqueda no devuelve nada porque la vectorización está desactivada."
      );
    }
  };

  const fecha = st?.indexedAt ? new Date(st.indexedAt).toLocaleString() : "nunca";

  return (
    <div className="rounded-xl border border-[#1b2438] bg-[#0a0f1a]/70 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Database className="w-4 h-4 text-cyan-400 shrink-0" />
          <h3 className="text-sm font-semibold text-zinc-200 truncate">Vectorización de la memoria (RAG local)</h3>
        </div>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border shrink-0 ${
            st?.enabled
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-zinc-700/20 border-zinc-600/40 text-zinc-400"
          }`}
        >
          {st?.enabled ? "ACTIVADA" : "APAGADA"}
        </span>
      </div>

      {/* Por qué está apagada: el dato, no una opinión */}
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
        <div className="rounded-lg bg-[#070b14] border border-[#141d2e] px-2 py-1.5">
          <div className="text-zinc-500">memoria.md</div>
          <div className="text-zinc-200">{st?.memoriaLines ?? "—"} líneas</div>
        </div>
        <div className="rounded-lg bg-[#070b14] border border-[#141d2e] px-2 py-1.5">
          <div className="text-zinc-500">umbral</div>
          <div className="text-zinc-200">{st?.threshold?.toLocaleString("es") ?? "5.000"} líneas</div>
        </div>
        <div className="rounded-lg bg-[#070b14] border border-[#141d2e] px-2 py-1.5">
          <div className="text-zinc-500">trozos indexados</div>
          <div className="text-zinc-200">{st?.chunks ?? 0}{st?.dim ? ` · ${st.dim}d` : ""}</div>
        </div>
        <div className="rounded-lg bg-[#070b14] border border-[#141d2e] px-2 py-1.5">
          <div className="text-zinc-500">último indexado</div>
          <div className="text-zinc-200 truncate">{fecha}</div>
        </div>
      </div>

      <p className="text-[11px] text-zinc-400 leading-relaxed">{st?.recommendation || "Consultando al motor…"}</p>
      {st?.modelUsed && st.modelUsed !== "sin indexar" && (
        <p className="text-[10px] text-zinc-500 font-mono truncate">motor de vectores: {st.modelUsed}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={activar}
          disabled={ocupado || !st}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
            st?.enabled
              ? "bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
              : "bg-cyan-500/15 border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/25"
          } disabled:opacity-50`}
        >
          <Power className="w-3.5 h-3.5" />
          {st?.enabled ? "Desactivar y liberar" : "Activar vectorización"}
        </button>
        <button
          onClick={() => llamar("/api/rag/index", {}, "Índice reconstruido.")}
          disabled={ocupado || !st?.enabled}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#0d1420] border border-[#1b2438] text-zinc-300 hover:bg-[#111a29] disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${ocupado ? "animate-spin" : ""}`} />
          Reindexar
        </button>
        <button
          onClick={() => llamar("/api/rag/clear", {}, "Índice borrado del disco.")}
          disabled={ocupado}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#0d1420] border border-[#1b2438] text-zinc-400 hover:bg-[#111a29] disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Borrar índice
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && probar()}
          placeholder="Probar búsqueda: ¿qué decidimos sobre el blindaje?"
          className="flex-1 min-w-0 bg-[#070b14] border border-[#141d2e] rounded-lg px-2 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-cyan-500/40"
        />
        <button
          onClick={probar}
          disabled={ocupado || !consulta.trim()}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-[#0d1420] border border-[#1b2438] text-zinc-300 hover:bg-[#111a29] disabled:opacity-40"
        >
          <Search className="w-3.5 h-3.5" />
          Buscar
        </button>
      </div>

      {hits.length > 0 && (
        <div className="space-y-1">
          {hits.map((h, i) => (
            <div key={i} className="rounded-lg bg-[#070b14] border border-[#141d2e] px-2 py-1.5">
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-zinc-500">
                <span className="truncate">
                  <BookOpen className="w-3 h-3 inline mr-1" />
                  {h.source}
                </span>
                <span>similitud {h.score.toFixed(2)}</span>
              </div>
              <div className="text-[11px] text-zinc-300 line-clamp-3">{h.text}</div>
            </div>
          ))}
        </div>
      )}

      {aviso && <p className="text-[10px] text-cyan-300/80 font-mono leading-relaxed">{aviso}</p>}

      <p className="text-[10px] text-zinc-500 leading-relaxed">
        Apagada no consume nada: no se calculan vectores, no se llama a ningún modelo y no se lee el índice. Al
        activarla se usan embeddings de <span className="font-mono">{st?.model || "qwen3-embedding:0.6b"}</span> vía
        Ollama. Si ese modelo no está disponible, el motor cae a un vector por hashing y lo indica: funciona sin red,
        pero su calidad es modesta.
      </p>
    </div>
  );
};
