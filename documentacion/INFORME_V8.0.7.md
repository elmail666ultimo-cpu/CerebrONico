# INFORME V8.0.7 — EL ESPEJO DEL PROYECTO, EL ÁRBOL Y EL APLANADO

> Tres peticiones de esta tanda, tres causas raíz, y una sola idea detrás de las
> tres: **el motor no tenía forma de saber qué le falta.**
> Verificación: **2244 comprobaciones · 0 fallos · 36 suites · 0 errores de tipo**.

---

## 1. «No aplana bien y no encuentra los archivos» — LA CAUSA

`buscarProyectoAnidado`, el resolvedor de raíz y el buscador de copias tenían
todos la misma línea:

```js
if (e.name.startsWith(".") || skip.has(e.name)) continue;
```

Saltarse las carpetas que empiezan por punto parece prudente. Aquí es **justo lo
contrario**, porque **los caminos de este proyecto empiezan por punto**: la
carpeta contenedora se llama `.proyectos`. Al sincronizar, el árbol cae dentro de
`.proyectos/<algo>/…`, y `<algo>` puede ser otra vez `.proyectos`.

Encaja línea a línea con tu registro:

| Lo que veías | Lo que pasaba |
|---|---|
| «1 archivo(s) escrito(s) en .proyectos/» | El sync escribía de verdad |
| «No se encontró ningún marcador reconocido» | El detector **descartaba por el nombre** la carpeta que lo contenía, antes de mirar dentro |
| «No aplana bien» | El aplanador usa la misma función → nunca encontraba la copia anidada |
| «Y no encuentra los archivos» | Por lo mismo |

**Arreglo:** se ignora por **lista** (artefactos y `.git`), no por prefijo. Un
punto en el nombre no es un criterio.

**Añadido:** cuando hay un proyecto en la raíz **y además** uno anidado, el motor
lo dice. Es el caso en que todo parece bien y el preview sigue enseñando lo
viejo: el marcador de la raíz tiene prioridad, el sync sigue escribiendo en la
subcarpeta, y el usuario no ve nada raro.

---

## 2. «Se suman archivos que no van en el empaque»

Fui a mirar `generateCnFile` antes de escribir nada. Empaquetaba así:

```ts
for (const file of files) {
  if (file.path && typeof file.content === "string") {
    zip.file(file.path, file.content);      // ← todo
  }
}
```

**No es que la lista estuviera corta: no había lista.** Cualquier cosa con nombre
y contenido entraba: un `.env`, un `debug.log`, el `node_modules` completo, o la
copia espejo de `.proyectos/`.

### El veredicto tiene TRES valores, y ése es el punto

Un filtro de dos categorías (entra / no entra) decide por el usuario y no se lo
dice — el mismo pecado que no tener filtro. Así que:

| Veredicto | Qué es | Qué hace el motor |
|---|---|---|
| `incluir` | código, configuración, documentación del proyecto | nada que preguntar |
| **`preguntar`** | **imágenes, datos, documentos, extensión desconocida** | **para y pregunta, con la lista** |
| `prohibido` | secretos, artefactos, efímeros, espejo, rutas absolutas | no entra **ni con permiso** |

**`preguntar` es la categoría que antes no existía, y es la que pediste.** Preguntar
por un `.ts` sería ruido, y el ruido enseña a ignorar las preguntas.

Los `prohibido` no entran nunca porque el daño **no se deshace**: un `.env`
empaquetado y enviado ya está filtrado. Y no se excluye en silencio: lo excluido
queda **registrado en el manifiesto** con su motivo. El manifiesto además ya no
declara un `fileCount` falso (contaba la entrada, no el contenido) ni una versión
`v1` del IDE que sobrevivió a ocho versiones.

**Matiz que casi se pierde:** `package-lock.json`, `yarn.lock` y `Cargo.lock` **sí
viajan** — son ficheros de verdad del proyecto. Sólo se descartan los `.pid`, que
son señal de un proceso vivo.

### Y el modelo ahora lo tiene por ley

El proceso está en los **guardrails** de `cerebro.md` (que se inyectan siempre,
también en modelos diminutos) y en la base de datos del motor como entrada `rule`.

---

## 3. «Siempre se olvida de los archivos de un proyecto» — EL ESPEJO

### 3.1 El diagnóstico correcto, que no era el que parecía

«Se olvida de los archivos» **no describe un error de escritura**. El modelo
escribe bien las líneas que escribe. Lo que pasa es que **no sabe cuántos archivos
tiene un proyecto de ese tipo**: escribe los dos que tiene en la cabeza y da el
trabajo por terminado. De ahí un `index.html` que enlaza `styles.css`… y
`styles.css` no existe.

**Y eso explica el síntoma de antes mejor que ninguna otra hipótesis:** una web de
tres archivos con sólo el primero escrito **se ve exactamente en blanco**. El
previsualizador blanco y «se olvida de los archivos» eran el mismo problema.

### 3.2 Por qué un espejo y no una lista en el prompt

Una lista pegada en el prompt se lee una vez y se diluye entre mil instrucciones.
Un **espejo se coteja**: produce una respuesta binaria —falta / no falta—, que es
justo lo que un modelo pequeño sabe usar. La diferencia práctica es la que hay
entre decirle «acuérdate de los archivos» y enseñarle «te faltan estos dos».

### 3.3 Cinco plantillas, y «obligatorio» significa algo

| Plantilla | Conjunto mínimo |
|---|---|
| **web estática** | `index.html` + `styles.css` + `script.js` |
| **Vite + React + TS** | `package.json` + `vite.config.ts` + `tsconfig.json` + `index.html` + `src/main.tsx` + `src/App.tsx` |
| **Servidor Node** | `package.json` + `server.js` |
| **API FastAPI** | `requirements.txt` + `app/main.py` + `app/__init__.py` |
| **Script suelto** | `index.js` |

**Obligatorio = sin él no arranca o no se ve.** No es «recomendado» disfrazado: un
`README.md` no es obligatorio, y no lo voy a llamar así — si todo es obligatorio,
nada lo es.

El espejo marca lo presente con `[x]` y lo ausente con `[ ]`, distingue
(obligatorio) de (opcional), y cuando faltan obligatorios lo dice sin rodeos:
`FALTAN 2 ARCHIVO(S) OBLIGATORIO(S): styles.css, script.js`.

### 3.4 Implantado, no sólo escrito

- **Base de datos del motor:** entrada `rule-espejo-proyecto` con los conjuntos de memoria.
- **Ley del motor:** proceso en `cerebro.md` § guardrail 8, dentro de lo que se inyecta siempre.
- **En vivo:** `GET /api/proyecto/espejo` coteja el sandbox real y devuelve la pregunta ya redactada. Lectura acotada (profundidad 5, 600 entradas) porque un cotejo que se atasque en un `node_modules` de 40.000 archivos no lo usaría nadie.

---

## 4. Tres defectos míos que cazaron las pruebas (y se quedan documentados)

1. **`service-account.json` se colaba** como secreto por un guion: la lista decía
   `serviceaccount`. Un secreto que se cuela por un separador es exactamente la
   clase de fallo que esa lista existe para evitar.
2. **Una regla del motor desbordó a otra.** La entrada del árbol llevaba cuatro
   claves que contenían «archivo»; la consulta «borrar un archivo del usuario sin
   permiso» sumaba 1,0 por cada una y **desplazaba a la regla de acciones
   destructivas**. Una palabra común repetida en cuatro claves no refuerza:
   desborda.
3. **`marcadores` significa «todos presentes», y yo había puesto los tres del
   script suelto.** Ningún script suelto se reconocía: habría hecho falta tener
   `index.js`, `main.py` y `app.js` a la vez.

---

## 5. Evidencia

```
npx tsc --noEmit .................... 0 errores
npm run validar ..................... 2244 comprobaciones · 0 fallos · 36 suites
tests/espejo.test.ts (nueva) ........ 66 correctas · 0 fallidas
tests/arbol.test.ts (nueva) ......... 99 correctas · 0 fallidas
tests/consola-voz.test.ts ........... 75 correctas · 0 fallidas
```

---

## 6. Qué sigue pendiente, sin adornos

- **La X de cerrar** en toda ventana/pestaña, y **separar el chat del reproductor**
  (divisor arrastrable o ventana independiente: falta que me digas cuál).
- **La lentitud del sandbox**: ahora el log dice la ruta absoluta y qué archivos
  hay. Con eso se puede medir; aún no lo he medido.
- **El estudio de actualización en caliente** que se interrumpió.
- **El espejo no se inyecta todavía solo en el prompt** en cada llamada: está en
  la ley y en la base de datos (se recupera por consulta) y hay endpoint para
  cotejar. Lo siguiente sería que el servidor lo meta automáticamente en el
  contexto cuando detecte el tipo de proyecto. Es media hora y no lo he hecho.
