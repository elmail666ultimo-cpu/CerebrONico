/**
 * providerRouting.test.ts — ENRUTAMIENTO DE PROVEEDOR (v1.6.22)
 * =============================================================
 * Regresión del defecto «glm-ocr:latest se manda a Z.ai».
 *
 * El selector de modelo decidía el proveedor SOLO por el prefijo del nombre:
 * cualquier modelo que empezara por «glm-» iba a Z.ai, aunque fuera un modelo
 * LOCAL instalado en Ollama. Resultado: `glm-ocr:latest` (local, 2.2 GB) se
 * enviaba a la nube de Z.ai, que respondía «Unknown Model».
 *
 * La regla corregida es: LOCAL PRIMERO. Si el nombre está en la lista de
 * modelos locales de Ollama, es local. Solo si no está, se deduce el proveedor
 * cloud por el nombre.
 */
import { proveedorParaModelo } from "../src/utils/providerRouting";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => {
  if (c) correctas++;
  else fallos.push(n + (d ? " :: " + d : ""));
};

const locales = ["glm-ocr:latest", "qwen3.5:4b", "gemma3:270m", "qwen2.5:0.5b", "mistral-mio:latest", "gpt-personal:latest"];

console.log("\n1) Un modelo LOCAL es local, aunque el nombre suene a nube\n");

comprobar("glm-ocr:latest (local) → ollama", proveedorParaModelo("glm-ocr:latest", locales) === "ollama");
comprobar("qwen3.5:4b (local) → ollama", proveedorParaModelo("qwen3.5:4b", locales) === "ollama");
comprobar("mistral-mio (local) → ollama", proveedorParaModelo("mistral-mio:latest", locales) === "ollama");
comprobar("gpt-personal (local) → ollama", proveedorParaModelo("gpt-personal:latest", locales) === "ollama");
comprobar("gemma3:270m (local) → ollama", proveedorParaModelo("gemma3:270m", locales) === "ollama");

console.log("\n2) Un modelo NO local se enruta por nombre\n");

comprobar("glm-4.5-flash (nube) → zai", proveedorParaModelo("glm-4.5-flash", []) === "zai");
comprobar("gemini-2.0-flash → gemini", proveedorParaModelo("gemini-2.0-flash", []) === "gemini");
comprobar("gpt-4o-mini → openai", proveedorParaModelo("gpt-4o-mini", []) === "openai");
comprobar("meta-llama/Llama-3.3-70B (tiene /) → openrouter", proveedorParaModelo("meta-llama/Llama-3.3-70B-Instruct", []) === "openrouter");
comprobar("llama-3.3-70b-versatile → groq", proveedorParaModelo("llama-3.3-70b-versatile", []) === "groq");
comprobar("mistral-small-latest → mistral", proveedorParaModelo("mistral-small-latest", []) === "mistral");
comprobar("deepseek-chat → deepseek", proveedorParaModelo("deepseek-chat", []) === "deepseek");
comprobar("accounts/fireworks/models/x → fireworks", proveedorParaModelo("accounts/fireworks/models/llama-v3p1-8b-instruct", []) === "fireworks");

console.log("\n3) Casos neutros\n");

comprobar("un nombre desconocido → ollama (por defecto seguro)", proveedorParaModelo("modelo-raro", []) === "ollama");
comprobar("nombre vacío → ollama", proveedorParaModelo("", []) === "ollama");
comprobar("nombre en blanco → ollama", proveedorParaModelo("   ", []) === "ollama");

console.log(`\n═══ ENRUTAMIENTO DE PROVEEDOR (v1.6.22): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
