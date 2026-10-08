locals {
  name       = "${var.project_name}-${var.environment}"
  ssm_prefix = "/${var.project_name}/${var.environment}"
  is_sandbox = can(regex("sandbox", var.wompi_base_url))
  lambda_src = "${path.module}/../.build/lambda"
  lambda_zip = "${path.module}/../.build/lambda.zip"
  frontend   = "${path.module}/../frontend"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    System      = "wompi-qr-checkout"
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_cloudfront_response_headers_policy" "security" {
  name = "Managed-SecurityHeadersPolicy"
}
