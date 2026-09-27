# -*- coding: utf-8 -*-
"""
Router de espejos especializados por tipo de servidor de datos.

Expone el catálogo y la SELECCIÓN AUTOMÁTICA del experto más adecuado según el
contexto de la consulta. Lee `espejos_servidor/catalogo.json` (la instantánea
exportada de la fuente de verdad `src/engine/reflejo/tablas-servidor.json`), de
modo que esta implementación en Python y la de TypeScript
(`espejosServidor.ts`) comparten exactamente la misma regla de puntuación y
nunca divergen.

Selección:
  - consistente  → determinista; empates por orden de catálogo (estable)
  - extensible   → añadir un espejo al JSON se refleja aquí sin tocar código
  - segura       → consulta acotada, sin eval, sin red, sin disco
"""

import json
import re
import unicodedata
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(tags=["Espejos de servidor"])

LIMITE_CONSULTA = 4000

_CATALOGO_RUTA = (
    Path(__file__).resolve().parents[2] / "espejos_servidor" / "catalogo.json"
)


def _cargar_catalogo() -> dict:
    """Lee la instantánea del catálogo. Si falta, declara el motivo (nada silencioso)."""
    try:
        with open(_CATALOGO_RUTA, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "catálogo no generado. Ejecuta "
                "`node scripts/generar-respaldo-espejos-servidor.mjs` primero."
            ),
        )
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"catálogo corrupto: {exc}",
        )


def _sin_acentos(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )


def _normalizar(texto: str) -> str:
    return _sin_acentos(texto.strip().lower())


def _seleccionar(consulta: str) -> dict:
    catalogo = _cargar_catalogo()
    norm = _normalizar(consulta)
    tokens = set(re.split(r"[^a-z0-9_]+", norm))
    tokens.discard("")

    puntuados = []
    for indice, espejo in enumerate(catalogo.get("espejos", [])):
        score = 0
        for senal in espejo.get("senales", []):
            s = _normalizar(senal)
            if not s:
                continue
            if " " in s:
                if s in norm:
                    score += 2
            else:
                if s in tokens:
                    score += 2
                elif s in norm:
                    score += 1
        if score > 0:
            puntuados.append((indice, espejo, score))

    # Determinista y estable: mayor score, y en empate, orden de catálogo.
    puntuados.sort(key=lambda x: (-x[2], x[0]))

    ranking = [
        {
            "id": e["id"],
            "categoria": e["categoria"],
            "nombre": e["nombre"],
            "score": s,
        }
        for _, e, s in puntuados
    ]

    return {
        "ok": True,
        "consulta": consulta[:200],
        "mejor": ranking[0] if ranking else None,
        "ranking": ranking,
        "total": len(catalogo.get("espejos", [])),
        "motivo": (
            None
            if ranking
            else "sin coincidencias claras: reformula con el tipo de servidor "
                 "(ej. sql, mongo, redis, grafo, vector, métricas, colas, s3, "
                 "búsqueda, websocket)."
        ),
    }


class ConsultaRequest(BaseModel):
    """Modelo de solicitud para la selección automática de experto."""

    consulta: str = Field(..., description="Pregunta o tarea a clasificar")


@router.get(
    "/espejos-servidor/catalogo",
    summary="Catálogo de espejos por tipo de servidor",
)
async def catalogo() -> dict:
    """Devuelve categorías y espejos completos, desde la instantánea exportada."""
    catalogo = _cargar_catalogo()
    return {
        "ok": True,
        "version": catalogo.get("version"),
        "totalEspejos": len(catalogo.get("espejos", [])),
        "totalCategorias": len(catalogo.get("categorias", [])),
        "categorias": catalogo.get("categorias", []),
        "espejos": catalogo.get("espejos", []),
    }


@router.post(
    "/espejos-servidor/seleccionar",
    summary="Selecciona automáticamente el experto más adecuado",
)
async def seleccionar(payload: ConsultaRequest) -> dict:
    """Clasifica la consulta y devuelve el experto ganador + ranking ordenado."""
    consulta = payload.consulta.strip()
    if not consulta:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="la consulta está vacía.",
        )
    if len(consulta) > LIMITE_CONSULTA:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"la consulta supera {LIMITE_CONSULTA} caracteres.",
        )
    return _seleccionar(consulta)
