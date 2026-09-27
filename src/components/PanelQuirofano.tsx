/**
 * PanelQuirofano.tsx — EL QUIRÓFANO A LA VISTA (HD v1)
 * =====================================================
 * El motor QUIRÓFANO ya existía (src/engine/quirofano.ts) y sus tres endpoints
 * (/api/quirofano/estado · /revisar · /deshacer), pero no tenía NINGUNA presencia
 * visual: lo que no se ve, no se usa — y lo que no se usa no da confianza.
 *
 * Este panel es SOLO LECTURA + dos acciones explicitas. No inventa datos: cada
 * pixel sale del JSON real de /api/quirofano/estado. Si el servidor no contesta,
 * lo dice en rojo en vez de fingir una sala vacia.
 *
 * HD: pulso vital en la cabecera, capsulas de estado, tarjetas con borde
 * degradado, informe coloreado por linea (revertido/aviso/ok), bitacora de
 * avisos y botones Revisar / Deshacer con confirmacion. Cero dependencias
 * nuevas: React + lucide-react + Tailwind, el equipo de la casa.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Cross, ScanSearch, Undo2, RefreshCw, FileCode2, AlertTriangle,
  CheckCircle2, XCircle, Activity, ShieldCheck, Loader2, Radio,
} from "lucide-react";

/* ─── contratos de datos (espejo de /api/quirofano/estado en server.ts) ─── */

interface PuertaVista {
  id?: string;
  que?: string;
  ok?: boolean;
  detalle?: string;
  gravedad?: string;
}

interface EstadoQf {
  ok: boolean;
  error?: string;
  gates?: string;
  abierta?: { id: string; motivo: string; archivos: string[] } | null;
  ultimo?: { ok: boolean; revertido: boolean; informe: string; puertas?: PuertaVista[] } | null;
  ultimaOperacion?: { id: string; motivo: string; revertida: boolean; archivos: string[] } | null;
  avisos?: string[];
  /**
   * v1.8.0 · VOZ — las frases «qué es / para qué sirve / estado» de los archivos
   * tocados por la tanda (abierta o última). Vienen ya redactadas por el servidor:
   * el panel no las compone, para que no haya dos redacciones distintas de lo mismo.
   */
  explicaciones?: string[];
  /** v1.8.0 · VOZ — lo que el sistema dice sin que le pregunten (con su certeza). */
  voz?: { tipo: string; texto: string; motivo: string; certeza: string }[];
}

interface ResultadoAccion {
  ok: boolean;
  informe?: string;
  revertido?: boolean;
  restaurados?: string[];
  retirados?: string[];
  puertas?: PuertaVista[];
  error?: string;
}

/* ─── helpers de presentación ─── */

const colorLinea = (l: string): string => {
  if (/REVERTIDO|BLOQUEADO|FALLO|PÉRDIDA|Peligro|peligroso/i.test(l)) return "text-rose-300";
  if (/AVISO|advierte|prevención|≥\s*12/i.test(l)) return "text-amber-300";
  if (/OK|seguro|sano|✓|revertir|deshecho|restaurado/i.test(l)) return "text-emerald-300";
  return "text-zinc-300";
};

const capsula = (activo: boolean) =>
  `flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
    activo
      ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
      : "border-zinc-800 bg-zinc-900/50 text-zinc-500"
  }`;

/* El estado general de la sala manda el color del pulso:
   rojo si la última cirugía se revirtió, cian si hay operación abierta,
   verde si el guardián está en vela y sin sustos, gris si no hay señal. */
type Humor = "cirugia" | "revertido" | "vela" | "apagado";

const humorDe = (e: EstadoQf | null): Humor => {
  if (!e) return "apagado";
  if (e.ultimo?.revertido) return "revertido";
  if (e.abierta) return "cirugia";
  return "vela";
};

const HumorPulso: React.FC<{ humor: Humor }> = ({ humor }) => {
  const color =
    humor === "cirugia" ? "#22d3ee" :
    humor === "revertido" ? "#fb7185" :
    humor === "vela" ? "#34d399" : "#52525b";
  return (
    <span className="relative flex h-3 w-3 shrink-0" aria-hidden>
      <span
        className="absolute inline-flex h-full w-full rounded-full opacity-60 qf-ping"
        style={{ backgroundColor: color }}
      />
      <span className="relative inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
};

/* ─── el panel ─── */

export const PanelQuirofano: React.FC = () => {
  const [estado, setEstado] = useState<EstadoQf | null>(null);
  const [caido, setCaido] = useState<string>("");
  const [ocupado, setOcupado] = useState<"" | "revisar" | "deshacer">("");
  const [resultado, setResultado] = useState<{ accion: string; dato: ResultadoAccion } | null>(null);
  const [confirmaDeshacer, setConfirmaDeshacer] = useState(false);
  const [alVivo, setAlVivo] = useState(true);
  const latido = useRef<number | null>(null);

  const refrescar = useCallback(async () => {
    try {
      const r = await fetch("/api/quirofano/estado");
      const j: EstadoQf = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setEstado(j);
      setCaido("");
    } catch (err: any) {
      setCaido(err?.message || String(err));
    }
  }, []);

  // Latido: 4 s mientras el chat trabaja. Con la pestaña oculta el navegador
  // ya ralentiza los timers, así que no hace falta nada más exótico.
  useEffect(() => {
    refrescar();
    latido.current = window.setInterval(refrescar, 4000);
    return () => { if (latido.current) window.clearInterval(latido.current); };
  }, [refrescar]);

  const accion = useCallback(async (tipo: "revisar" | "deshacer") => {
    setOcupado(tipo);
    try {
      const r = await fetch(`/api/quirofano/${tipo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j: ResultadoAccion = await r.json();
      setResultado({ accion: tipo, dato: j });
      await refrescar();
    } catch (err: any) {
      setResultado({ accion: tipo, dato: { ok: false, informe: err?.message || String(err) } });
    } finally {
      setOcupado("");
      setConfirmaDeshacer(false);
    }
  }, [refrescar]);

  const humor = humorDe(estado);
  const enCirugia = !!estado?.abierta;
  const gates = estado?.gates || "—";
  const pesadas = gates !== "estandar";
  const avisos = Array.isArray(estado?.avisos) ? estado!.avisos! : [];
  // v1.8.0 · VOZ — el panel solo PINTA lo que el servidor ya decidió decir.
  const voz = Array.isArray(estado?.voz) ? estado!.voz! : [];
  const explicaciones = Array.isArray(estado?.explicaciones) ? estado!.explicaciones! : [];

  /** El distintivo de cada tipo de mensaje: se ve de un vistazo qué es urgente. */
  const etiquetaVoz = (tipo: string) =>
    tipo === "aviso"
      ? "bg-amber-500/20 text-amber-300"
      : tipo === "dato"
        ? "bg-sky-500/20 text-sky-300"
        : "bg-zinc-500/20 text-zinc-400";

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto custom-scrollbar bg-[#070b14]/95 text-zinc-300">
      <style>{`
        @keyframes qfPing { 75%,100% { transform: scale(2.2); opacity: 0; } }
        .qf-ping { animation: qfPing 1.8s cubic-bezier(0,0,0.2,1) infinite; }
        @keyframes qfScan { 0% { background-position: 0 -120%; } 100% { background-position: 0 220%; } }
        .qf-scan { background-image: linear-gradient(180deg, transparent 0%, rgba(34,211,238,.10) 45%, rgba(34,211,238,.16) 50%, rgba(34,211,238,.10) 55%, transparent 100%); background-size: 100% 220%; animation: qfScan 5.5s linear infinite; }
        .qf-card { border: 1px solid #1e293b; background: linear-gradient(180deg, #0b101c 0%, #0a0f19 100%); border-radius: 10px; }
      `}</style>

      {/* ═══ CABECERA ═══ */}
      <div className="relative shrink-0 overflow-hidden border-b border-[#141d2e] bg-[#0a0f1a] px-4 py-3">
        <div className="qf-scan pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="relative rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-1.5 shadow-[0_0_18px_rgba(34,211,238,0.25)]">
              <Cross className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-wide text-cyan-100">QUIRÓFANO</span>
                <span className="rounded border border-cyan-700/60 bg-cyan-950/60 px-1.5 py-px text-[9px] font-semibold uppercase tracking-widest text-cyan-400">HD</span>
              </div>
              <div className="text-[10px] text-zinc-500">guardián de cambios · el modelo ya no mutila tus archivos a escondidas</div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className={capsula(enCirugia)}>
              <Activity size={12} className={enCirugia ? "text-cyan-300" : "text-zinc-600"} />
              {enCirugia ? "en cirugía" : "sala libre"}
            </span>
            <span className={capsula(!!estado && !caido)}>
              <HumorPulso humor={humor} />
              {caido ? "sin señal" : humor === "revertido" ? "última revertida" : "en vela"}
            </span>
            <button
              onClick={refrescar}
              title="Refrescar ahora"
              className="rounded-md border border-[#141d2e] bg-[#060a14] p-1.5 text-zinc-400 transition-colors hover:text-cyan-300"
            >
              <RefreshCw size={13} className={ocupado ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Puertas activas */}
        <div className="relative mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">puertas:</span>
          {["sintaxis", "superficie", "imports", "peso"].map((p) => (
            <span key={p} className="rounded border border-emerald-800/60 bg-emerald-950/40 px-1.5 py-px text-[10px] text-emerald-300" title={`puerta estándar · ${p}`}>
              {p}
            </span>
          ))}
          {pesadas && (
            <span className="flex items-center gap-1 rounded border border-fuchsia-700/60 bg-fuchsia-950/40 px-1.5 py-px text-[10px] text-fuchsia-300" title={`QUIROFANO_GATES=${gates}`}>
              <ShieldCheck size={10} /> {gates}
            </span>
          )}
        </div>
      </div>

      {/* ═══ CAÍDO ═══ */}
      {caido && (
        <div className="m-3 flex items-start gap-2 rounded-lg border border-rose-800/70 bg-rose-950/40 p-3 text-[11px] text-rose-200">
          <XCircle size={14} className="mt-px shrink-0 text-rose-400" />
          <div>
            <div className="font-semibold">El Quirofano no responde</div>
            <div className="text-rose-300/80">{caido} — ¿está el servidor levantado? (npm run dev / npm start)</div>
          </div>
        </div>
      )}

      {/* ═══ SALA ABIERTA ═══ */}
      {enCirugia && estado!.abierta && (
        <div className="qf-card m-3 mb-0 p-3 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
          <div className="mb-1.5 flex items-center gap-2">
            <Radio size={13} className="animate-pulse text-cyan-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">operación en curso</span>
            <span className="ml-auto font-mono text-[9px] text-zinc-600">{estado!.abierta.id}</span>
          </div>
          <div className="mb-2 text-[12px] text-zinc-200">{estado!.abierta.motivo || "(sin motivo declarado)"}</div>
          <div className="flex flex-wrap gap-1">
            {estado!.abierta.archivos.slice(0, 24).map((a) => (
              <span key={a} className="flex max-w-full items-center gap-1 rounded border border-[#1e293b] bg-[#060a14] px-1.5 py-px font-mono text-[10px] text-zinc-400">
                <FileCode2 size={9} className="shrink-0 text-cyan-600" />
                <span className="truncate">{a}</span>
              </span>
            ))}
            {estado!.abierta.archivos.length > 24 && (
              <span className="px-1 text-[10px] text-zinc-600">+{estado!.abierta.archivos.length - 24} más</span>
            )}
          </div>
        </div>
      )}

      {/* ═══ ÚLTIMA CIRUGÍA ═══ */}
      <div className="qf-card m-3 mb-0 p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${
            estado?.ultimo?.revertido ? "bg-rose-400" : estado?.ultimo ? "bg-emerald-400" : "bg-zinc-700"
          }`} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">última cirugía</span>
          {estado?.ultimaOperacion && (
            <span className="ml-auto text-[10px] text-zinc-600">
              {estado.ultimaOperacion.archivos.length} archivo(s) · {estado.ultimaOperacion.revertida ? "revertida" : "guardada"}
            </span>
          )}
        </div>
        {!estado?.ultimo && !enCirugia && (
          <div className="text-[11px] text-zinc-600">Sin operaciones registradas todavía. El guardián espera su primera cirugía.</div>
        )}
        {estado?.ultimo && (
          <div className="whitespace-pre-wrap break-words font-mono text-[10.5px] leading-relaxed">
            {estado.ultimo.informe.split("\n").map((l, i) => (
              <div key={i} className={colorLinea(l)}>{l || " "}</div>
            ))}
          </div>
        )}
        {estado?.ultimo?.puertas && estado.ultimo.puertas.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {estado.ultimo.puertas.map((p, i) => (
              <span
                key={p?.id || i}
                title={p?.detalle || p?.que || ""}
                className={`flex items-center gap-1 rounded border px-1.5 py-px text-[10px] ${
                  p?.ok === false
                    ? "border-rose-800/70 bg-rose-950/40 text-rose-300"
                    : "border-emerald-800/60 bg-emerald-950/40 text-emerald-300"
                }`}
              >
                {p?.ok === false ? <XCircle size={9} /> : <CheckCircle2 size={9} />}
                {p?.id || `puerta ${i + 1}`}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ═══ RESULTADO DE LA ACCIÓN PEDIDA ═══ */}
      {resultado && (
        <div className={`qf-card m-3 mb-0 p-3 ${resultado.dato.ok === false ? "border-rose-800/60" : "border-cyan-800/50"}`}>
          <div className="mb-1 flex items-center gap-2">
            {resultado.dato.ok === false
              ? <AlertTriangle size={13} className="text-rose-400" />
              : <CheckCircle2 size={13} className="text-emerald-400" />}
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
              {resultado.accion === "revisar" ? "revisión manual" : "deshacer"}
            </span>
            <button onClick={() => setResultado(null)} className="ml-auto text-[10px] text-zinc-600 hover:text-zinc-300">✕ ocultar</button>
          </div>
          {resultado.dato.informe && (
            <div className="whitespace-pre-wrap break-words font-mono text-[10.5px] leading-relaxed">
              {resultado.dato.informe.split("\n").map((l, i) => (
                <div key={i} className={colorLinea(l)}>{l || " "}</div>
              ))}
            </div>
          )}
          {Array.isArray(resultado.dato.restaurados) && resultado.dato.restaurados.length > 0 && (
            <div className="mt-1.5 text-[10px] text-emerald-400/90">↺ restaurados: {resultado.dato.restaurados.slice(0, 12).join(", ")}{resultado.dato.restaurados.length > 12 ? ` +${resultado.dato.restaurados.length - 12}` : ""}</div>
          )}
          {Array.isArray(resultado.dato.retirados) && resultado.dato.retirados.length > 0 && (
            <div className="mt-1 text-[10px] text-amber-400/90">✂ retirados: {resultado.dato.retirados.slice(0, 12).join(", ")}{resultado.dato.retirados.length > 12 ? ` +${resultado.dato.retirados.length - 12}` : ""}</div>
          )}
        </div>
      )}

      {/* ═══ BITÁCORA ═══ */}
      <div className="qf-card m-3 mb-0 p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">bitácora del quirófano</span>
          <span className="ml-auto text-[10px] text-zinc-600">{avisos.length} aviso(s)</span>
        </div>
        {avisos.length === 0 ? (
          <div className="text-[11px] text-zinc-600">Sin avisos. Silencio de quirófano: es buena señal.</div>
        ) : (
          <ul className="space-y-1">
            {avisos.slice(0, 8).map((a, i) => (
              <li key={i} className={`flex items-start gap-1.5 font-mono text-[10.5px] ${colorLinea(a)}`}>
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-current opacity-60" />
                <span className="break-words">{a}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ═══ v1.8.0 · VOZ: lo que el sistema dice sin que le pregunten ═══
          Aparece aquí porque este panel es el sitio donde ya se mira el estado
          del trabajo. Un mensaje útil que exige abrir otro sitio para leerlo es
          un mensaje que no se lee. */}
      <div className="qf-card m-3 mb-0 p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">voz del sistema</span>
          <span className="ml-auto text-[10px] text-zinc-600">{voz.length} mensaje(s)</span>
        </div>
        {voz.length === 0 ? (
          <div className="text-[11px] text-zinc-600">
            Nada nuevo que decir. No habla por hablar: cada cosa se dice una vez.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {voz.slice(0, 6).map((m, i) => (
              <li key={i} className="flex items-start gap-1.5 font-mono text-[10.5px]">
                <span className={`shrink-0 rounded px-1 uppercase ${etiquetaVoz(m.tipo)}`}>{m.tipo}</span>
                <span className="break-words text-zinc-300">{m.texto}</span>
                <span className="ml-auto shrink-0 text-[9px] text-zinc-600" title={m.motivo}>
                  {m.certeza}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ═══ v1.8.0 · QUÉ ES Y PARA QUÉ SIRVE CADA ARCHIVO TOCADO ═══ */}
      {explicaciones.length > 0 && (
        <div className="qf-card m-3 mb-0 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">qué es y para qué sirve</span>
            <span className="ml-auto text-[10px] text-zinc-600">{explicaciones.length} archivo(s)</span>
          </div>
          <ul className="space-y-1">
            {explicaciones.slice(0, 12).map((e, i) => (
              <li key={i} className="break-words font-mono text-[10.5px] text-zinc-400">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ═══ CONTROLES ═══ */}
      <div className="sticky bottom-0 mt-auto flex items-center gap-2 border-t border-[#141d2e] bg-[#0a0f1a]/95 p-3 backdrop-blur">
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <input
            type="checkbox"
            checked={alVivo}
            onChange={(e) => {
              const v = e.target.checked;
              setAlVivo(v);
              if (v && !latido.current) latido.current = window.setInterval(refrescar, 4000);
              if (!v && latido.current) { window.clearInterval(latido.current); latido.current = null; }
            }}
            className="accent-cyan-500"
          />
          en vivo (4 s)
        </label>

        <div className="ml-auto flex items-center gap-2">
          {confirmaDeshacer ? (
            <>
              <span className="text-[10.5px] text-amber-300">¿Devolver el proyecto al estado anterior a la última tanda?</span>
              <button
                onClick={() => accion("deshacer")}
                disabled={!!ocupado}
                className="flex items-center gap-1.5 rounded-md border border-rose-700/70 bg-rose-900/40 px-3 py-1.5 text-[11px] font-semibold text-rose-200 transition-colors hover:bg-rose-900/70 disabled:opacity-50"
              >
                {ocupado === "deshacer" ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
                Sí, deshacer
              </button>
              <button
                onClick={() => setConfirmaDeshacer(false)}
                className="rounded-md border border-[#141d2e] bg-[#060a14] px-2.5 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200"
              >
                No
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => accion("revisar")}
                disabled={!!ocupado || !estado}
                title="Cierra la operación actual, corre las cuatro puertas y muestra el informe"
                className="flex items-center gap-1.5 rounded-md border border-cyan-700/70 bg-cyan-900/30 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-900/60 disabled:opacity-50"
              >
                {ocupado === "revisar" ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />}
                Revisar ahora
              </button>
              <button
                onClick={() => setConfirmaDeshacer(true)}
                disabled={!!ocupado || !estado?.ultimaOperacion}
                title="Vuelve a los archivos tal como estaban antes de la última operación del modelo"
                className="flex items-center gap-1.5 rounded-md border border-[#141d2e] bg-[#060a14] px-3 py-1.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-rose-800/70 hover:text-rose-300 disabled:opacity-40"
              >
                {ocupado === "deshacer" ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
                Deshacer última
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PanelQuirofano;
