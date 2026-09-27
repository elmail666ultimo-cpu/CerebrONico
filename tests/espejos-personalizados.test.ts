/**
 * espejos-personalizados.test.ts — Reflejo v3.0 · PASO 2
 * =====================================================
 * Verifica el cargador de espejos personalizados sin arrancar el server.
 * Crea un espejo de prueba en un directorio temporal, lo carga, lo ejecuta,
 * y comprueba que `ejecutarEntidad` lo encuentra vía el pool.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cargarEspejosPersonalizados,
  inicializarPool,
  poolEspejos,
  poolListo,
  buscarEnPool,
  agregarAlPool,
  quitarDelPool,
  catalogoPersonalizados,
} from "../src/engine/reflejo/cargadorEspejos";
import { ejecutarEntidad } from "../src/engine/reflejo/consejo";
import { planificadorPorLeyes, estadoOrquestador, cargarLeyesAprendidas, LEYES_REFLEJO } from "../src/engine/reflejo/orquestador";

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(nombre + (detalle ? " :: " + detalle : ""));
}

// ─── Setup: directorio temporal con un espejo de música ─────────────────────
const dirTemp = mkdtempSync(join(tmpdir(), "cerebronico-espejos-test-"));
const espejoMjsContenido = `
// Espejo de prueba: devuelve la frecuencia de una nota musical (A4=440).
const A4 = 440;
const NOTAS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function ejecutar(datos) {
  const t0 = Date.now();
  const nota = String(datos?.nota || "A").toUpperCase();
  const octava = Number(datos?.octava ?? 4);
  if (!/^[A-G]#?$/.test(nota)) return { ok: false, entidad: "espejo.musica", ms: Date.now() - t0, motivo: "nota inválida" };
  if (!Number.isInteger(octava) || octava < 0 || octava > 8) return { ok: false, entidad: "espejo.musica", ms: Date.now() - t0, motivo: "octava fuera de rango" };
  const semitonos = NOTAS.indexOf(nota) + (octava + 1) * 12;
  const freq = A4 * Math.pow(2, (semitonos - 69) / 12);
  return {
    ok: true,
    entidad: "espejo.musica",
    salida: JSON.stringify({ nota: nota + octava, frecuenciaHz: Math.round(freq * 100) / 100, midi: semitonos }),
    ms: Date.now() - t0,
  };
}
export const meta = {
  id: "espejo.musica",
  nombre: "Espejo · Música",
  familia: "personalizada",
  descripcion: "Frecuencia de una nota en temperamento igual (A4=440)",
};
`;
const espejoDir = join(dirTemp, "espejo.musica");
mkdirSync(espejoDir, { recursive: true });
writeFileSync(join(espejoDir, "espejo.musica.mjs"), espejoMjsContenido, "utf8");
const manifest = {
  version: "1.0",
  espejos: [{
    id: "espejo.musica",
    ruta: "espejo.musica.mjs",
    familia: "personalizada",
    descripcion: "Frecuencia de una nota en temperamento igual (A4=440)",
    autor: "test",
    version: "1.0.0",
  }],
};
writeFileSync(join(espejoDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

// Manifest global en la raíz del dir temporal (cargadorEspejos lee este)
writeFileSync(join(dirTemp, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
writeFileSync(join(dirTemp, "espejo.musica.mjs"), espejoMjsContenido, "utf8");

// ─── Tests ─────────────────────────────────────────────────────────────────

// 1) El directorio existe y tiene manifest.json
comprobar("directorio temporal creado", existsSync(dirTemp));
comprobar("manifest.json creado", existsSync(join(dirTemp, "manifest.json")));
comprobar("espejo.musica.mjs creado", existsSync(join(dirTemp, "espejo.musica.mjs")));

// 2) Cargar los espejos personalizados (async por el import dinámico)
const r = await cargarEspejosPersonalizados(dirTemp);
comprobar("carga: ok=true", r.ok === true, JSON.stringify(r.fallidos));
comprobar("carga: 1 espejo cargado", r.cargados.length === 1, `esperado 1, real ${r.cargados.length}`);
comprobar("carga: 0 fallidos", r.fallidos.length === 0, JSON.stringify(r.fallidos));
comprobar("carga: el espejo cargado es espejo.musica", r.cargados[0]?.id === "espejo.musica");
comprobar("carga: nombre del espejo es correcto", r.cargados[0]?.nombre === "Espejo · Música");

// 3) Inicializar el pool (necesario para que ejecutarEntidad lo encuentre)
await inicializarPool(dirTemp);
comprobar("pool: inicializado (poolListo=true)", poolListo() === true);
comprobar("pool: 1 espejo", poolEspejos().length === 1);

// 4) Buscar en el pool
const encontrado = buscarEnPool("espejo.musica");
comprobar("buscarEnPool: encuentra espejo.musica", !!encontrado);
comprobar("buscarEnPool: no encuentra espejo.inexistente", !buscarEnPool("espejo.inexistente"));

// 5) Ejecutar el espejo directamente (vía buscarEnPool)
const r5 = encontrado?.ejecutar({ nota: "A", octava: 4 });
comprobar("ejecutar espejo.musica A4: ok", r5?.ok === true);
const salida5 = JSON.parse(r5?.salida || "{}");
comprobar("ejecutar espejo.musica A4: frecuencia = 440 Hz", salida5.frecuenciaHz === 440, `real = ${salida5.frecuenciaHz}`);

const r5b = encontrado?.ejecutar({ nota: "C", octava: 4 });
const salida5b = JSON.parse(r5b?.salida || "{}");
comprobar("ejecutar espejo.musica C4: frecuencia ≈ 261.63 Hz", Math.abs(salida5b.frecuenciaHz - 261.63) < 0.01, `real = ${salida5b.frecuenciaHz}`);

const r5c = encontrado?.ejecutar({ nota: "X", octava: 4 });
comprobar("ejecutar espejo.musica nota inválida: ok=false con motivo", r5c?.ok === false && !!r5c?.motivo);

// 6) Ejecutar vía ejecutarEntidad (el camino real que usa el motor)
const r6 = ejecutarEntidad("espejo.musica", { nota: "A", octava: 5 });
comprobar("ejecutarEntidad(espejo.musica): ok=true", r6.ok === true);
const salida6 = JSON.parse(r6.salida || "{}");
comprobar("ejecutarEntidad(espejo.musica) A5: frecuencia = 880 Hz", salida6.frecuenciaHz === 880, `real = ${salida6.frecuenciaHz}`);

// 7) ejecutarEntidad con id inexistente sigue dando motivo claro
const r7 = ejecutarEntidad("espejo.inexistente", {});
comprobar("ejecutarEntidad(espejo.inexistente): ok=false con motivo", r7.ok === false && !!r7.motivo);

// 8) Catálogo público devuelve el espejo cargado
const cat = catalogoPersonalizados();
comprobar("catalogoPersonalizados: ok=true", cat.ok === true);
comprobar("catalogoPersonalizados: total = 1", cat.total === 1);
comprobar("catalogoPersonalizados: id = espejo.musica", cat.espejos[0]?.id === "espejo.musica");

// 9) agregarAlPool + quitarDelPool
const espejoPrueba = {
  id: "espejo.prueba",
  nombre: "Espejo · Prueba",
  familia: "personalizada",
  descripcion: "espejo de prueba",
  ruta: "/dev/null",
  version: "1.0.0",
  ejecutar: () => ({ ok: true, entidad: "espejo.prueba", salida: "{}", ms: 0 }),
};
agregarAlPool(espejoPrueba);
comprobar("agregarAlPool: 2 espejos en pool", poolEspejos().length === 2);
comprobar("agregarAlPool: encuentra espejo.prueba", !!buscarEnPool("espejo.prueba"));
quitarDelPool("espejo.prueba");
comprobar("quitarDelPool: 1 espejo en pool", poolEspejos().length === 1);
comprobar("quitarDelPool: no encuentra espejo.prueba", !buscarEnPool("espejo.prueba"));

// 10) Estado del orquestador sigue funcionando (no se rompió)
const est = estadoOrquestador();
comprobar("estadoOrquestador: ok=true", est.ok === true);
comprobar("estadoOrquestador: 16 leyes curadas", est.leyesCuradas === LEYES_REFLEJO.length);

// 11) planificadorPorLeyes sigue funcionando (no se rompió)
const p = planificadorPorLeyes("convierte 5 km a m");
comprobar("planificadorPorLeyes: convierte 5 km a m → espejo.fisicos", p.ok && p.espejo === "espejo.fisicos");

// ─── Limpieza ──────────────────────────────────────────────────────────────
try { rmSync(dirTemp, { recursive: true, force: true }); } catch {}

// ─── Resumen ───────────────────────────────────────────────────────────────
console.log("");
console.log("═══ ESPEJOS PERSONALIZADOS: " + correctas + " correctas · " + fallos.length + " fallidas ═══");
if (fallos.length > 0) {
  for (const f of fallos) console.log("  FALLO → " + f);
  process.exit(1);
}
