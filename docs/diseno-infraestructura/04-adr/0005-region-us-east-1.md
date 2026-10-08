# ADR 05: Región `us-east-1` (N. Virginia)

- Estado: Aceptado
- Fecha: 2026-10

## Contexto

Los compradores están en Colombia. `sa-east-1` (São Paulo) baja latencia ~20–80 ms y suele costar **20–40 % más**. SES, cuotas y madurez de features son históricamente mejores en Virginia. CloudFront es global: la UI no “vive” solo en Virginia; el origen API sí.

Se preguntó al autor: se eligió **us-east-1**.

## Decisión

Todo el stack regional (API, Lambda, DynamoDB, SES, SSM, Trail de la cuenta en esa home) en **us-east-1**. CloudFront con `PriceClass_200` para incluir puntos de presencia en Sudamérica.

## Consecuencias

- **Bien:** precio de lista más bajo; un solo provider alias; ACM de CloudFront (si un día hay dominio) también va en us-east-1 de forma natural.
- **Mal:** un incidente grande en us-east-1 tumba el checkout. No hay failover a São Paulo. Aceptable para 500 ventas/día y un producto que aún no promete 99.99 %.
- La Pi no usa AWS; un outage de región no impide validar códigos **ya emitidos**.
