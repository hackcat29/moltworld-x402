import { Context } from "hono";
import { config } from "../config.js";
import { defaultModelRegistry, getModelEndpoint } from "../models/registry.js";

export function renderLandingPage(c: Context): Response {
  const models = defaultModelRegistry.getEnabledModels();
  const networkName = config.isMainnet ? "Algorand Mainnet" : "Algorand Testnet";
  const usdcAsa = config.usdcAsaId;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Moltworld — Multimodal AI Gateway with x402 on Algorand</title>
  <meta name="description" content="One API for AI models and autonomous agents. Chat, Image, Voice, and Video. Pay per request in USDC on Algorand. Zero subscriptions.">
  <link rel="icon" type="image/png" sizes="128x128" href="/favicon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/logo.png">
  <meta property="og:title" content="Moltworld — Multimodal AI Gateway with x402 on Algorand">
  <meta property="og:description" content="One API for AI models and autonomous agents. Chat, Image, Voice, and Video. Pay per request in USDC on Algorand. Zero subscriptions.">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Moltworld">
  <meta property="og:url" content="${config.publicDomain.replace(/\/+$/, "")}/">
  <meta property="og:image" content="https://moltworld.xyz/logo.png">
  <link rel="alternate" type="text/plain" title="Moltworld agent guide" href="/llms.txt">
  <link rel="alternate" type="application/json" title="Moltworld x402 service descriptor" href="/.well-known/x402">
  <link rel="alternate" type="application/json" title="Moltworld A2A agent card" href="/.well-known/agent-card.json">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="https://moltworld.xyz/logo.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: #12141c;
      --card-border: #232734;
      --card-hover: #191c28;
      --text: #f0f2f5;
      --text-muted: #8e95a5;
      --accent: #00d2aa;
      --accent-glow: rgba(0, 210, 170, 0.15);
      --font: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      --mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      padding: 0 1.5rem 4rem;
    }

    .container { max-width: 960px; margin: 0 auto; }

    header {
      padding: 2.5rem 0 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--card-border);
    }

    .logo-area {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      text-decoration: none;
      cursor: pointer;
    }

    .logo-img {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      object-fit: cover;
      box-shadow: 0 0 18px rgba(0, 210, 170, 0.22);
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .logo-area:hover .logo-img {
      transform: scale(1.08) rotate(2deg);
      box-shadow: 0 0 28px rgba(0, 210, 170, 0.5);
    }

    .logo-text {
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #fff;
    }

    .badge-status {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.75rem;
      font-family: var(--mono);
      color: var(--accent);
      background: var(--accent-glow);
      border: 1px solid rgba(0, 210, 170, 0.3);
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
    }

    .status-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background-color: var(--accent);
      box-shadow: 0 0 8px var(--accent);
    }

    .hero { padding: 3.5rem 0 2rem; }

    .hero h1 {
      font-size: 2.75rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      line-height: 1.15;
      margin-bottom: 1rem;
      color: #ffffff;
    }

    .hero p {
      font-size: 1.15rem;
      color: var(--text-muted);
      max-width: 680px;
      margin-bottom: 1.5rem;
    }

    .network-pill {
      display: inline-block;
      font-family: var(--mono);
      font-size: 0.8rem;
      background: #181b24;
      border: 1px solid var(--card-border);
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      color: #c5cad6;
      margin-bottom: 2rem;
    }

    .network-pill strong { color: #fff; }

    .tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .tab-btn {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 0.4rem 0.85rem;
      border-radius: 6px;
      font-family: var(--mono);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .tab-btn:hover, .tab-btn.active {
      background: #1c2130;
      border-color: var(--accent);
      color: #fff;
    }

    .models-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
      margin-bottom: 3.5rem;
    }

    .model-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1.25rem;
      transition: border-color 0.2s, background-color 0.2s;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .model-card:hover {
      border-color: #3b4255;
      background: var(--card-hover);
    }

    .model-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 0.4rem;
    }

    .model-name { font-weight: 600; font-size: 1rem; color: #fff; }

    .model-price {
      font-family: var(--mono);
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--accent);
    }

    .model-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.6rem;
    }

    .modality-badge {
      font-family: var(--mono);
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      border: 1px solid transparent;
    }

    .badge-chat { color: #60a5fa; background: rgba(96, 165, 250, 0.1); border-color: rgba(96, 165, 250, 0.3); }
    .badge-image { color: #f472b6; background: rgba(244, 114, 182, 0.1); border-color: rgba(244, 114, 182, 0.3); }
    .badge-voice { color: #fbbf24; background: rgba(251, 191, 36, 0.1); border-color: rgba(251, 191, 36, 0.3); }
    .badge-video { color: #a78bfa; background: rgba(167, 139, 250, 0.1); border-color: rgba(167, 139, 250, 0.3); }

    .model-slug { font-family: var(--mono); font-size: 0.75rem; color: var(--text-muted); }

    .model-desc {
      font-size: 0.8rem;
      color: #9ca3af;
      margin-bottom: 0.75rem;
      line-height: 1.4;
    }

    .model-endpoint {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: #6c7385;
      word-break: break-all;
      background: #090b10;
      padding: 0.35rem 0.5rem;
      border-radius: 4px;
    }

    h2 {
      font-size: 1.3rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      margin: 2.5rem 0 1rem;
      color: #ffffff;
    }

    .flow-steps {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1rem;
      margin-bottom: 3.5rem;
    }

    @media (max-width: 720px) { .flow-steps { grid-template-columns: 1fr; } }

    .step-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1.25rem;
    }

    .step-num { font-family: var(--mono); font-size: 0.75rem; color: var(--accent); margin-bottom: 0.4rem; }
    .step-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 0.4rem; color: #fff; }
    .step-desc { font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; }

    .code-block {
      background: #0e1017;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1.25rem;
      font-family: var(--mono);
      font-size: 0.85rem;
      color: #d1d5db;
      overflow-x: auto;
      line-height: 1.5;
      margin-bottom: 3rem;
    }

    .code-block .hl-comment { color: #6b7280; }
    .code-block .hl-keyword { color: #f472b6; }
    .code-block .hl-string { color: #34d399; }
    .code-block .hl-header { color: #60a5fa; }

    .nav-links {
      display: flex;
      gap: 1.5rem;
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid var(--card-border);
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .nav-links a { color: var(--text-muted); text-decoration: none; transition: color 0.2s; }
    .nav-links a:hover { color: var(--accent); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <a href="/" class="logo-area" aria-label="Moltworld Home">
        <img src="/logo.png" alt="Moltworld Logo" class="logo-img" width="42" height="42" />
        <span class="logo-text">Moltworld</span>
      </a>
      <div class="badge-status">
        <span class="status-dot"></span>
        <span>Online &middot; ${networkName}</span>
      </div>
    </header>

    <section class="hero">
      <h1>One API for AI models and agents.</h1>
      <p>Access GPT-6 Astra, GPT-5.4 Pro, Claude Opus 5.5, Sora 2 Pro, Hailuo H3, and 40+ frontier models across Chat, Image, Voice & Video. Pay per request in USDC on Algorand. Zero subscriptions.</p>
      <div class="network-pill">
        Settlement: <strong>Algorand USDC</strong> (ASA: ${usdcAsa}) via GoPlausible Facilitator
      </div>
    </section>

    <h2>Available Models & Verified Endpoints</h2>
    <div class="tabs">
      <button class="tab-btn active" onclick="filterModality('all', this)">All Active (${models.length})</button>
      <button class="tab-btn" onclick="filterModality('chat', this)">Chat (${models.filter(m => m.modality === 'chat').length})</button>
      <button class="tab-btn" onclick="filterModality('image', this)">Image (${models.filter(m => m.modality === 'image').length})</button>
      <button class="tab-btn" onclick="filterModality('voice', this)">Voice (${models.filter(m => m.modality === 'voice').length})</button>
      <button class="tab-btn" onclick="filterModality('video', this)">Video (${models.filter(m => m.modality === 'video').length})</button>
    </div>

    <div class="models-grid" id="modelsGrid">
      ${models
        .map(
          (m) => `
        <div class="model-card" data-modality="${m.modality}">
          <div>
            <div class="model-header">
              <span class="model-name">${m.displayName}</span>
              <span class="model-price">${m.price}</span>
            </div>
            <div class="model-meta">
              <span class="modality-badge badge-${m.modality}">${m.modality}</span>
              <span class="model-slug">${m.slug}</span>
            </div>
            <p class="model-desc">${m.description}</p>
          </div>
          <div class="model-endpoint">POST ${getModelEndpoint(m)}</div>
        </div>
      `
        )
        .join("")}
    </div>

    <h2>How x402 Micropayments Work</h2>
    <div class="flow-steps">
      <div class="step-card">
        <div class="step-num">01 / REQUEST</div>
        <div class="step-title">Send Request</div>
        <div class="step-desc">Client or autonomous agent POSTs prompt parameters to the model endpoint.</div>
      </div>
      <div class="step-card">
        <div class="step-num">02 / 402 PAYMENT</div>
        <div class="step-title">HTTP 402 & Settle</div>
        <div class="step-desc">Moltworld returns 402 requirements. Client signs USDC transfer on Algorand; GoPlausible settles.</div>
      </div>
      <div class="step-card">
        <div class="step-num">03 / INFERENCE</div>
        <div class="step-title">Instant Response</div>
        <div class="step-desc">Request is verified, model executes with guaranteed token capacity, and response is returned.</div>
      </div>
    </div>

    <h2>Quickstart Client (TypeScript)</h2>
    <pre class="code-block"><code><span class="hl-keyword">import</span> { wrapFetchWithPayment, x402Client } <span class="hl-keyword">from</span> <span class="hl-string">"@x402/fetch"</span>;
<span class="hl-keyword">import</span> { ExactAvmScheme, toClientAvmSigner } <span class="hl-keyword">from</span> <span class="hl-string">"@x402/avm"</span>;

<span class="hl-comment">// 1. Initialize Algorand client signer</span>
<span class="hl-keyword">const</span> signer = toClientAvmSigner(process.env.AVM_CLIENT_PRIVATE_KEY!);
<span class="hl-keyword">const</span> client = <span class="hl-keyword">new</span> x402Client().register(<span class="hl-string">"algorand:*"</span>, <span class="hl-keyword">new</span> ExactAvmScheme(signer));
<span class="hl-keyword">const</span> fetchWithPay = wrapFetchWithPayment(globalThis.fetch, client);

<span class="hl-comment">// 2. Chat: Claude Sonnet 4.5 ($0.006 USDC)</span>
<span class="hl-keyword">const</span> chatRes = <span class="hl-keyword">await</span> fetchWithPay(<span class="hl-string">"${config.publicDomain}/v1/models/claude-sonnet/chat/completions"</span>, {
  method: <span class="hl-string">"POST"</span>,
  headers: { <span class="hl-string">"Content-Type"</span>: <span class="hl-string">"application/json"</span> },
  body: JSON.stringify({ messages: [{ role: <span class="hl-string">"user"</span>, content: <span class="hl-string">"Explain Algorand consensus."</span> }] })
});

<span class="hl-comment">// 3. Image: Flux 2 Pro ($0.20 USDC)</span>
<span class="hl-keyword">const</span> imgRes = <span class="hl-keyword">await</span> fetchWithPay(<span class="hl-string">"${config.publicDomain}/v1/models/flux-2-pro/images/generations"</span>, {
  method: <span class="hl-string">"POST"</span>,
  headers: { <span class="hl-string">"Content-Type"</span>: <span class="hl-string">"application/json"</span> },
  body: JSON.stringify({ prompt: <span class="hl-string">"Futuristic Algorand metropolis at dusk, photorealistic 8k"</span> })
});

<span class="hl-comment">// 4. Voice: GPT Audio Mini ($0.02 USDC)</span>
<span class="hl-keyword">const</span> voiceRes = <span class="hl-keyword">await</span> fetchWithPay(<span class="hl-string">"${config.publicDomain}/v1/models/gpt-audio-mini/audio/speech"</span>, {
  method: <span class="hl-string">"POST"</span>,
  headers: { <span class="hl-string">"Content-Type"</span>: <span class="hl-string">"application/json"</span> },
  body: JSON.stringify({ input: <span class="hl-string">"Payment settled on Algorand. Commencing audio stream."</span>, voice: <span class="hl-string">"alloy"</span> })
});

<span class="hl-comment">// 5. Video: Sora 2 Pro ($1.00 USDC)</span>
<span class="hl-keyword">const</span> videoRes = <span class="hl-keyword">await</span> fetchWithPay(<span class="hl-string">"${config.publicDomain}/v1/models/sora-2-pro/videos/generations"</span>, {
  method: <span class="hl-string">"POST"</span>,
  headers: { <span class="hl-string">"Content-Type"</span>: <span class="hl-string">"application/json"</span> },
  body: JSON.stringify({ prompt: <span class="hl-string">"Cinematic drone pan over misty pine mountains at golden hour"</span>, duration: 5 })
});</code></pre>

    <div class="nav-links">
      <a href="/v1/models">GET /v1/models (JSON)</a>
      <a href="/health">GET /health</a>
      <a href="https://facilitator.goplausible.xyz" target="_blank" rel="noopener">GoPlausible Facilitator</a>
      <a href="https://github.com/hackcat29/moltworld-x402" target="_blank" rel="noopener">GitHub: hackcat29/moltworld-x402</a>
    </div>
    <p>The current GitHub repository was created because the original account, UncleTom29, was suspended. The original Moltworld commit history is preserved.</p>
  </div>

  <script>
    function filterModality(modality, btn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cards = document.querySelectorAll('.model-card');
      cards.forEach(card => {
        if (modality === 'all' || card.dataset.modality === modality) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`;

  return c.html(html);
}
