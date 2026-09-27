@echo off
REM ============================================================
REM   CerebroNico IDE - Arranque completo en Windows
REM   Este BAT arranca en orden:
REM     1. Ollama en :11434 (con CORS y keep-alive infinito)
REM     2. npm run dev (server en :3000 + puente Python en :5000)
REM
REM   🔧 OLLAMA_KEEP_ALIVE=-1 mantiene el modelo cargado en RAM para siempre,
REM   evitando las desconexiones intermitentes cuando Ollama descarga el modelo
REM   tras 5 min de inactividad (comportamiento por defecto).
REM
REM   🔧 OLLAMA_ORIGINS=* habilita CORS para que el frontend pueda hablar
REM   directamente con Ollama si fuera necesario.
REM ============================================================
cd /d "%~dp0"
title CerebroNico IDE - Arranque Completo
color 0B

REM ----- 0. Raiz de datos: todo a C:\Cerebronico -----
REM v1.6.10 — El motor Y el puente de :5000 leen LA MISMA variable, asi que
REM proyectos, boveda de claves, espejos y conocimiento viven en un solo sitio
REM y no dentro de la carpeta extraida del ZIP (que se borra al reinstalar).
REM Si ya tienes PROJECT_DIR definido, se respeta y no se toca.
set "CEREBRONICO_DATOS=C:\Cerebronico"
if not exist "%CEREBRONICO_DATOS%" mkdir "%CEREBRONICO_DATOS%" >nul 2>nul
if not defined PROJECT_DIR set "PROJECT_DIR=%CEREBRONICO_DATOS%"
echo [INFO] Raiz de datos: %PROJECT_DIR%
echo.

echo ============================================================
echo   CerebroNico IDE - Arranque completo
echo ============================================================
echo.

REM ----- 1. Verificar que Ollama está instalado -----
where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo [ADVERTENCIA] Ollama no esta instalado en el PATH.
    echo Descargalo desde https://ollama.com
    echo El server arrancara igual, pero la inferencia local no funcionara.
    echo.
    pause
)

REM ----- 2. Verificar si Ollama ya está corriendo en :11434 -----
echo [INFO] Verificando si Ollama ya esta corriendo en :11434...
netstat -ano | findstr ":11434" | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Ollama ya esta corriendo en :11434.
    echo [TIP] Si tienes desconexiones, cierra Ollama y deja que este BAT lo reinicie
    echo        con OLLAMA_KEEP_ALIVE=-1 para mantener el modelo en RAM.
    goto :start_server
)

REM ----- 3. Arrancar Ollama en una ventana nueva con CORS + keep-alive infinito -----
echo [INFO] Arrancando Ollama con OLLAMA_KEEP_ALIVE=-1 (modelo siempre en RAM)...
start "Ollama Engine (Puerto 11434)" cmd /k "cd /d "%~dp0" && set OLLAMA_ORIGINS=* && set OLLAMA_HOST=0.0.0.0:11434 && set OLLAMA_KEEP_ALIVE=-1 && ollama serve"

REM ----- 4. Esperar a que Ollama esté listo -----
echo [INFO] Esperando a que Ollama este listo en :11434...
set WAIT_COUNT=0
:wait_ollama
timeout /t 1 /nobreak >nul
set /a WAIT_COUNT+=1
netstat -ano | findstr ":11434" | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Ollama listo en :11434 (espero %WAIT_COUNT%s).
    goto :start_server
)
if %WAIT_COUNT% geq 15 (
    echo [ADVERTENCIA] Ollama no respondio en 15s. Continuando de todos modos...
    goto :start_server
)
echo [INFO] Esperando Ollama... (%WAIT_COUNT%s)
goto :wait_ollama

:start_server
echo.
echo [INFO] Modelos disponibles en Ollama:
ollama list 2>nul
echo.
echo ============================================================
echo   Arrancando CerebroNico server en http://127.0.0.1:3000
echo   (el puente Python en :5000 se auto-inicia desde el server)
echo ============================================================
echo.
echo Abre tu navegador en:  http://127.0.0.1:3000
echo.
echo [TIP] Si los puertos se desconectan, usa el boton "Reconectar" en la
echo       pestaña "Puertos" del panel izquierdo de la UI.
echo.

REM ----- 5. Arrancar el server de CerebroNico -----
npm run dev

REM Si npm run dev termina, pausar para ver errores
pause
