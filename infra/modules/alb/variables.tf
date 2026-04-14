variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "alb_security_group" {
  type = string
}

variable "target_port" {
  type = number
}

variable "certificate_arn" {
  type = string
}

variable "api_domain_name" {
  type = string
}

variable "zone_id" {
  type = string
}
