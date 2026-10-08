import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");

/**
 * Carga minimalista de un archivo .env (sin dependencias externas).
 * Lee KEY=VALUE por línea e inyecta en process.env si no existe ya.
 */
export function loadEnv() {
  if (!existsSync(envPath)) {
    console.warn(
      `⚠️  No se encontró el archivo .env en ${envPath}.\n` +
        "   Copia .env.example a .env y completa tus llaves de Sandbox antes de continuar.\n"
    );
    return;
  }

  const content = readFileSync(envPath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Quita comillas envolventes si existen
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
