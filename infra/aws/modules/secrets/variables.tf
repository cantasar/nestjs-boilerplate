variable "name_prefix" {
  description = "Prefix for every secret name, e.g. \"app/\"."
  type        = string
}

variable "secret_names" {
  type = list(string)
}

variable "recovery_window_in_days" {
  type    = number
  default = 7
}
