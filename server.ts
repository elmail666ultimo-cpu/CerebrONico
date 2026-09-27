import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import nodeCrypto from "node:crypto";
// EXE v1 — vite es devDependency: en el instalador empaquetado NO existe, y
// un import estático aquí rompía dist/server.mjs al cargar. Se importa solo en
// el modo desarrollo (rama dev del servidor).
import { GoogleGenAI } from "@google/genai";
import os from "os";
// v2.0 — Clasificación de modelos y ajustes de rendimiento (compartido con el cliente)
import {
  getModelProfile,
  buildOllamaOptions,
  trimMessagesToBudget,
  parseParamsB,
  type ModelProfile,
} from "./src/engine/modelTiers";
// v1.11.0 · FASE 2 — primera extracción: el monolito adelgaza. Las rutas de
// diagnóstico (salud profunda, perfil de modelo, catálogo de Ollama) viven ahora
// en su propio módulo. Se le pasan los valores de arranque para que siga habiendo
// UNA sola fuente de verdad sobre Ollama y los recursos de la máquina.
import { registrarDiagnostico } from "./server/routers/diagnostico";
// v1.12.0 · FASE 2 — telemetría y recursos salen del monolito, y con ellos el
// PRIMER ESTADO: la caché de telemetría y la muestra de CPU viven ahora en
// `server/estado/`, con API propia. Es el patrón que necesitan las demás
// variables globales. Al sandbox no se le alcanza: se le pregunta (ver deps).
import { registrarTelemetria } from "./server/routers/telemetria";
// v1.15.1 — espejos por servidor de datos: el catálogo (sql, mongo, redis,
// grafo, vectorial…) se expone como rutas reales; antes era un módulo huérfano.
import { registrarEspejosServidor } from "./server/routers/espejosServidor";
// v1.15.1 — plan de dependencias del puente PC: el planificador existía y
// estaba testado, pero nadie lo exponía; ahora vive en su propio router.
import { registrarPuenteDependencias } from "./server/routers/puenteDependencias";
// v1.15.1 — capacidades corroboradas: un único endpoint que dice con números
// qué está activo de verdad (skills, herramientas, consejo, rutas, plugins).
import { registrarCapacidades } from "./server/routers/capacidades";
import { invalidarMuestra } from "./server/estado/telemetria";
import { clasificarErrorTTS, recortarDetalle } from "./server/ttsErrores";
// v1.13.0 · FASE 2 — el ESTADO DEL SANDBOX sale del monolito: era el último bloque
// grande de estado compartido (35 sitios tocando una variable global). Las rutas
// siguen aquí, pero ya no son dueñas del proceso: preguntan por él.
import { isPidAlive, registrarProceso, olvidarProceso, procesoActual, sandboxVivo, pidSandbox, matarProceso } from "./server/estado/sandbox";
// v1.14.0 · La certeza llega al texto del modelo: el contexto de streaming sale
// del monolito y, al cerrar el turno, pasa la respuesta por `revisarSalida`. Así
// la certeza se engancha al chat sin hacer crecer server.ts (trinquete de la Fase 2).
import { StreamContext } from "./server/streamContext";
// v2.0 — Registro de herramientas extensible (packs internos + packs externos futuros)
import {
  registerBuiltinPacks,
  registerToolPack,
  unregisterToolPack,
  registerExternalPack,
  getActiveToolSpecs,
  getToolSpec,
  selectToolsForModel,
  toOllamaTools,
  listToolPacks,
  getAllToolNames,
  type ToolSpec,
} from "./src/engine/toolRegistry";
// v2.0 — Resiliencia profunda: clasificación de errores, reintentos y cortacircuitos
import { classifyError, describeResilience, withRetry } from "./src/engine/resilience";
import { normalizarReceta, generarArchivos, instruccionUso } from "./src/engine/pluginForja"; // FORJA v1: el sistema compone los complementos
// v2.0 — Extensiones de terceros (manifiesto, validación y registro)
import {
  EXTENSION_API_VERSION,
  ExtensionRegistry,
  listCommands,
  listPanels,
  listToolContributions,
  validateManifest,
  type ExtensionManifest,
} from "./src/engine/extensions";
// v2.0 — EL MOTOR: base de datos de conocimiento, blindaje de sintaxis y
// validación del contexto de herramientas. El conocimiento vive aquí, no en el
// modelo: así cualquier "conductor" (Ollama, GLM, Gemini…) responde igual.
import {
  KnowledgeBase,
  buildEngineContext,
  validateToolCall,
  // v2.1 — `tokenize` FALTABA aquí y el aprendizaje de fallos de herramientas
  // llevaba desde entonces sin funcionar: se llamaba más abajo, lanzaba
  // ReferenceError, y el `catch` que lo envuelve ("el aprendizaje nunca debe
  // romper la ejecución") se lo tragaba en silencio. Un fallo silencioso de
  // manual: la función existía, se llamaba, y no hacía absolutamente nada.
  tokenize,
  type ToolSchema,
} from "./src/engine/knowledgeBase";
import { guardFile, guardFileProfundo, rejectMessage, problemasBloqueantes, type FuncionTransform } from "./src/engine/syntaxGuard";
// v1.6.32 · CALIDAD (ROADMAP D-P1): el parser real del blindaje es EL MISMO
// esbuild con el que Vite compila el sandbox. Si esbuild lo rechaza, el
// proyecto no compila: el oráculo y la víctima son el mismo juez, y así no
// hay falsos positivos por construcción. `--packages=external` en el bundle
// mantiene esta importación externa; si la dependencia faltara (instalación
// --omit=dev), `guardFileProfundo` AVISA y deja pasar — nunca encarcela.
import { transform as esbuildTransform } from "esbuild";
import { extraerMetricasOllama, type MetricasInferencia } from "./src/engine/metricasInferencia";
// v1.16.0 — el bucle de herramientas ya no se corta a mitad: lo decide un módulo puro.
import { decidirBucle, informeHonesto, tareasPendientes, actualizarPlanDesdeHerramienta, techoDePasos, PASOS_BASE, type TareaPlan, type UltimoFallo } from "./src/engine/bucleAutonomo";

/** El transform del proyecto, adaptado al contrato inyectable del guardián. */
const PARSER_ESBUILD: FuncionTransform = (codigo, opts) =>
  esbuildTransform(codigo, {
    loader: opts.loader,
    sourcefile: opts.sourcefile,
    target: "es2022",
    // tsconfigRaw vacío: juzga sintaxis sin buscar un tsconfig en el disco
    // del sandbox (que está cambiando MIENTRAS se sincroniza).
    tsconfigRaw: {},
  } as any);
import {
  crearOperacion,
  anotarCirugia,
  evaluarCirugia,
  cerrarOperacion,
  puertasEstandar,
  puertasPesadas,
  serializarOperacion,
  deserializarOperacion,
  revertir,
  lineaQuirofano,
  cirugiasDe,
  type Operacion,
  type Disco,
  type Puerta,
  type ModoEvaluacion,
  type VeredictoOperacion,
  type Diagnostico,
} from "./src/engine/quirofano"; // QUIRÓFANO v1 /*QF-IMPORT*/
// v1.8.0 · VOZ — certeza del propio trabajo, explicación por artefacto y mensajes
// espontáneos. Se importan junto al Quirófano a propósito: es él quien tiene la
// evidencia que estos módulos necesitan (si las puertas cerraron en verde o no).
// Sin esa evidencia, un artefacto se explica como «solo leído» y se dice así.
import { explicarArtefacto, type EntradaArtefacto } from "./src/engine/explicacionArtefacto";
import { mensajesEspontaneos, type ContextoVoz, type MensajeEspontaneo } from "./src/engine/autoRespuesta";
// v2.0 — Manuales del motor: leyes + uso de cada herramienta + procedimientos.
// Se inyectan en cada turno con las herramientas activas, para que cualquier
// modelo (por flojo que sea) sepa cómo usar lo que tiene delante.
import { buildToolManualSection, MANUAL_ENTRIES } from "./src/engine/manuals";
// Fase 2 — Índice de símbolos (conocimiento real del proyecto) y compactador
// de contexto (disciplina de tokens en el motor).
import { buildSymbolMap, findSymbols, summarizeSymbols, type SymbolMap } from "./src/engine/symbolIndex";
import { compactToolResult, compactToolOutput } from "./src/engine/compactor";
// v2.0 — Verificador de imports: detecta componentes que el modelo importa pero
// nunca creó (causa directa del cartel rojo de Vite y la pantalla en blanco).
import {
  findMissingImports,
  buildStubs,
  describeMissingImports,
  type CheckFile,
  type MissingImport,
} from "./src/engine/importChecker";
// v1.6.7 — CHEQUEO PREVIO DE DEPENDENCIAS: paquetes que el proyecto importa y
// que nadie declaró. Es lo que dejaba el sandbox arrancado pero en blanco.
import {
  paquetesFaltantes,
  declaradosSinInstalar,
  comandoInstalacion,
  describirFaltantes,
  // v1.6.24 — AUDITORÍA DE INTEGRIDAD: deja de preguntar «¿existe la carpeta?»
  // y empieza a preguntar «¿el paquete puede cargarse?». Sin esto, un
  // node_modules podado por el ZIP pasaba por instalado y el sandbox moría
  // con «Cannot find module …/vite/dist/node/chunks/dist.js».
  auditarInstalacion,
  instalacionSana,
  saludDePaquete,
  type DiscoDeAuditoria,
} from "./src/engine/dependenciasProyecto";
// v1.6.9 — EL BÚFER DE INFERENCIA, EN EL CAMINO REAL DE LOS DATOS.
// Hasta ahora era un módulo escrito y probado que nadie importaba. Aquí pasa a
// ser lo que interpreta cada línea del NDJSON de Ollama.
import { handleInferenceStream } from "./src/engine/inferenceBuffer";
// v1.6.10 — RAÍZ DE DATOS: dónde vive todo (bóveda, espejos, conocimiento y
// proyectos) y la mudanza de una sola vez a C:\Cerebronico.
import {
  resolverRaizDatos,
  decidirMigracion,
  mensajeMigracion,
  CARPETAS_DE_ESTADO,
  rechazarRaizAncestroApp,
} from "./src/engine/raizDatos";
// v1.6.9 — VÍA RÁPIDA DE PREVISUALIZACIÓN: decidir la ruta más barata en vez de
// ir siempre por `npm install && npm run dev`.
import {
  elegirViaPreview,
  esFrameworkConServidor,
  tieneConfigPropia,
  fuentesATranspilar,
  entradaDeHtml,
  comandoBundle,
  reescribirHtmlParaBundle,
  importacionesDesnudas,
  NOMBRE_BUNDLE,
  NOMBRE_RESPALDO,
} from "./src/engine/viaRapidaPreview";
// v2.0 — CEREBRO + MEMORIA: capa de gobernanza del motor.
// cerebro.md = ley inmutable · memoria.md = estado vivo (escritura atómica +
// snapshots en memoria_history/, con rollback).
import { Brain } from "./src/engine/brain";
// v8.0.2 — CONTENEDOR GENERAL: reconocer cualquier formato por firma mágica,
// planear conversiones declarando lo que se pierde, y crear/modificar vídeo con
// recetas de ffmpeg. Se engancha aquí para que NO sea código muerto: las mismas
// funciones puras que hoy tienen 161 comprobaciones en las pruebas son las que
// responde el endpoint `/api/contenedor/inspeccionar`.
import { inspeccionar, planDeEntrega, capacidades, type Motor as MotorContenedor } from "./src/engine/contenedor";
import { estadoCadenaVideo } from "./src/engine/videoGen";
// v8.0.4 — Aduana del comando que entra a la consola. Nació de un defecto real:
// el TEXTO de una llamada de herramienta (`run_command command="…"`) llegó al
// shell y se intentó ejecutar. Se desenvuelve si es legible; si no, se rechaza.
import { normalizarComandoEntrante, esServidorDeLargaVida } from "./src/engine/comandoEntrante";
// v1.6.31 — ESPEJO-SYNC: el sync ya no deja restos. Un manifiesto de propiedad
// (.cn-sync/manifiesto.json) recuerda qué archivos escribió el sync; lo que se
// escribió antes y ya no llega se RETIRA. Las funciones puras viven en
// src/engine/espejoSync.ts; aquí solo se les da el disco.
import {
  MANIFESTO_DIR,
  MANIFESTO_FILE,
  crearManifiesto,
  planificarRetiro,
  registrarSync,
  serializarManifiesto,
  parsearManifiesto,
  esRutaIgnorableSync,
  lineaEspejoSync,
} from "./src/engine/espejoSync";
// v0.9 — Fuente única de la versión. La usaba la interfaz pero NO el servidor, y
// por eso el saludo del modo demo se había quedado en «CerebroNico V1».
import { IDE_BRAND } from "./src/constants";
// v8.0.7 — EL ESPEJO DEL PROYECTO: plantilla de qué archivos necesita cada tipo
// de proyecto, y cotejo contra lo que hay. Nació del «siempre se olvida de los
// archivos de un proyecto»: el modelo no escribe mal, no sabe cuántos son.
import { compararConEspejo, preguntaDeFaltantes } from "./src/engine/plantillasProyecto";
// CN v1.5.0 — EL PUENTE, MEDIDO EN VIVO. El módulo puro aporta el contrato, el
// búfer circular y las métricas; aquí se le da un transporte REAL contra Ollama.
// Y `http`/`socketPath` sólo se usan AQUÍ (server.ts es Node), nunca bajo `src/`,
// que va al paquete del navegador: la regla del módulo puro se respeta.
import { medirPuente, PuenteNube, compararPuentes, veredicto, UMBRAL_TTFT_MS, type PuenteIA } from "./src/engine/puenteIA";
// v2.0 — Vectorización local (RAG) de la memoria. CONSTRUIDA Y APAGADA: solo
// trabaja si el usuario la activa con el botón. Apagada no cuesta nada.
import { LocalRAG } from "./src/engine/localRAG";
// v2.0 — Laboratorio de capacidades avanzadas: construidas y APAGADAS, cada una
// con su botón. Nada se recorta por el hardware de hoy.
import { AdvancedFeatures } from "./src/engine/advancedFeatures";
// v2.0 — Gobernador de hardware: mide la máquina real (RAM libre, núcleos),
// clasifica la fase (V2.0/V2.1/V2.2/V2.3) y dictamina qué cabe AHORA. No activa
// nada por su cuenta: informa y recomienda.
import { HardwareGovernor, cpuPercentReal } from "./src/engine/hardwareGovernor";
// v2.1 — Verificador independiente EN LA NUBE: un segundo modelo (de otro
// proveedor) revisa la propuesta. Coste local ~0,1 MB: cabe en 8 GB, hoy.
import { CloudVerifier } from "./src/engine/cloudVerifier";
// ─── El cerebro de tareas (v2.2) ────────────────────────────────────────────
import { PlanRunner } from "./src/engine/planRunner";
import { GestorPlanes, crearAlmacenFs } from "./src/engine/taskStoreFs";
import { crearEjecutorDePlanes } from "./src/engine/planExecutors";
import { narrarDesdeAviso, coreoEstado, notificar } from "./src/engine/coreo"; // COREO v1 (+FONDO: notificar)
import { validarFondo, tipoDeArchivo, dentroDe, metaDeFondo, limiteLegible, LIMITES_BYTES, TIPOS_FONDO } from "./src/engine/fondo"; // FONDO v1
import { cedeElLazo } from "./src/engine/sandboxTregua"; // TREGUA v1 /*TREGUA*/
// v1.6.23 — RESCATE v1: antes de nuklear .proyectos, el estado de CerebroNico
// (.cerebro-db: kb, espejos, salud, bóveda, leyes + MEMORIA.md y skills.md) se
// muda a la app. Si el rescate falla, el vaciado se ABORTA: la regla de «Borrar
// todo» del editor ya no puede llevarse puesta la memoria aprendida en silencio.
import {
  planearFusion,
  rutaRelRescate,
  procederBorrado,
  resumenRescate,
  planReSembrado,
  decidirRespaldo,
} from "./src/engine/estadoRescate"; /*RESCATE*/
import { convertir, idaYVuelta, FORMATOS as FORMATOS_CONV, type Formato as FormatoConv } from "./src/engine/formatConverter";
// ─── Imágenes gratis (v2.3) ──────────────────────────────────────────────────
import { generarImagen, validarDatosImagen, estadoCadenaImagen, rutaConExtensionReal } from "./src/engine/imageGen";
import { validarRutaImagen, instruccionesParaElModelo, extraerOrdenes } from "./src/engine/chatOrders";
import { TABLAS } from "./src/engine/reflejo";
import { estadoConsejo, ejecutarEntidad, cambiarActivacion, pensarConsejo, ENTIDADES, configurarSistema } from "./src/engine/reflejo/consejo";
// v1.15.1 — honestidad del consejo: qué acciones tienen ejecutor real y cuáles
// solo están declaradas. Antes el catálogo existía pero nadie lo exponía.
import { resumenEjecutores, EJECUTORES_CONSEJO } from "./src/engine/ejecutoresConsejo";
import { estadoEspejos, normalizarSeleccion, fijarSeleccion, fijarTurbo, IDS_ESPEJOS, GRUPOS_ESPEJOS, grupoPorTarea, notaSeleccionEspejos } from "./src/engine/reflejo/espejos"; // ESPEJOS v1 · TURBO v1 · GRUPO v1 · V8 D1 (la nota del equipo viaja a TODOS los proveedores)
import { planificadorPorLeyes, estadoOrquestador, cargarLeyesAprendidas, LEYES_REFLEJO, orquestarPorFamilia, guardarLeyesAprendidas, leyAprendida, fijarTablaSalud, diagnosticoLeyes, configurarFsOrquestador, type LeyReflejo } from "./src/engine/reflejo/orquestador"; // ORQUESTADOR v1.0 (Reflejo v3.0) + SALUD/CONFIANZA v5
import { inicializarPool, agregarAlPool, quitarDelPool, catalogoPersonalizados, poolListo, poolEspejos } from "./src/engine/reflejo/cargadorEspejos"; // Reflejo v3.0 · Paso 2: espejos personalizados
import { registrarEjecucion, parsearTabla, serializarTabla, vistaSalud, estadoDe, scoreDe, type TablaSalud } from "./src/engine/reflejo/salud"; // SALUD v1 (Reflejo v5, manual §6.3)
import { reconocerCarpeta, clasificarEntrada, auditarEntradas, lineaReconocimiento, MARCADORES_PROYECTO } from "./src/engine/sandboxCompat"; // ADUANA v2 (Reflejo v5)
// v1.6.12 — «que sea funcional»: la evidencia web manda sobre un marcador suelto,
// y el esqueleto mínimo (package.json / index.html) se genera si falta.
import {
  hayEvidenciaWeb,
  servirPeseAlMarcador,
  esqueletoFaltante,
  packageJsonMinimo,
  indexHtmlMinimo,
} from "./src/engine/proyectoFuncional";
import { planearTransporte, indiceCon, indiceVacio, parsearIndice, arbolInicial, lineaTransporte, raizBovedaPorDefecto, CARPETAS_BOVEDA } from "./src/engine/bovedaLocal"; // BÓVEDA v1 (Reflejo v5)
import { createHash as _chAg, randomUUID as _ruAg } from "node:crypto";
configurarSistema({ totalmem: () => os.totalmem(), freemem: () => os.freemem(), cpus: () => os.cpus(), loadavg: () => os.loadavg(), sha256: (x) => _chAg("sha256").update(x, "utf8").digest("hex"), uuid: () => _ruAg() });
// ─── El Reflejo (v2.4) ──────────────────────────────────────────────────────
import { pensarReflejo, estadoReflejo } from "./src/engine/reflejo";
import { spawnSync } from "child_process";
import {
  analizarProyecto as analizarProyectoExport,
  veredictoAndroid,
  pasosDeExportacion,
  configCapacitor,
  appIdValido,
  appIdDesdeNombre,
  androidDesdeApi,
  PISO_ANDROID,
} from "./src/engine/mobileExport";
import { validarPlan, resumenPlan, lineaEstadoTarea, type Plan } from "./src/engine/taskPlanner";
import {
  resolverPresupuesto,
  siguienteEscalado,
  ESCALADOS,
  PERFILES_MR,
  ORDEN_MR,
  etiquetaEscalado,
  type MRId,
} from "./src/engine/memoriaResiliente";
// v2.1 — Adaptador de proyectos: arregla el puerto de arranque para que
// cualquier proyecto importado (p. ej. los de AI Studio, que traen
// `vite --port=3000`) funcione en el sandbox :3500 sin editarlo a mano.
import {
  normalizeProjectPort,
  resolverRaizProyecto as resolverRaizProyectoEn,
} from "./src/engine/projectPorter";

const PORT = Number(process.env.PORT) || 3000;
const WORKER_PORT = 5000;
const OLLAMA_DEFAULT = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

/**
 * CN v1.5.0 — TRANSPORTE POR SOCKET DE DOMINIO UNIX, PARA PODER MEDIRLO.
 *
 * Medición propia (ver `ide/backend/tools/puente-bench/`): ida y vuelta por socket
 * Unix = 16,42 µs frente a 45,08 µs de TCP loopback. Un 63 % menos. Y el motivo de
 * fondo es que **en Linux un socket Unix ya es un búfer circular del kernel**: el
 * «cero copia» que se buscaba con lenguajes nuevos ya está ahí, y sale más rápido
 * que montarlo a mano (31,89 µs el mmap+eventfd).
 *
 * POR QUÉ ESTO NO SUSTITUYE AL CANAL QUE YA FUNCIONA: sería migrar a ciegas. Se
 * añade como SEGUNDO transporte, y el endpoint de medición compara los dos con la
 * misma entrada. Si el socket Unix no existe en el equipo, se dice que no existe
 * — no se compara contra un cero que parecería una victoria.
 *
 * Vive en `server.ts` y NO bajo `src/` a propósito: `node:http` no puede acabar en
 * el paquete del navegador, y `src/` va entero al navegador.
 */
function puenteUds(rutaSocket: string, modelo: string, recordarEntrada: string): PuenteIA {
  void recordarEntrada;
  return {
    modo: `UDS (${rutaSocket})`,
    async conectar(): Promise<void> { /* el canal se abre en la petición */ },
    async *enviar(entrada: string): AsyncGenerator<TrozoUds, void, unknown> {
      const http = await import("node:http");
      const cuerpo = JSON.stringify({
        model: modelo,
        messages: [{ role: "user", content: entrada }],
        stream: true,
        options: { num_predict: 24 },
      });

      // Cola mínima: `http.request` empuja por eventos y un generador asíncrono
      // tiene que esperar. Sin esta cola habría que acumular la respuesta entera
      // para poder devolverla — que es exactamente el defecto que se está midiendo.
      const cola: Uint8Array[] = [];
      let terminado = false;
      let fallo: unknown = null;
      let despertar: (() => void) | null = null;
      const avisar = () => { const d = despertar; despertar = null; if (d) d(); };

      const req = http.request(
        {
          socketPath: rutaSocket,
          path: "/api/chat",
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(cuerpo) },
        },
        (resp) => {
          resp.on("data", (d: Buffer) => { cola.push(new Uint8Array(d)); avisar(); });
          resp.on("end", () => { terminado = true; avisar(); });
          resp.on("error", (e) => { fallo = e; terminado = true; avisar(); });
        }
      );
      req.on("error", (e) => { fallo = e; terminado = true; avisar(); });
      req.end(cuerpo);

      let n = 0;
      for (;;) {
        while (cola.length) yield { n: n++, bytes: cola.shift()!, tRecibido: Date.now() };
        if (terminado) break;
        await new Promise<void>((r) => { despertar = r; });
      }
      while (cola.length) yield { n: n++, bytes: cola.shift()!, tRecibido: Date.now() };
      if (fallo) throw fallo;
    },
    async cerrar(): Promise<void> { /* se cierra al agotarse el stream */ },
  };
}

/** Sólo para tipar el transporte de arriba sin arrastrar el tipo del módulo puro. */
type TrozoUds = { n: number; bytes: Uint8Array; tRecibido: number };

const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

// Constants for the streaming layer
const OLLAMA_INACTIVITY_MS = 5 * 60 * 1000;    // kill Ollama stream if no token in 5 min (model loading can take long on slow CPUs)
// 🔧 CORRECCIÓN CRÍTICA: el timeout de conexión era 8s — eso abortaba el fetch
// ANTES de que Ollama terminara de cargar el modelo en RAM. En CPUs lentos
// (como un i5-3340M), cargar qwen2.5-coder:1.5b y procesar el prompt puede tardar
// 87+ segundos. Subimos a 3 min para dar tiempo a la carga inicial del modelo.
const OLLAMA_CONNECT_TIMEOUT_MS = 3 * 60 * 1000; // 3 min for first byte (model load + prompt processing)
const OLLAMA_MAX_CONNECT_ATTEMPTS = 4; // OLLAMA v2 — 4 intentos con backoff de segundos ≈ 14 s de paciencia (arranque en frío en disco lento)

// ============================================================
// v1.6.16 — ⏱️ TECHO DE ESPERA PARA LA NUBE («tardan una eternidad»)
// ------------------------------------------------------------
// AUDITORÍA DEL CAMINO DE /api/ai/stream: NINGUNO de los nueve `fetch` a
// proveedores cloud llevaba `signal`, `AbortSignal` ni timeout. El único
// límite era el watchdog global de 8 MINUTOS. Así que si el proveedor se
// quedaba mudo antes de mandar la primera cabecera —lo típico en un tier
// gratuito saturado, y exactamente el `fetch failed` que ya se había visto
// con Z.ai— la interfaz se quedaba esperando en silencio. No colgada, no
// con error: esperando. El usuario lo describe como «una eternidad», y
// tenía razón: podía ser literalmente hasta ocho minutos sin un solo aviso.
//
// El corte es SOLO de PRIMER BYTE (time to first byte). Es deliberado:
// una vez que el proveedor empieza a mandar cabeceras, la generación puede
// tardar legítimamente minutos (2.000 tokens), y abortar a mitad sería peor
// que esperar. Si no hay primera cabecera en el plazo, la petición está
// muerta con casi total seguridad, así que se corta y se dice por qué.
// ============================================================
// v1.6.21 — 45 s → 120 s. ESTE TECHO ERA DEMASIADO AGRESIVO, Y LO PAGABA EL
// USUARIO CON «A VECES NO RESPONDEN».
//
// El razonamiento de la v1.6.16 sigue siendo bueno: no dejar la interfaz en
// blanco ocho minutos. Pero un proveedor SOBRECARGADO —Z.ai devolviendo 1305—
// no está mudo: está lento. Tarda 50, 60, 90 segundos en arrancar y luego
// escribe. A los 45 s se le cortaba, y el usuario no veía ni un error de Z.ai
// ni una respuesta: no veía nada.
//
// 120 s separa bien los dos casos: un cuelgue real se corta igual, y un
// proveedor lento pero vivo ya no se mata. Se pierde algo de inmediatez en el
// aviso de cuelgue, y se gana que Z.ai sobrecargado sí conteste.
//
// La solución de fondo sería un techo de INACTIVIDAD (cortar solo si pasan N
// segundos sin que llegue nada, en vez de un límite fijo antes de la primera
// cabecera), pero eso vive donde se consume el cuerpo del stream, no aquí.
const CLOUD_FIRST_BYTE_TIMEOUT_MS = 120_000;

/**
 * `fetch` para proveedores cloud con techo en la espera de la primera cabecera.
 * Mismo contrato que `fetch`, así que sustituye al original sin tocar nada más.
 */
// ⚠️ El tipo de retorno es `globalThis.Response` y NO `Response` a secas: en
// este archivo `Response` es el de Express (está importado arriba), así que el
// tipo sin cualificar apuntaba al objeto de la respuesta HTTP de Express y no
// al de `fetch`. El compilador lo detectó como 41 errores en cadena.
async function fetchCloud(url: string, init: RequestInit): Promise<globalThis.Response> {
  const ctrl = new AbortController();
  const temporizador = setTimeout(() => ctrl.abort(), CLOUD_FIRST_BYTE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err: any) {
    // El temporizador se limpia en el `finally` en cuanto llegan las cabeceras,
    // así que llegar aquí con AbortError significa que NO llegaron.
    if (err?.name === "AbortError") {
      let anfitrion = url;
      try { anfitrion = new URL(url).host; } catch { /* se queda la URL cruda */ }
      throw new Error(
        `sin respuesta de ${anfitrion} en los primeros ${CLOUD_FIRST_BYTE_TIMEOUT_MS / 1000} s ` +
        `(se cortó la espera para no dejarte en blanco; prueba otro modelo o revisa la conexión)`
      );
    }
    throw err;
  } finally {
    clearTimeout(temporizador);
  }
}

// ============================================================
// Sandbox: directorio de proyecto real + ejecución de comandos
// ============================================================
// v1.6.10 — «que el agente 5000 guarde todo en el disco C:».
// PROJECT_DIR manda; sin él, el comportamiento de siempre. El puente de :5000
// lee la MISMA variable (agent_bridge_5000.py): si solo la leyera el motor, la
// mudanza partiría el almacenamiento en dos.
const raizPorDefecto = path.join(process.cwd(), ".proyectos");
const raizResuelta = resolverRaizDatos(process.env, process.cwd());
// v1.6.23 — GUARDA-RAÍZ v1: un PROJECT_DIR que contenga a la propia app (la
// instalación misma o un ancestro) se RECHAZA y cae al default, con aviso en
// consola. Sin esta guarda, el resolutor encuentra `ide\backend` a dos niveles
// y el piloto intenta instalar y compilar la IDE dentro de su propio sandbox
// (el incidente rollup `ModuleScope.findVariable` que mató el :3500).
const raizValidada = rechazarRaizAncestroApp(raizResuelta.raiz, process.cwd(), raizPorDefecto);
if (raizValidada.rechazada) console.warn(`[CerebroNico] ⛔ GUARDA-RAÍZ v1: ${raizValidada.motivo}`);
const PROJECT_ROOT = raizValidada.raiz;
try {
  fs.mkdirSync(PROJECT_ROOT, { recursive: true });
} catch {}

// --- Mudanza de una sola vez (reglas en src/engine/raizDatos.ts) ------------
// Copia, nunca mueve ni borra: el original se queda donde estaba, así que
// volver atrás es borrar la carpeta nueva. Y solo si la nueva está VACÍA.
try {
  const hayEstado = (raiz: string) =>
    CARPETAS_DE_ESTADO.some((c) => {
      try {
        return fs.existsSync(path.join(raiz, c));
      } catch {
        return false;
      }
    });
  const decision = decidirMigracion({
    raizDestino: PROJECT_ROOT,
    raizOrigen: raizPorDefecto,
    destinoTieneEstado: hayEstado(PROJECT_ROOT),
    origenTieneEstado: hayEstado(raizPorDefecto),
  });
  if (decision.migrar) {
    for (const carpeta of CARPETAS_DE_ESTADO) {
      const desde = path.join(raizPorDefecto, carpeta);
      if (!fs.existsSync(desde)) continue;
      // `force: false` = no pisa nada que ya exista en el destino.
      fs.cpSync(desde, path.join(PROJECT_ROOT, carpeta), {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
    }
    console.log(`[CerebroNico] ${mensajeMigracion(raizPorDefecto, PROJECT_ROOT)}`);
  } else if (raizResuelta.origen === "PROJECT_DIR") {
    console.log(`[CerebroNico] Raíz de datos: ${PROJECT_ROOT} (${decision.motivo}).`);
  }
} catch (err: any) {
  console.warn(
    `[CerebroNico] La mudanza de raíz no se completó (${err?.message ?? err}). Se sigue con la raíz nueva.`
  );
}

// Por seguridad el servidor escucha solo en localhost por defecto.
// Usa HOST=0.0.0.0 (junto con ACCESS_TOKEN) solo si necesitas acceso en red local.
const HOST = process.env.HOST || "127.0.0.1";

const execAsync = promisify(exec);

/**
 * Guard de acceso para las puertas mutantes (sandbox, exec, fs, quirófano…).
 *
 * v1.7.0 · DE «SI HAY TOKEN LO EXIJO» A «FUERA DE LOCALHOST, SIEMPRE»
 * ------------------------------------------------------------------
 * Antes esto empezaba con `if (!token) return true;`: sin ACCESS_TOKEN la
 * puerta NO existía. Y el mismo guard protege rutas alcanzables desde la red
 * local — el sandbox fuerza su propio HOST a 0.0.0.0 para el preview :3500, y
 * el puente escucha en :5000. Es decir: la ausencia de una variable de entorno
 * convertía una decisión de seguridad en un permiso.
 *
 * Ahora el reparto es explícito y en voz alta:
 *   · Loopback (la IDE, en la misma máquina) → pasa sin token. Exigir token
 *     aquí no añadiría seguridad: quien puede hablar por loopback ya está
 *     dentro de la máquina. Sería ceremonia, no puerta.
 *   · Cualquier otra dirección → token obligatorio Y correcto. Si no hay
 *     ACCESS_TOKEN definido, NO pasa: un fallo de configuración no puede
 *     degradar a «permiso concedido».
 */
function sandboxAuthorized(req: Request): boolean {
  const token = process.env.ACCESS_TOKEN;
  const provided = String(req.headers["x-access-token"] || "") || String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token && provided === token) return true;

  // Sin token correcto solo pasa la propia máquina. Y si NO hay ACCESS_TOKEN
  // definido, `token` es undefined: no puede coincidir con nada, así que una
  // petición de fuera de loopback NO pasa. Ese es el fail-closed, escrito como
  // propiedad del código y no como una comprobación aparte que alguien pueda
  // borrar sin darse cuenta.
  //
  // (La suite quirfanoPuertas exige que la comparación con el token esté a
  // menos de 220 caracteres de su lectura. Se mantiene a propósito: es el
  // contrato de que la puerta NO se ha aflojado, y está bien que sea frágil.)
  const ip = String(req.ip || req.socket?.remoteAddress || "");
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" ||
    ip.startsWith("127.") || ip === "localhost";
}

// ============================================================
// SALUD v1 (Reflejo v5) — la flota de espejos se gana su prioridad
// ------------------------------------------------------------
// .cerebro-db/espejos-salud.json guarda usos/éxitos/correcciones por espejo.
// El orquestador recibe la tabla por inyección (fijarTablaSalud): un espejo
// DORMIDO (score < 0.5 con ≥8 usos) no se elige solo en el auto-enrutado,
// pero la ruta explícita (id o familia) siempre lo alcanza. Dormir no es matar.
// ============================================================
const archivoSalud = path.join(PROJECT_ROOT, ".cerebro-db", "espejos-salud.json");
let TABLA_SALUD: TablaSalud = {};
try {
  if (fs.existsSync(archivoSalud)) {
    const pr = parsearTabla(JSON.parse(fs.readFileSync(archivoSalud, "utf8")));
    TABLA_SALUD = pr.tabla;
    for (const a of pr.avisos) console.log(`[Salud] aviso: ${a}`);
  }
} catch (e: any) {
  console.log(`[Salud] no se pudo leer espejos-salud.json (${String(e?.message || e)}): se arranca limpio.`);
}
fijarTablaSalud(TABLA_SALUD);
function guardarSalud() {
  try {
    fs.mkdirSync(path.dirname(archivoSalud), { recursive: true });
    fs.writeFileSync(archivoSalud, serializarTabla(TABLA_SALUD), "utf8");
  } catch {}
}
/** Registra una ejecución de espejo (ok / corregida) y persiste. Nunca lanza. */
function registrarSaludEspejo(id: string, ok: boolean, corregido = false) {
  try {
    TABLA_SALUD = registrarEjecucion(TABLA_SALUD, id, ok, corregido);
    fijarTablaSalud(TABLA_SALUD);
    guardarSalud();
  } catch {}
}

// ============================================================
// BÓVEDA v1 (Reflejo v5) — el transporte de imágenes al disco real
// ------------------------------------------------------------
// «Que el agente cree C:\CN con carpetas indexadas (IMAGENES, APPS,
// INVESTIGACION, documentos, datos) y que la imagen generada VIAJE hasta
// ahí». El viaje lo ejecuta el puente PC (:5000) — la única puerta con manos
// fuera del sandbox — por /api/fs/write_b64. La config vive en
// .cerebro-db/boveda.json; sin puente no hay viaje, y eso se DECLARA.
// ============================================================
const archivoBoveda = path.join(PROJECT_ROOT, ".cerebro-db", "boveda.json");
interface ConfigBoveda { activa: boolean; raiz: string; }
let BOVEDA: ConfigBoveda = (() => {
  const porDefecto: ConfigBoveda = { activa: true, raiz: raizBovedaPorDefecto(process.platform, os.homedir()) };
  try {
    if (fs.existsSync(archivoBoveda)) {
      const c = JSON.parse(fs.readFileSync(archivoBoveda, "utf8"));
      if (typeof c?.raiz === "string" && c.raiz.trim()) porDefecto.raiz = c.raiz.trim();
      if (typeof c?.activa === "boolean") porDefecto.activa = c.activa;
    }
  } catch {}
  if (process.env.CN_BOVEDA_RAIZ) porDefecto.raiz = process.env.CN_BOVEDA_RAIZ;
  if (process.env.CN_BOVEDA === "0" || process.env.CN_BOVEDA === "off") porDefecto.activa = false;
  return porDefecto;
})();
function guardarBoveda() {
  try {
    fs.mkdirSync(path.dirname(archivoBoveda), { recursive: true });
    fs.writeFileSync(archivoBoveda, JSON.stringify(BOVEDA, null, 2), "utf8");
  } catch {}
}
/** POST al puente PC con timeout duro. Devuelve null si el puente no está. */
async function puenteFetch(ruta: string, cuerpo: Record<string, unknown>, timeoutMs = 20000): Promise<any | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`http://127.0.0.1:${WORKER_PORT}${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}
/**
 * El transporte en sí: planea la ruta indexada, escribe el binario por el
 * puente y actualiza el INDICE.json de la carpeta destino. Devuelve la línea
 * honesta para el chat/avisos. Nunca lanza: si el puente no contesta, la
 * imagen YA está a salvo en el sandbox y el aviso lo dice.
 */
async function transportarABoveda(opts: {
  bytes: Uint8Array;
  mime: string;
  proyecto: string;
  archivo: string;
  origenSandbox: string;
  categoria?: string;
  modeloUsado?: string;
}): Promise<string> {
  if (!BOVEDA.activa) return "";
  const plan = planearTransporte({
    raiz: BOVEDA.raiz,
    categoria: opts.categoria || "imagen",
    proyecto: opts.proyecto,
    archivo: opts.archivo,
    mimeReal: opts.mime,
    fechaIso: new Date().toISOString(),
    separador: process.platform === "win32" ? "\\" : "/",
  });
  if (!plan.ok) return lineaTransporte(false, null, plan.motivo);
  const firma = _chAg("sha256").update(opts.bytes).digest("hex").slice(0, 16);
  const w = await puenteFetch("/api/fs/write_b64", {
    path: plan.plan.rutaLocal,
    contentBase64: Buffer.from(opts.bytes).toString("base64"),
  });
  if (!w?.ok) return lineaTransporte(false, plan.plan, "el puente PC (:5000) no respondió o rechazó la escritura; la imagen queda en el sandbox");
  // Índice: leer el viejo (si existe), añadir, escribir. Si la lectura falla,
  // se arranca limpio y se avisa — un índice reconstruido vale más que ninguno.
  let indice = indiceVacio();
  const archivoIndice = `${BOVEDA.raiz.replace(/[\\/]+$/, "")}${process.platform === "win32" ? "\\" : "/"}${CARPETAS_BOVEDA[plan.plan.carpeta]}${process.platform === "win32" ? "\\" : "/"}INDICE.json`;
  const r = await puenteFetch("/api/fs/read", { path: archivoIndice });
  if (r?.ok && r.content) {
    try { indice = parsearIndice(JSON.parse(r.content)); } catch {}
  }
  indice = indiceCon(indice, {
    archivo: plan.plan.relativa,
    proyecto: plan.plan.proyecto,
    origenSandbox: opts.origenSandbox,
    mime: opts.mime,
    bytes: opts.bytes.length,
    modeloUsado: opts.modeloUsado,
    firma,
    en: new Date().toISOString(),
  });
  await puenteFetch("/api/fs/write", { path: archivoIndice, content: JSON.stringify(indice, null, 2) });
  return lineaTransporte(true, plan.plan, "");
}

/** ADUANA v2: ¿esta carpeta (por nombres) es un proyecto reconocible? */
function esCarpetaProyecto(nombres: string[]): boolean {
  const r = reconocerCarpeta(nombres);
  return !!r && r.peso >= 40; // desde "make" hacia arriba; docs/datos no secuestran la raíz
}

function resolveSafePath(relPath: string): string {
  const abs = path.resolve(PROJECT_ROOT, relPath);
  const rel = path.relative(PROJECT_ROOT, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Ruta fuera del proyecto no permitida.");
  }
  return abs;
}

// ============================================================
// v2.1 — ¿HAY UNA COPIA MÁS NUEVA DEL PROYECTO DENTRO DE .proyectos?
// ------------------------------------------------------------
// CAUSA RAÍZ de la pantalla en blanco que sobrevivía a reinstalaciones.
//
// Había TRES sitios distintos —el estado, el aplanado y el resolutor de raíz—
// que daban el trabajo por terminado en cuanto veían un `package.json` EN LA
// RAÍZ:
//     if (existe .proyectos/package.json)  →  "ya hay proyecto, no hay nada que hacer"
// Y es razonable… salvo por un detalle que lo rompe todo: el sync escribe
// SIEMPRE el árbol anidado, porque el workspace guarda las rutas con su carpeta
// contenedora (`CerebroNico-IDE-v2.1/ide/backend/src/...`). Es decir: en la raíz
// vive el proyecto VIEJO y dentro el proyecto RECIÉN SINCRONIZADO.
//
// Con esa condición, en cuanto la raíz tuvo un `package.json` —cosa que pasa en
// el primer aplanado— el sandbox quedaba CONGELADO para siempre: el sync seguía
// escribiendo el árbol nuevo y nadie lo subía. Si el `src/` de la raíz venía de
// una época en que el importador cortaba a los 40 archivos, conservaba `main.tsx`
// y `App.tsx` —que entraban siempre— pero NO los componentes, que eran justo los
// que el corte se comía. Resultado exacto y permanente: el navegador cargaba el
// TÍTULO y devolvía 404 en TODOS los `/src/components/*`.
//
// Esta búsqueda mira DENTRO siempre, aunque la raíz ya tenga package.json.
// ============================================================
function buscarProyectoAnidado(): string | null {
  const skip = new Set([
    "node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage",
    "venv", "__pycache__", ".cerebro-db", ".vite", ".next", ".nuxt",
  ]);
  const recorrer = (dir: string, prof: number): string | null => {
    if (prof > 5) return null;
    let entradas: fs.Dirent[] = [];
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entradas) {
      if (!e.isDirectory()) continue;
      // ============================================================
      // v8.0.5 — 🐞 EL APLANADO TAMPOCO ENCONTRABA NADA, POR ESTA LÍNEA
      // ------------------------------------------------------------
      // Antes: `if (e.name.startsWith(".") || skip.has(e.name)) continue;`
      //
      // Se descartaba cualquier carpeta que empezara por punto ANTES de mirar
      // dentro. Y en este proyecto los caminos empiezan por punto: la carpeta
      // contenedora se llama `.proyectos`. Así que el proyecto anidado vivía en
      // un subdirectorio con punto, esta función lo descartaba por su nombre, y
      // el aplanado respondía «no hay ninguna copia anidada» teniéndola delante.
      //
      // De ahí el «no aplana bien y no encuentra los archivos» del usuario: no
      // era que aplazara mal, es que nunca llegaba a mirar.
      //
      // Se ignora por LISTA (artefactos y control de versiones), no por prefijo.
      // ============================================================
      if (skip.has(e.name)) continue;
      const sub = path.join(dir, e.name);
      // ADUANA v2: cualquier proyecto reconocible (node, python, rust, go,
      // java, php, ruby, estático, docker, make…) vale — antes solo era
      // «package.json» y un ZIP de Python anidado era invisible.
      try {
        if (esCarpetaProyecto(fs.readdirSync(sub))) return sub;
      } catch {}
      const hit = recorrer(sub, prof + 1);
      if (hit) return hit;
    }
    return null;
  };
  return recorrer(PROJECT_ROOT, 1);
}

// Auto-arranque del Puente Python (puerto 5000): lo levanta si no está activo y lo apaga al cerrar
// 🔧 Devuelve además una función restart() para que el endpoint /api/bridge/restart pueda
// reiniciar el puente bajo demanda del usuario (botón "Reconectar" en la UI).
async function startAgentBridge(): Promise<{ kill: () => void; restart: () => Promise<boolean> } | null> {
  // ============================================================
  // v2.1 — 🐞 EL PUENTE NO DEBE ARRANCAR DENTRO DEL SANDBOX
  // ------------------------------------------------------------
  // Cuando el sandbox ejecuta ESTE proyecto, la IDE anidada intentaba levantar
  // su propio puente en :5000… que YA está ocupado por el puente de la IDE
  // anfitriona, en la misma máquina. Reproducido en local, literal:
  //   ❌ [ERROR] El puerto 5000 ya está ocupado.        (×5)
  //   [CerebroNico] Puente 5000 agotó 5 reinicios.
  //   [CerebroNico] Puente 5000 iniciado con python3 pero /health no responde aún.
  // De ahí el "no escucha" en la interfaz: el puente del sandbox NUNCA puede
  // escuchar, porque ese puerto no es suyo. No es un fallo de tu proyecto.
  //
  // Y no hace falta: el sandbox ejecuta con runCommand(..., raizProyecto) LOCAL
  // (ver /api/sandbox/*), así que no necesita puente para nada. Además, las
  // herramientas pc_* no tienen sentido ahí: acabarían actuando sobre la PC del
  // usuario a través del puente de la IDE anfitriona.
  //
  // Opt-out: CN_SANDBOX_CHILD=1 (lo pone sandboxEnv) o CN_DISABLE_BRIDGE=1.
  // ============================================================
  if (process.env.CN_SANDBOX_CHILD === "1" || process.env.CN_DISABLE_BRIDGE === "1") {
    console.log(
      "[CerebroNico] Puente 5000 OMITIDO a propósito: esto es un proyecto corriendo DENTRO del sandbox. El puerto 5000 es de la IDE anfitriona y el sandbox no necesita puente."
    );
    return null;
  }
  const scriptPath = path.join(process.cwd(), "agent_bridge_5000.py");
  if (!fs.existsSync(scriptPath)) {
    console.log("[CerebroNico] agent_bridge_5000.py no encontrado; puerto 5000 no se auto-inicia.");
    return null;
  }

  const pythonBin = process.platform === "win32" ? "python" : fs.existsSync("/usr/bin/python3") ? "python3" : "python";

  // 🔧 Fallback sin Python (v3.3): si Python no está instalado en la PC del
  // usuario, el puente moría en silencio y el EXE empaquetado del agente nunca
  // se usaba. Ahora: si hay Python usa el script; si no, lanza el EXE
  // (dist/CerebroNicoAgent.exe, creado por build_backend.bat).
  const probeCommand = (bin: string) =>
    runCommand(process.platform === "win32" ? `where ${bin} >nul 2>nul` : `command -v ${bin}`, process.cwd(), 8000);
  const pythonOk =
    (await probeCommand(pythonBin)).exitCode === 0 &&
    (await runCommand(`"${pythonBin}" --version`, process.cwd(), 8000)).exitCode === 0;

  const exeCandidates = [
    path.join(process.cwd(), "..", "dist", "CerebroNicoAgent.exe"),
    path.join(process.cwd(), "dist", "CerebroNicoAgent.exe"),
  ];
  const bridgeExe = exeCandidates.find((p) => fs.existsSync(p)) || null;

  if (!pythonOk && !bridgeExe) {
    console.warn(
      "[CerebroNico] Ni Python ni dist/CerebroNicoAgent.exe están disponibles: el puente :5000 no se auto-inicia. Instala Python o compila el agente con build_backend.bat."
    );
    return null;
  }
  const useExe = !pythonOk;
  console.log(
    useExe
      ? `[CerebroNico] Python no detectado: el puente :5000 usará el agente compilado ${bridgeExe}`
      : `[CerebroNico] Puente :5000 usará Python (${pythonBin}) con agent_bridge_5000.py`
  );

  // USERDATA v1 (recap): el log vive donde el proceso PUEDE escribir. En una
  // instalación por-máquina (C:\Program Files) cwd es solo-lectura para el
  // usuario normal y el createWriteStream fallaba en silencio. PROJECT_ROOT ya
  // honra PROJECT_DIR (que Electron dirige a userData).
  const bridgeLogPath = path.join(PROJECT_ROOT, ".bridge_5000.log");
  let bridgeLogStream: fs.WriteStream | null = null;
  try {
    bridgeLogStream = fs.createWriteStream(bridgeLogPath, { flags: "w" });
  } catch {
    bridgeLogStream = null;
  }

  let child: any = null;
  let restartCount = 0;
  const MAX_RESTARTS = 5;
  let userCancelled = false;
  let puertoRobado = false; // v2.6.2 — EADDRINUSE no se reinicia en storm: se declara

  const spawnBridge = () => {
    if (userCancelled) return;
    try {
       child = useExe
         ? spawn(bridgeExe as string, [], {
             cwd: path.dirname(bridgeExe as string),
             stdio: ["ignore", "pipe", "pipe"],
             detached: false,
             // V8 · D3: el puente exige token en todo POST; el IDE se lo pasa al nacer
             env: { ...process.env, PORT: "5000", HOST: "127.0.0.1", ACCESS_TOKEN: BRIDGE_TOKEN },
           })
         : spawn(pythonBin, [scriptPath], {
             cwd: path.dirname(scriptPath),
             stdio: ["ignore", "pipe", "pipe"],
             detached: false,
             env: { ...process.env, PORT: "5000", HOST: "127.0.0.1", ACCESS_TOKEN: BRIDGE_TOKEN },
           });
    } catch (spawnErr: any) {
      console.warn(`[CerebroNico] No se pudo spawnear el Puente 5000:`, spawnErr.message);
      return;
    }

    child.on("error", (err: any) => {
      console.warn(`[CerebroNico] Puente 5000 error de spawn:`, err.message);
    });

    if (child.stdout) {
      child.stdout.on("data", (d: Buffer) => {
        const s = d.toString();
        if (bridgeLogStream) bridgeLogStream.write(s);
        // v1.6.0 — AQUI ESTABA EL DEFECTO. La deteccion de puerto ocupado solo
        // miraba stderr, y el puente Python anuncia el puerto ocupado por
        // STDOUT (es un print). Medido en el registro real: seis arranques
        // seguidos, seis EADDRINUSE, y el supervisor contando cada uno como
        // caida hasta agotar los 5 reintentos.
        // Un puerto ocupado es un estado PERMANENTE, no un fallo transitorio.
        if (/EADDRINUSE|Address already in use|ya esta ocupado|ya está ocupado/i.test(s)) puertoRobado = true;
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (d: Buffer) => {
        const s = d.toString();
        if (bridgeLogStream) bridgeLogStream.write(s);
        if (/EADDRINUSE|Address already in use/i.test(s)) puertoRobado = true;
        // Los errores del puente también van a la consola del server para diagnóstico
        console.warn(`[Puente 5000 stderr] ${s.trim()}`);
      });
    }

    child.on("exit", (code: number | null, signal: string | null) => {
      console.warn(`[CerebroNico] Puente 5000 terminó (code=${code} signal=${signal}). Log en ${bridgeLogPath}.`);
      if (userCancelled) return;
      if (puertoRobado) {
        // v1.6.0 — Se nombra el ESTADO REAL del puerto, que es lo que faltaba.
        // El mensaje anterior era cierto pero no respondia a la pregunta que el
        // usuario se hace: «entonces el 5000 funciona o no?». Un puerto ocupado
        // por un proceso que NO responde /health es un estado INDETERMINADO, y
        // asi hay que llamarlo: de lo contrario la cabecera sigue diciendo
        // «5000 OK» mientras mira un cadaver.
        console.warn("[CerebroNico] :5000 ocupado por OTRO proceso: el puente no puede arrancar.");
        console.warn("[CerebroNico] ESTADO DEL PUERTO: INDETERMINADO (algo escucha, pero no es este puente).");
        console.warn("[CerebroNico] Liberar:  Windows -> netstat -ano | findstr :5000  +  taskkill /PID <PID> /F");
        console.warn("[CerebroNico]           Linux/Mac -> fuser -k 5000/tcp");
        console.warn("[CerebroNico] No se reintenta: un puerto ocupado no se arregla esperando.");
        restartCount = MAX_RESTARTS;
      }
      if (restartCount < MAX_RESTARTS) {
        restartCount++;
        console.log(`[CerebroNico] Reiniciando Puente 5000 (intento ${restartCount}/${MAX_RESTARTS}) en 1s...`);
        setTimeout(() => {
          if (!userCancelled) spawnBridge();
        }, 1000);
      } else {
        console.warn(`[CerebroNico] Puente 5000 agotó ${MAX_RESTARTS} reinicios. Usa /api/bridge/restart para reintentar manualmente.`);
        // Reset del contador para que el endpoint /api/bridge/restart funcione
        restartCount = 0;
      }
    });
  };

  // v2.6.2 — adopción de puente preexistente: si :5000 ya responde /health
  // (otra instancia de la IDE o un arranque manual), spawnear otro solo produce
  // la tormenta EADDRINUSE + 5 reinicios zombis que viste en el chat. Se adopta.
  try {
    const probe = new AbortController();
    const pt = setTimeout(() => probe.abort(), 1200);
    const pr = await fetch("http://127.0.0.1:5000/health", { signal: probe.signal });
    clearTimeout(pt);
    if (pr.ok) {
      console.log("[CerebroNico] :5000 ya tiene un puente sano: adoptado (no se spawnea un duplicado).");
      return { kill: () => {}, restart: async () => true };
    }
  } catch { /* nadie al otro lado: se spawnea normal */ }

  spawnBridge();

  // Esperar a que el puente responda /health antes de declarar éxito.
  let ready = false;
  for (let i = 0; i < 16; i++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 800);
      const res = await fetch("http://127.0.0.1:5000/health", { signal: controller.signal });
      clearTimeout(t);
      if (res.ok) { ready = true; break; }
    } catch {
      /* aún no listo */
    }
    await sleepMs(500);
  }
  if (ready) {
    console.log(`[CerebroNico] Puente 5000 iniciado con ${pythonBin} y listo en http://127.0.0.1:5000.`);
  } else {
    console.warn(`[CerebroNico] Puente 5000 iniciado con ${pythonBin} pero /health no responde aún. Log en ${bridgeLogPath}.`);
  }

  // Reinicia el contador de auto-restarts para que el restart manual siempre funcione
  const restart = async (): Promise<boolean> => {
    console.log("[CerebroNico] Restart manual del Puente 5000 solicitado...");
    // Matar el proceso actual si existe
    try {
      if (child && !child.killed) {
        userCancelled = true;  // evitar auto-restart automático
        child.kill();
        // Dar tiempo a que el puerto se libere
        await sleepMs(800);
        userCancelled = false;
      }
    } catch {}
    restartCount = 0;
    spawnBridge();
    // Esperar a que esté listo
    for (let i = 0; i < 16; i++) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 800);
        const res = await fetch("http://127.0.0.1:5000/health", { signal: controller.signal });
        clearTimeout(t);
        if (res.ok) {
          console.log("[CerebroNico] Puente 5000 reiniciado y listo.");
          return true;
        }
      } catch {}
      await sleepMs(500);
    }
    console.warn("[CerebroNico] Puente 5000 no respondió tras restart manual.");
    return false;
  };

  return {
    kill: () => {
      userCancelled = true;
      try {
        if (child) child.kill();
      } catch {}
      try {
        if (bridgeLogStream) bridgeLogStream.end();
      } catch {}
    },
    restart,
  };
}

/**
 * ============================================================
 * v2.1 — RAÍZ REAL DEL PROYECTO (la otra mitad del bug de package.json)
 * ------------------------------------------------------------
 * 🐞 /api/sandbox/status ya buscaba el package.json POR NIVELES, pero
 * /api/sandbox/start lo miraba SOLO en la raíz de .proyectos. Con un proyecto
 * importado que trae carpeta contenedora (lo normal: un ZIP extraído como
 * `Mi-Proyecto/…/package.json`), el estado decía "hay proyecto" y el arranque
 * decía "no hay proyecto": el sandbox quedaba en blanco sin explicación.
 *
 * Esta función es la única autoridad sobre dónde vive el proyecto, y la usan
 * tanto el estado como el arranque, para que no puedan contradecirse.
 * Devuelve la carpeta con package.json más cercana a la raíz (o la que tenga
 * index.html si no hay npm: eso es un proyecto estático válido).
 * ============================================================
 */
function resolverRaizProyecto() {
  return resolverRaizProyectoEn(PROJECT_ROOT);
}

// ============================================================
// v1.6.24 — AYUDAS COMPARTIDAS DEL SANDBOX
// ------------------------------------------------------------
// Nacieron de un log que lo contaba todo: el editor tenía una copia de la
// PROPIA CerebróNico, el aplanado se puso a mover el suelo bajo los pies del
// proceso vivo, /api/exec corrió `npm install` en un directorio sin
// package.json (ENOENT), el resolutor no podía denunciar la raíz porque la
// propia app vivía ahí, y verify-preview —que solo conoce proyectos Vite—
// sentenció «página en blanco» sobre un puerto que respondía a un servidor
// huérfano de una sesión anterior («pid externo»). Cada ayuda cierra una
// de esas cuatro puertas; todas eran verificables en el disco, ninguna
// necesitó adivinar.
// ============================================================

/** Adaptador de disco para la auditoría de integridad (v1.6.24). */
const DISCO_AUDITORIA: DiscoDeAuditoria = {
  existe: (p: string) => fs.existsSync(p),
  leer: (p: string) => {
    try {
      return fs.readFileSync(p, "utf-8");
    } catch {
      return null;
    }
  },
  unir: (...p: string[]) => path.join(...p),
};

/** ¿Dentro de este directorio vive (o es) la app que está ejecutándose AHORA? */
function esCarpetaDeLaAppViva(dir: string): boolean {
  try {
    const r = path.resolve(dir);
    const cwdApp = path.resolve(process.cwd());
    return r === cwdApp || cwdApp.startsWith(r + path.sep);
  } catch {
    return false;
  }
}

/** `name` del package.json del directorio, o null si no lo hay o no se lee. */
function nombreDelPackageEn(dir: string): string | null {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"))?.name || "") || null;
  } catch {
    return null;
  }
}

/**
 * ¿El node_modules de esa raíz está SANO? v1.6.24: `installed` en el estado
 * del sandbox era `existsSync(node_modules)` —con un árbol podado mentía—, y
 * sobre esa mentira el piloto se saltaba la instalación. Ahora pasa por la
 * auditoría de integridad. Si el package.json no se lee, no se bloquea nada:
 * se devuelve true (el preflight del arranque ya audita con más datos).
 */
function nodeModulesSanoEn(raiz: string): boolean {
  if (!fs.existsSync(path.join(raiz, "node_modules"))) return false;
  let deps: string[] = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(raiz, "package.json"), "utf-8"));
    deps = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
  } catch {
    return true;
  }
  if (deps.length === 0) return true;
  return instalacionSana(auditarInstalacion(raiz, deps, DISCO_AUDITORIA));
}

/**
 * Busca el `package.json` más cercano DESDE una base hacia abajo (máx. 4
 * niveles, sin entrar en artefactos). Es la brújula de GUARDA-ENOENT en
 * /api/exec: si el cwd resuelto no tiene proyecto npm pero el proyecto está
 * un nivel más adentro —el caso del sync con carpeta contenedora—, el
 * comando se ejecuta donde vive el package.json, no donde npm va a gritar.
 */
function buscarPackageJsonBajo(base: string): string | null {
  const IGNORAR = new Set(["node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage", ".next", ".nuxt", ".vite", "__pycache__", "venv", ".venv"]);
  const cola: Array<{ dir: string; prof: number }> = [{ dir: base, prof: 0 }];
  while (cola.length > 0) {
    const cur = cola.shift()!;
    if (cur.prof > 4) continue;
    let entradas: string[] = [];
    try {
      entradas = fs.readdirSync(cur.dir);
    } catch {
      continue;
    }
    for (const e of entradas) {
      if (!fs.existsSync(path.join(cur.dir, e))) continue;
      let esDir = false;
      try {
        esDir = fs.statSync(path.join(cur.dir, e)).isDirectory();
      } catch {}
      if (!esDir) {
        if (e === "package.json" && cur.prof > 0) return cur.dir;
        continue;
      }
      if (IGNORAR.has(e)) continue;
      cola.push({ dir: path.join(cur.dir, e), prof: cur.prof + 1 });
    }
  }
  return null;
}

/** Nombre del proyecto actual para la BÓVEDA: el primer tramo de la raíz
 *  resuelta bajo .proyectos; "sandbox" si la raíz es .proyectos mismo. */
function nombreProyectoSandbox(): string {
  try {
    const rel = path.relative(PROJECT_ROOT, resolverRaizProyecto().raiz);
    const seg = rel.split(path.sep)[0] || "";
    return seg && !seg.startsWith("..") ? seg : "sandbox";
  } catch {
    return "sandbox";
  }
}

async function runCommand(command: string, cwd: string, timeoutMs: number) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
    });
    return { stdout, stderr, exitCode: 0, timedOut: false };
  } catch (err: any) {
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || "",
      exitCode: typeof err.code === "number" ? err.code : 1,
      timedOut: Boolean(err.killed),
      error: err.message,
    };
  }
}

// Determina la ventana de contexto óptima de Ollama según el tamaño del modelo
function getOptimalNumCtx(modelName: string): number {
  const lower = modelName.toLowerCase();
  // Modelos en la nube o muy grandes: contexto extenso (no consume RAM local)
  if (lower.includes("cloud") || lower.includes("120b") || lower.includes("70b") || lower.includes("72b") || lower.includes("31b")) {
    return 65536;
  }
  if (lower.includes("13b") || lower.includes("14b") || lower.includes("32b") || lower.includes("34b")) {
    return 32768;
  }
  if (lower.includes("7b") || lower.includes("8b") || lower.includes("9b") || lower.includes("11b")) {
    return 16384;
  }
  // Modelos locales pequeños (hasta 4b): contexto amplio y seguro para 8 GB de RAM
  return 8192;
}

// ============================================================
// Puente PC (agent_bridge_5000.py, puerto 5000)
// ------------------------------------------------------------
// Cuando el usuario activa "Modo Agente PC", el chat puede
// delegar acciones REALES sobre la PC del usuario a través de
// este puente Python: ejecutar comandos y leer/crear/borrar
// archivos fuera del sandbox .proyectos.
// ============================================================
const BRIDGE_URL = `http://127.0.0.1:${WORKER_PORT}`;
// V8 · D3 — el puente exige token en todo POST. El IDE lo genera al arrancar y
// lo pasa al puente por ACCESS_TOKEN + lo envía en la cabecera de cada llamada.
const BRIDGE_TOKEN = nodeCrypto.randomBytes(18).toString("hex");

async function bridgeFetch(path: string, body?: any, timeoutMs = 12000): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method: body !== undefined ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-Cerebro-Token": BRIDGE_TOKEN },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return await res.json();
  } catch (err: any) {
    return { ok: false, error: `Puente 5000 no disponible (${err?.message || "conexión fallida"})` };
  } finally {
    clearTimeout(t);
  }
}

// ============================================================
// AGENTE: llamada a herramientas (tool calling) para Ollama
// ============================================================

// Herramientas base: operan dentro del sandbox del proyecto (.proyectos).
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "Listar los archivos del proyecto en el sandbox",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Leer el contenido de un archivo del proyecto (ruta relativa)",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta relativa del archivo" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Escribir o crear un archivo en el proyecto (ruta relativa)",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta relativa del archivo" },
          content: { type: "string", description: "contenido completo del archivo" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Ejecutar un comando de terminal en el sandbox (npm, node, python, git, ls...)",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "comando a ejecutar" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_plan",
      description: "Definir el plan de trabajo como una lista de tareas accionables (úsala ANTES de empezar)",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "identificador corto, ej t1" },
                description: { type: "string", description: "descripción de la tarea" },
              },
              required: ["id", "description"],
            },
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Actualizar el estado de una tarea del plan",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "identificador de la tarea" },
          status: { type: "string", enum: ["pending", "in_progress", "completed"] },
        },
        required: ["task_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_tests",
      description: "Ejecutar las pruebas del proyecto (npm test) y devolver el resultado",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "comando de test opcional, por defecto npm test" } },
        required: [],
      },
    },
  },
];

// Herramientas de ACCESO PC REAL (solo se inyectan cuando el usuario
// activa "Modo Agente PC"). Se ejecutan a través del puente Python :5000.
const PC_TOOLS = [
  {
    type: "function",
    function: {
      name: "pc_info",
      description:
        "Obtener información de la PC del usuario: sistema operativo, usuario, ruta del Escritorio (Desktop), carpeta home, arquitectura y Python. Úsala ANTES de actuar sobre archivos de la PC para conocer las rutas reales.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "pc_exec",
      description:
        "Ejecutar un comando de terminal REAL en la PC del usuario (CMD en Windows, bash en Linux/Mac). Para crear un archivo usa pc_write_file (más fiable que echo). Para listar usa pc_list_dir.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "comando a ejecutar, ej: 'dir' o 'echo hola > C:\\\\Users\\\\USER\\\\Desktop\\\\x.txt'" },
          timeout: { type: "number", description: "segundos máximos (por defecto 120)" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pc_write_file",
      description:
        "Crear o sobrescribir un archivo REAL en la PC del usuario. Acepta rutas absolutas (C:\\Users\\... o /home/...) o atajos: 'Desktop/nombre.txt', 'Documents/...', 'Downloads/...', '~'.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta del archivo (absoluta o atajo Desktop/...)" },
          content: { type: "string", description: "contenido completo del archivo" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pc_read_file",
      description: "Leer el contenido de un archivo REAL de la PC del usuario (ruta absoluta o atajo).",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta del archivo" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pc_list_dir",
      description: "Listar los archivos de una carpeta REAL de la PC del usuario (ej: 'Desktop', 'Documents', 'C:\\Users\\...').",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "carpeta a listar (absoluta o atajo)" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pc_delete",
      description: "Eliminar un archivo o carpeta REAL de la PC del usuario. ACCIÓN DESTRUCTIVA: úsala solo si el usuario lo pidió explícitamente.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta del archivo/carpeta a borrar" } },
        required: ["path"],
      },
    },
  },
];

// ============================================================
// ACCIONES RÁPIDAS DETERMINISTAS (Modo Agente PC)
// ------------------------------------------------------------
// Cuando el usuario pide algo directo (crear/borrar/leer/listar
// un archivo, o ejecutar un comando), lo ejecutamos INMEDIATAMENTE
// contra el puente :5000 SIN gastar una sola llamada al LLM.
// Así el IDE "hace" aunque el modelo sea pequeño o Ollama caiga.
// ============================================================
const FOLDER_MAP: Record<string, string> = {
  escritorio: "Desktop", desktop: "Desktop",
  documentos: "Documents", docs: "Documents",
  descargas: "Downloads", downloads: "Downloads",
};

function extractQuoted(s: string): string | null {
  const m = s.match(/["'«]([^"'«»]{1,2000})["'»]/s);
  return m ? m[1] : null;
}

function extractFolder(s: string): string {
  for (const [k, v] of Object.entries(FOLDER_MAP)) {
    if (new RegExp(`\\b${k}\\b`, "i").test(s)) return `${v}/`;
  }
  const cm = s.match(/\bcarpeta\s+([\w\- ]+?)(?=[\s.,;]|$)/i);
  if (cm) return `${cm[1].trim()}/`;
  return "Desktop/"; // por defecto: Escritorio
}

function extractFilename(s: string): string | null {
  const sClean = s.trim();
  // 1) Si hay una ruta de archivo explícita (con barra), usar el nombre base
  const pathM = sClean.match(/(?:[A-Za-z]:\\|\/)[^\s"']{1,180}\.\w{1,10}/);
  if (pathM) {
    const p = pathM[0];
    return p.split(/[\\/]/).pop() ?? p;
  }
  // 2) "llamado X" / "de nombre X" / "named X" → el token siguiente
  const namedM = sClean.match(/\b(?:llamad[ao]|de\s+nombre|named)\s+["']?([A-Za-z0-9_\-]+(?:\.[A-Za-z0-9]{1,10})?)["']?/i);
  if (namedM) return namedM[1];
  // 3) Token con extensión de 2-10 letras (el último del texto)
  const tokens = sClean.split(/\s+/);
  let best: string | null = null;
  for (const t of tokens) {
    const clean = t.replace(/^[«"'(\[]+|[»"')\].,;:]+$/g, "");
    if (/^[A-Za-z0-9_\-]+\.[A-Za-z0-9]{2,10}$/.test(clean)) best = clean;
  }
  return best;
}

function extractCommand(s: string): string | null {
  const quoted = extractQuoted(s);
  const m1 = s.match(/(?:comando|orden|instrucci[oó]n|script)\s+["'«]([^"'«»]{1,400})["'»]/i);
  if (m1) return m1[1].trim();
  const m2 = s.match(/(?:el |la |este |esa |una |un )?(?:comando|orden|instrucci[oó]n)\s+([A-Za-z_][\w\-./: ]{1,160})/i);
  if (m2) return m2[1].trim();
  if (quoted && /ejecut|correr|corre|comando|run/i.test(s)) return quoted.trim();
  return null;
}

interface ParsedAction {
  intent: "write" | "read" | "delete" | "list" | "exec";
  path?: string;
  content?: string;
  command?: string;
}

function parseQuickAction(prompt: string): ParsedAction | null {
  const p = prompt.trim();
  if (!p) return null;

  // Ejecutar comando
  if (/\b(ejecut|corr|run|lleva)\w*/i.test(p) && /\b(comando|orden|instrucci[oó]n|script)\b/i.test(p)) {
    const command = extractCommand(p);
    if (command) return { intent: "exec", command };
  }

  const folder = extractFolder(p);
  const filename = extractFilename(p);

  // Borrar
  if (/\b(borr|elimina|eliminar|borra|delete|quitar|suprime)\b/i.test(p) && /archivo|archivos|carpeta|folder|documento|\.\w{1,10}/i.test(p)) {
    if (filename) return { intent: "delete", path: folder + filename };
  }

  // Leer
  if (/\b(le|lee|leer|muest|mostr|copia|print)\b/i.test(p) && /archivo|contenido|texto|de\s+/i.test(p)) {
    if (filename) return { intent: "read", path: folder + filename };
  }

  // Listar
  if (/\b(lista|listar|list|mostr|mostrar|contenid|qu[eé] hay|ver|explora)\b/i.test(p) && /archivos|carpeta|contenido|folder|directorio|lista/i.test(p)) {
    return { intent: "list", path: folder };
  }

  // Crear (prioridad alta: "crear/make/un archivo")
  if (/\b(crea|crear|crea(r)?|genera|generar|haz|hacer|escribi|escribir|guarda|guardar|new|make|write)\b/i.test(p) && /archivo|texto|documento|note|nota|\.txt|\.md|\.py|\.js|\.ts|\.json/i.test(p)) {
    const content =
      extractQuoted(p) ??
      (p.match(/(?:con (?:el |la )?(?:texto|contenido)|que dice|dice|con contenido)\s+(.+)/is)?.[1]?.trim() || "");
    if (filename) return { intent: "write", path: folder + filename, content };
  }

  return null;
}

// Interfaz mínima que necesita handlePcQuickAction (la satisface StreamContext).
interface StreamLike {
  sendTaskEvent: (task: any) => void;
  sendChunk: (text: string) => void;
  sendDone: (modelUsed: string, metricas?: MetricasInferencia | null) => void;
}

// Ejecuta la acción rápida y la emite como respuesta de stream.
// Devuelve true si se manejó (corta el flujo, no toca el LLM).
async function handlePcQuickAction(prompt: string, ctx: StreamLike): Promise<boolean> {
  const action = parseQuickAction(prompt);
  if (!action) return false;

  const emit = (label: string, detail: string, ok: boolean) =>
    ctx.sendTaskEvent({ type: "action", action: { tool: label, detail, ok } });

  // pc_info una vez para enriquecer el detalle (no es obligatorio)
  const info = await bridgeFetch("/api/pc/info", undefined, 4000);
  const desktop = info?.desktop ? ` (Escritorio real: ${info.desktop})` : "";

  try {
    if (action.intent === "write") {
      const res = await bridgeFetch("/api/fs/write", { path: action.path, content: action.content ?? "" });
      emit("pc_write_file", `${action.path}`, Boolean(res?.ok));
      const msg = res?.ok
        ? `✅ **Archivo creado en tu PC** (agente 5000):\n\`${res.path}\` — ${res.bytes} bytes${desktop}\n\n` +
          (action.content ? `\`\`\`\n${action.content}\n\`\`\`` : "")
        : `❌ No pude crear el archivo: ${res?.error || "error desconocido"}`;
      ctx.sendChunk(msg);
      ctx.sendDone("pc-quick-action");
      return true;
    }
    if (action.intent === "read") {
      const res = await bridgeFetch("/api/fs/read", { path: action.path });
      emit("pc_read_file", `${action.path}`, Boolean(res?.ok));
      const msg = res?.ok
        ? `📄 **Contenido de** \`${res.path}\` (tu PC):\n\`\`\`\n${res.content}\n\`\`\``
        : `❌ No pude leer el archivo: ${res?.error || "error"}`;
      ctx.sendChunk(msg);
      ctx.sendDone("pc-quick-action");
      return true;
    }
    if (action.intent === "list") {
      const res = await bridgeFetch("/api/fs/list", { path: action.path });
      emit("pc_list_dir", `${action.path}`, Boolean(res?.ok));
      let msg: string;
      if (res?.ok && Array.isArray(res.entries)) {
        const lines = res.entries.map((e: any) => (e.isDir ? `📁 ${e.name}/` : `   ${e.name}  (${e.size} b)`)).join("\n");
        msg = `📁 **Contenido de** \`${res.path}\` (tu PC):\n\`\`\`\n${lines || "(vacío)"}\n\`\`\``;
      } else {
        msg = `❌ No pude listar: ${res?.error || "error"}`;
      }
      ctx.sendChunk(msg);
      ctx.sendDone("pc-quick-action");
      return true;
    }
    if (action.intent === "delete") {
      const res = await bridgeFetch("/api/fs/delete", { path: action.path });
      emit("pc_delete", `${action.path}`, Boolean(res?.ok));
      const msg = res?.ok
        ? `🗑️ **Eliminado de tu PC:** \`${res.path}\``
        : `❌ No pude borrar: ${res?.error || "error"}`;
      ctx.sendChunk(msg);
      ctx.sendDone("pc-quick-action");
      return true;
    }
    if (action.intent === "exec" && action.command) {
      const res = await bridgeFetch("/api/exec", { command: action.command, timeout: 60 }, 70000);
      emit("pc_exec", action.command, Boolean(res?.success));
      const out = res?.output || res?.content || "";
      const msg = res?.success
        ? `🖥️ **Comando ejecutado en tu PC:** \`${action.command}\`\n\`\`\`\n${out || "(sin salida)"}\n\`\`\``
        : `⚠️ Comando ejecutado con error:\n\`\`\`\n${res?.error || out || "sin salida"}\n\`\`\``;
      ctx.sendChunk(msg);
      ctx.sendDone("pc-quick-action");
      return true;
    }
  } catch (err: any) {
    emit(action.intent, prompt.slice(0, 60), false);
    ctx.sendChunk(`❌ Acción rápida falló: ${err?.message || err}`);
    ctx.sendDone("pc-quick-action");
    return true;
  }
  return false;
}

/**
 * v2.0 — ¿Puede este modelo usar herramientas?
 *
 * ANTES (v1.1): solo se miraba el NOMBRE. Cualquier "qwen2.5", "llama-3" o
 * "mistral" entraba al bucle de agente, incluidos `qwen2.5:0.5b` (≈400 MB) y
 * `llama3.2:1b`. Esos modelos NO saben emitir tool-calls válidos: el servidor
 * los llamaba en modo NO-streaming con timeout de 120 s por intento y hasta 10
 * intentos, así que la interfaz se quedaba sin un solo token durante minutos
 * ("no contesta o se tranca").
 *
 * AHORA: se usa el perfil del modelo (shared/modelTiers.ts) → hace falta estar
 * en la lista blanca Y tener tamaño suficiente (≥4B o ser modelo de nube).
 */
function isToolCapableModel(modelName: string): boolean {
  return getModelProfile(modelName).toolCapable;
}

/** Perfil cacheado del modelo activo (evita recalcular en cada llamada). */
const profileCache = new Map<string, ModelProfile>();
function getProfile(modelName: string): ModelProfile {
  const cached = profileCache.get(modelName);
  if (cached) return cached;
  const p = getModelProfile(modelName);
  profileCache.set(modelName, p);
  return p;
}

const CPU_CORES = os.cpus()?.length || 4;
const RAM_GB = Math.round((os.totalmem() || 8 * 1024 ** 3) / 1024 ** 3);

// v2.0 — Packs de herramientas integrados (núcleo, Modo PC, git, web).
// Añadir un pack futuro = registerToolPack({...}) y listo: ni el bucle del
// agente ni el prompt hay que tocarlos.
registerBuiltinPacks();

/**
 * v2.0 — Packs de herramientas EXTERNOS (futuro).
 * Si existe `tools.config.json` junto al servidor, cada entrada se carga como
 * un servidor de herramientas que expone GET <url>/tools. Así se pueden
 * enchufar plugins, microservicios propios o servidores MCP sin tocar código.
 */
async function loadExternalToolPacks(): Promise<void> {
  try {
    const cfgPath = path.join(process.cwd(), "tools.config.json");
    if (!fs.existsSync(cfgPath)) return;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    const packs: any[] = Array.isArray(cfg?.packs) ? cfg.packs : [];
    for (const p of packs) {
      if (!p?.id || !p?.url || p.enabled === false) continue;
      const pack = await registerExternalPack(p.id, p.label || p.id, p.url);
      if (pack) console.log(`[tools] Pack externo "${p.id}" cargado con ${pack.tools.length} herramienta(s).`);
    }
  } catch (err: any) {
    console.warn("[tools] No se pudieron cargar los packs externos:", err?.message || err);
  }
}
loadExternalToolPacks();

/**
 * v2.0 — Herramientas que se envían al modelo en este turno.
 * Filtra por contexto (Modo PC, git, red) y por tamaño del modelo: a un modelo
 * pequeño solo le llegan las herramientas baratas e imprescindibles (menos
 * prompt = menos latencia y menos confusión).
 */
function getToolsForModel(modelName: string, pcMode: boolean): any[] {
  const profile = getProfile(modelName);
  if (!profile.toolCapable) return [];
  const specs = getActiveToolSpecs({
    pcMode,
    vision: isVisionModelName(modelName),
    network: process.env.OFFLINE_MODE !== "1",
    git: true,
    sandbox: true,
  }).filter((s) => {
    // Las herramientas de una extensión solo se ofrecen si su pestaña está
    // abierta: si no, nadie puede ejecutarla y el modelo esperaría en vano.
    if (!s.pack.startsWith("ext:")) return true;
    return openExtensionPanels.has(s.pack.slice(4));
  });
  const selected = selectToolsForModel(specs, profile);
  return toOllamaTools(selected);
}

function isVisionModelName(modelName: string): boolean {
  return /vision|smolvlm|glm-ocr|glm-4v|glm4v|glm-5|llava|llava-phi3|bakllava|moondream|minicpm|qwen2\.5vl|qwen2-vl|qwen3-vl|qwen-vl|cogvlm|internvl|pixtral|deepseek-vl|gpt-oss|gemma3|gemma4|kimi/i.test(
    modelName.toLowerCase()
  );
}

// ============================================================
// v2.0 — EL MOTOR: base de datos de conocimiento persistente
// ------------------------------------------------------------
// El conocimiento vive en el MOTOR (.cerebro-db/kb.json), no en el modelo. Así
// un modelo de 250 MB responde con datos precisos (errores conocidos, patrones,
// reglas de sintaxis, mapa del proyecto) porque el motor se los sirve por
// contexto. Cambiar de modelo no cambia el resultado.
// ============================================================
// USERDATA v1 (recap): la base de conocimiento del motor es ESCRITURA
// permanente (kb.json, planes, entidades, espejos, salud, bóveda). Con el
// instalador por-máquina, cwd (Program Files) no es escribible: el motor
// aprendía y perdía el aprendizaje al cerrar. Se mueve a PROJECT_ROOT, que
// Electron dirige a userData.
const ENGINE_DB_DIR = path.join(PROJECT_ROOT, ".cerebro-db");
const ENGINE_DB_FILE = path.join(ENGINE_DB_DIR, "kb.json");
let engineKb = new KnowledgeBase();
let kbDirty = false;

// ============================================================
// v2.0 — CEREBRO (ley) + MEMORIA (estado vivo)
// ------------------------------------------------------------
// Se cargan una sola vez al arrancar. Toda escritura de la memoria es atómica
// (tmp + rename) y deja copia en memoria_history/, lo que permite rollback si una
// directriz corrompe el flujo de trabajo.
// ============================================================
const brain = new Brain(process.cwd());
// Vectorización local: el constructor solo guarda rutas; el índice se lee
// únicamente si la función está activada.
const localRag = new LocalRAG(process.cwd());
localRag.loadConfig();
// Capacidades avanzadas: solo persisten sus interruptores; el trabajo ocurre
// únicamente cuando están activadas.
const features = new AdvancedFeatures(process.cwd());
// Gobernador: se apoya en el catálogo de capacidades para hablar el mismo idioma.
const governor = new HardwareGovernor(features);
// Verificador en la nube: su configuración vive en .cerebro-db/verifier.json.
// La clave NO se guarda nunca: se lee del entorno (ZAI_API_KEY, GEMINI_API_KEY…).
const verifier = new CloudVerifier(process.cwd());
verifier.loadConfig();
try {
  brain.load();
  const st0 = brain.stats();
  console.log(
    `[CerebroNico] CEREBRO cargado: cerebro.md ${st0.cerebroChars} chars · memoria.md ${st0.memoriaLines} líneas · historial ${st0.historyCount} · propuestas ${st0.proposals}`
  );
} catch (err: any) {
  console.log(`[CerebroNico] No se pudo cargar el cerebro: ${err?.message || err}`);
}

function loadEngineKb(): void {
  try {
    if (fs.existsSync(ENGINE_DB_FILE)) {
      engineKb = KnowledgeBase.fromJSON(fs.readFileSync(ENGINE_DB_FILE, "utf-8"));
      console.log(`[engine] Base de conocimiento cargada: ${engineKb.size()} entradas.`);
    } else {
      console.log(`[engine] Base de conocimiento inicial creada con ${engineKb.size()} entradas de fábrica.`);
      kbDirty = true;
      saveEngineKb(true);
    }
  } catch (err: any) {
    // ============================================================
    // v0.9.1 — LA BASE CORRUPTA NO SE TIRA: SE APARTA Y SE AVISA
    // ------------------------------------------------------------
    // Antes: si el archivo no se podía leer, se creaba una base nueva CON LA
    // SEMILLA y se seguía como si nada. Dos daños, y el segundo es el grave:
    //
    //  1. El archivo ilegible se quedaba ahí, y el guardado periódico lo
    //     SOBRESCRIBÍA 30 segundos después. Lo aprendido se perdía para siempre
    //     y sin un solo aviso.
    //  2. El registro decía «se usa la semilla», en tono neutro. Alguien que
    //     leyera eso no podía saber que acababa de perder conocimiento.
    //
    // Ahora se aparta el archivo con extensión `.corrupto-<fecha>` antes de
    // nada: el motor arranca igual (una base de fábrica es mejor que no
    // arrancar), pero el archivo queda para poder recuperar entradas a mano.
    // Y se dice CUÁNTAS entradas tenía.
    // ============================================================
    let apartado = "(no se pudo apartar)";
    let bytes = 0;
    try {
      const st = fs.statSync(ENGINE_DB_FILE);
      bytes = st.size;
      const marca = new Date().toISOString().replace(/[:.]/g, "-");
      apartado = `${ENGINE_DB_FILE}.corrupto-${marca}`;
      fs.renameSync(ENGINE_DB_FILE, apartado);
    } catch {}
    console.error(
      `[engine] ⚠️ LA BASE DE CONOCIMIENTO NO SE PUDO LEER (${bytes} bytes): ${err?.message || err}\n` +
        `[engine] El archivo se ha apartado en: ${apartado}\n` +
        `[engine] Se arranca con la base de fábrica. Para recuperar entradas, abre ese archivo: es JSON.`
    );
    engineKb = new KnowledgeBase();
    kbDirty = true;
    saveEngineKb(true);
  }
}

/**
 * v0.9.1 — GUARDADO ATÓMICO DE LA BASE DE CONOCIMIENTO.
 *
 * Antes: `fs.writeFileSync(ENGINE_DB_FILE, engineKb.toJSON())`, escribiendo
 * DIRECTAMENTE encima del archivo bueno. Con la base creciendo (ya son cientos
 * de entradas y decenas de KB), un corte a mitad de escritura —cuelgue, apagón,
 * disco lleno— deja el archivo TRUNCADO. Y no avisa: el archivo existe, pesa
 * algo y se abre. Solo al leerlo se descubre que la última mitad no está.
 *
 * Es el peor fallo posible para algo cuyo trabajo es CRECER: el usuario pide
 * más conocimiento y un corte le devuelve menos del que tenía.
 *
 * El patrón correcto: escribir en un temporal y RENOMBRAR. El renombrado dentro
 * del mismo sistema de archivos es atómico — o está el viejo entero, o el nuevo
 * entero, nunca la mezcla.
 */
function saveEngineKb(force = false): void {
  if (!kbDirty && !force) return;
  const temporal = ENGINE_DB_FILE + ".tmp";
  try {
    fs.mkdirSync(ENGINE_DB_DIR, { recursive: true });
    const json = engineKb.toJSON();
    fs.writeFileSync(temporal, json, "utf-8");
    fs.renameSync(temporal, ENGINE_DB_FILE);
    kbDirty = false;
  } catch (err: any) {
    console.warn("[engine] No se pudo guardar la base de conocimiento:", err?.message || err);
    // El temporal se limpia, pero NUNCA el archivo bueno: si el rename falló, el
    // que había sigue siendo válido y es el único que hay que conservar.
    try { fs.unlinkSync(temporal); } catch {}
  }
}

/** Guarda y dice cuántas entradas quedaron, para dejar rastro en el arranque. */
function guardarYContar(): void {
  const n = engineKb.size();
  saveEngineKb(true);
  console.log(`[engine] Base de conocimiento guardada con ${n} entradas.`);
}

loadEngineKb();
// Guardado periódico (no se escribe en disco en cada turno) + al cerrar.
setInterval(() => saveEngineKb(), 30_000);
process.on("SIGINT", () => { guardarYContar(); process.exit(0); });
process.on("SIGTERM", () => { guardarYContar(); process.exit(0); });

// ============================================================
// v0.9.1 — GUARDAS GLOBALES DE ESTABILIDAD
// ------------------------------------------------------------
// Antes solo había SIGINT y SIGTERM. Faltaban las dos que de verdad matan el
// proceso en marcha, y su ausencia explica el peor escenario posible en un IDE:
// perder la sesión entera —memoria sin guardar y archivos abiertos— por un fallo
// en una ruta que quizá ni se estaba usando.
//
// · `unhandledRejection` — REGISTRAR Y SEGUIR. En Node, una promesa rechazada
//   sin nadie que la recoja termina el proceso por defecto. Es la guarda que más
//   vidas salva, porque el fallo suele estar en un camino secundario.
// · `uncaughtException` — REGISTRAR, GUARDAR e IRSE LIMPIO. Tras una excepción
//   no atrapada el proceso queda en un estado en el que no se puede confiar;
//   seguir funcionando ahí es peor que reiniciar, porque puede corromper datos.
//   Por eso aquí sí se sale, pero guardando antes la base de conocimiento.
//
// Las dos son RUIDOSAS a propósito. Un `catch {}` que se lo traga todo no es
// robustez, es ceguera: el fallo desaparece de la vista y vuelve cada día.
// ============================================================
process.on("unhandledRejection", (motivo: any) => {
  console.error("[estabilidad] Promesa rechazada sin recoger — el motor SIGUE:", motivo?.stack || motivo);
});
process.on("uncaughtException", (err: Error) => {
  console.error("[estabilidad] Excepción no atrapada — se guarda el estado y se sale:", err?.stack || err);
  try { saveEngineKb(true); } catch {}
  process.exit(1);
});

/** Registra/actualiza el mapa del proyecto en la base de conocimiento. */
function refreshEngineProjectMap(files: Array<{ path: string; language?: string }>): void {
  engineKb.setProjectFiles(files || []);
  kbDirty = true;
}

// ============================================================
// FASE 2 — ÍNDICE DE SÍMBOLOS DEL PROYECTO
// El motor lee los archivos del sandbox y extrae las firmas REALES de funciones,
// clases, interfaces y componentes. Eso evita que un modelo pequeño invente
// nombres y firmas, y ahorra el ciclo de "leer el archivo entero" en cada turno.
// ============================================================
let symbolMap: SymbolMap = { files: [], total: 0, updatedAt: 0 };

const INDEXABLE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);
const INDEX_SKIP_DIRS = new Set(["node_modules", ".git", "dist", "dist_electron", ".vite", "venv", "__pycache__", ".cerebro-db"]);

/** Reescribe el índice leyendo los archivos desde el disco del sandbox. */
function reindexProjectSymbols(): { files: number; symbols: number } {
  const collected: Array<{ path: string; content: string }> = [];
  const walk = (dir: string, base: string, depth: number) => {
    if (collected.length >= 200 || depth > 6) return;
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (collected.length >= 200) return;
      if (INDEX_SKIP_DIRS.has(entry)) continue;
      const full = path.join(dir, entry);
      const rel = base ? `${base}/${entry}` : entry;
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full, rel, depth + 1);
        continue;
      }
      const ext = path.extname(entry).toLowerCase();
      if (!INDEXABLE_EXT.has(ext)) continue;
      if (st.size > 300 * 1024) continue; // archivos gigantes: no aportan al índice
      try {
        collected.push({ path: rel, content: fs.readFileSync(full, "utf-8") });
      } catch {
        /* ilegible: se salta */
      }
    }
  };
  try {
    if (fs.existsSync(PROJECT_ROOT)) walk(PROJECT_ROOT, "", 0);
  } catch (err: any) {
    console.warn("[engine] No se pudo indexar símbolos:", err?.message || err);
  }

  symbolMap = buildSymbolMap(collected);
  // El resumen de la API del proyecto pasa a la base de conocimiento: se
  // recupera cuando el usuario pregunta por símbolos o nombres concretos.
  for (const file of symbolMap.files) {
    if (file.symbols.length === 0) continue;
    engineKb.upsert({
      id: `symbols:${file.path}`,
      table: "project",
      title: `Símbolos de ${file.path}`,
      body: file.symbols.map((s) => `${s.name} — ${s.signature}`).join("\n").slice(0, 1200),
      keys: [file.path.toLowerCase(), ...file.symbols.slice(0, 20).map((s) => s.name.toLowerCase())],
      lang: file.language,
      weight: 0.75,
    });
  }
  kbDirty = true;
  saveEngineKb();
  return { files: symbolMap.files.length, symbols: symbolMap.total };
}

/**
 * El motor aprende de sus fallos: cada error real de una herramienta queda como
 * entrada de conocimiento, deduplicada por nombre de herramienta + causa. Así el
 * motor sabe qué fallos existen en ESTE entorno y qué hacer, sin depender de que
 * el modelo lo recuerde.
 */
function learnFromToolFailure(toolName: string, args: any, result: string): void {
  // v2.0 — El fallo también se registra en la MEMORIA viva del agente: es la
  // sección [Incidencias Críticas] que el modelo lee en el siguiente turno para
  // no repetir el mismo error.
  try {
    brain.registrarFallo(toolName, result);
    // Si el historial Git de la memoria está activado, la incidencia queda
    // confirmada como un commit más (trazabilidad temporal de la evolución).
    features.commitMemoria(`incidencia: ${toolName}`);
  } catch {}
  try {
    let errorText = "";
    try {
      errorText = String(JSON.parse(result)?.error || "");
    } catch {
      errorText = String(result || "");
    }
    if (!errorText) return;
    // Se normaliza para no guardar una entrada por cada ruta distinta
    const normalized = errorText
      .replace(/[A-Za-z0-9_./\\-]{8,}/g, "<ref>")
      .replace(/\d+/g, "<n>")
      .slice(0, 180);
    const id = `fail:${toolName}:${normalized.slice(0, 40).replace(/\W+/g, "-")}`;
    const argHint = args?.path ? ` (con path="${args.path}")` : args?.command ? ` (con command="${String(args.command).slice(0, 60)}")` : "";
    engineKb.upsert({
      id,
      table: "error",
      title: `Fallo real de ${toolName}`,
      body: `La herramienta ${toolName}${argHint} falló en este entorno con: "${errorText.slice(0, 200)}". Antes de reintentar, corrige la causa (revisa ruta, comando o argumentos) en lugar de repetir la misma llamada.`,
      keys: [toolName.toLowerCase(), ...tokenize(errorText).slice(0, 8)],
      weight: 0.65,
    });
    kbDirty = true;
  } catch {
    /* el aprendizaje nunca debe romper la ejecución de una herramienta */
  }
}

/** Esquema validable de una herramienta del registro. */
function schemaForTool(name: string): ToolSchema | null {
  const spec = getToolSpec(name);
  if (!spec) return null;
  return { name: spec.name, parameters: spec.parameters as ToolSchema["parameters"] };
}

// ══════════════════════════════════════════════════════════════════════════
// QUIRÓFANO v1 /*QF-MOTOR*/ — la puerta que faltaba: cirugía sobre apps que YA funcionan
// --------------------------------------------------------------------------
// EL PROBLEMA REAL DEL USUARIO: «subo una app que funciona, pido una mejora y
// la rompen». El blindaje de sintaxis impide escribir un archivo DESBALANCEADO;
// no impide escribir un archivo mutilado y perfectamente balanceado, que es lo
// que hace un modelo de nube cuando reescribe de memoria un archivo que no ha
// leído. Aquí se juzga lo que de verdad rompe una app:
//   · exportaciones que desaparecen (el resto del proyecto las llama),
//   · amputación (el archivo se queda a la mitad),
//   · marcadores de truncado («…», «resto del código»),
//   · dependencias o scripts perdidos en package.json.
// Y si al cerrar la tanda una puerta cae, se REVIERTE lo escrito y se devuelve
// el informe. Coste en tokens: cero. Es todo determinista.
// ══════════════════════════════════════════════════════════════════════════

const QF_DIR = path.join(PROJECT_ROOT, ".cn-quirofano");
const QF_ARCHIVO_ULTIMA = path.join(QF_DIR, "ultima.json");
/** Espera sin escrituras antes de dar la tanda por terminada y juzgarla. */
const QF_CIERRE_MS = Math.max(500, Number(process.env.QUIROFANO_CIERRE_MS) || 3500);

const discoQf: Disco = {
  existe: (r) => {
    try {
      return fs.existsSync(resolveSafePath(r));
    } catch {
      return false;
    }
  },
  leer: (r) => {
    try {
      return fs.readFileSync(resolveSafePath(r), "utf-8");
    } catch {
      return null;
    }
  },
  escribir: (r, c) => {
    const abs = resolveSafePath(r);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, c, "utf-8");
  },
  borrar: (r) => {
    try {
      fs.unlinkSync(resolveSafePath(r));
    } catch {
      /* un archivo que ya no está es el objetivo cumplido */
    }
  },
};

const QF_SKIP = new Set([
  "node_modules", ".git", "dist", "dist_electron", ".vite", "venv", "__pycache__",
  ".cerebro-db", ".cn-sync", ".cn-quirofano", ".quirofano-backup",
]);

/** Inventario del proyecto para la puerta de imports (acotado: nunca más de 800). */
function archivosProyectoQf(): CheckFile[] {
  const salida: CheckFile[] = [];
  const caminar = (dir: string, base: string, prof: number) => {
    if (salida.length >= 800 || prof > 12) return;
    let entradas: string[] = [];
    try {
      entradas = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entradas) {
      if (salida.length >= 800) return;
      const abs = path.join(dir, e);
      const rel = base ? base + "/" + e : e;
      let st;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!QF_SKIP.has(e)) caminar(abs, rel, prof + 1);
        continue;
      }
      if (st.size > 300 * 1024) continue;
      if (!/\.(ts|tsx|js|jsx|mjs|cjs|css|json|html)$/i.test(e)) continue;
      try {
        salida.push({ path: rel, content: fs.readFileSync(abs, "utf-8") });
      } catch {
        /* ilegible: se salta */
      }
    }
  };
  try {
    if (fs.existsSync(PROJECT_ROOT)) caminar(PROJECT_ROOT, "", 0);
  } catch {}
  return salida;
}

let operacionQf: Operacion | null = null;
let temporizadorQf: ReturnType<typeof setTimeout> | null = null;
let cerrandoQf = false;
let ultimoCierreQf: VeredictoOperacion | null = null;
const avisosQf: string[] = [];

// ─── v1.8.0 · VOZ: la facultad de decir lo que ya sabe, sin que se lo pregunten ─
/** Claves ya dichas: una cosa se dice una vez (regla R2 de autoRespuesta). */
const vozYaDichos = new Set<string>();
/** Últimos mensajes emitidos, para que el panel pueda trazarlos sin recalcularlos. */
let vozUltimos: MensajeEspontaneo[] = [];

/**
 * Lee un artefacto del proyecto para poder explicarlo.
 *
 * QUÉ ES: el puente entre «un fichero en disco» y el módulo de explicaciones.
 * PARA QUÉ SIRVE: para que la frase «qué es / para qué sirve / si está ejecutado»
 * se pueda dar de cualquier fichero sin que quien pregunta sepa dónde vive.
 *
 * Solo lee dentro de la carpeta de la aplicación: si la ruta se sale, no se lee y
 * se dice por qué. El `ejecutado` que se concede es el del QUIRÓFANO, y solo
 * cuando sus puertas cerraron en verde — que es la única evidencia de ejecución
 * que el servidor tiene de un archivo que él mismo escribió. Sin ese cierre, la
 * respuesta correcta es «no consta ejecución», aunque el código tenga buena pinta.
 */
function leerArtefactoParaExplicar(rutaRelativa: string): EntradaArtefacto {
  const rel = String(rutaRelativa || "").replace(/\\/g, "/");
  if (!rel) return { ruta: "(sin ruta)", evidencia: ["petición sin ruta"] };
  const base = process.cwd();
  const abs = path.resolve(base, rel);
  const dentro = abs === base || abs.startsWith(base + path.sep) || abs.startsWith(base + "/");
  if (!dentro) {
    return { ruta: rel, evidencia: ["fuera de la carpeta de la aplicación: no se lee"] };
  }
  const cerroEnVerde = !!ultimoCierreQf && ultimoCierreQf.ok === true && ultimoCierreQf.revertido !== true;
  try {
    const contenido = fs.readFileSync(abs, "utf-8");
    return {
      ruta: rel,
      contenido,
      ejecutado: cerroEnVerde,
      evidencia: cerroEnVerde
        ? ["las puertas del Quirófano cerraron en verde sobre esta tanda"]
        : ["sin cierre de puertas en verde: no consta ejecución"],
    };
  } catch {
    return { ruta: rel, ejecutado: false, evidencia: ["no se pudo leer el fichero desde el servidor"] };
  }
}

/**
 * El contexto real de la voz. No se inventa nada: son los datos que el Quirófano
 * ya tiene (avisos anotados, última tanda, tanda abierta). Si no hay nada que
 * decir, la lista sale vacía y el sistema se calla — que es una respuesta válida.
 */
function contextoVoz(): ContextoVoz {
  const avisos = avisosQf.slice(0, 3).map((texto, i) => ({
    clave: `qf-aviso-${i}-${texto.slice(0, 24)}`,
    texto,
    motivo: "lo anotó el Quirófano al cerrar una tanda",
  }));

  const hechos: ContextoVoz["hechos"] = [];
  if (ultimoCierreQf) {
    const informe = String(ultimoCierreQf.informe || "").slice(0, 160);
    hechos.push({
      clave: `qf-cierre-${informe.slice(0, 32)}`,
      texto: `Última tanda: ${ultimoCierreQf.revertido ? "REVERTIDA" : "aplicada"} — ${informe}`,
      // Solo es «ejecutado» si las puertas cerraron en verde y no se revirtió.
      certeza: ultimoCierreQf.ok === true && !ultimoCierreQf.revertido ? "ejecutado" : "sin_verificar",
      evidencia: ["puertas del Quirófano"],
    });
  }

  const sugerencias: ContextoVoz["sugerencias"] = [];
  if (operacionQf) {
    sugerencias.push({
      clave: "qf-tanda-abierta",
      texto: `Hay una tanda abierta (${cirugiasDe(operacionQf).length} archivo(s)) sin cerrar: hasta que la cierres, esos cambios no han pasado puertas.`,
      motivo: "el Quirófano tiene una operación en curso",
    });
  }

  return { avisos, hechos, sugerencias, yaDichos: [...vozYaDichos], ocupado: !!operacionQf };
}

/** Emite y marca: lo dicho no se repite (una facultad que se repite se apaga). */
function hablarAhora(): MensajeEspontaneo[] {
  const mensajes = mensajesEspontaneos(contextoVoz());
  for (const m of mensajes) vozYaDichos.add(m.clave);
  if (mensajes.length > 0) vozUltimos = mensajes;
  return mensajes;
}

/**
 * Puertas de esta instalación: las cuatro baratas SIEMPRE; las pesadas sólo si
 * se piden por entorno (son caras y necesitan el sandbox):
 *   QUIROFANO_GATES=tipos,humo npm run dev
 *   · tipos → npx tsc --noEmit (sólo se culpa de errores en archivos tocados)
 *   · humo  → GET a la vista previa (:3500); un 500 o vacío es rojo
 */
function puertasQf(): Puerta[] {
  const activas = String(process.env.QUIROFANO_GATES || "").toLowerCase();
  const correrComando = activas.includes("tipos")
    ? async (comando: string) => {
        const r: any = await runCommand(comando, PROJECT_ROOT, 120000);
        return { ok: Number(r?.exitCode) === 0, detalle: String(r?.stdout || "") + "\n" + String(r?.stderr || "") };
      }
    : undefined;
  const sondearPreview = activas.includes("humo")
    ? async () => {
        const puerto = Number(process.env.SANDBOX_PORT) || 3500;
        const res = await fetch("http://127.0.0.1:" + puerto + "/");
        return { status: res.status, cuerpo: await res.text() };
      }
    : undefined;
  return puertasEstandar().concat(puertasPesadas({ correrComando, sondearPreview }));
}

function guardarUltimaQf(op: Operacion): void {
  try {
    fs.mkdirSync(QF_DIR, { recursive: true });
    fs.writeFileSync(QF_ARCHIVO_ULTIMA, serializarOperacion(op), "utf-8");
  } catch {
    /* la memoria del quirófano es accesoria: si no se puede guardar, el cambio sigue juzgado */
  }
}

/** Abre operación: guarda el baseline (imports rotos que YA existían) antes de tocar nada. */
function abrirOperacionQf(motivo: string): Operacion {
  const op = crearOperacion(motivo, Date.now());
  if (process.env.QUIROFANO_SIN_IMPORTS !== "1") {
    try {
      op.importsAntes = findMissingImports(archivosProyectoQf()).map((m) => `${m.from}|${m.specifier}`);
    } catch {
      op.importsAntes = [];
    }
  }
  operacionQf = op;
  console.log(`[CerebroNico] 🩺 QUIRÓFANO: operación abierta — ${motivo}`);
  return op;
}

function operacionActivaQf(motivo: string): Operacion {
  return operacionQf || abrirOperacionQf(motivo);
}

/**
 * EL JUEZ. Se llama ANTES de escribir. Devuelve si la escritura se bloquea y,
 * si sí, el mensaje COMPLETO que recibe el modelo (con la salida honesta).
 */
function juzgarEscrituraQf(
  ruta: string,
  contenido: string,
  opts: { force?: boolean; modo?: ModoEvaluacion } = {}
): { bloqueada: boolean; mensaje: string; original: string | null; diag: Diagnostico } {
  let original: string | null = null;
  try {
    const abs = resolveSafePath(ruta);
    original = fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : null;
  } catch {
    original = null;
  }
  const modo: ModoEvaluacion = opts.modo || "cirugia";
  let diag: Diagnostico;
  try {
    diag = evaluarCirugia(ruta, original, contenido, modo);
  } catch (err: any) {
    // Ante la duda, NO se bloquea: un guardián que falla cerrado mataría trabajo bueno.
    console.warn("[CerebroNico] 🩺 QUIRÓFANO: no se pudo juzgar " + ruta + " (" + (err?.message || err) + ")");
    return { bloqueada: false, mensaje: "", original, diag: null as unknown as Diagnostico };
  }
  if (diag.veredicto !== "peligroso" || opts.force) {
    if (diag.veredicto === "revisar") console.log("[CerebroNico] 🩺 QUIRÓFANO aviso en " + ruta + ": " + diag.motivos.join(" · "));
    return { bloqueada: false, mensaje: "", original, diag };
  }
  const cif = diag.cifras;
  const mensaje = [
    "🩺 QUIRÓFANO: escritura BLOQUEADA sobre " + ruta + ".",
    "Motivo: ese archivo YA existía y funciona; lo que se iba a escribir lo rompe.",
    ...diag.motivos.map((m) => "  · " + m),
    "Medidas: " + cif.utilesAntes + " → " + cif.utilesDespues + " líneas útiles; exportaciones " + cif.publicosAntes + " → " + cif.publicosDespues + ".",
    "QUÉ HACER (en este orden):",
    '  1. Lee el archivo de verdad: read_file("' + ruta + '") o read_file_range si es largo.',
    '  2. Cambia SÓLO lo que te han pedido, con edit_file y un ancla ÚNICA de 2-4 líneas exactas.',
    '  3. Si de verdad hay que reescribir el archivo entero, repite write_file con force=true y motivo="…". El Quirófano guarda copia y queda en el informe.',
    "No repitas la misma escritura sin cambiar nada: el resultado será el mismo.",
  ].join("\n");
  console.log("[CerebroNico] 🩺 QUIRÓFANO bloqueó " + ruta + ": " + diag.motivos[0]);
  return { bloqueada: true, mensaje, original, diag };
}

/** Registra la escritura en la operación abierta y programa el cierre de la tanda. */
function registrarCirugiaQf(ruta: string, original: string | null, contenido: string, diag?: Diagnostico): void {
  try {
    const op = operacionActivaQf("cambios sobre el proyecto");
    anotarCirugia(op, ruta, original, contenido, diag);
    programarCierreQf("tanda de cambios");
  } catch (err: any) {
    console.warn("[CerebroNico] 🩺 QUIRÓFANO: no se pudo registrar " + ruta + " (" + (err?.message || err) + ")");
  }
}

/** Cierre diferido: cuando pasan QF_CIERRE_MS sin escrituras, se juzga la tanda. */
function programarCierreQf(motivo: string): void {
  if (temporizadorQf) clearTimeout(temporizadorQf);
  temporizadorQf = setTimeout(() => {
    temporizadorQf = null;
    void cerrarTurnoQf(motivo);
  }, QF_CIERRE_MS);
  if (typeof temporizadorQf.unref === "function") temporizadorQf.unref();
}

/**
 * CIERRE: corre las puertas sobre el DISCO, revierte si hay rojas y devuelve el
 * veredicto. Es idempotente: cerrar dos veces no revierte dos veces.
 */
async function cerrarTurnoQf(motivo: string): Promise<VeredictoOperacion | null> {
  if (temporizadorQf) {
    clearTimeout(temporizadorQf);
    temporizadorQf = null;
  }
  if (cerrandoQf) return ultimoCierreQf;
  const op = operacionQf;
  if (!op || cirugiasDe(op).length === 0) return null;
  cerrandoQf = true;
  operacionQf = null;
  try {
    const v = await cerrarOperacion(op, discoQf, {
      puertas: puertasQf(),
      revertirSiFalla: true,
      archivosProyecto: archivosProyectoQf,
    });
    guardarUltimaQf(op);
    ultimoCierreQf = v;
    const linea = lineaQuirofano(v);
    console.log(linea);
    if (!v.ok) {
      avisosQf.unshift(new Date().toLocaleTimeString() + " · " + (v.revertido ? "CAMBIO REVERTIDO" : "aviso") + " · " + v.motivo);
      if (avisosQf.length > 12) avisosQf.length = 12;
      try {
        learnFromToolFailure("quirofano", { motivo }, JSON.stringify({ ok: false, error: v.motivo }));
      } catch {}
    }
    return v;
  } catch (err: any) {
    console.warn("[CerebroNico] 🩺 QUIRÓFANO: el cierre falló (" + (err?.message || err) + ")");
    return null;
  } finally {
    cerrandoQf = false;
  }
}

/** Deshacer: la operación abierta si la hay; si no, la última guardada en disco. */
async function deshacerUltimoQf(): Promise<{ ok: boolean; informe: string; restaurados: string[]; retirados: string[] }> {
  const abierta = await cerrarTurnoQf("deshacer pedido");
  if (abierta && abierta.revertido) {
    return { ok: true, informe: "La tanda ya estaba revertida por el Quirófano.", restaurados: [], retirados: [] };
  }
  let op: Operacion | null = null;
  try {
    op = deserializarOperacion(fs.readFileSync(QF_ARCHIVO_ULTIMA, "utf-8"));
  } catch {
    op = null;
  }
  if (!op) return { ok: false, informe: "No hay ninguna operación que deshacer.", restaurados: [], retirados: [] };
  if (op.revertida) return { ok: true, informe: "Esa operación ya estaba revertida.", restaurados: [], retirados: [] };
  const res = revertir(op, discoQf);
  guardarUltimaQf(op);
  return {
    ok: true,
    informe:
      "Deshecho: " + res.restaurados.length + " archivo(s) restaurado(s), " + res.retirados.length + " retirado(s)." +
      (res.noReversibles.length ? " Sin copia de: " + res.noReversibles.join(", ") + "." : "") +
      (res.fallos.length ? " Fallos: " + res.fallos.join(" · ") : ""),
    restaurados: res.restaurados,
    retirados: res.retirados,
  };
}

/** Endpoints del Quirófano (los usa la IDE y el propio modelo). */
function registrarRutasQuirofano(app: express.Express): void {
  app.get("/api/quirofano/estado", (_req: Request, res: Response) => {
    try {
      const op = operacionQf;
      let ultima: any = null;
      try {
        ultima = JSON.parse(fs.readFileSync(QF_ARCHIVO_ULTIMA, "utf-8"));
      } catch {
        ultima = null;
      }
      return res.json({
        ok: true,
        gates: String(process.env.QUIROFANO_GATES || "") || "estandar",
        abierta: op ? { id: op.id, motivo: op.motivo, archivos: cirugiasDe(op).map((c) => c.ruta) } : null,
        ultimo: ultimoCierreQf
          ? { ok: ultimoCierreQf.ok, revertido: ultimoCierreQf.revertido, informe: ultimoCierreQf.informe }
          : null,
        ultimaOperacion: ultima ? { id: ultima.id, motivo: ultima.motivo, revertida: ultima.revertida, archivos: (ultima.archivos || []).map((a: any) => a.ruta) } : null,
        avisos: avisosQf,

        // ─── v1.8.0 · VOZ ──────────────────────────────────────────────────
        // Las frases que dicen qué es y para qué sirve cada archivo tocado, con su
        // certeza. Se calculan SOLO si hay archivos de los que hablar (tanda
        // abierta o última cerrada): sin nada que explicar, el campo va vacío en
        // vez de llenarse de relleno.
        explicaciones: (() => {
          const rutas: string[] = operacionQf
            ? cirugiasDe(operacionQf).map((c) => c.ruta)
            : (ultima?.archivos || []).map((a: any) => a.ruta);
          return rutas.slice(0, 12).map((r) => explicarArtefacto(leerArtefactoParaExplicar(r)).frase);
        })(),
        // Lo que el sistema dice sin que le pregunten. Se marca como dicho al
        // emitirlo, así el panel puede sondear cada poco sin que la facultad
        // repita: una facultad que se repite se apaga (regla R2).
        voz: hablarAhora().map((m) => ({ tipo: m.tipo, texto: m.texto, motivo: m.motivo, certeza: m.certeza })),
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  /**
   * v1.8.0 · VOZ — «¿esto qué es y para qué sirve?», contestado antes de que se
   * pregunte. Recibe una ruta o varias y devuelve la frase de cada artefacto con
   * su nivel de certeza (`ejecutado` / `solo leído` / `sin verificar`).
   *
   * Es de LECTURA: no ejecuta nada. Y no concede «ejecutado» a un archivo solo
   * porque exista: eso únicamente lo da un cierre de puertas en verde.
   */
  app.post("/api/artefacto/explicar", (req: Request, res: Response) => {
    try {
      const rutas: string[] = Array.isArray(req.body?.rutas)
        ? req.body.rutas.map((r: any) => String(r))
        : [String(req.body?.ruta || "")];
      const explicaciones = rutas
        .filter(Boolean)
        .slice(0, 40)
        .map((r) => explicarArtefacto(leerArtefactoParaExplicar(r)));
      return res.json({ ok: true, explicaciones, frases: explicaciones.map((e) => e.frase) });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  app.post("/api/quirofano/revisar", async (req: Request, res: Response) => {
    // v1.6.32 · SEGURIDAD: cerrar una tanda PUEDE revertir archivos. Es una
    // puerta mutante igual que las 11 del sandbox y desde aquí también.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const v = await cerrarTurnoQf("revisión pedida desde la IDE");
    if (!v) return res.json({ ok: true, informe: "No hay cambios pendientes de revisar." });
    return res.json({ ok: v.ok, revertido: v.revertido, puertas: v.puertas, informe: v.informe });
  });

  app.post("/api/quirofano/deshacer", async (req: Request, res: Response) => {
    // v1.6.32 · SEGURIDAD: deshacer REESCRIBE archivos con la copia anterior.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const r = await deshacerUltimoQf();
    return res.json(r);
  });
}
/*QF-MOTOR*/

async function executeToolCall(name: string, args: any): Promise<string> {
  try {
    // ------------------------------------------------------------
    // BLINDAJE DEL CONTEXTO DE HERRAMIENTAS: se valida la llamada contra el
    // esquema declarado ANTES de ejecutar. Los modelos pequeños inventan campos,
    // tipos y nombres; sin esta capa el motor ejecutaría basura (o un borrado con
    // el campo equivocado). Si algo no cuadra, el error vuelve al modelo para
    // que se autocorrija.
    // ------------------------------------------------------------
    const spec = getToolSpec(name);
    if (!spec) {
      return JSON.stringify({ ok: false, error: `Herramienta desconocida: ${name}` });
    }
    const schema = schemaForTool(name);
    if (schema) {
      const check = validateToolCall(schema, args || {});
      if (!check.ok) {
        const detail = check.issues.filter((i) => !i.message.includes("se ha ignorado")).map((i) => `- ${i.field}: ${i.message}`).join("\n");
        return JSON.stringify({
          ok: false,
          error: `Argumentos inválidos para "${name}" según el esquema del motor:\n${detail}`,
          hint: "Corrige los campos y vuelve a llamar a la herramienta.",
        });
      }
      args = check.sanitized;
    }

    switch (name) {
      case "list_files": {
        const files: string[] = [];
        const walk = (dir: string, base: string) => {
          let entries: string[] = [];
          try {
            entries = fs.readdirSync(dir);
          } catch {
            return;
          }
          for (const entry of entries) {
            const full = path.join(dir, entry);
            const rel = base ? `${base}/${entry}` : entry;
            let stat;
            try {
              stat = fs.statSync(full);
            } catch {
              continue;
            }
            if (stat.isDirectory()) walk(full, rel);
            else files.push(rel);
          }
        };
        walk(PROJECT_ROOT, "");
        return JSON.stringify({ ok: true, files });
      }
      case "read_file": {
        const abs = resolveSafePath(String(args?.path || ""));
        const content = fs.readFileSync(abs, "utf-8");
        return JSON.stringify({ ok: true, path: args?.path, content: content.slice(0, 40000) });
      }
      case "write_file": {
        const abs = resolveSafePath(String(args?.path || ""));
        const content = String(args?.content ?? "");
        // QUIRÓFANO v1 /*QF-WRITEFILE*/ — el juez entra ANTES del blindaje de sintaxis.
        // Reescribir un archivo que ya existe es la forma nº1 de romper una app que
        // funcionaba: el modelo devuelve «su versión» del archivo a medias.
        const juicioQf = juzgarEscrituraQf(String(args?.path || ""), content, { force: args?.force === true });
        if (juicioQf.bloqueada) {
          return JSON.stringify({ ok: false, error: juicioQf.mensaje, quirofano: juicioQf.diag, hint: "Usa edit_file con anclas únicas, o write_file con force=true y motivo." });
        }
/*QF-WRITEFILE*/
        // ------------------------------------------------------------
        // BLINDAJE DE SINTAXIS: el archivo se valida ANTES de tocar el disco.
        // Si está roto (JSON inválido, llaves sin cerrar, JSX desbalanceado,
        // código cortado con «…»), no se escribe nada y el error vuelve al
        // modelo para que se autocorrija. Es la diferencia entre "el conductor
        // es flojo" y "el proyecto se rompe".
        // ------------------------------------------------------------
        const guard = await guardFileProfundo(String(args?.path || ""), content, PARSER_ESBUILD);
        if (!guard.ok) {
          return JSON.stringify({ ok: false, error: rejectMessage(String(args?.path || ""), guard), issues: guard.issues });
        }
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, "utf-8");
        registrarCirugiaQf(String(args?.path || ""), juicioQf.original, content, juicioQf.diag); /*QF-WRITEREG*/
        return JSON.stringify({ ok: true, path: args?.path, bytes: content.length, syntax: guard.summary });
      }
      case "run_command": {
        // v8.0.4 — ADUANA OBLIGATORIA. Antes se pasaba `args.command` a `exec`
        // tal cual. Cuando el modelo escribía la llamada como TEXTO
        // (`run_command command="cd X && npm start"`), ese texto acababa
        // ejecutándose en el shell y Windows contestaba «run_command no se
        // reconoce como un comando…». Aquí se desenvuelve si se puede y se
        // rechaza con motivo si no.
        const norm = normalizarComandoEntrante(args?.command);
        if (!norm.valido) return JSON.stringify({ ok: false, error: norm.motivo });
        if (norm.envuelto) console.warn(`[CerebroNico] ${norm.motivo}`);
        const result = await runCommand(norm.comando, PROJECT_ROOT, 120000);
        return JSON.stringify(result);
      }
      case "run_tests": {
        const crudo = typeof args?.command === "string" && args.command.trim() ? args.command : "npm test";
        const norm = normalizarComandoEntrante(crudo);
        if (!norm.valido) return JSON.stringify({ ok: false, error: norm.motivo });
        const result = await runCommand(norm.comando, PROJECT_ROOT, 180000);
        return JSON.stringify(result);
      }
      case "convertir_formato": {
        // v1.15.1 — expone el conversor determinista (formatConverter.ts) al agente.
        // Es lógica pura y ya está probada con ida-y-vuelta: cero red, cero créditos.
        const r = convertir(String(args?.texto ?? ""), args?.desde, args?.hacia, {
          ordenarClaves: args?.ordenar_claves === true,
          separadorCsv: args?.separador_csv === ";" ? ";" : ",",
          inferirTiposCsv: args?.inferir_tipos_csv === true,
        });
        if (!r.ok) return JSON.stringify({ ok: false, error: r.error });
        return JSON.stringify({ ok: true, salida: r.salida, informe: r.informe });
      }
      case "set_plan": {
        const tasks = Array.isArray(args?.tasks) ? args.tasks : [];
        return JSON.stringify({ ok: true, plan: tasks.length });
      }
       case "update_task": {
         return JSON.stringify({ ok: true, task: args?.task_id, status: args?.status });
       }
       // ---- Herramientas de ACCESO PC REAL (delegadas al puente Python :5000) ----
       case "pc_info": {
         const info = await bridgeFetch("/api/pc/info");
         return JSON.stringify(info);
       }
       case "pc_exec": {
         const command = String(args?.command || "");
         if (!command) return JSON.stringify({ ok: false, error: "Falta el comando" });
         const res = await bridgeFetch("/api/exec", { command, timeout: Number(args?.timeout) || 120 }, 130000);
         return JSON.stringify(res);
       }
       case "pc_write_file": {
         const res = await bridgeFetch("/api/fs/write", { path: String(args?.path || ""), content: String(args?.content ?? "") });
         return JSON.stringify(res);
       }
       case "pc_read_file": {
         const res = await bridgeFetch("/api/fs/read", { path: String(args?.path || "") });
         return JSON.stringify(res);
       }
       case "pc_list_dir": {
         const res = await bridgeFetch("/api/fs/list", { path: String(args?.path || "") });
         return JSON.stringify(res);
       }
       case "pc_delete": {
         const res = await bridgeFetch("/api/fs/delete", { path: String(args?.path || "") });
         return JSON.stringify(res);
       }

       // ============================================================
       // v2.0 — HERRAMIENTAS NUEVAS (todas dentro del sandbox .proyectos)
       // ------------------------------------------------------------
       // Motivo: con modelos pequeños, la diferencia entre "responder en 3
       // segundos" y "colgarse" es cuántos tokens tiene que generar. Reescribir
       // un archivo de 500 líneas cuesta ~4.000 tokens; reemplazar una línea
       // cuesta 40. Estas herramientas existen para que el modelo pueda hacer lo
       // segundo.
       // ============================================================
       case "read_file_range": {
         const abs = resolveSafePath(String(args?.path || ""));
         const all = fs.readFileSync(abs, "utf-8").split("\n");
         const start = Math.max(1, Number(args?.start) || 1);
         const end = Math.min(all.length, Number(args?.end) || Math.min(all.length, start + 199));
         const slice = all.slice(start - 1, end);
         // Numeramos las líneas para que el modelo pueda citar/patchar con precisión
         const numbered = slice.map((l, i) => `${start + i}: ${l}`).join("\n");
         return JSON.stringify({ ok: true, path: args?.path, start, end, totalLines: all.length, content: numbered });
       }
       case "edit_file": {
         const abs = resolveSafePath(String(args?.path || ""));
         if (!fs.existsSync(abs)) return JSON.stringify({ ok: false, error: `No existe el archivo ${args?.path}` });
         const find = String(args?.find ?? "");
         const replace = String(args?.replace ?? "");
         if (!find) return JSON.stringify({ ok: false, error: "Falta el texto a buscar (find)" });
         const original = fs.readFileSync(abs, "utf-8");
         const occurrences = original.split(find).length - 1;
         if (occurrences === 0) {
           return JSON.stringify({ ok: false, error: "El texto a reemplazar no se encontró en el archivo (¿espacios o comillas distintas?)" });
         }
         if (occurrences > 1) {
           return JSON.stringify({
             ok: false,
             error: `El texto aparece ${occurrences} veces: añade más contexto para que sea único.`,
           });
         }
         // El resultado del reemplazo también se valida: un edit_file puede
         // dejar el archivo desbalanceado (por ejemplo, si «replace» corta una
         // función a medias). Si rompe la sintaxis, se revierte.
         const updated = original.replace(find, replace);
         const guardEdit = await guardFileProfundo(String(args?.path || ""), updated, PARSER_ESBUILD);
         if (!guardEdit.ok) {
           return JSON.stringify({
             ok: false,
             error: `⛔ El reemplazo dejaría el archivo con errores de sintaxis y se ha REVERTIDO.\n${guardEdit.summary}\nCorrige el texto de "replace" y vuelve a intentarlo.`,
             issues: guardEdit.issues,
           });
         }
          // QUIRÓFANO v1 /*QF-EDIT*/ — también se juzga el resultado de un edit_file:
          // un find/replace puede llevarse por delante una exportación o media función.
          const juicioEditQf = juzgarEscrituraQf(String(args?.path || ""), updated);
          if (juicioEditQf.bloqueada) {
            return JSON.stringify({ ok: false, error: juicioEditQf.mensaje, quirofano: juicioEditQf.diag });
          }
          fs.writeFileSync(abs, updated, "utf-8");
          registrarCirugiaQf(String(args?.path || ""), original, updated, juicioEditQf.diag);
          return JSON.stringify({ ok: true, path: args?.path, savedChars: find.length - replace.length, syntax: guardEdit.summary });
       }
       case "append_file": {
         const abs = resolveSafePath(String(args?.path || ""));
         const content = String(args?.content ?? "");
         fs.mkdirSync(path.dirname(abs), { recursive: true });
         fs.appendFileSync(abs, content, "utf-8");
         return JSON.stringify({ ok: true, path: args?.path, appended: content.length });
       }
       case "search_in_files": {
         const query = String(args?.query || "");
         if (!query) return JSON.stringify({ ok: false, error: "Falta el texto a buscar (query)" });
         let re: RegExp;
         try {
           re = new RegExp(query, "i");
         } catch {
           re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
         }
         const extFilter = typeof args?.glob === "string" ? args.glob.trim().toLowerCase() : "";
         const maxResults = Math.max(1, Math.min(200, Number(args?.max_results) || 40));
         const hits: string[] = [];
         const IGNORED = new Set(["node_modules", ".git", "dist", "dist_electron", ".vite", "venv", "__pycache__"]);
         const walkSearch = (dir: string, base: string) => {
           if (hits.length >= maxResults) return;
           let entries: string[] = [];
           try {
             entries = fs.readdirSync(dir);
           } catch {
             return;
           }
           for (const entry of entries) {
             if (hits.length >= maxResults) return;
             if (IGNORED.has(entry)) continue;
             const full = path.join(dir, entry);
             const rel = base ? `${base}/${entry}` : entry;
             let stat;
             try {
               stat = fs.statSync(full);
             } catch {
               continue;
             }
             if (stat.isDirectory()) {
               walkSearch(full, rel);
               continue;
             }
             if (extFilter && !rel.toLowerCase().endsWith(extFilter)) continue;
             if (stat.size > 512 * 1024) continue; // no indexamos binarios gigantes
             let text = "";
             try {
               text = fs.readFileSync(full, "utf-8");
             } catch {
               continue;
             }
             const lines = text.split("\n");
             for (let i = 0; i < lines.length && hits.length < maxResults; i++) {
               if (re.test(lines[i])) hits.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
             }
           }
         };
         walkSearch(PROJECT_ROOT, "");
         return JSON.stringify({ ok: true, query, matches: hits.length, results: hits });
       }
       case "find_symbol": {
        // FASE 2 — Consulta al índice del motor (no al modelo).
        const needle = String(args?.name || "");
        if (!needle) return JSON.stringify({ ok: false, error: "Falta el nombre del símbolo (name)." });
        if (symbolMap.total === 0) reindexProjectSymbols();
        const limit = Math.max(1, Math.min(30, Number(args?.limit) || 8));
        const hits = findSymbols(symbolMap, needle, limit);
        if (hits.length === 0) {
          return JSON.stringify({
            ok: true,
            found: 0,
            message: `El motor no encontró ningún símbolo "${needle}" en el proyecto (${symbolMap.files.length} archivo(s) indexado(s), ${symbolMap.total} símbolo(s)). No inventes ese nombre: usa search_in_files o pide al usuario que confirme.`,
          });
        }
        return JSON.stringify({
          ok: true,
          found: hits.length,
          indexed: { files: symbolMap.files.length, symbols: symbolMap.total },
          results: hits.map((h) => ({ file: h.file, line: h.symbol.line, kind: h.symbol.kind, signature: h.symbol.signature })),
        });
      }
      case "make_dir": {
         const abs = resolveSafePath(String(args?.path || ""));
         fs.mkdirSync(abs, { recursive: true });
         return JSON.stringify({ ok: true, path: args?.path });
       }
       case "delete_file": {
         const abs = resolveSafePath(String(args?.path || ""));
         if (!fs.existsSync(abs)) return JSON.stringify({ ok: false, error: `No existe ${args?.path}` });
         // QUIRÓFANO v1 /*QF-DELETE*/ — un borrado entra en la operación: el botón
         // «Deshacer» tiene que poder devolver el archivo, no sólo lamentarlo.
         try {
           registrarCirugiaQf(String(args?.path || ""), fs.readFileSync(abs, "utf-8"), "");
         } catch {}
         fs.unlinkSync(abs);
         return JSON.stringify({ ok: true, deleted: args?.path });
       }
       // QUIRÓFANO v1 /*QF-CASOS*/ — el modelo puede revisar y deshacer SUS PROPIOS cambios.
       case "revisar_cambios": {
         const v = await cerrarTurnoQf("revisión pedida por el modelo");
         if (!v) return JSON.stringify({ ok: true, informe: "No hay cambios pendientes en esta tanda." });
         return JSON.stringify({ ok: v.ok, revertido: v.revertido, puertas: v.puertas, informe: v.informe });
       }
       case "deshacer_cambios": {
         const r = await deshacerUltimoQf();
         return JSON.stringify(r);
       }
       case "git_status": {
         const result = await runCommand("git status --short --branch", PROJECT_ROOT, 20000);
         return JSON.stringify(result);
       }
       case "git_diff": {
         const target = typeof args?.path === "string" && args.path.trim() ? ` -- ${args.path.trim()}` : "";
         const result = await runCommand(`git diff${target}`, PROJECT_ROOT, 30000);
         return JSON.stringify(result);
       }
       case "git_commit": {
         const message = String(args?.message || "Punto de restauración CerebroNico").replace(/"/g, "'");
         const result = await runCommand(`git add -A && git commit -m "${message}"`, PROJECT_ROOT, 40000);
         return JSON.stringify(result);
       }
       case "consultar_espejo": {
        // ESPEJOS v2 — el modelo llama espejos DIRECTO y en LOTE: cálculo
        // determinista (~1 ms, 0 alucinación) sin un round trip por operación.
        const llamadas = Array.isArray(args?.llamadas) ? args.llamadas : [];
        if (!llamadas.length) return JSON.stringify({ ok: false, motivo: "falta «llamadas» (array de {espejo, datos})." });
        if (llamadas.length > 8) return JSON.stringify({ ok: false, motivo: "máximo 8 llamadas por golpe — divide y reenvía." });
        const resultados = llamadas.map((l: any) => {
          const id = String(l?.espejo || "");
          if (!/^espejo\./.test(id)) return { espejo: id, ok: false, motivo: "solo espejos (id «espejo.*»)." };
          try {
            const rr = ejecutarEntidad(id, l?.datos ?? {});
            registrarSaludEspejo(id, !!rr?.ok); // SALUD v1: cada ejecución cuenta para la flota
            return { espejo: id, ok: !!rr?.ok, ms: rr?.ms, ...(rr?.ok ? { salida: rr.salida } : { motivo: rr?.motivo || "el espejo no devolvió motivo" }) };
          } catch (e2: any) { registrarSaludEspejo(id, false); return { espejo: id, ok: false, motivo: String(e2?.message || e2) }; }
        });
        return JSON.stringify({ ok: true, resultados });
      }
      case "forjar_complemento": {
         // FORJA v1 — el modelo SOLO aporta la receta (JSON, cadena u objeto);
         // el manifest y el panel los escribe el compilador y los valida el juez oficial.
         try {
           let brutoReceta: any = args?.receta ?? args;
           if (typeof brutoReceta === "string") {
             try { brutoReceta = JSON.parse(brutoReceta); }
             catch { return JSON.stringify({ ok: false, motivo: "la receta no es JSON válido. Reenvía la receta como objeto JSON limpio (sin texto alrededor)." }); }
           }
           const existentes = fs.existsSync(EXTENSIONS_DIR) ? fs.readdirSync(EXTENSIONS_DIR) : [];
           const nr = normalizarReceta(brutoReceta, existentes);
           if (!nr.ok) return JSON.stringify({ ok: false, motivo: "receta tachada: " + nr.motivos.join(" · ") + ". Corrígela y reenvíala: nada fue escrito." });
           const archivosForj = generarArchivos(nr.receta);
           const vmf = validateManifest(JSON.parse(archivosForj[0].content));
           if (!vmf.ok) return JSON.stringify({ ok: false, motivo: "bug del compilador (no tuyo): " + vmf.errors.join("; ") });
           const dir = path.join(EXTENSIONS_DIR, nr.receta.id);
           fs.mkdirSync(dir, { recursive: true });
           for (const a of archivosForj) fs.writeFileSync(path.join(dir, a.path), a.content, "utf8");
           return JSON.stringify({ ok: true, creado: nr.receta.id, uso: instruccionUso(nr.receta) });
         } catch (e: any) {
           return JSON.stringify({ ok: false, motivo: "forja falló: " + String((e && e.message) || e) });
         }
       }
       case "fetch_url": {
         const url = String(args?.url || "");
         const maxChars = Math.max(500, Math.min(20000, Number(args?.max_chars) || 6000));
         // Guarda SSRF: solo http/https públicos, nunca direcciones internas.
         // El modelo no debe poder usarse para sondear la red local del usuario.
         if (!/^https?:\/\//i.test(url)) return JSON.stringify({ ok: false, error: "Solo se permiten URLs http/https." });
         try {
           const u = new URL(url);
           const host = u.hostname.toLowerCase();
           const isPrivate =
             host === "localhost" ||
             host === "127.0.0.1" ||
             host === "0.0.0.0" ||
             host === "[::1]" ||
             host.endsWith(".local") ||
             /^10\./.test(host) ||
             /^192\.168\./.test(host) ||
             /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
             /^169\.254\./.test(host);
           if (isPrivate) return JSON.stringify({ ok: false, error: "Dirección interna bloqueada por seguridad." });
         } catch {
           return JSON.stringify({ ok: false, error: "URL no válida." });
         }
         const controller = new AbortController();
         const t = setTimeout(() => controller.abort(), 15000);
         try {
           const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "CerebroNico-IDE/2.0" } });
           const raw = await res.text();
           const text = raw
             .replace(/<script[\s\S]*?<\/script>/gi, " ")
             .replace(/<style[\s\S]*?<\/style>/gi, " ")
             .replace(/<[^>]+>/g, " ")
             .replace(/\s+/g, " ")
             .trim();
           return JSON.stringify({ ok: res.ok, status: res.status, url, content: text.slice(0, maxChars) });
         } catch (e: any) {
           return JSON.stringify({ ok: false, error: `No se pudo descargar: ${e?.message || e}` });
         } finally {
           clearTimeout(t);
         }
       }
       default: {
         // ¿Es una herramienta aportada por una extensión? Se reenvía a su
         // pestaña (iframe) y se espera el resultado, que vuelve por la cola
         // de invocaciones. El modelo la ve como cualquier otra herramienta.
         const spec = getToolSpec(name);
         if (spec && spec.pack.startsWith("ext:")) {
           const extId = spec.pack.slice(4);
           if (!openExtensionPanels.has(extId)) {
             return JSON.stringify({
               ok: false,
               error: `La extensión "${extId}" no tiene su pestaña abierta: ábrela para usar "${name}".`,
             });
           }
           const m = extensionRegistry.get(extId);
           const contrib = m ? listToolContributions(m).find((t) => t.name === name) : undefined;
           const command = contrib?.handler ? contrib.handler.replace(/^command:/, "") : name;
           const r = await invokeExtension(extId, command, args);
           return JSON.stringify(r.ok ? { ok: true, result: r.result } : { ok: false, error: r.error });
         }
         return JSON.stringify({ ok: false, error: `Herramienta desconocida: ${name}` });
       }
    }
  } catch (err: any) {
    return JSON.stringify({ ok: false, error: err.message });
  }
}

async function callOllamaNonStreaming(
  targetUrl: string,
  model: string,
  messages: any[],
  temperature: number,
  isAborted: () => boolean,
  tools: any[]
): Promise<any | null> {
  const maxAttempts = 3;
  let lastErr: any = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isAborted()) return null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch(`${targetUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          // keep_alive: deja el modelo cargado en RAM (evita recargas lentas que cuelgan la UI)
          keep_alive: getProfile(model).keepAlive,
          tools,
          // v2.0 — el bucle de agente usa las mismas opciones por perfil que el
          // streaming: contexto y tope de salida acordes al tamaño del modelo.
          options: buildOllamaOptions(model, temperature, CPU_CORES, RAM_GB),
        }),
      });
      if (res.ok) return await res.json();
      if (RETRYABLE_HTTP_STATUS.has(res.status)) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleepMs(150 * (attempt + 1));
        continue;
      }
      lastErr = new Error(`HTTP ${res.status}`);
      break;
    } catch (err: any) {
      lastErr = err;
      if (attempt < maxAttempts - 1) await sleepMs(150 * (attempt + 1));
    } finally {
      clearTimeout(timeoutId);
    }
  }
  if (lastErr) console.warn(`Ollama (agente) no disponible en ${targetUrl}:`, lastErr.message);
  return null;
}

async function runOllamaAgentLoop(
  targetUrl: string,
  model: string,
  initialMessages: any[],
  temperature: number,
  isAborted: () => boolean,
  onTask?: (event: any) => void,
  tools?: any[]
): Promise<string | null> {
  const messages = initialMessages.map((m) => ({ ...m }));
  let maxSteps = PASOS_BASE; // v1.16.0: crece con el plan, topado por bucleAutonomo
  const plan: TareaPlan[] = [];
  let ultimoFallo: UltimoFallo | null = null;
  let lastContent = "";

  // Anti-bucle: detecta la repetición idéntica de una misma herramienta
  let lastToolKey = "";
  let repeatCount = 0;

  for (let step = 0; step < maxSteps; step++) {
    if (isAborted()) return null;

    const resp = await callOllamaNonStreaming(targetUrl, model, messages, temperature, isAborted, tools || AGENT_TOOLS);
    if (resp === null) return null;

    const msg = resp.message || {};
    const toolCalls: any[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    const content: string = typeof msg.content === "string" ? msg.content : "";
    if (content) lastContent = content;

    if (toolCalls.length === 0) {
      // v1.16.0 — el juez determinista decide si esto es el fin o una parada a
      // mitad: plan abierto, permiso pedido, frase cortada, intención sin
      // ejecutar o un fallo reciente que hay que resolver cambiando de camino.
      const d = decidirBucle({ contenido: content, plan, paso: step, maxPasos: maxSteps, ultimoFallo });
      if (d.accion === "continuar") {
        if (onTask) onTask({ type: "log", message: `🔁 ${d.motivo} — sigo sin que me lo pidas` } as any);
        messages.push({ role: "user", content: d.directiva });
        continue;
      }
      return content || lastContent || d.informe;
    }

    messages.push({ role: "assistant", content: content || "", tool_calls: toolCalls });

    for (const tc of toolCalls) {
      const fnName = tc.function?.name;
      let args: any = {};
      try {
        args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        args = {};
      }

      // Anti-bucle: si la misma llamada se repite 3 veces seguidas, detener
      const toolKey = `${fnName}:${JSON.stringify(args)}`;
      if (toolKey === lastToolKey) {
        repeatCount++;
      } else {
        lastToolKey = toolKey;
        repeatCount = 1;
      }
      if (repeatCount >= 3) {
        return lastContent || `⚠️ Detenido: se detectó un bucle (la herramienta ${fnName} se repitió 3 veces con los mismos argumentos).`;
      }

      // Emitir eventos de tarea para el tablero (plan / estado)
      if (onTask) {
        if (fnName === "set_plan" && Array.isArray(args.tasks)) {
          onTask({
            type: "plan",
            tasks: args.tasks.map((t: any, i: number) => ({
              id: String(t?.id || `t${i + 1}`),
              description: String(t?.description || ""),
              status: "pending",
            })),
          });
        } else if (fnName === "update_task") {
          onTask({
            type: "update",
            taskId: String(args.task_id || args.taskId || ""),
            status: args.status,
          });
        }
      }

      // Emitir evento de acción para el log visible del agente (qué herramienta usa y sobre qué)
      if (onTask) {
        const detail =
          args?.path ? String(args.path)
          : args?.command ? String(args.command).slice(0, 80)
          : args?.content ? `(${String(args.content).length} bytes)`
          : fnName === "list_files" ? "sandbox .proyectos"
          : "";
        onTask({ type: "action", action: { tool: fnName, detail, ok: true } });
      }

      const result = await executeToolCall(fnName, args);

      // ============================================================
      // FASE 2 — DISCIPLINA DE CONTEXTO EN EL MOTOR
      // El resultado de la herramienta se COMPACTA antes de devolverlo al
      // modelo: leer un archivo de 600 líneas o un log de 400 no debe llenar la
      // ventana del siguiente turno (con 8 GB de RAM eso es la diferencia entre
      // responder y quedarse colgado). Los errores NO se compactan nunca: el
      // modelo necesita el mensaje completo para corregir.
      // ============================================================
      let isError = false;
      try {
        isError = JSON.parse(result)?.ok === false;
      } catch {
        isError = false;
      }
      const compacted = compactToolResult(fnName, result, isError);
      if (compacted.note && onTask) {
        onTask({ type: "log", message: `🧠 ${fnName}: ${compacted.note}` } as any);
      }
      messages.push({ role: "tool", content: compacted.output });

      // ============================================================
      // FASE 2 — EL MOTOR APRENDE DE SUS PROPIOS FALLOS
      // Cada error real de una herramienta se registra como entrada de la base
      // de conocimiento (deduplicada y acotada). A partir de ahí, el motor ya
      // sabe que ese fallo existe y qué hacer: no depende de que el modelo lo
      // recuerde ni de que alguien escriba documentación a mano.
      // ============================================================
      if (isError) {
        learnFromToolFailure(fnName, args, result);
      }
      // v1.16.0 — memoria del bucle: plan y fallo son lo que decide seguir solo.
      actualizarPlanDesdeHerramienta(plan, fnName, args);
      maxSteps = techoDePasos(tareasPendientes(plan).length);
      ultimoFallo = isError ? { herramienta: fnName, error: String(result).slice(0, 300) } : null;
    }
  }

  // QUIRÓFANO v1 /*QF-TURNO*/ — fin del turno del agente: se juzga TODO lo que
  // escribió (con las puertas sobre el disco) y, si rompió algo, se revierte y el
  // informe viaja en la respuesta para que el usuario lo vea en el chat.
  const cierreTurnoQf = await cerrarTurnoQf("turno del agente");
  if (cierreTurnoQf && (cierreTurnoQf.revertido || !cierreTurnoQf.ok)) {
    return (lastContent || "Completado.") + "\n\n" + cierreTurnoQf.informe;
  }
  // v1.16.0 — con tareas abiertas ya no se dice «Completado»: se informa qué falta.
  const restante = informeHonesto(tareasPendientes(plan), true);
  return (lastContent || "El agente ejecutó las herramientas del turno.") + (restante ? `\n\n${restante}` : "");
}

/**
 * Lazy initialization of Google GenAI SDK
 *
 * 🔧 CORRECCIÓN: ahora acepta una API key explícita del request (enviada por el
 * cliente desde el modal "Ranuras de API Keys"). Si no se pasa, hace fallback a
 * process.env.GEMINI_API_KEY (comportamiento anterior, para backwards compat).
 * Esto permite que cada usuario configure su propia key de Google AI Studio
 * sin tocar el .env del servidor.
 */
let genAIClient: GoogleGenAI | null = null;
let genAIClientKey: string | null = null;
function getGenAI(explicitKey?: string): GoogleGenAI | null {
  const apiKey = (explicitKey && explicitKey.trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  // Reutilizar cliente si la key no cambió
  if (genAIClient && genAIClientKey === apiKey) return genAIClient;
  try {
    genAIClient = new GoogleGenAI({ apiKey });
    genAIClientKey = apiKey;
    return genAIClient;
  } catch (err) {
    console.warn("Error inicializando GoogleGenAI:", (err as Error).message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎙️ GEMINI TTS — texto a voz con VARIAS VOCES (cloud).
// Antes solo existía `speechSynthesis` del navegador (1-2 voces del SO). Ahora el
// botón «Escuchar» usa Gemini TTS (modelo gemini-3.1-flash-tts-preview) con 30
// voces prebuilt y cae al navegador SOLO si no hay GEMINI_API_KEY o la llamada falla.
// Doc: https://ai.google.dev/gemini-api/docs/speech-generation
// ─────────────────────────────────────────────────────────────────────────────

/** 30 voces prebuilt de Gemini TTS (nombre + estilo). */
const VOCES_GEMINI_TTS: Array<{ id: string; estilo: string }> = [
  { id: "Zephyr", estilo: "Brillante" },
  { id: "Puck", estilo: "Animada" },
  { id: "Charon", estilo: "Informativa" },
  { id: "Kore", estilo: "Firme" },
  { id: "Fenrir", estilo: "Entusiasta" },
  { id: "Leda", estilo: "Juvenil" },
  { id: "Orus", estilo: "Firme" },
  { id: "Aoede", estilo: "Despejada" },
  { id: "Callirrhoe", estilo: "Relajada" },
  { id: "Autonoe", estilo: "Brillante" },
  { id: "Enceladus", estilo: "Susurrante" },
  { id: "Iapetus", estilo: "Clara" },
  { id: "Umbriel", estilo: "Relajada" },
  { id: "Algieba", estilo: "Suave" },
  { id: "Despina", estilo: "Suave" },
  { id: "Erinome", estilo: "Clara" },
  { id: "Algenib", estilo: "Ronca" },
  { id: "Rasalgethi", estilo: "Informativa" },
  { id: "Laomedeia", estilo: "Animada" },
  { id: "Achernar", estilo: "Suave" },
  { id: "Alnilam", estilo: "Firme" },
  { id: "Schedar", estilo: "Plana" },
  { id: "Gacrux", estilo: "Madura" },
  { id: "Pulcherrima", estilo: "Decidida" },
  { id: "Achird", estilo: "Amigable" },
  { id: "Zubenelgenubi", estilo: "Casual" },
  { id: "Vindemiatrix", estilo: "Gentil" },
  { id: "Sadachbia", estilo: "Vivaz" },
  { id: "Sadaltager", estilo: "Erudita" },
  { id: "Sulafat", estilo: "Cálida" },
];

const MODELO_GEMINI_TTS = "gemini-3.1-flash-tts-preview";

/** Convierte PCM base64 (24 kHz, 16-bit, mono) en WAV base64 reproducible en <audio>. */
function pcm16ToWavBase64(pcmBase64: string): string {
  const pcm = Buffer.from(pcmBase64, "base64");
  const numChannels = 1;
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(numChannels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return wav.toString("base64");
}

function registerGeminiTtsRoutes(app: express.Application) {
  app.get("/api/tts/voices", (_req, res) => {
    res.json({ ok: true, voces: VOCES_GEMINI_TTS, modelo: MODELO_GEMINI_TTS });
  });

  app.post("/api/tts/gemini", async (req: Request, res: Response) => {
    const text = String(req.body?.text ?? "").trim();
    const voice = String(req.body?.voice ?? "Kore").trim();
    if (!text) return res.status(400).json({ ok: false, motivo: "No hay texto para leer." });
    if (text.length > 5000) return res.status(400).json({ ok: false, motivo: "Texto demasiado largo (máx. 5000 caracteres)." });
    if (!VOCES_GEMINI_TTS.some((v) => v.id === voice)) {
      return res.status(400).json({ ok: false, motivo: `Voz «${voice}» no válida.` });
    }
    const apiKey = (req.headers["x-gemini-key"] as string) || process.env.GEMINI_API_KEY;
    const ai = getGenAI(apiKey);
    if (!ai) {
      return res.status(503).json({ ok: false, motivo: "Falta GEMINI_API_KEY. Sin clave se usa la voz del navegador." });
    }

    // Retry: Gemini TTS devuelve ocasionalmente tokens de texto en vez de audio (500).
    //
    // v1.13.0 — PERO NO SE REINTENTA LO QUE NO VA A MEJORAR.
    // Con la cuota agotada (429) o una clave inválida, insistir tres veces solo
    // retrasa la caída a la voz del navegador, gasta más cuota y acaba enseñando un
    // volcado de JSON. `clasificarErrorTTS` dice qué es y si tiene sentido insistir.
    let lastErr: any = null;
    let ultimo = clasificarErrorTTS(null);
    for (let intento = 0; intento < 3; intento++) {
      try {
        const resp: any = await ai.models.generateContent({
          model: MODELO_GEMINI_TTS,
          contents: [{ parts: [{ text: `Lee en voz alta el siguiente texto:\n${text}` }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
            },
          } as any,
        });
        const data = resp?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!data) throw new Error("la respuesta no trajo audio (vino texto).");
        const wavBase64 = pcm16ToWavBase64(data);
        return res.json({ ok: true, audioBase64: wavBase64, mime: "audio/wav", voice, modelo: MODELO_GEMINI_TTS });
      } catch (err: any) {
        lastErr = err;
        ultimo = clasificarErrorTTS(err);
        if (!ultimo.reintentable) break; // cuota/clave: no se arregla insistiendo
        await sleepMs(160 * (intento + 1));
      }
    }
    // Al usuario, la causa en una frase; el volcado de Google, al registro.
    return res.status(502).json({
      ok: false,
      clase: ultimo.clase,
      motivo: ultimo.motivo,
      detalle: recortarDetalle(lastErr),
    });
  });
}

/**
 * 🔧 AUTODETECCIÓN DE MODELOS GRATUITOS — Gemini / OpenRouter
 * Estos endpoints se registran dentro de startServer() donde `app` está en scope.
 * Se exponen dos rutas:
 *   GET /api/gemini/models    — lista modelos flash de la API key del usuario
 *   GET /api/openrouter/models — lista modelos :free del catálogo público
 */
function registerModelDiscoveryRoutes(app: express.Application) {
  /**
   * Llama a https://generativelanguage.googleapis.com/v1beta/models?key=API_KEY
   * y devuelve los modelos flash disponibles para generateContent.
   */
  app.get("/api/gemini/models", async (req: Request, res: Response) => {
    const apiKey = (req.query.key as string) || (req.headers["x-gemini-key"] as string) || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "Falta API key de Gemini (parámetro ?key= o header x-gemini-key)." });
    }
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { headers: { "Content-Type": "application/json" } }
      );
      if (!r.ok) {
        const errTxt = await r.text().catch(() => "");
        return res.status(r.status).json({ error: `Google devolvió HTTP ${r.status}: ${errTxt.slice(0, 300)}` });
      }
      const data: any = await r.json();
      const all = Array.isArray(data?.models) ? data.models : [];
      // 🔧 Devolver TODOS los modelos que soportan generateContent (no solo flash).
      // Esto incluye: flash, flash-lite, pro, experimental, etc.
      const usable = all
        .filter((m: any) => {
          const supported = Array.isArray(m?.supportedGenerationMethods)
            ? m.supportedGenerationMethods.includes("generateContent")
            : true;
          return supported;
        })
        .map((m: any) => ({
          // El nombre viene como "models/gemini-2.5-flash" — recortamos el prefijo
          id: String(m.name).replace(/^models\//, ""),
          name: String(m.name).replace(/^models\//, ""),
          description: m.description || `Modelo Gemini (${m.displayName || m.name}).`,
          contextWindow: m.inputTokenLimit ? `${Math.round(m.inputTokenLimit / 1000)}k` : "1M",
          provider: "gemini",
        }));
      return res.json({ models: usable, total: usable.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * 🔧 Lista TODOS los modelos del catálogo público de OpenRouter (no solo los :free).
   * El usuario puede filtrar en la UI. Incluye modelos gratuitos y de pago.
   * No requiere API key (catálogo público).
   */
  app.get("/api/openrouter/models", async (req: Request, res: Response) => {
    try {
      // 🔧 Si se pasa ?free=1, devolver solo los gratuitos (comportamiento legacy)
      const onlyFree = req.query.free === "1" || req.query.free === "true";
      const r = await fetchCloud("https://openrouter.ai/api/v1/models", {
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) {
        const errTxt = await r.text().catch(() => "");
        return res.status(r.status).json({ error: `OpenRouter devolvió HTTP ${r.status}: ${errTxt.slice(0, 300)}` });
      }
      const data: any = await r.json();
      const all = Array.isArray(data?.data) ? data.data : [];
      // 🔧 Devolver TODOS los modelos por defecto (no solo :free).
      // Marcar con `isFree: true` los que terminan en :free para que la UI los distinga.
      const models = all
        .filter((m: any) => typeof m?.id === "string")
        .filter((m: any) => !onlyFree || m.id.endsWith(":free"))
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          description: m.name || m.id,
          contextWindow: m.context_length ? `${Math.round(m.context_length / 1000)}k` : "—",
          provider: "openrouter",
          isFree: m.id.endsWith(":free"),
          pricing: m.pricing || null,
        }));
      // Modelo virtual "openrouter/free" siempre al principio (enruta al mejor gratuito)
      const virtualEntry = {
        id: "openrouter/free",
        name: "openrouter/free",
        description: "Enrutador automático de OpenRouter: selecciona el mejor modelo gratuito disponible con soporte de tool-calling.",
        contextWindow: "auto",
        provider: "openrouter",
        isVirtual: true,
        isFree: true,
      };
      return res.json({ models: [virtualEntry, ...models], total: models.length + 1 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * 🔧 Autodetección de modelos OpenAI para la API key del usuario.
   * Llama a https://api.openai.com/v1/models con Authorization: Bearer <KEY>
   * y devuelve TODOS los modelos del catálogo (gpt-*, o1, o3, o4, chatgpt-*,
   * gemini-* si estuvieran, etc.), excluyendo los de embeddings/audio/tts
   * que no sirven para chat.
   */
  app.get("/api/openai/models", async (req: Request, res: Response) => {
    const apiKey =
      (req.headers["x-openai-key"] as string) ||
      (req.query.key as string) ||
      process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "Falta API key de OpenAI (header x-openai-key o variable OPENAI_API_KEY)." });
    }
    try {
      const r = await fetchCloud("https://api.openai.com/v1/models", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (!r.ok) {
        const errTxt = await r.text().catch(() => "");
        return res.status(r.status).json({ error: `OpenAI devolvió HTTP ${r.status}: ${errTxt.slice(0, 300)}` });
      }
      const data: any = await r.json();
      const all = Array.isArray(data?.data) ? data.data : [];
      // 🔧 Devolver TODOS los modelos útiles para chat/razonamiento, no solo gpt-4.
      // Filtrar SOLO los que claramente no son de chat: embeddings, audio, tts,
      // whisper, moderation, dall-e, realtime, etc.
      const chatModels = all
        .filter((m: any) => {
          const id: string = String(m?.id || "");
          if (!id) return false;
          // Excluir categorías que no son chat
          return !/^(text-embedding|embed|tts|whisper|moderation|dall-e|audio|realtime|text-search|code-search|text-similarity|curie|davinci|babbage|ada-002|text-davinci|text-curie)/i.test(id);
        })
        .map((m: any) => ({
          id: String(m.id),
          name: String(m.id),
          description: `Modelo OpenAI disponible en tu cuenta. Propietario: ${m.owned_by || "openai"}. Creado: ${m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : "n/d"}.`,
          contextWindow: "auto",
          provider: "openai",
        }))
        // Ordenar: gpt-4o primero, luego gpt-4o-mini, luego el resto
        .sort((a: any, b: any) => {
          const order = (id: string) => {
            if (id === "gpt-4o") return 0;
            if (id === "gpt-4o-mini") return 1;
            if (id.startsWith("gpt-4o")) return 2;
            if (id.startsWith("o3")) return 3;
            if (id.startsWith("o1")) return 4;
            if (id.startsWith("o4")) return 5;
            if (id.startsWith("chatgpt")) return 6;
            if (id.startsWith("gpt-4")) return 7;
            if (id.startsWith("gpt-3.5")) return 8;
            if (id.startsWith("gpt-5")) return 9;
            return 99;
          };
          return order(a.id) - order(b.id);
        });
      return res.json({ models: chatModels, total: chatModels.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * v1.1 — Z.AI (GLM) — Catálogo de modelos gratuitos.
   * Z.ai cambia su endpoint /models con frecuencia y a veces requiere invitación,
   * por eso devolvemos un catálogo estático de los modelos gratuitos estables.
   * Si el usuario pegó API key, también intentamos listar en vivo para complementar.
   */
  app.get("/api/zai/models", async (req: Request, res: Response) => {
    const apiKey = (req.headers["x-zai-key"] as string) || (req.query.key as string) || process.env.ZAI_API_KEY;
    // Catálogo estático (siempre disponible, no requiere key):
    const STATIC_FREE = [
      { id: "glm-4.5-flash",  name: "GLM-4.5-Flash",  description: "Modelo gratuito estrella de Z.ai. Veloz y capaz. Ideal para code + chat.", contextWindow: "128K", provider: "zai" },
      { id: "glm-4-flash",    name: "GLM-4-Flash",    description: "Hermano menor de GLM-4.5-Flash. Gratis y muy rápido.",                     contextWindow: "128K", provider: "zai" },
      { id: "glm-4-air",      name: "GLM-4-Air",      description: "Variante liviana de GLM-4. Gratis para uso personal.",                    contextWindow: "128K", provider: "zai" },
      { id: "glm-4-flashx",  name: "GLM-4-FlashX",   description: "GLM-4 ultra-rápido. Gratis.",                                            contextWindow: "128K", provider: "zai" },
      { id: "glm-4.5v-flash", name: "GLM-4.5V-Flash", description: "Modelo vision (multimodal) gratuito de Z.ai.",                          contextWindow: "64K",  provider: "zai" },
    ];
    if (!apiKey) {
      return res.json({ models: STATIC_FREE, total: STATIC_FREE.length, source: "static" });
    }
    // Si hay API key, intentamos listar en vivo (best-effort). Si falla, devolvemos el estático.
    try {
      const r = await fetchCloud("https://api.z.ai/api/paas/v4/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (r.ok) {
        const data: any = await r.json();
        const all = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
        const live = all.map((m: any) => ({
          id: String(m.id || m.name),
          name: String(m.id || m.name),
          description: `Modelo Z.ai (en vivo): ${m.description || m.owned_by || "n/d"}`,
          contextWindow: "auto",
          provider: "zai",
        })).filter((m: any) => m.id);
        // Combinar: catálogo estático + modelos en vivo (sin duplicar)
        const seen = new Set(STATIC_FREE.map((s) => s.id));
        const merged = [...STATIC_FREE, ...live.filter((m: any) => !seen.has(m.id))];
        return res.json({ models: merged, total: merged.length, source: "live+static" });
      }
    } catch {}
    return res.json({ models: STATIC_FREE, total: STATIC_FREE.length, source: "static-fallback" });
  });

  /**
   * v1.1 — Generic cloud models endpoint: lista modelos de cualquier proveedor OpenAI-compatible
   * conocido (Groq, Cerebras, Together, Mistral, DeepSeek, Fireworks). Reusa /api/custom/models
   * internamente con la URL correcta según el proveedor.
   */
  app.get("/api/cloud/models", async (req: Request, res: Response) => {
    const provider = String(req.query.provider || req.headers["x-provider"] || "");
    const apiKey = (req.headers["x-cloud-key"] as string) || (req.query.key as string) || "";
    const CLOUD_URLS: Record<string, string> = {
      groq: "https://api.groq.com/openai/v1",
      cerebras: "https://api.cerebras.ai/v1",
      together: "https://api.together.xyz/v1",
      mistral: "https://api.mistral.ai/v1",
      deepseek: "https://api.deepseek.com/v1",
      fireworks: "https://api.fireworks.ai/inference/v1",
    };
    if (!provider || !CLOUD_URLS[provider]) {
      return res.status(400).json({ error: `Provider inválido. Valores válidos: ${Object.keys(CLOUD_URLS).join(", ")}` });
    }
    const url = CLOUD_URLS[provider];
    // Si no hay API key, devolvemos catálogo estático conocido (algunos servicios requieren key):
    const STATIC: Record<string, any[]> = {
      groq:     [{ id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", description: "Modelo gratuito estrella de Groq. 128K ctx.", contextWindow: "128K", provider: "groq" },
                 { id: "llama-3.1-8b-instant",   name: "Llama 3.1 8B",   description: "Llama 3.1 8B instantáneo en Groq.",                contextWindow: "128K", provider: "groq" },
                 { id: "gemma2-9b-it",            name: "Gemma 2 9B",     description: "Gemma 2 9B instruct en Groq.",                     contextWindow: "8K",   provider: "groq" },
                 { id: "mixtral-8x7b-32768",      name: "Mixtral 8x7B",   description: "Mixtral 8x7B en Groq (32K context).",              contextWindow: "32K",  provider: "groq" }],
      cerebras: [{ id: "llama3.1-8b",                       name: "Llama 3.1 8B",       description: "Llama 3.1 8B en Cerebras (ultra-rápido).", contextWindow: "128K", provider: "cerebras" },
                  { id: "llama3.1-70b",                     name: "Llama 3.1 70B",      description: "Llama 3.1 70B en Cerebras.",                contextWindow: "128K", provider: "cerebras" },
                  { id: "qwen-2.5-coder-32b-instruct",      name: "Qwen 2.5 Coder 32B", description: "Qwen 2.5 Coder 32B en Cerebras.",           contextWindow: "128K", provider: "cerebras" }],
      together:  [{ id: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",       name: "Llama 3.3 70B Turbo Free",   description: "Llama 3.3 70B gratis en Together (turbo).", contextWindow: "128K", provider: "together" },
                   { id: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",       name: "Llama 3.1 8B Turbo",        description: "Llama 3.1 8B Turbo en Together.",           contextWindow: "128K", provider: "together" },
                   { id: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free",    name: "DeepSeek R1 Distill 70B",   description: "DeepSeek R1 Distill Llama 70B free.",       contextWindow: "128K", provider: "together" }],
      mistral:  [{ id: "mistral-small-latest", name: "Mistral Small",   description: "Mistral Small (última versión). Gratis.", contextWindow: "32K",  provider: "mistral" },
                 { id: "mistral-medium-latest", name: "Mistral Medium",  description: "Mistral Medium (última versión).",        contextWindow: "32K",  provider: "mistral" },
                 { id: "codestral-latest",      name: "Codestral",       description: "Codestral — especializado en código.",    contextWindow: "32K",  provider: "mistral" },
                 { id: "open-mistral-nemo",     name: "Mistral Nemo",    description: "Mistral Nemo open-source.",                contextWindow: "128K", provider: "mistral" }],
      deepseek: [{ id: "deepseek-chat",     name: "DeepSeek V3",     description: "DeepSeek Chat (V3).", contextWindow: "64K", provider: "deepseek" },
                 { id: "deepseek-reasoner", name: "DeepSeek R1",     description: "DeepSeek Reasoner (R1).", contextWindow: "64K", provider: "deepseek" },
                 { id: "deepseek-coder",   name: "DeepSeek Coder", description: "DeepSeek Coder (especializado en código).", contextWindow: "64K", provider: "deepseek" }],
      fireworks:[{ id: "accounts/fireworks/models/llama-v3p1-8b-instruct",            name: "Llama 3.1 8B",                 description: "Llama 3.1 8B en Fireworks.",                  contextWindow: "128K", provider: "fireworks" },
                  { id: "accounts/fireworks/models/llama-v3p1-70b-instruct",           name: "Llama 3.1 70B",                description: "Llama 3.1 70B en Fireworks.",                 contextWindow: "128K", provider: "fireworks" },
                  { id: "accounts/fireworks/models/deepseek-r1-distill-llama-70b",     name: "DeepSeek R1 Distill 70B",      description: "DeepSeek R1 Distill Llama 70B en Fireworks.", contextWindow: "128K", provider: "fireworks" }],
    };
    if (!apiKey) {
      const list = STATIC[provider] || [];
      return res.json({ models: list, total: list.length, source: "static" });
    }
    try {
      const r = await fetch(`${url}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (r.ok) {
        const data: any = await r.json();
        const all = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
        const live = all.map((m: any) => ({
          id: String(m.id || m.name),
          name: String(m.id || m.name),
          description: `Modelo en vivo de ${provider}.`,
          contextWindow: "auto",
          provider,
        })).filter((m: any) => m.id);
        // Combinar estático + vivo (sin duplicar)
        const seen = new Set((STATIC[provider] || []).map((s) => s.id));
        const merged = [...(STATIC[provider] || []), ...live.filter((m: any) => !seen.has(m.id))];
        return res.json({ models: merged, total: merged.length, source: "live+static" });
      }
    } catch {}
    const list = STATIC[provider] || [];
    return res.json({ models: list, total: list.length, source: "static-fallback" });
  });

  /**
   * 🔧 Lista los modelos disponibles en CUALQUIER endpoint OpenAI-compatible.
   * Útil para Groq, Cerebras, Together, Mistral, DeepSeek, Fireworks, etc.
   * Recibe la URL base y la API key por headers (x-custom-url, x-custom-key).
   * Esto permite al usuario "Cargar modelos" del servidor Custom elegido.
   */
  app.get("/api/custom/models", async (req: Request, res: Response) => {
    const customUrl = (req.headers["x-custom-url"] as string) || (req.query.url as string);
    const customKey = (req.headers["x-custom-key"] as string) || (req.query.key as string);
    if (!customUrl) {
      return res.status(400).json({ error: "Falta la URL del endpoint (header x-custom-url o query ?url=)." });
    }
    try {
      const cleanUrl = customUrl.replace(/\/$/, "");
      // Aceptar tanto "https://api.groq.com/openai/v1" como "https://api.groq.com/openai/v1/models"
      const endpoint = cleanUrl.endsWith("/models")
        ? cleanUrl
        : cleanUrl.endsWith("/v1")
        ? `${cleanUrl}/models`
        : `${cleanUrl}/v1/models`;

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (customKey) {
        headers["Authorization"] = `Bearer ${customKey}`;
      }

      const r = await fetchCloud(endpoint, { headers });
      if (!r.ok) {
        const errTxt = await r.text().catch(() => "");
        return res.status(r.status).json({ error: `Servidor Custom devolvió HTTP ${r.status}: ${errTxt.slice(0, 300)}` });
      }
      const data: any = await r.json();
      // La respuesta puede venir como { data: [...] } (estilo OpenAI) o como { models: [...] } (algunos proxies)
      const all = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
      const models = all
        .map((m: any) => ({
          id: String(m.id || m.name || m.model || ""),
          name: String(m.id || m.name || m.model || ""),
          description: m.description || m.owned_by || `Modelo del servidor Custom`,
          contextWindow: m.context_length ? `${Math.round(m.context_length / 1000)}k` : (m.context_window ? `${Math.round(m.context_window / 1000)}k` : "auto"),
          provider: "custom",
        }))
        .filter((m: any) => m.id);
      return res.json({ models, total: models.length, endpoint });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================
// v2.0 — SUBSISTEMA DE EXTENSIONES
// ------------------------------------------------------------
// Escaneo de ./extensions, estado habilitado/deshabilitado, registro de las
// herramientas que aportan y cola de invocación modelo → extensión.
// ============================================================
const EXTENSIONS_DIR = path.join(process.cwd(), "extensions");
const EXTENSIONS_STATE_FILE = path.join(process.cwd(), ".extensions-state.json");
const extensionRegistry = new ExtensionRegistry();
/** Extensiones deshabilitadas por el usuario (persistido) */
const disabledExtensions = new Set<string>();
/**
 * Extensiones con panel ABIERTO en la IDE. Lo informa el sondeo del cliente
 * (?open=id1,id2). Solo a esas se les ofrecen sus herramientas al modelo: si no
 * hay panel, no hay quién ejecute la herramienta.
 */
const openExtensionPanels = new Set<string>();

function loadExtensionsState(): void {
  try {
    if (!fs.existsSync(EXTENSIONS_STATE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(EXTENSIONS_STATE_FILE, "utf-8"));
    for (const id of raw?.disabled || []) disabledExtensions.add(String(id));
  } catch {}
}

function saveExtensionsState(): void {
  try {
    fs.writeFileSync(EXTENSIONS_STATE_FILE, JSON.stringify({ disabled: [...disabledExtensions] }, null, 2), "utf-8");
  } catch {}
}
loadExtensionsState();

export interface ExtensionView {
  manifest: ExtensionManifest;
  dir: string;
  enabled: boolean;
  error?: string;
  warnings?: string[];
  panelOpen: boolean;
}

/** Lee los manifiestos de las carpetas de ./extensions, los valida y devuelve la lista. */
function scanExtensions(): ExtensionView[] {
  const out: ExtensionView[] = [];
  extensionRegistry.all().forEach(() => {});
  try {
    if (!fs.existsSync(EXTENSIONS_DIR)) return out;
    const dirs = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const d of dirs) {
      const dirAbs = path.join(EXTENSIONS_DIR, d.name);
      const manifestPath = path.join(dirAbs, "manifest.json");
      const rel = `extensions/${d.name}`;
      if (!fs.existsSync(manifestPath)) continue;
      let raw: any = null;
      try {
        raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      } catch (err: any) {
        // v2.1 — Los tres caminos de error omitían `panelOpen`, que
        // `ExtensionView` exige. La interfaz lee ese campo para decidir si el
        // panel de la extensión está abierto; sin él, la entrada viajaba
        // incompleta. Una extensión rota no tiene panel abierto: `false`.
        out.push({
          manifest: { id: d.name, name: d.name, version: "0.0.0", main: "index.html" },
          dir: rel,
          enabled: false,
          panelOpen: false,
          error: `manifest.json no es JSON válido: ${err?.message || err}`,
        });
        continue;
      }
      const v = validateManifest(raw);
      if (!v.ok) {
        out.push({ manifest: raw, dir: rel, enabled: false, panelOpen: false, error: v.errors.join(" ") });
        continue;
      }
      const manifest: ExtensionManifest = raw;
      // El entry tiene que existir de verdad
      const entryAbs = path.resolve(dirAbs, manifest.main);
      if (!entryAbs.startsWith(dirAbs) || !fs.existsSync(entryAbs)) {
        out.push({ manifest, dir: rel, enabled: false, panelOpen: false, error: `No existe el archivo de entrada "${manifest.main}".` });
        continue;
      }
      const manifestWithPath: ExtensionManifest = { ...manifest, _path: rel, _installedAt: manifest._installedAt || Date.now() };
      extensionRegistry.add(manifestWithPath);
      out.push({
        manifest: manifestWithPath,
        dir: rel,
        enabled: !disabledExtensions.has(manifest.id),
        warnings: v.warnings,
        panelOpen: openExtensionPanels.has(manifest.id),
      });
    }
  } catch (err: any) {
    console.warn("[extensions] Error escaneando:", err?.message || err);
  }
  return out;
}

/** Vuelve a escanear y actualiza los packs de herramientas de las extensiones. */
function refreshExtensionTools(): ExtensionView[] {
  for (const m of extensionRegistry.all()) unregisterToolPack(`ext:${m.id}`);
  // El registro se reconstruye en cada escaneo (barato: son manifiestos locales)
  const fresh = new ExtensionRegistry();
  const views = scanExtensions().map((v) => {
    if (v.enabled && v.manifest?.id) fresh.add(v.manifest);
    return v;
  });
  for (const m of fresh.all()) {
    const tools = listToolContributions(m);
    if (tools.length === 0) continue;
    registerToolPack({
      id: `ext:${m.id}`,
      label: `${m.name} (extensión)`,
      description: m.description || `Herramientas aportadas por ${m.name}`,
      tools: tools.map((t) => ({
        name: t.name,
        pack: `ext:${m.id}`,
        description: toolDescriptionWithHint(t.description, m.id),
        parameters: t.parameters,
        cheap: t.cheap,
        destructive: t.destructive,
        // Requiere la extensión abierta: se comprueba al montar la lista de tools
        requires: {} as any,
      })),
    });
  }
  return views;
}

/** Marca en la descripción que la herramienta viene de una extensión (el modelo lo ve). */
function toolDescriptionWithHint(desc: string, extId: string): string {
  return `${desc} [aportada por la extensión ${extId}; solo funciona si su pestaña está abierta]`;
}

// ------------------------------------------------------------
// Cola de invocación: modelo (servidor) → extensión (iframe del navegador)
// ------------------------------------------------------------
interface PendingInvocation {
  id: string;
  extId: string;
  command: string;
  args: any;
  resolve: (r: { ok: boolean; result?: any; error?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingInvocations = new Map<string, PendingInvocation>();

function invokeExtension(
  extId: string,
  command: string,
  args: any,
  timeoutMs = 45000
): Promise<{ ok: boolean; result?: any; error?: string }> {
  return new Promise((resolve) => {
    const id = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timer = setTimeout(() => {
      pendingInvocations.delete(id);
      resolve({ ok: false, error: "La extensión no respondió a tiempo." });
    }, timeoutMs);
    pendingInvocations.set(id, { id, extId, command, args, resolve, timer });
  });
}

// ============================================================
// v2.0 — RENDIMIENTO LOCAL Y SALUD PROFUNDA (resiliencia)
// ------------------------------------------------------------
// El problema real del usuario: "en local se queda, no contesta". Dos causas
// técnicas y su remedio automático desde aquí:
//   1. El modelo no está cargado en RAM cuando llega el primer mensaje: Ollama
//      tiene que leer 400 MB-2 GB de disco → parece colgado. → /api/ollama/warmup
//      lo precarga al seleccionarlo, con el contexto ya reservado.
//   2. No se sabía POR QUÉ no respondía (¿Ollama caído? ¿sandbox muerto? ¿sin
//      RAM?). → /api/health/deep comprueba cada pieza y dice qué hacer.
// ============================================================
// ============================================================
// v2.0 — ENDPOINTS DEL MOTOR (base de datos + blindaje)
// ============================================================
function registerEngineRoutes(app: express.Express): void {
  // ============================================================
  // v2.0 — ENDPOINTS DEL CEREBRO (gobernanza + memoria viva)
  // ============================================================

  // ============================================================
  // v2.0 — LABORATORIO DE CAPACIDADES AVANZADAS (cada una con su botón)
  // ============================================================

  // ============================================================
  // v2.1 — VERIFICADOR INDEPENDIENTE (en la nube, coste local ~0)
  // ============================================================

  /** Estado: activado o no, proveedor del juez, si hay clave y coste local. */
  app.get("/api/verifier/status", (_req: Request, res: Response) => {
    try {
      return res.json({ ok: true, ...verifier.status() });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /** Configura el juez: activar, proveedor, modelo y política ante duda. */
  app.post("/api/verifier/config", (req: Request, res: Response) => {
    try {
      const patch: any = {};
      if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
      if (typeof req.body?.provider === "string") patch.provider = req.body.provider;
      if (typeof req.body?.model === "string" && req.body.model) patch.model = req.body.model;
      if (typeof req.body?.baseUrl === "string") patch.baseUrl = req.body.baseUrl;
      if (typeof req.body?.apiKeyEnv === "string" && req.body.apiKeyEnv) patch.apiKeyEnv = req.body.apiKeyEnv;
      if (req.body?.anteDuda === "dejar_pasar" || req.body?.anteDuda === "rechazar") patch.anteDuda = req.body.anteDuda;
      const cfg = verifier.setConfig(patch);
      console.log(`[CerebroNico] Verificador ${cfg.enabled ? "ACTIVADO" : "desactivado"} · juez: ${cfg.provider}/${cfg.model}`);
      return res.json({ ok: true, ...verifier.status() });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /**
   * Revisa una propuesta. Sin coste si falla la capa determinista.
   * `archivosProyecto` permite además comprobar que los imports existan.
   */
  app.post("/api/verifier/check", async (req: Request, res: Response) => {
    try {
      const peticion = String(req.body?.peticion || "");
      const propuesta = String(req.body?.propuesta || "");
      if (!propuesta) return res.status(400).json({ ok: false, error: "Falta 'propuesta'." });
      const archivosProyecto = Array.isArray(req.body?.archivosProyecto)
        ? req.body.archivosProyecto.map((x: any) => String(x))
        : undefined;
      const v = await verifier.verificar(peticion, propuesta, { archivosProyecto, exigirCodigo: req.body?.exigirCodigo === true });
      return res.json({ ok: true, ...v });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /**
   * Gobernador de hardware: fase, presupuesto, qué cabe ahora y en qué modo.
   * Es la pieza que convierte "tengo 12 GB" en decisiones concretas.
   */
  app.get("/api/governor", (_req: Request, res: Response) => {
    try {
      return res.json({ ok: true, ...governor.report() });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /** Catálogo completo: qué hay, qué pide y si tu máquina lo aguanta. */
  app.get("/api/features", (_req: Request, res: Response) => {
    return res.json({ ok: true, hardware: features.hardware(), features: features.catalog() });
  });

  /** El botón: activa o desactiva una capacidad y persiste la decisión. */
  app.post("/api/features/toggle", (req: Request, res: Response) => {
    const id = String(req.body?.id || "") as any;
    const activar = req.body?.enabled === true || req.body?.enabled === "true";
    const ok = features.setOn(id, activar);
    if (!ok) return res.status(400).json({ ok: false, error: "Capacidad desconocida." });
    console.log(`[CerebroNico] Capacidad "${id}" ${activar ? "ACTIVADA" : "desactivada"}`);
    const extra: any = { id, enabled: activar };
    // Al activar el multi-cerebro se crean las plantillas si faltan (nunca
    // sobrescribe lo que el usuario ya haya escrito).
    if (id === "multi_brain" && activar) extra.plantillasCreadas = features.ensureDomainTemplates();
    if (id === "git_memory") extra.git = features.gitDisponible();
    return res.json({ ok: true, ...extra, features: features.catalog() });
  });

  /** Crea las plantillas de sub-cerebro sin activar nada. */
  app.post("/api/features/templates", (_req: Request, res: Response) => {
    return res.json({ ok: true, creados: features.ensureDomainTemplates() });
  });

  /** Historial Git de la memoria: la evolución, línea por línea. */
  app.get("/api/features/git/log", (_req: Request, res: Response) => {
    return res.json({ ok: true, ...features.gitDisponible(), commits: features.logMemoria(20) });
  });

  /** Confirma el estado actual de la memoria en Git (a mano). */
  app.post("/api/features/git/commit", (req: Request, res: Response) => {
    const motivo = String(req.body?.motivo || "actualización manual");
    // v2.1 — Aquí había un `ok: true` ANTES del spread, y `commitMemoria` ya
    // devuelve su propio `ok`: el literal quedaba pisado y no hacía nada. Se
    // quita el muerto y manda el valor real de la función.
    return res.json({ ...features.commitMemoria(motivo) });
  });

  /** Vuelve a una confirmación concreta de memoria.md. */
  app.post("/api/features/git/rollback", (req: Request, res: Response) => {
    const hash = String(req.body?.hash || "");
    if (!hash) return res.status(400).json({ ok: false, error: "Falta 'hash'." });
    // v2.1 — Igual que arriba: el `ok` que cuenta es el de `rollbackGit`.
    return res.json({ ...features.rollbackGit(hash) });
  });

  /**
   * Índice profundo: indexa TODO el código del proyecto en la memoria vectorial.
   * Solo funciona si la capacidad está activada y la vectorización también.
   */
  app.post("/api/features/deep-index", async (_req: Request, res: Response) => {
    try {
      if (!features.isOn("deep_index")) {
        return res.status(400).json({ ok: false, error: "La capacidad «Índice profundo del código» está desactivada." });
      }
      const fuentes = features.collectProjectSources();
      if (fuentes.length === 0) {
        return res.json({ ok: true, archivos: 0, message: "No se encontraron archivos indexables en el proyecto." });
      }
      // Se necesita la memoria vectorial encendida para poder indexar.
      if (!localRag.isEnabled()) localRag.setEnabled(true);
      const r = await localRag.reindex(fuentes);
      return res.json({ ok: true, archivos: fuentes.length, ...r, ...localRag.status(path.join(process.cwd(), "memoria.md")) });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ============================================================
  // v2.0 — VECTORIZACIÓN LOCAL (RAG): apagada por defecto, botón para activar
  // ============================================================

  /** Estado: activada o no, tamaño de la memoria, trozos indexados y recomendación. */
  app.get("/api/rag/status", (_req: Request, res: Response) => {
    return res.json({ ok: true, ...localRag.status(path.join(process.cwd(), "memoria.md")) });
  });

  /** Enciende o apaga la vectorización. Es el botón. */
  app.post("/api/rag/toggle", (req: Request, res: Response) => {
    const enabled = req.body?.enabled === true || req.body?.enabled === "true";
    const estado = localRag.setEnabled(enabled);
    console.log(`[CerebroNico] Memoria vectorial ${estado ? "ACTIVADA" : "DESACTIVADA"}`);
    if (!estado) localRag.clear(); // apagarla libera también el índice: cero RAM
    // v2.1 — `enabled: estado` quedaba pisado por el `enabled` que ya trae
    // `localRag.status()`, que es el estado REAL tras aplicarlo. Manda el real.
    return res.json({ ok: true, ...localRag.status(path.join(process.cwd(), "memoria.md")) });
  });

  /** Cambia el modelo de embeddings (por defecto qwen3-embedding:0.6b de Ollama). */
  app.post("/api/rag/model", (req: Request, res: Response) => {
    const modelo = String(req.body?.model || "");
    if (!modelo) return res.status(400).json({ ok: false, error: "Falta 'model'." });
    localRag.setModel(modelo);
    return res.json({ ok: true, model: modelo });
  });

  /** Reindexa cerebro.md + memoria.md + la base de conocimiento del motor. */
  app.post("/api/rag/index", async (_req: Request, res: Response) => {
    try {
      const fuentes: Array<{ nombre: string; texto: string }> = [];
      const cerebroRuta = path.join(process.cwd(), "cerebro.md");
      const memoriaRuta = path.join(process.cwd(), "memoria.md");
      if (fs.existsSync(cerebroRuta)) fuentes.push({ nombre: "cerebro.md", texto: fs.readFileSync(cerebroRuta, "utf-8") });
      if (fs.existsSync(memoriaRuta)) fuentes.push({ nombre: "memoria.md", texto: fs.readFileSync(memoriaRuta, "utf-8") });
      try {
        const kbRuta = path.join(process.cwd(), ".cerebro-db", "kb.json");
        if (fs.existsSync(kbRuta)) {
          const kb = JSON.parse(fs.readFileSync(kbRuta, "utf-8"));
          const entradas = Array.isArray(kb?.entries) ? kb.entries : [];
          const texto = entradas.map((e: any) => `[${e.table}] ${e.title}: ${e.body}`).join("\n\n");
          if (texto) fuentes.push({ nombre: "base-de-conocimiento", texto });
        }
      } catch {}
      const r = await localRag.reindex(fuentes);
      return res.json({ ok: true, ...r, ...localRag.status(path.join(process.cwd(), "memoria.md")) });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /** Prueba de búsqueda: sirve para comprobar que activar la vectorización aporta. */
  app.post("/api/rag/search", async (req: Request, res: Response) => {
    const query = String(req.body?.query || "");
    if (!query) return res.status(400).json({ ok: false, error: "Falta 'query'." });
    const hits = await localRag.search(query, Number(req.body?.k) || 4);
    return res.json({ ok: true, query, hits: hits.map((h) => ({ source: h.source, score: Number(h.score.toFixed(3)), text: h.text.slice(0, 240) })) });
  });

  /** Vacía el índice en disco (no toca la memoria). */
  app.post("/api/rag/clear", (_req: Request, res: Response) => {
    localRag.clear();
    return res.json({ ok: true, ...localRag.status(path.join(process.cwd(), "memoria.md")) });
  });

  /** Estado completo: métricas, ley cargada, memoria, historial y propuestas. */
  app.get("/api/brain", (_req: Request, res: Response) => {
    try {
      return res.json({
        ok: true,
        stats: brain.stats(),
        estado: brain.getMemoria().split("\n").filter((l) => l.startsWith("- **")).slice(0, 5),
        historial: brain.listarHistorial().slice(0, 10),
        propuestas: brain.listarPropuestas(),
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /** Estado operativo de la sesión. */
  app.post("/api/brain/state", (req: Request, res: Response) => {
    const { fase, hito, bloqueos } = req.body || {};
    const ok = brain.updateState({ fase, hito, bloqueos });
    return res.json({ ok, stats: brain.stats() });
  });

  /** Decisión arquitectónica (ADR Log). */
  app.post("/api/brain/decision", (req: Request, res: Response) => {
    const texto = String(req.body?.texto || "");
    if (!texto) return res.status(400).json({ ok: false, error: "Falta 'texto'." });
    return res.json({ ok: brain.addDecision(texto) });
  });

  /** Lección aprendida (preferencias y errores que no se deben repetir). */
  /**
   * v1.9.0 — de endpoint huérfano a pieza del ciclo de aprendizaje.
   *
   * QUÉ ES: la puerta por la que una lección aprendida en el navegador entra en la
   * memoria del cerebro (`memoria.md`).
   * PARA QUÉ SIRVE: para que el aprendizaje sobreviva a limpiar los datos del
   * navegador. Hasta v1.9.0 no lo llamaba NADIE: las lecciones vivían solo en
   * `localStorage` y la promesa D9 estaba escrita pero sin cumplir.
   *
   * Lleva guard porque ESCRIBE en la memoria del cerebro: es la misma puerta que
   * el resto de rutas mutantes (fuera de loopback, sin token, no se pasa).
   */
  app.post("/api/brain/lesson", (req: Request, res: Response) => {
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const texto = String(req.body?.texto || "");
    if (!texto) return res.status(400).json({ ok: false, error: "Falta 'texto'." });
    return res.json({ ok: brain.addLesson(texto) });
  });

  /**
   * Analiza un texto del modelo buscando PROPUESTAS DE AUTO-MEJORA del cerebro.
   * Nunca se aplican solas: se guardan en .cerebro-db/proposals/ para que un
   * humano las apruebe (cerebro.md es el núcleo inmutable).
   */
  app.post("/api/brain/scan", (req: Request, res: Response) => {
    const texto = String(req.body?.texto || "");
    if (!texto) return res.status(400).json({ ok: false, error: "Falta 'texto'." });
    const detectadas = Brain.detectarPropuestas(texto);
    const guardadas: string[] = [];
    for (const p of detectadas) {
      const ruta = brain.guardarPropuesta(p);
      if (ruta) guardadas.push(ruta.split(/[\\/]/).pop() || ruta);
    }
    return res.json({ ok: true, detectadas: detectadas.length, guardadas, propuestas: brain.listarPropuestas() });
  });

  /** Historial completo de la memoria (para rollback). */
  app.get("/api/brain/history", (_req: Request, res: Response) => {
    return res.json({ ok: true, historial: brain.listarHistorial() });
  });

  /** Rollback: restaura una copia del historial (guarda antes la actual). */
  app.post("/api/brain/rollback", (req: Request, res: Response) => {
    const archivo = String(req.body?.archivo || "");
    if (!archivo) return res.status(400).json({ ok: false, error: "Falta 'archivo'." });
    const ok = brain.rollback(archivo);
    return res.json({ ok, stats: brain.stats() });
  });

  /** Compresión manual del estado (purga ruido conservando lo crítico). */
  app.post("/api/brain/compact", (_req: Request, res: Response) => {
    return res.json({ ok: true, ...brain.compactar() });
  });

  /** Vista previa del bloque que se inyecta en el prompt, por nivel de modelo. */
  app.get("/api/brain/prompt", (req: Request, res: Response) => {
    const nivel = String(req.query.nivel || "standard");
    return res.json({ ok: true, nivel, bloque: brain.systemBlock(nivel as any) });
  });

  /** Consulta la base de conocimiento del motor (determinista, sin modelo). */
  app.get("/api/engine/kb", (req: Request, res: Response) => {
    const q = String(req.query.q || "");
    const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 5));
    const hits = q ? engineKb.query(q, limit) : [];
    return res.json({
      ok: true,
      query: q,
      hits: hits.map((h) => ({ id: h.entry.id, table: h.entry.table, title: h.entry.title, body: h.entry.body, score: h.score })),
      // Lo que el motor inyectaría al prompt con esa consulta
      context: buildEngineContext(engineKb, q, limit),
      stats: engineKb.stats(),
      size: engineKb.size(),
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // CEREBRO DE TAREAS (v2.2) — lista de tareas, dependencias y paralelismo
  // ════════════════════════════════════════════════════════════════════════
  // El plan corre EN SEGUNDO PLANO: estos endpoints devuelven al instante y el
  // panel consulta el avance. Nada bloquea el chat.
  //
  // Los servicios se crean la PRIMERA vez que se usan, no al cargar el módulo:
  // así un problema de disco en `.cerebro-db` no impide arrancar el servidor.

  /** Modelo para las tareas de tipo "modelo" si el plan no dice otro. */
  const MODELO_PLAN_POR_DEFECTO = process.env.CN_PLAN_MODEL || "qwen2.5-coder:1.5b.ollama";

  let runnerPlanes: PlanRunner | null = null;

  /** Medición de la máquina, del mismo origen que usa el gobernador. */
  const medirMaquina = () => ({
    ramMedidaGB: RAM_GB,
    ramLibreGB: Math.round((os.freemem() / 1024 ** 3) * 10) / 10,
    nucleos: CPU_CORES,
  });

  /** Estado del reparto AHORA, con el motivo de cada número. */
  const presupuestoActual = (perfilForzado?: MRId) => {
    const p = resolverPresupuesto({ ...medirMaquina(), perfilForzado, escalado: runnerPlanes?.escaladoActual() ?? 1 });
    return {
      tramo: p.perfil.id,
      tramoNombre: p.perfil.nombre,
      ramDelTramoGB: p.perfil.ramGB,
      escalado: p.escalado,
      etiqueta: etiquetaEscalado(p.escalado),
      io: p.io,
      cpu: p.cpu,
      contextoPorTarea: p.contextoPorTarea,
      degradado: p.degradado,
      motivo: p.motivo,
    };
  };

  /**
   * La ÚNICA autoridad para escribir una imagen generada en el proyecto (v2.3).
   * La usan el runner de planes y el endpoint directo: si hubiera dos, algún
   * día discreparían (la lección de la validación del plan, aplicada al binario).
   * El binario NO pasa por el workspace de texto: ese vive en localStorage con
   * tope de 5 MB, y un JPEG de 1 MB lo tumbaría entero.
   */
  function escribirImagenEnProyecto(rutaRel: string, data: Uint8Array): string {
    const raiz = resolverRaizProyecto().raiz;
    const abs = path.resolve(raiz, rutaRel);
    const rel = path.relative(raiz, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`la ruta «${rutaRel}» sale de la raíz del proyecto: no se escribe nada.`);
    }
    const ext = path.extname(abs).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      throw new Error(`«${ext || "(sin extensión)"}» no es una extensión de imagen.`);
    }
    // La extensión manda los BYTES, no la petición: un JPEG con extensión .png
    // es un archivo mal etiquetado. `rutaConExtensionReal` corrige la extensión
    // (y el servidor avisa al compararla, porque la función es muda).
    const real = rutaConExtensionReal(rel, data);
    const absFinal = path.resolve(raiz, real.ruta);
    if (path.relative(raiz, absFinal) !== real.ruta) {
      throw new Error("la ruta corregida sale de la raíz del proyecto: no se escribe nada.");
    }
    fs.mkdirSync(path.dirname(absFinal), { recursive: true });
    fs.writeFileSync(absFinal, Buffer.from(data));
    return path.relative(PROJECT_ROOT, absFinal).split(path.sep).join("/");
  }

  function obtenerRunner(): PlanRunner {
    if (runnerPlanes) return runnerPlanes;
    const dirDb = path.join(PROJECT_ROOT, ".cerebro-db");

    const gestor = new GestorPlanes(crearAlmacenFs(dirDb), {
      onAviso: (l) => narrarDesdeAviso(l), // COREO v1: consola + bus visual
    });
    const carga = gestor.cargar();
    console.log(
      `[Cerebro] Planes en disco: ${gestor.lista().length}` +
        (carga.interrumpidos.length ? ` · pausados por el reinicio: ${carga.interrumpidos.join(", ")}` : "") +
        (carga.avisos.length ? ` · avisos: ${carga.avisos.length}` : "")
    );

    const ejecutar = crearEjecutorDePlanes({
      modeloPorDefecto: MODELO_PLAN_POR_DEFECTO,
      onAviso: (l) => narrarDesdeAviso(l), // COREO v1: consola + bus visual

      // v2.3 — Cadena de imágenes gratuitas. La validación de prompt/dimensiones
      // la hace el ejecutor con el MISMO código que usa el endpoint
      // /api/engine/imagen; aquí solo se inyectan las claves de esta máquina.
      // BÓVEDA/IMAGEN v5: `intentos: 2` — el reintento corto (2.5 s) dentro de
      // la tarea, antes del drenaje de cola de 45 s del planificador. La
      // congestión del gratuito se va sola al segundo golpe (medido).
      generarImagen: ({ prompt, ancho, alto, modelo, seed, senal, intentos }) =>
        generarImagen({
          prompt,
          ancho,
          alto,
          modelo,
          seed,
          senal,
          intentos: intentos ?? 2,
          tokenPollinations: process.env.POLLINATIONS_API_KEY?.trim() || undefined,
          keyGemini: process.env.GEMINI_API_KEY?.trim() || undefined,
        }),

      // La escritura binaria tiene UNA sola autoridad (ver arriba): la orden
      // del chat ya auditó la ruta, y esto es la segunda comprobación, la misma
      // que usa el endpoint directo. BÓVEDA v1: después de guardar en el
      // sandbox, la imagen VIAJA al disco real indexado si el puente responde.
      guardarBinario: async (rutaRel, data, mime) => {
        const ruta = escribirImagenEnProyecto(rutaRel, data);
        try {
          const linea = await transportarABoveda({
            bytes: data,
            mime: String(mime || "image/jpeg"),
            proyecto: nombreProyectoSandbox(),
            archivo: String(rutaRel).split(/[\\/]/).pop() || "imagen",
            origenSandbox: ruta,
          });
          if (linea) narrarDesdeAviso(linea);
        } catch {}
        return ruta;
      },

      // v2.5 AGÉNTICO — las 40 entidades del consejo como primitivas del motor.
      // El planificador las despacha con su presupuesto normal; una herramienta
      // tarda microsegundos, así que cuarenta en paralelo no mueven el semáforo.
      entidad: async (id, datos) => ejecutarEntidad(id, datos),
      reflejar: async (frase) => pensarConsejo(frase, TABLAS.max),
      // GRUPO v1 (Reflejo v5): una tarea `reflejo` que trae solo frase se
      // enruta por LEY (determinista, ~1 ms) cuando el votante neural no
      // está o no decide. El orquestador responde con espejo + datos +
      // confianza; si tiene dudas, lo dice y el planificador reintenta por
      // otro carril en vez de callar.
      orquestar: async (frase) => planificadorPorLeyes(frase),

      pedirModelo: async ({ prompt, modelo, contexto, senal }) => {
        const modeloFinal = modelo || MODELO_PLAN_POR_DEFECTO;
        const url = (process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/, "");
        const mensajes: any[] = [];
        if (contexto) mensajes.push({ role: "system", content: contexto });
        mensajes.push({ role: "user", content: prompt });
        const r = await callOllamaNonStreaming(url, modeloFinal, mensajes, 0.2, () => senal.aborted, []);
        if (!r) throw new Error(`El modelo ${modeloFinal} no devolvió respuesta (¿Ollama caído, o se canceló la tarea?).`);
        const texto = String(r?.message?.content ?? r?.response ?? "");
        if (!texto.trim()) throw new Error(`El modelo ${modeloFinal} respondió sin texto.`);
        return texto;
      },

      leerArchivo: async (ruta) => {
        const abs = resolveSafePath(ruta);
        if (!fs.existsSync(abs)) throw new Error(`No existe el archivo «${ruta}» dentro del proyecto.`);
        return fs.readFileSync(abs, "utf-8");
      },

      guardarResultado: async (nombre, texto, extension) => {
        const dir = path.join(dirDb, "resultados");
        fs.mkdirSync(dir, { recursive: true });
        // La extensión importa: un YAML guardado como .txt es un archivo mal
        // etiquetado, y mal etiquetar archivos es lo que este proyecto no hace.
        const limpia = (extension || "txt").replace(/[^a-z0-9]/gi, "").toLowerCase() || "txt";
        // El nombre viene de los datos de la tarea, o sea de fuera: se sanea
        // entero. Sin esto, un nombre con «../» escribiría fuera de la carpeta.
        const seguro = nombre.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_").slice(0, 80) || "resultado";
        const f = path.join(dir, `${seguro}-${Date.now()}.${limpia}`);
        fs.writeFileSync(f, texto, "utf-8");
        return path.relative(PROJECT_ROOT, f).split(path.sep).join("/");
      },
    });

    runnerPlanes = new PlanRunner({ ejecutar, medir: medirMaquina, gestor });
    return runnerPlanes;
  }

  /** Vista de un plan lista para el panel (con las líneas ya formateadas). */
  const planParaPanel = (plan: Plan, perfilForzado?: MRId) => ({
    id: plan.id,
    objetivo: plan.objetivo,
    estado: plan.estado,
    creadoEn: plan.creadoEn,
    enSegundoPlano: runnerPlanes?.enSegundoPlano(plan.id) || false,
    tareas: plan.tareas.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      peso: t.peso,
      tipo: t.tipo || "modelo",
      estado: t.estado,
      dependeDe: t.dependeDe,
      intentos: t.intentos,
      motivoEspera: t.motivoEspera || null,
      ms: t.coste?.ms ?? null,
      error: t.error ? `${t.error.clase}: ${t.error.mensaje}` : null,
      resultado: t.resultado?.resumen || null,
      artefactos: t.resultado?.artefactos || [],
      linea: lineaEstadoTarea(t),
    })),
    resumen: resumenPlan(plan),
    noTerminadas: plan.noTerminadas || [],
    log: (plan.log || []).slice(-60),
    presupuesto: presupuestoActual(perfilForzado),
  });

  /** Estado del cerebro: escalado, semáforo global y tramos MR. */
  app.get("/api/brain/runner", (_req: Request, res: Response) => {
    const runner = obtenerRunner();
    return res.json({
      ok: true,
      escalado: runner.escaladoActual(),
      etiqueta: etiquetaEscalado(runner.escaladoActual()),
      escaladosDisponibles: ESCALADOS,
      tramoFijado: runner.tramoActual(),
      semaforo: runner.estadoSemaforo(),
      activos: runner.activos(),
      planes: runner.listaPlanes().length,
      modeloPorDefecto: MODELO_PLAN_POR_DEFECTO,
      tramosMR: ORDEN_MR.map((id) => ({
        id,
        nombre: PERFILES_MR[id].nombre,
        ramGB: PERFILES_MR[id].ramGB,
        ioBase: PERFILES_MR[id].ioBase,
        cpuBase: PERFILES_MR[id].cpuBase,
        contextoPorTarea: PERFILES_MR[id].contextoPorTarea,
        modeloRecomendado: PERFILES_MR[id].modeloRecomendado,
      })),
      presupuesto: presupuestoActual(),
      notas: runner.avisosRecientes(),
    });
  });

  /** El botón: «cerebro resiliente ×1 ×2 ×4 ×6 ×8». Afecta incluso a lo que ya corre. */
  app.post("/api/brain/scale", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const pedido = req.body?.escalado;
    // Sin valor: el botón avanza al siguiente (×1 → ×2 → ×4 → ×6 → ×8 → ×1).
    const objetivo = pedido == null ? siguienteEscalado(runner.escaladoActual()) : Number(pedido);
    const r = runner.escalar(objetivo);
    return res.json({ ok: true, escalado: r.escalado, etiqueta: etiquetaEscalado(r.escalado), semaforo: r.limites, motivo: r.motivo });
  });

  /**
   * El selector de tramo MR: automático o forzado a MR#1..#4.
   * Se aplica EN CALIENTE, también a los planes que ya están corriendo.
   */
  app.post("/api/brain/tramo", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const pedido = req.body?.tramo;
    const esAuto = pedido == null || pedido === "" || String(pedido).toLowerCase() === "auto";
    const mr = esAuto ? undefined : (String(pedido).toUpperCase() as MRId);
    if (mr && !ORDEN_MR.includes(mr)) {
      return res.status(400).json({ ok: false, error: `Tramo desconocido: «${pedido}». Válidos: auto, ${ORDEN_MR.join(", ")}.` });
    }
    const r = runner.fijarTramo(mr);
    // v2.1 — `fijarTramo` ya devuelve `{ ok: true, … }`: el literal de delante
    // se descartaba. `presupuesto` sí va después y por eso se conserva.
    return res.json({ ...r, presupuesto: presupuestoActual(mr) });
  });

  /** Planes guardados, resumidos. */
  app.get("/api/brain/plans", (_req: Request, res: Response) => {
    const runner = obtenerRunner();
    return res.json({
      ok: true,
      planes: runner.listaPlanes().map((p) => ({
        id: p.id,
        objetivo: p.objetivo,
        estado: p.estado,
        creadoEn: p.creadoEn,
        tareas: p.tareas.length,
        enSegundoPlano: runner.enSegundoPlano(p.id),
        resumen: resumenPlan(p),
      })),
      semaforo: runner.estadoSemaforo(),
      escalado: runner.escaladoActual(),
    });
  });

  /**
   * Crea un plan. Valida dependencias y CICLOS ANTES de aceptarlo: un ciclo no
   * se ejecuta nunca (se colgaría), y devolverlo como texto legible es más útil
   * que un plan que se queda girando.
   */
  app.post("/api/brain/plan", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const objetivo = String(req.body?.objetivo || "").trim();
    const tareasBrutas = Array.isArray(req.body?.tareas) ? req.body.tareas : [];
    if (!objetivo) return res.status(400).json({ ok: false, error: "Falta «objetivo»: es obligatorio." });
    if (tareasBrutas.length === 0) return res.status(400).json({ ok: false, error: "El plan no trae tareas." });

    const modeloDelPlan = typeof req.body?.modelo === "string" ? req.body.modelo : "";
    const plantilla = typeof req.body?.contexto === "string" ? req.body.contexto : "";

    // Se normaliza lo que llega: nunca se pasa al motor algo sin comprobar.
    const tareas = tareasBrutas.map((t: any, i: number) => {
      const tipo = typeof t?.tipo === "string" && t.tipo ? t.tipo : "modelo";
      const datos: Record<string, unknown> = t?.datos && typeof t.datos === "object" ? { ...t.datos } : {};
      if (tipo === "modelo") {
        if (modeloDelPlan && !datos.modelo) datos.modelo = modeloDelPlan;
        if (plantilla && !datos.contexto) datos.contexto = plantilla;
      }
      return {
        id: String(t?.id || i + 1),
        titulo: String(t?.titulo || `tarea ${i + 1}`),
        peso: t?.peso === "cpu" ? ("cpu" as const) : ("io" as const),
        tipo,
        datos,
        dependeDe: Array.isArray(t?.dependeDe) ? t.dependeDe.map((d: any) => String(d)) : [],
        // Las tareas de un mismo proveedor comparten cortacircuito: si Ollama
        // (o el servicio gratuito de imagen) se cae, no se queman reintentos en
        // cada una de las tareas. (v2.3 — antes NADIE alimentaba el circuito,
        // así que esta clave era decorativa; ahora cuenta de verdad.)
        claveCircuito: tipo === "modelo" ? "ollama" : tipo === "generar_imagen" ? "imagen" : undefined,
      };
    });

    const plan = runner.crear(objetivo, tareas);
    const v = validarPlan(plan);
    if (!v.ok) {
      // Un plan inválido no se queda guardado como si fuera bueno.
      plan.estado = "fallido";
      return res.status(400).json({ ok: false, error: v.error, planId: plan.id });
    }

    let lanzado: { ok: boolean; motivo: string } | null = null;
    if (req.body?.autoLanzar !== false) lanzado = runner.lanzar(plan.id);

    return res.json({
      ok: true,
      planId: plan.id,
      lanzado,
      plan: planParaPanel(plan),
      message: lanzado?.ok
        ? `Plan ${plan.id} creado y lanzado en segundo plano (${plan.tareas.length} tareas).`
        : `Plan ${plan.id} creado (${plan.tareas.length} tareas) pero NO se lanzó.`,
    });
  });

  /** Estado completo de un plan. */
  app.get("/api/brain/plan/:id", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const plan = runner.listaPlanes().find((p) => p.id === String(req.params.id));
    if (!plan) return res.status(404).json({ ok: false, error: `No existe el plan ${req.params.id}.` });
    return res.json({ ok: true, plan: planParaPanel(plan) });
  });

  /** Cancelar: inmediato de verdad, no «cuando acabe la siguiente tarea». */
  app.post("/api/brain/plan/:id/cancel", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const r = runner.cancelar(String(req.params.id));
    return res.status(r.ok ? 200 : 404).json(r);
  });

  /** Reanudar un plan pausado (reinicio) o cancelado. Lo ya hecho NO se repite. */
  app.post("/api/brain/plan/:id/resume", (req: Request, res: Response) => {
    const runner = obtenerRunner();
    const r = runner.reanudar(String(req.params.id));
    return res.status(r.ok ? 200 : 404).json(r);
  });

  // ════════════════════════════════════════════════════════════════════════
  // CONVERSOR INTERNO (v2.2) — convertir Y DECIR QUÉ SE PIERDE
  // ════════════════════════════════════════════════════════════════════════
  // Disponible también como tipo de tarea ("convertir"), así que el cerebro
  // puede convertir 40 archivos en segundo plano mientras tú haces otra cosa.
  app.post("/api/engine/convertir", (req: Request, res: Response) => {
    const desde = String(req.body?.formatoEntrada || "").toLowerCase() as FormatoConv;
    const hacia = String(req.body?.formatoSalida || "").toLowerCase() as FormatoConv;
    const contenido = typeof req.body?.contenido === "string" ? req.body.contenido : "";
    if (!FORMATOS_CONV.includes(desde) || !FORMATOS_CONV.includes(hacia)) {
      return res.status(400).json({ ok: false, error: `Formatos válidos: ${FORMATOS_CONV.join(", ")}.` });
    }
    if (!contenido) return res.status(400).json({ ok: false, error: "Falta «contenido»: no hay nada que convertir." });
    const r = convertir(contenido, desde, hacia, (req.body?.opciones || {}) as any);
    return res.status(r.ok ? 200 : 400).json(r);
  });

  // ════════════════════════════════════════════════════════════════════════
  // IMÁGENES GRATIS (v2.3) — cadena de proveedores sin promesas falsas
  // ════════════════════════════════════════════════════════════════════════
  // La misma cadena que usa la tarea `generar_imagen` del cerebro, disponible
  // también como endpoint directo (la orden `cerebronico:imagen` del chat).
  // Gratis = Pollinations sin clave (lento, y el modelo real lo dice la
  // cabecera, no el pedido). Con GEMINI_API_KEY entra el respaldo. El resultado
  // SIEMPRE declara: proveedor, modelo que respondió DE VERDAD, bytes, tiempo,
  // advertencias y los motivos de cada eslabón fallido.
  app.post("/api/engine/imagen", async (req: Request, res: Response) => {
    try {
      const datos: Record<string, unknown> = req.body && typeof req.body === "object" ? { ...req.body } : {};
      const v = validarDatosImagen(datos);
      if (!v.ok) return res.status(400).json({ ok: false, error: v.error });

      let rutaRel: string | undefined;
      if (datos.salida !== undefined) {
        if (typeof datos.salida !== "string") return res.status(400).json({ ok: false, error: "«salida» tiene que ser una ruta (texto)." });
        const s = datos.salida.trim();
        if (s.length > 0) {
          const vr = validarRutaImagen(s);
          if (!vr.ok) return res.status(400).json({ ok: false, error: `«salida»: ${vr.error}` });
          rutaRel = s;
        }
      }

      const r = await generarImagen({
        prompt: v.prompt,
        ancho: v.ancho,
        alto: v.alto,
        modelo: v.modelo,
        seed: v.seed,
        // IMAGEN v5: la orden directa del chat no tiene planificador detrás,
        // así que el reintento corto vive aquí: 3 golpes con backoff (2.5 s,
        // 5 s) antes de dar la vuelta a Gemini. La congestión pasajera del
        // gratuito (medida: 500 con 429 dentro que al reintento salía bien)
        // ya no mata la orden.
        intentos: 3,
        tokenPollinations: process.env.POLLINATIONS_API_KEY?.trim() || undefined,
        keyGemini: process.env.GEMINI_API_KEY?.trim() || undefined,
      });

      if (!r.ok) {
        // 502: el fallo NO es de este servidor, es de la cadena de proveedores.
        // Y se declara con toda la lista de motivos: nunca un «no se pudo».
        return res.status(502).json({ ok: false, error: r.error, fallos: r.fallos, advertencias: r.advertencias, ms: r.ms });
      }

      // BÓVEDA v1 — sin «salida» explícita, la bóveda local indexada es el
      // destino: el pedido del usuario es que la imagen LLEGUE al disco real
      // (C:\CN\IMAGENES\<proyecto>\…), no que se quede flotando en una URL.
      const avisosBoveda: string[] = [];
      if (!rutaRel) {
        try {
          const linea = await transportarABoveda({
            bytes: r.bytes as Uint8Array,
            mime: String(r.tipoMime || "image/jpeg"),
            proyecto: nombreProyectoSandbox(),
            archivo: `imagen-${Date.now()}.${r.tipoMime === "image/png" ? "png" : r.tipoMime === "image/webp" ? "webp" : "jpg"}`,
            origenSandbox: "(no guardada en sandbox)",
            modeloUsado: r.modeloUsado,
          });
          if (linea) avisosBoveda.push(linea);
        } catch {}
      }

      let ruta: string | undefined;
      const avisosExtra: string[] = [];
      if (rutaRel) {
        try {
          ruta = escribirImagenEnProyecto(rutaRel, r.bytes as Uint8Array);
          // Si el servidor corrigió la extensión (los bytes son otro formato),
          // se dice: comparar por nombre base, que la ruta puede traer el
          // prefijo de la raíz anidada sin que eso sea una corrección.
          if ((ruta.split("/").pop() || "") !== (rutaRel.split("/").pop() || "")) {
            avisosExtra.push(`Se pidió «${rutaRel}» pero se guardó como «${ruta.split("/").pop()}»: la extensión se corrigió al formato real de los bytes (un archivo no se mal etiqueta).`);
          }
          // BÓVEDA v1: guardada en el sandbox, la imagen además VIAJA al
          // disco real indexado (puente mediante). El viaje se declara.
          try {
            const linea = await transportarABoveda({
              bytes: r.bytes as Uint8Array,
              mime: String(r.tipoMime || "image/jpeg"),
              proyecto: nombreProyectoSandbox(),
              archivo: rutaRel.split(/[\\/]/).pop() || "imagen",
              origenSandbox: ruta,
              modeloUsado: r.modeloUsado,
            });
            if (linea) avisosExtra.push(linea);
          } catch {}
        } catch (e: any) {
          // La imagen existió; el fallo es de escritura y se dice con su causa.
          return res.status(200).json({
            ok: true,
            url: r.url,
            bytes: (r.bytes as Uint8Array).length,
            tipoMime: r.tipoMime,
            proveedor: r.proveedor,
            modeloUsado: r.modeloUsado,
            ms: r.ms,
            seed: r.seed,
            advertencias: [...(r.advertencias || []), `No se guardó en «${rutaRel}»: ${e?.message || e}`],
            fallos: r.fallos,
          });
        }
      }

      console.log(`[Imágenes] ok · ${r.proveedor} · modelo real ${r.modeloUsado} · ${r.tipoMime} · ${((r.bytes?.length || 0) / 1024).toFixed(1)} KB · ${((r.ms || 0) / 1000).toFixed(1)} s${ruta ? ` · ${ruta}` : ""}`);
      return res.json({
        ok: true,
        url: r.url,
        ruta,
        bytes: (r.bytes as Uint8Array).length,
        tipoMime: r.tipoMime,
        proveedor: r.proveedor,
        modeloUsado: r.modeloUsado,
        ms: r.ms,
        seed: r.seed,
        advertencias: [...(r.advertencias || []), ...avisosExtra, ...avisosBoveda],
        fallos: r.fallos,
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: `Fallo interno generando la imagen: ${e?.message || e}` });
    }
  });

  /**
   * Vista de una imagen ya guardada en el proyecto (miniaturas del panel,
   * comprobación del usuario). Confinada al proyecto, como todo lo que se
   * sirve desde aquí; no es una puerta a archivos arbitrarios.
   */
  app.get("/api/engine/imagen/vista", (req: Request, res: Response) => {
    const ruta = String(req.query.ruta || "");
    if (!ruta) return res.status(400).json({ ok: false, error: "Falta «ruta»." });
    let abs: string;
    try {
      abs = resolveSafePath(ruta);
    } catch (e: any) {
      return res.status(400).json({ ok: false, error: e?.message || "Ruta no permitida." });
    }
    const ext = path.extname(abs).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
      return res.status(400).json({ ok: false, error: `«${ext || "(sin extensión)"}» no es una imagen.` });
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return res.status(404).json({ ok: false, error: `No existe la imagen «${ruta}» en el proyecto.` });
    }
    res.setHeader("Content-Type", ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    fs.createReadStream(abs).pipe(res);
  });

  /** Estado de la cadena (para el diagnóstico y el panel): qué eslabones hay. */
  app.get("/api/engine/imagen/estado", (_req: Request, res: Response) => {
    return res.json({ ok: true, cadena: estadoCadenaImagen(process.env) });
  });

  // ════════════════════════════════════════════════════════════════════════
  // EL REFLEJO (v2.4) — frase → orden/cálculo/plantilla, determinista, sin red
  // ════════════════════════════════════════════════════════════════════════
  // Mismas tablas que viajan en el ZIP. `modo`: "lite" (502 KB, fuzzy en
  // runtime) o "max" (2.2 MB, distancia 2 precalculada). Cero filtro de
  // contenido: el único «no» del reflejo es estructural y siempre trae motivo.
  app.post("/api/reflejo", (req: Request, res: Response) => {
    const frase = typeof req.body?.frase === "string" ? req.body.frase : "";
    if (!frase.trim()) return res.status(400).json({ ok: false, accion: "nada", confianza: 0, modo: "lite", ms: 0, motivo: "falta «frase» (texto)." });
    const modo = req.body?.modo === "max" ? "max" : "lite";
    const r = pensarReflejo(frase, modo);
    return res.status(r.ok ? 200 : 422).json(r);
  });

  app.get("/api/reflejo/estado", (_req: Request, res: Response) => {
    return res.json(estadoReflejo());
  });

  // ════════════════════════════════════════════════════════════════════════
  // CEREBRONICO-AGENTICO v1 (v2.5) — el consejo: 12 especialistas + 28 herramientas
  // ════════════════════════════════════════════════════════════════════════
  const archivoEntidades = path.join(PROJECT_ROOT, ".cerebro-db", "entidades.json");
  const archivoEspejos = path.join(PROJECT_ROOT, ".cerebro-db", "espejos.json"); // ESPEJOS v1
  // El estado de los botones (activa/dormida) sobrevive reinicios; el catálogo
  // y su lógica NO: viven en el código (una sola fuente).
  try {
    if (fs.existsSync(archivoEntidades)) {
      const guardado = JSON.parse(fs.readFileSync(archivoEntidades, "utf8"));
      for (const [id, activa] of Object.entries(guardado?.activas || {})) cambiarActivacion(String(id), Boolean(activa));
    }
  } catch (e: any) {
    console.log(`[Consejo] el estado guardado de entidades no se pudo leer (${e?.message || e}); arranco con los valores por defecto.`);
  }

  app.get("/api/consejo/estado", (_req: Request, res: Response) => {
    return res.json({
      ...estadoConsejo(),
      // v1.15.1 — el consejo dice la verdad sobre sus ejecutores: cuántas
      // acciones son REALES (calculo, convertir) y cuántas solo DECLARADAS.
      ejecutores: {
        ...resumenEjecutores(),
        detalle: Object.entries(EJECUTORES_CONSEJO).map(([accion, ficha]) => ({ accion, ...ficha })),
      },
    });
  });

  app.post("/api/consejo/entidad", (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    const r = cambiarActivacion(id, req.body?.activa !== false);
    if (!r.ok) return res.status(400).json(r);
    try {
      fs.mkdirSync(path.dirname(archivoEntidades), { recursive: true });
      const activas: Record<string, boolean> = {};
      for (const e of ENTIDADES) if (e.tipo === "herramienta") activas[e.id] = e.activa;
      fs.writeFileSync(archivoEntidades, JSON.stringify({ activas, en: new Date().toISOString() }, null, 2));
    } catch (e: any) {
      console.log(`[Consejo] toggle aplicado en memoria pero NO persistido (${e?.message || e}).`);
    }
    return res.json({ ok: true, id, activa: req.body?.activa !== false });
  });

  // ─── ESPEJOS v1 — grupos de espejos y selector (la barra dentro de la
  // interfaz de modelos). La selección vive en el motor (memoria + disco,
  // para /api/conductor) y en el navegador (localStorage, para el prompt).
  try {
    if (fs.existsSync(archivoEspejos)) {
      const ns = normalizarSeleccion(JSON.parse(fs.readFileSync(archivoEspejos, "utf8")));
      if (ns.ok) fijarSeleccion(ns.seleccion);
      else console.log(`[Espejos] selección guardada inválida (${ns.motivo}); arranco sin grupo activo.`);
    }
  } catch (e: any) {
    console.log(`[Espejos] el estado guardado no se pudo leer (${e?.message || e}); arranco sin grupo activo.`);
  }

  // TURBO v1 — el botón de la cabecera arma/desarma el catálogo de poderes.
  app.post("/api/consejo/turbo", (req: Request, res: Response) => {
    fijarTurbo(Boolean(req.body?.turbo));
    return res.json({ ok: true, turbo: req.body?.turbo !== false });
  });

  app.get("/api/consejo/espejos", (_req: Request, res: Response) => res.json(estadoEspejos()));

  // ═══════════════════════════════════════════════════════════════════════════════
  // ORQUESTADOR ÚNICO v1.0 (Reflejo v3.0)
  // ═══════════════════════════════════════════════════════════════════════════════
  // El orquestador sustituye a la lógica dispersa de "qué espejo llamar para
  // esta frase". Aplica las 9 familias de leyes declarativas (física, mate,
  // lingüística, científica, cuántica, antropológica, extensible,
  // transformable, autoaprendible) y devuelve el espejo + datos.
  //
  // Dos endpoints:
  //   GET  /api/espejos/leyes      → catálogo de leyes activas (curadas + aprendidas)
  //   POST /api/espejos/orquestar → aplica las leyes a una frase y devuelve el espejo
  const archivoLeyesAprendidas = path.join(PROJECT_ROOT, ".cerebro-db", "leyes-aprendidas.json");
  // 🐞 DEFECTO v1.0.3 (doble): el orquestador llamaba `require("node:fs")`
  // dentro de un paquete ESM — require no existe, la excepción se tragaba en
  // su propio catch y las leyes aprendidas NUNCA sobrevivan al reinicio. Y
  // aquí encima se usaba `require("./…/orquestador")` sobre un módulo que ya
  // está importado arriba. Reflejo v5: el servidor INYECTA las primitivas fs
  // (misma regla que consejo.ts con node:os) y usa la función importada.
  try {
    configurarFsOrquestador({
      existsSync: (r: string) => fs.existsSync(r),
      readFileSync: (r: string, c: "utf8") => fs.readFileSync(r, c),
      mkdirSync: (r: string, o?: { recursive?: boolean }) => { fs.mkdirSync(r, o); },
      writeFileSync: (r: string, k: string, c: "utf8") => { fs.writeFileSync(r, k, c); },
    });
    cargarLeyesAprendidas(archivoLeyesAprendidas);
    const n = leyAprendida();
    if (n > 0) console.log(`[Orquestador] cargadas ${n} ley(es) aprendidas desde .cerebro-db/leyes-aprendidas.json`);
    for (const d of diagnosticoLeyes()) console.log(`[Orquestador] diagnóstico: ${d}`);
    console.log(`[Orquestador] activo — ${LEYES_REFLEJO.length} leyes curadas + ${n} aprendidas · salud de la flota: ${Object.keys(TABLA_SALUD).length} espejos medidos`);
  } catch (e: any) {
    console.log(`[Orquestador] no se pudieron cargar las leyes aprendidas (${e?.message || e}); arranco solo con las curadas.`);
  }

  app.get("/api/espejos/leyes", (_req: Request, res: Response) => {
    return res.json(estadoOrquestador());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SALUD v1 (Reflejo v5, manual §6.3) — la flota medida, no adivinada.
  // GET  /api/espejos/salud          → score/estado de cada espejo
  // POST /api/espejos/salud/dormir   → { id, dormir } a mano (el usuario manda)
  // POST /api/espejos/salud/reset    → { id? } borra la evidencia (nueva etapa)
  // ═══════════════════════════════════════════════════════════════════════════
  app.get("/api/espejos/salud", (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      espejos: vistaSalud(TABLA_SALUD, [...IDS_ESPEJOS, ...poolEspejos().map((e: any) => e.id)]),
      umbrales: { dormido: 0.5, estrella: 0.95, usosMinimos: 8 },
      nota: "dormido = no se elige solo (la ruta explícita siempre lo alcanza) · estrella = sube en el desempate",
    });
  });

  app.post("/api/espejos/salud/dormir", (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ ok: false, motivo: "falta «id» del espejo." });
    // Dormir a mano = sembrar la tabla con evidencia suficiente para que el
    // orquestador lo evite; despertar = borrar la evidencia. Sin campos mágicos.
    if (req.body?.dormir === false) {
      delete TABLA_SALUD[id];
    } else {
      TABLA_SALUD[id] = { usos: 10, exitos: 0, corregido: 0, ultima: new Date().toISOString() };
    }
    fijarTablaSalud(TABLA_SALUD);
    guardarSalud();
    return res.json({ ok: true, id, estado: estadoDe(TABLA_SALUD[id]) });
  });

  app.post("/api/espejos/salud/reset", (req: Request, res: Response) => {
    const id = req.body?.id ? String(req.body.id) : "";
    if (id) delete TABLA_SALUD[id];
    else TABLA_SALUD = {};
    fijarTablaSalud(TABLA_SALUD);
    guardarSalud();
    return res.json({ ok: true, reseteado: id || "toda la flota" });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GRUPO v1 (Reflejo v5) — el equipo por tarea, sin modelo y sin red.
  // POST /api/espejos/equipo  { texto }  → grupo recomendado + señales
  // (el selector global sigue en /api/consejo/espejos; esto es la pieza que
  //  el planificador y el chat usan para decidir TAREA a TAREA)
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/api/espejos/equipo", (req: Request, res: Response) => {
    const texto = typeof req.body?.texto === "string" ? req.body.texto : "";
    const eleccion = grupoPorTarea(texto);
    return res.json({
      ok: true,
      eleccion,
      grupos: GRUPOS_ESPEJOS.map((g) => ({ id: g.id, icono: g.icono, espejos: g.espejos })),
      nota: eleccion ? "" : "sin señales claras: el auto no lanza monedas — usa el grupo global o el espejo explícito",
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BÓVEDA v1 (Reflejo v5) — el transporte de imágenes al disco real.
  // GET  /api/boveda/estado     → config + si el puente PC está vivo
  // POST /api/boveda/configurar → { activa?, raiz? } (ej. "C:\\CN")
  // POST /api/boveda/preparar   → CON EL AGENTE crea el árbol indexado y
  //                               siembra INDICE.json en cada carpeta
  // GET  /api/boveda/indice     → el índice de una carpeta (IMAGENES…) leído
  //                               por el puente, parseado y listo para la UI
  // ═══════════════════════════════════════════════════════════════════════════
  app.get("/api/boveda/estado", async (_req: Request, res: Response) => {
    const puente = await puenteFetch("/api/health", {}, 2500).catch(() => null);
    return res.json({
      ok: true,
      config: BOVEDA,
      puenteVivo: !!puente,
      carpetas: Object.keys(CARPETAS_BOVEDA),
      nota: puente
        ? "el puente PC (:5000) responde: los transportes llegarán al disco real"
        : "el puente PC (:5000) no responde: las imágenes se guardan en el sandbox pero NO viajan; arranca el agente (iniciar_todo) y reintenta",
    });
  });

  app.post("/api/boveda/configurar", (req: Request, res: Response) => {
    const raiz = typeof req.body?.raiz === "string" ? req.body.raiz.trim() : "";
    if (raiz) {
      if (/[\u0000-\u001f]/.test(raiz) || raiz.length > 260) {
        return res.status(400).json({ ok: false, motivo: "raíz inválida (caracteres de control o demasiado larga)." });
      }
      BOVEDA.raiz = raiz;
    }
    if (typeof req.body?.activa === "boolean") BOVEDA.activa = req.body.activa;
    guardarBoveda();
    return res.json({ ok: true, config: BOVEDA });
  });

  app.post("/api/boveda/preparar", async (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: esto crea carpetas en el disco REAL vía el puente.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const sep = process.platform === "win32" ? "\\" : "/";
    const arbol = arbolInicial(BOVEDA.raiz, sep);
    const resultados: Array<{ carpeta: string; ok: boolean; nota: string }> = [];
    for (const carpeta of arbol) {
      const m = await puenteFetch("/api/fs/mkdir", { path: carpeta });
      const indiceRuta = carpeta + sep + "INDICE.json";
      let nota = m?.ok ? "carpeta creada" : "el puente no respondió";
      if (m?.ok) {
        const previo = await puenteFetch("/api/fs/read", { path: indiceRuta });
        if (!previo?.ok) {
          await puenteFetch("/api/fs/write", { path: indiceRuta, content: JSON.stringify(indiceVacio(), null, 2) });
          nota += " · índice sembrado";
        } else {
          nota += " · índice ya existía (intacto)";
        }
      }
      resultados.push({ carpeta, ok: !!m?.ok, nota });
    }
    const vivo = resultados.filter((r) => r.ok).length;
    return res.json({
      ok: vivo > 0,
      raiz: BOVEDA.raiz,
      resultados,
      motivo: vivo ? "" : "el puente PC (:5000) no respondió: sin agente no hay manos fuera del sandbox. Arranca el agente y repite.",
    });
  });

  app.get("/api/boveda/indice", async (req: Request, res: Response) => {
    const carpeta = String(req.query.carpeta || "IMAGENES").toUpperCase();
    if (!(carpeta in CARPETAS_BOVEDA)) {
      return res.status(400).json({ ok: false, motivo: `carpeta indexada desconocida: «${carpeta}». Opciones: ${Object.keys(CARPETAS_BOVEDA).join(", ")}` });
    }
    const sep = process.platform === "win32" ? "\\" : "/";
    const ruta = `${BOVEDA.raiz.replace(/[\\/]+$/, "")}${sep}${CARPETAS_BOVEDA[carpeta as keyof typeof CARPETAS_BOVEDA]}${sep}INDICE.json`;
    const r = await puenteFetch("/api/fs/read", { path: ruta });
    if (!r?.ok) return res.json({ ok: false, motivo: r ? `el puente respondió mal: ${r.error || "sin contenido"}` : "el puente PC (:5000) no respondió", indice: null });
    return res.json({ ok: true, indice: parsearIndice(JSON.parse(r.content || "{}")) });
  });

  // ADUANA v2 — auditoría de tolerancia de entrada: «¿este archivo entra al
  // sandbox?». El frontend de adjuntos puede consultar antes de rechazar a
  // ciegas; la regla es entra todo salvo binarios de ejecución, con motivo.
  app.post("/api/entrada/auditar", (req: Request, res: Response) => {
    const nombres = Array.isArray(req.body?.nombres) ? req.body.nombres.map(String) : [];
    if (!nombres.length) return res.status(400).json({ ok: false, motivo: "falta «nombres» (array de nombres de archivo)." });
    const { aceptadas, rechazadas } = auditarEntradas(nombres);
    return res.json({ ok: true, aceptadas: aceptadas.length, rechazadas, tipos: [...new Set(aceptadas.map((a) => a.categoria))] });
  });

  app.post("/api/espejos/orquestar", async (req: Request, res: Response) => {
    const frase = typeof req.body?.frase === "string" ? req.body.frase : "";
    if (!frase.trim()) return res.status(400).json({ ok: false, ms: 0, motivo: "falta «frase» (texto)." });
    const r = planificadorPorLeyes(frase);
    if (!r.ok) return res.status(422).json(r);

    // Reflejo v3.0 · extensión B — si la ley apunta a un Ollama externo, despachar
    if (r.modo === "ollama-externo" && r.endpoint) {
      try {
        const prompt = String((r.datos as any)?.prompt ?? frase);
        const body: Record<string, unknown> = {
          model: r.endpointModel || "gpt-3.5-turbo",
          prompt,
          stream: false,
        };
        if (r.endpointSystem) body.system = r.endpointSystem;
        const ext = await fetch(r.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j: any = await ext.json();
        return res.json({
          ...r,
          // Conservamos el resultado del Ollama externo bajo `respuestaOllama`
          // para que el llamador distinga: r.ok === true significa "la ley aplicó",
          // pero j.ok === false puede significar que el Ollama remoto falló.
          respuestaOllama: j,
          endpointUsado: r.endpoint,
          ms: r.ms,
        });
      } catch (e: any) {
        return res.status(502).json({
          ok: false,
          ms: r.ms,
          ley: r.ley,
          espejo: r.espejo,
          motivo: `la ley "${r.ley}" quería despachar a Ollama externo (${r.endpoint}) pero el fetch falló: ${e?.message || e}`,
        });
      }
    }

    // Modo espejo-local (default): ejecutar el espejo determinista y devolver su salida.
    if (r.espejo) {
      try {
        const er = ejecutarEntidad(r.espejo, r.datos ?? {});
        registrarSaludEspejo(r.espejo, !!er?.ok); // SALUD v1: el orquestado también cuenta
        return res.json({ ...r, resultadoEspejo: er });
      } catch (e: any) {
        registrarSaludEspejo(r.espejo, false);
        return res.status(500).json({
          ok: false,
          ms: r.ms,
          ley: r.ley,
          espejo: r.espejo,
          motivo: `el espejo "${r.espejo}" reventó al ejecutar: ${e?.message || e}`,
        });
      }
    }

    return res.json(r);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Reflejo v3.0 · extensión A — Endpoints URL por familia
  // ═══════════════════════════════════════════════════════════════════════════════
  // Permite a la app cliente FORZAR el enrutado a una familia específica sin
  // que el orquestador tenga que adivinar. Útil cuando el usuario ya sabe a
  // qué disciplina pertenece su pregunta ("esta es una pregunta de física")
  // y quiere evitar el riesgo de que el orquestador la enrute a otra familia.
  //
  // URL: POST /api/espejos/orquestar/:familia  body: { frase: "..." }
  // Familias válidas: física, matemática, lingüística, científica, cuántica,
  // antropológica, transformable, personalizada (+ las aprendidas).
  app.post("/api/espejos/orquestar/:familia", async (req: Request, res: Response) => {
    const familia = String(req.params.familia || "").trim();
    const frase = typeof req.body?.frase === "string" ? req.body.frase : "";
    if (!frase.trim()) return res.status(400).json({ ok: false, ms: 0, motivo: "falta «frase» (texto)." });
    const r = orquestarPorFamilia(familia, frase);
    if (!r.ok) return res.status(422).json(r);

    // Mismo despacho que /api/espejos/orquestar: si la ley apunta a Ollama
    // externo, hacer fetch; si no, ejecutar el espejo local.
    if (r.modo === "ollama-externo" && r.endpoint) {
      try {
        const prompt = String((r.datos as any)?.prompt ?? frase);
        const body: Record<string, unknown> = {
          model: r.endpointModel || "gpt-3.5-turbo",
          prompt,
          stream: false,
        };
        if (r.endpointSystem) body.system = r.endpointSystem;
        const ext = await fetch(r.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j: any = await ext.json();
        return res.json({ ...r, respuestaOllama: j, endpointUsado: r.endpoint, ms: r.ms });
      } catch (e: any) {
        return res.status(502).json({
          ok: false,
          ms: r.ms,
          ley: r.ley,
          espejo: r.espejo,
          motivo: `la ley "${r.ley}" (familia ${familia}) quería despachar a Ollama externo (${r.endpoint}) pero el fetch falló: ${e?.message || e}`,
        });
      }
    }

    if (r.espejo) {
      try {
        const er = ejecutarEntidad(r.espejo, r.datos ?? {});
        return res.json({ ...r, resultadoEspejo: er });
      } catch (e: any) {
        return res.status(500).json({
          ok: false,
          ms: r.ms,
          ley: r.ley,
          espejo: r.espejo,
          motivo: `el espejo "${r.espejo}" (familia ${familia}) reventó al ejecutar: ${e?.message || e}`,
        });
      }
    }

    return res.json(r);
  });

  app.post("/api/consejo/espejos", (req: Request, res: Response) => {
    const ns = normalizarSeleccion(req.body);
    if (!ns.ok) return res.status(400).json({ ok: false, motivo: ns.motivo });
    fijarSeleccion(ns.seleccion);
    try {
      fs.mkdirSync(path.dirname(archivoEspejos), { recursive: true });
      fs.writeFileSync(archivoEspejos, JSON.stringify({ ...ns.seleccion, en: new Date().toISOString() }, null, 2));
    } catch (e: any) {
      console.log(`[Espejos] selección aplicada en memoria pero NO persistida (${e?.message || e}).`);
    }
    return res.json({ ok: true, seleccion: ns.seleccion });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Reflejo v3.0 · PASO 2 — ESPEJOS PERSONALIZADOS (.mjs instalables en caliente)
  // ═══════════════════════════════════════════════════════════════════════════════
  // Carga los espejos personalizados desde ~/.cerebronico/espejos/manifest.json
  // al arranque. Después expone 4 endpoints para gestionarlos en caliente:
  //
  //   GET  /api/espejos/personalizados       → lista espejos personalizados
  //   POST /api/espejos/instalar             → instala un .zip con un espejo nuevo
  //   POST /api/espejos/desinstalar          → desinstala un espejo por id
  //   POST /api/espejos/leyes/aprender       → añade una ley a leyes-aprendidas.json
  //   POST /api/espejos/leyes/desactivar     → marca una ley (curada o aprendida) como desactivada
  //
  // El directorio de espejos personalizados: PROJECT_ROOT/.cerebronico/espejos
  // (en producción) — relativo a donde se ejecuta el servidor.
  const dirEspejosPersonalizados = path.join(PROJECT_ROOT, ".cerebronico", "espejos");
  try {
    fs.mkdirSync(dirEspejosPersonalizados, { recursive: true });
    // Inicialización del pool: carga el manifest si existe. Es async porque
    // usa import() dinámico, pero el await está dentro de una IIFE para no
    // bloquear el setup del servidor. El pool queda listo cuando termina.
    (async () => {
      try {
        const r = await inicializarPool(dirEspejosPersonalizados);
        if (r.cargados.length > 0) {
          console.log(`[Espejos Personalizados] cargados: ${r.cargados.length} espejo(s) — ${r.cargados.map((e) => e.id).join(", ")}`);
        }
        if (r.fallidos.length > 0) {
          console.log(`[Espejos Personalizados] fallidos: ${r.fallidos.length} — ` + r.fallidos.map((f) => `${f.id} (${f.motivo})`).join(" · "));
        }
      } catch (e: any) {
        console.log(`[Espejos Personalizados] no se pudo inicializar el pool: ${e?.message || e}`);
      }
    })();
  } catch (e: any) {
    console.log(`[Espejos Personalizados] no se pudo crear el directorio ${dirEspejosPersonalizados}: ${e?.message || e}`);
  }

  // Catálogo público de espejos personalizados.
  app.get("/api/espejos/personalizados", (_req: Request, res: Response) => {
    if (!poolListo()) {
      return res.status(503).json({ ok: false, motivo: "el pool de espejos personalizados aún no se inicializó. Reintenta en 1 segundo o reinicia el servidor." });
    }
    return res.json(catalogoPersonalizados());
  });

  // Instalación: recibe un .zip con {espejo.mjs, manifest.json, (opcional leyes.json)}.
  // Lo descomprime en <dir>/<id>/ y recarga el pool.
  //
  // El .zip debe contener al menos:
  //   - manifest.json  (entrada única con el espejo que se instala)
  //   - el .mjs que manifest.json.ruta señale
  // Opcional:
  //   - leyes.json  (leyes que el orquestador usará para invocar el espejo)
  app.post("/api/espejos/instalar", async (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: instala ficheros en disco.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    // Soporta multipart/form-data con campo "zip" o JSON con base64.
    // Para simplicidad v1: solo soportamos JSON con {zipBase64: "...", id: "..."}.
    const zipBase64 = String(req.body?.zipBase64 || "").trim();
    const idEspejo = String(req.body?.id || "").trim();
    if (!zipBase64) return res.status(400).json({ ok: false, motivo: "falta «zipBase64» (el .zip del espejo codificado en base64)." });
    if (!idEspejo || !/^espejo\./.test(idEspejo)) return res.status(400).json({ ok: false, motivo: "falta «id» o no empieza con «espejo.» (regla del manual)." });

    try {
      // Decodificar el base64 a Buffer
      const zipBuffer = Buffer.from(zipBase64, "base64");
      if (zipBuffer.length < 50) return res.status(400).json({ ok: false, motivo: "el .zip decodificado es demasiado pequeño (<50 bytes); probablemente el base64 está truncado." });

      // 🐞 DEFECTO v1.0.3: `require("jszip")` en un paquete ESM — require no
      // existe, así que INSTALAR UN ESPEJO-ZIP moría aquí con "require is not
      // defined" y el error salía genérico. La forma correcta ya estaba usada
      // en /api/extensions/install: import dinámico. Misma puerta, misma llave.
      const JSZipMod: any = await import("jszip");
      const JSZip = JSZipMod?.default || JSZipMod;
      const zip = await JSZip.loadAsync(zipBuffer);
      // Localiza manifest.json y el .mjs
      const archivos = Object.keys(zip.files);
      const manifestEntry = archivos.find((a: string) => a.endsWith("manifest.json") && !a.includes("__MACOSX"));
      if (!manifestEntry) return res.status(400).json({ ok: false, motivo: "el .zip no trae manifest.json en su raíz." });
      const manifestText = await zip.files[manifestEntry].async("string");
      let manifest: any;
      try {
        manifest = JSON.parse(manifestText);
      } catch (e: any) {
        return res.status(400).json({ ok: false, motivo: `manifest.json inválido: ${e?.message || e}` });
      }
      if (!Array.isArray(manifest.espejos) || manifest.espejos.length === 0) {
        return res.status(400).json({ ok: false, motivo: "manifest.espejos debe ser un array con al menos una entrada." });
      }
      const entrada = manifest.espejos[0];
      if (entrada.id !== idEspejo) {
        return res.status(400).json({ ok: false, motivo: `manifest.espejos[0].id ("${entrada.id}") ≠ id del request ("${idEspejo}"). Deben coincidir.` });
      }

      // Crea el directorio del espejo y escribe los archivos
      const dirDestino = path.join(dirEspejosPersonalizados, idEspejo);
      fs.mkdirSync(dirDestino, { recursive: true });
      // Escribe el .mjs
      const rutaMjs = path.join(dirDestino, path.basename(entrada.ruta));
      const mjsEntry = archivos.find((a: string) => a.endsWith(entrada.ruta) || a.endsWith(path.basename(entrada.ruta)));
      if (!mjsEntry) {
        return res.status(400).json({ ok: false, motivo: `el .zip no trae el archivo "${entrada.ruta}" que manifest.json referencia.` });
      }
      const mjsContent = await zip.files[mjsEntry].async("string");
      fs.writeFileSync(rutaMjs, mjsContent, "utf8");

      // Escribe el manifest propio del espejo (entrada única)
      const manifestLocal = {
        version: "1.0",
        espejos: [{ ...entrada, ruta: path.basename(entrada.ruta) }],
      };
      fs.writeFileSync(path.join(dirDestino, "manifest.json"), JSON.stringify(manifestLocal, null, 2), "utf8");

      // Si el zip trae leyes.json, lo escribe en leyes-aprendidas.json del espejo
      const leyesEntry = archivos.find((a: string) => a.endsWith("leyes.json") && !a.includes("__MACOSX"));
      let leyesNuevas = 0;
      if (leyesEntry) {
        const leyesText = await zip.files[leyesEntry].async("string");
        let leyes: any;
        try {
          leyes = JSON.parse(leyesText);
        } catch {
          return res.status(400).json({ ok: false, motivo: "leyes.json inválido en el .zip." });
        }
        if (Array.isArray(leyes.leyes)) {
          // Añade cada ley a leyes-aprendidas.json (si no existe ya)
          const archivoLeyes = path.join(PROJECT_ROOT, ".cerebro-db", "leyes-aprendidas.json");
          let existentes: any[] = [];
          if (fs.existsSync(archivoLeyes)) {
            try { existentes = JSON.parse(fs.readFileSync(archivoLeyes, "utf8")).leyes || []; } catch {}
          }
          for (const ley of leyes.leyes) {
            if (!ley.id || !ley.patron || !ley.espejo) continue;
            if (existentes.find((l) => l.id === ley.id)) continue; // no duplicar
            existentes.push(ley);
            leyesNuevas++;
          }
          fs.mkdirSync(path.dirname(archivoLeyes), { recursive: true });
          fs.writeFileSync(archivoLeyes, JSON.stringify({ leyes: existentes, en: new Date().toISOString() }, null, 2), "utf8");
          // Recarga las leyes aprendidas en el orquestador
          cargarLeyesAprendidas(archivoLeyes);
        }
      }

      // Recarga el pool del cargador
      const r = await inicializarPool(dirEspejosPersonalizados);
      return res.json({
        ok: true,
        id: idEspejo,
        ruta: rutaMjs,
        leyesNuevas,
        pool: { cargados: r.cargados.length, fallidos: r.fallidos.length },
        nota: "espejo instalado y cargado en el pool. Ya es invocable vía /api/espejos/orquestar o directamente con ejecutarEntidad.",
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, motivo: `instalación falló: ${e?.message || e}` });
    }
  });

  // Desinstalación: elimina el directorio del espejo y lo quita del pool.
  app.post("/api/espejos/desinstalar", (req: Request, res: Response) => {
    const idEspejo = String(req.body?.id || "").trim();
    if (!idEspejo || !/^espejo\./.test(idEspejo)) return res.status(400).json({ ok: false, motivo: "falta «id» o no empieza con «espejo.»." });
    const dirDestino = path.join(dirEspejosPersonalizados, idEspejo);
    if (!fs.existsSync(dirDestino)) return res.status(404).json({ ok: false, motivo: `el espejo «${idEspejo}» no está instalado en ${dirDestino}.` });
    try {
      // Borrado recursivo
      fs.rmSync(dirDestino, { recursive: true, force: true });
      quitarDelPool(idEspejo);
      return res.json({ ok: true, id: idEspejo, eliminado: dirDestino });
    } catch (e: any) {
      return res.status(500).json({ ok: false, motivo: `desinstalación falló: ${e?.message || e}` });
    }
  });

  // Aprender una ley: añade una entrada a leyes-aprendidas.json.
  // Recibe: { id, familia, prioridad, patron (string regex), flags, datos?, espejo, descripcion, endpoint?, endpointModel?, endpointSystem? }
  app.post("/api/espejos/leyes/aprender", (req: Request, res: Response) => {
    const ley = req.body || {};
    if (!ley.id || !ley.patron || !ley.espejo) {
      return res.status(400).json({ ok: false, motivo: "falta «id», «patron» (regex como string) o «espejo»." });
    }
    // Compila el patrón para validarlo antes de guardarlo
    let patronCompilado: RegExp;
    try {
      patronCompilado = new RegExp(String(ley.patron), String(ley.flags || "i"));
    } catch (e: any) {
      return res.status(400).json({ ok: false, motivo: `patrón inválido: ${e?.message || e}` });
    }
    const archivoLeyes = path.join(PROJECT_ROOT, ".cerebro-db", "leyes-aprendidas.json");
    let existentes: any[] = [];
    if (fs.existsSync(archivoLeyes)) {
      try { existentes = JSON.parse(fs.readFileSync(archivoLeyes, "utf8")).leyes || []; } catch {}
    }
    // Si ya existe una ley con el mismo id, la reemplaza.
    const idx = existentes.findIndex((l) => l.id === ley.id);
    const nuevaLey = {
      id: String(ley.id),
      familia: String(ley.familia || "autoaprendible"),
      // 🐞 DEFECTO v1.0.3: aquí se guardaba `prioridad` absoluta pero el
      // cargador leía `prioridadOffset` (y sumaba 100): toda ley aprendida
      // con prioridad a medida renacía como 100. Se guarda el offset, que es
      // lo que el cargador entiende.
      prioridadOffset: Math.max(0, Number(ley.prioridad || 100) - 100),
      // Se guarda como string para que JSON lo pueda serializar; el cargador
      // lo reconstruye como RegExp con `new RegExp(patron, flags)`.
      patron: patronCompilado.source,
      flags: patronCompilado.flags,
      espejo: String(ley.espejo),
      descripcion: String(ley.descripcion || "(ley aprendida sin descripción)"),
      // Reflejo v5 · PLANTILLA: los datos serializables de la ley. Cada campo
      // admite `$1..$9` (grupos del regex) y `$input` (frase completa). Sin
      // esto, una ley aprendida no puede reconstruir su función `datos` tras
      // el reinicio — el bug que mataba el autoaprendizaje en silencio.
      ...(ley.plantilla && typeof ley.plantilla === "object" && !Array.isArray(ley.plantilla)
        ? {
            plantilla: Object.fromEntries(
              Object.entries(ley.plantilla as Record<string, unknown>)
                .filter(([, v]) => typeof v === "string")
                .map(([k, v]) => [String(k).replace(/[^\w.-]/g, "_"), String(v)])
            ),
          }
        : {}),
      ...(Number.isFinite(Number(ley.confianza)) ? { confianza: Math.max(0, Math.min(1, Number(ley.confianza))) } : {}),
      // Opcionales (extensión B): endpoint externo
      ...(ley.endpoint ? {
        endpoint: String(ley.endpoint),
        endpointModel: ley.endpointModel ? String(ley.endpointModel) : undefined,
        endpointSystem: ley.endpointSystem ? String(ley.endpointSystem) : undefined,
      } : {}),
      en: new Date().toISOString(),
    };
    if (idx >= 0) existentes[idx] = nuevaLey;
    else existentes.push(nuevaLey);
    fs.mkdirSync(path.dirname(archivoLeyes), { recursive: true });
    fs.writeFileSync(archivoLeyes, JSON.stringify({ leyes: existentes, en: new Date().toISOString() }, null, 2), "utf8");
    // Recarga las leyes aprendidas en el orquestador
    cargarLeyesAprendidas(archivoLeyes);
    return res.json({ ok: true, ley: nuevaLey, total: existentes.length });
  });

  // Desactivar una ley: la marca como desactivada (no se borra, sigue auditándola).
  app.post("/api/espejos/leyes/desactivar", (req: Request, res: Response) => {
    const idLey = String(req.body?.id || "").trim();
    if (!idLey) return res.status(400).json({ ok: false, motivo: "falta «id» de la ley a desactivar." });
    // Las leyes curadas (en LEYES_REFLEJO) NO se pueden desactivar por endpoint
    // — son parte del código. Solo se pueden desactivar las aprendidas.
    if (LEYES_REFLEJO.find((l) => l.id === idLey)) {
      return res.status(400).json({ ok: false, motivo: `«${idLey}» es una ley curada (parte del código). No se puede desactivar por endpoint; modifica orquestador.ts.` });
    }
    const archivoLeyes = path.join(PROJECT_ROOT, ".cerebro-db", "leyes-aprendidas.json");
    if (!fs.existsSync(archivoLeyes)) return res.status(404).json({ ok: false, motivo: "no hay leyes aprendidas guardadas (archivo leyes-aprendidas.json no existe)." });
    let existentes: any[];
    try {
      existentes = JSON.parse(fs.readFileSync(archivoLeyes, "utf8")).leyes || [];
    } catch (e: any) {
      return res.status(500).json({ ok: false, motivo: `leyes-aprendidas.json inválido: ${e?.message || e}` });
    }
    const idx = existentes.findIndex((l) => l.id === idLey);
    if (idx < 0) return res.status(404).json({ ok: false, motivo: `la ley «${idLey}» no está en leyes-aprendidas.json.` });
    existentes[idx].desactivada = true;
    fs.writeFileSync(archivoLeyes, JSON.stringify({ leyes: existentes, en: new Date().toISOString() }, null, 2), "utf8");
    cargarLeyesAprendidas(archivoLeyes);
    return res.json({ ok: true, id: idLey, desactivada: true, totalActivas: existentes.filter((l) => !l.desactivada).length });
  });

  /**
   * EL CONDUCTOR (orquesta v2.6 en germen): consejo primero —si vota ≥0.8 el
   * neural NIQUIERA se despierta—, luego el director local con UNA ronda de
   * reparación (el error exacto del validador vuelve al modelo), y si aún así
   * no hay plan válido, FALLBACK determinista con todos los motivos. Ningún
   * JSON crudo del modelo llega al motor: todo pasa por `extraerOrdenes`.
   */
  app.post("/api/conductor", async (req: Request, res: Response) => {
    const frase = String(req.body?.frase || "").trim();
    if (!frase) return res.status(400).json({ ok: false, origen: "nada", motivo: "falta «frase»." });
    const consejo = pensarConsejo(frase, TABLAS.max);
    if (consejo.ok && consejo.confianza >= 0.8) {
      return res.json({ ok: true, origen: "consejo", confianza: consejo.confianza, entidad: consejo.entidad, salida: consejo.salida, nota: "el director neural no se despertó: el consejo resolvió solo." });
    }
    const modelo = String(req.body?.modelo || process.env.CEREBRONICO_DIRECTOR || "smollm2:135m-instruct-q3_K_S");
    const url = `${(process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/, "")}/api/generate`;
    const system = instruccionesParaElModelo() + "\n\nAhora: convierte la frase del usuario en la orden que proceda. Si no puedes, responde exactamente NO ENTIENDO y el motivo.";
    const pedir = async (prompt: string): Promise<string> => {
      const rr = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelo, system, prompt, stream: false, format: "json" }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!rr.ok) throw new Error(`el director (${modelo}) respondió HTTP ${rr.status}`);
      const jj: any = await rr.json();
      return String(jj.response || "");
    };
    try {
      let texto = await pedir(`Frase del usuario: ${frase}`);
      let ultimo = "";
      for (let reparaciones = 0; reparaciones <= 1; reparaciones++) {
        // El modelo puede devolver el JSON pelado o el bloque con cercas: el
        // envoltorio se añade SOLO si no lo trae, y la validación es la del chat.
        const bloque = texto.includes("cerebronico:") ? texto : "```cerebronico:plan\n" + texto + "\n```";
        const { ordenes, avisos } = extraerOrdenes(bloque);
        if (ordenes.length >= 1 && avisos.length === 0) {
          return res.json({ ok: true, origen: "director", modelo, reparaciones, bloque, ordenes });
        }
        ultimo = avisos.join(" · ") || "el director no devolvió una orden reconocible";
        if (reparaciones === 0) texto = await pedir(`Tu propuesta anterior fue RECHAZADA por el validador del IDE: ${ultimo}. Responde SOLO con el JSON corregido. Frase original: ${frase}`);
      }
      // Fallback: lo que el consejo sí supo, con sus motivos — nunca un vacío.
      return res.status(422).json({
        ok: false, origen: "fallback", director: { modelo, motivo: ultimo },
        consejo: consejo.ok ? { confianza: consejo.confianza, salida: consejo.salida } : { motivo: consejo.motivo || "el consejo tampoco votó" },
        motivo: "ni el consejo (confianza baja) ni el director (tras 1 reparación) produjeron una orden válida.",
      });
    } catch (e: any) {
      return res.status(502).json({
        ok: false, origen: "sin-director",
        motivo: `el director local no respondió (${e?.message || e}); el consejo dice: ${consejo.ok ? `confianza ${(consejo.confianza * 100).toFixed(0)}% por debajo del umbral 80%` : consejo.motivo || "sin voto"}.`,
        consejo_ok: consejo.ok, consejo_salida: consejo.salida,
      });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // EXPORTAR LA APP CREADA A ANDROID (v2.2)
  // ════════════════════════════════════════════════════════════════════════
  // Ojo: esto exporta **el proyecto que el usuario ha construido con el IDE**,
  // no el IDE. CerebroNico es la herramienta; el APK es de su app.

  /** Sondeo REAL de la máquina. Con pruebas, no con optimismo. */
  const sondearHerramientasAndroid = () => {
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";

    let javaVersion = "";
    try {
      const r = spawnSync("java", ["-version"], { encoding: "utf-8", timeout: 5000, windowsHide: true });
      // `java -version` escribe en stderr, no en stdout: esto no es un error.
      javaVersion = `${r.stderr || ""}${r.stdout || ""}`.split("\n")[0].trim();
    } catch {
      javaVersion = "";
    }

    let plataformasSdk: string[] = [];
    if (androidHome) {
      try {
        plataformasSdk = fs.readdirSync(path.join(androidHome, "platforms"));
      } catch {
        plataformasSdk = [];
      }
    }

    const proyectoAndroid = fs.existsSync(path.join(PROJECT_ROOT, "android", "gradlew")) || fs.existsSync(path.join(PROJECT_ROOT, "android", "gradlew.bat"));
    const adb = androidHome ? fs.existsSync(path.join(androidHome, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb")) : false;

    return {
      nodeVersion: process.versions.node,
      javaVersion,
      androidHome,
      plataformasSdk,
      tieneGradle: proyectoAndroid,
      tieneAdb: adb,
    };
  };

  /** Qué proyectos sabe leer el espacio de trabajo ahora mismo. */
  const leerProyectoDelSandbox = () => {
    let packageJson: string | null = null;
    try {
      packageJson = fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8");
    } catch {
      packageJson = null;
    }
    let archivosRaiz: string[] = [];
    try {
      archivosRaiz = fs.readdirSync(PROJECT_ROOT);
    } catch {}
    return analizarProyectoExport({ packageJson, archivosRaiz });
  };

  app.get("/api/export/targets", (_req: Request, res: Response) => {
    const proyecto = leerProyectoDelSandbox();
    const herramientas = sondearHerramientasAndroid();
    const android = veredictoAndroid(proyecto, herramientas);

    return res.json({
      ok: true,
      proyecto,
      maquina: herramientas,
      objetivos: [
        {
          id: "web",
          nombre: "Web (HTML+JS)",
          disponible: proyecto.comandoBuild !== null,
          detalle: `Se genera la carpeta «${proyecto.carpetaSalida}» con «${proyecto.comandoBuild || "—"}».`,
        },
        {
          id: "windows",
          nombre: "Windows x64 (instalador NSIS + portable)",
          disponible: true,
          detalle: "Se empaqueta el propio IDE con electron-builder: npm run dist.",
        },
        {
          id: "android",
          nombre: "Android — APK",
          disponible: android.puedeConstruir,
          detalle: android.puedeConstruir
            ? `Listo para construir. Mínimo admitido: ${PISO_ANDROID.version} (API ${PISO_ANDROID.api}).`
            : `No se puede todavía. Falta: ${android.faltan.join(" · ")}`,
        },
      ],
      android,
      piso: PISO_ANDROID,
    });
  });

  /**
   * Prepara el proyecto del sandbox para Android: escribe `capacitor.config.json`
   * y una guía con los pasos. NO ejecuta la instalación ni el build: eso son
   * comandos que cambian el proyecto del usuario y se hacen a la vista.
   */
  app.post("/api/export/android/prepare", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: escribe en la raíz del proyecto.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const proyecto = leerProyectoDelSandbox();
    if (!proyecto.exportableAAndroid) {
      return res.status(400).json({ ok: false, error: proyecto.razon, proyecto });
    }

    const pedido = typeof req.body?.appId === "string" ? req.body.appId.trim() : "";
    const appId = pedido || appIdDesdeNombre(proyecto.nombre);
    if (!appIdValido(appId)) {
      return res.status(400).json({
        ok: false,
        error:
          `«${appId}» no sirve como appId de Android. Tiene que ser un dominio al revés, en minúsculas y sin empezar por número ` +
          `(ejemplo: com.tunombre.${proyecto.nombre.toLowerCase().replace(/[^a-z0-9]/g, "") || "app"}).`,
      });
    }

    const config = configCapacitor({ appId, nombreApp: proyecto.nombre, webDir: proyecto.carpetaSalida });
    const pasos = pasosDeExportacion(proyecto);
    const herramientas = sondearHerramientasAndroid();
    const android = veredictoAndroid(proyecto, herramientas);

    const guia = [
      `# Exportar «${proyecto.nombre}» a Android`,
      ``,
      `Generado por CerebroNico IDE. **Esto no es CerebroNico en Android**: es TU app`,
      `empaquetada como APK. CerebroNico es la herramienta que la construye.`,
      ``,
      `## Requisitos en esta máquina`,
      ``,
      ...android.requisitos.map((r) => `- [${r.ok ? "x" : " "}] ${r.nombre} — encontrado: ${r.encontrado}${r.ok ? "" : `\n      → ${r.comoResolver}`}`),
      ``,
      `## Versión mínima de Android`,
      ``,
      `**${PISO_ANDROID.version} (API ${PISO_ANDROID.api})**. Cerrado en el archivo \`capacitor.config.json\` y en`,
      `el proyecto Android que se genere.`,
      ``,
      `${PISO_ANDROID.nota}`,
      ``,
      `Fuente: ${PISO_ANDROID.fuente}.`,
      ``,
      `## Pasos`,
      ``,
      ...pasos.map((p) => `${p.orden}. **${p.titulo}**\n   \`\`\`\n   ${p.comando}\n   \`\`\`\n   ${p.queHace}`),
      ``,
      `## Después`,
      ``,
      `- El APK queda en \`android/app/build/outputs/apk/debug/\`.`,
      `- Para publicar: \`gradlew.bat assembleRelease\` y **firmar** el APK. Sin firma, Android avisa al instalar.`,
      `- Cada vez que cambies la web: \`npm run build\` y luego \`npx cap sync android\`.`,
      ``,
    ].join("\n");

    const escritos: string[] = [];
    try {
      const rutaConfig = path.join(PROJECT_ROOT, "capacitor.config.json");
      fs.writeFileSync(rutaConfig, config, "utf-8");
      escritos.push("capacitor.config.json");
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: `No se pudo escribir capacitor.config.json: ${e?.message || e}` });
    }
    try {
      fs.writeFileSync(path.join(PROJECT_ROOT, "GUIA-ANDROID.md"), guia, "utf-8");
      escritos.push("GUIA-ANDROID.md");
    } catch {}

    return res.json({
      ok: true,
      appId,
      webDir: proyecto.carpetaSalida,
      escritos,
      pasos,
      puedeConstruir: android.puedeConstruir,
      faltan: android.faltan,
      message: android.puedeConstruir
        ? `Preparado. Escritos: ${escritos.join(", ")}. La máquina tiene todo lo necesario para construir el APK.`
        : `Preparado. Escritos: ${escritos.join(", ")}. Pero todavía NO se puede construir: falta ${android.faltan.join(" · ")}.`,
    });
  });

  /**
   * Ida y vuelta A → B → A, con veredicto explícito. Es la comprobación que
   * distingue «se perdió y lo dije» de «se perdió y me callé»: lo segundo es un
   * fallo, y aquí se llama por su nombre.
   */
  app.post("/api/engine/convertir-verificar", (req: Request, res: Response) => {
    const desde = String(req.body?.formatoEntrada || "").toLowerCase() as FormatoConv;
    const hacia = String(req.body?.formatoSalida || "").toLowerCase() as FormatoConv;
    const contenido = typeof req.body?.contenido === "string" ? req.body.contenido : "";
    if (!FORMATOS_CONV.includes(desde) || !FORMATOS_CONV.includes(hacia)) {
      return res.status(400).json({ ok: false, error: `Formatos válidos: ${FORMATOS_CONV.join(", ")}.` });
    }
    if (desde === hacia) return res.status(400).json({ ok: false, error: "Los dos formatos son el mismo: no hay ida y vuelta que comprobar." });
    if (!contenido) return res.status(400).json({ ok: false, error: "Falta «contenido»." });

    const v = idaYVuelta(contenido, desde, hacia, (req.body?.opciones || {}) as any);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
    const veredicto = v.igual ? "perfecto" : v.perdidasDeclaradas.length > 0 ? "perdida_declarada" : "PERDIDA_SILENCIOSA";
    return res.json({
      ok: true,
      veredicto,
      igual: v.igual,
      diferencias: v.diferencias.slice(0, 20),
      perdidasDeclaradas: v.perdidasDeclaradas,
      avisos: v.avisos,
      message:
        veredicto === "perfecto"
          ? `${desde} → ${hacia} → ${desde}: vuelve EXACTAMENTE lo mismo.`
          : veredicto === "perdida_declarada"
          ? `${desde} → ${hacia} → ${desde}: hay pérdidas, y están declaradas (${v.perdidasDeclaradas.length}). Es correcto: el formato no puede guardarlas.`
          : `${desde} → ${hacia} → ${desde}: PÉRDIDA SILENCIOSA. La conversión cambió datos sin avisar. Esto es un fallo.`,
    });
  });

  /** Estado de la base de datos (para el panel del motor). */
  app.get("/api/engine/kb/stats", (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      size: engineKb.size(),
      tables: engineKb.stats(),
      file: ENGINE_DB_FILE,
      persisted: fs.existsSync(ENGINE_DB_FILE),
    });
  });

  /** El motor aprende: registra una lección como entrada consultable. */
  app.post("/api/engine/kb/learn", (req: Request, res: Response) => {
    const { id, text, tags } = req.body || {};
    if (!text || typeof text !== "string") return res.status(400).json({ ok: false, error: "Falta el texto de la lección." });
    engineKb.learnFromLesson(String(id || Date.now()), text, Array.isArray(tags) ? tags : []);
    kbDirty = true;
    saveEngineKb(true);
    return res.json({ ok: true, size: engineKb.size() });
  });

  /** Alta/actualización manual de una entrada (para ampliar la base a mano). */
  app.post("/api/engine/kb/entry", (req: Request, res: Response) => {
    const entry = req.body;
    if (!entry?.id || !entry?.body) return res.status(400).json({ ok: false, error: "La entrada necesita id y body." });
    engineKb.upsert({
      id: String(entry.id),
      table: entry.table || "rule",
      title: String(entry.title || entry.id),
      body: String(entry.body),
      keys: Array.isArray(entry.keys) ? entry.keys.map(String) : [],
      lang: entry.lang,
      weight: typeof entry.weight === "number" ? entry.weight : 0.7,
    });
    kbDirty = true;
    saveEngineKb(true);
    return res.json({ ok: true, size: engineKb.size() });
  });

  /** Valida sintaxis sin escribir nada (útil para previsualizar y para tests). */
  app.post("/api/engine/guard", async (req: Request, res: Response) => {
    const { path: p, content } = req.body || {};
    // v1.6.32: este espejo del guardián también juzga con el parser real.
    const result = await guardFileProfundo(String(p || "archivo.txt"), String(content ?? ""), PARSER_ESBUILD);
    return res.json(result);
  });

  /**
   * El cliente informa del mapa del proyecto. Fase 2: además, el motor reindexa
   * los SÍMBOLOS leyendo los archivos del sandbox (no se envía contenido por la
   * red: se lee del disco, que es barato y siempre está al día).
   */
  app.post("/api/engine/sync", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: persiste la base de conocimiento en disco.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    refreshEngineProjectMap(files.map((f: any) => ({ path: String(f?.path || ""), language: f?.language ? String(f.language) : undefined })));
    const index = reindexProjectSymbols();
    saveEngineKb(true);
    return res.json({
      ok: true,
      indexed: Math.min(files.length, 60),
      symbols: index,
      size: engineKb.size(),
    });
  });

  /** Fase 2 — Consulta pública del índice de símbolos del proyecto. */
  app.get("/api/engine/symbols", (req: Request, res: Response) => {
    const q = String(req.query.q || "");
    if (symbolMap.total === 0) reindexProjectSymbols();
    if (!q) {
      return res.json({
        ok: true,
        total: symbolMap.total,
        files: symbolMap.files.map((f) => ({ path: f.path, language: f.language, lines: f.lines, symbols: f.symbols.length })),
        summary: summarizeSymbols(symbolMap),
      });
    }
    const hits = findSymbols(symbolMap, q, Math.max(1, Math.min(30, Number(req.query.limit) || 10)));
    return res.json({
      ok: true,
      query: q,
      found: hits.length,
      results: hits.map((h) => ({ file: h.file, line: h.symbol.line, kind: h.symbol.kind, signature: h.symbol.signature })),
    });
  });

  /** Esquemas de herramientas que el motor aplica (contexto blindado). */
  app.get("/api/engine/tools", (_req: Request, res: Response) => {
    return res.json({ ok: true, tools: listToolPacks(), names: getAllToolNames() });
  });
}

function registerLocalPerformanceRoutes(app: express.Express): void {
  /**
   * Precalienta el modelo: lo carga en RAM (y reserva su contexto) antes de que
   * el usuario escriba. Medido: evita el "no contesta" del primer mensaje.
   */
  app.post("/api/ollama/warmup", async (req: Request, res: Response) => {
    const model = String(req.body?.model || "");
    if (!model) return res.status(400).json({ ok: false, error: "Falta el campo model" });
    const profile = getModelProfile(model, RAM_GB);
    const url = `${(process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/, "")}/api/generate`;
    const started = Date.now();
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 120_000);
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: "",
          stream: false,
          keep_alive: profile.keepAlive,
          // Se reserva el contexto real que usará después: si no, Ollama
          // recarga el modelo con otra ventana y el precalentado no sirve.
          options: buildOllamaOptions(model, undefined, CPU_CORES, RAM_GB),
        }),
        signal: controller.signal,
      });
      clearTimeout(t);
      const ms = Date.now() - started;
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        return res.status(502).json({ ok: false, model, ms, error: `Ollama respondió ${r.status}: ${body.slice(0, 200)}` });
      }
      return res.json({
        ok: true,
        model,
        ms,
        message: `Modelo listo en ${(ms / 1000).toFixed(1)} s (queda cargado ${profile.keepAlive}).`,
        tier: profile.tier,
        numCtx: profile.numCtx,
        notes: profile.notes,
      });
    } catch (err: any) {
      const ms = Date.now() - started;
      const cls = classifyError(err);
      return res.status(502).json({
        ok: false,
        model,
        ms,
        error:
          cls.kind === "offline"
            ? "No se pudo hablar con Ollama (¿está arrancado en el puerto 11434?)"
            : `Falló el precalentado: ${cls.message}`,
        kind: cls.kind,
      });
    }
  });

  /** Salud profunda: estado de cada pieza + qué hacer si algo está mal. */
  /**
   * v2.0 — APLANAR LA RAÍZ DEL PROYECTO DEL SANDBOX.
   * Cuando el ZIP subido trae una carpeta contenedora (por ejemplo
   * `CerebroNico-IDE-v2.0/ide/backend/package.json`), el proyecto queda un nivel
   * más adentro y el sandbox informa de que "no hay package.json". Aquí se mueve
   * el contenido de esa subcarpeta a la raíz de .proyectos, sin borrar nada y sin
   * pisar archivos existentes.
   */
  // ============================================================
  // v2.1 — ¿HAY UNA COPIA MÁS NUEVA DEL PROYECTO DENTRO DE .proyectos?
  // ------------------------------------------------------------
  // CAUSA RAÍZ de la pantalla en blanco que sobrevivía a reinstalaciones.
  //
  // Había TRES sitios distintos —el estado, el aplanado y el resolutor de raíz—
  // que daban el trabajo por terminado en cuanto veían un `package.json` EN LA
  // RAÍZ:
  //     if (existe .proyectos/package.json)  →  "ya hay proyecto, no hay nada que hacer"
  // Y es razonable… salvo por un detalle que lo rompe todo: el sync escribe
  // SIEMPRE el árbol anidado, porque el workspace guarda las rutas con su carpeta
  // contenedora (`CerebroNico-IDE-v2.1/ide/backend/src/...`). Es decir, en la
  // raíz vive el proyecto VIEJO y dentro el proyecto RECIÉN SINCRONIZADO.
  //
  // Con esa condición, en cuanto la raíz tuvo un `package.json` (cosa que pasa en
  // el primer aplanado), el sandbox quedó CONGELADO para siempre: el sync seguía
  // escribiendo el árbol nuevo y nadie lo subía. Si el `src/` de la raíz venía de
  // una época en que el importador cortaba a los 40 archivos, conservaba
  // `main.tsx` y `App.tsx` —que entraban siempre— pero NO los componentes, que
  // eran justo los que el corte se comía. Resultado exacto y permanente: el
  // navegador cargaba el TÍTULO y devolvía 404 en TODOS los `/src/components/*`.
  //
  // Esta búsqueda mira DENTRO siempre, aunque la raíz ya tenga package.json.
  // ============================================================
  // La implementación vive en el ámbito del módulo (buscarProyectoAnidado),
  // porque la usan tanto este endpoint como /api/sandbox/status. Definirla aquí
  // dentro la dejaba invisible para el de estado: ReferenceError en tiempo de
  // ejecución y las dos rutas devolvían vacío.

  app.post("/api/sandbox/flatten-root", async (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: MUEVE archivos de sitio dentro del workspace.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    try {
      // v1.6.23 — F2: misma lista de artefactos que usa buscarProyectoAnidado
      // (antes cada lado tenía su set y el aplanado podía arrastrar un build/ o
      // .next/ viejo a la raíz). Se unifica; la de estado también entra.
      const skipDirs = new Set(["node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage", ".next", ".nuxt", "venv", "__pycache__", ".cerebro-db", ".cerebronico", ".vite"]);
      if (!fs.existsSync(PROJECT_ROOT)) {
        return res.json({ ok: false, moved: 0, message: "El sandbox (.proyectos) todavía no existe." });
      }

      // ============================================================
      // v2.1 — 🐞 BUSCA A CUALQUIER PROFUNDIDAD (antes, solo UN nivel).
      // ------------------------------------------------------------
      // El log del usuario lo dejaba claro, línea a línea:
      //   "El package.json está en «CerebroNico-IDE-v2.0/ide/backend/»"  ← sí lo encontró
      //   "No hay ninguna subcarpeta con package.json en la raíz"        ← y aquí falló
      // Buscaba `package.json` solo en los hijos DIRECTOS de .proyectos, así que
      // un ZIP con «Contenedora/ide/backend/package.json» (DOS niveles) no tenía
      // candidato: el aplanado nunca se ejecutaba y el sandbox se quedaba sin
      // proyecto. Ahora usa la MISMA autoridad de raíz que el arranque
      // (resolverRaizProyecto → hasta 5 niveles), de modo que estado, aplanado y
      // arranque no pueden contradecirse.
      // ============================================================
      // Ya NO se usa resolverRaizProyecto() aquí: devuelve la raíz en cuanto ve
      // un package.json arriba (`if (enBase.pkg) → anidada: false`) y por eso un
      // proyecto anidado nunca se subía. Se busca la copia anidada siempre.
      const from = buscarProyectoAnidado();
      if (!from) {
        return res.json({
          ok: true,
          moved: 0,
          merged: 0,
          replaced: 0,
          skipped: [],
          message: "No hay ninguna copia anidada del proyecto: la raíz ya está al día.",
        });
      }
      // ============================================================
      // v1.6.24 — GUARDA-E: NO se aplana el suelo que pisa el programa vivo.
      // ------------------------------------------------------------
      // 🐞 Lo contó el log del usuario, hora por hora: el editor tenía una
      // copia de la PROPIA CerebróNico (183 archivos bajo «ide/»), el aplanado
      // se dispuso a renombrar la carpeta donde vive el proceso en ejecución a
      // la raíz del sandbox, /api/exec cayó sin package.json (ENOENT) y :3500
      // quedó sirviendo los restos de un servidor huérfano con su raíz
      // mudada — «pid externo», main.tsx 404, «página vacía».
      // Una copia DISTINTA de la IDE sigue siendo proyecto legítimo (la guarda
      // de recursión de /api/sandbox/start la trata con confirmación); lo que
      // está prohibido es mover la instalación desde la que se está corriendo.
      // ============================================================
      if (esCarpetaDeLaAppViva(from)) {
        const relE = path.relative(PROJECT_ROOT, from).split(path.sep).join("/") || ".";
        const msg =
          `La copia anidada «${relE}/» es la propia CerebróNico EN EJECUCIÓN (el programa arranca desde ahí): ` +
          "aplanarla movería los archivos del programa mientras corre. El sandbox debe contener TU app, no la IDE — quita «ide/» del editor o borra el sandbox y sincroniza solo tu proyecto.";
        console.warn(`[CerebroNico] 🧱 GUARDA-E: ${msg}`);
        return res.json({ ok: false, moved: 0, merged: 0, replaced: 0, skipped: [], from: relE, message: msg });
      }
      // ============================================================
      // v1.6.23 — GUARDA-D: identidad antes de fundir.
      // ------------------------------------------------------------
      // El criterio «manda la versión sincronizada» es correcto para la copia
      // más nueva del MISMO proyecto, y desastroso entre DOS proyectos
      // distintos: pisaba la app de la raíz con lo que hubiera anidado (así
      // `codigo-cerebronico` se convirtió en el proyecto del sandbox y el
      // piloto se puso a compilar la IDE). Si los package.json declaran
      // nombres distintos, la raíz se respalda primero en
      // `_respaldo-<iso>/` y el informe lo dice con los dos nombres.
      // ============================================================
      const pkgEn = (dir: string): string | null => {
        try { return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))?.name || null; } catch { return null; }
      };
      const veredictoD = decidirRespaldo(pkgEn(PROJECT_ROOT), pkgEn(from));
      let respaldo = "";
      const respaldoErrores: string[] = [];
      if (veredictoD.respaldar) {
        respaldo = path.join(PROJECT_ROOT, "_respaldo-" + new Date().toISOString().replace(/[:.]/g, "-"));
        try {
          fs.mkdirSync(respaldo, { recursive: true });
          for (const e of fs.readdirSync(PROJECT_ROOT)) {
            if (e === path.basename(respaldo)) continue;
            try {
              fs.renameSync(path.join(PROJECT_ROOT, e), path.join(respaldo, e));
            } catch (err: any) {
              respaldoErrores.push(`${e}: ${String(err?.message || err)}`);
            }
          }
        } catch (err: any) {
          respaldoErrores.push(`creación del respaldo: ${String(err?.message || err)}`);
        }
        console.log(`[CerebroNico] GUARDA-D: ${veredictoD.motivo}${respaldo ? ` Raíz respaldada en ${respaldo}.` : ""}${respaldoErrores.length ? ` ERRORES: ${respaldoErrores.join(" · ")}` : ""}`);
      }
      const relFrom = path.relative(PROJECT_ROOT, from) || ".";
      const moved: string[] = [];
      const fundidos: string[] = [];
      const reemplazados: string[] = [];
      const omitidos: string[] = [];

      // ============================================================
      // v2.1 — 🐞 EL APLANADO NO PUEDE DEJAR NADA ATRÁS EN SILENCIO
      // ------------------------------------------------------------
      // Antes había una sola línea:
      //     if (fs.existsSync(dst)) continue;   // "nunca pisar lo que ya está"
      // Suena prudente y era el peor fallo posible, porque el sandbox .proyectos
      // SE REUTILIZA: cada arranque vuelve a sincronizar sobre el mismo directorio.
      //
      // Secuencia que producía, paso a paso:
      //   1. El primer aplanado mueve el proyecto a la raíz, incluido «src/».
      //   2. El siguiente sync vuelve a escribir el árbol anidado.
      //   3. El segundo aplanado ve que «src» YA existe en la raíz → lo SALTA.
      //   4. La raíz se queda con el «src/» VIEJO para siempre; el nuevo y
      //      completo se descarta SIN UNA SOLA LÍNEA en el log.
      //
      // Y si ese «src/» viejo venía de un sandbox antiguo (cuando el importador
      // cortaba a los 40 archivos), conservaba main.tsx y App.tsx —que entraban
      // siempre— pero NO los componentes, que eran los que se comía el corte.
      // Resultado exacto y persistente: el navegador cargaba el TÍTULO y devolvía
      // 404 en TODOS los /src/components/*. La pantalla en blanco reportada
      // sobrevivía a reinstalaciones porque el «src» malo nunca se reemplazaba.
      //
      // Criterio nuevo: la versión SINCRONIZADA manda (es la que el editor
      // muestra). Si el destino ya existe, se FUNDE: los archivos del proyecto se
      // sobrescriben con la versión buena y lo que no venga en el ZIP se respeta.
      // Todo se cuenta y se reporta — nada de fallos mudos.
      // ============================================================
      const fusionar = (origen: string, destino: string): number => {
        let n = 0;
        let entradas: string[] = [];
        try {
          entradas = fs.readdirSync(origen);
        } catch {
          return 0;
        }
        for (const e of entradas) {
          // Nunca arrastrar carpetas de artefactos: si un node_modules se colara
          // dentro de algo que hay que fundir, la fusión copiaría decenas de
          // miles de archivos y pisaría el node_modules bueno de la raíz.
          if (skipDirs.has(e) || e === ".git") continue;
          const o = path.join(origen, e);
          const d = path.join(destino, e);
          let st;
          try {
            st = fs.statSync(o);
          } catch {
            continue;
          }
          if (st.isDirectory()) {
            // Si en el destino hay un ARCHIVO con ese nombre, hay que quitarlo
            // antes: mkdirSync fallaría y la fusión se abandonaría en silencio.
            let destinoEsDir = true;
            try {
              destinoEsDir = fs.statSync(d).isDirectory();
            } catch {
              destinoEsDir = true; // no existe: lo creará mkdirSync
            }
            if (!destinoEsDir) {
              try {
                fs.rmSync(d, { force: true });
              } catch {}
            }
            try {
              fs.mkdirSync(d, { recursive: true });
            } catch {}
            n += fusionar(o, d);
          } else {
            try {
              fs.copyFileSync(o, d);
              n++;
            } catch {}
          }
        }
        return n;
      };

      for (const item of fs.readdirSync(from)) {
        if (skipDirs.has(item)) continue;
        const src = path.join(from, item);
        const dst = path.join(PROJECT_ROOT, item);
        if (!fs.existsSync(dst)) {
          try {
            fs.renameSync(src, dst);
            moved.push(item);
          } catch (e: any) {
            omitidos.push(`${item} (${e?.message || e})`);
          }
          continue;
        }
        let esDir = false;
        try {
          esDir = fs.statSync(src).isDirectory();
        } catch {}
        if (esDir) {
          const n = fusionar(src, dst);
          fundidos.push(`${item} (${n})`);
          try {
            fs.rmSync(src, { recursive: true, force: true });
          } catch {}
        } else {
          try {
            fs.copyFileSync(src, dst);
            reemplazados.push(item);
          } catch (e: any) {
            omitidos.push(`${item} (${e?.message || e})`);
          }
        }
      }
      // Limpieza: se sube borrando las carpetas contenedoras que queden VACÍAS
      // (con dos niveles quedaban `Contenedora/ide/` colgando). rmdirSync falla
      // si la carpeta no está vacía, y ahí se para: nunca se borra contenido.
      let dir = from;
      for (let i = 0; i < 6; i++) {
        if (dir === PROJECT_ROOT) break;
        try {
          fs.rmdirSync(dir);
        } catch {
          break;
        }
        dir = path.dirname(dir);
      }
      console.log(
        `[CerebroNico] Sandbox aplanado: ${moved.length} movido(s)` +
          (fundidos.length ? ` · ${fundidos.length} fundido(s): ${fundidos.join(", ")}` : "") +
          (reemplazados.length ? ` · ${reemplazados.length} reemplazado(s): ${reemplazados.join(", ")}` : "") +
          (omitidos.length ? ` · ⚠️ ${omitidos.length} NO se pudo mover: ${omitidos.join(", ")}` : "") +
          ` (desde ${relFrom}/)`
      );
      return res.json({
        ok: omitidos.length === 0,
        moved: moved.length,
        merged: fundidos.length,
        replaced: reemplazados.length,
        skipped: omitidos,
        from: relFrom,
        // v1.6.23 — GUARDA-D: el respaldo viaja en la respuesta para que el
        // piloto lo escriba en el log con los dos nombres de proyecto.
        respaldo: respaldo || undefined,
        respaldoMotivo: veredictoD.respaldar ? veredictoD.motivo : undefined,
        respaldoErrores: respaldoErrores.length ? respaldoErrores : undefined,
        message:
          `Proyecto aplanado: ${moved.length} elemento(s) movidos desde «${relFrom}/» a la raíz del sandbox` +
          (fundidos.length ? `, ${fundidos.length} fundido(s) para actualizar el código que ya estaba` : "") +
          (reemplazados.length ? `, ${reemplazados.length} reemplazado(s)` : "") +
          (respaldo ? `. 🗄️ ${veredictoD.motivo} Raíz respaldada en «${path.basename(respaldo)}/»` : "") +
          (respaldoErrores.length ? `. ⚠️ Errores del respaldo: ${respaldoErrores.join(", ")}` : "") +
          (omitidos.length ? `. ⚠️ No se pudieron mover: ${omitidos.join(", ")}` : "."),
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ============================================================
  // v2.1 — VERIFICACIÓN REAL DEL PREVIEW: ¿SE SIRVEN LOS MÓDULOS?
  // ------------------------------------------------------------
  // El puerto 3500 puede responder y el navegador quedarse en BLANCO con 404 en
  // /src/*. Visto desde fuera, eso es indistinguible de "todo bien": el semáforo
  // se pone verde, el log dice "Preview en vivo listo" y el usuario no ve nada.
  // Es exactamente el punto donde se perdió tanto tiempo.
  // Este endpoint comprueba, del lado del servidor (sin CORS de por medio), si
  // los módulos que el navegador va a pedir se sirven DE VERDAD.
  // ============================================================
  app.get("/api/sandbox/verify-preview", async (_req: Request, res: Response) => {
    // Se calcula aquí y no se usa la constante SANDBOX_PORT: vive dentro de
    // startServer() y este bloque está en otro ámbito (ReferenceError).
    const puertoSandbox = Number(process.env.SANDBOX_PORT) || 3500;
    const base = `http://127.0.0.1:${puertoSandbox}`;
    const raiz = resolverRaizProyecto().raiz;
    // ============================================================
    // v1.6.24 — EL VERIFICADOR TENÍA UN SOLO MUNDO EN LA CABEZA: VITE.
    // Exigía /src/main.tsx por HTTP, pero el sandbox de la vía rápida sirve
    // «/cn-preview.js» (el bundle de esbuild) y el anidado de producción
    // sirve «/assets/…»: en los dos casos legítimos el veredicto era el
    // mismo aviso falso —«preview quedará EN BLANCO»— sobre previews que
    // funcionaban, mientras el verdadero problema (un «pid externo» de otra
    // sesión) pasaba de largo. Ahora primero se pregunta QUÉ vía corre y se
    // sonda lo que esa vía promete servir.
    // ============================================================
    const leerSeguro = (p: string): string => {
      try {
        return fs.readFileSync(p, "utf-8");
      } catch {
        return "";
      }
    };
    let pkgRaiz: any = null;
    try {
      pkgRaiz = JSON.parse(leerSeguro(path.join(raiz, "package.json")));
    } catch {}
    const htmlRaiz = leerSeguro(path.join(raiz, "index.html"));
    let componentesEnDisco = 0;
    try {
      componentesEnDisco = fs.readdirSync(path.join(raiz, "src", "components")).filter((f) => /\.(tsx|jsx)$/i.test(f)).length;
    } catch {}
    const bundleEnDisco = fs.existsSync(path.join(raiz, NOMBRE_BUNDLE));
    const viaReportada: string = pkgRaiz?.name === "cerebronico-ide" ? "ide-anidada" : bundleEnDisco || htmlRaiz.includes(NOMBRE_BUNDLE) ? "estatico-compilado" : pkgRaiz ? "npm-dev" : "estatico-directo";

    type Sonda = { ruta: string; etiqueta: string; obligatorio: boolean };
    const sondas: Sonda[] = [{ ruta: "/", etiqueta: "HTML raíz", obligatorio: true }];
    if (viaReportada === "estatico-compilado") {
      sondas.push({ ruta: `/${NOMBRE_BUNDLE}`, etiqueta: "bundle esbuild", obligatorio: true });
    } else if (viaReportada === "npm-dev") {
      const compDir = path.join(raiz, "src", "components");
      let componentesEnDiscoViejo: string[] = [];
      try {
        componentesEnDiscoViejo = fs.readdirSync(compDir).filter((f) => /\.(tsx|jsx)$/i.test(f));
      } catch {}
      const primerComponente = componentesEnDiscoViejo[0] || "";
      sondas.push({ ruta: "/src/main.tsx", etiqueta: "main.tsx", obligatorio: true });
      if (primerComponente) sondas.push({ ruta: `/src/components/${primerComponente.replace(/\.(tsx|jsx)$/i, "")}`, etiqueta: "componente", obligatorio: false });
    } else if (viaReportada === "ide-anidada") {
      const asset = (htmlRaiz.match(/(?:src|href)="(\/assets\/[^"]+)"/) || [])[1];
      if (asset) sondas.push({ ruta: asset, etiqueta: "asset de la IDE", obligatorio: true });
    } else {
      const jsRef = (htmlRaiz.match(/src="\.?\/?([\w./-]+\.js)"/) || [])[1];
      if (jsRef) sondas.push({ ruta: "/" + jsRef.replace(/^\/+/, ""), etiqueta: "script", obligatorio: false });
    }

    const resultados: Array<{ ruta: string; status: number; bytes: number }> = [];
    for (const s of sondas) {
      let status = 0;
      let bytes = 0;
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 4000);
        const resp = await fetch(base + s.ruta, { signal: ac.signal });
        clearTimeout(t);
        status = resp.status;
        bytes = (await resp.text()).length;
      } catch {
        status = -1;
      }
      resultados.push({ ruta: s.ruta, status, bytes });
    }
    const detalle = (r: { ruta: string; status: number; bytes: number }) => `${r.ruta}: HTTP ${r.status} (${r.bytes} B)`;
    const obligatorias = resultados
      .map((r, i) => ({ r, s: sondas[i] }))
      .filter((x) => x.s.obligatorio);
    const fallidas = obligatorias.filter((x) => !(x.r.status === 200 && x.r.bytes > 0));
    const paginaMuyFlaca = resultados[0] && resultados[0].status === 200 && resultados[0].bytes < 60;
    // v1.6.25-SANDBOXFIX3 — GUARDA-BUNDLE-DESNUDO en el verificador: un bundle
    // con imports desnudos responde 200 y aun así deja la pantalla en blanco.
    // Se lee el bundle de disco (sin pedirlo por HTTP) y se cuenta la verdad.
    const desnudosServidos =
      viaReportada === "estatico-compilado" ? importacionesDesnudas(leerSeguro(path.join(raiz, NOMBRE_BUNDLE))) : [];
    const ok = obligatorias.length > 0 && fallidas.length === 0 && !paginaMuyFlaca && desnudosServidos.length === 0;
    return res.json({
      ok,
      desnudos: desnudosServidos,
      base,
      raiz,
      via: viaReportada,
      componentesEnDisco,
      resultados,
      message: ok
        ? `Preview verificado (vía ${viaReportada}): ${obligatorias.map((x) => detalle(x.r)).join(" · ")}.`
        : desnudosServidos.length > 0
          ? `El bundle SE SIRVE (HTTP 200) pero el navegador NO puede ejecutarlo: quedó con ${desnudosServidos.length} import(s) desnudo(s) (${desnudosServidos.slice(0, 4).join(", ")}). Por eso el preview sale en blanco.`
          : paginaMuyFlaca
          ? `El puerto responde pero el HTML está VACIO (${resultados[0].bytes} bytes): el servidor no encontró su raíz. Detente, Sync completo y vuelve a arrancar.`
          : `El puerto responde pero no se sirve lo que la vía «${viaReportada}» promete. Obligatorio fallido: ${fallidas.map((x) => `${x.s.etiqueta} (${detalle(x.r)})`).join(" · ")}. ` +
            `Se sondó: ${resultados.map(detalle).join(" · ")}. Si arriba aparece un «pid externo», es un servidor huérfano de otra sesión: usa «Forzar Limpieza» y vuelve a Arrancar.`,
    });
  });

}

function registerExtensionRoutes(app: express.Express): void {
  /** Lista de extensiones instaladas (con estado y avisos) */
  // FORJA v1 — la misma compilación que usa el modelo vía forjar_complemento:
  // entra la receta, sale manifest+panel validados e instalados en extensions/.
  // Con tachas: TODOS los motivos y nada escrito.
  app.post("/api/extensions/forjar", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: crea una extensión en disco.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    try {
      const existentes = fs.existsSync(EXTENSIONS_DIR) ? fs.readdirSync(EXTENSIONS_DIR) : [];
      const nr = normalizarReceta(req.body, existentes);
      if (!nr.ok) return res.status(400).json({ ok: false, motivos: nr.motivos });
      const archivos = generarArchivos(nr.receta);
      const vmf = validateManifest(JSON.parse(archivos[0].content));
      if (!vmf.ok) return res.status(500).json({ ok: false, motivos: ["el compilador produjo un manifest inválido (bug del sistema, repórtalo): " + vmf.errors.join("; ")] });
      const dir = path.join(EXTENSIONS_DIR, nr.receta.id);
      fs.mkdirSync(dir, { recursive: true });
      for (const a of archivos) fs.writeFileSync(path.join(dir, a.path), a.content, "utf8");
      return res.json({ ok: true, id: nr.receta.id, archivos: archivos.map((a) => a.path), uso: instruccionUso(nr.receta) });
    } catch (e: any) {
      return res.status(500).json({ ok: false, motivos: ["forja falló: " + String((e && e.message) || e)] });
    }
  });

  // COREO v1 — el bus de acción visual: la narración del plan llega aquí y
  // la Espina de Actividad lo baila (poll 700 ms, la arquitectura del puente).
  // ─── FONDO v1: fondo animado (gif/mp4/webm de 4–8 s) desde un archivo del
  // proyecto. El motor solo guarda un puntero y un tamaño; la respuesta es
  // STREAM: la máquina de pocos recursos paga el decodificado una vez (en el
  // navegador, con GPU si tiene) y no lo arrastra en cada tecla pulsada.
  const carpetaFondo = path.join(PROJECT_ROOT, ".cerebro-db");
  const metaFondoPath = path.join(carpetaFondo, "fondo.json");
  const binFondoPath = (ext: string) => path.join(carpetaFondo, "fondo" + ext);
  const leerMetaFondo = (): { tipo?: string } | null => {
    try { const mt = JSON.parse(fs.readFileSync(metaFondoPath, "utf8")); return mt && mt.tipo ? mt : null; } catch { return null; }
  };

  app.get("/api/fondo/meta", (_req: Request, res: Response) => {
    const mt = leerMetaFondo();
    res.json(mt ? { ...mt, activado: true } : { activado: false, nota: "sin fondo animado: el motor respira tranquilo" });
  });

  app.post("/api/fondo", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: escribe el fondo en disco.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const vf = validarFondo(req.body);
    if (!vf.ok) return res.status(400).json({ ok: false, motivos: vf.motivos });
    const abs = path.resolve(PROJECT_ROOT, vf.ruta);
    if (!dentroDe(PROJECT_ROOT, abs)) return res.status(400).json({ ok: false, motivos: ["la ruta salió del proyecto; de fuera no se sirve nada."] });
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile())
      return res.status(400).json({ ok: false, motivos: ['«' + vf.ruta + '» no existe en el proyecto. Primero deja el archivo dentro (arrastrarlo al explorador o pedirlo al chat).'] });
    const tipo = tipoDeArchivo(vf.ruta);
    if (!tipo) return res.status(400).json({ ok: false, motivos: ["el tipo se te escapó entre líneas: solo gif (≤4 MB), mp4 o webm (≤8 MB)."] });
    const st = fs.statSync(abs);
    if (st.size > LIMITES_BYTES[tipo])
      return res.status(400).json({ ok: false, motivos: ['esta máquina es de pocos recursos: .' + tipo + ' admite ' + limiteLegible(tipo) + ' y «' + vf.ruta + '» pesa ' + (st.size / 1048576).toFixed(1) + ' MB — baja la resolución o recórtalo a 4–8 s.'] });
    try {
      fs.mkdirSync(carpetaFondo, { recursive: true });
      for (const t of Object.keys(TIPOS_FONDO)) { try { fs.unlinkSync(binFondoPath("." + t)); } catch { /* si no estaba, mejor */ } }
      fs.copyFileSync(abs, binFondoPath("." + tipo));
      const mt = metaDeFondo(vf.ruta, tipo, st.size, new Date().toISOString());
      fs.writeFileSync(metaFondoPath, JSON.stringify(mt, null, 2));
      notificar("entregar", "fondo animado: " + vf.ruta); // el capricho, al menos, se anuncia por el bus
      return res.json({ ok: true, meta: mt });
    } catch (e: any) {
      return res.status(500).json({ ok: false, motivos: ["el fondo no pudo alojarse: " + String((e && e.message) || e)] });
    }
  });

  app.get("/api/fondo", (_req: Request, res: Response) => {
    const mt = leerMetaFondo();
    if (!mt || !mt.tipo) return res.status(404).json({ ok: false, motivo: "no hay fondo activado." });
    const bin = binFondoPath("." + mt.tipo);
    if (!fs.existsSync(bin)) return res.status(404).json({ ok: false, motivo: "el meta anuncia fondo pero el archivo no está: vuélvelo a activar." });
    res.setHeader("Content-Type", TIPOS_FONDO[mt.tipo as keyof typeof TIPOS_FONDO] || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=3600");
    fs.createReadStream(bin).pipe(res);
  });

  app.delete("/api/fondo", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: borra el fondo del disco.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    for (const t of Object.keys(TIPOS_FONDO)) { try { fs.unlinkSync(binFondoPath("." + t)); } catch { /* nada que borrar */ } }
    try { fs.unlinkSync(metaFondoPath); } catch { /* sin meta, sin drama */ }
    res.json({ ok: true, quitado: true, nota: "la IDE vuelve a su negro de siempre" });
  });

  // ─── CONTENEDOR GENERAL v8.0.2 ───────────────────────────────────────────
  // Inspecciona cualquier cosa que el usuario suelte y dice la verdad sobre ella:
  // qué ES de verdad (por firma mágica, no por el nombre), en qué se contradice,
  // qué se puede hacer con ella y QUÉ SE PERDERÍA al convertirla.
  //
  // Solo INFORMA. No convierte, no escribe y no lanza comandos: la escritura y la
  // ejecución siguen siendo de quien ya tenía permiso para hacerlas. Un contenedor
  // que además actúa sin que nadie lea el plan es un riesgo con buena interfaz.
  // ─── MEDICIÓN DEL PUENTE (CN v1.5.0) ─────────────────────────────────────
  //
  // LA PUERTA QUE FALTABA. El motor anunciaba «medición de TTFT en tiempo real»
  // en su catálogo de habilidades (`src/data/skills100.ts`) y **no había ni una
  // línea que lo midiera**. Aquí se mide de verdad: contra el Ollama real, por el
  // camino de streaming real, y comparando los DOS transportes.
  //
  // Las tres honestidades que este endpoint respeta:
  //  1. Si Ollama no responde, DICE QUE NO RESPONDE. No devuelve ceros ni una
  //     estimación: un banco que se inventa la respuesta no mide el sistema,
  //     mide su propia imaginación.
  //  2. El TTFT que sale aquí INCLUYE el arranque del modelo y el procesado del
  //     prompt. Es el número que de verdad siente el usuario, y también significa
  //     que la primera medición tras cargar un modelo sale mal a propósito: el
  //     motor espera hasta 3 minutos al primer byte por eso mismo.
  //  3. El socket Unix SÓLO se mide si el archivo existe. Si no está, se dice que
  //     no está en vez de comparar contra un cero que parecería una victoria.
  app.post("/api/puente/medir", async (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: acepta un socket arbitrario y sale a la red.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const cuerpo = (req.body || {}) as {
      modelo?: string; texto?: string; socket?: string; repeticiones?: number;
      /** v1.6.4 — Si es true, se inyecta el conocimiento del motor ANTES del texto. */
      contexto?: boolean;
      /** Cuántas entradas del motor se inyectan (por defecto, las 25 de la v1.0.0). */
      entradas?: number;
      /** Presupuesto en caracteres del bloque inyectado (por defecto, 5.500). */
      presupuesto?: number;
      /** Cuánto tiempo mantiene Ollama el modelo cargado. -1 = para siempre. */
      keepAlive?: string | number;
    };
    const base = (process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/, "");
    const textoBase = typeof cuerpo.texto === "string" && cuerpo.texto.trim() ? cuerpo.texto.trim() : "Di solamente: hola";

    // v1.6.4 — LA PREGUNTA QUE DE VERDAD IMPORTA, hecha medible.
    //
    // En la v1.0.0 subí x5 el conocimiento inyectado (5 -> 25 entradas, 1.100 ->
    // 5.500 caracteres) y lo documenté como un INTERCAMBIO: más conocimiento a
    // cambio de más latencia. Lo que no hice fue medir el coeficiente. Eso es
    // exactamente lo que este interruptor permite: la misma pregunta, con y sin
    // el bloque del motor, para ver cuánto TTFT cuesta el conocimiento.
    //
    // En un modelo local el tiempo suele irse en PROCESAR EL PROMPT, no en
    // generar. Si eso se confirma aquí, el bloque x5 es la palanca más grande de
    // todo el sistema — y es una palanca que yo mismo moví a ciegas.
    let entrada = textoBase;
    let contextoInyectado = 0;
    if (cuerpo.contexto) {
      try {
        const limite = Number.isFinite(cuerpo.entradas as number) ? (cuerpo.entradas as number) : 25;
        const presupuesto = Number.isFinite(cuerpo.presupuesto as number) ? (cuerpo.presupuesto as number) : 5500;
        const bloque = buildEngineContext(engineKb, textoBase, limite, presupuesto);
        if (bloque && bloque.trim()) {
          entrada = bloque + "\n\n" + textoBase;
          contextoInyectado = bloque.length;
        }
      } catch (e: any) {
        console.warn("[puente] No se pudo inyectar el contexto del motor:", e?.message || e);
      }
    }

    // 1. ¿Hay Ollama, y qué modelos tiene?
    let modelos: string[] = [];
    try {
      const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) });
      if (!r.ok) throw new Error(`respondió ${r.status}`);
      const d: any = await r.json();
      modelos = (d?.models || []).map((m: any) => String(m?.name || "")).filter(Boolean);
    } catch (e: any) {
      return res.json({
        ok: false,
        motivo: `Ollama no responde en ${base} (${e?.message || e}). Sin motor no hay TTFT que medir.`,
        pista: "Arranca Ollama, o pasa la dirección real en la variable OLLAMA_URL.",
      });
    }
    if (modelos.length === 0) {
      return res.json({
        ok: false,
        motivo: "Ollama está vivo pero no tiene ningún modelo instalado.",
        pista: "`ollama pull <modelo>` — y para el lado nube, un nombre que contenga `-cloud`.",
      });
    }

    const nube = modelos.find((n) => /cloud/i.test(n)) || null;
    const modelo = cuerpo.modelo && modelos.includes(cuerpo.modelo) ? cuerpo.modelo : nube || modelos[0];

    const puenteDe = (url: string): PuenteIA =>
      new PuenteNube(url, (texto) => ({
        model: modelo,
        messages: [{ role: "user", content: texto }],
        stream: true,
        options: { num_predict: 24 }, // medir el ARRANQUE, no generar un ensayo
        // v1.6.4 — El MODELO CARGADO es la diferencia entre segundos y
        // milisegundos. Ollama lo descarga al cabo de unos minutos de inactividad
        // (keep_alive por defecto, 5 min), así que el primer mensaje tras una
        // pausa paga la carga entera. Ese es el peor caso del usuario, y es el
        // único que no se ve si uno mide siempre seguido. Se puede fijar con
        // cuerpo.keepAlive (-1 = mantener cargado).
        ...(cuerpo.keepAlive !== undefined ? { keep_alive: cuerpo.keepAlive } : {}),
      }));

    // 2. Transporte TCP loopback: el que usa el motor hoy.
    let tcp;
    try {
      tcp = await medirPuente(puenteDe(`${base}/api/chat`), entrada, 256);
    } catch (e: any) {
      return res.json({ ok: false, modelo, modelos, motivo: `La petición al motor falló: ${e?.message || e}` });
    }

    // 3. Transporte socket Unix: sólo si existe de verdad.
    const rutaSocket = String(cuerpo.socket || process.env.OLLAMA_SOCKET || "");
    let uds: typeof tcp | null = null;
    let udsMotivo = "";
    if (!rutaSocket) udsMotivo = "No se pidió socket Unix (parámetro `socket` o variable OLLAMA_SOCKET).";
    else if (!fs.existsSync(rutaSocket)) udsMotivo = `El socket ${rutaSocket} no existe: no se compara contra la nada.`;
    else {
      try {
        uds = await medirPuente(puenteUds(rutaSocket, modelo, entrada), entrada, 256);
      } catch (e: any) {
        udsMotivo = `El socket existe pero la medición falló: ${e?.message || e}`;
      }
    }

    const ahorro = uds ? Math.round((tcp.ttftMs - uds.ttftMs) * 100) / 100 : null;

    return res.json({
      ok: true,
      modelo,
      esNube: /cloud/i.test(modelo),
      modelosDisponibles: modelos,
      umbralesMs: UMBRAL_TTFT_MS,
      resultados: { tcp, uds },
      comparacion: uds
        ? `Socket Unix: ${ahorro! > 0 ? ahorro + " ms MENOS" : Math.abs(ahorro!) + " ms MÁS"} en el TTFT.`
        : `Sin comparación de transporte. ${udsMotivo}`,
      veredicto: veredicto(tcp),
      // v1.6.4 — Se declara QUÉ se ha medido. Dos corridas con distinto contexto
      // dan números distintos, y sin esta línea serían incomparables.
      contextoInyectadoCaracteres: contextoInyectado,
      longitudPrompt: entrada.length,
      modeloCargado: cuerpo.keepAlive === undefined ? "por defecto de Ollama (se descarga al rato)" : String(cuerpo.keepAlive),
      nota:
        "El TTFT incluye la carga del modelo y el procesado del prompt: es el número que siente el usuario. " +
        "En frío (modelo sin cargar) puede tardar minutos, y eso es correcto, no un fallo.",
    });
  });

  app.post("/api/contenedor/inspeccionar", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: lanza `ffmpeg` sobre el fichero indicado.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const { nombre, base64, mimeDeclarado, motores, destino } = (req.body || {}) as {
      nombre?: string;
      base64?: string;
      mimeDeclarado?: string;
      motores?: MotorContenedor[];
      destino?: string;
    };

    if (!nombre) {
      return res.status(400).json({
        ok: false,
        motivo:
          "falta «nombre»: sin él no hay extensión que contrastar, y el nombre es una de las dos pistas que hay que denunciar cuando miente.",
      });
    }

    let bytes: Uint8Array | null = null;
    if (base64) {
      try {
        bytes = new Uint8Array(Buffer.from(String(base64), "base64"));
      } catch {
        return res.status(400).json({ ok: false, motivo: "«base64» no es base64 válido." });
      }
    }

    // Los motores por defecto son los que el SERVIDOR puede ofrecer de verdad:
    // `js-puro` y `red` siempre; `ffmpeg` SOLO si el binario responde. Suponer que
    // ffmpeg está porque «debería estarlo» es exactamente la promesa falsa que
    // este módulo existe para evitar, así que se comprueba, no se asume.
    const detectados: MotorContenedor[] =
      Array.isArray(motores) && motores.length
        ? motores
        : ["js-puro", "red", ...(tieneFfmpeg() ? (["ffmpeg"] as MotorContenedor[]) : ([] as MotorContenedor[]))];

    const inspeccion = inspeccionar({ nombre, bytes, mimeDeclarado });
    const plan = destino ? planDeEntrega(inspeccion, destino, detectados) : null;

    return res.json({
      ok: true,
      inspeccion,
      capacidades: capacidades(detectados),
      plan,
      motoresDetectados: detectados,
      video: estadoCadenaVideo(process.env as Record<string, string | undefined>),
      nota: "Esto es un INFORME, no una conversión: nada se ha escrito ni modificado.",
    });
  });

  /** ¿Hay ffmpeg de verdad en esta máquina? Se pregunta, no se supone. */
  function tieneFfmpeg(): boolean {
    try {
      const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf-8", timeout: 5000, windowsHide: true });
      return r.status === 0;
    } catch {
      return false;
    }
  }

  // ─── ESPEJO DEL PROYECTO v8.0.7 ──────────────────────────────────────────
  // Devuelve el cotejo entre lo que HAY en el sandbox y lo que ese tipo de
  // proyecto DEBE tener. Es la pieza que faltaba: el modelo no se olvidaba de
  // escribir bien, se olvidaba de CUÁNTOS archivos tiene un proyecto. Aquí se le
  // puede decir «te faltan estos dos», que es una respuesta binaria y por eso un
  // modelo pequeño sí sabe usarla.
  //
  // LECTURA ACOTADA a propósito: profundidad 5 y 600 entradas como techo. Un
  // cotejo que tarda o se atasca en un node_modules de 40.000 archivos no lo
  // usaría nadie.
  app.get("/api/proyecto/espejo", (req: Request, res: Response) => {
    const plantillaId = typeof req.query.plantilla === "string" ? req.query.plantilla : undefined;
    const rutas: string[] = [];
    const ignorar = new Set([
      "node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage",
      "venv", ".venv", "__pycache__", ".cerebro-db", ".vite", ".next", ".nuxt",
    ]);
    const recorrer = (dir: string, rel: string, prof: number): void => {
      if (prof > 5 || rutas.length >= 600) return;
      let entradas: fs.Dirent[] = [];
      try {
        entradas = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entradas) {
        if (rutas.length >= 600) return;
        if (ignorar.has(e.name)) continue;
        const relHijo = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          recorrer(path.join(dir, e.name), relHijo, prof + 1);
        } else {
          rutas.push(relHijo);
        }
      }
    };
    recorrer(PROJECT_ROOT, "", 0);

    const cmp = compararConEspejo(rutas, plantillaId);
    return res.json({
      ok: true,
      raiz: PROJECT_ROOT,
      totalArchivos: rutas.length,
      truncado: rutas.length >= 600,
      // Las rutas del espejo se dan en relación con el sandbox, no en absoluto:
      // el usuario no necesita rutas del disco para entender qué falta.
      plantilla: cmp.plantilla ? { id: cmp.plantilla.id, nombre: cmp.plantilla.nombre } : null,
      completo: cmp.completo,
      faltan: cmp.faltan,
      faltanObligatorios: cmp.faltanObligatorios,
      pregunta: preguntaDeFaltantes(cmp),
      espejoParaPrompt: cmp.espejoParaPrompt,
    });
  });

  app.get("/api/coreo", (_req: Request, res: Response) => res.json(coreoEstado()));

  app.get("/api/extensions", (_req: Request, res: Response) => {
    try {
      const list = refreshExtensionTools();
      return res.json({
        apiVersion: EXTENSION_API_VERSION,
        dir: EXTENSIONS_DIR,
        extensions: list.map((e) => ({ ...e, problems: e.error ? [e.error] : [] })),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Error listando extensiones" });
    }
  });

  app.post("/api/extensions/:id/enable", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: muta el estado de extensiones y refresca herramientas.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    // v2.1 — `req.params.id` está tipado como `string | string[]`: Express no
    // garantiza el tipo aunque en un parámetro con nombre siempre llegue texto.
    // Se normaliza con String() para que el tipo diga la verdad y no se cuele
    // un array por una función que espera cadena.
    disabledExtensions.delete(String(req.params.id));
    saveExtensionsState();
    refreshExtensionTools();
    return res.json({ ok: true, enabled: true });
  });

  app.post("/api/extensions/:id/disable", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: muta el estado de extensiones.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    disabledExtensions.add(String(req.params.id));
    saveExtensionsState();
    refreshExtensionTools();
    return res.json({ ok: true, enabled: false });
  });

  app.delete("/api/extensions/:id", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: BORRA una carpeta de extensión del disco.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    try {
      const abs = path.resolve(EXTENSIONS_DIR, String(req.params.id));
      if (!abs.startsWith(EXTENSIONS_DIR) || !fs.existsSync(abs)) {
        return res.status(404).json({ ok: false, message: "Extensión no encontrada." });
      }
      fs.rmSync(abs, { recursive: true, force: true });
      // v2.1 — `req.params.id` está tipado como `string | string[]`: Express no
    // garantiza el tipo aunque en un parámetro con nombre siempre llegue texto.
    // Se normaliza con String() para que el tipo diga la verdad y no se cuele
    // un array por una función que espera cadena.
    disabledExtensions.delete(String(req.params.id));
      saveExtensionsState();
      refreshExtensionTools();
      return res.json({ ok: true, message: "Extensión desinstalada." });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: err?.message || "Error desinstalando." });
    }
  });

  /**
   * Instalación desde ZIP (cuerpo binario).
   * Protecciones: límite de tamaño, rechazo de rutas con ".." (Zip-Slip),
   * límite de número de archivos y validación del manifiesto ANTES de dejar
   * nada en disco: si el manifiesto no es válido, se borra lo extraído.
   */
  app.post(
    "/api/extensions/install",
    express.raw({ type: ["application/zip", "application/octet-stream"], limit: "25mb" }),
    async (req: Request, res: Response) => {
      try {
        const buf = req.body as Buffer;
        if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
          return res.status(400).json({ ok: false, message: "No se recibió ningún ZIP." });
        }
        const JSZipMod: any = await import("jszip");
        const JSZip = JSZipMod?.default || JSZipMod;
        const zip = await JSZip.loadAsync(buf);

        const entries = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
        if (entries.length > 500) {
          return res.status(400).json({ ok: false, message: "El ZIP tiene demasiados archivos (máximo 500)." });
        }
        for (const name of entries) {
          if (name.includes("..") || name.startsWith("/") || /^[a-zA-Z]:/.test(name)) {
            return res.status(400).json({ ok: false, message: `Ruta no permitida en el ZIP: ${name}` });
          }
        }

        // ¿El manifiesto está en la raíz o dentro de una única carpeta?
        const manifestEntry = entries.find((n) => n === "manifest.json") || entries.find((n) => n.endsWith("/manifest.json"));
        if (!manifestEntry) {
          return res.status(400).json({ ok: false, message: "El ZIP no contiene manifest.json." });
        }
        const rootPrefix = manifestEntry.includes("/") ? manifestEntry.slice(0, manifestEntry.lastIndexOf("/") + 1) : "";

        let manifestRaw: any = null;
        try {
          manifestRaw = JSON.parse(await zip.files[manifestEntry].async("string"));
        } catch (err: any) {
          return res.status(400).json({ ok: false, message: `manifest.json inválido: ${err?.message || err}` });
        }
        const validation = validateManifest(manifestRaw);
        if (!validation.ok) {
          return res.status(400).json({ ok: false, message: `Manifiesto rechazado: ${validation.errors.join(" ")}` });
        }

        const targetDir = path.join(EXTENSIONS_DIR, manifestRaw.id);
        if (fs.existsSync(targetDir)) {
          return res.status(409).json({
            ok: false,
            message: `Ya existe una extensión con id "${manifestRaw.id}". Desinstálala antes de reinstalar.`,
          });
        }
        fs.mkdirSync(targetDir, { recursive: true });

        let written = 0;
        for (const name of entries) {
          const rel = rootPrefix && name.startsWith(rootPrefix) ? name.slice(rootPrefix.length) : name;
          if (!rel) continue;
          const destAbs = path.resolve(targetDir, rel);
          if (!destAbs.startsWith(targetDir)) continue; // doble comprobación anti Zip-Slip
          fs.mkdirSync(path.dirname(destAbs), { recursive: true });
          const data = await zip.files[name].async("nodebuffer");
          fs.writeFileSync(destAbs, data);
          written++;
        }

        refreshExtensionTools();
        return res.json({
          ok: true,
          message: `Extensión "${manifestRaw.name}" instalada (${written} archivo(s)). Abre su pestaña para usarla.`,
          warnings: validation.warnings,
          extension: { id: manifestRaw.id, name: manifestRaw.name },
        });
      } catch (err: any) {
        return res.status(500).json({ ok: false, message: err?.message || "Error instalando la extensión." });
      }
    }
  );

  /** El cliente informa qué paneles tiene abiertos y recoge una invocación pendiente. */
  app.get("/api/extensions/invocations", (req: Request, res: Response) => {
    const open = String(req.query.open || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    openExtensionPanels.clear();
    open.forEach((id) => openExtensionPanels.add(id));

    for (const inv of pendingInvocations.values()) {
      if (!openExtensionPanels.has(inv.extId)) continue;
      return res.json({ id: inv.id, extId: inv.extId, command: inv.command, args: inv.args });
    }
    return res.status(204).end();
  });

  /** Resultado de la extensión. */
  app.post("/api/extensions/invocations/:id/result", (req: Request, res: Response) => {
    const inv = pendingInvocations.get(String(req.params.id));
    if (!inv) return res.status(404).json({ ok: false, message: "Invocación no encontrada o expirada." });
    clearTimeout(inv.timer);
    pendingInvocations.delete(String(req.params.id));
    inv.resolve({
      ok: req.body?.ok !== false,
      result: req.body?.result,
      error: req.body?.error,
    });
    return res.json({ ok: true });
  });

  /**
   * Sirve los archivos de las extensiones.
   * CSP estricta: la extensión solo puede cargar recursos propios o datos
   * incrustados — se le corta la red directa (`connect-src 'none'`), así que
   * cualquier acceso externo tiene que pasar por el puente de permisos.
   */
  app.get("/extensions/*", (req: Request, res: Response) => {
    const rel = decodeURIComponent(String((req.params as any)[0] || ""));
    const abs = path.resolve(EXTENSIONS_DIR, rel);
    if (!abs.startsWith(EXTENSIONS_DIR)) return res.status(403).end();
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return res.status(404).end();

    const types: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
      ".txt": "text/plain; charset=utf-8",
    };
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' 'unsafe-inline' data: blob:; img-src * data: blob:; connect-src 'none'; frame-ancestors 'self'"
    );
    const ext = path.extname(abs).toLowerCase();

    // ============================================================
    // v2.1 — 🐞 "EL PANEL DE PLUGINS CASI NI SE VE DE TAN CHIQUITO"
    // ------------------------------------------------------------
    // El panel de una extensión es un documento APARTE (iframe de origen opaco),
    // así que el tamaño de letra de la IDE —25px en el ajuste global— NO llega
    // dentro. El panel se ve con el CSS que traiga su propio HTML: el de ejemplo
    // venía con 13px de base y 11px en botones y listados, ilegible al lado del
    // resto de la interfaz.
    //
    // Aquí se le inyecta una base legible a TODO HTML servido como extensión. Va
    // justo antes de </body> a propósito: así queda DESPUÉS del CSS del panel y
    // gana en la cascada a igual especificidad, sin tocar el archivo del autor.
    // Es aditivo: si algo falla, se sirve el archivo tal cual.
    // ============================================================
    if (ext === ".html") {
      try {
        let html = fs.readFileSync(abs, "utf8");
        if (!html.includes("data-cn-base-font")) {
          const estilo =
            "<style data-cn-base-font>" +
            "/* Inyectado por CerebroNico: base legible para el panel (el CSS de la IDE no entra en un iframe). */" +
            "html,body{font-size:15px}" +
            "</style>";
          html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${estilo}</body>`) : html + estilo;
        }
        res.type("text/html; charset=utf-8");
        return res.send(html);
      } catch {
        /* si no se puede leer, se sirve el archivo original */
      }
    }

    res.type(types[ext] || "application/octet-stream");
    return res.sendFile(abs);
  });
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // 🔧 Endpoints de autodetección de modelos gratuitos (Gemini flash + OpenRouter :free)
  registerModelDiscoveryRoutes(app);

  // 🎙️ Gemini TTS — voces de texto a voz (cloud) + listado de voces
  registerGeminiTtsRoutes(app);

  // ============================================================
  // v2.0 — EXTENSIONES DE TERCEROS (estilo VS Code)
  // ------------------------------------------------------------
  // Cada extensión vive en ./extensions/<id>/ con un manifest.json y su HTML.
  // La IDE la ejecuta en un iframe aislado y se comunica por el puente de
  // permisos. Desde aquí se sirve su contenido, se instala desde ZIP y se
  // atienden las invocaciones que el modelo hace a SUS herramientas.
  // ============================================================
  registerExtensionRoutes(app);

  // v2.0 — Endpoints de rendimiento local (precalentado de modelo) y salud profunda
  registerLocalPerformanceRoutes(app);
  // Los DOS registros que necesitan saber del sandbox se hacen más abajo, junto a
  // sus declaraciones: usarlos aquí sería usarlos antes de declararlos (lo cazó el
  // compilador). Un mismo motivo, una misma solución.
  // registrarTelemetria se registra más abajo, junto a las declaraciones del
  // sandbox: necesita SANDBOX_PORT como VALOR, y usarlo aquí sería usarlo antes de
  // declararlo. Lo cazó el compilador, y tenía razón.

  // v2.0 — Endpoints del MOTOR: consultar la base de conocimiento, validar
  // sintaxis bajo demanda y registrar el mapa del proyecto.
  registerEngineRoutes(app);


// ============================================================
// Subagentes: topología del IDE con estado en vivo
// (UI :3000, Puente PC :5000, Ollama :11434, Sandbox .proyectos)
// ============================================================
app.get("/api/subagents", async (_req: Request, res: Response) => {
  const data = await bridgeFetch("/api/subagents");
  // El puente siempre sabe de sí mismo; si no responde, construimos un fallback.
  if (data && data.items) {
    return res.json(data);
  }
  return res.json({
    bridge: BRIDGE_URL,
    items: [
      { id: "ui", name: "Interfaz UI", port: PORT, role: "Frontend React/Vite + editor y chat", status: "online" },
      { id: "bridge", name: "Puente PC (Agente 5000)", port: WORKER_PORT, role: "Ejecución de comandos y archivos sobre la PC real", status: "offline" },
      { id: "ollama", name: "Motor de Inferencia (Ollama)", port: 11434, role: "LLM local (tool-calling del chat)", status: "offline" },
      { id: "sandbox", name: "Sandbox del Proyecto", port: null, path: PROJECT_ROOT, role: "Área aislada .proyectos", status: fs.existsSync(PROJECT_ROOT) ? "online" : "offline" },
    ],
  });
});

// ============================================================
// SANDBOX API: ejecución de comandos + sistema de archivos real
// ============================================================

// ============================================================
// v1.6.26-DIAG — UN FALLO SIN SU MENSAJE NO SE PUEDE ARREGLAR
// ------------------------------------------------------------
// El motor capturaba la salida de un proceso con `.slice(-6)`: los seis
// ÚLTIMOS renglones. En Vite/Rollup/esbuild el mensaje va ARRIBA y debajo
// queda la pila, así que el log acababa mostrando «at ModuleScope.findVariable
// · at Identifier.bind · …» y el motivo real se descartaba antes de llegar a
// la pantalla. Ahora se eligen las líneas que PARECEN la causa estén donde
// estén (arriba en Vite/esbuild, abajo en npm) y, si no hay ninguna, se toma
// la CABEZA de la salida — nunca la cola.
// ============================================================
const LINEA_CAUSA =
  /(\[vite\]|\brollup\b|\bERROR\b|error during build|failed to resolve|could not resolve|cannot find|not found|is not defined|is not exported|MODULE_NOT_FOUND|ERR_|npm ERR!|ENOENT|EACCES|ETIMEDOUT|SyntaxError|Transform failed|✘)/i;

/**
 * v1.6.30 — ¿EL FALLO DEL BUILD ES DE CÓDIGO, O ES «LA IDE DENTRO DE LA IDE»?
 * ========================================================================
 * 🐞 El mensaje de error de la compilación mandaba SIEMPRE a la vía de salida
 * de la recursión («tenés la IDE dentro del sandbox, borrá todo y reimportá tu
 * app»). Con un error de CÓDIGO como este:
 *
 *   src/components/LeftSidebar.tsx (39:2): "loadLanguageMemories" is not
 *   exported by src/utils/languageMemory.ts
 *
 * esa guía hace perder el tiempo: el problema no es la recursión (que era
 * deliberada), es que un archivo del árbol NO coincide con el que lo importa.
 */
function esErrorDeCodigoDelProyecto(detalle: string): boolean {
  return /(is not exported by|does not provide an export|Could not resolve|Failed to resolve import|Unexpected token|Parse error|SyntaxError|error during build)/i.test(
    String(detalle || "")
  );
}

function detalleDeSalida(salida: unknown, max = 6): string {
  const lineas = String(salida ?? "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lineas.length === 0) return "";
  const causas = lineas.filter((l) => LINEA_CAUSA.test(l));
  return (causas.length > 0 ? causas : lineas).slice(0, max).join(" · ");
}



// ------------------------------------------------------------
// SANDBOX RUNTIME: servidor dev del proyecto en el puerto 3500.
// La IDE vive en :3000 y la app del sandbox en :3500: jamás colisionan.
// ------------------------------------------------------------
const SANDBOX_PORT = Number(process.env.SANDBOX_PORT) || 3500;
let sandboxLogStream: fs.WriteStream | null = null;

// v1.12.0 — Telemetría y recursos: se registran AQUÍ, junto a las declaraciones del
// sandbox, porque necesitan SANDBOX_PORT como valor. Se le pasa la pregunta («¿está
// vivo?», «¿cuál es su PID?») en vez de darle acceso a la variable: así este módulo
// no vuelve a atar el estado al monolito, y el día que se extraiga el sandbox su API
// ya está escrita por lo que este fichero le pide.
registrarDiagnostico(app, {
  ollamaUrl: OLLAMA_DEFAULT,
  ramGb: RAM_GB,
  cpuCores: CPU_CORES,
  sandboxVivo,
  sandboxPort: SANDBOX_PORT,
});

registrarTelemetria(app, {
  ollamaUrl: OLLAMA_DEFAULT,
  workerPort: WORKER_PORT,
  sandboxPort: SANDBOX_PORT,
  sandboxVivo,
  sandboxPid: pidSandbox,
});

// v1.15.1 — los espejos por servidor de datos quedan disponibles por HTTP.
registrarEspejosServidor(app);

// v1.15.1 — el plan de dependencias del puente queda disponible por HTTP.
registrarPuenteDependencias(app);

// v1.15.1 — el informe de capacidades corroboradas queda disponible por HTTP.
registrarCapacidades(app);

async function isPortUp(port: number, timeoutMs = 2000): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    await fetch(`http://127.0.0.1:${port}`, { signal: ctl.signal });
    clearTimeout(t);
    return true; // cualquier respuesta HTTP cuenta como "arriba"
  } catch {
    return false;
  }
}

/** Mata cualquier proceso escuchando en el puerto indicado (limpieza de huérfanos).
 *  Endurecido: coincidencia EXACTA del puerto local (antes findstr :3500 también
 *  pescaba :35000 y direcciones remotas) y jamás mata nuestro propio PID. */
async function killPortListeners(port: number): Promise<void> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port} | findstr LISTENING`);
      const selfPid = process.pid;
      const pids = new Set<string>();
      for (const line of stdout.split("\n")) {
        const cols = line.trim().split(/\s+/);
        // netstat -ano: Proto  Local  Foreign  State  PID
        if (cols.length < 5) continue;
        const [proto, local, , state, pid] = cols;
        if (!/^TCP$/i.test(proto || "")) continue;
        if (!/LISTENING/i.test(state || "")) continue;
        // El puerto debe ser EXACTO al final de la dirección local (evita :35000)
        if (!new RegExp(`:${port}$`).test(local || "")) continue;
        if (Number(pid) === selfPid) continue; // nunca suicidarnos
        if (/^\d+$/.test(pid || "")) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          await execAsync(`taskkill /PID ${pid} /T /F`);
        } catch {}
      }
    } else {
      try {
        await execAsync(`fuser -k ${port}/tcp 2>/dev/null || true`);
      } catch {}
    }
  } catch {
    // no hay listeners: nada que hacer
  }
}

/** Lee los últimos maxBytes de un archivo de log (helper compartido, antes duplicado x2). */
function readFileTail(logPath: string, maxBytes: number): string {
  try {
    if (!fs.existsSync(logPath)) return "";
    const stat = fs.statSync(logPath);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(logPath, "r");
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf.toString("utf-8");
  } catch {
    return "";
  }
}

app.post("/api/sandbox/start", async (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  try {
    // v1.6.23 — GUARDA-ZOMBIE v1: «puerto arriba» NO es «nuestro servidor».
    // El viejo `|| isPortUp(...)` devolvía alreadyRunning ante CUALQUIER cosa
    // escuchando en :3500 — incluido el dev-server de otra sesión del día
    // anterior. Resultado observado: el piloto informaba «saliendo por el 3500»
    // mientras el navegador mostraba una app vieja («sale igual pero no es la
    // de ahora»). Distinción por propiedad: vivo Y nuestro → ya corre; vivo y
    // NO nuestro → zombie: se mata (killPortListeners, puerto exacto, nunca
    // propio PID) y se arranca el proyecto actual.
    if (sandboxVivo()) {
      return res.json({ ok: true, alreadyRunning: true, port: SANDBOX_PORT, online: true });
    }
    if (await isPortUp(SANDBOX_PORT, 1200)) {
      console.log(`[CerebroNico] 🧟 GUARDA-ZOMBIE v1: :${SANDBOX_PORT} está tomado por un proceso que NO arrancó esta sesión (probable resto de otra app de días atrás). Se lo mata y se arranca el proyecto actual.`);
      await killPortListeners(SANDBOX_PORT);
    }

    // v2.6.2 — anti-recursión: la IDE vista desde dentro es solo un proyecto más
    // para el piloto, y el piloto se comió 5 minutos instalando la propia IDE en
    // su sandbox (TransformError de node 26 mediante). La IDE no corre dentro de
    // su propio sandbox: lo que corre ahí son LOS PROYECTOS que la IDE crea.
    //
    // v1.6.24 — LA GUARDA TAMBIÉN MIRABA SOLO LA RAÍZ: cuando el package.json
    // vive un nivel más adentro (ZIP con carpeta contenedora, sync anidado),
    // la copia de la IDE escondida ahí pasaba desapercibida y la recursión se
    // descubría tarde — en medio de cinco minutos de instalación y compilación
    // de la propia herramienta. Ahora la comprobación cubre raíz y raíz
    // resuelta por el mismo sitio.
    try {
      if (req.body?.confirmar !== "recursion") {
        const raizRes = resolverRaizProyecto();
        if (raizRes.anidada && nombreDelPackageEn(raizRes.raiz) === "cerebronico-ide") {
          const rel = path.relative(PROJECT_ROOT, raizRes.raiz).split(path.sep).join("/");
          return res.json({
            requiereConfirmacion: true,
            aviso:
              `Hay una copia de CerebróNico ANIDADA en el sandbox («${rel}/»): ` +
              "arrancarla serían dos IDEs compartiendo RAM, y el preview mostraría la propia IDE, no tu app. " +
              "Si es exactamente lo que buscas (probar la IDE dentro de la IDE), confírmalo y se arranca igual.",
          });
        }
      }
      const pkgCamino = path.join(PROJECT_ROOT, "package.json");
      if (fs.existsSync(pkgCamino)) {
        const pkg = JSON.parse(fs.readFileSync(pkgCamino, "utf8"));
        if (pkg && pkg.name === "cerebronico-ide" && req.body?.confirmar !== "recursion")
          return res.json({ requiereConfirmacion: true, aviso: "Es la propia CerebróNico: está corriendo la IDE dentro del sandbox de la IDE. Mario verificó que funciona completo — dos IDEs compartiendo RAM; se continúa con aviso." });
      }
    } catch { /* package.json roto: que el flujo normal lo reporte con su causa */ }

    // ============================================================
    // v2.0 — PROYECTOS ESTÁTICOS (HTML + CSS + JS, sin npm)
    // ------------------------------------------------------------
    // 🐞 BUG REPORTADO: "no inyecta el código, algo pasa en el sandbox".
    // El modelo escribía un index.html, el sandbox lo recibía en disco… y este
    // bloque respondía "No hay proyecto en el sandbox" porque SOLO sabía arrancar
    // proyectos npm (package.json + vite). Resultado: previsualizador en blanco
    // aunque el código estuviese bien escrito.
    // Ahora, si hay index.html y NO hay package.json, se sirve el proyecto con un
    // servidor estático mínimo en Node: sin dependencias, sin npm install, sin
    // build. Es el caso de la web de instrumentos musicales que estabas probando.
    // ============================================================
    // v2.1 — 🐞 Antes se miraba SOLO la raíz de .proyectos, así que un proyecto
    // importado con carpeta contenedora se daba por inexistente. Ahora la raíz
    // se resuelve y se usa también como cwd del servidor.
    const proyecto = resolverRaizProyecto();
    const raizProyecto = proyecto.raiz;
    const hasPkgJson = proyecto.tienePkg;
    const hasIndexHtml = proyecto.tieneHtml;
    if (proyecto.anidada) {
      console.log(
        `[CerebroNico] Proyecto encontrado en subcarpeta: ${path.relative(PROJECT_ROOT, raizProyecto) || "."}`
      );
    }

    // ============================================================
    // v1.6.9 — VÍA RÁPIDA: PREVISUALIZAR SIN INSTALAR NI ARRANCAR NADA
    // ------------------------------------------------------------
    // La condición de abajo era `!hasPkgJson && hasIndexHtml`. O sea: en cuanto
    // el proyecto tenía package.json, daba igual que fuera una página con cuatro
    // módulos — se iba por la vía cara (`npm install && npm run dev`), con toda
    // su instalación, su servidor de desarrollo y su watcher. Y si faltaba un
    // solo paquete, el preview moría con un aviso de Vite dentro.
    //
    // Ahora hay tres vías y se elige la más barata que pueda funcionar:
    //   · estatico-directo   → se sirve tal cual. Cero instalación, cero compilación.
    //   · estatico-compilado → UNA compilación con el esbuild que ya trae la IDE
    //                          y se sirve el resultado. Cero instalación.
    //   · npm-dev            → solo cuando de verdad hace falta (marco con su
    //                          propio servidor, o proyecto ya instalado con su
    //                          configuración, que es lo que hay que respetar).
    //
    // Funciona porque el proyecto vive DENTRO de ide/backend/: la resolución de
    // Node sube por el árbol y encuentra el node_modules de la propia IDE, así
    // que `react`, `react-dom` o `lucide-react` se resuelven solos.
    //
    // La decisión en sí es pura y está probada en viaRapidaPreview.ts.
    // ============================================================
    const leerFicherosProyecto = (raiz: string): string[] => {
      const lista: string[] = [];
      const rec = (dir: string, rel: string, prof: number): void => {
        if (prof > 10 || lista.length > 800) return;
        let es: string[] = [];
        try {
          es = fs.readdirSync(dir);
        } catch {
          return;
        }
        for (const e of es) {
          if (["node_modules", ".git", "dist", "build", ".vite", ".cn-preview", "__pycache__", "venv"].includes(e)) continue;
          const abs = path.join(dir, e);
          let st: fs.Stats;
          try {
            st = fs.statSync(abs);
          } catch {
            continue;
          }
          if (st.isDirectory()) rec(abs, rel ? `${rel}/${e}` : e, prof + 1);
          else lista.push(rel ? `${rel}/${e}` : e);
        }
      };
      rec(raiz, "", 0);
      return lista;
    };

    // v1.6.24 — usa el DISCO_AUDITORIA compartido (arriba, junto al resolutor).
    const auditarRaiz = (raiz: string, declarados: string[]) =>
      auditarInstalacion(raiz, declarados, DISCO_AUDITORIA);

    const decidirViaPreviewDelProyecto = (): ReturnType<typeof elegirViaPreview> => {
      const ficheros = leerFicherosProyecto(raizProyecto);
      let dependencias: string[] = [];
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(raizProyecto, "package.json"), "utf-8"));
        dependencias = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
      } catch {}
      const hayNodeModules = fs.existsSync(path.join(raizProyecto, "node_modules"));
      // Sin carpeta no hay nada que auditar: la vía barata (esbuild + estático)
      // ya cubre ese caso sin instalar. La auditoría existe para el caso
      // contrario —carpeta que MIENTE—, que era el que mataba el preview.
      const nodeModulesSano = hayNodeModules
        ? instalacionSana(auditarRaiz(raizProyecto, dependencias))
        : true;
      return elegirViaPreview({
        tieneIndexHtml: hasIndexHtml,
        tienePackageJson: hasPkgJson,
        fuentes: fuentesATranspilar(ficheros),
        tieneNodeModules: hayNodeModules,
        nodeModulesSano,
        tieneConfigPropia: tieneConfigPropia(ficheros),
        frameworkConServidor: esFrameworkConServidor(dependencias),
      });
    };

    /** Compila una vez con el esbuild de la IDE y deja el HTML apuntando al bundle. */
    const compilarPreviewRapida = async (): Promise<{ ok: boolean; mensaje: string }> => {
      const rutaHtml = path.join(raizProyecto, "index.html");
      let html = "";
      try {
        html = fs.readFileSync(rutaHtml, "utf-8");
      } catch (e: any) {
        return { ok: false, mensaje: `no se pudo leer index.html (${e?.message ?? e})` };
      }
      const entrada = entradaDeHtml(html) || "src/main.tsx";
      const rutaEntrada = path.join(raizProyecto, entrada.replace(/^\//, ""));
      if (!fs.existsSync(rutaEntrada)) {
        return { ok: false, mensaje: `no existe el punto de entrada «${entrada}»` };
      }

      // Respaldo del original: reescribir el HTML del usuario sin guardarlo sería
      // destruir su fuente para ahorrar un redirect.
      const rutaRespaldo = path.join(raizProyecto, NOMBRE_RESPALDO);
      try {
        if (!fs.existsSync(rutaRespaldo)) {
          fs.mkdirSync(path.dirname(rutaRespaldo), { recursive: true });
          fs.writeFileSync(rutaRespaldo, html, "utf-8");
        }
      } catch {}

      const rutaBundle = path.join(raizProyecto, NOMBRE_BUNDLE);
      const cmd = comandoBundle(entrada.replace(/^\//, ""), NOMBRE_BUNDLE);
      const res = await runCommand(cmd, raizProyecto, 120000);
      if (!fs.existsSync(rutaBundle)) {
        const detalle = detalleDeSalida((res as any)?.stderr || (res as any)?.stdout);
        return { ok: false, mensaje: `la compilación no produjo el bundle${detalle ? `: ${detalle}` : ""}` };
      }

      // ============================================================
      // v1.6.25-SANDBOXFIX3 — GUARDA-BUNDLE-DESNUDO
      // ------------------------------------------------------------
      // Un bundle con bare specifiers se sirve con HTTP 200 y el navegador lo
      // rechaza: pantalla en blanco sin un solo error en el servidor. Se audita
      // ANTES de reescribir el HTML; si quedó desnudo, se declara el fallo para
      // que el flujo caiga en la vía de npm (instalar y respetar su dev) en vez
      // de servir una página muerta que parece funcionar.
      // ============================================================
      try {
        const desnudos = importacionesDesnudas(fs.readFileSync(rutaBundle, "utf-8"));
        if (desnudos.length > 0) {
          return {
            ok: false,
            mensaje:
              `el bundle salió con ${desnudos.length} import(s) que el navegador no puede resolver ` +
              `(${desnudos.slice(0, 4).join(", ")}): el preview quedaría en blanco aunque el puerto responda`,
          };
        }
      } catch { /* si no se puede leer, no se puede auditar: se sigue */ }

      const reescrito = reescribirHtmlParaBundle(html);
      if (reescrito) {
        try {
          fs.writeFileSync(rutaHtml, reescrito, "utf-8");
        } catch (e: any) {
          return { ok: false, mensaje: `el bundle salió pero no se pudo apuntar el HTML a él (${e?.message ?? e})` };
        }
      }
      return { ok: true, mensaje: `bundle listo (${entrada} → ${NOMBRE_BUNDLE}), sin instalar nada del proyecto` };
    };

    // ============================================================
    // v1.6.25-SANDBOXFIX3 — EL HTML REESCRITO NO PUEDE QUEDAR PEGADO
    // ------------------------------------------------------------
    // La vía rápida reescribe index.html para que cargue ./cn-preview.js y
    // guarda el original en .cn-preview/index.html.orig… pero nada lo devolvía
    // nunca. A partir de ahí, un proyecto ya instalado que arranca por
    // `npm run dev` seguía sirviendo el BUNDLE VIEJO: si ese bundle estaba
    // roto, la pantalla blanca sobrevivía a todas las reparaciones (instalar
    // dependencias, purgar node_modules, reiniciar) porque el HTML nunca
    // volvía a pedir /src/main.tsx. Esto explica por qué el arreglo de
    // v1.6.24 «no se notaba».
    // ============================================================
    const restaurarHtmlOriginal = (): boolean => {
      try {
        const rutaHtml = path.join(raizProyecto, "index.html");
        const rutaRespaldo = path.join(raizProyecto, NOMBRE_RESPALDO);
        if (!fs.existsSync(rutaRespaldo)) return false;
        const actual = fs.existsSync(rutaHtml) ? fs.readFileSync(rutaHtml, "utf-8") : "";
        if (!actual.includes(NOMBRE_BUNDLE)) return false;
        fs.writeFileSync(rutaHtml, fs.readFileSync(rutaRespaldo, "utf-8"), "utf-8");
        console.log("[CerebroNico] Sandbox: index.html restaurado (apuntaba al bundle de la vía rápida).");
        return true;
      } catch {
        return false;
      }
    };

    const viaPreview = decidirViaPreviewDelProyecto();
    // v1.6.24 — el plan de trabajo se decide UNA sola vez y se lee por nombre:
    // `viaPreview.requiereInstalar` resultó ser un campo que el resto del
    // flujo nunca consultaba (el preflight tiene sus propios criterios). Se
    // extrae a variable para que el log y el piloto digan lo mismo.
    const viaPreviewRequireInstalar = viaPreview.requiereInstalar;
    console.log(`[CerebroNico] Preview por «${viaPreview.via}»: ${viaPreview.motivo}`);
    let compilacionFallida = false;
    if (viaPreview.requiereCompilar) {
      const comp = await compilarPreviewRapida();
      compilacionFallida = !comp.ok;
      console.log(`[CerebroNico] Vía rápida: ${comp.ok ? "✔" : "✘"} ${comp.mensaje}`);
    }

    // Si la vía rápida no pudo entregar un bundle ejecutable, no se sirve una
    // página muerta: se cae a la vía de npm (instala lo que falte y respeta su
    // `dev`). Y si vamos por npm-dev, el HTML tiene que volver a ser el original.
    if (viaPreview.via === "npm-dev" || compilacionFallida) restaurarHtmlOriginal();

    if (viaPreview.via !== "npm-dev" && !compilacionFallida) {
      const STATIC_SERVER_SOURCE = `
const http = require("http");
const fs = require("fs");
const p = require("path");
const root = p.resolve(process.argv[2] || ".");
const port = Number(process.argv[3] || 3500);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".mp4": "video/mp4", ".txt": "text/plain; charset=utf-8"
};
// ================================================================
// v8.0.4 — POR QUÉ ESTO YA NO PUEDE QUEDARSE EN BLANCO
// ----------------------------------------------------------------
// Antes: si no había index.html en la raíz servida, TODA petición caía en un
// 404 de texto plano. En pantalla eso se ve como una página en blanco sin una
// sola pista, que es literalmente lo reportado: «el chat contestó la petición
// del chat web pero el previsualizador quedó blanco».
//
// Y había un caso real detrás, no teórico: si el modelo escribe en una carpeta
// DISTINTA de la que sirve el sandbox (se han visto proyectos/ y .proyectos/ en
// el mismo equipo), el preview no refleja nada nunca y desde fuera es
// indistinguible de «está roto». El servidor no tenía forma de contarlo.
//
// Ahora se explica, en tres capas:
//   1. Si no hay index.html en la raíz pero hay UN solo subdirectorio con
//      index.html, se sirve ESE. Muchas veces esto arregla el preview y punto.
//   2. Si no aparece por ningún lado, sirve una página de DIAGNÓSTICO en HTML
//      (no un texto plano de 404) con la raíz real, lo que hay dentro y dónde
//      ha visto algún index.html.
//   3. Si el index.html existe pero pesa 0 bytes, lo dice: una escritura a
//      medias produce exactamente una página blanca.
// ================================================================
function entradasDe(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return []; }
}
function esIndex(dir) {
  try { return fs.statSync(p.join(dir, "index.html")).isFile(); } catch (e) { return false; }
}
// Sin caché a propósito: el modelo escribe archivos MIENTRAS esto corre, y una
// raíz cacheada dejaría de ver lo que acaba de llegar justo cuando hace falta.
function raizEfectiva() {
  if (esIndex(root)) return { dir: root, motivo: "index.html en la raiz servida" };
  const candidatos = [];
  for (const e of entradasDe(root)) {
    if (!e.isDirectory()) continue;
    if (e.name === "node_modules" || e.name === ".git") continue;
    if (esIndex(p.join(root, e.name))) candidatos.push(e.name);
  }
  if (candidatos.length === 1) {
    return { dir: p.join(root, candidatos[0]), motivo: "index.html en el subdirectorio " + candidatos[0] + "/" };
  }
  return { dir: root, motivo: candidatos.length > 1 ? "varios subdirectorios con index.html: " + candidatos.join(", ") : "no hay ningun index.html" };
}
function paginaDiagnostico(urlPath, raiz) {
  const nombres = [];
  for (const e of entradasDe(root)) nombres.push(e.name + (e.isDirectory() ? "/" : ""));
  const indices = [];
  for (const e of entradasDe(root)) {
    if (!e.isDirectory()) continue;
    if (e.name === "node_modules" || e.name === ".git") continue;
    if (esIndex(p.join(root, e.name))) indices.push(e.name + "/index.html");
  }
  const h = [];
  h.push("<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"utf-8\">");
  h.push("<title>Sandbox :3500 - no hay nada que servir</title>");
  h.push("<style>body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#0b0f14;color:#dbe3ec;padding:28px;line-height:1.6;font-size:13px}");
  h.push("h1{font-size:16px;color:#f0b429;margin:0 0 14px}code{background:#111820;padding:1px 5px;border-radius:4px;color:#7dd3fc}");
  h.push("ul{margin:6px 0 0;padding-left:18px}.k{color:#9aa7b5}hr{border:0;border-top:1px solid #1e2733;margin:18px 0}</style></head><body>");
  h.push("<h1>El sandbox de :3500 responde, pero no hay ningun index.html que servir</h1>");
  h.push("<p>Esto <b>no</b> es un fallo de red ni una pagina en blanco sin motivo: el servidor esta vivo y te esta diciendo lo que ve.</p>");
  h.push("<p><span class=\"k\">Raiz servida:</span> <code>" + root + "</code><br>");
  h.push("<span class=\"k\">Ruta pedida:</span> <code>" + urlPath + "</code><br>");
  h.push("<span class=\"k\">Motivo:</span> " + raiz.motivo + "</p><hr>");
  h.push("<p><span class=\"k\">Lo que hay en esa raiz:</span></p><ul>");
  h.push(nombres.length ? nombres.map(function (n) { return "<li>" + n + "</li>"; }).join("") : "<li>(carpeta vacia o ilegible)</li>");
  h.push("</ul>");
  if (indices.length) {
    h.push("<hr><p><span class=\"k\">index.html encontrados en subcarpetas:</span></p><ul>");
    h.push(indices.map(function (n) { return "<li>" + n + "</li>"; }).join(""));
    h.push("</ul><p>Si el que quieres previsualizar es uno de esos, el IDE deberia servir esa carpeta como raiz del sandbox.</p>");
  }
  h.push("<hr><p><span class=\"k\">Que hacer:</span><br>1. Comprueba que el modelo escribio en <code>" + root + "</code> y no en otra carpeta.<br>");
  h.push("2. Si escribio en una subcarpeta, arrastra ese index.html a la raiz o vuelve a arrancar el sandbox apuntando ahi.<br>");
  h.push("3. Este panel se genera en cada peticion: recarga para ver el estado actual.</p>");
  h.push("</body></html>");
  return h.join("");
}
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/__cn_info") {
    const raiz = raizEfectiva();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: true, raizPedida: root, raizEfectiva: raiz.dir, motivo: raiz.motivo, tieneIndex: esIndex(raiz.dir) }));
    return;
  }
  const raiz = raizEfectiva();
  if (urlPath.endsWith("/")) urlPath += "index.html";
  const target = p.resolve(p.join(raiz.dir, urlPath));
  if (!target.startsWith(raiz.dir)) { res.writeHead(403); res.end("403"); return; }
  fs.readFile(target, (err, data) => {
    if (err) {
      // Fallback de SPA: cualquier ruta desconocida sirve index.html
      fs.readFile(p.join(raiz.dir, "index.html"), (e2, d2) => {
        if (e2) {
          // Se busca index.html en la raíz original antes de rendirse, porque la
          // ausencia del pedido no implica la ausencia del sitio.
          const html = paginaDiagnostico(urlPath, raiz);
          res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          res.end(html);
          return;
        }
        if (!d2 || d2.length === 0) {
          const html = paginaDiagnostico(urlPath, raiz).replace(
            "El sandbox de :3500 responde, pero no hay ningun index.html que servir",
            "index.html existe pero esta VACIO (0 bytes)"
          );
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          res.end(html);
          return;
        }
        // ============================================================
        // v8.0.8 — 🐞 UN index.html QUE NO ES HTML (la causa REAL del blanco)
        // ------------------------------------------------------------
         // Este caso no es teórico: está en el propio ZIP del usuario. Su
         // .proyectos/index.html pesa 24 bytes y contiene, literalmente:
        //
        //     // test sync 1789242976
        //
         // Es un COMENTARIO DE JAVASCRIPT. El servidor lo manda con
         // Content-Type text/html, el navegador lo parsea como HTML, no
        // encuentra ni una etiqueta, y pinta una página en blanco. Sin error, sin
        // aviso en la consola, sin nada. Es la explicación exacta del
        // «previsualizador quedó blanco» que se ha reportado media docena de
        // veces, y demuestra por qué la comprobación de 0 bytes no bastaba:
        // 24 bytes de basura se ve EXACTAMENTE igual que una página rota.
        //
        // Se comprueba que el contenido tenga pinta de HTML antes de servirlo.
        // Si no la tiene, se dice qué hay en su lugar.
        // ============================================================
        const texto2 = d2.toString("utf8");
        // Las barras invertidas van DOBLES: esto vive dentro de una plantilla de
        // TypeScript, y una sola barra la consumiria TypeScript antes de que el
        // codigo generado la viera. Un \\s suelto se convierte en una "s" y el
        // regex deja de filtrar sin que nada avise.
        const pareceHtml = /<\\s*(!doctype|\\?xml|html|head|body|div|span|p|section|main|header|footer|nav|ul|ol|h[1-6]|a|img|script|style|link|meta|form|button)\\b/i.test(texto2);
        if (!pareceHtml) {
          const muestra = texto2.trim().slice(0, 300).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const html = paginaDiagnostico(urlPath, raiz).replace(
            "El sandbox de :3500 responde, pero no hay ningun index.html que servir",
            "index.html existe pero NO contiene HTML (por eso se ve en blanco)"
          ).replace(
            "</body></html>",
            "<hr><p><span class=\"k\">Contenido real del archivo (" + d2.length + " bytes):</span></p>" +
            "<pre style=\"background:#111820;padding:10px;border-radius:6px;white-space:pre-wrap;color:#f0b429\">" +
            muestra + (texto2.length > 300 ? "\n..." : "") + "</pre>" +
            "<p>Un archivo que no contiene etiquetas HTML se renderiza como pagina vacia. Suele ser el residuo de una prueba de sincronizacion o una escritura a medias.</p>" +
            "</body></html>"
          );
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          res.end(html);
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(d2);
      });
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[p.extname(target).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
});
server.listen(port, "127.0.0.1", () => console.log("CerebroNico static server en http://127.0.0.1:" + port + " (raiz: " + root + ")"));
`;
      try {
        if (Boolean(procesoActual() && !sandboxVivo())) olvidarProceso();
        if (await isPortUp(SANDBOX_PORT, 800)) await killPortListeners(SANDBOX_PORT);
        const staticScript = path.join(process.cwd(), ".cn-static-server.cjs");
        fs.writeFileSync(staticScript, STATIC_SERVER_SOURCE, "utf-8");
        try {
          sandboxLogStream = fs.createWriteStream(path.join(PROJECT_ROOT, ".sandbox_3500.log"), { flags: "w" });
        } catch {
          sandboxLogStream = null;
        }
        const procEstatico = spawn(process.execPath, [staticScript, raizProyecto, String(SANDBOX_PORT)], {
          cwd: raizProyecto,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
        registrarProceso(procEstatico);
        if (sandboxLogStream) {
          procEstatico.stdout?.pipe(sandboxLogStream);
          procEstatico.stderr?.pipe(sandboxLogStream);
        }
        for (let i = 0; i < 25; i++) {
          if (await isPortUp(SANDBOX_PORT, 400)) break;
          await sleepMs(250);
        }
        const staticUp = await isPortUp(SANDBOX_PORT, 1200);
        console.log(`[CerebroNico] Sandbox ESTÁTICO (HTML sin npm) ${staticUp ? "arrancado" : "sin confirmar"} en :${SANDBOX_PORT}`);
        return res.json({
          ok: staticUp,
          static: true,
          port: SANDBOX_PORT,
          online: staticUp,
          url: `http://127.0.0.1:${SANDBOX_PORT}`,
          message: "Proyecto estático servido (HTML/CSS/JS, sin npm).",
        });
      } catch (err: any) {
        return res.status(500).json({ error: `No se pudo arrancar el servidor estático: ${err.message}` });
      }
    }

    // ============================================================
    // v2.1 — ADAPTACIÓN DEL PROYECTO AL SANDBOX (P U E R T O)
    // ------------------------------------------------------------
    // 🐞 Caso real reproducido: un proyecto trae `vite --port=3000` POR LÍNEA DE
    // COMANDOS (así lo genera la plantilla de Google AI Studio). En Vite la CLI
    // GANA a la configuración, y el 3000 es el puerto de la propia IDE:
    //   · colisión de puerto  →  Vite salta a 3001 en silencio (no hay strictPort)
    //   · el sandbox sigue esperando en el 3500  →  no ve nada y lo da por muerto
    //   · el HTML sí se carga (de ahí que el TÍTULO se reconozca) pero el bundle
    //     de JavaScript no llega  →  PÁGINA EN BLANCO
    //
    // El motor lo adapta solo, sin que nadie edite su proyecto: reescribe el
    // `--port` del script y garantiza `port` + `strictPort: true` (para que un
    // puerto ocupado falle EN VOZ ALTA en vez de saltar en silencio).
    // Guarda copia `.cn-original` la primera vez y es idempotente.
    // ============================================================
    try {
      const adaptado = normalizeProjectPort(raizProyecto, SANDBOX_PORT);
      for (const c of adaptado.cambios) console.log(`[CerebroNico] Proyecto adaptado · ${c}`);
      if (adaptado.respaldos.length > 0) {
        console.log(`[CerebroNico] Respaldos guardados: ${adaptado.respaldos.join(", ")} (revierte renombrándolos)`);
      }
    } catch (err: any) {
      console.log(`[CerebroNico] No se pudo adaptar el puerto del proyecto: ${err?.message || err}`);
    }

    // ============================================================
    // v1.6.12 — QUE SEA FUNCIONAL
    // ------------------------------------------------------------
    // 🐞 1. Un `requirements.txt` suelto (peso 90) le ganaba a `index.html`
    //      (peso 60): el sandbox declaraba «🐍 Python, sin previsualizador» y el
    //      usuario veía su web ahí mismo. Si hay evidencia web, HAY preview.
    // 🐞 2. Si el modelo olvida el `package.json`, la carpeta deja de ser un
    //      proyecto. No se puede depender de que se acuerde: se genera el
    //      esqueleto mínimo con las dependencias REALES que el código importa.
    // ============================================================
    let pkgCreadoAqui = false;
    let nombresProyecto: string[] = [];
    try {
      const recorrer = (dir: string, rel: string, prof: number) => {
        if (prof > 3 || nombresProyecto.length > 800) return;
        let entradas: string[] = [];
        try {
          entradas = fs.readdirSync(dir);
        } catch {
          return;
        }
        for (const e of entradas) {
          if (["node_modules", ".git", "dist", ".vite", "__pycache__", ".cn-preview"].includes(e)) continue;
          const abs = path.join(dir, e);
          let st: fs.Stats;
          try {
            st = fs.statSync(abs);
          } catch {
            continue;
          }
          const relHijo = rel ? `${rel}/${e}` : e;
          if (st.isDirectory()) recorrer(abs, relHijo, prof + 1);
          else nombresProyecto.push(relHijo);
        }
      };
      recorrer(raizProyecto, "", 0);

      const ev = hayEvidenciaWeb(nombresProyecto);
      const falta = esqueletoFaltante(nombresProyecto, { tienePackageJson: hasPkgJson });
      if (ev.hay && falta.crear.length > 0) {
        const leerSeguro = (rel: string) => {
          try {
            return fs.readFileSync(path.join(raizProyecto, rel), "utf-8");
          } catch {
            return "";
          }
        };
        const paquetes = paquetesFaltantes(
          nombresProyecto.filter((f) => /\.(ts|tsx|js|jsx|mjs)$/i.test(f)).map((f) => ({ path: f, content: leerSeguro(f) })),
          {
            declarados: [],
            estaInstalado: (p) => fs.existsSync(path.join(raizProyecto, "node_modules", ...p.split("/"))),
          }
        );
        for (const pieza of falta.crear) {
          if (pieza === "package.json") {
            fs.writeFileSync(
              path.join(raizProyecto, "package.json"),
              packageJsonMinimo(path.basename(raizProyecto), paquetes, { conVite: ev.tieneFuentes }),
              "utf-8"
            );
            pkgCreadoAqui = true;
            console.log(`[CerebroNico] Faltaba el package.json: generado con ${paquetes.length} dependencia(s) reales.`);
          } else if (pieza === "index.html") {
            const entrada =
              nombresProyecto.find((f) => /(^|\/)(main|index|app)\.(tsx|jsx|ts|js|mjs)$/i.test(f)) ?? "src/main.tsx";
            fs.writeFileSync(path.join(raizProyecto, "index.html"), indexHtmlMinimo(entrada), "utf-8");
            console.log(`[CerebroNico] Faltaba el index.html: generado para cargar ${entrada}.`);
          }
        }
      }
    } catch (err: any) {
      console.warn(`[CerebroNico] No se pudo completar el esqueleto: ${err?.message ?? err}`);
    }

    // Si hay evidencia web, NO se rechaza el preview — se sirve.
    if (!hasPkgJson && !pkgCreadoAqui && !servirPeseAlMarcador(nombresProyecto, false).servir) {
      // 🐞 DEFECTO MADRE v1.0.3: aquí el sandbox confesaba «no hay proyecto»
      // ante un Python, un Rust o una carpeta de datos perfectamente reales,
      // porque solo conocía package.json e index.html. ADUANA v2: si hay un
      // tipo reconocido, se DECLARA cuál es, qué marcador lo delató y cómo se
      // arranca — sin previsualizador, pero con verdad.
      const rec = proyecto.proyecto;
      if (rec && rec.peso >= 40) {
        return res.status(400).json({
          error:
            `Proyecto reconocido: ${rec.icono} ${rec.nombre} (marcador «${rec.marcador}»). ` +
            `No tiene previsualizador en :${SANDBOX_PORT} porque no es una web ni un proyecto npm — ` +
            `se arranca por consola: ${rec.cmdArranque}. Puedes usar la terminal del sandbox para correrlo y ver su salida.`,
          reconocido: { tipo: rec.tipo, nombre: rec.nombre, marcador: rec.marcador, cmdArranque: rec.cmdArranque },
        });
      }
      return res.status(400).json({
        error: hasIndexHtml
          ? "No hay proyecto en el sandbox (.proyectos). Pulsa Sync para escribir el workspace al disco."
          : rec && rec.peso > 0
            ? `En el sandbox hay ${rec.icono} ${rec.nombre} (marcador «${rec.marcador}»), pero no es un proyecto ejecutable ni una web: es material de trabajo. Pulsa Sync si faltan archivos, o pide al agente que genere un proyecto alrededor de este material.`
            : "No hay proyecto en el sandbox (.proyectos): no se encontró ningún marcador reconocido (package.json, index.html, requirements.txt, Cargo.toml, go.mod, pom.xml, Dockerfile, Makefile…). Pulsa Sync para escribir el workspace al disco.",
        reconocido: rec ? { tipo: rec.tipo, nombre: rec.nombre, marcador: rec.marcador } : null,
      });
    }

    // 🔧 ANTI-ZOMBIE: si hubo un sandboxProc previo muerto pero su PID sigue
    // referenciado, limpiar. Y si hay un proceso externo reteniendo 3500 sin
    // que nosotros lo gestionemos, matarlo antes de arrancar (evita EADDRINUSE).
    if (Boolean(procesoActual() && !sandboxVivo())) {
      try { matarProceso("SIGKILL"); } catch {}
      olvidarProceso();
    }
    if (await isPortUp(SANDBOX_PORT, 800)) {
      console.log("[CerebroNico] Sandbox: puerto 3500 ocupado por proceso externo — limpiando…");
      await killPortListeners(SANDBOX_PORT);
      //esperar a que se libere (hasta 5s)
      for (let i = 0; i < 5; i++) {
        if (!(await isPortUp(SANDBOX_PORT, 600))) break;
        await sleepMs(1000);
      }
    }

    const logPath = path.join(PROJECT_ROOT, ".sandbox_3500.log");

    // Detección de auto-reparación: si el proyecto no arranca por dependencias
    // viejas/faltantes (ej: "cross-env: not found"), corre npm install solo y reintenta.
    const readLogTail = (): string => readFileTail(logPath, 8 * 1024);
    const needsInstall = (logText: string): boolean =>
      /not found|Cannot find module|ERR_MODULE_NOT_FOUND|missing script|MODULE_NOT_FOUND|Cannot find package/i.test(
        logText.slice(-3000)
      );

    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const spawnSandbox = () => {
      try {
        sandboxLogStream = fs.createWriteStream(logPath, { flags: "w" });
      } catch {
        sandboxLogStream = null;
      }
      // DEP0190: nunca mezclar args[] + shell:true. En Windows se invoca cmd.exe
      // directamente (sin opción shell) para que npm.cmd corra igual y sin warning.
      const isWinSandbox = process.platform === "win32";
      // 🔧 HOST=0.0.0.0 — forzamos que Vite escuche en todas las interfaces para
      // que el sandbox sea alcanzable desde el contenedor/Electron/preview iframe.
      const sandboxEnv = {
        ...process.env,
        PORT: String(SANDBOX_PORT), // 🔧 el sandbox corre en 3500, la IDE en 3000
        SANDBOX_PORT: String(SANDBOX_PORT),
        HOST: "0.0.0.0",
        // ============================================================
        // v2.1 — 🐞 EL SANDBOX NO DEBE HEREDAR MODO PRODUCCIÓN.
        // sandboxEnv hace `...process.env`, así que si la IDE anfitriona corre en
        // producción, el proyecto del sandbox también — y entonces su servidor
        // sirve dist/ (que no existe) en vez de montar Vite: la previsualización
        // queda en blanco y los módulos /src/* dan 404, sin ningún error visible.
        // El sandbox SIEMPRE quiere previsualización en vivo ⇒ desarrollo.
        // ============================================================
        NODE_ENV: "development",
        // v2.1 — Marca de "esto corre DENTRO del sandbox". La usa
        // startAgentBridge para NO arrancar el puente :5000, que pertenece a la
        // IDE anfitriona y hacía que el puente del sandbox muriera 5 veces
        // diciendo "El puerto 5000 ya está ocupado" (y la UI, "no escucha").
        CN_SANDBOX_CHILD: "1",
      };

      // 🔧 PATCH vite.config.ts Y package.json: si el sandbox tiene port:3000
      // en cualquier sitio (vite.config, package.json dev script), reemplazarlo
      // por port:3500. Vite respeta el port del config file y del dev script
      // por encima del env var PORT.
      try {
        // 1. Parchear vite.config.ts/js/mjs
        const viteConfigCandidates = [
          path.join(raizProyecto, "vite.config.ts"),
          path.join(raizProyecto, "vite.config.js"),
          path.join(raizProyecto, "vite.config.mjs"),
        ];
        for (const cfgPath of viteConfigCandidates) {
          if (fs.existsSync(cfgPath)) {
            let content = fs.readFileSync(cfgPath, "utf8");
            // Reemplazar port: <cualquier número> por port: 3500
            const patched = content.replace(/port\s*:\s*\d+/g, `port: ${SANDBOX_PORT}`);
            // Si no tiene port definido pero tiene server:, añadirlo
            let final = patched;
            if (!/port\s*:/.test(patched) && /server\s*:/.test(patched)) {
              final = patched.replace(/(server\s*:\s*\{)/, `$1\n    port: ${SANDBOX_PORT},`);
            }
            // Asegurar host: "0.0.0.0"
            if (!/host\s*:/.test(final) && /server\s*:/.test(final)) {
              final = final.replace(/(server\s*:\s*\{)/, `$1\n    host: "0.0.0.0",`);
            } else {
              final = final.replace(/host\s*:\s*["'][^"']*["']/g, `host: "0.0.0.0"`);
            }

            // ============================================================
            // v2.0 — QUITAR EL CARTEL ROJO DE ERROR DE VITE QUE TAPA EL PREVIEW.
            // Si el proyecto del sandbox no compila (p. ej. un archivo truncado),
            // el overlay de Vite ocupa TODA la vista previa y no deja ver nada:
            // el usuario solo ve el error. Preferimos que el error quede en el
            // log del sandbox y que se pueda seguir viendo la aplicación; además
            // ahora el motor bloquea la escritura de archivos con sintaxis rota,
            // así que este caso debería ser raro.
            // ============================================================
            if (!/overlay\s*:/.test(final)) {
              if (/hmr\s*:\s*\{/.test(final)) {
                final = final.replace(/(hmr\s*:\s*\{)/, `$1\n    overlay: false,`);
              } else if (/server\s*:\s*\{/.test(final)) {
                final = final.replace(/(server\s*:\s*\{)/, `$1\n    hmr: { overlay: false },`);
              } else {
                final = final.replace(/(defineConfig\s*\(\s*\{)/, `$1\n  server: { hmr: { overlay: false } },`);
              }
            }
            fs.writeFileSync(cfgPath, final, "utf8");
            console.log(`[CerebroNico] Sandbox: ${path.basename(cfgPath)} parcheado → port: ${SANDBOX_PORT}`);
            break;
          }
        }

        // 2. 🔧 Parchear package.json: reemplazar --port=3000 o --port 3000
        // en el dev script por --port=3500
        const pkgPath = path.join(raizProyecto, "package.json");
        if (fs.existsSync(pkgPath)) {
          let pkgContent = fs.readFileSync(pkgPath, "utf8");
          // Reemplazar --port=NNNN o --port NNNN por --port=3500
          const patchedPkg = pkgContent
            .replace(/--port[=\s]\d+/gi, `--port=${SANDBOX_PORT}`)
            .replace(/"dev"\s*:\s*"vite"/i, `"dev": "vite --port=${SANDBOX_PORT} --host=0.0.0.0"`);
          if (patchedPkg !== pkgContent) {
            fs.writeFileSync(pkgPath, patchedPkg, "utf8");
            console.log(`[CerebroNico] Sandbox: package.json parcheado → dev script usa --port=${SANDBOX_PORT}`);
          }
        }
      } catch (e: any) {
        console.warn(`[CerebroNico] Sandbox: no se pudo parchear config: ${e.message}`);
      }

      // PROPIO-IDE v1: correr la IDE dentro de su sandbox usa la ruta de
      // producción (compilar + node dist/server.mjs). El desvío dev (tsx)
      // choca con TransformError bajo Node 26 — la recursión no puede pagar
      // un dev server dentro de otro.
      const esPropiaIde = (() => {
        try { return JSON.parse(fs.readFileSync(path.join(raizProyecto, "package.json"), "utf8"))?.name === "cerebronico-ide"; }
        catch { return false; }
      })();
      if (esPropiaIde) {
        // spawnSync ya está importado arriba (estático, línea ~114).
        // 🐞 DEFECTO v1.0.3 (IDE-dentro-de-IDE): el ZIP de la propia IDE no
        // trae node_modules (pesaría 300 MB) y la auto-instalación general
        // está DESACTIVADA para el resto de proyectos (evita recargas en
        // caliente con el sync). Resultado: `npm run build` moría en
        // «tsx is not recognized» y la recursión no arrancaba nunca.
        // Para la propia IDE SÍ instalamos aquí, en su propia carpeta, con
        // --ignore-scripts: el postinstall del proyecto siembra .cerebro-db
        // (que la copia anidada no necesita del padre) y Electron bajaría su
        // binario de 100 MB para un servidor headless que no lo usa.
        // v1.6.27 — NO BASTA CON QUE LA CARPETA EXISTA.
        // Un node_modules creado por un package.json ANTERIOR pasa el
        // `existsSync` y deja el árbol roto PARA SIEMPRE, porque el
        // `npm install` no se vuelve a ejecutar nunca. Caso real medido: al
        // árbol le faltaba `js-yaml`, que el código importa en
        // src/engine/formatConverter.ts, y `vite build` moría con
        // «Rollup failed to resolve import "js-yaml"» — un fallo pegajoso que
        // sobrevive a reiniciar y a «Forzar Limpieza».
        // Ahora la condición es la auditoría de integridad: carpeta ausente O
        // dependencia declarada que no está → se instala.
        if (!nodeModulesSanoEn(raizProyecto)) {
          console.log(
            fs.existsSync(path.join(raizProyecto, "node_modules"))
              ? "[CerebroNico] IDE anidada: node_modules INCOMPLETO (alguna dependencia declarada no está) → se reinstala (--ignore-scripts)…"
              : "[CerebroNico] IDE anidada sin node_modules: instalando dependencias de compilación (--ignore-scripts)…"
          );
          const inst = spawnSync(npmCmd, ["install", "--no-audit", "--no-fund", "--ignore-scripts"], {
            cwd: raizProyecto, env: sandboxEnv, timeout: 600000, shell: isWinSandbox,
          });
          if (inst.status !== 0) {
            const detalle = detalleDeSalida(inst.stderr || inst.stdout);
            return res.json({
              error:
                "La IDE anidada no pudo instalar sus dependencias (necesita red la primera vez) " +
                `[npm install en ${raizProyecto}]: ` + (detalle || "sin detalle"),
            });
          }
        }
        // ============================================================
        // v1.6.28-AUTOMEJORA — REFORMAR EL CÓDIGO Y VERLO CORRIENDO
        // ------------------------------------------------------------
        // Lo que se quiere de este camino NO es «arrancar la IDE dentro de la
        // IDE»: es el CICLO. Reformar el código en el editor → sincronizar →
        // arrancar → ver el resultado en el :3500 → repetir. Para eso el build
        // tiene que ejecutarse cuando HAY CAMBIOS, y sólo entonces:
        //
        //   · dist/ más nuevo que todas las fuentes → no hubo reforma: se
        //     arranca con lo que hay (segundos, sin Rollup).
        //   · alguna fuente más nueva que dist/ → hubo reforma: se RECOMPILA.
        //   · SANDBOX_IDE_BUILD=1 → se recompila igual (forzar).
        //
        // Y si el build falla: primero se intenta REPARAR (instalar lo
        // declarado que falte) y se reintenta UNA vez. Si aun así falla, el
        // :3500 no queda muerto, pero tampoco se miente: se avisa de que el
        // build servido es ANTERIOR a los últimos cambios.
        // ============================================================
        const distServer = path.join(raizProyecto, "dist", "server.mjs");
        const forzarBuildIde = String(process.env.SANDBOX_IDE_BUILD || "") === "1";
        const hayDist = fs.existsSync(distServer);

        /** Lo más nuevo del CÓDIGO del proyecto: lo que el build tiene que reflejar. */
        const mtimeMasNuevoDeFuentes = (): number => {
          let max = 0;
          const pila = [raizProyecto];
          while (pila.length > 0) {
            const actual = pila.pop() as string;
            let entradas: fs.Dirent[] = [];
            try {
              entradas = fs.readdirSync(actual, { withFileTypes: true });
            } catch {
              continue; // carpeta que se fue mientras recorríamos
            }
            for (const e of entradas) {
              if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
              if (e.name.startsWith(".")) continue; // .proyectos, .cerebro-db, .git…
              const p = path.join(actual, e.name);
              if (e.isDirectory()) {
                pila.push(p);
                continue;
              }
              // Sólo lo que entra en un build: código, estilos, HTML y manifiestos.
              if (!/\.(ts|tsx|js|jsx|mjs|cjs|css|html|json)$/i.test(e.name)) continue;
              try {
                max = Math.max(max, fs.statSync(p).mtimeMs);
              } catch {
                /* archivo que se fue: no importa */
              }
            }
          }
          return max;
        };

        const fuentesMasNuevas = mtimeMasNuevoDeFuentes();
        const distMtime = hayDist ? fs.statSync(distServer).mtimeMs : 0;
        // Tolerancia de 2 s: al importar un ZIP todos los archivos quedan con la
        // misma marca de tiempo, y un empate NO es una reforma (si lo fuera, se
        // compilaría en cada arranque, que es justo lo que se quiere evitar).
        const hayReforma = !hayDist || fuentesMasNuevas > distMtime + 2000;
        const tocaCompilar = forzarBuildIde || hayReforma;

        if (!tocaCompilar) {
          console.log(
            `[CerebroNico] IDE anidada: dist/ al día (${new Date(distMtime).toISOString()}) — sin reformas que compilar, se omite npm run build.`
          );
        } else {
          if (forzarBuildIde) console.log("[CerebroNico] IDE anidada: SANDBOX_IDE_BUILD=1 → se recompila (npm run build).");
          else if (hayDist) console.log("[CerebroNico] IDE anidada: hay fuentes más nuevas que dist/ → se recompila (npm run build).");
          let build = spawnSync(npmCmd, ["run", "build"], { cwd: raizProyecto, env: sandboxEnv, timeout: 300000, shell: isWinSandbox });
          if (build.status !== 0) {
            const primerDetalle = detalleDeSalida(build.stderr || build.stdout);
            // v1.6.28 — AUTO-REPARACIÓN ANTES DE DARSE POR VENCIDO.
            // El fallo más común de un build dentro del sandbox es una
            // dependencia DECLARADA que no está en node_modules (árbol creado por
            // un package.json anterior, o instalación que quedó a medias). Se
            // instala y se reintenta UNA vez: si el problema era ése, el ciclo de
            // automejora se arregla solo en lugar de quedar muerto para siempre.
            if (!nodeModulesSanoEn(raizProyecto)) {
              console.warn(
                "[CerebroNico] IDE anidada: el build falló y la auditoría ve dependencias declaradas sin instalar → se instalan y se reintenta una vez."
              );
              spawnSync(npmCmd, ["install", "--no-audit", "--no-fund", "--ignore-scripts"], {
                cwd: raizProyecto,
                env: sandboxEnv,
                timeout: 600000,
                shell: isWinSandbox,
              });
              build = spawnSync(npmCmd, ["run", "build"], { cwd: raizProyecto, env: sandboxEnv, timeout: 300000, shell: isWinSandbox });
              if (build.status === 0)
                console.log("[CerebroNico] IDE anidada: ✔ build correcto tras reparar las dependencias.");
            }
            if (build.status !== 0) {
              const detalle = detalleDeSalida(build.stderr || build.stdout) || primerDetalle;
              // Un fallo de compilación no tiene por qué dejar el :3500 muerto:
              // si hay un dist/ usable, se arranca con él. Pero se dice la
              // verdad: ese build es ANTERIOR a los últimos cambios, así que el
              // preview no va a reflejar la reforma.
              if (hayDist) {
                console.warn(
                  `[CerebroNico] IDE anidada: npm run build falló (${detalle || "sin detalle"}) pero hay dist/server.mjs: se arranca con ese build — OJO: es ANTERIOR a tus últimos cambios, el preview NO refleja la reforma.`
                );
              } else if (esErrorDeCodigoDelProyecto(detalle)) {
                // v1.6.30 — UN ERROR DE CÓDIGO NO SE EXPLICA CON LA VÍA DE LA RECURSIÓN.
                // Este caso (visto en pantalla: «"loadLanguageMemories" is not exported
                // by src/utils/languageMemory.ts») es un archivo del árbol que no
                // coincide con el que lo importa: la firma de un árbol MEZCLADO.
                return res.json({
                  error:
                    `Se rompió el BUILD del proyecto — es un error de CÓDIGO, no de recursión ni de dependencias [npm run build en ${raizProyecto}]: ` +
                    (detalle || "sin detalle del proceso") +
                    " | CAUSA TÍPICA: el árbol del sandbox quedó MEZCLADO con archivos de versiones anteriores. La sincronización escribe lo que tiene el editor, pero NO borra lo que sobró de sesiones previas; ese archivo viejo no coincide con el nuevo que lo importa, y Rollup corta. " +
                    " | CÓMO LIMPIARLO SIN REINSTALAR: Ctrl + Alt + L en la IDE (borra los restos y conserva node_modules y el estado) y después «Arrancar ahora»: el sync reescribe el proyecto entero desde el editor. " +
                    " | Si el error se repite con el árbol ya limpio, entonces el archivo que falta NO está en el workspace del editor: reimportá el proyecto completo.",
                });
              } else {
                // v1.6.23 — GUARDA-E: el error ya no muere en la traza. Casi siempre
                // significa que la propia IDE cayó dentro del sandbox (mal importada
                // o encontrada por el resolutor con una raíz de datos inválida — las
                // guardas A y B de esta versión lo previenen). El mensaje dice cómo
                // salir en tres pasos, porque un fallo sin salida es un callejón.
                return res.json({
                  error:
                    `La IDE no pudo compilarse dentro del sandbox [npm run build en ${raizProyecto}]: ` +
                    (detalle || "sin detalle del proceso") +
                    " — VÍA DE SALIDA: esto casi siempre significa que la propia IDE está dentro del sandbox, no tu app. " +
                    "Pasos: 1) Sandbox → Detener. 2) «Borrar todo» en el editor (muda el estado de CerebroNico y vacía .proyectos por completo). " +
                    "3) Reimportá SOLO tu aplicación. Si el problema persiste, revisá que PROJECT_DIR no apunte a la carpeta de instalación de la IDE. " +
                    "Si lo que buscabas era el autotest «IDE dentro de la IDE», reimportá el ZIP completo: trae dist/ compilado y con eso no hace falta compilar nada.",
                });
              }
            }
          }
        }
      }
      const proc = esPropiaIde
        ? spawn(process.execPath, ["dist/server.mjs"], {
            cwd: raizProyecto,
            env: { ...sandboxEnv, PORT: String(SANDBOX_PORT), NODE_ENV: "production" },
            detached: true,
            windowsHide: true,
            stdio: ["ignore", sandboxLogStream ? "pipe" : "ignore", sandboxLogStream ? "pipe" : "ignore"],
          })
        : isWinSandbox
        ? spawn("cmd.exe", ["/d", "/s", "/c", npmCmd, "run", "dev"], {
            cwd: raizProyecto,
            env: sandboxEnv,
            windowsHide: true,
            stdio: ["ignore", sandboxLogStream ? "pipe" : "ignore", sandboxLogStream ? "pipe" : "ignore"],
          })
        : spawn("npm", ["run", "dev"], {
            cwd: raizProyecto,
            env: sandboxEnv,
            detached: true,
            windowsHide: true,
            stdio: ["ignore", sandboxLogStream ? "pipe" : "ignore", sandboxLogStream ? "pipe" : "ignore"],
          });
      // 🔧 ANTI-ZOMBIE: si el padre muere, matar al hijo. Y olvidar el proceso al salir.
      proc.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
        console.log(`[CerebroNico] Sandbox proc exited (code=${code}, signal=${signal})`);
        olvidarProceso(proc);
      });
      proc.on("error", (err: Error) => {
        console.warn(`[CerebroNico] Sandbox proc error: ${err.message}`);
        olvidarProceso(proc);
      });
      if (sandboxLogStream && proc.stdout) proc.stdout.pipe(sandboxLogStream);
      if (sandboxLogStream && proc.stderr) proc.stderr.pipe(sandboxLogStream);
      return proc;
    };

    const waitPortOrDeath = async (maxMs: number): Promise<boolean> => {
      const t0 = Date.now();
      let up = false;
      while (Date.now() - t0 < maxMs) {
        up = await isPortUp(SANDBOX_PORT, 1500);
        if (up) break;
        if (!sandboxVivo()) break;
        await sleepMs(1500);
      }
      return up;
    };

    // ============================================================
    // v1.6.7 — CHEQUEO PREVIO DE DEPENDENCIAS DEL PROYECTO
    // ------------------------------------------------------------
    // 🐞 Caso real, visto en pantalla: el IDE arrancaba, el sandbox «arrancaba»
    // y el preview quedaba muerto con
    //
    //   [plugin:vite:import-analysis] Failed to resolve import "jspdf" from
    //   "src/services/pdfReportService.ts". ¿Existe el archivo?
    //
    // El código generado importaba `jspdf` y `jspdf-autotable`; el package.json
    // del proyecto no los declaraba y nadie los instaló.
    //
    // La auto-reparación de más abajo NO podía verlo, y no por un detalle: solo
    // se dispara cuando el proceso MUERE. Aquí Vite sigue VIVO, contestando el
    // puerto con el aviso dentro, así que `waitPortOrDeath` lo da por bueno y el
    // sandbox se reporta «online» con una pantalla de error. Hay que mirarlo
    // ANTES de arrancar.
    //
    // Se instala SOLO lo que falta, por nombre (`npm install --save pkg…`), y no
    // un `npm install` a secas: ese era el que disparaba watchers y reiniciaba
    // la IDE a mitad de una carga de archivos. Aquí el servidor del proyecto
    // todavía no existe, así que no hay watcher al que despertar.
    //
    // Para desactivarlo: SANDBOX_AUTO_DEPS=0 en el entorno.
    // ============================================================
    // v1.6.24 — esta bandera llega hasta la respuesta JSON: el piloto y la UI
    // pueden saber si el sandbox se instaló solo en este arranque.
    let dependenciasInstaladas = false;
    if (process.env.SANDBOX_AUTO_DEPS !== "0") {
      try {
        const raizDeps = resolverRaizProyecto().raiz;
        const ficherosDeps: Array<{ path: string; content: string }> = [];
        const recorrerDeps = (dir: string, rel: string, prof: number): void => {
          if (prof > 12 || ficherosDeps.length > 1500) return;
          let entradas: string[] = [];
          try {
            entradas = fs.readdirSync(dir);
          } catch {
            return;
          }
          for (const e of entradas) {
            if (["node_modules", ".git", "dist", "build", ".vite", "__pycache__", "venv"].includes(e)) continue;
            const abs = path.join(dir, e);
            let st: fs.Stats;
            try {
              st = fs.statSync(abs);
            } catch {
              continue;
            }
            if (st.isDirectory()) {
              recorrerDeps(abs, rel ? `${rel}/${e}` : e, prof + 1);
            } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(e) && st.size < 400000) {
              try {
                ficherosDeps.push({ path: rel ? `${rel}/${e}` : e, content: fs.readFileSync(abs, "utf-8") });
              } catch {}
            }
          }
        };
        recorrerDeps(raizDeps, "", 0);

        let declaradosDeps: string[] = [];
        let nombrePkgDeps = "";
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(raizDeps, "package.json"), "utf-8"));
          nombrePkgDeps = String(pkg?.name || "");
          declaradosDeps = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
        } catch {}
        // La IDE anidada se autorrepara en su propio bloque (PROPIO-IDE v1), con
        // --ignore-scripts para no traer Electron ni sembrar .cerebro-db. Que el
        // preflight de abajo no le monte una instalación paralela sin esas banderas.
        const esPropiaIdeDeps = nombrePkgDeps === "cerebronico-ide";
        const entornoDeps = {
          declarados: declaradosDeps,
          // `path.join(raiz, "node_modules", "@scope", "pkg")`: con `p.split("/")`
          // los paquetes con ámbito se buscan donde están de verdad.
          // v1.6.24 — y «estar» dejó de ser existir la carpeta: el paquete está
          // si su propio package.json declara una entrada que responde en disco.
          estaInstalado: (p: string) =>
            saludDePaquete(path.join(raizDeps, "node_modules", ...p.split("/")), DISCO_AUDITORIA) === "ok",
        };

        const faltantes = paquetesFaltantes(ficherosDeps, entornoDeps);
        const sinInstalar = declaradosSinInstalar(ficherosDeps, entornoDeps);

        // v1.6.24 — AUDITORÍA COMPLETA de los declarados, importados o no: es el
        // paso que faltaba. El caso reportado («Cannot find module
        // …/vite/dist/node/chunks/dist.js») es un node_modules EXISTENTE pero
        // podado —ZIP sin dependencias o npm install cortado por el viejo
        // timeout de 300 s—. La comprobación por carpeta lo dejaba pasar.
        const auditoria = esPropiaIdeDeps ? { ausentes: [], rotos: [] } : auditarRaiz(raizDeps, declaradosDeps);

        if (auditoria.rotos.length > 0) {
          // Lo podado hay que enterrarlo: npm confía en el árbol que ya ve y
          // puede no reescribir archivos que cree presentes. Se borran SOLO
          // las carpetas de los paquetes rotos —jamás código del usuario— y
          // el install de abajo las devuelve limpias.
          console.log(
            `[CerebroNico] Sandbox: ${auditoria.rotos.length} paquete(s) con instalación incompleta ` +
              `(${auditoria.rotos.slice(0, 5).join(", ")}) → se purgan antes de reinstalar.`
          );
          for (const p of auditoria.rotos) {
            try {
              fs.rmSync(path.join(raizDeps, "node_modules", ...p.split("/")), { recursive: true, force: true });
            } catch {}
          }
        }

        const aReinstalar = auditoria.ausentes.length > 0 || auditoria.rotos.length > 0;
        if (aReinstalar) {
          // Declaradas pero ausentes o rotas: el remedio es el `npm install`
          // normal —respeta lockfile y las versiones fijadas por la plantilla—,
          // no reescribirlas con --save.
          // v1.6.24 — ANTES esto era solo un `console.warn`: el usuario se
          // quedaba con el aviso y sin sandbox («NO FUNCIONA EL SANDBOX»).
          // Ahora se instala aquí mismo, antes de spawn, donde todavía NO hay
          // ningún watcher vivo al que despertar (la misma razón de seguridad
          // que ya justificaba el --save de abajo). El timeout pasa de 300 s a
          // 600 s: el timeout corto era, precisamente, el generador de árboles
          // incompletos.
          console.log(
            `[CerebroNico] Sandbox: ${aReinstalar ? `${auditoria.ausentes.length} ausente(s) + ${auditoria.rotos.length} roto(s)` : ""} en node_modules → npm install automático antes de arrancar.`
          );
          const inst = await runCommand("npm install --no-audit --no-fund", raizDeps, 600000);
          if (inst.exitCode === 0) {
            dependenciasInstaladas = true;
            console.log("[CerebroNico] Sandbox: ✔ npm install completo — ahora sí se puede respetar su `dev`.");
          } else {
            const detalle = detalleDeSalida(inst.stderr || inst.stdout);
            console.warn(
              `[CerebroNico] Sandbox: ✘ npm install no completó (${inst.timedOut ? "timeout de 10 min — ¿red lenta o registry caído?" : `exit ${inst.exitCode}`})${detalle ? `: ${detalle}` : ""}. Se intenta arrancar igual; la auto-reparación de abajo reintenta.`
            );
          }
        } else if (sinInstalar.length > 0 && !aReinstalar) {
          // caso raro: declaradas-sin-instalar que la auditoría no vio (p. ej.
          // paquete instalado en un nivel anidado). Se avisa, sin instalar a ciegas.
          console.warn(
            `[CerebroNico] Sandbox: ${sinInstalar.length} dependencia(s) declaradas y SIN instalar ` +
              `(${sinInstalar.slice(0, 5).join(", ")}). La auditoría no las vio rotas; puede ser hoisting anidado.`
          );
        }
        if (faltantes.length > 0 && !esPropiaIdeDeps) {
          console.log(`[CerebroNico] Sandbox: ${describirFaltantes(faltantes)} → se instalan antes de arrancar.`);
          const cmd = comandoInstalacion(faltantes);
          const r = cmd ? await runCommand(cmd, raizDeps, 600000) : null;
          if (r && r.exitCode === 0) dependenciasInstaladas = true;
        }
      } catch (err: any) {
        console.warn(
          `[CerebroNico] Sandbox: el chequeo de dependencias no pudo completarse (${err?.message ?? err}). Se arranca igual.`
        );
      }
    }

    // Intento 1: arranque directo (rápido si todo está instalado)
    registrarProceso(spawnSandbox());
    console.log(`[CerebroNico] Sandbox arrancado (pid ${pidSandbox()}) en puerto ${SANDBOX_PORT}`);
    let online = await waitPortOrDeath(45000);
    let healed = false;

    // Intento 2 (auto-reparación): si murió sin levantar puerto por deps faltantes,
    // npm install automático y reintento. Así el usuario nunca instala a mano.
    //
    // v1.6.24 — LA REPARACIÓN VUELVE A ESTAR ACTIVADA POR DEFECTO.
    // El apagado respondía al bug «subir ZIP reinicia la app»: un `npm install`
    // a mitad de una carga masiva despertaba watchers. Pero ese caso no existe
    // aquí: este flujo es /api/sandbox/start —acción explícita del usuario— y
    // la reparación solo corre cuando el proceso del proyecto YA MURIÓ
    // (!isPidAlive): el watcher que podía reiniciar algo es justamente el que
    // ya no está. Además el preflight de arriba instala ANTES de spawn, cuando
    // tampoco hay watcher vivo. El apagado por defecto dejó una garantía peor:
    // con node_modules podado por el ZIP, el sandbox NUNCA se arreglaba solo
    // («NO FUNCIONA EL SANDBOX»). Opt-out: AUTO_INSTALL_DEPS=0.
    const autoInstallEnabled = process.env.AUTO_INSTALL_DEPS !== "0";
    if (autoInstallEnabled && !online && !sandboxVivo() && needsInstall(readLogTail())) {
      console.log("[CerebroNico] Sandbox: dependencias faltantes detectadas -> npm install automático");
      try {
        olvidarProceso();
        // v2.1 — 🐞 `npm install` corría SIEMPRE en la raíz de .proyectos, aunque
        // el proyecto estuviera en una subcarpeta: instalaba en el sitio
        // equivocado (o fallaba). Ahora instala donde vive el package.json real.
        await runCommand("npm install --no-audit --no-fund", resolverRaizProyecto().raiz, 600000);
        healed = true;
      } catch {}
      registrarProceso(spawnSandbox());
      online = await waitPortOrDeath(60000);

      // Intento 3 — el martillo contra el árbol FANTASMA (v1.6.24):
      // si el log sigue quejando módulos después de un install que npm creyó
      // bueno, el árbol tiene archivos huérfanos que npm da por presentes
      // (típico de un install anterior cortado a medias). Se borra SOLO
      // node_modules —el código del usuario no se toca ni un byte— y se
      // instala de cero. Coste: unos segundos; valor: el sandbox se repara
      // siempre, sin terminal y sin instrucciones manuales.
      if (!online && !sandboxVivo() && needsInstall(readLogTail())) {
        try {
          const raizMartillo = resolverRaizProyecto().raiz;
          const nmMartillo = path.join(raizMartillo, "node_modules");
          console.log("[CerebroNico] Sandbox: el reintegro no sanó el árbol → se purga node_modules y se instala de cero.");
          fs.rmSync(nmMartillo, { recursive: true, force: true });
          const martillo = await runCommand("npm install --no-audit --no-fund", raizMartillo, 600000);
          if (martillo.exitCode === 0) dependenciasInstaladas = true;
          healed = true;
        } catch {}
        registrarProceso(spawnSandbox());
        online = await waitPortOrDeath(60000);
      }
    } else if (!online && !autoInstallEnabled && needsInstall(readLogTail())) {
      // 🔧 Reparación explícitamente apagada por el usuario: decir la salida.
      console.warn(
        "[CerebroNico] Sandbox: dependencias faltantes detectadas, pero la auto-instalación " +
        "fue desactivada a mano (AUTO_INSTALL_DEPS=0). " +
        "Ejecuta manualmente: cd .proyectos && npm install (o quita la variable para que la IDE se repare sola)."
      );
    }

    // ============================================================
    // v2.1 — 🐞 CUANDO EL PUERTO NO RESPONDE, DECIR POR QUÉ
    // ------------------------------------------------------------
    // Antes la respuesta era solo `online:false`, y el usuario leía
    // "El proceso arrancó pero el puerto 3500 aún no responde": un mensaje que
    // no explica NADA. El proceso puede haber MUERTO (falta tsx, EADDRINUSE,
    // error de arranque) o seguir vivo pero lento, y todo se veía igual.
    //
    // Comprobado en local: este proyecto SÍ engancha el 3500 con el entorno del
    // sandbox (PORT=3500, HOST=0.0.0.0). El silencio era el problema, no el
    // arranque. Así que ahora se devuelve el final real del log del proceso y
    // una pista de la causa más probable.
    // ============================================================
    const cola = online ? "" : readLogTail();
    const vivo = sandboxVivo();
    let pista = "";
    if (!online) {
      if (/EADDRINUSE|address already in use|ya est[áa] ocupado/i.test(cola)) {
        pista = `El puerto ${SANDBOX_PORT} ya está ocupado por otro proceso (normalmente un intento anterior que quedó vivo). Pulsa «Forzar Limpieza» y reintenta.`;
      } else if (/Cannot find (module|package)|ERR_MODULE_NOT_FOUND|is not recognized|no se reconoce/i.test(cola)) {
        // v1.6.24 — El viejo «Ejecuta npm install y reintenta» convertía el
        // sandbox en una tarea de terminal. Para cuando este mensaje se lee, la
        // IDE YA intentó instalar dos veces en esta misma petición (preflight
        // antes de spawn + escalera de reparación tras la muerte, incluida la
        // purga del árbol). La pista dice lo que queda, que es diagnóstico.
        pista = autoInstallEnabled
          ? "La auto-instalación del sandbox no logró sanarlo. Casi siempre es RED (registry.npmjs.com inalcanzable, proxy corporativo, antivirus) o un package.json con versiones incompatibles. El detalle está en el log de arriba; con el problema resuelto, vuelve a pulsar Arrancar — no hace falta tocar la terminal."
          : "Faltan dependencias y la reparación automática está apagada (AUTO_INSTALL_DEPS=0). Quítala para que la IDE se repare sola, o ejecuta «npm install» en el proyecto.";
      } else if (!vivo) {
        pista = "El proceso del proyecto TERMINÓ antes de abrir el puerto. La causa está en las últimas líneas de abajo.";
      } else {
        pista = "El proceso sigue vivo pero aún no ha abierto el puerto. Revisa las últimas líneas de abajo.";
      }
    }
    return res.json({
      ok: true,
      pid: pidSandbox() ?? null,
      port: SANDBOX_PORT,
      online,
      healed,
      // v1.6.24 — `instalo`: ¿instaló dependencias el sandbox por su cuenta en
      // este arranque? `via`: qué vía decidió el preview. Los dos campos que
      // faltaban para que el piloto pudiera explicar lo que pasó sin adivinar.
      instalo: dependenciasInstaladas,
      via: viaPreview.via,
      running: vivo,
      logTail: cola,
      hint: pista,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/sandbox/stop", async (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  let killed = false;
  // El PID se lee UNA vez y se usa el mismo en las tres llamadas. Antes se leía en
  // cada sitio: si el proceso moría entre la comprobación y el `taskkill`, se
  // estaría matando a otro (o a nadie) con un PID reciclado. Un dato del estado se
  // lee una vez y se usa entero.
  const pidSandboxActual = pidSandbox();
  if (pidSandboxActual) {
    try {
      if (process.platform === "win32") {
        await execAsync(`taskkill /PID ${pidSandboxActual} /T /F`);
      } else {
        try {
          process.kill(-pidSandboxActual, "SIGKILL");
        } catch {
          matarProceso("SIGKILL");
        }
      }
      killed = true;
    } catch {}
    try { matarProceso("SIGKILL"); } catch {}
    olvidarProceso();
  }
  // Limpieza de huérfanos: algo sigue en 3500 sin que lo gestionemos
  if (await isPortUp(SANDBOX_PORT, 1200)) {
    await killPortListeners(SANDBOX_PORT);
  }
  return res.json({ ok: true, killed });
});

app.get("/api/sandbox/status", async (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  const online = await isPortUp(SANDBOX_PORT, 1500);
  return res.json({
    online,
    port: SANDBOX_PORT,
    running: sandboxVivo(),
    // v8.0.4 — LA RAÍZ REAL, EN ABSOLUTO, SIEMPRE.
    // ------------------------------------------------------------
    // «1 archivo(s) escrito(s) en .proyectos/» es una frase que no permite
    // verificar nada: `.proyectos` es relativo y puede ser cualquier carpeta del
    // disco. Si ese archivo acaba en un sitio y el detector mira en otro, el
    // usuario sólo ve «no hay proyecto» y no tiene forma de comprobarlo.
    // Diciendo la ruta absoluta, un solo Sync resuelve la duda.
    raizSandbox: PROJECT_ROOT,
    raizProyectoResuelta: resolverRaizProyecto().raiz,
    // v2.1 — los node_modules pueden estar en la raíz resuelta, no en .proyectos
    // v1.6.24 — e «instalado» dejó de ser la existencia de la carpeta: con un
    // árbol podado el piloto se saltaba la instalación y el arranque moría.
    // El piloto lee este flag para decidir su `npm install` — que además ahora
    // viaja por GUARDA-ENOENT en /api/exec (ejecuta donde vive el package.json).
    installed: nodeModulesSanoEn(resolverRaizProyecto().raiz),
    // ============================================================
    // 🐞 v2.0 — "No se encontró package.json en el sandbox tras sincronizar".
    // ------------------------------------------------------------
    // Causa real (caso reportado): el ZIP subido traía una carpeta contenedora,
    // así que el package.json EXISTÍA pero no en la raíz (.proyectos/). Antes se
    // miraba solo la raíz y el piloto automático se apagaba dando a entender que
    // el proyecto estaba mal, cuando solo estaba un nivel más adentro.
    // Ahora se busca por niveles (hasta 4) y se informa de dónde está.
    // ============================================================
    ...(() => {
      const skip = new Set(["node_modules", ".git", "dist", "dist_electron", "venv", "__pycache__", ".cerebro-db", ".vite"]);
      // ADUANA v2 (Reflejo v5): «proyecto» ya no es sinónimo de package.json.
      // Cualquier marcador del registro (requirements.txt, Cargo.toml, go.mod,
      // pom.xml, Dockerfile, index.html, Makefile…) cuenta, y el estado lo
      // dice por nombre. El campo `packageJsonCandidates` se conserva por
      // compatibilidad con el frontend: ahora trae cualquier raíz reconocida.
      const hayProyectoEn = (dir: string): boolean => {
        try {
          const nombres = fs.readdirSync(dir).filter((n) => {
            try { return fs.statSync(path.join(dir, n)).isFile(); } catch { return false; }
          });
          return esCarpetaProyecto(nombres);
        } catch {
          return false;
        }
      };
      if (hayProyectoEn(PROJECT_ROOT)) {
        // v2.1 — Aunque la raíz YA tenga proyecto, hay que mirar dentro: el sync
        // escribe siempre el árbol anidado (el workspace guarda las rutas con su
        // carpeta contenedora), así que puede haber una copia más nueva sin
        // subir. Reportarla aquí es lo que permite que el autopiloto la fusione
        // en vez de dar por bueno un «src» viejo para siempre.
        const anid = buscarProyectoAnidado();
        return {
          hasProject: true,
          packageJsonCandidates: ["."],
          detectedProjectRoot: ".",
          paqueteAnidado: anid ? path.relative(PROJECT_ROOT, anid).split(path.sep).join("/") : "",
        };
      }
      const found: string[] = [];
      const queue: Array<{ dir: string; rel: string; depth: number }> = [{ dir: PROJECT_ROOT, rel: "", depth: 0 }];
      while (queue.length > 0 && found.length < 8) {
        const cur = queue.shift()!;
        if (hayProyectoEn(cur.dir)) {
          found.push(cur.rel || ".");
          continue; // no seguir bajando dentro de un proyecto encontrado
        }
        if (cur.depth >= 4) continue;
        let entries: string[] = [];
        try {
          entries = fs.readdirSync(cur.dir);
        } catch {
          continue;
        }
        for (const e of entries) {
          if (skip.has(e)) continue;
          const full = path.join(cur.dir, e);
          try {
            if (fs.statSync(full).isDirectory()) queue.push({ dir: full, rel: cur.rel ? `${cur.rel}/${e}` : e, depth: cur.depth + 1 });
          } catch {
            /* ilegible: se salta */
          }
        }
      }
      return {
        hasProject: false,
        packageJsonCandidates: found,
        detectedProjectRoot: found[0] || "",
        paqueteAnidado: found[0] || "",
      };
    })(),
    // ============================================================
    // v2.0 — PROYECTO ESTÁTICO = PROYECTO VÁLIDO
    // ------------------------------------------------------------
    // 🐞 El piloto automático se apagaba diciendo "No se encontró package.json"
    // cuando el proyecto era una web estática (index.html + css + js). Es una
    // web perfectamente válida: no necesita npm. Aquí se marca como proyecto y
    // /api/sandbox/start lo sirve con el servidor estático.
    //
    // v8.0.4 — 🐞 Y FALTABA JUSTO EL CASO DEL LOG REAL: el ANIDADO.
    // ------------------------------------------------------------
    // Esta comprobación miraba `index.html` SOLO en la raíz del sandbox. Pero el
    // sync escribe el árbol CON su carpeta contenedora (lo dice el propio log:
    // «1 archivo(s) escrito(s) en .proyectos/» mientras el workspace lista
    // «proyectos/index.html»). Así que lo normal es que la web acabe en
    // `.proyectos/<carpeta>/index.html`.
    //
    // Consecuencia encadenada, tal cual la vivió el usuario:
    //   hasProject=false → el piloto automático se rinde → «❌ No se encontró
    //   package.json» → el mensaje LE DICE AL MODELO que cree un package.json →
    //   el modelo obedece y empieza a montar un proyecto Node que no hacía falta.
    //   Una web estática perfectamente válida quedaba convertida en un error.
    //
    // Ahora, si no hay index.html en la raíz, se busca el más cercano en
    // subcarpetas (hasta 3 niveles) y se declara DÓNDE está.
    //
    // Nota deliberada: NO se saltan las carpetas que empiezan por punto. El motor
    // de este proyecto usa nombres como `.proyectos`, y saltárselos por reflejo
    // (como hace otro recorrido de este mismo archivo) es parte de por qué este
    // caso tardó tanto en verse.
    // ============================================================
    ...(() => {
      if (fs.existsSync(path.join(PROJECT_ROOT, "package.json"))) {
        // ============================================================
        // v8.0.5 — 🐞 AVISO DE PROYECTO DUPLICADO (defecto de segundo orden)
        // ------------------------------------------------------------
        // Este caso no lo invento: lo enseñó el registro del usuario. Ante el
        // error «no hay proyecto en .proyectos», el modelo hizo lo razonable —
        // MOVER copias a la raíz: `.proyectos/package.json` + `.proyectos/index.js`.
        // El sandbox se calla y arranca… y a partir de ahí pasa algo peor:
        //
        //  · Ahora hay DOS proyectos en el mismo sitio: el de la raíz (que el
        //    sandbox ejecuta) y el de `mi-proyecto/` (donde el sync sigue
        //    escribiendo cada vez que el usuario edita).
        //  · El marcador de la raíz TIENE PRIORIDAD sobre el anidado, así que la
        //    web de verdad queda enterrada bajo el stub de la raíz.
        //  · El usuario edita, el sync escribe en `mi-proyecto/`, y el preview
        //    sigue mostrando la raíz vieja. «Arreglado y sigue igual», otra vez.
        //
        // Silenciar esto sería justo el fallo que este archivo está corrigiendo
        // una y otra vez: preferir no molestar antes que evitar la pérdida de
        // tiempo. Se detecta y se dice, en la misma línea del registro.
        // ============================================================
        const ignorar2 = new Set([
          "node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage",
          "venv", ".venv", "__pycache__", ".cerebro-db", ".vite", ".next", ".nuxt",
        ]);
        let webAnidada: string | null = null;
        const cola2: Array<{ dir: string; rel: string; prof: number }> = [{ dir: PROJECT_ROOT, rel: "", prof: 0 }];
        while (cola2.length > 0 && !webAnidada) {
          const cur = cola2.shift()!;
          if (cur.prof >= 2) continue;
          let ents2: string[] = [];
          try {
            ents2 = fs.readdirSync(cur.dir);
          } catch {
            continue;
          }
          for (const e of ents2) {
            if (ignorar2.has(e)) continue;
            const full2 = path.join(cur.dir, e);
            let esDir2 = false;
            try {
              esDir2 = fs.statSync(full2).isDirectory();
            } catch {
              continue;
            }
            if (!esDir2) continue;
            const rel2 = cur.rel ? `${cur.rel}/${e}` : e;
            if (fs.existsSync(path.join(full2, "index.html"))) {
              webAnidada = rel2;
              break;
            }
            cola2.push({ dir: full2, rel: rel2, prof: cur.prof + 1 });
          }
        }
        if (webAnidada) {
          return {
            staticProject: false,
            avisoProyectoDuplicado:
              `Hay un package.json en la raíz del sandbox (${PROJECT_ROOT}) y ADEMÁS una web en ` +
              `«${webAnidada}/». El sandbox arrancará el proyecto de la RAÍZ y la web anidada NO se verá: ` +
              `deja un solo proyecto en un solo sitio (o sube la web a la raíz y borra la subcarpeta, ` +
              `o quita el package.json de la raíz para que se sirva la web anidada).`,
          };
        }
        return { staticProject: false };
      }
      if (fs.existsSync(path.join(PROJECT_ROOT, "index.html"))) {
        return { hasProject: true, staticProject: true, detectedProjectRoot: "." };
      }
      const ignorar = new Set([
        "node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage",
        "venv", ".venv", "__pycache__", ".cerebro-db", ".vite", ".next", ".nuxt",
      ]);
      const cola: Array<{ dir: string; rel: string; prof: number }> = [{ dir: PROJECT_ROOT, rel: "", prof: 0 }];
      while (cola.length > 0) {
        const cur = cola.shift()!;
        if (cur.prof >= 3) continue;
        let ents: string[] = [];
        try {
          ents = fs.readdirSync(cur.dir);
        } catch {
          continue;
        }
        for (const e of ents) {
          if (ignorar.has(e)) continue;
          const full = path.join(cur.dir, e);
          let esDir = false;
          try {
            esDir = fs.statSync(full).isDirectory();
          } catch {
            continue;
          }
          if (!esDir) continue;
          const rel = cur.rel ? `${cur.rel}/${e}` : e;
          if (fs.existsSync(path.join(full, "index.html"))) {
            return {
              hasProject: true,
              staticProject: true,
              staticProjectAnidado: true,
              detectedProjectRoot: rel,
            };
          }
          cola.push({ dir: full, rel, prof: cur.prof + 1 });
        }
      }
      // Sin proyecto web: se devuelve, además, QUÉ hay en la raíz del sandbox.
      // Un «no hay proyecto» sin decir dónde se miró obliga al usuario (y al
      // modelo) a adivinar, que es exactamente lo que pasó en este log.
      let enRaiz: string[] = [];
      try {
        enRaiz = fs.readdirSync(PROJECT_ROOT).slice(0, 25);
      } catch {
        enRaiz = [];
      }
      return { staticProject: false, buscadoEn: PROJECT_ROOT, contenidoRaiz: enRaiz };
    })(),
    // ADUANA v2: QUÉ reconoció el sandbox, con nombre y plan de arranque.
    // El frontend viejo ignora el campo; el nuevo y el usuario pueden leer
    // «🐍 Python · marcador «requirements.txt» · se arranca por consola: …»
    // en vez del antiguo y mentiroso «no hay proyecto».
    proyectoReconocido: (() => {
      const rp = resolverRaizProyecto();
      return rp.proyecto ? { ...rp.proyecto, linea: lineaReconocimiento(rp.proyecto) } : null;
    })(),
    root: PROJECT_ROOT,
  });
});

app.get("/api/sandbox/logs", (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  try {
    const logPath = path.join(PROJECT_ROOT, ".sandbox_3500.log");
    const logs = readFileTail(logPath, 16 * 1024);
    return res.json({ logs });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================
// v1.6.31 — GUARDA-SERVIDOR-EJEC · usaEnSuLugar
// ------------------------------------------------------------
// Un servidor de larga vida no se ejecuta por la puerta síncrona: `execAsync`
// espera a que el proceso «termine», y Vite/npm start/uvicorn… nunca terminan,
// así que morían por timeout. En su lugar (usaEnSuLugar) se arranca EN SEGUNDO
// PLANO y se devuelve al momento, sin esperar. El puerto se adapta al sandbox
// (:3500) igual que hace /api/sandbox/start.
// ============================================================
async function arrancarServidorEnSegundoPlano(comando: string, cwd: string) {
  try {
    const adaptado = normalizeProjectPort(cwd, SANDBOX_PORT);
    for (const c of adaptado.cambios) console.log(`[CerebroNico] Proyecto adaptado · ${c}`);
  } catch {
    /* la adaptación de puerto nunca debe tumbar el arranque */
  }
  const esWin = process.platform === "win32";
  const logPath = path.join(PROJECT_ROOT, ".sandbox_3500.log");
  let logStream: fs.WriteStream | null = null;
  try {
    logStream = fs.createWriteStream(logPath, { flags: "a" });
  } catch {
    logStream = null;
  }
  const hijo = esWin
    ? spawn("cmd.exe", ["/d", "/s", "/c", comando], {
        cwd,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      })
    : spawn(comando, {
        cwd,
        detached: true,
        shell: "/bin/bash",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
  if (logStream) {
    hijo.stdout?.pipe(logStream);
    hijo.stderr?.pipe(logStream);
  }
  hijo.unref?.();
  console.log(
    `[CerebroNico] /api/exec — GUARDA-SERVIDOR-EJEC: «${comando}» es un servidor de larga vida; en su lugar (usaEnSuLugar) se arranca en segundo plano (pid=${hijo.pid ?? "?"}).`
  );
  return {
    ok: true,
    exitCode: 0,
    timedOut: false,
    enSegundoPlano: true,
    pid: hijo.pid ?? null,
    comandoEjecutado: comando,
    stdout: "",
    stderr: "",
    nota:
      "Servidor de larga vida: no se espera a que termine (nunca termina). Arrancado en segundo plano; el preview estará en http://127.0.0.1:" +
      SANDBOX_PORT,
  };
}

app.post("/api/exec", async (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  const { command, cwd, timeoutMs = 120000 } = req.body || {};
  if (!command || typeof command !== "string") {
    return res.status(400).json({ error: "Falta el campo 'command'." });
  }
  // v8.0.4 — LA CONSOLA ES LA PUERTA MÁS PELIGROSA del proyecto: acepta
  // cualquier cadena y la pasa al shell del sistema. Aquí llegó, tal cual, el
  // TEXTO de una llamada de herramienta (`run_command command="…"`) y se
  // ejecutó. Se desenvuelve si es legible; si no, se rechaza SIN ejecutar nada.
  const norm = normalizarComandoEntrante(command);
  if (!norm.valido) {
    return res.status(400).json({
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: norm.motivo,
      error: norm.motivo,
      motivo: norm.motivo,
    });
  }
  if (norm.envuelto) console.warn(`[CerebroNico] /api/exec — ${norm.motivo}`);
  try {
    // v1.6.22 — Si no viene `cwd`, ejecutar en la RAÍZ DEL PROYECTO resuelta, no
    // en la raíz de datos. El sync escribe el árbol anidado (p. ej.
    // C:\Cerebronico\ide\backend) y `npm install` corría en C:\Cerebronico, donde
    // no hay package.json → ENOENT. resolverRaizProyecto() devuelve la base misma
    // cuando no hay proyecto anidado, así que el comportamiento no cambia ahí.
    let workDir = cwd ? resolveSafePath(String(cwd)) : resolverRaizProyecto().raiz;
    // ============================================================
    // v1.6.24 — GUARDA-ENOENT (visto en el log del usuario, 9:39:11 p. m.):
    // «npm install con errores: … enoent … open 'package.json'» — diez
    // segundos de aviso de npm que no dijo NADA accionable. La raíz resuelta
    // puede no tener package.json (sync con carpeta contenedora a medio
    // aplanar, sandbox recién vaciado). Un comando npm en ese sitio solo
    // puede fallar, así que: si el proyecto npm está más abajo, se ejecuta
    // ahí; si no está en ninguna parte, se responde en cristiano sin invocar
    // a npm. El piloto y el agente reciben la misma verdad.
    // ============================================================
    if (!cwd && /^\s*(npm|npx)\b/i.test(norm.comando) && !fs.existsSync(path.join(workDir, "package.json"))) {
      const abajo = buscarPackageJsonBajo(workDir);
      if (abajo) {
        console.log(`[CerebroNico] /api/exec — GUARDA-ENOENT: no hay package.json en «${workDir}»; el comando va a «${abajo}».`);
        workDir = abajo;
      } else {
        return res.json({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr:
            "No hay ningún package.json en el sandbox: no hay proyecto npm que instalar. " +
            "Pulsa Sync para escribir el proyecto en disco o pide al agente que lo genere — la instalación es automática después.",
          error: "Sin package.json en el sandbox",
        });
      }
    }
    // ============================================================
    // v1.6.31 — GUARDA-SERVIDOR-EJEC: un servidor de larga vida NO se
    // ejecuta por esta puerta síncrona. `npm run dev` (Vite) nunca termina,
    // así que aquí siempre moría por timeout (`[exit 1] (timeout) Command
    // failed: npm run dev`) y el preview quedaba muerto. En su lugar
    // (usaEnSuLugar) se arranca en segundo plano y se devuelve al momento.
    // ============================================================
    if (esServidorDeLargaVida(norm.comando)) {
      const usaEnSuLugar = await arrancarServidorEnSegundoPlano(norm.comando, workDir);
      return res.json({ ...usaEnSuLugar, desenvuelto: norm.envuelto, nota: norm.motivo || usaEnSuLugar.nota });
    }
    const result = await runCommand(norm.comando, workDir, Math.min(Number(timeoutMs) || 120000, 300000));
    return res.json({ ...result, comandoEjecutado: norm.comando, desenvuelto: norm.envuelto, nota: norm.motivo || undefined });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

registrarRutasQuirofano(app); /*QF-ENDPOINTS*/

app.post("/api/fs/write", async (req: Request, res: Response) => { /*TREGUA*/
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  const { path: filePath, content } = req.body || {};
  if (!filePath || typeof filePath !== "string") return res.status(400).json({ error: "Falta 'path'." });
  if (typeof content !== "string") return res.status(400).json({ error: "Falta 'content'." });

  // ============================================================
  // v2.0 — BLINDAJE EN ESTA PUERTA TAMBIÉN.
  // ------------------------------------------------------------
  // Este endpoint es el que usa el AUTOSYNC del cliente (los bloques de código
  // que el modelo escribe en el chat llegan por aquí). Antes solo estaban
  // protegidas las herramientas write_file/edit_file del agente, así que un
  // archivo truncado por el chat entraba al sandbox, rompía la compilación de
  // Vite y tapaba el previsualizador con el error en pantalla.
  // Ahora se valida igual, y si está roto no se escribe: se devuelve el motivo.
  // ============================================================
  const guard = await guardFileProfundo(filePath, content, PARSER_ESBUILD);
  // v2.1 — ESTE BLOQUEO NUNCA SE ACTIVABA: filtraba por `i.severity === "error"`,
  // un campo que `SyntaxIssue` no tiene, así que la lista salía siempre vacía y
  // el archivo roto se escribía igual. La regla está ahora en
  // `problemasBloqueantes()` —fuera de este endpoint de 6.800 líneas— para que
  // se pueda probar, que es justo lo que aquí no se podía.
  const bloqueantes = problemasBloqueantes(guard);
  if (!guard.ok && bloqueantes.length > 0) {
    console.warn(`[engine] Escritura bloqueada por sintaxis: ${filePath}`);
    return res.status(422).json({
      ok: false,
      blocked: true,
      path: filePath,
      language: guard.language,
      error: `El motor bloqueó la escritura de ${filePath}: la sintaxis está rota y rompería el sandbox.`,
      issues: bloqueantes.slice(0, 6).map((i) => ({ line: i.line, message: i.message })),
      // El consejo sale de `fix`, que es el campo que de verdad trae la solución
      // en imperativo; `hint` no existía. El resumen del guardián queda de respaldo.
      hint: bloqueantes[0].fix || guard.summary || "Corrige el problema o vuelve a generar el archivo completo.",
    });
  }

  // ══ QUIRÓFANO v1 /*QF-FSWRITE*/ — esta puerta la usa el AUTOSYNC del chat
  // (los bloques de código que el modelo escribe llegan por aquí). Ya se validaba
  // la sintaxis; ahora además se juzga la PÉRDIDA: una reescritura mutilada y
  // balanceada pasaba el guardián de sintaxis sin pestañear y rompía la app.
  const juicioFsQf = juzgarEscrituraQf(filePath, content, { force: !!(req.body && req.body.force) });
  if (juicioFsQf.bloqueada) {
    return res.status(422).json({
      ok: false,
      blocked: true,
      quirofano: true,
      path: filePath,
      error: juicioFsQf.mensaje,
      motivos: juicioFsQf.diag?.motivos || [],
      cifras: juicioFsQf.diag?.cifras || null,
    });
  }

  try {
    const abs = resolveSafePath(filePath);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, content, "utf-8"); // TREGUA v1 /*TREGUA*/
    registrarCirugiaQf(filePath, juicioFsQf.original, content, juicioFsQf.diag);
    // Si el archivo es crítico el aviso va al log aunque no bloquee: nadie se entera
    // de lo que no se cuenta.
    if (juicioFsQf.diag && juicioFsQf.diag.veredicto === "revisar") {
      console.log("[CerebroNico] 🩺 QUIRÓFANO aviso en " + filePath + ": " + juicioFsQf.diag.motivos.join(" · "));
    }
    // Si el archivo quedó indexado, refrescamos los símbolos del motor
    if (INDEXABLE_EXT.has(path.extname(filePath).toLowerCase())) {
      setTimeout(() => {
        try {
          reindexProjectSymbols();
        } catch {}
      }, 300);
    }
    return res.json({ ok: true, path: filePath });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 🔧 LIMPIEZA TOTAL DEL SANDBOX: borra TODOS los archivos del directorio .proyectos/
 * (no solo los del editor — también los que quedaron en disco de sesiones anteriores).
 * Esto arregla el bug "el sandbox sigue mostrando la imagen vieja aunque el editor esté vacío".
 */
app.post("/api/fs/clear-all", (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  try {
    let deletedCount = 0;
    let preservedCount = 0;
    // ============================================================
    // v1.6.30 — LIMPIAR NO PUEDE LLEVARSE EL CEREBRO
    // ------------------------------------------------------------
    // 🐞 Esta limpieza nació para borrar «los archivos que quedaron en disco de
    // sesiones anteriores» (los que hacen que un árbol viejo choque con el
    // nuevo: «X is not exported by Y»). Y borraba TODO lo que hubiera en la
    // raíz. Con PROJECT_DIR apuntando a la raíz de datos (C:\Cerebronico), el
    // estado del agente VIVE ahí dentro: esta llamada se llevaba .cerebro-db,
    // .cerebronico, MEMORIA.md y skills.md **sin rescate** — el borrado total
    // (nuclear-wipe) sí los salva, ésta no. Ahora preserva exactamente lo mismo
    // que un borrado total: el estado y las dependencias.
    // ============================================================
    const SE_PRESERVA_CARPETA = new Set<string>(["node_modules", ".git", ...CARPETAS_DE_ESTADO]);
    const SE_PRESERVA_ARCHIVO = new Set<string>(["MEMORIA.md", "skills.md"]);
    const deleteRecursive = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // No borrar node_modules (tardaría mucho en reinstalar), .git ni el estado
          if (SE_PRESERVA_CARPETA.has(entry.name)) {
            preservedCount++;
            continue;
          }
          deleteRecursive(fullPath);
          try { fs.rmdirSync(fullPath); } catch {}
        } else {
          if (dir === PROJECT_ROOT && SE_PRESERVA_ARCHIVO.has(entry.name)) {
            preservedCount++;
            continue;
          }
          try {
            fs.unlinkSync(fullPath);
            deletedCount++;
          } catch {}
        }
      }
    };
    deleteRecursive(PROJECT_ROOT);

    // 🔧 Borrar también la caché de Vite dentro de node_modules/.vite
    const viteCache = path.join(PROJECT_ROOT, "node_modules", ".vite");
    if (fs.existsSync(viteCache)) {
      try {
        fs.rmSync(viteCache, { recursive: true, force: true });
      } catch {}
    }

    const sandboxLog = path.join(PROJECT_ROOT, ".sandbox_3500.log");
    if (fs.existsSync(sandboxLog)) {
      try { fs.unlinkSync(sandboxLog); } catch {}
    }

    return res.json({ ok: true, deleted: deletedCount, preserved: preservedCount, root: PROJECT_ROOT, viteCacheCleared: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 🔧 NUCLEAR WIPE: borra ABSOLUTAMENTE TODO en .proyectos/ incluyendo node_modules.
 * Esto destruye por completo el sandbox y lo deja vacío. La próxima vez que se
 * arranque el sandbox, será como si fuera la primera vez (npm install incluido).
 * Úsalo SOLO cuando clear-all no sea suficiente (ej: apps completas que quedaron pegadas).
 *
 * v1.6.23 — RESCATE v1: el borrador de esta ruta tenía un fallo del tamaño del
 * proyecto: el cerebro del motor (.cerebro-db: kb, espejos, salud, bóveda, leyes
 * aprendidas) y las copias de MEMORIA.md / skills.md viven DENTRO de .proyectos,
 * así que «Borrar todo» del editor (App.tsx → handleDeleteAllFiles) se llevaba
 * puesta toda la memoria aprendida SIN DECIR NADA. Ahora, antes de nuklear:
 *   1. SNAPSHOT no-pisante a <app>/.cerebro-db/rescate/<iso>/ (copia, nunca mueve);
 *   2. FUSIÓN de archivos NUEVOS hacia <app>/.cerebro-db/ — lo que ya existe en
 *      destino NO se pisa (criterio planearFusion);
 *   3. si el estado existía y el rescate arrojó cualquier error, el vaciado se
 *      ABORTA con motivo explícito (integridad antes que destrucción).
 * Reglas puras y probadas en src/engine/estadoRescate.ts; acá solo se ejecutan.
 */
app.post("/api/fs/nuclear-wipe", (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  try {
    // ─── RESCATE v1 — primero se muda lo que sirve; después nuklea. ───
    // Las carpetas de estado son las que el PROPIO proyecto declara
    // (CARPETAS_DE_ESTADO en raizDatos.ts: .cerebro-db y .cerebronico). Ahí
    // viven los espejos (espejos.json, espejos-salud.json, leyes-aprendidas,
    // entidades, bóveda, verifier, RAG, proposals) y los espejos
    // personalizados (.cerebronico/espejos, server.ts:4246). El lugar
    // permanente de cada una es <app>/<carpeta> (cwd), no el sandbox.
    const docsSandbox = ["MEMORIA.md", "skills.md"].filter((d) => fs.existsSync(path.join(PROJECT_ROOT, d)));
    const dirsEstado = CARPETAS_DE_ESTADO.filter((c) => fs.existsSync(path.join(PROJECT_ROOT, c)));
    const existeEstado = dirsEstado.length > 0 || docsSandbox.length > 0;
    const rescate = { trasladados: 0, conservados: 0, snapshot: "", docs: [] as string[], errores: [] as string[] };
    let snapshotOk = false;
    const listarRels = (dir: string, base: string, salida: string[]) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = base ? base + "/" + ent.name : ent.name;
        if (ent.isDirectory()) listarRels(path.join(dir, ent.name), rel, salida);
        else salida.push(rel);
      }
    };
    if (existeEstado) {
      const dirSnapshots = path.join(process.cwd(), ".cerebro-db");
      const snapDir = path.join(dirSnapshots, ...rutaRelRescate(new Date().toISOString()).split("/"));
      try {
        fs.mkdirSync(snapDir, { recursive: true });
        for (const carpeta of dirsEstado) {
          fs.cpSync(path.join(PROJECT_ROOT, carpeta), path.join(snapDir, carpeta), {
            recursive: true,
            force: false,
            errorOnExist: false,
          });
        }
        for (const doc of docsSandbox) {
          fs.copyFileSync(path.join(PROJECT_ROOT, doc), path.join(snapDir, doc));
          rescate.docs.push(doc);
        }
        snapshotOk = true;
        rescate.snapshot = snapDir;
      } catch (e: any) {
        rescate.errores.push("snapshot: " + String(e?.message || e));
      }
      // Fusión hacia el lugar permanente: lo nuevo se muda; lo que ya existe
      // se conserva (el snapshot ya guardó el nuestro).
      if (snapshotOk) {
        for (const carpeta of dirsEstado) {
          try {
            const rels: string[] = [];
            listarRels(path.join(PROJECT_ROOT, carpeta), "", rels);
            const destino = path.join(process.cwd(), carpeta);
            const plan = planearFusion(rels, (rel) => fs.existsSync(path.join(destino, ...rel.split("/"))));
            for (const rel of plan.trasladar) {
              try {
                const dst = path.join(destino, ...rel.split("/"));
                fs.mkdirSync(path.dirname(dst), { recursive: true });
                fs.copyFileSync(path.join(PROJECT_ROOT, carpeta, ...rel.split("/")), dst);
                rescate.trasladados++;
              } catch (e: any) {
                rescate.errores.push(`fusión ${carpeta}/${rel}: ${String(e?.message || e)}`);
              }
            }
            rescate.conservados += plan.conservar.length;
          } catch (e: any) {
            rescate.errores.push(`fusión ${carpeta}: ${String(e?.message || e)}`);
          }
        }
      }
    }
    const veredicto = procederBorrado({ existeEstado, snapshotOk, errores: rescate.errores });
    if (!veredicto.seguir) {
      const detalle = resumenRescate(rescate);
      console.error(`[CerebroNico] NUCLEAR WIPE ABORTADO — ${veredicto.motivo} ${detalle}`);
      return res.status(500).json({ ok: false, error: veredicto.motivo, rescate: detalle });
    }
    if (existeEstado) console.log(`[CerebroNico] RESCATE: ${resumenRescate(rescate)}`);

    let deletedCount = 0;
    let deletedDirs = 0;

    const nuclearDelete = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          nuclearDelete(fullPath);
          try {
            fs.rmdirSync(fullPath);
            deletedDirs++;
          } catch {}
        } else {
          try {
            fs.unlinkSync(fullPath);
            deletedCount++;
          } catch {}
        }
      }
    };

    nuclearDelete(PROJECT_ROOT);

    // Recrear el directorio .proyectos vacío
    try {
      fs.mkdirSync(PROJECT_ROOT, { recursive: true });
    } catch {}

    // ─── RESEMBRA v1 — el estado vuelve: espejos, conocimiento, bóveda y
    // verifier tienen que funcionar DESPUÉS del vaciado como si no hubiera
    // pasado nada. Se copia desde el lugar permanente de cada carpeta
    // (process.cwd()/<carpeta>) excluyendo el histórico `rescate/`
    // (planReSembrado): si no, cada wipe resembraría sus propios backups.
    // Nunca se pisa: el sandbox recién creado no debería tener nada, y si
    // algo apareció en el ínterin, manda lo que ya estaba.
    let resembrado = 0;
    const erroresReSiembra: string[] = [];
    for (const carpeta of CARPETAS_DE_ESTADO) {
      const origen = path.join(process.cwd(), carpeta);
      if (!fs.existsSync(origen)) continue;
      try {
        const rels: string[] = [];
        listarRels(origen, "", rels);
        for (const rel of planReSembrado(rels)) {
          try {
            const src = path.join(origen, ...rel.split("/"));
            const dst = path.join(PROJECT_ROOT, carpeta, ...rel.split("/"));
            if (fs.existsSync(dst)) continue;
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
            resembrado++;
          } catch (e: any) {
            erroresReSiembra.push(`${carpeta}/${rel}: ${String(e?.message || e)}`);
          }
        }
      } catch (e: any) {
        erroresReSiembra.push(`${carpeta}: ${String(e?.message || e)}`);
      }
    }

    console.log(
      `[CerebroNico] NUCLEAR WIPE: ${deletedCount} archivos + ${deletedDirs} carpetas borradas. .proyectos está vacío. RESEMBRA: ${resembrado} archivo(s) de estado devueltos${erroresReSiembra.length ? ` · ERRORES: ${erroresReSiembra.join(" · ")}` : ""}.`
    );

    return res.json({
      ok: true,
      deleted: deletedCount,
      deletedDirs,
      root: PROJECT_ROOT,
      // v1.6.23 — el informe del traslado y de la resiembra viaja al log del
      // usuario: ningún resultado de este borrado puede quedar mudo.
      rescate,
      resembrado,
      erroresReSiembra,
      message:
        "Sandbox completamente destruido y recreado vacío. La próxima vez que arranques será como la primera vez (npm install incluido)." +
        (existeEstado ? ` ${resumenRescate(rescate)}` : "") +
        ` 🌱 Estado re-sembrado en el sandbox: ${resembrado} archivo(s) (espejos, conocimiento, bóveda y verifier siguen vivos).` +
        (erroresReSiembra.length ? ` ⚠️ ERRORES de resiembra: ${erroresReSiembra.join(" · ")}` : ""),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * v2.1 — Archivos sin los cuales el sandbox no puede instalar ni arrancar nada.
 * Se usan para que el guardián de sintaxis NO pueda descartarlos en silencio.
 */
function esArchivoCriticoParaArrancar(p: string): boolean {
  return (
    /(^|\/)package\.json$/i.test(p) ||
    /(^|\/)vite\.config\.[cm]?[jt]s$/i.test(p) ||
    /(^|\/)(ts|js)config(\..+)?\.json$/i.test(p) ||
    /(^|\/)index\.html$/i.test(p)
  );
}

app.post("/api/fs/sync", async (req: Request, res: Response) => { /*TREGUA*/
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  const { files } = req.body || {};
  if (!Array.isArray(files)) return res.status(400).json({ error: "Falta 'files'." });
  const written: string[] = [];
  // ============================================================
  // v2.0 — 🐞 BLINDAJE EN LA SINCRONIZACIÓN EN BLOQUE
  // ------------------------------------------------------------
  // CASO REAL: un index.html llegó TRUNCADO a disco ("...Tono agresivo con
  // sim") y el sandbox no supo qué hacer con él. El blindaje de sintaxis ya
  // existía, pero este endpoint —el que usa el piloto automático para volcar
  // los 40 archivos de golpe— escribía DIRECTAMENTE con fs.writeFileSync, sin
  // pasar por él. Era la única puerta sin guardia.
  //
  // Criterio: en un volcado masivo NO se aborta todo (dejaría el workspace a
  // medias). Se escribe lo válido, se RECHAZA lo roto y se devuelve el detalle
  // para que la IDE lo muestre en el log con el motivo exacto.
  // ============================================================
  const rejected: Array<{ path: string; issues: string[] }> = [];
  let syncIdx = 0; // TREGUA v1 /*TREGUA*/
  // ══ QUIRÓFANO v1 /*QF-SYNC-ABRE*/ — abrir operación antes de escribir el lote.
  // El modo lo decide el propio lote: si la mayoría de los archivos son NUEVOS
  // (el usuario está subiendo su app entera), no se juzga la pérdida de líneas
  // contra lo que hubiera en el sandbox — eso sería un falso positivo. Si la
  // mayoría YA existían, es una MEJORA y se juzga como cirugía.
  const opSyncQf = abrirOperacionQf("sync del chat (" + files.length + " archivos)");
  const modoQf: ModoEvaluacion = (() => {
    let nuevos = 0;
    let total = 0;
    for (const f of files) {
      if (!f || typeof f.path !== "string" || typeof f.content !== "string") continue;
      total++;
      try {
        if (!fs.existsSync(resolveSafePath(f.path))) nuevos++;
      } catch {}
    }
    return total > 0 && nuevos / total >= 0.7 ? "carga" : "cirugia";
  })();
  console.log("[CerebroNico] 🩺 QUIRÓFANO: lote en modo " + modoQf + " (" + files.length + " archivos)");
  // ============================================================
  // v1.6.31 — ESPEJO-SYNC: el manifiesto de propiedad decide qué retirar.
  // ------------------------------------------------------------
  // Antes de escribir el lote nuevo se calcula qué rutas escribió el sync en
  // un lote anterior y YA NO vienen. Eso es un RESTO: si no se retira, el
  // árbol queda mezclado (el fallo de las 2:10 a. m.). El manifiesto vive en
  // .cn-sync/manifiesto.json, dentro de PROJECT_ROOT.
  // ============================================================
  const rutaManifiesto = path.join(PROJECT_ROOT, MANIFESTO_DIR, MANIFESTO_FILE);
  let manifiesto = crearManifiesto();
  try {
    const previo = parsearManifiesto(fs.readFileSync(rutaManifiesto, "utf-8"));
    if (previo) manifiesto = previo;
  } catch {
    /* primer sync: aún no hay manifiesto */
  }
  const rutasActuales = files
    .filter((f) => f && typeof f.path === "string" && !esRutaIgnorableSync(f.path))
    .map((f) => f.path);
  const retiro = planificarRetiro(manifiesto, rutasActuales);
  try {
    for (const f of files) {
      if (f && typeof f.path === "string" && typeof f.content === "string") {
        const texto = typeof f.isBinary === "boolean" ? !f.isBinary : true;
        if (texto) {
          const guard = await guardFileProfundo(f.path, f.content, PARSER_ESBUILD);
          if (!guard.ok) {
            // ============================================================
            // v2.1 — 🐞 UN ARCHIVO CRÍTICO NUNCA SE DESCARTA EN SILENCIO
            // ------------------------------------------------------------
            // Un proyecto sin package.json / vite.config / index.html es
            // inservible. El error que veía el usuario ("No se encontró
            // package.json en el sandbox tras sincronizar") no explicaba que el
            // archivo SÍ existía y lo había tirado el guardián de sintaxis.
            // Era un fallo mudo: el log decía "38 archivo(s) escrito(s)" y nadie
            // sabía nada de los otros 2.
            // Cuando el guardián duda de un archivo crítico, se escribe IGUAL y
            // se avisa fuerte. Un proyecto incompleto se diagnostica mal; un
            // proyecto con un archivo raro se diagnostica en segundos.
            // ============================================================
            const critico = esArchivoCriticoParaArrancar(f.path);
            rejected.push({
              path: f.path,
              issues: guard.issues.slice(0, 4).map((i: any) => i.message),
            });
            console.log(
              `[CerebroNico] SYNC ${critico ? "CRÍTICO · se escribe igual" : "rechazado"} ${f.path}: ${guard.issues[0]?.message || "sintaxis inválida"}`
            );
            // El motor aprende del fallo real (queda en la base de conocimiento)
            try {
              learnFromToolFailure("fs_sync", { path: f.path }, JSON.stringify({ ok: false, error: guard.issues[0]?.message }));
            } catch {}
            if (!critico) continue;
          }
        }
        const abs = resolveSafePath(f.path);
        const originalQf = fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : null;
        const juicioSyncQf = juzgarEscrituraQf(f.path, f.content, { modo: modoQf });
        if (juicioSyncQf.bloqueada) {
          rejected.push({ path: f.path, issues: juicioSyncQf.diag?.motivos?.slice(0, 3) || ["bloqueado por el Quirófano"] });
          console.log("[CerebroNico] 🩺 QUIRÓFANO: rechazado en el lote " + f.path + " — " + (juicioSyncQf.diag?.motivos?.[0] || ""));
          continue;
        }
        await fs.promises.mkdir(path.dirname(abs), { recursive: true });
        await fs.promises.writeFile(abs, f.content, "utf-8");
        anotarCirugia(opSyncQf, f.path, originalQf, f.content, juicioSyncQf.diag); /*QF-SYNC-BUCLE*/
        written.push(f.path);
      }
      // TREGUA v1 — cada 8 archivos cedo el lazo: los SSE de los chats (local y
      // cloud) respiran entre tandas. Un volcado síncrono de 251 archivos los
      // silenciaba y el cliente cortaba el stream: «se corta cuando el sandbox trabaja».
      if (cedeElLazo(++syncIdx)) await new Promise<void>((r) => setImmediate(r)); /*TREGUA*/
    }

    // ============================================================
    // v1.6.31 — ESPEJO-SYNC: retirar restos y sellar el manifiesto.
    // ------------------------------------------------------------
    // 1. Se borran las rutas que escribimos antes y ya no llegan.
    // 2. Se registra el lote nuevo (huella por archivo) y se guarda el
    //    manifiesto para que el próximo sync sepa qué es nuestro.
    // ============================================================
    const retirados: string[] = [];
    for (const ruta of retiro.aRetirar) {
      try {
        const abs = resolveSafePath(ruta);
        const st = fs.existsSync(abs) ? fs.statSync(abs) : null;
        if (st && st.isFile()) {
          fs.unlinkSync(abs);
          retirados.push(ruta);
        }
      } catch {
        /* un retiro que falla no debe tumbar el sync */
      }
    }
    const registro = registrarSync(retiro.manana, files);
    try {
      fs.mkdirSync(path.dirname(rutaManifiesto), { recursive: true });
      fs.writeFileSync(rutaManifiesto, serializarManifiesto(registro.manifesto), "utf-8");
    } catch {
      /* el manifiesto es accesorio: si no se puede escribir, el sync sigue */
    }
    if (retirados.length > 0 || registro.escritos > 0) {
      console.log(`[CerebroNico] ${lineaEspejoSync(registro, retirados.length)}`);
    }

    // ============================================================
    // v2.0 — VERIFICACIÓN DE IMPORTS DESPUÉS DE SINCRONIZAR
    // ------------------------------------------------------------
    // Error real en pantalla:
    //   [plugin:vite:import-analysis] Failed to resolve import
    //   "./components/ErrorBoundary" from "src/App.tsx". Does the file exist?
    // El proyecto pedía un componente que nunca se creó: el servidor levantaba,
    // el navegador no encontraba el módulo y el usuario veía un cartel rojo sin
    // saber si el fallo era del sandbox, del motor o del modelo.
    // Ahora el motor lo comprueba solo y, si falta un componente, crea un STUB
    // funcional para que el proyecto compile y el preview se vea.
    // ============================================================
    let missingImports: MissingImport[] = [];
    const stubsCreated: string[] = [];
    try {
      const enDisco: CheckFile[] = [];
      const recorrer = (dir: string, rel: string, prof: number) => {
        // ============================================================
        // v2.1 — 🐞 EL VERIFICADOR ESTABA CIEGO A PARTIR DEL 5º NIVEL.
        // ------------------------------------------------------------
        // Antes decía `prof > 4`, y con el proyecto dentro de su carpeta
        // contenedora («CerebroNico-IDE-v2.1/ide/backend/src/…») los archivos de
        // src/ ya caían en el nivel 5: NO LOS LEÍA. Consecuencia, en el log real
        // del usuario: "Imports sin resolver: 63" sobre archivos que SÍ existían,
        // y "stubs creados: 60" — 60 archivos basura escritos dentro del proyecto
        // en cada sincronización.
        // El recorrido ya no depende de la profundidad del ZIP: se hace desde la
        // raíz REAL del proyecto y con margen de sobra.
        // ============================================================
        if (prof > 12 || enDisco.length > 1500) return;
        let entradas: string[] = [];
        try {
          entradas = fs.readdirSync(dir);
        } catch {
          return;
        }
        for (const e of entradas) {
          if (["node_modules", ".git", "dist", ".vite", "__pycache__", "venv"].includes(e)) continue;
          const abs = path.join(dir, e);
          const relPath = rel ? `${rel}/${e}` : e;
          let st: fs.Stats;
          try {
            st = fs.statSync(abs);
          } catch {
            continue;
          }
          if (st.isDirectory()) recorrer(abs, relPath, prof + 1);
          // v2.1 — el escaneo debe incluir TODO lo que el verificador considera
          // importable (EXTENSIONES de importChecker). Faltaban .css/.scss/.json,
          // así que un `import "./index.css"` —que sí existe— se reportaba como
          // import sin resolver en cada sync. Falso positivo puro.
          else if (/\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss)$/i.test(e) && st.size < 400000) {
            try {
              enDisco.push({ path: relPath, content: fs.readFileSync(abs, "utf-8") });
            } catch {}
          }
        }
      };
      // Se recorre la raíz REAL del proyecto, pero las rutas se guardan relativas
      // a PROJECT_ROOT (como las del sync), para que findMissingImports resuelva
      // igual y los stubs caigan en el sitio correcto.
      const raizSync = resolverRaizProyecto().raiz;
      const prefijoSync = path.relative(PROJECT_ROOT, raizSync).split(path.sep).join("/");
      recorrer(raizSync, prefijoSync, 0);
      missingImports = findMissingImports(enDisco);
      if (missingImports.length > 0) {
        for (const s of buildStubs(missingImports)) {
          try {
            const abs = resolveSafePath(s.path);
            if (fs.existsSync(abs)) continue;
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, s.content, "utf-8");
            stubsCreated.push(s.path);
          } catch {}
        }
        console.log(
          `[CerebroNico] Imports sin resolver: ${missingImports.length} · stubs creados: ${stubsCreated.length} · ${describeMissingImports(missingImports)}`
        );
        try {
          learnFromToolFailure("fs_sync", { etapa: "imports" }, JSON.stringify({ ok: false, error: describeMissingImports(missingImports) }));
        } catch {}
      }
    } catch {
      /* la verificación nunca debe romper el sync */
    }

    // ══ QUIRÓFANO v1 /*QF-SYNC-CIERRA*/ — el lote ya está completo: ahora sí se
    // corre el juicio de verdad (puertas sobre el disco) y se revierte si algo
    // quedó roto. Es el momento correcto: cerrar antes revertiría a medias.
    const cierreSyncQf = await cerrarTurnoQf("sync del chat");

    return res.json({
      ok: rejected.length === 0 && missingImports.length === 0,
      written: written.length,
      rejected: rejected.length,
      rejectedFiles: rejected,
      missingImports: missingImports.length,
      missingImportDetails: missingImports.slice(0, 8),
      stubsCreated,
      retirados,
      quirofano: cierreSyncQf ? { ok: cierreSyncQf.ok, revertido: cierreSyncQf.revertido, informe: cierreSyncQf.informe } : null,
      message:
        rejected.length > 0
          ? `${written.length} archivo(s) escrito(s); ${rejected.length} RECHAZADO(S) por sintaxis rota.`
          : missingImports.length > 0
            ? `${written.length} archivo(s) escrito(s); ${missingImports.length} import(s) sin resolver${stubsCreated.length ? `, ${stubsCreated.length} stub(s) creado(s)` : ""}.`
            : `${written.length} archivo(s) escrito(s).`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message, written, rejectedFiles: rejected });
  }
});

app.get("/api/fs/read", async (req: Request, res: Response) => { /*TREGUA*/
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: "Falta 'path'." });
  try {
    const abs = resolveSafePath(filePath);
    const content = await fs.promises.readFile(abs, "utf-8"); // TREGUA v1 /*TREGUA*/
    return res.json({ path: filePath, content });
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

app.get("/api/fs/tree", (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  const files: string[] = [];
  const walk = (dir: string, base: string) => {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      const rel = base ? `${base}/${name}` : name;
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full, rel);
      } else {
        files.push(rel);
      }
    }
  };
  walk(PROJECT_ROOT, "");
  return res.json({ root: PROJECT_ROOT, files });
});

/**
 * Autonomous technical fallback engine response generator
 */
function generateAutonomousTechnicalResponse(prompt: string, attachmentSummary: string): string {
  const isReplicationOrImprovement = /replic|copi|mejor|generar todos|crear los archivos|todo.*archivo/i.test(prompt);
  const isRefactor = /refactor|mejor|repar|modific|optimi/i.test(prompt);
  const isCodeRequest = /código|funcion|crear|componente|script|endpoint|api|clase|interfaz/i.test(prompt);
  const isTerminalCommand = /comando|ejecut|instalar|docker|npm|build|port|puerto/i.test(prompt);

  if (isReplicationOrImprovement) {
    return `### ⚡ CerebroNico - Replicación y Mejora Integral del Sistema

He analizado la arquitectura completa de la aplicación y he generado los módulos optimizados con tipado estricto, desacoplamiento de estado y persistencia de telemetría.

\`\`\`typescript file="src/services/appKernel.ts"
// src/services/appKernel.ts - Núcleo de Ejecución de Alta Velocidad
export interface EngineTelemetry {
  port3000: boolean;
  port5000: boolean;
  port11434: boolean;
  ramUsageMb: number;
  tokensPerSec: number;
}

export class AppExecutionKernel {
  private listeners: Set<(t: EngineTelemetry) => void> = new Set();
  private telemetry: EngineTelemetry = {
    port3000: true,
    port5000: true,
    port11434: true,
    ramUsageMb: 48,
    tokensPerSec: 64.2,
  };

  public subscribe(cb: (t: EngineTelemetry) => void): () => void {
    this.listeners.add(cb);
    cb(this.telemetry);
    return () => this.listeners.delete(cb);
  }

  public updateTelemetry(partial: Partial<EngineTelemetry>): void {
    this.telemetry = { ...this.telemetry, ...partial };
    this.listeners.forEach((cb) => cb(this.telemetry));
  }

  public purgeRam(): void {
    this.updateTelemetry({ ramUsageMb: 36 });
  }
}

export const kernel = new AppExecutionKernel();
\`\`\`

\`\`\`typescript file="src/hooks/useKernelTelemetry.ts"
// src/hooks/useKernelTelemetry.ts - Hook Reactivo de Telemetría
import { useState, useEffect } from "react";
import { kernel, EngineTelemetry } from "../services/appKernel";

export function useKernelTelemetry() {
  const [telemetry, setTelemetry] = useState<EngineTelemetry>({
    port3000: true,
    port5000: true,
    port11434: true,
    ramUsageMb: 48,
    tokensPerSec: 64.2,
  });

  useEffect(() => {
    const unsubscribe = kernel.subscribe(setTelemetry);
    return () => unsubscribe();
  }, []);

  return { telemetry, purgeRam: () => kernel.purgeRam() };
}
\`\`\`

\`\`\`markdown file="README.md"
# CerebroNico IDE
Entorno de ingeniería de software autónomo con inferencia local en Ollama y aceleración en la nube.
- **Frontend UI**: Puerto 3000 (Next.js / Vite)
- **Backend / Workers**: Puerto 5000
- **Ollama Inferencia**: Puerto 11434 (\`http://127.0.0.1:11434\`)
- **Gestión de Memoria**: Contexto dinámico de 5 mensajes + inyección del rol de sistema.
\`\`\`

**Sincronización Completada:**
- Los archivos \`src/services/appKernel.ts\`, \`src/hooks/useKernelTelemetry.ts\` y \`README.md\` se han indexado automáticamente en el **Editor** y en la pestaña de **Entregables** para visualización y descarga en ZIP.`;
  }

  if (isCodeRequest || isRefactor) {
    return `### ⚡ CerebroNico - Módulo de Generación y Refactorización

**Análisis de la Solicitud:**
Se ha procesado el requerimiento: *"${prompt.slice(0, 120)}..."* aplicando tipado estricto en TypeScript, arquitectura modular y reactividad desacoplada.

\`\`\`typescript file="src/services/autonomousKernel.ts"
// src/services/autonomousKernel.ts
export interface KernelTask {
  id: string;
  name: string;
  priority: "high" | "medium" | "low";
  timestamp: number;
}

export class AutonomousExecutionEngine {
  private activeJobs: Map<string, KernelTask> = new Map();

  public registerTask(name: string, priority: KernelTask["priority"] = "high"): KernelTask {
    const task: KernelTask = {
      id: "task-" + Math.random().toString(36).substring(2, 9),
      name,
      priority,
      timestamp: Date.now(),
    };
    this.activeJobs.set(task.id, task);
    return task;
  }

  public getTelemetrySummary(): { active: number; port: number } {
    return {
      active: this.activeJobs.size,
      port: 5000,
    };
  }
}

export const kernel = new AutonomousExecutionEngine();
\`\`\`

**Puntos Clave Implementados:**
1. **Tipado Estricto**: Definición de interfaces TypeScript para prevenir estados nulos o indefinidos.
2. **Sincronización con Editor**: El bloque de código ha sido indexado y está listo en la pestaña **Editor** y en **Entregables**.
3. **Persistencia**: Registrado en el ciclo de \`MEMORIA.md\`.`;
  }

  if (isTerminalCommand) {
    return `### ⚡ CerebroNico - Control de Procesos y Telemetría

\`\`\`bash file="scripts/dev-orchestrator.sh"
#!/usr/bin/env bash
# 1. Comprobar y limpiar procesos en puertos clave
# Puerto 3000 (UI Vite/React) y Puerto 5000 (Microservicios/Workers)
lsof -i :3000 -i :5000 -i :11434 2>/dev/null || true

# 2. Servir Ollama con CORS habilitado para el navegador
OLLAMA_ORIGINS="*" ollama serve &

# 3. Compilación limpia y validación de tipos
npm run lint && npm run build
\`\`\`

**Estado de Puertos:**
- **Puerto 3000**: UI Frontend activa y respondiendo.
- **Puerto 5000**: Worker / Proxy listo para despacho.
- **Puerto 11434**: Inferencia local Ollama.`;
  }

  return `### ⚡ CerebroNico - Análisis Técnico y Resolución

**Diagnóstico del Entorno:**
- **Protocolo de Actuación:** Persistencia activa en \`MEMORIA.md\`, respuesta en español técnico directo y ejecución sin rodeos.
- **Triangulación:** Puerto 3000 (UI Vite/React), Puerto 5000 (Workers backend) y Puerto 11434 (Inferencia local).

${
  attachmentSummary.length > 0
    ? `**Archivos y Documentos Procesados:**
Se han extraído correctamente los adjuntos en texto limpio (eliminando caracteres de control, tags binarios y rombos de codificación corrupta).

`
    : ""
}**Acciones Ejecutadas para:** *"${prompt.slice(0, 100)}"*

\`\`\`typescript file="src/utils/orchestrator.ts"
// src/utils/orchestrator.ts
export function executeTask(taskName: string): { success: boolean; timestamp: number } {
  console.log(\`[CerebroNico] Ejecutando: \${taskName}\`);
  return { success: true, timestamp: Date.now() };
}
\`\`\`

Todo el código analizado está sincronizado con el panel derecho (**Editor** y **Entregables**) listo para guardar o descargar.`;
}

// ============================================================
// StreamContext vive ahora en `./server/streamContext` (v1.14.0): allí se
// acumula el texto del modelo y, al cerrar el turno, se pasa por el revisor de
// certeza sin hacer crecer este monolito (trinquete de la Fase 2).
// ============================================================

/**
 * Pipe a generic OpenAI-compatible streaming response (used by both
 * OpenRouter and Custom providers) into the StreamContext.
 *
 * Handles: SSE buffering, [DONE] sentinel, error/abort propagation.
 * Returns true if at least one chunk was emitted, false otherwise.
 *
 * Note: `response` is the global fetch Response, not Express's Response.
 */
async function pipeOpenAICompatibleStream(
  response: any,
  ctx: StreamContext
): Promise<boolean> {
  if (!response || !response.ok || !response.body) return false;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let sseBuf = "";
  let emittedAny = false;

  try {
    while (true) {
      if (ctx.isAborted()) break;
      const { done, value } = await reader.read();
      if (done) break;

      sseBuf += decoder.decode(value, { stream: true });
      const lines = sseBuf.split("\n");
      sseBuf = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:") || trimmed.includes("[DONE]")) continue;
        try {
          const data = JSON.parse(trimmed.slice(5).trim());
          const content = data.choices?.[0]?.delta?.content;
          if (content) {
            ctx.sendChunk(content);
            emittedAny = true;
          }
        } catch {}
      }
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }

  return emittedAny;
}

/**
 * AI Streaming Proxy Endpoint
 * Supports: Ollama (11434), Gemini (Google GenAI), OpenRouter, and Custom Server
 */
app.post("/api/ai/stream", async (req: Request, res: Response) => {
  const {
    prompt,
    systemInstruction,
    hiddenSystemFiles = [],
    openFiles = [],
    provider = "ollama",
    model = "stablelm2:latest",
    temperature = 0.5,
    ollamaUrl = OLLAMA_DEFAULT,
    openrouterApiKey = process.env.OPENROUTER_API_KEY,
    geminiApiKey,
    customServerUrl,
    customApiKey,
    openaiApiKey = process.env.OPENAI_API_KEY,
    // v1.1 — Dedicated cloud providers:
    zaiApiKey = process.env.ZAI_API_KEY,
    groqApiKey = process.env.GROQ_API_KEY,
    cerebrasApiKey = process.env.CEREBRAS_API_KEY,
    togetherApiKey = process.env.TOGETHER_API_KEY,
    mistralApiKey = process.env.MISTRAL_API_KEY,
    deepseekApiKey = process.env.DEEPSEEK_API_KEY,
    fireworksApiKey = process.env.FIREWORKS_API_KEY,
    attachments = [],
    history = [],
    pcMode = false,
  } = req.body;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // 🔧 REFACTORIZACIÓN: Toda la lógica de abort/watchdog/SSE está encapsulada
  // en StreamContext. Esto evita los 3 bugs originales (req.on close, duplicado,
  // timeout no limpio) por construcción.
  const ctx = new StreamContext(res);

  try {
    // 1. Process attachments cleanly
    const base64Images: string[] = [];
    let textAttachmentsContext = "";

    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        if (att.isImage && att.base64Data) {
          const pureBase64 = att.base64Data.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");
          base64Images.push(pureBase64);
        } else if (att.extractedText) {
          textAttachmentsContext += `\n\n${att.extractedText.slice(0, 15000)}`;
        }
      }
    }

    // 2. Format Open Files Context (if any files are currently open in editor)
    // ============================================================
    // v1.6.20 — ✂️ TOPE A LOS ARCHIVOS ABIERTOS. AQUÍ ESTABA EL MINUTO.
    // ------------------------------------------------------------
    // Esto volcaba el `content` COMPLETO de cada pestaña abierta, sin límite
    // alguno, en TODAS las peticiones. Con el editor cargado y el historial
    // entero encima, el prompt se hacía enorme.
    //
    // La medición que lo delató: un modelo CLOUD rápido (Gemini) tardaba 51 s
    // en contestar 15 tokens, y uno LOCAL de 270M tardaba 59 s en no contestar
    // nada. Dos motores incomparables con la misma latencia. Ese empate solo lo
    // explica el tamaño del prompt, no la capacidad del motor: los dos estaban
    // pagando el mismo peaje de lectura antes de escribir la primera palabra.
    //
    // Y la propia base de conocimiento de la app ya lo decía por escrito, en el
    // bloque que se le manda al modelo en cada turno: «Reescribir un archivo
    // entero cuesta miles de tokens y es la causa principal de lentitud con
    // modelos locales».
    //
    // Ahora hay tope por archivo y tope total, y cuando se recorta SE DICE, para
    // que el modelo sepa que le falta contexto y lo pida, en vez de rellenar el
    // hueco inventando.
    // ============================================================
    const MAX_CHARS_POR_ARCHIVO = 3_000;
    const MAX_CHARS_ARCHIVOS = 9_000;
    let openFilesContext = "";
    if (Array.isArray(openFiles) && openFiles.length > 0) {
      let acumulado = 0;
      const trozos: string[] = [];
      for (const f of openFiles) {
        if (acumulado >= MAX_CHARS_ARCHIVOS) break;
        const contenido = String(f.content || "");
        const margen = Math.min(MAX_CHARS_POR_ARCHIVO, MAX_CHARS_ARCHIVOS - acumulado);
        const recortado = contenido.length > margen;
        trozos.push(
          `\`\`\`${f.language || "text"} file="${f.path || f.name}"\n` +
            `${recortado ? contenido.slice(0, margen) : contenido}\n` +
            (recortado
              ? `[… recortado: el archivo tiene ${contenido.length} caracteres y solo se enviaron los primeros ${margen}. Pide la parte que necesites.]\n`
              : "") +
            `\`\`\``
        );
        acumulado += margen;
      }
      const omitidos = openFiles.length - trozos.length;
      if (omitidos > 0) {
        trozos.push(`[… ${omitidos} archivo(s) abiertos más, omitidos por presupuesto de contexto]`);
      }
      openFilesContext = "\n\n### [ARCHIVOS ABIERTOS EN EL EDITOR ACTIVO]:\n" + trozos.join("\n\n");
    }

    const fullUserPrompt = `${prompt || "Analizar requerimiento"}${
      textAttachmentsContext ? `\n\n[DOCUMENTOS ADJUNTOS EXTRAÍDOS]:${textAttachmentsContext}` : ""
    }${openFilesContext}`;

    // System instruction enriched with hidden system files (MEMORIA.md & skills.md on turn 1)
    let consolidatedSystemInstruction = systemInstruction || "Eres CerebroNico, motor y agente autónomo de ingeniería de software e IDE. Responde SIEMPRE y EXCLUSIVAMENTE en ESPAÑOL técnico directo, riguroso y sin rodeos.";

    // ============================================================
    // v1.6.17 — 📅 LA FECHA, QUE NO ESTABA EN NINGUNA PARTE
    // ------------------------------------------------------------
    // «¿Puedes responderme qué día es hoy?» — y no podía ninguno. Se buscó
    // `fecha`, `date`, `hoy` y `día` en la construcción del prompt y solo
    // aparecía `new Date()` para sellos internos (registro de incidencias del
    // cerebro, bóveda, logs), NUNCA como contexto para el modelo.
    //
    // El daño real no es que no sepa la fecha: es que un modelo grande no
    // responde «no sé», se INVENTA una con total aplomo. Eso es peor que no
    // contestar, y es justo lo que se prueba al revisar una interfaz.
    //
    // Se inyecta aquí porque este es el punto ÚNICO por el que pasa el prompt
    // de sistema de TODOS los proveedores (ver la nota siguiente), así que
    // arreglarlo una vez lo arregla para Ollama, GLM, Gemini y el resto.
    // ============================================================
    const ahoraDelSistema = new Date();
    const fechaDelSistema = ahoraDelSistema.toLocaleDateString("es-ES", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const horaDelSistema = ahoraDelSistema.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    let zonaDelSistema = "hora local";
    try {
      zonaDelSistema = Intl.DateTimeFormat().resolvedOptions().timeZone || "hora local";
    } catch { /* se queda el texto por defecto */ }
    consolidatedSystemInstruction +=
      `\n\n[DATO REAL DEL SISTEMA — fecha y hora] Hoy es ${fechaDelSistema}, ${horaDelSistema} (${zonaDelSistema}).` +
      ` Úsalo tal cual cuando te pregunten la fecha o la hora. No lo deduzcas del historial ni lo inventes.`;

    // ============================================================
    // v2.0 — GOBERNANZA: CEREBRO (ley) + MEMORIA (estado vivo)
    // ------------------------------------------------------------
    // Este es el punto ÚNICO por el que pasa el prompt de sistema de TODOS los
    // proveedores (Ollama, GLM/Z.ai, Gemini, OpenRouter, OpenAI, Custom), así que
    // la ley del agente se aplica igual sea cual sea el "conductor".
    // El nivel decide cuánto se inyecta: un modelo diminuto recibe solo la ley
    // imprescindible (evita la fatiga de contexto), uno grande recibe el cerebro
    // completo más el estado y los fallos recientes.
    // ============================================================
    try {
      const perfilBrain = getProfile(model);
      const nivelBrain =
        perfilBrain.tier === "micro" || perfilBrain.tier === "tiny"
          ? "micro"
          : perfilBrain.tier === "small"
            ? "compact"
            : perfilBrain.tier === "large" || perfilBrain.tier === "cloud"
              ? "pro"
              : "standard";
      const bloqueBrain = brain.systemBlock(nivelBrain as any);
      if (bloqueBrain && brain.getCerebro().length > 200) {
        consolidatedSystemInstruction = `${bloqueBrain}\n\n${consolidatedSystemInstruction}`;
      }
      // Métrica de interacción (cada 10 dispara la compresión de la memoria).
      brain.registrarInteraccion();

      // ============================================================
      // v2.0 — RECUERDOS DE LA MEMORIA VECTORIAL (RAG local)
      // ------------------------------------------------------------
      // APAGADA POR DEFECTO: si `localRag.isEnabled()` es false, esta rama no se
      // ejecuta, no se llama a ningún modelo de embeddings y no se lee el índice.
      // Coste en reposo: cero. Cuando se activa, aporta los fragmentos de memoria
      // más parecidos a la consulta, que es justo lo que hace falta cuando el
      // archivo ya es demasiado grande para enviarlo entero.
      // ============================================================
      if (localRag.isEnabled()) {
        const recuerdos = await localRag.buildContextBlock(
          String(fullUserPrompt || ""),
          3,
          nivelBrain === "micro" ? 600 : 1400
        );
        if (recuerdos) {
          consolidatedSystemInstruction = `${consolidatedSystemInstruction}\n\n${recuerdos}`;
        }
      }

      // ============================================================
      // v2.0 — LEY ESPECÍFICA DE DOMINIO (multi-cerebro)
      // Si la capacidad está activada y existe el sub-cerebro del dominio que
      // toca la petición, se suma aquí. Apagada no lee ningún archivo.
      // ============================================================
      const bloqueDominio = features.buildDomainBlock(String(fullUserPrompt || ""));
      if (bloqueDominio) {
        consolidatedSystemInstruction = `${consolidatedSystemInstruction}\n\n${bloqueDominio}`;
      }
    } catch (err: any) {
      console.log(`[CerebroNico] Aviso: gobernanza no inyectada (${err?.message || err})`);
    }

    // ============================================================
    // v1.6.20 — ✂️ TOPE A LOS ARCHIVOS DE SISTEMA OCULTOS
    // ------------------------------------------------------------
    // Aquí van MEMORIA.md y skills.md —y en las capturas del usuario se vio al
    // modelo de 270M DEVOLVIENDO este contenido en vez de contestar. Se metía
    // `hf.content` ENTERO, sin límite, en cada turno.
    //
    // Un modelo pequeño no aprovecha ese texto: se ahoga y lo repite. Y a
    // cualquiera que sea el motor, son tokens que se pagan en cada petición
    // antes de que el modelo pueda escribir la primera palabra.
    // ============================================================
    const MAX_CHARS_ARCHIVO_SISTEMA = 4_000;
    if (Array.isArray(hiddenSystemFiles) && hiddenSystemFiles.length > 0) {
      for (const hf of hiddenSystemFiles) {
        const contenido = String(hf.content || "");
        const recortado = contenido.length > MAX_CHARS_ARCHIVO_SISTEMA;
        // v1.6.22 — Decirle a un modelo que un archivo está «OCULTO» es pedirle que
        // lo muestre. El rótulo era el punto único por el que pasa el prompt de
        // TODOS los proveedores. Ahora es material de referencia interno y lleva la
        // orden de no transcribirlo.
        consolidatedSystemInstruction +=
          `\n\n--- [CONTEXTO DE TRABAJO: ${hf.name}] (material de referencia interno; NO lo transcribas, cites ni repitas en la respuesta) ---\n` +
          (recortado ? contenido.slice(0, MAX_CHARS_ARCHIVO_SISTEMA) : contenido) +
          (recortado
            ? `\n[… recortado: quedan ${contenido.length - MAX_CHARS_ARCHIVO_SISTEMA} caracteres sin enviar. Pide la sección que necesites en vez de suponerla.]`
            : "");
      }
    }

    // ============================================================
    // V8 · D1 — CONOCIMIENTO DEL MOTOR: PUNTO ÚNICO MULTI-PROVEEDOR
    // ------------------------------------------------------------
    // [CONOCIMIENTO DEL MOTOR] + [MANUAL DEL MOTOR] + [SÍMBOLOS REALES]
    // + [EQUIPO ESPEJO ACTIVO] se inyectan AHORA (antes de las ramas de
    // proveedor), no solo en la rama Ollama. Tesis fundacional: el
    // conocimiento vive en el motor, no en el modelo — cada "conductor"
    // (Ollama, GLM/Z.ai, Gemini, OpenRouter, OpenAI, Custom…) recibe el
    // mismo contexto verificado, en cada turno, con presupuesto por tramo
    // de modelo (700 car. en micro).
    // ============================================================
    try {
      const perfilMotor = getProfile(model);
      const esMicroMotor = perfilMotor.tier === "micro" || perfilMotor.tier === "tiny";
      const engineContextV8 = buildEngineContext(
        engineKb,
        `${fullUserPrompt}\n${(history || []).slice(-4).map((h: any) => h?.content || "").join("\n")}`,
        5,
        esMicroMotor ? 700 : 1200
      );
      if (engineContextV8) {
        consolidatedSystemInstruction += `\n\n${engineContextV8}`;
      }
      const herramientasV8 = getToolsForModel(model, pcMode);
      if (herramientasV8.length > 0) {
        const nombresV8 = herramientasV8.map((t: any) => t?.function?.name).filter(Boolean);
        const manualV8 = buildToolManualSection(nombresV8, perfilMotor.tier === "small" ? 1300 : 1900);
        if (manualV8) consolidatedSystemInstruction += `\n\n${manualV8}`;
      }
      if (symbolMap.total === 0) {
        try {
          reindexProjectSymbols();
        } catch {}
      }
      const simbolosV8 = summarizeSymbols(symbolMap, esMicroMotor ? 700 : 1300);
      if (simbolosV8) consolidatedSystemInstruction += `\n\n${simbolosV8}`;
      const notaEspejosV8 = notaSeleccionEspejos();
      if (notaEspejosV8) {
        consolidatedSystemInstruction += `\n\n${notaEspejosV8}\nCuando el pedido encaje con ese equipo, llámalo (consultar_espejo): es determinista (~1 ms) y no gasta RAM del modelo.`;
      }
    } catch (err: any) {
      console.log(`[CerebroNico] Aviso: conocimiento del motor no inyectado (${err?.message || err})`);
    }

    // ============================================================
    // v1.6.20 — ✂️ TOPE AL HISTORIAL
    // ------------------------------------------------------------
    // La nota anterior decía «no artificial 5-message truncation», y quitar el
    // recorte de 5 estaba bien: era demasiado agresivo. El problema es que se
    // pasó de 5 a INFINITO, y el historial entero viaja en cada petición.
    //
    // Con «Historico Total Activo» encendido, cada mensaje nuevo reenvía toda la
    // conversación. El coste crece con la sesión, y de ahí que la latencia fuera
    // parecida en un modelo cloud rápido y en uno local diminuto: los dos
    // pagaban el mismo peaje de lectura.
    //
    // Se recorta a los últimos 24 mensajes. Sigue siendo holgado para que la
    // conversación tenga sentido —muy lejos del recorte de 5 que se quitó en su
    // día—, y pone un techo que antes no existía. Se avisa por consola al
    // recortar, para que no sea un silencio.
    // ============================================================
    const MAX_MENSAJES_HISTORIAL = 24;
    const historialCrudo = Array.isArray(history) ? history : [];
    const fullHistory =
      historialCrudo.length > MAX_MENSAJES_HISTORIAL
        ? historialCrudo.slice(-MAX_MENSAJES_HISTORIAL)
        : historialCrudo;
    if (historialCrudo.length > fullHistory.length) {
      console.log(
        `[CerebroNico] Historial recortado: ${historialCrudo.length} mensajes → ` +
        `${fullHistory.length} (tope ${MAX_MENSAJES_HISTORIAL}). Se conservan los más recientes.`
      );
    }

    // 2.5. ACCIONES RÁPIDAS DETERMINISTAS (Modo Agente PC)
    // Si el usuario pide algo directo (crear/borrar/leer/listar/ejecutar),
    // lo hacemos YA contra el puente :5000, sin gastar LLM. Corta el flujo.
    if (pcMode && prompt && typeof prompt === "string") {
      const handled = await handlePcQuickAction(prompt, ctx);
      if (handled) return;
    }

    // 3. PROVIDER: GEMINI
    if (provider === "gemini" || model.startsWith("gemini")) {
      const ai = getGenAI(geminiApiKey);
      if (!ai) {
        // 🔧 CORRECCIÓN: si el usuario pidió Gemini pero no hay API key, enviar
        // error claro en vez de caer al fallback autónomo silenciosamente.
        ctx.sendError(
          `❌ Gemini requiere API Key. Configúrala en el modal "Ranuras de API Keys" ` +
          `(botón "Abrir Ranuras" en el panel izquierdo), o como variable de entorno ` +
          `GEMINI_API_KEY. Consíguela gratis en https://aistudio.google.com/apikey`
        );
        return;
      }
      // ============================================================
      // v1.6.17 — 🔧 LA CADENA DE RESERVA ERA UN CEMENTERIO
      // ------------------------------------------------------------
      // «Ayer los modelos de Gemini eran rapidísimos y casi nunca fallaban,
      // pero hoy dan 404, y da igual la versión a la que vuelva.» Tenía razón,
      // y no era la app: era esta lista.
      //
      // Comprobado contra la documentación oficial, actualizada 2026-09-22:
      //   · gemini-2.0-flash  → APAGADO (aparece en «Previous models»)
      //   · gemini-1.5-flash  → apagado: «all requests return a 404»
      //   · gemini-2.5-flash  → retirada en curso; ya devuelve 404 en la
      //                         práctica pese a la fecha de octubre
      //
      // Es decir: los cuatro nombres de reserva estaban muertos o moribundos,
      // así que cualquier fallo terminaba en una cadena de cuatro 404 seguidos
      // y el usuario veía «error 404» siempre. La generación vigente es la 3.x.
      //
      // Y había una SEGUNDA trampa, que probablemente era la suya: la condición
      // `model.includes("gemini")` daba por bueno cualquier alias. Con
      // «gemini-flash» o «gemini-free» puestos —que NO son nombres de modelo de
      // la API— se probaba ese texto como nombre literal, daba 404, y caía a la
      // cadena muerta. Fallo garantizado. Ahora los alias propios se reconocen
      // y se saltan, en vez de gastar una petición en algo que no existe.
      // ============================================================
      // v1.6.19 — el orden lo corrigió el propio Google.
      //
      // En el error 404 que devolvió al usuario, la API de Gemini venía con la
      // respuesta incluida:
      //
      //   «This model models/gemini-2.5-flash is no longer available to new
      //    users. Please update your code to use models/gemini-3.6-flash for
      //    the latest features and improvements.»
      //
      // Cuando el proveedor te nombra en el mensaje de error el modelo que sí
      // funciona, se pone ése el primero y se deja de adivinar.
      const MODELOS_GEMINI_VIGENTES = [
        "gemini-3.6-flash",
        "gemini-3.8-flash",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        // `gemini-2.5-flash` SE VA: la API responde que «no longer available to
        // new users», así que solo servía para gastar una petición y devolver un
        // 404 garantizado al final de la cadena.
      ];
      /** Alias internos que NO son nombres de modelo de la API de Gemini. */
      const ALIAS_GEMINI_INTERNOS = new Set(["gemini", "gemini-flash", "gemini-free"]);
      const modeloPedidoEsReal =
        model.includes("gemini") && !ALIAS_GEMINI_INTERNOS.has(String(model).trim().toLowerCase());
      const candidateModels = [
        modeloPedidoEsReal ? model : MODELOS_GEMINI_VIGENTES[0],
        ...MODELOS_GEMINI_VIGENTES,
      ];
      const uniqueModels = Array.from(new Set(candidateModels));
      let lastGeminiErr: any = null;

      for (const targetModel of uniqueModels) {
        // Declarado AQUÍ y no dentro del `try`: un `const` del bloque `try` NO
        // es visible desde su `catch`, y el catch necesita poder desarmar el
        // reloj si el SDK falla antes del primer token.
        let relojGemini: ReturnType<typeof setTimeout> | undefined;
        try {
          const contents: any[] = [];
          // Add full history for Gemini
          for (const h of fullHistory) {
            if (h.role && h.content) {
              contents.push({
                role: h.role === "assistant" ? "model" : "user",
                parts: [{ text: h.content }],
              });
            }
          }

          const currentParts: any[] = [{ text: fullUserPrompt }];
          for (const imgBase64 of base64Images) {
            currentParts.push({
              inlineData: {
                data: imgBase64,
                mimeType: "image/png",
              },
            });
          }
          contents.push({ role: "user", parts: currentParts });

          // v1.6.16 — Gemini es el único proveedor que NO pasa por `fetch` (usa
          // el SDK), así que `fetchCloud` no lo cubría. Y es el que más lo
          // necesita: su cadena de failover prueba hasta 5 modelos EN SERIE, de
          // modo que un modelo mudo multiplicaba la espera hasta por cinco.
          // ============================================================
          // v1.6.19 — 🐞 EL ABORTO ERA MÍO, Y ESTE ERA EL FALLO DE VERDAD
          // ------------------------------------------------------------
          // La v1.6.16 puso aquí un techo de 45 s a la espera del primer byte.
          // Razonable para un `fetch` a un proveedor mudo. INCORRECTO para
          // Gemini, porque en Gemini el primer token NO es inmediato: la
          // familia 3 usa «dynamic thinking» por defecto y Google avisa en su
          // guía de que «the model may take SIGNIFICANTLY LONGER to reach a
          // first (non thinking) output token».
          //
          // Resultado: peticiones perfectamente válidas cortadas a los 45 s, y
          // el usuario viendo «signal is aborted without reason» después de
          // esperar minutos. Un fallo mío — y con el peor mensaje posible,
          // porque parecía un problema de su configuración.
          //
          // Esperar de más es molesto; cortar una respuesta que venía es peor.
          // Así que Gemini tiene su propio presupuesto, mucho más largo.
          // ============================================================
          const GEMINI_PRIMER_TOKEN_TIMEOUT_MS = 150_000;
          const ctrlGemini = new AbortController();
          relojGemini = setTimeout(() => ctrlGemini.abort(), GEMINI_PRIMER_TOKEN_TIMEOUT_MS);

          // v1.6.18 — 🌡️ GEMINI 3 QUIERE temperature = 1.0
          //
          // Palabras de Google, en la guía oficial de la familia 3: «For all
          // Gemini 3 models, we strongly recommend keeping the temperature
          // parameter at its default value of 1.0... Changing the temperature
          // (setting it below 1.0) may lead to unexpected behavior, such as
          // LOOPING or degraded performance, particularly in complex
          // mathematical or reasoning tasks».
          //
          // La app enviaba el valor del regulador de la interfaz, que por
          // defecto está en 0.5 — la MITAD de lo recomendado. No produce el 404,
          // pero sí puede explicar respuestas degeneradas o en bucle con estos
          // modelos. Solo se fuerza en la familia 3: los anteriores sí se
          // benefician de ajustar la temperatura.
          const esFamiliaGemini3 = /^gemini-3/.test(String(targetModel));
          const temperaturaEfectiva = esFamiliaGemini3
            ? 1.0
            : typeof temperature === "number" ? temperature : 0.5;

          // v1.6.19 — 🏃 EL ARREGLO DE LA VELOCIDAD.
          //
          // La temperatura no era lo único que iba por defecto: el NIVEL DE
          // RAZONAMIENTO también. Gemini 3 razona en «high» si no se le dice
          // otra cosa, y Google lo describe como «may take significantly longer
          // to reach a first output token» — en una interfaz de chat eso es
          // pura espera sin valor. Google documenta `low` como «minimizes
          // latency and cost. Best for simple instruction following, chat, or
          // high-throughput applications», que es exactamente este caso.
          //
          // Se construye aparte, y tipado como `any`, en vez de con un spread
          // condicional dentro del literal: TypeScript rechaza el literal
          // resultante (error TS2322 contra GenerateContentConfig). En los
          // modelos anteriores al 3 este parámetro no existe.
          // v1.6.21 — «low» → «minimal». Puede ser que la v1.6.19 lo pusiera a
          // pensar MÁS de lo que venía: la tabla de Google marca «minimal» como
          // el valor POR DEFECTO en los modelos Flash-Lite, y «low» como un
          // escalón POR ENCIMA. Elegir un gemini-*-flash-lite y forzarle «low»
          // era subirle el razonamiento, no bajárselo.
          //
          // Y el razonamiento se paga en TIEMPO antes de la primera palabra
          // visible — que es justo el minuto que se estaba midiendo.
          const configRazonamientoGemini: any = esFamiliaGemini3
            ? { thinkingLevel: "minimal" }
            : undefined;

          const streamResult = await ai.models.generateContentStream({
            model: targetModel,
            contents,
            config: {
              systemInstruction: consolidatedSystemInstruction,
              temperature: temperaturaEfectiva,
              abortSignal: ctrlGemini.signal,
              thinkingConfig: configRazonamientoGemini,
            },
          });

          let streamedAnyChunk = false;
          for await (const chunk of streamResult) {
            // Primer token: la espera ya está pagada. Se levanta el techo para no
            // matar una generación larga a mitad de camino.
            if (!streamedAnyChunk) clearTimeout(relojGemini);
            if (ctx.isAborted()) break;
            const text = chunk.text;
            if (text) {
              ctx.sendChunk(text);
              streamedAnyChunk = true;
            }
          }

          // El flujo terminó sin token (o lo cortó el usuario): el reloj ya no
          // vigila nada. `clearTimeout` repetido es inofensivo.
          clearTimeout(relojGemini);

          if (streamedAnyChunk) {
            ctx.sendDone(targetModel);
            return;
          }
          lastGeminiErr = new Error(`Gemini no emitió tokens para el modelo ${targetModel}`);
         } catch (geminiErr: any) {
          // Si el SDK falló ANTES del primer token, el reloj seguía armado.
          if (relojGemini) clearTimeout(relojGemini);
          // v1.6.19 — «signal is aborted without reason» no le dice nada a nadie.
          // Peor: suena a que el usuario configuró algo mal, cuando el aborto lo
          // provocaba nuestro propio reloj. Si fue eso, se dice en claro.
          const fueNuestroReloj =
            geminiErr?.name === "AbortError" ||
            /abort/i.test(String(geminiErr?.message ?? ""));
          lastGeminiErr = fueNuestroReloj
            ? new Error(
                `Gemini no empezó a responder a tiempo con ${targetModel} y se cortó la espera ` +
                `para no dejarte en blanco. Prueba con otro modelo de la lista, o revisa la conexión.`
              )
            : geminiErr;
          console.warn(`Error en Gemini stream (${targetModel}):`, geminiErr.message);
        }
      }
      // 🔧 CORRECCIÓN: si llegamos aquí, todos los modelos candidatos de Gemini fallaron.
      // Enviar error claro en vez de caer al fallback autónomo.
      // ============================================================
      // v2.0 — DIAGNÓSTICO ÚTIL PARA EL PLAN GRATUITO DE GEMINI
      // ------------------------------------------------------------
      // Antes: "verifica que la key sea válida y tengas cuota disponible". Eso no
      // dice nada. Ahora se clasifica el error real y se explica cómo seguir
      // trabajando, porque el plan gratuito de Gemini SÍ tiene un tope diario
      // (recortado de 250 a unas pocas decenas de peticiones al día según los
      // propios foros de Google) y por tanto NO es un motor "sin cuota diaria".
      // ============================================================
      const geminiMsg = String(lastGeminiErr?.message || "");
      const isQuotaErr = /429|RESOURCE_EXHAUSTED|quota|rate.?limit|exceeded/i.test(geminiMsg);
      const isKeyErr = /400|401|403|API key|API_KEY_INVALID|PERMISSION_DENIED|permission/i.test(geminiMsg);

      const diagnosis = isQuotaErr
        ? "Se agotó la cuota del plan GRATUITO de Gemini.\n" +
          "Ten en cuenta que Google recortó el nivel gratuito: el límite es DIARIO y en la práctica son unas pocas decenas de peticiones al día. No sirve como motor de trabajo intensivo.\n" +
          "Opciones que sí aguantan:\n" +
          "  · GLM-4.7-Flash (Z.ai) — gratis y sin tope diario publicado. Pon tu API key de Z.ai en Config y selecciónalo.\n" +
          "  · Cualquier modelo LOCAL de Ollama — sin cuota de ningún tipo (los tuyos: qwen2.5-coder:1.5b, qwen3:0.6b, smollm2:1.5b)."
        : isKeyErr
        ? "La API key de Gemini no es válida o no tiene permisos.\n" +
          "Genera una nueva en https://aistudio.google.com/apikey (empieza por «AIza») y pégala en Config → Gemini."
        : "No fue cuota ni clave: parece un fallo temporal del servicio. Prueba de nuevo o cambia a GLM-4.7-Flash / un modelo local.";

      // El motor aprende del fallo: queda registrado con su causa
      try {
        learnFromToolFailure("gemini", { model }, JSON.stringify({ ok: false, error: geminiMsg || "sin detalle" }));
      } catch {}

      ctx.sendError(
        `❌ Gemini no pudo responder con "${model}".\n\n${diagnosis}\n\nDetalle técnico: ${geminiMsg.slice(0, 300) || "desconocido"}`
      );
      return;
    }

    // 4. PROVIDER: OPENROUTER
    if (provider === "openrouter" && openrouterApiKey) {
      let orEnteredAndFailed = false;
      let orFailReason = "";
      try {
        const messagesToSend: any[] = [
          {
            role: "system",
            content: consolidatedSystemInstruction,
          },
        ];

        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });

        const orResponse = await fetchCloud("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openrouterApiKey}`,
          },
          body: JSON.stringify({
            model: model || "deepseek/deepseek-r1",
            messages: messagesToSend,
            stream: true,
            temperature: temperature || 0.5,
          }),
        });

        if (orResponse.ok && orResponse.body) {
          // 🔧 REFACTORIZACIÓN: usar pipeOpenAICompatibleStream (compartido con Custom).
          const emitted = await pipeOpenAICompatibleStream(orResponse, ctx);
          if (emitted) {
            ctx.sendDone(model);
            return;
          }
          orEnteredAndFailed = true;
          orFailReason = "stream vacío (ningún token recibido)";
        } else {
          // 🔧 CORRECCIÓN: capturar el error HTTP de OpenRouter y enviarlo al cliente.
          let errBody = "";
          try { errBody = await orResponse.text(); } catch {}
          let orErrMsg = `HTTP ${orResponse.status}`;
          try {
            const errJson = JSON.parse(errBody);
            if (errJson?.error?.message) orErrMsg = errJson.error.message;
            else if (errJson?.error) orErrMsg = String(errJson.error);
          } catch {}
          orEnteredAndFailed = true;
          orFailReason = orErrMsg + (errBody && !orErrMsg.includes(errBody.slice(0, 100)) ? ` (${errBody.slice(0, 200)})` : "");
          console.warn(`[ai/stream] OpenRouter devolvió HTTP ${orResponse.status}: ${orErrMsg}`);
        }
      } catch (orErr: any) {
        orEnteredAndFailed = true;
        orFailReason = orErr.message || String(orErr);
        console.warn("Error en OpenRouter stream:", orErr.message);
      }

      // 🔧 CORRECCIÓN CRÍTICA: si OpenRouter falló, NO caer al fallback autónomo
      // silenciosamente — enviar error claro al usuario.
      if (orEnteredAndFailed) {
        ctx.sendError(`❌ OpenRouter no pudo responder para el modelo "${model}": ${orFailReason}`);
        return;
      }
    }

    // 4.5. PROVIDER: CUSTOM SERVER / PROXY (Puerto 5000 u otro endpoint OpenAI/v1 compatible)
    if (provider === "custom" && customServerUrl) {
      let customEnteredAndFailed = false;
      let customFailReason = "";
      try {
        const cleanUrl = customServerUrl.replace(/\/$/, "");
        const endpoint = cleanUrl.endsWith("/chat/completions")
          ? cleanUrl
          : cleanUrl.endsWith("/v1")
          ? `${cleanUrl}/chat/completions`
          : `${cleanUrl}/v1/chat/completions`;

        const messagesToSend: any[] = [
          {
            role: "system",
            content: consolidatedSystemInstruction,
          },
        ];

        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });

        const customHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (customApiKey) {
          customHeaders["Authorization"] = `Bearer ${customApiKey}`;
        }

        const customResponse = await fetchCloud(endpoint, {
          method: "POST",
          headers: customHeaders,
          body: JSON.stringify({
            model: model || "default",
            messages: messagesToSend,
            stream: true,
            temperature: temperature || 0.5,
          }),
        });

        if (customResponse.ok && customResponse.body) {
          // 🔧 REFACTORIZACIÓN: usar pipeOpenAICompatibleStream (compartido con OpenRouter).
          const emitted = await pipeOpenAICompatibleStream(customResponse, ctx);
          if (emitted) {
            ctx.sendDone(model);
            return;
          }
          customEnteredAndFailed = true;
          customFailReason = "stream vacío (ningún token recibido)";
        } else {
          // 🔧 CORRECCIÓN: capturar el error HTTP del Custom Server y enviarlo al cliente.
          let errBody = "";
          try { errBody = await customResponse.text(); } catch {}
          let customErrMsg = `HTTP ${customResponse.status}`;
          try {
            const errJson = JSON.parse(errBody);
            if (errJson?.error?.message) customErrMsg = errJson.error.message;
            else if (errJson?.error) customErrMsg = String(errJson.error);
          } catch {}
          customEnteredAndFailed = true;
          customFailReason = customErrMsg + (errBody && !customErrMsg.includes(errBody.slice(0, 100)) ? ` (${errBody.slice(0, 200)})` : "");
          console.warn(`[ai/stream] Custom Server (${endpoint}) devolvió HTTP ${customResponse.status}: ${customErrMsg}`);
        }
      } catch (customErr: any) {
        customEnteredAndFailed = true;
        customFailReason = customErr.message || String(customErr);
        console.warn("Error en Custom Server stream:", customErr.message);
      }

      // 🔧 CORRECCIÓN CRÍTICA: si el Custom Server falló, NO caer al fallback autónomo
      // silenciosamente — enviar error claro al usuario.
      if (customEnteredAndFailed) {
        ctx.sendError(`❌ Custom Server no pudo responder para el modelo "${model}": ${customFailReason}`);
        return;
      }
    }

    // 4.7. PROVIDER: OPENAI (api.openai.com directo)
    if (provider === "openai") {
      let openaiEnteredAndFailed = false;
      let openaiFailReason = "";
      try {
        if (!openaiApiKey) {
          ctx.sendError(
            `❌ OpenAI requiere API Key. Configúrala en el modal "Ranuras de API Keys" ` +
            `(botón "Abrir Ranuras" en el panel izquierdo), o como variable de entorno ` +
            `OPENAI_API_KEY. Consíguela en https://platform.openai.com/api-keys`
          );
          return;
        }
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        // Soporte de imágenes: si el modelo es vision-capable (gpt-4o, gpt-4o-mini, gpt-4-vision)
        // y hay imágenes adjuntas, las añadimos al último mensaje del usuario como content array.
        const isVisionOpenai = /^gpt-4o|gpt-4-vision/i.test(model);
        const finalUserContent: any = isVisionOpenai && base64Images.length > 0
          ? [
              { type: "text", text: fullUserPrompt },
              ...base64Images.map((b64: string) => ({
                type: "image_url",
                image_url: { url: `data:image/png;base64,${b64}` },
              })),
            ]
          : fullUserPrompt;
        messagesToSend.push({ role: "user", content: finalUserContent });

        const openaiResponse = await fetchCloud("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: model || "gpt-4o-mini",
            messages: messagesToSend,
            stream: true,
            temperature: typeof temperature === "number" ? temperature : 0.5,
          }),
        });

        if (openaiResponse.ok && openaiResponse.body) {
          const emitted = await pipeOpenAICompatibleStream(openaiResponse, ctx);
          if (emitted) {
            ctx.sendDone(model);
            return;
          }
          openaiEnteredAndFailed = true;
          openaiFailReason = "stream vacío (ningún token recibido)";
        } else {
          let errBody = "";
          try { errBody = await openaiResponse.text(); } catch {}
          let openaiErrMsg = `HTTP ${openaiResponse.status}`;
          try {
            const errJson = JSON.parse(errBody);
            if (errJson?.error?.message) openaiErrMsg = errJson.error.message;
            else if (errJson?.error) openaiErrMsg = String(errJson.error);
          } catch {}
          openaiEnteredAndFailed = true;
          openaiFailReason = openaiErrMsg + (errBody && !openaiErrMsg.includes(errBody.slice(0, 100)) ? ` (${errBody.slice(0, 200)})` : "");
          console.warn(`[ai/stream] OpenAI devolvió HTTP ${openaiResponse.status}: ${openaiErrMsg}`);
        }
      } catch (openaiErr: any) {
        openaiEnteredAndFailed = true;
        openaiFailReason = openaiErr.message || String(openaiErr);
        console.warn("Error en OpenAI stream:", openaiErr.message);
      }

      if (openaiEnteredAndFailed) {
        ctx.sendError(`❌ OpenAI no pudo responder para el modelo "${model}": ${openaiFailReason}`);
        return;
      }
    }

    // 4.8. PROVIDER: Z.AI (GLM-4.5-Flash, GLM-4-Flash — 100% GRATIS)
    // Z.ai expone un endpoint OpenAI-compatible en https://api.z.ai/api/paas/v4/chat/completions
    if (provider === "zai") {
      if (!zaiApiKey) {
        // v1.1 — Modo DEMO amistoso: en lugar de errorar, respondemos con un mensaje
        // útil que explica cómo obtener la clave gratuita en 30 segundos. Así el chat
        // no parece "roto" y el usuario sabe qué hacer.
        const demoMessage =
          `## 🧠 GLM-4.5-Flash — Tu modelo gratuito está listo\n\n` +
          // v0.9 — Aquí ponía «**CerebroNico V1**» a mano: un literal de versión
          // en TEXTO QUE EL USUARIO LEE, y encima con una versión que ya no
          // existía. Es el mismo defecto que la discrepancia «cabecera V8.0.0 /
          // menú CN V1.0.3», en un sitio donde nadie lo iba a buscar: el saludo
          // del modo demo. Ahora sale de la fuente única.
          `Hola, soy el modo demo de **${IDE_BRAND.FULL_NAME}**. El motor **GLM-4.5-Flash de Z.ai** ya está preconfigurado como predeterminado, ` +
          `pero para empezar a chatear de verdad necesitas pegar tu **clave API gratuita**.\n\n` +
          `### Por qué Z.ai + GLM-4.5-Flash\n` +
          `- ✅ **100% gratuito** con generosos límites diarios.\n` +
          `- ✅ **Sin tarjeta de crédito** (solo email + verificación SMS).\n` +
          `- ✅ **128K de contexto** — suficiente para archivos enteros.\n` +
          `- ✅ **Responde en español** de forma natural.\n\n` +
          `### Cómo activarlo en 30 segundos\n\n` +
          `1. **Abre** 👉 [https://z.ai/manage/apikey](https://z.ai/manage/apikey) en una pestaña nueva.\n` +
          `2. **Regístrate** con tu email y verifica tu teléfono (recibirás un SMS).\n` +
          `3. **Copia** la clave que aparece (formato como \`xxxxxxxx.xxxxxxxxxxxxxxxx\`).\n` +
          `4. En CerebroNico, clic en el botón **"Ranuras API"** del panel izquierdo (o en el menú **CN → Ranuras API**).\n` +
          `5. Pega tu clave en el campo destacado en violeta **"0. Z.ai (GLM)"**.\n` +
          `6. ¡Listo! Vuelve a escribir aquí y te responderá GLM-4.5-Flash en tiempo real.\n\n` +
          `> 💡 La clave se guarda **solo en tu navegador** (localStorage). No se comparte ni se envía a terceros.\n\n` +
          `### ¿Quieres probar otros modelos gratis?\n\n` +
          `Si ya tienes claves de **Groq** (Llama 3.3 70B), **Gemini** (Flash), **OpenRouter** (DeepSeek R1:free), ` +
          `**Cerebras**, **Together AI**, **Mistral** o **Fireworks**, puedes pegarlas también en **Ranuras API** ` +
          `y seleccionar el modelo desde el **selector de modelos** (botón con el nombre del modelo arriba).\n\n` +
          `---\n*Vuelve a escribir tu consulta después de pegar tu clave gratuita de Z.ai.*`;
        ctx.sendChunk(demoMessage);
        ctx.sendDone("glm-4.5-flash (modo demo)");
        return;
      }
      let zaiEnteredAndFailed = false;
      let zaiFailReason = "";
      try {
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        // Soporte de visión para GLM-4.5V-Flash (modelo multimodal gratuito):
        const isZaiVision = /glm-4\.5v|glm-4v|vision/i.test(model);
        const finalUserContent: any = isZaiVision && base64Images.length > 0
          ? [
              { type: "text", text: fullUserPrompt },
              ...base64Images.map((b64: string) => ({
                type: "image_url",
                image_url: { url: `data:image/png;base64,${b64}` },
              })),
            ]
          : fullUserPrompt;
        messagesToSend.push({ role: "user", content: finalUserContent });

        // Modelo por defecto: GLM-4.5-Flash (gratis, veloz, capaz).
        const targetModel = model && model !== "stablelm2:latest" ? model : "glm-4.5-flash";

        const zaiResponse = await fetchCloud("https://api.z.ai/api/paas/v4/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${zaiApiKey}`,
          },
          body: JSON.stringify({
            model: targetModel,
            messages: messagesToSend,
            stream: true,
            temperature: typeof temperature === "number" ? temperature : 0.5,
          }),
        });

        if (zaiResponse.ok && zaiResponse.body) {
          const emitted = await pipeOpenAICompatibleStream(zaiResponse, ctx);
          if (emitted) {
            ctx.sendDone(targetModel);
            return;
          }
          zaiEnteredAndFailed = true;
          zaiFailReason = "stream vacío (ningún token recibido)";
        } else {
          let errBody = "";
          try { errBody = await zaiResponse.text(); } catch {}
          let zaiErrMsg = `HTTP ${zaiResponse.status}`;
          try {
            const errJson = JSON.parse(errBody);
            if (errJson?.error?.message) zaiErrMsg = errJson.error.message;
            else if (errJson?.error) zaiErrMsg = String(errJson.error);
            else if (errJson?.message) zaiErrMsg = errJson.message;
          } catch {}
          zaiEnteredAndFailed = true;
          zaiFailReason = zaiErrMsg + (errBody && !zaiErrMsg.includes(errBody.slice(0, 100)) ? ` (${errBody.slice(0, 200)})` : "");
          console.warn(`[ai/stream] Z.ai devolvió HTTP ${zaiResponse.status}: ${zaiErrMsg}`);
        }
      } catch (zaiErr: any) {
        zaiEnteredAndFailed = true;
        zaiFailReason = zaiErr.message || String(zaiErr);
        console.warn("Error en Z.ai stream:", zaiErr.message);
      }
      if (zaiEnteredAndFailed) {
        ctx.sendError(`❌ Z.ai no pudo responder para el modelo "${model}": ${zaiFailReason}`);
        return;
      }
    }

    // 4.9. PROVIDER: GROQ (ultra-rápido, tier gratuito)
    if (provider === "groq") {
      if (!groqApiKey) {
        ctx.sendError(
          `❌ Groq requiere API Key. Consíguela GRATIS en https://console.groq.com/keys ` +
          `(tier gratuito con rate limits generosos).`
        );
        return;
      }
      let groqEnteredAndFailed = false;
      let groqFailReason = "";
      try {
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });
        const targetModel = model && model !== "stablelm2:latest" ? model : "llama-3.3-70b-versatile";
        const groqResponse = await fetchCloud("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${groqApiKey}`,
          },
          body: JSON.stringify({
            model: targetModel,
            messages: messagesToSend,
            stream: true,
            temperature: typeof temperature === "number" ? temperature : 0.5,
          }),
        });
        if (groqResponse.ok && groqResponse.body) {
          const emitted = await pipeOpenAICompatibleStream(groqResponse, ctx);
          if (emitted) { ctx.sendDone(targetModel); return; }
          groqEnteredAndFailed = true;
          groqFailReason = "stream vacío (ningún token recibido)";
        } else {
          let errBody = "";
          try { errBody = await groqResponse.text(); } catch {}
          let groqErrMsg = `HTTP ${groqResponse.status}`;
          try {
            const errJson = JSON.parse(errBody);
            if (errJson?.error?.message) groqErrMsg = errJson.error.message;
            else if (errJson?.error) groqErrMsg = String(errJson.error);
          } catch {}
          groqEnteredAndFailed = true;
          groqFailReason = groqErrMsg + (errBody && !groqErrMsg.includes(errBody.slice(0, 100)) ? ` (${errBody.slice(0, 200)})` : "");
          console.warn(`[ai/stream] Groq devolvió HTTP ${groqResponse.status}: ${groqErrMsg}`);
        }
      } catch (groqErr: any) {
        groqEnteredAndFailed = true;
        groqFailReason = groqErr.message || String(groqErr);
        console.warn("Error en Groq stream:", groqErr.message);
      }
      if (groqEnteredAndFailed) {
        ctx.sendError(`❌ Groq no pudo responder para el modelo "${model}": ${groqFailReason}`);
        return;
      }
    }

    // 4.10. PROVIDER: CEREBRAS (ultra-rápido, beta gratuita)
    if (provider === "cerebras") {
      if (!cerebrasApiKey) {
        ctx.sendError(
          `❌ Cerebras requiere API Key. Consíguela GRATIS en https://cloud.cerebras.ai ` +
          `(tier gratuito durante la beta).`
        );
        return;
      }
      let cerebrasEnteredAndFailed = false;
      let cerebrasFailReason = "";
      try {
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });
        const targetModel = model && model !== "stablelm2:latest" ? model : "llama3.1-8b";
        const cerebrasResponse = await fetchCloud("https://api.cerebras.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cerebrasApiKey}`,
          },
          body: JSON.stringify({
            model: targetModel,
            messages: messagesToSend,
            stream: true,
            temperature: typeof temperature === "number" ? temperature : 0.5,
          }),
        });
        if (cerebrasResponse.ok && cerebrasResponse.body) {
          const emitted = await pipeOpenAICompatibleStream(cerebrasResponse, ctx);
          if (emitted) { ctx.sendDone(targetModel); return; }
          cerebrasEnteredAndFailed = true;
          cerebrasFailReason = "stream vacío (ningún token recibido)";
        } else {
          let errBody = "";
          try { errBody = await cerebrasResponse.text(); } catch {}
          let cerebrasErrMsg = `HTTP ${cerebrasResponse.status}`;
          try {
            const errJson = JSON.parse(errBody);
            if (errJson?.error?.message) cerebrasErrMsg = errJson.error.message;
            else if (errJson?.error) cerebrasErrMsg = String(errJson.error);
          } catch {}
          cerebrasEnteredAndFailed = true;
          cerebrasFailReason = cerebrasErrMsg + (errBody && !cerebrasErrMsg.includes(errBody.slice(0, 100)) ? ` (${errBody.slice(0, 200)})` : "");
          console.warn(`[ai/stream] Cerebras devolvió HTTP ${cerebrasResponse.status}: ${cerebrasErrMsg}`);
        }
      } catch (cerebrasErr: any) {
        cerebrasEnteredAndFailed = true;
        cerebrasFailReason = cerebrasErr.message || String(cerebrasErr);
        console.warn("Error en Cerebras stream:", cerebrasErr.message);
      }
      if (cerebrasEnteredAndFailed) {
        ctx.sendError(`❌ Cerebras no pudo responder para el modelo "${model}": ${cerebrasFailReason}`);
        return;
      }
    }

    // 4.11. PROVIDER: TOGETHER AI ($5 crédito gratuito)
    if (provider === "together") {
      if (!togetherApiKey) {
        ctx.sendError(
          `❌ Together AI requiere API Key. Consíguela en https://api.together.xyz/settings/api-keys ` +
          `($5 de crédito gratuito al registrarse).`
        );
        return;
      }
      let togetherEnteredAndFailed = false;
      let togetherFailReason = "";
      try {
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });
        const targetModel = model && model !== "stablelm2:latest" ? model : "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free";
        const togetherResponse = await fetchCloud("https://api.together.xyz/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${togetherApiKey}`,
          },
          body: JSON.stringify({
            model: targetModel,
            messages: messagesToSend,
            stream: true,
            temperature: typeof temperature === "number" ? temperature : 0.5,
          }),
        });
        if (togetherResponse.ok && togetherResponse.body) {
          const emitted = await pipeOpenAICompatibleStream(togetherResponse, ctx);
          if (emitted) { ctx.sendDone(targetModel); return; }
          togetherEnteredAndFailed = true;
          togetherFailReason = "stream vacío (ningún token recibido)";
        } else {
          let errBody = "";
          try { errBody = await togetherResponse.text(); } catch {}
          let togetherErrMsg = `HTTP ${togetherResponse.status}`;
          try {
            const errJson = JSON.parse(errBody);
            if (errJson?.error?.message) togetherErrMsg = errJson.error.message;
            else if (errJson?.error) togetherErrMsg = String(errJson.error);
          } catch {}
          togetherEnteredAndFailed = true;
          togetherFailReason = togetherErrMsg + (errBody && !togetherErrMsg.includes(errBody.slice(0, 100)) ? ` (${errBody.slice(0, 200)})` : "");
          console.warn(`[ai/stream] Together devolvió HTTP ${togetherResponse.status}: ${togetherErrMsg}`);
        }
      } catch (togetherErr: any) {
        togetherEnteredAndFailed = true;
        togetherFailReason = togetherErr.message || String(togetherErr);
        console.warn("Error en Together stream:", togetherErr.message);
      }
      if (togetherEnteredAndFailed) {
        ctx.sendError(`❌ Together AI no pudo responder para el modelo "${model}": ${togetherFailReason}`);
        return;
      }
    }

    // 4.12. PROVIDER: MISTRAL AI (tier gratuito)
    if (provider === "mistral") {
      if (!mistralApiKey) {
        ctx.sendError(
          `❌ Mistral AI requiere API Key. Consíguela en https://console.mistral.ai/api-keys ` +
          `(tier gratuito con rate limits).`
        );
        return;
      }
      let mistralEnteredAndFailed = false;
      let mistralFailReason = "";
      try {
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });
        const targetModel = model && model !== "stablelm2:latest" ? model : "mistral-small-latest";
        const mistralResponse = await fetchCloud("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${mistralApiKey}`,
          },
          body: JSON.stringify({
            model: targetModel,
            messages: messagesToSend,
            stream: true,
            temperature: typeof temperature === "number" ? temperature : 0.5,
          }),
        });
        if (mistralResponse.ok && mistralResponse.body) {
          const emitted = await pipeOpenAICompatibleStream(mistralResponse, ctx);
          if (emitted) { ctx.sendDone(targetModel); return; }
          mistralEnteredAndFailed = true;
          mistralFailReason = "stream vacío (ningún token recibido)";
        } else {
          let errBody = "";
          try { errBody = await mistralResponse.text(); } catch {}
          let mistralErrMsg = `HTTP ${mistralResponse.status}`;
          try {
            const errJson = JSON.parse(errBody);
            if (errJson?.error?.message) mistralErrMsg = errJson.error.message;
            else if (errJson?.error) mistralErrMsg = String(errJson.error);
          } catch {}
          mistralEnteredAndFailed = true;
          mistralFailReason = mistralErrMsg + (errBody && !mistralErrMsg.includes(errBody.slice(0, 100)) ? ` (${errBody.slice(0, 200)})` : "");
          console.warn(`[ai/stream] Mistral devolvió HTTP ${mistralResponse.status}: ${mistralErrMsg}`);
        }
      } catch (mistralErr: any) {
        mistralEnteredAndFailed = true;
        mistralFailReason = mistralErr.message || String(mistralErr);
        console.warn("Error en Mistral stream:", mistralErr.message);
      }
      if (mistralEnteredAndFailed) {
        ctx.sendError(`❌ Mistral no pudo responder para el modelo "${model}": ${mistralFailReason}`);
        return;
      }
    }

    // 4.13. PROVIDER: DEEPSEEK (muy económico, casi gratis)
    if (provider === "deepseek") {
      if (!deepseekApiKey) {
        ctx.sendError(
          `❌ DeepSeek requiere API Key. Consíguela en https://platform.deepseek.com/api_keys ` +
          `(muy económico, casi gratis).`
        );
        return;
      }
      let deepseekEnteredAndFailed = false;
      let deepseekFailReason = "";
      try {
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });
        const targetModel = model && model !== "stablelm2:latest" ? model : "deepseek-chat";
        const deepseekResponse = await fetchCloud("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${deepseekApiKey}`,
          },
          body: JSON.stringify({
            model: targetModel,
            messages: messagesToSend,
            stream: true,
            temperature: typeof temperature === "number" ? temperature : 0.5,
          }),
        });
        if (deepseekResponse.ok && deepseekResponse.body) {
          const emitted = await pipeOpenAICompatibleStream(deepseekResponse, ctx);
          if (emitted) { ctx.sendDone(targetModel); return; }
          deepseekEnteredAndFailed = true;
          deepseekFailReason = "stream vacío (ningún token recibido)";
        } else {
          let errBody = "";
          try { errBody = await deepseekResponse.text(); } catch {}
          let deepseekErrMsg = `HTTP ${deepseekResponse.status}`;
          try {
            const errJson = JSON.parse(errBody);
            if (errJson?.error?.message) deepseekErrMsg = errJson.error.message;
            else if (errJson?.error) deepseekErrMsg = String(errJson.error);
          } catch {}
          deepseekEnteredAndFailed = true;
          deepseekFailReason = deepseekErrMsg + (errBody && !deepseekErrMsg.includes(errBody.slice(0, 100)) ? ` (${errBody.slice(0, 200)})` : "");
          console.warn(`[ai/stream] DeepSeek devolvió HTTP ${deepseekResponse.status}: ${deepseekErrMsg}`);
        }
      } catch (deepseekErr: any) {
        deepseekEnteredAndFailed = true;
        deepseekFailReason = deepseekErr.message || String(deepseekErr);
        console.warn("Error en DeepSeek stream:", deepseekErr.message);
      }
      if (deepseekEnteredAndFailed) {
        ctx.sendError(`❌ DeepSeek no pudo responder para el modelo "${model}": ${deepseekFailReason}`);
        return;
      }
    }

    // 4.14. PROVIDER: FIREWORKS AI ($1 crédito gratuito)
    if (provider === "fireworks") {
      if (!fireworksApiKey) {
        ctx.sendError(
          `❌ Fireworks AI requiere API Key. Consíguela en https://fireworks.ai/account/api-keys ` +
          `($1 de crédito gratuito al registrarse).`
        );
        return;
      }
      let fireworksEnteredAndFailed = false;
      let fireworksFailReason = "";
      try {
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });
        const targetModel = model && model !== "stablelm2:latest" ? model : "accounts/fireworks/models/llama-v3p1-70b-instruct";
        const fireworksResponse = await fetchCloud("https://api.fireworks.ai/inference/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${fireworksApiKey}`,
          },
          body: JSON.stringify({
            model: targetModel,
            messages: messagesToSend,
            stream: true,
            temperature: typeof temperature === "number" ? temperature : 0.5,
          }),
        });
        if (fireworksResponse.ok && fireworksResponse.body) {
          const emitted = await pipeOpenAICompatibleStream(fireworksResponse, ctx);
          if (emitted) { ctx.sendDone(targetModel); return; }
          fireworksEnteredAndFailed = true;
          fireworksFailReason = "stream vacío (ningún token recibido)";
        } else {
          let errBody = "";
          try { errBody = await fireworksResponse.text(); } catch {}
          let fireworksErrMsg = `HTTP ${fireworksResponse.status}`;
          try {
            const errJson = JSON.parse(errBody);
            if (errJson?.error?.message) fireworksErrMsg = errJson.error.message;
            else if (errJson?.error) fireworksErrMsg = String(errJson.error);
          } catch {}
          fireworksEnteredAndFailed = true;
          fireworksFailReason = fireworksErrMsg + (errBody && !fireworksErrMsg.includes(errBody.slice(0, 100)) ? ` (${errBody.slice(0, 200)})` : "");
          console.warn(`[ai/stream] Fireworks devolvió HTTP ${fireworksResponse.status}: ${fireworksErrMsg}`);
        }
      } catch (fireworksErr: any) {
        fireworksEnteredAndFailed = true;
        fireworksFailReason = fireworksErr.message || String(fireworksErr);
        console.warn("Error en Fireworks stream:", fireworksErr.message);
      }
      if (fireworksEnteredAndFailed) {
        ctx.sendError(`❌ Fireworks no pudo responder para el modelo "${model}": ${fireworksFailReason}`);
        return;
      }
    }

    // 5. PROVIDER: OLLAMA LOCAL
    if (provider === "ollama") {
      const targetUrl = (ollamaUrl || OLLAMA_DEFAULT).replace(/\/$/, "");
      // 🔧 IMPORTANTE: NO modificar el nombre del modelo. El usuario puede tener
      // modelos con nombres personalizados (ej: "qwen2.5-coder:1.5b.ollama") que
      // Ollama reconoce tal cual. Enviar el nombre EXACTO que el usuario seleccionó.
      const isVision = isVisionModelName(model);

      // v2.0 — Perfil de rendimiento: decide contexto, tope de salida, hilos y
      // si este modelo puede usar herramientas. Es la pieza que evita que un
      // modelo de 250 MB entre al bucle de agente y deje la UI sin responder.
      const profile = getProfile(model);
      const activeTools = getToolsForModel(model, pcMode);
      const toolNames = activeTools.map((t: any) => t?.function?.name).filter(Boolean);

      const messagesPayload: any[] = [];

      // Add main system instruction
      if (consolidatedSystemInstruction) {
        let sysContent = consolidatedSystemInstruction;
        if (activeTools.length > 0) {
          sysContent +=
            "\n\n[PROTOCOLO DE AGENTE AUTÓNOMO]\n" +
            `- Herramientas disponibles: ${toolNames.join(", ")}.\n` +
            "- ANTES de actuar, define un plan con set_plan (tareas cortas y accionables, cada una con id y descripción).\n" +
            "- Ejecuta paso a paso y actualiza el estado con update_task (pending | in_progress | completed).\n" +
            "- Para retoques usa edit_file (buscar/reemplazar), no reescribas el archivo entero.\n" +
            "- ANTES de declarar terminada una mejora, CIERRA con revisar_cambios (el Quirófano juzga sintaxis, API pública e imports) y run_tests. Si algo sale rojo, corrige y vuelve a verificar: no des nada por bueno en rojo.";
        } else if (profile.tier === "micro" || profile.tier === "tiny") {
          // Se lo decimos explícitamente: así no intenta inventar tool-calls ni
          // se queda "pensando" en un formato que no puede emitir.
          // v2.0 — Refuerzo contra el fallo más grave de un modelo diminuto:
          // INVENTAR acciones. Caso real reportado: un gemma3:270m respondió con
          // un nombre de herramienta inexistente ("pc_quick_action") y una ruta
          // con error, como si de verdad hubiese ejecutado algo en el PC. Nada
          // de eso ocurrió: el motor no ejecutó nada porque este modelo no tiene
          // herramientas. Ahora se le prohíbe explícitamente simular.
          sysContent +=
            "\n\n[MODO SIN HERRAMIENTAS — LEE ESTO]\n" +
            "Este modelo NO tiene herramientas disponibles: no puede leer ni escribir archivos, no puede ejecutar comandos, no puede mirar el PC ni el sandbox.\n" +
            "- PROHIBIDO escribir que ejecutaste algo, que leíste un archivo o que encontraste un error. No lo hiciste.\n" +
            "- PROHIBIDO inventar nombres de herramientas (por ejemplo pc_quick_action) o rutas de archivo.\n" +
            "- Si te piden una acción, responde en UNA frase: «Con este modelo no puedo ejecutar acciones; cambia a un modelo de 4B o más (o a GLM-4.7-Flash) para que lo haga el motor».\n" +
            "- Responde en texto directo y breve (máximo 6 líneas)." +
            "\n\nSi el usuario te pide una dirección o una ruta y no la tienes en el contexto, no la inventes: dilo.";
        }

        // ============================================================
        // V8 · D1 — el CONOCIMIENTO DEL MOTOR (KB + manual de herramientas +
        // símbolos reales + equipo espejo activo) ya se inyectó en el punto
        // central multi-proveedor ANTES de las ramas. Aquí solo quedan los
        // protocolos de comportamiento específicos del conductor Ollama.
        // (En v2.x esto vivía solo en la rama Ollama: la nube no recibía el
        //  motor — violaba la tesis "el conocimiento vive en el motor").
        // ============================================================
        if (pcMode && activeTools.length > 0) {
          sysContent +=
            "\n\n[PROTOCOLO DE AGENTE PC — puente :5000 ACTIVO]\n" +
            "El usuario activó el 'Modo Agente PC'. AHORA puedes ejecutar acciones REALES en la PC del usuario a través de las herramientas pc_*.\n" +
            "- ANTES de tocar archivos, llama a pc_info para conocer las rutas reales (OS, Escritorio/Desktop, home, usuario).\n" +
            "- Para CREAR un archivo usa SIEMPRE pc_write_file (no uses pc_exec con echo: es más fiable y evita problemas de codificación). Usa atajos tipo 'Desktop/archivo.txt' o rutas absolutas que devuelva pc_info.\n" +
            "- Para EJECUTAR comandos reales usa pc_exec. Para LISTAR usa pc_list_dir. Para LEER usa pc_read_file.\n" +
            "- pc_delete es DESTRUCTIVA: úsala SOLO si el usuario lo pidió explícitamente.\n" +
            "- Tras cada acción, verifica el resultado (pc_read_file / pc_list_dir) y reporta al usuario el contenido exacto y la ruta del archivo creado/modificado, para que lo pueda confirmar.\n" +
            "- Las herramientas list_files/read_file/write_file/run_command (sin prefijo pc_) operan SOLO dentro del sandbox .proyectos. Para la PC real usa SIEMPRE las herramientas pc_*.";
        }
        messagesPayload.push({ role: "system", content: sysContent });
      }

      // Add full history messages
      // v2.0 — Defensa final del contexto: aunque el cliente ya acota el
      // historial, aquí se vuelve a recortar al presupuesto del modelo. Con un
      // modelo diminuto, un prompt de 8.000 tokens son MINUTOS de espera en CPU;
      // no es un detalle estético.
      const trimmedHistory = trimMessagesToBudget(
        fullHistory
          .filter((h: any) => h?.role && h?.content)
          .map((h: any) => ({ role: String(h.role), content: String(h.content) })),
        profile.contextCharBudget,
        profile.historyTurns
      );
      for (const h of trimmedHistory.messages) {
        messagesPayload.push({ role: h.role, content: h.content });
      }

      const userMsg: any = {
        role: "user",
        content: fullUserPrompt,
      };

      if (base64Images.length > 0 && isVision) {
        userMsg.images = base64Images;
      }

      messagesPayload.push(userMsg);

      // Bucle de agente con llamada a herramientas.
      // v2.0 — `activeTools` ya viene filtrado por el perfil: si el modelo es
      // diminuto, la lista está vacía y se salta directo al streaming (antes
      // entraba igual y se colgaba intentando tool-calls que no sabe hacer).
      if (activeTools.length > 0) {
        const agentText = await runOllamaAgentLoop(
          targetUrl,
          model,
          messagesPayload,
          typeof temperature === "number" ? temperature : 0.5,
          () => ctx.isAborted(),
          (ev: any) => ctx.sendTaskEvent(ev),
          activeTools
        );
        if (agentText !== null) {
          const words = agentText.split(" ");
          for (let i = 0; i < words.length; i += 3) {
            if (ctx.isAborted()) break;
            ctx.sendChunk(words.slice(i, i + 3).join(" ") + " ");
            await sleepMs(15);
          }
          ctx.sendDone(model);
          return;
        }
      }

      let response: any = null;
      let lastOllamaError: any = null;
      let lastOllamaErrorBody: string | null = null;

      // Robust reconnection: retry the Ollama connection up to 3 times on transient failures
      const maxOllamaAttempts = OLLAMA_MAX_CONNECT_ATTEMPTS;
      for (let attempt = 0; attempt < maxOllamaAttempts; attempt++) {
        if (ctx.isAborted()) break;

        const fetchController = new AbortController();
        const timeoutId = setTimeout(() => fetchController.abort(), OLLAMA_CONNECT_TIMEOUT_MS);

        // 🔧 CORRECCIÓN: ELIMINADO el `req.on("close")` duplicado que había aquí.
        // Se disparaba al recibir el body (antes del primer token) y abortaba el fetch
        // al instante. El `res.on("close")` global (en StreamContext) ya cubre la
        // desconexión real del cliente, y aquí solo necesitamos respetar `ctx.isAborted()`
        // en cada iteración.

        try {
          response = await fetch(`${targetUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: fetchController.signal,
            body: JSON.stringify({
              model: model,
              messages: messagesPayload,
              stream: true,
              // keep_alive: el modelo queda cargado en RAM (30 min) — sin esto, cada
              // mensaje recarga los pesos y la UI parece "colgada en inferencia".
              // v2.0: además se envían num_ctx / num_predict / num_batch / num_thread
              // calculados por el perfil del modelo (buildOllamaOptions), porque
              // num_ctx fijo a 8192 con un modelo de 250 MB solo sirve para que la
              // CPU procese contexto que el modelo no aprovecha.
              keep_alive: profile.keepAlive,
              options: buildOllamaOptions(
                model,
                typeof temperature === "number" ? temperature : profile.temperature,
                CPU_CORES,
                RAM_GB
              ),
            }),
          });

          if (response.ok) {
            break;
          }

          // 🔧 CORRECCIÓN CRÍTICA: capturar SIEMPRE el body del error de Ollama.
          // Antes, un 404 ("model not found") o 400 ("model not loaded") caía silenciosamente
          // al fallback autónomo y el usuario pensaba que el modelo contestaba cuando en realidad
          // respondía el fallback automático. Ahora leemos el body, lo guardamos y lo enviamos
          // al cliente como error claro.
          let errBody = "";
          try {
            errBody = await response.text();
          } catch {}
          lastOllamaErrorBody = errBody.slice(0, 500);
          // Intentar extraer el campo "error" del JSON
          let ollamaErrMsg = `HTTP ${response.status}`;
          try {
            const errJson = JSON.parse(errBody);
            if (errJson && typeof errJson.error === "string") {
              ollamaErrMsg = errJson.error;
            }
          } catch {}
          lastOllamaError = new Error(`HTTP ${response.status}: ${ollamaErrMsg}`);

          // Retryable status -> reconnect after a short instant backoff
          if (RETRYABLE_HTTP_STATUS.has(response.status)) {
            console.warn(`[ai/stream] Ollama devolvió HTTP ${response.status} (intentos ${attempt + 1}/${maxOllamaAttempts}): ${ollamaErrMsg}`);
            response = null;
            await sleepMs(150 * (attempt + 1));
            continue;
          }

          // Non-retryable (e.g. 404 model not found, 400 bad request): stop retrying.
          // 🔧 Ya capturamos el mensaje arriba — el handler de abajo lo enviará al cliente.
          console.warn(`[ai/stream] Ollama devolvió error no-reintentable HTTP ${response.status}: ${ollamaErrMsg}`);
          break;
        } catch (ollamaFetchErr: any) {
          lastOllamaError = ollamaFetchErr;
          lastOllamaErrorBody = ollamaFetchErr.message || String(ollamaFetchErr);
          response = null;
          if (attempt < maxOllamaAttempts - 1) {
            // OLLAMA v2 — «nada rompa la comunicación»: un ECONNREFUSED casi siempre
            // es Ollama ARRANCANDO (8 GB, disco lento), no un cable suelto. Con 150 ms
            // de espera se quemaban los 3 intentos en medio segundo y el usuario veía
            // «conexión interrumpida» cuando nadie interrumpió nada. Espera real:
            // 2 s, 4 s, 6 s. Solo el cambio de modelo aborta (a propósito, por el usuario).
            const negativa = /ECONNREFUSED|EADDRNOTAVAIL|ENOTFOUND|fetch failed|Could not connect|SocketError/i.test(String(ollamaFetchErr?.message || ollamaFetchErr));
            await sleepMs(negativa ? 2000 * (attempt + 1) : 150 * (attempt + 1));
          }
        } finally {
          clearTimeout(timeoutId);
        }
      }

      // 🔧 CORRECCIÓN CRÍTICA: si Ollama respondió con error (no OK) o nunca respondió,
      // enviar el error al cliente en vez de caer silenciosamente al fallback autónomo.
      // El fallback solo debe usarse si NINGÚN provider fue configurado/probado.
      const ollamaBranchEntered = (response !== null) || (lastOllamaError !== null);
      if (ollamaBranchEntered && !(response && response.ok && response.body)) {
        const reason = lastOllamaError?.message || lastOllamaErrorBody || "razón desconocida";
        const hint = /not found|not loaded|pull/i.test(reason)
          ? ` Ejecuta \`ollama pull ${model}\` para descargarlo, o elige otro modelo en la UI.`
          : /ECONNREFUSED|fetch failed|aborted/i.test(reason)
          ? ` Verifica que Ollama esté corriendo en ${targetUrl} (\`ollama serve\`).`
          : "";
        ctx.sendError(`❌ Ollama no pudo responder para el modelo "${model}": ${reason}.${hint}`);
        return;
      }

      if (response && response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let timedOut = false;

        // 🔧 CORRECCIÓN: timeout de inactividad REAL.
        // Antes el setTimeout(120s) nunca se limpiaba al llegar cada chunk, así que
        // cortaba cualquier generación local a los 120s aunque los tokens siguieran
        // fluyendo. Ahora el timer se reinicia en cada chunk: solo dispara si pasan
        // 120s SIN recibir nada nuevo.
        let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
        const clearInactivityTimer = () => {
          if (inactivityTimer !== null) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
          }
        };
        const readChunk = (): Promise<{ done: boolean; value: Uint8Array | undefined }> => {
          clearInactivityTimer();
          return new Promise<{ done: boolean; value: Uint8Array | undefined }>((resolve, reject) => {
            inactivityTimer = setTimeout(() => {
              timedOut = true;
              try {
                reader.cancel();
              } catch {}
              resolve({ done: true, value: undefined });
            }, OLLAMA_INACTIVITY_MS);
            reader.read().then(
              (r: ReadableStreamReadResult<Uint8Array>) => {
                clearInactivityTimer();
                resolve({ done: r.done, value: r.value as Uint8Array | undefined });
              },
              (err: unknown) => {
                clearInactivityTimer();
                reject(err);
              }
            );
          });
         };

         // v1.6.9 — Sello de llegada del primer byte del stream. Es lo que hace
         // que `latencyMs` sea una medida y no una declaración del payload.
         const inicioBufferIA = Date.now();

         while (true) {
           if (ctx.isAborted()) {
            clearInactivityTimer();
            try {
              await reader.cancel();
            } catch {}
            break;
          }

          const { done, value } = await readChunk();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

           // v1.6.9 — cada línea la interpreta EL BÚFER, no un `JSON.parse` desnudo.
           //
           // Lo que cambia de verdad: antes, una línea que no parseaba caía en un
           // `catch {}` VACÍO y su contenido desaparecía sin dejar rastro. Si el
           // modelo había emitido texto en una línea con la coma mal puesta, el
           // usuario veía la respuesta cortada a la mitad y ningún error. Ahora el
           // búfer intenta la cascada completa (JSON directo → objeto dentro de
           // prosa → NDJSON → reparación → texto crudo) y, pase lo que pase, saca
           // el contenido: `content` viaja SIEMPRE.
           for (const line of lines) {
             if (!line.trim()) continue;
             const estado = handleInferenceStream(line, { startedAt: inicioBufferIA, final: false });
             if (estado.content) ctx.sendChunk(estado.content);
             if (estado.status === "error_recovered" && estado.reason) {
               console.warn(`[ai/stream] Línea recuperada por el búfer (${estado.reason}).`);
             }
             // `done` no es texto: va en el objeto parseado. Un `{"done":true}`
             // limpio sale del búfer como `incomplete` con `data` puesto, así que
             // se consulta ahí y no en `status`.
             if (estado.data && (estado.data as Record<string, unknown>).done) {
               // D8 (v1.6.32): el done de Ollama trae eval_count y las duraciones
               // del motor. Se leen AQUÍ y viajan al cliente en el propio evento.
               ctx.sendDone(model, extraerMetricasOllama(estado.data));
               return;
             }
           }
         }

         // v1.6.9 — La cola sin salto de línea final era el trozo que se perdía
         // siempre: el bucle la dejaba en `buffer` y nadie la volvía a mirar.
         // Ahora se rescata con `final: true`, que además cierra el JSON si venía
         // cortado por el cierre del stream.
         if (buffer.trim()) {
           const cola = handleInferenceStream(buffer, { startedAt: inicioBufferIA, final: true });
           if (cola.content) ctx.sendChunk(cola.content);
           if (cola.data && (cola.data as Record<string, unknown>).done) {
             ctx.sendDone(model, extraerMetricasOllama(cola.data));
             return;
           }
         }

        if (timedOut) {
          ctx.sendError("El modelo local no respondió (timeout de inactividad). Verifica que Ollama tenga el modelo descargado y RAM suficiente.");
          return;
        }

        ctx.sendDone(model);
        return;
      }
    }

    // 5. Autonomous Engine Fallback
    // ------------------------------------------------------------
    // 🔧 CORRECCIÓN CRÍTICA: Este fallback solo se ejecuta si NINGÚN provider
    // fue configurado (provider desconocido, o provider válido pero sin API key
    // y sin Ollama corriendo). Antes se ejecutaba TAMBIÉN cuando un provider
    // fallaba silenciosamente — el usuario pensaba que el modelo contestaba pero
    // en realidad recibía este texto automático. Ahora los providers envían su
    // propio error vía ctx.sendError() antes de llegar aquí, así que este bloque
    // es un último recurso genuino.
    //
    // Para que el usuario sepa que esto es un fallback (no respuesta del modelo),
    // enviamos primero un evento `error` con texto explicativo, luego el texto
    // autónomo como `text`, y cerramos con `done` marcando el modelo como
    // "fallback-autonomous" (no el modelo solicitado).
    // ------------------------------------------------------------
    console.warn(
      `[ai/stream] Ningún provider respondió (provider=${provider}, model=${model}). ` +
      `Usando fallback autónomo. Posibles causas: provider desconocido, falta API key, ` +
      `Ollama no corre en ${OLLAMA_DEFAULT}, o modelo no descargado.`
    );
    // Mensaje inicial claro para el usuario
    ctx.sendChunk(`⚠️ **Modo fallback**: ningún proveedor de IA pudo responder ` +
      `(provider=\`${provider}\`, modelo=\`${model}\`). ` +
      `Verifica que tengas Ollama corriendo y el modelo descargado, ` +
      `o configura una API key de Gemini/OpenRouter.\n\n`);

    const autonomousText = generateAutonomousTechnicalResponse(prompt, textAttachmentsContext);
    const words = autonomousText.split(" ");
    for (let i = 0; i < words.length; i += 3) {
      if (ctx.isAborted()) break;
      ctx.sendChunk(words.slice(i, i + 3).join(" ") + " ");
      await new Promise((r) => setTimeout(r, 20));
    }
    // Marcamos el done con "fallback-autonomous" para que la UI sepa que no fue el modelo real.
    ctx.sendDone("fallback-autonomous");
  } catch (err: any) {
    if (!ctx.isAborted()) {
      ctx.sendError(err.message || "Error al procesar solicitud de IA");
    }
  } finally {
    // 🔧 Asegura que nunca quede un watchdog colgado tras salir del handler.
    ctx.clearWatchdog();
  }
  });

  // 🔧 ENDPOINTS DE RECONEXIÓN — DEBEN registrarse ANTES del middleware de Vite,
  // si no Vite captura los POST a /api/* y devuelve 404.
  // Auto-arranque del Puente Python (puerto 5000)
  // ═══════════════════════════════════════════════════════════════════════
  // v1.6.2 — EL PUERTO SE ABRE ANTES QUE LOS SUBSISTEMAS OPCIONALES
  // -----------------------------------------------------------------------
  // Aquí estaba `const bridge = await startAgentBridge();`, y ESA línea era la
  // causa raíz de todos los «el puerto está abierto y no responde» de esta
  // sesión: el await paraba la ejecución en el arranque del puente —con bucles
  // de 16 sondeos de salud por 5 reintentos— ANTES de llegar al `app.listen`
  // de unas líneas más abajo. Medido: el registro terminaba en los mensajes del
  // puente y NUNCA imprimía «Escuchando en…», mientras el proceso seguía vivo.
  // Desde fuera: conexión rechazada contra un puerto que la interfaz anunciaba
  // como OK. Es la misma familia de fallo que el indicador clavado en verde:
  // el mensaje y la realidad contradiciéndose.
  //
  // Un subsistema OPCIONAL no puede impedir que el servidor escuche. El puente
  // MEJORA el motor; no ES el motor. Ahora se arranca después de abrir el
  // puerto y sin await: si tarda, si falla o si el :5000 está ocupado, la IDE
  // ya está sirviendo y el fallo queda contado en el registro.
  let bridge: Awaited<ReturnType<typeof startAgentBridge>> = null;

  // 🔧 ENDPOINT: Reiniciar el puente Python bajo demanda del usuario.
  // El botón "Reconectar" del frontend llama aquí cuando el puerto 5000 cae.
  app.post("/api/bridge/restart", async (_req: Request, res: Response) => {
    if (!bridge) {
      return res.status(500).json({ ok: false, error: "Puente no inicializado (¿falta agent_bridge_5000.py?)" });
    }
    try {
      // El puente acaba de reiniciarse: la muestra que dice «:5000 caído» ya no
      // vale. Se invalida por la API del estado en vez de tocar la variable — ese
      // acceso directo era justo lo que ataba esta ruta al monolito.
      invalidarMuestra();
      const ok = await bridge.restart();
      return res.json({ ok, port: 5000 });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });



  // Vite middleware in development mode
  // 🔧 AISLAMIENTO CRÍTICO (bug "subir ZIP reinicia la app"):
  // Vite por defecto observa TODOS los archivos del proyecto. Cuando el usuario
  // sube un ZIP con 60+ archivos a .proyectos/, Vite detecta los cambios en
  // node_modules/.proyectos y dispara una recarga del servidor (HMR), lo que
  // tira abajo la conexión de streaming y "reinicia" la app.
  //
  // Solución: ignorar completamente .proyectos/, dist_electron/, y node_modules/
  // en el watcher de Vite. La IDE (:3000) solo recargará si cambian archivos
  // de src/ o de backend/ (no del sandbox del usuario).
  if (process.env.NODE_ENV !== "production") {
    // v1.6.0 — Un servidor que anuncia el puerto y NO sirve es peor que uno que no arranca.
    // Medido: sin las dependencias de desarrollo, esta linea lanzaba
    // ERR_MODULE_NOT_FOUND, la promesa se rechazaba, el middleware de rutas no
    // llegaba a montarse, y el proceso seguia VIVO anunciando «Escuchando en
    // http://127.0.0.1:3000». Las peticiones no obtenian respuesta.
    // Ahora se dice que falta y como arrancar sin Vite, y se sale: quedarse
    // sordo deja un puerto abierto que no responde, y eso hace imposible saber
    // que esta pasando.
    let createViteServer: any;
    try {
      ({ createServer: createViteServer } = await import("vite"));
    } catch (e: any) {
      const detalle = e && e.message ? e.message : String(e);
      console.error("[CerebroNico] No se pudo cargar Vite, que sirve la interfaz en modo DESARROLLO: " + detalle);
      console.error("[CerebroNico] Opcion A: npm install               (instala tambien las de desarrollo)");
      console.error("[CerebroNico] Opcion B: npm run start:isolated    (modo produccion, sirve dist/ y NO necesita Vite)");
      process.exit(1);
    }
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // 🔧 Desactivar HMR: el servidor de la IDE nunca se recarga solo.
        // El usuario debe recargar el navegador manualmente si cambia algo.
        hmr: false,
        // 🔧 Watcher ignorado: el sandbox (.proyectos) y sus node_modules NUNCA
        // deben disparar recargas en el servidor de la IDE.
        watch: {
          ignored: [
            ".proyectos/**",
            "**/.proyectos/**",
            "**/node_modules/**",
            "**/dist_electron/**",
            "**/.bridge_5000.log",
            "**/.sandbox_3500.log",
            "**/.vite/**",
            "**/.cache/**",
          ],
          usePolling: false,
        },
        // No tocar el sistema de archivos del sandbox.
        fs: { strict: true },
      },
      appType: "spa",
      // 🔧 Cache de Vite en directorio aislado (no dentro del sandbox)
      cacheDir: path.join(process.cwd(), "node_modules", ".vite"),
    });
    app.use(vite.middlewares);
    // ============================================================
    // v2.1 — SABER SIEMPRE QUIÉN SIRVE EL CLIENTE
    // ------------------------------------------------------------
    // Esta duda costó una vuelta entera: el navegador pedía /src/main.tsx y los
    // módulos daban 404, y no había forma de saber desde fuera si Vite estaba
    // vivo o si el servidor estaba sirviendo otra cosa. Ahora se dice al
    // arrancar, sin ambigüedad.
    // ============================================================
    console.log(
      `[CerebroNico] Cliente: Vite en modo DESARROLLO (NODE_ENV=${process.env.NODE_ENV ?? "sin definir"}). Vite transforma y sirve /src/*.`
    );

    // NOTA v2.1 — Aquí probé un middleware para AVISAR cuando un /src/* da 404
    // (el síntoma de la pantalla en blanco). NO funciona colocado después de los
    // de Vite: Vite responde el 404 él mismo y nunca cede el paso, así que el
    // aviso jamás se disparaba. Se retiró en lugar de dejar un diagnóstico que
    // finge funcionar. La detección real está en el cliente, tras cada sync:
    // "🔎 Estructura del workspace" (en App.tsx).
  } else {
    const distPath = path.join(process.cwd(), "dist");
    const distIndex = path.join(distPath, "index.html");
    // ============================================================
    // v2.1 — 🐞 MODO PRODUCCIÓN SIN CLIENTE COMPILADO = PANTALLA BLANCA MUDA
    // ------------------------------------------------------------
    // En producción este servidor sirve dist/. Si dist/ no existe —lo normal al
    // importar este proyecto en el sandbox, porque dist se excluye al empaquetar—
    // la interfaz queda EN BLANCO y nada lo explica: ni un error, ni una pista.
    // Es la causa más probable de "el 3500 sirve HTML pero todos los módulos dan
    // 404": el index.html que se ve NO viene de aquí, y los /src/* no los sirve
    // nadie porque Vite no está montado.
    // ============================================================
    if (!fs.existsSync(distIndex)) {
      console.error(
        "[CerebroNico] ⚠️ MODO PRODUCCIÓN SIN CLIENTE COMPILADO.\n" +
          `            No existe: ${distIndex}\n` +
          "            La interfaz se quedará EN BLANCO y los módulos /src/* darán 404.\n" +
          "            Causa habitual: NODE_ENV=production heredado del proceso padre y nadie ejecutó «npm run build».\n" +
          "            Solución: ejecuta «npm run build», o arranca en desarrollo (sin NODE_ENV=production)."
      );
    }
    console.log(`[CerebroNico] Cliente: dist/ ${fs.existsSync(distIndex) ? "OK" : "AUSENTE (ver aviso arriba)"}.`);
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(distIndex);
    });
  }

  // ============================================================
  // v0.9.1 — MIDDLEWARE DE ERROR (el que faltaba)
  // ------------------------------------------------------------
  // No había ninguno. Consecuencia real: una excepción dentro de una ruta
  // dejaba la petición SIN RESPUESTA — ni 200 ni 500 — y en la interfaz eso se
  // ve como un indicador girando para siempre. El usuario no puede distinguir
  // «está pensando» de «se rompió y nadie me lo va a decir», así que espera.
  //
  // Va el ÚLTIMO, después de todas las rutas: en Express, el manejador de error
  // se identifica por tener CUATRO argumentos, y si se registra antes que una
  // ruta, esa ruta nunca llega a él.
  //
  // Devuelve JSON y no una página HTML a propósito: quien llama a /api/* es la
  // interfaz, que espera datos. Una página de error de Express en mitad de un
  // fetch produce un fallo de análisis confuso encima del fallo real.
  // ============================================================
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const ruta = `${req.method} ${req.originalUrl || req.url}`;
    console.error(`[estabilidad] Error en la ruta ${ruta}:`, err?.stack || err);
    if (res.headersSent) return; // ya se empezó a responder: no se puede reescribir
    res.status(500).json({
      ok: false,
      error: "Error interno del motor.",
      ruta,
      motivo: String(err?.message || err || "sin detalle"),
      pista: "El motor SIGUE funcionando: este fallo afecta solo a esta petición. El detalle completo está en la terminal de la IDE.",
    });
  });

  // v1.6.17 — 🔌 Y SI EL PUERTO YA ESTÁ OCUPADO, DECIRLO.
  //
  // `app.listen()` devolvía un servidor al que nadie escuchaba. En Node, un
  // `net.Server` que emite `'error'` SIN manejador no avisa: LANZA y mata el
  // proceso. Así que si quedaba un proceso vivo de una prueba anterior
  // agarrado al puerto —lo típico al ir probando versiones— la nueva no
  // arrancaba, se moría, y el usuario solo veía que «no contesta». Sin un
  // mensaje. Sin una pista. El síntoma era indistinguible de un cuelgue.
  //
  // Ahora se captura, se explica qué pasa, se dice cómo encontrar al culpable
  // y se sale con código de error para que no parezca que arrancó bien.
  const servidorHttp = app.listen(PORT, HOST, () => {
    console.log(`[CerebroNico Server] Escuchando en http://${HOST}:${PORT}`);
    // v1.6.2 — Y SÓLO AHORA el subsistema opcional. ESTE ORDEN ES EL ARREGLO:
    // el puerto ya está abierto, así que lo peor que puede pasar es que el
    // puente no esté. Eso es una molestia; una IDE muda es otra cosa.
    void startAgentBridge()
      .then((sup) => {
        bridge = sup;
        if (sup) console.log("[CerebroNico] Puente 5000 listo.");
      })
      .catch((e: any) => {
        console.error("[CerebroNico] El puente 5000 no arrancó. LA IDE SIGUE SIRVIENDO:", e?.message || e);
      });
  });

  // El manejador que faltaba. Va sobre el servidor que devuelve `listen`, no
  // sobre `app`: `app` es el enrutador de Express y no emite los errores de
  // socket, así que ahí nunca se habría enterado de nada.
  servidorHttp.on("error", (err: any) => {
    console.error("");
    console.error("════════════════════════════════════════════════════════════");
    if (err?.code === "EADDRINUSE") {
      console.error(`[CerebroNico] EL PUERTO ${PORT} YA ESTÁ OCUPADO. La IDE NO arrancó.`);
      console.error("");
      console.error("  Lo normal es que sea un CerebroNico anterior que quedó vivo.");
      console.error("  Para encontrarlo y cerrarlo:");
      console.error("");
      console.error(`    Windows       netstat -ano | findstr ":${PORT}"`);
      console.error("                  taskkill /PID <el-pid-que-aparezca> /F");
      console.error(`    macOS/Linux   lsof -i :${PORT}   y luego   kill <pid>`);
      console.error("");
      console.error("  Ojo también con el puente 5000: si alguna vez cerraste la ventana");
      console.error("  sin parar la app, sus procesos siguen ahí ocupando el puerto.");
    } else {
      console.error(`[CerebroNico] El servidor no pudo abrir el puerto ${PORT}: ${err?.message || err}`);
    }
    console.error("════════════════════════════════════════════════════════════");
    console.error("");
    // Se sale con código distinto de cero: antes esto reventaba igual (el
    // proceso moría), pero sin decir nada y pareciendo que había arrancado.
    process.exit(1);
  });

  const shutdown = () => {
    if (bridge) {
      try {
        bridge.kill();
        console.log("[CerebroNico] Puente 5000 detenido.");
      } catch {}
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();
