#include "hotp.h"

#include <cstring>

#include "mbedtls/md.h"

static int hexNibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

bool parseHexSecret(const char *hex, uint8_t *out, size_t *outLen, size_t maxLen) {
  size_t digits = 0;
  for (size_t i = 0; hex[i] != '\0'; i++) {
    if (hex[i] == '\n' || hex[i] == '\r' || hex[i] == ' ') continue;
    if (hexNibble(hex[i]) < 0) return false;
    digits++;
  }
  if (digits == 0 || (digits % 2) != 0 || (digits / 2) > maxLen) return false;

  size_t w = 0;
  int hi = -1;
  for (size_t i = 0; hex[i] != '\0'; i++) {
    if (hex[i] == '\n' || hex[i] == '\r' || hex[i] == ' ') continue;
    int v = hexNibble(hex[i]);
    if (hi < 0) {
      hi = v;
    } else {
      out[w++] = (uint8_t)((hi << 4) | v);
      hi = -1;
    }
  }
  *outLen = w;
  return true;
}

void generateHotp(const uint8_t *secret, size_t secretLen, uint32_t counter,
                  uint8_t digits, char *out) {
  uint8_t counterBytes[8] = {0};
  counterBytes[4] = (uint8_t)((counter >> 24) & 0xff);
  counterBytes[5] = (uint8_t)((counter >> 16) & 0xff);
  counterBytes[6] = (uint8_t)((counter >> 8) & 0xff);
  counterBytes[7] = (uint8_t)(counter & 0xff);

  uint8_t digest[32];
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
  mbedtls_md_hmac_starts(&ctx, secret, secretLen);
  mbedtls_md_hmac_update(&ctx, counterBytes, sizeof(counterBytes));
  mbedtls_md_hmac_finish(&ctx, digest);
  mbedtls_md_free(&ctx);

  const uint8_t offset = digest[31] & 0x0f;
  const uint32_t codeInt =
      ((uint32_t)(digest[offset] & 0x7f) << 24) |
      ((uint32_t)(digest[offset + 1] & 0xff) << 16) |
      ((uint32_t)(digest[offset + 2] & 0xff) << 8) |
      ((uint32_t)(digest[offset + 3] & 0xff));

  uint32_t mod = 1;
  for (uint8_t i = 0; i < digits; i++) mod *= 10;
  uint32_t otp = codeInt % mod;

  for (int i = digits - 1; i >= 0; i--) {
    out[i] = (char)('0' + (otp % 10));
    otp /= 10;
  }
  out[digits] = '\0';
}

bool hotpSelfTest() {
  static const uint8_t secret[] = {
      0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
      0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef};
  const char *expected[] = {"356446", "181719", "709834", "882038", "963068"};
  const uint32_t counters[] = {0, 1, 2, 5, 1000};
  char got[8];
  for (size_t i = 0; i < 5; i++) {
    generateHotp(secret, sizeof(secret), counters[i], 6, got);
    if (strcmp(got, expected[i]) != 0) return false;
  }
  return true;
}
