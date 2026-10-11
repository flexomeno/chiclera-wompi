# Validador físico — ESP32 + teclado + LCD I2C + servo

Caja offline: el cliente teclea el código de 6 dígitos. Si es un HOTP válido
(el mismo algoritmo que `src/hotp.js` / `pi/hotp.py`):

1. Un pitido en el buzzer y se enciende el LED amarillo (o verde).
2. El servo MG90S gira **15°**.
3. Espera **15 segundos**. El LCD muestra `Gira la perilla` / `a la derecha`.
4. El servo vuelve a **0°**, el LED se apaga y el LCD vuelve a `______`.

Si el código es inválido o ya se usó: **dos pitidos**, LED rojo 2 s. El LCD no
cambia el título: siempre `Ingresa tu` / `codigo ______` y los dígitos se ven al teclear.

**No usa WiFi.** El secreto se copia a `secrets.h` por USB, igual que en la Pi.

Cerebro: **ESP32 DevKit** (ESP-WROOM-32), no el NodeMCU.

## Qué se usa de tus piezas


| Pieza                                 | Rol                                                        |
| ------------------------------------- | ---------------------------------------------------------- |
| ESP32 DevKit (micro-USB, 38 pines)    | Cerebro                                                    |
| LCD 16x2 + backpack **I2C** (PCF8574) | Mensajes                                                   |
| Teclado membrana 4x4                  | Entrada (`*` borra, `#` envía; a los 6 dígitos envía solo) |
| TowerPro MG90S                        | Apertura 15°                                               |
| LED amarillo + resistor               | Válido (no trajiste verde)                                 |
| LED rojo + resistor                   | Inválido                                                   |
| Buzzer de 3 pines                     | 1 pitido = aprobado, 2 = rechazado                         |


No se usan: el NodeMCU Lolin ni la pila CR2032.

## Arduino IDE

1. Placa: **ESP32 Dev Module** (paquete *esp32* de Espressif).
2. Librerías: **LiquidCrystal I2C** (Frank de Brabander) y **ESP32Servo**.
3. Abre `dispositivo/validador/validador.ino`.
4. Secreto:

```bash
cp dispositivo/validador/secrets.example.h dispositivo/validador/secrets.h
```

Pega en `HOTP_SECRET_HEX` el hex de `pi/secret.key` (el mismo `HOTP_SECRET` de
AWS). Quita `#define HOTP_SECRET_IS_EXAMPLE 1`. `secrets.h` no se sube a git.

## Cableado

Alimenta el ESP32 por USB. **GND común** en todas las piezas.
El servo **no** se alimenta del 3V3: su rojo va a **5V** del DevKit (o fuente 5 V
aparte si el USB se cae al mover el servo).

### LCD I2C (4 cables)


| Backpack | ESP32                           |
| -------- | ------------------------------- |
| GND      | GND                             |
| VCC      | 5V (si no enciende, prueba 3V3) |
| SDA      | **GPIO 21**                     |
| SCL      | **GPIO 22**                     |


Dirección típica `0x27` o `0x3F`. Al arrancar el firmware la busca sola.
El potenciómetro del backpack regula el contraste.

### Servo MG90S


| Cable   | A           |
| ------- | ----------- |
| Marrón  | GND         |
| Rojo    | 5V          |
| Naranja | **GPIO 18** |




### LEDs (pata larga = ánodo)


| LED               | ESP32       | Resistencia                |
| ----------------- | ----------- | -------------------------- |
| Amarillo (válido) | **GPIO 4**  | 220 Ω al ánodo o al cátodo |
| Rojo (inválido)   | **GPIO 16** | 220 Ω                      |


Cátodo al GND. Si más adelante tienes LED verde, sustitúyelo en GPIO 4.

### Buzzer (módulo de 3 pines)


| Buzzer          | ESP32                           |
| --------------- | ------------------------------- |
| S / I/O / medio | **GPIO 17**                     |
| VCC / +         | 3V3 (o 5V si el módulo lo pide) |
| GND / −         | GND                             |


Si suena al revés (suena en reposo y calla al pitar), el módulo es activo en
LOW: en `validador.ino` invierte `HIGH`/`LOW` de `beepOnce()`.

### Teclado 4x4

Cinta de 8 hilos, pin 1 = el de la marca / el más cercano al borde negro:


| Pin cinta | Tecla fila/col     | ESP32   |
| --------- | ------------------ | ------- |
| 1         | Fila 1 (`1 2 3 A`) | GPIO 32 |
| 2         | Fila 2 (`4 5 6 B`) | GPIO 33 |
| 3         | Fila 3 (`7 8 9 C`) | GPIO 25 |
| 4         | Fila 4 (`* 0 # D`) | GPIO 26 |
| 5         | Col 1              | GPIO 27 |
| 6         | Col 2              | GPIO 14 |
| 7         | Col 3              | GPIO 19 |
| 8         | Col 4              | GPIO 23 |


Si un número no coincide, gira el teclado o intercambia filas/columnas en
`KEYS` / `PIN_ROWS` / `PIN_COLS` de `validador.ino`.

## Uso

1. Enciende. LCD: `Ingresa tu` / `codigo ______`
2. Cada tecla se ve en la segunda línea. `#` envía; `*` borra. A los 6 dígitos envía solo.
3. Válido → 1 pitido + LED + servo 15° → 15 s → cierra. Inválido → 2 pitidos.
4. Un código ya aceptado no vuelve a abrir (contador en flash).



## Si no abre con un código bueno

- El hex de `secrets.h` debe ser **idéntico** al de producción (64 caracteres).
- El contador de la caja se atrasó más de 50 pagos sin validar → ventana agotada.
- Para resetear solo el contador (peligro: permite reusar códigos viejos de la
ventana): borra NVS en Arduino IDE (*Erase all flash*) o cambia el namespace.



## Alimentación

USB 5 V aguanta el ESP32 + LCD + LEDs. El MG90S en arranque puede tirar el USB:
si el ESP32 se reinicia al mover el servo, alimenta el servo con 5 V aparte
(GND común).