# -*- coding: utf-8 -*-
"""
Punto de entrada del agente CerebroNico (FastAPI).
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# --------------------------------------------------------------
# Import de routers (todos deben estar dentro de backend/app/routers)
# --------------------------------------------------------------
from .routers import ping, env, file, espejos_servidor  # health es opcional
# from .routers import health   # descomenta si lo creas

# --------------------------------------------------------------
# Configuración de la aplicación
# --------------------------------------------------------------
app = FastAPI(
    title="CerebroNico Agent",
    version="v3.3.2",
    description="Agente FastAPI que expone funcionalidades de CerebroNico.",
    docs_url="/docs",
    redoc_url="/redoc",
)

# --------------------------------------------------------------
# CORS (permitir cualquier origen durante desarrollo)
# --------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],            # Cambiar a dominios específicos en producción
    allow_credentials=True,
    allow_methods=["*"],           # ← cualquier método HTTP (GET, POST, …)
    allow_headers=["*"],           # ← cualquier encabezado
)

# --------------------------------------------------------------
# Registro de routers
# --------------------------------------------------------------
app.include_router(ping, prefix="")      # ✅ Usando directamente el router de ping
app.include_router(env, prefix="")       # ✅ Usando directamente el router de env
app.include_router(file, prefix="")      # ✅ Usando directamente el router de file
app.include_router(espejos_servidor, prefix="")  # ✅ Espejos por tipo de servidor

# --------------------------------------------------------------
# Ruta raíz (opcional, para confirmar que el servidor está vivo)
# --------------------------------------------------------------
@app.get("/", tags=["Información"])
async def root() -> dict:
    """
    Endpoint raíz que devuelve información básica del agente.
    """
    return {
        "service": "CerebroNicoAgent",
        "status": "running",
        "version": os.getenv("CEREBRONICO_VERSION", "v3.3.2"),
    }