#!/usr/bin/env node
/**
 * quirofano-cli.mjs — CIRUGÍA SEGURA DESDE LA LÍNEA DE ÓRDENES (v1.15.1)
 * ======================================================================
 * QUÉ ES: el orquestador que cierra el bucle «generar → verificar → corregir →
 * revertir» sin depender de memoria humana. El motor del Quirófano
 * (src/engine/quirofano.ts) ya juzga cada escritura dentro del IDE; esto es su
 * par desde la terminal, para cuando los cambios vienen de fuera (un agente, un
 * script, un editor).
 *
 * SUBCOMANDOS
 *   iniciar  [motivo]   → hace un snapshot del árbol fuente (src/, server/, etc.)
 *   estado              → lista los snapshots que hay en .revisiones/
 *   verificar           → corre scripts/validar.mjs (tipos + TODAS las suites)
 *                          y deja informe.json + informe.md en .revisiones/last/
 *   revertir [id]       → restaura un snapshot (el último si no se da id)
 *   corregir [motivo]   → iniciar + verificar. Si sale rojo, opcionalmente
 *                          revierte con --auto-revertir y SIEMPRE apunta al
 *                          informe para que el agente lea el error REAL y corrija.
 *
 * POR QUÉ EXISTE
 * Un corrector que no ve la salida del compilador es un corrector a ciegas: corrige
 * lo que supone, no lo que falla. Este script convierte el fallo en un informe
 * estructurado (ruta:línea:mensaje) que el agente puede LEER, y deja el snapshot
 * para que el fallo sea reversible. Sin ambas cosas, «corrección segura» es una frase.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const DIR_REVISIONES = path.join(RAIZ, ".revisiones");
const DIR_LAST = path.join(DIR_REVISIONES, "last");

/** Carpetas fuente que se copian al snapshot (nunca node_modules, dist, .cerebro-db). */
const CARPETAS = ["src", "server", "scripts", "tests", "public", "extensions"];
/** Archivos sueltos de configuración/arranque que también se copian. */
const ARCHIVOS = ["package.json", "tsconfig.json", "vite.config.ts", "index.html", "package-lock.json"];

const VERDE = "\x1b[32m";
const ROJO = "\x1b[31m";
const GRIS = "\x1b[90m";
const AMARILLO = "\x1b[33m";
const FIN = "\x1b[0m";

/** Quita los códigos de color ANSI para que el informe quede legible en texto plano. */
function limpiar(s) {
  return String(s || "").replace(/\x1b\[[0-9;]*m/g, "");
}

function selloId(ahora = Date.now()) {
  const d = new Date(ahora);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function listarSnapshots() {
  if (!existsSync(DIR_REVISIONES)) return [];
  return readdirSync(DIR_REVISIONES)
    .filter((n) => /^\d{8}-\d{6}$/.test(n))
    .sort()
    .reverse();
}

function escribirManifiesto(dirSnap, id, motivo, archivos) {
  writeFileSync(
    path.join(dirSnap, "manifesto.json"),
    JSON.stringify({ id, motivo: String(motivo || "sin motivo declarado"), creado: Date.now(), archivos }, null, 2)
  );
}

/** Cuenta archivos y bytes de un directorio, para el manifiesto (sin guardar el árbol entero). */
function inventario(dir) {
  let archivos = 0;
  let bytes = 0;
  const andar = (d) => {
    for (const nombre of readdirSync(d)) {
      const p = path.join(d, nombre);
      const s = statSync(p);
      if (s.isDirectory()) andar(p);
      else {
        archivos += 1;
        bytes += s.size;
      }
    }
  };
  andar(dir);
  return { archivos, bytes };
}

function hacerSnapshot(motivo) {
  const id = selloId();
  const destino = path.join(DIR_REVISIONES, id);
  mkdirSync(destino, { recursive: true });

  const resumen = [];
  for (const carpeta of CARPETAS) {
    const origen = path.join(RAIZ, carpeta);
    if (!existsSync(origen)) continue;
    cpSync(origen, path.join(destino, carpeta), { recursive: true });
    const inv = inventario(origen);
    resumen.push(`${carpeta}/ (${inv.archivos} archivos, ${(inv.bytes / 1024).toFixed(0)} KB)`);
  }
  for (const archivo of ARCHIVOS) {
    const origen = path.join(RAIZ, archivo);
    if (!existsSync(origen)) continue;
    cpSync(origen, path.join(destino, archivo));
    resumen.push(archivo);
  }

  escribirManifiesto(destino, id, motivo, resumen);
  return { id, destino, resumen };
}

function restaurarSnapshot(id) {
  const snap = path.join(DIR_REVISIONES, id);
  if (!existsSync(snap)) return { ok: false, motivo: `no existe el snapshot «${id}»` };

  // Primero se retira lo actual y se copia el snapshot encima. `rmSync` solo
  // toca las carpetas fuente listadas, nunca node_modules/dist.
  const restaurados = [];
  for (const carpeta of CARPETAS) {
    const origen = path.join(snap, carpeta);
    if (!existsSync(origen)) continue;
    const destino = path.join(RAIZ, carpeta);
    rmSync(destino, { recursive: true, force: true });
    cpSync(origen, destino, { recursive: true });
    restaurados.push(`${carpeta}/`);
  }
  for (const archivo of ARCHIVOS) {
    const origen = path.join(snap, archivo);
    if (!existsSync(origen)) continue;
    cpSync(origen, path.join(RAIZ, archivo));
    restaurados.push(archivo);
  }
  return { ok: true, restaurados };
}

function correrValidar() {
  const validador = path.join(RAIZ, "scripts", "validar.mjs");
  const r = spawnSync(process.execPath, [validador], {
    cwd: RAIZ,
    encoding: "utf-8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const salida = limpiar(String(`${r.stdout || ""}\n${r.stderr || ""}`));
  const exitCode = r.status === null ? 1 : r.status;
  return { exitCode, salida };
}

/** Extrae del volcado las líneas que de verdad señalan un fallo (ruta:línea:mensaje). */
function extraerErrores(salida) {
  const lineas = [];
  for (const l of salida.split("\n")) {
    if (/error TS\d+/.test(l)) lineas.push(l.trim());
    else if (/FALLO|PÉRDIDA SILENCIOSA|la suite NO llegó a ejecutarse|Cannot find module|is not a function|VEREDICTO: HAY FALLOS|No encuentro|npm install|faltan las dependencias/.test(l)) lineas.push(l.trim());
  }
  return lineas.slice(0, 60);
}

function escribirInforme(exitCode, salida, motivo) {
  mkdirSync(DIR_LAST, { recursive: true });
  const errores = extraerErrores(salida);
  const ok = exitCode === 0;

  const resumen = ok
    ? "TODO CORRECTO"
    : errores.length > 0
    ? `${errores.length} pista(s) de error en la salida`
    : `la verificación terminó con código ${exitCode} sin pistas parseadas — ver salida completa`;

  const json = {
    fecha: new Date().toISOString(),
    ok,
    exitCode,
    motivo: String(motivo || ""),
    errores,
    resumen,
  };
  writeFileSync(path.join(DIR_LAST, "informe.json"), JSON.stringify(json, null, 2));

  const md = [
    `# Informe de verificación — ${json.fecha}`,
    "",
    `**Veredicto:** ${ok ? "✅ TODO CORRECTO" : "⛔ HAY FALLOS"}`,
    "",
    "## Errores detectados (para corregir)",
    "",
  ];
  if (errores.length === 0) md.push("(ninguno)", "");
  else for (const e of errores) md.push(`- \`${e}\``);
  md.push("", "## Salida completa", "", "```", salida.trim(), "```", "");
  writeFileSync(path.join(DIR_LAST, "informe.md"), md.join("\n"));

  return json;
}

/** Apunta la lección al registro persistente para no repetir el fallo. */
function anotarLeccion(motivo, json) {
  const registro = path.join(DIR_REVISIONES, "lecciones.md");
  const encabezado = existsSync(registro) ? "" : "# Lecciones de verificación\n\n> Cada fallo apunta aquí su causa para no repetirla.\n\n";
  const linea = `- ${json.fecha} · ${json.ok ? "verde" : `rojo (${json.errores.length} pista(s))`} · ${motivo || "sin motivo"}`;
  try {
    writeFileSync(registro, encabezado + linea + "\n", { flag: "a" });
  } catch {
    /* el registro no puede impedir el veredicto */
  }
}

function uso() {
  console.log(`
CIRUGÍA SEGURA · CerebroNico IDE

  node scripts/quirofano-cli.mjs iniciar [motivo]
  node scripts/quirofano-cli.mjs estado
  node scripts/quirofano-cli.mjs verificar [motivo]
  node scripts/quirofano-cli.mjs revertir [id]
  node scripts/quirofano-cli.mjs corregir [motivo] [--auto-revertir]

  corregir = iniciar + verificar. Si sale rojo, lee .revisiones/last/informe.md,
  corrige y vuelve a ejecutar «verificar». Con --auto-revertir, un rojo restaura
  el snapshot automáticamente.
`);
}

const [, , cmd, ...rest] = process.argv;
const autoRevertir = rest.includes("--auto-revertir");
const args = rest.filter((a) => !a.startsWith("--"));
const motivo = args.join(" ");

function main() {
  switch (cmd) {
    case "iniciar": {
      const { id, destino, resumen } = hacerSnapshot(motivo);
      console.log(`${VERDE}Snapshot ${id} listo.${FIN}`);
      console.log(`  ${GRIS}${destino}${FIN}`);
      for (const r of resumen) console.log(`    ${GRIS}· ${r}${FIN}`);
      console.log(`  Para revertir: ${AMARILLO}node scripts/quirofano-cli.mjs revertir ${id}${FIN}`);
      return;
    }

    case "estado": {
      const snaps = listarSnapshots();
      if (snaps.length === 0) {
        console.log(`${GRIS}No hay snapshots todavía.${FIN}`);
        return;
      }
      console.log(`${snaps.length} snapshot(s):`);
      for (const id of snaps) {
        const m = JSON.parse(readFileSync(path.join(DIR_REVISIONES, id, "manifesto.json"), "utf8"));
        console.log(`  ${GRIS}· ${id}${FIN}  ${m.motivo || ""}`);
      }
      return;
    }

    case "verificar": {
      console.log(`Corriendo verificación (tipos + suites)…`);
      const { exitCode, salida } = correrValidar();
      const json = escribirInforme(exitCode, salida, motivo);
      anotarLeccion(motivo, json);
      console.log(`\n${json.resumen}`);
      console.log(`  Informe: ${GRIS}.revisiones/last/informe.md${FIN}`);
      console.log(`  Errores: ${json.ok ? VERDE : ROJO}${json.errores.length}${FIN}`);
      process.exitCode = json.ok ? 0 : 1;
      return;
    }

    case "revertir": {
      const id = args[0] || listarSnapshots()[0];
      if (!id) {
        console.log(`${ROJO}No hay snapshot que revertir.${FIN}`);
        process.exitCode = 1;
        return;
      }
      const res = restaurarSnapshot(id);
      if (!res.ok) {
        console.log(`${ROJO}${res.motivo}${FIN}`);
        process.exitCode = 1;
        return;
      }
      console.log(`${VERDE}Snapshot ${id} restaurado.${FIN}`);
      for (const r of res.restaurados) console.log(`  ${GRIS}· ${r}${FIN}`);
      console.log(`  Ahora corre: ${AMARILLO}node scripts/quirofano-cli.mjs verificar${FIN}`);
      return;
    }

    case "corregir": {
      const { id } = hacerSnapshot(motivo || "corregir");
      console.log(`${GRIS}Snapshot ${id}.${FIN}`);
      const { exitCode, salida } = correrValidar();
      const json = escribirInforme(exitCode, salida, motivo);
      anotarLeccion(motivo, json);

      if (json.ok) {
        console.log(`${VERDE}VERDE: el cambio pasa la verificación completa.${FIN}`);
        return;
      }

      console.log(`${ROJO}ROJO: ${json.errores.length} pista(s) de error.${FIN}`);
      console.log(`  Informe para el corrector: ${AMARILLO}.revisiones/last/informe.md${FIN}`);

      if (autoRevertir) {
        const res = restaurarSnapshot(id);
        console.log(`${AMARILLO}Auto-revertido al snapshot ${id}${FIN} (${res.restaurados.length} rutas restauradas).`);
      } else {
        console.log(`  ${GRIS}El snapshot ${id} queda disponible para revertir cuando quieras.${FIN}`);
      }
      process.exitCode = 1;
      return;
    }

    default:
      uso();
      process.exitCode = 1;
  }
}

main();
