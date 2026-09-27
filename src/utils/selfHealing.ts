/**
 * CerebroNico V0.9 — Motor de Autodiagnóstico (Self-Healing Core)
 * ============================================================
 * Captura excepciones del sandbox y del servidor, analiza causa raíz,
 * y registra el patrón en la base de datos de automejora (evolutionDB).
 *
 * El parche NO se aplica automáticamente por seguridad (podría romper
 * más de lo que arregla). Se registra en evolutionDB para que el modelo
 * activo pueda consultarlo y proponer el diff en el próximo turno.
 */
import { recordEvolution } from "./evolutionDB";

export interface DiagnosedError {
  id: string;
  timestamp: number;
  type: "crash" | "exception" | "loop" | "oom" | "timeout" | "type_error" | "dependency";
  message: string;
  stackTrace?: string;
  affectedFile?: string;
  affectedLine?: number;
  suggestedPatch?: string;
  rootCauseHypothesis?: string;
}

/**
 * Analiza un error capturado y genera un diagnóstico estructurado.
 * Extrae: tipo de error, archivo afectado, línea, causa raíz hipotética.
 */
export function diagnoseError(err: any, context?: { source?: string }): DiagnosedError {
  const msg = err?.message || String(err);
  const stack = err?.stack || "";
  const lower = msg.toLowerCase();

  let type: DiagnosedError["type"] = "exception";
  if (/out of memory|heap|oom|fatal error.*allocation/i.test(lower)) type = "oom";
  else if (/timeout|timed out|etimedout|aborted/i.test(lower)) type = "timeout";
  else if (/cannot read prop|cannot read properties|undefined is not|is not a function|null is not/i.test(lower)) type = "type_error";
  else if (/cannot find module|module not found|err_module_not_found|missing dependency/i.test(lower)) type = "dependency";
  else if (/maximum call stack|infinite loop|rangeerror/i.test(lower)) type = "loop";
  else if (/crash|segfault|fatal/i.test(lower)) type = "crash";

  // Intentar extraer archivo + línea del stack trace
  let affectedFile: string | undefined;
  let affectedLine: number | undefined;
  const fileMatch = stack.match(/at .* \((.+):(\d+):\d+\)/);
  if (fileMatch) {
    affectedFile = fileMatch[1];
    affectedLine = parseInt(fileMatch[2], 10);
  }

  // Hipótesis de causa raíz según el tipo
  let rootCauseHypothesis: string | undefined;
  let suggestedPatch: string | undefined;
  switch (type) {
    case "oom":
      rootCauseHypothesis = "Asignación masiva de memoria (probablemente por cargar un .cn/ZIP grande sin límites o por un array que crece indefinidamente).";
      suggestedPatch = "Añadir límites MAX_FILES / MAX_TOTAL_BYTES al procesar archivos masivos. Considerar chunking diferido con setTimeout(0) entre lotes.";
      break;
    case "timeout":
      rootCauseHypothesis = "Operación síncrona que excede el tiempo límite (fetch a Ollama cuando está cargando modelo, o npm install en caliente).";
      suggestedPatch = "Aumentar timeout del cliente y manejar reintentos con backoff exponencial. Para npm install, desactivar auto-instalación en caliente (AUTO_INSTALL_DEPS=0).";
      break;
    case "type_error":
      rootCauseHypothesis = "Acceso a propiedad de undefined/null — falta de guard clause o type narrowing insuficiente.";
      suggestedPatch = "Añadir guard: `if (!obj) return;` o `obj?.prop ?? defaultValue`. Verificar que el API contract no cambió.";
      break;
    case "dependency":
      rootCauseHypothesis = "Módulo no instalado o import path incorrecto.";
      suggestedPatch = "Ejecutar `npm install <paquete>` o corregir el import path. Verificar package.json.";
      break;
    case "loop":
      rootCauseHypothesis = "Recursión sin caso base o bucle while/for sin condición de salida.";
      suggestedPatch = "Añadir contador de iteraciones máximo (ej: maxIterations = 100) y break cuando se exceda.";
      break;
    case "crash":
      rootCauseHypothesis = "Error fatal nativo (segfault, V8 heap corruption) — suele ser por memoria o extensiones nativas.";
      suggestedPatch = "Reiniciar el proceso. Si persiste, actualizar Node.js y nativos. Revisar logs de Ollama.";
      break;
  }

  return {
    id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    type,
    message: msg,
    stackTrace: stack.slice(0, 2000),
    affectedFile,
    affectedLine,
    suggestedPatch,
    rootCauseHypothesis,
  };
}

/**
 * Registra un error diagnosticado en la base de datos de automejora
 * para que el modelo activo pueda consultarlo en el próximo turno.
 */
export async function reportDiagnosedError(diag: DiagnosedError): Promise<void> {
  try {
    await recordEvolution(
      `[${diag.type.toUpperCase()}] ${diag.message.slice(0, 200)}`,
      diag.suggestedPatch || "(sin parche sugerido)",
      {
        rootCause: diag.rootCauseHypothesis,
        affectedFile: diag.affectedFile,
        successScore: 50, // puntaje inicial — se ajusta si el error no vuelve a ocurrir
      }
    );
    console.log(`[CerebroNico Self-Healing] Error diagnosticado y registrado: ${diag.type} — ${diag.message.slice(0, 100)}`);
  } catch (e) {
    console.warn("[CerebroNico Self-Healing] No se pudo registrar el error en evolutionDB:", e);
  }
}

/**
 * Hook global: captura errores no manejados y los diagnostica.
 * Llamar una sola vez al iniciar el cliente (App.tsx).
 */
export function installGlobalErrorHandler(): void {
  if (typeof window === "undefined") return;
  // Evitar doble instalación
  if ((window as any).__cerebronico_self_healing_installed) return;
  (window as any).__cerebronico_self_healing_installed = true;

  window.addEventListener("error", (event) => {
    const diag = diagnoseError(event.error || event.message, { source: "window.error" });
    reportDiagnosedError(diag).catch(() => {});
  });

  window.addEventListener("unhandledrejection", (event) => {
    const diag = diagnoseError(event.reason, { source: "unhandledrejection" });
    reportDiagnosedError(diag).catch(() => {});
  });

  console.log("[CerebroNico Self-Healing] ✅ Motor de autodiagnóstico activo.");
}
