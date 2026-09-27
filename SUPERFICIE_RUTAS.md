# SUPERFICIE DE RUTAS — orden de trabajo de la Fase 2

> **Generado** por `scripts/superficie.mjs` el 2026-09-25. No editar a mano.
> **Total:** 134 rutas · **server.ts:** 11425 líneas · **con guard:** 27
> **Progreso Fase 2:** por mover 121 · extraídas 13

Esto NO es documentación: es la lista de trabajo. Cada fila es un módulo que se extrae
de `server.ts` a `server/routers/<dominio>.ts` sin cambiar ni una ruta ni un comportamiento.
El contrato (`contrato-rutas.json`) impide que ninguna se pierda por el camino, y la
columna «Dónde» dice a quién le toca: si pone `server.ts`, aún hay que moverlo.

| Dominio | Rutas | Métodos | Con guard | Líneas (aprox.) | Dónde |
|---|---:|---|---:|---|---|
| `brain` | 17 | GET/POST | 1 | 3993–4451 | `server.ts` |
| `engine` | 13 | GET/POST | 1 | 4083–5659 | `server.ts` |
| `espejos` | 12 | GET/POST | 1 | 4747–5277 | `server.ts` |
| `extensions` | 8 | DELETE/GET/POST | 4 | 6134–6644 | `server.ts` |
| `features` | 7 | GET/POST | 0 | 3858–3908 | `server.ts` |
| `fs` | 6 | GET/POST | 6 | 8610–9222 | `server.ts` |
| `rag` | 6 | GET/POST | 0 | 3931–3987 | `server.ts` |
| `sandbox` | 6 | GET/POST | 5 | 5761–8462 | `server.ts` |
| `consejo` | 5 | GET/POST | 0 | 4665–5022 | `server.ts` |
| `boveda` | 4 | GET/POST | 1 | 4816–4872 | `server.ts` |
| `espejos-servidor` | 4 | GET/POST | 0 | 30–50 | `server/routers/espejosServidor.ts` |
| `fondo` | 4 | DELETE/GET/POST | 2 | 6166–6208 | `server.ts` |
| `ollama` | 3 | GET/POST | 0 | 171–5669 | `server.ts` + `server/routers/diagnostico.ts` |
| `puente` | 3 | GET/POST | 1 | 26–6241 | `server.ts` + `server/routers/puenteDependencias.ts` |
| `quirofano` | 3 | GET/POST | 2 | 2404–2476 | `server.ts` |
| `verifier` | 3 | GET/POST | 0 | 3800–3830 | `server.ts` |
| `export` | 2 | GET/POST | 1 | 5413–5454 | `server.ts` |
| `raiz` | 2 | GET | 0 | 6663–11323 | `server.ts` |
| `reflejo` | 2 | GET/POST | 0 | 4637–4645 | `server.ts` |
| `telemetry` | 2 | GET/POST | 0 | 59–110 | `server/routers/telemetria.ts` |
| `tts` | 2 | GET/POST | 0 | 3220–3224 | `server.ts` |
| `ai` | 1 | POST | 0 | 9494–9494 | `server.ts` |
| `artefacto` | 1 | POST | 0 | 2452–2452 | `server.ts` |
| `bridge` | 1 | POST | 0 | 11205–11205 | `server.ts` |
| `capacidades` | 1 | GET | 0 | 43–43 | `server/routers/capacidades.ts` |
| `cloud` | 1 | GET | 0 | 3494–3494 | `server.ts` |
| `conductor` | 1 | POST | 0 | 5308–5308 | `server.ts` |
| `contenedor` | 1 | POST | 1 | 6371–6371 | `server.ts` |
| `coreo` | 1 | GET | 0 | 6487–6487 | `server.ts` |
| `custom` | 1 | GET | 0 | 3564–3564 | `server.ts` |
| `entrada` | 1 | POST | 0 | 4887–4887 | `server.ts` |
| `exec` | 1 | POST | 1 | 8534–8534 | `server.ts` |
| `gemini` | 1 | GET | 0 | 3291–3291 | `server.ts` |
| `governor` | 1 | GET | 0 | 3849–3849 | `server.ts` |
| `health` | 1 | GET | 0 | 63–63 | `server/routers/diagnostico.ts` |
| `openai` | 1 | GET | 0 | 3385–3385 | `server.ts` |
| `openrouter` | 1 | GET | 0 | 3335–3335 | `server.ts` |
| `proyecto` | 1 | GET | 0 | 6442–6442 | `server.ts` |
| `subagents` | 1 | GET | 0 | 6765–6765 | `server.ts` |
| `system` | 1 | GET | 0 | 120–120 | `server/routers/telemetria.ts` |
| `zai` | 1 | GET | 0 | 3452–3452 | `server.ts` |

## Orden sugerido de extracción

1. **Primero los de lectura y pocos métodos** (los GET de dominios pequeños): riesgo bajo,
   y sirven para validar el mecanismo de extracción sin tocar nada que escriba.
2. **Después los dominios grandes pero independientes** (`brain`, `engine`, `espejos`).
3. **Al final los que tocan el chat y el sandbox** (`ai`, `sandbox`): son los que más estado
   comparten y donde el monolito está más enredado.

Regla de la casa durante toda la fase: **se mueve, no se mejora**. Al cerrar cada dominio,
la puerta debe dar el mismo número de comprobaciones que al empezar.
