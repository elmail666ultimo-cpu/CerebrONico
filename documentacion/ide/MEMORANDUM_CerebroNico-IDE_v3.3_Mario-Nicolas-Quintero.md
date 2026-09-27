# MEMORÁNDUM — CEREBRONICO IDE v3.3

**PLANO COMPLETO · INTEGRACIONES NUEVAS · RENOMBRE DE CREDENCIALES**

| Campo | Detalle |
|---|---|
| **Para** | MARIO NICOLAS QUINTERO — Autor y Propietario |
| **De** | Equipo de reconstrucción CerebroNico |
| **Fecha** | 13 de septiembre de 2026 |
| **Referencia** | `CerebroNico-IDE-v3.3-Refactor.zip` · package.json 1.3.0 |
| **Copyright** | © 2026 Mario Nicolas Quintero. Todos los derechos reservados. |

---

## 1. OBJETO

Este memorándum deja constancia escrita y centralizada de tres cosas: **(a)** el plano completo del sistema CerebroNico IDE tal como quedó tras la reconstrucción v3.3, **(b)** el inventario de todas las integraciones nuevas incorporadas desde la versión original hasta hoy, y **(c)** el renombre formal de todas las credenciales del proyecto, que desde esta fecha quedan **atribuidas a Mario Nicolas Quintero**. Todo lo documentado aquí fue verificado en ejecución real (compilación limpia, pruebas E2E de servidor, sandbox y puente), no es material teórico: cada afirmación corresponde a una prueba superada registrada en el log de trabajo.

---

## 2. RENOMBRE DE CREDENCIALES — ATRIBUIDAS A MARIO NICOLAS QUINTERO

### 2.1 Credenciales de identidad del producto (renombradas en el código)

| # | Credencial | Archivo | Antes | Ahora |
|---|---|---|---|---|
| 1 | `author` del paquete | `backend/package.json` | *(vacío)* | **Mario Nicolas Quintero** |
| 2 | `copyright` del paquete | `backend/package.json` | *(vacío)* | **Copyright © 2026 Mario Nicolas Quintero** |
| 3 | `copyright` del instalador EXE (electron-builder) | `backend/package.json → build` | genérico | **Copyright © 2026 Mario Nicolas Quintero** |
| 4 | `publisherName` Windows (firma del publicador del instalador NSIS) | `backend/package.json → build.win` | *(vacío)* | **Mario Nicolas Quintero** |
| 5 | Identidad del proyecto | `backend/metadata.json` | "Remix Remix codigo-56" | **"CerebroNico IDE — Mario Nicolas Quintero"** + campo `author` |
| 6 | `author` de la plantilla del SANDBOX (proyecto interno puerto 3500) | `backend/src/App.tsx → INITIAL_PACKAGE_JSON` | *(vacío)* | **Mario Nicolas Quintero** |
| 7 | `author` de la plantilla del ZIP exportable | `backend/src/utils/fileParser.ts` | *(vacío)* | **Mario Nicolas Quintero** |
| 8 | Cabecera de documentación | `backend/README.md` y `backend/CHANGELOG.md` | sin autor | **Autor y propietario: Mario Nicolas Quintero** |
| 9 | Cabecera del proceso principal Electron | `backend/electron-main.cjs` | sin autor | **Autor y propietario: Mario Nicolas Quintero** |
| 10 | Hoja de cambios de la distribución | `LEEME_ CAMBIOS v3.3.txt` | sin autor | **AUTOR Y PROPIETARIO: MARIO NICOLAS QUINTERO** |

> El `appId` (`com.cerebronico.ide`) y el `productName` ("CerebroNico IDE") se **conservan deliberadamente**: cambiarlos haría que Windows tratara el instalador nuevo como una app distinta y rompería las actualizaciones sobre la instalación existente. La propiedad legal queda fijada por `author`, `copyright` y `publisherName`.

### 2.2 Credenciales de servicio (ranuras a nombre del propietario)

Todas las ranuras de credenciales de la IDE quedan asociadas al propietario y se guardan localmente en su máquina (localStorage con prefijo `codigo0_*`), **nunca** viajan dentro del ZIP ni se suben a ningún servidor:

| Ranura | Clave local | Uso |
|---|---|---|
| Gemini | `codigo0_gemini_key` | Nube — provider Gemini (`@google/genai`) |
| OpenRouter | `codigo0_openrouter_key` | Nube — SSE OpenAI-compatible |
| Servidor personalizado | `codigo0_custom_key` + `codigo0_custom_url` | Cualquier endpoint OpenAI-compatible propio |
| Ollama | `codigo0_ollama_url` | Inferencia local 11434 (sin clave; URL configurable) |
| Access Token del server | variable `ACCESS_TOKEN` (opcional) | Protege endpoints de sandbox en LAN vía header `x-access-token` |

**Declaración de titularidad:** las credenciales de API que el propietario cargue en estas ranuras son de su exclusiva propiedad; la IDE actúa solo como custodio local. En el EXE compilado, el campo "Copyright" y el "Nombre del publicador" que Windows muestra en Propiedades → Detalles y en el aviso UAC dirán **Mario Nicolas Quintero**.

---

## 3. PLANO GENERAL DEL SISTEMA

### 3.1 Arquitectura y puertos

| Puerto | Servicio | Tecnología | Rol |
|---|---|---|---|
| **3000** | IDE principal (UI + API) | React 19 + Vite 6 + Express (`server.ts`) | Chat central, editor, explorador, entregables |
| **3500** | Sandbox / app exportada | Vite + Express dentro de `.proyectos/` | Preview en vivo + ZIP descargable independiente |
| **5000** | Puente PC (Modo Agente) | Python (`agent_bridge_5000.py`) o `dist/CerebroNicoAgent.exe` | Shell + python-exec para acciones reales en el PC |
| **11434** | Ollama | Servidor local del usuario | Inferencia local (llama3, qwen, mistral…) |

Regla de oro de puertos: la app exportada y el sandbox **siempre 3500** para nunca colisionar con la interfaz de la IDE (3000). La constante vive en `src/constants.ts` (`PORTS`) como única fuente de verdad.

### 3.2 Cadena de arranque (fix de pantalla negra)

```
Usuario abre EXE (o iniciar_todo_windows.bat)
  └─ electron-main.cjs (instancia única)
       ├─ auto-ejecuta iniciar_todo_windows.bat OCULTO (windowsHide)
       ├─ muestra SPLASH con progreso en segundos reales
       ├─ BAT: npm install si falta node_modules + Ollama (start /min) + server :3000
       ├─ Polling a :3000 hasta 6 minutos (no más setTimeout fijo de 2.5s)
       ├─ ¿Server vivo?  → carga la UI  ✅
       ├─ ¿Server muerto tras reintentos? → fallback a dist/server.mjs
       └─ ¿Todo falla?  → página de error + botón "Reintentar ahora" + auto-reintento cada 10s
```

### 3.3 Mapa de archivos clave

```
ide/
├─ backend/
│  ├─ electron-main.cjs        ← proceso Electron (splash, BAT oculto, polling, error page)
│  ├─ server.ts                ← Express: /api/ai/stream, /api/exec, /api/fs/*, /api/sandbox/*
│  ├─ src/
│  │  ├─ App.tsx               ← orquestador central (estado, chats, sandbox sync)
│  │  ├─ constants.ts          ← NUEVO: PORTS + 19 LS_KEYS (única fuente de verdad)
│  │  ├─ components/
│  │  │  ├─ ChatCenter.tsx     ← chat + "Chats (N)" + TTS por mensaje
│  │  │  ├─ RightSidebar.tsx   ← árbol VERTICAL + sandbox AUTO con iframe :3500
│  │  │  ├─ CodeEditor.tsx / Header.tsx / LeftSidebar.tsx / ApiKeyModal.tsx / ModelSelectorModal.tsx
│  │  └─ utils/
│  │     ├─ storage.ts         ← NUEVO: loadJSON/saveJSON/loadString/saveString
│  │     ├─ chatStorage.ts     ← NUEVO: deriveChatTitle/makeChatId/buildArchivedChat
│  │     ├─ fileParser.ts      ← generateProjectZip (plantilla con author)
│  │     └─ engine/memory/contextCache/syntaxEngine/codeParser/attachmentProcessor/languageMemory
│  ├─ app/ + src/utils/*.py    ← agente Python del puente (env_manager)
│  ├─ dist/CerebroNicoAgent.exe← agente compilado (fallback si no hay Python)
│  ├─ dist/server.mjs          ← server compilado (producción / fallback del EXE)
│  ├─ iniciar_todo_windows.bat ← arrancador único (lo llama el EXE oculto)
│  ├─ compilar_exe_windows.bat ← compila el instalador Windows (vite+esbuild+electron-builder)
│  └─ package.json             ← 1.3.0 · author/copyright/publisherName = Mario Nicolas Quintero
├─ build_backend.bat           ← compila el agente EXE con PyInstaller
├─ CerebroNicoAgent.spec
└─ LEEME_ CAMBIOS v3.3.txt
```

---

## 4. INTEGRACIONES NUEVAS (INVENTARIO COMPLETO)

### 4.1 v3.1 "Autoarranque Total"

1. **Auto-ejecución del BAT desde el EXE** — el usuario ya no abre nada a mano: el proceso principal lanza `iniciar_todo_windows.bat` oculto.
2. **Splash con progreso** — reemplaza la pantalla negra; muestra cuenta de segundos y estado real del arranque.
3. **Espera activa del servidor** — polling a :3000 hasta 6 min con reintentos y fallback a `dist/server.mjs` (antes un `setTimeout` de 2.5 s que fallaba siempre en arranque frío).
4. **Árbol de archivos vertical** — explorador jerárquico con carpetas colapsables, búsqueda, iconos, cerrar pestaña, punto de modificado y botón "nuevo archivo" (reemplaza las pestañas horizontales).
5. **ZIP exportable en puerto 3500** — la app exportada corre en su propio puerto y jamás choca con la IDE; plantillas `package.json`/`vite.config`/`MEMORIA.md` generadas automáticamente.
6. **Sandbox real** — endpoints `/api/sandbox/start|stop|status|logs` (spawn de `npm run dev` en :3500, `taskkill /T` en Windows, limpieza de huérfanos por netstat, log a `.sandbox_3500.log`).

### 4.2 v3.2 "Sandbox Automático"

7. **Piloto automático (AUTO ON por defecto)** — al entrar a la pestaña Sandbox: sincroniza → instala → arranca :3500 → preview, todo sin clicks. Persistido en `codigo0_sandbox_auto`.
8. **Vigilante (watchdog) cada 8 s** — si el servidor del sandbox muere, se re-levanta solo.
9. **Auto-sync con HMR en vivo** — cambios de archivos del workspace propagados al sandbox con debounce de 2.5 s; la preview se actualiza al guardar.
10. **Auto-heal de dependencias** — si el proceso muere sin abrir puerto y el log muestra dependencias faltantes (p. ej. `cross-env: not found`), corre `npm install` solo y reintenta (verificado E2E).
11. **Carpeta de chats guardados** — botón "Chats (N)" con drawer: nuevo chat, renombrar (lápiz), borrar (tachito + confirmación), auto-título con el primer mensaje, persistencia `codigo0_saved_chats`.
12. **TTS por mensaje** — botón "Escuchar/Detener" en cada mensaje del chat (speechSynthesis en español, limpia markdown y código); el altavoz global silencia de verdad.
13. **Descargas deduplicadas** — quedan exactamente 2 salidas: "Descargar ZIP" (header) y "Descargar este archivo" (editor); las filas de Entregables abren el archivo en el editor.
14. **Portada de bienvenida del sandbox** — la plantilla del workspace ya no muestra "Cannot GET /".

### 4.3 v3.3 "Refactor y Correcciones" (versión actual)

15. **Limpieza de peso muerto** — eliminados del paquete: `venv/` (57 MB), `build/` de PyInstaller (35 MB), `__pycache__`, directorios accidentales (`del/`, `dir`, `para/`, `llamada/`, `Downloads/`, `buildbuild_backend.bat`, `app/backend__init__.py`). Resultado: ZIP de 62.8 MB / 5.091 archivos → **16 MB / 105 archivos**. Los `__init__.py` legítimos se conservaron (FastAPI/PyInstaller los necesitan) y los corruptos (`src/__init__.py`) se normalizaron a Python válido.
16. **Refactor de constantes** — `src/constants.ts`: puertos + 19 claves `codigo0_*` centralizadas (antes ~35 strings duplicados en 6 archivos).
17. **Refactor de storage** — `src/utils/storage.ts` con protección ante JSON corrupto y cuota llena; `chatStorage.ts` con lógica pura de chats testeable; `readFileTail()` deduplica la lectura de logs; `ApiKeyModal` sin doble persistencia.
18. **Fix crítico del puente :5000** — si la PC no tiene Python, el puente moría en silencio y el Modo Agente PC nunca funcionaba. Ahora hay sonda `python → python3 → dist/CerebroNicoAgent.exe`: el EXE de 15 MB incluido por fin se usa automáticamente.
19. **Fix ventana oculta para siempre** — si el server no responde, el EXE muestra página de error con botón "Reintentar ahora" + reintento automático cada 10 s.
20. **Fix `ollamaUrl` volátil** — la URL de Ollama configurada sobrevive a la recarga (`loadString(LS_KEYS.OLLAMA_URL)` al arrancar).
21. **Fix watchdog contra errores HTTP** — valida `r.ok` antes de `r.json()`: un 401/500 ya no enloquece al autopiloto en bucle.
22. **Renombre de credenciales** — todas las credenciales e identidad del producto atribuidas a **Mario Nicolas Quintero** (sección 2 de este memorándum).

---

## 5. PLAN DE OPERACIÓN

| Acción | Cómo |
|---|---|
| Arrancar todo | Doble click en `iniciar_todo_windows.bat` **o** directamente el EXE (el arranque es automático y oculto) |
| Primera vez | El BAT instala `node_modules` solo y levanta Ollama minimizado |
| Compilar instalador Windows | `compilar_exe_windows.bat` → salida en `dist_electron/` |
| Compilar agente EXE (opcional) | `build_backend.bat` (crea el venv solo; ya viaja uno compilado en `dist/`) |
| Exportar una app del chat | Botón "Descargar ZIP" del header → corre independiente en :3500 con `npm run dev` |
| Limpiar Ollama | `limpiar_ollama_windows.bat` |

---

## 6. VERIFICACIONES REALIZADAS (EJECUCIÓN REAL)

- `tsc --noEmit` sin errores; `vite build + esbuild` OK; `node --check electron-main.cjs` OK; JSON de paquete y metadata válidos (incluye las credenciales nuevas).
- E2E de servidor: UI :3000 → 200; sandbox arranque frío online en :3500; preview 200; puente :5000 health 200 con la sonda Python/EXE; stop limpio.
- UI en navegador (automatizada): explorador vertical, drawer de chats con renombrar/borrar, piloto AUTO del sandbox con preview viva sin un solo click.
- Evidencia gráfica: `verificacion_arbol_vertical.png`, `verificacion_sandbox_vivo.png`, `verificacion_sandbox_automatico.png`, `verificacion_carpeta_chats.png`, `verificacion_v33_home.png`, `verificacion_v33_chats.png`, `verificacion_v33_sandbox.png`.

---

## 7. ENTREGABLES

| Archivo | Contenido |
|---|---|
| `CerebroNico-IDE-v3.3-Refactor.zip` | Proyecto completo limpio (16 MB, 105 archivos) con agente EXE, backend compilado, credenciales renombradas y este plan de arranque |
| `LEEME_ CAMBIOS v3.3.txt` | Hoja de cambios v3.3 con atribución de propietario en cabecera |
| Capturas `verificacion_*.png` | Evidencia visual de cada integración funcionando |

---

## 8. PRÓXIMOS PASOS SUGERIDOS

1. **Firma de código (opcional):** con el `publisherName` ya fijado en Mario Nicolas Quintero, un certificado de firma (SSL.com/Sectigo, ~USD 70/año) eliminaría el aviso azul de SmartScreen del EXE.
2. **Repositorio privado Git:** inicializar repo con este v3.3 como commit raíz `v3.3 — propietario: Mario Nicolas Quintero` para historial trazable.
3. **Ajuste fino del watchdog:** si en tu máquina el sandbox tarda más de 8 s en abrir puerto en arranque muy frío, se puede subir el intervalo a 12 s sin tocar nada más.
4. **Empaquetado futuro:** cualquier cambio nuevo → editar código → `compilar_exe_windows.bat` → nuevo ZIP; las plantillas ya llevan la atribución incorporada automáticamente.
