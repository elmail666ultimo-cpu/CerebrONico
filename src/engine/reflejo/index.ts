/**
 * reflejo/index.ts — EL REFLEJO LISTO PARA EL SERVIDOR (v3.0)
 * ===========================================================
 * Carga las dos tablas generadas (`scripts/gen-tablas-v3.mjs`) y expone el
 * pensador. Los JSON se IMPORTAN (no `readFileSync` con rutas relativas):
 * así viajan dentro de `dist/server.mjs` al empaquetar con esbuild y no
 * existe la posibilidad de «en producción no encuentra la tabla».
 *
 * v3.0 — Usa tablas v3 (lite 14.645 entradas / max 82.459), con 22 acciones,
 * 16 plantillas, units y fechas. Las tablas v2.x quedan como backup en el
 * mismo directorio (tablas-lite.json / tablas-max.json) por si hace falta
 * volver atrás sin recompilar.
 */
import { pensar, type Tablas, type ResultadoReflejo } from "../cerebroReflejo";
import lite from "./tablas-lite-v3.json";
import max from "./tablas-max-v3.json";

export const TABLAS: Record<"lite" | "max", Tablas> = {
  lite: lite as unknown as Tablas,
  max: max as unknown as Tablas,
};

export function pensarReflejo(frase: string, modo: "lite" | "max" = "lite"): ResultadoReflejo {
  return pensar(frase, TABLAS[modo] ?? TABLAS.lite);
}

/** Qué hay cargado y cuánto pesa — para /api/reflejo/estado y para los tests. */
export function estadoReflejo() {
  return {
    ok: true,
    motor: "reflejo v3.0",
    modos: {
      lite: { entradas: Object.keys(TABLAS.lite.lexicon).length, aproxKB: Math.round(JSON.stringify(TABLAS.lite).length / 1024) },
      max: { entradas: Object.keys(TABLAS.max.lexicon).length, aproxKB: Math.round(JSON.stringify(TABLAS.max).length / 1024) },
    },
    // Reflejo v3.0 — expone catálogos para que el chat y la UI los puedan mostrar.
    acciones: TABLAS.max.acciones ?? [
      "plan", "convertir", "imagen", "creacion", "abrir", "calculo",
      "analizar", "explicar", "resumir", "traducir", "comparar",
      "listar", "buscar", "ordenar", "filtrar", "contar",
      "testear", "documentar", "instalar", "desplegar",
      "refactorizar", "optimizar",
    ],
    tiposPlantilla: TABLAS.max.tiposPlantilla ?? [],
    unidades: TABLAS.max.unidades ?? [],
    conectoresPlan: ["y luego", "después de eso", "y después", "luego", "mientras (paralelo)", "si falla", "y al final", "cuando termines"],
    nota: "Cero filtro de contenido: el único 'no' es estructural (no entender lleva motivo). v3.0: 22 acciones, 16 plantillas, units, fechas, conectores de plan avanzados.",
  };
}

