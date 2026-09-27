# CerebroNico IDE v1 — Cambios y Novedades

**Versión**: 1.0.0 (renombrado desde v1.4.0 como "CerebroNico IDE v1")
**Fecha**: 2026-09-16
**Autor**: Mario Nicolas Quintero

---

## 🎯 Renombrado a CerebroNico IDE v1

- Marca unificada: `CerebroNico IDE v1` (en `Header`, `ChatCenter`, `index.html`, `package.json`, `README.md` del workspace, exportaciones).
- Constante `IDE_BRAND` en `constants.ts` con `NAME`, `VERSION`, `FULL_NAME`, `AUTHOR` y `EXTENSION = "cn"`.
- `package.json` con `name: "cerebronico-ide"`, `version: "1.0.0"`.
- Los exports de sesión JSON y ZIP ahora usan el prefijo `cerebronico-ide-*`.

## 🆕 Botón "Redetectar modelos" (todos los proveedores)

- Nuevo botón 🔄 **Redetectar** en el modal de selección de modelos (`ModelSelectorModal`).
- Llama a `redetectAllModels()` que ejecuta en paralelo la autodetección de:
  - 🦙 Ollama local (`/api/ollama/models` → `:11434/api/tags`)
  - ⚡ OpenAI (`/api/openai/models` → `api.openai.com/v1/models`)
  - ⚡ Gemini flash free (`/api/gemini/models`)
  - 🌐 OpenRouter :free (`/api/openrouter/models`)
- Muestra un spinner mientras se ejecuta y un log de terminal cuando termina.

## 🆕 Botón "Cargar modelos OpenAI" (provider OpenAI)

- Nuevo provider `openai` en `ModelProvider` (types.ts).
- Ranura de **API Key de OpenAI** en el modal "Ranuras de API Keys" (ApiKeyModal).
- Botón **⚡ Autodetectar modelos OpenAI** que llama a `https://api.openai.com/v1/models`.
- Filtra y ordena los modelos útiles: `gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini`, `chatgpt-*`.
- Catálogo inicial con 4 modelos OpenAI preconfigurados.
- Endpoint backend `GET /api/openai/models` (acepta `x-openai-key` como header seguro).
- Soporte completo de streaming OpenAI en `POST /api/ai/stream` (provider="openai").
- Auto-selección inteligente: si el usuario carga modelos y está en otro provider, cambia automáticamente a `openai` con `gpt-4o-mini` por defecto.
- Soporte de **visión**: si el modelo es `gpt-4o*` o `gpt-4-vision*` y hay imágenes adjuntas, se envían como `image_url` con base64 data URL.

## 🆕 Extensión `.cn` (CerebroNico) para guardar/abrir workspace

- Botón **`.cn` Guardar**: exporta todo el workspace (archivos + metadatos + modelo activo + provider + temperatura) a un único archivo `.cn` (formato JSON con metadatos).
- Botón **`.cn` Abrir**: restaura el workspace completo desde un archivo `.cn`.
- Formato robusto: si algún archivo no tiene `id` o `language`, se asigna automáticamente.
- Restauración también de metadatos opcionales: `currentModel`, `provider`, `temperature`.
- Acepta tanto `.cn` como `.json` en el file picker (compatibilidad).

## 🐛 Fix: "Imagen blanca atascada" en el sandbox

- Cambiado el `className` del iframe del sandbox de `bg-white` a `bg-[#0a0e17]` (fondo oscuro del tema). Antes, cuando el sandbox no cargaba, el iframe se veía como una imagen blanca gigante que no se iba.
- Añadido botón **🟠 Forzar cierre** en los controles del sandbox:
  1. Detiene el proceso npm run dev (POST `/api/sandbox/stop`).
  2. Reinicia la key del iframe (`iframeKey + 1`) — fuerza el remount completo.
  3. Espera 800ms y re-chequea el estado real del puerto 3500.
  4. Limpia cualquier página blanca atascada sin respuesta.

## 🐛 Fix: "Editor con un solo .bat" (workspace se regeneraba al borrar)

- Añadida la clave `LS_KEYS.WORKSPACE_SEEDED` (flag "ya sembramos la plantilla base al menos una vez").
- En el primer arranque: si no hay workspace persistido Y no estaba marcado como seeded, se siembra `INITIAL_WORKSPACE_FILES`. En adelante, se respeta lo que el usuario tenga (incluso vacío o 1 solo archivo).
- `handleDeleteAllFiles()` ahora **deja el workspace realmente vacío** (no restaura la plantilla automáticamente). Era el bug "borro y se regenera".
- Nuevo botón **🌱 Plantilla** que restaura manualmente `INITIAL_WORKSPACE_FILES` cuando el usuario lo quiera.

## 🆕 Indicador del puerto 3500 (Sandbox) en el Header

- Antes solo se veían `:5000` y `:11434`. Ahora también aparece `:3500` (violeta, etiqueta `SAND`) para recordar que es el puerto oficial del sandbox.

## 🔧 Mejoras adicionales

- `index.html` actualizado con título "CerebroNico IDE v1".
- `vite.config.ts` (estaba vacío) ahora define explícitamente la configuración de Vite con React y Tailwind 4.
- Textos del hero "CerebroNico IDE" → "CerebroNico IDE v1" en el ChatCenter.
- Descripción ampliada para mencionar los 5 providers disponibles.
- Persistencia de `openaiApiKey` en localStorage con su propia clave `codigo0_openai_api_key`.

## 📋 Providers soportados (5)

1. **Ollama Local** (`:11434`) — Inferencia 100% offline, modelos locales.
2. **OpenAI** (`api.openai.com`) — GPT-4o, GPT-4o-mini, o1, o3-mini.
3. **Gemini AI** (Google AI Studio) — gemini-2.5-flash, gemini-2.0-flash.
4. **OpenRouter** (multi-modelo en la nube) — DeepSeek, Claude, Llama, etc.
5. **Custom :5000** (FastAPI / vLLM / LM Studio) — Cualquier endpoint OpenAI-compatible.

## 📋 Puertos de la arquitectura

| Puerto | Servicio                              |
|--------|---------------------------------------|
| 3000   | Interfaz de la IDE (Vite + Express)   |
| 3500   | Sandbox Preview (app exportada)       |
| 5000   | Puente PC (Python / agent_bridge)     |
| 11434  | Ollama Local                          |

## 📋 Cómo usar la extensión `.cn`

1. **Guardar workspace**:
   - Clic en botón `.cn` (violeta) en el explorador de archivos.
   - Se descarga `cerebronico-workspace-YYYY-MM-DDTHH-MM-SS.cn`.
   - El archivo contiene: `format`, `formatVersion`, `ide`, `exportedAt`, `currentModel`, `provider`, `temperature`, `responseLanguage`, `expertMode`, `fileCount`, `files[]`.

2. **Abrir workspace**:
   - Clic en botón "Abrir .cn" (violeta) en el explorador.
   - Selecciona el archivo `.cn` o `.json`.
   - El workspace se restaura completo + el modelo y provider activos.

## 📋 Cómo usar el botón "Forzar cierre" (fix imagen blanca)

1. Ve al panel derecho → pestaña **Sandbox**.
2. Si ves una imagen blanca atascada o el preview no responde.
3. Clic en **🟠 Forzar cierre** (junto a "Recargar" y "Abrir").
4. El sandbox se detiene, el iframe se reinicia y se re-chequea el estado.
5. Clic en "Arrancar ahora" para volver a levantarlo limpio.

## 📋 Cómo usar el botón "Redetectar modelos"

1. Clic en el botón del modelo activo (Header) o en "Cambiar modelo" (panel izquierdo).
2. En el modal del selector, clic en **🔄 Redetectar** (botón ámbar, arriba a la derecha).
3. Se ejecutan en paralelo las 4 detecciones (Ollama, OpenAI, Gemini, OpenRouter).
4. Los modelos detectados aparecen marcados como "✓ Detectado Local" o se añaden al catálogo.
