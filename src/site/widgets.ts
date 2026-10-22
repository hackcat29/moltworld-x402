import { config } from "../config.js";
import { defaultModelRegistry, getModelEndpoint, ModelDefinition } from "../models/registry.js";
import { quoteRequest, referenceRequest } from "../pricing/index.js";
import { defaultProviderRegistry } from "../providers/index.js";
import { esc, scriptJson } from "./layout.js";

export function catalog() {
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

export type CatalogEntry = ReturnType<typeof catalog>[number];

export function catalogScript(models: CatalogEntry[]): string {
  return `<script id="catalog" type="application/json">${scriptJson(models)}</script>`;
}

export function modalityCounts(models: CatalogEntry[]) {
  const counts: Record<string, number> = { chat: 0, image: 0, voice: 0, video: 0 };
  for (const m of models) counts[m.modality]++;
  return counts;
}

const MODALITY_LABEL: Record<string, string> = { chat: "Chat", image: "Image", voice: "Voice", video: "Video" };

export function catalogWidget(models: CatalogEntry[]): string {
  const counts = modalityCounts(models);
  const cards = models
    .map(
      (m) => `
        <li class="model" data-modality="${m.modality}" data-search="${esc(`${m.name} ${m.slug} ${m.upstream} ${m.provider}`.toLowerCase())}">
          <div class="model-top"><h3>${esc(m.name)}</h3><span class="price" title="Price of a small reference request">from ${esc(m.from)}</span></div>
          <div class="chips">
            <span class="chip chip-${m.modality}">${MODALITY_LABEL[m.modality]}</span>
            <span class="chip">${esc(m.provider)}</span>
            <span class="chip mono" title="Upstream model id">${esc(m.upstream)}</span>
          </div>
          <p class="flow">${m.flow === "authorization" ? "Charged after the answer; unused tokens paid back" : "Charged first; refunded if it fails"}</p>
          <code class="endpoint">POST ${esc(m.endpoint)}</code>
          <div class="model-actions">
            <a class="btn btn-small" href="/playground?model=${encodeURIComponent(m.slug)}">Try in Playground</a>
            <button type="button" class="btn btn-small btn-ghost" data-copy="${esc(`${config.publicDomain}${m.endpoint}`)}">Copy URL</button>
          </div>
        </li>`
    )
    .join("");
  return `
      <div class="filters" role="group" aria-label="Filter by modality">
        <button class="tab" type="button" data-filter="all" aria-pressed="true">All (${models.length})</button>
        <button class="tab" type="button" data-filter="chat" aria-pressed="false">Chat (${counts.chat})</button>
        <button class="tab" type="button" data-filter="image" aria-pressed="false">Image (${counts.image})</button>
        <button class="tab" type="button" data-filter="voice" aria-pressed="false">Voice (${counts.voice})</button>
        <button class="tab" type="button" data-filter="video" aria-pressed="false">Video (${counts.video})</button>
        <label class="sr-only" for="search">Search models</label>
        <input id="search" type="search" placeholder="Search models or upstreams">
      </div>
      <ul class="models" id="modelList" data-page="12">${cards}</ul>
      <p class="note hidden" id="noModels">No models match.</p>
      <div class="more"><button class="btn btn-ghost" type="button" id="moreBtn">Show more</button></div>`;
}

export function quoteWidget(): string {
  return `
      <div class="grid-2">
        <form class="card" id="quoteForm" novalidate>
          <label for="qModel" style="margin-top:0">Model</label>
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
              <div><label for="qDuration">Duration</label><select id="qDuration"></select></div>
              <div><label for="qRatio">Aspect ratio</label><select id="qRatio"></select></div>
            </div>
          </div>
          <div class="actions">
            <button class="btn" type="submit" id="quoteBtn">Get price</button>
            <button class="btn btn-ghost" type="button" id="challengeBtn">Show 402 response</button>
          </div>
        </form>
        <div class="card" aria-live="polite" id="quoteOut">
          <p class="note" style="margin:0">Choose a model and fill in the request, then get the price. Nothing on this page charges you or asks your wallet to sign.</p>
        </div>
      </div>
      <div class="code-card" style="margin-top:16px">
        <div role="tablist" aria-label="Request code">
          <button role="tab" type="button" id="t-snip-curl" aria-controls="p-snip-curl" aria-selected="true">curl</button>
          <button role="tab" type="button" id="t-snip-ts" aria-controls="p-snip-ts" aria-selected="false" tabindex="-1">TypeScript</button>
          <button role="tab" type="button" id="t-snip-py" aria-controls="p-snip-py" aria-selected="false" tabindex="-1">Python</button>
        </div>
        <div role="tabpanel" id="p-snip-curl" aria-labelledby="t-snip-curl"><pre><code id="snipCurl"></code></pre></div>
        <div role="tabpanel" id="p-snip-ts" aria-labelledby="t-snip-ts" hidden><pre><code id="snipTs"></code></pre></div>
        <div role="tabpanel" id="p-snip-py" aria-labelledby="t-snip-py" hidden><pre><code id="snipPy"></code></pre></div>
      </div>`;
}

export function receiptWidget(): string {
  return `
      <form class="card" id="receiptForm" novalidate>
        <label for="receiptInput" style="margin-top:0">Request id or receipt JSON</label>
        <textarea id="receiptInput" spellcheck="false" placeholder="req_... or {&quot;v&quot;:1,&quot;kid&quot;:...}"></textarea>
        <div class="actions"><button class="btn" type="submit">Verify</button></div>
        <div class="result" id="receiptOut" aria-live="polite"></div>
      </form>`;
}

export function mandateLookupWidget(): string {
  return `
      <form class="card" id="mandateForm" novalidate>
        <h3>Look up a mandate</h3>
        <label for="mandateQuery">Mandate id or owner address</label>
        <input id="mandateQuery" autocomplete="off" spellcheck="false" placeholder="58-character Algorand address">
        <div class="actions"><button class="btn" type="submit">Look up</button></div>
        <div class="result" id="mandateOut" aria-live="polite"></div>
      </form>`;
}

export function marketWidget(): string {
  return `
      <div class="card">
        <h3>Live listings</h3>
        <div id="marketOut" aria-live="polite"><p class="note">Loading</p></div>
      </div>`;
}

export function earningsWidget(): string {
  return `
      <form class="card" id="earnForm" novalidate>
        <h3>Check your earnings</h3>
        <label for="earnAddr">Creator address</label>
        <input id="earnAddr" autocomplete="off" spellcheck="false" placeholder="58-character Algorand address">
        <div class="actions"><button class="btn btn-ghost" type="submit">Check</button></div>
        <div class="result" id="earnOut" aria-live="polite"></div>
      </form>`;
}

export function statsWidget(): string {
  return `
      <div class="stat-row">
        <div class="card"><div class="v" id="sPaid">-</div><div class="k">Paid requests</div></div>
        <div class="card"><div class="v" id="sWallets">-</div><div class="k">Paying wallets</div></div>
        <div class="card"><div class="v" id="sNet">-</div><div class="k">Net revenue (USDC)</div></div>
        <div class="card"><div class="v" id="sRefunds">-</div><div class="k">Refunded (USDC)</div></div>
      </div>`;
}

/** A tabbed code block. Each tab is [id, label, code]. */
export function codeTabs(name: string, tabs: Array<[string, string, string]>): string {
  const buttons = tabs
    .map(
      ([id, label], i) =>
        `<button role="tab" type="button" id="t-${name}-${id}" aria-controls="p-${name}-${id}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ""}>${esc(label)}</button>`
    )
    .join("");
  const panels = tabs
    .map(([id, , code], i) => `<div role="tabpanel" id="p-${name}-${id}" aria-labelledby="t-${name}-${id}"${i ? " hidden" : ""}><pre><code>${esc(code)}</code></pre></div>`)
    .join("");
  return `<div class="code-card"><div role="tablist" aria-label="Code examples">${buttons}</div>${panels}</div>`;
}
