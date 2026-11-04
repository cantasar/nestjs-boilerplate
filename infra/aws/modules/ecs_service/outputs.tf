output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "service_name" {
  value = aws_ecs_service.this.name
}

output "container_name" {
  value = var.container_name
}

output "task_security_group_id" {
  value = aws_security_group.tasks.id
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.this.name
}
