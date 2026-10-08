# ADR 07: Códigos HOTP (HMAC-SHA256) validados offline en la Raspberry Pi

- Estado: Aceptado
- Fecha: 2026-10

## Contexto

El punto de canje no tiene internet fiable. TOTP exigiría reloj sincronizado. Un código aleatorio en DynamoDB exigiría que la Pi consultara AWS. Hace falta que **el mismo secreto y el mismo contador** produzcan el mismo dígito en Node (`src/hotp.js`) y en Python (`pi/hotp.py`), RFC 4226 con SHA256.

## Decisión

Se emite HOTP de 6 dígitos. El contador global vive en DynamoDB (atómico). La Pi guarda su propio estado local y el secreto (nunca en git). No hay llamada de la Pi a AWS en el momento de validar.

## Consecuencias

- **Bien:** la caja funciona en un recinto sin WAN; el outage de AWS no invalida códigos ya impresos/enviados.
- **Mal:** secreto compartido: hay que rotarlo con procedimiento (nuevo secreto en SSM **y** en la Pi, a la vez). Un desfase de contador (reintento raro que gaste un número) puede exigir ventana de resincronización en la Pi; el primer valor debe ser 0, como el prototipo.
- **Mal:** quien robe el secreto puede generar códigos. El secreto no viaja en logs ni en el frontend.
