# PARCHES PARA EL EXE — CerebróNico v1.15.1 → 1.15.2

## Diagnóstico (por qué en dev funciona y el EXE no)

### 1. El crash "A JavaScript error occurred in the main process"
```
SyntaxError: Unexpected identifier 'Electron'
console.log(`[CerebroNico Electron] ${msg}`);   ← línea 19 del archivo EMPAQUETADO
```
El `electron-main.cjs` que entró al `app.asar` **no es el mismo que el del ZIP**:
- En el ZIP, ese `console.log` está en la **línea 37** y la sintaxis es correcta.
- En el EXE está en la **línea 19** y **sin los backticks** (comillas invertidas `` ` ``).
  Sin ellos, `[CerebroNico Electron]` se parsea como array → `CerebroNico` es un
  identificador y `Electron` es el "unexpected identifier". Justo el error que sale.

**Causa típica:** el archivo fue reempliado desde un chat o desde PowerShell.
En PowerShell el backtick **es el carácter de escape** y se lo "come" al escribir
el archivo. Tu captura del chat de la propia IDE decía: *«Reemplaza el contenido
completo de tu archivo electron-main.cjs»* — ese reemplazo rompió el archivo.

**Arreglo:** reemplazar `electron-main.cjs` por el de este parche (verificado con
`node --check`).

### 2. Los puertos (3000 / 3500 / 5000 / 11434) no suben en el EXE
Aunque no crashee, el empaquetado tenía 4 fallos encadenados:

| # | Problema | Consecuencia |
|---|----------|--------------|
| A | `findBatFile()` buscaba el BAT junto al EXE, pero el instalador lo copiaba a `resources/` (donde nunca se miraba). El EXE **portable** además se extrae a `%TEMP%`, fuera del proyecto. | Nunca encuentra el BAT → no arranca `npm run dev` (:3000), ni Ollama (:11434) |
| B | El fallback `forkFallbackServer()` spawneaba `dist/server.mjs` **dentro de `app.asar`** con `cwd` dentro del asar y `ELECTRON_RUN_AS_NODE=1`. Un Node "desnudo" no entiende rutas `.asar` y Windows no puede poner el cwd ahí. | El proceso hijo moría al nacer → :3000 muerto |
| C | `dist/server.mjs` se compila con `--packages=external` (usa `node_modules`), pero `build.files` **no incluía `node_modules`**. | Aunque arrancara: `Cannot find module 'express'` |
| D | `server.ts` busca el puente :5000 en `cwd/agent_bridge_5000.py` y `cwd/../dist/CerebroNicoAgent.exe`, pero el instalador los ponía en `resources/` a pelo. | :5000 siempre STANDBY |

En tus capturas el EXE "veía" 3000/11434 solo porque **el modo dev ya estaba
corriendo** y el EXE se enganchó a él. Sin dev, el EXE no levantaba nada.

## Qué trae este parche

### `electron-main.cjs` (v3.4, reemplazar completo)
- Backticks íntegros y sintaxis verificada (`node --check` OK).
- `findBatFile()`: solo acepta un BAT que tenga `package.json` al lado (raíz real
  del proyecto). El BAT de `resources/` ya no secuestra el arranque.
- `forkFallbackServer()`: rutas reales (requiere `"asar": false`), log del server
  a `%APPDATA%\CerebróNico\logs\backend.log` (antes era `stdio:'ignore'`:
  proceso sordo, sin diagnóstico).
- `PROJECT_DIR` = `C:\Cerebronico` (la misma raíz de datos del BAT; cae a
  `userData` si el disco C: no es escribible). Así el EXE y el dev ven los
  mismos proyectos.
- `ensureOllama()`: si `:11434` no escucha, lanza `ollama serve` oculto
  (mejor esfuerzo; si Ollama no está instalado, la app arranca igual).

### `package.json` (sección `build`, reemplazar completo)
- `"asar": false` → `resources/app/` es una carpeta real: el fork del server,
  el `cwd` y `express.static(dist)` funcionan por fin.
- `files` ahora incluye `node_modules/**/*` (electron-builder mete solo las
  dependencias de producción), `agent_bridge_5000.py`, `app/**/*` (paquete
  Python del puente) y `requirements.txt`.
- `extraResources`: los agentes Python van a `resources/dist/` (antes a
  `resources/` a pelo), que es exactamente donde `server.ts` los busca como
  `cwd/../dist/CerebroNicoAgent.exe`.
- Se quita `iniciar_todo_windows.bat` de `extraResources` (inútil dentro del
  instalador).

## Pasos para recompilar

1. Copiar los 2 archivos sobre tu proyecto (sustituir los existentes):
   - `electron-main.cjs`
   - `package.json` (ya trae `version` subida a `1.15.2` para que el instalador
     nuevo no se confunda con el roto)
2. **Antes de compilar, verificar que el archivo local esté sano** (esto habría
   detectado el crash):
   ```bash
   node --check electron-main.cjs
   ```
   Si da `SyntaxError`, tu copia local está corrupta: usa la de este parche.
3. Ejecutar `compilar_exe_windows.bat` (o a mano: `npm run build` y luego
   `npm run dist`).
4. Probar **primero el instalador NSIS** (`CerebróNico Setup 1.15.2.exe`),
   cerrar el modo dev y matar cualquier proceso viejo:
   ```bash
   netstat -ano | findstr ":3000 :5000 :11434"
   ```
   con los puertos LIBRES. Abrir el EXE instalado: el splash debe pasar a la UI
   y la telemetría debe mostrar :3000 ACTIVO, :5000 CONNECTADO, :11434 OPERATIVO.
5. Si algo no sube, revisar:
   `%APPDATA%\CerebróNico\logs\backend.log` y `C:\Cerebronico\.bridge_5000.log`
   (ahora dejan rastro, antes era silencio total).

## Notas / limitaciones

- El **portable** se extrae en `%TEMP%` en cada arranque; con `asar:false` eso
  ahora es más pesado. Para pruebas usa el Setup o `win-unpacked\`.
- :5000 usa Python si lo encuentra (necesita los paquetes de `requirements.txt`
  instalados); si no hay Python, usa `CerebroNicoAgent.exe` (compílalo con
  `build_backend.bat`, que tu script ya invoca como paso [3/4]).
- :3500 (sandbox) solo aparece cuando corres un proyecto desde la IDE; necesita
  `npm` en el PATH del equipo destino.
- Si en el futuro vuelves a pegar código generado por chat/PowerShell, revisa
  los backticks: `node --check archivo.js` te salva el build.
