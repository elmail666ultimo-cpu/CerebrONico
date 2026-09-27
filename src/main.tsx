import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { GlobalErrorBoundary } from "./components/GlobalErrorBoundary";
import { IDE_BRAND } from "./constants";
import "./index.css";

// v2.1 — El título de la ventana se fija desde UNA sola fuente de verdad.
// Estaba escrito a mano en index.html ("CerebroNico V2.1") mientras la carpeta y
// los archivos decían "v2.0": dos versiones distintas a la vez, y ninguna era
// la real. Así el título no puede volver a desincronizarse.
document.title = `${IDE_BRAND.NAME} ${IDE_BRAND.VERSION}`;

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </React.StrictMode>
  );
}
