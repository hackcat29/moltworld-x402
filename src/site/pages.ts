import type { Context, Hono } from "hono";
import { config } from "../config.js";
import { defaultModelRegistry } from "../models/registry.js";
import { quoteRequest, type ValidatedRequest } from "../pricing/index.js";
import { icon } from "./icons.js";
import { ASSET_NAMES, esc, handleAsset, renderPage } from "./layout.js";
import { agentTypes, PAYS_LABEL } from "./agents.js";
import { AUDIENCES, builtIn, PRODUCTS, WORKFLOWS } from "./nav.js";
import {
  catalog,
  CatalogEntry,
  catalogScript,
  catalogWidget,
  codeBlock,
  codeTabs,
  earningsWidget,
  logo,
  logoBand,
  mandateLookupWidget,
  marketWidget,
  MODALITY_LABEL,
  modelRails,
  payConfigScript,
  quoteWidget,
  receiptWidget,
  statsWidget,
  vendorName,
  vendors,
} from "./widgets.js";
import { mark } from "./brand.js";

const docs = () => config.docsUrl;
const network = () => (config.isMainnet ? "Algorand Mainnet" : "Algorand Testnet");
const share = () => 100 - config.marketplaceFeePercent;
const margin = () => Math.round(config.priceMargin * 100);
/** Whether this deployment caps mandates on-chain; copy only claims it when it is true. */
const onChainCap = () => config.mandateCounterAppId !== null;
const MODALITIES = ["chat", "image", "voice", "video"] as const;

/** Exact price of a request body for a model, or null when the model is not sold here. */
function quoteFor(slug: string, request: ValidatedRequest): string | null {
  const m = defaultModelRegistry.getModel(slug);
  if (!m || !catalog().some((c) => c.slug === slug)) return null;
  try {
    return quoteRequest(m, request).formattedPrice;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const btn = (href: string, label: string, kind: "primary" | "ghost" = "primary") =>
  `<a class="btn${kind === "ghost" ? " btn-ghost" : ""}" href="${esc(href)}" data-magnetic>${label}${kind === "primary" ? ` ${icon("arrow", 16)}` : ""}</a>`;

const arrowLink = (href: string, label: string) => `<a class="link-arrow" href="${esc(href)}">${label} ${icon("arrow", 16)}</a>`;

/** Section heading, with an optional action on the right instead of a subtitle. */
function secHead(title: string, action = ""): string {
  return `<div class="sec-head"><h2 data-split>${title}</h2>${action ? `<div data-reveal>${action}</div>` : ""}</div>`;
}

function pageHero(opts: { title: string; ctas?: string; visual?: string; crumbs?: Array<[string, string]> }): string {
  const crumbs = opts.crumbs
    ? `<nav class="crumbs" aria-label="Breadcrumb">${opts.crumbs.map(([l, h]) => `<a href="${esc(h)}">${esc(l)}</a>`).join(`<span aria-hidden="true">/</span>`)}</nav>`
    : "";
  return `
    <section class="page-hero">
      <div class="wrap page-hero-grid${opts.visual ? "" : " solo"}">
        <div>
          ${crumbs}
          <h1 data-split>${opts.title}</h1>
          ${opts.ctas ? `<div class="cta-row" data-reveal style="--d:3">${opts.ctas}</div>` : ""}
        </div>
        ${opts.visual ? `<div class="page-hero-visual" data-reveal style="--d:2">${opts.visual}</div>` : ""}
      </div>
    </section>`;
}

function sec(content: string, opts: { line?: boolean; id?: string } = {}): string {
  return `
    <section class="sec${opts.line === false ? "" : " line"}"${opts.id ? ` id="${opts.id}"` : ""}>
      <div class="wrap">${content}</div>
    </section>`;
}

function ctaFinal(title: string, ctas?: string): string {
  return `
    <section class="cta-final">
      <div class="orbit-deco" data-clip aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="wrap">
        <h2 data-split>${title}</h2>
        <div class="cta-row" data-reveal style="--d:2">${ctas ?? `${btn("/playground", "Open Playground")}${btn(`${docs()}/quickstart`, "Quickstart", "ghost")}`}</div>
      </div>
    </section>`;
}

/** Facts, each one sentence that stands on its own. */
function facts(items: Array<[string, string]>): string {
  return `<ul class="facts">${items.map(([ic, text], i) => `<li data-reveal style="--d:${i % 3}">${icon(ic, 22)}<span>${text}</span></li>`).join("")}</ul>`;
}

function linkCards(cards: Array<{ title: string; href: string; icon?: string }>, cols: 2 | 3 = 3): string {
  return `<div class="grid-${cols}">${cards
    .map(
      (c, i) =>
        `<a class="card link-card" href="${esc(c.href)}" data-reveal data-tilt style="--d:${i % 3}">${c.icon ? `<span class="card-ic">${icon(c.icon, 20)}</span>` : ""}<h3>${esc(c.title)}</h3><span class="go">${icon("arrow", 16)}</span></a>`
    )
    .join("")}</div>`;
}

const stepsList = (steps: string[]) => `<ol class="steps">${steps.map((t, i) => `<li style="--d:${i}"><strong>${t}</strong></li>`).join("")}</ol>`;

const PAYMENT_STEPS = [
  "Send a request. Get a 402 with its exact price.",
  "Sign one USDC transfer. No ALGO needed.",
  "Get the result. Failed media is refunded.",
  "Keep the signed receipt.",
];

function snippets(model = "gpt-4o") {
  const origin = config.publicDomain;
  return {
    mcp: `{
  "mcpServers": {
    "moltworld": {
      "command": "npx",
      "args": ["-y", "-p", "moltworld-sdk", "moltworld-mcp"],
      "env": { "MOLTWORLD_MANDATE": "<credential>", "MOLTWORLD_BUDGET_USD": "5" }
    }
  }
}

// The agent now has moltworld_chat, moltworld_image, moltworld_speech,
// moltworld_video and moltworld_quote, and pays within the mandate.`,
    claude: `claude mcp add -e MOLTWORLD_MANDATE=<credential> -e MOLTWORLD_BUDGET_USD=5 \\
  moltworld -- npx -y -p moltworld-sdk moltworld-mcp

# Discovery and quotes only, no wallet:
claude mcp add --transport http moltworld-remote ${origin}/mcp`,
    ts: `import { MoltworldClient } from "moltworld-sdk";

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
// Product demos (animated by site.js)
// ---------------------------------------------------------------------------

function termDemo(models: CatalogEntry[]): string {
  const m = models.find((x) => x.slug === "gpt-4o") ?? models.find((x) => x.modality === "chat") ?? models[0];
  const slug = m?.slug ?? "gpt-4o";
  const price = m?.from ?? "$0.003";
  return `<div class="term" data-term>
      <div class="term-bar" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="term-body"><span class="l t-cmd" data-wait="300">POST /v1/models/${esc(slug)}/chat/completions</span><span class="l t-402">&larr; 402 Payment Required &middot; ${esc(price)} USDC</span><span class="l t-cmd" data-wait="900">retry with Payment-Signature</span><span class="l t-ok">&larr; 200 OK &middot; settled on Algorand</span><span class="l t-ok">&larr; Moltworld-Receipt &check;</span><span class="l" data-wait="200"><span class="caret"></span></span></div>
    </div>`;
}

function meterDemo(): string {
  return `<div class="meter" data-meter data-reveal data-cap="5">
      <div class="meter-top"><span>Spent today</span><b data-spent>$0.00</b></div>
      <div class="meter-bar">${"<i></i>".repeat(20)}</div>
      <div class="limits"><span class="limit">per call <b>$0.25</b></span><span class="limit">daily cap <b>$5.00</b></span><span class="limit">expires <b>30 days</b></span></div>
      <div class="meter-actions"><button class="switch" type="button" role="switch" aria-checked="true" aria-label="Mandate active"></button><span data-state>active</span></div>
    </div>`;
}

function splitDemo(): string {
  const s = share();
  const dash = ((2 * Math.PI * 58 * s) / 100).toFixed(1);
  return `<div class="split-wrap" data-reveal>
      <svg class="split-ring" viewBox="0 0 150 150" role="img" aria-label="${s}% of each sale goes to the API seller"><circle class="bg" cx="75" cy="75" r="58"/><circle class="fg" cx="75" cy="75" r="58" style="--dash:${dash}"/><text x="75" y="84" text-anchor="middle">${s}%</text></svg>
      <div class="split-legend"><span><i></i>You</span><span><i class="o"></i>Moltworld, ${config.marketplaceFeePercent}%</span></div>
    </div>`;
}

function receiptDemo(): string {
  return `<div class="rcpt" data-receipt data-reveal>
      <div class="rcpt-row"><span>model</span><span>claude-sonnet-5</span></div>
      <div class="rcpt-row"><span>upstream</span><span>openrouter / anthropic</span></div>
      <div class="rcpt-row"><span>requestSha256</span><span data-scramble="9f2c41d07be3a85e">9f2c41d07be3a85e</span></div>
      <div class="rcpt-row"><span>responseSha256</span><span data-scramble="4ab7e0c93d1f6528">4ab7e0c93d1f6528</span></div>
      <div class="rcpt-row"><span>sig</span><span data-scramble="e1d8a05c7f3b9264">e1d8a05c7f3b9264</span></div>
      <span class="stamp">${icon("check", 14)} verified</span>
    </div>`;
}

function chatDemo(models: CatalogEntry[]): string {
  const video = models.find((m) => m.slug === "veo-3.1-fast") ?? models.find((m) => m.modality === "video");
  const slug = video?.slug ?? "veo-3.1-fast";
  const durations = video?.durations ?? [6];
  const dur = durations.includes(6) ? 6 : durations[0];
  const price = quoteFor(slug, { prompt: "Product teaser", duration: dur } as ValidatedRequest) ?? video?.from ?? "a few cents";
  return `<div class="chat" data-chat data-reveal>
      <div class="chat-head">Example session</div>
      <div class="msg user" data-step data-wait="300">Make a ${dur}-second teaser for tomorrow's launch.</div>
      <div class="tool" data-step><span class="fn">moltworld_quote</span>({ model: "${esc(slug)}", duration: ${dur} })<br>&rarr; ${esc(price)} USDC</div>
      <div class="tool" data-step data-wait="900"><span class="fn">moltworld_video</span>({ model: "${esc(slug)}", prompt: "&hellip;" })<br>&rarr; <span class="ok">paid</span> &middot; job queued</div>
      <div class="tool" data-step data-wait="1100">receipt &middot; <span class="ok">signature valid</span> &middot; ${esc(network())}</div>
      <div class="msg bot" data-step>Done for ${esc(price)}. Clip and receipt attached.</div>
      <div class="typing hidden" aria-hidden="true"><i></i><i></i><i></i></div>
    </div>`;
}

const WORLD_FALLBACK = `<svg viewBox="0 0 400 400" aria-hidden="true" fill="none" stroke="currentColor" style="color:var(--line-2)"><circle cx="200" cy="200" r="150"/><ellipse cx="200" cy="200" rx="60" ry="150"/><ellipse cx="200" cy="200" rx="115" ry="150"/><path d="M50 200h300M70 125h260M70 275h260"/><ellipse cx="200" cy="200" rx="190" ry="54" transform="rotate(-18 200 200)" stroke-dasharray="3 6"/><circle cx="352" cy="148" r="6" fill="var(--signal)" stroke="none"/></svg>`;

function flowBand(): string {
  const left = Array.from({ length: 9 }, (_, i) => { const y = 30 + i * 42.5; return `<path class="in" d="M0 ${y} C 260 ${y}, 360 200, 500 200"/>`; }).join("");
  const lanes = [70, 155, 245, 330];
  const right = lanes.map((y, i) => `<path class="out o${i}" d="M500 200 C 640 200, 700 ${y}, 1000 ${y}"/>`).join("");
  return `<div class="flow" data-reveal>
      <svg class="flow-fallback" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true">${left}${right}</svg>
      <canvas id="flow" role="img" aria-label="Requests pass through the x402 gate and fan out to chat, image, voice and video models"></canvas>
      <span class="flow-gate" aria-hidden="true"></span>
      <span class="flow-label c" aria-hidden="true">x402</span>
      <div class="flow-lanes" aria-hidden="true">${(["video", "voice", "image", "chat"] as const)
        .map((k, i) => `<span style="top:${(18.5 + i * 21).toFixed(1)}%">${MODALITY_LABEL[k]}<i style="background:var(--${k})"></i></span>`)
        .join("")}</div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function home(c: Context) {
  const models = catalog();
  const s = snippets();
  const body = `
    <section class="hero">
      <div class="wrap hero-grid">
        <div class="hero-copy">
          <h1 data-split>Every AI model, <em>paid per request.</em></h1>
          <div class="cta-row" data-reveal style="--d:4">
            ${btn("/playground", "Open Playground")}
            <span class="cmd"><b>npm i moltworld-sdk</b><button type="button" class="icon-btn" data-copy="npm i moltworld-sdk" aria-label="Copy install command">${icon("copy", 15)}</button></span>
          </div>
        </div>
        <div class="hero-visual" data-clip>
          <div class="world-fallback">${WORLD_FALLBACK}</div>
          <canvas id="world" role="img" aria-label="Globe of payments settling between agents and models. Drag to spin, tap to send a request."></canvas>
        </div>
      </div>
    </section>

    ${logoBand(models)}

    ${sec(`
      ${secHead("AI is sold by the seat. <em>Agents don't have seats.</em>")}
      <ul class="problems">
        <li data-reveal>Whoever holds a key spends the account.</li>
        <li data-reveal style="--d:1">Credits and plans are prepaid to the provider.</li>
        <li data-reveal style="--d:2">Dashboards can't prove what ran.</li>
      </ul>
      <p class="answer" data-reveal>Moltworld prices every request with HTTP 402. <em>Anything with a wallet can pay.</em></p>
    `)}

    ${sec(`
      ${secHead("Three products. <em>Proof on every call.</em>", arrowLink("/products", "All products"))}
      <div class="bento">
        <a class="tile wide" href="/products/gateway" data-reveal>
          <div class="tile-head"><h3>Gateway</h3><span class="go">${icon("arrow", 16)}</span></div>
          <div class="tile-visual">${termDemo(models)}</div>
        </a>
        <a class="tile narrow" href="/products/mandates" data-reveal style="--d:1">
          <div class="tile-head"><h3>Mandates</h3><span class="go">${icon("arrow", 16)}</span></div>
          <div class="tile-visual">${meterDemo()}</div>
        </a>
        <a class="tile narrow" href="/products/marketplace" data-reveal>
          <div class="tile-head"><h3>Marketplace</h3><span class="go">${icon("arrow", 16)}</span></div>
          <div class="tile-visual">${splitDemo()}</div>
        </a>
        <a class="tile wide" href="/products/receipts" data-reveal style="--d:1">
          <div class="tile-head"><h3>Receipts</h3><span class="go">${icon("arrow", 16)}</span></div>
          <div class="tile-visual">${receiptDemo()}</div>
        </a>
      </div>
    `)}

    ${sec(`
      ${secHead("Request to receipt <em>in one round trip.</em>")}
      ${flowBand()}
      ${stepsList(PAYMENT_STEPS)}
    `)}

    ${sec(`
      ${secHead("Every model. <em>Priced per call.</em>", arrowLink("/models", "All models"))}
      <div class="mod-row">
        ${MODALITIES.map(
          (k, i) =>
            `<a class="mod dot-${k}" href="/models?type=${k}" data-reveal style="--d:${i}"><div class="k"><i></i>${MODALITY_LABEL[k]}</div><div class="lab-stack">${vendors(models.filter((m) => m.modality === k)).slice(0, 4).map((v) => `<span title="${esc(vendorName(v))}">${logo(v)}</span>`).join("")}</div><div class="bars" aria-hidden="true">${[0, 1, 2, 3].map((j) => `<b style="--j:${j + i}"></b>`).join("")}</div></a>`
        ).join("")}
      </div>
    `)}
    <div class="rails-band">${modelRails(models)}</div>

    ${sec(`
      <div class="agent-grid">
        <div>
          <h2 data-split>Built for software <em>that spends money.</em></h2>
          <ul class="feature-list" data-reveal>
            <li>${icon("plug", 20)}<b>Remote and local MCP servers</b></li>
            <li>${icon("mandate", 20)}<b>Mandates bound to the agent's own key</b></li>
            <li>${icon("globe", 20)}<b>A2A agent card and llms.txt</b></li>
          </ul>
          <div class="cta-row" data-reveal>${btn("/solutions/agents", "Connect your agent")}${btn(`${docs()}/agents/mcp`, "MCP docs", "ghost")}</div>
        </div>
        ${chatDemo(models)}
      </div>
    `)}

    ${sec(`
      <div class="dev-grid">
        <div>
          <h2 data-split>One config for agents. <em>A few lines for apps.</em></h2>
          <div class="sdk-list" data-reveal>
            <a class="sdk" href="${docs()}/agents/mcp">${icon("plug", 20)}<b>MCP servers</b>${icon("arrow", 16)}</a>
            <a class="sdk" href="${docs()}/sdks/typescript">${icon("package", 20)}<b>TypeScript SDK</b>${icon("arrow", 16)}</a>
            <a class="sdk" href="${docs()}/sdks/python">${icon("package", 20)}<b>Python SDK</b>${icon("arrow", 16)}</a>
            <a class="sdk" href="${docs()}/api-reference/introduction">${icon("braces", 20)}<b>HTTP API reference</b>${icon("arrow", 16)}</a>
          </div>
        </div>
        <div data-reveal style="--d:2">${codeTabs("hero", [["mcp", "MCP", s.mcp, "json"], ["claude", "Claude Code", s.claude, "sh"], ["ts", "TypeScript", s.ts], ["py", "Python", s.py], ["curl", "curl", s.curl]])}</div>
      </div>
    `)}

    ${sec(`
      ${secHead("A wallet <em>instead of an account.</em>")}
      <div class="compare" data-reveal role="table" aria-label="Moltworld compared with API keys and plans">
        <div class="compare-row head" role="row"><div role="columnheader"></div><div class="us" role="columnheader">Moltworld</div><div role="columnheader">API keys and plans</div></div>
        ${[
          ["Sign-up", "None. A wallet is enough", "An account per provider"],
          ["Your money", "In your wallet until each call settles", "Prepaid to the provider, or billed later"],
          ["Spending limits enforced by", "Algorand, plus the gateway", "The provider's servers"],
          ["A leaked credential", "Can't pay without the agent's own key", "Spends up to the key's limit"],
          ["If the provider is compromised", "Can't take more than each call's on-chain cap", "Your balance is at its discretion"],
          ["Failed generations", "Free or refunded on-chain", "Depends on the provider"],
          ["Proof of each call", "Signed receipt and on-chain settlement", "Usage logs"],
          ["Selling your API", `Built in, ${share()}% to you`, "Build billing yourself"],
        ]
          .map(([k, us, them]) => `<div class="compare-row" role="row"><div role="rowheader">${k}</div><div class="us" role="cell">${icon("check", 16)}${us}</div><div role="cell">${them}</div></div>`)
          .join("")}
      </div>
    `)}

    ${sec(`
      ${secHead("Every number <em>is on-chain.</em>", arrowLink("/stats", "Live network"))}
      ${statsWidget()}
    `)}

    ${sec(`
      ${secHead("Every kind of agent. <em>One wallet.</em>", arrowLink("/use-cases", "All use cases"))}
      <div class="rail" data-reveal>
        ${agentTypes().map((t) => agentCard(t)).join("")}
      </div>
    `)}

    ${sec(faq())}

    ${ctaFinal("Stop managing keys. <em>Pay per call.</em>")}`;
  return renderPage(c, {
    path: "/",
    title: "Moltworld | Every AI model, paid per request",
    description: `The pay-per-request gateway for AI. Every chat, image, voice and video model, paid per call in USDC on Algorand through x402. No accounts, no API keys, signed receipts.`,
    body,
    data: catalogScript(models),
  });
}

function faq(): string {
  const qa: Array<[string, string]> = [
    ["Do I need an account or ALGO?", "No. You need a wallet with USDC on Algorand. The x402 facilitator pays the network fee, and there is nothing to sign up for."],
    ["How is a request priced?", `From the request itself: input tokens plus <code>max_tokens</code> for chat, images, characters or seconds for media, at the upstream's live rate plus a ${margin()}% margin (minimum $${config.priceMinFloor}). <code>POST /v1/quote</code> returns the same price for free.`],
    ["What if a model fails?", "Chat settles only after the answer exists. Image, voice and video settle first and are refunded on-chain automatically if the model fails, or if a video job doesn't finish."],
    ["Am I charged for unused tokens?", "Chat is authorized for its full <code>max_tokens</code> budget. The part the model didn't use is credited back and paid out in USDC."],
    ["Which clients can pay?", "Any x402 client that supports Algorand's exact scheme, the TypeScript and Python SDKs, or an agent through the remote or local MCP server."],
    [
      "How do agents spend safely?",
      `With a mandate: a small Algorand program that can only pay Moltworld, only up to a per-call limit, only until it expires, and only with a signature from the agent's own key, which never leaves the agent. ${
        onChainCap() ? "Its daily cap is enforced on-chain by an immutable spend counter. The gateway adds" : "The gateway adds a daily cap,"
      } a model list and instant revocation.`,
    ],
    [
      "How is a mandate different from an API key with a limit?",
      `An API key is a bearer secret to a balance the provider holds, and its limits live in the provider's database. A mandate leaves the money in your wallet, its per-call cap, payee and expiry${
        onChainCap() ? ", and its daily cap," : ""
      } are enforced by Algorand, and the credential is useless without the agent's key. Every call settles on-chain with a signed receipt.`,
    ],
    ["Is it open source?", `Yes. The gateway, SDKs and docs are MIT licensed on <a href="https://github.com/hackcat29/moltworld-x402">GitHub</a>.`],
  ];
  return `<div class="faq">
      <h2 data-split>Questions.</h2>
      <div data-reveal>${qa.map(([q, a], i) => `<details class="qa"${i === 0 ? " open" : ""}><summary>${q}</summary><div class="ans"><p>${a}</p></div></details>`).join("")}</div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

function products(c: Context) {
  const models = catalog();
  const visual: Record<string, string> = { "/products/gateway": termDemo(models), "/products/mandates": meterDemo(), "/products/marketplace": splitDemo() };
  const claim: Record<string, string> = {
    "/products/gateway": "One API for every model, <em>paid per call.</em>",
    "/products/mandates": "Budgets agents <em>can't exceed.</em>",
    "/products/marketplace": `Sell your API per call. <em>Keep ${share()}%.</em>`,
  };
  const [receiptsLink, refundsLink] = builtIn();
  const body = `
    ${pageHero({ title: "The payment layer <em>for AI.</em>", ctas: `${btn("/playground", "Open Playground")}${btn("/models", "Models", "ghost")}` })}
    <section><div class="wrap">
      ${PRODUCTS.map(
        (p) => `<div class="prow">
          <div data-reveal><h2>${claim[p.href]}</h2>${arrowLink(p.href, esc(p.label))}</div>
          <div class="prow-visual" data-reveal style="--d:1">${visual[p.href]}</div>
        </div>`
      ).join("")}
    </div></section>
    ${sec(`
      ${secHead("Built into <em>every call.</em>")}
      <div class="grid-2">
        <div data-reveal>${receiptDemo()}</div>
        ${facts([
          ["receipt", `A <a href="${receiptsLink.href}">signed receipt</a> ties the payment to the exact request and response.`],
          ["refund", `Failed media is <a href="${refundsLink.href}">refunded on-chain</a>.`],
          ["wallet", "Unused chat tokens are paid back in USDC."],
          ["shield", "Retries never charge twice."],
        ])}
      </div>
    `)}
    ${ctaFinal("See it work <em>in seconds.</em>")}`;
  return renderPage(c, { path: "/products", title: "Products", description: "Moltworld's products: the gateway, mandates for agents and the marketplace, with signed receipts, refunds and rebates built into every call.", body });
}

function gateway(c: Context) {
  const models = catalog();
  const s = snippets();
  const body = `
    ${pageHero({
      crumbs: [["Product", "/products"]],
      title: "One API for every model, <em>paid per call.</em>",
      ctas: `${btn("/playground", "Open Playground")}${btn("/models", "Models", "ghost")}`,
      visual: termDemo(models),
    })}
    ${sec(`
      ${secHead("Priced from <em>the request itself.</em>", arrowLink("/pricing", "Pricing"))}
      ${facts([
        ["tag", "Every request is quoted from what you send. <code>POST /v1/quote</code> is free."],
        ["layers", `Upstream cost plus ${margin()}%, minimum $${config.priceMinFloor} per call.`],
        ["refund", "Chat is charged after the answer. Failed media is refunded on-chain."],
        ["wallet", "Unused chat tokens are paid back in USDC."],
        ["shield", "Retrying a payment returns the original response, never a second charge."],
        ["users", "Parallel calls can't spend more than the wallet holds."],
      ])}
    `)}
    ${sec(`
      ${secHead("Endpoints.")}
      <div class="table-wrap" data-reveal><table class="stack">
        <thead><tr><th>Type</th><th>Endpoint</th><th>Priced by</th><th>Charged</th></tr></thead>
        <tbody>
          <tr><td data-label="Type">Chat</td><td data-label="Endpoint"><code>/v1/models/{model}/chat/completions</code></td><td data-label="Priced by">Input tokens + max_tokens</td><td data-label="Charged">After the answer</td></tr>
          <tr><td data-label="Type">Image</td><td data-label="Endpoint"><code>/v1/models/{model}/images/generations</code></td><td data-label="Priced by">Images</td><td data-label="Charged">First, refunded on failure</td></tr>
          <tr><td data-label="Type">Voice</td><td data-label="Endpoint"><code>/v1/models/{model}/audio/speech</code></td><td data-label="Priced by">Characters</td><td data-label="Charged">First, refunded on failure</td></tr>
          <tr><td data-label="Type">Video</td><td data-label="Endpoint"><code>/v1/models/{model}/videos/generations</code> &rarr; <code>/v1/jobs/{id}</code></td><td data-label="Priced by">Seconds</td><td data-label="Charged">First, refunded if the job fails</td></tr>
        </tbody></table></div>
    `)}
    ${sec(`<div class="dev-grid"><h2 data-split>Start <em>in a few lines.</em></h2><div data-reveal>${codeTabs("gw", [["mcp", "MCP", s.mcp, "json"], ["claude", "Claude Code", s.claude, "sh"], ["ts", "TypeScript", s.ts], ["py", "Python", s.py], ["curl", "curl", s.curl]])}</div></div>`)}
    ${sec(`${secHead("How a call <em>gets paid.</em>")}${flowBand()}${stepsList(PAYMENT_STEPS)}`)}
    ${ctaFinal("Try a model <em>now.</em>")}`;
  return renderPage(c, { path: "/products/gateway", title: "Gateway", description: "One API for chat, image, voice and video models, paid per request in USDC through x402.", body });
}

function modelsPage(c: Context) {
  const models = catalog();
  const vs = vendors(models).slice(0, 10);
  const orbit = `<div class="orbit3d" data-clip aria-hidden="true">
      <div class="core">${mark(54)}</div>
      <div class="ring">${vs.map((v, i) => `<span class="node" style="--a:${((360 / vs.length) * i).toFixed(1)}deg" title="${esc(vendorName(v))}">${logo(v)}</span>`).join("")}</div>
    </div>`;
  const body = `
    ${pageHero({
      title: "Every model, <em>priced per request.</em>",
      ctas: `${btn("/playground", "Open Playground")}${btn("/v1/models", "Catalog JSON", "ghost")}`,
      visual: orbit,
    })}
    <section class="sec" style="padding-top:48px"><div class="wrap">${catalogWidget(models)}</div></section>
    ${ctaFinal("Price your <em>exact request.</em>")}`;
  return renderPage(c, { path: "/models", title: "Models", description: "Moltworld model catalog with upstream ids, limits and per-request prices. Models a provider can't confirm are not sold.", body });
}

function mandates(c: Context) {
  const origin = config.publicDomain;
  const body = `
    ${pageHero({
      crumbs: [["Product", "/products"]],
      title: "Let an agent spend, <em>within limits.</em>",
      ctas: `${btn(`${docs()}/products/mandates`, "Create a mandate")}${btn("/use-cases/agent-allowance", "Use case", "ghost")}`,
      visual: meterDemo(),
    })}
    ${sec(`
      ${secHead("Two layers <em>of enforcement.</em>")}
      <div class="split-table">
        <div class="enforce" data-reveal><h3>${icon("shield", 20)} Algorand</h3><ul><li>Pays only Moltworld, only USDC</li><li>Maximum per call</li><li>Co-signed by the agent's own key</li>${onChainCap() ? "<li>Daily cap, by the spend counter</li>" : ""}<li>Zero fee, no rekey, expiry round</li></ul></div>
        <div class="enforce" data-reveal style="--d:1"><h3>${icon("gateway", 20)} Gateway</h3><ul><li>${onChainCap() ? "Rolling 24-hour cap, a second check" : "Rolling 24-hour cap"}</li><li>Allowed models</li><li>Instant revocation</li><li>Spend per mandate</li></ul></div>
      </div>
    `)}
    ${sec(`
      ${secHead("Create one <em>in a few lines.</em>")}
      <div class="grid-2">
        <div data-reveal>${codeTabs("mandate", [
          [
            "key",
            "1. Agent key",
            `# On the agent's machine. The key stays there; only the address is shared.
npx -y -p moltworld-sdk moltworld-mcp keygen
# -> AGENTADDRESS...   (saved to ~/.moltworld/agent.key)`,
            "sh",
          ],
          [
            "owner",
            "2. Owner",
            `import algosdk from "algosdk";
import { createMandate } from "moltworld-sdk";

const owner = algosdk.mnemonicToSecretKey(process.env.OWNER_MNEMONIC);
// The SDK checks the program against these limits before you sign it.
const { mandateId, credential } = await createMandate("${origin}", owner, {
  agent: "AGENTADDRESS...", // every payment must be co-signed by this key
  maxPerCallUsd: 0.25,
  dailyCapUsd: 5,
  validDays: 30,
  allowedModels: ["gpt-4o", "claude-sonnet-5"],
});`,
            "ts",
          ],
          [
            "agent",
            "3. Agent",
            `import { MoltworldClient } from "moltworld-sdk";

// The credential alone can't pay: the agent's own key co-signs every payment.
const agent = new MoltworldClient({ mandate: credential, agentKey: process.env.AGENT_KEY });
await agent.chat("gpt-4o", {
  messages: [{ role: "user", content: "Draft a reply" }],
});`,
            "ts",
          ],
          ["revoke", "Revoke", `import { revokeMandate } from "moltworld-sdk";

// Stops all spending: the program can only pay Moltworld.
await revokeMandate("${origin}", owner, mandateId);`, "ts"],
        ])}</div>
        <div data-reveal style="--d:1">${mandateLookupWidget()}</div>
      </div>
    `)}
    ${ctaFinal("Give your agent <em>a budget.</em>")}`;
  return renderPage(c, { path: "/products/mandates", title: "Mandates", description: "Delegated spending for AI agents: per-call limit and expiry on-chain, daily cap and model list on the gateway, revocable at any time.", body });
}

function marketplace(c: Context) {
  const origin = config.publicDomain;
  const body = `
    ${pageHero({
      crumbs: [["Product", "/products"]],
      title: `Sell your API per call. <em>Keep ${share()}%.</em>`,
      ctas: `${btn(`${docs()}/products/marketplace`, "List your API")}${btn("/solutions/api-creators", "For API sellers", "ghost")}`,
      visual: splitDemo(),
    })}
    ${sec(`
      ${secHead("From listing <em>to payout.</em>")}
      ${stepsList([
        "Sign a listing with your Algorand wallet.",
        "We review the endpoint.",
        "Buyers pay per call through x402.",
        `Payouts in USDC once you pass $${config.creatorPayoutMinUsd}.`,
      ])}
    `)}
    ${sec(`<div class="grid-2"><div data-reveal>${marketWidget()}</div><div data-reveal style="--d:1">${earningsWidget()}</div></div>`)}
    ${sec(`
      ${secHead("Create a listing.")}
      <div data-reveal>${codeBlock(`const listing = {
  action: "list",
  creator: wallet.addr.toString(), // payouts can only go here
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
});
// Buyers call ${origin}/v1/market/weather-now/call`)}</div>
    `)}
    ${ctaFinal("Turn your API <em>into revenue.</em>")}`;
  return renderPage(c, { path: "/products/marketplace", title: "Marketplace", description: "Sell your own API through Moltworld's x402 checkout and get paid per call in USDC.", body });
}

function receipts(c: Context) {
  const fields: Array<[string, string]> = [
    ["<code>txid</code>", "Algorand transaction that settled the payment"],
    ["<code>payer</code>, <code>amountMicro</code>", "Who paid, and how much in micro-USDC"],
    ["<code>upstreamProvider</code>, <code>upstreamModel</code>", "The model that actually answered"],
    ["<code>requestSha256</code>", "Hash of the request body you sent"],
    ["<code>responseSha256</code>", "Hash of the exact response bytes"],
    ["<code>rebateMicro</code>", "Unused chat budget paid back"],
    ["<code>kid</code>, <code>sig</code>", "Ed25519 key id and signature"],
  ];
  const body = `
    ${pageHero({
      crumbs: [["Product", "/products"]],
      title: "Proof of what you paid for <em>and what you got.</em>",
      ctas: `${btn("#verify", "Verify a receipt")}${btn("/.well-known/moltworld-receipts.json", "Signing keys", "ghost")}`,
      visual: receiptDemo(),
    })}
    ${sec(`
      ${secHead("Every paid response <em>carries one.</em>", arrowLink(`${docs()}/concepts/receipts`, "Receipt docs"))}
      <ul class="anatomy-list" data-reveal>${fields.map(([f, d]) => `<li><span>${f}</span><span>${d}</span></li>`).join("")}</ul>
    `)}
    ${sec(`${secHead("Verify <em>a receipt.</em>")}<div data-reveal>${receiptWidget()}</div>`, { id: "verify" })}
    ${ctaFinal("Every call <em>comes with proof.</em>")}`;
  return renderPage(c, { path: "/products/receipts", title: "Receipts", description: "Ed25519-signed receipts that tie each payment to the exact request and response.", body });
}

// ---------------------------------------------------------------------------
// Pricing and developers
// ---------------------------------------------------------------------------

function pricing(c: Context) {
  const models = catalog();
  const examples = ["gpt", "claude-sonnet-5", "gemini", "flux-2-pro", "eleven-multilingual", "veo-3.1-fast"]
    .map((slug) => models.find((m) => m.slug === slug))
    .filter((m): m is CatalogEntry => !!m);
  const reference: Record<string, string> = { chat: "Short prompt, 256 max_tokens", image: "One image", voice: "One sentence", video: "Shortest clip" };
  const body = `
    ${pageHero({
      title: "Pay for the request. <em>Nothing else.</em>",
      ctas: `${btn("/playground", "Price a request")}${btn(`${docs()}/concepts/pricing`, "Pricing docs", "ghost")}`,
    })}
    ${sec(`
      <div class="formula" data-reveal role="img" aria-label="Price equals upstream cost times ${(1 + config.priceMargin).toFixed(2)}, with a minimum of $${config.priceMinFloor} per call">
        <span class="term-box">Upstream cost</span><span class="op">&times;</span><span class="term-box">${(1 + config.priceMargin).toFixed(2)}</span><span class="op">min</span><span class="term-box">$${config.priceMinFloor}</span>
      </div>
    `, { line: false })}
    ${sec(`
      ${secHead("Never billed.")}
      <div class="free-list">
        ${["Accounts and plans", "Quotes and 402 challenges", "Failed generations", "Unused chat tokens"].map((t, i) => `<div class="free" data-reveal style="--d:${i}"><b>$0</b><span>${t}</span></div>`).join("")}
      </div>
    `)}
    ${sec(`
      ${secHead("What a call <em>costs today.</em>", arrowLink("/models", "All models"))}
      <div class="table-wrap" data-reveal><table class="stack">
        <thead><tr><th>Model</th><th>Type</th><th>Request</th><th>Price</th><th><span class="sr-only">Action</span></th></tr></thead>
        <tbody>${examples
          .map(
            (m) =>
              `<tr><td data-label="Model">${esc(m.name)}</td><td data-label="Type">${MODALITY_LABEL[m.modality]}</td><td data-label="Request">${reference[m.modality]}</td><td data-label="Price"><strong>${esc(m.from)}</strong></td><td data-label=""><a class="link-arrow" href="/playground?model=${encodeURIComponent(m.slug)}">Price yours ${icon("arrow", 14)}</a></td></tr>`
          )
          .join("")}</tbody>
      </table></div>
    `)}
    ${sec(`
      ${secHead("Selling <em>on the marketplace.</em>")}
      <div class="grid-2">
        <div data-reveal>${splitDemo()}</div>
        ${facts([
          ["tag", "You set the price per call."],
          ["wallet", `${share()}% goes to you, ${config.marketplaceFeePercent}% to Moltworld.`],
          ["refund", `Batched USDC payouts from $${config.creatorPayoutMinUsd}.`],
        ])}
      </div>
    `)}
    ${ctaFinal("See the price <em>before you pay.</em>")}`;
  return renderPage(c, { path: "/pricing", title: "Pricing", description: `Pay per request: upstream cost plus a published ${margin()}% margin, no plans or seats, failed calls refunded and unused tokens paid back.`, body });
}

function developers(c: Context) {
  const origin = config.publicDomain;
  const s = snippets();
  const body = `
    ${pageHero({
      title: "Everything you need <em>to build.</em>",
      ctas: `${btn(`${docs()}/quickstart`, "Quickstart")}${btn("/playground", "Playground", "ghost")}`,
      visual: codeTabs("dev", [["mcp", "MCP", s.mcp, "json"], ["claude", "Claude Code", s.claude, "sh"], ["ts", "TypeScript", s.ts], ["py", "Python", s.py], ["curl", "curl", s.curl]]),
    })}
    ${sec(`
      ${secHead("First call <em>in minutes.</em>")}
      ${stepsList(["Fund a wallet with USDC.", "<code>npm i moltworld-sdk</code>", "Set a per-request cap.", "Call any model."])}
    `)}
    ${sec(`
      ${secHead("Tools.")}
      ${linkCards([
        { title: "TypeScript SDK", href: `${docs()}/sdks/typescript`, icon: "package" },
        { title: "Python SDK", href: `${docs()}/sdks/python`, icon: "package" },
        { title: "MCP servers", href: `${docs()}/agents/mcp`, icon: "plug" },
        { title: "API reference", href: `${docs()}/api-reference/introduction`, icon: "braces" },
        { title: "Playground", href: "/playground", icon: "play" },
        { title: "Live network", href: "/stats", icon: "pulse" },
      ])}
    `)}
    ${sec(`
      ${secHead("Machine-readable <em>by default.</em>")}
      <div class="table-wrap" data-reveal><table class="stack">
        <thead><tr><th>Endpoint</th><th>Contents</th></tr></thead>
        <tbody>
          ${[
            ["/llms.txt", "The service, written for language models"],
            ["/v1/models", "Catalog with upstream ids, cost basis and prices"],
            ["/.well-known/x402", "x402 resource descriptor"],
            ["/.well-known/agent-card.json", "A2A agent card"],
            ["/.well-known/moltworld-receipts.json", "Receipt signing keys"],
            ["/mcp", "Remote MCP server, streamable HTTP"],
            ["/health", "Readiness and network"],
          ]
            .map(([p, d]) => `<tr><td data-label="Endpoint"><a href="${p}"><code>${origin}${p}</code></a></td><td data-label="Contents">${d}</td></tr>`)
            .join("")}
        </tbody></table></div>
    `)}
    ${ctaFinal("Build with <em>Moltworld.</em>")}`;
  return renderPage(c, { path: "/developers", title: "Developers", description: "Moltworld SDKs, API reference, MCP servers and discovery endpoints for apps and agents.", body });
}

// ---------------------------------------------------------------------------
// Solutions
// ---------------------------------------------------------------------------

function solutions(c: Context) {
  const body = `
    ${pageHero({ title: "Built for agents, apps <em>and API sellers.</em>" })}
    ${sec(`${secHead("By customer.")}${linkCards(AUDIENCES.map((a) => ({ title: a.label, href: a.href, icon: a.icon })))}`)}
    ${sec(`${secHead("By workflow.", arrowLink("/use-cases", "Use cases by agent"))}${linkCards(WORKFLOWS.map((u) => ({ title: u.title, href: `/solutions/${u.slug}`, icon: "spark" })))}`)}
    ${ctaFinal("Start <em>in the Playground.</em>")}`;
  return renderPage(c, { path: "/solutions", title: "Solutions", description: "Moltworld for AI agents, app developers and API sellers.", body });
}

function solutionsAgents(c: Context) {
  const origin = config.publicDomain;
  const models = catalog();
  const tools: Array<[string, string]> = [
    ["moltworld_quote", "Exact price of a request"],
    ["moltworld_chat", "Paid chat; unused tokens paid back"],
    ["moltworld_image", "Paid image; refunded on failure"],
    ["moltworld_speech", "Paid text-to-speech"],
    ["moltworld_video", "Paid video; can wait for the result"],
    ["moltworld_spend", "Wallet and spend this session"],
  ];
  const body = `
    ${pageHero({
      crumbs: [["Solutions", "/solutions"]],
      title: "Give your agent models it doesn't have, <em>with a budget.</em>",
      ctas: `${btn(`${docs()}/agents/mcp`, "Connect your agent")}${btn("/use-cases/agent-allowance", "Use case", "ghost")}`,
      visual: chatDemo(models),
    })}
    ${sec(`
      ${secHead("Two ways <em>to connect.</em>")}
      <div class="table-wrap" data-reveal><table class="stack">
        <thead><tr><th><span class="sr-only">Property</span></th><th>Remote MCP</th><th>Local MCP</th></tr></thead>
        <tbody>
          <tr><td data-label="">Address</td><td data-label="Remote"><code>${origin}/mcp</code></td><td data-label="Local"><code>moltworld-mcp</code></td></tr>
          <tr><td data-label="">Holds</td><td data-label="Remote">Nothing</td><td data-label="Local">A mandate credential and its own agent key, never the owner's key</td></tr>
          <tr><td data-label="">Can</td><td data-label="Remote">List, quote, relay requests you signed</td><td data-label="Local">Pay for chat, image, voice and video</td></tr>
          <tr><td data-label="">For</td><td data-label="Remote">Discovery, or a person approving each payment</td><td data-label="Local">Agents that run on their own</td></tr>
        </tbody></table></div>
    `)}
    ${sec(`
      ${secHead("Drop-in <em>configuration.</em>", arrowLink(`${docs()}/agents/mcp`, "Framework docs"))}
      <div data-reveal>${codeTabs("agents", [
        [
          "hermes",
          "Hermes Agent",
          `# ~/.hermes/config.yaml
mcp_servers:
  moltworld:
    command: npx
    args: ["-y", "-p", "moltworld-sdk", "moltworld-mcp"]
    env:
      MOLTWORLD_MANDATE: "<credential from createMandate()>"
      MOLTWORLD_MAX_PER_REQUEST_USD: "0.25"
      MOLTWORLD_BUDGET_USD: "5"`,
          "sh",
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
        "args": ["-y", "-p", "moltworld-sdk", "moltworld-mcp"],
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
          "json",
        ],
        [
          "claude",
          "Claude Code",
          `claude mcp add --transport http moltworld ${origin}/mcp

# Paid calls with a mandate:
claude mcp add -e MOLTWORLD_MANDATE=<credential> -e MOLTWORLD_BUDGET_USD=5 \\
  moltworld-wallet -- npx -y -p moltworld-sdk moltworld-mcp`,
          "sh",
        ],
        [
          "a2a",
          "A2A",
          `# Agent card
curl -s ${origin}/.well-known/agent-card.json

# JSON-RPC endpoint
POST ${origin}/a2a`,
          "sh",
        ],
        [
          "json",
          "Any MCP client",
          `{
  "mcpServers": {
    "moltworld": { "type": "http", "url": "${origin}/mcp" },
    "moltworld-wallet": {
      "command": "npx",
      "args": ["-y", "-p", "moltworld-sdk", "moltworld-mcp"],
      "env": { "MOLTWORLD_MANDATE": "<credential>", "MOLTWORLD_BUDGET_USD": "5" }
    }
  }
}`,
          "json",
        ],
      ])}</div>
    `)}
    ${sec(`
      ${secHead("Tools <em>the agent gets.</em>")}
      <div class="table-wrap" data-reveal><table class="stack">
        <thead><tr><th>Tool</th><th>Does</th></tr></thead>
        <tbody>${tools.map(([t, d]) => `<tr><td data-label="Tool"><code>${t}</code></td><td data-label="Does">${d}</td></tr>`).join("")}</tbody>
      </table></div>
    `)}
    ${ctaFinal("Connect <em>your agent.</em>")}`;
  return renderPage(c, { path: "/solutions/agents", title: "AI agents", description: "Use Moltworld from OpenClaw, Hermes Agent, Claude Code, A2A or any MCP client, with mandate spending limits.", body, data: catalogScript(models) });
}

function solutionsDevelopers(c: Context) {
  const s = snippets();
  const body = `
    ${pageHero({
      crumbs: [["Solutions", "/solutions"]],
      title: "Add AI to your app <em>without keys or plans.</em>",
      ctas: `${btn(`${docs()}/quickstart`, "Quickstart")}${btn("/playground", "Playground", "ghost")}`,
    })}
    ${sec(`
      ${secHead("Less plumbing.")}
      ${facts([
        ["layers", "Chat, image, voice and video behind one API with OpenAI-style bodies."],
        ["tag", "Every call is quoted first. Set a per-request cap and a budget."],
        ["refund", "Chat is charged after the answer. Failed media is refunded."],
        ["shield", "Retries return the original response, never a second charge."],
        ["receipt", "A signed receipt and transaction id for every call."],
        ["users", "Users can pay for their own calls from their own wallets."],
      ])}
    `)}
    ${sec(`<div class="dev-grid"><h2 data-split>Start <em>in a few lines.</em></h2><div data-reveal>${codeTabs("devs", [["ts", "TypeScript", s.ts], ["py", "Python", s.py], ["curl", "curl", s.curl]])}</div></div>`)}
    ${ctaFinal("Build with <em>Moltworld.</em>")}`;
  return renderPage(c, { path: "/solutions/developers", title: "App developers", description: "Add chat, image, voice and video models to your app with per-request USDC payments and no API keys.", body });
}

function solutionsCreators(c: Context) {
  const body = `
    ${pageHero({
      crumbs: [["Solutions", "/solutions"]],
      title: `Charge per call for your API. <em>Keep ${share()}%.</em>`,
      ctas: `${btn(`${docs()}/products/marketplace`, "List your API")}${btn("/products/marketplace", "Marketplace", "ghost")}`,
      visual: splitDemo(),
    })}
    ${sec(`
      ${secHead("Billing <em>you don't build.</em>")}
      ${facts([
        ["agent", "Any x402 client or MCP agent can buy from you."],
        ["layers", "Quotes, payment, settlement and receipts are handled."],
        ["key", "Every forwarded request is HMAC-signed."],
        ["check", "Buyers are charged only when you answer 2xx."],
        ["wallet", `USDC payouts to your wallet from $${config.creatorPayoutMinUsd}.`],
        ["globe", "Listed where agents already look: HTTP, MCP and A2A."],
      ])}
    `)}
    ${sec(`
      ${secHead("Verify <em>Moltworld's signature.</em>")}
      <div data-reveal>${codeBlock(`import crypto from "crypto";

// X-Moltworld-Timestamp, X-Moltworld-Request-Id, X-Moltworld-Signature
function fromMoltworld(req, rawBody, signingSecret) {
  const ts = req.headers["x-moltworld-timestamp"];
  const id = req.headers["x-moltworld-request-id"];
  const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const expected = crypto.createHmac("sha256", signingSecret)
    .update(\`\${ts}.\${id}.\${bodyHash}\`).digest("base64url");
  return Math.abs(Date.now() / 1000 - Number(ts)) < 300 &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-moltworld-signature"]));
}`)}</div>
    `)}
    ${ctaFinal("List your <em>first API.</em>")}`;
  return renderPage(c, { path: "/solutions/api-creators", title: "API sellers", description: "Sell your API per call to apps and agents, paid in USDC through Moltworld.", body });
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
        "Create a mandate: $0.25 per call, $5 a day, chosen models, 30 days.",
        "Give the agent the credential. It contains no private key.",
        "The agent adds Moltworld as an MCP server and pays as it goes.",
        "Every call returns a receipt. Revoke the mandate any time.",
      ],
      code: `// On the agent: npx -y -p moltworld-sdk moltworld-mcp keygen  ->  agent address
const { credential } = await createMandate("${origin}", owner, {
  agent: agentAddress, maxPerCallUsd: 0.25, dailyCapUsd: 5, validDays: 30,
});
// Give MOLTWORLD_MANDATE=<credential> to the agent's MCP server.`,
      products: [["Mandates", "/products/mandates"], ["AI agents", "/solutions/agents"]],
    },
    "model-escalation": {
      problem:
        "Running every step of an agent or app on a frontier model is expensive, and paying for a second subscription to use one occasionally is wasteful.",
      how: [
        "Run the normal workload on a cheap model, or your own.",
        "Send only the hard step to a frontier model through Moltworld.",
        "Quote it first, then pay for that one call.",
        "Unused max_tokens budget is paid back.",
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
        "Script, voice-over and clip through one API.",
        "Video runs as a job; poll it or let the SDK wait.",
        "Failed or unfinished generations are refunded on-chain.",
        "Receipts give a cost record per asset.",
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
        "List your API or agent skill with a price per call.",
        "Other agents pay through the same x402 flow as model calls.",
        "Your endpoint receives signed requests and answers as usual.",
        "Your share arrives in batched on-chain payouts.",
      ],
      code: `// Buyer side: the same client that pays for models
const res = await client.market("weather-now", { city: "Lagos" });`,
      products: [["Marketplace", "/products/marketplace"], ["API sellers", "/solutions/api-creators"]],
    },
    "team-budgets": {
      problem:
        "Teams running several agents, or giving staff AI tools, need to know who spent what and to stop runaway spend, without sharing one API key.",
      how: [
        "One mandate per agent or person, each with its own limits.",
        "Payments come from the team wallet, tracked per mandate.",
        "Receipts and the mandate lookup show who spent what.",
        "Revoke a mandate when an agent retires or someone leaves.",
      ],
      code: `for (const member of team) {
  await createMandate("${origin}", teamWallet, {
    agent: member.agentAddress, // each agent's own key, from moltworld-mcp keygen
    maxPerCallUsd: 0.5, dailyCapUsd: member.dailyBudget,
    allowedModels: member.models, label: member.name,
  });
}`,
      products: [["Mandates", "/products/mandates"], ["Receipts", "/products/receipts"]],
    },
  };
}

function agentCard(t: ReturnType<typeof agentTypes>[number]): string {
  return `<a class="uc" href="/use-cases/${t.slug}"><span class="uc-ic">${icon(t.icon, 22)}</span><h3>${esc(t.short)}</h3><span class="uc-examples">${t.examples.map(esc).join(" &middot; ")}</span><span class="go">${icon("arrow", 16)}</span></a>`;
}

function useCases(c: Context) {
  const body = `
    ${pageHero({ title: "Every kind of agent. <em>One wallet.</em>", ctas: `${btn(`${docs()}/agents/mcp`, "Connect an agent")}${btn("/products/mandates", "Mandates", "ghost")}` })}
    ${sec(`<div class="uc-grid" data-reveal>${agentTypes().map(agentCard).join("")}</div>`, { line: false })}
    ${sec(`${secHead("By workflow.")}${linkCards(WORKFLOWS.map((u) => ({ title: u.title, href: `/solutions/${u.slug}`, icon: "spark" })))}`)}
    ${ctaFinal("Price your <em>first request.</em>")}`;
  return renderPage(c, { path: "/use-cases", title: "Use cases", description: "How every kind of agent uses Moltworld: personal, coding, knowledge-work, computer-use, multi-agent, media and voice agents, self-hosted or in the cloud.", body });
}

/** First step for any agent that pays under a mandate: its own key, created where it runs. */
const AGENT_KEY_STEP: [string, string, string, string] = [
  "key",
  "Agent key",
  `# Once, where the agent runs. The key never leaves this machine.
npx -y -p moltworld-sdk moltworld-mcp keygen
# Prints the agent's address: give it to the wallet owner, who binds a mandate to it.
# The resulting credential goes in MOLTWORLD_MANDATE below; it can't pay without this key.`,
  "sh",
];

function agentPage(slug: string) {
  return (c: Context) => {
    const t = agentTypes().find((a) => a.slug === slug)!;
    const workflow = WORKFLOWS.find((w) => w.slug === t.workflow);
    const others = agentTypes().filter((a) => a.slug !== slug).slice(0, 3);
    const body = `
      ${pageHero({
        crumbs: [["Use cases", "/use-cases"]],
        title: t.title,
        ctas: `${btn("/products/mandates", "Create a mandate")}${btn(`${docs()}/agents/mcp`, "MCP docs", "ghost")}`,
        visual: `<ul class="example-list">${t.examples.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`,
      })}
      ${sec(`
        ${secHead("How it <em>connects.</em>")}
        <div class="table-wrap" data-reveal><table class="stack">
          <thead><tr><th>Agent</th><th>Connects with</th><th>Pays</th></tr></thead>
          <tbody>${t.connect.map(([agent, how, pays]) => `<tr><td data-label="Agent">${esc(agent)}</td><td data-label="Connects with">${esc(how)}</td><td data-label="Pays"><span class="pays pays-${pays}">${esc(PAYS_LABEL[pays])}</span></td></tr>`).join("")}</tbody>
        </table></div>
      `)}
      ${sec(`<div class="dev-grid"><h2 data-split>Set it <em>up.</em></h2><div data-reveal>${codeTabs("agent", [
        ...(t.connect.some(([, , pays]) => pays === "mandate") ? [AGENT_KEY_STEP] : []),
        ...t.configs.map(([id, label, code, lang]) => [id, label, code, lang] as [string, string, string, string]),
      ])}</div></div>`)}
      ${sec(`
        ${secHead("Why it <em>fits.</em>", workflow ? arrowLink(`/solutions/${workflow.slug}`, esc(workflow.short)) : "")}
        ${facts(t.facts)}
      `)}
      ${sec(`${secHead("More <em>agents.</em>", arrowLink("/use-cases", "All use cases"))}<div class="uc-grid">${others.map(agentCard).join("")}</div>`)}
      ${ctaFinal("Connect <em>your agent.</em>", `${btn(`${docs()}/agents/mcp`, "Connect an agent")}${btn("/playground", "Playground", "ghost")}`)}`;
    return renderPage(c, { path: `/use-cases/${slug}`, title: t.short, description: t.summary, body });
  };
}

function workflowPage(slug: string) {
  return (c: Context) => {
    const meta = WORKFLOWS.find((u) => u.slug === slug)!;
    const detail = useCaseDetails()[slug];
    const body = `
      ${pageHero({ crumbs: [["Solutions", "/solutions"]], title: esc(meta.title), ctas: detail.products.map(([label, href], i) => btn(href, esc(label), i ? "ghost" : "primary")).join("") })}
      ${sec(`
        <div class="dev-grid">
          <div class="prose" data-reveal>
            <p class="problem-text">${esc(detail.problem)}</p>
            <ol>${detail.how.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
          </div>
          <div data-reveal style="--d:1">${codeBlock(detail.code)}</div>
        </div>
      `, { line: false })}
      ${sec(`${secHead("More <em>workflows.</em>")}${linkCards(WORKFLOWS.filter((u) => u.slug !== slug).slice(0, 3).map((u) => ({ title: u.title, href: `/solutions/${u.slug}`, icon: "spark" })))}`)}
      ${ctaFinal("Try it <em>yourself.</em>")}`;
    return renderPage(c, { path: `/solutions/${slug}`, title: meta.title, description: meta.summary, body });
  };
}

// ---------------------------------------------------------------------------
// Playground and live network
// ---------------------------------------------------------------------------

function playground(c: Context) {
  const models = catalog();
  const body = `
    ${pageHero({ title: "Run any model. <em>Pay per request.</em>" })}
    <section class="sec" style="padding-top:48px"><div class="wrap">${quoteWidget()}</div></section>
    ${sec(`${secHead("Verify <em>a receipt.</em>", arrowLink("/.well-known/moltworld-receipts.json", "Signing keys"))}${receiptWidget()}`, { id: "verify" })}`;
  return renderPage(c, {
    path: "/playground",
    title: "Playground",
    description: "Run any Moltworld model with a real x402 payment from your Algorand wallet or an agent mandate, with the receipt verified in your browser. Quotes and 402 challenges are free.",
    body,
    data: catalogScript(models) + payConfigScript(),
  });
}

function usage(c: Context) {
  const body = `
    ${pageHero({
      title: "Usage from <em>the public ledger.</em>",
      ctas: `<a class="btn btn-ghost" href="https://facilitator.goplausible.xyz/dashboard/merchants/414f1538ce0d6de4" target="_blank" rel="noopener" style="max-width:100%;white-space:normal;text-align:center">Facilitator dashboard ${icon("arrow", 16)}</a>`,
    })}
    <section class="sec" style="padding-top:56px"><div class="wrap">
      ${statsWidget()}
      <dl class="kv-list" style="margin-top:40px" data-reveal>
        <dt>Paid requests, 24h</dt><dd id="sPaid24">-</dd>
        <dt>Gross</dt><dd id="sGross">-</dd>
        <dt>Facilitator success rate</dt><dd id="sSuccessRate">-</dd>
        <dt>Average settlement</dt><dd id="sAvgLatency">-</dd>
        <dt>Average ticket</dt><dd id="sAvgTicket">-</dd>
        <dt>Rebated</dt><dd id="sRebated">-</dd>
        <dt>Returning wallets</dt><dd id="sRepeat">-</dd>
      </dl>
    </div></section>
    ${sec(`
      ${secHead("Top models <em>by volume.</em>")}
      <div class="table-wrap" data-reveal><table class="stack">
        <thead><tr><th>Model</th><th>Settles</th><th>Volume (USDC)</th><th>Price</th></tr></thead>
        <tbody id="topModelRows"><tr><td colspan="4">Loading</td></tr></tbody>
      </table></div>
    `)}
    ${sec(`
      ${secHead("Recent <em>settlements.</em>")}
      <div class="table-wrap" data-reveal><table class="stack">
        <thead><tr><th>When</th><th>Model</th><th>Amount</th><th>Transaction</th></tr></thead>
        <tbody id="recentRows"><tr><td colspan="4">Loading</td></tr></tbody>
      </table></div>
    `)}`;
  return renderPage(c, { path: "/stats", title: "Live network", description: "Moltworld usage from the public ledger, cross-checked with the x402 facilitator, with on-chain transaction links.", body });
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
    "/pricing": pricing,
    "/developers": developers,
    "/solutions": solutions,
    "/solutions/agents": solutionsAgents,
    "/solutions/developers": solutionsDevelopers,
    "/solutions/api-creators": solutionsCreators,
    "/use-cases": useCases,
    "/playground": playground,
    "/stats": usage,
  };
  for (const w of WORKFLOWS) pages[`/solutions/${w.slug}`] = workflowPage(w.slug);
  for (const t of agentTypes()) pages[`/use-cases/${t.slug}`] = agentPage(t.slug);
  for (const [path, handler] of Object.entries(pages)) app.get(path, handler);
  // Workflows moved from /use-cases to /solutions; keep old links working.
  for (const w of WORKFLOWS) app.get(`/use-cases/${w.slug}`, (c) => c.redirect(`/solutions/${w.slug}`, 301));
  for (const name of ASSET_NAMES) app.get(`/assets/${name}`, handleAsset(name));
  return Object.keys(pages);
}
