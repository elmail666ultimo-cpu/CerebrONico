/**
 * estadoRescate.ts — RESCATE v1 (v1.6.23): el estado de CerebroNico se MUDA
 * antes de nuklear el sandbox; no muere con el proyecto.
 * ============================================================================
 * Reporte original: «todo archivo que sea de utilidad para CerebroNico mudalo
 * de carpeta, y en la carpeta .proyectos borra todo». El problema es que el
 * cerebro del motor vive DENTRO de PROJECT_ROOT (.proyectos): las dos carpetas
 * que el propio proyecto declara como estado (`CARPETAS_DE_ESTADO` de
 * raizDatos.ts: `.cerebro-db` —kb, espejos, salud, bóveda, leyes, entidades,
 * verifier, RAG, proposals— y `.cerebronico` —espejos personalizados,
 * server.ts:4246—) están en el mismo directorio que «Borrar todo» del editor
 * destruye con `/api/fs/nuclear-wipe` (App.tsx → handleDeleteAllFiles). Sin
 * este paso, vaciar el editor se llevaba puesta toda la memoria aprendida —
 * un fallo silencioso del tamaño del proyecto.
 *
 * Decisión (las reglas viven acá, puras y probables; el endpoint ejecuta):
 *   1. SNAPSHOT completo de cada carpeta de estado + docs a
 *      <app>/.cerebro-db/rescate/<iso-timestamp>/ — nunca overwrite.
 *   2. FUSIÓN de los archivos NUEVOS (que no existen en el destino permanente)
 *      hacia <app>/.cerebro-db/ — lo que ya está no se toca: manda el
 *      snapshot para la diferencia.
 *   3. MEMORIA.md y skills.md del sandbox (copias del sync) viajan al snapshot.
 *   4. RESEMBRA: borrado el sandbox, cada carpeta de estado se copia DE VUELTA
 *      desde su lugar permanente (menos `rescate/`), para que espejos,
 *      conocimiento, bóveda y verifier sigan funcionando tras el vaciado.
 *   5. Si el estado existía y el snapshot NO se pudo crear, el vaciado se
 *      ABORTA: integridad antes que destrucción. Un rescate a medias equivale
 *      a no rescatar.
 */

export type VeredictoRescate = {
  /** ¿Había carpeta de estado en el sandbox? (no había → no hay nada que rescatar) */
  existeEstado: boolean;
  /** ¿El snapshot se creó? */
  snapshotOk: boolean;
  /** Errores encontrados durante snapshot/fusión/docs. Vacío = limpio. */
  errores: string[];
};

export type ResumenRescateInput = {
  trasladados: number;
  conservados: number;
  snapshot: string;
  docs: string[];
  errores: string[];
};

/**
 * Plan de fusión entre dos árboles de estado, sobre listas de rutas relativas.
 * - solo en origen            → «trasladar» (es nuevo, no hay nada que pisar)
 * - también en destino        → «conservar» (NO se pisa: el snapshot guarda el nuestro)
 * Nunca existe un caso «pisar»: si apareciera, es un error de diseño y la
 * lista lo delataría. Duplicados en la entrada se colapsan (un archivo, una acción).
 */
export function planearFusion(
  origenes: string[],
  enDestino: (rel: string) => boolean
): { trasladar: string[]; conservar: string[] } {
  const trasladar: string[] = [];
  const conservar: string[] = [];
  const vistos = new Set<string>();
  for (const rel of origenes || []) {
    if (!rel || typeof rel !== "string") continue;
    if (vistos.has(rel)) continue;
    vistos.add(rel);
    if (enDestino(rel)) conservar.push(rel);
    else trasladar.push(rel);
  }
  return { trasladar, conservar };
}

/** Nombre de carpeta-snapshot a partir de un ISO: sin «:» ni «.» (seguro en FAT/NTFS). */
export function nombreRescate(iso: string): string {
  return String(iso || "").replace(/[:.]/g, "-");
}

/** Ruta RELATIVA del snapshot dentro de la carpeta de estado permanente. */
export function rutaRelRescate(iso: string): string {
  return ["rescate", nombreRescate(iso)].join("/");
}

/**
 * GUARDA-D (v1.6.23): ¿hay que respaldar la raíz antes de fundir el
 * anidado? Sí cuando los dos declaran NOMBRES de paquete distintos: eso no
 * es «la copia más nueva del mismo proyecto», son DOS proyectos distintos y
 * el fundido silencioso pisaba la app de la raíz (el incidente que convirtió
 * `codigo-cerebronico` en el proyecto del sandbox y mató el :3500).
 * Un nombre nulo (sin package.json a un lado) no es conflicto: no hay dos
 * proyectos que chocar, y el fundido hace lo que siempre hizo.
 */
export function decidirRespaldo(
  nombreRaiz: string | null,
  nombreAnidado: string | null
): { respaldar: boolean; motivo: string } {
  if (!nombreRaiz || !nombreAnidado) {
    return { respaldar: false, motivo: "Un lado no declara package.json: no hay dos proyectos que chocar." };
  }
  if (nombreRaiz === nombreAnidado) {
    return { respaldar: false, motivo: `Mismo proyecto («${nombreRaiz}»): manda la copia sincronizada, como siempre.` };
  }
  return {
    respaldar: true,
    motivo: `La raíz declara «${nombreRaiz}» y el anidado «${nombreAnidado}»: proyectos distintos — se respalda la raíz antes de fundir.`,
  };
}

/**
 * RESEMBRA v1: tras el vaciado, qué rutas relativas del estado permanente
 * deben volver al sandbox para que el motor siga funcionando como si nada.
 * Regla: TODO archivo de estado vuelve — EXCEPTO el histórico de snapshots
 * (`rescate/...`), que es copia de seguridad y no le pertenece al sandbox.
 * Sin esta regla, cada vaciado re-sembraría sus propios backups y el
 * .cerebro-db del sandbox crecería para siempre.
 */
export function planReSembrado(relsPermanentes: string[]): string[] {
  return (relsPermanentes || []).filter(
    (rel) => rel && rel !== "rescate" && !rel.startsWith("rescate/")
  );
}

/**
 * ¿Puede avanzarse con el vaciado? Solo si no había estado que rescatar,
 * o si el snapshot está creado y no quedó NINGÚN error en el proceso.
 * El motivo que devuelve es literal para el log: nunca «error» a secas.
 */
export function procederBorrado(v: VeredictoRescate): { seguir: boolean; motivo: string } {
  if (!v.existeEstado) return { seguir: true, motivo: "No había estado de CerebroNico en el sandbox: nada que rescatar." };
  if (!v.snapshotOk) {
    return {
      seguir: false,
      motivo:
        "El snapshot del estado falló" +
        (v.errores && v.errores.length ? `: ${v.errores.join(" · ")}` : " (sin detalle)") +
        " — el vaciado se ABORTÓ para no destruir la memoria.",
    };
  }
  if (v.errores && v.errores.length) {
    return {
      seguir: false,
      motivo: `El rescate terminó con errores: ${v.errores.join(" · ")} — el vaciado se ABORTÓ (integridad antes que destrucción).`,
    };
  }
  return { seguir: true, motivo: "Estado a salvo en el snapshot: se puede vaciar." };
}

/** Resumen legible para el log del sandbox. Ningún resultado queda mudo. */
export function resumenRescate(r: ResumenRescateInput): string {
  const partes: string[] = [
    `RESCATE: ${r.trasladados} archivo(s) nuevo(s) mudado(s) a .cerebro-db permanente, ${r.conservados} conservado(s) (no se pisó nada).`,
    `Snapshot: ${r.snapshot || "NO se creó"}.`,
  ];
  if (r.docs && r.docs.length) partes.push(`Docs del sandbox rescatados: ${r.docs.join(", ")}.`);
  if (r.errores && r.errores.length) partes.push(`ERRORES: ${r.errores.join(" · ")}.`);
  return partes.join(" ");
}
