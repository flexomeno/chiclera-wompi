# 2. Objetivos y alcance

## 2.1 Metas (Goals)

1. **Sustituir el servidor Express + túnel** por una API y un checkout 100 % serverless en AWS, facturados por uso.
2. **Cobrar solo con Código QR** (`BANCOLOMBIA_QR`), de modo que nunca se active la comisión alta de otros métodos (2.65 % + $700 + IVA).
3. **Registrar cada venta y el correo** del comprador de forma durable (no archivos JSON locales).
4. **Entregar el código HOTP por Amazon SES** cuando Wompi confirme `APPROVED`.
5. **Mantener la validación offline** en la Raspberry Pi con el mismo secreto y la misma función HOTP que el backend.
6. **Baseline de seguridad** (cifrado en tránsito, IAM mínimo, secretos fuera del código, logs sin cuerpo de PII, trail de management) **sin costos fijos** de NAT, WAF, Secrets Manager o KMS customer-managed.
7. **Soportar un techo de 500 ventas pagadas al día** (~15.000 al mes) con costo AWS del orden de **USD 3–8 / mes**.
8. **Infraestructura reproducible** con Terraform; un `apply` debe levantar el entorno.

## 2.2 No metas (Non-Goals)

Queda **fuera de esta versión**. Incluirlos requiere un ADR nuevo y ampliación de alcance.

| Fuera de alcance | Por qué se excluye |
|---|---|
| WhatsApp / SMS / Twilio | Costo, plantillas Meta y fricción de sandbox. Fase 2. |
| NAT Gateway y Lambdas en VPC | ~USD 32/mes fijos; no hace falta para SES, DynamoDB ni Wompi (HTTPS público). |
| Widget Wompi con todos los métodos | El cliente podría pagar con un medio que el webhook ignora. |
| BANCOLOMBIA_TRANSFER y NEQUI push | Se implementaron en el prototipo y se revirtieron: se queda solo QR. |
| Kubernetes, ECS, EC2 always-on | El volumen no justifica plano de control. |
| Multi-región activo-activo | Complejidad y costo; el techo es 500 ventas/día en un solo país. |
| Dominio propio + certificado ACM | Arranque con HTTPS de CloudFront (`*.cloudfront.net`). |
| WAF, GuardDuty, AWS Config, CMK | Costo fijo desproporcionado vs. ~USD 4 de runtime. |
| Recolectar teléfono | Wompi QR no lo envía; sin WhatsApp no se pide (menos PII). |
| Migrar la Pi a la nube | Debe seguir **sin internet** en el punto de validación. |
| Panel de administración / BI | Los GSI de DynamoDB permiten consultas; no hay producto de reporting aún. |
| Alta disponibilidad 99.99 % multi-región | No es un objetivo de este diseño. |

## 2.3 Alcance funcional cubierto

```
Cliente ingresa correo
  → se crea transacción QR en Wompi
  → ve/descarga el QR (PNG pixel-perfecto)
  → paga en Nequi/Bancolombia
  → webhook Wompi firma-verificado
  → se guarda venta + correo + código
  → SES envía el código
  → el cliente lo presenta en la Pi (offline)
```

## 2.4 Criterios de éxito

- `terraform apply` en `us-east-1` deja un `cloudfront_url` y un `webhook_url` operativos. **Cumplido.**
- Un pago QR en prod deja ítem en DynamoDB con email + código y un correo SES en inbox (no spam). **Cumplido.**
- La Pi valida ese código con el mismo secreto HOTP (fuera de este apply; mismo algoritmo).
- La factura AWS de un mes al techo de 500/día permanece **por debajo del budget de USD 10**.
