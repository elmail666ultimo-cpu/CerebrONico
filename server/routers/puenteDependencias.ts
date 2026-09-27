/**
 * puenteDependencias.ts — ROUTER DEL PLAN DE DEPENDENCIAS DEL PUENTE (v1.15.1)
 * =============================================================================
 * QUÉ ES: expone el planificador de dependencias del Puente PC (motor en
 * `src/engine/capacidadesPuente.ts`). Ese módulo existía y estaba testado
 * (puente.test.ts), pero NADIE lo llamaba: era un módulo huérfano.
 *
 * RUTAS (solo lectura / deterministas):
 *   GET  /api/puente/requisitos  → catálogo de requisitos del puente
 *   POST /api/puente/plan        → plan a partir de lo comprobado { presentes }
 *
 * IMPORTANTE (regla dura del motor): `planDeDependencias` devuelve
 * `requiereConfirmacion: true` mientras haya algo instalable pendiente. Este
 * router NUNCA instala nada: solo devuelve el plan y los comandos PROPUESTOS
 * para que el lector decida. Nada se descarga sin confirmación explícita.
 */
import type express from "express";
import {
  REQUISITOS_PUENTE,
  planDeDependencias,
  comandosPropuestos,
} from "../../src/engine/capacidadesPuente";

export function registrarPuenteDependencias(app: express.Express): void {
  // Catálogo de requisitos (qué necesita el puente, cuánto pesa, criticidad).
  app.get("/api/puente/requisitos", (_req, res) => {
    res.json({ ok: true, total: REQUISITOS_PUENTE.length, requisitos: REQUISITOS_PUENTE });
  });

  // Plan construido a partir de lo que ya está comprobado. `presentes` es un
  // mapa id → booleano; lo que no venga se trata como NO comprobado.
  app.post("/api/puente/plan", (req, res) => {
    const presentes = (req.body?.presentes ?? {}) as Record<string, boolean>;
    const plan = planDeDependencias(presentes);
    res.json({ ok: true, plan, comandos: comandosPropuestos(plan) });
  });
}
