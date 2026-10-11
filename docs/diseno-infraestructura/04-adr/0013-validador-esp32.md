# ADR 13: Caja de canje en ESP32 (no Raspberry Pi)

- Estado: Aceptado
- Fecha: 2026-10-10

## Contexto

ADR 07 fijó HOTP offline. El prototipo validaba en consola Python sobre una Pi. El hardware real disponible es un **ESP32 DevKit**, LCD 16x2 con backpack I2C, teclado 4x4, servo MG90S, LEDs y buzzer. El NodeMCU (ESP8266) se descartó: pocos GPIO para LCD paralelo + teclado.

## Decisión

La caja de producción es el firmware en [`dispositivo/`](../../../dispositivo/README.md): ESP32, WiFi apagado, secreto en `secrets.h` (gitignored, mismo hex que SSM), contador en NVS. `pi/` queda como referencia del algoritmo. LCD por I2C (SDA 21 / SCL 22), no en 4 bits. No conectar nada a CLK/D0–D3/CMD (bus de la flash).

## Consecuencias

- **Bien:** un solo PCB barato; pines de sobra; el canje sigue sin WAN.
- **Mal:** hay que flashear por USB; el contraste del LCD es un potenciómetro físico; un desfase del contador NVS vs DynamoDB (probar códigos de lab) puede rechazar un pago real hasta resincronizar.
- **Mal:** rotar el secreto implica SSM **y** volver a grabar `secrets.h` en cada caja.
