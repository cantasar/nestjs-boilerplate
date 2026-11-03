---
paths:
  - "infra/**"
  - ".github/workflows/**"
  - "Dockerfile"
---

# Terraform and deploy rules

- Deploy is done by humans with Terraform (`infra/`) and the manual GitHub "Deploy" workflow. You never deploy.
- Never run `terraform apply`, `destroy`, `import`, `state` or `taint`. You may run `terraform fmt` and `terraform validate`. Run `terraform init` or `plan` only when the user asks (they use the user's cloud login).
- `infra/modules/` stays generic: no project names, IDs or domains there. Project values go in `infra/envs/<env>/terraform.tfvars` (gitignored, never read it).
- Never put secrets in `.tf` files. Secrets live in Secret Manager.
- Cloud Run image rollouts come from the GitHub workflow. Terraform ignores image changes on purpose.
- After an infra change, the final report must say: "Deploy needed: run terraform plan and apply in infra/envs/<env>. I did not deploy."
