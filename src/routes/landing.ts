import { Context } from "hono";
import { config } from "../config.js";
import { defaultModelRegistry, getModelEndpoint, ModelDefinition } from "../models/registry.js";
import { quoteRequest, referenceRequest } from "../pricing/index.js";
import { defaultProviderRegistry } from "../providers/index.js";

const TITLE = "Moltworld | Multimodal AI Gateway with x402 on Algorand";
const DESCRIPTION =
  "Pay-per-request AI for apps and autonomous agents. Chat, image, voice and video models, paid per call in USDC on Algorand via x402, with signed receipts and on-chain refunds.";

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** JSON safe to embed inside a <script> element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function catalog() {
  return defaultModelRegistry
    .getEnabledModels()
    .filter((m) => defaultProviderRegistry.supports(m))
    .map((m: ModelDefinition) => ({
      slug: m.slug,
      name: m.displayName,
      modality: m.modality,
      provider: m.provider,
      upstream: m.upstreamModelId,
      endpoint: getModelEndpoint(m),
      from: quoteRequest(m, referenceRequest(m)).formattedPrice,
      flow: m.modality === "chat" ? "authorization" : "upfront",
      maxOutput: m.limits.maxOutputTokens ?? null,
      maxImages: m.limits.maxImages ?? 1,
      sizes: m.image?.sizes ?? null,
      durations: m.video?.durations ?? null,
      ratios: m.video?.aspectRatios ?? null,
      voices: m.voices ?? null,
    }));
}

const MODALITY_LABEL: Record<string, string> = { chat: "Chat", image: "Image", voice: "Voice", video: "Video" };

export function renderLandingPage(c: Context): Response {
  const origin = config.publicDomain;
  const models = catalog();
  const counts = { chat: 0, image: 0, voice: 0, video: 0 } as Record<string, number>;
  for (const m of models) counts[m.modality]++;
  const network = config.isMainnet ? "Algorand Mainnet" : "Algorand Testnet";
  const explorer = config.isMainnet ? "https://lora.algokit.io/mainnet" : "https://lora.algokit.io/testnet";

  const cards = models
    .map(
      (m) => `
        <li class="model" data-modality="${m.modality}" data-search="${esc(`${m.name} ${m.slug} ${m.upstream} ${m.provider}`.toLowerCase())}">
          <div class="model-top">
            <h3>${esc(m.name)}</h3>
            <span class="price" title="Price of a small reference request">from ${esc(m.from)}</span>
          </div>
          <div class="chips">
            <span class="chip chip-${m.modality}">${MODALITY_LABEL[m.modality]}</span>
            <span class="chip">${esc(m.provider)}</span>
            <span class="chip mono" title="Upstream model id">${esc(m.upstream)}</span>
          </div>
          <p class="flow">${m.flow === "authorization" ? "Charged after the answer; unused tokens paid back" : "Charged first; refunded if it fails"}</p>
          <code class="endpoint">POST ${esc(m.endpoint)}</code>
          <div class="model-actions">
            <button type="button" class="btn btn-small" data-quote="${esc(m.slug)}">Get exact quote</button>
            <button type="button" class="btn btn-small btn-ghost" data-copy="${esc(`${origin}${m.endpoint}`)}">Copy URL</button>
          </div>
        </li>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${TITLE}</title>
  <meta name="description" content="${esc(DESCRIPTION)}">
  <meta name="theme-color" content="#07090e">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" href="/logo.png">
  <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-readable service description">
  <meta property="og:title" content="${TITLE}">
  <meta property="og:description" content="${esc(DESCRIPTION)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Moltworld">
  <meta property="og:url" content="${origin}/">
  <meta property="og:image" content="${origin}/logo.png">
  <meta name="twitter:card" content="summary">
  <style>
    :root {
      --bg: #07090e; --bg-2: #0c1019; --card: #0f131f; --card-2: #151a2b; --border: #1e2538; --border-2: #2a3350;
      --text: #f3f5f8; --muted: #9aa4b8; --dim: #6b7589;
      --accent: #00e5a3; --accent-ink: #04130d; --accent-soft: rgba(0, 229, 163, 0.12);
      --cyan: #38bdf8; --purple: #b78cf7; --amber: #f5b84a; --pink: #f472b6; --danger: #f87171;
      --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      --radius: 14px; --gutter: 16px; --max: 1180px;
    }
    @media (prefers-color-scheme: light) {
      :root:not([data-theme="dark"]) {
        --bg: #f6f7fb; --bg-2: #eef1f7; --card: #ffffff; --card-2: #f3f5fa; --border: #dfe3ec; --border-2: #cbd2e0;
        --text: #0d1220; --muted: #4a5468; --dim: #6b7589;
        --accent: #00875f; --accent-ink: #ffffff; --accent-soft: rgba(0, 135, 95, 0.1);
        --cyan: #0369a1; --purple: #7c3aed; --amber: #a16207; --pink: #be185d; --danger: #b91c1c;
      }
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; scroll-padding-top: 80px; -webkit-text-size-adjust: 100%; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font); line-height: 1.55; font-size: 16px; overflow-x: hidden; }
    a { color: var(--accent); }
    code, pre, .mono { font-family: var(--mono); }
    .wrap { max-width: var(--max); margin: 0 auto; padding: 0 var(--gutter); }
    .skip { position: absolute; left: -9999px; } .skip:focus { left: 16px; top: 8px; z-index: 100; background: var(--card); padding: 8px 12px; border-radius: 8px; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

    /* Header */
    header.site { position: sticky; top: 0; z-index: 50; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 64px; }
    .brand { display: flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; font-weight: 700; font-size: 18px; }
    .brand img { width: 32px; height: 32px; border-radius: 8px; }
    .net { font-size: 13px; color: var(--muted); white-space: nowrap; } .net.down { color: var(--danger); }
    ol.steps { margin: 0; padding-left: 22px; max-width: 75ch; color: var(--muted); } ol.steps li { margin: 0 0 10px; }
    dl.stats { max-width: 520px; } dl.stats dd { font-size: 15px; }

    /* Hero */
    .hero { padding-top: 64px; padding-bottom: 40px; text-align: center; }
    h1 { font-size: clamp(32px, 6vw, 56px); line-height: 1.08; letter-spacing: -0.02em; margin: 18px auto 14px; max-width: 18ch; }
    .lede { color: var(--muted); font-size: clamp(16px, 2.2vw, 19px); max-width: 62ch; margin: 0 auto 26px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 10px 18px; border-radius: 10px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); font: 600 15px var(--font); text-decoration: none; cursor: pointer; }
    .btn:hover { filter: brightness(1.08); }
    .btn-ghost { background: transparent; color: var(--text); border-color: var(--border-2); }
    .btn-small { min-height: 36px; padding: 6px 12px; font-size: 13px; }
    .btn[disabled] { opacity: .6; cursor: progress; }
    @media (max-width: 760px) { .hero { padding-top: 40px; } }

    /* Sections */
    section.block { padding: 56px 0; border-top: 1px solid var(--border); }
    .head { margin-bottom: 24px; }
    h2 { font-size: clamp(24px, 3.4vw, 34px); margin: 0 0 8px; letter-spacing: -0.01em; }
    .head p { color: var(--muted); margin: 0; max-width: 70ch; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; min-width: 0; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } .grid-4 { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 520px) { .grid-4 { grid-template-columns: 1fr; } }

    /* Forms */
    label { display: block; font-size: 13px; color: var(--muted); margin: 14px 0 6px; }
    input, select, textarea { width: 100%; background: var(--bg-2); color: var(--text); border: 1px solid var(--border-2); border-radius: 10px; padding: 10px 12px; font: 15px var(--font); min-height: 44px; }
    textarea { min-height: 96px; resize: vertical; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 520px) { .row { grid-template-columns: 1fr; } }
    .hidden { display: none !important; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
    .result { margin-top: 16px; }
    .big-price { font: 700 34px var(--mono); color: var(--accent); }
    dl.kv { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; margin: 12px 0 0; font-size: 14px; }
    dl.kv dt { color: var(--dim); } dl.kv dd { margin: 0; overflow-wrap: anywhere; font-family: var(--mono); font-size: 13px; }
    @media (max-width: 520px) { dl.kv { grid-template-columns: 1fr; gap: 2px; } dl.kv dd { margin-bottom: 8px; } }
    pre.code { background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px; padding: 14px; overflow-x: auto; font-size: 13px; line-height: 1.5; margin: 12px 0 0; max-width: 100%; }
    .note { font-size: 13px; color: var(--muted); }
    .err { color: var(--danger); font-size: 14px; }
    .ok-text { color: var(--accent); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; border: 1px solid var(--border-2); }
    .badge.good { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 50%, transparent); }
    .badge.bad { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 50%, transparent); }

    /* Catalog */
    .filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 16px; }
    .tab { background: var(--card); color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 8px 14px; font: 500 14px var(--font); cursor: pointer; min-height: 40px; }
    .tab[aria-pressed="true"] { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
    .filters input { flex: 1 1 220px; min-width: 0; width: auto; }
    ul.models { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    @media (max-width: 1000px) { ul.models { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 640px) { ul.models { grid-template-columns: 1fr; } }
    .model { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .model-top { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
    .model h3 { margin: 0; font-size: 16px; }
    .price { font: 600 14px var(--mono); color: var(--accent); white-space: nowrap; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
    .chip { font-size: 12px; padding: 2px 8px; border-radius: 6px; background: var(--card-2); color: var(--muted); border: 1px solid var(--border); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chip-chat { color: var(--cyan); } .chip-image { color: var(--pink); } .chip-voice { color: var(--amber); } .chip-video { color: var(--purple); }
    .flow { margin: 0; font-size: 13px; color: var(--muted); }
    .endpoint { font-size: 12px; color: var(--dim); background: var(--bg-2); border-radius: 8px; padding: 6px 8px; overflow-wrap: anywhere; }
    .model-actions { display: flex; gap: 8px; margin-top: auto; flex-wrap: wrap; }
    .more { display: flex; justify-content: center; margin-top: 18px; }

    /* Tables */
    .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    th { color: var(--dim); font-weight: 500; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; background: var(--bg-2); }
    td.mono a { color: var(--accent); }
    @media (max-width: 640px) {
      table.stack thead { display: none; }
      table.stack tr { display: block; padding: 10px 12px; border-bottom: 1px solid var(--border); }
      table.stack td { display: flex; justify-content: space-between; gap: 12px; border: 0; padding: 3px 0; white-space: normal; overflow-wrap: anywhere; }
      table.stack td::before { content: attr(data-label); color: var(--dim); font-size: 12px; }
    }

    /* Code tabs */
    .codetabs [role="tablist"] { display: flex; gap: 6px; flex-wrap: wrap; }
    .codetabs [role="tab"] { background: var(--card); color: var(--muted); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; font: 500 14px var(--font); cursor: pointer; min-height: 40px; }
    .codetabs [role="tab"][aria-selected="true"] { color: var(--text); border-color: var(--accent); }

    footer { border-top: 1px solid var(--border); padding: 32px 0 48px; color: var(--muted); font-size: 14px; }
    footer .links { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 10px; }
    footer a { color: var(--muted); }
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--card-2); border: 1px solid var(--border-2); padding: 10px 16px; border-radius: 10px; font-size: 14px; opacity: 0; transition: opacity .2s; pointer-events: none; z-index: 60; }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="site">
    <div class="wrap bar">
      <a class="brand" href="/"><img src="/logo.png" alt="" width="32" height="32"><span>Moltworld</span></a>
      <span class="net" id="netLabel" title="Gateway status">${network}</span>
    </div>
  </header>

  <main id="main">
    <div class="wrap hero">
      <h1>AI models, paid per request in USDC</h1>
      <p class="lede">${models.length ? `${models.length} chat, image, voice and video models` : "Chat, image, voice and video models"} behind one HTTP API. You pay for each call with a USDC transfer on ${network} using x402. No account or API key.</p>
    </div>

    <section class="block" id="how">
      <div class="wrap">
        <div class="head"><h2>How payment works</h2></div>
        <ol class="steps">
          <li>Send a request. If it's invalid you get a 400 and pay nothing. If it's valid you get a 402 with the price for that exact request.</li>
          <li>Your wallet signs one USDC transfer for that amount. The facilitator covers the network fee, so you don't need ALGO.</li>
          <li>Chat is settled after the answer is ready, and unused tokens are paid back. Image, voice and video are settled first and refunded if the model fails.</li>
          <li>The response includes a signed receipt with the transaction id and hashes of your request and the response.</li>
        </ol>
      </div>
    </section>

    <section class="block" id="quote">
      <div class="wrap">
        <div class="head"><h2>Price a request</h2><p>Uses <code>POST /v1/quote</code>. The price shown is the same amount the 402 response will ask for.</p></div>
        <div class="grid-2">
          <form class="card" id="quoteForm" novalidate>
            <label for="qModel">Model</label>
            <select id="qModel" name="model"></select>
            <div data-for="chat">
              <label for="qMessage">Message</label>
              <textarea id="qMessage" maxlength="32000">Explain how x402 payments work on Algorand in two sentences.</textarea>
              <label for="qMaxTokens">max_tokens <span class="note" id="qMaxNote"></span></label>
              <input id="qMaxTokens" type="number" min="1" value="300" inputmode="numeric">
            </div>
            <div data-for="image" class="hidden">
              <label for="qPrompt">Prompt</label>
              <textarea id="qPrompt">A lighthouse on a cliff at dawn, watercolor</textarea>
              <div class="row">
                <div><label for="qN">Images</label><select id="qN"></select></div>
                <div><label for="qSize">Size</label><select id="qSize"></select></div>
              </div>
            </div>
            <div data-for="voice" class="hidden">
              <label for="qInput">Text to speak</label>
              <textarea id="qInput">Welcome to Moltworld, pay-per-request AI on Algorand.</textarea>
              <div id="qVoiceWrap"><label for="qVoice">Voice</label><select id="qVoice"></select></div>
            </div>
            <div data-for="video" class="hidden">
              <label for="qVideoPrompt">Prompt</label>
              <textarea id="qVideoPrompt">Slow aerial shot over ocean waves at sunset</textarea>
              <div class="row">
                <div><label for="qDuration">Duration (s)</label><select id="qDuration"></select></div>
                <div><label for="qRatio">Aspect ratio</label><select id="qRatio"></select></div>
              </div>
            </div>
            <div class="actions">
              <button class="btn" type="submit" id="quoteBtn">Get quote</button>
              <button class="btn btn-ghost" type="button" id="challengeBtn">Show 402 challenge</button>
            </div>
          </form>
          <div class="card" aria-live="polite" id="quoteOut">
            <p class="note">Pick a model, fill in the request and get a quote. Nothing on this page charges you.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="block" id="models">
      <div class="wrap">
        <div class="head"><h2>Models</h2><p>Each model is listed under the provider and model id that serves it. If a provider can't confirm a model exists, we don't sell it.</p></div>
        <div class="filters" role="group" aria-label="Filter by modality">
          <button class="tab" type="button" data-filter="all" aria-pressed="true">All (${models.length})</button>
          <button class="tab" type="button" data-filter="chat" aria-pressed="false">Chat (${counts.chat})</button>
          <button class="tab" type="button" data-filter="image" aria-pressed="false">Image (${counts.image})</button>
          <button class="tab" type="button" data-filter="voice" aria-pressed="false">Voice (${counts.voice})</button>
          <button class="tab" type="button" data-filter="video" aria-pressed="false">Video (${counts.video})</button>
          <label class="sr-only" for="search">Search models</label>
          <input id="search" type="search" placeholder="Search models or upstreams">
        </div>
        <ul class="models" id="modelList">${cards}</ul>
        <p class="note hidden" id="noModels">No models match.</p>
        <div class="more"><button class="btn btn-ghost" type="button" id="moreBtn">Show more</button></div>
      </div>
    </section>

    <section class="block" id="agents">
      <div class="wrap">
        <div class="head"><h2>Spending mandates for agents</h2><p>Let an agent pay on your behalf without holding your key. A mandate is a delegated LogicSig: the Algorand protocol only lets it pay Moltworld, at most a fixed amount per call, until it expires. Moltworld enforces its daily cap and model allow-list, and you can revoke it at any time.</p></div>
        <div class="grid-2">
          <div class="card">
            <h3 style="margin-top:0">Create one with the SDK</h3>
            <pre class="code"><code>const { mandateId, credential } = await createMandate(
  "${origin}", owner, {
    maxPerCallUsd: 0.25,   // enforced on-chain
    dailyCapUsd: 5,        // enforced by Moltworld
    validDays: 30,         // enforced on-chain
    allowedModels: ["gpt-4o", "claude-sonnet-5"],
  });

// The agent gets a credential with no private key in it:
const agent = new MoltworldClient({ mandate: credential });</code></pre>
            <p class="note">The SDK checks the program against your limits before you sign it.</p>
          </div>
          <form class="card" id="mandateForm" novalidate>
            <h3 style="margin-top:0">Inspect a mandate</h3>
            <label for="mandateQuery">Mandate id or owner address</label>
            <input id="mandateQuery" autocomplete="off" spellcheck="false" placeholder="58-character Algorand address">
            <div class="actions"><button class="btn" type="submit">Look up</button></div>
            <div class="result" id="mandateOut" aria-live="polite"></div>
          </form>
        </div>
      </div>
    </section>

    <section class="block" id="market">
      <div class="wrap">
        <div class="head"><h2>Creator marketplace</h2><p>Put your own HTTPS API behind Moltworld's x402 checkout. Buyers pay in USDC; you receive ${100 - config.marketplaceFeePercent}% on-chain in batched payouts. Every forwarded call carries an HMAC signature you can verify.</p></div>
        <div class="grid-2">
          <div class="card">
            <h3 style="margin-top:0">Live listings</h3>
            <div id="marketOut" aria-live="polite"><p class="note">Loading</p></div>
          </div>
          <div class="card">
            <h3 style="margin-top:0">List your API</h3>
            <p class="note">Listings are signed with your Algorand wallet so payouts can only go to you. We review each listing before it goes live.</p>
            <pre class="code"><code>const listing = {
  action: "list", creator: wallet.addr.toString(),
  slug: "weather-now", name: "Weather Now",
  description: "Current weather for a city, as JSON.",
  upstream_url: "https://api.example.com/weather",
  price_usd: 0.002, input_example: { city: "Lagos" },
  issued_at: Math.floor(Date.now() / 1000),
};
await fetch("${origin}/v1/market/listings", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ listing,
    creator_sig: signOwnerMessage(listing, wallet.sk) }),
});</code></pre>
            <form id="earnForm" novalidate>
              <label for="earnAddr">Check creator earnings</label>
              <input id="earnAddr" autocomplete="off" spellcheck="false" placeholder="Creator address">
              <div class="actions"><button class="btn btn-ghost" type="submit">Check</button></div>
              <div class="result" id="earnOut" aria-live="polite"></div>
            </form>
          </div>
        </div>
      </div>
    </section>

    <section class="block" id="receipts">
      <div class="wrap">
        <div class="head"><h2>Verify a receipt</h2><p>Look up any request id, or paste a receipt (the decoded <code>Moltworld-Receipt</code> header). The signature is checked in your browser against the published key at <a href="/.well-known/moltworld-receipts.json">/.well-known/moltworld-receipts.json</a>.</p></div>
        <form class="card" id="receiptForm" novalidate>
          <label for="receiptInput">Request id or receipt JSON</label>
          <textarea id="receiptInput" spellcheck="false" placeholder="req_… or {&quot;v&quot;:1,&quot;kid&quot;:…}"></textarea>
          <div class="actions"><button class="btn" type="submit">Verify</button></div>
          <div class="result" id="receiptOut" aria-live="polite"></div>
        </form>
      </div>
    </section>

    <section class="block" id="stats">
      <div class="wrap">
        <div class="head"><h2>Usage</h2><p>From the gateway ledger, excluding our own wallets. Each settlement links to its Algorand transaction.</p></div>
        <dl class="kv stats" id="statList">
          <dt>Paid requests</dt><dd id="sPaid">-</dd>
          <dt>Last 24 hours</dt><dd id="sPaid24">-</dd>
          <dt>Gross</dt><dd id="sGross">-</dd>
          <dt>Net revenue</dt><dd id="sNet">-</dd>
          <dt>Paying wallets</dt><dd id="sWallets">-</dd>
          <dt>Returning wallets</dt><dd id="sRepeat">-</dd>
          <dt>Refunded</dt><dd id="sRefunds">-</dd>
        </dl>
        <h3>Recent settlements</h3>
        <div class="table-wrap">
          <table class="stack">
            <thead><tr><th>When</th><th>Model</th><th>Amount</th><th>Transaction</th></tr></thead>
            <tbody id="recentRows"><tr><td colspan="4">Loading</td></tr></tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="block" id="developers">
      <div class="wrap">
        <div class="head"><h2>Developers</h2><p>Request bodies follow the OpenAI format. Use the SDKs (in <a href="https://github.com/hackcat29/moltworld-x402/tree/main/sdk">sdk/</a>) or any x402 client that supports Algorand.</p></div>
        <div class="codetabs card">
          <div role="tablist" aria-label="Code examples">
            <button role="tab" type="button" id="t-ts" aria-controls="p-ts" aria-selected="true">TypeScript</button>
            <button role="tab" type="button" id="t-py" aria-controls="p-py" aria-selected="false" tabindex="-1">Python</button>
            <button role="tab" type="button" id="t-mcp" aria-controls="p-mcp" aria-selected="false" tabindex="-1">MCP</button>
            <button role="tab" type="button" id="t-curl" aria-controls="p-curl" aria-selected="false" tabindex="-1">curl</button>
          </div>
          <div role="tabpanel" id="p-ts" aria-labelledby="t-ts"><pre class="code"><code>import { MoltworldClient } from "@moltworld/sdk";

const client = new MoltworldClient({
  mnemonic: process.env.ALGORAND_MNEMONIC,
  maxPerRequestUsd: 0.25, // never signs more than this
  budgetUsd: 5,           // per client instance
});

const res = await client.chat("gpt-4o", {
  messages: [{ role: "user", content: "Summarize x402" }],
  max_tokens: 300,
});
console.log(res.data.choices[0].message.content);
console.log(res.verification?.ok, res.receipt?.txid);</code></pre></div>
          <div role="tabpanel" id="p-py" aria-labelledby="t-py" hidden><pre class="code"><code>from moltworld import MoltworldClient

client = MoltworldClient(mnemonic="...", max_per_request_usd=0.25, budget_usd=5)
res = client.chat("gpt-4o", [{"role": "user", "content": "Summarize x402"}], max_tokens=300)
print(res.data["choices"][0]["message"]["content"], res.verified, res.receipt["txid"])

job = client.video("kling-v3.0-std", "waves at sunset", duration=5, wait=True).data
print(job["video_url"])</code></pre></div>
          <div role="tabpanel" id="p-mcp" aria-labelledby="t-mcp" hidden><pre class="code"><code>// Remote tools (quote, 402 challenge, caller-signed requests, receipts):
{ "mcpServers": { "moltworld": { "type": "http", "url": "${origin}/mcp" } } }

// Local wallet server: the agent pays by itself, within limits.
{ "mcpServers": { "moltworld-wallet": {
    "command": "npx", "args": ["-y", "-p", "@moltworld/sdk", "moltworld-mcp"],
    "env": { "MOLTWORLD_MANDATE": "&lt;credential&gt;",
             "MOLTWORLD_MAX_PER_REQUEST_USD": "0.25", "MOLTWORLD_BUDGET_USD": "5" } } } }</code></pre></div>
          <div role="tabpanel" id="p-curl" aria-labelledby="t-curl" hidden><pre class="code"><code># 1. Exact price
curl -s ${origin}/v1/quote -H 'Content-Type: application/json' \\
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hi"}],"max_tokens":200}'

# 2. The 402 challenge (base64 JSON in the Payment-Required header)
curl -si ${origin}/v1/models/gpt-4o/chat/completions -H 'Content-Type: application/json' \\
  -d '{"messages":[{"role":"user","content":"Hi"}],"max_tokens":200}' | grep -i payment-required

# 3. Retry with a Payment-Signature header from an x402 Algorand wallet.</code></pre></div>
        </div>
        <p class="note">For agents: <a href="/llms.txt">llms.txt</a>, <a href="/.well-known/x402">/.well-known/x402</a>, <a href="/.well-known/agent-card.json">A2A agent card</a>, <a href="/v1/models">/v1/models</a>.</p>
      </div>
    </section>
  </main>

  <footer>
    <div class="wrap">
      <div><strong>Moltworld</strong>. Payments go to <span class="mono" style="overflow-wrap:anywhere">${config.payToAddress}</span></div>
      <div class="links">
        <a href="/health">Health</a><a href="/v1/models">Catalog JSON</a><a href="/v1/stats">Stats JSON</a>
        <a href="/.well-known/moltworld-receipts.json">Receipt keys</a><a href="${config.facilitatorUrl}">Facilitator</a>
        <a href="https://github.com/hackcat29/moltworld-x402">GitHub</a>
      </div>
    </div>
  </footer>
  <div class="toast" id="toast" role="status"></div>

  <script id="catalog" type="application/json">${scriptJson(models)}</script>
  <script>
  (() => {
    const MODELS = JSON.parse(document.getElementById("catalog").textContent);
    const EXPLORER = ${scriptJson(explorer)};
    const $ = (id) => document.getElementById(id);
    const el = (tag, attrs = {}, ...children) => {
      const node = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") node.className = v; else if (k === "text") node.textContent = v; else node.setAttribute(k, v);
      }
      for (const child of children) node.append(child);
      return node;
    };
    const toast = (msg) => { const t = $("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800); };
    const fmtMicro = (m) => "$" + (Number(m) / 1e6).toFixed(6).replace(/0+$/, "").replace(/\\.$/, "");
    const kv = (pairs) => { const dl = el("dl", { class: "kv" }); for (const [k, v] of pairs) { if (v === undefined || v === null || v === "") continue; dl.append(el("dt", { text: k }), typeof v === "string" ? el("dd", { text: v }) : el("dd", {}, v)); } return dl; };
    const txLink = (txid) => { const a = el("a", { href: EXPLORER + "/transaction/" + encodeURIComponent(txid), target: "_blank", rel: "noopener", text: txid.slice(0, 10) + "…" + txid.slice(-6) }); a.title = txid; return a; };
    const errorBox = (msg) => el("p", { class: "err", text: msg });
    async function api(path, init) {
      const res = await fetch(path, init);
      let body = null;
      try { body = await res.json(); } catch {}
      return { res, body };
    }

    // Health badge
    api("/health").then(({ res, body }) => {
      const ok = res.ok && body && body.ready;
      const label = $("netLabel");
      label.textContent = (body && body.network === "mainnet" ? "Algorand Mainnet" : "Algorand Testnet") + (ok ? "" : " (unavailable)");
      label.classList.toggle("down", !ok);
    }).catch(() => $("netLabel").classList.add("down"));

    // Copy buttons
    document.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-copy]");
      if (!btn) return;
      try { await navigator.clipboard.writeText(btn.dataset.copy); toast("Copied"); } catch { toast("Copy failed"); }
    });

    // Quote form
    const qModel = $("qModel");
    for (const modality of ["chat", "image", "voice", "video"]) {
      const group = el("optgroup", { label: modality[0].toUpperCase() + modality.slice(1) });
      for (const m of MODELS.filter((x) => x.modality === modality)) group.append(el("option", { value: m.slug, text: m.name + " (from " + m.from + ")" }));
      if (group.children.length) qModel.append(group);
    }
    const fill = (select, values, labeler = String) => { select.replaceChildren(...values.map((v) => el("option", { value: String(v), text: labeler(v) }))); };
    function current() { return MODELS.find((m) => m.slug === qModel.value) || MODELS[0]; }
    function syncForm() {
      const m = current();
      document.querySelectorAll("[data-for]").forEach((n) => n.classList.toggle("hidden", n.dataset.for !== m.modality));
      if (m.modality === "chat") { $("qMaxTokens").max = m.maxOutput; $("qMaxNote").textContent = "(max " + m.maxOutput + ")"; if (Number($("qMaxTokens").value) > m.maxOutput) $("qMaxTokens").value = m.maxOutput; }
      if (m.modality === "image") { fill($("qN"), Array.from({ length: m.maxImages }, (_, i) => i + 1)); fill($("qSize"), m.sizes || ["1024x1024"]); }
      if (m.modality === "voice") { $("qVoiceWrap").classList.toggle("hidden", !m.voices); if (m.voices) fill($("qVoice"), m.voices); }
      if (m.modality === "video") { fill($("qDuration"), m.durations || [5], (d) => d + " s"); fill($("qRatio"), m.ratios || ["16:9"]); }
    }
    function bodyFor(m) {
      switch (m.modality) {
        case "chat": return { messages: [{ role: "user", content: $("qMessage").value }], max_tokens: Number($("qMaxTokens").value) };
        case "image": return { prompt: $("qPrompt").value, n: Number($("qN").value), size: $("qSize").value };
        case "voice": return m.voices ? { input: $("qInput").value, voice: $("qVoice").value } : { input: $("qInput").value };
        case "video": return { prompt: $("qVideoPrompt").value, duration: Number($("qDuration").value), aspect_ratio: $("qRatio").value };
      }
    }
    qModel.addEventListener("change", syncForm);
    syncForm();

    const out = $("quoteOut");
    $("quoteForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const m = current(), btn = $("quoteBtn");
      btn.disabled = true;
      try {
        const { res, body } = await api("/v1/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: m.slug, ...bodyFor(m) }) });
        if (!res.ok) { out.replaceChildren(errorBox((body && body.error && body.error.message) || "Quote failed")); return; }
        const q = body.quote, u = q.units;
        const units = [u.estimatedInputTokens && u.estimatedInputTokens + " input tokens (est.)", u.maxOutputTokens && u.maxOutputTokens + " max output tokens", u.images && u.images + " image(s)", u.characters && u.characters + " characters", u.seconds && u.seconds + " seconds"].filter(Boolean).join(", ");
        out.replaceChildren(
          el("div", { class: "note", text: body.name + ": " + (body.payment_flow === "authorization" ? "charged after the answer" : "charged first, refunded if it fails") }),
          el("div", { class: "big-price", text: q.formattedPrice }),
          kv([["Units", units], ["Upstream cost", "$" + q.upstreamCostUsd.toFixed(6) + " (" + q.costSource + ")"], ["Margin", q.marginPercent + "%"], ["Micro-USDC", String(q.microUsdc)], ["Endpoint", "POST " + body.endpoint]]),
          el("p", { class: "note", text: body.note })
        );
      } catch { out.replaceChildren(errorBox("Network error.")); } finally { btn.disabled = false; }
    });

    $("challengeBtn").addEventListener("click", async () => {
      const m = current(), btn = $("challengeBtn");
      btn.disabled = true;
      try {
        const res = await fetch(m.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyFor(m)) });
        const header = res.headers.get("payment-required");
        if (res.status !== 402 || !header) {
          let msg = "HTTP " + res.status; try { const b = await res.json(); msg = (b.error && b.error.message) || msg; } catch {}
          out.replaceChildren(errorBox(msg)); return;
        }
        const required = JSON.parse(atob(header)), a = required.accepts[0];
        out.replaceChildren(
          el("div", { class: "note", text: "HTTP 402 Payment Required (x402 v" + required.x402Version + ")" }),
          el("div", { class: "big-price", text: fmtMicro(a.amount) }),
          kv([["Scheme", a.scheme], ["Network", a.network], ["Asset (ASA)", a.asset], ["Pay to", a.payTo], ["Flow", (a.extra && a.extra.paymentFlow) || "authorization"], ["Fee payer", a.extra && a.extra.feePayer]]),
          el("pre", { class: "code" }, el("code", { text: JSON.stringify(required, null, 2) }))
        );
      } catch { out.replaceChildren(errorBox("Network error.")); } finally { btn.disabled = false; }
    });

    // Catalog filters
    const cards = Array.from(document.querySelectorAll("#modelList .model"));
    const PAGE = 9;
    let filter = "all", query = "", limit = PAGE;
    function renderCatalog() {
      const matches = cards.filter((c) => (filter === "all" || c.dataset.modality === filter) && (!query || c.dataset.search.includes(query)));
      cards.forEach((c) => c.classList.add("hidden"));
      matches.slice(0, limit).forEach((c) => c.classList.remove("hidden"));
      $("noModels").classList.toggle("hidden", matches.length > 0);
      $("moreBtn").parentElement.classList.toggle("hidden", matches.length <= limit);
      $("moreBtn").textContent = "Show more (" + (matches.length - limit) + ")";
    }
    document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      filter = b.dataset.filter; limit = PAGE; renderCatalog();
    }));
    $("search").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); limit = PAGE; renderCatalog(); });
    $("moreBtn").addEventListener("click", () => { limit += PAGE * 2; renderCatalog(); });
    renderCatalog();
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-quote]");
      if (!b) return;
      qModel.value = b.dataset.quote; syncForm();
      $("quote").scrollIntoView();
      $("quoteForm").requestSubmit();
    });

    // Mandates
    $("mandateForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = $("mandateQuery").value.trim(), target = $("mandateOut");
      if (!/^[A-Z2-7]{58}$/.test(q)) { target.replaceChildren(errorBox("Enter a 58-character Algorand address.")); return; }
      // An address is either an owner or a mandate id: try the owner listing first.
      let { res, body } = await api("/v1/mandates?owner=" + q);
      let list = res.ok && body.data.length ? body.data : null;
      if (!list) { ({ res, body } = await api("/v1/mandates/" + q)); list = res.ok ? [body.mandate] : null; }
      if (!list || !list.length) { target.replaceChildren(el("p", { class: "note", text: "No mandates found for this id or owner." })); return; }
      target.replaceChildren(...list.map((m) => el("div", { class: "card", style: "margin-top:10px" },
        el("strong", { text: m.label + " " }), el("span", { class: "badge " + (m.status === "active" ? "good" : "bad"), text: m.status }),
        kv([["Id", m.id], ["Owner", m.owner], ["Per call", m.max_per_call], ["Daily cap", m.daily_cap], ["Spent (24h)", m.spent_24h], ["Models", m.allowed_models ? m.allowed_models.join(", ") : "any"], ["Expires at round", String(m.expiry_round)]]))));
    });

    // Marketplace
    api("/v1/market").then(({ res, body }) => {
      const target = $("marketOut");
      if (!res.ok) { target.replaceChildren(errorBox("Could not load listings.")); return; }
      if (!body.data.length) { target.replaceChildren(el("p", { class: "note", text: "No live listings yet." })); return; }
      target.replaceChildren(...body.data.map((l) => el("div", { class: "card", style: "margin-top:10px" },
        el("div", { class: "model-top" }, el("strong", { text: l.name }), el("span", { class: "price", text: l.price })),
        el("p", { class: "note", text: l.description }),
        el("code", { class: "endpoint", text: "POST " + l.endpoint }))));
    }).catch(() => $("marketOut").replaceChildren(errorBox("Could not load listings.")));

    $("earnForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const addr = $("earnAddr").value.trim(), target = $("earnOut");
      if (!/^[A-Z2-7]{58}$/.test(addr)) { target.replaceChildren(errorBox("Enter a 58-character Algorand address.")); return; }
      const { res, body } = await api("/v1/market/creators/" + addr + "/earnings");
      if (!res.ok) { target.replaceChildren(errorBox((body && body.error && body.error.message) || "Lookup failed")); return; }
      target.replaceChildren(kv([["Paid calls", String(body.paid_calls)], ["Unpaid", body.unpaid], ["Paid out", body.paid_out], ["Payout threshold", body.payout_threshold]]));
    });

    // Receipts
    let keysPromise = null;
    const keys = () => (keysPromise ||= api("/.well-known/moltworld-receipts.json").then(({ body }) => body.keys));
    function canonical(v) {
      if (v === null || typeof v !== "object") return JSON.stringify(v);
      if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
      return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
    }
    const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
    async function verifyLocally(receipt) {
      const key = (await keys()).find((k) => k.kid === receipt.kid);
      if (!key) return { ok: false, why: "Unknown signing key " + receipt.kid };
      try {
        const pub = await crypto.subtle.importKey("raw", b64(key.publicKey), { name: "Ed25519" }, false, ["verify"]);
        const { sig, ...payload } = receipt;
        const ok = await crypto.subtle.verify({ name: "Ed25519" }, pub, b64(sig), new TextEncoder().encode(canonical(payload)));
        return { ok, why: ok ? "Signature valid (checked in your browser)" : "Signature does not match" };
      } catch { return { ok: null, why: "This browser cannot verify Ed25519 signatures; the gateway's check is shown instead." }; }
    }
    $("receiptForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const raw = $("receiptInput").value.trim(), target = $("receiptOut");
      if (!raw) return;
      let receipt = null, server = null;
      if (raw.startsWith("{")) { try { receipt = JSON.parse(raw); } catch { target.replaceChildren(errorBox("That is not valid JSON.")); return; } }
      else if (/^req_[A-Za-z0-9_-]+$/.test(raw)) {
        const { res, body } = await api("/v1/receipts/" + raw);
        if (!res.ok) { target.replaceChildren(errorBox((body && body.error && body.error.message) || "Not found")); return; }
        server = body; receipt = body.receipt;
      } else { target.replaceChildren(errorBox("Enter a request id (req_…) or receipt JSON.")); return; }
      if (!receipt) { target.replaceChildren(kv([["Status", server.status], ["Note", "No receipt: the request was not completed."]])); return; }
      const local = await verifyLocally(receipt);
      const verdict = local.ok === null ? (server && server.signature_valid) : local.ok;
      target.replaceChildren(
        el("p", {}, el("span", { class: "badge " + (verdict ? "good" : "bad"), text: verdict ? "Valid" : "Invalid" }), " " + local.why),
        kv([["Request", receipt.id], ["Status", server ? server.status : undefined], ["Model", receipt.model], ["Upstream", (receipt.upstreamProvider || "") + " / " + (receipt.upstreamModel || "")], ["Paid", fmtMicro(receipt.amountMicro)], ["Rebate", receipt.rebateMicro ? fmtMicro(receipt.rebateMicro) : undefined], ["Payer", receipt.payer], ["Transaction", txLink(receipt.txid)], ["Refund", server && server.refund ? server.refund.status + (server.refund.txid ? ", " + server.refund.txid : "") : undefined], ["Request sha256", receipt.requestSha256], ["Response sha256", receipt.responseSha256], ["Key id", receipt.kid]])
      );
    });

    // Stats
    api("/v1/stats").then(({ res, body }) => {
      if (!res.ok) return;
      const s = body.metrics;
      $("sPaid").textContent = s.paid_requests; $("sPaid24").textContent = s.paid_requests_24h;
      $("sGross").textContent = s.gross_usdc + " (" + s.rebated_usdc + " paid back as rebates)"; $("sNet").textContent = s.net_revenue_usdc;
      $("sWallets").textContent = s.unique_paying_wallets; $("sRepeat").textContent = Math.round(s.repeat_payer_rate * 100) + "%";
      $("sRefunds").textContent = s.refunded_usdc;
      const rows = body.recent_settlements.map((r) => el("tr", {},
        el("td", { "data-label": "When", text: new Date(r.at).toLocaleString() }),
        el("td", { "data-label": "Model", text: r.model || r.modality || "market" }),
        el("td", { "data-label": "Amount", text: r.amount }),
        el("td", { "data-label": "Transaction", class: "mono" }, r.txid ? txLink(r.txid) : "-")));
      $("recentRows").replaceChildren(...(rows.length ? rows : [el("tr", {}, el("td", { colspan: "4", text: "No settlements yet." }))]));
    }).catch(() => {});

    // Code tabs (WAI-ARIA tabs pattern)
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    function select(tab) {
      tabs.forEach((t) => { const on = t === tab; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; $(t.getAttribute("aria-controls")).hidden = !on; });
      tab.focus();
    }
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t));
      t.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") select(tabs[(i + 1) % tabs.length]); if (e.key === "ArrowLeft") select(tabs[(i - 1 + tabs.length) % tabs.length]); });
    });
  })();
  </script>
</body>
</html>`;

  return c.html(html, 200, { "Cache-Control": "public, max-age=60" });
}
