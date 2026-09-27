/**
 * puente.test.ts — EL PUENTE Y SUS CAPACIDADES (CN v1.1.0)
 * =======================================================
 * Se prueba lo determinista del puente: la matemática del búfer, la del medidor
 * y los invariantes del plan de dependencias. Lo que NO se prueba aquí —y se
 * dice— es el rendimiento real de una red concreta: eso depende del equipo y se
 * mide ejecutando, no con una prueba unitaria.
 */
import { BufferCircular, medirPuente, compararPuentes, veredicto, type PuenteIA, type Trozo, type MetricasPuente } from "../src/engine/puenteIA";
import { planDeDependencias, comandosPropuestos, REQUISITOS_PUENTE } from "../src/engine/capacidadesPuente";
import { PoolTrozos, JitterAdaptativo, ConmutadorHibrido } from "../src/engine/puenteAdaptativo";

let ok = 0; const fallos: string[] = [];
const c = (n: string, v: boolean, e?: string) => { if (v) ok++; else fallos.push(`${n}${e ? " → " + e : ""}`); };
const trozo = (n: number, txt = "x"): Trozo => ({ n, bytes: new TextEncoder().encode(txt), tRecibido: Date.now() + n });

// ── 1 · BÚFER CIRCULAR ──────────────────────────────────────────────────────
console.log("\n1) Búfer circular\n");
c("capacidad inválida lanza", (() => { try { new BufferCircular(0); return false; } catch { return true; } })());
c("capacidad no entera lanza", (() => { try { new BufferCircular(2.5); return false; } catch { return true; } })());
{
  const b = new BufferCircular(3, "bloquear");
  c("arranca vacío", b.vacio && b.tamano === 0 && !b.lleno);
  b.escribir(trozo(0)); b.escribir(trozo(1));
  c("cuenta lo escrito", b.tamano === 2);
  c("lee en orden FIFO", b.leer()!.n === 0 && b.leer()!.n === 1);
  c("queda vacío tras leer", b.vacio && b.leer() === null);
}
{ // vuelta completa: el índice da la vuelta al array
  const b = new BufferCircular(3, "bloquear");
  for (let i = 0; i < 7; i++) { b.escribir(trozo(i)); b.leer(); }
  b.escribir(trozo(100)); b.escribir(trozo(101));
  c("el índice da la vuelta sin corromper el orden", b.leer()!.n === 100 && b.leer()!.n === 101);
}
{ // política BLOQUEAR: rechaza sin tocar lo que había
  const b = new BufferCircular(2, "bloquear");
  b.escribir(trozo(0)); b.escribir(trozo(1));
  const r = b.escribir(trozo(2));
  c("bloquear: rechaza la escritura", r.ok === false && r.descarto === 0);
  c("bloquear: no pierde nada", b.perdidos === 0 && b.tamano === 2);
  c("bloquear: el contenido anterior intacto", b.drenar().map((t) => t.n).join(",") === "0,1");
}
{ // política DESCARTAR-VIEJO: entra lo nuevo, sale lo más antiguo
  const b = new BufferCircular(2, "descartar-viejo");
  b.escribir(trozo(0)); b.escribir(trozo(1));
  const r = b.escribir(trozo(2));
  c("descartar-viejo: acepta y avisa de lo tirado", r.ok === true && r.descarto === 1);
  c("descartar-viejo: cuenta el perdido", b.perdidos === 1);
  c("descartar-viejo: conserva los ÚLTIMOS", b.drenar().map((t) => t.n).join(",") === "1,2");
}
{ // política DESCARTAR-NUEVO: protege lo que ya estaba
  const b = new BufferCircular(2, "descartar-nuevo");
  b.escribir(trozo(0)); b.escribir(trozo(1));
  const r = b.escribir(trozo(2));
  c("descartar-nuevo: rechaza lo nuevo", r.ok === false);
  c("descartar-nuevo: conserva los PRIMEROS", b.drenar().map((t) => t.n).join(",") === "0,1");
}
{ const b = new BufferCircular(4, "bloquear"); b.escribir(trozo(0)); b.drenar(); c("drenar deja vacío", b.vacio); }

// ── 2 · EL MEDIDOR ──────────────────────────────────────────────────────────
console.log("\n2) Medidor de TTFT\n");
class PuenteFalso implements PuenteIA {
  readonly modo = "FALSO (determinista)";
  constructor(private n: number, private vacio = false) {}
  async conectar(): Promise<void> {}
  async *enviar(): AsyncGenerator<Trozo, void, unknown> {
    for (let i = 0; i < this.n; i++) {
      if (this.vacio) continue;
      await new Promise((r) => setTimeout(r, 1));
      yield { n: i, bytes: new TextEncoder().encode("abcd"), tRecibido: Date.now() };
    }
  }
  async cerrar(): Promise<void> {}
}
{
  const m = await medirPuente(new PuenteFalso(10), "hola", 64);
  c("TTFT medido y no negativo", m.ttftMs >= 0, `${m.ttftMs}`);
  c("cuenta los trozos", m.trozos === 10, `${m.trozos}`);
  c("cuenta los bytes", m.bytes === 40, `${m.bytes}`);
  c("sin pérdidas con búfer holgado", m.perdidos === 0);
  c("el total no es menor que el TTFT", m.totalMs >= m.ttftMs);
  c("la tasa va en bytes/segundo y es positiva", m.bytesPorSegundo > 0);
}
{
  const m = await medirPuente(new PuenteFalso(20), "x", 1, "descartar-viejo");
  c("con búfer de 1 SÍ se pierden trozos", m.perdidos > 0, `perdidos=${m.perdidos}`);
  c("...y por eso los contados son menos que los producidos", m.trozos < 20, `${m.trozos}`);
}
{
  const m = await medirPuente(new PuenteFalso(0, true), "x");
  c("un stream vacío da TTFT -1, NO 0", m.ttftMs === -1, `${m.ttftMs}`);
  c("...y el veredicto lo dice en vez de fingir", veredicto(m).startsWith("SIN DATOS"), veredicto(m));
}
c("umbral fluido", veredicto({ modo: "x", ttftMs: 120, totalMs: 900, trozos: 1, bytes: 1, bytesPorSegundo: 1, perdidos: 0 }).startsWith("FLUIDO"));
c("umbral aceptable", veredicto({ modo: "x", ttftMs: 500, totalMs: 900, trozos: 1, bytes: 1, bytesPorSegundo: 1, perdidos: 0 }).startsWith("ACEPTABLE"));
c("umbral lento", veredicto({ modo: "x", ttftMs: 1500, totalMs: 900, trozos: 1, bytes: 1, bytesPorSegundo: 1, perdidos: 0 }).startsWith("LENTO"));
{
  const r = await compararPuentes([{ puente: new PuenteFalso(3), entrada: "a" }, { puente: new PuenteFalso(5), entrada: "a" }]);
  c("comparar devuelve un resultado por puente", r.length === 2);
  c("...y cada uno con su modo", r[0].modo !== undefined && r[1].modo !== undefined);
}

// ── 3 · CAPACIDADES: DETECTAR SÍ, INSTALAR NO ───────────────────────────────
console.log("\n3) Plan de dependencias\n");
c("los ids de requisito son únicos", new Set(REQUISITOS_PUENTE.map((r) => r.id)).size === REQUISITOS_PUENTE.length);
c("todos explican PARA QUÉ sirven", REQUISITOS_PUENTE.every((r) => r.paraQue.length > 30));
c("todos traen cómo obtenerlo", REQUISITOS_PUENTE.every((r) => r.comoObtener.length > 5));
c("todos traen su detección", REQUISITOS_PUENTE.every((r) => r.deteccion.length > 5));
{
  const vacio = planDeDependencias({});
  c("sin nada comprobado, faltan todos", vacio.faltanImprescindibles.length + vacio.faltanOpcionales.length === REQUISITOS_PUENTE.length);
  c("cuenta los imprescindibles", vacio.faltanImprescindibles.length >= 2, `${vacio.faltanImprescindibles.length}`);
  c("INVARIANTE: con algo instalable pendiente, SIEMPRE pide confirmación", vacio.requiereConfirmacion === true);
  c("separa lo que no se arregla instalando", vacio.noInstalables.length >= 1);
  c("el resumen nombra los imprescindibles",
    vacio.faltanImprescindibles.every((r) => vacio.resumen.includes(r.nombre)));
  c("los comandos propuestos son uno por instalable", comandosPropuestos(vacio).length === vacio.instalables.length);
}
{
  const todos: Record<string, boolean> = {};
  for (const r of REQUISITOS_PUENTE) todos[r.id] = true;
  const p = planDeDependencias(todos);
  c("con todo presente no falta nada", p.faltanImprescindibles.length === 0 && p.faltanOpcionales.length === 0);
  c("...y no hay nada que confirmar", p.requiereConfirmacion === false);
  c("...y el resumen lo dice", p.resumen.includes("Todo listo"));
  c("...y pesa 0 MB", p.pesoTotalMb === 0);
}
{
  // Un estado PARTIDO: es el caso que más importa, porque es el que se da en la vida real.
  const partido = { "node-fetch-stream": true, "ollama-vivo": true };
  const p = planDeDependencias(partido);
  c("cuenta los presentes", p.listos.length === 2, `${p.listos.length}`);
  c("lo no comprobado NO se da por ausente ni por presente: se reporta como falta", p.faltanImprescindibles.length + p.faltanOpcionales.length === REQUISITOS_PUENTE.length - 2);
  c("con el imprescindible presente, ya no lo lista como crítico",
    !p.faltanImprescindibles.some((r) => r.id === "ollama-vivo"));
}

// (el cierre va al final del archivo, tras las secciones 4-6)

// ── 4 · POOL: LA PRUEBA DE QUE ES UN POOL Y NO UN ENVOLTORIO ────────────────
console.log("\n4) Pool de buffers (zero-allocation)\n");
{
  c("capacidad inválida lanza", (() => { try { new PoolTrozos(0); return false; } catch { return true; } })());
  c("tamano de trozo inválido lanza", (() => { try { new PoolTrozos(2, 0); return false; } catch { return true; } })());
  const p = new PoolTrozos(8, 128);
  c("warm-up: todo reservado al arrancar", p.disponibles === 8 && p.creados === 8);
  c("arranca sin prestamos", p.prestamos === 0 && p.agotamientos === 0);
  // 100 ciclos completos: el numero de reservas NO debe moverse.
  for (let i = 0; i < 100; i++) { const b = p.tomar()!; b[0] = i % 255; p.devolver(b); }
  c("tras 100 ciclos NO se ha reservado memoria nueva", p.creados === 8, `creados=${p.creados}`);
  c("...y la tasa de reuso es 1", p.tasaReuso === 1, `${p.tasaReuso}`);
  c("...y no hubo agotamientos", p.agotamientos === 0, `${p.agotamientos}`);
  c("...y se contaron los 100 prestamos", p.prestamos === 100, `${p.prestamos}`);
  c("el buffer vuelve limpio", (() => { const b = p.tomar()!; const sucio = b.some((x) => x !== 0); p.devolver(b); return !sucio; })());
  c("el buffer tiene el tamano prometido", p.tomar()!.length === 128);
}
{
  const p = new PoolTrozos(2, 64);
  const a = p.tomar()!, b = p.tomar()!;
  c("al agotarse devuelve null", p.tomar() === null);
  c("...y lo cuenta en vez de callarse", p.agotamientos === 1);
  c("...y NO reserva por su cuenta", p.creados === 2, `creados=${p.creados}`);
  p.devolver(a); p.devolver(b);
  c("al devolver, vuelve a haber", p.disponibles === 2);
  c("no se puede devolver mas de la capacidad", (() => { p.devolver(new Uint8Array(64)); p.devolver(new Uint8Array(64)); return p.disponibles === 2; })());
  c("devolver un buffer ajeno (otro tamano) se ignora", (() => { p.devolver(new Uint8Array(999)); return p.disponibles === 2; })());
}

// ── 5 · JITTER ADAPTATIVO: QUE ADAPTE DE VERDAD, EN LOS DOS SENTIDOS ───────
console.log("\n5) Bufer de jitter adaptativo\n");
{
  c("rango inválido lanza", (() => { try { new JitterAdaptativo({ minMs: 10, maxMs: 5 }); return false; } catch { return true; } })());
  const j = new JitterAdaptativo({ minMs: 10, maxMs: 200, umbralInestableMs: 6, umbralEstableMs: 2, muestrasParaEncoger: 4 });
  c("arranca en el minimo", j.tamanoMs === 10);
  c("sin datos esta midiendo", j.estado === "midiendo");
  // Llegadas perfectamente regulares: jitter 0, estable.
  let t = 0;
  for (let i = 0; i < 6; i++) { j.observar(t); t += 20; }
  c("con llegadas regulares el jitter es 0", j.jitterMs === 0, `${j.jitterMs}`);
  c("...y el estado es estable", j.estado === "estable");
  // Ahora irregular: se MIDE antes de tocar el tamano, no se supone.
  for (let i = 0; i < 8; i++) { j.observar(t); t += i % 2 === 0 ? 2 : 40; }
  c("con llegadas irregulares el jitter sube", j.jitterMs > 6, `${j.jitterMs}`);
  c("...y el estado pasa a inestable", j.estado === "inestable");
  c("...y el bufer se EXPANDE", j.expansiones > 0, `exp=${j.expansiones}`);
  c("...y ya no esta en el minimo", j.tamanoMs > 10, `${j.tamanoMs}`);
  // Y ahora vuelve: ESTO es lo que separa adaptativo de «bufer grande».
  const expandido = j.tamanoMs;
  for (let i = 0; i < 40; i++) { j.observar(t); t += 20; }
  c("al estabilizarse, se ENCOGE (no se queda grande)", j.contracciones > 0, `con=${j.contracciones}`);
  c("...y termina por debajo de donde llego a expandirse", j.tamanoMs < expandido, `${j.tamanoMs} < ${expandido}`);
  c("...y no baja del minimo", j.tamanoMs >= 10, `${j.tamanoMs}`);
  c("...y no pasa del maximo", j.tamanoMs <= 200, `${j.tamanoMs}`);
  const k = new JitterAdaptativo({ minMs: 10, maxMs: 20, umbralInestableMs: 1 });
  let u = 0;
  for (let i = 0; i < 30; i++) { k.observar(u); u += i % 3 === 0 ? 1 : 30; }
  c("el tope superior se respeta aunque el jitter sea enorme", k.tamanoMs <= 20, `${k.tamanoMs}`);
  c("reiniciar lo devuelve al minimo", (() => { k.reiniciar(); return k.tamanoMs === 10; })());
}

// ── 6 · CONMUTACION: Y LA HISTERESIS, QUE ES LO QUE CASI NADIE PONE ────────
console.log("\n6) Conmutacion hibrida\n");
class P implements PuenteIA { readonly modo = "P"; async conectar() {} async *enviar(): AsyncGenerator<Trozo, void, unknown> {} async cerrar() {} }
const mkSw = (o?: any) => new ConmutadorHibrido({ local: new P(), nube: new P() }, o);
{
  const s = mkSw();
  c("arranca en local", s.modoActual === "local" && s.conmutaciones === 0);
  c("carga local saturada -> nube", (() => { const t = mkSw({ muestrasMinimas: 0 }); return t.decidir({ cargaLocal: 0.99, pingNubeMs: 50 }) === "nube"; })());
  c("red caida -> local", (() => { const t = mkSw({ muestrasMinimas: 0 }); return t.decidir({ cargaLocal: 0.1, pingNubeMs: -1 }) === "local"; })());
  c("red lenta y local tranquilo -> local", (() => { const t = mkSw({ muestrasMinimas: 0 }); return t.decidir({ cargaLocal: 0.1, pingNubeMs: 900 }) === "local"; })());
  c("los DOS degradados: NO conmuta para no sumar un corte", (() => {
    const t = mkSw({ muestrasMinimas: 0 });
    const antes = t.decidir({ cargaLocal: 0.1, pingNubeMs: 20 });
    t.decidir({ cargaLocal: 0.99, pingNubeMs: 900 });
    return t.decidir({ cargaLocal: 0.99, pingNubeMs: 900 }) === antes;
  })());
  c("...y lo deja escrito en la bitacora", (() => {
    const t = mkSw({ muestrasMinimas: 0 });
    t.decidir({ cargaLocal: 0.99, pingNubeMs: 900 });
    return t.bitacora.some((l) => l.includes("no sumar un corte"));
  })());
}
{
  // EL CASO QUE IMPORTA: justo en el umbral, sin histéresis seria un metralleo.
  const t = mkSw({ muestrasMinimas: 5, cargaMaximaLocal: 0.85 });
  // La PRIMERA decisión conmuta de inmediato, y es lo correcto: en arranque en
  // frío no hay canal establecido que romper, así que retenerla sólo añadiría
  // latencia. La histéresis existe para impedir conmutaciones REPETIDAS, no para
  // retrasar la primera. (La primera versión de esta prueba esperaba lo segundo;
  // medir el código dejó claro cuál de las dos cosas era la útil.)
  t.decidir({ cargaLocal: 0.99, pingNubeMs: 20 });
  c("la primera decision conmuta sin esperar", t.conmutaciones === 1, `${t.conmutaciones}`);
  // Ahora la señal CAMBIA de lado (se libera la carga local): hay una petición
  // de volver a local, y es la que la histéresis debe retener. Sin esto la prueba
  // no ejercitaba nada — pedir lo mismo no es pedir un cambio.
  // Para ejercitar la histéresis hace falta un MOTIVO POSITIVO de volver, no una
  // señal sana: con todo en rango el conmutador se queda donde está (y eso es lo
  // correcto — volver «porque sí» sería justo el flapeo que se quiere evitar).
  // Así que se pide local por una razón de peso: la red se pone lenta.
  t.decidir({ cargaLocal: 0.1, pingNubeMs: 900 });
  c("HISTERESIS: un cambio pedido de inmediato NO conmuta", t.conmutaciones === 1, `${t.conmutaciones}`);
  c("...y la bitacora dice que se retuvo", t.bitacora.some((l) => l.includes("retenida")), t.bitacora.join(" | ").slice(0, 220));
  c("...y el motivo queda registrado", t.bitacora.some((l) => l.startsWith("→ nube:")));
  // Y no vuelve de inmediato aunque la senal cambie.
  t.decidir({ cargaLocal: 0.1, pingNubeMs: 20 });
  c("no vuelve de inmediato: sigue contando la histeresis", t.conmutaciones === 1, `${t.conmutaciones}`);
}
{
  const t = mkSw({ muestrasMinimas: 3 });
  for (let i = 0; i < 20; i++) t.decidir({ cargaLocal: i % 2 === 0 ? 0.99 : 0.1, pingNubeMs: 20 });
  // El techo lo fija la propia histéresis: 20 muestras no pueden dar más de
  // 20/muestrasMinimas + 1 conmutaciones. No es un número elegido a gusto.
  const techo = Math.floor(20 / 3) + 1;
  c("20 muestras oscilando producen como mucho lo que permite la histeresis", t.conmutaciones <= techo, `${t.conmutaciones} <= ${techo}`);
}

console.log(`\n═══ PUENTE ADAPTATIVO (CN v1.2.0): ${ok} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) { console.log("\nFALLOS:"); for (const f of fallos) console.log("  ✗ " + f); process.exit(1); }
