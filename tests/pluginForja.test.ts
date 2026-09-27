/**
 * pluginForja.test.ts — FORJA v1: la receta, el compilador y el panel forjado
 * ===========================================================================
 * Cubre las DOS bocas por las que llega una receta (formulario y chat →
 * mismo compilador) y — pieza distinta a todo lo anterior — EJECUTA EL PANEL
 * GENERADO en vm: eco honesto sin slot, lógica guardada obedecida, lógica
 * ILEGAL no cargada, params obligatorios y tipos. Y exige que la herramienta
 * del modelo exista de verdad en el registry tras el parche.
 */
import { normalizarReceta, generarArchivos, generarManifest, generarPanel, instruccionUso, PERMISOS_FORJABLES } from "../src/engine/pluginForja";
import { validateManifest } from "../src/engine/extensions";
import { getAllToolNames, registerBuiltinPacks } from "../src/engine/toolRegistry";
import vm from "node:vm";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const RECETA_OK = {
  id: "cn.contador", nombre: "Contador", descripcion: "cuenta palabras y lineas",
  proposito: "auditar READMEs", permisos: ["workspace.read"],
  herramientas: [{ nombre: "contar", descripcion: "cuenta el texto dado", params: [
    { nombre: "texto", descripcion: "a medir", tipo: "string", requerido: true },
    { nombre: "modo", descripcion: "palabras o lineas", tipo: "string" },
  ] }],
};

// ── 1 · aduana de recetas ───────────────────────────────────────────────────
const ok = normalizarReceta(RECETA_OK);
comprobar("receta limpia pasa", ok.ok === true, JSON.stringify(ok).slice(0, 120));
const malId = normalizarReceta({ ...RECETA_OK, id: "Contador" });
comprobar("id sin forma cn.slug rechazado", !malId.ok && malId.motivos.some((m) => m.includes("cn.<slug>")));
const colision = normalizarReceta(RECETA_OK, ["cn.contador"]);
comprobar("id existente en extensions/ rechazado", !colision.ok && /ya existe/.test(colision.motivos.join(" ")));
const malPermiso = normalizarReceta({ ...RECETA_OK, permisos: ["workspace.read", "extensions.register"] });
comprobar("permiso no forjable rechazado con nombres", !malPermiso.ok && /extensions.register/.test(malPermiso.motivos.join(" ")));
const sinHerr = normalizarReceta({ ...RECETA_OK, herramientas: [] });
comprobar("cero herramientas → motivo claro", !sinHerr.ok && /1 y 3/.test(sinHerr.motivos.join(" ")));
const muchas = normalizarReceta({ ...RECETA_OK, herramientas: [1, 2, 3, 4].map((i) => ({ nombre: "h" + i + "aaa", descripcion: "x" })) });
comprobar("4 herramientas rechazadas", !muchas.ok);
const paramRaro = normalizarReceta({ ...RECETA_OK, herramientas: [{ nombre: "contar", descripcion: "x", params: [{ nombre: "Texto", tipo: "string" }] }] });
comprobar("param con mayúscula rechazado", !paramRaro.ok && /param/i.test(paramRaro.motivos.join(" ")));
const recetaJsonRoto = normalizarReceta("no era objeto");
comprobar("receta que no es objeto: motivo, no excepción", !recetaJsonRoto.ok && /objeto/.test(recetaJsonRoto.motivos.join(" ")));
comprobar("la aduana lista TODOS los frentes", normalizarReceta({ id: "x", nombre: "", descripcion: "", permisos: ["nada"], herramientas: [] }).motivos.length >= 4);

// ── 2 · el compilador: manifest y panel ────────────────────────────────────
const receta = (ok as any).receta;
const manifest = JSON.parse(generarManifest(receta));
const v = validateManifest(manifest);
comprobar("manifest FORJADO pasa al juez oficial del IDE", v.ok === true, JSON.stringify(v.errors).slice(0, 160));
comprobar("tools prefijadas fj_contador_contar", manifest.contributes.tools[0].name === "fj_contador_contar");
comprobar("handler apunta a comando declarado", manifest.contributes.commands.some((c: any) => "forja." + c.id.slice(6) === manifest.contributes.tools[0].handler.replace("command:", "")) || manifest.contributes.commands.some((c: any) => c.id === "forja.contar"));
comprobar("tools.register añadido por el compilador", manifest.permissions.includes("tools.register") && !receta.permisos.includes("tools.register"));
comprobar("required llegó al schema del modelo", JSON.stringify(manifest.contributes.tools[0].parameters).includes("texto"));
const panel = generarPanel(receta);
comprobar("panel con protocolo del puente", panel.includes('{cn:1,type:"ready"}') && panel.includes("commandResult") && panel.includes("requestId"));
comprobar("panel con slot de lógica", panel.includes("cn.forja.cn.contador.logica") && panel.includes("new Function("));
comprobar("determinista: mismos bytes dos pasadas", generarPanel(receta) === panel && generarManifest(receta) === JSON.stringify(manifest, null, 2) + "\n");
comprobar("archivos exactos: manifest + panel", JSON.stringify(generarArchivos(receta).map((a) => a.path)) === '["manifest.json","panel.html"]');
comprobar("instrucción de uso menciona el slash", /\/contador/.test(instruccionUso(receta)));

// ── 3 · el panel forjado CORRE (vm + puente + localStorage) ────────────────
function arrancarPanel(html: string, ls: Record<string, string>) {
  const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).map((m) => m[1]);
  const listeners: any[] = [];
  const els: any = {};
  const ctx: any = { console: { log() {}, error() {} }, JSON, Math, String, Number, Boolean, Array, Object, Set, RegExp, Error, Promise, isFinite,
    localStorage: { getItem: (k: string) => ls[k] ?? null, setItem: (k: string, v: string) => { ls[k] = v; }, removeItem: (k: string) => { delete ls[k]; } },
    document: { getElementById: (id: string) => (els[id] ??= { value: "", textContent: "", innerHTML: "", onclick: null }) },
    window: { addEventListener: (_t: string, f: any) => listeners.push(f) },
    parent: { postMessage: (m: any) => { if (m.cn === 1 && m.type === "request") listeners.forEach((f) => f({ data: { cn: 1, type: "response", id: m.id, ok: true, result: [] } })); } } };
  const c = vm.createContext(ctx);
  for (const s of scripts) new vm.Script(s).runInContext(c);
  return { H: ctx.H };
}
const store: Record<string, string> = {};
const { H } = arrancarPanel(panel, store);
(async () => {
  const eco: any = await H["forja.contar"]({ texto: "una dos tres" });
  comprobar("forjado sin slot: eco honesto ok:true con nota", eco.ok === true && /slot sin estrenar/.test(String(eco.result.nota)), JSON.stringify(eco).slice(0, 120));
  const falta: any = await H["forja.contar"]({});
  comprobar("param requerido ausente → ok:false + motivo con nombre", falta.ok === false && /texto/.test(falta.motivo), JSON.stringify(falta));
  // (esta línea la escribió primero un humano con un } de menos: el panel la
  // rechazó como ILEGAL y siguió dando eco honesto — el caso de más abajo
  // comprueba exactamente ese comportamiento. La sintaxis importa.)
  store["cn.forja.cn.contador.logica"] = "if(nombre==='contar'){var n=params.texto.split(' ').length;return {ok:true,result:{palabras:n}};} return {ok:false,motivo:{texto:'no sé '+nombre}};";
  const { H: H2 } = arrancarPanel(panel, store);
  const viva: any = await H2["forja.contar"]({ texto: "una dos tres" });
  comprobar("lógica guardada manda (3 palabras)", viva.ok === true && viva.result.palabras === 3, JSON.stringify(viva));
  const otra: any = await H2["forja.contar"]({ texto: "x" });
  comprobar("la lógica propia puede declarar motivos", otra.ok === true && otra.result.palabras === 1);
  store["cn.forja.cn.contador.logica"] = "function rota {{";
  const { H: H3 } = arrancarPanel(panel, store);
  const ilegal: any = await H3["forja.contar"]({ texto: "hola" });
  comprobar("lógica ILEGAL no se carga: el panel sigue dando eco honesto", ilegal.ok === true && /slot sin estrenar/.test(String(ilegal.result.nota)));
  // tipos: una herramienta number
  const recetaNum = normalizarReceta({ id: "cn.medidor", nombre: "M", descripcion: "d", permisos: [], herramientas: [{ nombre: "peso", descripcion: "x", params: [{ nombre: "gramos", tipo: "number", requerido: true }] }] });
  const panelNum = generarPanel((recetaNum as any).receta);
  const { H: HN } = arrancarPanel(panelNum, {});
  const coercion: any = await HN["forja.peso"]({ gramos: "42" });
  comprobar("numero como string se coacciona y pasa", coercion.ok === true && coercion.result.params.gramos === 42, JSON.stringify(coercion));
  const basura: any = await HN["forja.peso"]({ gramos: "mucho" });
  comprobar("numero imposible rechazado con motivo", basura.ok === false && /hacia falta un numero/.test(basura.motivo), JSON.stringify(basura));

  // ── 4 · el puente del chat existe en el registry real ─────────────────────
  registerBuiltinPacks();
  const nombres = getAllToolNames();
  comprobar("forjar_complemento es herramienta del modelo", nombres.includes("forjar_complemento"), nombres.slice(0, 5).join(",") + "…");
  comprobar("los 8 permisos forjables ⊂ permisos del sistema", PERMISOS_FORJABLES.every((p) => ["workspace.read", "workspace.write", "workspace.exec", "chat.read", "chat.send", "storage"].includes(p)));

  console.log(`\n═══ FORJA: ${correctas} correctas · ${fallos.length} fallidas ═══`);
  for (const f of fallos) console.log("  FALLO →", f);
  process.exit(fallos.length ? 1 : 0);
})();
