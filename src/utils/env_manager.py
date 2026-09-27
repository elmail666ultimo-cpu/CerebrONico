import os, re
from pathlib import Path
from typing import Tuple

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

def _read_env() -> str:
    if not ENV_PATH.is_file():
        raise FileNotFoundError(f".env no encontrado en {ENV_PATH}")
    return ENV_PATH.read_text(encoding="utf-8")

def _write_env(content: str) -> None:
    ENV_PATH.write_text(content, encoding="utf-8")

def set_env_variable(key: str, value: str) -> Tuple[bool, str]:
    try:
        raw = _read_env()
        pattern = re.compile(rf"^{re.escape(key)}\s*=.*$", re.MULTILINE)
        if pattern.search(raw):
            new_content = pattern.sub(f"{key}={value}", raw)
            action = "actualizada"
        else:
            new_content = raw.rstrip() + f"\n{key}={value}\n"
            action = "añadida"
        _write_env(new_content)
        return True, f"Variable {key} {action} correctamente."
    except Exception as exc:
        return False, f"Error al modificar .env: {exc}"