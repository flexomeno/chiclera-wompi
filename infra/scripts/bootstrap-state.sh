#!/usr/bin/env bash
# Crea el bucket S3 del Terraform state. No crea tabla DynamoDB (un solo escritor).
set -euo pipefail

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGION="${AWS_REGION:-us-east-1}"
BUCKET="wompi-qr-tfstate-${ACCOUNT_ID}"

echo "Cuenta ${ACCOUNT_ID} · región ${REGION} · bucket ${BUCKET}"

if aws s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
  echo "El bucket ya existe."
else
  if [[ "${REGION}" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}"
  else
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}" \
      --create-bucket-configuration LocationConstraint="${REGION}"
  fi
  echo "Bucket creado."
fi

aws s3api put-public-access-block --bucket "${BUCKET}" --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

aws s3api put-bucket-versioning --bucket "${BUCKET}" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption --bucket "${BUCKET}" --server-side-encryption-configuration '{
  "Rules": [{
    "ApplyServerSideEncryptionByDefault": { "SSEAlgorithm": "AES256" },
    "BucketKeyEnabled": true
  }]
}'

aws s3api put-bucket-tagging --bucket "${BUCKET}" --tagging 'TagSet=[
  {Key=Project,Value=wompi-qr},
  {Key=Purpose,Value=terraform-state}
]'

POLICY="$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::${BUCKET}",
        "arn:aws:s3:::${BUCKET}/*"
      ],
      "Condition": {
        "Bool": { "aws:SecureTransport": "false" }
      }
    }
  ]
}
EOF
)"
aws s3api put-bucket-policy --bucket "${BUCKET}" --policy "${POLICY}"

echo "State remoto listo: s3://${BUCKET}/prod/terraform.tfstate"
