# Contabo VPS + Cloudflare Deployment Guide

This guide walks you through deploying **Moltworld x402 Gateway** to your Contabo VPS, with Cloudflare acting strictly as DNS, edge CDN, and reverse proxy for `moltworld.xyz`.

---

## Architecture Overview

```
Client / Agent
      │ (HTTPS Request)
      ▼
Cloudflare Edge Proxy (DNS + WAF + SSL)
      │ (Proxied HTTPS via Origin CA Certificate)
      ▼
Contabo VPS (Port 80/443 - UFW Protected)
      │
   Nginx (Restores real client IP via CF-Connecting-IP, disables buffering)
      │ (HTTP / 127.0.0.1:3000)
      ▼
Moltworld Gateway (Node.js 20 systemd daemon)
      │
      ├── GoPlausible Facilitator (Algorand x402 settlement)
      └── OpenRouter API (High-margin AI inference execution)
```

---

## Prerequisites

1. **Contabo VPS** running Ubuntu 22.04 LTS or Debian 12 (root or sudo access).
2. Domain `moltworld.xyz` active on **Cloudflare**.
3. **OpenRouter API Key** with credits.
4. **Algorand PayTo Address** (Account receiving USDC micropayments).

---

## Step 1: Cloudflare DNS Configuration

In your Cloudflare dashboard for `moltworld.xyz`:

1. Navigate to **DNS** -> **Records**.
2. Add the following records pointing to your Contabo VPS IPv4 address:
   - **Type:** `A` | **Name:** `@` | **IPv4 address:** `<YOUR_CONTABO_VPS_IP>` | **Proxy status:** Proxied (Orange Cloud)
   - **Type:** `A` | **Name:** `www` | **IPv4 address:** `<YOUR_CONTABO_VPS_IP>` | **Proxy status:** Proxied (Orange Cloud)
3. Navigate to **SSL/TLS**:
   - Set encryption mode to **Full (Strict)**.

---

## Step 2: Generate Cloudflare Origin CA Certificate

1. In Cloudflare, go to **SSL/TLS** -> **Origin Server**.
2. Click **Create Certificate**.
3. Hostnames: `moltworld.xyz`, `*.moltworld.xyz`.
4. Validity: 15 years.
5. Copy the generated **Origin Certificate** and **Private Key**.

---

## Step 3: Run the Automated Setup on Contabo VPS

SSH into your Contabo VPS as `root`:

```bash
ssh root@<YOUR_CONTABO_VPS_IP>
```

Run the automated setup script directly:

```bash
# Clone the repo to /opt/moltworld-x402
git clone https://github.com/hackcat29/moltworld-x402.git /opt/moltworld-x402
cd /opt/moltworld-x402

# Run the automated setup script
bash deploy/contabo-setup.sh
```

The script will:
- Install updates, Node.js 20 LTS, pnpm, git, UFW firewall, and Nginx.
- Configure firewall rules (allow 22, 80, 443).
- Build the TypeScript application.
- Install and enable the `moltworld` systemd service.
- Configure Nginx with Cloudflare Real-IP restoration and anti-caching headers for `/v1/*`.

---

## Step 4: Install Cloudflare Origin Certificate

Paste your Cloudflare Origin Certificate and Private Key from Step 2:

```bash
# Paste the Origin Certificate:
nano /etc/ssl/certs/moltworld.pem

# Paste the Private Key:
nano /etc/ssl/private/moltworld.key
chmod 600 /etc/ssl/private/moltworld.key

# Reload Nginx
nginx -t && systemctl reload nginx
```

---

## Step 5: Configure Production Environment Variables

Edit `/opt/moltworld-x402/.env`:

```bash
nano /opt/moltworld-x402/.env
```

Ensure the following variables are set:

```ini
# Production Network: mainnet or testnet
ALGORAND_NETWORK=mainnet

# Your Algorand wallet address to receive USDC
AVM_ADDRESS=YOUR_ALGORAND_MAINNET_ADDRESS

# GoPlausible x402 Facilitator
FACILITATOR_URL=https://facilitator.goplausible.xyz

# Public Domain
PUBLIC_DOMAIN=https://moltworld.xyz
PORT=3000

# Upstream OpenRouter API Key
OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY

# Strict production mode (NO mock fallbacks)
MOCK_PROVIDERS=false
```

Restart Moltworld to apply changes:

```bash
systemctl restart moltworld
```

---

## Step 6: Verify Deployment & Health Check

Test locally on the VPS:

```bash
curl -i http://127.0.0.1:3000/health
```

Test publicly through Cloudflare:

```bash
curl -s https://moltworld.xyz/health | jq .
```

Expected output:
```json
{
  "status": "healthy",
  "ready": true,
  "version": "1.0.0",
  "product": "Moltworld",
  "public_domain": "https://moltworld.xyz",
  "network": "mainnet",
  "bazaar_enabled": true,
  "tag": "x402-global-challenge",
  "enabled_models": 10
}
```

Verify x402 payment challenge:

```bash
curl -i -X POST https://moltworld.xyz/v1/models/claude-sonnet/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"ping"}]}'
```

Returns:
- **HTTP Status:** `402 Payment Required`
- **Header:** `Payment-Required` (Base64 encoded x402 scheme with exact price $0.06 USDC, payTo, and Bazaar discovery extension).

---

## Useful Operational Commands

```bash
# View live application logs
journalctl -u moltworld -f

# Check service status
systemctl status moltworld

# Restart application
systemctl restart moltworld

# Check Nginx access logs with restored client IPs
tail -f /var/log/nginx/access.log

# Deploy code updates
cd /opt/moltworld-x402
git pull origin main
pnpm install --frozen-lockfile
pnpm build
systemctl restart moltworld
```
