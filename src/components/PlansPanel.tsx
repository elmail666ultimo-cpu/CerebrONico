/**
 * PlansPanel.tsx — LA VENTANA DEL CEREBRO
 * =======================================
 * El motor de tareas funcionaba y sólo se veía por API. Esto es la ventana.
 *
 * Qué muestra, y por qué cada cosa:
 *  - Cada plan con su **estado real** y cada tarea con su marca (✓ ▶ ✗ ⊘ ·), su
 *    peso, su tipo y **por qué está esperando** si está esperando. Un panel que
 *    sólo dice «en curso» obliga a mirar el log del servidor, y eso no es un panel.
 *  - El reparto de la máquina AHORA: tramo MR, escalado ×N, cuántas tareas caben
 *    y cuántas están esperando hueco. Y si va **degradado**, el motivo escrito.
 *  - El botón **«cerebro resiliente ×N»** y el **selector de tramo**, que se
 *    aplican en caliente… también a lo que ya está corriendo.
 *  - Cancelar y reanudar de verdad (el motor cancela en el acto, no «cuando acabe
 *    la siguiente tarea»).
 *
 * Regla de la casa: **nada de adornos que mientan**. Si un plan tiene una tarea
 * fallida, aquí pone «parcial» con la lista de lo que quedó sin hacer. Nunca «ok».
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, CircleDot, Cpu, Gauge, Layers, Loader2, Pause, Play,
  Plus, RefreshCw, RotateCcw, XOctagon,
} from "lucide-react";
import { ResilienceControl } from "./ResilienceControl";

// ─── Tipos de lo que devuelve el servidor ───────────────────────────────────

interface TareaVista {
  id: string;
  titulo: string;
  peso: "io" | "cpu";
  tipo: string;
  estado: string;
  dependeDe: string[];
  intentos: number;
  motivoEspera: string | null;
  ms: number | null;
  error: string | null;
  resultado: string | null;
  artefactos: string[];
  linea: string;
}

interface PlanVista {
  id: string;
  objetivo: string;
  estado: string;
  creadoEn: number;
  enSegundoPlano: boolean;
  tareas: TareaVista[];
  resumen: { hechas: number; fallidas: number; descartadas: number; canceladas: number; bloqueadas: number; sinHacer: string[] };
  noTerminadas: Array<{ id: string; titulo: string; estado: string; motivo: string }>;
  log: string[];
}

interface Presupuesto {
  tramo: string;
  tramoNombre: string;
  ramDelTramoGB: number;
  escalado: number;
  etiqueta: string;
  io: number;
  cpu: number;
  contextoPorTarea: number;
  degradado: boolean;
  motivo: string[];
}

interface RunnerVista {
  escalado: number;
  etiqueta: string;
  escaladosDisponibles: number[];
  tramoFijado: string | null;
  semaforo: { io: { enUso: number; limite: number; esperando: number }; cpu: { enUso: number; limite: number; esperando: number } };
  activos: string[];
  planes: number;
  modeloPorDefecto: string;
  tramosMR: Array<{ id: string; nombre: string; ramGB: number; ioBase: number; cpuBase: number }>;
  presupuesto: Presupuesto;
  notas: string[];
}

const KEY_ANCHO_LISTA = "cn.plans.width";
const ANCHO_MIN = 220;
const ANCHO_MAX = 640;
const ANCHO_POR_DEFECTO = 300;

const COLOR_ESTADO: Record<string, string> = {
  pendiente: "text-zinc-400 bg-zinc-800/60 border-zinc-700",
  lista: "text-sky-300 bg-sky-950/40 border-sky-800",
  en_curso: "text-amber-300 bg-amber-950/40 border-amber-800",
  hecha: "text-emerald-300 bg-emerald-950/40 border-emerald-800",
  fallida: "text-rose-300 bg-rose-950/40 border-rose-800",
  bloqueada: "text-orange-300 bg-orange-950/30 border-orange-800",
  cancelada: "text-zinc-400 bg-zinc-800/60 border-zinc-700",
  descartada: "text-zinc-500 bg-zinc-900 border-zinc-800",
  pausado: "text-amber-200 bg-amber-950/30 border-amber-800",
  hecho: "text-emerald-300 bg-emerald-950/40 border-emerald-800",
  parcial: "text-amber-300 bg-amber-950/40 border-amber-800",
  fallido: "text-rose-300 bg-rose-950/40 border-rose-800",
  cancelado: "text-zinc-400 bg-zinc-800/60 border-zinc-700",
  en_curso_plan: "text-amber-300 bg-amber-950/40 border-amber-800",
};

const MARCA: Record<string, string> = {
  hecha: "✓",
  en_curso: "▶",
  fallida: "✗",
  bloqueada: "⊘",
  cancelada: "⊘",
  lista: "•",
  pendiente: "·",
  descartada: "–",
};

// ─── Ayudantes de artefactos ────────────────────────────────────────────────

/**
 * Un artefacto es una imagen guardada EN EL PROYECTO (no una URL remota) cuando
 * no lleva protocolo y termina en extensión de imagen. Esas se pueden miniaturar
 * con `/api/engine/imagen/vista`; las URLs remotas se dejan como texto (servir de
 * más no es de este panel).
 */
export function esImagenLocal(artefacto: string): boolean {
  const a = (artefacto || "").trim();
  if (!a || /^https?:\/\//i.test(a) || a.startsWith("/")) return false;
  return /\.(jpe?g|png|webp)$/i.test(a);
}

// ─── Ayudante para escribir tareas a mano ───────────────────────────────────

/**
 * Convierte el texto del formulario en tareas para la API.
 * Formato, una por línea:   titulo | tipo | dato | extra | dependeDe
 *
 *   leer package.json | leer_archivo | package.json
 *   paquete a YAML    | convertir    | package.json | json>yaml
 *   resumir hallazgos | modelo       | Resume el archivo leído
 *
 * El `dependeDe` son ids separados por comas. Se devuelven también los avisos,
 * porque una línea mal escrita se explica, no se ignora.
 */
export function parsearTareas(texto: string): { tareas: any[]; avisos: string[] } {
  const avisos: string[] = [];
  const tareas: any[] = [];
  const lineas = texto.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

  lineas.forEach((linea, i) => {
    const partes = linea.split("|").map((p) => p.trim());
    const titulo = partes[0];
    if (!titulo) {
      avisos.push(`Línea ${i + 1}: falta el título.`);
      return;
    }
    const tipoCrudo = (partes[1] || "modelo").toLowerCase();
    const tipo = ["modelo", "leer_archivo", "convertir", "generar_imagen", "reflejo"].includes(tipoCrudo) ? tipoCrudo : "modelo";
    if (tipoCrudo !== tipo) avisos.push(`Línea ${i + 1}: tipo «${tipoCrudo}» no existe; se usa «modelo».`);

    const dato = partes[2] || "";
    const extra = partes[3] || "";
    const deps = (partes[4] || "").split(",").map((d) => d.trim()).filter(Boolean);

    const datos: Record<string, unknown> = {};
    if (tipo === "leer_archivo") {
      if (!dato) avisos.push(`Línea ${i + 1}: «leer_archivo» necesita la ruta en la 3ª columna.`);
      datos.ruta = dato;
      datos.contenido = "";
    } else if (tipo === "convertir") {
      const [desdeCrudo, haciaCrudo] = extra.split(">").map((x) => (x || "").trim());
      if (!dato || !desdeCrudo || !haciaCrudo) {
        avisos.push(`Línea ${i + 1}: «convertir» necesita la 3ª columna (archivo o texto) y la 4ª como origen>destino.`);
      }
      // Se decide si el dato es un archivo o el propio contenido.
      const pareceRuta = /^[\w./-]+\.(json|ya?ml|toml|csv)$/i.test(dato);
      if (pareceRuta) datos.archivo = dato;
      else datos.contenido = dato;
      datos.desde = desdeCrudo;
      datos.hacia = haciaCrudo;
      datos.salida = `${titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-convertido`;
    } else if (tipo === "generar_imagen") {
      // La 3ª columna es el prompt (o se usa el título); la 4ª, opcional, la
      // ruta de salida dentro del proyecto (img/…jpg). El servidor vuelve a
      // validar todo con la misma regla que usa el chat.
      if (!dato) avisos.push(`Línea ${i + 1}: «generar_imagen» sin prompt en la 3ª columna; se usará el título.`);
      datos.prompt = dato || titulo;
      if (extra) datos.salida = extra;
    } else if (tipo === "reflejo") {
      // v2.5 Agéntico: 3ª columna = id de la entidad del consejo; 4ª = frase
      // (para especialistas) o se omite (la herramienta toma datos vacíos y
      // responde con su motivo si le falta algo — nada silencioso).
      if (!dato) avisos.push(`Línea ${i + 1}: «reflejo» necesita el id de la entidad en la 3ª columna (ej. matematico, maq.ram).`);
      datos.entidad = dato || "ayuda";
      if (extra) datos.frase = extra;
    } else {
      datos.prompt = dato || titulo;
    }

    tareas.push({
      id: String(i + 1),
      titulo,
      tipo,
      datos,
      peso: /\b(cpu|indexar|compilar|analizar)\b/i.test(titulo) ? "cpu" : "io",
      dependeDe: deps,
    });
  });

  return { tareas, avisos };
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function PlansPanel(): React.ReactElement {
  const [runner, setRunner] = useState<RunnerVista | null>(null);
  const [planes, setPlanes] = useState<PlanVista[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string>("");
  const [cargando, setCargando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [objetivo, setObjetivo] = useState("");
  const [lineasTareas, setLineasTareas] = useState("");
  const [anchoLista, setAnchoLista] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(KEY_ANCHO_LISTA));
      return Number.isFinite(v) && v >= ANCHO_MIN && v <= ANCHO_MAX ? v : ANCHO_POR_DEFECTO;
    } catch {
      return ANCHO_POR_DEFECTO;
    }
  });
  const arrastrando = useRef(false);

  const hayAlgoCorriendo = useMemo(
    () => planes.some((p) => p.estado === "en_curso" || p.tareas.some((t) => t.estado === "en_curso")) || (runner?.activos.length || 0) > 0,
    [planes, runner]
  );

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const [r1, r2] = await Promise.all([fetch("/api/brain/runner"), fetch("/api/brain/plans")]);
      const j1 = await r1.json();
      const j2 = await r2.json();
      if (j1?.ok) setRunner(j1 as RunnerVista);
      if (j2?.ok) {
        setPlanes((j2.planes || []) as PlanVista[]);
        setSel((actual) => actual || (j2.planes?.[0]?.id ?? null));
      }
    } catch (e: any) {
      setAviso(`No se pudo hablar con el motor: ${e?.message || e}`);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // El chat puede crear un plan mientras este panel ya está abierto. En ese caso
  // no se remonta y seguiría enseñando la foto vieja, así que se recarga al oír el
  // aviso. Sin esto, el plan recién creado tardaría hasta 8 s en aparecer (el
  // intervalo lento) y parecería que no se creó.
  useEffect(() => {
    const alCrear = () => void cargar();
    window.addEventListener("cerebronico:plan-creado", alCrear);
    return () => window.removeEventListener("cerebronico:plan-creado", alCrear);
  }, [cargar]);

  // Refresco: rápido mientras hay trabajo, lento cuando no lo hay. Un panel que
  // refresca cada segundo con todo parado es ruido; con todo parado, no.
  useEffect(() => {
    const ms = hayAlgoCorriendo ? 1500 : 8000;
    const id = setInterval(() => void cargar(true), ms);
    return () => clearInterval(id);
  }, [hayAlgoCorriendo, cargar]);

  const detalle = useMemo(() => planes.find((p) => p.id === sel) || null, [planes, sel]);

  const llamar = useCallback(
    async (url: string, cuerpo?: unknown) => {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo ?? {}),
        });
        const j = await r.json().catch(() => ({}));
        setAviso(j?.message || j?.motivo || j?.error || (j?.ok ? "Hecho." : "No se pudo."));
        await cargar(true);
        return j;
      } catch (e: any) {
        setAviso(`Falló la llamada: ${e?.message || e}`);
        return null;
      }
    },
    [cargar]
  );

  const fijarEscalado = (n: number) => void llamar("/api/brain/scale", { escalado: n });
  const fijarTramo = (t: string) => void llamar("/api/brain/tramo", { tramo: t });

  const crear = async () => {
    const { tareas, avisos } = parsearTareas(lineasTareas);
    if (!objetivo.trim()) return setAviso("Ponle un objetivo al plan.");
    if (tareas.length === 0) return setAviso(`No hay tareas. ${avisos.join(" ")}`);
    const j = await llamar("/api/brain/plan", { objetivo: objetivo.trim(), tareas });
    if (j?.planId) {
      setSel(j.planId);
      setCreando(false);
      setObjetivo("");
      setLineasTareas("");
    }
    if (avisos.length) setAviso((a) => `${a}  ·  ${avisos.join(" ")}`);
  };

  // ─── Arrastre del divisor (preferencia permanente del usuario) ───
  const empezarArrastre = (e: React.MouseEvent) => {
    e.preventDefault();
    arrastrando.current = true;
    const x0 = e.clientX;
    const w0 = anchoLista;
    document.body.style.cursor = "col-resize";
    const mover = (ev: MouseEvent) => setAnchoLista(Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, w0 + ev.clientX - x0)));
    const soltar = () => {
      arrastrando.current = false;
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
      setAnchoLista((w) => {
        try {
          localStorage.setItem(KEY_ANCHO_LISTA, String(w));
        } catch {}
        return w;
      });
    };
    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
  };

  const p = runner?.presupuesto;

  return (
    <div className="flex flex-col h-full min-h-0 bg-zinc-950 text-zinc-200">
      {/* ─── Cabecera: el estado de la máquina, en una línea ─── */}
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-zinc-100">
            <Layers size={14} className="text-violet-400" />
            Planificador
          </div>

          {p && (
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="px-1.5 py-0.5 rounded border border-violet-800 bg-violet-950/40 text-violet-200" title={p.motivo.join(" ")}>
                {p.tramoNombre} · {p.ramDelTramoGB} GB
              </span>
              <span className="flex items-center gap-1" title="Tareas de espera y de cálculo en curso / máximo">
                <Cpu size={12} /> {runner?.semaforo.io.enUso ?? 0}/{runner?.semaforo.io.limite ?? 0} espera ·{" "}
                {runner?.semaforo.cpu.enUso ?? 0}/{runner?.semaforo.cpu.limite ?? 0} cálculo
              </span>
              {(runner?.semaforo.io.esperando || 0) + (runner?.semaforo.cpu.esperando || 0) > 0 && (
                <span className="text-amber-300">
                  {(runner?.semaforo.io.esperando || 0) + (runner?.semaforo.cpu.esperando || 0)} esperando hueco
                </span>
              )}
            </div>
          )}

          <div className="flex-1" />

          <ResilienceControl
            level={runner?.escalado ?? 1}
            levels={runner?.escaladosDisponibles ?? [1, 2, 4, 6, 8]}
            onChange={fijarEscalado}
          />

          <button
            onClick={() => void cargar()}
            className="p-1.5 rounded-md border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            title={cargando ? "Cargando…" : "Recargar ahora"}
          >
            {cargando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
          <button
            onClick={() => setCreando((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-800 bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-200 text-[11px] transition-colors"
            title="Crear un plan a mano"
          >
            <Plus size={13} /> Plan
          </button>
        </div>

        {/* Selector de tramo MR */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[11px]">
          <span className="text-zinc-500">Tramo:</span>
          <button
            onClick={() => fijarTramo("auto")}
            className={`px-2 py-0.5 rounded border transition-colors ${
              !runner?.tramoFijado ? "border-emerald-700 bg-emerald-950/40 text-emerald-200" : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Elegido solo según la RAM de la máquina"
          >
            automático
          </button>
          {(runner?.tramosMR || []).map((t) => (
            <button
              key={t.id}
              onClick={() => fijarTramo(t.id)}
              className={`px-2 py-0.5 rounded border transition-colors ${
                runner?.tramoFijado === t.id ? "border-violet-600 bg-violet-950/50 text-violet-100" : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
              title={`${t.nombre} · ${t.ramGB} GB · ${t.ioBase} tareas de espera y ${t.cpuBase} de cálculo`}
            >
              {t.id} · {t.ramGB} GB
            </button>
          ))}
        </div>

        {/* Motivo cuando va degradado: nunca un número sin explicación */}
        {p?.degradado && (
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-200 bg-amber-950/30 border border-amber-800 rounded px-2 py-1">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>
              <b>Reparto degradado:</b> {p.motivo[p.motivo.length - 1] || p.motivo.join(" ")}
              <br />
              <span className="text-amber-300/80">Se sigue trabajando, sólo que más despacio. Ninguna tarea se descarta por falta de recursos.</span>
            </span>
          </div>
        )}

        {aviso && (
          <div className="mt-2 text-[11px] text-zinc-300 bg-zinc-800/60 border border-zinc-700 rounded px-2 py-1">{aviso}</div>
        )}
      </div>

      {/* ─── Formulario de plan nuevo ─── */}
      {creando && (
        <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/40 px-3 py-2 space-y-2">
          <input
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            placeholder="Objetivo del plan (ej. Traducir la configuración del proyecto)"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-violet-600 outline-none"
          />
          <textarea
            value={lineasTareas}
            onChange={(e) => setLineasTareas(e.target.value)}
            rows={4}
            placeholder={"Una tarea por línea:  titulo | tipo | dato | extra | dependeDe\nleer package.json | leer_archivo | package.json\npaquete a YAML    | convertir    | package.json | json>yaml\ndibujar el logo   | generar_imagen | logo neón minimalista | img/logo.jpg\nresumir           | modelo       | Resume el archivo"}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] font-mono text-zinc-100 placeholder:text-zinc-600 focus:border-violet-600 outline-none resize-y"
          />
          <div className="flex items-center gap-2">
            <button onClick={() => void crear()} className="px-2.5 py-1 rounded border border-emerald-700 bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-100 text-[11px] font-semibold">
              Crear y lanzar
            </button>
            <button onClick={() => setCreando(false)} className="px-2.5 py-1 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]">
              Cancelar
            </button>
            <span className="text-[10px] text-zinc-500">
              tipos: modelo · leer_archivo · convertir · generar_imagen · reflejo. Lo que no se entienda se te dice al crear el plan.
            </span>
          </div>
        </div>
      )}

      {/* ─── Cuerpo: lista | divisor arrastrable | detalle ─── */}
      <div className="flex-1 min-h-0 flex">
        <div style={{ width: anchoLista }} className="shrink-0 overflow-y-auto border-r border-zinc-800">
          {planes.length === 0 && (
            <div className="p-3 text-[11px] text-zinc-500">
              No hay planes todavía. Pulsa <b className="text-zinc-300">Plan</b> para crear uno, o lánzalos por API.
            </div>
          )}
          {planes.map((plan) => {
            const total = plan.tareas.length;
            const ok = plan.resumen.hechas;
            const activo = plan.estado === "en_curso" || plan.enSegundoPlano;
            return (
              <button
                key={plan.id}
                onClick={() => setSel(plan.id)}
                className={`w-full text-left px-2.5 py-2 border-b border-zinc-900 transition-colors ${
                  sel === plan.id ? "bg-violet-950/30 border-l-2 border-l-violet-500" : "hover:bg-zinc-900/60"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {activo && <Loader2 size={11} className="animate-spin text-amber-400" />}
                  <span className="text-[10px] text-zinc-500 font-mono">#{plan.id}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${COLOR_ESTADO[plan.estado] || COLOR_ESTADO.pendiente}`}>{plan.estado}</span>
                  <span className="text-[10px] text-zinc-500 ml-auto">
                    {ok}/{total}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-200 mt-1 line-clamp-2">{plan.objetivo}</div>
                <div className="mt-1 h-1 rounded bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-emerald-600" style={{ width: `${total ? (ok / total) * 100 : 0}%` }} />
                </div>
              </button>
            );
          })}
        </div>

        <div
          onMouseDown={empezarArrastre}
          onDoubleClick={() => {
            setAnchoLista(ANCHO_POR_DEFECTO);
            try {
              localStorage.setItem(KEY_ANCHO_LISTA, String(ANCHO_POR_DEFECTO));
            } catch {}
          }}
          title="Arrastra para ajustar el ancho de la lista (doble clic para 300px)"
          className="w-2 shrink-0 cursor-col-resize bg-zinc-900 hover:bg-violet-700/60 transition-colors"
        />

        <div className="flex-1 min-w-0 overflow-y-auto">
          {!detalle && <div className="p-4 text-[12px] text-zinc-500">Selecciona un plan de la izquierda.</div>}
          {detalle && (
            <div className="p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-zinc-100">{detalle.objetivo}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                    plan {detalle.id} · {new Date(detalle.creadoEn).toLocaleString()}
                  </div>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded border ${COLOR_ESTADO[detalle.estado] || COLOR_ESTADO.pendiente}`}>{detalle.estado}</span>
              </div>

              {/* Agregado honesto */}
              <div className="mt-2 flex items-center gap-3 text-[11px]">
                <span className="text-emerald-300">{detalle.resumen.hechas} hechas</span>
                {detalle.resumen.fallidas > 0 && <span className="text-rose-300">{detalle.resumen.fallidas} fallidas</span>}
                {detalle.resumen.canceladas > 0 && <span className="text-zinc-400">{detalle.resumen.canceladas} canceladas</span>}
                {detalle.resumen.bloqueadas > 0 && <span className="text-orange-300">{detalle.resumen.bloqueadas} bloqueadas</span>}
                <div className="flex-1" />
                <button
                  onClick={() => void llamar(`/api/brain/plan/${detalle.id}/cancel`)}
                  disabled={detalle.estado === "cancelado"}
                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-rose-800 bg-rose-950/40 hover:bg-rose-900/40 disabled:opacity-30 text-rose-200 text-[10px]"
                  title="Se detiene en el acto, sin esperar a que acabe la tarea en curso"
                >
                  <XOctagon size={11} /> Cancelar
                </button>
                <button
                  onClick={() => void llamar(`/api/brain/plan/${detalle.id}/resume`)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-800 bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-200 text-[10px]"
                  title="Retoma sin repetir lo que ya estaba hecho"
                >
                  <RotateCcw size={11} /> Reanudar
                </button>
              </div>

              {detalle.resumen.sinHacer.length > 0 && (
                <div className="mt-2 text-[10px] text-amber-200 bg-amber-950/20 border border-amber-900 rounded px-2 py-1">
                  Sin hacer: {detalle.resumen.sinHacer.join(" · ")}
                </div>
              )}

              {/* Tareas */}
              <div className="mt-3 space-y-1">
                {detalle.tareas.map((t) => (
                  <div key={t.id} className="rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1.5">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className={`w-4 text-center ${t.estado === "hecha" ? "text-emerald-400" : t.estado === "en_curso" ? "text-amber-400" : t.estado === "fallida" ? "text-rose-400" : "text-zinc-500"}`}>
                        {MARCA[t.estado] || "·"}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">#{t.id}</span>
                      <span className="text-zinc-200 truncate">{t.titulo}</span>
                      <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-400" title="Peso: io = espera, cpu = cálculo">
                        {t.peso}
                      </span>
                      <span className="text-[10px] text-violet-300" title="Qué ejecuta esta tarea">
                        {t.tipo}
                      </span>
                      {t.dependeDe.length > 0 && <span className="text-[10px] text-zinc-500">← {t.dependeDe.map((d) => `#${d}`).join(", ")}</span>}
                      <div className="flex-1" />
                      {t.ms != null && <span className="text-[10px] text-zinc-500">{(t.ms / 1000).toFixed(2)}s</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${COLOR_ESTADO[t.estado] || COLOR_ESTADO.pendiente}`}>{t.estado}</span>
                    </div>

                    {t.motivoEspera && <div className="text-[10px] text-zinc-400 mt-1 pl-6">↳ {t.motivoEspera}</div>}
                    {t.error && <div className="text-[10px] text-rose-300 mt-1 pl-6">↳ {t.error}</div>}
                    {t.resultado && (
                      <pre className="text-[10px] text-zinc-300 mt-1 pl-6 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">{t.resultado}</pre>
                    )}
                    {t.artefactos.length > 0 && (
                      <div className="mt-1 pl-6 space-y-1">
                        {/* Las imágenes guardadas en el proyecto se VEN aquí:
                            miniatura servida por /api/engine/imagen/vista.
                            Todo lo que no salga, se dice en el texto. */}
                        {t.artefactos.filter(esImagenLocal).map((a) => (
                          <img
                            key={a}
                            src={`/api/engine/imagen/vista?ruta=${encodeURIComponent(a)}`}
                            alt={a}
                            title={`Imagen guardada: ${a}`}
                            className="h-24 max-w-full rounded border border-zinc-700 object-cover"
                          />
                        ))}
                        <div className="text-[10px] text-sky-300">→ {t.artefactos.join(" · ")}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Traza: lo último que dijo el motor */}
              {detalle.log.length > 0 && (
                <details className="mt-3">
                  <summary className="text-[11px] text-zinc-400 cursor-pointer">Traza del plan ({detalle.log.length} líneas)</summary>
                  <pre className="mt-1 text-[10px] text-zinc-400 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto bg-zinc-900/60 border border-zinc-800 rounded p-2">
                    {detalle.log.join("\n")}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Pie: notas del motor (nada silencioso) ─── */}
      {runner?.notas && runner.notas.length > 0 && (
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-900/40 px-3 py-1.5 max-h-24 overflow-y-auto">
          {runner.notas.slice(-4).map((n, i) => (
            <div key={i} className="text-[10px] text-zinc-400 font-mono truncate">
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
