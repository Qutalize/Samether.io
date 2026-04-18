variable "name_prefix" {
  type = string
}

variable "github_repo" {
  description = "GitHub repository in the format owner/repo."
  type        = string
}

variable "frontend_bucket_name" {
  type = string
}
