#!/usr/bin/env bash
# EC2 bootstrap — run once as ubuntu user after first SSH login.
# Usage: bash deploy.sh <your-github-repo-url>
set -euo pipefail

REPO_URL="${1:-}"
APP_DIR="/opt/tax-agent"

if [[ -z "$REPO_URL" ]]; then
  echo "Usage: bash deploy.sh <github-repo-url>"
  exit 1
fi

echo "==> Installing system packages..."
sudo apt-get update -y -q
sudo apt-get install -y -q git make ca-certificates curl gnupg

echo "==> Installing Docker CE..."
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
   https://download.docker.com/linux/ubuntu \
   $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y -q
sudo apt-get install -y -q docker-ce docker-ce-cli containerd.io \
     docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"

echo "==> Cloning repo..."
sudo git clone "$REPO_URL" "$APP_DIR" 2>/dev/null \
  || (cd "$APP_DIR" && sudo git pull)

cd "$APP_DIR"

echo "==> Creating .env..."
if [[ ! -f .env ]]; then
  sudo cp .env.example .env
  echo ""
  echo "  IMPORTANT: edit /opt/tax-agent/.env before the next step."
  echo "  At minimum set LLM_URL and LLM_MODEL if you use an external LLM."
  echo "  When done, run:  cd /opt/tax-agent && sudo make build && sudo make up"
  echo ""
else
  echo "  .env already exists — skipping."
  echo ""
  echo "==> Building and starting..."
  sudo make build
  sudo make up
  PUBLIC_IP=$(curl -s --max-time 3 http://169.254.169.254/latest/meta-data/public-ipv4 || echo "<your-ec2-ip>")
  echo ""
  echo "  App running at https://$PUBLIC_IP"
  echo "  (self-signed cert — browser will warn; click 'Advanced > Proceed')"
  echo ""
fi
