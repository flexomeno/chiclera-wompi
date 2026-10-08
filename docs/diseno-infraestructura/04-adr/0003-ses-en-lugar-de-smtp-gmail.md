# ADR 03: Amazon SES (API) en AWS, no SMTP Gmail

- Estado: Aceptado
- Fecha: 2026-10

## Contexto

El prototipo envía el código con Nodemailer + Gmail (contraseña de aplicación). SMTP desde Lambda es técnicamente posible, pero Gmail trata las IP de AWS como datacenter y suele bloquear o pedir captcha. El cupo gratuito de Gmail (~500/día) choca con el techo de 500 ventas/día. SES cobra ~USD 0,10 / 1.000 correos y está pensado para este patrón.

## Decisión

En AWS el canal de correo es **SES API v2** (`SendEmail`), configuration set y BOUNCE/COMPLAINT a SNS. No se usa SMTP de Gmail en las Lambdas. El From de producción y el production access se detallan en [ADR 11](0011-from-ses-en-dominio-propio.md).

El prototipo local puede seguir con Gmail.

## Consecuencias

- **Bien:** ~USD 1,50 al mes a 15.000 mails; sin password de Gmail en SSM.
- Production access **concedido**. From en dominio propio: ver ADR 11.
