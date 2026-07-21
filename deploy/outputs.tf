output "public_ip" {
  description = "Elastic IP address of the demo instance"
  value       = aws_eip.demo.public_ip
}

output "console_url" {
  description = "URL for the demo console"
  value       = "http://${aws_eip.demo.public_ip}"
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i ~/.ssh/${var.key_pair_name}.pem ubuntu@${aws_eip.demo.public_ip}"
}

output "scp_env_command" {
  description = "SCP command to copy your .env file to the instance (run from repo root)"
  value       = "scp -i ~/.ssh/${var.key_pair_name}.pem ../.env ubuntu@${aws_eip.demo.public_ip}:/opt/okta-demo/.env"
}

output "next_steps" {
  description = "Steps to complete after provisioning"
  value       = <<-EOT

    ── Next steps ──────────────────────────────────────────────────────────────

    1. Update NEXTAUTH_URL in your .env:
       NEXTAUTH_URL=http://${aws_eip.demo.public_ip}

    2. Add redirect URIs to Okta (for each pattern you're running):
       http://${aws_eip.demo.public_ip}/api/auth/callback/p2
       http://${aws_eip.demo.public_ip}/api/auth/callback/p3
       http://${aws_eip.demo.public_ip}/api/auth/callback/p4
       http://${aws_eip.demo.public_ip}/api/auth/callback/p6

    3. SCP .env to the instance (from repo root):
       ${format("scp -i ~/.ssh/%s.pem ../.env ubuntu@%s:/opt/okta-demo/.env", var.key_pair_name, aws_eip.demo.public_ip)}

    4. SSH in and start the stack (wait ~2 min for user-data to finish first):
       ${format("ssh -i ~/.ssh/%s.pem ubuntu@%s", var.key_pair_name, aws_eip.demo.public_ip)}
       cd /opt/okta-demo
       docker compose --profile p3 --profile p4 --profile p6 up -d --build

    5. Open: http://${aws_eip.demo.public_ip}

    EOT
}
