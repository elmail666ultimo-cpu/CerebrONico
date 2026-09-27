/**
 * kbMotor.ts — CONOCIMIENTO DE LA ESTRUCTURA DEL PROPIO MOTOR (v0.9.1)
 * ===================================================================
 * Petición que originó este archivo, literal:
 *
 *   «incrementa su estabilidad y agranda su base de datos en general.
 *    + conocimiento e inteligencia en la estructura de su motor»
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL HUECO QUE ESTE PACK TAPA
 * ───────────────────────────
 * Hasta ahora el motor sabía mucho de código AJENO (React, Tailwind, ffmpeg,
 * formatos) y **casi nada de sí mismo**. La consecuencia se vio entera en esta
 * sesión: los modelos no podían razonar sobre el motor porque no sabían cómo
 * está montado. De ahí errores como
 *
 *   · escribir en `.proyectos/` creyendo que era la raíz del servidor,
 *   · crear un `index.js` en una carpeta `"type": "module"`,
 *   · dar por hecho que el puerto del sandbox era el 3000,
 *   · y «arreglar» el preview tocando el `dist/` viejo.
 *
 * Ninguno es un error de sintaxis. Los cuatro son **falta de un modelo mental
 * del motor**, y un modelo mental se puede escribir: eso es este archivo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REGLA DE ESTE PACK
 * ──────────────────
 * Cada entrada sale de haber LEÍDO el archivo que describe. Lo que no pude
 * verificar no está. Un pack que se inventa puertos o rutas no es neutro: el
 * modelo lo obedece con la misma fidelidad que una verdad, y el error se
 * multiplica en vez de repartirse.
 */

import type { KbEntry } from "./knowledgeBase";

/** Los cuatro puertos del sistema, y quién habla con quién. */
export const PUERTOS = {
  ide: 3000,
  sandbox: 3500,
  puente: 5000,
  ollama: 11434,
} as const;

export const KB_MOTOR: KbEntry[] = [
  // ============================================================
  // BLOQUE 1 — LA ESTRUCTURA: QUÉ ES CADA PIEZA Y PARA QUÉ SIRVE
  // ============================================================
  {
    id: "motor-mapa-general",
    table: "manual",
    title: "Mapa del motor: cuatro puertos, un proceso principal y un sandbox aparte",
    keys: ["arquitectura", "estructura del motor", "mapa", "puerto", "puertos", "mapa del motor", "3000", "3500", "5000", "11434"],
    body: [
      "El motor NO es un solo proceso. Son cuatro puertos con papeles distintos, y confundirlos",
      "es la causa de la mitad de los errores de configuración:",
      "",
      "· 3000 — LA IDE. Express + React. Es lo que se abre en el navegador. Sirve la interfaz",
      "  (dist/ o Vite en caliente) y TODAS las rutas /api/*.",
      "· 3500 — EL SANDBOX. Proceso APARTE, que ejecuta el proyecto del usuario. Aquí va la",
      "  web que se previsualiza. Si el proyecto es estático lo sirve un servidor propio; si",
      "  es Node/Python, ejecuta su comando y habla con él por este puerto.",
      "· 5000 — EL PUENTE. Proceso Python (FastAPI) que da al modelo acceso al equipo real:",
      "  leer/escribir archivos, ejecutar comandos, tomar capturas.",
      "· 11434 — OLLAMA. Los modelos locales. NO es del motor: es un servicio externo.",
      "",
      "Regla: el puerto del proyecto del usuario es el 3500. Escribirlo en el código, no",
      "confiar en que el entorno lo ponga.",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "motor-brain",
    table: "manual",
    title: "brain.ts: gobernanza y memoria — el que decide QUÉ contexto ve el modelo",
    keys: ["brain", "cerebro", "gobernanza", "memoria", "contexto", "systemBlock", "niveles"],
    body: [
      "`brain.ts` no genera texto: decide qué instrucciones recibe el modelo antes de hablar.",
      "Su método clave devuelve el bloque de sistema, y lo monta en CUATRO niveles según el",
      "tamaño del modelo (cloud / grande / medio / micro). El mismo motor sirve a un 120B y a",
      "un 0,5B, y lo hace recortando el contexto, no cambiando la ley.",
      "",
      "Consecuencia práctica: si una regla NO está en el nivel que usa tu modelo, no existe",
      "para él. Por eso las reglas importantes van en los cuatro niveles y en `cerebro.md`.",
      "Los bloques dinámicos van marcados con BEGIN/END para poder reemplazarlos sin",
      "reescribir el archivo entero de memoria.",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "motor-knowledgebase",
    table: "manual",
    title: "knowledgeBase.ts: la base de datos del motor — recuperación por palabras clave, no por vectores",
    keys: ["knowledgebase", "base de datos", "kb", "conocimiento", "recuperacion", "busqueda"],
    body: [
      "Es la memoria técnica del motor: entradas con id, tabla, título, claves y cuerpo. Se",
      "consulta con `query(texto, limite)` y puntúa por COINCIDENCIA DE PALABRAS, no por",
      "similitud semántica. No hay embeddings ni vector store: funciona sin GPU y sin internet.",
      "",
      "Consecuencia que hay que saber para escribir entradas útiles:",
      "· Las CLAVES mandan. Una entrada sin las palabras que el usuario va a escribir no se",
      "  encuentra nunca, por buena que sea.",
      "· Una palabra común repetida en varias claves DESBORDA: cuatro claves con «archivo»",
      "  suman cuatro veces y la entrada desplaza a otra que debería ganar. (Nos pasó, y lo",
      "  cazó una prueba.)",
      "· La tabla da prioridad: `rule` y `error` puntúan por encima de `pattern` y `lesson`.",
      "",
      "Se persiste en `.cerebro-db/kb.json` cada 30 segundos y al salir.",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "motor-sandbox-compat",
    table: "manual",
    title: "sandboxCompat.ts: la ADUANA que reconoce qué tipo de proyecto hay",
    keys: ["sandboxcompat", "aduana", "marcadores", "proyecto reconocido", "reconocer carpeta"],
    body: [
      "Decide si una carpeta es un proyecto y de qué tipo, buscando MARCADORES con peso:",
      "`package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `pom.xml`, `Dockerfile`,",
      "`Makefile` y `index.html` (estático). Se acepta a partir de un peso mínimo, no de la",
      "presencia de un archivo concreto: por eso una web estática con `index.html` ES un",
      "proyecto válido, aunque no tenga `package.json`.",
      "",
      "Dos cosas que saber:",
      "· `index.html` suelto vale como proyecto. No hace falta npm para una web de tres",
      "  archivos, y exigirlo mandó a un modelo a montar un proyecto Node que no hacía falta.",
      "· Antes de decidir, se descartan comillas invertidas y nombres a los que les falta",
      "  contexto: un archivo con el nombre cortado a mitad no cuenta como marcador.",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "motor-projectporter",
    table: "manual",
    title: "projectPorter.ts: resolver la raíz real del proyecto (y por qué no basta mirar la raíz)",
    keys: ["projectporter", "raiz", "resolver raiz", "anidado", "aplanar", "flatten", "subcarpeta"],
    body: [
      "Resuelve en qué carpeta está el proyecto de verdad. No basta con mirar la raíz del",
      "sandbox, porque el árbol puede haber llegado con una carpeta contenedora de más",
      "(`.proyectos/mi-proyecto/`) y entonces el marcador queda un nivel abajo.",
      "",
      "Busca: primero en la raíz; si no hay marcador, recorre subcarpetas hasta cinco niveles",
      "y se queda con el mejor candidato. Ignora artefactos (`node_modules`, `dist`, `.git`…)",
      "por LISTA de nombres, no por prefijo:",
      "",
      "  ⚠️ No se salta las carpetas que empiezan por punto. «Saltarse lo oculto» parece",
      "  prudente y aquí es justo lo contrario: los caminos de este proyecto EMPIEZAN por",
      "  punto (`.proyectos`), así que saltarlos hacía que el detector descartara por el",
      "  nombre la carpeta que contenía el proyecto, sin llegar a mirar dentro.",
      "",
      "`/api/sandbox/flatten-root` mueve la copia anidada a la raíz. Es idempotente y avisa de",
      "lo que no pudo mover.",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "motor-boveda",
    table: "manual",
    title: "bovedaLocal.ts: la Bóveda de Disco — llevar lo generado al disco real",
    keys: ["boveda", "boveda de disco", "guardar archivo", "disco real", "indice"],
    body: [
      "Lleva a disco real lo que el modelo genera en el navegador (imágenes, documentos),",
      "organizándolo en carpetas numeradas con un `INDICE.json`. Existe porque el navegador no",
      "puede escribir en el disco del equipo por su cuenta.",
      "",
      "Si algo no llega a la bóveda, el archivo existe solo en memoria de la pestaña: se pierde",
      "al recargar. Cuando el usuario dice «se me borró lo generado», esta es la primera parada.",
    ].join("\n"),
    weight: 0.9,
  },
  {
    id: "motor-fondo",
    table: "manual",
    title: "fondo.ts: FONDO v1 — fondo animado (GIF / MP4 / WebM) con aduana propia",
    keys: ["fondo", "fondo animado", "gif", "mp4", "webm", "wallpaper animado"],
    body: [
      "Sirve un fondo animado para la IDE desde `/api/fondo`, con su propio aduanero:",
      "GIF hasta 48 MB, MP4/WebM hasta 128 MB, y un máximo por duración. Por encima de 4 MB (gif) y 8 MB (vídeo) se AVISA del coste de repintado, pero se permite: no es una prohibición. Los tipos aceptados los",
      "decide el aduanero, NO la extensión del archivo.",
      "",
      "Ojo con la diferencia: el fondo ANIMADO (esta ruta) y el fondo de PANTALLA del usuario",
      "(una imagen que se sube y se guarda) son dos cosas distintas. Un GIF puesto como fondo",
      "de pantalla se anima igual porque el navegador anima los GIF en `background-image`, pero",
      "no pasa por este aduanero.",
    ].join("\n"),
    weight: 0.9,
  },
  {
    id: "motor-toolregistry",
    table: "manual",
    title: "toolRegistry.ts: las herramientas que el modelo puede llamar de verdad",
    keys: ["toolregistry", "herramientas", "tools", "llamar herramienta", "tool calling"],
    body: [
      "Es la lista de lo que el modelo PUEDE hacer: leer y escribir archivos, listar, ejecutar",
      "comandos, buscar. Cada herramienta declara su nombre, qué hace y qué parámetros acepta.",
      "",
      "Regla dura: si una herramienta no está aquí, el modelo no puede usarla, por mucho que",
      "se la inventen. Y al contrario: si no está, un modelo pequeño intentará imitarla EN",
      "TEXTO (`run_command command=\"…\"`), y ese texto puede acabar en el shell. Para eso está",
      "la aduana de `comandoEntrante.ts`.",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "motor-modeltiers",
    table: "manual",
    title: "modelTiers.ts: el perfil de cada modelo (contexto, herramientas, memoria)",
    keys: ["modeltiers", "perfil de modelo", "tier", "contexto", "herramientas", "cloud", "alias"],
    body: [
      "Traduce el nombre de un modelo a un perfil: tamaño, si es local o de nube, cuánto",
      "contexto darle, cuántos mensajes de historial, y si es capaz de llamar herramientas.",
      "",
      "Dos trampas que ya han mordido:",
      "· Clasifica POR EL NOMBRE. Un modelo de nube RENOMBRADO (`gpt-oss:120b-cloud` guardado",
      "  como `NEMESIS:latest`) pierde la marca `-cloud` y hereda el perfil de un modelo local",
      "  diminuto: menos contexto, salida truncada y SIN herramientas. Se paga la lentitud de un",
      "  120B y se recibe el trato de un 0,5B, sin ningún error visible. Por eso existe la tabla",
      "  de alias.",
      "· «Capaz de herramientas» tiene un mínimo de tamaño además de la lista blanca: por debajo,",
      "  el tool-calling falla de forma intermitente, que es peor que no intentarlo.",
    ].join("\n"),
    weight: 1,
  },

  // ============================================================
  // BLOQUE 2 — LOS FLUJOS: CÓMO OCURREN LAS COSAS
  // ============================================================
  {
    id: "motor-flujo-arranque-sandbox",
    table: "manual",
    title: "Flujo: cómo se levanta el proyecto del usuario en el :3500",
    keys: ["arrancar sandbox", "flujo de arranque", "previsualizador", "no arranca", "start sandbox"],
    body: [
      "Orden real de los pasos. Conocerlo ahorra buscar en el sitio equivocado:",
      "",
      "1. Se SINCRONIZA el workspace al disco del sandbox (lo que el editor tiene en memoria",
      "   baja a `.proyectos/`). Si esto no corre, el disco no tiene nada que arrancar.",
      "2. Se RECONOCE el proyecto por marcadores (ADUANA). Si no hay marcador, se para aquí —",
      "   y el mensaje debe decir DÓNDE miró y QUÉ encontró, o el usuario no puede hacer nada.",
      "3. Si es ESTÁTICO (hay `index.html`), se levanta un servidor de archivos propio en el",
      "   3500. No hace falta npm ni build.",
      "4. Si es Node/Python, se ejecuta su comando de arranque y se le habla por el 3500.",
      "5. El previsualizador es un `iframe` que apunta a `127.0.0.1:3500`.",
      "",
      "Por eso «no arranca» tiene tres causas muy distintas: no se sincronizó, no se reconoció,",
      "o se reconoció y el comando falló. El registro dice cuál de las tres, y hay que leerlo.",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "motor-flujo-preview-blanco",
    table: "error",
    title: "El preview sale en blanco: las cuatro causas, en orden de frecuencia",
    keys: ["preview blanco", "pantalla blanca", "no se ve nada", "iframe vacio", "3500 en blanco"],
    body: [
      "Blanco NO significa «no cargó». Significa «cargó algo y no se ve». El orden en que hay",
      "que descartarlas:",
      "",
      "1. EL SANDBOX NO ESTÁ ARRANCADO. El iframe apunta a un puerto muerto. El navegador",
      "   normalmente dice «rechazó la conexión», pero dentro de un iframe puede quedar mudo.",
      "   → Comprobar el estado REAL del :3500, no una bandera de la interfaz.",
      "2. EL `index.html` NO ES HTML. Un archivo de 24 bytes con un comentario dentro se sirve",
      "   como `text/html`, el navegador no encuentra ni una etiqueta y pinta blanco. Sin error",
      "   y sin nada en consola. → El servidor debe comprobar que el contenido PARECE HTML.",
      "3. FALTAN ARCHIVOS DE LA WEB. Un `index.html` que enlaza `styles.css` y `script.js` que",
      "   no existen se renderiza igual de blanco que un archivo vacío. → Cotejar contra el",
      "   espejo del proyecto.",
      "4. EL `dist/` ESTÁ VIEJO. Distinto caso: aquí lo que se sirve funciona, pero es la",
      "   versión anterior. Se nota porque los cambios «no se aplican».",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "motor-flujo-kb",
    table: "manual",
    title: "Flujo: cómo aprende y cómo persiste la base de datos del motor",
    keys: ["aprender", "persistir", "guardar kb", "cerebro-db", "memoria del motor"],
    body: [
      "El motor escribe lo aprendido en `.cerebro-db/kb.json`: cada 30 segundos y al salir con",
      "SIGINT/SIGTERM.",
      "",
      "Dos reglas de estabilidad que afectan directamente a que la base CREZCA en vez de",
      "encogerse:",
      "· La escritura debe ser ATÓMICA (escribir en un temporal y renombrar). Escribir encima",
      "  del archivo bueno deja la base TRUNCADA si el proceso muere a mitad: al arrancar de",
      "  nuevo, la mitad del conocimiento no está, y el archivo corrupto no avisa.",
      "· Al recargar, la semilla de fábrica se reinyecta solo para lo que FALTE. Si no, cada",
      "  reinicio borraría lo aprendido; y si la semilla se cargara siempre encima, lo",
      "  aprendido no se podría corregir nunca.",
    ].join("\n"),
    weight: 1,
  },

  // ============================================================
  // BLOQUE 3 — INVARIANTES: LO QUE NO SE PUEDE ROMPER
  // ============================================================
  {
    id: "motor-invariante-puertos",
    table: "rule",
    // Otra vez la misma lección: las tres claves llevaban «puerto», así que sumaban
    // 3,0 en cualquier consulta sobre puertos y esta entrada enterraba al MAPA DEL
    // MOTOR, que es la que tiene que responder «en qué puerto va cada cosa».
    // Se queda una clave con «puerto»; las otras dos apuntan a su idea propia
    // («fijo en el codigo», «variable de entorno») sin repetir la común.
    // MEDIDO, no supuesto. Esta entrada sacaba 6,50 en «en qué puerto va el
    // proyecto del usuario» y 4,10 en «el proyecto está en una subcarpeta»,
    // ganando en las dos y tapando a `motor-mapa-general` y a
    // `motor-projectporter`. ¿De dónde salían esos puntos? De la palabra
    // «proyecto», que estaba en el TÍTULO y en una clave. Es decir: puntuaba por
    // una palabra que no es suya, en consultas que hablan de otra cosa.
    // El invariante no trata del proyecto: trata de DÓNDE SE FIJA UN PUERTO. Se
    // reescribe sin la palabra prestada y las dos consultas vuelven a su sitio.
    title: "El puerto de ejecución se fija en el código, no se hereda del entorno",
    keys: ["puerto fijo", "fijo en el codigo", "variable de entorno", "heredar el entorno"],
    body: [
      "El proyecto del usuario se sirve SIEMPRE en el 3500, escrito en el código. No se lee de",
      "una variable de entorno del sistema: en el equipo del usuario esa variable puede estar",
      "puesta por otro programa, y entonces el servidor del proyecto arranca en un puerto que",
      "el previsualizador no está mirando. El resultado es un iframe en blanco con el servidor",
      "perfectamente vivo en otro sitio — el fallo más difícil de diagnosticar de todos.",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "motor-invariante-dist-viejo",
    table: "rule",
    title: "Tocar `src/` o `server.ts` no cambia nada hasta recompilar",
    keys: ["recompilar", "dist viejo", "no se aplican los cambios", "build"],
    body: [
      "El navegador NO lee `src/`: lee lo que hay en `dist/`. Editar el fuente y no compilar",
      "produce el síntoma «lo arreglé y sigue igual», que es el más caro de todos porque hace",
      "dudar del arreglo en vez de del despliegue.",
      "",
      "La comprobación que no engaña: mirar si la versión que dice la cabecera es la del fuente.",
      "Si no coinciden, lo que corre no es lo que se acaba de escribir.",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "motor-invariante-modulo-puro",
    table: "rule",
    title: "Los módulos de `src/` que llegan al navegador no pueden tocar disco",
    keys: ["modulo puro", "fs en el navegador", "guarda de vite", "node en el bundle"],
    body: [
      "Todo lo que está bajo `src/` puede acabar dentro del paquete del navegador. Si uno de",
      "esos módulos importa `fs`, `path`, `child_process` o cualquier `node:*`, el empaquetador",
      "lo sustituye por un hueco que revienta al ejecutarse. No falla al compilar: falla en el",
      "navegador, lejos de donde se escribió.",
      "",
      "La separación es una decisión de arquitectura: la LÓGICA en módulos puros (probables sin",
      "navegador) y el ACCESO A DISCO y a procesos en el servidor, que es el único que puede.",
      "Por eso la aduana del árbol, el espejo del proyecto, el contenedor y el creador de vídeo",
      "son funciones puras: devuelven planes y veredictos; quien los ejecuta es el servidor.",
    ].join("\n"),
    weight: 1,
  },

  // ============================================================
  // BLOQUE 4 — CONOCIMIENTO GENERAL (lo que no es código, pero rompe igual)
  // ============================================================
  {
    id: "gen-estabilidad-guardas",
    table: "rule",
    title: "Un servidor sin guardas globales muere por una promesa suelta",
    keys: ["estabilidad", "guardas", "promesa rechazada", "se cae el servidor", "uncaught"],
    body: [
      "En Node, una promesa que se rechaza sin nadie que la recoja TERMINA EL PROCESO por",
      "defecto. En un IDE eso significa perder la sesión entera, la memoria sin guardar y los",
      "archivos abiertos por un fallo en una ruta que quizá ni se estaba usando.",
      "",
      "Tres guardas mínimas, y las tres son baratas:",
      "· `unhandledRejection` — registrar y SEGUIR. Es el que más vidas salva.",
      "· `uncaughtException` — registrar, intentar guardar el estado y salir limpio: tras una",
      "  excepción no atrapada el proceso está en un estado que no se puede confiar.",
      "· Un middleware de error al final de la cadena de rutas, para que una excepción dentro de",
      "  una ruta no deje al cliente esperando una respuesta que ya no va a llegar (la interfaz",
      "  se queda girando para siempre).",
      "",
      "Y un detalle que se olvida siempre: las guardas deben ser lo bastante ruidosas para que",
      "el fallo no desaparezca. Un `catch {}` que se traga todo no es robustez, es ceguera.",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "gen-escritura-atomica",
    table: "rule",
    title: "Escribir un archivo de datos = temporal + renombrar",
    keys: ["escritura atomica", "archivo corrupto", "truncado", "renombrar", "writeFileSync"],
    body: [
      "Escribir directamente sobre un archivo de datos lo deja truncado si el proceso muere a",
      "mitad. Y no se nota: el archivo existe, pesa algo y se abre. Solo al intentar leerlo se",
      "descubre que la última mitad no está.",
      "",
      "El patrón correcto es siempre el mismo: escribir en `archivo.tmp` y luego RENOMBRAR sobre",
      "el definitivo. El renombrado dentro del mismo sistema de archivos es atómico: el archivo",
      "o es el viejo entero, o el nuevo entero, nunca la mezcla.",
      "",
      "Aplica a cualquier cosa que se guarde sola: bases de datos, índices, memorias, ajustes.",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "gen-no-empaquetar-secretos",
    table: "rule",
    title: "Un secreto empaquetado ya está filtrado: el daño no se deshace",
    keys: ["secretos", "empaquetar", ".env", "filtracion"],
    body: [
      "Un `.env` o una clave privada dentro de un ZIP no se puede «recuperar»: en cuanto sale de",
      "la máquina, hay que rotar la credencial. Por eso estos archivos no entran al paquete NI",
      "CON PERMISO del usuario: no es una preferencia, es que la acción no tiene vuelta atrás.",
      "",
      "Y de poco sirve tener la lista si no se avisa: lo excluido se registra CON SU MOTIVO en",
      "el manifiesto del paquete. Una exclusión silenciosa haría creer que el archivo viaja.",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "gen-verificar-antes-de-afirmar",
    table: "rule",
    title: "«Compila» no es «funciona», y «está en el código» no es «está en ejecución»",
    keys: ["verificar", "no afirmar sin probar", "compila no es funciona", "prueba real"],
    body: [
      "Tres niveles de verificación, y solo el tercero cuenta como «hecho»:",
      "1. COMPILA (tipos en orden) — no dice nada del comportamiento.",
      "2. PASA LAS PRUEBAS (comprobaciones deterministas) — dice que lo que se probó funciona.",
      "3. SE EJECUTA DE VERDAD (arrancar y pedir) — lo único que demuestra que el conjunto",
      "   funciona junto.",
      "",
      "Un caso real de esta sesión: el servidor arrancaba y el título decía la versión nueva,",
      "pero `dist/server.mjs` no estaba en el paquete, así que `npm start` habría fallado en",
      "cualquier equipo recién descomprimido. Compilaba. Pasaba las pruebas. No arrancaba.",
      "",
      "Y su reverso: cuando una comprobación NO se puede hacer, se dice que no se pudo. Afirmar",
      "un resultado no verificado es peor que no dar ninguno, porque nadie vuelve a mirarlo.",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "gen-una-sola-fuente",
    table: "rule",
    title: "Un dato, un sitio: dos fuentes acaban contradiciéndose",
    keys: ["una sola fuente", "duplicar dato", "dos fuentes", "divergencia"],
    body: [
      "Todo valor que se pueda desincronizar se desincroniza. En este proyecto ha pasado con",
      "la versión (dos literales en el mismo objeto), con el estado del sandbox (una bandera",
      "fija en «todo bien» que tapaba el fallo), y con el recuento de archivos del paquete.",
      "",
      "El patrón que lo evita: UN literal, y todo lo demás DERIVADO. Si hacen falta dos formas",
      "del mismo dato (una para mostrar y otra para la herramienta), la segunda se calcula, no",
      "se escribe.",
      "",
      "Señal de alarma: dos sitios que dicen lo mismo y hay que acordarse de cambiar los dos.",
      "El día que se olvide uno, la pantalla se contradecirá consigo misma.",
    ].join("\n"),
    weight: 1,
  },
  {
    id: "gen-nombres-y-precedencia",
    table: "rule",
    // Y aquí la tercera. El título llevaba «proyecto» y «una», y la clave «dos
    // proyectos» contenía «proyecto»: entre los dos sumaban 2,4 en la consulta
    // «el proyecto está en una subcarpeta» y desplazaban a `motor-projectporter`,
    // que es exactamente la entrada que habla de eso. Título sin palabras
    // genéricas y clave sin la común.
    title: "Dos candidatos a la vez: el detector no debe elegir en silencio",
    keys: ["copia", "espejo", "duplicado", "prioridad", "elegir en silencio"],
    body: [
      "Cuando aparecen dos candidatos a «el proyecto» (uno en la raíz y otro anidado), el",
      "detector elige uno y el usuario ve funcionar algo que no es lo que editó. El resultado",
      "es una clase de fallo muy cara: todo «funciona» y el resultado es el equivocado.",
      "",
      "Protocolo: el detector NO debe elegir en silencio. Si encuentra dos, lo dice, con las dos",
      "rutas. Elegir bien es menos importante que no ocultar que había dos.",
    ].join("\n"),
    weight: 1,
  },
];
