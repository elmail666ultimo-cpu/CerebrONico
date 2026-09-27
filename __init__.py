# Marcador de paquete: convierte la carpeta `backend` en un paquete Python.
# NECESARIO para que `from backend.app.utils.env_manager import set_env_variable`
# (app/main.py del agente FastAPI) resuelva, y para que PyInstaller
# (build_backend.bat) analyse el paquete sin errores.
