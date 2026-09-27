# INFORME — SANDBOX v1.6.33 «CONSEJO QUE VOTA»

**Build:** v1.6.32-EVOLUCIÓN → **v1.6.33-CONSEJO-QUE-VOTA**
**Ejes:** D7 (votación real) · catálogo honesto · fuente única de versión en la pestaña «Acerca de».
**Puerta:** `npm run validar` → **3372 comprobaciones, 0 fallos, 63 suites, 0 errores de tipos**
(era 3291/61; +81 comprobaciones, cero regresiones). `npm run build` ejecutado: el `dist/`
de este ZIP lleva TODO dentro — el EXE y `npm start` quedan servidos sin recompilar.

---

## 1. D7 — EL CONSEJO VOTA DE VERDAD (el ROADMAP decía «5 sin rama»; eran 16 a Ayuda)

`DUEÑO_DE` solo tenía ramas para 6 acciones. El clasificador (`cerebroReflejo.pensar`) emite
**22** `orden.tipo`: las 16 de Reflejo v3.0 (`analizar`, `explicar`, `resumir`, `comparar`,
`listar`, `ordenar`, `filtrar`, `contar`, `buscar`, `testear`, `documentar`, `refactorizar`,
`optimizar`, `traducir`, `instalar`, `desplegar`) caían **todas** al `|| "ayuda"`. El Lingüista,
el Investigador y el Validador no recibieron un voto jamás; la sesión lo registraba como
«resuelto por Ayuda».

**Ahora** (`src/engine/votacionConsejo.ts`, fuente única + `tests/consejoVotacion.test.ts` 40/40):
* **9 asientos reciben voto real** (antes 6) + Ayuda como **portavoz** del silencio = 10 voces.
* Reparto honesto por dominio: L ingüista ← analizar/explicar/resumir/comparar/listar/ordenar/
  filtrar/contar · Investigador ← buscar · Validador ← testear · Operario ← documentar/
  refactorizar/optimizar.
* **Se declaran los que NO votan**: telemetría y memorista (aportan herramientas —
  `maq.*`, `memorista.registrar`—, no disputan frases). Y las 3 acciones sin especialista
  (`traducir`, `instalar`, `desplegar`) se nombran con su motivo en vez de disfrazarse.
* `pensarConsejo` atribuye por el reparto y devuelve el MOTIVO del voto; `estadoConsejo()`
  expone `voto_por_frase` por especialista y el bloque `reparto`. La cabecera del módulo
  (que prometía «12 votantes») quedó corregida.

## 2. CATÁLOGO HONESTO — 100 «activas» eran 31 verificadas + 69 en el mapa

`skills100.ts` marcaba las 100 como `active` y `contextCache` las volcaba ENTERAS al prompt:
el modelo le decía al usuario que existían YOLO local, Wasm, JWT RS256, Protobuf o Prettier
porque **se lo leía de su propio manual**.

**Ahora** (`src/engine/catalogoHonesto.ts` + `tests/catalogoHonesto.test.ts` 32/32):
* Cada capacidad activa apunta a **evidencia real** (31 ids → ficheros del repo que existen;
  el test lo comprueba con `fs.existsSync`, así la mentira no sobrevive a un refactor).
* El SKILLS.md inyectado tiene **dos bloques con nombre verdadero**: `ACTIVA (evidencia: …)` y
  `MAPA (aspiracional — NO afirmar que existe)`, con la orden explícita de no ofrecer lo segundo.
* Los huecos del roadmap quedaron clavados como pendientes por test: visión/OCR, Wasm, Git
  diffs, merge, YOLO, ×100, Protobuf, JWT, Prettier.
* El texto viejo («Catálogo de 100 Habilidades», «declara 100 capacidades operativas») ya no
  existe en el prompt (regresión en el test).

## 3. LA PESTAÑA «ACERCA DE» (reporte con captura)

La pestaña del navegador decía `V1.6.31` y el panel **`CerebroNico IDE v2.0.0`**: `App.tsx`
le pasaba `version="2.0.0"` y el panel traía default `"1.8.0"`. Era la ÚLTIMA fuente paralela
de versión del defecto que la casa ya había cazado en la cabecera (D5).

**Ahora**: la prop se retira, el panel lee `IDE_BRAND` (nombre + `VERSION` + `AUTHOR`) y muestra
**«CerebróNico V1.6.33 · IDE»**. De la misma familia, y también derivados de la marca: el README
semilla del workspace y el README/manifiesto de los paquetes `.cn` (que firmaban «CerebroNico IDE
v1»). Regresión añadida al suite de versión única (`motor-datos`: 78/78).

Verificado sobre el bundle servido: `dist/index.html` → `V1.6.33`; el literal `CerebroNico IDE v`
bajó de 3 a **1** (queda solo la etiqueta legítima de formato legacy al leer `.cn` viejos) y
`v2.0.0` ya no aparece. `node --check dist/server.mjs` OK.

## 4. Ficheros

| Fichero | Qué |
|---|---|
| `src/engine/votacionConsejo.ts` | **nuevo** — reparto único de votos (23 acciones) |
| `src/engine/catalogoHonesto.ts` | **nuevo** — auditoría por evidencia + SKILLS.md honesto |
| `src/engine/reflejo/consejo.ts` | DUEÑO_DE derivado, atribución con motivo, estado con reparto |
| `src/utils/contextCache.ts` | inyecta el catálogo auditado (adiós al volcado de 100) |
| `src/components/ProConfigPanel.tsx` | «Acerca de» lee IDE_BRAND (sin prop de versión) |
| `src/components/RightSidebar.tsx` | import muerto de skills100 retirado |
| `src/utils/fileParser.ts`, `src/App.tsx` | README semilla y paquete `.cn` firmados con la marca |
| `tests/consejoVotacion.test.ts`, `tests/catalogoHonesto.test.ts` | **nuevas** (40 + 32) |
| `tests/motor-datos.test.ts` | +9 aserciones de versión visible |
| `scripts/validar.mjs` · `constants.ts` · `package.json` · `index.html` · `dist/` | registro y versión **1.6.33** |

## 5. Límites declarados

* El curado del catálogo es humano **verificado por test**: si un fichero de evidencia
  desaparece, la suite lo denuncia; pero las 69 aspiracionales siguen siendo mapa, no producto.
* La etiqueta `CerebroNico IDE v1 (legacy JSON)` de `fileParser` se conserva a propósito:
  describe archivos viejos, no la app.
* Sin tocar (siguiente ronda): **D9** (auto-lección al recuperar un error), **Git nativo**,
  `instalar/desplegar` sin especialista (hoy declarado), y la votación de las acciones
  genéricas aún sin ejecutor real en `planExecutors` (hoy atribuyen y se registran).
