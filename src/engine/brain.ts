/**
 * brain.ts — CEREBRO + MEMORIA: la capa de gobernanza del motor (v2.0)
 * ===================================================================
 * Implementa el ciclo de vida que se diseñó en papel:
 *
 *   [Entrada] → 1. Carga de contexto (cerebro.md = ley · memoria.md = estado)
 *             → 2. Inferencia (el modelo aplica las restricciones)
 *             → 3. Ejecución
 *             → 4. Auto-actualización atómica de memoria.md
 *
 * Decisiones de diseño y por qué:
 *
 * 1. ESC
 *    ESCRITURA ATÓMICA. `memoria.md` se actualiza en cada interacción; si el
 *    proceso muere a mitad, un archivo corrupto sería catastrófico. Se escribe en
 *    `.tmp` y se renombra (rename es atómico en el mismo sistema de archivos).
 * 2. BLOQUEO COOPERATIVO. El motor puede tener varios procesos (IDE en :3000,
 *    puente en :5000). Un archivo `.lock` con detección de caducidad (30 s) evita
 *    condiciones de carrera sin depender de módulos nativos.
 * 3. SNAPSHOT ANTES DE ESCRIBIR. Cada actualización deja copia en
 *    `memoria_history/`, lo que permite hacer rollback mental si una directriz
 *    corrompe el flujo.
 * 4. BLOQUES MARCADOS. Solo se reescriben las zonas entre
 *    `<!-- BLOQUE-DINAMICO:X -->` y `<!-- /BLOQUE-DINAMICO:X -->`: lo que escriba
 *    el humano fuera de esos bloques nunca se pierde.
 * 5. PROPUESTAS, NO APLICACIONES. El auto-parcheo NUNCA toca `cerebro.md` por su
 *    cuenta: se guarda en `.cerebro-db/proposals/` para aprobación humana.
 * 6. PROMPT DIMENSIONADO. Al modelo se le da el cerebro completo (es la ley y es
 *    corto) y de la memoria solo el ESTADO + incidencias recientes: así un modelo
 *    ligero no sufre fatiga de contexto.
 */

import * as fs from "fs";
import * as path from "path";

export interface BrainStats {
  cerebroChars: number;
  memoriaChars: number;
  memoriaLines: number;
  historyCount: number;
  proposals: number;
  interactions: number;
  updatedAt: number;
}

export interface SelfPatchProposal {
  motivo: string;
  linea: string;
  bloque: string;
  detectadaEn: number;
}

const MARCA = (n: string) => `<!-- BLOQUE-DINAMICO:${n} -->`;
const CIERRE = (n: string) => `<!-- /BLOQUE-DINAMICO:${n} -->`;

// ============================================================
// v8.0.1 — PROTOCOLO DE CIERRE (el acta): APAGADO POR DEFECTO
// ------------------------------------------------------------
// Historia del defecto, contada sin adornos: el motor pedía a TODOS los
// modelos, en TODOS los niveles, que cada respuesta saliera con tres rótulos
// —diagnóstico, acción y checklist de memoria—. La intención era buena
// (disciplina de formato para modelos diminutos), pero el efecto medido en
// pantalla fue el contrario: el usuario recibía plantilla de acta en vez de
// respuesta y pidió, literalmente, «no, quítalo, solo responde la respuesta».
//
// Se retira la ORDEN (aquí) y se deja una aduana determinista a la salida
// (src/utils/formatFixer.ts) porque un prompt no es un contrato: los modelos
// que ya tienen la plantilla memorizada la seguirán escupiendo un tiempo.
//
// ¿Por qué una constante mutable y no un parámetro? Porque `systemBlock()`
// tiene una firma pública que consumen server.ts y las pruebas; cambiar su
// aridad para un interruptor de producto sería pagar peaje en cada llamada.
// `activarProtocoloDeCierre(true)` lo devuelve al comportamiento clásico sin
// tocar ni un solo punto de llamada: el ajuste se puede exponer en PRO si se
// quiere, y revertirlo es una línea, no un refactor.
// ============================================================
const PROTOCOLO_CIERRE = { activo: false };

/** Vuelve al acta obligatoria de la v2.0 (escape hatch, por defecto NO). */
export function activarProtocoloDeCierre(activo: boolean): void {
  PROTOCOLO_CIERRE.activo = !!activo;
}

/** ¿El prompt sigue pidiendo el acta de tres rótulos? */
export function protocoloDeCierreActivo(): boolean {
  return PROTOCOLO_CIERRE.activo;
}

export class Brain {
  readonly root: string;
  readonly cerebroPath: string;
  readonly memoriaPath: string;
  readonly historyDir: string;
  readonly proposalsDir: string;
  private readonly lockPath: string;

  private cerebro = "";
  private memoria = "";
  private lastSnapshot = 0;

  constructor(root: string) {
    this.root = root;
    this.cerebroPath = path.join(root, "cerebro.md");
    this.memoriaPath = path.join(root, "memoria.md");
    this.historyDir = path.join(root, "memoria_history");
    this.proposalsDir = path.join(root, ".cerebro-db", "proposals");
    this.lockPath = path.join(root, ".cerebro-db", "memoria.lock");
  }

  // ------------------------------------------------------------
  // Carga
  // ------------------------------------------------------------
  load(): void {
    this.cerebro = this.leer(this.cerebroPath, "# CEREBRO.md\nNo se encontró el archivo de gobernanza.");
    this.memoria = this.leer(this.memoriaPath, "# MEMORIA.md\nEstado inicial vacío.");
  }

  private leer(ruta: string, porDefecto: string): string {
    try {
      if (fs.existsSync(ruta)) return fs.readFileSync(ruta, "utf-8");
    } catch {}
    return porDefecto;
  }

  getCerebro(): string {
    if (!this.cerebro) this.load();
    return this.cerebro;
  }

  getMemoria(): string {
    if (!this.memoria) this.load();
    return this.memoria;
  }

  // ------------------------------------------------------------
  // Bloqueo cooperativo + escritura atómica
  // ------------------------------------------------------------
  private adquirirLock(timeoutMs = 3000): boolean {
    const inicio = Date.now();
    try {
      fs.mkdirSync(path.dirname(this.lockPath), { recursive: true });
    } catch {}
    while (Date.now() - inicio < timeoutMs) {
      try {
        // Si el lock existe pero es viejo, se considera huérfano y se roba.
        if (fs.existsSync(this.lockPath)) {
          const edad = Date.now() - fs.statSync(this.lockPath).mtimeMs;
          if (edad > 30000) {
            try {
              fs.unlinkSync(this.lockPath);
            } catch {}
          } else {
            // Espera activa muy corta: el lock se mantiene milisegundos.
            const t = Date.now();
            while (Date.now() - t < 40) {}
            continue;
          }
        }
        fs.writeFileSync(this.lockPath, String(process.pid), "utf-8");
        return true;
      } catch {
        const t = Date.now();
        while (Date.now() - t < 40) {}
      }
    }
    return false;
  }

  private liberarLock(): void {
    try {
      fs.unlinkSync(this.lockPath);
    } catch {}
  }

  /** Escribe un archivo de forma atómica (tmp + rename). */
  private escribirAtomico(ruta: string, contenido: string): void {
    const tmp = `${ruta}.tmp`;
    fs.writeFileSync(tmp, contenido, "utf-8");
    fs.renameSync(tmp, ruta);
  }

  /** Guarda una copia de memoria.md en memoria_history/ (máx. 1 cada 20 s). */
  snapshot(motivo = "auto"): string | null {
    try {
      const ahora = Date.now();
      if (motivo === "auto" && ahora - this.lastSnapshot < 20000) return null;
      fs.mkdirSync(this.historyDir, { recursive: true });
      const fecha = new Date();
      const sello = `${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, "0")}${String(fecha.getDate()).padStart(2, "0")}_${String(fecha.getHours()).padStart(2, "0")}${String(fecha.getMinutes()).padStart(2, "0")}${String(fecha.getSeconds()).padStart(2, "0")}`;
      const destino = path.join(this.historyDir, `memoria_${sello}.md`);
      fs.writeFileSync(destino, this.getMemoria(), "utf-8");
      this.lastSnapshot = ahora;
      // Se conservan las 60 copias más recientes.
      const copias = fs
        .readdirSync(this.historyDir)
        .filter((f) => f.startsWith("memoria_") && f.endsWith(".md"))
        .sort();
      for (const vieja of copias.slice(0, Math.max(0, copias.length - 60))) {
        try {
          fs.unlinkSync(path.join(this.historyDir, vieja));
        } catch {}
      }
      return destino;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------
  // Bloques dinámicos
  // ------------------------------------------------------------
  private leerBloque(nombre: string): string {
    const memoria = this.getMemoria();
    const i = memoria.indexOf(MARCA(nombre));
    const j = memoria.indexOf(CIERRE(nombre));
    if (i === -1 || j === -1 || j < i) return "";
    return memoria.slice(i + MARCA(nombre).length, j).trim();
  }

  private escribirBloque(nombre: string, contenidoNuevo: string): boolean {
    const memoria = this.getMemoria();
    const i = memoria.indexOf(MARCA(nombre));
    const j = memoria.indexOf(CIERRE(nombre));
    if (i === -1 || j === -1 || j < i) return false; // sin marcadores no se toca nada
    const actualizado =
      memoria.slice(0, i + MARCA(nombre).length) + "\n" + contenidoNuevo.trim() + "\n" + memoria.slice(j);
    if (!this.adquirirLock()) return false;
    try {
      this.snapshot("auto");
      this.escribirAtomico(this.memoriaPath, actualizado);
      this.memoria = actualizado;
      return true;
    } catch {
      return false;
    } finally {
      this.liberarLock();
    }
  }

  /** Añade una línea al final de un bloque dinámico (o al bloque indicado). */
  private añadirABloque(nombre: string, linea: string): boolean {
    const actual = this.leerBloque(nombre);
    const limpio = linea.trim();
    if (actual.includes(limpio)) return true; // sin duplicados
    return this.escribirBloque(nombre, `${actual}\n${limpio}`);
  }

  // ------------------------------------------------------------
  // API de uso desde el motor
  // ------------------------------------------------------------
  updateState(datos: { fase?: string; hito?: string; bloqueos?: string }): boolean {
    const ahora = new Date();
    const sello = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")} ${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}:${String(ahora.getSeconds()).padStart(2, "0")}`;
    const cuerpo = [
      `- **Timestamp de Última Actividad:** ${sello}`,
      datos.fase ? `- **Fase de Desarrollo Activa:** ${datos.fase}` : null,
      datos.hito ? `- **Último Hito Alcanzado:** ${datos.hito}` : null,
      `- **Bloqueos Actuales:** ${datos.bloqueos || "ninguno. La fase actual del proyecto está documentada en el ADR Log."}`,
    ]
      .filter(Boolean)
      .join("\n");
    return this.escribirBloque("ESTADO", cuerpo);
  }

  addDecision(texto: string): boolean {
    const fecha = new Date().toISOString().slice(0, 10);
    return this.insertarEnSeccion("## 2. Historial de Decisiones Arquitectónicas (ADR Log)", `- **${fecha} —** ${texto.trim()}`);
  }

  addLesson(texto: string): boolean {
    return this.insertarEnSeccion("### Lecciones aprendidas (evitar repetir)", `- ${texto.trim()}`);
  }

  addIncident(texto: string): boolean {
    return this.añadirABloque("INCIDENCIAS", `- **${new Date().toISOString().slice(0, 16).replace("T", " ")}** ${texto.trim()}`);
  }

  private insertarEnSeccion(titulo: string, linea: string): boolean {
    const memoria = this.getMemoria();
    let pos = memoria.indexOf(titulo);
    if (pos === -1) {
      // v2.0 — Robustez: memoria.md está pensado para que el humano lo edite, así
      // que puede renombrar un encabezado. Antes, con el título cambiado, la
      // decisión se perdía EN SILENCIO (lo detectó la propia prueba). Ahora se
      // busca por palabra clave del título, y también por "adr"/"decision".
      const clave = titulo
        .replace(/^#+\s*/, "")
        .replace(/^\d+\.\s*/, "")
        .replace(/\(.*\)/, "")
        .trim()
        .split(/\s+/)[0]
        .toLowerCase();
      const lineas = memoria.split("\n");
      for (const l of lineas) {
        const bajo = l.toLowerCase();
        if (!bajo.startsWith("##")) continue;
        if (bajo.includes(clave) || bajo.includes("adr") || bajo.includes("decision")) {
          pos = memoria.indexOf(l);
          break;
        }
      }
    }
    if (pos === -1) return false;
    const salto = memoria.indexOf("\n", pos);
    if (salto === -1) return false;
    if (memoria.slice(salto, salto + 400).includes(linea.trim())) return true;
    const actualizado = memoria.slice(0, salto + 1) + `\n${linea.trim()}\n` + memoria.slice(salto + 1);
    if (!this.adquirirLock()) return false;
    try {
      this.snapshot("auto");
      this.escribirAtomico(this.memoriaPath, actualizado);
      this.memoria = actualizado;
      return true;
    } catch {
      return false;
    } finally {
      this.liberarLock();
    }
  }

  /** Marca una incidencia a partir de un fallo real de herramienta (lo llama el motor). */
  registrarFallo(herramienta: string, detalle: string): void {
    const corto = String(detalle || "").replace(/\s+/g, " ").slice(0, 200);
    this.addIncident(`Herramienta **${herramienta}** falló: ${corto}`);
    this.bumpMetrica("incidentes", 1);
  }

  // ------------------------------------------------------------
  // Métricas
  // ------------------------------------------------------------
  bumpMetrica(clave: string, delta = 1): void {
    const actual = this.leerBloque("METRICAS");
    const lineas = actual.split("\n").map((l) => l.trim());
    const etiquetas: Record<string, string> = {
      interacciones: "Interacciones registradas",
      rechazados: "Archivos rechazados por el blindaje",
      imports: "Imports sin resolver detectados",
      propuestas: "Propuestas de auto-mejora pendientes de aprobar",
      incidentes: "Incidentes registrados",
    };
    const etiqueta = etiquetas[clave] || clave;
    const re = new RegExp(`^- ${etiqueta.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: (\\d+)`, "i");
    let encontrada = false;
    const nuevas = lineas.map((l) => {
      const m = l.match(re);
      if (m) {
        encontrada = true;
        return `- ${etiqueta}: ${Number(m[1]) + delta}`;
      }
      return l;
    });
    if (!encontrada) nuevas.push(`- ${etiqueta}: ${delta}`);
    this.escribirBloque("METRICAS", nuevas.filter(Boolean).join("\n"));
  }

  getMetrica(clave: string): number {
    const etiquetas: Record<string, string> = {
      interacciones: "Interacciones registradas",
      rechazados: "Archivos rechazados por el blindaje",
      imports: "Imports sin resolver detectados",
      propuestas: "Propuestas de auto-mejora pendientes de aprobar",
      incidentes: "Incidentes registrados",
    };
    const etiqueta = (etiquetas[clave] || clave).toLowerCase();
    for (const l of this.leerBloque("METRICAS").split("\n")) {
      if (l.toLowerCase().startsWith(`- ${etiqueta}:`)) {
        const n = Number(l.split(":")[1]);
        return Number.isFinite(n) ? n : 0;
      }
    }
    return 0;
  }

  /** Se llama una vez por interacción; cada 10 dispara la compresión de estado. */
  registrarInteraccion(): void {
    this.bumpMetrica("interacciones", 1);
    if (this.getMetrica("interacciones") % 10 === 0) this.compactar();
  }

  /**
   * Compresión de estado: purga ruido histórico del bloque de incidencias
   * conservando las 12 más recientes y las marcadas como críticas.
   */
  compactar(): { purgadas: number } {
    const actual = this.leerBloque("INCIDENCIAS");
    const lineas = actual.split("\n").filter((l) => l.trim().startsWith("-"));
    if (lineas.length <= 12) return { purgadas: 0 };
    const criticas = lineas.filter((l) => /crític|critic|blindaje|corrup/i.test(l));
    const recientes = lineas.slice(-12);
    const conservar = [...new Set([...criticas, ...recientes])];
    this.escribirBloque("INCIDENCIAS", conservar.join("\n"));
    this.snapshot("compactacion");
    return { purgadas: lineas.length - conservar.length };
  }

  // ------------------------------------------------------------
  // Auto-parcheo: detectar propuestas (NUNCA aplicar solas)
  // ------------------------------------------------------------
  static detectarPropuestas(texto: string): SelfPatchProposal[] {
    const out: SelfPatchProposal[] = [];
    const re = /\[PROPUESTA DE AUTO-MEJORA CEREBRO\]([\s\S]*?)(?=\n\s*\n\s*\[|$)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto)) !== null) {
      const bloque = m[1];
      const campo = (nombre: string) => {
        const r = new RegExp(`-\\s*${nombre}\\s*:([^\\n]*)`, "i");
        const mm = bloque.match(r);
        return mm ? mm[1].trim() : "";
      };
      const motivo = campo("Motivo");
      const linea = campo("Línea a modificar");
      const inyectar = campo("Nuevo bloque a inyectar");
      if (motivo || inyectar) {
        out.push({ motivo, linea, bloque: inyectar || bloque.trim(), detectadaEn: Date.now() });
      }
    }
    return out;
  }

  guardarPropuesta(p: SelfPatchProposal): string | null {
    try {
      fs.mkdirSync(this.proposalsDir, { recursive: true });
      const sello = new Date().toISOString().replace(/[:.]/g, "-");
      const destino = path.join(this.proposalsDir, `propuesta_${sello}.md`);
      const contenido = `# Propuesta de auto-mejora del CEREBRO

- **Detectada:** ${new Date().toLocaleString()}
- **Motivo:** ${p.motivo || "(no indicado)"}
- **Línea a modificar:** ${p.linea || "(no indicada)"}

## Nuevo bloque propuesto

\`\`\`markdown
${p.bloque}
\`\`\`

> Esta propuesta NO se ha aplicado. \`cerebro.md\` es el núcleo inmutable: solo un
> humano lo modifica. Para aprobarla, revisa el bloque y pégalo en
> \`cerebro.md\`; después anótalo en \`memoria.md\` → ADR Log.
`;
      fs.writeFileSync(destino, contenido, "utf-8");
      this.bumpMetrica("propuestas", 1);
      return destino;
    } catch {
      return null;
    }
  }

  listarPropuestas(): string[] {
    try {
      if (!fs.existsSync(this.proposalsDir)) return [];
      return fs.readdirSync(this.proposalsDir).filter((f) => f.endsWith(".md")).sort().reverse();
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------------
  // Historial y rollback
  // ------------------------------------------------------------
  listarHistorial(): Array<{ archivo: string; fecha: number; bytes: number }> {
    try {
      if (!fs.existsSync(this.historyDir)) return [];
      return fs
        .readdirSync(this.historyDir)
        .filter((f) => f.startsWith("memoria_") && f.endsWith(".md"))
        .map((f) => {
          const st = fs.statSync(path.join(this.historyDir, f));
          return { archivo: f, fecha: st.mtimeMs, bytes: st.size };
        })
        .sort((a, b) => b.fecha - a.fecha);
    } catch {
      return [];
    }
  }

  rollback(archivo: string): boolean {
    try {
      const origen = path.join(this.historyDir, path.basename(archivo));
      if (!fs.existsSync(origen)) return false;
      const contenido = fs.readFileSync(origen, "utf-8");
      if (!this.adquirirLock()) return false;
      try {
        // El estado actual no se pierde: se guarda antes de restaurar.
        this.snapshot("pre-rollback");
        this.escribirAtomico(this.memoriaPath, contenido);
        this.memoria = contenido;
        return true;
      } finally {
        this.liberarLock();
      }
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------
  // Bloque para el prompt del modelo
  // ------------------------------------------------------------
  /**
   * Construye el bloque de gobernanza que se inyecta en el prompt.
   * El CEREBRO va completo (es la ley y es corto). De la MEMORIA solo el estado
   * operativo y las incidencias críticas: es lo que evita la fatiga de contexto
   * en modelos pequeños.
   */
  /**
   * Ley CONDENSADA para modelos pequeños.
   *
   * Medición que motivó esto: con el cerebro.md completo, el bloque inyectado en
   * nivel `compact` pesaba ~9,8 KB (≈2.500 tokens). Para un modelo de 3-8 B eso
   * es justo la "fatiga de contexto" que el diseño quiere evitar: más prompt =
   * más lento hasta el primer token y menos ventana para el trabajo real.
   * De la ley solo son imprescindibles tres cosas para trabajar bien: los
   * guardrails, los estándares (puertos/rutas) y el protocolo de cierre. Se
   * extraen por encabezado, sin cortar texto a mitad de frase.
   */
  private cerebroCondensado(): string {
    const texto = this.getCerebro();
    const secciones = texto.split(/\n(?=##\s)/);
    const relevantes = secciones.filter((s) =>
      /identidad|guardrails|estándares|estandares|cierre|fast-decision/i.test(s.slice(0, 90))
    );
    const elegidas = relevantes.length > 0 ? relevantes : secciones.slice(0, 3);
    const juntas = elegidas.join("\n\n");
    return juntas.length > 4200 ? juntas.slice(0, 4200) + "\n…(ley condensada)" : juntas;
  }

  systemBlock(nivel: "micro" | "compact" | "standard" | "pro" = "standard"): string {
    const cerebro = nivel === "compact" ? this.cerebroCondensado().trim() : this.getCerebro().trim();
    const estado = this.leerBloque("ESTADO");
    const incidencias = this.leerBloque("INCIDENCIAS")
      .split("\n")
      .filter((l) => l.trim().startsWith("-"))
      .slice(-3)
      .join("\n");

    if (nivel === "micro") {
      // Modelo diminuto: solo la ley imprescindible y el estado en una línea.
      const resumenEstado = estado.split("\n")[0] || "";
      const nucleo = [
        "=== NÚCLEO (CEREBRO — ley obligatoria) ===",
        "1. Veracidad: no inventes datos, rutas ni nombres de herramientas; si no puedes hacer algo, dilo.",
        "2. Sin relleno: sin saludos, sin repetir la pregunta. Ve a la solución.",
        "3. Bloques de código completos y con la ruta exacta: ```lang file=\"ruta\"",
        "4. Puertos: IDE 3000 · sandbox 3500 · puente 5000 · Ollama 11434.",
        "5. Responde en el idioma del usuario (por defecto español).",
      ];
      if (PROTOCOLO_CIERRE.activo) {
        // v2.0 — Fast-Decision Engine: la plantilla de salida va TAMBIÉN en el
        // prompt del modelo diminuto. Es aquí donde más se nota: sin plantilla,
        // un modelo de 0,5 B divaga y pierde el hilo; con ella va al contenido.
        nucleo.push(
          "6. Formato OBLIGATORIO de respuesta:",
          "   [DIAGNÓSTICO FLASH] 1 línea: qué vas a hacer.",
          "   [ACCIÓN] el código o la respuesta, limpio.",
          "   [CHECKLIST DE MEMORIA] 1 línea: qué estado se actualizó."
        );
      } else {
        // v8.0.1 — Ajuste pedido por el usuario: «solo responde la respuesta».
        // Antes esta línea pedía la plantilla de acta y el modelo la cumplía
        // (la queja literal fue «no, quítalo, solo responde la respuesta»).
        // Se prohíbe en positivo y SIN escribir las etiquetas: nombrarlas en el
        // prompt es la forma más rápida de que un modelo pequeño las repita.
        nucleo.push(
          "6. NO uses rótulos internos de acta ni etiquetas de estado entre corchetes:",
          "   responde directamente con la solución y el código. Sin saludos ni despedidas."
        );
      }
      nucleo.push(
        "7. Si dudas entre dos rutas y ninguna es destructiva: NO preguntes, elige la más simple y avanza.",
        "=== ESTADO ACTUAL ===",
        resumenEstado,
        "=== FIN ==="
      );
      return nucleo.join("\n");
    }

    const partes = [
      "=== INICIO DE NÚCLEO (CEREBRO — ley obligatoria) ===",
      cerebro,
      "=== FIN DE NÚCLEO ===",
      "",
      "=== INICIO DE ESTADO ACTUAL (MEMORIA ejecutiva) ===",
      estado,
    ];
    if (nivel !== "compact" && incidencias) {
      partes.push("", "**Fallos recientes que NO debes repetir:**", incidencias);
    }
    partes.push("=== FIN DE ESTADO ===");

    // ============================================================
    // v2.0 — FAST-DECISION ENGINE (cierre obligatorio)
    // ------------------------------------------------------------
    // Se inyecta en TODOS los niveles menos en el micro (que ya lo lleva
    // condensado arriba). Es la última instrucción que lee el modelo antes de
    // responder, y la que evita el bucle de preguntas innecesarias y el relleno.
    // ============================================================
    if (PROTOCOLO_CIERRE.activo) {
      partes.push(
        "",
        "=== PROTOCOLO DE CIERRE (OBLIGATORIO) ===",
        "Estructura la respuesta EXACTAMENTE en este orden, sin saludos ni despedidas:",
        "1. [DIAGNÓSTICO FLASH] — una sola línea: qué vas a hacer.",
        "2. [ACCIÓN] — el código o la solución, limpio. Bloques con la ruta exacta.",
        "3. [CHECKLIST DE MEMORIA] — una línea: qué estado se actualizó en memoria.md.",
        "",
        "BARANDILLA DE CONFIANZA: si dudas entre dos rutas técnicas y NINGUNA es destructiva,",
        "está PROHIBIDO preguntar. Elige la opción más simple, modular y rápida, y anótalo así:",
        "[Asunción tomada: se optó por la ruta estándar por optimización de velocidad]",
        "Solo se pregunta si la acción es destructiva (borrar, sobrescribir sin respaldo, matar procesos).",
        "=== FIN DEL PROTOCOLO DE CIERRE ==="
      );
    } else {
      // v8.0.1 — El contrato útil se conserva (no divagar, no preguntar de más,
      // bloques con ruta exacta); lo que se retira es el ACTA. Ese era el ruido:
      // el rótulo de estado no ayuda al usuario y en un modelo pequeño se come
      // el turno. Las etiquetas NO se escriben aquí a propósito: nombrarlas en
      // el prompt es la vía más corta a que el modelo las reproduzca.
      partes.push(
        "",
        "=== CONTRATO DE SALIDA ===",
        "Responde directamente, sin saludos ni despedidas y sin rótulos internos de",
        "acta ni etiquetas de estado entre corchetes. Primero la solución; el código",
        "en bloques completos con la ruta exacta: ```lang file=\"ruta\".",
        "",
        "BARANDILLA DE CONFIANZA: si dudas entre dos rutas técnicas y NINGUNA es destructiva,",
        "está PROHIBIDO preguntar. Elige la opción más simple, modular y rápida, y avanza;",
        "si la elección condiciona el resultado, dilo en UNA frase de prosa normal.",
        "Solo se pregunta si la acción es destructiva (borrar, sobrescribir sin respaldo, matar procesos).",
        "=== FIN DEL CONTRATO ==="
      );
    }
    return partes.join("\n");
  }

  stats(): BrainStats {
    const memoria = this.getMemoria();
    return {
      cerebroChars: this.getCerebro().length,
      memoriaChars: memoria.length,
      memoriaLines: memoria.split("\n").length,
      historyCount: this.listarHistorial().length,
      proposals: this.listarPropuestas().length,
      interactions: this.getMetrica("interacciones"),
      updatedAt: Date.now(),
    };
  }
}
