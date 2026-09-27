# -*- coding: utf-8 -*-
import os
import re
from pathlib import Path
from typing import Tuple, Optional

# Ruta absoluta del archivo .env (dos niveles arriba desde este archivo)
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

def _read_env() -> str:
    """Lee el contenido completo del .env."""
    if not ENV_PATH.is_file():
        # Si no existe, devuelve un string vacío en lugar de romper
        return ""
    return ENV_PATH.read_text(encoding="utf-8")

def _write_env(content: str) -> None:
    """Sobrescribe el .env con el contenido provisto."""
    ENV_PATH.write_text(content, encoding="utf-8")

def get_env_variable(key: str) -> Optional[str]:
    """
    Obtiene el valor de una variable desde el archivo .env o el entorno.
    """
    # 1. Intentar buscar directamente en el archivo .env con expresiones regulares
    try:
        raw = _read_env()
        pattern = re.compile(rf"^{re.escape(key)}\s*=\s*(.*)$", re.MULTILINE)
        match = pattern.search(raw)
        if match:
            val = match.group(1).strip()
            # Limpiar comillas si las tuviera envueltas (ej: KEY="valor")
            if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            return val
    except Exception:
        pass

    # 2. Respaldo: buscar en las variables de entorno del sistema o proceso
    return os.getenv(key)

def set_env_variable(key: str, value: str) -> Tuple[bool, str]:
    """
    Inserta o actualiza una variable en .env.
    - Si la clave ya existe, se reemplaza su valor.
    - Si no existe, se agrega al final del archivo.
    Retorna (éxito, mensaje).
    """
    try:
        raw = _read_env()
        # Busca la línea completa que empiece con la clave (ignora espacios)
        pattern = re.compile(rf"^{re.escape(key)}\s*=.*$", re.MULTILINE)

        if pattern.search(raw):
            # Reemplaza la línea existente
            new_content = pattern.sub(f"{key}={value}", raw)
            action = "actualizada"
        else:
            # Añade al final manteniendo una línea en blanco antes
            new_content = raw.rstrip() + f"\n{key}={value}\n" if raw else f"{key}={value}\n"
            action = "añadida"

        _write_env(new_content)
        return True, f"Variable {key} {action} correctamente."
    except Exception as exc:
        return False, f"Error al modificar .env: {exc}"