---
paths:
  - "infra/**"
  - ".github/workflows/**"
  - "Dockerfile"
---

# Terraform and deploy rules

- Deploy is done by humans with Terraform (`infra/gcp/` or `infra/aws/`) and the manual GitHub "Deploy" workflow. You never deploy.
- The Deploy workflow stays off until a human sets the repository variable `DEPLOY_TARGET` (`gcp` or `aws`). Never set it, and never add an automatic trigger (push, tag, schedule) to it.
- Never run `terraform apply`, `destroy`, `import`, `state` or `taint`. You may run `terraform fmt` and `terraform validate`. Run `terraform init` or `plan` only when the user asks (they use the user's cloud login).
- `infra/<cloud>/modules/` stays generic: no project names, IDs or domains there. Project values go in `infra/<cloud>/envs/<env>/terraform.tfvars` (gitignored, never read it).
- Never put secrets in `.tf` files or Terraform state. Secrets live in GCP Secret Manager or AWS Secrets Manager.
- Image rollouts (Cloud Run, ECS) come from the GitHub workflow. Terraform ignores image / task definition changes on purpose.
- After an infra change, the final report must say: "Deploy needed: run terraform plan and apply in infra/<cloud>/envs/<env>. I did not deploy."
