# INFORME — SANDBOX v1.6.31 «ESPEJO-SYNC»

**Build:** v1.6.30-ARBOL-LIMPIO → **v1.6.31-ESPEJO-SYNC**
**Fallo reportado (evidencia del usuario, 2:10 a. m.):** `npm run dev` arranca Vite bien (14,7 s, :3500 servido) y muere con `[exit 1] (timeout) Command failed: npm run dev`. El iframe queda en blanco «pero no hace nada».

---

## 1. Las dos causas que quedaban, vistas de frente

### 1.1 Un servidor corriendo por la puerta síncrona (el log pegado)

`/api/exec` es un endpoint **con timeout que espera a que el comando termine**. `npm run dev` **no termina nunca**: Vite arranca feliz, sirve :3500… y `runCommand` lo mata al cumplir el timeout. El piloto reintenta → otro cold start de 14 s → otra muerte. El proyecto y sus dependencias estaban perfectos; la puerta era la equivocada. Con `--strictPort`, además, el reintento choca contra el cadáver del puerto.

### 1.2 El árbol mezclado (herencia de v1.6.30 §6, pendiente a propósito)

El sync escribe lo que trae el editor y **nunca borra lo que sobra**. El manifiesto de v1.6.30 lo dijo con números: 185 archivos escritos contra ~317 en disco. Un `languageMemory.ts` viejo + un importador nuevo = Rollup corta el build. §6 descartó el espejo ciego con razón: el agente escribe directo a disco con `fs_write` y un ZIP tampoco pasa por el editor — un `rm` por diferencia los borraría.

## 2. Lo que trae esta versión

| # | Cambio | Por qué es seguro |
|---|---|---|
| 1 | **GUARDA-SERVIDOR-EJEC** (`/api/exec`): comandos de servidor (`npm/pnpm/yarn/npx dev\|start\|serve\|watch`, `vite`, `next dev`, `nodemon`, `node …server…`) **no se ejecutan** aquí. Si el sandbox ya está vivo → `ok:true` con la verdad («ya vive en :3500, no arranques otro»). Si no → rechazo con `usaEnSuLugar: "POST /api/sandbox/start"` y la explicación del timeout. | Ningún flujo legítimo se pierde: la vía gestionada existe desde v2 y es la que el piloto ya usa. |
| 2 | **ESPEJO-SYNC** (`/api/fs/sync`): manifiesto de propiedad en `.cn-sync/manifiesto.json`. Cada sync anota qué escribió (incluidos los **stubs** que él genera). Al terminar, retira solo lo que **un sync anterior escribió y esta tanda ya no trae**. La respuesta trae `retirados` + detalle, y el mensaje lo anuncia. | Lo de `fs_write`, lo del ZIP y lo puesto a mano **jamás aparecen en el manifiesto** → anatómicamente intocables. Segunda capa: `node_modules`, `.git`, `dist`, `.vite`, `.cn-*`, `.cerebro*`, `MEMORIA.md`, `skills.md` protegidos por segmento **a cualquier profundidad** (el test 4 cazó que el prefijo solo-al-inicio dejaba pasar los anidados). Sync con 0 archivos = fallo de transporte, no orden de vaciado: no retira nada ni reescribe el manifiesto. |
| 3 | Motor puro nuevo: `src/engine/espejoSync.ts` + suite `tests/espejoSync.test.ts` (**19/19**). | El disco se inyecta; el diff es determinista y testeable sin tocar filesystem. |

**Sin regresión:** Vía Rápida 64/64 · Dependencias 44/44 · `node --check` OK en `server.ts` y en el bundle. Espejo 1:1 del bundle vía `scripts/parche-sandbox-v1631.mjs` (idempotente). Versión → **1.6.31**.

## 3. Qué hacer ahora

1. Instalar este ZIP sobre la instalación.
2. Un Sync normal: la primera pasada retirará los restos de sesiones anteriores (el log dirá `ESPEJO-SYNC · N archivo(s) obsoleto(s) retirado(s)`). No hace falta Ctrl+Alt+L.
3. «Arrancar». Si algo (piloto o agente) intenta `npm run dev` por la terminal, recibirá la puerta correcta en el mensaje en vez de una muerte por timeout.

## 4. Límite conocido (honestidad)

El espejo cura el «sobra código viejo»; **no** cura el «falta código» — si el editor solo tiene 185 de 317 archivos, al proyecto le faltarán piezas (el clasificador de v1.6.30 ya lo detecta con `Could not resolve`). La salida para ese caso sigue siendo reimportar el proyecto completo sobre workspace vacío.
