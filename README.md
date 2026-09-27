# CerebróNico v1.0 — backend

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# CerebróNico

> **Autor y propietario:** Mario Nicolas Quintero Marin
> **Copyright © 2026 Mario Nicolas Quintero Marin.** Todos los derechos reservados.
> Versión de paquete 1.3.0 (distribución v3.3 "Refactor").

IDE de alto rendimiento para ingeniería de software autónomo con inferencia local
(Ollama) y aceleración en la nube (Gemini, OpenRouter, servidores OpenAI compatibles).

## Reconocimientos

> **Sin las siguientes herramientas, CerebroNico jamás hubiera sido posible.**
> Este proyecto es, en parte, el resultado del trabajo que estas plataformas hacen
> accesible a cualquiera con una idea y disciplina:

- **[Z.ai](https://z.ai)** — Acceso al modelo GLM-4.5-Flash (gratis, sin tarjeta) que
  permitió prototipar, depurar y validar el motor agéntico sin gastar un centavo.
- **[Z.ai Work / Accio Work](https://z.ai)** — El entorno de trabajo (workbench) sobre
  el que se ensamblaron, probaron y empaquetaron casi todas las iteraciones de la IDE.
- **[Google AI Studio](https://aistudio.google.com)** — Donde se modelaron, midieron y
  afinaron los prompts y los flujos del Cerebro antes de pasarlos al motor local.

> **Mario Nicolas Quintero Marin** reconoce públicamente que estas tres herramientas
> fueron infraestructura crítica del proyecto, no meros complementos. CerebroNico es
> también un homenaje a quiénes las construyeron y las mantienen abiertas para todos.

## Puertos del sistema

| Puerto | Servicio | Descripción |
|--------|----------|-------------|
| 3000 | Frontend + API | UI Vite/React + backend Express (`server.ts`) |
| 5000 | Puente Python | `agent_bridge_5000.py` (shell + python exec) — se auto-inicia |
| 11434 | Ollama | Inferencia local (debes tenerlo instalado aparte) |

## Arranque

**Prerequisitos:** Node.js 18+ y (opcional) Python 3.8+ y Ollama.

```bash
npm install
npm run dev
```

El servidor escucha en `http://127.0.0.1:3000`. En desarrollo, Vite se monta como
middleware; en producción (`NODE_ENV=production`), se sirven los estáticos de `dist/`.

Variables de entorno opcionales:

| Variable | Default | Uso |
|----------|---------|-----|
| `PORT` | `3000` | Puerto del servidor principal |
| `HOST` | `127.0.0.1` | Bind address (usa `0.0.0.0` + `ACCESS_TOKEN` para LAN) |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | URL de Ollama |
| `GEMINI_API_KEY` | — | Habilita el provider Gemini |
| `OPENROUTER_API_KEY` | — | Habilita el provider OpenRouter |
| `ACCESS_TOKEN` | — | Si está definido, exige header `x-access-token` en endpoints de sandbox |
| `PROJECT_DIR` | `./.proyectos` | Directorio del sandbox del proyecto |

## Providers soportados en `/api/ai/stream`

1. **Ollama** (provider=`ollama`) — Streaming NDJSON contra `/api/chat`.
   - Bucle de agente con tool-calling para modelos compatibles (llama3, qwen, mistral…).
   - Reintentos (3×) con backoff ante fallos transitorios (408/425/429/500/502/503/504).
2. **Gemini** (provider=`gemini` o modelo empiece por `gemini`) — vía `@google/genai`.
3. **OpenRouter** (provider=`openrouter` + `openrouterApiKey`) — SSE OpenAI-compatible.
4. **Custom** (provider=`custom` + `customServerUrl`) — cualquier endpoint OpenAI-compatible.

## Arquitectura interna del streaming

Toda la lógica de streaming SSE está encapsulada en la clase `StreamContext`
(`server.ts`), que centraliza:

- **Abort por desconexión real**: `res.on("close")` + guard `!res.writableEnded`,
  NO `req.on("close")` (que se dispara al recibir el body, antes del primer token).
- **Watchdog global**: cap de 8 min por si el modelo cuelga sin cerrar.
- **Envío SSE**: `sendChunk` / `sendDone` / `sendError` / `sendTaskEvent`.

La lectura OpenAI-compatible (OpenRouter + Custom) se factorizó en
`pipeOpenAICompatibleStream()`. La lectura Ollama mantiene su timeout de inactividad
de 120s que se **reinicia en cada chunk** (no dispara si los tokens siguen fluyendo).

## Tests end-to-end

El repositorio incluye un suite exhaustivo de tests e2e que cubre los 4 providers
con mocks, usando 3 métodos de verificación (curl --no-buffer, Node fetch nativo,
Python http.client) más un test de regresión que reproduce el bug original.

```bash
# Requisitos: tener npm install hecho en el proyecto
python3 /ruta/a/comprehensive_e2e_test.py
```

Salida esperada: `OVERALL: ALL PASS` con 8 tests (ollama_short, ollama_long,
openrouter, custom_provider, gemini_fallback, python_bridge, regression_old_bug,
regression_new_code).

## Verificación rápida manual

```bash
# Arrancar el servidor
npm run dev

# En otro terminal: probar streaming de Ollama (necesitas Ollama corriendo)
curl -sN -X POST http://127.0.0.1:3000/api/ai/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hola","provider":"ollama","model":"qwen2.5:7b"}'

# Telemetría (estado de los 3 puertos)
curl http://127.0.0.1:3000/api/telemetry/ports
```

---

# Descripción extensa del sistema (v1.6.12)

## Qué es

CerebróNico es un entorno integrado de desarrollo que combina **inferencia local**
(mediante un motor de modelos en el propio equipo) con **aceleración en la nube**
opcional, y que además **ejecuta** lo que produce: escribe archivos, levanta una
previsualización aislada y controla procesos del sistema desde una interfaz web.

No es un chat con esteroides. La diferencia está en tres cosas que el sistema
trata como **invariantes**, no como buenas intenciones del modelo:

### 1. Lo que el modelo olvida, lo completa el sistema

Un modelo de lenguaje puede olvidar el manifiesto de dependencias de una app.
Eso no es aceptable como resultado. Antes de declarar un proyecto ejecutable, el
sistema analiza el árbol de importaciones de las fuentes y **genera lo que
falta**: el manifiesto con las dependencias *realmente* importadas y el documento
de entrada si no existe. Además instala exactamente los paquetes importados y no
declarados, en lugar de arrastrar un árbol completo.

### 2. Previsualizar no cuesta una instalación

Previsualizar exigía instalar todas las dependencias del proyecto y levantar su
servidor de desarrollo: decenas de segundos y fallo total por un solo paquete
ausente. Ahora el sistema elige **la vía más barata que pueda funcionar**:

| Vía | Cuándo | ¿Instala? |
|---|---|---|
| Servido directo | El proyecto no necesita transformación | No |
| Empaquetado único | Necesita transformación: se compila una vez con el empaquetador que el propio sistema ya trae | **No** |
| Arranque del proyecto | Marcos con servidor propio, o proyectos ya instalados y configurados | Sí |

La elección se registra con su motivo. Y no previsualizar nunca es la respuesta
cuando hay evidencia de contenido web: un archivo ajeno en la carpeta no puede
secuestrar una web.

### 3. Un fallo no se lleva por delante el resto

Cuatro capas desacopladas por puerto: interfaz y API, previsualización aislada,
puente de control y motor de inferencia local. La caída de la vista previa **no**
inutiliza la interfaz, y el motivo del fallo se reporta de forma explícita en
lugar de propagarse como un error genérico.

## Dónde viven tus datos

La raíz de datos es conmutable mediante la variable de entorno `PROJECT_DIR`
(por defecto, una carpeta junto al motor). **Todas** las capas la respetan,
incluido el puente de control, de modo que no se fragmenta en dos ubicaciones.

Contiene tus credenciales, el historial de uso de los espejos, el conocimiento
acumulado del motor y tus proyectos. Al cambiarla, el sistema ejecuta una
**migración no destructiva**: copia el estado solo si el destino está vacío, no
sobreescribe nada y no borra el origen — volver atrás es borrar la carpeta nueva.

## Robustez del flujo de inferencia

El flujo de respuesta del motor se interpreta con un búfer de recuperación: si la
estructura de un mensaje no es interpretable, **su texto se entrega igualmente**
en lugar de descartarse. Distingue el mensaje incompleto —que debe esperar— del
mensaje corrupto, y mide la latencia real en vez de dar por buena la que el
propio motor declara sobre sí mismo.

## Verificación

El proyecto no se apoya en «parece que funciona». Cada pieza tiene sus pruebas y
hay un validador que ejecuta **todas** las suites, comprueba los tipos y falla de
forma explícita si alguna no llegó a ejecutarse:

```bash
npm run validar
```

## Estado y honestidad

Este repositorio contiene un sistema en desarrollo activo. Lo que **no** está
hecho se dice aquí y no se disimula:

- **No hay generación de imágenes.** El registro de herramientas no incluye
  ninguna capacidad de imagen, ni de generación ni de edición.
- **La vía rápida de previsualización es una foto fija**: no ofrece recarga en
  caliente.
- **La orden del editor web** se envía al modelo como texto; el panel informa de
  que el mensaje se envió, no de que los archivos se hayan escrito.

## Documentación

- [`documentacion/memoria-patente.md`](documentacion/memoria-patente.md) — memoria
  descriptiva y reivindicaciones (borrador técnico, versionado con el código).
- [`documentacion/CREDENCIALES-y-papeleo.md`](documentacion/CREDENCIALES-y-papeleo.md)
  — inventario de datos y documentos a reunir.

## Licencia y titularidad

**Autor y propietario:** Mario Nicolas Quintero Marin.
**Copyright © 2026 Mario Nicolas Quintero Marin.** Todos los derechos reservados.
