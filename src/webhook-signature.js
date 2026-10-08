import { createHash } from "node:crypto";

/**
 * Verifica la firma (checksum) de un evento webhook de Wompi.
 *
 * Algoritmo documentado en https://docs.wompi.co/docs/colombia/eventos/ :
 * 1. Concatenar en orden los valores de las propiedades listadas en `signature.properties`
 *    (cada una es una ruta tipo "transaction.id" dentro de `data`).
 * 2. Concatenar el campo `timestamp` (entero, tal cual, sin separadores).
 * 3. Concatenar el secreto de eventos del comercio (test_events_... / prod_events_...).
 * 4. Calcular SHA256 de la cadena resultante.
 * 5. Comparar contra `signature.checksum` (o el header `X-Event-Checksum`).
 *
 * @param {object} eventBody - Cuerpo JSON completo del webhook recibido.
 * @param {string} eventsSecret - Secreto de eventos del comercio (NO el de integridad).
 * @returns {boolean} true si la firma es válida.
 */
export function verifyWompiEventSignature(eventBody, eventsSecret) {
  if (!eventsSecret) {
    throw new Error(
      "Falta WOMPI_EVENTS_SECRET: no se puede verificar la firma del webhook sin él."
    );
  }

  const { data, signature, timestamp } = eventBody ?? {};

  if (!data || !signature?.properties || !signature?.checksum || timestamp === undefined) {
    return false;
  }

  const concatenatedValues = signature.properties
    .map((propertyPath) => getNestedValue(data, propertyPath))
    .map((value) => stringifyValue(value))
    .join("");

  const toHash = `${concatenatedValues}${timestamp}${eventsSecret}`;
  const computedChecksum = createHash("sha256").update(toHash).digest("hex");

  return computedChecksum.toUpperCase() === String(signature.checksum).toUpperCase();
}

function getNestedValue(obj, dottedPath) {
  return dottedPath.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function stringifyValue(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}
