/**
 * espejosServidor.ts — ESPEJOS ESPECIALIZADOS POR TIPO DE SERVIDOR DE DATOS
 * =========================================================================
 * Complemento de espejos.ts: donde aquél cubre disciplinas (código, arte,
 * ciencia, cuántica), éste cubre TIPOS DE SERVIDOR DE DATOS (relacional,
 * documental, clave-valor, grafo, vectorial, series temporales, colas,
 * objetos, búsqueda, tiempo real) — el dominio típico de una API FastAPI.
 *
 * Reglas de diseño (las mismas del proyecto):
 *  - CERO imports de Node (`node:os`, `node:crypto`, `fs`): viaja al bundle
 *    del navegador igual que espejos.ts. Puro y determinista.
 *  - El CATÁLOGO declarativo vive en `tablas-servidor.json` (fuente única).
 *    Aquí solo están las FUNCIONES de contrato y el ENRUTADOR de selección.
 *  - Nada silencioso: un contrato que no puede cumplir devuelve `motivo`.
 *  - Selección CONSISTENTE (determinista, empates por orden de catálogo),
 *    EXTENSIBLE (añadir un espejo = una entrada en el JSON + una función en
 *    EJECUTORES) y SEGURA (entrada acotada, sin eval, sin red, sin disco).
 */

import catalogo from "./tablas-servidor.json";

// ─── Tipos del catálogo (coinciden 1:1 con el JSON) ─────────────────────────

export interface CategoriaServidor {
  id: string;
  nombre: string;
  icono: string;
  descripcion: string;
}

export interface EspejoServidorMeta {
  id: string;
  categoria: string;
  nombre: string;
  senales: string[];
  descripcion: string;
  contrato: { entrada: string; salida: string };
}

const CATALOGO = catalogo as unknown as {
  version: string;
  nota: string;
  categorias: CategoriaServidor[];
  espejos: EspejoServidorMeta[];
};

export const VERSION_SERVIDOR = CATALOGO.version;
export const CATEGORIAS_SERVIDOR: CategoriaServidor[] = CATALOGO.categorias;
export const IDS_ESPEJOS_SERVIDOR: string[] = CATALOGO.espejos.map((e) => e.id);

const CATEGORIA_POR_ID = new Map(CATEGORIAS_SERVIDOR.map((c) => [c.id, c]));
const ESPEJO_POR_ID = new Map(CATALOGO.espejos.map((e) => [e.id, e]));

// ─── Utilidades puras (seguridad + normalización) ──────────────────────────

/** Longitud máxima de la consulta: protege el enrutador de entradas gigantes. */
export const LIMITE_CONSULTA = 4000;

function sinAcentos(s: string): string {
  try {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    return s;
  }
}

function normalizarTexto(s: string): string {
  return sinAcentos(String(s).toLowerCase()).trim();
}

// ─── Resultado de un contrato (mismo patrón que consejo.ts) ─────────────────

export interface ResultadoServidor {
  ok: boolean;
  salida?: unknown;
  motivo?: string;
  id?: string;
  ms?: number;
}

// ─── Los 10 contratos (funciones deterministas, una por tipo) ──────────────

type Ejecutor = (d: any) => ResultadoServidor;

function okS(id: string, t0: number, salida: unknown): ResultadoServidor {
  return { ok: true, id, ms: Date.now() - t0, salida };
}
function noS(id: string, t0: number, motivo: string): ResultadoServidor {
  return { ok: false, id, ms: Date.now() - t0, motivo };
}

const EJECUTORES: Record<string, Ejecutor> = {
  // 1 · RELACIONAL — DDL + validación de claves foráneas (no ejecuta SQL).
  "servidor.relacional": (d) => {
    const t0 = Date.now();
    const tablas = Array.isArray(d?.tablas) ? d.tablas : [];
    if (!tablas.length) return noS("servidor.relacional", t0, "no llegó «tablas» (lista de {nombre, columnas}).");
    const avisos: string[] = [];
    const clavesForaneas: string[] = [];
    const ddl: string[] = [];
    const nombres = new Set<string>();
    for (const t of tablas) {
      const nombre = String(t?.nombre || "").trim();
      if (!nombre) return noS("servidor.relacional", t0, "hay una tabla sin «nombre».");
      if (nombres.has(nombre)) return noS("servidor.relacional", t0, `tabla «${nombre}» repetida.`);
      nombres.add(nombre);
      const columnas = Array.isArray(t?.columnas) ? t.columnas : [];
      if (!columnas.length) return noS("servidor.relacional", t0, `la tabla «${nombre}» no tiene columnas.`);
      const lineas: string[] = [];
      const pk: string[] = [];
      for (const c of columnas) {
        const cn = String(c?.nombre || "").trim();
        const tipo = String(c?.tipo || "TEXT").trim();
        if (!cn) return noS("servidor.relacional", t0, `una columna de «${nombre}» no tiene nombre.`);
        let linea = `  ${cn} ${tipo}`;
        if (c?.pk) pk.push(cn);
        if (c?.fk) {
          const ftab = String(c.fk.tabla || "").trim();
          const fcol = String(c.fk.columna || "").trim();
          if (!ftab || !fcol) return noS("servidor.relacional", t0, `la columna «${cn}» tiene una clave foránea incompleta.`);
          if (!nombres.has(ftab)) avisos.push(`la tabla «${nombre}» referencia a «${ftab}», que no se ha definido todavía (ordénala antes).`);
          linea += ` REFERENCES ${ftab}(${fcol})`;
          clavesForaneas.push(`${nombre}.${cn} → ${ftab}.${fcol}`);
        }
        lineas.push(linea);
      }
      if (pk.length) lineas.push(`  PRIMARY KEY (${pk.join(", ")})`);
      ddl.push(`CREATE TABLE ${nombre} (\n${lineas.join(",\n")}\n);`);
      if (columnas.length > 20) avisos.push(`la tabla «${nombre}» tiene ${columnas.length} columnas: valora normalizarla.`);
    }
    return okS("servidor.relacional", t0, {
      ddl: ddl.join("\n\n"),
      tablas: tablas.length,
      clavesForaneas,
      avisos,
    });
  },

  // 2 · DOCUMENTAL — esquema + índices + desnormalización sugerida.
  "servidor.documental": (d) => {
    const t0 = Date.now();
    const coleccion = String(d?.coleccion || "").trim();
    const campos = Array.isArray(d?.campos) ? d.campos : [];
    if (!coleccion) return noS("servidor.documental", t0, "no llegó «coleccion» (nombre).");
    if (!campos.length) return noS("servidor.documental", t0, "no llegó «campos» (lista de {nombre, tipo}).");
    const indices: string[] = [];
    const desnormalizar: string[] = [];
    const esquema: Record<string, string> = {};
    for (const c of campos) {
      const cn = String(c?.nombre || "").trim();
      const tipo = String(c?.tipo || "string").trim();
      if (!cn) return noS("servidor.documental", t0, "hay un campo sin «nombre».");
      esquema[cn] = tipo;
      if (c?.indice) indices.push(cn);
      if (c?.referenciado) desnormalizar.push(cn);
    }
    return okS("servidor.documental", t0, {
      coleccion,
      esquema,
      indices,
      desnormalizar,
      avisos: desnormalizar.length ? [`desnormaliza ${desnormalizar.join(", ")} para ahorrar joins de agregación.`] : [],
    });
  },

  // 3 · CLAVE-VALOR — patrón + TTL + memoria estimada.
  "servidor.clave_valor": (d) => {
    const t0 = Date.now();
    const patron = String(d?.patron || "").trim();
    if (!patron) return noS("servidor.clave_valor", t0, "no llegó «patron» (ej. \"usuario:{id}\").");
    const valido = /^[a-z0-9_{}.:\-/]+$/.test(patron);
    const ttl = Number(d?.ttlSegundos);
    const ttlSegundos = Number.isFinite(ttl) && ttl > 0 ? ttl : 3600;
    const bytes = Number(d?.bytesPorValor) > 0 ? Number(d.bytesPorValor) : 256;
    const accesos = Number(d?.accesosPorSegundo) > 0 ? Number(d.accesosPorSegundo) : 100;
    const memoria = (bytes * accesos * Math.max(1, ttlSegundos / 3600)) / (1024 * 1024);
    return okS("servidor.clave_valor", t0, {
      patron,
      valido,
      ttlRecomendado: ttlSegundos,
      memoriaEstimadaMB: Math.round(memoria * 100) / 100,
      avisos: valido ? [] : ["el patrón usa caracteres fuera de [a-z0-9_{}.:-/]: no será portable entre clientes."],
    });
  },

  // 4 · GRAFO — recuento + huérfanos + patrón Cypher sugerido.
  "servidor.grafo": (d) => {
    const t0 = Date.now();
    const nodos = Array.isArray(d?.nodos) ? d.nodos : [];
    const aristas = Array.isArray(d?.aristas) ? d.aristas : [];
    if (!nodos.length) return noS("servidor.grafo", t0, "no llegó «nodos» (lista de {nombre, etiqueta}).");
    const ids = new Set<string>();
    for (const n of nodos) {
      const nn = String(n?.nombre || "").trim();
      if (!nn) return noS("servidor.grafo", t0, "hay un nodo sin «nombre».");
      if (ids.has(nn)) return noS("servidor.grafo", t0, `nodo «${nn}» repetido.`);
      ids.add(nn);
    }
    const grados = new Set<string>();
    for (const a of aristas) {
      const desde = String(a?.desde || "").trim();
      const hacia = String(a?.hacia || "").trim();
      if (!desde || !hacia) return noS("servidor.grafo", t0, "hay una arista sin «desde» o «hacia».");
      if (!ids.has(desde) || !ids.has(hacia)) return noS("servidor.grafo", t0, `la arista ${desde}→${hacia} referencia un nodo inexistente.`);
      grados.add(desde); grados.add(hacia);
    }
    const huerfanos = [...ids].filter((x) => !grados.has(x));
    return okS("servidor.grafo", t0, {
      nodos: nodos.length,
      aristas: aristas.length,
      huerfanos,
      consultaCypher: "MATCH (a)-[r]->(b) RETURN a, r, b LIMIT 50",
      avisos: huerfanos.length ? [`nodos sin relación: ${huerfanos.join(", ")}.`] : [],
    });
  },

  // 5 · VECTORIAL — memoria (float32) + índice recomendado.
  "servidor.vectorial": (d) => {
    const t0 = Date.now();
    const dimensiones = Math.trunc(Number(d?.dimensiones));
    const registros = Math.trunc(Number(d?.registros));
    if (!Number.isInteger(dimensiones) || dimensiones < 1) return noS("servidor.vectorial", t0, "«dimensiones» debe ser entero ≥1.");
    if (!Number.isInteger(registros) || registros < 1) return noS("servidor.vectorial", t0, "«registros» debe ser entero ≥1.");
    const bytes = dimensiones * registros * 4;
    const indice = registros < 100_000 ? "exacto (fuerza bruta) o HNSW" : registros < 5_000_000 ? "HNSW o IVFFlat" : "IVF-PQ (comprimido)";
    return okS("servidor.vectorial", t0, {
      dimensiones,
      registros,
      bytesEstimados: bytes,
      indiceRecomendado: indice,
      avisos: bytes > 2_000_000_000 ? [">2 GB de vectores: considera discos NVMe o cuantización."] : [],
    });
  },

  // 6 · SERIE TEMPORAL — almacenamiento + chunk + retención.
  "servidor.serie_temporal": (d) => {
    const t0 = Date.now();
    const pps = Number(d?.puntosPorSegundo);
    const dias = Number(d?.retencionDias);
    if (!Number.isFinite(pps) || pps <= 0) return noS("servidor.serie_temporal", t0, "«puntosPorSegundo» debe ser >0.");
    if (!Number.isFinite(dias) || dias <= 0) return noS("servidor.serie_temporal", t0, "«retencionDias» debe ser >0.");
    const bytesPunto = Number(d?.bytesPorPunto) > 0 ? Number(d.bytesPorPunto) : 32;
    const puntos = pps * dias * 86400;
    const bytes = puntos * bytesPunto;
    const intervalo = pps >= 1000 ? "1 día" : pps >= 50 ? "7 días" : "1 mes";
    return okS("servidor.serie_temporal", t0, {
      puntosTotales: puntos,
      bytesEstimados: bytes,
      intervaloChunk: intervalo,
      retencionDias: dias,
      avisos: bytes > 50_000_000_000 ? ["retención grande: activa compresión y agrega bloques viejos."] : [],
    });
  },

  // 7 · COLAS — topología + prefetch + confirmación.
  "servidor.colas": (d) => {
    const t0 = Date.now();
    const productores = Math.trunc(Number(d?.productores));
    const consumidores = Math.trunc(Number(d?.consumidores));
    if (!Number.isInteger(productores) || productores < 1) return noS("servidor.colas", t0, "«productores» debe ser entero ≥1.");
    if (!Number.isInteger(consumidores) || consumidores < 1) return noS("servidor.colas", t0, "«consumidores» debe ser entero ≥1.");
    const colas = Math.max(1, Math.ceil(productores / 2));
    const prefetch = Math.max(1, Math.min(50, Math.round(consumidores / colas)));
    const confirmacion = d?.ackManual !== false ? "manual (ack explícito)" : "automática";
    return okS("servidor.colas", t0, {
      colas,
      prefetchPorConsumidor: prefetch,
      confirmacion,
      avisos: consumidores > productores * 4 ? ["hay muchos más consumidores que productores: revisa si sobra capacidad."] : [],
    });
  },

  // 8 · OBJETOS — prefijos de bucket + ciclo de vida.
  "servidor.objetos": (d) => {
    const t0 = Date.now();
    const archivos = Math.trunc(Number(d?.archivos));
    const tamano = Number(d?.tamanoPromedioMB);
    if (!Number.isInteger(archivos) || archivos < 1) return noS("servidor.objetos", t0, "«archivos» debe ser entero ≥1.");
    if (!Number.isFinite(tamano) || tamano <= 0) return noS("servidor.objetos", t0, "«tamanoPromedioMB» debe ser >0.");
    const totalGB = (archivos * tamano) / 1024;
    return okS("servidor.objetos", t0, {
      bucket: "cerebronico-datos",
      prefijos: ["raw/", "procesado/", "backup/", "temporal/"],
      tamanoTotalGB: Math.round(totalGB * 100) / 100,
      ciclosDeVida: ["temporal/ → 7 días", "backup/ → 30 días", "raw/ → 90 días"],
      avisos: totalGB > 500 ? [">500 GB: considera replicación entre regiones o versión con S3."] : [],
    });
  },

  // 9 · BÚSQUEDA — mapping + analizador + boost por campo.
  "servidor.busqueda": (d) => {
    const t0 = Date.now();
    const campos = Array.isArray(d?.campos) ? d.campos : [];
    if (!campos.length) return noS("servidor.busqueda", t0, "no llegó «campos» (lista de {nombre, tipo}).");
    const mapping: Record<string, { type: string; analyzer?: string }> = {};
    const boosts: Record<string, number> = {};
    for (const c of campos) {
      const cn = String(c?.nombre || "").trim();
      const tipo = String(c?.tipo || "text").trim().toLowerCase();
      if (!cn) return noS("servidor.busqueda", t0, "hay un campo sin «nombre».");
      if (tipo === "texto" || tipo === "text") {
        mapping[cn] = { type: "text", analyzer: "standard" };
        boosts[cn] = cn === "titulo" || cn === "title" ? 3 : 1;
      } else if (tipo === "fecha" || tipo === "date") {
        mapping[cn] = { type: "date" };
      } else if (tipo === "numero" || tipo === "number" || tipo === "entero") {
        mapping[cn] = { type: "integer" };
      } else {
        mapping[cn] = { type: "keyword" };
      }
    }
    return okS("servidor.busqueda", t0, { mapping, boosts, avisos: [] });
  },

  // 10 · TIEMPO REAL — transporte + conexiones + backpressure.
  "servidor.realtime": (d) => {
    const t0 = Date.now();
    const clientes = Math.trunc(Number(d?.clientes));
    const mps = Number(d?.mensajesPorSegundo);
    if (!Number.isInteger(clientes) || clientes < 1) return noS("servidor.realtime", t0, "«clientes» debe ser entero ≥1.");
    if (!Number.isFinite(mps) || mps < 0) return noS("servidor.realtime", t0, "«mensajesPorSegundo» debe ser ≥0.");
    const transporte = clientes > 2000 ? "SSE (lectura masiva) + WebSocket puntual" : "WebSocket";
    const mensajesTotales = mps * clientes;
    return okS("servidor.realtime", t0, {
      transporte,
      conexiones: clientes,
      mensajesTotalesPorSegundo: mensajesTotales,
      avisos: mensajesTotales > 500_000 ? ["backpressure: usa tópicos/particiones y descarte de eventos no críticos."] : [],
    });
  },
};

// ─── Ejecución y enrutador ─────────────────────────────────────────────────

export function idEspejoServidorValido(id: string): boolean {
  return ESPEJO_POR_ID.has(id);
}

export function categoriaServidorValida(id: string): boolean {
  return CATEGORIA_POR_ID.has(id);
}

export function espejosDeCategoria(categoria: string): EspejoServidorMeta[] {
  return CATALOGO.espejos.filter((e) => e.categoria === categoria);
}

/** Ejecuta un contrato por id. Si el id no existe, lo declara (nada silencioso). */
export function ejecutarEspejoServidor(id: string, datos: unknown): ResultadoServidor {
  const t0 = Date.now();
  if (!ESPEJO_POR_ID.has(id)) {
    return { ok: false, id, ms: 0, motivo: `espejo «${id}» no existe (conocidos: ${IDS_ESPEJOS_SERVIDOR.join(", ")}).` };
  }
  const fn = EJECUTORES[id];
  if (!fn) return { ok: false, id, ms: Date.now() - t0, motivo: `«${id}» existe en el catálogo pero no tiene contrato implementado.` };
  try {
    return fn(datos);
  } catch (err: any) {
    return { ok: false, id, ms: Date.now() - t0, motivo: `contrato reventó: ${String(err?.message || err)}` };
  }
}

export interface RankingServidor {
  id: string;
  categoria: string;
  nombre: string;
  score: number;
}

export interface ResultadoSeleccion {
  ok: boolean;
  consulta?: string;
  mejor?: RankingServidor | null;
  ranking?: RankingServidor[];
  total?: number;
  motivo?: string;
}

/**
 * Selección AUTOMÁTICA del experto más adecuado según el contexto.
 * Determinista: misma consulta → misma selección. Los empates se resuelven
 * por orden de catálogo (estable). La entrada se acota por seguridad.
 */
export function seleccionarExperto(texto: unknown): ResultadoSeleccion {
  if (typeof texto !== "string") {
    return { ok: false, motivo: "la consulta debe ser texto." };
  }
  const crudo = texto.trim();
  if (!crudo) return { ok: false, motivo: "la consulta está vacía." };
  if (crudo.length > LIMITE_CONSULTA) {
    return { ok: false, motivo: `la consulta supera ${LIMITE_CONSULTA} caracteres.` };
  }

  const norm = normalizarTexto(crudo);
  const tokens = norm.split(/[^a-z0-9_]+/).filter(Boolean);

  const conScore = CATALOGO.espejos.map((e, i) => {
    let score = 0;
    for (const senal of e.senales) {
      const s = normalizarTexto(senal);
      if (!s) continue;
      if (s.includes(" ")) {
        if (norm.includes(s)) score += 2;
      } else {
        if (tokens.includes(s)) score += 2;
        else if (norm.includes(s)) score += 1;
      }
    }
    return { e, i, score };
  });

  const ordenados = conScore
    .filter((x) => x.score > 0)
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.i - b.i));

  const ranking: RankingServidor[] = ordenados.map((x) => ({
    id: x.e.id,
    categoria: x.e.categoria,
    nombre: x.e.nombre,
    score: x.score,
  }));

  const mejor: RankingServidor | null = ranking.length ? ranking[0] : null;

  return {
    ok: true,
    consulta: crudo.slice(0, 200),
    mejor,
    ranking,
    total: CATALOGO.espejos.length,
    motivo: mejor ? undefined : "sin coincidencias claras: reformula con el tipo de servidor (ej. sql, mongo, redis, grafo, vector, métricas, colas, s3, búsqueda, websocket).",
  };
}

/** Estado completo para una API (FastAPI lo lee desde el catálogo exportado). */
export function estadoEspejosServidor() {
  return {
    ok: true,
    version: VERSION_SERVIDOR,
    totalEspejos: CATALOGO.espejos.length,
    totalCategorias: CATEGORIAS_SERVIDOR.length,
    categorias: CATEGORIAS_SERVIDOR,
    espejos: CATALOGO.espejos,
    nota: CATALOGO.nota,
  };
}
