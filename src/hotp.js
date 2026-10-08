import { createHmac } from "node:crypto";

/**
 * Genera un código HOTP (RFC 4226, variante HMAC-SHA256) para un contador dado.
 *
 * IMPORTANTE: esta implementación debe producir EXACTAMENTE el mismo resultado
 * que `pi/hotp.py`, dado el mismo secreto (en bytes) y el mismo contador, ya que
 * un lado genera el código (este servidor) y el otro lo valida de forma 100%
 * offline (la Raspberry Pi), sin ninguna comunicación entre ambos en tiempo real.
 *
 * @param {Buffer} secret - Secreto compartido, en bytes crudos (no en texto/hex).
 * @param {number} counter - Contador entero no negativo.
 * @param {number} digits - Cantidad de dígitos del código resultante.
 * @returns {string} Código numérico de `digits` dígitos, con ceros a la izquierda si aplica.
 */
export function generateHotp(secret, counter, digits = 6) {
  // El contador se codifica como un entero de 8 bytes, big-endian (estándar RFC 4226).
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha256", secret).update(counterBuffer).digest();

  // Truncamiento dinámico (RFC 4226), adaptado para un digest de 32 bytes (SHA256):
  // se usan los últimos 4 bits del digest como offset para tomar 4 bytes de él.
  const offset = hmac[hmac.length - 1] & 0x0f;
  const codeInt =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = codeInt % 10 ** digits;
  return String(otp).padStart(digits, "0");
}
