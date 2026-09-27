# -*- coding: utf-8 -*-
"""
Router para leer y escribir variables del archivo .env.
Utiliza las utilidades definidas en utils/env_manager.py.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
from ..utils.env_manager import get_env_variable, set_env_variable

router = APIRouter(tags=["Variables de entorno"])

class EnvSetRequest(BaseModel):
    """Modelo de solicitud para crear/actualizar una variable."""
    key: str = Field(..., description="Nombre de la variable")
    value: str = Field(..., description="Valor a asignar")

@router.get("/env/{key}", summary="Obtener variable .env")
async def read_env(key: str) -> dict:
    """
    Devuelve el valor de la variable solicitada.
    Si no existe, responde con 404.
    """
    value = get_env_variable(key)
    if value is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Variable '{key}' no encontrada."
        )
    return {"key": key, "value": value}

@router.post("/env", summary="Crear o actualizar variable .env")
async def write_env(payload: EnvSetRequest) -> dict:
    """
    Crea o actualiza la variable indicada en el archivo .env.
    """
    success, msg = set_env_variable(payload.key, payload.value)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=msg
        )
    return {"message": msg}