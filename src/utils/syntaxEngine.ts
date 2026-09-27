import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-css";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-go";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";

export interface SupportedLanguage {
  id: string;
  name: string;
  prismKey: string;
  extensions: string[];
  snippetTemplate: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  {
    id: "typescript",
    name: "TypeScript (.ts, .tsx)",
    prismKey: "typescript",
    extensions: ["ts", "tsx"],
    snippetTemplate: `export interface Config {\n  id: string;\n  name: string;\n  enabled: boolean;\n}\n\nexport async function initService(config: Config): Promise<boolean> {\n  console.log(\`[Service] Initialized \${config.name}\`);\n  return true;\n}`,
  },
  {
    id: "javascript",
    name: "JavaScript (.js, .jsx)",
    prismKey: "javascript",
    extensions: ["js", "jsx", "mjs", "cjs"],
    snippetTemplate: `export async function fetchData(endpoint) {\n  const res = await fetch(endpoint);\n  if (!res.ok) throw new Error("HTTP error: " + res.status);\n  return await res.json();\n}`,
  },
  {
    id: "python",
    name: "Python (.py)",
    prismKey: "python",
    extensions: ["py", "pyw"],
    snippetTemplate: `import sys\nimport json\nfrom typing import Dict, Any\n\ndef process_payload(data: Dict[str, Any]) -> Dict[str, Any]:\n    print(f"[Python Engine] Processing {len(data)} keys")\n    return {"status": "ok", "count": len(data)}\n\nif __name__ == "__main__":\n    print(process_payload({"model": "smolvlm2", "port": 5000}))`,
  },
  {
    id: "json",
    name: "JSON (.json)",
    prismKey: "json",
    extensions: ["json"],
    snippetTemplate: `{\n  "version": "1.0.0",\n  "engine": "CerebroNico",\n  "port": 3000,\n  "backendPort": 5000,\n  "ollamaPort": 11434,\n  "features": ["context_cache", "prism_highlighting", "anti_loop"]\n}`,
  },
  {
    id: "markdown",
    name: "Markdown (.md, .markdown)",
    prismKey: "markdown",
    extensions: ["md", "markdown"],
    snippetTemplate: `# Título del Documento\n\n## Subtítulo Técnico\n- **Item 1**: Descripción técnica.\n- **Item 2**: Verificación de puertos (3000, 5000, 11434).\n\n\`\`\`typescript\nconst active = true;\n\`\`\``,
  },
  {
    id: "bash",
    name: "Bash / Shell (.sh, .bash)",
    prismKey: "bash",
    extensions: ["sh", "bash", "zsh", "env"],
    snippetTemplate: `#!/usr/bin/env bash\nset -euo pipefail\n\necho "=== Iniciando Servicio CerebroNico ==="\nPORT_BACKEND=5000\n\nif lsof -i :$PORT_BACKEND > /dev/null; then\n  echo "[INFO] Puerto $PORT_BACKEND en uso. Liberando..."\n  fuser -k $PORT_BACKEND/tcp || true\nfi\n\nnode dist/server.cjs &`,
  },
  {
    id: "sql",
    name: "SQL (.sql)",
    prismKey: "sql",
    extensions: ["sql"],
    snippetTemplate: `CREATE TABLE IF NOT EXISTS system_telemetry (\n  id SERIAL PRIMARY KEY,\n  session_id VARCHAR(64) NOT NULL,\n  tokens_saved INT DEFAULT 0,\n  ram_usage_mb FLOAT NOT NULL,\n  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()\n);`,
  },
  {
    id: "css",
    name: "CSS / SCSS (.css, .scss)",
    prismKey: "css",
    extensions: ["css", "scss"],
    snippetTemplate: `.editor-container {\n  background-color: #0b0f19;\n  color: #e2e8f0;\n  font-family: 'JetBrains Mono', 'Fira Code', monospace;\n  line-height: 1.6;\n}`,
  },
  {
    id: "yaml",
    name: "YAML (.yml, .yaml)",
    prismKey: "yaml",
    extensions: ["yml", "yaml"],
    snippetTemplate: `version: '3.8'\nservices:\n  cerebronico:\n    image: node:22-alpine\n    ports:\n      - "3000:3000"\n      - "5000:5000"\n    environment:\n      - NODE_ENV=production`,
  },
  {
    id: "rust",
    name: "Rust (.rs)",
    prismKey: "rust",
    extensions: ["rs"],
    snippetTemplate: `pub struct TelemetryData {\n    pub port: u16,\n    pub tokens_saved: u64,\n}\n\nimpl TelemetryData {\n    pub fn new(port: u16) -> Self {\n        Self { port, tokens_saved: 0 }\n    }\n}`,
  },
  {
    id: "go",
    name: "Go (.go)",
    prismKey: "go",
    extensions: ["go"],
    snippetTemplate: `package main\n\nimport (\n\t"fmt"\n\t"net/http"\n)\n\nfunc main() {\n\tfmt.Println("CerebroNico Microservice on :5000")\n\thttp.ListenAndServe(":5000", nil)\n}`,
  },
  {
    id: "cpp",
    name: "C / C++ (.c, .cpp, .h, .hpp)",
    prismKey: "cpp",
    extensions: ["c", "cpp", "cc", "cxx", "h", "hpp"],
    snippetTemplate: `#include <iostream>\n#include <string>\n\nint main() {\n    std::cout << "[CerebroNico Engine] Running C++ Native Module" << std::endl;\n    return 0;\n}`,
  },
];

/**
 * Detect language based on file path or extension
 */
export function detectLanguageFromPath(filePath: string): SupportedLanguage {
  const cleanPath = filePath.trim().toLowerCase();
  const ext = cleanPath.split(".").pop() || "";

  const match = SUPPORTED_LANGUAGES.find((lang) => lang.extensions.includes(ext));
  if (match) return match;

  if (cleanPath.endsWith("dockerfile") || cleanPath.endsWith(".env")) {
    return SUPPORTED_LANGUAGES.find((l) => l.id === "bash") || SUPPORTED_LANGUAGES[0];
  }

  return SUPPORTED_LANGUAGES.find((l) => l.id === "typescript") || SUPPORTED_LANGUAGES[0];
}

/**
 * Highlight code safely with PrismJS
 */
export function highlightCode(code: string, languageKey: string): string {
  if (!code) return "";
  try {
    const grammar = Prism.languages[languageKey] || Prism.languages.javascript || Prism.languages.clike;
    if (!grammar) return escapeHtml(code);
    return Prism.highlight(code, grammar, languageKey);
  } catch (err) {
    console.warn("Prism highlight error:", err);
    return escapeHtml(code);
  }
}

/**
 * Escape HTML characters for fallback or non-tokenized text
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Code Automation & Formatting Helpers
 */
export function formatCodeAuto(code: string, languageId: string): { formatted: string; changed: boolean } {
  if (!code) return { formatted: "", changed: false };

  // 1. JSON formatting
  if (languageId === "json") {
    try {
      const parsed = JSON.parse(code);
      const formatted = JSON.stringify(parsed, null, 2);
      return { formatted, changed: formatted !== code };
    } catch {
      // If invalid JSON, clean trailing commas and spaces
    }
  }

  // 2. Generic whitespace, indentation and line end normalization
  const lines = code.split("\n");
  const cleanedLines = lines.map((line) => line.replace(/\s+$/, ""));
  
  // Remove excessive consecutive blank lines (> 2)
  const compacted: string[] = [];
  let blankCount = 0;
  for (const l of cleanedLines) {
    if (l.trim() === "") {
      blankCount++;
      if (blankCount <= 2) compacted.push("");
    } else {
      blankCount = 0;
      compacted.push(l);
    }
  }

  const result = compacted.join("\n");
  return { formatted: result, changed: result !== code };
}
