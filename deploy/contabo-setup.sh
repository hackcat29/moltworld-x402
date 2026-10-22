#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Moltworld x402 Gateway: VPS provisioning (Ubuntu 22.04+ / Debian 12+)
# Cloudflare (DNS + TLS) -> Nginx -> Node 22 gateway (systemd) -> PostgreSQL 16 + Redis 7 (Docker)
# Safe to re-run: existing secrets in .env are kept.
# ==============================================================================

APP_DIR="/opt/moltworld"
REPO_URL="https://github.com/hackcat29/moltworld-x402.git"
ENV_FILE="$APP_DIR/.env"

log() { echo -e "\033[0;32m==> $*\033[0m"; }
warn() { echo -e "\033[1;33m!!  $*\033[0m"; }

if [ "$EUID" -ne 0 ]; then
  echo "Run as root (or via sudo)." >&2
  exit 1
fi

log "Installing system packages"
apt-get update
apt-get install -y curl git ufw nginx jq openssl ca-certificates docker.io
apt-get install -y docker-compose-v2 || apt-get install -y docker-compose-plugin || true
systemctl enable --now docker

log "Installing Node.js 22 and pnpm"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable
corepack prepare pnpm@10 --activate

log "Firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

log "Fetching the application into $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin main && git -C "$APP_DIR" reset --hard origin/main
fi
cd "$APP_DIR"

log "Preparing $ENV_FILE"
[ -f "$ENV_FILE" ] || cp .env.example "$ENV_FILE"
chmod 600 "$ENV_FILE"
get_env() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }
set_env() {
  if grep -qE "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}
ensure_secret() {
  local name="$1" value="$2"
  if [ -z "$(get_env "$name")" ]; then set_env "$name" "$value"; echo "   generated $name"; fi
}

# Reuse the password of an existing database URL so an initialised volume keeps working.
existing_db_pw="$(get_env DATABASE_URL | sed -nE 's|^postgres(ql)?://[^:]+:([^@]+)@.*|\2|p')"
ensure_secret POSTGRES_PASSWORD "${existing_db_pw:-$(openssl rand -hex 24)}"
ensure_secret REDIS_PASSWORD "$(openssl rand -hex 24)"
ensure_secret RECEIPT_SIGNING_KEY "$(openssl rand -base64 32)"
ensure_secret ADMIN_TOKEN "$(openssl rand -hex 32)"
ensure_secret DATABASE_URL "postgres://moltworld:$(get_env POSTGRES_PASSWORD)@127.0.0.1:5432/moltworld"
ensure_secret REDIS_URL "redis://:$(get_env REDIS_PASSWORD)@127.0.0.1:6379"

log "Starting PostgreSQL and Redis"
docker compose --env-file "$ENV_FILE" -f deploy/docker-compose.yml up -d --wait

log "Building"
pnpm install --frozen-lockfile
pnpm build

log "Installing the systemd unit"
cp deploy/moltworld.service /etc/systemd/system/moltworld.service
systemctl daemon-reload
systemctl enable moltworld

log "Nginx"
mkdir -p /etc/ssl/certs /etc/ssl/private
if [ ! -f /etc/ssl/certs/moltworld.pem ]; then
  warn "No origin certificate found; creating a temporary self-signed one."
  warn "Replace it with a Cloudflare Origin CA certificate (SSL/TLS > Origin Server) for Full (Strict)."
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/moltworld.key -out /etc/ssl/certs/moltworld.pem -subj "/CN=moltworld.xyz"
fi
cp deploy/nginx-moltworld.conf /etc/nginx/sites-available/moltworld
ln -sf /etc/nginx/sites-available/moltworld /etc/nginx/sites-enabled/moltworld
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

missing=()
for key in AVM_ADDRESS OPENROUTER_API_KEY; do [ -n "$(get_env $key)" ] || missing+=("$key"); done
if [ "$(get_env ALGORAND_NETWORK)" = "mainnet" ] && [ ${#missing[@]} -gt 0 ]; then
  warn "Set ${missing[*]} in $ENV_FILE, then: systemctl restart moltworld"
else
  systemctl restart moltworld
  sleep 3
  curl -fsS http://127.0.0.1:3402/health | jq '{status, ready, network, ledger, enabled_models, receipts}' || journalctl -u moltworld -n 40 --no-pager
fi

cat <<EOF

Provisioned. Next:
  1. Edit $ENV_FILE: AVM_ADDRESS (revenue; can be cold/multisig), provider keys
     (OPENROUTER_API_KEY, FAL_KEY, OPENAI_API_KEY, ELEVENLABS_API_KEY) and
     PAYOUT_WALLET_MNEMONIC (hot wallet for refunds/rebates/creator payouts).
  2. systemctl restart moltworld && curl -s localhost:3402/health | jq
  3. Back up RECEIPT_SIGNING_KEY offline: losing it makes past receipts unverifiable
     (rotate with RECEIPT_PREVIOUS_PUBLIC_KEYS, see docs/OPERATIONS.md).
EOF
