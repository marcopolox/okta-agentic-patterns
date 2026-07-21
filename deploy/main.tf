terraform {
  required_version = ">= 1.3"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

# ── Data sources ───────────────────────────────────────────────────────────────

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ── Security group ─────────────────────────────────────────────────────────────

resource "aws_security_group" "demo" {
  name        = "okta-agentic-demo"
  description = "HTTP + SSH for Okta agentic demo"

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "okta-agentic-demo"
  }
}

# ── EC2 instance ───────────────────────────────────────────────────────────────

resource "aws_instance" "demo" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_pair_name
  vpc_security_group_ids = [aws_security_group.demo.id]

  # IMDSv2 enforced
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/user-data.sh.tpl", {
    git_repo_url    = var.git_token != "" ? replace(var.git_repo_url, "https://", "https://${var.git_token}@") : var.git_repo_url
    git_branch      = var.git_branch
    docker_profiles = var.docker_profiles
    console_port    = var.console_port
  })

  tags = {
    Name = "okta-agentic-demo"
  }
}

# ── Elastic IP ─────────────────────────────────────────────────────────────────

resource "aws_eip" "demo" {
  instance = aws_instance.demo.id
  domain   = "vpc"

  tags = {
    Name = "okta-agentic-demo"
  }
}

# ── Wait for cloud-init ────────────────────────────────────────────────────────
# Blocks terraform apply until user-data finishes (Docker + nginx installed, repo cloned).

resource "null_resource" "wait_for_cloud_init" {
  depends_on = [aws_eip.demo]

  connection {
    type        = "ssh"
    host        = aws_eip.demo.public_ip
    user        = "ubuntu"
    private_key = file("~/.ssh/${var.key_pair_name}.pem")
    timeout     = "10m"
  }

  provisioner "remote-exec" {
    inline = ["cloud-init status --wait"]
  }
}
