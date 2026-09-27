/**
 * sandboxRaizAnidada.test.ts — LA RAÍZ DEL PROYECTO ANIDADO (v1.6.22)
 * ==================================================================
 * Regresión del defecto «npm install corre en C:\Cerebronico y no en
 * C:\Cerebronico\ide\backend».
 *
 * El sync escribe el workspace con su carpeta contenedora (p. ej.
 * `ide/backend/package.json`), de modo que el proyecto real vive ANIDADO dentro
 * de la raíz de datos. `resolverRaizProyecto()` es quien debe encontrarlo y
 * devolver ESA raíz; si devuelve la base, el `npm install`/`npm run dev` falla
 * con ENOENT porque en la base no hay `package.json`.
 *
 * Esta suite comprueba el resolutor contra tres escenarios reales en disco:
 * proyecto anidado, proyecto en la base y raíz vacía.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolverRaizProyecto } from "../src/engine/projectPorter";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => {
  if (c) correctas++;
  else fallos.push(n + (d ? " :: " + d : ""));
};

const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "cn-raiz-"));

console.log("\n1) Proyecto anidado: devuelve la subcarpeta, no la base\n");

{
  const base = tmp();
  const anidada = path.join(base, "ide", "backend");
  fs.mkdirSync(anidada, { recursive: true });
  fs.writeFileSync(path.join(anidada, "package.json"), "{}");
  const r = resolverRaizProyecto(base);
  comprobar("la raíz apunta a la subcarpeta con package.json", r.raiz === anidada, r.raiz);
  comprobar("marca anidada: true", r.anidada === true);
  comprobar("tiene package.json", r.tienePkg === true);
  fs.rmSync(base, { recursive: true, force: true });
}

console.log("\n2) Proyecto en la base: se queda en la base\n");

{
  const base = tmp();
  fs.writeFileSync(path.join(base, "package.json"), "{}");
  const r = resolverRaizProyecto(base);
  comprobar("la raíz es la base", r.raiz === base, r.raiz);
  comprobar("marca anidada: false", r.anidada === false);
  comprobar("tiene package.json", r.tienePkg === true);
  fs.rmSync(base, { recursive: true, force: true });
}

console.log("\n3) Raíz vacía: devuelve la base (no inventa nada)\n");

{
  const base = tmp();
  const r = resolverRaizProyecto(base);
  comprobar("sin proyecto devuelve la base", r.raiz === base, r.raiz);
  comprobar("sin package.json", r.tienePkg === false);
  comprobar("no anidada", r.anidada === false);
  fs.rmSync(base, { recursive: true, force: true });
}

console.log(`\n═══ RAÍZ ANIDADA DEL SANDBOX (v1.6.22): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
