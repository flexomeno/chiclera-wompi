# 5. Consideraciones cruzadas

## 5.1 Seguridad y cumplimiento

### Datos que se tratan

| Dato | Dónde | Conservación |
|---|---|---|
| Correo del comprador | DynamoDB, SES (tránsito) | Indefinida (requisito: registrar venta y correo) |
| Monto, referencia, transactionId | DynamoDB | Indefinida |
| Código HOTP | DynamoDB + correo | Indefinida en tabla; de un solo uso en caja |
| Secreto HOTP y llaves Wompi | SSM SecureString | Hasta rotación |
| Teléfono | **No se recoge** | — |

No hay tarjeta ni CVV en este diseño: el cobro ocurre en Wompi / banco. PCI de este stack es residual (no se toca PAN).

### Controles

- TLS en el borde (CloudFront) y HTTPS-only al API.
- S3: Block Public Access, BucketOwnerEnforced, AES256, OAC.
- IAM **por función** (create no envía correo; status no lee secretos).
- Webhook: firma SHA256 según docs Wompi; 200 incluso si se ignora, para no reintentar basura (mismo criterio del prototipo).
- Access logs del API: requestId, IP, ruta, status — **sin body** (el email viaja en el POST).
- Retención de logs 14 días; Trail 90 días.
- Budget USD 10 y alarma de `Errors` por Lambda.
- Terraform state y `*.tfvars` fuera de git.

### Accesos humanos

- Consola AWS: usuarios IAM/Identity Center con MFA (fuera de Terraform; procedimiento de cuenta).
- No hay bastion ni SSH: no hay EC2.
- La caja ESP32 tiene el secreto en `secrets.h` (gitignored); la Pi de referencia usa `pi/secret.key`.

### Lo que no se cumple aún (deuda consciente)

- Un solo registro DMARC en `techtest.app` (hoy hay dos TXT).
- Recurso de “olvido de correo” (Habeas Data): borrado puntual en DynamoDB si se exige.
- WAF / GuardDuty: ADR 09 y non-goals.
- Dominio propio en CloudFront (hoy `*.cloudfront.net`).

## 5.2 Costos

Estimación de lista **us-east-1**, techo **500 ventas pagadas/día** (~15.000/mes), ~20.000 checkouts iniciados, poll cada 2,5 s solo de estado (ítem pequeño), 1 correo SES por venta, sin WhatsApp, sin NAT.

| Recurso | USD / mes (aprox.) |
|---|---|
| SES | 1,50 |
| API Gateway HTTP | 0,85 |
| Lambda | 0,00 (always-free) |
| DynamoDB | 0,35 |
| CloudWatch | 0,50 |
| CloudFront + S3 | 0,20 |
| SSM, SNS, Budget, Trail | ~0,10 |
| **Total runtime** | **~3,50 (rango 3–6)** |
| São Paulo, si se migrara | 5–8 |

Días con pocas ventas: ~USD 0–1. **Budget de alarma: USD 10.**

Trampa explícita **no incluida:** NAT Gateway (~USD 32). Comisión Wompi 1 % es costo de negocio, no de AWS, y domina cualquier factura de infra.

## 5.3 Escalabilidad

| Eje | Comportamiento |
|---|---|
| Tráfico de checkout | HTTP API + Lambda + DynamoDB on-demand escalan sin previsión. Throttle 50 rps es ~4 millones de requests/día, muy por encima de 500 ventas. |
| Poll de estado | El cuello de costo, no el de CPU. Si el techo sube a miles/día, subir intervalo o pasar a WebSocket; no hace falta hoy. |
| Contador HOTP | Un ítem caliente: 500 writes/día son triviales. No es el patrón de “hot partition” de millones de TPS. |
| Correo | SES en production access; el límite es reputación, no sandbox. |
| Frontend | CloudFront. |

El techo de abuso es el throttle del API Gateway (50 rps). No hay reserved concurrency (ADR 12).

## 5.4 Resiliencia y recuperación (DRP)

### Qué ya es multi-AZ (dentro de us-east-1)

Lambda, DynamoDB, API Gateway, SES, S3, CloudFront. Un fallo de una AZ no debería tumbar el checkout.

### Qué no está cubierto

- Caída **regional** de us-east-1: no hay réplica en São Paulo. RTO ≈ “esperar a AWS” o `apply` manual en otra región (no ensayado). RPO de datos: PITR de DynamoDB (hasta 35 días, granularidad por segundo) **en la misma región**.
- Wompi caído: no hay cobro; la caja ESP32 sigue validando códigos previos.
- SES en bounce masivo: el código **ya está en DynamoDB y en pantalla**; el correo es canal extra.

### Procedimientos

| Incidente | Acción |
|---|---|
| Borrado accidental de ventas | Restaurar tabla con PITR. |
| Frontend roto | Versionado S3; re-subir objeto o rollback de Terraform. |
| Secreto HOTP filtrado | Rotar en SSM **y** reflash de `secrets.h` en cada caja el mismo día; invalidar códigos no canjeados es decisión de negocio. |
| Webhook no llega | El poll solo mira DynamoDB: no hay código hasta que Wompi entregue el evento. Reproceso: reenviar evento desde el dashboard Wompi (idempotente por `code`). |
| Cuenta AWS comprometida | CloudTrail management; rotar llaves; budget ya alerta gasto anómalo. |
| Pérdida del state Terraform | Está en S3 versionado (`wompi-qr-tfstate-<account>/prod/`). Restaurar versión anterior del objeto. |

### Continuidad en caja

El ESP32 es el DR del **canje**: no depende de AWS al validar. Backup del hex HOTP y del bitmap de usados (NVS) es responsabilidad operativa **fuera** de este stack. No borrar la flash a menos que se acepte reusar códigos.

## 5.5 Operación diaria

1. SNS de ops: **confirmado**.
2. SES production access: **GRANTED**. From: `pagos@techtest.app`.
3. Webhook Wompi (`transaction.updated`) debe apuntar al `webhook_url` de API Gateway (no al túnel de Cloudflare).
4. Checkout: URL de CloudFront del output de Terraform.
5. Alarmas a correo de ops; no hay NOC 24/7.

## 5.6 Riesgos abiertos

| Riesgo | Mitigación actual | Residual |
|---|---|---|
| Webhook Wompi aún en URL vieja (túnel) | Actualizar dashboard a execute-api | Alto si no se cambió |
| us-east-1 down | La caja valida códigos ya emitidos | Checkout nuevo caído |
| Probar HOTP de lab en la caja de prod | Marca ese contador usado; el pago real no abre | Medio |
| Header de origen en el tfstate remoto | Bucket del state privado + versionado | Medio |
| Desfase HOTP caja vs DynamoDB | Primer counter = 0; webhook idempotente; no probar códigos futuros en la caja | Medio si hay doble incremento |
| Dos registros DMARC | Dejar uno solo | Bajo (entrega actual OK) |

## 5.7 Evolución prevista (no comprometida)

- Hostname propio en CloudFront + ACM.
- WhatsApp vía End User Messaging Social (no SNS SMS).
- Staging como segundo workspace/`tfvars`.
- Tabla DynamoDB de locks si deja de ser un solo escritor.
