#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Moltworld x402 Gateway - Contabo VPS Automated Provisioning Script
# ==============================================================================
# Target OS: Ubuntu 22.04+ / Debian 12+ on Contabo VPS
# Architecture: Cloudflare (DNS + SSL + CDN) -> Contabo VPS (Nginx + Node.js 20 + systemd)
# ==============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}  Moltworld x402 Gateway - Contabo VPS Setup          ${NC}"
echo -e "${BLUE}======================================================${NC}\n"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run this script as root (or via sudo).${NC}"
  exit 1
fi

APP_DIR="/opt/moltworld-x402"
REPO_URL="https://github.com/hackcat29/moltworld-x402.git"

echo -e "${GREEN}[1/8] Updating system packages...${NC}"
apt update && apt upgrade -y
apt install -y curl git ufw nginx jq certbot python3-certbot-nginx

echo -e "\n${GREEN}[2/8] Installing Node.js 20 LTS & pnpm...${NC}"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

corepack enable
corepack prepare pnpm@latest --activate
echo "Node version: $(node -v)"
echo "pnpm version: $(pnpm -v)"

echo -e "\n${GREEN}[3/8] Configuring UFW Firewall...${NC}"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

echo -e "\n${GREEN}[4/8] Setting up Application Directory: ${APP_DIR}...${NC}"
if [ ! -d "$APP_DIR" ]; then
  echo "Cloning repository..."
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "Directory exists. Updating codebase..."
  cd "$APP_DIR"
  git pull origin main || true
fi

cd "$APP_DIR"

echo -e "\n${GREEN}[5/8] Installing dependencies and building TypeScript...${NC}"
pnpm install --frozen-lockfile
pnpm build

if [ ! -f "$APP_DIR/.env" ]; then
  echo -e "${YELLOW}[WARNING] .env not found. Copying .env.example...${NC}"
  cp .env.example .env
  echo -e "${YELLOW}>>> Please edit ${APP_DIR}/.env with your real OPENROUTER_API_KEY and AVM_ADDRESS! <<<${NC}"
fi

echo -e "\n${GREEN}[6/8] Configuring Systemd Service...${NC}"
cp deploy/moltworld.service /etc/systemd/system/moltworld.service
systemctl daemon-reload
systemctl enable moltworld

echo -e "\n${GREEN}[7/8] Preparing SSL Certificate Directories...${NC}"
mkdir -p /etc/ssl/certs /etc/ssl/private

# If no certificate exists yet, generate temporary placeholder cert so Nginx can start
if [ ! -f /etc/ssl/certs/moltworld.pem ]; then
  echo -e "${YELLOW}Generating temporary self-signed SSL certificate for initial Nginx bootstrap...${NC}"
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/moltworld.key \
    -out /etc/ssl/certs/moltworld.pem \
    -subj "/CN=moltworld.xyz"
  echo -e "${YELLOW}Notice: For production, paste your Cloudflare Origin CA certificate into /etc/ssl/certs/moltworld.pem and key into /etc/ssl/private/moltworld.key.${NC}"
fi

echo -e "\n${GREEN}[8/8] Configuring Nginx Reverse Proxy...${NC}"
cp deploy/nginx-moltworld.conf /etc/nginx/sites-available/moltworld
ln -sf /etc/nginx/sites-available/moltworld /etc/nginx/sites-enabled/moltworld
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl restart nginx

# Restart application service
systemctl restart moltworld

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}  Moltworld x402 Provisioning Complete!               ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "Systemd Service:  systemctl status moltworld"
echo -e "Application Logs: journalctl -u moltworld -f"
echo -e "Nginx Status:     systemctl status nginx"
echo -e "\nNext Steps:"
echo -e "1. Edit ${APP_DIR}/.env with your production keys (OPENROUTER_API_KEY, AVM_ADDRESS)."
echo -e "2. Restart Moltworld: systemctl restart moltworld"
echo -e "3. In Cloudflare Dashboard:"
echo -e "   - Point A record for moltworld.xyz to this VPS IP (Proxied / Orange Cloud)."
echo -e "   - SSL/TLS encryption mode: Set to 'Full (Strict)'."
echo -e "   - Generate Cloudflare Origin CA Certificate and paste into:"
echo -e "     * Certificate: /etc/ssl/certs/moltworld.pem"
echo -e "     * Private Key: /etc/ssl/private/moltworld.key"
echo -e "   - Then reload Nginx: systemctl reload nginx"
echo -e "4. Verify health: curl -s https://moltworld.xyz/health | jq .\n"
