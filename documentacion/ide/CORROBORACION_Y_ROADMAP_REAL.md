# CORROBORACIÓN Y ROADMAP REAL — verificación de los 5 documentos recibidos
**Contra:** CerebroNico IDE v2.3 (motor de planes con imágenes) · **Fecha:** 19-sep-2026
**Método:** cada afirmación se buscó en el código real (grep/lectura), no en el catálogo.
Veredictos: ✅ CIERTO · 🟡 PARCIAL (existe pero no como lo cuenta) · ❌ FALSO (no existe) · 📋 RECOMENDACIÓN VÁLIDA (aún no está; puede hacerse)

## 0. LA TRAMPA QUE HAY QUE SABER ANTES DE LEER NADA
Los documentos citan «SKILL 7, 8, 21, 51, 52, 53, 55, 64, 66, 76» como si fueran código.
**No lo son.** `src/data/skills100.ts` es un **catálogo de texto**: solo 8 de las 100
entradas tienen `triggerCommand` real, y **92 describen capacidades que nunca se
construyeron** (hallazgo documentado el 18-sep). Un documento que "corrobora" el
proyecto citando SKILLs del catálogo está confirmando promesas, no hechos. Regla
permanente: **creer solo lo que tenga fichero, endpoint o prueba.**

## 1. MEJORAS_SOFTWARE_PRO.md (roadmap "grado industrial")
| Afirmación | Veredicto | Hecho en el código |
|---|---|---|
| Docker/Podman "vía puerto 5000" | 📋 + ❌ del "vía" | No hay Docker (0 en package.json). Y el :5000 es el **puente PC (HTTP/Flask para archivos)**, no una API de contenedores; el orquestador real sería Express :3000. La recomendación es válida; la arquitectura que supone, no. |
| Proxy de paquetes npm/pip | 📋 | No existe. Caché real hoy: `npm install` del sandbox. |
| Git nativo en UI | 📋 | Cero integración git (0 coincidencias en server.ts). Es el hueco más grande y real de la lista. |
| CRDT/Yjs multiusuario | 📋 | Yjs no está. Nota honesta: choca con el tope de 5 MB del workspace y con que el estado vive en localStorage. |
| DAP debugger | 📋 | No existe. |
| APM local (CPU/RAM/TPS) | 🟡 | **Ya hay monitor de CPU/RAM** (chips del Header, `hardwareGovernor.ts`, telemetría Ollama). Lo que falta: TPS y red. |
| SAST/secretos antes de exportar | 📋 | No existe. El `syntaxGuard` actual solo valida sintaxis/truncamiento. |
| Vault (PBKDF2+AES-GCM) para claves | 📋 | Hoy las claves viven en `.env` (servidor) sin cifrar en reposo. "SKILL 55 AES-GCM" es **catálogo sin código**. |
| Plugins Wasm | 📋 | El sistema de extensiones real es más simple y SÍ existe: `extensions/<id>/manifest.json + panel.html` (aisladas en iframe), con comandos `/…` y herramientas para el modelo. Ver §3. |

## 2. CEREBRONICO_CAPACIDADES_MAXIMAS.md
| Afirmación | Veredicto | Hecho |
|---|---|---|
| Autodespliegue: escribir→probar→ZIP→planes paralelos | 🟡 | Escribir/probar (guardián+10 suites)/empaquetar/planes: **cierto hoy**. "Desplegar sin intervención": no hay deploy; y el plan **no** despliega. |
| OCR multimodal desde capturas | ❌ | No hay modelo visual cableado. **Ahora el cerebro dibuja, pero no mira**: `generar_imagen` es salida, no entrada. |
| Refactorización AST masiva ("SKILL 51") | ❌ | Catálogo. El IDE tiene ediciones por texto y el `importChecker` con stubs, no transformaciones AST. |
| Auto-curación: fugas ("SKILL 66"), imports, rollback de memoria | 🟡 | `importChecker.ts` con generación de stubs: **CIERTO** (17 referencias, existe). `memoria.md` atómico + historial + volver a confirmación concreta: **CIERTO** (endpoint de rollback). "Fugas de memoria SKILL 66": catálogo. |
| Generación multimedia on-demand (`cerebronico:imagen`) | ✅ | **CIERTO desde v2.3**: cadena Pollinations gratuita + Gemini con clave, tarea de plan + orden de chat + miniaturas en el panel. 91 pruebas propias. |
| Auditoría OWASP ("SKILL 21") / AES-GCM ("SKILL 55") | ❌ | Catálogo sin código en ambos casos. |

## 3. GUIA_USO_EXTENSIONES.md
| Afirmación | Veredicto | Hecho |
|---|---|---|
| Anatomía `extensions/<id>/manifest.json + panel.html + icono` | ✅ | Existe tal cual: `extensions/cerebronico.panel-ejemplo/` con su manifest. |
| Habilitar/Deshabilitar + "Abrir" abre pestaña central aislada | ✅ | Coincide con `App.tsx` (pestañas centrales + iframe aislado). |
| Comandos `/contar`, `/informe` y herramientas `ext_…` para el modelo | ✅ | El ejemplo los trae; `skills100.ts` marca solo 8 entradas con `triggerCommand` — coherente con que las extensiones reales son las de `extensions/`, no el catálogo. |

## 4. ANALISIS_CEREBRO_MEMORIA_MULTISERIE.md
| Afirmación | Veredicto | Hecho |
|---|---|---|
| Chat local (Ollama :11434) + nube (OpenAI/Gemini/OpenRouter) | ✅ | Cierto: 6 plantillas de proveedor con clave. |
| 3 niveles de memoria: `memoria.md` atómica+historial / RAG vectorial / IndexedDB | 🟡 | `memoria.md` + `memoria_history`: **CIERTO**. RAG local: **existe** (`localRAG.ts`, indexación al guardar conocimiento) — "vectorial en RAM sin alucinaciones" es marketing: recupera por token/clave, no embeddings neuronales. IndexedDB: **existe** (`utils/indexedDBStorage.ts`) pero el WORKSPACE vive en **localStorage** (tope 5 MB); IndexedDB guarda otra cosa. |
| syntaxGuard bloquea escrituras | ✅ | Cierto, con la nota conocida: no comprueba balance de llaves en JS/TS (política deliberada). |
| importChecker auto-repara con stubs | ✅ | Cierto. |
| hardwareGovernor "monitorea TEMPERATURA" | ❌ | Mide CPU/RAM/carga; **0** referencias a temperatura. No mientas con lo que tu máquina no lee. |
| "Qué le falta": 1) motor de grafos DAG | ❌ del "falta" | **YA EXISTE**: `taskPlanner.ts` (nodos, `dependeDe`, detección de ciclos, despachador paralelo, cancelación, reanudación) + `planRunner` con semáforo global + presupuesto MR. El documento recomienda comprar lo que ya está construido. |
| 2) Model Router local/nube | 🟡 | Parcialmente existe: plantillas de proveedor + `modelo` por tarea/plan. Falta el *router por complejidad* — esa sí es una recomendación buena y barata. |
| 3) Bus de mensajes entre agentes | 📋 | No hay broker; hoy el intercambio es HTTP request/response. Recomendación válida para otra fase. |
| 4) Arbitraje de conflictos de archivo | 📋 | Hoy lo resuelve el semáforo + el orden del grafo; un árbitro por archivo no existe. |

## 5. MODO_PLANIFICADOR_Y_AUTOMATIZACION.md — el que más errores tiene
| Afirmación | Veredicto | Hecho real (léase esto, no el documento) |
|---|---|---|
| Esquema `cerebronico:plan` con `id/titulo/tipo/peso/datos/dependeDe` | ✅ | Exacto. Y el ejemplo con `generar_imagen` es válido **desde v2.3** (aunque `public/banner.png` saldría re-etiquetado a `.jpg` si los bytes son JPEG: la extensión la mandan los bytes). |
| "Backend FastAPI (:5000) ejecuta el plan en 4 fases" | ❌ | El planificador corre en **Express :3000** (`/api/brain/*`, `planRunner` en segundo plano). :5000 solo acerca el sistema de archivos del PC. |
| Valida ciclos, unicidad de ids, parámetros por tipo | ✅ | Cierto — y chat y motor usan la **misma** validación (`crearPlan`+`validarPlan`), probado palabra por palabra. |
| "Hilos independientes del sandbox" | ❌ | Nada de hilos: asíncrono en el proceso, con **presupuesto por tramos MR** (io/cpu ≥1 siempre) y semáforo global por peso. |
| "Resultado se inyecta en memoria viva (memoria.md)" | ❌ | Los planes viven en **`.cerebro-db/planes.json`** a propósito: si fueran conocimiento, el modelo los recibiría en cada prompt. |
| "Si una subtarea falla, el motor ABORTA el plan y hace ROLLBACK automático" | ❌❌ | **Lo contrario de la regla fundante del motor: TERMINAR SIEMPRE.** La tarea fallida se marca con su clase de error y su motivo; las independientes siguen; los 429 esperan 45 s y reintentan; el cortacircuito enfría en vez de abortar; al final queda `hecho/parcial/fallido` con la lista `sinHacer`. No hay rollback de archivos porque el motor **nunca escribe código por ti**: solo lee, convierte, genera imagen y guarda artefactos declarados. |

## 6. ROADMAP REAL, ORDENADO POR LO QUE YA EXISTE (honesto, con coste)
1. 🟢 **Modo serie para imágenes gratuitas** — la cola real es ~1/IP; un plan de N imágenes ya funciona pero choca contra 429 y espera. Un flag "imagen: en serie" (peso io→1 para el circuito `imagen`) elimina el 90 % de los reintentos. 1 día.
2. 🟢 **Pegar la imagen generada donde se vea**: orden `cerebronico:abrir` ya existe; falta una mini-orden que inserte `<img src="…">` en un archivo del workspace (texto, no binario → sin tocar el tope de 5 MB). 1–2 días.
3. 🟡 **Model Router por complejidad** (barato: ya hay `modelo` por tarea; falta una heurística local→nube en `chatOrders`/planner). Semana.
4. 🟡 **Git nativo** (el hueco real más grande; `simple-git` + panel; el workspace ya tiene rutas estables). Semana y media.
5. 🔴 **Entrada de imagen (visión)**: el OCR multimodal que el documento da por hecho **no existe**; requiere cablear un modelo con visión (Gemini sí, Ollama depende del modelo). Mes.
6. 🔴 **Docker/CRDT/DAP/Wasm**: recomendaciones legítimas pero cada una es una plataforma nueva; ninguna es "lo que le falta al cerebro". Meses.

**Antes de nada de esto: limpiar el catálogo.** `skills100.ts` sigue prometiendo 92
capacidades sin código y `contextCache.ts` se las inyecta al modelo como "activas".
Mientras eso siga ahí, cualquier documento externo (como los 5 corregeados aquí)
usará el catálogo como evidencia y el ciclo de promesas falsas se autoalimenta.
