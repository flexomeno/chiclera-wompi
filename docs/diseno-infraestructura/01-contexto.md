# 1. Contexto e información general

## 1.1 Título

**Checkout QR serverless (Wompi + HOTP + SES)** — diseño de la infraestructura de TI en AWS para cobrar con Código QR Bancolombia/Nequi, registrar cada venta y su correo, emitir un código de un solo uso y validarlo sin internet en un dispositivo local (Raspberry Pi).

## 1.2 Autores y revisores

| Rol | Nombre | Responsabilidad |
|---|---|---|
| Autor / proponente | Wilmar Rengifo | Diseño, Terraform, prototipo funcional |
| Revisor técnico | Por confirmar | Aprobar ADRs y baseline de seguridad |
| Revisor de negocio | Por confirmar | Alcance, comisión Wompi, canal de entrega del código |

## 1.3 Estado del documento

| Estado | Significado |
|---|---|
| **Borrador** | Diseño previo al primer apply. |
| **Desplegado en AWS (prod)** (actual) | Stack Terraform aplicado en `us-east-1`. Checkout, webhook, SES (dominio `techtest.app`, From `pagos@techtest.app`) y correo en inbox verificados con pago real. |
| En revisión | Esperando comentarios de revisores. |
| Aprobado | Se puede hacer `terraform apply` de prod con este diseño. |
| Superado | Reemplazado por una versión posterior o por un ADR que cambie el núcleo. |

## 1.4 Problema de negocio

Se venden unidades de bajo ticket en Colombia. El cliente paga desde el celular (Nequi / Bancolombia). Tras el pago aprobado debe recibir un **código HOTP de un solo uso** y presentarlo en un dispositivo **sin internet** (Raspberry Pi). El comercio necesita:

- Cobrar con la tarifa especial de Wompi **Código QR (1%)**, no con el plan de tarjetas.
- Registrar **cada venta y el correo** del comprador.
- Operar con **costo de infra residual** (tope ~500 ventas/día).
- No depender de un servidor siempre encendido ni de un túnel (cloudflared) como en el prototipo.

## 1.5 Situación actual (prototipo)

El prototipo Express + Cloudflare Tunnel + Gmail SMTP sirvió para validar QR + HOTP + correo **con dinero real**. WhatsApp/Twilio se exploró y se descartó. **La infra objetivo ya está en AWS**: CloudFront + HTTP API + Lambda + DynamoDB + SES. El servidor local y el túnel están apagados.

## 1.6 Relación con el código

| Pieza | Dónde vive |
|---|---|
| Diseño (este documento) | `docs/diseno-infraestructura/` |
| Infra como código | `infra/terraform/` |
| Handlers serverless | `infra/lambdas/` |
| UI de checkout | `infra/frontend/` |
| Lógica HOTP / Wompi (compartida) | `src/` y copia empaquetada a Lambda |
| Validador offline | `pi/hotp.py` |

## 1.7 Glosario breve

| Término | Significado |
|---|---|
| BANCOLOMBIA_QR | Método del API Wompi para “Código QR” (Bancolombia y Nequi). |
| HOTP | Código por contador (RFC 4226, HMAC-SHA256), no TOTP. |
| OAC | Origin Access Control: solo CloudFront lee el bucket S3. |
| PITR | Point-in-time recovery de DynamoDB. |
| WABA | WhatsApp Business Account (fuera de alcance de esta versión). |
