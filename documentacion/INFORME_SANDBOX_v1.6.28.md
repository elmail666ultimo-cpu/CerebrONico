# INFORME — SANDBOX v1.6.28 «AUTOMEJORA»

**Build:** v1.6.27-AUTOTEST → **v1.6.28-AUTOMEJORA**
**Objetivo (tuyo):** «quiero ser capaz de reformar mi proyecto, eso sí es automejora».

---

## 0. Corrección de rumbo — y lo digo primero

Lo de ayer (v1.6.27) hacía que el arranque **usara el `dist/` que viene en el paquete y se saltara el build**. Eso arranca en segundos, pero **no sirve para automejora**: serviría el código viejo. Y lo peor no es que sea lento o rápido — es que *podía parecer que la reforma funcionó* cuando en realidad estabas viendo el build anterior.

Para reformar y **ver** el resultado hace falta lo contrario: **compilar cuando hay cambios**. Eso es lo que hace esta versión.

---

## 1. El ciclo que ahora existe

| Situación | Qué hace el motor |
|---|---|
| `dist/` más nuevo que **todas** las fuentes | No compila: `dist/ al día … sin reformas que compilar` (arranque en segundos) |
| Alguna fuente **más nueva** que `dist/` (o sea: reformaste algo) | **Recompila** (`npm run build`) y arranca con el resultado |
| `SANDBOX_IDE_BUILD=1` | Recompila igual, aunque no haya cambios |
| El build **falla** y la auditoría ve dependencias declaradas sin instalar | **Instala lo que falta y reintenta UNA vez** (auto-reparación) |
| El build **falla** igual, pero hay un `dist/` usable | Avís en el log y arranca con ese build, **diciendo que es anterior a tus cambios** |
| El build falla y **no hay** `dist/` | Error con la causa real + la vía de salida (no hay nada que arrancar) |

El detalle que evita el falso positivo: la comparación es **`fuentes > dist + 2 s`**. Al importar un ZIP todos los archivos quedan con la misma marca de tiempo, y un empate **no** es una reforma (si lo fuera, compilaría en cada arranque).

---

## 2. Verificación: el ciclo completo, en ejecución

Monté un proyecto anidado (`package.json` con `name: "cerebronico-ide"`) cuyo `build` **compila de verdad**: lee `src/mensaje.ts` y genera `dist/server.mjs`. Levanté el servidor parcheado y usé el endpoint real del sandbox.

**Arranque 1 — sin `dist/` (obliga a compilar):**
`:3500` → `AUTOMEJORA: SALUDO v1`

**La reforma** — cambio `src/mensaje.ts` a `"SALUDO v2 (reformado)"`:

```
[CerebroNico] IDE anidada: hay fuentes más nuevas que dist/ → se recompila (npm run build).
[CerebroNico] Sandbox arrancado (pid 11432) en puerto 3500
```
`:3500` → **`AUTOMEJORA: SALUDO v2 (reformado)`** ← la reforma está servida

**Arranque 3 — sin tocar nada:**

```
[CerebroNico] IDE anidada: dist/ al día (…) — sin reformas que compilar, se omite npm run build.
```
(no compila al pedo)

**Y los dos caminos de fallo** (con un `build` que falla a propósito, `BUILD-SE-EJECUTO`):

```
[CerebroNico] IDE anidada: npm run build falló (BUILD-SE-EJECUTO: el parche NO salto) pero hay dist/server.mjs:
               se arranca con ese build — OJO: es ANTERIOR a tus últimos cambios, el preview NO refleja la reforma.
```
→ `{"ok":true,"online":true,…}` y el `:3500` sirviendo: el sandbox no queda muerto, pero **no se hace pasar por reforma lo que es un build viejo**.

Suites puras: Vía Rápida 64/64 · Dependencias 44/44 · ADUANA v2 34/34 · Raíz de datos 22/22 · Tregua 15/15 · Proyecto funcional 32/32 · `node --check` OK en `server.ts` y en el bundle.

---

## 3. Tu flujo, de aquí en adelante

1. El proyecto (la IDE) abierto en el editor.
2. Le pedís al agente la reforma que quieras.
3. **Sandbox → Sync → Arrancar ahora.**
4. El motor ve que hay fuentes más nuevas que `dist/` → **recompila** → arranca → el preview muestra tu versión reformada.
5. Repetir: cada arranque con cambios compila solo; cada arranque sin cambios arranca en segundos.

Forzar recompilación cuando dudes: `SANDBOX_IDE_BUILD=1`.

---

## 4. Lo que sigue sin verificar (y no lo voy a dar por hecho)

**Si el `vite build` completo de la IDE funciona dentro del sandbox.** Es el único eslabón que no puedo probar aquí: no tengo tu `node_modules` ni tu Windows. Lo que sí está puesto:

- cuando falle, el log va a decir **el import exacto y el archivo** (v1.6.26);
- antes de rendirse, el motor **instala lo declarado que falte y reintenta una vez** (v1.6.28);
- y si igual falla, el `:3500` no queda muerto y te dice que el build es viejo.

Para cerrarlo del todo, en tu máquina:

```bat
cd C:\Cerebronico\ide\backend
npm run build
```

Las **primeras 10 líneas** de esa salida son la causa. Con eso lo arreglo sin adivinar.

---

## 5. Notas técnicas

- El cambio está aplicado **directamente** en `server.ts` (bloque `if (esPropiaIde)`, marcado `v1.6.28-AUTOMEJORA`) y el `dist/server.mjs` está regenerado. No hay script de parche para este cambio porque es la **reescritura completa del bloque** (se lee entero en el código, con el porqué en los comentarios).
- Toqué sólo ese bloque y la versión (`1.6.28` en `constants.ts`, `package.json` y el bundle). Los cambios de v1.6.25/1.6.26/1.6.27 siguen dentro.
- Sigue en pie lo otro: **`Ctrl + 0`** devuelve el tamaño de la interfaz; el arreglo del menú CN (scroll + Esc) y el tope de escala necesitan recompilar el cliente en tu máquina.
