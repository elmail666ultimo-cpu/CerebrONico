# INFORME — v1.6.30 «ÁRBOL LIMPIO»

**Build:** v1.6.29-RESCATE-UI → **v1.6.30-ARBOL-LIMPIO**
**Fallo reportado:** el sandbox no arranca; el build de la IDE anidada muere con
`src/components/LeftSidebar.tsx (39:2): "loadLanguageMemories" is not exported by src/utils/languageMemory.ts`

---

## 1. La causa real (por fin con el mensaje delante)

El arreglo del log de la v1.6.26 hizo su trabajo: **ahora sabemos qué falla**, y no es ni la recursión ni las dependencias.

```
"loadLanguageMemories" is not exported by
"../../../CerebroNico/ide/backend/src/utils/languageMemory.ts",
imported by ".../src/components/LeftSidebar.tsx"
```

**En el ZIP que te entregué, ese archivo SÍ exporta la función** (`src/utils/languageMemory.ts`, línea 94) y `LeftSidebar.tsx:39` la importa. O sea: los dos archivos son consistentes… en el ZIP. El que está en tu sandbox, no.

### El mecanismo exacto

La sincronización (`App.tsx:2925`) envía **sólo lo que tiene el editor**:

```ts
files: workspaceFiles.map((f) => ({ path: f.path, content: f.content })),
```

…y **no borra lo que sobra en disco**. Tu log lo confirma: «185 archivo(s) escrito(s)», cuando sólo `ide/backend` tiene ~317 archivos. Es decir: `languageMemory.ts` **no vino del editor en esta sesión** — quedó ahí de una corrida anterior, con una versión vieja, sin `loadLanguageMemories`. El archivo nuevo que lo importa sí se escribió. Un archivo viejo + un importador nuevo = Rollup corta el build.

Eso es todo lo que estuvo pasando durante días: el árbol del sandbox es una **mezcla de versiones**. (Y no, no lo introdujeron mis parches: los archivos del cliente y de la interfaz siguen idénticos byte a byte al ZIP original — §1 del informe de la v1.6.29.)

---

## 2. Lo que arregla esta versión

| # | Cambio | Verificación |
|---|---|---|
| 1 | **El error dice lo que es.** El mensaje distingue un error de CÓDIGO de la «vía de salida» de la recursión (que aquí mandaba a borrar todo y reimportar: pérdida de tiempo). Ahora dice: es código, la causa típica es el árbol mezclado, y los dos pasos para limpiarlo. | Clasificador probado **5/5** con tu texto literal del log, un mensaje de recursión, un `ENOENT`, un `Rollup failed to resolve` real y un fallo genérico de npm |
| 2 | **Ctrl + Alt + L → limpiar el sandbox.** Llama a `/api/fs/clear-all`: borra los restos de sesiones anteriores y **conserva `node_modules` y el estado**. Antes no había forma desde la interfaz: «Forzar Limpieza» sólo reinicia el iframe, y «Borrar todo» se lleva todo. | Prueba en vivo con un sandbox de prueba: `{"ok":true,"deleted":4,"preserved":6}` — borró proyecto y caché de Vite, conservó `node_modules` (raíz y anidado) |
| 3 | **Limpiar ya no se lleva el cerebro.** 🐞 `clear-all` borraba TODO lo que hubiera en la raíz. Con `PROJECT_DIR` apuntando a tu raíz de datos (`C:\Cerebronico`), esa llamada se llevaba `.cerebro-db`, `.cerebronico`, `MEMORIA.md` y `skills.md` **sin rescate** (el borrado total sí los salva; éste no). Ahora preserva exactamente lo mismo que un borrado total. | Prueba en vivo: `.cerebro-db/kb.json`, `.cerebronico/espejos.json`, `MEMORIA.md`, `skills.md` y los `node_modules` **intactos** después de la limpieza |

Suites puras sin cambios: Vía Rápida 64/64 · Dependencias 44/44 · ADUANA v2 34/34 · Raíz de datos 22/22 · Tregua 15/15 · Proyecto funcional 32/32 · `node --check` OK en `server.ts`, el bundle y los dos scripts de `index.html`.

---

## 3. ⚠️ Aviso antes de tocar nada

En el build que estás corriendo (**v1.6.27**) **NO** llames a `/api/fs/clear-all` desde la consola: te borraría el estado (`.cerebro-db`, `MEMORIA.md`). Hasta que instales esta versión, limpiá **a mano**.

---

## 4. Qué hacer ahora

### Camino A — con esta versión (recomendado)

1. Instalá el ZIP **v1.6.30**.
2. **`Ctrl + Alt + L`** (borra los restos; conserva `node_modules` y el estado).
3. **«Arrancar ahora»** → el sync reescribe el proyecto entero desde el editor → el build debería completar (~30-60 s con la caché de Vite ya limpia).

### Camino B — sin cambiar de build

Borrá a mano la carpeta del proyecto dentro del sandbox:

```
C:\Cerebronico\ide
```

Es la **copia que el sandbox escribió** (tu proyecto vive en el editor y en el `.cn`). Se rehace sola: el sync reescribe el código y `node_modules` se reinstala (~3 minutos, como la primera vez).

### Después, en los dos casos

Si el error **cambia** a `Could not resolve "./utils/languageMemory"`, entonces ese archivo **tampoco está en el workspace del editor** — y la solución es otra: reimportar el proyecto completo (import sobre workspace vacío) para que el editor tenga los ~317 archivos, no 185.

---

## 5. Sobre «por primera vez veo que sube la CPU»

Eso es **el build corriendo de verdad**: Rollup analizando ~1900 módulos de la IDE. Es el precio de compilar la IDE dentro del sandbox — y es exactamente lo que pediste que exista para la automejora. En tu máquina se vio al 63 % de CPU; terminado el build, el proceso baja y queda sólo el servidor del preview.

---

## 6. Lo que queda propuesto (no implementado a propósito)

**Que la sincronización sea un ESPEJO**: al sincronizar, borrar en el sandbox lo que ya no está en el editor. Eso mata el problema de raíz. No lo activé automáticamente porque el agente también escribe archivos directo en disco con sus herramientas (`fs_write`): un espejo ciego podría borrar trabajo que sólo existe en el sandbox. La versión segura es la de esta entrega: **limpiar cuando vos lo pidas** (Ctrl + Alt + L) y que el sync reescriba.

---

## 7. Recordatorio de la v1.6.29 (ya incluida acá)

- **`Ctrl + Alt + 0`** → devuelve los dos escalares de tamaño (global y aspecto) y recarga.
- El desplegable **MENÚ CN** ahora tiene altura máxima + scroll: «Paleta de colores» ya no queda fuera de la pantalla.
- Mientras sigas con la v1.6.27 (interfaz gigante): **Chrome ⋮ → Zoom → −** para llegar al menú, y después volvé el zoom a 100 %.
