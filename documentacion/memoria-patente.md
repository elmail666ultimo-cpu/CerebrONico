# MEMORIA DESCRIPTIVA — BORRADOR TÉCNICO

> ⚠️ **ESTE DOCUMENTO ES UN BORRADOR TÉCNICO, NO UNA SOLICITUD DE PATENTE.**
> No es asesoramiento jurídico. Los requisitos, el formato, las tasas y los
> plazos los fija el organismo de cada país y cambian: hay que confirmarlos con
> el organismo competente o con un agente de la propiedad industrial antes de
> presentar nada. Lo que sí es fiable aquí es la **descripción técnica**: está
> escrita leyendo el código de este repositorio, no de memoria.

- **Autor y propietario:** Mario Nicolas Quintero Marin
- **Copyright © 2026 Mario Nicolas Quintero Marin.** Todos los derechos reservados.
- **Versión del paquete a la que corresponde esta memoria:** 1.6.21
- **Estado:** borrador vivo — se actualiza con el repositorio.

---

## 1. TÍTULO DE LA INVENCIÓN

**Sistema y método de desarrollo integrado con orquestación híbrida
local-sandbox y motores de inferencia desacoplados.**

## 2. CAMPO TÉCNICO

La presente invención se refiere al campo de las herramientas de desarrollo de
software (Entornos Integrados de Desarrollo, IDE), los entornos de ejecución
aislada (*sandboxing*) y las arquitecturas de microservicios asistidas por
inteligencia artificial, con inferencia ejecutable de forma local.

## 3. ESTADO DE LA TÉCNICA

Las soluciones existentes dependen en exceso de arquitecturas monolíticas
basadas en la nube, o presentan un consumo elevado de recursos locales al
integrar motores de IA síncronos. Asimismo, carecen de aislamiento de procesos
entre la interfaz de usuario, la vista previa y los agentes de control autónomo,
y delegan en el modelo de lenguaje decisiones que pueden resolverse de forma
determinista en el propio sistema.

## 4. PROBLEMA TÉCNICO QUE RESUELVE

El sistema aborda tres fallos concretos, observados y medidos en la práctica:

1. **Acoplamiento entre interfaz, ejecución y control.** Un fallo en el motor de
   ejecución (la vista previa) inutiliza la herramienta completa en lugar de
   degradarse.
2. **Dependencia de la memoria del modelo.** El resultado de una tarea
   (por ejemplo, que exista un `package.json`) queda a expensas de que el modelo
   de lenguaje lo recuerde. Una promesa del modelo no es un invariante del
   sistema.
3. **Coste de arranque desproporcionado.** Previsualizar un proyecto exigía
   instalar su árbol de dependencias completo y levantar un servidor de
   desarrollo, con decenas de segundos de espera y fallo total ante un solo
   paquete ausente.

## 5. DESCRIPCIÓN DE LA INVENCIÓN

### 5.1 Arquitectura en capas desacopladas por puerto

El sistema se organiza en cuatro capas que se comunican exclusivamente por
puertos TCP locales, de modo que cada una puede caer sin derribar las demás:

| Puerto | Capa | Función |
|---|---|---|
| 3000 | Interfaz + API | Aplicación web (React) y servidor de coordinación |
| 3500 | Vista previa aislada | Sirve el proyecto del usuario en un proceso aparte |
| 5000 | Puente de control | Ejecuta comandos del sistema en el equipo del usuario |
| 11434 | Inferencia local | Motor de modelos (Ollama), opcional y sustituible |

El desacoplamiento es **verificable**: el arranque de la vista previa comprueba la
salud del puerto de forma independiente y reporta el motivo exacto de un fallo,
en lugar de propagarlo como un error genérico.

### 5.2 Raíz de datos conmutable y migración no destructiva

El sistema determina su directorio de datos mediante una variable de entorno, con
un valor por defecto derivado del directorio de trabajo. Sobre esa raíz resuelven
**todas** las capas, incluida la capa de control (puerto 5000), que lee la misma
variable. Una discrepancia entre ambas capas fragmentaría el almacenamiento en
dos raíces distintas con apariencia de correcto funcionamiento; el sistema la
evita por construcción.

Incluye además un procedimiento de **migración no destructiva**: copia el estado
(credenciales, métricas e historial) desde la raíz anterior hacia la nueva
únicamente si la nueva está vacía, sin sobrescribir jamás un dato existente y sin
borrar el origen, de modo que la operación es reversible.

### 5.3 Control de archivos y dependencias por validación de árbol

Antes de declarar un proyecto ejecutable, el sistema analiza el árbol sintáctico
de sus fuentes y resuelve cada referencia de importación contra el contenido real
del disco y las dependencias declaradas. Con ello:

- detecta imports no resueltos y **genera el andamiaje mínimo que falta**
  (manifiesto de dependencias con los paquetes realmente importados, documento
  de entrada), de forma que el resultado no depende de que el modelo lo recuerde;
- detecta paquetes importados y **no declarados**, e instala exactamente esos,
  evitando la instalación indiscriminada del árbol completo;
- impide la inclusión automática de artefactos de sistema, binarios efímeros y
  secretos de entorno en el material que se copia o se publica.

### 5.4 Previsualización por vía rápida sin instalación

El sistema elige, de forma determinista, la vía más barata capaz de producir una
previsualización válida:

1. **Servido directo** cuando el proyecto no requiere transformación.
2. **Empaquetado único** cuando requiere transformación: se compila una vez con
   una herramienta de empaquetado ya presente en el propio sistema, resolviendo
   las dependencias contra el árbol del sistema en lugar de instalar uno nuevo.
3. **Arranque del proyecto** sólo cuando se trata de un marco que aporta su
   propio servidor o cuando el proyecto ya está instalado y configurado.

La elección se documenta con su motivo. Criterio rector: una previsualización
parcial y honesta es preferible a una que mienta, y no previsualizar nunca debe
ser la respuesta cuando existe evidencia de contenido web.

### 5.5 Búfer de inferencia con recuperación

El flujo de respuesta del motor se interpreta mediante un búfer que aplica una
cascada de recuperación (lectura directa, reconstrucción de estructuras
truncadas, delimitadores de transporte, texto plano) y que **garantiza que el
texto se entregue aunque la estructura falle**, conservando el contenido que un
análisis estricto descartaría. Distingue además el trozo incompleto —que debe
esperar— del error de decodificación, e informa de la latencia medida en lugar de
la declarada por el propio motor.

### 5.6 Orquestación por espejos funcionales

La asignación de tareas a modelos se apoya en un catálogo de espejos con
estadísticas reales de uso, éxito y corrección, de modo que la elección se basa
en el comportamiento observado y no en una lista estática.

### 5.7 Motor de aspecto por secciones

La presentación se controla mediante reglas generadas en tiempo de ejecución y
ancladas por sección de la interfaz, con una jerarquía de precedencia explícita
que permite que una sección concreta prevalezca sobre el ajuste general.

## 6. VENTAJAS TÉCNICAS

- **Degradación aislada:** la caída de la vista previa no afecta a la interfaz ni
  al control.
- **Resultado invariante:** lo que el modelo olvida lo completa el sistema.
- **Arranque en milisegundos** frente a decenas de segundos de instalación.
- **Trazabilidad:** cada decisión automática se registra con su motivo, y las
  medidas (latencia, tamaño, errores) son propias, no declaradas por terceros.
- **Portabilidad de datos:** el usuario puede fijar dónde viven sus credenciales
  y su historial, y moverlos sin pérdida.

## 7. REIVINDICACIONES (BORRADOR)

**1.** Sistema de desarrollo integrado caracterizado por una arquitectura de
cuatro capas desacopladas que ocupan respectivamente los puertos 3000, 3500, 5000
y 11434, de modo que permiten la ejecución simultánea de la interfaz, la
previsualización, el control de microservicios y la inferencia local aislada,
**y** porque dichas capas resuelven su directorio de datos a partir de una misma
variable de entorno, con un procedimiento de migración que copia el estado hacia
una raíz nueva únicamente cuando ésta está vacía y sin borrar la anterior.

**2.** Método de control de archivos y dependencias según la reivindicación 1,
caracterizado por el uso de un motor de validación de árbol que analiza las
referencias de importación declaradas en las fuentes y, en función de ellas:
(a) genera el andamiaje mínimo ausente del proyecto, y (b) instala únicamente las
dependencias importadas y no declaradas, impidiendo además la inclusión
automática de artefactos de sistema, binarios efímeros y secretos de entorno.

**3.** Procedimiento de orquestación agéntica según la reivindicación 1, basado en
espejos funcionales con estadísticas de uso y corrección y en llamadas
deterministas dentro del propio sistema, sin consumo redundante de memoria del
motor de lenguaje.

**4.** Procedimiento de previsualización según la reivindicación 1, caracterizado
por seleccionar de forma determinista la vía más económica capaz de producir una
previsualización válida —servido directo, empaquetado único sin instalación de
dependencias nuevas, o arranque del propio proyecto— y por registrar el motivo de
la elección.

**5.** Búfer de interpretación del flujo de inferencia según la reivindicación 1,
caracterizado por aplicar una cascada de recuperación que entrega el contenido
textual aun cuando la estructura del mensaje no sea interpretable, y por
distinguir el mensaje incompleto del mensaje corrupto.

## 8. LO QUE FALTA POR COMPLETAR

Este borrador cubre la descripción técnica y las reivindicaciones. Para
presentarlo hace falta lo que **no puedo generar yo** y hay que confirmar con el
organismo competente o un agente de propiedad industrial:

- [ ] Organismo y vía de presentación (nacional / regional / PCT).
- [ ] Formulario oficial vigente y tasas aplicables.
- [ ] Datos completos del inventor y del solicitante (ver documento aparte).
- [ ] Búsqueda de anterioridad sobre las reivindicaciones 1 a 5.
- [ ] Fecha de prioridad y, si procede, divulgaciones previas.
- [ ] Revisión de redacción de las reivindicaciones por un profesional.
