#!/usr/bin/env bash
# =============================================================================
#  01-server-setup.sh — Run ONCE on a fresh Ubuntu 22.04 / 24.04 Lightsail
#  instance to install Docker, configure the firewall, and create the
#  directory structure expected by docker-compose.prod.yml.
#
#  Usage:
#    ssh ubuntu@<LIGHTSAIL-IP> 'bash -s' < scripts/01-server-setup.sh
# =============================================================================
set -euo pipefail

DOMAIN="dashboard.example.com"
APP_DIR="/opt/dashboard"

echo "==> Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# ── Docker ────────────────────────────────────────────────────────────────────
echo "==> Installing Docker..."
sudo apt-get install -y -qq ca-certificates curl gnupg lsb-release

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -qq
sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo systemctl enable --now docker

# Allow running docker without sudo for the current user
sudo usermod -aG docker "$USER"

echo "==> Docker version: $(sudo docker --version)"
echo "==> Docker Compose version: $(sudo docker compose version)"

# ── Firewall (ufw) ────────────────────────────────────────────────────────────
echo "==> Configuring firewall..."
sudo apt-get install -y -qq ufw
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh       # 22
sudo ufw allow http      # 80
sudo ufw allow https     # 443
sudo ufw --force enable
sudo ufw status verbose

# ── Application directory structure ──────────────────────────────────────────
echo "==> Creating directory structure at ${APP_DIR}..."
sudo mkdir -p \
  "${APP_DIR}/certbot/conf" \
  "${APP_DIR}/certbot/www" \
  "${APP_DIR}/data"

sudo chown -R "$USER:$USER" "${APP_DIR}"

echo ""
echo "==> NEXT STEPS:"
echo "   1. Copy your project to the server:"
echo "      rsync -az --exclude node_modules --exclude .git \\"
echo "        ./ ubuntu@<IP>:${APP_DIR}/app/"
echo ""
echo "   2. Copy your .env file:"
echo "      scp .env ubuntu@<IP>:${APP_DIR}/app/.env"
echo ""
echo "   3. Upload the Excel file:"
echo "      scp 'PAGAMENTI AMAZON.xlsx' ubuntu@<IP>:${APP_DIR}/data/pagamenti-amazon.xlsx"
echo ""
echo "   4. Point ${DOMAIN} DNS A-record → $(curl -s ifconfig.me)"
echo ""
echo "   5. Run scripts/02-init-ssl.sh to get the TLS certificate."
echo ""
echo "==> IMPORTANT: Log out and back in so docker group takes effect."
