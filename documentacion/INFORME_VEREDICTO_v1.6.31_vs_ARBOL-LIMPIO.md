# INFORME — VEREDICTO: v1.6.30-ARBOL-LIMPIO vs las promesas de v1.6.31

**Entrada analizada:** `Cerebronico-CN-v1.6.30-ARBOL-LIMPIO.zip` (547 archivos, 28.4 MB sin comprimir) + `INFORME_SANDBOX_v1.6.31.md`.
**Método:** periciales **solo de lectura** sobre el ZIP (listado completo + volcado de `ide/backend/server.ts`, 530.117 bytes). Cero escrituras, cero instalación.

---

## 1. Veredicto en una línea

**El ZIP es la base limpia y honesta de v1.6.30 — pero las dos puertas que cura v1.6.31 (GUARDA-SERVIDOR-EJEC y ESPEJO-SYNC) NO están en él.** Instalado tal cual, el `npm run dev` por `/api/exec` sigue muriendo por timeout y el sync sigue sin retirar restos.

## 2. Tabla de evidencia (promesa → prueba → fallo)

| Promesa del informe v1.6.31 | Prueba en este ZIP | ¿Presente? |
|---|---|---|
| Motor `src/engine/espejoSync.ts` | listado de 547 entradas | ❌ no existe |
| Suite `tests/espejoSync.test.ts` (19/19) | 59 tests en `ide/backend/tests/`, ninguno espejoSync | ❌ no existe |
| `scripts/parche-sandbox-v1631.mjs` | parches presentes: v1624, v1624b, v1625, v1626, **v1627 (tope)** | ❌ no existe |
| GUARDA-SERVIDOR-EJEC en `/api/exec` | `server.ts`: 0 coincidencias de `usaEnSuLugar`; los únicos `GUARDA-*` son viejos (RAÍZ v1, D, E, ENOENT) | ❌ |
| Manifiesto de propiedad `.cn-sync/manifiesto.json` + `retirados` | `server.ts`: 0 coincidencias de `.cn-sync` y 0 de `retirados`; los `manifiesto` que hay son los de extensiones v2.0 | ❌ |
| Versión → 1.6.31 | `ide/backend/package.json`: `"version": "1.6.30"` | ❌ |
| `/api/fs/sync` existe (base del mecanismo) | sí hay referencias en `server.ts` | ✅ pero sin espejo-retiro |

## 3. Lo que SÍ está saneado (mérito del ÁRBOL-LIMPIO)

- **Credenciales:** el único `.env` del árbol es `.env.example`. Checklist de `SEGURIDAD_CREDENCIALES.md` pasado a nivel ZIP. ✅
- **Serie documental completa:** `INFORME_SANDBOX_v1.6.24 → v1.6.30`, auditorías V8, `ROADMAP.md`, `audits/`, `build/`. ✅
- **Sandbox a 1.6.30** con sus 59 suites de test y parches hasta v1627. ✅

## 4. Por qué importa (el fallo de las 2:10 a. m.)

El reporte original era: Vite arranca (14,7 s, sirve :3500) y muere `[exit 1] (timeout) Command failed: npm run dev`. Las causas eran (a) servir por la puerta síncrona `/api/exec` y (b) árbol mezclado sin retiro. Ninguna de las dos curas viaja en este ZIP → **quien instale este paquete y pruebe «Arrancar» verá el mismo fallo**.

## 5. Pasos siguientes (elegir uno)

- **A (recomendado):** aplicar sobre esta base el parche v1.6.31 que ya existe en el árbol de trabajo intervenido (`parche-sandbox-v1631.mjs` + motor + suite) y re-empaquetar como `v1.6.31-ARBOL-LIMPIO` verificable. Coste: medio (una sesión con validación).
- **B (cero desarrollo):** si tu instalación ya tiene el arreglo de v1.6.31, el ZIP a repartir es *ese* árbol, no este. Compara antes de sellar.

## 6. Cómo comprobarlo tú mismo, sin gastar créditos

```bash
unzip -l Cerebronico-CN-v1.6.30-ARBOL-LIMPIO.zip | grep -i espejoSync        # vacío = no está
unzip -p Cerebronico-CN-v1.6.30-ARBOL-LIMPIO.zip ide/backend/server.ts | grep -c "usaEnSuLugar"   # 0 = no está
unzip -p Cerebronico-CN-v1.6.30-ARBOL-LIMPIO.zip ide/backend/package.json | grep '"version"'       # 1.6.30
```

---
*Periciales de lectura únicamente; ningún archivo del ZIP fue modificado. Mario: si traes el árbol instalado con el parche v1.6.31 aplicado, arbitro A vs B con huella en un pase.*
