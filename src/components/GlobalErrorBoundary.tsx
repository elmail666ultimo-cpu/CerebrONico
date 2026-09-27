import React, { Component, ErrorInfo, ReactNode } from "react";
// v2.3 — fuente única de la versión: ni la pantalla de fallo dice V2.1 a estas alturas.
import { IDE_BRAND } from "../constants";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * CerebroNico V0.9 — GlobalErrorBoundary
 * ============================================================
 * Captura cualquier error de renderizado de React y muestra una UI
 * de recuperación en lugar de una pantalla blanca.
 * Permite al usuario reiniciar el entorno de forma segura.
 */
export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Error crítico capturado en UI:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "30px",
            background: "#0a0e17",
            color: "#ff5555",
            fontFamily: "Plus Jakarta Sans, sans-serif",
            height: "100vh",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
          }}
        >
          <div style={{ fontSize: "48px" }}>🧠💥</div>
          <h2 style={{ color: "#ff5555", fontSize: "20px", margin: 0 }}>
            {IDE_BRAND.FULL_NAME} — Fallo interceptado
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "14px", textAlign: "center", maxWidth: "500px" }}>
            La aplicación se ha protegido para evitar la pérdida de datos.
            Puedes reiniciar el entorno de forma segura.
          </p>
          {this.state.error && (
            <pre
              style={{
                background: "#1a1a2e",
                padding: "15px",
                borderRadius: "8px",
                color: "#ffcccc",
                overflowX: "auto",
                maxWidth: "600px",
                fontSize: "12px",
                fontFamily: "monospace",
                border: "1px solid #333",
              }}
            >
              {this.state.error.message}
              {this.state.errorInfo?.componentStack
                ? "\n\n" + this.state.errorInfo.componentStack
                : ""}
            </pre>
          )}
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "#06b6d4",
                color: "#fff",
                border: "none",
                padding: "10px 24px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "14px",
              }}
            >
              🔄 Reiniciar Entorno
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              style={{
                background: "#333",
                color: "#ccc",
                border: "none",
                padding: "10px 24px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Intentar de nuevo sin reiniciar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
