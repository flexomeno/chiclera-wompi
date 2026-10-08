.PHONY: init package validate plan apply destroy fmt

TF_DIR := terraform
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))/..)

init:
	cd $(TF_DIR) && terraform init

package:
	node scripts/package-lambda.mjs

fmt:
	cd $(TF_DIR) && terraform fmt -recursive

validate: package
	cd $(TF_DIR) && terraform validate

plan: package
	cd $(TF_DIR) && terraform plan -out=tfplan

apply: package
	cd $(TF_DIR) && terraform apply

destroy:
	cd $(TF_DIR) && terraform destroy
