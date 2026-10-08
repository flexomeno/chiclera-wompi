import nodemailer from "nodemailer";

/**
 * Crea un transporter de Nodemailer usando Gmail SMTP con contraseña de aplicación.
 *
 * Requisitos en la cuenta de Gmail usada:
 * 1. Verificación en dos pasos (2FA) activada.
 * 2. Una "Contraseña de aplicación" generada en https://myaccount.google.com/apppasswords
 *    (NO uses la contraseña normal de la cuenta).
 */
export function createMailer({ gmailUser, gmailAppPassword }) {
  if (!gmailUser || !gmailAppPassword) {
    throw new Error(
      "Faltan GMAIL_USER / GMAIL_APP_PASSWORD en el .env para poder enviar correos."
    );
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
  });
}

/**
 * Envía al cliente el código de validación de su pago aprobado.
 */
export async function sendCodeEmail(
  transporter,
  { from, to, code, reference, amountInCents }
) {
  const amountFormatted = (amountInCents / 100).toLocaleString("es-CO");

  const text = [
    `Tu pago de $${amountFormatted} COP (referencia: ${reference}) fue aprobado.`,
    "",
    `Tu código de validación es: ${code}`,
    "",
    "Presenta este código en el dispositivo para completar tu proceso.",
    "Este código es de un solo uso.",
  ].join("\n");

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>✅ Pago aprobado</h2>
      <p>Tu pago de <strong>$${amountFormatted} COP</strong> (referencia: ${reference}) fue aprobado.</p>
      <p>Tu código de validación es:</p>
      <p style="font-size: 40px; font-weight: bold; letter-spacing: 8px; text-align: center;
                background: #f3f3f3; padding: 16px; border-radius: 8px;">
        ${code}
      </p>
      <p>Presenta este código en el dispositivo para completar tu proceso.</p>
      <p style="color: #888; font-size: 13px;">Este código es de un solo uso.</p>
    </div>
  `;

  return transporter.sendMail({
    from,
    to,
    subject: "✅ Pago aprobado — tu código de validación",
    text,
    html,
  });
}
