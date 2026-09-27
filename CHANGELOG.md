# CerebroNico IDE — Modo Agente PC (build 3.0)

> **Autor y propietario de todas las credenciales e integraciones:** Mario Nicolas Quintero
> **Copyright © 2026 Mario Nicolas Quintero.** Todos los derechos reservados.

## v1.6.23 — El sandbox ya no se come a CerebroNico

Cerró el incidente «:3500 muestra otra app / La IDE no pudo compilarse dentro
del sandbox»: `PROJECT_DIR` apuntaba a la carpeta de instalación, el resolutor
encontró `ide\backend` (la IDE viva) como «proyecto del piloto», y el
nuclear-wipe del «Borrar todo» se llevaba además el cerebro del motor. Siete
guardas, todas con causa explícita en el log (cero fallos mudos):

1. **GUARDA-RAÍZ v1** (`raizDatos.ts` + `server.ts`): una raíz de datos que
   contenga a la app se RECHAZA al arrancar y cae al default con `⛔` en
   consola. La IDE no puede ser su propio sandbox por configuración.
2. **GUARDA-B** (`projectPorter.ts`): el resolutor de raíz jamas devuelve la
   app en ejecución ni una ancestora suya como candidato. Una copia DISTINTA
   de la IDE sigue siendo proyecto explícito (guarda de recursión de
   `/api/sandbox/start`); lo prohibido es encontrarla por accidente.
3. **GUARDA-ZOMBIE v1** (`/api/sandbox/start`): «puerto arriba» ya no es
   «nuestro servidor». Si :3500 lo tiene un proceso que no arrancó esta
   sesión, se mata (puerto exacto, nunca PID propio) y se arranca el proyecto
   actual — se acabó el «saliendo por el 3500» mostrando la app de ayer.
4. **RESCATE v1** (`estadoRescate.ts` + `/api/fs/nuclear-wipe`): antes de
   nuklear, `CARPETAS_DE_ESTADO` (.cerebro-db, .cerebronico) + MEMORIA.md +
   skills.md se mudan a un snapshot no-pisante bajo `.cerebro-db/rescate/` y
   lo nuevo se fusiona al lugar permanente; si el rescate falla, el borrado se
   ABORTA con motivo. Después del wipe, **RESEMBRA**: espejos, conocimiento,
   bóveda y verifier vuelven al sandbox limpio y siguen funcionando.
5. **GUARDA-D** (`/api/sandbox/flatten-root`): raíz y anidado con nombres de
   paquete distintos son DOS proyectos: la raíz se respalda en
   `_respaldo-<iso>/` antes de fundir, con los dos nombres en el informe.
6. **GUARDA-E** (error PROPIO-IDE): el «no pudo compilarse» ahora trae la vía
   de salida en tres pasos en vez de morir en la traza de rollup.
7. **F1/F2** (asimetrías): el resolutor dejó de saltar carpetas por prefijo
   `.` (mismo defecto que la v8.0.5 corrigió en el aplanado) y flatten y
   búsqueda comparten la misma lista de artefactos (build, out, coverage,
   .next, .nuxt incluidos).

Nueva suite `tests/estadoRescate.test.ts` (35 comprobaciones: fusión sin-pisar,
veredicto abortar, re-sembrado sin históricos, GUARDA-D, guarda de raíz),
registrada en `scripts/validar.mjs`. `package.json` y `VERSION_SEMVER` subidos
a 1.6.23 (derivación única, `motor-datos` conforme). Plantilla base del
sandbox (`sandbox-app`: React 19 + Vite 6, mismas versiones que la IDE → la
vía rápida resuelve del `node_modules` de la app sin instalación larga).

## v1.6.22 — Modelos locales: la memoria ya no se recita

Arreglos centrados en el síntoma «el modelo local tarda y recita la
memoria/prompt en vez de contestar»:

1. **MEMORIA.md viajaba DOS veces por petición.** `hiddenFiles` ahora solo lleva
   `skills.md`; la memoria sigue llegando como `[REGLAS DEL USUARIO]` dentro del
   prompt de sistema, con su presupuesto por tramo. Se eliminó la copia entera
   (hasta 4.000 caracteres) por turno.
2. **Rótulo «ARCHIVO DE SISTEMA OCULTO» → «CONTEXTO DE TRABAJO».** Decirle a un
   modelo que algo está oculto es pedirle que lo muestre. El nuevo rótulo añade la
   orden de no transcribirlo, en el punto único por el que pasa el prompt de todos
   los proveedores (`server.ts` y `src/utils/engine.ts`).
3. **CPU real de la máquina.** El indicador de la barra medía el proceso Node de la
   IDE, no la máquina. Ahora se etiqueta «IDE» y se añade la CPU real de la máquina
   («PC») vía `os.cpus()` en `/api/system/stats`.
4. **`carga1` (loadavg) era ciego en Windows.** `os.loadavg()` devuelve `[0,0,0]`
   en Windows; se reemplazó por una medición real de CPU con `cpuPercentReal()`.
5. **Nueva suite de regresión** `tests/memoriaUnica.test.ts` (20 comprobaciones),
   registrada en `scripts/validar.mjs`.

## Evolución rápida (build 3.0) — "pocos créditos"

Dos mejoras de bajo costo (cero llamadas extra al LLM) para que el IDE
**haga de verdad** aunque tu modelo local sea pequeño o Ollama esté caída:

1. **Acciones rápidas deterministas.** Cuando el chat pide algo directo, el
   servidor lo ejecuta **inmediatamente** contra el agente 5000 **sin gastar
   una sola llamada al modelo**. Así funciona incluso con un modelo de 1.5b,
   o sin Ollama. Se detecta por palabras clave:
   - *"Crea un archivo X en mi escritorio con el texto '...'"* → `pc_write_file`
   - *"Lee el archivo X"* → `pc_read_file`
   - *"Lista los archivos de mi escritorio / Documentos"* → `pc_list_dir`
   - *"Ejecuta el comando `<cmd>`"* → `pc_exec`
   - *"Borra el archivo X"* → `pc_delete`
   (Acepta atajos `escritorio`, `documentos`, `descargas`; rutas absolutas;
   y el nombre/contenido entre comillas.)
2. **Log de acciones visibles.** En el chat aparece un panel
   **"Acciones ejecutadas (agente 5000)"** con cada herramienta que se usó
   (✓/✗), tanto en acciones rápidas como en el modo agente (tool-calling).

> Nota: con el modelo OFF o una frase que no sea una acción directa, el chat
> sigue pasando al LLM como antes. Las acciones rápidas **no** capturan
> conversaciones normales.

## Resuelto (build 2.0)

Antes, el chat del IDE solo **hablaba**: el modelo podía generar texto y
manipular archivos dentro del sandbox aislado `.proyectos`, pero **no podía
hacer nada real en tu PC** (crear un archivo en el Escritorio, ejecutar un
comando del sistema, listar carpetas, etc.). El "agente" en el puerto 5000
(`agent_bridge_5000.py`) existía pero el chat **nunca lo usaba**.

Ahora el chat está **conectado de verdad** al agente 5000 mediante un nuevo
**Modo Agente PC**. Cuando lo activas, el modelo recibe herramientas nuevas
(`pc_*`) y puede ejecutar acciones **reales y verificables** en tu máquina
a través del puente Python.

## Cómo usarlo

1. Arranca el IDE: `npm run dev` (levanta UI :3000 y el puente :5000).
2. En la barra superior del chat verás el botón **`Agente PC OFF/ON`** (o en
   la pestaña **Puertos → Subagentes → Modo Agente PC**).
3. Actívalo (se vuelve verde **ON**). Requiere un **modelo local con
   tool-calling** en Ollama (ej. `qwen2.5-coder`, `llama3.1`, `mistral`,
   `gemma3`).
4. Escribe una orden y el agente la ejecuta de verdad, ej.:
   - *"Crea un archivo de texto llamado prueba.txt en mi escritorio con el
     texto 'hola mundo'."*
   - *"Ejecuta `ipconfig` y dime mis IPs."*
   - *"Listar los archivos de mi carpeta Documentos."*
   - *"Borra el archivo C:\Users\<tú>\Desktop\prueba.txt."*
5. El chat te **muestra el resultado real** (ruta del archivo creado, salida
   del comando) porque el agente verifica tras cada acción.

## Herramientas nuevas (delegadas al puente :5000)

| Herramienta | Acción real en la PC | Endpoint |
|---|---|---|
| `pc_info` | OS, usuario, ruta del Escritorio, home, Python | `GET /api/pc/info` |
| `pc_exec` | Ejecutar un comando (CMD/bash) | `POST /api/exec` |
| `pc_write_file` | Crear/sobrescribir un archivo | `POST /api/fs/write` |
| `pc_read_file` | Leer un archivo | `POST /api/fs/read` |
| `pc_list_dir` | Listar una carpeta | `POST /api/fs/list` |
| `pc_delete` | Borrar archivo/carpeta (destructivo) | `POST /api/fs/delete` |

Las herramientas `pc_*` aceptan rutas absolutas (`C:\Users\...`, `/home/...`)
o atajos: `Desktop/archivo.txt`, `Documents/...`, `Downloads/...`, `~`.

Las herramientas viejas (`list_files`, `write_file`, `run_command`, …) siguen
operando **solo dentro del sandbox** `.proyectos`. Para la PC real se usan
siempre las `pc_*`.

## Panel Subagentes

La pestaña **Puertos** ahora muestra la **topología en vivo** con estado
online/offline de cada subagente:

- **Interfaz UI** (:3000)
- **Puente PC / Agente 5000** (la ejecución real)
- **Motor de Inferencia Ollama** (:11434)
- **Sandbox del Proyecto** (`.proyectos`)

Endpoint: `GET /api/subagents` (proxia al puente).

## Archivos modificados

- `agent_bridge_5000.py` — nuevos endpoints PC + info/subagentes, timeout configurable.
- `server.ts` — herramientas `pc_*`, modo `pcMode`, inyección de protocolo, `/api/subagents`.
- `src/utils/engine.ts` — `pcMode` en `StreamConfig` y en el body del stream.
- `src/types.ts` — tipo `SubagentItem`.
- `src/App.tsx` — estado `pcMode` (persistido), fetch de subagentes, props.
- `src/components/ChatCenter.tsx` — toggle **Agente PC** en la barra superior.
- `src/components/LeftSidebar.tsx` — sección **Subagentes** + toggle en pestaña Puertos.

## Notas de seguridad

- El Modo Agente PC debe activarse **explícitamente** por el usuario (por
  defecto está OFF). Sin él, el chat no puede tocar la PC real.
- `pc_delete` es destructiva; el modelo solo debe usarla si lo pides.
- El puente solo escucha en `127.0.0.1` (localhost). No expone la PC a la red.
- Para que el agente funcione elige un modelo local con soporte de
  *tool-calling*; los modelos "cloud" (OpenRouter/Gemini) de este build no
  activan las herramientas.

## Verificado

- `tsc --noEmit` ✅ · `vite build` ✅
- Puente :5000 probado en vivo: write/read/list/delete + exec + info + subagents ✅
- Server :3000 auto-arranca el puente y sirve `/api/subagents` ✅

## Seguridad (build 3.3.1) — "0 vulnerabilidades"

Auditoría `npm audit` antes: **14 vulnerabilidades (13 high, 1 critical)**.
Después: **0**. Las 14 vivían en la cadena de empaquetado, no en el runtime
de la IDE (express/react/cors estaban limpios), PERO Electron viaja dentro
del EXE final, así que se actualizaron las dos dependencias raíz:

- `electron` 34.0.0 → **44.3.0** (limpia 33 avisos del backlog de Chromium/Electron;
  `electron-main.cjs` verificado: solo APIs estables, ventana principal con
  `nodeIntegration:false` + `contextIsolation:true`).
- `electron-builder` 25.1.8 → **26.15.3** (limpia el `tar` crítico GHSA-34x7…,
  `node-gyp`, `cacache`, `make-fetch-happen`, `app-builder-lib`, etc.).

Verificado: `npm audit` = 0 · `node --check electron-main.cjs` OK ·
`tsc --noEmit` OK · `vite build + esbuild` OK · binario Electron descargado.

Nota Windows: si npm bloquea scripts (`allowScripts`), ejecutar
`npm install-scripts approve electron` y luego `npm rebuild electron`
antes de `compilar_exe_windows.bat`. NO usar `npm audit fix --force`.

## Estabilidad del Sandbox (build 3.3.2) — "la IDE ya no se recarga sola"

- **FIX raíz del "se cierra y se reinicia":** el watcher de Vite (:3000) vigilaba
  también la carpeta `.proyectos/` del sandbox. Cada sync del AUTO tocaba archivos
  ahí y Vite forzaba un full-reload de TODA la interfaz. Ahora `vite.config.ts`
  ignora `.proyectos/**`, `dist/**`, `venv/**` y los logs de servicio. Verificado:
  tocar `.proyectos/` + arranque completo del sandbox = 0 recargas.
- **killPortListeners endurecido (server.ts):** la limpieza de huérfanos en :3500
  usaba coincidencia por substring (`findstr :3500` también pescaba :35000 y
  direcciones remotas). Ahora exige puerto local EXACTO, filtra TCP+LISTENING y
  jamás mata su propio PID.
- **NUEVO explorador: botón "Adjuntar"** — sube archivos de CUALQUIER tipo al
  árbol del editor (zip se extrae solo, PDFs, código, imágenes; usa el mismo
  procesador del chat).
- **NUEVO explorador: botón "Borrar todo"** — vacía el workspace con
  confirmación y restaura la plantilla base para que el sandbox siga vivo.
- Puertos (regla de oro, sin cambios): IDE 3000 · Sandbox y apps exportadas
  3500 (una a la vez, es a propósito) · Puente PC 5000 · Ollama 11434.
- **DEP0190 eliminado (server.ts):** el arranque del sandbox mezclaba array de
  argumentos con `shell:true` en Windows (advertencia de Node). Ahora se invoca
  `cmd.exe /d /s /c npm.cmd run dev` sin opción shell: mismo resultado, cero
  warnings. Verificado tsc + build + arranque del sandbox.
- **MEMORANDUM.md nuevo** en la raíz del proyecto: plano v3.3.2 completo +
  recomendaciones verificadas de modelos Ollama Cloud gratuitos y modelo de
  visión cloud 100% gratis (con guía anti "cloud de pago disfrazado").
- **FIX instalador Windows (electron-builder 26.15.3):** el bloque "win" del
  package.json usaba "publisherName" directo — propiedad que la serie 26 movió
  a "win.signtoolOptions.publisherName" (esquema estricto additionalProperties
  false). Verificado con el validador real de la versión instalada: SCHEMA OK.
  Además se agregó "description" al package.json (silencia el warning
  "description is missed" del empaquetado).
