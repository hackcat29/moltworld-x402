# Moltworld

**Pay-per-request AI for apps and autonomous agents, settled in USDC on Algorand via x402.**

One HTTP request to call chat, image, voice or video models. Each request is priced from its
exact input, paid with a single USDC transfer (no account, no API key, no ALGO needed), and
answered with an Ed25519-signed receipt that ties the on-chain settlement to hashes of the
request and response.

- Site: [moltworld.xyz](https://moltworld.xyz)
- Docs: [docs.moltworld.xyz](https://docs.moltworld.xyz), source in [`docs/`](docs)
- Agent summary: [/llms.txt](https://moltworld.xyz/llms.txt)
- Repository: [hackcat29/moltworld-x402](https://github.com/hackcat29/moltworld-x402) (moved from the suspended `UncleTom29` account, history preserved)
- Challenge tag: `x402-global-challenge`

## Why x402 is the core of the product

x402 is the only way in: there are no API keys or prepaid balances to fall back to.

| | |
| --- | --- |
| **Priced per request** | The 402 challenge is computed from the body: input tokens + `max_tokens`, images, characters or seconds, times live upstream rates, plus a published margin. `POST /v1/quote` returns the same amount for free. |
| **Never charged for nothing** | Invalid input gets 400 before any challenge. Chat settles only after the answer exists. Image, voice and video settle first and are refunded on-chain if the model fails. |
| **Usage rebates** | Chat is paid for its full `max_tokens` budget (x402 `exact`); the unused part is credited back and paid out in USDC. |
| **Safe retries** | A payment is keyed by its Algorand txid. Retrying with the same `Payment-Signature` after a dropped connection returns the original response; it never settles twice. |
| **Concurrency-safe** | Unsettled requests from one wallet are capped at its on-chain USDC balance, so parallel requests cannot outspend it. |
| **Verifiable** | Every paid response carries `Moltworld-Receipt`: payer, amount, txid, upstream model actually used, `sha256(request)`, `sha256(response bytes)`, signed with a published Ed25519 key. |

## What is new in agentic payments here

**Spending mandates.** An owner delegates a small LogicSig program to an agent. The agent can
then sign x402 payments *as the owner's account*, but the Algorand protocol only lets those
payments be USDC to Moltworld, at most N per call, with zero fee, until an expiry round, and only
with a signature from the agent's own key over the transaction id (`ed25519verify`). The agent
creates that key itself (`moltworld-mcp keygen`) and only shares its address, so the credential
the owner hands over is not a bearer token: on its own it cannot pay.
The daily cap is enforced on-chain too: each payment is grouped with a call to an immutable
spend counter app (`src/mandates/counter.ts`) whose cap and window are fixed by the
owner-signed program, and the SDK checks the deployed app's code byte-for-byte before the owner
signs. Moltworld additionally enforces a model allow-list and a rolling 24h check, and because
the payee is pinned, a server-side revocation stops all spending.

| | |
| --- | --- |
| **Spend counter** | Mainnet app [`3755263517`](https://lora.algokit.io/mainnet/application/3755263517), testnet app [`775006909`](https://lora.algokit.io/testnet/application/775006909). No update or delete path. `GET /health` publishes the active one. |
| **Standard x402** | A capped payment is a three-transaction group (facilitator fee payment, USDC transfer, counter call) within the x402 AVM `exact` rules. It settles through the GoPlausible facilitator like any other payment, e.g. testnet [`MCV7K2NC…`](https://lora.algokit.io/testnet/transaction/MCV7K2NCHTSD62SA6ZGY6VEIAJSCMVG562ULACW6NANOCNRINYNQ). Wallet payments are unchanged. |
| **Verified** | The mandate and counter programs are assembled deterministically and checked byte-for-byte against algod's compiler and the deployed apps; the test suite runs both through Algorand `simulate`, including an over-cap payment the AVM rejects. |
| **Clients** | TypeScript and Python SDKs, the local MCP server and the Playground all build bound and capped mandate payments. |

**Creator marketplace.** Anyone with an Algorand wallet can sell their own HTTPS API through
Moltworld's x402 checkout. Listings are wallet-signed and reviewed; calls are forwarded with an
HMAC signature over the body; creators receive 85% in batched atomic on-chain payouts.

## Using it

```ts
import { MoltworldClient } from "moltworld-sdk"; // sdk/js

const client = new MoltworldClient({ mnemonic, maxPerRequestUsd: 0.25, budgetUsd: 5 });
const res = await client.chat("gpt-4o", { messages: [{ role: "user", content: "Hi" }], max_tokens: 300 });
res.verification?.ok; // receipt signature + request/response hashes checked
```

```python
from moltworld import MoltworldClient  # sdk/python
client = MoltworldClient(mnemonic="...", max_per_request_usd=0.25, budget_usd=5)
res = client.chat("gpt-4o", [{"role": "user", "content": "Hi"}], max_tokens=300)
```

An agent paying under a mandate holds its own key and the owner's credential:

```ts
const mandate = JSON.parse(Buffer.from(process.env.MOLTWORLD_MANDATE!, "base64").toString("utf8"));
const client = new MoltworldClient({ mandate, agentKey: process.env.AGENT_KEY, budgetUsd: 5 });
```

```python
client = MoltworldClient(mandate=os.environ["MOLTWORLD_MANDATE"], agent_key=os.environ["AGENT_KEY"], budget_usd=5)
```

Agents: the remote MCP server is at `https://moltworld.xyz/mcp` (quote, 402 challenge,
caller-signed requests, receipts). The SDK also ships `moltworld-mcp`, a local MCP server that
pays by itself within a mandate and budget. See [plugins/moltworld](plugins/moltworld).

Raw HTTP:

```bash
curl -s https://moltworld.xyz/v1/quote -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hi"}],"max_tokens":200}'
# POST the same body to /v1/models/gpt-4o/chat/completions -> 402 + Payment-Required,
# then retry with Payment-Signature from any x402 client that supports Algorand.
```

## API

| Endpoint | |
| --- | --- |
| `POST /v1/models/{model}/chat/completions` · `images/generations` · `audio/speech` · `videos/generations` | Paid (x402) |
| `POST /v1/market/{slug}/call` | Paid (x402), creator APIs |
| `POST /v1/quote` | Exact price of a body |
| `GET /v1/models` | Catalog with upstream ids, cost basis, from-prices (`?include=unavailable` shows withheld models and why) |
| `GET /v1/jobs/{id}` | Video job status (+ `/content` for proxied videos) |
| `GET /v1/receipts/{requestId}` | Receipt, settlement, rebate and refund status |
| `GET /.well-known/moltworld-receipts.json` | Receipt signing keys |
| `POST /v1/mandates/draft` · `POST /v1/mandates` · `GET /v1/mandates/{id}` · `POST /v1/mandates/{id}/revoke` | Spending mandates |
| `GET /v1/market` · `POST /v1/market/listings` · `GET /v1/market/creators/{address}/earnings` | Marketplace |
| `GET /v1/stats` | Public ledger metrics with on-chain settlement txids |
| `GET /health` · `/llms.txt` · `/.well-known/x402` · `/.well-known/agent-card.json` · `/a2a` · `/mcp` | Discovery |

## Catalog

Chat through OpenRouter (rates synced from OpenRouter's live price list), image
and video through fal.ai (Veo 3.1 Fast, Kling v3, Wan 3.0, MiniMax H3, FLUX.2 Pro, Qwen Image 3,
Seedream 5.0 Lite, Grok Imagine 2.0, Recraft V4.1/V3), OpenAI (gpt-image-1, TTS, Sora 2 Pro)
and ElevenLabs. Each entry is named after the upstream that serves it. At startup the gateway
checks every upstream id against the provider's catalog; anything it cannot verify, or whose
provider key is missing, is withheld and never sold.

## Architecture

```
Client / agent ──HTTPS──▶ Cloudflare (DNS, TLS, pass-through Worker)
                              │
                              ▼
                 Nginx ─▶ Node 22 gateway (Hono, systemd)  ◀── one origin
                              │  prepare: validate + quote (400 before any 402)
                              │  commerce: replay, ledger, receipts, rebates, refunds
                              │  x402: exact AVM scheme, GoPlausible facilitator, Bazaar
                              │  hooks: payer/txid from facilitator results, exposure,
                              │         mandate caps, duplicate-payment locks
                              ├── PostgreSQL 16 (ledger)   Redis 7 (coordination)
                              ├── workers: video polling, refunds, batched payouts
                              └── OpenRouter · fal.ai · OpenAI · ElevenLabs
```

Development and tests use PGlite (PostgreSQL in-process), so the same SQL runs everywhere.

## Development

```bash
pnpm install
pnpm build        # typecheck gateway + SDK
pnpm test         # unit, e2e (real x402 client + reference facilitator logic), mandates, SDK, Python interop
pnpm test:ui      # Playwright: every page, 6 viewports x light/dark, header menus and every widget
pnpm stack:local  # whole stack offline at http://127.0.0.1:3402 with seeded traffic
pnpm vendor       # bundle three.js, TypeGPU and the browser payment client into vendor/
pnpm brand        # re-render the logo, favicons and OG image from src/site/brand.ts
pnpm mandate:counter  # deploy a spend counter (DEPLOYER_KEY, see ops/OPERATIONS.md)
```

`pnpm stack:local` runs the gateway against a simulated Algorand ledger and a facilitator built
from the reference `@x402/avm` logic, with mock models. It needs no keys or funds.

## Site and docs

The site is rendered by the gateway itself (`src/site`): platform, solution and use-case pages,
the model catalog, pricing, a developer hub, a Playground and the live network. Every page is
plain HTML with one shared stylesheet and script. Two scenes run on WebGPU frameworks and load
on demand: the hero world (three.js `WebGPURenderer` with TSL, falling back to WebGL2) and the
request-flow field (TypeGPU compute and render pipelines). Both libraries are bundled into
`vendor/` by `pnpm vendor` (run by `build`, `dev`, `start`, `stack:local` and `test:ui`) and served
from the gateway's own origin; without the bundles the pages keep static fallbacks.

The Playground makes real x402 calls. `web/pay.ts` runs the SDK in the browser with one of two
signers: a wallet connected through use-wallet (Pera, Defly, Lute, Kibisis), which approves each
USDC transfer, or a pasted `MOLTWORLD_MANDATE` credential bound to an agent key the browser
generates and keeps, which signs within the mandate's on-chain limits like an agent would. A
per-request cap is enforced before anything is signed, and every receipt is verified in the
browser. Browsers build payments against `PUBLIC_ALGOD_URL`, or the
SDK's public node when it is unset. `pnpm stack:local` also offers a funded "Local dev wallet" and a
registered dev mandate on the simulated ledger; both are refused on mainnet and in production.

`docs/` is a [Mintlify](https://mintlify.com) project for docs.moltworld.xyz: guides, agent
setup (MCP, OpenClaw, Hermes Agent, Claude Code, A2A), SDK references, and an API reference
generated from `docs/api-reference/openapi.json`. Preview it with `cd docs && npx mint dev`;
check it with `npx mint validate` and `npx mint broken-links`. To publish, connect the repository
in the Mintlify dashboard with `docs` as the docs directory, then add `docs.moltworld.xyz` as a
custom domain (a CNAME record to the target Mintlify gives you). Set `DOCS_URL` on the gateway if
the docs live elsewhere.

Deployment, keys and the runbook: [ops/OPERATIONS.md](ops/OPERATIONS.md) and
[deploy/README.md](deploy/README.md). Launch checklist (legal, tax, provider terms):
[ops/COMPLIANCE.md](ops/COMPLIANCE.md).

## License

MIT
