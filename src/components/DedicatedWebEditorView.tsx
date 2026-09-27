/**
 * DedicatedWebEditorView.tsx — Editor web guiado por IA (v2.0)
 * ===========================================================
 * QUÉ CAMBIA RESPECTO A LA v1.1 (los 3 problemas que reportaste)
 *
 * 1. "UN MENSAJE DADO AL EDITOR PASA POR EL CHAT CENTRAL Y EL CHAT SE ANULA"
 *    Antes: el editor mandaba la orden a `onSendAIToChat` → chat central, y el
 *    editor NO veía la respuesta (solo un setTimeout falso de 1.500 ms que
 *    decía "¡Aplicado!" pasara lo que pasara). Encima el chat central quedaba
 *    sustituido por esta vista, así que la orden viajaba a una pantalla que no
 *    estabas mirando.
 *    Ahora: el editor es un CLIENTE DIRECTO del motor. Envía la orden, escucha
 *    el stream de verdad, muestra el estado real (enviando → generando →
 *    aplicando → aplicado / error) y captura las acciones del agente en su
 *    propio registro de actividad. El chat lateral es opcional y no hace falta
 *    para nada.
 *
 * 2. "EL EDITOR NO REPRODUCE EN EL NAVEGADOR WEB" (preview en blanco)
 *    El iframe se refrescaba con un temporizador, no cuando los archivos
 *    llegaban al sandbox. Ahora escucha el evento real `cerebronico:autosync-done`
 *    que dispara la sincronización al disco, más un refresco de seguridad, y
 *    muestra el estado del sandbox (cargando / vacío / error) en lugar de un
 *    rectángulo blanco sin explicación.
 *
 * 3. "FALTA BOTÓN PANTALLA COMPLETA" y "CUANDO OCULTO LA IA SE RECORTA EL TÍTULO"
 *    El componente de la v1.1 definía toggleFullscreen y importaba Maximize2,
 *    pero NUNCA los renderizaba. Ahora hay botón real (con estado), atajo de
 *    teclado y una barra superior que no se corta: el bloque de la izquierda es
 *    fijo, el del centro es fijo y el título/URL es el único que se recorta con
 *    `min-w-0 truncate`. El marco del preview ocupa TODO el ancho disponible.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { alternarPantallaCompleta, type ElementoPantalla } from "../engine/pantallaCompleta"; // v1.6.6 — pantalla completa en un solo sitio
import {
  Eye, EyeOff, Monitor, Smartphone, Sparkles, Plus, Square, Code, Layout,
  Send, X, Maximize2, Minimize2, ExternalLink, RefreshCw, Activity, AlertTriangle,
} from "lucide-react";
// v2.1 — Claves de persistencia y límites de los desplazadores de esta vista.
import { LS_KEYS, WEB_EDITOR_LIMITS } from "../constants";

export interface WebEditorStatus {
  phase: "idle" | "sending" | "streaming" | "applying" | "done" | "error";
  message?: string;
  /** Última línea de actividad del agente (archivos escritos, acciones…) */
  activity?: string[];
}

interface DedicatedWebEditorViewProps {
  /** URL del sandbox en :3500 */
  sandboxUrl: string;
  /** Volver al IDE completo */
  onBackToIDE: () => void;
  /**
   * v2.0 — ORDEN DIRECTA. Debe enviar la instrucción al motor y devolver el
   * control; el estado real llega por la prop `status`.
   */
  onDirectOrder?: (prompt: string) => void;
  /** Estado real del motor, calculado en App.tsx */
  status?: WebEditorStatus;
  /** ¿Sigue generando el modelo? (para bloquear el botón) */
  isBusy?: boolean;
  /** Registro de acciones del agente para el panel de actividad */
  activityLog?: string[];
  /** v2.1 — 🐞 "Esto nunca se borra?": el panel de actividad no tenía forma de
   *  limpiarse, así que se acumulaba para siempre. */
  onClearActivityLog?: () => void;
  /* v2.1 — Se eliminó `chatSlot`: esta vista montaba un SEGUNDO ChatCenter y
     había dos chats con estado independiente. Ahora hay uno solo, el central. */
  /** Estado del sandbox para explicar un preview vacío */
  sandboxRunning?: boolean;
}

type PreviewMode = "desktop" | "mobile";

export const DedicatedWebEditorView: React.FC<DedicatedWebEditorViewProps> = ({
  sandboxUrl,
  onBackToIDE,
  onDirectOrder,
  status,
  isBusy,
  activityLog = [],
  onClearActivityLog,
  sandboxRunning,
}) => {
  // ============================================================
  // v2.1 — 🐞 EL BORRADOR DE LA ORDEN NO SOBREVIVÍA AL CAMBIO DE PESTAÑA.
  // Esta vista se monta y se desmonta al cambiar de pestaña, así que el estado
  // local se perdía: escribías la orden, mirabas el chat, volvías… y estaba
  // vacía. Ahora se guarda en disco y se restaura al volver.
  // ============================================================
  const [avisoOcupada, setAvisoOcupada] = useState(""); // v2.6.1 — busy ya no es silencio
  const [promptIA, setPromptIA] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_KEYS.WEB_ORDER_DRAFT) || "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.WEB_ORDER_DRAFT, promptIA);
    } catch {}
  }, [promptIA]);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [iframeKey, setIframeKey] = useState(0);
  const [previewListo, setPreviewListo] = useState(false);

  // v1.6.14 — 🐞 «el sandbox arranca, pero hasta que no salgo del IDE, voy a
  // Google y entro en localhost:3500 no carga».
  //
  // El iframe cargaba UNA sola vez, antes de que el puerto 3500 respondiera. El
  // navegador guardaba esa página en blanco y no volvía a intentarlo: el preview
  // quedaba muerto hasta que el usuario abría la URL a mano —lo que además
  // calentaba el servidor— y recargaba. Aquí se sondea el puerto y, en cuanto
  // responde, se carga de verdad. Y al volver a la pestaña se reintenta solo:
  // exactamente lo que el usuario hacía a mano, pero automático.
  useEffect(() => {
    if (!sandboxUrl) return;
    let vivo = true;
    let intentos = 0;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const probar = async () => {
      if (!vivo) return;
      try {
        // `no-cors` basta: solo interesa si el puerto CONTESTA.
        await fetch(sandboxUrl, { mode: "no-cors", cache: "no-store" });
        if (!vivo) return;
        setPreviewListo(true);
        setIframeKey((k) => k + 1); // fuerza una carga limpia
        return;
      } catch {
        /* todavía no está: se reintenta */
      }
      intentos += 1;
      if (intentos >= 20) return;
      temporizador = setTimeout(probar, Math.min(800 + intentos * 400, 4000));
    };

    void probar();

    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      intentos = 0;
      void probar();
    };
    window.addEventListener("focus", alVolver);
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      vivo = false;
      if (temporizador) clearTimeout(temporizador);
      window.removeEventListener("focus", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [sandboxUrl]);

  // ============================================================
  // v8.0.3 — 🐞 «EL EDITOR WEB NUNCA HA FUNCIONADO» (cazado, con las dos piezas)
  // ------------------------------------------------------------
  // La queja era «el editor web? hasta ahora no ha funcionado». No era un
  // problema de render: eran DOS fallos encadenados, y el segundo es el que hacía
  // que pareciera roto para siempre.
  //
  //  1) ESTA VISTA NUNCA ARRANCABA EL SANDBOX. En todo el proyecto, el único sitio
  //     que llama a `/api/sandbox/start` es el panel «Sandbox» de la barra LATERAL
  //     derecha (RightSidebar.tsx). Quien abría «Modo Web» sin haber pasado antes
  //     por ese panel se quedaba con un iframe apuntando a un puerto muerto
  //     (:3500) y ningún botón para arreglarlo DESDE la pantalla que estaba
  //     mirando. El editor web no fallaba: le faltaba el paso 1.
  //
  //  2) LA EXPLICACIÓN DEL HUECO NO PODÍA APARECER NUNCA. Este componente recibe
  //     `sandboxRunning` y pinta con él el punto de estado y el aviso «El sandbox
  //     (:3500) no está corriendo». Pero en App.tsx ese valor era
  //     `useState(true)` y **nadie lo escribía jamás**: `setSandboxRunning` no se
  //     llamaba en ningún sitio del proyecto. Un indicador clavado en verde
  //     tapando justo el fallo que existía para explicar. Peor que no tenerlo.
  //
  // El arreglo: la vista averigua POR SÍ MISMA si el sandbox está vivo, lo arranca
  // si no lo está, y si aun así no puede, lo dice con su motivo y su botón. Ya no
  // depende de que el usuario encuentre el panel correcto.
  // ============================================================
  // `sandboxRunning` se usa como PISTA INICIAL (evita pintar «comprobando» si
  // quien nos monta ya sabe que está caído). La comprobación real manda siempre:
  // la prop ya no puede dejar el indicador clavado en verde.
  const [sbEstado, setSbEstado] = useState<"comprobando" | "vivo" | "muerto" | "arrancando">(
    sandboxRunning === false ? "muerto" : "comprobando"
  );
  const [sbDetalle, setSbDetalle] = useState<string>("");
  /** Un solo intento automático por montaje: no entrar en bucle de arranques. */
  const sbAutoIntentado = useRef(false);

  /** Pregunta al motor si el sandbox está vivo. */
  const probarSandbox = useCallback(async (): Promise<boolean> => {
    try {
      const r = await fetch("/api/sandbox/status");
      const d: any = await r.json().catch(() => ({}));
      const vivo = !!(d && (d.online === true || d.running === true));
      setSbEstado(vivo ? "vivo" : "muerto");
      setSbDetalle(vivo ? "" : String(d?.motivo || d?.message || "El sandbox no está arrancado."));
      return vivo;
    } catch (e: any) {
      setSbEstado("muerto");
      setSbDetalle(`No se pudo preguntar al motor: ${e?.message || e}`);
      return false;
    }
  }, []);

  /** Arranca el sandbox. Mismo protocolo que el panel lateral, incluida la
   *  confirmación cuando el proyecto ES la propia IDE. */
  const arrancarSandbox = useCallback(async () => {
    setSbEstado("arrancando");
    setSbDetalle("");
    try {
      let r = await fetch("/api/sandbox/start", { method: "POST" });
      let d: any = await r.json().catch(() => ({}));
      if (d?.requiereConfirmacion) {
        r = await fetch("/api/sandbox/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmar: "recursion" }),
        });
        d = await r.json().catch(() => ({}));
      }
      if (d?.ok) {
        setSbEstado("vivo");
        setSbDetalle("");
        // Recarga el iframe para que no se quede con el error de conexión previo.
        setIframeKey((k) => k + 1);
      } else {
        setSbEstado("muerto");
        setSbDetalle(String(d?.error || d?.message || "El motor no pudo arrancar el sandbox."));
      }
    } catch (e: any) {
      setSbEstado("muerto");
      setSbDetalle(`Fallo al arrancar el sandbox: ${e?.message || e}`);
    }
  }, []);

  // Al abrir la pestaña: comprobar; y si está muerto, arrancarlo UNA vez sin que
  // el usuario tenga que saber que existe un panel lateral para eso.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const vivo = await probarSandbox();
      if (cancelado || vivo || sbAutoIntentado.current) return;
      sbAutoIntentado.current = true;
      await arrancarSandbox();
    })();
    return () => {
      cancelado = true;
    };
  }, [probarSandbox, arrancarSandbox]);

  const [showAITools, setShowAITools] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastRefreshReason, setLastRefreshReason] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef<HTMLTextAreaElement>(null);

  // ============================================================
  // v2.1 — DESPLAZADORES EN ESTA PANTALLA (pedido del usuario, 3ª vez).
  // ------------------------------------------------------------
  // Esta vista tenía DOS columnas de ancho FIJO —la de instrucciones (w-64) y
  // la del chat (w-80)— y ninguna se podía mover. En una pantalla de 1366 px el
  // previsualizador se quedaba con lo que sobraba (~230 px) y el usuario no
  // tenía manera de darle más sitio. Ahora las dos son arrastrables, con doble
  // clic para restablecer y ancho recordado entre sesiones.
  // ============================================================
  const [sideWidth, setSideWidth] = useState<number>(() => {
    try {
      const g = Number(localStorage.getItem(LS_KEYS.WEB_SIDE_WIDTH));
      if (Number.isFinite(g) && g >= WEB_EDITOR_LIMITS.SIDE_MIN && g <= WEB_EDITOR_LIMITS.SIDE_MAX) return g;
    } catch {}
    return WEB_EDITOR_LIMITS.SIDE_DEFAULT;
  });
  // (v2.1: el ancho de la columna de chat ya no existe — se eliminó ese chat.)

  /** Persiste el ancho elegido (sin depender de efectos). */
  const guardarAncho = (clave: string, v: number) => {
    try {
      localStorage.setItem(clave, String(v));
    } catch {}
  };

  /** Arrastre horizontal, reutilizado por los dos desplazadores de esta vista. */
  const startDrag = (
    e: React.MouseEvent,
    actual: number,
    min: number,
    max: number,
    clave: string,
    set: (n: number) => void
  ) => {
    e.preventDefault();
    const x0 = e.clientX;
    const mover = (ev: MouseEvent) => {
      const nuevo = Math.max(min, Math.min(max, actual + (ev.clientX - x0)));
      set(nuevo);
      guardarAncho(clave, nuevo);
    };
    const soltar = () => {
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
  };

  const refreshPreview = useCallback((reason: string) => {
    setIframeKey((k) => k + 1);
    setLastRefreshReason(reason);
  }, []);

  // ---------- Pantalla completa REAL (el botón que faltaba) ----------
  /**
   * v1.6.6 — 🐞 «el botón de salir de pantalla completa no anda».
   *
   * Aquí estaba el fallo, y era de una asimetría de una línea: la LLAMADA
   * contemplaba `requestFullscreen` y `webkitRequestFullscreen`, pero la
   * PREGUNTA solo miraba `document.fullscreenElement`. En un motor que exponga
   * únicamente el nombre prefijado, esa lectura vale `undefined` siempre — así
   * que la condición entraba por la rama de «entrar» incluso estando dentro:
   * pulsar «Salir» volvía a pedir pantalla completa. El botón no estaba muerto,
   * estaba eligiendo lo contrario.
   *
   * Y el `.catch(() => {})` escondía el motivo. Ahora el fallo se enseña.
   */
  const [avisoPantalla, setAvisoPantalla] = useState("");

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    void alternarPantallaCompleta(document, el as unknown as ElementoPantalla).then((r) => {
      setAvisoPantalla(r.ok ? "" : `${r.accion === "salir" ? "Salir" : "Entrar"} no funcionó: ${r.motivo ?? "sin motivo"}`);
    });
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler as any);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler as any);
    };
  }, []);

  // F11 dentro del editor web
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // v1.6.6 — El IDE entero escucha F11 en `window` y ya llama a
      // `preventDefault()`. Con DOS dueños de la misma tecla, los dos disparaban
      // en el mismo instante sobre elementos distintos y el navegador rechazaba
      // el segundo — rechazo que además se tragaba el `.catch` vacío. Si la
      // tecla ya la atendió el IDE, aquí no se toca: un dueño por tecla.
      if (e.defaultPrevented) return;
      if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  // ---------- Refresco del preview dirigido por EVENTOS REALES ----------
  useEffect(() => {
    const onAutoSync = () => refreshPreview("auto-sync al sandbox");
    window.addEventListener("cerebronico:autosync-done", onAutoSync);
    return () => window.removeEventListener("cerebronico:autosync-done", onAutoSync);
  }, [refreshPreview]);

  // Cuando el modelo TERMINA, además del autosync se refresca por si acaso el
  // sandbox no estaba levantado en ese instante.
  useEffect(() => {
    if (status?.phase === "done") refreshPreview("fin de la generación");
  }, [status?.phase, refreshPreview]);

  const phase = status?.phase || "idle";
  const busy = isBusy || phase === "sending" || phase === "streaming" || phase === "applying";

  const handleApplyAIChanges = () => {
    const text = promptIA.trim();
    if (!text) return;
    if (busy) {
      setAvisoOcupada("Hay una orden en curso: el motor no ha liberado el canal. Si pasa de un minuto sin respuesta, el modelo está caído — repite la orden en el Chat para leer el error.");
      return;
    }
    setAvisoOcupada("");
    // v2.0 — Orden DIRECTA al motor: sin pasar por el chat central.
    if (onDirectOrder) {
      onDirectOrder(text);
    }
    setPromptIA("");
    orderRef.current?.focus();
  };

  const quickBlocks: { id: string; label: string; icon: React.ElementType; prompt: string }[] = [
    { id: "navbar", label: "Navbar", icon: Layout, prompt: "Añade un navbar moderno fijo al top con logo, links y un botón CTA." },
    { id: "hero", label: "Hero", icon: Sparkles, prompt: "Añade una sección hero con título grande, subtítulo, dos botones (primario y secundario) y una imagen de fondo con gradiente." },
    { id: "cards", label: "Cards", icon: Square, prompt: "Añade una sección de cards/features (3 tarjetas) con icono, título y descripción." },
    { id: "testimonials", label: "Testimonios", icon: Code, prompt: "Añade una sección de testimonios con 3 tarjetas oscuras, foto, nombre y texto." },
    { id: "footer", label: "Footer", icon: Layout, prompt: "Añade un footer con enlaces, copyright y redes sociales." },
    { id: "cta", label: "CTA", icon: Send, prompt: "Añade una sección CTA (call to action) con título, texto y un botón grande antes del footer." },
  ];

  const phaseLabel: Record<typeof phase, string> = {
    idle: "Listo",
    sending: "Enviando orden…",
    streaming: "Generando cambios…",
    applying: "Aplicando al sandbox…",
    done: "Aplicado",
    error: "Error",
  };
  const phaseColor: Record<typeof phase, string> = {
    idle: "text-zinc-400 border-zinc-700",
    sending: "text-cyan-300 border-cyan-500/40",
    streaming: "text-amber-300 border-amber-500/40",
    applying: "text-cyan-300 border-cyan-500/40",
    done: "text-emerald-300 border-emerald-500/40",
    error: "text-red-300 border-red-500/40",
  };

  return (
    <div
      ref={containerRef}
      className="cn-web-editor flex h-full w-full bg-transparent text-slate-200 overflow-hidden"
    >
      {/* ---------- Panel izquierdo: orden al diseñador IA ---------- */}
      {/* v2.0 — Columna de instrucciones algo más estrecha: el previsualizador
          es el protagonista de esta pestaña, no el panel de texto. */}
      {showAITools && (
        <div
          style={{ width: `${sideWidth}px` }}
          className="border-r border-slate-800 flex flex-col bg-slate-900/60 backdrop-blur-md shrink-0"
        >
          <div className="p-2.5 border-b border-slate-800 font-semibold text-sm flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="truncate">Editor Web &amp; IA</span>
            </span>
            <span className={`text-[11px] px-1.5 py-0.5 rounded border shrink-0 ${phaseColor[phase]}`}>
              {phaseLabel[phase]}
            </span>
          </div>

          <div className="p-3 flex-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar">
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                Orden directa al editor
              </label>
              <textarea
                ref={orderRef}
                value={promptIA}
                onChange={(e) => setPromptIA(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleApplyAIChanges();
                  }
                }}
                placeholder="Ej: añade una sección de testimonios con tarjetas oscuras…  (Ctrl+Enter para enviar)"
                /* v2.1 — Más alto y con letra mayor: era el único sitio donde se
                   escribe la orden y estaba en 12px con 86px de alto. */
                rows={6}
                className="w-full p-2.5 bg-slate-950 text-sm rounded-lg border border-slate-800 focus:outline-none focus:border-cyan-500 resize-y text-slate-200 placeholder-slate-500 min-h-[130px]"
              />
              <button
                onClick={handleApplyAIChanges}
                disabled={!promptIA.trim() || busy}
                className="py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition shadow-md shadow-cyan-950/30 flex items-center justify-center gap-1.5"
              >
                {busy ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {phaseLabel[phase]}
                  </>
                ) : (
                  <>
                    <Send className="w-3 h-3" />
                    Enviar al editor (Ctrl+Enter)
                  </>
                )}
              </button>
              {avisoOcupada && (
                <p className="text-[11px] leading-relaxed text-amber-300">⚠ {avisoOcupada}</p>
              )}
              {status?.message && (
                <p className={`text-[11px] leading-relaxed ${phase === "error" ? "text-red-300" : "text-cyan-300"}`}>
                  {status.message}
                </p>
              )}
              <p className="text-[11px] text-slate-500 leading-relaxed">
                La orden va <strong>directamente al motor</strong>: no depende del chat central. El preview se refresca
                cuando los archivos llegan de verdad al sandbox.
              </p>
            </div>

            <hr className="border-slate-800" />

            <div className="flex flex-col gap-2">
              <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                <Layout className="w-3 h-3 text-amber-400" />
                Bloques rápidos
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {quickBlocks.map((b) => {
                  const Icon = b.icon;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setPromptIA(b.prompt)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 hover:border-cyan-500/40 border border-slate-700 rounded text-[11px] text-left text-slate-300 transition-all flex items-center gap-1.5"
                      title={b.prompt}
                    >
                      <Icon className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span className="truncate">{b.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <hr className="border-slate-800" />

            {/* Registro de actividad REAL (antes no existía: el editor decía
                "¡Aplicado!" sin saber si algo se había aplicado). */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  Actividad del agente
                </span>
                {onClearActivityLog && activityLog.length > 0 && (
                  <button
                    onClick={onClearActivityLog}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-600/60 transition-colors shrink-0"
                    title="Vaciar el registro de actividad"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2 max-h-40 overflow-y-auto custom-scrollbar font-mono text-[11px] leading-relaxed text-slate-400">
                {activityLog.length === 0 ? (
                  <span className="text-slate-600">Sin actividad todavía.</span>
                ) : (
                  activityLog.slice(-40).map((line, i) => <div key={i}>{line}</div>)
                )}
              </div>
            </div>

            <button
              onClick={() => refreshPreview("refresco manual")}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 border border-slate-700"
            >
              <Eye className="w-3.5 h-3.5" />
              Refrescar preview
            </button>
          </div>
        </div>
      )}

      {/* ---------- Chat opcional (no es necesario para que el editor funcione) ---------- */}
      {/* v2.1 — DESPLAZADOR de la columna de instrucciones.
          Va DESPUÉS de la columna y solo existe si la columna existe: un
          desplazador sin nada que desplazar es un adorno que confunde. */}
      {showAITools && (
        <div
          onMouseDown={(e) =>
            startDrag(e, sideWidth, WEB_EDITOR_LIMITS.SIDE_MIN, WEB_EDITOR_LIMITS.SIDE_MAX, LS_KEYS.WEB_SIDE_WIDTH, setSideWidth)
          }
          onDoubleClick={() => {
            setSideWidth(WEB_EDITOR_LIMITS.SIDE_DEFAULT);
            guardarAncho(LS_KEYS.WEB_SIDE_WIDTH, WEB_EDITOR_LIMITS.SIDE_DEFAULT);
          }}
          className="w-[6px] shrink-0 cursor-col-resize bg-slate-900/40 hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors flex items-center justify-center group"
          title="Arrastra para ensanchar o estrechar el panel de instrucciones · doble clic para restablecer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar el panel de instrucciones"
        >
          <div className="w-[2px] h-10 rounded-full bg-slate-700 group-hover:bg-cyan-300 transition-colors" />
        </div>
      )}

      {/* v2.1 — La columna del CHAT ya NO existe en esta vista.
          Se eliminó el segundo chat: había DOS chats vivos con estado
          independiente y el usuario escribía en uno creyendo que era el mismo.
          Ahora hay uno solo (el central) y esta vista es solo la mesa de
          trabajo: recibe la orden, la ensambla y la previsualiza. */}

      {/* ---------- Lienzo ---------- */}
      <div className="flex-1 flex flex-col bg-transparent min-w-0">
        {/* Barra superior: bloques fijos a izquierda y derecha, y SOLO el
            título/URL central se recorta. Esto arregla el "cuando oculto la IA
            se recorta el título". */}
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-800 bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onBackToIDE}
              className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 rounded-lg text-xs font-medium transition border border-slate-700 whitespace-nowrap"
              title="Volver al IDE completo"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Volver al IDE</span>
            </button>
            <button
              onClick={() => setShowAITools(!showAITools)}
              className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition border border-slate-700 whitespace-nowrap"
              title={showAITools ? "Ocultar panel de IA" : "Mostrar panel de IA"}
            >
              {showAITools ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="hidden lg:inline">{showAITools ? "Ocultar IA" : "Mostrar IA"}</span>
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 shrink-0">
            <button
              onClick={() => setPreviewMode("desktop")}
              className={`px-2 py-1 rounded text-xs transition flex items-center gap-1 ${previewMode === "desktop" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
              title="Vista de escritorio"
            >
              <Monitor className="w-3 h-3" />
              <span className="hidden xl:inline">Escritorio</span>
            </button>
            <button
              onClick={() => setPreviewMode("mobile")}
              className={`px-2 py-1 rounded text-xs transition flex items-center gap-1 ${previewMode === "mobile" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
              title="Vista móvil (375px)"
            >
              <Smartphone className="w-3 h-3" />
              <span className="hidden xl:inline">Móvil</span>
            </button>
          </div>

          {/* Título/estado: único elemento que se recorta */}
          <div className="flex-1 min-w-0 flex items-center justify-end gap-2 text-[11px] text-slate-500 font-mono">
            <span className="truncate" title={sandboxUrl}>
              {sandboxUrl.replace("http://", "")}
            </span>
            {lastRefreshReason && <span className="hidden xl:inline text-slate-600 shrink-0">· {lastRefreshReason}</span>}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => refreshPreview("refresco manual")}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 rounded-lg border border-slate-700"
              title="Refrescar preview"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => window.open(sandboxUrl, "_blank")}
              className="p-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 hover:text-cyan-100 rounded-lg border border-cyan-600/40"
              title="Abrir el sandbox en una pestaña nueva del navegador"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            {/* ✅ BOTÓN DE PANTALLA COMPLETA — el que faltaba */}
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-1 px-2 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-200 rounded-lg text-xs font-medium border border-violet-500/40 whitespace-nowrap"
              title={isFullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa (F11)"}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden lg:inline">{isFullscreen ? "Salir" : "Pantalla completa"}</span>
            </button>
            {avisoPantalla && (
              <span className="text-[10px] text-amber-300 max-w-[240px] truncate" title={avisoPantalla}>
                ⚠ {avisoPantalla}
              </span>
            )}
            {/* v8.0.3 — El punto de estado informa de la REALIDAD medida por esta
                vista (probada contra el motor), no de una prop que llegaba fija
                en `true`. Antes estaba siempre verde, incluso con el sandbox
                muerto: el indicador mentía justo en el único caso en que hacía
                falta. `sandboxRunning` se conserva sólo como pista inicial. */}
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                sbEstado === "vivo" ? "bg-emerald-400 animate-pulse" : sbEstado === "comprobando" || sbEstado === "arrancando" ? "bg-amber-400 animate-pulse" : "bg-red-400"
              }`}
              title={
                sbEstado === "vivo"
                  ? "Sandbox :3500 activo (comprobado)"
                  : sbEstado === "comprobando"
                  ? "Comprobando el sandbox :3500…"
                  : sbEstado === "arrancando"
                  ? "Arrancando el sandbox :3500…"
                  : `Sandbox :3500 detenido${sbDetalle ? " — " + sbDetalle : ""}`
              }
            />
          </div>
        </div>

        {/* Lienzo del preview */}
        <div className="flex-1 flex flex-col bg-transparent overflow-hidden min-h-0 relative">
          {sbEstado !== "vivo" && (
            <div
              className={`px-3 py-2 border-b text-xs flex items-center gap-2 ${
                sbEstado === "muerto" ? "bg-red-500/10 border-red-500/30 text-red-200" : "bg-amber-500/10 border-amber-500/30 text-amber-200"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {sbEstado === "comprobando" && <span>Comprobando si el sandbox (:3500) está vivo…</span>}
              {sbEstado === "arrancando" && <span>Arrancando el sandbox (:3500)…</span>}
              {sbEstado === "muerto" && (
                <>
                  <span className="flex-1">
                    El sandbox (:3500) <strong>no está corriendo</strong>: por eso el preview sale en blanco.
                    {sbDetalle ? ` Motivo del motor: ${sbDetalle}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={arrancarSandbox}
                    className="shrink-0 px-2 py-1 rounded-md bg-red-500/20 hover:bg-red-500/30 border border-red-400/40 text-red-100 font-medium"
                    title="Arranca el servidor del proyecto en el puerto 3500"
                  >
                    Arrancar sandbox ahora
                  </button>
                  <button
                    type="button"
                    onClick={probarSandbox}
                    className="shrink-0 px-2 py-1 rounded-md bg-zinc-700/40 hover:bg-zinc-700/60 border border-zinc-600/50 text-zinc-200"
                    title="Volver a preguntar al motor si ya está vivo"
                  >
                    Reintentar
                  </button>
                </>
              )}
            </div>
          )}
          {/* v2.0 — 🐞 En modo móvil el marco de 375 px se comprimía hasta los
              ~230 px del contenedor y el contenido salía "achatado" (el navegador
              lo renderizaba a ese ancho real). Ahora el marco conserva sus 375 px
              y el contenedor hace scroll horizontal si no cabe: se ve igual que
              en un móvil de verdad, sin deformar. */}
          {previewMode === "mobile" ? (
            <div className="flex-1 p-3 min-h-0 flex items-center justify-center">
              {/* v2.0 — MÓVIL REAL: 390 x 844 (iPhone 14 / Pixel 8), con notch y
                  marco de 10 px. Antes era una tira de 375 px de ancho sin altura
                  fija, que se veía "muy larga y finita". Si no cabe a lo ancho, el
                  contenedor scrollea en vertical (nunca en horizontal). */}
              {/* v2.0 — Zoom del 72 %: `zoom` escala ANCHO Y ALTO a la vez, así el
                  móvil conserva su proporción real (390 x 844) y se ve como un
                  teléfono de verdad, solo que más pequeño. Antes, con `max-width:
                  100%`, el navegador encogía SOLO el ancho y quedaba una tira
                  estrecha y larga ("se ve muy pequeño"). */}
              {/* v2.1 — "el móvil se ve super chico, agrándalo lo más posible".
                  Antes: 390x844 FIJOS y encima un `zoom: 0.72`, así que el teléfono
                  quedaba en ~145 px de ancho aunque sobrara panel a los lados (y el
                  zoom se multiplicaba con el del contenedor: encogía dos veces).
                  Ahora el marco no tiene tamaño propio: `height: 100%` lo estira
                  hasta llenar el alto disponible y el ancho lo deduce la proporción
                  real de un móvil (390:844). Es el máximo tamaño sin deformar. */}
              <div
                className="cn-device-frame relative"
                style={{ height: "100%", width: "auto", aspectRatio: "390 / 844", maxWidth: "100%", maxHeight: "100%" }}
              >
                <div className="cn-device-notch" />
                <iframe
                  key={iframeKey}
                  src={previewListo ? sandboxUrl : undefined}
                  title="Web Editor Preview (Mobile)"
                  className="w-full h-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                />
              </div>
            </div>
          ) : (
            <iframe
              key={iframeKey}
              src={previewListo ? sandboxUrl : undefined}
              title="Web Editor Preview (Desktop)"
              /* v2.0 — 🐞 "en el escritorio se ve aplastado": el iframe era un hijo
                 flex con `flex-1` dentro de un contenedor sin altura resuelta, así
                 que se quedaba con su altura por defecto (150 px) = una franja
                 aplastada. Ahora ocupa todo el alto disponible y, si el contenedor
                 no tiene altura, nunca baja de 420 px. */
              /* v2.1 — 🐞 "en modo escritorio se ve tan achatado" (y en el navegador
                 real NO). Diagnóstico: el iframe se quedaba con 420 px de alto en
                 una pantalla de 768, o sea un lienzo de ~1300×420: un viewport
                 anchísimo y bajísimo, así que cualquier página con secciones de
                 altura completa se comprime y parece aplastada. En Chrome, a
                 pantalla completa, el mismo sitio tiene 1300×700 y se ve normal.
                 Arreglo: el preview ocupa todo el alto disponible y, si el panel
                 no lo tiene resuelto, nunca baja del 78 % de la ventana. */
              className="block w-full border-0 bg-white"
              style={{ height: "100%", minHeight: "min(78vh, 900px)" }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          )}
        </div>
      </div>
    </div>
  );
};

/** Iconos auxiliares para que el árbol de pestañas pueda mostrarlos */
export const WEB_EDITOR_TAB_ICON = Layout;
export const WEB_EDITOR_QUICK_ADD = Plus;
