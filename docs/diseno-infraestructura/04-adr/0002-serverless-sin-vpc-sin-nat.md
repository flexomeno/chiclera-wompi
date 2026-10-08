# ADR 02: Serverless fuera de VPC, sin NAT Gateway

- Estado: Aceptado
- Fecha: 2026-10

## Contexto

El prototipo es un proceso Node siempre encendido más un túnel. El objetivo de costo es residual a 500 ventas/día. Meter Lambdas en VPC “por seguridad” obliga a NAT Gateway (~USD 32/mes fijos) o VPC endpoints (varios dólares y más Terraform) para llegar a SES, SSM y a `production.wompi.co` (esta última es internet público: **no hay endpoint VPC de Wompi**).

## Decisión

Lambdas **sin VPC**. Salen a Wompi y SES por la red administrada de AWS. No hay subnets, security groups ni NAT. La superficie se controla con IAM, OAC, firma de webhook y el header de origen.

## Consecuencias

- **Bien:** costo de red ~0; operación mínima; Wompi es alcanzable.
- **Mal:** la Lambda tiene IP pública efímera de AWS (igual que miles de cuentas). No hay IP fija de salida. Aceptable: Wompi autentica con llave, no con allowlist de IP.
- **Mal:** si en el futuro se exige RDS privado, este ADR hay que revisarlo; RDS no está en el alcance.
