/**
 * guard.test.ts — EL GUARDIÁN DE ESCRITURA (v2.1)
 * ==============================================
 * Comprueba la regla que decide si un archivo con la sintaxis rota puede
 * escribirse o no.
 *
 * POR QUÉ EXISTE ESTA SUITE
 * -------------------------
 * Esa regla estaba escrita dentro de un endpoint de `server.ts` de 6.800 líneas,
 * donde ninguna prueba la miraba. Filtraba por `issue.severity === "error"` —un
 * campo que `SyntaxIssue` NO tiene—, así que devolvía siempre una lista vacía y
 * **la escritura nunca se bloqueaba**. La protección se ejecutaba y no protegía
 * nada, y nadie se enteró porque el comprobador de tipos tampoco se miraba.
 *
 * Se ejecuta con:  npx tsx tests/guard.test.ts
 */

import { guardFile, problemasBloqueantes, AVISO_INFORMATIVO, type SyntaxIssue } from "../src/engine/syntaxGuard";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];

function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) {
    pasan++;
    console.log(`  PASS   ${nombre}`);
  } else {
    fallan++;
    fallos.push(nombre);
    console.log(`  FALLO  ${nombre}${detalle ? `  ·  ${detalle}` : ""}`);
  }
}

const issue = (message: string): SyntaxIssue => ({ kind: "balance", line: 1, message, fix: "arréglalo" });

console.log("═══ PRUEBAS DEL GUARDIÁN DE ESCRITURA · CerebroNico v2.1 ═══\n");

// ─── 1. Lo que SÍ bloquea ─────────────────────────────────────────────────

{
  comprobar("un problema real bloquea", problemasBloqueantes({ issues: [issue("Falta cerrar la llave {")] }).length === 1);
  comprobar(
    "de varios, bloquean todos los reales",
    problemasBloqueantes({ issues: [issue("Comentario sin cerrar"), issue("Comilla sin cerrar"), issue("Marcador de truncado: «…»")] }).length === 3
  );
  comprobar("el array de bloqueantes conserva el mensaje", problemasBloqueantes({ issues: [issue("Falta la coma")] })[0]?.message === "Falta la coma");
  comprobar("y conserva el arreglo (`fix`), que es lo que se le enseña al modelo", problemasBloqueantes({ issues: [issue("X")] })[0]?.fix === "arréglalo");
}

// ─── 2. Lo que NO bloquea (avisos informativos) ───────────────────────────

{
  comprobar("«saltado» no bloquea", problemasBloqueantes({ issues: [issue("Archivo saltado por tamaño")] }).length === 0);
  comprobar("«omitido» no bloquea", problemasBloqueantes({ issues: [issue("Bloque omitido del contexto")] }).length === 0);
  comprobar("«no aplica» no bloquea", problemasBloqueantes({ issues: [issue("La validación no aplica a este tipo")] }).length === 0);
  comprobar("en mayúsculas tampoco", problemasBloqueantes({ issues: [issue("SALTADO: no cabe")] }).length === 0);
  comprobar("la expresión de aviso es la esperada", AVISO_INFORMATIVO.test("omitido"));
  comprobar(
    "mezcla: sólo pasa a bloqueante el problema real",
    problemasBloqueantes({ issues: [issue("Archivo saltado"), issue("Llave sin cerrar")] }).length === 1
  );
  comprobar("lista vacía no bloquea nada", problemasBloqueantes({ issues: [] }).length === 0);
}

// ─── 3. REGRESIÓN: el fallo que esto arregla ──────────────────────────────

{
  // El bug original: se filtraba por un campo inexistente. Se comprueba que un
  // issue NO tiene `severity` y que, aun así, bloquea.
  const i: any = issue("Llave sin cerrar");
  comprobar("un issue NO tiene «severity» (el campo por el que se filtraba antes)", i.severity === undefined);
  comprobar("...y aun así BLOQUEA: ya no se filtra por ese campo", problemasBloqueantes({ issues: [i] }).length === 1);
  comprobar("el issue SÍ tiene «fix», que es lo que se devuelve al modelo", typeof i.fix === "string");
}

// ─── 4. Contra el guardián DE VERDAD, no con datos inventados ─────────────

{
  const bien = guardFile("src/ok.json", '{"a": 1, "b": [1, 2]}');
  comprobar("un JSON válido pasa el guardián", bien.ok === true, bien.summary);
  comprobar("y no tiene nada bloqueante", problemasBloqueantes(bien).length === 0, bien.summary);

  const mal = guardFile("src/roto.json", '{"a": 1, "b": [1, 2}');
  comprobar("un JSON roto NO pasa el guardián", mal.ok === false);
  comprobar("y SÍ tiene problemas bloqueantes (aquí estaba el fallo)", problemasBloqueantes(mal).length > 0, `issues=${mal.issues.length}`);
  comprobar("el mensaje dice qué pasa", problemasBloqueantes(mal)[0]?.message.length > 0);
  comprobar("y trae el arreglo en imperativo", (problemasBloqueantes(mal)[0]?.fix || "").length > 0);

  // El caso que motivó la protección: un archivo CORTADO por falta de contexto.
  const cortado = guardFile("src/App.tsx", "export function App() {\n  return <div>\n  // resto del código\n");
  comprobar("un archivo con marcador de truncado NO pasa", cortado.ok === false);
  comprobar("y bloquea la escritura", problemasBloqueantes(cortado).length > 0, `issues=${cortado.issues.length}`);

  const tsOk = guardFile("src/x.ts", "export const a = 1;\nexport function f(x: number) { return x + 1; }\n");
  comprobar("un TypeScript correcto pasa", tsOk.ok === true, tsOk.summary);
  comprobar("y no bloquea", problemasBloqueantes(tsOk).length === 0, tsOk.summary);
}

// ─── 5. El contrato del resumen ──────────────────────────────────────────

{
  const g = guardFile("src/roto.json", '{"a":');
  comprobar("el guardián trae `summary` (respaldo del consejo)", typeof g.summary === "string" && g.summary.length > 0);
  comprobar("y trae el idioma detectado", typeof g.language === "string" && g.language.length > 0, g.language);
  const consejo = problemasBloqueantes(g)[0]?.fix || g.summary;
  comprobar("el consejo que se devuelve nunca queda vacío", typeof consejo === "string" && consejo.length > 0);
}

console.log(`\n═══ RESULTADO: ${pasan} correctas · ${fallan} fallidas ═══`);
if (fallan > 0) {
  console.log("Fallos:");
  fallos.forEach((f) => console.log(`  · ${f}`));
}
process.exitCode = fallan > 0 ? 1 : 0;
