# Validador offline — Raspberry Pi

Este script valida códigos de pago **sin ninguna conexión a internet ni a ninguna
red**. Usa HOTP (RFC 4226, HMAC-SHA256): el mismo algoritmo de los tokens OTP
físicos (como YubiKey), diseñado específicamente para funcionar sin reloj
sincronizado ni comunicación en tiempo real.

## Instalación en la Raspberry Pi

1. Copia esta carpeta completa (`pi/`) a la Raspberry Pi (USB, SD, etc.). Solo
   necesitas `hotp.py`, `validar_codigo.py` y `config.json`. **No** necesitas
   ninguna librería externa — solo Python 3 estándar.

2. **Provisiona el secreto (paso manual, una sola vez, offline):**
   - En el servidor, ejecuta `npm run generate-secret` (ver README principal).
   - Esto genera `provisioning/pi-secret.key`.
   - Copia ese archivo a esta carpeta en la Pi, **renombrándolo a `secret.key`**.
   - Verifica que el contenido sea una sola línea hexadecimal, sin espacios ni
     saltos de línea extra.

   ⚠️ Este secreto es el único vínculo entre el servidor y la Pi. Trátalo como
   una contraseña: no lo subas a git, no lo envíes por canales inseguros.

3. Ejecuta el validador:

   ```bash
   python3 validar_codigo.py
   ```

4. Ingresa el código numérico que el usuario recibió por correo / en pantalla
   después de pagar. El script imprimirá `✅ APROBADO` o `❌ NO APROBADO`.

## Cómo funciona la validación (sin red)

- El servidor mantiene un contador que incrementa cada vez que genera un
  código nuevo (uno por cada pago aprobado).
- Esta Pi mantiene su **propio** contador (`state.json` → `last_counter`),
  que representa el último código que ella misma validó con éxito.
- Al recibir un código, prueba los contadores desde `last_counter + 1` hasta
  `last_counter + resync_window` (por defecto 50), calculando el HOTP
  esperado para cada uno con el secreto compartido.
- Si encuentra coincidencia, actualiza y persiste su `last_counter` → ese
  código (y cualquiera anterior) **ya no podrá volver a usarse**, incluso si
  la Pi se reinicia.
- Si no hay coincidencia dentro de la ventana, el código se rechaza (inválido,
  ya usado, o la ventana de 50 pagos "saltados" fue superada).

## Archivos generados localmente (no los borres)

- `secret.key` — el secreto compartido (provisionado una sola vez).
- `state.json` — el último contador validado. **Es el único mecanismo que
  evita reutilizar un código.** Si se borra, la Pi "olvida" qué códigos ya
  usó (riesgo de reutilización de códigos antiguos dentro de la ventana).
- `config.json` — parámetros (dígitos, tamaño de ventana). Debe coincidir
  con `HOTP_DIGITS` del servidor.

## Siguiente paso (pendiente de definir)

Por ahora la entrada es por teclado de la terminal (`input()`) y la salida es
texto en consola, ya que el hardware final (teclado físico/pantalla/LEDs) aún
no está decidido. La función `validate_code()` ya está separada de la
interfaz de entrada/salida, así que conectar un teclado matricial, una
pantalla LCD o LEDs más adelante no debería requerir tocar la lógica de
validación — solo reemplazar el bucle de `main()`.
