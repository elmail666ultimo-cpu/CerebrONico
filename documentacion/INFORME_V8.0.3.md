# INFORME V8.0.3 — MINIATURA DE ADJUNTOS · ESTADO DEL SANDBOX

> Dos peticiones, tres defectos reales, y todos del mismo tipo: **cableado roto**.
> Ni uno solo era un problema de pintado. Eso es información útil: significa que
> el diseño estaba bien y lo que faltaba era conectar las piezas.
> Verificación: **2004 comprobaciones · 0 fallos · 33 suites · 0 errores de tipo**.

---

## 1. «Que se vea la miniatura de la imagen, ahora solo es un icono»

### 1.1 El defecto visible

El chip del adjunto **ya tenía la imagen al lado y no la usaba**:

```tsx
// ChatCenter.tsx, antes
{isImg ? <ImageIcon className="w-3.5 h-3.5 text-pink-400" /> : …}
```

`AttachmentItem.base64Data` contiene el data URL completo desde siempre. El
comentario era «un icono de 14 px». Con tres adjuntos da igual; con veinte el
usuario tiene veinte iconos rosa idénticos, y el nombre no ayuda: un archivo
llamado `captura-20260922-143045.png` no dice más que el icono.

### 1.2 El defecto de fondo: no se veía NADA hasta el final

Esto es lo que de verdad pedías con «así se puede apreciar qué elemento se está
cargando cuando sean muchas», y no lo había:

```ts
// App.tsx, antes
const newAttachments = [];
for (const file of fileArray) {
  const { attachment } = await processUploadedFile(file);
  newAttachments.push(attachment);       // ← se acumula en local
}
setPendingAttachments((prev) => [...prev, ...newAttachments]);   // ← volcado único
```

Con treinta imágenes, la tira de adjuntos se quedaba **vacía** treinta veces el
tiempo de una, y después aparecían las treinta de golpe. Visto desde fuera eso es
«el IDE se ha colgado», y no había forma de saber **cuál** de los treinta estaba
atascando la cola.

### 1.3 El arreglo

**a) Miniatura de verdad.** Se genera al adjuntar (≤96 px, WebP 0,8) y se guarda
en un campo nuevo `thumbData`. `base64Data` **no se toca**: sigue siendo la
imagen íntegra que se manda al modelo.

> **Por qué no pintar `base64Data` directamente en un `<img>` de 32 px**, que era
> lo barato: el navegador **decodifica la imagen completa** para dibujarla
> pequeña. Treinta capturas 4K son cientos de MB de mapas de bits en memoria y la
> interfaz se arrastra. Una miniatura de 96 px son unos miles de píxeles. Esta es
> la diferencia entre que funcione con tres y que funcione con treinta.

**b) Respaldo en tres niveles, sin huecos negros.** `thumbData` → `base64Data` →
icono. El icono se pinta **debajo** del `<img>`: si la imagen no carga, `onError`
la oculta y reaparece el icono. El fallo degrada a lo que había antes.

**c) Vista previa en grande.** Pulsar la miniatura abre la imagen completa sobre
la interfaz. Se cierra con Escape, con la X o pulsando fuera — las tres, porque
cada una es la que intenta la mitad de la gente.

**d) Cola de «cargando».** Los nombres de todos los archivos entran en pantalla
**antes** de procesar ninguno, como chips fantasma con su nombre y su indicador.
Cada uno se retira en cuanto su miniatura está lista. El contador ahora dice
`4 adjunto(s) listo(s) · 2 cargando…`. Se ve qué falta y qué ya está.

**e) La aritmética vive aparte y se prueba.** `src/utils/miniatura.ts` es puro
(sin DOM), y ahí están las 22 comprobaciones de geometría. `canvas` y `drawImage`
no se pueden probar en Node, y una prueba que no se puede ejecutar no cubre nada:
así que se aísla lo que **decide** y se prueba eso.

---

## 2. «El editor web? hasta ahora no ha funcionado»

Tenías razón, y había **dos** causas encadenadas. La segunda es la que lo hacía
parecer roto para siempre.

### 2.1 El editor web nunca arrancaba el sandbox

En todo el proyecto, el único sitio que llama a `/api/sandbox/start` es el panel
**«Sandbox» de la barra lateral derecha** (`RightSidebar.tsx`). Quien abría «Modo
Web» sin haber pasado antes por ese panel se quedaba con un iframe apuntando a un
puerto muerto (`:3500`) y **ningún botón para arreglarlo desde la pantalla que
estaba mirando**. El editor web no fallaba: le faltaba el paso 1.

### 2.2 El indicador estaba clavado en verde

```tsx
// App.tsx
const [sandboxRunning, setSandboxRunning] = useState<boolean>(true);
```

`setSandboxRunning` **no se llamaba en ningún sitio del proyecto**. Consecuencia:
el editor web recibía siempre «sandbox activo», pintaba el punto en verde y **no
mostraba el aviso** de «el sandbox no está corriendo» — justo el aviso que existía
para explicar el preview en blanco. Un indicador fijo en verde tapando el único
fallo que tenía que anunciar. Eso es peor que no tener indicador, porque el
usuario descarta la causa correcta *porque la interfaz le dijo que no era esa*.

### 2.3 El arreglo

| Qué | Antes | Ahora |
|---|---|---|
| ¿Quién arranca el sandbox? | Solo el panel lateral | El editor web, solo, al abrir la pestaña |
| ¿Quién sabe si está vivo? | Nadie: valor fijo `true` | La vista lo **pregunta** a `/api/sandbox/status` |
| Punto de estado | Verde siempre | Verde / ámbar (comprobando, arrancando) / rojo |
| Preview en blanco | Rectángulo blanco mudo | Aviso con el **motivo del motor** + botón «Arrancar sandbox ahora» + «Reintentar» |
| Si el motor no responde | «Activo» | Se declara **NO vivo** |

Detalles que importan:

- **Un solo intento automático por montaje** (`sbAutoIntentado.current`): si el
  arranque falla, no se entra en bucle de arranques. Se reintenta a mano.
- **Confirmación anti-recursión**: el motor pide confirmación explícita cuando el
  proyecto ES la propia IDE; se maneja igual que en el panel lateral.
- **Al arrancar, se refresca el iframe**, porque ya tenía dentro el error de
  conexión anterior y si no seguiría en blanco con el servidor ya vivo.
- **Sondeo cada 6 s** y valor inicial `false`. Se elige 6 s (y no 10 como la
  telemetría) porque el sandbox se para y se arranca a mano, y un indicador que
  tarda 10 s en reflejarlo hace que el usuario pulse «Arrancar» dos veces.
  Empezar en `false` es deliberado: es más honesto arrancar en «no» y corregir
  cuando responda, que arrancar en «sí» y no corregir nunca.

> **Nota de disciplina:** las dos peticiones de hoy eran el mismo error con dos
> disfraces — una pieza existía y nadie la usaba. Es exactamente lo que el
> proyecto ya se había encontrado con `IDEBRAND.FULL_NAME` (dos literales que se
> contradicen), con la semilla del motor (dos listas) y con la lista de modelos
> con herramientas (dos listas blancas). Cuando algo se «arregla» y sigue igual,
> la primera pregunta ya no es *qué falta*, sino **quién tenía que llamarlo y no
> lo llama**. El compilador no ve ninguna de estas cuatro cosas.

---

## 3. Evidencia

```
npx tsc --noEmit ...................... 0 errores
npm run validar ....................... 2004 comprobaciones · 0 fallos
                                        33 suites ejecutadas · 0 sin correr
tests/interfaz.test.ts ................ 64 correctas · 0 fallidas   (nueva)
tests/contenedor.test.ts .............. 161 correctas · 0 fallidas
```

`tests/interfaz.test.ts` comprueba, entre otras cosas, que **`setSandboxRunning`
sí se llama** y que el aviso depende del **estado medido** y no de la prop. Es
decir: la prueba falla si alguien vuelve a clavar el indicador en verde.

Dos comprobaciones nacieron de fallos míos durante esta sesión, y se quedan
porque documentan un borde real:

1. `esVideoPorFirma` exigía 12 bytes y devolvía «no es vídeo» para un **WebM**
   corto (EBML solo necesita 4). Se cazó al probar.
2. La denuncia de «archivo renombrado» se apoyaba en la **familia** del formato, y
   eso marcaba como sospechoso **todo `.docx` legítimo** (que es un ZIP por
   dentro, familia `documento`, no `paquete`). Ahora se enumera por ID.

---

## 4. Límites honestos

- **La miniatura no se prueba en el navegador**: `canvas` no existe en Node. Lo
  probado es la geometría; el `drawImage` solo se puede comprobar a ojo abriendo
  el IDE. Si un formato exótico no se puede dibujar en canvas, el chip cae al
  icono — está previsto, pero no verificado por prueba.
- **No he podido arrancar tu sandbox** desde aquí para ver el preview con mis
  ojos. Lo verificado es que la vista pregunta, arranca y explica; el resultado
  final del iframe depende del proyecto que tengas en `.proyectos`.
- **El MP4 del cerebro sigue sin ser preset de menú** (va por el camino FONDO v1,
  `/api/fondo`). Sigue pendiente de la entrega anterior.
- Sigue pendiente, y no lo doy por hecho: **el estudio de actualización en
  caliente / servidores locales en tiempo real** que se interrumpió.
