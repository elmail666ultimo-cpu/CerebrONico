/**
 * syntaxGuardProfundo.test.ts — SYNTAXGUARD v3 (v1.6.32)
 * ======================================================
 * La v2.0 retiró el balanceo de llaves en TS/TSX porque SIN PARSER era
 * maquinaria de falsos positivos (genéricos, JSX). Consecuencia: el mutilado
 * clásico —`export function f() {` sin la llave final— seguía entrando.
 *
 * La v3 mete un PARSER REAL (esbuild, el mismo que compila el sandbox) por
 * INYECCIÓN. Esta suite prueba las tres promesas del diseño:
 *   1. BLOQUEA lo que el oráculo del proyecto rechaza (truncado de verdad).
 *   2. NUNCA BLOQUEA lo que es válido — regresión de los falsos positivos
 *      que la v2.0 cazó (genéricos <Props>, JSX multilinea, backticks).
 *   3. SI EL PARSER FALLA ÉL (crash, timeout, dependencia ausente), el
 *      archivo PASA con aviso: un guardián averiado no tiene derecho a
 *      encerrar trabajo correcto.
 * Y que está cableado en las cuatro puertas de escritura.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { transform as esbuildTransform } from "esbuild";
import {
  guardFile,
  guardFileProfundo,
  problemasBloqueantes,
  AVISO_INFORMATIVO,
  type FuncionTransform,
} from "../src/engine/syntaxGuard";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const transform: FuncionTransform = (codigo, opts) =>
  esbuildTransform(codigo, { loader: opts.loader, sourcefile: opts.sourcefile, target: "es2022", tsconfigRaw: {} } as any);

// ════════════════════════════════════════════════════════════════════════════
// 1 · BLOQUEA EL MUTILADO QUE LA v2.0 NO VEÍA
// ════════════════════════════════════════════════════════════════════════════
console.log("\n1) El truncado sin llave final ya no pasa\n");

(async () => {
  const mutilado = `export function saludar(nombre: string): string {\n  const saludo = "hola " + nombre;\n  return saludo;\n`;
  const r1 = await guardFileProfundo("src/saludar.ts", mutilado, transform);
  comprobar("rechaza la función sin llave final", r1.ok === false);
  comprobar("el problema es de tipo parser", r1.issues.some((i) => i.kind === "parser"), JSON.stringify(r1.issues.map((i) => i.kind)));
  comprobar("hay bloqueantes de verdad", problemasBloqueantes(r1).length > 0);
  comprobar("el fix manda reescribir completo", /COMPLETO/i.test(r1.issues.find((i) => i.kind === "parser")?.fix || ""));

  // JSX roto en .tsx: la v2.0 lo dejaba pasar (comprobación retirada).
  const jsxRoto = `export function A() {\n  return (\n    <div>\n      <span>hola\n    </div>\n  );\n}\n`;
  const r2 = await guardFileProfundo("src/A.tsx", jsxRoto, transform);
  comprobar("rechaza el JSX mal cerrado", r2.ok === false, r2.summary.slice(0, 160));

  // El marcador propio de la casa (TODO en el código) ya lo cortaba la capa rápida:
  // el parser ni debe correr.
  let llamado = 0;
  const contador: FuncionTransform = (c, o) => { llamado++; return transform(c, o); };
  const conBaseRota = await guardFileProfundo("src/x.ts", mutilado + "// TODO: implementar\n", contador);
  comprobar("si la capa rápida ya sentencia, el parser no se gasta", conBaseRota.ok === false && llamado === 0);

  // ════════════════════════════════════════════════════════════════════════
  // 2 · REGRESIÓN DE FALSOS POSITIVOS: lo válido, SIEMPRE pasa
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n2) Lo que la v2.0 defendía, la v3 lo defiende con parser\n");

  const genericos = `interface Props<T extends string> { valor: T }\nexport function C({ valor }: Props<"a">) {\n  const n = 1 < 2 && 3 > 2;\n  return valor && n ? null : undefined;\n}\n`;
  const r3 = await guardFileProfundo("src/C.tsx", genericos, transform);
  comprobar("genéricos con < y comparaciones: OK", r3.ok === true, r3.summary.slice(0, 160));

  const plantillas = "const a = `hola ${1 + 1}`;\nconst b = 'llave { suelta';\nexport const c = [\"otra } suelta\"];\n";
  const r4 = await guardFileProfundo("src/t.ts", plantillas, transform);
  comprobar("backticks y llaves dentro de cadenas: OK", r4.ok === true, r4.summary.slice(0, 160));

  const tsxVivo = `import { useState } from "react";\nexport default function Panel() {\n  const [abierto, setAbierto] = useState<boolean>(false);\n  return (\n    <details open={abierto}>\n      <summary onClick={() => setAbierto(!abierto)}>x</summary>\n      <textarea rows={4} />\n    </details>\n  );\n}\n`;
  const r5 = await guardFileProfundo("src/Panel.tsx", tsxVivo, transform);
  comprobar("componente JSX real con textarea: OK", r5.ok === true, r5.summary.slice(0, 200));
  comprobar("el summary dice parser: OK", /parser: OK/.test(r5.summary));

  // JSX dentro de .ts (NO permitido ni por Vite): bloquea, y el fix dice .tsx.
  const r6 = await guardFileProfundo("src/malo.ts", "export const a = <div>hola</div>;\n", transform);
  comprobar("JSX en .ts se bloquea con solución de extensión", r6.ok === false && /\.tsx/.test(r6.summary), r6.summary.slice(0, 200));

  // ════════════════════════════════════════════════════════════════════════
  // 3 · PARSER AVERIADO = AVISO, JAMÁS CÁRCEL
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n3) Si el parser falla él, el archivo pasa con aviso\n");

  const bueno = "export const x: number = 1;\n";
  const crash: FuncionTransform = async () => { throw new TypeError("esbuild no está aquí"); };
  const r7 = await guardFileProfundo("src/b.ts", bueno, crash);
  comprobar("crash del parser: OK (no bloquea)", r7.ok === true, r7.summary.slice(0, 160));
  comprobar("el aviso queda visible", r7.issues.some((i) => i.kind === "parser") && r7.issues.every((i) => AVISO_INFORMATIVO.test(i.message) || i.kind !== "parser"));
  comprobar("el aviso no es bloqueante", problemasBloqueantes(r7).length === 0);

  const r8 = await guardFileProfundo("src/b.ts", bueno, null);
  comprobar("sin transform (navegador): comportamiento v2.0 exacto", r8.ok === true && r8.summary === guardFile("src/b.ts", bueno).summary);

  const lento: FuncionTransform = () => new Promise((_, rej) => { setTimeout(() => rej(new Error("tarde")), 50); });
  const r9 = await guardFileProfundo("src/b.ts", bueno, lento, { timeoutMs: 250 });
  comprobar("timeout del parser: pasa con aviso, no con celda", r9.ok === true);

  const r10 = await guardFileProfundo("README.md", "# títulos\n sin { cerrar [", transform);
  comprobar("markdown no pasa por el parser de JS", r10.ok === true);

  // ════════════════════════════════════════════════════════════════════════
  // 4 · IMPLANTADO EN LAS CUATRO PUERTAS
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n4) Las cuatro puertas de escritura usan el parser\n");

  const srv = leer("server.ts");
  const validar = leer("scripts/validar.mjs");
  comprobar("server.ts importa guardFileProfundo", /guardFileProfundo/.test(srv));
  comprobar("write_file del agente: profundo", /await guardFileProfundo\(String\(args\?\.path/.test(srv));
  comprobar("/api/fs/write (autosync): profundo", /await guardFileProfundo\(filePath, content/.test(srv));
  comprobar("/api/fs/sync (lote): profundo", /await guardFileProfundo\(f\.path, f\.content/.test(srv));
  comprobar("el transform es esbuild del proyecto", /from "esbuild"/.test(srv) && /PARSER_ESBUILD/.test(srv));
  comprobar("la suite entra en npm run validar", validar.includes("syntaxGuardProfundo.test.ts"));

  console.log(`\n═══ SYNTAXGUARD v3 PARSER (v1.6.32): ${correctas} correctas · ${fallos.length} fallidas ═══`);
  for (const f of fallos) console.log("  FALLO →", f);
  process.exit(fallos.length ? 1 : 0);
})();
