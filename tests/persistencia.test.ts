/**
 * persistencia.test.ts — EL WORKSPACE NO SE PIERDE (v1.9.0)
 * ========================================================
 * QUÉ ES: la suite de la capa de guardado local (`storage.ts` + el almacén grande
 * de `indexedDBStorage.ts`), ejecutando el código de verdad.
 * PARA QUÉ SIRVE: para demostrar —no afirmar— que al pasar de 5 MB el trabajo del
 * usuario NO se pierde, y que cuando no se puede guardar, el sistema lo DICE.
 *
 * POR QUÉ ESTA SUITE MONTA UN ALMACÉN Y UN INDEXEDDB FALSOS
 * `localStorage` e `indexedDB` no existen en Node. En lugar de comprobar «leyendo
 * que el código parece correcto» (que es como se cuelan las pérdidas silenciosas),
 * aquí se instalan dobles de prueba mínimos y se llama a las funciones reales: se
 * guarda, se desborda el tope, se llena la cuota y se recupera lo rescatado.
 *
 * LO QUE ESTOS DOBLES NO SON: un navegador. El de IndexedDB no valida versiones
 * ni cuotas reales. Se dice aquí para que nadie confunda «pasa la suite» con
 * «probado en Chrome» — el límite está declarado, no escondido.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leerFuente = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

// ─── doble de localStorage ──────────────────────────────────────────────────
class AlmacenFalso {
  private mapa = new Map<string, string>();
  /** Cuota real del doble: más pequeña que el tope del módulo, para poder probarla. */
  limite = 5 * 1024 * 1024;
  getItem(k: string) {
    return this.mapa.has(k) ? this.mapa.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (v.length > this.limite) {
      const e: any = new Error("QuotaExceededError simulado");
      e.name = "QuotaExceededError";
      throw e;
    }
    this.mapa.set(k, v);
  }
  removeItem(k: string) {
    this.mapa.delete(k);
  }
  clear() {
    this.mapa.clear();
  }
  get length() {
    return this.mapa.size;
  }
  key(i: number) {
    return [...this.mapa.keys()][i] ?? null;
  }
}

// ─── doble mínimo de IndexedDB (lo justo que usa el almacén grande) ─────────
function instalarIndexedDBFalso() {
  const almacenes = new Map<string, Map<string, string>>();
  const db: any = {
    objectStoreNames: { contains: (n: string) => almacenes.has(n) },
    createObjectStore: (n: string) => {
      almacenes.set(n, new Map());
      return {};
    },
    transaction: (n: string) => {
      if (!almacenes.has(n)) almacenes.set(n, new Map());
      const tx: any = { oncomplete: null, onerror: null, onabort: null };
      tx.objectStore = () => ({
        put: (v: string, k: string) => {
          almacenes.get(n)!.set(k, v);
          queueMicrotask(() => tx.oncomplete?.());
          return {};
        },
        get: (k: string) => {
          const req: any = {};
          queueMicrotask(() => {
            req.result = almacenes.get(n)!.get(k) ?? null;
            req.onsuccess?.();
          });
          return req;
        },
        getAllKeys: () => {
          const req: any = {};
          queueMicrotask(() => {
            req.result = [...almacenes.get(n)!.keys()];
            req.onsuccess?.();
          });
          return req;
        },
        delete: (k: string) => {
          almacenes.get(n)!.delete(k);
          queueMicrotask(() => tx.oncomplete?.());
          return {};
        },
      });
      return tx;
    },
  };
  (globalThis as any).indexedDB = {
    open: () => {
      const req: any = {};
      queueMicrotask(() => {
        req.result = db;
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
  return almacenes;
}

const almacen = new AlmacenFalso();
(globalThis as any).localStorage = almacen;
const almacenesIdx = instalarIndexedDBFalso();

// Los módulos se importan DESPUÉS de instalar los dobles: `storage.ts` no toca
// localStorage al cargarse, pero así queda explícito que el orden importa.
const storage = await import("../src/utils/storage");
const { MAX_LOCALSTORAGE_BYTES, PREFIJO_PUNTERO, viveEnAlmacenGrande } = storage;

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle?: string) {
  if (condicion) correctas++;
  else fallos.push(`${titulo}${detalle ? " → " + detalle : ""}`);
}
const esperar = (ms = 25) => new Promise((r) => setTimeout(r, ms));

// ═══ 1 · LO NORMAL SIGUE FUNCIONANDO ═══════════════════════════════════════
console.log("\n1) Guardado normal (lo que ya iba bien)\n");

almacen.clear();
const rPeq = storage.saveJSON("prueba:pequena", { a: 1, b: "dos" });
comprobar("guardar algo pequeño devuelve ok", rPeq.ok === true, JSON.stringify(rPeq));
comprobar("y dice cuántos bytes ocupó", rPeq.bytes > 0 && rPeq.bytes === JSON.stringify({ a: 1, b: "dos" }).length);
comprobar("el valor se puede leer", JSON.stringify(storage.loadJSON("prueba:pequena", null)) === '{"a":1,"b":"dos"}');
comprobar("★ saveJSON YA NO devuelve void: devuelve un resultado", typeof rPeq.ok === "boolean" && typeof rPeq.bytes === "number", typeof (rPeq as any));
comprobar("guardar una cadena también devuelve resultado", storage.saveString("prueba:txt", "hola").ok === true);
comprobar("la cadena se lee igual", storage.loadString("prueba:txt") === "hola");
comprobar("JSON corrupto: se purga y se devuelve el fallback (no se congela)", (() => {
  almacen.setItem("prueba:rota", "{esto no es json");
  const v = storage.loadJSON("prueba:rota", "POR_DEFECTO");
  return v === "POR_DEFECTO" && almacen.getItem("prueba:rota") === null;
})());

// ═══ 2 · EL DESBORDAMIENTO: EL PUNTO QUE PERDÍA TRABAJO ════════════════════
console.log("\n2) ★ Más de 5 MB: antes se perdía, ahora se rescata\n");

almacen.clear();
for (const [k] of almacenesIdx) almacenesIdx.get(k)!.clear();

const avisos: Array<any> = [];
const desuscribir = storage.alFallarGuardado((r) => avisos.push(r));

const grande = "x".repeat(MAX_LOCALSTORAGE_BYTES + 1024); // 5 MB + 1 KB
const rGrande = storage.saveJSON("codigo0_workspace_files", grande);
comprobar("el valor por encima del tope NO se declara guardado aquí", rGrande.ok === false);
comprobar("pero SÍ dice a dónde ha ido", rGrande.motivo === "demasiado-grande" && /almac[eé]n grande/.test(rGrande.detalle || ""), rGrande.detalle);
comprobar("y no afirma que el rescate ya ocurrió (certeza honesta)", rGrande.rescatado === false && /confirmar[aá]/.test(rGrande.detalle || ""), rGrande.detalle);

await esperar();
comprobar("★ el guardado avisa (antes solo había un console.warn)", avisos.length >= 1, JSON.stringify(avisos.map((a) => [a.ok, a.motivo])));
const avisoGrande = avisos[avisos.length - 1];
comprobar("★ y el aviso confirma que se guardó en el almacén grande", avisoGrande.ok === true && avisoGrande.rescatado === true, JSON.stringify(avisoGrande));
comprobar("★ queda el puntero que dice dónde vive", viveEnAlmacenGrande("codigo0_workspace_files") === true);
// Ojo: lo que viaja al almacén es el TEXTO serializado (JSON), no el valor
// original. La primera versión de esta comprobación comparaba el texto guardado
// con el valor de partida y fallaba por eso, no porque faltara el dato.
comprobar("★ el dato está de verdad en el almacén grande (no se perdió)", almacenesIdx.get("grandes")?.get("codigo0_workspace_files") === JSON.stringify(grande), String(almacenesIdx.get("grandes")?.get("codigo0_workspace_files")).slice(0, 40));

// LA PRUEBA QUE IMPORTA: ¿se recupera?
const recuperado = await storage.restaurarDeAlmacenGrande(["codigo0_workspace_files", "codigo0_otra"]);
comprobar("★ EL WORKSPACE SE RECUPERA al arrancar", recuperado["codigo0_workspace_files"] === grande);
comprobar("solo devuelve las claves que están en el almacén grande", !("codigo0_otra" in recuperado));

// Y cuando vuelve a caber, el puntero se retira para no dejar rastros.
const rVuelve = storage.saveJSON("codigo0_workspace_files", "pequeño");
comprobar("★ al volver a caber, el puntero se retira", rVuelve.ok === true && viveEnAlmacenGrande("codigo0_workspace_files") === false);

// ═══ 3 · CUOTA LLENA ═══════════════════════════════════════════════════════
console.log("\n3) ★ Cuota llena: el caso que antes era un silencio\n");

almacen.clear();
avisos.length = 0;
const cuotaPrevia = almacen.limite;
almacen.limite = 500; // el doble se llena mucho antes que el tope del módulo
const rCuota = storage.saveJSON("codigo0_chats", "y".repeat(2000));
comprobar("con la cuota llena, no se declara guardado", rCuota.ok === false);
comprobar("el motivo es la cuota, no el tamaño", rCuota.motivo === "cuota", String(rCuota.motivo));
await esperar();
const avisoCuota = avisos[avisos.length - 1];
comprobar("★ se avisa del desenlace real (rescatado en el almacén grande)", avisoCuota.ok === true && /almac[eé]n grande/.test(avisoCuota.detalle), JSON.stringify(avisoCuota));
almacen.limite = cuotaPrevia;

// ═══ 4 · SIN ALMACÉN GRANDE: SE DICE, NO SE TRAGA ═════════════════════════
console.log("\n4) ★ Sin almacén grande disponible: se denuncia\n");

const indexedDBSalvado = (globalThis as any).indexedDB;
delete (globalThis as any).indexedDB;
almacen.clear();
avisos.length = 0;
const rSin = storage.saveJSON("codigo0_mensajes", "z".repeat(MAX_LOCALSTORAGE_BYTES + 10));
comprobar("sin almacén grande no se declara guardado", rSin.ok === false);
await esperar();
const avisoSin = avisos[avisos.length - 1];
comprobar("★ EL FALLO SE CUENTA (antes: console.warn y a seguir)", avisoSin && avisoSin.ok === false, JSON.stringify(avisoSin));
comprobar("★ y explica por qué", /no est[aá] disponible/.test(avisoSin?.detalle || ""), avisoSin?.detalle);
comprobar("el motivo sigue siendo el tamaño, no un error genérico", avisoSin?.motivo === "demasiado-grande");
(globalThis as any).indexedDB = indexedDBSalvado;

// ═══ 5 · EL AVISO LLEGA A LA INTERFAZ ═════════════════════════════════════
console.log("\n5) Enganchado a la interfaz\n");

const app = leerFuente("src/App.tsx");
comprobar("App se suscribe a los fallos de guardado", app.includes("alFallarGuardado("));
comprobar("★ App los enseña en el registro visible", /alFallarGuardado\(\(r\)[\s\S]{0,700}setTerminalLogs/.test(app));
comprobar("★ App recupera del almacén grande al arrancar", app.includes("restaurarDeAlmacenGrande("));
comprobar("★ recupera las claves que importan: workspace, mensajes y chats", /restaurarDeAlmacenGrande\(\[[\s\S]{0,200}WORKSPACE_FILES[\s\S]{0,120}MESSAGES[\s\S]{0,120}SAVED_CHATS/.test(app));
comprobar("el aviso de fallo dice la clave y el motivo", /NO se pudo guardar «\$\{r\.clave\}»/.test(app));

const idxFuente = leerFuente("src/utils/indexedDBStorage.ts");
comprobar("el almacén grande existe con las cuatro operaciones", ["guardarGrande", "leerGrande", "borrarGrande", "clavesGrandes"].every((f) => idxFuente.includes(`export async function ${f}`)));
comprobar("★ la base sube de versión para no perder lo existente", /DB_VERSION = 2/.test(idxFuente) && /onupgradeneeded/.test(idxFuente));
comprobar("y crea los DOS almacenes (imágenes y grandes)", /STORE_NAME\)\)/.test(idxFuente) && /STORE_GRANDE\)\)/.test(idxFuente));

const storageFuente = leerFuente("src/utils/storage.ts");
comprobar("★ la firma declara el resultado (ya no es void)", /export function saveJSON\(key: string, value: unknown\): ResultadoGuardado/.test(storageFuente));
comprobar("★ y no queda ninguna salida que solo avise por consola al no guardar", !/No se guardará\./.test(storageFuente));
comprobar("el rescate se importa en diferido (la capa funciona sin IndexedDB)", /await import\("\.\/indexedDBStorage"\)/.test(storageFuente));

comprobar("esta suite entra en npm run validar", leerFuente("scripts/validar.mjs").includes("persistencia.test.ts"));

// ═══ 6 · LAS LECCIONES YA NO SE QUEDAN EN EL NAVEGADOR (deuda D9) ══════════
console.log("\n6) ★ La lección aprendida llega al cerebro\n");

const auto = leerFuente("src/utils/selfImprovement.ts");
comprobar("★ al aprender, la lección se manda al cerebro", auto.includes('fetch("/api/brain/lesson"'));
comprobar("★ y viaja con su tipo (no se pierde el contexto)", /\[\$\{lesson\.kind\}\] \$\{lesson\.text\}/.test(auto));
comprobar("★ no bloquea el turno del usuario (sin await)", /void fetch\("\/api\/brain\/lesson"/.test(auto));
comprobar("si el cerebro no está, no se rompe nada", /catch\(\(\) => \{[\s\S]{0,220\};\s*\n\s*\}\s*\n\s*\}\s*\n\}\s*\n\nexport function confirmLastLessonsUsed/.test(auto) || auto.includes("la lección ya está en local"));

const servidorFuente = leerFuente("server.ts");
const iLeccion = servidorFuente.indexOf('"/api/brain/lesson"');
comprobar("★ el endpoint ya NO está huérfano (tiene llamador)", iLeccion > 0 && auto.includes("/api/brain/lesson"));
comprobar("★ y ahora tiene guard, porque escribe en la memoria del cerebro", servidorFuente.slice(iLeccion, iLeccion + 400).includes("sandboxAuthorized(req)"));

desuscribir();
console.log(`\n${"─".repeat(56)}`);
console.log(`═══ PERSISTENCIA SIN PÉRDIDAS (CN v1.9.0): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  FALLO → " + f);
  process.exit(1);
}
