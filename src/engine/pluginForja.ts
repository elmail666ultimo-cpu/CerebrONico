/**
 * pluginForja.ts — FORJA v1: el SISTEMA compone el complemento, no el modelo
 * =========================================================================
 * «Generame un plugin para X» → el modelo (o el formulario del Gestor) solo
 * entrega una RECETA: id, nombre, propósito, permisos y herramientas con
 * parámetros. De aquí salen dos archivos y nada más: manifest.json y
 * panel.html, construidos con el kit del puente ya probado (29·0 en E2E) —
 * la parte que no puede fallar no se le dicta a un modelo de 1B.
 *
 * Reglas de la forja:
 *  · Toda tacha se dice ANTES de escribir nada: normalizarReceta acumula
 *    MOTIVOS (una lista, nunca un fallo seco) — corregir y reenviar es la vía.
 *  · El panel generado trae la lógica en un SLOT editable (localStorage del
 *    plugin): sin estrenar, cada herramienta responde un eco honesto con
 *    motivo de su estado; con lógica guardada, esa función ya probada manda.
 *  · Nombres de tool prefijados (fj_<slug>_<herramienta>): ni un complemento
 *    forjado puede pisar una herramienta del motor ni a otro forjado.
 *  · Determinista: misma receta = mismos bytes (los manifiestos sha256 del
 *    proyecto solo tienen sentido si el compilador no improvisa).
 */

export interface ParametroReceta {
  nombre: string;
  descripcion?: string;
  tipo?: "string" | "number" | "boolean";
  requerido?: boolean;
}
export interface HerramientaReceta {
  nombre: string;
  descripcion: string;
  params?: ParametroReceta[];
}
export interface RecetaComplemento {
  id: string;
  nombre: string;
  descripcion: string;
  proposito?: string;
  permisos: string[];
  herramientas: HerramientaReceta[];
  slash: boolean;
}
export type ResultadoReceta =
  | { ok: true; receta: RecetaComplemento }
  | { ok: false; motivos: string[] };

/** Lo que una receta PUEDE pedir. tools.register lo añade el compilador; extensions.register no se forja. */
export const PERMISOS_FORJABLES = ["workspace.read", "workspace.write", "workspace.exec", "chat.read", "chat.send", "storage"] as const;

const ID_RE = /^cn\.[a-z][a-z0-9-]{1,28}$/;
const HERR_RE = /^[a-z][a-z0-9_]{2,28}$/;
const PARAM_RE = /^[a-z][a-z0-9_]{1,20}$/;
const slugDe = (id: string) => id.split(".")[1];

export function normalizarReceta(bruto: unknown, existentes: readonly string[] = []): ResultadoReceta {
  const motivos: string[] = [];
  const o = bruto as Partial<RecetaComplemento> & Record<string, unknown>;
  if (!o || typeof o !== "object") return { ok: false, motivos: ["la receta no es un objeto JSON."] };

  const id = String(o.id || "");
  if (!ID_RE.test(id)) motivos.push('id debe ser «cn.<slug>» (minúsculas, 2–29 tras el punto): llegó "' + id + '".');
  else if ((existentes as string[]).includes(id)) motivos.push(`«${id}» ya existe en extensions/: cámbialo o desinstálalo antes (la forja no pisa trabajos ajenos).`);
  const slug = id.split(".")[1] || "complemento";

  const nombre = String(o.nombre || "").trim();
  if (!nombre || nombre.length > 60) motivos.push("nombre: texto de 1–60 caracteres.");
  const descripcion = String(o.descripcion || "").trim();
  if (!descripcion || descripcion.length > 400) motivos.push("descripcion: 1–400 caracteres (aparece en el catálogo del modelo).");

  const permisos = Array.isArray(o.permisos) ? o.permisos.map(String) : [];
  const ilegales = permisos.filter((p) => !(PERMISOS_FORJABLES as readonly string[]).includes(p));
  if (ilegales.length) motivos.push("permisos no forjables: " + ilegales.join(", ") + " (válidos: " + PERMISOS_FORJABLES.join(" ") + ").");

  const h = Array.isArray(o.herramientas) ? o.herramientas : [];
  if (h.length < 1 || h.length > 3) motivos.push("herramientas: entre 1 y 3 (un plugin que hace de todo no hace nada).");
  const vistas = new Set<string>();
  const herramientas: HerramientaReceta[] = [];
  for (let i = 0; i < Math.min(h.length, 3); i++) {
    const t = (h[i] || {}) as Partial<HerramientaReceta>;
    const tn = String(t.nombre || "");
    if (!HERR_RE.test(tn)) { motivos.push(`herramienta[${i}]: nombre «${tn}» no es identificador ([a-z][a-z0-9_]{2,28}).`); continue; }
    if (vistas.has(tn)) { motivos.push(`herramienta[${i}]: «${tn}» repetida.`); continue; }
    vistas.add(tn);
    if (!String(t.descripcion || "").trim()) motivos.push(`herramienta[${i}] «${tn}»: falta descripcion (el modelo decide con ella).`);
    const ps = Array.isArray(t.params) ? t.params : [];
    if (ps.length > 6) { motivos.push(`herramienta[${i}] «${tn}»: máximo 6 parámetros.`); continue; }
    const visto = new Set<string>();
    const params: ParametroReceta[] = [];
    for (const p of ps) {
      const pn = String((p || {}).nombre || "");
      if (!PARAM_RE.test(pn)) { motivos.push(`param de «${tn}»: nombre «${pn}» inválido.`); continue; }
      if (visto.has(pn)) { motivos.push(`param duplicado «${pn}» en «${tn}».`); continue; }
      visto.add(pn);
      const pt = (p as ParametroReceta).tipo || "string";
      if (!["string", "number", "boolean"].includes(pt)) { motivos.push(`param «${pn}»: tipo «${pt}» no soportado (string|number|boolean).`); continue; }
      params.push({ nombre: pn, descripcion: String((p as ParametroReceta).descripcion || ""), tipo: pt, requerido: !!(p as ParametroReceta).requerido });
    }
    herramientas.push({ nombre: tn, descripcion: String(t.descripcion || "").trim(), params });
  }

  if (motivos.length) return { ok: false, motivos };
  return {
    ok: true,
    receta: { id, nombre, descripcion, proposito: String(o.proposito || "").trim() || undefined, permisos, herramientas, slash: o.slash !== false },
  };
}

const nombreTool = (r: RecetaComplemento, h: string) => `fj_${slugDe(r.id).replace(/-/g, "_")}_${h}`;

// ═══ Compilación determinista ═══════════════════════════════════════════════

export interface ArchivoForjado { path: string; content: string }

export function generarManifest(r: RecetaComplemento): string {
  const m = {
    id: r.id,
    name: r.nombre,
    version: "1.0.0",
    description: r.descripcion,
    author: "Forjado por CerebroNico · FORJA v1",
    main: "panel.html",
    engines: { cerebronico: "^2.0.0" },
    permissions: Array.from(new Set([...r.permisos, "tools.register"])),
    contributes: {
      panels: [{ id: "forja.panel", title: r.nombre.slice(0, 24), icon: "Puzzle", entry: "panel.html", position: "center-tab" }],
      commands: [
        { id: "forja.abrir", title: "Abrir " + r.nombre, slash: slugDe(r.id) },
        ...r.herramientas.map((h) => ({ id: "forja." + h.nombre, title: h.descripcion.slice(0, 60) })),
      ],
      tools: r.herramientas.map((h) => ({
        name: nombreTool(r, h.nombre),
        description: h.descripcion + (r.proposito ? " — " + r.proposito : ""),
        cheap: true,
        handler: "command:forja." + h.nombre,
        parameters: {
          type: "object",
          properties: Object.fromEntries(h.params!.map((p) => [p.nombre, { type: p.tipo, description: p.descripcion }])),
          required: h.params!.filter((p) => p.requerido).map((p) => p.nombre),
        },
      })),
    },
  };
  return JSON.stringify(m, null, 2) + "\n";
}

export function generarPanel(r: RecetaComplemento): string {
  const meta = { id: r.id, nombre: r.nombre, ls: "cn.forja." + r.id + ".logica",
    herramientas: r.herramientas.map((h) => ({ nombre: h.nombre, tool: nombreTool(r, h.nombre),
      params: h.params!.map((p) => ({ n: p.nombre, t: p.tipo, req: !!p.requerido })), })) };
  const muestra = (t: string) => (t === "number" ? "7" : t === "boolean" ? "false" : "hola");
  const L: string[] = [];
  L.push("<!doctype html>");
  L.push('<html lang="es"><head><meta charset="utf-8"><title>' + r.nombre + "</title>");
  L.push('<style>body{font:12px/1.5 ui-monospace,Consolas,monospace;background:#0b101c;color:#cbd5e1;padding:10px;margin:0}h4{margin:0 0 4px;color:#34d399}small{color:#64748b}textarea{width:100%;height:110px;background:#0a0f18;color:#d1fae5;border:1px solid #1e293b;border-radius:8px;padding:8px;font:12px/1.45 ui-monospace,monospace;box-sizing:border-box}button{background:#143227;color:#6ee7b7;border:1px solid #2f5d4a;padding:4px 10px;border-radius:6px;margin:4px 6px 8px 0;cursor:pointer}pre{white-space:pre-wrap;word-break:break-word;background:#0a0f18;border:1px solid #1e293b;border-radius:8px;padding:8px;min-height:60px;margin:4px 0}</style>');
  L.push("</head><body>");
  L.push("<h4>" + r.nombre + " <small>" + r.id + " · forjado por el sistema — esta pestaña es tuya</small></h4>");
  L.push("<div style=\"color:#94a3b8;margin-bottom:6px\">" + r.descripcion.replace(/</g, "&lt;") + "</div>");
  for (const h of meta.herramientas) {
    L.push("<div style=\"color:#64748b\">herramienta <b style=\"color:#6ee7b7\">" + h.tool + "</b>" +
      (h.params.length ? " · params: " + h.params.map((p) => p.n + ":" + p.t).join(" ") : " · sin parámetros") + "</div>");
  }
  L.push("<textarea id=\"logica\" spellcheck=\"false\" placeholder=\"Escribe aquí la lógica (JS). Variables disponibles: nombre (herramienta invocada), params (objeto validado), cn (helpers: say, call).&#10;Devuelve { ok:true, result:... } o { ok:false, motivo:'...' }.\"></textarea>");
  L.push("<button id=\"guardar\">Guardar lógica</button><button id=\"probar\">Probar primera herramienta</button><button id=\"borrar\">Quitar lógica</button>");
  L.push("<pre id=\"out\">Slot " + (r.proposito ? "· propósito: " + r.proposito : "sin estrenar") + ": cada herramienta responderá un eco honesto hasta que guardes lógica arriba. Ese eco no es un fallo: es el contrato diciendo la verdad.</pre>");
  // kit del puente (idéntico al de cn.*, con error||motivo)
  L.push("<script>");
  L.push('"use strict";');
  L.push("var seq=0,pending={},H={};");
  L.push('function call(m,p){return new Promise(function(res,rej){var id="r"+(++seq);pending[id]={res:res,rej:rej};parent.postMessage({cn:1,type:"request",id:id,method:m,params:p||{}},"*");});}');
  L.push('function out(s){document.getElementById("out").textContent=(typeof s==="string"?s:JSON.stringify(s,null,1))+"\\n"+document.getElementById("out").textContent;}');
  L.push('window.addEventListener("message",function(ev){var m=ev.data||{};if(m.cn!==1)return;');
  L.push('if(m.type==="response"){var p=pending[m.id];if(!p)return;delete pending[m.id];if(m.ok)p.res(m.result);else p.rej(m.error||"el host rechazó la petición");}');
  L.push('if(m.type==="command"){var f=H[m.commandId];var done=function(r){var ok=!(r&&r.ok===false);parent.postMessage({cn:1,type:"commandResult",commandId:m.commandId,requestId:m.requestId,ok:ok,result:ok?(r&&r.result!==undefined?r.result:r):undefined,error:ok?undefined:((r&&r.error)||(r&&r.motivo)||"sin motivo declarado")},"*");};');
  L.push('if(!f){done({ok:false,error:"«"+m.commandId+"» no lo declara esta extensión"});return;}');
  L.push('Promise.resolve().then(function(){return f(m.args||{});}).then(done,function(e){done({ok:false,error:String((e&&e.message)||e)});});}});');
  L.push('parent.postMessage({cn:1,type:"ready"},"*");');
  L.push("</script>");
  // lógica del forjado
  L.push("<script>");
  L.push('var META=' + JSON.stringify(meta) + ";");
  L.push("var LOGICA=null,ERR_LOGICA='';");
  L.push("function cargar(){try{var cuerpo=localStorage.getItem(META.ls);if(!cuerpo){LOGICA=null;ERR_LOGICA='';return 'sin lógica guardada — eco honesto';}LOGICA=new Function('nombre','params','cn',cuerpo);ERR_LOGICA='';return 'lógica cargada';}catch(e){LOGICA=null;ERR_LOGICA=String((e&&e.message)||e);return 'lógica guardada ILEGAL: '+ERR_LOGICA;}}");
  L.push("var CN={say:out,call:call,meta:META};");
  L.push("function base(nombre,params){return {ok:true,result:{complemento:META.id,herramienta:nombre,params:params,nota:'slot sin estrenar: escribe JS en la caja del panel o pide al chat que mejore este complemento'}};}");
  L.push("function ejecutar(nombre,params){if(!LOGICA)return base(nombre,params);try{var r=LOGICA(nombre,params,CN);if(r&&typeof r==='object')return (r.ok===false)?{ok:false,motivo:String(r.motivo||r.error||'sin motivo declarado'),result:r}:r;return {ok:true,result:r};}catch(e){return {ok:false,motivo:'la lógica guardada petó: '+String((e&&e.message)||e)+' — el eco sigue disponible'};}");
  L.push("}");
  for (const h of meta.herramientas) {
    L.push('H["forja.' + h.nombre + '"]=async function(a){');
    L.push("  var params=a||{};");
    if (h.params.length) {
      L.push("  var faltan=[],tipos=[];");
      for (const p of h.params) {
        if (p.req) L.push("  if(params['" + p.n + "']===undefined||params['" + p.n + "']==='')faltan.push('" + p.n + "');");
        if (p.t === "number") L.push("  if(params['" + p.n + "']!==undefined&&typeof params['" + p.n + "']!=='number'){if(isFinite(Number(params['" + p.n + "'])))params['" + p.n + "']=Number(params['" + p.n + "']);else tipos.push('" + p.n + ": hacia falta un numero');}");
        if (p.t === "boolean") L.push("  if(params['" + p.n + "']!==undefined&&typeof params['" + p.n + "']!=='boolean')tipos.push('" + p.n + ":booleano');");
      }
      L.push("  if(faltan.length)return{ok:false,motivo:'faltan parámetros: '+faltan.join(', ')+' (el contrato está en la ficha de la herramienta)'};");
      L.push("  if(tipos.length)return{ok:false,motivo:'tipos no compatibles: '+tipos.join(', ')};");
    }
    L.push("  return ejecutar('" + h.nombre + "',params);");
    L.push("};");
  }
  L.push("out('forja: '+cargar());");
  L.push('document.getElementById("guardar").onclick=function(){var cuerpo=document.getElementById("logica").value.trim();if(!cuerpo){out("caja vacía: nada que guardar (así queda el eco honesto).");return;}try{new Function("nombre","params","cn",cuerpo);}catch(e){out("NO se guardó: sintaxis inválida — "+String((e&&e.message)||e));return;}try{localStorage.setItem(META.ls,cuerpo);out("lógica guardada + cargada: "+cargar());}catch(e){out("sintaxis ok pero NO se pudo guardar: "+String((e&&e.message)||e));}};');
  L.push('document.getElementById("borrar").onclick=function(){try{localStorage.removeItem(META.ls);}catch(e){}LOGICA=null;out("lógica quitada: vuelve el eco honesto.");};');
  L.push('document.getElementById("probar").onclick=function(){var h=META.herramientas[0];var args={};if(h)(h.params||[]).forEach(function(p){args[p.n]=p.t==="number"?'+muestra("number")+':p.t==="boolean"?false:"hola";});Promise.resolve(H["forja."+(h?h.nombre:"?")](args)).then(function(r){out("prueba local → "+JSON.stringify(r));});};');
  L.push("</script>");
  L.push("</body></html>");
  return L.join("\n") + "\n";
}

export function generarArchivos(r: RecetaComplemento): ArchivoForjado[] {
  return [
    { path: "manifest.json", content: generarManifest(r) },
    { path: "panel.html", content: generarPanel(r) },
  ];
}

/** Lo que el usuario debe leer después de forjar (una frase, sin prometer clics). */
export function instruccionUso(r: RecetaComplemento): string {
  return `Forjado ${r.id}: recarga el Gestor de extensiones; tendrá pestaña «${r.nombre}»${r.slash ? " y slash /" + slugDe(r.id) : ""} y ${r.herramientas.length} herramienta(s) para el modelo. Su lógica vive en el slot del panel: editable, testeable, y el eco honesto manda hasta que lo estrenes.`;
}
