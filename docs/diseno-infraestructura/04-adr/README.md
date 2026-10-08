# 4. Registros de decisión de arquitectura (ADR)

Cada ADR captura una elección que no queremos reabrir en cada reunión. Si se revierte, se marca **Superado** y se escribe uno nuevo.

| ID | Decisión | Estado |
|---|---|---|
| [ADR 01](0001-solo-codigo-qr.md) | Solo `BANCOLOMBIA_QR` | Aceptado |
| [ADR 02](0002-serverless-sin-vpc-sin-nat.md) | Serverless fuera de VPC, sin NAT | Aceptado |
| [ADR 03](0003-ses-en-lugar-de-smtp-gmail.md) | SES API, no SMTP Gmail, en AWS | Aceptado |
| [ADR 04](0004-dynamodb-on-demand.md) | DynamoDB on-demand, no RDS ni JSON | Aceptado |
| [ADR 05](0005-region-us-east-1.md) | Región us-east-1 | Aceptado |
| [ADR 06](0006-sin-whatsapp-en-esta-version.md) | Sin WhatsApp / Twilio / SMS | Aceptado |
| [ADR 07](0007-hotp-offline-en-raspberry-pi.md) | HOTP SHA256 validado en la Pi | Aceptado |
| [ADR 08](0008-terraform-como-iac.md) | Terraform, no CDK/Consola | Aceptado |
| [ADR 09](0009-header-origen-en-lugar-de-waf.md) | `X-Origin-Verify` en lugar de WAF | Aceptado |
| [ADR 10](0010-ssm-no-secrets-manager.md) | SSM Standard, no Secrets Manager | Aceptado |
| [ADR 11](0011-from-ses-en-dominio-propio.md) | From `pagos@techtest.app`, dominio SES verificado | Aceptado |
| [ADR 12](0012-sin-reserved-concurrency-lambda.md) | Sin reserved concurrency (cuota 10) | Aceptado |

Formato interno de cada ADR: **Título → Contexto → Decisión → Consecuencias**.
