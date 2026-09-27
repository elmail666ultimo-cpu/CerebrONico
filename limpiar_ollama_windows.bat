@echo off
REM ============================================================
REM   Limpiar manifiestos corruptos de Ollama (Windows)
REM
REM   Tu log de Ollama muestra:
REM     - "bad manifest" name=registry.ollama.ai/library/qwen2.5-coder:desktop.ini
REM     - "failed to hydrate model list cache" model=qwen3.5:4b (blob faltante)
REM
REM   Esto causa errores 500 intermitentes en /api/tags y hace que el
REM   puerto 11434 parezca caído. Este script limpia los archivos corruptos.
REM ============================================================
cd /d "%~dp0"
title Limpiar Ollama - CerebroNico
color 0E

echo ============================================================
echo   Limpieza de manifiestos corruptos de Ollama
echo ============================================================
echo.

REM ----- 1. Borrar desktop.ini corrupto en manifests -----
set MANIFESTS_DIR=%USERPROFILE%\.ollama\models\manifests\registry.ollama.ai\library\qwen2.5-coder
if exist "%MANIFESTS_DIR%\desktop.ini" (
    echo [INFO] Borrando desktop.ini corrupto en %MANIFESTS_DIR%
    attrib -h -s "%MANIFESTS_DIR%\desktop.ini" 2>nul
    del /f /q "%MANIFESTS_DIR%\desktop.ini" 2>nul
    echo [OK] Borrado.
) else (
    echo [INFO] No se encontro desktop.ini en qwen2.5-coder (quizas ya esta limpio).
)

REM Buscar desktop.ini en todos los subdirectorios de manifests
echo.
echo [INFO] Buscando desktop.ini en todos los manifiestos...
for /r "%USERPROFILE%\.ollama\models\manifests" %%f in (desktop.ini) do (
    if exist "%%f" (
        echo [INFO] Borrando: %%f
        attrib -h -s "%%f" 2>nul
        del /f /q "%%f" 2>nul
    )
)
echo [OK] Limpieza de desktop.ini completada.

REM ----- 2. Verificar modelo qwen3.5:4b (blob faltante) -----
echo.
echo [INFO] El log muestra que qwen3.5:4b tiene un blob faltante.
echo        Para repararlo, ejecuta:
echo.
echo        ollama pull qwen3.5:4b
echo.
echo        O si no lo necesitas, borralo:
echo.
echo        ollama rm qwen3.5:4b
echo.

REM ----- 3. Listar modelos actuales -----
echo ============================================================
echo   Modelos actuales en Ollama:
echo ============================================================
ollama list 2>nul
echo.

REM ----- 4. Sugerencia final -----
echo ============================================================
echo   Limpieza completada.
echo   Reinicia Ollama (cierra la ventana "Ollama Engine" y vuelve
echo   a ejecutar iniciar_todo_windows.bat).
echo ============================================================
echo.
pause
