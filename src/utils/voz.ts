/**
 * voz.ts — ELECCIÓN DE LA VOZ DEL NAVEGADOR (v8.0.4)
 * ====================================================
 * Petición que originó este archivo: «esto de audio en el chat no funciona
 * cuando reproduzco el chat en audio, sale siempre la voz robótica standard».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA VOZ ROBÓTICA NO ERA UN DEFECTO DE SONIDO: ERA UN `find()` DEMASIADO PRISA
 * ─────────────────────────────────────────────────────────────────────────────
 * El código anterior hacía, literalmente, esto:
 *
 *     const voices = synth.getVoices();
 *     const esVoice = voices.find((v) => v.lang.startsWith("es"));
 *     if (esVoice) utter.voice = esVoice;
 *
 * Dos problemas, y cada uno basta por sí solo para producir exactamente lo que
 * el usuario describía:
 *
 * 1) **`getVoices()` devuelve una lista VACÍA la primera vez que se llama.**
 *    Las voces del sistema se cargan de forma asíncrona; hasta que el navegador
 *    no termina, la lista está vacía y el evento `voiceschanged` avisa cuando
 *    por fin hay algo. Este código no lo escuchaba nunca. Resultado: `esVoice`
 *    quedaba `undefined`, **no se asignaba `utter.voice`**, y sonaba la voz por
 *    defecto del sistema. En Linux esa por defecto suele ser eSpeak, que es el
 *    sintetizador robótico de toda la vida. No fallaba siempre por casualidad:
 *    fallaba siempre por construcción.
 *
 * 2) **El primero de la lista no es el mejor.** `find()` devuelve el primer
 *    `es` que aparezca, y el orden de `getVoices()` no está normalizado: en
 *    Windows suele empezar por la voz de sistema y no por las naturales, en
 *    Chrome por las de red. Elegir «el primero» es elegir al azar con pasos
 *    extra.
 *
 * Aquí se hace lo contrario: se puntúan TODAS y se elige la mejor, con el
 * idioma como criterio que pesa más que la calidad (una voz natural en inglés
 * leyendo español es peor que una robótica en español), y se marca cuándo la
 * ganadora es robótica para poder DECIRLO en vez de fingir que suena bien.
 *
 * Módulo puro, sin DOM: recibe la lista ya obtenida y devuelve una decisión. Por
 * eso se puede probar de verdad, con casos difíciles, sin un navegador.
 */

/** Lo mínimo que necesitamos de una `SpeechSynthesisVoice`. */
export interface VozCandidata {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}

export interface VozElegida<T extends VozCandidata> {
  voz: T;
  puntuacion: number;
  /** Frase explicativa, lista para enseñar al usuario. */
  motivo: string;
  /** true si la ganadora es un sintetizador robótico (eSpeak, Festival…). */
  robotica: boolean;
}

/**
 * Motor natural ≠ motor robótico. Los nombres concretos salen de las voces que
 * instalan las plataformas reales: Chrome trae «Google español», Windows trae
 * «Microsoft Sabina/Pablo», macOS trae «Mónica/Paulina», y los entornos Linux
 * sin escritorio traen «eSpeak NG», que es el que suena a ordenador de 1985.
 */
const VOZ_NATURAL = /\bgoogle\b|\bmicrosoft\b|natural|neural|online|premium|enhanced|siri|apple|mónica|monica|paulina|helena|sabina|elvira|pablo|jorge|diego|carlos|laura|\blucia\b/i;
const VOZ_ROBOTICA = /espeak|e[_ -]?speak|festival|\bflite\b|\bpico\b|robot|\bsam\b|dectalk|mbrola/i;

export function esVozRobotica(nombre: string): boolean {
  return VOZ_ROBOTICA.test(String(nombre || ""));
}

/** «es-ES» → «es». Sin idioma → cadena vacía (y eso se penaliza, no se ignora). */
export function normalizarIdioma(lang?: string): string {
  return String(lang || "").trim().toLowerCase().split(/[-_]/)[0] || "";
}

/**
 * Traduce el código de idioma de la interfaz a un idioma de VOZ.
 * El español es el caso que importa: `es` a secas no distingue España de México,
 * y la misma frase suena distinta. Se prefiere la variante del entorno.
 */
export function idiomaDeVozPreferido(idiomaUi?: string): string {
  const n = normalizarIdioma(idiomaUi) || "es";
  if (n === "es") return "es-ES";
  if (n === "pt") return "pt-BR";
  if (n === "en") return "en-US";
  return n;
}

/**
 * Puntúa una voz. Los pesos NO son decorativos, están puestos para que el orden
 * de prioridades sea exactamente este:
 *
 *   1º que hable tu idioma   (±40 / −60)  ← pesa más que todo lo demás junto
 *   2º que no sea robótica   (−50)
 *   3º que sea natural       (+30)
 *   4º que sea online/premium (+8 / +6)   ← suelen ser las neuronales
 *
 * Por qué 1º manda sobre 3º: una voz natural INGLESA leyendo un texto español
 * pronuncia mal cada palabra y encima se entiende peor que una robótica en
 * español. Para leer en voz alta, el idioma no es una preferencia, es un
 * requisito. De ahí que otro idioma se reste (−60) en vez de simplemente no
 * sumar: así una voz robótica en español (40−50 = −10) le gana a una natural en
 * inglés (−60+30 = −30), que es lo que el usuario quiere oír.
 */
export function puntuarVoz(v: VozCandidata, idiomaPreferido: string = "es-ES"): number {
  if (!v || !v.name) return -1000;
  let p = 0;

  const idioma = normalizarIdioma(v.lang);
  const pref = normalizarIdioma(idiomaPreferido);

  if (!idioma) {
    p -= 20; // Sin idioma declarado: no se puede confiar en que lea bien.
  } else if (idioma === pref) {
    p += 40;
  } else {
    p -= 60; // Otro idioma: descartada salvo que no haya nada mejor.
  }

  if (esVozRobotica(v.name)) p -= 50;
  else if (VOZ_NATURAL.test(v.name)) p += 30;

  // `localService === false` significa que la voz se sintetiza en la nube: casi
  // siempre es una neuronal de calidad. `undefined` NO se premia, porque no
  // sabemos nada y premiar la duda es inventarse información.
  if (v.localService === false) p += 8;
  if (/premium|enhanced|plus/i.test(v.name)) p += 6;
  if (v.default) p += 4;

  return p;
}

/**
 * Elige la mejor voz de la lista. `null` cuando no hay ninguna: eso NO es un
 * error, es el estado normal durante el primer segundo de vida de la página
 * (ver el problema 1 de la cabecera), y quien llame debe reintentar.
 *
 * El empate se rompe por ORDEN DE LA LISTA, no alfabéticamente: el orden de
 * `getVoices()` refleja de algún modo la preferencia del sistema, y es la única
 * señal adicional que existe.
 */
export function elegirMejorVoz<T extends VozCandidata>(
  voces: T[],
  idiomaPreferido: string = "es-ES"
): VozElegida<T> | null {
  if (!Array.isArray(voces) || voces.length === 0) return null;

  let mejor: T | null = null;
  let mejorPunto = -Infinity;

  for (const v of voces) {
    if (!v || !v.name) continue;
    const p = puntuarVoz(v, idiomaPreferido);
    if (p > mejorPunto) {
      mejorPunto = p;
      mejor = v;
    }
  }
  if (!mejor) return null;

  const robotica = esVozRobotica(mejor.name);
  const idioma = normalizarIdioma(mejor.lang);
  const pref = normalizarIdioma(idiomaPreferido);

  let motivo: string;
  if (idioma !== pref) {
    motivo = `No hay ninguna voz en ${pref} instalada; se usa «${mejor.name}» (${mejor.lang}), que leerá con acento.`;
  } else if (robotica) {
    motivo = `La única voz en ${pref} que hay es robótica («${mejor.name}»). Para voz natural, usa las voces Gemini (requieren clave) o instala una voz del sistema.`;
  } else {
    motivo = `Voz elegida: «${mejor.name}» (${mejor.lang}).`;
  }

  return { voz: mejor, puntuacion: mejorPunto, motivo, robotica };
}

/**
 * ¿Hay alguna voz en el idioma pedido? Sirve para avisar ANTES de que el usuario
 * pulse «Escuchar» en vez de después.
 */
export function hayVozEnIdioma(voces: VozCandidata[], idioma: string = "es-ES"): boolean {
  const pref = normalizarIdioma(idioma);
  return (voces || []).some((v) => normalizarIdioma(v?.lang) === pref);
}

/**
 * v1.13.0 — EL AVISO DE VOZ, EN UNA FRASE.
 * QUÉ ES: dos funciones puras que recortan el motivo y montan el aviso.
 * PARA QUÉ SIRVE: para que un error de Gemini no pueda volver a pintar mil
 * caracteres de JSON dentro de un banner. El mensaje técnico se recorta aquí y el
 * volcado completo se va al registro (lo manda el servidor en `detalle`).
 */
export function acortarMotivo(motivo: string, max = 160): string {
  const t = (motivo || "").replace(/\s+/g, " ").trim();
  if (!t) return "sin detalles";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** La frase del aviso: siempre la misma forma, siempre corta. */
export function avisoDeVozNoDisponible(voice: string, motivo: string): string {
  return `Voz Gemini «${voice}» no disponible: ${acortarMotivo(motivo)} — se usa la voz del navegador.`;
}
