# Moltworld: Multimodal x402 AI Gateway on Algorand

**One unified API for AI models and autonomous agents.**  
Pay per request in USDC on Algorand. Zero subscriptions, zero prepaid credits.

**Repository:** [hackcat29/moltworld-x402](https://github.com/hackcat29/moltworld-x402)

This repository was created because the original GitHub account, `UncleTom29`, was suspended. It preserves the original Moltworld commit history and is the current home for development and deployment.

- **Public Domain**: [https://moltworld.xyz](https://moltworld.xyz)
- **Deployment**: Contabo VPS (Ubuntu 22.04 LTS / Debian 12) + Cloudflare Reverse Proxy / DNS
- **Modalities**: Multimodal: Chat Completions (28 models), Image Generation (6 models), Voice Speech Synthesis (5 models), and Video Synthesis (5 models)
- **Active Models**: 44 production-ready models across OpenAI, Anthropic, Google, DeepSeek, Meta, Black Forest Labs, Recraft, ByteDance, xAI, MiniMax, and Alibaba via OpenRouter
- **Payment Scheme**: Algorand x402 exact micropayments via GoPlausible facilitator
- **Challenge Tag**: `x402-global-challenge`

---

## 1. What Moltworld Is

Moltworld is an OpenRouter-style AI model gateway powered by HTTP 402 (`x402`) micropayments on the Algorand blockchain. Clients and autonomous agents select a model, submit a standard OpenAI-compatible JSON payload, pay a fixed per-request USDC fee via the GoPlausible facilitator, and immediately receive the generated output.

Every paid endpoint is:
1. **Protected by x402**: Requests without valid payment return `402 Payment Required` with Base64 payment requirements.
2. **Cataloged in GoPlausible Bazaar**: Discovered automatically by agents via Bazaar discovery extensions.
3. **Attributed to the Global x402 Challenge**: Tagged with `x402-global-challenge` on every route.
4. **Settled under a unified address**: Volume aggregates under one merchant account under `moltworld.xyz`.
5. **Fail-Closed Architecture**: Unsupported providers and endpoints without working upstream keys are disabled, never advertised, and never accept payment. If facilitator initialization fails, the gateway immediately fails closed (503 Service Unavailable).

---

## 2. Architecture & Production Flow

Moltworld operates as a **Composite Entry** under the single root domain `moltworld.xyz`:

```
                           Client / Autonomous Agent
                                       │
                                       ▼
                   Cloudflare Edge Proxy (DNS + WAF + SSL)
                                       │ (Full Strict HTTPS)
                                       ▼
                     Contabo VPS (Port 80/443 - UFW)
                                       │
                    Nginx Reverse Proxy (Real IP restore)
                    (CF-Connecting-IP, no-cache on /v1/*)
                                       │ (HTTP 127.0.0.1:3000)
                                       ▼
                         Moltworld Gateway Daemon
                      (Hono + Node.js 20 systemd unit)
                                       │
                  ┌────────────────────┴────────────────────┐
                  ▼                                         ▼
             Free Routes                               Paid Routes
           GET / (Landing)               POST /v1/models/:model/chat/completions
           GET /health (Fail-Closed)     POST /v1/models/:model/images/generations
           GET /v1/models (Catalog)      POST /v1/models/:model/audio/speech
                                         POST /v1/models/:model/videos/generations
                                                            │
                                                            ▼
                                                x402 HTTP Resource Server
                                             - ExactAvmScheme (Testnet/Mainnet)
                                             - GoPlausible Facilitator
                                             - Bazaar Discovery Extension
                                             - Tag: "x402-global-challenge"
                                                            │
                                                    [Payment Verified]
                                                            │
                                                            ▼
                                                  AI Provider Abstraction
                                            (OpenRouter Direct / Fail-Closed)
                                                            │
                                                            ▼
                                                 Standard Normalized JSON
```

---

## 3. Active Model Catalog

### Chat Models (28 Active Models)

| Model ID | Public Display Name | Upstream Model ID | Price (USDC) | Max In | Max Out |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `gpt-6-astra` | GPT-6 Astra | `openai/gpt-6-astra` | **$0.80** | 4,096 | 4,096 |
| `gpt-6-sol` | GPT-6 Sol | `openai/gpt-6-sol` | **$0.70** | 4,096 | 4,096 |
| `gpt-5.4-pro` | GPT-5.4 Pro | `openai/gpt-5.4-pro` | **$0.60** | 4,096 | 4,096 |
| `gpt-5.2-pro` | GPT-5.2 Pro | `openai/gpt-5.2-pro` | **$0.50** | 4,096 | 4,096 |
| `gpt-5-pro` | GPT-5 Pro | `openai/gpt-5-pro` | **$0.35** | 4,096 | 4,096 |
| `o3-pro` | o3 Pro | `openai/o3-pro` | **$0.25** | 4,096 | 4,096 |
| `claude-fable-5.1` | Claude Fable 5.1 | `anthropic/claude-fable-5.1` | **$0.15** | 4,096 | 4,096 |
| `claude-opus-5.5` | Claude Opus 5.5 | `anthropic/claude-opus-5.5` | **$0.060** | 4,096 | 4,096 |
| `claude-opus-5` | Claude Opus 5 | `anthropic/claude-opus-5` | **$0.055** | 4,096 | 4,096 |
| `gpt-5.6-astra` | GPT-5.6 Astra | `openai/gpt-5.6-astra` | **$0.050** | 4,096 | 4,096 |
| `gpt-5.6-sol` | GPT-5.6 Sol | `openai/gpt-5.6-sol` | **$0.040** | 4,096 | 4,096 |
| `claude-sonnet-5.5` | Claude Sonnet 5.5 | `anthropic/claude-sonnet-5.5` | **$0.040** | 4,096 | 4,096 |
| `gemini-3.1-pro` | Gemini 3.1 Pro | `google/gemini-3.1-pro-preview` | **$0.035** | 4,096 | 4,096 |
| `gpt-5.6-terra` | GPT-5.6 Terra | `openai/gpt-5.6-terra` | **$0.035** | 4,096 | 4,096 |
| `claude-sonnet-5` | Claude Sonnet 5 | `anthropic/claude-sonnet-5` | **$0.030** | 4,096 | 4,096 |
| `gpt-5.6-luno` | GPT-5.6 Luno | `openai/gpt-5.6-luno` | **$0.025** | 4,096 | 4,096 |
| `gpt-5.4` | GPT-5.4 | `openai/gpt-5.4` | **$0.022** | 4,096 | 4,096 |
| `gpt-5.2` | GPT-5.2 | `openai/gpt-5.2` | **$0.020** | 4,096 | 4,096 |
| `claude-sonnet` | Claude Sonnet 4.5 | `anthropic/claude-sonnet-4.5` | **$0.006** | 4,096 | 1,024 |
| `gpt-4o` | GPT-4o | `openai/gpt-4o` | **$0.005** | 4,096 | 1,024 |
| `gemini-pro` | Gemini 2.5 Pro | `google/gemini-2.5-pro` | **$0.004** | 4,096 | 1,024 |
| `gpt` | GPT-4o Mini | `openai/gpt-4o-mini` | **$0.003** | 4,096 | 2,048 |
| `claude` | Claude 3 Haiku | `anthropic/claude-3-haiku` | **$0.003** | 4,096 | 2,048 |
| `gemini` | Gemini 2.5 Flash | `google/gemini-2.5-flash` | **$0.002** | 4,096 | 2,048 |
| `deepseek-r1` | DeepSeek R1 | `deepseek/deepseek-r1` | **$0.002** | 4,096 | 2,048 |
| `gemini-lite` | Gemini 2.5 Flash Lite | `google/gemini-2.5-flash-lite` | **$0.001** | 4,096 | 2,048 |
| `deepseek` | DeepSeek V3 | `deepseek/deepseek-chat` | **$0.001** | 4,096 | 2,048 |
| `llama` | Llama 3.3 70B | `meta-llama/llama-3.3-70b-instruct` | **$0.001** | 4,096 | 2,048 |

### Multimodal Models (16 Active Models)

| Modality | Model ID | Public Display Name | Upstream Model ID | Price (USDC) |
| :--- | :--- | :--- | :--- | :--- |
| **Image** | `recraft-v4.1-flash` | Recraft V4.1 Flash | `recraft/recraft-v4.1-flash` | **$0.05** |
| **Image** | `flux-2-pro` | FLUX.2 Pro | `black-forest-labs/flux.2-pro` | **$0.20** |
| **Image** | `qwen-image-3` | Qwen Image 3 | `qwen/qwen-image-3` | **$0.20** |
| **Image** | `seedream-5.0` | ByteDance Seedream 5.0 | `bytedance-seed/seedream-5-0-lite` | **$0.25** |
| **Image** | `grok-imagine-image` | Grok Imagine Image 2.0 | `x-ai/grok-imagine-image-2.0` | **$0.25** |
| **Image** | `recraft-v3` | Recraft V3 | `recraft/recraft-v3` | **$0.25** |
| **Voice** | `gpt-audio-mini` | GPT Audio Mini | `openai/gpt-audio-mini` | **$0.02** |
| **Voice** | `tts-1` | OpenAI TTS-1 | `tts-1` | **$0.10** |
| **Voice** | `tts-1-hd` | OpenAI TTS-1 HD | `tts-1-hd` | **$0.20** |
| **Voice** | `gpt-audio` | GPT Audio | `openai/gpt-audio` | **$0.20** |
| **Voice** | `eleven-multilingual` | ElevenLabs Multilingual V2 | `eleven_multilingual_v2` | **$0.20** |
| **Video** | `veo-3.1-fast` | Google Veo 3.1 Fast | `google/veo-3.1-fast` | **$0.25** |
| **Video** | `kling-v3.0-std` | Kling Video V3.0 | `kwaivgi/kling-v3.0-std` | **$0.275** |
| **Video** | `wan-3.0` | Alibaba Wan 3.0 | `alibaba/wan-3.0` | **$0.30** |
| **Video** | `hailuo-3` | MiniMax Hailuo H3 | `minimax/hailuo-3` | **$0.40** |
| **Video** | `sora-2-pro` | OpenAI Sora 2 Pro | `openai/sora-2-pro` | **$1.00** |

---

## 4. Local Development & Testing

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm build

# Run automated tests (22 tests covering catalog integrity, fail-closed guards, 402 headers)
pnpm test

# Run local development server
pnpm dev
```

---

---

## 5. Validated End-to-End Testnet Settlement Proof

Moltworld's complete machine-to-machine x402 payment and AI inference pipeline is live, verified, and settled on **Algorand Testnet** through the official **GoPlausible x402 Facilitator**:

$$\text{Client} \xrightarrow{\text{Prompt}} \text{Moltworld} \xrightarrow{\text{HTTP 402}} \text{x402 Signer} \xrightarrow{\text{Exact AVM Scheme}} \text{GoPlausible Facilitator} \xrightarrow{\text{On-Chain USDC}} \text{OpenRouter} \xrightarrow{\text{HTTP 200}} \text{Client}$$

### Confirmed On-Chain Settlements:

| Model | Modality | Price (USDC) | Algorand Testnet TxID | Status | Lora Explorer Link |
|---|---|---|---|---|---|
| **Gemini 2.5 Flash Lite** (`gemini-lite`) | Chat | $0.01 (10,000 base units) | `SNSPRUA6IDIMYB466OXDEZNUQMLJ6MGOTDFFQEU5P4C6KGTQZ2CQ` | **CONFIRMED** | [View on Lora](https://lora.algokit.io/testnet/transaction/SNSPRUA6IDIMYB466OXDEZNUQMLJ6MGOTDFFQEU5P4C6KGTQZ2CQ) |
| **DeepSeek V3** (`deepseek`) | Chat | $0.01 (10,000 base units) | `HMHLVL7FGW7UKNPQ5WV6ZPWM7NWGTMT2MVYV6SQT77O6AASTQEMQ` | **CONFIRMED** | [View on Lora](https://lora.algokit.io/testnet/transaction/HMHLVL7FGW7UKNPQ5WV6ZPWM7NWGTMT2MVYV6SQT77O6AASTQEMQ) |
| **Setup Settlement** (`gemini-lite`) | Chat | $0.01 (10,000 base units) | `REWKVF6KF6PNJTKQGC3PYJLEBQ5XX3EDLYQONP6NY3BADXX5DBCQ` | **CONFIRMED** | [View on Lora](https://lora.algokit.io/testnet/transaction/REWKVF6KF6PNJTKQGC3PYJLEBQ5XX3EDLYQONP6NY3BADXX5DBCQ) |

### Live Execution Trace (`gemini-lite`):
```text
======================================================
 Moltworld x402 Multimodal Client Demo
 Modality: [CHAT]
 Model:    gemini-lite
 Endpoint: https://moltworld.xyz/v1/models/gemini-lite/chat/completions
======================================================

[Step 1] Sending initial prompt request without payment proof...
[Step 2] Received HTTP Status: 402 (Expected: 402 Payment Required)
[Step 3] Payment Required Requirements:
- Resource:   https://moltworld.xyz/v1/models/gemini-lite/chat/completions
- Scheme:     exact
- Network:    algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=
- Amount:     10000 base units (USDC)
- Asset ID:   10458941
- PayTo:      TQWEL54TCBYH3QJLN2OU2QH7XZTHRDZMF2YQIU5B7W2HK6GS7I2TWHDMXU
- Challenge:  tag="x402-global-challenge"

[Step 4] Initialized Algorand client signer:
- Address: WEXP3TE74ID3Y752NCR2ODZYJCD4CZPU2RAWMEGP7FB4IGBHDMSVUJTR3M

[Step 5] Retrying request with x402 payment authorization...
[Step 6] Response Status: 200
[Step 6] Settlement Details:
- Settlement Success: true
- Transaction ID:    SNSPRUA6IDIMYB466OXDEZNUQMLJ6MGOTDFFQEU5P4C6KGTQZ2CQ
- Explorer URL:      https://lora.algokit.io/testnet/transaction/SNSPRUA6IDIMYB466OXDEZNUQMLJ6MGOTDFFQEU5P4C6KGTQZ2CQ
- Network:           algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=

[Step 7] Model Media Response Received:
- Model:   gemini-lite
- Content: 
Imagine you want to build a digital world where people can trade things, play games, or even vote, all without a central authority like a bank or a government. That's where Algorand comes in...

Demo completed successfully!
```

### GoPlausible Bazaar & Leaderboard Verification:

Querying GoPlausible's discovery endpoint (`https://facilitator.goplausible.xyz/discovery/resources?search=moltworld`) confirms that:
1. Every paid endpoint is automatically cataloged with full JSON schemas and examples.
2. Every request embeds the competition tag: `"tag": "x402-global-challenge"`.
3. The merchant profile is crawled and enriched automatically from `https://moltworld.xyz`:
   - Title: `"Moltworld — Multimodal AI Gateway with x402 on Algorand"`
   - Tag: `x402-global-challenge`
   - Confirmed Settlements: 4+

---

## 6. Running the Test Client

```bash
# Test with Gemini 2.5 Flash Lite ($0.001 USDC)
AVM_CLIENT_PRIVATE_KEY=<YOUR_PRIVATE_KEY> pnpm test:client --url=https://moltworld.xyz --model=gemini-lite

# Test with DeepSeek V3 ($0.001 USDC)
AVM_CLIENT_PRIVATE_KEY=<YOUR_PRIVATE_KEY> pnpm test:client --url=https://moltworld.xyz --model=deepseek

# Test with GPT-4o ($0.005 USDC)
AVM_CLIENT_PRIVATE_KEY=<YOUR_PRIVATE_KEY> pnpm test:client --url=https://moltworld.xyz --model=gpt-4o
```

---

## 7. Mainnet Deployment Checklist

When ready to switch from Testnet to Algorand Mainnet:

1. **Merchant Wallet**: Provide your intended Algorand Mainnet address holding/opted-in to Mainnet USDC (ASA `31566704`).
2. **Environment Variables**:
   * Set `ALGORAND_NETWORK=mainnet`
   * Set `AVM_ADDRESS=<YOUR_MAINNET_ADDRESS>`
3. **Deploy**:
   * **Contabo VPS**: Push to `main` (GitHub Actions automatically tests, builds, and deploys to VPS) or run `pnpm deploy:contabo`.
   * **Cloudflare Worker**: Run `pnpm deploy:worker`.
4. **Smoke Test**: Execute a single $0.001 USDC test on Mainnet using `gemini-lite`:
   ```bash
   ALGORAND_NETWORK=mainnet AVM_CLIENT_PRIVATE_KEY=<YOUR_MAINNET_KEY> pnpm test:client --url=https://moltworld.xyz --model=gemini-lite
   ```

---

## 9. CI/CD & Production Architecture

- **GitHub Actions**: Automated CI runs on every push and pull request to `main` via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), compiling TypeScript, running all 22 tests, deploying to the Contabo VPS and the Cloudflare Worker that serves `moltworld.xyz`, then verifying the public endpoint serves the current catalog.
- **Fail-Closed Design**: If upstream provider keys or facilitator services are unavailable, the gateway fails closed (`503 Service Unavailable`) before payment can ever be accepted.

---

## License

MIT
