# CerebroNico V1 — Cambios y Novedades

**Versión**: 1.0.0 (renombrado como **CerebroNico V1**)
**Fecha**: 2026-09-16
**Autor**: Mario Nicolas Quintero

---

## 🎨 Renombrado a "CerebroNico V1" (branding simplificado)

- Quitado "-Codigo-0" del branding visible.
- Header ahora muestra: **cuadrado CN** (gradiente cyan→blue) + **"CerebroNico V1"** + indicador verde de "online".
- Hero del ChatCenter: cuadrado CN gradiente + "CerebroNico V1" en vez del ícono de robot anterior.
- `index.html` title → "CerebroNico V1".
- Constante `IDE_BRAND.FULL_NAME = "CerebroNico V1"` en `constants.ts`.
- `package.json` con `name: "cerebronico-ide"`, `version: "1.0.0"`.
- README del workspace actualizado a "CerebroNico IDE v1" con todos los providers soportados.

## 📦 Extensión `.cn` rediseñada como contenedor tipo ZIP

El archivo `.cn` ya NO es un JSON simple — es un **ZIP real renombrado**:

- **Cabecera `PK` (50 4b 03 04)**: lo reconoce cualquier herramienta ZIP estándar (7-Zip, WinRAR, el Explorador de Windows, el Finder de macOS, `unzip` de Linux).
- **Adentro entra TODO**: código (.ts, .tsx, .py, .js, .md, .json), imágenes (.png, .jpg), PDFs, binarios, lo que sea. Es un contenedor genérico.
- **`manifest.json`** con metadatos: modelo activo, provider, temperatura, idioma de respuesta, modo experto, fecha de exportación, número de archivos.
- **Carpeta `.cerebronico/README.md`** con info del IDE.
- Verificado con `unzip -l`: lista correctamente todos los archivos.
- **Renombrable**: un archivo `workspace.cn` puede renombrarse a `workspace.zip` y viceversa sin perder datos.

### Funciones en `fileParser.ts`

- `generateCnFile(files, options)` → produce un Blob (ZIP) con todos los archivos + manifest.
- `parseCnFile(file)` → lee el .cn (o .zip, o .json legacy), devuelve `{ manifest, files, extras }`:
  - `files[]`: archivos de texto del workspace (para el editor).
  - `extras[]`: archivos binarios (imágenes, PDFs) en base64 — almacenables pero no editables.

### Botones en el explorador (RightSidebar)

- **Violeta `.cn`** → guarda el workspace como ZIP.
- **Violeta "Abrir .cn"** → acepta `.cn`, `.zip` o `.json` (compatible con todo).

## 🗑️ Pestaña "Skills (100)" ELIMINADA

- Las 100 skills viven dentro del **motor** (se inyectan vía `contextCache.ts` en el system prompt del turno 1 como mensajes ocultos).
- Ya no aparece la pestaña en el panel derecho.
- Pestañas visibles ahora: **Sandbox · Editor · Entregables · Terminal** (4 en vez de 5).
- El usuario puede pedir las skills por chat: *"lista las skills disponibles"*, *"activa la skill de parsing"*, etc.

## 🆕 Botón "Redetectar modelos" (todos los proveedores en paralelo)

- Botón 🔄 **Redetectar** en el modal de selección de modelos.
- Ejecuta en paralelo: Ollama + OpenAI + Gemini + OpenRouter.
- Spinner ámbar mientras se ejecuta + log de terminal al terminar.

## 🆕 Botón "Cargar modelos OpenAI" (provider OpenAI)

- Nuevo provider `openai` en `ModelProvider`.
- Ranura de API Key de OpenAI en "Ranuras de API Keys".
- Botón ⚡ **OpenAI** en el selector de modelos.
- Endpoint `/api/openai/models` con autenticación vía header `x-openai-key`.
- Streaming real de OpenAI en `/api/ai/stream` (provider="openai").
- Catálogo inicial: gpt-4o, gpt-4o-mini, o1, o3-mini.
- Soporte de visión: si el modelo es `gpt-4o*` y hay imágenes adjuntas, se envían como `image_url` con base64.

## 🐛 Fix: "Imagen blanca atascada" en el sandbox

- iframe cambiado de `bg-white` → `bg-[#0a0e17]` (fondo oscuro del tema).
- Nuevo botón **🟠 Forzar cierre**: detiene el sandbox + reinicia la key del iframe + re-chequea el estado. Mata cualquier página blanca atascada.

## 🐛 Fix: "Editor con un solo .bat" (workspace se regeneraba al borrar)

- Flag `WORKSPACE_SEEDED`: solo se siembra `INITIAL_WORKSPACE_FILES` en el primer arranque.
- `handleDeleteAllFiles()` ahora deja el workspace **realmente vacío** (no restaura la plantilla automáticamente).
- Nuevo botón **🌱 Plantilla** para restaurar la plantilla manualmente cuando se quiera.

## 🆕 Indicador del puerto 3500 (Sandbox) en el Header

- Añadido `:3500 SAND` (violeta) junto a `:5000` y `:11434`.

## 📋 Providers soportados (5)

1. **Ollama Local** (`:11434`) — Inferencia 100% offline.
2. **OpenAI** (`api.openai.com`) — GPT-4o, GPT-4o-mini, o1, o3-mini.
3. **Gemini AI** (Google AI Studio) — gemini-2.5-flash, gemini-2.0-flash.
4. **OpenRouter** (multi-modelo en la nube) — DeepSeek, Claude, Llama, etc.
5. **Custom :5000** (FastAPI / vLLM / LM Studio) — cualquier endpoint OpenAI-compatible.

## 📋 Puertos de la arquitectura

| Puerto | Servicio                              |
|--------|---------------------------------------|
| 3000   | Interfaz de la IDE (Vite + Express)   |
| 3500   | Sandbox Preview (app exportada)       |
| 5000   | Puente PC (Python / agent_bridge)     |
| 11434  | Ollama Local                          |

## 📋 Cómo usar la extensión `.cn` (contenedor ZIP)

### Guardar workspace

1. Panel derecho → explorador → botón **violeta `.cn`**.
2. Se descarga `cerebronico-workspace-YYYY-MM-DDTHH-MM-SS.cn`.
3. **Tip**: renómbralo a `.zip` para inspeccionarlo en cualquier explorador (Windows, macOS, Linux).

### Abrir workspace

1. Panel derecho → explorador → botón **violeta "Abrir .cn"**.
2. Selecciona el `.cn` (también acepta `.zip` o `.json` legacy).
3. Se restauran: archivos del editor + modelo activo + provider + temperatura + idioma.

### Estructura interna del .cn

```
mi-workspace.cn  (ZIP renombrado)
├── manifest.json          ← metadatos del IDE
├── package.json           ← archivos del workspace
├── server.ts
├── README.md
├── src/
│   └── index.ts
├── assets/
│   └── logo.png           ← binarios también entran
└── .cerebronico/
    └── README.md          ← info del IDE
```

## 📋 Cómo usar el botón "Forzar cierre" (fix imagen blanca)

1. Panel derecho → pestaña **Sandbox**.
2. Si ves una imagen blanca atascada o el preview no responde.
3. Clic en **🟠 Forzar cierre** (junto a "Recargar" y "Abrir").
4. El sandbox se detiene, el iframe se reinicia y se re-chequea el estado.
5. Clic en "Arrancar ahora" para volver a levantarlo limpio.

## 📋 Cómo usar el botón "Redetectar modelos"

1. Clic en el botón del modelo activo (Header) o en "Cambiar modelo".
2. En el modal del selector, clic en **🔄 Redetectar** (botón ámbar arriba a la derecha).
3. Se ejecutan en paralelo las 4 detecciones (Ollama, OpenAI, Gemini, OpenRouter).
4. Los modelos detectados aparecen en el catálogo.
