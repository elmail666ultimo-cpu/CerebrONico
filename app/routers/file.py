# -*- coding: utf-8 -*-
"""
Router para operaciones de gestión de archivos dentro del IDE.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
import os

router = APIRouter(tags=["Archivos"])

class FileReadRequest(BaseModel):
    path: str = Field(..., description="Ruta relativa o absoluta del archivo a leer")

@router.post("/file/read", summary="Leer un archivo")
async def read_file(payload: FileReadRequest) -> dict:
    """
    Lee y devuelve el contenido de un archivo de texto.
    """
    if not os.path.exists(payload.path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El archivo '{payload.path}' no existe."
        )
    try:
        with open(payload.path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"path": payload.path, "content": content}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )