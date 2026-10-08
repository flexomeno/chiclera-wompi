# Pruebas de Wompi — Pago con Código QR (Bancolombia QR)

Script de pruebas en Node.js (sin dependencias externas) para generar una transacción
de **Código QR** usando el API de Wompi en el ambiente **Sandbox**, siguiendo el flujo
oficial documentado en:

- Planes y tarifas: https://wompi.com/es/co/planes-tarifas/ (el "Código QR" tiene tarifa especial de 1%)
- Referencia del API: https://docs.wompi.co/docs/colombia/referencia/
- Métodos de pago (sección "Bancolombia QR"): https://docs.wompi.co/docs/colombia/metodos-de-pago/
- Datos de prueba en Sandbox: https://docs.wompi.co/docs/colombia/datos-de-prueba-en-sandbox/
- Ambientes y llaves: https://docs.wompi.co/docs/colombia/ambientes-y-llaves/

> **Nota sobre el nombre del método:** en el API de Wompi el "Código QR" se llama
> `BANCOLOMBIA_QR`. Permite a tus clientes pagar escaneando el QR desde la app
> Bancolombia o Nequi. Solo aplica para personas naturales.

## 1. Consigue tus llaves de Sandbox

1. Regístrate en https://comercios.wompi.co
2. En el dashboard, ve a **Desarrolladores** y copia:
   - Llave pública: `pub_test_...`
   - Llave privada: `prv_test_...`
   - Secreto de integridad: `test_integrity_...`

Nunca uses llaves de producción (`pub_prod_`, `prv_prod_`, `prod_integrity_`) para pruebas.

## 2. Configura el entorno

```bash
cp .env.example .env
```

Edita `.env` y reemplaza las 3 llaves con las tuyas de Sandbox. Opcionalmente ajusta:

- `WOMPI_SANDBOX_STATUS`: `APPROVED` | `DECLINED` | `ERROR` — resultado que quieres simular.
- `WOMPI_AMOUNT_IN_CENTS`: monto en centavos (ej. `5000000` = $50.000 COP).
- `WOMPI_CUSTOMER_EMAIL`: correo de prueba.

## 3. Ejecuta la prueba

```bash
npm run test:qr
```

El script hace exactamente lo que harías en una integración real:

1. **`GET /merchants/info`** — obtiene los tokens de aceptación prefirmados
   (política de privacidad y tratamiento de datos personales).
2. **Genera la firma de integridad** — `SHA256(reference + amount_in_cents + currency + integrity_secret)`.
3. **`POST /transactions`** — crea la transacción con `payment_method.type = "BANCOLOMBIA_QR"`
   y, solo en Sandbox, `payment_method.sandbox_status` para forzar el resultado deseado.
4. **Long polling `GET /transactions/{id}`** — espera hasta que aparezca
   `payment_method.extra.qr_image` (el QR en base64/SVG) y `qr_id`.
5. Guarda la imagen del QR decodificada en `output/<id>-qr.svg` para que puedas
   abrirla y, en un flujo real, escanearla con tu app bancaria.
6. Sigue el polling hasta que la transacción llegue a un estado final
   (`APPROVED`, `DECLINED`, `ERROR` o `VOIDED`) e imprime el resultado.

## Notas importantes

- En Sandbox, el QR **no se puede escanear de verdad**: el resultado final lo
  controla el campo `sandbox_status` que envías al crear la transacción
  (`APPROVED`, `DECLINED` o `ERROR`), no el escaneo real del QR.
- En producción, en cambio, debes hacer *long polling* real hasta que el usuario
  escanee el QR y complete el pago desde su app bancaria.
- Verifica siempre el estado final de una transacción desde tu backend
  (`GET /transactions/{id}` con tu llave privada) y, para producción, configura
  **Webhooks** (evento `transaction.updated`) en vez de depender solo del polling.
- Según la tarifa publicada en Wompi, el **Código QR** tiene una comisión especial
  del **1% por transacción exitosa** (más baja que el 2.65% + $700 + IVA del resto
  de medios de pago del Plan Avanzado). Ver https://wompi.com/es/co/planes-tarifas/

## Estructura del proyecto

```
.
├── .env.example           # Plantilla de variables de entorno
├── src/
│   ├── env.js              # Carga minimalista del .env (sin dependencias)
│   ├── wompi.js             # Cliente del API de Wompi (firma, tokens, transacción QR, polling)
│   ├── test-qr.js           # Script de prueba manual (crea 1 transacción QR y espera resultado)
│   ├── hotp.js              # Generador de códigos HOTP (debe coincidir con pi/hotp.py)
│   ├── webhook-signature.js # Verifica la firma de los webhooks de Wompi
│   ├── store.js             # Persistencia simple en JSON (contador + códigos generados)
│   ├── mailer.js            # Envío de email con el código (Gmail SMTP)
│   └── server.js            # Servidor: webhook, página de recibo, /pagar (Widget) y /pagar-qr (API directa, solo QR)
├── scripts/
│   ├── generate-secret.js   # Genera el secreto compartido HOTP (acepta nombre de archivo opcional)
│   ├── debug-widget.js      # Depuración con Playwright del flujo /pagar (Widget)
│   └── debug-pagar-qr.js    # Depuración con Playwright del flujo /pagar-qr (API directa)
├── pi/                       # Para copiar a la Raspberry Pi (sin conexión a internet)
│   ├── hotp.py               # Misma lógica HOTP, en Python puro, sin dependencias
│   ├── validar_codigo.py     # Script de validación offline (entrada por teclado por ahora)
│   ├── secret.key            # (gitignored) secreto HOTP activo en la Pi — Sandbox o Producción, uno a la vez
│   ├── secret-sandbox.backup.key # (gitignored) respaldo del secreto de Sandbox mientras secret.key tiene el de Producción
│   ├── state.json            # (gitignored) último contador validado por la Pi (previene reuso)
│   ├── config.json           # Parámetros (dígitos, ventana de resincronización)
│   └── README.md             # Instrucciones de instalación y aprovisionamiento del secreto
├── data/                     # (gitignored, autogenerado) contador + códigos generados por el servidor
├── provisioning/             # (gitignored, autogenerado) secretos HOTP listos para copiar a la Pi
│   ├── pi-secret.key         # Secreto de Sandbox
│   └── pi-secret-prod.key    # Secreto de Producción (independiente, para no mezclar contadores)
└── .env.sandbox.backup       # (gitignored) respaldo del .env de Sandbox mientras el activo es de Producción
```

## Flujo 2 — Código offline para validación en Raspberry Pi

Cuando un pago con **Código QR** es aprobado, el sistema genera un código numérico
de un solo uso, se lo muestra y envía por correo al cliente, y ese código puede
validarse en una Raspberry Pi **sin ninguna conexión a internet**, usando HOTP
(RFC 4226 — el mismo algoritmo de los tokens OTP físicos tipo YubiKey).

### 1. Genera el secreto compartido (una sola vez)

```bash
npm run generate-secret
```

Esto escribe `HOTP_SECRET` en tu `.env` y genera `provisioning/pi-secret.key`.

### 2. Completa el resto del `.env`

- `WOMPI_EVENTS_SECRET`: Dashboard de Wompi → Mi cuenta → Secretos para integración
  técnica (⚠️ es **distinto** al `WOMPI_INTEGRITY_SECRET` que ya tenías).
- `GMAIL_USER` / `GMAIL_APP_PASSWORD`: activa verificación en 2 pasos en tu cuenta
  de Gmail y genera una [contraseña de aplicación](https://myaccount.google.com/apppasswords).

### 3. Levanta el servidor del webhook

```bash
npm run server
```

### 4. Expón el servidor a internet (solo para pruebas) y regístralo en Wompi

Wompi necesita una URL **pública HTTPS** para enviar los eventos. En desarrollo,
usa un túnel temporal, por ejemplo con [ngrok](https://ngrok.com/):

```bash
ngrok http 3000
```

Copia la URL que te da (`https://xxxx.ngrok-free.app`) y regístrala en el
Dashboard de Wompi (Sandbox) como:

```
https://xxxx.ngrok-free.app/webhooks/wompi
```

### 5. Prueba el flujo completo

1. Corre `npm run test:qr` (o paga el QR desde el widget) → la transacción queda `APPROVED`.
2. Wompi llama a tu webhook → el servidor genera el código, lo guarda y envía el email.
3. Visita `http://localhost:3000/recibo/<id_de_transaccion>` para ver el código en pantalla.
4. Copia el secreto a la Raspberry Pi (ver `pi/README.md`) y valida el código ahí,
   **sin conexión a internet**, con:

   ```bash
   cd pi && python3 validar_codigo.py
   ```

### Por qué HOTP y no un simple "sincronizar lista de códigos"

La Raspberry Pi nunca se conecta a ninguna red, así que no puede consultar nada
en tiempo real ni confiar en un reloj sincronizado (NTP). HOTP resuelve esto con
pura aritmética:

- Servidor y Pi comparten un secreto (una sola vez, offline) y cada uno lleva
  **su propio contador**.
- El código es `HMAC-SHA256(secreto, contador)` truncado a 6 dígitos.
- La Pi prueba una ventana de contadores (`last_counter+1` ... `+50`) para
  tolerar pagos que nunca se validaron ahí, sin perder la sincronía.
- Al validar un código, la Pi **persiste** el contador usado en `state.json` →
  ningún código igual o anterior puede reutilizarse, incluso tras un reinstalación en frío.

### Pendiente de decidir

- Hardware de entrada/salida real en la Pi (teclado matricial, pantalla, LEDs).
  Por ahora `validar_codigo.py` usa `input()`/`print()` en consola; la lógica
  de validación ya está separada de la interfaz, lista para conectarse después.
- Infraestructura definitiva para el montaje (servidor permanente + dominio
  propio en vez de túnel temporal, cómo se entrega físicamente el secreto a
  cada Raspberry Pi en campo, etc.) — **aún no decidido**, a definir en una
  siguiente fase.

## Flujo 3 — Checkout QR-exclusivo (`/pagar-qr`)

### Por qué existe esta página además de `/pagar`

El Widget alojado de Wompi (`checkout.wompi.co/widget.js`, usado en `/pagar`)
le muestra al cliente **todos los métodos de pago habilitados en la cuenta**
(Tarjeta, PSE, Nequi, DaviPlata, Bancolombia Transfer, etc.), no solo QR, y la
documentación oficial no ofrece ningún parámetro para restringirlo a un solo
método. Esto es un problema de negocio real para este caso de uso:

- El **Código QR** tiene una tarifa especial de **1%**, mientras que el resto
  de métodos cobran **2.65% + $700 COP + IVA** — para un micropago, esa
  diferencia puede ser mayor que el valor mismo de la transacción.
- Como el webhook del servidor **ignora silenciosamente** cualquier
  transacción que no sea `BANCOLOMBIA_QR` (por diseño, para no generar
  códigos de pagos que no debían existir), un cliente que pagara por error
  con otro método **pagaría dinero real y nunca recibiría su código**.

**Decisión tomada:** en vez de solo agregar una advertencia visual, se
construyó `/pagar-qr`, una página de checkout propia que llama directamente
al API de Wompi (`POST /api/qr/crear`) con `payment_method.type` **fijo** en
`"BANCOLOMBIA_QR"`. El cliente nunca ve ni puede elegir otro método de pago.
Esta es ahora la página recomendada para producción; `/pagar` (Widget) se
conserva solo como referencia/comparación.

### Compatibilidad confirmada del Código QR

Según la documentación oficial de Wompi, `BANCOLOMBIA_QR` solo puede pagarse
escaneando el código desde la **app Bancolombia** o la **app Nequi**.
**DaviPlata no es compatible** con este método — un intento de pago desde
DaviPlata simplemente no podría completarse por esta vía (el QR no es un
estándar interbancario abierto, es específico del ecosistema Bancolombia/Nequi).

## Problemas encontrados y cómo se resolvieron

| # | Problema | Causa | Solución |
|---|---|---|---|
| 1 | `422` al crear transacción: *"El monto mínimo de una transacción es $1.500"* | `WOMPI_AMOUNT_IN_CENTS` estaba en `2000` ($20 COP) | Subir el monto por encima del mínimo y agregar una validación `assertValidAmount()` en `test-qr.js` que falla rápido con un mensaje claro |
| 2 | Secreto equivocado en el `.env` | `WOMPI_INTEGRITY_SECRET` tenía pegado por error el valor del *events secret* (`test_events_...`) | Se corrigieron ambos campos; se documentó explícitamente que son dos secretos **distintos** aunque se obtienen en la misma pantalla del dashboard |
| 3 | `PayloadTooLargeError: request entity too large` en el webhook | El payload de un evento de `BANCOLOMBIA_QR` incluye la imagen del QR codificada en base64 (SVG), que supera el límite por defecto de Express (100kb) | `app.use(express.json({ limit: "5mb" }))` en `src/server.js` |
| 4 | El Widget se quedaba con el spinner girando indefinidamente | La URL de `redirect-url` apuntaba a `http://localhost:3000/...`. El WAF de CloudFront (que sirve `checkout.wompi.co`) bloquea con `403 Forbidden` cualquier parámetro de redirección que contenga `localhost` o `127.0.0.1` (regla anti-SSRF) | Diagnosticado con Playwright (capturando la petición de red real) y aislado por `curl` probando parámetro por parámetro. Solución: usar la URL pública del túnel (`PUBLIC_BASE_URL`) en vez de `localhost` al construir `redirect-url` |
| 5 | Riesgo de comisión alta / cliente sin código si elegía otro método de pago en el Widget | El Widget no tiene forma documentada de restringirse a un solo método | Ver "Flujo 3" arriba — se construyó `/pagar-qr` con integración directa al API, sin Widget |
| 6 | Un proceso en segundo plano (servidor o túnel) se moría apenas terminaba el comando que lo lanzó, aunque usara `disown` | Lanzar `node ... &` + `disown` dentro de un mismo bloque de comandos no sobrevive al cierre de esa sesión de shell | Lanzar servidor y túnel cada uno en su propia invocación de shell dedicada en segundo plano |
| 7 | El ejemplo de firma de webhooks en la documentación oficial de Wompi no cuadraba al recalcularlo | Aparente inconsistencia/desactualización del ejemplo ilustrativo en la documentación (no del algoritmo, cuyos pasos 1-4 son inequívocos) | Se implementó el algoritmo documentado (`SHA256` de propiedades concatenadas + timestamp + secreto) tal cual, y se verificó funcionando correctamente contra eventos reales de Wompi (sandbox y producción) |

## Pruebas realizadas

### Sandbox (dinero simulado)
- Flujo completo end-to-end repetido varias veces: creación de transacción QR → `sandbox_status` forzado a `APPROVED` → webhook recibido y firma verificada → código HOTP generado → email real enviado por Gmail → código validado offline con `pi/validar_codigo.py`, incluyendo verificación de que un código reutilizado es rechazado (`❌ NO APROBADO — ... ya utilizado`).
- Automatización con Playwright (Chromium headless) para depurar el bug del Widget (#4 en la tabla) y para validar de punta a punta la página `/pagar-qr` sin intervención manual.
- Verificación cruzada de la implementación de HOTP: el generador en Node.js (`src/hotp.js`) y el de Python (`pi/hotp.py`) producen **el mismo código** para los mismos contadores (0, 1, 5, 1000, 999999 probados explícitamente).

### Producción (dinero real) — ✅ realizada el 7 de octubre de 2026
Con autorización explícita del dueño de la cuenta (comercio verificado, pagando
él mismo), se hizo una prueba real completa por **$2.000 COP**:

1. Se generó un secreto HOTP **nuevo y exclusivo para producción**
   (`provisioning/pi-secret-prod.key`), distinto del usado en Sandbox, para no
   mezclar contadores de ambientes diferentes.
2. Se respaldó el `.env` de Sandbox en `.env.sandbox.backup` antes de cambiar
   `WOMPI_BASE_URL` a `https://production.wompi.co/v1` y pegar las llaves reales.
3. Se registró en el Dashboard de Wompi la URL de eventos de **Producción**
   (independiente de la de Sandbox — Wompi exige una URL de eventos por cada
   ambiente).
4. Se validaron las llaves de producción contra `GET /merchants/{public_key}`
   antes de intentar cobrar nada, confirmando el comercio y que `BANCOLOMBIA_QR`
   está habilitado.
5. Pago real realizado por el usuario desde su app bancaria escaneando el QR
   generado en `/pagar-qr`.
6. Resultado: transacción `1561959-1791432524-39984` aprobada → código **752635**
   generado y enviado por correo → **validado como `✅ APROBADO`** en el
   validador offline, usando el secreto de producción copiado a `pi/secret.key`
   (el de Sandbox quedó respaldado en `pi/secret-sandbox.backup.key`).
7. Se confirmó la protección contra reuso: reintentar el mismo código `752635`
   una segunda vez fue rechazado (`❌ NO APROBADO`).

**Conclusión:** el flujo completo (cobro QR-only de bajo costo → entrega de
código por pantalla y correo → validación 100% offline en un dispositivo sin
internet) quedó demostrado funcionando con dinero real, no solo simulado.

### Estado actual
Tras la prueba de producción, el servidor y el túnel se detuvieron
deliberadamente a pedido del usuario. El `.env` se dejó **intencionalmente en
modo producción** (no se revirtió a Sandbox) mientras se decide qué
infraestructura usar para el montaje definitivo.
