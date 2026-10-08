#!/usr/bin/env python3
"""
Validador offline de códigos de pago para Raspberry Pi.

Este script NO requiere conexión a internet ni a ninguna red. Valida un
código numérico ingresado por el usuario comparándolo contra una ventana
de códigos HOTP generados localmente a partir de un secreto compartido
(provisionado manualmente una sola vez — ver README.md de esta carpeta).

Uso:
    python3 validar_codigo.py

Archivos usados (todos en esta misma carpeta):
    secret.key  -> el secreto compartido en hexadecimal (debe coincidir
                   EXACTAMENTE con HOTP_SECRET del servidor). Se copia una
                   sola vez, manualmente (USB), nunca por red.
    state.json  -> guarda el último contador validado exitosamente, para
                   impedir que un código ya usado se vuelva a aceptar
                   (persiste incluso si la Pi se reinicia).
    config.json -> parámetros opcionales (dígitos, tamaño de ventana).
"""

import json
import os
import sys

from hotp import generate_hotp

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SECRET_PATH = os.path.join(SCRIPT_DIR, "secret.key")
STATE_PATH = os.path.join(SCRIPT_DIR, "state.json")
CONFIG_PATH = os.path.join(SCRIPT_DIR, "config.json")

DEFAULT_CONFIG = {
    "digits": 6,
    # Cuántos contadores hacia adelante se prueban. Debe ser lo bastante
    # grande para cubrir pagos que nunca se validaron en esta Pi (se "saltan"
    # sin romper la sincronía), pero no tan grande que facilite adivinar.
    "resync_window": 50,
}


def load_secret() -> bytes:
    if not os.path.exists(SECRET_PATH):
        print(f"❌ No se encontró el archivo de secreto en: {SECRET_PATH}")
        print("   Copia 'provisioning/pi-secret.key' del servidor a esta ruta")
        print("   (vía USB, manualmente) antes de poder validar códigos.")
        sys.exit(1)

    with open(SECRET_PATH, "r") as f:
        hex_secret = f.read().strip()

    try:
        return bytes.fromhex(hex_secret)
    except ValueError:
        print("❌ El contenido de secret.key no es hexadecimal válido.")
        sys.exit(1)


def load_config() -> dict:
    if not os.path.exists(CONFIG_PATH):
        return dict(DEFAULT_CONFIG)
    try:
        with open(CONFIG_PATH, "r") as f:
            data = json.load(f)
        return {**DEFAULT_CONFIG, **data}
    except (json.JSONDecodeError, OSError):
        print("⚠️  No se pudo leer config.json, usando valores por defecto.")
        return dict(DEFAULT_CONFIG)


def load_state() -> dict:
    if not os.path.exists(STATE_PATH):
        return {"last_counter": -1}
    try:
        with open(STATE_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        print("⚠️  No se pudo leer state.json, se asume que no se ha validado ningún código aún.")
        return {"last_counter": -1}


def save_state(state: dict) -> None:
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)


def validate_code(code: str, secret: bytes, state: dict, config: dict):
    """
    Busca el código dentro de la ventana de resincronización, empezando
    justo después del último contador que ya fue validado exitosamente.

    Devuelve una tupla: (aprobado: bool, mensaje: str, nuevo_contador: int | None)
    """
    code = code.strip()
    digits = config["digits"]

    if not code.isdigit() or len(code) != digits:
        return False, f"Formato inválido. Se esperaban {digits} dígitos numéricos.", None

    last_counter = state.get("last_counter", -1)
    window = config["resync_window"]

    for counter in range(last_counter + 1, last_counter + 1 + window):
        expected = generate_hotp(secret, counter, digits)
        if expected == code:
            return True, "Código válido.", counter

    return False, "Código inválido, no reconocido o ya utilizado.", None


def main():
    secret = load_secret()
    config = load_config()
    state = load_state()

    print("──────────────────────────────────────────")
    print("🔒 Validador offline de códigos de pago")
    print("   (Este dispositivo no requiere internet)")
    print("──────────────────────────────────────────")

    while True:
        try:
            code = input("\nIngresa el código numérico (o 'salir' para terminar): ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n👋 Saliendo.")
            break

        if code.lower() in ("salir", "exit", "quit"):
            break

        approved, message, new_counter = validate_code(code, secret, state, config)

        if approved:
            state["last_counter"] = new_counter
            save_state(state)
            print(f"✅ APROBADO — {message}")
        else:
            print(f"❌ NO APROBADO — {message}")


if __name__ == "__main__":
    main()
