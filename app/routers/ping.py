# -*- coding: utf-8 -*-
"""
Router de salud básica.
Expone /ping que devuelve *pong* y la hora del servidor.
"""

from fastapi import APIRouter
from datetime import datetime

router = APIRouter(tags=["Salud"])

@router.get("/ping", summary="Comprobar disponibilidad")
async def ping() -> dict:
    """
    Endpoint de prueba rápida.
    """
    return {
        "message": "pong",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }