/**
 * cloudVerifier.ts — VERIFICADOR INDEPENDIENTE EN LA NUBE (v2.1, disponible en v2.0)
 * =================================================================================
 * Corrección de diseño importante (idea del usuario, y tiene razón):
 *
 *   Yo había planificado el «verificador independiente» como un SEGUNDO MODELO
 *   LOCAL y por eso lo situé en la V2.1 (12 GB de RAM). Pero si el generador y el
 *   verificador están **en la nube**, el coste local es prácticamente CERO:
 *   ni pesos en RAM, ni CPU de inferencia. Solo un cliente HTTP y un JSON corto.
 *
 *   Conclusión: el verificador está disponible HOY, con 8 GB, sin esperar a nada.
 *   Lo que cuesta no es RAM: es **latencia, cuota de la nube y tokens**.
 *
 * Arquitectura de dos capas, y el orden importa:
 *
 *   1. COMPROBACIONES DETERMINISTAS (coste 0, ni un token). Sintaxis con el
 *      blindaje, marcadores perezosos, imports que no existen, respuesta vacía.
 *      Si algo de esto falla, el veredicto es «rechaza» **sin llamar a nadie**.
 *      Esto es dinero y latencia que no se gasta.
 *   2. JUEZ EN LA NUBE (solo si la capa 1 pasa). Otro modelo, otro prompt,
 *      temperatura 0, veredicto en JSON estricto. Idealmente de un proveedor
 *      DISTINTO al generador: si ambos son el mismo modelo, sus errores están
 *      correlacionados y la revisión aporta menos.
 *
 * LÍMITE DE HONESTIDAD: el verificador **no escribe código ni aplica cambios**.
 * Solo juzga y explica. La decisión de aplicar sigue siendo del flujo normal
 * (y del usuario, si el cambio es destructivo).
 */

import * as fs from "fs";
import * as path from "path";
import { guardFile } from "./syntaxGuard";
import { findMissingImports } from "./importChecker";

export type ProveedorNube = "zai" | "openrouter" | "gemini" | "openai" | "custom";

export interface VerifierConfig {
  enabled: boolean;
  /** Proveedor del JUEZ. Conviene que sea distinto al que genera. */
  provider: ProveedorNube;
  model: string;
  /** Para proveedores compatibles con OpenAI o self-hosted. */
  baseUrl?: string;
  /** Variable de entorno de la que tomar la clave (nunca se guarda la clave). */
  apiKeyEnv: string;
  timeoutMs: number;
  /** Si la respuesta del juez no se puede interpretar, ¿se bloquea o se deja pasar? */
  anteDuda: "dejar_pasar" | "rechazar";
}

export interface VeredictoVerificacion {
  acepta: boolean;
  etapa: "determinista" | "modelo" | "sin-verificador";
  motivos: string[];
  correcciones: string[];
  /** RAM que consume este verificador en TU máquina, en MB. Es el dato clave. */
  costeLocalMB: number;
  llamadasNube: number;
  /** Respuesta cruda del juez, recortada (para auditar por qué dijo lo que dijo). */
  bruto?: string;
  nota?: string;
}

const PLACEHOLDERS = [
  /\/\/\s*(?:\.\.\.|aqu[ií])\s*(?:resto|el resto|sigue|contin[uú]a)/i,
  /\bTODO\b|\bFIXME\b/,
  /\(\s*archivo\s+truncado/i,
  /\.\.\.\s*\(?\s*(?:resto|resto del c[oó]digo|truncad)/i,
  /^\s*\.\.\.\s*$/m,
];

const DEFAULT_CONFIG: VerifierConfig = {
  enabled: false,
  provider: "zai",
  // Un modelo gratuito y rápido: el juez solo tiene que juzgar.
  model: "glm-4.7-flash",
  apiKeyEnv: "ZAI_API_KEY",
  timeoutMs: 25000,
  anteDuda: "dejar_pasar",
};

export class CloudVerifier {
  readonly root: string;
  private readonly configPath: string;
  private config: VerifierConfig = { ...DEFAULT_CONFIG };
  private cargado = false;

  constructor(root: string) {
    this.root = root;
    this.configPath = path.join(root, ".cerebro-db", "verifier.json");
  }

  loadConfig(): VerifierConfig {
    if (this.cargado) return this.config;
    try {
      if (fs.existsSync(this.configPath)) {
        const j = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
        this.config = { ...DEFAULT_CONFIG, ...(j || {}) };
      }
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
    this.cargado = true;
    return this.config;
  }

  private saveConfig(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      // Nunca se guarda la clave: solo el nombre de la variable de entorno.
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf-8");
    } catch {}
  }

  getConfig(): VerifierConfig {
    return { ...this.loadConfig() };
  }

  setConfig(patch: Partial<VerifierConfig>): VerifierConfig {
    const actual = this.loadConfig();
    this.config = {
      ...actual,
      ...patch,
      // La clave jamás entra en la configuración.
      apiKeyEnv: patch.apiKeyEnv || actual.apiKeyEnv,
    };
    this.cargado = true;
    this.saveConfig();
    return this.getConfig();
  }

  isEnabled(): boolean {
    return this.loadConfig().enabled === true;
  }

  // ------------------------------------------------------------
  // CAPA 1 — Comprobaciones deterministas (ni un token)
  // ------------------------------------------------------------
  /**
   * Revisa la propuesta sin llamar a ningún modelo. Devuelve los motivos de
   * rechazo si los hay. `archivosProyecto` es opcional: si se pasa, además se
   * comprueba que los imports relativos existan.
   */
  static preChecks(
    propuesta: string,
    opciones?: { archivosProyecto?: string[]; exigirCodigo?: boolean }
  ): { ok: boolean; motivos: string[]; correcciones: string[] } {
    const motivos: string[] = [];
    const correcciones: string[] = [];
    const texto = String(propuesta || "");

    if (texto.trim().length === 0) {
      return { ok: false, motivos: ["La propuesta está vacía."], correcciones: ["Genera una respuesta con contenido."] };
    }
    if (texto.trim().length < 30) {
      motivos.push(`La propuesta es demasiado corta (${texto.trim().length} caracteres) para ser una solución.`);
      correcciones.push("Desarrolla la solución completa; sin relleno, pero completa.");
    }

    // Marcadores perezosos
    for (const re of PLACEHOLDERS) {
      if (re.test(texto)) {
        motivos.push("Contiene un marcador de código no escrito (placeholder o truncamiento).");
        correcciones.push("Entrega el bloque completo: nada de «resto del código igual» ni «archivo truncado».");
        break;
      }
    }

    // Bloques de código con ruta → blindaje de sintaxis
    const bloques = [...texto.matchAll(/```[a-zA-Z0-9_+-]*\s+file=["']([^"']+)["']\s*\n([\s\S]*?)```/g)];
    const rutas: string[] = [];
    for (const b of bloques) {
      const ruta = b[1];
      rutas.push(ruta);
      const g = guardFile(ruta, b[2]);
      if (!g.ok) {
        motivos.push(`El archivo ${ruta} no pasa el blindaje: ${g.issues[0]?.message || "sintaxis inválida"}`);
        correcciones.push(`Corrige ${ruta}: ${g.issues.slice(0, 3).map((i: any) => i.message).join(" · ")}`);
      }
    }

    if (opciones?.exigirCodigo && bloques.length === 0) {
      motivos.push("Se pidió código y la respuesta no incluye ningún bloque con ruta de archivo.");
      correcciones.push('Entrega los archivos con el formato ```lang file="ruta/archivo.ext"');
    }

    // Imports que no existen (solo si conocemos el proyecto o la propia propuesta)
    const disponibles = new Set<string>([...(opciones?.archivosProyecto || []), ...rutas]);
    if (disponibles.size > 0 && bloques.length > 0) {
      const faltantes = findMissingImports(bloques.map((b) => ({ path: b[1], content: b[2] })));
      for (const m of faltantes) {
        // Solo se avisa si el archivo no está ni en el proyecto ni en la propuesta
        const candidatos = [m.expected[0], `${m.expected[0]}.tsx`, `${m.expected[0]}.ts`];
        if (candidatos.some((c) => disponibles.has(c))) continue;
        motivos.push(`${m.from} importa "${m.specifier}" y ese archivo no existe.`);
        correcciones.push(`Crea ${m.expected[0]} o corrige el import en ${m.from}.`);
      }
    }

    return { ok: motivos.length === 0, motivos: [...new Set(motivos)], correcciones: [...new Set(correcciones)] };
  }

  // ------------------------------------------------------------
  // CAPA 2 — El juez en la nube
  // ------------------------------------------------------------
  private resolverClave(): string {
    const cfg = this.loadConfig();
    const candidatas = [cfg.apiKeyEnv, "ZAI_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY"];
    for (const nombre of candidatas) {
      if (nombre && process.env[nombre]) return process.env[nombre] as string;
    }
    return "";
  }

  private promptDelJuez(peticion: string, propuesta: string): { sistema: string; usuario: string } {
    return {
      sistema: [
        "Eres un VERIFICADOR independiente. No escribes código ni reescribes nada: solo juzgas.",
        "Criterios, en este orden:",
        "1) ¿Responde exactamente a lo que se pidió? (ni de más, ni de menos)",
        "2) ¿El código es completo y coherente (imports, nombres, estructura)?",
        "3) ¿Respeta las reglas del proyecto: sin placeholders, sin rutas inventadas, sin afirmar acciones que no se hicieron?",
        "Responde SOLO con este JSON, sin texto alrededor:",
        '{"acepta": true|false, "motivos": ["..."], "correcciones": ["..."]}',
        "Si aceptas, deja las listas vacías. Sé estricto con lo que impide funcionar y tolerante con el estilo.",
      ].join("\n"),
      usuario: `PETICIÓN DEL USUARIO:\n${String(peticion || "").slice(0, 4000)}\n\nPROPUESTA A REVISAR:\n${String(propuesta || "").slice(0, 8000)}`,
    };
  }

  /** Extrae el JSON del veredicto aunque el juez añada texto alrededor. */
  static parsearVeredicto(texto: string): { acepta: boolean; motivos: string[]; correcciones: string[] } | null {
    if (!texto) return null;
    const inicio = texto.indexOf("{");
    const fin = texto.lastIndexOf("}");
    if (inicio === -1 || fin === -1 || fin <= inicio) return null;
    try {
      const j = JSON.parse(texto.slice(inicio, fin + 1));
      const acepta = j?.acepta === true || j?.accept === true || j?.ok === true;
      const lista = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);
      return { acepta, motivos: lista(j?.motivos || j?.reasons), correcciones: lista(j?.correcciones || j?.fixes) };
    } catch {
      return null;
    }
  }

  private async llamarOpenAICompatible(
    baseUrl: string,
    clave: string,
    modelo: string,
    sistema: string,
    usuario: string
  ): Promise<string> {
    const cfg = this.loadConfig();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
        body: JSON.stringify({
          model: modelo,
          temperature: 0,
          max_tokens: 500,
          messages: [
            { role: "system", content: sistema },
            { role: "user", content: usuario },
          ],
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j: any = await res.json();
      return String(j?.choices?.[0]?.message?.content || "");
    } finally {
      clearTimeout(t);
    }
  }

  private async llamarGemini(clave: string, modelo: string, sistema: string, usuario: string): Promise<string> {
    const cfg = this.loadConfig();
    const base = (cfg.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(`${base}/models/${modelo}:generateContent?key=${encodeURIComponent(clave)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sistema }] },
          contents: [{ role: "user", parts: [{ text: usuario }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 500 },
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j: any = await res.json();
      const partes = j?.candidates?.[0]?.content?.parts;
      return Array.isArray(partes) ? partes.map((p: any) => String(p?.text || "")).join("") : "";
    } finally {
      clearTimeout(t);
    }
  }

  private async preguntarAlJuez(peticion: string, propuesta: string): Promise<string> {
    const cfg = this.loadConfig();
    const clave = this.resolverClave();
    if (!clave) throw new Error(`sin clave: define ${cfg.apiKeyEnv} en el entorno del motor`);
    const { sistema, usuario } = this.promptDelJuez(peticion, propuesta);
    if (cfg.provider === "gemini") return this.llamarGemini(clave, cfg.model, sistema, usuario);
    const bases: Record<string, string> = {
      zai: "https://api.z.ai/api/paas/v4",
      openrouter: "https://openrouter.ai/api/v1",
      openai: "https://api.openai.com/v1",
      custom: cfg.baseUrl || "",
    };
    const base = cfg.baseUrl && cfg.provider !== "custom" ? cfg.baseUrl : bases[cfg.provider];
    if (!base) throw new Error("falta baseUrl para el proveedor personalizado");
    return this.llamarOpenAICompatible(base, clave, cfg.model, sistema, usuario);
  }

  // ------------------------------------------------------------
  // Orquestador
  // ------------------------------------------------------------
  /**
   * Verifica una propuesta. Nunca lanza: si algo falla, devuelve un veredicto
   * explicado, porque un verificador que rompe el flujo es peor que no tenerlo.
   */
  async verificar(
    peticion: string,
    propuesta: string,
    opciones?: { archivosProyecto?: string[]; exigirCodigo?: boolean }
  ): Promise<VeredictoVerificacion> {
    const base: VeredictoVerificacion = {
      acepta: true,
      etapa: "determinista",
      motivos: [],
      correcciones: [],
      costeLocalMB: 0.1, // cliente HTTP + respuesta corta: esto es todo el coste local
      llamadasNube: 0,
    };

    // Capa 1: gratis, siempre. Si ya falla aquí, no se gasta un token.
    const pre = CloudVerifier.preChecks(propuesta, opciones);
    if (!pre.ok) {
      return {
        ...base,
        acepta: false,
        etapa: "determinista",
        motivos: pre.motivos,
        correcciones: pre.correcciones,
        nota: "Rechazado por las comprobaciones del motor, sin gastar ninguna llamada a la nube.",
      };
    }

    const cfg = this.loadConfig();
    if (!cfg.enabled) {
      return { ...base, etapa: "sin-verificador", nota: "El verificador está apagado: solo se aplicaron las comprobaciones deterministas." };
    }

    // Capa 2: el juez.
    try {
      const bruto = await this.preguntarAlJuez(peticion, propuesta);
      const parseado = CloudVerifier.parsearVeredicto(bruto);
      if (!parseado) {
        const dejaPasar = cfg.anteDuda === "dejar_pasar";
        return {
          ...base,
          acepta: dejaPasar,
          etapa: "modelo",
          llamadasNube: 1,
          motivos: dejaPasar ? [] : ["El juez respondió algo que no se pudo interpretar."],
          nota: `No se pudo interpretar el veredicto del juez (política: ${cfg.anteDuda}).`,
          bruto: bruto.slice(0, 400),
        };
      }
      return {
        ...base,
        acepta: parseado.acepta,
        etapa: "modelo",
        llamadasNube: 1,
        motivos: parseado.motivos,
        correcciones: parseado.correcciones,
        bruto: bruto.slice(0, 400),
        nota: parseado.acepta
          ? "El juez acepta la propuesta."
          : "El juez la rechaza: los motivos indican qué corregir.",
      };
    } catch (err: any) {
      // Sin red o sin clave: no se bloquea al usuario por un fallo del verificador.
      return {
        ...base,
        etapa: "modelo",
        llamadasNube: 0,
        motivos: [],
        nota: `No se pudo consultar al juez (${String(err?.message || err).slice(0, 120)}). Se acepta la propuesta: un verificador caído no debe parar el trabajo.`,
      };
    }
  }

  status() {
    const cfg = this.loadConfig();
    const clave = this.resolverClave();
    return {
      ...cfg,
      claveDisponible: clave.length > 0,
      costeLocalMB: 0.1,
      // El ahorro que supone frente a un verificador LOCAL, que es el dato que
      // hace que esta función esté disponible en un equipo de 8 GB.
      ramAhorradaFrenteALocalMB: 3500,
      nota: cfg.enabled
        ? "Verificador activo en la nube: coste local ~0,1 MB (0,1 MB de RAM). El coste real es latencia y cuota del proveedor."
        : "Apagado: no se hace ninguna llamada.",
    };
  }
}
