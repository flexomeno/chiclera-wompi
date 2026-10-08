resource "random_password" "origin_verify" {
  length  = 32
  special = false
}

resource "terraform_data" "package_lambda" {
  triggers_replace = {
    package = filemd5("${path.module}/../lambdas/package.json")
    create  = filemd5("${path.module}/../lambdas/handlers/create-checkout.mjs")
    get     = filemd5("${path.module}/../lambdas/handlers/get-checkout.mjs")
    webhook = filemd5("${path.module}/../lambdas/handlers/webhook.mjs")
    http    = filemd5("${path.module}/../lambdas/lib/http.mjs")
    config  = filemd5("${path.module}/../lambdas/lib/config.mjs")
    dynamo  = filemd5("${path.module}/../lambdas/lib/dynamo.mjs")
    ses     = filemd5("${path.module}/../lambdas/lib/ses-mailer.mjs")
    origin  = filemd5("${path.module}/../lambdas/lib/origin-verify.mjs")
    hotp    = filemd5("${path.module}/../../src/hotp.js")
    wompi   = filemd5("${path.module}/../../src/wompi.js")
    sign    = filemd5("${path.module}/../../src/webhook-signature.js")
    png     = filemd5("${path.module}/../../src/qr-svg-to-png.js")
  }

  provisioner "local-exec" {
    command     = "node infra/scripts/package-lambda.mjs"
    working_dir = "${path.module}/../.."
  }
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = local.lambda_src
  output_path = local.lambda_zip
  excludes    = ["package-lock.json"]

  depends_on = [terraform_data.package_lambda]
}

locals {
  lambda_env = {
    TABLE_NAME            = aws_dynamodb_table.sales.name
    SSM_PREFIX            = local.ssm_prefix
    ORIGIN_VERIFY_SECRET  = random_password.origin_verify.result
    SES_CONFIGURATION_SET = aws_sesv2_configuration_set.this.configuration_set_name
  }
}

resource "aws_lambda_function" "create" {
  function_name    = "${local.name}-create"
  role             = aws_iam_role.lambda_create.arn
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  handler          = "handlers/create-checkout.handler"
  runtime          = "nodejs20.x"
  architectures    = ["arm64"]
  memory_size      = 256
  timeout          = 20

  environment {
    variables = local.lambda_env
  }

  tracing_config {
    mode = "PassThrough"
  }

  depends_on = [aws_cloudwatch_log_group.lambda_create]
}

resource "aws_lambda_function" "get" {
  function_name    = "${local.name}-get"
  role             = aws_iam_role.lambda_get.arn
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  handler          = "handlers/get-checkout.handler"
  runtime          = "nodejs20.x"
  architectures    = ["arm64"]
  memory_size      = 128
  timeout          = 5

  environment {
    variables = {
      TABLE_NAME           = aws_dynamodb_table.sales.name
      ORIGIN_VERIFY_SECRET = random_password.origin_verify.result
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  depends_on = [aws_cloudwatch_log_group.lambda_get]
}

resource "aws_lambda_function" "webhook" {
  function_name    = "${local.name}-webhook"
  role             = aws_iam_role.lambda_webhook.arn
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  handler          = "handlers/webhook.handler"
  runtime          = "nodejs20.x"
  architectures    = ["arm64"]
  memory_size      = 256
  timeout          = 15

  environment {
    variables = {
      TABLE_NAME            = aws_dynamodb_table.sales.name
      SSM_PREFIX            = local.ssm_prefix
      SES_CONFIGURATION_SET = aws_sesv2_configuration_set.this.configuration_set_name
      SES_FROM_ADDRESS      = var.ses_from_address
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  depends_on = [aws_cloudwatch_log_group.lambda_webhook]
}

resource "aws_lambda_permission" "create" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*/api/qr/crear"
}

resource "aws_lambda_permission" "get" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

resource "aws_lambda_permission" "webhook" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.webhook.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*/webhooks/wompi"
}
