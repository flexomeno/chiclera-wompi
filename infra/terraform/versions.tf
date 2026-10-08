terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.6"
    }
  }

  backend "s3" {
    bucket  = "wompi-qr-tfstate-660340274929"
    key     = "prod/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
    # Sin dynamodb_table: un solo operador escribe el state.
  }
}
