# INFORME — SANDBOX v1.6.26 «DIAG»

**Build:** v1.6.25-SANDBOXFIX3 → **v1.6.26-DIAG**
**Fallo reportado:** el sandbox no arranca. El log termina en
`No se pudo arrancar: La IDE no pudo compilarse dentro del sandbox: at ModuleScope.findVariable (…) · at ReturnValueScope.findVariable (…) · at FunctionBodyScope.findVariable (…) · at Identifier.bind (…)`

---

## 0. Qué se ve en tu log, leído en orden

```
SYNC · 185 archivo(s) escrito(s) en C:\Cerebronico
SYNC · Proyecto reconocido en: C:\Cerebronico\ide\backend        ← ⚠ el proyecto es LA IDE
SYNC · Proyecto detectado. Ejecuta 'npm install' y luego 'Arrancar ahora'.
npm install en curso… → [0:25:18] Dependencias instaladas correctamente.
Arrancando servidor del proyecto en el puerto 3500…
⚠ Hay una copia de CerebróNico ANIDADA en el sandbox («ide/backend/») … reintentando con confirmación…
No se pudo arrancar: La IDE no pudo compilarse dentro del sandbox: <14 renglones de PILA, cero de causa>
```

Dos cosas pasan a la vez, y conviene separarlas:

1. **El sandbox está corriendo la propia IDE**, no tu aplicación. La guarda
   anti-recursión de v1.6.24 lo detectó bien (`«ide/backend/»`) y siguió con tu
   confirmación. En ese camino el motor **compila la IDE dentro del sandbox**
   (`npm run build` → `vite build && esbuild …`) y recién después arranca
   `node dist/server.mjs`. Ese build es el que falla.
2. **El mensaje de ese fallo no llegó a la pantalla.** Eso es el bug que arregla
   esta versión (ver §1).

---

## 1. El bug que arregla v1.6.26: el error se recortaba dejando solo la pila

El motor capturaba la salida de un proceso así:

```ts
String(build.stderr || build.stdout).split("\n").filter(x => x.trim()).slice(-6).join(" · ")
```

`.slice(-6)` = **los seis últimos renglones**. En Vite/Rollup/esbuild el mensaje va
**arriba** y debajo queda la pila de llamadas, así que el log mostraba catorce
renglones de `at …` y **cero de causa**. Un fallo sin su mensaje no se puede
arreglar: se adivina.

### Verificación con salidas de error reales (no inventadas)

Reproduje el fallo de Vite aquí (mismo código, dependencias del proyecto) y
capturé tres salidas de error reales; después pasé cada una por el extractor
viejo y por el nuevo:

| Salida real | ANTES (`.slice(-6)`) | AHORA |
|---|---|---|
| `vite build` (Rollup, salida real capturada) | `at onRollupLog (…dep-Dm0c1Wj2.js:46552:5) · at onLog (…) · …` | `error during build: · [vite]: Rollup failed to resolve import "js-yaml" from "…/src/engine/formatConverter.ts".` |
| `esbuild` con import inexistente | incluía el `✘ [ERROR]` de casualidad | `✘ [ERROR] Could not resolve "…" · 1 error` |
| `npm install` de un paquete que no existe | `npm error 404 · …` (cola) | `npm error code E404 · npm error 404 Not Found - GET https://registry.npmjs.org/…` |

El extractor elige las líneas que **parecen la causa** estén donde estén (arriba
en Vite/esbuild, abajo en npm) y, si no reconoce ninguna, toma la **cabeza** de la
salida. Nunca la cola.

Además los dos mensajes ahora dicen **qué comando y en qué carpeta** corrió:

```
La IDE no pudo compilarse dentro del sandbox [npm run build en C:\Cerebronico\ide\backend]: <causa real>
La IDE anidada no pudo instalar sus dependencias (necesita red la primera vez) [npm install en …]: <causa real>
```

Cambios: `server.ts` (4 puntos de captura + helper `detalleDeSalida()`), `dist/server.mjs` regenerado, versión a 1.6.26. Script idempotente:
`ide/backend/scripts/parche-sandbox-v1626.mjs`. Suites puras y `node --check`
siguen en verde.

---

## 2. Sospecha nº 1 para tu `vite build` (a confirmar con el log nuevo)

En mi reproducción, con el código de esta misma versión, `vite build` falló
**exactamente con esta forma**:

```
error during build:
[vite]: Rollup failed to resolve import "js-yaml" from "…/src/engine/formatConverter.ts".
```

…y la causa era una **dependencia declarada en `package.json` que no estaba
instalada** en el `node_modules` del árbol que compilaba. El instalador del
sandbox anidado corre con `--ignore-scripts`; si alguna dependencia del cliente
no quedó disponible (o el `package.json` sincronizado y el `node_modules` no se
corresponden), el build muere exactamente así.

No afirmo que sea tu caso: **la pila que viste (`Identifier.bind`) no es la misma
forma que la mía** (la mía venía con `handleInvalidResolvedId`), y con el log
recortado no había mensaje para comparar. Con v1.6.26 el próximo intento dirá el
import exacto y el archivo, y ahí se arregla en un minuto.

### Cómo tenerlo ya, sin esperar

En la carpeta del sandbox, a mano:

```bat
cd C:\Cerebronico\ide\backend
npm run build
```

Las **primeras 10 líneas** de esa salida son el mensaje que faltaba. Pegámelas y
sigo por ahí.

---

## 3. Qué hacer ahora con el sandbox

### Si querés previsualizar TU app (lo normal)

El editor tiene dentro la carpeta de la IDE, así que el sandbox "reconoce" la IDE
como proyecto. Los pasos que sugiere la propia guarda:

1. **Sandbox → Detener.**
2. **«Borrar todo»** en el editor (vacía `.proyectos`/estado de CerebroNico).
3. **Reimportá SOLO tu aplicación** (no la carpeta que contiene la IDE).
4. **Arrancar ahora.**

### Si querés la prueba «IDE dentro de la IDE» (autotest)

Es un camino legítimo pero pesado: instala las dependencias de la IDE en el
sandbox (~3,5 min en tu log) y **compila el cliente dentro del sandbox**, que es
justo donde está fallando. Dos mejoras candidatas, a decidir con el mensaje real:

- **Omitir `npm run build` cuando `dist/server.mjs` ya está en el árbol**
  (el ZIP lo trae compilado): el autotest arrancaría en segundos y sin pasar por
  Rollup. Requiere confirmar que el sync copia `dist/` — se ve con
  `dir C:\Cerebronico\ide\backend\dist`.
- **Instalar las dependencias del árbol anidado sin `--ignore-scripts`**, por si
  una dependencia necesita su script de instalación para quedar utilizable.

---

## 4. Recordatorio de lo otro (interfaz «todo grande»)

Nada de esto arregla el zoom: para salir del aprieto, **`Ctrl + 0`** (tamaño
global a 15 px). Si además tocaste la paleta de aspecto, en la consola de la IDE:

```js
localStorage.removeItem('codigo0_app_font_size');
localStorage.removeItem('cn.aspecto.v1');
location.reload();
```

Los dos arreglos de interfaz (desplegable CN con scroll y Esc, y tope de escala)
sigo teniéndolos listos para el fuente, pero **el cliente hay que recompilarlo en
tu máquina** (`npm run build`): aquí no lo toco para no cambiar tu bundle por uno
hecho con otras versiones de Tailwind/React.
