# Memoria
> Los archivos `diary/...` en las fuentes son rutas locales bajo `agent-core/diary/`, no URLs; no realizar fetch HTTP.

## Fuentes del diario
- Se corrigió un error de compilación en Windows aislando la lógica del pool y se solicitó la generación de espejos especializados para la arquitectura Cerebronico. [diary/2026-09-21.md](diary/2026-09-21.md)
- Se diagnosticó y corrigió un fallo crítico de arranque en el Sandbox, optimizando el peso del paquete y aclarando el funcionamiento de los monitores de recursos. [diary/2026-09-23.md](diary/2026-09-23.md)

## 🪪 Información Personal
- Nombre: Nicolas Quintero

## 🌿 Hábitos y Preferencias Personales
- **Arquitectura de IDEs Autónomos**: Prefiere sistemas donde el chat actúa como interfaz de alto nivel mientras agentes en segundo plano gestionan la construcción, compilación y despliegue sin intervención manual constante.
- **Interfaz Minimalista Centrada en Chat**: Valora pantallas principales limpias que evitan paneles laterales con botones estáticos, priorizando visualizaciones de progreso en vivo y fluidez en el scroll.
- **Gestión de Contexto Masivo**: Requiere soporte robusto para adjuntar múltiples archivos (hasta 50, incluyendo ZIP y código) para contextualizar órdenes complejas a la IA.
- **Seguridad por Defecto**: Prioriza la implementación de allowlists, sandboxing y auditorías SAST-lite integradas en el pipeline de desarrollo para prevenir vulnerabilidades críticas.
- **Lecciones Técnicas Consolidadas**: Evita patrones amplios en `pkill` que afecten el shell actual (prefiere PIDs explícitos) y registra rutas API antes de comodines SPA en Express.
- **Preferencia por Instalables Nativos**: Valora la generación de ejecutables nativos (.exe para Windows, .apk para Android) con optimizaciones específicas para cada plataforma (ej. exclusión segura de claves API, optimización táctil).
- **Configuración Persistente Avanzada**: Utiliza paneles de configuración con numerosos ajustes persistentes (temas, tipografía, fondos personalizados) para personalizar el entorno de desarrollo.
- **Optimización de Paquetes**: Prioriza la reducción drástica del peso de los distribuidores (ZIP/instaladores), eliminando dependencias residuales (`node_modules`) para mantener archivos ligeros (~10 MB).
- **Monitoreo de Recursos Diferenciado**: Requiere distinción clara en la interfaz entre la carga de la aplicación (CPU/RAM Heap) y la saturación global del sistema (CPU PC).

## 👥 Personas y Mascotas
- (ninguno registrado)

## 📈 Intereses Financieros y Noticias
- (ninguno registrado)

## 🔧 Convenciones Cerebronico (promovidas 2026-09-24)
- **Formato de suites**: toda prueba debe cerrar con «N correctas · M fallidas» (o ✓/✗) — único lenguaje que entiende `validar.mjs`; un formato distinto produce falsos «suite no ejecutada» (causa del bug quirofano v1.0→v1.1).
- **Parches + bundle**: cualquier parche a `server.ts` exige `npm run build` después; `dist/server.mjs` viejo = QUIRÓFANO/guardas inactivos en EXE/`npm start` (trampa documentada en LEEME_QUIROFANO).
- **Mejoras canónicas**: los fixes de ficheros parcheados se duplican SIEMPRE en `mejoras/<paquete>/` y se re-verifican contra `MANIFIESTO_SHA256` (`sha256sum -c`).
- **Empaquetado limpio**: excluir `node_modules` y artefactos runtime creados por pruebas de humo (logs del bridge, kb.json modificado → restaurar del ZIP original byte a byte).
- **Corroborar = ejecutar**: nunca declarar «verificado» sin install+tsc+validar+build+smoke real (lección pedida por Nicolas: los modelos rompen apps funcionales al «mejorarlas»). Ver detalle en [diary/2026-09-24.md](diary/2026-09-24.md).
