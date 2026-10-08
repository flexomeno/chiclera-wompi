variable "aws_region" {
  description = "Región del stack. Default acordado: us-east-1."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefijo de nombres de recursos."
  type        = string
  default     = "wompi-qr"
}

variable "environment" {
  description = "Ambiente (prod, staging, …). Un solo stack por apply."
  type        = string
  default     = "prod"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.environment))
    error_message = "environment debe ser lowercase alfanumérico o guion."
  }
}

variable "ses_sender_email" {
  description = "Identidad email extra (Gmail). Ya no se usa como From de los códigos."
  type        = string
}

variable "ses_from_address" {
  description = "From de los códigos. Debe ser una dirección del dominio SES verificado."
  type        = string
  default     = "pagos@techtest.app"
}

variable "ses_domain" {
  description = "Dominio propio para DKIM y para pedir production access de SES."
  type        = string
  default     = "techtest.app"
}

variable "budget_notification_email" {
  description = "Correo para budget, alarmas Lambda y rebotes SES."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Techo del budget (los 2 primeros budgets de la cuenta son gratis)."
  type        = number
  default     = 10
}

variable "amount_in_cents" {
  description = "Monto fijo del checkout en centavos COP."
  type        = number
  default     = 200000
}

variable "hotp_digits" {
  type    = number
  default = 6
}

variable "log_retention_days" {
  description = "Retención CloudWatch. 14 días mantiene costo de storage irrelevante."
  type        = number
  default     = 14
}

variable "api_throttle_rate" {
  description = "Requests sostenidos/segundo en API Gateway (todas las rutas)."
  type        = number
  default     = 50
}

variable "api_throttle_burst" {
  type    = number
  default = 100
}

variable "enable_cloudtrail" {
  description = "Trail de management events (ingesta gratis; S3 es centavos)."
  type        = bool
  default     = true
}

variable "enable_deletion_protection" {
  description = "Protección contra borrado de DynamoDB. Activar en prod real."
  type        = bool
  default     = true
}

variable "wompi_base_url" {
  type    = string
  default = "https://production.wompi.co/v1"
}

variable "wompi_sandbox_status" {
  description = "Solo aplica si wompi_base_url es sandbox. Vacío en producción."
  type        = string
  default     = ""
}

variable "wompi_public_key" {
  type      = string
  sensitive = true
}

variable "wompi_private_key" {
  type      = string
  sensitive = true
}

variable "wompi_integrity_secret" {
  type      = string
  sensitive = true
}

variable "wompi_events_secret" {
  type      = string
  sensitive = true
}

variable "hotp_secret" {
  description = "Secreto HOTP en hex (el mismo que usa la Raspberry Pi)."
  type        = string
  sensitive   = true
}

variable "cloudfront_price_class" {
  description = "PriceClass_200 incluye Sudamérica (Colombia) sin llegar a PriceClass_All."
  type        = string
  default     = "PriceClass_200"
}
