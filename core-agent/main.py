"""
main.py — Punto de entrada del núcleo de gobernanza (puerto 5000 / CLI).
========================================================================
Uso:
    python main.py --prompt            Muestra el prompt de sistema resultante
    python main.py --estado "texto"    Actualiza el estado operativo
    python main.py --decision "texto"  Añade una decisión arquitectónica (ADR)
    python main.py --leccion "texto"   Añade una lección aprendida
    python main.py --historial         Lista las copias de la memoria
    python main.py --rollback archivo  Restaura una copia
    python main.py --demo              Prueba completa (atómica + rollback + propuestas)

Los archivos cerebro.md y memoria.md se buscan en la carpeta PADRE de core-agent/
(el backend de la IDE), para no tener dos fuentes de verdad.
"""

import argparse
import os
import sys

RAIZ = os.path.dirname(os.path.abspath(__file__))
PADRE = os.path.dirname(RAIZ)
CEREBRO = os.path.join(PADRE, "cerebro.md")
MEMORIA = os.path.join(PADRE, "memoria.md")

sys.path.insert(0, RAIZ)
from agent_core.engine import AgentEngine          # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Núcleo CEREBRO/MEMORIA de CerebroNico")
    ap.add_argument("--prompt", action="store_true", help="muestra el prompt de sistema")
    ap.add_argument("--nivel", default="standard", choices=["micro", "compact", "standard", "pro"])
    ap.add_argument("--estado", metavar="TEXTO", help="actualiza el hito del estado")
    ap.add_argument("--decision", metavar="TEXTO", help="añade una decisión al ADR Log")
    ap.add_argument("--leccion", metavar="TEXTO", help="añade una lección aprendida")
    ap.add_argument("--historial", action="store_true", help="lista las copias")
    ap.add_argument("--rollback", metavar="ARCHIVO", help="restaura una copia")
    ap.add_argument("--scan", metavar="ARCHIVO", help="busca propuestas de auto-mejora en un texto")
    ap.add_argument("--demo", action="store_true", help="prueba completa del ciclo")
    args = ap.parse_args()

    motor = AgentEngine(cerebro_path=CEREBRO, memoria_path=MEMORIA)
    cargador = motor.loader

    if args.prompt:
        print(motor.build_system_prompt(args.nivel))
        return 0

    if args.estado:
        ok = cargador.update_block("ESTADO", "\n".join([
            "- **Timestamp de Última Actividad:** (actualizado por CLI)",
            "- **Fase de Desarrollo Activa:** " + args.estado,
            "- **Último Hito Alcanzado:** " + args.estado,
            "- **Bloqueos Actuales:** ninguno.",
        ]))
        print("estado actualizado:", ok)
        return 0 if ok else 1

    if args.decision:
        linea = "- **" + args.estado if False else "- **CLI —** " + args.decision
        ok = cargador.update_block(
            "ESTADO", cargador.read_block("ESTADO") + "\n- ADR: " + args.decision)
        print("decision registrada:", ok)
        return 0 if ok else 1

    if args.leccion:
        ok = cargador.append_block_line("INCIDENCIAS", "- **CLI** lección: " + args.leccion)
        print("lección registrada:", ok)
        return 0 if ok else 1

    if args.historial:
        for h in cargador.list_history()[:20]:
            print(h["archivo"], h["bytes"], "bytes")
        return 0

    if args.rollback:
        print("rollback:", cargador.rollback(args.rollback))
        return 0

    if args.scan:
        with open(args.scan, "r", encoding="utf-8") as f:
            texto = f.read()
        props = motor.detect_proposals(texto)
        for p in props:
            print("propuesta guardada en:", motor.save_proposal(p))
        print("propuestas detectadas:", len(props))
        return 0

    if args.demo:
        return demo(cargador, motor)

    ap.print_help()
    return 0


def demo(cargador, motor) -> int:
    """Prueba real: escritura atómica, snapshot, rollback y detección de propuestas."""
    print("=== PRUEBA DEL NÚCLEO CEREBRO/MEMORIA ===")
    print("cerebro.md:", os.path.getsize(CEREBRO), "bytes ·", "memoria.md:", os.path.getsize(MEMORIA), "bytes")

    antes = cargador.load_memoria()
    cargador.update_block("ESTADO", "\n".join([
        "- **Timestamp de Última Actividad:** PRUEBA",
        "- **Fase de Desarrollo Activa:** prueba del núcleo",
        "- **Último Hito Alcanzado:** escritura atómica verificada",
        "- **Bloqueos Actuales:** ninguno.",
    ]))
    despues = cargador.load_memoria()
    print("1. escritura atómica:", "OK" if "PRUEBA" in despues else "FALLO")
    print("2. fuera de los bloques intacto:", "OK" if despues[:despues.find("<!-- BLOQUE")] in antes else "FALLO")

    historial = cargador.list_history()
    print("3. snapshot creado:", "OK" if historial else "FALLO", "(" + str(len(historial)) + " copias)")

    if historial:
        ok_rb = cargador.rollback(historial[0]["archivo"])
        print("4. rollback:", "OK" if ok_rb else "FALLO")

    texto = """Aquí va la respuesta del modelo.
[PROPUESTA DE AUTO-MEJORA CEREBRO]
- Motivo: el modelo usó una importación deprecada de FastAPI
- Línea a modificar: sección 4 (estándares)
- Nuevo bloque a inyectar: usar siempre `from fastapi import FastAPI` y evitar APIs deprecadas.
"""
    props = motor.detect_proposals(texto)
    print("5. propuestas detectadas:", len(props), "OK" if props else "FALLO")
    if props:
        print("6. propuesta guardada:", motor.save_proposal(props[0]) is not None)

    for nivel in ("micro", "compact", "standard", "pro"):
        p = motor.build_system_prompt(nivel)
        print(f"7. prompt nivel {nivel}: {len(p)} chars")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
