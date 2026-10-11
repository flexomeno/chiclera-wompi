#pragma once

// Copia este archivo a secrets.h y pega el hex de pi/secret.key
// (el mismo HOTP_SECRET del servidor / SSM). Una sola línea, sin comillas extras.
//
//   cp secrets.example.h secrets.h
//
// secrets.h está en .gitignore.

#define HOTP_SECRET_HEX "0123456789abcdef0123456789abcdef"
#define HOTP_SECRET_IS_EXAMPLE 1
