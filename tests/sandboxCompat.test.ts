/**
 * sandboxCompat.test.ts — ADUANA v2: el sandbox reconoce muchos proyectos
 * ========================================================================
 * Demuestra de la lista el defecto madre v1.0.3 curado:
 *   · Python/Rust/Go/Java/PHP/Ruby/Docker/Make/Jupyter… son PROYECTO, no
 *     "no hay proyecto"
 *   · node manda sobre python cuando ambos existen (el orden del sandbox)
 *   · docs/datos NO secuestran la raíz (peso < 40) pero SÍ se declaran
 *   · tolerancia de entrada: todo entra salvo binarios de ejecución, y el
 *     rechazo siempre trae motivo
 */
import {
  MARCADORES_PROYECTO, marcadorDeArchivo, reconocerCarpeta, reconocerCarpetaTolerante,
  clasificarEntrada, auditarEntradas, lineaReconocimiento,
} from "../src/engine/sandboxCompat";

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(nombre + (detalle ? " :: " + detalle : ""));
}

// ─── 1. Registro de marcadores ═══════════════════════════════════════════
comprobar("registro no vacío y con ids únicos", MARCADORES_PROYECTO.length >= 15 && new Set(MARCADORES_PROYECTO.map((m) => m.id)).size === MARCADORES_PROYECTO.length);
comprobar("node es el marcador de mayor peso", marcadorDeArchivo("package.json")?.id === "node" && marcadorDeArchivo("package.json")!.peso >= 100);

// ─── 2. Reconocimiento por tipo (el defecto madre) ═══════════════════════
comprobar("python reconocido", reconocerCarpeta(["requirements.txt", "main.py", "utils"])?.tipo === "python");
comprobar("python por pyproject", reconocerCarpeta(["pyproject.toml"])?.tipo === "python");
comprobar("rust reconocido", reconocerCarpeta(["Cargo.toml", "src"])?.tipo === "rust");
comprobar("go reconocido", reconocerCarpeta(["go.mod", "main.go"])?.tipo === "go");
comprobar("java reconocido", reconocerCarpeta(["pom.xml"])?.tipo === "java");
comprobar("php reconocido", reconocerCarpeta(["composer.json"])?.tipo === "php");
comprobar("ruby reconocido", reconocerCarpeta(["Gemfile"])?.tipo === "ruby");
comprobar("docker reconocido", reconocerCarpeta(["Dockerfile"])?.tipo === "docker");
comprobar("make reconocido", reconocerCarpeta(["Makefile"])?.tipo === "make");
comprobar("jupyter por patrón .ipynb", reconocerCarpeta(["analisis.ipynb"])?.tipo === "jupyter");
comprobar("dotnet por patrón .csproj", reconocerCarpeta(["App.csproj"])?.tipo === "dotnet");
comprobar("estático servible", reconocerCarpeta(["index.html", "style.css"])?.tipo === "statico" && reconocerCarpeta(["index.html"])!.servible === true);
comprobar("node gana el empate con python", reconocerCarpeta(["package.json", "requirements.txt"])?.tipo === "node");
comprobar("docs se declara pero no secuestra (peso<40)", reconocerCarpeta(["readme.md"])?.tipo === "docs" && (reconocerCarpeta(["readme.md"])?.peso ?? 99) < 40);
comprobar("datos se declara", reconocerCarpeta(["ventas.csv"])?.tipo === "datos");
comprobar("carpeta vacía → null", reconocerCarpeta([]) === null);
comprobar("solo subcarpetas → null", reconocerCarpeta([".git", "node_modules"]) === null);

// ─── 3. Tolerancia: la raíz con material sigue siendo algo ═══════════════
const tol = reconocerCarpetaTolerante(["notas.txt", "plan.md"]);
comprobar("tolerante nunca dice 'no hay' si hay material", tol.tipo === "docs" || tol.tipo === "generico" || tol.tipo !== "vacia");
const vacia = reconocerCarpetaTolerante([]);
comprobar("vacía se declara vacía con salida (Sync)", vacia.tipo === "vacia" && /Sync/.test(vacia.cmdArranque));
const suelta = reconocerCarpetaTolerante(["foto.jpg"]);
comprobar("material sin marcador → generico, no null", suelta.tipo === "generico" && suelta.peso === 0);

// ─── 4. Tolerancia de entrada ════════════════════════════════════════════
comprobar("código entra", clasificarEntrada("app.py").aceptada && clasificarEntrada("app.py").categoria === "codigo");
comprobar("imagen entra (aún en mayúsculas)", clasificarEntrada("FOTO.HEIC").aceptada && clasificarEntrada("FOTO.HEIC").categoria === "imagen");
comprobar("datos entran", clasificarEntrada("ventas.csv").categoria === "datos" && clasificarEntrada("config.yaml").categoria === "datos");
comprobar("documentos entran", clasificarEntrada("informe.pdf").categoria === "documento" && clasificarEntrada("notas.md").categoria === "documento");
comprobar("zip entra con nota de extracción", clasificarEntrada("paquete.zip").aceptada && /extrae/.test(clasificarEntrada("paquete.zip").nota));
comprobar("ejecutable rechazado CON motivo", !clasificarEntrada("malware.exe").aceptada && clasificarEntrada("malware.exe").nota.length > 10);
comprobar("objeto compilado rechazado", !clasificarEntrada("modulo.so").aceptada && !clasificarEntrada("App.class").aceptada);
comprobar("desconocido entra como texto con aviso", clasificarEntrada("raro.xyz").aceptada && clasificarEntrada("raro.xyz").categoria === "desconocido" && /no catalogada/.test(clasificarEntrada("raro.xyz").nota));
comprobar("sin extensión entra con aviso", clasificarEntrada("LICENSE").aceptada);
const aud = auditarEntradas(["a.py", "b.exe", "c.md", "d.dll"]);
comprobar("auditoría parte aceptadas/rechazadas", aud.aceptadas.length === 2 && aud.rechazadas.length === 2 && aud.rechazadas.every((r) => !r.aceptada));

// ─── 5. La línea honesta ═════════════════════════════════════════════════
const r = reconocerCarpeta(["requirements.txt"])!;
comprobar("línea de reconocimiento dice tipo+marcador+consola", /Python/.test(lineaReconocimiento(r)) && /requirements\.txt/.test(lineaReconocimiento(r)) && /consola/.test(lineaReconocimiento(r)));
const rn = reconocerCarpeta(["package.json"])!;
comprobar("node dice previsible en :3500", /:3500/.test(lineaReconocimiento(rn)));

console.log(`\nADUANA v2 · ${correctas} correctas, ${fallos.length} en rojo`);
if (fallos.length) { for (const f of fallos) console.log("  ✗ " + f); process.exit(1); }
