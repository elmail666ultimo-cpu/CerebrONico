> **CerebróNico v1.0:** el icono ya vive en `backend/build/icon.png` (chip con cerebro, adoptado 20-sep) y electron-builder lo incrusta solo. El instalador sale como **CerebróNico** (`productName`).

# CerebroNico IDE v1.4.0 — Guía de Compilación del EXE Instalable

Autor y propietario: **Mario Nicolas Quintero**
Copyright © 2026 Mario Nicolas Quintero. Todos los derechos reservados.

---

## Requisitos previos (PC Windows)

Antes de compilar, instala una sola vez:

1. **Node.js 20+** (incluye `npm`): https://nodejs.org
2. **Python 3.10+** (para los agentes fallback con PyInstaller): https://www.python.org/downloads/
   - Durante la instalación marca "Add Python to PATH".
3. **Ollama** (solo para probar la IDE, no para compilar): https://ollama.com

No se requiere firmar código para generar el EXE; el instalador NSIS
funciona sin certificado (mostrará SmartScreen la primera vez).

---

## Cadena de compilación (un solo BAT)

Abre una terminal CMD, ve a la carpeta `backend/` y ejecuta:

```cmd
cd backend
compilar_exe_windows.bat
```

Este BAT ejecuta los 4 pasos en orden:

| Paso | Acción | Salida |
|------|--------|--------|
| 1/4 | `npm install` (si falta `node_modules`) | `backend/node_modules/` |
| 2/4 | `npm run build` (vite + esbuild) | `backend/dist/index.html` + `dist/server.mjs` |
| 3/4 | `build_backend.bat` (PyInstaller) | `dist/CerebroNicoAgent.exe` + `dist/cerebronico_bridge.exe` |
| 4/4 | `npm run dist` (electron-builder) | `backend/dist_electron/CerebroNico IDE Setup (1.4.0).exe` |

### Salidas finales

```
backend/dist_electron/
├─ CerebroNico IDE Setup (1.4.0).exe     ← instalador NSIS (distribuible)
└─ win-unpacked/
   └─ CerebroNico IDE.exe                ← versión portable

dist/
├─ CerebroNicoAgent.exe                  ← agente Python (backend FastAPI)
└─ cerebronico_bridge.exe                ← puente :5000 (fallback)
```

El instalador NSIS incluye `extraResources` con:
- Ambos `.exe` Python (fallback si la PC destino no tiene Python)
- `agent_bridge_5000.py` (para correr con Python si prefiere)
- Carpeta `app/` con todos los `.py` del backend FastAPI
- `__init__.py` puente (marcadores de paquete)
- `.spec` de PyInstaller (por si quieres recompilar los agentes en la PC destino)
- `build_backend.bat`, `iniciar_todo_windows.bat`, `requirements.txt`

---

## Compilación parcial (solo un componente)

### Solo la UI + server Node (sin EXE Python)

```cmd
cd backend
npm install
npm run build
```

Salida: `backend/dist/index.html` + `backend/dist/server.mjs`
Prueba: `npm run dev` → http://127.0.0.1:3000

### Solo los agentes Python (sin Electron)

```cmd
:: Desde la raíz del proyecto (ide/)
build_backend.bat
```

Requiere haber creado el `venv/` antes (lo hace automáticamente
`iniciar_todo_windows.bat` la primera vez, o a mano con:

```cmd
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
pip install pyinstaller
```

Salida: `dist/CerebroNicoAgent.exe` + `dist/cerebronico_bridge.exe`

### Solo el instalador de Electron (UI + server ya compilados)

```cmd
cd backend
npm run dist
```

Salida: `backend/dist_electron/CerebroNico IDE Setup (1.4.0).exe`

---

## Archivos `.spec` de PyInstaller

Los `.spec` contienen los `hiddenimports` y `datas` necesarios para que
PyInstaller incluya los `__init__.py` puente (marcadores de paquete Python
que FastAPI y el `agent_bridge_5000.py` necesitan para los imports
`from backend.app.utils.env_manager import ...`).

**No borres los `__init__.py` vacíos** — son puentes de importación.

| Archivo | Genera | Punto de entrada |
|---------|--------|------------------|
| `CerebroNicoAgent.spec` | `dist/CerebroNicoAgent.exe` | `backend/app/main.py` |
| `cerebronico_bridge.spec` | `dist/cerebronico_bridge.exe` | `backend/agent_bridge_5000.py` |

---

## Solución de problemas

### `ModuleNotFoundError: No module named 'backend.app.utils'`

Falta correr `build_backend.bat` desde la raíz del proyecto. Los `.spec`
están configurados con `hiddenimports` y `datas` para evitar este error.

### `EADDRINUSE: address already in use 0.0.0.0:3500`

El sandbox quedó colgado. Mata el proceso:

```cmd
:: Windows
for /f "tokens=5" %a in ('netstat -ano ^| findstr :3500 ^| findstr LISTENING') do taskkill /PID %a /T /F
```

```bash
# Linux/Mac
fuser -k 3500/tcp
```

El auto-restart del backend ahora tiene backoff exponencial (1s→2s→4s→…→60s)
para no saturar la CPU si el sandbox cae repetidamente.

### `npm install` falla por `electron` o `electron-builder`

Borra `node_modules` y `package-lock.json` y reintenta:

```cmd
rmdir /S /Q node_modules
del package-lock.json
npm install
```

### El EXE arranca pero muestra "No se pudo conectar con CerebroNico"

Significa que el server local :3000 no levantó. Verifica:

1. Que `iniciar_todo_windows.bat` esté en la carpeta del proyecto.
2. Que el server `npm run dev` corra manualmente sin errores.
3. Revisa la consola del BAT — los errores aparecen ahí.

---

## Verificación post-compilación

```cmd
:: 1. Probar el agente Python standalone
dist\CerebroNicoAgent.exe
:: Debe escuchar en http://127.0.0.1:5000

:: 2. Probar el puente standalone
dist\cerebronico_bridge.exe
:: Debe escuchar en http://127.0.0.1:5000

:: 3. Probar la UI sin Electron
cd backend
npm run dev
:: Abrir http://127.0.0.1:3000

:: 4. Probar el instalador
dist_electron\"CerebroNico IDE Setup (1.4.0).exe"
```

---

## Estructura del proyecto (rápida)

```
ide/
├─ .env                              ← variables de entorno (GEMINI_API_KEY, etc.)
├─ __init__.py                       ← marcador de paquete (NO BORRAR)
├─ CerebroNicoAgent.spec             ← spec PyInstaller (backend FastAPI)
├─ cerebronico_bridge.spec           ← spec PyInstaller (puente :5000)
├─ build_backend.bat                 ← compila los 2 EXE Python
├─ requirements.txt                  ← deps Python (fastapi, uvicorn, pyinstaller)
├─ venv/                             ← entorno virtual Python (regenerable, NO se incluye en ZIP)
├─ dist/                             ← EXE Python compilados (sí se incluyen)
│  ├─ CerebroNicoAgent.exe
│  └─ cerebronico_bridge.exe
├─ backend/
│  ├─ package.json                   ← deps Node + config electron-builder
│  ├─ server.ts                      ← server Express + Vite + proxy AI
│  ├─ electron-main.cjs              ← proceso principal Electron
│  ├─ agent_bridge_5000.py           ← puente :5000 (Python)
│  ├─ iniciar_todo_windows.bat       ← arranca Ollama + server
│  ├─ compilar_exe_windows.bat       ← CADENA COMPLETA de compilación
│  ├─ arrancar_cerebronico.bat       ← arranca solo server (sin Ollama)
│  ├─ limpiar_ollama_windows.bat     ← limpia caché Ollama
│  ├─ .env                           ← variables backend
│  ├─ app/                           ← backend FastAPI (main.py + routers)
│  │  ├─ __init__.py                 ← marcador (NO BORRAR)
│  │  ├─ main.py                     ← entrypoint FastAPI
│  │  └─ routers/                    ← env.py, file.py, health.py, ping.py
│  ├─ src/                           ← frontend React + TypeScript
│  │  ├─ App.tsx                     ← orquestador principal
│  │  ├─ components/                 ← ChatCenter, RightSidebar, LeftSidebar, modales
│  │  ├─ utils/                      ← engine.ts (streamer), attachmentProcessor, etc.
│  │  └─ constants.ts                ← puertos + claves localStorage
│  ├─ tests/                         ← E2E tests (Python)
│  ├─ vite.config.ts                 ← config Vite (puerto 3000)
│  ├─ tsconfig.json
│  └─ node_modules/                  ← deps Node (regenerable, NO se incluye en ZIP)
└─ LEEME_CAMBIOS_v3.x.txt            ← changelog versiones anteriores
```

---

## Notas finales

- Los `__init__.py` vacíos **NO son basura**: son marcadores de paquete Python
  que FastAPI y PyInstaller necesitan para resolver los imports. Si los
  borras, el agente Python deja de funcionar.
- `node_modules/` y `venv/` no se incluyen en el ZIP (se regeneran con
  `npm install` y `iniciar_todo_windows.bat` respectivamente).
- `build/` y `dist_electron/` no se incluyen (son salidas de compilación).
- Los `.exe` ya compilados en `dist/` **sí se incluyen** como fallback
  para PCs sin Python.
