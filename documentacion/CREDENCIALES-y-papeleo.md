# PAPELEO Y CREDENCIALES — qué hay que reunir

> ⚠️ **No es asesoramiento jurídico.** Aquí está el **inventario de datos y
> documentos** que hay que reunir, con los campos listos para rellenar. Cuáles
> se exigen, en qué formato y con qué tasas lo fija el organismo competente y
> **hay que confirmarlo con él o con un agente de propiedad industrial**. Los
> trámites cambian; esta lista es una ayuda de organización, no una norma.

Este archivo vive dentro del proyecto a propósito: **va en el paquete y se
actualiza con él**, así que el papeleo no se queda en un cajón aparte.

---

## 1. Datos del inventor (rellenar)

| Campo | Valor |
|---|---|
| Nombre y apellidos | Mario Nicolas Quintero Marin |
| Documento de identidad | *(pendiente: tipo y número)* |
| Nacionalidad | *(pendiente)* |
| Domicilio completo | *(pendiente)* |
| Correo de contacto | *(pendiente)* |
| Teléfono | *(pendiente)* |

## 2. Datos del solicitante (si es distinto del inventor)

| Campo | Valor |
|---|---|
| Persona física o jurídica | *(pendiente)* |
| Denominación | *(pendiente)* |
| Identificación fiscal | *(pendiente)* |
| Domicilio | *(pendiente)* |
| Representante legal | *(pendiente)* |

## 3. Poder de representación

- [ ] Decidir si se presenta por sí mismo o mediante agente/representante.
- [ ] Si hay representante: poder firmado y sus datos completos.
- [ ] *(pendiente: si el organismo exige el poder en forma legalizada)*

## 4. Documento técnico

- [x] **Memoria descriptiva** y reivindicaciones → `memoria-patente.md` (borrador
      vivo, versionado con el repositorio).
- [ ] Dibujos o figuras, si se aportan. Se numeran y se citan en la memoria.
- [ ] Resumen (abstract) de extensión limitada — el organismo fija el máximo.
- [ ] Listado de secuencias, si aplicara al sector. *(No parece aplicar.)*

## 5. Sobre la titularidad y la autoría

- [x] Autor y propietario declarado en el `README.md` y en la licencia.
- [ ] Revisar la titularidad de lo desarrollado durante jornada laboral o con
      medios de un tercero: puede condicionar quién puede solicitar.
- [ ] Revisar el aviso de copyright y los reconocimientos a terceros.

## 6. Antes de publicar en GitHub (importante para la prioridad)

Publicar el código **es una divulgación**. En muchos sistemas eso afecta a la
novedad si ocurre antes de presentar la solicitud, y algunos países conceden un
plazo de gracia que **no se aplica igual en todos**. Por eso:

- [ ] Confirmar con un profesional **el orden** entre publicar y presentar.
- [ ] Si se publica antes, dejar constancia de la **fecha exacta** de publicación
      (el propio historial del repositorio sirve de prueba).
- [ ] Decidir qué se publica: el código puede abrirse sin revelar el documento
      de patente, y viceversa.

## 7. Secretos que NUNCA deben subirse

`.gitignore` ya los excluye, pero conviene saberlo:

| Archivo | Qué contiene |
|---|---|
| `.cerebro-db/boveda.json` | La bóveda de claves |
| `.cerebro-db/espejos-salud.json` | Historial de uso de los espejos |
| `.env` | Variables de entorno con credenciales |
| `.proyectos/` | Tus proyectos y datos de trabajo |

> Antes del primer `git add .`, comprobar con `git status` que ninguna de esas
> rutas aparece en la lista de lo que se va a añadir.

## 8. Estado del papeleo

| Trámite | Estado |
|---|---|
| Memoria técnica | Borrador escrito, versionado |
| Reivindicaciones | Borrador (5), pendientes de revisión profesional |
| Datos del inventor | Parcial (falta documento, domicilio y contacto) |
| Datos del solicitante | Sin decidir |
| Dibujos | Sin decidir |
| Búsqueda de anterioridad | Sin hacer |
| Presentación | Sin fecha |
