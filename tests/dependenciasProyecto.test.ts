/**
 * tests/dependenciasProyecto.test.ts — REGRESIÓN del sandbox que no arranca
 * ========================================================================
 * Se ejecuta con:  npx tsx tests/dependenciasProyecto.test.ts
 *
 * El caso que lo motivó, literal, sacado del aviso que vio el usuario:
 *
 *     [plugin:vite:import-analysis] Failed to resolve import "jspdf" from
 *     "src/services/pdfReportService.ts"
 *
 * El código generado importaba `jspdf` y `jspdf-autotable`; el `package.json`
 * del proyecto no los declaraba y nadie los instaló. La autocomprobación tiene
 * que detectarlo ANTES de arrancar, porque el proceso de Vite no muere: sigue
 * vivo sirviendo el aviso, así que la auto-reparación por «proceso muerto»
 * nunca se entera.
 */

import {
  extraerPaquetesExternos,
  extraerPaquetesConOrigen,
  nombreDePaquete,
  paquetesFaltantes,
  declaradosSinInstalar,
  comandoInstalacion,
  describirFaltantes,
  saludDePaquete,
  auditarInstalacion,
  instalacionSana,
  type DiscoDeAuditoria,
} from "../src/engine/dependenciasProyecto";

let pasadas = 0;
let falladas = 0;

function afirmar(titulo: string, condicion: boolean, detalle = ""): void {
  if (condicion) {
    pasadas++;
  } else {
    falladas++;
    console.error(`  ✘ ${titulo}\n      ${detalle}`);
  }
}

const archivo = (path: string, content: string) => ({ path, content });

/* ------------------------------------------------------------------ */
console.log("\n1. Extracción de paquetes externos");

{
  const ficheros = [
    archivo("src/services/pdfReportService.ts", [
      'import { jsPDF } from "jspdf";',
      'import autoTable from "jspdf-autotable";',
      'export const PAGE = { W: 210, H: 297, M: 18 };',
    ].join("\n")),
  ];
  const encontrados = extraerPaquetesExternos(ficheros);
  afirmar("★ detecta jspdf (el caso que rompió el sandbox)", encontrados.includes("jspdf"), JSON.stringify(encontrados));
  afirmar("★ y jspdf-autotable", encontrados.includes("jspdf-autotable"), JSON.stringify(encontrados));
  afirmar("no inventa paquetes", encontrados.length === 2, JSON.stringify(encontrados));
}

{
  const ficheros = [
    archivo("src/a.ts", 'import React from "react";'),
    archivo("src/b.tsx", 'import { useState } from "react";'),
    archivo("src/c.ts", 'import "./estilos.css";'),
    archivo("src/d.tsx", 'import Boton from "../components/Boton";'),
    archivo("src/e.ts", 'import x from "/src/alias";'),
    archivo("src/f.tsx", 'import z from "react-dom/client";'),
    archivo("src/g.ts", 'const p = import("chart.js");'),
    archivo("src/h.ts", 'const q = require("sqlite3");'),
    archivo("src/i.ts", 'import "reflect-metadata";'),
    archivo("src/j.ts", 'import fs from "fs";'),
    archivo("src/k.mjs", 'import { cosas } from "@scope/paquete/sub/ruta";'),
  ];
  const p = extraerPaquetesExternos(ficheros);
  for (const esperado of ["react", "react-dom", "chart.js", "sqlite3", "reflect-metadata", "@scope/paquete"]) {
    afirmar(`encuentra «${esperado}»`, p.includes(esperado), JSON.stringify(p));
  }
  afirmar("no cuenta las rutas relativas", !p.some((x) => x.startsWith(".")), JSON.stringify(p));
  afirmar("no cuenta la ruta absoluta del proyecto", !p.includes("src"), JSON.stringify(p));
  afirmar("★ no cuenta los internos de Node (fs)", !p.includes("fs"), JSON.stringify(p));
  afirmar("sube la ruta a un subpaquete al nombre del paquete", p.includes("react-dom") && !p.includes("react-dom/client"), JSON.stringify(p));
}

{
  const p = extraerPaquetesExternos([
    archivo("src/x.ts", 'import a from "node:fs";\nimport b from "https://cdn.test/x.mjs";\nimport c from "data:text/js,x";\nimport d from "$lib/util";'),
  ]);
  afirmar("descarta node:, https:, data: y los alias de framework", p.length === 0, JSON.stringify(p));
}

{
  afirmar("nombre de paquete con ámbito", nombreDePaquete("@scope/pkg/a/b") === "@scope/pkg", String(nombreDePaquete("@scope/pkg/a/b")));
  afirmar("un @ suelto no es paquete", nombreDePaquete("@") === null, String(nombreDePaquete("@")));
  afirmar("un punto suelto no es paquete", nombreDePaquete(".") === null);
}

/* ------------------------------------------------------------------ */
console.log("\n2. Comparación con lo que hay instalado");

const FUENTES = [
  archivo("src/services/pdfReportService.ts", 'import { jsPDF } from "jspdf";\nimport autoTable from "jspdf-autotable";'),
  archivo("src/App.tsx", 'import React from "react";\nimport logo from "./logo.svg";'),
];

{
  // El escenario real: react está declarado e instalado; jspdf no existe.
  const faltantes = paquetesFaltantes(FUENTES, {
    declarados: ["react", "react-dom"],
    estaInstalado: (p) => p === "react" || p === "react-dom",
  });
  afirmar("★ señala jspdf y jspdf-autotable como faltantes", faltantes.join(",") === "jspdf,jspdf-autotable", JSON.stringify(faltantes));
}

{
  const faltantes = paquetesFaltantes(FUENTES, { declarados: ["react", "jspdf", "jspdf-autotable"], estaInstalado: () => true });
  afirmar("si ya están declarados, no pide nada", faltantes.length === 0, JSON.stringify(faltantes));
}

{
  // Declarado pero NO instalado: NO entra en `faltantes` (no hay que añadirlo
  // a package.json ni reescribir su versión con --save). Se informa aparte,
  // porque el remedio es el `npm install` normal.
  const entorno = { declarados: ["react", "jspdf"], estaInstalado: (p: string) => p === "react" };
  const faltantes = paquetesFaltantes(FUENTES, entorno);
  afirmar("declarado sin instalar NO se añade con --save", !faltantes.includes("jspdf"), JSON.stringify(faltantes));
  afirmar("no declarado sigue faltando", faltantes.join(",") === "jspdf-autotable", JSON.stringify(faltantes));

  const sinInstalar = declaradosSinInstalar(FUENTES, entorno);
  afirmar("★ pero sí se informa como declarado-sin-instalar", sinInstalar.join(",") === "jspdf", JSON.stringify(sinInstalar));
  afirmar("y no repite lo que ya está instalado", !sinInstalar.includes("react"), JSON.stringify(sinInstalar));
}

{
  // Instalado como dependencia transitiva pero sin declarar: no tocar.
  const faltantes = paquetesFaltantes(FUENTES, { declarados: ["react"], estaInstalado: () => true });
  afirmar("instalado sin declarar no se toca", faltantes.length === 0, JSON.stringify(faltantes));
}

/* ------------------------------------------------------------------ */
console.log("\n3. El comando y el mensaje");

{
  afirmar("sin faltantes no hay comando", comandoInstalacion([]) === null);
  const cmd = comandoInstalacion(["jspdf", "jspdf-autotable"]);
  afirmar("★ el comando nombra los paquetes exactos", cmd === "npm install --save --no-audit --no-fund jspdf jspdf-autotable", String(cmd));
  afirmar("★ no es un `npm install` a secas (que dispararía watchers y reinstalaría todo)", cmd !== "npm install", String(cmd));
  afirmar("guarda en package.json para no repetirlo en cada arranque", (cmd || "").includes("--save"));
}

{
  afirmar("sin faltantes no hay mensaje", describirFaltantes([]) === "");
  const m = describirFaltantes(["jspdf", "jspdf-autotable"]);
  afirmar("el mensaje dice cuántos y cuáles", m.includes("2 paquete(s)") && m.includes("jspdf"), m);
  const largo = describirFaltantes(["a", "b", "c", "d", "e", "f", "g", "h"]);
  afirmar("con muchos, resume en vez de soltar una lista infinita", largo.includes("y 2 más"), largo);
}

/* ------------------------------------------------------------------ */
console.log("\n4. El origen, para poder decir DÓNDE se importa");

{
  const conOrigen = extraerPaquetesConOrigen(FUENTES);
  const jspdf = conOrigen.find((o) => o.paquete === "jspdf");
  afirmar("★ señala el archivo culpable", jspdf?.desde === "src/services/pdfReportService.ts", JSON.stringify(jspdf));
}

/* ------------------------------------------------------------------ */
console.log("\n5. Un proyecto sano no dispara nada");

{
  const sano = [
    archivo("src/main.tsx", 'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport "./index.css";\nimport App from "./App";'),
    archivo("vite.config.ts", 'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";'),
  ];
  const faltantes = paquetesFaltantes(sano, {
    declarados: ["react", "react-dom", "vite", "@vitejs/plugin-react"],
    estaInstalado: () => true,
  });
  afirmar("★ cero falsos positivos en el esqueleto de Vite que genera esta app", faltantes.length === 0, JSON.stringify(faltantes));
}

/* ------------------------------------------------------------------ */
console.log("\n6. v1.6.24 — AUDITORÍA DE INTEGRIDAD: el caso «chunks/dist.js»");

// Disco virtual: los archivos que existen están en el mapa; las carpetas se
// infieren por prefijo. Nada de tocar el disco real en un test puro.
const crearDisco = (archivos: Record<string, string>): DiscoDeAuditoria => {
  const claves = Object.keys(archivos);
  return {
    existe: (ruta) => claves.some((k) => k === ruta || k.startsWith(ruta + "/")),
    leer: (ruta) => (ruta in archivos ? archivos[ruta] : null),
    unir: (...p) => p.join("/"),
  };
};

{
  // EL CASO REPORTADO, simulado: node_modules/vite existe, su package.json
  // también, pero el archivo que él mismo declara como entrada NO está en el
  // disco (ZIP podado / npm install cortado). Existencia de carpeta diría
  // «instalado»; la auditoría dice la verdad: «roto».
  const disco = crearDisco({
    "proy/node_modules/vite/package.json": JSON.stringify({ name: "vite", main: "./dist/node/index.js" }),
    // dist/node/index.js MISSING — exactamente el «Cannot find module …/dist.js»
    "proy/node_modules/react/package.json": JSON.stringify({ name: "react", main: "./index.js" }),
    "proy/node_modules/react/index.js": "//",
    "proy/node_modules/@vitejs/plugin-react/package.json": JSON.stringify({ name: "@vitejs/plugin-react", main: "./dist/index.cjs" }),
    "proy/node_modules/@vitejs/plugin-react/dist/index.cjs": "//",
    "proy/node_modules/typescript/package.json": JSON.stringify({ name: "typescript", bin: { tsc: "./bin/tsc" } }),
    "proy/node_modules/typescript/bin/tsc": "//",
  });
  const a = auditarInstalacion("proy", ["vite", "react", "@vitejs/plugin-react", "typescript"], disco);
  afirmar("★ detecta VITE roto (carpeta existe, entrada no)", a.rotos.length === 1 && a.rotos[0] === "vite", JSON.stringify(a));
  afirmar("react sano no se acusa", !a.ausentes.includes("react") && !a.rotos.includes("react"));
  afirmar("scoped @vitejs/plugin-react sano", instalacionSana(crearResumenSano(disco, ["@vitejs/plugin-react"])));
  afirmar("typescript sano vía bin", a.rotos.length === 1 && !a.rotos.includes("typescript"));
  afirmar("★ el agregado declara la instalación INSANA", instalacionSana(a) === false);
}

function crearResumenSano(disco: DiscoDeAuditoria, declarados: string[]) {
  return auditarInstalacion("proy", declarados, disco);
}

{
  // Carpeta ausente del todo → ausente, no roto (es el caso del ZIP limpio).
  const disco = crearDisco({
    "proy/package.json": "{}",
  });
  const a = auditarInstalacion("proy", ["vite"], disco);
  afirmar("paquete sin carpeta → ausente", a.ausentes.length === 1 && a.ausentes[0] === "vite" && a.rotos.length === 0, JSON.stringify(a));
}

{
  // package.json truncado a media escritura → roto.
  const disco = crearDisco({
    "proy/node_modules/react/package.json": '{"name": "react", "main": "./ind',
  });
  afirmar("manifiesto truncado → roto", saludDePaquete("proy/node_modules/react", disco) === "roto");
}

{
  // exports con objeto { import / require } — se valida la rama import.
  const good = crearDisco({
    "p/node_modules/x/package.json": JSON.stringify({ exports: { ".": { import: "./dist/esm.js", require: "./dist/cjs.js" } } }),
    "p/node_modules/x/dist/esm.js": "//",
  });
  const bad = crearDisco({
    "p/node_modules/x/package.json": JSON.stringify({ exports: { ".": { import: "./dist/esm.js", require: "./dist/cjs.js" } } }),
    "p/node_modules/x/dist/cjs.js": "//", // el import declarado no está
  });
  afirmar("exports[\".\"].import presente → ok", saludDePaquete("p/node_modules/x", good) === "ok");
  afirmar("exports[\".\"].import ausente → roto", saludDePaquete("p/node_modules/x", bad) === "roto");
}

{
  // Sin main/exports/bin deducibles: beneficio de la duda (no falso positivo).
  const disco = crearDisco({
    "p/node_modules/styles/package.json": JSON.stringify({ name: "styles", sideEffects: true }),
  });
  afirmar("entrada no deducible → ok (no acusa a ciegas)", saludDePaquete("p/node_modules/styles", disco) === "ok");
}

{
  // El esqueleto completo de la plantilla sandbox-app: los cuatro declarados,
  // todos sanos → instalación sana (no rompe el camino feliz).
  const disquito = crearDisco({
    "r/node_modules/react/package.json": JSON.stringify({ main: "./index.js" }),
    "r/node_modules/react/index.js": "//",
    "r/node_modules/react-dom/package.json": JSON.stringify({ main: "./index.js" }),
    "r/node_modules/react-dom/index.js": "//",
    "r/node_modules/vite/package.json": JSON.stringify({ main: "./dist/node/index.js", bin: { vite: "./bin/vite.js" } }),
    "r/node_modules/vite/dist/node/index.js": "//",
    "r/node_modules/@vitejs/plugin-react/package.json": JSON.stringify({ main: "./dist/index.cjs" }),
    "r/node_modules/@vitejs/plugin-react/dist/index.cjs": "//",
  });
  const a = auditarInstalacion("r", ["react", "react-dom", "vite", "@vitejs/plugin-react"], disquito);
  afirmar("★ camino feliz de la plantilla: instalación sana", instalacionSana(a), JSON.stringify(a));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ DEPENDENCIAS DEL PROYECTO: ${pasadas} correctas · ${falladas} fallidas ═══`);
console.log("─".repeat(56));
if (falladas > 0) process.exit(1);
