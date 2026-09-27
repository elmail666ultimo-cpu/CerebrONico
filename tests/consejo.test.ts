/**
 * consejo.test.ts — CONSEJO v1: la vista del consejo, probada sin pantalla
 */
import { agruparConsejo, payloadActivacion, lineaConsejo, nombreCorto, type EstadoConsejoVista } from "../src/engine/consejoVista";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const h = (id: string, activa = true) => ({ id, activa, descripcion: "d-" + id });
const estado: EstadoConsejoVista = {
  total: 51,
  especialistas: Array.from({ length: 12 }, (_, i) => ({ id: "esp" + i })),
  herramientas: [
    ...Array.from({ length: 11 }, (_, i) => h("espejo.a" + i, i < 11)),
    ...Array.from({ length: 10 }, (_, i) => h("clara" + i, true)),
    ...Array.from({ length: 18 }, (_, i) => h("dormida" + i, false)),
  ],
  cuenta: { especialistas: 12, herramientas: 39, activas: 21, dormidas: 18 },
};

const g = agruparConsejo(estado);
comprobar("12 votantes a la vista", g.votantes.length === 12);
comprobar("11 espejos agrupados aparte (V8: +generalista; no son 'herramienta clásica')", g.espejos.length === 11);
comprobar("10 despiertas clásicas", g.despiertas.length === 10);
comprobar("18 dormidas con su botón", g.dormidas.length === 18);
comprobar("nadie se pierde: 11+10+18 = 39 herramientas", g.espejos.length + g.despiertas.length + g.dormidas.length === 39);
comprobar("orden determinista por id", g.dormidas.every((x, i) => i === 0 || g.dormidas[i - 1].id <= x.id));
comprobar("payload exacto del endpoint", JSON.stringify(payloadActivacion("maq.cpu", true)) === '{"id":"maq.cpu","activa":true}');
comprobar("payload de dormir lleva false", payloadActivacion("x", false).activa === false);

const linea = lineaConsejo(estado);
comprobar("línea dice el total", linea.includes("51 entidades"));
comprobar("línea dice espejos despiertos", linea.includes("11 espejos (11 despiertos)"), linea);
comprobar("línea honra las 18 dormidas", linea.includes("18 dormidas esperan su botón"), linea);

comprobar("nombreCorto quita prefijo", nombreCorto("espejo.codigos") === "codigos");
comprobar("nombreCorto sin punto no rompe", nombreCorto("solo") === "solo");

// estado del mundo REAL: sin espejos instalados (v2.5 puro) sigue agrupando sin petar
const puro = agruparConsejo({ total: 40, especialistas: [], herramientas: [h("maq.ram"), h("texto.palabras", false)], cuenta: { especialistas: 0, herramientas: 2, activas: 1, dormidas: 1 } });
comprobar("v2.5 puro: 0 espejos, sin excepción", puro.espejos.length === 0 && puro.despiertas.length === 1 && puro.dormidas.length === 1);
comprobar("agruparConsejo tolera campos ausentes", (() => { try { agruparConsejo({ total: 0 } as any); return true; } catch { return false; } })());

console.log(`\n═══ CONSEJO: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
