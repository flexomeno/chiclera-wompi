import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { loadEnv } from "./env.js";
import { WompiClient, FINAL_STATUSES } from "./wompi.js";

loadEnv();

const {
  WOMPI_BASE_URL,
  WOMPI_PUBLIC_KEY,
  WOMPI_PRIVATE_KEY,
  WOMPI_INTEGRITY_SECRET,
  WOMPI_SANDBOX_STATUS = "APPROVED",
  WOMPI_AMOUNT_IN_CENTS = "5000000",
  WOMPI_CUSTOMER_EMAIL = "cliente_prueba@example.com",
} = process.env;

// Monto mínimo permitido por Wompi para cualquier transacción.
const MIN_AMOUNT_IN_CENTS = 150000; // $1,500 COP

function assertSandboxKeys() {
  const keys = {
    WOMPI_PUBLIC_KEY,
    WOMPI_PRIVATE_KEY,
    WOMPI_INTEGRITY_SECRET,
  };
  for (const [name, value] of Object.entries(keys)) {
    if (!value || value.includes("TU_LLAVE") || value.includes("TU_SECRETO")) {
      throw new Error(
        `⚠️  Debes configurar ${name} en tu archivo .env con una llave real de Sandbox (prefijo *_test_). ` +
          "Consulta .env.example y https://comercios.wompi.co para obtener tus llaves."
      );
    }
    if (!value.includes("_test_") && !value.includes("test_")) {
      throw new Error(
        `🚫 BLOQUEADO POR SEGURIDAD: ${name} no es una llave de Sandbox (no contiene '_test_').\n` +
          "   Este script (test-qr.js) SIEMPRE envía 'sandbox_status', lo cual no tiene sentido en " +
          "producción y podría comportarse de forma inesperada con dinero real.\n" +
          "   Si de verdad quieres probar en Producción, usa la página /pagar-qr del servidor " +
          "(src/server.js), que SÍ maneja ambos ambientes de forma segura."
      );
    }
  }

  if (!(WOMPI_BASE_URL || "").includes("sandbox")) {
    throw new Error(
      "🚫 BLOQUEADO POR SEGURIDAD: WOMPI_BASE_URL no parece ser de Sandbox " +
        "(debe contener 'sandbox'). Este script nunca debe correr contra Producción."
    );
  }

  // El secreto de integridad y el de eventos se parecen pero NO son intercambiables.
  // El de integridad firma transacciones (prefijo *_integrity_); el de eventos firma
  // webhooks (prefijo *_events_). Usar el equivocado produce una firma inválida.
  if (WOMPI_INTEGRITY_SECRET.includes("events_")) {
    throw new Error(
      "⚠️  WOMPI_INTEGRITY_SECRET parece ser el SECRETO DE EVENTOS (prefijo *_events_), " +
        "usado para validar webhooks, no para firmar transacciones.\n" +
        "   Ve al dashboard de Wompi > Desarrolladores > Secretos para integración técnica " +
        "y copia el que tiene el prefijo 'test_integrity_...'."
    );
  }
  if (!WOMPI_INTEGRITY_SECRET.includes("integrity_")) {
    console.warn(
      "⚠️  WOMPI_INTEGRITY_SECRET no contiene 'integrity_' en su prefijo. " +
        "Verifica que sea el secreto correcto (test_integrity_... / prod_integrity_...)."
    );
  }
}

function assertValidAmount(amountInCents) {
  if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
    throw new Error(
      `⚠️  WOMPI_AMOUNT_IN_CENTS debe ser un entero positivo. Valor actual: ${process.env.WOMPI_AMOUNT_IN_CENTS}`
    );
  }
  if (amountInCents < MIN_AMOUNT_IN_CENTS) {
    throw new Error(
      `⚠️  El monto mínimo de una transacción en Wompi es $1,500 COP (${MIN_AMOUNT_IN_CENTS} centavos). ` +
        `Tu .env tiene WOMPI_AMOUNT_IN_CENTS=${amountInCents} ($${(amountInCents / 100).toLocaleString("es-CO")} COP). ` +
        "Sube el valor en .env antes de continuar."
    );
  }
}

async function main() {
  assertSandboxKeys();

  const amountInCents = parseInt(WOMPI_AMOUNT_IN_CENTS, 10);
  assertValidAmount(amountInCents);

  const client = new WompiClient({
    baseUrl: WOMPI_BASE_URL,
    publicKey: WOMPI_PUBLIC_KEY,
    privateKey: WOMPI_PRIVATE_KEY,
    integritySecret: WOMPI_INTEGRITY_SECRET,
  });

  const reference = `QR-TEST-${Date.now()}-${randomUUID().slice(0, 8)}`;

  console.log("──────────────────────────────────────────────");
  console.log("🧪 Prueba de transacción con Código QR (Bancolombia QR)");
  console.log("──────────────────────────────────────────────");
  console.log(`Ambiente:   ${WOMPI_BASE_URL}`);
  console.log(`Referencia: ${reference}`);
  console.log(`Monto:      $${(amountInCents / 100).toLocaleString("es-CO")} COP`);
  console.log(`Status de Sandbox deseado: ${WOMPI_SANDBOX_STATUS}`);
  console.log("");

  console.log("1️⃣  Obteniendo tokens de aceptación (GET /merchants/info)...");
  const { acceptanceToken, personalAuthToken } =
    await client.getAcceptanceTokens();
  console.log("   ✅ Tokens obtenidos.\n");

  console.log("2️⃣  Creando transacción BANCOLOMBIA_QR (POST /transactions)...");
  const tx = await client.createQrTransaction({
    reference,
    amountInCents,
    currency: "COP",
    customerEmail: WOMPI_CUSTOMER_EMAIL,
    acceptanceToken,
    personalAuthToken,
    paymentDescription: "Pago de prueba - Código QR",
    sandboxStatus: WOMPI_SANDBOX_STATUS,
  });
  console.log(`   ✅ Transacción creada: ${tx.id} (status inicial: ${tx.status})\n`);

  console.log("3️⃣  Esperando que Wompi genere la imagen del QR (long polling)...");
  const txWithQr = await client.pollTransaction(tx.id, {
    until: (t) => Boolean(t.payment_method?.extra?.qr_image) || FINAL_STATUSES.has(t.status),
    intervalMs: 2000,
    timeoutMs: 60000,
    onPoll: (t) => console.log(`   ⏳ status=${t.status}`),
  });

  const qrImageB64 = txWithQr.payment_method?.extra?.qr_image;
  const qrId = txWithQr.payment_method?.extra?.qr_id;

  if (qrImageB64) {
    console.log(`   ✅ QR generado. qr_id=${qrId}\n`);

    const outDir = path.join(process.cwd(), "output");
    mkdirSync(outDir, { recursive: true });
    const svgPath = path.join(outDir, `${tx.id}-qr.svg`);

    // Según la documentación, qr_image es un SVG codificado en base64:
    // <img src="data:image/svg+xml;base64,${qr_image}"/>
    const svgContent = Buffer.from(qrImageB64, "base64").toString("utf-8");
    writeFileSync(svgPath, svgContent);
    console.log(`4️⃣  Imagen del QR guardada en: ${svgPath}`);
    console.log("    Ábrela en tu navegador o visor de SVG para escanearla con tu app bancaria.\n");
  } else {
    console.log("   ⚠️  No se recibió qr_image (la transacción llegó a un estado final sin generar QR).\n");
  }

  console.log("5️⃣  Esperando el estado final de la transacción...");
  const finalTx = await client.pollTransaction(tx.id, {
    until: (t) => FINAL_STATUSES.has(t.status),
    intervalMs: 2000,
    timeoutMs: 60000,
    onPoll: (t) => console.log(`   ⏳ status=${t.status}`),
  });

  console.log("\n──────────────────────────────────────────────");
  console.log(`🏁 Resultado final: ${finalTx.status}`);
  console.log(`   ID transacción: ${finalTx.id}`);
  console.log(`   Referencia:     ${finalTx.reference}`);
  console.log(`   Mensaje:        ${finalTx.status_message ?? "-"}`);
  console.log("──────────────────────────────────────────────");
}

main().catch((err) => {
  console.error("\n❌ Error durante la prueba:");
  console.error(err.message);
  if (err.response) {
    console.error(JSON.stringify(err.response, null, 2));
  }
  process.exitCode = 1;
});
