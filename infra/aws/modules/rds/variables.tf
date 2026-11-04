variable "identifier" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Private subnets (at least 2 AZs)."
  type        = list(string)
}

variable "allowed_security_group_ids" {
  type = list(string)
}

variable "engine_version" {
  description = "Major version only, so minor upgrades apply automatically."
  type        = string
  default     = "17"
}

variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "max_allocated_storage" {
  type    = number
  default = 100
}

variable "db_name" {
  type    = string
  default = "app"
}

variable "username" {
  type    = string
  default = "app"
}

variable "multi_az" {
  type    = bool
  default = false
}

variable "backup_retention_days" {
  type    = number
  default = 7
}
