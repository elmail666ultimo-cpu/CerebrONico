/**
 * AppBackground.tsx — Fondo de pantalla de la pantalla principal (v1.8 · v1.15.1)
 * - Funciona SIEMPRE: si no hay imagen usa un degradado interno (sin depender de internet).
 * - Imagen subida (blob), URL externa o preset, con opacidad, desenfoque y velo de legibilidad.
 *
 * v1.15.1 — ORDEN DE PRIORIDAD CORREGIDO.
 * Antes `customImageUrl` recibía SIEMPRE la imagen del cerebro por defecto, así que
 * el panel Pro («Configuración PRO → Fondo») quedaba ignorado: cambiar el preset,
 * poner una URL o apagar el fondo no hacía nada visible. Ahora:
 *
 *   1. Imagen PERSONALIZADA (subida por el usuario) → manda siempre.
 *   2. Fondo desactivado (`wallpaper.enabled = false`) → no se pinta nada.
 *   3. URL/preferencias del panel Pro → se pinta con la opacidad elegida.
 *   4. Preset (degradado o imagen) → los degradados usan la opacidad; las imágenes
 *      de preset se ven a plena opacidad (como una imagen propia).
 */
import type { CSSProperties } from "react";
import { ProSettings, WALLPAPER_PRESETS } from "../utils/proSettings";
import { MARCA_FONDO_IDB } from "../engine/fondo"; // v1.7.1 — la marca de «está en IndexedDB» no es una URL

export function AppBackground({
  settings,
  presetId = "predeterminado",
  customImageUrl,
}: {
  settings: ProSettings;
  presetId?: string;
  customImageUrl?: string;
}) {
  const w = settings?.wallpaper;
  // v1.7.1 — LA MARCA NO ES UNA URL. Cuando la imagen es grande vive en
  // IndexedDB y en las preferencias queda `MARCA_FONDO_IDB`. Si esa marca
  // llegara al CSS, el navegador intentaría cargar «cn-idb:fondo» y no pintaría
  // nada. La imagen real llega por `customImageUrl`, con prioridad.
  const urlPreferencias = w?.url === MARCA_FONDO_IDB ? undefined : w?.url;
  const blur = w?.blur ?? 0;
  const filtroBlur = blur > 0 ? `blur(${blur}px)` : undefined;
  const escala = blur > 0 ? "scale(1.06)" : undefined;

  // 1) Imagen personalizada (subida por el usuario): prioridad total.
  if (customImageUrl) {
    return (
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${customImageUrl}")`,
            backgroundSize: w?.fit === "repeat" ? "auto" : w?.fit || "cover",
            backgroundRepeat: w?.fit === "repeat" ? "repeat" : "no-repeat",
            backgroundPosition: w?.position || "center",
            opacity: 1,
            filter: filtroBlur,
            transform: escala,
          }}
        />
        <div
          className="absolute inset-0"
          style={{ background: `rgba(2, 4, 10, ${Math.min(0.35, (w?.dim ?? 0.45) * 0.6)})` }}
        />
      </div>
    );
  }

  // 2) Fondo desactivado → nada (ni imagen ni degradado).
  if (!w || !w.enabled) return null;

  const preset = WALLPAPER_PRESETS.find((p) => p.id === presetId) || WALLPAPER_PRESETS[0];
  const esPresetImagen = preset.css.trim().startsWith("url(");
  const url = urlPreferencias;

  const base: CSSProperties = url
    ? {
        backgroundImage: `url("${url}")`,
        backgroundSize: w?.fit === "repeat" ? "auto" : w?.fit || "cover",
        backgroundRepeat: w?.fit === "repeat" ? "repeat" : "no-repeat",
        backgroundPosition: w?.position || "center",
        opacity: w?.opacity ?? 1,
        filter: filtroBlur,
        transform: escala,
      }
    : {
        backgroundImage: preset.css,
        backgroundSize: "cover",
        // Las IMÁGENES de preset se ven a plena opacidad (como una imagen propia);
        // los DEGRADADOS respetan el deslizador de opacidad.
        opacity: esPresetImagen ? 1 : w?.opacity ?? 1,
        filter: filtroBlur,
      };

  // El velo: imágenes (propias, de URL o de preset) usan el velo reducido;
  // los degradados usan el velo completo.
  const dim = url || esPresetImagen ? Math.min(0.35, (w?.dim ?? 0.45) * 0.6) : w?.dim ?? 0.45;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0" style={base} />
      {/* Velo para que el texto siga legible sobre cualquier imagen */}
      <div className="absolute inset-0" style={{ background: `rgba(2, 4, 10, ${dim})` }} />
    </div>
  );
}
