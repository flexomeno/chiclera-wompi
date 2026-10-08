# ADR 04: DynamoDB on-demand para ventas y correo

- Estado: Aceptado
- Fecha: 2026-10

## Contexto

El prototipo persiste JSON en disco (un proceso, sin concurrencia real). En AWS hace falta un almacén que: registre venta + email, sea idempotente ante reintentos de Wompi, incremente el contador HOTP de forma atómica y no cobre un servidor 24/7. RDS/Aurora Serverless tiene mínimo de costo y parches. S3 como “base de datos” no da incrementos atómicos baratos.

## Decisión

Una tabla DynamoDB **PAY_PER_REQUEST**, clave `SALE#{transactionId}`, GSI por email y por día, PITR activo, cifrado con clave AWS (gratis), sin TTL en ventas. El contador HOTP es un ítem `COUNTER/HOTP` con `SET value = if_not_exists + 1` (primer código = 0).

## Consecuencias

- **Bien:** encaja con 15.000 escrituras/mes; centavos; IAM por tabla; PITR cubre borrados accidentales.
- **Mal:** el modelo no es SQL; reportes complejos no son el alcance. Un GSI más es barato, un rediseño de acceso patterns no lo es.
- **Bien:** el poll de estado lee un ítem pequeño (el PNG no se guarda), lo que mantiene el costo de lecturas bajo.
