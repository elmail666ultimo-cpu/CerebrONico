/**
 * ResilienceControl.tsx — CONTROL BIDIRECCIONAL DEL «CEREBRO RESILIENTE»
 * ======================================================================
 * El botón anterior solo AVANZABA (×1 → ×2 → ×4 → ×6 → ×8 → ×1): no había
 * forma de bajar sin dar toda la vuelta. Este control expone los DOS sentidos
 * —subir y bajar— sobre la escalera real de escalados, que NO es lineal:
 *
 *     [1, 2, 4, 6, 8]
 *
 * Por eso el componente recibe la lista `levels` y solo se mueve DENTRO de
 * ella: el «−» baja al escalado anterior real y el «+» sube al siguiente real,
 * nunca a un valor inventado (1,2,3,4,5… no existiría en el motor).
 */

import React from "react";
import { Minus, Plus, Zap } from "lucide-react";

export interface ResilienceControlProps {
  /** Escalado actual (uno de `levels`). */
  level: number;
  /** Se llama con el NUEVO escalado (ya dentro de `levels`). */
  onChange: (level: number) => void;
  /** Escalera de escalados válidos, de menor a mayor. */
  levels?: readonly number[];
  /** Etiqueta opcional a la izquierda. */
  label?: string;
}

const ESCALADOS_POR_DEFECTO = [1, 2, 4, 6, 8] as const;

export const ResilienceControl: React.FC<ResilienceControlProps> = ({
  level,
  onChange,
  levels = ESCALADOS_POR_DEFECTO,
  label = "cerebro resiliente",
}) => {
  const lista = Array.from(levels);
  // Si llega un valor que no está en la lista, se ancla al primero (seguro).
  const indice = lista.indexOf(level);
  const posicion = indice >= 0 ? indice : 0;
  const actual = lista[posicion];

  const puedeBajar = posicion > 0;
  const puedeSubir = posicion < lista.length - 1;

  const bajar = () => {
    if (puedeBajar) onChange(lista[posicion - 1]);
  };
  const subir = () => {
    if (puedeSubir) onChange(lista[posicion + 1]);
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-violet-700 bg-violet-900/40 px-2 py-1">
      <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-violet-100">
        <Zap size={13} className="text-violet-300" />
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={bajar}
          disabled={!puedeBajar}
          aria-label="Disminuir nivel de resiliencia"
          title={puedeBajar ? `Bajar a ×${lista[posicion - 1]}` : "Ya estás en el mínimo"}
          className="flex h-5 w-5 items-center justify-center rounded border border-violet-700 bg-violet-950/40 font-bold text-violet-100 transition-colors hover:bg-violet-800/60 disabled:opacity-35 disabled:hover:bg-violet-950/40"
        >
          <Minus size={12} />
        </button>
        <span className="min-w-[1.5rem] text-center text-[12px] font-bold tabular-nums text-violet-100">
          ×{actual}
        </span>
        <button
          type="button"
          onClick={subir}
          disabled={!puedeSubir}
          aria-label="Aumentar nivel de resiliencia"
          title={puedeSubir ? "Multiplica la concurrencia base del tramo y se aplica al instante" : "Ya estás en el máximo"}
          className="flex h-5 w-5 items-center justify-center rounded border border-violet-700 bg-violet-950/40 font-bold text-violet-100 transition-colors hover:bg-violet-800/60 disabled:opacity-35 disabled:hover:bg-violet-950/40"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
};
