output "address" {
  value = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "master_user_secret_arn" {
  description = "RDS-managed secret with the master username and password."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}
