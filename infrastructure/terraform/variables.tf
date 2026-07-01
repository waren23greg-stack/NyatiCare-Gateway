variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "af-south-1"
}

variable "environment" {
  description = "Deployment environment name (staging, production)"
  type        = string
  default     = "staging"
}
