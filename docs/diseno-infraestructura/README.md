# Documento de Diseño de Infraestructura

**Checkout QR serverless — Wompi + HOTP offline + Amazon SES**

| Campo | Valor |
|---|---|
| Versión | 0.3 |
| Fecha | 2026-10-10 |
| Estado | **Desplegado en AWS (prod) + caja ESP32** |
| Autor | Wilmar Rengifo |
| Revisor | Por confirmar |
| Código de infra | [`infra/`](../../infra/README.md) (Terraform) |
| Región AWS | `us-east-1` |

Este directorio es el diseño formal. Terraform es la implementación. Si hay conflicto, gana este documento hasta que un ADR lo actualice y luego se refleja en código.

## Contenido

1. [Contexto e información general](01-contexto.md)
2. [Objetivos y alcance](02-objetivos-y-alcance.md)
3. [Arquitectura propuesta](03-arquitectura.md)
4. [Registros de decisión (ADR)](04-adr/README.md)
5. [Consideraciones cruzadas](05-consideraciones-cruzadas.md)

Este directorio **no** incluye secretos. Las llaves viven en `.env` / `terraform.tfvars` (gitignored) y en SSM.

## Cómo leerlo

- Para aprobar el enfoque: secciones 2 y 3.
- Para discutir una elección técnica: el ADR correspondiente.
- Para construir: `infra/terraform` + este documento como contrato.
