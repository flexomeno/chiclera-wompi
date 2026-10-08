"""
Implementación de HOTP (RFC 4226, variante HMAC-SHA256) sin dependencias externas.

Debe producir EXACTAMENTE el mismo resultado que `src/hotp.js` del servidor,
dado el mismo secreto (en bytes) y el mismo contador. Esto es lo que permite
que esta Raspberry Pi, sin ninguna conexión a internet ni al servidor, pueda
validar de forma independiente los códigos generados remotamente.
"""

import hmac
import hashlib
import struct


def generate_hotp(secret: bytes, counter: int, digits: int = 6) -> str:
    """
    Genera un código HOTP de `digits` dígitos para el contador dado.

    :param secret: Secreto compartido, en bytes crudos (no en texto/hex).
    :param counter: Contador entero no negativo.
    :param digits: Cantidad de dígitos del código resultante.
    """
    # El contador se codifica como un entero de 8 bytes, big-endian (estándar RFC 4226).
    counter_bytes = struct.pack(">Q", counter)

    digest = hmac.new(secret, counter_bytes, hashlib.sha256).digest()

    # Truncamiento dinámico (RFC 4226), adaptado para un digest de 32 bytes (SHA256).
    offset = digest[-1] & 0x0F
    code_bytes = digest[offset:offset + 4]
    code_int = struct.unpack(">I", code_bytes)[0] & 0x7FFFFFFF

    otp = code_int % (10 ** digits)
    return str(otp).zfill(digits)
