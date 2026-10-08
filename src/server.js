import { createHash, randomUUID } from "node:crypto";
import express from "express";

import { loadEnv } from "./env.js";
import { WompiClient } from "./wompi.js";
import { verifyWompiEventSignature } from "./webhook-signature.js";
import { generateHotp } from "./hotp.js";
import { Store } from "./store.js";
import { createMailer, sendCodeEmail } from "./mailer.js";
import { svgQrToPngBuffer } from "./qr-svg-to-png.js";
import { createWhatsappClient, sendCodeWhatsapp, normalizeColombianPhone } from "./whatsapp.js";

loadEnv();

const {
  WOMPI_BASE_URL,
  WOMPI_PUBLIC_KEY,
  WOMPI_PRIVATE_KEY,
  WOMPI_INTEGRITY_SECRET,
  WOMPI_EVENTS_SECRET,
  WOMPI_AMOUNT_IN_CENTS = "200000",
  WOMPI_CUSTOMER_EMAIL = "cliente_prueba@example.com",
  WOMPI_SANDBOX_STATUS = "APPROVED",
  HOTP_SECRET,
  HOTP_DIGITS = "6",
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  SERVER_PORT = "3000",
  PUBLIC_BASE_URL, // URL pública del túnel (cloudflared/ngrok), p. ej. https://xxxx.trycloudflare.com
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM, // p. ej. "whatsapp:+14155238886" (sandbox) o tu número de WhatsApp Business en producción
  TWILIO_CONTENT_SID, // ID de la plantilla "Authentication" aprobada (HXxxxxxxxx). Sin esto, WhatsApp rechaza mensajes iniciados por el negocio.
} = process.env;

const isSandboxEnv = (WOMPI_BASE_URL || "").includes("sandbox");

const wompiClient = new WompiClient({
  baseUrl: WOMPI_BASE_URL,
  publicKey: WOMPI_PUBLIC_KEY,
  privateKey: WOMPI_PRIVATE_KEY,
  integritySecret: WOMPI_INTEGRITY_SECRET,
});

function assertConfig() {
  const missing = [];
  if (!WOMPI_EVENTS_SECRET || WOMPI_EVENTS_SECRET.includes("TU_SECRETO")) {
    missing.push("WOMPI_EVENTS_SECRET");
  }
  if (!HOTP_SECRET || HOTP_SECRET.length < 32) {
    missing.push("HOTP_SECRET (ejecuta: npm run generate-secret)");
  }
  if (!GMAIL_USER || GMAIL_USER.includes("tu_correo")) {
    missing.push("GMAIL_USER");
  }
  if (!GMAIL_APP_PASSWORD || GMAIL_APP_PASSWORD.includes("contraseña")) {
    missing.push("GMAIL_APP_PASSWORD");
  }
  if (missing.length) {
    throw new Error(
      `⚠️  Faltan variables de entorno requeridas en .env:\n   - ${missing.join("\n   - ")}`
    );
  }
}

assertConfig();

// Decisión de negocio final: SOLO procesamos Código QR (BANCOLOMBIA_QR),
// que tiene la tarifa especial de 1% (vs. 2.65%+$700+IVA del resto de
// medios de pago). Cualquier otro método se ignora por completo. Se
// evaluaron alternativas (BANCOLOMBIA_TRANSFER, NEQUI directo) para el caso
// "cliente paga desde su propio celular", pero se descartaron a favor de
// mantener un único flujo simple: capturar/descargar el QR y escanearlo
// desde la galería con la opción "Escanear desde imagen" de la app bancaria.
const ALLOWED_PAYMENT_METHODS = new Set(["BANCOLOMBIA_QR"]);

const digits = parseInt(HOTP_DIGITS, 10);
const hotpSecretBuffer = Buffer.from(HOTP_SECRET, "hex");
const store = new Store();
const mailer = createMailer({
  gmailUser: GMAIL_USER,
  gmailAppPassword: GMAIL_APP_PASSWORD,
});

// WhatsApp es OPCIONAL (canal adicional, no reemplaza el email). Si todavía
// no configuraste Twilio, el servidor sigue funcionando normal, solo que
// no intentará enviar WhatsApp.
// Los Account SID de Twilio SIEMPRE empiezan con "AC" — es una forma
// confiable de distinguir un valor real de un placeholder sin adivinar
// qué texto exacto pudo haber quedado sin reemplazar en el .env.
const whatsappEnabled = Boolean(
  TWILIO_ACCOUNT_SID?.startsWith("AC") && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM
);

const whatsappClient = whatsappEnabled
  ? createWhatsappClient({ accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN })
  : null;

if (!whatsappEnabled) {
  console.log(
    "ℹ️  WhatsApp deshabilitado (faltan TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM en .env). Solo se enviará por correo."
  );
}

const app = express();
// Límite elevado: los eventos de BANCOLOMBIA_QR incluyen la imagen del QR
// (SVG en base64) dentro de payment_method.extra.qr_image, que supera
// fácilmente el límite por defecto de Express (100kb).
app.use(express.json({ limit: "5mb" }));

/**
 * Webhook de eventos de Wompi.
 * Configúralo en el Dashboard de Wompi (Sandbox) apuntando a:
 *   https://<tu-url-publica>/webhooks/wompi
 */
app.post("/webhooks/wompi", async (req, res) => {
  const event = req.body;

  let signatureValid = false;
  try {
    signatureValid = verifyWompiEventSignature(event, WOMPI_EVENTS_SECRET);
  } catch (err) {
    console.error("❌ Error verificando la firma del webhook:", err.message);
  }

  if (!signatureValid) {
    console.warn("⚠️  Firma de webhook inválida. Evento ignorado (posible suplantación).");
    // Respondemos 200 para que Wompi no reintente un evento potencialmente falso/corrupto.
    return res.sendStatus(200);
  }

  if (event?.event !== "transaction.updated") {
    return res.sendStatus(200);
  }

  const tx = event?.data?.transaction;
  if (!tx) return res.sendStatus(200);

  // Solo nos interesan los métodos con tarifa especial de 1% (Código QR y
  // Botón Bancolombia). Cualquier otro método se ignora por completo (ver
  // decisión de negocio: la comisión estándar de 2.65%+$700+IVA es inviable
  // para estos micropagos).
  if (!ALLOWED_PAYMENT_METHODS.has(tx.payment_method_type)) {
    console.log(
      `ℹ️  Ignorando transacción ${tx.id}: método ${tx.payment_method_type} (solo procesamos ${[...ALLOWED_PAYMENT_METHODS].join(" / ")}).`
    );
    return res.sendStatus(200);
  }

  if (tx.status !== "APPROVED") {
    console.log(`ℹ️  Transacción ${tx.id} con status ${tx.status}. No se genera código.`);
    return res.sendStatus(200);
  }

  // Idempotencia: Wompi puede reintentar el mismo webhook; no generamos 2 códigos.
  if (store.hasCodeForTransaction(tx.id)) {
    console.log(`ℹ️  Ya existe un código para la transacción ${tx.id}. Omitiendo.`);
    return res.sendStatus(200);
  }

  const counter = store.incrementCounter();
  const code = generateHotp(hotpSecretBuffer, counter, digits);

  const record = store.saveCode({
    transactionId: tx.id,
    reference: tx.reference,
    email: tx.customer_email,
    amountInCents: tx.amount_in_cents,
    counter,
    code,
    createdAt: new Date().toISOString(),
  });

  console.log(`✅ Código generado para transacción ${tx.id}: ${code} (contador=${counter})`);

  try {
    await sendCodeEmail(mailer, {
      from: GMAIL_USER,
      to: record.email,
      code: record.code,
      reference: record.reference,
      amountInCents: record.amountInCents,
    });
    console.log(`📧 Email enviado a ${record.email}`);
  } catch (err) {
    console.error("❌ Error enviando el email (el código ya quedó guardado):", err.message);
  }

  // WhatsApp: canal ADICIONAL al correo (no lo reemplaza). El teléfono no
  // viene en el evento de Wompi (solo email); lo buscamos en nuestro propio
  // registro, guardado al crear la transacción (ver POST /api/qr/crear).
  // Si falla, no afecta el envío por correo (ya se intentó arriba) ni la
  // generación del código (ya quedó guardado).
  const contact = store.getContact(tx.id);
  if (contact?.phone && whatsappEnabled) {
    try {
      await sendCodeWhatsapp(whatsappClient, {
        from: TWILIO_WHATSAPP_FROM,
        to: contact.phone,
        code: record.code,
        reference: record.reference,
        amountInCents: record.amountInCents,
        contentSid: TWILIO_CONTENT_SID,
      });
      console.log(`💬 WhatsApp enviado a ${contact.phone}`);
    } catch (err) {
      console.error("❌ Error enviando WhatsApp (el código ya quedó guardado y enviado por correo):", err.message);
    }
  }

  res.sendStatus(200);
});

/**
 * Página sencilla para mostrarle el código al usuario justo después de pagar
 * (por ejemplo, enlazando esta URL + el id de transacción desde `redirect_url`).
 */
app.get("/recibo/:transactionId", (req, res) => {
  const record = store.getCodeByTransaction(req.params.transactionId);

  if (!record) {
    res.status(404).send(renderPage("⏳ Pago pendiente o no encontrado", `
      <p>Aún no encontramos un código para esta transacción.</p>
      <p>Si acabas de pagar, espera unos segundos — esta página se actualiza sola.</p>
      <script>setTimeout(() => location.reload(), 2500);</script>
    `));
    return;
  }

  const amountFormatted = (record.amountInCents / 100).toLocaleString("es-CO");

  res.send(renderPage("✅ Pago aprobado", `
    <p>Monto: <strong>$${amountFormatted} COP</strong></p>
    <p>Referencia: ${record.reference}</p>
    <p>Tu código de validación es:</p>
    <p class="code">${record.code}</p>
    <p>También lo enviamos a: ${record.email}</p>
    <p class="muted">Presenta este código en el dispositivo. Es de un solo uso.</p>
  `));
});

/**
 * Página de checkout real usando el Widget oficial de Wompi.
 * Esto simula exactamente la experiencia de un cliente real: se abre el
 * widget de Wompi, el usuario elige el método de pago (QR) y, en Sandbox,
 * ve los botones para simular el resultado (Aprobada/Declinada/Error) tal
 * como lo haría la app del banco en producción.
 */
app.get("/pagar", (req, res) => {
  if (!WOMPI_PUBLIC_KEY || !WOMPI_INTEGRITY_SECRET) {
    return res
      .status(500)
      .send("Falta WOMPI_PUBLIC_KEY o WOMPI_INTEGRITY_SECRET en el .env");
  }

  const amountInCents = parseInt(WOMPI_AMOUNT_IN_CENTS, 10);
  const reference = `WIDGET-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const currency = "COP";

  const signature = createHash("sha256")
    .update(`${reference}${amountInCents}${currency}${WOMPI_INTEGRITY_SECRET}`)
    .digest("hex");

  const baseUrl = PUBLIC_BASE_URL || `http://localhost:${SERVER_PORT}`;
  const redirectUrl = `${baseUrl}/recibo-redirect`;
  const amountFormatted = (amountInCents / 100).toLocaleString("es-CO");

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Pagar con Wompi</title>
  <style>
    body { font-family: -apple-system, sans-serif; text-align: center; margin-top: 60px; color: #222; }
    .box { display: inline-block; padding: 24px 32px; border-radius: 12px; background: #f9f9f9; }
  </style>
</head>
<body>
  <h1>🛒 Checkout de prueba</h1>
  <div class="box">
    <p>Monto a pagar: <strong>$${amountFormatted} COP</strong></p>
    <p>Referencia: ${reference}</p>
    <p>Haz clic en el botón, elige <strong>Código QR</strong> dentro del widget,
       y en Sandbox selecciona el resultado que quieras simular.</p>
    <form>
      <script
        src="https://checkout.wompi.co/widget.js"
        data-render="button"
        data-public-key="${WOMPI_PUBLIC_KEY}"
        data-currency="${currency}"
        data-amount-in-cents="${amountInCents}"
        data-reference="${reference}"
        data-signature:integrity="${signature}"
        data-redirect-url="${redirectUrl}"
        data-customer-data:email="${WOMPI_CUSTOMER_EMAIL}">
      </script>
    </form>
  </div>
</body>
</html>`);
});

/**
 * El widget redirige aquí (vía data-redirect-url) agregando ?id=<transaction_id>
 * en la URL. Simplemente reenviamos a la página de recibo con ese ID.
 */
app.get("/recibo-redirect", (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.redirect("/pagar");
  }
  res.redirect(`/recibo/${id}`);
});

/**
 * ──────────────────────────────────────────────────────────
 * Checkout propio, SOLO QR (sin Widget de Wompi)
 * ──────────────────────────────────────────────────────────
 * A diferencia de /pagar (que usa el Widget hospedado de Wompi y por lo
 * tanto muestra TODOS los métodos de pago habilitados en la cuenta), esta
 * variante llama directamente al API de Wompi fijando
 * payment_method.type = "BANCOLOMBIA_QR" en el servidor. El cliente nunca
 * tiene la opción de elegir otro método, así que nunca se le cobra la
 * comisión alta (2.65% + $700 + IVA) por error, y nunca se queda sin
 * código por haber pagado con un método que nuestro webhook ignora.
 */

app.get("/pagar-qr", (req, res) => {
  res.send(renderPagarQrPage());
});

app.post("/api/qr/crear", async (req, res) => {
  try {
    const email = (req.body?.email || "").trim();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Debes indicar un email válido." });
    }

    // El teléfono (para WhatsApp) es OPCIONAL. Si no está configurado
    // Twilio, lo ignoramos aunque llegue. Si se envía, debe ser un celular
    // colombiano válido.
    let normalizedPhone = null;
    const rawPhone = (req.body?.phone || "").trim();
    if (rawPhone) {
      normalizedPhone = normalizeColombianPhone(rawPhone);
      if (!normalizedPhone) {
        return res
          .status(400)
          .json({ error: "El celular no es válido. Usa un celular colombiano (10 dígitos, inicia en 3)." });
      }
    }

    const amountInCents = parseInt(WOMPI_AMOUNT_IN_CENTS, 10);
    const reference = `QR-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const { acceptanceToken, personalAuthToken } = await wompiClient.getAcceptanceTokens();

    const tx = await wompiClient.createQrTransaction({
      reference,
      amountInCents,
      currency: "COP",
      customerEmail: email,
      acceptanceToken,
      personalAuthToken,
      paymentDescription: "Pago QR",
      // sandbox_status SOLO debe enviarse en Sandbox. En producción, Wompi
      // espera a que el cliente escanee el QR real con su app bancaria.
      sandboxStatus: isSandboxEnv ? WOMPI_SANDBOX_STATUS : undefined,
    });

    // Guardamos el teléfono (si lo hay) ANTES de que llegue el webhook —
    // Wompi nunca nos lo va a devolver, solo lo tenemos porque el cliente
    // lo escribió aquí mismo en el formulario.
    store.saveContact(tx.id, { email, phone: normalizedPhone });

    res.json({ transactionId: tx.id, reference, status: tx.status });
  } catch (err) {
    console.error("❌ Error creando transacción QR:", err.message, err.response ?? "");
    res.status(500).json({ error: "No se pudo crear la transacción.", details: err.response });
  }
});

app.get("/api/qr/estado/:transactionId", async (req, res) => {
  try {
    const tx = await wompiClient.getTransaction(req.params.transactionId);
    const localRecord = store.getCodeByTransaction(req.params.transactionId);

    const qrImageSvgBase64 = tx.payment_method?.extra?.qr_image ?? null;

    // Regeneramos el QR como PNG pixel-perfecto (ver src/qr-svg-to-png.js)
    // para la descarga: el SVG original se parsea directamente como
    // cuadrícula de módulos, sin pasar por ningún motor de rasterizado de
    // navegador (que introduce antialiasing y puede volver el QR exportado
    // no-escaneable por una cámara real, aunque sí "se vea" bien).
    let qrPngBase64 = null;
    if (qrImageSvgBase64) {
      try {
        const svgString = Buffer.from(qrImageSvgBase64, "base64").toString("utf-8");
        const pngBuffer = svgQrToPngBuffer(svgString);
        qrPngBase64 = pngBuffer.toString("base64");
      } catch (err) {
        console.error("⚠️  No se pudo regenerar el QR como PNG:", err.message);
      }
    }

    res.json({
      status: tx.status,
      statusMessage: tx.status_message,
      qrImage: qrImageSvgBase64, // SVG original, para mostrarlo en pantalla
      qrPng: qrPngBase64, // PNG pixel-perfecto, para descargar/escanear desde imagen
      qrId: tx.payment_method?.extra?.qr_id ?? null,
      amountInCents: tx.amount_in_cents,
      reference: tx.reference,
      code: localRecord?.code ?? null, // generado por nuestro webhook, no por Wompi
    });
  } catch (err) {
    console.error("❌ Error consultando transacción:", err.message);
    res.status(500).json({ error: "No se pudo consultar la transacción." });
  }
});

function renderPagarQrPage() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Pagar con Código QR</title>
  <style>
    body { font-family: -apple-system, sans-serif; text-align: center; margin-top: 40px; color: #222; }
    .box { display: inline-block; padding: 24px 32px; border-radius: 12px; background: #f9f9f9; min-width: 320px; max-width: 92vw; }
    input { padding: 10px; font-size: 16px; width: 260px; border: 1px solid #ccc; border-radius: 8px; }
    button { padding: 10px 20px; font-size: 16px; border-radius: 8px; border: none;
             background: #1a1a2e; color: white; cursor: pointer; margin-top: 10px; }
    button:disabled { opacity: 0.5; cursor: default; }
    .code { font-size: 44px; font-weight: bold; letter-spacing: 8px; background: #e9f9ee;
             display: inline-block; padding: 16px 24px; border-radius: 12px; margin-top: 16px; }
    .status { color: #555; margin-top: 14px; }
    img.qr { width: 220px; height: 220px; margin-top: 14px; }
    .muted { color: #888; font-size: 13px; }
    .btn-secondary { background: white; color: #1a1a2e; border: 2px solid #1a1a2e; }
    .tip { text-align: left; background: #fff8e1; border: 1px solid #ffe082; border-radius: 10px;
           padding: 12px 16px; margin-top: 16px; font-size: 13px; color: #5a4a00; max-width: 280px; }
    .tip b { display: block; margin-bottom: 4px; }
    .tip ol { margin: 6px 0 0 18px; padding: 0; }
    .tip li { margin-bottom: 4px; }
  </style>
</head>
<body>
  <h1>📱 Pagar con Código QR</h1>
  <div class="box" id="box">
    <div id="form-step">
      <p>Monto a pagar: <strong id="amount">—</strong></p>
      <input id="email" type="email" placeholder="tu-correo@ejemplo.com" />
      <br />
      <input id="phone" type="tel" placeholder="300 123 4567 (WhatsApp, opcional)" style="margin-top:10px;" />
      <br />
      <button id="btn-crear">Generar código QR</button>
    </div>
    <div id="qr-step" style="display:none;">
      <p class="status" id="status-text">Generando QR…</p>
      <div id="qr-container"></div>
      <div id="code-container"></div>
    </div>
  </div>
  <p class="muted">${isSandboxEnv ? "Ambiente: SANDBOX (pruebas)" : "Ambiente: PRODUCCIÓN"}</p>

  <script>
    const amountInCents = ${parseInt(WOMPI_AMOUNT_IN_CENTS, 10)};
    document.getElementById('amount').textContent =
      '$' + (amountInCents / 100).toLocaleString('es-CO') + ' COP';

    const btnCrear = document.getElementById('btn-crear');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');

    btnCrear.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      if (!email || !email.includes('@')) {
        alert('Ingresa un correo válido.');
        return;
      }

      const phone = phoneInput.value.trim(); // opcional

      btnCrear.disabled = true;
      btnCrear.textContent = 'Creando...';

      const res = await fetch('/api/qr/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert('Error: ' + (err.error || 'No se pudo crear la transacción.'));
        btnCrear.disabled = false;
        btnCrear.textContent = 'Generar código QR';
        return;
      }

      const { transactionId } = await res.json();

      document.getElementById('form-step').style.display = 'none';
      document.getElementById('qr-step').style.display = 'block';

      pollStatus(transactionId);
    });

    let qrShown = false;

    async function pollStatus(transactionId) {
      const statusText = document.getElementById('status-text');
      const qrContainer = document.getElementById('qr-container');
      const codeContainer = document.getElementById('code-container');

      try {
        const res = await fetch('/api/qr/estado/' + transactionId);
        const data = await res.json();

        if (data.qrImage && !qrShown) {
          const svgDataUrl = 'data:image/svg+xml;base64,' + data.qrImage;
          qrContainer.innerHTML =
            '<img class="qr" id="qr-img" src="' + svgDataUrl + '" />' +
            '<p class="muted">Escanea este QR con tu app bancaria (Bancolombia / Nequi)</p>' +
            '<div id="descarga-wrap"><button class="btn-secondary" type="button" disabled>Preparando descarga…</button></div>' +
            '<div class="tip">' +
              '<b>📲 ¿Pagando desde este mismo celular?</b>' +
              'No podrás escanearlo con la cámara (es la misma pantalla). En su lugar:' +
              '<ol>' +
                '<li>Pulsa "Descargar imagen del QR" (o toma una captura de pantalla).</li>' +
                '<li>Abre tu app <b>Nequi</b> → pantalla de "Escanear código".</li>' +
                '<li>Busca la opción <b>"Escanear desde imagen"</b> en la parte inferior de esa pantalla.</li>' +
                '<li>Selecciona la imagen que acabas de descargar/capturar.</li>' +
              '</ol>' +
              '<span class="muted">(Si usas Bancolombia, revisa si tu app tiene una opción similar para escanear desde la galería).</span>' +
            '</div>';
          qrShown = true;

          // El PNG lo genera el SERVIDOR (ver src/qr-svg-to-png.js), parseando
          // directamente la cuadrícula de módulos del SVG — sin pasar por el
          // motor de rasterizado del navegador, que podía introducir
          // antialiasing suficiente para que una cámara real no lo leyera
          // (aunque sí "se viera bien"). Nombre único por transacción+momento
          // para que nunca se confunda el QR de un pago con el de otro.
          const descargaWrap = document.getElementById('descarga-wrap');
          if (data.qrPng) {
            const pngDataUrl = 'data:image/png;base64,' + data.qrPng;
            const filename = 'codigo-qr-' + transactionId + '-' + Date.now() + '.png';
            descargaWrap.innerHTML =
              '<a href="' + pngDataUrl + '" download="' + filename + '">' +
                '<button class="btn-secondary" type="button">⬇️ Descargar imagen del QR</button>' +
              '</a>';
          } else {
            descargaWrap.innerHTML =
              '<a href="' + svgDataUrl + '" download="codigo-qr-' + transactionId + '.svg">' +
                '<button class="btn-secondary" type="button">⬇️ Descargar imagen del QR (SVG)</button>' +
              '</a>';
          }
        }

        if (data.code) {
          statusText.textContent = '✅ Pago aprobado';
          const canales = phoneInput.value.trim() ? 'por correo y WhatsApp' : 'por correo';
          codeContainer.innerHTML =
            '<p>Tu código de validación es:</p><p class="code">' + data.code + '</p>' +
            '<p class="muted">También te lo enviamos ' + canales + '. Preséntalo en el dispositivo.</p>';
          return; // listo, dejamos de hacer polling
        }

        if (data.status === 'DECLINED' || data.status === 'ERROR') {
          statusText.textContent = '❌ Pago ' + (data.status === 'DECLINED' ? 'declinado' : 'con error');
          return;
        }

        statusText.textContent = data.qrImage
          ? 'Esperando que completes el pago…'
          : 'Generando QR…';

        setTimeout(() => pollStatus(transactionId), 1500);
      } catch (err) {
        statusText.textContent = 'Error consultando el estado. Reintentando…';
        setTimeout(() => pollStatus(transactionId), 3000);
      }
    }
  </script>
</body>
</html>`;
}

app.get("/health", (req, res) => res.json({ ok: true }));

function renderPage(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, sans-serif; text-align: center; margin-top: 60px; color: #222; }
    .code { font-size: 48px; font-weight: bold; letter-spacing: 10px; background: #f3f3f3;
             display: inline-block; padding: 16px 24px; border-radius: 12px; }
    .muted { color: #888; font-size: 13px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${bodyHtml}
</body>
</html>`;
}

const port = parseInt(SERVER_PORT, 10);
app.listen(port, () => {
  console.log("──────────────────────────────────────────────");
  console.log(`🚀 Servidor escuchando en http://localhost:${port}`);
  console.log(`   Checkout (Widget, todos los métodos): GET  http://localhost:${port}/pagar`);
  console.log(`   Checkout (solo QR, API directa):      GET  http://localhost:${port}/pagar-qr  ← recomendada`);
  console.log(`   Webhook:  POST http://localhost:${port}/webhooks/wompi`);
  console.log(`   Recibo:   GET  http://localhost:${port}/recibo/:id`);
  console.log("──────────────────────────────────────────────");
});
