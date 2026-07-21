#!/usr/bin/env bash
set -euo pipefail

# ── System packages ────────────────────────────────────────────────────────────
apt-get update -y
apt-get install -y \
  ca-certificates curl gnupg lsb-release git nginx

# ── Docker ─────────────────────────────────────────────────────────────────────
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add ubuntu user to docker group
usermod -aG docker ubuntu

# Enable log rotation for all containers
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'DAEMON'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
DAEMON
systemctl restart docker

# ── Clone repo ─────────────────────────────────────────────────────────────────
mkdir -p /opt/okta-demo
git clone --branch ${git_branch} ${git_repo_url} /opt/okta-demo
chown -R ubuntu:ubuntu /opt/okta-demo

# ── nginx (HTTP-only reverse proxy) ───────────────────────────────────────────
# Proxy port 80 → console on ${console_port}
cat > /etc/nginx/sites-available/okta-demo <<NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 10m;

    # SSE — disable buffering so events stream through immediately
    location /api/events/ {
        proxy_pass         http://127.0.0.1:${console_port};
        proxy_http_version 1.1;
        proxy_set_header   Connection "";
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass         http://127.0.0.1:${console_port};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/okta-demo /etc/nginx/sites-enabled/okta-demo
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

# ── Done ───────────────────────────────────────────────────────────────────────
# .env must be SCP'd separately before starting Docker services.
# To start the stack after copying .env:
#   cd /opt/okta-demo
#   docker compose --profile ${docker_profiles} up -d --build
echo "user-data complete — SCP .env then start docker compose"
