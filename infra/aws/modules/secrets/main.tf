######################################################################
# Secrets Manager shells only. Values are added by a human, never here.
######################################################################

resource "aws_secretsmanager_secret" "this" {
  for_each = toset(var.secret_names)

  name                    = "${var.name_prefix}${each.value}"
  recovery_window_in_days = var.recovery_window_in_days
}
