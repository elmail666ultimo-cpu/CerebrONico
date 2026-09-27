# v1.1 — Z.ai (GLM-4.5-Flash) GRATIS + servidores cloud extra + fix fondo de pantalla

## Resumen ejecutivo

Se añadieron **7 proveedores cloud con tier gratuito** como proveedores dedicados (no como plantillas Custom):
- **Z.ai (GLM)** — GLM-4.5-Flash, GLM-4-Flash, GLM-4-Air, GLM-4-FlashX, GLM-4.5V-Flash → **100% GRATIS, sin tarjeta de crédito**
- **Groq** — Llama 3.3 70B, Gemma 2 9B, Mixtral → GRATIS
- **Cerebras** — Llama 3.1 8B/70B, Qwen 2.5 Coder → GRATIS (beta)
- **Together AI** — Llama 3.3 70B Turbo Free, DeepSeek R1 Distill → $5 crédito gratis
- **Mistral AI** — Mistral Small/Medium, Codestral, Nemo → GRATIS (rate limits)
- **DeepSeek** — V3, R1, Coder → muy económico (casi gratis)
- **Fireworks AI** — Llama 3.1, DeepSeek R1 Distill → $1 crédito gratis

## ⚠️ Aclaración importante sobre "gratis"

Z.ai (como **todos** los proveedores cloud: OpenAI, Gemini, Groq, etc.) **requiere registro gratuito + API key** para usar sus modelos. NO hay un endpoint "sin API key" en ningún lado. Lo que SÍ hicimos:

1. **Preconfigurado por defecto**: al arrancar el IDE, el provider activo es **Z.ai** y el modelo es **GLM-4.5-Flash** (sin que el usuario tenga que tocar nada).
2. **Asistente de bienvenida**: aparece un modal al primer arranque que:
   - Explica por qué GLM-4.5-Flash es gratis
   - Tiene un botón "Abrir z.ai/manage/apikey" en 1 clic
   - Tiene un campo para pegar la clave
   - La guarda automáticamente y persiste
3. **Modo demo amistoso**: si el usuario intenta chatear sin clave, en lugar de errorar con un mensaje frío, responde con una guía detallada en español que explica cómo conseguir la clave gratis en 30 segundos.
4. **Botón "Z.ai GRATIS" en el header**: botón violeta pulsante (visible cuando no hay clave) que reabre el asistente; se vuelve verde estático con ✓ cuando la clave está configurada.

## Cambios técnicos

### 1. `src/types.ts` — Tipo `ModelProvider` extendido

```typescript
export type ModelProvider =
  | "ollama" | "gemini" | "openrouter" | "custom" | "openai"
  // v1.1 — cloud servers con free tiers dedicados:
  | "zai" | "groq" | "cerebras" | "together" | "mistral"
  | "deepseek" | "fireworks";
```

### 2. `src/constants.ts` — Catálogos estáticos

- `CLOUD_PROVIDERS` extendido con `zai`, `groq`, `cerebras`, `together`, `mistral`, `deepseek`, `fireworks` (con `apiBase`, `docs`, `freeTier`, `description`).
- `ZAI_FREE_MODELS` — catálogo estático de los 5 modelos GLM gratuitos (no requiere API key para listarlos).
- `GROQ_FREE_MODELS`, `CEREBRAS_FREE_MODELS`, `TOGETHER_FREE_MODELS`, `MISTRAL_FREE_MODELS`, `DEEPSEEK_MODELS`, `FIREWORKS_FREE_MODELS`.
- `LS_KEYS` extendido con `ZAI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `TOGETHER_API_KEY`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY`, `FIREWORKS_API_KEY`, y `ZAI_WIZARD_DISMISSED`.

### 3. `src/utils/engine.ts` — `StreamConfig` extendido

Añadidos los campos `zaiApiKey`, `groqApiKey`, `cerebrasApiKey`, `togetherApiKey`, `mistralApiKey`, `deepseekApiKey`, `fireworksApiKey`. El body del POST a `/api/ai/stream` ahora envía todas estas claves al servidor.

### 4. `backend/server.ts` — Nuevos endpoints y providers

**Endpoints nuevos:**
- `GET /api/zai/models` — devuelve catálogo estático GLM (sin key) o estático + en vivo (con key).
- `GET /api/cloud/models?provider=groq|cerebras|together|mistral|deepseek|fireworks` — catálogo estático o en vivo según proveedor.

**Ramas de provider en `/api/ai/stream`:**
- `provider === "zai"` → endpoint `https://api.z.ai/api/paas/v4/chat/completions`. Soporta visión (GLM-4.5V-Flash). **Modo demo** cuando no hay clave: responde con guía detallada en español.
- `provider === "groq"` → `https://api.groq.com/openai/v1/chat/completions`
- `provider === "cerebras"` → `https://api.cerebras.ai/v1/chat/completions`
- `provider === "together"` → `https://api.together.xyz/v1/chat/completions`
- `provider === "mistral"` → `https://api.mistral.ai/v1/chat/completions`
- `provider === "deepseek"` → `https://api.deepseek.com/v1/chat/completions`
- `provider === "fireworks"` → `https://api.fireworks.ai/inference/v1/chat/completions`

Todos usan `pipeOpenAICompatibleStream` (compartido con OpenRouter/OpenAI/Custom) y manejan errores con mensajes claros en español.

### 5. `src/App.tsx` — Defaults + wiring

- **Default provider cambiado** de `"ollama"` → **`"zai"`** (al primer arranque, sin tocar localStorage).
- **Default model cambiado** de `"stablelm2:latest"` → **`"glm-4.5-flash"`**.
- Nuevos estados: `zaiApiKey`, `groqApiKey`, `cerebrasApiKey`, `togetherApiKey`, `mistralApiKey`, `deepseekApiKey`, `fireworksApiKey`, `isZaiWizardOpen`, `isDetectingZai`, `detectedZaiModels`.
- `fetchZaiFreeModels()` se llama **automáticamente al montar** (no requiere API key) → el catálogo GLM aparece en el selector de modelos desde el primer segundo.
- `redetectAllModels()` ahora incluye Z.ai.
- Routing inteligente en `onSelectModel`: si el modelo empieza con `glm-` → `zai`; si empieza con `llama-3.` o `gemma2` → `groq`; etc.
- `ZaiWizard` renderizado al final del JSX.

### 6. `src/components/ZaiWizard.tsx` (NUEVO)

Asistente de 3 pasos:
1. **Por qué GLM-4.5-Flash**: bullets con beneficios (gratis, sin tarjeta, 128K, español, OpenAI-compatible).
2. **Cómo obtener la clave**: botón grande "Abrir z.ai/manage/apikey" que abre en pestaña nueva.
3. **Pegar la clave**: input password con placeholder claro, guardado automático con feedback "¡Clave guardada!".

Incluye:
- Header con gradiente violeta + badge "FREE".
- Botón "Saltar por ahora (modo demo)" para cerrar sin configurar.
- Botón "Ver todas las claves" para abrir el `ApiKeyModal` completo.
- Persistencia del flag `ZAI_WIZARD_DISMISSED` para no molestar al usuario en cada arranque.

### 7. `src/components/Header.tsx` — Botón "Z.ai GRATIS"

- Nuevo prop `onOpenZaiWizard` y `zaiApiKey`.
- Botón violeta **pulsante** (con `animate-pulse`) cuando no hay clave configurada → se vuelve verde estático con ✓ cuando la clave ya está guardada.
- Title claro: "Configurar Z.ai (GLM-4.5-Flash) — 100% GRATIS, sin tarjeta".

### 8. `src/components/ApiKeyModal.tsx` — Sección Z.ai destacada

- Grid de providers ampliado a 10 (con Z.ai destacado en primer lugar después de Ollama).
- Sección "0. Z.ai (GLM)" con gradiente violeta, badge "FREE TIER", explicación detallada y botón "⚡ Cargar modelos GLM".
- Sección "0.5. Groq API Key" destacada en naranja.
- Sección "0.6. Otros servidores cloud" colapsable (`<details>`) con Cerebras, Together, Mistral, DeepSeek, Fireworks.

### 9. `src/components/ModelSelectorModal.tsx` — Soporte Z.ai

- Props nuevas: `detectedZaiModels`, `onRefreshZaiModels`, `isDetectingZai`.
- Los modelos GLM detectados se inyectan al inicio de la lista con `provider: "zai"`, descripción "Modelo GLM GRATUITO de Z.ai", marcado como vision-capable para GLM-4.5V-Flash.
- Botón "🧠 Z.ai free" en la barra de autodetección.

### 10. `src/index.css` — Fix visibilidad del fondo de pantalla

Cuando `body.has-brain-bg` está activo:
- `body` cambia `background-color` a `transparent !important` (antes era `#000` que tapaba la imagen).
- `header`, `.bg-[#0d121c]`, `.bg-[#060912]`, `.bg-[#060a14]`, `.bg-[#05070d]`, `.bg-[#050811]`, `.bg-[#03060c]` se vuelven translúcidos (rgba con opacidad 0.65-0.75) + `backdrop-filter: blur()` para mantener legibilidad.
- Los textos `.text-zinc-100`, `.text-zinc-200`, `.text-white` reciben `text-shadow` sutil.

## Cómo probar

1. `cd backend && bun install`
2. `bun run dev`
3. Abrir `http://127.0.0.1:3000` — el **asistente Z.ai aparece automáticamente**.
4. Clic en "Abrir z.ai/manage/apikey" → se abre la página de Z.ai en pestaña nueva.
5. Registrarse (email + SMS) → copiar la clave.
6. Pegar en el input del asistente → "Guardar y empezar a chatear".
7. El botón del header cambia de "Z.ai GRATIS" (violeta pulsante) a "Z.ai ✓" (verde).
8. Escribir cualquier mensaje → GLM-4.5-Flash responde en streaming.

## Si el usuario no quiere Z.ai

- Botón "Saltar por ahora (modo demo)" cierra el asistente sin configurar.
- El IDE entra en modo demo: cualquier mensaje recibe una guía detallada de cómo obtener la clave.
- El usuario puede cambiar a Ollama Local (provider), Gemini (free), OpenRouter (free), etc. desde el selector de modelos.
