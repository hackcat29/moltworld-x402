import type { Context, Hono } from "hono";
import { config } from "../config.js";
import { esc, handleCss, handleJs, renderPage } from "./layout.js";
import { USE_CASES } from "./nav.js";
import {
  catalog,
  catalogScript,
  catalogWidget,
  codeTabs,
  earningsWidget,
  mandateLookupWidget,
  marketWidget,
  modalityCounts,
  quoteWidget,
  receiptWidget,
  statsWidget,
} from "./widgets.js";

const docs = () => config.docsUrl;
const network = () => (config.isMainnet ? "Algorand Mainnet" : "Algorand Testnet");

function pageHero(kicker: string, title: string, lede: string, ctas = ""): string {
  return `
    <section class="wrap page-hero">
      <p class="kicker">${esc(kicker)}</p>
      <h1>${esc(title)}</h1>
      <p class="lede">${lede}</p>
      ${ctas ? `<div class="cta-row">${ctas}</div>` : ""}
    </section>`;
}

function block(title: string, intro: string, content: string, id?: string): string {
  return `
    <section class="block"${id ? ` id="${id}"` : ""}>
      <div class="wrap">
        <div class="head"><h2>${esc(title)}</h2>${intro ? `<p>${intro}</p>` : ""}</div>
        ${content}
      </div>
    </section>`;
}

function ctaBand(title: string, lede: string): string {
  return `
    <section class="cta-band">
      <div class="wrap">
        <h2>${esc(title)}</h2>
        <p class="lede">${lede}</p>
        <div class="cta-row">
          <a class="btn" href="/playground">Open Playground</a>
          <a class="btn btn-ghost" href="${docs()}/quickstart">Read the quickstart</a>
        </div>
      </div>
    </section>`;
}

function linkCards(cards: Array<{ title: string; text: string; href: string; cta?: string }>, cols = 3): string {
  return `<div class="grid-${cols}">${cards
    .map(
      (c) =>
        `<a class="card" href="${esc(c.href)}"><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p><span class="more-link">${esc(c.cta ?? "Learn more")}</span></a>`
    )
    .join("")}</div>`;
}

const PAYMENT_STEPS = `
      <ol class="steps">
        <li><strong>Send the request</strong>Invalid input gets a 400 and costs nothing. A valid request gets a 402 with the price for that exact request.</li>
        <li><strong>Sign one transfer</strong>Your wallet signs a USDC transfer for that amount. The facilitator pays the network fee, so you don't need ALGO.</li>
        <li><strong>Get the result</strong>Chat is charged after the answer is ready. Image, voice and video are charged first and refunded if the model fails.</li>
        <li><strong>Keep the receipt</strong>Every response has a signed receipt with the transaction id and hashes of your request and the response.</li>
      </ol>`;

function snippets(model = "gpt-4o") {
  const origin = config.publicDomain;
  return {
    ts: `import { MoltworldClient } from "@moltworld/sdk";

const client = new MoltworldClient({
  mnemonic: process.env.ALGORAND_MNEMONIC,
  maxPerRequestUsd: 0.25, // never signs more than this
  budgetUsd: 5,           // total for this client
});

const res = await client.chat("${model}", {
  messages: [{ role: "user", content: "Summarize x402 in one line" }],
  max_tokens: 200,
});

console.log(res.data.choices[0].message.content);
console.log(res.receipt?.txid, res.verification?.ok);`,
    py: `from moltworld import MoltworldClient

client = MoltworldClient(mnemonic="...", max_per_request_usd=0.25, budget_usd=5)
res = client.chat("${model}", [{"role": "user", "content": "Summarize x402 in one line"}], max_tokens=200)

print(res.data["choices"][0]["message"]["content"])
print(res.receipt["txid"], res.verified)`,
    curl: `# Exact price, free
curl -s ${origin}/v1/quote -H 'Content-Type: application/json' \\
  -d '{"model":"${model}","messages":[{"role":"user","content":"Hi"}],"max_tokens":200}'

# The same body without payment returns 402 + Payment-Required.
# Retry with a Payment-Signature header from any x402 client for Algorand.
curl -si ${origin}/v1/models/${model}/chat/completions \\
  -H 'Content-Type: application/json' \\
  -d '{"messages":[{"role":"user","content":"Hi"}],"max_tokens":200}'`,
  };
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function home(c: Context) {
  const models = catalog();
  const counts = modalityCounts(models);
  const s = snippets();
  const body = `
    <section class="wrap hero">
      <div class="hero-split">
        <div>
          <h1>AI models, paid per request in USDC</h1>
          <p class="lede">One API for ${models.length || "chat, image, voice and video"}${models.length ? " chat, image, voice and video models" : " models"}. Each call is paid with a single USDC transfer on Algorand through x402. No account, no API key, no subscription.</p>
          <div class="cta">
            <a class="btn" href="/playground">Open Playground</a>
            <a class="btn btn-ghost" href="${docs()}/quickstart">Read the docs</a>
          </div>
          <div class="hero-meta">
            <span><strong>${counts.chat}</strong> chat</span><span><strong>${counts.image}</strong> image</span>
            <span><strong>${counts.voice}</strong> voice</span><span><strong>${counts.video}</strong> video</span>
            <span>Settled on <strong>${network()}</strong></span>
          </div>
        </div>
        ${codeTabs("hero", [["ts", "TypeScript", s.ts], ["py", "Python", s.py], ["curl", "curl", s.curl]])}
      </div>
    </section>

    <section class="block tight">
      <div class="wrap">
        <p class="note" style="margin:0 0 14px">Models from</p>
        <div class="providers"><span>OpenAI</span><span>Anthropic</span><span>Google</span><span>Meta</span><span>DeepSeek</span><span>xAI</span><span>Alibaba</span><span>ByteDance</span><span>Black Forest Labs</span><span>Kling</span><span>MiniMax</span><span>Recraft</span><span>ElevenLabs</span></div>
      </div>
    </section>

    ${block(
      "Everything you need to pay for AI per call",
      "Use the gateway on its own, or add mandates, the marketplace and receipts as you need them.",
      linkCards(
        [
          { title: "Gateway", text: "Chat, image, voice and video behind one HTTP API. Priced from each request at upstream cost plus a published margin.", href: "/products/gateway" },
          { title: "Mandates", text: "Let an agent pay from your wallet with a per-call limit, a daily cap and an expiry. Revoke it at any time.", href: "/products/mandates" },
          { title: "Marketplace", text: "Sell your own API through the same checkout. You keep 85% of every call.", href: "/products/marketplace" },
          { title: "Receipts", text: "A signed record of every paid call: what was paid, which model answered, and hashes of the request and response.", href: "/products/receipts" },
        ],
        2
      )
    )}

    ${block("How payment works", "Standard HTTP 402 using the x402 protocol. Any x402 client that supports Algorand can pay.", PAYMENT_STEPS)}

    ${block(
      "Built for agents",
      "Agents can't sign up for accounts or manage API keys safely. They can pay per call, within limits you set.",
      linkCards(
        [
          { title: "OpenClaw and Hermes Agent", text: "Add Moltworld as an MCP server. The agent quotes, pays and gets receipts on its own.", href: "/solutions/agents" },
          { title: "Spending allowance", text: "Give an always-on agent a capped, revocable budget for the models it doesn't have.", href: "/use-cases/agent-allowance" },
          { title: "Agent-to-agent commerce", text: "List your agent's skill as a paid API that other agents can call.", href: "/use-cases/agent-commerce" },
        ],
        3
      )
    )}

    ${block("Usage", `From the gateway ledger, excluding our own wallets. <a href="/stats">See all usage</a>.`, statsWidget())}

    ${ctaBand("Price a request in seconds", "Pick a model, write a request and see the exact price and the 402 response. Nothing is charged.")}`;
  return renderPage(c, {
    path: "/",
    title: "Moltworld | Multimodal AI Gateway with x402 on Algorand",
    description: "AI models for apps and agents, paid per request in USDC on Algorand through x402. No account or API key. Signed receipts and automatic refunds.",
    body,
  });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

function products(c: Context) {
  const body = `
    ${pageHero("Products", "Pay-per-request infrastructure for AI", "Four pieces that work together: the gateway sells model calls, mandates let agents pay, the marketplace lets you sell, and receipts prove what happened.")}
    <section class="wrap" style="padding-bottom:72px">
      ${linkCards(
        [
          { title: "Gateway", text: "One API for chat, image, voice and video models, priced per request.", href: "/products/gateway" },
          { title: "Models", text: "The full catalog with upstream ids, limits and prices.", href: "/models", cta: "Browse models" },
          { title: "Mandates", text: "Delegated spending for agents, limited on-chain and by the gateway.", href: "/products/mandates" },
          { title: "Marketplace", text: "Sell your own API to apps and agents, paid in USDC.", href: "/products/marketplace" },
          { title: "Receipts", text: "Verify any paid call against our published signing key.", href: "/products/receipts" },
        ],
        3
      )}
    </section>
    ${ctaBand("See it work", "The Playground shows the exact price and the 402 response for any request.")}`;
  return renderPage(c, { path: "/products", title: "Products", description: "Moltworld gateway, mandates, marketplace and receipts.", body });
}

function gateway(c: Context) {
  const models = catalog();
  const counts = modalityCounts(models);
  const s = snippets();
  const body = `
    ${pageHero(
      "Gateway",
      "One API for every model, paid per call",
      `${models.length} models from ${counts.chat ? "OpenRouter, fal.ai, OpenAI and ElevenLabs" : "leading providers"}, behind OpenAI-style request bodies. You pay for each call in USDC; there's nothing to sign up for.`,
      `<a class="btn" href="/playground">Open Playground</a><a class="btn btn-ghost" href="/models">Browse models</a>`
    )}
    ${block(
      "Priced from the request itself",
      "",
      `<div class="grid-2">
        <ul class="checks">
          <li><strong>Exact quotes.</strong> The price comes from what you send: input tokens and max_tokens for chat, images, characters or seconds. <code>POST /v1/quote</code> returns it for free.</li>
          <li><strong>Cost plus a published margin.</strong> Chat rates follow OpenRouter's live price list. The margin is ${Math.round(config.priceMargin * 100)}%, with a minimum of $${config.priceMinFloor} per call.</li>
          <li><strong>Pay only for what works.</strong> Chat is charged after the answer is ready. Image, voice and video are charged first and refunded on-chain if the model fails.</li>
          <li><strong>Unused tokens paid back.</strong> Chat is charged for its max_tokens budget. The part you don't use is credited and paid out in USDC.</li>
          <li><strong>Safe retries.</strong> Send the same payment again after a dropped connection and you get the original response. You're never charged twice.</li>
        </ul>
        ${codeTabs("gw", [["ts", "TypeScript", s.ts], ["py", "Python", s.py], ["curl", "curl", s.curl]])}
      </div>`
    )}
    ${block(
      "What you can call",
      "",
      `<div class="table-wrap"><table class="stack">
        <thead><tr><th>Type</th><th>Endpoint</th><th>Priced by</th><th>Charged</th></tr></thead>
        <tbody>
          <tr><td data-label="Type">Chat (${counts.chat})</td><td data-label="Endpoint"><code>/v1/models/{model}/chat/completions</code></td><td data-label="Priced by">Input tokens + max_tokens</td><td data-label="Charged">After the answer</td></tr>
          <tr><td data-label="Type">Image (${counts.image})</td><td data-label="Endpoint"><code>/v1/models/{model}/images/generations</code></td><td data-label="Priced by">Number of images</td><td data-label="Charged">First, refunded on failure</td></tr>
          <tr><td data-label="Type">Voice (${counts.voice})</td><td data-label="Endpoint"><code>/v1/models/{model}/audio/speech</code></td><td data-label="Priced by">Characters</td><td data-label="Charged">First, refunded on failure</td></tr>
          <tr><td data-label="Type">Video (${counts.video})</td><td data-label="Endpoint"><code>/v1/models/{model}/videos/generations</code></td><td data-label="Priced by">Seconds of video</td><td data-label="Charged">First, refunded if the job fails</td></tr>
        </tbody></table></div>
        <p class="note" style="margin-top:12px">Video returns a job id. Poll <code>GET /v1/jobs/{id}</code> for the video URL.</p>`
    )}
    ${block("How payment works", "", PAYMENT_STEPS)}
    ${ctaBand("Try a model", "See the exact price for your request before you pay anything.")}`;
  return renderPage(c, { path: "/products/gateway", title: "Gateway", description: "One API for chat, image, voice and video models, paid per request in USDC through x402.", body });
}

function modelsPage(c: Context) {
  const models = catalog();
  const body = `
    ${pageHero(
      "Models",
      "Every model, its upstream and its price",
      "Each model is listed under the provider and model id that serves it. If a provider can't confirm a model exists, we don't sell it. Prices shown are for a small request; the Playground prices yours exactly.",
      `<a class="btn" href="/playground">Open Playground</a><a class="btn btn-ghost" href="/v1/models">Catalog as JSON</a>`
    )}
    <section class="wrap" style="padding-bottom:72px">${catalogWidget(models)}</section>`;
  return renderPage(c, { path: "/models", title: "Models", description: "Moltworld model catalog with upstream ids, limits and per-request prices.", body });
}

function mandates(c: Context) {
  const origin = config.publicDomain;
  const body = `
    ${pageHero(
      "Mandates",
      "Let an agent spend from your wallet, within limits",
      "A mandate lets an agent pay for model calls from your account without ever holding your key. You set the limits once; the Algorand protocol and the gateway enforce them.",
      `<a class="btn" href="${docs()}/products/mandates">Create a mandate</a><a class="btn btn-ghost" href="/use-cases/agent-allowance">See the use case</a>`
    )}
    ${block(
      "Who enforces what",
      "",
      `<div class="table-wrap"><table class="stack">
        <thead><tr><th>Limit</th><th>Enforced by</th><th>Can it change later?</th></tr></thead>
        <tbody>
          <tr><td data-label="Limit">Only pays Moltworld, only in USDC</td><td data-label="Enforced by">Algorand (the program itself)</td><td data-label="Can it change?">No</td></tr>
          <tr><td data-label="Limit">Maximum per call</td><td data-label="Enforced by">Algorand</td><td data-label="Can it change?">No</td></tr>
          <tr><td data-label="Limit">Expiry</td><td data-label="Enforced by">Algorand</td><td data-label="Can it change?">No</td></tr>
          <tr><td data-label="Limit">Daily cap</td><td data-label="Enforced by">Moltworld gateway</td><td data-label="Can it change?">Set at registration</td></tr>
          <tr><td data-label="Limit">Allowed models</td><td data-label="Enforced by">Moltworld gateway</td><td data-label="Can it change?">Set at registration</td></tr>
          <tr><td data-label="Limit">Revocation</td><td data-label="Enforced by">Moltworld gateway</td><td data-label="Can it change?">Final once revoked</td></tr>
        </tbody></table></div>
        <p class="note" style="margin-top:12px">Because the program can only pay Moltworld, revoking a mandate on the gateway stops all spending under it.</p>`
    )}
    ${block(
      "Create one in a few lines",
      "The SDK checks the program against your limits before you sign it, so you never sign something you didn't ask for.",
      `<div class="grid-2">
        ${codeTabs("mandate", [
          [
            "owner",
            "Owner",
            `import algosdk from "algosdk";
import { createMandate } from "@moltworld/sdk";

const owner = algosdk.mnemonicToSecretKey(process.env.OWNER_MNEMONIC);
const { mandateId, credential } = await createMandate("${origin}", owner, {
  maxPerCallUsd: 0.25,
  dailyCapUsd: 5,
  validDays: 30,
  allowedModels: ["gpt-4o", "claude-sonnet-5"],
});`,
          ],
          [
            "agent",
            "Agent",
            `import { MoltworldClient } from "@moltworld/sdk";

// The credential holds no private key.
const agent = new MoltworldClient({ mandate: credential });
await agent.chat("gpt-4o", {
  messages: [{ role: "user", content: "Draft a reply" }],
});`,
          ],
          ["revoke", "Revoke", `import { revokeMandate } from "@moltworld/sdk";

await revokeMandate("${origin}", owner, mandateId);`],
        ])}
        ${mandateLookupWidget()}
      </div>`
    )}
    ${ctaBand("Give your agent a budget", "Start with a small daily cap and raise it once you trust the agent.")}`;
  return renderPage(c, { path: "/products/mandates", title: "Mandates", description: "Delegated spending for AI agents: per-call limit and expiry on-chain, daily cap and model list on the gateway, revocable at any time.", body });
}

function marketplace(c: Context) {
  const origin = config.publicDomain;
  const share = 100 - config.marketplaceFeePercent;
  const body = `
    ${pageHero(
      "Marketplace",
      "Sell your API to apps and agents",
      `Put any HTTPS API behind Moltworld's x402 checkout. Buyers pay in USDC per call, and you receive ${share}% on-chain.`,
      `<a class="btn" href="${docs()}/products/marketplace">List your API</a><a class="btn btn-ghost" href="/solutions/api-creators">For API creators</a>`
    )}
    ${block(
      "How it works",
      "",
      `<ol class="steps">
        <li><strong>Sign a listing</strong>Name, description, price and your endpoint URL, signed with your Algorand wallet. Payouts can only go to that wallet.</li>
        <li><strong>We review it</strong>We check the endpoint and description before the listing goes live.</li>
        <li><strong>Buyers pay per call</strong>Calls go to <code>/v1/market/{slug}/call</code>. Each forwarded request is signed with an HMAC you can verify.</li>
        <li><strong>You get paid</strong>Your ${share}% builds up and is paid out in batched USDC transfers once it passes $${config.creatorPayoutMinUsd}.</li>
      </ol>`
    )}
    ${block("Listings and earnings", "", `<div class="grid-2">${marketWidget()}${earningsWidget()}</div>`)}
    ${block(
      "Create a listing",
      "",
      `<pre class="code"><code>${esc(`const listing = {
  action: "list",
  creator: wallet.addr.toString(),
  slug: "weather-now",
  name: "Weather Now",
  description: "Current weather for a city, as JSON.",
  upstream_url: "https://api.example.com/weather",
  price_usd: 0.002,
  input_example: { city: "Lagos" },
  issued_at: Math.floor(Date.now() / 1000),
};

await fetch("${origin}/v1/market/listings", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ listing, creator_sig: signOwnerMessage(listing, wallet.sk) }),
});`)}</code></pre>`
    )}
    ${ctaBand("Turn your API into revenue", "No billing system to build. Buyers pay per call and you get paid in USDC.")}`;
  return renderPage(c, { path: "/products/marketplace", title: "Marketplace", description: "Sell your own API through Moltworld's x402 checkout and get paid per call in USDC.", body });
}

function receipts(c: Context) {
  const body = `
    ${pageHero(
      "Receipts",
      "Proof of what you paid for and what you got",
      "Every paid response includes a receipt signed with our published Ed25519 key. It ties the on-chain payment to the exact request you sent and the exact response you received.",
      `<a class="btn" href="${docs()}/concepts/receipts">How receipts work</a>`
    )}
    ${block(
      "What a receipt contains",
      "",
      `<div class="table-wrap"><table class="stack">
        <thead><tr><th>Field</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td data-label="Field"><code>txid</code></td><td data-label="Meaning">The Algorand transaction that settled the payment</td></tr>
          <tr><td data-label="Field"><code>payer</code>, <code>amountMicro</code></td><td data-label="Meaning">Who paid and how much, in micro-USDC</td></tr>
          <tr><td data-label="Field"><code>upstreamProvider</code>, <code>upstreamModel</code></td><td data-label="Meaning">The provider and model that actually answered</td></tr>
          <tr><td data-label="Field"><code>requestSha256</code></td><td data-label="Meaning">Hash of the request body you sent</td></tr>
          <tr><td data-label="Field"><code>responseSha256</code></td><td data-label="Meaning">Hash of the exact response bytes you received</td></tr>
          <tr><td data-label="Field"><code>rebateMicro</code></td><td data-label="Meaning">Unused chat budget credited back to you</td></tr>
          <tr><td data-label="Field"><code>kid</code>, <code>sig</code></td><td data-label="Meaning">Signing key id and Ed25519 signature</td></tr>
        </tbody></table></div>`
    )}
    ${block("Verify a receipt", `Paste a request id or a receipt. The signature is checked in your browser against <a href="/.well-known/moltworld-receipts.json">our published key</a>.`, receiptWidget())}
    ${ctaBand("Every call comes with proof", "Make a request and keep the receipt for your records or your users.")}`;
  return renderPage(c, { path: "/products/receipts", title: "Receipts", description: "Ed25519-signed receipts that tie each payment to the exact request and response.", body });
}

// ---------------------------------------------------------------------------
// Solutions
// ---------------------------------------------------------------------------

function solutions(c: Context) {
  const body = `
    ${pageHero("Solutions", "Built for agents, apps and API creators", "Pick the starting point that matches what you're building.")}
    <section class="wrap" style="padding-bottom:72px">
      ${linkCards([
        { title: "Agent frameworks", text: "Connect OpenClaw, Hermes Agent, Claude Code or any MCP client and let the agent pay per call.", href: "/solutions/agents" },
        { title: "Developers", text: "Add chat, image, voice and video to your app with no API keys or subscriptions.", href: "/solutions/developers" },
        { title: "API creators", text: "Charge per call for your own API and get paid in USDC.", href: "/solutions/api-creators" },
      ])}
    </section>
    ${ctaBand("Not sure where to start?", "Price a request in the Playground, then pick an SDK.")}`;
  return renderPage(c, { path: "/solutions", title: "Solutions", description: "Moltworld for agent frameworks, developers and API creators.", body });
}

function solutionsAgents(c: Context) {
  const origin = config.publicDomain;
  const body = `
    ${pageHero(
      "Agent frameworks",
      "Give your agent models it doesn't have, with a budget",
      "Moltworld works with any agent that speaks MCP, including OpenClaw, Hermes Agent and Claude Code. The agent quotes, pays and keeps receipts on its own, within the limits of a mandate.",
      `<a class="btn" href="${docs()}/agents/mcp">Connect your agent</a><a class="btn btn-ghost" href="/use-cases/agent-allowance">See the use case</a>`
    )}
    ${block(
      "Two ways to connect",
      "",
      `<div class="table-wrap"><table class="stack">
        <thead><tr><th></th><th>Remote MCP server</th><th>Local MCP server</th></tr></thead>
        <tbody>
          <tr><td data-label="">Address</td><td data-label="Remote"><code>${origin}/mcp</code></td><td data-label="Local"><code>moltworld-mcp</code> from the SDK</td></tr>
          <tr><td data-label="">Holds a wallet</td><td data-label="Remote">No</td><td data-label="Local">A mandate credential, never a private key</td></tr>
          <tr><td data-label="">The agent can</td><td data-label="Remote">List models, get quotes and 402 terms, send requests you signed</td><td data-label="Local">Pay for and run chat, image, voice and video calls</td></tr>
          <tr><td data-label="">Best for</td><td data-label="Remote">Discovery, or a person approving each payment</td><td data-label="Local">Agents that run on their own</td></tr>
        </tbody></table></div>`
    )}
    ${block(
      "Configuration",
      "Use your framework's MCP settings. Exact keys can change between releases, so check the framework docs if a field is rejected.",
      codeTabs("agents", [
        [
          "hermes",
          "Hermes Agent",
          `# ~/.hermes/config.yaml
mcp_servers:
  moltworld:
    command: npx
    args: ["-y", "-p", "@moltworld/sdk", "moltworld-mcp"]
    env:
      MOLTWORLD_MANDATE: "<credential from createMandate()>"
      MOLTWORLD_MAX_PER_REQUEST_USD: "0.25"
      MOLTWORLD_BUDGET_USD: "5"`,
        ],
        [
          "openclaw",
          "OpenClaw",
          `// OpenClaw gateway config: mcp.servers
{
  "mcp": {
    "servers": {
      "moltworld": {
        "command": "npx",
        "args": ["-y", "-p", "@moltworld/sdk", "moltworld-mcp"],
        "env": {
          "MOLTWORLD_MANDATE": "<credential from createMandate()>",
          "MOLTWORLD_MAX_PER_REQUEST_USD": "0.25",
          "MOLTWORLD_BUDGET_USD": "5"
        }
      },
      "moltworld-remote": { "transport": "streamable-http", "url": "${origin}/mcp" }
    }
  }
}`,
        ],
        [
          "claude",
          "Claude Code",
          `claude mcp add --transport http moltworld ${origin}/mcp

# Paid calls with a mandate:
claude mcp add -e MOLTWORLD_MANDATE=<credential> -e MOLTWORLD_BUDGET_USD=5 \\
  moltworld-wallet -- npx -y -p @moltworld/sdk moltworld-mcp`,
        ],
        [
          "json",
          "Any MCP client",
          `{
  "mcpServers": {
    "moltworld": { "type": "http", "url": "${origin}/mcp" },
    "moltworld-wallet": {
      "command": "npx",
      "args": ["-y", "-p", "@moltworld/sdk", "moltworld-mcp"],
      "env": { "MOLTWORLD_MANDATE": "<credential>", "MOLTWORLD_BUDGET_USD": "5" }
    }
  }
}`,
        ],
      ])
    )}
    ${block(
      "Tools the agent gets",
      "",
      `<div class="grid-3">
        <div class="card"><h3>moltworld_quote</h3><p>Exact price of a request before paying.</p></div>
        <div class="card"><h3>moltworld_chat</h3><p>Paid chat completion. Unused tokens are paid back.</p></div>
        <div class="card"><h3>moltworld_image</h3><p>Paid image generation, refunded if it fails.</p></div>
        <div class="card"><h3>moltworld_speech</h3><p>Paid text-to-speech, returned as audio.</p></div>
        <div class="card"><h3>moltworld_video</h3><p>Paid video generation, with optional waiting for the result.</p></div>
        <div class="card"><h3>moltworld_spend</h3><p>Wallet address and spend so far in this session.</p></div>
      </div>
      <p class="note" style="margin-top:12px">Agents that use A2A can also reach the catalog agent at <code>${origin}/.well-known/agent-card.json</code>.</p>`
    )}
    ${ctaBand("Connect your agent", "Create a mandate with a small daily cap, add the MCP server and ask your agent for a video.")}`;
  return renderPage(c, { path: "/solutions/agents", title: "Agent frameworks", description: "Use Moltworld from OpenClaw, Hermes Agent, Claude Code or any MCP client, with mandate spending limits.", body });
}

function solutionsDevelopers(c: Context) {
  const s = snippets();
  const body = `
    ${pageHero(
      "Developers",
      "Add AI to your app without keys or subscriptions",
      "Call any model with one request and pay for exactly that request. No provider accounts to manage, no prepaid credit, no monthly minimum.",
      `<a class="btn" href="${docs()}/quickstart">Quickstart</a><a class="btn btn-ghost" href="/playground">Open Playground</a>`
    )}
    ${block(
      "Why developers use it",
      "",
      `<div class="grid-3">
        <div class="card"><h3>One integration</h3><p>Chat, image, voice and video from several providers behind one API with OpenAI-style bodies.</p></div>
        <div class="card"><h3>Predictable cost</h3><p>Every call is quoted before you pay. Set a per-request cap and a budget in the SDK.</p></div>
        <div class="card"><h3>No failed-call charges</h3><p>Chat is charged after the answer. Media is refunded on-chain if it fails.</p></div>
        <div class="card"><h3>Safe retries</h3><p>Retrying a payment returns the original response instead of charging again.</p></div>
        <div class="card"><h3>Audit trail</h3><p>Signed receipts for every call, with on-chain transaction ids.</p></div>
        <div class="card"><h3>Pass costs through</h3><p>Your users can pay for their own calls from their own wallets.</p></div>
      </div>`
    )}
    ${block("Start in a few lines", "", codeTabs("dev", [["ts", "TypeScript", s.ts], ["py", "Python", s.py], ["curl", "curl", s.curl]]))}
    ${ctaBand("Build with Moltworld", "Try a request in the Playground, then copy the code for your stack.")}`;
  return renderPage(c, { path: "/solutions/developers", title: "Developers", description: "Add chat, image, voice and video models to your app with per-request USDC payments and no API keys.", body });
}

function solutionsCreators(c: Context) {
  const share = 100 - config.marketplaceFeePercent;
  const body = `
    ${pageHero(
      "API creators",
      "Charge per call for your API",
      `List your API on Moltworld and buyers pay for each call in USDC. You don't build billing, accounts or key management. You keep ${share}%.`,
      `<a class="btn" href="${docs()}/products/marketplace">List your API</a><a class="btn btn-ghost" href="/products/marketplace">See the marketplace</a>`
    )}
    ${block(
      "What you get",
      "",
      `<ul class="checks" style="max-width:70ch">
        <li><strong>Agents can buy from you.</strong> Any x402 client, including agents using Moltworld's MCP server, can call your API and pay per request.</li>
        <li><strong>No billing to build.</strong> Moltworld handles quotes, payment, settlement and receipts.</li>
        <li><strong>Authenticated calls.</strong> Each forwarded request carries an HMAC signature over its body, so you can reject anything that didn't come through Moltworld.</li>
        <li><strong>Charged only on success.</strong> Buyers are charged after your API answers with a 2xx, which keeps disputes rare.</li>
        <li><strong>Paid in USDC.</strong> Earnings are paid to your wallet in batched on-chain transfers once they pass $${config.creatorPayoutMinUsd}.</li>
      </ul>`
    )}
    ${block("Verify Moltworld's signature", "", `<pre class="code"><code>${esc(`import crypto from "crypto";

// X-Moltworld-Timestamp, X-Moltworld-Request-Id, X-Moltworld-Signature
function fromMoltworld(req, rawBody, signingSecret) {
  const ts = req.headers["x-moltworld-timestamp"];
  const id = req.headers["x-moltworld-request-id"];
  const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const expected = crypto.createHmac("sha256", signingSecret)
    .update(\`\${ts}.\${id}.\${bodyHash}\`).digest("base64url");
  return Math.abs(Date.now() / 1000 - Number(ts)) < 300 &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-moltworld-signature"]));
}`)}</code></pre>`)}
    ${ctaBand("List your first API", "It takes one signed request. We review listings before they go live.")}`;
  return renderPage(c, { path: "/solutions/api-creators", title: "API creators", description: "Sell your API per call to apps and agents, paid in USDC through Moltworld.", body });
}

// ---------------------------------------------------------------------------
// Use cases
// ---------------------------------------------------------------------------

interface UseCaseDetail {
  problem: string;
  how: string[];
  code: string;
  products: Array<[string, string]>;
}

function useCaseDetails(): Record<string, UseCaseDetail> {
  const origin = config.publicDomain;
  return {
    "agent-allowance": {
      problem:
        "Personal agents like OpenClaw and Hermes Agent run all day on one model and one subscription. When a task needs a video, a voice reply or a stronger model, you either hand the agent an API key with no limit, or the task fails.",
      how: [
        "You create a mandate: for example $0.25 per call, $5 a day, chosen models, valid for 30 days.",
        "You give the agent the mandate credential. It contains no private key.",
        "The agent adds Moltworld as an MCP server and pays for calls as it needs them.",
        "Every call comes back with a receipt. You can see spend per day and revoke the mandate at any time.",
      ],
      code: `const { credential } = await createMandate("${origin}", owner, {
  maxPerCallUsd: 0.25, dailyCapUsd: 5, validDays: 30,
});
// Give MOLTWORLD_MANDATE=<credential> to the agent's MCP server.`,
      products: [["Mandates", "/products/mandates"], ["Agent frameworks", "/solutions/agents"]],
    },
    "model-escalation": {
      problem:
        "Running every step of an agent or app on a frontier model is expensive, and paying for a second subscription to use one occasionally is wasteful.",
      how: [
        "Run your normal workload on a cheap model, or on your own.",
        "When a step is hard, such as planning, code review or a long document, send just that step to a frontier model through Moltworld.",
        "Check the price first with a quote, then pay for that one call.",
        "Unused max_tokens budget is paid back, so you only pay for what the model wrote.",
      ],
      code: `const quote = await client.quote("gpt-5.4-pro", body);
if (quote.microUsdc < 200_000) {
  const res = await client.chat("gpt-5.4-pro", body);
}`,
      products: [["Gateway", "/products/gateway"], ["Models", "/models"]],
    },
    "content-pipelines": {
      problem:
        "Content workflows need several models: an image model for the thumbnail, a voice model for narration, a video model for the clip. Each usually means a separate account and subscription.",
      how: [
        "Generate the script with a chat model, the voice-over with a voice model and the clip with a video model, all through one API.",
        "Video runs as a job. Poll it or let the SDK wait for the result.",
        "If a generation fails or doesn't finish within an hour, the payment is refunded on-chain automatically.",
        "Receipts give you a per-asset cost record.",
      ],
      code: `const clip = await client.video("kling-v3.0-std", { prompt, duration: 5 });
const job = await client.waitForJob(clip.data.id);
const voice = await client.speech("tts-1-hd", { input: script });`,
      products: [["Gateway", "/products/gateway"], ["Receipts", "/products/receipts"]],
    },
    "agent-commerce": {
      problem:
        "Agents increasingly call other agents and specialised APIs, but there's no simple way for an agent to pay another service per call, or for a builder to charge for one.",
      how: [
        "List your API or agent skill on the Moltworld marketplace with a price per call.",
        "Other agents call it through Moltworld and pay in USDC, using the same x402 flow as model calls.",
        "Your endpoint receives signed requests and answers as usual.",
        "You receive your share in batched on-chain payouts.",
      ],
      code: `// Buyer side: the same client that pays for models
const res = await client.market("weather-now", { city: "Lagos" });`,
      products: [["Marketplace", "/products/marketplace"], ["API creators", "/solutions/api-creators"]],
    },
    "team-budgets": {
      problem:
        "Teams running several agents, or giving staff AI tools, need to know who spent what and to stop runaway spend, without sharing one API key.",
      how: [
        "Create one mandate per agent or person, each with its own per-call limit, daily cap and allowed models.",
        "All payments come from the team wallet, but each mandate is tracked separately.",
        "Receipts and the mandate lookup show spend per mandate.",
        "Revoke a mandate when an agent is retired or someone leaves.",
      ],
      code: `for (const member of team) {
  await createMandate("${origin}", teamWallet, {
    maxPerCallUsd: 0.5, dailyCapUsd: member.dailyBudget,
    allowedModels: member.models, label: member.name,
  });
}`,
      products: [["Mandates", "/products/mandates"], ["Receipts", "/products/receipts"]],
    },
  };
}

function useCases(c: Context) {
  const body = `
    ${pageHero("Use cases", "What people build with Moltworld", "Pay-per-request AI works best where usage is uneven, automated or done by agents.")}
    <section class="wrap" style="padding-bottom:72px">
      ${linkCards(USE_CASES.map((u) => ({ title: u.title, text: u.summary, href: `/use-cases/${u.slug}`, cta: "Read the use case" })), 3)}
    </section>
    ${ctaBand("Have a different use case?", "Start in the Playground and see what each call would cost.")}`;
  return renderPage(c, { path: "/use-cases", title: "Use cases", description: "How teams and agents use Moltworld: allowances, model escalation, content pipelines, agent commerce and team budgets.", body });
}

function useCase(slug: string) {
  return (c: Context) => {
    const meta = USE_CASES.find((u) => u.slug === slug)!;
    const detail = useCaseDetails()[slug];
    const body = `
      ${pageHero("Use case", meta.title, esc(meta.summary))}
      <section class="block">
        <div class="wrap grid-2">
          <div class="prose">
            <h2 style="margin-top:0">The problem</h2>
            <p>${esc(detail.problem)}</p>
            <h2>How it works with Moltworld</h2>
            <ol>${detail.how.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
          </div>
          <div>
            <pre class="code" style="margin-top:0"><code>${esc(detail.code)}</code></pre>
            <div class="card" style="margin-top:16px">
              <h3>Built with</h3>
              <p>${detail.products.map(([label, href]) => `<a href="${href}">${esc(label)}</a>`).join(" and ")}</p>
            </div>
          </div>
        </div>
      </section>
      ${block(
        "More use cases",
        "",
        linkCards(USE_CASES.filter((u) => u.slug !== slug).slice(0, 3).map((u) => ({ title: u.title, text: u.summary, href: `/use-cases/${u.slug}`, cta: "Read the use case" })))
      )}
      ${ctaBand("Try it yourself", "Price the first request in the Playground.")}`;
    return renderPage(c, { path: `/use-cases/${slug}`, title: meta.title, description: meta.summary, body });
  };
}

// ---------------------------------------------------------------------------
// Playground and usage
// ---------------------------------------------------------------------------

function playground(c: Context) {
  const models = catalog();
  const body = `
    ${pageHero("Playground", "Price any request before you pay", "Choose a model and write a request. You'll see the exact price, the 402 response your client will receive, and code to make the call.")}
    <section class="wrap" style="padding-bottom:56px">${quoteWidget()}</section>
    ${block("Verify a receipt", `Paste a request id or receipt from a paid call. The signature is checked in your browser against <a href="/.well-known/moltworld-receipts.json">our published key</a>.`, receiptWidget(), "verify")}`;
  return renderPage(c, {
    path: "/playground",
    title: "Playground",
    description: "Price any Moltworld request, see its x402 payment terms, and get the code to make the call.",
    body,
    data: catalogScript(models),
  });
}

function usage(c: Context) {
  const body = `
    ${pageHero("Usage", "Usage from the public ledger", "These figures come from the gateway ledger and exclude our own wallets. Each settlement links to its Algorand transaction, so you can check every number on-chain.")}
    <section class="wrap" style="padding-bottom:24px">
      ${statsWidget()}
      <dl class="kv" style="margin-top:24px;max-width:520px">
        <dt>Paid requests, last 24h</dt><dd id="sPaid24">-</dd>
        <dt>Gross</dt><dd id="sGross">-</dd>
        <dt>Paid back as rebates</dt><dd id="sRebated">-</dd>
        <dt>Returning wallets</dt><dd id="sRepeat">-</dd>
      </dl>
    </section>
    ${block(
      "Recent settlements",
      "",
      `<div class="table-wrap"><table class="stack">
        <thead><tr><th>When</th><th>Model</th><th>Amount</th><th>Transaction</th></tr></thead>
        <tbody id="recentRows"><tr><td colspan="4">Loading</td></tr></tbody>
      </table></div>`
    )}`;
  return renderPage(c, { path: "/stats", title: "Usage", description: "Moltworld usage from the public ledger, with on-chain transaction links.", body });
}

/** Registers every page route and the shared assets. */
export function registerSite(app: Hono): string[] {
  const pages: Record<string, (c: Context) => Response> = {
    "/": home,
    "/products": products,
    "/products/gateway": gateway,
    "/models": modelsPage,
    "/products/mandates": mandates,
    "/products/marketplace": marketplace,
    "/products/receipts": receipts,
    "/solutions": solutions,
    "/solutions/agents": solutionsAgents,
    "/solutions/developers": solutionsDevelopers,
    "/solutions/api-creators": solutionsCreators,
    "/use-cases": useCases,
    "/playground": playground,
    "/stats": usage,
  };
  for (const u of USE_CASES) pages[`/use-cases/${u.slug}`] = useCase(u.slug);
  for (const [path, handler] of Object.entries(pages)) app.get(path, handler);
  app.get("/assets/site.css", handleCss);
  app.get("/assets/site.js", handleJs);
  return Object.keys(pages);
}
