/**
 * espejosServidor.ts — ROUTER DE ESPEJOS POR SERVIDOR DE DATOS (v1.15.1)
 * =======================================================================
 * QUÉ ES: expone el catálogo de «espejos por servidor» (relacional, documental,
 * clave-valor, grafo, vectorial, series, colas, objetos, búsqueda, realtime)
 * como rutas HTTP reales.
 *
 * POR QUÉ EXISTE: el motor `src/engine/reflejo/espejosServidor.ts` existía y
 * estaba testado (espejosServidor.test.ts), pero NADIE lo llamaba: era un
 * módulo huérfano. Aquí se enchufa como router, siguiendo el patrón de la Fase 2
 * (se extrae a `server/routers/` y no se hace crecer el monolito inline).
 *
 * RUTAS (todas de solo lectura / ejecución determinista):
 *   GET  /api/espejos-servidor                 → estado completo del catálogo
 *   GET  /api/espejos-servidor/categoria/:id   → espejos de una categoría
 *   POST /api/espejos-servidor/seleccionar     → elige el experto más adecuado
 *   POST /api/espejos-servidor/ejecutar        → ejecuta un espejo por id
 */
import type express from "express";
import {
  estadoEspejosServidor,
  seleccionarExperto,
  ejecutarEspejoServidor,
  espejosDeCategoria,
  categoriaServidorValida,
} from "../../src/engine/reflejo/espejosServidor";

export function registrarEspejosServidor(app: express.Express): void {
  // Catálogo completo: también lo consume el lado FastAPI desde el export.
  app.get("/api/espejos-servidor", (_req, res) => {
    res.json(estadoEspejosServidor());
  });

  // Espejos de una categoría concreta (relacional, grafo, vectorial, …).
  app.get("/api/espejos-servidor/categoria/:id", (req, res) => {
    const categoria = String(req.params.id || "");
    if (!categoriaServidorValida(categoria)) {
      res.status(404).json({ ok: false, motivo: `categoría «${categoria}» desconocida.` });
      return;
    }
    res.json({ ok: true, categoria, espejos: espejosDeCategoria(categoria) });
  });

  // Selección AUTOMÁTICA del experto más adecuado para una consulta en texto.
  app.post("/api/espejos-servidor/seleccionar", (req, res) => {
    res.json(seleccionarExperto(req.body?.texto));
  });

  // Ejecuta un espejo por id (sql, mongo, redis, …) con sus datos.
  app.post("/api/espejos-servidor/ejecutar", (req, res) => {
    const { id, datos } = req.body ?? {};
    res.json(ejecutarEspejoServidor(String(id ?? ""), datos));
  });
}
