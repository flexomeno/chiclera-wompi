import { loadConfig } from "../lib/config.mjs";
import { json, parseBody } from "../lib/http.mjs";
import { getSale, markApprovedIfNew, nextHotpCounter, updateSaleStatus } from "../lib/dynamo.mjs";
import { sendCodeEmail } from "../lib/ses-mailer.mjs";
import { verifyWompiEventSignature } from "../lib/webhook-signature.js";
import { generateHotp } from "../lib/hotp.js";

const ALLOWED_PAYMENT_METHODS = new Set(["BANCOLOMBIA_QR"]);

export async function handler(event) {
  const body = parseBody(event);

  let cfg;
  try {
    cfg = await loadConfig();
  } catch (err) {
    console.error("config", err.message);
    return json(200, { ok: false });
  }

  let signatureValid = false;
  try {
    signatureValid = verifyWompiEventSignature(body, cfg.wompi_events_secret);
  } catch (err) {
    console.error("signature", err.message);
  }

  if (!signatureValid) {
    console.warn("Firma de webhook inválida. Evento ignorado.");
    return json(200, { ignored: true });
  }

  if (body?.event !== "transaction.updated") {
    return json(200, { ignored: true });
  }

  const tx = body?.data?.transaction;
  if (!tx) return json(200, { ignored: true });

  if (!ALLOWED_PAYMENT_METHODS.has(tx.payment_method_type)) {
    console.log(`Ignorando ${tx.id}: método ${tx.payment_method_type}`);
    return json(200, { ignored: true });
  }

  if (tx.status !== "APPROVED") {
    try {
      await updateSaleStatus(tx.id, {
        status: tx.status,
        statusMessage: tx.status_message ?? tx.status,
      });
    } catch (err) {
      console.error("update non-approved", err.message);
    }
    return json(200, { status: tx.status });
  }

  try {
    const existing = await getSale(tx.id);
    if (existing?.code) {
      return json(200, { duplicate: true });
    }

    const counter = await nextHotpCounter();
    const secret = Buffer.from(cfg.hotp_secret, "hex");
    const digits = parseInt(cfg.hotp_digits || "6", 10);
    const code = generateHotp(secret, counter, digits);

    const created = await markApprovedIfNew({
      transactionId: tx.id,
      email: tx.customer_email,
      amountInCents: tx.amount_in_cents,
      reference: tx.reference,
      code,
      counter,
      createdAt: existing?.createdAt,
    });

    if (!created) {
      return json(200, { duplicate: true });
    }

    try {
      await sendCodeEmail({
        from: process.env.SES_FROM_ADDRESS || cfg.ses_sender_email,
        to: tx.customer_email,
        code,
        reference: tx.reference,
        amountInCents: tx.amount_in_cents,
        configurationSet: process.env.SES_CONFIGURATION_SET,
      });
    } catch (err) {
      console.error("SES failed; el código ya quedó guardado", err.message);
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error("webhook failed", err.message);
    return json(200, { ok: false });
  }
}
