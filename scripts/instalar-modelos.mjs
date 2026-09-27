#!/usr/bin/env node
/**
 * instalar-modelos.mjs — LOS MODELOS NEURALES, SOLITOS, AL INSTALAR (v2.4)
 * ========================================================================
 * Responde a la pregunta del autor: «¿estos modelos pueden venir por defecto
 * en el ZIP e instalarse solos al instalar las dependencias?»
 *
 *   · Las TABLAS del reflejo (502 KB / 2.2 MB) YA vienen en el ZIP: son JSON,
 *     no hay nada que instalar.
 *   · Los modelos neurales (SmolLM2) NO caben en un ZIP de 740 KB y no se
 *     redistribuyen: lo que sí puede venir es el INSTALADOR. Este script
 *     los baja del registro oficial de Ollama — según el tramo MR de la
 *     máquina, igual que hace el presupuesto de memoria.
 *
 * Reglas (todas probadas en tests/reflejo.test.ts):
 *   1. NUNCA aborta `npm install`. Todo fallo → informe con motivo y salida 0.
 *      (Es la lección del postinstall de v2.1, aplicada aquí desde el día 0.)
 *   2. Si Ollama no responde en 1 s, no se intenta NADA y se dice por qué.
 *   3. CEREBRONICO_SIN_MODELOS=1 → salto declarado.
 *   4. Solo baja lo que falta (`/api/tags` primero). Reinstalar no re-baja.
 *   5. El escalón por RAM es una FUNCIÓN PURA exportada: se prueba sin red.
 */
import net from "node:net";

/** Tramos de la escalera MR aplicados a modelos: cuánta RAM tienes, qué puedes cargar. */
export function elegirModelo(ramGB) {
  const r = Number(ramGB) || 0;
  if (r >= 12) return { tag: "smollm2:1.7b", aproxMB: 1100, motivo: "MR3/MR4: cabe el 1.7B cuantizado y deja margen al sandbox" };
  if (r >= 6) return { tag: "smollm2:360m", aproxMB: 230, motivo: "MR2 (8 GB): el 360M entiende frases raras y typos con holgura" };
  return { tag: "smollm2:135m-instruct-q3_K_S", aproxMB: 70, motivo: "MR1 (4 GB): el más pequeño que sigue siendo útil; dentro del tope de 100 MB" };
}

/** ¿El puerto 11434 escucha? (1 s, sin colgar la instalación). */
export function ollamaViva(host = "127.0.0.1", puerto = 11434, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port: puerto });
    const t = setTimeout(() => { s.destroy(); resolve(false); }, timeoutMs);
    s.once("connect", () => { clearTimeout(t); s.destroy(); resolve(true); });
    s.once("error", () => { clearTimeout(t); resolve(false); });
  });
}

async function ollamaJSON(ruta, opciones = {}) {
  const res = await fetch(`http://127.0.0.1:11434${ruta}`, { ...opciones, signal: AbortSignal.timeout(opciones.timeoutMs ?? 15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${ruta}`);
  return res.json();
}

/**
 * Instala la escalera. `log` se inyecta (postinstall usa consola; los tests,
 * un array). Devuelve SIEMPRE un informe; nunca lanza.
 */
export async function instalarModelos({ ramGB, log = console.log, forzar = false, soloBase = true } = {}) {
  const informe = { intentados: [], yaEstaban: [], bajados: [], omitidos: [], errores: [] };
  const linea = (m) => log(`[Modelos] ${m}`);

  if (!forzar && process.env.CEREBRONICO_SIN_MODELOS === "1") {
    informe.omitidos.push("CEREBRONICO_SIN_MODELOS=1: salto declarado (no es un fallo).");
    linea("salto declarado por CEREBRONICO_SIN_MODELOS=1.");
    return informe;
  }

  const escalon = elegirModelo(ramGB);
  const objetivo = [escalon.tag];

  if (!(await ollamaViva())) {
    informe.omitidos.push("Ollama no responde en 127.0.0.1:11434 (1 s). Nada se descargó. Arranca Ollama y corre `npm run modelos`.");
    linea("Ollama no está vivo: no se toca nada (no es un fallo, es la máquina sin el motor).");
    return informe;
  }

  let presentes = [];
  try {
    const tags = await ollamaJSON("/api/tags", { timeoutMs: 5000 });
    presentes = (tags.models || []).map((m) => m.name);
  } catch (e) {
    informe.errores.push(`no pude leer la lista de modelos: ${e.message}`);
    return informe;
  }

  for (const tag of objetivo) {
    informe.intentados.push(tag);
    if (presentes.includes(tag)) {
      informe.yaEstaban.push(tag);
      linea(`«${tag}» ya está: no se re-descarga nada.`);
      continue;
    }
    try {
      linea(`bajando «${tag}» (~${escalon.aproxMB} MB) del registro oficial de Ollama…`);
      await ollamaJSON("/api/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tag, stream: false }),
        timeoutMs: 10 * 60 * 1000, // un 1.7B por WiFi lento puede tardar; 10 min de techo
      });
      informe.bajados.push(tag);
      linea(`«${tag}» listo. Motivo del escalón: ${escalon.motivo}.`);
    } catch (e) {
      // El fallo se DECLARA con su motivo y NO aborta: npm install termina bien igual.
      informe.errores.push(`«${tag}»: ${e.message}`);
      linea(`«${tag}» NO se bajó (${e.message}). El IDE funciona igual con el reflejo; reintenta con \`npm run modelos\`.`);
    }
  }
  return informe;
}

// Solo cuando se ejecuta directo (`npm run modelos`), no cuando lo importa postinstall.
if (import.meta.url === `file://${process.argv[1]}`) {
  const os = await import("node:os");
  const ramGB = Math.round(os.default.totalmem() / 1024 ** 3);
  const informe = await instalarModelos({ ramGB });
  const total = informe.bajados.length + informe.yaEstaban.length;
  console.log(`[Modelos] resumen: ${total} disponibles · ${informe.bajados.length} bajados · ${informe.omitidos.length} omitidos · ${informe.errores.length} errores`);
  process.exitCode = 0; // NI UN ERROR DE DESCARGA ROMPE LA ORDEN: el reflejo sigue sirviendo
}
