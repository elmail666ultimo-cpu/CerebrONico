@echo off
REM ============================================================
REM   CerebroNico IDE - Compilar el EXE instalable (Windows)
REM   Cadena completa de compilacion:
REM     [1/4] npm install         — instala dependencias Node
REM     [2/4] npm run build       — vite + esbuild (UI + server.ts)
REM     [3/4] build_backend.bat   — PyInstaller (CerebroNicoAgent.exe + cerebronico_bridge.exe)
REM     [4/4] npm run dist        — electron-builder (instalador NSIS + portable)
REM
REM   Genera:
REM     dist_electron\CerebroNico IDE Setup (version).exe  — instalador
REM     dist_electron\win-unpacked\CerebroNico IDE.exe     — portable
REM     dist\CerebroNicoAgent.exe                          — agente Python (fallback)
REM     dist\cerebronico_bridge.exe                        — puente :5000 (fallback)
REM ============================================================
cd /d "%~dp0"
title CerebroNico IDE - Compilador del EXE
color 0B

echo ============================================================
echo   CerebroNico IDE - Compilacion completa del instalador
echo ============================================================
echo.

REM 0. Verificar npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm no esta en el PATH. Instala Node.js desde https://nodejs.org
    pause
    exit /b 1
)

REM 1. Verificar Python (requerido para los .spec de PyInstaller)
where python >nul 2>nul
if %errorlevel% neq 0 (
    where py >nul 2>nul
    if %errorlevel% neq 0 (
        echo [ADVERTENCIA] Python no esta en el PATH.
        echo   Los .spec de PyInstaller requieren Python 3.10+.
        echo   Descargalo desde https://www.python.org/downloads/
        echo.
        echo   Si solo quieres el EXE de Electron (sin los agentes Python
        echo   fallback), puedes continuar. Los agentes se compilan SOLO
        echo   si Python esta presente.
        echo.
        pause
    )
)

REM 2. Instalar node_modules si faltan
if not exist "node_modules" (
    echo [1/4] Instalando dependencias Node ^(npm install^)...
    call npm install --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo [ERROR] npm install fallo.
        pause
        exit /b 1
    )
) else (
    echo [1/4] node_modules ya presente — OK.
)

REM 3. Build de la UI + server (vite + esbuild)
echo.
echo [2/4] Compilando interfaz y server ^(vite + esbuild^)...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] El build de vite/esbuild fallo. Revisa los errores de arriba.
    pause
    exit /b 1
)

REM 4. Build de los agentes Python (PyInstaller) — opcional pero recomendado
echo.
echo [3/4] Compilando agentes Python ^(PyInstaller^)...
if exist "%~dp0..\build_backend.bat" (
    call "%~dp0..\build_backend.bat"
    if %errorlevel% neq 0 (
        echo [ADVERTENCIA] build_backend.bat fallo. Continuando sin agentes Python.
        echo   El EXE de Electron se generara igual, pero el fallback Python
        echo   no estara disponible si la PC destino no tiene Python.
    )
) else (
    echo [ADVERTENCIA] No se encontro build_backend.bat. Saltando agentes Python.
)

REM 5. Empaquetar el EXE instalable con electron-builder
echo.
echo [4/4] Empaquetando el EXE con electron-builder ^(esto tarda varios minutos^)...
call npm run dist
if %errorlevel% neq 0 (
    echo [ERROR] electron-builder fallo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   LISTO. Compilacion completa:
echo.
echo   Instalador NSIS:
echo     dist_electron\CerebroNico IDE Setup ^(version^).exe
echo.
echo   Version portable:
echo     dist_electron\win-unpacked\CerebroNico IDE.exe
echo.
echo   Agentes Python ^(fallback^):
echo     dist\CerebroNicoAgent.exe
echo     dist\cerebronico_bridge.exe
echo.
echo   IMPORTANTE: copia/instala el EXE DENTRO de la carpeta del
echo   proyecto ^(o deja el win-unpacked ahi^) para que el autoarranque
echo   encuentre iniciar_todo_windows.bat y arranque solo, sin
echo   pantalla negra.
echo ============================================================
echo.
pause
