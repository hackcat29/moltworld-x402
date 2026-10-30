# Moltworld

**The inference layer for AI agents: every AI model, paid per request in USDC on Algorand via x402.**

[![npm](https://img.shields.io/npm/v/moltworld-sdk?label=moltworld-sdk)](https://www.npmjs.com/package/moltworld-sdk)
[![CI](https://github.com/hackcat29/moltworld-x402/actions/workflows/ci.yml/badge.svg)](https://github.com/hackcat29/moltworld-x402/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-black)](#license)

One HTTP request calls any chat, image or voice model. The 402 challenge carries the exact
price of that request, one USDC transfer pays it (no account, no API key, no ALGO needed), and the
answer comes back with an Ed25519-signed receipt tied to the on-chain settlement. Agents can pay on
their own under a **mandate**: a spending limit the Algorand protocol enforces, bound to the
agent's own key.

**[moltworld.xyz](https://moltworld.xyz)** · [Playground](https://moltworld.xyz/playground) · [Live stats](https://moltworld.xyz/stats) · [Docs](https://docs.moltworld.xyz) · [Facilitator dashboard](https://facilitator.goplausible.xyz/dashboard/merchants/414f1538ce0d6de4) · [/llms.txt](https://moltworld.xyz/llms.txt)

## At a glance

| | |
| --- | --- |
| **Volume** | **#1 of 20** on the [Global x402 Challenge leaderboard](https://blockchain.news/news/algorand-global-x402-challenge-winners-2026), ranked by counted USDC volume with identified synthetic volume excluded. On Algorand mainnet through the GoPlausible facilitator: **20,534 settlements, $12,041 USDC, 99.77% success, 80 ms average settlement** (as of 28 Oct 2026; live on [/stats](https://moltworld.xyz/stats)). |
| **Use case** | x402 is the only way in. There are no accounts, API keys or prepaid balances to fall back to: every model call is an x402 payment, priced from the request itself. |
| **Innovation** | Agent-bound **spending mandates** whose daily cap is checked on-chain inside the payment, by an immutable spend counter ([mainnet app 3755263517](https://lora.algokit.io/mainnet/application/3755263517)), settling through the standard x402 facilitator. Plus exact per-request quotes, on-chain refunds, usage rebates and signed receipts. |
| **Sustained potential** | A 3% margin on every call (below OpenRouter's ~5% markup), a 15% fee on the creator marketplace, and distribution where agents already run: MCP, A2A, the x402 Bazaar, and [`moltworld-sdk`](https://www.npmjs.com/package/moltworld-sdk) for TypeScript and Python. |

## Try it

```bash
# Free: the exact price of a request
curl -s https://moltworld.xyz/v1/quote -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hi"}],"max_tokens":200}'

# Paid: POST the same body to /v1/models/gpt-4o/chat/completions -> 402 + Payment-Required,
# then retry with Payment-Signature from any x402 client that supports Algorand.
```

Or open the [Playground](https://moltworld.xyz/playground), connect Pera, Defly, Lute or Kibisis,
and pay for a real call; the receipt is verified in your browser.

```bash
npm i moltworld-sdk     # TypeScript
pip install ./sdk/python  # Python
```

```ts
import { MoltworldClient } from "moltworld-sdk";

const client = new MoltworldClient({ mnemonic, maxPerRequestUsd: 0.25, budgetUsd: 5 });
const res = await client.chat("gpt-4o", { messages: [{ role: "user", content: "Hi" }], max_tokens: 300 });
res.verification?.ok; // receipt signature + request/response hashes checked
```

```python
from moltworld import MoltworldClient
client = MoltworldClient(mnemonic="...", max_per_request_usd=0.25, budget_usd=5)
res = client.chat("gpt-4o", [{"role": "user", "content": "Hi"}], max_tokens=300)
```

Agents connect over MCP: the remote server is `https://moltworld.xyz/mcp`, and
`npx -y -p moltworld-sdk moltworld-mcp` runs a local server that pays by itself within a mandate
and budget. Setup guides: [MCP](docs/agents/mcp.mdx), [Claude Code](docs/agents/claude-code.mdx),
[OpenClaw](docs/agents/openclaw.mdx), [Hermes Agent](docs/agents/hermes.mdx), [A2A](docs/agents/a2a.mdx).

## Why x402 is the core of the product

| | |
| --- | --- |
| **Priced per request** | The 402 challenge is computed from the body: input tokens + `max_tokens`, images, characters or seconds, at live upstream rates plus a published 3% margin ($0.001 minimum). `POST /v1/quote` returns the same amount for free. |
| **Never charged for nothing** | Invalid input gets 400 before any challenge. Chat settles only after the answer exists. Image and voice settle first and are refunded on-chain if the model fails. |
| **Usage rebates** | Chat is paid for its full `max_tokens` budget (x402 `exact`); the unused part is credited back and paid out in USDC. |
| **Safe retries** | A payment is keyed by its Algorand txid. Retrying with the same `Payment-Signature` returns the original response; it never settles twice. |
| **Concurrency-safe** | Unsettled requests from one wallet are capped at its on-chain USDC balance, so parallel requests cannot outspend it. |
| **Verifiable** | Every paid response carries `Moltworld-Receipt`: payer, amount, txid, upstream model actually used, `sha256(request)`, `sha256(response bytes)`, signed with a published Ed25519 key. |

## Spending mandates: limits the chain enforces

An owner signs a small LogicSig program once and hands the agent a credential. The agent pays x402
requests *as the owner's account*, but the Algorand protocol only lets those payments be:

- USDC, to Moltworld, at most N per call, with zero fee, until an expiry round;
- signed by the **agent's own key** over the transaction id (`ed25519verify`). The agent creates
  that key itself (`moltworld-mcp keygen`) and shares only its address, so **the credential can't
  pay on its own**, and the gateway refuses any mandate that isn't bound to an agent key;
- within a **daily cap enforced on-chain**: each payment is grouped with a call to an immutable
  spend counter app ([`src/mandates/counter.ts`](src/mandates/counter.ts)) whose cap and window
  are fixed by the owner's signature, so not even Moltworld can raise them.

Moltworld adds a model allow-list and a rolling 24h check, and because the payee is pinned, a
server-side revocation stops all spending. If the agent's machine is compromised, the most anyone
can do is pay Moltworld within those limits until the mandate expires or is revoked; the owner's
wallet is never exposed.

| | |
| --- | --- |
| **Built on AVM primitives** | A **delegated LogicSig** the owner signs once, on an ordinary account with no smart-contract wallet; **`ed25519verify`** to bind every payment to the agent's key; an **atomic group** with an **immutable app** to enforce the daily cap. |
| **Live on mainnet** | Spend counter [app 3755263517](https://lora.algokit.io/mainnet/application/3755263517) (testnet [775006909](https://lora.algokit.io/testnet/application/775006909)); no update or delete path. A mainnet capped-mandate payment: [`A5LWCCU5…`](https://lora.algokit.io/mainnet/transaction/A5LWCCU5GGGPDPRGHMYRXDDFJVYNBEV3PQQC6YDL6MHOAS4RA7KQ). |
| **Standard x402** | A capped payment is one atomic group of three (facilitator fee payment, USDC transfer, counter call) within the x402 AVM `exact` rules, settled by the GoPlausible facilitator like any other payment. Wallet payments are unchanged. |
| **Verified** | The mandate and counter programs are assembled deterministically and checked byte-for-byte against algod's compiler and the deployed apps; the test suite runs them through Algorand `simulate`, including an over-cap payment the AVM rejects. The SDK refuses to sign unless the deployed counter matches. |
| **Clients** | TypeScript and Python SDKs, the local MCP server and the Playground all build bound and capped mandate payments. |

```ts
import { createMandate, MoltworldClient } from "moltworld-sdk";

// Owner, once: limits are checked locally before signing.
const { credential } = await createMandate("https://moltworld.xyz", owner, {
  agent: AGENT_ADDRESS, maxPerCallUsd: 0.5, dailyCapUsd: 5, validDays: 30,
});

// Agent: pays with its own key and the owner's credential.
const client = new MoltworldClient({ mandate: credential, agentKey: process.env.AGENT_KEY, budgetUsd: 5 });
```

```python
client = MoltworldClient(mandate=os.environ["MOLTWORLD_MANDATE"], agent_key=os.environ["AGENT_KEY"], budget_usd=5)
```

## Creator marketplace

Anyone with an Algorand wallet can sell their own HTTPS API through Moltworld's x402 checkout.
Listings are wallet-signed and reviewed, calls are forwarded with an HMAC signature over the body,
and creators receive 85% in batched atomic on-chain payouts.

## Who uses it

Every kind of agent that needs a model it doesn't host: coding agents (Claude Code, Cursor, Codex,
Cline), personal agents (OpenClaw, Hermes Agent), knowledge-work agents (Claude Cowork, ChatGPT),
computer-use agents (Manus, Agent Zero), multi-agent crews (CrewAI, LangGraph), media pipelines and
voice agents (Pipecat, LiveKit Agents). Each calls Moltworld over MCP or plain HTTP and pays per
call. See [moltworld.xyz/use-cases](https://moltworld.xyz/use-cases).

## How it compares

| | Accounts or API keys | Chat, image and voice | Exact price before paying | Signed receipt tied to the payment | Agent spending limits on-chain |
| --- | --- | --- | --- | --- | --- |
| Provider APIs (OpenAI, Anthropic, ElevenLabs…) | Required, per lab | Per lab | Billed after use | No | No |
| OpenRouter | Required, prepaid credits | Mostly chat | Billed after use | No | No |
| x402 AI gateways on Base/Solana | None | Mostly chat | Varies; some authorize up to a ceiling | Settlement details only | Left to the buyer's wallet |
| **Moltworld** | **None** | **Yes** | **Yes** | **Yes** | **Yes, bound to the agent's key** |

## API

| Endpoint | |
| --- | --- |
| `POST /v1/models/{model}/chat/completions` · `images/generations` · `audio/speech` | Paid (x402) |
| `POST /v1/market/{slug}/call` | Paid (x402), creator APIs |
| `POST /v1/quote` | Exact price of a body |
| `GET /v1/models` | Catalog with upstream ids, cost basis, from-prices (`?include=unavailable` shows withheld models and why) |
| `GET /v1/jobs/{id}` | Video job status (+ `/content` for proxied videos) |
| `GET /v1/receipts/{requestId}` | Receipt, settlement, rebate and refund status |
| `GET /.well-known/moltworld-receipts.json` | Receipt signing keys |
| `POST /v1/mandates/draft` · `POST /v1/mandates` · `GET /v1/mandates/{id}` · `POST /v1/mandates/{id}/revoke` | Spending mandates |
| `GET /v1/market` · `POST /v1/market/listings` · `GET /v1/market/creators/{address}/earnings` | Marketplace |
| `GET /v1/stats` | Ledger metrics, cross-checked with the facilitator, with on-chain txids |
| `GET /health` · `/llms.txt` · `/.well-known/x402` · `/.well-known/agent-card.json` · `/a2a` · `/mcp` | Discovery |

## Catalog

The active catalog provides chat through OpenRouter, GPT Image 1.5 and speech through
OpenAI, and speech through ElevenLabs. fal.ai models and retired OpenAI models are
not offered. Video generation is currently unavailable. Removed model endpoints
return 404 before payment; historical receipts and job records remain accessible.
At startup the gateway checks configured upstream IDs against provider catalogs
and excludes OpenAI models whose shutdown date has passed.

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
                              │         mandate checks, duplicate-payment locks
                              ├── PostgreSQL 16 (ledger)   Redis 7 (coordination)
                              ├── workers: video polling, refunds, batched payouts
                              └── OpenRouter · OpenAI · ElevenLabs
```

## Development

```bash
pnpm install
pnpm build            # vendor bundles + typecheck gateway and SDK
pnpm test             # unit, e2e (real x402 client + reference facilitator logic), mandates, SDK, Python interop
pnpm test:ui          # Playwright: every page, 6 viewports x light/dark, menus, widgets, paid runs
pnpm stack:local      # whole stack offline at http://127.0.0.1:3402 with seeded traffic
pnpm vendor           # bundle three.js, TypeGPU and the browser payment client into vendor/
pnpm brand            # re-render the logo, favicons and OG image from src/site/brand.ts
pnpm mandate:counter  # deploy a spend counter (DEPLOYER_KEY, see ops/OPERATIONS.md)
```

`pnpm stack:local` runs the gateway against a simulated Algorand ledger and a facilitator built
from the reference `@x402/avm` logic, with mock models. It needs no keys or funds, and offers a
funded dev wallet and a capped dev mandate (both refused on mainnet and in production).

CI runs typecheck, the full test suite (PGlite and PostgreSQL 16), the UI suite across 12
viewport and theme combinations, then deploys and checks the public endpoint on every push to
`main`.

## Site and docs

The site is rendered by the gateway itself (`src/site`): products, solutions, use cases, the model
catalog, pricing, a developer hub, the Playground and live stats. Two scenes run on WebGPU
frameworks and load on demand: the hero world (three.js `WebGPURenderer` with TSL, falling back to
WebGL2) and the request-flow field (TypeGPU compute and render pipelines). The Playground
(`web/pay.ts`) runs the SDK in the browser, with a wallet through use-wallet or a mandate bound to
an agent key the browser keeps, and verifies every receipt locally.

`docs/` is the [Mintlify](https://mintlify.com) project for docs.moltworld.xyz: guides, agent setup,
SDK references, and an API reference generated from `docs/api-reference/openapi.json`
(`cd docs && npx mint dev`).

Deployment, keys and the runbook: [ops/OPERATIONS.md](ops/OPERATIONS.md) and
[deploy/README.md](deploy/README.md). Launch checklist (legal, tax, provider terms):
[ops/COMPLIANCE.md](ops/COMPLIANCE.md).

## Team

- **Tomiwa Adeyemi**, founder: blockchain engineer, previously at Scroll Foundation and HUMAN Protocol.
- **Femi Asifat**, co-founder: business development, 6+ years helping web3 teams scale.

Together they built an Algorand multichain wallet bot that won a prize at Algorand's Change the
Game hackathon and became Kiwi Protocol, incubated by the Algorand Foundation, which processed
over $5M in transaction volume.

## License

MIT
