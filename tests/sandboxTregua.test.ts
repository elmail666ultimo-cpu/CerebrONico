/**
 * sandboxTregua.test.ts — TREGUA v1: las reglas del alto el fuego, probadas
 */
import { cedeElLazo, debePausarSync, avisoPausaSync, pausarSyncManual } from "../src/engine/sandboxTregua";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

// cesión del lazo: cada 8, ni antes ni después
comprobar("el 8 cede", cedeElLazo(8) === true);
comprobar("el 7 no cede", cedeElLazo(7) === false);
comprobar("el 16 cede (segunda tanda)", cedeElLazo(16) === true);
comprobar("el 0 no cede (nada escrito aún)", cedeElLazo(0) === false);
comprobar("negativos no ceden", cedeElLazo(-8) === false);
comprobar("basura no cede", cedeElLazo(NaN) === false && cedeElLazo(1.5) === false);
comprobar("cada configurable", cedeElLazo(3, 3) === true && cedeElLazo(4, 3) === false);
// cada<1 se aplana a 1: «ceder cada 0 o menos» significa «cede siempre»,
// que es el comportamiento seguro (nunca dividir por cero, nunca atragantar)
comprobar("cada<1 se aplana a 1 (cede siempre)", cedeElLazo(1, 0) === true && cedeElLazo(2, -5) === true && cedeElLazo(3, 1) === true);

// pausa del auto-sync: solo con stream vivo, y solo si es de verdad booleano true
comprobar("streaming → pausa", debePausarSync(true) === true);
comprobar("sin streaming → no pausa", debePausarSync(false) === false);
comprobar("basura no pausa (undefined/strings fuera)", debePausarSync(undefined as any) === false && debePausarSync("sí" as any) === false);

// el aviso existe y dice por qué + que reintenta (nunca silencio)
const aviso = avisoPausaSync();
comprobar("aviso nombra el lazo", aviso.includes("lazo"), aviso);
comprobar("aviso promete reintento", /reintenta/.test(aviso), aviso);

// el manual NUNCA se pausa — decisión documentada
comprobar("manual con streaming: no pausa", pausarSyncManual(true) === false);

// simulación del patrón del bucle: 25 archivos → exactamente 3 cesiones (8,16,24)
let cesiones = 0;
for (let i = 1; i <= 25; i++) if (cedeElLazo(i)) cesiones++;
comprobar("25 archivos → 3 cesiones", cesiones === 3, String(cesiones));

console.log(`\n═══ TREGUA: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
