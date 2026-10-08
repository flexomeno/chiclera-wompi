import twilio from "twilio";

/**
 * Crea un cliente de Twilio para enviar mensajes de WhatsApp.
 *
 * Requisitos (ver pi/README.md o la guía de setup):
 * 1. Cuenta en https://www.twilio.com/try-twilio (gratis para el sandbox).
 * 2. Account SID y Auth Token: Twilio Console → Dashboard.
 * 3. Activar el WhatsApp Sandbox: Twilio Console → Messaging → Try it out →
 *    Send a WhatsApp message. Te da un número (normalmente
 *    whatsapp:+14155238886) y un código tipo "join palabra-palabra".
 * 4. CADA número que vaya a recibir mensajes de prueba debe enviar ese
 *    código de "join" por WhatsApp al número del sandbox, una sola vez
 *    (limitación del modo sandbox; no aplica en producción con un número
 *    de WhatsApp Business propio ya aprobado).
 */
export function createWhatsappClient({ accountSid, authToken }) {
  if (!accountSid || !authToken) {
    throw new Error(
      "Faltan TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN en el .env para poder enviar WhatsApp."
    );
  }
  return twilio(accountSid, authToken);
}

/**
 * Normaliza un número de celular colombiano a formato E.164 (+57XXXXXXXXXX).
 * Acepta variantes comunes: "3001234567", "+573001234567", "57 300 123 4567".
 */
export function normalizeColombianPhone(rawPhone) {
  const digits = (rawPhone || "").replace(/\D/g, "");

  if (digits.length === 10 && digits.startsWith("3")) {
    return `+57${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("57")) {
    return `+${digits}`;
  }
  if (digits.length === 13 && digits.startsWith("57")) {
    // por si llega con un dígito extra accidental; validamos longitud final
    return `+${digits.slice(0, 12)}`;
  }
  return null; // formato no reconocido
}

/**
 * Envía al cliente el código de validación de su pago aprobado, por WhatsApp.
 *
 * IMPORTANTE (política de WhatsApp/Meta, no es una limitación nuestra ni
 * solo del sandbox): si el NEGOCIO inicia la conversación —el cliente no
 * te escribió primero dentro de las últimas 24h—, WhatsApp exige usar una
 * "Content Template" aprobada (identificada por un `contentSid`, p. ej.
 * "HXxxxxxxxx"), no texto libre. Por eso, si se provee `contentSid`, se usa
 * ese camino (recomendado, funciona siempre). Si no, se intenta texto libre
 * como respaldo — solo funciona dentro de la ventana de 24h de servicio al
 * cliente (p. ej. inmediatamente después de hacer "join" en el sandbox).
 *
 * @param {import('twilio').Twilio} client
 * @param {object} opts
 * @param {string} opts.from - Número de WhatsApp remitente, con prefijo
 *   "whatsapp:" (p. ej. "whatsapp:+14155238886" en sandbox).
 * @param {string} opts.to - Número E.164 del destinatario, SIN "whatsapp:"
 *   (se le agrega automáticamente aquí).
 * @param {string} [opts.contentSid] - ID de la plantilla aprobada (Twilio
 *   Console → Messaging → Content Template Builder), categoría Authentication.
 */
export async function sendCodeWhatsapp(
  client,
  { from, to, code, reference, amountInCents, contentSid }
) {
  if (contentSid) {
    // Las plantillas de categoría "Authentication" tienen el texto fijado
    // por WhatsApp (algo como "{{1}} es tu código de verificación.") más un
    // botón "Copiar código" — solo necesitamos pasar el código como la
    // variable {{1}}.
    return client.messages.create({
      contentSid,
      contentVariables: JSON.stringify({ "1": code }),
      from,
      to: `whatsapp:${to}`,
    });
  }

  const amountFormatted = (amountInCents / 100).toLocaleString("es-CO");

  const body = [
    "✅ *Pago aprobado*",
    `Monto: $${amountFormatted} COP`,
    `Referencia: ${reference}`,
    "",
    `Tu código de validación es: *${code}*`,
    "",
    "Presenta este código en el dispositivo para completar tu proceso.",
    "Este código es de un solo uso.",
  ].join("\n");

  return client.messages.create({
    from,
    to: `whatsapp:${to}`,
    body,
  });
}
