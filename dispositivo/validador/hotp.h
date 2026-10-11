#pragma once

#include <Arduino.h>
#include <stddef.h>
#include <stdint.h>

// HOTP RFC 4226 con HMAC-SHA256. Debe coincidir con src/hotp.js y pi/hotp.py.
bool parseHexSecret(const char *hex, uint8_t *out, size_t *outLen, size_t maxLen);
void generateHotp(const uint8_t *secret, size_t secretLen, uint32_t counter,
                  uint8_t digits, char *out /* digits+1 */);
bool hotpSelfTest();
