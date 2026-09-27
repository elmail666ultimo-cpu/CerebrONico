"""Núcleo del agente CerebroNico: carga de contexto, gobernanza y memoria viva."""
from .loader import ContextLoader
from .engine import AgentEngine

__all__ = ["ContextLoader", "AgentEngine"]
