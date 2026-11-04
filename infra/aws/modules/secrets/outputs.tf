output "arns" {
  description = "Map of secret name (without prefix) to ARN."
  value       = { for name, s in aws_secretsmanager_secret.this : name => s.arn }
}
