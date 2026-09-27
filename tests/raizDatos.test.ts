/**
 * tests/raizDatos.test.ts — dónde viven los datos y cuándo se migran
 * ==================================================================
 * Se ejecuta con:  npx tsx tests/raizDatos.test.ts
 *
 * La prueba que de verdad importa no es «¿migra?» sino «¿se calla cuando NO debe
 * migrar?». La bóveda de claves vive dentro de estas carpetas: una migración que
 * pise datos existentes es peor que no migrar.
 */

import {
  resolverRaizDatos,
  mismaRaiz,
  decidirMigracion,
  mensajeMigracion,
  CARPETAS_DE_ESTADO,
} from "../src/engine/raizDatos";

let pasadas = 0;
let falladas = 0;
const afirmar = (titulo: string, ok: boolean, detalle = "") => {
  if (ok) {
    pasadas++;
    console.log(`  ✔ ${titulo}`);
  } else {
    falladas++;
    console.log(`  ✘ ${titulo}${detalle ? ` → ${detalle}` : ""}`);
  }
};
const seccion = (t: string) => console.log(`\n${t}`);

/** Atajo: el caso de migración, con los dos indicadores que más importan. */
const decide = (destino: string, origen: string, dest: boolean, orig: boolean) =>
  decidirMigracion({
    raizDestino: destino,
    raizOrigen: origen,
    destinoTieneEstado: dest,
    origenTieneEstado: orig,
  });

/* ------------------------------------------------------------------ */
seccion("1. De dónde sale la raíz de datos");

{
  const r = resolverRaizDatos({ PROJECT_DIR: "C:\\Cerebronico" }, "C:\\app\\ide\\backend");
  afirmar("PROJECT_DIR manda sobre el directorio de trabajo", r.raiz === "C:\\Cerebronico", r.raiz);
  afirmar("y se sabe que vino de ahí", r.origen === "PROJECT_DIR", r.origen);
}

{
  const r = resolverRaizDatos({}, "C:\\app\\ide\\backend");
  afirmar("sin PROJECT_DIR se cae a <cwd>/.proyectos", r.raiz.endsWith(".proyectos"), r.raiz);
  afirmar("y lo declara como valor por defecto", r.origen === "por-defecto", r.origen);
  afirmar("con el separador del sistema", r.raiz.includes("\\"), r.raiz);
}

{
  // `set PROJECT_DIR=` define la variable y la deja VACÍA: es la forma más común
  // de romper un lanzador y no puede mandar la raíz a la cadena vacía.
  const vacio = resolverRaizDatos({ PROJECT_DIR: "" }, "/app");
  afirmar("PROJECT_DIR vacío NO manda", vacio.origen === "por-defecto", vacio.raiz);
  const espacios = resolverRaizDatos({ PROJECT_DIR: "   " }, "/app");
  afirmar("PROJECT_DIR en blanco tampoco", espacios.origen === "por-defecto", espacios.raiz);
}

{
  const r = resolverRaizDatos({ PROJECT_DIR: "C:\\Cerebronico\\" }, "c:\\app");
  afirmar("el separador final no se arrastra", r.raiz === "C:\\Cerebronico", r.raiz);
}

/* ------------------------------------------------------------------ */
seccion("2. ¿Las dos rutas son el mismo sitio?");

afirmar("idénticas", mismaRaiz("C:\\Cerebronico", "C:\\Cerebronico"));
afirmar("con separador final distinto", mismaRaiz("C:\\Cerebronico\\", "C:\\Cerebronico"));
afirmar("Windows no distingue mayúsculas", mismaRaiz("c:\\cerebronico", "C:\\CereBronico"));
afirmar("y no confunde dos distintas", !mismaRaiz("C:\\Cerebronico", "C:\\Cerebronico2"));
afirmar("ni una con la otra", !mismaRaiz("C:\\Cerebronico", "D:\\Cerebronico"));

/* ------------------------------------------------------------------ */
seccion("3. Cuándo se migra y cuándo NO");

{
  const d = decide("C:\\Cerebronico", "C:\\Cerebronico", true, true);
  afirmar("misma raíz → no hay mudanza", !d.migrar, d.motivo);
}
{
  const d = decide("C:\\Cerebronico", "C:\\viejos", false, false);
  afirmar("origen sin estado → nada que llevar", !d.migrar, d.motivo);
}
{
  // ★ La regla que protege la bóveda de claves.
  const d = decide("C:\\Cerebronico", "C:\\viejos", true, true);
  afirmar("★ destino CON datos → NO se toca", !d.migrar, d.motivo);
  // Sin distinguir mayúsculas: el motivo dice «no se toca», no «NO». La
  // aserción original buscaba el literal en mayúsculas y fallaba por eso.
  afirmar("★ y lo explica", /no se toca/i.test(d.motivo), d.motivo);
}
{
  const d = decide("C:\\Cerebronico", "C:\\viejos", false, true);
  afirmar("★ destino vacío + origen con datos → migra", d.migrar, d.motivo);
}

{
  const d = decide("C:\\Cerebronico", "C:\\viejos", false, true);
  const mensaje = mensajeMigracion("C:\\viejos", "C:\\Cerebronico");
  afirmar("el aviso nombra el origen y el destino", mensaje.includes("C:\\viejos") && mensaje.includes("C:\\Cerebronico"));
  afirmar("★ y avisa de que el original NO se toca", /original NO se toca/i.test(mensaje), mensaje);
}

/* ------------------------------------------------------------------ */
seccion("4. Qué se lleva");

afirmar("la bóveda y los espejos", CARPETAS_DE_ESTADO.includes(".cerebro-db"));
afirmar("y los datos de espejos", CARPETAS_DE_ESTADO.includes(".cerebronico"));

/* ------------------------------------------------------------------ */
console.log(`\n${"─".repeat(56)}`);
console.log(`═══ RAÍZ DE DATOS: ${pasadas} correctas · ${falladas} fallidas ═══`);
console.log("─".repeat(56));
if (falladas > 0) process.exit(1);
