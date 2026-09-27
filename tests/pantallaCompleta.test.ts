/**
 * tests/pantallaCompleta.test.ts — REGRESIÓN del botón «Salir» que no salía
 * =========================================================================
 * Se ejecuta con:  npx tsx tests/pantallaCompleta.test.ts
 *
 * El código anterior decidía así:
 *
 *     if (!document.fullscreenElement) { entrar } else { salir }
 *
 * …mientras la LLAMADA sí contemplaba `webkitRequestFullscreen`. En un motor que
 * solo exponga el nombre prefijado, `document.fullscreenElement` vale
 * `undefined` siempre, la condición entra por «entrar» AUNQUE estés dentro, y
 * pulsar «Salir» vuelve a pedir pantalla completa. El botón no estaba muerto:
 * elegía lo contrario.
 *
 * La primera prueba de la sección 2 es exactamente ese escenario.
 */

import {
  elementoEnPantallaCompleta,
  decidirAccion,
  alternarPantallaCompleta,
  entrarEnPantallaCompleta,
  salirDePantallaCompleta,
} from "../src/engine/pantallaCompleta";

let pasadas = 0;
let falladas = 0;

function afirmar(titulo: string, condicion: boolean, detalle = ""): void {
  if (condicion) {
    pasadas++;
    console.log(`  ✔ ${titulo}`);
  } else {
    falladas++;
    console.error(`  ✘ ${titulo}${detalle ? `\n      ${detalle}` : ""}`);
  }
}

function seccion(n: string): void {
  console.log(`\n${n}`);
}

/** Documento falso que solo expone los nombres del motor indicado. */
function docFalso(estilo: "moderno" | "webkit" | "moz" | "ms" | "ninguno") {
  const estado: { el: unknown } = { el: null };
  const doc: any = {};
  if (estilo === "moderno") {
    Object.defineProperty(doc, "fullscreenElement", { get: () => estado.el });
    doc.exitFullscreen = () => { estado.el = null; };
  } else if (estilo === "webkit") {
    Object.defineProperty(doc, "webkitFullscreenElement", { get: () => estado.el });
    doc.webkitExitFullscreen = () => { estado.el = null; };
  } else if (estilo === "moz") {
    Object.defineProperty(doc, "mozFullScreenElement", { get: () => estado.el });
    doc.mozCancelFullScreen = () => { estado.el = null; };
  } else if (estilo === "ms") {
    Object.defineProperty(doc, "msFullscreenElement", { get: () => estado.el });
    doc.msExitFullscreen = () => { estado.el = null; };
  }
  return { doc, estado };
}

/* ------------------------------------------------------------------ */
seccion("1. Detección con el nombre moderno");

{
  const { doc, estado } = docFalso("moderno");
  const el = { nombre: "contenedor" };
  estado.el = el;
  afirmar("detecta el elemento en pantalla completa", elementoEnPantallaCompleta(doc) === el);
  afirmar("y decide SALIR", decidirAccion(doc) === "salir", decidirAccion(doc));

  estado.el = null;
  afirmar("sin nada a pantalla completa, decide ENTRAR", decidirAccion(doc) === "entrar", decidirAccion(doc));
}

/* ------------------------------------------------------------------ */
seccion("2. Detección con los nombres PREFIJADOS (aquí estaba el fallo)");

for (const estilo of ["webkit", "moz", "ms"] as const) {
  const { doc, estado } = docFalso(estilo);
  const el = { nombre: `contenedor-${estilo}` };
  estado.el = el;

  afirmar(`«${estilo}»: detecta el elemento`, elementoEnPantallaCompleta(doc) === el, String(elementoEnPantallaCompleta(doc)));
  afirmar(
    `★ «${estilo}»: decide SALIR (antes decidía ENTRAR → el botón no salía)`,
    decidirAccion(doc) === "salir",
    `decidió ${decidirAccion(doc)}`
  );
}

{
  // La prueba que reproduce el fallo con el código viejo, para dejar constancia.
  const { doc, estado } = docFalso("webkit");
  estado.el = { nombre: "en-pantalla-completa" };

  const decisionVieja = doc.fullscreenElement ? "salir" : "entrar"; // la línea de antes
  afirmar("el criterio ANTIGUO decidía ENTRAR estando dentro", decisionVieja === "entrar", decisionVieja);
  afirmar("el criterio NUEVO decide SALIR", decidirAccion(doc) === "salir", decidirAccion(doc));
}

/* ------------------------------------------------------------------ */
seccion("3. Preferencia y casos degenerados");

{
  const doc: any = {
    fullscreenElement: { n: "moderno" },
    webkitFullscreenElement: { n: "webkit" },
  };
  afirmar("si están los dos, gana el moderno", (elementoEnPantallaCompleta(doc) as any).n === "moderno");
}

{
  const { doc } = docFalso("ninguno");
  afirmar("documento sin ninguna propiedad → null", elementoEnPantallaCompleta(doc) === null);
  afirmar("y decide ENTRAR", decidirAccion(doc) === "entrar");
  afirmar("documento nulo no revienta", elementoEnPantallaCompleta(null) === null && decidirAccion(undefined) === "entrar");
}

/* ------------------------------------------------------------------ */
seccion("4. Ida y vuelta completa, con un motor solo prefijado");

{
  const { doc, estado } = docFalso("webkit");
  const el: any = {
    webkitRequestFullscreen() {
      estado.el = el;
      return undefined; // el WebKit antiguo NO devuelve promesa
    },
  };

  const entrar = await alternarPantallaCompleta(doc, el);
  afirmar("entra sin error aunque no devuelva promesa", entrar.ok === true, JSON.stringify(entrar));
  afirmar("y el documento refleja la entrada", estado.el === el);

  const salir = await alternarPantallaCompleta(doc, el);
  afirmar("★ y SALE (lo que no hacía antes)", salir.ok === true && salir.accion === "salir", JSON.stringify(salir));
  afirmar("el documento queda sin pantalla completa", estado.el === null);
}

/* ------------------------------------------------------------------ */
seccion("5. Los fallos se cuentan, no se tragan");

{
  // Hay un elemento a pantalla completa pero el motor no expone forma de salir.
  const doc: any = { fullscreenElement: { n: "x" } };
  const r = await alternarPantallaCompleta(doc, {});
  afirmar("no se declara éxito", r.ok === false, JSON.stringify(r));
  afirmar("se explica el motivo", typeof r.motivo === "string" && r.motivo.length > 0, String(r.motivo));
  afirmar("y se sabe qué acción se intentó", r.accion === "salir", r.accion);
}

{
  const r = await alternarPantallaCompleta(docFalso("moderno").doc, {});
  afirmar("sin API de entrar, tampoco se calla", r.ok === false, JSON.stringify(r));
}

{
  let capturado = "";
  await salirDePantallaCompleta({ exitFullscreen: () => { throw new Error("rechazado por el navegador"); } })
    .catch((e) => { capturado = (e as Error).message; });
  afirmar("una excepción síncrona se convierte en rechazo, no en silencio", capturado === "rechazado por el navegador", capturado);
}

{
  let capturado = "";
  await entrarEnPantallaCompleta({ requestFullscreen: () => Promise.reject(new Error("sin gesto de usuario")) })
    .catch((e) => { capturado = (e as Error).message; });
  afirmar("un rechazo de la promesa llega al llamante", capturado === "sin gesto de usuario", capturado);
}

/* ------------------------------------------------------------------ */
seccion("6. El receptor de la llamada");

{
  // Extraer el método y llamarlo sin receptor rompe la API: se comprueba que
  // se invoca con `this` = documento/elemento.
  const doc: any = {
    fullscreenElement: { n: "x" },
    exitFullscreen(this: any) { return Promise.resolve(this === doc ? "ok" : "receptor-perdido"); },
  };
  let devuelto = "";
  await salirDePantallaCompleta(doc).then(() => { devuelto = "ok"; }).catch(() => { devuelto = "no"; });
  afirmar("se llama con el documento como receptor", devuelto === "ok", devuelto);
}

/* ------------------------------------------------------------------ */
console.log(`\n${"─".repeat(56)}`);
console.log(`═══ PANTALLA COMPLETA: ${pasadas} correctas · ${falladas} fallidas ═══`);
console.log("─".repeat(56));
if (falladas > 0) process.exit(1);
