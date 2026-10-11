/*
 * Validador offline — ESP32 DevKit (ESP-WROOM-32)
 *
 * Teclado 4x4 + LCD 16x2 I2C + servo MG90S + LEDs + buzzer
 * LCD siempre: "Ingresa tu codigo" + dígitos al teclear.
 * Válido: 1 pitido, LED, servo +15°, 15 s, servo a 0°.
 * Inválido: 2 pitidos, LED rojo.
 *
 * Sin WiFi. Secreto en secrets.h (mismo hex que HOTP_SECRET / pi/secret.key).
 *
 * Placa Arduino IDE: "ESP32 Dev Module"
 * Librerías: LiquidCrystal I2C (Frank de Brabander), ESP32Servo
 */

#include <ESP32Servo.h>
#include <LiquidCrystal_I2C.h>
#include <Preferences.h>
#include <WiFi.h>
#include <Wire.h>

#include "hotp.h"

#if defined(__has_include)
#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif
#else
#include "secrets.example.h"
#endif

#ifndef HOTP_SECRET_IS_EXAMPLE
#define HOTP_SECRET_IS_EXAMPLE 0
#endif

// ---------- pines ESP32 (evitar 0, 2, 6-11, 12, 15) ----------
static const int PIN_SDA = 21;
static const int PIN_SCL = 22;
static const int PIN_SERVO = 18;
static const int PIN_LED_OK = 4;     // amarillo (o verde)
static const int PIN_LED_BAD = 16;   // rojo
static const int PIN_BUZZER = 17;    // módulo 3 pines: S → 17, VCC, GND

// Teclado 4x4. Cinta: R1 R2 R3 R4 C1 C2 C3 C4 (pin 1 = el más cercano a la marca)
static const uint8_t PIN_ROWS[4] = {32, 33, 25, 26};
static const uint8_t PIN_COLS[4] = {27, 14, 19, 23};

static const char KEYS[4][4] = {
    {'1', '2', '3', 'A'},
    {'4', '5', '6', 'B'},
    {'7', '8', '9', 'C'},
    {'*', '0', '#', 'D'},
};

static const uint8_t DIGITS = 6;
static const uint8_t RESYNC_WINDOW = 50;
static const int SERVO_REPOSO = 0;
static const int SERVO_ABIERTO = 15;
static const uint32_t ABIERTO_MS = 15000;
static const uint32_t RECHAZO_MS = 2000;

LiquidCrystal_I2C *lcd = nullptr;
Servo servo;
Preferences prefs;

uint8_t secret[64];
size_t secretLen = 0;
int32_t lastCounter = -1;

char typed[DIGITS + 1];
uint8_t typedLen = 0;
char lastKey = 0;
uint32_t lastKeyMs = 0;

static void ledsOff() {
  digitalWrite(PIN_LED_OK, LOW);
  digitalWrite(PIN_LED_BAD, LOW);
}

static void ledValid() {
  digitalWrite(PIN_LED_BAD, LOW);
  digitalWrite(PIN_LED_OK, HIGH);
}

static void ledInvalid() {
  digitalWrite(PIN_LED_OK, LOW);
  digitalWrite(PIN_LED_BAD, HIGH);
}

static void lcdPrint(uint8_t col, uint8_t row, const char *text) {
  if (!lcd) return;
  lcd->setCursor(col, row);
  lcd->print(text);
}

static void showTitulo() {
  if (!lcd) return;
  lcd->setCursor(0, 0);
  lcd->print("Ingresa tu      ");
}

static void showCodigo() {
  if (!lcd) return;
  lcd->setCursor(0, 1);
  lcd->print("codigo ");
  for (uint8_t i = 0; i < DIGITS; i++) {
    lcd->print(i < typedLen ? typed[i] : '_');
  }
  lcd->print("   ");
}

static void prompt() {
  ledsOff();
  if (!lcd) return;
  showTitulo();
  showCodigo();
}

static void showMsg(const char *l1, const char *l2) {
  if (!lcd) return;
  lcd->clear();
  lcdPrint(0, 0, l1);
  lcdPrint(0, 1, l2);
}

static void beepOnce() {
  digitalWrite(PIN_BUZZER, HIGH);
  delay(140);
  digitalWrite(PIN_BUZZER, LOW);
}

static void beepTimes(uint8_t n) {
  for (uint8_t i = 0; i < n; i++) {
    beepOnce();
    if (i + 1 < n) delay(140);
  }
}

static uint8_t probeI2c() {
  const uint8_t candidates[] = {0x27, 0x3F};
  for (uint8_t addr : candidates) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) return addr;
  }
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) return addr;
  }
  return 0;
}

static char scanKeypad() {
  for (uint8_t r = 0; r < 4; r++) {
    pinMode(PIN_ROWS[r], OUTPUT);
    digitalWrite(PIN_ROWS[r], HIGH);
  }
  for (uint8_t c = 0; c < 4; c++) {
    pinMode(PIN_COLS[c], INPUT_PULLUP);
  }

  char found = 0;
  for (uint8_t r = 0; r < 4; r++) {
    digitalWrite(PIN_ROWS[r], LOW);
    delayMicroseconds(60);
    for (uint8_t c = 0; c < 4; c++) {
      if (digitalRead(PIN_COLS[c]) == LOW) {
        found = KEYS[r][c];
      }
    }
    digitalWrite(PIN_ROWS[r], HIGH);
    if (found) break;
  }
  return found;
}

static bool validateCode(const char *code, int32_t *matched) {
  char expected[8];
  const int32_t start = lastCounter + 1;
  for (uint8_t i = 0; i < RESYNC_WINDOW; i++) {
    const int32_t counter = start + (int32_t)i;
    if (counter < 0) continue;
    generateHotp(secret, secretLen, (uint32_t)counter, DIGITS, expected);
    if (strcmp(expected, code) == 0) {
      *matched = counter;
      return true;
    }
  }
  return false;
}

static void onValid(int32_t counter) {
  lastCounter = counter;
  prefs.putInt("last", lastCounter);

  lcd->clear();
  lcdPrint(0, 0, "Gira la perilla");
  lcdPrint(0, 1, "a la derecha");
  beepTimes(1);
  ledValid();
  servo.write(SERVO_ABIERTO);
  delay(ABIERTO_MS);
  servo.write(SERVO_REPOSO);
  delay(400);
  ledsOff();
  typedLen = 0;
  typed[0] = '\0';
  prompt();
}

static void onInvalid() {
  prompt();
  beepTimes(2);
  ledInvalid();
  delay(RECHAZO_MS);
  ledsOff();
  typedLen = 0;
  typed[0] = '\0';
  prompt();
}

static void submit() {
  typed[typedLen] = '\0';
  if (typedLen != DIGITS) {
    prompt();
    beepTimes(2);
    delay(400);
    return;
  }
  int32_t matched = -1;
  if (validateCode(typed, &matched)) {
    onValid(matched);
  } else {
    onInvalid();
  }
}

static void handleKey(char k) {
  if (k == '*' || k == 'C') {
    if (typedLen > 0) typedLen--;
    typed[typedLen] = '\0';
    prompt();
    return;
  }
  if (k == '#' || k == 'D' || k == 'A' || k == 'B') {
    submit();
    return;
  }
  if (typedLen >= DIGITS) return;
  typed[typedLen++] = k;
  typed[typedLen] = '\0';
  prompt();
  if (typedLen == DIGITS) submit();
}

void setup() {
  Serial.begin(115200);
  delay(50);

  WiFi.mode(WIFI_OFF);

  pinMode(PIN_LED_OK, OUTPUT);
  pinMode(PIN_LED_BAD, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  ledsOff();

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  servo.setPeriodHertz(50);
  servo.attach(PIN_SERVO, 500, 2400);
  servo.write(SERVO_REPOSO);

  Wire.begin(PIN_SDA, PIN_SCL);
  const uint8_t addr = probeI2c();
  lcd = new LiquidCrystal_I2C(addr ? addr : 0x27, 16, 2);
  lcd->init();
  lcd->backlight();

  if (!addr) {
    Serial.println("No hay dispositivo I2C. Revisa SDA=21 SCL=22 y VCC/GND.");
  } else {
    Serial.printf("LCD I2C en 0x%02X\n", addr);
  }
  lcd->clear();
  prompt();
  delay(200);

  if (!hotpSelfTest()) {
    showMsg("ERROR HOTP", "Firmware roto");
    while (true) delay(1000);
  }

  if (!parseHexSecret(HOTP_SECRET_HEX, secret, &secretLen, sizeof(secret))) {
    showMsg("ERROR secreto", "Revisa secrets.h");
    while (true) delay(1000);
  }

  prefs.begin("hotp", false);
  lastCounter = prefs.getInt("last", -1);

  typed[0] = '\0';
  typedLen = 0;

  if (HOTP_SECRET_IS_EXAMPLE) {
    showMsg("Secreto EJEMPLO", "Pega el real");
    delay(2000);
  }

  prompt();
}

void loop() {
  const char k = scanKeypad();
  const uint32_t now = millis();
  if (k && k != lastKey && (now - lastKeyMs) > 40) {
    lastKeyMs = now;
    lastKey = k;
    handleKey(k);
  }
  if (!k) lastKey = 0;
  delay(12);
}
