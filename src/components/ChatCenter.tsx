import React, { useEffect, useRef, useState } from "react";
// v2.1 — La versión se lee de UNA sola fuente (constants.IDE_BRAND).
// Estaba escrita a mano: la interfaz decía "V1" mientras la carpeta y los
// archivos decían "v2.0". Dos versiones distintas, y ninguna era la real.
import { IDE_BRAND, LS_KEYS } from "../constants";
// v1.6.11 — las vallas no se comen el mensaje (ni al leerlo en voz alta ni al
// exportarlo). Ver src/utils/bloquesMarkdown.ts.
import { quitarVallasConservandoTexto, anotarBloquesSinExplicacion } from "../utils/bloquesMarkdown";
// v1.6.11 — la clave de Gemini que el usuario ya configuró en la app, para
// mandarla también al motor de voz (antes solo existía la del servidor).
import { loadString } from "../utils/storage";
// F1 — autocorrector determinista del composer (modo «auto» reemplaza en
// caliente las correcciones seguras; «sugerir» nunca toca lo escrito).
import { corregirLinea } from "../engine/autocorrector";
import { loadProSettings } from "../utils/proSettings";
import {
  AlertCircle,
  ArrowUp,
  Bot,
  Check,
  Clock,
  Copy,
  Cpu,
  Download,
  Eraser,
  FileCode,
  FileText,
  FolderArchive,
  // v8.0.4 — Para el aviso de voz (por qué suena robótica) y el de adjuntos.
  AlertTriangle,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  ListOrdered,
  // v8.0.3 — Para el chip fantasma del adjunto que aún se está procesando.
  Loader2,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Sparkles,
  Square,
  Shield,
  Terminal,
  Trash2,
  Upload,
  User,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { AgentAction, AgentTask, AttachmentItem, ChatMessage, QueuedMessageItem, SavedChat } from "../types";
import { repairNumberedListsAndGaps } from "../utils/engine";
// v8.0.1 — ADUANA DE SALIDA: quita los rótulos de acta que el motor pedía al
// modelo ([DIAGNÓSTICO FLASH] / [ACCIÓN] / [CHECKLIST DE MEMORIA]). El prompt
// ya no los pide (ver brain.ts); esto recoge el residuo de los modelos que los
// tienen memorizados. Una sola función pura, aplicada en el único punto donde
// el texto llega a la vista: así no hay forma de saltársela.
import { limpiarMetadatosDeCierre } from "../utils/formatFixer";
// v8.0.4 — Elección de la voz del navegador. Módulo PURO (src/utils/voz.ts) para
// poder probar la prioridad entre voces sin un navegador: un `find()` apresurado
// era la causa de que sonara siempre la voz robótica.
import { elegirMejorVoz, idiomaDeVozPreferido, acortarMotivo, avisoDeVozNoDisponible } from "../utils/voz";
// TTS v1.15.0 — Configuración compartida de voz/tono/velocidad con el botón de
// la barra superior (ver utils/ttsConfig.ts). Aquí se lee y se aplica al hablar.
import { cargarConfigTts, guardarConfigTts, EVENTO_CONFIG_TTS, esVozGemini } from "../utils/ttsConfig";

/** Compone los dos arreglos de salida en el orden correcto y en un solo sitio.
 *  F2 — el guardián de «código sin explicación» corre aquí, en el único punto
 *  donde el texto del modelo llega a la vista: un bloque file="…" mudo se anota
 *  con el chip gris sin que haga falta tocar el modelo. */
const componerCuerpo = (texto: string): string =>
  anotarBloquesSinExplicacion(limpiarMetadatosDeCierre(repairNumberedListsAndGaps(texto)));

interface ChatCenterProps {
  messages: ChatMessage[];
  currentStreamingText: string;
  isStreaming: boolean;
  onSendMessage: (text: string, attachments: AttachmentItem[]) => void;
  onStopStreaming: () => void;
  currentModel: string;
  onOpenModelSelector: () => void;
  pendingAttachments: AttachmentItem[];
  /**
   * v8.0.3 — Nombres de los archivos que TODAVÍA se están procesando, en orden.
   * Opcional a propósito: si no se pasa, la tira funciona igual que antes (solo
   * con lo ya cargado). Así el cambio no puede romper ningún uso existente.
   */
  pendingNames?: string[];
  onAddAttachments: (files: FileList | File[]) => void;
  onRemovePendingAttachment: (id: string) => void;
  onClearPendingAttachments: () => void;
  messageQueue?: QueuedMessageItem[];
  onRemoveQueuedMessage?: (id: string) => void;
  onClearQueue?: () => void;
  onResetSessionCache?: () => void;
  onRegenerate?: () => void;
  onExportSession?: () => void;
  onImportSession?: (file: File) => void;
  activeFileName?: string;
  openFilesCount?: number;
  agentTasks?: AgentTask[];
  actionLog?: AgentAction[];
  pcMode?: boolean;
  onTogglePcMode?: () => void;
  // Carpeta de chats guardados
  savedChats?: SavedChat[];
  activeChatTitle?: string;
  onNewChat?: () => void;
  onOpenChat?: (id: string) => void;
  onDeleteChat?: (id: string) => void;
  onRenameChat?: (id: string, title: string) => void;
  onRenameActiveChat?: (title: string) => void;
  // Audio (TTS) maestro
  isSoundMuted?: boolean;
}

/**
 * v1.13.0 — CUÁNTO SE ESPERA ANTES DE VOLVER A PEDIR VOZ A GEMINI.
 * Cinco minutos. El motivo: si se agotó la cuota (429) o la clave no vale, pedir
 * voz otra vez en el mensaje siguiente no puede funcionar — solo cuesta tiempo,
 * cuota y un aviso repetido. Pasado el rato se vuelve a intentar solo, sin que el
 * usuario tenga que tocar nada.
 */
const VOZ_EN_ESPERA_MS = 5 * 60_000;

export const ChatCenter: React.FC<ChatCenterProps> = ({
  messages,
  currentStreamingText,
  isStreaming,
  onSendMessage,
  onStopStreaming,
  currentModel,
  onOpenModelSelector,
  pendingAttachments,
  onAddAttachments,
  onRemovePendingAttachment,
  onClearPendingAttachments,
  messageQueue = [],
  pendingNames = [],
  onRemoveQueuedMessage,
  onClearQueue,
  onResetSessionCache,
  onRegenerate,
  onExportSession,
  onImportSession,
  activeFileName = "MEMORIA.md",
  openFilesCount = 1,
  agentTasks = [],
  actionLog = [],
  pcMode = false,
  onTogglePcMode,
  savedChats = [],
  activeChatTitle = "",
  onNewChat,
  onOpenChat,
  onDeleteChat,
  onRenameChat,
  onRenameActiveChat,
  isSoundMuted = false,
}) => {
  const [inputText, setInputText] = useState("");

  // v1.6.11 — DESHACER (Ctrl+Z) en el compositor.
  // El textarea es CONTROLADO: el valor lo pone React, y eso deja al deshacer
  // nativo del navegador sin historial. En cuanto la app reescribe el campo (al
  // enviar, al limpiar tras un error, al aplicar una orden), no había forma de
  // volver a lo escrito. Esta pila es la que devuelve el texto.
  const pilaDeshacer = useRef<string[]>([]);
  const ultimoValor = useRef<string>("");
  const registrarParaDeshacer = (nuevo: string) => {
    if (nuevo === ultimoValor.current) return;
    pilaDeshacer.current.push(ultimoValor.current);
    if (pilaDeshacer.current.length > 100) pilaDeshacer.current.shift();
    ultimoValor.current = nuevo;
  };
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // v8.0.3 — Vista previa en grande de un adjunto. Se abre al pulsar la
  // miniatura del chip: es lo que permite confirmar «sí, ESTA es la que quería»
  // cuando hay veinte parecidas. `null` = cerrada.
  const [vistaPrevia, setVistaPrevia] = useState<{ src: string; nombre: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // ===== Carpeta de chats guardados (drawer lateral) =====
  const [chatsOpen, setChatsOpen] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null); // "__active__" = chat actual
  const [editTitle, setEditTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingChatId) editInputRef.current?.focus();
  }, [editingChatId]);

  const startEdit = (id: string, currentTitle: string) => {
    setEditingChatId(id);
    setEditTitle(currentTitle);
  };

  const commitEdit = () => {
    if (editingChatId === "__active__") {
      onRenameActiveChat?.(editTitle);
    } else if (editingChatId) {
      onRenameChat?.(editingChatId, editTitle);
    }
    setEditingChatId(null);
    setEditTitle("");
  };

  const cancelEdit = () => {
    setEditingChatId(null);
    setEditTitle("");
  };

  // ===== Audio por mensaje (TTS: Gemini con varias voces → fallback navegador) =====
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const speakingIdRef = useRef<string | null>(null);
  speakingIdRef.current = speakingId;

  // 🎙️ TTS v1.15.0 — Voz, tono y velocidad ya no viven solo aquí: el botón de la
  // barra superior (TtsSelector) los escribe en la configuración compartida
  // (utils/ttsConfig.ts) y este componente los lee al hablar. El listado curado
  // de voces Gemini está en VOCES_GEMINI (mismo módulo); aquí solo se usa el id.
  const [ttsVoice, setTtsVoice] = useState<string>(() => cargarConfigTts().voz);
  const [ttsRate, setTtsRate] = useState<number>(() => cargarConfigTts().rate);
  const [ttsPitch, setTtsPitch] = useState<number>(() => cargarConfigTts().pitch);

  // Sincronizar con el selector de la barra superior: cuando el usuario cambia
  // voz/tono/velocidad desde arriba, este componente se entera por el evento.
  useEffect(() => {
    const aplicar = () => {
      const c = cargarConfigTts();
      setTtsVoice(c.voz);
      setTtsRate(c.rate);
      setTtsPitch(c.pitch);
    };
    window.addEventListener(EVENTO_CONFIG_TTS, aplicar);
    return () => window.removeEventListener(EVENTO_CONFIG_TTS, aplicar);
  }, []);

  // ============================================================
  // v1.6.15 — «lo de Gemini en la barra del chat, si no anda quítalo:
  //            ocupa lugar y no es funcional».
  //
  // Tenía razón a medias, y la mitad importante era la de fondo: las ocho
  // voces Gemini NO son ocho opciones. Sin clave no funciona NINGUNA, y todas
  // caían en silencio a la voz del navegador. Eran ocho etiquetas que hacían
  // exactamente lo mismo que «Navegador (local)» — 170 px de barra para elegir
  // entre ocho botones que no hacen nada.
  //
  // No se borran: se CONDICIONAN a que existan de verdad. Con clave aparecen;
  // sin clave no hay nada que elegir, así que el selector desaparece y la barra
  // recupera el espacio.
  // ============================================================
  const [hayClaveGeminiTts, setHayClaveGeminiTts] = useState<boolean>(() => {
    try { return !!loadString(LS_KEYS.GEMINI_API_KEY).trim(); } catch { return false; }
  });
  useEffect(() => {
    // La clave se guarda en la ventana de API Keys, que es otro componente:
    // hay que releerla al volver el foco para que el selector aparezca en
    // cuanto el usuario la configura, sin recargar.
    const revisar = () => {
      try { setHayClaveGeminiTts(!!loadString(LS_KEYS.GEMINI_API_KEY).trim()); } catch { /* noop */ }
    };
    window.addEventListener("focus", revisar);
    const t = setInterval(revisar, 4000);
    return () => { window.removeEventListener("focus", revisar); clearInterval(t); };
  }, []);

  // Si la voz guardada era de Gemini y ya no hay clave, volver al navegador:
  // dejar seleccionada una voz que no puede sonar es justo el estado roto.
  // (v1.15.0) Solo se resetea una voz GEMINI: las voces del sistema no dependen
  // de ninguna clave y deben quedarse tal cual las eligió el usuario.
  useEffect(() => {
    if (!hayClaveGeminiTts && esVozGemini(ttsVoice)) {
      setTtsVoice("navegador");
      // TTS v1.15.0 — se escribe por la vía compartida para que el botón de
      // arriba también vuelva a «Navegador» sin recargar.
      guardarConfigTts({ voz: "navegador" });
    }
  }, [hayClaveGeminiTts, ttsVoice]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /**
   * v8.0.4 — CACHÉ DE VOCES DEL SISTEMA.
   *
   * `getVoices()` devuelve **lista vacía la primera vez** que se llama: las voces
   * se cargan de forma asíncrona y el navegador avisa por `voiceschanged` cuando
   * ya están. El código anterior leía la lista una sola vez y no escuchaba ese
   * evento, así que la elección de voz veía `[]` y acababa sonando la voz por
   * defecto del sistema (en Linux, eSpeak: la robótica de siempre).
   *
   * Este ref es la mitad del arreglo del audio; la otra mitad es `elegirMejorVoz`.
   */
  const vocesCacheRef = useRef<SpeechSynthesisVoice[]>([]);

  /** Aviso visible sobre la voz. Solo se rellena cuando hay algo que decir. */
  const [ttsAviso, setTtsAviso] = useState<string | null>(null);
  // v1.13.0 — Tras un fallo de cuota o de clave, se deja de pedir voz a Gemini un
  // rato: insistir no arregla la cuota y repetía el aviso en cada mensaje.
  const vozEnEsperaHastaRef = useRef<number>(0);
  const vozMotivoEsperaRef = useRef<string>("");

  // Cargar las voces y RE-cargarlas cuando el navegador avise de que ya están.
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth || typeof synth.getVoices !== "function") return;
    const cargar = () => {
      try {
        const v = synth.getVoices();
        if (v && v.length) vocesCacheRef.current = v;
      } catch {}
    };
    cargar();
    try {
      synth.addEventListener("voiceschanged", cargar);
    } catch {}
    return () => {
      try {
        synth.removeEventListener("voiceschanged", cargar);
      } catch {}
    };
  }, []);

  // (v1.15.0) El selector de voz se mudó a la barra superior (TtsSelector), así
  // que ya no hay un <select> local. La elección llega por la configuración
  // compartida y el evento EVENTO_CONFIG_TTS; no hace falta `elegirVozTts`.

  // Limpia markdown para que la voz lea solo texto natural.
  //
  // v1.6.11 — 🐞 «me dice bloque de código omitido y se corta el audio».
  // La primera línea reemplazaba la valla ENTERA —contenido incluido— por la
  // frase «(bloque de código omitido)». Cuando el mensaje del modelo es un
  // documento dentro de una valla (``` text file="…"), lo único que quedaba para
  // leer era esa frase: el audio se cortaba porque no había nada más.
  // Ahora un bloque de documento se lee entero, y el código de verdad se calla
  // SIN anunciarlo: oír una disculpa no es oír la respuesta.
  const cleanTextForSpeech = (raw: string): string => {
    return quitarVallasConservandoTexto(raw, { codigo: "callar" })
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/^\s*>\s?/gm, "")
      .replace(/\|/g, " ")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const stopSpeech = () => {
    try {
      window.speechSynthesis.cancel();
    } catch {}
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    } catch {}
    setSpeakingId(null);
  };

  const hablarConNavegador = (msg: ChatMessage, text: string) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const utter = new SpeechSynthesisUtterance(text);

    // ============================================================
    // v8.0.4 — 🐞 «SALE SIEMPRE LA VOZ ROBÓTICA STANDARD»
    // ------------------------------------------------------------
    // Aquí había `synth.getVoices()` seguido de `.find(v => v.lang.startsWith("es"))`.
    // Eso produce el síntoma EXACTAMENTE, por dos motivos que se suman:
    //
    //  · `getVoices()` devuelve lista VACÍA la primera vez (las voces se cargan de
    //    forma asíncrona). Sin escuchar `voiceschanged` —y no lo escuchaba— la
    //    búsqueda no encontraba nada, NO se asignaba `utter.voice`, y sonaba la voz
    //    por defecto del sistema. En Linux esa por defecto es eSpeak: el
    //    sintetizador robótico de siempre. No fallaba a veces: fallaba siempre.
    //  · Aunque hubiera voces, el PRIMERO de la lista no es el mejor: el orden de
    //    `getVoices()` no está normalizado por nadie.
    //
    // Ahora las voces se cachean desde el arranque (ver el useEffect de la caché)
    // y la elección la hace `elegirMejorVoz`, que puntúa TODAS y prioriza idioma >
    // no-robótica > natural. Si la ganadora es robótica, se avisa: mejor decirlo
    // que fingir que suena bien.
    // ============================================================
    let idiomaUi = "es";
    try {
      idiomaUi = localStorage.getItem(LS_KEYS.RESPONSE_LANGUAGE) || "es";
    } catch {}
    const preferido = idiomaDeVozPreferido(idiomaUi);

    const lista = vocesCacheRef.current.length > 0 ? vocesCacheRef.current : synth.getVoices() || [];

    // TTS v1.15.0 — «cambio de voz»: si el usuario eligió UNA voz concreta del
    // sistema (no la automática ni una Gemini), se respeta esa. La puntuación de
    // `elegirMejorVoz` sigue mandando solo en el modo «Navegador (automática)».
    const vozManual = ttsVoice && ttsVoice !== "navegador" && !esVozGemini(ttsVoice) ? ttsVoice : null;

    if (vozManual) {
      const manual = lista.find((v) => v.name === vozManual);
      if (manual) {
        utter.voice = manual;
        utter.lang = manual.lang || preferido;
      } else {
        utter.lang = preferido;
      }
    } else {
      const elegida = elegirMejorVoz(lista, preferido);
      if (elegida) {
        utter.voice = elegida.voz;
        utter.lang = elegida.voz.lang || preferido;
        // Solo se avisa cuando HAY algo que avisar. Si la voz es buena, ni palabra.
        if (elegida.robotica) setTtsAviso(elegida.motivo);
      } else {
        // Sin ninguna voz publicada todavía: se declara el idioma y se deja decidir
        // al sistema. Se avisa, porque ESTO es lo que produce la voz robótica y el
        // usuario tiene derecho a saber por qué suena así.
        utter.lang = preferido;
        setTtsAviso(
          `Este navegador todavía no ha publicado ninguna voz de ${preferido} (las voces se cargan de forma asíncrona). Se usa la voz por defecto del sistema, que suele ser robótica. Vuelve a pulsar «Escuchar» en unos segundos, o elige una voz Gemini.`
        );
      }
    }

    // TTS v1.15.0 — velocidad y tono elegidos desde el botón de la barra superior.
    utter.rate = ttsRate;
    utter.pitch = ttsPitch;
    utter.onend = () => {
      if (speakingIdRef.current === msg.id) setSpeakingId(null);
    };
    utter.onerror = () => {
      if (speakingIdRef.current === msg.id) setSpeakingId(null);
    };
    setSpeakingId(msg.id);
    synth.speak(utter);
  };

  const speakConGemini = async (msg: ChatMessage, text: string, voice: string): Promise<boolean> => {
    try {
      // v1.6.11 — 🐞 «¿dónde va la api key? ¿no es la misma de los modelos?»
      //
      // No lo era, y era el motivo de fondo del 503. Los modelos usan la clave
      // que configuras EN LA APP (viaja en cada petición); el motor de voz solo
      // miraba `GEMINI_API_KEY` del ENTORNO DEL SERVIDOR. Con la clave puesta en
      // la app, la voz seguía diciendo «Falta GEMINI_API_KEY» — y desde fuera
      // parecía que el audio estaba roto. Ahora se manda la misma clave.
      const claveGeminiApp = loadString(LS_KEYS.GEMINI_API_KEY).trim();
      const res = await fetch("/api/tts/gemini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(claveGeminiApp ? { "x-gemini-key": claveGeminiApp } : {}),
        },
        body: JSON.stringify({ text, voice }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.audioBase64) {
        // ============================================================
        // v8.0.4 — AQUÍ SE PERDÍA LA EXPLICACIÓN.
        // ------------------------------------------------------------
        // Antes esto era `return false` y nada más. El efecto: el usuario elegía
        // «Gemini · Aoede», el servidor contestaba 503 «Falta GEMINI_API_KEY», y
        // la interfaz caía al navegador SIN DECIR NADA — sonaba la voz robótica y
        // desde fuera parecía que el botón de audio estaba roto. La causa real
        // (la clave vive en el entorno del SERVIDOR, no en el navegador) era
        // invisible.
        //
        // Ahora se recoge el `motivo` que el servidor ya devolvía y se enseña.
        // ============================================================
        // v1.13.0 — EL BANNER DICE LA CAUSA; EL JSON VA AL REGISTRO.
        // Antes se pintaba el `motivo` tal cual, y con la cuota agotada el motivo
        // era el JSON entero de Google: un cartel de mil caracteres que se comía la
        // conversación. Ahora son dos cosas separadas: una frase para el usuario y el
        // volcado técnico a la consola, que es donde se depura.
        const motivo = String(data?.motivo || data?.error || `HTTP ${res.status}`);
        const clase = String(data?.clase || "");
        if (data?.detalle) console.warn(`[Voz] detalle técnico de Gemini: ${data.detalle}`);
        setTtsAviso(avisoDeVozNoDisponible(voice, motivo));
        // Cuota agotada o clave inválida no se arreglan insistiendo cada mensaje.
        if (clase === "cuota" || clase === "clave") {
          vozEnEsperaHastaRef.current = Date.now() + VOZ_EN_ESPERA_MS;
          vozMotivoEsperaRef.current = motivo;
        }
        return false;
      }
      const audio = new Audio(`data:${data.mime || "audio/wav"};base64,${data.audioBase64}`);
      // TTS v1.15.0 — la velocidad también aplica a Gemini: `playbackRate` acelera
      // sin cambiar el tono (`preservesPitch`). El tono no se toca aquí: en Gemini
      // lo fija cada voz; solo la voz del navegador acepta `pitch`.
      try {
        audio.playbackRate = ttsRate;
        audio.preservesPitch = true;
      } catch {
        /* noop */
      }
      audioRef.current = audio;
      audio.onended = () => {
        if (speakingIdRef.current === msg.id) setSpeakingId(null);
      };
      audio.onerror = () => {
        if (speakingIdRef.current === msg.id) setSpeakingId(null);
      };
      setSpeakingId(msg.id);
      await audio.play();
      return true;
    } catch (e: any) {
      // Fallo de red o respuesta no-JSON: también se explica.
      console.warn("[Voz] fallo al pedir la voz:", e?.message || e);
      setTtsAviso(avisoDeVozNoDisponible("Gemini", "no se pudo pedir la voz al motor"));
      return false;
    }
  };

  const handleSpeak = async (msg: ChatMessage) => {
    if (isSoundMuted) return;
    // Si ya se está leyendo este mensaje => detener
    if (speakingIdRef.current === msg.id) {
      stopSpeech();
      return;
    }
    stopSpeech();
    const enEsperaVoz = Date.now() < vozEnEsperaHastaRef.current;
    // Cada intento empieza limpio: el aviso del intento anterior ya no aplica.
    // Salvo si Gemini está en espera: ahí se mantiene, para no repetir el mismo
    // aviso en CADA mensaje (que era la otra mitad del problema: el cartel volvía).
    if (!enEsperaVoz) setTtsAviso(null);
    const text = cleanTextForSpeech(msg.content).slice(0, 4500);
    if (!text) return;
    // 1) Gemini TTS con la voz elegida. IMPORTANTE (v1.15.0): ahora `ttsVoice`
    // también puede ser el NOMBRE de una voz del sistema (elegida desde el botón
    // de arriba), y eso NO debe ir a Gemini. Solo las voces Gemini van a Gemini.
    const esGemini = esVozGemini(ttsVoice);
    if (esGemini && !enEsperaVoz) {
      const ok = await speakConGemini(msg, text, ttsVoice);
      if (ok) return;
    }
    if (enEsperaVoz && esGemini) {
      setTtsAviso(
        (prev) =>
          prev ??
          `Voz Gemini en espera: ${acortarMotivo(vozMotivoEsperaRef.current)}. Se usa la voz del navegador; se reintentará en unos minutos.`
      );
    }
    // 2) Fallback: voz del navegador (speechSynthesis)
    hablarConNavegador(msg, text);
  };

  // Detener la voz al desmontar o al cambiar de conversación
  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      try {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
      } catch {}
    };
  }, []);

  // Auto-scroll when messages or streaming text change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentStreamingText, messageQueue]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && pendingAttachments.length === 0) return;

    onSendMessage(inputText, pendingAttachments);
    setInputText("");
    onClearPendingAttachments();

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // v1.6.11 — Ctrl+Z / Cmd+Z deshace en el compositor (ver la pila arriba).
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      const anterior = pilaDeshacer.current.pop();
      if (anterior !== undefined) {
        e.preventDefault();
        ultimoValor.current = anterior;
        setInputText(anterior);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddAttachments(e.dataTransfer.files);
    }
  };

  // ===== Pegar captura de pantalla (fn+PrintScreen / Ctrl+V) =====
  // Captura cualquier imagen que venga en el portapapeles y la manda por la
  // MISMA ruta que los adjuntos arrastrados o seleccionados con el clip.
  // Si no hay imágenes (solo texto), deja que el pegado normal ocurra.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const file = it.getAsFile();
        if (file) {
          // Los portapapeles suelen entregar nombre vacío ("") o genérico.
          // Le ponemos uno útil con marca de tiempo para que se vea en el badge.
          if (!file.name || file.name === "image.png" || file.name.trim() === "") {
            const ext = (file.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "").slice(0, 4) || "png";
            const ts = new Date()
              .toISOString()
              .replace(/[-:]/g, "")
              .replace("T", "-")
              .slice(0, 15);
            try {
              imageFiles.push(new File([file], `captura-${ts}.${ext}`, { type: file.type }));
            } catch {
              imageFiles.push(file);
            }
          } else {
            imageFiles.push(file);
          }
        }
      }
    }

    if (imageFiles.length === 0) return; // pegado de texto normal

    e.preventDefault();
    onAddAttachments(imageFiles);
  };

  // ============================================================
  // v8.0.3 — CHIP DEL ADJUNTO CON MINIATURA REAL
  // ------------------------------------------------------------
  // Petición literal: «que se vea la miniatura de la imagen, así se puede
  // apreciar qué elemento se está cargando cuando sean muchas; ahora solo es un
  // icono». Tenía razón en las dos partes, y la segunda es la importante: con
  // veinte capturas, veinte iconos rosa idénticos no dicen NADA sobre cuál es
  // cuál. El nombre ayuda, pero un nombre como «captura-20260922-143045.png» no
  // es más informativo que el icono.
  //
  // La cadena de respaldo es explícita y de tres niveles, y cada nivel existe
  // por un motivo real:
  //   1. `thumbData`   → miniatura generada al adjuntar (≤96 px, ligera).
  //   2. `base64Data`  → la imagen completa, si por lo que sea no hay miniatura.
  //   3. icono         → si no hay ni una cosa ni la otra (o si el <img> falla).
  //
  // El icono no se elimina: se pinta DEBAJO del <img>. Si la imagen no carga,
  // `onError` la oculta y el icono queda a la vista. Así el fallo degrada a lo
  // que había antes en vez de dejar un hueco negro.
  // ============================================================
  const renderAttachmentBadge = (att: AttachmentItem, canDelete = false) => {
    const isDocx = att.isDocx || att.name.endsWith(".docx");
    const isZip = att.isZip || att.name.endsWith(".zip");
    const isImg = att.isImage || !!att.base64Data;

    const miniatura = att.thumbData || att.base64Data || null;
    const completa = att.base64Data || att.thumbData || null;

    return (
      <div
        key={att.id}
        className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 shadow-sm shrink-0"
      >
        {isImg && miniatura ? (
          <button
            type="button"
            onClick={() => completa && setVistaPrevia({ src: completa, nombre: att.name })}
            title={`Ver «${att.name}» en grande`}
            className="relative w-9 h-9 rounded-md overflow-hidden border border-zinc-700 hover:border-cyan-400 transition-colors shrink-0 bg-zinc-950 grid place-items-center group"
          >
            {/* Nivel 3 del respaldo: debajo, por si la imagen no carga. */}
            <ImageIcon className="w-3.5 h-3.5 text-pink-400 absolute" />
            <img
              src={miniatura}
              alt={att.name}
              draggable={false}
              decoding="async"
              className="relative w-full h-full object-cover"
              onError={(e) => {
                // No se cambia el estado: basta con esconder el <img> para que
                // reaparezca el icono de debajo. Menos estado, menos re-render.
                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
              }}
            />
            <span className="absolute inset-0 hidden group-hover:grid place-items-center bg-black/55 text-[9px] font-mono text-cyan-300">
              ver
            </span>
          </button>
        ) : isImg ? (
          <ImageIcon className="w-3.5 h-3.5 text-pink-400" />
        ) : isZip ? (
          <FolderArchive className="w-3.5 h-3.5 text-amber-400" />
        ) : isDocx ? (
          <FileText className="w-3.5 h-3.5 text-blue-400" />
        ) : (
          <FileCode className="w-3.5 h-3.5 text-emerald-400" />
        )}
        <span className="font-mono truncate max-w-[130px]" title={att.name}>
          {att.name}
        </span>
        <span className="text-[10px] text-zinc-500">
          {(att.size / 1024).toFixed(0)}KB
        </span>
        {canDelete && (
          <button
            type="button"
            onClick={() => onRemovePendingAttachment(att.id)}
            className="ml-1 text-zinc-500 hover:text-red-400 p-0.5 rounded transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  /**
   * v8.0.3 — Chip fantasma: un archivo que TODAVÍA se está procesando.
   *
   * Esto es la mitad de la petición que no se ve: no basta con que aparezca la
   * miniatura de lo ya cargado, hay que poder ver QUÉ FALTA. Sin estos huecos, la
   * tira crecía de una en una sin decir cuántos quedaban ni cuáles eran, y con
   * treinta archivos el usuario no tenía forma de saber si el que esperaba ya
   * había entrado o no.
   */
  const renderAttachmentPendiente = (nombre: string, indice: number) => (
    <div
      key={`pend-${indice}-${nombre}`}
      className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-lg bg-zinc-900/40 border border-dashed border-zinc-700 text-xs text-zinc-500 shrink-0 animate-pulse"
      title={`«${nombre}» todavía se está procesando`}
    >
      <span className="w-9 h-9 rounded-md bg-zinc-800/60 grid place-items-center shrink-0">
        <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
      </span>
      <span className="font-mono truncate max-w-[130px]">{nombre}</span>
      <span className="text-[10px] text-zinc-600 italic">cargando…</span>
    </div>
  );

  return (
    <main
      data-cn="chat" className="flex-1 flex flex-col h-full bg-[#000000] relative overflow-hidden select-text"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-40 bg-black/90 border-2 border-dashed border-cyan-400 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none select-none">
          <Paperclip className="w-12 h-12 text-cyan-400 animate-bounce mb-3" />
          <p className="text-base font-semibold text-cyan-300 font-mono">
            Soltar archivos para adjuntar
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            Soporta DOCX, ZIP, imágenes, JSON, TSX, PY y código fuente (hasta 50 elementos)
          </p>
        </div>
      )}

      {/* ============================================================
          CARPETA DE CHATS GUARDADOS (drawer lateral con renombrar/borrar)
          ============================================================ */}
      {chatsOpen && (
        <>
          {/* Fondo clickeable para cerrar */}
          <div
            className="absolute inset-0 z-30 bg-black/50 backdrop-blur-[1px]"
            onClick={() => {
              setChatsOpen(false);
              cancelEdit();
            }}
          />
          <div className="absolute left-0 top-0 bottom-0 z-40 w-[290px] max-w-[85%] bg-[#060a12] border-r border-[#182338] shadow-2xl flex flex-col">
            {/* Cabecera del drawer */}
            <div className="h-11 px-3 border-b border-[#141d2e] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-cyan-300 font-mono text-[11px] font-bold tracking-wide">
                <FolderOpen className="w-4 h-4" />
                <span>CHATS GUARDADOS ({savedChats.length})</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setChatsOpen(false);
                  cancelEdit();
                }}
                className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                title="Cerrar carpeta de chats"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Botón Nuevo chat */}
            <div className="p-2 border-b border-[#101828] shrink-0">
              <button
                type="button"
                onClick={() => {
                  onNewChat?.();
                  cancelEdit();
                }}
                disabled={!onNewChat}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-2 bg-cyan-600/20 hover:bg-cyan-600/35 disabled:opacity-40 text-cyan-200 border border-cyan-500/40 rounded-lg text-xs font-medium transition-all"
                title="Guarda el chat actual en la carpeta y empieza uno nuevo"
              >
                <Plus className="w-4 h-4" />
                Nuevo chat
              </button>
            </div>

            {/* Chat actual (renombrable) */}
            <div className="px-2 pt-2 shrink-0">
              <div className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider px-1 pb-1">Chat actual</div>
              {editingChatId === "__active__" ? (
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0a1120] border border-cyan-500/50">
                  <MessageSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="flex-1 bg-transparent text-xs text-zinc-100 outline-none font-mono min-w-0"
                    placeholder="Título del chat…"
                    maxLength={80}
                  />
                  <button type="button" onClick={commitEdit} className="p-1 text-emerald-400 hover:text-emerald-300" title="Guardar título (Enter)">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={cancelEdit} className="p-1 text-zinc-500 hover:text-zinc-300" title="Cancelar (Esc)">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="group flex items-center gap-1.5 p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                  <MessageSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="flex-1 truncate text-xs text-cyan-100 font-medium" title={activeChatTitle}>
                    {activeChatTitle || "Chat sin título"}
                  </span>
                  <span className="text-[9px] text-cyan-400/70 font-mono shrink-0">{messages.length} msj</span>
                  <button
                    type="button"
                    onClick={() => startEdit("__active__", activeChatTitle)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800 transition-all"
                    title="Renombrar chat actual"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Lista de chats guardados */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2 space-y-1">
              <div className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider px-1 pb-1">Guardados</div>
              {savedChats.length === 0 && (
                <div className="text-zinc-600 text-[11px] px-1 py-3 leading-relaxed">
                  Todavía no hay chats guardados. Pulsa «Nuevo chat» o cambia de conversación y la actual se guardará aquí automáticamente.
                </div>
              )}
              {savedChats.map((chat) =>
                editingChatId === chat.id ? (
                  <div key={chat.id} className="flex items-center gap-1 p-1 rounded-lg bg-[#0a1120] border border-cyan-500/50">
                    <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="flex-1 bg-transparent text-xs text-zinc-100 outline-none font-mono min-w-0"
                      placeholder="Título del chat…"
                      maxLength={80}
                    />
                    <button type="button" onClick={commitEdit} className="p-1 text-emerald-400 hover:text-emerald-300" title="Guardar título (Enter)">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={cancelEdit} className="p-1 text-zinc-500 hover:text-zinc-300" title="Cancelar (Esc)">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    key={chat.id}
                    className="group flex items-center gap-1.5 p-1.5 rounded-lg border border-transparent hover:border-zinc-700/70 hover:bg-zinc-800/50 cursor-pointer transition-all"
                    onClick={() => {
                      onOpenChat?.(chat.id);
                      cancelEdit();
                    }}
                    title={`Abrir "${chat.title}"`}
                  >
                    <FileText className="w-3.5 h-3.5 text-zinc-500 group-hover:text-cyan-400 shrink-0 transition-colors" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-xs text-zinc-200 group-hover:text-cyan-100 transition-colors">{chat.title}</div>
                      <div className="text-[9px] text-zinc-500 font-mono">
                        {chat.messages.length} msj · {new Date(chat.updatedAt).toLocaleDateString()} {new Date(chat.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(chat.id, chat.title);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800 transition-all shrink-0"
                      title="Renombrar"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`¿Borrar el chat "${chat.title}"? Esta acción no se puede deshacer.`)) {
                          onDeleteChat?.(chat.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-all shrink-0"
                      title="Borrar chat"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )
              )}
            </div>

            <div className="px-3 py-2 border-t border-[#101828] text-[9px] text-zinc-600 font-mono shrink-0 leading-relaxed">
              Los chats se guardan en el almacenamiento local de la IDE y sobreviven a reinicios.
            </div>
          </div>
        </>
      )}

      {/* Top Telemetry / Status Bar */}
      <div className="h-10 px-4 bg-[#04060c] border-b border-[#101726] flex items-center justify-between text-xs text-zinc-400 shrink-0 select-text">
        <div className="flex items-center gap-2">
          {/* Carpeta de chats guardados */}
          <button
            type="button"
            onClick={() => setChatsOpen((v) => !v)}
            title="Carpeta de chats guardados: nuevo, abrir, renombrar y borrar conversaciones"
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[11px] border transition-all ${
              chatsOpen
                ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                : "bg-zinc-900/70 border-zinc-700/60 text-zinc-400 hover:text-cyan-300 hover:border-cyan-700/50"
            }`}
          >
            <FolderOpen className="w-3 h-3" />
            <span>Chats ({savedChats.length})</span>
          </button>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-800/60 text-cyan-300 font-mono text-[11px]">
            <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
            <span>{currentModel}</span>
          </div>

          {/* Toggle Modo Agente PC (delega acciones reales al puente :5000) */}
          <button
            type="button"
            onClick={onTogglePcMode}
            disabled={!onTogglePcMode}
            title={
              pcMode
                ? "Modo Agente PC ACTIVO: el chat puede crear/editar archivos y ejecutar comandos en tu PC vía el puente :5000. Clic para desactivar."
                : "Activar Modo Agente PC: permite al chat ejecutar acciones REALES en tu PC (crear archivos en el Escritorio, comandos, etc.) a través del puente :5000."
            }
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[11px] border transition-all ${
              pcMode
                ? "bg-emerald-950/70 border-emerald-600/70 text-emerald-300 shadow-sm shadow-emerald-900/40"
                : "bg-zinc-900/70 border-zinc-700/60 text-zinc-400 hover:text-emerald-300 hover:border-emerald-700/50"
            }`}
          >
            <Cpu className={`w-3 h-3 ${pcMode ? "text-emerald-400 animate-pulse" : "text-zinc-500"}`} />
            <span>Agente PC {pcMode ? "ON" : "OFF"}</span>
          </button>

          {/* 🔧 Cartel de archivo activo eliminado — el usuario lo encuentra confuso.
              El nombre del archivo activo se ve en el panel derecho (editor). */}
        </div>

        <div className="flex items-center gap-2">
          {messageQueue.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/60 border border-amber-800/60 text-amber-300 text-[11px] font-mono">
              <ListOrdered className="w-3 h-3 text-amber-400" />
              <span>{messageQueue.length} en cola</span>
            </div>
          )}

          <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
            <Sparkles className="w-3 h-3" />
            <span>Historial Total Activo</span>
          </div>

          <div className="flex items-center gap-1">
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                title="Regenerar última respuesta"
                className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-cyan-300 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
            {onExportSession && (
              <button
                onClick={onExportSession}
                title="Exportar sesión (JSON)"
                className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-emerald-300 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
            {onImportSession && (
              <button
                onClick={() => importInputRef.current?.click()}
                title="Importar sesión (JSON)"
                className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-amber-300 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
            )}
            {onResetSessionCache && (
              <button
                onClick={onResetSessionCache}
                title="Limpiar conversación"
                className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-red-300 transition-colors"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages Scroll View */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4 select-text">
        {/* v2.0 — Arranque compacto: logo y textos más pequeños para no dejar
            media pantalla vacía cuando el chat está recién abierto. */}
        {messages.length === 0 && !isStreaming && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 max-w-xl mx-auto my-auto select-none">
            <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center mb-6 shadow-2xl shadow-cyan-500/30 ring-1 ring-white/10">
              <span className="text-white font-black text-6xl tracking-tighter leading-none drop-shadow-lg">CN</span>
            </div>
            <h2 className="text-4xl font-black text-zinc-50 mb-2 tracking-tight">
              {IDE_BRAND.NAME}{" "}
              <span className="inline-block align-middle ml-1 text-sm font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-400/30 rounded-full px-3 py-0.5">
                {IDE_BRAND.VERSION}
              </span>
            </h2>
            <p className="text-lg text-zinc-400 leading-relaxed max-w-md mb-2">
              Escribe tu requerimiento abajo para empezar, o usa un atajo.
            </p>
            <p className="text-xs text-zinc-600 tracking-wide uppercase mb-5">
              IA local · sandbox en vivo · puente PC · motor de planes
            </p>

            {/* v2.0 — Pantalla de bienvenida COMPACTA.
                Antes: 4 tarjetas grandes en rejilla 2x2 que ocupaban media
                pantalla y empujaban el compositor hacia abajo (el "espacio
                vacío" de las capturas). Ahora: 2 accesos en una sola fila de
                píldoras de una línea. Quitadas a petición del usuario:
                "Generar README" y "Auditar Seguridad" (eran las 2 de más). */}
            <div className="flex flex-wrap items-center justify-center gap-2 w-full text-xs font-mono">
              <button
                onClick={() => onSendMessage("Analiza la arquitectura del proyecto y genera los módulos del backend en el puerto 5000", [])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0a0e17]/80 hover:bg-[#0c1220] border border-[#121a2c] hover:border-cyan-500/50 text-zinc-300 transition-all"
                title="Generar microservicio de soporte y workers con tipado TypeScript"
              >
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>Módulo Backend :5000</span>
              </button>

              <button
                onClick={() => onSendMessage("Examina los mensajes del chat y resume los acuerdos técnicos", [])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0a0e17]/80 hover:bg-[#0c1220] border border-[#121a2c] hover:border-cyan-500/50 text-zinc-300 transition-all"
                title="Acceso íntegro a todos los turnos del chat"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Historial Completo</span>
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 text-[11px] text-zinc-600">
              <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-cyan-400" /> Multi-provider</span>
              <span className="flex items-center gap-1"><Cpu className="w-3 h-3 text-emerald-400" /> SLM optimizado</span>
              <span className="flex items-center gap-1"><Layers className="w-3 h-3 text-violet-400" /> RAG local</span>
              <span className="flex items-center gap-1"><Terminal className="w-3 h-3 text-amber-400" /> Sandbox :3500</span>
            </div>
          </div>
        )}

        {/* Log de acciones ejecutadas por el Agente PC (herramientas usadas) */}
        {actionLog.length > 0 && (
          <div className="mx-3 mb-2 p-2 rounded-lg border border-emerald-900/40 bg-[#050e0a]">
            <div className="flex items-center gap-2 mb-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] font-mono font-bold text-emerald-300 tracking-wide">
                ACCIONES EJECUTADAS (agente 5000)
              </span>
              <span className="text-[10px] font-mono text-emerald-600">sin costo de LLM</span>
            </div>
            <div className="flex flex-col gap-1">
              {actionLog.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
                  <span className={a.ok ? "text-emerald-400" : "text-red-400"}>
                    {a.ok ? "✓" : "✗"}
                  </span>
                  <span className="text-zinc-300 shrink-0">{a.tool}</span>
                  {a.detail && (
                    <span className="text-zinc-500 truncate" title={a.detail}>
                      {a.detail}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tablero del agente (plan de tareas) */}
        {agentTasks.length > 0 && (
          <div className="mx-3 mb-2 p-2 rounded-lg border border-cyan-900/40 bg-[#050a14]">
            <div className="flex items-center gap-2 mb-1.5">
              <ListOrdered className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] font-mono font-bold text-cyan-300 tracking-wide">
                PLAN DEL AGENTE
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {agentTasks.map((t) => {
                const done = t.status === "completed";
                const active = t.status === "in_progress";
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-2 text-[11px] font-mono ${
                      done ? "text-emerald-400" : active ? "text-amber-300" : "text-zinc-500"
                    }`}
                  >
                    <span className="w-3 text-center shrink-0">
                      {done ? "✓" : active ? "▶" : "·"}
                    </span>
                    <span className={done ? "line-through opacity-70" : ""}>{t.description}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Render Chat Messages */}
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const isError = msg.status === "error";

          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-4xl mx-auto select-text ${
                isUser ? "justify-end" : "justify-start"
              }`}
            >
              {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-[#080d18] border border-cyan-800/40 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[78%] rounded-2xl p-4 text-xs leading-relaxed select-text shadow-md ${
                  isUser
                    ? "bg-[#091122] text-cyan-100 border border-cyan-900/60 rounded-tr-none"
                    : isError
                    ? "bg-red-950/40 text-red-200 border border-red-800/60 rounded-tl-none"
                    : "bg-[#050810] text-zinc-200 border border-[#121a2c] rounded-tl-none"
                }`}
              >
                {/* Attachments Preview in Bubble */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mb-2.5 pb-2 flex flex-wrap gap-1.5 border-b border-zinc-800/60">
                    {msg.attachments.map((att) => renderAttachmentBadge(att, false))}
                  </div>
                )}

                {/* Message Body — V8: .cn-regulable deja que el regulador de tamaño del panel «A» (Aspecto) escale el cuerpo del mensaje, que antes no tenía clase de tamaño y ningún regulador lo alcanzaba */}
                <div className="cn-regulable whitespace-pre-wrap font-sans break-words selection:bg-cyan-500/40 select-text">
                  {componerCuerpo(msg.content)}
                </div>

                {/* Bubble Footer / Copy button + Escuchar (TTS por mensaje) */}
                <div className="mt-2.5 pt-1.5 flex items-center justify-between border-t border-zinc-800/40 text-[10px] text-zinc-500 font-mono">
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                    {msg.modelUsed ? ` • ${msg.modelUsed}` : ""}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {/* Escuchar este mensaje (voz local del sistema) */}
                    <button
                      onClick={() => handleSpeak(msg)}
                      disabled={isSoundMuted}
                      className={`flex items-center gap-1 p-1 rounded transition-colors ${
                        isSoundMuted
                          ? "text-zinc-700 cursor-not-allowed"
                          : speakingId === msg.id
                          ? "text-cyan-300"
                          : "text-zinc-500 hover:text-cyan-300"
                      }`}
                      title={
                        isSoundMuted
                          ? "Audio silenciado: actívalo con el botón de altavoz de la barra superior"
                          : speakingId === msg.id
                          ? "Detener audio de este mensaje"
                          : "Escuchar este mensaje en voz alta"
                      }
                    >
                      {isSoundMuted ? (
                        <VolumeX className="w-3 h-3" />
                      ) : speakingId === msg.id ? (
                        <Square className="w-3 h-3 fill-cyan-300" />
                      ) : (
                        <Volume2 className="w-3 h-3" />
                      )}
                      <span>{isSoundMuted ? "Silenciado" : speakingId === msg.id ? "Detener" : "Escuchar"}</span>
                    </button>

                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 p-1 rounded transition-colors"
                      title="Copiar mensaje"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {isUser && (
                <div className="w-7 h-7 rounded-lg bg-[#0c162a] border border-blue-600/40 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-blue-300" />
                </div>
              )}
            </div>
          );
        })}

        {/* Live Streaming Bubble */}
        {isStreaming && (
          <div className="flex gap-3 max-w-4xl mx-auto justify-start select-text">
            <div className="w-7 h-7 rounded-lg bg-cyan-950/90 border border-cyan-500/50 flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
              <Bot className="w-4 h-4 text-cyan-400" />
            </div>

            <div className="max-w-[85%] sm:max-w-[78%] rounded-2xl p-4 text-xs leading-relaxed bg-[#040710] text-zinc-200 border border-cyan-500/40 rounded-tl-none shadow-lg select-text">
              <div className="whitespace-pre-wrap font-sans break-words selection:bg-cyan-500/40 select-text">
                {currentStreamingText ? componerCuerpo(currentStreamingText) : "Procesando requerimiento..."}
                <span className="inline-block w-1.5 h-3.5 bg-cyan-400 ml-1 animate-pulse" />
              </div>
              <div className="mt-2 text-[10px] text-cyan-400/80 font-mono">
                {currentModel} • Inferencia activa
              </div>
            </div>
          </div>
        )}

        {/* Message Queue Preview in Chat */}
        {messageQueue.length > 0 && (
          <div className="max-w-4xl mx-auto my-2 p-3 bg-[#080d18] border border-amber-800/40 rounded-xl select-text">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-mono">
                <ListOrdered className="w-3.5 h-3.5 text-amber-400" />
                <span>Mensajes en cola ({messageQueue.length})</span>
                <span className="text-[10px] text-zinc-500">Se procesarán secuencialmente</span>
              </div>
              {onClearQueue && (
                <button
                  type="button"
                  onClick={onClearQueue}
                  className="text-[10px] text-red-400 hover:text-red-300 font-mono"
                >
                  Vaciar cola
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {messageQueue.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#020408] border border-zinc-800/80 text-xs text-zinc-300"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-4 h-4 rounded bg-amber-950 border border-amber-700/60 text-amber-400 text-[10px] flex items-center justify-center shrink-0 font-mono">
                      {idx + 1}
                    </span>
                    <span className="truncate max-w-[480px] font-sans">{item.text || "Archivo(s) adjunto(s)"}</span>
                    {item.attachments.length > 0 && (
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                        (+{item.attachments.length} adjuntos)
                      </span>
                    )}
                  </div>
                  {onRemoveQueuedMessage && (
                    <button
                      type="button"
                      onClick={() => onRemoveQueuedMessage(item.id)}
                      className="text-zinc-500 hover:text-red-400 p-1 transition-colors"
                      title="Quitar de la cola"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area Form at Bottom
          v2.0 — El compositor es COMPACTO por defecto: una sola línea de alto.
          Antes forzaba `rows={5}` + `height:120px` y eso dejaba un bloque vacío
          enorme encima del lanzador (visible en las capturas). Ahora crece solo
          cuando escribes, hasta 5 renglones (~130 px), y vuelve a encogerse. */}
      <div className="px-3 pt-2 pb-2.5 bg-[#000000] border-t border-[#101726] shrink-0 select-text">
        <form
          onSubmit={handleSubmit}
          className="max-w-4xl mx-auto bg-[#050810] border border-[#141d2e] rounded-2xl shadow-2xl overflow-hidden focus-within:border-cyan-500/70 transition-all"
        >
          {/* Pending Attachments Strip */}
          {/* v8.0.3 — La tira aparece también MIENTRAS carga. Antes la condición
              era `pendingAttachments.length > 0`, así que durante el procesado
              de un lote grande (las imágenes generan su miniatura una a una) no
              se veía absolutamente nada hasta que entraba la primera: el usuario
              soltaba 30 archivos y no pasaba nada en pantalla. El contador ahora
              distingue «listos» de «cargando». */}
          {(pendingAttachments.length > 0 || pendingNames.length > 0) && (
            <div className="px-3 pt-2.5 pb-1.5 flex flex-wrap gap-1.5 border-b border-zinc-800/80 bg-[#03050a]">
              <div className="w-full flex items-center justify-between text-[11px] text-zinc-400 font-mono mb-1">
                <span>
                  {pendingAttachments.length} adjunto(s) listo(s)
                  {pendingNames.length > 0 && (
                    <span className="text-cyan-400"> · {pendingNames.length} cargando…</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={onClearPendingAttachments}
                  className="text-red-400 hover:text-red-300 text-[10px] flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Limpiar todos
                </button>
              </div>
              {pendingAttachments.map((att) => renderAttachmentBadge(att, true))}
              {pendingNames.map((nombre, i) => renderAttachmentPendiente(nombre, i))}
            </div>
          )}

          {/* ============================================================
              v1.6.5 — AVISO DE VOZ, EN FLUJO NORMAL.
              Antes vivía con `absolute -top-11 left-0 right-0` DENTRO de la caja
              del textarea: su contenedor no era `relative`, así que el navegador
              lo posicionaba contra otro ancestro y el `overflow-hidden` del
              formulario lo recortaba a medias. El resultado era el «cartel por
              delante» flotando sobre la zona de escritura y comiéndose el sitio
              donde se teclea. Ahora es un banner más de la columna del
              compositor: nunca puede tapar el textarea ni los mensajes.
              Información, no bloqueo: se puede cerrar. */}
          {ttsAviso && (
            <div className="px-3 pt-2 pb-2 flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 text-amber-200 text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="flex-1 leading-relaxed select-text">{ttsAviso}</span>
              <button
                type="button"
                onClick={() => setTtsAviso(null)}
                className="shrink-0 text-amber-300 hover:text-white"
                title="Cerrar aviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Text Input Box — v2.0: arranca en 1 renglón y crece hasta 5 (≈130 px).
              `flex-1 min-w-0` + `overflow-y-auto` evitan que el textarea empuje el
              layout cuando el texto es largo. */}
          <div className="p-2 flex items-end gap-2 bg-[#0a0e17]/90 backdrop-blur-sm rounded-lg border border-zinc-800 mx-2 mb-2">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                // v1.6.11 — antes de cambiar el valor, se apunta el anterior: es
                // el historial que usa Ctrl+Z (ver registrarParaDeshacer).
                const bruto = e.target.value;
                registrarParaDeshacer(bruto);
                let texto = bruto;
                // F1 — con «auto», el autocorrector reemplaza en caliente solo
                // las correcciones seguras; si nada cambió NO se reescribe (así
                // no parpadea el caret). «sugerir»/«off» dejan lo escrito intacto.
                let modo: "off" | "sugerir" | "auto" = "sugerir";
                try {
                  modo = loadProSettings().editor.autocorrector ?? "sugerir";
                } catch {
                  /* configuración ilegible → sugerir */
                }
                if (modo === "auto") {
                  const caret = e.target.selectionStart ?? bruto.length;
                  const corregida = corregirLinea(bruto, "auto").texto;
                  if (corregida !== bruto) {
                    texto = corregida;
                    const ta = e.currentTarget;
                    ta.setSelectionRange(Math.min(caret, texto.length), Math.min(caret, texto.length));
                  }
                }
                setInputText(texto);
                const ta = e.currentTarget;
                ta.style.height = "auto";
                // 5 renglones ≈ 130 px (text-sm con leading-relaxed)
                ta.style.height = Math.min(ta.scrollHeight, 130) + "px";
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isStreaming
                  ? "Escribe para encolar el siguiente mensaje..."
                  : "Escribe tu requerimiento o arrastra archivos..."
              }
              rows={1}
              className="flex-1 min-w-0 bg-transparent text-zinc-100 placeholder-zinc-600 text-sm py-1.5 px-1 outline-none resize-none leading-relaxed select-text border-none focus:outline-none overflow-y-auto custom-scrollbar"
              style={{ height: "auto", maxHeight: "130px" }}
            />

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onAddAttachments(e.target.files);
                }
              }}
            />

            {/* Action Buttons: Voz TTS, Attach, Model Pill, Send/Stop */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/*
                v1.6.19 — EL SELECTOR DE VOZ SE VA.
                Lo pidió el usuario: «quita el coso este de Gemini del chat, está
                al pedo si no anda, ocupa lugar». Y tiene razón en lo del lugar:
                se comía 150 px de la barra para elegir entre unas voces que, sin
                clave, todas hacían lo mismo.

                Que quede claro por si alguien vuelve a mirar esto: NO era la
                causa de que el modelo no respondiera. Aquello era el aborto del
                primer token (ver GEMINI_PRIMER_TOKEN_TIMEOUT_MS), otro camino
                distinto. Este desplegable solo elige la voz del botón
                «Escuchar», y nunca pudo afectar a la inferencia.

                Los mensajes siguen teniendo su «Escuchar»: usa la voz del
                navegador. Si algún día se quiere recuperar la elección de voces,
                el estado `ttsVoice` y `hayClaveGeminiTts` siguen aquí enteros —
                solo hay que volver a pintar el <select>.
              */}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-cyan-300 rounded-xl border border-zinc-800 transition-colors"
                title="Adjuntar archivos (ZIP, DOCX, código, imágenes)"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onOpenModelSelector}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-850 text-cyan-300 rounded-xl border border-zinc-800 text-xs font-mono transition-colors"
                title="Cambiar modelo activo"
              >
                <Radio className="w-3 h-3 text-cyan-400" />
                <span className="max-w-[100px] truncate">{currentModel}</span>
              </button>

              {isStreaming ? (
                <div className="flex items-center gap-1">
                  <button
                    type="submit"
                    disabled={!inputText.trim() && pendingAttachments.length === 0}
                    className="p-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl shadow-md transition-all flex items-center gap-1 text-xs font-mono"
                    title="Encolar mensaje para enviarlo al terminar la generación actual"
                  >
                    <ListOrdered className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Encolar</span>
                  </button>
                  <button
                    type="button"
                    onClick={onStopStreaming}
                    className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-xl shadow-md transition-colors"
                    title="Detener generación"
                  >
                    <Square className="w-4 h-4 fill-white" />
                  </button>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={!inputText.trim() && pendingAttachments.length === 0}
                  className="p-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:hover:bg-cyan-600 text-white rounded-xl shadow-md transition-all"
                  title="Enviar requerimiento"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Hidden Import Session File Input */}
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          if (file && onImportSession) {
            onImportSession(file);
          }
          e.target.value = "";
        }}
      />

      {/* v8.0.3 — VISTA PREVIA EN GRANDE DE UN ADJUNTO.
          Se abre al pulsar la miniatura del chip. Existe por el caso «muchas»:
          con veinte capturas parecidas, la miniatura de 36 px dice cuál es la
          zona de la pantalla, pero no permite comprobar si es la buena. Se cierra
          con Escape, con la X o pulsando fuera — las tres, porque cada una es la
          que intenta la mitad de la gente. */}
      {vistaPrevia && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm grid place-items-center p-6"
          onClick={() => setVistaPrevia(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setVistaPrevia(null);
          }}
          tabIndex={-1}
          // Cuerpo con llaves a propósito: `(el) => el && el.focus()` devuelve
          // `void | null`, y React tipa la ref como `void | (() => void)`. Cuela
          // en runtime y no compila con `strict`. Con llaves, no devuelve nada.
          ref={(el) => { if (el) el.focus(); }}
        >
          <div className="max-w-[90vw] max-h-[90vh] flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 text-xs text-zinc-300 font-mono">
              <span className="truncate max-w-[70vw]" title={vistaPrevia.nombre}>
                {vistaPrevia.nombre}
              </span>
              <button
                type="button"
                onClick={() => setVistaPrevia(null)}
                className="text-zinc-400 hover:text-white shrink-0 flex items-center gap-1"
                title="Cerrar (Escape)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={vistaPrevia.src}
              alt={vistaPrevia.nombre}
              className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg border border-zinc-700 bg-zinc-950"
            />
          </div>
        </div>
      )}
    </main>
  );
};
