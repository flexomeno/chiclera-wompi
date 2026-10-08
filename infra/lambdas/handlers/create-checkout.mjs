import { randomUUID } from "node:crypto";
import { loadConfig } from "../lib/config.mjs";
import { json, parseBody } from "../lib/http.mjs";
import { originIsValid } from "../lib/origin-verify.mjs";
import { putPendingSale } from "../lib/dynamo.mjs";
import { WompiClient } from "../lib/wompi.js";
import { svgQrToPngBuffer } from "../lib/qr-svg-to-png.js";

export async function handler(event) {
  if (!originIsValid(event)) {
    return json(403, { error: "Forbidden" });
  }

  const body = parseBody(event);
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return json(400, { error: "Debes indicar un email válido." });
  }

  const cfg = await loadConfig();
  const amountInCents = parseInt(cfg.amount_in_cents, 10);
  const reference = `QR-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const wompi = new WompiClient({
    baseUrl: cfg.wompi_base_url,
    publicKey: cfg.wompi_public_key,
    privateKey: cfg.wompi_private_key,
    integritySecret: cfg.wompi_integrity_secret,
  });

  try {
    const { acceptanceToken, personalAuthToken } = await wompi.getAcceptanceTokens();
    const sandboxStatus = cfg.wompi_sandbox_status || undefined;

    const tx = await wompi.createQrTransaction({
      reference,
      amountInCents,
      currency: "COP",
      customerEmail: email,
      acceptanceToken,
      personalAuthToken,
      paymentDescription: "Pago QR",
      sandboxStatus,
    });

    await putPendingSale({
      transactionId: tx.id,
      email,
      amountInCents,
      reference,
      status: tx.status || "PENDING",
    });

    const txReady = await wompi.pollTransaction(tx.id, {
      until: (current) => Boolean(current?.payment_method?.extra?.qr_image),
      intervalMs: 800,
      timeoutMs: 12000,
    });

    const qrImageSvgBase64 = txReady.payment_method?.extra?.qr_image ?? null;
    let qrPngBase64 = null;
    if (qrImageSvgBase64) {
      const svgString = Buffer.from(qrImageSvgBase64, "base64").toString("utf-8");
      qrPngBase64 = svgQrToPngBuffer(svgString).toString("base64");
    }

    return json(200, {
      transactionId: tx.id,
      reference,
      status: txReady.status,
      qrImage: qrImageSvgBase64,
      qrPng: qrPngBase64,
      qrId: txReady.payment_method?.extra?.qr_id ?? null,
      amountInCents,
    });
  } catch (err) {
    console.error("create-checkout failed", err.message);
    return json(500, { error: "No se pudo crear la transacción." });
  }
}
