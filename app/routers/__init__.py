# -*- coding: utf-8 -*-
"""
Paquete de routers para la aplicación FastAPI.

Exporta los routers para que `main.py` pueda hacer:

    from .routers import ping, env, file
"""

from .ping import router as ping
from .env import router as env
from .file import router as file
from .espejos_servidor import router as espejos_servidor

__all__ = [
    "ping",
    "env",
    "file",
    "espejos_servidor",
]