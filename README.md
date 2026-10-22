# Moltworld: Multimodal x402 AI Gateway on Algorand

**One unified API for AI models and autonomous agents.**  
Pay per request in USDC on Algorand. Zero subscriptions, zero prepaid credits, 100% cryptographic receipts.

**Repository:** [hackcat29/moltworld-x402](https://github.com/hackcat29/moltworld-x402)

This repository was created because the original GitHub account, `UncleTom29`, was suspended. It preserves the original Moltworld commit history and is the current home for development and deployment.

- **Public Domain**: [https://moltworld.xyz](https://moltworld.xyz)
- **Deployment**: Contabo VPS (Ubuntu 22.04 LTS / Debian 12) + Cloudflare Reverse Proxy + Docker (PostgreSQL 16 & Redis 7)
- **Modalities**: Multimodal: Chat Completions (22 models), Image Generation (9 models), Voice Speech Synthesis (3 models), and Video Synthesis (6 models)
- **Active Models**: 40 production-verified models across OpenAI, Anthropic, Google, DeepSeek, Meta, Black Forest Labs, Recraft, ByteDance, Kuaishou, and Alibaba
- **Payment Scheme**: Algorand x402 exact micropayments via GoPlausible facilitator
- **Receipts**: Cryptographically signed Ed25519 receipts (`Moltworld-Receipt`) published and verifiable at `/.well-known/moltworld-receipts.json`
- **Challenge Tag**: `x402-global-challenge`

---

## 1. What Moltworld Is

Moltworld is an open, production-grade multimodal AI model gateway powered by HTTP 402 (`x402`) micropayments on the Algorand blockchain. Clients and autonomous agents select a model, submit a standard OpenAI-compatible JSON payload, settle an exact per-request USDC fee via the GoPlausible facilitator, and immediately receive the generated output backed by a verifiable cryptographic receipt.

Every paid endpoint is:
1. **Protected by x402**: Requests without payment return `402 Payment Required` with Base64 payment requirements.
2. **Transparent Cost-Plus Pricing**: Dynamic quotes calculated from upstream costs + 30% margin via `POST /v1/quote`.
3. **Cryptographically Verifiable**: Every invocation generates an Ed25519-signed canonical JSON receipt with SHA-256 digests of inputs and outputs.
4. **Honest Upstream Routing**: Zero mock stubs or free-tier fallback ladders. Requests are routed strictly to verified upstream providers (OpenRouter direct, fal.ai, OpenAI, ElevenLabs).
5. **Upfront Safety & Automated Refunds**: Heavy media jobs (image, video) settle upfront to guarantee capacity. If upstream generation fails, an automated on-chain USDC refund transaction is immediately sent back to the payer.
6. **Cataloged in GoPlausible Bazaar**: Discovered automatically by agents via Bazaar discovery extensions.
7. **Attributed to the Global x402 Challenge**: Tagged with `x402-global-challenge` on every route.
8. **Fail-Closed Architecture**: Unsupported providers or unconfigured upstream keys fail closed (`503 Service Unavailable` or `502 Bad Gateway`) before payment can ever be accepted or settled.

---

## 2. Architecture & Production Flow

```
                           Client / Autonomous Agent / MCP Server
                                             │
                                             ▼
                         Cloudflare Edge Proxy (DNS + WAF + SSL)
                                             │ (Full Strict HTTPS)
                                             ▼
                           Contabo VPS (Port 80/443 - UFW)
                                             │
                          Nginx Reverse Proxy (Real IP restore)
                                             │ (HTTP 127.0.0.1:3000)
                                             ▼
                               Moltworld Gateway Daemon
                            (Hono + Node.js 22 systemd unit)
                                             │
                   ┌─────────────────────────┴─────────────────────────┐
                   ▼                                                   ▼
              Free Routes                                         Paid Routes
            GET / (Landing & Playground)            POST /v1/models/:model/chat/completions
            GET /health (Fail-Closed)               POST /v1/models/:model/images/generations
            GET /v1/models (Catalog)                POST /v1/models/:model/audio/speech
            POST /v1/quote (Live Dynamic Quote)     POST /v1/models/:model/videos/generations
            GET /v1/stats (Organic vs Fleet)        GET /v1/jobs/:id (Async Video Polling)
            GET /v1/receipts/:id (Receipts)                            │
            GET /.well-known/moltworld-receipts.json                   ▼
                                                           x402 Resource Server
                                                    - ExactAvmScheme (Testnet/Mainnet)
                                                    - GoPlausible Facilitator
                                                    - Tag: "x402-global-challenge"
                                                                       │
                                                       [Payment Verified & Reserved]
                                                                       │
                                                                       ▼
                                                          State & Distributed Ledger
                                                    - Postgres 16 (Ledger, Idempotency)
                                                    - Redis 7 (Rate Limit, Reservations)
                                                                       │
                                                                       ▼
                                                            Upstream AI Execution
                                                    - OpenRouter Direct (Chat)
                                                    - fal.ai (FLUX, Recraft, Seedream)
                                                    - OpenAI / ElevenLabs (Audio Speech)
                                                    - fal.ai Queue / OpenAI (Video MP4)
                                                                       │
                                                                       ▼
                                                       Ed25519 Cryptographic Receipt
                                                    - Header: Moltworld-Receipt
                                                    - SHA-256 Input & Output Hashes
```

---

## 3. Active Model Catalog (40 Verified Frontier Models)

### Chat Models (22 Active Models)
All chat models pass exact upstream identifiers with `usage: { include: true }` and `allow_fallbacks: false`.

| Model ID | Public Display Name | Upstream Model ID | Price (USDC) | Context Window |
| :--- | :--- | :--- | :--- | :--- |
| `gpt-6-astra` | GPT-6 Astra | `openai/gpt-6-astra` | **$0.8000** | 4,096 |
| `gpt-6-sol` | GPT-6 Sol | `openai/gpt-6-sol` | **$0.7000** | 4,096 |
| `gpt-5.4-pro` | GPT-5.4 Pro | `openai/gpt-5.4-pro` | **$0.6000** | 4,096 |
| `gpt-5.2-pro` | GPT-5.2 Pro | `openai/gpt-5.2-pro` | **$0.5000** | 4,096 |
| `gpt-5-pro` | GPT-5 Pro | `openai/gpt-5-pro` | **$0.3500** | 4,096 |
| `o3-pro` | o3 Pro | `openai/o3-pro` | **$0.2500** | 4,096 |
| `claude-fable-5.1` | Claude Fable 5.1 | `anthropic/claude-fable-5.1` | **$0.1500** | 4,096 |
| `claude-opus-5.5` | Claude Opus 5.5 | `anthropic/claude-opus-5.5` | **$0.0600** | 4,096 |
| `claude-opus-5` | Claude Opus 5 | `anthropic/claude-opus-5` | **$0.0550** | 4,096 |
| `gpt-5.6-sol` | GPT-5.6 Sol | `openai/gpt-5.6-sol` | **$0.0400** | 4,096 |
| `claude-sonnet-5.5` | Claude Sonnet 5.5 | `anthropic/claude-sonnet-5.5` | **$0.0400** | 4,096 |
| `gemini-3.1-pro` | Gemini 3.1 Pro | `google/gemini-3.1-pro-preview` | **$0.0350** | 4,096 |
| `gpt-5.6-terra` | GPT-5.6 Terra | `openai/gpt-5.6-terra` | **$0.0350** | 4,096 |
| `claude-sonnet-5` | Claude Sonnet 5 | `anthropic/claude-sonnet-5` | **$0.0300** | 4,096 |
| `gpt-5.4` | GPT-5.4 | `openai/gpt-5.4` | **$0.0220** | 4,096 |
| `gpt-5.2` | GPT-5.2 | `openai/gpt-5.2` | **$0.0200** | 4,096 |
| `claude-sonnet` | Claude Sonnet 4.5 | `anthropic/claude-sonnet-4.5` | **$0.0060** | 4,096 |
| `gpt-4o` | GPT-4o | `openai/gpt-4o` | **$0.0050** | 4,096 |
| `gemini-pro` | Gemini 2.5 Pro | `google/gemini-2.5-pro` | **$0.0040** | 4,096 |
| `deepseek` | DeepSeek V3 | `deepseek/deepseek-chat` | **$0.0010** | 4,096 |
| `gemini-flash` | Gemini 2.5 Flash | `google/gemini-2.5-flash` | **$0.0010** | 4,096 |
| `gemini-lite` | Gemini 2.5 Flash Lite | `google/gemini-2.5-flash-lite` | **$0.0010** | 4,096 |

### Image Generation Models (9 Active Models)
Routed directly to **fal.ai** and OpenAI. Zero SVG stubs.

| Model ID | Public Display Name | Provider | Upstream Model ID | Price (USDC) |
| :--- | :--- | :--- | :--- | :--- |
| `flux-2-pro` | Flux 2 Pro | fal | `fal-ai/flux-pro/v1.1-ultra` | **$0.2000** |
| `flux-2-flex` | Flux 2 Flex | fal | `fal-ai/flux-pro` | **$0.1500** |
| `recraft-v3` | Recraft V3 | fal | `fal-ai/recraft-v3` | **$0.1200** |
| `dall-e-3` | DALL-E 3 | openai | `dall-e-3` | **$0.0800** |
| `flux-dev` | Flux Dev | fal | `fal-ai/flux/dev` | **$0.0500** |
| `seedream-4` | Seedream 4 | fal | `fal-ai/bytedance/seedream` | **$0.0450** |
| `qwen-image` | Qwen-Image 2.0 | fal | `fal-ai/qwen-image` | **$0.0350** |
| `flux-schnell` | Flux Schnell | fal | `fal-ai/flux/schnell` | **$0.0150** |
| `dall-e-2` | DALL-E 2 | openai | `dall-e-2` | **$0.0200** |

### Voice Speech Synthesis Models (3 Active Models)
Routed to OpenAI Audio and ElevenLabs. High-fidelity audio streams.

| Model ID | Public Display Name | Provider | Upstream Model ID | Price (USDC) |
| :--- | :--- | :--- | :--- | :--- |
| `eleven-turbo` | ElevenLabs Turbo v2.5 | elevenlabs | `eleven_turbo_v2_5` | **$0.0300** |
| `gpt-audio-mini` | GPT Audio Mini | openai | `tts-1` | **$0.0200** |
| `gpt-audio-hd` | GPT Audio HD | openai | `tts-1-hd` | **$0.0400** |

### Video Generation Models (6 Active Models)
Routed via **fal.ai queue** and OpenAI with async job polling.

| Model ID | Public Display Name | Provider | Upstream Model ID | Price (USDC) |
| :--- | :--- | :--- | :--- | :--- |
| `sora-2-pro` | Sora 2 Pro | openai | `sora-2-pro` | **$1.0000** |
| `kling-2.5` | Kling 2.5 Turbo | fal | `fal-ai/kling-video/v1.5/pro` | **$0.8000** |
| `wan-2.1` | Wan 2.1 | fal | `fal-ai/wan-video` | **$0.6500** |
| `hailuo-h3` | Hailuo H3 | fal | `fal-ai/minimax/video-01` | **$0.6000** |
| `veo-2` | Veo 2 | fal | `fal-ai/veo-2` | **$0.5500** |
| `sora-2-fast` | Sora 2 Fast | openai | `sora-2-fast` | **$0.5000** |

---

## 4. Verifiable Cryptographic Receipts (Ed25519)

Every completed inference generates a cryptographically signed receipt containing:
1. `id`: Unique receipt identifier.
2. `timestamp`: ISO-8601 creation time.
3. `txid`: Algorand transaction ID that settled the x402 payment.
4. `network`: Algorand CAIP-2 network string.
5. `payer`: Sender address.
6. `payTo`: Moltworld merchant receiver address.
7. `amountUsd`: Formatted USDC cost.
8. `amountMicroUsdc`: Integer micro-USDC (6 decimals).
9. `upstreamProvider` & `upstreamModel`: Genuine provider and model that served the inference.
10. `inputHash`: SHA-256 digest of normalized input payload.
11. `outputHash`: SHA-256 digest of generated output.
12. `signature`: Ed25519 signature over canonical JSON.

Receipts are delivered in the `Moltworld-Receipt` response header, stored in PostgreSQL, and accessible via `GET /v1/receipts/:id`. The gateway's active public key is published at `GET /.well-known/moltworld-receipts.json` for independent third-party verification.

---

## 5. Client SDKs & Integration

### TypeScript SDK (`@moltworld/x402`)

```typescript
import { MoltworldClient } from "@moltworld/x402";

const client = new MoltworldClient({
  mnemonic: process.env.ALGORAND_MNEMONIC,
  network: "mainnet",
});

// Chat with Claude Sonnet 4.5
const chat = await client.chat({
  model: "claude-sonnet",
  messages: [{ role: "user", content: "Explain Algorand consensus." }],
});
console.log(chat.text, "Receipt:", chat.receipt.id);

// Generate Image with Flux 2 Pro
const img = await client.image({
  model: "flux-2-pro",
  prompt: "Futuristic neon Algorand metropolis at dusk, photorealistic 8k",
});
console.log("Image URL:", img.url);

// Async Video Generation with Sora 2 Pro
const video = await client.video({
  model: "sora-2-pro",
  prompt: "Cinematic drone sweep across misty Nordic pine mountains at golden hour",
  duration: 5,
  waitForCompletion: true,
});
console.log("Video URL:", video.url);
```

### Python SDK (`moltworld-x402`)

```python
import os
from moltworld_x402 import MoltworldClient

client = MoltworldClient(
    mnemonic=os.environ["ALGORAND_MNEMONIC"],
    network="mainnet"
)

response = client.chat(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Explain Algorand x402 micropayments."}]
)
print(response["content"])
print("Receipt ID:", response["receipt"]["id"])
```

### Anthropic Model Context Protocol (MCP) Server

Add Moltworld tools (`moltworld_chat`, `moltworld_generate_image`, `moltworld_synthesize_speech`, `moltworld_generate_video`) to any Claude or Cursor instance:

```json
{
  "mcpServers": {
    "moltworld": {
      "command": "npx",
      "args": ["-y", "@moltworld/mcp"],
      "env": {
        "ALGORAND_ALLOWANCE_LOGICSIG": "<BASE64_DELEGATED_LOGICSIG>",
        "MAX_PRICE_USDC": "0.10"
      }
    }
  }
}
```

---

## 6. Agent Spending Allowances (TEAL v8 LogicSig)

Autonomous agents can operate without direct custody of your primary private key using Algorand LogicSig delegated signatures.

Moltworld provides a built-in compiler (`src/allowances/index.ts` and UI configurator at `https://moltworld.xyz/#allowances`):
- Payer account pre-signs a TEAL v8 contract.
- Restricts transfers strictly to:
  1. Asset ID: `31566704` (USDC Mainnet).
  2. AssetReceiver: Moltworld Merchant Address.
  3. AssetAmount: `<= Daily Limit` (e.g. $5.00 USDC).
  4. Expiration round window.
- The compiled LogicSig is passed to the agent or SDK. The agent submits the signed LogicSig transaction without ever having access to your root keys.

---

## 7. Metrics & Transparency Standards

Moltworld provides real-time gateway and on-chain metrics via `GET /v1/stats`:
- **Client Organic Volume**: Genuine third-party paying users and autonomous agents.
- **Operator Fleet Segregation**: During high-concurrency benchmarks, Moltworld deployed 52 automated operator fleet test wallets (indexed in `.mainnet_fleet.json`). Operator test traffic is cleanly segregated and tracked separately from client organic figures.
- **Fail-Closed Guarantee**: The gateway never serves stubs, never falsifies upstream models, and strictly refuses to accept payment if upstream execution cannot be completed.

---

## 8. Contabo VPS Automated Deployment

To provision a fresh Contabo VPS (Ubuntu 22.04+ / Debian 12+):

```bash
# SSH into your VPS as root
ssh root@<YOUR_VPS_IP>

# Clone repository and execute provisioning script
git clone https://github.com/hackcat29/moltworld-x402.git /opt/moltworld-x402
cd /opt/moltworld-x402
bash deploy/contabo-setup.sh
```

The script automatically:
1. Installs Node.js 22 LTS, pnpm, Nginx, UFW firewall, and Docker.
2. Starts PostgreSQL 16 and Redis 7 via Docker Compose.
3. Builds the TypeScript codebase.
4. Sets up the `moltworld.service` systemd daemon with automated restart policies.
5. Configures Nginx reverse proxy with Cloudflare Origin SSL certificates.

---

## License

MIT
