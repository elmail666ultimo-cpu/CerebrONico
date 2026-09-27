# RECORDATORIUM — CerebroNico IDE

**Lo que queda por hacer, por qué, y qué desbloquea cada cosa.**
Documento vivo. Se escribe el 18 de septiembre de 2026, tras dejar el motor
validado en 617 comprobaciones y 0 fallos.
Actualizado el 19 de septiembre de 2026: **812 comprobaciones · 0 fallos**
y **el comprobador de tipos ya va DENTRO del veredicto** (0 errores; antes fallaba con 25).
Cada lección de §21 es ahora una prueba que falla sola si el fallo se repite — ver §22.

> Este documento existe porque un pendiente apuntado en la cabeza dura días, y uno
> escrito dura años. Y porque **cada punto lleva su motivo**: sin el motivo, dentro
> de tres meses nadie sabrá si se puede cambiar o si estaba así por algo.

---

## 1. Expansión por hardware: qué desbloquea cada tramo

El motor ya está construido para **MR#4 (32 GB)** aunque la máquina de hoy sea
menor. Pasar de tramo no requiere tocar código: se detecta solo; el botón ×N y el
selector de tramo fuerzan lo que haga falta.

| Al llegar a | Se desbloquea | Qué cambia de verdad |
|---|---|---|
| **MR#3 · 16 GB** | Ejecutar generador y verificador grandes a la vez | Dos tareas de cálculo simultáneas (hoy 1). Contexto por tarea de 8 192 en vez de 4 096: el modelo ve más archivos sin recortar |
| **MR#4 · 32 GB** | El flujo completo sin cuellos de botella | 8 tareas de espera y 3 de cálculo a la vez; contexto de 16 384. Es el tramo para el que está probado el planificador |
| **Más núcleos** | Repartir cálculo de verdad | El reparto de CPU está limitado a `núcleos − 1`. Con 8 núcleos pasan a 7 tareas de cálculo simultáneas |
| **GPU con VRAM** | Modelos mayores sin cuantizar agresivo | La elección de modelo por tramo (`modeloRecomendado`) ya está prevista en cada perfil |
| **Disco rápido** | Checkpoints más frecuentes | Hoy se guarda cada 2/3/5/8 tareas según el tramo; es un compromiso con la escritura |

**Regla que no cambia al crecer:** el presupuesto **nunca devuelve 0**. Una máquina
pequeña va más lento, no se niega a trabajar.

---

## 2. Lo que NO arregla más hardware

Conviene dejarlo escrito para no esperar milagros de una compra:

- **El conversor interno NO porta la aplicación a otro sistema operativo.** Convierte
  *datos* (JSON ↔ YAML ↔ TOML ↔ CSV). Son dos cosas distintas: empaquetar para otro
  sistema es cosa del empaquetador y de su cadena de compilación.
- **Son dos cosas distintas, y conviene no mezclarlas:**
  1. **CerebroNico en Android** — el motor vive en el PC (Ollama), así que esto
     sería una **ventana al PC por LAN** (de ahí el «Modo LAN»). No está hecho.
  2. **Exportar a Android la app que creas con CerebroNico** — esto **SÍ está
     hecho** (§17 del MEMORANDUM): `GET /api/export/targets` y
     `POST /api/export/android/prepare`, con envoltorio Capacitor.
  Y el suelo está fijado con fuente: **Android 7 (API 24)**. Android 4.4.2 (API 19)
  y Android 6 (API 23) quedan por debajo, y además el bundle sale con JavaScript
  moderno (React + Vite), que el WebView de 4.4.2 no ejecuta.
- **La RAM no arregla una promesa falsa.** Si el catálogo dice que hay 100
  habilidades activas y 92 no existen, el problema no es el hardware.

---

## 3. Pendientes, en orden de valor

| # | Pendiente | Por qué | Estado |
|---|---|---|---|
| 1 | ~~La cadena chat → conversor → editor → preview~~ | **HECHA** el 18-sep: el modelo emite `cerebronico:convertir` y el IDE convierte, deja el archivo en el editor y refresca el preview. Verificado en vivo (§19). **El editor y el preview ya funcionaban**; lo que faltaba era el conversor | Lista |
| 1b | ~~Que el chat pueda crear un plan del cerebro~~ | **HECHO** el 19-sep: el modelo emite `cerebronico:plan` y el IDE crea el plan, lo lanza y trae al frente el Planificador. Se valida con el MISMO `validarPlan` del motor. Ver §20 | Lista |
| 1c | ~~Guardar el motivo de la degradación en el log~~ | **HECHO** el 19-sep: la línea del log se escribe sólo cuando el reparto cambia y lleva el motivo dentro (`DEGRADADO · MOTIVO: …`). Antes decía «(ver motivos)» y los motivos se calculaban en vivo, así que al acabar el plan la razón se había perdido (§21.8) | Lista |
| 1d | ~~El proyecto no compilaba limpio~~ | **HECHO** el 19-sep: `npm run lint` pasaba de 25 errores a **0**, y en el camino aparecieron **7 fallos silenciosos** (aprendizaje muerto, guardián que no bloqueaba, diagnóstico que mentía, 3 botones rotos, el editor web a medias…). Ver §21 | Lista |
| 1e | ~~El veredicto del proyecto podía mentir~~ | **HECHO** el 19-sep: **una suite que reventaba hacía que `validar` dijera «TODO CORRECTO» con salida 0** (miraba sólo las comprobaciones fallidas, y una suite que no arranca no imprime ninguna). Arreglado y probado con una suite fantasma. Ver §22.3 | Lista |
| 1f | ~~Las lecciones vivían sólo en un documento~~ | **HECHO** el 19-sep: convertidas en guardián real (`tests/resiliencia.test.ts`, 24 pruebas) + el comprobador de tipos dentro de `validar`. Cada regla se prueba CONTRA UN CASO MALO, o sería un guardián que no guarda. Ver §22 | Lista |
| 2 | ~~Panel visible del planificador~~ | **HECHO** el 18-sep: pestaña «Planificador» con estado por tarea, motivo de cada espera, botón ×N, selector de tramo, cancelar/reanudar, creador de planes y divisor arrastrable. Ver §18 del MEMORANDUM | Listo |
| 3 | **Honestidad del catálogo** (`skills100.ts`) | 92 entradas marcadas `active` sin implementación, inyectadas TODAS al modelo. Y la nº 37 promete lo imposible | Decisión de producto |
| 4 | **Permisos de herramientas** | Un plan en segundo plano ejecutando comandos arbitrarios necesita diseño propio. Hoy sólo hay `modelo`, `leer_archivo` y `convertir`, a propósito | Decisión de producto |
| 5 | **Instalador y portable firmados** | `npm run dist` ya genera NSIS + portable x64. Falta firma de código para evitar avisos de Windows | — |
| 6 | **Exportación a Android de las apps creadas** | Ya existe el diagnóstico y la preparación (Capacitor, suelo API 24). Falta **ejecutar los 6 pasos** desde la interfaz y firmar el APK | Motor listo, falta botón |
| 7 | **Prioridad de los manuales en la puntuación** | Nuevo (§21.7). `TABLE_PRIORITY` no tiene entrada para la tabla `manual`, así que los ~20 manuales del motor se puntúan **0.5, por debajo de todas las demás categorías** (la más baja es `lesson`, 0.6). Subirlos cambia qué conocimiento entra en el contexto del modelo: es decisión de producto. **El tipo ya está bien; el número no se ha tocado** | Decisión de producto |

---

## 4. Cómo se comprueba que sigue sano

```bash
npm install
npm run validar     # 812 comprobaciones + tipos · el veredicto único (salida 0 sólo si TODO está bien)
```

Si esa orden se pone en rojo, **no se construye encima**. Ese es el trato.

---

## 5. Lo aprendido, que vale más que el código

- **"Ya existe, lo salto" convierte un residuo en un fallo permanente.** Fue la
  causa de la pantalla en blanco: la raíz tenía un `src/` viejo y el aplanado se
  negaba a pisarlo.
- **Un diagnóstico que sólo corre en una rama del código no es un diagnóstico.**
  El chequeo del espacio de trabajo vivía dentro de un `if (log)` y la ruta que
  importaba nunca lo ejecutaba.
- **`Promise.race(a, b)` ignora el segundo argumento en silencio.** La cancelación
  dejaba de ser inmediata y las tareas que acababan en ese hueco figuraban como
  hechas. Nada avisó.
- **Para cálculo puro y brevísimo, `Promise.all` no acelera: mide 197 ms frente a
  132 ms una tras otra.** Paralelizar sólo sirve cuando hay espera de verdad.
- **Los tests propios también se equivocan.** El único fallo del validador de ida y
  vuelta fue un caso de prueba con YAML inválido: el validador tiene que ser válido
  él mismo antes de juzgar a nadie.
- **Un aviso del comprobador de tipos puede ser un código que no hace nada.** Siete
  de los 25 errores de `tsc` eran funciones escritas, ejecutadas… y muertas: un
  `tokenize` sin importar, un filtro por un campo que no existía, un ternario con 0
  en los dos lados. Silenciarlos sin leerlos habría dejado siete agujeros tapados
  con cinta.
- **Una regla que no se puede probar no está protegida.** El fallo del guardián
  vivía dentro de un endpoint de 6.800 líneas, donde ninguna prueba lo miraba. La
  regla se sacó a una función pura y se cubrió: ahora fallaría ruidosamente.
- **Un guardián con falsos positivos es peor que no tenerlo.** Por eso el blindaje
  NO comprueba llaves en JS/TS: rechazaba 32 de 63 archivos válidos del propio
  proyecto. Quien lea «blindaje de escritura» debe saber hasta dónde llega (§21.10).
- **Un veredicto que no cuenta las suites que NO corren es un veredicto que miente.**
  Si una suite revienta, no imprime «N fallidas»: aporta 0 al contador. Y el verde
  de `validar` tapaba el rojo de la suite. Ahora se cuentan aparte y tumban el
  veredicto. **Contar sólo lo que se ejecutó, y llamarlo «todo», es una mentira
  estadística.**
- **Una regla que sólo se prueba contra el código bueno puede no estar haciendo
  nada.** Por eso cada detector de `resiliencia.test.ts` se ejecuta también contra
  un caso malo metido a propósito. Si sólo se comprueba lo bueno, un no-op pasa
  por guardián — que es exactamente el fallo del guardián de escritura (§22.5).
- **Un guardián que se acusa a sí mismo genera ruido, y el ruido desactiva
  guardianes.** El detector de ternarios se marcaba sus propios ejemplos de prueba:
  se excluye `tests/` de esa regla, con el motivo escrito al lado.
- **«Ya funciona» y «lo he comprobado» no son lo mismo.** En esta misma sesión di
  por bueno un paralelismo leyendo campos que la respuesta del panel no exponía, y
  di por roto un `sync` por leer un número donde esperaba una lista. Las dos veces
  el error fue mío, no del código.

---

*RECORDATORIUM — CerebroNico IDE v2.2 · 18 de septiembre de 2026.*
*Autor del proyecto: Mario Nicolas Quintero. Copyright © 2026.*
