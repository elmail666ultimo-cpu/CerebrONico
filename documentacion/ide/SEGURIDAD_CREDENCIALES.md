# SEGURIDAD Y CREDENCIALES — CerebróNico v1.0.1

Regla madre: **el instalador es público; las claves son privadas.** Nada que lleve
una `sk-`, un token o una contraseña puede salir en un zip, un EXE o un repo.

## Lo que cambió el 20-sep-2026 (v1.0.1)

1. **El instalador ya no empaqueta `.env`.** La config de electron-builder
   (`ide/backend/package.json` → `build`) listaba `../backend/.env` como
   `extraResource` (y `".env"` en el listado): cualquier compilación en una
   máquina con claves reales las habría **incrustado dentro del EXE**.
   Eliminadas ambas entradas. El paquete solo lleva `.env.example` (plantilla
   sin valores).
2. **`cn.aduana`** (complemento de la tanda `cn.*`) hace de portero: antes de
   firmar una entrega escanea secretos (API keys, tokens, claves privadas,
   `.env`) y **BLOQUEA con motivo** si algo asoma. Úsalo antes de compartir
   cualquier proyecto.
3. **Verificación de artefactos**: `comprobar-integridad.mjs` +
   `MANIFIESTO_SHA256_v1.0.txt` — el zip se auto-demuestra, entrada por entrada.

## Para el desarrollador que monta CerebróNico (tú, u otro)

- Las claves viven **solo** en `ide/backend/.env` de TU máquina (copiar desde
  `.env.example`). Ese archivo está declarado fuera del empaquetado; no lo
  subas a repos compartidos ni lo incluyas en zips de descarga.
- Proveedores que leen de ahí: Z.ai (chat cloud), Gemini (imágenes, opcional).
  Sin `.env`, la IDE funciona igual en modo local (Ollama) — las nubes son
  opcionales, nunca obligatorias.

## Si alguna vez distribuiste un paquete con claves dentro

Trátalo como compromiso, no como descuido: **rota las claves** (panel de Z.ai /
Google AI Studio → regenerar), actualiza tu `.env` local con las nuevas, y
re-empaqueta. Las claves viejas dejan de servir; eso es lo único que borra el
pasado en internet.

## Checklist previo a CUALQUIER zip final o `npm run dist`

```bash
# 1. ¿hay .env reales en el árbol empaquetable? (solo debe existir el .example)
find . -name ".env" -not -path "*/node_modules/*"
# 2. ¿algún secreto con forma de secreto?
grep -rniE "(api[_-]?key|secret|token|password)[\"']?\s*[:=]\s*[\"'][A-Za-z0-9+/_=-]{16,}" \
  --include="*.*" . | grep -v ".env.example" | grep -v node_modules
# 3. cn.aduana desde la propia IDE (bloquea y firma) — o el barrido anterior por consola
# 4. node comprobar-integridad.mjs  → 0 MALAS · 0 FALTANTES
```

Nada de esto es fe: son cuatro comandos. Un producto que no puede probar que no
lleva secretos dentro, tampoco puede prometer que no los lleva.
