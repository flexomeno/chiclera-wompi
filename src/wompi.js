import { createHash } from "node:crypto";

/**
 * Cliente mínimo para el API de Wompi, enfocado en el flujo de
 * transacciones con Bancolombia QR ("Código QR").
 *
 * Referencias de la documentación oficial usadas para construir este cliente:
 * - https://docs.wompi.co/docs/colombia/ambientes-y-llaves/
 * - https://docs.wompi.co/docs/colombia/tokens-de-aceptacion/
 * - https://docs.wompi.co/docs/colombia/transacciones/
 * - https://docs.wompi.co/docs/colombia/metodos-de-pago/ (sección "Bancolombia QR")
 * - https://docs.wompi.co/docs/colombia/datos-de-prueba-en-sandbox/ (sección "Bancolombia QR")
 * - https://docs.wompi.co/docs/colombia/widget-checkout-web/ (sección "Genera una firma de integridad")
 */
export class WompiClient {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl - URL base del ambiente (sandbox o producción)
   * @param {string} opts.publicKey - Llave pública (pub_test_... / pub_prod_...)
   * @param {string} opts.privateKey - Llave privada (prv_test_... / prv_prod_...)
   * @param {string} opts.integritySecret - Secreto de integridad (test_integrity_... / prod_integrity_...)
   */
  constructor({ baseUrl, publicKey, privateKey, integritySecret }) {
    if (!baseUrl) throw new Error("Falta WOMPI_BASE_URL");
    if (!publicKey) throw new Error("Falta WOMPI_PUBLIC_KEY");
    if (!privateKey) throw new Error("Falta WOMPI_PRIVATE_KEY");
    if (!integritySecret) throw new Error("Falta WOMPI_INTEGRITY_SECRET");

    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.integritySecret = integritySecret;
  }

  async _request(path, { method = "GET", headers = {}, body } = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const err = new Error(
        `Wompi API error ${res.status} ${res.statusText} en ${method} ${path}`
      );
      err.status = res.status;
      err.response = json;
      throw err;
    }

    return json;
  }

  /**
   * Paso 1 de "Tokens de aceptación": obtiene los tokens prefirmados
   * (política de privacidad y tratamiento de datos personales) usando
   * la llave pública en el header x-merchant-public-key.
   *
   * GET /merchants/info
   */
  async getAcceptanceTokens() {
    const json = await this._request("/merchants/info", {
      headers: { "x-merchant-public-key": this.publicKey },
    });

    const presignedAcceptance = json?.data?.presigned_acceptance;
    const presignedPersonalAuth = json?.data?.presigned_personal_data_auth;

    if (!presignedAcceptance?.acceptance_token) {
      throw new Error(
        "No se pudo obtener el acceptance_token desde /merchants/info. Revisa tu llave pública."
      );
    }

    return {
      acceptanceToken: presignedAcceptance.acceptance_token,
      acceptancePermalink: presignedAcceptance.permalink,
      personalAuthToken: presignedPersonalAuth?.acceptance_token,
      personalAuthPermalink: presignedPersonalAuth?.permalink,
    };
  }

  /**
   * Genera la firma de integridad (signature) requerida al crear una transacción.
   *
   * SHA256( reference + amount_in_cents + currency + integrity_secret )
   * (el orden importa, sin separadores entre los valores)
   */
  buildIntegritySignature({ reference, amountInCents, currency }) {
    const concatenated = `${reference}${amountInCents}${currency}${this.integritySecret}`;
    return createHash("sha256").update(concatenated).digest("hex");
  }

  /**
   * Crea una transacción con método de pago BANCOLOMBIA_QR ("Código QR").
   *
   * POST /transactions
   * Autenticación: Bearer <llave privada>
   */
  async createQrTransaction({
    reference,
    amountInCents,
    currency = "COP",
    customerEmail,
    acceptanceToken,
    personalAuthToken,
    paymentDescription = "Pago de prueba - Código QR",
    sandboxStatus, // Solo aplica en Sandbox: APPROVED | DECLINED | ERROR
    redirectUrl,
  }) {
    const signature = this.buildIntegritySignature({
      reference,
      amountInCents,
      currency,
    });

    const paymentMethod = {
      type: "BANCOLOMBIA_QR",
      payment_description: paymentDescription,
    };

    if (sandboxStatus) {
      paymentMethod.sandbox_status = sandboxStatus;
    }

    const body = {
      acceptance_token: acceptanceToken,
      amount_in_cents: amountInCents,
      currency,
      customer_email: customerEmail,
      payment_method: paymentMethod,
      reference,
      signature,
    };

    if (personalAuthToken) {
      body.accept_personal_auth = personalAuthToken;
    }

    if (redirectUrl) {
      body.redirect_url = redirectUrl;
    }

    const json = await this._request("/transactions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.privateKey}` },
      body,
    });

    return json.data;
  }

  /**
   * GET /transactions/{id}
   * Requiere llave privada (Bearer token).
   */
  async getTransaction(id) {
    const json = await this._request(`/transactions/${id}`, {
      headers: { Authorization: `Bearer ${this.privateKey}` },
    });
    return json.data;
  }

  /**
   * Hace long polling sobre una transacción hasta que:
   * - aparezca el QR (payment_method.extra.qr_image / qr_id), o
   * - la transacción llegue a un estado final (APPROVED/DECLINED/ERROR/VOIDED), o
   * - se agote el tiempo máximo.
   *
   * @param {string} id - ID de la transacción
   * @param {object} opts
   * @param {(tx: object) => boolean} opts.until - condición de parada
   * @param {number} opts.intervalMs - intervalo entre consultas
   * @param {number} opts.timeoutMs - tiempo máximo de espera
   * @param {(tx: object) => void} [opts.onPoll] - callback en cada consulta
   */
  async pollTransaction(
    id,
    { until, intervalMs = 2000, timeoutMs = 60000, onPoll } = {}
  ) {
    const start = Date.now();
    for (;;) {
      const tx = await this.getTransaction(id);
      onPoll?.(tx);

      if (until(tx)) return tx;

      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `Tiempo de espera agotado (${timeoutMs}ms) esperando la transacción ${id}`
        );
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

export const FINAL_STATUSES = new Set([
  "APPROVED",
  "DECLINED",
  "ERROR",
  "VOIDED",
]);
