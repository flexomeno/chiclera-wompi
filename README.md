# Checkout QR — Wompi + HOTP + SES

Pago con **Código QR** (`BANCOLOMBIA_QR`, tarifa 1%), código HOTP de un solo uso y
correo al comprador. La Raspberry Pi valida el código **sin internet**.

**Producción está en AWS** (`us-east-1`): CloudFront + HTTP API + Lambda +
DynamoDB + Amazon SES. Sin VPC, sin NAT, sin WhatsApp.

| | |
|---|---|
| Checkout | `https://d1jb3inqui1moe.cloudfront.net` |
| Webhook Wompi | `https://w33aycsrjc.execute-api.us-east-1.amazonaws.com/webhooks/wompi` |
| From SES | `Pagos <pagos@techtest.app>` |
| Diseño | [`docs/diseno-infraestructura/`](docs/diseno-infraestructura/README.md) (v0.2, desplegado) |
| Terraform | [`infra/`](infra/README.md) |

El servidor Express local (`npm run server` + túnel) fue el prototipo con el que
se validó el flujo. **Ya no es el runtime.**

## Flujo

1. El cliente abre el checkout, pone su correo y recibe un QR PNG.
2. Paga escaneando desde **Bancolombia** o **Nequi** (DaviPlata no aplica).
3. Wompi llama `POST /webhooks/wompi` (firma SHA256). Si el pago es `APPROVED` y
   el método es QR, se genera un HOTP de 6 dígitos, se guarda en DynamoDB y se
   envía por SES.
4. La pantalla de recibo hace poll a `/api/qr/estado/{id}` (solo DynamoDB).
5. En caja, el **ESP32** (`dispositivo/`) acepta o rechaza el código offline
   (teclado + LCD I2C + servo). `pi/validar_codigo.py` queda como referencia.

El Widget de Wompi (`/pagar`) **no** se usa en prod: no se puede restringir a QR
y un pago con otro método cobraria la tarifa alta **sin** generar código.

## Qué no subir a git

`.gitignore` ya cubre esto. No uses `git add -f` sobre estos archivos.

| Nunca | Por qué |
|---|---|
| `.env`, `.env.*` (salvo `.env.example`) | Llaves Wompi, HOTP, SMTP |
| `infra/terraform/terraform.tfvars` | Las mismas llaves para el apply |
| `*.tfstate`, `.terraform/` | State con parámetros SSM |
| `infra/.build/` | Zip de Lambda |
| `data/`, `provisioning/`, `pi/secret.key`, `pi/state.json`, `dispositivo/validador/secrets.h` | Códigos y secreto HOTP |
| `tfplan` | Puede serializar secretos |

Sí van al repo: `*.tf`, `*.tfvars.example`, `.env.example`, `.terraform.lock.hcl`,
`docs/`, `src/`, `infra/lambdas/` (sin `node_modules`).

## Estructura

```
.
├── docs/diseno-infraestructura/   # Contrato de arquitectura y ADRs
├── infra/                         # Stack AWS (Terraform + Lambdas + frontend)
│   ├── terraform/
│   ├── lambdas/
│   └── frontend/
├── src/                           # Prototipo local (Express + Gmail SMTP)
├── dispositivo/                   # Validador físico ESP32 (teclado, LCD I2C, servo)
├── pi/                            # Mismo HOTP en Python (referencia / Pi)
├── scripts/                       # Secreto HOTP y depuración Playwright
└── .env.example                   # Plantilla; copiar a .env, no commitear
```

`src/hotp.js`, `pi/hotp.py` y `dispositivo/validador/hotp.cpp` **deben** generar
el mismo código para el mismo secreto y contador (HMAC-SHA256, 6 dígitos,
primer counter = 0).

## Producción (AWS)

Requisitos: Terraform ≥ 1.5, AWS CLI, Node 20. Detalle en [`infra/README.md`](infra/README.md).

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # secretos; archivo gitignored
make -C .. init && make -C .. plan && make -C .. apply
```

State remoto: `s3://wompi-qr-tfstate-660340274929/prod/terraform.tfstate`
(versionado, **sin** tabla DynamoDB de locks: un solo escritor).

Ya hecho en esta cuenta:

- SES production access **concedido**; dominio `techtest.app` con DKIM.
- SNS de alarmas confirmado.
- Checkout y correo (inbox, no spam) verificados con pago real.

El webhook de **producción** en el dashboard de Wompi debe ser la URL de API
Gateway de arriba, no un túnel de Cloudflare/ngrok.

Decisiones relevantes: serverless sin VPC ([ADR 02](docs/diseno-infraestructura/04-adr/0002-serverless-sin-vpc-sin-nat.md)),
SES en vez de Gmail ([ADR 03](docs/diseno-infraestructura/04-adr/0003-ses-en-lugar-de-smtp-gmail.md)),
From en dominio propio ([ADR 11](docs/diseno-infraestructura/04-adr/0011-from-ses-en-dominio-propio.md)),
sin reserved concurrency ([ADR 12](docs/diseno-infraestructura/04-adr/0012-sin-reserved-concurrency-lambda.md)),
sin WhatsApp en esta versión ([ADR 06](docs/diseno-infraestructura/04-adr/0006-sin-whatsapp-en-esta-version.md)).

## Raspberry Pi (offline)

Ver [`pi/README.md`](pi/README.md). El secreto se copia una vez por USB; la Pi
nunca consulta AWS ni Wompi. Tras validar, persiste el contador en `state.json`
(gitignored) para que el código no se reutilice.

```bash
cd pi && python3 validar_codigo.py
```

## Prototipo local (no es prod)

Sirve para scripts de sandbox y para entender el algoritmo. Correo por Gmail SMTP,
persistencia en `data/*.json`.

```bash
cp .env.example .env          # llaves pub_test_ / prv_test_
npm run test:qr               # crea un QR sandbox y hace polling
npm run generate-secret       # HOTP_SECRET + provisioning/pi-secret.key
npm run server                # Express en :3000 — no usar frente a clientes
```

Wompi sandbox **no** deja escanear el QR de verdad: el resultado lo fuerza
`WOMPI_SANDBOX_STATUS`. En prod el resultado lo define el pago real.

`WOMPI_INTEGRITY_SECRET` y `WOMPI_EVENTS_SECRET` son **distintos**. El monto
mínimo de Wompi es **$1.500 COP**.

## Pruebas ya hechas

- **Sandbox:** QR → webhook firmado → HOTP → correo → validación en la Pi, con
  rechazo de reuso. Node y Python coinciden en contadores 0, 1, 5, 1000, 999999.
- **Prod (2026-10-07), prototipo local:** $2.000 COP, transacción
  `1561959-1791432524-39984`, código `752635` aprobado y no reutilizable.
- **Prod (2026-10-08), stack AWS:** mismo flujo con SES `pagos@techtest.app`
  llegando a inbox.

## Wompi

- Método: `BANCOLOMBIA_QR` (personas naturales; app Bancolombia o Nequi).
- Evento de webhook: `transaction.updated`.
- Tarifa publicada: **1%** por transacción exitosa vs 2.65% + $700 + IVA de
  otros medios del Plan Avanzado.
- Docs: [referencia](https://docs.wompi.co/docs/colombia/referencia/),
  [métodos de pago](https://docs.wompi.co/docs/colombia/metodos-de-pago/),
  [tarifas](https://wompi.com/es/co/planes-tarifas/).
