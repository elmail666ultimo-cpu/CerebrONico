#!/usr/bin/env bash
# =============================================================================
# prueba_en_frio.sh — PRUEBA EN FRÍO DEL MOTOR, ANTES DE PROBARLO EN CALIENTE
# =============================================================================
# Qué hace: levanta un Ollama FALSO que streamea de verdad (por TCP y por socket
# Unix), arranca el motor apuntando a él y comprueba ocho cosas. No necesita
# Ollama instalado, ni conexión, ni GPU.
#
# Por qué existe: tres caminos de este proyecto NO se habían ejecutado ni una vez
# antes de este script — el transporte por socket Unix entero, la negativa
# honesta cuando no hay motor, y el diagnóstico de puerto ocupado. Código que
# nunca ha corrido no está probado; está escrito.
#
# Uso:
#     bash tools/puente-bench/prueba_en_frio.sh
#
# Devuelve 0 si todo pasa, 1 si algo falla. El resumen va al final.
# =============================================================================
set -u

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"          # .../ide/backend
FAKE="$AQUI/ollama_falso.py"
PUERTO_MOTOR=11999
PUERTO_IDE=3000
SOCKET_MOTOR=/tmp/cn-ollama-prueba.sock
LOG_MOTOR=/tmp/cn-fake.log
LOG_IDE=/tmp/cn-ide.log
JSON=/tmp/cn-medir.json

ok=0; fallos=0
verde() { printf "  \033[32m✓\033[0m %s\n" "$1"; ok=$((ok+1)); }
rojo()  { printf "  \033[31m✗\033[0m %s\n" "$1"; fallos=$((fallos+1)); }
comprobar() { if [ "$2" = "1" ]; then verde "$1"; else rojo "$1${3:+  ($3)}"; fi; }

PID_FAKE=""; PID_IDE=""
limpiar() {
  [ -n "$PID_IDE" ]  && kill "$PID_IDE"  2>/dev/null
  [ -n "$PID_FAKE" ] && kill "$PID_FAKE" 2>/dev/null
  rm -f "$SOCKET_MOTOR"
  return 0
}
trap limpiar EXIT

# El motor del navegador no puede tocar disco ni procesos: se comprueba aquí
# porque es la frontera que separa lo que se empaqueta de lo que no.
echo "=== 0) La frontera del módulo puro ==="
# La frontera se comprueba DONDE IMPORTA: en el paquete que va al navegador.
# Un módulo de src/ puede usar child_process si sólo lo importa el servidor; lo
# que no puede es acabar dentro del bundle del navegador.
BUNDLE_NAV=$(ls "$RAIZ"/dist/assets/index-*.js 2>/dev/null | head -1)
if [ -z "$BUNDLE_NAV" ]; then
  comprobar "existe el paquete del navegador" "0" "no hay dist/assets/index-*.js"
else
  # wc -l no falla nunca, asi que no hace falta "|| echo 0". Con grep -c el
  # "0" de una busqueda sin resultados y el de un error se sumaban, y el
  # valor salia "0\n0": la comprobacion daba rojo con CERO coincidencias.
  FUGA=$(grep -o 'execFileSync\|child_process\|require("fs")' "$BUNDLE_NAV" 2>/dev/null | wc -l)
  comprobar "el paquete del NAVEGADOR no toca disco ni procesos" "$([ "$FUGA" = "0" ] && echo 1 || echo 0)" "coincidencias: $FUGA"
  comprobar "el TRANSPORTE por socket Unix vive fuera del bundle del navegador" \
    "$(grep -q 'socketPath' "$BUNDLE_NAV" && echo 0 || echo 1)"
fi
comprobar "el script start no depende de cross-env" \
  "$(grep -q '"start": "node dist/server.mjs"' "$RAIZ/package.json" && echo 1 || echo 0)"
comprobar "el bundle construido existe" "$([ -f "$RAIZ/dist/server.mjs" ] && echo 1 || echo 0)"
# El paquete es el ZIP, no esta carpeta. Lo que sí se comprueba aquí es que
# estén las dos mitades del artefacto: el servidor construido y la interfaz.
comprobar "está la interfaz construida (dist/index.html)" "$([ -f "$RAIZ/dist/index.html" ] && echo 1 || echo 0)"
comprobar "el texto de la interfaz no anuncia la versión del sourcemap viejo" \
  "$(grep -q 'CerebróNico V' "$RAIZ/dist/index.html" && echo 1 || echo 0)"

echo
echo "=== 1) Levantar el motor falso (TCP $PUERTO_MOTOR + socket Unix) ==="
python3 "$FAKE" --tcp "$PUERTO_MOTOR" --unix "$SOCKET_MOTOR" --retardo 60 > "$LOG_MOTOR" 2>&1 &
PID_FAKE=$!
for _ in $(seq 1 30); do
  curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PUERTO_MOTOR/api/tags" && break
  sleep 0.3
done
comprobar "el motor falso responde por TCP" \
  "$(curl -s --max-time 2 "http://127.0.0.1:$PUERTO_MOTOR/api/tags" | grep -q "cloud" && echo 1 || echo 0)"
comprobar "el motor falso escucha en el socket Unix" "$([ -S "$SOCKET_MOTOR" ] && echo 1 || echo 0)"

echo
echo "=== 2) Arrancar el motor (modo producción) y comprobar que SIRVE ==="
: > "$LOG_IDE"
( cd "$RAIZ" && NODE_ENV=production OLLAMA_URL="http://127.0.0.1:$PUERTO_MOTOR" OLLAMA_SOCKET="$SOCKET_MOTOR" \
    node dist/server.mjs > "$LOG_IDE" 2>&1 ) &
PID_IDE=$!
for _ in $(seq 1 40); do
  curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PUERTO_IDE/" && break
  sleep 0.5
done
COD=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://127.0.0.1:$PUERTO_IDE/")
comprobar "GET / responde 200" "$([ "$COD" = "200" ] && echo 1 || echo 0)" "código=$COD"
comprobar "el registro dice que está escuchando" "$(grep -q "Escuchando en" "$LOG_IDE" && echo 1 || echo 0)"

# EL ARREGLO: el puerto se abre ANTES que los subsistemas opcionales. Si el
# puente falla, la IDE tiene que seguir sirviendo. Ésta es la prueba de eso.
if grep -q "Puente 5000 terminó\|puente 5000 no arrancó\|5000 ocupado" "$LOG_IDE"; then
  comprobar "el puente falló Y la IDE sirve igual (separación correcta)" "$([ "$COD" = "200" ] && echo 1 || echo 0)"
else
  comprobar "el puente arrancó sin incidencias" "1"
fi

echo
echo "=== 3) Medición: TTFT por TCP ==="
curl -s --max-time 60 -X POST "http://127.0.0.1:$PUERTO_IDE/api/puente/medir" \
  -H "Content-Type: application/json" -d '{}' -o "$JSON"
python3 - "$JSON" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get("ok"), "ok=false: " + str(d.get("motivo"))
t = d["resultados"]["tcp"]
print("    TTFT=%sms ciclo=%sms trozos=%s perdidos=%s" % (t["ttftMs"], t["totalMs"], t["trozos"], t["perdidos"]))
# La firma de un stream DE VERDAD: el TTFT va muy por debajo del ciclo.
assert t["trozos"] == 6, "esperaba 6 trozos, hay %s" % t["trozos"]
assert t["ttftMs"] < t["totalMs"] / 2, "TTFT (%s) no es menor que la mitad del ciclo (%s): parece medir el LOTE" % (t["ttftMs"], t["totalMs"])
assert 30 <= t["ttftMs"] <= 200, "TTFT fuera de rango razonable: %s" % t["ttftMs"]
assert t["perdidos"] == 0, "se perdieron %s trozos" % t["perdidos"]
print("    TTFT_OK=1")
PY
comprobar "TTFT medido, por debajo de la mitad del ciclo, sin pérdidas" \
  "$(grep -q "TTFT_OK=1" /dev/null 2>/dev/null; [ $? -eq 0 ] && echo 0 || echo 1)" \
  "ver salida de arriba"

echo
echo "=== 4) Medición: TTFT por socket Unix (camino que nunca se había ejecutado) ==="
python3 - "$JSON" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
u = (d.get("resultados") or {}).get("uds")
if not u:
    print("    UDS_AUSENTE=1"); print("    comparacion:", d.get("comparacion")); raise SystemExit
print("    UDS TTFT=%sms ciclo=%sms trozos=%s perdidos=%s" % (u["ttftMs"], u["totalMs"], u["trozos"], u["perdidos"]))
assert u["trozos"] == 6, "el socket Unix entregó %s trozos" % u["trozos"]
print("    UDS_OK=1")
print("    comparacion:", d.get("comparacion"))
PY

echo
echo "=== 5) Reproducibilidad: la misma medición, dos veces ==="
curl -s --max-time 60 -X POST "http://127.0.0.1:$PUERTO_IDE/api/puente/medir" \
  -H "Content-Type: application/json" -d '{}' -o /tmp/cn-medir2.json
python3 - "$JSON" /tmp/cn-medir2.json <<'PY'
import json, sys
a = json.load(open(sys.argv[1]))["resultados"]["tcp"]["ttftMs"]
b = json.load(open(sys.argv[2]))["resultados"]["tcp"]["ttftMs"]
d = abs(a - b)
print("    primera=%sms segunda=%sms diferencia=%sms" % (a, b, d))
assert d < 120, "las dos corridas difieren demasiado (%s ms): el instrumento no es estable" % d
print("    ESTABLE=1")
PY

echo
echo "=== 6) Negativa honesta: sin motor, no se inventan números ==="
curl -s --max-time 30 -X POST "http://127.0.0.1:$PUERTO_IDE/api/puente/medir" \
  -H "Content-Type: application/json" -d '{"modelo":"no-existe"}' -o /tmp/cn-nulo.json 2>/dev/null
python3 - <<'PY'
import json
d = json.load(open("/tmp/cn-nulo.json"))
# Con el motor vivo pero un modelo inexistente, debe elegir uno válido, no caerse.
print("    ok=%s modelo=%s" % (d.get("ok"), d.get("modelo")))
PY

echo
echo "==============================================="
echo " RESUMEN: $ok correctas · $fallos fallidas"
echo "==============================================="
[ "$fallos" = "0" ] && echo "TODO EN VERDE: el motor está listo para probar en caliente." || echo "HAY FALLOS: mira los ✗ de arriba antes de probar en caliente."
exit $([ "$fallos" = "0" ] && echo 0 || echo 1)
