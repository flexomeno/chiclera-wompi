# ADR 06: Sin WhatsApp, SMS ni Twilio en esta versión

- Estado: Aceptado
- Fecha: 2026-10

## Contexto

Se quiso mandar el código por WhatsApp. Twilio Trial/Sandbox no pudo usar ni plantillas custom ni la plantilla oficial “Verification Codes” (error 21655 incluso desde la consola de Twilio). Además, Wompi QR **nunca** envía el celular del pagador: habría que pedirlo en el checkout.

AWS SNS **no envía WhatsApp**; el producto es End User Messaging Social (WABA + plantilla Meta, misma regla de negocio iniciado). SMS a Colombia ronda USD 0,05/mensaje (~USD 150/mes a 3.000 SMS), vs ~USD 18 de WhatsApp o ~USD 1,50 de SES.

## Decisión

Esta versión entrega el código **solo por correo SES** (y en pantalla tras el pago). No se pide teléfono. Twilio se abandona. WhatsApp queda como fase 2 explícita, con WABA, no con SNS clásico.

## Consecuencias

- **Bien:** se desbloquea el paso a AWS; menos PII; costo mínimo.
- **Mal:** quien no revise el correo depende de ver el código en la página (o del spam). La UX móvil del QR-desde-imagen mitiga la mitad del problema, no el canal de entrega.
