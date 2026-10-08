import { json, pathParam } from "../lib/http.mjs";
import { originIsValid } from "../lib/origin-verify.mjs";
import { getSale } from "../lib/dynamo.mjs";

export async function handler(event) {
  const path = event.rawPath || event.requestContext?.http?.path || "";

  if (path === "/health") {
    return json(200, { ok: true });
  }

  if (!originIsValid(event)) {
    return json(403, { error: "Forbidden" });
  }

  const transactionId = pathParam(event, "transactionId");
  if (!transactionId) {
    return json(400, { error: "Falta transactionId" });
  }

  try {
    const sale = await getSale(transactionId);
    if (!sale) {
      return json(404, { error: "Transacción no encontrada" });
    }

    return json(200, {
      status: sale.status,
      statusMessage: sale.statusMessage ?? null,
      reference: sale.reference,
      amountInCents: sale.amountInCents,
      code: sale.code ?? null,
    });
  } catch (err) {
    console.error("get-checkout failed", err.message);
    return json(500, { error: "No se pudo consultar la transacción." });
  }
}
