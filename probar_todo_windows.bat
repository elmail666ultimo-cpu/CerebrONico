@echo off
REM ============================================================
REM   CerebroNico v1.7.0 - PRUEBA COMPLETA (un clic)
REM ============================================================
REM   NO arranca la aplicacion. Comprueba que todo esta sano y dice el
REM   veredicto. Para arrancar y que se abra el navegador solo, usa
REM   iniciar_todo_windows.bat.
REM
REM   Los cinco pasos son los mismos que se ejecutaron para entregar esta
REM   version. Si alguno falla, este script dice CUAL y POR QUE — no hay
REM   que adivinar nada.
REM ============================================================
setlocal EnableExtensions
cd /d "%~dp0"
title CerebroNico v1.7.0 - Prueba completa
color 0E

set "FALLOS=0"

echo ============================================================
echo   CEREBRONICO v1.7.0 - PRUEBA COMPLETA
echo   Calculo mental: 5 pasos, y al final un veredicto.
echo ============================================================
echo.

echo [0/5] Comprobando herramientas...
where node >nul 2>nul
if %errorlevel% neq 0 goto :sin_node
where npm >nul 2>nul
if %errorlevel% neq 0 goto :sin_node
for /f "tokens=*" %%v in ('node --version 2^>nul') do echo        node %%v
for /f "tokens=*" %%v in ('npm --version 2^>nul') do echo        npm  %%v
echo.

echo [1/5] Dependencias (npm ci)...
if exist "node_modules\express" goto :dep_ok
echo        node_modules no esta: instalando. Esto tarda unos minutos.
call npm ci
if %errorlevel% neq 0 goto :fallo_dep
echo        Dependencias instaladas.
goto :paso_tipos

:dep_ok
echo        node_modules ya esta. Nada que instalar.

REM El codigo de salida se guarda en RC ANTES de tocar nada: %errorlevel% hay
REM que leerlo en la linea siguiente al comando, y `set /a` puede reescribirlo.
REM Sin esto, el script diria «[OK]» de un paso que acaba de fallar.
:paso_tipos
echo.
echo [2/5] Tipos (tsc --noEmit)...
call npx tsc --noEmit
set "RC=%errorlevel%"
if "%RC%"=="0" goto :tipos_ok
set /a FALLOS+=1
echo        [ROJO] Hay errores de tipos. Mira arriba el primero.
goto :paso_suites

:tipos_ok
echo        [OK] 0 errores de tipos.

:paso_suites
echo.
echo [3/5] Las 64 suites de pruebas (npm run validar)...
call npm run validar
set "RC=%errorlevel%"
if "%RC%"=="0" goto :suites_ok
set /a FALLOS+=1
echo        [ROJO] Alguna suite fallo. Arriba esta el nombre y la comprobacion.
goto :paso_manifiesto

:suites_ok
echo        [OK] Veredicto en verde.

:paso_manifiesto
echo.
echo [4/5] Integridad del paquete (manifiesto de los ficheros entregados)...
call npm run manifiesto:verificar
set "RC=%errorlevel%"
if "%RC%"=="0" goto :manifiesto_ok
set /a FALLOS+=1
echo        [ROJO] Algun fichero cambio o falta. Arriba dice CUAL.
goto :paso_resumen

:manifiesto_ok
echo        [OK] Los ficheros son exactamente los que se firmaron.

:paso_resumen

echo.
echo [5/5] Resumen
echo ------------------------------------------------------------
if %FALLOS% equ 0 goto :todo_verde
echo   HAY %FALLOS% PASO(S) EN ROJO. Lo de arriba dice cual y por que.
echo   (Un rojo de dependencias se arregla con: npm ci)
goto :fin

:todo_verde
echo   TODO VERDE. Esta copia es la entregada y esta sana.
echo.
echo   Siguiente: doble clic en iniciar_todo_windows.bat
echo   (arranca todo y abre el navegador solo en http://127.0.0.1:3000)
goto :fin

:sin_node
echo.
echo   [ROJO] No encuentro Node.js en el PATH.
echo          Instalalo desde https://nodejs.org (version LTS) y vuelve a
echo          ejecutar este .bat.
goto :fin

:fallo_dep
echo.
echo   [ROJO] npm ci fallo. Suele ser falta de red o una version de Node
echo          demasiado vieja (hace falta Node 18 o superior).
set /a FALLOS+=1
goto :fin

:fin
echo ------------------------------------------------------------
echo.
pause
endlocal
exit /b 0
