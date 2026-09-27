# PUENTE: LENGUAJE Y MEDICIÓN

> Respuesta a la propuesta de Rust / WASM / C con FFI.
> **Todo lo que sigue está MEDIDO, no argumentado.** El programa está en
> `ide/backend/tools/puente-bench/demo.c` y se compila con el `gcc` que ya hay.

---

## 1. Ejecuté la demo propuesta. No mide lo que dice medir.

No hay `rustc` en este entorno, así que traduje la demo de Rust a C **manteniendo
su estructura y sus tiempos exactos** (1 ms / 30 ms de conexión, 4 ms / 20 ms de
«streaming», cuatro fragmentos) y la ejecuté. Esto es la salida real:

```
============================================================
 A) LA DEMO TAL CUAL SE PROPUSO (el sleep va antes de devolver)
============================================================
--- [MODO LOCAL (RAM/IPC)] ---
[Metrica] Handshake / Conexion: 1.07 ms
[Metrica] Latencia al Primer Token (TTFT): 4.07 ms
[Metrica] Ciclo total: 5.15 ms          ← TTFT es el 79 % del total

--- [MODO CLOUD (WebSocket)] ---
[Metrica] Handshake / Conexion: 30.07 ms
[Metrica] Latencia al Primer Token (TTFT): 20.07 ms
[Metrica] Ciclo total: 50.14 ms         ← TTFT es el 40 % del total
```

**Mírese la firma del problema: TTFT ≈ duración completa del «streaming».** El
número impreso es, con dos decimales, exactamente el `sleep` (4,07 y 20,07). No es
una latencia de primer token: es la latencia **del lote entero**.

### La causa está en la firma de la función

```rust
fn stream_response(&mut self, payload: &[u8]) -> Result<Vec<Vec<u8>>, &'static str>
//                                                ^^^^^^^^^^^^^^^^
```

Esa función **devuelve un `Vec` con todos los fragmentos ya construidos**. Eso no
es un stream: es una lista. El `thread::sleep` va **antes de devolverla**, así que:

1. Nadie recibe nada hasta que están los cuatro fragmentos.
2. El bucle que mide el TTFT recorre un array **ya completo**.
3. Por eso `ttft` sale igual al `sleep` y el total casi igual al TTFT.

**Consecuencia práctica, y es la que importa:** esta demo imprimiría números
bonitos y **sería incapaz de distinguir un puente con streaming real de uno que
acumula toda la respuesta y la suelta al final**. Y el puente que acumula es
precisamente el que produce la sensación de «se ha colgado», que es lo que se
quería eliminar. *Un banco que no puede fallar no valida nada.*

### Y la corrección es una sola cosa: entregar por fragmento

```
============================================================
 B) LA MISMA DEMO CON STREAM REAL (callback por fragmento)
============================================================
--- [MODO LOCAL (RAM/IPC)] ---
[Metrica] Latencia al Primer Token (TTFT): 4.07 ms
[Metrica] Ciclo total: 17.29 ms         ← TTFT es el 24 % del total

--- [MODO CLOUD (WebSocket)] ---
[Metrica] Latencia al Primer Token (TTFT): 20.07 ms
[Metrica] Ciclo total: 110.34 ms        ← TTFT es el 18 % del total
```

Mismo lenguaje, misma lógica, mismos tiempos: lo único que cambia es que cada
fragmento sale **al producirse**, por callback. Ahora el TTFT mide el arranque y
**queda por debajo del total**, que es la firma de un stream de verdad.

Nótese que el TTFT **no cambió** (4,07 / 20,07 en las dos partes). Lo que cambió es
que ahora el total es mayor que el TTFT, y por eso los dos números significan algo
distinto. En (A) eran el mismo número dos veces.

---

## 2. Sobre Rust: dónde acierta y dónde no

| Afirmación | Veredicto |
|---|---|
| «Sin recolector de basura → latencia estable» | Cierto que no tiene GC. **Pero las pausas del GC de Node son inferiores al milisegundo**, y el TTFT real de una conversación es de **cientos de milisegundos**, dominado por el cómputo del modelo y la red. Rust no mueve ese número. |
| «Aislamiento de memoria estricto, puente blindado» | Cierto y valioso… **entre procesos**. Dentro de un mismo proceso no hay una ganancia medible para este caso. |
| «Se compila en `.so`/`.dll`/`.dylib` y lo consume cualquiera» | Cierto, y es el argumento bueno. |
| «No interfiere con el sandbox» | Cierto. Pero un módulo TS puro tampoco interfiere con nada: no toca disco ni procesos. |
| «Valida con métricas precisas de milisegundos» | **Falso en la demo mostrada**, y está medido arriba. |

### Dónde Rust sí ganaría, de verdad

**En el hilo de audio.** No por el lenguaje en abstracto, sino por lo que ese hilo
necesita: un hilo de sistema operativo dedicado, con su búfer pre-asignado,
**que nunca se bloquee**. Ése es el equivalente exacto de ASIO, y ahí el no-GC y la
ausencia de asignaciones en caliente sí compran algo real.

**Y no es lo que está frenando nada hoy.** Antes de reescribir en Rust hay que
medir el TTFT real del equipo. Si el número sale en 300 ms y Rust ahorra 1 ms, la
decisión ya está tomada y no hace falta discutirla: el presupuesto está en el
modelo y en la red.

### Y una objeción de coste que sí importa

Aquí hay **`gcc`** (13.3.0, ya instalado) y **no hay `rustc`**. Es decir: la opción
«C estricto con FFI» que se propone **ya está disponible sin instalar nada**, y
Rust exige una cadena de herramientas nueva (compilador, enlaces por plataforma,
binarios por arquitectura) para un módulo que aún no ha demostrado que haga falta.
La demo de arriba se compiló y ejecutó en un segundo con lo que ya había.

*(Regla del proyecto que sigue vigente: no añadir dependencias sin necesidad real.
Añadir Rust no es sólo una dependencia: es un segundo lenguaje en un proyecto de
uno solo, y el día que se rompa habrá que saberlo mantener.)*

## 3. Sobre WASM: hay un límite duro que conviene saber antes de invertir ahí

WASM es atractivo en el papel, pero para **este** objetivo choca con límites que no
son de esfuerzo, son del modelo de ejecución:

- **No puede abrir un segmento de memoria compartida del sistema operativo.** No
  hay `shm_open` ni `mmap` de otro proceso: WASM vive en su memoria lineal y sólo
  ve lo que el anfitrión le importe. O sea, exactamente la pieza «cero copia entre
  procesos» que se busca **no se consigue con WASM**.
- **No hay acceso directo al dispositivo de audio.** Hay que bajar por el anfitrión
  (Web Audio / ALSA), con su búfer, que es justo la capa que se quería saltar.
- **Los hilos necesitan aislamiento de origen cruzado** (COOP/COEP). Sin esas
  cabeceras, `SharedArrayBuffer` no existe y «sin copias» se queda en el nombre.
- Y compartir memoria con JavaScript **en la práctica suele acabar en copias**, salvo
  el caso concreto de un `WebAssembly.Memory` compartido.

Veredicto: WASM es una forma excelente de meter código de otros lenguajes **en el
navegador**, y una mala forma de quitar el socket de en medio. Para el cero-copia
local lo que hace falta es `mmap`/memoria compartida **entre el servidor Node y el
puente Python**, y eso **ni Rust ni WASM lo cambian: es trabajo pendiente y está
listado como tal** en `src/engine/capacidadesPuente.ts`.

---

## 4. Qué queda decidido y qué hay que medir antes de decidir

**Decidido por medición:** la demo propuesta no sirve como banco de pruebas. El
banco de este proyecto ya entrega por fragmento
(`src/engine/puenteIA.ts`, `medirPuente`), descarta el trozo más viejo en vez de
bloquear al productor, y **mide TTFT de verdad** — 91 comprobaciones propias.

**Lo que hay que medir antes de elegir lenguaje:** el TTFT real contra el Ollama
del equipo. Ese número decide solo:

| Si el TTFT real sale… | Entonces |
|---|---|
| ≤ 300 ms | No hay nada que optimizar. El presupuesto está donde debe. |
| 300-800 ms | Se nota, y el trabajo está en el búfer y el transporte, no en el lenguaje. |
| > 800 ms | Hay que buscar **dónde** se va el tiempo antes de reescribir nada. Casi siempre es el modelo o la red, no el bucle. |

**Y sigue pendiente, sin adornos:** el endpoint `/api/puente/medir` que corre ese
banco contra el Ollama real, y el `mmap` Node↔Python. Las dos cosas están diseñadas
y no hechas.

---

## 5. Y ahora la medición que faltaba: ¿cuánto compra cambiar de transporte?

Antes de recomendar reescribir nada en otro lenguaje hay que saber cuánto se puede
ganar cambiando **sólo el canal**. Se midió el coste de ida y vuelta en el mismo
equipo, mismo lenguaje, 3000 repeticiones, mensaje de 51 bytes (el tamaño de un
trozo real), con p50 y p99 — porque en audio lo que se nota son los picos:

| Transporte | p50 | p99 | Frente a TCP loopback |
|---|---|---|---|
| TCP loopback (lo que usa el motor hoy) | 45,08 µs | 64,67 µs | — |
| **Socket de dominio Unix** | **16,42 µs** | 41,12 µs | **63,6 % más rápido** |
| Memoria compartida (`mmap` + `eventfd`) | 31,89 µs | 47,95 µs | 29,3 % más rápido |

Los scripts están en `ide/backend/tools/puente-bench/` y se reproducen con
`python3`.

### El resultado es contraintuitivo, y es el argumento decisivo

**La memoria compartida sale MÁS LENTA que un socket Unix.** No es un fallo del
instrumento: la primera versión de esta medición daba 5.130 µs para el `mmap` y
**ese número sí era falso** — el bucle de espera no soltaba el GIL, así que se
estaba midiendo la pelea por el GIL y no el coste de copiar. Corregido con
`eventfd` (que bloquea y sí suelta el GIL), el resultado es el de la tabla.

El motivo de fondo es hermoso: **en Linux un socket de dominio Unix YA es un búfer
circular en memoria del kernel.** Es decir, el «cero copia entre procesos» que
Rust o WASM venían a habilitar **ya está ahí, implementado por el sistema
operativo, y es más rápido que montarlo a mano** — porque un socket resuelve la
sincronización en el kernel, mientras que el `mmap` a mano paga dos `eventfd` por
vuelta más una copia en espacio de usuario.

### Y la escala, que es lo que cierra la discusión

**Los tres transportes juntos, sumados, no llegan a 1 ms.** Un TTFT real de
conversación se mide en **cientos de milisegundos**.

Es decir: cambiar el transporte de TCP a socket Unix es un cambio de **unas diez
líneas**, no necesita ningún lenguaje nuevo, y captura el 63 % de una partida que
representa **menos del 0,1 % del presupuesto total de latencia**. Reescribir eso en
Rust capturaría una fracción de esa fracción.

### Recomendación, en orden

1. **Socket de dominio Unix** en lugar de TCP loopback para el puente Node↔Python.
   Diez líneas, sin dependencias, +63 %. Es la mejor relación esfuerzo/ganancia de
   toda la lista.
2. **Medir el TTFT real** (endpoint `/api/puente/medir`). Sigue pendiente y es la
   puerta de todo lo demás.
3. **`mmap` en C** sólo si (2) demuestra que el transporte pesa de verdad. En C, no
   en Rust: `gcc` ya está instalado y la superficie de FFI son ~200 líneas.
4. **Rust** sólo si algún día el audio sale del navegador a un hilo nativo
   dedicado. Ahí el no-GC y la ausencia de asignaciones en caliente compran algo
   real. Hoy no es el caso.

### Lo que NO recomiendo, y por qué

**No cambiar «algunos archivos a Rust para aislar las comunicaciones».** Por tres
razones, y la tercera es la que pesa:

1. Las comunicaciones de este motor son HTTP sobre la misma máquina. El coste total
   medido es de **decenas de microsegundos**. No es ahí donde se va el tiempo.
2. **El aislamiento que se busca ya existe**: el puente ya es una interfaz con dos
   implementaciones intercambiables (`PuenteIA`), y Node, Python y el sandbox ya son
   **procesos separados**. Aislar más no es un problema de lenguaje.
3. Y la que más importa en este proyecto: **un módulo Rust quedaría FUERA de
   `validar.mjs` y de las 2395 comprobaciones.** Sería la única parte del sistema
   sin cobertura — justo el punto ciego que llevamos toda la sesión eliminando:
   la suite que no estaba registrada, la prueba que pasaba sin escanear, el
   indicador clavado en verde. **Meter Rust hoy sería crear el siguiente.**
