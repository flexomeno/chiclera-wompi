# ADR 08: Terraform como único IaC

- Estado: Aceptado
- Fecha: 2026-10

## Contexto

Hace falta reproducir la cuenta sin clics en consola. CDK añade runtime Node/Python y sintetiza CloudFormation; la consola no es auditable. El autor pidió Architecture as Code con Terraform.

## Decisión

Un stack Terraform (`infra/terraform`), archivos por dominio (api, datos, email, edge, iam), providers pinneados, `make plan/apply`. Estado en S3 (`wompi-qr-tfstate-<account>`), cifrado y con versionado. **Sin tabla DynamoDB de locks**: hay un solo operador. El bucket del state se crea con `infra/scripts/bootstrap-state.sh` (no vive en el mismo stack, para no circular).

## Consecuencias

- **Bien:** review por diff; lockfile de providers en git; el state no depende de un disco local.
- **Mal:** hay que conocer Terraform. El apply exige `terraform.tfvars` (gitignored) con secretos. Sin lock, dos `apply` simultáneos podrían corromper el state; no aplica mientras sea un solo escritor.
