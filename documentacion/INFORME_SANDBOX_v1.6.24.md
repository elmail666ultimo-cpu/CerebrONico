# INFORME — SANDBOX v1.6.24 «AUTO-SANADOR»

**Build:** CerebróNico CN v1.6.23-CONSOLIDADO → **v1.6.24-SANDBOXFIX**
**Fallo reportado:** `Cannot find module '.../vite/dist/node/chunks/dist.js'` al arrancar el sandbox (`ide/backend/.proyectos`, puerto 3500). «NO FUNCIONA EL SANDBOX».

---

## 1. Causa raíz (confirmada con evidencia del código)

El diagnóstico del reporte era correcto en esencia: el sandbox arrancaba un proyecto React+Vite cuyos `node_modules` nunca se instalaron en su propia carpeta (el ZIP los excluye por peso). El código de v1.6.23 tenía **cuatro eslabones** que convertían ese estado en un fallo permanente e irreparable:

1. **`existe la carpeta` ≠ `está instalado`.** `elegirViaPreview` (src/engine/viaRapidaPreview.ts) declaraba «ya está instalado» con un simple `fs.existsSync(node_modules)`. Un árbol podado (ZIP sin dependencias, o un `npm install` cortado a medias) pasaba por sano.
2. **npm-dev con `requiereInstalar: false`.** Con `vite.config.ts` + carpeta `node_modules` presente, la decisión fija era «respetar su `dev`, no instalar nada» → `spawnSandbox` ejecutaba `npm run dev` → el bin de Vite arrancaba y moría contra su propio chunk interno faltante. Nota: la IDE trae **Vite 6** y la plantilla `sandbox-app` declara **Vite 5** — con el árbol local incompleto, npm resuelve el `vite` del ancestro (`ide/backend/node_modules/.bin`) y el cruce 6-core/5-plugin produce exactamente el `.../vite/dist/node/chunks/dist.js` del aviso.
3. **El chequeo v1.6.7 solo avisaba.** Las dependencias «declaradas y SIN instalar» provocaban únicamente un `console.warn`; nunca un `npm install`.
4. **La auto-reparación estaba APAGADA por defecto.** `AUTO_INSTALL_DEPS` exigía `=1` para reinstalar tras la muerte del proceso; sin la variable, el sistema dejaba el error en pantalla y mandaba al usuario a la terminal. Y el `npm install` de reparación usaba **timeout de 300 s**, que es precisamente el mecanismo que trunca instalaciones y genera árboles fantasma.

Resultado: con la carpeta podada, **ninguna** de las tres capas de defensa (decisión → pre-chequeo → reparación) hacía nada. El sandbox no podía arreglarse solo, nunca.

## 2. El parche (mismo criterio en tres capas)

**Regla nueva, única:** *un paquete está instalado cuando su carpeta existe, su `package.json` se parsea, y el archivo de entrada que él mismo declara (`main` / `exports["."]` / primer `bin`) está en el disco.*

| Capa | Archivo | Cambio |
|---|---|---|
| **Auditoría** | `src/engine/dependenciasProyecto.ts` | Nuevas funciones puras `saludDePaquete`, `auditarInstalacion`, `instalacionSana` (disco inyectado por parámetro; 12 tests nuevos). |
| **Decisión** | `src/engine/viaRapidaPreview.ts` | Campo `nodeModulesSano` en `EntradaPreview`. Con config propia + árbol podado → sigue `npm-dev` pero **declara `requiereInstalar: true`**. Marco con servidor propio: idem. Árbol sano o ausente: comportamiento viejo intacto (la vía rápida sigue sin instalar nada). |
| **Preflight** | `server.ts` (`/api/sandbox/start`) | Antes de spawn (donde no hay watcher vivo que despertar): audita los declarados → **purga solo las carpetas rotas** → `npm install --no-audit --no-fund` con **600 s**. `estaInstalado` del cruce v1.6.7 reforzado con la auditoría. La IDE anidada (`cerebronico-ide`) queda excluida: se autorrepara en su bloque PROPIO-IDE con `--ignore-scripts`. |
| **Reparación** | `server.ts` | `AUTO_INSTALL_DEPS` **ON por defecto** (opt-out `=0`), justificado: solo corre con el proceso del proyecto ya muerto y en una acción explícita de Arrancar — el bug de aislamiento «subir ZIP reinicia la app» era de instalaciones *durante* cargas masivas, que no instalan. Añadido **Intento 3**: si tras reinstalar el log sigue con `Cannot find module`, se purga `node_modules` completo y se instala de cero (nunca se toca código del usuario). |
| **Transparencia** | ambos | La respuesta JSON gana `instalo: boolean` y `via: "estatico-directo" | "estatico-compilado" | "npm-dev"`; la pista final ya no manda al usuario a la terminal: explica que la reparación falló y por dónde (red/registry/versões). |
| **Producción** | `dist/server.mjs` | Los seis cambios espejados 1:1 en el bundle compilado (`node --check` OK), generador idempotente en `scripts/parche-sandbox-v1624.mjs` por si se regenera desde otro source. |
| **Versión** | `constants.ts`, `package.json`, bundle | `1.6.23` → `1.6.24`. |

## 3. Comportamiento esperado ahora

- **ZIP recién importado (sin `node_modules`)**: vía rápida esbuild si no trae config; si trae `vite.config.ts`, `npm install` automático antes de arrancar Vite → preview vivo.
- **Árbol podado/corrupto (el error reportado)**: auditoría lo detecta ANTES de spawn, purga los paquetes rotos, reinstala; si aun así muere, la escalada purga e instala de cero. El usuario no toca la terminal en ninguno de los dos casos.
- **Proyecto sano**: cero cambios de comportamiento (no reinstala, no purga) — tests de regresión de v1.6.9 en verde.

## 4. Verificación

- `node --experimental-strip-types` sobre los suites puros: **Vía Rápida 58/58** (incluidos los 4 casos nuevos del árbol podado y la invariante barrida con la nueva dimensión) · **Dependencias 44/44** (12 casos nuevos de auditoría) · `sandboxCompat` y `raizDatos` sin regresión.
- `node --check` sobre `dist/server.mjs` y `--experimental-strip-types --check` sobre `server.ts`/`constants.ts`: sintaxis válida.
- Prueba manual al desplegar: importar un proyecto React+Vite con `vite.config.ts`, borrar su `node_modules`, pulsar Arrancar → debe aparecer en el log `→ npm install automático antes de arrancar.` y luego el preview en :3500.

## 5. Notas

- La primera auto-instalación **necesita red** (registry de npm). Sin red el sandbox ahora lo dice explícitamente (`timeout de 10 min — ¿red lenta o registry caído?`) en vez de morir en silencio.
- `Cerebronico-v1.1.1/` (copia antigua incluida en el consolidado) **no se tocó**: snapshot histórico; el `ide/` de la raíz es el árbol vivo.
- Respaldo del bundle previo a `dist/server.mjs.v1.6.23.bak` guardado **fuera** del paquete (carpeta `_respaldo_cerebronico/` junto a este proyecto).
- Opt-outs que siguen funcionando: `SANDBOX_AUTO_DEPS=0` (no tocar dependencias) y `AUTO_INSTALL_DEPS=0` (no reparar post-mortem).

---

## 6. RONDA 2 — SANDBOXFIX2 (log del 23-09, 9:37–9:53 p. m.)

El primer parche cerró el fallo de dependencias. El log nuevo cuenta **otra historia**, con cuatro líneas que lo delatan:

| Línea del log | Lo que significa |
|---|---|
| `SYNC · Proyecto reconocido en: C:\Cerebronico\ide\backend` | El editor tenía sincronizada **la propia CerebróNico** (183 archivos con carpeta `ide/`), no una app. |
| `Proyecto aplanado: 4 elemento(s) movidos desde «ide/»` | El aplanado renombró la carpeta anidada… que era la instalación viva. **El programa movió el suelo que pisaba.** |
| `npm install con errores: … enoent … package.json` | `/api/exec` corrió npm donde ya no había package.json (GUARDA-B del resolutor, correcta, impide señalar la app como proyecto — pero npm quedó ladrando solo). |
| `App viva en :3500 (pid externo)` + `main.tsx: 404` | Lo que respondía en 3500 era un servidor **de otra sesión** con la raíz mudada; y `verify-preview`, que solo conoce proyectos Vite, sentenció «página en blanco» sobre vías que no prometen `/src/main.tsx`. |

### Salvaguardas nuevas (server.ts + espejo en dist/server.mjs)

1. **GUARDA-E (flatten-root)**: si la copia anidada es o contiene el `cwd` del proceso vivo, el aplanado **se niega** y lo dice con la solución en tres pasos (quitar `ide/` del editor / borrar sandbox / sync de solo la app). Una copia *distinta* de la IDE sigue siendo aplanable y recurrible con confirmación.
2. **GUARDA-RECURSIÓN ANIDADA (`/api/sandbox/start`)**: la comprobación `cerebronico-ide` ya no mira solo la raíz de `.proyectos`: también la raíz resuelta. La recursión se declara ANTES de gastar cinco minutos instalando y compilando la IDE dentro de sí.
3. **GUARDA-ENOENT (`/api/exec`)**: comando npm en carpeta sin package.json → busca el package.json hacia abajo (BFS ≤ 4 niveles) y ejecuta ahí; si no existe en ninguna parte, responde en cristiano sin invocar npm.
4. **`installed` auditado (`/api/sandbox/status`)**: deja de ser `existsSync(node_modules)`; ahora pasa por `nodeModulesSanoEn` (auditoría de entrada), así que un árbol podado vuelve a disparar la instalación del piloto.
5. **`verify-preview` consciente de la vía**: antes exigía `/src/main.tsx` siempre (por eso el falso «EN BLANCO»). Ahora clasifica —`estatico-compilado` (sondea `/cn-preview.js`), `npm-dev` (main.tsx + componente), `ide-anidada` (`/` + `/assets/…`), `estatico-directo` (`/` + script)— y añade detección de HTML vacío (< 60 B) y la mención explícita al «pid externo» con «Forzar Limpieza» cuando aplica.
6. **Ayudas compartidas a nivel de módulo** (`DISCO_AUDITORIA`, `esCarpetaDeLaAppViva`, `nombreDelPackageEn`, `nodeModulesSanoEn`, `buscarPackageJsonBajo`): un solo criterio de «dónde vive el proyecto vivo» para status, exec, flatten, start y verify, que era justo lo que se contradecía entre sí.

### Verificación ronda 2

- `server.ts`: `node --experimental-strip-types --check` OK.
- `dist/server.mjs`: `node --check` OK; 6 sustituciones aplicadas por `scripts/parche-sandbox-v1624b.mjs` (idempotente, marcado `v1.6.24b-SANDBOXFIX2`), sin símbolos duplicados.
- Suites puros: **Vía Rápida 58/58** · **Dependencias 44/44** (sin regresión).

### Comportamiento esperado con el log de referencia

- Con `ide/` en el editor: el aplanado **no** mueve la instalación (GUARDA-E con mensaje accionable), el piloto detecta la app de la raíz, `/api/exec` instala donde hay package.json (o responde por qué no hay), y `verify-preview` informa según la vía real. El sandbox deja de autocanibalizarse.
- Regla para el usuario: **el sandbox corre TU app; la IDE no se sincroniza dentro de sí misma**. Para dogfood de la IDE existe la ruta explícita de confirmación de recursión (copias distintas, no la del proceso vivo).
