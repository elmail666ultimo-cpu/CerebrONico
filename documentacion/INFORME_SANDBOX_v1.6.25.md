# INFORME — SANDBOX v1.6.25 «SANDBOXFIX3»

**Build:** CerebróNico CN v1.6.24-SANDBOXFIX2 → **v1.6.25-SANDBOXFIX3**
**Fallo reportado:** «el sandbox no anda — se queda con la pantalla blanca y pide 3500»

---

## 0. La causa, en una línea

El sandbox **sí arranca** y el puerto **3500 responde 200**, pero la vía rápida
entrega un bundle que **el navegador no puede ejecutar**: 788 bytes que empiezan
con `import React from "react"`. El navegador no resuelve especificadores
desnudos, no monta nada → pantalla en blanco. Y como el bundle se sirve con HTTP
200, el verificador del preview decía «Preview verificado»: el único síntoma
visible era la pantalla vacía.

No era un fallo de instalación de dependencias (eso lo cerró v1.6.24). Era el
**formato del bundle** y **el HTML que quedaba pegado**.

---

## 1. Causa raíz — con evidencia reproducible

### 1.1 El bundle no es ejecutable en un navegador

`comandoBundle` (src/engine/viaRapidaPreview.ts) compilaba con
`--packages=external`, con esta justificación escrita en el código:

> «Deja los `import "react"` tal cual, y el navegador los resuelve por el
> `node_modules` que la IDE sirve en la raíz del proyecto».

**Eso es falso, por dos motivos independientes:**

1. En un navegador un especificador desnudo (`react`) **no se resuelve nunca**:
   no consulta `node_modules`, no sube por el árbol de directorios y no hay mapa
   de imports que lo redirija. La consola del iframe dice
   `Failed to resolve module specifier "react"` y la app no monta.
2. Aunque se sirviera `node_modules` por HTTP, **`react/index.js` es CommonJS**
   (`module.exports = require("./cjs/react.development.js")`) y el navegador no
   ejecuta CommonJS. Un mapa de imports tampoco habría salvado esto: las
   dependencias **tienen** que entrar compiladas dentro del bundle.

**Medición en local, con el propio proyecto del ZIP (`.proyectos`, React+Vite):**

| Bundle | Comando | Tamaño | Imports desnudos |
|---|---|---|---|
| v1.6.24 | `… --format=esm --jsx=automatic --loader:.js=jsx … --packages=external` | **788 B** | `["react", "react-dom/client", "react/jsx-runtime"]` |
| v1.6.25 | `… --format=esm --platform=browser --jsx=automatic --loader:.js=jsx …` | **1.082.773 B** | `[]` |

Y la prueba que cierra el caso: los dos bundles ejecutados bajo un resolutor con
**las reglas del navegador** (cualquier especificador que no empiece por `/`,
`./`, `../` o sea URL → error):

```
=== bundle v1.6.24 ===
Failed to resolve module specifier "react". Relative references must start with either "/", "./", or "../".

=== bundle v1.6.25 ===
ReferenceError: document is not defined
```

El segundo error es **el esperado y es la buena noticia**: la resolución pasó; el
bundle ahora solo se queja de que en Node no hay DOM (en el navegador sí lo hay).

### 1.2 El `index.html` reescrito se quedaba pegado (por esto «el arreglo de v1.6.24 no se notó»)

`compilarPreviewRapida` reescribe `index.html` para que cargue `./cn-preview.js`
y guarda el original en `.cn-preview/index.html.orig`… **y nada lo devolvía
nunca**. Consecuencia en cadena:

1. Primer arranque, sin `node_modules` → vía rápida → compila el bundle roto →
   **reescribe el HTML** apuntando a él.
2. v1.6.24 instala bien las dependencias, el árbol queda sano, el flujo pasa a
   `npm-dev`… y **Vite sirve el `index.html` reescrito**: el bundle viejo, no
   `/src/main.tsx`.
3. La pantalla blanca **sobrevive a todas las reparaciones** (instalar, purgar
   `node_modules`, reiniciar, «Forzar Limpieza»), porque el HTML ya no pide la
   fuente.

### 1.3 El verificador cantaba verde sobre una página vacía

`/api/sandbox/verify-preview` daba por bueno el preview con que `/cn-preview.js`
respondiera 200 y pesara más de 0 bytes. Un bundle irreproducible en el navegador
cumple esas dos condiciones. De ahí la contradicción que has visto tantas veces:
**«dice que está listo / habla del :3500» y la pantalla está en blanco.**

### 1.4 Lo que el informe de v1.6.24 prometía y el código no hacía

El §3 del informe anterior decía: «si trae `vite.config.ts`, `npm install`
automático antes de arrancar Vite». **No era así.** La decisión pura
(`elegirViaPreview`) solo va por `npm-dev` cuando hay configuración propia **Y**
`node_modules` ya existe; si el proyecto trae `vite.config.ts` y **no** tiene
`node_modules`, cae a la vía rápida… y esa rama **retorna antes** del chequeo de
dependencias, así que el `npm install` automático ni se ejecutaba. Esta versión
lo cierra por el otro lado (ver §2.5).

---

## 2. El parche v1.6.25 — cinco cambios, mismo criterio

| # | Archivo | Cambio |
|---|---|---|
| 1 | `src/engine/viaRapidaPreview.ts` | `comandoBundle`: **fuera `--packages=external`**, dentro `--platform=browser`. Las dependencias entran en el bundle, resueltas subiendo por el árbol (el proyecto vive dentro de `ide/backend/`). `--platform=browser` fija las condiciones de resolución y define `process.env.NODE_ENV` (sin él, el React compilado revienta con «process is not defined», otra pantalla en blanco). |
| 2 | `src/engine/viaRapidaPreview.ts` | Nueva función pura `importacionesDesnudas(codigo)`: audita el bundle **generado** y devuelve los especificadores que un navegador no podrá resolver. Solo mira al principio de línea (donde esbuild escribe los `import`), para no confundir el mismo texto dentro de una cadena o un comentario. |
| 3 | `server.ts` (`compilarPreviewRapida`) | **GUARDA-BUNDLE-DESNUDO**: si el bundle salió con imports desnudos, la compilación se declara fallida **antes** de tocar el HTML, con el motivo exacto en el mensaje. |
| 4 | `server.ts` (`/api/sandbox/start`) | **Restauración del HTML**: si la vía es `npm-dev` (o si la compilación falló), el `index.html` original vuelve desde `.cn-preview/index.html.orig` antes de arrancar nada. Y si la vía rápida falla, el flujo **cae a la vía de npm** (instala lo que falte y respeta su `dev`) en vez de servir una página muerta. |
| 5 | `server.ts` (`/api/sandbox/verify-preview`) | El verificador lee el bundle de disco y **no canta verde** si quedó con imports desnudos: dice literalmente que el bundle se sirve pero el navegador no puede ejecutarlo, y por eso el preview sale en blanco. Añade `desnudos: [...]` a la respuesta JSON. |
| — | `dist/server.mjs` (+ `.map`) | **Regenerado** desde el `server.ts` parcheado con el mismo esbuild del `build` (`--bundle --platform=node --format=esm --packages=external --sourcemap`). Fuente y bundle quedan sincronizados (en el ZIP anterior había divergencias de forma entre ambos). |
| — | `tests/viaRapidaPreview.test.ts` | El test que **exigía** `--packages=external` ahora exige lo contrario (`!cmd.includes("--packages=external")` + `--platform=browser`) y se añaden 5 casos de `importacionesDesnudas`. |
| — | `src/constants.ts`, `package.json`, bundle | `1.6.24` → `1.6.25`. |

**Regla que queda escrita en el código:** *un bundle solo es bueno si el
navegador puede resolver todos sus `import`; el servidor no lo declara listo
hasta haberlo comprobado.*

---

## 3. Verificación ejecutada aquí

| Comprobación | Resultado |
|---|---|
| `VÍA RÁPIDA DE PREVIEW` | **64 correctas · 0 fallidas** (58 + 5 nuevos de `importacionesDesnudas` + 1 de bandera) |
| `DEPENDENCIAS DEL PROYECTO` | **44 correctas · 0 fallidas** |
| `ADUANA v2` (`sandboxCompat`) | **34 correctas · 0 en rojo** |
| `RAÍZ DE DATOS` | **22 correctas · 0 fallidas** |
| `TREGUA` (`sandboxTregua`) | **15 correctas · 0 fallidas** |
| `PROYECTO FUNCIONAL` | **32 correctas · 0 fallidas** |
| `node --experimental-strip-types --check server.ts` | **exit 0** |
| `node --check dist/server.mjs` (bundle regenerado) | **exit 0** |
| Bundle del `.proyectos` real del ZIP | 788 B con bare imports → **1.082.773 B con 0 bare imports** |
| Resolución con reglas de navegador | antiguo: `Failed to resolve module specifier "react"` · nuevo: resuelve (falla solo por falta de DOM) |

### Lo que NO se pudo comprobar aquí (dicho claro)

- No hay Windows, ni el `node_modules` del proyecto real, ni acceso al registry
  de npm: **no se pudo arrancar la IDE de punta a punta** ni medir el preview en
  un navegador de verdad. Lo verificado es el bundle, su resolubilidad, las
  suites puras y la sintaxis de los dos artefactos.
- El `npx --no-install esbuild` del comando no pudo ejecutarse tal cual (el árbol
  de pruebas no trae el shim `node_modules/.bin`); se ejecutó el **mismo binario
  de esbuild con las mismas banderas** que emite `comandoBundle`.

### Prueba manual pendiente (5 minutos, en tu máquina)

1. Importar/desplegar este ZIP y pulsar **Arrancar** (o AUTO).
2. En el log debe aparecer `Preview por «estatico-compilado»: …` y después
   `Vía rápida: ✔ bundle listo (src/main.tsx → cn-preview.js)`.
3. El preview en `:3500` debe mostrar **«CerebroNico Sandbox Funcional — El
   entorno está operativo y sirviendo módulos correctamente en el puerto 3500»**.
4. Si algo falla, el log dirá **por qué** en lugar de quedarse blanco:
   - `✘ el bundle salió con N import(s) que el navegador no puede resolver (…)`
     → falta una dependencia instalable: el flujo cae a `npm install` + `npm run dev`.
   - `index.html restaurado (apuntaba al bundle de la vía rápida)` → ya volvió al
     original; a partir de ahí manda Vite.
5. Consola del iframe (F12 dentro del preview): con el bundle nuevo **no debe
   aparecer** `Failed to resolve module specifier`.

---

## 4. Sobre el «pide 3500» del reporte

No hay ningún literal «pide 3500» en el código. Los dos mensajes que sí existen y
encajan con lo que describes son:

| Dónde | Texto | Qué significa |
|---|---|---|
| Pestaña Sandbox (cabecera) | `APAGADO/REINTENTANDO… · IDE en :3000 · App en :3500` | El motor cree que el sandbox no está en pie (o está reintentando con backoff). |
| Atajo manual / piloto | `El proceso arrancó pero el puerto 3500 aún no responde…` + `El puerto 3500 ya está ocupado por otro proceso… Pulsa «Forzar Limpieza»` | Hay algo reteniendo el 3500 (huérfano) o el proceso murió al arrancar. |

Con la causa de §1.1, **el puerto responde**: si el mensaje que veías era de
«listo/en vivo» junto a la pantalla blanca, es exactamente este fallo (y el
verificador de §1.3 era el que lo tapaba). Si además veías el aviso de puerto no
responde u ocupado, entonces hay además un proceso huérfano de una sesión
anterior: **Detener → Forzar Limpieza → Arrancar** y el log nuevo dirá la verdad
en una línea.

---

## 5. Notas

- **Opt-outs intactos:** `SANDBOX_AUTO_DEPS=0` (no tocar dependencias del
  proyecto) y `AUTO_INSTALL_DEPS=0` (no reparar tras la muerte del proceso).
- **Trade-off documentado y deliberado:** con la vía rápida, un proyecto que
  traiga `vite.config.ts` se previsualiza **sin** su configuración (alias,
  plugins, `define`) — es el precio de previsualizar sin instalar y sin red. Si
  esa configuración importa, el camino es el `npm install` + `npm run dev`, que
  ahora es también el **fallback automático** cuando el bundle no sale ejecutable.
- **El script del parche** (`ide/backend/scripts/parche-sandbox-v1625.mjs`) es
  idempotente y verifica cada anclaje: sirve para reaplicar los cambios si algún
  día se regenera el `server.ts` desde otro source.
- **Riesgo residual:** `--loader:.js=jsx` sigue aplicándose a todos los `.js` del
  bundle (ahora también a los de `node_modules`). Con React/React-DOM compila sin
  errores en las pruebas; si algún paquete usara `<` de forma no-JSX en un `.js`,
  la compilación fallaría en voz alta (y entonces se cae a la vía de npm, que es
  donde estaba antes). No es un fallo silencioso.
