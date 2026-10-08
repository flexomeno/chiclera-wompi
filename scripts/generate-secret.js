import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const provisioningDir = path.join(projectRoot, "provisioning");
const envPath = path.join(projectRoot, ".env");

// Permite generar un secreto con otro nombre de archivo, p. ej.:
//   node scripts/generate-secret.js pi-secret-prod.key
// para no sobrescribir el secreto de Sandbox ya provisionado.
const fileName = process.argv[2] || "pi-secret.key";

if (!existsSync(provisioningDir)) {
  mkdirSync(provisioningDir, { recursive: true });
}

const secretHex = randomBytes(32).toString("hex"); // 256 bits
const piSecretPath = path.join(provisioningDir, fileName);
writeFileSync(piSecretPath, secretHex + "\n");

console.log("──────────────────────────────────────────────");
console.log("🔐 Nuevo secreto HOTP generado");
console.log("──────────────────────────────────────────────");
console.log(secretHex);
console.log("");
console.log(`Guardado en: ${piSecretPath}`);
console.log("");

// Intenta actualizar automáticamente el .env si existe y tiene el placeholder
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  if (envContent.includes("HOTP_SECRET=")) {
    const updated = envContent.replace(
      /HOTP_SECRET=.*/,
      `HOTP_SECRET=${secretHex}`
    );
    writeFileSync(envPath, updated);
    console.log("✅ .env actualizado automáticamente con HOTP_SECRET.");
  } else {
    console.log(
      `⚠️  No se encontró la línea HOTP_SECRET= en .env. Agrégala manualmente:\n   HOTP_SECRET=${secretHex}`
    );
  }
} else {
  console.log(`⚠️  No existe .env todavía. Agrega: HOTP_SECRET=${secretHex}`);
}

console.log("");
console.log("Pasos siguientes (manuales, por diseño — la Pi nunca tiene red):");
console.log(`1. Copia el archivo '${piSecretPath}'`);
console.log("   a una memoria USB.");
console.log("2. En la Raspberry Pi, copia su contenido a: pi/secret.key");
console.log("   (mismo contenido exacto, un solo renglón hexadecimal).");
console.log("3. Verifica que NO quede ningún salto de línea extra ni espacios.");
console.log("4. Nunca subas este secreto a git ni lo compartas por canales no seguros.");
