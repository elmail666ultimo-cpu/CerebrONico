# INFORME — SANDBOX v1.6.27 «AUTOTEST»

**Build:** v1.6.26-DIAG → **v1.6.27-AUTOTEST**
**Contexto:** colocaste la v1.6.25 dentro del sandbox a propósito — el autotest «IDE dentro de la IDE». Ese camino es el que fallaba.

---

## 1. Qué hacía el motor en ese camino

| Paso | Lo que hacía | El problema |
|---|---|---|
| Instalar | `npm install --ignore-scripts` **solo si NO existía** `node_modules` | Si la carpeta existe pero está **vieja** (creada por un `package.json` anterior), nunca se reinstala: el árbol roto queda **pegado para siempre** |
| Compilar | `npm run build` **siempre** (≈300 s de Rollup dentro del sandbox) | Es el paso que fallaba… y encima regeneraba un `dist/` que **el ZIP ya trae compilado** |
| Fallar | Si el build fallaba → `return error` | Aunque hubiera un `dist/server.mjs` perfectamente usable, el autotest no arrancaba |

Cinco minutos de compilación para volver a generar un archivo que ya estaba, y ese paso era justo el que moría.

---

## 2. Los tres cambios

1. **No recompilar lo que ya viene compilado.** Si existe `dist/server.mjs`, se arranca con él y se omite el build. Para forzar la recompilación: `SANDBOX_IDE_BUILD=1` (o borrar `dist/`).
2. **Un build fallido ya no deja el autotest muerto.** Si el build falla pero hay un `dist/` usable, se avisa en el log y se arranca igual.
3. **`node_modules` incompleto = se reinstala.** La condición dejó de ser «¿existe la carpeta?» y pasó a ser la auditoría de integridad (`nodeModulesSanoEn`): si falta alguna dependencia **declarada**, se instala.

Script: `ide/backend/scripts/parche-sandbox-v1627.mjs` (idempotente). `server.ts` + `dist/server.mjs` regenerado + versión 1.6.27.

---

## 3. Verificación: prueba de integración real (no «por inspección»)

Monté un sandbox de prueba con una **IDE anidada** (`package.json` con `name: "cerebronico-ide"`) cuyo script `build` **falla a propósito** — así, si el parche no saltara, el test falla a gritos. Levanté el servidor parcheado y llamé al endpoint.

**Corrida A — comportamiento normal:**

```
[CerebroNico] Proyecto encontrado en subcarpeta: ide/backend
[CerebroNico] IDE anidada: uso el dist/server.mjs que ya viene compilado (…) — se omite npm run build.
[CerebroNico] Sandbox arrancado (pid 10657) en puerto 3500
```
Respuesta del endpoint: `{"ok":true,"pid":10657,"port":3500,"online":true,…}`
`curl http://127.0.0.1:3500/` → `<h1>NESTED-IDE-OK</h1>`
El build que falla **no se ejecutó nunca** (no aparece `BUILD-SE-EJECUTO` en ningún log).

**Corrida B — con `SANDBOX_IDE_BUILD=1` (forzando el build que falla):**

```
[CerebroNico] IDE anidada: SANDBOX_IDE_BUILD=1 → se recompila (npm run build).
[CerebroNico] IDE anidada: npm run build falló (BUILD-SE-EJECUTO: el parche NO salto) pero hay dist/server.mjs: se arranca con ese build.
[CerebroNico] Sandbox arrancado (pid 10810) en puerto 3500
```
Respuesta: `{"ok":true,"port":3500,"online":true,…}` y el `:3500` sirviendo igual.

Esa segunda línea de log, además, **prueba en vivo el arreglo de v1.6.26**: la causa real del proceso (`BUILD-SE-EJECUTO: …`) aparece en el mensaje en lugar de la pila.

Suites puras sin cambios: Vía Rápida 64/64 · Dependencias 44/44 · ADUANA v2 34/34 · Raíz de datos 22/22 · Tregua 15/15 · Proyecto funcional 32/32 · `node --check` OK en `server.ts` y en el bundle.

**Nota de honestidad:** para levantar el servidor en mi entorno tuve que poner dos sustitutos mínimos (`js-yaml`, `smol-toml`) en el `node_modules` de una copia de trabajo. **No forman parte del ZIP**; sólo existen para poder ejecutar la prueba.

---

## 4. Un hallazgo que apunta a tu `vite build`: falta `js-yaml`

En el árbol que tengo, el `node_modules` viejo **no tenía `js-yaml`**, que el código importa en `src/engine/formatConverter.ts`. Con esa ausencia, `vite build` muere exactamente con:

```
error during build:
[vite]: Rollup failed to resolve import "js-yaml" from "…/src/engine/formatConverter.ts".
```

…y el mismo hueco rompe también `node dist/server.mjs`, porque ese import queda **externo** en el bundle del servidor. Si tu `C:\Cerebronico\ide\backend\node_modules` viene de una corrida anterior, tiene el mismo problema — y con el guard viejo (`existsSync`) **nunca se reinstalaba**.

**Lo que NO está confirmado:** la pila que viste (`at ModuleScope.findVariable … at Identifier.bind`) no tiene la misma forma que la de mi fallo (la mía traía `handleInvalidResolvedId`), así que **no afirmo** que tu error sea el import de `js-yaml`. Con v1.6.27 ya no hace falta compilar para el autotest; y si algún día lo forzás con `SANDBOX_IDE_BUILD=1`, el log te va a decir el import exacto y el archivo.

---

## 5. Qué hacer con esto

1. **Usá el ZIP v1.6.27.** El autotest «IDE dentro de la IDE» debería arrancar en segundos y mostrar la IDE en el preview, sin pasar por Rollup.
2. Si querés que el **build** también funcione (no sólo el arranque): en `C:\Cerebronico\ide\backend`, borrá `node_modules` y volvé a arrancar — con el cambio 3, el motor reinstala solo lo que falte declarado. Un `npm install` a mano en esa carpeta hace lo mismo.
3. Si en algún momento querés ver **tu app** y no la IDE: importá sólo tu aplicación. El sandbox arranca el primer proyecto que encuentra, y con el ZIP completo lo que encuentra es la IDE.
4. Recordatorio de lo otro: **`Ctrl + 0`** devuelve el tamaño de la interfaz a 15 px (el arreglo de menú/escala sigue pendiente de recompilar el cliente en tu máquina).
