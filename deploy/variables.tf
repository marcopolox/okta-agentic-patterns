variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to use (e.g. GTMUser-936970685091)"
  type        = string
  default     = ""
}

variable "instance_type" {
  description = "EC2 instance type (t3.medium is the minimum comfortable size for all profiles running)"
  type        = string
  default     = "t3.medium"
}

variable "key_pair_name" {
  description = "Name of an existing EC2 key pair for SSH access"
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed to SSH (e.g. your office IP /32)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "git_repo_url" {
  description = "Git repository URL to clone on the instance"
  type        = string
  default     = "https://github.com/your-org/okta-agentic-demo.git"
}

variable "git_branch" {
  description = "Git branch to check out"
  type        = string
  default     = "main"
}

variable "git_token" {
  description = "GitHub personal access token (repo scope) for cloning a private repo. Leave empty for public repos."
  type        = string
  default     = ""
  sensitive   = true
}

variable "docker_profiles" {
  description = "Comma-separated Docker Compose profiles to activate (e.g. 'p3,p4,p6')"
  type        = string
  default     = "p3,p4,p6"
}

variable "console_port" {
  description = "Port the Next.js console listens on inside Docker"
  type        = number
  default     = 3020
}
