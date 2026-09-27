"""
engine.py — Motor de ejecución y sincronización.
================================================
Arma el prompt de sistema combinando la LEY (cerebro.md) con el ESTADO
(memoria.md), ejecuta la interacción y sincroniza la memoria de forma
determinista.

Diferencia clave con un chatbot normal: aquí el estado NO vive en el historial de
mensajes, vive en un archivo que se reescribe. Por eso un modelo pequeño puede
trabajar sin recordar la conversación: solo lee el estado actual.
"""

import re
from datetime import datetime

from .loader import ContextLoader


class AgentEngine:
    def __init__(self, cerebro_path="cerebro.md", memoria_path="memoria.md", llm=None):
        self.loader = ContextLoader(cerebro_path, memoria_path)
        # llm: callable(system_prompt, user_prompt) -> str. Se inyecta desde fuera
        # (Ollama, GLM, Gemini…) para que el motor no dependa de ningún proveedor.
        self.llm = llm

    # ---------------- Prompt de sistema ----------------
    def build_system_prompt(self, nivel: str = "standard") -> str:
        """Combina las leyes del cerebro y el estado actual de la memoria.

        `nivel` = micro | compact | standard | pro. En 'micro' solo se envía el
        estado en una línea: es lo que evita la fatiga de contexto.
        """
        cerebro = self.loader.load_cerebro().strip()
        estado = self.loader.read_block("ESTADO")
        incidencias = self.loader.read_block("INCIDENCIAS")
        recientes = "\n".join(l for l in incidencias.splitlines() if l.strip().startswith("-"))[-600:]

        if nivel == "micro":
            primera = estado.splitlines()[0] if estado else ""
            return (
                "=== NUCLEO (ley) ===\n"
                "1. No inventes datos, rutas ni nombres de herramientas; si no puedes, dilo.\n"
                "2. Sin relleno: ve a la solucion.\n"
                "3. Bloques de codigo completos con la ruta exacta.\n"
                # v8.0.1 — Ajuste pedido por el usuario: «solo responde la
                # respuesta». La plantilla de acta de la v2.0 se retira aquí
                # igual que en brain.ts (fuente única del ajuste: el usuario
                # recibe plantilla en vez de solución). Se prohíbe en positivo y
                # SIN escribir las etiquetas: nombrarlas es la vía más corta a
                # que un modelo diminuto las reproduzca.
                "4. Sin rotulos internos ni etiquetas de estado entre corchetes: "
                "ve directo a la solucion y al codigo.\n"
                "5. Si dudas entre dos rutas y ninguna es destructiva: no preguntes, "
                "elige la mas simple y avanza.\n"
                "=== ESTADO ===\n" + primera + "\n=== FIN ==="
            )

        partes = [
            "=== INICIO DE NÚCLEO (CEREBRO — ley obligatoria) ===",
            cerebro,
            "=== FIN DE NÚCLEO ===",
            "",
            "=== INICIO DE ESTADO ACTUAL (MEMORIA ejecutiva) ===",
            estado,
        ]
        if nivel != "compact" and recientes.strip():
            partes += ["", "**Fallos recientes que NO debes repetir:**", recientes.strip()]
        partes.append("=== FIN DE ESTADO ===")
        # v8.0.1 — Se retira el ACTA, no el contrato. Lo que ayuda de verdad
        # (no divagar, no preguntar de más, bloques con la ruta exacta) se
        # conserva; lo que sobra es el rótulo de estado, que en un modelo
        # diminuto se come el turno. Las etiquetas no se escriben aquí a
        # propósito (misma razón que en el nivel micro).
        partes += [
            "",
            "=== CONTRATO DE SALIDA ===",
            "Responde directamente, sin saludos ni despedidas y sin rotulos internos",
            "de acta ni etiquetas de estado entre corchetes. Primero la solucion; el",
            "codigo en bloques completos con la ruta exacta.",
            "",
            "BARANDILLA DE CONFIANZA: si dudas entre dos rutas y NINGUNA es destructiva,",
            "esta PROHIBIDO preguntar: elige la mas simple y rapida. Si la eleccion",
            "condiciona el resultado, dilo en UNA frase de prosa normal.",
            "Solo se pregunta si la accion es destructiva.",
            "=== FIN DEL CONTRATO ===",
        ]
        return "\n".join(partes)

    # ---------------- Interacción ----------------
    def process_interaction(self, user_prompt: str, nivel: str = "standard") -> str:
        """Pipeline: carga contexto -> infiere -> ejecuta -> persiste estado."""
        system_prompt = self.build_system_prompt(nivel)

        if self.llm is not None:
            respuesta = self.llm(system_prompt, user_prompt)
        else:
            # Sin cliente LLM conectado: respuesta explícita, nunca simulada.
            respuesta = ("[motor] No hay cliente LLM conectado. Pasa un callable en "
                         "AgentEngine(llm=...) para ejecutar de verdad.")

        # Auto-actualización determinista del estado (no depende del modelo).
        self.loader.update_block("ESTADO", "\n".join([
            "- **Timestamp de Última Actividad:** " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "- **Fase de Desarrollo Activa:** interacción procesada por el motor Python",
            "- **Último Hito Alcanzado:** " + (user_prompt[:120] or "(sin entrada)"),
            "- **Bloqueos Actuales:** ninguno.",
        ]))

        # Propuestas de auto-mejora del cerebro: se guardan, nunca se aplican solas.
        for prop in self.detect_proposals(respuesta):
            self.save_proposal(prop)

        return respuesta

    # ---------------- Auto-parcheo (propuestas) ----------------
    @staticmethod
    def detect_proposals(texto: str):
        """Detecta bloques [PROPUESTA DE AUTO-MEJORA CEREBRO] en la salida."""
        out = []
        patron = re.compile(r"\[PROPUESTA DE AUTO-MEJORA CEREBRO\](.*?)(?=\n\s*\n\s*\[|$)", re.S | re.I)
        for m in patron.finditer(texto or ""):
            cuerpo = m.group(1)
            def campo(nombre):
                mm = re.search(r"-\s*" + nombre + r"\s*:([^\n]*)", cuerpo, re.I)
                return mm.group(1).strip() if mm else ""
            motivo, linea, bloque = campo("Motivo"), campo("Línea a modificar"), campo("Nuevo bloque a inyectar")
            if motivo or bloque:
                out.append({"motivo": motivo, "linea": linea, "bloque": bloque or cuerpo.strip()})
        return out

    def save_proposal(self, prop: dict) -> str | None:
        """Guarda la propuesta en .cerebro-db/proposals/ para aprobación humana."""
        import os
        base = os.path.dirname(os.path.abspath(self.loader.memoria_path)) or "."
        destino_dir = os.path.join(base, ".cerebro-db", "proposals")
        os.makedirs(destino_dir, exist_ok=True)
        sello = datetime.now().strftime("%Y%m%d_%H%M%S")
        ruta = os.path.join(destino_dir, "propuesta_" + sello + ".md")
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(
                "# Propuesta de auto-mejora del CEREBRO\n\n"
                "- **Detectada:** " + datetime.now().strftime("%Y-%m-%d %H:%M:%S") + "\n"
                "- **Motivo:** " + (prop.get("motivo") or "(no indicado)") + "\n"
                "- **Línea a modificar:** " + (prop.get("linea") or "(no indicada)") + "\n\n"
                "## Nuevo bloque propuesto\n\n```markdown\n" + prop.get("bloque", "") + "\n```\n\n"
                "> NO se ha aplicado: cerebro.md solo lo modifica un humano.\n"
            )
        self.loader.append_block_line(
            "INCIDENCIAS",
            "- **" + datetime.now().strftime("%Y-%m-%d %H:%M") + "** Propuesta de auto-mejora pendiente de aprobación: "
            + (prop.get("motivo") or "(sin motivo)"),
        )
        return ruta
