import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const client = new SESv2Client({});

export async function sendCodeEmail({
  from,
  to,
  code,
  reference,
  amountInCents,
  configurationSet,
}) {
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
      <h2>Pago aprobado</h2>
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

  await client.send(
    new SendEmailCommand({
      FromEmailAddress: from.includes("<") ? from : `Pagos <${from}>`,
      Destination: { ToAddresses: [to] },
      ConfigurationSetName: configurationSet,
      Content: {
        Simple: {
          Subject: {
            Data: "Pago aprobado — tu código de validación",
            Charset: "UTF-8",
          },
          Body: {
            Text: { Data: text, Charset: "UTF-8" },
            Html: { Data: html, Charset: "UTF-8" },
          },
        },
      },
    })
  );
}
