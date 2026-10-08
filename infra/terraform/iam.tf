data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_create" {
  name               = "${local.name}-lambda-create"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role" "lambda_get" {
  name               = "${local.name}-lambda-get"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role" "lambda_webhook" {
  name               = "${local.name}-lambda-webhook"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "ssm_read" {
  statement {
    sid = "ReadConfig"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
    ]
    resources = [
      "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}",
      "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}/*",
    ]
  }

  statement {
    sid       = "DecryptSsm"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${data.aws_region.current.name}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "create_logs" {
  name = "logs"
  role = aws_iam_role.lambda_create.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.lambda_create.arn}:*"
    }]
  })
}

resource "aws_iam_role_policy" "create_ssm" {
  name   = "ssm"
  role   = aws_iam_role.lambda_create.id
  policy = data.aws_iam_policy_document.ssm_read.json
}

resource "aws_iam_role_policy" "create_ddb" {
  name = "dynamodb"
  role = aws_iam_role.lambda_create.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:GetItem"]
      Resource = [aws_dynamodb_table.sales.arn]
    }]
  })
}

resource "aws_iam_role_policy" "get_logs" {
  name = "logs"
  role = aws_iam_role.lambda_get.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.lambda_get.arn}:*"
    }]
  })
}

resource "aws_iam_role_policy" "get_ddb" {
  name = "dynamodb"
  role = aws_iam_role.lambda_get.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["dynamodb:GetItem", "dynamodb:Query"]
      Resource = [
        aws_dynamodb_table.sales.arn,
        "${aws_dynamodb_table.sales.arn}/index/*",
      ]
    }]
  })
}

resource "aws_iam_role_policy" "webhook_logs" {
  name = "logs"
  role = aws_iam_role.lambda_webhook.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.lambda_webhook.arn}:*"
    }]
  })
}

resource "aws_iam_role_policy" "webhook_ssm" {
  name   = "ssm"
  role   = aws_iam_role.lambda_webhook.id
  policy = data.aws_iam_policy_document.ssm_read.json
}

resource "aws_iam_role_policy" "webhook_ddb" {
  name = "dynamodb"
  role = aws_iam_role.lambda_webhook.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
      ]
      Resource = [
        aws_dynamodb_table.sales.arn,
        "${aws_dynamodb_table.sales.arn}/index/*",
      ]
    }]
  })
}

resource "aws_iam_role_policy" "webhook_ses" {
  name = "ses"
  role = aws_iam_role.lambda_webhook.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["ses:SendEmail"]
      Resource = [
        aws_sesv2_email_identity.sender.arn,
        aws_sesv2_email_identity.domain.arn,
        "arn:aws:ses:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:configuration-set/${aws_sesv2_configuration_set.this.configuration_set_name}",
      ]
    }]
  })
}

