# ADR 10: SSM Parameter Store Standard, no Secrets Manager

- Estado: Aceptado
- Fecha: 2026-10

## Contexto

Secrets Manager cobra USD 0,40 por secreto al mes. Tres o cuatro secretos Wompi + HOTP ≈ USD 1,20 fijos, una fracción grande de una factura de USD 4. SSM Standard SecureString con clave administrada `aws/ssm` es gratis. Rotación automática nativa es la ventaja de Secrets Manager; aquí la rotación es manual (y el HOTP además vive en la Pi).

## Decisión

Todos los secretos de aplicación van a SSM SecureString bajo `/wompi-qr/{env}/`. IAM restringe el prefix. No se usa Secrets Manager ni CMK propia (USD 1/mes).

## Consecuencias

- **Bien:** $0 de secretos; mismo cifrado en reposo que necesita este volumen.
- **Mal:** no hay rotación automática ni réplica multi-región. El HOTP se rota a mano en dos sitios (SSM y Pi). Aceptable.
