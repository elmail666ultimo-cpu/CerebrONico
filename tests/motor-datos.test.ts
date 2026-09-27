/**
 * motor-datos.test.ts — BASE DE DATOS DEL MOTOR, VERSIÓN Y PERFIL DE MODELOS (v8.0.1)
 * =================================================================================
 * Cubre los tres frentes que se tocaron en esta entrega y que comparten una
 * misma propiedad: **una sola fuente de verdad**. Cuando algo tiene dos fuentes,
 * tarde o temprano se contradicen; los tres defectos de esta suite son
 * exactamente eso, con tres disfraces distintos:
 *
 *   1. La VERSIÓN estaba escrita dos veces dentro del mismo objeto (`VERSION` y
 *      `FULL_NAME`) y cuatro veces más suelta. Resultado: la cabecera decía
 *      V8.0.0 y el menú CN decía V1.0.3. → `IDE_BRAND` deriva de una semilla.
 *   2. El PERFIL DEL MODELO se decidía por el nombre, así que un modelo
 *      renombrado (`nemesis:latest` = un gpt-oss de la nube) se clasificaba como
 *      local diminuto: sin herramientas, contexto 8192 y salida truncada a 1200
 *      tokens. → tabla de alias + una sola lista blanca.
 *   3. La SEMILLA de conocimiento existía dos veces (constructor y `fromJSON`),
 *      así que al recargar desde disco se caían los manuales. → una constante.
 *
 * Y encima de (3), la ampliación pedida: el PACK DE CÓDIGO. Se verifica que
 * está bien formado, que la recuperación devuelve la entrada correcta para
 * consultas escritas como las escribiría el usuario, y —lo más importante— que
 * NO desplaza a las reglas del motor en la puntuación.
 */
import * as fs from "fs";
import * as path from "path";
// ESM: `__dirname` no existe (ver `err-esm-require` en el propio pack de código).
import { fileURLToPath } from "url";
import {
  KnowledgeBase,
  KB_SEED,
  SEMILLA_COMPLETA,
  buildEngineContext,
  tokenize,
} from "../src/engine/knowledgeBase";
import { KB_CODIGO, VERSIONES_VERIFICADAS } from "../src/engine/kbCodigo";
import {
  getModelProfile,
  registrarAliasDeModelo,
  resolverAliasDeModelo,
  aliasDeModelo,
  shouldRunAgentLoop,
} from "../src/engine/modelTiers";
import { IDE_BRAND } from "../src/constants";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ════════════════════════════════════════════════════════════════════════════
// 1 · VERSIÓN: una semilla, dos formas, cero literales huérfanos
// ════════════════════════════════════════════════════════════════════════════
console.log("\n1) La versión no puede contradecirse consigo misma\n");

// v0.9 — La etiqueta visible ya NO es la semver con una «V» delante: se deriva
// quitando el `.0` final, para poder enseñar «V0.9» con la semilla en «0.9.0».
// La invariante que importa sigue siendo la misma y es la que se prueba: la
// etiqueta NO puede existir sin la semilla, y no hay forma de escribir una sin
// la otra.
comprobar(
  "VERSION deriva de SEMVER, sin tocar un solo dígito",
  IDE_BRAND.VERSION === `V${IDE_BRAND.SEMVER}`,
  `${IDE_BRAND.VERSION} vs ${IDE_BRAND.SEMVER}`
);
// v1.0.0 — Aquí había `=== "V0.9"`, un literal escrito a mano en la prueba. Y
// antes hubo un `replace(/\.0$/, "")` en el motor, que convertía 1.0.0 en
// «V1.0» comiéndose un dígito pedido por el usuario. Las dos formas son el mismo
// error: una prueba que clava la versión de HOY falla el día que sube la
// versión, y una derivación lista convierte un dato con formato propio en otra
// cosa. Se comprueba la RELACIÓN (que la etiqueta sale de la semilla), que es lo
// único que tiene que seguir siendo verdad siempre.
comprobar("el nombre completo es el nombre más la etiqueta", IDE_BRAND.FULL_NAME === `${IDE_BRAND.NAME} ${IDE_BRAND.VERSION}`, IDE_BRAND.FULL_NAME);
// El invariante que de verdad importa, y que NO caduca al subir versión:
// la etiqueta visible tiene EXACTAMENTE un carácter más que la semilla (la «V»).
// Así se caza el recorte de «.0» sin clavar el número de hoy.
comprobar("la etiqueta visible no ha perdido ningún dígito",
  IDE_BRAND.VERSION === `V${IDE_BRAND.SEMVER}` && IDE_BRAND.VERSION.length === IDE_BRAND.SEMVER.length + 1,
  `${IDE_BRAND.VERSION} vs ${IDE_BRAND.SEMVER}`);
comprobar(
  "el sufijo de VERSION y el de FULL_NAME son EL MISMO string (el defecto reportado)",
  IDE_BRAND.VERSION === "V" + IDE_BRAND.FULL_NAME.split(" ").pop()!.replace(/^V/, ""),
  `${IDE_BRAND.VERSION} / ${IDE_BRAND.FULL_NAME}`
);
comprobar("SEMVER es semver de verdad", /^\d+\.\d+\.\d+$/.test(IDE_BRAND.SEMVER), IDE_BRAND.SEMVER);

// El bug fue: cabecera V8.0.0 + menú CN V1.0.3. Se comprueba sobre el código
// fuente para que no pueda volver a colarse un literal suelto.
const constants = leer("src/constants.ts");
comprobar("constants.ts tiene UNA sola semilla de versión", (constants.match(/^\s*const VERSION_SEMVER = "[^"]+";/m) || []).length === 1);
comprobar(
  "y VERSION/FULL_NAME se DERIVAN, no se escriben al lado",
  /VERSION: VERSION_ETIQUETA/.test(constants) &&
    /FULL_NAME: `CerebróNico \$\{VERSION_ETIQUETA\}`/.test(constants) &&
    /const VERSION_ETIQUETA = `V\$\{VERSION_SEMVER\}`/.test(constants) &&
    // Y la prueba vigila que NO vuelva a colarse un recorte de dígitos.
    !/VERSION_SEMVER\.replace\(/.test(constants)
);
comprobar("y no queda NINGUNA otra semilla de versión suelta", (constants.match(/const VERSION_[A-Z]+ =/g) || []).length === 2);
comprobar("la versión está sincronizada con package.json", JSON.parse(leer("package.json")).version === IDE_BRAND.SEMVER);

const header = leer("src/components/Header.tsx");
comprobar("el atributo title del menú CN ya no lleva versión literal", !/title="Menú principal — [^"]*V\d/.test(header) && /title=\{`Menú principal — \$\{IDE_BRAND\.FULL_NAME\}/.test(header));
comprobar("la cabecera sigue leyendo IDE_BRAND.VERSION", /IDE_BRAND\.VERSION/.test(header));
comprobar("el menú CN sigue leyendo IDE_BRAND.FULL_NAME", /IDE_BRAND\.FULL_NAME/.test(header));

// ── v1.6.33 — «Acerca de» era la ÚLTIMA fuente paralela de versión ─────────
// Reporte con captura: la pestaña del navegador decía V1.6.31 y el panel
// «Acerca de» decía «CerebroNico IDE v2.0.0». Dos fuentes más en el mismo
// defecto que esta suite ya cazó en la cabecera: App.tsx pasaba un literal por
// prop y el panel traía default propio («1.8.0»). Se pasó a la semilla.
// ── v1.16.0 — pedido del usuario: fuera el número de versión de «Acerca de» ─
// Se olvidaba actualizarlo y la interfaz quedaba desincronizada. Ahora la
// pestaña muestra la marca sin etiqueta de versión; la semilla única sigue
// viviendo en la cabecera y en la pestaña del navegador, no aquí.
const pro = leer("src/components/ProConfigPanel.tsx");
const app = leer("src/App.tsx");
// Se ancla al PRINCIPIO de línea: una prop o un default viven ahí. Así la
// propia nota que explica el arreglo (que menciona los nombres retirados) no
// hace fallar la auditoría que vigila el código de verdad.
comprobar("el panel «Acerca de» ya no admite versión por prop", !/\n\s*version\?:\s*string/.test(pro) && !/\n\s*version\s*=\s*"/.test(pro));
comprobar("«Acerca de» ya NO muestra versión (marca sin etiqueta)", /IDE_BRAND\.NAME/.test(pro) && !/IDE_BRAND\.FULL_NAME/.test(pro));
comprobar("«Acerca de» toma el autor de la marca, no de un literal", /IDE_BRAND\.AUTHOR/.test(pro) && !/Mario Nicolas Quintero/.test(pro));
comprobar("App.tsx ya no le pasa una versión literal al panel", !/\n\s*version="/.test(app));
comprobar("y el panel no vuelve a escribir una versión visible propia", !/IDE v\{version\}/.test(pro));

// ── v1.6.33 — la misma familia, en los textos que el usuario LEE ───────────
// El README semilla del workspace y el README que viaja dentro de cada paquete
// `.cn` firmaban «CerebroNico IDE v1» con el autor escrito a mano. Se derivan
// de la marca: si el ZIP es V1.6.33, el documento no puede decir v1.
const fp = leer("src/utils/fileParser.ts");
comprobar("el README semilla del workspace no firma «v1»", !/# CerebroNico IDE v1/.test(app) && !/\*\*Marca\*\*: CerebroNico IDE v1/.test(app));
comprobar("el README semilla deriva nombre y autor de la marca", /\$\{IDE_BRAND\.FULL_NAME\}/.test(app) && /por \$\{IDE_BRAND\.AUTHOR\}/.test(app));
comprobar("el README del paquete .cn usa la marca real", /\$\{IDE_BRAND\.FULL_NAME\} — Workspace Package/.test(fp) && !/# CerebroNico IDE v1 — Workspace Package/.test(fp));
comprobar("el manifiesto del .cn se firma con la marca (formato sigue v1)", /ide: IDE_BRAND\.FULL_NAME/.test(fp) && /formatVersion: 1/.test(fp));

const html = leer("index.html");
// v0.9 — Se compara contra `IDE_BRAND.FULL_NAME` y no contra un patrón de
// semver. El patrón anterior exigía «Vx.y.z», y la etiqueta visible es «V0.9»:
// la prueba habría fallado por exigir MÁS precisión de la que el usuario quiere
// ver. Ahora comprueba lo que de verdad importa —que el title estático y la
// cabecera digan LO MISMO— y se mantiene solo cuando cambie la versión.
comprobar(
  "index.html: el title estático coincide con la fuente única",
  html.includes(`<title>${IDE_BRAND.FULL_NAME}</title>`),
  (html.match(/<title>[^<]*<\/title>/) || [""])[0]
);
comprobar("index.html: el og:title también", html.includes(`content="${IDE_BRAND.FULL_NAME}"`));
comprobar("index.html: og:title sin restos de v1.0/v2.3", !/content="CerebróNico v1\.0"/.test(html) && !/CerebroNico IDE v2\.3/.test(html));

const exp = leer("src/utils/markdownExport.ts");
comprobar("el informe técnico toma la versión del motor", /title = `Informe Técnico — \$\{IDE_BRAND\.FULL_NAME\}`/.test(exp) && /Generado por:\*\* \$\{IDE_BRAND\.FULL_NAME\}/.test(exp));
// v0.9 — Y la TERCERA línea del informe, la del pie, que se había escapado a los
// arreglos de v8.0.1 y seguía estampando «CerebroNico V2.1» en un documento que
// el usuario exporta y reenvía.
comprobar(
  "el pie del informe exportado también sale de la fuente única",
  /Informe generado automáticamente por \$\{IDE_BRAND\.FULL_NAME\}/.test(exp)
);

// ============================================================
// v0.9 — BARRIDO: ninguna versión de producto antigua puede volver
// ------------------------------------------------------------
// Los literales de versión se esconden donde nadie mira: en el saludo del modo
// demo, en el pie de un informe exportado, en 13 cabeceras de comentario. Uno a
// uno se escapan siempre. Esto los busca TODOS, y falla si reaparece cualquiera
// que no sea V0.9.
//
// `main.tsx` se excluye a propósito: cita «CerebroNico V2.1» para explicar un
// defecto histórico, y borrar la cita falsearía la explicación. Un registro
// honesto conserva lo que pasó; lo que no puede es repetirlo como si fuera
// actual.
// ============================================================
const sospechosos: string[] = [];
(function recorrerSrc(dir: string) {
  for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    if (["node_modules", "dist"].includes(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      recorrerSrc(rel);
      continue;
    }
    if (!/\.(ts|tsx|css)$/.test(e.name)) continue;
    if (rel.endsWith("main.tsx")) continue;
    for (const m of leer(rel).matchAll(/CerebroNico V\d[\w.]*/g)) {
      if (!/^CerebroNico V0\.9/.test(m[0])) sospechosos.push(`${rel}: ${m[0]}`);
    }
  }
})("src");
comprobar("no queda ninguna versión de producto antigua en src/", sospechosos.length === 0, sospechosos.slice(0, 6).join(" | "));

// ════════════════════════════════════════════════════════════════════════════
// 2 · MODELOS RENOMBRADOS: el 120B de la nube no puede recibir trato de nano
// ════════════════════════════════════════════════════════════════════════════
console.log("\n2) Un modelo renombrado hereda su perfil real\n");

const nemesis = getModelProfile("NEMESIS:latest");
comprobar("nemesis:latest se resuelve a su canónico", resolverAliasDeModelo("NEMESIS:latest") === "gpt-oss:120b-cloud");
comprobar("se clasifica como NUBE, no como local", nemesis.tier === "cloud" && nemesis.remote === true);
comprobar("y lo dice en las notas (no lo arregla en silencio)", nemesis.notes.some((n) => /alias de/.test(n)));
comprobar("hereda el tamaño del canónico (120B)", nemesis.paramsB === 120);
comprobar("entra al bucle de agente (antes: NO)", nemesis.toolCapable === true && shouldRunAgentLoop("NEMESIS:latest") === true);
comprobar("contexto de nube, no 8192 de local", nemesis.numCtx === 32768);
comprobar("no se le trunca la salida a 1200 tokens", nemesis.numPredict === -1);
comprobar("no lleva las tijeras de RAM baja", !nemesis.notes.some((n) => /≤8 GB/.test(n)));
comprobar("el alias queda expuesto para la UI", nemesis.aliasDe === "gpt-oss:120b-cloud" && aliasDeModelo("NEMESIS:latest") === "gpt-oss:120b-cloud");

// La transparencia es parte del arreglo: los modelos normales no cambian.
comprobar("un modelo normal NO se toca", resolverAliasDeModelo("qwen2.5-coder:7b") === "qwen2.5-coder:7b" && aliasDeModelo("qwen2.5-coder:7b") === null);
const local = getModelProfile("qwen2.5:0.5b", 8);
comprobar("un local diminuto sigue siendo micro sin herramientas", local.tier === "micro" && local.toolCapable === false);
comprobar("y con 8 GB sigue recibiendo sus tijeras", local.notes.some((n) => /≤8 GB/.test(n)));
const gptOss = getModelProfile("gpt-oss:120b-cloud");
comprobar("el canónico por su nombre da el mismo perfil que el alias", gptOss.tier === nemesis.tier && gptOss.numCtx === nemesis.numCtx && gptOss.toolCapable === nemesis.toolCapable);

// Registro en caliente: cualquier otro renombre se declara en una línea.
registrarAliasDeModelo("mi-qwen", "qwen2.5-coder:7b");
comprobar("registrar un alias funciona", resolverAliasDeModelo("mi-qwen") === "qwen2.5-coder:7b");
comprobar("y hereda su tier", getModelProfile("mi-qwen").tier === getModelProfile("qwen2.5-coder:7b").tier);
registrarAliasDeModelo("", "");
comprobar("registrar basura no rompe la tabla", resolverAliasDeModelo("qwen2.5-coder:7b") === "qwen2.5-coder:7b");

// Una sola lista blanca: el cliente ya no decide distinto que el servidor.
const engineCli = leer("src/utils/engine.ts");
comprobar("el cliente delega la decisión de herramientas en el perfil", /function isToolCapableModelName\(modelName: string\): boolean \{\s*return shouldRunAgentLoop\(modelName\);\s*\}/.test(engineCli));
comprobar("y ya no mantiene su propia regex de modelos", !engineCli.includes("llama3\\.|llama-3"));

// ════════════════════════════════════════════════════════════════════════════
// 3 · LA BASE DE DATOS DEL MOTOR, AMPLIADA
// ════════════════════════════════════════════════════════════════════════════
console.log("\n3) El pack de código está bien formado y la semilla es una sola\n");

comprobar("el pack añade entradas de verdad", KB_CODIGO.length >= 25, `${KB_CODIGO.length}`);
const ids = [...SEMILLA_COMPLETA.map((e) => e.id)];
comprobar("no hay ids duplicados en toda la semilla", new Set(ids).size === ids.length, `${ids.length} vs ${new Set(ids).size}`);
comprobar("ninguna entrada se queda sin id/título/cuerpo", SEMILLA_COMPLETA.every((e) => e.id && e.title && e.body));
comprobar("ninguna entrada se queda sin claves", SEMILLA_COMPLETA.every((e) => Array.isArray(e.keys) && e.keys.length > 0));
comprobar("ninguna clave con espacios repetidos", KB_CODIGO.every((e) => new Set(e.keys).size === e.keys.length));
comprobar("las tablas del pack son de las declaradas", KB_CODIGO.every((e) => ["rule", "syntax", "error", "pattern"].includes(e.table)));
comprobar("el pack entra en la semilla completa", SEMILLA_COMPLETA.some((e) => e.id === "syn-react19-useref") && SEMILLA_COMPLETA.some((e) => e.id === "err-dist-viejo"));
comprobar("...y la semilla crece de verdad", SEMILLA_COMPLETA.length >= KB_SEED.length + KB_CODIGO.length, `${KB_SEED.length} + ${KB_CODIGO.length} → ${SEMILLA_COMPLETA.length}`);
comprobar("las versiones del pack son semver", /^\d+\.\d+\.\d+$/.test(VERSIONES_VERIFICADAS.react) && /^\d+\.\d+\.\d+$/.test(VERSIONES_VERIFICADAS.tailwindcss));

// El defecto de la semilla partida: recargar desde disco perdía los manuales.
const persistida = new KnowledgeBase().toJSON();
const recargada = KnowledgeBase.fromJSON(persistida);
comprobar("recargar desde disco conserva TODO el conocimiento", recargada.size() === new KnowledgeBase().size(), `${recargada.size()} vs ${new KnowledgeBase().size()}`);
comprobar("...incluido el pack de código", recargada.all().some((e) => e.id === "syn-react19-useref"));
const enDiscoVacio = KnowledgeBase.fromJSON(JSON.stringify({ version: 2, entries: [] }));
comprobar("con un disco vacío, la semilla repuebla igual", enDiscoVacio.size() === new KnowledgeBase().size());
comprobar("y un json corrupto no deja la base a cero", KnowledgeBase.fromJSON("{no es json").size() === new KnowledgeBase().size());

// ── La recuperación tiene que acertar con consultas reales ───────────────────
const kb = new KnowledgeBase();
const top = (q: string) => kb.query(q, 3)[0]?.entry.id;

comprobar("«useRef sin argumento en React 19» → su entrada", top("useRef exige argumento inicial en React 19") === "syn-react19-useref", String(top("useRef exige argumento inicial en React 19")));
comprobar("«dos versiones distintas / bundle viejo» → su entrada", top("dos versiones distintas en pantalla el bundle dist esta viejo") === "err-dist-viejo", String(top("dos versiones distintas en pantalla el bundle dist esta viejo")));
comprobar("«require is not defined» → su entrada", top("require is not defined en un paquete esm") === "err-esm-require", String(top("require is not defined en un paquete esm")));
comprobar("«tailwind v4 rounded-sm renombrado» → su entrada", top("tailwind v4 utilidades renombradas rounded-sm") === "syn-tailwind4-renombrados", String(top("tailwind v4 utilidades renombradas rounded-sm")));
comprobar("«un módulo de src importa fs y revienta el bundle» → su entrada", top("un modulo de src importa fs y revienta el bundle del navegador") === "rule-modulo-puro-navegador", String(top("un modulo de src importa fs y revienta el bundle del navegador")));
comprobar("«el preview sale en blanco» → su entrada", top("el preview del sandbox sale en blanco") === "pat-preview-en-blanco", String(top("el preview del sandbox sale en blanco")));
comprobar("«gemini getGenerativeModel» → su entrada", top("gemini getGenerativeModel no existe en el sdk genai") === "err-genai-sdk", String(top("gemini getGenerativeModel no existe en el sdk genai")));

// ── Y NO desplaza a las reglas del motor ────────────────────────────────────
comprobar("las reglas del motor siguen ganando lo suyo", top("borrar un archivo del usuario sin permiso") === "rule-destructive", String(top("borrar un archivo del usuario sin permiso")));
comprobar("«no dejes placeholders» sigue en su sitio", top("no dejes placeholders ni omitido") === "rule-no-placeholders", String(top("no dejes placeholders ni omitido")));
comprobar("«json con coma final» sigue en su sitio", top("unexpected token in JSON parse error") === "err-json", String(top("unexpected token in JSON parse error")));

// ── El contexto que se inyecta al modelo ───────────────────────────────────
const ctx = buildEngineContext(kb, "useRef exige argumento inicial en React 19", 5, 1100);
comprobar("el contexto inyectado trae la entrada correcta", /useRef/.test(ctx) && /argumento inicial/.test(ctx));
comprobar("respeta el presupuesto de caracteres", ctx.length <= 1100 + 40, `${ctx.length}`);
comprobar("una consulta sin relación no inventa contexto", buildEngineContext(kb, "zzz qqq", 5, 1100) === "");
comprobar("tokenize filtra palabras de 1-2 letras", tokenize("a de la casa")!.join(",") === "casa", tokenize("a de la casa").join(","));

// ── Trazabilidad: todo lo afirmado en el pack sale de este repositorio ──────
const pkg = JSON.parse(leer("package.json"));
const tsconfig = JSON.parse(leer("tsconfig.json"));
comprobar(
  "el pack cita la misma línea mayor de React que declara package.json",
  VERSIONES_VERIFICADAS.react.split(".")[0] === pkg.dependencies.react.replace(/[^\d.]/g, "").split(".")[0],
  `${VERSIONES_VERIFICADAS.react} vs ${pkg.dependencies.react}`
);
comprobar("el pack afirma strict: true y es verdad", tsconfig.compilerOptions.strict === true);
comprobar("el pack afirma isolatedModules y es verdad", tsconfig.compilerOptions.isolatedModules === true);
comprobar("el pack afirma ESM y es verdad", pkg.type === "module");
comprobar("el pack afirma esModuleInterop:false y es verdad", tsconfig.compilerOptions.esModuleInterop === false);
comprobar("el pack cita la guarda real de vite", /cerebroNodeGuard/.test(leer("vite.config.ts")));

console.log(`\n═══ MOTOR · DATOS (v8.0.1): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
