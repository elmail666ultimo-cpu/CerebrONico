# INFORME — v1.6.29 «RESCATE UI»

**Build:** v1.6.28-AUTOMEJORA → **v1.6.29-RESCATE-UI**
**Reporte:** «no me deja llegar hasta la paleta para regular el tamaño ni acceder al menú, tocaste otra cosa».

---

## 1. Primero lo que reportás: ¿lo toqué yo?

**No. Y no lo digo de memoria: lo verifiqué con hashes.** Comparé, byte a byte, el ZIP que vos subiste (v1.6.24) contra el mío (v1.6.28):

| Archivo | Resultado |
|---|---|
| `dist/assets/index-DbdYG4zO.css` (todos los estilos) | **idéntico** |
| `dist/assets/index-LSc9Okxh.js` (todo el cliente React) | **idéntico** |
| `dist/index.html` | **idéntico** |
| `src/App.tsx` · `src/components/Header.tsx` · `RightSidebar.tsx` · `PanelAspecto.tsx` · `src/engine/aspecto.ts` | **idénticos** |

Mis parches (v1.6.25 → v1.6.28) tocaron **sólo el motor**: `server.ts` → `dist/server.mjs`, `src/engine/viaRapidaPreview.ts`, la versión, y el bloque del sandbox anidado. La interfaz no se recompiló nunca: la que ves es la que vos compilaste.

Y el defecto ya estaba en la captura de la v1.6.25 (dos turnos atrás): mismo menú gigante, mismas entradas cortadas. Lo único mío que ves en pantalla es el número de versión del encabezado.

---

## 2. Por qué es un callejón sin salida (la causa, en el código)

El desplegable **MENÚ CN** ([Header.tsx:278](ide/backend/src/components/Header.tsx:278)) es:

```html
<div class="absolute left-0 top-full mt-1 w-72 … z-[100] overflow-hidden">
```

- `w-72` = **18 rem**. Con el tamaño global a 25 px, eso son **450 px de ancho** y una lista de ~780 px de alto en una ventana de 768.
- `overflow-hidden` **sin `max-height`**: lo que sobra **no se puede scrollear**, queda fuera de la ventana.
- Las últimas entradas —**«Paleta de colores»**, «Configuración PRO»— son justo las que quedan afuera.
- Sin llegar a la paleta no hay forma de bajar la escala, y el selector de tamaño del encabezado también queda fuera de alcance. **Por eso no podés salir desde la interfaz.**

Son dos escalas independientes y las dos se guardan: `codigo0_app_font_size` (11–25 px) y `cn.aspecto.v1` (70–220 %).

---

## 3. Cómo salir AHORA (con la v1.6.27 que estás corriendo)

En orden, de la más rápida a la más definitiva:

1. **Zoom del navegador hacia afuera, desde el menú ⋮ de Chrome → Zoom → −** (dos o tres pasos).
   La app captura `Ctrl + rueda` y `Ctrl + 0`, pero **no** puede interceptar el menú de Chrome: al 67–80 % el menú CN entra completo en la pantalla y podés llegar a **«Paleta de colores» → «Restablecer todo»**. Después volvés el zoom a 100 %.
2. **`Ctrl + 0`** → devuelve el **tamaño global** a 15 px (sólo ese escalar).
3. **Consola** (F12 → Console) si los dos escalares están altos:

```js
localStorage.removeItem('codigo0_app_font_size');
localStorage.removeItem('cn.aspecto.v1');
location.reload();
```

---

## 4. Lo que agrega esta versión (para que no vuelva a pasar)

Dos piezas, en `index.html` y `dist/index.html` — **ahí y no en el bundle minificado**, porque el cliente se sirve compilado y meter mano en 1,4 MB de JS minimizado sería peor que no hacer nada:

1. **CSS — el desplegable siempre entra:**

```css
header[data-cn="cabecera"] .absolute.left-0.top-full.mt-1.w-72 {
  max-height: calc(100vh - 6rem) !important;
  overflow-y: auto !important;
}
```

2. **Rescate de escala**, que devuelve **los dos** escalares y recarga:
   - **`Ctrl + Alt + 0`** (atajo nuevo, no pisa el `Ctrl+0` existente);
   - o abrir `http://localhost:3000/?cn-escala=reset`.

Ninguna de las dos cambia la escala por su cuenta: sólo actúan cuando las pedís.

Verificado: el bloque `<script>` extraído pasa `node --check`; el selector coincide con las clases reales del menú; `dist/index.html` sigue bien formado (1 `<head>`, 1 `</head>`, `#root`, y su `/assets/index-LSc9Okxh.js` intacto).

---

## 5. El arreglo de fondo (para tu próximo `npm run build`)

Lo de arriba es una red de seguridad, no la cura. En el fuente, cuando compiles el cliente:

- `Header.tsx:278` → añadir `max-h-[calc(100vh-5rem)] overflow-y-auto overscroll-contain`.
- `Header.tsx` → **Esc cierra el menú CN** (hoy sólo cierra PRO, el modal de API key y el selector de modelo; el menú CN se cierra únicamente con clic afuera).
- `App.tsx` → **topar la escala global según la ventana** (p. ej. no permitir > 20 px por debajo de 1100 px de ancho) para que la interfaz nunca pueda quedar inalcanzable.
- Opcional: dejar siempre visible el control de tamaño (aunque el encabezado se parta en dos filas).

---

## 6. Sigue pendiente de la v1.6.28

El ciclo de automejora quedó funcionando (reformar → arrancar → recompila → preview), pero **no pude verificar el `vite build` completo de la IDE dentro del sandbox**: es el único eslabón que necesita tu máquina. Si querés cerrarlo:

```bat
cd C:\Cerebronico\ide\backend
npm run build
```

Las primeras 10 líneas de esa salida son la causa exacta.
