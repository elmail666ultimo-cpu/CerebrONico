/**
 * interfaz.test.ts — MINIATURAS DE ADJUNTOS Y EDITOR WEB (v8.0.3)
 * ===============================================================
 * Dos peticiones del usuario, dos defectos, y una misma forma de verificarlos:
 *
 *  · «que se vea la miniatura de la imagen, así se puede apreciar qué elemento se
 *    está cargando cuando sean muchas; ahora solo es un icono»
 *  · «el editor web? hasta ahora no ha funcionado»
 *
 * Aquí NO se pinta nada: no hay DOM en Node. Lo que se verifica es (a) la
 * ARITMÉTICA de la miniatura, que es lo único que toma decisiones y por eso vive
 * aislada en `src/utils/miniatura.ts`, y (b) las INVARIANTES del cableado, que
 * en este proyecto se comprueban leyendo el fuente — el mismo método que usa
 * `resiliencia.test.ts` para `server.ts`.
 *
 * El punto (b) no es pereza: los dos defectos de hoy fueron EXACTAMENTE
 * cableado roto. El chip ignoraba la miniatura que ya tenía al lado; el
 * indicador del sandbox estaba clavado en verde porque `setSandboxRunning` no se
 * llamaba en ningún sitio. Un compilador no ve ninguna de las dos cosas, y una
 * prueba de render necesitaría un navegador entero. Leer el fuente y afirmar
 * «esta función se llama de verdad» sí lo ve, y es barato.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  calcularDimensionesMiniatura,
  mereceMiniatura,
  MAX_MINIATURA_PX,
} from "../src/utils/miniatura";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ════════════════════════════════════════════════════════════════════════════
// 1 · GEOMETRÍA DE LA MINIATURA (pura, y por eso probable)
// ════════════════════════════════════════════════════════════════════════════
console.log("\n1) La miniatura conserva la proporción\n");

const apaisada = calcularDimensionesMiniatura(1920, 1080, 96);
comprobar("1920x1080 → el lado mayor queda en 96", apaisada.ancho === 96, JSON.stringify(apaisada));
comprobar("y el alto conserva la proporción (54)", apaisada.alto === 54, String(apaisada.alto));

const vertical = calcularDimensionesMiniatura(1080, 1920, 96);
comprobar("1080x1920 → el ALTO queda en 96", vertical.alto === 96, JSON.stringify(vertical));
comprobar("y el ancho conserva la proporción (54)", vertical.ancho === 54, String(vertical.ancho));

const cuadrada = calcularDimensionesMiniatura(4000, 4000, 96);
comprobar("cuadrada grande → 96x96", cuadrada.ancho === 96 && cuadrada.alto === 96);

const panoramica = calcularDimensionesMiniatura(4000, 500, 96);
comprobar("panorámica extrema → 96x12", panoramica.ancho === 96 && panoramica.alto === 12, JSON.stringify(panoramica));

// No ampliar: una imagen diminuta no gana nada por engordar, solo ocupa más.
const diminuta = calcularDimensionesMiniatura(16, 16, 96);
comprobar("16x16 NO se amplía", diminuta.ancho === 16 && diminuta.alto === 16, JSON.stringify(diminuta));
const casi = calcularDimensionesMiniatura(96, 96, 96);
comprobar("96x96 se queda como está (el tope es inclusivo)", casi.ancho === 96 && casi.alto === 96);
const unoMas = calcularDimensionesMiniatura(97, 97, 96);
comprobar("97x97 sí baja a 96", unoMas.ancho === 96 && unoMas.alto === 96, JSON.stringify(unoMas));

// Suelo de 1 px: `Math.round(0.4)` da 0 y un canvas de ancho 0 LANZA excepción
// en algunos navegadores. Esto no es teórico: es el borde real de la función.
const extrema = calcularDimensionesMiniatura(10000, 1, 96);
comprobar("una imagen de 1 px de alto no produce cero (canvas 0 lanza)", extrema.alto >= 1, JSON.stringify(extrema));
comprobar("...y el ancho sigue siendo el tope", extrema.ancho === 96);

// Entradas imposibles: se declaran imposibles, no se inventan un cuadrado.
comprobar("ancho 0 → 0x0 (señal de «no hay miniatura»)", calcularDimensionesMiniatura(0, 100).ancho === 0);
comprobar("alto negativo → 0x0", calcularDimensionesMiniatura(100, -5).ancho === 0);
comprobar("NaN → 0x0", calcularDimensionesMiniatura(NaN, 100).ancho === 0);
comprobar("Infinity → 0x0", calcularDimensionesMiniatura(Infinity, 100).ancho === 0);
comprobar("un tope inválido cae al valor por defecto", calcularDimensionesMiniatura(1920, 1080, 0).ancho === MAX_MINIATURA_PX);
comprobar("el valor por defecto es 96", MAX_MINIATURA_PX === 96);

// El atajo: saber si merece la pena tocar el canvas.
comprobar("una imagen de 4000 px merece miniatura", mereceMiniatura(4000, 3000) === true);
comprobar("un icono de 32 px NO merece (ahorra un canvas por adjunto)", mereceMiniatura(32, 32) === false);
comprobar("una entrada inválida no merece", mereceMiniatura(0, 0) === false);

// ════════════════════════════════════════════════════════════════════════════
// 2 · EL CHIP DEL ADJUNTO YA NO ES UN ICONO
// ════════════════════════════════════════════════════════════════════════════
console.log("\n2) El chip pinta la imagen, y dice qué falta por cargar\n");

const chat = leer("src/components/ChatCenter.tsx");
comprobar("el chip usa `thumbData` antes que nada", /att\.thumbData \|\| att\.base64Data/.test(chat));
comprobar("e incluye un `<img>` con la miniatura", /src=\{miniatura\}/.test(chat));
comprobar("...recortada al hueco con object-cover", /object-cover/.test(chat));
// El margen es amplio a propósito (420): entre `onError={` y la línea que oculta
// la imagen van los comentarios que explican POR QUÉ se oculta en vez de
// desmontar. Ajustar el margen al valor exacto convierte esta prueba en una
// prueba de longitud de comentarios, que no es lo que quiero vigilar.
comprobar("y con el icono DEBAJO como respaldo si la imagen falla", /onError=\{[\s\S]{0,420}visibility = "hidden"/.test(chat));
comprobar("el respaldo no borra estado (solo oculta el <img>)", !/onError=\{[\s\S]{0,420}setState/.test(chat));

// La vista previa en grande: es lo que permite distinguir veinte capturas.
comprobar("pulsar la miniatura abre la vista previa", /setVistaPrevia\(\{ src: completa, nombre: att\.name \}\)/.test(chat));
comprobar("la vista previa se pinta como capa fija", /vistaPrevia && \(/.test(chat) && /fixed inset-0 z-50/.test(chat));
comprobar("se cierra con Escape", /e\.key === "Escape"/.test(chat));
comprobar("y también pulsando fuera", /onClick=\{\(\) => setVistaPrevia\(null\)\}/.test(chat));

// El hueco de «cargando»: la mitad de la petición que no se ve.
comprobar("existe el chip fantasma de lo que aún se procesa", /renderAttachmentPendiente/.test(chat));
comprobar("...con su nombre visible", /title=\{`«\$\{nombre\}» todavía se está procesando`\}/.test(chat));
comprobar("...y un indicador giratorio", /Loader2/.test(chat));
comprobar("la tira aparece TAMBIÉN mientras solo hay pendientes", /pendingAttachments\.length > 0 \|\| pendingNames\.length > 0/.test(chat));
comprobar("y el contador distingue listos de cargando", /adjunto\(s\) listo\(s\)/.test(chat) && /cargando…/.test(chat));
comprobar("el chip de carga se pinta después de los reales", /pendingAttachments\.map\(\(att\) => renderAttachmentBadge\(att, true\)\)[\s\S]{0,120}pendingNames\.map/.test(chat));

// La miniatura se genera al adjuntar, no al pintar.
const proc = leer("src/utils/attachmentProcessor.ts");
comprobar("el procesador genera la miniatura", /generarMiniatura\(base64Data\)/.test(proc));
comprobar("y el fallo de la miniatura NO tira el adjunto", /thumbData = \(await generarMiniatura\(base64Data\)\) \|\| undefined/.test(proc) && /catch \{\s*thumbData = undefined;/.test(proc));
comprobar("la imagen completa sigue intacta para el modelo", /base64Data,\s*thumbData,/.test(proc));
comprobar("la decisión de tamaño se delega en el módulo puro", /calcularDimensionesMiniatura\(img\.naturalWidth/.test(proc) && /mereceMiniatura\(img\.naturalWidth/.test(proc));
comprobar("se avisa de que la miniatura no sustituye a la imagen", /la miniatura es solo de la vista/i.test(leer("src/types.ts")));

// App: inserción progresiva, que era la causa de fondo.
const app = leer("src/App.tsx");
comprobar("App mantiene la cola de nombres cargando", /const \[attachmentsCargando, setAttachmentsCargando\] = useState<string\[\]>\(\[\]\)/.test(app));
comprobar("los nombres entran ANTES de procesar ninguno", /setAttachmentsCargando\(\(prev\) => \[\.\.\.prev, \.\.\.fileArray\.map\(\(f\) => f\.name\)\]\);[\s\S]{0,400}for \(const file of fileArray\)/.test(app));
comprobar("cada adjunto se añade UNO A UNO (no al final del bucle)", /setPendingAttachments\(\(prev\) => \[\.\.\.prev, attachment\]\)/.test(app));
comprobar("ya NO existe el volcado en bloque al terminar", !/setPendingAttachments\(\(prev\) => \[\.\.\.prev, \.\.\.newAttachments\]\)/.test(app));
comprobar("el nombre sale de la cola incluso si el archivo falló (finally)", /finally \{[\s\S]{0,400}setAttachmentsCargando\(\(prev\) => \{[\s\S]{0,200}indexOf\(file\.name\)/.test(app));
comprobar("ambos ChatCenter reciben la cola", (app.match(/pendingNames=\{attachmentsCargando\}/g) || []).length === 2);

// ════════════════════════════════════════════════════════════════════════════
// 3 · EL EDITOR WEB: LA CAUSA DE «NUNCA HA FUNCIONADO»
// ════════════════════════════════════════════════════════════════════════════
console.log("\n3) El editor web se arregla el sandbox por sí mismo\n");

const editor = leer("src/components/DedicatedWebEditorView.tsx");

comprobar("el editor pregunta al motor por el sandbox", /fetch\("\/api\/sandbox\/status"\)/.test(editor));
comprobar("y es CAPAZ de arrancarlo (antes no lo era)", /fetch\("\/api\/sandbox\/start", \{ method: "POST" \}\)/.test(editor));
comprobar("gestiona la confirmación anti-recursión", /requiereConfirmacion[\s\S]{0,260}confirmar: "recursion"/.test(editor));
comprobar("arranca solo UNA vez por montaje (sin bucle de arranques)", /sbAutoIntentado\.current/.test(editor));
comprobar("al arrancar, refresca el iframe (no deja el error previo)", /setIframeKey\(\(k\) => k \+ 1\)/.test(editor));
comprobar("el punto de estado depende del estado MEDIDO", /sbEstado === "vivo" \? "bg-emerald-400 animate-pulse"/.test(editor));
comprobar("el punto ya NO depende de la prop que mentía", !/sandboxRunning === false \? "bg-red-400"/.test(editor));
comprobar("el aviso de preview en blanco depende del estado medido", /sbEstado !== "vivo" && \(/.test(editor));
comprobar("el aviso explica el motivo REAL del motor", /Motivo del motor: \$\{sbDetalle\}/.test(editor));
comprobar("y ofrece botón para arrancar sin salir de la pantalla", /Arrancar sandbox ahora/.test(editor));
comprobar("más un botón de reintento", /Reintentar/.test(editor));
comprobar("la prop se conserva como pista inicial, no como verdad", /sandboxRunning === false \? "muerto" : "comprobando"/.test(editor));

// El defecto de App: el estado existía y nadie lo escribía.
comprobar("App SÍ actualiza `sandboxRunning` (antes nunca)", /setSandboxRunning\(!!\(d && \(d\.online === true \|\| d\.running === true\)\)\)/.test(app));
comprobar("el valor inicial es `false`, no una promesa optimista", /const \[sandboxRunning, setSandboxRunning\] = useState<boolean>\(false\)/.test(app));
comprobar("si el motor no responde, se declara NO vivo", /catch \{\s*\/\/[\s\S]{0,240}setSandboxRunning\(false\);/.test(app));
comprobar("y hay sondeo periódico (6 s)", /setInterval\(sondear, 6000\)/.test(app));
comprobar("el sondeo se limpia al desmontar", /clearInterval\(intervalo\)/.test(app));
comprobar("el intervalo de 10 s de la telemetría no se tocó", /setInterval\(checkTelemetry, 10000\)/.test(app));

console.log(`\n═══ INTERFAZ (v8.0.3): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
