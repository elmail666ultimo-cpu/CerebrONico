import React from "react";

type BrainState = "idle" | "thinking" | "exploding";

interface BrainThinkingIconProps {
  /** Estado de la animación */
  state?: BrainState;
  /** Tamaño en píxeles (default 36) */
  size?: number;
  /** Clase CSS adicional */
  className?: string;
  /** Título/tooltip */
  title?: string;
}

/**
 * 🧠 BrainThinkingIcon — Icono de cerebro animado para CerebroNico V0.9
 * ============================================================
 * SVG + CSS puro. 3 estados:
 *   - idle: pulso suave violeta (la IA está disponible)
 *   - thinking: ondas concéntricas + vibración (procesando prompt)
 *   - exploding: explosión dorada + glow intenso (razonamiento profundo / CoT)
 *
 * Cero impacto en CPU/GPU: solo usa transform y opacity (hardware-accelerated).
 * Identidad visual: violeta #a78bfa en reposo, dorado #fbbf24 al "explotar".
 */
export const BrainThinkingIcon: React.FC<BrainThinkingIconProps> = ({
  state = "idle",
  size = 36,
  className = "",
  title,
}) => {
  const containerClass = `brain-thinking-container brain-${state} ${className}`;
  const iconSize = Math.round(size * 0.66); // icono más pequeño que el contenedor

  return (
    <div
      className={containerClass}
      style={{ width: `${size}px`, height: `${size}px` }}
      title={title || `Cerebro ${state === "exploding" ? "explotando" : state === "thinking" ? "pensando" : "en reposo"}`}
    >
      {/* Ondas expansivas (solo visibles en thinking/exploding) */}
      <div className="brain-ring brain-ring-1" />
      <div className="brain-ring brain-ring-2" />
      <div className="brain-ring brain-ring-3" />

      {/* Icono del cerebro — SVG estilizado */}
      <svg
        className="brain-icon"
        viewBox="0 0 24 24"
        width={iconSize}
        height={iconSize}
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Cerebro estilizado con dos hemisferios y pliegues */}
        <path d="M12,3C9.75,3 7.5,4 6,5.5C4.5,7 3.5,9 3.5,11.5C3.5,14 5,16 6.5,17C6.5,17.5 6.5,18 6.5,18.5C6.5,20 7.5,21 9,21C10.5,21 11,19.5 12,19.5C13,19.5 13.5,21 15,21C16.5,21 17.5,20 17.5,18.5C17.5,18 17.5,17.5 17.5,17C19,16 20.5,14 20.5,11.5C20.5,9 19.5,7 18,5.5C16.5,4 14.25,3 12,3Z" />
        {/* Línea central divisoria */}
        <path
          d="M12,3.5 L12,19.5"
          stroke="rgba(0,0,0,0.25)"
          strokeWidth="0.6"
          fill="none"
        />
        {/* Pliegues/surcos del hemisferio izquierdo */}
        <path
          d="M8,7 C7,8 7,9.5 8,10.5 M6.5,11 C5.5,11.5 5.5,13 6.5,13.5 M8,14 C7.5,15 7.5,16 8.5,16.5"
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="0.5"
          fill="none"
          strokeLinecap="round"
        />
        {/* Pliegues/surcos del hemisferio derecho */}
        <path
          d="M16,7 C17,8 17,9.5 16,10.5 M17.5,11 C18.5,11.5 18.5,13 17.5,13.5 M16,14 C16.5,15 16.5,16 15.5,16.5"
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="0.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
