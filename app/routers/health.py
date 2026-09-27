# -*- coding: utf-8 -*-
"""
router: health
Endpoint mínimo para comprobar que el agente está activo.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get(
    "/health",
    summary="Chequeo de salud del agente",
    response_model=dict,
    tags=["Salud"],
)
async def health():
    """
    Responde con un JSON muy ligero que indica que el proceso está corriendo.
    Útil para monitoreo interno o para que la UI verifique disponibilidad.
    """
    return {"status": "ok", "service": "CerebroNicoAgent"}
```

> **Para habilitarlo**, descomenta en `ide/backend/app/main.py` las dos líneas relacionadas:
> ```python
> from .routers import health
> # …
> app.include_router(health.router, prefix="")   # <-- descomenta
> ```
