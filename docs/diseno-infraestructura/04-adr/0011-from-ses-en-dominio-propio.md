# ADR 11: From SES en `pagos@techtest.app`, no Gmail

- Estado: Aceptado
- Fecha: 2026-10

## Contexto

El primer envío en AWS usó From `wilrengui@gmail.com` *vía* amazonses.com. El código llegó, pero Gmail lo metió en spam (“se parece a otros mensajes marcados”). No se puede verificar el dominio `gmail.com`. Se posee `techtest.app`. SES además exige dominio verificado para pedir production access.

## Decisión

1. Identidad de dominio **techtest.app** (DKIM RSA 2048, MAIL FROM `mail.techtest.app`, SPF, DMARC).
2. Production access SES: **GRANTED** (transaccional).
3. From de los códigos: **`Pagos <pagos@techtest.app>`**. El Gmail queda solo para alarmas SNS y como identidad email auxiliar.
4. No se usa Gmail como From de SES.

## Consecuencias

- **Bien:** el correo entra en Recibidos (verificado en prueba real). Production access permite destinatarios arbitrarios.
- **Mal:** hay que mantener los CNAME DKIM en el DNS del registrador (no está en Route 53 de esta cuenta).
- **Mal:** coexistían dos TXT DMARC (`p=reject` previo y `p=none`); conviene **un solo** registro. No bloquea el envío actual.
