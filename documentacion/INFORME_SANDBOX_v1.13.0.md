# INFORME — v1.7.0 «SEGURIDAD Y PUERTA»

**Build:** v1.6.33-CONSEJO-QUE-VOTA → **v1.7.0-SEGURIDAD-Y-PUERTA**
**Fecha:** 24-sep-2026 · **Propietario:** Mario Nicolas Quintero
**Base de trabajo:** el ZIP `Cerebronico-CN-v1.6.33-CONSEJO-QUE-VOTA` que subiste, auditado primero y modificado después.
**Plan que ejecuta:** [PLAN_MAESTRO_V2](PLAN_MAESTRO_V2/PLAN_MAESTRO_CEREBRONICO_V2_PRO.md) — fases 0 y 1 completas, más la automatización del `.bat`.

------------------------------------------------------------------------

## 1. La puerta, ejecutada (no citada)

| Comprobación | Antes (v1.6.33) | **Ahora (v1.7.0)** |
|---|---|---|
| `npx tsc --noEmit` | 0 errores | **0 errores** |
| `npm run validar` | 3372 · 0 fallos · 63 suites | **3442 · 0 fallos · 64 suites · 0 sin correr** |
| Integridad | 22 ficheros firmados a mano | **457 ficheros firmados por generador · `sha256sum -c` = 457/457** |
| `npm audit --audit-level=high` | — | **0 vulnerabilidades** |
| Bundle | `dist/server.mjs` con 1.6.33 | **`dist/server.mjs` con 1.7.0 · `node --check` sano** |
| Humo real | — | **`:3000` responde 200 y sirve «CerebróNico V1.7.0» · puente `:5000` responde en vivo con `shell: false`** |
| Árbol tras la puerta | — | **`manifiesto:verificar` = 457 declarados · 457 en disco · TODO COINCIDE** |

Delta: **+70 comprobaciones** (3372 → 3442), **0 regresiones**, y una suite nueva.

------------------------------------------------------------------------

## 2. FASE 0 · Verdad congelada (completa)

### 2.1 La puerta ya no puede quedarse sin ejecutar una suite
`scripts/validar.mjs` ejecutaba una **lista fija**. Una suite nueva que nadie registrase **no corría nunca** y el veredicto seguía verde.

- Ahora **descubre** `tests/*.test.ts` y `scripts/validar-*.mts` en disco y las ejecuta todas, estén en el catálogo o no.
- Una suite del catálogo **cuyo fichero ya no existe** es un **rojo**, no un silencio.
- **Prueba en vivo, no teórica:** la suite nueva `tests/seguridadPuente.test.ts` se ejecutó **sin** estar registrada, y el propio informe lo dijo:
  `1 suite(s) en disco fuera del catálogo — se ejecutan igual: + tests/seguridadPuente.test.ts`
- El catálogo se conserva como **descripciones** (y la regla de la casa «toda suite se registra» sigue viva: la suite `resiliencia` la comprueba y ahora pasa).

### 2.2 Ninguna marca ✗ se pierde, y ninguna lectura tapa a la otra
Aquí me equivoqué en el primer intento y lo dejo escrito, porque la corrección es el dato:

- **Lo que había:** si la suite traía recuento, las marcas `✗` no se miraban.
- **Lo que probé primero:** «gana el caso peor» (`mal = max(mal, marcas)`). **Saltó un falso rojo** en `planner`: esa suite **imprime** `✗ #2 revienta [fallida · io]` como **contenido** (el estado de una tarea que el test hace fallar a propósito), no como comprobación fallida.
- **Lo que quedó, tras comprobarlo en las 62 suites:** manda el **veredicto + el código de salida** (las 62 suites hacen `process.exitCode = 1` al fallar), y las marcas `✗` **no se ignoran**: si el veredicto dice 0 fallos y hay marcas, se **avisan en voz alta** en el informe.
  Hoy: `AVISO: 1 marca(s) ✗ en 1 suite(s) verde(s) — revisar…` ← eso antes era silencio.

### 2.3 El manifiesto lo genera la máquina: 22 → 457
`scripts/manifiesto.mjs` (nuevo, con `npm run manifiesto` y `npm run manifiesto:verificar`):
recorre el paquete y firma **todo**. Excluye lo que se explica por escrito: `node_modules`, `.proyectos/**` (estado que las pruebas de humo modifican), `*.log` y el propio manifiesto.
`--verificar` responde a las dos preguntas que importan: **¿cambió algo?** y **¿hay ficheros nuevos que el manifiesto no conoce?**

### 2.4 ROADMAP regenerado
Se corrigieron los pendientes que ya estaban implementados y que hacían **repetir trabajo en cada sesión**: D7 (votación), D8 (métricas), D-P1 (parser real) y el catálogo honesto figuraban como pendientes. Ver `ROADMAP.md`.

------------------------------------------------------------------------

## 3. FASE 1 · Seguridad cerrada (completa)

### 3.1 El puente ya no usa shell — y no perdió `dir`
`agent_bridge_5000.py` ejecutaba con `subprocess.run(..., shell=True)` sin lista blanca de binarios. La mitigación declarada era «token + auditoría»: la auditoría dice lo que pasó **después**; no impide nada.

**Ahora:**
1. **Sin shell.** El comando se parte con `shlex`, se rechazan los metacaracteres (`;` `>` `<` `` ` `` `$(` `${` `^` y el **`&` suelto** que colaba a cmd.exe) y cada tramo se valida contra una **lista blanca**.
2. **Los nativos de Windows siguen funcionando** (`dir`, `echo`, `type`, `tasklist`…): van por `cmd.exe /c` con el comando **ya saneado**. Aquí tuve un fallo real que cazó mi propia prueba: comparaba la lista de binarios y **olvidaba la de nativos**, así que `dir` quedaba rechazado en Windows por el endurecimiento pensado para Windows. Corregido.
3. **La lista es explícita y tuya:** `puente-permitidos.json`, versionado y comentado. Deliberadamente **no** están `rm`, `mv`, `cp`, `dd`, `del`, `reg`, `net`: las mutaciones de fichero van por `/api/fs/*`, que sí comprueba raíces. Añadir un binario es una decisión escrita.
4. **Fallos con motivo y con instrucción:** un binario no listado o una ruta fuera de sitio devuelven **por qué** y **qué hacer** para permitirlo. Nada de «error 500».
5. **Límite declarado (no lo escondo):** la lista blanca decide **qué programas** se ejecutan; **no** encierra los permisos de fichero de un programa permitido — eso exige un sandbox del sistema operativo. Lo que sí se impide: binarios arbitrarios, composición de shell, redirección a fichero, borrado, y ejecución de binarios descargados.

### 3.2 Contención de rutas de verdad
`resolve_pc_path` terminaba en `return os.path.abspath(p)`: **cualquier ruta absoluta pasaba**. Ahora toda ruta se resuelve con `realpath` y se comprueba contra **raíces permitidas** (`commonpath`); fuera de ellas → **403 con motivo**. Y el patrón correcto ya existía en el proyecto (`resolveSafePath`, `server.ts:662-669`): solo faltaba aplicarlo aquí.

Además hay **una sola puerta** (`_resolver`) por la que resuelven los seis endpoints de `/api/fs/*`, para que no pueda quedar un endpoint nuevo sin la comprobación.

### 3.3 Origen, token y auditoría por acción
- **Sin `Origin` ya no se salta el filtro**: se exige además **loopback**. (El cliente Node no manda `Origin` — ese era exactamente el caso que dejaba pasar a cualquier cliente que no fuese un navegador.)
- **Guard del servidor fail-closed** (`server.ts`): antes `if (!token) return true;` — **sin `ACCESS_TOKEN` la puerta no existía**, y el mismo guard protege rutas alcanzables en red local. Ahora: token correcto → pasa; si no, solo loopback. La ausencia de configuración **no** es un permiso.
- **11 endpoints mutantes** que antes entraban sin puerta, ahora con guard (bóveda, espejos, export Android, sync de la KB, flatten-root, forjar extensión, fondo POST/DELETE, medir puente, inspeccionar contenedor, extensiones enable/disable/delete).
- **Auditoría en JSON Lines** (`auditoria.jsonl`): hora, acción, detalle, resultado y motivo, de cada ejecución **y de cada rechazo** (token, origen, ruta, comando).
- **`GET /api/seguridad/estado`** (nuevo): el puente publica su propia postura —shell, lista blanca, raíces, ruta de auditoría y últimas entradas—. La seguridad se puede **consultar**, no solo creer.

### 3.4 La suite que lo protege: `tests/seguridadPuente.test.ts` (68 comprobaciones)
No comprueba que exista un comentario que diga «hay lista blanca»: **importa el puente y le pregunta**, y conserva comprobaciones estáticas para que **vuelvan a fallar solas** si alguien reintroduce lo que se quitó (que es como vuelven estas cosas: de buena fe, en una sesión futura, porque `dir` «no funcionaba»).
Ejemplos de lo que exige: rechaza `rm -rf /`, `curl … | sh`, `node -v & rm -rf /`, `npm run build > log.txt`, `echo hola; rm x`; acepta `node --version` y `npm run build | tail -5` (partido en 2 tramos); rechaza `~/.ssh/id_rsa` y acepta `~/Cerebronico/a.txt`; sin `Origin` solo pasa loopback.

------------------------------------------------------------------------

## 4. El `.bat` automatizado (lo que pediste en marcha)

`ide/backend/iniciar_todo_windows.bat` **imprimía** «Abre tu navegador en: http://127.0.0.1:3000» y el usuario copiaba la dirección a mano. Peor: `npm run dev` corría **en esa misma ventana**, así que la única forma de abrir el navegador era **antes** de que el servidor existiera — con la página de error delante.

**Ahora:**
1. El servidor arranca **en su propia ventana**: cerrar la consola del `.bat` **no apaga la IDE**, y la consola sigue viva para informar.
2. Se espera a que `:3000` **responda de verdad** (PowerShell `Invoke-WebRequest`, con `netstat` como plan B si PowerShell está bloqueado) — no solo a que el puerto esté escuchando.
3. **Abre el navegador solo**, una vez, en el momento correcto.
4. Si **ya había** una IDE en `:3000`, **no** lanza una segunda (antes: `EADDRINUSE` y una ventana de errores rojos que parecía «se rompió»).
5. Mini consola: **[B]** reabrir navegador · **[E]** estado de los cuatro puertos · **[Q]** salir sin apagar nada.
6. Detalles de `.bat` que se corrigieron a propósito: **sin comillas anidadas** en `start`, **sin bloques `( … )`** alrededor de `%errorlevel%` (dentro de un bloque se expande al leerlo, no al ejecutarlo: habría abierto el navegador antes de tiempo), etiquetas verificadas una a una, `echo` sin caracteres no-ASCII y fin de línea **CRLF**.

**Nota honesta:** el `.bat` es de Windows y **no se ha podido ejecutar aquí** (este entorno es Linux). Se ha validado de forma estática: etiquetas ↔ `goto` sin huérfanos, bloques equilibrados, sin trampas de expansión diferida y sintaxis revisada línea a línea. La prueba real es tu doble clic.
Existe además `ide/arrancar_cerebronico.bat`, que ya abría el navegador con una espera más débil (`netstat`): **no lo he tocado** para no cambiar lo que no me pediste, pero conviene alinearlo. Dime y lo hago.

------------------------------------------------------------------------

## 5. Qué NO está hecho (dicho, no disfrazado)

| Fase | Estado | Por qué |
|---|---|---|
| **F2 · Partir el monolito** (`server.ts`, 11.461 líneas) | **Pendiente** | Es la fase grande: 14 dominios a routers, con el contrato de las 126 rutas congelado antes de mover nada. Estimación: 2–3 semanas. **No se empieza a medias**: dejar el árbol con medio servidor migrado es peor que no empezar. El plan está listo para ejecutarla ([Anexo C](PLAN_MAESTRO_V2/ANEXO_C_MAPA_OBJETIVO_Y_CONTRATOS.md)) |
| F3 · Motor del chat (pipeline) | Pendiente | Depende de F2 |
| F4 · Cerebro ejecutor (23 acciones) | Pendiente | Independiente de F2 |
| F5 · Producto y datos (App.tsx, IndexedDB) | Pendiente | Depende de F2 |
| F6 · Git nativo | Pendiente | Da igual el orden, alta prioridad |
| F7 · Visión y mapa aspiracional | Pendiente | Decisión tuya |

**Tampoco hecho:** el e2e con Python (`npm run test:e2e` pide Python y Ollama), la prueba del EXE/NSIS, y **ningún pentest contra el puente en marcha**: lo de §3 es lectura de código **más** las 68 comprobaciones que ejecutan el puente de verdad, no un ataque simulado.

**Y una cosa que no puedo prometer:** no he ejecutado la aplicación **en Windows**. Todo lo del `.bat` es validación estática; el puente endurecido sí se ejecutó (su suite y su endpoint en vivo), pero sobre Linux.

------------------------------------------------------------------------

## 6. Ficheros tocados

**Nuevos (4):**
- `ide/backend/puente-permitidos.json` — la lista blanca, versionada y comentada
- `ide/backend/tests/seguridadPuente.test.ts` — 68 comprobaciones (registrada en la puerta)
- `ide/backend/scripts/manifiesto.mjs` — el manifiesto generado y verificado
- `PLAN_MAESTRO_V2/` — el plan y sus tres anexos (viajan con el paquete)

**Modificados (7):**
- `ide/backend/agent_bridge_5000.py` — sin shell, lista blanca, contención, origen, auditoría, `/api/seguridad/estado`
- `ide/backend/server.ts` — guard fail-closed + 11 endpoints con puerta
- `ide/backend/scripts/validar.mjs` — descubrimiento dinámico, parser honesto, aviso de marcas
- `ide/backend/iniciar_todo_windows.bat` — arranque con navegador automático
- `ide/backend/src/constants.ts`, `package.json`, `index.html` — versión única 1.7.0
- `ROADMAP.md` — regenerado contra el código
- `MANIFIESTO_SHA256_v1.7.0.txt` — 457 ficheros

**No tocado a propósito:** los 10 espejos, el planificador, el Quirófano, `brain`/`memoria.md`, la política del guardián de sintaxis y los puertos 3000/3500/5000/11434.

------------------------------------------------------------------------

## 7. Cómo verificar todo esto en 6 comandos

```bash
cd ide/backend
npm ci
npx tsc --noEmit                 # 0 errores
npm run validar                  # 3442 · 0 fallos · 64 suites · 0 sin correr
npm run build                    # bundle al día (con 1.7.0 dentro)
npm start                        # y abre http://127.0.0.1:3000
npm run manifiesto:verificar     # 457/457 · TODO COINCIDE
```

Y para comprobar por tu cuenta las dos que más importan:

```bash
grep -n "shell=True" agent_bridge_5000.py            # solo comentarios, cero en código
curl -s http://127.0.0.1:5000/api/seguridad/estado   # {"shell": false, ...}
```

------------------------------------------------------------------------

## 8. Siguiente paso

**F2, y solo F2.** El orden del plan no es negociable: sin monolito partido, F3 y F5 son trabajo sobre terreno movedizo. El primer entregable de F2 **no** es código: es el **contrato de las 126 rutas congelado** (`tests/superficieRutas.test.ts`), que es lo que permite mover 11.461 líneas sin romper nada.

Si prefieres algo con resultado visible antes, el plan tiene dos fases independientes de F2 con impacto directo en tu día a día: **F6 (git nativo** — el hueco que el propio ROADMAP llamaba «el más grande») y **F4 (que el consejo ejecute, no solo vote)**.

------------------------------------------------------------------------

## 9. v1.7.1 — FONDO A 100 MB Y EL CONSEJO, MEDIDO

Segunda vuelta sobre la misma entrega. La puerta, ejecutada de nuevo y sobre este
estado exacto: **3473 comprobaciones · 0 fallos · 64 suites · 0 sin correr**
(antes 3442: +31, y 0 regresiones). Versión única 1.7.1 en `constants.ts`,
`package.json`, `index.html` y dentro del bundle.

### 9.1 Fondo de pantalla: 100 MB, y el número es real

**Lo que se pidió:** subir el tamaño soportado a 100 MB.

**Lo que había:** gif 48 MB · foto 32 MB de techo (el vídeo ya estaba en 128).
Y un techo que, además, **no lo ponía el disco**: lo ponía el transporte. El fondo
se leía con `FileReader`, se convertía a base64 (+33 %) y se guardaba como una
cadena de texto en IndexedDB. Un fondo de 100 MB son ~133 millones de caracteres,
que en memoria son ~266 MB en UTF-16: el navegador se queda sin aire **antes** de
escribir. Subir el número sin cambiar esto habría sido prometer 100 MB y fallar a
los 40 — el peor tipo de límite, el que miente.

**Lo que se hizo:**

| Pieza | Antes | Ahora |
|---|---|---|
| Transporte | data URL (base64, +33 %) | **Blob directo** — sin conversión ni cadena gigante |
| Techo gif | 48 MB | **100 MB** |
| Techo foto fija | 32 MB | **100 MB** |
| Techo vídeo | 128 MB | **128 MB** (no se toca: «aumentar» no puede significar bajar) |
| Imagen propia del panel | data URL → preferencias (localStorage, ~5 MB, pérdida silenciosa) | **Blob → IndexedDB** + marca corta en preferencias |
| Al cambiar de fondo | la URL anterior quedaba viva | **se libera** (`revocarFondo`) |
| Avisos 4 MB / 8 MB | consejo | **consejo** (no se movieron: no son aduana) |

**Un fallo que apareció de camino, y que llevaba ahí desde antes:** el selector de
«imagen propia» de la configuración **nunca pintaba nada**. Guardaba el data URL
en las preferencias, y `AppBackground` da **prioridad** a `customImageUrl` — que
App tiene siempre puesto con el fondo por defecto. Es decir: la imagen se guardaba
y no se veía, sin error. Ahora la imagen va a IndexedDB y el panel avisa a App
para aplicarla **al instante**.

**Cómo se comprueba:** la suite `fondoPeso` pasa de 55 a **64 comprobaciones** y
estrena una sección que no se conforma con el número: exige que el
almacenamiento haya cambiado de verdad (acepta `Blob`, existe `urlDeFondo`, el GIF
ya no pasa por `readAsDataURL`, la foto usa `canvas.toBlob`, la marca no llega al
CSS). Esas comprobaciones son estáticas y **se dice por qué**: IndexedDB no existe
en Node, así que probarlas de verdad exige un navegador — fingir lo contrario
sería peor que declarar el límite.

### 9.2 El Consejo: de votar a ejecutar (Fase 4, primer paso)

**El problema, medido:** el Consejo atribuye el voto (v1.6.33), pero votar no es
hacer. Cuántas de las 23 acciones acaban en trabajo real había que deducirlo
cruzando dos ficheros a mano — y el resultado no era el que la documentación
sugería.

**El entregable:** `src/engine/ejecutoresConsejo.ts` — el registro acción →
ejecutor, con dos estados y ninguno más: **`real`** (hay función, con fichero y
llamada) o **`declarada`** (no hay, y dice POR QUÉ y cuál sería el natural).

**El número, sin adornos: 2 acciones con ejecutor real · 21 declaradas.**

- Reales: `calculo` → `cerebroReflejo.calcular()` · `convertir` → `formatConverter.convertir()`.
- Declaradas: las 21 restantes, cada una con su motivo. Por ejemplo `testear` no
  se declara «pendiente» a secas: dice que el Validador existe como especialista,
  que `syntaxGuard` valida sintaxis y que **ejecutar pruebas lo hace la puerta**
  (`npm run validar`) — o sea, el ejecutor natural es invocar la puerta desde el plan.

**Dos garantías que no son promesas:**
1. El registro es `Record<AccionConsejo, …>`: si mañana se añade una acción al
   clasificador y no se le pone ficha, **el proyecto no compila**.
2. La suite comprueba que cada ejecutor «real» apunta a una función que **existe
   en el fichero que dice** (no basta con escribir un nombre bonito).

**Qué NO es esto:** no he implementado los 21 ejecutores. Este paso hace el hueco
**medible y planificable**; el trabajo de llenarlo es la Fase 4 completa. Un hueco
declarado se planifica; un hueco que nadie escribió se confunde con una capacidad
que existe — y eso es exactamente cómo un «consejo de 12 especialistas» acaba sin
hacer nada.

### 9.3 Estado del plan tras esta vuelta

| Fase | Estado |
|---|---|
| F0 · Verdad congelada | **completa** |
| F1 · Seguridad cerrada | **completa** |
| F4 · Cerebro ejecutor | **en curso** — registro hecho (2/23); falta enchufar ejecutores |
| F2 · Partir el monolito | pendiente (2–3 semanas; empieza por el contrato de las 126 rutas) |
| F3 · Motor del chat · F5 · Producto y datos · F6 · Git nativo · F7 · Visión | pendientes |

Ficheros nuevos de esta vuelta: `src/engine/ejecutoresConsejo.ts`. Modificados:
`src/engine/fondo.ts`, `src/utils/indexedDBStorage.ts`, `src/App.tsx`,
`src/components/ProConfigPanel.tsx`, `src/components/AppBackground.tsx`,
`tests/fondoPeso.test.ts`, `tests/consejoVotacion.test.ts`, y los tres de la versión.

### 9.4 Lo que sigue sin poder prometer

- **No he probado el navegador.** El fondo de 100 MB está implementado y sus
  piezas verificadas por código y por suite; la prueba de verdad es que subas un
  archivo de ese tamaño. Si algo falla ahí, el sitio donde mirar es la consola del
  navegador: el guardado avisa por `alert` en vez de callarse.
- **No he ejecutado Windows** (ni el `.bat` ni la app). Es entorno Linux.

------------------------------------------------------------------------

## 10. v1.8.0 — «VOZ»: CERTEZA, UNA FRASE POR ARTEFACTO Y HABLAR SIN QUE PREGUNTEN

Tercera vuelta sobre la misma entrega, con tres encargos: vocabulario, explicar
siempre en una frase qué es y para qué sirve el código (y si está ejecutado), y
una facultad autónoma de decir lo que ya se sabe sin esperar a que pregunten.

Puerta ejecutada sobre este estado exacto: **3548 comprobaciones · 0 fallos ·
65 suites · 0 sin correr** (antes 3473/64: **+75**, todas de la suite nueva
`tests/voz.test.ts`, y 0 regresiones). Versión única **1.8.0** en `constants.ts`,
`package.json`, `index.html` y dentro del bundle.

### 10.1 La certeza, metida en el idioma

**El problema:** la regla de la casa ya era «creer solo lo verificado contra
código». Pero una regla no impide escribir «verificado» en un informe que nadie
ejecutó — eso lo impide el idioma. Y un texto sin ejecución detrás suena igual
que uno con ella, que es lo que hace que la gente deje de distinguirlos.

**Lo que hay ahora** (`src/engine/certeza.ts` + `src/engine/vocabulario.ts`):
tres niveles y ninguno más — **ejecutado · leído · sin verificar** — y un
catálogo de 14 palabras que **afirman** un resultado (`funciona`, `verificado`,
`comprobado`, `listo`, `terminado`, `soportado`, `garantizado`, `sin errores`,
`0 fallos`…). Cada una declara qué certeza exige. `revisarVocabulario(texto,
certeza)` devuelve los avisos con su motivo y **con la forma de decirlo sin
mentir**.

Dos propiedades que la suite vigila porque son donde esto se rompe:
- **Leer NO asciende a ejecutado.** `certezaDe({leido:true, ejecutado:false})` es
  «leído», no «ejecutado». Es la trampa más común: como he leído el código, digo
  que va.
- **Con ejecución real no hay avisos.** El filtro no es un detector de pesimismo:
  cuando hay salida real, deja escribir «funciona» sin molestar.

### 10.2 Una frase por artefacto, y no la redacta un modelo

`src/engine/explicacionArtefacto.ts` produce:

```
src/engine/fondo.ts — módulo de motor (lógica determinista) · FONDO v1: fondo
animado (GIF / MP4 / WebM de 4-8 s) para la IDE. Estado: solo leído: NO ejecutado.
```

**Por qué es determinista y no lo redacta el modelo:** si la frase la escribe
quien quiere que suene bien, la frase acaba sonando bien aunque el trabajo esté a
medias. El «qué» y el «para qué» se **extraen de la cabecera del propio fichero**
(convención de la casa `nombre.ext — PROPÓSITO`, o `QUÉ ES:` / `PARA QUÉ SIRVE:`),
y el «ejecutado» **solo** se concede cuando quien llama afirma haber visto la
salida de una ejecución. Si la cabecera no declara propósito, se dice que no lo
declara — con la misma naturalidad que se dice un dato bueno.

Tiene un detalle del que no estoy poco satisfecho: **el módulo se audita a sí
mismo**. Si la cabecera de un fichero dice «VERIFICADA Y FUNCIONANDO» y no hay
ejecución detrás, la explicación devuelve el aviso de vocabulario correspondiente.
Un fichero de prueba con esa cabecera es una de las 75 comprobaciones.

### 10.3 La facultad de hablar sin que pregunten

`src/engine/autoRespuesta.ts`. «Que hable sin que le pregunten» es fácil de
escribir mal: basta con que suelte todo cada vez. Eso no es autonomía, es ruido, y
termina con el panel cerrado. Por eso la facultad tiene **cuatro reglas
declaradas** en `REGLAS_VOZ` y **vigiladas por la suite**:

| | Regla | Por qué |
|---|---|---|
| **R1** | No se inventa nada: sin hechos, avisos ni sugerencias, no hay mensaje | El silencio es una respuesta, y es la más frecuente |
| **R2** | Una `clave` se dice UNA vez (`yaDichos`) | Sin esto, «proactivo» significa «pesado» |
| **R3** | La certeza viaja **en el texto**, no al pie | Un mensaje espontáneo que suena seguro sin serlo miente en la primera línea, y nadie lee la segunda |
| **R4** | Presupuesto de atención (3) y, con una operación en curso, **solo avisos** | Una sugerencia buena en medio de una escritura es una interrupción |

Es determinista (la suite comprueba que el módulo no usa reloj ni azar: mismas
entradas, mismos mensajes, mismo orden), traza de dónde salió cada mensaje
(`trazarMensajes`), y **llega a la pantalla**: el panel del Quirófano muestra
`voz` y `explicaciones` en `/api/quirofano/estado`.

**De dónde saca lo que dice (y esto es lo que lo hace útil en vez de decorativo):**
de lo que el Quirófano **ya sabe** — avisos anotados al cerrar una tanda, resultado
de la última tanda (con su revertido o su verde), y si hay una tanda abierta sin
cerrar. Y el «ejecutado» lo concede **solo** cuando las puertas cerraron en verde
(`cerroEnVerde`): si una tanda se revirtió, el hecho se cuenta como
«sin verificar», no como éxito.

### 10.4 La frase, aplicada a lo que se ha escrito hoy

Cumpliendo el propio encargo, cada artefacto nuevo de esta vuelta con su frase,
qué es, para qué sirve y su estado real:

- `src/engine/certeza.ts` — los tres niveles de certeza y las dos operaciones que
  se hacen con ellos: **qué es** un tipo con dos funciones, **para qué sirve**
  para que la honestidad no dependa de la memoria de quien escribe. **Estado:
  ejecutado** (sus aserciones corren dentro de `tests/voz.test.ts`).
- `src/engine/vocabulario.ts` — el catálogo de palabras que afirman y el revisor
  que las caza: **qué es** un léxico ejecutable, **para qué sirve** para que
  «funciona» no se escriba sin haberlo ejecutado. **Estado: ejecutado.**
- `src/engine/explicacionArtefacto.ts` — la frase única por artefacto: **qué es**
  un extractor determinista de propósito y certeza, **para qué sirve** para no
  tener que preguntar qué es cada cosa. **Estado: ejecutado.**
- `src/engine/autoRespuesta.ts` — la facultad de hablar sin que pregunten: **qué
  es** un motor determinista de mensajes con cuatro reglas, **para qué sirve**
  para que lo que el motor ya sabe no se quede esperando la pregunta adecuada.
  **Estado: ejecutado** (75 comprobaciones, incluidas la de que no se repite y la
  de que no se inventa).
- `tests/voz.test.ts` — la suite que los vigila: **qué es** la prueba de los
  cuatro módulos, **para qué sirve** para que esto no se degrade a promesa.
  **Estado: ejecutado** (75 correctas · 0 fallidas, dentro de la puerta).
- `server.ts` (enganche) — **qué es** dos superficies nuevas (`/api/quirofano/estado`
  ampliado y `POST /api/artefacto/explicar`), **para qué sirve** para que la
  facultad y las explicaciones lleguen a la pantalla, **estado: ejecutado**
  (arranca y sirve `V1.8.0`; las dos superficies las verifica la suite sobre el
  código, no por petición HTTP real).

### 10.5 Lo que NO está hecho de esto (dicho, no disfrazado)

- **La certeza no cubre todavía el texto del modelo.** Está aplicada a lo que el
  MOTOR dice de sí mismo (explicaciones, voz, informes). Que un modelo no pueda
  afirmar sin evidencia exige pasar su salida por el revisor, y ese es el sitio
  natural de la **Fase 3** (pipeline del chat), no de esta vuelta.
- **No he probado el panel en el navegador.** La suite verifica que el panel
  recibe y pinta `voz` y `explicaciones`; que se vea bien es tu ojo.
- **Las 21 acciones del Consejo siguen sin ejecutor** (Fase 4, en curso).
- Sigue pendiente **F2** (partir `server.ts`): esta vuelta le ha **añadido** un
  endpoint más, lo cual engorda el monolito. Se dice porque es verdad y porque es
  el argumento que hace urgente F2.

### 10.6 Cómo comprobarlo tú mismo en dos comandos

```bash
cd ide/backend
npx tsx tests/voz.test.ts     # 75 correctas · 0 fallidas
npm run validar               # 3548 · 0 fallos · 65 suites
```

------------------------------------------------------------------------

## 11. v1.9.0 — «ESTABILIDAD»: NADA SE PIERDE EN SILENCIO

Encargo: continuar con lo que no estaba hecho, y el siguiente paso con **más
estabilidad**. Se atacaron las dos deudas que el plan marcaba como ALTA y MEDIA, y
no por ser fáciles sino porque son las dos que hacían perder trabajo o memoria de
forma invisible.

Puerta sobre este estado: **3590 comprobaciones · 0 fallos · 66 suites · 0 sin
correr** (antes 3548/65: **+42**, todas de la suite nueva de persistencia, y 0
regresiones). Manifiesto **482/482**. Humo real: `:3000` sirve `CerebróNico
V1.9.0` y el puente responde `shell: false`. Versión única **1.9.0**.

### 11.1 La pérdida silenciosa del workspace (deuda ALTA) — CERRADA

**La causa raíz, exacta:** `saveJSON` y `saveString` devolvían `void`. Cuando el
valor pasaba de 5 MB —o la cuota estaba llena— escribían un `console.warn` y
**devolvían nada**. Quien llamaba no podía saber que el trabajo del usuario
acababa de perderse, así que el IDE seguía como si hubiera guardado: el usuario
cerraba, volvía y el workspace estaba en su versión anterior. El peor tipo de
fallo, porque no se nota en el momento.

**Lo que cambió (`src/utils/storage.ts`):**

1. **Devuelve el resultado.** `saveJSON`/`saveString` devuelven
   `ResultadoGuardado` con `ok`, `motivo`, `bytes` y `limite`. Quien lo ignoraba
   sigue compilando; quien quiera mirarlo, ahora puede.
2. **Rescata antes de rendirse.** Si no cabe en localStorage, el valor se guarda
   en el **almacén grande** (IndexedDB, almacén nuevo `grandes`) y en localStorage
   queda un puntero mínimo. El dato no se pierde: **cambia de sitio**.
3. **Avisa.** `alFallarGuardado(fn)` es el canal que antes no existía: la interfaz
   se entera, y App lo escribe en el registro visible con clave, tamaño y motivo.
4. **Recupera.** `restaurarDeAlmacenGrande([...])` devuelve al arranque lo que se
   fue al almacén grande. Sin este paso, el rescate sería *otro sitio donde
   perderse*: por eso el efecto de arranque de App es parte del arreglo, no un
   adorno.

Una decisión de honestidad que conviene señalar: el retorno **no dice** que el
rescate haya ocurrido —eso todavía no se sabe—, dice que el valor se ha *enviado*,
y el desenlace real lo lleva el aviso. Es la misma disciplina de certeza de la
v1.8.0 aplicada a este módulo: no se afirma un resultado antes de tenerlo.

### 11.2 La prueba no lee el código: lo ejecuta

`tests/persistencia.test.ts` (42 comprobaciones) monta un **localStorage falso** y
un **IndexedDB falso mínimo** y llama a las funciones reales:

| Escenario | Qué se exige |
|---|---|
| Guardado normal | `ok:true`, con bytes, y se puede leer |
| JSON corrupto | se purga y devuelve el fallback (no congela el render) |
| **5 MB + 1 KB** | no se declara guardado aquí; **se avisa**; hay puntero; **el dato ESTÁ en el almacén grande**; y **se recupera al arrancar** |
| Vuelve a caber | el puntero se retira, sin dejar rastros |
| Cuota llena | el motivo es «cuota», y el aviso dice el desenlace real |
| Sin almacén grande | **el fallo se cuenta** (antes: `console.warn` y a seguir) |

**Límite declarado:** esos dobles **no son un navegador**. El IndexedDB falso no
valida versiones ni cuotas reales. Está escrito en la cabecera de la suite para que
nadie confunda «pasa la suite» con «probado en Chrome».

### 11.3 La deuda D9 (endpoint huérfano) — CERRADA

`/api/brain/lesson` existía desde hacía versiones y **no lo llamaba nadie**. La
promesa de D9 («las lecciones que se escriben») estaba escrita y el endpoint hecho,
pero las lecciones vivían **solo en `localStorage`**: al limpiar los datos del
navegador, el motor olvidaba todo lo aprendido y volvía a tropezar con lo mismo.

Ahora `learnLesson` manda la lección al cerebro —con su tipo, para no perder el
contexto— y el endpoint lleva **guard**, porque escribe en la memoria. Sin `await`:
aprender una lección no puede bloquear ni fallar el turno del usuario, y si el
cerebro no está, la copia local sigue siendo la fuente de trabajo.

### 11.4 Los ficheros de esta vuelta, con su frase

- `src/utils/storage.ts` — qué es: la capa de guardado local con resultado, rescate
  y aviso. Para qué sirve: para que «no se guardó» deje de ser un secreto de la
  consola. **Estado: ejecutado** (42 comprobaciones contra la capa real).
- `src/utils/indexedDBStorage.ts` (ampliado) — qué es: el almacén grande (IndexedDB,
  versión 2). Para qué sirve: para que lo que no cabe arriba no se pierda. **Estado:
  ejecutado** (guardar, leer, borrar y listar, contra el doble de IndexedDB).
- `tests/persistencia.test.ts` — qué es: la prueba de los dos anteriores. Para qué
  sirve: para que este arreglo no se deshaga solo. **Estado: ejecutado** (42/42).
- `src/App.tsx` (enganche) — qué es: el efecto de recuperación al arrancar y la
  suscripción a los fallos. Para qué sirve: para que el rescate llegue a la pantalla
  y el fallo se vea. **Estado: ejecutado** en la parte de datos (la suite comprueba
  que recupera y que avisa); **solo leído** en la parte visual (no he abierto un
  navegador).
- `src/utils/selfImprovement.ts` + `server.ts` (lecciones) — qué es: el envío de la
  lección al cerebro y su guard. Para qué sirve: para que el aprendizaje sobreviva.
  **Estado: ejecutado** en cuanto a lo comprobable (el código y el guard); **no
  ejecutado** end-to-end (requiere el servidor en marcha y aprender una lección).

### 11.5 Lo que sigue sin estar hecho

| Fase | Estado | Nota |
|---|---|---|
| **F4** · Cerebro ejecutor | en curso | 2/23 con ejecutor real; 21 declaradas con motivo |
| **F2** · Partir `server.ts` | pendiente | **No crece más en esta vuelta** (se añadió guard, no ruta). Sigue siendo la deuda ALTA |
| **F3** · Motor del chat | pendiente | Ahí va la certeza sobre el texto del modelo |
| **F5**, **F6**, **F7** | pendientes | Interfaz/datos, git nativo, visión |

Y los límites de siempre, que no cambian: **no he probado el navegador** ni
**Windows** (este entorno es Linux), y **no hice pentest** contra el puente.

------------------------------------------------------------------------

## 12. v1.10.0 — FASE 2, PRIMER PASO: EL CONTRATO DE LAS 127 RUTAS

Encargo: continuar por el contrato de las 126 rutas «y más». Las rutas reales
resultaron ser **127** (la 127ª la añadió la v1.8.0 con `/api/artefacto/explicar`);
el número del plan era correcto cuando se escribió.

Puerta sobre este estado: **3627 comprobaciones · 0 fallos · 67 suites · 0 sin
correr** (antes 3590/66: **+37**, todas del contrato, y 0 regresiones). Manifiesto
**487/487**. Humo real: `:3000` sirve `CerebróNico V1.10.0` y el puente responde
`shell: false`. Versión única **1.10.0**.

### 12.1 Qué se ha hecho y por qué era el paso correcto

El plan dice que el primer entregable de la Fase 2 **no es código**: es el contrato.
Partir 11.661 líneas moviendo bloques de cientos sin una referencia es un acto de
fe — y la fe es lo contrario de lo que hace este proyecto. Ahora hay tres piezas:

- **`contrato-rutas.json`** — las 127 rutas congeladas, **generadas desde el
  código**: método, ruta, línea, dominio y si tienen guard. Un contrato escrito a
  mano se puede editar para tapar la pérdida que debería detectar; generado, la
  única forma de cambiarlo es cambiar el código.
- **`SUPERFICIE_RUTAS.md`** — el **orden de trabajo**: 39 dominios con rutas,
  métodos y líneas. Empieza por los de lectura (riesgo bajo) y deja `ai` y
  `sandbox` para el final, que es donde el monolito está más enredado.
- **`tests/superficieRutas.test.ts`** (37 comprobaciones) — los tres candados, más
  dos lectores independientes que tienen que coincidir.

### 12.2 Los tres candados

| Candado | Qué vigila | Por qué |
|---|---|---|
| **Ruta perdida** | en el contrato y ya no en el código → ROJO | Es el fallo que esta pieza existe para cazar |
| **Guard perdido** | una ruta con puerta que ya no la tiene → ROJO | Sería aflojar la seguridad (Fase 1) sin decirlo |
| **Presupuesto de líneas** | `server.ts` > 11.661 líneas → ROJO | Trinquete: la Fase 2 es **partir**, no añadir |

El trinquete merece una frase: si algún día hay que añadir una ruta, habrá que
**subir el presupuesto a propósito** — y eso se ve en el diff. La decisión queda
escrita en vez de colarse. Y las rutas **nuevas** no son rojo (añadir es legítimo),
pero se **avisan**: lo que no se permite es añadir y no enterarse.

### 12.3 Dos fallos de mi propio medidor, y el tercero que evité antes de tenerlo

Lo cuento porque es lo que hace fiable el número:

1. **El contrato decía 29 rutas con guard cuando hay 27.** El cuerpo del manejador
   se delimitaba con una ventana de 700 caracteres, así que una ruta corta **sin**
   guard heredaba el guard de su vecina. Un medidor que se equivoca **al alza** es
   peor que no tenerlo: da tranquilidad sin motivo y, en este caso, habría tapado
   justo lo que hay que vigilar. Corregido: el cuerpo se acota con la **ruta
   siguiente**, y la suite exige que las dos cifras **cuadren** (contrato = código).
2. **`GET '*'` no empieza por «/».** Es la ruta comodín del SPA (sirve el
   `index.html` para cualquier dirección) y es legítima. La comprobación estaba
   mal, no el contrato: ahora acepta el comodín y lo identifica como tal.
3. **El fallo que evité antes de tenerlo:** mi primera versión de la suite
   comprobaba el generador **ejecutándolo**, y ejecutarlo **escribe** el contrato
   con un presupuesto de líneas recalculado. Es decir: la propia comprobación podía
   **tapar el trinquete** — bastaba con crecer y correr la suite una vez. Añadí el
   modo **`--seco`** (calcula y dice qué saldría, sin escribir) y la suite comprueba
   además que el fichero **no ha cambiado** tras pasar por ahí.

### 12.4 Los ficheros de esta vuelta, con su frase

- `scripts/superficie.mjs` — qué es: el generador y verificador del contrato, con
  modo seco. Para qué sirve: para poder mover el monolito sin perder rutas.
  **Estado: ejecutado** (modo normal, modo seco y modo verificar, los tres por la suite).
- `contrato-rutas.json` — qué es: las 127 rutas congeladas, generadas. Para qué
  sirve: para que ninguna desaparezca sin que se note. **Estado: ejecutado**
  (verificado contra dos lectores independientes).
- `SUPERFICIE_RUTAS.md` — qué es: el orden de trabajo por dominios. Para qué sirve:
  para que la extracción de la Fase 2 se haga por partes y en orden de riesgo.
  **Estado: ejecutado** (la suite comprueba que lista los 39 dominios y que no se
  edita a mano).
- `tests/superficieRutas.test.ts` — qué es: la suite del contrato. Para qué sirve:
  para que esto no se degrade. **Estado: ejecutado** (37/37).

### 12.5 Lo que queda de la Fase 2 (y sigue siendo lo grande)

El contrato está hecho; **la extracción no se ha empezado**, y eso es deliberado:
partir el monolito son 2-3 semanas de mover 127 rutas a `server/routers/<dominio>.ts`
sin cambiar comportamiento, con la puerta abierta en cada paso. Empezarlo a medias
—medio servidor migrado— es peor que no empezarlo, y ya se dijo en el plan.

Lo que **sí** se puede afirmar ahora: cuando la extracción empiece, el que la haga
tendrá (a) la lista exacta de lo que hay que preservar, (b) el orden de trabajo por
riesgo y (c) un guardián que se pone rojo en cuanto una ruta o un guard se pierda.
Eso es exactamente lo que faltaba hace una hora.

Y lo demás sigue igual, sin adornos: **F3** (la certeza sobre el texto del modelo),
**F4** (21 de 23 acciones del Consejo sin ejecutor), **F5**, **F6** y **F7**
pendientes. Nada de eso se ha tocado en esta vuelta.

------------------------------------------------------------------------

## 13. v1.11.0 — FASE 2, SEGUNDO PASO: LA PRIMERA EXTRACCIÓN

El contrato ya estaba; ahora empieza el trabajo que el contrato existe para
proteger. **El monolito ha empezado a adelgazar.**

Puerta sobre este estado: **3639 comprobaciones · 0 fallos · 67 suites · 0 sin
correr** (antes 3627/67: **+12** en la suite del contrato, 0 regresiones).
Manifiesto **489/489**. Contrato: **127 rutas · 3 extraídas · 124 en el monolito ·
CONTRATO INTACTO**. Versión única **1.11.0**.

### 13.1 Qué se movió y por qué esas tres

A `server/routers/diagnostico.ts` (nuevo): `/api/health/deep`,
`/api/ollama/perf` y `/api/ollama/models`. **`server.ts`: 11.661 → 11.518 líneas
(−143).**

La elección fue por **riesgo**, no por tamaño:

| Criterio | Las tres elegidas | Las que se dejaron fuera |
|---|---|---|
| Método | GET (no escriben nada) | `/api/telemetry/refresh` (POST) |
| Estado mutable | ninguna lo toca | `/api/telemetry/ports` y `/api/system/stats` usan `telemetryCache`, `sandboxProc`, `lastCpuTime` |
| Dependencias | funciones puras y valores de arranque | estado compartido del servidor |

Las que dependen de estado **no se traen aquí a propósito**: su sitio es la
extracción del estado (`server/estado/`). Meterlas ahora sería mover el problema,
no el código.

### 13.2 Los cuerpos se movieron tal cual, y una sola fuente de verdad

Los tres manejadores están copiados **verbatim**: ni una línea de lógica
reescrita (el síntoma de que se ha movido algo con la excusa de moverlo es que
«de paso» cambia el comportamiento). Lo único que cambia es **de dónde salen tres
valores** —la URL de Ollama, la RAM y los núcleos—, que ahora se pasan como
dependencias: si se recalcularan dentro del módulo habría **dos fuentes de verdad**
sobre la misma máquina, y el primer día que una cambiara tendríamos un diagnóstico
que miente sobre el servidor al que diagnostica.

### 13.3 El contrato falló al primer movimiento, y tenía que fallar

Al mover las rutas, `superficie:verificar` dio las tres por **PERDIDAS**. Tenía
razón desde su punto de vista y estaba equivocado desde el del proyecto: una ruta
extraída **no se ha perdido, se ha mudado**. Un contrato que solo mira el monolito
convierte cada paso de la Fase 2 en un falso rojo — y un guardián que grita en
falso se acaba ignorando, que es como se pierde la costumbre de mirarlo.

Corregido: el extractor mira ahora **el monolito y los módulos**, informa las
**MOVIDAS** (con origen y destino) y publica el **progreso** de la fase. De paso
el contrato ha dejado de ser solo un candado y es también el **marcador de
progreso**: `3 extraídas · 124 aún en el monolito`.

### 13.4 Comprobado contra el servidor en marcha

Que compile no es que funcione. Con el servidor levantado:

| Petición real | Respuesta |
|---|---|
| `GET /` | `200` · `<title>CerebróNico V1.11.0</title>` |
| `GET /api/ollama/perf?model=llama3.2:3b` | perfil completo (`tier tiny`, `paramsB 3`, `num_ctx 4096`…) — **desde el módulo nuevo** |
| `GET /api/health/deep` | sus 5 comprobaciones con sus remedios (`Ollama :11434`, `Sandbox :3500`…) |
| `GET /api/ollama/models` | `{"models":[],"error":"fetch failed"}` (no hay Ollama aquí: comportamiento correcto, no un fallo del traslado) |

### 13.5 Los ficheros de esta vuelta, con su frase

- `server/routers/diagnostico.ts` — qué es: el primer módulo de rutas extraído del
  monolito, con las 3 rutas de diagnóstico. Para qué sirve: para empezar a partir
  `server.ts` sin cambiar comportamiento. **Estado: ejecutado** (responde en
  marcha y la suite lo vigila: 49 comprobaciones).
- `scripts/superficie.mjs` (corregido) — qué es: el generador/verificador del
  contrato, ahora con visión sobre todo `server/`. Para qué sirve: para que una
  mudanza no parezca una pérdida y el progreso esté a la vista. **Estado: ejecutado.**
- `contrato-rutas.json` (regenerado) — qué es: las 127 rutas con su fichero, más
  el progreso de la fase. **Estado: ejecutado** (presupuesto del trinquete
  ajustado a 11.518: el listón ha bajado con el trabajo).
- `tests/superficieRutas.test.ts` (ampliada) — qué es: el contrato y la primera
  extracción vigilados. **Estado: ejecutado** (49/49).

### 13.6 Lo que queda, sin adornos

**124 rutas** siguen en el monolito. El siguiente movimiento natural son los
dominios pequeños de lectura (`system`, `verifier`, `zai`), y después la
extracción del **estado** (`server/estado/`), que es la puerta para poder mover
`telemetry`, `sandbox` y todo lo que hoy comparte variables globales. Ese paso —el
estado— es el que de verdad decide si la Fase 2 sale bien; las rutas de lectura son
el calentamiento.

Y lo demás sigue igual: **F3** (la certeza sobre el texto del modelo), **F4** (21
de 23 acciones del Consejo sin ejecutor), **F5**, **F6** y **F7** pendientes.

------------------------------------------------------------------------

## 14. v1.12.0 — FASE 2, EL PASO QUE DECIDE: EL ESTADO SALE DEL MONOLITO

En la vuelta anterior dije cuál era el paso que de verdad decide la Fase 2: «el
riesgo real no es mover 124 rutas, es el **estado compartido**». Esto es eso.

Puerta sobre este estado: **3670 comprobaciones · 0 fallos · 68 suites · 0 sin
correr** (antes 3639/67: **+31** de la suite de estado y +12 de la del contrato, 0
regresiones). Manifiesto **494/494**. Contrato: **127 rutas · 6 extraídas · 121 en
el monolito · CONTRATO INTACTO**. Versión única **1.12.0**.

### 14.1 Mover código no es mover estado

Mover una ruta es mover texto. Mover estado es cambiar **quién manda** sobre él. Una
variable global suelta no dice nada: no se sabe quién la escribe, ni cuándo, ni qué
contratos hay detrás. Se han extraído las dos primeras, con API de tres funciones:

| Módulo | Qué guarda | API |
|---|---|---|
| `server/estado/telemetria.ts` | la caché de telemetría (última comprobación de puertos + modelos) | `muestraVigente` · `guardarMuestra` · `invalidarMuestra` |
| `server/estado/proceso.ts` | la última medición de CPU del proceso | `porcentajeCpu` · `reiniciarMuestraProceso` |

Y con ellas, **3 rutas más** fuera del monolito:
`server/routers/telemetria.ts` (`/api/telemetry/ports`, `/api/telemetry/refresh`,
`/api/system/stats`). **`server.ts`: 11.518 → 11.413 líneas.**

### 14.2 La decisión técnica que hace que esto valga la pena

**El tiempo entra por parámetro:** `muestraVigente(ahora)` en lugar de leer el reloj
por dentro. Suena a purismo y no lo es — es lo que convierte la caducidad de 10
segundos en algo **probable**: la suite fija el instante y comprueba que a los 9 s
sigue vigente y a los 10 s justos ha caducado, todo en milisegundos de ejecución.
Un módulo que lee el reloj por dentro solo se puede probar durmiendo, y las pruebas
que duermen son las primeras que se quitan cuando van lentas.

**Y el módulo pregunta, no coge:** al sandbox no se le alcanza `sandboxProc`. En
`DepsTelemetria` se declara exactamente qué necesita saber de él —«¿está vivo?»,
«¿cuál es su PID?»—. Eso convierte este fichero en la **especificación escrita de la
próxima extracción**: quien mueva el estado del sandbox ya sabe qué API tiene que
ofrecer. Un módulo que pregunta es mejor que uno que coge.

### 14.3 Tres cosas que el trabajo destapó (y por qué se cuentan)

1. **Un consumidor oculto:** `/api/bridge/restart` invalidaba la caché **escribiendo
   la variable** (`telemetryCache = null`). Ahora lo pide por la API del estado. Si
   no se hubiera buscado, la caché habría dejado de invalidarse en silencio al
   reiniciar el puente — y el síntoma habría sido «el indicador dice :5000 caído
   durante diez segundos después de reiniciarlo», que nadie habría relacionado con
   este cambio.
2. **El compilador tenía razón:** el registro del módulo se hacía antes de declarar
   `SANDBOX_PORT`, y eso es usar una `const` antes de declararla (TDZ). Se movió la
   llamada junto a las declaraciones del sandbox, con el porqué escrito al lado.
3. **Otra vez mis comprobaciones leían comentarios:** dos checks fallaron porque el
   módulo *explica en prosa* que no toca `sandboxProc` y *menciona* `Date.now()` al
   justificar que el tiempo se inyecta. Mismo patrón que ya me pasó con el puente y
   con el manifiesto: **las comprobaciones miran código, no comentarios** — en los
   dos sentidos (no valen los que explican, ni esconden los que comentan código malo).

### 14.4 Comprobado contra el servidor en marcha (la caché se comporta)

| Petición real | Resultado |
|---|---|
| `GET /` | `200` · `<title>CerebróNico V1.12.0</title>` |
| `GET /api/system/stats` | `ide.rssMb 176 · cpuPercent 0 (primera muestra, como está documentado) · sandbox {running:false, pid:null} · machine {cores:2, freeRamMb:2374}` — la ruta movida, con el sandbox **preguntado** |
| `GET /api/telemetry/ports` (1ª) | sondea · `lastChecked: 1790251017595` |
| `GET /api/telemetry/ports` (2ª, 1 s después) | **misma marca** → servida de la caché |
| `POST /api/telemetry/refresh` + 3ª consulta | **marca nueva** → la invalidación funciona |

Esa columna es la diferencia entre «el módulo compila» y «el estado se comporta».

### 14.5 Los ficheros de esta vuelta, con su frase

- `server/estado/telemetria.ts` — qué es: la primera pieza de estado extraída, con
  API de tres funciones. Para qué sirve: para que las rutas de estado no necesiten
  vivir en el monolito. **Estado: ejecutado** (caducidad probada con tiempo inyectado).
- `server/estado/proceso.ts` — qué es: la memoria de la última medición de CPU. Para
  qué sirve: para poder mover `/api/system/stats` sin llevarse una variable dentro.
  **Estado: ejecutado.**
- `server/routers/telemetria.ts` — qué es: las 3 rutas de telemetría y recursos. Para
  qué sirve: para sacarlas del monolito preguntando por el sandbox en vez de
  alcanzarlo. **Estado: ejecutado** (responde en marcha; la caché se comporta).
- `tests/estado.test.ts` — qué es: la suite del estado. Para qué sirve: para que la
  caducidad y el cálculo se prueben sin dormir. **Estado: ejecutado** (31/31).

### 14.6 Lo que queda

**121 rutas** siguen en el monolito (11.413 líneas). Las variables globales que
quedan —`sandboxProc`, los espejos, el conocimiento— ya tienen **receta probada**:
API de funciones, tiempo inyectado y dependencias declaradas en vez de alcanzadas.
El siguiente movimiento natural es el **estado del sandbox** (que ya está
especificado por lo que `telemetria.ts` le pide), y con él `sandbox`, `exec` y todo
lo que hoy comparte esa variable.

Y lo demás sigue igual: **F3** (la certeza sobre el texto del modelo), **F4** (21 de
23 acciones del Consejo sin ejecutor), **F5**, **F6** y **F7** pendientes.

------------------------------------------------------------------------

## 15. v1.13.0 — ESTADO DEL SANDBOX + LAS DOS VENTANAS QUE REPORTaste

Tres cosas en esta vuelta: la fase que tocaba (el estado del sandbox) y los dos
avisos que mandaste con captura (la ventana de la voz y el sandbox en rojo al
arrancar).

Puerta sobre este estado: **3724 comprobaciones · 0 fallos · 69 suites · 0 sin
correr** (antes 3670/68). Manifiesto **498/498**. Contrato: **127 rutas · 6
extraídas · 121 en el monolito**. Versión única **1.13.0**.

### 15.1 El estado del sandbox sale del monolito (Fase 2)

`server/estado/sandbox.ts` (nuevo): el proceso del sandbox —si está vivo, su PID, y
cómo se le mata— con API de funciones. Era el **último bloque grande de estado
compartido**: 35 sitios del monolito tocaban la variable directamente. Con él
extraído, lo que queda en `server.ts` son **rutas y funciones, no dueños de datos**.

**Y al ponerle tipos apareció un fallo latente de verdad:** `spawnSandbox()` no
siempre devuelve un proceso — en los caminos en los que falla al arrancar responde al
cliente y **devuelve una `Response` HTTP**. El monolito hacía
`sandboxProc = spawnSandbox()` con la variable tipada como `any`, así que en esos
casos guardaba **una respuesta HTTP como si fuera «el proceso»**. No se notaba
porque después solo se le preguntaba por `.pid` (que era `undefined`, o sea «no
vivo») y `.kill()` lanzaba, capturado y en silencio. Ahora solo se registra lo que
parece un proceso, y el compilador lo dijo en tres sitios.

También se corrigió, de camino, una lectura doble del PID en el apagado: se leía en
tres llamadas distintas, así que si el proceso moría entre la comprobación y el
`taskkill` se podía matar a otro con un PID reciclado. Ahora se lee **una vez**.

### 15.2 La ventana de la voz (lo que mandaste en la captura)

**El problema, exactamente:** al agotarse la cuota de Gemini, el SDK lanza un error
cuyo `message` es **el JSON entero de Google** —código 429, enlaces, cuotas,
`retryDelay`—, el servidor lo metía en `motivo` y la interfaz lo pintaba en el banner:
un cartel de ~1.000 caracteres sobre la conversación que decía «no hay voz» con la
parte útil (que se usa la voz del navegador) al final.

**Lo que hay ahora** (`server/ttsErrores.ts` + `src/utils/voz.ts`):

| | Antes | Ahora |
|---|---|---|
| Al usuario | ~1.000 caracteres de JSON | **una frase**: «Voz Gemini «Gacrux» no disponible: se agotó la cuota de la API de Gemini — se usa la voz del navegador.» |
| El volcado técnico | en el banner | **al registro** (`detalle`, recortado) |
| Intentos | 3 siempre, ~480 ms de espera | **1 intento** si es cuota o clave: insistir no arregla nada |
| Repetición | el cartel volvía en cada mensaje | espera de **5 minutos** y se va directo a la voz del navegador, con el aviso una sola vez |

Comprobado en marcha con una clave inválida: la respuesta trae `clase: "clave"` y un
motivo de **67 caracteres** (antes ~1.000), con el JSON en `detalle` para el registro.

### 15.3 El sandbox en rojo al arrancar (lo que mandaste en la captura)

**El problema:** la comprobación de salud se ejecuta al empezar, y el proceso del
sandbox se levanta **la primera vez que hace falta** (al abrir el preview). Así que en
el arranque salía SIEMPRE un `✗ Sandbox :3500 — fetch failed` con el consejo «El
preview y el editor web no se verán. Pulsa Sync o reinicia el sandbox»… para un
servicio que todavía no tenía por qué existir. Por eso «al comienzo nunca muestra bien
el sandbox»: no era un fallo del sandbox, era un falso positivo del guardián.

Ahora hay **tres desenlaces**, y cada uno dice la verdad:

| Situación | Antes | Ahora |
|---|---|---|
| Responde | OK | OK |
| No responde y **no hay proceso** | ✗ «fetch failed» + alarma | **✓ «aún no arrancado (se levanta al abrir el preview)»** |
| No responde y **sí hay proceso** | ✗ (consejo genérico) | **✗ «Está arrancado pero no contesta: pulsa Sync»** |

La tercera fila es la que importa para no volverse ciego: **el aviso no se ha
desactivado, se ha afinado**. Comprobado en marcha: sin sandbox en marcha, el
resultado es `4/5 → 5/5` con «aún no arrancado»; y Ollama, que aquí no existe, sigue
saliendo en rojo como debe.

> Un aviso que aparece siempre es un aviso que se aprende a ignorar. El día que el
> sandbox falle de verdad, el cartel tiene que significar algo.

### 15.4 Los ficheros de esta vuelta, con su frase

- `server/estado/sandbox.ts` — qué es: el proceso del sandbox con API de funciones y
  la comprobación anti-zombie. Para qué sirve: para que las rutas del sandbox puedan
  salir del monolito. **Estado: ejecutado** (probado con un proceso de mentira:
  registrar, preguntar, olvidar por identidad y no registrar una `Response`).
- `server/ttsErrores.ts` — qué es: el traductor del error de voz a una frase. Para
  qué sirve: para que un 429 no pinte el JSON de Google en la pantalla. **Estado:
  ejecutado** (con el JSON real del 429 que provocó el problema, dentro de la suite).
- `src/utils/voz.ts` (ampliado) — qué es: el recorte del motivo y la frase del aviso.
  **Estado: ejecutado** — con la comprobación que resume el arreglo: con el JSON crudo
  como motivo, el aviso sigue por debajo de 260 caracteres.
- `server/routers/diagnostico.ts` (corregido) — qué es: la salud profunda, con el
  sandbox distinguido en tres desenlaces. **Estado: ejecutado** (en marcha).
- `tests/ttsErrores.test.ts` — qué es: la suite del arreglo de voz (35). **Estado:
  ejecutado.**
- `tests/estado.test.ts` (ampliada a 50) — qué es: el estado, ahora con el sandbox.
  **Estado: ejecutado.**

### 15.5 Lo que sigue

**121 rutas** en el monolito, y ahora sí sin dueños de datos dentro: los dos bloques
de estado que ataban las rutas (telemetría/CPU y sandbox) están fuera. La próxima
tanda es mecánica: mover los dominios del sandbox y del chat sabiendo que el estado
ya tiene dueño.

Y lo demás igual: **F3** (la certeza sobre el texto del modelo), **F4** (21 de 23
acciones del Consejo sin ejecutor), **F5**, **F6** y **F7**.

**Límites que no cambian:** no he probado el navegador (los avisos los verifica la
suite y la respuesta del servidor, no mi ojo), no he ejecutado Windows, y la cuota de
Gemini agotada se probó por la vía de la clave inválida —que recorre el mismo
clasificador— porque aquí no hay una clave con cuota real.
