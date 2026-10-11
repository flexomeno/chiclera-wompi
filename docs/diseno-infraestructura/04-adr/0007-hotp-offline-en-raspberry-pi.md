# ADR 07: Códigos HOTP (HMAC-SHA256) validados offline

- Estado: Aceptado (hardware de caja actualizado en [ADR 13](0013-validador-esp32.md))
- Fecha: 2026-10

## Contexto

El punto de canje no tiene internet fiable. TOTP exigiría reloj sincronizado. Un código aleatorio en DynamoDB exigiría que la caja consultara AWS. Hace falta que **el mismo secreto y el mismo contador** produzcan el mismo dígito en Node (`src/hotp.js`), Python (`pi/hotp.py`) y C++ (`dispositivo/validador/hotp.cpp`), RFC 4226 con SHA256.

## Decisión

Se emite HOTP de 6 dígitos. El contador global vive en DynamoDB (atómico, primer valor = 0). La caja guarda su propio `last_counter` (NVS en el ESP32; `state.json` en la Pi de referencia) y el secreto (nunca en git). No hay llamada de la caja a AWS al validar. Ventana de resincronización: 50 contadores hacia adelante.

## Consecuencias

- **Bien:** la caja funciona sin WAN; un outage de AWS no invalida códigos ya enviados.
- **Mal:** secreto compartido: rotarlo en SSM **y** en cada caja el mismo día. Un desfase (códigos de prueba gastados en la caja) puede rechazar un pago real aunque el correo sea correcto.
- **Mal:** quien robe el secreto puede generar códigos. El secreto no viaja en logs ni en el frontend.
