/**
 * capacidades.ts — ROUTER DE CAPACIDADES CORROBORADAS (v1.15.1)
 * ===============================================================
 * QUÉ ES: un único punto de verdad que dice, con números verificados contra el
 * código real, qué hay ACTIVO y qué está solo DECLARADO. Responde a la pregunta
 * que el proyecto se hizo desde el informe del motor: «¿cuánto de lo que decimos
 * que funciona, funciona de verdad?».
 *
 * FUENTES (todas leídas en caliente, no hardcodeadas):
 *   · skills      → catalogoHonesto (evidencia en disco)
 *   · herramientas→ toolRegistry (registro extensible)
 *   · consejo     → ejecutoresConsejo (ejecutor real vs declarado)
 *   · rutas       → contrato-rutas.json (superficie)
 *   · plugins     → carpeta extensions/ (manifiestos cn.*)
 */
import type express from "express";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { auditarCatalogo, resumenHonesto } from "../../src/engine/catalogoHonesto";
import { getAllToolNames, listToolPacks } from "../../src/engine/toolRegistry";
import { resumenEjecutores } from "../../src/engine/ejecutoresConsejo";

function contarPlugins(): number {
  try {
    return readdirSync(join(process.cwd(), "extensions"), { withFileTypes: true }).filter(
      (e) => e.isDirectory() && e.name.startsWith("cn.")
    ).length;
  } catch {
    return 0;
  }
}

function leerRutas(): number {
  try {
    const c = JSON.parse(readFileSync(join(process.cwd(), "contrato-rutas.json"), "utf8"));
    return Number(c?.total ?? 0);
  } catch {
    return 0;
  }
}

export function registrarCapacidades(app: express.Express): void {
  app.get("/api/capacidades", (_req, res) => {
    const skills = resumenHonesto(auditarCatalogo((ruta) => existsSync(ruta)));
    const herramientas = getAllToolNames();
    res.json({
      ok: true,
      skills,
      herramientas: {
        reales: herramientas.length,
        packs: listToolPacks().map((p) => ({ id: p.id, herramientas: p.toolCount })),
      },
      consejo: resumenEjecutores(),
      rutas: leerRutas(),
      plugins: contarPlugins(),
    });
  });
}
