resource "aws_cloudwatch_log_group" "lambda_create" {
  name              = "/aws/lambda/${local.name}-create"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "lambda_get" {
  name              = "/aws/lambda/${local.name}-get"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "lambda_webhook" {
  name              = "/aws/lambda/${local.name}-webhook"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/${local.name}"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "apigw_logs" {
  statement {
    principals {
      type        = "Service"
      identifiers = ["apigateway.amazonaws.com"]
    }
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
    ]
    resources = [
      aws_cloudwatch_log_group.api_access.arn,
      "${aws_cloudwatch_log_group.api_access.arn}:*",
    ]
  }
}

resource "aws_cloudwatch_log_resource_policy" "apigw" {
  policy_name     = "${local.name}-apigw"
  policy_document = data.aws_iam_policy_document.apigw_logs.json
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = {
    create  = aws_lambda_function.create.function_name
    get     = aws_lambda_function.get.function_name
    webhook = aws_lambda_function.webhook.function_name
  }

  alarm_name          = "${local.name}-${each.key}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "Errores en ${each.value}"
  alarm_actions       = [aws_sns_topic.ops.arn]

  dimensions = {
    FunctionName = each.value
  }
}
