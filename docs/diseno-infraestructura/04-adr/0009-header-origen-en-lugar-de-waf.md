# ADR 09: Header compartido CloudFront→API en lugar de WAF

- Estado: Aceptado
- Fecha: 2026-10

## Contexto

WAF (Web ACL) suma ~USD 5/mes + reglas + USD 0,60/millón, más que el runtime entero. El browser debe pegarle a CloudFront, no al `execute-api`. Wompi sí debe pegarle al `execute-api` (no manda headers custom nuestros).

## Decisión

CloudFront añade `X-Origin-Verify` (random 32 chars) al origen HTTP API. Las Lambdas de checkout/status rechazan 403 si falta. El webhook **no** exige ese header; exige la firma Wompi. No se provisiona WAF.

Throttle de API Gateway (50 rps) y reserved concurrency en Lambda limitan abuso y factura.

## Consecuencias

- **Bien:** cierra el atajo “llamar execute-api desde el browser” sin costo fijo.
- **Mal:** quien robe el header (está en la config de CloudFront y en el state de Terraform) puede invocar `/api/*`. No es un secreto de pago; el daño es crear QRs y costo. Rotación = `terraform apply` (random_password).
- **Mal:** no hay geo-block ni rate-limit L7 avanzado. A 500 ventas/día el throttle basta.
