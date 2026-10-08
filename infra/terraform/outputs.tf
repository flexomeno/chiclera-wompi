output "cloudfront_url" {
  description = "Checkout público. Apunta el navegador aquí."
  value       = "https://${aws_cloudfront_distribution.this.domain_name}"
}

output "webhook_url" {
  description = "Pegar en Wompi → Eventos (transaction.updated). NO pasa por CloudFront."
  value       = "${aws_apigatewayv2_api.this.api_endpoint}/webhooks/wompi"
}

output "api_endpoint" {
  description = "HTTP API (las rutas /api/* del browser deben ir por CloudFront)."
  value       = aws_apigatewayv2_api.this.api_endpoint
}

output "dynamodb_table" {
  value = aws_dynamodb_table.sales.name
}

output "ses_sender" {
  value = var.ses_from_address
}

output "ses_domain" {
  value = var.ses_domain
}

output "ses_dns_records" {
  description = "Registros a crear en el DNS de techtest.app (registrador o Cloudflare)."
  value = concat(
    [
      for token in aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens : {
        type  = "CNAME"
        name  = "${token}._domainkey.${var.ses_domain}"
        value = "${token}.dkim.amazonses.com"
      }
    ],
    [
      {
        type  = "MX"
        name  = "mail.${var.ses_domain}"
        value = "10 feedback-smtp.${data.aws_region.current.name}.amazonses.com"
      },
      {
        type  = "TXT"
        name  = "mail.${var.ses_domain}"
        value = "v=spf1 include:amazonses.com ~all"
      },
      {
        type  = "TXT"
        name  = "_dmarc.${var.ses_domain}"
        value = "v=DMARC1; p=none; rua=mailto:${var.budget_notification_email};"
      },
    ]
  )
}

output "ses_sandbox_note" {
  value = "SES nace en sandbox: verifica el sender y pide production access antes de vender a terceros."
}

output "next_steps" {
  value = [
    "1. Confirmar el email de suscripción SNS que llega a ${var.budget_notification_email}",
    "2. Verificar la identidad SES ${var.ses_sender_email}",
    "3. Configurar ${aws_apigatewayv2_api.this.api_endpoint}/webhooks/wompi en el dashboard de Wompi",
    "4. Abrir https://${aws_cloudfront_distribution.this.domain_name}",
  ]
}
