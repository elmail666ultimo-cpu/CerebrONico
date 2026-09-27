import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// CerebroNico IDE v1 — Configuración Vite para el frontend React
// ============================================================
// Compila src/main.tsx -> dist/assets/index-*.js + index.html.
// El servidor Express (server.ts) sirve estos assets en producción.
// ============================================================

// V8 — BLINDAJE DE COMPILACIÓN (ADR 11, defensa en profundidad):
// Lo que navega no toca disco. Si un módulo del PROYECTO intenta importar
// node:fs / node:path / fs / path / child_process, el bundle del navegador
// recibe un stub que falla en voz alta con la explicación (fail-loud),
// en vez de empaquetar o silenciar el builtin. El incidente original:
// consejo.ts importaba cargadorEspejos.ts (node:fs) y el build moría en
// existsSync — la cura fue la inversión de dependencia (pool.ts puro);
// esta guarda impide que vuelva a pasar en silencio.
// Los imports desde node_modules se dejan a Vite (sus pre-bundles ya
// resuelven lo que el navegador puede usar).
const GUARD_NODE_BUILTINS =
  "throw new Error('[Cerebrónico V8] Un módulo de Node (fs/path/child_process/node:*) intentó llegar al bundle del navegador. Regla: lo que navega no toca disco — usa inversión de dependencia (ver src/engine/reflejo/pool.ts: módulo puro + cargador que conserva el fs del lado servidor).');";
function cerebroNodeGuard() {
  return {
    name: "cerebronico-node-guard",
    enforce: "pre" as const,
    resolveId(id: string, importer?: string) {
      const esBuiltin = id === "fs" || id === "path" || id === "child_process" || id.startsWith("node:");
      if (!esBuiltin) return null;
      if (importer && importer.includes("node_modules")) return null; // Vite ya lo resuelve
      return "\0cerebronico-node-guard";
    },
    load(id: string) {
      if (id === "\0cerebronico-node-guard") return GUARD_NODE_BUILTINS;
      return null;
    },
  };
}

export default defineConfig({
  plugins: [cerebroNodeGuard(), react(), tailwindcss()],
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      input: "./index.html",
      output: {
        // Mantener nombres estables para que el server.mjs los cargue bien
        entryFileNames: "assets/index-[hash].js",
        chunkFileNames: "assets/chunk-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: {
    port: 3000,
    strictPort: false,
    // El servidor de desarrollo de Vite solo se usa en desarrollo local;
    // el servidor Express real usa el middlewareMode (ver server.ts).
  },
  resolve: {
    alias: {
      // Alias útil para imports absolutos desde src/
      "@": "/src",
    },
  },
});
