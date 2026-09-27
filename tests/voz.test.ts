/**
 * voz.test.ts — LA CERTEZA Y LA FACULTAD DE HABLAR (v1.8.0)
 * =========================================================
 * QUÉ ES: la suite de los tres módulos de la v1.8.0 — `certeza.ts`,
 * `vocabulario.ts`, `explicacionArtefacto.ts` y `autoRespuesta.ts`.
 * PARA QUÉ SIRVE: para que «esto funciona» no se pueda escribir sin haberlo
 * ejecutado, y para que la facultad de hablar sin que pregunten no se convierta
 * en un generador de ruido. Las dos cosas se vigilan aquí, y ninguna se prueba
 * «leyendo que el módulo existe»: se llama a las funciones y se mira qué
 * contestan.
 *
 * ESTADO DE EJECUCIÓN DE ESTA SUITE: se ejecuta de verdad (entra en
 * `npm run validar`), y por eso todo lo que afirma aquí tiene salida real detrás.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { certezaDe, masDebil, esAfirmable, NOMBRE_CERTEZA } from "../src/engine/certeza";
import { revisarVocabulario, puedeAfirmar, conCerteza, fraseDeCerteza, ETIQUETA_CERTEZA, AFIRMACIONES } from "../src/engine/vocabulario";
import { explicarArtefacto, explicarVarios, frasesDeExplicaciones, clasificarQue, propositoDeCabecera } from "../src/engine/explicacionArtefacto";
import { mensajesEspontaneos, debeHablar, marcarDichos, trazarMensajes, REGLAS_VOZ, MAX_POR_DEFECTO, PRIORIDAD } from "../src/engine/autoRespuesta";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle?: string) {
  if (condicion) correctas++;
  else fallos.push(`${titulo}${detalle ? " → " + detalle : ""}`);
}

// ═══ 1 · LA CERTEZA ════════════════════════════════════════════════════════
console.log("\n1) Los tres niveles de certeza\n");

comprobar("sin evidencia: sin verificar", certezaDe({}) === "sin_verificar");
comprobar("leído sin ejecutar: leido", certezaDe({ leido: true }) === "leido");
comprobar("con salida real: ejecutado", certezaDe({ ejecutado: true }) === "ejecutado");
comprobar("★ leer NO asciende a ejecutado (el error que se quiere evitar)", certezaDe({ leido: true, ejecutado: false }) === "leido");
comprobar("al juntar dos, manda la más débil", masDebil("ejecutado", "leido") === "leido" && masDebil("leido", "sin_verificar") === "sin_verificar");
comprobar("solo «ejecutado» permite afirmar", esAfirmable("ejecutado") && !esAfirmable("leido") && !esAfirmable("sin_verificar"));
comprobar("cada nivel tiene su nombre corto", NOMBRE_CERTEZA.ejecutado === "ejecutado" && NOMBRE_CERTEZA.leido === "leído");

// ═══ 2 · EL VOCABULARIO: LAS PALABRAS QUE AFIRMAN ══════════════════════════
console.log("\n2) Palabras que prometen resultado\n");

comprobar("hay un catálogo de afirmaciones", AFIRMACIONES.length >= 12, String(AFIRMACIONES.length));
comprobar("«funciona» exige ejecución", !puedeAfirmar("funciona", "leido") && puedeAfirmar("funciona", "ejecutado"));
comprobar("«verificado» exige ejecución", !puedeAfirmar("verificado", "leido") && puedeAfirmar("verificado", "ejecutado"));
comprobar("«listo» exige ejecución", !puedeAfirmar("listo", "sin_verificar"));
comprobar("una palabra normal no está vetada", puedeAfirmar("guardado", "sin_verificar"));

const avisosLeido = revisarVocabulario("El fondo funciona y está verificado.", "leido");
comprobar("★ avisa de «funciona» al solo leerlo", avisosLeido.some((a) => a.palabra === "funciona"));
comprobar("★ avisa de «verificado» al solo leerlo", avisosLeido.some((a) => a.palabra === "verificado"));
comprobar("cada aviso trae su motivo", avisosLeido.every((a) => a.motivo.length > 20));
comprobar("cada aviso propone cómo decirlo sin mentir", avisosLeido.every((a) => a.alternativa.length > 5));
comprobar("★ con ejecución real NO hay avisos", revisarVocabulario("El fondo funciona.", "ejecutado").length === 0);

const envuelto = conCerteza("El fondo funciona.", "leido");
comprobar("conCerteza reescribe la afirmación", !/funciona/i.test(envuelto), envuelto);
comprobar("conCerteza pega la etiqueta de certeza", envuelto.includes("solo leído: NO ejecutado"), envuelto);
comprobar("fraseDeCerteza admite detalle", fraseDeCerteza("ejecutado", "64 suites").includes("64 suites"));
comprobar("las etiquetas dicen lo que son", ETIQUETA_CERTEZA.ejecutado.includes("ejecutado") && ETIQUETA_CERTEZA.leido.includes("NO ejecutado"));

// ═══ 3 · UNA FRASE POR ARTEFACTO ═══════════════════════════════════════════
console.log("\n3) Qué es, para qué sirve y si está ejecutado\n");

const fondoFuente = leer("src/engine/fondo.ts");
const eFondo = explicarArtefacto({ ruta: "src/engine/fondo.ts", contenido: fondoFuente });

comprobar("★ la frase es UNA oración, con su punto final", /^.+ — .+\. Estado: .+\.$/.test(eFondo.frase), eFondo.frase.slice(0, 90));
comprobar("★ dice qué es", eFondo.que.includes("motor") && eFondo.frase.includes(eFondo.que));
comprobar("★ dice para qué sirve, sacado de su cabecera", eFondo.origenDelProposito === "cabecera" && eFondo.para.length > 15, eFondo.para.slice(0, 70));
comprobar("★ sin ejecución, el estado es «leído» y la frase lo dice", eFondo.estado === "leido" && eFondo.frase.includes("NO ejecutado"));
comprobar("★ y NO dice que esté ejecutado", eFondo.ejecutado === false);

const eFondoEjecutado = explicarArtefacto({ ruta: "src/engine/fondo.ts", contenido: fondoFuente, ejecutado: true, evidencia: ["suite fondoPeso: 64 correctas"] });
comprobar("★ con ejecución real, el estado cambia a ejecutado", eFondoEjecutado.estado === "ejecutado" && eFondoEjecutado.ejecutado === true);
comprobar("la evidencia queda registrada en la explicación", eFondoEjecutado.evidencia.some((x) => x.includes("64 correctas")));

const eSinContenido = explicarArtefacto({ ruta: "src/engine/desconocido.ts" });
comprobar("sin contenido no se inventa el propósito", eSinContenido.origenDelProposito === "ausente" && eSinContenido.para.includes("no declara su propósito"));
comprobar("sin contenido ni ejecución: sin verificar", eSinContenido.estado === "sin_verificar");
comprobar("y la frase sigue siendo una oración completa", /\. Estado: .+\.$/.test(eSinContenido.frase));

comprobar("clasifica un módulo de motor", clasificarQue("src/engine/localRAG.ts").includes("motor"));
comprobar("clasifica el servidor", clasificarQue("ide/backend/server.ts").includes("servidor") || clasificarQue("server.ts").includes("servidor"));
comprobar("clasifica un componente de interfaz", clasificarQue("src/components/Header.tsx").includes("interfaz"));
comprobar("clasifica una prueba", clasificarQue("tests/voz.test.ts").includes("prueba"));
comprobar("clasifica el puente Python", clasificarQue("agent_bridge_5000.py").includes("Python"));
comprobar("clasifica un guion de Windows", clasificarQue("iniciar_todo_windows.bat").includes("Windows"));

comprobar("extrae el propósito de la cabecera real", (propositoDeCabecera(fondoFuente) || "").length > 15);
comprobar("no confunde un comentario suelto con el propósito", propositoDeCabecera("// nada\nconst x = 1;") === null);

// El módulo se audita a sí mismo: si una cabecera afirma de más, avisa.
const cabeceraQueMiente = `/**\n * falso.ts — COSA VERIFICADA Y FUNCIONANDO\n */\nexport const x = 1;`;
const eMiente = explicarArtefacto({ ruta: "src/engine/falso.ts", contenido: cabeceraQueMiente });
comprobar("★ detecta un fichero que se atribuye más certeza de la que tiene", eMiente.avisos.length > 0, JSON.stringify(eMiente.avisos.map((a) => a.palabra)));

comprobar("explicarVarios devuelve una por artefacto", explicarVarios([{ ruta: "a.ts" }, { ruta: "b.ts" }]).length === 2);
comprobar("frasesDeExplicaciones devuelve una frase por línea", frasesDeExplicaciones([eFondo, eSinContenido]).every((f) => f.endsWith(".")));

// ═══ 4 · LA FACULTAD DE HABLAR SIN QUE PREGUNTEN ═══════════════════════════
console.log("\n4) Hablar sin que pregunten, sin aturrullar\n");

comprobar("las 4 reglas están declaradas en voz alta", REGLAS_VOZ.length === 4 && REGLAS_VOZ.map((r) => r.id).join(",") === "R1,R2,R3,R4");

// R1 — no se inventa nada
comprobar("★ R1 · sin datos no habla (el silencio es una respuesta)", mensajesEspontaneos({}).length === 0);
comprobar("★ R1 · debeHablar es false con el contexto vacío", debeHablar({}) === false);

const ctxBase = {
  avisos: [{ clave: "a1", texto: "La última tanda se revirtió", motivo: "puerta roja" }],
  hechos: [{ clave: "h1", texto: "El proyecto tiene 64 suites", certeza: "ejecutado" as const, evidencia: ["npm run validar"] }],
  sugerencias: [{ clave: "s1", texto: "Cierra la tanda abierta", motivo: "hay cambios sin puertas" }],
};
const dichos = mensajesEspontaneos(ctxBase);
comprobar("con datos sí habla", dichos.length === 3);
comprobar("★ dice el aviso primero y la sugerencia al final", dichos[0].tipo === "aviso" && dichos[2].tipo === "sugerencia");
comprobar("las prioridades son las declaradas", PRIORIDAD.aviso > PRIORIDAD.dato && PRIORIDAD.dato > PRIORIDAD.sugerencia);

// R2 — una cosa se dice una vez
const repetido = mensajesEspontaneos({ ...ctxBase, yaDichos: ["a1", "h1", "s1"] });
comprobar("★ R2 · lo ya dicho no se repite", repetido.length === 0);
const parcial = mensajesEspontaneos({ ...ctxBase, yaDichos: ["a1"] });
comprobar("★ R2 · solo calla lo dicho, no todo", parcial.length === 2 && !parcial.some((m) => m.clave === "a1"));
const marcadas = marcarDichos([], dichos);
comprobar("marcarDichos acumula sin duplicar", marcarDichos(marcadas, dichos).length === 3);

// R3 — la certeza viaja en el texto
const conLectura = mensajesEspontaneos({ hechos: [{ clave: "h2", texto: "El catálogo está al día", certeza: "leido" }] });
comprobar("★ R3 · un dato solo leído se dice como no ejecutado", /le[íi]do/i.test(conLectura[0].texto) && /NO ejecutado|no ejecutado/.test(conLectura[0].texto), conLectura[0].texto);
const conEjecucion = mensajesEspontaneos({ hechos: [{ clave: "h3", texto: "El catálogo está al día", certeza: "ejecutado" }] });
comprobar("★ R3 · un dato ejecutado no lleva etiqueta de duda", !/no ejecutado/i.test(conEjecucion[0].texto));
comprobar("una sugerencia nunca se presenta como hecho", mensajesEspontaneos({ sugerencias: [{ clave: "s9", texto: "Prueba X", motivo: "y" }] })[0].certeza === "sin_verificar");

// R4 — presupuesto de atención
const muchos = mensajesEspontaneos({
  avisos: [1, 2, 3, 4, 5].map((n) => ({ clave: "a" + n, texto: "Aviso " + n, motivo: "m" })),
});
comprobar("★ R4 · hay presupuesto de atención por defecto", muchos.length === MAX_POR_DEFECTO, String(muchos.length));
const presupuesto = mensajesEspontaneos({ ...ctxBase, maxMensajes: 1 });
comprobar("★ R4 · el presupuesto se puede bajar", presupuesto.length === 1);
const ocupado = mensajesEspontaneos({ ...ctxBase, ocupado: true });
comprobar("★ R4 · con una operación en curso SOLO pasan avisos", ocupado.length === 1 && ocupado[0].tipo === "aviso");
comprobar("★ R4 · y no se pierden: solo se callan mientras tanto", mensajesEspontaneos({ ...ctxBase, ocupado: false }).length === 3);

// Determinismo y traza
const otraVez = mensajesEspontaneos(ctxBase);
comprobar("★ mismas entradas, mismos mensajes (es determinista)", JSON.stringify(otraVez) === JSON.stringify(dichos));
comprobar("la traza dice de dónde salió cada mensaje", trazarMensajes(dichos).every((t) => t.includes("p") && t.includes("—")));
comprobar("la traza incluye la certeza", trazarMensajes(dichos)[0].includes("ejecutado"));

const fuenteVoz = leer("src/engine/autoRespuesta.ts");
comprobar("★ el motor de voz no depende del reloj ni del azar", !/Date\.now|Math\.random/.test(fuenteVoz));

// ═══ 5 · ENGANCHADO AL SERVIDOR (no es un módulo huérfano) ═════════════════
console.log("\n5) Enganchado de verdad\n");

const servidor = leer("server.ts");
comprobar("el servidor importa el módulo de explicaciones", servidor.includes('from "./src/engine/explicacionArtefacto"'));
comprobar("el servidor importa el motor de voz", servidor.includes('from "./src/engine/autoRespuesta"'));
comprobar("★ el estado del Quirófano devuelve las explicaciones", servidor.includes("explicaciones:") && servidor.includes("explicarArtefacto(leerArtefactoParaExplicar("));
comprobar("★ y devuelve los mensajes espontáneos", servidor.includes("voz: hablarAhora()"));
comprobar("★ la facultad no repite: hay memoria de lo dicho", servidor.includes("vozYaDichos"));
comprobar("★ el servidor concede «ejecutado» solo con puertas en verde", servidor.includes("cerroEnVerde"));
comprobar("la lectura no se sale de la carpeta de la aplicación", servidor.includes("fuera de la carpeta de la aplicación"));
comprobar("★ existe el endpoint que explica un artefacto a petición", servidor.includes('"/api/artefacto/explicar"'));
// La intención de esta comprobación es que explicar un artefacto NO pueda
// ejecutar nada: es información, no una puerta de acción. Se mira el CUERPO del
// endpoint (hasta el siguiente `app.`), no una ventana de caracteres — la primera
// versión de esta prueba medía 600 caracteres y fallaba por longitud, no por
// seguridad.
const cuerpoExplicar = servidor.slice(
  servidor.indexOf('"/api/artefacto/explicar"'),
  servidor.indexOf("app.", servidor.indexOf('"/api/artefacto/explicar"') + 10)
);
comprobar("★ el endpoint de explicar no ejecuta nada (ni shell ni procesos)", cuerpoExplicar.length > 100 && !/execAsync|spawn|child_process|exec\(/.test(cuerpoExplicar));
comprobar("esta suite entra en npm run validar", leer("scripts/validar.mjs").includes("voz.test.ts"));

// Y llega a la PANTALLA. Una facultad que solo existe en el servidor es media
// facultad: si el usuario no la ve, no se ha ganado nada.
const panel = leer("src/components/PanelQuirofano.tsx");
comprobar("★ el panel del Quirófano pinta la voz", panel.includes("estado?.voz") && panel.includes("voz del sistema"));
comprobar("★ el panel pinta las explicaciones de cada archivo", panel.includes("estado?.explicaciones") && panel.includes("explicaciones.slice"));
comprobar("el panel explica que el silencio es normal, no un fallo", panel.includes("No habla por hablar"));

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ VOZ Y CERTEZA (CN v1.8.0): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  FALLO → " + f);
  process.exit(1);
}
