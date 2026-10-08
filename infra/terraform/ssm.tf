resource "aws_ssm_parameter" "wompi_base_url" {
  name  = "${local.ssm_prefix}/wompi_base_url"
  type  = "String"
  value = var.wompi_base_url
}

resource "aws_ssm_parameter" "wompi_sandbox_status" {
  name  = "${local.ssm_prefix}/wompi_sandbox_status"
  type  = "String"
  value = var.wompi_sandbox_status == "" ? "-" : var.wompi_sandbox_status
}

resource "aws_ssm_parameter" "wompi_public_key" {
  name  = "${local.ssm_prefix}/wompi_public_key"
  type  = "SecureString"
  value = var.wompi_public_key
}

resource "aws_ssm_parameter" "wompi_private_key" {
  name  = "${local.ssm_prefix}/wompi_private_key"
  type  = "SecureString"
  value = var.wompi_private_key
}

resource "aws_ssm_parameter" "wompi_integrity_secret" {
  name  = "${local.ssm_prefix}/wompi_integrity_secret"
  type  = "SecureString"
  value = var.wompi_integrity_secret
}

resource "aws_ssm_parameter" "wompi_events_secret" {
  name  = "${local.ssm_prefix}/wompi_events_secret"
  type  = "SecureString"
  value = var.wompi_events_secret
}

resource "aws_ssm_parameter" "hotp_secret" {
  name  = "${local.ssm_prefix}/hotp_secret"
  type  = "SecureString"
  value = var.hotp_secret
}

resource "aws_ssm_parameter" "hotp_digits" {
  name  = "${local.ssm_prefix}/hotp_digits"
  type  = "String"
  value = tostring(var.hotp_digits)
}

resource "aws_ssm_parameter" "ses_sender_email" {
  name  = "${local.ssm_prefix}/ses_sender_email"
  type  = "String"
  value = var.ses_from_address
}

resource "aws_ssm_parameter" "amount_in_cents" {
  name  = "${local.ssm_prefix}/amount_in_cents"
  type  = "String"
  value = tostring(var.amount_in_cents)
}

resource "aws_ssm_parameter" "ses_configuration_set" {
  name  = "${local.ssm_prefix}/ses_configuration_set"
  type  = "String"
  value = aws_sesv2_configuration_set.this.configuration_set_name
}
